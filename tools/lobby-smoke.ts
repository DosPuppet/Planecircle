/**
 * Interface test of the online room: the deck is chosen in the room. A creates a duel without choosing a deck, B joins
 * through the invitation link; each chooses their deck and says they are ready (the game starts only then). After the
 * game, B goes back to the room, takes another deck and gets ready; A asks for the rematch: the next match starts with
 * B's new deck. Then a three-seat room with an AI: the AI is ready at once. Screenshots in test-results/lobby/.
 *
 * Requires: `npm run server` (restarted after a change to the server) and `npm run dev` running.
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "playwright";

const OUT = "test-results/lobby";
const BASE = "http://localhost:5173";
mkdirSync(OUT, { recursive: true });

type DeckLine = [number, string, string?];
type DevWindow = {
  __mtgx: {
    getState(): {
      decide(d: { type: "concede" }): void;
      online: { status: string; deck?: { main: DeckLine[] }; players: { name: string; ready: boolean }[] } | null;
    };
  };
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

async function open(browser: Browser, name: string, url: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(url);
  return page;
}

const online = (page: Page) => page.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().online);
const seatStates = (page: Page) => page.locator("[data-testid=online-seats] li .seat-state").allInnerTexts();

/** Mulligans are decided one after the other: keep as soon as asked, on both sides. */
async function keepAll(pages: Page[]): Promise<void> {
  const kept = new Set<Page>();
  for (let i = 0; i < 150 && kept.size < pages.length; i++) {
    for (const p of pages) {
      const keep = p.getByRole("button", { name: "Garder" });
      if (!kept.has(p) && (await keep.count())) {
        await keep.click().catch(() => {});
        kept.add(p);
      }
    }
    await pages[0]?.waitForTimeout(200);
  }
  if (kept.size < pages.length) throw new Error('mulligan: "Garder" (keep) never offered');
}

const browser = await chromium.launch();

// 1. A creates a duel: the room, without a deck chosen yet.
const a = await open(browser, "A", `${BASE}/?fast`);
await a.getByRole("button", { name: "Contre un joueur" }).click();
await a.getByPlaceholder("Pseudo visible par votre adversaire").fill("Alice");
check((await a.locator(".online-card .deck-pick").count()) === 0, "no deck to choose before creating the room");
await a.getByRole("button", { name: "Créer", exact: true }).click();
const code = (await a.getByTestId("room-code").innerText({ timeout: 10_000 })).trim();
check(/^[A-Z0-9]{6}$/.test(code), `room created (code ${code})`);
check(
  JSON.stringify(await seatStates(a)) === JSON.stringify(["choisit son deck"]),
  "A in the room, choosing a deck",
  await seatStates(a),
);
check(await a.getByTestId("room-ready").isEnabled(), "a legal deck is preselected: Ready is possible");
await a.screenshot({ path: `${OUT}/1-room-A.png` });

// 2. A is ready; B joins with the link and sees A ready, B still choosing.
await a.getByTestId("room-ready").click();
await a.getByTestId("room-unready").waitFor({ timeout: 5000 });
const b = await open(browser, "B", `${BASE}/?fast&room=${code}`);
await b.getByPlaceholder("Pseudo visible par votre adversaire").fill("Bob");
await b.getByRole("button", { name: "Rejoindre" }).click();
await b.getByTestId("online-seats").waitFor({ timeout: 10_000 });
await b.waitForTimeout(500);
check(
  JSON.stringify(await seatStates(b)) === JSON.stringify(["prêt", "choisit son deck"]),
  "B sees Alice ready and B still choosing",
  await seatStates(b),
);
check((await a.locator(".gameover, .battlefield").count()) === 0, "no game while B has not chosen");
await b.screenshot({ path: `${OUT}/2-room-B.png` });

// 3. B is ready: the game starts on both sides.
const firstDeckB = (await online(b))?.deck?.main;
await b.getByTestId("room-ready").click();
await keepAll([a, b]);
check((await a.locator(".player-bar.opp .player-name").innerText()).includes("Bob"), "the game started (A sees Bob)");
const playedB = (await online(b))?.deck?.main ?? [];
check(playedB.length > 0, "B plays the deck chosen in the room");

// 4. A concedes; B goes back to the room and takes another deck.
await a.evaluate(() => (window as unknown as DevWindow).__mtgx.getState().decide({ type: "concede" }));
await b.locator(".gameover").waitFor({ timeout: 15_000 });
await a.locator(".gameover").waitFor({ timeout: 15_000 });
await b.getByTestId("change-deck").click();
await b.getByRole("heading", { name: "Prochain match" }).waitFor({ timeout: 5000 });
check((await b.getByTestId("room-code").count()) === 0, "between two matches: the room, without the code to share");
await b.locator(".online-room .deck-summary").click();
await b.locator(".deck-picker .deck-tile:not(.on):not(.invalid)").first().click();
await b.screenshot({ path: `${OUT}/3-next-match-B.png` });
await b.getByTestId("room-ready").click();
await a.getByText("Bob propose une revanche.").waitFor({ timeout: 5000 });
await a.screenshot({ path: `${OUT}/4-rematch-offered-A.png` });

// 5. A asks for the rematch: the next match starts with B's new deck.
await a.getByRole("button", { name: "Revanche" }).click();
await keepAll([a, b]);
const newB = (await online(b))?.deck?.main ?? [];
check(newB.length > 0 && JSON.stringify(newB) !== JSON.stringify(playedB), "the rematch starts with B's new deck", {
  firstDeckB: firstDeckB?.length,
  newB: newB.length,
});
check((await online(a))?.status === "playing", "same room, new match");
await a.screenshot({ path: `${OUT}/5-rematch-A.png` });
await a.close();
await b.close();

// 6. Three seats, one AI: the AI is ready at once; a free seat is shown.
const c = await open(browser, "C", `${BASE}/?fast`);
await c.getByRole("button", { name: "Contre un joueur" }).click();
await c.getByPlaceholder("Pseudo visible par votre adversaire").fill("Chloé");
await c.locator(".online-card .ai-count").filter({ hasText: "Joueurs" }).getByRole("button", { name: "3" }).click();
await c.locator(".online-card .ai-count").filter({ hasText: "dont IA" }).getByRole("button", { name: "1" }).click();
await c.getByRole("button", { name: "Créer", exact: true }).click();
await c.getByTestId("online-seats").waitFor({ timeout: 10_000 });
await c.waitForTimeout(500);
const states = await seatStates(c);
check(JSON.stringify(states) === JSON.stringify(["choisit son deck", "IA"]), "AI seat shown ready (AI)", states);
check((await c.locator("[data-testid=online-seats] li.free").count()) === 1, "one free seat shown");
await c.screenshot({ path: `${OUT}/6-three-seats.png` });

check(errors.length === 0, "no page error", errors);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("lobby-smoke: all good");
