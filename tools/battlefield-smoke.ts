/**
 * End-to-end test of a crowded battlefield (MTGA-style layout, board/layout.ts): full boards are put into play by the
 * dev-mode sandbox (see client/src/protocol.ts), then the rows, the token piles, the lines, the absence of clipped
 * cards and the attack of a token from a pile are checked. Screenshots in test-results/battlefield/.
 *
 * Requires: `npm run dev` running (restarted after an engine change).
 */
import { mkdirSync } from "node:fs";
import type { GameView, ObjectView } from "@mtgx/engine";
import { chromium, type Page } from "playwright";
import { type GlowState, permanentGlow } from "../packages/client/src/board/glows";
import { battlefieldModel, fitBattlefield } from "../packages/client/src/board/layout";
import { placeBattlefield } from "../packages/client/src/board3d/placement";
import { boardPick } from "../packages/client/src/prompts/boardChoice";

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
        // Planeswalkers: in their own zone, to the right of all the rows of their side. Compared in layout coordinates
        // (offsetLeft): the tilted table (PLAN-V) skews the projected boxes. No named function (tsx __name).
        for (const bf of document.querySelectorAll(".battlefield")) {
          let rowsRight = 0;
          for (const e of bf.querySelectorAll(".bf-rows .perm > .card-slot")) {
            let x = (e as HTMLElement).offsetWidth;
            for (let p = e as HTMLElement | null; p; p = p.offsetParent as HTMLElement | null) x += p.offsetLeft;
            rowsRight = Math.max(rowsRight, x);
          }
          for (const el of bf.querySelectorAll(".perm > [data-oid]")) {
            if (
              !(objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Planeswalker") ||
              (objs.get((el as HTMLElement).dataset.oid ?? "")?.types ?? []).includes("Creature")
            )
              continue;
            let left = 0;
            for (let p = el as HTMLElement | null; p; p = p.offsetParent as HTMLElement | null) left += p.offsetLeft;
            if (!el.closest(".walker-zone")) problems.push("planeswalker outside its zone");
            else if (left < rowsRight) problems.push("planeswalker not to the right of the rows");
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
      /** Graphics "full" (default with a mouse): the battlefields lean back (PLAN-V). */
      tilted: getComputedStyle(document.querySelector(".battlefield.me") as Element).transform !== "none",
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

/**
 * The 3D board's placement (PLAN-W, board3d/placement.ts) against the DOM: for each battlefield, the center of every
 * card, computed from the same view and zone size, within 2 px of its `.card-slot` in layout coordinates (offsets, which
 * ignore the tilt).
 */
async function matchesPlacement(page: Page, label: string) {
  const dom = await page.evaluate(() => {
    const s = (window as unknown as { __mtgx: { getState(): Record<string, unknown> } }).__mtgx.getState();
    const zones = [...document.querySelectorAll(".battlefield")].map((bf) => {
      const centers: Record<string, [number, number]> = {};
      for (const el of bf.querySelectorAll<HTMLElement>(".card-slot[data-oid]")) {
        let x = el.offsetWidth / 2;
        let y = el.offsetHeight / 2;
        for (let e: HTMLElement | null = el; e && e !== bf; e = e.offsetParent as HTMLElement | null) {
          x += e.offsetLeft;
          y += e.offsetTop;
        }
        centers[el.dataset.oid as string] = [x, y];
      }
      return { mine: bf.classList.contains("me"), w: bf.clientWidth, h: bf.clientHeight, centers };
    });
    const pick = [
      "view",
      "casting",
      "attackers",
      "blocks",
      "selectedBlocker",
      "aimingAttacker",
      "selection",
      "resolving",
      "attackTargets",
    ];
    return { zones, state: JSON.parse(JSON.stringify(Object.fromEntries(pick.map((k) => [k, s[k]])))) };
  });
  const st = dom.state as Pick<GlowState, "casting" | "attackers" | "blocks" | "selectedBlocker" | "selection" | "resolving"> & {
    view: GameView;
    aimingAttacker: string | null;
    attackTargets: Record<string, string>;
  };
  const view = st.view;
  const acts = view.pending?.kind === "priority" && view.pending.player === view.viewer ? (view.pending.actions ?? []) : [];
  const glow = permanentGlow({
    view,
    acts,
    pick: boardPick(view),
    casting: st.casting,
    attackers: st.attackers,
    blocks: st.blocks,
    selectedBlocker: st.selectedBlocker,
    aiming: st.aimingAttacker,
    selection: st.selection,
    resolving: st.resolving,
  });
  const blocked = new Set(Object.values(st.blocks));
  const uiKey = (o: ObjectView) => `${glow(o) ?? ""}|${blocked.has(o.id) ? "b" : ""}|${st.attackTargets[o.id] ?? ""}`;
  const players = [view.viewer, ...view.opponents];
  const off: string[] = [];
  let compared = 0;
  for (const zone of dom.zones) {
    const player = zone.mine ? view.viewer : (players.find((p) => p !== view.viewer) as string);
    const m = battlefieldModel(view, player, uiKey);
    const fit = fitBattlefield(zone.w, zone.h, m.front, m.back, m.walkers, m.depth);
    for (const p of placeBattlefield(m, fit, zone, zone.mine, (o) => o.attacking || st.attackers.includes(o.id))) {
      const c = zone.centers[p.id];
      if (!c || p.kind === "shadow") continue;
      compared++;
      if (Math.abs(c[0] - p.x) > 2 || Math.abs(c[1] - p.y) > 2)
        off.push(`${p.obj.name} (${p.kind}): DOM ${c.map(Math.round)} 3D ${[p.x, p.y].map(Math.round)}`);
    }
  }
  check(
    compared > 10 && off.length === 0,
    `${label}: the 3D placement matches the DOM within 2 px (${compared} cards)`,
    off.slice(0, 6),
  );
}

// 1. Crowded duel, 1600×900: piles, rows, second line for the opponent.
let page = await open({ width: 1600, height: 900 }, { p1: ME, p2: CROWDED });
await page.screenshot({ path: `${OUT}/1-duel-1600.png` });
let r = await audit(page, "duel 1600");
await matchesPlacement(page, "duel 1600");
check(r.stacks.includes("×12") && r.stacks.includes("×5"), "identical tokens grouped (×12, ×5)", r.stacks);
check(!r.stacks.includes("×3"), "3 identical tokens are not grouped", r.stacks);
check(r.supportInBack === 1, "artifacts and enchantments in the back row, apart from the lands", r.supportInBack);
check(r.artCrops > 10, "battlefield art cards show the art crop", r.artCrops);
check(r.tilted, "graphics full: the table is tilted (perspective)", r.tilted);

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
