/**
 * Commander: Rakdos, Lord of Riots deck ("Rakdos, Lord of Big Free Stuff", Moxfield). Make opponents lose life (damage
 * to each player, drains, devotion), then cast the big spells cheaply: Eldrazi, Demons,
 * Blightsteel Colossus.
 */
import type { Amount, CardScript, Effect, ObjectFilter, Ref, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  costReducer,
  entersWith,
  fx,
  loyalty,
  manaAbility,
  modal,
  POWERSTONE,
  protection,
  protectionAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Life lost by your opponents this turn (sum). */
const OPPONENTS_LOST: Amount = amount.turnEvents({ event: "lifeLoss", who: "opponent", sum: true });
/** Each creature and each player. */
const EACH_CREATURE_AND_PLAYER: Ref = ref.union(ref.eachPlayer, ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }));
/** "When you cast this spell" (Eldrazi). */
const CAST_SELF = when.castSelf;
/** "When [this card] is put into a graveyard from anywhere, its owner shuffles their graveyard into their library"
 * (Kozilek, Butcher of Truth; Ulamog, the Infinite Gyre). */
const shuffleGraveyardBack = () =>
  triggered(
    {
      on: "zoneChange",
      from: ["battlefield", "hand", "library", "stack", "exile"],
      to: ["graveyard"],
      filter: { self: true },
      whose: "any",
    },
    [fx.moveAll("graveyard", ref.ownerOf(ref.selfCard), {}, { to: "libraryTop" }), fx.shuffle(ref.ownerOf(ref.selfCard))],
    { fromGraveyard: true, label: "Put into a graveyard: its owner shuffles their graveyard into their library" },
  );

/** 1/1 red Devil: "When this token dies, it deals 1 damage to any target." (Ob Nixilis). */
const DEVIL: TokenSpec = {
  name: "Devil",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Devil"],
  power: 1,
  toughness: 1,
  abilities: [
    triggered(when.diesSelf, [fx.damage(1, ref.target())], {
      targets: [target.any()],
      label: "It dies: 1 damage to any target",
    }),
  ],
  text: "When this token dies, it deals 1 damage to any target.",
};

export const EDH_RAKDOS: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  "Rakdos, Lord of Riots": {
    castCondition: cond.opponentLostLife,
    abilities: [
      costReducer({ types: ["Creature"] }, 0, "Creature spells you cast cost {1} less for each 1 life your opponents have lost", {
        genericAmount: OPPONENTS_LOST,
      }),
    ],
  },

  // --- Mana ---------------------------------------------------------------------------------------------------------
  "Rakdos Signet": {
    abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("B", "R")], label: "{B}{R}" })],
  },
  "Priest of Gix": {
    abilities: [triggered(when.entersSelf, [fx.addMana("B", "B", "B")], { label: "Add {B}{B}{B}" })],
  },
  "Cryptolith Fragment": {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        tap: true,
        effects: [fx.addManaChoice(1), fx.loseLife(1, ref.eachPlayer)],
        label: "One mana of any color; each player loses 1 life",
      }),
      triggered(when.yourUpkeep, [fx.transform(ref.self)], {
        condition: cond.not(cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eachPlayer, cond.lifeAtLeast(11))), 1)),
        label: "Each player has 10 or less life: transform it",
      }),
    ],
  },
  "Aurora of Emrakul": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(3, ref.eachOpponent)], { label: "Each opponent loses 3 life" })],
  },

  // --- Modal cards (land back face) -------------------------------------------------------------------------------------
  "Agadeem's Awakening": {
    spell: spell(
      [
        {
          ...target.upTo(
            99,
            target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature cards with different mana values, X or less"),
          ),
          distinct: "manaValue",
          maxManaValueAmount: amount.x,
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  // Back faces: "you may pay 3 life; if you don't, it enters tapped" is read from the text.
  "Agadeem, the Undercrypt": { abilities: [manaAbility("B")] },
  "Shatterskull Smashing": {
    spell: spell(
      [target.upTo(2, target.creatureOrPlaneswalker("t"))],
      [
        ...fx.when(cond.xAtLeast(6), fx.damageDivided(amount.plus(amount.x, amount.x), ref.target())),
        ...fx.when(cond.not(cond.xAtLeast(6)), fx.damageDivided(amount.x, ref.target())),
      ],
    ),
  },
  "Shatterskull, the Hammer Pass": { abilities: [manaAbility("R")] },
  "Valakut Awakening": {
    spell: spell(
      [],
      [
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryBottom" },
          { count: amount.cardsIn("hand"), min: 0, store: "va", prompt: "Cards to put on the bottom of your library" },
        ),
        fx.draw(amount.plus(amount.v("va"), 1)),
      ],
    ),
  },
  "Valakut Stoneforge": { abilities: [entersWith({ tapped: true }), manaAbility("R")] },
  "Bloodsoaked Insight": {
    costReduction: { generic: OPPONENTS_LOST },
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), 3, "bi"), fx.grantPlay(ref.stored("bi"), { untilYourNextTurn: true, anyMana: true })],
    ),
  },
  "Sanguine Morass": { abilities: [entersWith({ tapped: true }), manaAbility(["B", "R"])] },

  // --- Damage and life loss ------------------------------------------------------------------------------------------
  "Creeping Bloodsucker": {
    abilities: [
      triggered(when.yourUpkeep, [fx.damage(1, ref.eachOpponent), fx.gainLife(amount.refCount(ref.eachOpponent))], {
        label: "1 damage to each opponent; you gain that much life",
      }),
    ],
  },
  "Fanatic of Mogis": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.devotion("R"), ref.eachOpponent)], {
        label: "Damage to each opponent equal to your devotion to red",
      }),
    ],
  },
  "Gray Merchant of Asphodel": {
    abilities: [
      // "You gain life equal to the life lost this way": the loss actually done (Teferi's Protection, Bloodletter).
      triggered(when.entersSelf, [fx.loseLife(amount.devotion("B"), ref.eachOpponent, "lost"), fx.gainLife(amount.v("lost"))], {
        label: "Each opponent loses X life (devotion to black), you gain that much",
      }),
    ],
  },
  "Plague Spitter": {
    abilities: [
      triggered(when.yourUpkeep, [fx.damage(1, EACH_CREATURE_AND_PLAYER)], {
        label: "1 damage to each creature and each player",
      }),
      triggered(when.diesSelf, [fx.damage(1, EACH_CREATURE_AND_PLAYER)], {
        label: "It dies: 1 damage to each creature and each player",
      }),
    ],
  },
  "Spear Spewer": {
    abilities: [activated({ tap: true, effects: [fx.damage(1, ref.eachPlayer)], label: "1 damage to each player" })],
  },
  "Thermo-Alchemist": {
    abilities: [
      activated({ tap: true, effects: [fx.damage(1, ref.eachOpponent)], label: "1 damage to each opponent" }),
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.untap(ref.self)], {
        label: "Instant or sorcery: untap it",
      }),
    ],
  },
  "Shepherd of Rot": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.loseLife(amount.count({ subtype: "Zombie" }), ref.eachPlayer)],
        label: "Each player loses 1 life for each Zombie on the battlefield",
      }),
    ],
  },
  "Stormfist Crusader": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachPlayer), fx.loseLife(1, ref.eachPlayer)], {
        label: "Each player draws a card and loses 1 life",
      }),
    ],
  },
  "Sanctum of Stone Fangs": {
    abilities: [
      triggered(
        { on: "step", step: "main", whose: "you", nth: 1 },
        [
          fx.loseLife(amount.count({ subtype: "Shrine", controller: "you" }), ref.eachOpponent),
          fx.gainLife(amount.count({ subtype: "Shrine", controller: "you" })),
        ],
        { label: "Each opponent loses X life and you gain X life (X: your Shrines)" },
      ),
    ],
  },
  "Lim-Dûl's Hex": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.forEachPlayer(ref.eachPlayer, (p) => fx.unlessPays(p, { mana: "{B}", orMana: "{3}" }, fx.damage(1, p))),
        { label: "1 damage to each player who doesn't pay {B} or {3}" },
      ),
    ],
  },
  "Descent into Avernus": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.counters(ref.self, "descent", 2),
          fx.createTokens(TREASURE, amount.countersOn(ref.self, "descent"), ref.eachPlayer),
          fx.damage(amount.countersOn(ref.self, "descent"), ref.eachPlayer),
        ],
        { label: "Two descent counters; each player creates X Treasures and is dealt X damage" },
      ),
    ],
  },
  "Keen Duelist": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.reveal(ref.libraryTop(ref.you)),
          fx.reveal(ref.libraryTop(ref.target())),
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.target())), ref.you),
          fx.loseLife(amount.manaValueOf(ref.libraryTop(ref.you)), ref.target()),
          fx.toHand(ref.libraryTop(ref.you)),
          fx.toHand(ref.libraryTop(ref.target())),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "You and an opponent reveal the top card: each loses the other's mana value, then takes it",
        },
      ),
    ],
  },
  "Protection Racket": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.forEachPlayer(ref.eachOpponent, (p, n) =>
          fx.when(
            cond.amountAtLeast(amount.refCount(p), 1),
            fx.unlessPays(
              p,
              { life: amount.manaValueOf(ref.libraryTop(ref.you)), paidStore: `racket${n}` },
              fx.toHand(ref.libraryTop(ref.you)),
            ),
            fx.when(cond.v(`racket${n}`), fx.exileCard(ref.libraryTop(ref.you))),
          ),
        ),
        { label: "For each opponent: your top card, exiled if they pay its mana value in life, otherwise into your hand" },
      ),
    ],
  },
  Pandemonium: {
    // Approximation: the target is chosen by the controller of Pandemonium (docs/approximations.md).
    abilities: [
      triggered(
        when.enters({ types: ["Creature"] }),
        fx.mayFor(
          ref.controllerOf(ref.eventObject),
          "Have it deal damage equal to its power?",
          fx.damage(amount.powerOf(ref.eventObject), ref.target(), ref.eventObject),
        ),
        { targets: [target.any()], label: "A creature enters: it may deal damage equal to its power" },
      ),
    ],
  },
  "Screamer-Killer": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"], minManaValue: 5 }), [fx.damage(5, ref.target())], {
        targets: [target.any()],
        label: "Creature spell with mana value 5 or greater: 5 damage to any target",
      }),
    ],
  },
  "Ancient Cellarspawn": {
    abilities: [
      costReducer(
        { anySubtype: ["Demon", "Horror", "Nightmare"] },
        1,
        "Demon, Horror, and Nightmare spells you cast cost {1} less",
      ),
      triggered(
        when.castSpell("you", { manaSpentBelowValue: true }),
        [fx.loseLife(amount.plus(amount.manaValueOf(ref.eventObject), amount.neg(amount.eventManaSpent)), ref.target())],
        {
          targets: [target.player("t", "opponent")],
          label: "Spell cast for less than its mana value: an opponent loses the difference",
        },
      ),
    ],
  },
  Exocrine: {
    abilities: [
      // Ravenous: enters with X +1/+1 counters; if X is 5 or more, draw a card when it enters.
      entersWith({ counters: amount.x, label: "Ravenous" }),
      triggered(when.entersSelf, fx.when(cond.amountAtLeast(amount.sourceX, 5), fx.draw(1)), {
        label: "Ravenous: if X is 5 or more, draw a card",
      }),
      triggered(
        when.entersSelf,
        [
          fx.damage(
            amount.sourceX,
            ref.union(ref.eachPlayer, ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.self)),
          ),
        ],
        { label: "Bioplasmic Barrage: X damage to each player and each other creature" },
      ),
    ],
  },
  "Knollspine Dragon": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Discard your hand and draw cards equal to the damage dealt to that opponent this turn?",
          fx.discard(99, ref.you),
          fx.draw({ kind: "turnEvents", query: { event: "damage", toPlayer: true, sum: true }, of: ref.target() }),
        ),
        { targets: [target.player("t", "opponent")], label: "You may discard your hand and draw" },
      ),
    ],
  },
  "Florian, Voldaren Scion": {
    abilities: [
      triggered(
        when.secondMain,
        [
          fx.lookAtTop(OPPONENTS_LOST, { count: 1, exact: true, to: { to: "exile" }, rest: "bottom", store: "fl" }),
          fx.grantPlay(ref.stored("fl"), {}),
        ],
        { label: "Look at X cards (life your opponents lost): exile one, playable this turn" },
      ),
    ],
  },
  "Sandstone Oracle": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.chooseOpponent("o"),
          fx.draw(
            amount.plus(amount.maxOverPlayers(ref.stored("o"), amount.cardsIn("hand")), amount.neg(amount.cardsIn("hand"))),
          ),
        ],
        { label: "Choose an opponent: draw the difference if they have more cards in hand than you" },
      ),
    ],
  },

  // --- Creatures and artifacts -----------------------------------------------------------------------------------------
  "Imperial Recruiter": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Creature"], maxPower: 2 })], {
        label: "Search for a creature card with power 2 or less",
      }),
    ],
  },
  "Grim Servant": {
    abilities: [
      triggered(when.entersSelf, [{ ...fx.search({}), maxManaValue: amount.devotion("B") } as Effect, fx.loseLife(3)], {
        label: "Search for a card with mana value at most your devotion to black; you lose 3 life",
      }),
    ],
  },
  "Razaketh, the Foulblooded": {
    abilities: [
      activated({
        payLife: 2,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.search({})],
        label: "Search for a card",
      }),
    ],
  },
  "Tuktuk Rubblefort": {
    abilities: [staticAbility(CREATURE_YOU, { addKeywords: ["haste"] }, { label: "Creatures you control have haste" })],
  },
  "Shivan Devastator": { abilities: [entersWith({ counters: amount.x })] },
  "Walking Ballista": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({ mana: "{4}", effects: [fx.addCounters(ref.self, 1)], label: "A +1/+1 counter" }),
      activated({
        removeCounters: { kind: "+1/+1", n: 1 },
        targets: [target.any()],
        effects: [fx.damage(1, ref.target())],
        label: "Remove a counter: 1 damage to any target",
      }),
    ],
  },
  "Lightning Greaves": {
    // Equip {0}: read from the text.
    abilities: [staticAbility("attached", { addKeywords: ["haste", "shroud"] }, { label: "Haste and shroud" })],
  },
  "Phyrexian Reclamation": {
    abilities: [
      activated({
        mana: "{1}{B}",
        payLife: 2,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "Return a creature card from your graveyard to your hand",
      }),
    ],
  },
  "Blightsteel Colossus": { shuffleIntoLibrary: true },
  "Cityscape Leveler": {
    // Unearth {8}: read from the text.
    abilities: [
      ...[CAST_SELF, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.destroy(ref.target()),
            { ...fx.createTokens(POWERSTONE, 1, ref.controllerOf(ref.target())), tapped: true } as Effect,
          ],
          {
            targets: [target.upTo(1, target.nonland("t"))],
            label: "Destroy up to one nonland permanent; its controller creates a tapped Powerstone",
          },
        ),
      ),
    ],
  },

  // --- Spells ----------------------------------------------------------------------------------------------------------
  "Rakdos Charm": {
    spell: modal(
      {
        label: "Exile target player's graveyard",
        targets: [target.player("p")],
        effects: [fx.exile(ref.zone("graveyard", ref.target("p")))],
      },
      {
        label: "Destroy the target artifact",
        targets: [target.permanent("a", ["Artifact"], {}, "artifact")],
        effects: [fx.destroy(ref.target("a"))],
      },
      {
        label: "Each creature deals 1 damage to its controller",
        targets: [],
        effects: fx.forEachPlayer(ref.eachPlayer, (p) => [
          {
            op: "eachDealsDamage",
            filter: {},
            from: ref.permanentsOf(p, { types: ["Creature"] }),
            to: p,
            amount: 1,
          } as Effect,
        ]),
      },
    ),
  },
  "Deflecting Swat": {
    altCost: { mana: "{0}", condition: cond.controls({ commander: true }), label: "Free if you control a commander" },
    spell: spell([{ id: "t", label: "spell or ability", filter: { stackItems: {} } }], [fx.changeTarget(ref.target())]),
  },
  "Wheel of Misfortune": {
    spell: spell(
      [],
      [
        fx.chooseNumbers(ref.eachPlayer, "wheel"),
        fx.damage(amount.numberChosen("wheel"), ref.numberChoosers("wheel", "highest")),
        fx.discard(99, ref.numberChoosers("wheel", "notLowest")),
        fx.draw(7, ref.numberChoosers("wheel", "notLowest")),
      ],
    ),
  },
  "Ob Nixilis, the Adversary": {
    abilities: [
      // Casualty X: sacrifice a creature with power X as you cast it; the copy (a token) isn't legendary and has X loyalty
      // (the power of the creature when sacrificed, modifications included: last known information).
      triggered(
        CAST_SELF,
        [
          fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "casualty" }),
          ...fx.when(
            cond.v("casualty"),
            fx.copySpell(ref.eventObject, 1, { nonlegendary: true, loyalty: amount.powerOf(ref.stored("casualty")) }),
          ),
        ],
        { label: "Casualty X: sacrifice a creature with power X to copy this spell" },
      ),
      loyalty(1, {
        effects: [
          ...fx.forEachPlayer(ref.eachOpponent, (p) =>
            fx.when(cond.amountAtLeast(amount.refCount(p), 1), fx.unlessPays(p, { discard: true }, fx.loseLife(2, p))),
          ),
          ...fx.when(cond.controls({ anySubtype: ["Demon", "Devil"] }), fx.gainLife(2)),
        ],
        label: "Each opponent loses 2 life unless they discard a card; Demon or Devil: you gain 2 life",
      }),
      loyalty(-2, { effects: [fx.createTokens(DEVIL)], label: "1/1 red Devil" }),
      loyalty(-7, {
        targets: [target.player("t")],
        effects: [fx.draw(7, ref.target()), fx.loseLife(7, ref.target())],
        label: "Target player draws seven cards and loses 7 life",
      }),
    ],
  },

  // --- Eldrazi --------------------------------------------------------------------------------------------------------
  "It That Betrays": {
    // Annihilator 2: read from the text.
    abilities: [
      triggered(when.sacrifice({ token: false }, false, true), [fx.toBattlefield(ref.eventObject, { underYourControl: true })], {
        label: "An opponent sacrifices a nontoken permanent: it enters under your control",
      }),
    ],
  },
  "Kozilek, Butcher of Truth": {
    abilities: [triggered(CAST_SELF, [fx.draw(4)], { label: "Draw four cards" }), shuffleGraveyardBack()],
  },
  "Kozilek, the Broken Reality": {
    abilities: [
      triggered(
        CAST_SELF,
        fx.forEachPlayer(ref.target(), (p, n) => [
          fx.pickFromZone("hand", {}, { to: "battlefield", as: "manifest" }, { who: p, count: 2, store: `kozilek${n}` }),
          fx.draw(amount.v(`kozilek${n}`)),
        ]),
        {
          targets: [target.upTo(2, target.player("t"))],
          label: "Up to two target players manifest two cards from their hand; you draw a card for each card manifested",
        },
      ),
      staticAbility(
        { ...CREATURE_YOU, other: true, colorCount: 0 },
        { power: 3, toughness: 2 },
        {
          label: "Other colorless creatures you control get +3/+2",
        },
      ),
    ],
  },
  "Ulamog, the Ceaseless Hunger": {
    abilities: [
      triggered(CAST_SELF, [fx.exile(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } }, count: 2 }],
        label: "Exile two target permanents",
      }),
      triggered(when.attacksSelf, [fx.exileTop(ref.defendingPlayer, 20, "ulamog")], {
        label: "Defending player exiles the top twenty cards of their library",
      }),
    ],
  },
  "Ulamog, the Defiler": {
    // Ward—Sacrifice two permanents: read from the text.
    abilities: [
      triggered(
        CAST_SELF,
        [
          fx.exileTop(
            ref.target(),
            amount.per(amount.plus(amount.maxOverPlayers(ref.target(), amount.cardsIn("library")), 1), 2),
            "defiler",
          ),
        ],
        { targets: [target.player("t", "opponent")], label: "Target opponent exiles half their library" },
      ),
      entersWith({
        counters: { kind: "aggregate", fn: "max", property: "manaValue", zone: "exile", whose: "all" } as Amount,
        label: "Enters with as many counters as the greatest mana value in exile",
      }),
      triggered(when.attacksSelf, [fx.sacrifice(ref.defendingPlayer, { permanent: true }, amount.countersOn(ref.self))], {
        label: "Annihilator X (its +1/+1 counters)",
      }),
    ],
  },
  "Ulamog, the Infinite Gyre": {
    // Annihilator 4: read from the text.
    abilities: [
      triggered(CAST_SELF, [fx.destroy(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        label: "Destroy target permanent",
      }),
      shuffleGraveyardBack(),
    ],
  },
  "Emrakul, the Promised End": {
    costReduction: { generic: amount.cardTypesInGraveyard },
    abilities: [
      protectionAbility(protection.from({ types: ["Instant"] }, "Protection from instants")),
      triggered(CAST_SELF, [fx.controlNextTurn(ref.target(), false, true)], {
        targets: [target.player("t", "opponent")],
        label: "You control target opponent's next turn; then that player takes an extra turn",
      }),
    ],
  },
  "Emrakul, the World Anew": {
    // Madness—Pay six {C}: read from the text.
    abilities: [
      triggered(CAST_SELF, [fx.gainControl(ref.permanentsOf(ref.target(), { types: ["Creature"] }))], {
        targets: [target.player("t")],
        label: "Gain control of all creatures target player controls",
      }),
      // Approximation: "from spells" reads as from instants and sorceries (docs/approximations.md).
      protectionAbility(protection.from({ anyOf: [{ types: ["Instant"] }, { types: ["Sorcery"] }] }, "Protection from spells")),
      protectionAbility(
        protection.from({ cast: true, enteredThisTurn: true }, "Protection from permanents that were cast this turn"),
      ),
      triggered(when.leavesSelf, [fx.sacrificeIt(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "It leaves the battlefield: sacrifice all creatures you control",
      }),
    ],
  },
};
