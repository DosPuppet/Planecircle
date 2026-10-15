/**
 * One-off interface test of "always answer this way" (PLAN-L L8): the "may" of Solemn Simulacrum's trigger answered
 * "No" with the box checked; the second Solemn Simulacrum is then answered without a window; the sidebar button forgets
 * the answer. Screenshots in test-results/always-answer/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/always-answer";
mkdirSync(OUT, { recursive: true });

type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      passPriority(): void;
      settings: { autoAnswers?: Record<string, number> };
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string; request?: { intent: string } } | null;
        hand: { id: string; name: string }[];
        battlefield: { id: string; name: string; controller: string }[];
        stack: unknown[];
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
// A previous run's kept answers: forgotten.
await page.evaluate(() => localStorage.removeItem("planecircle.autopilot"));
await page.reload();
await page.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
  [[60, "Forest"]] as [number, string][],
  { p1: { cards: Array<string>(8).fill("Swamp"), hand: ["Solemn Simulacrum", "Solemn Simulacrum"] } },
] as const);
await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 }); // i18n-ignore: the French interface
/** My priority in my first main phase with an empty stack (the other priorities are passed). */
const myMain = () =>
  page.waitForFunction(
    () => {
      const st = (window as unknown as DevWindow).__mtgx.getState();
      const v = st.view;
      if (!v || v.pending?.player !== v.viewer || v.pending.kind !== "priority") return false;
      if (v.stack.length === 0 && v.turn.active === v.viewer && v.turn.step === "main1") return true;
      st.passPriority();
      return false;
    },
    undefined,
    { timeout: 60_000, polling: 500 },
  );
const solemns = () =>
  page.evaluate(() => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return v?.hand.filter((c) => c.name === "Solemn Simulacrum").map((c) => c.id) ?? [];
  });
await myMain();
await page
  .locator(`.hand [data-oid="${(await solemns())[0]}"]`)
  .first()
  .click();
const box = page.getByLabel("Toujours répondre ainsi pour cette capacité"); // i18n-ignore: the French interface
check(
  await box.waitFor({ timeout: 15_000 }).then(
    () => true,
    () => false,
  ),
  "the box is offered on the trigger's question",
);
await box.check();
await page.screenshot({ path: `${OUT}/1-question.png` });
await page.getByRole("button", { name: "Non", exact: true }).click(); // i18n-ignore: the French interface
await myMain();
const kept = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().settings.autoAnswers);
check(JSON.stringify(kept) === JSON.stringify({ "solemn-simulacrum:0:0:may": 0 }), "answer kept", kept);
// The second one: no window, the answer "No" is given by the autopilot.
await page
  .locator(`.hand [data-oid="${(await solemns())[0]}"]`)
  .first()
  .click();
let asked = false;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(250);
  asked ||= await page.evaluate(() => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return v?.pending?.kind === "choice" && v.pending.player === v.viewer;
  });
}
await myMain();
const onField = await page.evaluate(
  () => (window as unknown as DevWindow).__mtgx.getState().view?.battlefield.filter((o) => o.name === "Solemn Simulacrum").length,
);
check(!asked && onField === 2, "the second trigger is answered without a window", { asked, onField });
await page.locator(".drawer-toggle").click(); // settings drawer
const forget = page.getByRole("button", { name: /Oublier les réponses gardées \(1\)/ }); // i18n-ignore: the French interface
check(await forget.isVisible(), "forget button in the settings drawer");
await page.screenshot({ path: `${OUT}/2-sidebar.png` });
await forget.click();
const after = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().settings.autoAnswers);
check(JSON.stringify(after) === "{}", "answers forgotten", after);

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("always-answer-smoke: all good");
