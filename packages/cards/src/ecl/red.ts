/** Lorwyn Eclipsed: red cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  beholdOrPay,
  type CardScript,
  champion,
  cond,
  entersWith,
  eventReplacement,
  fx,
  GOBLIN_BR,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  SACRIFICE_TOKEN_AT_END_STEP,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  wardAbility,
  when,
} from "./common";

const ELEMENTAL = { subtype: "Elemental" };

/** "Exile the top N cards of your library. Until the end of your next turn, you may play those cards." */
const exileTopPlayable = (n: Parameters<typeof fx.exileTop>[1], name = "x") => [
  fx.exileTop(ref.you, n, name),
  fx.grantPlay(ref.stored(name), { untilYourNextTurn: true }),
];

/** "You may blight N. If you do, …" */
const mayBlight = (n: number, ...effects: Parameters<typeof fx.when>[1][]) => [
  ...fx.may(msg("Blight {n}?", { n }), fx.blight(n, ref.you, "blighted")),
  ...fx.when(cond.v("blighted"), ...effects),
];

/**
 * "Creature with total power and toughness 5 or less": P ≤ k and T ≤ 5 − k for some k from 0 to 5 (exact for
 * nonnegative powers).
 */
const TOTAL_PT_5: { anyOf: { maxPower: number; maxToughness: number }[] } = {
  anyOf: [0, 1, 2, 3, 4, 5].map((k) => ({ maxPower: k, maxToughness: 5 - k })),
};

export const RED: Record<string, CardScript> = {
  Lavaleaper: {
    abilities: [
      staticAbility({ types: ["Creature"] }, { addKeywords: ["haste"] }, { label: "All creatures have haste" }),
      eventReplacement({
        event: "mana",
        source: { types: ["Land"], basic: true },
        modify: { add: 1 },
        label: "A basic land tapped for mana produces one more",
      }),
    ],
  },
  // --- Ashling (double-faced) ------------------------------------------------
  "Ashling, Rekindled": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) =>
        triggered(w, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
          label: "You may discard a card; if you do, draw a card",
        }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{U}", "Pay {U} to transform Ashling?", fx.transform()), {
        label: "You may pay {U}: transform Ashling",
      }),
    ],
  },
  "Ashling, Rimebound": {
    abilities: [
      // "Add two mana of any one color; spend it only on spells with MV 4 or greater" (restricted mana).
      ...[when.transformsSelf, when.step("main1", "you")].map((w) =>
        triggered(w, [fx.addManaChoice(2, undefined, { spell: { minManaValue: 4 } })], {
          label: "Two mana of any one color, for spells with MV 4 or greater",
        }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{R}", "Pay {R} to transform Ashling?", fx.transform()), {
        label: "You may pay {R}: transform Ashling",
      }),
    ],
  },
  "Goliath Daydreamer": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant", "Sorcery"] }, fromHand: true },
        [fx.exileOnResolveWith(ref.eventObject, "dream")],
        { label: "The spell will be exiled with a dream counter instead of going to the graveyard" },
      ),
      triggered(
        when.attacksSelf,
        [fx.castNow(ref.filtered(ref.exiledCardsOf(ref.you), { withCounter: "dream" }), { free: true })],
        { label: "Cast a spell exiled with a dream counter for free" },
      ),
    ],
  },
  // Flying and wither read from the text.
  "Spinerock Tyrant": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant", "Sorcery"] }, singleTarget: true },
        fx.may(
          "Copy this spell? (both spells gain wither)",
          fx.modify(ref.eventObject, { addKeywords: ["wither"] }),
          fx.copySpell(ref.eventObject, 1),
        ),
        { label: "Copy the single-target spell; both gain wither" },
      ),
    ],
  },
  "Lasting Tarfire": {
    abilities: [
      triggered(when.eachEndStep, [fx.damage(2, ref.eachOpponent)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "counters", who: "you", types: ["Creature"] }), 1),
        label: "You put a counter on a creature this turn: 2 damage to each opponent",
      }),
    ],
  },
  // Double strike read from the text; Vivid: power equal to the number of colors among your permanents.
  Squawkroaster: { cdaPower: amount.colorsAmong() },
  // "As an additional cost, blight X": read from the text (`xCost: "blight"`, X at most the greatest toughness).
  "Soul Immolation": {
    spell: spell([], [fx.damageAll(amount.x, { types: ["Creature"], controller: "opponent" }, ref.eachOpponent)]),
  },
  "Champion of the Path": champion("Elemental", [
    triggered(
      when.enters({ types: ["Creature"], subtype: "Elemental", controller: "you", other: true }),
      [fx.damage(amount.powerOf(ref.eventObject), ref.eachOpponent, ref.eventObject)],
      { label: "The Elemental deals damage equal to its power to each opponent" },
    ),
  ]),
  "Boldwyr Aggressor": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Giant", controller: "you", other: true },
        { addKeywords: ["doubleStrike"] },
        { label: "Your other Giants have double strike" },
      ),
    ],
  },
  "Boneclub Berserker": {
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        { per: { types: ["Creature"], subtype: "Goblin", controller: "you", other: true }, label: "+2/+0 for each other Goblin" },
      ),
    ],
  },
  "Boulder Dash": {
    spell: spell(
      [target.any("a"), { ...target.any("b"), otherThan: ["a"], label: "another target" }],
      [fx.damage(2, ref.target("a")), fx.damage(1, ref.target("b"))],
    ),
  },
  "Brambleback Brute": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two −1/−1 counters" }),
      // "Remove a counter from this creature": the −1/−1 counters, the only ones it usually has.
      activated({
        mana: "{1}{R}",
        removeCounters: { kind: "any", n: 1 },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })],
        label: "A creature can't block this turn",
      }),
    ],
  },
  "Burning Curiosity": {
    // Optional additional cost blight 1: read from the text ("blight" kicker).
    spell: spell([], exileTopPlayable(amount.kicked(3, 2))),
  },
  "Cinder Strike": {
    // Optional additional cost blight 1: read from the text ("blight" kicker).
    spell: spell([target.creature()], [fx.damage(amount.kicked(4, 2), ref.target())]),
  },
  "Collective Inferno": {
    // Convoke read from the text.
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you", chosen: "subtype" },
        modify: { times: 2 },
        label: "Your sources of the chosen type deal double damage",
      }),
    ],
  },
  "Elder Auntie": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(GOBLIN_BR)], { label: "A 1/1 Goblin token" })],
  },
  "End-Blaze Epiphany": {
    // "When that creature dies this turn": delayed ability on its death (603.7c).
    spell: spell(
      [target.creature()],
      [
        fx.damage(amount.x, ref.target()),
        fx.whenThisTurn(
          when.dies({}),
          ref.target(),
          [
            fx.exileTop(ref.you, amount.powerOf(ref.eventObject), "x"),
            fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true, oneOf: true }),
          ],
          { label: "Exile cards equal to its power; you may play one of them" },
        ),
      ],
    ),
  },
  "Enraged Flamecaster": {
    abilities: [
      triggered(when.castSpell("you", { minManaValue: 4 }), [fx.damage(2, ref.eachOpponent)], {
        label: "2 damage to each opponent",
      }),
    ],
  },
  "Explosive Prodigy": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.colorsAmong(), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Vivid: X damage to an opposing creature",
      }),
    ],
  },
  "Feed the Flames": {
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())]),
  },
  "Flame-Chain Mauler": {
    abilities: [activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 1, 0, ["menace"])], label: "+1/+0 and menace" })],
  },
  Flamebraider: {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 2, {
        restriction: { spell: ELEMENTAL, abilityOfSource: ELEMENTAL },
        combination: true,
      }),
    ],
  },
  "Flamekin Gildweaver": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "A Treasure" })],
  },
  Giantfall: {
    spell: modal(
      mode(
        "Your creature deals damage equal to its power to an opposing creature",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
      ),
      mode("Destroy an artifact", [target.permanent("c", ["Artifact"], {}, "artifact")], [fx.destroy(ref.target("c"))]),
    ),
  },
  Goatnap: {
    spell: spell(
      [target.creature()],
      [
        fx.gainControl(ref.target()),
        fx.untap(ref.target()),
        fx.pump(ref.target(), 0, 0, ["haste"]),
        ...fx.when(cond.targetMatches("t", { subtype: "Goat" }), fx.pump(ref.target(), 3, 0)),
      ],
    ),
  },
  "Gristle Glutton": {
    abilities: [
      activated({
        tap: true,
        blight: 1,
        effects: [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        label: "Discard a card, then draw",
      }),
    ],
  },
  "Hexing Squelcher": {
    // Its own ward ("Pay 2 life") is read from the text.
    cantBeCountered: true,
    abilities: [
      playerStatic({ uncounterable: {}, label: "Your spells can't be countered" }),
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { addKeywords: ["ward"], addAbilities: [wardAbility({ life: 2 })] },
        { label: 'Your other creatures have "Ward—Pay 2 life"' },
      ),
    ],
  },
  "Impolite Entrance": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["trample", "haste"]), fx.draw(1)]),
  },
  "Kindle the Inner Flame": {
    // Flashback—{1}{R}, behold three Elementals (your Elementals and the Elemental cards in your hand, revealed;
    // PLAN-L L5).
    flashback: "{1}{R}",
    flashbackCost: { behold: { filter: ELEMENTAL, required: true, count: 3 } },
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.copyToken(ref.target(), { addKeywords: ["haste"], addAbilities: [SACRIFICE_TOKEN_AT_END_STEP] })],
    ),
  },
  "Kulrath Zealot": {
    // Basic landcycling read from the text.
    abilities: [
      triggered(when.entersSelf, exileTopPlayable(1), {
        label: "Exile the top card; playable until the end of your next turn",
      }),
    ],
  },
  "Meek Attack": {
    abilities: [
      activated({
        mana: "{1}{R}",
        effects: [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"], ...TOTAL_PT_5 },
            { to: "battlefield" },
            { min: 0, store: "m", prompt: "Creature with total power and toughness 5 or less" },
          ),
          fx.modify(ref.stored("m"), { addKeywords: ["haste"] }, "permanent"),
          fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("m") }),
        ],
        label: "Put a small creature from your hand onto the battlefield",
      }),
    ],
  },
  "Reckless Ransacking": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 2), fx.createTokens(TREASURE)]),
  },
  "Scuzzback Scrounger": {
    abilities: [
      triggered(when.step("main1", "you"), mayBlight(1, fx.createTokens(TREASURE)), {
        label: "Blight 1: a Treasure",
      }),
    ],
  },
  "Sizzling Changeling": {
    abilities: [
      triggered(when.diesSelf, exileTopPlayable(1), {
        label: "Exile the top card; playable until the end of your next turn",
      }),
    ],
  },
  "Soulbright Seeker": {
    additionalCost: beholdOrPay("Elemental", 2),
    abilities: [
      activated({
        mana: "{R}",
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.pump(ref.target(), 0, 0, ["trample"]),
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))), fx.addMana("R", "R", "R", "R")),
        ],
        label: "Trample; on the third resolution this turn, {R}{R}{R}{R}",
      }),
    ],
  },
  "Sourbread Auntie": {
    abilities: [
      triggered(when.entersSelf, mayBlight(2, fx.createTokens(GOBLIN_BR, 2)), {
        label: "Blight 2: two 1/1 Goblin tokens",
      }),
    ],
  },
  "Sting-Slinger": {
    abilities: [
      activated({
        mana: "{1}{R}",
        tap: true,
        blight: 1,
        effects: [fx.damage(2, ref.eachOpponent)],
        label: "2 damage to each opponent",
      }),
    ],
  },
  Tweeze: {
    spell: spell(
      [target.any()],
      [fx.damage(3, ref.target()), fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
    ),
  },
  "Warren Torchmaster": {
    abilities: [
      triggered(when.yourCombat, mayBlight(1, fx.reflexive([target.creature()], [fx.pump(ref.target(), 0, 0, ["haste"])])), {
        label: "Blight 1: a creature gains haste",
      }),
    ],
  },
};
