/**
 * Commander (PLAN-E, E9): common spells and engines of the Commander decks. Tutors, counterspells, board wipes, player
 * protection (Teferi's Protection, The One Ring), token doubling, draw and drain engines.
 */
import type { CardScript, EventReplacement, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCost,
  altCostMode,
  amount,
  cond,
  costReducer,
  eventReplacement,
  fx,
  manaAbility,
  modal,
  oneOrMore,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** Colorless 3/2 Shapeshifter creature with changeling (Black Market Connections). */
const SHAPESHIFTER_3_2: TokenSpec = {
  name: "Shapeshifter",
  colors: [],
  types: ["Creature"],
  subtypes: ["Shapeshifter"],
  power: 3,
  toughness: 2,
  keywords: ["changeling"],
};

/** "Your life total can't change": neither gain nor loss (119.7, 119.8: no paying life either). */
const lifeCantChange = (["lifeGain", "lifeLoss"] as const).map((event) =>
  fx.untilYourNextTurn({ replacement: { event, to: "you", modify: { prevent: true } } satisfies EventReplacement }),
);

/** "Spell or nonland permanent an opponent controls." */
const OPPONENT_SPELL_OR_NONLAND: TargetSpec = {
  id: "t",
  label: "spell or nonland permanent an opponent controls",
  filter: { spells: { controller: "opponent" }, objects: { permanent: true, notTypes: ["Land"], controller: "opponent" } },
};

const CREATURE_OF_CHOSEN_TYPE = { types: ["Creature" as const], chosen: "subtype" as const };

export const EDH_STAPLES: Record<string, CardScript> = {
  // --- Protection ---
  "Teferi's Protection": {
    rules: { exileOnResolve: true },
    spell: spell(
      [],
      [...lifeCantChange, fx.untilYourNextTurn({ protection: "everything" }), fx.phaseOut(ref.permanentsOf(ref.you, {}))],
    ),
  },
  "The One Ring": {
    // Indestructible: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.untilYourNextTurn({ protection: "everything" })], {
        condition: cond.wasCast,
        label: "Cast: protection from everything until your next turn",
      }),
      triggered(when.yourUpkeep, [fx.loseLife(amount.countersOn(ref.self, "burden"))], {
        label: "You lose 1 life per burden counter",
      }),
      activated({
        tap: true,
        effects: [fx.counters(ref.self, "burden"), fx.draw(amount.countersOn(ref.self, "burden"))],
        label: "A burden counter, then draw a card per counter",
      }),
    ],
  },

  // --- Tutors ---
  "Demonic Tutor": { spell: spell([], [fx.search({}, { to: "hand" })]) },
  // Approximation: the card searched for is not revealed.
  "Enlightened Tutor": {
    spell: spell([], [fx.search({ anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, { to: "libraryTop" })]),
  },

  // --- Counterspells ---
  "Force of Negation": {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.not(cond.yourTurn),
        label: "Force of Negation — exile a blue card from your hand (not on your turn)",
        pay: { exileFromHand: { filter: { colors: ["U"] }, count: 1 } },
      }),
    ],
    spell: spell([target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")], [fx.counterExile(ref.target())]),
  },
  Rewind: {
    spell: spell([target.spell()], [fx.counter(ref.target()), fx.untapUpTo({ types: ["Land"] }, 4)]),
  },
  Unwind: {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
      [fx.counter(ref.target()), fx.untapUpTo({ types: ["Land"] }, 3)],
    ),
  },

  // --- Removal ---
  "Snuff Out": {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.controls({ subtype: "Swamp" }),
        label: "Snuff Out — pay 4 life (you control a Swamp)",
        pay: { life: 4 },
      }),
    ],
    spell: spell([target.creature("t", { not: { colors: ["B"] } })], [{ op: "destroy", what: ref.target(), noRegenerate: true }]),
  },
  Vindicate: {
    spell: spell([{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }], [fx.destroy(ref.target())]),
  },
  Damn: {
    spell: altCostMode(
      "Overload",
      "{2}{W}{W}",
      { targets: [target.creature()], effects: [{ op: "destroy", what: ref.target(), noRegenerate: true }] },
      { effects: [fx.destroyAll({ types: ["Creature"] }, undefined, true)] },
    ),
  },
  // "Pay X life" as an additional cost: read from the text.
  "Toxic Deluge": {
    spell: spell([], [fx.pumpAll({ types: ["Creature"] }, amount.neg(amount.x), amount.neg(amount.x))]),
  },
  Farewell: {
    spell: modal(
      ...oneOrMore(
        { label: "Exile all artifacts", effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { types: ["Artifact"] }))] },
        { label: "Exile all creatures", effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }))] },
        {
          label: "Exile all enchantments",
          effects: [fx.exile(ref.permanentsOf(ref.eachPlayer, { types: ["Enchantment"] }))],
        },
        {
          label: "Exile all graveyards",
          effects: [fx.moveAll("graveyard", ref.eachPlayer, {}, { to: "exile" })],
        },
      ),
    ),
  },

  // --- Card draw and tempo ---
  "Frantic Search": {
    spell: spell([], [fx.draw(2), fx.discard(2), fx.untapUpTo({ types: ["Land"] }, 3)]),
  },
  "Village Rites": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.draw(2)]),
  },
  "Sink into Stupor": { spell: spell([OPPONENT_SPELL_OR_NONLAND], [fx.bounce(ref.target())]) },
  // Back face: "you may pay 3 life; if you don't, it enters tapped" is read from the text.
  "Soporific Springs": { abilities: [manaAbility("U")] },
  "Black Market Connections": {
    abilities: [
      triggeredModal(
        { on: "step", step: "main", whose: "you", nth: 1 },
        oneOrMore(
          { label: "Treasure, 1 life", effects: [fx.createTokens(TREASURE), fx.loseLife(1)] },
          { label: "Draw, 2 life", effects: [fx.draw(1), fx.loseLife(2)] },
          { label: "3/2 Shapeshifter, 3 life", effects: [fx.createTokens(SHAPESHIFTER_3_2), fx.loseLife(3)] },
        ),
        { label: "First main phase: choose one or more" },
      ),
    ],
  },

  // --- Artifacts and enchantments ---
  Skullclamp: {
    // Equip {1}: read from the text.
    abilities: [
      staticAbility("attached", { power: 1, toughness: -1 }, { label: "+1/-1" }),
      triggered(when.dies({ attached: "host" }), [fx.draw(2)], {
        label: "Equipped creature dies: draw two cards",
      }),
    ],
  },
  "Phyrexian Altar": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addManaChoice(1)],
        label: "Sacrifice a creature: one mana of any color",
      }),
    ],
  },
  "Herald's Horn": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      costReducer(CREATURE_OF_CHOSEN_TYPE, 1, "Your creature spells of the chosen type cost {1} less"),
      triggered(when.yourUpkeep, [fx.lookAtTop(1, { filter: CREATURE_OF_CHOSEN_TYPE, rest: "top" })], {
        label: "Look at the top card: a creature of the chosen type may go to your hand",
      }),
    ],
  },
  "Vanquisher's Banner": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { ...CREATURE_OF_CHOSEN_TYPE, controller: "you" },
        { power: 1, toughness: 1 },
        {
          label: "Your creatures of the chosen type: +1/+1",
        },
      ),
      triggered(when.castSpell("you", CREATURE_OF_CHOSEN_TYPE), [fx.draw(1)], {
        label: "Creature spell of the chosen type: draw a card",
      }),
    ],
  },
  "Anointed Procession": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        modify: { times: 2 },
        label: "Twice that many tokens under your control",
      }),
    ],
  },
  "Exquisite Blood": {
    abilities: [
      triggered(when.loseLife("opponent"), [fx.gainLife(amount.eventAmount)], {
        label: "An opponent loses life: you gain that much",
      }),
    ],
  },
  "Blade of the Bloodchief": {
    // Equip {1}: read from the text.
    abilities: [
      triggered(
        when.dies({ types: ["Creature"] }),
        [
          ...fx.when(cond.refMatches(ref.attached, { subtype: "Vampire" }), fx.counters(ref.attached, "+1/+1", 2)),
          ...fx.when(cond.not(cond.refMatches(ref.attached, { subtype: "Vampire" })), fx.counters(ref.attached, "+1/+1", 1)),
        ],
        { label: "A creature dies: a +1/+1 counter on the equipped creature (two if it's a Vampire)" },
      ),
    ],
  },
};
