/**
 * Secrets of Strixhaven — red cards (lot A). Prepare ("enters prepared") goes through `entersWith` and
 * `prepareSpell`; Opus through `OPUS` and `opusInstead` (common.ts); ward ("pay N life"), haste, menace and other
 * keywords are read from the text.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  ELEMENTAL_UR,
  entersWith,
  flashback,
  fx,
  INSTANT_SORCERY,
  modal,
  mode,
  OPUS,
  OPUS_BIG,
  opusInstead,
  ref,
  SPIRIT_RW,
  spell,
  spree,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

/** "You may discard a card. If you do, draw a card." */
const mayRummage = [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))];

/** Steal the Show, first mode: target player discards any number of cards, then draws that many. */
const wheelSome = [fx.discard(60, ref.target("p"), { optional: true, store: "d" }), fx.draw(amount.v("d"), ref.target("p"))];
/** Steal the Show, second mode: damage equal to the number of instant and sorcery cards in your graveyard. */
const spellsInGraveyard = [fx.damage(amount.countIn("graveyard", INSTANT_SORCERY), ref.target("c"))];

export const RED: Record<string, CardScript> = {
  "Ancestral Anger": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), amount.plus(1, amount.countIn("graveyard", { name: "Ancestral Anger" })), 0, ["trample"]),
        fx.draw(1),
      ],
    ),
  },
  // Converge: X = colors of mana spent; the exiled cards can be played until the end of your next turn.
  "Archaic's Agony": {
    spell: spell(
      [target.creature()],
      [
        fx.damageStoringExcess(amount.colorsSpent, ref.target(), "e"),
        fx.exileTop(ref.you, amount.v("e"), "x"),
        fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true }),
      ],
    ),
  },
  "Artistic Process": {
    spell: modal(
      mode("6 damage to a creature", [target.creature()], [fx.damage(6, ref.target())]),
      mode("2 damage to each creature you don't control", [], [fx.damageAll(2, { types: ["Creature"], controller: "opponent" })]),
      mode(
        "A 3/3 flying Elemental, with haste this turn",
        [],
        [fx.createTokens(ELEMENTAL_UR, 1, undefined, "e"), fx.pump(ref.stored("e"), 0, 0, ["haste"])],
      ),
    ),
  },
  // Prepared spell: Seething Song.
  "Blazing Firesinger": {
    prepareSpell: spell([], [fx.addManaTimes(5, "R")]),
    abilities: [entersWith({ prepared: true })],
  },
  // Haste read from the text.
  "Charging Strifeknight": {
    abilities: [activated({ tap: true, discard: 1, effects: [fx.draw(1)], label: "Discard a card: draw a card" })],
  },
  "Duel Tactics": {
    castOptions: [flashback("{1}{R}")],
    spell: spell([target.creature()], [fx.damage(1, ref.target()), fx.pump(ref.target(), 0, 0, ["cantBlock"])]),
  },
  // First strike read from the text; prepared spell: Lightning Bolt.
  "Emeritus of Conflict": {
    prepareSpell: spell([target.any()], [fx.damage(3, ref.target())]),
    abilities: [triggered(when.castNthSpell(3), [fx.prepare(ref.self)], { label: "Third spell of the turn: becomes prepared" })],
  },
  "Expressive Firedancer": {
    abilities: [
      triggered(OPUS, [fx.pump(ref.self, 1, 1), ...fx.when(OPUS_BIG, fx.pump(ref.self, 0, 0, ["doubleStrike"]))], {
        label: "Opus: +1/+1; five or more mana: double strike",
      }),
    ],
  },
  // Menace read from the text.
  "Garrison Excavator": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.createTokens(SPIRIT_RW)], {
        batched: true,
        label: "Cards leave your graveyard: a 2/2 Spirit",
      }),
    ],
  },
  // Prepared spell: Craft with Pride.
  "Goblin Glasswright": {
    prepareSpell: spell([], [fx.createTokens(TREASURE)]),
    abilities: [entersWith({ prepared: true })],
  },
  "Heated Argument": {
    spell: spell(
      [target.creature()],
      [
        fx.damage(6, ref.target()),
        fx.pickFromZone(
          "graveyard",
          {},
          { to: "exile" },
          { count: 1, min: 0, store: "g", prompt: "You may exile a card from your graveyard" },
        ),
        ...fx.when(cond.v("g"), fx.damage(2, ref.controllerOf(ref.target()))),
      ],
    ),
  },
  // Paradigm read from the text.
  "Improvisation Capstone": {
    spell: spell([], [fx.exileUntilTotalManaValue(ref.you, 4, "x"), fx.castNow(ref.stored("x"), { free: true, many: true })]),
  },
  "Living History": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SPIRIT_RW)], { label: "A 2/2 Spirit" }),
      triggered(when.attackWith(1), [fx.pump(ref.target(), 2, 0)], {
        condition: cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1),
        targets: [target.creature("t", { attacking: true })],
        label: "A card left your graveyard: +2/+0 to an attacking creature",
      }),
    ],
  },
  // Haste read from the text; prepared spell: Rocket Volley.
  "Maelstrom Artisan": {
    prepareSpell: spell([target.permanent("t", ["Land"], { basic: false }, "nonbasic land")], [fx.destroy(ref.target())]),
    abilities: [entersWith({ prepared: true })],
  },
  // Ward (pay 3 life) read from the text.
  "Mica, Reader of Ruins": {
    abilities: [
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.copySpell(ref.eventObject, 1)),
        ],
        { label: "Sacrifice an artifact: copy the spell" },
      ),
    ],
  },
  // Menace read from the text.
  "Molten-Core Maestro": {
    abilities: [
      triggered(OPUS, [fx.addCounters(ref.self, 1), ...fx.when(OPUS_BIG, fx.addManaTimes(amount.powerOf(ref.self), "R"))], {
        label: "Opus: a +1/+1 counter; five or more mana: {R} equal to its power",
      }),
    ],
  },
  // Flying read from the text; prepared spell: Striking Palette.
  "Pigment Wrangler": {
    prepareSpell: spell([], [fx.copyNextSpell]),
    abilities: [entersWith({ prepared: true })],
  },
  "Rubble Rouser": {
    abilities: [
      triggered(when.entersSelf, mayRummage, { label: "Discard a card to draw one" }),
      // Mana ability (605.1a): the reflexive "when you do" ability triggers afterwards.
      activated({
        tap: true,
        exileFromGraveyard: { filter: {} },
        effects: [fx.addMana("R"), fx.reflexive([], [fx.damage(1, ref.eachOpponent)])],
        label: "Exile a card from your graveyard: add {R}, 1 damage to each opponent",
      }),
    ],
  },
  "Steal the Show": {
    spell: modal(
      mode("The player discards cards, then draws that many", [target.player("p")], wheelSome),
      mode("Damage to a creature or planeswalker", [target.creatureOrPlaneswalker("c")], spellsInGraveyard),
      mode("Both", [target.player("p"), target.creatureOrPlaneswalker("c")], [...wheelSome, ...spellsInGraveyard]),
    ),
  },
  // Ward (pay 2 life) read from the text; prepared spell: Awaken the Ages.
  "Strife Scholar": {
    prepareSpell: spell([], [fx.createTokens(SPIRIT_RW, 2)]),
    abilities: [entersWith({ prepared: true })],
  },
  // Trample read from the text.
  "Tackle Artist": {
    abilities: [
      triggered(OPUS, opusInstead([fx.addCounters(ref.self, 1)], [fx.addCounters(ref.self, 2)]), {
        label: "Opus: a +1/+1 counter (two if five or more mana)",
      }),
    ],
  },
  // Reach read from the text.
  "Thunderdrum Soloist": {
    abilities: [
      triggered(OPUS, opusInstead([fx.damage(1, ref.eachOpponent)], [fx.damage(3, ref.eachOpponent)]), {
        label: "Opus: 1 damage to each opponent (3 if five or more mana)",
      }),
    ],
  },
  "Tome Blast": {
    castOptions: [flashback("{4}{R}")],
    spell: spell([target.any()], [fx.damage(2, ref.target())]),
  },
  "Unsubtle Mockery": {
    spell: spell([target.creature()], [fx.damage(4, ref.target()), fx.surveil(1)]),
  },
  "Zealous Lorecaster": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card from your graveyard")],
        label: "Returns an instant or sorcery from the graveyard to hand",
      }),
    ],
  },
  "Magmablood Archaic": {
    abilities: [
      entersWith({ counters: amount.colorsSpent, label: "Converge: a +1/+1 counter for each color of mana spent" }),
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [fx.pumpAll({ types: ["Creature"], controller: "you" }, amount.eventColorsSpent, 0)],
        { label: "Instant or sorcery: your creatures get +1/+0 for each color of mana spent to cast it" },
      ),
    ],
  },
  "Choreographed Sparks": {
    // "This spell can't be copied": read from the text. "Choose one or both": two modes with no extra cost.
    spell: spree(
      {
        cost: "{0}",
        label: "Copy an instant or sorcery spell you control",
        targets: [target.spell("a", { ...INSTANT_SORCERY, controller: "you" }, "instant or sorcery spell that you control")],
        effects: [fx.copySpell(ref.target("a"), 1)],
      },
      {
        cost: "{0}",
        label: "Copy a creature spell you control (haste, sacrificed at end of turn)",
        targets: [target.spell("b", { types: ["Creature"], controller: "you" }, "creature spell you control")],
        effects: [fx.copySpell(ref.target("b"), 1, { haste: true, sacrificeAtEndStep: true })],
      },
    ),
  },
};
