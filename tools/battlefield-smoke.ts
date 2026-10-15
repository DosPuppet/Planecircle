/**
 * End-to-end test of a crowded battlefield (MTGA-style layout, board/layout.ts): full boards are put into play by the
 * dev-mode sandbox (see client/src/protocol.ts), then the rows, the token piles, the lines, the absence of clipped
 * cards and the attack of a token from a pile are checked. Screenshots in test-results/battlefield/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";

const OUT = "test-results/battlefield";
mkdirSync(OUT, { recursive: true });

type Side = { cards?: string[]; tokens?: [number, string][]; attach?: [string, string, string?][] };
/** Access to the store exposed in dev mode (client/src/main.tsx). */
type DevWindow = {
  __mtgx: {
    getState(): {
      startGame(deck: [number, string][], ais: [number, string][][], sandbox: Record<string, Side>): void;
      view: {
        viewer: string;
        pending: { kind: string; player: string } | null;
        battlefield: { id: string; types: string[]; attachedTo: string | null; controller: string }[];
      } | null;
    };
  };
};

const DECK: [number, string][] = [[60, "Forest"]];
const repeat = (n: number, name: string) => Array<string>(n).fill(name);
const ME: Side = {
  cards: [
    "Llanowar Elves",
    "Serra Angel",
    "Shivan Dragon",
    "Savannah Lions",
    "Elvish Archdruid",
    "Gigantosaurus",
    // Enchantments before the artifacts: the display must still place them after.
    "Omniscience",
    "Thousand-Year Storm",
    "Fishing Pole",
    "Cultivator's Caravan",
    "Ajani, Caller of the Pride",
    "Chandra, Flameshaper",
    "Kaito, Cunning Infiltrator",
    ...repeat(5, "Forest"),
    ...repeat(3, "Plains"),
  ],
  tokens: [
    [12, "Rabbit"],
    [3, "Goblin"],
    [5, "Treasure"],
  ],
  // Attached Equipment, and an Aura on an opposing creature.
  attach: [
    ["Swiftfoot Boots", "Serra Angel"],
    ["Pacifism", "Brazen Scourge", "p2"],
  ],
};
const CROWDED: Side = {
  cards: [
    ...repeat(8, "Llanowar Elves"),
    ...repeat(6, "Savannah Lions"),
    ...repeat(5, "Courageous Goblin"),
    ...repeat(4, "Dwynen's Elite"),
    ...repeat(4, "Brazen Scourge"),
    "Vivien Reid",
    "Liliana, Dreadhorde General",
    "Banner of Kinship",
    ...repeat(7, "Forest"),
  ],
  tokens: [
    [6, "Soldier"],
    [4, "Food"],
  ],
  attach: [["Quick-Draw Katana", "Savannah Lions"]],
};
const LIGHT: Side = {
  cards: [...repeat(6, "Llanowar Elves"), "Omniscience", "Fishing Pole", ...repeat(5, "Forest")],
  tokens: [
    [5, "Goblin"],
    [2, "Treasure"],
  ],
};

const failures: string[] = [];
const errors: string[] = [];
function check(ok: boolean, label: string, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAILED"}: ${label}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failures.push(label);
}

async function open(viewport: { width: number; height: number }, sandbox: Record<string, Side>, ais = 1): Promise<Page> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173/");
  await page.evaluate(
    ([deck, sb, n]) => (window as unknown as DevWindow).__mtgx.getState().startGame(deck, Array(n).fill(deck), sb),
    [DECK, sandbox, ais] as const,
  );
  await page.getByRole("button", { name: "Garder" }).click({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  return page;
}

/** Board measurements: cards clipped by their zone, token piles, lines per row, place of the support permanents. */
async function audit(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const zones = [...document.querySelectorAll(".battlefield")];
    return {
      clipped: zones.map((bf) => {
        const z = bf.getBoundingClientRect();
        return [...bf.querySelectorAll(".perm > .card-slot")].filter((c) => {
          const b = c.getBoundingClientRect();
          return b.left < z.left - 1 || b.right > z.right + 1;
        }).length;
      }),
      stacks: [...document.querySelectorAll(".battlefield.me .token-count")].map((e) => e.textContent),
      lines: zones.map((bf) => [...bf.querySelectorAll(".perm-row")].map((row) => row.querySelectorAll(".perm-line").length)),
      /** Placement from the MTGA audit (see the plan): creatures in front, nothing alive behind, planeswalkers apart. */
      placement: (() => {
        const view = (window as unknown as DevWindow).__mtgx.getState().view;
        const objs = new Map(view?.battlefield.map((o) => [o.id, o]) ?? []);
        const problems: string[] = [];
        // No named function here: tsx would inject __name, unknown in the page.
        for (const el of document.querySelectorAll(".perm-row.front .perm > [data-oid]"))
          if (!(objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Creature"))
            problems.push(`front: ${(objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).join(" ")}`);
        for (const el of document.querySelectorAll(".perm-row.back .perm > [data-oid]"))
          if (
            (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Creature") ||
            (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Planeswalker")
          )
            problems.push(`back: ${(objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).join(" ")}`);
        // Planeswalkers: in their own zone, to the right of all the rows of their side.
        for (const bf of document.querySelectorAll(".battlefield")) {
          const rowsRight = Math.max(
            0,
            ...[...bf.querySelectorAll(".bf-rows .perm > .card-slot")].map((e) => e.getBoundingClientRect().right),
          );
          for (const el of bf.querySelectorAll(".perm > [data-oid]")) {
            if (
              !(objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Planeswalker") ||
              (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Creature")
            )
              continue;
            if (!el.closest(".walker-zone")) problems.push("planeswalker outside its zone");
            else if (el.getBoundingClientRect().left < rowsRight) problems.push("planeswalker not to the right of the rows");
          }
        }
        // Back row: lands, then artifacts, then enchantments.
        for (const bf of document.querySelectorAll(".battlefield")) {
          const ranks = [...bf.querySelectorAll(".perm-row.back .perm > [data-oid]")].map((el) =>
            (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Land")
              ? 0
              : (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Artifact")
                ? 1
                : (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Enchantment")
                  ? 2
                  : 3,
          );
          if (ranks.some((r, k) => k > 0 && r < (ranks[k - 1] as number))) problems.push(`back order ${ranks.join("")}`);
        }
        // Attached objects: rendered with their host, never in a row.
        for (const o of view?.battlefield ?? []) {
          if (!o.attachedTo) continue;
          const el = document.querySelector(`[data-oid="${o.id}"]`);
          if (!el?.closest(".attachment")) problems.push(`attached outside its host: ${o.id}`);
        }
        return problems;
      })(),
      /** Width of the cards of the front row, per zone (set by fitBattlefield). */
      frontW: zones.map((bf) => Math.round(Number.parseFloat((bf as HTMLElement).style.getPropertyValue("--card-w")) || 0)),
      /** Battlefield art cards show the Scryfall art crop (PLAN-V). */
      artCrops: [...document.querySelectorAll(".battlefield .perm .card.art-card img")].filter((i) =>
        (i as HTMLImageElement).src.includes("/art_crop/"),
      ).length,
      supportInBack: document.querySelectorAll(".battlefield.me .perm-row.back .slot.block-start").length,
    };
  });
  console.log(label, JSON.stringify(r));
  check(
    r.placement.length === 0,
    `${label}: MTGA placement (creatures in front; lands, artifacts then enchantments; planeswalkers on the right; attachments on their host)`,
    r.placement,
  );
  check(
    r.clipped.every((n) => n === 0),
    `${label}: no clipped card`,
    r.clipped,
  );
  return r;
}

// 1. Crowded duel, 1600×900: piles, rows, second line for the opponent.
let page = await open({ width: 1600, height: 900 }, { p1: ME, p2: CROWDED });
await page.screenshot({ path: `${OUT}/1-duel-1600.png` });
let r = await audit(page, "duel 1600");
check(r.stacks.includes("×12") && r.stacks.includes("×5"), "identical tokens grouped (×12, ×5)", r.stacks);
check(!r.stacks.includes("×3"), "3 identical tokens are not grouped", r.stacks);
check(r.supportInBack === 1, "artifacts and enchantments in the back row, apart from the lands", r.supportInBack);
check(r.artCrops > 10, "battlefield art cards show the art crop", r.artCrops);

check((r.lines[0]?.[1] ?? 0) >= 2, "the crowded opponent goes over several lines", r.lines);
check(
  (r.frontW[1] ?? 0) > (r.frontW[0] ?? 0) + 10,
  "each side has its own size: your cards stay larger than those of the crowded opponent",
  r.frontW,
);

// 2. Attack with one token at a time from the pile.
const pending = () =>
  page.evaluate(() => {
    const v = (window as unknown as DevWindow).__mtgx.getState().view;
    return v?.pending ? `${v.pending.kind}|${v.pending.player === v.viewer}` : "";
  });
for (let i = 0; i < 80 && (await pending()) !== "declareAttackers|true"; i++) {
  const main = page.locator(".main-button");
  if (!(await main.isDisabled())) await main.click().catch(() => {});
  await page.waitForTimeout(300);
}
check((await pending()) === "declareAttackers|true", "declare attackers reached");
// Several attack targets (player and planeswalkers): MTGA style, click the creature, then its target.
check(
  (await page.locator(".battlefield.opp .walker-zone .glow-target").count()) === 0,
  "without an attacker aiming, the opposing planeswalkers are not highlighted",
);
const stackTop = (n: number) =>
  page.locator(".battlefield.me .token-stack", { hasText: `×${n}` }).locator(":scope > .perm .card");
await stackTop(12).click();
await page.waitForTimeout(400);
check(
  (await page.locator(".battlefield.opp .walker-zone .glow-target").count()) > 0 &&
    (await page.locator(".player-bar.opp .avatar.glow-target").count()) > 0,
  "attacker aiming: opposing planeswalkers and avatar highlighted",
);
await page.locator(".player-bar.opp .avatar").first().click();
await page.waitForTimeout(400);
await stackTop(11).click();
await page.waitForTimeout(400);
await page.locator(".battlefield.opp .walker-zone .glow-target").first().click();
await page.waitForTimeout(400);
const after = await page.locator(".battlefield.me .token-count").allInnerTexts();
check(after.includes("×10"), "two clicks on the pile make two tokens attack (×12 → ×10)", after);
check(/Attaquer \(2\)/.test(await page.locator(".main-button").innerText()), "the button counts 2 attackers");
await page.screenshot({ path: `${OUT}/2-attack.png` });
// Declared: the attackers tap and lean by 17° (as on MTGA), their slot as wide as their leaning box.
await page.locator(".main-button").click();
await page.waitForTimeout(1200);
const leaning = await page.evaluate(() =>
  [...document.querySelectorAll(".battlefield.me .perm > .card-slot")]
    .map((slot) => {
      const card = slot.querySelector(".card") as HTMLElement | null;
      const m = new DOMMatrix(card ? getComputedStyle(card).transform : "none");
      return {
        deg: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI),
        ratio: (slot as HTMLElement).offsetWidth / (card?.offsetWidth || 1),
      };
    })
    .filter((x) => x.deg !== 0),
);
check(
  leaning.length > 0 && leaning.every((x) => x.deg === 17 && Math.abs(x.ratio - 1.307) < 0.03),
  "tapped attackers lean by 17° in a slot 1.31 cards wide",
  leaning,
);
await page.screenshot({ path: `${OUT}/2b-attack-declared.png` });
await page.context().browser()?.close();

// 3. Small screen.
page = await open({ width: 1280, height: 720 }, { p1: ME, p2: CROWDED });
await page.screenshot({ path: `${OUT}/3-duel-1280.png` });
await audit(page, "duel 1280");
await page.context().browser()?.close();

// 4. Four players: narrow opposing zones.
page = await open({ width: 1600, height: 900 }, { p1: ME, p2: LIGHT, p3: LIGHT, p4: CROWDED }, 3);
await page.screenshot({ path: `${OUT}/4-four-players.png` });
r = await audit(page, "4 players");
check((r.lines[2]?.[1] ?? 0) > 2, "narrow and crowded opposing zone: more than 2 lines rather than clipped cards", r.lines);
await page.context().browser()?.close();

check(errors.length === 0, "no page error", errors);
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
