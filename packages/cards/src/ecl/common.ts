/**
 * Elements specific to Lorwyn Eclipsed (ECL): tokens. The DSL and the common tokens come from the previous sets
 * (via lci/common.ts).
 */
import type { AbilityDef, CardScript, TokenSpec } from "@mtgx/engine";
import { creature } from "../fdn/common";
import { activated, fx, manaAbility, ref, triggered, when } from "../lci/common";

export * from "../lci/common";

/** Treefolk (Sapling Nursery): 3/4 green creature with reach. */
export const TREEFOLK_REACH: TokenSpec = creature("Treefolk", ["G"], ["Treefolk"], 3, 4, { keywords: ["reach"] });
/** Kithkin: 1/1 green and white creature. */
export const KITHKIN: TokenSpec = creature("Kithkin", ["G", "W"], ["Kithkin"], 1, 1);
/** Merfolk: 1/1 white and blue creature. */
export const MERFOLK_WU: TokenSpec = creature("Merfolk", ["W", "U"], ["Merfolk"], 1, 1);
/** Goblin: 1/1 black and red creature. */
export const GOBLIN_BR: TokenSpec = creature("Goblin", ["B", "R"], ["Goblin"], 1, 1);
/** Faerie: 1/1 blue and black creature with flying. */
export const FAERIE_UB: TokenSpec = creature("Faerie", ["U", "B"], ["Faerie"], 1, 1, { keywords: ["flying"] });
/** Shapeshifter: 1/1 colorless creature with changeling. */
export const SHAPESHIFTER: TokenSpec = creature("Shapeshifter", [], ["Shapeshifter"], 1, 1, { keywords: ["changeling"] });
/** Elf: 2/2 black and green creature. */
export const ELF_BG: TokenSpec = creature("Elf", ["B", "G"], ["Elf"], 2, 2);
/** Elk: 3/3 green creature. */
export const ELK: TokenSpec = creature("Elk", ["G"], ["Elk"], 3, 3);
/** Worm: 1/1 black and green creature. */
export const WORM_BG: TokenSpec = creature("Worm", ["B", "G"], ["Worm"], 1, 1);
/** Mutavault: land, "{T}: Add {C}" and "{1}: becomes a 2/2 creature with all creature types until end of turn". */
export const MUTAVAULT: TokenSpec = {
  name: "Mutavault",
  colors: [],
  types: ["Land"],
  subtypes: [],
  abilities: [
    manaAbility(["C"]),
    activated({
      mana: "{1}",
      effects: [fx.modify(ref.self, { addTypes: ["Creature"], addKeywords: ["changeling"], setPower: 2, setToughness: 2 })],
      label: "Becomes a 2/2 creature with all creature types until end of turn",
    }),
  ],
  text: "{T}: Add {C}.\n{1}: This token becomes a 2/2 creature with all creature types until end of turn. It's still a land.",
};

/**
 * Champion ("behold a [type] and exile it" as an additional cost; "when this creature leaves the battlefield, return
 * the exiled card to its owner's hand"): a permanent you control or a card from your hand, chosen by the engine, linked
 * to the creature.
 */
export function champion(subtype: string, abilities: AbilityDef[]): CardScript {
  return {
    additionalCost: { exile: { filter: { subtype }, count: 1, fromHand: true } },
    abilities: [
      ...abilities,
      triggered(when.leavesSelf, [fx.toHand(ref.linked)], { label: "The exiled card returns to its owner's hand" }),
    ],
  };
}

/**
 * "As an additional cost, behold a [type] or pay {N}": a permanent you control or another card from your hand
 * (revealed), otherwise {N} more.
 */
export const beholdOrPay = (subtype: string, n: number): CardScript["additionalCost"] => ({
  behold: { filter: { subtype }, orPay: { generic: n, colored: {}, x: 0 } },
});
