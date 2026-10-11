/**
 * Teenage Mutant Ninja Turtles — blue cards (lot A). Sneak, landcycling and affinity: read from the text (affinity is
 * written as a cost reduction, as in Aetherdrift).
 */
import type { Effect, Ref, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  MUTAGEN,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ARTIFACT_YOU_CONTROL: TargetSpec = target.permanent("t", ["Artifact"], { controller: "you" }, "artifact you control");

/**
 * "Put three +1/+1 counters on [the artifact]. If it isn't a creature, it becomes a 0/0 Robot creature in addition to
 * its other types" (Donatello, Mutant Mechanic; Does Machines, level 3).
 */
const roboticize = (what: Ref): Effect[] => [
  fx.addCounters(what, 3),
  ...fx.when(
    cond.not(cond.refMatches(what, { types: ["Creature"] })),
    fx.modify(what, { addTypes: ["Creature"], addSubtypes: ["Robot"], setPower: 0, setToughness: 0 }, "permanent"),
  ),
];

/**
 * "You may tap or untap target creature": the target is chosen when it triggers, the action during resolution
 * (608.2d); only the useful action is offered (like Granite Witness).
 */
const tapOrUntapCreature = [
  ...fx.when(
    cond.refMatches(ref.target(), { tapped: false }),
    fx.mayForStore(ref.you, "Tap target creature?", "e", fx.tap(ref.target())),
  ),
  ...fx.when(
    cond.all(cond.not(cond.v("e")), cond.refMatches(ref.target(), { tapped: true })),
    fx.may("Untap target creature?", fx.untap(ref.target())),
  ),
];

/**
 * Kitsune: "two other target creatures controlled by different players", whether they are yours or two opponents'
 * creatures.
 */
const KITSUNE_TARGETS: TargetSpec = {
  ...target.exactly(2, target.creature("t", { other: true })),
  differentPlayers: true,
  label: "two other creatures of different players",
};
const kitsuneExchange = fx.may(
  "Exchange control of the two target creatures?",
  // The two target creatures, whoever their controllers (nothing if one of them is no longer a legal target).
  fx.exchangeControl(ref.nth(ref.target(), 0), ref.nth(ref.target(), 1)),
);

export const BLUE: Record<string, CardScript> = {
  "April, Reporter of the Weird": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(amount.eventAmount), fx.discard(1)], {
        label: "Draw that many cards, then discard a card",
      }),
    ],
  },
  "Bespoke Bō": {
    // Equip {3}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }, "other nonland permanent"))],
        label: "Return up to one other nonland permanent to its owner's hand",
      }),
      staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["vigilance"] }, { label: "+2/+1 and vigilance" }),
    ],
  },
  "Buzz Bots": {
    abilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Crustacean Commando": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "A Mutagen token" })],
  },
  "Does Machines": {
    // Level costs read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.mill(2), fx.draw(2), fx.discard(2)], {
        label: "Mill two cards, draw two, then discard two",
      }),
    ],
    classLevels: [
      [
        triggered(when.classLevel(2), [fx.toHand(ref.target())], {
          targets: [target.upTo(2, target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card"))],
          label: "Return up to two artifact cards from your graveyard to your hand",
        }),
      ],
      [
        triggered(when.yourCombat, roboticize(ref.target()), {
          targets: [ARTIFACT_YOU_CONTROL],
          label: "Three +1/+1 counters on an artifact you control, which becomes a 0/0 Robot",
        }),
      ],
    ],
  },
  "Donatello, Gadget Master": {
    // Sneak {1}{U}: read from the text.
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.copyToken(ref.target())], {
        targets: [ARTIFACT_YOU_CONTROL],
        label: "A token copy of an artifact you control",
      }),
    ],
  },
  "Donatello, Mutant Mechanic": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [ARTIFACT_YOU_CONTROL],
        effects: roboticize(ref.target()),
        label: "Three +1/+1 counters on an artifact you control, which becomes a 0/0 Robot",
      }),
      // "if it had counters on it": in the filter (last known information), like Host of the Hereafter.
      triggered(
        { on: "leaves", who: { types: ["Artifact"], controller: "you", withCounter: "any" }, to: "graveyard" },
        [fx.lkiCountersTo(ref.target())],
        {
          targets: [
            target.optional(
              target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artifact or creature you control"),
            ),
          ],
          label: "Its counters go onto an artifact or creature you control",
        },
      ),
    ],
  },
  "Donatello, Turtle Techie": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Artifact"] }),
        label: "If you control an artifact, draw a card",
      }),
    ],
  },
  "Donatello, Way with Machines": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.self, 1)], {
        label: "An artifact enters under your control: a +1/+1 counter",
      }),
    ],
  },
  "Donatello's Technique": {
    // Sneak {U}: read from the text.
    spell: spell([], [fx.draw(2)]),
  },
  "Kitsune, Dragon's Daughter": {
    abilities: [
      triggered(when.entersSelf, kitsuneExchange, {
        targets: [KITSUNE_TARGETS],
        label: "You may exchange control of two other creatures",
      }),
      triggered(when.combatDamageToPlayer, kitsuneExchange, {
        targets: [KITSUNE_TARGETS],
        label: "You may exchange control of two other creatures",
      }),
    ],
  },
  "Kitsune's Technique": {
    // Sneak {1}{U}: read from the text.
    spell: spell([target.player("t", "opponent")], [fx.millHalf(ref.target(), true)]),
  },
  "Krang, Master Mind": {
    costReduction: { generic: amount.count({ types: ["Artifact"], controller: "you" }) },
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.plus(4, amount.neg(amount.cardsIn("hand"))))], {
        condition: cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 4)),
        label: "Fewer than four cards in hand: draw up to four",
      }),
      staticAbility(
        "self",
        { power: 1 },
        { per: { types: ["Artifact"], controller: "you", other: true }, label: "+1/+0 for each other artifact you control" },
      ),
    ],
  },
  Metalhead: {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.permanent("t", ["Artifact", "Creature"], { other: true }, "other artifact or creature"))],
        label: "Return up to one other artifact or creature",
      }),
      activated({
        mana: "{R}",
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["menace", "haste"])],
        label: "A +1/+1 counter, menace and haste",
      }),
    ],
  },
  "Mind Transfer Protocol": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 5 }), fx.draw(1)],
    ),
  },
  "Ooze Spill": {
    spell: spell([target.spell()], [fx.counter(ref.target()), fx.createTokens(MUTAGEN)]),
  },
  "Ray Fillet, Man Ray": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "A Mutagen token" }),
      activated({
        mana: "{2}",
        removeCounterFrom: { filter: { types: ["Creature"], controller: "you" }, kind: "+1/+1" },
        effects: [fx.draw(1)],
        label: "Remove a +1/+1 counter from a creature you control: draw a card",
      }),
    ],
  },
  "Renet, Temporal Apprentice": {
    // "entered this turn": came under the control of its current controller this turn (`enteredThisTurn`).
    abilities: [
      triggered(
        when.entersSelf,
        [fx.bounce(ref.permanentsOf(ref.eachPlayer, { notTypes: ["Land"], other: true, enteredThisTurn: true }))],
        { label: "Return each other nonland permanent that entered this turn" },
      ),
    ],
  },
  "Retro-Mutation": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { setSubtypes: ["Turtle"], setPower: 0, setToughness: 1, loseAllAbilities: true, addKeywords: ["cantAttack"] },
        { label: "Base 0/1 Turtle, with no abilities, can't attack" },
      ),
    ],
  },
  "Return to the Sewers": {
    spell: spell([target.creature()], [fx.topOrBottom(ref.target()), fx.createTokens(MUTAGEN)]),
  },
  "Sewer-veillance Cam": {
    abilities: [
      triggered(when.entersSelf, tapOrUntapCreature, {
        targets: [target.creature()],
        label: "You may tap or untap a creature",
      }),
      triggered(when.leavesSelf, tapOrUntapCreature, {
        targets: [target.creature()],
        label: "You may tap or untap a creature",
      }),
      activated({ mana: "{3}{U}", sacrifice: true, effects: [fx.draw(2)], label: "Draw two cards" }),
    ],
  },
  "Stockman, Mad Fly-entist": {
    // Islandcycling {2}: read from the text.
    abilities: [triggered(when.entersSelf, fx.loot(1), { label: "ctx:loot|Draw a card, then discard a card" })],
  },
  "Turtles in Time": {
    rules: { exileOnResolve: true },
    spell: spell([], [fx.bounce(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] })), fx.mayShuffleHandGraveyardDraw(7)]),
  },
  "Utrom Scientists": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.upTo(1, target.creature())],
        label: "Tap up to one creature; a stun counter",
      }),
    ],
  },
};
