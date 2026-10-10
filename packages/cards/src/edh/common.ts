/**
 * Shared pieces of the scripts of the Commander pseudo-set (EDH, PLAN-E): the DSL and the tokens of the other sets
 * (through Tarkir: Dragonstorm), plus those of the Commander decks.
 */
import type { AbilityDef, ManaType, TokenSpec } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import { creature } from "../fdn/common";
import { activated, amount, cond, fx, manaAbility, ref, triggered, when } from "../tdm/common";

export * from "../tdm/common";

/** 1/1 black Vampire (Edgar Markov). */
export const VAMPIRE_BLACK: TokenSpec = creature("Vampire", ["B"], ["Vampire"], 1, 1);
/** 2/2 black Vampire with flying (Bloodline Keeper). */
export const VAMPIRE_FLYING: TokenSpec = creature("Vampire", ["B"], ["Vampire"], 2, 2, { keywords: ["flying"] });
/** 1/1 white and black Vampire with lifelink (Edgar Markov's Coffin). */
export const VAMPIRE_WB_LIFELINK: TokenSpec = creature("Vampire", ["W", "B"], ["Vampire"], 1, 1, { keywords: ["lifelink"] });
/** Powerstone: artifact "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell". */
export const POWERSTONE: TokenSpec = {
  name: "Powerstone",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Powerstone"],
  abilities: [manaAbility("C", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  text: "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.",
};
/** The five colors, for "one mana of any color". */
/** 0/1 colorless Eldrazi Spawn: "Sacrifice this token: Add {C}." (The Vision, Pawn of Ulamog). */
export const ELDRAZI_SPAWN: TokenSpec = {
  name: "Eldrazi Spawn",
  colors: [],
  types: ["Creature"],
  subtypes: ["Eldrazi", "Spawn"],
  power: 0,
  toughness: 1,
  abilities: [manaAbility("C", 1, { sacrifice: true, noTap: true })],
  text: "Sacrifice this token: Add {C}.",
};
export const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/**
 * Evolve (702.100): "whenever a creature you control enters, if that creature has greater power or toughness than
 * this creature, put a +1/+1 counter on this creature" (checked on trigger and on resolution).
 */
export const evolve = triggered(
  when.enters({ types: ["Creature"], controller: "you", other: true }),
  [fx.addCounters(ref.self, 1)],
  {
    condition: cond.any(
      cond.amountGreater(amount.powerOf(ref.eventObject), amount.powerOf(ref.self)),
      cond.amountGreater(amount.toughnessOf(ref.eventObject), amount.toughnessOf(ref.self)),
    ),
    label: "Evolve",
  },
);

/**
 * Ninjutsu (702.49): "[cost], return an unblocked attacker you control to hand: put this card onto the battlefield from
 * your hand tapped and attacking"; it attacks what the returned creature was attacking (702.49c).
 */
export const ninjutsu = (cost: string, opts: { commander?: boolean } = {}): AbilityDef =>
  activated({
    mana: cost,
    fromHand: true,
    // Commander ninjutsu (702.49d): from the hand or the command zone.
    ...(opts.commander ? { fromCommand: true } : {}),
    returnUnblockedAttacker: true,
    effects: [fx.toBattlefield(ref.self, { tapped: true, attacking: ref.cost("defender") })],
    label: opts.commander ? msg("Commander ninjutsu {cost}", { cost }) : msg("Ninjutsu {cost}", { cost }),
  });
