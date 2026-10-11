/** Final Fantasy — black cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  flashback,
  fx,
  HORROR,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  tiered,
  triggered,
  triggeredModal,
  when,
  wizard,
} from "./common";

const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

/** Vincent's Limit Break: "when this creature dies, return it tapped" and a chosen base power and toughness. */
const limitBreak = (power: number, toughness: number) => [
  fx.modify(ref.target(), {
    setPower: power,
    setToughness: toughness,
    addAbilities: [triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], { label: "Returns tapped" })],
  }),
];

export const BLACK: Record<string, CardScript> = {
  Ahriman: {
    abilities: [
      activated({
        mana: "{3}",
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.draw(1)],
        label: "Draw",
      }),
    ],
  },
  "Al Bhed Salvagers": {
    abilities: [
      triggered(when.dies({ ...CREATURE_OR_ARTIFACT, controller: "you" }), fx.drain(1, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "Drain 1",
      }),
    ],
  },
  "Black Mage's Rod": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          addSubtypes: ["Wizard"],
          addAbilities: [
            triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(1, ref.eachOpponent)], {
              label: "1 damage to each opponent",
            }),
          ],
        },
        { label: "+1/+0, Wizard" },
      ),
    ],
  },
  "Circle of Power": {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.loseLife(2),
        wizard(),
        fx.pumpAll({ types: ["Creature"], subtype: "Wizard", controller: "you" }, 1, 0, ["lifelink"]),
      ],
    ),
  },
  "Cornered by Black Mages": {
    spell: spell([target.player("t", "opponent")], [fx.sacrifice(ref.target(), { types: ["Creature"] }), wizard()]),
  },
  "Dark Confidant": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "c" }), fx.loseLife(amount.manaValueOf(ref.stored("c")))],
        { label: "Top card into hand, lose life equal to its mana value" },
      ),
    ],
  },
  "Demon Wall": {
    abilities: [
      // "As long as it has a counter on it": any kind of counter.
      staticAbility(
        "self",
        { removeKeywords: ["defender"] },
        { condition: cond.sourceMatches({ withCounter: "any" }), label: "Can attack (counter)" },
      ),
      activated({ mana: "{5}{B}", effects: [fx.addCounters(ref.self, 2)], label: "Two +1/+1 counters" }),
    ],
  },
  "Evil Reawakened": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "+1/+1", n: 2 } })],
    ),
  },
  "Fight On!": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card"))],
      [fx.toHand(ref.target())],
    ),
  },
  "The Final Days": {
    castOptions: [flashback("{4}{B}{B}")],
    spell: spell(
      [],
      [
        fx.when(cond.not(cond.spellCastFromGraveyard), fx.createTappedTokens(HORROR, 2)),
        fx.when(cond.spellCastFromGraveyard, fx.createTappedTokens(HORROR, amount.countIn("graveyard", { types: ["Creature"] }))),
      ],
    ),
  },
  "Gaius van Baelsar": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Each player sacrifices a creature token",
            [],
            [fx.sacrifice(ref.eachPlayer, { types: ["Creature"], token: true })],
          ),
          mode(
            "Each player sacrifices a nontoken creature",
            [],
            [fx.sacrifice(ref.eachPlayer, { types: ["Creature"], token: false })],
          ),
          mode("Each player sacrifices an enchantment", [], [fx.sacrifice(ref.eachPlayer, { types: ["Enchantment"] })]),
        ],
        { label: "Each player sacrifices" },
      ),
    ],
  },
  Hecteyes: {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "Each opponent discards" })],
  },
  Malboro: {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent), fx.exileTop(ref.eachOpponent, 3, "m")],
        { label: "Bad Breath" },
      ),
    ],
  },
  "Namazu Trader": {
    abilities: [
      triggered(when.entersSelf, [fx.loseLife(1), fx.createTokens(TREASURE)], { label: "Lose 1 life, Treasure" }),
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, { ...CREATURE_OR_ARTIFACT, other: true }, 1, { optional: true, store: "s" }),
          fx.when(cond.v("s"), fx.surveil(2)),
        ],
        { label: "Sacrifice, surveil 2" },
      ),
    ],
  },
  Overkill: { spell: spell([target.creature("t")], [fx.pump(ref.target(), 0, -9999)]) },
  "Phantom Train": {
    abilities: [
      activated({
        sacrificeOther: { filter: { ...CREATURE_OR_ARTIFACT, other: true } },
        effects: [fx.addCounters(ref.self, 1), fx.animateVehicle(), fx.modify(ref.self, { addSubtypes: ["Spirit"] })],
        label: "+1/+1 counter, becomes a Spirit creature",
      }),
    ],
  },
  "Poison the Waters": {
    spell: modal(
      mode("All creatures get -1/-1", [], [fx.pumpAll({ types: ["Creature"] }, -1, -1)]),
      mode(
        "Discard an artifact or creature",
        [target.player("t")],
        [fx.discard(1, ref.target(), { filter: CREATURE_OR_ARTIFACT, chooser: "controller" })],
      ),
    ),
  },
  "Qutrub Forayer": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Destroy a creature dealt damage this turn",
            [target.creature("t", { damaged: true })],
            [fx.destroy(ref.target())],
          ),
          mode(
            "Exile up to two cards from a graveyard",
            [{ ...target.upTo(2, target.cardInGraveyard("t", {}, "any", "card")), samePlayer: true }],
            [fx.exileCard(ref.target())],
          ),
        ],
        { label: "Choose one" },
      ),
    ],
  },
  "Resentful Revelation": {
    castOptions: [flashback("{6}{B}")],
    spell: spell([], [fx.lookAtTop(3, { count: 1, rest: "graveyard" })]),
  },
  "Sephiroth's Intervention": { spell: spell([target.creature("t")], [fx.destroy(ref.target()), fx.gainLife(2)]) },
  "Shambling Cie'th": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        fx.mayPay("{B}", "Pay {B} to return it to your hand?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Returns to hand" },
      ),
    ],
  },
  "Shinra Reinforcements": {
    abilities: [triggered(when.entersSelf, [fx.mill(3), fx.gainLife(3)], { label: "Mill 3, +3 life" })],
  },
  Tonberry: {
    abilities: [
      entersWith({ tapped: true, counters: 1, counterKind: "stun" }),
      staticAbility("self", { addKeywords: ["firstStrike", "deathtouch"] }, { condition: cond.yourTurn, label: "Chef's Knife" }),
    ],
  },
  "Undercity Dire Rat": { abilities: [triggered(when.diesSelf, [fx.createTokens(TREASURE)], { label: "Treasure" })] },
  "Vincent's Limit Break": {
    spell: tiered(
      {
        cost: "{0}",
        label: "Galian Beast (3/2)",
        targets: [target.creature("t", { controller: "you" })],
        effects: limitBreak(3, 2),
      },
      {
        cost: "{1}",
        label: "Death Gigas (5/2)",
        targets: [target.creature("t", { controller: "you" })],
        effects: limitBreak(5, 2),
      },
      {
        cost: "{3}",
        label: "Hellmasker (7/2)",
        targets: [target.creature("t", { controller: "you" })],
        effects: limitBreak(7, 2),
      },
    ),
  },
};
