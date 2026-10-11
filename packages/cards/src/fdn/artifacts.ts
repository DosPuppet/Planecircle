/** Foundations — colorless artifacts. */
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  FISH,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  ref,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Equipment ("Equip {N}" is read from the text) ---
  "Fishing Pole": {
    abilities: [
      staticAbility(
        "attached",
        {
          addAbilities: [
            activated({
              mana: "{1}",
              tap: true,
              grantor: "tap",
              effects: [fx.counters(ref.grantor, "bait", 1)],
              label: "Tap Fishing Pole: put a bait counter on it",
            }),
          ],
        },
        { label: '"{1}, {T}, tap Fishing Pole: a bait counter"' },
      ),
      triggered(
        when.attachedUntaps,
        [...fx.when(cond.counterAtLeast("bait", 1), fx.counters(ref.self, "bait", -1), fx.createTokens(FISH))],
        { label: "remove a bait: 1/1 Fish" },
      ),
    ],
  },
  "Leyline Axe": {
    leyline: true,
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["doubleStrike", "trample"] },
        { label: "+1/+1, double strike, trample" },
      ),
    ],
  },
  "Quick-Draw Katana": {
    abilities: [
      staticAbility(
        "attached",
        { power: 2, addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "During your turn: +2/+0, first strike" },
      ),
    ],
  },
  "Adventuring Gear": {
    abilities: [triggered(when.landfall, [fx.pump(ref.attached, 2, 2)], { label: "equipped creature +2/+2" })],
  },
  "Goldvein Pick": {
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }),
      triggered(when.attachedDealsCombatDamageToPlayer, [fx.createTokens(TREASURE)], { label: "Treasure" }),
    ],
  },
  "Swiftfoot Boots": {
    abilities: [staticAbility("attached", { addKeywords: ["hexproof", "haste"] }, { label: "Hexproof and haste" })],
  },
  "Ravenous Amulet": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        effects: [fx.draw(1), fx.counters(ref.self, "soul", 1)],
        label: "Sacrifice a creature: draw a card",
      }),
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        effects: [fx.loseLife(amount.countersOn(ref.self, "soul"), ref.eachOpponent)],
        label: "Each opponent loses 1 life for each soul counter",
      }),
    ],
  },
  "Scrawling Crawler": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachPlayer)], { label: "each player draws" }),
      triggered(when.draw(undefined, "opponent"), [fx.loseLife(1, ref.eventPlayer)], { label: "loses 1 life" }),
    ],
  },
  "Burnished Hart": {
    abilities: [
      activated({
        mana: "{3}",
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)],
        label: "Two basic lands",
      }),
    ],
  },
  "Campus Guide": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land?", fx.search(BASIC_LAND, { to: "libraryTop" })), {
        label: "basic land on top",
      }),
    ],
  },
  "Gleaming Barrier": { abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Treasure" })] },
  Juggernaut: {
    keywords: ["mustAttack"],
    abilities: [blockAbility(block.notBy({ subtype: "Wall" }, "Can't be blocked by Walls"))],
  },
  "Meteor Golem": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "opponent's nonland permanent")],
        label: "destroys a permanent",
      }),
    ],
  },
  "Solemn Simulacrum": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })), {
        label: "basic land tapped",
      }),
      triggered(when.diesSelf, fx.may("Draw a card?", fx.draw(1)), { label: "draw a card" }),
    ],
  },
  "Banner of Kinship": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      entersWith({
        counters: amount.count({ types: ["Creature"], controller: "you", chosen: "subtype" }),
        counterKind: "fellowship",
        label: "Fellowship counters",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", chosen: "subtype" },
        { power: 1, toughness: 1 },
        { perCounter: "fellowship", label: "+1/+1 for each fellowship counter" },
      ),
    ],
  },
  "Heraldic Banner": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you", chosen: "color" }, { power: 1 }, { label: "+1/+0" }),
      manaAbility(["W"], 1, { produceChosen: true }),
    ],
  },

  // --- Reprints ---
  "Adaptive Automaton": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility("self", { addChosen: "subtype" }, { label: "Has the chosen type" }),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, other: true, chosen: "subtype" },
        { power: 1, toughness: 1 },
        {
          label: "Other creatures of the chosen type +1/+1",
        },
      ),
    ],
  },
  "Basilisk Collar": {
    abilities: [staticAbility("attached", { addKeywords: ["deathtouch", "lifelink"] }, { label: "Deathtouch and lifelink" })],
  },
  "Cultivator's Caravan": { abilities: [manaAbility(["W", "U", "B", "R", "G"])] },
  "Darksteel Colossus": { rules: { shuffleIntoLibrary: true } },
  "Diamond Mare": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [triggered(when.castSpell("you", { chosen: "color" }), [fx.gainLife(1)], { label: "+1 life" })],
  },
  "Expedition Map": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.search({ types: ["Land"] })],
        label: "Search for a land card",
      }),
    ],
  },
  "Feldon's Cane": {
    abilities: [
      activated({
        tap: true,
        exileSelf: true,
        effects: [fx.moveAll("graveyard", ref.you, {}, { to: "libraryTop" }), fx.shuffle()],
        label: "Shuffle the graveyard into the library",
      }),
    ],
  },
  Fireshrieker: { abilities: [staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double strike" })] },
  "Gate Colossus": {
    costReduction: { generic: amount.count({ subtype: "Gate", controller: "you" }) },
    abilities: [
      blockAbility(block.notByPowerLE2),
      triggered(
        when.enters({ subtype: "Gate", controller: "you" }),
        fx.may("Put Gate Colossus from the graveyard on top of the library?", fx.moveTo(ref.self, { to: "libraryTop" })),
        { fromGraveyard: true, label: "returns on top of the library" },
      ),
    ],
  },
  "Gilded Lotus": { abilities: [manaAbility(["W", "U", "B", "R", "G"], 3)] },
  "Goblin Firebomb": {
    abilities: [
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        targets: [targetObj("t", {}, "permanent")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy any permanent",
      }),
    ],
  },
  "Hedron Archive": {
    abilities: [
      manaAbility("C", 2),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.draw(2)], label: "Draw two cards" }),
    ],
  },
  "Mazemind Tome": {
    abilities: [
      activated({ tap: true, addCounters: { kind: "page", n: 1 }, effects: [fx.scry(1)], label: "Scry 1" }),
      activated({
        mana: "{2}",
        tap: true,
        addCounters: { kind: "page", n: 1 },
        effects: [fx.draw(1)],
        label: "Draw a card",
      }),
      triggered(when.countersPut("self", "page"), [fx.exileCard(ref.self), fx.gainLife(4)], {
        condition: cond.counterAtLeast("page", 4),
        label: "exiled, +4 life",
      }),
    ],
  },
  "Pirate's Cutlass": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you", subtype: "Pirate" })],
        label: "attaches to a Pirate",
      }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Pyromancer's Goggles": {
    abilities: [manaAbility("R", 1, { rider: { spell: { ...INSTANT_SORCERY, colors: ["R"] }, effect: "copy" } })],
  },
  "Ramos, Dragon Engine": {
    abilities: [
      triggered(when.castSpell("you"), [fx.addCounters(ref.self, amount.colorsOf(ref.eventObject))], {
        label: "a counter for each color",
      }),
      activated({
        removeCounters: { kind: "+1/+1", n: 5 },
        oncePerTurn: true,
        effects: [fx.addMana("W", "W", "U", "U", "B", "B", "R", "R", "G", "G")],
        label: "Remove 5 counters: {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}",
      }),
    ],
  },
  // "As this artifact enters, look at an opponent's hand, then choose any card name."
  "Sorcerous Spyglass": {
    asEnters: [fx.chooseOpponent("o"), fx.look(ref.handOf(ref.stored("o"))), fx.chooseForSelf("cardName")],
    rules: { chosenNameAbilities: "forbid" },
  },
  "Soul-Guide Lantern": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [target.cardInGraveyard("t", {}, "any")],
        label: "exiles a card from a graveyard",
      }),
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.moveAll("graveyard", ref.eachOpponent, {}, { to: "exile" })],
        label: "Exile the opponents' graveyards",
      }),
      activated({ mana: "{1}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Steel Hellkite": {
    abilities: [
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
      activated({ mana: "{X}", oncePerTurn: true, effects: [fx.hellkite], label: "Destroy the permanents with value X" }),
    ],
  },
  "Three Tree Mascot": {
    keywords: ["changeling"],
    abilities: [activated({ mana: "{1}", oncePerTurn: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" })],
  },
};
