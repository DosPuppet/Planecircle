/** Final Fantasy — legendaries, Crystals and unique cards (lot D). */
import type { CardScript, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  cond,
  costReducer,
  doesntUntap,
  entersWith,
  eventReplacement,
  flashback,
  fx,
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
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };
const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

/** "Discard a card. If you do, draw a card" (optional). */
const rummage = () => [
  fx.may("Discard a card to draw?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1))),
];

export const LEGENDS: Record<string, CardScript> = {
  // --- White ------------------------------------------------------------------
  "Aerith Gainsborough": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
      triggered(when.diesSelf, [fx.addCountersAll({ ...YOURS, legendary: true }, amount.lkiCounters("+1/+1"))], {
        label: "Its counters on each legendary creature",
      }),
    ],
  },
  "Stiltzkin, Moogle Merchant": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          target.player("p", "opponent"),
          targetObj("t", { permanent: true, controller: "you", other: true }, "other permanent"),
        ],
        effects: [fx.giveControl(ref.target("t"), ref.target("p")), fx.draw(1)],
        label: "Give a permanent, draw",
      }),
    ],
  },
  "The Wind Crystal": {
    abilities: [
      costReducer({ colors: ["W"] }, 1, "White spells cost {1} less"),
      eventReplacement({ event: "lifeGain", to: "you", modify: { times: 2 }, label: "Life gain doubled" }),
      activated({
        mana: "{4}{W}{W}",
        tap: true,
        effects: [fx.pumpAll(YOURS, 0, 0, ["flying", "lifelink"])],
        label: "Creatures you control: flying and lifelink",
      }),
    ],
  },

  // --- Blue -------------------------------------------------------------------
  "Edgar, King of Figaro": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ types: ["Artifact"], controller: "you" }))], {
        label: "A card for each artifact",
      }),
      playerStatic({ winFirstCoinFlips: true, label: "Two-headed coin" }),
    ],
  },
  "Louisoix's Sacrifice": {
    additionalCost: {
      sacrifice: { filter: { types: ["Creature"], legendary: true }, count: 1, orPay: { generic: 2, colored: {}, x: 0 } },
    },
    spell: spell(
      [
        {
          id: "t",
          label: "activated or triggered ability, or noncreature spell",
          filter: { spells: { notTypes: ["Creature"] }, stackItems: { only: "abilities" } },
        } satisfies TargetSpec,
      ],
      [fx.counter(ref.target())],
    ),
  },
  "Swallowed by Leviathan": {
    spell: spell(
      [target.spell("t")],
      [
        fx.surveil(2),
        ...fx.unlessPays(
          ref.controllerOf(ref.target()),
          { genericAmount: amount.cardsIn("graveyard") },
          fx.counter(ref.target()),
        ),
      ],
    ),
  },
  "The Water Crystal": {
    abilities: [
      costReducer({ colors: ["U"] }, 1, "Blue spells cost {1} less"),
      eventReplacement({
        event: "mill",
        to: "opponent",
        modify: { add: 4 },
        label: "Opponents mill four additional cards",
      }),
      activated({
        mana: "{4}{U}{U}",
        tap: true,
        effects: [fx.mill(amount.cardsIn("hand"), ref.eachOpponent)],
        label: "Each opponent mills as many cards as your hand",
      }),
    ],
  },
  "Stuck in Summoner's Sanctum": {
    enchant: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, label: "artifact or creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the permanent" }),
      staticAbility("attached", { addKeywords: ["noActivatedAbilities"] }, { label: "Activated abilities can't be activated" }),
      doesntUntap("attached"),
    ],
  },

  // --- Black ------------------------------------------------------------------
  "Kain, Traitorous Dragoon": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.yourTurn, label: "Jump: has flying during your turn" },
      ),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.giveControl(ref.self, ref.eventPlayer),
          fx.draw(amount.eventAmount),
          fx.createTappedTokens(TREASURE, amount.eventAmount),
          fx.loseLife(amount.eventAmount),
        ],
        { label: "They gain control of Kain; draw, Treasures, lose life" },
      ),
    ],
  },
  "Reno and Rude": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.exileTop(ref.eventPlayer, 1, "r"),
          fx.sacrifice(ref.you, { ...CREATURE_OR_ARTIFACT, other: true }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.grantPlay(ref.stored("r"), { anyMana: true })),
        ],
        { label: "Exile their top card; sacrifice to play it" },
      ),
    ],
  },
  "Summon: Primal Odin": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Gungnir",
      }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [
                triggered(when.combatDamageToPlayer, [fx.playerLoses(ref.eventPlayer)], { label: "That player loses the game" }),
              ],
            },
            "permanent",
          ),
        ],
        { label: "Zantetsuken" },
      ),
      chapter([3], [fx.draw(2), fx.loseLife(2, ref.eachPlayer)], { label: "Hall of Sorrow" }),
    ],
  },

  // --- Red --------------------------------------------------------------------
  "Barret Wallace": {
    abilities: [
      triggered(when.attacksSelf, [fx.damage(amount.count({ ...YOURS, equipped: true }), ref.eventPlayer)], {
        label: "Damage for each equipped creature",
      }),
    ],
  },
  "The Fire Crystal": {
    abilities: [
      costReducer({ colors: ["R"] }, 1, "Red spells cost {1} less"),
      staticAbility(YOURS, { addKeywords: ["haste"] }, { label: "Creatures you control have haste" }),
      activated({
        mana: "{4}{R}{R}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.copyToken(ref.target(), { sacrificeAtEndStep: true })],
        label: "Copy until end of turn",
      }),
    ],
  },
  "Item Shopkeep": {
    abilities: [
      triggered(when.attackWith(), [fx.pump(ref.target(), 0, 0, ["menace"])], {
        targets: [target.creature("t", { attacking: true, equipped: true })],
        label: "An attacking equipped creature gains menace",
      }),
    ],
  },
  "Nibelheim Aflame": {
    castOptions: [flashback("{5}{R}{R}")],
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.damageAll(amount.powerOf(ref.target()), { types: ["Creature"] }, undefined, ref.target()),
        fx.when(cond.spellCastFromGraveyard, fx.discard(amount.cardsIn("hand")), fx.draw(4)),
      ],
    ),
  },
  "Random Encounter": {
    castOptions: [flashback("{6}{R}{R}")],
    spell: spell(
      [],
      [
        fx.shuffle(),
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          { pool: ref.stored("m"), count: 4, store: "c", prompt: "The milled creature cards" },
        ),
        fx.pump(ref.stored("c"), 0, 0, ["haste"]),
        fx.delayed([fx.toHand(ref.target("c"))], { c: ref.stored("c") }),
      ],
    ),
  },
  "Zell Dincht": {
    abilities: [
      playerStatic({ extraLands: 1, label: "An additional land" }),
      staticAbility("self", { power: 1 }, { per: { types: ["Land"], controller: "you" }, label: "+1/+0 for each land" }),
      // The land is not targeted: it is chosen on resolution.
      triggered(
        when.yourEndStep,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"] }), ref.you, "land", {
            prompt: "Choose the land to return to hand",
          }),
          fx.bounce(ref.stored("land")),
        ],
        { label: "Return a land" },
      ),
    ],
  },

  // --- Green ------------------------------------------------------------------
  "The Earth Crystal": {
    abilities: [
      costReducer({ colors: ["G"] }, 1, "Green spells cost {1} less"),
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: YOURS,
        counter: "+1/+1",
        modify: { times: 2 },
        label: "+1/+1 counters on your creatures doubled",
      }),
      activated({
        mana: "{4}{G}{G}",
        tap: true,
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        effects: [fx.countersDivided(2, ref.target())],
        label: "Distribute two +1/+1 counters",
      }),
    ],
  },
  "A Realm Reborn": {
    abilities: [
      staticAbility(
        { permanent: true, controller: "you", other: true },
        { addAbilities: [manaAbility([...ALL_COLORS])] },
        { label: '"{T}: one mana of any color"' },
      ),
    ],
  },

  // --- Multicolored -----------------------------------------------------------
  "Cid, Timeless Artificer": {
    abilities: [
      staticAbility(
        { ...YOURS, anyOf: [{ types: ["Artifact"] }, { subtype: "Hero" }] },
        { power: 1, toughness: 1 },
        { per: { subtype: "Artificer", controller: "you" }, label: "+1/+1 for each Artificer" },
      ),
      staticAbility(
        { ...YOURS, anyOf: [{ types: ["Artifact"] }, { subtype: "Hero" }] },
        { power: 1, toughness: 1 },
        { perGraveyard: { subtype: "Artificer" }, label: "+1/+1 for each Artificer card in your graveyard" },
      ),
    ],
  },
  "Golbez, Crystal Collector": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.surveil(1)], { label: "Surveil 1" }),
      triggered(
        when.yourEndStep,
        [
          fx.when(cond.controls({ types: ["Artifact"] }, 8), fx.loseLife(amount.powerOf(ref.target()), ref.eachOpponent)),
          fx.toHand(ref.target()),
        ],
        {
          condition: cond.controls({ types: ["Artifact"] }, 4),
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")],
          label: "A creature from your graveyard into your hand",
        },
      ),
    ],
  },
  "Rydia, Summoner of Mist": {
    abilities: [
      triggered(when.landfall, rummage(), { label: "Discard, then draw" }),
      activated({
        mana: "{X}",
        tap: true,
        sorcerySpeed: true,
        // "Target Saga card with mana value X": checked with the announced X, and again on resolution.
        targets: [{ ...target.cardInGraveyard("t", { subtype: "Saga" }, "you", "Saga card"), manaValueAmount: amount.x }],
        effects: [
          fx.when(
            cond.all(
              cond.amountAtLeast(amount.plus(amount.x, 1, amount.neg(amount.manaValueOf(ref.target()))), 1),
              cond.amountAtLeast(amount.plus(amount.manaValueOf(ref.target()), 1, amount.neg(amount.x)), 1),
            ),
            fx.moveTo(ref.target(), { to: "battlefield", counters: { kind: "finality", n: 1 } }, { name: "r" }),
            fx.pump(ref.stored("r"), 0, 0, ["haste"]),
          ),
        ],
        label: "Summon: a Saga from your graveyard",
      }),
    ],
  },
  "Yuna, Hope of Spira": {
    abilities: [
      staticAbility(
        { ...YOURS, anyOf: [{ self: true }, { types: ["Enchantment"] }] },
        {
          addKeywords: ["trample", "lifelink"],
          addAbilities: [wardAbility({ mana: { generic: 2, colored: {}, x: 0 } })],
        },
        { condition: cond.yourTurn, label: "Trample, lifelink and ward {2} during your turn" },
      ),
      triggered(when.yourEndStep, [fx.moveTo(ref.target(), { to: "battlefield", counters: { kind: "finality", n: 1 } })], {
        targets: [target.upTo(1, target.cardInGraveyard("t", { types: ["Enchantment"] }, "you", "enchantment card"))],
        label: "An enchantment from your graveyard",
      }),
    ],
  },

  // --- Colorless --------------------------------------------------------------
  Elixir: {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        mana: "{5}",
        tap: true,
        exileSelf: true,
        effects: [
          fx.gainLife(amount.countIn("graveyard", { notTypes: ["Land"] })),
          fx.moveAll("graveyard", ref.you, { notTypes: ["Land"] }, { to: "libraryTop" }),
          fx.shuffle(),
        ],
        label: "Shuffle the nonland cards from your graveyard",
      }),
    ],
  },
  Wastes: { abilities: [manaAbility("C")] },
};
