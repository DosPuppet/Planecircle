/**
 * Avatar: The Last Airbender: cards of the meta decks (phase 1 of plan P4, lot M1): earthbend (`fx.earthbend`). The
 * other cards of the set are in the files by color.
 */
import {
  ALLY,
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  CLUE,
  chapter,
  cmp,
  cond,
  cost,
  costReducer,
  DRAGON_FIREBENDING,
  entersWith,
  fx,
  kicker,
  manaAbility,
  modal,
  mode,
  ref,
  SPIRIT_KOH,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "land you control");

export const CARDS: Record<string, CardScript> = {
  // --- Lands -----------------------------------------------------------------
  "Ba Sing Se": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Enters tapped unless you control a basic land",
      }),
      manaAbility("G"),
      activated({
        mana: "{2}{G}",
        tap: true,
        sorcerySpeed: true,
        targets: [LAND_YOU_CONTROL],
        effects: fx.earthbend(ref.target(), 2),
        label: "Earthbend 2",
      }),
    ],
  },
  // --- Green -----------------------------------------------------------------
  "Earthbender Ascension": {
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 2), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })], {
        targets: [LAND_YOU_CONTROL],
        label: "Earthbend 2, then a basic land",
      }),
      triggered(
        when.landfall,
        [
          fx.counters(ref.self, "quest"),
          // "When you do, if it has four or more quest counters": "if…" condition of the reflexive ability, checked when it
          // triggers and again on resolution (603.4).
          ...fx.when(
            cond.counterAtLeast("quest", 4),
            fx.reflexive(
              [target.creature("t", { controller: "you" })],
              fx.when(
                cond.counterAtLeast("quest", 4),
                fx.addCounters(ref.target(), 1),
                fx.modify(ref.target(), { addKeywords: ["trample"] }),
              ),
            ),
          ),
        ],
        { label: "Quest counter; at 4 or more, +1/+1 counter and trample" },
      ),
    ],
  },

  // --- Lot M2 -----------------------------------------------------------------
  "Callous Inspector": {
    abilities: [triggered(when.diesSelf, [fx.damage(1, ref.you), fx.createTokens(CLUE)], { label: "1 damage to you, a Clue" })],
  },
  "Deadly Precision": {
    additionalCost: {
      sacrifice: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, count: 1, orPay: cost("{4}") },
    },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Obsessive Pursuit": {
    abilities: [
      triggered(when.entersSelf, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Lose 1 life, a Clue" }),
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(CLUE)], { label: "Lose 1 life, a Clue" }),
      triggered(
        when.attackWith(1),
        [
          fx.addCounters(ref.target(), amount.sacrificedThisTurn),
          ...fx.when(cond.amountAtLeast(amount.sacrificedThisTurn, 3), fx.modify(ref.target(), { addKeywords: ["lifelink"] })),
        ],
        {
          targets: [target.creature("t", { attacking: true })],
          label: "X +1/+1 counters (permanents sacrificed this turn)",
        },
      ),
    ],
  },
  "Wan Shi Tong, Librarian": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, amount.sourceX), fx.draw(amount.per(amount.sourceX, 2))], {
        label: "X +1/+1 counters, draw X/2 cards",
      }),
      triggered(when.search("opponent"), [fx.addCounters(ref.self, 1), fx.draw(1)], { label: "+1/+1 counter, draw" }),
    ],
  },
  "Day of Black Sun": {
    spell: spell(
      [],
      [
        fx.modifyAll({ types: ["Creature"], compare: [cmp.manaValue("<=", amount.x)] }, { loseAllAbilities: true }),
        fx.destroyAll({ types: ["Creature"], compare: [cmp.manaValue("<=", amount.x)] }),
      ],
    ),
  },
  "Raven Eagle": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.exileCard(ref.target(), { name: "c", filter: { types: ["Creature"] } }),
            ...fx.when(cond.v("c"), fx.createTokens(CLUE)),
          ],
          { targets: [target.optional(target.cardInGraveyard("t", {}, "any"))], label: "Exile one card from a graveyard" },
        ),
      ),
      triggered(when.draw(2), fx.drain(1), { label: "Each opponent loses 1 life and you gain 1 life" }),
    ],
  },

  // --- Lot M3 -----------------------------------------------------------------
  "Shared Roots": { spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]) },

  // --- Lot M4 -----------------------------------------------------------------
  "Momo, Friendly Flier": {
    abilities: [
      costReducer(
        { types: ["Creature"], keyword: "flying", notSubtype: "Lemur" },
        1,
        "First flying creature spell of the turn: {1} less",
        {
          condition: cond.all(
            cond.yourTurn,
            cond.not(
              cond.amountAtLeast(
                amount.turnEvents({ event: "cast", who: "you", types: ["Creature"], keyword: "flying", notSubtype: "Lemur" }),
                1,
              ),
            ),
          ),
        },
      ),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", keyword: "flying", other: true }),
        [fx.pump(ref.self, 1, 1)],
        {
          label: "+1/+1 until end of turn",
        },
      ),
    ],
  },
  "The Legend of Roku": {
    abilities: [
      chapter([1], [fx.exileTop(ref.you, 3, "r"), fx.grantPlay(ref.stored("r"), { untilYourNextTurn: true })], {
        label: "Exiles the top three cards, playable until the end of your next turn",
      }),
      chapter([2], [fx.addManaChoice(1)], { label: "One mana of any color" }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Returns transformed",
      }),
    ],
  },
  "Avatar Roku": {
    // Firebending 4: read from the text.
    abilities: [
      activated({
        mana: "{8}",
        effects: [fx.createTokens(DRAGON_FIREBENDING)],
        label: "A 4/4 flying Dragon with firebending 4",
      }),
    ],
  },

  // --- Lot M6 -----------------------------------------------------------------
  "Abandoned Air Temple": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Enters tapped unless you control a basic land",
      }),
      manaAbility("W"),
      activated({
        mana: "{3}{W}",
        tap: true,
        effects: [fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1)],
        label: "A +1/+1 counter on each creature you control",
      }),
    ],
  },
  "Avatar's Wrath": {
    rules: { exileOnResolve: true },
    spell: spell(
      [target.upTo(1, target.creature())],
      [
        fx.airbend(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.target())),
        fx.untilYourNextTurn({ castLimit: { who: "you", from: "elsewhere" } }, ref.eachOpponent),
      ],
    ),
  },
  "Aang, at the Crossroads": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, {
            count: 1,
            filter: { types: ["Creature"], maxManaValue: 4 },
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "A creature with mana value 4 or less among the top five" },
      ),
      triggered(
        when.leaves({ types: ["Creature"], controller: "you", other: true }),
        [fx.delayedAt("nextUpkeep", [fx.transform(ref.self)])],
        {
          label: "Transforms at the beginning of the next upkeep",
        },
      ),
    ],
  },
  "Aang, Destined Savior": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you", anyOf: [{ types: ["Creature"] }] },
        { addKeywords: ["vigilance"] },
        {
          label: "Land creatures you control have vigilance",
        },
      ),
      triggered(when.yourCombat, fx.earthbend(ref.target(), 2), {
        targets: [target.permanent("t", ["Land"], { controller: "you" }, "land you control")],
        label: "Earthbend 2",
      }),
    ],
  },
  "Aang, Swift Savior": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [
          target.upTo(1, {
            id: "t",
            label: "other creature or spell",
            filter: { objects: { types: ["Creature"], other: true }, spells: {} },
          }),
        ],
        label: "Airbend",
      }),
      activated({
        mana: "{8}",
        waterbend: true,
        effects: [fx.transform(ref.self)],
        label: "Waterbend {8}: transform Aang",
      }),
    ],
  },
  "Aang and La, Ocean's Fury": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCountersAll({ types: ["Creature"], controller: "you", tapped: true }, 1)], {
        label: "+1/+1 counter on each tapped creature you control",
      }),
    ],
  },
  "Airbender Ascension": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Airbend",
      }),
      triggered(when.enters({ types: ["Creature"], controller: "you" }), [fx.counters(ref.self, "quest")], {
        label: "A quest counter",
      }),
      triggered(when.yourEndStep, [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"))], {
        condition: cond.counterAtLeast("quest", 4),
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Exiles, then returns a creature you control",
      }),
    ],
  },
  "Appa, Steadfast Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.airbend(ref.target())], {
        targets: [{ ...target.nonland("t", { controller: "you", other: true }), count: 20, optional: true }],
        label: "Airbend nonland permanents you control",
      }),
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.createTokens(ALLY)], { label: "A 1/1 Ally" }),
    ],
  },
  "Heartless Act": {
    spell: modal(
      mode(
        "Destroys a creature with no counters",
        [target.creature("t", { not: { withCounter: "any" } })],
        [fx.destroy(ref.target())],
      ),
      mode("Removes up to three counters", [target.creature("u")], [fx.removeCounters(ref.target("u"), 3)]),
    ),
  },
  "Price of Freedom": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Land"], { controller: "opponent" }, "artifact or land an opponent controls")],
      [
        fx.destroy(ref.target()),
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        fx.draw(1),
      ],
    ),
  },
  "Combustion Technique": {
    spell: spell(
      [target.creature()],
      [fx.exileIfDies(ref.target()), fx.damage(amount.plus(2, amount.countIn("graveyard", { subtype: "Lesson" })), ref.target())],
    ),
  },
  "Iroh's Demonstration": {
    spell: modal(
      mode(
        "1 damage to each creature your opponents control",
        [],
        [fx.damageAll(1, { types: ["Creature"], controller: "opponent" })],
      ),
      mode("4 damage to a creature", [target.creature()], [fx.damage(4, ref.target())]),
    ),
  },
  "Firebending Lesson": {
    kicker: kicker("{4}"),
    spell: spell([target.creature()], [fx.damage(amount.kicked(5, 2), ref.target())]),
  },
  "Accumulate Wisdom": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Lesson" }), 3),
          fx.lookAtTop(3, { count: 3, to: { to: "hand" }, rest: "bottom" }),
        ),
        ...fx.when(
          cond.not(cond.amountAtLeast(amount.countIn("graveyard", { subtype: "Lesson" }), 3)),
          fx.lookAtTop(3, { count: 1, to: { to: "hand" }, rest: "bottom" }),
        ),
      ],
    ),
  },
  "Abandon Attachments": {
    spell: spell([], [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))]),
  },
  "It'll Quench Ya!": {
    spell: spell([target.spell()], fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target()))),
  },
  "Realm of Koh": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.controls({ types: ["Land"], basic: true })),
        label: "Enters tapped unless you control a basic land",
      }),
      manaAbility("B"),
      activated({ mana: "{3}{B}", tap: true, effects: [fx.createTokens(SPIRIT_KOH)], label: "A 1/1 Spirit" }),
    ],
  },
};
