/** Teenage Mutant Ninja Turtles — unique cards (lot C). */
import { parseManaCost } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  playerStatic,
  protection,
  RAT,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Disappear: "if a permanent left the battlefield under your control this turn". */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);

export const UNIQUE: Record<string, CardScript> = {
  "April O'Neil, Hacktivist": {
    abilities: [
      triggered(when.yourEndStep, [fx.draw(amount.turnEvents({ event: "cast", who: "you", distinct: "type" }))], {
        label: "Draw a card for each card type among spells you've cast this turn",
      }),
    ],
  },
  "Fugitive Droid": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        {
          condition: cond.amountAtLeast(
            amount.turnEvents({ event: "zone", to: "battlefield", types: ["Artifact"], who: "you" }),
            1,
          ),
          label: "Can't be blocked if an artifact entered under your control this turn",
        },
      ),
      activated({
        mana: "{U}",
        sacrifice: true,
        targets: [
          {
            id: "t",
            label: "spell that targets an artifact or creature you control",
            filter: { spells: {}, spellsTargeting: { types: ["Artifact", "Creature"], controller: "you" } },
          },
        ],
        effects: [fx.counter(ref.target())],
        label: "Counter a spell that targets an artifact or creature you control",
      }),
    ],
  },
  "Mondo Gecko": {
    abilities: [
      activated({
        mana: "{1}",
        discard: 1,
        effects: [
          fx.chooseForSelf("color"),
          fx.modify(ref.self, {
            setColorsChosen: true,
            addProtections: [protection.hexproofFrom({ chosen: "color" }, "Hexproof from the chosen color")],
          }),
        ],
        label: "Becomes the chosen color and gains hexproof from it",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(amount.colorsAmong())], {
        label: "Draw a card for each color among your permanents",
      }),
    ],
  },
  "Ninja Teen": {
    abilities: [
      triggered(when.leaves({ types: ["Creature"], controller: "you" }), [fx.loseLife(1, ref.eachOpponent)], {
        label: "A creature you control leaves: each opponent loses 1 life",
      }),
    ],
    classLevels: [
      [
        staticAbility(
          { types: ["Creature"], controller: "you" },
          { power: 1, addKeywords: ["menace"] },
          {
            label: "Creatures you control get +1/+0 and have menace",
          },
        ),
      ],
      [
        playerStatic({
          playFrom: { zone: "graveyard", filter: { types: ["Creature"] }, what: "spells", sneak: parseManaCost("{3}{B}") },
          label: "Creature cards in your graveyard have sneak {3}{B}",
        }),
      ],
    ],
  },
  "Rat King, Verminister": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(RAT), fx.addCounters(ref.self, 1)], {
        condition: DISAPPEAR,
        label: "Disappear — A 1/1 Rat and a +1/+1 counter",
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Rat" }, count: 3, includeSelf: true },
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
        effects: [fx.moveTo(ref.sameNameInGraveyard(ref.target()), { to: "battlefield", tapped: true })],
        label: "Sacrifice three Rats: the target card and those with the same name return tapped",
      }),
    ],
  },
  "Don & Raph, Hard Science": {
    // Menace: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          {
            op: "playerEffect",
            ability: {
              nextSpell: { filter: { notTypes: ["Creature"] }, reduce: amount.count({ types: ["Artifact"], controller: "you" }) },
            },
            once: true,
          },
        ],
        { label: "Your next noncreature spell this turn has affinity for artifacts" },
      ),
    ],
  },
  "Mikey & Don, Party Planners": {
    // Ward {2}: read from the text.
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "You may look at the top card of your library" }),
      playerStatic({
        playFrom: {
          zone: "libraryTop",
          filter: { anyOf: [{ types: ["Land"] }, { anySubtype: ["Mutant", "Ninja", "Turtle"] }] },
          counters: 1,
        },
        label: "Play lands and cast Mutant, Ninja or Turtle spells from the top of your library",
      }),
    ],
  },
  "North Wind Avatar": {
    // Flying: read from the text. Outside the game: the sideboard (400.11b); none in Commander.
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.pickFromZone(
            "sideboard",
            {},
            { to: "hand" },
            {
              min: 0,
              prompt: "You may put a card from your sideboard into your hand",
            },
          ),
        ],
        {
          condition: cond.wasCast,
          label: "If you cast it: you may put a card from your sideboard into your hand",
        },
      ),
    ],
  },
};
