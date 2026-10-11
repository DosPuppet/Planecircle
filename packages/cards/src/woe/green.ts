/**
 * Wilds of Eldraine — green cards. Adventures have one entry per face (the creature or the enchantment under its name,
 * the Adventure spell under its own); Bargain is read from the text (`cond.kicked`).
 */
import { type Effect, type ModeDef, msg, type ObjectFilter } from "@mtgx/engine";
import {
  ART_ENCH_OR_FLYER,
  activated,
  amount,
  BASIC_LAND,
  BEAST_3,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  createRole,
  eventReplacement,
  FOOD,
  fx,
  HUMAN_W,
  MONSTER_ROLE,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ROYAL_ROLE,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const FOOD_YOU: ObjectFilter = { types: ["Artifact"], subtype: "Food", controller: "you" };
/** "When this creature enters, create a Food token." */
const ENTERS_FOOD = triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food token" });
/** "Whenever you cast a spell with mana value 5 or greater" */
const CAST_MV5 = when.castSpell("you", { minManaValue: 5 });

/** "Choose two —": each pair of modes becomes a mode (target ids distinct from one mode to another). */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1)) {
      out.push({
        label: msg("{a} + {b}", { a: a.label ?? "", b: b.label ?? "" }),
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
    }
  });
  return { modes: out };
}

/**
 * Curse of the Werefox: "Create a Monster Role token attached to target creature you control. When you do, that
 * creature fights up to one target creature you don't control" (reflexive ability, which exists only if the Role was
 * created).
 */
const WEREFOX_CURSE: Effect[] = [
  ...createRole(MONSTER_ROLE).flat(),
  ...fx.when(
    cond.refMatches(ref.target(), { types: ["Creature"] }),
    fx.reflexive(
      [target.upTo(1, { ...target.creature("f", { controller: "opponent" }), label: "creature you don't control" })],
      [fx.fight(ref.target("c"), ref.target("f"))],
      { c: ref.target() },
    ),
  ),
];

/**
 * Feral Encounter: "At the beginning of the next combat phase this turn, target creature you control deals damage
 * equal to its power to up to one target creature you don't control" — an emblem for this turn, whose ability triggers
 * only once (targets chosen when it triggers).
 */
const FERAL_ENCOUNTER_COMBAT: Effect = fx.emblem(
  "Feral Encounter",
  msg(
    "At the beginning of the next combat phase this turn, target creature you control deals damage equal to its power to up to one target creature you don't control.",
  ),
  [
    triggered(when.yourCombat, [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))], {
      targets: [
        target.creature("a", { controller: "you" }),
        target.upTo(1, { ...target.creature("b", { controller: "opponent" }), label: "creature you don't control" }),
      ],
      oncePerTurn: true,
      label: "Your creature deals damage equal to its power",
    }),
  ],
  false,
  true,
);

export const GREEN: Record<string, CardScript> = {
  // Bargain and trample read from the text.
  "Hamlet Glutton": {
    costReduction: { generic: 2, condition: cond.kicked },
    abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "When it enters, you gain 3 life" })],
  },
  "Graceful Takedown": {
    spell: spell(
      [
        target.upTo(99, {
          ...target.creature("e", { controller: "you", enchanted: true }),
          label: "enchanted creature you control",
        }),
        {
          ...target.upTo(1, { ...target.creature("o", { controller: "you" }), label: "other creature you control" }),
          otherThan: ["e"],
        },
        { ...target.creature("t", { controller: "opponent" }), label: "creature you don't control" },
      ],
      [fx.eachOfDealsDamage(ref.target("e"), ref.target("t")), fx.eachOfDealsDamage(ref.target("o"), ref.target("t"))],
    ),
  },
  "Agatha's Champion": {
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.self, ref.target())], {
        targets: [target.upTo(1, { ...target.creature("t", { controller: "opponent" }), label: "creature you don't control" })],
        condition: cond.kicked,
        label: "Bargained: fights a creature",
      }),
    ],
  },

  // --- Beanstalk Wurm // Plant Beans ------------------------------------------
  "Beanstalk Wurm": {},
  "Plant Beans": { spell: spell([], [fx.extraLandThisTurn]) },

  "Bestial Bloodline": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
      activated({
        mana: "{4}{G}",
        fromGraveyard: true,
        effects: [fx.toHand(ref.self)],
        label: "Return it from your graveyard to your hand",
      }),
    ],
  },
  "Blossoming Tortoise": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((trigger) =>
        triggered(
          trigger,
          [
            fx.mill(3),
            fx.pickFromZone(
              "graveyard",
              { types: ["Land"] },
              { to: "battlefield", tapped: true },
              { count: 1, prompt: "A land card from your graveyard returns tapped" },
            ),
          ],
          { label: "Mill three cards, then a land from your graveyard returns tapped" },
        ),
      ),
      playerStatic({
        abilityCost: { source: { types: ["Land"] }, reduce: 1 },
        label: "Activated abilities of your lands cost {1} less",
      }),
      // "land creatures": a creature that also has the land type.
      staticAbility(
        { types: ["Creature"], controller: "you", not: { notTypes: ["Land"] } },
        { power: 1, toughness: 1 },
        { label: "Your land creatures get +1/+1" },
      ),
    ],
  },
  "Brave the Wilds": {
    // "If this spell was bargained, target land …": the target exists only when bargained (two modes, each under the
    // bargain or its absence, read at announcement).
    spell: modal(
      { ...mode("Search for a basic land card", [], [fx.search(BASIC_LAND)]), condition: cond.not(cond.kicked) },
      {
        ...mode(
          "Bargained: a land becomes a 3/3 Elemental with haste; search for a basic land card",
          [target.permanent("t", ["Land"], { controller: "you" }, "land you control")],
          [
            fx.modify(
              ref.target(),
              { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 3, setToughness: 3, addKeywords: ["haste"] },
              "permanent",
            ),
            fx.search(BASIC_LAND),
          ],
        ),
        condition: cond.kicked,
      },
    ),
  },
  "Commune with Nature": {
    spell: spell([], [fx.lookAtTop(5, { filter: { types: ["Creature"] }, count: 1, to: { to: "hand" }, rest: "bottom" })]),
  },
  "Curse of the Werefox": { spell: spell([target.creature("t", { controller: "you" })], WEREFOX_CURSE) },
  "Elvish Archivist": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.self, 2)], {
        batched: true,
        oncePerTurn: true,
        label: "Two +1/+1 counters (once each turn)",
      }),
      triggered(when.enters({ types: ["Enchantment"], controller: "you" }), [fx.draw(1)], {
        batched: true,
        oncePerTurn: true,
        label: "Draw a card (once each turn)",
      }),
    ],
  },
  "Feral Encounter": {
    spell: spell(
      [],
      [
        fx.lookAtTop(5, { filter: { types: ["Creature"] }, count: 1, to: { to: "exile" }, rest: "bottom", store: "e" }),
        fx.grantPlay(ref.stored("e")),
        FERAL_ENCOUNTER_COMBAT,
      ],
    ),
  },

  // --- Ferocious Werefox // Guard Change --------------------------------------
  "Ferocious Werefox": {},
  "Guard Change": { spell: spell([target.creature("t", { controller: "you" })], createRole(MONSTER_ROLE)) },

  "Gruff Triplets": {
    abilities: [
      triggered(when.entersSelf, [fx.copyToken(ref.self, { count: 2 })], {
        condition: cond.sourceMatches({ token: false }),
        label: "Two tokens that are copies of it",
      }),
      triggered(
        when.diesSelf,
        [fx.addCountersAll({ types: ["Creature"], controller: "you", name: "Gruff Triplets" }, amount.lkiPower)],
        { label: "As many +1/+1 counters as its power on each of your Gruff Triplets" },
      ),
    ],
  },

  // --- Hollow Scavenger // Bakery Raid ----------------------------------------
  "Hollow Scavenger": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Artifact"], subtype: "Food" } },
        oncePerTurn: true,
        effects: [fx.pump(ref.self, 2, 2)],
        label: "+2/+2 until end of turn",
      }),
    ],
  },
  "Bakery Raid": { spell: spell([], [fx.createTokens(FOOD)]) },

  "Howling Galefang": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["haste"] },
        {
          condition: cond.amountAtLeast(amount.countExiled({ adventure: true }), 1),
          label: "Haste as long as you own a card with an Adventure in exile",
        },
      ),
    ],
  },
  "The Huntsman's Redemption": {
    abilities: [
      chapter([1], [fx.createTokens(BEAST_3)], { label: "A 3/3 Beast token" }),
      chapter(
        [2],
        [
          fx.sacrifice(ref.you, { types: ["Creature"] }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.search({ anyOf: [{ types: ["Creature"] }, BASIC_LAND] })),
        ],
        { label: "Sacrifice a creature: search for a creature or a basic land" },
      ),
      chapter([3], [fx.pump(ref.target(), 2, 2, ["trample"])], {
        targets: [target.upTo(2, target.creature())],
        label: "Up to two creatures: +2/+2 and trample",
      }),
    ],
  },
  "Leaping Ambush": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["reach"]), fx.untap(ref.target())]),
  },
  "Night of the Sweets' Revenge": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food token" }),
      staticAbility(FOOD_YOU, { addAbilities: [manaAbility("G")] }, { label: 'Your Foods have "{T}: Add {G}"' }),
      activated({
        mana: "{5}{G}{G}",
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.pumpAll(CREATURE_YOU_CONTROL, amount.count(FOOD_YOU), amount.count(FOOD_YOU))],
        label: "Your creatures get +X/+X (X: your Foods)",
      }),
    ],
  },
  "Redtooth Genealogist": {
    abilities: [
      triggered(when.entersSelf, createRole(ROYAL_ROLE), {
        targets: [{ ...target.creature("t", { controller: "you", other: true }), label: "other creature you control" }],
        label: "A Royal Role attached to another creature you control",
      }),
    ],
  },
  "Redtooth Vanguard": {
    abilities: [
      triggered(
        when.enters({ types: ["Enchantment"], controller: "you" }),
        fx.mayPay("{2}", "Pay {2} to return Redtooth Vanguard to your hand?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Pay {2}: returns from the graveyard to hand" },
      ),
    ],
  },
  "Return from the Wilds": {
    spell: chooseTwo(
      mode("A basic land, tapped", [], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]),
      mode("A 1/1 Human", [], [fx.createTokens(HUMAN_W)]),
      mode("A Food", [], [fx.createTokens(FOOD)]),
    ),
  },
  "Rootrider Faun": {
    abilities: [
      manaAbility("G"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
    ],
  },
  "Royal Treatment": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.modify(ref.target(), { addKeywords: ["hexproof"] }), ...createRole(ROYAL_ROLE)],
    ),
  },
  "Skybeast Tracker": {
    abilities: [triggered(CAST_MV5, [fx.createTokens(FOOD)], { label: "A Food token" })],
  },
  "Spider Food": {
    spell: spell(
      [target.optional(targetObj("t", ART_ENCH_OR_FLYER, "artifact, enchantment or creature with flying"))],
      [fx.destroy(ref.target()), fx.createTokens(FOOD)],
    ),
  },

  // --- Stormkeld Vanguard // Bear Down ----------------------------------------
  "Stormkeld Vanguard": { abilities: [blockAbility(block.notByPowerLE2)] },
  "Bear Down": {
    spell: spell([target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")], [fx.destroy(ref.target())]),
  },

  "Tanglespan Lookout": {
    abilities: [triggered(when.enters({ subtype: "Aura", controller: "you" }), [fx.draw(1)], { label: "Draw a card" })],
  },
  "Territorial Witchstalker": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.self, 1, 0, ["attacksDespiteDefender"])], {
        condition: cond.ferocious,
        label: "+1/+0 and can attack as though it didn't have defender",
      }),
    ],
  },
  "Thunderous Debut": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.kicked,
          fx.lookAtTop(20, { filter: { types: ["Creature"] }, count: 2, to: { to: "battlefield" }, rest: "top" }),
        ),
        ...fx.when(
          cond.not(cond.kicked),
          fx.lookAtTop(20, { filter: { types: ["Creature"] }, count: 2, to: { to: "hand" }, rest: "top" }),
        ),
        fx.shuffle(),
      ],
    ),
  },
  "Titanic Growth": { spell: spell([target.creature()], [fx.pump(ref.target(), 4, 4)]) },
  "Toadstool Admirer": {
    abilities: [activated({ mana: "{3}{G}", effects: [fx.addCounters(ref.self, 1)], label: "A +1/+1 counter" })],
  },
  "Tough Cookie": {
    abilities: [
      ENTERS_FOOD,
      activated({
        mana: "{2}{G}",
        targets: [
          targetObj("t", { types: ["Artifact"], notTypes: ["Creature"], controller: "you" }, "noncreature artifact you control"),
        ],
        effects: [fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 4 })],
        label: "A noncreature artifact becomes a 4/4 artifact creature",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "+3 life" }),
    ],
  },
  "Troublemaker Ouphe": {
    abilities: [
      triggered(when.entersSelf, [fx.exile(ref.target())], {
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { controller: "opponent" },
            "artifact or enchantment an opponent controls",
          ),
        ],
        condition: cond.kicked,
        label: "Bargained: exile an artifact or an enchantment an opponent controls",
      }),
    ],
  },
  "Up the Beanstalk": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      triggered(CAST_MV5, [fx.draw(1)], { label: "Spell with MV 5 or greater: draw a card" }),
    ],
  },
  "Verdant Outrider": {
    abilities: [
      activated({
        mana: "{1}{G}",
        effects: [fx.modify(ref.self, { addBlockRules: [block.notByPowerLE2] })],
        label: "Can't be blocked by creatures with power 2 or less this turn",
      }),
    ],
  },

  // --- Virtue of Strength // Garenbrig Growth ---------------------------------
  "Virtue of Strength": {
    abilities: [
      eventReplacement({
        event: "mana",
        source: { types: ["Land"], basic: true },
        to: "you",
        modify: { times: 3 },
        label: "Your basic lands tapped for mana produce three times as much",
      }),
    ],
  },
  "Garenbrig Growth": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
          "you",
          "creature or land card in your graveyard",
        ),
      ],
      [fx.toHand(ref.target())],
    ),
  },

  "Welcome to Sweettooth": {
    abilities: [
      chapter([1], [fx.createTokens(HUMAN_W)], { label: "A 1/1 Human token" }),
      chapter([2], [fx.createTokens(FOOD)], { label: "A Food token" }),
      chapter([3], [fx.addCounters(ref.target(), amount.plus(1, amount.count(FOOD_YOU)))], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A +1/+1 counter, plus one for each Food you control",
      }),
    ],
  },

  // --- Gingerbread Hunter // Puny Snack ---------------------------------------
  "Gingerbread Hunter": { abilities: [ENTERS_FOOD] },
  "Puny Snack": { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2)]) },

  // --- Questing Druid // Seek the Beast ---------------------------------------
  "Questing Druid": {
    abilities: [
      triggered(when.castSpell("you", { colors: ["W", "U", "B", "R"] }), [fx.addCounters(ref.self, 1)], {
        label: "White, blue, black or red spell: a +1/+1 counter",
      }),
    ],
  },
  "Seek the Beast": {
    spell: spell([], [fx.exileTop(ref.you, 2, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextEndStep: true })]),
  },

  // --- Tempest Hart // Scan the Clouds ----------------------------------------
  "Tempest Hart": {
    abilities: [triggered(CAST_MV5, [fx.addCounters(ref.self, 1)], { label: "Spell with MV 5 or greater: a +1/+1 counter" })],
  },
  "Scan the Clouds": { spell: spell([], [fx.draw(2), fx.discard(2)]) },

  // --- Intrepid Trufflesnout // Go Hog Wild -----------------------------------
  "Intrepid Trufflesnout": {
    abilities: [
      triggered({ on: "attacks", who: "self", alone: true }, [fx.createTokens(FOOD)], {
        label: "Attacks alone: a Food token",
      }),
    ],
  },
  "Go Hog Wild": { spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2)]) },

  "Provisions Merchant": {
    abilities: [
      ENTERS_FOOD,
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, FOOD_YOU, 1, { optional: true, store: "f" }),
          ...fx.when(cond.v("f"), fx.pumpAll({ types: ["Creature"], attacking: true }, 1, 1, ["trample"])),
        ],
        { label: "Sacrifice a Food: attackers get +1/+1 and trample" },
      ),
    ],
  },
  "Wildwood Mentor": {
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), [fx.addCounters(ref.self, 1)], {
        label: "A token enters: a +1/+1 counter",
      }),
      triggered(when.attacksSelf, [fx.pump(ref.target(), amount.powerOf(ref.self), amount.powerOf(ref.self))], {
        targets: [{ ...target.creature("t", { attacking: true, other: true }), label: "other attacking creature" }],
        label: "Another attacker gets +X/+X (X: its power)",
      }),
    ],
  },
};
