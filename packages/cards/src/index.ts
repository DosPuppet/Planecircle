import { type CardDef, isSingleName, type NameCatalog } from "@mtgx/engine";
import legalityOverrides from "../data/legality-overrides.json";
import type { DeckEntries } from "./decklist";
import { DECKS, type DeckList } from "./decks";
import { toCardDef } from "./scryfall";
import { SETS } from "./sets";

interface LegalityOverride {
  legalities: Record<string, string>;
  since?: string;
  source?: string;
}

export {
  CardIndex,
  COMMANDER_DECK_SIZE,
  canBeCommander,
  canJoinCommander,
  canPair,
  DECK_RULES,
  DEFAULT_FORMAT,
  type DeckEntries,
  type DeckEntry,
  type DeckIssue,
  type DeckValidation,
  deckColors,
  exportName,
  FORMAT_LABELS,
  FORMATS,
  isFormat,
  isGameChanger,
  legalityIssue,
  normalizeName,
  ONLINE_FORMATS,
  type ParsedDeck,
  parseDeckList,
  serializeDeckList,
  sideboardSwapError,
  validateDeck,
} from "./decklist";
export { DECKS, type DeckList } from "./decks";
export { HANDLED_LAYOUTS, onlyKeywords, type RawCard, type RawFace, slug, toCardDef } from "./scryfall";
export { EXCLUDED_REPRINTS } from "./setRegistry";
export { type CardSet, isMainSet, SET_BY_CODE, SETS } from "./sets";
export { type TokenLike, tokenImage } from "./tokenImages";
export { TOKEN_SPECS } from "./tokens";

/** Every known card, indexed by English name (all sets; a reprint keeps the first one). */
export const CARDS: Record<string, CardDef> = {};
for (const set of SETS) {
  for (const raw of set.data) {
    const known = CARDS[raw.name];
    if (!known) {
      const def = toCardDef(raw, set.scripts[raw.name], set.code, set.scripts);
      if (raw.origin) def.origin = raw.origin;
      CARDS[raw.name] = def;
    }
    // Reprint of an already known card (PLAN-G): one more printing, with its art, which the deck can choose.
    else if (set.reprint && raw.image !== known.image) {
      const key = `${set.code}-${raw.number}`;
      if (!known.printings?.some((p) => p.key === key))
        known.printings = [
          ...(known.printings ?? []),
          {
            key,
            set: set.code,
            number: raw.number,
            image: raw.image,
            artCrop: raw.artCrop,
            ...(raw.fr?.image && raw.fr.image !== known.fr?.image ? { frImage: raw.fr.image } : {}),
          },
        ];
    }
  }
}
// Overrides of the imported legalities (PLAN-C, C19): an announced ban, in force before the next reimport.
// Format: { "<English name>": { "legalities": { "standard": "banned" }, "since": "YYYY-MM-DD", "source": "<announcement>" } }.
for (const [name, o] of Object.entries(legalityOverrides as Record<string, LegalityOverride>)) {
  const c = CARDS[name];
  if (!c) throw new Error(`legality-overrides.json: unknown card "${name}"`);
  c.legalities = { ...c.legalities, ...o.legalities };
}
// Meld: each part carries the definition of the melded card (registered with it in the game).
for (const c of Object.values(CARDS)) {
  if (c.meld?.result && !c.meldResult) c.meldResultDef = CARDS[c.meld.result];
}

export function card(name: string): CardDef {
  const c = CARDS[name];
  if (!c) throw new Error(`Unknown card: ${name}`);
  return c;
}

export function cardById(id: string): CardDef | undefined {
  return Object.values(CARDS).find((c) => c.id === id) ?? CARDS[id];
}

export function buildDeck(list: Pick<DeckList, "main">): CardDef[] {
  const out: CardDef[] = [];
  for (const [n, name] of list.main) for (let i = 0; i < n; i++) out.push(card(name));
  return out;
}

/**
 * Deck of a game (PLAN-E): in Commander, the commander(s) first, then the deck; `commanders` gives their indices (to
 * pass in `PlayerSetup.commanders`), `printings` the printing of each card, in the same order; `sideboard` and
 * `sideboardPrintings` likewise (`PlayerSetup.sideboard`).
 */
export function buildGameDeck(list: Pick<DeckList, "main" | "commander" | "sideboard">): {
  deck: CardDef[];
  commanders?: number[];
  printings?: (string | null)[];
  sideboard?: CardDef[];
  sideboardPrintings?: (string | null)[];
} {
  const commander = list.commander ?? [];
  const entries = [...commander, ...list.main];
  const deck = buildDeck({ main: entries });
  const printings = deckPrintings({ main: entries });
  const commanders = commander.length ? Array.from({ length: commander.reduce((a, [n]) => a + n, 0) }, (_, i) => i) : undefined;
  return {
    deck,
    ...(commanders ? { commanders } : {}),
    ...(printings ? { printings } : {}),
    ...gameSideboard(list),
  };
}

/**
 * The sideboard of a game, outside the game (400.11b): its cards that the engine knows how to play (a card not
 * handled yet may stay in a sideboard, `validateDeck`).
 */
export function sideboardInGame(side: DeckEntries | undefined): DeckEntries {
  return (side ?? []).filter(([, name]) => CARDS[name]?.implemented);
}

/** The sideboard of a game (`sideboardInGame`) and its printings, to pass in `PlayerSetup`; nothing without one. */
export function gameSideboard(list: Pick<DeckList, "sideboard">): {
  sideboard?: CardDef[];
  sideboardPrintings?: (string | null)[];
} {
  const entries = sideboardInGame(list.sideboard);
  if (!entries.length) return {};
  const printings = deckPrintings({ main: entries });
  return { sideboard: buildDeck({ main: entries }), ...(printings ? { sideboardPrintings: printings } : {}) };
}

/**
 * Printing chosen for each card of `buildDeck` (same order), or `undefined` if the deck chooses none: to pass in
 * `PlayerSetup.printings` (the engine ignores a printing the card does not have).
 */
export function deckPrintings(list: Pick<DeckList, "main">): (string | null)[] | undefined {
  if (!list.main.some((e) => e[2])) return undefined;
  return list.main.flatMap(([n, , key]) => Array.from({ length: n }, () => key ?? null));
}

export function deckById(id: string): DeckList {
  const d = DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown deck: ${id}`);
  return d;
}

export const implementedCards = (): CardDef[] => Object.values(CARDS).filter((c) => c.implemented);

let names: NameCatalog | undefined;

/**
 * Catalog of nameable names ("choose a card name"): every known card and each of its faces (not the full name
 * "A // B" of a multi-faced card), sorted; to register in the engine (`registerNameCatalog`) by each host of a game.
 */
export function nameCatalog(): NameCatalog {
  if (names) return names;
  const cards = new Set<string>();
  const lands = new Set<string>();
  for (const c of Object.values(CARDS))
    for (const d of [c, ...(c.faceDefs ?? [])]) {
      // 201.3: each face is a card name; the full name "A // B" is not one.
      if (!isSingleName(d.name)) continue;
      cards.add(d.name);
      if (d.types.includes("Land")) lands.add(d.name);
    }
  names = { cards: [...cards].sort(), lands: [...lands].sort() };
  return names;
}
