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

/** A rule printed on the card ("can't be countered", "has flash as long as…"), if it has it. */
export function cardRule<K extends keyof CardRules>(d: CardDef | undefined, key: K): CardRules[K] | undefined {
  return d?.rules?.[key];
}
