/** Mystical Archive (SOA): card scripts (PLAN-G). */
import { type Effect, msg, type TokenSpec } from "@mtgx/engine";
import {
  altCost,
  altCostMode,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  fx,
  GOBLIN,
  modal,
  mode,
  protection,
  ref,
  spell,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

const APE: TokenSpec = { name: "Ape", colors: ["G"], types: ["Creature"], subtypes: ["Ape"], power: 3, toughness: 3 };
const LIZARD_8: TokenSpec = { name: "Lizard", colors: ["R"], types: ["Creature"], subtypes: ["Lizard"], power: 8, toughness: 8 };
const FOREST_DRYAD: TokenSpec = {
  name: "Forest Dryad",
  colors: ["G"],
  types: ["Land", "Creature"],
  subtypes: ["Forest", "Dryad"],
  power: 1,
  toughness: 1,
};
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
/** Colors of mana spent to cast this spell (converge). */
const COLORS_SPENT = amount.colorsSpent;

const NOT_YOURS_NONLAND = target.nonland("t", { controller: "opponent" }, "nonland permanent you don't control");

/**
 * Ad Nauseam: "reveal the top card, put it into your hand, lose life equal to its mana value; you may repeat this
 * process any number of times" (at most N times, docs/approximations.md).
 */
function adNauseam(n: number): Effect[] {
  const step = (i: number): Effect[] => [
    fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: `a${i}` }),
    fx.loseLife(amount.manaValueOf(ref.stored(`a${i}`)), ref.you),
  ];
  let tail: Effect[] = [];
  for (let i = n - 1; i >= 1; i--) tail = fx.may("Repeat (reveal the next card)?", ...step(i), ...tail);
  return [...step(0), ...tail];
}

export const CARDS: Record<string, CardScript> = {
  // Storm: read from the text (Brain Freeze, Empty the Warrens, Flusterstorm).
  "Brain Freeze": { spell: spell([target.player()], [fx.mill(3, ref.target())]) },
  "Cyclonic Rift": {
    spell: altCostMode(
      "Overload",
      "{6}{U}",
      { targets: [NOT_YOURS_NONLAND], effects: [fx.bounce(ref.target())] },
      { effects: [fx.bounce(ref.permanentsOf(ref.eachOpponent, { notTypes: ["Land"] }))] },
    ),
  },
  "Empty the Warrens": { spell: spell([], [fx.createTokens(GOBLIN, 2)]) },
  Flusterstorm: {
    spell: spell(
      [target.spell("t", { types: ["Instant", "Sorcery"] }, "instant or sorcery spell")],
      [fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{1}" }, fx.counter(ref.target()))],
    ),
  },
  "Winds of Abandon": {
    // The controller of each exiled creature (its last known controller) searches for as many basic lands as their
    // exiled creatures (the number is read from the point of view of the searching player).
    spell: altCostMode(
      "Overload",
      "{4}{W}{W}",
      {
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [
          fx.moveTo(ref.target(), { to: "exile" }, { name: "x" }),
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.stored("x"))),
        ],
      },
      {
        effects: [
          fx.moveTo(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }), { to: "exile" }, { name: "x" }),
          fx.search(
            BASIC_LAND,
            { to: "battlefield", tapped: true },
            { kind: "refCount", ref: ref.filtered(ref.stored("x"), { controller: "you" }) },
            ref.controllerOf(ref.stored("x")),
          ),
        ],
      },
    ),
  },
  // — G8 : Mystical Archive —
  Armageddon: { spell: spell([], [fx.destroyAll({ types: ["Land"] })]) },
  "Prismatic Ending": {
    spell: spell(
      [target.nonland()],
      [
        ...fx.when(
          cond.amountAtLeast(amount.plus(COLORS_SPENT, amount.neg(amount.manaValueOf(ref.target()))), 0),
          fx.exile(ref.target()),
        ),
      ],
    ),
  },
  Reprieve: { spell: spell([target.spell()], [fx.bounce(ref.target()), fx.draw(1)]) },
  // Convoke: read from the text.
  "Return to the Ranks": {
    spell: spell(
      [
        {
          ...target.cardInGraveyard(
            "t",
            { types: ["Creature"], maxManaValue: 2 },
            "you",
            "creature card with mana value 2 or less",
          ),
          countX: true,
        },
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  Pongify: {
    spell: spell(
      [target.creature()],
      [fx.createTokens(APE, 1, ref.controllerOf(ref.target())), { op: "destroy", what: ref.target(), noRegenerate: true }],
    ),
  },
  Preordain: { spell: spell([], [fx.scry(2), fx.draw(1)]) },
  "Culling the Weak": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.addMana("B", "B", "B", "B")]),
  },
  // Suspend 3—{2}{B}{B}: read from the text.
  "Living End": {
    spell: spell(
      [],
      [
        fx.moveTo(ref.zone("graveyard", ref.eachPlayer, { types: ["Creature"] }), { to: "exile" }, { name: "le" }),
        fx.sacrificeIt(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] })),
        fx.toBattlefield(ref.stored("le")),
      ],
    ),
  },
  "Sheoldred's Edict": {
    spell: modal(
      mode("Nontoken creature", [], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: false })]),
      mode("Creature token", [], [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: true })]),
      mode("Planeswalker", [], [fx.sacrifice(ref.eachOpponent, { types: ["Planeswalker"] })]),
    ),
  },
  Smallpox: {
    spell: spell(
      [],
      [
        fx.loseLife(1, ref.eachPlayer),
        fx.discard(1, ref.eachPlayer),
        fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }),
        fx.sacrifice(ref.eachPlayer, { types: ["Land"] }),
      ],
    ),
  },
  "Vampiric Tutor": { spell: spell([], [fx.search({}, { to: "libraryTop" }), fx.loseLife(2)]) },
  "Big Score": {
    additionalCost: { discard: 1 },
    spell: spell([], [fx.draw(2), fx.createTokens(TREASURE, 2)]),
  },
  "Brotherhood's End": {
    spell: modal(
      mode("3 damage to each creature and planeswalker", [], [fx.damageAll(3, { types: ["Creature", "Planeswalker"] })]),
      mode("Destroy artifacts with mana value 3 or less", [], [fx.destroyAll({ types: ["Artifact"], maxManaValue: 3 })]),
    ),
  },
  "Pyretic Ritual": { spell: spell([], [fx.addMana("R", "R", "R")]) },
  "Subterranean Tremors": {
    spell: spell(
      [],
      [
        fx.damageAll(amount.x, { types: ["Creature"], not: { keyword: "flying" } }),
        ...fx.when(cond.xAtLeast(4), fx.destroyAll({ types: ["Artifact"] })),
        ...fx.when(cond.xAtLeast(8), fx.createTokens(LIZARD_8)),
      ],
    ),
  },
  "Awaken the Woods": { spell: spell([], [fx.createTokens(FOREST_DRYAD, amount.x)]) },
  Berserk: {
    // "Cast this spell only before the combat damage step."
    rules: {
      castCondition: cond.not(
        cond.any(cond.step("combatDamage"), cond.step("endCombat"), cond.step("main2"), cond.step("end"), cond.step("cleanup")),
      ),
    },
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), amount.powerOf(ref.target()), 0, ["trample"]),
        fx.delayed([...fx.when(cond.targetMatches("b", { attackedThisTurn: true }), fx.destroy(ref.target("b")))], {
          b: ref.target(),
        }),
      ],
    ),
  },
  "Crop Rotation": {
    additionalCost: { sacrifice: { filter: { types: ["Land"] }, count: 1 } },
    spell: spell([], [fx.search({ types: ["Land"] }, { to: "battlefield" })]),
  },
  "Glimpse of Nature": {
    spell: spell(
      [],
      [
        fx.emblem(
          "Glimpse of Nature",
          msg("Whenever you cast a creature spell this turn, draw a card."),
          [triggered(when.castSpell("you", { types: ["Creature"] }), [fx.draw(1)], { label: "Creature spell: draw" })],
          undefined,
          true,
        ),
      ],
    ),
  },
  "Shamanic Revelation": {
    spell: spell(
      [],
      [
        fx.draw(amount.count(YOUR_CREATURES)),
        fx.gainLife(amount.plus(...Array(4).fill(amount.count({ ...YOUR_CREATURES, minPower: 4 })))),
      ],
    ),
  },
  "Triumph of the Hordes": {
    spell: spell([], [fx.pumpAll(YOUR_CREATURES, 1, 1, ["trample", "infect"])]),
  },
  "Bring to Light": {
    spell: spell(
      [],
      [
        fx.search(
          {
            anyOf: [{ types: ["Creature"] }, { types: ["Instant"] }, { types: ["Sorcery"] }],
            compare: [cmp.manaValue("<=", amount.colorsSpent)],
          },
          { to: "exile" },
          1,
          undefined,
          "b",
        ),
        fx.castNow(ref.stored("b"), { free: true }),
      ],
    ),
  },
  "Culling Ritual": {
    spell: spell(
      [],
      [fx.destroyAll({ notTypes: ["Land"], maxManaValue: 2 }, "c"), fx.addManaCombination(amount.v("c"), ["B", "G"])],
    ),
  },
  "Expressive Iteration": {
    spell: spell(
      [],
      [
        fx.lookAtTop(3, { count: 1, exact: true, to: { to: "hand" }, rest: "top" }),
        fx.lookAtTop(2, { count: 1, exact: true, to: { to: "exile" }, rest: "bottom", store: "e" }),
        fx.grantPlay(ref.stored("e")),
      ],
    ),
  },
  Fracture: {
    spell: spell(
      [target.permanent("t", ["Artifact", "Enchantment", "Planeswalker"], {}, "artifact, enchantment or planeswalker")],
      [fx.destroy(ref.target())],
    ),
  },
  // — G4e: hard sub-lot —
  Dismember: { spell: spell([target.creature()], [fx.pump(ref.target(), -5, -5)]) },
  "Force of Will": {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.all(),
        label: "Force of Will — 1 life and a blue card exiled from your hand",
        pay: { life: 1, exileFromHand: { filter: { colors: ["U"] }, count: 1 } },
      }),
    ],
    spell: spell([target.spell()], [fx.counter(ref.target())]),
  },
  Daze: {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.all(),
        label: "Daze — return an Island you control",
        pay: { bounce: { types: ["Land"], subtype: "Island" } },
      }),
    ],
    spell: spell([target.spell()], [fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{1}" }, fx.counter(ref.target()))]),
  },
  "Angel's Grace": {
    spell: spell([], [fx.thisTurn({ cantLose: true, damageLifeFloor: 1 })]),
  },
  "Veil of Summer": {
    spell: spell(
      [],
      [
        ...fx.when(cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "opponent", colors: ["U", "B"] }), 1), fx.draw(1)),
        fx.thisTurn({ uncounterable: {}, hexproof: { colors: ["U", "B"] } }),
        fx.modify(ref.permanentsOf(ref.you, {}), {
          addProtections: [protection.hexproofFrom({ colors: ["U", "B"] }, "Hexproof from blue and from black")],
        }),
      ],
    ),
  },
  "Deflecting Palm": {
    spell: spell(
      [],
      [
        fx.shield(
          {
            event: "damage",
            to: "you",
            modify: { prevent: true },
            onPrevent: { reflexive: [fx.damage(amount.eventAmount, ref.eventPlayer)] },
          },
          true,
        ),
      ],
    ),
  },
  "Ad Nauseam": {
    spell: spell([], adNauseam(30)),
  },
};
