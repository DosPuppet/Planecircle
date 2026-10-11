/**
 * The Big Score (BIG): 30 cards (hideaway, artifact copies, Rest in Peace, Grand Abolisher…).
 * The helpers and tokens come from Outlaws of Thunder Junction (otj/common.ts).
 */
import type { CardScript, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BAT,
  CLUE,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  eventReplacement,
  FOOD,
  fx,
  graveyardReplacement,
  investigate,
  MAP,
  manaAbility,
  mode,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "../otj/common";

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

const artifactCreature = (
  name: string,
  subtypes: string[],
  power: number,
  toughness: number,
  extra: Partial<TokenSpec> = {},
): TokenSpec => ({
  name,
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes,
  power,
  toughness,
  ...extra,
});
const GNOME = artifactCreature("Gnome", ["Gnome"], 1, 1);
const GOLEM = artifactCreature("Golem", ["Golem"], 3, 3);
const CONSTRUCT = artifactCreature("Construct", ["Construct"], 0, 0, {
  abilities: [
    staticAbility(
      "self",
      { power: 1, toughness: 1 },
      { per: { types: ["Artifact"], controller: "you" }, label: "+1/+1 for each artifact" },
    ),
  ],
  text: "This token gets +1/+1 for each artifact you control.",
});
/** Blood: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card" (discard on resolution). */
const BLOOD: TokenSpec = {
  name: "Blood",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Blood"],
  abilities: [
    activated({
      mana: "{1}",
      tap: true,
      sacrifice: true,
      activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 1),
      effects: [fx.discard(1), fx.draw(1)],
      label: "Discard, draw",
    }),
  ],
  text: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.",
};

export const BIG_SCRIPTS: Record<string, CardScript> = {
  // --- White -----------------------------------------------------------------
  "Collector's Cage": {
    abilities: [
      // Hideaway 5: the card is exiled face down (only you see it).
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, { count: 1, to: { to: "exile", faceDown: "you" }, rest: "bottom", store: "h" }),
          fx.link(ref.stored("h")),
        ],
        { label: "Hideaway 5" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.addCounters(ref.target(), 1),
          fx.when(
            cond.amountAtLeast(amount.distinctPowers(CREATURE_YOU_CONTROL), 3),
            fx.grantPlay(ref.linked, { free: true, anyTime: true }),
          ),
        ],
        label: "+1/+1 counter (three different powers: play the hidden card)",
      }),
    ],
  },
  "Grand Abolisher": {
    abilities: [
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn", abilities: "artifactsCreaturesEnchantments" },
        condition: cond.yourTurn,
        label: "During your turn, your opponents are locked out",
      }),
    ],
  },
  "Oltec Matterweaver": {
    abilities: [
      triggeredModal(when.castSpell("you", { types: ["Creature"] }), [
        mode("1/1 Gnome", [], [fx.createTokens(GNOME)]),
        mode(
          "Copy of an artifact token",
          [targetObj("t", { types: ["Artifact"], token: true, controller: "you" }, "ctx:big|artifact token you control")],
          [fx.copyToken(ref.target())],
        ),
      ]),
    ],
  },
  "Rest in Peace": {
    abilities: [
      triggered(when.entersSelf, [fx.moveAll("graveyard", ref.eachPlayer, {}, { to: "exile" })], {
        label: "Exile all graveyards",
      }),
      graveyardReplacement({ label: "Whatever would go to a graveyard is exiled" }),
    ],
  },

  // --- Blue ------------------------------------------------------------------
  "Esoteric Duplicator": {
    abilities: [
      triggered(
        when.sacrifice({ types: ["Artifact"] }),
        fx.mayPay(
          "{2}",
          "Pay {2} to copy the artifact at the end step?",
          fx.delayed([fx.copyToken(ref.target("a"))], { a: ref.eventObject }),
        ),
        { label: "Copy of the sacrificed artifact" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw" }),
    ],
  },
  "Simulacrum Synthesizer": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", other: true, minManaValue: 3 }),
        [fx.createTokens(CONSTRUCT)],
        {
          label: "0/0 Construct",
        },
      ),
    ],
  },
  "Worldwalker Helm": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { types: ["Artifact"], not: { name: "Map" } },
        plus: MAP,
        modify: {},
        label: "A Map token in addition to your artifact tokens",
      }),
      activated({
        mana: "{1}{U}",
        tap: true,
        targets: [targetObj("t", { types: ["Artifact"], token: true, controller: "you" }, "ctx:big|artifact token you control")],
        effects: [fx.copyToken(ref.target())],
        label: "Copy an artifact token",
      }),
    ],
  },

  // --- Black -----------------------------------------------------------------
  "Greed's Gambit": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(3), fx.gainLife(6), fx.createTokens(BAT, 3)], {
        label: "Draw 3, +6 life, three Bats",
      }),
      triggered(when.yourEndStep, [fx.discard(1), fx.loseLife(2), fx.sacrifice(ref.you, { types: ["Creature"] })], {
        label: "Discard, lose 2 life, sacrifice a creature",
      }),
      triggered(when.leavesSelf, [fx.discard(3), fx.loseLife(6), fx.sacrifice(ref.you, { types: ["Creature"] }, 3)], {
        label: "Discard 3, lose 6 life, sacrifice 3 creatures",
      }),
    ],
  },
  "Harvester of Misery": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], other: true }, -2, -2)], {
        label: "Other creatures -2/-2",
      }),
      activated({
        mana: "{1}{B}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), -2, -2)],
        label: "-2/-2",
      }),
    ],
  },
  "Hostile Investigator": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "They discard",
      }),
      triggered(when.discardBatch("any"), [investigate()], { oncePerTurn: true, label: "Investigate" }),
    ],
  },

  // --- Red -------------------------------------------------------------------
  "Generous Plunderer": {
    abilities: [
      triggered(
        when.yourUpkeep,
        fx.may(
          "Create a Treasure?",
          fx.createTokens(TREASURE),
          fx.reflexive(
            [target.player("t", "opponent")],
            [{ op: "createTokens", token: TREASURE, count: 1, for: ref.target(), tapped: true }],
          ),
        ),
        { label: "Treasure (an opponent creates a tapped one)" },
      ),
      triggered(
        when.attacksSelf,
        [fx.damage(amount.refCount(ref.permanentsOf(ref.defendingPlayer, { types: ["Artifact"] })), ref.defendingPlayer)],
        { label: "Damage equal to their artifacts" },
      ),
    ],
  },
  "Legion Extruder": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any("t")], label: "2 damage" }),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [fx.createTokens(GOLEM)],
        label: "3/3 Golem",
      }),
    ],
  },
  "Memory Vessel": {
    abilities: [
      activated({
        tap: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [
          fx.exileTop(ref.eachPlayer, 7, "m"),
          fx.grantPlay(ref.stored("m"), { for: "owner", untilYourNextTurn: true }),
          // "They can't play cards from their hand" (spells and lands), until your next turn.
          fx.untilYourNextTurn({ castLimit: { who: "you", from: "hand" } }, ref.eachPlayer),
        ],
        label: "Each player exiles seven cards, playable",
      }),
    ],
  },
  "Molten Duplication": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "artifact or creature you control")],
      [fx.copyToken(ref.target(), { addTypes: ["Artifact"], addKeywords: ["haste"], sacrificeAtEndStep: true })],
    ),
  },
  "Territory Forge": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "f" }), fx.link(ref.stored("f"))], {
        condition: cond.wasCast,
        targets: [target.permanent("t", ["Artifact", "Land"], {}, "artifact or land")],
        label: "Exile an artifact or land",
      }),
      staticAbility("self", { gainAbilitiesOf: { zone: "linked" } }, { label: "Activated abilities of the exiled card" }),
    ],
  },

  // --- Green -----------------------------------------------------------------
  "Ancient Cornucopia": {
    abilities: [
      triggered(
        when.castSpell("you", {
          anyOf: [{ colors: ["W"] }, { colors: ["U"] }, { colors: ["B"] }, { colors: ["R"] }, { colors: ["G"] }],
        }),
        fx.may("Gain 1 life for each color of the spell?", fx.gainLife(amount.colorsOf(ref.eventObject))),
        { oncePerTurn: true, label: "+1 life for each color" },
      ),
      manaAbility([...ALL_COLORS]),
    ],
  },
  "Bristlebud Farmer": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD, 2)], { label: "Two Foods" }),
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { subtype: "Food" }, 1, { optional: true, store: "f" }),
          fx.when(
            cond.v("f"),
            fx.mill(3, ref.you, { name: "m" }),
            fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { pool: ref.stored("m"), min: 0 }),
          ),
        ],
        { label: "Sacrifice a Food: mill three cards, get back a permanent" },
      ),
    ],
  },
  "Omenpath Journey": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }, { to: "exile" }, 5, undefined, "o"), fx.link(ref.stored("o"))], {
        label: "Exile up to five lands",
      }),
      triggered(
        when.yourEndStep,
        [fx.pickFromZone("graveyard", {}, { to: "battlefield", tapped: true }, { pool: ref.linked, random: true })],
        { label: "A random exiled land, tapped" },
      ),
    ],
  },
  "Sandstorm Salvager": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GOLEM)], { label: "3/3 Golem" }),
      activated({
        mana: "{2}",
        tap: true,
        effects: [
          fx.addCountersAll({ ...CREATURE_YOU_CONTROL, token: true }, 1),
          fx.pumpAll({ ...CREATURE_YOU_CONTROL, token: true }, 0, 0, ["trample"]),
        ],
        label: "Your creature tokens: counter and trample",
      }),
    ],
  },
  "Vaultborn Tyrant": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ self: true }, { types: ["Creature"], controller: "you", minPower: 4, other: true }] }),
        [fx.gainLife(3), fx.draw(1)],
        { label: "+3 life, draw" },
      ),
      triggered(when.diesSelf, [fx.copyToken(ref.eventObject, { addTypes: ["Artifact"] })], {
        condition: cond.not(cond.sourceMatches({ token: true })),
        label: "Artifact copy",
      }),
    ],
  },

  // --- Multicolored and colorless -------------------------------------------
  "Loot, the Key to Everything": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.exileTop(ref.you, amount.cardTypesAmong({ controller: "you", notTypes: ["Land"], other: true }), "l"),
          fx.grantPlay(ref.stored("l")),
        ],
        { label: "Exile X cards, playable this turn" },
      ),
    ],
  },
  "Pest Control": { spell: spell([], [fx.destroyAll({ notTypes: ["Land"], permanent: true, maxManaValue: 1 })]) },
  "Lost Jitte": {
    abilities: [
      triggered(when.combatDamage({ types: ["Creature"], attached: "host" }), [fx.counters(ref.self, "charge", 1)], {
        label: "Charge counter",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        targets: [target.permanent("t", ["Land"])],
        effects: [fx.untap(ref.target())],
        label: "Untap a land",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["cantBlock"])],
        label: "Can't block",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        activationCondition: cond.controls({ types: ["Creature"], attached: "host" }),
        effects: [fx.addCounters(ref.attached, 1)],
        label: "+1/+1 counter on the equipped creature",
      }),
    ],
  },
  "Lotus Ring": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 3,
          toughness: 3,
          addKeywords: ["vigilance"],
          addAbilities: [manaAbility([...ALL_COLORS], 3, { sacrifice: true })],
        },
        { label: '+3/+3, vigilance, "{T}, Sacrifice: three mana"' },
      ),
    ],
  },
  "Nexus of Becoming": {
    abilities: [
      triggered(
        when.step("beginCombat"),
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Artifact", "Creature"] },
            { to: "exile" },
            { min: 0, store: "n", prompt: "You may exile an artifact or creature" },
          ),
          fx.copyToken(ref.stored("n"), { addTypes: ["Artifact", "Creature"], addSubtypes: ["Golem"], pt: 3 }),
        ],
        { label: "Draw, 3/3 Golem copy" },
      ),
    ],
  },
  "Sword of Wealth and Power": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [protection.from({ types: ["Instant", "Sorcery"] }, "Protection from instants and sorceries")],
        },
        { label: "+2/+2, protection" },
      ),
      triggered(
        when.combatDamage({ types: ["Creature"], attached: "host" }, true),
        [fx.createTokens(TREASURE), fx.copyNextSpell],
        {
          label: "Treasure, next instant or sorcery copied",
        },
      ),
    ],
  },
  "Torpor Orb": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "none", on: "enter", entering: { types: ["Creature"] }, everyone: true },
        label: "Creatures entering don't cause abilities to trigger",
      }),
    ],
  },
  "Transmutation Font": {
    abilities: [
      activated({ tap: true, effects: [fx.createTokens(BLOOD)], label: "Blood token" }),
      activated({ tap: true, effects: [fx.createTokens(CLUE)], label: "Clue token" }),
      activated({ tap: true, effects: [fx.createTokens(FOOD)], label: "Food token" }),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Artifact"], token: true }, count: 3, differentNames: true },
        effects: [fx.search({ types: ["Artifact"] }, { to: "battlefield" })],
        label: "An artifact from your library",
      }),
    ],
  },

  // --- Lands -----------------------------------------------------------------
  "Fomori Vault": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 1),
        effects: [
          fx.discard(1),
          fx.lookAtTop(amount.count({ types: ["Artifact"], controller: "you" }), { count: 1, rest: "bottom" }),
        ],
        label: "Discard, one card among X",
      }),
    ],
  },
  "Tarnation Vista": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["W"], 1, { produceChosen: true }),
      activated({
        mana: "{1}",
        tap: true,
        effects: [fx.addManaColorsAmong({ controller: "you", permanent: true, multicolored: false })],
        label: "One mana of each color among your monocolored permanents",
      }),
    ],
  },
};
