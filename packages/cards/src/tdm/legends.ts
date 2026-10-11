/** Tarkir: Dragonstorm — legendaries and unique cards (batch C). */
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CREATURE_WITH_COUNTER,
  CREATURE_YOU_CONTROL,
  castPermission,
  chapter,
  cmp,
  cond,
  costReducer,
  ELEPHANT_5,
  eventReplacement,
  flurry,
  fromGraveyard,
  fx,
  INSTANT_SORCERY,
  loyalty,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  renew,
  SOLDIER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
  ZOMBIE_DRUID,
} from "./common";

/** "Permanent that's one or more colors" (Ugin). */
const COLORED_PERMANENT = targetObj("t", { not: { colorCount: 0 } }, "permanent that's one or more colors");
const TOTAL_TOUGHNESS = amount.totalToughness(CREATURE_YOU_CONTROL);
const COLORS = ["W", "U", "B", "R", "G"] as const;

/** Felothar: "you may sacrifice a nonland permanent; when you do, a +1/+1 counter on each creature you control". */
const FELOTHAR = [
  fx.sacrifice(ref.you, { notTypes: ["Land"] }, 1, { optional: true, store: "s" }),
  ...fx.when(cond.v("s"), fx.reflexive([], [fx.addCountersAll(CREATURE_YOU_CONTROL, 1)])),
];

export const LEGENDS: Record<string, CardScript> = {
  // --- Colorless ----------------------------------------------------------------
  "Ugin, Eye of the Storms": {
    abilities: [
      triggered(when.castSelf, [fx.exile(ref.target())], {
        targets: [target.optional(COLORED_PERMANENT)],
        label: "Exile up to one colored permanent",
      }),
      triggered(when.castSpell("you", { colorCount: 0 }), [fx.exile(ref.target())], {
        targets: [target.optional(COLORED_PERMANENT)],
        label: "Colorless spell: exile up to one colored permanent",
      }),
      loyalty(2, { effects: [fx.gainLife(3), fx.draw(1)], label: "Gain 3 life, draw a card" }),
      loyalty(0, { effects: [fx.addMana("C", "C", "C")], label: "Add {C}{C}{C}" }),
      loyalty(-11, {
        effects: [
          fx.search({ colorCount: 0, notTypes: ["Land"] }, { to: "exile" }, 99, undefined, "u"),
          fx.grantPlay(ref.stored("u"), { free: true }),
        ],
        label: "Exile colorless nonland cards: cast them for free this turn",
      }),
    ],
  },

  // --- White -------------------------------------------------------------------
  "Elspeth, Storm Slayer": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        modify: { times: 2 },
        label: "Tokens created under your control: twice that many",
      }),
      loyalty(1, { effects: [fx.createTokens(SOLDIER)], label: "A 1/1 Soldier" }),
      loyalty(0, {
        effects: [
          fx.addCountersAll(CREATURE_YOU_CONTROL, 1),
          fx.modifyAll(CREATURE_YOU_CONTROL, { addKeywords: ["flying"] }, "untilYourNextTurn"),
        ],
        label: "A +1/+1 counter and flying until your next turn for your creatures",
      }),
      loyalty(-3, {
        targets: [target.creature("t", { controller: "opponent", minManaValue: 3 })],
        effects: [fx.destroy(ref.target())],
        label: "Destroy an opponent's creature with MV 3 or greater",
      }),
    ],
  },

  // --- Blue --------------------------------------------------------------------
  "Taigam, Master Opportunist": {
    abilities: [
      flurry(
        [fx.copySpell(ref.eventObject, 1), fx.suspend(ref.eventObject, 4)],
        "copy that spell, then exile it suspended with four time counters",
      ),
    ],
  },

  // --- Black -------------------------------------------------------------------
  "Hundred-Battle Veteran": {
    castOptions: [fromGraveyard({ finality: true })],
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 4 },
        {
          condition: cond.amountAtLeast(amount.counterKindsAmong(CREATURE_YOU_CONTROL), 3),
          label: "Three kinds of counters among your creatures: +2/+4",
        },
      ),
    ],
  },
  "Krumar Initiate": {
    abilities: [
      activated({
        mana: "{X}{B}",
        tap: true,
        payLifeX: true,
        sorcerySpeed: true,
        effects: [fx.endure(ref.self, amount.x)],
        label: "Pay X life: endure X",
      }),
    ],
  },
  "Rot-Curse Rakshasa": {
    abilities: [
      renew(
        "{X}{B}{B}",
        [{ ...target.upTo(99, target.creature()), countX: true }],
        [fx.counters(ref.target(), "decayed")],
        "a decayed counter on each of X creatures",
      ),
    ],
  },
  "The Sibsig Ceremony": {
    abilities: [
      costReducer({ types: ["Creature"] }, 2, "Your creature spells cost {2} less"),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", cast: true }),
        [fx.destroy(ref.eventObject), fx.createTokens(ZOMBIE_DRUID)],
        { label: "A creature of yours that was cast enters: destroy it, a 2/2 Zombie Druid" },
      ),
    ],
  },
  "Sidisi, Regent of the Mire": {
    // The target (MV X + 1) is chosen when the cost is paid: reflexive ability (timing).
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [
          fx.reflexive(
            [
              {
                ...target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card with MV X + 1"),
                manaValueAmount: amount.plus(amount.manaValueOf(ref.costSacrificed), 1),
              },
            ],
            [fx.toBattlefield(ref.target())],
          ),
        ],
        label: "Sacrifice a creature with MV X: a creature with MV X + 1 returns",
      }),
    ],
  },

  // --- Red ---------------------------------------------------------------------
  Dracogenesis: {
    abilities: [
      castPermission({
        freeFrom: "any",
        freeFilter: { subtype: "Dragon" },
        label: "Dragon spells without paying their mana cost",
      }),
    ],
  },

  // --- Green -------------------------------------------------------------------
  "Formation Breaker": {
    abilities: [
      blockAbility(
        block.notBy({ compare: [cmp.power("<", amount.sourcePower)] }, "Can't be blocked by creatures with lesser power"),
      ),
      staticAbility(
        "self",
        { power: 1, toughness: 2 },
        { condition: cond.controls(CREATURE_WITH_COUNTER), label: "One of your creatures has a counter: +1/+2" },
      ),
    ],
  },

  // --- Multicolor ----------------------------------------------------------------
  "All-Out Assault": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        {
          label: "Your creatures: +1/+1 and deathtouch",
        },
      ),
      triggered(
        when.entersSelf,
        [
          fx.extraCombatAfterMain,
          fx.emblem(
            "All-Out Assault",
            "When you next attack this turn, untap each creature you control.",
            [
              triggered(when.attackWith(1), [fx.untapAll({ types: ["Creature"] })], {
                oncePerTurn: true,
                label: "Untap each creature you control",
              }),
            ],
            false,
            true,
          ),
        ],
        {
          condition: cond.all(cond.yourTurn, cond.any(cond.step("main1"), cond.step("main2"))),
          label: "During your main phase: an additional combat and main phase",
        },
      ),
    ],
  },
  "Betor, Kin to All": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.draw(1),
          ...fx.when(cond.amountAtLeast(TOTAL_TOUGHNESS, 20), fx.untapAll({ types: ["Creature"] })),
          // "each opponent loses half their life": each based on their own.
          ...fx.when(
            cond.amountAtLeast(TOTAL_TOUGHNESS, 40),
            fx.forEachPlayer(ref.eachOpponent, (p) => [fx.loseLife(amount.halfLife(p), p)]),
          ),
        ],
        {
          condition: cond.amountAtLeast(TOTAL_TOUGHNESS, 10),
          label: "Total toughness 10: draw; 20: untap; 40: each opponent loses half their life",
        },
      ),
    ],
  },
  "Call the Spirit Dragons": {
    abilities: [
      staticAbility(
        { subtype: "Dragon", controller: "you" },
        { addKeywords: ["indestructible"] },
        {
          label: "Your Dragons are indestructible",
        },
      ),
      triggered(
        when.yourUpkeep,
        [
          ...COLORS.flatMap((c) => [
            fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Dragon", colors: [c] }), ref.you, `d${c}`),
            fx.addCounters(ref.stored(`d${c}`), 1),
          ]),
          ...fx.when(cond.amountAtLeast(amount.refCount(ref.union(...COLORS.map((c) => ref.stored(`d${c}`)))), 5), fx.winGame),
        ],
        { label: "For each color, a +1/+1 counter on one of your Dragons; five Dragons: you win" },
      ),
    ],
  },
  "Eshki Dragonclaw": {
    abilities: [
      triggered(when.yourCombat, [fx.draw(1), fx.addCounters(ref.self, 2)], {
        condition: cond.all(
          cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Creature"] }), 1),
          cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", notTypes: ["Creature"] }), 1),
        ),
        label: "A creature spell and a noncreature spell this turn: draw, two +1/+1 counters",
      }),
    ],
  },
  "Felothar, Dawn of the Abzan": {
    abilities: [
      triggered(when.entersSelf, FELOTHAR, { label: "Sacrifice a nonland permanent: a +1/+1 counter on your creatures" }),
      triggered(when.attacksSelf, FELOTHAR, {
        label: "Sacrifice a nonland permanent: a +1/+1 counter on your creatures",
      }),
    ],
  },
  "Kotis, the Fangkeeper": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileTop(ref.eventPlayer, amount.eventAmount, "x"),
          fx.castNow(ref.stored("x"), { free: true, many: true, maxManaValue: amount.eventAmount }),
        ],
        { label: "Exile X cards from their library: cast those with MV X or less for free" },
      ),
    ],
  },
  "Mardu Siegebreaker": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.optional(target.creature("t", { controller: "you", other: true }))],
        label: "Exile another creature of yours for as long as it remains",
      }),
      triggered(
        when.attacksSelf,
        [fx.copyToken(ref.exiledWith, { tapped: true, attackEach: ref.eachOpponent, sacrificeAtEndStep: true })],
        { label: "For each opponent, a token copy of the exiled card, tapped and attacking them" },
      ),
    ],
  },
  "Narset, Jeskai Waymaster": {
    abilities: [
      triggered(
        when.yourEndStep,
        fx.may(
          "discard your hand to draw as many cards as spells cast this turn?",
          fx.discard(amount.cardsIn("hand")),
          fx.draw(amount.spellsCastThisTurn),
        ),
        { label: "Discard your hand: draw a card for each spell cast this turn" },
      ),
    ],
  },
  "Roar of Endless Song": {
    abilities: [
      chapter([1, 2], [fx.createTokens(ELEPHANT_5)], { label: "A 5/5 Elephant" }),
      chapter([3], [fx.doublePT(ref.permanentsOf(ref.you, { types: ["Creature"] }))], {
        label: "Double the power and toughness of your creatures",
      }),
    ],
  },
  "Shiko, Paragon of the Way": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "x" }), fx.castCopiesFree([ref.stored("x")], 3)], {
        targets: [target.cardInGraveyard("t", { notTypes: ["Land"], maxManaValue: 3 }, "you", "nonland card with MV 3 or less")],
        label: "Exile a card with MV 3 or less: cast a copy of it for free",
      }),
    ],
  },
  "Songcrafter Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.grantHarmonize(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card")],
        label: "An instant or sorcery in your graveyard gains harmonize",
      }),
    ],
  },
  "Stalwart Successor": {
    abilities: [
      triggered(when.countersPut(CREATURE_YOU_CONTROL, undefined, true), [fx.addCounters(ref.eventObject, 1)], {
        label: "First counters of the turn on one of your creatures: one more +1/+1 counter",
      }),
    ],
  },
  "Teval, Arbiter of Virtue": {
    abilities: [
      playerStatic({ spellKeywords: { filter: {}, keywords: ["delve"] }, label: "Spells you cast have delve" }),
      triggered(when.castSpell("you"), [fx.loseLife(amount.manaValueOf(ref.eventObject))], {
        label: "You lose life equal to the spell's mana value",
      }),
    ],
  },
  "Ureni, the Song Unending": {
    abilities: [
      protectionAbility(protection.from({ colors: ["W", "B"] }, "Protection from white and from black")),
      triggered(when.entersSelf, [fx.damageDivided(amount.count({ types: ["Land"], controller: "you" }), ref.target())], {
        targets: [target.upTo(99, target.creatureOrPlaneswalker("t", { controller: "opponent" }))],
        label: "X damage divided among opponents' creatures and planeswalkers (X: your lands)",
      }),
    ],
  },
  "Zurgo, Thunder's Decree": {
    // Mobilize 2: read from the text.
    abilities: [
      staticAbility(
        { subtype: "Warrior", token: true, controller: "you" },
        { addKeywords: ["cantBeSacrificed"] },
        {
          condition: cond.all(cond.yourTurn, cond.step("end")),
          label: "During your end step, your Warrior tokens can't be sacrificed",
        },
      ),
    ],
  },

  // --- Batch D: damage replacements (R1) -------------------------------------------
  "Neriv, Heart of the Storm": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { types: ["Creature"], controller: "you", enteredThisTurn: true },
        modify: { times: 2 },
        label: "Your creatures that entered this turn deal double damage",
      }),
    ],
  },
  "New Way Forward": {
    spell: spell(
      [],
      [
        fx.shield(
          {
            event: "damage",
            to: "you",
            modify: { prevent: true },
            onPrevent: { reflexive: [fx.damage(amount.eventAmount, ref.eventPlayer), fx.draw(amount.eventAmount)] },
          },
          true,
        ),
      ],
    ),
  },
};
