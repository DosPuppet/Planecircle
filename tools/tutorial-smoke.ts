/**
 * End-to-end test of the tutorial: each lesson is followed in the browser by clicking like a player (cards, targets,
 * main button, "Next"), from the decisions its steps expect.
 * Also checks the refusal of an action outside the guide and the resumption after a page reload.
 * Lesson 9 (free game) is followed up to the start of the game.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/tutorial-smoke.ts [screenshot-dir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { GameView } from "@mtgx/engine";
import { chromium, type Page } from "playwright";
import { LESSONS } from "../packages/client/src/tutorial/lessons";
import { type Allow, solve } from "../packages/client/src/tutorial/runtime";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
/** `--only 2,3`: only these lessons (without the menu checks). */
const ONLY = onlyAt >= 0 ? (args.splice(onlyAt, 2)[1] ?? "").split(",").map(Number) : null;
const DEBUG = args.includes("--debug");
/** `--3d`: on the 3D board (PLAN-W), forced on SwiftShader; the lessons must be followed the same way. */
const BOARD3D = args.includes("--3d");
const OUT = args.find((a) => !a.startsWith("--")) ?? (BOARD3D ? "test-results/tutorial-3d" : "test-results/tutorial");
mkdirSync(OUT, { recursive: true });
const URL = `http://localhost:5173/?fast${BOARD3D ? "&board3d=force&quality=low" : ""}`;
const browser = await chromium.launch(
  BOARD3D ? { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } : {},
);
const page = await browser.newPage({ viewport: { width: 1500, height: 880 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
page.on("worker", (w) => w.on("console", (m) => m.type() === "error" && errors.push(`worker: ${m.text()}`)));
let failed = false;
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    console.log(`FAILED: ${msg}`);
    failed = true;
    process.exitCode = 1;
  } else console.log(`ok: ${msg}`);
};

interface TutoState {
  lessonId: string | null;
  step: number;
  finished: boolean;
}

const tuto = (p: Page) =>
  p.evaluate(() => {
    const t = (window as unknown as { __tuto: { getState(): TutoState } }).__tuto.getState();
    return { lessonId: t.lessonId, step: t.step, finished: t.finished };
  });
const gameView = (p: Page) =>
  p.evaluate(
    () => (window as unknown as { __mtgx: { getState(): { view: unknown } } }).__mtgx.getState().view,
  ) as Promise<GameView | null>;

/** Element of an object or of a player (the tokens of a pile do not all have an element). */
const objectEl = (id: string) => page.locator(`[data-oid="${id}"], [data-oids~="${id}"]`).first();

/** Click like a player: the cards of the hand overlap, so aim at their visible corner (top left). */
async function clickObj(id: string, v: GameView): Promise<void> {
  const inHand = v.hand.some((o) => o.id === id);
  await objectEl(id).click(inHand ? { position: { x: 14, y: 30 } } : undefined);
}

async function clickMain(): Promise<void> {
  const ok = page.locator(".stack-reveal-ok");
  if (await ok.isVisible().catch(() => false)) await ok.click();
  else await page.locator('[data-tuto="main-button"]').click();
}

/** Performs the step like a player, from the expected decision. */
async function act(allow: Allow, v: GameView): Promise<void> {
  const intent = solve(allow, v);
  if (!intent) throw new Error(`nothing to do for ${JSON.stringify(allow)}`);
  switch (intent.type) {
    case "keep":
      await page.getByRole("button", { name: "Garder" }).click();
      return;
    case "pass":
    case "endTurn":
      await clickMain();
      return;
    case "playLand":
      await clickObj(intent.card, v);
      return;
    case "cast":
    case "activate": {
      await clickObj(intent.type === "cast" ? intent.card : intent.source, v);
      const target = Object.values(intent.targets ?? {}).flat()[0];
      if (!target) return;
      // Target chosen automatically when it is the only one possible: no click.
      const targeting = await page
        .waitForFunction(
          () =>
            (window as unknown as { __mtgx: { getState(): { casting: { stage: string } | null } } }).__mtgx.getState().casting
              ?.stage === "target",
          undefined,
          { timeout: 1500 },
        )
        .then(() => true)
        .catch(() => false);
      if (targeting) await clickObj(target, v);
      return;
    }
    case "declareAttackers":
      for (const a of intent.attackers) await objectEl(a.id).click();
      await clickMain();
      return;
    case "declareBlockers":
      for (const b of intent.blocks) {
        await objectEl(b.blocker).click();
        // A blocker that can block only one attacker is assigned on the first click.
        const assigned = await page.evaluate(
          (id) =>
            id in (window as unknown as { __mtgx: { getState(): { blocks: Record<string, string> } } }).__mtgx.getState().blocks,
          b.blocker,
        );
        if (!assigned) await objectEl(b.attacker).click();
      }
      await clickMain();
      return;
    default:
      throw new Error(`unhandled decision: ${intent.type}`);
  }
}

/** Waits until the step (or the lesson) changes; fails if the tutorial stays stuck. */
async function waitProgress(before: TutoState, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const s = await tuto(page);
    if (s.step !== before.step || s.finished !== before.finished || s.lessonId !== before.lessonId) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`stuck: ${what}`);
}

async function playLesson(index: number): Promise<void> {
  const lesson = LESSONS[index];
  if (!lesson) return;
  for (let guard = 0; guard < 200; guard++) {
    const s = await tuto(page);
    if (s.finished || s.lessonId !== lesson.id) return;
    const step = lesson.steps[s.step];
    if (!step) throw new Error(`step ${s.step} not found`);
    const where = `${lesson.id} step ${s.step + 1}`;
    if (step.free) return; // free game (lesson 9): stop here
    if (step.next) {
      await page.locator(".coach-next").click();
      await waitProgress(s, where);
      continue;
    }
    const t = step.target;
    if (step.allow) {
      // Action step: wait until the expected decision is possible (worker starting, opponent's turn…).
      const deadline = Date.now() + 15_000;
      let done = false;
      while (!done && Date.now() < deadline) {
        const v = await gameView(page);
        const allow = v && step.allow.find((a) => solve(a, v));
        if (v && allow) {
          if (DEBUG) console.log(where, JSON.stringify(allow));
          await act(allow, v);
          done = true;
        } else {
          const now = await tuto(page);
          if (now.step !== s.step || now.finished) done = true;
          else await page.waitForTimeout(100);
        }
      }
      if (!done) throw new Error(`stuck: ${where} (expected action impossible)`);
      // The step may ask for several decisions ("Pass" then block): go through the loop again.
      await waitProgress(s, where).catch(() => {});
      continue;
    }
    if (typeof t === "object") {
      // Hover step: wait until the card is on screen.
      await page.waitForFunction((name) => {
        const v = (window as unknown as { __mtgx: { getState(): { view: GameView | null } } }).__mtgx.getState().view;
        return !!v && [...v.battlefield, ...v.hand].some((o) => o.name === name);
      }, t.card);
      const v = await gameView(page);
      const id = v?.battlefield.find((o) => o.name === t.card)?.id ?? v?.hand.find((o) => o.name === t.card)?.id;
      if (id) await objectEl(id).hover();
    }
    // Waiting step (opponent's turn): let the game go on.
    await waitProgress(s, where);
  }
  throw new Error(`${lesson.id}: too many steps`);
}

/** Lesson 2: an action outside the guide is refused; after a page reload, the lesson is offered for resumption. */
async function refusalAndResume(): Promise<void> {
  await page.locator(".lesson-tile").nth(1).click();
  await page.locator(".coach-next").click();
  // The game must be ready (priority to the player): a fixed delay is not enough on a loaded machine.
  await page.waitForFunction(() => {
    const v = (window as unknown as { __mtgx: { getState(): { view: GameView | null } } }).__mtgx.getState().view;
    return !!v && v.pending?.kind === "priority" && v.pending.player === v.viewer;
  });
  const v = await gameView(page);
  const plains = v?.hand.find((o) => o.name === "Plains");
  if (plains && v) await clickObj(plains.id, v);
  await page.waitForTimeout(200);
  check(
    (
      await page
        .locator(".toast")
        .innerText()
        .catch(() => "")
    ).includes("Forêt"),
    "action outside the guide refused",
  );
  check(!((await gameView(page))?.battlefield.some((o) => o.name === "Plains") ?? true), "the Plains was not played");
  await page.screenshot({ path: join(OUT, "01-refusal.png") });
  await page.reload();
  await page.getByRole("button", { name: "Apprendre à jouer" }).click();
  check(await page.getByRole("button", { name: /Reprendre : Terrains et mana/ }).isVisible(), "resumption offered after reload");
}

try {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Apprendre à jouer" }).click();
  await page.screenshot({ path: join(OUT, "00-menu.png") });
  check((await page.locator(".lesson-tile").count()) === LESSONS.length, `${LESSONS.length} lessons in the menu`);
  if (ONLY === null) await refusalAndResume();

  for (let i = 0; i < LESSONS.length; i++) {
    const lesson = LESSONS[i];
    if (!lesson || (ONLY !== null && !ONLY.includes(i + 1))) continue;
    if ((await page.locator(".tutorial-menu").count()) === 0) {
      await page.goto(URL);
      await page.getByRole("button", { name: "Apprendre à jouer" }).click();
    }
    await page.locator(".lesson-tile").nth(i).click();
    const t0 = Date.now();
    try {
      await playLesson(i);
      if (DEBUG) console.log(`  lesson ${i + 1}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      await page.waitForTimeout(300);
      const s = await tuto(page);
      await page.screenshot({ path: join(OUT, `lesson-${i + 1}-${lesson.id}.png`) });
      if (lesson.steps.some((st) => st.free))
        check(s.lessonId === lesson.id && !s.finished, `lesson ${i + 1}: free game reached`);
      else check(s.finished, `lesson ${i + 1} (${lesson.title}) finished`);
    } catch (e) {
      await page.screenshot({ path: join(OUT, `lesson-${i + 1}-${lesson.id}-failed.png`) });
      check(false, `lesson ${i + 1} (${lesson.title}): ${(e as Error).message}`);
    }
    // Back to the tutorial menu.
    const coach = page.locator(".coach");
    if (
      await coach
        .getByRole("button", { name: "Menu du tutoriel" })
        .isVisible()
        .catch(() => false)
    )
      await coach.getByRole("button", { name: "Menu du tutoriel" }).click();
    else if (
      await coach
        .getByRole("button", { name: "Quitter" })
        .isVisible()
        .catch(() => false)
    )
      await coach.getByRole("button", { name: "Quitter" }).click();
  }
  if (ONLY === null) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, "99-menu-end.png") });
    check((await page.locator(".lesson-tile.done").count()) === LESSONS.length - 1, "lessons 1 to 8 marked finished");
  }
} finally {
  check(errors.length === 0, errors.length ? `page errors: ${errors.join(" | ")}` : "no page error");
  await browser.close();
}
if (!failed) console.log("ok: tutorial followed end to end");
