/** Marvel's Spider-Man — red cards (lot A). */
import { msg, type TriggerSpec, type Zone } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  fx,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

/** "Exile the top card of your library. You may play that card this turn." */
const exileTopPlayThisTurn = [fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"))];

/** "Whenever you play a land from [these zones]". */
const landFrom = (...from: Zone[]): TriggerSpec => ({ on: "playLand", from });

export const RED: Record<string, CardScript> = {
  // Trample: read from the text.
  "Angry Rabble": {
    abilities: [
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 damage to each opponent",
      }),
      activated({
        mana: "{5}{R}",
        sorcerySpeed: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Two +1/+1 counters",
      }),
    ],
  },
  // Flying: read from the text.
  "Electro, Assaulting Battery": {
    abilities: [
      playerStatic({ keepUnspentMana: { types: ["R"] }, label: "You don't lose unspent red mana" }),
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.addMana("R")], { label: "Add {R}" }),
      triggered(
        when.leavesSelf,
        [
          fx.payX("pay {X} to deal X damage to target player?", "x"),
          ...fx.when(cond.v("x"), fx.reflexive([target.player()], [fx.damage(amount.v("x"), ref.target())], undefined, ["x"])),
        ],
        { label: "Pay {X}: X damage to target player" },
      ),
    ],
  },
  // Mayhem {1}{R}: read from the text.
  "Electro's Bolt": { spell: spell([target.creature()], [fx.damage(4, ref.target())]) },
  // Modal double-faced: each face has its own script.
  "Gwen Stacy": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileTop(ref.you, 1, "g"),
          fx.grantPlay(ref.stored("g"), { forever: true, condition: cond.controls({ self: true }) }),
        ],
        { label: "Exiles the top card, playable as long as you control this creature" },
      ),
      activated({ mana: "{2}{U}{R}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform her" }),
    ],
  },
  // Flying, vigilance, haste: read from the text.
  "Ghost-Spider": {
    abilities: [
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.addCounters(ref.self, 1)], {
        label: "Spell cast from exile: a +1/+1 counter",
      }),
      triggered(landFrom("exile"), [fx.addCounters(ref.self, 1)], {
        label: "Land played from exile: a +1/+1 counter",
      }),
      activated({
        removeCounters: { kind: "any", n: 2 },
        effects: exileTopPlayThisTurn,
        label: "Exiles the top card, playable this turn",
      }),
    ],
  },
  "Heroes' Hangout": {
    spell: modal(
      mode(
        "Date Night — exiles the top two cards, one of them playable until the end of your next turn",
        [],
        [fx.impulse(2, "yourNextTurn")],
      ),
      mode(
        "Patrol Night — one or two creatures get +1/+0 and first strike",
        [target.between(1, 2, target.creature())],
        [fx.pump(ref.target(), 1, 0, ["firstStrike"])],
      ),
    ),
  },
  // Flying, haste: read from the text.
  "Hobgoblin, Mantled Marauder": {
    abilities: [triggered(when.discard("you"), [fx.pump(ref.self, 2, 0)], { label: "+2/+0 until end of turn" })],
  },
  "J. Jonah Jameson": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Suspect up to one creature",
      }),
      triggered(when.attacks({ types: ["Creature"], controller: "you", keyword: "menace" }), [fx.createTokens(TREASURE)], {
        label: "A creature with menace attacks: a Treasure",
      }),
    ],
  },
  // Haste: read from the text.
  "Masked Meower": {
    abilities: [activated({ discard: 1, sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" })],
  },
  "Maximum Carnage": {
    abilities: [
      // "Until your next turn, each creature …": a rule for every creature, those that arrive later too (ruling), as the
      // static of an emblem until your next turn. The requirements are those of being goaded by you (`goadedBy`),
      // without the word.
      chapter(
        [1],
        [
          fx.emblem(
            msg("Maximum Carnage (until your next turn)"),
            msg("Each creature attacks each combat if able and attacks a player other than you if able."),
            [
              staticAbility(
                { types: ["Creature"] },
                {
                  addBlockRules: [
                    {
                      goadedBy: "you",
                      label: "Maximum Carnage: attacks each combat if able, and a player other than its controller if able",
                    },
                  ],
                },
                { label: "Each creature attacks each combat if able, and a player other than you" },
              ),
            ],
            true,
          ),
        ],
        { label: "Chapter I — until your next turn, each creature attacks if able, and a player other than you" },
      ),
      chapter([2], [fx.addMana("R", "R", "R")], { label: "Chapter II — add {R}{R}{R}" }),
      chapter([3], [fx.damage(5, ref.eachOpponent)], { label: "Chapter III — 5 damage to each opponent" }),
    ],
  },
  "Molten Man, Inferno Incarnate": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.search({ types: ["Land"], subtype: "Mountain", basic: true }, { to: "battlefield", tapped: true })],
        { label: "A basic Mountain card, tapped" },
      ),
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { subtype: "Mountain", controller: "you" }, label: "+1/+1 for each Mountain you control" },
      ),
      triggered(when.leavesSelf, [fx.sacrifice(ref.you, { types: ["Land"] })], { label: "Sacrifice a land" }),
    ],
  },
  // Haste, Mayhem {2}{R}: read from the text.
  "Raging Goblinoids": {},
  "Romantic Rendezvous": { spell: spell([], [fx.discard(1), fx.draw(2)]) },
  "Shadow of the Goblin": {
    abilities: [
      triggered(when.step("main1", "you"), [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "Unreliable Visions — discard a card; if you do, draw a card",
      }),
      triggered({ on: "castSpell", by: "you", notFromHand: true }, [fx.damage(1, ref.eachOpponent)], {
        label: "Undying Vengeance — spell cast from anywhere other than your hand: 1 damage to each opponent",
      }),
      triggered(landFrom("graveyard", "exile", "library"), [fx.damage(1, ref.eachOpponent)], {
        label: "Undying Vengeance — land played from anywhere other than your hand: 1 damage to each opponent",
      }),
    ],
  },
  Shock: { spell: spell([target.any()], [fx.damage(2, ref.target())]) },
  "Shocker, Unshakable": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "Has first strike during your turn" },
      ),
      triggered(when.entersSelf, [fx.damage(2, ref.target()), fx.damage(2, ref.controllerOf(ref.target()))], {
        targets: [target.creature()],
        label: "Vibro-Shock Gauntlets — 2 damage to a creature and 2 to its controller",
      }),
    ],
  },
  // Reach: read from the text.
  "Spider-Gwen, Free Spirit": {
    abilities: [
      triggered(when.tapsSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "You may discard a card; if you do, draw a card",
      }),
    ],
  },
  // Mayhem {1}{R}: read from the text.
  "Spider-Islanders": {},
  "Spinneret and Spiderling": {
    abilities: [
      triggered(when.attackWith(2, { subtype: "Spider" }), [fx.addCounters(ref.self, 1)], {
        label: "Attacks with two or more Spiders: a +1/+1 counter",
      }),
      triggered(
        when.dealsDamage("self"),
        [fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })],
        {
          // The damage dealt at the same time is added up (2 + 2 to two blockers).
          condition: cond.amountAtLeast(amount.eventAmount, 4),
          batched: "sum",
          label: "4 or more damage: exiles the top card, playable until the end of your next turn",
        },
      ),
    ],
  },
  // Menace: read from the text.
  "Stegron the Dinosaur Man": {
    abilities: [
      activated({
        mana: "{1}{R}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 3, 1), fx.modify(ref.target(), { addSubtypes: ["Dinosaur"] })],
        label: "Dinosaur Formula — +3/+1 and becomes a Dinosaur",
      }),
    ],
  },
  "Taxi Driver": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "A creature gains haste",
      }),
    ],
  },
  Wisecrack: {
    spell: spell(
      [target.creature()],
      [
        fx.damage(amount.powerOf(ref.target()), ref.target(), ref.target()),
        ...fx.when(cond.refMatches(ref.target(), { attacking: true }), fx.damage(2, ref.controllerOf(ref.target()))),
      ],
    ),
  },
};
