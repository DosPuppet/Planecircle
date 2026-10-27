/**
 * End-to-end test of online play: two browsers (separate contexts) play a duel through the server.
 * A creates the game, B joins through the invitation link; each chooses their deck in the room (the preselected one) and
 * says they are ready; both play by clicking, then the rope, the resumption after a page reload, the end of the game and
 * the rematch are checked. Screenshots in test-results/online/.
 *
 * Requires: `npm run server` (MTGX_DECISION_MS=45000 advised) and `npm run dev` running.
 * Usage: npm run online-smoke -- [maxRounds] [--base http://127.0.0.1:8787]
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright";

const OUT = "test-results/online";
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
/** URL of the app: dev server (default) or production server, possibly behind nginx. */
const BASE = (baseIdx >= 0 ? args.splice(baseIdx, 2)[1] : undefined) ?? "http://localhost:5173";
const MAX_ROUNDS = Number(args[0] ?? 600);
mkdirSync(OUT, { recursive: true });

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

async function open(browser: Browser, name: string, url: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  // Content policy violations (server CSP): reported in the console only.
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(`${name}: ${m.text()}`);
  });
  await page.goto(url);
  return page;
}

/** One "human" game step: choice dialogs, targets, playable cards, main button. */
async function step(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    const title = await dialog
      .locator("h2")
      .innerText()
      .catch(() => "");
    if (/Victoire|Défaite|nul/.test(title)) return;
    if (/Défaussez|au-dessous/.test(title)) {
      const n = Number(/(\d+) carte/.exec(title)?.[1] ?? 1);
      for (let k = 0; k < n; k++)
        await dialog
          .locator(".hand-picker .card")
          .nth(k)
          .click({ force: true })
          .catch(() => {});
    }
    const primary = dialog.locator(".modal-actions .btn.primary:not([disabled])");
    const choice = dialog.locator(".btn.choice");
    if (await primary.count())
      await primary
        .first()
        .click({ force: true })
        .catch(() => {});
    else if (await choice.count())
      await choice
        .first()
        .click({ force: true })
        .catch(() => {});
    else
      await dialog
        .locator(".card")
        .first()
        .click({ force: true })
        .catch(() => {});
    return;
  }
  const target = page.locator(".glow-target").first();
  if (await target.count()) {
    await target.click({ force: true }).catch(() => {});
    return;
  }
  const main = page.locator(".main-button");
  const label = await main.innerText().catch(() => "");
  const playable = page.locator(".hand .glow-playable");
  if ((await playable.count()) && !/Résoudre|Attaquer|Bloquer|Pas d/.test(label) && Math.random() < 0.7) {
    await playable
      .first()
      .hover({ force: true })
      .catch(() => {});
    await playable
      .first()
      .click({ force: true })
      .catch(() => {});
    return;
  }
  // "Attaquer avec tous" (attack with all) selects all the creatures; the next press (below) confirms.
  if (/Attaquer avec tous/.test(label)) await main.click({ timeout: 2000 }).catch(() => {});
  if (!(await main.isDisabled().catch(() => true))) await main.click({ timeout: 2000 }).catch(() => {});
}

const over = (page: Page) => page.locator(".gameover").count();

const browser = await chromium.launch();
const a = await open(browser, "A", `${BASE}/`);
await a.getByRole("button", { name: "Contre un joueur" }).click();
await a.getByPlaceholder("Pseudo visible par votre adversaire").fill("Alice");
await a.getByRole("button", { name: "Créer", exact: true }).click();
const code = (await a.getByTestId("room-code").innerText({ timeout: 10_000 })).trim();
check(/^[A-Z0-9]{6}$/.test(code), `room created (code ${code})`);
await a.getByTestId("room-ready").click();
await a.screenshot({ path: `${OUT}/1-waiting.png` });

const b = await open(browser, "B", `${BASE}/?room=${code}`);
await b.getByPlaceholder("Pseudo visible par votre adversaire").fill("Bob");
check((await b.getByLabel("Code du salon").inputValue()) === code, "the invitation link prefills the code");
await b.getByRole("button", { name: "Rejoindre" }).click();
await b.getByTestId("room-ready").click({ timeout: 10_000 });

/** Mulligans are decided one after the other (the first player first): keep as soon as asked. */
async function keepBoth(): Promise<void> {
  const kept = new Set<Page>();
  for (let i = 0; i < 100 && kept.size < 2; i++) {
    for (const p of [a, b]) {
      const keep = p.getByRole("button", { name: "Garder" });
      if (!kept.has(p) && (await keep.count())) {
        await keep.click().catch(() => {});
        kept.add(p);
      }
    }
    await a.waitForTimeout(200);
  }
  if (kept.size < 2) throw new Error('mulligan: "Garder" (keep) never offered');
}
await keepBoth();
await a.waitForTimeout(800);
check((await a.locator(".player-bar.opp .player-name").innerText()).includes("Bob"), "A sees Bob's nickname");
check((await b.locator(".player-bar.opp .player-name").innerText()).includes("Alice"), "B sees Alice's nickname");
await a.screenshot({ path: `${OUT}/2-start-A.png` });

// A few turns of play.
for (let i = 0; i < 8 && !(await over(a)); i++) {
  await step(a);
  await step(b);
  await a.waitForTimeout(120);
}

// Rope: let the player who must decide think until the rope (end of the 45 s).
// Who must decide: the opponent is "thinking…" (visible indicator, also in production).
const waiting = (await a.locator(".player-bar.opp .thinking").count()) ? "B" : "A";
if (!(await over(a))) {
  await a.waitForTimeout(27_000);
  check(
    (await a.locator(".rope").count()) > 0 && (await b.locator(".rope").count()) > 0,
    `rope visible on both sides (${waiting} decides)`,
  );
  await a.screenshot({ path: `${OUT}/3-rope.png` });
}

// Resumption after reloading B's page.
if (!(await over(a))) {
  await b.reload();
  await b.locator(".battlefield").first().waitFor({ timeout: 15_000 });
  check((await b.locator(".hand .card").count()) > 0, "B finds its game again (hand) after reload");
  await b.screenshot({ path: `${OUT}/4-resume-B.png` });
}

// Until the end of the game.
for (let i = 0; i < MAX_ROUNDS && !(await over(a)); i++) {
  await step(a);
  await step(b);
  await a.waitForTimeout(80);
}
const finished = (await over(a)) > 0 && (await over(b)) > 0;
check(finished, "game over on both sides");
if (finished) {
  const ta = await a.locator(".gameover h2").innerText();
  const tb = await b.locator(".gameover h2").innerText();
  check((ta === "Victoire !") !== (tb === "Victoire !") || ta === tb, `consistent results (${ta} / ${tb})`);
  await a.screenshot({ path: `${OUT}/5-end-A.png` });
  // Rematch.
  await a.getByRole("button", { name: "Revanche" }).click();
  await b.getByText("propose une revanche").waitFor({ timeout: 5000 });
  await b.getByRole("button", { name: "Revanche" }).click();
  await keepBoth();
  check(true, "rematch: new game started (hands kept on both sides)");
  await a.screenshot({ path: `${OUT}/6-rematch.png` });
}

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
