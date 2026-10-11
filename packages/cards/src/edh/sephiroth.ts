/**
 * Commander: "Sephiroth's Singularity" deck (Sephiroth, Fabled SOLDIER; mono-black; Grumpywolf's list). Aristocrats:
 * sacrifice outlets (Ashnod's Altar, Warren Soultrader, Ayara), death triggers (Zulaport Cutthroat, Pawn of Ulamog,
 * Fumulus, Drivnod), recursion (Gravecrawler, Malakir Rebirth, Mortuary, Yawgmoth's Will), black mana (Cabal Coffers,
 * Crypt Ghast, Nykthos, Lake of the Dead) and edicts (the Marauders, Merciless Executioner, Flare of Malice).
 */
import type { CardScript, Effect, ObjectFilter, Ref, TokenSpec } from "@mtgx/engine";
import { THOPTER } from "../fra/common";
import {
  activated,
  amount,
  cond,
  costReducer,
  ELDRAZI_SPAWN,
  entersWith,
  eventReplacement,
  fx,
  graveyardReplacement,
  loyalty,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURES_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const BLACK_CREATURES_YOU: ObjectFilter = { types: ["Creature"], colors: ["B"], controller: "you" };
const SWAMPS_YOU: ObjectFilter = { subtype: "Swamp", controller: "you" };
/** "Each player sacrifices a creature of their choice." */
const eachSacrifices = (filter: ObjectFilter = { types: ["Creature"] }): Effect => fx.sacrifice(ref.eachPlayer, filter, 1);
/** `fx.forEachPlayer` goes through six seats: this one is a player in the game. */
const seated = (p: Ref) => cond.amountAtLeast(amount.refCount(p), 1);
/** "Each opponent loses 1 life and you gain 1 life." */
const drain1: Effect[] = [fx.loseLife(1, ref.eachOpponent), fx.gainLife(amount.refCount(ref.eachOpponent))];

const NECRON_WARRIOR: TokenSpec = {
  name: "Necron Warrior",
  colors: ["B"],
  types: ["Artifact", "Creature"],
  subtypes: ["Necron", "Warrior"],
  power: 2,
  toughness: 2,
};
const INSECT_FLYING: TokenSpec = {
  name: "Insect",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Insect"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
const PLAGUEBEARER: TokenSpec = {
  name: "Plaguebearer of Nurgle",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Demon"],
  power: 1,
  toughness: 3,
};
const ZOMBIE_DECAYED: TokenSpec = {
  name: "Zombie",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Zombie"],
  power: 2,
  toughness: 2,
  keywords: ["decayed"],
};
const SNAKE_DEATHTOUCH: TokenSpec = {
  name: "Snake",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Snake"],
  power: 1,
  toughness: 1,
  keywords: ["deathtouch"],
};
const THRULL: TokenSpec = { name: "Thrull", colors: ["B"], types: ["Creature"], subtypes: ["Thrull"], power: 0, toughness: 1 };
const TOMBSPAWN: TokenSpec = {
  name: "Tombspawn",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Zombie"],
  power: 2,
  toughness: 2,
  keywords: ["haste"],
};
const COLORS = [
  ["W", "White"],
  ["U", "Blue"],
  ["B", "Black"],
  ["R", "Red"],
  ["G", "Green"],
] as const;

export const EDH_SEPHIROTH: Record<string, CardScript> = {
  // --- Creatures ------------------------------------------------------------------------------------------------------
  "Accursed Marauder": {
    abilities: [
      triggered(when.entersSelf, [eachSacrifices({ types: ["Creature"], token: false })], {
        label: "Each player sacrifices a nontoken creature",
      }),
    ],
  },
  "Ayara, First of Locthwain": {
    abilities: [
      triggered(when.enters(BLACK_CREATURES_YOU), drain1, {
        label: "Ayara or another black creature enters: each opponent loses 1 life, you gain 1 life",
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"], colors: ["B"] } },
        effects: [fx.draw(1)],
        label: "Sacrifice another black creature: draw a card",
      }),
    ],
  },
  "Braids, Arisen Nightmare": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.sacrifice(ref.you, { types: ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker"] }, 1, {
            optional: true,
            store: "braids",
          }),
          ...fx.when(
            cond.v("braids"),
            fx.forEachPlayer(ref.eachOpponent, (p, n) => [
              fx.sacrifice(p, { shares: { what: "cardType", with: ref.stored("braids") } }, 1, {
                optional: true,
                store: `braids${n}`,
              }),
              ...fx.when(cond.all(seated(p), cond.not(cond.v(`braids${n}`))), fx.loseLife(2, p), fx.draw(1)),
            ]),
          ),
        ],
        { label: "You may sacrifice a permanent; each opponent sacrifices one sharing a type, or loses 2 life and you draw" },
      ),
    ],
  },
  "Crypt Ghast": {
    // Extort: read from the text.
    abilities: [
      eventReplacement({
        event: "mana",
        source: SWAMPS_YOU,
        modify: { add: 1 },
        label: "Whenever you tap a Swamp for mana, add an additional {B}",
      }),
    ],
  },
  "Drivnod, Carnage Dominus": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "dies" },
        label: "A creature dying makes your abilities trigger an additional time",
      }),
      activated({
        mana: "{B/P}{B/P}",
        exileFromGraveyard: { filter: { types: ["Creature"] }, count: 3 },
        effects: [fx.counters(ref.self, "indestructible")],
        label: "Exile three creature cards from your graveyard: an indestructible counter",
      }),
    ],
  },
  "Fleshbag Marauder": {
    abilities: [triggered(when.entersSelf, [eachSacrifices()], { label: "Each player sacrifices a creature" })],
  },
  "Fumulus, the Infestation": {
    // Flying, deathtouch: read from the text.
    abilities: [
      triggered(when.sacrifice({ types: ["Creature"], token: false }, true), [fx.createTokens(INSECT_FLYING)], {
        label: "A player sacrifices a nontoken creature: a 1/1 flying Insect",
      }),
      triggered(
        when.attacks({ types: ["Creature"], anySubtype: ["Insect", "Leech", "Slug", "Worm"], controller: "you" }),
        [fx.loseLife(1, ref.defendingPlayer), fx.gainLife(1)],
        { label: "An Insect, Leech, Slug, or Worm attacks: the defending player loses 1 life, you gain 1 life" },
      ),
    ],
  },
  Gravecrawler: {
    keywords: ["cantBlock"],
    castFromGraveyard: { condition: cond.controls({ subtype: "Zombie" }) },
  },
  "Great Unclean One": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.loseLife(2, ref.eachOpponent),
          ...fx.forEachPlayer(ref.eachOpponent, (p) =>
            fx.when(
              cond.all(seated(p), cond.amountGreater(amount.lifeTotal, { kind: "lifeTotal", who: p })),
              fx.createTokens(PLAGUEBEARER),
            ),
          ),
        ],
        { label: "Each opponent loses 2 life; a 1/3 Demon for each opponent with less life than you" },
      ),
    ],
  },
  "Jadar, Ghoulcaller of Nephalia": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(ZOMBIE_DECAYED)], {
        condition: cond.not(cond.controls({ types: ["Creature"], keyword: "decayed" })),
        label: "Without a creature with decayed: a 2/2 Zombie with decayed",
      }),
    ],
  },
  "Merciless Executioner": {
    abilities: [triggered(when.entersSelf, [eachSacrifices()], { label: "Each player sacrifices a creature" })],
  },
  Ophiomancer: {
    abilities: [
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.createTokens(SNAKE_DEATHTOUCH)], {
        condition: cond.not(cond.controls({ subtype: "Snake" })),
        label: "Without a Snake: a 1/1 Snake with deathtouch",
      }),
    ],
  },
  "Pawn of Ulamog": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false }),
        fx.may("Create an Eldrazi Spawn token?", fx.createTokens(ELDRAZI_SPAWN)),
        { label: "A nontoken creature of yours dies: you may create an Eldrazi Spawn" },
      ),
    ],
  },
  "Stridehangar Automaton": {
    abilities: [
      staticAbility(
        { subtype: "Thopter", controller: "you" },
        { power: 1, toughness: 1 },
        { label: "Thopters you control get +1/+1" },
      ),
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { types: ["Artifact"] },
        plus: THOPTER,
        modify: {},
        label: "Artifact tokens: plus a 1/1 flying Thopter",
      }),
    ],
  },
  "Warren Soultrader": {
    abilities: [
      activated({
        payLife: 1,
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.createTokens(TREASURE)],
        label: "Pay 1 life, sacrifice another creature: a Treasure",
      }),
    ],
  },
  "Zulaport Cutthroat": {
    abilities: [
      triggered(when.dies(CREATURES_YOU), drain1, {
        label: "It or another creature you control dies: each opponent loses 1 life, you gain 1 life",
      }),
    ],
  },
  "Tevesh Szat, Doom of Fools": {
    abilities: [
      loyalty(2, { effects: [fx.createTokens(THRULL, 2)], label: "Two 0/1 Thrulls" }),
      loyalty(1, {
        effects: [
          fx.sacrifice(ref.you, { types: ["Creature", "Planeswalker"], other: true }, 1, { optional: true, store: "t" }),
          ...fx.when(cond.v("t"), fx.draw(2)),
          ...fx.when(cond.refMatches(ref.stored("t"), { commander: true }), fx.draw(1)),
        ],
        label: "You may sacrifice another creature or planeswalker: draw two cards (three with a commander)",
      }),
      loyalty(-10, {
        effects: [
          fx.gainControl(ref.commanders(ref.eachPlayer), { indefinitely: true }),
          fx.toBattlefield(ref.zone("command", ref.eachPlayer), { underYourControl: true }),
        ],
        label: "Gain control of all commanders; those in the command zone enter under your control",
      }),
    ],
  },

  // --- Artifacts and enchantments -------------------------------------------------------------------------------------
  "Ashnod's Altar": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"] }, includeSelf: true },
        effects: [fx.addMana("C", "C")],
        label: "Sacrifice a creature: add {C}{C}",
      }),
    ],
  },
  // Approximation: only your creatures on the battlefield and your creature spells are artifacts (not the creature
  // cards in the other zones).
  Biotransference: {
    abilities: [
      staticAbility(CREATURES_YOU, { addTypes: ["Artifact"] }, { label: "Creatures you control are artifacts" }),
      triggered(
        when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }),
        [fx.loseLife(1), fx.createTokens(NECRON_WARRIOR)],
        { label: "You cast an artifact spell (creature spells too): you lose 1 life, a 2/2 Necron Warrior" },
      ),
    ],
  },
  "Jet Medallion": { abilities: [costReducer({ colors: ["B"] }, 1, "Black spells you cast cost {1} less")] },
  Mortuary: {
    abilities: [
      triggered(when.dies({ types: ["Creature"], owner: "you" }), [fx.moveTo(ref.eventObject, { to: "libraryTop" })], {
        label: "A creature goes to your graveyard from the battlefield: put it on top of your library",
      }),
    ],
  },
  "Tombstone Stairwell": {
    // Cumulative upkeep {1}{B}: read from the text. The Tombspawns are linked to it.
    abilities: [
      triggered(
        { on: "step", step: "upkeep", whose: "any" },
        fx.forEachPlayer(ref.eachPlayer, (p, n) => [
          fx.createTokens(TOMBSPAWN, amount.refCount(ref.zone("graveyard", p, { types: ["Creature"] })), p, `tomb${n}`),
          fx.link(ref.stored(`tomb${n}`)),
        ]),
        { label: "Each player creates a 2/2 Tombspawn with haste for each creature card in their graveyard" },
      ),
      triggered(when.eachEndStep, [{ op: "destroy", what: ref.linked, noRegenerate: true }], {
        label: "Destroy the Tombspawns (they can't be regenerated)",
      }),
      triggered(when.leavesSelf, [{ op: "destroy", what: ref.linked, noRegenerate: true }], {
        label: "It leaves: destroy the Tombspawns",
      }),
    ],
  },

  // --- Lands ----------------------------------------------------------------------------------------------------------
  "Barad-dûr": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Creature"], legendary: true })),
        label: "Enters tapped unless you control a legendary creature",
      }),
      manaAbility("B"),
      activated({
        mana: "{X}{X}{B}",
        tap: true,
        activationCondition: cond.morbid,
        effects: [fx.amass(ref.you, "Orc", amount.x)],
        label: "Amass Orcs X (only if a creature died this turn)",
      }),
    ],
  },
  "Cabal Coffers": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        effects: [{ op: "addMana", mana: ["B"], times: amount.count(SWAMPS_YOU) }],
        label: "Add {B} for each Swamp you control",
      }),
    ],
  },
  "Fell Mire": { abilities: [manaAbility("B")] },
  "Lake of the Dead": {
    asEnters: [
      fx.sacrifice(ref.you, { subtype: "Swamp" }, 1, { store: "swamp" }),
      ...fx.when(cond.not(cond.v("swamp")), fx.moveTo(ref.self, { to: "graveyard" })),
    ],
    abilities: [
      manaAbility("B"),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Swamp" } },
        effects: [fx.addMana("B", "B", "B", "B")],
        label: "Sacrifice a Swamp: add {B}{B}{B}{B}",
      }),
    ],
  },
  "Malakir Mire": { abilities: [entersWith({ tapped: true }), manaAbility("B")] },
  "Nykthos, Shrine to Nyx": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        effects: fx.yourChoice(
          "Choose a color: add mana of it equal to your devotion",
          "nykthos",
          COLORS.map(([c, name]) => ({
            label: name,
            effects: [{ op: "addMana", mana: [c], times: amount.devotion(c) } as Effect],
          })),
        ),
        label: "Choose a color: add mana of that color equal to your devotion to it",
      }),
    ],
  },

  // --- Spells ---------------------------------------------------------------------------------------------------------
  Entomb: { spell: spell([], [fx.search({}, { to: "graveyard" })]) },
  "Fell the Profane": {
    spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
  },
  "Flare of Malice": {
    altCost: {
      mana: "{0}",
      condition: cond.all(),
      label: "Sacrifice a nontoken black creature",
      pay: { sacrifice: { filter: { types: ["Creature"], colors: ["B"], token: false }, count: 1 } },
    },
    spell: spell([], [fx.sacrifice(ref.eachOpponent, { types: ["Creature", "Planeswalker"] }, 1, { greatestManaValue: true })]),
  },
  "Malakir Rebirth": {
    spell: spell(
      [target.creature()],
      [
        fx.loseLife(2),
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], {
              label: "When it dies, it returns to the battlefield tapped",
            }),
          ],
        }),
      ],
    ),
  },
  "Yawgmoth's Will": {
    spell: spell(
      [],
      [
        fx.emblem(
          "Yawgmoth's Will",
          "This turn, you may play lands and cast spells from your graveyard, and cards that would go to your graveyard are exiled instead.",
          [playerStatic({ playFrom: { zone: "graveyard" } }), graveyardReplacement({ graveyardOf: "you" })],
          false,
          true,
        ),
      ],
    ),
  },
};
