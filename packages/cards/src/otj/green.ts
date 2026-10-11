/** Outlaws of Thunder Junction — green cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  CREATURE_YOU_CONTROL,
  cond,
  ELEMENTAL,
  entersWith,
  fx,
  manaAbility,
  ref,
  spell,
  spree,
  staticAbility,
  TREASURE,
  target,
  triggered,
  VARMINT,
  when,
  whileSaddled,
} from "./common";

const BASIC_OR_DESERT = { types: ["Land" as const], anyOf: [{ basic: true }, { subtype: "Desert" }] };
const POWER_4 = cond.controls({ types: ["Creature"], minPower: 4 });

export const GREEN: Record<string, CardScript> = {
  "Aloe Alchemist": {
    abilities: [
      triggered(when.plottedSelf, [fx.pump(ref.target(), 3, 2, ["trample"])], {
        targets: [target.creature("t")],
        label: "Plotted: +3/+2 and trample",
      }),
    ],
  },
  "Beastbond Outcaster": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: POWER_4, label: "Draw" })],
  },
  "Betrayal at the Vault": {
    spell: spell(
      [target.creature("a", { controller: "you" }), { ...target.exactly(2, target.creature("b")), otherThan: ["a"] }],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Bristlepack Sentry": {
    abilities: [
      staticAbility("self", { addKeywords: ["attacksDespiteDefender"] }, { condition: POWER_4, label: "Can attack (power 4)" }),
    ],
  },
  "Bristly Bill, Spine Sower": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "+1/+1 counter" }),
      activated({
        mana: "{3}{G}{G}",
        effects: [fx.doubleCounters(ref.permanentsOf(ref.you, { types: ["Creature"] }))],
        label: "Double the +1/+1 counters",
      }),
    ],
  },
  Cactarantula: {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Desert" }) },
    abilities: [
      triggered({ on: "becomesTarget", who: "self", by: "opponent" }, fx.may("Draw a card?", fx.draw(1)), {
        label: "Targeted: draw",
      }),
    ],
  },
  "Colossal Rattlewurm": {
    rules: { flashIf: cond.controls({ subtype: "Desert" }) },
    abilities: [
      activated({
        mana: "{1}{G}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.search({ subtype: "Desert" }, { to: "battlefield", tapped: true })],
        label: "Tapped Desert",
      }),
    ],
  },
  "Dance of the Tumbleweeds": {
    spell: spree(
      { cost: "{1}", label: "Basic land or Desert", effects: [fx.search(BASIC_OR_DESERT, { to: "battlefield" })] },
      {
        cost: "{3}",
        label: "X/X Elemental",
        effects: [fx.createXXToken(ELEMENTAL, amount.count({ types: ["Land"], controller: "you" }))],
      },
    ),
  },
  "Drover Grizzly": {
    abilities: [whileSaddled([fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["trample"])], { label: "Your creatures: trample" })],
  },
  "Freestrider Commando": {
    abilities: [
      entersWith({ counters: 2, condition: cond.not(cond.all(cond.wasCast, cond.amountAtLeast(amount.manaSpent, 1))) }),
    ],
  },
  "Freestrider Lookout": {
    abilities: [
      triggered(
        when.crime,
        [fx.lookAtTop(5, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "bottom" })],
        { oncePerTurn: true, label: "A land among the top five" },
      ),
    ],
  },
  "Full Steam Ahead": {
    spell: spell(
      [],
      [
        fx.pumpAll(CREATURE_YOU_CONTROL, 2, 2, ["trample"]),
        fx.modifyAll(CREATURE_YOU_CONTROL, { addBlockRules: [block.atMost(1)] }),
      ],
    ),
  },
  "Giant Beaver": {
    abilities: [
      whileSaddled([fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature("t", { crew: "source" }), label: "creature that saddled it this turn" }],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Gold Rush": {
    spell: spell(
      [target.upTo(1, target.creature("t"))],
      [
        fx.createTokens(TREASURE),
        fx.pump(
          ref.target(),
          amount.plus(
            amount.count({ subtype: "Treasure", controller: "you" }),
            amount.count({ subtype: "Treasure", controller: "you" }),
          ),
          amount.plus(
            amount.count({ subtype: "Treasure", controller: "you" }),
            amount.count({ subtype: "Treasure", controller: "you" }),
          ),
        ),
      ],
    ),
  },
  "Goldvein Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(when.diesSelf, [fx.createTappedTokens(TREASURE, amount.powerOf(ref.self))], {
        label: "That many tapped Treasures",
      }),
    ],
  },
  "Hardbristle Bandit": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      triggered(when.crime, [fx.untap(ref.self)], { oncePerTurn: true, label: "Untap it" }),
    ],
  },
  "Intrepid Stablemaster": {
    abilities: [
      manaAbility("G"),
      manaAbility(["W", "U", "B", "R", "G"], 2, {
        restriction: { spell: { anyOf: [{ subtype: "Mount" }, { subtype: "Vehicle" }] } },
      }),
    ],
  },
  "Map the Frontier": {
    spell: spell([], [fx.search(BASIC_OR_DESERT, { to: "battlefield", tapped: true }, 2)]),
  },
  "Ornery Tumblewagg": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t")],
        label: "+1/+1 counter",
      }),
      whileSaddled([fx.doubleCounters(ref.target())], { targets: [target.creature("t")], label: "Double its counters" }),
    ],
  },
  "Outcaster Greenblade": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_OR_DESERT)], { label: "Basic land or Desert into your hand" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { subtype: "Desert", controller: "you" }, label: "+1/+1 for each Desert" },
      ),
    ],
  },
  "Outcaster Trailblazer": {
    abilities: [
      triggered(when.entersSelf, [fx.addManaChoice(1)], { label: "One mana of any color" }),
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, minPower: 4 }), [fx.draw(1)], {
        label: "Draw",
      }),
    ],
  },
  "Patient Naturalist": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone("graveyard", { types: ["Land"] }, { to: "hand" }, { pool: ref.stored("m"), store: "l" }),
          fx.when(cond.not(cond.v("l")), fx.createTokens(TREASURE)),
        ],
        { label: "Mill three cards, a land into your hand (otherwise Treasure)" },
      ),
    ],
  },
  "Railway Brawler": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        [fx.addCounters(ref.eventObject, amount.powerOf(ref.eventObject))],
        {
          label: "As many counters as its power",
        },
      ),
    ],
  },
  "Rambling Possum": {
    abilities: [
      whileSaddled(
        [
          fx.pump(ref.self, 1, 2),
          fx.chooseAmong(ref.crewedBy, ref.you, "r", {
            anyNumber: true,
            prompt: "Choose the creatures that saddled it to return to hand",
          }),
          fx.bounce(ref.stored("r")),
        ],
        { label: "+1/+2, then return those that saddled it" },
      ),
    ],
  },
  "Raucous Entertainer": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addCountersAll({ ...CREATURE_YOU_CONTROL, enteredThisTurn: true }, 1)],
        label: "Counter on your creatures that entered this turn",
      }),
    ],
  },
  "Reach for the Sky": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { power: 3, toughness: 2, addKeywords: ["reach"] }, { label: "+3/+2 and reach" }),
      triggered(when.putIntoGraveyardSelf, [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Rise of the Varmints": {
    spell: spell([], [fx.createTokens(VARMINT, amount.countIn("graveyard", { types: ["Creature"] }))]),
  },
  "Smuggler's Surprise": {
    spell: spree(
      {
        cost: "{2}",
        label: "Mill four cards, return two of them",
        effects: [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature", "Land"] },
            { to: "hand" },
            { pool: ref.stored("m"), count: 2, min: 0 },
          ),
        ],
      },
      {
        cost: "{4}{G}",
        label: "Up to two creatures from your hand",
        effects: [fx.pickFromZone("hand", { types: ["Creature"] }, { to: "battlefield" }, { count: 2, min: 0 })],
      },
      {
        cost: "{1}",
        label: "Your creatures with power 4: protected",
        effects: [fx.pumpAll({ ...CREATURE_YOU_CONTROL, minPower: 4 }, 0, 0, ["hexproof", "indestructible"])],
      },
    ),
  },
  "Spinewoods Armadillo": {
    abilities: [
      activated({
        mana: "{1}{G}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.search(BASIC_OR_DESERT), fx.gainLife(3)],
        label: "Basic land or Desert, +3 life",
      }),
    ],
  },
  "Spinewoods Paladin": { abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "+3 life" })] },
  "Stubborn Burrowfiend": {
    abilities: [
      triggered(
        when.saddled,
        [
          fx.mill(2),
          fx.pump(
            ref.self,
            amount.countIn("graveyard", { types: ["Creature"] }),
            amount.countIn("graveyard", { types: ["Creature"] }),
          ),
        ],
        { oncePerTurn: true, label: "Mill two cards, +X/+X" },
      ),
    ],
  },
  "Throw from the Saddle": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [
        fx.when(cond.targetMatches("a", { subtype: "Mount" }), fx.addCounters(ref.target("a"), 1)),
        fx.when(cond.not(cond.targetMatches("a", { subtype: "Mount" })), fx.pump(ref.target("a"), 1, 1)),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
  "Trash the Town": {
    spell: spree(
      {
        cost: "{2}",
        label: "Two +1/+1 counters",
        targets: [target.creature("a")],
        effects: [fx.addCounters(ref.target("a"), 2)],
      },
      {
        cost: "{1}",
        label: "Trample",
        targets: [target.creature("b")],
        effects: [fx.pump(ref.target("b"), 0, 0, ["trample"])],
      },
      {
        cost: "{1}",
        label: "Combat damage: draw two cards",
        targets: [target.creature("c")],
        effects: [
          fx.modify(ref.target("c"), {
            addAbilities: [triggered(when.combatDamage("self", true), [fx.draw(2)], { label: "Draw two cards" })],
          }),
        ],
      },
    ),
  },
  "Tumbleweed Rising": {
    spell: spell([], [fx.createXXToken(ELEMENTAL, amount.maxPower({ types: ["Creature"], controller: "you" }))]),
  },
  "Voracious Varmint": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy an artifact or enchantment",
      }),
    ],
  },
};
