/**
 * Lookups in the grouped fields of a card definition (PLAN-M M5): cast options by kind, card rules by key. Always by
 * kind, never by position in the list, so the order in which `singleDef` writes them doesn't matter.
 */
import type { CardDef, CardRules, CastOption } from "./types";

/** The cast option of this kind. */
export type CastOptionOf<K extends CastOption["kind"]> = Extract<CastOption, { kind: K }>;

/** The card's cast option of this kind (a card has at most one of each kind). */
export function castOption<K extends CastOption["kind"]>(d: CardDef | undefined, kind: K): CastOptionOf<K> | undefined {
  const options = d?.castOptions;
  if (!options) return undefined;
  for (const o of options) if (o.kind === kind) return o as CastOptionOf<K>;
  return undefined;
}

/** "Choose two / three / four" (700.2): the number of modes the text has you choose. */
const CHOOSE_N = /\bchoose (two|three|four)\b/i;
const NUMBERS: Record<string, number> = { two: 2, three: 3, four: 4 };

/**
 * Number of times a mode is chosen for a modal spell cast with the mode entry `index` (700.2, Riku of Many Paths): the
 * entry's `chosen` (combinations), otherwise the number the text says ("choose two"), otherwise 1; 0 for a spell that
 * isn't modal (a single entry).
 */
export function modesChosen(d: CardDef | undefined, index: number): number {
  const modes = d?.spell?.modes ?? [];
  if (modes.length < 2) return 0;
  const n = modes[index]?.chosen;
  if (n !== undefined) return n;
  const word = CHOOSE_N.exec(d?.text ?? "")?.[1]?.toLowerCase();
  return (word && NUMBERS[word]) || 1;
}

/** A rule printed on the card ("can't be countered", "has flash as long as…"), if it has it. */
export function cardRule<K extends keyof CardRules>(d: CardDef | undefined, key: K): CardRules[K] | undefined {
  return d?.rules?.[key];
}
