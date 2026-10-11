/**
 * One-off interface test of the cost choices (PLAN-M M6): Muldrotha's permanent type (a card with two types cast from
 * the graveyard as a creature), then, in full control, the blue card Force of Will exiles (the player's choice, not the
 * cheapest). Screenshots in test-results/m6/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "test-results/m6";
mkdirSync(OUT, { recursive: true });

type Obj = { id: string; name: string; tapped?: boolean; controller?: string };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      setFullControl(on: boolean): void;
      pickTarget(id: string): void;
      clickHandCard(id: string): void;
      passPriority(): void;
      casting: { stage: string; pick?: { slot: string; options: string[] } } | null;
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string } | null;
        hand: Obj[];
        playableElsewhere: Obj[];
        battlefield: Obj[];
        exile: Obj[];
        stack: { id: string }[];
        players: Record<string, { life: number; graveyard: Obj[] }>;
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
const shown = (p: Promise<unknown>) =>
  p.then(
    () => true,
    () => false,
  );

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5173/?fast");
await page.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
  [[60, "Island"]] as [number, string][],
  {
    p1: {
      cards: ["Muldrotha, the Gravetide", "Mountain", "Mountain", "Swamp"],
      hand: ["Shock", "Force of Will", "Opt", "Counterspell"],
      graveyard: ["Gingerbrute", "Wayfarer's Bauble", "Llanowar Elves"],
    },
  },
] as const);
await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
/** My priority (in my first main phase if `main`; the other priorities are passed), with an empty stack if `empty`. */
const myPriority = (main = false, empty = true) =>
  page.waitForFunction(
    ([main, empty]) => {
      const st = (window as unknown as DevWindow).__mtgx.getState();
      const v = st.view;
      const mine = !!v && (!empty || v.stack.length === 0) && v.pending?.kind === "priority" && v.pending.player === v.viewer;
      if (!mine || !main) return mine;
      if (v.turn.active === v.viewer && v.turn.step === "main1") return true;
      st.passPriority();
      return false;
    },
    [main, empty] as const,
    { timeout: 60_000, polling: 500 },
  );
const view = () => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view);
const casting = () => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().casting);
/** A click on a card of the hand (cards playable from the graveyard included; they overlap at this width). */
const clickHand = async (name: string) => {
  const id = await handId(name);
  await page.evaluate((id) => (window as unknown as DevWindow).__mtgx.getState().clickHandCard(id), id);
};
const handId = async (name: string) => {
  const v = await view();
  return [...(v?.hand ?? []), ...(v?.playableElsewhere ?? [])].find((o) => o.name === name)?.id ?? "";
};

// 1. Muldrotha: Gingerbrute (artifact creature) cast from the graveyard as a creature.
await myPriority(true);
await clickHand("Gingerbrute");
check(await shown(page.getByRole("button", { name: "Créature" }).waitFor({ timeout: 5000 })), "Muldrotha type window"); // i18n-ignore: the French interface is tested
check((await casting())?.pick?.slot === "permanentType", "permanentType slot", await casting());
await page.screenshot({ path: `${OUT}/1-muldrotha-type.png` });
await page.getByRole("button", { name: "Créature" }).click(); // i18n-ignore: the French interface is tested
await page.getByRole("button", { name: "Valider (1/1)" }).click(); // i18n-ignore: the French interface is tested
await page.waitForTimeout(800);
await myPriority();
const v1 = await view();
check(!!v1?.battlefield.find((o) => o.name === "Gingerbrute"), "Gingerbrute on the battlefield");
const elsewhere = (v1?.playableElsewhere ?? []).map((o) => o.name);
check(elsewhere.includes("Wayfarer's Bauble"), "the artifact type stays free", elsewhere);
check(!elsewhere.includes("Llanowar Elves"), "the creature type is used", elsewhere);
await page.screenshot({ path: `${OUT}/2-muldrotha-done.png` });

// 2. Full control: Shock on the stack, then Force of Will for its alternative cost (no mana: no "mana" stage),
// exiling Counterspell (not Opt).
await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().setFullControl(true));
await clickHand("Shock");
await page.waitForFunction(() => (window as unknown as DevWindow).__mtgx.getState().casting?.stage === "target");
await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().pickTarget("p2"));
await page.waitForFunction(() => (window as unknown as DevWindow).__mtgx.getState().casting?.stage === "mana");
await page.getByTestId("pay-mana").click();
await myPriority(false, false);
const shockOnStack = (await view())?.stack[0]?.id ?? "";
check(!!shockOnStack, "Shock on the stack");
await clickHand("Force of Will");
await page.waitForFunction(() => (window as unknown as DevWindow).__mtgx.getState().casting?.stage === "target");
await page.evaluate((id) => (window as unknown as DevWindow).__mtgx.getState().pickTarget(id), shockOnStack);
await page.waitForFunction(() => (window as unknown as DevWindow).__mtgx.getState().casting?.stage === "pick");
check((await casting())?.pick?.slot === "handExile", "handExile slot", await casting());
const counterspell = await handId("Counterspell");
await page.screenshot({ path: `${OUT}/3-force-of-will-exile.png` });
// The options: the cheapest first (Opt, the suggestion), then Counterspell.
const options = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().casting?.pick?.options ?? []);
check(options[1] === counterspell, "Counterspell offered second", options);
await page.locator(".hand-picker .pick-slot").nth(1).locator(".card, .card-slot, img").first().click();
await page.screenshot({ path: `${OUT}/4-force-of-will-chosen.png` });
await page.getByRole("button", { name: "Valider (1/1)" }).click(); // i18n-ignore: the French interface is tested
await page.waitForTimeout(800);
const v2 = await view();
check(
  (v2?.exile ?? []).some((o) => o.name === "Counterspell"),
  "Counterspell exiled",
  v2?.exile.map((o) => o.name),
);
check(
  (v2?.hand ?? []).some((o) => o.name === "Opt"),
  "Opt stays in hand",
  v2?.hand.map((o) => o.name),
);
check(v2?.players.p1?.life === 19, "1 life paid", v2?.players.p1?.life);
await page.screenshot({ path: `${OUT}/5-done.png` });

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.error(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("cost-picks-smoke: ok");
