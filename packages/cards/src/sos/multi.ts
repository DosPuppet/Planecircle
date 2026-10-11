/** Secrets of Strixhaven — multicolored cards. */
import { type Effect, type ModeDef, msg, type ObjectFilter, type TargetSpec, type TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  castPermission,
  cmp,
  cond,
  costReducer,
  ELEMENTAL_UR,
  entersWith,
  FRACTAL,
  flashback,
  fx,
  INCREMENT,
  INFUSION,
  INSTANT_SORCERY,
  manaAbility,
  modal,
  mode,
  OPUS,
  OPUS_BIG,
  opusInstead,
  PEST,
  playerStatic,
  REPARTEE,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURES_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const ARTIFACT_OR_CREATURE: ObjectFilter = { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] };
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;
/** "Spend this mana only to cast instant and sorcery spells." */
const INSTANT_SORCERY_MANA = { spell: INSTANT_SORCERY };

/** "Whenever one or more cards leave your graveyard" (with `batched`). */
const LEAVE_YOUR_GRAVEYARD: TriggerSpec = when.zoneChange(["graveyard"], { whose: "you" });

/**
 * Moment of Reckoning: "Choose up to four. You may choose the same mode more than once." Every combination (one to
 * four modes) is generated, each copy of a mode with its own target.
 */
function reckoningModes(): ModeDef[] {
  const out: ModeDef[] = [];
  for (let d = 0; d <= 4; d++) {
    for (let g = 0; g <= 4 - d; g++) {
      if (d + g === 0) continue;
      const targets: TargetSpec[] = [];
      const effects: Effect[] = [];
      for (let i = 0; i < d; i++) {
        targets.push(target.nonland(`d${i}`));
        effects.push(fx.destroy(ref.target(`d${i}`)));
      }
      for (let i = 0; i < g; i++) {
        targets.push(
          target.cardInGraveyard(
            `g${i}`,
            { permanent: true, notTypes: ["Land"] },
            "you",
            "nonland permanent card from your graveyard",
          ),
        );
        effects.push(fx.toBattlefield(ref.target(`g${i}`)));
      }
      const label =
        d && g
          ? msg("Destroy {d} nonland permanent(s), return {g} permanent card(s)", { d, g })
          : d
            ? msg("Destroy {d} nonland permanent(s)", { d })
            : msg("return {g} permanent card(s)", { g });
      out.push(mode(label, targets, effects));
    }
  }
  return out;
}

export const MULTI: Record<string, CardScript> = {
  // --- Silverquill (white and black) -------------------------------------------
  // Flying read from the text.
  "Abigale, Poet Laureate": {
    prepareSpell: spell([target.creature()], [fx.addCounters(ref.target(), 1)]),
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [fx.prepare(ref.self)], {
        label: "Creature spell cast: Abigale becomes prepared",
      }),
    ],
  },
  "Conciliator's Duelist": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), fx.loseLife(1, ref.eachPlayer)], {
        label: "Draw a card; each player loses 1 life",
      }),
      triggered(
        REPARTEE,
        [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        {
          targets: [target.upTo(1, target.creature())],
          label: "Repartee: exile a creature until the next end step",
        },
      ),
    ],
  },
  "Fix What's Broken": {
    // "Pay X life" as an additional cost: read from the text.
    spell: spell(
      [],
      [
        fx.moveAll(
          "graveyard",
          ref.you,
          { ...ARTIFACT_OR_CREATURE, compare: [cmp.manaValue("=", amount.x)] },
          { to: "battlefield" },
        ),
      ],
    ),
  },
  // Vigilance read from the text.
  "Imperious Inkmage": {
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" })],
  },
  "Inkling Mascot": {
    abilities: [
      triggered(REPARTEE, [fx.modify(ref.self, { addKeywords: ["flying"] }), fx.surveil(1)], {
        label: "Repartee: flying until end of turn, surveil 1",
      }),
    ],
  },
  "Killian's Confidence": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 1), fx.draw(1)]),
    abilities: [
      triggered(
        when.combatDamageBatch(CREATURES_YOU),
        fx.mayPay("{W/B}", "Pay {W/B} to return Killian's Confidence to your hand?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "Combat damage to a player: pay {W/B} to return it to hand" },
      ),
    ],
  },
  "Moment of Reckoning": { spell: { modes: reckoningModes() } },
  "Render Speechless": {
    spell: spell(
      [target.player("p", "opponent"), target.upTo(1, target.creature("c"))],
      [
        fx.discard(1, ref.target("p"), { filter: { notTypes: ["Land"] }, chooser: "controller" }),
        fx.addCounters(ref.target("c"), 2),
      ],
    ),
  },
  // Menace read from the text.
  "Scolding Administrator": {
    abilities: [
      triggered(REPARTEE, [fx.addCounters(ref.self, 1)], { label: "Repartee: a +1/+1 counter" }),
      // "if it had counters on it" (603.4): its counters as it died (last known information).
      triggered(when.diesSelf, [fx.lkiCountersTo(ref.target())], {
        condition: cond.amountAtLeast(amount.countersOn(ref.eventObject, "any"), 1),
        targets: [target.upTo(1, target.creature())],
        label: "Its counters onto a creature",
      }),
    ],
  },
  "Silverquill Charm": {
    spell: modal(
      mode("Two +1/+1 counters", [target.creature()], [fx.addCounters(ref.target(), 2)]),
      mode("Exile a creature with power 2 or less", [target.creature("t", { maxPower: 2 })], [fx.exile(ref.target())]),
      mode("Each opponent loses 3 life, you gain 3 life", [], fx.drain(3)),
    ),
  },
  /**
   * Flying and vigilance read from the text. Approximation of the granted casualty 1: a cast trigger ("you may
   * sacrifice a creature with power 1 or greater; if you do, copy the spell"), not an additional cost paid while
   * casting.
   */
  "Silverquill, the Disputant": {
    abilities: [
      // Granted casualty 1 (702.153): an optional cost paid while casting the spell, then "when you cast it, copy it".
      playerStatic({
        copyCost: { filter: { types: ["Instant", "Sorcery"] }, casualty: 1 },
        label: "Each instant and sorcery spell you cast has casualty 1",
      }),
    ],
  },
  "Snooping Page": {
    abilities: [
      triggered(REPARTEE, [fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "Repartee: can't be blocked this turn",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(1), fx.loseLife(1)], { label: "Draw a card, lose 1 life" }),
    ],
  },
  "Social Snub": {
    spell: spell([], [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }), ...fx.drain(1)]),
    abilities: [
      triggered(when.castSelf, fx.may("Copy Social Snub?", fx.copySpell(ref.self, 1)), {
        // "while you control a creature": on triggering only (not an "if" checked again on resolution).
        triggerCondition: cond.controls({ types: ["Creature"] }),
        label: "Cast while you control a creature: you may copy it",
      }),
    ],
  },

  // --- Lorehold (red and white) ----------------------------------------------
  "Ark of Hunger": {
    abilities: [
      triggered(LEAVE_YOUR_GRAVEYARD, [fx.damage(1, ref.eachOpponent), fx.gainLife(1)], {
        batched: true,
        label: "Cards leave your graveyard: 1 damage to each opponent, +1 life",
      }),
      activated({
        tap: true,
        effects: [fx.mill(1, ref.you, { name: "m" }), fx.grantPlay(ref.stored("m"))],
        label: "Mill a card, playable this turn",
      }),
    ],
  },
  "Aziza, Mage Tower Captain": {
    abilities: [
      triggered(
        OPUS,
        [
          fx.tapChosen({ types: ["Creature"] }, "a", { exactly: 3 }),
          ...fx.when(cond.v("a", 3), fx.copySpell(ref.eventObject, 1)),
        ],
        { label: "Tap three creatures to copy the spell" },
      ),
    ],
  },
  "Borrowed Knowledge": {
    spell: modal(
      mode(
        "Discard your hand, draw as many as the opponent's hand",
        [target.player("p", "opponent")],
        [fx.discard(amount.cardsIn("hand")), fx.draw(amount.refCount(ref.handOf(ref.target("p"))))],
      ),
      mode(
        "Discard your hand, draw that many cards",
        [],
        [fx.discard(amount.cardsIn("hand"), ref.you, { store: "d" }), fx.draw(amount.v("d"))],
      ),
    ),
  },
  "Colossus of the Blood Age": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.eachOpponent), fx.gainLife(3)], {
        label: "3 damage to each opponent, +3 life",
      }),
      triggered(
        when.diesSelf,
        [fx.discard(amount.cardsIn("hand"), ref.you, { optional: true, store: "d" }), fx.draw(amount.plus(amount.v("d"), 1))],
        { label: "Discard any number of cards, draw that many plus one" },
      ),
    ],
  },
  "Kirol, History Buff": {
    prepareSpell: spell(
      [target.creature()],
      [fx.mill(1), fx.addCounters(ref.target(), 2), fx.modify(ref.target(), { addKeywords: ["trample"] })],
    ),
    abilities: [
      triggered(LEAVE_YOUR_GRAVEYARD, [fx.prepare(ref.self)], {
        batched: true,
        label: "Cards leave your graveyard: Kirol becomes prepared",
      }),
    ],
  },
  "Lorehold Charm": {
    spell: modal(
      mode(
        "Each opponent sacrifices a nontoken artifact",
        [],
        [fx.sacrifice(ref.eachOpponent, { types: ["Artifact"], token: false })],
      ),
      mode(
        "Return an artifact or creature with mana value 2 or less",
        [
          target.cardInGraveyard(
            "t",
            { ...ARTIFACT_OR_CREATURE, maxManaValue: 2 },
            "you",
            "artifact or creature card with mana value 2 or less",
          ),
        ],
        [fx.toBattlefield(ref.target())],
      ),
      mode("Your creatures: +1/+1 and trample", [], [fx.pumpAll(CREATURES_YOU, 1, 1, ["trample"])]),
    ),
  },
  // First strike read from the text.
  "Practiced Scrollsmith": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "e" }), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })],
        {
          targets: [
            target.cardInGraveyard(
              "t",
              { notTypes: ["Creature", "Land"] },
              "you",
              "noncreature, nonland card from your graveyard",
            ),
          ],
          label: "Exile a noncreature, nonland card: castable until the end of your next turn",
        },
      ),
    ],
  },
  "Pursue the Past": {
    castOptions: [flashback("{2}{R}{W}")],
    spell: spell(
      [],
      [fx.gainLife(2), fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))],
    ),
  },
  "Spirit Mascot": {
    abilities: [
      triggered(LEAVE_YOUR_GRAVEYARD, [fx.addCounters(ref.self, 1)], {
        batched: true,
        label: "Cards leave your graveyard: a +1/+1 counter",
      }),
    ],
  },
  // Trample and lifelink read from the text.
  "Startled Relic Sloth": {
    abilities: [
      triggered(when.yourCombat, [fx.exileCard(ref.target())], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "Exile up to one card from a graveyard",
      }),
    ],
  },
  "Wilt in the Heat": {
    costReduction: { generic: 2, condition: cond.amountAtLeast(amount.cardsLeftGraveyardThisTurn, 1) },
    spell: spell([target.creature()], [fx.exileIfDies(ref.target()), fx.damage(5, ref.target())]),
  },

  // --- Prismari (blue and red) -----------------------------------------------
  "Abstract Paintmage": {
    abilities: [
      triggered(
        when.step("main1", "you"),
        [fx.addManaChoice(1, ["U"], INSTANT_SORCERY_MANA), fx.addManaChoice(1, ["R"], INSTANT_SORCERY_MANA)],
        { label: "Add {U}{R} (instants and sorceries only)" },
      ),
    ],
  },
  // Flying and vigilance read from the text.
  "Elemental Mascot": {
    abilities: [
      triggered(
        OPUS,
        [
          fx.pump(ref.self, 1, 0),
          ...fx.when(OPUS_BIG, fx.exileTop(ref.you, 1, "e"), fx.grantPlay(ref.stored("e"), { untilYourNextTurn: true })),
        ],
        { label: "Opus: +1/+0; five or more mana: exile the top card, playable until your next turn" },
      ),
    ],
  },
  /**
   * Flying and ward (pay 5 life) read from the text. Approximation of the granted storm: the ability copies the spell
   * once for each spell cast this turn before it resolves, minus the spell itself (a spell cast in response to the
   * ability is counted).
   */
  "Prismari, the Inspiration": {
    abilities: [
      triggered(when.castSpellStorm(INSTANT_SORCERY), [fx.copySpell(ref.eventObject, amount.eventAmount)], {
        label: "Storm: a copy for each spell cast before it this turn",
      }),
    ],
  },
  "Rapturous Moment": {
    spell: spell([], [fx.draw(3), fx.discard(2), fx.addMana("U", "U", "R", "R", "R")]),
  },
  "Resonating Lute": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addAbilities: [manaAbility([...ANY_COLOR], 2, { restriction: INSTANT_SORCERY_MANA })] },
        { label: "Your lands: {T}: two mana of any one color (instants and sorceries)" },
      ),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.cardsIn("hand"), 7),
        effects: [fx.draw(1)],
        label: "Draw a card (seven or more cards in hand)",
      }),
    ],
  },
  "Sanar, Unfinished Genius": {
    prepareSpell: spell([], [fx.search(INSTANT_SORCERY)]),
    abilities: [
      entersWith({ prepared: true }),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.instantSorceryCast, 1),
        effects: [fx.createTokens(TREASURE)],
        label: "A Treasure (instant or sorcery cast this turn)",
      }),
    ],
  },
  // Flying read from the text.
  "Spectacular Skywhale": {
    abilities: [
      triggered(OPUS, opusInstead([fx.pump(ref.self, 3, 0)], [fx.addCounters(ref.self, 3)]), {
        label: "Opus: +3/+0; five or more mana: three +1/+1 counters instead",
      }),
    ],
  },
  "Splatter Technique": {
    spell: modal(
      mode("Draw four cards", [], [fx.draw(4)]),
      mode("4 damage to each creature and planeswalker", [], [fx.damageAll(4, { types: ["Creature", "Planeswalker"] })]),
    ),
  },
  "Stadium Tidalmage": {
    abilities: [
      triggered(when.entersSelf, fx.may("Draw a card, then discard a card?", fx.draw(1), fx.discard(1)), {
        label: "You may draw, then discard",
      }),
      triggered(when.attacksSelf, fx.may("Draw a card, then discard a card?", fx.draw(1), fx.discard(1)), {
        label: "You may draw, then discard",
      }),
    ],
  },
  "Stress Dream": {
    spell: spell(
      [target.upTo(1, target.creature())],
      [fx.damage(5, ref.target()), fx.lookAtTop(2, { count: 1, exact: true, rest: "bottom" })],
    ),
  },
  "Visionary's Dance": {
    spell: spell([], [fx.createTokens(ELEMENTAL_UR, 2)]),
    abilities: [
      activated({
        mana: "{2}",
        fromHand: true,
        discardSelf: true,
        effects: [fx.lookAtTop(2, { count: 1, exact: true, rest: "graveyard" })],
        label: "Look at the top two cards: one to hand, the other to the graveyard",
      }),
    ],
  },

  // --- Quandrix (green and blue) ---------------------------------------------
  "Applied Geometry": {
    spell: spell(
      [
        {
          id: "t",
          label: "non-Aura permanent you control",
          filter: { objects: { permanent: true, controller: "you", notSubtype: "Aura" } },
        },
      ],
      [
        fx.copyToken(ref.target(), { addTypes: ["Creature"], addSubtypes: ["Fractal"], pt: 0, store: "c" }),
        fx.addCounters(ref.stored("c"), 6),
      ],
    ),
  },
  "Berta, Wise Extrapolator": {
    abilities: [
      INCREMENT,
      triggered(when.countersPut("self", "+1/+1"), [fx.addManaChoice(1)], {
        label: "+1/+1 counters on Berta: one mana of any color",
      }),
      activated({
        mana: "{X}",
        tap: true,
        effects: [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), amount.x)],
        label: "A 0/0 Fractal with X +1/+1 counters",
      }),
    ],
  },
  // Flash, flying and trample read from the text.
  "Cuboid Colony": { abilities: [INCREMENT] },
  "Embrace the Paradox": {
    spell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          {
            min: 0,
            prompt: "You may put a land card from your hand onto the battlefield tapped",
          },
        ),
      ],
    ),
  },
  // Trample read from the text.
  "Fractal Mascot": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap an opponent's creature, a stun counter",
      }),
    ],
  },
  "Growth Curve": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.addCounters(ref.target(), 1), fx.doubleCounters(ref.target())],
    ),
  },
  "Mind into Matter": {
    spell: spell(
      [],
      [
        fx.draw(amount.x),
        fx.pickFromZone(
          "hand",
          { permanent: true },
          { to: "battlefield", tapped: true },
          {
            min: 0,
            maxManaValue: amount.x,
            prompt: "You may put a permanent card with mana value X or less onto the battlefield tapped",
          },
        ),
      ],
    ),
  },
  "Proctor's Gaze": {
    spell: spell(
      [target.upTo(1, target.nonland())],
      [fx.bounce(ref.target()), fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
    ),
  },
  // Flying read from the text.
  Pterafractyl: {
    abilities: [
      entersWith({ counters: amount.x, label: "Enters with X +1/+1 counters" }),
      triggered(when.entersSelf, [fx.gainLife(2)], { label: "Gain 2 life" }),
    ],
  },
  "Quandrix Charm": {
    spell: modal(
      mode(
        "Counter a spell unless its controller pays {2}",
        [target.spell()],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
      ),
      mode("Destroy an enchantment", [target.permanent("t", ["Enchantment"], {}, "enchantment")], [fx.destroy(ref.target())]),
      mode(
        "A creature has base power and toughness 5/5",
        [target.creature()],
        [fx.modify(ref.target(), { setPower: 5, setToughness: 5 })],
      ),
    ),
  },
  "Tam, Observant Sequencer": {
    prepareSpell: spell([], [fx.draw(1), fx.gainLife(1)]),
    abilities: [triggered(when.landfall, [fx.prepare(ref.self)], { label: "Landfall: Tam becomes prepared" })],
  },

  // --- Witherbloom (black and green) --------------------------------------------
  "Blech, Loafing Pest": {
    abilities: [
      triggered(
        when.gainLife,
        [fx.addCountersAll({ controller: "you", anySubtype: ["Pest", "Bat", "Insect", "Snake", "Spider"] }, 1)],
        { label: "A +1/+1 counter on each of your Pests, Bats, Insects, Snakes and Spiders" },
      ),
    ],
  },
  "Bogwater Lumaret": {
    abilities: [triggered(when.enters(CREATURES_YOU), [fx.gainLife(1)], { label: "A creature enters: gain 1 life" })],
  },
  "Cauldron of Essence": {
    abilities: [
      triggered(when.dies(CREATURES_YOU), fx.drain(1), { label: "One of your creatures dies: drain 1" }),
      activated({
        mana: "{1}{B}{G}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card from your graveyard")],
        effects: [fx.toBattlefield(ref.target())],
        label: "Return a creature card from your graveyard to the battlefield",
      }),
    ],
  },
  "Dina's Guidance": {
    // The card found is held (revealed), then put into your hand or your graveyard, as you choose.
    spell: spell(
      [],
      [
        fx.searchHold({ types: ["Creature"] }, "c", 1, { reveal: true }),
        ...fx.when(
          cond.v("c"),
          fx.yourChoice("Put the card found into your hand or your graveyard?", "where", [
            { label: msg("Your hand"), effects: [fx.toHand(ref.stored("c"))] },
            { label: msg("Your graveyard"), effects: [fx.moveTo(ref.stored("c"), { to: "graveyard" })] },
          ]),
        ),
        fx.shuffle(ref.you),
      ],
    ),
  },
  "Essenceknit Scholar": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(PEST)], { label: "A 1/1 Pest" }),
      triggered(when.yourEndStep, [fx.draw(1)], {
        condition: cond.amountAtLeast(amount.yourCreaturesDiedThisTurn, 1),
        label: "One of your creatures died this turn: draw a card",
      }),
    ],
  },
  "Grapple with Death": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [fx.destroy(ref.target()), fx.gainLife(1)],
    ),
  },
  "Lluwen, Exchange Student": {
    prepareSpell: spell([], [fx.createTokens(PEST)]),
    abilities: [
      entersWith({ prepared: true }),
      activated({
        exileFromGraveyard: { filter: { types: ["Creature"] } },
        sorcerySpeed: true,
        effects: [fx.prepare(ref.self)],
        label: "Exile a creature card from your graveyard: Lluwen becomes prepared",
      }),
    ],
  },
  "Mind Roots": {
    spell: spell(
      [target.player("p")],
      [
        fx.discard(2, ref.target("p"), { store: "d" }),
        fx.pickFromZone(
          "graveyard",
          { types: ["Land"] },
          { to: "battlefield", tapped: true, underYourControl: true },
          { min: 0, pool: ref.stored("d"), prompt: "You may put a discarded land card onto the battlefield" },
        ),
      ],
    ),
  },
  // Reach and vigilance read from the text.
  "Old-Growth Educator": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, 2)], {
        condition: INFUSION,
        label: "Infusion: two +1/+1 counters",
      }),
    ],
  },
  // Trample read from the text.
  "Pest Mascot": {
    abilities: [triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "You gain life: a +1/+1 counter" })],
  },
  "Root Manipulation": {
    spell: spell(
      [],
      [
        fx.modifyAll(CREATURES_YOU, {
          power: 2,
          toughness: 2,
          addKeywords: ["menace"],
          addAbilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gain 1 life" })],
        }),
      ],
    ),
  },
  // Menace read from the text.
  "Teacher's Pest": {
    abilities: [
      triggered(when.attacksSelf, [fx.gainLife(1)], { label: "Gain 1 life" }),
      activated({
        mana: "{B}{G}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true })],
        label: "Returns from the graveyard tapped",
      }),
    ],
  },
  // Flying and deathtouch read from the text. Affinity for creatures: cost reduction.
  "Witherbloom, the Balancer": {
    costReduction: { generic: amount.count(CREATURES_YOU) },
    abilities: [
      costReducer(INSTANT_SORCERY, 0, "Your instants and sorceries have affinity for creatures", {
        genericAmount: amount.count(CREATURES_YOU),
      }),
    ],
  },

  // --- Other pairs -------------------------------------------------------------
  "Stirring Honormancer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(amount.count(CREATURES_YOU), { count: 1, exact: true, rest: "graveyard" })], {
        label: "Look at X cards: one to hand, the others to the graveyard",
      }),
    ],
  },
  "Nita, Forum Conciliator": {
    abilities: [
      triggered({ on: "castSpell", by: "you", notOwned: true }, [fx.addCountersAll(CREATURES_YOU, 1)], {
        label: "Spell you don't own: a +1/+1 counter on each of your creatures",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard("t", INSTANT_SORCERY, "opponent", "instant or sorcery card from an opponent's graveyard"),
        ],
        effects: [fx.exileCard(ref.target(), { name: "e" }), fx.grantPlay(ref.stored("e"), { anyMana: true, after: "exile" })],
        label: "Exile an opponent's instant or sorcery: you may cast it this turn",
      }),
    ],
  },
  "Molten Note": {
    castOptions: [flashback("{6}{R}{W}")],
    spell: spell(
      [target.creature()],
      [fx.damage(amount.manaSpent, ref.target()), fx.untapAll({ types: ["Creature"], controller: "you" })],
    ),
  },
  "Geometer's Arthropod": {
    abilities: [
      triggered(when.castSpell("you", { hasX: true }), [fx.lookAtTop(amount.eventX, { count: 1, exact: true, rest: "bottom" })], {
        label: "Spell with {X}: look at the top X cards, one to hand",
      }),
    ],
  },
  "Paradox Surveyor": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(5, { filter: { anyOf: [{ types: ["Land"] }, { hasX: true }] }, count: 1, rest: "bottom" })],
        { label: "Look at five cards: a land or a card with {X} to hand" },
      ),
    ],
  },
  "Suspend Aggression": {
    spell: spell(
      [target.nonland()],
      [
        fx.exileCard(ref.target(), { name: "a" }),
        fx.exileTop(ref.you, 1, "b"),
        fx.grantPlay(ref.stored("a"), { for: "owner", untilOwnersNextTurn: true }),
        fx.grantPlay(ref.stored("b"), { for: "owner", untilOwnersNextTurn: true }),
      ],
    ),
  },
  "Fractal Tender": {
    abilities: [
      INCREMENT,
      triggered(when.eachEndStep, [fx.createTokens(FRACTAL, 1, undefined, "f"), fx.addCounters(ref.stored("f"), 3)], {
        condition: cond.sourceMatches({ countersPutByYouThisTurn: true }),
        label: "You put a counter on it this turn: a Fractal with three +1/+1 counters",
      }),
    ],
  },
  "Zaffai and the Tempests": {
    abilities: [
      castPermission({
        freeFrom: "hand",
        freeFilter: INSTANT_SORCERY,
        freeOncePerTurn: true,
        condition: cond.yourTurn,
        label: "Once during each of your turns: an instant or sorcery from your hand without paying its cost",
      }),
    ],
  },
  "Lorehold, the Historian": {
    abilities: [
      // Miracle {2} (702.94) granted to the instants and sorceries in your hand: the first card drawn in the turn can be
      // cast for {2} as it is drawn.
      triggered(when.draw(1), [fx.castNow(ref.eventObject, { cost: "{2}" })], {
        condition: cond.eventObjectMatches(INSTANT_SORCERY),
        label: "Miracle {2}: cast the drawn instant or sorcery for {2}",
      }),
      triggered(
        { on: "step", step: "upkeep", whose: "opponent" },
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
        { label: "Opponent's upkeep: you may discard a card to draw one" },
      ),
    ],
  },
  "Quandrix, the Proof": {
    abilities: [
      triggered(when.castSelf, [fx.cascade(6)], { label: "Cascade" }),
      // "Instant and sorcery spells you cast from your hand have cascade."
      triggered(
        { on: "castSpell", by: "you", filter: INSTANT_SORCERY, fromHand: true },
        [fx.cascade(amount.manaValueOf(ref.eventObject))],
        { label: "Cascade of the instant or sorcery spell cast from your hand" },
      ),
    ],
  },
};
