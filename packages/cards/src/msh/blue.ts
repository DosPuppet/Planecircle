/**
 * Marvel Super Heroes — blue cards (lot A). Power-up: `activated({ powerUp: true })`; Teamwork: read from the text
 * (kicker), read by `cond.kicked`.
 */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  bothIfKicked,
  type CardScript,
  cond,
  cost,
  costReducer,
  eventReplacement,
  fx,
  MERFOLK_BLUE,
  manaAbility,
  mode,
  playerStatic,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

/** Leviathan (Atlantis Attacks): 6/5 blue creature with hexproof. */
const LEVIATHAN: TokenSpec = {
  name: "Leviathan",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Leviathan"],
  power: 6,
  toughness: 5,
  keywords: ["hexproof"],
};

/** Redwing (Falcon, Winged Wonder): legendary 1/1 blue Bird Scout with flying that surveils 1 when it attacks. */
const REDWING: TokenSpec = {
  name: "Redwing",
  colors: ["U"],
  types: ["Creature"],
  subtypes: ["Bird", "Scout"],
  power: 1,
  toughness: 1,
  legendary: true,
  keywords: ["flying"],
  abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveil 1" })],
  text: "Flying\nWhenever Redwing attacks, surveil 1.",
};

/** "Exile [the target], then return it to the battlefield at the beginning of the next end step." */
const FLICKER_UNTIL_END_STEP = [
  fx.exileCard(ref.target(), { name: "k" }),
  fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
];

/** Aura or Equipment: "attach it to target creature you control" when it enters. */
const ATTACH_ON_ENTER_TARGET = [target.creature("t", { controller: "you" })];

export const BLUE: Record<string, CardScript> = {
  "Aerial Doombot": {
    abilities: [
      activated({
        mana: "{5}{U}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 3)],
        label: "Power-up: three +1/+1 counters",
      }),
    ],
  },
  "A.I.M. Scientists": {
    // Basic landcycling {2}: read from the text.
    abilities: [triggered(when.entersSelf, [fx.connive(ref.self)], { label: "Connives" })],
  },
  "Atlantean Cavalry": {
    abilities: [triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Second card drawn: a +1/+1 counter" })],
  },
  "Atlantis Attacks": {
    // Teamwork 4: read from the text. Paid, both modes are chosen (the "both" mode requires it).
    spell: bothIfKicked(
      mode("Target player creates a 6/5 Leviathan", [target.player("p")], [fx.createTokens(LEVIATHAN, 1, ref.target("p"))]),
      mode("Return one or two nonland permanents", [target.between(1, 2, target.nonland("b"))], [fx.bounce(ref.target("b"))]),
      "Both (teamwork)",
    ),
  },
  "Attuma, Atlantean Warlord": {
    abilities: [
      staticAbility(
        { subtype: "Merfolk", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Other Merfolk you control get +1/+1" },
      ),
      triggered(when.attackWith(1, { subtype: "Merfolk", attacking: "opponent" }), [fx.draw(1)], {
        label: "Merfolk attack a player: draw",
      }),
    ],
  },
  "Bold Biochemist": {
    abilities: [
      activated({
        mana: "{5}{U}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 1), fx.draw(2)],
        label: "Power-up: a +1/+1 counter, draw two cards",
      }),
    ],
  },

  // --- Bruce Banner // The Incredible Hulk -------------------------------------
  "Bruce Banner": {
    abilities: [
      activated({ mana: "{X}{X}", tap: true, sorcerySpeed: true, effects: [fx.draw(amount.x)], label: "Draw X cards" }),
      activated({ mana: "{2}{R}{R}{G}{G}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform him" }),
    ],
  },
  "The Incredible Hulk": {
    abilities: [
      triggered(
        when.isDealtDamage,
        [fx.addCounters(ref.self, 1), ...fx.when(cond.sourceMatches({ attacking: true }), fx.untap(ref.self), fx.extraCombat)],
        { label: "Enrage: a +1/+1 counter; if it's attacking, untap it and there's an additional combat" },
      ),
    ],
  },

  Depower: {
    costReduction: { generic: 2, condition: cond.targetMatches("t", { attacking: true }) },
    spell: spell([target.creature()], [fx.pump(ref.target(), -4, 0), fx.draw(1)]),
  },
  "Echo, Perceptive Prodigy": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "activated or triggered ability you control from a creature source",
            filter: { stackItems: { only: "abilities", controller: "you", source: { types: ["Creature"] } } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copy an ability you control",
      }),
    ],
  },
  "Falcon, Winged Wonder": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(REDWING)], { label: "Avian Telepathy: Redwing" })],
  },
  "Falcon's Wing Harness": {
    // Equip {2}{U}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: ATTACH_ON_ENTER_TARGET,
        label: "Attach it to target creature you control",
      }),
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["flying"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "+1/+1, flying and ward {1}" },
      ),
    ],
  },
  "Frozen in Ice": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap enchanted creature" }),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Loses all abilities" }),
      eventReplacement({
        event: "untap",
        toFilter: { attached: "host" },
        modify: { prevent: true },
        label: "Enchanted creature can't become untapped",
      }),
    ],
  },
  "Futurist Forge": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      activated({ mana: "{3}{U}", sacrifice: true, effects: [fx.draw(2)], label: "Draw two cards" }),
    ],
  },
  "Giant-Sized Flying Ant": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode("Tap a nonland permanent", [target.nonland()], [fx.tap(ref.target())]),
          mode("Untap a nonland permanent", [target.nonland()], [fx.untap(ref.target())]),
        ],
        { label: "Tap or untap a nonland permanent" },
      ),
    ],
  },
  "Hydraulic Helper": {
    // "This mana can't be spent to cast a nonartifact spell": artifact spells and abilities.
    abilities: [manaAbility("U", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: {} } })],
  },
  "I Am Iron Man": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [
        fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 4, addKeywords: ["flying"] }),
        fx.draw(1),
      ],
    ),
  },
  "Iron Lad, Diverging Destiny": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Look at the top card" }),
      activated({
        tap: true,
        effects: [fx.when(cond.refMatches(ref.libraryTop(ref.you), { types: ["Artifact"] }), fx.draw(1))],
        label: "Reveal the top card: draw if it's an artifact",
      }),
    ],
  },
  "Justice, Vance Astrovik": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { token: false }, "nontoken nonland permanent"))],
        label: "Return a nonland permanent",
      }),
      triggered(
        { on: "leaves", who: { notTypes: ["Land"], controller: "you", other: true }, to: "hand" },
        [fx.addCounters(ref.self, 1)],
        { label: "A permanent returned to hand: a +1/+1 counter" },
      ),
    ],
  },
  "Kang the Conqueror": {
    abilities: [
      activated({
        mana: "{5}{U}{U}{U}",
        powerUp: true,
        effects: [
          fx.addCounters(ref.self, 1),
          fx.extraTurn,
          // "During that turn, power-up abilities can't be activated" (the extra turn is the next one).
          fx.duringNextTurn({ castLimit: { who: "you", abilities: "powerUp" } }),
        ],
        label: "Power-up: a +1/+1 counter and an extra turn",
      }),
    ],
  },
  "Mister Fantastic, Reed Richards": {
    abilities: [
      triggered(when.enters({ token: true, controller: "you" }), fx.may("Draw a card?", fx.draw(1)), {
        batched: true,
        label: "Tokens enter: you may draw",
      }),
    ],
  },
  "Ms. Marvel, Kamala Khan": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "No maximum hand size" }),
      triggered(
        when.castSpell("you", undefined, { objects: { types: ["Creature"], controller: "you" } }),
        [
          fx.draw(1),
          fx.modify(ref.self, {
            addAbilities: [
              staticAbility("self", { setPower: 1 }, { perHand: true, label: "Base power equal to the cards in hand" }),
            ],
          }),
        ],
        { label: "Embiggen: draw; base power equal to the cards in hand" },
      ),
    ],
  },
  "Multiversal Incursion": {
    spell: spell([], [fx.copyToken(ref.permanentsOf(ref.you, { types: ["Creature"], token: false }), { nonlegendary: true })]),
  },
  "Pym Particles": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["vigilance", "unblockable"]), fx.draw(1)]),
  },
  "Rewrite History": {
    abilities: [
      triggered({ on: "taps", who: { types: ["Creature"], controller: "you" } }, [...fx.loot(1), fx.counters(ref.self, "plan")], {
        batched: true,
        label: "Draw, discard, a plan counter",
      }),
      triggered(
        when.countersPut("self", "plan"),
        [
          fx.sacrificeIt(ref.self),
          fx.reflexive(
            [
              target.upTo(
                2,
                target.cardInGraveyard(
                  "g",
                  { types: ["Instant", "Sorcery"] },
                  "you",
                  "instant or sorcery card from your graveyard",
                ),
              ),
            ],
            [fx.toHand(ref.target("g"))],
          ),
        ],
        {
          condition: cond.counterAtLeast("plan", 4),
          label: "Fourth counter: sacrifice it, return two instants or sorceries",
        },
      ),
    ],
  },
  "Secret Invasion": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { attached: "notHost" }))],
        label: "Exile another creature",
      }),
      staticAbility("attached", { copyLinkedExile: true }, { label: "Copy of the exiled creature" }),
      staticAbility("attached", { addAbilities: [wardAbility({ mana: cost("{2}") })] }, { label: "Ward {2}" }),
    ],
  },
  "S.H.I.E.L.D. Deployment Drone": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER)], { label: "A 1/1 Soldier" })],
  },
  "S.H.I.E.L.D. Flying Car": {
    // Flash, flying and Crew 1: read from the text.
    abilities: [
      triggered(when.entersSelf, FLICKER_UNTIL_END_STEP, {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Exile a creature you control until the end step",
      }),
    ],
  },
  "Shuri, Wakandan Inventor": {
    abilities: [
      costReducer({ types: ["Artifact"] }, 1, "Artifact spells you cast cost {1} less"),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [
          target.permanent("a", ["Artifact"], { controller: "you" }, "artifact you control"),
          target.permanent("b", ["Artifact"], { controller: "you" }, "second artifact you control"),
        ],
        // "Except it isn't legendary": the supertype is removed after the copy (layer 4).
        effects: [
          fx.becomeCopy(ref.target("a"), ref.target("b"), "endOfTurn"),
          fx.modify(ref.target("a"), { removeSupertypes: ["Legendary"] }),
        ],
        label: "An artifact becomes a copy of another",
      }),
    ],
  },
  "Stature, Size Shifter": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        { condition: cond.sourceMatches({ maxPower: 1 }), label: "Can't be blocked as long as its power is 1 or less" },
      ),
      activated({
        mana: "{X}{U}{U}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, amount.x)],
        label: "Power-up: X +1/+1 counters",
      }),
    ],
  },
  "Super Intelligence": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      // "At the beginning of the upkeep of enchanted creature's controller": the active player controls it (trigger
      // condition, without "if"); "that player" draws.
      triggered(when.step("upkeep", "any"), [fx.draw(1, ref.eventPlayer)], {
        triggerCondition: cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.controllerOf(ref.attached), cond.yourTurn)), 1),
        label: "Its controller draws a card",
      }),
    ],
  },
  "Super Suit": {
    // Flash and Equip {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.untap(ref.target())], {
        targets: ATTACH_ON_ENTER_TARGET,
        label: "Attach it to target creature you control and untap that creature",
      }),
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    ],
  },
  "Thirst for Knowledge": {
    spell: spell([], [fx.draw(3), fx.discard(2, ref.you, { unlessFilter: { types: ["Artifact"] } })]),
  },

  // --- Tony Stark // The Invincible Iron Man ------------------------------------
  "Tony Stark": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        // The rest goes to the bottom of the library in a random order.
        effects: [fx.lookAtTop(4, { filter: { types: ["Artifact"] }, rest: "bottom" })],
        label: "Look at four cards: an artifact into your hand",
      }),
      activated({ mana: "{4}{U}{R}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform him" }),
    ],
  },
  "The Invincible Iron Man": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.pickFromZone(
            "hand",
            { types: ["Artifact"] },
            { to: "battlefield" },
            { min: 0, store: "a", prompt: "An artifact card from your hand" },
          ),
          ...fx.when(cond.refMatches(ref.stored("a"), { subtype: "Equipment" }), fx.attach(ref.self, ref.stored("a"))),
        ],
        { label: "An artifact from your hand onto the battlefield" },
      ),
    ],
  },

  "Wiccan, Rising Magician": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), FLICKER_UNTIL_END_STEP, {
        targets: [target.nonland("t", { other: true, token: false }, "other nontoken nonland permanent")],
        label: "Exile another permanent until the end step",
      }),
    ],
  },
  // Improvise and flying: read from the text.
  "Ironheart, Clever Champion": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { notTypes: ["Creature"] }, keywords: ["improvise"] },
        label: "Noncreature spells you cast have improvise",
      }),
    ],
  },
  // Flying: read from the text.
  "Namor the Sub-Mariner": {
    cdaPower: amount.count({ subtype: "Merfolk", controller: "you" }),
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.createTokens(MERFOLK_BLUE, amount.manaSymbolsOf(ref.eventObject, "U"))],
        { label: "Noncreature spell: a 1/1 Merfolk for each {U} in its cost" },
      ),
    ],
  },
  "Kid Loki": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", countersPutByYouThisTurn: "+1/+1" },
        { addKeywords: ["hexproof"] },
        { label: "Creatures you control you put +1/+1 counters on this turn have hexproof" },
      ),
      triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Second card drawn: a +1/+1 counter" }),
    ],
  },
  "Loki, God of Mischief": {
    abilities: [
      triggered({ on: "becomesTarget", who: {}, players: true, only: "abilities", by: "you" }, [fx.draw(1)], {
        oncePerTurn: true,
        label: "A player or permanent becomes the target of an ability you control: draw (once each turn)",
      }),
    ],
  },
  "Leader, Super-Genius": {
    abilities: [
      eventReplacement({
        event: "connive",
        toFilter: { types: ["Creature"], controller: "you" },
        modify: { add: 1 },
        label: "A creature you control connives: draw a card first",
      }),
      triggered({ on: "step", step: "beginCombat", whose: "you" }, [fx.connive(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "At the beginning of combat on your turn, a creature you control connives",
      }),
    ],
  },
  "Trickster's Stratagem": {
    spell: spell(
      [target.creature("t", { controller: "opponent" }), target.upTo(1, target.creature("c", { controller: "you" }))],
      [fx.topOrBottom(ref.target("t"), undefined, 2), fx.connive(ref.target("c"))],
    ),
  },
};
