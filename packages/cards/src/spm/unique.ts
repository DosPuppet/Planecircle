/** Marvel's Spider-Man — Web-slinging, Mayhem and unique cards (lots B and C). */
import { parseManaCost } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cmp,
  cond,
  entersWith,
  eventReplacement,
  fromGraveyard,
  fx,
  manaAbility,
  playerStatic,
  ref,
  SPIDER_21,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

export const UNIQUE: Record<string, CardScript> = {
  // --- Lot B1: Web-slinging and Mayhem ---------------------------------------
  "Spiders-Man, Heroic Horde": {
    // Web-slinging {4}{G}{G}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(3), fx.createTokens(SPIDER_21, 2)], {
        condition: cond.castVia("webSlinging"),
        label: "Cast using Web-slinging: you gain 3 life and create two 2/1 Spiders",
      }),
    ],
  },
  "Scarlet Spider, Ben Reilly": {
    // Web-slinging {R}{G} and trample: read from the text.
    abilities: [
      entersWith({
        counters: amount.manaValueOf(ref.costBounced),
        condition: cond.castVia("webSlinging"),
        label: "Sensational Save — Cast using Web-slinging: X +1/+1 counters (mana value of the returned creature)",
      }),
    ],
  },
  "Sandman's Quicksand": {
    // Mayhem {3}{B}: read from the text.
    spell: spell(
      [],
      [
        ...fx.when(cond.castVia("mayhem"), fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -2, -2)),
        ...fx.when(cond.not(cond.castVia("mayhem")), fx.pumpAll({ types: ["Creature"] }, -2, -2)),
      ],
    ),
  },
  "Alien Symbiosis": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    castOptions: [fromGraveyard({ discard: 1 })],
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["menace"], addSubtypes: ["Symbiote"] },
        { label: "+1/+1, menace, and it's a Symbiote" },
      ),
    ],
  },
  "Oscorp Industries": {
    // Mayhem (no cost for a land): read from the text.
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["U", "B", "R"]),
      triggered({ on: "enters", who: "self", fromZone: "graveyard" }, [fx.loseLife(2, ref.you)], {
        label: "Entered from a graveyard: you lose 2 life",
      }),
    ],
  },
  "Norman Osborn": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.connive(ref.self)], { label: "He connives" }),
      activated({ mana: "{1}{U}{B}{R}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform it" }),
    ],
  },
  "Green Goblin": {
    // Flying and menace: read from the text.
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 2,
        fromZones: ["graveyard"],
        label: "Spells cast from your graveyard cost {2} less",
      },
      playerStatic({
        playFrom: { zone: "graveyard", filter: { notTypes: ["Land"] }, what: "spells", mayhem: true },
        label: "Goblin Formula — Each nonland card in your graveyard has mayhem (its mana cost)",
      }),
    ],
  },
  "Peter Parker": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SPIDER_21)], { label: "Create a 2/1 Spider with reach" }),
      activated({ mana: "{1}{G}{W}{U}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform it" }),
    ],
  },
  "Amazing Spider-Man": {
    // Vigilance and reach: read from the text.
    abilities: [
      playerStatic({
        altCostAll: {
          mana: parseManaCost("{G}{W}{U}"),
          filter: { legendary: true, colors: ["W", "U", "B", "R", "G"] },
          webSlinging: true,
        },
        label: "Your colored legendary spells have Web-slinging {G}{W}{U}",
      }),
    ],
  },
  "Urban Retreat": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["G", "W", "U"]),
      activated({
        mana: "{2}",
        bounce: { types: ["Creature"], tapped: true },
        fromHand: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.selfCard)],
        label: "Return a tapped creature: put this land from your hand onto the battlefield",
      }),
    ],
  },

  // --- Lot C1: copies and legends ---------------------------------------------
  "Chameleon, Master of Disguise": {
    // Mayhem {2}{U}: read from the text.
    asEnters: [
      fx.chooseCopy({ types: ["Creature"], controller: "you" }, { except: { setName: "Chameleon, Master of Disguise" } }),
    ],
  },
  "The Clone Saga": {
    abilities: [
      chapter([1], [fx.surveil(3)], { label: "I — Surveil 3" }),
      chapter(
        [2],
        [
          {
            op: "playerEffect",
            ability: { nextSpell: { filter: { types: ["Creature"] }, copy: true, nonlegendary: true } },
            once: true,
          },
        ],
        { label: "II — Your next creature spell this turn is copied (nonlegendary copy)" },
      ),
      chapter(
        [3],
        [
          fx.chooseForSelf("cardName"),
          fx.emblem(
            "The Clone Saga",
            "Whenever a creature with the chosen name deals combat damage to a player this turn, draw a card.",
            [
              triggered(when.combatDamage({ types: ["Creature"], chosen: "cardName" }, true), [fx.draw(1)], {
                label: "A creature with the chosen name deals damage to a player: draw a card",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "III — Choose a name: its creatures that deal damage to a player this turn make you draw" },
      ),
    ],
  },
  "Jackal, Genius Geneticist": {
    // Trample: read from the text.
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"], compare: [cmp.manaValue("=", amount.sourcePower)] }),
        [fx.copySpell(ref.eventObject, 1, { nonlegendary: true }), fx.addCounters(ref.self, 1)],
        { label: "Creature spell with mana value equal to its power: copy it (nonlegendary), then a +1/+1 counter" },
      ),
    ],
  },
  "Spider-Verse": {
    abilities: [
      playerStatic({ noLegendRule: { subtype: "Spider" }, label: "The legend rule doesn't apply to your Spiders" }),
      triggered(
        { on: "castSpell", by: "you", notFromHand: true },
        fx.may("Copy this spell?", fx.copySpell(ref.eventObject, 1, { haste: true }), fx.doneOncePerTurn),
        { oncePerTurn: "ifDone", label: "Spell cast from anywhere other than your hand: you may copy it (once each turn)" },
      ),
    ],
  },
  "Behold the Sinister Six!": {
    spell: spell(
      [
        {
          ...target.upTo(6, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")),
          distinct: "name",
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },

  // --- Lot C2: costs, amounts and players --------------------------------------
  "The Soul Stone": {
    // Indestructible: read from the text.
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{6}{B}",
        tap: true,
        exile: { types: ["Creature"] },
        effects: [fx.harness],
        label: "Exile a creature: harness The Soul Stone",
      }),
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target())], {
        condition: cond.harnessed,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
        label: "∞ — A creature card from your graveyard returns to the battlefield",
      }),
    ],
  },
  "Iron Spider, Stark Upgrade": {
    // Vigilance: read from the text.
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.addCountersAll({
            controller: "you",
            anyOf: [{ types: ["Artifact"], anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] }],
          }),
        ],
        label: "A +1/+1 counter on each artifact creature and Vehicle you control",
      }),
      activated({
        mana: "{2}",
        removeCounterFrom: { filter: { types: ["Artifact"] }, kind: "+1/+1", n: 2 },
        effects: [fx.draw(1)],
        label: "Remove two +1/+1 counters from your artifacts: draw a card",
      }),
    ],
  },
  "Cheering Crowd": {
    abilities: [
      triggered(
        when.step("main1", "any"),
        fx.mayFor(ref.eventPlayer, "Put a +1/+1 counter on Cheering Crowd?", fx.addCounters(ref.self, 1), {
          op: "addMana",
          mana: ["C"],
          times: amount.countersOn(ref.self),
          who: ref.eventPlayer,
        }),
        { label: "That player may put a +1/+1 counter on it; they then add {C} for each counter" },
      ),
    ],
  },
  "Mister Negative": {
    // Vigilance and lifelink: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Exchange life totals with target opponent?",
          fx.exchangeLife(ref.you, ref.target(), "lost"),
          fx.draw(amount.v("lost")),
        ),
        {
          targets: [target.player("t", "opponent")],
          label: "Darkforce Inversion — Exchange life totals with an opponent; draw as many cards as you lost life",
        },
      ),
    ],
  },
  "Rhino, Barreling Brute": {
    // Vigilance, trample and haste: read from the text.
    abilities: [
      triggered(when.attacksSelf, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", minManaValue: 4 }), 1),
        label: "If you cast a spell with mana value 4 or greater this turn: draw a card",
      }),
    ],
  },
  "Kraven's Last Hunt": {
    abilities: [
      chapter(
        [1],
        [
          fx.mill(5),
          fx.reflexive([target.creature()], [fx.damage(amount.maxPower({ types: ["Creature"] }, "graveyard"), ref.target())]),
        ],
        { label: "I — Mill five cards; damage equal to the greatest power in your graveyard to a creature" },
      ),
      chapter([2], [fx.pump(ref.target(), 2, 2)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "II — +2/+2 until end of turn",
      }),
      chapter([3], [fx.moveTo(ref.target(), { to: "hand" })], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
        label: "III — A creature card from your graveyard to your hand",
      }),
    ],
  },
  "Kraven the Hunter": {
    // Trample: read from the text.
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.draw(1), fx.addCounters(ref.self, 1)], {
        condition: cond.eventObjectGreatestPower,
        label: "An opponent's greatest creature dies: draw a card and a +1/+1 counter",
      }),
    ],
  },

  // --- Lot C3: unique cards --------------------------------------------------
  "Arachne, Psionic Weaver": {
    // Web-slinging {W}: read from the text. "As Arachne enters, look at an opponent's hand, then choose a noncreature
    // card type": the card type is chosen like an entry mode.
    asEnters: [
      fx.chooseOpponent("o"),
      fx.look(ref.handOf(ref.stored("o"))),
      fx.chooseForSelf("mode", {
        options: ["Artifact", "Battle", "Enchantment", "Instant", "Kindred", "Planeswalker", "Sorcery"],
      }),
    ],
    abilities: [
      {
        kind: "costReduction",
        filter: { chosen: "cardType" },
        generic: -1,
        everyone: true,
        label: "Spells of the chosen type cost {1} more",
      },
    ],
  },
  "With Great Power . . .": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      staticAbility(
        "attached",
        { power: 2, toughness: 2 },
        {
          per: { anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }], attached: "toHost" },
          label: "+2/+2 for each Aura and Equipment attached to it",
        },
      ),
      eventReplacement({
        event: "damage",
        to: "you",
        modify: {},
        redirectTo: "attached",
        label: "Damage that would be dealt to you is dealt to the enchanted creature instead",
      }),
    ],
  },
  "Spider-Punk": {
    // Riot: read from the text.
    abilities: [
      staticAbility(
        { subtype: "Spider", controller: "you", other: true },
        { addKeywords: ["riot"] },
        {
          label: "Your other Spiders have riot",
        },
      ),
      playerStatic({
        uncounterable: { abilities: true, everyone: true },
        label: "Spells and abilities can't be countered",
      }),
      playerStatic({ damageUnpreventable: true, label: "Damage can't be prevented" }),
    ],
  },
  "Superior Foes of Spider-Man": {
    // Trample: read from the text.
    abilities: [
      triggered(
        when.castSpell("you", { minManaValue: 4 }),
        fx.may(
          "Exile the top card of your library?",
          fx.exileTop(ref.you, 1, "e"),
          fx.grantPlay(ref.stored("e"), { forever: true, replacePrevious: true }),
        ),
        { label: "Spell with mana value 4 or greater: exile the top card, playable until the next one exiled this way" },
      ),
    ],
  },
  "Black Cat, Cunning Thief": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(9, {
            who: ref.target(),
            count: 2,
            exact: true,
            to: { to: "exile", faceDown: "you" },
            rest: "bottom",
            store: "bc",
          }),
          fx.grantPlay(ref.stored("bc"), { forever: true, anyMana: true }),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "Look at the top nine cards of an opponent's library: exile two, playable (mana of any type)",
        },
      ),
    ],
  },
  "Gwenom, Remorseless": {
    // Deathtouch and lifelink: read from the text.
    abilities: [
      triggered(when.attacksSelf, [fx.thisTurn({ playFrom: { zone: "libraryTop", payLifeManaValue: true } })], {
        label: "Until end of turn, play the top cards of your library (spells: life equal to their mana value)",
      }),
    ],
  },
};
