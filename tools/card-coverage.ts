/**
 * Card coverage: how many cards of a set are handled, and which mechanics are missing (to prioritize the work of
 * step 4b).
 *
 * Usage: npm run coverage [-- --set all|standard|main|<set>] [-- --list <mechanic>] [-- --missing] [-- --card "<name>"]
 *        npm run coverage -- --set FIN --text [--color W|U|B|R|G|M|C|L]
 *        npm run coverage -- --deck <id|all> [--text]   (Commander decks of `docs/commander/decks/`, PLAN-E)
 *
 * --audit: gaps between the Oracle text and the script of the handled cards (missing abilities, absent numbers).
 * --tests: share of the handled cards named in a rules test (`engine/test`, Oracle expectations), by set; with --set,
 * the list of cards never named (rares and mythics first); --meta: those of the meta decks.
 * --text: Oracle texts of the unhandled cards (all faces), to prepare a lot; --color filters by color
 * (M = multicolored, C = colorless, L = land).
 */
import { readdirSync, readFileSync } from "node:fs";
import { CARDS, isMainSet, SET_BY_CODE, SETS } from "@mtgx/cards";
import type { CardDef } from "@mtgx/engine";
import auditBaseline from "../packages/cards/data/audit-baseline.json";
import { auditCard, issueKey } from "../packages/cards/src/audit";
import { commanderDecks } from "./commander-decks";
import { metaDecks } from "./meta-decks";

const MECHANICS: [string, RegExp][] = [
  ["aura", /^Enchant (creature|land|permanent)/m],
  ["equipment", /Equip \{/],
  ["planeswalker", /Planeswalker/],
  ["counterspell", /[Cc]ounter target/],
  ["library search", /[Ss]earch your library/],
  ["ward", /Ward/],
  ["return from the graveyard", /from (your|a) graveyard to/],
  ["copy", /[Cc]opy/],
  ["mode of a triggered ability", /When .*, choose one/],
  ["protection", /[Pp]rotection from/],
  ["tap / untap a target", /[Tt]ap target|[Uu]ntap target/],
  ["can't block / attack", /can't (block|attack)/],
  ["control change", /[Gg]ain control/],
  ["-1/-1 or other counters", /counter on|counters on/],
  ["P/T -X/-X", /gets? -\d+\/-\d+/],
  ["destroy", /[Dd]estroy (target|all|each)/],
  ["exile", /[Ee]xile target/],
];

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : undefined;
};

const cardName = arg("--card");
if (cardName !== undefined) {
  const c = Object.values(CARDS).find(
    (x) => x.name.toLowerCase() === cardName.toLowerCase() || x.fr?.name?.toLowerCase() === cardName.toLowerCase(),
  );
  if (!c) {
    console.log(`Unknown card: ${cardName}`);
    process.exit(1);
  }
  console.log(`${c.name} ${c.manaCostText} — ${c.typeLine}${c.power !== undefined ? ` ${c.power}/${c.toughness}` : ""}`);
  console.log(`${[c.text, ...(c.faceDefs ?? []).map((f) => `// ${f.name}\n${f.text}`)].join("\n")}\n`);
  console.log(`Handled: ${c.implemented ? "yes" : "no"}`);
  const { text: _t, fr: _f, image: _i, artCrop: _a, ...script } = c;
  console.log(
    JSON.stringify(
      {
        keywords: script.keywords,
        abilities: script.abilities,
        spell: script.spell,
        kicker: script.kicker,
        castOptions: script.castOptions,
        additionalCost: script.additionalCost,
        costReduction: script.costReduction,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// --deck <id|all>: the cards of a Commander deck (or of all of them): playable, in the catalog but not playable, or unknown.
const deckArg = arg("--deck");
const deckCards = deckArg === undefined ? undefined : deckCoverage(deckArg);

function deckCoverage(id: string): Set<string> {
  const decks = commanderDecks().filter((d) => id === "all" || d.id === id);
  if (!decks.length) {
    console.log(
      `Unknown Commander deck: ${id} (known: ${commanderDecks()
        .map((d) => d.id)
        .join(", ")})`,
    );
    process.exit(1);
  }
  const names = new Set<string>();
  for (const d of decks) {
    const cards = [...d.commander, ...d.main].map(([, name]) => name).filter((n) => !CARDS[n]?.supertypes.includes("Basic"));
    for (const n of cards) names.add(n);
    const ok = cards.filter((n) => CARDS[n]?.implemented).length;
    const bySet = new Map<string, number>();
    for (const n of cards.filter((x) => !CARDS[x]?.implemented)) {
      const set = CARDS[n]?.set ?? "?";
      bySet.set(set, (bySet.get(set) ?? 0) + 1);
    }
    const detail = [...bySet].map(([set, n]) => `${set} ${n}`).join(", ");
    console.log(
      `${d.name} (${d.id}): ${ok} / ${cards.length} playable cards (basic lands excluded)` +
        `${detail ? `; to do: ${detail}` : ""}${d.unknown.length ? `; unknown: ${d.unknown.join(", ")}` : ""}`,
    );
  }
  return names;
}

// --set main: main sets; --set fdn|fra|…: one set (all its cards);
// --set all (or no option): everything, with the detail by set; --set standard: cards legal in Standard.
const setArg0 = (arg("--set") ?? "").toUpperCase();
const setArg = setArg0 === "ALL" ? "" : setArg0;
const main = setArg === "MAIN";
const standard = setArg === "STANDARD";
const all = Object.values(CARDS).filter(
  (c) =>
    !c.isToken &&
    (!main || isMainSet(c)) &&
    (!standard || c.legalities?.standard === "legal") &&
    (!setArg || main || standard || c.set === setArg) &&
    (!deckCards || deckCards.has(c.name)),
);
const done = all.filter((c) => c.implemented);
const label = deckCards
  ? `Commander deck${deckArg === "all" ? "s" : ""}`
  : main
    ? "main sets"
    : standard
      ? "Standard (legal cards)"
      : setArg
        ? (SET_BY_CODE[setArg]?.name ?? setArg)
        : "all sets";
console.log(`${label}: ${done.length} / ${all.length} cards handled (${Math.round((done.length / all.length) * 100)} %)`);
if (!setArg && !deckCards) {
  // Reprints (PLAN-G): outside Standard, playable in "Unlimited".
  const reprintCodes = new Set(SETS.filter((s) => s.reprint).map((s) => s.code));
  const reprints = all.filter((c) => reprintCodes.has(c.set ?? ""));
  console.log(`  of which reprints ("Unlimited"): ${reprints.filter((c) => c.implemented).length} / ${reprints.length}`);
  for (const s of SETS) {
    const inSet = all.filter((c) => c.set === s.code);
    console.log(`  ${s.code.padEnd(4)} ${s.name.padEnd(30)} ${inSet.filter((c) => c.implemented).length} / ${inSet.length}`);
  }
}

const missing = all.filter((c) => !c.implemented);
const byMechanic = new Map<string, string[]>();
for (const c of missing) {
  const text = [c.text, ...(c.faceDefs ?? []).map((f) => f.text)].join("\n");
  const tags = MECHANICS.filter(([, re]) => re.test(text)).map(([n]) => n);
  for (const t of tags.length ? tags : ["no blocking mechanic detected"])
    byMechanic.set(t, [...(byMechanic.get(t) ?? []), c.name]);
}
console.log("\nUnhandled cards by mechanic (a card may count several times):");
for (const [m, names] of [...byMechanic.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(names.length).padStart(4)}  ${m}`);
}

const i = process.argv.indexOf("--list");
if (i >= 0) {
  const m = process.argv[i + 1] ?? "no blocking mechanic detected";
  console.log(`\n${m}:\n  ${(byMechanic.get(m) ?? []).join("\n  ")}`);
}

if (process.argv.includes("--text")) {
  const color = arg("--color")?.toUpperCase();
  const col = (c: (typeof missing)[number]) =>
    c.types.includes("Land") && !c.types.includes("Creature")
      ? "L"
      : c.colors.length === 0
        ? "C"
        : c.colors.length > 1
          ? "M"
          : (c.colors[0] as string);
  for (const c of missing.filter((x) => !color || col(x) === color)) {
    const pt = c.power !== undefined ? ` ${c.power}/${c.toughness}` : "";
    console.log(`\n## ${c.name} ${c.manaCostText ?? ""} — ${c.typeLine}${pt}${c.layout ? ` {${c.layout}}` : ""}`);
    if (c.faceDefs?.length) {
      for (const f of c.faceDefs) {
        const fpt = f.power !== undefined ? ` ${f.power}/${f.toughness}` : "";
        console.log(`[${f.name} — ${f.typeLine}${fpt}]\n${f.text}`);
      }
    } else console.log(c.text);
    // "prepare" layout: the card's spell (script `prepareSpell`).
    if (c.prepareFace)
      console.log(
        `[Prepared spell: ${c.prepareFace.name} ${c.prepareFace.manaCost} — ${c.prepareFace.typeLine}]\n${c.prepareFace.text}`,
      );
  }
}

if (process.argv.includes("--missing")) {
  console.log(`\nUnhandled cards:\n  ${missing.map((c) => c.name).join("\n  ")}`);
}

// --audit: Oracle ↔ script gaps of the handled cards (packages/cards/src/audit.ts), known or new.
if (process.argv.includes("--audit")) {
  const issues = done.flatMap(auditCard);
  const known = auditBaseline as Record<string, string>;
  const fresh = issues.filter((x) => !(issueKey(x) in known));
  console.log(`\nOracle ↔ script audit: ${issues.length} gap(s), of which ${fresh.length} new`);
  for (const x of issues) {
    const why = known[issueKey(x)];
    console.log(`  ${why ? "·" : "✗"} [${x.kind}] ${x.card} — ${x.detail}${why ? ` (known: ${why})` : ""}`);
  }
}

// --tests: a card counts as tested if its name (or that of its first face) appears, as a whole word, in a file of
// `packages/engine/test` or in the Oracle expectations (method of the 2026-10-02 audit).
if (process.argv.includes("--tests")) {
  const dir = "packages/engine/test";
  const corpus = [
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(`${dir}/${f}`, "utf8")),
    readFileSync("packages/cards/test/oracle-expectations.test.ts", "utf8"),
  ].join("\n");
  const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = (c: CardDef) =>
    [c.name, c.name.split(" // ")[0] as string].some((n) =>
      new RegExp(`(^|[^\\p{L}])${escapeRe(n)}($|[^\\p{L}])`, "u").test(corpus),
    );
  const pool = done.filter((c) => !c.supertypes.includes("Basic"));
  const tested = new Set(pool.filter(named).map((c) => c.name));
  const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0} %`;
  console.log(`\nCards named in a test: ${tested.size} / ${pool.length} (${pct(tested.size, pool.length)})`);
  for (const s of SETS) {
    const inSet = pool.filter((c) => c.set === s.code);
    if (!inSet.length) continue;
    const n = inSet.filter((c) => tested.has(c.name)).length;
    console.log(`  ${s.code.padEnd(4)} ${String(n).padStart(4)} / ${String(inSet.length).padEnd(4)} ${pct(n, inSet.length)}`);
  }
  if (process.argv.includes("--meta")) {
    const copies = new Map<string, number>();
    for (const d of metaDecks())
      for (const [n, name] of [...d.main, ...d.sideboard]) copies.set(name, (copies.get(name) ?? 0) + n);
    const untested = [...copies]
      .filter(([name]) => CARDS[name] && !CARDS[name].supertypes.includes("Basic") && !tested.has(name))
      .sort((a, b) => b[1] - a[1]);
    console.log(`\nMeta cards never named in a test: ${untested.length}`);
    for (const [name, n] of untested) console.log(`  ${name} (${CARDS[name]?.set}, ×${n})`);
  } else if (setArg && !main && !standard) {
    const rank: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
    const untested = pool
      .filter((c) => !tested.has(c.name))
      .sort((a, b) => (rank[a.rarity ?? ""] ?? 4) - (rank[b.rarity ?? ""] ?? 4) || a.name.localeCompare(b.name));
    console.log(`\nNever named (${untested.length}):`);
    for (const c of untested) console.log(`  ${c.name} (${c.rarity ?? "?"})`);
  }
}
