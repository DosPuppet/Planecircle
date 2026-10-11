/**
 * Secrets of Strixhaven — white cards (lot A). Prepare is read from the text (the prepared spell goes into
 * `prepareSpell`); flashback with a mana cost is written in the script; ward and keywords are read from the text.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  flashback,
  fx,
  INKLING,
  REPARTEE,
  ref,
  SPIRIT_RW,
  spell,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const YOUR_CREATURE = () => target.creature("t", { controller: "you" });
/** "This creature enters prepared." */
const ENTERS_PREPARED = entersWith({ prepared: true, label: "Enters prepared" });

export const WHITE: Record<string, CardScript> = {
  "Ajani's Response": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Antiquities on the Loose": {
    castOptions: [flashback("{4}{W}{W}")],
    spell: spell(
      [],
      [
        fx.createTokens(SPIRIT_RW, 2),
        // "Then if this spell was cast from anywhere other than your hand" (flashback…).
        ...fx.when(cond.not(cond.spellCastFromHand), fx.addCountersAll({ subtype: "Spirit", controller: "you" }, 1)),
      ],
    ),
  },
  "Ascendant Dustspeaker": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "A +1/+1 counter on another creature",
      }),
      triggered(when.yourCombat, [fx.exileCard(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "Exile up to one card from a graveyard",
      }),
    ],
  },
  "Dig Site Inventory": {
    castOptions: [flashback("{W}")],
    spell: spell([YOUR_CREATURE()], [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance"] })]),
  },
  "Eager Glyphmage": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(INKLING)], { label: "A 1/1 flying Inkling" })],
  },
  "Elite Interceptor": {
    // Rejoinder: "You may tap or untap target creature. Draw a card."
    prepareSpell: spell(
      [target.creature()],
      [
        // Only one of the two questions: the "tap" answer is stored so as not to untap afterwards.
        ...fx.when(
          cond.not(cond.targetMatches("t", { tapped: true })),
          fx.mayForStore(ref.you, "Tap the target creature?", "tapped", fx.tap(ref.target())),
        ),
        ...fx.when(
          cond.all(cond.targetMatches("t", { tapped: true }), cond.not(cond.v("tapped"))),
          fx.may("Untap the target creature?", fx.untap(ref.target())),
        ),
        fx.draw(1),
      ],
    ),
    abilities: [ENTERS_PREPARED],
  },
  "Emeritus of Truce": {
    // Swords to Plowshares: the power is read from last known information.
    prepareSpell: spell(
      [target.creature()],
      [fx.exile(ref.target()), fx.gainLife(amount.powerOf(ref.target()), ref.controllerOf(ref.target()))],
    ),
    abilities: [
      triggered(
        when.entersSelf,
        [fx.createTokens(INKLING, 1, ref.target()), ...fx.when(cond.opponentHasMore("creatures"), fx.prepare(ref.self))],
        {
          targets: [target.player()],
          label: "Target player creates an Inkling; becomes prepared if an opponent has more creatures",
        },
      ),
    ],
  },
  "Ennis, Debate Moderator": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Exile another creature (it returns at the next end step)",
        },
      ),
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "exile", token: false }), 1),
        label: "Cards exiled this turn: a +1/+1 counter",
      }),
    ],
  },
  "Graduation Day": {
    abilities: [
      triggered(REPARTEE, [fx.addCounters(ref.target(), 1)], {
        targets: [YOUR_CREATURE()],
        label: "Repartee: a +1/+1 counter",
      }),
    ],
  },
  "Harsh Annotation": {
    spell: spell([target.creature()], [fx.destroy(ref.target()), fx.createTokens(INKLING, 1, ref.controllerOf(ref.target()))]),
  },
  "Honorbound Page": {
    // Forum's Favor: "Target creature gets +1/+0 and gains flying until end of turn."
    prepareSpell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["flying"])]),
    abilities: [ENTERS_PREPARED],
  },
  "Informed Inkwright": {
    abilities: [triggered(REPARTEE, [fx.createTokens(INKLING)], { label: "Repartee: a 1/1 flying Inkling" })],
  },
  "Inkshape Demonstrator": {
    abilities: [triggered(REPARTEE, [fx.pump(ref.self, 1, 0, ["lifelink"])], { label: "Repartee: +1/+0 and lifelink" })],
  },
  Interjection: {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["firstStrike"])]),
  },
  "Joined Researchers": {
    // Secret Rendezvous: "You and target opponent each draw three cards."
    prepareSpell: spell([target.player("t", "opponent")], [fx.draw(3), fx.draw(3, ref.target())]),
    abilities: [
      triggered(when.eachEndStep, [fx.prepare(ref.self)], {
        condition: cond.opponentHasMore("hand"),
        label: "An opponent has more cards in hand: becomes prepared",
      }),
    ],
  },
  "Owlin Historian": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.pump(ref.self, 1, 1)], {
        batched: true,
        label: "Cards leave your graveyard: +1/+1",
      }),
    ],
  },
  "Primary Research": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, notTypes: ["Land"], maxManaValue: 3 },
            "you",
            "nonland permanent card with mana value 3 or less",
          ),
        ],
        label: "Returns a permanent with mana value 3 or less",
      }),
      triggered(when.yourEndStep, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1),
        label: "A card left your graveyard: draw",
      }),
    ],
  },
  "Quill-Blade Laureate": {
    // Twofold Intent: "Target creature gets +1/+0 and gains double strike until end of turn."
    prepareSpell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["doubleStrike"])]),
    abilities: [ENTERS_PREPARED],
  },
  "Rapier Wit": {
    spell: spell(
      [target.creature()],
      [fx.tap(ref.target()), ...fx.when(cond.yourTurn, fx.counters(ref.target(), "stun", 1)), fx.draw(1)],
    ),
  },
  "Rehearsed Debater": {
    abilities: [triggered(REPARTEE, [fx.pump(ref.self, 1, 1)], { label: "Repartee: +1/+1" })],
  },
  "Restoration Seminar": {
    // Paradigm: read from the text.
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "you", "nonland permanent card")],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Shattered Acolyte": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Destroys an artifact or an enchantment",
      }),
    ],
  },
  "Spiritcall Enthusiast": {
    // Scrollboost: "One or two target creatures each get +2/+2 until end of turn."
    prepareSpell: spell([target.between(1, 2, target.creature())], [fx.pump(ref.target(), 2, 2)]),
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), [fx.prepare(ref.self)], {
        batched: true,
        label: "Tokens enter: becomes prepared",
      }),
    ],
  },
  "Stand Up for Yourself": {
    spell: spell([target.creature("t", { minPower: 3 })], [fx.destroy(ref.target())]),
  },
  "Stirring Hopesinger": {
    abilities: [
      triggered(REPARTEE, [fx.addCountersAll(YOUR_CREATURES, 1)], {
        label: "Repartee: a +1/+1 counter on each of your creatures",
      }),
    ],
  },
  "Stone Docent": {
    abilities: [
      activated({
        mana: "{W}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.gainLife(2), fx.surveil(1)],
        label: "Gain 2 life, surveil 1",
      }),
    ],
  },
  "Summoned Dromedary": {
    abilities: [
      activated({
        mana: "{1}{W}",
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toHand(ref.self)],
        label: "Return it from your graveyard to your hand",
      }),
    ],
  },
  "Group Project": {
    // "Flashback—Tap three untapped creatures you control": flashback without mana, with this extra cost.
    castOptions: [flashback("{0}", { tap: { filter: { types: ["Creature"], controller: "you" }, count: 3 } })],
    spell: spell([], [fx.createTokens(SPIRIT_RW)]),
  },
  // "Exile two cards from your graveyard or pay {1}{W}": read from the text (kicker without mana or extra mana).
  "Soaring Stoneglider": {},
};
