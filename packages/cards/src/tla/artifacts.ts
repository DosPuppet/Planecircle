/** Avatar: The Last Airbender: colorless cards and lands. */
import type { ManaType } from "@mtgx/engine";
import { BASIC_LAND_TYPES } from "@mtgx/engine";
import {
  ALLY,
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CLUE,
  cond,
  entersWith,
  firebending,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/** "This land enters tapped unless you control a basic land." */
const unlessBasic = entersWith({
  tapped: true,
  condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
  label: "Enters tapped unless you control a basic land",
});

/** Two-color lands "enters tapped; {4}, {T}, sacrifice this land: draw a card". */
const cyclingLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    manaAbility([a, b]),
    activated({ mana: "{4}", tap: true, sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
  ],
});

/** "{1}, {T}: add one mana of any color." */
const filterAnyColor = activated({
  mana: "{1}",
  tap: true,
  effects: [fx.addManaChoice(1)],
  label: "One mana of any color",
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Colorless Lessons -------------------------------------------------------
  "Aang's Journey": {
    kicker: "{2}",
    spell: spell(
      [],
      [
        // Kicked: one search for a basic land card and a Shrine card (one filter per card), one shuffle.
        ...fx.ifElse(
          cond.kicked,
          [
            fx.search({}, { to: "hand" }, 1, undefined, undefined, undefined, {
              each: [BASIC_LAND, { subtype: "Shrine" }],
              reveal: true,
            }),
          ],
          [fx.search(BASIC_LAND, { to: "hand" }, 1, undefined, undefined, undefined, { reveal: true })],
        ),
        fx.gainLife(2),
      ],
    ),
  },
  Energybending: {
    spell: spell(
      [],
      [fx.modifyAll({ types: ["Land"], controller: "you" }, { addSubtypes: [...BASIC_LAND_TYPES] }, "endOfTurn"), fx.draw(1)],
    ),
  },
  "Zuko's Exile": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature", "Enchantment"], {}, "artifact, creature or enchantment")],
      [fx.exile(ref.target()), fx.createTokens(CLUE, 1, ref.controllerOf(ref.target()))],
    ),
  },

  // --- Artifacts ---------------------------------------------------------------
  "Barrels of Blasting Jelly": {
    abilities: [
      activated({ mana: "{1}", oncePerTurn: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
      activated({
        mana: "{5}",
        tap: true,
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(5, ref.target())],
        label: "5 damage to a creature",
      }),
    ],
  },
  "Bender's Waterskin": {
    abilities: [
      // "Untap this artifact during each other player's untap step."
      playerStatic({ untapOnOthersUntap: { self: true }, label: "Untaps during each opponent's turn" }),
      manaAbility(ANY_COLOR),
    ],
  },
  "Fire Nation Warship": {
    // Reach and crew 2: read from the text. "Dies": put into a graveyard from the battlefield, creature or not.
    abilities: [triggered(when.putIntoGraveyardSelf, [fx.createTokens(CLUE)], { label: "A Clue" })],
  },
  "Kyoshi Battle Fan": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ALLY, 1, undefined, "a"), fx.attach(ref.stored("a"))], {
        label: "A 1/1 Ally, then attach the Equipment to it",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Meteor Sword": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [{ id: "t", label: "permanent", filter: { objects: { permanent: true } } }],
        label: "Destroy a permanent",
      }),
      staticAbility("attached", { power: 3, toughness: 3 }, { label: "+3/+3" }),
    ],
  },
  "Trusty Boomerang": {
    abilities: [
      staticAbility(
        "attached",
        {
          addAbilities: [
            activated({
              mana: "{1}",
              tap: true,
              targets: [target.creature()],
              effects: [fx.tap(ref.target()), fx.bounce(ref.grantor)],
              label: "Tap a creature, then return Trusty Boomerang to hand",
            }),
          ],
        },
        { label: '"{1}, {T}: tap a creature; return Trusty Boomerang"' },
      ),
    ],
  },
  "The Walls of Ba Sing Se": {
    abilities: [
      staticAbility(
        { controller: "you", other: true },
        { addKeywords: ["indestructible"] },
        { label: "Other permanents you control have indestructible" },
      ),
    ],
  },

  // --- Lands -------------------------------------------------------------------
  "Agna Qel'a": {
    abilities: [
      unlessBasic,
      manaAbility("U"),
      activated({ mana: "{2}{U}", tap: true, effects: fx.loot(1), label: "Draw, then discard a card" }),
    ],
  },
  "Airship Engine Room": cyclingLand("U", "R"),
  "Boiling Rock Prison": cyclingLand("B", "R"),
  "Fire Nation Palace": {
    abilities: [
      unlessBasic,
      manaAbility("R"),
      activated({
        mana: "{1}{R}",
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.modify(ref.target(), { addAbilities: [firebending(4)] }, "endOfTurn")],
        label: "Firebending 4 until end of turn",
      }),
    ],
  },
  "Foggy Bottom Swamp": cyclingLand("B", "G"),
  "Jasmine Dragon Tea Shop": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: { subtype: "Ally" }, abilityOfSource: { subtype: "Ally" } } }),
      activated({ mana: "{5}", tap: true, effects: [fx.createTokens(ALLY)], label: "A 1/1 Ally" }),
    ],
  },
  "Kyoshi Village": cyclingLand("G", "W"),
  "Meditation Pools": cyclingLand("G", "U"),
  "Misty Palms Oasis": cyclingLand("W", "B"),
  "North Pole Gates": cyclingLand("W", "U"),
  "Omashu City": cyclingLand("R", "G"),
  "Rumble Arena": {
    // Vigilance: read from the text.
    abilities: [triggered(when.entersSelf, [fx.scry(1)], { label: "Scry 1" }), manaAbility("C"), filterAnyColor],
  },
  "Secret Tunnel": {
    keywords: ["unblockable"],
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        targets: [
          {
            ...target.creature("t", { controller: "you" }),
            count: 2,
            shareCreatureType: true,
            label: "two creatures you control that share a creature type",
          },
        ],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Two creatures can't be blocked this turn",
      }),
    ],
  },
  "Serpent's Pass": cyclingLand("U", "B"),
  "Sun-Blessed Peak": cyclingLand("R", "W"),
  "White Lotus Hideout": {
    abilities: [
      manaAbility("C"),
      manaAbility(ANY_COLOR, 1, { restriction: { spell: { anyOf: [{ subtype: "Lesson" }, { subtype: "Shrine" }] } } }),
      filterAnyColor,
    ],
  },
  "White Lotus Tile": {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        tap: true,
        effects: [fx.addManaChoice(amount.maxSharingCreatureType({ types: ["Creature"], controller: "you" }))],
        label: "X mana of one color (X: the greatest number of creatures that share a creature type)",
      }),
    ],
  },
  "Planetarium of Wan Shi Tong": {
    abilities: [
      activated({ mana: "{1}", tap: true, effects: [fx.scry(2)], label: "Scry 2" }),
      // "Do this only once each turn": the limit is used up only if the card is cast.
      triggered(
        when.scryOrSurveil,
        [fx.castNow(ref.libraryTop(ref.you), { free: true, storeCast: "cast" }), ...fx.when(cond.v("cast"), fx.doneOncePerTurn)],
        {
          oncePerTurn: "ifDone",
          label: "You scry or surveil: you may cast the top card for free",
        },
      ),
    ],
  },
};
