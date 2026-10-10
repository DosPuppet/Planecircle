/**
 * Shared pieces of Murders at Karlov Manor (MKM): the set's tokens and the suspect helpers (701.60). The DSL and the
 * common tokens (Clue, Thopter, Dog…) come from the earlier sets (through lci/common.ts).
 */
import type { ObjectFilter, TokenSpec } from "@mtgx/engine";
import { creature as creatureToken } from "../fdn/common";
import { fx, ref, triggered, when } from "../lci/common";

export * from "../lci/common";

/** A creature token whose only creature type is its name. */
const creature = (
  name: string,
  colors: TokenSpec["colors"],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => creatureToken(name, colors, [name], power, toughness, extra);

/** Detective: 2/2 white and blue creature. */
export const DETECTIVE: TokenSpec = creature("Detective", ["W", "U"], 2, 2);
/** Skeleton: 2/1 black creature. */
export const SKELETON_B: TokenSpec = creature("Skeleton", ["B"], 2, 1);
/** Spirit: 1/1 white and black creature with flying. */
export const SPIRIT_WB: TokenSpec = creature("Spirit", ["W", "B"], 1, 1, { keywords: ["flying"] });
/** Spider: 2/1 black and green creature with reach and menace. */
export const SPIDER_BG: TokenSpec = creature("Spider", ["B", "G"], 2, 1, { keywords: ["reach", "menace"] });
/** Imp: 2/2 red creature with "When this token dies, it deals 2 damage to each opponent." */
export const IMP: TokenSpec = creature("Imp", ["R"], 2, 2, {
  abilities: [triggered(when.diesSelf, [fx.damage(2, ref.eachOpponent)], { label: "2 damage to each opponent" })],
  text: "When this token dies, it deals 2 damage to each opponent.",
});
/** Merfolk: 1/1 blue creature. */
export const MERFOLK_U: TokenSpec = creature("Merfolk", ["U"], 1, 1);

/** "suspected creature" (701.60). */
export const SUSPECTED: ObjectFilter = { types: ["Creature"], suspected: true };
