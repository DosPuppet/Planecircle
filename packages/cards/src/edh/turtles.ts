/**
 * Commander: "Turtle Power!" precon of Teenage Mutant Ninja Turtles (Heroes in a Half Shell, five colors).
 * +1/+1 counters (doubled, multiplied, moved), Mutagen tokens, attacks on several opponents.
 */
import type { CardScript, Effect, ManaType, ModeDef, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { cardRef, msg } from "@mtgx/engine";
import { slug } from "../scryfall";
import { MUTAGEN, NINJA, ROBOT_1 } from "../tmt/common";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  CLUE,
  cond,
  entersWith,
  eventReplacement,
  evolve,
  FOOD,
  fx,
  manaAbility,
  playerStatic,
  RAT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** "a creature you control with a counter on it" (any kind). */
const COUNTERED_YOU: ObjectFilter = { ...CREATURE_YOU, withCounter: "any" };
const OOZE: TokenSpec = { name: "Ooze", colors: ["G"], types: ["Creature"], subtypes: ["Ooze"], power: 2, toughness: 2 };
const ALL_COLORS: ManaType[] = ["W", "U", "B", "R", "G"];

/** Partner with (702.124j): when it enters, target player may search for the other card and put it into their hand. */
const partnerWith = (name: string) =>
  triggered(
    when.entersSelf,
    fx.mayFor(
      ref.target("p"),
      msg("Search for {card}?", { card: cardRef(slug(name)) }),
      fx.search({ name }, { to: "hand" }, 1, ref.target("p")),
    ),
    { targets: [target.player("p")], label: msg("Partner with {card}", { card: cardRef(slug(name)) }) },
  );

/** "Choose two —": each pair of modes (targets and effects in order). */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  return {
    modes: modes.flatMap((a, i) =>
      modes.slice(i + 1).map((b) => ({
        label: msg("{a} + {b}", { a: a.label ?? "", b: b.label ?? "" }),
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      })),
    ),
  };
}

/** "Thriving" lands: tapped; {T}: the printed color or the chosen color (other than that one). */
const thriving = (color: ManaType): CardScript => ({
  asEnters: [fx.chooseForSelf("color", { options: ALL_COLORS.filter((c) => c !== color) })],
  abilities: [entersWith({ tapped: true }), manaAbility(color), manaAbility([color], 1, { produceChosen: true })],
});

/** "[Source] deals damage equal to its power to [target]" (bite). */
const bite = (from: string, to: string): Effect => fx.damage(amount.powerOf(ref.target(from)), ref.target(to), ref.target(from));

export const EDH_TURTLES: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  // Vigilance, menace, trample, haste: read from the text.
  "Heroes in a Half Shell": {
    abilities: [
      triggered(
        when.combatDamageBatch({ types: ["Creature"], controller: "you", anySubtype: ["Mutant", "Ninja", "Turtle"] }),
        [fx.addCounters(ref.eventObjects, 1), fx.draw(1)],
        { label: "A +1/+1 counter on each of those creatures, and draw a card" },
      ),
    ],
  },

  // --- Creatures -----------------------------------------------------------------------------------------------------
  // Deathtouch: read from the text.
  "Acidic Slime": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.permanent("t", ["Artifact", "Enchantment", "Land"], {}, "artifact, enchantment, or land")],
        label: "Destroy an artifact, enchantment, or land",
      }),
    ],
  },
  // Partner—Character select: deck construction rule only.
  "April O'Neil, Live on the Scene": {
    abilities: [
      triggered(when.enters({ controller: "you", anySubtype: ["Mutant", "Ninja", "Turtle"] }), [fx.createTokens(CLUE)], {
        label: "A Mutant, Ninja, or Turtle enters: investigate",
      }),
    ],
  },
  "Baxter, Fly in the Ointment": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(w, [fx.pumpAll(COUNTERED_YOU, 0, 0, ["flying"])], {
          label: "Creatures you control with counters on them gain flying until end of turn",
        }),
      ),
      triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "You draw: a +1/+1 counter" }),
    ],
  },
  // Deathtouch: read from the text.
  "Bebop, Skull & Crossbones": {
    abilities: [
      partnerWith("Rocksteady, Mutant Marauder"),
      triggered(
        when.combatDamageToPlayer,
        fx.may(
          "Draw a card for each counter on Bebop, and lose that much life?",
          fx.draw(amount.countersOn(ref.self, "any")),
          fx.loseLife(amount.countersOn(ref.self, "any")),
        ),
        { label: "Draw X cards and lose X life (X: its counters)" },
      ),
    ],
  },
  "Big Mother Mouser": {
    abilities: [
      entersWith({ counters: 2, label: "Two +1/+1 counters" }),
      triggered(when.attacksSelf, [fx.doubleCounters(ref.self)], { label: "Doubles its +1/+1 counters" }),
      triggered(when.diesSelf, [fx.createTokens(ROBOT_1, amount.lkiCounters("+1/+1"))], {
        label: "That many 1/1 Robots as +1/+1 counters",
      }),
    ],
  },
  "Biogenic Ooze": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(OOZE)], { label: "A 2/2 Ooze" }),
      triggered(when.yourEndStep, [fx.addCountersAll({ subtype: "Ooze", controller: "you" }, 1)], {
        label: "A +1/+1 counter on each Ooze you control",
      }),
      activated({ mana: "{1}{G}{G}{G}", effects: [fx.createTokens(OOZE)], label: "A 2/2 Ooze" }),
    ],
  },
  // Menace: read from the text.
  "Casey Jones, Back Alley Brute": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature("t", { attacking: true }), label: "attacking creature" }],
        label: "A +1/+1 counter on an attacking creature",
      }),
      triggered(when.youPutCounters(CREATURE_YOU, "+1/+1"), [fx.damage(amount.eventAmount, ref.target("o"))], {
        targets: [target.player("o", "opponent")],
        label: "That much damage to an opponent",
      }),
    ],
  },
  "Corpsejack Menace": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { times: 2 },
        label: "Twice that many +1/+1 counters on creatures you control",
      }),
    ],
  },
  "Dimension X Pizzasaur": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.addCounters(ref.target(), 2),
          fx.reflexive(
            [
              {
                ...target.upTo(1, target.creature("d")),
                maxManaValueAmount: amount.countersAmong({ permanent: true, controller: "you" }, "any"),
                label: "creature with mana value at most the number of counters among your permanents",
              },
            ],
            [fx.destroy(ref.target("d"))],
          ),
        ],
        { targets: [target.creature()], label: "Two +1/+1 counters, then destroy a creature" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.loseLife(3, ref.eachOpponent)],
        label: "You gain 3 life and each opponent loses 3 life",
      }),
    ],
  },
  "Donatello, the Brains": {
    abilities: [
      eventReplacement({ event: "tokens", to: "you", plus: MUTAGEN, modify: {}, label: "A Mutagen in addition to your tokens" }),
    ],
  },
  // Defender, haste: read from the text.
  "Electric Seaweed": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.self, {
            addAbilities: [
              triggered(
                when.dies({ types: ["Creature"], other: true }),
                [fx.damageAll(1, { types: ["Creature"], notSubtype: "Wall" })],
                { label: "Another creature dies: 1 damage to each non-Wall creature" },
              ),
            ],
          }),
        ],
        { label: "Until end of turn, each other creature that dies deals 1 damage to each non-Wall creature" },
      ),
      activated({ tap: true, targets: [target.any()], effects: [fx.damage(1, ref.target())], label: "1 damage" }),
    ],
  },
  "Irma, Part-Time Mutant": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.becomeCopy(ref.self, ref.target(), "permanent", {
            except: { setName: "Irma, Part-Time Mutant" },
            keepAbilities: [0],
          }),
          fx.addCounters(ref.self, 1),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Becomes a copy of another creature you control (name and ability kept), then a +1/+1 counter",
        },
      ),
    ],
  },
  "Krang, the All-Powerful": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "draw" },
        label: "Abilities of your permanents triggered by a draw trigger an additional time",
      }),
      triggered(when.draw(2, "any"), [fx.addCounters(ref.self, 1)], {
        label: "A player draws their second card each turn: a +1/+1 counter",
      }),
    ],
  },
  // Trample, haste: read from the text.
  "Leatherhead, Iron Gator": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCountersAll(CREATURE_YOU, 2)], {
        label: "Two +1/+1 counters on each creature you control",
      }),
    ],
  },
  "Leonardo, the Balance": {
    abilities: [
      triggered(
        when.enters({ token: true, controller: "you" }),
        [
          ...fx.mayForStore(
            ref.you,
            "Put a +1/+1 counter on each creature you control?",
            "m",
            fx.addCountersAll(CREATURE_YOU, 1),
          ),
          ...fx.when(cond.v("m"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "A token enters: a +1/+1 counter on each creature you control (once each turn)" },
      ),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        effects: [fx.pumpAll(CREATURE_YOU, 0, 0, ["menace", "trample", "lifelink"])],
        label: "Creatures you control gain menace, trample, and lifelink",
      }),
    ],
  },
  // Trample: read from the text.
  "Michelangelo, the Heart": {
    abilities: [
      triggered(when.secondMain, [fx.addCounters(ref.target(), 1), fx.createTokens(FOOD)], {
        condition: cond.raid,
        targets: [target.creature()],
        label: "Raid: a +1/+1 counter and a Food",
      }),
    ],
  },
  "Raphael, the Muscle": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: COUNTERED_YOU,
        modify: { times: 2 },
        label: "Creatures you control with counters on them deal double damage",
      }),
      triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "A Mutagen" }),
    ],
  },
  // Menace: read from the text.
  "Rat King, Pale Piper": {
    abilities: [
      triggered(when.leaves({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(RAT)], {
        label: "A nontoken creature you control leaves the battlefield: a 1/1 Rat",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifice a token: draw a card",
      }),
    ],
  },
  // Flying: read from the text. Evolve (702.100): checked on trigger and on resolution.
  "Ray Fillet, Wave Warrior": {
    abilities: [
      evolve,
      triggered(when.combatDamage(COUNTERED_YOU, true), [fx.draw(1)], {
        label: "A creature you control with a counter on it deals damage to a player: draw a card",
      }),
    ],
  },
  // Squad: read from the text. Deathtouch: read from the text.
  "Roadkill Rodney": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(MUTAGEN)], { label: "A Mutagen" })],
  },
  // Trample: read from the text.
  "Rocksteady, Mutant Marauder": {
    abilities: [
      partnerWith("Bebop, Skull & Crossbones"),
      triggered(when.enters({ ...CREATURE_YOU, other: true, token: false }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature()],
        label: "Another nontoken creature enters: a +1/+1 counter",
      }),
    ],
  },
  "Shredder, Shadow Master": {
    abilities: [
      triggered(
        when.attacksAPlayer,
        [
          fx.copyToken(ref.self, {
            attackEach: ref.except(ref.eachOpponent, ref.defendingPlayer),
            nonlegendary: true,
            atEndOfCombat: "sacrifice",
          }),
        ],
        { label: "A nonlegendary copy attacks each of your other opponents (sacrificed at end of combat)" },
      ),
      triggered(when.combatDamageToPlayer, [fx.loseLife(amount.halfLife(ref.eventPlayer), ref.eventPlayer)], {
        label: "That player loses half their life, rounded up",
      }),
    ],
  },
  // Menace: read from the text. Partner—Character select: deck construction rule only.
  "Splinter, the Mentor": {
    abilities: [
      triggered(when.leaves({ types: ["Creature"], controller: "you", token: false }), [fx.createTokens(MUTAGEN)], {
        label: "A nontoken creature you control leaves the battlefield: a Mutagen",
      }),
    ],
  },
  "Steelbane Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      activated({
        mana: "{2}{G}",
        removeCounters: { kind: "+1/+1", n: 1 },
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Remove a counter: destroy an artifact or enchantment",
      }),
    ],
  },
  "Tempestra, Dame of Games": {
    abilities: [
      activated({
        mana: "{2}{R}",
        tap: true,
        sacrificeOther: { filter: { types: ["Artifact"] } },
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.copyToken(ref.target(), { nonlegendary: true, addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "Sacrifice an artifact: a nonlegendary copy with haste, sacrificed at the end step",
      }),
    ],
  },
  // First strike: read from the text.
  "Tokka & Rahzar, Unsupervised": {
    abilities: [
      triggered(
        when.leaves({ ...CREATURE_YOU, token: false, other: true }),
        [fx.addCounters(ref.self, 1), fx.createTokens(TREASURE)],
        { oncePerTurn: true, label: "Another nontoken creature you control leaves: a +1/+1 counter and a Treasure" },
      ),
    ],
  },
  // Trample: read from the text.
  Vigor: {
    abilities: [
      eventReplacement({
        event: "damage",
        to: "yourSide",
        toFilter: { types: ["Creature"], other: true },
        modify: { prevent: true },
        onPrevent: { countersOnDamaged: "+1/+1" },
        label: "Damage to your other creatures prevented: that many +1/+1 counters",
      }),
      // A trigger from the graveyard, not a replacement (rulings): it goes to the graveyard first.
      triggered(when.putIntoGraveyardFromAnywhereSelf, [fx.moveTo(ref.selfCard, { to: "libraryTop", shuffle: true })], {
        fromGraveyard: true,
        label: "Put into a graveyard from anywhere: shuffled into its owner's library",
      }),
    ],
  },
  // Trample: read from the text.
  "Voracious Hydra": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggeredModal(when.entersSelf, [
        { label: "Double its +1/+1 counters", targets: [], effects: [fx.doubleCounters(ref.self)] },
        {
          label: "It fights a creature you don't control",
          targets: [target.creature("f", { controller: "opponent" })],
          effects: [fx.fight(ref.self, ref.target("f"))],
        },
      ]),
    ],
  },

  // --- Artifacts ----------------------------------------------------------------------------------------------------
  "Arcade Cabinet": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(4, target.creature())],
        label: "A +1/+1 counter on each of up to four creatures",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrificeOther: { filter: { token: true } },
        targets: [target.creature()],
        effects: [fx.doubleAllCounters(ref.target())],
        label: "Sacrifice a token: double each kind of counter on a creature",
      }),
    ],
  },
  "Coin of Mastery": {
    abilities: [
      entersWith({
        affects: CREATURE_YOU,
        counters: amount.artifactManaSpent,
        label: "Creatures you control enter with a +1/+1 counter for each mana from artifacts spent to cast them",
      }),
      activated({ tap: true, effects: [fx.createTokens(TREASURE)], label: "A Treasure" }),
    ],
  },
  "Exploding Barrel": {
    abilities: [
      manaAbility(ANY_COLOR, 1, { addCounter: "pressure" }),
      activated({
        mana: "{8}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        reduction: { generic: amount.countersOn(ref.self, "pressure") },
        targets: [target.creature()],
        effects: [fx.damage(20, ref.target())],
        label: "20 damage to a creature ({1} less for each pressure counter)",
      }),
    ],
  },
  // Equip {2}: read from the text.
  "Foot Chopper": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(NINJA, 1, undefined, "n"), fx.attach(ref.stored("n"))], {
        label: "A 1/1 Ninja, then attach this Equipment to it",
      }),
      staticAbility("attached", { addKeywords: ["flying"] }, { label: "Flying" }),
      triggered(
        when.attachedDealsCombatDamageToPlayer,
        [
          fx.sacrifice(ref.you, { attached: "host" }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(amount.powerOf(ref.eventObject))),
        ],
        { label: "You may sacrifice it: draw cards equal to its power" },
      ),
    ],
  },
  // Menace, Crew 2: read from the text.
  "Mole Module": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { permanent: true },
            { to: "battlefield" },
            { pool: ref.stored("m"), min: 0, prompt: "Permanent card to put onto the battlefield" },
          ),
        ],
        { label: "Mill four cards; a permanent among them may enter the battlefield" },
      ),
    ],
  },

  // --- Enchantments ----------------------------------------------------------------------------------------------
  // Squad: read from the text.
  "Endless Foot Assault": {
    abilities: [
      triggered(
        when.attackWith(),
        fx.forEachPlayer(ref.eachOpponent, (p) => [fx.createTappedTokens(NINJA, 1, { attacking: p })]),
        { label: "You attack: for each opponent, a tapped 1/1 Ninja attacking that player" },
      ),
    ],
  },
  "High Score": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { add: 1 },
        label: "One more +1/+1 counter on creatures you control",
      }),
      triggered(when.yourEndStep, [fx.draw(1)], {
        condition: cond.controlsGreatestPower,
        label: "You control the creature with the greatest power: draw a card",
      }),
    ],
  },
  "Level Up": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.attached, 1)], { label: "A +1/+1 counter on the enchanted creature" }),
      staticAbility(
        "attached",
        {
          addAbilities: [
            triggered(
              when.attacksSelf,
              [fx.doubleCounters(ref.self), ...fx.when(cond.amountAtLeast(amount.powerOf(ref.self), 10), fx.draw(1))],
              { label: "Double its +1/+1 counters; power 10 or greater: draw a card" },
            ),
          ],
        },
        { label: '"When it attacks, double its +1/+1 counters, then draw if its power is 10 or greater"' },
      ),
    ],
  },
  "Ninja Pizza": {
    abilities: [
      staticAbility(
        { subtype: "Food", controller: "you" },
        { addAbilities: [manaAbility(ANY_COLOR, 1, { sacrifice: true })] },
        { label: 'Foods you control have "{T}, Sacrifice this token: one mana of any color"' },
      ),
      triggered(when.secondMain, [fx.createTokens(FOOD)], { label: "A Food" }),
    ],
  },
  "Together Forever": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "Support 2",
      }),
      activated({
        mana: "{1}",
        targets: [{ ...target.creature("t", { withCounter: "any" }), label: "creature with a counter on it" }],
        effects: [
          fx.whenThisTurn(when.dies({}), ref.target(), [fx.toHand(ref.eventObject)], {
            label: "It dies: return the card to its owner's hand",
          }),
        ],
        label: "If it dies this turn, it returns to hand",
      }),
    ],
  },

  // --- Instants and sorceries -----------------------------------------------------------------------------------------
  "Blasphemous Act": {
    costReduction: { generic: amount.count({ types: ["Creature"] }) },
    spell: spell([], [fx.damageAll(13, { types: ["Creature"] })]),
  },
  "Continue?": {
    spell: spell(
      [
        target.upTo(
          4,
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], fromBattlefieldThisTurn: true },
            "you",
            "creature card put into your graveyard from the battlefield this turn",
          ),
        ),
      ],
      [fx.toBattlefield(ref.target())],
    ),
  },
  Cultivate: {
    spell: spell(
      [],
      [
        // The lands found go through the hand; one of them then goes onto the battlefield tapped.
        fx.search(BASIC_LAND, { to: "hand" }, 2, undefined, "lands"),
        fx.pickFromZone(
          "hand",
          BASIC_LAND,
          { to: "battlefield", tapped: true },
          { pool: ref.stored("lands"), prompt: "The land to put onto the battlefield tapped" },
        ),
      ],
    ),
  },
  // Fuse: read from the text (the two halves have distinct target names).
  "Double Jump": {
    spell: spell(
      [target.creature("j", { controller: "you" })],
      [fx.counters(ref.target("j"), "flying"), fx.modify(ref.target("j"), {}, "endOfTurn", 5)],
    ),
  },
  "Flying Kick": {
    spell: spell(
      [target.creature("ka", { controller: "you" }), target.creature("kb", { controller: "opponent" })],
      [bite("ka", "kb")],
    ),
  },
  "Fast Forward": {
    costReduction: { generic: amount.opponentsAttackedThisTurn },
    spell: spell([], [fx.goad(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"], controller: "opponent" }))]),
  },
  "Game Over": {
    costReduction: { generic: 2, condition: cond.someoneAtHalfStartingLife },
    spell: spell([], [fx.destroyAll({ types: ["Creature"] })]),
  },
  Harmonize: { spell: spell([], [fx.draw(3)]) },
  "Here Comes a New Hero!": {
    spell: spell(
      [
        target.player("p"),
        { ...target.upTo(1, target.creature("c")), maxManaValueAmount: amount.x, label: "creature with mana value X or less" },
      ],
      [fx.draw(amount.x, ref.target("p")), fx.copyToken(ref.target("c"))],
    ),
  },
  Shellshock: {
    spell: spell(
      [
        {
          ...target.upTo(3, target.creature("t", { controller: "opponent" })),
          differentPlayers: true,
          countAmount: amount.refCount(ref.eachOpponent),
          label: "up to one creature per opponent",
        },
      ],
      [fx.damage(amount.x, ref.target()), ...fx.when(cond.xAtLeast(1), fx.createTokens(MUTAGEN, amount.refCount(ref.target())))],
    ),
  },
  "Special Move": {
    spell: chooseTwo(
      {
        label: "Jump Kick: destroy an artifact",
        targets: [target.permanent("ja", ["Artifact"], {}, "artifact")],
        effects: [fx.destroy(ref.target("ja"))],
      },
      {
        label: "Charge: two +1/+1 counters on your attacking or blocking creature",
        targets: [
          {
            ...target.creature("da", { controller: "you", anyOf: [{ attacking: true }, { blocking: true }] }),
            label: "attacking or blocking creature of yours",
          },
        ],
        effects: [fx.addCounters(ref.target("da"), 2)],
      },
      {
        label: "Foot Toss: your creature deals damage to another target, then sacrifice it",
        targets: [target.creature("fa", { controller: "you" }), { ...target.any("fb"), otherThan: ["fa"] }],
        effects: [bite("fa", "fb"), fx.sacrificeIt(ref.target("fa"))],
      },
    ),
  },
  // Replicate: read from the text.
  "Super Combo": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [bite("a", "b")],
    ),
  },
  "Swift Demise": {
    spell: spell(
      [target.creature()],
      [fx.damage(1, ref.target()), fx.destroyAll({ types: ["Creature"], controller: "opponent", damaged: true })],
    ),
  },
  "Vanquish the Horde": {
    costReduction: { generic: amount.count({ types: ["Creature"] }) },
    spell: spell([], [fx.destroyAll({ types: ["Creature"] })]),
  },
  "Wave Goodbye": {
    spell: spell(
      [],
      [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], not: { withCounter: "+1/+1" } }, { to: "hand" })],
    ),
  },

  // --- Lands --------------------------------------------------------------------------------------------------------
  "Big Apple, 3 a.m.": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(["W"], 1, { produceChosen: true }),
      activated({
        mana: "{5}",
        tap: true,
        effects: [fx.createTokens(RAT, amount.refCount(ref.eachOpponent))],
        label: "A 1/1 Rat for each opponent",
      }),
    ],
  },
  "Grand Coliseum": {
    abilities: [entersWith({ tapped: true }), manaAbility("C"), manaAbility(ANY_COLOR, 1, { drawback: { damageYou: 1 } })],
  },
  "Hidden Hideout": {
    abilities: [
      entersWith({ tapped: true }),
      manaAbility(ANY_COLOR, 1, { commanderIdentity: true }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          { ...target.creature("t", { controller: "you", withCounter: "any" }), label: "creature of yours with a counter on it" },
        ],
        effects: [fx.pump(ref.target(), 0, 0, ["lifelink"])],
        label: "Lifelink until end of turn",
      }),
    ],
  },
  // Cycling {2} and land types: read from the text.
  "Rain-Slicked Copse": { abilities: [entersWith({ tapped: true })] },
  "Thriving Grove": thriving("G"),
  "Thriving Isle": thriving("U"),
  "Thriving Moor": thriving("B"),
};
