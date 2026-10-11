/**
 * Commander (PLAN-E, E6): cards that mention the commander or the opponents of the multiplayer format. Mana of the
 * commander's identity (903.4), "if you control a commander", eminence (113.6), mana of opponents' lands, "two or more
 * opponents".
 */
import type { CardScript, ManaType } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  altCost,
  amount,
  cond,
  entersWith,
  fx,
  manaAbility,
  ref,
  spell,
  target,
  triggered,
  VAMPIRE_BLACK,
  when,
} from "./common";

/** "If you control a commander, you may cast this spell without paying its mana cost." */
const freeWithCommander = {
  mana: "{0}",
  condition: cond.controls({ commander: true }),
  label: "Without paying its mana cost (you control a commander)",
};

/** "Enters tapped unless you have two or more opponents" (Battlebond, Commander Legends). */
const twoOpponentsLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.amountAtLeast(amount.refCount(ref.eachOpponent), 2)),
      label: "Tapped unless you have two or more opponents",
    }),
    manaAbility([a, b]),
  ],
});

export const COMMANDER_CARDS: Record<string, CardScript> = {
  "Command Tower": { abilities: [manaAbility(ANY_COLOR, 1, { commanderIdentity: true })] },
  "Arcane Signet": { abilities: [manaAbility(ANY_COLOR, 1, { commanderIdentity: true })] },
  "Path of Ancestry": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(ANY_COLOR, 1, {
        commanderIdentity: true,
        // "When that mana is spent to cast a creature spell that shares a creature type with your commander,
        // scry 1."
        rider: {
          spell: { types: ["Creature"], shares: { what: "creatureType", with: ref.commanders() } },
          effects: [fx.scry(1)],
        },
      }),
    ],
  },
  "Exotic Orchard": { abilities: [manaAbility(ANY_COLOR, 1, { likeLands: { controller: "opponent" } })] },
  "Fellwar Stone": { abilities: [manaAbility(ANY_COLOR, 1, { likeLands: { controller: "opponent" } })] },
  "Luxury Suite": twoOpponentsLand("B", "R"),
  "Vault of Champions": twoOpponentsLand("W", "B"),
  "Morphic Pool": twoOpponentsLand("U", "B"),
  "Sea of Clouds": twoOpponentsLand("W", "U"),
  "Spire Garden": twoOpponentsLand("R", "G"),
  "Undergrowth Stadium": twoOpponentsLand("B", "G"),
  "Rejuvenating Springs": twoOpponentsLand("G", "U"),
  "Training Center": twoOpponentsLand("U", "R"),
  "Command Beacon": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        // "Put a commander you own from the command zone into your hand": one, chosen among two partners.
        effects: [
          fx.chooseAmong(ref.zone("command", ref.you, { commander: true }), ref.you, "c", {
            anyZone: true,
            prompt: "Choose your commander",
          }),
          fx.moveTo(ref.stored("c"), { to: "hand" }),
        ],
        label: "Put your commander into your hand from the command zone",
      }),
    ],
  },
  "Fierce Guardianship": {
    castOptions: [altCost(freeWithCommander)],
    spell: spell([target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")], [fx.counter(ref.target())]),
  },
  "Deadly Rollick": {
    castOptions: [altCost(freeWithCommander)],
    spell: spell([target.creature()], [fx.exile(ref.target())]),
  },
  "Flawless Maneuver": {
    castOptions: [altCost(freeWithCommander)],
    spell: spell([], [fx.pumpAll({ controller: "you" }, 0, 0, ["indestructible"])]),
  },
  // Eminence: the first ability also works from the command zone.
  "Edgar Markov": {
    abilities: [
      triggered(when.castSpell("you", { subtype: "Vampire", other: true }), [fx.createTokens(VAMPIRE_BLACK)], {
        fromCommand: true,
        label: "Eminence: Vampire token",
      }),
      triggered(when.attacksSelf, [fx.addCountersAll({ subtype: "Vampire", controller: "you", types: ["Creature"] })], {
        label: "+1/+1 on each Vampire",
      }),
    ],
  },
};
