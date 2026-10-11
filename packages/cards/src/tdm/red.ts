/** Tarkir: Dragonstorm — red cards. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  DRAGON_CARD,
  devotee,
  dragonstorm,
  flurry,
  fx,
  GOBLIN,
  MONK,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  WARRIOR_R,
  when,
} from "./common";

const NONCREATURE_ARTIFACT = target.permanent("a", ["Artifact"], { notTypes: ["Creature"] }, "noncreature artifact");

export const RED: Record<string, CardScript> = {
  "Breaching Dragonstorm": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileUntil({ notTypes: ["Land"] }, "x"),
          // Mana value 9 or greater: to hand; otherwise it may be cast without paying, and it goes to hand if declined.
          fx.toHand(ref.filtered(ref.stored("x"), { minManaValue: 9 })),
          fx.castNow(ref.filtered(ref.stored("x"), { maxManaValue: 8 }), { free: true, storeRest: "r" }),
          fx.toHand(ref.stored("r")),
        ],
        { label: "Exile until a nonland card: cast it for free (MV 8 or less) or take it" },
      ),
      dragonstorm(),
    ],
  },
  "Fire-Rim Form": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.attached, { addKeywords: ["firstStrike"] })], {
        label: "The enchanted creature gains first strike",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },
  "Fleeting Effigy": {
    abilities: [
      triggered(when.yourEndStep, [fx.bounce(ref.self)], { label: "Returns to its owner's hand" }),
      activated({ mana: "{2}{R}", effects: [fx.pump(ref.self, 2, 0)], label: "+2/+0" }),
    ],
  },
  "Iridescent Tiger": {
    abilities: [
      triggered(when.entersSelf, [fx.addMana("W", "U", "B", "R", "G")], {
        condition: cond.wasCast,
        label: "If you cast it: add {W}{U}{B}{R}{G}",
      }),
    ],
  },
  "Meticulous Artisan": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "A Treasure" })],
  },
  "Molten Exhale": {
    // "As though it had flash if you behold a Dragon as an additional cost": cast that way, beholding is required.
    rules: { flashIf: cond.behold(DRAGON_CARD) },
    additionalCost: { behold: { filter: DRAGON_CARD } },
    spell: spell([target.creatureOrPlaneswalker()], [fx.damage(4, ref.target())]),
  },
  "Narset's Rebuke": {
    spell: spell([target.creature()], [fx.damage(5, ref.target()), fx.addMana("U", "R", "W"), fx.exileIfDies(ref.target())]),
  },
  "Overwhelming Surge": {
    // "Choose one or both."
    spell: modal(
      mode("3 damage to a creature", [target.creature()], [fx.damage(3, ref.target())]),
      mode("Destroy a noncreature artifact", [NONCREATURE_ARTIFACT], [fx.destroy(ref.target("a"))]),
      mode("Both", [target.creature(), NONCREATURE_ARTIFACT], [fx.damage(3, ref.target()), fx.destroy(ref.target("a"))]),
    ),
  },
  "Rescue Leopard": {
    abilities: [
      triggered(when.tapsSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))], {
        label: "You may discard a card; if you do, draw",
      }),
    ],
  },
  "Reverberating Summons": {
    abilities: [
      triggered(
        when.step("beginCombat", "any"),
        [
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Monk"],
            setPower: 3,
            setToughness: 3,
            addKeywords: ["haste"],
          }),
        ],
        { condition: cond.castThisTurn(2), label: "Two spells cast this turn: becomes a 3/3 Monk with haste" },
      ),
      activated({
        mana: "{1}{R}",
        sacrifice: true,
        discardHand: true,
        effects: [fx.draw(2)],
        label: "Discard your hand, sacrifice it: draw two cards",
      }),
    ],
  },
  "Seize Opportunity": {
    spell: modal(
      mode(
        "Exile two cards, playable until the end of your next turn",
        [],
        [fx.exileTop(ref.you, 2, "x"), fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true })],
      ),
      mode("Up to two creatures get +2/+1", [target.upTo(2, target.creature("p"))], [fx.pump(ref.target("p"), 2, 1)]),
    ),
  },
  // Mobilize 1: read from the text.
  "Shock Brigade": {},
  "Shocking Sharpshooter": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Another creature enters: 1 damage to an opponent",
      }),
    ],
  },
  "Stormscale Scion": {
    abilities: [
      staticAbility(
        { subtype: "Dragon", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Your other Dragons: +1/+1" },
      ),
      // Storm (702.40): read from the text.
    ],
  },
  "Summit Intimidator": {
    abilities: [
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })], {
        targets: [target.creature()],
        label: "A creature can't block this turn",
      }),
    ],
  },
  "Sunset Strikemaster": {
    abilities: [
      manaAbility("R"),
      activated({
        mana: "{2}{R}",
        tap: true,
        sacrifice: true,
        targets: [target.creature("t", { keyword: "flying" })],
        effects: [fx.damage(6, ref.target())],
        label: "6 damage to a creature with flying",
      }),
    ],
  },
  "Twin Bolt": {
    spell: spell([target.between(1, 2, target.any())], [fx.damageDivided(2, ref.target())]),
  },
  "Underfoot Underdogs": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GOBLIN)], { label: "A 1/1 Goblin" }),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { controller: "you", maxPower: 2 })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "One of your creatures with power 2 or less can't be blocked",
      }),
    ],
  },
  "Unsparing Boltcaster": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t", { controller: "opponent", damaged: true })],
        label: "5 damage to an opponent's creature already dealt damage this turn",
      }),
    ],
  },
  "War Effort": {
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { power: 1 }, { label: "Your creatures: +1/+0" }),
      triggered(
        when.attackWith(1),
        [
          fx.createTappedTokens(WARRIOR_R, 1, { attacking: true, store: "w" }),
          fx.delayed([fx.sacrificeIt(ref.target("m"))], { m: ref.stored("w") }),
        ],
        { label: "A 1/1 Warrior tapped and attacking" },
      ),
    ],
  },
  "Wild Ride": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["haste"])]) },
  "Zurgo's Vanguard": {
    // Mobilize 1: read from the text.
    cda: { power: amount.count(CREATURE_YOU_CONTROL) },
  },

  // --- Batch B ----------------------------------------------------------------
  "Cori-Steel Cutter": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["trample", "haste"] },
        { label: "+1/+1, trample and haste" },
      ),
      flurry(
        [fx.createTokens(MONK, 1, undefined, "m"), ...fx.may("attach this Equipment to the Monk?", fx.attach(ref.stored("m")))],
        "a 1/1 Monk with prowess, to which you may attach it",
      ),
    ],
  },
  "Devoted Duelist": { abilities: [flurry([fx.damage(1, ref.eachOpponent)], "1 damage to each opponent")] },
  "Equilibrium Adept": {
    abilities: [
      triggered(when.entersSelf, [fx.exileTop(ref.you, 1, "x"), fx.grantPlay(ref.stored("x"), { untilYourNextTurn: true })], {
        label: "Exile the top card, playable until the end of your next turn",
      }),
      flurry([fx.modify(ref.self, { addKeywords: ["doubleStrike"] })], "double strike"),
    ],
  },
  "Jeskai Devotee": {
    abilities: [flurry([fx.pump(ref.self, 1, 1)], "+1/+1"), devotee(["U", "R", "W"])],
  },
  "Stormshriek Feral": {
    abilities: [activated({ mana: "{1}{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })],
  },
  "Flush Out": {
    spell: spell([], [fx.discard(1, ref.you, { store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))]),
  },
  "Runescale Stormbrood": {
    abilities: [
      triggered(
        when.castSpell("you", { anyOf: [{ notTypes: ["Creature"] }, { subtype: "Dragon" }] }),
        [fx.pump(ref.self, 2, 0)],
        {
          label: "Noncreature or Dragon spell: +2/+0",
        },
      ),
    ],
  },
  "Chilling Screech": {
    spell: spell([target.spell("t", { maxManaValue: 2 }, "spell with MV 2 or less")], [fx.counter(ref.target())]),
  },
};
