/**
 * Commander: "Counter Blitz" precon from Final Fantasy X (Tidus, Yuna's Guardian, green, white, blue). Counters of
 * every kind, moved, proliferated; Guardians and summons (creature Sagas).
 */
import type { CardScript, ModeDef, ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  CLUE,
  chapter,
  cmp,
  cond,
  entersWith,
  escalate,
  eventReplacement,
  evolve,
  fx,
  manaAbility,
  ref,
  SPIRIT,
  spell,
  staticAbility,
  TO_PLAYER_OR_PLANESWALKER,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Your creatures with a counter (of any kind). */
const COUNTERED_YOU: ObjectFilter = { ...CREATURE_YOU, withCounter: "any" };
const P1P1_YOU: ObjectFilter = { ...CREATURE_YOU, withCounter: "+1/+1" };
const SQUID: TokenSpec = {
  name: "Squid",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Squid"],
  power: 1,
  toughness: 1,
  abilities: [blockAbility(block.landwalk("Island", "Islandwalk"))],
  text: "Islandwalk",
};
/** "When [a permanent of yours] is put into a graveyard from the battlefield" */
const toGraveyard = (who: ObjectFilter): TriggerSpec => ({ on: "leaves", who, to: "graveyard" });
const mode = (label: string, targets: ModeDef["targets"], effects: ModeDef["effects"]): ModeDef => ({
  label,
  targets,
  effects,
});

/** "Forge of Heroes": colorless mana, or a counter on a commander that entered this turn. */
const FORGE_OF_HEROES: CardScript = {
  abilities: [
    manaAbility("C"),
    activated({
      tap: true,
      targets: [
        { ...target.permanent("t", [], { commander: true, enteredThisTurn: true }), label: "commander that entered this turn" },
      ],
      effects: [
        ...fx.when(cond.targetMatches("t", { types: ["Creature"] }), fx.addCounters(ref.target(), 1)),
        ...fx.when(cond.targetMatches("t", { types: ["Planeswalker"] }), fx.counters(ref.target(), "loyalty")),
      ],
      label: "A counter on a commander that entered this turn",
    }),
  ],
};

export const EDH_COUNTER_BLITZ: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  "Tidus, Yuna's Guardian": {
    abilities: [
      triggered(
        when.yourCombat,
        fx.may("Move a counter from one of your creatures onto another?", fx.moveCounter(ref.target("a"), ref.target("b"))),
        {
          targets: [
            { ...target.creature("a", { controller: "you", withCounter: "any" }), label: "creature of yours with a counter" },
            { ...target.creature("b", { controller: "you" }), otherThan: ["a"], label: "another creature of yours" },
          ],
          label: "Move a counter from one of your creatures onto another",
        },
      ),
      // Cheer: "do this only once each turn" (the limit is used up only if you draw).
      triggered(
        when.combatDamageBatch(COUNTERED_YOU),
        [
          ...fx.mayForStore(ref.you, "Draw a card and proliferate?", "c", fx.draw(1), fx.proliferate()),
          ...fx.when(cond.v("c"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "Cheer: draw a card and proliferate (once per turn)" },
      ),
    ],
  },

  // --- Guardians and legends -----------------------------------------------------------------------------------------
  // Vigilance: read from the text.
  "Auron, Venerated Guardian": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCounters(ref.self, 1),
          fx.reflexive(
            [
              {
                ...target.creature("t", { controller: "opponent", compare: [cmp.power("<", amount.sourcePower)] }),
                label: "creature defending player controls with power less than Auron's",
              },
            ],
            [fx.exileUntilLeaves(ref.target())],
          ),
        ],
        { label: "Shooting Star: a counter, then exile a weaker creature for as long as Auron remains" },
      ),
    ],
  },
  "Gatta and Luzzu": {
    // Flash: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), {
            addAbilities: [
              eventReplacement({
                event: "damage",
                toFilter: { self: true },
                modify: { prevent: true },
                onPrevent: { countersOnDamaged: "+1/+1" },
                label: "Damage prevented: that many +1/+1 counters",
              }),
            ],
          }),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "This turn, damage to it becomes counters" },
      ),
    ],
  },
  "Kimahri, Valiant Guardian": {
    // Vigilance: read from the text.
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.self, 1),
          fx.tap(ref.target()),
          ...fx.may(
            "Does Kimahri become a copy of that creature?",
            fx.becomeCopy(ref.self, ref.target(), "permanent", {
              except: { setName: "Kimahri, Valiant Guardian", addKeywords: ["vigilance"] },
              keepAbilities: [0],
            }),
          ),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Ronso Rage: a counter, tap an opposing creature, Kimahri may become a copy of it",
        },
      ),
    ],
  },
  // Flying: read from the text.
  "Lord Jyscal Guado": {
    abilities: [
      triggered(when.eachEndStep, [fx.createTokens(CLUE)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "counters", who: "you", types: ["Creature"] }), 1),
        label: "You put a counter on a creature this turn: investigate",
      }),
    ],
  },
  "Lulu, Stern Guardian": {
    abilities: [
      triggered(when.opponentAttacksYouWith(1), [fx.counters(ref.target(), "stun")], {
        targets: [{ ...target.creature("t", { attacking: "you" }), label: "creature attacking you" }],
        label: "A stun counter on a creature attacking you",
      }),
      activated({ mana: "{3}{U}", effects: [fx.proliferate()], label: "Proliferate" }),
    ],
  },
  "Maester Seymour": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), amount.powerOf(ref.self))], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+1 counters equal to its power on another of your creatures",
      }),
      // Monstrosity X: X counted as the ability resolves.
      activated({
        mana: "{3}{G}{G}",
        effects: [fx.monstrosity(amount.countersAmong(CREATURE_YOU, "any"))],
        label: "Monstrosity X (X: counters among your creatures)",
      }),
    ],
  },
  "O'aka, Traveling Merchant": {
    abilities: [
      activated({
        tap: true,
        removeCounterFrom: { filter: { notTypes: ["Land"] }, kind: "any" },
        effects: [fx.draw(1)],
        label: "Remove a counter from one of your nonland permanents: draw a card",
      }),
    ],
  },
  "Rikku, Resourceful Guardian": {
    abilities: [
      triggered(
        when.youPutCounters({ types: ["Creature"] }),
        [
          fx.modify(ref.eventObject, {
            addBlockRules: [{ cantBeBlockedBy: { controller: "opponent" }, label: "Can't be blocked by opposing creatures" }],
          }),
        ],
        { label: "It can't be blocked by creatures your opponents control this turn" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          { ...target.creature("a", { controller: "opponent", withCounter: "any" }), label: "opposing creature with a counter" },
          target.creature("b", { controller: "you" }),
        ],
        effects: [fx.moveCounter(ref.target("a"), ref.target("b"))],
        label: "Steal: move a counter from an opposing creature onto one of yours",
      }),
    ],
  },
  // Lifelink: read from the text.
  "Shelinda, Yevon Acolyte": {
    abilities: [
      triggered(
        when.enters({ ...CREATURE_YOU, other: true }),
        fx.ifElse(
          cond.amountGreater(amount.powerOf(ref.self), amount.powerOf(ref.eventObject)),
          [fx.addCounters(ref.eventObject, 1)],
          [fx.addCounters(ref.self, 1)],
        ),
        { label: "A counter on the new creature if it is weaker, otherwise on Shelinda" },
      ),
    ],
  },
  // Flying, trample: read from the text.
  "Sin, Unending Cataclysm": {
    // "As Sin enters, remove all counters from any number of artifacts, creatures, and enchantments. Sin enters with X
    // +1/+1 counters on it, where X is twice the number of counters removed this way."
    asEnters: [
      fx.chooseAmong(
        ref.permanentsOf(ref.eachPlayer, {
          anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Enchantment"] }],
          withCounter: "any",
        }),
        ref.you,
        "sin",
        { anyNumber: true, prompt: "Sin: remove all counters from any number of these permanents" },
      ),
      fx.removeCounters(ref.stored("sin"), 999, undefined, "n"),
      fx.addCounters(ref.self, amount.plus(amount.v("n"), amount.v("n"))),
    ],
    abilities: [
      triggered(
        when.diesSelf,
        [fx.lkiCountersTo(ref.target()), fx.moveTo(ref.eventObject, { to: "libraryTop" }), fx.shuffle(ref.you)],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "Its counters onto one of your creatures, then shuffle it into your library",
        },
      ),
    ],
  },
  "Tromell, Seymour's Butler": {
    abilities: [
      entersWith({
        affects: { ...CREATURE_YOU, token: false, other: true },
        counters: 1,
        label: "Your other nontoken creatures enter with an additional +1/+1 counter",
      }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.proliferate(amount.count({ ...CREATURE_YOU, token: false, enteredThisTurn: true }))],
        label: "Proliferate X times (X: your nontoken creatures that entered this turn)",
      }),
    ],
  },
  // Reach, trample: read from the text.
  "Wakka, Devoted Guardian": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.destroy(ref.target()), fx.addCounters(ref.self, 1)], {
        targets: [
          target.upTo(1, target.permanent("t", ["Artifact"], { controller: "opponent" }, "artifact that player controls")),
        ],
        label: "Destroy an artifact that player controls and a +1/+1 counter on Wakka",
      }),
      triggered(when.yourEndStep, [fx.addCountersAll({ ...CREATURE_YOU, other: true }, 1)], {
        condition: cond.sourceMatches({ countersPutByYouThisTurn: true }),
        label: "Blitzball Captain: a +1/+1 counter on each of your other creatures",
      }),
    ],
  },
  "Yuna, Grand Summoner": {
    abilities: [
      // "When you next cast a creature spell this turn": the next creature spell, paid with this mana or not (the one
      // being cast if Yuna pays for it).
      manaAbility(ANY_COLOR, 1, { playerEffect: { nextSpell: { filter: { types: ["Creature"] }, counters: 2 } } }),
      triggered(
        toGraveyard({ permanent: true, controller: "you", other: true, withCounter: "any" }),
        fx.may(
          "Put that many +1/+1 counters on a creature?",
          fx.addCounters(ref.target(), amount.countersOn(ref.eventObject, "any")),
        ),
        {
          targets: [target.creature()],
          label: "One of your permanents with counters goes to the graveyard: that many +1/+1 counters",
        },
      ),
    ],
  },

  // --- Other creatures ---------------------------------------------------------------------------------------------
  "Altered Ego": {
    cantBeCountered: true,
    // "… except it enters with X additional +1/+1 counters" (X of the spell; 0 if it wasn't cast).
    asEnters: [fx.chooseCopy({ types: ["Creature"] }, { anyController: true, counters: { kind: "+1/+1", n: amount.x } })],
  },
  "Bane of Progress": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, "d"),
          fx.addCounters(ref.self, amount.refCount(ref.stored("d"))),
        ],
        { label: "Destroy all artifacts and enchantments; a counter for each permanent destroyed" },
      ),
    ],
  },
  "Chasm Skulker": {
    abilities: [
      triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "You draw a card: a +1/+1 counter" }),
      triggered(when.diesSelf, [fx.createTokens(SQUID, amount.lkiCounters("+1/+1"))], {
        label: "As many 1/1 Squids with islandwalk as counters",
      }),
    ],
  },
  "Chocobo Knights": {
    abilities: [
      triggered(when.attackWith(), [fx.pumpAll(COUNTERED_YOU, 0, 0, ["doubleStrike"])], {
        label: "You attack: your creatures with counters gain double strike",
      }),
    ],
  },
  "Duskshell Crawler": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "A +1/+1 counter",
      }),
      staticAbility(P1P1_YOU, { addKeywords: ["trample"] }, { label: "Your creatures with a +1/+1 counter have trample" }),
    ],
  },
  "Fathom Mage": {
    abilities: [
      evolve,
      // One trigger for each counter put (each asks its own "you may").
      triggered(when.eachCounterPut("self", "+1/+1"), fx.may("Draw a card?", fx.draw(1)), {
        label: "A +1/+1 counter: you may draw a card",
      }),
    ],
  },
  "Forgotten Ancient": {
    abilities: [
      triggered(when.castSpell("any"), fx.may("Put a +1/+1 counter on Forgotten Ancient?", fx.addCounters(ref.self, 1)), {
        label: "A spell is cast: a +1/+1 counter",
      }),
      // "Any number of +1/+1 counters onto other creatures": no target, divided as the ability resolves (ruling).
      triggered(
        when.yourUpkeep,
        [fx.moveCountersDivided(ref.self, ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"], other: true }))],
        { label: "Move any number of its +1/+1 counters onto other creatures" },
      ),
    ],
  },
  "Generous Patron": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { other: true }))],
        label: "Support 2",
      }),
      triggered(when.youPutCounters({ types: ["Creature"], controller: "opponent" }), [fx.draw(1)], {
        label: "You put counters on an opposing creature: draw a card",
      }),
    ],
  },
  // Flying: read from the text.
  "Grateful Apparition": {
    abilities: [triggered(when.combatDamage("self", TO_PLAYER_OR_PLANESWALKER), [fx.proliferate()], { label: "Proliferate" })],
  },
  "Gyre Sage": {
    abilities: [evolve, { ...manaAbility("G"), amountOf: { kind: "countersOn", ref: { kind: "self" }, counter: "+1/+1" } }],
  },
  "Incubation Druid": {
    abilities: [
      manaAbility(ANY_COLOR, 1, { likeLands: {}, condition: cond.not(cond.counterAtLeast("+1/+1", 1)) }),
      manaAbility(ANY_COLOR, 3, { likeLands: {}, condition: cond.counterAtLeast("+1/+1", 1) }),
      activated({
        mana: "{3}{G}{G}",
        effects: fx.when(cond.not(cond.counterAtLeast("+1/+1", 1)), fx.addCounters(ref.self, 3)),
        label: "Adapt 3",
      }),
    ],
  },
  // Flying: read from the text.
  "Luminous Broodmoth": {
    abilities: [
      triggered(
        when.dies({ ...CREATURE_YOU, not: { keyword: "flying" } }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "flying", n: 1 } })],
        { label: "One of your creatures without flying dies: it returns with a flying counter" },
      ),
    ],
  },
  "Rampant Rejuvenator": {
    abilities: [
      entersWith({ counters: 2, label: "Two +1/+1 counters" }),
      triggered(when.diesSelf, [fx.search(BASIC_LAND, { to: "battlefield" }, amount.powerOf(ref.eventObject))], {
        label: "Search for as many basic lands as its power",
      }),
    ],
  },
  "Scholar of New Horizons": {
    abilities: [
      entersWith({ counters: 1, label: "A +1/+1 counter" }),
      // The Plains card found is held in the library, then put onto the battlefield (if allowed and the player wants to)
      // or into the hand; then the library is shuffled.
      activated({
        tap: true,
        removeCounterFrom: { filter: {}, kind: "any" },
        effects: [
          { op: "search", filter: { subtype: "Plains" }, count: 1, store: "plains", reveal: true },
          ...fx.when(
            cond.opponentHasMore("lands"),
            fx.may(
              "Put the Plains card onto the battlefield tapped (otherwise into your hand)?",
              fx.moveTo(ref.stored("plains"), { to: "battlefield", tapped: true }),
            ),
          ),
          fx.moveTo(ref.stored("plains"), { to: "hand" }),
          fx.shuffle(),
        ],
        label: "Remove a counter: search for a Plains card",
      }),
    ],
  },
  // Flying: read from the text.
  "Sunscorch Regent": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.addCounters(ref.self, 1), fx.gainLife(1)], {
        label: "An opponent casts a spell: a +1/+1 counter and 1 life",
      }),
    ],
  },

  // --- Summons (creature Sagas) --------------------------------------------------------------------------------------
  // First strike: read from the text.
  "Summon: Ixion": {
    abilities: [
      chapter([1], [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Aerospark: exile an opposing creature for as long as this Saga remains",
      }),
      chapter([2, 3], [fx.addCounters(ref.target(), 1), fx.gainLife(2)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "A +1/+1 counter on up to two of your creatures; 2 life",
      }),
    ],
  },
  // Haste: read from the text. A mode at random (three-sided die); the targets of the three modes are chosen first.
  "Summon: Magus Sisters": {
    abilities: [
      chapter(
        [1, 2, 3],
        [
          fx.rollDie(3, "m"),
          ...fx.when(cond.all(cond.v("m", 1), cond.not(cond.v("m", 2))), fx.addCounters(ref.target("t"), 3)),
          ...fx.when(cond.all(cond.v("m", 2), cond.not(cond.v("m", 3))), fx.counters(ref.target("t"), "shield"), fx.gainLife(3)),
          ...fx.when(cond.v("m", 3), fx.fight(ref.self, ref.target("f"))),
        ],
        {
          targets: [target.creature("t"), target.upTo(1, target.creature("f", { controller: "opponent" }))],
          label: "At random: three +1/+1 counters, a shield counter and 3 life, or a fight",
        },
      ),
    ],
  },
  // Flying: read from the text.
  "Summon: Valefor": {
    abilities: [
      chapter([1], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 1, { greatestManaValue: true, to: "hand" })], {
        label: "Sonic Wings: each opponent returns to hand one of their creatures with the greatest mana value",
      }),
      chapter([2, 3, 4], [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.upTo(1, target.creature())],
        label: "Tap a creature and put a stun counter on it",
      }),
    ],
  },
  // Vigilance: read from the text.
  "Summon: Yojimbo": {
    abilities: [
      chapter([1], [fx.exileCard(ref.target())], {
        targets: [
          {
            id: "t",
            label: "artifact, enchantment or tapped creature an opponent controls",
            filter: {
              objects: {
                controller: "opponent",
                anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], tapped: true }],
              },
            },
          },
        ],
        label: "Exile an artifact, enchantment or tapped creature an opponent controls",
      }),
      chapter([2, 3], [fx.untilYourNextTurn({ attackTax: 2 })], {
        label: "Until your next turn, each creature attacking you costs {2}",
      }),
      chapter(
        [4],
        [
          fx.createTokens(
            TREASURE,
            amount.refCount(ref.playersWhere(ref.eachOpponent, cond.controls({ types: ["Creature"], minPower: 4 }))),
          ),
        ],
        { label: "A Treasure for each opponent who controls a creature with power 4 or greater" },
      ),
    ],
  },

  // --- Artifacts and enchantments -----------------------------------------------------------------------------------
  "Blitzball Stadium": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature(), countAmount: amount.sourceX, minCount: 0, label: "up to X creatures" }],
        label: "Support X",
      }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [
          fx.modify(ref.target(), {
            addKeywords: ["unblockable"],
            addAbilities: [
              triggered(when.combatDamageToPlayer, [fx.draw(amount.counterKindsAmong({ self: true }))], {
                label: "Draw a card for each kind of counter on it",
              }),
            ],
          }),
        ],
        label: "Go for the Goal!: unblockable, and draws for each kind of counter when it deals damage to a player",
      }),
    ],
  },
  "Bred for the Hunt": {
    abilities: [
      triggered(when.combatDamage(P1P1_YOU, true), fx.may("Draw a card?", fx.draw(1)), {
        label: "One of your creatures with a +1/+1 counter deals damage to a player: you may draw",
      }),
    ],
  },
  "Everflowing Chalice": {
    // Multikicker {2}: read from the text (X = number of times).
    abilities: [
      entersWith({ counters: amount.x, counterKind: "charge", label: "A charge counter for each time it was kicked" }),
      { ...manaAbility("C"), amountOf: { kind: "countersOn", ref: { kind: "self" }, counter: "charge" } },
    ],
  },
  "Fight Rigging": {
    abilities: [
      // Hideaway 5: the card is exiled face down (only you see it).
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, { count: 1, to: { to: "exile", faceDown: "you" }, rest: "bottom", store: "h" }),
          fx.link(ref.stored("h")),
        ],
        { label: "ctx:keyword|Hideaway 5" },
      ),
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.target(), 1),
          fx.when(
            cond.controls({ types: ["Creature"], controller: "you", minPower: 7 }),
            fx.grantPlay(ref.linked, { free: true, anyTime: true }),
          ),
        ],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "A +1/+1 counter; power 7 or greater: play the hidden card",
        },
      ),
    ],
  },
  "Inexorable Tide": {
    abilities: [triggered(when.castSpell("you"), [fx.proliferate()], { label: "You cast a spell: proliferate" })],
  },
  "Path of Discovery": {
    abilities: [
      triggered(when.enters(CREATURE_YOU), [fx.explore(ref.eventObject)], {
        label: "One of your creatures enters: it explores",
      }),
    ],
  },
  "Resourceful Defense": {
    abilities: [
      triggered(when.leaves({ permanent: true, controller: "you", withCounter: "any" }), [fx.lkiCountersTo(ref.target())], {
        targets: [target.permanent("t", [], { controller: "you" }, "permanent you control")],
        label: "Its counters onto one of your permanents",
      }),
      // "Any number of counters": a division for each kind of counter on the first target.
      activated({
        mana: "{4}{W}",
        targets: [
          target.permanent("a", [], { controller: "you", withCounter: "any" }, "permanent of yours with counters"),
          { ...target.permanent("b", [], { controller: "you" }, "another permanent of yours"), otherThan: ["a"] },
        ],
        effects: [fx.moveCountersDivided(ref.target("a"), ref.target("b"), "any")],
        label: "Move any number of counters from one of your permanents onto another",
      }),
    ],
  },
  "Sphere Grid": {
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU, true), [fx.addCounters(ref.eventObject, 1)], {
        label: "One of your creatures deals damage to a player: a +1/+1 counter on it",
      }),
      staticAbility(P1P1_YOU, { addKeywords: ["reach", "trample"] }, { label: "Unlock: reach and trample" }),
    ],
  },
  "Summoner's Sending": {
    abilities: [
      triggered(
        when.yourEndStep,
        fx.may(
          "Exile a creature card from a graveyard for a 1/1 Spirit?",
          // The mana value is read as the card is exiled (it is no longer the target afterwards).
          fx.exileCard(ref.target(), { name: "big", filter: { minManaValue: 4 } }),
          fx.createTokens(SPIRIT, 1, undefined, "s"),
          ...fx.when(cond.amountAtLeast(amount.v("big"), 1), fx.addCounters(ref.stored("s"), 1)),
        ),
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card in a graveyard")],
          label: "Exile a creature card from a graveyard: a 1/1 flying Spirit",
        },
      ),
    ],
  },

  "Forge of Heroes": FORGE_OF_HEROES,

  // --- Instants and sorceries -----------------------------------------------------------------------------------------
  // Escalate—tap an untapped creature you control, for each mode beyond the first (the player chooses them).
  "Collective Effort": {
    spell: escalate(
      { tap: { types: ["Creature"], controller: "you" } },
      {
        label: "Destroy a creature with power 4 or greater",
        targets: [{ ...target.creature("c", { minPower: 4 }), label: "creature with power 4 or greater" }],
        effects: [fx.destroy(ref.target("c"))],
      },
      {
        label: "Destroy an enchantment",
        targets: [target.permanent("e", ["Enchantment"], {}, "enchantment")],
        effects: [fx.destroy(ref.target("e"))],
      },
      {
        label: "A +1/+1 counter on each creature target player controls",
        targets: [target.player("p")],
        effects: [fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1)],
      },
    ),
  },
  "Damning Verdict": {
    spell: spell([], [fx.destroyAll({ types: ["Creature"], not: { withCounter: "any" } })]),
  },
  "Destroy Evil": {
    spell: {
      modes: [
        mode(
          "Destroy a creature with toughness 4 or greater",
          [{ ...target.creature("c", { minToughness: 4 }), label: "creature with toughness 4 or greater" }],
          [fx.destroy(ref.target("c"))],
        ),
        mode(
          "Destroy an enchantment",
          [target.permanent("e", ["Enchantment"], {}, "enchantment")],
          [fx.destroy(ref.target("e"))],
        ),
      ],
    },
  },
  "Promise of Loyalty": {
    // "Each player puts a vow counter on a creature they control and sacrifices the rest": all choices first (APNAP),
    // then the sacrifices at once (`keep`).
    spell: spell(
      [],
      [
        fx.keep(ref.eachPlayer, "one", { types: ["Creature"] }),
        ...fx.forEachPlayer(ref.eachPlayer, (p) => [
          fx.counters(ref.permanentsOf(p, { types: ["Creature"] }), "vow"),
          fx.modifyWhileCounter(
            ref.permanentsOf(p, { types: ["Creature"], withCounter: "vow" }),
            {
              addBlockRules: [{ cantAttackPlayer: "you", label: "Can't attack the player who cast Promise of Loyalty" }],
            },
            "vow",
          ),
        ]),
      ],
    ),
  },
  "Protection Magic": {
    spell: spell([target.upTo(3, target.creature())], [fx.counters(ref.target(), "shield")]),
  },
  "Pull from Tomorrow": {
    spell: spell([], [fx.draw(amount.x), fx.discard(1)]),
  },
  "Three Visits": {
    spell: spell([], [fx.search({ subtype: "Forest" }, { to: "battlefield" })]),
  },
  "Yuna's Decision": {
    spell: {
      modes: [
        mode(
          "Continue the pilgrimage",
          [],
          [
            fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { store: "s" }),
            ...fx.when(
              cond.v("s"),
              fx.draw(1),
              fx.pickFromZone(
                "hand",
                { types: ["Creature"] },
                { to: "battlefield" },
                { min: 0, prompt: "A creature card to put onto the battlefield" },
              ),
              fx.pickFromZone(
                "hand",
                { types: ["Land"] },
                { to: "battlefield" },
                { min: 0, prompt: "A land card to put onto the battlefield" },
              ),
            ),
          ],
        ),
        mode(
          "Find another way",
          [
            {
              ...target.cardInGraveyard("g", { permanent: true }, "you", "permanent cards in your graveyard"),
              count: 2,
              minCount: 1,
            },
          ],
          [fx.toHand(ref.target("g"))],
        ),
      ],
    },
  },
  "Yuna's Whistle": {
    spell: spell(
      [],
      [
        fx.revealUntilN({ types: ["Creature"] }, 1, { to: "hand" }, "w"),
        fx.reflexive(
          [target.creature("t", { controller: "you" })],
          [fx.addCounters(ref.target(), amount.manaValueOf(ref.target("w")))],
          { w: ref.stored("w") },
        ),
      ],
    ),
  },
};
