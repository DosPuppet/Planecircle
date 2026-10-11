/** Secrets of Strixhaven — green cards. */
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  FRACTAL,
  fx,
  INCREMENT,
  INFUSION,
  manaAbility,
  modal,
  mode,
  OPUS,
  PEST,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** A creature or land card. */
const CREATURE_OR_LAND = { anyOf: [{ types: ["Creature" as const] }, { types: ["Land" as const] }] };

export const GREEN: Record<string, CardScript> = {
  "Aberrant Manawurm": {
    abilities: [
      triggered(OPUS, [fx.pump(ref.self, amount.eventManaSpent, 0)], {
        label: "Opus: +X/+0, where X is the mana spent on that spell",
      }),
    ],
  },
  "Additive Evolution": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), 3)], {
        label: "A Fractal with three +1/+1 counters",
      }),
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["vigilance"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A +1/+1 counter and vigilance",
      }),
    ],
  },
  "Ambitious Augmenter": {
    abilities: [
      INCREMENT,
      // "if it had one or more counters on it": its last known information.
      triggered(when.diesSelf, [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.lkiCountersTo(ref.stored("f"))], {
        condition: cond.eventObjectMatches({ withCounter: "any" }),
        label: "A Fractal that gets its counters",
      }),
    ],
  },
  "Burrog Barrage": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
      [
        // "another instant or sorcery spell": this one already counts among the spells cast this turn.
        ...fx.when(cond.amountAtLeast(amount.instantSorceryCast, 2), fx.pump(ref.target("a"), 1, 0)),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
  "Chelonian Tackle": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.upTo(1, target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), 0, 10), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Comforting Counsel": {
    abilities: [
      triggered(when.gainLife, [fx.counters(ref.self, "growth")], { label: "A growth counter" }),
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { power: 3, toughness: 3 },
        { condition: cond.counterAtLeast("growth", 5), label: "Five growth counters: your creatures get +3/+3" },
      ),
    ],
  },
  Efflorescence: {
    spell: spell(
      [target.creature()],
      [
        fx.addCounters(ref.target(), 2),
        ...fx.when(INFUSION, fx.modify(ref.target(), { addKeywords: ["trample", "indestructible"] })),
      ],
    ),
  },
  "Emeritus of Abundance": {
    // Regrowth: returns target card from your graveyard to your hand.
    prepareSpell: spell([target.cardInGraveyard("t", {}, "you")], [fx.toHand(ref.target())]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.attacksSelf, [fx.prepare(ref.self)], {
        condition: cond.controls({ types: ["Land"] }, 8),
        label: "Eight or more lands: becomes prepared",
      }),
    ],
  },
  "Emil, Vastlands Roamer": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", withCounter: "+1/+1" },
        { addKeywords: ["trample"] },
        { label: "Your creatures with +1/+1 counters have trample" },
      ),
      activated({
        mana: "{4}{G}",
        tap: true,
        effects: [
          fx.createTokens(FRACTAL, 1, undefined, "f"),
          fx.addCounters(ref.stored("f"), amount.distinctNames({ types: ["Land"], controller: "you" })),
        ],
        label: "A Fractal with a +1/+1 counter for each differently named land",
      }),
    ],
  },
  "Environmental Scientist": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land card?", fx.search(BASIC_LAND, { to: "hand" })), {
        label: "Search for a basic land",
      }),
    ],
  },
  "Follow the Lumarets": {
    spell: spell(
      [],
      [
        ...fx.when(cond.not(INFUSION), fx.lookAtTop(4, { filter: CREATURE_OR_LAND, count: 1 })),
        ...fx.when(INFUSION, fx.lookAtTop(4, { filter: CREATURE_OR_LAND, count: 2 })),
      ],
    ),
  },
  "Germination Practicum": {
    // Paradigm: read from the text.
    spell: spell([], [fx.addCountersAll({ types: ["Creature"], controller: "you" }, 2)]),
  },
  "Glorious Decay": {
    spell: modal(
      mode("Destroys an artifact", [target.permanent("t", ["Artifact"], {}, "artifact")], [fx.destroy(ref.target())]),
      mode("4 damage to a creature with flying", [target.creature("t", { keyword: "flying" })], [fx.damage(4, ref.target())]),
      mode(
        "Exiles a card from a graveyard, draw a card",
        [target.cardInGraveyard("t", {}, "any")],
        [fx.exileCard(ref.target()), fx.draw(1)],
      ),
    ),
  },
  "Hungry Graffalon": { abilities: [INCREMENT] },
  "Infirmary Healer": {
    // Stream of Life: target player gains X life.
    prepareSpell: spell([target.player()], [fx.gainLife(amount.x, ref.target())]),
    abilities: [entersWith({ prepared: true })],
  },
  "Lumaret's Favor": {
    abilities: [
      triggered(when.castSelf, [fx.copySpell(ref.self, 1)], {
        condition: INFUSION,
        label: "Infusion: copy this spell",
      }),
    ],
    spell: spell([target.creature()], [fx.pump(ref.target(), 2, 4)]),
  },
  "Mindful Biomancer": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(1)], { label: "Gain 1 life" }),
      activated({ mana: "{2}{G}", oncePerTurn: true, effects: [fx.pump(ref.self, 2, 2)], label: "+2/+2 until end of turn" }),
    ],
  },
  "Noxious Newt": { abilities: [manaAbility("G")] },
  "Oracle's Restoration": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 1, 1), fx.draw(1), fx.gainLife(1)]),
  },
  "Pestbrood Sloth": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(PEST, 2)], { label: "Two 1/1 Pests" })],
  },
  "Planar Engineering": {
    spell: spell(
      [],
      [fx.sacrifice(ref.you, { types: ["Land"] }, 2), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 4)],
    ),
  },
  "Shopkeeper's Bane": {
    abilities: [triggered(when.attacksSelf, [fx.gainLife(2)], { label: "Gain 2 life" })],
  },
  "Slumbering Trudge": {
    abilities: [
      entersWith({
        counters: amount.max(0, amount.plus(3, amount.neg(amount.x))),
        counterKind: "stun",
        label: "Three stun counters minus X",
      }),
      entersWith({ tapped: true, condition: cond.not(cond.xAtLeast(3)), label: "X ≤ 2: enters tapped" }),
    ],
  },
  "Snarl Song": {
    // Converge: X = colors of mana spent.
    spell: spell(
      [],
      [
        fx.createTokens(FRACTAL, 2, undefined, "f"),
        fx.addCounters(ref.stored("f"), amount.colorsSpent),
        fx.gainLife(amount.colorsSpent),
      ],
    ),
  },
  "Studious First-Year": {
    // Rampant Growth: a basic land onto the battlefield tapped.
    prepareSpell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]),
    abilities: [entersWith({ prepared: true })],
  },
  "Tenured Concocter": {
    abilities: [
      triggered({ on: "becomesTarget", who: "self", by: "opponent" }, fx.may("Draw a card?", fx.draw(1)), {
        label: "Targeted by an opponent: you may draw",
      }),
      staticAbility("self", { power: 2 }, { condition: INFUSION, label: "Infusion: +2/+0" }),
    ],
  },
  "Thornfist Striker": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { power: 1, addKeywords: ["trample"] },
        { condition: INFUSION, label: "Infusion: your creatures get +1/+0 and have trample" },
      ),
    ],
  },
  "Topiary Lecturer": {
    abilities: [INCREMENT, manaAbility("G", 1, { selfPower: true })],
  },
  "Vastlands Scavenger": {
    // Bind to Life: mill seven cards, then a milled creature card enters the battlefield.
    prepareSpell: spell(
      [],
      [
        fx.mill(7, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Creature"] },
          { to: "battlefield" },
          { count: 1, pool: ref.stored("m"), prompt: "A milled creature card enters the battlefield" },
        ),
      ],
    ),
    abilities: [entersWith({ prepared: true })],
  },
  "Wild Hypothesis": {
    spell: spell([], [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), amount.x), fx.surveil(2)]),
  },
  "Zimone's Experiment": {
    // The chosen cards are revealed, the rest goes to the bottom in a random order, then the lands enter tapped and the
    // creatures go to hand, straight from the library.
    spell: spell(
      [],
      [
        fx.chooseAmong(ref.filtered(ref.libraryTopCards(ref.you, 5), CREATURE_OR_LAND), ref.you, "z", {
          anyZone: true,
          anyNumber: true,
          max: 2,
          prompt: "Reveal up to two creature and/or land cards",
        }),
        fx.reveal(ref.stored("z")),
        fx.moveTo(ref.except(ref.libraryTopCards(ref.you, 5), ref.stored("z")), { to: "libraryBottom", shuffle: true }),
        fx.moveTo(ref.filtered(ref.stored("z"), { types: ["Land"] }), { to: "battlefield", tapped: true }),
        fx.toHand(ref.filtered(ref.stored("z"), { types: ["Creature"] })),
      ],
    ),
  },
  "Wildgrowth Archaic": {
    abilities: [
      entersWith({ counters: amount.colorsSpent, label: "Converge: a +1/+1 counter for each color of mana spent" }),
      triggered(
        when.castSpell("you", { types: ["Creature"] }),
        [fx.spellArrivalCounters(ref.eventObject, amount.eventColorsSpent)],
        { label: "Creature spell: it enters with a +1/+1 counter for each color of mana spent" },
      ),
    ],
  },
};
