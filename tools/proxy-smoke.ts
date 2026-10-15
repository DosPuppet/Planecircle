/**
 * End-to-end test of the image relay (client/src/images.ts, the server's /scry/ route):
 * - Scryfall blocked (as by a corporate proxy): the relay turns on by itself, the images show;
 * - Scryfall reachable: direct images; the "Images through the Planecircle server" box forces the relay, and the
 *   choice survives a reload.
 * Screenshots in test-results/proxy/.
 *
 * Requires: `npm run dev` running (Vite relays /scry to Scryfall in dev).
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright";

const OUT = "test-results/proxy";
mkdirSync(OUT, { recursive: true });
// ?fast: fast test mode (AI without pauses), dev mode only.
const BASE = "http://localhost:5173/?fast";

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

/** Art of the home-screen decks (CSS background: the chosen decks' summaries): URL and actual loading. */
type Covers = { urls: string[] };
const covers = (page: Page) =>
  page.evaluate(`(() => ({
    urls: [...document.querySelectorAll(".deck-art, .deck-summary-art")]
      .map((e) => getComputedStyle(e).backgroundImage.replace(/^url\\("?|"?\\)$/g, ""))
      .filter((u) => u && u !== "none"),
  }))()`) as Promise<Covers>;

/** Images of the cards shown (hand, battlefield): URL and actual loading. */
type Imgs = { total: number; loaded: number; srcs: string[] };
const cardImages = (page: Page) =>
  page.evaluate(`(() => {
    const imgs = [...document.querySelectorAll(".card img")];
    return { total: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, srcs: imgs.map((i) => i.getAttribute("src")) };
  })()`) as Promise<Imgs>;

/** Do all the images of a CSS background load? */
const loadAll = (page: Page, urls: string[]) =>
  page.evaluate(
    (us) =>
      Promise.all(
        us.map(
          (u) =>
            new Promise<boolean>((res) => {
              const i = new Image();
              i.onload = () => res(i.naturalWidth > 0);
              i.onerror = () => res(false);
              i.src = u;
            }),
        ),
      ),
    urls,
  );

async function newPage(browser: Browser, blockScryfall: boolean): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  if (blockScryfall) await ctx.route("https://cards.scryfall.io/**", (r) => r.abort("blockedbyclient"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}

async function startGame(page: Page): Promise<void> {
  await page.evaluate(
    `window.__mtgx.getState().startGame([[60, "Forest"]], [[[60, "Forest"]]], { p1: { cards: ["Llanowar Elves", "Serra Angel"] } })`,
  );
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch();

// 1. Scryfall blocked: automatic switch to the relay.
{
  const page = await newPage(browser, true);
  await page.goto(BASE);
  await page.waitForFunction(`document.querySelector(".image-relay input")?.checked === true`, undefined, { timeout: 15_000 });
  check(true, "Scryfall blocked: relay turned on automatically (box checked)");
  const c = await covers(page);
  check(c.urls.length > 0 && c.urls.every((u) => u.includes("/scry/")), "home: art through /scry/", c.urls.slice(0, 2));
  const ok = await loadAll(page, c.urls);
  check(ok.every(Boolean), "home: art loaded", ok);
  await page.screenshot({ path: `${OUT}/1-home-blocked.png` });
  await startGame(page);
  const imgs = await cardImages(page);
  check(
    imgs.total > 0 && imgs.loaded === imgs.total && imgs.srcs.every((s) => s?.startsWith("/scry/")),
    "game: card images loaded through /scry/",
    { ...imgs, srcs: imgs.srcs.slice(0, 2) },
  );
  await page.screenshot({ path: `${OUT}/2-game-blocked.png` });
  await page.context().close();
}

// 2. Scryfall reachable: direct; the box forces the relay, remembered.
{
  const page = await newPage(browser, false);
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  const box = page.locator(".image-relay input");
  check(!(await box.isChecked()), "Scryfall reachable: relay off");
  let c = await covers(page);
  check(
    c.urls.length > 0 && c.urls.every((u) => u.startsWith("https://cards.scryfall.io/")),
    "home: direct art",
    c.urls.slice(0, 2),
  );
  await page.locator(".lobby-more summary").click(); // the setting is behind ⚙
  await box.check();
  c = await covers(page);
  check(
    c.urls.every((u) => u.includes("/scry/")),
    "box checked: art through /scry/",
    c.urls.slice(0, 2),
  );
  await page.reload();
  await page.waitForTimeout(1500);
  check(await page.locator(".image-relay input").isChecked(), "choice remembered after reload");
  await startGame(page);
  let imgs = await cardImages(page);
  check(imgs.total > 0 && imgs.srcs.every((s) => s?.startsWith("/scry/")), "game: relay forced", imgs.srcs.slice(0, 2));
  // Uncheck in the game settings (drawer): back to direct.
  await page.locator(".drawer-toggle").click();
  await page.locator(".sidebar .image-relay input").uncheck();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  imgs = await cardImages(page);
  check(
    imgs.srcs.every((s) => s?.startsWith("https://cards.scryfall.io/")),
    "game settings: box unchecked, back to direct",
    imgs.srcs.slice(0, 2),
  );
  await page.context().close();
}

await browser.close();
if (errors.length) console.log(`Page errors:\n${errors.join("\n")}`);
else console.log("ok: no page error");
process.exit(failures.length || errors.length ? 1 : 0);
