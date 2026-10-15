/**
 * End-to-end test of the deck builder: import of a decklist (French names, a typo fixed by a suggestion), editing by
 * clicks, export, persistence after a reload, then a game played with the deck; finally the deck's link (QR code),
 * opened in a fresh browser, offers to import the same deck.
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/deck-smoke.ts [screenshot-dir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "test-results/decks";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (cond: boolean, msg: string) => {
  if (!cond) {
    console.log(`FAILED: ${msg}`);
    process.exitCode = 1;
  } else console.log(`ok: ${msg}`);
};

await page.goto("http://localhost:5173/?fast");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("button", { name: "Mes decks" }).click();
await page.getByRole("button", { name: "Importer" }).click();
const LIST = `About
Name Test importé

Deck
4 Elfes de Llanowar
4 Bear Cub (FDN) 552
4 Thornweald Archer
4 Magnigoth Sentry
4 Tajuru Pathwarden
4 Giant Growth
4 Bite Down
4 Overun
4 Druid of the Cowl
24 Forest

Sideboard
2 Broken Wings
`;
await page.locator(".decklist-input").fill(LIST);
await page.screenshot({ path: join(OUT, "01-import.png") });
check((await page.locator(".import-report .v-error").count()) === 1, "a single line in error (Overun)");
await page.getByRole("button", { name: /Remplacer par « Overrun »/ }).click();
check((await page.locator(".import-report .v-error").count()) === 0, "suggestion applied");
await page.getByRole("button", { name: "Créer un nouveau deck" }).click();
await page.waitForTimeout(300);
check((await page.locator(".deck-name-input").inputValue()) === "Test importé", "deck name taken from the list");
check((await page.locator(".deck-tabs").innerText()).includes("60"), "60 cards in the deck");
check((await page.locator(".v-ok").count()) === 1, "deck valid and playable");
await page.screenshot({ path: join(OUT, "02-deck.png") });

// Deck tools (PLAN-L L9): sample hand, mana-value columns, basic lands.
await page.getByRole("button", { name: "Main d'essai" }).click();
check((await page.locator(".sample-hand .card").count()) === 7, "sample hand of seven cards");
await page.getByRole("button", { name: "Piochez une carte" }).click();
check((await page.locator(".sample-hand .card").count()) === 8, "a card drawn in the sample hand");
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, "02b-sample-hand.png") });
await page.getByRole("button", { name: "Fermer" }).click();
await page.getByRole("button", { name: "Colonnes" }).click();
check((await page.locator(".deck-column").count()) === 8, "deck in mana-value columns");
await page.screenshot({ path: join(OUT, "02c-columns.png") });
await page.getByRole("button", { name: "Collection" }).click();
await page.getByRole("button", { name: "Terrains de base" }).click();
await page.waitForTimeout(200);
check((await page.locator(".deck-tabs").innerText()).includes("60"), "basic lands: still 60 cards");

// Editing by clicks: remove a Giant Growth, add a Llanowar Elves, refused (already 4).
await page
  .locator(".deck-line", { hasText: /Croissance gigantesque|Giant Growth/ })
  .getByRole("button", { name: "Retirer" })
  .click();
check((await page.locator(".deck-tabs").innerText()).includes("59"), "card removed");
await page.locator(".filters .search").fill("elfes de llanowar");
await page.locator(".collection-grid .card").first().click();
check((await page.locator(".toast").innerText()).includes("4 exemplaires"), "5th copy refused");
await page.locator(".filters .search").fill("croissance");
await page.locator(".collection-grid .card").first().click();
check((await page.locator(".deck-tabs").innerText()).includes("60"), "added from the collection");

// Export.
await page.getByRole("button", { name: "Exporter" }).click();
const exported = await page.locator(".decklist-output").inputValue();
check(/^About\nName Test importé\n\nDeck\n/.test(exported) && exported.includes("(FDN)"), "export in MTGA format");
check(exported.includes("Sideboard\n2 Broken Wings"), "sideboard exported");
// QR code: the deck's link, drawn and copied.
await page.getByRole("button", { name: "QR code" }).click();
await page
  .locator(".deck-qr-code svg")
  .waitFor({ timeout: 5000 })
  .catch(() => {});
check((await page.locator(".deck-qr-code svg").count()) === 1, "QR code of the deck drawn");
await page.getByRole("button", { name: "Copier le lien" }).click();
const link = await page.evaluate(() => navigator.clipboard.readText());
check(/^http:\/\/localhost:5173\/#deck=1\.[\w-]+$/.test(link), "deck link copied");
await page.screenshot({ path: join(OUT, "deck-qr.png") });
await page.getByRole("button", { name: "Fermer" }).click();

// Persistence.
await page.reload();
await page.getByRole("button", { name: "Mes decks" }).click();
check((await page.locator(".deck-name-input").inputValue()) === "Test importé", "deck kept after reload");

// Game with the deck.
await page.getByRole("button", { name: "Tester contre l'IA" }).click();
await page.getByRole("button", { name: "Garder" }).click();
// Up to turn 3 (no need to go to the end: ui-smoke already plays a whole game).
const turn = () =>
  page
    .locator(".phase-turn")
    .innerText()
    .then((t) => Number(/Tour (\d+)/.exec(t)?.[1] ?? 0))
    .catch(() => 0);
for (let i = 0; i < 300 && !(await page.locator(".gameover").count()) && (await turn()) < 3; i++) {
  await page.waitForTimeout(150);
  if (await page.getByRole("dialog").count()) {
    // Choice with a suggestion (options, or permanents on the battlefield): suggestion, then confirmation.
    const suggest = page.getByRole("dialog").getByRole("button", { name: "Suggestion" });
    if (await suggest.count()) {
      await suggest.click({ timeout: 1000 }).catch(() => {});
      await page
        .getByRole("dialog")
        .locator(".btn.primary:not([disabled])")
        .last()
        .click({ timeout: 1000 })
        .catch(() => {});
      continue;
    }
    // Discard (maximum hand size): the first cards, then confirmation.
    const title = await page
      .getByRole("dialog")
      .locator("h2")
      .innerText({ timeout: 1000 })
      .catch(() => "");
    if (/Défaussez/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      const cards = page.getByRole("dialog").locator(".hand-picker .card");
      for (let k = 0; k < n; k++) await cards.nth(k).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Valider/ })
        .click()
        .catch(() => {});
      continue;
    }
    await page
      .getByRole("dialog")
      .locator(".btn.primary, .btn.choice")
      .first()
      .click({ force: true })
      .catch(() => {});
    continue;
  }
  const t = page.locator(".glow-target").first();
  if (await t.count()) {
    await t.click({ force: true });
    continue;
  }
  const main = page.locator(".main-button");
  if (await main.isDisabled()) continue;
  await main.click({ timeout: 3000 }).catch(() => {});
}
await page.screenshot({ path: join(OUT, "03-game.png") });
check((await page.locator(".battlefield").count()) >= 2, "game started with the imported deck");
check((await turn()) >= 3 || (await page.locator(".gameover").count()) > 0, "game played up to turn 3");
console.log(errors.length ? `Page errors:\n${errors.join("\n")}` : "No page error.");
// The link opened in another browser (a scanned QR code): the import window, filled in, creates the same deck.
{
  const other = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p2 = await other.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.goto(link);
  await p2.locator(".decklist-input").waitFor({ timeout: 15_000 });
  check((await p2.locator(".decklist-input").inputValue()).includes("Name Test importé"), "link: import window filled in");
  check(!(await p2.evaluate(() => location.hash)), "link: the fragment is cleared");
  await p2.getByRole("button", { name: "Créer un nouveau deck" }).click();
  await p2.waitForTimeout(500);
  check((await p2.locator(".deck-name-input").inputValue()) === "Test importé", "link: deck created with its name");
  check((await p2.locator(".deck-tabs").innerText()).includes("60"), "link: 60 cards");
  await other.close();
}
await browser.close();
