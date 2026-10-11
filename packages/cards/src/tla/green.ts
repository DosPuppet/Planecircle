/** Avatar: The Last Airbender: green cards (lot A). */
import type { ModeDef, ObjectFilter } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  BEAR_4,
  block,
  blockAbility,
  type CardScript,
  CLUE,
  chapter,
  cond,
  eventReplacement,
  exhaust,
  FOOD,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const LAND_YOU_CONTROL = target.permanent("t", ["Land"], { controller: "you" }, "land you control");
const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Number of Lesson cards in your graveyard. */
const LESSONS = amount.countIn("graveyard", { subtype: "Lesson" });
/** Greatest power among the creatures you control. */
const GREATEST_POWER = amount.maxPower(CREATURES_YOU_CONTROL);
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
/** Elemental Teachings: the opponent's choice among the cards found. */
const GRAVEYARD_PICK = "A card to put into its owner's graveyard";

export const GREEN: Record<string, CardScript> = {
  "Allies at Last": {
    // Affinity for Allies: {1} less for each Ally you control.
    costReduction: { generic: amount.count({ subtype: "Ally", controller: "you" }) },
    spell: spell(
      [
        target.upTo(2, target.creature("a", { controller: "you" })),
        { ...target.creature("t", { controller: "opponent" }), label: "creature controlled by an opponent" },
      ],
      [fx.eachOfDealsDamage(ref.target("a"), ref.target("t"))],
    ),
  },
  Badgermole: {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 2), { targets: [LAND_YOU_CONTROL], label: "Earthbend 2" }),
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["trample"] },
        { label: "Creatures you control with a +1/+1 counter have trample" },
      ),
    ],
  },
  "Badgermole Cub": {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 1), { targets: [LAND_YOU_CONTROL], label: "Earthbend 1" }),
      // Triggered mana ability (605.1b): a mana replacement (R1, family I), like Lavaleaper.
      eventReplacement({
        event: "mana",
        source: { types: ["Creature"] },
        to: "you",
        extraMana: "G",
        modify: { add: 1 },
        label: "A creature tapped for mana: an additional {G}",
      }),
    ],
  },
  "The Boulder, Ready to Rumble": {
    abilities: [
      triggered(when.attacksSelf, fx.earthbend(ref.target(), amount.count({ ...CREATURES_YOU_CONTROL, minPower: 4 })), {
        targets: [LAND_YOU_CONTROL],
        label: "Earthbend X (your creatures with power 4 or greater)",
      }),
    ],
  },
  "Cycle of Renewal": {
    spell: spell([], [fx.sacrifice(ref.you, { types: ["Land"] }), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)]),
  },
  "The Earth King": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(BEAR_4)], { label: "A 4/4 Bear" }),
      triggered(
        when.attackWith(1, { types: ["Creature"], minPower: 4 }),
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, amount.eventAmount)],
        { label: "As many tapped basic lands as attackers with power 4 or greater" },
      ),
    ],
  },
  "Earth Kingdom General": {
    abilities: [
      triggered(when.entersSelf, fx.earthbend(ref.target(), 2), { targets: [LAND_YOU_CONTROL], label: "Earthbend 2" }),
      // "Do this only once each turn": the limit is used up only if you gain the life.
      triggered(
        when.youPutCounters({ types: ["Creature"] }, "+1/+1"),
        fx.may("Gain that much life?", fx.gainLife(amount.eventAmount), fx.doneOncePerTurn),
        { oncePerTurn: "ifDone", label: "You may gain that much life (once each turn)" },
      ),
    ],
  },
  "Earth Rumble": {
    spell: spell(
      [LAND_YOU_CONTROL],
      [
        ...fx.earthbend(ref.target(), 2),
        fx.reflexive(
          [
            target.upTo(1, target.creature("a", { controller: "you" })),
            { ...target.creature("b", { controller: "opponent" }), label: "creature controlled by an opponent" },
          ],
          [fx.fight(ref.target("a"), ref.target("b"))],
        ),
      ],
    ),
  },
  "Earthbending Lesson": { spell: spell([LAND_YOU_CONTROL], fx.earthbend(ref.target(), 4)) },
  "Elemental Teachings": {
    // The cards found are held (revealed); an opponent chooses two of them for the graveyard, the rest onto the
    // battlefield tapped, then shuffle.
    spell: spell(
      [],
      [
        fx.searchHold({ types: ["Land"] }, "f", 4, { reveal: true, distinctNames: true }),
        fx.chooseAmong(ref.stored("f"), ref.eachOpponent, "g1", { anyZone: true, prompt: GRAVEYARD_PICK }),
        fx.chooseAmong(ref.stored("g1Rest"), ref.eachOpponent, "g2", { anyZone: true, prompt: GRAVEYARD_PICK }),
        fx.moveTo(ref.union(ref.stored("g1"), ref.stored("g2")), { to: "graveyard" }),
        fx.toBattlefield(ref.stored("g2Rest"), { tapped: true }),
        fx.shuffle(ref.you),
      ],
    ),
  },
  "Flopsie, Bumi's Buddy": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], {
        label: "A +1/+1 counter on each creature you control",
      }),
      staticAbility(
        { ...CREATURES_YOU_CONTROL, minPower: 4 },
        { addBlockRules: [block.atMost(1)] },
        { label: "Creatures you control with power 4 or greater can't be blocked by more than one creature" },
      ),
    ],
  },
  "Foggy Swamp Vinebender": {
    abilities: [
      blockAbility(block.notByPowerLE2),
      activated({
        mana: "{5}",
        waterbend: true,
        activationCondition: cond.yourTurn,
        effects: [fx.addCounters(ref.self, 1)],
        label: "Waterbend {5}: a +1/+1 counter (during your turn)",
      }),
    ],
  },
  "Great Divide Guide": {
    abilities: [
      staticAbility(
        { controller: "you", anyOf: [{ types: ["Land"] }, { subtype: "Ally" }] },
        { addAbilities: [manaAbility([...ANY_COLOR])] },
        { label: 'Your lands and Allies: "{T}: one mana of any color"' },
      ),
    ],
  },
  "Haru, Hidden Talent": {
    abilities: [
      triggered(when.enters({ subtype: "Ally", controller: "you", other: true }), fx.earthbend(ref.target(), 1), {
        targets: [LAND_YOU_CONTROL],
        label: "Earthbend 1",
      }),
    ],
  },
  "Invasion Tactics": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll(CREATURES_YOU_CONTROL, 2, 2)], { label: "Creatures you control get +2/+2" }),
      triggered(when.combatDamageBatch({ subtype: "Ally", controller: "you" }), [fx.draw(1)], {
        label: "Allies deal combat damage to a player: draw a card",
      }),
    ],
  },
  "Kyoshi Island Plaza": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, amount.count({ subtype: "Shrine", controller: "you" }))],
        { label: "Up to X tapped basic lands (X: your Shrines)" },
      ),
      triggered(
        when.enters({ subtype: "Shrine", controller: "you", other: true }),
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        { label: "A tapped basic land" },
      ),
    ],
  },
  "Leaves from the Vine": {
    abilities: [
      chapter([1], [fx.mill(3), fx.createTokens(FOOD)], { label: "Mill three cards, a Food" }),
      chapter([2], [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "A +1/+1 counter on up to two creatures you control",
      }),
      chapter(
        [3],
        fx.when(
          cond.amountAtLeast(amount.countIn("graveyard", { anyOf: [{ types: ["Creature"] }, { subtype: "Lesson" }] }), 1),
          fx.draw(1),
        ),
        { label: "Draw if there's a creature or Lesson card in your graveyard" },
      ),
    ],
  },
  "The Legend of Kyoshi": {
    abilities: [
      chapter([1], [fx.draw(GREATEST_POWER)], { label: "Draw cards equal to the greatest power among your creatures" }),
      chapter(
        [2],
        [
          ...fx.earthbend(ref.target(), amount.cardsIn("hand")),
          fx.modify(ref.target(), { addSubtypes: ["Island"] }, "permanent"),
        ],
        { targets: [LAND_YOU_CONTROL], label: "Earthbend X (cards in hand); the land becomes an Island" },
      ),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Returns transformed",
      }),
    ],
  },
  "Avatar Kyoshi": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addKeywords: ["trample", "hexproof"] },
        { label: "Lands you control have trample and hexproof" },
      ),
      activated({
        tap: true,
        effects: [fx.addManaChoice(GREATEST_POWER)],
        label: "X mana of one color (the greatest power among your creatures)",
      }),
    ],
  },
  "Origin of Metalbending": {
    spell: modal(
      mode(
        "Destroys an artifact or an enchantment",
        [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        [fx.destroy(ref.target())],
      ),
      mode(
        "+1/+1 counter and indestructible",
        [target.creature("u", { controller: "you" })],
        [fx.addCounters(ref.target("u"), 1), fx.modify(ref.target("u"), { addKeywords: ["indestructible"] })],
      ),
    ),
  },
  "Ostrich-Horse": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), store: "land", prompt: "You may take a milled land card" },
          ),
          ...fx.when(cond.not(cond.v("land")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Mill three cards: a land to hand, otherwise a +1/+1 counter" },
      ),
    ],
  },
  "Pillar Launch": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 2, ["reach"]), fx.untap(ref.target())]),
  },
  "Raucous Audience": {
    abilities: [manaAbility("G", 1, { condition: cond.not(cond.ferocious) }), manaAbility("G", 2, { condition: cond.ferocious })],
  },
  "Rebellious Captives": {
    abilities: [
      exhaust({
        mana: "{6}",
        targets: [LAND_YOU_CONTROL],
        effects: [fx.addCounters(ref.self, 2), ...fx.earthbend(ref.target(), 2)],
        label: "two +1/+1 counters, then earthbend 2",
      }),
    ],
  },
  Rockalanche: {
    flashback: "{5}{G}",
    spell: spell([LAND_YOU_CONTROL], fx.earthbend(ref.target(), amount.count({ subtype: "Forest", controller: "you" }))),
  },
  "Rocky Rebuke": {
    spell: spell(
      [
        target.creature("a", { controller: "you" }),
        { ...target.creature("b", { controller: "opponent" }), label: "creature controlled by an opponent" },
      ],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Seismic Sense": {
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.count({ types: ["Land"], controller: "you" }), {
          filter: { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
          count: 1,
          to: { to: "hand" },
          rest: "bottom",
        }),
      ],
    ),
  },
  "Sparring Dummy": {
    abilities: [
      activated({
        tap: true,
        effects: [
          fx.mill(1, ref.you, { name: "m", filter: { subtype: "Lesson" } }),
          ...fx.when(cond.v("m"), fx.gainLife(2)),
          fx.pickFromZone(
            "graveyard",
            { types: ["Land"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), prompt: "You may take the milled land card" },
          ),
        ],
        label: "Mill a card: a land to hand; 2 life if it's a Lesson",
      }),
    ],
  },
  "True Ancestry": {
    spell: spell(
      [target.upTo(1, target.cardInGraveyard("t", { permanent: true }, "you", "permanent card from your graveyard"))],
      [fx.toHand(ref.target()), fx.createTokens(CLUE)],
    ),
  },
  "Turtle-Duck": {
    abilities: [
      activated({
        mana: "{3}",
        effects: [fx.modify(ref.self, { setPower: 4, addKeywords: ["trample"] })],
        label: "Base power 4 and trample until end of turn",
      }),
    ],
  },
  "Unlucky Cabbage Merchant": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" }),
      triggered(
        when.sacrifice({ subtype: "Food" }),
        [
          ...fx.may(
            "Search for a basic land (the merchant is shuffled into the library)?",
            fx.search(BASIC_LAND, { to: "battlefield", tapped: true }),
            fx.moveTo(ref.self, { to: "libraryTop", shuffle: true }),
          ),
        ],
        { label: "A tapped basic land; the merchant goes back into the library" },
      ),
    ],
  },
  "Walltop Sentries": {
    abilities: [
      triggered(when.diesSelf, [fx.gainLife(2)], {
        condition: cond.amountAtLeast(LESSONS, 1),
        label: "A Lesson in the graveyard: you gain 2 life",
      }),
    ],
  },
  "Toph, the Blind Bandit": {
    cdaPower: amount.countersAmong({ types: ["Land"], controller: "you" }, "+1/+1"),
    abilities: [
      triggered(when.entersSelf, [...fx.earthbend(ref.target(), 2)], {
        targets: [LAND_YOU_CONTROL],
        label: "Earthbend 2",
      }),
    ],
  },
  "Earthen Ally": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        {
          perAmount: amount.colorsAmong({ subtype: "Ally", controller: "you" }),
          label: "+1/+0 for each color among your Allies",
        },
      ),
      activated({
        mana: "{2}{W}{U}{B}{R}{G}",
        targets: [LAND_YOU_CONTROL],
        effects: [...fx.earthbend(ref.target(), 5)],
        label: "Earthbend 5",
      }),
    ],
  },
  "Diligent Zookeeper": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", notSubtype: "Human" },
        { power: 1, toughness: 1, perAffected: { what: "ownCreatureTypes", max: 10 } },
        { label: "Your non-Human creatures: +1/+1 for each creature type (at most 10)" },
      ),
    ],
  },
  "Avatar Destiny": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addSubtypes: ["Avatar"] },
        { perGraveyard: { types: ["Creature"] }, label: "+1/+1 for each creature card in your graveyard; Avatar" },
      ),
      triggered(
        when.dies({ attached: "host" }),
        [
          fx.mill(amount.powerOf(ref.eventObject), ref.you, { name: "m" }),
          fx.toHand(ref.selfCard),
          // "Up to one milled creature card": the question is asked only if there is one.
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("m"), { types: ["Creature"] })), 1),
            ...fx.may(
              "Put a milled creature card onto the battlefield?",
              fx.chooseAmong(ref.filtered(ref.stored("m"), { types: ["Creature"] }), ref.you, "c", {
                anyZone: true,
                prompt: "Choose the milled creature card to put onto the battlefield",
              }),
              fx.toBattlefield(ref.stored("c")),
            ),
          ),
        ],
        { label: "Mill cards equal to its power; the Aura returns to hand, a milled creature onto the battlefield" },
      ),
    ],
  },
  "Bumi, King of Three Trials": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        // "Choose up to X" (X: Lessons in your graveyard): each combination under a condition.
        [
          { counters: true, scry: false, earth: false },
          { counters: false, scry: true, earth: false },
          { counters: false, scry: false, earth: true },
          { counters: true, scry: true, earth: false },
          { counters: true, scry: false, earth: true },
          { counters: false, scry: true, earth: true },
          { counters: true, scry: true, earth: true },
        ]
          .map((c): ModeDef => {
            const n = Number(c.counters) + Number(c.scry) + Number(c.earth);
            const labels = [c.counters && msg("three counters"), c.scry && msg("scry 3"), c.earth && msg("earth 3")].filter(
              (l): l is string => !!l,
            );
            const [a = "", b = "", c3 = ""] = labels;
            const label = n === 1 ? a : n === 2 ? msg("{a} + {b}", { a, b }) : msg("{a} + {b} + {c}", { a, b, c: c3 });
            return {
              ...mode(
                label,
                [...(c.scry ? [target.player("p")] : []), ...(c.earth ? [LAND_YOU_CONTROL] : [])],
                [
                  ...(c.counters ? [fx.addCounters(ref.self, 3)] : []),
                  ...(c.scry ? [fx.scry(3, ref.target("p"))] : []),
                  ...(c.earth ? fx.earthbend(ref.target(), 3) : []),
                ],
              ),
              condition: cond.amountAtLeast(LESSONS, n),
            };
          })
          .concat([mode("None", [], [])]) as ModeDef[],
        { label: "Up to X modes (X: Lessons in your graveyard)" },
      ),
    ],
  },
};
