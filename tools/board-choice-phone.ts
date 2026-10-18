/**
 * One-off interface test of the choice made on the board (`.board-choice`) on a phone in portrait: the panel must not
 * cover any option (permanents to choose, the avatars) nor the main button, and each option must take a tap. Marang
 * River Regent's enter trigger ("up to two other target nonland permanents"), against two opposing permanents.
 * Screenshots in test-results/board-choice/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";

const OUT = "test-results/board-choice";
mkdirSync(OUT, { recursive: true });

type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      clickHandCard(id: string): void;
      passPriority(): void;
      selection: string[];
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string; request?: { type: string; options: string[] } } | null;
        hand: { id: string; name: string }[];
        stack: { id: string }[];
      } | null;
    };
  };
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const browser = await chromium.launch();
for (const [label, device] of [
  ["iphone", devices["iPhone 13"]],
  ["pixel", devices["Pixel 7"]],
  ["iphone-landscape", devices["iPhone 13 landscape"]],
  ["desktop", { viewport: { width: 1600, height: 900 } }],
] as const) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?fast");
  await page.waitForFunction(() => !!(window as unknown as DevWindow).__mtgx, undefined, { timeout: 30_000 });
  await page.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
    [[60, "Island"]] as [number, string][],
    {
      p1: {
        cards: ["Island", "Island", "Island", "Island", "Island", "Island", "Bear Cub"],
        hand: ["Marang River Regent // Coil and Catch"],
      },
      p2: { cards: ["Serra Angel", "Llanowar Elves", "Forest"] },
    },
  ] as const);
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 }); // i18n-ignore: the French interface is tested
  await page.waitForFunction(
    () => {
      const st = (window as unknown as DevWindow).__mtgx.getState();
      const v = st.view;
      const mine = !!v && v.stack.length === 0 && v.pending?.kind === "priority" && v.pending.player === v.viewer;
      if (!mine) return false;
      if (v.turn.active === v.viewer && v.turn.step === "main1") return true;
      st.passPriority();
      return false;
    },
    undefined,
    { timeout: 60_000, polling: 500 },
  );
  const regent = await page.evaluate(
    () => (window as unknown as DevWindow).__mtgx.getState().view?.hand.find((o) => o.name.startsWith("Marang River Regent"))?.id,
  );
  await page.evaluate((id) => (window as unknown as DevWindow).__mtgx.getState().clickHandCard(id ?? ""), regent);
  // The creature face, not the omen (Coil and Catch).
  await page.getByRole("button", { name: "Lancer Régent du fleuve Marang" }).click({ timeout: 5000 }); // i18n-ignore: the French interface is tested
  // The spell resolves, then its trigger asks for its targets on the board.
  await page
    .waitForFunction(
      () => {
        const st = (window as unknown as DevWindow).__mtgx.getState();
        const p = st.view?.pending;
        if (p?.kind === "choice" && p.player === st.view?.viewer) return true;
        if (p?.kind === "priority" && p.player === st.view?.viewer && (st.view?.stack.length ?? 0) > 0) st.passPriority();
        return false;
      },
      undefined,
      { timeout: 30_000, polling: 300 },
    )
    .catch(async (e) => {
      // Stuck before the choice: what the screen shows.
      await page.screenshot({ path: `${OUT}/${label}-stuck.png` });
      throw e;
    });
  await page.waitForSelector(".board-choice", { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${label}-choice.png` });
  const panel = (await page.locator(".board-choice").boundingBox()) as Box;
  const options = await page.evaluate(
    () => (window as unknown as DevWindow).__mtgx.getState().view?.pending?.request?.options ?? [],
  );
  const covered: string[] = [];
  for (const id of options) {
    const box = await page.locator(`[data-oid="${id}"]`).first().boundingBox();
    if (box && overlap(panel, box)) covered.push(id);
  }
  check(covered.length === 0, `${label}: the panel covers no option`, { panel, covered });
  for (const sel of [".main-button", ".bottom-row .avatar", ".top-row .avatar"]) {
    const box = await page.locator(sel).first().boundingBox();
    check(!!box && !overlap(panel, box), `${label}: the panel leaves ${sel} free`, { panel, box });
  }
  // A tap (a click at the centre of the card) selects the option.
  const first = options[0] ?? "";
  await page.locator(`[data-oid="${first}"]`).first().click();
  const selection = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().selection);
  check(selection.includes(first), `${label}: a tap on an option selects it`, selection);
  await page.screenshot({ path: `${OUT}/${label}-selected.png` });
  await ctx.close();
}
check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.error(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("board-choice-phone: ok");
