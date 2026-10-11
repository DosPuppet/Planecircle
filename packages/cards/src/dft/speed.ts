/**
 * Aetherdrift, lot B: speed ("Start your engines!", "Max speed — …", 702.179) and exhaust (702.177).
 * "Start your engines!" is read from the text; "Max speed — [ability]" is a conditional ability.
 */
import { type Amount, type CardScript, type LayerMods, msg, type ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_VEHICLE,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  DINOSAUR_DRAGON,
  ELEPHANT,
  entersWith,
  eventReplacement,
  exhaust,
  fromGraveyard,
  fx,
  GOBLIN,
  MOUNT_OR_VEHICLE,
  manaAbility,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  ref,
  SERVO,
  staticAbility,
  THOPTER,
  TREASURE,
  target,
  targetCreatureOrVehicle,
  triggered,
  when,
  ZOMBIE,
} from "./common";

const MAX = cond.maxSpeed;
/** "Max speed — [this creature has…]" */
const atMax = (mods: LayerMods, label: string, affects: "self" | "attached" | ObjectFilter = "self") =>
  staticAbility(affects, mods, { condition: MAX, label: msg("Max speed — {label}", { label }) });
/** "Max speed — {3}, Exile this card from your graveyard: Draw a card." */
const surveyorDraw = activated({
  mana: "{3}",
  fromGraveyard: true,
  exileSelf: true,
  activationCondition: MAX,
  effects: [fx.draw(1)],
  label: "Max speed — exile it, draw",
});
const counters = (n: Amount) => fx.addCounters(ref.self, n);

export const SPEED: Record<string, CardScript> = {
  // --- White -----------------------------------------------------------------
  "Leonin Surveyor": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "First strike during your turn" },
      ),
      surveyorDraw,
    ],
  },
  "Lightwheel Enhancements": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "creature or Vehicle" },
    castOptions: [fromGraveyard({ condition: MAX })],
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1, addKeywords: ["vigilance"] }, { label: "+1/+1 and has vigilance" }),
    ],
  },
  "Nesting Bot": {
    abilities: [triggered(when.diesSelf, [fx.createTokens(SERVO)], { label: "1/1 Servo" }), atMax({ power: 1 }, "+1/+0")],
  },
  "Perilous Snare": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exile a nonland permanent",
      }),
      activated({
        tap: true,
        sorcerySpeed: true,
        activationCondition: MAX,
        targets: [targetCreatureOrVehicle("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Max speed — +1/+1 counter",
      }),
    ],
  },
  "Pride of the Road": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.pump(ref.target(), 0, 0, ["doubleStrike"])], {
        condition: MAX,
        targets: [targetCreatureOrVehicle("t", { controller: "you" })],
        label: "Max speed — double strike",
      }),
    ],
  },
  "Swiftwing Assailant": { abilities: [atMax({ toughness: 1, addKeywords: ["vigilance"] }, "+0/+1 and vigilance")] },

  // --- Blue ------------------------------------------------------------------
  "Aether Syphon": {
    abilities: [
      activated({ mana: "{2}", tap: true, effects: [fx.draw(1)], label: "Draw" }),
      triggered(when.draw(), [fx.mill(2, ref.eachOpponent)], {
        condition: MAX,
        label: "Max speed — each opponent mills two cards",
      }),
    ],
  },
  "Glitch Ghost Surveyor": { abilities: [surveyorDraw] },
  "Keen Buccaneer": {
    abilities: [exhaust({ mana: "{1}{U}", effects: [...fx.loot(1), counters(1)], label: "draw, discard, +1/+1 counter" })],
  },
  "Mindspring Merfolk": {
    abilities: [
      exhaust({
        mana: "{X}{U}{U}",
        tap: true,
        effects: [fx.draw(amount.x), fx.addCountersAll({ types: ["Creature"], subtype: "Merfolk", controller: "you" }, 1)],
        label: "draw X cards, counters on your Merfolk",
      }),
    ],
  },
  "Rangers' Refueler": {
    abilities: [
      triggered(when.exhaustActivated, [fx.draw(1)], { label: "Draw" }),
      // "This Vehicle becomes an artifact creature": with no duration, the effect lasts indefinitely (611.2a).
      exhaust({
        mana: "{4}",
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "permanent"), counters(1)],
        label: "artifact creature, +1/+1 counter",
      }),
    ],
  },
  "Riverchurn Monument": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.upTo(4, target.player("t"))],
        effects: [fx.mill(2, ref.target())],
        label: "Target players each mill two cards",
      }),
      exhaust({
        mana: "{2}{U}{U}",
        tap: true,
        targets: [target.upTo(4, target.player("t"))],
        effects: [fx.millGraveyardSize(ref.target())],
        label: "each mills as many cards as their graveyard",
      }),
    ],
  },
  "Sabotage Strategist": {
    abilities: [
      triggered(when.attacksYou({ types: ["Creature"] }), [fx.pump(ref.eventObject, -1, 0)], {
        label: "The attacker gets -1/-0",
      }),
      exhaust({ mana: "{5}{U}{U}", effects: [counters(3)], label: "three +1/+1 counters" }),
    ],
  },
  "Skystreak Engineer": { abilities: [exhaust({ mana: "{4}{U}", effects: [counters(2)], label: "two +1/+1 counters" })] },
  "Slick Imitator": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        activationCondition: MAX,
        targets: [target.spell("t", { controller: "you" }, "spell you control")],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Max speed — copy a spell",
      }),
    ],
  },
  "Spikeshell Harrier": {
    abilities: [
      triggered(when.entersSelf, [fx.reduceSpeed(ref.controllerOf(ref.target())), fx.bounce(ref.target())], {
        targets: [targetCreatureOrVehicle("t", { controller: "opponent" })],
        label: "Return a creature or Vehicle, its controller's speed decreases",
      }),
    ],
  },
  "Vnwxt, Verbose Host": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "No maximum hand size" }),
      eventReplacement({
        event: "draw",
        to: "you",
        modify: { times: 2 },
        condition: MAX,
        label: "Max speed — draw two cards instead of one",
      }),
    ],
  },

  // --- Black -----------------------------------------------------------------
  "Gas Guzzler": {
    abilities: [
      entersWith({ tapped: true }),
      activated({
        mana: "{B}",
        sacrificeOther: { filter: { ...CREATURE_OR_VEHICLE, other: true } },
        activationCondition: MAX,
        effects: [fx.draw(1)],
        label: "Max speed — draw",
      }),
    ],
  },
  "Gastal Raider": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.target(), { filter: { types: ["Instant", "Sorcery"] }, chooser: "controller" })],
        { targets: [target.player("t", "opponent")], label: "They discard an instant or sorcery" },
      ),
      atMax({ power: 1, toughness: 1, addKeywords: ["menace"] }, "+1/+1 and menace"),
    ],
  },
  "Hour of Victory": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ZOMBIE)], { label: "2/2 Zombie" }),
      activated({
        mana: "{1}{B}",
        sacrifice: true,
        sorcerySpeed: true,
        activationCondition: MAX,
        effects: [fx.search({})],
        label: "Max speed — search for a card",
      }),
    ],
  },
  "Momentum Breaker": {
    abilities: [
      // "Each opponent who can't": the one who sacrificed nothing discards a card.
      triggered(
        when.entersSelf,
        fx.forEachPlayer(ref.eachOpponent, (p, n) => [
          fx.sacrifice(p, CREATURE_OR_VEHICLE, 1, { store: `breaker${n}` }),
          fx.when(cond.all(cond.amountAtLeast(amount.refCount(p), 1), cond.not(cond.v(`breaker${n}`))), fx.discard(1, p)),
        ]),
        {
          label: "Each opponent sacrifices a creature or Vehicle (otherwise discards)",
        },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.gainLife(amount.speed)], label: "Life equal to your speed" }),
    ],
  },
  "Mutant Surveyor": {
    abilities: [activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 1)], label: "+1/+1" }), surveyorDraw],
  },
  "Risen Necroregent": {
    abilities: [triggered(when.yourEndStep, [fx.createTokens(ZOMBIE)], { condition: MAX, label: "Max speed — 2/2 Zombie" })],
  },
  "The Speed Demon": {
    abilities: [
      triggered(when.yourEndStep, [fx.draw(amount.speed), fx.loseLife(amount.speed)], {
        label: "Draw X cards, lose X life (your speed)",
      }),
    ],
  },
  "Streaking Oilgorger": { abilities: [atMax({ addKeywords: ["lifelink"] }, "lifelink")] },

  // --- Red -------------------------------------------------------------------
  "Adrenaline Jockey": {
    abilities: [
      triggered(when.castSpellOffTurn("any"), [fx.damage(4, ref.eventPlayer)], { label: "4 damage to the caster" }),
      triggered(when.exhaustActivated, [counters(1)], { label: "+1/+1 counter" }),
    ],
  },
  Boommobile: {
    abilities: [
      // "Spend this mana only to activate abilities": marked pool, any activated ability.
      triggered(when.entersSelf, [fx.addManaChoice(4, undefined, { abilityOfSource: {} })], {
        label: "Four mana of one color (only for abilities)",
      }),
      exhaust({
        mana: "{X}{2}{R}",
        targets: [target.any("t")],
        effects: [fx.damage(amount.x, ref.target()), counters(1)],
        label: "X damage, +1/+1 counter",
      }),
    ],
  },
  "Burnout Bashtronaut": {
    abilities: [
      activated({ mana: "{2}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
      atMax({ addKeywords: ["doubleStrike"] }, "double strike"),
    ],
  },
  "Draconautics Engineer": {
    abilities: [
      exhaust({
        mana: "{R}",
        effects: [fx.pumpAll(OTHER_CREATURE_YOU_CONTROL, 0, 0, ["haste"]), counters(1)],
        label: "haste, +1/+1 counter",
      }),
      exhaust({ mana: "{3}{R}", effects: [fx.createTokens(DINOSAUR_DRAGON)], label: "4/4 Dinosaur Dragon" }),
    ],
  },
  "Endrider Catalyzer": { abilities: [manaAbility("R", 2, { condition: MAX })] },
  "Endrider Spikespitter": {
    abilities: [
      triggered(when.yourUpkeep, [fx.exileTop(ref.you, 1, "c"), fx.grantPlay(ref.stored("c"))], {
        condition: MAX,
        label: "Max speed — exile the top card, playable this turn",
      }),
    ],
  },
  "Goblin Surveyor": { abilities: [surveyorDraw] },
  "Greasewrench Goblin": {
    abilities: [
      exhaust({
        mana: "{2}{R}",
        effects: [fx.discard(2, ref.you, { optional: true, store: "d" }), fx.draw(amount.v("d")), counters(1)],
        label: "discard up to two cards, draw that many",
      }),
    ],
  },
  "Hazoret, Godseeker": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        { condition: cond.not(MAX), label: "Without max speed: can't attack or block" },
      ),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.creature("t", { maxPower: 2 })],
        effects: [fx.pump(ref.target(), 0, 0, ["unblockable"])],
        label: "Unblockable",
      }),
    ],
  },
  "Howlsquad Heavy": {
    abilities: [
      staticAbility({ subtype: "Goblin", controller: "you", other: true }, { addKeywords: ["haste"] }, { label: "Haste" }),
      triggered(
        when.step("beginCombat"),
        [fx.createTokens(GOBLIN, 1, undefined, "g"), fx.modify(ref.stored("g"), { addKeywords: ["mustAttack"] })],
        { label: "1/1 Goblin that attacks" },
      ),
      manaAbility("R", 1, { per: { subtype: "Goblin", controller: "you" }, condition: MAX }),
    ],
  },
  "Kickoff Celebrations": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), fx.when(cond.v("d"), fx.draw(2))], {
        label: "Discard a card, draw two",
      }),
      activated({
        sacrifice: true,
        activationCondition: MAX,
        effects: [fx.pumpAll({ ...CREATURE_OR_VEHICLE, controller: "you" }, 0, 0, ["haste"])],
        label: "Max speed — haste",
      }),
    ],
  },
  "Outpace Oblivion": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.upTo(1, target.creatureOrPlaneswalker("t"))],
        label: "5 damage",
      }),
      activated({
        mana: "{2}",
        sacrifice: true,
        effects: [fx.damage(2, ref.playersWithoutMaxSpeed)],
        label: "2 damage to each player without max speed",
      }),
    ],
  },
  "Pacesetter Paragon": {
    abilities: [
      exhaust({
        mana: "{2}{R}",
        effects: [counters(1), fx.pump(ref.self, 0, 0, ["doubleStrike"])],
        label: "counter, double strike",
      }),
    ],
  },
  "Prowcatcher Specialist": { abilities: [exhaust({ mana: "{3}{R}", effects: [counters(2)], label: "two +1/+1 counters" })] },
  "Spire Mechcycle": {
    abilities: [
      exhaust({
        tapOthers: { filter: { ...MOUNT_OR_VEHICLE, controller: "you", other: true }, count: 1 },
        // With no duration: an artifact creature for good (611.2a).
        effects: [
          fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "permanent"),
          counters(amount.count({ ...MOUNT_OR_VEHICLE, controller: "you", other: true })),
        ],
        label: "artifact creature, counters",
      }),
    ],
  },
  "Thunderhead Gunner": {
    abilities: [
      activated({
        sorcerySpeed: true,
        oncePerTurn: true,
        discard: 1,
        effects: [fx.draw(1)],
        label: "Discard a card: draw",
      }),
    ],
  },

  // --- Green -----------------------------------------------------------------
  "Afterburner Expert": {
    abilities: [
      exhaust({ mana: "{2}{G}{G}", effects: [counters(2)], label: "two +1/+1 counters" }),
      triggered(when.exhaustActivated, [fx.toBattlefield(ref.self)], {
        fromGraveyard: true,
        label: "Returns from the graveyard",
      }),
    ],
  },
  "Elvish Refueler": {
    abilities: [
      playerStatic({ exhaustReuse: true, label: "Exhaust can be activated again (one per turn)" }),
      exhaust({ mana: "{1}{G}", effects: [counters(1)], label: "a +1/+1 counter" }),
    ],
  },
  "Greenbelt Guardian": {
    abilities: [
      activated({
        mana: "{G}",
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["trample"])],
        label: "Trample",
      }),
      exhaust({ mana: "{3}{G}", effects: [counters(3)], label: "three +1/+1 counters" }),
    ],
  },
  "Hazard of the Dunes": { abilities: [exhaust({ mana: "{6}{G}", effects: [counters(3)], label: "three +1/+1 counters" })] },
  "Loxodon Surveyor": { abilities: [surveyorDraw] },
  "Point the Way": {
    abilities: [
      activated({
        mana: "{3}{G}",
        sacrifice: true,
        effects: [fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, amount.speed)],
        label: "Up to X basic lands (your speed)",
      }),
    ],
  },
  "Stampeding Scurryfoot": {
    abilities: [exhaust({ mana: "{3}{G}", effects: [counters(1), fx.createTokens(ELEPHANT)], label: "counter, 3/3 Elephant" })],
  },

  // --- Multicolored ----------------------------------------------------------
  "Boom Scholar": {
    abilities: [
      playerStatic({
        abilityCost: { ability: "exhaust", notSelf: true, reduce: 2 },
        label: "Exhaust abilities of your other permanents cost {2} less",
      }),
      exhaust({
        mana: "{4}{R}{G}",
        // "Creatures and Vehicles": a Vehicle that is not a creature also gains trample (pumpAll only affects creatures).
        effects: [fx.pump(ref.permanentsOf(ref.you, CREATURE_OR_VEHICLE), 0, 0, ["trample"]), counters(2)],
        label: "trample, two counters",
      }),
    ],
  },
  "Embalmed Ascendant": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ZOMBIE)], { label: "2/2 Zombie" }),
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1), { condition: MAX, label: "Max speed — drain 1" }),
    ],
  },
  "Far Fortune, End Boss": {
    abilities: [
      triggered(when.attackWith(1), [fx.damage(1, ref.eachOpponent)], { label: "1 damage to each opponent" }),
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponentSide",
        modify: { add: 1 },
        condition: MAX,
        label: "Max speed — +1 damage to opponents",
      }),
    ],
  },
  "Gastal Thrillseeker": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        label: "1 damage, +1 life",
      }),
      atMax({ addKeywords: ["deathtouch", "haste"] }, "deathtouch and haste"),
    ],
  },
  "Loot, the Pathfinder": {
    abilities: [
      exhaust({ mana: "{G}", tap: true, effects: [fx.addManaChoice(3)], label: "three mana of one color" }),
      exhaust({ mana: "{U}", tap: true, effects: [fx.draw(3)], label: "draw three cards" }),
      exhaust({
        mana: "{R}",
        tap: true,
        targets: [target.any("t")],
        effects: [fx.damage(3, ref.target())],
        label: "3 damage",
      }),
    ],
  },
  "Mendicant Core, Guidelight": {
    cda: { power: amount.count({ types: ["Artifact"], controller: "you" }) },
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Artifact"] }),
        fx.mayPay("{1}", "Pay {1} to copy this spell?", fx.copySpell(ref.eventObject, 1)),
        { condition: MAX, label: "Max speed — copy the artifact spell" },
      ),
    ],
  },
  "Rangers' Aetherhive": {
    abilities: [triggered(when.exhaustActivated, [fx.createTokens(THOPTER)], { label: "1/1 Thopter" })],
  },
  "Rocketeer Boostbuggy": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Treasure" }),
      // "This Vehicle becomes an artifact creature": with no duration, the effect lasts indefinitely (611.2a).
      exhaust({
        mana: "{3}",
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "permanent"), counters(1)],
        label: "artifact creature, +1/+1 counter",
      }),
    ],
  },
  "Samut, the Driving Force": {
    abilities: [
      staticAbility(OTHER_CREATURE_YOU_CONTROL, { power: 1 }, { perAmount: amount.speed, label: "+X/+0 (your speed)" }),
      costReducer({ notTypes: ["Creature"] }, 0, "Noncreature spells cost {X} less (your speed)", {
        genericAmount: amount.speed,
      }),
    ],
  },
  "Zahur, Glory's Past": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        oncePerTurn: true,
        effects: [fx.surveil(1)],
        label: "Surveil 1",
      }),
      triggered(when.dies({ types: ["Creature"], controller: "you", token: false }), [fx.createTappedTokens(ZOMBIE)], {
        condition: MAX,
        label: "Max speed — tapped 2/2 Zombie",
      }),
    ],
  },

  // --- Colorless and lands ---------------------------------------------------
  "Camera Launcher": {
    abilities: [exhaust({ mana: "{3}", effects: [counters(1), fx.createTokens(THOPTER)], label: "counter, 1/1 Thopter" })],
  },
  "Marshals' Pathcruiser": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"], basic: true })], { label: "Basic land into your hand" }),
      exhaust({
        mana: "{W}{U}{B}{R}{G}",
        // With no duration: an artifact creature for good (611.2a).
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "permanent"), counters(2)],
        label: "artifact creature, two counters",
      }),
    ],
  },
  "Racers' Scoreboard": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], { label: "Draw two cards, discard one" }),
      costReducer({}, 1, "Max speed — spells cost {1} less", { condition: MAX }),
    ],
  },
  "Starting Column": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({
        tap: true,
        sacrifice: true,
        activationCondition: MAX,
        effects: [fx.draw(2), fx.discard(1)],
        label: "Max speed — draw two cards, discard one",
      }),
    ],
  },
  "Walking Sarcophagus": { abilities: [atMax({ power: 1, toughness: 2 }, "+1/+2")] },
  "Amonkhet Raceway": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        activationCondition: MAX,
        targets: [target.creature("t")],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Max speed — haste",
      }),
    ],
  },
  "Avishkar Raceway": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        discard: 1,
        activationCondition: MAX,
        effects: [fx.draw(1)],
        label: "Max speed — discard, draw",
      }),
    ],
  },
  "Muraganda Raceway": { abilities: [manaAbility("C"), manaAbility("C", 2, { condition: MAX })] },
};
