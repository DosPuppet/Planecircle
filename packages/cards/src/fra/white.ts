/** Reality Fracture — white cards. */
import { msg } from "@mtgx/engine";
import {
  AJANIS_PRIDEMATE,
  activated,
  amount,
  CADET,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  empower,
  entersWith,
  flashback,
  fx,
  loyalty,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  ref,
  SEED_SUTURE,
  spell,
  staticAbility,
  THOPTER,
  target,
  targetObj,
  triggered,
  triggeredModal,
  walkersHave,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Fateshaper Aspirant": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode(
          "Return a legendary card",
          [target.cardInGraveyard("t", { legendary: true }, "you", "legendary card in your graveyard")],
          [fx.toHand(ref.target())],
        ),
        mode(
          "+1/+1 counter, vigilance and indestructible",
          [target.creature("t")],
          [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance", "indestructible"] })],
        ),
      ]),
    ],
  },
  "Flickering Hound": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.exileCard(ref.target(), { name: "blink" }), fx.toBattlefield(ref.stored("blink"))],
        {
          targets: [target.upTo(1, target.creature("t", OTHER_CREATURE_YOU_CONTROL))],
          label: "blinks another creature",
        },
      ),
    ],
  },
  "Generous Revival": {
    castOptions: [flashback("{4}{W}")],
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card of value 3 or less")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 1 } })],
    ),
  },
  "Germinate Recruits": { spell: spell([], [fx.createTokens(CADET, amount.lifeGainedThisTurn)]) },
  "Graft Surgeon": {
    abilities: [
      entersWith({ counters: 1 }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), amount.lkiCounters("+1/+1"))], {
        targets: [target.upTo(1, target.creature("t", CREATURE_YOU_CONTROL))],
        label: "passes on its counters",
      }),
    ],
  },
  "Guiding Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(
        when.yourCombat,
        fx.may(
          "Remove a +1/+1 counter to put one on each of your other creatures?",
          fx.counters(ref.self, "+1/+1", -1),
          fx.addCountersAll(OTHER_CREATURE_YOU_CONTROL, 1),
        ),
        { condition: cond.counterAtLeast("+1/+1", 1), label: "shares a counter" },
      ),
    ],
  },
  "Memory Trap": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls")],
        label: "exiles until it leaves",
      }),
    ],
  },
  "Predictive Preparations": {
    castOptions: [flashback("{3}{W}")],
    spell: spell([target.upTo(2, target.creature("t"))], [fx.addCounters(ref.target(), 1)]),
  },
  "Prophesied End": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.not(cond.refMatches(ref.target(), { attacking: true })), fx.draw(1, ref.controllerOf(ref.target()))),
        fx.destroy(ref.target()),
      ],
    ),
  },
  "Return to the Light Realms": {
    spell: spell([], [fx.moveAll("graveyard", ref.you, { permanent: true, notTypes: ["Land"] }, { to: "battlefield" })]),
  },
  "Shatterwing Pegasus": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], label: "Your creatures +1/+1" })],
  },
  "Surgical Precision": {
    spell: modal(
      mode(
        "Destroy target creature with toughness 4 or greater",
        [target.creature("t", { minToughness: 4 })],
        [fx.destroy(ref.target()), fx.gainLife(1)],
      ),
      mode("Draw a card, +2 life", [], [fx.draw(1), fx.gainLife(2)]),
    ),
  },
  "Unflinching Hortimancer": {
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "put a +1/+1 counter" })],
  },
  "Koth of the Homestead": {
    abilities: [
      triggered(when.landfall, [fx.gainLife(1)], { label: "Landfall: +1 life" }),
      triggered(when.enters({ subtype: "Plains", controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t")],
        label: "Plains: +1/+1 counter",
      }),
    ],
  },
  "Lyra, Archangel of Dawn": {
    abilities: [
      triggered(when.gainLife, [fx.addCountersAll({ types: ["Creature"], subtype: "Angel", controller: "you" }, 1)], {
        label: "counter on each Angel",
      }),
    ],
  },
  "Rescue Girl, First Responder": {
    abilities: [
      activated({
        tap: true,
        targets: [targetObj("t", { permanent: true, controller: "you", other: true }, "other permanent you control")],
        effects: [fx.bounce(ref.target())],
        activationCondition: cond.yourTurn,
        label: "Return another permanent to hand",
      }),
    ],
  },
  "Saheeli, Consul of Oversight": {
    abilities: [triggered(when.scryOrSurveil, [fx.createTokens(THOPTER)], { oncePerTurn: true, label: "Scry/surveil: Thopter" })],
  },
  "Gideon's Memorial": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", token: true },
        { power: 1, addKeywords: ["vigilance"] },
        {
          label: "Creature tokens: +1/+0 and vigilance",
        },
      ),
      manaAbility(["W", "U", "B", "R", "G"], 1, { restriction: { spell: { types: ["Planeswalker"] } } }),
      activated({
        mana: "{1}{W}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
        effects: [fx.damage(4, ref.target())],
        label: "Discard: 4 damage to an attacking or blocking creature",
      }),
    ],
  },
  "Blossom-Blessed Angel": { prepareSpell: SEED_SUTURE, abilities: [entersWith({ prepared: true })] },
  "Academic Ascent": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 2, ["flying"]), empower(2)]),
  },
  "Campus Crier": {
    abilities: [activated({ mana: "{1}", fromGraveyard: true, exileSelf: true, effects: [empower(2)], label: "Empower Jace 2" })],
  },
  "Hexhaven Battalion": { spell: spell([], [fx.createTokens(CADET, 3), empower(2)]) },
  "Repurposed Enforcer": {
    abilities: [triggered(when.attacksSelf, [empower(amount.count(CREATURE_YOU_CONTROL))], { label: "Empower Jace X" })],
  },
  "Way of the Healer": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      walkersHave(
        loyalty(-2, { effects: [fx.createTokens(CADET), fx.surveil(1)], label: "Cadet, surveil 1" }),
        "Planeswalkers: [−2] Cadet",
      ),
    ],
  },
  "Way of the Mentor": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      triggered(when.gainLife, [fx.addCountersAll({ types: ["Planeswalker"], controller: "you" }, 1, "loyalty")], {
        label: "loyalty on each planeswalker",
      }),
    ],
  },
  "Loyal Tutor": { spell: spell([], [fx.search({ types: ["Planeswalker"] }, { to: "libraryTop" })]) },
  "Refute Destiny": {
    spell: spell([target.creatureOrPlaneswalker("t", { colors: ["G", "U"] })], [fx.exileCard(ref.target()), fx.surveil(1)]),
  },
  "Your Fate Ends Here": {
    spell: spell([target.creatureOrPlaneswalker("t", { minManaValue: 3 })], [fx.destroy(ref.target()), fx.surveil(1)]),
  },
  "Ajani Resolute": {
    abilities: [
      triggered(when.gainLife, [fx.counters(ref.self, "loyalty", 1)], { label: "loyalty counter" }),
      loyalty(0, { effects: [fx.gainLife(1)], label: "You gain 1 life" }),
      loyalty(-4, { effects: [fx.createTokens(AJANIS_PRIDEMATE)], label: "Ajani's Pridemate" }),
      loyalty(-10, {
        effects: [
          fx.emblem(msg("Ajani's emblem"), msg("Creatures you control get +2/+2."), [
            staticAbility(CREATURE_YOU_CONTROL, { power: 2, toughness: 2 }, { label: "+2/+2" }),
          ]),
        ],
        label: "emblem",
      }),
    ],
  },
  "Liliana the Faultless": {
    abilities: [
      triggered(
        when.enters({ ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true }),
        [fx.gainLife(1)],
        { label: "+1 life" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        discard: 1,
        targets: [target.creatureOrPlaneswalker("t", { controller: "you", other: true })],
        effects: [fx.modify(ref.target(), { addKeywords: ["hexproof"] })],
        label: "Discard: hexproof",
      }),
    ],
  },
  "Teyo, Lightshield Expert": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), { addKeywords: ["hexproof"] }),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Creature"] }), fx.addCounters(ref.target(), 1)),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Planeswalker"] }), fx.counters(ref.target(), "loyalty", 1)),
        ],
        {
          targets: [targetObj("t", { permanent: true, controller: "you" }, "permanent you control")],
          label: "hexproof",
        },
      ),
    ],
  },
};
