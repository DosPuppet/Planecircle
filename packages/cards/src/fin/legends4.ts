/** Final Fantasy — the last unique cards (lot D4). */
import type { CardScript, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  entersWith,
  eventReplacement,
  fx,
  graveyardReplacement,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const EQUIPMENT_YOU = { subtype: "Equipment", controller: "you" as const };
const LANDS_AND_BIRDS = { anyOf: [{ types: ["Land" as const] }, { types: ["Creature" as const], subtype: "Bird" }] };

export const LEGENDS4: Record<string, CardScript> = {
  "Ultima, Origin of Oblivion": {
    abilities: [
      // "For as long as that land has a blight counter on it": the effect no longer depends on Ultima.
      triggered(
        when.attacksSelf,
        [
          fx.counters(ref.target(), "blight", 1),
          fx.modifyWhileCounter(
            ref.target(),
            { setSubtypes: [], loseAllAbilities: true, addAbilities: [manaAbility("C")] },
            "blight",
          ),
        ],
        {
          targets: [targetObj("t", { types: ["Land"] }, "land")],
          label: "Blight counter on a land: it loses its types and abilities, and taps for {C}",
        },
      ),
      eventReplacement({
        event: "mana",
        to: "you",
        source: { types: ["Land"] },
        manaProduced: "C",
        modify: { add: 1 },
        label: "A land tapped for {C} adds {C}",
      }),
    ],
  },
  "Zack Fair": {
    abilities: [
      entersWith({ counters: 1 }),
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.pump(ref.target(), 0, 0, ["indestructible"]),
          fx.addCounters(ref.target(), amount.lkiCounters("+1/+1")),
          // "An Equipment that was attached to Zack": you choose one (whoever controls it).
          fx.chooseAmong(ref.permanentsOf(ref.eachPlayer, { subtype: "Equipment", attached: "wasToSource" }), ref.you, "e", {
            prompt: "Choose an Equipment to attach",
          }),
          fx.attach(ref.target(), ref.stored("e")),
        ],
        label: "Indestructible, its counters and its Equipment",
      }),
    ],
  },
  "Gogo, Master of Mimicry": {
    abilities: [
      activated({
        mana: "{X}{X}",
        tap: true,
        minX: 1,
        targets: [
          {
            id: "t",
            label: "activated or triggered ability you control",
            filter: { stackItems: { only: "abilities" } },
          } satisfies TargetSpec,
        ],
        effects: [fx.copySpell(ref.target(), amount.x)],
        label: "Copy an ability X times",
      }),
    ],
  },
  "Stolen Uniform": {
    spell: spell(
      [target.creature("c", { controller: "you" }), targetObj("e", { subtype: "Equipment" }, "Equipment")],
      [
        fx.gainControl(ref.target("e")),
        fx.attach(ref.target("c"), ref.target("e")),
        // "When you lose control of that Equipment this turn, if it's attached to a creature you control,
        // unattach it" (at cleanup, when control comes back).
        fx.whenThisTurn(
          when.opponentGainsControl,
          ref.target("e"),
          [fx.unattach(ref.target("e"), ref.permanentsOf(ref.you, { types: ["Creature"] }))],
          { bind: { e: ref.target("e") }, label: "Unattach the Equipment" },
        ),
      ],
    ),
  },
  "The Darkness Crystal": {
    abilities: [
      costReducer({ colors: ["B"] }, 1, "Black spells cost {1} less"),
      graveyardReplacement({
        fromBattlefield: true,
        filter: { types: ["Creature"], controller: "opponent", token: false },
        link: "uid",
        gainLife: 2,
        label: "Opponents' creatures exiled instead of dying, +2 life",
      }),
      activated({
        mana: "{4}{B}{B}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "creature card exiled with The Darkness Crystal",
            filter: { exiled: { linked: true, filter: { types: ["Creature"] } } },
          } satisfies TargetSpec,
        ],
        effects: [
          fx.moveTo(ref.target(), {
            to: "battlefield",
            tapped: true,
            underYourControl: true,
            counters: { kind: "+1/+1", n: 2 },
          }),
        ],
        label: "An exiled creature returns under your control",
      }),
    ],
  },
  "Firion, Wild Rose Warrior": {
    abilities: [
      staticAbility({ ...YOURS, equipped: true }, { addKeywords: ["haste"] }, { label: "Equipped creatures: haste" }),
      triggered(
        when.enters({ ...EQUIPMENT_YOU, token: false }),
        [fx.copyToken(ref.eventObject, { equipDiscount: 2, sacrificeAtNextUpkeep: true })],
        { label: "Copy of the Equipment (equip costs {2} less)" },
      ),
    ],
  },
  "Raubahn, Bull of Ala Mhigo": {
    abilities: [
      wardAbility({ lifePower: true }),
      triggered(when.attacksSelf, [fx.attach(ref.target("c"), ref.target("e"))], {
        targets: [
          target.upTo(1, targetObj("e", EQUIPMENT_YOU, "Equipment you control")),
          target.creature("c", { attacking: true }),
        ],
        label: "Attach an Equipment to an attacking creature",
      }),
    ],
  },
  "Triple Triad": {
    abilities: [triggered(when.yourUpkeep, [fx.tripleTriad], { label: "Triple Triad" })],
  },
  "Unexpected Request": {
    // "You may attach an Equipment you control": chosen on resolution, not targeted.
    spell: spell(
      [target.creature("t")],
      [
        fx.gainControl(ref.target("t")),
        fx.untap(ref.target("t")),
        fx.pump(ref.target("t"), 0, 0, ["haste"]),
        fx.chooseAmong(ref.permanentsOf(ref.you, EQUIPMENT_YOU), ref.you, "e", {
          optional: true,
          prompt: "Unexpected Request: you may attach an Equipment you control to the creature",
        }),
        fx.attach(ref.target("t"), ref.stored("e")),
        fx.delayed([fx.unattach(ref.target("e"))], { e: ref.stored("e") }),
      ],
    ),
  },
  "Vaan, Street Thief": {
    abilities: [
      triggered(
        when.combatDamageBatch({
          ...YOURS,
          anyOf: [{ subtype: "Scout" }, { subtype: "Pirate" }, { subtype: "Rogue" }],
        }),
        [
          fx.exileTop(ref.eventPlayer, 1, "v"),
          fx.castNow(ref.stored("v"), { storeCast: "cast" }),
          fx.when(cond.not(cond.v("cast")), fx.createTokens(TREASURE)),
        ],
        { label: "Exile their top card; cast it or Treasure" },
      ),
      triggered(
        when.castSpellNotOwned,
        [fx.addCountersAll({ ...YOURS, anyOf: [{ subtype: "Scout" }, { subtype: "Pirate" }, { subtype: "Rogue" }] }, 1)],
        { label: "A counter on each Scout, Pirate and Rogue" },
      ),
    ],
  },
  "Ancient Adamantoise": {
    abilities: [
      staticAbility("self", { addKeywords: ["keepsDamage"] }, { label: "Damage isn't removed" }),
      eventReplacement({
        event: "damage",
        to: "yourSide",
        redirectTo: "source",
        modify: {},
        label: "Absorbs damage",
      }),
      triggered(when.diesSelf, [fx.exileCard(ref.selfCard), fx.createTappedTokens(TREASURE, 10)], {
        label: "Exile it, ten tapped Treasures",
      }),
    ],
  },
  "Traveling Chocobo": {
    abilities: [
      playerStatic({
        playFrom: { zone: "libraryTop", filter: LANDS_AND_BIRDS },
        triggerMod: { effect: "again", on: "enter", entering: { ...LANDS_AND_BIRDS, controller: "you" } },
        label: "Lands and Birds from the top; enter triggers doubled",
      }),
    ],
  },
  "Absolute Virtue": {
    rules: { cantBeCountered: true },
    abilities: [playerStatic({ protection: "opponents", label: "Protection from your opponents" })],
  },
  "Zidane, Tantalus Thief": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["lifelink", "haste"])],
        { targets: [target.creature("t", { controller: "opponent" })], label: "Gain control of a creature" },
      ),
      triggered(when.opponentGainsControl, [fx.createTokens(TREASURE)], { label: "Treasure" }),
    ],
  },
  "Buster Sword": {
    abilities: [
      staticAbility("attached", { power: 3, toughness: 2 }, { label: "+3/+2" }),
      triggered(
        when.attachedDealsCombatDamageToPlayer,
        [fx.draw(1), fx.castNow(ref.handOf(ref.you, { notTypes: ["Land"] }, amount.eventAmount), { free: true })],
        { label: "Draw, cast a spell with mana value ≤ damage for free" },
      ),
    ],
  },
  "The Masamune": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "dies", emblems: true, sources: { attached: "host" } },
        label: "Dies: triggers of the equipped creature and your emblems trigger an additional time",
      }),
      staticAbility(
        "attached",
        { addKeywords: ["firstStrike", "mustBeBlocked"] },
        { condition: cond.refMatches(ref.attached, { attacking: true }), label: "Attacking: first strike, must be blocked" },
      ),
    ],
  },
  "Clive's Hideaway": {
    abilities: [
      // Hideaway 4: the card is exiled face down (only you can see it).
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(4, { count: 1, to: { to: "exile", faceDown: "you" }, rest: "bottom", store: "h" }),
          fx.link(ref.stored("h")),
        ],
        { label: "Hideaway 4" },
      ),
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        effects: [
          fx.when(
            cond.controls({ types: ["Creature"], legendary: true }, 4),
            fx.grantPlay(ref.linked, { free: true, anyTime: true }),
          ),
        ],
        label: "Play the hidden card (four legendary creatures)",
      }),
    ],
  },
};
