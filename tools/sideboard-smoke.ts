/**
 * One-off interface test of the sideboard outside the game (rules 209): North Wind Avatar, cast against the AI with a
 * sideboard, offers its cards; the chosen one goes into the hand, the other stays out. Screenshots in
 * test-results/sideboard/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/sideboard";
mkdirSync(OUT, { recursive: true });

type Obj = { id: string; name: string };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(
        deck: [number, string][],
        ais: [number, string][][],
        sandbox: unknown,
        level?: unknown,
        match?: unknown,
        commander?: unknown,
        sides?: { player?: [number, string][]; ai?: [number, string][][] },
      ): void;
      clickHandCard(id: string): void;
      passPriority(): void;
      casting: { stage: string } | null;
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string; request?: { intent: string }; objects?: Obj[] } | null;
        hand: Obj[];
        battlefield: Obj[];
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173/?fast");
await page.evaluate(
  ([deck, sb, side]) =>
    (window as unknown as DevWindow).__mtgx
      .getState()
      .startGame(deck, [deck], sb, undefined, undefined, undefined, { player: side }),
  [
    [[60, "Island"]] as [number, string][],
    { p1: { cards: ["Island", "Island", "Island", "Island", "Mountain"], hand: ["North Wind Avatar"] } },
    [
      [1, "Shock"],
      [1, "Negate"],
    ] as [number, string][],
  ] as const,
);
await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 }); // i18n-ignore: the French interface is tested
const view = () => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view);
// My first main phase, empty stack.
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
const avatar = (await view())?.hand.find((o) => o.name === "North Wind Avatar")?.id ?? "";
check(!!avatar, "North Wind Avatar in hand");
await page.evaluate((id) => (window as unknown as DevWindow).__mtgx.getState().clickHandCard(id), avatar);
// The spell, then its trigger: pass until the choice of the sideboard card.
await page.waitForFunction(
  () => {
    const st = (window as unknown as DevWindow).__mtgx.getState();
    const p = st.view?.pending;
    if (p?.kind === "choice" && p.player === st.view?.viewer) return true;
    if (p?.kind === "priority" && p.player === st.view?.viewer && (st.view?.stack.length ?? 0) > 0) st.passPriority();
    return false;
  },
  undefined,
  { timeout: 30_000, polling: 300 },
);
const pending = (await view())?.pending;
check(pending?.request?.intent === "pickCards", "a card choice", pending?.request);
check(
  JSON.stringify((pending?.objects ?? []).map((o) => o.name).sort()) === JSON.stringify(["Negate", "Shock"]),
  "the sideboard's cards are offered",
  pending?.objects?.map((o) => o.name),
);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/1-choice.png` });
// Shock, the first card of the sideboard, is the suggestion, already selected: confirm.
check((await page.getByText(/sélection : 1/).count()) === 1, "the suggestion is selected"); // i18n-ignore: the French interface is tested
await page.getByRole("button", { name: "Valider" }).click(); // i18n-ignore: the French interface is tested
await page.waitForFunction(
  () => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return !!v && v.pending?.kind !== "choice";
  },
  undefined,
  { timeout: 15_000 },
);
await page.waitForTimeout(800);
const after = await view();
check(
  (after?.hand ?? []).some((o) => o.name === "Shock"),
  "Shock in hand",
  after?.hand.map((o) => o.name),
);
check(!(after?.hand ?? []).some((o) => o.name === "Negate"), "Negate stays out");
await page.screenshot({ path: `${OUT}/2-done.png` });

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.error(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("sideboard-smoke: ok");
