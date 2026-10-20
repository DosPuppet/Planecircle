/**
 * One-off interface test of the glossary: the window (home screen, search without accents, a word of a definition
 * hovered then clicked), the floating preview of a card with its definitions next to it (MTGA style), the words of its
 * text underlined; on a phone, a long press on a word of the overlaid preview shows its definition. Screenshots in
 * test-results/glossary/.
 *
 * Requires: `npm run dev` running.
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, devices, type Page } from "playwright";

const OUT = "test-results/glossary";
mkdirSync(OUT, { recursive: true });

type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: unknown): void;
      passPriority(): void;
      view: {
        viewer: string;
        turn: { active: string; step: string };
        pending: { kind: string; player: string } | null;
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

/** A game whose battlefield has Vampire Nighthawk (flying, deathtouch, lifelink), my first main phase. */
async function game(page: Page): Promise<void> {
  await page.evaluate(([deck, sb]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, [deck], sb), [
    [[60, "Swamp"]] as [number, string][],
    { p1: { cards: ["Swamp", "Swamp", "Vampire Nighthawk"] }, p2: { cards: ["Swamp"] } },
  ] as const);
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 }); // i18n-ignore: the French interface
  await page.waitForFunction(
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
  await page.waitForTimeout(800);
}

const nighthawk = (page: Page) =>
  page.evaluate(
    () => (window as unknown as DevWindow).__mtgx.getState().view?.battlefield.find((o) => o.name === "Vampire Nighthawk")?.id,
  );

const browser: Browser = await chromium.launch();

// Desktop: the glossary window, then the floating preview.
{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?fast");
  await page.getByRole("button", { name: "Glossaire" }).click(); // i18n-ignore: the French interface
  const dialog = page.getByTestId("glossary");
  check(await dialog.isVisible(), "the glossary opens from the home screen");
  const count = await dialog.locator(".glossary-entry").count();
  check(count > 150, "every entry is listed", count);
  await page.screenshot({ path: `${OUT}/glossary.png` });
  // Search without accents.
  await dialog.locator("input[type=search]").fill("celerite");
  const found = await dialog.locator(".glossary-entry dt").allInnerTexts();
  check(
    found.some((t) => t.startsWith("Célérité")), // i18n-ignore: the French interface
    "search without accents finds Célérité", // i18n-ignore: the French name searched
    found,
  );
  await dialog.locator("input[type=search]").fill("");
  // A word of a definition: its definition on hover, its entry on a click.
  const flying = dialog.locator('[data-entry="flying"] dd .kw-term[data-term="reach"]');
  await flying.scrollIntoViewIfNeeded();
  await flying.hover();
  check(await page.locator(".kw-tip.term").isVisible(), "hovering a word shows its definition");
  await page.screenshot({ path: `${OUT}/glossary-hover.png` });
  await flying.click();
  await page.waitForTimeout(300);
  check((await dialog.locator('.glossary-entry.focus[data-entry="reach"]').count()) === 1, "clicking a word shows its entry");
  await page.keyboard.press("Escape");
  check((await page.getByTestId("glossary").count()) === 0, "Escape closes the glossary");

  await game(page);
  const id = await nighthawk(page);
  await page.locator(`.battlefield [data-oid="${id}"]`).first().hover();
  await page.waitForTimeout(500);
  const float = page.locator(".preview-float");
  check(await float.isVisible(), "hovering a card shows the floating preview");
  const terms = await float.locator(".preview-term").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.term));
  check(
    ["flying", "deathtouch", "lifelink"].every((t) => terms.includes(t)),
    "its definitions next to it: flying, deathtouch, lifelink",
    terms,
  );
  check((await float.locator(".preview-text .kw-term").count()) >= 3, "the words of its text are underlined");
  await page.screenshot({ path: `${OUT}/preview-float.png` });
  // The game's drawer has the glossary too.
  await page.locator(".drawer-toggle").click();
  await page.getByRole("button", { name: "Glossaire" }).click(); // i18n-ignore: the French interface
  check(await page.getByTestId("glossary").isVisible(), "the glossary opens from the game's drawer");
  await page.keyboard.press("Escape");
  await page.close();
}

// Phone in landscape: a long press on the card, then on a word of its text.
{
  const ctx = await browser.newContext(devices["iPhone 13 landscape"]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/?fast");
  await game(page);
  const cdp = await ctx.newCDPSession(page);
  const longPress = async (x: number, y: number) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
  };
  const id = await nighthawk(page);
  const card = await page.locator(`.battlefield [data-oid="${id}"]`).first().boundingBox();
  if (card) await longPress(card.x + card.width / 2, card.y + card.height / 2);
  check(await page.locator(".touch-preview").isVisible(), "long press on the card: overlaid preview");
  const word = page.locator('.touch-preview .preview-text .kw-term[data-term="deathtouch"]');
  await word.scrollIntoViewIfNeeded();
  const wb = await word.boundingBox();
  if (wb) await longPress(wb.x + wb.width / 2, wb.y + wb.height / 2);
  const tip = page.locator(".kw-tip.term");
  check(await tip.isVisible(), "long press on a word: its definition");
  check((await page.locator(".touch-preview").count()) === 1, "the preview stays open under the definition");
  await page.screenshot({ path: `${OUT}/phone-long-press.png` });
  await page.touchscreen.tap(10, 10);
  await page.waitForTimeout(300);
  check((await tip.count()) === 0, "a tap closes the definition");
  await ctx.close();
}

await browser.close();
for (const e of errors) console.log(`page error: ${e}`);
if (failures.length || errors.length) {
  console.log(`FAILED: ${failures.length} check(s), ${errors.length} page error(s)`);
  process.exit(1);
}
console.log("No page error.");
