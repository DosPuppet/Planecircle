/** Foundations — planeswalkers (starting loyalty read from the Scryfall data). */
import { msg } from "@mtgx/engine";
import {
  ART_ENCH_OR_FLYER,
  amount,
  CAT_2,
  type CardScript,
  CREATURE_YOU_CONTROL,
  fx,
  loyalty,
  NINJA,
  ref,
  SACRIFICE_TOKEN_AT_END_STEP,
  target,
  targetObj,
  triggered,
  when,
  ZOMBIE,
} from "./common";

export const PLANESWALKERS: Record<string, CardScript> = {
  "Ajani, Caller of the Pride": {
    abilities: [
      loyalty(1, {
        targets: [target.optional(target.creature())],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "+1/+1 counter on up to one creature",
      }),
      loyalty(-3, {
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["flying", "doubleStrike"])],
        label: "flying and double strike",
      }),
      loyalty(-8, { effects: [fx.createTokens(CAT_2, amount.lifeTotal)], label: "X 2/2 Cats (X = your life total)" }),
    ],
  },
  "Kaito, Cunning Infiltrator": {
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU_CONTROL, true), [fx.counters(ref.self, "loyalty", 1)], {
        label: "loyalty counter",
      }),
      loyalty(1, {
        targets: [target.optional(target.creature("t", { controller: "you" }))],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] }), ...fx.loot(1)],
        label: "unblockable, draw then discard",
      }),
      loyalty(-2, { effects: [fx.createTokens(NINJA)], label: "Ninja 2/1" }),
      loyalty(-9, {
        effects: [
          fx.emblem(msg("Kaito's emblem"), msg("Whenever a player casts a spell, you create a 2/1 blue Ninja creature token."), [
            triggered(when.castSpell("any"), [fx.createTokens(NINJA)], { label: "Ninja 2/1" }),
          ]),
        ],
        label: "emblem",
      }),
    ],
  },
  "Chandra, Flameshaper": {
    abilities: [
      loyalty(2, { effects: [fx.addMana("R", "R", "R"), fx.impulse(3)], label: "{R}{R}{R}, exile 3 cards, play one of them" }),
      loyalty(1, {
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.copyToken(ref.target(), { addKeywords: ["haste"], addAbilities: [SACRIFICE_TOKEN_AT_END_STEP] })],
        label: "copy with haste",
      }),
      loyalty(-4, {
        targets: [target.upTo(8, targetObj("t", { types: ["Creature", "Planeswalker"] }, "creatures and/or planeswalkers"))],
        effects: [fx.damageDivided(8, ref.target())],
        label: "8 damage divided",
      }),
    ],
  },
  "Liliana, Dreadhorde General": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.draw(1)], { label: "draw a card" }),
      loyalty(1, { effects: [fx.createTokens(ZOMBIE)], label: "Zombie 2/2" }),
      loyalty(-4, {
        effects: [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, 2)],
        label: "each player sacrifices 2 creatures",
      }),
      loyalty(-9, {
        effects: [fx.keep(ref.eachOpponent, "onePerType", {})],
        label: "each opponent keeps one permanent of each type",
      }),
    ],
  },
  "Vivien Reid": {
    abilities: [
      loyalty(1, {
        effects: [fx.lookAtTop(4, { filter: { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] } })],
        label: "look at 4 cards, take a creature or a land",
      }),
      loyalty(-3, {
        targets: [targetObj("t", ART_ENCH_OR_FLYER, "artifact, enchantment or flying creature")],
        effects: [fx.destroy(ref.target())],
        label: "destroys",
      }),
      loyalty(-8, {
        effects: [
          fx.emblem(
            msg("Vivien's emblem"),
            msg("Creatures you control get +2/+2 and have vigilance, trample, and indestructible."),
            [
              {
                kind: "static",
                affects: CREATURE_YOU_CONTROL,
                mods: { power: 2, toughness: 2, addKeywords: ["vigilance", "trample", "indestructible"] },
              },
            ],
          ),
        ],
        label: "emblem",
      }),
    ],
  },
};
