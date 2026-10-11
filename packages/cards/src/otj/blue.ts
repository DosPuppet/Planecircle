/** Outlaws of Thunder Junction — blue cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  doesntUntap,
  entersWith,
  fx,
  OUTLAW,
  ref,
  SPIRIT_2,
  spell,
  spree,
  staticAbility,
  target,
  triggered,
  when,
  ZOMBIE_ROGUE,
} from "./common";

const NO_HAND_SPELL = cond.not(cond.handSpellThisTurn);

export const BLUE: Record<string, CardScript> = {
  "Canyon Crab": {
    abilities: [
      activated({ mana: "{1}{U}", effects: [fx.pump(ref.self, 2, -2)], label: "+2/-2" }),
      triggered(when.yourEndStep, fx.loot(1), { condition: NO_HAND_SPELL, label: "Draw, then discard" }),
    ],
  },
  "Daring Thunder-Thief": { abilities: [entersWith({ tapped: true })] },
  "Deepmuck Desperado": {
    abilities: [
      triggered(when.crime, [fx.mill(3, ref.eachOpponent)], { oncePerTurn: true, label: "Each opponent mills three cards" }),
    ],
  },
  "Djinn of Fool's Fall": {},
  "Duelist of the Mind": {
    cda: { power: amount.cardsDrawnThisTurn },
    abilities: [
      triggered(when.crime, fx.may("Draw, then discard?", ...fx.loot(1)), {
        oncePerTurn: true,
        label: "Draw, then discard",
      }),
    ],
  },
  "Emergent Haunting": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.modify(
            ref.self,
            { addTypes: ["Creature"], addSubtypes: ["Spirit"], setPower: 3, setToughness: 3, addKeywords: ["flying"] },
            "permanent",
          ),
        ],
        {
          condition: cond.all(NO_HAND_SPELL, cond.not(cond.sourceMatches({ types: ["Creature"] }))),
          label: "Becomes a 3/3 flying Spirit",
        },
      ),
      activated({ mana: "{2}{U}", effects: [fx.surveil(1)], label: "Surveil 1" }),
    ],
  },
  "Failed Fording": {
    spell: spell([target.nonland("t")], [fx.bounce(ref.target()), fx.when(cond.controls({ subtype: "Desert" }), fx.surveil(1))]),
  },
  "Fleeting Reflection": {
    spell: spell(
      [target.creature("t", { controller: "you" }), target.upTo(1, target.creature("c", { other: true }))],
      [fx.pump(ref.target(), 0, 0, ["hexproof"]), fx.untap(ref.target()), fx.becomeCopy(ref.target(), ref.target("c"))],
    ),
  },
  "Geralf, the Fleshwright": {
    abilities: [
      triggered(when.castSpell("you"), [fx.createTokens(ZOMBIE_ROGUE)], {
        condition: cond.all(cond.yourTurn, cond.castThisTurn(2)),
        label: "2/2 Zombie Rogue",
      }),
      triggered(
        when.enters({ subtype: "Zombie", controller: "you" }),
        [
          // Turn log: the Zombies that entered this turn, even those gone since, minus the entering one.
          fx.addCounters(
            ref.eventObject,
            amount.plus(amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Zombie", who: "you" }), amount.neg(1)),
          ),
        ],
        { label: "A counter for each other Zombie that entered this turn" },
      ),
    ],
  },
  "Geyser Drake": {
    abilities: [costReducer({}, 1, "During other turns: spells cost {1} less", { condition: cond.opponentsTurn })],
  },
  "Harrier Strix": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target())], { targets: [target.nonland("t")], label: "Tap a permanent" }),
      activated({ mana: "{2}{U}", effects: fx.loot(1), label: "Draw, then discard" }),
    ],
  },
  "Jailbreak Scheme": {
    spell: spree(
      {
        cost: "{3}",
        label: "+1/+1 counter, unblockable",
        targets: [target.creature("c")],
        effects: [fx.addCounters(ref.target("c"), 1), fx.pump(ref.target("c"), 0, 0, ["unblockable"])],
      },
      {
        cost: "{2}",
        label: "Top or bottom of its owner's library",
        targets: [target.permanent("b", ["Artifact", "Creature"], {}, "artifact or creature")],
        effects: [fx.topOrBottom(ref.target("b"))],
      },
    ),
  },
  "Loan Shark": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: cond.castThisTurn(2), label: "Draw" })],
  },
  "Marauding Sphinx": {
    abilities: [triggered(when.crime, [fx.surveil(2)], { oncePerTurn: true, label: "Surveil 2" })],
  },
  "Metamorphic Blast": {
    spell: spree(
      {
        cost: "{1}",
        label: "Becomes a white 0/1 Rabbit",
        targets: [target.creature("c")],
        effects: [fx.modify(ref.target("c"), { setColors: ["W"], setSubtypes: ["Rabbit"], setPower: 0, setToughness: 1 })],
      },
      {
        cost: "{3}",
        label: "A player draws two cards",
        targets: [target.player("p")],
        effects: [fx.draw(2, ref.target("p"))],
      },
    ),
  },
  "Nimble Brigand": {
    abilities: [
      staticAbility("self", { addKeywords: ["unblockable"] }, { condition: cond.crime, label: "Unblockable (crime)" }),
      triggered(when.combatDamage("self", true), [fx.draw(1)], { label: "Draw" }),
    ],
  },
  "Outlaw Stitcher": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(ZOMBIE_ROGUE, 1, undefined, "z"),
          fx.addCounters(ref.stored("z"), amount.plus(amount.spellsCastThisTurn, amount.spellsCastThisTurn, -2)),
        ],
        { label: "Zombie Rogue, two counters for each spell after the first" },
      ),
    ],
  },
  "Peerless Ropemaster": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { tapped: true }))],
        label: "Return a tapped creature",
      }),
    ],
  },
  "Phantom Interference": {
    spell: spree(
      { cost: "{3}", label: "2/2 flying Spirit", effects: [fx.createTokens(SPIRIT_2)] },
      {
        cost: "{1}",
        label: "Counter unless {2} is paid",
        targets: [target.spell("s")],
        effects: fx.unlessPays(ref.controllerOf(ref.target("s")), { mana: "{2}" }, fx.counter(ref.target("s"))),
      },
    ),
  },
  "Plan the Heist": {
    spell: spell([], [fx.when(cond.amountAtLeast(amount.neg(amount.cardsIn("hand")), 0), fx.surveil(3)), fx.draw(3)]),
  },
  "Razzle-Dazzler": {
    abilities: [
      triggered(when.castNthSpell(2), [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["unblockable"])], {
        label: "+1/+1 counter, unblockable",
      }),
    ],
  },
  "Seize the Secrets": { costReduction: { generic: 1, condition: cond.crime }, spell: spell([], [fx.draw(2)]) },
  "Shackle Slinger": {
    abilities: [
      triggered(
        when.castNthSpell(2),
        [
          fx.when(cond.targetMatches("t", { tapped: true }), fx.counters(ref.target(), "stun", 1)),
          fx.when(cond.not(cond.targetMatches("t", { tapped: true })), fx.tap(ref.target())),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Tap it, or stun it" },
      ),
    ],
  },
  "Shifting Grift": {
    spell: spree(
      {
        cost: "{2}",
        label: "Exchange two creatures",
        targets: [target.creature("c1"), target.creature("c2")],
        effects: [fx.exchangeControl(ref.target("c1"), ref.target("c2"))],
      },
      {
        cost: "{1}",
        label: "Exchange two artifacts",
        targets: [target.permanent("a1", ["Artifact"]), target.permanent("a2", ["Artifact"])],
        effects: [fx.exchangeControl(ref.target("a1"), ref.target("a2"))],
      },
      {
        cost: "{1}",
        label: "Exchange two enchantments",
        targets: [target.permanent("e1", ["Enchantment"]), target.permanent("e2", ["Enchantment"])],
        effects: [fx.exchangeControl(ref.target("e1"), ref.target("e2"))],
      },
    ),
  },
  "Slickshot Lockpicker": {
    abilities: [
      triggered(when.entersSelf, [fx.grantFlashback(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "you", "instant or sorcery")],
        label: "Flashback granted",
      }),
    ],
  },
  "Slickshot Vault-Buster": {
    abilities: [staticAbility("self", { power: 2 }, { condition: cond.crime, label: "+2/+0 (crime)" })],
  },
  "Spring Splasher": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), -3, 0)], {
        targets: [target.of(ref.defendingPlayer, target.creature("t"), "creature of the defending player")],
        label: "-3/-0",
      }),
    ],
  },
  "Stoic Sphinx": {
    abilities: [
      staticAbility("self", { addKeywords: ["hexproof"] }, { condition: cond.not(cond.castThisTurn(1)), label: "Hexproof" }),
    ],
  },
  "Stop Cold": {
    enchant: { filter: { types: ["Artifact", "Creature"] }, label: "artifact or creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the enchanted permanent" }),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Loses all abilities" }),
      doesntUntap("attached"),
    ],
  },
  "Take the Fall": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.controls(OUTLAW), fx.pump(ref.target(), -4, 0)),
        fx.when(cond.not(cond.controls(OUTLAW)), fx.pump(ref.target(), -1, 0)),
        fx.draw(1),
      ],
    ),
  },
  "This Town Ain't Big Enough": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { controller: "you" }) },
    spell: spell([target.upTo(2, target.nonland("t"))], [fx.bounce(ref.target())]),
  },
  "Three Steps Ahead": {
    spell: spree(
      { cost: "{1}{U}", label: "Counter a spell", targets: [target.spell("s")], effects: [fx.counter(ref.target("s"))] },
      {
        cost: "{3}",
        label: "Token copy",
        targets: [target.permanent("c", ["Artifact", "Creature"], { controller: "you" }, "artifact or creature you control")],
        effects: [fx.copyToken(ref.target("c"))],
      },
      { cost: "{2}", label: "Draw two, discard one", effects: [fx.draw(2), fx.discard(1)] },
    ),
  },
};
