/** Teenage Mutant Ninja Turtles — white cards (lot A). */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cmp,
  cond,
  DINOSAUR_SOLDIER,
  FOOD,
  fx,
  MUTANT,
  mode,
  NINJA,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Alliance: "whenever another creature you control enters". */
const ALLIANCE = when.enters({ ...CREATURES_YOU_CONTROL, other: true });

export const WHITE: Record<string, CardScript> = {
  "Action News Crew": {
    // Vigilance: read from the text. Channel: ability activated from the hand, by discarding the card.
    abilities: [
      activated({
        mana: "{6}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.addCountersAll(CREATURES_YOU_CONTROL, 1), fx.draw(1)],
        label: "Channel: a +1/+1 counter on each creature you control, draw a card",
      }),
    ],
  },
  "Agent Bishop, Man in Black": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "A +1/+1 counter on each of up to two creatures",
      }),
    ],
  },
  "April O'Neil, Kunoichi Trainee": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      blockAbility(block.notBy({ minPower: 3 }, "Can't be blocked by creatures with power 3 or greater")),
    ],
  },
  "Dimensional Exile": {
    enchant: { filter: { types: ["Land"], basic: true, controller: "you" }, label: "basic land you control" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exiles a creature an opponent controls until it leaves",
      }),
    ],
  },
  "East Wind Avatar": {
    abilities: [triggered(ALLIANCE, [fx.pump(ref.self, 1, 0)], { label: "Alliance: +1/+0 until end of turn" })],
  },
  "Featherbrained Filcher": {
    abilities: [triggered(when.leavesSelf, [fx.createTokens(FOOD)], { label: "A Food" })],
  },
  "Grounded for Life": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Hamato Guardian Stance": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["flying"]), fx.scry(1)]),
  },
  "High-Flying Ace": {
    abilities: [
      activated({
        mana: "{3}{W}",
        sorcerySpeed: true,
        targets: [{ ...target.creature("t", { not: { keyword: "flying" } }), label: "creature without flying" }],
        effects: [fx.modify(ref.target(), { addKeywords: ["flying"] })],
        label: "A creature without flying gains flying",
      }),
    ],
  },
  "Jennika, Bad Apple Big Sister": {
    // Plainscycling {2}: read from the text.
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTANT)], { label: "A 2/2 red Mutant" })],
  },
  "Koya, Death from Above": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileCard(ref.target(), { name: "k" }),
          // "You may pay {3}{B}. If you don't, return that card": unless you pay.
          fx.delayed([fx.unlessPays(ref.you, { mana: "{3}{B}" }, fx.toBattlefield(ref.target("k")))], { k: ref.stored("k") }),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Exiles another creature; it returns at end of turn unless you pay {3}{B}",
        },
      ),
    ],
  },
  "Leader's Talent": {
    abilities: [
      triggered(when.attackWith(1), [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature("t", { attacking: true }), label: "attacking creature" }],
        label: "A +1/+1 counter on an attacking creature",
      }),
    ],
    classLevels: [
      [
        triggered(when.leaves({ ...CREATURES_YOU_CONTROL, withCounter: "any" }), [fx.gainLife(2)], {
          label: "A creature you control with a counter leaves: gain 2 life",
        }),
      ],
      [
        triggered(when.castSpell("you"), [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], {
          label: "A +1/+1 counter on each creature you control",
        }),
      ],
    ],
  },
  "Leonardo, Big Brother": {
    // Sneak {W}: read from the text.
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { ...CREATURES_YOU_CONTROL, other: true }, label: "+1/+0 for each other creature you control" },
      ),
    ],
  },
  "Leonardo, Cutting Edge": {
    // Sneak {W} and lifelink: read from the text.
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "A +1/+1 counter" })],
  },
  "Leonardo, Leader in Blue": {
    // Sneak {3}{W}{W}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURES_YOU_CONTROL, 2, 0)], {
        condition: cond.castVia("sneak"),
        label: "Sneaked: creatures you control get +2/+0",
      }),
      activated({
        mana: "{1}{W}",
        effects: [fx.modify(ref.self, { addKeywords: ["firstStrike"] })],
        label: "First strike until end of turn",
      }),
    ],
  },
  "Leonardo, Sewer Samurai": {
    // Sneak {2}{W}{W} and double strike: read from the text.
    abilities: [
      playerStatic({
        playFrom: {
          zone: "graveyard",
          filter: { types: ["Creature"], anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] },
          what: "spells",
          finality: true,
        },
        condition: cond.yourTurn,
      }),
    ],
  },
  "Leonardo's Technique": {
    // Sneak {1}{W}: read from the text.
    spell: spell(
      [
        target.between(
          1,
          2,
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with mana value 3 or less"),
        ),
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  "Lita, Little Orphan Amphibian": {
    abilities: [
      triggeredModal(
        ALLIANCE,
        [
          mode("A +1/+1 counter on Lita", [], [fx.addCounters(ref.self, 1)]),
          mode("A Food", [], [fx.createTokens(FOOD)]),
          mode("Scry 1", [], [fx.scry(1)]),
        ],
        { uniqueModes: "turn", label: "Alliance: a mode not chosen yet this turn" },
      ),
    ],
  },
  "Mighty Mutanimals": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTANT)], { label: "A 2/2 red Mutant" }),
      triggered(ALLIANCE, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Alliance: a +1/+1 counter on a creature you control",
      }),
    ],
  },
  "Prehistoric Pet": {
    abilities: [
      blockAbility(
        block.notBy({ compare: [cmp.power(">", amount.sourcePower)] }, "Can't be blocked by creatures with greater power"),
      ),
      activated({
        mana: "{1}{W}",
        tap: true,
        activationCondition: cond.yourTurn,
        targets: [{ ...target.creature("t", { controller: "you", other: true }), label: "other creature you control" }],
        effects: [fx.bounce(ref.target())],
        label: "Returns another creature you control to hand",
      }),
    ],
  },
  "Quintessential Katana": {
    // Equip {2}: read from the text.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [
            triggered(when.combatDamage("self"), [fx.untap(ref.self), fx.gainLife(2)], {
              label: "Combat damage: untaps, gain 2 life",
            }),
          ],
        },
        { label: "+1/+1; combat damage: untaps and 2 life" },
      ),
      triggered(
        when.enters({ subtype: "Ninja", controller: "you" }),
        fx.may("Attach Quintessential Katana to that Ninja?", fx.attach(ref.eventObject)),
        { label: "You may attach it to the Ninja that entered" },
      ),
    ],
  },
  "Sally Pride, Lioness Leader": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MUTANT, amount.count({ ...CREATURES_YOU_CONTROL, token: false }))], {
        label: "X 2/2 Mutants (X: your nontoken creatures)",
      }),
      triggered(when.attacksSelf, [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], {
        label: "A +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Triceraton Commander": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(DINOSAUR_SOLDIER, amount.sourceX)], {
        label: "X 2/2 white Dinosaur Soldiers",
      }),
      triggered(when.attacksSelf, [fx.pumpAll({ subtype: "Dinosaur", controller: "you", other: true }, 1, 1, ["flying"])], {
        label: "Your other Dinosaurs get +1/+1 and gain flying",
      }),
    ],
  },
  "Turncoat Kunoichi": {
    // Sneak {2}{W}{B}: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.castVia("sneak"), fx.exile(ref.target())),
          ...fx.when(cond.not(cond.castVia("sneak")), fx.exileUntilLeaves(ref.target())),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Exiles a creature an opponent controls until it leaves (for good if sneaked)",
        },
      ),
    ],
  },
  "Turtles Forever": {
    // Outside the game: the sideboard (400.11b); the cards not chosen, from the sideboard too, are shuffled into the
    // library. Approximation: with fewer than four cards found, the opponent chooses among those.
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"], legendary: true }, { to: "hand" }, 4, undefined, "f", undefined, {
          alsoFrom: ["sideboard"],
          reveal: true,
          distinctNames: true,
        }),
        fx.chooseAmong(ref.stored("f"), ref.eachOpponent, "c1", { anyZone: true }),
        fx.chooseAmong(ref.stored("c1Rest"), ref.eachOpponent, "c2", { anyZone: true }),
        fx.moveTo(ref.stored("c2Rest"), { to: "libraryTop", shuffle: true }),
      ],
    ),
  },
  "Uneasy Alliance": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Can't attack or block" }),
      activated({
        mana: "{5}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.exile(ref.attached), fx.createTokens(NINJA)],
        label: "Exiles the enchanted creature, a 1/1 Ninja",
      }),
    ],
  },
};
