/**
 * Avatar: The Last Airbender: multicolored cards (lot A). Firebending N (a number), flying, trample, vigilance, reach,
 * menace, prowess, lifelink, defender and ward are read from the text; firebending X is written here.
 */
import type { ManaType, ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  ALLY,
  activated,
  amount,
  type CardScript,
  CLUE,
  cmp,
  cond,
  costReducer,
  entersWith,
  exhaust,
  FOOD,
  firebending,
  fx,
  manaAbility,
  mode,
  playerStatic,
  ref,
  SOLDIER_FIRE,
  SPIRIT_KOH,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];
const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "land you control");
const CREATURE_YOU_CONTROL = target.creature("t", { controller: "you" });
const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const LESSON_IN_GRAVEYARD = amount.countIn("graveyard", { subtype: "Lesson" });
/** Lesson, Saga or Shrine (Guru Pathik). */
const LESSON_SAGA_SHRINE: ObjectFilter = { anySubtype: ["Lesson", "Saga", "Shrine"] };
const INSTANT_OR_SORCERY_CARD = target.cardInGraveyard(
  "t",
  { types: ["Instant", "Sorcery"] },
  "you",
  "instant or sorcery card from your graveyard",
);
const PERMANENT_YOU_CONTROL: TargetSpec = {
  id: "t",
  label: "permanent you control",
  filter: { objects: { permanent: true, controller: "you" } },
};

export const MULTI: Record<string, CardScript> = {
  "Air Nomad Legacy": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "A Clue" }),
      staticAbility(
        { types: ["Creature"], controller: "you", keyword: "flying" },
        { power: 1, toughness: 1 },
        { label: "Creatures you control with flying get +1/+1" },
      ),
    ],
  },
  "Azula, Cunning Usurper": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.target("p"), { types: ["Creature"], token: false }, 1, { to: "exile", store: "c" }),
          fx.link(ref.stored("c")),
          fx.chooseAmong(ref.filtered(ref.graveyardOf(ref.target("p")), { notTypes: ["Land"] }), ref.target("p"), "g", {
            anyZone: true,
          }),
          fx.exileCard(ref.stored("g"), { name: "e" }),
          fx.link(ref.stored("e")),
        ],
        {
          targets: [target.player("p", "opponent")],
          label: "The opponent exiles a nontoken creature they control, then a nonland card from their graveyard",
        },
      ),
      playerStatic({
        playFrom: { zone: "linked", what: "spells", anyMana: true, anyTime: true },
        condition: cond.yourTurn,
        label: "During your turn, cast the exiled cards (as though they had flash)",
      }),
    ],
  },
  "Beifong's Bounty Hunters": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], notTypes: ["Land"], controller: "you" }),
        fx.earthbend(ref.target(), amount.powerOf(ref.eventObject)),
        { targets: [LAND_YOU_CONTROL], label: "Earthbend X (power of the creature that died)" },
      ),
    ],
  },
  "Bitter Work": {
    abilities: [
      // Once for each player attacked with such a creature (ruling).
      triggered(when.attackAPlayerWith(1, { minPower: 4 }), [fx.draw(1)], {
        label: "Attack a player with a creature with power 4 or greater: draw",
      }),
      exhaust({
        mana: "{4}",
        activationCondition: cond.yourTurn,
        targets: [LAND_YOU_CONTROL],
        effects: fx.earthbend(ref.target(), 4),
        label: "Earthbend 4",
      }),
    ],
  },
  "Bumi, Unleashed": {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 4), { targets: [LAND_YOU_CONTROL], label: "Earthbend 4" }),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.untapAll({ types: ["Land"], controller: "you" }),
          fx.extraCombat,
          // "Only land creatures can attack during that combat phase": the next combat of this turn (the one added).
          fx.nextCombat({ attackersOnly: { types: ["Land"] } }),
        ],
        { label: "Untap your lands; an additional combat, for land creatures only" },
      ),
    ],
  },
  "Cat-Owl": {
    abilities: [
      triggered(when.attacksSelf, [fx.untap(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
        label: "Untap an artifact or a creature",
      }),
    ],
  },
  "Cruel Administrator": {
    abilities: [
      entersWith({ counters: 1, condition: cond.raid, label: "Raid: a +1/+1 counter" }),
      triggered(when.attacksSelf, [fx.createTokens(SOLDIER_FIRE)], { label: "A 2/2 Soldier, firebending 1" }),
    ],
  },
  "Dai Li Agents": {
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 1), ...fx.earthbend(ref.target("u"), 1)], {
        targets: [LAND_YOU_CONTROL, { ...LAND_YOU_CONTROL, id: "u" }],
        label: "Earthbend 1, twice",
      }),
      triggered(when.attacksSelf, fx.drain(amount.count({ types: ["Creature"], controller: "you", withCounter: "+1/+1" })), {
        label: "Drain: your creatures with a +1/+1 counter",
      }),
    ],
  },
  "Dragonfly Swarm": {
    cdaPower: amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }),
    abilities: [
      triggered(when.diesSelf, [fx.draw(1)], {
        condition: cond.amountAtLeast(LESSON_IN_GRAVEYARD, 1),
        label: "A Lesson in the graveyard: draw",
      }),
    ],
  },
  "Earth Kingdom Soldier": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, CREATURE_YOU_CONTROL)],
        label: "A +1/+1 counter on up to two creatures you control",
      }),
    ],
  },
  "Earth King's Lieutenant": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.addCountersAll({ types: ["Creature"], subtype: "Ally", controller: "you", other: true }, 1)],
        { label: "A +1/+1 counter on each other Ally you control" },
      ),
      triggered(when.enters({ subtype: "Ally", controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        label: "A +1/+1 counter",
      }),
    ],
  },
  "Earth Rumble Wrestlers": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["trample"] },
        {
          condition: cond.any(
            cond.controls({ types: ["Land"], anyOf: [{ types: ["Creature"] }] }),
            cond.amountAtLeast(amount.landsEnteredThisTurn, 1),
          ),
          label: "+1/+0 and trample (land creature, or a land entered this turn)",
        },
      ),
    ],
  },
  "Earth Village Ruffians": {
    abilities: [triggered(when.diesSelf, fx.earthbend(ref.target(), 2), { targets: [LAND_YOU_CONTROL], label: "Earthbend 2" })],
  },
  "Fire Lord Azula": {
    // "while Fire Lord Azula is attacking" is part of the trigger event, not an "if…" condition (603.4): she has the
    // ability only while attacking; once triggered, the ability resolves even if Azula is no longer attacking.
    abilities: [
      staticAbility(
        "self",
        { addAbilities: [triggered(when.castSpell("you"), [fx.copySpell(ref.eventObject, 1)], { label: "Copy the spell" })] },
        { condition: cond.sourceMatches({ attacking: true }), label: "While attacking: copy each spell you cast" },
      ),
    ],
  },
  "Fire Lord Zuko": {
    abilities: [
      firebending(amount.powerOf(ref.self)),
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.addCountersAll(YOUR_CREATURES, 1)], {
        label: "Spell cast from exile: a +1/+1 counter on each creature you control",
      }),
      triggered(when.zoneChange(["exile"], { to: ["battlefield"] }), [fx.addCountersAll(YOUR_CREATURES, 1)], {
        condition: cond.eventObjectMatches({ controller: "you" }),
        label: "Permanent entered from exile: a +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Foggy Swamp Spirit Keeper": {
    abilities: [triggered(when.draw(2), [fx.createTokens(SPIRIT_KOH)], { label: "Second card drawn: a 1/1 Spirit" })],
  },
  "Guru Pathik": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(5, { filter: LESSON_SAGA_SHRINE, rest: "bottom" })], {
        label: "A Lesson, a Saga or a Shrine among the top five",
      }),
      triggered(when.castSpell("you", LESSON_SAGA_SHRINE), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "A +1/+1 counter on another creature you control",
      }),
    ],
  },
  "Hei Bai, Spirit of Balance": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Artifact"] }], other: true }, 1, {
              optional: true,
              store: "s",
            }),
            ...fx.when(cond.v("s"), fx.addCounters(ref.self, 2)),
          ],
          { label: "You may sacrifice another creature or an artifact: two +1/+1 counters" },
        ),
      ),
      triggered(when.leavesSelf, [fx.lkiCountersTo(ref.target())], {
        targets: [CREATURE_YOU_CONTROL],
        label: "Its counters onto a creature you control",
      }),
    ],
  },
  "Hermitic Herbalist": {
    abilities: [
      manaAbility(ANY_COLOR),
      manaAbility(ANY_COLOR, 2, { restriction: { spell: { subtype: "Lesson" } }, combination: true }),
    ],
  },
  "Iroh, Tea Master": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" }),
      triggered(
        when.yourCombat,
        fx.may(
          "Give control of this permanent to target opponent?",
          fx.giveControl(ref.target(), ref.target("p")),
          fx.reflexive(
            [],
            [
              fx.createTokens(ALLY, 1, undefined, "a"),
              fx.addCounters(ref.stored("a"), amount.count({ permanent: true, owner: "you", controller: "opponent" })),
            ],
          ),
        ),
        {
          targets: [target.player("p", "opponent"), PERMANENT_YOU_CONTROL],
          label: "Give a permanent: an Ally with a +1/+1 counter for each permanent you own that your opponents control",
        },
      ),
    ],
  },
  "Jet, Freedom Fighter": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count(YOUR_CREATURES), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Damage equal to the number of creatures you control",
      }),
      triggered(when.diesSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "A +1/+1 counter on up to two creatures",
      }),
    ],
  },
  "Katara, the Fearless": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { subtype: "Ally", controller: "you" } },
        label: "Triggered abilities of your Allies trigger an additional time",
      }),
    ],
  },
  "Katara, Water Tribe's Hope": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ALLY)], { label: "A 1/1 Ally" }),
      activated({
        mana: "{X}",
        waterbend: true,
        minX: 1,
        activationCondition: cond.yourTurn,
        effects: [fx.setBasePTAll(YOUR_CREATURES, amount.x)],
        label: "Waterbend {X}: creatures you control have base power and toughness X/X",
      }),
    ],
  },
  "The Lion-Turtle": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3)], { label: "Gain 3 life" }),
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.amountAtLeast(LESSON_IN_GRAVEYARD, 3)),
          label: "Can't attack or block without three Lessons in the graveyard",
        },
      ),
      manaAbility(ANY_COLOR),
    ],
  },
  "Long Feng, Grand Secretariat": {
    abilities: [
      triggered(
        when.dies({ anyOf: [{ types: ["Creature"], other: true }, { types: ["Land"] }], controller: "you" }),
        [fx.addCounters(ref.target(), 1)],
        { targets: [CREATURE_YOU_CONTROL], label: "A +1/+1 counter on a creature you control" },
      ),
    ],
  },
  "Messenger Hawk": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "A Clue" }),
      staticAbility("self", { power: 2 }, { condition: cond.drewAtLeast(2), label: "+2/+0 (two cards drawn this turn)" }),
    ],
  },
  "Platypus-Bear": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2)], { label: "Mill two cards" }),
      staticAbility(
        "self",
        { addKeywords: ["attacksDespiteDefender"] },
        {
          condition: cond.amountAtLeast(LESSON_IN_GRAVEYARD, 1),
          label: "Can attack as though it didn't have defender (a Lesson in the graveyard)",
        },
      ),
    ],
  },
  "Pretending Poxbearers": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(ALLY)], { label: "A 1/1 Ally" })],
  },
  "Professor Zei, Anthropologist": {
    abilities: [
      activated({ tap: true, discard: 1, effects: [fx.draw(1)], label: "Discard a card: draw" }),
      activated({
        mana: "{1}",
        tap: true,
        sacrifice: true,
        activationCondition: cond.yourTurn,
        targets: [INSTANT_OR_SORCERY_CARD],
        effects: [fx.toHand(ref.target())],
        label: "Returns an instant or sorcery from your graveyard",
      }),
    ],
  },
  "Sandbender Scavengers": {
    abilities: [
      triggered(when.sacrifice({ other: true }), [fx.addCounters(ref.self, 1)], { label: "A +1/+1 counter" }),
      triggered(
        when.diesSelf,
        fx.may(
          "Exile Sandbender Scavengers?",
          fx.exileCard(ref.eventObject, { name: "x" }),
          fx.when(
            cond.v("x"),
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { types: ["Creature"], compare: [cmp.manaValue("<=", amount.sourcePower)] },
                  "you",
                  "creature card with mana value at most its power",
                ),
              ],
              [fx.toBattlefield(ref.target())],
            ),
          ),
        ),
        { label: "Exile it: a creature returns from your graveyard" },
      ),
    ],
  },
  "Sokka, Bold Boomeranger": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d"))], {
        label: "Discard up to two cards, draw that many",
      }),
      triggered(
        when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { subtype: "Lesson" }] }),
        [fx.addCounters(ref.self, 1)],
        { label: "Artifact or Lesson spell: a +1/+1 counter" },
      ),
    ],
  },
  "Sokka, Lateral Strategist": {
    abilities: [
      triggered(when.attacksSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], attacking: true, other: true }),
        label: "Sokka attacks with another creature: draw",
      }),
    ],
  },
  "Sokka, Tenacious Tactician": {
    abilities: [
      staticAbility(
        { subtype: "Ally", controller: "you", other: true },
        { addKeywords: ["menace", "prowess"] },
        { label: "Other Allies you control have menace and prowess" },
      ),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(ALLY)], { label: "A 1/1 Ally" }),
    ],
  },
  "Suki, Kyoshi Warrior": {
    cdaPower: amount.count(YOUR_CREATURES),
    abilities: [
      triggered(when.attacksSelf, [fx.createTappedTokens(ALLY, 1, { attacking: true })], {
        label: "A 1/1 Ally tapped and attacking",
      }),
    ],
  },
  "Sun Warriors": {
    abilities: [
      firebending(amount.count(YOUR_CREATURES)),
      activated({ mana: "{5}", effects: [fx.createTokens(ALLY)], label: "A 1/1 Ally" }),
    ],
  },
  "Tolls of War": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "A Clue" }),
      triggered(when.sacrifice({}), [fx.createTokens(ALLY)], {
        condition: cond.yourTurn,
        oncePerTurn: true,
        label: "Sacrifice during your turn: a 1/1 Ally",
      }),
    ],
  },
  "Toph, Hardheaded Teacher": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.toHand(ref.target()))],
        { targets: [INSTANT_OR_SORCERY_CARD], label: "Discard a card: an instant or sorcery returns to hand" },
      ),
      triggered(
        when.castSpell("you"),
        [
          ...fx.earthbend(ref.target(), 1),
          ...fx.when(cond.eventObjectMatches({ subtype: "Lesson" }), fx.addCounters(ref.target(), 1)),
        ],
        { targets: [LAND_YOU_CONTROL], label: "Earthbend 1 (one more counter for a Lesson)" },
      ),
    ],
  },
  "Toph, the First Metalbender": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you", token: false },
        { addTypes: ["Land"] },
        { label: "Nontoken artifacts you control are also lands" },
      ),
      triggered(when.yourEndStep, fx.earthbend(ref.target(), 2), {
        targets: [LAND_YOU_CONTROL],
        label: "Earthbend 2",
      }),
    ],
  },
  "Uncle Iroh": {
    abilities: [costReducer({ subtype: "Lesson" }, 1, "Lesson spells: {1} less")],
  },
  "Vindictive Warden": {
    abilities: [activated({ mana: "{3}", effects: [fx.damage(1, ref.eachOpponent)], label: "1 damage to each opponent" })],
  },
  "Wandering Musicians": {
    abilities: [triggered(when.attacksSelf, [fx.pumpAll(YOUR_CREATURES, 1, 0)], { label: "Creatures you control get +1/+0" })],
  },
  "White Lotus Reinforcements": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Ally", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Other Allies you control get +1/+1" },
      ),
    ],
  },
  "Zhao, Ruthless Admiral": {
    abilities: [
      triggered(when.sacrifice({ other: true }), [fx.pumpAll(YOUR_CREATURES, 1, 0)], {
        label: "Creatures you control get +1/+0",
      }),
    ],
  },
  "Zuko, Conflicted": {
    // Approximation: Zuko first returns under your control, then comes under the control of the chosen opponent.
    abilities: [
      triggeredModal(
        when.step("main1"),
        [
          mode("Draw a card", [], [fx.draw(1), fx.loseLife(2)]),
          mode("A +1/+1 counter on Zuko", [], [fx.addCounters(ref.self, 1), fx.loseLife(2)]),
          mode("Add {R}", [], [fx.addMana("R"), fx.loseLife(2)]),
          mode(
            "Zuko goes to an opponent",
            [],
            [
              fx.chooseOpponent("zo"),
              fx.exileCard(ref.self, { name: "z" }),
              fx.moveTo(ref.stored("z"), { to: "battlefield", controller: ref.stored("zo") }),
              fx.loseLife(2),
            ],
          ),
        ],
        { uniqueModes: true, label: "Choose a mode not chosen yet; lose 2 life" },
      ),
    ],
  },
  "Hama, the Bloodbender": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.target()),
          // "Exile up to one card": the question is asked only if there is one.
          ...fx.when(
            cond.amountAtLeast(
              amount.refCount(ref.filtered(ref.graveyardOf(ref.target()), { notTypes: ["Creature", "Land"] })),
              1,
            ),
            ...fx.may(
              "Exile a noncreature, nonland card from their graveyard?",
              fx.chooseAmong(ref.filtered(ref.graveyardOf(ref.target()), { notTypes: ["Creature", "Land"] }), ref.you, "h", {
                anyZone: true,
                prompt: "Choose the card to exile",
              }),
              fx.exileCard(ref.stored("h"), { name: "hx" }),
              fx.link(ref.stored("hx")),
            ),
          ),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "An opponent mills three cards; exile up to one noncreature, nonland card from their graveyard",
        },
      ),
      playerStatic({
        playFrom: { zone: "linked", what: "spells", waterbend: true },
        condition: cond.yourTurn,
        label: "During your turn, cast the exiled card by waterbending {X} (X: its mana value)",
      }),
    ],
  },
  // Flying and firebending 2: read from the text.
  "Avatar Aang": {
    abilities: [
      triggered(
        when.bend,
        [
          fx.draw(1),
          ...fx.when(
            cond.amountAtLeast(amount.turnEvents({ event: "bend", who: "you", distinct: "kind" }), 4),
            fx.transform(ref.self),
          ),
        ],
        { label: "You bend an element: draw; all four this turn, transform Aang" },
      ),
    ],
  },
  "Aang, Master of Elements": {
    abilities: [
      playerStatic({
        spellCost: { filter: {}, colored: { W: 1, U: 1, B: 1, R: 1, G: 1 } },
        label: "Your spells cost {W}{U}{B}{R}{G} less",
      }),
      triggered(
        { on: "step", step: "upkeep", whose: "any" },
        [
          fx.may(
            "Transform Aang (4 life, four cards, four +1/+1 counters, 4 damage to each opponent)?",
            fx.transform(ref.self),
            fx.gainLife(4),
            fx.draw(4),
            fx.addCounters(ref.self, 4),
            fx.damage(4, ref.eachOpponent),
          ),
        ],
        { label: "At the beginning of each upkeep, you may transform Aang" },
      ),
    ],
  },
  // Firebending 2: read from the text.
  "Iroh, Grand Lotus": {
    abilities: [
      playerStatic({
        playFrom: {
          zone: "graveyard",
          what: "spells",
          filter: { types: ["Instant", "Sorcery"], notSubtype: "Lesson" },
          flashback: true,
        },
        condition: cond.yourTurn,
        label: "During your turn, non-Lesson instants and sorceries in your graveyard have flashback",
      }),
      playerStatic({
        playFrom: {
          zone: "graveyard",
          what: "spells",
          filter: { types: ["Instant", "Sorcery"], subtype: "Lesson" },
          flashback: true,
          cost: { generic: 1, colored: {}, x: 0 },
        },
        condition: cond.yourTurn,
        label: "During your turn, Lessons in your graveyard have flashback {1}",
      }),
    ],
  },
  // Trample, firebending 4 and haste: read from the text.
  "Ozai, the Phoenix King": {
    abilities: [
      playerStatic({ keepUnspentMana: { becomes: "R" }, label: "Your unspent mana becomes red instead of emptying" }),
      staticAbility(
        "self",
        { addKeywords: ["flying", "indestructible"] },
        { condition: cond.manaPoolAtLeast(6), label: "Flying and indestructible as long as you have six or more unspent mana" },
      ),
    ],
  },
};
