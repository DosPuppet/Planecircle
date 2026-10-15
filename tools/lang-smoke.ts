/**
 * Display in both languages (PLAN-I): opens the home screen, the deck builder, the online lobby, the tutorial menu, then
 * plays a game against the AI, in French and in English, and checks every text shown (text, `title`, `aria-label`):
 * - no raw marker of an engine text (`⟨…⟩`, `⟦…⟧`): a text not rendered through the decoder;
 * - in English, no French line (detector of `cards/test/frenchSource.ts`);
 * - in French, no line that is an English message id with another French translation: a text not translated.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/lang-smoke.ts [maxActions] [screenshot-dir]
 */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { isFrenchLine } from "../packages/cards/test/frenchSource";

const MAX = Number(process.argv[2] ?? 250);
const OUT = process.argv[3] ?? "test-results/lang";
mkdirSync(OUT, { recursive: true });

/** English ids whose French differs (context prefix removed), to spot untranslated texts in the French interface. */
const UNTRANSLATED = new Set<string>();
const catalogs = [
  "packages/engine/locales/fr.json",
  "packages/client/locales/fr.json",
  "packages/server/locales/fr.json",
  ...readdirSync("packages/cards/locales/fr").map((f) => `packages/cards/locales/fr/${f}`),
];
for (const f of catalogs)
  for (const [id, fr] of Object.entries(JSON.parse(readFileSync(f, "utf8")) as Record<string, string>)) {
    const en = id.replace(/^ctx:[^|]*\|/, "");
    if (!en.includes("{") && en !== fr && /[a-z]{3}/.test(en)) UNTRANSLATED.add(en);
  }
// French ids that are also French words of the French interface (same spelling, other meaning) are not errors.
for (const f of catalogs)
  for (const fr of Object.values(JSON.parse(readFileSync(f, "utf8")) as Record<string, string>)) UNTRANSLATED.delete(fr);

type Lang = "fr" | "en";
const problems = new Map<string, string>();

/** Every visible text of the page, line by line, with the `title` and `aria-label` attributes. */
async function texts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out = document.body.innerText.split("\n");
    // The drawer (log, settings) is hidden while closed: its texts are read anyway, line by line.
    for (const el of document.querySelectorAll(".sidebar .log-line")) out.push(el.textContent ?? "");
    const settings = document.querySelector(".sidebar .settings");
    const walker = settings && document.createTreeWalker(settings, NodeFilter.SHOW_TEXT);
    while (walker?.nextNode()) out.push(walker.currentNode.textContent ?? "");
    for (const el of document.querySelectorAll("[title], [aria-label]")) {
      const t = el.getAttribute("title");
      const a = el.getAttribute("aria-label");
      if (t) out.push(t);
      if (a) out.push(a);
    }
    return out.map((l) => l.trim()).filter(Boolean);
  });
}

async function check(page: Page, lang: Lang, where: string): Promise<void> {
  for (const line of await texts(page)) {
    let why: string | null = null;
    if (/[⟨⟩⟦⟧]/.test(line)) why = "raw marker";
    else if (lang === "en" && isFrenchLine(line)) why = "French in English";
    else if (lang === "fr" && UNTRANSLATED.has(line)) why = "untranslated";
    if (why && !problems.has(`${lang}|${line}`)) problems.set(`${lang}|${line}`, `${lang} ${where}: ${why}: ${line}`);
  }
}

const NAMES = {
  fr: {
    play: "Jouer contre l'IA",
    keep: "Garder",
    decks: "Mes decks",
    online: "Contre un joueur", // i18n-ignore: the French interface
    learn: "Apprendre à jouer", // i18n-ignore: the French interface
    concede: "Abandonner",
    confirm: "Confirmer",
  },
  en: {
    play: "Play against the AI",
    keep: "Keep",
    decks: "My decks",
    online: "Against a player",
    learn: "Learn to play",
    concede: "Concede",
    confirm: "Yes, concede",
  },
} as const;

const browser = await chromium.launch();
const errors: string[] = [];
for (const lang of ["fr", "en"] as const) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${lang} pageerror: ${e.message}`));
  await page.addInitScript((l) => localStorage.setItem("planecircle.lang", l), lang);
  const n = NAMES[lang];
  const home = async () => {
    await page.goto("http://localhost:5173/?fast");
    await page.getByRole("button", { name: n.play }).waitFor({ timeout: 20_000 });
  };

  await home();
  await check(page, lang, "home");
  await page.screenshot({ path: join(OUT, `${lang}-home.png`) });
  for (const [screen, button] of [
    ["deck builder", n.decks],
    ["online lobby", n.online],
    ["tutorial menu", n.learn],
  ] as const) {
    await page.getByRole("button", { name: button }).first().click();
    await page.waitForTimeout(800);
    await check(page, lang, screen);
    await page.screenshot({ path: join(OUT, `${lang}-${screen.replace(/ /g, "-")}.png`) });
    await home();
  }

  await page.getByRole("button", { name: n.play }).click();
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await check(page, lang, "mulligan");
  await page.getByRole("button", { name: n.keep, exact: true }).click();

  // Language-neutral play: suggestions and primary buttons in dialogs, first target, playable cards, main button.
  for (let i = 0; i < MAX; i++) {
    await page.waitForTimeout(100);
    if (i % 8 === 0) await check(page, lang, `game, action ${i}`);
    if (await page.locator(".gameover").count()) break;
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      await check(page, lang, `dialog, action ${i}`);
      const primary = dialog.locator(".btn.primary:not([disabled])").last();
      const choice = dialog.locator(".btn.choice").first();
      const card = dialog.locator(".hand-picker .card").first();
      if (await card.count()) await card.click({ timeout: 1000 }).catch(() => {});
      if (await primary.count()) await primary.click({ timeout: 1000 }).catch(() => {});
      else await choice.click({ timeout: 1000 }).catch(() => {});
      continue;
    }
    const target = page.locator(".glow-target").first();
    if (await target.count()) {
      await target.click({ force: true, timeout: 2000 }).catch(() => {});
      continue;
    }
    const playable = page.locator(".hand .glow-playable");
    if (await playable.count()) {
      await playable
        .first()
        .click({ force: true, timeout: 2000 })
        .catch(() => {});
      continue;
    }
    await page
      .locator(".main-button:not([disabled])")
      .click({ timeout: 2000 })
      .catch(() => {});
  }
  await check(page, lang, "end");
  await page.screenshot({ path: join(OUT, `${lang}-game.png`) });
  // Game not over within MAX actions: the settings drawer, then a concession, for the end-of-game window.
  if (!(await page.locator(".gameover").count())) {
    await page.locator(".drawer-toggle").click();
    await page.waitForTimeout(400);
    await check(page, lang, "drawer");
    await page.getByRole("button", { name: n.concede, exact: true }).click();
    await page.getByRole("button", { name: n.confirm, exact: true }).click();
    await page.locator(".gameover").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await check(page, lang, "game over");
  }
  await page.close();
}
await browser.close();

for (const p of problems.values()) console.log(p);
for (const e of errors) console.log(e);
const failed = problems.size + errors.length;
console.log(failed ? `FAILED: ${problems.size} text(s), ${errors.length} page error(s)` : "ok: both languages, no page error");
if (failed) process.exit(1);
