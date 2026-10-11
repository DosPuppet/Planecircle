/**
 * Wilds of Eldraine — blue cards (lot A). Bargain, ward, flash and Adventures are read from the text; each face of an
 * Adventure card has its entry (the creature under its name, the spell under the name of the Adventure).
 */
import type { Effect, TargetSpec, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CURSED_ROLE,
  chapter,
  cmp,
  cond,
  createRole,
  doesntUntap,
  entersWith,
  flashFor,
  fx,
  INSTANT_SORCERY,
  playerStatic,
  ref,
  SORCERER_ROLE,
  spell,
  target,
  triggered,
  when,
} from "./common";

/** Faerie: 1/1 blue creature with flying and "This token can block only creatures with flying." */
const FAERIE_FLYING_BLOCKER: TokenSpec = {
  name: "Faerie",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Faerie"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
  abilities: [blockAbility(block.onlyBlocks({ keyword: "flying" }, "Can block only creatures with flying"))],
  text: "Flying\nThis token can block only creatures with flying.",
};

/** "target creature an opponent controls" */
const OPP_CREATURE = (id = "t"): TargetSpec => target.creature(id, { controller: "opponent" });

/** "Tap [the creature] and put N stun counters on it." */
const tapAndStun = (what = ref.target(), n = 1): Effect[] => [fx.tap(what), fx.counters(what, "stun", n)];

/** "Whenever you cast an Adventure spell" (the spell cast as an Adventure, 715.3). */
const CAST_ADVENTURE = when.castSpell("you", { subtype: "Adventure" });

/** "Whenever you cast a spell with mana value 5 or greater" */
const CAST_MV5 = when.castSpell("you", { minManaValue: 5 });

/** "up to one other target creature you control" */
const OTHER_CREATURE_YOU = target.optional(target.creature("t", { controller: "you", other: true }));

/** Number of opponents who control at least one creature (controllers of the opponents' creatures, without duplicates). */
const OPPONENTS_WITH_CREATURES = amount.refCount(
  ref.union(ref.controllerOf(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))),
);

export const BLUE: Record<string, CardScript> = {
  "Ingenious Prodigy": {
    abilities: [
      blockAbility(
        block.notBy(
          { compare: [cmp.power(">", amount.sourcePower)] },
          "Stealth: can't be blocked by creatures with greater power",
        ),
      ),
      entersWith({ counters: amount.x }),
      triggered(
        when.yourUpkeep,
        [
          ...fx.may("Remove a +1/+1 counter to draw a card?", fx.removeCounters(ref.self, 1, "+1/+1", "r")),
          ...fx.when(cond.v("r"), fx.draw(1)),
        ],
        {
          condition: cond.sourceMatches({ withCounter: "+1/+1" }),
          label: "You may remove a +1/+1 counter: draw a card",
        },
      ),
    ],
  },
  // Prowess read from the text.
  "Elusive Otter": {
    abilities: [
      blockAbility(
        block.notBy({ compare: [cmp.power("<", amount.sourcePower)] }, "Can't be blocked by creatures with lesser power"),
      ),
    ],
  },
  "Grove's Bounty": {
    spell: spell([target.upTo(99, target.creature("t", { controller: "you" }))], [fx.countersDivided(amount.x, ref.target())]),
  },
  // Bargain read from the text; "costs {N} less if it's bargained": reduction under `cond.kicked`.
  "Ice Out": {
    costReduction: { generic: 1, condition: cond.kicked },
    spell: spell([target.spell()], [fx.counter(ref.target())]),
  },
  "Johann's Stopgap": {
    costReduction: { generic: 2, condition: cond.kicked },
    spell: spell([target.nonland()], [fx.bounce(ref.target()), fx.draw(1)]),
  },
  "Asinine Antics": {
    castOptions: [flashFor("{2}")],
    spell: spell([], createRole(CURSED_ROLE, ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))),
  },
  "Aquatic Alchemist": {
    abilities: [
      // The first instant or sorcery of the turn (both together): the event amount counts those cast before; trigger
      // condition (checked on casting only), the next ones trigger nothing.
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pump(ref.self, 2, 0)], {
        triggerCondition: cond.not(cond.amountAtLeast(amount.eventAmount, 1)),
        label: "First instant or sorcery of the turn: +2/+0",
      }),
    ],
  },
  "Bubble Up": {
    spell: spell(
      [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card in your graveyard")],
      [fx.moveTo(ref.target(), { to: "libraryTop" })],
    ),
  },
  "Archive Dragon": { abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" })] },
  "Beluna's Gatekeeper": {},
  "Entry Denied": {
    spell: spell([target.creature("t", { controller: "opponent", maxManaValue: 3 })], [fx.bounce(ref.target())]),
  },
  "Bitter Chill": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Taps the enchanted creature" }),
      doesntUntap("attached"),
      triggered(when.putIntoGraveyardSelf, [fx.mayPay("{1}", "Pay {1} to scry 1, then draw?", fx.scry(1), fx.draw(1))], {
        label: "You may pay {1}: scry 1, then draw",
      }),
    ],
  },
  "Chancellor of Tales": {
    abilities: [
      triggered(CAST_ADVENTURE, [fx.may("Copy this Adventure spell?", fx.copySpell(ref.eventObject, 1))], {
        label: "You may copy the Adventure spell",
      }),
    ],
  },
  "Diminisher Witch": {
    abilities: [
      triggered(when.entersSelf, createRole(CURSED_ROLE), {
        targets: [OPP_CREATURE()],
        condition: cond.kicked,
        label: "Bargained: a Cursed Role on a creature an opponent controls",
      }),
    ],
  },
  "Farsight Ritual": {
    spell: spell([], [fx.lookAtTop(amount.kicked(8, 4), { count: 2, exact: true, to: { to: "hand" }, rest: "bottom" })]),
  },
  "Freeze in Place": { spell: spell([OPP_CREATURE()], [...tapAndStun(ref.target(), 3), fx.scry(2)]) },
  "Gadwick's First Duel": {
    abilities: [
      chapter([1], createRole(CURSED_ROLE), {
        targets: [target.optional(target.creature())],
        label: "A Cursed Role on up to one creature",
      }),
      chapter([2], [fx.scry(2)], { label: "Scry 2" }),
      chapter(
        [3],
        [
          {
            op: "playerEffect",
            ability: { nextSpell: { filter: { ...INSTANT_SORCERY, maxManaValue: 3 }, copy: true } },
            once: true,
          },
        ],
        { label: "Copy your next instant or sorcery with MV 3 or less this turn" },
      ),
    ],
  },
  "Galvanic Giant": {
    abilities: [
      triggered(CAST_MV5, tapAndStun(), {
        targets: [OPP_CREATURE()],
        label: "Spell with MV 5 or greater: tap a creature an opponent controls, a stun counter",
      }),
    ],
  },
  "Storm Reading": { spell: spell([], [fx.draw(4), fx.discard(2)]) },
  "Horned Loch-Whale": {
    abilities: [entersWith({ tapped: true, condition: cond.not(cond.yourTurn), label: "Enters tapped if it's not your turn" })],
  },
  "Lagoon Breach": {
    spell: spell([target.creature("t", { attacking: true, controller: "opponent" })], [fx.topOrBottom(ref.target())]),
  },
  "Icewrought Sentry": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{1}{U}",
          "Pay {1}{U} to tap a creature an opponent controls?",
          fx.reflexive([OPP_CREATURE()], [fx.tap(ref.target())]),
        ),
        { label: "You may pay {1}{U}: tap a creature an opponent controls" },
      ),
      triggered({ on: "taps", who: { types: ["Creature"], controller: "opponent" }, byYou: true }, [fx.pump(ref.self, 2, 1)], {
        label: "You tap a creature an opponent controls: +2/+1",
      }),
    ],
  },
  "Into the Fae Court": { spell: spell([], [fx.draw(3), fx.createTokens(FAERIE_FLYING_BLOCKER)]) },
  "Living Lectern": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        sorcerySpeed: true,
        targets: [OTHER_CREATURE_YOU],
        effects: [fx.draw(1), ...createRole(SORCERER_ROLE)],
        label: "Draw; a Sorcerer Role on up to one other creature",
      }),
    ],
  },
  "Merfolk Coralsmith": {
    abilities: [
      activated({ mana: "{1}", effects: [fx.pump(ref.self, 1, -1)], label: "+1/-1" }),
      triggered(when.diesSelf, [fx.scry(2)], { label: "Scry 2" }),
    ],
  },
  "Misleading Motes": { spell: spell([target.creature()], [fx.topOrBottom(ref.target())]) },
  "Obyra's Attendants": {},
  "Desperate Parry": { spell: spell([target.creature()], [fx.pump(ref.target(), -4, 0)]) },
  "Picklock Prankster": {},
  "Free the Fae": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { anyOf: [INSTANT_SORCERY, { subtype: "Faerie" }] },
          { to: "hand" },
          { count: 1, pool: ref.stored("m"), prompt: "A milled instant, sorcery or Faerie card" },
        ),
      ],
    ),
  },
  "Sleep-Cursed Faerie": {
    abilities: [
      entersWith({
        tapped: true,
        counters: 3,
        counterKind: "stun",
        label: "Enters tapped with three stun counters",
      }),
      activated({ mana: "{1}{U}", effects: [fx.untap(ref.self)], label: "Untap this creature" }),
    ],
  },
  "Snaremaster Sprite": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{2}", "Pay {2} to tap a creature an opponent controls?", fx.reflexive([OPP_CREATURE()], tapAndStun())),
        { label: "You may pay {2}: tap a creature an opponent controls, a stun counter" },
      ),
    ],
  },
  "Spell Stutter": {
    spell: spell(
      [target.spell()],
      [
        ...fx.unlessPays(
          ref.controllerOf(ref.target()),
          { genericAmount: amount.plus(2, amount.count({ subtype: "Faerie", controller: "you" })) },
          fx.counter(ref.target()),
        ),
      ],
    ),
  },
  "Splashy Spellcaster": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), createRole(SORCERER_ROLE), {
        targets: [OTHER_CREATURE_YOU],
        label: "A Sorcerer Role on up to one other creature",
      }),
    ],
  },
  "Stormkeld Prowler": {
    abilities: [triggered(CAST_MV5, [fx.addCounters(ref.self, 2)], { label: "Spell with MV 5 or greater: two +1/+1 counters" })],
  },
  "Succumb to the Cold": {
    spell: spell([target.between(1, 2, OPP_CREATURE())], tapAndStun()),
  },
  "Talion's Messenger": {
    abilities: [
      triggered(
        when.attackWith(1, { subtype: "Faerie" }),
        [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive([target.creature("t", { subtype: "Faerie", controller: "you" })], [fx.addCounters(ref.target(), 1)]),
          ),
        ],
        { label: "Draw, discard; a +1/+1 counter on a Faerie" },
      ),
    ],
  },
  "Tenacious Tomeseeker": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card in your graveyard")],
        condition: cond.kicked,
        label: "Bargained: an instant or a sorcery from the graveyard to hand",
      }),
    ],
  },
  "Vantress Transmuter": {},
  "Croaking Curse": { spell: spell([target.creature()], [fx.tap(ref.target()), ...createRole(CURSED_ROLE)]) },
  "Virtue of Knowledge": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "enter" },
        label: "Enter triggers of your permanents doubled",
      }),
    ],
  },
  "Vantress Visions": {
    spell: spell(
      [
        {
          id: "t",
          label: "activated or triggered ability you control",
          filter: { stackItems: { only: "abilities", controller: "you" } },
        },
      ],
      [fx.copySpell(ref.target(), 1)],
    ),
  },
  "Water Wings": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.modify(ref.target(), { setPower: 4, setToughness: 4, addKeywords: ["flying", "hexproof"] })],
    ),
  },
  "Frolicking Familiar": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pump(ref.self, 1, 1)], {
        label: "Instant or sorcery: +1/+1",
      }),
    ],
  },
  "Blow Off Steam": { spell: spell([target.any()], [fx.damage(1, ref.target())]) },
  "Threadbind Clique": {},
  "Rip the Seams": { spell: spell([target.creature("t", { tapped: true })], [fx.destroy(ref.target())]) },
  "Twining Twins": {},
  "Swift Spiral": {
    spell: spell(
      [target.creature("t", { token: false })],
      [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
    ),
  },
  "Faerie Slumber Party": {
    spell: spell(
      [],
      [
        // The tokens are created first (two for each opponent who controls a creature), then all the other creatures
        // return to hand: same result as the printed order, the number being set before the return.
        fx.createTokens(
          FAERIE_FLYING_BLOCKER,
          amount.plus(OPPONENTS_WITH_CREATURES, OPPONENTS_WITH_CREATURES),
          undefined,
          "faeries",
        ),
        fx.bounce(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.stored("faeries"))),
      ],
    ),
  },
  "Rowdy Research": {
    // {1} less for each creature that attacked this turn (distinct creatures of the turn log).
    costReduction: { generic: amount.turnEvents({ event: "attack", distinct: "object" }) },
    spell: spell([], [fx.draw(3)]),
  },
  "Extraordinary Journey": {
    abilities: [
      // "up to X target creatures": X is evaluated on targeting (`countAmount`).
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "j" }), fx.grantPlay(ref.stored("j"), { forever: true, for: "owner" })],
        {
          targets: [{ ...target.upTo(1, target.creature()), countAmount: amount.sourceX }],
          label: "Exile up to X creatures; their owners may play them",
        },
      ),
      triggered({ on: "enters", who: { types: ["Creature"], token: false }, fromZone: "exile" }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "A creature enters from exile: draw a card (once each turn)",
      }),
    ],
  },
  "Storyteller Pixie": {
    abilities: [triggered(CAST_ADVENTURE, [fx.draw(1)], { label: "Adventure spell: draw a card" })],
  },
};
