/** Wilds of Eldraine — multicolored cards. */
import type { ManaRestriction, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CELEBRATION,
  chapter,
  cond,
  createRole,
  entersWith,
  FOOD,
  fx,
  MONSTER_ROLE,
  mode,
  RAT_NO_BLOCK,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/**
 * Troyan: "Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana
 * costs".
 */
const TROYAN_MANA: ManaRestriction = { spell: { anyOf: [{ minManaValue: 5 }, { hasX: true }] } };

/** "Whenever you tap an untapped creature an opponent controls" (Hylda, Sharae). */
const YOU_TAP_OPPONENT_CREATURE: TriggerSpec = {
  on: "taps",
  who: { types: ["Creature"], controller: "opponent" },
  byYou: true,
};
/** Elemental: 4/4 white and blue creature (Hylda of the Icy Crown). */
const ELEMENTAL_WU: TokenSpec = {
  name: "Elemental",
  colors: ["W", "U"],
  types: ["Creature"],
  subtypes: ["Elemental"],
  power: 4,
  toughness: 4,
};

export const MULTI: Record<string, CardScript> = {
  "The Apprentice's Folly": {
    abilities: [
      chapter([1, 2], [fx.copyToken(ref.target(), { nonlegendary: true, addSubtypes: ["Reflection"], addKeywords: ["haste"] })], {
        targets: [
          target.creature("t", {
            controller: "you",
            token: false,
            not: { sameNameAs: { token: true, controller: "you" } },
          }),
        ],
        label: "Chapters I and II — A token copy (Reflection, nonlegendary, haste)",
      }),
      chapter([3], [fx.sacrifice(ref.you, { subtype: "Reflection" }, 99)], { label: "Chapter III — Sacrifice your Reflections" }),
    ],
  },
  "Yenna, Redtooth Regent": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          target.permanent(
            "t",
            ["Enchantment"],
            { controller: "you", not: { sameNameAs: { controller: "you" } } },
            "enchantment",
          ),
        ],
        effects: [
          fx.copyToken(ref.target(), { nonlegendary: true, store: "y" }),
          ...fx.when(cond.refMatches(ref.stored("y"), { subtype: "Aura" }), fx.untap(ref.self), fx.scry(2)),
        ],
        label: "A token copy (nonlegendary) of one of your enchantments; an Aura: untap Yenna, scry 2",
      }),
    ],
  },
  // Flying read from the text.
  "Likeness Looter": {
    abilities: [
      activated({ tap: true, effects: fx.loot(1), label: "Loot: draw a card, then discard a card" }),
      activated({
        mana: "{X}",
        sorcerySpeed: true,
        // "Target creature card with mana value X": checked with the announced X, and again on resolution.
        targets: [
          {
            ...target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card with mana value X"),
            manaValueAmount: amount.x,
          },
        ],
        effects: [
          fx.becomeCopy(ref.self, ref.target(), "permanent", {
            addKeywords: ["flying"],
            keepAbilities: [1],
            ifManaValue: amount.x,
          }),
        ],
        label: "Becomes a copy of a creature card with MV X in your graveyard (with flying and this ability)",
      }),
    ],
  },
  "Faunsbane Troll": {
    abilities: [
      triggered(when.entersSelf, createRole(MONSTER_ROLE, ref.self), { label: "A Monster Role attached to it" }),
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { subtype: "Aura", attached: "toSource" }, count: 1 },
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.exileIfDies(ref.target()), fx.fight(ref.self, ref.target())],
        label: "Sacrifice an attached Aura: it fights a creature (exiled if it dies this turn)",
      }),
    ],
  },
  // Menace read from the text. As for Will, Scion of Peace: the reduction is granted to Rowan for the turn.
  "Rowan, Scion of War": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        // As Will, Scion of Peace: X fixed as the ability resolves.
        effects: [fx.thisTurn({ spellCost: { filter: { colors: ["B", "R"] }, reduce: amount.lifeLostThisTurn } })],
        label: "Your black and/or red spells cost {X} less this turn",
      }),
    ],
  },
  "Hylda of the Icy Crown": {
    abilities: [
      // "You may pay {1}. When you do, choose one —": the mode is chosen by the reflexive ability.
      triggered(
        YOU_TAP_OPPONENT_CREATURE,
        fx.mayPay(
          "{1}",
          "Pay {1}?",
          fx.reflexiveModal([
            mode("A 4/4 Elemental", [], [fx.createTokens(ELEMENTAL_WU)]),
            mode(
              "Put a +1/+1 counter on each creature you control",
              [],
              [fx.addCountersAll({ types: ["Creature"], controller: "you" }, 1)],
            ),
            mode("Scry 2, then draw a card", [], [fx.scry(2), fx.draw(1)]),
          ]),
        ),
        { label: "You tap a creature an opponent controls: you may pay {1}" },
      ),
    ],
  },
  "Sharae of Numbing Depths": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap a creature an opponent controls, stun counter",
      }),
      triggered(YOU_TAP_OPPONENT_CREATURE, [fx.draw(1)], {
        oncePerTurn: true,
        label: "You tap a creature an opponent controls: draw a card (once each turn)",
      }),
    ],
  },
  "Eriette of the Charmed Apple": {
    abilities: [
      staticAbility(
        { types: ["Creature"], enchanted: "byYou" },
        { addBlockRules: [{ cantAttackPlayer: "you", label: "Can't attack Eriette's controller" }] },
        { label: "Creatures enchanted by your Auras can't attack you" },
      ),
      triggered(
        when.yourEndStep,
        [
          fx.loseLife(amount.count({ subtype: "Aura", controller: "you" }), ref.eachOpponent),
          fx.gainLife(amount.count({ subtype: "Aura", controller: "you" })),
        ],
        { label: "Each opponent loses X life, you gain X life (X: your Auras)" },
      ),
    ],
  },
  "Syr Armont, the Redeemer": {
    abilities: [
      triggered(when.entersSelf, createRole(MONSTER_ROLE), {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "A Monster Role attached to another creature you control",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", enchanted: true },
        { power: 1, toughness: 1 },
        { label: "Your enchanted creatures: +1/+1" },
      ),
    ],
  },
  "Ash, Party Crasher": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], {
        condition: CELEBRATION,
        label: "Celebration — a +1/+1 counter on Ash",
      }),
    ],
  },
  "The Goose Mother": {
    abilities: [
      entersWith({ counters: amount.x, label: "Enters with X +1/+1 counters" }),
      // "half X Food tokens, rounded up": (X + 1) / 2, rounded down.
      triggered(when.entersSelf, [fx.createTokens(FOOD, amount.per(amount.plus(amount.sourceX, 1), 2))], {
        label: "Half X Foods (rounded up)",
      }),
      triggered(
        when.attacksSelf,
        [fx.sacrifice(ref.you, { subtype: "Food" }, 1, { optional: true, store: "f" }), ...fx.when(cond.v("f"), fx.draw(1))],
        { label: "You may sacrifice a Food to draw a card" },
      ),
    ],
  },
  "Greta, Sweettooth Scourge": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" }),
      activated({
        mana: "{G}",
        sacrificeOther: { filter: { subtype: "Food" } },
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "A +1/+1 counter on a creature",
      }),
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { subtype: "Food" } },
        effects: [fx.draw(1), fx.loseLife(1)],
        label: "Draw a card, and you lose 1 life",
      }),
    ],
  },
  "Neva, Stalked by Nightmares": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }] },
            "you",
            "creature or enchantment card in your graveyard",
          ),
        ],
        label: "Returns a creature or enchantment card to hand",
      }),
      triggered(
        { on: "leaves", who: { types: ["Enchantment"], controller: "you" }, to: "graveyard" },
        [fx.addCounters(ref.self, 1), fx.scry(1)],
        { label: "An enchantment put into the graveyard: a +1/+1 counter, then scry 1" },
      ),
    ],
  },
  "Obyra, Dreaming Duelist": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Faerie", controller: "you", other: true }),
        [fx.loseLife(1, ref.eachOpponent)],
        { label: "Another Faerie enters: each opponent loses 1 life" },
      ),
    ],
  },
  "Totentanz, Swarm Piper": {
    abilities: [
      // "Totentanz or another nontoken creature you control": Totentanz is itself nontoken.
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(RAT_NO_BLOCK)], {
        label: "A 1/1 Rat that can't block",
      }),
      activated({
        mana: "{1}{B}",
        targets: [target.creature("t", { subtype: "Rat", attacking: true, controller: "you" })],
        effects: [fx.pump(ref.target(), 0, 0, ["deathtouch"])],
        label: "An attacking Rat gains deathtouch",
      }),
    ],
  },
  "Troyan, Gutsy Explorer": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.addManaChoice(1, ["G"], TROYAN_MANA), fx.addManaChoice(1, ["U"], TROYAN_MANA)],
        label: "Add {G}{U} (spells with MV 5 or greater)",
      }),
      activated({ mana: "{U}", tap: true, effects: fx.loot(1), label: "Draw, then discard one card" }),
    ],
  },
  "Will, Scion of Peace": {
    abilities: [
      // A player effect for the turn (it doesn't depend on Will staying), X fixed as the ability resolves (ruling).
      activated({
        tap: true,
        sorcerySpeed: true,
        effects: [fx.thisTurn({ spellCost: { filter: { colors: ["W", "U"] }, reduce: amount.lifeGainedThisTurn } })],
        label: "Your white and/or blue spells cost {X} less this turn",
      }),
    ],
  },
};
