/** Outlaws of Thunder Junction — white cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  entersWith,
  flashFor,
  fx,
  mercenary,
  OTHER_CREATURE_YOU_CONTROL,
  OX,
  ref,
  SHEEP,
  spell,
  spree,
  staticAbility,
  target,
  triggered,
  when,
  whileSaddled,
} from "./common";

const OPP_HAS_MORE_LANDS = cond.amountAtLeast(
  amount.plus(
    amount.count({ types: ["Land"], controller: "opponent" }),
    amount.neg(amount.count({ types: ["Land"], controller: "you" })),
  ),
  1,
);
const PLAINS = { types: ["Land" as const], subtype: "Plains" };

export const WHITE: Record<string, CardScript> = {
  "Armored Armadillo": {
    abilities: [
      activated({
        mana: "{3}{W}",
        effects: [fx.pump(ref.self, amount.toughnessOf(ref.self), 0)],
        label: "+X/+0 (its toughness)",
      }),
    ],
  },
  "Bounding Felidar": {
    abilities: [
      whileSaddled([fx.addCountersAll(OTHER_CREATURE_YOU_CONTROL, 1), fx.gainLife(amount.count(OTHER_CREATURE_YOU_CONTROL))], {
        label: "Counter on your other creatures, +1 life for each",
      }),
    ],
  },
  "Bovine Intervention": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [fx.destroy(ref.target()), fx.createTokens(OX, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Bridled Bighorn": { abilities: [whileSaddled([fx.createTokens(SHEEP)], { label: "1/1 Sheep" })] },
  "Claim Jumper": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search(PLAINS, { to: "battlefield", tapped: true }),
          fx.when(OPP_HAS_MORE_LANDS, fx.search(PLAINS, { to: "battlefield", tapped: true })),
        ],
        { condition: OPP_HAS_MORE_LANDS, label: "Tapped Plains (up to twice)" },
      ),
    ],
  },
  "Dust Animus": {
    abilities: [
      entersWith({ counters: 2, condition: cond.controls({ types: ["Land"], tapped: false }, 5) }),
      entersWith({ counters: 1, counterKind: "lifelink", condition: cond.controls({ types: ["Land"], tapped: false }, 5) }),
    ],
  },
  "Eriette's Lullaby": {
    spell: spell([target.creature("t", { tapped: true })], [fx.destroy(ref.target()), fx.gainLife(2)]),
  },
  "Final Showdown": {
    spell: spree(
      {
        cost: "{1}",
        label: "Creatures lose all abilities",
        effects: [fx.modifyAll({ types: ["Creature"] }, { loseAllAbilities: true })],
      },
      {
        cost: "{1}",
        label: "A creature you control gains indestructible",
        // "Choose": no target, the choice is made on resolution.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "i", {
            prompt: "Choose a creature you control",
          }),
          fx.pump(ref.stored("i"), 0, 0, ["indestructible"]),
        ],
      },
      { cost: "{3}{W}{W}", label: "Destroy all creatures", effects: [fx.destroyAll({ types: ["Creature"] })] },
    ),
  },
  "Frontier Seeker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.lookAtTop(5, {
            filter: { anyOf: [{ types: ["Creature"], subtype: "Mount" }, { subtype: "Plains" }] },
            count: 1,
            rest: "bottom",
          }),
        ],
        { label: "A Mount or a Plains among the top five" },
      ),
    ],
  },
  "Getaway Glamer": {
    spell: spree(
      {
        cost: "{1}",
        label: "Exile a nontoken creature, it returns",
        targets: [target.creature("e", { token: false })],
        effects: [
          fx.exileCard(ref.target("e"), { name: "g" }),
          fx.delayed([fx.toBattlefield(ref.target("g"))], { g: ref.stored("g") }),
        ],
      },
      {
        cost: "{2}",
        label: "Destroy the creature with the greatest power",
        targets: [target.creature("d")],
        effects: [
          fx.when(
            cond.amountAtLeast(
              amount.plus(amount.powerOf(ref.target("d")), amount.neg(amount.maxPower({ types: ["Creature"] }))),
              0,
            ),
            fx.destroy(ref.target("d")),
          ),
        ],
      },
    ),
  },
  "Holy Cow": { abilities: [triggered(when.entersSelf, [fx.gainLife(2), fx.scry(1)], { label: "+2 life, scry 1" })] },
  "Inventive Wingsmith": {
    abilities: [
      triggered(when.yourEndStep, [fx.counters(ref.self, "flying", 1)], {
        condition: cond.all(cond.not(cond.handSpellThisTurn), cond.not(cond.counterAtLeast("flying", 1))),
        label: "Flying counter",
      }),
    ],
  },
  "Lassoed by the Law": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exile a nonland permanent",
      }),
      triggered(when.entersSelf, [mercenary()], { label: "1/1 Mercenary" }),
    ],
  },
  "Mystical Tether": {
    castOptions: [flashFor("{2}")],
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Creature"], { controller: "opponent" }, "artifact or creature")],
        label: "Exile an artifact or creature",
      }),
    ],
  },
  "Nurturing Pixie": {
    abilities: [
      triggered(when.entersSelf, [fx.when(cond.targetMatches("t", {}), fx.bounce(ref.target()), fx.addCounters(ref.self, 1))], {
        targets: [target.upTo(1, target.nonland("t", { controller: "you", notSubtype: "Faerie" }))],
        label: "Return a permanent, +1/+1 counter",
      }),
    ],
  },
  "Omenport Vigilante": {
    abilities: [
      staticAbility("self", { addKeywords: ["doubleStrike"] }, { condition: cond.crime, label: "Double strike (crime)" }),
    ],
  },
  "One Last Job": {
    spell: spree(
      {
        cost: "{2}",
        label: "A creature",
        targets: [target.cardInGraveyard("c", { types: ["Creature"] }, "you", "creature card")],
        effects: [fx.toBattlefield(ref.target("c"))],
      },
      {
        cost: "{1}",
        label: "A Mount or a Vehicle",
        targets: [
          target.cardInGraveyard("m", { anyOf: [{ subtype: "Mount" }, { subtype: "Vehicle" }] }, "you", "Mount or Vehicle card"),
        ],
        effects: [fx.toBattlefield(ref.target("m"))],
      },
      {
        cost: "{1}",
        label: "An attached Aura or Equipment",
        targets: [
          target.cardInGraveyard(
            "a",
            { anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] },
            "you",
            "Aura or Equipment card",
          ),
        ],
        // The creature is chosen on resolution (not targeted): the one returned by the first mode can be chosen.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "h", {
            prompt: "One Last Job: the creature to attach it to",
          }),
          fx.moveTo(ref.target("a"), { to: "battlefield" }, undefined, ref.stored("h")),
        ],
      },
    ),
  },
  "Outlaw Medic": { abilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "Draw" })] },
  "Prosperity Tycoon": {
    abilities: [
      triggered(when.entersSelf, [mercenary()], { label: "1/1 Mercenary" }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Indestructible, tap it",
      }),
    ],
  },
  "Requisition Raid": {
    spell: spree(
      {
        cost: "{1}",
        label: "Destroy an artifact",
        targets: [target.permanent("a", ["Artifact"])],
        effects: [fx.destroy(ref.target("a"))],
      },
      {
        cost: "{1}",
        label: "Destroy an enchantment",
        targets: [target.permanent("e", ["Enchantment"])],
        effects: [fx.destroy(ref.target("e"))],
      },
      {
        cost: "{1}",
        label: "+1/+1 counter on a player's creatures",
        targets: [target.player("p")],
        effects: [fx.addCounters(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }), 1)],
      },
    ),
  },
  "Rustler Rampage": {
    spell: spree(
      {
        cost: "{1}",
        label: "Untap a player's creatures",
        targets: [target.player("p")],
        effects: [fx.untap(ref.permanentsOf(ref.target("p"), { types: ["Creature"] }))],
      },
      {
        cost: "{1}",
        label: "Double strike",
        targets: [target.creature("c")],
        effects: [fx.pump(ref.target("c"), 0, 0, ["doubleStrike"])],
      },
    ),
  },
  "Shepherd of the Clouds": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.when(cond.controls({ subtype: "Mount" }), fx.toBattlefield(ref.target())),
          fx.when(cond.not(cond.controls({ subtype: "Mount" })), fx.toHand(ref.target())),
        ],
        {
          targets: [target.cardInGraveyard("t", { permanent: true, maxManaValue: 3 }, "you", "permanent card")],
          label: "Return a permanent with mana value 3 or less",
        },
      ),
    ],
  },
  "Sheriff of Safe Passage": {
    abilities: [entersWith({ counters: amount.plus(1, amount.count(OTHER_CREATURE_YOU_CONTROL)) })],
  },
  "Stagecoach Security": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1, ["vigilance"])], { label: "+1/+1 and vigilance" }),
    ],
  },
  "Steer Clear": {
    // "if you controlled a Mount as you cast this spell": checked on casting.
    rules: { whenCast: cond.controls({ subtype: "Mount" }) },
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [fx.when(cond.metWhenCast, fx.damage(4, ref.target())), fx.when(cond.not(cond.metWhenCast), fx.damage(2, ref.target()))],
    ),
  },
  "Sterling Keykeeper": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { notSubtype: "Mount" })],
        effects: [fx.tap(ref.target())],
        label: "Tap a non-Mount creature",
      }),
    ],
  },
  "Sterling Supplier": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Take Up the Shield": {
    spell: spell(
      [target.creature("t")],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["lifelink", "indestructible"])],
    ),
  },
  "Thunder Lasso": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it",
      }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.attacks({ types: ["Creature"], attached: "host" }), [fx.tap(ref.target())], {
        targets: [target.of(ref.defendingPlayer, target.creature("t"), "creature of the defending player")],
        label: "Tap a creature of the defending player",
      }),
    ],
  },
  "Trained Arynx": {
    abilities: [whileSaddled([fx.pump(ref.self, 0, 0, ["firstStrike"]), fx.scry(1)], { label: "First strike, scry 1" })],
  },
  "Vengeful Townsfolk": {
    abilities: [
      triggered(when.dies(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1)], { batched: true, label: "+1/+1 counter" }),
    ],
  },
  "Wanted Griffin": { abilities: [triggered(when.diesSelf, [mercenary()], { label: "1/1 Mercenary" })] },
};
