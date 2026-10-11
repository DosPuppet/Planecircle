/** Final Fantasy — white cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cond,
  EQUIPMENT_YOU,
  flashback,
  fx,
  hero,
  KNIGHT_2,
  MOOGLE,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  tiered,
  triggered,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Adelbert Steiner": {
    abilities: [staticAbility("self", { power: 1, toughness: 1 }, { per: EQUIPMENT_YOU, label: "+1/+1 for each Equipment" })],
  },
  "Aerith Rescue Mission": {
    spell: modal(
      mode("Three 1/1 Heroes", [], [hero(3)]),
      mode(
        "Tap up to three creatures, stun one of them",
        [target.upTo(1, target.creature("s")), { ...target.upTo(2, target.creature("t")), otherThan: ["s"] }],
        [fx.tap(ref.target("s")), fx.counters(ref.target("s"), "stun", 1), fx.tap(ref.target("t"))],
      ),
    ),
  },
  "Ambrosia Whiteheart": {
    abilities: [
      // The permanent is not targeted: it is chosen on resolution.
      triggered(
        when.entersSelf,
        [
          fx.may(
            "Return another permanent you control to its owner's hand?",
            fx.chooseAmong(ref.permanentsOf(ref.you, { other: true }), ref.you, "r", {
              prompt: "Choose the permanent to return",
            }),
            fx.bounce(ref.stored("r")),
          ),
        ],
        { label: "Return another permanent" },
      ),
      triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall: +1/+0" }),
    ],
  },
  "Ashe, Princess of Dalmasca": {
    abilities: [
      triggered(when.attacksSelf, [fx.lookAtTop(5, { filter: { types: ["Artifact"] }, count: 1, rest: "bottom" })], {
        label: "An artifact among the top five",
      }),
    ],
  },
  "Auron's Inspiration": {
    castOptions: [flashback("{2}{W}{W}")],
    spell: spell([], [fx.pumpAll({ types: ["Creature"], attacking: true }, 2, 0)]),
  },
  "Battle Menu": {
    spell: modal(
      mode("Attack: 2/2 Knight", [], [fx.createTokens(KNIGHT_2)]),
      mode("Ability: +0/+4", [target.creature("t")], [fx.pump(ref.target(), 0, 4)]),
      mode(
        "Magic: destroy a creature with power 4 or greater",
        [target.creature("t", { minPower: 4 })],
        [fx.destroy(ref.target())],
      ),
      mode("Item: +4 life", [], [fx.gainLife(4)]),
    ),
  },
  "Cloudbound Moogle": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], { targets: [target.creature("t")], label: "+1/+1 counter" }),
    ],
  },
  Coeurl: {
    abilities: [
      activated({
        mana: "{1}{W}",
        tap: true,
        targets: [target.creature("t", { notTypes: ["Enchantment"] })],
        effects: [fx.tap(ref.target())],
        label: "Tap a nonenchantment creature",
      }),
    ],
  },
  "The Crystal's Chosen": { spell: spell([], [hero(4), fx.addCountersAll(CREATURE_YOU_CONTROL, 1)]) },
  "Delivery Moogle": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // Library and/or graveyard, one choice (PLAN-L L4).
          fx.search({ types: ["Artifact"], maxManaValue: 2 }, { to: "hand" }, 1, undefined, undefined, undefined, {
            alsoFrom: ["graveyard"],
          }),
        ],
        { label: "An artifact with mana value 2 or less" },
      ),
    ],
  },
  "Dwarven Castle Guard": { abilities: [triggered(when.diesSelf, [hero()], { label: "1/1 Hero" })] },
  "Fate of the Sun-Cryst": {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.nonland("t")], [fx.destroy(ref.target())]),
  },
  "From Father to Son": {
    castOptions: [flashback("{4}{W}{W}{W}")],
    spell: spell(
      [],
      [
        fx.when(cond.spellCastFromGraveyard, fx.search({ subtype: "Vehicle" }, { to: "battlefield" })),
        fx.when(cond.not(cond.spellCastFromGraveyard), fx.search({ subtype: "Vehicle" })),
      ],
    ),
  },
  "G'raha Tia": {
    abilities: [
      triggered(when.dies({ types: ["Creature", "Artifact"], controller: "you", other: true }), [fx.draw(1)], {
        oncePerTurn: true,
        label: "Draw",
      }),
    ],
  },
  Gaelicat: {
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        { condition: cond.controls({ types: ["Artifact"] }, 2), label: "+2/+0 (two artifacts)" },
      ),
    ],
  },
  "Magitek Armor": { abilities: [triggered(when.entersSelf, [hero()], { label: "1/1 Hero" })] },
  "Magitek Infantry": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { condition: cond.controls({ types: ["Artifact"], other: true }), label: "+1/+0 (another artifact)" },
      ),
      activated({
        mana: "{2}{W}",
        effects: [fx.search({ name: "Magitek Infantry" }, { to: "battlefield", tapped: true })],
        label: "Search for a Magitek Infantry",
      }),
    ],
  },
  "Minwu, White Mage": {
    abilities: [
      triggered(when.gainLife, [fx.addCountersAll({ types: ["Creature"], subtype: "Cleric", controller: "you" }, 1)], {
        label: "A counter on each Cleric",
      }),
    ],
  },
  "Moogles' Valor": {
    spell: spell(
      [],
      [fx.createTokens(MOOGLE, amount.count(CREATURE_YOU_CONTROL)), fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["indestructible"])],
    ),
  },
  "Phoenix Down": {
    abilities: [
      activated({
        mana: "{1}{W}",
        tap: true,
        exileSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 4 }, "you", "creature card")],
        effects: [fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Return a creature with mana value 4 or less",
      }),
      activated({
        mana: "{1}{W}",
        tap: true,
        exileSelf: true,
        targets: [targetObj("t", { anySubtype: ["Skeleton", "Spirit", "Zombie"] }, "Skeleton, Spirit or Zombie")],
        effects: [fx.exile(ref.target())],
        label: "Exile a Skeleton, Spirit or Zombie",
      }),
    ],
  },
  "Restoration Magic": {
    spell: tiered(
      {
        cost: "{0}",
        label: "Cure",
        targets: [targetObj("t", { permanent: true }, "permanent")],
        effects: [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])],
      },
      {
        cost: "{1}",
        label: "Cura",
        targets: [targetObj("t", { permanent: true }, "permanent")],
        effects: [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"]), fx.gainLife(3)],
      },
      {
        cost: "{3}{W}",
        label: "Curaga",
        effects: [fx.pumpAll({ permanent: true, controller: "you" }, 0, 0, ["hexproof", "indestructible"]), fx.gainLife(6)],
      },
    ),
  },
  "Slash of Light": {
    spell: spell(
      [target.creature("t")],
      [fx.damage(amount.plus(amount.count(CREATURE_YOU_CONTROL), amount.count(EQUIPMENT_YOU)), ref.target())],
    ),
  },
  "Snow Villiers": { cda: { power: amount.count(CREATURE_YOU_CONTROL) } },
  Ultima: { spell: spell([], [fx.destroyAll({ types: ["Artifact", "Creature"] }), fx.endTurn]) },
  "Weapons Vendor": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw" }),
      triggered(
        when.step("beginCombat"),
        fx.mayPay(
          "{1}",
          "Pay {1} to attach an Equipment?",
          fx.reflexive(
            [targetObj("e", EQUIPMENT_YOU, "Equipment you control"), target.creature("c", { controller: "you" })],
            [fx.attach(ref.target("c"), ref.target("e"))],
          ),
        ),
        { condition: cond.controls(EQUIPMENT_YOU), label: "Attach an Equipment" },
      ),
    ],
  },
  "White Auracite": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exile a nonland permanent",
      }),
      manaAbility("W"),
    ],
  },
  "You're Not Alone": {
    spell: spell(
      [target.creature("t")],
      [
        fx.when(cond.controls(CREATURE_YOU_CONTROL, 3), fx.pump(ref.target(), 4, 4)),
        fx.when(cond.not(cond.controls(CREATURE_YOU_CONTROL, 3)), fx.pump(ref.target(), 2, 2)),
      ],
    ),
  },
};
