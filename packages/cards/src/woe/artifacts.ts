/** Wilds of Eldraine — colorless cards and lands. */
import { type Color, type Effect, type LayerMods, msg, type TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  cond,
  entersWith,
  equipAbility,
  fx,
  manaAbility,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

/** "{N}, {T}: Add one mana of any color" (mana ability with a cost, resolved without the stack). */
const anyColor = (mana: string, opts: { tap?: boolean; oncePerTurn?: boolean } = {}) =>
  activated({ mana, ...opts, effects: [fx.addManaChoice(1)], label: "Add one mana of any color" });

/** Food: "{2}, {T}, Sacrifice [this permanent]: You gain 3 life." */
const foodAbility = () =>
  activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "Food: gain 3 life" });

/**
 * "Restless" lands: enter tapped; {T}: one of the two colors; the land becomes a creature until end of turn (it is
 * still a land); ability when it attacks.
 */
const restless = (
  colors: [Color, Color],
  animate: { mana: string; subtype: string; power: number; toughness: number; extra?: LayerMods },
  onAttack: { effects: Effect[]; targets?: TargetSpec[]; label: string },
): CardScript => ({
  abilities: [
    entersWith({ tapped: true, label: "Enters tapped" }),
    manaAbility(colors),
    activated({
      mana: animate.mana,
      effects: [
        fx.modify(ref.self, {
          addTypes: ["Creature"],
          addSubtypes: [animate.subtype],
          setPower: animate.power,
          setToughness: animate.toughness,
          setColors: colors,
          ...animate.extra,
        }),
      ],
      label: msg("Becomes a {power}/{toughness} creature", { power: animate.power, toughness: animate.toughness }),
    }),
    triggered(when.attacksSelf, onAttack.effects, { targets: onAttack.targets, label: onAttack.label }),
  ],
});

/** Everflame, Heroes' Legacy (The Irencrag transformed): Equip {3} and "Equipped creature gets +3/+3." */
const EVERFLAME_EQUIP = equipAbility({ mana: "{3}", label: msg("Equip {cost}", { cost: "{3}" }) });

export const ARTIFACTS: Record<string, CardScript> = {
  "Collector's Vault": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        effects: [...fx.loot(1), fx.createTokens(TREASURE)],
        label: "Draw, discard, then a Treasure",
      }),
    ],
  },
  "Eriette's Tempting Apple": {
    abilities: [
      triggered(when.entersSelf, [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"])], {
        targets: [target.creature()],
        label: "Gain control of a creature until end of turn, untap it, it gains haste",
      }),
      foodAbility(),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.loseLife(3, ref.target())],
        label: "An opponent loses 3 life",
      }),
    ],
  },
  Gingerbrute: {
    abilities: [
      activated({
        mana: "{1}",
        effects: [
          fx.modify(ref.self, {
            addBlockRules: [block.notBy({ not: { keyword: "haste" } }, "Can't be blocked except by creatures with haste")],
          }),
        ],
        label: "Can't be blocked except by creatures with haste this turn",
      }),
      foodAbility(),
    ],
  },
  "Hylda's Crown of Winter": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        reduction: { generic: 1, condition: cond.yourTurn },
        label: "Tap a creature (costs {1} less during your turn)",
      }),
      activated({
        mana: "{3}",
        sacrifice: true,
        effects: [fx.draw(amount.count({ types: ["Creature"], controller: "opponent", tapped: true }))],
        label: "Draw a card for each tapped creature your opponents control",
      }),
    ],
  },
  "The Irencrag": {
    // "… gains equip {3} and '…' and loses all other abilities": one modification, its abilities lost then the two
    // new ones added (layer 6, in that order).
    abilities: [
      manaAbility("C", 1),
      triggered(
        when.enters({ types: ["Creature"], legendary: true, controller: "you" }),
        fx.may(
          "Have The Irencrag become the legendary Equipment Everflame, Heroes' Legacy?",
          fx.modify(
            ref.self,
            {
              setName: "Everflame, Heroes' Legacy",
              addSubtypes: ["Equipment"],
              loseAllAbilities: true,
              addAbilities: [
                EVERFLAME_EQUIP,
                staticAbility("attached", { power: 3, toughness: 3 }, { label: "Equipped creature gets +3/+3" }),
              ],
            },
            "permanent",
          ),
        ),
        { label: "May become Everflame, Heroes' Legacy" },
      ),
    ],
  },
  "Prophetic Prism": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }), anyColor("{1}", { tap: true })],
  },
  "Scarecrow Guide": { abilities: [anyColor("{1}", { oncePerTurn: true })] },
  "Syr Ginger, the Meal Ender": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["trample", "hexproof", "haste"] },
        {
          condition: cond.battlefieldCount({ types: ["Planeswalker"], controller: "opponent" }, 1),
          label: "Trample, hexproof and haste as long as an opponent controls a planeswalker",
        },
      ),
      triggered(
        { on: "leaves", who: { types: ["Artifact"], controller: "you", other: true }, to: "graveyard" },
        [fx.addCounters(ref.self, 1), fx.scry(1)],
        { label: "Another artifact put into the graveyard: a +1/+1 counter and scry 1" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(amount.powerOf(ref.self))],
        label: "Gain life equal to its power",
      }),
    ],
  },
  "Three Bowls of Porridge": {
    // "Choose one that hasn't been chosen": each mode is an ability that can be activated only once.
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        once: true,
        targets: [target.creature()],
        effects: [fx.damage(2, ref.target())],
        label: "2 damage to a creature",
      }),
      activated({
        mana: "{2}",
        tap: true,
        once: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Tap a creature",
      }),
      activated({
        mana: "{2}",
        tap: true,
        once: true,
        effects: [fx.sacrificeIt(ref.self), fx.gainLife(3)],
        label: "Sacrifice it and gain 3 life",
      }),
    ],
  },

  // --- Lands ----------------------------------------------------------------
  "Crystal Grotto": {
    abilities: [triggered(when.entersSelf, [fx.scry(1)], { label: "Scry 1" }), manaAbility("C"), anyColor("{1}", { tap: true })],
  },
  "Edgewall Inn": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      manaAbility([...ALL_COLORS], 1, { produceChosen: true }),
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        targets: [target.cardInGraveyard("t", { adventure: true }, "you", "card with an Adventure in your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "Return a card with an Adventure to your hand",
      }),
    ],
  },
  "Restless Bivouac": restless(
    ["R", "W"],
    { mana: "{1}{R}{W}", subtype: "Ox", power: 2, toughness: 2 },
    {
      effects: [fx.addCounters(ref.target(), 1)],
      targets: [target.creature("t", { controller: "you" })],
      label: "Put a +1/+1 counter on a creature you control",
    },
  ),
  "Restless Fortress": restless(
    ["W", "B"],
    { mana: "{2}{W}{B}", subtype: "Nightmare", power: 1, toughness: 4 },
    {
      effects: [fx.loseLife(2, ref.defendingPlayer), fx.gainLife(2)],
      label: "Defending player loses 2 life and you gain 2 life",
    },
  ),
  "Restless Spire": restless(
    ["U", "R"],
    {
      mana: "{U}{R}",
      subtype: "Elemental",
      power: 2,
      toughness: 1,
      extra: {
        addAbilities: [
          staticAbility(
            "self",
            { addKeywords: ["firstStrike"] },
            { condition: cond.yourTurn, label: "Has first strike during your turn" },
          ),
        ],
      },
    },
    { effects: [fx.scry(1)], label: "Scry 1" },
  ),
  "Restless Vinestalk": restless(
    ["G", "U"],
    { mana: "{3}{G}{U}", subtype: "Plant", power: 5, toughness: 5, extra: { addKeywords: ["trample"] } },
    {
      effects: [fx.modify(ref.target(), { setPower: 3, setToughness: 3 })],
      targets: [target.optional(target.creature("t", { other: true }))],
      label: "Up to one other creature has base power and toughness 3/3",
    },
  ),
};
