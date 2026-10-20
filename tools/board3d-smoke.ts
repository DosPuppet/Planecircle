/**
 * End-to-end test of the 3D board (PLAN-W): Chromium with SwiftShader (software WebGL, accepted by `?board3d=force` in
 * dev mode), a full board put into play by the dev-mode sandbox, then:
 * - every DOM proxy lies on its card as the camera projects it (within 1.5 px), and a click at its center reaches it;
 * - a land played from the hand appears on the 3D table, an attacker is chosen by clicking its card;
 * - without the flag, the DOM board, and three.js is not even loaded;
 * - a lost WebGL context brings back the DOM board.
 * Screenshots in test-results/board3d/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright";

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
  __board3d?: { projectedRect(id: string): { left: number; top: number; right: number; bottom: number } | null };
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

/** A game in the sandbox; `flag`: the 3D board forced. Requests for three.js are counted. */
async function open(viewport: { width: number; height: number }, flag: boolean, sandbox: Record<string, Side>, ais = 1) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const three: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/deps\/three|\/three-|board3d/.test(r.url())) three.push(r.url());
  });
  await page.goto(`http://localhost:5173/?fast${flag ? "&board3d=force" : ""}`, { timeout: 120_000 });
  await page.evaluate(
    ([deck, sb, n]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, Array(n).fill(deck), sb),
    [DECK, sandbox, ais] as const,
  );
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 30_000 });
  await page.waitForTimeout(2500);
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

// 1. The 3D board, 1600×900: proxies, then a land and an attack through them.
let g = await open({ width: 1600, height: 900 }, true, { p1: ME, p2: OPP });
let page = g.page;
check(await page.locator(".board3d canvas").isVisible(), "the 3D board is drawn (?board3d=force)");
check(g.three.length > 0, "three.js loaded with the 3D board", g.three.length);
await page.screenshot({ path: `${OUT}/1-board-1600.png` });
await aligned(page, "1600×900");

check(await until(page, (p) => p.startsWith("priority|true|true|main1")), "your first main phase reached", await pending(page));
const lands = () => page.locator(".bf3d.me .card-slot[data-oid]").count();
const before = await lands();
await page.locator(".hand [data-oid]").first().click();
await page.waitForTimeout(1500);
check((await lands()) === before + 1, "a land played from the hand lies on the 3D table", { before, after: await lands() });

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
await aligned(page, "attack");

// 2. A lost WebGL context: back to the DOM board.
await page.evaluate(() => {
  const canvas = document.querySelector(".board3d canvas") as HTMLCanvasElement;
  canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
});
await page.waitForTimeout(1500);
check(
  (await page.locator(".board3d").count()) === 0 && (await page.locator(".board .battlefield.me").count()) === 1,
  "a lost WebGL context brings back the DOM board",
);
await g.close();

// 3. Another screen shape.
g = await open({ width: 1280, height: 720 }, true, { p1: ME, p2: OPP });
page = g.page;
await page.screenshot({ path: `${OUT}/3-board-1280.png` });
await aligned(page, "1280×720");
await g.close();

// 4. Without the flag: the DOM board, and no three.js.
g = await open({ width: 1600, height: 900 }, false, { p1: ME, p2: OPP });
check(
  (await g.page.locator(".board3d").count()) === 0 && (await g.page.locator(".board .battlefield.me").count()) === 1,
  "without the flag, the DOM board",
);
check(g.three.length === 0, "without the 3D board, three.js is not loaded", g.three.slice(0, 3));
await g.close();

await browser.close();
// Custom art (/art/) is optional: its manifest may be missing.
const real = errors.filter((e) => !/art\/manifest/.test(e));
check(real.length === 0, "no page error", real.slice(0, 5));
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
