/**
 * Reality Fracture — lot F: unique cards (mechanics of a single card, legends, planeswalkers).
 * Emrakul, Uldaros Theorix and Hall of Echoes come from lot 0.1 of the Standard branch.
 */
import { type AbilityDef, type ActivatedAbilityDef, type CardType, msg, type ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  BEAST_TRAMPLE,
  CADET,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  castPermission,
  cmp,
  cond,
  DRAGON_5,
  empower,
  entersWith,
  eventReplacement,
  fx,
  graveyardReplacement,
  loyalty,
  loyaltyX,
  manaAbility,
  modal,
  mode,
  playerStatic,
  powerFor,
  powerRuleAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };

/** Uldaros Theorix: "up to one target nonland card of each card type from your graveyard". */
const ULDAROS_TYPES: CardType[] = ["Artifact", "Creature", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle"];
const uldarosId = (t: string) => `u${t}`;
const CREATURE_OR_WALKER: ObjectFilter = { types: ["Creature", "Planeswalker"] };

/** Loyalty ability that can be activated only under a condition. */
const withCondition = (ab: ActivatedAbilityDef, c: ActivatedAbilityDef["activationCondition"]): ActivatedAbilityDef => ({
  ...ab,
  activationCondition: c,
});

/** Face Yourself: "At the beginning of the end step, if you control no planeswalkers, sacrifice this creature." */
const SACRIFICE_WITHOUT_WALKER: AbilityDef = triggered(when.eachEndStep, [fx.sacrificeIt(ref.self)], {
  condition: cond.not(cond.controls({ types: ["Planeswalker"] })),
  label: "Without a planeswalker: sacrifice it",
});

/** Seasoned Cryomancer: "tap up to N target creatures, a stun counter on each of them". */
const cryoReflexive = (n: number) =>
  fx.reflexive([target.upTo(n, target.creature("t"))], [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)]);

export const UNIQUE: Record<string, CardScript> = {
  // --- Lot 0.1 (Standard branch) ---------------------------------------------
  "Emrakul, the Exigent Doom": {
    abilities: [
      triggered(when.castSelf, [fx.untapUpTo({ types: ["Land"] }, 99)], { label: "Untap all your lands" }),
      activated({
        mana: "{3}",
        fromHand: true,
        exileSelf: true,
        targets: [target.permanent("t", ["Land"], {}, "land")],
        effects: [
          fx.modifyWhileExiled(ref.target(), { addAbilities: [manaAbility("C", 2)] }, ref.selfCard),
          fx.grantPlay(ref.selfCard, { forever: true }),
        ],
        label: 'Exile it: a land gains "{T}: Add {C}{C}"',
      }),
    ],
  },
  "Uldaros Theorix": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...ULDAROS_TYPES.map((t) => fx.exileCard(ref.target(uldarosId(t)), { name: uldarosId(t) })),
          fx.castCopiesFree(
            ULDAROS_TYPES.map((t) => ref.stored(uldarosId(t))),
            6,
          ),
        ],
        {
          targets: ULDAROS_TYPES.map((t) => ({
            ...target.upTo(
              1,
              target.cardInGraveyard(uldarosId(t), { types: [t], notTypes: ["Land"] }, "you", msg("{type} card", { type: t })),
            ),
            otherThan: ULDAROS_TYPES.filter((x) => x !== t).map(uldarosId),
          })),
          condition: cond.wasCast,
          label: "Exile and copy, cast for free (total mana value 6 or less)",
        },
      ),
    ],
  },
  "Hall of Echoes": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.becomeCopy(ref.self, ref.target()), fx.noLegendRuleThisTurn],
        label: "Becomes a copy of the target creature",
      }),
    ],
  },

  // --- White -----------------------------------------------------------------
  "Enlightened Confidant": {
    abilities: [
      triggered(when.yourEndStep, [fx.surveil(1, { maxManaValue: amount.lifeGainedThisTurn })], {
        condition: cond.lifeGainedAtLeast(1),
        label: "Surveil 1; a card that costs enough returns to hand",
      }),
    ],
  },
  "Kindred Judgment": {
    spell: spell([], [fx.chooseForSelf("creatureType"), fx.destroyAll({ types: ["Creature"], not: { chosen: "subtype" } })]),
  },
  "Danitha, Sword of Hope": {
    abilities: [
      triggered(
        when.castSpell("you", { subtype: "Equipment" }, { objects: CREATURE_YOU_CONTROL, orFilter: true }),
        [fx.draw(1)],
        { oncePerTurn: true, label: "Draw a card (once each turn)" },
      ),
    ],
  },
  "Ghalta the Immovable": {
    costReduction: { generic: amount.maxToughness(CREATURE_YOU_CONTROL) },
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { addKeywords: ["attacksDespiteDefender"], addPowerRules: [powerFor.combatToughness] },
        { label: "Attack despite defender; deal damage by toughness if it's greater" },
      ),
    ],
  },
  "Thalia, the Survivor": {
    abilities: [
      {
        kind: "costReduction",
        filter: { notTypes: ["Creature"] },
        generic: -1,
        opponents: true,
        label: "Opponents' noncreature spells: {1} more",
      },
    ],
  },
  "Tomik, Orzhov Lawmage": {
    abilities: [
      playerStatic({ maxOneAttacker: "walkers", label: "Only one creature can attack each of your planeswalkers" }),
      activated({
        tap: true,
        targets: [target.creature("t", { withCounter: "+1/+1" })],
        effects: [fx.pump(ref.target(), 0, 0, ["flying"])],
        label: "Flying until end of turn",
      }),
    ],
  },
  "Yoshimaru, Beloved Companion": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        counter: "+1/+1",
        modify: { add: 1 },
        label: "One more +1/+1 counter on your creatures",
      }),
      activated({
        mana: "{6}",
        targets: [target.creature("t", { legendary: true })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "+1/+1 counter on a legendary creature",
      }),
    ],
  },
  "Yuriko, Blade of the Mighty": {
    abilities: [
      playerStatic({
        castLimit: { who: "each", during: "combat", abilities: "all" },
        label: "During combat: no spells or abilities",
      }),
      triggered(when.attacks(CREATURE_YOU_CONTROL), [fx.pump(ref.eventObject, 0, 0, ["doubleStrike"])], {
        condition: cond.attackingAlone,
        label: "Attacks alone: double strike",
      }),
    ],
  },

  // --- Blue ------------------------------------------------------------------
  "Cruel Calculations": {
    spell: spell([target.player("t")], [fx.draw(amount.milledThisTurn(ref.target()))]),
  },
  "Seasoned Cryomancer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(2),
          fx.discard(2, ref.you, { store: "n", storeFilter: { notTypes: ["Land"] } }),
          fx.when(cond.v("n", 2), cryoReflexive(2)),
          fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), cryoReflexive(1)),
        ],
        { label: "Draw 2, discard 2, stun" },
      ),
      activated({
        mana: "{3}{U}{U}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.draw(2)],
        label: "From your graveyard: draw two cards",
      }),
    ],
  },
  "Sphinx of False Conclusions": {
    abilities: [
      triggered(when.attacksSelf, fx.loot(1), { label: "Draw, then discard one" }),
      triggered(when.diesSelf, fx.when(cond.eventObjectMatches({ token: false }), fx.copyToken(ref.eventObject)), {
        label: "Token copy",
      }),
    ],
  },
  "Sphinx's Approach": {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.when(
          cond.amountAtLeast(amount.countIn("graveyard", { name: "Sphinx's Approach" }), 4),
          fx.may(
            "exile this spell and four Sphinx's Approach to search for a Sphinx?",
            fx.exileOnResolve,
            fx.pickFromZone("graveyard", { name: "Sphinx's Approach" }, { to: "exile" }, { count: 4, min: 4 }),
            fx.search({ types: ["Creature"], subtype: "Sphinx" }, { to: "battlefield" }),
          ),
        ),
      ],
    ),
  },
  "Variable Chaser": {
    prepareSpell: spell([], [fx.mayWheel]),
    abilities: [entersWith({ prepared: true })],
  },
  "Chandra, Chill of Compliance": {
    abilities: [
      loyalty(1, {
        effects: [fx.surveil(1, { filter: { notTypes: ["Creature", "Land"] } })],
        label: "Surveil 1; a noncreature, nonland card returns to hand",
      }),
      loyalty(1, {
        effects: [fx.addManaChoice(1, ["U"], { spell: { notTypes: ["Creature"] } })],
        label: "Add {U} (only for a noncreature spell)",
      }),
      loyaltyX({
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun", amount.x)],
        label: "Tap, X stun counters",
      }),
      loyalty(-6, {
        effects: [
          fx.emblem(msg("Chandra's emblem"), msg("Whenever you cast a spell, draw a card."), [
            triggered(when.castSpell("you"), [fx.draw(1)], { label: "Draw a card" }),
          ]),
        ],
        label: "Emblem",
      }),
    ],
  },
  "Fblthp, Impossibly Lost": {
    abilities: [
      // "One or more of your opponents": one trigger per combat damage step.
      triggered(
        when.combatDamageToOpponent({}),
        [
          fx.draw(2),
          fx.when(cond.not(cond.amountAtLeast(amount.cardsIn("library"), 1)), fx.winGame),
          fx.moveTo(ref.self, { to: "libraryTop" }),
          fx.shuffle(),
        ],
        { condition: cond.yourTurn, batched: true, label: "Draw two cards, shuffle Fblthp" },
      ),
    ],
  },
  "Jace, Reality Sculptor": {
    abilities: [
      loyalty(1, { effects: [empower(amount.count({ subtype: "Island", controller: "you" }))], label: "Empower Jace X" }),
      loyalty(-3, {
        effects: [
          fx.emblem(
            msg("Jace's emblem (until your next turn)"),
            msg("Whenever a creature attacks you or a planeswalker you control, it gets -5/-0."),
            [
              triggered(when.attacksYou(CREATURE, true), [fx.pump(ref.eventObject, -5, 0)], {
                label: "The attacker gets -5/-0",
              }),
            ],
            true,
          ),
        ],
        label: "Until your next turn: attackers -5/-0",
      }),
      withCondition(
        loyalty(0, { effects: [fx.exileLibraryButBottom(ref.eachOpponent)], label: "Exile your opponents' libraries" }),
        cond.amountAtLeast(amount.countersAmong({ subtype: "Jace", controller: "you" }, "loyalty"), 25),
      ),
    ],
  },

  // --- Black -----------------------------------------------------------------
  "Break Under Pressure": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.sacrifice(ref.target(), CREATURE_OR_WALKER, 1, { greatestManaValue: true }), fx.gainLife(2)],
    ),
  },
  /** Arena (BO1): "outside the game" doesn't exist, the spell does nothing. */
  "Extrapolate the Impossible": { spell: spell([], []) },
  "Danitha, Spear of Agony": {
    abilities: [
      triggered(when.castSpell("you", undefined, { players: "opponent", objects: { controller: "opponent" } }), [
        fx.addCounters(ref.self, 1),
      ]),
    ],
  },
  "Gallia, Tragic Host": {
    abilities: [
      activated({
        mana: "{4}{B}",
        fromGraveyard: true,
        exileFromGraveyard: { filter: CREATURE },
        effects: [fx.toBattlefield(ref.self, { tapped: true, counters: { kind: "+1/+1", n: 1 } })],
        label: "Returns tapped with a +1/+1 counter",
      }),
    ],
  },
  "Garruk, Veiled Butcher": {
    abilities: [
      graveyardReplacement({
        fromBattlefield: true,
        filter: { types: ["Creature"], controller: "opponent" },
        label: "Opponents' creatures are exiled instead of dying",
      }),
      loyalty(2, {
        targets: [target.upTo(1, target.creature("t"))],
        effects: [fx.modify(ref.target(), { power: -4, toughness: -1 }, "untilYourNextTurn")],
        label: "-4/-1 until your next turn",
      }),
      loyalty(-2, {
        effects: [
          fx.sacrifice(ref.you, CREATURE, 1, { store: "me" }),
          fx.sacrifice(ref.eachOpponent, CREATURE),
          fx.when(cond.v("me"), fx.createTokens(BEAST_TRAMPLE)),
        ],
        label: "Each player sacrifices a creature",
      }),
      loyalty(-3, {
        // "For each opponent who didn't discard two nonland cards": the nonland cards discarded are counted for
        // each of them; those who discarded two are subtracted from the number of opponents.
        effects: [
          ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [
            fx.discard(2, p, { store: `nl${n}`, storeFilter: { notTypes: ["Land"] } }),
          ]),
          fx.draw(
            amount.plus(
              amount.refCount(ref.eachOpponent),
              ...Array.from({ length: 6 }, (_, n) => amount.neg(amount.per(amount.v(`nl${n}`), 2))),
            ),
          ),
        ],
        label: "Each opponent discards two cards",
      }),
    ],
  },
  "Gideon the Oathless": {
    abilities: [
      triggered(when.enters(CREATURE_OPP), [fx.damage(1, ref.controllerOf(ref.eventObject))], {
        label: "1 damage to its controller",
      }),
      triggered(when.loyaltyActivated(undefined, true), [fx.damage(1, ref.eventPlayer)], { label: "1 damage" }),
    ],
  },
  "Loot, the Anomaly": {
    abilities: [
      powerRuleAbility(powerFor.combatAbsolute),
      activated({
        sacrificeOther: { filter: { ...CREATURE_OR_WALKER, other: true } },
        activationCondition: cond.threshold,
        effects: [fx.pump(ref.self, -2, 0)],
        label: "Threshold: -2/-0",
      }),
    ],
  },

  // --- Red -------------------------------------------------------------------
  "Command the Stage": {
    spell: spell(
      [],
      [
        // The counters first: the Cadet created isn't affected ("each other Wizard token").
        fx.addCountersAll({ types: ["Creature"], subtype: "Wizard", token: true, controller: "you" }, 1),
        fx.createTokens(CADET),
      ],
    ),
    abilities: [
      triggered(when.step("upkeep", "any"), [fx.toHand(ref.selfCard)], {
        fromGraveyard: true,
        condition: cond.opponentDealtNoncombatDamageLastTurn,
        label: "Returns to hand",
      }),
    ],
  },
  "Curse-Marred Demon": {
    abilities: [
      triggered(when.entersSelf, [fx.search({}, { to: "hand" }), fx.discard(1, ref.you, { random: true })], {
        label: "Search for a card, discard at random",
      }),
    ],
  },
  "Draconic Visitor": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { types: ["Artifact"] },
        instead: { token: DRAGON_5 },
        modify: {},
        label: "Artifact tokens: 5/5 flying Dragons instead",
      }),
    ],
  },
  "Face Yourself": {
    spell: spell(
      [target.player("p")],
      [
        fx.copyToken(ref.permanentsOf(ref.target("p"), CREATURE), {
          addKeywords: ["haste"],
          addAbilities: [SACRIFICE_WITHOUT_WALKER],
        }),
      ],
    ),
  },
  "Identity Echo": {
    abilities: [
      activated({
        mana: "{3}{R}",
        sorcerySpeed: true,
        targets: [target.creatureOrPlaneswalker("t", { controller: "you" })],
        effects: [fx.exile(ref.target()), fx.revealUntil(CREATURE_OR_WALKER, { to: "battlefield" })],
        label: "Exile it, reveal until a creature or planeswalker",
      }),
    ],
  },
  "Pyre Rhymer": {
    prepareSpell: spell(
      [],
      [
        fx.thisTurn({
          replacement: { event: "mana", to: "you", source: { subtype: "Mountain" }, extraMana: "R", modify: { add: 1 } },
        }),
      ],
    ),
    abilities: [entersWith({ prepared: true })],
  },
  "Chandra, Torch of Defiance": {
    abilities: [
      loyalty(1, {
        effects: [
          fx.exileTop(ref.you, 1, "c"),
          // A land can't be cast: the 2 damage is dealt.
          fx.castNow(ref.stored("c"), { storeCast: "cast" }),
          fx.when(cond.not(cond.v("cast")), fx.damage(2, ref.eachOpponent)),
        ],
        label: "Exile the top card, you may cast it",
      }),
      loyalty(1, { effects: [fx.addMana("R", "R")], label: "Add {R}{R}" }),
      loyalty(-3, { targets: [target.creature("t")], effects: [fx.damage(4, ref.target())], label: "4 damage" }),
      loyalty(-7, {
        effects: [
          fx.emblem(msg("Chandra's emblem"), msg("Whenever you cast a spell, this emblem deals 5 damage to any target."), [
            triggered(when.castSpell("you"), [fx.damage(5, ref.target())], { targets: [target.any()], label: "5 damage" }),
          ]),
        ],
        label: "Emblem",
      }),
    ],
  },
  "Jiang Yanggu, Alone": {
    abilities: [
      triggered(
        when.attacks(CREATURE_YOU_CONTROL),
        [fx.discard(1), fx.draw(1), fx.addCounters(ref.eventObject, amount.cardsDiscardedThisTurn)],
        { condition: cond.attackingAlone, label: "Discard, draw, +1/+1 counters" },
      ),
    ],
  },
  "Tetsuko Umezawa, Pursuer": {
    abilities: [
      triggered(
        when.blocks({ types: ["Creature"], controller: "opponent", anyOf: [{ maxPower: 1 }, { maxToughness: 1 }] }),
        [fx.damage(1, ref.controllerOf(ref.eventObject))],
        { label: "1 damage to the blocker's controller" },
      ),
    ],
  },
  "Tomik, Izzet Sparkmage": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponentSide",
        combat: false,
        modify: { add: 1 },
        label: "Noncombat damage to opponents: +1",
      }),
    ],
  },

  // --- Green -----------------------------------------------------------------
  Gardenize: {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.counters(ref.self, "charge", 1)], { label: "Charge counter" }),
      triggered(when.step("main1"), [fx.addManaTimes(amount.countersOn(ref.self, "charge"), "G")], {
        label: "{G} for each charge counter",
      }),
    ],
  },
  "Hexhaven Invigorator": {
    abilities: [
      triggered(
        when.isDealtDamage,
        fx.may("search for lands?", fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, amount.eventAmount)),
        { label: "As many lands as damage" },
      ),
    ],
  },
  Omnipresence: {
    abilities: [
      castPermission({
        freeFrom: "hand",
        freeFilter: { compare: [cmp.manaValue("<=", amount.count({ types: ["Creature"], controller: "you" }))] },
        label: "Spells with mana value ≤ your creatures: without paying their cost",
      }),
    ],
  },
  Tarmogoyf: {
    cdaPower: amount.cardTypesInGraveyards,
    cdaToughness: amount.plus(amount.cardTypesInGraveyards, 1),
  },
  "Garruk, Curse Breaker": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", minPower: 4 }), [fx.draw(1)], {
        label: "Draw a card",
      }),
      loyalty(2, {
        targets: [target.upTo(2, target.permanent("t", ["Land"], {}, "land"))],
        effects: [fx.untap(ref.target())],
        label: "Untap up to two lands",
      }),
      loyalty(-3, { effects: [fx.createTokens(BEAST_TRAMPLE)], label: "4/4 trample Beast" }),
      loyalty(-4, {
        effects: [
          fx.emblem(
            msg("Garruk's emblem (until your next turn)"),
            msg("Whenever one or more creatures attack one of your opponents, they get +2/+2 and gain trample."),
            [
              // Any player's creatures attacking one of your opponents (a player, not a planeswalker).
              triggered(
                when.attackWith(1, { attacking: "opponent" }, true),
                [fx.pumpAll({ attacking: "opponent" }, 2, 2, ["trample"])],
                { label: "Attackers +2/+2, trample" },
              ),
            ],
            true,
          ),
        ],
        label: "Until your next turn: attackers +2/+2",
      }),
    ],
  },
  "Loot, the Nexus": {
    abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { distinctPowers: true })],
  },
  "Ruric Thar, Magecrusher": {
    cantBeCountered: true,
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.not(cond.sourceDealtCombatDamage), label: "Hexproof (no combat damage yet)" },
      ),
    ],
  },

  // --- Multicolored and artifacts --------------------------------------------
  "Clash of Elements": { spell: spell([target.nonland("t")], [fx.topOrBottom(ref.target(), 2)]) },
  "Fatehold Charm": {
    spell: modal(
      mode("Draw, empower Jace 2", [], [fx.draw(1), empower(2)]),
      mode(
        "Return a spell or creature",
        [{ id: "t", label: "spell or creature", filter: { spells: {}, objects: CREATURE } }],
        [fx.bounce(ref.target())],
      ),
      mode("Your creatures: +1/+2", [], [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 2)]),
    ),
  },
  "Null Summoner": {
    abilities: [
      triggered(when.entersSelf, [fx.exileFromHandLinked(ref.target(), { notTypes: ["Land"] })], {
        targets: [target.player("t", "opponent")],
        condition: cond.wasCast,
        label: "Exile a nonland card from their hand",
      }),
      playerStatic({
        playFrom: { zone: "linked", what: "spells", anyMana: true },
        condition: cond.threshold,
        label: "Threshold: cast the exiled card",
      }),
    ],
  },
  "Recursive Recruitment": {
    flashback: "{6}{U}{B}",
    spell: spell(
      [],
      [
        fx.createTokens(CADET, 2, undefined, "c"),
        fx.when(cond.spellCastFromGraveyard, fx.addCounters(ref.stored("c"), amount.per(amount.countIn("graveyard"), 3))),
      ],
    ),
  },
  "Twinned Vision": {
    flashback: "{1}{U/R}{U/R}",
    flashbackCost: { discard: 1 },
    spell: spell([], [fx.when(cond.spellCastFromHand, fx.draw(1)), fx.when(cond.not(cond.spellCastFromHand), fx.draw(2))]),
  },
  "Twisted Fates": {
    spell: spell(
      [target.nonland("t"), target.player("p")],
      [fx.destroy(ref.target()), fx.addCounters(ref.permanentsOf(ref.target("p"), CREATURE), 1)],
    ),
  },
  "Warrior's Blades": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target()), fx.gainLife(3)], {
        targets: [target.any()],
        label: "3 damage, gain 3 life",
      }),
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
    ],
  },
  "Hapatra, the Desert Fang": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1", amount.maxManaValueInGraveyard)], {
        // "for each opponent, … up to one target creature that player controls" (three opponents at most).
        targets: [{ ...target.upTo(3, target.creature("t", { controller: "opponent" })), differentPlayers: true }],
        label: "-1/-1 counters",
      }),
    ],
  },
  "Karn, Gilded Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.distinctColors({ types: ["Artifact"], controller: "you", other: true }))], {
        label: "A card for each color among your other artifacts",
      }),
    ],
  },
  "Karn, Argent Defender": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "none", on: "enter", entering: { types: ["Artifact", "Creature"] }, everyone: true },
        label: "Artifacts and creatures entering trigger nothing",
      }),
    ],
  },
};
