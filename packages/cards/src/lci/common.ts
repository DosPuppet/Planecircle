/**
 * The Lost Caverns of Ixalan (LCI) specifics: Gnome, Fungus, Dinosaur, Vampire, Golem… tokens, Cave filters. The DSL
 * and the generic tokens come from Bloomburrow (via blb/common.ts).
 */
import type { Amount, Condition, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { amount, cond } from "../blb/common";
import { creature } from "../fdn/common";

export * from "../blb/common";

/** Gnome: 1/1 colorless artifact creature. */
export const GNOME: TokenSpec = { ...creature("Gnome", [], ["Gnome"], 1, 1), types: ["Artifact", "Creature"] };
/** Fungus: 1/1 black creature with "this token can't block". */
export const FUNGUS: TokenSpec = creature("Fungus", ["B"], ["Fungus"], 1, 1, {
  keywords: ["cantBlock"],
  text: "This token can't block.",
});
export const DINOSAUR_3_3: TokenSpec = creature("Dinosaur", ["G"], ["Dinosaur"], 3, 3);
export const DINOSAUR_EGG: TokenSpec = creature("Dinosaur Egg", ["G"], ["Dinosaur", "Egg"], 0, 1);
export const ANGEL_4: TokenSpec = creature("Angel", ["W"], ["Angel"], 4, 4, { keywords: ["flying", "vigilance"] });
export const MERFOLK_HEXPROOF: TokenSpec = creature("Merfolk", ["U"], ["Merfolk"], 1, 1, { keywords: ["hexproof"] });
export const SKELETON_PIRATE: TokenSpec = creature("Skeleton Pirate", ["B"], ["Skeleton", "Pirate"], 2, 2);
export const VAMPIRE_LIFELINK: TokenSpec = creature("Vampire", ["W"], ["Vampire"], 1, 1, { keywords: ["lifelink"] });
export const VAMPIRE_DEMON: TokenSpec = creature("Vampire Demon", ["W", "B"], ["Vampire", "Demon"], 4, 3, {
  keywords: ["flying"],
});
export const GOLEM_4: TokenSpec = { ...creature("Golem", ["W", "U"], ["Golem"], 4, 4), types: ["Artifact", "Creature"] };
export const SPIRIT_3_2: TokenSpec = creature("Spirit", ["R", "W"], ["Spirit"], 3, 2);
/** Fungus Dinosaur (The Skullspore Nexus): X/X green creature. */
export const FUNGUS_DINOSAUR: TokenSpec = creature("Fungus Dinosaur", ["G"], ["Fungus", "Dinosaur"], 0, 0);

const ARTIFACT_OR_CREATURE_YOU: ObjectFilter = {
  anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }],
  controller: "you",
};
/** Gnome Soldier (Thousand Moons Smithy): P/T equal to the number of artifacts and/or creatures you control. */
export const GNOME_SOLDIER: TokenSpec = {
  name: "Gnome Soldier",
  colors: ["W"],
  types: ["Artifact", "Creature"],
  subtypes: ["Gnome", "Soldier"],
  cdaPT: amount.count(ARTIFACT_OR_CREATURE_YOU),
  text: "This token's power and toughness are each equal to the number of artifacts and/or creatures you control.",
};

/** "artifact or creature" (and "artifacts and/or creatures you control"). */
export const ARTIFACT_OR_CREATURE: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] };
export const ARTIFACT_OR_CREATURE_YOURS: ObjectFilter = ARTIFACT_OR_CREATURE_YOU;
export const OTHER_ARTIFACT_OR_CREATURE_YOURS: ObjectFilter = { ...ARTIFACT_OR_CREATURE_YOU, other: true };
export const DINOSAUR_YOU: ObjectFilter = { types: ["Creature"], subtype: "Dinosaur", controller: "you" };
export const CAVE: ObjectFilter = { types: ["Land"], subtype: "Cave" };

/** "the number of Caves you control plus the number of Cave cards in your graveyard" */
export const CAVES: Amount = amount.plus(
  amount.count({ ...CAVE, controller: "you" }),
  amount.countIn("graveyard", { subtype: "Cave" }),
);

/** Permanent card (descend): artifact, battle, creature, enchantment, land or planeswalker. */
export const PERMANENT_CARD: ObjectFilter = { permanent: true };
/** Fathomless descent: the number of permanent cards in your graveyard. */
export const PERMANENT_CARDS: Amount = amount.countIn("graveyard", PERMANENT_CARD);
/** Descend N: "if there are N or more permanent cards in your graveyard". */
export const descend = (n: 4 | 8): Condition => cond.amountAtLeast(PERMANENT_CARDS, n);
/** "if an artifact entered the battlefield under your control this turn" */
export const ARTIFACT_ENTERED = cond.controls({ types: ["Artifact"], controller: "you", enteredThisTurn: true });
