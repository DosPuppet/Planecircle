/**
 * Decklists: reading (MTGA and MTGO formats, English or French names), export and validation of the deck construction
 * rules (60 cards minimum, 4 copies maximum, sideboard of 15; in Commander, 100 cards including the commander,
 * singleton, color identity) and of the legality in the format.
 *
 * Validation messages are player-facing texts (`msg`): the interface translates them.
 */
import { type CardDef, type Color, colorIdentity, type Format, keyedPrinting, msg, withinIdentity } from "@mtgx/engine";
import commanderData from "../data/commander.json";
import { preconFor } from "./decks";

/**
 * Lines of a deck: [count, English name, printing?]. One line per name; the printing ("SPG-13" of a reprint, PLAN-G,
 * or "STA-42@<id>" of the printings table, `printings.ts`) chooses the art of all its copies, without changing
 * anything in the rules or the legality.
 */
export type DeckEntries = DeckEntry[];
export type DeckEntry = [number, string, string?];

export interface DeckIssue {
  /** Line number (1 = first line). */
  line: number;
  text: string;
  kind: "unknown" | "syntax" | "ignored" | "unimplemented" | "illegal";
  message: string;
  /** English name suggested for an unknown card. */
  suggestion?: string;
}

export interface ParsedDeck {
  name?: string;
  /** "Commander" section (or Moxfield's `*CMDR*` mark): the commander(s) (PLAN-E). */
  commander?: DeckEntries;
  main: DeckEntries;
  sideboard: DeckEntries;
  issues: DeckIssue[];
}

export interface DeckValidation {
  format: Format;
  /** Commander: the chosen commander(s) (names). */
  commanders?: string[];
  /** Commander: color identity of the deck (that of the commander(s)), in WUBRG order. */
  identity?: Color[];
  /**
   * Commander: cards of the Game Changers list, and estimated bracket (0 → "1–2", up to 3 → "3", beyond → "4+");
   * informative only, never an error.
   */
  gameChangers?: string[];
  bracket?: "1–2" | "3" | "4+";
  /** Follows the deck construction rules and the legality of the cards in the format. */
  legal: boolean;
  /** Every card is handled by the engine. */
  playable: boolean;
  mainCount: number;
  /** Minimum size of the main deck: 60, or less for a precon Welcome deck. */
  minMain: number;
  /** Welcome deck (40-card precon, played as is). */
  welcome: boolean;
  sideCount: number;
  errors: string[];
  warnings: string[];
}

export const DECK_RULES = { minMain: 60, maxSide: 15, maxCopies: 4 } as const;

export const FORMAT_LABELS: Record<Format, string> = {
  standard: msg("Standard"),
  unlimited: msg("Unlimited"),
  commander: msg("Commander"),
};

/** Offered formats, in display order. */
export const FORMATS: readonly Format[] = ["standard", "unlimited", "commander"];
/** Formats of online games (all of them, since the 2- to 4-player rooms, PLAN-E E13). */
export const ONLINE_FORMATS: readonly Format[] = FORMATS;

/** Commander (PLAN-E): exact deck size, commander included. */
export const COMMANDER_DECK_SIZE = 100;
const COMMANDER = commanderData as { banned: string[]; notLegal: string[]; gameChangers: string[] };
const COMMANDER_BANNED = new Set(COMMANDER.banned);
const COMMANDER_NOT_LEGAL = new Set(COMMANDER.notLegal);
const GAME_CHANGERS = new Set(COMMANDER.gameChangers);
const frontName = (name: string) => name.split(" // ")[0] as string;

/** Is the card on the Game Changers list (`cards/data/commander.json`)? */
export function isGameChanger(c: CardDef): boolean {
  return GAME_CHANGERS.has(frontName(c.name));
}

export const DEFAULT_FORMAT: Format = "standard";

export function isFormat(v: unknown): v is Format {
  return typeof v === "string" && (FORMATS as readonly string[]).includes(v);
}

/** Legality problem of a card in a format, or undefined if it is legal there. */
export function legalityIssue(c: CardDef, format: Format = DEFAULT_FORMAT): string | undefined {
  const label = FORMAT_LABELS[format];
  // Melded card (shared back face of two meld cards): it does not exist on its own.
  if (c.meldResult) return msg("{card} is a melded card: it can't be put in a deck", { card: c.name });
  // Unlimited: any card of the catalog, whatever its legality.
  if (format === "unlimited") return undefined;
  // Commander: the ban list and the cards not legal of `commander.json` (Scryfall).
  if (format === "commander") {
    if (COMMANDER_BANNED.has(frontName(c.name))) return msg("{card} is banned in {format}", { card: c.name, format: label });
    if (COMMANDER_NOT_LEGAL.has(frontName(c.name)))
      return msg("{card} is not legal in {format}", { card: c.name, format: label });
    return undefined;
  }
  switch (c.legalities?.standard) {
    case "legal":
      return undefined;
    case "banned":
      return msg("{card} is banned in {format}", { card: c.name, format: label });
    case undefined:
      return msg("{card}: legality in {format} unknown", { card: c.name, format: label });
    default:
      return msg("{card} is not legal in {format}", { card: c.name, format: label });
  }
}

/** Comparable form of a name: lower case, without accents or punctuation. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number;
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] as number;
}

/** Index of the names (English and French) to the canonical English name. */
export class CardIndex {
  private readonly byName = new Map<string, string>();

  constructor(readonly cards: Record<string, CardDef>) {
    for (const c of Object.values(cards)) {
      if (c.isToken) continue;
      this.byName.set(normalizeName(c.name), c.name);
      if (c.fr?.name) this.byName.set(normalizeName(c.fr.name), c.name);
      // "Prepare" card: some exports write "Creature // Spell".
      if (c.prepareFace) this.byName.set(normalizeName(`${c.name} // ${c.prepareFace.name}`), c.name);
    }
    // Multi-faced cards: the front face alone (MTGA), "A/B" (MTGO) and the French name of the front face,
    // without overwriting the name of another card.
    for (const c of Object.values(cards)) {
      const [front, back] = c.faceDefs ?? [];
      if (c.isToken || !front) continue;
      const alias = (n: string | undefined) => {
        const key = n ? normalizeName(n) : "";
        if (key && !this.byName.has(key)) this.byName.set(key, c.name);
      };
      alias(front.name);
      alias(front.fr?.name);
      if (back) alias(`${front.name}/${back.name}`);
      if (back && front.fr?.name && back.fr?.name) alias(`${front.fr.name} // ${back.fr.name}`);
    }
  }

  find(name: string): string | undefined {
    return this.byName.get(normalizeName(name));
  }

  /** Closest English name (at most 2 typos, 3 for long names). */
  suggest(name: string): string | undefined {
    const n = normalizeName(name);
    let best: string | undefined;
    let bestD = n.length > 12 ? 3 : 2;
    for (const [key, canonical] of this.byName) {
      const d = distance(n, key);
      if (d <= bestD) {
        best = canonical;
        bestD = d;
      }
    }
    return best;
  }
}

/** Section headers, in English and in French (French decklists are read too). */
const HEADERS: Record<string, "main" | "side" | "commander" | "ignore" | "about"> = {
  deck: "main",
  main: "main",
  maindeck: "main",
  "main deck": "main",
  sideboard: "side",
  reserve: "side",
  réserve: "side", // i18n-ignore: French decklist header
  commander: "commander",
  commandant: "commander", // i18n-ignore: French decklist header
  companion: "ignore",
  compagnon: "ignore", // i18n-ignore: French decklist header
  about: "about",
};

const LINE = /^(?:(SB):\s*)?(\d+)\s*[xX]?\s+(.+?)\s*$/;
const SET_SUFFIX = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w-]+))?(?:\s+\*[A-Z]\*)?(?:\s+\*CMDR\*)?$/;
/** Mark of a commander in a Moxfield list (`1 Edgar Markov (C17) 36 *CMDR*`). */
const CMDR_MARK = /\s+\*CMDR\*$/;

/** Adds copies; the first printing cited for a name applies to all its copies. */
function add(entries: DeckEntries, n: number, name: string, printing?: string): void {
  const existing = entries.find((e) => e[1] === name);
  if (!existing) entries.push(printing ? [n, name, printing] : [n, name]);
  else {
    existing[0] += n;
    if (printing && !existing[2]) existing[2] = printing;
  }
}

/**
 * Reads a text decklist:
 * - MTGA: `4 Llanowar Elves (FDN) 227`, sections `Deck` / `Sideboard`, `About` + `Name …`;
 * - MTGO: `4 Llanowar Elves`, `4x …`, `SB:` prefix, sideboard after a blank line;
 * - English or French names, `//` and `#` comments.
 */
export function parseDeckList(
  text: string,
  index: CardIndex,
  /** Printing of a card from "(SET) number" beyond its reprints (`findPrinting` of the table). */
  findPrinting?: (c: CardDef, set: string, number: string) => string | undefined,
): ParsedDeck {
  const out: ParsedDeck = { main: [], sideboard: [], issues: [] };
  let section: "main" | "side" | "commander" | "ignore" | "about" = "main";
  let sawHeader = false;
  let sawBlankAfterCards = false;
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    const n = i + 1;
    if (!line) {
      if (out.main.length > 0) sawBlankAfterCards = true;
      return;
    }
    if (line.startsWith("//") || line.startsWith("#")) return;
    const header = HEADERS[normalizeName(line)] ?? HEADERS[line.toLowerCase()];
    if (header) {
      sawHeader = true;
      section = header;
      if (header === "ignore")
        out.issues.push({ line: n, text: line, kind: "ignored", message: msg('Section "{name}" ignored', { name: line }) });
      return;
    }
    if (section === "about") {
      const m = /^name\s+(.+)$/i.exec(line);
      if (m) out.name = m[1];
      return;
    }
    const m = LINE.exec(line);
    if (!m) {
      out.issues.push({ line: n, text: line, kind: "syntax", message: msg('Unrecognized line (expected: "4 Card name")') });
      return;
    }
    if (section === "ignore") return;
    const count = Number(m[2]);
    const marked = CMDR_MARK.test(m[3] as string);
    const suffix = SET_SUFFIX.exec(m[3] as string);
    const cardText = (m[3] as string).replace(SET_SUFFIX, "").replace(CMDR_MARK, "").trim();
    const name = index.find(cardText);
    if (!name) {
      const suggestion = index.suggest(cardText);
      out.issues.push({
        line: n,
        text: line,
        kind: "unknown",
        message: suggestion
          ? msg('Unknown card: "{name}" — did you mean "{suggestion}"?', { name: cardText, suggestion })
          : msg('Unknown card: "{name}"', { name: cardText }),
        suggestion,
      });
      return;
    }
    const toSide = m[1] === "SB" || section === "side" || (!sawHeader && sawBlankAfterCards);
    const c = index.cards[name];
    // "(SPG) 13": a printing of the card (reprint, or from the table), kept for its art.
    const key = suffix?.[2] ? `${suffix[1]?.toUpperCase()}-${suffix[2]}` : undefined;
    const printing =
      key && c?.printings?.some((p) => p.key === key)
        ? key
        : c && suffix?.[1] && suffix[2]
          ? findPrinting?.(c, suffix[1], suffix[2])
          : undefined;
    if (section === "commander" || marked) {
      out.commander ??= [];
      add(out.commander, count, name, printing);
    } else add(toSide ? out.sideboard : out.main, count, name, printing);
    const illegal = c && legalityIssue(c);
    if (illegal) out.issues.push({ line: n, text: line, kind: "illegal", message: illegal });
    if (!c?.implemented) {
      out.issues.push({ line: n, text: line, kind: "unimplemented", message: msg("{card} is not playable yet", { card: name }) });
    }
  });
  return out;
}

/**
 * Exports a decklist.
 * - "mtga": `Deck` / `Sideboard` sections, English names with set code and number (importable into MTG Arena);
 * - "plain": `4 Name`, sideboard after a blank line (MTGO format), possibly with the French names.
 */
export function serializeDeckList(
  deck: { name?: string; commander?: DeckEntries; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  opts: { format?: "mtga" | "plain"; lang?: "en" | "fr" } = {},
): string {
  const format = opts.format ?? "mtga";
  const line = ([n, name, key]: DeckEntry) => {
    const c = cards[name];
    const p = key ? (c?.printings?.find((x) => x.key === key) ?? keyedPrinting(key)) : undefined;
    const origin = c?.origin ?? c?.set;
    const set = p ? ` (${p.set}) ${p.number}` : origin && c?.number ? ` (${origin}) ${c.number}` : "";
    if (format === "mtga") return `${n} ${exportName(c, name)}${set}`;
    return `${n} ${(opts.lang === "fr" && c?.fr?.name) || name}`;
  };
  const side = deck.sideboard ?? [];
  if (format === "mtga") {
    const parts = [
      ...(deck.name ? ["About", `Name ${deck.name}`, ""] : []),
      ...(deck.commander?.length ? ["Commander", ...deck.commander.map(line), ""] : []),
      "Deck",
      ...deck.main.map(line),
    ];
    if (side.length) parts.push("", "Sideboard", ...side.map(line));
    return `${parts.join("\n")}\n`;
  }
  const commander = deck.commander?.length ? ["Commander", ...deck.commander.map(line), "", "Deck"] : [];
  return `${[...commander, ...deck.main.map(line), ...(side.length ? ["", ...side.map(line)] : [])].join("\n")}\n`;
}

/** Exported name: the full name "A // B" for a split card, the front face alone for the other multi-faced cards. */
export function exportName(c: CardDef | undefined, name: string): string {
  if (!c?.faceDefs?.length || c.layout === "split") return name;
  return c.faceDefs[0]?.name ?? name;
}

/** "A deck can have any number of cards named …" (Hare Apparent, Relentless Rats…). */
const ANY_NUMBER = /A deck can have any number of cards named/;
/** "A deck can have up to N cards named …" (Seven Dwarves, Nazgul): N copies, even in Commander. */
const UP_TO = /A deck can have up to (\w+) cards named/;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

/** Copies allowed of a card: `max` by default, all for a basic land or "any number". */
export function copiesAllowed(c: CardDef, max: number): number {
  if (c.supertypes.includes("Basic") || ANY_NUMBER.test(c.text ?? "")) return Number.POSITIVE_INFINITY;
  const upTo = UP_TO.exec(c.text ?? "");
  return upTo ? (NUMBER_WORDS[upTo[1] as string] ?? max) : max;
}

/** Can it be a commander (903.3): legendary creature, or "can be your commander"? */
export function canBeCommander(c: CardDef): boolean {
  return (c.supertypes.includes("Legendary") && c.types.includes("Creature")) || /can be your commander/.test(c.text ?? "");
}

/**
 * Commander pairs (702.124), read from the text: "Partner" alone, "Partner—[quality]" (with the same quality),
 * "Partner with [name]", "Friends forever", "Choose a Background" (with a legendary Background enchantment) and
 * "Doctor's companion" (with a legendary Time Lord Doctor creature).
 */
function pairing(c: CardDef): { kind: string; with?: string } | undefined {
  const text = c.text ?? "";
  const withName = /^Partner with ([^(\n]+?)\s*(?:\(|$)/m.exec(text)?.[1];
  if (withName) return { kind: "partnerWith", with: withName };
  const quality = /^Partner—([^(\n]+?)\s*(?:\(|$)/m.exec(text)?.[1];
  if (quality) return { kind: `partner:${quality}` };
  if (/^Partner\b/m.test(text)) return { kind: "partner" };
  if (/^Friends forever\b/m.test(text)) return { kind: "friendsForever" };
  if (/^Choose a Background\b/m.test(text)) return { kind: "chooseBackground" };
  if (/^Doctor's companion\b/m.test(text)) return { kind: "doctorsCompanion" };
  return undefined;
}
const isBackground = (c: CardDef) =>
  c.supertypes.includes("Legendary") && c.types.includes("Enchantment") && c.subtypes.includes("Background");
const isDoctor = (c: CardDef) =>
  c.supertypes.includes("Legendary") &&
  c.types.includes("Creature") &&
  c.subtypes.includes("Time Lord") &&
  c.subtypes.includes("Doctor");

/** Can these two cards be your two commanders (702.124)? */
export function canPair(a: CardDef, b: CardDef): boolean {
  const pa = pairing(a);
  const pb = pairing(b);
  if (pa?.kind === "partnerWith" || pb?.kind === "partnerWith") return pa?.with === b.name && pb?.with === a.name;
  if (
    pa &&
    pb &&
    pa.kind === pb.kind &&
    (pa.kind === "partner" || pa.kind === "friendsForever" || pa.kind.startsWith("partner:"))
  )
    return true;
  const one = (px: typeof pa, y: CardDef) =>
    (px?.kind === "chooseBackground" && isBackground(y)) || (px?.kind === "doctorsCompanion" && isDoctor(y));
  return one(pa, b) || one(pb, a);
}

/** Can this card join the current commander as its pair (a partner, or a Background for "Choose a Background")? */
export function canJoinCommander(c: CardDef, current: CardDef[]): boolean {
  return current.length === 1 && c.name !== current[0]?.name && !!current[0] && canPair(current[0], c);
}

const count = (entries: DeckEntries) => entries.reduce((a, [n]) => a + n, 0);

/**
 * Deck construction rules: 60 cards minimum, 4 copies maximum (except basic lands), sideboard of 15, cards legal in
 * the format (sideboard included), according to the imported Scryfall legalities.
 * Exception: a deck identical to a precon Welcome deck (40 cards) is played as is.
 */
export function validateDeck(
  deck: { commander?: DeckEntries; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  format: Format = DEFAULT_FORMAT,
): DeckValidation {
  if (format === "commander") return validateCommanderDeck(deck, cards);
  const errors: string[] = [];
  const warnings: string[] = [];
  const side = deck.sideboard ?? [];
  const mainCount = count(deck.main);
  const sideCount = count(side);
  const precon = preconFor(deck.main);
  const welcome = !!precon && mainCount < DECK_RULES.minMain;
  const minMain = welcome ? mainCount : DECK_RULES.minMain;
  if (mainCount < minMain) errors.push(msg("The deck has {n} cards (minimum {min})", { n: mainCount, min: minMain }));
  if (sideCount > DECK_RULES.maxSide)
    errors.push(msg("The sideboard has {n} cards (maximum {max})", { n: sideCount, max: DECK_RULES.maxSide }));
  const totals = new Map<string, number>();
  for (const [n, name] of [...deck.main, ...side]) totals.set(name, (totals.get(name) ?? 0) + n);
  let playable = true;
  const inMain = new Set(deck.main.map(([, name]) => name));
  for (const [name, n] of totals) {
    const c = cards[name];
    if (!c) {
      errors.push(msg("Unknown card: {card}", { card: name }));
      playable = false;
      continue;
    }
    if (n > copiesAllowed(c, DECK_RULES.maxCopies)) {
      errors.push(msg("{card}: {n} copies (maximum {max})", { card: name, n, max: DECK_RULES.maxCopies }));
    }
    const illegal = legalityIssue(c, format);
    if (illegal) errors.push(illegal);
    if (!c.implemented) {
      // Only the main deck is played: an unhandled card in the sideboard does not prevent playing.
      if (inMain.has(name)) playable = false;
      warnings.push(
        inMain.has(name)
          ? msg("{card} is not playable yet", { card: name })
          : msg("{card} is not playable yet (sideboard)", { card: name }),
      );
    }
  }
  return {
    format,
    legal: errors.length === 0,
    playable: playable && errors.length === 0,
    mainCount,
    minMain,
    welcome,
    sideCount,
    errors,
    warnings,
  };
}

/**
 * Commander (903.5, PLAN-E): one commander (legendary creature or "can be your commander"), or two that can be paired
 * (702.124: partner, Background…), exactly 100 cards commanders included, one copy of each card except basic
 * lands (and "any number", "up to N"), all within the commander's color identity, none banned or not legal
 * (`commander.json`), no sideboard. The Game Changers and the estimated bracket are given for information.
 */
function validateCommanderDeck(
  deck: { commander?: DeckEntries; main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
): DeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const commanderEntries = deck.commander ?? [];
  const commanders = commanderEntries.map(([, name]) => name);
  const sideCount = count(deck.sideboard ?? []);
  const mainCount = count(deck.main) + count(commanderEntries);
  if (commanders.length === 0) errors.push(msg("Choose a commander"));
  else if (commanders.length > 2 || count(commanderEntries) !== commanders.length)
    errors.push(msg("At most two commanders, one copy each"));
  else if (commanders.length === 2) {
    const [a, b] = commanders.map((n) => cards[n]);
    if (a && b && !canPair(a, b))
      errors.push(msg("{a} and {b} can't be commanders together (partner, Background…)", { a: a.name, b: b.name }));
  }
  if (mainCount !== COMMANDER_DECK_SIZE)
    errors.push(
      msg("The deck has {n} cards, commander included (exactly {size} are needed)", {
        n: mainCount,
        size: COMMANDER_DECK_SIZE,
      }),
    );
  if (sideCount > 0) errors.push(msg("No sideboard in Commander"));
  const identity = new Set<Color>();
  for (const name of commanders) {
    const c = cards[name];
    if (!c) continue;
    // A Background is a commander only beside a "Choose a Background" commander (702.124k).
    const paired = commanders.length === 2 && commanders.some((o) => o !== name && cards[o] && canPair(cards[o] as CardDef, c));
    if (!canBeCommander(c) && !(paired && isBackground(c)))
      errors.push(msg("{card} can't be your commander (legendary creature expected)", { card: name }));
    for (const color of colorIdentity(c)) identity.add(color);
  }
  const deckIdentity = (["W", "U", "B", "R", "G"] as Color[]).filter((x) => identity.has(x));
  const totals = new Map<string, number>();
  for (const [n, name] of [...commanderEntries, ...deck.main]) totals.set(name, (totals.get(name) ?? 0) + n);
  let playable = true;
  const gameChangers: string[] = [];
  for (const [name, n] of totals) {
    const c = cards[name];
    if (!c) {
      errors.push(msg("Unknown card: {card}", { card: name }));
      playable = false;
      continue;
    }
    if (n > copiesAllowed(c, 1)) errors.push(msg("{card}: {n} copies (only one in Commander)", { card: name, n }));
    if (commanders.length && !withinIdentity(colorIdentity(c), deckIdentity))
      errors.push(msg("{card} is outside the commander's color identity", { card: name }));
    const illegal = legalityIssue(c, "commander");
    if (illegal) errors.push(illegal);
    if (isGameChanger(c)) gameChangers.push(name);
    if (!c.implemented) {
      playable = false;
      warnings.push(msg("{card} is not playable yet", { card: name }));
    }
  }
  return {
    format: "commander",
    legal: errors.length === 0,
    playable: playable && errors.length === 0,
    mainCount,
    minMain: COMMANDER_DECK_SIZE,
    welcome: false,
    sideCount,
    errors,
    warnings,
    commanders,
    identity: deckIdentity,
    gameChangers,
    bracket: gameChangers.length === 0 ? "1–2" : gameChangers.length <= 3 ? "3" : "4+",
  };
}

/** Colors of a deck (from its spells). */
export function deckColors(main: DeckEntries, cards: Record<string, CardDef>): string[] {
  const set = new Set<string>();
  for (const [, name] of main) for (const c of cards[name]?.colors ?? []) set.add(c);
  return ["W", "U", "B", "R", "G"].filter((c) => set.has(c));
}

/**
 * Sideboarding between two games (BO3): the new deck must contain exactly the same cards, deck and sideboard together,
 * and stay legal and playable. Returns the problem, or null if the swap is valid.
 */
export function sideboardSwapError(
  original: { main: DeckEntries; sideboard?: DeckEntries },
  next: { main: DeckEntries; sideboard?: DeckEntries },
  cards: Record<string, CardDef>,
  format: Format = DEFAULT_FORMAT,
): string | null {
  const totals = (d: { main: DeckEntries; sideboard?: DeckEntries }) => {
    const m = new Map<string, number>();
    for (const [n, name] of [...d.main, ...(d.sideboard ?? [])]) m.set(name, (m.get(name) ?? 0) + n);
    return m;
  };
  const a = totals(original);
  const b = totals(next);
  if (a.size !== b.size || [...a].some(([name, n]) => b.get(name) !== n))
    return msg("The deck and the sideboard must contain the same cards as at the start of the match.");
  const v = validateDeck(next, cards, format);
  if (!v.legal) return v.errors[0] ?? msg("Illegal deck.");
  if (!v.playable) return msg("The deck contains cards that are not playable yet.");
  return null;
}
