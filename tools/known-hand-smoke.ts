/**
 * One-off interface test of the cards seen in an opponent's hand: Deep-Cavern Bat shows the whole hand (the lands
 * greyed, not clickable), then the opponent's hand, clicked, shows again the cards seen that are still there. On the DOM
 * board, then on the 3D board (same component). Screenshots in test-results/known-hand/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const OUT = "test-results/known-hand";
mkdirSync(OUT, { recursive: true });

type Obj = { id: string; name: string };
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      clickHandCard(id: string): void;
      passPriority(): void;
      decide(d: unknown): void;
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: {
          kind: string;
          player: string;
          request?: { type: string; intent: string; options: string[]; unchoosable?: string[]; suggested: unknown[] };
          objects?: Obj[];
        } | null;
        hand: Obj[];
        stack: { id: string }[];
        players: Record<string, { handCount: number; knownHand?: Obj[] }>;
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

// The DOM board in a plain Chromium; the 3D board with SwiftShader (software WebGL, `?board3d=force`).
const browser = await chromium.launch();
const browser3d = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function run(threeD: boolean): Promise<void> {
  const tag = threeD ? "3d" : "2d";
  const ctx = await (threeD ? browser3d : browser).newContext({ viewport: { width: 1600, height: 900 } });
  // No arena in the 3D board: SwiftShader draws it far too slowly.
  if (threeD) await ctx.route("**/arena/*/manifest.json", (r) => r.fulfill({ json: { version: 0 } }));
  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  await page.goto(`http://localhost:5173/?fast${threeD ? "&board3d=force&quality=low" : ""}`, { timeout: 120_000 });
  // The opponent's deck has spells: with lands only, the AI would take a mulligan (the sandbox hand with it).
  await page.evaluate(([deck, theirs, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [theirs], sb), [
    [[60, "Island"]] as [number, string][],
    [
      [24, "Island"],
      [36, "Opt"],
    ] as [number, string][],
    {
      p1: { cards: ["Swamp", "Swamp", "Swamp"], hand: ["Deep-Cavern Bat"] },
      p2: { hand: ["Shivan Dragon", "Forest"] },
    },
  ] as const);
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 120_000 }); // i18n-ignore: the French interface is tested
  if (threeD) await page.locator(".board3d-loading").waitFor({ state: "detached", timeout: 120_000 });

  // My first main phase, then the Bat; its trigger's questions answered with the suggestion until the pick in the hand.
  await page.waitForFunction(
    () => {
      const st = (window as unknown as DevWindow).__mtgx.getState();
      const v = st.view;
      const mine = !!v && v.stack.length === 0 && v.pending?.kind === "priority" && v.pending.player === v.viewer;
      if (mine && v.turn.active === v.viewer && v.turn.step === "main1") return true;
      if (mine) st.passPriority();
      return false;
    },
    undefined,
    { timeout: 90_000, polling: 500 },
  );
  const bat = await page.evaluate(
    () => (window as unknown as DevWindow).__mtgx.getState().view?.hand.find((o) => o.name === "Deep-Cavern Bat")?.id ?? "",
  );
  await page.evaluate((id) => (window as unknown as DevWindow).__mtgx.getState().clickHandCard(id), bat);
  await page
    .waitForFunction(
      () => {
        const st = (window as unknown as DevWindow).__mtgx.getState();
        const p = st.view?.pending;
        if (!p || p.player !== st.view?.viewer) return false;
        if (p.kind === "choice" && p.request?.intent === "pickCards") return true;
        if (p.kind === "choice") st.decide({ type: "choose", values: p.request?.suggested ?? [] });
        else if (p.kind === "priority" && (st.view?.stack.length ?? 0) > 0) st.passPriority();
        return false;
      },
      undefined,
      { timeout: 60_000, polling: 500 },
    )
    .catch(async (e) => {
      await page.screenshot({ path: `${OUT}/${tag}-stuck.png`, timeout: 120_000 });
      const st = await page.evaluate(() => {
        const g = (window as unknown as DevWindow).__mtgx.getState() as unknown as Record<string, unknown>;
        const v = g.view as { pending: unknown; stack: unknown[]; hand: { name: string }[]; turn: unknown } | null;
        return {
          pending: v?.pending,
          stack: v?.stack.length,
          hand: v?.hand.map((o) => o.name),
          turn: v?.turn,
          casting: g.casting,
        };
      });
      console.error(JSON.stringify(st, null, 1).slice(0, 3000));
      throw e;
    });
  const dialog = page.locator(".modal .hand-picker").first();
  await dialog.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const pending = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view?.pending);
  const unchoosable = pending?.request?.unchoosable ?? [];
  const name = (id: string) => pending?.objects?.find((o) => o.id === id)?.name;
  check(
    unchoosable.length > 0 && unchoosable.every((id) => /Forest|Island/.test(name(id) ?? "")),
    `${tag}: the lands come as unchoosable`,
    unchoosable.map(name),
  );
  const dimmed = await dialog.locator(".card.dim").count();
  const all = await dialog.locator(".card").count();
  check(dimmed === unchoosable.length, `${tag}: one greyed card per land`, { dimmed, unchoosable: unchoosable.length });
  check(all === dimmed + (pending?.request?.options.length ?? 0), `${tag}: the whole hand in the window`, { all, dimmed });
  check((await dialog.locator(".card.dim.clickable").count()) === 0, `${tag}: the greyed cards can't be clicked`);
  await page.screenshot({ path: `${OUT}/${tag}-1-bat-pick.png`, timeout: 120_000 });

  // The Dragon (the suggestion) exiled.
  await page.getByRole("button", { name: "Valider" }).click(); // i18n-ignore: the French interface is tested
  await page.waitForFunction(() => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return !!v && v.stack.length === 0 && v.pending?.kind === "priority" && v.pending.player === v.viewer;
  });
  const opp = await page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().view?.players.p2);
  const known = opp?.knownHand?.map((o) => o.name) ?? [];
  // The whole hand was seen: every card left in it is known.
  check(known.length > 0 && known.length === opp?.handCount, `${tag}: the cards left are known`, { known, n: opp?.handCount });
  const hand = page.locator(".opp-hand.known");
  check(await hand.isVisible(), `${tag}: the opponent's hand is a button`);
  check((await page.locator(".opp-hand-known").innerText()).trim() === String(known.length), `${tag}: the eye counts them`);
  await page.screenshot({ path: `${OUT}/${tag}-2-board.png`, timeout: 120_000 });

  await hand.click();
  const viewer = page.locator(".modal").filter({ hasText: "Main —" }); // i18n-ignore: the French interface is tested
  await viewer.waitFor({ timeout: 5000 });
  await page.waitForTimeout(600);
  const faceUp = await viewer.locator(".hand-picker .card").count();
  check(faceUp === known.length, `${tag}: the viewer shows the cards seen`, { faceUp, known: known.length });
  await page.screenshot({ path: `${OUT}/${tag}-3-hand-viewer.png`, timeout: 120_000 });
  await viewer.getByRole("button", { name: "Fermer" }).click(); // i18n-ignore: the French interface is tested
  check((await viewer.count()) === 0, `${tag}: the viewer closes`);
  await ctx.close();
}

await run(false);
await run(true);
check(errors.length === 0, "no page error", errors);
await browser.close();
await browser3d.close();
if (failures.length) {
  console.error(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("known-hand-smoke: ok");
