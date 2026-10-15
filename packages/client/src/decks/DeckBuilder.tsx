/**
 * Deck builder: filterable collection (Foundations), deck and sideboard, statistics,
 * validation of the construction rules and of the legality in the deck's format (Standard, Commander: commander,
 * 100 cards, identity), import and export of decklists.
 */
import {
  CARDS,
  canBeCommander,
  canJoinCommander,
  DEFAULT_FORMAT,
  type DeckEntries,
  type DeckEntry,
  type DeckList,
  FORMAT_LABELS,
  FORMATS,
  legalityIssue,
  SET_BY_CODE,
  SETS,
  validateDeck,
} from "@mtgx/cards";
import type { PrintingOption } from "@mtgx/cards/printings";
import {
  type CardDef,
  type CardFace,
  type Color,
  CUSTOM_PRINTING,
  cardFace,
  colorIdentity,
  customArtSet,
  customPrinting,
  type Format,
  keyedPrinting,
  manaValue,
  msg,
  parseText,
  withinIdentity,
} from "@mtgx/engine";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Card, ManaCost } from "../board/Card";
import { Preview, TouchPreview } from "../board/Sidebar";
import { faceName } from "../i18n";
import { customArtSets, hasCustomArt, useImages } from "../images";
import { LangToggle } from "../LangToggle";
import { useT } from "../localize";
import { useGame } from "../store";
import { isTouch } from "../touch";
import { type Lang, textIn, tr } from "../translate";
import { withBasicLands } from "./autoLands";
import { DeckModal, ExportModal, ImportModal } from "./ImportExport";
import { type PrintingTable, usePrintings } from "./printings";
import { searchFilter } from "./search";
import { deckName, printedFace, useAllDecks, useDecks } from "./store";

const COLORS = ["W", "U", "B", "R", "G"] as const;
const TYPES: [string, string][] = [
  ["", msg("All types")],
  ["Creature", msg("ctx:cardType|Creatures")],
  ["Instant", msg("Instants")],
  ["Sorcery", msg("Sorceries")],
  ["Enchantment", msg("Enchantments")],
  ["Artifact", msg("Artifacts")],
  ["Planeswalker", msg("Planeswalkers")],
  ["Land", msg("Lands")],
];
const RARITIES: [string, string][] = [
  ["", msg("All rarities")],
  ["common", msg("Common")],
  ["uncommon", msg("Uncommon")],
  ["rare", msg("Rare")],
  ["mythic", msg("Mythic")],
];

const POOL: CardDef[] = Object.values(CARDS)
  .filter((c) => !c.isToken && !c.meldResult)
  .sort((a, b) => colorRank(a) - colorRank(b) || manaValue(a.manaCost) - manaValue(b.manaCost) || a.name.localeCompare(b.name));

/** A set's name in a language (French name in French, when there is one). */
function setName(s: { name: string; nameFr?: string }, lang: Lang): string {
  return (lang === "fr" && s.nameFr) || s.name;
}

/** "Standard 836/5174 playable" or, for a set, "Foundations 517/517 playable". */
function coverageHint(set: string, lang: Lang): string {
  const inSet = set ? POOL.filter((c) => c.set === set) : POOL;
  const info = set ? SETS.find((s) => s.code === set) : undefined;
  const label = set ? (info ? setName(info, lang) : set) : "Standard";
  return tr(lang, "{label} {n}/{total} playable", {
    label,
    n: inSet.filter((c) => c.implemented).length,
    total: inSet.length,
  });
}

function colorRank(c: CardDef): number {
  if (c.types.includes("Land")) return 7;
  if (c.colors.length === 0) return 6;
  if (c.colors.length > 1) return 5;
  return COLORS.indexOf(c.colors[0] as (typeof COLORS)[number]);
}

const isBasic = (c: CardDef | undefined) => !!c?.supertypes.includes("Basic");

/** Short tag of a card illegal in the format ("banned", "not in Standard"); read on the message id, not the card name. */
function legalityTag(c: CardDef, format: Format, lang: Lang): string | undefined {
  const issue = legalityIssue(c, format);
  if (!issue) return undefined;
  return /\bbanned\b/.test(parseText(issue).id)
    ? tr(lang, "banned")
    : tr(lang, "not in {format}", { format: FORMAT_LABELS[format] });
}
const count = (entries: DeckEntries) => entries.reduce((a, [n]) => a + n, 0);

function withCount(entries: DeckEntries, name: string, delta: number): DeckEntries {
  const out = entries.map((e) => [...e] as DeckEntry);
  const e = out.find((x) => x[1] === name);
  if (e) e[0] += delta;
  else if (delta > 0) out.push([delta, name]);
  return out.filter(([n]) => n > 0);
}

/** Printing chosen for `name` (absent: the card's art), in a list. */
function withPrinting(entries: DeckEntries, name: string, key: string | undefined): DeckEntries {
  return entries.map(([n, x, p]): DeckEntry => (x !== name ? (p ? [n, x, p] : [n, x]) : key ? [n, x, key] : [n, x]));
}

/** Language of a card printed in one language only (Japanese Mystical Archive…). */
const PRINT_LANGS: Record<string, string> = {
  ja: msg("Japanese"),
  zhs: msg("Simplified Chinese"),
  zht: msg("Traditional Chinese"),
  ko: msg("Korean"),
  ru: msg("Russian"),
  de: msg("German"),
  fr: msg("French"),
  it: msg("Italian"),
  es: msg("Spanish"),
  pt: msg("Portuguese"),
  ph: msg("Phyrexian"),
};

/** Label of a printing in the "Art" menu: "STA 42 · Strixhaven Mystical Archive · 2021 · Japanese". */
function printingLabel(p: PrintingOption, lang: Lang): string {
  const set = customArtSet(p.key);
  if (set !== undefined) return set ? tr(lang, "Custom illustration ({set})", { set }) : tr(lang, "Custom illustration");
  const info = SET_BY_CODE[p.set];
  const name = info ? setName(info, lang) : p.setName;
  const printLang = p.lang && (PRINT_LANGS[p.lang] ? textIn(lang, PRINT_LANGS[p.lang] as string) : p.lang);
  return [`${p.set} ${p.number}`, name, p.year, printLang].filter(Boolean).join(" · ");
}

/**
 * Printings offered for a card: all those of the table once loaded; before, the card and its reprints (and the
 * printing already chosen).
 */
function printingChoices(
  c: CardDef,
  key: string | undefined,
  table: PrintingTable | undefined,
  /** The art sets that have an image of the card (`customArtSets`); `shared`: the shared images have one. */
  custom: { sets: string[]; shared: boolean },
): PrintingOption[] {
  const out: PrintingOption[] = table?.printingOptions(c) ?? [
    { set: c.set ?? "", number: c.number ?? "" },
    ...(c.printings ?? []).map((p) => ({ key: p.key, set: p.set, number: p.number })),
  ];
  // Custom art (local folder of the server, images.ts): one choice per art set that has the card (the plain "custom"
  // printing if the server lists no sets), and the one already chosen.
  const customKeys = custom.sets.length ? custom.sets.map((x) => customPrinting(x)) : custom.shared ? [CUSTOM_PRINTING] : [];
  if (key && customArtSet(key) !== undefined && !customKeys.includes(key)) customKeys.push(key);
  for (const k of customKeys) out.push({ key: k, set: "", number: "" });
  const chosen = key && !out.some((p) => p.key === key) ? keyedPrinting(key) : undefined;
  return chosen ? [...out, { key, set: chosen.set, number: chosen.number }] : out;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

interface Filters {
  colors: string[];
  type: string;
  mv: string;
  rarity: string;
  query: string;
  playableOnly: boolean;
  /** Only cards legal in the deck's format. */
  legalOnly: boolean;
  /** Commander: only cards within the commander's color identity. */
  identityOnly: boolean;
  /** Set (set code), or "" for all. */
  set: string;
}

function matches(c: CardDef, f: Filters, format: Format, identity: Color[] | null): boolean {
  if (f.playableOnly && !c.implemented) return false;
  if (f.legalOnly && legalityIssue(c, format)) return false;
  if (identity && f.identityOnly && !withinIdentity(colorIdentity(c), identity)) return false;
  if (f.set && c.set !== f.set) return false;
  if (f.colors.length) {
    const want = new Set(f.colors);
    const colorless = c.colors.length === 0;
    const ok = (want.has("C") && colorless) || (want.has("M") && c.colors.length > 1) || c.colors.some((x) => want.has(x));
    if (!ok) return false;
  }
  if (f.type && !c.types.includes(f.type as CardDef["types"][number])) return false;
  if (f.mv) {
    const mv = manaValue(c.manaCost);
    if (f.mv === "6" ? mv < 6 : mv !== Number(f.mv)) return false;
  }
  if (f.rarity && c.rarity !== f.rarity) return false;
  // Search: free words, or Scryfall-like syntax (t:, o:, c:, mv<=2…).
  if (f.query && !searchFilter(f.query)(c)) return false;
  return true;
}

function Collection({ deck, onChange }: { deck: DeckList; onChange: (name: string, delta: number) => void }) {
  const format = deck.format ?? DEFAULT_FORMAT;
  const lang = useGame((s) => s.lang);
  const t = useT();
  // Commander: the commander's identity (null as long as there is none).
  const commanderNames = (deck.commander ?? []).map(([, n]) => n).join("|");
  const identity = useMemo(() => {
    if (format !== "commander" || !commanderNames) return null;
    const set = new Set(commanderNames.split("|").flatMap((n) => (CARDS[n] ? colorIdentity(CARDS[n]) : [])));
    return (["W", "U", "B", "R", "G"] as Color[]).filter((x) => set.has(x));
  }, [format, commanderNames]);
  const [f, setF] = useState<Filters>({
    colors: [],
    type: "",
    mv: "",
    rarity: "",
    query: "",
    playableOnly: true,
    legalOnly: true,
    identityOnly: true,
    set: "",
  });
  // Deferred filters: typing stays smooth while the grid is recomputed.
  const deferred = useDeferredValue(f);
  const cards = useMemo(() => POOL.filter((c) => matches(c, deferred, format, identity)), [deferred, format, identity]);
  // Progressive rendering (more than 5,000 cards): one page, then the next one when nearing the bottom of the grid.
  // The number of cards shown is tied to the filtered list: a new filter starts again from one page.
  const [more, setMore] = useState<{ of: CardDef[]; n: number }>({ of: cards, n: PAGE });
  const shown = more.of === cards ? more.n : PAGE;
  const current = useRef(cards);
  current.current = cards;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setMore((m) => ({ of: current.current, n: (m.of === current.current ? m.n : PAGE) + PAGE }));
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const inDeck = (name: string) =>
    (deck.main.find((e) => e[1] === name)?.[0] ?? 0) +
    (deck.sideboard?.find((e) => e[1] === name)?.[0] ?? 0) +
    (deck.commander?.find((e) => e[1] === name)?.[0] ?? 0);
  const toggleColor = (c: string) =>
    setF((x) => ({ ...x, colors: x.colors.includes(c) ? x.colors.filter((y) => y !== c) : [...x.colors, c] }));
  return (
    <section className="collection">
      <div className="filters">
        <input
          className="search"
          placeholder={t("Search: name, type, text; t:creature o:draw c:wu mv<=2 -r:rare")}
          title={t(
            "Free words (FR or EN), or t: type, o: text, c: colors (c:c colorless, c:m multicolored), mv, pow, tou with : = < > <= >=, r: rarity, s: set; quotes for several words, - to exclude",
          )}
          value={f.query}
          onChange={(e) => setF({ ...f, query: e.target.value })}
        />
        <div className="color-filter">
          {[...COLORS, "C", "M"].map((c) => (
            <button
              key={c}
              type="button"
              className={`color-toggle ${f.colors.includes(c) ? "on" : ""}`}
              title={c === "C" ? t("Colorless") : c === "M" ? t("Multicolored") : undefined}
              onClick={() => toggleColor(c)}
            >
              {c === "M" ? <span className="multi-dot" /> : <ManaCost cost={`{${c}}`} size={18} />}
            </button>
          ))}
        </div>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {textIn(lang, l)}
            </option>
          ))}
        </select>
        <select value={f.mv} onChange={(e) => setF({ ...f, mv: e.target.value })}>
          <option value="">{t("Any cost")}</option>
          {["0", "1", "2", "3", "4", "5", "6"].map((v) => (
            <option key={v} value={v}>
              {v === "6" ? "6+" : v}
            </option>
          ))}
        </select>
        <select value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value })}>
          {RARITIES.map(([v, l]) => (
            <option key={v} value={v}>
              {textIn(lang, l)}
            </option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={f.playableOnly} onChange={(e) => setF({ ...f, playableOnly: e.target.checked })} />
          {t("Playable only")}
        </label>
        <label className="toggle" title={t("Hide banned or out-of-format cards")}>
          <input type="checkbox" checked={f.legalOnly} onChange={(e) => setF({ ...f, legalOnly: e.target.checked })} />
          {t("Legal in {format}", { format: FORMAT_LABELS[format] })}
        </label>
        {identity && (
          <label className="toggle" title={t("Only the cards within the commander's color identity")}>
            <input type="checkbox" checked={f.identityOnly} onChange={(e) => setF({ ...f, identityOnly: e.target.checked })} />
            {t("Commander's identity")}
          </label>
        )}
        <select value={f.set} onChange={(e) => setF({ ...f, set: e.target.value })} aria-label={t("Set")}>
          <option value="">{t("All sets")}</option>
          <optgroup label="Standard">
            {SETS.filter((s) => !s.reprint && !s.byName).map((s) => (
              <option key={s.code} value={s.code}>
                {setName(s, lang)}
              </option>
            ))}
          </optgroup>
          {/* Reprints (PLAN-G): not in Standard, playable in "Unlimited". */}
          <optgroup label={t("Reprints (Unlimited)")}>
            {SETS.filter((s) => s.reprint).map((s) => (
              <option key={s.code} value={s.code}>
                {setName(s, lang)}
              </option>
            ))}
          </optgroup>
          {/* Cards of the Commander decks (PLAN-E), imported by name. */}
          <optgroup label="Commander">
            {SETS.filter((s) => s.byName).map((s) => (
              <option key={s.code} value={s.code}>
                {setName(s, lang)}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="hint">
          {t("{n} cards", { n: cards.length })} · {coverageHint(f.set, lang)}
        </span>
      </div>
      <div className="collection-grid">
        {cards.slice(0, shown).map((c) => {
          const n = inDeck(c.name);
          const illegal = legalityTag(c, format, lang);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: right click: one copy less (the deck list's buttons do it from the keyboard)
            <div
              key={c.id}
              className={`collection-card ${c.implemented ? "" : "soon"}`}
              onContextMenu={(e) => {
                e.preventDefault();
                if (n > 0) onChange(c.name, -1);
              }}
            >
              <Card face={cardFace(c)} width="var(--collection-w)" onClick={() => onChange(c.name, 1)} dim={!c.implemented} />
              {n > 0 && <span className="copies">{n}</span>}
              {illegal ? (
                <span className="soon-tag illegal-tag">{illegal}</span>
              ) : (
                !c.implemented && <span className="soon-tag">{t("soon")}</span>
              )}
            </div>
          );
        })}
        <div ref={sentinel} className="collection-sentinel" />
      </div>
    </section>
  );
}

/** Cards shown per page in the collection (progressive rendering). */
const PAGE = 120;

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

const GROUPS: [string, (c: CardDef) => boolean][] = [
  [msg("ctx:cardType|Creatures"), (c) => c.types.includes("Creature")],
  [msg("Instants and sorceries"), (c) => c.types.includes("Instant") || c.types.includes("Sorcery")],
  [
    msg("Others"),
    (c) =>
      !c.types.includes("Creature") && !c.types.includes("Land") && !c.types.includes("Instant") && !c.types.includes("Sorcery"),
  ],
  [msg("Lands"), (c) => c.types.includes("Land")],
];

function DeckLines({
  entries,
  onChange,
  onPrinting,
  readOnly,
  format = DEFAULT_FORMAT,
  onCommander,
  commanders = [],
}: {
  entries: DeckEntries;
  onChange: (name: string, d: number) => void;
  onPrinting: (name: string, key: string | undefined) => void;
  readOnly: boolean;
  format?: Format;
  /** Commander: "set as commander" (legendary creatures of the deck). */
  onCommander?: (name: string) => void;
  /** The current commanders (a partner or a Background can join them). */
  commanders?: CardDef[];
}) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  const setHover = useGame((s) => s.setHover);
  const setPeek = useGame((s) => s.setPeek);
  // Touch screen, or no preview column (under 1,200 px): the card's name opens it large, in an overlay.
  const showCard = (face: CardFace) =>
    isTouch() || window.matchMedia("(max-width: 1200px)").matches ? setPeek({ face }) : setHover({ face });
  const table = usePrintings();
  const custom = useImages((s) => s.custom);
  return (
    <>
      {GROUPS.map(([label, test]) => {
        const lines = entries
          .filter(([, name]) => CARDS[name] && test(CARDS[name] as CardDef))
          .sort((a, b) => manaValue(CARDS[a[1]]?.manaCost) - manaValue(CARDS[b[1]]?.manaCost) || a[1].localeCompare(b[1]));
        if (!lines.length) return null;
        return (
          <div key={label} className="deck-group">
            <div className="deck-group-title">
              {textIn(lang, label)} <span>{count(lines)}</span>
            </div>
            {lines.map(([n, name, key]) => {
              const c = CARDS[name] as CardDef;
              const face = printedFace(cardFace(c), c, key);
              const issue = legalityIssue(c, format);
              const illegal = issue && textIn(lang, issue);
              const choices = printingChoices(c, key, table, {
                sets: customArtSets(custom, name),
                shared: hasCustomArt(custom, name),
              });
              const current = choices.find((p) => p.key === key);
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: hovering only shows the card's preview
                <div
                  key={name}
                  className={`deck-line ${c.implemented ? "" : "soon"} ${illegal ? "illegal" : ""}`}
                  title={illegal}
                  onMouseEnter={() => setHover({ face })}
                >
                  <span className="deck-line-n">{n}</span>
                  <button type="button" className="deck-line-name" onClick={() => showCard(face)} title={t("Show the card")}>
                    {faceName(face, lang)}
                  </button>
                  <ManaCost cost={face.manaCost} size={13} />
                  {choices.length > 1 && (
                    <select
                      className={`deck-line-art ${key ? "on" : ""}`}
                      value={key ?? ""}
                      disabled={readOnly}
                      title={t("Art: {label}", { label: current ? printingLabel(current, lang) : "?" })}
                      aria-label={t("Art of {name}", { name: faceName(face, lang) })}
                      onChange={(e) => {
                        const next = e.target.value || undefined;
                        onPrinting(name, next);
                        setHover({ face: printedFace(cardFace(c), c, next) });
                      }}
                    >
                      {choices.map((p) => (
                        <option key={p.key ?? ""} value={p.key ?? ""}>
                          {printingLabel(p, lang)}
                        </option>
                      ))}
                    </select>
                  )}
                  {!readOnly && (
                    <span className="deck-line-btns">
                      {onCommander && (canBeCommander(c) || canJoinCommander(c, commanders)) && (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => onCommander(name)}
                          title={t("Set as commander")}
                          aria-label={t("Set {name} as commander", { name: faceName(face, lang) })}
                        >
                          ♛
                        </button>
                      )}
                      <button type="button" className="btn small" onClick={() => onChange(name, -1)} aria-label={t("Remove")}>
                        −
                      </button>
                      <button type="button" className="btn small" onClick={() => onChange(name, 1)} aria-label={t("Add")}>
                        +
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function Stats({ deck, children }: { deck: DeckList; children?: React.ReactNode }) {
  const curve = [0, 0, 0, 0, 0, 0, 0];
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const [n, name] of deck.main) {
    const c = CARDS[name];
    if (!c || c.types.includes("Land")) continue;
    const mv = Math.min(6, manaValue(c.manaCost));
    curve[mv] = (curve[mv] ?? 0) + n;
    for (const col of Object.keys(pips)) pips[col] = (pips[col] ?? 0) + n * (c.manaCost?.colored[col as "W"] ?? 0);
  }
  const max = Math.max(1, ...curve);
  const t = useT();
  return (
    <div className="deck-stats">
      <div className="curve" title={t("Mana curve (lands excluded)")}>
        {curve.map((v, i) => (
          <div key={i} className="curve-col">
            <div className="curve-bar" style={{ height: `${(v / max) * 100}%` }}>
              {v > 0 && <span>{v}</span>}
            </div>
            <div className="curve-label">{i === 6 ? "6+" : i}</div>
          </div>
        ))}
      </div>
      <div className="pips" title={t("Colored mana symbols")}>
        {Object.entries(pips)
          .filter(([, v]) => v > 0)
          .map(([c, v]) => (
            <span key={c}>
              <ManaCost cost={`{${c}}`} size={14} /> {Math.round(v * 10) / 10}
            </span>
          ))}
      </div>
      {children}
    </div>
  );
}

/** Mana-value columns of the deck (PLAN-L L9), Arena style: a click adds a copy, a right click removes one. */
const COLUMNS: [string, (c: CardDef) => boolean][] = [
  ...[0, 1, 2, 3, 4, 5, 6].map((mv): [string, (c: CardDef) => boolean] => [
    mv === 6 ? "6+" : String(mv),
    (c) => !c.types.includes("Land") && (mv === 6 ? manaValue(c.manaCost) >= 6 : manaValue(c.manaCost) === mv),
  ]),
  [msg("Lands"), (c) => c.types.includes("Land")],
];

function DeckColumns({
  entries,
  onChange,
  readOnly,
}: {
  entries: DeckEntries;
  onChange: (name: string, d: number) => void;
  readOnly: boolean;
}) {
  const lang = useGame((s) => s.lang);
  const t = useT();
  return (
    <section className="deck-columns" data-testid="deck-columns">
      {COLUMNS.map(([label, test]) => {
        const cards = entries
          .filter(([, name]) => CARDS[name] && test(CARDS[name] as CardDef))
          .sort((a, b) => a[1].localeCompare(b[1]));
        return (
          <div key={label} className="deck-column">
            <div className="deck-group-title">
              {textIn(lang, label)} <span>{count(cards)}</span>
            </div>
            {cards.map(([n, name, key]) => {
              const c = CARDS[name] as CardDef;
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: right click: one copy less (the deck list's buttons do it from the keyboard)
                <div
                  key={name}
                  className="deck-column-card"
                  title={readOnly ? undefined : t("Click: one more · right click: one less")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!readOnly) onChange(name, -1);
                  }}
                >
                  <Card
                    face={printedFace(cardFace(c), c, key)}
                    width="var(--column-w)"
                    onClick={readOnly ? undefined : () => onChange(name, 1)}
                  />
                  {n > 1 && <span className="copies">{n}</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

/** Sample hand (PLAN-L L9): seven cards of the shuffled deck, a card more on demand. */
function SampleHand({ entries, onClose }: { entries: DeckEntries; onClose: () => void }) {
  const t = useT();
  const shuffle = () => {
    const cards = entries.flatMap(([n, name, key]) => Array.from({ length: n }, () => [name, key] as const));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j] as (typeof cards)[number], cards[i] as (typeof cards)[number]];
    }
    return cards;
  };
  const [library, setLibrary] = useState(shuffle);
  const [drawn, setDrawn] = useState(7);
  return (
    <DeckModal title={t("Sample hand")} onClose={onClose}>
      <div className="sample-hand" data-testid="sample-hand">
        {library.slice(0, drawn).map(([name, key], i) => {
          const c = CARDS[name] as CardDef;
          return <Card key={`${i}-${name}`} face={printedFace(cardFace(c), c, key)} width="var(--collection-w)" />;
        })}
      </div>
      <p className="hint">{t("{n} cards in the library", { n: library.length - drawn })}</p>
      <div className="modal-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setLibrary(shuffle());
            setDrawn(7);
          }}
        >
          {t("New hand")}
        </button>
        <button type="button" className="btn" disabled={drawn >= library.length} onClick={() => setDrawn(drawn + 1)}>
          {t("Draw a card")}
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          {t("Close")}
        </button>
      </div>
    </DeckModal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function DeckBuilder() {
  const editing = useGame((s) => s.editingDeck);
  const backToLobby = useGame((s) => s.backToLobby);
  const startGame = useGame((s) => s.startGame);
  const notify = useGame((s) => s.notify);
  const lang = useGame((s) => s.lang);
  const t = useT();
  const decks = useAllDecks();
  const { save, remove, duplicate, create } = useDecks();
  const [tab, setTab] = useState<"main" | "side" | "commander">("main");
  const [modal, setModal] = useState<"import" | "export" | "hand" | null>(null);
  // Phone: one pane at a time, the collection or the deck (switch shown under 760 px).
  const [pane, setPane] = useState<"collection" | "deck">("collection");
  // A deck received by a link (QR code): the import window opens with it.
  const shared = useGame((s) => s.sharedDeck);
  const closeImport = () => {
    setModal(null);
    useGame.setState({ sharedDeck: null });
  };
  // The main area: the collection, or the deck in mana-value columns (PLAN-L L9).
  const [columns, setColumns] = useState(false);
  const select = (id: string | null) => useGame.setState({ editingDeck: id });

  const deck = decks.find((d) => d.id === editing) ?? decks.find((d) => !d.builtin) ?? decks[0];
  if (!deck) return null;
  const readOnly = !!deck.builtin;
  // A deck is validated in its format (Standard by default; Commander: PLAN-E).
  const format = deck.format ?? DEFAULT_FORMAT;
  const v = validateDeck(deck, CARDS, format);
  const formatLabel = textIn(lang, FORMAT_LABELS[v.format]);
  const isCommander = format === "commander";
  // Sideboard tab in Commander: the commander's (and conversely).
  const shownTab = isCommander && tab === "side" ? "commander" : !isCommander && tab === "commander" ? "side" : tab;

  const change = (name: string, delta: number) => {
    if (readOnly) {
      notify(t("Precon deck: duplicate it to edit it."));
      return;
    }
    const c = CARDS[name];
    const total =
      (deck.main.find((e) => e[1] === name)?.[0] ?? 0) +
      (deck.sideboard?.find((e) => e[1] === name)?.[0] ?? 0) +
      (deck.commander?.find((e) => e[1] === name)?.[0] ?? 0);
    // Commander: one copy of each card (except basic lands).
    const max = isCommander ? 1 : 4;
    if (delta > 0 && !isBasic(c) && total >= max) {
      notify(isCommander ? t("{name}: only one copy in Commander.", { name }) : t("{name}: 4 copies at most.", { name }));
      return;
    }
    if (shownTab === "commander") {
      // Removing the commander puts it back in the deck.
      if (delta < 0) save({ ...deck, commander: withCount(deck.commander ?? [], name, -1), main: withCount(deck.main, name, 1) });
      return;
    }
    if (shownTab === "main") save({ ...deck, main: withCount(deck.main, name, delta) });
    else save({ ...deck, sideboard: withCount(deck.sideboard ?? [], name, delta) });
  };
  /**
   * Commander: the card becomes the commander, the former one going back to the deck; a card that can be paired with the
   * current commander (partner, Background: 702.124) joins it as the second commander.
   */
  const setCommander = (name: string) => {
    if (readOnly) return;
    const card = CARDS[name];
    const current = (deck.commander ?? []).map(([, n]) => CARDS[n]).filter((c): c is CardDef => !!c);
    const main0 = withCount(deck.main, name, -1);
    if (card && canJoinCommander(card, current)) {
      save({ ...deck, commander: [...(deck.commander ?? []), [1, name]], main: main0 });
      return;
    }
    let main = main0;
    for (const [n, old] of deck.commander ?? []) main = withCount(main, old, n);
    save({ ...deck, commander: [[1, name]], main });
  };
  /** Format of the deck (a precon deck keeps its own). */
  const setFormat = (f: Format) => {
    if (readOnly) return;
    save({ ...deck, format: f === DEFAULT_FORMAT ? undefined : f });
  };
  /** A card's art applies to the deck and the sideboard. */
  const choosePrinting = (name: string, key: string | undefined) => {
    if (readOnly) return;
    save({ ...deck, main: withPrinting(deck.main, name, key), sideboard: withPrinting(deck.sideboard ?? [], name, key) });
  };
  /** Basic lands up to the deck's size, by the colored symbols (Commander: within the identity). */
  const fillLands = () => {
    if (readOnly) return;
    const identity = isCommander
      ? [...new Set((deck.commander ?? []).flatMap(([, n]) => (CARDS[n] ? colorIdentity(CARDS[n]) : [])))]
      : undefined;
    const main = withBasicLands(deck.main, v.minMain, identity);
    if (!main) {
      notify(t("No room for basic lands, or no colored symbol to follow."));
      return;
    }
    save({ ...deck, main });
  };
  const opponent = decks.find(
    (d) =>
      d.id !== deck.id &&
      validateDeck(d, CARDS, d.format ?? DEFAULT_FORMAT).playable &&
      (d.format ?? DEFAULT_FORMAT) === (deck.format ?? DEFAULT_FORMAT),
  );

  return (
    <div className="builder">
      <header className="builder-head">
        <button type="button" className="btn ghost" onClick={backToLobby}>
          ← {t("Home")}
        </button>
        <select className="deck-select" value={deck.id} onChange={(e) => select(e.target.value)}>
          <optgroup label={t("Precons")}>
            {decks
              .filter((d) => d.builtin)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {deckName(d, lang)}
                </option>
              ))}
          </optgroup>
          <optgroup label={t("My decks")}>
            {decks
              .filter((d) => !d.builtin)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {deckName(d, lang)}
                </option>
              ))}
          </optgroup>
        </select>
        {readOnly ? (
          <span className="hint">{t("Precon deck (read only)")}</span>
        ) : (
          <>
            <input
              className="deck-name-input"
              value={deck.name}
              onChange={(e) => save({ ...deck, name: e.target.value })}
              aria-label={t("Deck name")}
            />
            <select value={format} onChange={(e) => setFormat(e.target.value as Format)} aria-label={t("Deck format")}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {textIn(lang, FORMAT_LABELS[f])}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="builder-actions">
          <button type="button" className="btn small" onClick={() => select(create())}>
            {t("New")}
          </button>
          <button type="button" className="btn small" onClick={() => select(duplicate(deck))}>
            {t("Duplicate")}
          </button>
          {!readOnly && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                if (window.confirm(t('Delete "{name}"?', { name: deck.name }))) {
                  remove(deck.id);
                  select(null);
                }
              }}
            >
              {t("Delete")}
            </button>
          )}
          <button type="button" className="btn small" onClick={() => setModal("import")}>
            {t("Import")}
          </button>
          <button type="button" className="btn small" onClick={() => setModal("export")}>
            {t("Export")}
          </button>
          <button
            type="button"
            className="btn small primary"
            disabled={!v.playable || !opponent}
            title={!v.playable ? (v.errors[0] ? textIn(lang, v.errors[0]) : t("Contains cards not playable yet")) : undefined}
            onClick={() =>
              opponent &&
              startGame(
                deck.main,
                [opponent.main],
                undefined,
                undefined,
                undefined,
                isCommander ? { player: deck.commander ?? [], ai: [opponent.commander ?? []] } : undefined,
              )
            }
          >
            {t("Test against the AI")}
          </button>
          <LangToggle />
        </div>
      </header>
      <div className="seg builder-switch">
        <button type="button" className={pane === "collection" ? "on" : ""} onClick={() => setPane("collection")}>
          {t("Collection")}
        </button>
        <button type="button" className={pane === "deck" ? "on" : ""} onClick={() => setPane("deck")}>
          {t("Deck ({n})", { n: v.mainCount })}
        </button>
      </div>
      <div className="builder-body" data-pane={pane}>
        {columns ? (
          <DeckColumns
            entries={shownTab === "main" ? deck.main : shownTab === "commander" ? (deck.commander ?? []) : (deck.sideboard ?? [])}
            onChange={change}
            readOnly={readOnly}
          />
        ) : (
          <Collection deck={deck} onChange={change} />
        )}
        <section className="deck-panel">
          <div className="deck-tabs">
            <button type="button" className={shownTab === "main" ? "on" : ""} onClick={() => setTab("main")}>
              {t("Deck")}{" "}
              <strong
                className={isCommander ? (v.mainCount === v.minMain ? "ok" : "short") : v.mainCount >= v.minMain ? "ok" : "short"}
              >
                {v.mainCount}
              </strong>
              /{v.minMain}
            </button>
            {isCommander ? (
              <button
                type="button"
                className={shownTab === "commander" ? "on" : ""}
                onClick={() => setTab("commander")}
                title={t("The commander counts in the 100 cards")}
              >
                {t("ctx:card|Commander")} <strong>{v.commanders?.length ? "♛" : "—"}</strong>
              </button>
            ) : (
              <button type="button" className={shownTab === "side" ? "on" : ""} onClick={() => setTab("side")}>
                {t("Sideboard")} <strong>{v.sideCount}</strong>/15
              </button>
            )}
            <span
              className={`format-badge ${v.legal ? "ok" : "ko"}`}
              title={
                v.welcome
                  ? t("Welcome deck: 40 cards, played as is")
                  : v.legal
                    ? t("Deck legal in {format}", { format: formatLabel })
                    : v.errors[0] && textIn(lang, v.errors[0])
              }
            >
              {v.welcome ? t("Welcome") : formatLabel} {v.legal ? "✓" : "✗"}
            </span>
          </div>
          {isCommander && (
            <div className="commander-summary" data-testid="commander-summary">
              {v.gameChangers && (
                <span
                  className="format-badge"
                  title={
                    v.gameChangers.length
                      ? t("Game Changers: {names}", { names: v.gameChangers.join(", ") })
                      : t("No Game Changer")
                  }
                >
                  {t("Game Changers: {n} · estimated bracket {bracket}", {
                    n: v.gameChangers.length,
                    bracket: v.bracket ?? "",
                  })}
                  {deck.bracket ? ` · ${t("declared {bracket}", { bracket: deck.bracket })}` : ""}
                </span>
              )}
            </div>
          )}
          <Stats deck={deck}>
            <div className="deck-tools">
              <button type="button" className="btn small" disabled={readOnly} onClick={fillLands}>
                {t("Basic lands")}
              </button>
              <button type="button" className="btn small" disabled={count(deck.main) < 7} onClick={() => setModal("hand")}>
                {t("Sample hand")}
              </button>
              <button
                type="button"
                className={`btn small ${columns ? "on" : ""}`}
                aria-pressed={columns}
                onClick={() => setColumns(!columns)}
              >
                {columns ? t("Collection") : t("Columns")}
              </button>
            </div>
          </Stats>
          <div className="deck-lines">
            <DeckLines
              entries={
                shownTab === "main" ? deck.main : shownTab === "commander" ? (deck.commander ?? []) : (deck.sideboard ?? [])
              }
              onChange={change}
              onPrinting={choosePrinting}
              readOnly={readOnly}
              format={format}
              onCommander={isCommander && shownTab === "main" ? setCommander : undefined}
              commanders={(deck.commander ?? []).map(([, n]) => CARDS[n]).filter((c): c is CardDef => !!c)}
            />
            {shownTab === "commander" && !deck.commander?.length && (
              <p className="hint">{t("Choose a legendary creature of the deck with the ♛ button.")}</p>
            )}
            {(shownTab === "main" ? deck.main : shownTab === "side" ? (deck.sideboard ?? []) : [1]).length === 0 && (
              <p className="hint">
                {shownTab === "side"
                  ? t("Click a card of the collection to add it to the sideboard.")
                  : t("Click a card of the collection to add it.")}
              </p>
            )}
          </div>
          <div className="deck-validation">
            {v.errors.map((e) => (
              <div key={e} className="v-error">
                {textIn(lang, e)}
              </div>
            ))}
            {v.warnings.slice(0, 5).map((w) => (
              <div key={w} className="v-warn">
                {textIn(lang, w)}
              </div>
            ))}
            {v.warnings.length > 5 && (
              <div className="v-warn">{t("… and {n} other cards not playable yet", { n: v.warnings.length - 5 })}</div>
            )}
            {v.playable && <div className="v-ok">{t("Deck legal in {format} and playable", { format: formatLabel })}</div>}
          </div>
        </section>
        <aside className="builder-preview">
          <Preview />
        </aside>
      </div>
      {/* The card enlarged by a long press (collection) or a tap on its name (deck), when there is no preview column. */}
      <TouchPreview />
      {(modal === "import" || shared) && (
        <ImportModal
          current={readOnly ? null : deck}
          initialText={shared ?? ""}
          onClose={closeImport}
          onCreate={(d) => {
            const id = duplicate(d, d.name);
            select(id);
            closeImport();
          }}
          onReplace={(d) => {
            save({
              ...deck,
              main: d.main,
              sideboard: d.sideboard,
              ...(d.commander ? { commander: d.commander, format: "commander" as const } : {}),
            });
            closeImport();
          }}
        />
      )}
      {modal === "export" && <ExportModal deck={deck} onClose={() => setModal(null)} />}
      {modal === "hand" && <SampleHand entries={deck.main} onClose={() => setModal(null)} />}
    </div>
  );
}
