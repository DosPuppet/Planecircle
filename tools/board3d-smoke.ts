/**
 * End-to-end test of the 3D board (PLAN-W): Chromium with SwiftShader (software WebGL, accepted by `?board3d=force` in
 * dev mode), a full board put into play by the dev-mode sandbox, then:
 * - every DOM proxy lies on its card as the camera projects it (within 1.5 px), and a click at its center reaches it;
 * - the hand's meshes follow the DOM hand, the piles show their counts, an idle board draws nothing;
 * - a land played from the hand appears on the 3D table, an attacker is chosen by clicking its card;
 * - the Graphics setting offers 3D, refused (with its reason) on a software renderer without the flag;
 * - without the flag, the DOM board, and three.js is not even loaded;
 * - a lost WebGL context brings back the DOM board;
 * - four players: the three opponents side by side, proxies still on their cards; a phone in portrait keeps the DOM
 *   board, turned to landscape it draws the 3D board;
 * - the arena (data/arena/<id>/, `npm run arena-assets`) dresses the table when it was built; without it (an empty
 *   manifest), the plain table, without errors;
 * - the dioramas (PLAN-X's shrine, PLAN-Y's neon city), chosen in the settings: drawn, animated between moves at their
 *   quality's rate, still in Low.
 * Screenshots in test-results/board3d/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { existsSync, mkdirSync } from "node:fs";
import { type Browser, chromium, devices, type Page } from "playwright";

const OUT = "test-results/board3d";
mkdirSync(OUT, { recursive: true });

type Side = { cards?: string[]; tokens?: [number, string][]; attach?: [string, string, string?][] };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: Record<string, Side>): void;
      view: { viewer: string; pending: { kind: string; player: string } | null; turn: { active: string; step: string } } | null;
    };
  };
  __board3d?: {
    projectedRect(id: string): { left: number; top: number; right: number; bottom: number } | null;
    drawing(): boolean;
    handShown(): number;
    arenaShown(): boolean;
    diorama(): string | null;
    ambient(): number;
    quality(): string;
    particles(): number;
    renders(): number;
  };
};

const DECK: [number, string][] = [[60, "Forest"]];
const repeat = (n: number, name: string) => Array<string>(n).fill(name);
const ME: Side = {
  cards: [
    "Llanowar Elves",
    "Serra Angel",
    "Shivan Dragon",
    "Savannah Lions",
    "Omniscience",
    "Fishing Pole",
    "Ajani, Caller of the Pride",
    ...repeat(5, "Forest"),
    ...repeat(3, "Plains"),
  ],
  tokens: [
    [6, "Goblin"],
    [3, "Treasure"],
  ],
  attach: [["Swiftfoot Boots", "Serra Angel"]],
};
const OPP: Side = {
  cards: [...repeat(4, "Llanowar Elves"), "Brazen Scourge", "Vivien Reid", ...repeat(4, "Forest")],
  tokens: [[2, "Soldier"]],
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

const browser: Browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

/**
 * A game in the sandbox; `flag`: the 3D board forced; `noArena`: as if the arena had not been built. Requests for
 * three.js are counted.
 */
async function open(
  viewport: { width: number; height: number },
  flag: boolean,
  sandbox: Record<string, Side>,
  ais = 1,
  noArena = false,
  quality = "low",
  /** Run on the page before the game starts (to watch it). */
  before?: (page: Page) => Promise<unknown>,
) {
  const ctx = await browser.newContext({ viewport });
  if (noArena) await ctx.route("**/arena/*/manifest.json", (r) => r.fulfill({ json: { version: 0 } }));
  const page = await ctx.newPage();
  const three: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/deps\/three|\/three-|board3d/.test(r.url())) three.push(r.url());
  });
  // Low quality by default: SwiftShader draws shadows and bloom far too slowly for the interactions.
  await page.goto(`http://localhost:5173/?fast${flag ? `&board3d=force&quality=${quality}` : ""}`, { timeout: 120_000 });
  await before?.(page);
  await page.evaluate(
    ([deck, sb, n]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, Array(n).fill(deck), sb),
    [DECK, sandbox, ais] as const,
  );
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 120_000 });
  // The 3D board's loading screen covers the board until the table is ready.
  if (flag) await page.locator(".board3d-loading").waitFor({ state: "detached", timeout: 120_000 });
  await page.waitForTimeout(1500);
  return { page, three, close: () => ctx.close() };
}

/** Each proxy against its card's projection; a click at its center lands on it unless a card in front covers it. */
async function aligned(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const w = window as unknown as DevWindow;
    const slots = [...document.querySelectorAll<HTMLElement>(".bf3d .card-slot[data-oid]")];
    const off: string[] = [];
    const missed: string[] = [];
    const boxes = slots.map((el) => {
      const p3 = el.closest(".p3") as HTMLElement;
      return { el, p3, z: Number(p3.style.zIndex), rect: el.getBoundingClientRect(), id: el.dataset.oid as string };
    });
    for (const b of boxes) {
      const want = w.__board3d?.projectedRect(b.id);
      if (!want) {
        off.push(`${b.id}: no projection`);
        continue;
      }
      const d = Math.max(
        Math.abs(b.rect.left - want.left),
        Math.abs(b.rect.top - want.top),
        Math.abs(b.rect.right - want.right),
        Math.abs(b.rect.bottom - want.bottom),
      );
      if (d > 1.5) off.push(`${b.id}: ${d.toFixed(1)} px`);
      const cx = (want.left + want.right) / 2;
      const cy = (want.top + want.bottom) / 2;
      // Covered by a card in front of it in the same zone (a pile, an Aura's host): not expected to be hit.
      const covered = boxes.some(
        (o) =>
          o !== b &&
          o.p3.parentElement === b.p3.parentElement &&
          o.z > b.z &&
          o.rect.left <= cx &&
          cx <= o.rect.right &&
          o.rect.top <= cy &&
          cy <= o.rect.bottom,
      );
      const hit = document.elementFromPoint(cx, cy);
      if (!covered && !b.p3.contains(hit)) missed.push(`${b.id}: ${hit?.className}`);
    }
    return { n: boxes.length, off, missed };
  });
  check(r.n > 15 && r.off.length === 0, `${label}: every proxy on its projected card within 1.5 px (${r.n})`, r.off.slice(0, 5));
  check(r.missed.length === 0, `${label}: a click at the center of a card reaches its proxy`, r.missed.slice(0, 5));
}

const pending = (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return v?.pending ? `${v.pending.kind}|${v.pending.player === v.viewer}|${v.turn.active === v.viewer}|${v.turn.step}` : "";
  });

/** Moves the game forward (main button) until `want` holds. */
async function until(page: Page, want: (p: string) => boolean, tries = 80) {
  for (let i = 0; i < tries && !want(await pending(page)); i++) {
    const main = page.locator(".main-button");
    if (!(await main.isDisabled().catch(() => true))) await main.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  return want(await pending(page));
}

// 1. The 3D board, 1600×900: proxies, then a land and an attack through them (without the arena: SwiftShader draws it
// at a frame or two a second; it has its own check below).
// The loading screen (engine, arena, cards) is watched from the start of the game: its bar, then its leaving.
let loadingSeen = { seen: false, most: 0 };
let g = await open({ width: 1600, height: 900 }, true, { p1: ME, p2: OPP }, 1, true, "low", (p) =>
  // A string: tsx would wrap a named function with a helper the page does not have.
  p.evaluate(`(() => {
    window.__loading = { seen: false, most: 0 };
    const watch = () => {
      const el = document.querySelector(".board3d-loading");
      if (!el) return;
      window.__loading.seen = true;
      window.__loading.most = Math.max(window.__loading.most, Number(el.getAttribute("aria-valuenow")));
    };
    new MutationObserver(watch).observe(document.body, { subtree: true, childList: true, attributes: true });
  })()`),
);
let page = g.page;
loadingSeen = await page.evaluate(() => (window as unknown as { __loading: { seen: boolean; most: number } }).__loading);
check(
  loadingSeen.seen && loadingSeen.most >= 80 && (await page.locator(".board3d-loading").count()) === 0,
  "a loading screen with its progress covers the board until the table is ready",
  loadingSeen,
);
check(await page.locator(".board3d canvas").isVisible(), "the 3D board is drawn (?board3d=force)");
check(g.three.length > 0, "three.js loaded with the 3D board", g.three.length);
await page.screenshot({ path: `${OUT}/1-board-1600.png` });
await aligned(page, "1600×900");
const idle = () =>
  page.evaluate(async () => {
    // An idle board: no frame coming, once the cards, the hand and the effects have settled (slowly in software).
    for (let i = 0; i < 100; i++) {
      if (!(window as unknown as DevWindow).__board3d?.drawing()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  });
check(await idle(), "an idle 3D board draws nothing (no endless animation)");
const handCards = await page.locator(".hand [data-oid]").count();
const shown = await page.evaluate(() => (window as unknown as DevWindow).__board3d?.handShown() ?? 0);
check(handCards > 0 && shown === handCards, "every card of the hand has its mesh", { handCards, shown });
const libraries = await page.evaluate(() => {
  const v = (
    window as unknown as {
      __mtgx: { getState(): { view: { viewer: string; players: Record<string, { libraryCount: number }> } } };
    }
  ).__mtgx.getState().view;
  return {
    shown: document.querySelector(".piles3d.me .pile3d.library .pile3d-count")?.textContent,
    count: String(v.players[v.viewer]?.libraryCount),
    piles: document.querySelectorAll(".piles3d .pile3d.library").length,
  };
});
check(
  libraries.shown === libraries.count && libraries.piles === 2,
  "each seat's library lies on the table with its count",
  libraries,
);

check(await until(page, (p) => p.startsWith("priority|true|true|main1")), "your first main phase reached", await pending(page));
const lands = () => page.locator(".bf3d.me .card-slot[data-oid]").count();
const before = await lands();
await page.locator(".hand [data-oid]").first().click();
// The land lands in a puff of dust (W7): particles while it settles.
const dust = await page.evaluate(async () => {
  let most = 0;
  for (let i = 0; i < 30; i++) {
    most = Math.max(most, (window as unknown as DevWindow).__board3d?.particles() ?? 0);
    await new Promise((r) => setTimeout(r, 50));
  }
  return most;
});
check(dust > 0, "a land played raises dust (particles)", dust);
await page.waitForTimeout(1500);
check((await lands()) === before + 1, "a land played from the hand lies on the 3D table", { before, after: await lands() });
check(await idle(), "the land settles: the board stops drawing");
await page.locator(".drawer-toggle").click();
await page.waitForTimeout(500);
const button3d = page.locator(".pace-control button", { hasText: /^3D$/ });
check(!(await button3d.isDisabled()), "with the flag, Graphics offers 3D");
await page.locator(".drawer-close").click();
await page.waitForTimeout(300);

check(await until(page, (p) => p.startsWith("declareAttackers|true")), "declare attackers reached", await pending(page));
await page.locator(".bf3d.me .card.glow-selectable").first().click();
await page.waitForTimeout(400);
await page.locator(".player-bar.opp .avatar").first().click();
await page.waitForTimeout(600);
check(
  (await page.locator(".bf3d.me .card.glow-attacking").count()) === 1 &&
    /Attaquer \(1\)/.test(await page.locator(".main-button").innerText()),
  "an attacker chosen by clicking its card on the 3D table",
);
await page.screenshot({ path: `${OUT}/2-attack.png` });
// The attack goes on: blockers, damage (sparks, jolts), deaths (embers).
await page.locator(".main-button").click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/2b-combat.png` });
await aligned(page, "attack");

// 2. A lost WebGL context: back to the DOM board.
await page.evaluate(() => {
  const canvas = document.querySelector(".board3d canvas") as HTMLCanvasElement;
  canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
});
await page.waitForTimeout(800);
check(
  (await page.locator(".board3d").count()) === 0 && (await page.locator(".board .battlefield.me").count()) === 1,
  "a lost WebGL context brings back the DOM board",
);
check(
  /plateau 3D/.test(
    (await page
      .locator(".toast")
      .textContent()
      .catch(() => "")) ?? "",
  ),
  "and says so",
);
await g.close();

// 3. Another screen shape; the arena, when it was built.
const built = existsSync("data/arena/tavern/manifest.json");
g = await open({ width: 1280, height: 720 }, true, { p1: ME, p2: OPP });
page = g.page;
if (built) {
  const shown = await page
    .waitForFunction(() => (window as unknown as DevWindow).__board3d?.arenaShown(), null, { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  check(shown, "the arena (props, wood, light) dresses the table");
} else console.log("(arena not built: npm run arena-assets)");
await page.screenshot({ path: `${OUT}/3-board-1280.png` });
await aligned(page, "1280×720");
await g.close();

// 3b. Without the arena: the plain table, without errors.
g = await open({ width: 1280, height: 720 }, true, { p1: ME, p2: OPP }, 1, true);
await g.page.waitForTimeout(1500);
check(
  (await g.page.locator(".board3d canvas").isVisible()) &&
    !(await g.page.evaluate(() => (window as unknown as DevWindow).__board3d?.arenaShown())),
  "without the arena, the plain table",
);
await g.page.screenshot({ path: `${OUT}/4-plain-table.png` });
await g.close();

// 3c. High quality (W6): shadows, glow rims and bloom drawn, the board idle again once settled.
g = await open({ width: 1600, height: 900 }, true, { p1: ME, p2: OPP }, 1, false, "high");
const high = await g.page.evaluate(async () => {
  const w = window as unknown as DevWindow;
  for (let i = 0; i < 300 && w.__board3d?.drawing(); i++) await new Promise((r) => setTimeout(r, 100));
  return { quality: w.__board3d?.quality(), idle: !w.__board3d?.drawing() };
});
check(high.quality === "high" && high.idle, "high quality (shadows, rims, bloom) draws, then rests", high);
// SwiftShader may still be drawing the last high-quality frame (shadow maps of the flames, bloom): a long wait.
await g.page.screenshot({ path: `${OUT}/5-high-quality.png`, timeout: 120_000 });
await g.close();

// 3d. The fireplace (with the arena, at the normal pace): between two moves its fire wavers, a few frames a second,
// never the full rate.
if (built) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fp = await ctx.newPage();
  await fp.goto("http://localhost:5173/?board3d=force&quality=medium", { timeout: 120_000 });
  await fp.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
    DECK,
    { p1: ME, p2: OPP },
  ] as const);
  await fp.getByRole("button", { name: "Garder" }).click({ timeout: 30_000 });
  await fp.waitForFunction("window.__board3d && window.__board3d.arenaShown()", null, { timeout: 60_000 }).catch(() => {});
  const fire = await fp.evaluate(async () => {
    const w = window as unknown as DevWindow;
    await new Promise((r) => setTimeout(r, 1500));
    const before = w.__board3d?.renders() ?? 0;
    await new Promise((r) => setTimeout(r, 2000));
    return (w.__board3d?.renders() ?? 0) - before;
  });
  check(fire > 0 && fire <= 45, "the fireplace's fire wavers at 20 frames a second at most", fire);
  await ctx.close();
}

// 3d'. The shrine (PLAN-X), chosen before the game: its diorama, animated between moves (30 frames a second in Medium,
// fewer in SwiftShader), still in Low.
for (const diorama of ["shrine", "neon"].filter((id) => existsSync(`data/arena/${id}/manifest.json`)))
  for (const quality of ["medium", "low"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript((id) => localStorage.setItem("planecircle.arena3d", id), diorama);
    const sp = await ctx.newPage();
    sp.on("pageerror", (e) => errors.push(e.message));
    await sp.goto(`http://localhost:5173/?board3d=force&quality=${quality}`, { timeout: 120_000 });
    await sp.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
      DECK,
      { p1: ME, p2: OPP },
    ] as const);
    await sp.getByRole("button", { name: "Garder" }).click({ timeout: 30_000 });
    await sp.locator(".board3d-loading").waitFor({ state: "detached", timeout: 120_000 });
    // Medium: it keeps drawing between moves at 30 frames a second (SwiftShader manages about one in two seconds: a
    // new frame within four is enough); Low: once the board has settled (card images arriving), nothing.
    const shrine = await sp.evaluate(async () => {
      const w = window as unknown as DevWindow;
      await new Promise((r) => setTimeout(r, 3000));
      for (let i = 0; i < 100 && w.__board3d?.drawing() && !location.search.includes("medium"); i++)
        await new Promise((r) => setTimeout(r, 100));
      const before = w.__board3d?.renders() ?? 0;
      await new Promise((r) => setTimeout(r, 4000));
      return { diorama: w.__board3d?.diorama(), rate: w.__board3d?.ambient(), frames: (w.__board3d?.renders() ?? 0) - before };
    });
    await sp.screenshot({ path: `${OUT}/5b-${diorama}-${quality}.png`, timeout: 120_000 });
    if (quality === "low")
      check(shrine.diorama === diorama && shrine.rate === 0 && shrine.frames === 0, `the ${diorama} in Low: still`, shrine);
    else
      check(
        shrine.diorama === diorama && shrine.rate === 30 && shrine.frames >= 1,
        `the ${diorama} in Medium: animated between moves (30 frames a second)`,
        shrine,
      );
    await ctx.close();
  }

// 3e. Four players (W8): the three opponents side by side on the far half, every proxy on its card.
g = await open({ width: 1600, height: 900 }, true, { p1: ME, p2: OPP, p3: OPP, p4: OPP }, 3, true);
check((await g.page.locator(".bf3d.opp").count()) === 3, "four players: three opposing battlefields on the table");
await aligned(g.page, "4 players");
await g.page.screenshot({ path: `${OUT}/6-four-players.png` });
await g.close();

// 3f. A phone (W8): in portrait the DOM board and its portrait layout, in landscape the 3D board.
for (const [name, device, want3d] of [
  ["iphone-portrait", devices["iPhone 13"], false],
  ["iphone-landscape", devices["iPhone 13 landscape"], true],
] as const) {
  const ctx = await browser.newContext(device);
  const phone = await ctx.newPage();
  await phone.route("**/arena/*/manifest.json", (r) => r.fulfill({ json: { version: 0 } }));
  await phone.goto("http://localhost:5173/?fast&board3d=force&quality=low", { timeout: 120_000 });
  await phone.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
    DECK,
    { p1: ME, p2: OPP },
  ] as const);
  await phone.getByRole("button", { name: "Garder" }).click({ timeout: 30_000 });
  await phone.waitForTimeout(2000);
  const drawn = (await phone.locator(".board3d").count()) > 0;
  check(drawn === want3d, `${name}: ${want3d ? "the 3D board" : "the DOM board (portrait layout)"}`, { drawn });
  await phone.screenshot({ path: `${OUT}/7-${name}.png` });
  await ctx.close();
}

// 4. Without the flag: the DOM board, and no three.js.
g = await open({ width: 1600, height: 900 }, false, { p1: ME, p2: OPP });
check(
  (await g.page.locator(".board3d").count()) === 0 && (await g.page.locator(".board .battlefield.me").count()) === 1,
  "without the flag, the DOM board",
);
check(g.three.length === 0, "without the 3D board, three.js is not loaded", g.three.slice(0, 3));
await g.page.locator(".drawer-toggle").click();
await g.page.waitForTimeout(500);
const button = g.page.locator(".pace-control button", { hasText: /^3D$/ });
check(
  !(await button.isDisabled()) && /lent/.test((await button.getAttribute("title")) ?? ""),
  "on a software renderer, 3D can still be tried, with a warning",
  await button.getAttribute("title"),
);
// Tried: the 3D board draws (at low quality), and its quality can be chosen by hand.
await button.click();
await g.page.locator(".drawer-close").click();
await g.page.locator(".board3d canvas").waitFor({ timeout: 120_000 });
await g.page.locator(".board3d-loading").waitFor({ state: "detached", timeout: 120_000 });
const quality = () => g.page.evaluate(() => (window as unknown as DevWindow).__board3d?.quality());
check((await quality()) === "low", "tried on a software renderer, it starts at low quality", await quality());
await g.page.locator(".drawer-toggle").click();
await g.page.locator(".pace-control button", { hasText: /^Haute$/ }).click();
await g.page.waitForTimeout(500);
const chosen = await quality();
await g.page.locator(".pace-control button", { hasText: /^Basse$/ }).click();
await g.page.waitForTimeout(500);
check(chosen === "high" && (await quality()) === "low", "the 3D quality chosen by hand applies at once", {
  chosen,
  after: await quality(),
});
await g.close();

await browser.close();
// Custom art (/art/) is optional: its manifest may be missing.
const real = errors.filter((e) => !/art\/manifest/.test(e));
check(real.length === 0, "no page error", real.slice(0, 5));
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
