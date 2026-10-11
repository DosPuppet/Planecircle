/** Lorwyn Eclipsed: green cards. */
import type { Condition, Effect, ObjectFilter, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  beholdOrPay,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  champion,
  cmp,
  cond,
  ELF_BG,
  entersWith,
  eventReplacement,
  fx,
  MUTAVAULT,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREEFOLK_REACH,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

/** Vivid: the number of colors among permanents you control. */
const VIVID = amount.colorsAmong();
const ELF_CARD: ObjectFilter = { subtype: "Elf" };
/** "if there is an Elf card in your graveyard" */
const ELF_IN_GRAVEYARD: Condition = cond.amountAtLeast(amount.countIn("graveyard", ELF_CARD), 1);
const ANOTHER_CREATURE_YOU_CONTROL: ObjectFilter = { ...CREATURE_YOU_CONTROL, other: true };
const ELF_YOU_CONTROL: ObjectFilter = { ...CREATURE_YOU_CONTROL, subtype: "Elf" };

/** Creatures that entered under your control this turn (turn log, including tokens and creatures that have left since). */
const CREATURES_ENTERED = amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" });
/** "if a creature entered the battlefield under your control this turn" */
const CREATURE_ENTERED: Condition = cond.amountAtLeast(CREATURES_ENTERED, 1);
/** "as long as another creature entered the battlefield under your control this turn" */
const ANOTHER_CREATURE_ENTERED: Condition = cond.any(
  cond.amountAtLeast(CREATURES_ENTERED, 2),
  cond.all(cond.not(cond.sourceMatches({ enteredThisTurn: true })), cond.amountAtLeast(CREATURES_ENTERED, 1)),
);

/** "another target permanent" */
const ANOTHER_PERMANENT: TargetSpec = targetObj("t", { other: true }, "other permanent");

/** Aurora Awakener: "reveal cards until you reveal X permanent cards. Put any number of those permanent cards onto the
 * battlefield". */
const AURORA_REVEAL: Effect[] = [
  fx.revealUntilN({ permanent: true }, VIVID, { to: "battlefield" }, undefined, undefined, { anyNumber: true }),
];

/** Trystan, Callous Cultivator: "mill three cards; then if there is an Elf card in your graveyard, 2 life". */
const TRYSTAN_CULTIVATOR: Effect[] = [fx.mill(3), ...fx.when(ELF_IN_GRAVEYARD, fx.gainLife(2))];
/** Trystan, Penitent Culler: "mill three cards, then you may exile an Elf card from your graveyard; …". */
const TRYSTAN_CULLER: Effect[] = [
  fx.mill(3),
  fx.pickFromZone(
    "graveyard",
    ELF_CARD,
    { to: "exile" },
    { count: 1, min: 0, store: "x", prompt: "You may exile an Elf card from your graveyard" },
  ),
  ...fx.when(cond.v("x"), fx.loseLife(2, ref.eachOpponent)),
];

/** Spry and Mighty: X is the difference between the powers of the two chosen creatures. */
const SPRY_X = amount.max(
  amount.plus(amount.powerOf(ref.stored("a")), amount.neg(amount.powerOf(ref.stored("b")))),
  amount.plus(amount.powerOf(ref.stored("b")), amount.neg(amount.powerOf(ref.stored("a")))),
);

export const GREEN: Record<string, CardScript> = {
  "Shimmerwilds Growth": {
    enchant: { filter: { types: ["Land"] }, label: "land" },
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      staticAbility("attached", { setColorsChosen: true }, { label: "The enchanted land is the chosen color" }),
      eventReplacement({
        event: "mana",
        source: { attached: "host" },
        extraMana: "chosen",
        modify: { add: 1 },
        label: "Enchanted land tapped for mana: one additional mana of the chosen color",
      }),
    ],
  },
  "Celestial Reunion": {
    // "As an additional cost, you may choose a creature type and behold two creatures of that type" (PLAN-M M10a): the
    // type is chosen with the cost and noted on the spell. The card found is held (revealed), then routed.
    additionalCost: { behold: { filter: { types: ["Creature"] }, count: 2, ofChosenType: true } },
    spell: spell(
      [],
      [
        fx.searchHold({ types: ["Creature"], compare: [cmp.manaValue("<=", amount.x)] }, "f", 1, { reveal: true }),
        ...fx.ifElse(
          cond.all(cond.beheld, cond.refMatches(ref.stored("f"), { chosen: "subtype" })),
          [fx.toBattlefield(ref.stored("f"))],
          [fx.toHand(ref.stored("f"))],
        ),
        fx.shuffle(ref.you),
      ],
    ),
  },
  // Flash and convoke read from the text.
  "Selfless Safewright": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.chooseForSelf("creatureType"),
          fx.modifyAll(
            { permanent: true, controller: "you", other: true, chosen: "subtype" },
            { addKeywords: ["hexproof", "indestructible"] },
          ),
        ],
        { label: "Choose a type: your other permanents of that type gain hexproof and indestructible" },
      ),
    ],
  },
  "Champions of the Perfect": champion("Elf", [
    triggered(when.castSpell("you", { types: ["Creature"] }), [fx.draw(1)], { label: "Draw a card" }),
  ]),
  "Assert Perfection": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), 1, 0), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Aurora Awakener": {
    abilities: [
      triggered(when.entersSelf, AURORA_REVEAL, {
        label: "Vivid — reveal until X permanent cards, put any number of them onto the battlefield",
      }),
    ],
  },
  "Bloom Tender": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.addManaColorsAmong({ permanent: true, controller: "you" })],
        label: "Vivid — one mana of each color among your permanents",
      }),
    ],
  },
  "Blossoming Defense": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 2, 2, ["hexproof"])]),
  },
  "Bristlebane Battler": {
    abilities: [
      entersWith({ counters: 5, counterKind: "-1/-1", label: "Enters with five -1/-1 counters" }),
      triggered(when.enters(ANOTHER_CREATURE_YOU_CONTROL), [fx.removeCounters(ref.self, 1, "-1/-1")], {
        condition: cond.counterAtLeast("-1/-1", 1),
        label: "Another creature enters: remove a -1/-1 counter",
      }),
    ],
  },
  "Bristlebane Outrider": {
    abilities: [
      blockAbility(block.notByPowerLE2),
      staticAbility(
        "self",
        { power: 2 },
        { condition: ANOTHER_CREATURE_ENTERED, label: "+2/+0 if another creature entered under your control this turn" },
      ),
    ],
  },
  "Chomping Changeling": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"))],
        label: "Destroy up to one artifact or enchantment",
      }),
    ],
  },
  "Crossroads Watcher": {
    abilities: [
      triggered(when.enters(ANOTHER_CREATURE_YOU_CONTROL), [fx.pump(ref.self, 1, 0)], {
        label: "Another creature enters: +1/+0",
      }),
    ],
  },
  "Dundoolin Weaver": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        condition: cond.controls(CREATURE_YOU_CONTROL, 3),
        targets: [target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard")],
        label: "Three or more creatures: a permanent card returns to your hand",
      }),
    ],
  },
  "Formidable Speaker": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.search({ types: ["Creature"] }))],
        { label: "You may discard a card: search for a creature card" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        targets: [ANOTHER_PERMANENT],
        effects: [fx.untap(ref.target())],
        label: "Untap another permanent",
      }),
    ],
  },
  "Gilt-Leaf's Embrace": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["trample", "indestructible"] })], {
        label: "Trample and indestructible until end of turn",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },
  "Great Forest Druid": { abilities: [manaAbility(["W", "U", "B", "R", "G"])] },
  Luminollusk: {
    abilities: [triggered(when.entersSelf, [fx.gainLife(VIVID)], { label: "Vivid — gain X life" })],
  },
  "Lys Alana Dignitary": {
    additionalCost: beholdOrPay("Elf", 2),
    abilities: [manaAbility("G", 2, { condition: ELF_IN_GRAVEYARD })],
  },
  "Lys Alana Informant": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "Surveil 1" }),
    ],
  },
  "Midnight Tilling": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          { count: 1, min: 0, pool: ref.stored("m"), prompt: "You may take back a milled permanent card" },
        ),
      ],
    ),
  },
  "Mistmeadow Council": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Kithkin" }) },
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Moon-Vigil Adherents": {
    abilities: [
      staticAbility("self", { power: 1, toughness: 1 }, { per: CREATURE_YOU_CONTROL, label: "+1/+1 for each creature" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { perGraveyard: { types: ["Creature"] }, label: "+1/+1 for each creature card in your graveyard" },
      ),
    ],
  },
  "Morcant's Eyes": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveil 1" }),
      activated({
        mana: "{4}{G}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(ELF_BG, amount.countIn("graveyard", ELF_CARD))],
        label: "A 2/2 Elf for each Elf card in your graveyard",
      }),
    ],
  },
  "Mutable Explorer": {
    abilities: [triggered(when.entersSelf, [fx.createTappedTokens(MUTAVAULT)], { label: "Tapped Mutavault token" })],
  },
  "Pitiless Fists": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.attached, ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        label: "The enchanted creature fights an opposing creature",
      }),
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
    ],
  },
  Prismabasher: {
    abilities: [
      // "up to X target creatures": X is evaluated on targeting (`countAmount`).
      triggered(when.entersSelf, [fx.pump(ref.target(), VIVID, VIVID)], {
        targets: [{ ...target.upTo(1, target.creature("t", { controller: "you" })), countAmount: VIVID }],
        label: "Vivid — up to X creatures get +X/+X",
      }),
    ],
  },
  "Prismatic Undercurrents": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND, { to: "hand" }, VIVID)], {
        label: "Vivid — up to X basic land cards into your hand",
      }),
      playerStatic({ extraLands: 1, label: "An additional land on each of your turns" }),
    ],
  },
  "Pummeler for Hire": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(amount.maxPower({ types: ["Creature"], subtype: "Giant", controller: "you" }))], {
        label: "Gain X life (greatest power among your Giants)",
      }),
    ],
  },
  "Safewright Cavalry": {
    abilities: [
      blockAbility(block.atMost(1)),
      activated({
        mana: "{5}",
        targets: [target.creature("t", { subtype: "Elf", controller: "you" })],
        effects: [fx.pump(ref.target(), 2, 2)],
        label: "An Elf you control gets +2/+2",
      }),
    ],
  },
  "Spry and Mighty": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.controls(CREATURE_YOU_CONTROL, 2),
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "a"),
          fx.chooseAmong(ref.stored("aRest"), ref.you, "b"),
          fx.draw(SPRY_X),
          fx.pump(ref.union(ref.stored("a"), ref.stored("b")), SPRY_X, SPRY_X, ["trample"]),
        ),
      ],
    ),
  },
  "Surly Farrier": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.pump(ref.target(), 1, 1, ["vigilance"])],
        label: "+1/+1 and vigilance",
      }),
    ],
  },
  "Tend the Sprigs": {
    spell: spell(
      [],
      [
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }),
        ...fx.when(cond.controls({ anyOf: [{ types: ["Land"] }, { subtype: "Treefolk" }] }, 7), fx.createTokens(TREEFOLK_REACH)),
      ],
    ),
  },
  "Thoughtweft Charge": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3), ...fx.when(CREATURE_ENTERED, fx.draw(1))]),
  },
  // Double-faced: the trigger "when it transforms into [the other face]" is resolved with the ability that transforms
  // it (the only way to transform it), without using the stack.
  "Trystan, Callous Cultivator": {
    abilities: [
      ...[when.entersSelf, when.transformsSelf].map((w) =>
        triggered(w, TRYSTAN_CULTIVATOR, { label: "Mill three cards; Elf in graveyard: 2 life" }),
      ),
      triggered(when.step("main1", "you"), fx.mayPay("{B}", "Pay {B} to transform Trystan?", fx.transform()), {
        label: "You may pay {B}: transform Trystan",
      }),
    ],
  },
  "Trystan, Penitent Culler": {
    abilities: [
      triggered(when.transformsSelf, TRYSTAN_CULLER, {
        label: "Mill three cards; exile an Elf from your graveyard: each opponent loses 2 life",
      }),
      triggered(when.step("main1", "you"), fx.mayPay("{G}", "Pay {G} to transform Trystan?", fx.transform()), {
        label: "You may pay {G}: transform Trystan",
      }),
    ],
  },
  "Unforgiving Aim": {
    spell: modal(
      mode("Destroy a creature with flying", [target.creature("t", { keyword: "flying" })], [fx.destroy(ref.target())]),
      mode("Destroy an enchantment", [target.permanent("t", ["Enchantment"], {}, "enchantment")], [fx.destroy(ref.target())]),
      mode("Create a 2/2 Elf token", [], [fx.createTokens(ELF_BG)]),
    ),
  },
  "Vinebred Brawler": {
    keywords: ["mustBeBlocked"],
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 2, 1)], {
        targets: [target.creature("t", { ...ELF_YOU_CONTROL, other: true })],
        label: "Another Elf gets +2/+1",
      }),
    ],
  },
  "Virulent Emissary": {
    abilities: [
      triggered(when.enters(ANOTHER_CREATURE_YOU_CONTROL), [fx.gainLife(1)], {
        label: "Another creature enters: 1 life",
      }),
    ],
  },
  "Wildvine Pummeler": {
    // Vivid: {1} less for each color among your permanents.
    costReduction: { generic: VIVID },
  },
};
