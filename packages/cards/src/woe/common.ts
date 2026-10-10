/**
 * Common parts of Wilds of Eldraine (WOE): Roles (Aura tokens, 303.7, 704.5y), Celebration and the set's tokens. The
 * DSL and the generic tokens come from the previous sets (through lci/common.ts).
 */
import type { AbilityDef, Condition, dsl, LayerMods, Ref, TokenSpec } from "@mtgx/engine";
import { creature } from "../fdn/common";
import { amount, cond, cost, fx, ref, staticAbility, triggered, wardAbility, when } from "../lci/common";

export * from "../lci/common";

/** Knight: 2/2 white creature with vigilance. */
export const KNIGHT_VIGILANCE: TokenSpec = creature("Knight", ["W"], ["Knight"], 2, 2, { keywords: ["vigilance"] });
/** Human: 1/1 white creature. */
export const HUMAN_W: TokenSpec = creature("Human", ["W"], ["Human"], 1, 1);

/** A Role: colorless enchantment token, Aura ("Enchant creature"), subtype Role. */
const role = (name: string, abilities: AbilityDef[], text: string): TokenSpec => ({
  name: `${name} Role`,
  colors: [],
  types: ["Enchantment"],
  subtypes: ["Aura", "Role"],
  enchant: { filter: { types: ["Creature"] }, label: "creature" },
  abilities,
  text: `Enchant creature\n${text}`,
});

const plusOne = (label: string, extra: LayerMods = {}) =>
  staticAbility("attached", { power: 1, toughness: 1, ...extra }, { label });

/** Cursed Role: "Enchanted creature is 1/1." */
export const CURSED_ROLE = role(
  "Cursed",
  [staticAbility("attached", { setPower: 1, setToughness: 1 }, { label: "Enchanted creature is 1/1" })],
  "Enchanted creature is 1/1.",
);
/** Monster Role: +1/+1 and trample. */
export const MONSTER_ROLE = role(
  "Monster",
  [plusOne("Gets +1/+1 and has trample", { addKeywords: ["trample"] })],
  "Enchanted creature gets +1/+1 and has trample.",
);
/** Royal Role: +1/+1 and ward {1}. */
export const ROYAL_ROLE = role(
  "Royal",
  [plusOne("+1/+1 and ward {1}", { addAbilities: [wardAbility({ mana: cost("{1}") })] })],
  "Enchanted creature gets +1/+1 and has ward {1}.",
);
/** Sorcerer Role: +1/+1 and "Whenever this creature attacks, scry 1." */
export const SORCERER_ROLE = role(
  "Sorcerer",
  [
    plusOne("+1/+1; when attacking, scry 1", {
      addAbilities: [triggered(when.attacksSelf, [fx.scry(1)], { label: "Scry 1" })],
    }),
  ],
  'Enchanted creature gets +1/+1 and has "Whenever this creature attacks, scry 1."',
);
/** Wicked Role: +1/+1; put into a graveyard, each opponent loses 1 life. */
export const WICKED_ROLE = role(
  "Wicked",
  [
    plusOne("+1/+1"),
    triggered({ on: "leaves", who: "self", to: "graveyard" }, [fx.loseLife(1, ref.eachOpponent)], {
      label: "Put into a graveyard: each opponent loses 1 life",
    }),
  ],
  "Enchanted creature gets +1/+1.\nWhen this token is put into a graveyard, each opponent loses 1 life.",
);
/** Young Hero Role: "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it." */
export const YOUNG_HERO_ROLE = role(
  "Young Hero",
  [
    staticAbility(
      "attached",
      {
        addAbilities: [
          triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], {
            condition: cond.sourceMatches({ maxToughness: 3 }),
            label: "Toughness 3 or less: a +1/+1 counter",
          }),
        ],
      },
      { label: "When attacking, if its toughness is 3 or less: a +1/+1 counter" },
    ),
  ],
  'Enchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it."',
);

/**
 * "Create a [N] Role token attached to [the creature]" (or to each of the designated creatures): nothing is created for
 * a creature that is no longer on the battlefield (303.7b); another Role of the same player on it goes to the
 * graveyard (704.5y).
 */
export function createRole(token: TokenSpec, to: Ref = ref.target()): dsl.Effects {
  return [fx.createTokens(token, 1, undefined, undefined, to)];
}

/** Celebration: "if two or more nonland permanents entered the battlefield under your control this turn". */
export const CELEBRATION: Condition = cond.amountAtLeast(
  amount.turnEvents({ event: "zone", to: "battlefield", notTypes: ["Land"], who: "you" }),
  2,
);
