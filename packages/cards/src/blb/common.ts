/**
 * Bloomburrow (BLB) specifics: Otter, Bat, Snail, Squirrel, Wall, Sword… tokens, valiant, expend and forage helpers,
 * filters of the animal kins. The DSL comes from Foundations (via dsk/common.ts).
 */
import { type AbilityDef, type dsl, msg, type ObjectFilter, type TokenSpec } from "@mtgx/engine";
import { activated, cond, equipAbility, fx, staticAbility, triggered, when } from "../dsk/common";
import { creature } from "../fdn/common";

type Effects = dsl.Effects;
type TriggerOpts = NonNullable<Parameters<typeof triggered>[2]>;

export * from "../dsk/common";

/** Otter: 1/1 blue and red creature with prowess. */
export const OTTER = creature("Otter", ["U", "R"], ["Otter"], 1, 1, { keywords: ["prowess"] });
export const BAT_1 = creature("Bat", ["B"], ["Bat"], 1, 1, { keywords: ["flying"] });
export const SNAIL = creature("Snail", ["B"], ["Snail"], 1, 1);
export const SQUIRREL = creature("Squirrel", ["G"], ["Squirrel"], 1, 1);
export const WALL = creature("Wall", ["W"], ["Wall"], 0, 4, { keywords: ["defender"] });
/** Vren's Rat: "this token gets +1/+1 for each other Rat you control". */
export const VREN_RAT = creature("Rat", ["B"], ["Rat"], 1, 1, {
  abilities: [
    staticAbility(
      "self",
      { power: 1, toughness: 1 },
      { per: { types: ["Creature"], subtype: "Rat", controller: "you", other: true }, label: "+1/+1 for each other Rat" },
    ),
  ],
  text: "This token gets +1/+1 for each other Rat you control.",
});

/** Sword (Blacksmith's Talent): colorless Equipment, "+1/+1", equip {2}. */
export const SWORD: TokenSpec = {
  name: "Sword",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  abilities: [
    staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    equipAbility({ mana: "{2}", label: "Equip {2}" }),
  ],
  text: "Equipped creature gets +1/+1.\nEquip {2}",
};
/** Cragflame (Mabel): legendary Equipment, "+1/+1, vigilance, trample, and haste", equip {2}. */
export const CRAGFLAME: TokenSpec = {
  name: "Cragflame",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  legendary: true,
  abilities: [
    staticAbility(
      "attached",
      { power: 1, toughness: 1, addKeywords: ["vigilance", "trample", "haste"] },
      { label: "+1/+1, vigilance, trample, haste" },
    ),
    equipAbility({ mana: "{2}", label: "Equip {2}" }),
  ],
  text: "Equipped creature gets +1/+1 and has vigilance, trample, and haste.\nEquip {2}",
};

/** Food ability: "{2}, {T}, Sacrifice this permanent: You gain 3 life." */
export const FOOD_ABILITY: AbilityDef = activated({
  mana: "{2}",
  tap: true,
  sacrifice: true,
  effects: [fx.gainLife(3)],
  label: "+3 life",
});

export const otter = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(OTTER, n);

/** Animal kins ("Rabbits, Bats, Birds, and/or Mice you control"). */
export const kin = (subtypes: string[], extra: ObjectFilter = {}): ObjectFilter => ({
  types: ["Creature"],
  anySubtype: subtypes,
  controller: "you",
  ...extra,
});
export const FLYER_YOU: ObjectFilter = { types: ["Creature"], controller: "you", keyword: "flying" };
export const NONFLYER_YOU: ObjectFilter = { types: ["Creature"], controller: "you", not: { keyword: "flying" } };
export const TOKEN_YOU: ObjectFilter = { token: true, controller: "you" };

/** Valiant: "whenever this creature becomes the target of a spell or ability you control for the first time each turn". */
export const valiant = (effects: Effects, opts: TriggerOpts = {}) =>
  triggered(when.valiant, effects, {
    ...opts,
    oncePerTurn: true,
    label: opts.label ? msg("Valiant — {label}", { label: opts.label }) : msg("Valiant"),
  });

/** Expend N: "whenever you expend N" (you spend your Nth total mana to cast spells during a turn). */
export const expend = (n: 4 | 8, effects: Effects, opts: TriggerOpts = {}) =>
  triggered(when.expend(n), effects, {
    ...opts,
    label: opts.label ? msg("Expend {n} — {label}", { n, label: opts.label }) : msg("Expend {n}", { n }),
  });

/** "You gained or lost life this turn." */
export const GAINED_OR_LOST = cond.any(cond.lifeGainedAtLeast(1), cond.lostLife);

/** Threshold: "as long as seven or more cards are in your graveyard". */
export const THRESHOLD = cond.threshold;

/** "When this permanent enters and when you sacrifice it, …" (Carrot Cake, Heaped Harvest). */
export const entersAndSacrificed = (effects: Effects, label: string): AbilityDef[] => [
  triggered(when.entersSelf, effects, { label }),
  triggered(when.sacrifice({ self: true }), effects, { label }),
];
