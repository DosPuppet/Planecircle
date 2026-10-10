/**
 * Final Fantasy (FIN) specifics: Hero, Knight, Chocobo, Wizard, Moogle, Horror, Robot Warrior and Frog tokens; "Town"
 * filter. The DSL comes from Foundations (fdn/common.ts).
 */
import { type CardScript, dsl, type Keyword, msg, type ObjectFilter, type TokenSpec } from "@mtgx/engine";
import { creature } from "../fdn/common";

export * from "../otj/common";

const { fx, ref, staticAbility, triggered, when } = dsl;

export const HERO = creature("Hero", [], ["Hero"], 1, 1);
export const KNIGHT_2 = creature("Knight", ["W"], ["Knight"], 2, 2);
export const MOOGLE = creature("Moogle", ["W"], ["Moogle"], 1, 2, { keywords: ["lifelink"] });
export const HORROR = creature("Horror", ["B"], ["Horror"], 2, 2);
export const FROG = creature("Frog", ["G"], ["Frog"], 1, 1);
export const ROBOT_WARRIOR: TokenSpec = {
  name: "Robot Warrior",
  colors: ["U"],
  types: ["Artifact", "Creature"],
  subtypes: ["Robot", "Warrior"],
  power: 3,
  toughness: 3,
};
/** Chocobo: 2/2 green Bird, "whenever a land you control enters, +1/+0". */
export const CHOCOBO = creature("Bird", ["G"], ["Bird"], 2, 2, {
  abilities: [triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall: +1/+0" })],
  text: "Whenever a land you control enters, this token gets +1/+0 until end of turn.",
});
/** Wizard: 0/1 black creature, "whenever you cast a noncreature spell, 1 damage to each opponent". */
export const WIZARD_0_1 = creature("Wizard", ["B"], ["Wizard"], 0, 1, {
  abilities: [
    triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(1, ref.eachOpponent)], {
      label: "1 damage to each opponent",
    }),
  ],
  text: "Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.",
});

export const TOWN: ObjectFilter = { subtype: "Town" };
export const EQUIPMENT_YOU: ObjectFilter = { subtype: "Equipment", controller: "you" };

export const hero = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(HERO, n);
export const chocobo = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(CHOCOBO, n);
export const wizard = () => fx.createTokens(WIZARD_0_1);

/** Job Equipment: "equipped creature gets +P/+T, has [keywords] and is a [type] in addition to its other types". */
export const jobGear = (subtype: string, power: number, toughness: number, keywords: Keyword[] = []): CardScript["abilities"] => [
  staticAbility(
    "attached",
    { power, toughness, addSubtypes: [subtype], addKeywords: keywords },
    { label: msg("+{power}/+{toughness}, {subtype}", { power, toughness, subtype }) },
  ),
];
