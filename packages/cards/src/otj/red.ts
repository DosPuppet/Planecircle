/** Outlaws of Thunder Junction — red cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  DINOSAUR_3_1,
  fx,
  mercenary,
  mode,
  OUTLAW,
  OUTLAW_CREATURE,
  ref,
  SCORPION_DRAGON,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
  whileSaddled,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Brimstone Roundup": {
    abilities: [triggered(when.castNthSpell(2), [mercenary()], { label: "1/1 Mercenary" })],
  },
  "Caught in the Crossfire": {
    spell: spree(
      { cost: "{1}", label: "2 damage to each outlaw", effects: [fx.damageAll(2, OUTLAW_CREATURE)] },
      {
        cost: "{1}",
        label: "2 damage to each non-outlaw",
        effects: [fx.damageAll(2, { types: ["Creature"], noneOfSubtypes: OUTLAW.anySubtype })],
      },
    ),
  },
  "Cunning Coyote": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 1, 1, ["haste"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+1 and haste",
      }),
    ],
  },
  "Deadeye Duelist": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.damage(1, ref.target())],
        label: "1 damage",
      }),
    ],
  },
  "Demonic Ruckus": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["menace", "trample"] },
        { label: "+1/+1, menace and trample" },
      ),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Discerning Peddler": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), fx.when(cond.v("d"), fx.draw(1))], {
        label: "Discard: draw",
      }),
    ],
  },
  "Explosive Derailment": {
    spell: spree(
      {
        cost: "{2}",
        label: "4 damage to a creature",
        targets: [target.creature("c")],
        effects: [fx.damage(4, ref.target("c"))],
      },
      {
        cost: "{2}",
        label: "Destroy an artifact",
        targets: [target.permanent("a", ["Artifact"])],
        effects: [fx.destroy(ref.target("a"))],
      },
    ),
  },
  Ferocification: {
    abilities: [
      triggeredModal(when.step("beginCombat"), [
        mode("+2/+0", [target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 2, 0)]),
        mode(
          "Menace and haste",
          [target.creature("t", { controller: "you" })],
          [fx.pump(ref.target(), 0, 0, ["menace", "haste"])],
        ),
      ]),
    ],
  },
  "Gila Courser": {
    abilities: [
      whileSaddled([fx.exileTop(ref.you, 1, "g"), fx.grantPlay(ref.stored("g"), { untilYourNextTurn: true })], {
        label: "Exile the top card, playable until the end of your next turn",
      }),
    ],
  },
  "Hell to Pay": {
    spell: spell(
      [target.creature("t")],
      [fx.damageStoringExcess(amount.x, ref.target(), "e"), fx.createTappedTokens(TREASURE, amount.v("e"))],
    ),
  },
  "Hellspur Brute": { costReduction: { generic: amount.count({ ...OUTLAW, controller: "you" }) } },
  "Hellspur Posse Boss": {
    abilities: [
      staticAbility({ ...OUTLAW_CREATURE, controller: "you", other: true }, { addKeywords: ["haste"] }, { label: "Haste" }),
      triggered(when.entersSelf, [mercenary(2)], { label: "Two 1/1 Mercenaries" }),
    ],
  },
  "Highway Robbery": {
    spell: spell(
      [],
      [
        fx.discard(1, ref.you, { optional: true, store: "d" }),
        fx.when(cond.not(cond.v("d")), fx.sacrifice(ref.you, { types: ["Land"] }, 1, { optional: true, store: "l" })),
        fx.when(cond.not(cond.all(cond.not(cond.v("d")), cond.not(cond.v("l")))), fx.draw(2)),
      ],
    ),
  },
  "Irascible Wolverine": {
    abilities: [
      triggered(when.entersSelf, [fx.exileTop(ref.you, 1, "w"), fx.grantPlay(ref.stored("w"))], {
        label: "Exile the top card, playable this turn",
      }),
    ],
  },
  "Iron-Fist Pulverizer": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.damage(2, ref.target()), fx.scry(1)], {
        targets: [target.player("t", "opponent")],
        label: "2 damage, scry 1",
      }),
    ],
  },
  "Longhorn Sharpshooter": {
    abilities: [
      triggered(when.plottedSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "Plotted: 2 damage" }),
    ],
  },
  "Magda, the Hoardmaster": {
    abilities: [
      triggered(when.crime, [fx.createTappedTokens(TREASURE)], { oncePerTurn: true, label: "Tapped Treasure" }),
      activated({
        sacrificeOther: { filter: { subtype: "Treasure" }, count: 3 },
        sorcerySpeed: true,
        effects: [fx.createTokens(SCORPION_DRAGON)],
        label: "4/4 Scorpion Dragon",
      }),
    ],
  },
  "Mine Raider": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], {
        condition: cond.controls({ ...OUTLAW_CREATURE, other: true }),
        label: "Treasure",
      }),
    ],
  },
  "Outlaws' Fury": {
    spell: spell(
      [],
      [
        fx.pumpAll({ types: ["Creature"], controller: "you" }, 2, 0),
        fx.when(
          cond.controls(OUTLAW_CREATURE),
          fx.exileTop(ref.you, 1, "o"),
          fx.grantPlay(ref.stored("o"), { untilYourNextTurn: true }),
        ),
      ],
    ),
  },
  "Prickly Pair": { abilities: [triggered(when.entersSelf, [mercenary()], { label: "1/1 Mercenary" })] },
  "Quick Draw": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.player("p", "opponent")],
      [
        fx.pump(ref.target("a"), 1, 1, ["firstStrike"]),
        fx.modify(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), {
          removeKeywords: ["firstStrike", "doubleStrike"],
        }),
      ],
    ),
  },
  "Quilled Charger": { abilities: [whileSaddled([fx.pump(ref.self, 1, 2, ["menace"])], { label: "+1/+2 and menace" })] },
  "Reckless Lackey": {
    abilities: [
      activated({ mana: "{2}{R}", sacrifice: true, effects: [fx.draw(1), fx.createTokens(TREASURE)], label: "Draw, Treasure" }),
    ],
  },
  "Rodeo Pyromancers": {
    abilities: [triggered(when.castNthSpell(1), [fx.addMana("R", "R")], { label: "Add {R}{R}" })],
  },
  "Scalestorm Summoner": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(DINOSAUR_3_1)], {
        condition: cond.controls({ types: ["Creature"], minPower: 4 }),
        label: "3/1 Dinosaur",
      }),
    ],
  },
  "Scorching Shot": { spell: spell([target.creature("t")], [fx.damage(5, ref.target())]) },
  "Slickshot Show-Off": {
    abilities: [triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 2, 0)], { label: "+2/+0" })],
  },
  "Stingerback Terror": {
    abilities: [staticAbility("self", { power: -1, toughness: -1 }, { perHand: true, label: "-1/-1 for each card in hand" })],
  },
  "Take for a Ride": {
    rules: { flashIf: cond.crime },
    spell: spell(
      [target.creature("t")],
      [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"])],
    ),
  },
  "Thunder Salvo": {
    spell: spell([target.creature("t")], [fx.damage(amount.plus(1, amount.spellsCastThisTurn), ref.target())]),
  },
  "Trick Shot": {
    spell: spell(
      [target.creature("a"), { ...target.upTo(1, target.creature("b", { token: true })), otherThan: ["a"] }],
      [fx.damage(6, ref.target("a")), fx.damage(2, ref.target("b"))],
    ),
  },
};
