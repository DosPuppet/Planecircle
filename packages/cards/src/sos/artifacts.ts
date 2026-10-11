/** Secrets of Strixhaven — colorless cards and lands. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  entersWith,
  fx,
  INSTANT_SORCERY,
  manaAbility,
  mode,
  ref,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** Lands of the set: "enters tapped; {T}: Add {X} or {Y}; {2}{X}{Y}, {T}: Surveil 1". */
const surveilLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Enters tapped" }),
    manaAbility([a, b]),
    activated({ mana: `{2}{${a}}{${b}}`, tap: true, effects: [fx.surveil(1)], label: "Surveil 1" }),
  ],
});

/** "Enters tapped unless you control two or more other lands; {T}: Add {X} or {Y}". */
const slowLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({
      tapped: true,
      condition: cond.not(cond.controls({ types: ["Land"], other: true }, 2)),
      label: "Tapped unless you control two or more other lands",
    }),
    manaAbility([a, b]),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Avatar creatures (converge) ------------------------------------------
  "The Dawning Archaic": {
    // Reach: read from the text.
    costReduction: { generic: amount.countIn("graveyard", INSTANT_SORCERY) },
    abilities: [
      triggered(when.attacksSelf, [fx.castNow(ref.target(), { free: true, after: "exile" })], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card from your graveyard")],
        label: "Cast an instant or sorcery from your graveyard for free",
      }),
    ],
  },
  "Rancorous Archaic": {
    abilities: [entersWith({ counters: amount.colorsSpent, label: "Converge: a +1/+1 counter for each color of mana spent" })],
  },
  "Sundering Archaic": {
    abilities: [
      triggered(when.entersSelf, [fx.exile(ref.target())], {
        targets: [
          target.nonland(
            "t",
            { controller: "opponent", compare: [cmp.manaValue("<=", amount.colorsSpent)] },
            "nonland permanent an opponent controls with mana value at most the number of colors spent",
          ),
        ],
        label: "Converge: exiles a nonland permanent an opponent controls with mana value at most the number of colors spent",
      }),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "Puts a card from a graveyard on the bottom of its owner's library",
      }),
    ],
  },
  "Transcendent Archaic": {
    // Vigilance: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Draw a card for each color of mana spent, then discard two cards?",
          fx.draw(amount.colorsSpent, ref.you, "drawn"),
          fx.when(cond.v("drawn"), fx.discard(2)),
        ),
        { label: "Converge: draw X cards, then discard two" },
      ),
    ],
  },

  // --- Artifacts --------------------------------------------------------------
  "Biblioplex Tomekeeper": {
    // "Choose up to one": each mode has an optional target (no target = no effect).
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Target creature becomes prepared", [target.optional(target.creature("t"))], [fx.prepare(ref.target())]),
        mode("Target creature stops being prepared", [target.optional(target.creature("t"))], [fx.prepare(ref.target(), false)]),
      ]),
    ],
  },
  "Diary of Dreams": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.counters(ref.self, "page", 1)], {
        label: "A page counter",
      }),
      activated({
        mana: "{5}",
        tap: true,
        reduction: { generic: amount.countersOn(ref.self, "page") },
        effects: [fx.draw(1)],
        label: "Draw a card ({1} less for each page counter)",
      }),
    ],
  },
  "Mage Tower Referee": {
    abilities: [
      triggered(when.castSpell("you", { multicolored: true }), [fx.addCounters(ref.self, 1)], {
        label: "Multicolored spell: a +1/+1 counter",
      }),
    ],
  },
  "Page, Loose Leaf": {
    abilities: [
      manaAbility("C"),
      activated({
        discard: 1,
        discardFilter: { name: "Page, Loose Leaf" },
        effects: [fx.revealUntil(INSTANT_SORCERY)],
        label: "Grandeur: reveal until an instant or sorcery",
      }),
    ],
  },
  "Potioner's Trove": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.instantSorceryCast, 1),
        effects: [fx.gainLife(2)],
        label: "Gain 2 life (after an instant or sorcery this turn)",
      }),
    ],
  },
  "Strixhaven Skycoach": {
    // Flying and Crew 2: read from the text.
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land card?", fx.search(BASIC_LAND, { to: "hand" })), {
        label: "Search for a basic land",
      }),
    ],
  },

  // --- Lands ------------------------------------------------------------------
  "Dreamroot Cascade": slowLand("G", "U"),
  "Fields of Strife": surveilLand("R", "W"),
  "Forum of Amity": surveilLand("W", "B"),
  "Paradox Gardens": surveilLand("G", "U"),
  "Skycoach Waypoint": {
    abilities: [
      manaAbility("C"),
      // "Only creatures with prepare spells can become prepared": `fx.prepare` ignores the others.
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature("t")],
        effects: [fx.prepare(ref.target())],
        label: "Target creature becomes prepared",
      }),
    ],
  },
  "Spectacle Summit": surveilLand("U", "R"),
  "Terramorphic Expanse": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Search for a basic land, put onto the battlefield tapped",
      }),
    ],
  },
  "Titan's Grave": surveilLand("B", "G"),
};
