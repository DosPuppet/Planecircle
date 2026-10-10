/**
 * Duskmourn: House of Horror (DSK) specifics: Glimmer, Spirit, Toy, Horror, Gremlin… tokens, Survival and Eerie
 * helpers, common filters. The DSL comes from Foundations (via fin/common.ts).
 */
import type { CardScript, Condition, dsl, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { BASIC_LAND_TYPES, msg } from "@mtgx/engine";
import { creature } from "../fdn/common";
import { cond, entersWith, fx, manaAbility, triggered, when } from "../fin/common";

type Effects = dsl.Effects;

export * from "../fin/common";

/** Glimmer: 1/1 white enchantment creature. */
export const GLIMMER: TokenSpec = creature("Glimmer", ["W"], ["Glimmer"], 1, 1, { types: ["Enchantment", "Creature"] });
export const SPIRIT_3_1 = creature("Spirit", ["W"], ["Spirit"], 3, 1, { keywords: ["flying"] });
export const INSECT_2_1 = creature("Insect", ["W"], ["Insect"], 2, 1, { keywords: ["flying"] });
export const TOY: TokenSpec = creature("Toy", ["W"], ["Toy"], 1, 1, { types: ["Artifact", "Creature"] });
export const HORROR_ENCHANTMENT: TokenSpec = creature("Horror", ["B"], ["Horror"], 2, 2, { types: ["Enchantment", "Creature"] });
export const DEMON_6: TokenSpec = creature("Demon", ["B"], ["Demon"], 6, 6, { keywords: ["flying"] });
export const GREMLIN = creature("Gremlin", ["R"], ["Gremlin"], 1, 1);
export const SPIDER = creature("Spider", ["G"], ["Spider"], 2, 2, { keywords: ["reach"] });
/** Blue X/X flying Spirit (power and toughness set on creation). */
export const SPIRIT_BLUE = creature("Spirit", ["U"], ["Spirit"], 0, 0, { keywords: ["flying"] });
/** Everywhere: colorless land with every basic land type. */
export const EVERYWHERE: TokenSpec = {
  name: "Everywhere",
  colors: [],
  types: ["Land"],
  subtypes: [...BASIC_LAND_TYPES],
  abilities: [manaAbility(["W", "U", "B", "R", "G"])],
  text: "({T}: Add {W}, {U}, {B}, {R}, or {G}.)",
};

export const glimmer = (n = 1) => fx.createTokens(GLIMMER, n);

export const GLIMMER_CREATURE: ObjectFilter = { types: ["Creature"], subtype: "Glimmer" };
export const CREATURE_OR_ENCHANTMENT: ObjectFilter = { types: ["Creature", "Enchantment"] };
export const ROOM: ObjectFilter = { subtype: "Room" };

const TAPPED: Condition = cond.sourceMatches({ tapped: true });

/** Survival: "At the beginning of your second main phase, if this creature is tapped, …". */
export const survival = (
  effects: Effects,
  opts: Omit<NonNullable<Parameters<typeof triggered>[2]>, "condition"> & { condition?: Condition } = {},
) =>
  triggered(when.secondMain, effects, {
    ...opts,
    condition: opts.condition ? cond.all(TAPPED, opts.condition) : TAPPED,
    label: opts.label ? msg("Survival — {label}", { label: opts.label }) : msg("Survival —"),
  });

/** Eerie: "Whenever an enchantment you control enters and whenever you fully unlock a Room, …". */
export const eerie = (effects: Effects, opts: NonNullable<Parameters<typeof triggered>[2]> = {}) =>
  triggered(when.eerie, effects, {
    ...opts,
    label: opts.label ? msg("Eerie — {label}", { label: opts.label }) : msg("Eerie —"),
  });

/** "This land enters tapped unless a player has 13 or less life." */
const NO_PLAYER_AT_13: Condition = cond.all(cond.lifeAtLeast(14), cond.not(cond.opponentLifeAtMost(13)));
export const fastLand = (a: "W" | "U" | "B" | "R" | "G", b: "W" | "U" | "B" | "R" | "G"): CardScript => ({
  abilities: [
    entersWith({ tapped: true, condition: NO_PLAYER_AT_13, label: "Tapped unless a player has 13 or less life" }),
    manaAbility([a, b]),
  ],
});
