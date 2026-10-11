/** Lorwyn Eclipsed: white cards. */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  beholdOrPay,
  type CardScript,
  champion,
  cond,
  entersWith,
  fx,
  KITHKIN,
  loyalty,
  manaAbility,
  modal,
  mode,
  playerStatic,
  powerFor,
  ref,
  SHAPESHIFTER,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const ENCHANT_CREATURE = { filter: { types: ["Creature" as const] }, label: "creature" };
/** "Another untapped Merfolk you control" (Meanders Guide). */
const OTHER_UNTAPPED_MERFOLK: ObjectFilter = { subtype: "Merfolk", controller: "you", other: true, tapped: false };

/**
 * Granted persist (702.79): "when it dies, if it had no −1/−1 counters on it, return it to the battlefield under its
 * owner's control with a −1/−1 counter on it" (counters read from its last known information).
 */
const PERSIST = triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { counters: { kind: "-1/-1", n: 1 } })], {
  condition: cond.not(cond.amountAtLeast(amount.lkiCounters("-1/-1"), 1)),
  label: "Persist",
});

/** "[cost], remove a counter from this creature: …": a counter of any kind. */
const removeACounter = (opts: Omit<Parameters<typeof activated>[0], "removeCounters">) => [
  activated({ ...opts, removeCounters: { kind: "any", n: 1 } }),
];

export const WHITE: Record<string, CardScript> = {
  // Convoke read from the text.
  Winnowing: {
    spell: spell([], [fx.keep(ref.eachPlayer, "sharesType", { types: ["Creature"] }, { chooser: "you" })]),
  },
  Kinbinding: {
    abilities: [
      staticAbility(
        YOUR_CREATURES,
        { power: 1, toughness: 1 },
        {
          perAmount: amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }),
          label: "Your creatures: +X/+X, where X is the number of creatures that entered under your control this turn",
        },
      ),
      triggered(when.yourCombat, [fx.createTokens(KITHKIN)], { label: "A 1/1 Kithkin token" }),
    ],
  },
  "Adept Watershaper": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, other: true, tapped: true },
        { addKeywords: ["indestructible"] },
        { label: "Your other tapped creatures are indestructible" },
      ),
    ],
  },
  "Ajani, Outland Chaperone": {
    abilities: [
      loyalty(1, { effects: [fx.createTokens(KITHKIN)], label: "1/1 Kithkin" }),
      loyalty(-2, {
        targets: [target.creature("t", { tapped: true })],
        effects: [fx.damage(4, ref.target())],
        label: "4 damage to a tapped creature",
      }),
      loyalty(-8, {
        effects: [
          fx.lookAtTop(amount.lifeTotal, {
            filter: { permanent: true, notTypes: ["Land"] },
            maxManaValue: 3,
            count: amount.lifeTotal,
            to: { to: "battlefield" },
          }),
          fx.shuffle(),
        ],
        label: "Nonland permanents with MV 3 or less among the top X cards",
      }),
    ],
  },
  // Convoke read from the text.
  "Appeal to Eirdu": { spell: spell([target.between(1, 2, target.creature())], [fx.pump(ref.target(), 2, 1)]) },
  "Bark of Doran": {
    // Equip {1}: read from the text.
    abilities: [
      staticAbility("attached", { toughness: 1 }, { label: "+0/+1" }),
      staticAbility("attached", { addPowerRules: [powerFor.combatToughness] }, { label: powerFor.combatToughness.label }),
    ],
  },
  // Double-faced: "when it enters or transforms into Brigid, Clachan's Heart" (`when.transformsSelf`).
  "Brigid, Clachan's Heart": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) => triggered(w, [fx.createTokens(KITHKIN)], { label: "1/1 Kithkin" })),
      triggered(when.step("main1", "you"), fx.mayPay("{G}", "Pay {G} to transform Brigid?", fx.transform()), {
        label: "Pay {G}: transform Brigid",
      }),
    ],
  },
  "Brigid, Doun's Mind": {
    abilities: [
      manaAbility(["G", "W"], 1, { per: { ...YOUR_CREATURES, other: true } }),
      triggered(when.step("main1", "you"), fx.mayPay("{W}", "Pay {W} to transform Brigid?", fx.transform()), {
        label: "Pay {W}: transform Brigid",
      }),
    ],
  },
  "Burdened Stoneback": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      ...removeACounter({
        mana: "{1}{W}",
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
        label: "A creature gains indestructible",
      }),
    ],
  },
  // Flash read from the text.
  "Champion of the Clachan": champion("Kithkin", [
    staticAbility({ ...YOUR_CREATURES, subtype: "Kithkin", other: true }, { power: 1, toughness: 1 }, { label: "Kithkin +1/+1" }),
  ]),
  "Clachan Festival": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KITHKIN, 2)], { label: "Two 1/1 Kithkin" }),
      activated({ mana: "{4}{W}", effects: [fx.createTokens(KITHKIN)], label: "1/1 Kithkin" }),
    ],
  },
  // Changeling read from the text.
  "Crib Swap": {
    spell: spell([target.creature()], [fx.exile(ref.target()), fx.createTokens(SHAPESHIFTER, 1, ref.controllerOf(ref.target()))]),
  },
  "Curious Colossus": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(
            ref.permanentsOf(ref.target(), { types: ["Creature"] }),
            { loseAllAbilities: true, addSubtypes: ["Coward"], setPower: 1, setToughness: 1 },
            "permanent",
          ),
        ],
        { targets: [target.player("t", "opponent")], label: "Opposing creatures become 1/1 Cowards with no abilities" },
      ),
    ],
  },
  // Flying and lifelink read from the text.
  "Eirdu, Carrier of Dawn": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["convoke"] },
        label: "Your creature spells have convoke",
      }),
      triggered(when.step("main1", "you"), fx.mayPay("{B}", "Pay {B} to transform Eirdu?", fx.transform()), {
        label: "Pay {B}: transform Eirdu",
      }),
    ],
  },
  "Isilu, Carrier of Twilight": {
    abilities: [
      staticAbility(
        { ...YOUR_CREATURES, other: true, token: false },
        { addAbilities: [PERSIST] },
        { label: "Your other nontoken creatures have persist" },
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{W}", "Pay {W} to transform Isilu?", fx.transform()), {
        label: "Pay {W}: transform Isilu",
      }),
    ],
  },
  "Encumbered Reejerey": {
    abilities: [
      entersWith({ counters: 3, counterKind: "-1/-1", label: "Enters with three -1/-1 counters" }),
      triggered(when.tapsSelf, [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.counterAtLeast("-1/-1", 1),
        label: "Becomes tapped: remove a -1/-1 counter",
      }),
    ],
  },
  "Evershrike's Gift": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { power: 1, addKeywords: ["flying"] }, { label: "+1/+0 and flying" }),
      activated({
        mana: "{1}{W}",
        blight: 2,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Returns from the graveyard to your hand",
      }),
    ],
  },
  "Flock Impostor": {
    // Changeling, flash and flying read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
        label: "Return another creature you control to your hand",
      }),
    ],
  },
  "Gallant Fowlknight": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pumpAll(YOUR_CREATURES, 1, 0),
          fx.modifyAll({ ...YOUR_CREATURES, subtype: "Kithkin" }, { addKeywords: ["firstStrike"] }),
        ],
        { label: "Your creatures +1/+0, your Kithkin first strike" },
      ),
    ],
  },
  "Goldmeadow Nomad": {
    abilities: [
      activated({
        mana: "{W}",
        exileSelf: true,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(KITHKIN)],
        label: "Exiled from the graveyard: 1/1 Kithkin",
      }),
    ],
  },
  "Keep Out": {
    spell: modal(
      mode("4 damage to a tapped creature", [target.creature("c", { tapped: true })], [fx.damage(4, ref.target("c"))]),
      mode("Destroy an enchantment", [target.permanent("e", ["Enchantment"])], [fx.destroy(ref.target("e"))]),
    ),
  },
  "Kinsbaile Aspirant": {
    additionalCost: beholdOrPay("Kithkin", 2),
    abilities: [
      triggered(when.enters({ ...YOUR_CREATURES, other: true }), [fx.pump(ref.self, 1, 1)], {
        label: "Another creature enters: +1/+1",
      }),
    ],
  },
  "Kinscaer Sentry": {
    // First strike and lifelink read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"] },
            { to: "battlefield", tapped: true, attacking: true },
            {
              min: 0,
              maxManaValue: amount.count({ ...YOUR_CREATURES, attacking: true }),
              prompt: "Creature from your hand to put onto the battlefield tapped and attacking",
            },
          ),
        ],
        { label: "A creature from your hand enters tapped and attacking" },
      ),
    ],
  },
  Kithkeeper: {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KITHKIN, amount.colorsAmong())], {
        label: "Vivid — a 1/1 Kithkin for each color among your permanents",
      }),
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 3, includeSelf: true },
        effects: [fx.pump(ref.self, 3, 0, ["flying"])],
        label: "+3/+0 and flying",
      }),
    ],
  },
  "Liminal Hold": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.gainLife(2)], {
        targets: [target.upTo(1, target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls"))],
        label: "Exile an opposing permanent; you gain 2 life",
      }),
    ],
  },
  "Meanders Guide": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.when(
          cond.controls(OTHER_UNTAPPED_MERFOLK),
          fx.may(
            "Tap another untapped Merfolk to return a creature from your graveyard?",
            fx.chooseAmong(ref.permanentsOf(ref.you, OTHER_UNTAPPED_MERFOLK), ref.you, "m"),
            fx.tap(ref.stored("m")),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with MV 3 or less")],
              [fx.toBattlefield(ref.target())],
            ),
          ),
        ),
        { label: "Tap a Merfolk: a creature returns from the graveyard" },
      ),
    ],
  },
  "Moonlit Lamenter": {
    abilities: [
      entersWith({ counters: 1, counterKind: "-1/-1", label: "Enters with a -1/-1 counter" }),
      ...removeACounter({ mana: "{1}{W}", sorcerySpeed: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Morningtide's Light": {
    rules: { exileOnResolve: true },
    spell: spell(
      [target.upTo(99, target.creature())],
      [
        fx.exileCard(ref.target(), { name: "x" }),
        fx.delayed([fx.toBattlefield(ref.target("x"), { tapped: true })], { x: ref.stored("x") }),
        fx.untilYourNextTurn({ replacement: { event: "damage", to: "you", modify: { prevent: true } } }),
      ],
    ),
  },
  Personify: {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f")), fx.createTokens(SHAPESHIFTER)],
    ),
  },
  // Convoke read from the text.
  "Protective Response": {
    spell: spell([target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })], [fx.destroy(ref.target())]),
  },
  "Reluctant Dounguard": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      triggered(when.enters({ ...YOUR_CREATURES, other: true }), [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.counterAtLeast("-1/-1", 1),
        label: "Another creature enters: removes a -1/-1 counter",
      }),
    ],
  },
  "Rhys, the Evermore": {
    // Flash read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addAbilities: [PERSIST] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature you control gains persist",
      }),
      activated({
        mana: "{W}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        // "Remove any number of counters": all its −1/−1 counters.
        effects: [fx.removeCounters(ref.target(), 99, "-1/-1")],
        label: "Remove the -1/-1 counters from one of your creatures",
      }),
    ],
  },
  "Riverguard's Reflexes": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["firstStrike"]), fx.untap(ref.target())]),
  },
  "Shore Lurker": { abilities: [triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" })] },
  "Slumbering Walker": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      triggered(
        when.yourEndStep,
        fx.may(
          "Remove a counter from this creature?",
          fx.removeCounters(ref.self, 1, undefined, "r"),
          fx.when(
            cond.v("r"),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"], maxPower: 2 }, "you", "creature card with power 2 or less")],
              [fx.toBattlefield(ref.target())],
            ),
          ),
        ),
        { label: "Remove a counter: a creature returns from the graveyard" },
      ),
    ],
  },
  "Spiral into Solitude": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Can't attack or block" }),
      activated({
        mana: "{1}{W}",
        blight: 1,
        sacrifice: true,
        effects: [fx.exile(ref.attached)],
        label: "Exile the enchanted creature",
      }),
    ],
  },
  "Thoughtweft Imbuer": {
    abilities: [
      triggered(
        when.attacksAlone(YOUR_CREATURES),
        [
          fx.pump(
            ref.eventObject,
            amount.count({ subtype: "Kithkin", controller: "you" }),
            amount.count({ subtype: "Kithkin", controller: "you" }),
          ),
        ],
        { label: "Attacks alone: +X/+X (Kithkin)" },
      ),
    ],
  },
  "Timid Shieldbearer": {
    abilities: [activated({ mana: "{4}{W}", effects: [fx.pumpAll(YOUR_CREATURES, 1, 1)], label: "Your creatures +1/+1" })],
  },
  "Tributary Vaulter": {
    // Flying read from the text.
    abilities: [
      triggered(when.tapsSelf, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.creature("t", { subtype: "Merfolk", controller: "you", other: true })],
        label: "Becomes tapped: another Merfolk +2/+0",
      }),
    ],
  },
  "Wanderbrine Preacher": {
    abilities: [triggered(when.tapsSelf, [fx.gainLife(2)], { label: "Becomes tapped: you gain 2 life" })],
  },
  "Wanderbrine Trapper": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        tapOthers: { filter: { types: ["Creature"] }, count: 1 },
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.tap(ref.target())],
        label: "Tap an opposing creature",
      }),
    ],
  },
};
