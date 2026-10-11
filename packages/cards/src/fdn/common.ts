/**
 * Shared building blocks of the Foundations scripts: DSL, tokens, common filters.
 */
import { type Amount, dsl, type Effect, type ObjectFilter, type TargetSpec, type TokenSpec } from "@mtgx/engine";

export const {
  SACRIFICE_TOKEN_AT_END_STEP,
  target,
  ref,
  fx,
  amount,
  cmp,
  spell,
  modal,
  bothIfKicked,
  mode,
  manaAbility,
  activated,
  triggered,
  triggeredModal,
  chapter,
  when,
  cond,
  staticAbility,
  entersWith,
  costReducer,
  flashForAll,
  loyalty,
  loyaltyX,
  castPermission,
  playerStatic,
  graveyardReplacement,
  eventReplacement,
  doesntUntap,
  prevention,
  cost,
  wardAbility,
  exhaust,
  equipAbility,
  craft,
  spree,
  oneOrMore,
  tiered,
  escalate,
  altCostMode,
  pawprint,
  block,
  blockAbility,
  myriadAbility,
  exploitAbility,
  embalmAbility,
  protection,
  protectionAbility,
  powerFor,
  powerRuleAbility,
  firebending,
  flashback,
  fromGraveyard,
  flashFor,
  altCost,
  kicker,
  TO_CREATURE,
  TO_OPPONENT,
  TO_PLAYER,
  TO_PLAYER_OR_PLANESWALKER,
} = dsl;

/** Any target described by an object filter. */
export function targetObj(id: string, filter: ObjectFilter, label: string): TargetSpec {
  return { id, label, filter: { objects: filter } };
}

export const CREATURE_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
export const OTHER_CREATURE_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you", other: true };
export const CREATURE_OPP: ObjectFilter = { types: ["Creature"], controller: "opponent" };
export const INSTANT_SORCERY: ObjectFilter = { types: ["Instant", "Sorcery"] };
export const BASIC_LAND: ObjectFilter = { types: ["Land"], basic: true };
export const WITH_P1P1: ObjectFilter = { types: ["Creature"], controller: "you", withCounter: "+1/+1" };
/** "artifact, enchantment, or creature with flying" */
export const ART_ENCH_OR_FLYER: ObjectFilter = {
  anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], keyword: "flying" }],
};

/** A creature token: name, colors, creature types, power and toughness, other characteristics (`extra`). */
export const creature = (
  name: string,
  colors: TokenSpec["colors"],
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({ name, colors, types: ["Creature"], subtypes, power, toughness, ...extra });

export const GOBLIN = creature("Goblin", ["R"], ["Goblin"], 1, 1);
export const DRAGON = creature("Dragon", ["R"], ["Dragon"], 4, 4, { keywords: ["flying"] });
export const DRAGON_5 = creature("Dragon", ["R"], ["Dragon"], 5, 5, { keywords: ["flying"] });
export const ELF_WARRIOR = creature("Elf Warrior", ["G"], ["Elf", "Warrior"], 1, 1);
export const BEAST = creature("Beast", ["G"], ["Beast"], 4, 4);
export const CAT = creature("Cat", ["W"], ["Cat"], 1, 1);
export const KNIGHT = creature("Knight", ["W"], ["Knight"], 3, 3);
export const RABBIT = creature("Rabbit", ["W"], ["Rabbit"], 1, 1);
export const SOLDIER = creature("Soldier", ["W"], ["Soldier"], 1, 1);
export const HUMAN = creature("Human", ["W"], ["Human"], 1, 1);
export const SPIRIT = creature("Spirit", ["W"], ["Spirit"], 1, 1, { keywords: ["flying"] });
export const FAERIE = creature("Faerie", ["U"], ["Faerie"], 1, 1, { keywords: ["flying"] });
export const DRAKE = creature("Drake", ["U"], ["Drake"], 2, 2, { keywords: ["flying"] });
export const SCION_OF_THE_DEEP = creature("Scion of the Deep", ["U"], ["Octopus"], 8, 8, { legendary: true });
export const RAT = creature("Rat", ["B"], ["Rat"], 1, 1);
export const INSECT = creature("Insect", ["B", "G"], ["Insect"], 1, 1, { keywords: ["flying"] });
export const KOMAS_COIL = creature("Koma's Coil", ["U"], ["Serpent"], 3, 3);
export const FISH = creature("Fish", ["U"], ["Fish"], 1, 1);
export const NINJA = creature("Ninja", ["U"], ["Ninja"], 2, 1);
export const ZOMBIE = creature("Zombie", ["B"], ["Zombie"], 2, 2);
export const CAT_2 = creature("Cat", ["W"], ["Cat"], 2, 2);
export const CAT_BEAST = creature("Cat Beast", ["W"], ["Cat", "Beast"], 2, 2);
export const CAT_LIFELINK = creature("Cat", ["W"], ["Cat"], 1, 1, { keywords: ["lifelink"] });
export const DOG = creature("Dog", ["W"], ["Dog"], 1, 1);
export const RAT_NO_BLOCK = creature("Rat", ["B"], ["Rat"], 1, 1, {
  keywords: ["cantBlock"],
  text: "This creature can't block.",
});
export const PHYREXIAN_GOBLIN = creature("Phyrexian Goblin", ["R"], ["Phyrexian", "Goblin"], 1, 1);
export const BEAST_3 = creature("Beast", ["G"], ["Beast"], 3, 3);
export const RACCOON = creature("Raccoon", ["G"], ["Raccoon"], 3, 3);

export const TREASURE: TokenSpec = {
  name: "Treasure",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Treasure"],
  abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { sacrifice: true })],
  text: "{T}, Sacrifice this artifact: Add one mana of any color.",
};
export const FOOD: TokenSpec = {
  name: "Food",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Food"],
  abilities: [activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 life" })],
  text: "{2}, {T}, Sacrifice this artifact: You gain 3 life.",
};
/** Clue (investigate, 701.16): "{2}, Sacrifice this artifact: Draw a card." */
export const CLUE: TokenSpec = {
  name: "Clue",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Clue"],
  abilities: [activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" })],
  text: "{2}, Sacrifice this artifact: Draw a card.",
};
/** Map (Ixalan): "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery." */
export const MAP: TokenSpec = {
  name: "Map",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Map"],
  abilities: [
    activated({
      mana: "{1}",
      tap: true,
      sacrifice: true,
      sorcerySpeed: true,
      targets: [target.creature("t", { controller: "you" })],
      effects: [fx.explore(ref.target())],
      label: "A creature explores",
    }),
  ],
  text: "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.",
};
/** "Investigate" (701.16): create a Clue token. */
export const investigate = (n: Amount = 1): Effect => fx.createTokens(CLUE, n);

export type { CardScript } from "@mtgx/engine";
