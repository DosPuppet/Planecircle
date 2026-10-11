/**
 * Avatar: The Last Airbender: black cards (lot A). Firebending, flying, deathtouch, menace, crew and landcycling are
 * read from the text.
 */
import type { TargetSpec, TokenSpec } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CLUE,
  chapter,
  cond,
  exhaust,
  FOOD,
  fx,
  kicker,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "land you control");
const ARTIFACT_OR_CREATURE = { anyOf: [{ types: ["Artifact" as const] }, { types: ["Creature" as const] }] };

/** Token of Fire Navy Trebuchet: "Ballistic Boulder", 2/1 colorless Construct artifact creature with flying. */
const BALLISTIC_BOULDER: TokenSpec = {
  name: "Ballistic Boulder",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 2,
  toughness: 1,
  keywords: ["flying"],
  text: "Flying",
};

/** "another target creature or Vehicle you control" (Fire Nation Engineer). */
const CREATURE_OR_VEHICLE_YOU: TargetSpec = {
  id: "t",
  label: "other creature or Vehicle you control",
  filter: { objects: { controller: "you", other: true, anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] } },
};

/** Boiling Rock Rioter: "exile target card from a graveyard", linked to the creature. */
const rioterExile = {
  targets: [target.cardInGraveyard("t", {}, "any")],
  effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
};

export const BLACK: Record<string, CardScript> = {
  "Azula Always Lies": {
    // "Choose one or both."
    spell: modal(
      mode("−1/−1 until end of turn", [target.creature("a")], [fx.pump(ref.target("a"), -1, -1)]),
      mode("A +1/+1 counter", [target.creature("b")], [fx.addCounters(ref.target("b"), 1)]),
      mode(
        "Both",
        [target.creature("a"), target.creature("b")],
        [fx.pump(ref.target("a"), -1, -1), fx.addCounters(ref.target("b"), 1)],
      ),
    ),
  },
  "Azula, On the Hunt": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Lose 1 life, a Clue" })],
  },
  "Beetle-Headed Merchants": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { ...ARTIFACT_OR_CREATURE, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(1), fx.addCounters(ref.self, 1)),
        ],
        { label: "You may sacrifice another creature or an artifact: draw, +1/+1 counter" },
      ),
    ],
  },
  "Boiling Rock Rioter": {
    abilities: [
      activated({
        tapOthers: { filter: { subtype: "Ally" }, count: 1, includeSelf: true },
        ...rioterExile,
        label: "Tap an Ally: exile a card from a graveyard",
      }),
      triggered(when.attacksSelf, [fx.castNow(ref.filtered(ref.linked, { subtype: "Ally", owner: "you" }))], {
        label: "You may cast an Ally spell exiled with it",
      }),
    ],
  },
  "Buzzard-Wasp Colony": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.sacrifice(ref.you, ARTIFACT_OR_CREATURE, 1, { optional: true, store: "s" }), ...fx.when(cond.v("s"), fx.draw(1))],
        { label: "You may sacrifice an artifact or a creature: draw" },
      ),
      // "if it had counters on it": in the filter (last known information).
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true, withCounter: "any" }),
        [fx.lkiCountersTo(ref.self)],
        { label: "Its counters go onto the colony" },
      ),
    ],
  },
  "Canyon Crawler": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" })],
  },
  "Cat-Gator": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count({ subtype: "Swamp", controller: "you" }), ref.target())], {
        targets: [target.any()],
        label: "Damage equal to the number of Swamps you control",
      }),
    ],
  },
  "Corrupt Court Official": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "The opponent discards a card",
      }),
    ],
  },
  "Dai Li Indoctrination": {
    spell: modal(
      mode(
        "Hand revealed: discard of a nonland permanent card",
        [target.player("p", "opponent")],
        [fx.discard(1, ref.target("p"), { filter: { permanent: true, notTypes: ["Land"] }, chooser: "controller" })],
      ),
      mode("Earthbend 2", [LAND_YOU_CONTROL], fx.earthbend(ref.target(), 2)),
    ),
  },
  "Epic Downfall": {
    spell: spell([target.creature("t", { minManaValue: 3 })], [fx.exile(ref.target())]),
  },
  "Fatal Fissure": {
    spell: spell(
      [target.creature()],
      [
        fx.whenThisTurn(when.dies({}), ref.target(), fx.earthbend(ref.target(), 4), {
          targets: [LAND_YOU_CONTROL],
          label: "Earthbend 4",
        }),
      ],
    ),
  },
  "The Fire Nation Drill": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(
          cond.not(cond.sourceMatches({ tapped: true })),
          fx.may(
            "Tap The Fire Nation Drill to destroy a creature with power 4 or less?",
            fx.tap(ref.self),
            fx.reflexive([target.creature("t", { maxPower: 4 })], [fx.destroy(ref.target())]),
          ),
        ),
        { label: "You may tap it: destroy a creature with power 4 or less" },
      ),
      activated({
        mana: "{1}",
        effects: [
          fx.modifyAll(
            { permanent: true, controller: "opponent" },
            { removeKeywords: ["hexproof", "indestructible"] },
            "endOfTurn",
          ),
        ],
        label: "Permanents your opponents control lose hexproof and indestructible",
      }),
    ],
  },
  "Fire Nation Engineer": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        condition: cond.raid,
        targets: [CREATURE_OR_VEHICLE_YOU],
        label: "Raid — a +1/+1 counter on another creature or a Vehicle",
      }),
    ],
  },
  "Fire Navy Trebuchet": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.createTappedTokens(BALLISTIC_BOULDER, 1, { attacking: true, store: "b" }),
          fx.delayed([fx.sacrificeIt(ref.target("b"))], { b: ref.stored("b") }),
        ],
        { label: "A 2/1 flying Ballistic Boulder, tapped and attacking" },
      ),
    ],
  },
  "Foggy Swamp Hunters": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["lifelink", "menace"] },
        { condition: cond.drewAtLeast(2), label: "Lifelink and menace (two cards drawn this turn)" },
      ),
    ],
  },
  "Hog-Monkey": {
    abilities: [
      triggered(when.yourCombat, [fx.modify(ref.target(), { addKeywords: ["menace"] })], {
        targets: [target.creature("t", { controller: "you", withCounter: "+1/+1" })],
        label: "A creature you control with a +1/+1 counter gains menace",
      }),
      exhaust({ mana: "{5}", effects: [fx.addCounters(ref.self, 2)], label: "{5}: two +1/+1 counters" }),
    ],
  },
  "Joo Dee, One of Many": {
    abilities: [
      activated({
        mana: "{B}",
        tap: true,
        sorcerySpeed: true,
        effects: [fx.surveil(1), fx.copyToken(ref.self), fx.sacrifice(ref.you, ARTIFACT_OR_CREATURE)],
        label: "Surveil 1, a token copy, then sacrifice an artifact or a creature",
      }),
    ],
  },
  "June, Bounty Hunter": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        { condition: cond.drewAtLeast(2), label: "Can't be blocked (two cards drawn this turn)" },
      ),
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        activationCondition: cond.yourTurn,
        effects: [fx.createTokens(CLUE)],
        label: "Sacrifice another creature: a Clue",
      }),
    ],
  },
  "Mai, Scornful Striker": {
    abilities: [
      triggered(when.castSpell("any", { notTypes: ["Creature"] }), [fx.loseLife(2, ref.eventPlayer)], {
        label: "The caster of a noncreature spell loses 2 life",
      }),
    ],
  },
  "Merchant of Many Hats": {
    abilities: [
      activated({
        mana: "{2}{B}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Returns from the graveyard to hand",
      }),
    ],
  },
  "Northern Air Temple": {
    abilities: [
      triggered(when.entersSelf, fx.drain(amount.count({ subtype: "Shrine", controller: "you" })), {
        label: "Each opponent loses X life, you gain X life (X: your Shrines)",
      }),
      triggered(when.enters({ subtype: "Shrine", controller: "you", other: true }), fx.drain(1), {
        label: "Each opponent loses 1 life, you gain 1 life",
      }),
    ],
  },
  "Ozai's Cruelty": {
    spell: spell([target.player()], [fx.damage(2, ref.target()), fx.discard(2, ref.target())]),
  },
  "Phoenix Fleet Airship": {
    abilities: [
      triggered(when.yourEndStep, [fx.copyToken(ref.self)], {
        condition: cond.sacrificedThisTurn,
        label: "A token copy (permanent sacrificed this turn)",
      }),
      staticAbility(
        "self",
        { addTypes: ["Artifact", "Creature"] },
        {
          condition: cond.controls({ name: "Phoenix Fleet Airship" }, 8),
          label: "Artifact creature (eight or more Phoenix Fleet Airships)",
        },
      ),
    ],
  },
  "Pirate Peddlers": {
    abilities: [
      triggered(when.sacrifice({ other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Another permanent sacrificed: a +1/+1 counter",
      }),
    ],
  },
  "Sold Out": {
    spell: spell(
      [target.creature()],
      [fx.exileCard(ref.target(), { name: "d", filter: { damaged: true } }), ...fx.when(cond.v("d"), fx.createTokens(CLUE))],
    ),
  },
  "Swampsnare Trap": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    costReduction: { generic: 1, condition: cond.targetMatches("enchant", { keyword: "flying" }) },
    abilities: [staticAbility("attached", { power: -5, toughness: -3 }, { label: "−5/−3" })],
  },
  "Tundra Tank": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["indestructible"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature you control gains indestructible",
      }),
    ],
  },
  Wolfbat: {
    abilities: [
      triggered(
        when.draw(2),
        fx.mayPay(
          "{B}",
          "Pay {B} to return Wolfbat to the battlefield?",
          fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } }),
        ),
        { fromGraveyard: true, label: "Returns from the graveyard with a finality counter" },
      ),
    ],
  },
  "Zuko's Conviction": {
    kicker: kicker("{4}"),
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card from your graveyard")],
      [
        ...fx.when(cond.not(cond.kicked), fx.toHand(ref.target())),
        ...fx.when(cond.kicked, fx.toBattlefield(ref.target(), { tapped: true })),
      ],
    ),
  },
  // Waterbend {X} as an additional cost: read from the text.
  "Foggy Swamp Visions": {
    spell: spell(
      [
        {
          ...target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card from a graveyard"),
          count: 99,
          countX: true,
        },
      ],
      [fx.exileCard(ref.target(), { name: "v" }), fx.copyToken(ref.stored("v"), { sacrificeAtEndStep: true })],
    ),
  },
  // "you may waterbend {4}": a kicker read from the text.
  "Ruinous Waterbending": {
    spell: spell(
      [],
      [
        fx.pumpAll({ types: ["Creature"] }, -2, -2),
        ...fx.when(
          cond.kicked,
          fx.emblem(
            "Ruinous Waterbending",
            msg("Whenever a creature dies this turn, you gain 1 life."),
            [triggered(when.dies({ types: ["Creature"] }), [fx.gainLife(1)], { label: "A creature dies: gain 1 life" })],
            false,
            true,
          ),
        ),
      ],
    ),
  },
  "Lo and Li, Twin Tutors": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ anyOf: [{ subtype: "Lesson" }, { subtype: "Noble" }] }, { to: "hand" })], {
        label: "Search for a Lesson or Noble card",
      }),
      staticAbility(
        { types: ["Creature"], subtype: "Noble", controller: "you" },
        { addKeywords: ["lifelink"] },
        { label: "Noble creatures you control have lifelink" },
      ),
      playerStatic({
        spellKeywords: { filter: { subtype: "Lesson" }, keywords: ["lifelink"] },
        label: "Lesson spells you control have lifelink",
      }),
    ],
  },
  "Koh, the Face Stealer": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "k" }), fx.link(ref.stored("k"))], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Exile up to one other creature",
      }),
      triggered(
        when.dies({ types: ["Creature"], other: true, token: false }),
        [fx.may("Exile this card with Koh?", fx.exileCard(ref.eventObject, { name: "d" }), fx.link(ref.stored("d")))],
        { label: "Another creature dies: you may exile it" },
      ),
      activated({
        payLife: 1,
        effects: [fx.chooseForSelf("cardName", { optionsFrom: ref.filtered(ref.linked, { types: ["Creature"] }) })],
        label: "Pay 1 life: choose a creature card exiled with Koh",
      }),
      staticAbility(
        "self",
        { gainAbilitiesOf: { zone: "linked", filter: { chosen: "cardName" }, triggered: true } },
        { label: "Has the activated and triggered abilities of the last chosen card" },
      ),
    ],
  },
  "The Rise of Sozin": {
    abilities: [
      chapter([1], [fx.destroyAll({ types: ["Creature"] })], { label: "Destroy all creatures" }),
      chapter([2], [fx.chooseCardName, fx.exileNamed(ref.target(), 4)], {
        targets: [target.player("t", "opponent")],
        label: "Choose a name; exile up to four cards with that name of the opponent",
      }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Returns transformed",
      }),
    ],
  },
  // Menace and firebending 3: read from the text.
  "Fire Lord Sozin": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.payX("Pay {X} to return creatures with total mana value X?", "x"),
          fx.reflexive(
            [
              {
                ...target.of(
                  ref.eventPlayer,
                  target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card from their graveyard"),
                ),
                count: 99,
                optional: true,
                maxTotalManaValueAmount: amount.v("x"),
              },
            ],
            [fx.toBattlefield(ref.target(), { underYourControl: true })],
          ),
        ],
        { label: "Combat damage to a player: pay X, return creatures from their graveyard" },
      ),
    ],
  },
};
