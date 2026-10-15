/**
 * End-to-end test of the interface on tablet and phone (Playwright device emulation): a 10-card hand and a battlefield
 * filled by the dev-mode sandbox. Checks that the hand, the main button and both battlefields fit on the screen,
 * without page scrolling; then the touch gestures (long press = preview; tap = card lifted, second tap = played) and
 * the "rotate your device" screen (3 or 4 players only: a duel plays in portrait on a phone too).
 * Screenshots in test-results/mobile/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { type BrowserContextOptions, chromium, devices, type Page } from "playwright";

const OUT = "test-results/mobile";
mkdirSync(OUT, { recursive: true });

type Side = { cards?: string[]; tokens?: [number, string][]; hand?: string[] };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: Record<string, Side>): void;
      view: {
        viewer: string;
        turn: { active: string };
        pending: { kind: string; player: string } | null;
        hand: { id: string; name: string }[];
        battlefield: { id: string }[];
      } | null;
    };
  };
};

const DECK: [number, string][] = [[60, "Forest"]];
const repeat = (n: number, name: string) => Array<string>(n).fill(name);
const ME: Side = {
  cards: [
    "Llanowar Elves",
    "Serra Angel",
    "Savannah Lions",
    "Elvish Archdruid",
    "Omniscience",
    ...repeat(4, "Forest"),
    ...repeat(3, "Plains"),
  ],
  tokens: [[3, "Goblin"]],
  hand: [
    "Llanowar Elves",
    "Giant Growth",
    "Serra Angel",
    "Shivan Dragon",
    "Opt",
    "Savannah Lions",
    "Pacifism",
    "Helpful Hunter",
    "Forest",
    "Plains",
  ],
};
const OPP: Side = {
  cards: [...repeat(5, "Llanowar Elves"), "Shivan Dragon", "Vivien Reid", ...repeat(6, "Mountain")],
  tokens: [[5, "Treasure"]],
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch();

/** `ais`: number of AI opponents (2: a 3-player game). */
async function open(device: BrowserContextOptions, opp: Side = OPP, ais = 1): Promise<Page> {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?fast");
  await page.evaluate(
    ([deck, sb, n]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, Array(n).fill(deck), sb),
    [DECK, { p1: ME, p2: opp }, ais] as const,
  );
  return page;
}

async function keep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
}

/** Elements off the screen: cards of the hand, main button, cards of the battlefields. */
async function fits(page: Page, label: string): Promise<void> {
  // Code passed as text: tsx would inject __name into named arrow functions.
  const r = (await page.evaluate(`(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out = (el) => {
      const b = el.getBoundingClientRect();
      return b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1;
    };
    // A card of the hand may go past the bottom of the screen (as on MTGA), but its edges and its top (card name) must show.
    const handOut = [...document.querySelectorAll(".hand-card")].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.left < -1 || b.right > vw + 1 || b.top > vh - 30;
    }).length;
    return {
      hand: document.querySelectorAll(".hand-card").length,
      handOut,
      button: [...document.querySelectorAll(".main-button")].filter(out).length,
      perms: [...document.querySelectorAll(".battlefield .perm > .card-slot")].filter(out).length,
      scroll: document.documentElement.scrollHeight > vh + 1 || document.documentElement.scrollWidth > vw + 1,
    };
  })()`)) as { hand: number; handOut: number; button: number; perms: number; scroll: boolean };
  console.log(label, JSON.stringify(r));
  check(r.hand >= 10 && r.handOut === 0, `${label}: whole hand on screen`, r);
  check(r.button === 0, `${label}: main button on screen`, r);
  check(r.perms === 0, `${label}: battlefields on screen`, r);
  check(!r.scroll, `${label}: no page scrolling`, r);
}

const DEVICES: [string, BrowserContextOptions][] = [
  ["ipad-landscape", devices["iPad (gen 7) landscape"]],
  ["ipad-pro-portrait", devices["iPad Pro 11"]],
  ["android-tablet", devices["Galaxy Tab S4 landscape"]],
  ["pixel-landscape", devices["Pixel 7 landscape"]],
  ["iphone-landscape", devices["iPhone 13 landscape"]],
  // A duel plays in portrait on a phone too.
  ["iphone-portrait", devices["iPhone 13"]],
  ["pixel-portrait", devices["Pixel 7"]],
];

for (const [name, device] of DEVICES) {
  const page = await open(device);
  await keep(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await fits(page, name);
  if (name.endsWith("-portrait") && !name.startsWith("ipad"))
    check(!(await page.locator(".rotate-hint").isVisible()), `${name}: a duel plays in portrait (no rotate prompt)`);
  await page.context().close();
}

/** Passes (main button) until having priority during your own turn. */
async function myPriority(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const v = await page.evaluate(() => {
      const view = (window as unknown as DevWindow).__mtgx.getState().view;
      return (
        view && { mine: view.pending?.player === view.viewer, myTurn: view.turn.active === view.viewer, kind: view.pending?.kind }
      );
    });
    if (v?.mine && v.myTurn && v.kind === "priority") {
      await page.waitForTimeout(800);
      return;
    }
    if (v?.mine && v.kind === "priority") await page.locator(".main-button").click();
    await page.waitForTimeout(500);
  }
  throw new Error("no priority during your turn");
}

/** Long press with a finger (real touch events, through CDP). */
async function longPress(page: Page, x: number, y: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const handCount = (page: Page) => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view?.hand.length ?? 0);

// Touch gestures on a landscape iPad (opponent without creatures: no attack to block before your turn).
{
  const page = await open(devices["iPad (gen 7) landscape"], { cards: repeat(4, "Mountain") });
  await keep(page);
  await myPriority(page);
  // Long press on a battlefield card: overlay preview, closed by a tap.
  const perm = page.locator(".battlefield.me .perm > .card-slot").first();
  const pb = await perm.boundingBox();
  if (pb) await longPress(page, pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.waitForTimeout(300);
  check(await page.locator(".touch-preview .preview-img").isVisible(), "long press: overlay preview of the card");
  await page.screenshot({ path: `${OUT}/gesture-long-press.png` });
  await page.locator(".touch-preview").tap({ position: { x: 10, y: 10 } });
  check((await page.locator(".touch-preview").count()) === 0, "a tap closes the preview");

  // First tap on a playable land: it is lifted without being played; second tap: it is played.
  const before = await handCount(page);
  const land = page.locator(".hand-card:has(.glow-playable)").first();
  const lb = await land.boundingBox();
  // Tap on the visible top of the card (the rest goes under the screen or under its neighbors).
  if (lb) await page.touchscreen.tap(lb.x + 12, lb.y + 12);
  await page.waitForTimeout(500);
  check((await page.locator(".hand-card.lifted").count()) === 1, "first tap: card lifted");
  check((await handCount(page)) === before, "first tap: card not played yet");
  await page.screenshot({ path: `${OUT}/gesture-card-lifted.png` });
  const up = await page.locator(".hand-card.lifted").boundingBox();
  if (up) await page.touchscreen.tap(up.x + up.width / 2, up.y + up.height / 3);
  await page.waitForTimeout(800);
  check((await handCount(page)) < before, "second tap: card played", { before, after: await handCount(page) });
  await page.context().close();
}

// Drawer (settings, log) on an iPad in portrait.
{
  const page = await open(devices["iPad Pro 11"]);
  await keep(page);
  const vw = page.viewportSize()?.width ?? 0;
  const hidden = await page.locator(".sidebar").boundingBox();
  check(!!hidden && hidden.x >= vw - 1, "portrait: sidebar folded");
  await page.locator(".drawer-toggle").tap();
  await page.waitForTimeout(400);
  const shown = await page.locator(".sidebar").boundingBox();
  check(!!shown && shown.x + shown.width <= vw + 1 && shown.x < vw - 100, "☰: drawer open", shown);
  await page.screenshot({ path: `${OUT}/drawer.png` });
  await page.locator(".drawer-scrim").tap({ position: { x: 20, y: 300 } });
  await page.waitForTimeout(400);
  const closed = await page.locator(".sidebar").boundingBox();
  check(!!closed && closed.x >= vw - 1, "tap beside: drawer closed");
  await page.context().close();
}

// Deck editor on a phone in portrait: the collection or the deck, one at a time, at full width.
{
  const ctx = await browser.newContext(devices["Pixel 7"]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?fast");
  await page.getByRole("button", { name: "Mes decks" }).tap({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  const vw = page.viewportSize()?.width ?? 0;
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check(wide <= vw + 1, "deck editor (phone): no sideways scrolling", { wide, vw });
  check(
    (await page.locator(".collection").isVisible()) && !(await page.locator(".deck-panel").isVisible()),
    "deck editor (phone): the collection alone",
  );
  await page.getByRole("button", { name: /^Deck \(/ }).tap();
  await page.waitForTimeout(300);
  check(
    (await page.locator(".deck-panel").isVisible()) && !(await page.locator(".collection").isVisible()),
    "deck editor (phone): the deck alone after the switch",
  );
  await page.screenshot({ path: `${OUT}/deck-editor-portrait.png` });
  await ctx.close();
}

// Phone in portrait: a duel has no rotate prompt (checked above); 3 players ask to turn the device to landscape.
{
  const page = await open(devices["iPhone 13"], OPP, 2);
  await page.waitForTimeout(2500);
  check(await page.locator(".rotate-hint").isVisible(), "phone in portrait, 3 players: rotate-your-device hint");
  await page.screenshot({ path: `${OUT}/iphone-portrait-multi.png` });
  await page.context().close();
}

await browser.close();
if (errors.length) console.log(`Page errors:\n${errors.join("\n")}`);
else console.log("ok: no page error");
process.exit(failures.length || errors.length ? 1 : 0);
