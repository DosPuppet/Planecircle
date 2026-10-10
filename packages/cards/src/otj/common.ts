/**
 * Elements specific to Outlaws of Thunder Junction (OTJ) and The Big Score (BIG): tokens, "outlaw" filter.
 * The DSL comes from Foundations (fdn/common.ts).
 */
import { dsl, type ObjectFilter, type TokenSpec } from "@mtgx/engine";
import { creature } from "../fdn/common";

export * from "../dft/common";

const { activated, fx, ref, target } = dsl;

/** Outlaws (Assassin, Mercenary, Pirate, Rogue, Warlock). */
export const OUTLAW: ObjectFilter = { anySubtype: ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"] };
export const OUTLAW_CREATURE: ObjectFilter = { types: ["Creature"], ...OUTLAW };

/** Mercenary: 1/1 red creature with "{T}: Target creature you control gets +1/+0. Sorcery speed." */
export const MERCENARY: TokenSpec = {
  name: "Mercenary",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Mercenary"],
  power: 1,
  toughness: 1,
  abilities: [
    activated({
      tap: true,
      sorcerySpeed: true,
      targets: [target.creature("t", { controller: "you" })],
      effects: [fx.pump(ref.target(), 1, 0)],
      label: "+1/+0",
    }),
  ],
  text: "{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery.",
};

export const OX = creature("Ox", ["W"], ["Ox"], 2, 2);
export const SHEEP = creature("Sheep", ["W"], ["Sheep"], 1, 1);
export const ZOMBIE_ROGUE = creature("Zombie Rogue", ["U", "B"], ["Zombie", "Rogue"], 2, 2);
export const SPIRIT_2 = creature("Spirit", ["W"], ["Spirit"], 2, 2, { keywords: ["flying"] });
export const VARMINT = creature("Varmint", ["G"], ["Varmint"], 2, 1);
export const ELEMENTAL = creature("Elemental", ["G"], ["Elemental"], 0, 0);
export const SCORPION_DRAGON = creature("Scorpion Dragon", ["R"], ["Scorpion", "Dragon"], 4, 4, {
  keywords: ["flying", "haste"],
});
export const DINOSAUR_3_1 = creature("Dinosaur", ["R"], ["Dinosaur"], 3, 1);
export const ANGEL_3 = creature("Angel", ["W"], ["Angel"], 3, 3, { keywords: ["flying"] });
export const VAMPIRE_ROGUE = creature("Vampire Rogue", ["B"], ["Vampire", "Rogue"], 1, 1, { keywords: ["lifelink"] });
export const ELK = creature("Elk", ["G"], ["Elk"], 3, 3);
export const BIRD_1 = creature("Bird", ["U"], ["Bird"], 1, 1, { keywords: ["flying"] });
export const BAT = creature("Bat", ["B"], ["Bat"], 2, 1, { keywords: ["flying"] });

export const mercenary = (n: Parameters<typeof fx.createTokens>[1] = 1) => fx.createTokens(MERCENARY, n);
