/** Reality Fracture — black cards. */
import {
  activated,
  amount,
  BEAST_TRAMPLE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  empower,
  entersWith,
  exhaust,
  fx,
  loyalty,
  modal,
  mode,
  OMIT_VARIABLES,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  walkersHave,
  when,
} from "./common";

export const BLACK: Record<string, CardScript> = {
  "Cast Away Doubt": { spell: spell([], [fx.draw(2), fx.damage(2, ref.eachPlayer)]) },
  "Darklight Phoenix": {
    abilities: [
      triggered(when.yourCombat, [fx.toBattlefield(ref.self)], {
        condition: cond.creaturesDied(2),
        fromGraveyard: true,
        label: "Two creatures died: returns from the graveyard",
      }),
    ],
  },
  "Last Gasp": { spell: spell([target.creature("t")], [fx.pump(ref.target(), -3, -3)]) },
  "Multiply by Zero": {
    spell: spell([target.creature("t")], [fx.modify(ref.target(), { setPower: 0, setToughness: 0 })]),
  },
  "Rampart Hunter": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2, ["deathtouch"])], {
        targets: [target.creature("t")],
        label: "+2/+2 and deathtouch",
      }),
    ],
  },
  "Rank Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "each opponent discards" })],
  },
  "Rise of the Deathbringer": {
    spell: modal(
      mode(
        "Draw equal to the greatest power, lose that much life",
        [],
        [fx.draw(amount.maxPower(CREATURE_YOU_CONTROL)), fx.loseLife(amount.maxPower(CREATURE_YOU_CONTROL))],
      ),
      mode("All creatures -3/-3", [], [fx.pumpAll({ types: ["Creature"] }, -3, -3)]),
    ),
  },
  "Screeching Soulbreaker": {
    abilities: [triggered(when.attacksSelf, [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], { label: "1 damage, +1 life" })],
  },
  "Theoretical Necromancer": {
    abilities: [
      activated({
        mana: "{3}{B}",
        fromGraveyard: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], other: true }, "you", "other creature card")],
        effects: [fx.toHand(ref.target())],
        label: "Return a creature card",
      }),
    ],
  },
  "Tinybones, Pocket Nuisance": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "each opponent discards" }),
      triggered(when.discardBatch("any"), [fx.damage(1, ref.eachOpponent)], { label: "discard: 1 damage" }),
    ],
  },
  "Apex Witchstalker": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 life" }),
      triggered(when.diesSelf, [fx.gainLife(2)], { label: "+2 life" }),
    ],
  },
  "Proft, Sinister Mastermind": {
    rules: { castCondition: cond.threshold },
    abilities: [
      activated({
        mana: "{B}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), -3, -1)],
        label: "Discard: -3/-1",
      }),
    ],
  },
  "Liliana the Repentant": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], controller: "you", other: true }),
        [fx.mill(2)],
        { label: "mills 2" },
      ),
      exhaust({
        mana: "{5}{B}",
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] },
            "you",
            "creature or planeswalker card in your graveyard",
          ),
        ],
        effects: [fx.toBattlefield(ref.target()), fx.addCounters(ref.self, 1)],
        label: "reanimate, +1/+1 counter",
      }),
    ],
  },
  "Bloodline Recollector": {
    prepareSpell: spell([target.player("t")], [fx.draw(3, ref.target()), fx.loseLife(3, ref.target())]),
    abilities: [
      triggered(when.eachEndStep, [fx.prepare(ref.self)], {
        condition: cond.creaturesDied(3),
        label: "three creatures died: prepared",
      }),
    ],
  },
  "Void Extrapolator": {
    prepareSpell: OMIT_VARIABLES,
    abilities: [
      entersWith({ prepared: true }),
      staticAbility("self", { power: 1, toughness: 1 }, { condition: cond.threshold, label: "Threshold: +1/+1" }),
    ],
  },
  "Overwrite the Multiverse": {
    // X is counted before the exile (same number: the exile can't fail).
    spell: spell(
      [],
      [
        empower(amount.count({ types: ["Creature"] })),
        fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"] }, { to: "exile" }),
      ],
    ),
  },
  "Rewrite Regrets": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], maxManaValue: 6 },
          "you",
          "creature or planeswalker card (mana value 6 or less)",
        ),
      ],
      [fx.toBattlefield(ref.target()), empower(2)],
    ),
  },
  "Sanctum Lurker": {
    abilities: [
      triggered(when.entersSelf, [empower(1)], { label: "Empower Jace 1" }),
      playerStatic({ walkersSurviveZeroLoyalty: true, label: "Your planeswalkers survive at 0 loyalty" }),
      walkersHave(
        loyalty(2, { effects: [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], label: "1 damage to each opponent, +1 life" }),
        "Planeswalkers: [+2]",
      ),
    ],
  },
  "Solve for Disappointment": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { permanent: true, notTypes: ["Land"] }, chooser: "controller" }), empower(1)],
    ),
  },
  "Vraska's Final Mercy": {
    spell: modal(
      mode(
        "Lose 2 life, destroy a creature or planeswalker",
        [target.creatureOrPlaneswalker("t")],
        [fx.loseLife(2), fx.destroy(ref.target())],
      ),
      mode("Lose 2 life, empower Jace 6", [], [fx.loseLife(2), empower(6)]),
    ),
  },
  "Way of the Deathbringer": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      walkersHave(
        loyalty(-2, {
          effects: [
            fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "s" }),
            ...fx.when(cond.v("s"), fx.createTokens(BEAST_TRAMPLE)),
          ],
          label: "Sacrifice a creature: 4/4 Beast",
        }),
        "Planeswalkers: [−2] Beast",
      ),
    ],
  },
  "Way of the Necromancer": {
    abilities: [
      triggered(when.entersSelf, [empower(2)], { label: "Empower Jace 2" }),
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        [fx.addCountersAll({ types: ["Planeswalker"], controller: "you" }, 1, "loyalty")],
        {
          label: "loyalty on each planeswalker",
        },
      ),
    ],
  },
  "Extended Absence": {
    spell: spell(
      [target.creatureOrPlaneswalker("t")],
      [fx.exileCard(ref.target()), fx.damage(1, ref.eachOpponent), fx.gainLife(1)],
    ),
  },
  "Lich's Relic": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayPay("{2}", "Pay {2} to destroy a creature or planeswalker an opponent controls?", [
          fx.reflexive(
            [target.upTo(1, target.creatureOrPlaneswalker("t", { controller: "opponent" }))],
            [fx.destroy(ref.target())],
          ),
        ]),
        { label: "pay {2}: destroy" },
      ),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Silence the Echo": {
    additionalCost: {
      sacrifice: { filter: { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, count: 1, orPay: cost("{3}") },
    },
    spell: spell([target.creatureOrPlaneswalker("t")], [fx.destroy(ref.target())]),
  },
  "Terminal Criticism": {
    spell: spell([target.creatureOrPlaneswalker("t", { colors: ["U", "R"] })], [fx.destroy(ref.target()), fx.gainLife(1)]),
  },
  "Mabel, Bitter Recluse": {
    abilities: [
      triggered(when.entersSelf, [fx.removeCounters(ref.target(), 3)], {
        targets: [target.creatureOrPlaneswalker("t", { other: true })],
        label: "removes up to three counters",
      }),
    ],
  },
  "Massacre Girl, Most Wanted": {
    abilities: [
      triggered(
        when.dies({ ...{ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, controller: "you", other: true }),
        [fx.damage(1, ref.target()), fx.gainLife(1)],
        {
          targets: [target.player("t", "opponent")],
          label: "1 damage, +1 life",
        },
      ),
      // Noncombat damage dealt to an opponent by any source.
      triggered(when.playerDealtDamage("opponent", false), [fx.addCounters(ref.self, 1)], { label: "put a +1/+1 counter" }),
    ],
  },
  "Teyo, Diamondblade Mage": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), { addKeywords: ["deathtouch"] }),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Creature"] }), fx.addCounters(ref.target(), 1)),
          ...fx.when(cond.refMatches(ref.target(), { types: ["Planeswalker"] }), fx.counters(ref.target(), "loyalty", 1)),
        ],
        {
          targets: [targetObj("t", { permanent: true, controller: "you" }, "permanent you control")],
          label: "deathtouch",
        },
      ),
    ],
  },
  "Winter, Tormented Loner": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, 1, {
            optional: true,
            store: "s",
          }),
          ...fx.when(cond.v("s"), fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })),
        ],
        { label: "sacrifice: each opponent sacrifices a creature" },
      ),
      staticAbility(
        "self",
        { power: 1 },
        {
          perGraveyard: { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] },
          label: "+1/+0 for each creature or planeswalker in your graveyard",
        },
      ),
    ],
  },
  "Dark Matter Manipulator": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "mills 3" }),
      staticAbility(
        "self",
        { power: 2 },
        {
          perAmount: amount.per({ kind: "count", zone: "graveyard", filter: {} }, 7),
          label: "+2/+0 for every seven cards in your graveyard",
        },
      ),
    ],
  },
};
