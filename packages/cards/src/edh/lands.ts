/**
 * Commander (PLAN-E, E8): shared mana base of the Commander decks. Pain lands, check lands, "two basic lands" lands,
 * fetches, Triomes (cycling and land types read from the text), legendary lands (Urborg, Otawara, Phyrexian
 * Tower), filter and restricted lands; mana rocks (Sol Ring, talismans) and "no maximum hand size".
 */
import type { CardScript, ManaType, TokenSpec } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  cond,
  entersWith,
  fx,
  manaAbility,
  playerStatic,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Blood: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card." (the discard is a cost). */
export const BLOOD: TokenSpec = {
  name: "Blood",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Blood"],
  abilities: [activated({ mana: "{1}", tap: true, discard: 1, sacrifice: true, effects: [fx.draw(1)], label: "Discard, draw" })],
  text: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.",
};

/** "Pain" lands and artifacts: {C}, or one of two colors and 1 damage to you. */
const painSource = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [manaAbility("C"), manaAbility([a, b], 1, { drawback: { damageYou: 1 } })],
});

/** Basic land types, with their article, for the labels. */
const LAND_WITH_ARTICLE: Record<string, string> = {
  Plains: msg("a Plains"),
  Island: msg("an Island"),
  Swamp: msg("a Swamp"),
  Mountain: msg("a Mountain"),
  Forest: msg("a Forest"),
};

/** "Check" lands: enters tapped unless you control a land of one of these two types. */
const checkLand = (a: ManaType, b: ManaType, typeA: string, typeB: string): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], anySubtype: [typeA, typeB] })),
      label: msg("Tapped unless you control {a} or {b}", {
        a: LAND_WITH_ARTICLE[typeA] ?? typeA,
        b: LAND_WITH_ARTICLE[typeB] ?? typeB,
      }),
    }),
    manaAbility([a, b]),
  ],
});

/** "Battle" lands (basic types read from the text): tapped unless you control two or more basic lands. */
const battleLand: CardScript = {
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], basic: true }, 2)),
      label: "Tapped unless you control two or more basic lands",
    }),
  ],
};

/** Triomes and New Capenna towers: enter tapped (land types and cycling read from the text). */
const tappedTriland: CardScript = { abilities: [entersWith({ tapped: true })] };

/** "Reveal" lands: tapped unless you reveal a [type] or [type] card from your hand (automatic choice). */
const revealLand = (a: ManaType, b: ManaType, typeA: string, typeB: string): CardScript => ({
  // "As this land enters, you may reveal a [typeA] or [typeB] card from your hand. If you don't, this land enters tapped":
  // the card asked as it enters (a detail, answered with the suggestion outside full control; PLAN-M M11b).
  asEnters: [...fx.mayReveal({ anySubtype: [typeA, typeB] })],
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.beheld),
      label: msg("Tapped unless you reveal {a} or {b} from your hand", {
        a: LAND_WITH_ARTICLE[typeA] ?? typeA,
        b: LAND_WITH_ARTICLE[typeB] ?? typeB,
      }),
    }),
    manaAbility([a, b]),
  ],
});

/** Filter lands: {T}: {C}; {A/B}, {T}: two mana among these two colors. */
const filterLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    manaAbility("C"),
    activated({
      mana: `{${a}/${b}}`,
      tap: true,
      effects: [fx.addManaCombination(2, [a, b])],
      label: msg("{a}{a}, {a}{b}, or {b}{b}", { a: `{${a}}`, b: `{${b}}` }),
    }),
  ],
});

/** "Tainted" lands: {C}, or one of two colors if you control a Swamp. */
const taintedLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [manaAbility("C"), manaAbility([a, b], 1, { condition: cond.controls({ types: ["Land"], subtype: "Swamp" }) })],
});

/** "{1}, {T}: Add {A}{B}" lands (Overflowing Basin). */
const pairLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    activated({ mana: "{1}", tap: true, effects: [fx.addMana(a, b)], label: msg("{a}{b}", { a: `{${a}}`, b: `{${b}}` }) }),
  ],
});

/** "Fetch" lands: {T}, 1 life, sacrifice: a [type] or [type] card onto the battlefield. */
const fetchland = (a: string, b: string, label: string): CardScript => ({
  abilities: [
    activated({
      tap: true,
      payLife: 1,
      sacrifice: true,
      effects: [fx.search({ types: ["Land"], anySubtype: [a, b] }, { to: "battlefield" })],
      label,
    }),
  ],
});

/** "You have no maximum hand size", and {T}: add mana. */
const noMaxHand = (...mana: ReturnType<typeof manaAbility>[]): CardScript => ({
  abilities: [playerStatic({ maxHandSize: "none", label: "You have no maximum hand size" }), ...mana],
});

export const EDH_LANDS: Record<string, CardScript> = {
  // --- Pain lands and talismans ---
  "Adarkar Wastes": painSource("W", "U"),
  "Caves of Koilos": painSource("W", "B"),
  "Underground River": painSource("U", "B"),
  "Talisman of Dominance": painSource("U", "B"),
  "Talisman of Hierarchy": painSource("W", "B"),
  "Talisman of Progress": painSource("W", "U"),
  "Sulfurous Springs": painSource("B", "R"),
  "Battlefield Forge": painSource("R", "W"),
  "Shivan Reef": painSource("U", "R"),
  "Talisman of Creativity": painSource("U", "R"),
  "Clifftop Retreat": checkLand("R", "W", "Mountain", "Plains"),
  "Sulfur Falls": checkLand("U", "R", "Island", "Mountain"),
  "Radiant Summit": battleLand,
  // Counter Blitz (Final Fantasy X).
  Brushland: painSource("G", "W"),
  "Canopy Vista": battleLand,
  "Scorched Geyser": battleLand,
  "Sunpetal Grove": checkLand("G", "W", "Forest", "Plains"),
  "Idyllic Beachfront": tappedTriland,
  "Radiant Grove": tappedTriland,
  "Tangled Islet": tappedTriland,
  "Seaside Citadel": { abilities: [entersWith({ tapped: true }), manaAbility(["G", "W", "U"])] },
  "Flooded Grove": filterLand("G", "U"),
  "Fortified Village": revealLand("G", "W", "Forest", "Plains"),
  "Port Town": revealLand("W", "U", "Plains", "Island"),
  "Vineglimmer Snarl": revealLand("G", "U", "Forest", "Island"),
  "Overflowing Basin": pairLand("G", "U"),
  "Skycloud Expanse": pairLand("W", "U"),
  "Sungrass Prairie": pairLand("G", "W"),
  // Mutant Menace (Fallout).
  "Darkwater Catacombs": pairLand("U", "B"),
  "Viridescent Bog": pairLand("B", "G"),
  "Fetid Pools": tappedTriland,
  "Woodland Cemetery": checkLand("B", "G", "Swamp", "Forest"),
  "Talisman of Curiosity": painSource("G", "U"),
  "Talisman of Resilience": painSource("B", "G"),
  "Tainted Field": taintedLand("W", "B"),
  "Tainted Isle": taintedLand("U", "B"),
  "Tainted Wood": taintedLand("B", "G"),
  "Tainted Peak": taintedLand("B", "R"),
  "Temple of the False God": {
    abilities: [manaAbility("C", 2, { condition: cond.controls({ types: ["Land"] }, 5) })],
  },
  "Cinder Glade": battleLand,
  "Sodden Verdure": battleLand,
  "Vernal Fen": battleLand,
  "Hinterland Harbor": checkLand("G", "U", "Forest", "Island"),
  "Rootbound Crag": checkLand("R", "G", "Mountain", "Forest"),
  // Basic landcycling {1}: read from the text.
  "Ash Barrens": { abilities: [manaAbility("C")] },
  "Talisman of Indulgence": painSource("B", "R"),

  // --- Check lands ---
  "Dragonskull Summit": checkLand("B", "R", "Swamp", "Mountain"),
  "Drowned Catacomb": checkLand("U", "B", "Island", "Swamp"),
  "Glacial Fortress": checkLand("W", "U", "Plains", "Island"),
  "Isolated Chapel": checkLand("W", "B", "Plains", "Swamp"),

  // --- Two basic lands, Triomes, three-color lands ---
  "Prairie Stream": battleLand,
  "Smoldering Marsh": battleLand,
  "Blackcleave Cliffs": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.controls({ types: ["Land"], other: true }, 3),
        label: "Tapped unless you control two or fewer other lands",
      }),
      manaAbility(["B", "R"]),
    ],
  },
  "Foreboding Ruins": {
    asEnters: [...fx.mayReveal({ anySubtype: ["Swamp", "Mountain"] })],
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.beheld),
        label: "Tapped unless you reveal a Swamp or Mountain card from your hand",
      }),
      manaAbility(["B", "R"]),
    ],
  },
  "Graven Cairns": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{B/R}",
        tap: true,
        effects: [fx.addManaCombination(2, ["B", "R"])],
        label: "{B}{B}, {B}{R}, or {R}{R}",
      }),
    ],
  },
  "Blightstep Pathway": { abilities: [manaAbility("B")] },
  "Searstep Pathway": { abilities: [manaAbility("R")] },
  "Sunken Hollow": battleLand,
  "Raffine's Tower": tappedTriland,
  "Savai Triome": tappedTriland,
  "Ketria Triome": tappedTriland,
  // Nissa, Leyline Tamer.
  "Raugrin Triome": tappedTriland,
  "Indatha Triome": tappedTriland,
  "Jetmir's Garden": tappedTriland,
  "Ziatora's Proving Ground": tappedTriland,
  "Xander's Lounge": tappedTriland,
  "Arcane Sanctum": { abilities: [entersWith({ tapped: true }), manaAbility(["W", "U", "B"])] },

  // --- Fetches ---
  "Bloodstained Mire": fetchland("Swamp", "Mountain", "Search for a Swamp or Mountain card"),
  "Flooded Strand": fetchland("Plains", "Island", "Search for a Plains or Island card"),
  "Polluted Delta": fetchland("Island", "Swamp", "Search for an Island or Swamp card"),
  "Windswept Heath": fetchland("Forest", "Plains", "Search for a Forest or Plains card"),
  "Wooded Foothills": fetchland("Mountain", "Forest", "Search for a Mountain or Forest card"),

  // --- Utility lands ---
  "Bojuka Bog": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(when.entersSelf, [fx.moveTo(ref.graveyardOf(ref.target("p")), { to: "exile" })], {
        targets: [target.player("p")],
        label: "Exile target player's graveyard",
      }),
      manaAbility("B"),
    ],
  },
  "Otawara, Soaring City": {
    abilities: [
      manaAbility("U"),
      // Channel: from the hand, by discarding the card; {1} less for each legendary creature you control.
      activated({
        mana: "{3}{U}",
        fromHand: true,
        discardSelf: true,
        reduction: { generic: amount.count({ types: ["Creature"], legendary: true, controller: "you" }) },
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Creature", "Enchantment", "Planeswalker"],
            {},
            "artifact, creature, enchantment, or planeswalker",
          ),
        ],
        effects: [fx.toHand(ref.target())],
        label: "Channel — return target permanent to its owner's hand",
      }),
    ],
  },
  "Phyrexian Tower": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addMana("B", "B")],
        label: "Sacrifice a creature: add {B}{B}",
      }),
    ],
  },
  "Reliquary Tower": noMaxHand(manaAbility("C")),
  "Sunken Ruins": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{U/B}",
        tap: true,
        effects: [fx.addManaCombination(2, ["U", "B"])],
        label: "Add {U}{U}, {U}{B}, or {B}{B}",
      }),
    ],
  },
  "Hall of the Bandit Lord": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility("C", 1, { payLife: 3, rider: { spell: { types: ["Creature"] }, effect: "haste" } }),
    ],
  },
  "Unclaimed Territory": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: { types: ["Creature"], chosen: "subtype" } } }),
    ],
  },
  "Urborg, Tomb of Yawgmoth": {
    abilities: [
      staticAbility(
        { types: ["Land"] },
        { addSubtypes: ["Swamp"] },
        { label: "Each land is a Swamp in addition to its other types" },
      ),
    ],
  },
  "Voldaren Estate": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { payLife: 1, restriction: { spell: { subtype: "Vampire" } } }),
      activated({
        mana: "{5}",
        tap: true,
        reduction: { generic: amount.count({ subtype: "Vampire", controller: "you" }) },
        effects: [fx.createTokens(BLOOD)],
        label: "Create a Blood token",
      }),
    ],
  },

  // --- Artifacts ---
  "Sol Ring": { abilities: [manaAbility("C", 2)] },
  "Thought Vessel": noMaxHand(manaAbility("C")),
  "Decanter of Endless Water": noMaxHand(manaAbility(ANY_COLOR)),
  "Relic of Legends": {
    abilities: [
      manaAbility(ANY_COLOR),
      manaAbility(ANY_COLOR, 1, { noTap: true, tapAnother: { types: ["Creature"], legendary: true } }),
    ],
  },
};
