/**
 * End-to-end test of Commander (PLAN-E, E5): a four-player game against three AIs, started by the dev-mode store
 * (`window.__mtgx`, simple Foundations decks: a cheap commander and basic lands). Checks the 40 life, one commander
 * chip per player, the commander at the end of the hand (castable from the command zone), its entering the
 * battlefield, and takes screenshots (`test-results/commander/`).
 *
 * Requires: `npm run dev` running. Usage: npx tsx tools/commander-smoke.ts [screenshot-dir] [maxActions]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "test-results/commander";
const MAX = Number(process.argv[3] ?? 300);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto("http://localhost:5173/?fast");
await page.getByRole("button", { name: "Jouer contre l'IA" }).waitFor({ timeout: 30_000 });
// The Commander format is offered on the home screen.
await page.getByRole("button", { name: "Commander", exact: true }).first().click();
// The Commander precons, sorted by estimated bracket (badge on the art), in the window that changes your deck.
await page.locator(".deck-summary").first().click();
await page
  .locator(".deck-choice")
  .first()
  .getByRole("tab", { name: /^Commander/ })
  .click();
const brackets = await page.locator(".deck-choice").first().locator(".deck-tile .deck-bracket").allInnerTexts();
// Bracket declared by the source ("Bracket 2") or estimated ("Bracket ≈ 3", "≈ 1–2" ranked at 1.5).
const ranks = brackets.map((b) => {
  const m = /Bracket (≈ )?(\d)(–\d)?/.exec(b.trim());
  return m ? Number(m[2]) + (m[3] ? 0.5 : 0) : Number.NaN;
});
if (brackets.length < 3 || ranks.some((r, i) => Number.isNaN(r) || (i > 0 && r < (ranks[i - 1] ?? 0))))
  errors.push(`Commander decks not sorted by bracket: ${brackets.join(", ")}`);
await page.screenshot({ path: join(OUT, "01-home-commander.png") });
await page.keyboard.press("Escape");

// Deck builder: the Edgar Markov precon, validated in Commander (100 cards, Game Changers, estimated bracket).
await page.getByRole("button", { name: "Mes decks" }).click();
await page.locator(".deck-select").selectOption("cmd-edgar-markov");
const summary = await page.locator("[data-testid=commander-summary]").innerText({ timeout: 10_000 });
if (!/Game Changers : 5 · bracket estimé 4\+ · déclaré 4/.test(summary)) errors.push(`deck builder: "${summary}"`);
const deckTab = await page.locator(".deck-tabs button").first().innerText();
if (!/100\s*\/\s*100/.test(deckTab)) errors.push(`deck builder: deck tab "${deckTab}"`);
await page.screenshot({ path: join(OUT, "01b-deck-builder-commander.png") });
await page.getByRole("button", { name: "← Accueil" }).click();
await page.getByRole("button", { name: "Jouer contre l'IA" }).waitFor({ timeout: 10_000 });

// Four-player game: Giada (W) against Fynn (G), Kellan (R) and Zul Ashur (B), decks of basic lands and creatures.
await page.evaluate(() => {
  const w = window as unknown as {
    __mtgx: { getState: () => { startGame: (...args: unknown[]) => void } };
  };
  w.__mtgx.getState().startGame(
    [
      [55, "Plains"],
      [44, "Savannah Lions"],
    ],
    [
      [
        [55, "Forest"],
        [44, "Llanowar Elves"],
      ],
      [
        [55, "Mountain"],
        [44, "Fanatical Firebrand"],
      ],
      [[99, "Swamp"]],
    ],
    undefined,
    "beginner",
    undefined,
    {
      player: [[1, "Giada, Font of Hope"]],
      ai: [[[1, "Fynn, the Fangbearer"]], [[1, "Kellan, Planar Trailblazer"]], [[1, "Zul Ashur, Lich Lord"]]],
    },
  );
});
await page.getByRole("dialog").waitFor({ timeout: 15_000 });
await page.getByRole("button", { name: "Garder" }).click();

let shots = 2;
const shot = async (name: string) => page.screenshot({ path: join(OUT, `${String(shots++).padStart(2, "0")}-${name}.png`) });

// Start of the game: 40 life and one commander chip per player.
await page.locator("[data-testid=commander-chip]").first().waitFor({ timeout: 15_000 });
const chips = await page.locator("[data-testid=commander-chip]").count();
if (chips !== 4) errors.push(`${chips} commander chip(s) instead of 4`);
const life = (await page.locator(".player-bar.me .avatar").innerText()).replace(/\D+/g, "");
if (!life.startsWith("40")) errors.push(`starting life: ${life} instead of 40`);
await shot("start");

let castCommander = false;
let commanderInPlay = false;
let lastProgress = "";
let stuck = 0;
const TRACE = !!process.env.TRACE;
for (let i = 0; i < MAX; i++) {
  await page.waitForTimeout(120);
  if (TRACE)
    console.log(
      i,
      new Date().toISOString().slice(11, 19),
      await page
        .locator(".main-button")
        .innerText()
        .catch(() => "?"),
    );
  if (await page.locator(".gameover").count()) {
    await shot("end");
    console.log("Game over:", await page.locator(".gameover h2").innerText());
    break;
  }
  if (await page.locator("[data-testid=eliminated]").count()) {
    await shot("eliminated");
    console.log("Player eliminated: the game goes on without them.");
    break;
  }
  const myChip = await page
    .locator(".player-bar.me [data-testid=commander-chip]")
    .innerText()
    .catch(() => "");
  if (!commanderInPlay && /en jeu/.test(myChip)) {
    commanderInPlay = true;
    await shot("commander-in-play");
  }
  if (commanderInPlay && i > 120) break;

  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const suggest = dialog.getByRole("button", { name: "Suggestion" });
    if (await suggest.count()) {
      await suggest.click({ timeout: 1000 }).catch(() => {});
      await dialog
        .locator(".btn.primary:not([disabled])")
        .last()
        .click({ timeout: 1000 })
        .catch(() => {});
      continue;
    }
    const title = await dialog
      .locator("h2")
      .innerText({ timeout: 1000 })
      .catch(() => null);
    if (title === null) continue;
    // 903.9a: return the commander to the command zone.
    if (/zone de commandement/.test(title)) {
      await shot("commander-return");
      await dialog
        .getByRole("button", { name: "Oui" })
        .click({ timeout: 2000 })
        .catch(() => {});
      continue;
    }
    if (/Défaussez|au-dessous/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      const cards = dialog.locator(".hand-picker .card");
      for (let k = 0; k < n; k++) await cards.nth(k).click();
      await dialog.getByRole("button", { name: /Valider/ }).click();
    } else
      await dialog
        .locator(".btn.choice")
        .first()
        .click({ timeout: 3000 })
        .catch(() => {});
    continue;
  }
  const target = page.locator(".glow-target").first();
  if (await target.count()) {
    await target.click({ force: true, timeout: 3000 }).catch(() => {});
    continue;
  }
  const main = page.locator(".main-button");
  const label = (await main.innerText().catch(() => "")).trim();
  if (await main.isDisabled().catch(() => true)) continue;
  if (label === "Attaquer avec tous") {
    await main.click({ timeout: 3000 }).catch(() => {});
    await main.click({ timeout: 3000 }).catch(() => {});
    continue;
  }
  // The commander, at the end of the hand with the "Commandant" tag: cast as soon as it is playable.
  const commanderCard = page
    .locator(".hand > *", { has: page.locator(".zone-tag", { hasText: "Commandant" }) })
    .locator(".glow-playable")
    .first();
  if (!castCommander && (await commanderCard.count())) {
    await shot("commander-castable");
    await commanderCard.hover({ force: true });
    await commanderCard.click({ force: true }).catch(() => {});
    castCommander = true;
    continue;
  }
  const playable = page.locator(".hand .glow-playable");
  // Under load, a click on a card may have no effect: after a few tries without progress (same button, same hand,
  // same log), go through the main button instead of clicking the same card again until the end of the loop.
  const progress = `${label}|${await page.locator(".hand > *").count()}|${await page.locator(".log .log-line").count()}`;
  stuck = progress === lastProgress ? stuck + 1 : 0;
  lastProgress = progress;
  if ((await playable.count()) && !/Résoudre/.test(label) && stuck < 4) {
    await playable.first().hover({ force: true });
    await page.waitForTimeout(150);
    await playable.first().click({ force: true });
    continue;
  }
  await main.click({ timeout: 3000 }).catch(() => {});
}

if (!castCommander) errors.push("the commander was never offered at the end of the hand");
if (!commanderInPlay) errors.push("the commander never entered the battlefield");
await shot("stop");
console.log(errors.length ? `Errors:\n${errors.join("\n")}` : "ok: no page error");
await browser.close();
if (errors.length) process.exit(1);
