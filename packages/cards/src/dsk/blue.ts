/** Duskmourn — blue cards. */
import {
  amount,
  type CardScript,
  cond,
  eerie,
  entersWith,
  fx,
  glimmer,
  modal,
  mode,
  ref,
  SPIRIT_BLUE,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Bottomless Pool": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Return a creature",
      }),
    ],
  },
  "Locker Room": {
    abilities: [
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you" }), [fx.draw(1)], {
        label: "Draw a card",
      }),
    ],
  },
  "Clammy Prowler": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t", { attacking: true, other: true })],
        label: "Another attacking creature can't be blocked",
      }),
    ],
  },
  "Don't Make a Sound": {
    spell: spell(
      [target.spell()],
      [
        ...fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}", paidStore: "paid" }, fx.counter(ref.target())),
        ...fx.when(cond.v("paid"), fx.surveil(2)),
      ],
    ),
  },
  "Duskmourn's Domination": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    rules: { controlsEnchanted: true },
    abilities: [staticAbility("attached", { power: -3, loseAllAbilities: true }, { label: "-3/-0, loses all abilities" })],
  },
  "Enter the Enigma": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["unblockable"]), fx.draw(1)]),
  },
  "Entity Tracker": {
    abilities: [eerie([fx.draw(1)], { label: "Draw a card" })],
  },
  "Erratic Apparition": {
    abilities: [eerie([fx.pump(ref.self, 1, 1)], { label: "+1/+1" })],
  },
  "Fear of Failed Tests": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.draw(amount.eventAmount)], { label: "Draw that many cards" })],
  },
  "Fear of Falling": {
    abilities: [
      triggered(when.attacksSelf, [fx.modify(ref.target(), { power: -2, removeKeywords: ["flying"] }, "untilYourNextTurn")], {
        targets: [target.of(ref.defendingPlayer, target.creature("t"), "creature defending player controls")],
        label: "-2/-0 and loses flying",
      }),
    ],
  },
  "Get Out": {
    spell: modal(
      mode(
        "Counter a creature or enchantment spell",
        [target.spell("t", { types: ["Creature", "Enchantment"] }, "creature or enchantment spell")],
        [fx.counter(ref.target())],
      ),
      mode(
        "Return one or two creatures or enchantments",
        [
          target.between(
            1,
            2,
            target.permanent("b", ["Creature", "Enchantment"], { owner: "you" }, "creature or enchantment you own"),
          ),
        ],
        [fx.bounce(ref.target("b"))],
      ),
    ),
  },
  Glimmerburst: { spell: spell([], [fx.draw(2), glimmer()]) },
  "Meat Locker": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 2)], {
        targets: [target.upTo(1, target.creature())],
        label: "Tap a creature, two stun counters",
      }),
    ],
  },
  "Drowned Diner": {
    abilities: [triggered(when.unlockThisDoor, [fx.draw(3), fx.discard(1)], { label: "Draw three cards, discard one" })],
  },
  "Piranha Fly": { abilities: [entersWith({ tapped: true })] },
  "Scrabbling Skullcrab": {
    abilities: [eerie([fx.mill(2, ref.target())], { targets: [target.player()], label: "Mill 2" })],
  },
  "Silent Hallcreeper": {
    keywords: ["unblockable"],
    abilities: [
      triggeredModal(
        when.combatDamageToPlayer,
        [
          mode("Two +1/+1 counters", [], [fx.addCounters(ref.self, 2)]),
          mode("Draw a card", [], [fx.draw(1)]),
          mode(
            "Becomes a copy of another creature",
            [target.creature("t", { controller: "you", other: true })],
            [fx.becomeCopy(ref.self, ref.target(), "permanent")],
          ),
        ],
        { uniqueModes: true, label: "A mode not chosen yet" },
      ),
    ],
  },
  "Stalked Researcher": {
    abilities: [eerie([fx.pump(ref.self, 0, 0, ["attacksDespiteDefender"])], { label: "Can attack this turn" })],
  },
  "Tunnel Surveyor": {
    abilities: [triggered(when.entersSelf, [glimmer()], { label: "1/1 Glimmer token" })],
  },
  "Twist Reality": {
    spell: modal(
      mode("Counter a spell", [target.spell()], [fx.counter(ref.target())]),
      mode("Manifest dread", [], [fx.manifestDread]),
    ),
  },
  "Unnerving Grasp": {
    spell: spell([target.upTo(1, target.nonland())], [fx.bounce(ref.target()), fx.manifestDread]),
  },
  "Unwilling Vessel": {
    abilities: [
      eerie([fx.counters(ref.self, "possession", 1)], { label: "Possession counter" }),
      triggered(when.diesSelf, [fx.createXXToken(SPIRIT_BLUE, amount.lkiCounters("any"))], { label: "X/X flying Spirit" }),
    ],
  },
  "Vanish from Sight": {
    spell: spell([target.nonland()], [fx.topOrBottom(ref.target()), fx.surveil(1)]),
  },
};
