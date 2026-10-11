/**
 * Edge of Eternities, lot C: rares, mythics and unique cards (mana spent, reduced activation costs,
 * player statics, playable exiled cards, granted ward).
 */
import type { Amount, CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  cost,
  costReducer,
  entersWith,
  eventReplacement,
  fx,
  LANDER,
  lander,
  manaAbility,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  ROBOT,
  ref,
  SLIVER,
  spell,
  staticAbility,
  TWO_TAPPED,
  target,
  triggered,
  triggeredModal,
  WITH_P1P1,
  wardAbility,
  when,
} from "./common";

const FIVE_COLORS = ["W", "U", "B", "R", "G"] as const;
/** Cards you own in exile (Cosmogoyf). */
const OWNED_IN_EXILE: Amount = { kind: "count", filter: {}, zone: "exile" };
const KAVU_YOU: ObjectFilter = { subtype: "Kavu", controller: "you" };

export const RARES: Record<string, CardScript> = {
  // --- White -----------------------------------------------------------------
  "Starport Security": {
    abilities: [
      activated({
        mana: "{3}{W}",
        tap: true,
        targets: [target.creature("t", { other: true })],
        effects: [fx.tap(ref.target())],
        reduction: { generic: 2, condition: cond.controls(WITH_P1P1) },
        label: "Tap another creature",
      }),
    ],
  },
  "Sunstar Chaplain": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: TWO_TAPPED,
        label: "+1/+1 counter",
      }),
      activated({
        mana: "{2}",
        removeCounterFrom: { filter: CREATURE_YOU_CONTROL, kind: "+1/+1" },
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
        effects: [fx.tap(ref.target())],
        label: "Tap an artifact or creature",
      }),
    ],
  },
  "Astelli Reclaimer": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, notTypes: ["Creature", "Land"], compare: [cmp.manaValue("<=", amount.sourceManaSpent)] },
            "you",
            "noncreature, nonland permanent card",
          ),
        ],
        label: "Return a permanent (mana value ≤ mana spent)",
      }),
    ],
  },
  "Hardlight Containment": {
    enchant: { filter: { types: ["Artifact"], controller: "you" }, label: "artifact you control" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Exile an opponent's creature",
      }),
      staticAbility("attached", { addAbilities: [wardAbility({ mana: cost("{1}") })] }, { label: "Ward {1}" }),
    ],
  },
  "Lightstall Inquisitor": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.exileFromOwnHand(ref.eachOpponent, "h"),
          fx.grantPlay(ref.stored("h"), { forever: true, for: "owner", extraCost: 1, tapped: true }),
        ],
        { label: "Each opponent exiles a card from their hand" },
      ),
    ],
  },

  // --- Blue ------------------------------------------------------------------
  Unravel: {
    spell: spell(
      [target.spell("t")],
      [fx.when(cond.targetMatches("t", { manaSpentBelowValue: true }), fx.draw(1)), fx.counter(ref.target())],
    ),
  },
  "Emissary Escort": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        {
          perAmount: amount.maxManaValue({ types: ["Artifact"], controller: "you", other: true }),
          label: "+X/+0 (greatest mana value among your other artifacts)",
        },
      ),
    ],
  },
  "Uthros Psionicist": {
    abilities: [
      costReducer({}, 2, "The second spell each turn costs {2} less", {
        condition: cond.castThisTurn(1, false, true),
      }),
    ],
  },
  "Starfield Vocalist": {
    abilities: [playerStatic({ triggerMod: { effect: "again", on: "enter" }, label: "Enter triggers doubled" })],
  },
  "Quantum Riddler": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw" }),
      eventReplacement({
        event: "draw",
        to: "you",
        modify: { add: 1 },
        condition: cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 2)),
        label: "One more card with a hand of 1 card or fewer",
      }),
    ],
  },
  "Mm'menon, the Right Hand": {
    abilities: [
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { types: ["Artifact"] }, what: "spells" },
        label: "Artifact spells from the top of your library",
      }),
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        { addAbilities: [manaAbility("U", 1, { restriction: { spellFrom: "elsewhere" } })] },
        { label: 'Your artifacts: "{T}: {U}" (spells from outside your hand)' },
      ),
    ],
  },
  "Steelswarm Operator": {
    abilities: [
      manaAbility("U", 1, { restriction: { spell: { types: ["Artifact"] } } }),
      manaAbility("U", 2, { restriction: { abilityOfSource: { types: ["Artifact"] } } }),
    ],
  },
  Weftwalking: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.moveAll("hand", ref.you, {}, { to: "libraryTop" }),
          fx.moveAll("graveyard", ref.you, {}, { to: "libraryTop" }),
          fx.shuffle(),
          fx.draw(7),
        ],
        { condition: cond.wasCast, label: "Hand and graveyard shuffled in, draw seven cards" },
      ),
      playerStatic({ firstSpellFree: true, label: "First spell each turn free" }),
    ],
  },

  // --- Black -----------------------------------------------------------------
  "Alpharael, Stonechosen": {
    abilities: [
      triggered(when.attacksSelf, [fx.loseLife(amount.halfLife(ref.defendingPlayer), ref.defendingPlayer)], {
        condition: cond.void,
        label: "Void: the defending player loses half their life",
      }),
    ],
  },
  "Requiem Monolith": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [
          fx.modify(ref.target(), {
            addAbilities: [
              triggered(when.isDealtDamage, [fx.draw(amount.eventAmount), fx.loseLife(amount.eventAmount)], {
                label: "Dealt damage: draw that many, lose that much life",
              }),
            ],
          }),
          fx.mayFor(ref.controllerOf(ref.target()), "1 damage to the creature?", fx.damage(1, ref.target())),
        ],
        label: "Damage = draw",
      }),
    ],
  },
  "Blade of the Swarm": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Two +1/+1 counters", [], [fx.addCounters(ref.self, 2)]),
        mode(
          "A card exiled with warp on the bottom of its owner's library",
          [{ id: "t", label: "card exiled with warp", filter: { exiled: { withCost: "warp" } } }],
          [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        ),
      ]),
    ],
  },

  // --- Red -------------------------------------------------------------------
  "Kav Landseeker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(LANDER, 1, undefined, "l"),
          fx.delayedAt("yourNextEndStep", [fx.sacrificeIt(ref.target("l"))], { l: ref.stored("l") }),
        ],
        { label: "Lander (sacrificed on your next turn)" },
      ),
    ],
  },
  "Kavaron Harrier": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{2}",
          "Pay {2} for an attacking Robot?",
          fx.createTappedTokens(ROBOT, 1, { attacking: true, store: "r" }),
          fx.delayedAt("endOfCombat", [fx.sacrificeIt(ref.target("r"))], { r: ref.stored("r") }),
        ),
        { label: "{2}: attacking 2/2 Robot" },
      ),
    ],
  },
  "Terrapact Intimidator": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mayForStore(ref.target(), "Let the opponent create two Landers?", "l", lander(2)),
          fx.when(cond.not(cond.v("l")), fx.addCounters(ref.self, 2)),
        ],
        { targets: [target.player("t", "opponent")], label: "Two Landers or two +1/+1 counters" },
      ),
    ],
  },
  "Memorial Vault": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [
          fx.exileTop(ref.you, amount.plus(1, amount.manaValueOf(ref.costSacrificed)), "v"),
          fx.grantPlay(ref.stored("v")),
        ],
        label: "Exile 1 + mana value cards, playable this turn",
      }),
    ],
  },
  "Roving Actuator": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 2)], {
        targets: [
          target.upTo(
            1,
            target.cardInGraveyard("t", { types: ["Instant", "Sorcery"], maxManaValue: 2 }, "you", "instant or sorcery"),
          ),
        ],
        condition: cond.void,
        label: "Void: copy an instant or sorcery",
      }),
    ],
  },
  "Possibility Technician": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ self: true }, { ...KAVU_YOU, other: true }] }),
        [fx.exileTop(ref.you, 1, "p"), fx.grantPlay(ref.stored("p"), { forever: true, condition: cond.controls(KAVU_YOU) })],
        { label: "Exile the top card (playable with a Kavu)" },
      ),
    ],
  },
  "Territorial Bruntar": {
    abilities: [
      triggered(when.landfall, [fx.exileUntil({ notTypes: ["Land"] }, "b"), fx.grantPlay(ref.stored("b"))], {
        label: "Exile up to one nonland card, castable this turn",
      }),
    ],
  },
  "Tannuk, Steadfast Second": {
    abilities: [
      staticAbility(OTHER_CREATURE_YOU_CONTROL, { addKeywords: ["haste"] }, { label: "Haste" }),
      playerStatic({
        grantWarp: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"], colors: ["R"] }] }, cost: cost("{2}{R}") },
        label: "Warp {2}{R}",
      }),
    ],
  },

  // --- Green -----------------------------------------------------------------
  "Bioengineered Future": {
    abilities: [
      triggered(when.entersSelf, [lander()], { label: "Lander" }),
      entersWith({
        counters: amount.landsEnteredThisTurn,
        affects: CREATURE_YOU_CONTROL,
        label: "A +1/+1 counter for each land that entered this turn",
      }),
    ],
  },
  "Frenzied Baloth": {
    rules: { cantBeCountered: true },
    abilities: [
      playerStatic({
        uncounterable: { filter: { types: ["Creature"] } },
        damageUnpreventable: "combat",
        label: "Creature spells can't be countered, combat damage can't be prevented",
      }),
    ],
  },
  "Gene Pollinator": { abilities: [manaAbility([...FIVE_COLORS], 1, { tapAnother: true })] },
  "Icetill Explorer": {
    abilities: [
      playerStatic({
        extraLands: 1,
        playFrom: { zone: "graveyard", what: "lands" },
        label: "Additional land, from the graveyard",
      }),
      triggered(when.landfall, [fx.mill(1)], { label: "Mill a card" }),
    ],
  },
  Skystinger: {
    abilities: [
      triggered(when.blocks("self", { keyword: "flying" }), [fx.pump(ref.self, 5, 0)], {
        label: "Blocks a creature with flying: +5/+0",
      }),
    ],
  },
  Terrasymbiosis: {
    abilities: [
      triggered(
        when.youPutCounters(CREATURE_YOU_CONTROL, "+1/+1"),
        // "Do this only once each turn": a refusal doesn't count.
        fx.may("Draw that many cards?", fx.draw(amount.eventAmount), fx.doneOncePerTurn),
        { oncePerTurn: "ifDone", label: "Draw that many cards (once each turn)" },
      ),
    ],
  },
  Cosmogoyf: { cda: { power: OWNED_IN_EXILE, toughness: amount.plus(OWNED_IN_EXILE, 1) } },

  // --- Multicolor ------------------------------------------------------------
  "Sami, Wildcat Captain": {
    abilities: [
      costReducer({}, 0, "Affinity for artifacts", {
        genericAmount: amount.count({ types: ["Artifact"], controller: "you" }),
      }),
    ],
  },
  "Syr Vondam, Sunstar Exemplar": {
    abilities: [
      triggered(when.diesOrExiled(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.self, 1), fx.gainLife(1)], {
        label: "+1/+1 counter, +1 life",
      }),
      triggered(when.diesOrExiled("self", 4), [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.nonland("t"))],
        label: "Destroy a nonland permanent",
      }),
    ],
  },
  "Tannuk, Memorial Ensign": {
    abilities: [
      triggered(
        when.landfall,
        [
          fx.damage(1, ref.eachOpponent),
          fx.countResolution("n"),
          fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.draw(1)),
        ],
        { label: "1 damage to each opponent (2nd time: draw)" },
      ),
    ],
  },

  // --- Colorless and lands ---------------------------------------------------
  "Survey Mechan": {
    abilities: [
      activated({
        mana: "{10}",
        sacrifice: true,
        targets: [target.any("a"), target.player("p")],
        effects: [fx.damage(3, ref.target("a")), fx.draw(3, ref.target("p")), fx.gainLife(3, ref.target("p"))],
        reduction: { generic: amount.distinctNames({ types: ["Land"], controller: "you" }) },
        label: "3 damage, draw three cards, +3 life",
      }),
    ],
  },
  "Thaumaton Torpedo": {
    abilities: [
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        targets: [target.nonland("t")],
        effects: [fx.destroy(ref.target())],
        reduction: { generic: 3, condition: cond.attackedWith("Spacecraft") },
        label: "Destroy a nonland permanent",
      }),
    ],
  },
  "Thrumming Hivepool": {
    costReduction: { generic: amount.count({ subtype: "Sliver", controller: "you" }) },
    abilities: [
      staticAbility(
        { subtype: "Sliver", controller: "you" },
        { addKeywords: ["doubleStrike", "haste"] },
        { label: "Double strike and haste" },
      ),
      triggered(when.yourUpkeep, [fx.createTokens(SLIVER, 2)], { label: "Two 1/1 Slivers" }),
    ],
  },
  "The Endstone": {
    abilities: [
      triggered(when.playLand, [fx.draw(1)], { label: "Draw" }),
      triggered(when.castSpell("you"), [fx.draw(1)], { label: "Draw" }),
      // "half your starting life total, rounded up" (10 in a duel, 20 in Commander).
      triggered(when.yourEndStep, [fx.setLife({ kind: "div", of: amount.startingLife, by: 2, up: true })], {
        label: "Your life total becomes half your starting life total",
      }),
    ],
  },
  "Secluded Starforge": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{2}",
        tap: true,
        tapX: { types: ["Artifact"] },
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), amount.x, 0)],
        label: "+X/+0",
      }),
      activated({ mana: "{5}", tap: true, effects: [fx.createTokens(ROBOT)], label: "2/2 Robot" }),
    ],
  },
  "Command Bridge": {
    abilities: [
      entersWith({ tapped: true }),
      // "Sacrifice it unless you tap an untapped permanent you control" (itself included, if untapped).
      triggered(
        when.entersSelf,
        [fx.tapChosen({}, "bridge", { exactly: 1 }), ...fx.when(cond.not(cond.v("bridge")), fx.sacrificeIt(ref.self))],
        { label: "Tap a permanent or sacrifice it" },
      ),
      manaAbility([...FIVE_COLORS]),
    ],
  },
};
