/**
 * The Hobbit — multicolored cards (lot A). Flying, reach, vigilance, menace, first strike and Equip are read from the
 * text, as is Storied (enduring story). Recruit ("Draw a card, then discard a card. If you discarded a nonland card,
 * create a 1/1 white Human Soldier token") is in hob/common.ts.
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cond,
  ELF,
  eventReplacement,
  fx,
  playerStatic,
  recruit,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** "a Goblin, Orc, or Army you control" */
const GOBLIN_ORC_ARMY: ObjectFilter = { anySubtype: ["Goblin", "Orc", "Army"], controller: "you" };

export const MULTI: Record<string, CardScript> = {
  "Bard, King of Dale": {
    abilities: [
      eventReplacement({
        event: "draw",
        to: "you",
        modify: { times: 2 },
        exceptTurnDraw: true,
        label: "Draw two cards instead of one (except the first of your draw step)",
      }),
      eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Twice as many tokens" }),
    ],
  },
  "Bard the Bowman": {
    abilities: [
      triggered(when.draw(2), [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["lifelink"] })], {
        targets: [target.creature()],
        label: "Second card drawn: a +1/+1 counter and lifelink",
      }),
    ],
  },
  "Bard's Company": {
    flashIf: cond.controls({ subtype: "Human" }),
    abilities: [
      staticAbility({ ...YOUR_CREATURES, other: true }, { power: 1, toughness: 1 }, { label: "Your other creatures: +1/+1" }),
      ...[when.entersSelf, when.attacksSelf].map((trigger) => triggered(trigger, recruit(), { label: "Recruiting" })),
    ],
  },
  "Bifur, Melodic Rider": {
    // Storied: read from the text.
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(trigger, [fx.addCounters(ref.target(), 1)], {
          targets: [target.creature()],
          label: "A +1/+1 counter on a creature",
        }),
      ),
      playerStatic({
        triggerMod: { effect: "again", sources: { subtype: "Dwarf", controller: "you" } },
        condition: cond.enduringStory,
        label: "Enduring story: triggered abilities of your Dwarves trigger an additional time",
      }),
    ],
  },
  "Bolg of the North": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(
            cond.v("s"),
            fx.reflexive(
              [target.creature("t", { other: true })],
              [
                fx.damageStoringExcess(amount.powerOf(ref.target("sac")), ref.target(), "x"),
                ...fx.when(cond.v("x"), fx.amass(ref.you, "Goblin", amount.v("x"))),
              ],
              { sac: ref.stored("s") },
            ),
          ),
        ],
        { label: "Optional sacrifice: damage equal to its power; the excess amasses Goblins" },
      ),
    ],
  },
  "Bolg's Company": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["haste"] },
        { condition: cond.controls({ subtype: "Goblin", other: true }), label: "Haste with another Goblin" },
      ),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Goblin" } },
        effects: [fx.addMana("B", "R")],
        label: "Sacrifice another Goblin: add {B}{R}",
      }),
    ],
  },
  "The Chief Warg": {
    // Menace: read from the text.
    abilities: [
      triggered(when.attackWith(1), [fx.draw(1), fx.loseLife(1)], {
        condition: cond.ferocious,
        label: "Ferocious: draw a card and lose 1 life",
      }),
    ],
  },
  "Duskwatch Hunter": {
    abilities: [
      blockAbility(block.notBy({ token: true }, "Can't be blocked by tokens")),
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "A +1/+1 counter on a creature",
      }),
    ],
  },
  "Eagle's Rescue": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["flying"] }, { label: "+2/+2 and flying" }),
      activated({
        mana: "{2}{W/U}{W/U}",
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", maxPower: 1 })],
        // The Aura enters directly attached to the target creature (no other host is asked for).
        effects: [fx.moveTo(ref.selfCard, { to: "battlefield" }, undefined, ref.target())],
        label: "Returns from the graveyard attached to one of your creatures with power 1 or less",
      }),
    ],
  },
  "Fearsome Goblin Pair": {
    abilities: [triggered(when.diesSelf, [fx.amass(ref.you, "Goblin", 4)], { label: "Amass Goblins 4" })],
  },
  "Goblin Plate Mail": {
    // Equip {4}: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.amass(ref.you, "Goblin", 1),
          // The Army that just got the counter: the first one you control, as for amass.
          fx.attach(ref.permanentsOf(ref.you, { subtype: "Army" })),
        ],
        { label: "Amass Goblins 1, then attach it to the Army" },
      ),
      staticAbility("attached", { power: 1, addKeywords: ["menace"] }, { label: "+1/+0 and menace" }),
    ],
  },
  "The Great Goblin": {
    abilities: [
      triggered(when.youPutCounters(GOBLIN_ORC_ARMY), [fx.damage(2, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Counters on a Goblin, Orc or Army: 2 damage to an opponent",
      }),
      triggered(
        when.dies({ ...GOBLIN_ORC_ARMY, other: true }),
        [fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })],
        { label: "Exile the top card, playable until the end of your next turn" },
      ),
    ],
  },
  "Mirkwood Nurturer": {
    abilities: [
      triggered(when.entersSelf, [...fx.when(cond.targetChosen("t"), fx.bounce(ref.target()), fx.addCounters(ref.self, 1))], {
        targets: [
          target.upTo(1, targetObj("t", { permanent: true, controller: "you", other: true }, "other permanent you control")),
        ],
        label: "Returns another of your permanents; a +1/+1 counter",
      }),
    ],
  },
  "Nori, Teller of Tales": {
    abilities: [
      triggered(when.attacksSelf, [fx.modify(ref.target(), { addKeywords: ["firstStrike"] })], {
        targets: [target.creature("t", { attacking: true })],
        label: "An attacking creature gains first strike",
      }),
    ],
  },
  "Patient Instructor": {
    // Vigilance: read from the text.
    abilities: [triggered(when.entersSelf, recruit(), { label: "Recruiting" })],
  },
  "Silvan Reveler": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "l", storeFilter: { types: ["Land"] } }),
          ...fx.when(cond.v("l"), fx.toBattlefield(ref.stored("l"), { tapped: true })),
        ],
        { label: "Draw then discard; a discarded land enters tapped" },
      ),
      triggered(
        when.landfall,
        fx.mayPay("{1}{G}{U}", "Pay {1}{G}{U} to return Silvan Reveler to hand?", fx.toHand(ref.selfCard)),
        { fromGraveyard: true, label: "Landfall: returns from the graveyard to hand" },
      ),
    ],
  },

  // --- Thranduil, Sindarin Liege // Silvan Rally --------------------------------
  "Thranduil, Sindarin Liege": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, subtype: "Elf", other: true },
        { power: 1, toughness: 1 },
        { label: "Your other Elves: +1/+1" },
      ),
      triggered(when.landfall, [fx.createTokens(ELF)], { label: "Landfall: a 1/1 Elf" }),
    ],
  },
  "Silvan Rally": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Land"] },
          { to: "hand" },
          { count: 2, min: 0, pool: ref.stored("m"), prompt: "Up to two milled land cards to your hand" },
        ),
      ],
    ),
  },

  "Thranduil's Company": {
    abilities: [
      playerStatic({
        extraLands: 1,
        condition: cond.controls({ subtype: "Elf", other: true }),
        label: "With another Elf: an additional land on each of your turns",
      }),
      triggered(when.landfall, [fx.addCounters(ref.target(), 2), fx.modify(ref.target(), { addKeywords: ["vigilance"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Landfall: two +1/+1 counters and vigilance",
      }),
    ],
  },
  "Tom, Bert, and William": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.draw(amount.powerOf(ref.costSacrificed)), fx.discard(1)],
        label: "Draw as many as the sacrificed creature's power, then discard",
      }),
      // "If they were a creature": dying (as a creature) ensures it; once returned as an artifact, they no longer
      // return.
      triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { setTypes: ["Artifact"], setSubtypes: [] })], {
        label: "Return to the battlefield as an artifact",
      }),
    ],
  },
};
