/** Edge of Eternities — green cards. */
import {
  activated,
  amount,
  block,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  fx,
  LANDER,
  lander,
  ROBOT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Biosynthic Burst": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.addCounters(ref.target(), 1),
        fx.pump(ref.target(), 0, 0, ["reach", "trample", "indestructible"]),
        fx.untap(ref.target()),
      ],
    ),
  },
  "Blooming Stinger": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Deathtouch",
      }),
    ],
  },
  "Broodguard Elite": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(when.leavesSelf, [fx.lkiCountersTo(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Its counters onto a creature",
      }),
    ],
  },
  "Diplomatic Relations": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.pump(ref.target("a"), 1, 0, ["vigilance"]),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
  "Drix Fatemaker": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "+1/+1 counter" }),
      staticAbility({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }, { addKeywords: ["trample"] }, { label: "Trample" }),
    ],
  },
  "Edge Rover": {
    abilities: [
      triggered(when.diesSelf, [fx.createTokens(LANDER, 1, ref.eachPlayer)], { label: "Each player creates a Lander" }),
    ],
  },
  "Eumidian Terrabotanist": {
    abilities: [triggered(when.landfall, [fx.gainLife(1)], { label: "Landfall: +1 life" })],
  },
  "Eusocial Engineering": {
    abilities: [triggered(when.landfall, [fx.createTokens(ROBOT)], { label: "Landfall: 2/2 Robot" })],
  },
  "Fungal Colossus": { costReduction: { generic: amount.distinctNames({ types: ["Land"], controller: "you" }) } },
  "Galactic Wayfarer": { abilities: [triggered(when.entersSelf, [lander()], { label: "Lander" })] },
  "Germinating Wurm": { abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 life" })] },
  "Glacier Godmaw": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      triggered(when.landfall, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1, ["vigilance", "haste"])], {
        label: "Landfall: your creatures +1/+1",
      }),
    ],
  },
  "Harmonious Grovestrider": { cda: { pt: amount.count({ types: ["Land"], controller: "you" }) } },
  "Hemosymbic Mite": {
    abilities: [
      triggered(when.tapsSelf, [fx.pump(ref.target(), amount.powerOf(ref.self), amount.powerOf(ref.self))], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+X/+X",
      }),
    ],
  },
  "Icecave Crasher": {
    abilities: [triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall: +1/+0" })],
  },
  "Intrepid Tenderfoot": {
    abilities: [activated({ mana: "{3}", sorcerySpeed: true, effects: [fx.addCounters(ref.self, 1)], label: "+1/+1 counter" })],
  },
  "Lashwhip Predator": {
    costReduction: {
      generic: 2,
      condition: cond.amountAtLeast(amount.count({ types: ["Creature"], controller: "opponent" }), 3),
    },
  },
  "Meltstrider Eulogist": {
    abilities: [triggered(when.dies({ ...CREATURE_YOU_CONTROL, withCounter: "+1/+1" }), [fx.draw(1)], { label: "Draw" })],
  },
  "Meltstrider's Gear": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it",
      }),
      staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["reach"] }, { label: "+2/+1 and reach" }),
    ],
  },
  "Meltstrider's Resolve": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.attached, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "Combat",
      }),
      staticAbility(
        "attached",
        { toughness: 2, addBlockRules: [block.atMost(1)] },
        {
          label: "+0/+2, can't be blocked by more than one creature",
        },
      ),
    ],
  },
  "Mightform Harmonizer": {
    abilities: [
      triggered(when.landfall, [fx.pump(ref.target(), amount.powerOf(ref.target()), 0)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Landfall: double its power",
      }),
    ],
  },
  Ouroboroid: {
    abilities: [
      triggered(when.yourCombat, [fx.addCountersAll(CREATURE_YOU_CONTROL, amount.powerOf(ref.self))], {
        label: "X +1/+1 counters on your creatures",
      }),
    ],
  },
  "Pull Through the Weft": {
    spell: spell(
      [
        target.upTo(2, target.cardInGraveyard("a", { permanent: true, notTypes: ["Land"] }, "you", "nonland permanent card")),
        target.upTo(2, target.cardInGraveyard("b", { types: ["Land"] }, "you", "land card")),
      ],
      [fx.toHand(ref.target("a")), fx.toBattlefield(ref.target("b"), { tapped: true })],
    ),
  },
  "Sami's Curiosity": { spell: spell([], [fx.gainLife(2), lander()]) },
  "Seedship Agrarian": {
    abilities: [
      triggered(when.tapsSelf, [lander()], { label: "Lander" }),
      triggered(when.landfall, [fx.addCounters(ref.self, 1)], { label: "Landfall: +1/+1 counter" }),
    ],
  },
  "Seedship Impact": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
      [fx.when(cond.targetMatches("t", { maxManaValue: 2 }), lander()), fx.destroy(ref.target())],
    ),
  },
  "Shattered Wings": {
    spell: spell(
      [
        {
          id: "t",
          label: "artifact, enchantment or creature with flying",
          filter: { objects: { anyOf: [{ types: ["Artifact", "Enchantment"] }, { types: ["Creature"], keyword: "flying" }] } },
        },
      ],
      [fx.destroy(ref.target()), fx.surveil(1)],
    ),
  },
  Thawbringer: {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "Surveil 1" }),
    ],
  },
};
