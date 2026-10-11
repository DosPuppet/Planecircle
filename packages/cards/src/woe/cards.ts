/**
 * Wilds of Eldraine — cards of the meta decks (phase 1 of plan P4, lot M1). Bargain (702.166) is read from the text
 * (`scryfall.ts`: kicker "sacrifice an artifact, enchantment, or token"). The other cards of the set are in the
 * files by color.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  FOOD,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  RAT_NO_BLOCK,
  ref,
  spell,
  target,
  triggered,
  when,
} from "./common";

export const CARDS: Record<string, CardScript> = {
  // --- Blue ------------------------------------------------------------------
  "Sleight of Hand": { spell: spell([], [fx.lookAtTop(2, { count: 1, to: { to: "hand" }, rest: "bottom" })]) },
  // --- Red -----------------------------------------------------------------
  "Hearth Elemental": {
    // {X} less: instant, sorcery and/or Adventure cards in your graveyard.
    costReduction: {
      generic: amount.plus(
        amount.countIn("graveyard", INSTANT_SORCERY),
        amount.countIn("graveyard", { notTypes: ["Instant", "Sorcery"], adventure: true }),
      ),
    },
  },
  "Stoke Genius": { spell: spell([], [fx.discard(amount.cardsIn("hand")), fx.draw(2)]) },
  "Torch the Tower": {
    spell: spell(
      [target.creatureOrPlaneswalker()],
      [
        fx.damage(amount.kicked(3, 2), ref.target(), undefined, { storeDealt: "d" }),
        // "A permanent dealt damage by Torch the Tower": only if damage was really dealt (PLAN-L L4); the exile applies
        // before the state-based actions that follow the resolution.
        ...fx.when(cond.amountAtLeast(amount.v("d"), 1), fx.exileIfDies(ref.target())),
        ...fx.when(cond.kicked, fx.scry(1)),
      ],
    ),
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Disdainful Stroke": {
    spell: spell([target.spell("t", { minManaValue: 4 }, "spell with MV 4 or greater")], [fx.counter(ref.target())]),
  },

  // --- Lot M4 -----------------------------------------------------------------
  "Candy Trail": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.draw(1)],
        label: "Gain 3 life, draw",
      }),
    ],
  },

  // --- Lot M5 -----------------------------------------------------------------
  "Song of Totentanz": {
    spell: spell(
      [],
      [
        fx.createTokens(RAT_NO_BLOCK, amount.x),
        fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["haste"] }),
      ],
    ),
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Bramble Familiar": {
    abilities: [
      manaAbility("G"),
      activated({
        mana: "{1}{G}",
        tap: true,
        discard: 1,
        effects: [fx.bounce(ref.self)],
        label: "Return it to its owner's hand",
      }),
    ],
  },
  "Fetch Quest": {
    spell: spell(
      [],
      [
        fx.mill(7, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }, { types: ["Land"] }] },
          { to: "battlefield" },
          { count: 1, pool: ref.stored("m"), prompt: "A milled creature, enchantment or land card" },
        ),
      ],
    ),
  },
  "Mosswood Dreadknight": {
    abilities: [
      triggered(when.diesSelf, [fx.grantPlay(ref.selfCard, { untilYourNextTurn: true, castOnly: "adventure" })], {
        label: "Castable from the graveyard (as an Adventure) until the end of your next turn",
      }),
    ],
  },
  "Dread Whispers": { spell: spell([], [fx.draw(1), fx.loseLife(1)]) },
  "Restless Cottage": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["B", "G"]),
      activated({
        mana: "{2}{B}{G}",
        effects: [
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Horror"],
            setPower: 4,
            setToughness: 4,
            setColors: ["B", "G"],
          }),
        ],
        label: "Becomes a 4/4 Horror creature",
      }),
      triggered(when.attacksSelf, [fx.createTokens(FOOD), fx.exileCard(ref.target())], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "any"))],
        label: "A Food, exile a card from a graveyard",
      }),
    ],
  },
  "Scalding Viper": {
    abilities: [
      triggered(when.castSpell("opponent", { maxManaValue: 3 }), [fx.damage(1, ref.eventPlayer)], {
        label: "1 damage to the caster",
      }),
    ],
  },
  "Steam Clean": { spell: spell([target.nonland()], [fx.bounce(ref.target())]) },
  "The End": {
    costReduction: { generic: 2, condition: cond.not(cond.lifeAtLeast(6)) },
    spell: spell([target.creatureOrPlaneswalker()], [fx.exileWithNamesakes(ref.target())]),
  },
};
