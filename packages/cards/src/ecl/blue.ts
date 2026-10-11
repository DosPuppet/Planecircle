/** Lorwyn Eclipsed: blue cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  beholdOrPay,
  type CardScript,
  champion,
  cond,
  ELK,
  entersWith,
  eventReplacement,
  FAERIE_UB,
  fx,
  loyalty,
  MERFOLK_WU,
  mode,
  protection,
  ref,
  spell,
  staticAbility,
  TO_PLAYER_OR_PLANESWALKER,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURE = { filter: { types: ["Creature" as const] }, label: "creature" };

/** "Whenever you cast a spell with mana value 4 or greater" (Kulrath Mystic, Tanufel Rimespeaker). */
const CAST_MV4 = when.castSpell("you", { minManaValue: 4 });

/** "Remove a counter (two counters) from this creature": of any kind. */
const removeMinus = (n: number) => ({ kind: "any", n });

/** "Until end of turn, [target creature] gains 'Whenever this creature deals combat damage to a player or planeswalker, draw a card'". */
const grantCombatDraw = fx.modify(ref.target(), {
  addAbilities: [
    triggered(when.combatDamage("self", TO_PLAYER_OR_PLANESWALKER), [fx.draw(1)], {
      label: "Combat damage to a player or planeswalker: draw a card",
    }),
  ],
});

/** "… gains protection from each color until your next turn". */
const protectionFromColors = fx.modify(
  ref.target(),
  {
    addProtections: [protection.from({ colors: ["W", "U", "B", "R", "G"] }, "Protection from each color")],
  },
  "untilYourNextTurn",
);

/** "a Merfolk you control" */
const MERFOLK_YOU = { subtype: "Merfolk", controller: "you" as const };

export const BLUE: Record<string, CardScript> = {
  Blossombind: {
    enchant: CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the enchanted creature" }),
      eventReplacement({
        event: "untap",
        toFilter: { attached: "host" },
        modify: { prevent: true },
        label: "The enchanted creature can't become untapped",
      }),
      eventReplacement({
        event: "counters",
        toFilter: { attached: "host" },
        modify: { prevent: true },
        label: "Counters can't be put on the enchanted creature",
      }),
    ],
  },
  "Swat Away": {
    // "Costs {2} less if a creature is attacking you": you, not one of your planeswalkers.
    costReduction: {
      generic: 2,
      condition: cond.amountAtLeast(amount.count({ types: ["Creature"], attacking: "you" }), 1),
    },
    spell: spell(
      [{ id: "t", label: "spell or creature", filter: { spells: {}, objects: { types: ["Creature"] } } }],
      [fx.topOrBottom(ref.target())],
    ),
  },
  "Glen Elendra's Answer": {
    rules: { cantBeCountered: true },
    spell: spell([], [fx.counter(ref.stackItemsOf(ref.eachOpponent), "n"), fx.createTokens(FAERIE_UB, amount.v("n"))]),
  },
  // Convoke read from the text.
  "Harmonized Crescendo": {
    spell: spell(
      [],
      [fx.chooseForSelf("creatureType"), fx.draw(amount.count({ permanent: true, controller: "you", chosen: "subtype" }))],
    ),
  },
  "Rimefire Torque": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(when.enters({ permanent: true, controller: "you", chosen: "subtype" }), [fx.counters(ref.self, "charge")], {
        label: "A permanent of the chosen type enters: charge counter",
      }),
      activated({
        tap: true,
        removeCounters: { kind: "charge", n: 3 },
        effects: [fx.copyNextSpell],
        label: "Copy the next instant or sorcery spell you cast this turn",
      }),
    ],
  },
  // --- Oko (double-faced planeswalker) ------------------------------------------
  "Oko, Lorwyn Liege": {
    abilities: [
      triggered(when.step("main1", "you"), fx.mayPay("{G}", "Pay {G} to transform Oko?", fx.transform()), {
        label: "You may pay {G}: transform Oko",
      }),
      loyalty(2, {
        targets: [target.upTo(1, target.creature())],
        effects: [fx.modify(ref.target(), { allCreatureTypes: true }, "permanent")],
        label: "A creature gains all creature types",
      }),
      loyalty(1, {
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { power: -2 }, "untilYourNextTurn")],
        label: "-2/-0 until your next turn",
      }),
    ],
  },
  "Oko, Shadowmoor Scion": {
    abilities: [
      triggered(when.step("main1", "you"), fx.mayPay("{U}", "Pay {U} to transform Oko?", fx.transform()), {
        label: "You may pay {U}: transform Oko",
      }),
      loyalty(-1, {
        effects: [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { pool: ref.stored("m"), min: 0 }),
        ],
        label: "Mill three cards; a permanent card among them into your hand",
      }),
      loyalty(-3, { effects: [fx.createTokens(ELK, 2)], label: "Two 3/3 Elks" }),
      loyalty(-6, {
        effects: [
          fx.chooseForSelf("creatureType"),
          fx.emblem(
            "Oko, Shadowmoor Scion",
            "Creatures you control of the chosen type get +3/+3 and have vigilance and hexproof.",
            [
              staticAbility(
                { types: ["Creature"], controller: "you", chosen: "subtype" },
                { power: 3, toughness: 3, addKeywords: ["vigilance", "hexproof"] },
                { label: "Your creatures of the chosen type: +3/+3, vigilance and hexproof" },
              ),
            ],
          ),
        ],
        label: "Choose a type: emblem +3/+3, vigilance and hexproof",
      }),
    ],
  },
  // "As an additional cost, blight 2 or pay {1}": read from the text (`kickerOrPay`).
  "Wild Unraveling": { spell: spell([target.spell()], [fx.counter(ref.target())]) },
  // --- Auras -------------------------------------------------------------------
  "Aquitect's Defenses": {
    // Flash read from the text.
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["hexproof"] })], {
        label: "The enchanted creature gains hexproof until end of turn",
      }),
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    ],
  },
  "Lofty Dreams": {
    // Convoke read from the text.
    enchant: CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["flying"] }, { label: "+2/+2 and flying" }),
    ],
  },
  "Noggle the Mind": {
    enchant: CREATURE,
    abilities: [
      staticAbility(
        "attached",
        { loseAllAbilities: true, setColors: [], setSubtypes: ["Noggle"], setPower: 1, setToughness: 1 },
        { label: "Loses all abilities; 1/1 colorless Noggle" },
      ),
    ],
  },

  // --- Creatures ---------------------------------------------------------------
  "Champions of the Shoal": champion(
    "Merfolk",
    [when.entersSelf, when.tapsSelf].map((trigger) =>
      triggered(trigger, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.upTo(1, target.creature())],
        label: "Tap up to one creature; stun counter",
      }),
    ),
  ),
  "Disruptor of Currents": {
    // Flash and convoke read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }, "other nonland permanent"))],
        label: "Return up to one other nonland permanent",
      }),
    ],
  },
  "Flitterwing Nuisance": {
    abilities: [
      entersWith({ counters: 1, counterKind: "-1/-1", label: "Enters with a -1/-1 counter" }),
      activated({
        mana: "{2}{U}",
        removeCounters: removeMinus(1),
        effects: [
          // Delayed triggered ability "this turn": an emblem that disappears at end of turn.
          fx.emblem(
            "Flitterwing Nuisance",
            msg("This turn, whenever a creature you control deals combat damage to a player or planeswalker, draw a card."),
            [
              triggered(when.combatDamage({ types: ["Creature"], controller: "you" }, TO_PLAYER_OR_PLANESWALKER), [fx.draw(1)], {
                label: "Combat damage to a player or planeswalker: draw a card",
              }),
            ],
            false,
            true,
          ),
        ],
        label: "This turn, your creatures that deal damage to a player make you draw",
      }),
    ],
  },
  "Glamer Gifter": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { setPower: 4, setToughness: 4, allCreatureTypes: true })], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Another creature has base power and toughness 4/4 and all creature types",
      }),
    ],
  },
  Glamermite: {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Tap a creature", [target.creature()], [fx.tap(ref.target())]),
          mode("Untap a creature", [target.creature()], [fx.untap(ref.target())]),
        ],
        { label: "Tap or untap a creature" },
      ),
    ],
  },
  "Glen Elendra Guardian": {
    abilities: [
      entersWith({ counters: 1, counterKind: "-1/-1", label: "Enters with a -1/-1 counter" }),
      activated({
        mana: "{1}{U}",
        removeCounters: removeMinus(1),
        targets: [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
        effects: [fx.counter(ref.target()), fx.draw(1, ref.controllerOf(ref.target()))],
        label: "Counter a noncreature spell; its controller draws",
      }),
    ],
  },
  "Gravelgill Scoundrel": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.may(
            "tap another untapped creature you control so this creature can't be blocked?",
            fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true, tapped: false }), ref.you, "tapped"),
            fx.tap(ref.stored("tapped")),
            ...fx.when(
              cond.amountAtLeast(amount.refCount(ref.stored("tapped")), 1),
              fx.modify(ref.self, { addKeywords: ["unblockable"] }),
            ),
          ),
        ],
        { label: "Tap another creature: can't be blocked this turn" },
      ),
    ],
  },
  "Illusion Spinners": {
    rules: { flashIf: cond.controls({ subtype: "Faerie" }) },
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.sourceMatches({ tapped: false }), label: "Hexproof as long as it's untapped" },
      ),
    ],
  },
  "Kulrath Mystic": {
    abilities: [
      triggered(CAST_MV4, [fx.pump(ref.self, 2, 0, ["vigilance"])], {
        label: "Spell with MV 4 or greater: +2/+0 and vigilance",
      }),
    ],
  },
  "Loch Mare": {
    abilities: [
      entersWith({ counters: 3, counterKind: "-1/-1", label: "Enters with three -1/-1 counters" }),
      activated({ mana: "{1}{U}", removeCounters: removeMinus(1), effects: [fx.draw(1)], label: "Draw a card" }),
      activated({
        mana: "{2}{U}",
        removeCounters: removeMinus(2),
        targets: [target.creature()],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun")],
        label: "Tap a creature; stun counter",
      }),
    ],
  },
  "Omni-Changeling": {
    // Changeling and convoke read from the text.
    asEnters: [fx.chooseCopy({ types: ["Creature"] }, { anyController: true, except: { addKeywords: ["changeling"] } })],
  },
  "Pestered Wellguard": {
    abilities: [
      triggered(when.tapsSelf, [fx.createTokens(FAERIE_UB)], { label: "Becomes tapped: 1/1 Faerie token with flying" }),
    ],
  },
  "Rimekin Recluse": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true }))],
        label: "Return up to one other creature",
      }),
    ],
  },
  Shinestriker: {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.colorsAmong())], {
        label: "Vivid — draw a card for each color among your permanents",
      }),
    ],
  },
  "Silvergill Mentor": {
    additionalCost: beholdOrPay("Merfolk", 2),
    abilities: [triggered(when.entersSelf, [fx.createTokens(MERFOLK_WU)], { label: "1/1 Merfolk token" })],
  },
  "Silvergill Peddler": {
    abilities: [triggered(when.tapsSelf, fx.loot(1), { label: "Becomes tapped: draw a card, then discard a card" })],
  },
  Stratosoarer: {
    // Basic landcycling read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["flying"] })], {
        targets: [target.creature()],
        label: "A creature gains flying until end of turn",
      }),
    ],
  },
  "Summit Sentinel": {
    abilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Tanufel Rimespeaker": {
    abilities: [triggered(CAST_MV4, [fx.draw(1)], { label: "Spell with MV 4 or greater: draw a card" })],
  },
  "Unwelcome Sprite": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.surveil(2)], {
        label: "Spell during an opponent's turn: surveil 2",
      }),
    ],
  },
  "Wanderwine Distracter": {
    abilities: [
      triggered(when.tapsSelf, [fx.pump(ref.target(), -3, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Becomes tapped: an opposing creature gets -3/-0",
      }),
    ],
  },

  // --- Sygg (double-faced) ---------------------------------------------------
  // "Whenever this creature enters or transforms into [this face]": `when.transformsSelf` on that face.
  "Sygg, Wanderwine Wisdom": {
    keywords: ["unblockable"],
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) =>
        triggered(w, [grantCombatDraw], {
          targets: [target.creature()],
          label: "A creature makes you draw when it deals damage to a player",
        }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{W}", "pay {W} to transform Sygg?", fx.transform()), {
        label: "Pay {W}: transform Sygg",
      }),
    ],
  },
  "Sygg, Wanderbrine Shield": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.transformsSelf, [protectionFromColors], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature you control gains protection from each color",
      }),
      triggered(when.step("main1", "you"), fx.mayPay("{U}", "pay {U} to transform Sygg?", fx.transform()), {
        label: "Pay {U}: transform Sygg",
      }),
    ],
  },

  // --- Instants and sorceries --------------------------------------------------
  Mirrorform: {
    spell: spell(
      [targetObj("t", { permanent: true, notSubtype: "Aura" }, "non-Aura permanent")],
      [fx.becomeCopy(ref.permanentsOf(ref.you, { notTypes: ["Land"] }), ref.target(), "permanent")],
    ),
  },
  "Rime Chill": {
    // Vivid: {1} less for each color among your permanents.
    costReduction: { generic: amount.colorsAmong() },
    spell: spell([target.upTo(2, target.creature())], [fx.tap(ref.target()), fx.counters(ref.target(), "stun"), fx.draw(1)]),
  },
  "Temporal Cleansing": {
    // Convoke read from the text. The owner chooses: second from the top or on the bottom.
    spell: spell([target.nonland()], [fx.topOrBottom(ref.target(), undefined, 2)]),
  },
  "Thirst for Identity": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Creature"] } })]),
  },
  "Unexpected Assistance": { spell: spell([], [fx.draw(3), fx.discard(1)]) },
  "Wanderwine Farewell": {
    // Convoke read from the text.
    spell: spell(
      [target.between(1, 2, target.nonland("t", {}, "nonland permanent"))],
      [
        fx.moveTo(ref.target(), { to: "hand" }, { name: "returned" }),
        ...fx.when(cond.controls(MERFOLK_YOU), fx.createTokens(MERFOLK_WU, amount.v("returned"))),
      ],
    ),
  },
};
