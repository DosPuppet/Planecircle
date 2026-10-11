/**
 * The Hobbit — green cards (lot A). Landfall (`when.landfall`), Ferocious (`cond.ferocious`), Bears and Elves.
 * Adventures have one entry per face (the creature under its name, the Adventure spell under its own).
 */
import type { ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  BEAR,
  block,
  blockAbility,
  type CardScript,
  chapter,
  cond,
  costReducer,
  ELF,
  fx,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const YOUR_LANDS: ObjectFilter = { types: ["Land"], controller: "you" };
const YOUR_CREATURE = (id = "t") => target.creature(id, { controller: "you" });
const OPPONENT_CREATURE = (id = "t") => ({
  ...target.creature(id, { controller: "opponent" }),
  label: "creature controlled by an opponent",
});
/** No creature spell cast by you this turn (Radagast: "the first creature spell"). */
const NO_CREATURE_SPELL_YET = cond.not(
  cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you", types: ["Creature"] }), 1),
);

export const GREEN: Record<string, CardScript> = {
  Attercop: {
    abilities: [triggered(when.landfall, [fx.pump(ref.self, 1, 1)], { label: "Landfall — +1/+1 until end of turn" })],
  },
  "Bejeweled Warg": {
    abilities: [
      triggeredModal(
        when.combatDamageToPlayer,
        [
          mode(
            "A +1/+1 counter on a Wolf",
            [target.creature("t", { subtype: "Wolf", controller: "you" })],
            [fx.addCounters(ref.target(), 1)],
          ),
          mode("A Treasure token", [], [fx.createTokens(TREASURE)]),
        ],
        { label: "Combat damage to a player: counter on a Wolf or Treasure" },
      ),
    ],
  },
  // Adventure: the creature (trample read from the text) and the Adventure spell.
  "Beorn, Reluctant Host": {},
  "Till and Tend": { spell: spell([], [fx.extraLandThisTurn]) },
  "Beorn the Fierce": {
    abilities: [
      staticAbility(
        { subtype: "Bear", controller: "you", other: true },
        { power: 2, toughness: 2 },
        { label: "Your other Bears get +2/+2" },
      ),
      triggered(
        when.yourCombat,
        [
          fx.counters(ref.target(), "trample", 1),
          fx.modify(ref.target(), { addSubtypes: ["Bear"] }, "permanent"),
          ...fx.when(cond.controls({ subtype: "Bear" }, 3), fx.draw(2)),
        ],
        {
          targets: [target.upTo(1, YOUR_CREATURE())],
          label: "Trample counter, becomes a Bear; three Bears: draw two cards",
        },
      ),
    ],
  },
  "Beorn's Hospitality": {
    abilities: [
      triggered(when.landfall, [fx.addCounters(ref.target(), 1)], {
        targets: [YOUR_CREATURE()],
        label: "Landfall — a +1/+1 counter on a creature you control",
      }),
      activated({
        mana: "{5}{G}{G}",
        effects: [
          fx.modify(
            ref.self,
            {
              addTypes: ["Creature"],
              addSubtypes: ["Bear"],
              addAbilities: [
                staticAbility(
                  "self",
                  { setPower: 1, setToughness: 1 },
                  { per: YOUR_LANDS, label: "P/T equal to the number of lands you control" },
                ),
              ],
            },
            "permanent",
          ),
        ],
        label: "Becomes a Bear creature (P/T: your lands)",
      }),
    ],
  },
  "Boughside Wanderers": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(4, { filter: { permanent: true }, count: 1, to: { to: "hand" }, rest: "bottom" })],
        { label: "A permanent card among the top four" },
      ),
      triggered(when.landfall, [fx.pump(ref.self, 2, 2)], { label: "Landfall — +2/+2 until end of turn" }),
    ],
  },
  "Cantankerous Keepers": {
    // Affinity for Elves.
    costReduction: { generic: amount.count({ subtype: "Elf", controller: "you" }) },
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m", filter: { subtype: "Elf" } }),
          fx.toHand(ref.filtered(ref.stored("m"), { subtype: "Elf" })),
        ],
        {
          label: "Mill four cards; the milled Elf cards go to hand",
        },
      ),
    ],
  },
  "Dancing from Dark to Dawn": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.addCounters(ref.target(), amount.manaValueOf(ref.eventObject))],
        {
          targets: [YOUR_CREATURE()],
          label: "Creature spell: X +1/+1 counters (its mana value)",
        },
      ),
      triggered(when.landfall, [fx.createTokens(BEAR)], { label: "Landfall — a 2/2 Bear" }),
    ],
  },
  "Down in the Valley": {
    abilities: [
      chapter([1], [fx.search(BASIC_LAND, { to: "hand" })], { label: "I — A basic land to hand" }),
      chapter(
        [2],
        [
          fx.modify(
            ref.self,
            {
              addAbilities: [triggered(when.landfall, [fx.createTokens(ELF)], { label: "Landfall — a 1/1 Elf" })],
            },
            "permanent",
          ),
        ],
        { label: "II — Landfall: a 1/1 Elf" },
      ),
      chapter([3, 4], [fx.pumpAll({ subtype: "Elf", controller: "you" }, 1, 0, ["vigilance"])], {
        label: "III, IV — Your Elves get +1/+0 and gain vigilance",
      }),
    ],
  },
  "Galion, Elvenking's Butler": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // Base P/T equal to Galion's power and toughness (layer 7b).
          fx.modify(ref.target(), {}, "endOfTurn", [amount.powerOf(ref.self), amount.toughnessOf(ref.self)]),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Another creature takes Galion's P/T",
        },
      ),
    ],
  },
  "Gigantic Big Bear": { rules: { cantBeCountered: true } },
  "Guardian of the Halls": {
    abilities: [activated({ mana: "{5}{G}{G}", effects: [fx.addCounters(ref.self, 3)], label: "Three +1/+1 counters" })],
  },
  "Little Bear": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.untap(ref.target()), ...fx.when(cond.targetMatches("t", { subtype: "Bear" }), fx.addCounters(ref.target(), 1))],
        {
          targets: [target.creature("t", { controller: "you", other: true })],
          label: "Untaps another creature; a +1/+1 counter if it's a Bear",
        },
      ),
    ],
  },
  "Mirkwood Pathmaker": { cda: { pt: amount.count(YOUR_LANDS) } },
  "Nasty Little Rabbit": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: cond.ferocious,
        label: "Ferocious — a +1/+1 counter",
      }),
    ],
  },
  "The Notary Hobbits": {
    abilities: [
      triggered(when.entersSelf, [fx.copyToken(ref.self, { count: 2, nonlegendary: true })], {
        condition: cond.sourceMatches({ token: false }),
        label: "Two nonlegendary token copies",
      }),
      manaAbility("C", 1, { per: { subtype: "Halfling", controller: "you" } }),
    ],
  },
  "Old Fat Spider": {
    abilities: [
      blockAbility(block.notBy({ types: ["Creature"], maxPower: 2 }, "Can't be blocked by creatures with power 2 or less")),
      triggered({ on: "becomesTarget", who: "self", by: "opponent" }, [fx.draw(1)], {
        label: "Targeted by an opponent: draw a card",
      }),
    ],
  },
  "Part in Friendship": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false }),
        [
          // First the creature card is found, then it is revealed again to move it (the rest to the bottom).
          fx.revealUntilN({ types: ["Creature"] }, 1, undefined, "r"),
          ...fx.when(
            cond.not(cond.amountGreater(amount.manaValueOf(ref.stored("r")), amount.count(YOUR_LANDS))),
            fx.revealUntil({ types: ["Creature"] }, { to: "battlefield" }),
          ),
          ...fx.when(
            cond.amountGreater(amount.manaValueOf(ref.stored("r")), amount.count(YOUR_LANDS)),
            fx.revealUntil({ types: ["Creature"] }, { to: "hand" }),
          ),
        ],
        {
          oncePerTurn: true,
          label: "Reveal until a creature: onto the battlefield if its mana value ≤ your lands, otherwise to hand",
        },
      ),
    ],
  },
  Quarrel: {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Radagast of Rhosgobel": {
    abilities: [
      costReducer({ types: ["Creature"] }, 2, "The first creature spell of the turn costs {2} less", {
        condition: NO_CREATURE_SPELL_YET,
      }),
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["flash"] },
        condition: NO_CREATURE_SPELL_YET,
        label: "The first creature spell of the turn has flash",
      }),
    ],
  },
  "Through the Forest Gate": {
    spell: spell(
      [],
      [
        fx.lookAtTop(20, {
          filter: { types: ["Land"] },
          count: 20,
          to: { to: "battlefield", tapped: true },
          rest: "top",
        }),
        fx.shuffle(ref.you),
        fx.gainLife(8),
      ],
    ),
  },
  "Troll Negotiations": {
    spell: spell(
      [YOUR_CREATURE("a"), OPPONENT_CREATURE("b")],
      [fx.addCounters(ref.target("a"), 2), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Warg Tactics": {
    spell: modal(
      mode(
        "Destroy target creature with flying",
        [{ ...target.creature("t", { keyword: "flying" }), label: "creature with flying" }],
        [fx.destroy(ref.target())],
      ),
      mode(
        "A +1/+1 counter, trample and hexproof",
        [YOUR_CREATURE()],
        [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["trample", "hexproof"])],
      ),
    ),
  },
  Wargling: {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 1, 0), fx.pumpAll(YOUR_CREATURES, 0, 0, ["trample"])], {
        condition: cond.ferocious,
        label: "Ferocious — +1/+0; your creatures have trample",
      }),
    ],
  },
  "Wilderland Scrounger": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCountersAll(YOUR_CREATURES, 1)], {
        condition: cond.ferocious,
        label: "Ferocious — a +1/+1 counter on each of your creatures",
      }),
    ],
  },
  "Wood Elves": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ subtype: "Forest" }, { to: "battlefield" })], {
        label: "A Forest card onto the battlefield",
      }),
    ],
  },
  "Woodland Weavemaster": {
    abilities: [
      triggered(when.enters({ subtype: "Elf", controller: "you", other: true }), [fx.pump(ref.self, 1, 1)], {
        label: "Another Elf enters: +1/+1 until end of turn",
      }),
      manaAbility([...ANY_COLOR], 1, {
        selfPower: true,
        restriction: { spell: { subtype: "Elf" }, abilityOfSource: { subtype: "Elf" } },
      }),
    ],
  },
};
