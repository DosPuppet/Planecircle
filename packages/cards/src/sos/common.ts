/**
 * Secrets of Strixhaven (SOS) building blocks: the set's tokens and the mechanic helpers (Repartee, Infusion, Opus,
 * Increment). The DSL and the common tokens come from lci/common.ts.
 */
import type { Condition, dsl, Effect, TokenSpec, TriggeredAbilityDef, TriggerSpec } from "@mtgx/engine";
import { creature as creatureToken } from "../fdn/common";
import { amount, cond, fx, INSTANT_SORCERY, ref, triggered, when } from "../lci/common";

export * from "../lci/common";

/** A creature token whose only creature type is its name. */
const creature = (
  name: string,
  colors: TokenSpec["colors"],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => creatureToken(name, colors, [name], power, toughness, extra);

/** Pest: 1/1 black and green creature with "Whenever this token attacks, you gain 1 life." */
export const PEST: TokenSpec = creature("Pest", ["B", "G"], 1, 1, {
  abilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gain 1 life" })],
  text: "Whenever this token attacks, you gain 1 life.",
});
/** Inkling: 1/1 white and black creature with flying. */
export const INKLING: TokenSpec = creature("Inkling", ["W", "B"], 1, 1, { keywords: ["flying"] });
/** Spirit: 2/2 red and white creature. */
export const SPIRIT_RW: TokenSpec = creature("Spirit", ["R", "W"], 2, 2);
/** Fractal: 0/0 green and blue creature (it gets +1/+1 counters as it enters). */
export const FRACTAL: TokenSpec = creature("Fractal", ["G", "U"], 0, 0);
/** Elemental: 3/3 blue and red creature with flying. */
export const ELEMENTAL_UR: TokenSpec = creature("Elemental", ["U", "R"], 3, 3, { keywords: ["flying"] });

/** Repartee: "Whenever you cast an instant or sorcery spell that targets a creature". */
export const REPARTEE: TriggerSpec = when.castSpell("you", INSTANT_SORCERY, { objects: { types: ["Creature"] } });

/** Infusion: "if you gained life this turn". */
export const INFUSION: Condition = cond.lifeGainedAtLeast(1);

/** Opus: "Whenever you cast an instant or sorcery spell"; `OPUS_BIG`: five or more mana spent. */
export const OPUS: TriggerSpec = when.castSpell("you", INSTANT_SORCERY);
export const OPUS_BIG: Condition = cond.amountAtLeast(amount.eventManaSpent, 5);

/**
 * Increment: "Whenever you cast a spell, if the amount of mana you spent is greater than this creature's power or
 * toughness, put a +1/+1 counter on this creature."
 */
export const INCREMENT: TriggeredAbilityDef = triggered(when.castSpell("you"), [fx.addCounters(ref.self, 1)], {
  condition: cond.any(
    cond.amountAtLeast(amount.plus(amount.eventManaSpent, amount.neg(amount.powerOf(ref.self))), 1),
    cond.amountAtLeast(amount.plus(amount.eventManaSpent, amount.neg(amount.toughnessOf(ref.self))), 1),
  ),
  label: "Increment: a +1/+1 counter",
});

/** Opus "…. If five or more mana was spent to cast that spell, … instead": one effect or the other. */
export function opusInstead(normal: dsl.Effects, big: dsl.Effects): Effect[] {
  return [...fx.when(cond.not(OPUS_BIG), ...normal), ...fx.when(OPUS_BIG, ...big)];
}
