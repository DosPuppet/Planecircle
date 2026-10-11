/**
 * Marvel Super Heroes — multicolored cards (lot A). Flying, trample, vigilance, reach, menace, deathtouch, lifelink,
 * double strike, flash and haste are read from the text; "can't be blocked" and "attacks each combat if able" are
 * written here (restrictions). Extort is written here as a triggered ability.
 */
import { type Effect, type ModeDef, msg, type ObjectFilter, type TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  chapter,
  cmp,
  cond,
  entersWith,
  equipAbility,
  eventReplacement,
  fx,
  INSECT_G,
  mode,
  playerStatic,
  powerFor,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  VILLAIN,
  when,
} from "./common";

const ARTIFACT: ObjectFilter = { types: ["Artifact"] };
const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Artifact creature card (both types). */
const ARTIFACT_CREATURE: ObjectFilter = { types: ["Artifact"], anyOf: [{ types: ["Creature"] }] };
const NONLAND_CARD: ObjectFilter = { notTypes: ["Land"] };

/** Alien (Alien Invasion): 1/1 red creature with haste, which attacks each combat if able. */
const ALIEN: TokenSpec = {
  name: "Alien",
  colors: ["R"],
  types: ["Creature"],
  subtypes: ["Alien"],
  power: 1,
  toughness: 1,
  keywords: ["haste", "mustAttack"],
  text: "Haste\nThis token attacks each combat if able.",
};

/** Galactus (The Coming of Galactus): legendary 16/16 black Elder Alien creature, flying, trample. */
const GALACTUS: TokenSpec = {
  name: "Galactus",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Elder", "Alien"],
  power: 16,
  toughness: 16,
  legendary: true,
  keywords: ["flying", "trample"],
  abilities: [
    triggered(when.attacksSelf, [fx.destroy(ref.target())], {
      targets: [target.permanent("t", ["Land"], {}, "land")],
      label: "Destroy a land",
    }),
  ],
  text: "Flying, trample\nWhenever Galactus attacks, destroy target land.",
};

/** Sturdy Shield (U.S.Agent): colorless Equipment, "equipped creature gets +1/+2", equip {2}. */
const STURDY_SHIELD: TokenSpec = {
  name: "Sturdy Shield",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Equipment"],
  abilities: [
    staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
    equipAbility({ mana: "{2}", label: msg("Equip {cost}", { cost: "{2}" }) }),
  ],
  text: "Equipped creature gets +1/+2.\nEquip {2}",
};

/** "Choose odd or even" on resolution (Thanos): the choice is kept on the source (filter `chosen: "parity"`). */
const CHOOSE_PARITY: Effect = { op: "chooseOnEnter", kind: "parity" };

/** "You may sacrifice an artifact or discard a nonland card.": `s` or `d` is 1 if it is done. */
const SACRIFICE_ARTIFACT_OR_DISCARD = [
  fx.sacrifice(ref.you, ARTIFACT, 1, { optional: true, store: "s" }),
  ...fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { filter: NONLAND_CARD, optional: true, store: "d" })),
];

export const MULTI: Record<string, CardScript> = {
  "Abomination, Terrifying Titan": {
    abilities: [
      activated({
        mana: "{5}{R/G}{R/G}",
        powerUp: true,
        targets: [target.upTo(1, target.creature("t", { controller: "opponent" }))],
        effects: [fx.addCounters(ref.self, 1), fx.fight(ref.self, ref.target())],
        label: "Power-up: a +1/+1 counter, fights a creature an opponent controls",
      }),
    ],
  },
  "Alien Invasion": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.createTokens(ALIEN, 1, undefined, "a"),
          fx.addCounters(ref.stored("a"), amount.countersOn(ref.self, "invasion")),
          fx.counters(ref.self, "invasion"),
        ],
        { label: "A 1/1 Alien, a +1/+1 counter for each invasion counter, then an invasion counter" },
      ),
    ],
  },
  "Ant-Man, Colony Commander": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{1}",
          "Pay {1} to put a +1/+1 counter on a creature?",
          fx.reflexive([target.creature()], [fx.addCounters(ref.target(), 1)]),
        ),
        { label: "Pay {1}: a +1/+1 counter on a creature" },
      ),
      triggered(when.youPutCounters({ types: ["Creature"] }, "+1/+1"), [fx.createTokens(INSECT_G)], {
        oncePerTurn: true,
        label: "A 1/1 Insect (once each turn)",
      }),
    ],
  },
  "Armor Wars": {
    abilities: [
      chapter(
        [1],
        fx.when(
          cond.controls(ARTIFACT),
          fx.may(
            "Draw a card for each artifact you control (each opponent draws a card)?",
            fx.draw(amount.count({ ...ARTIFACT, controller: "you" })),
            fx.draw(1, ref.eachOpponent),
          ),
        ),
        { label: "Chapter I — A card for each artifact; each opponent draws" },
      ),
      chapter([2], [fx.thisTurn({ spellCost: { filter: ARTIFACT, reduce: 1 } })], {
        label: "Chapter II — Artifact spells you cast cost {1} less this turn",
      }),
      chapter([3], [fx.damage(amount.maxManaValue({ ...ARTIFACT, controller: "you" }), ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "Chapter III — X damage to an opponent (greatest mana value among your artifacts)",
      }),
    ],
  },
  "Avengers: Under Siege": {
    abilities: [
      chapter([1], [fx.createTokens(VILLAIN, 2)], { label: "Chapter I — Two 2/1 Villains with menace" }),
      chapter([2], [fx.damageAll(2, { types: ["Creature"], notSubtype: "Villain" }, ref.eachOpponent)], {
        label: "Chapter II — 2 damage to each non-Villain creature and each opponent",
      }),
      chapter([3], [fx.createTokens(TREASURE, amount.count({ subtype: "Villain", controller: "you" }))], {
        label: "Chapter III — A Treasure for each Villain you control",
      }),
    ],
  },
  "Beast, Erudite Aerialist": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        {
          condition: cond.sourceMatches({ countersPutByYouThisTurn: "+1/+1" }),
          label: "Has flying if you put +1/+1 counters on it this turn",
        },
      ),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Draw a card" }),
    ],
  },
  "Black Panther, Vanguard": {
    abilities: [
      triggeredModal(
        when.enters({ subtype: "Hero", token: false, controller: "you", other: true }),
        [
          mode("A 1/1 Soldier", [], [fx.createTokens(SOLDIER)]),
          mode("Creatures you control get +1/+1", [], [fx.pumpAll(YOUR_CREATURES, 1, 1)]),
        ],
        { label: "Another nontoken Hero enters" },
      ),
    ],
  },
  "Black Widow, Double Agent": {
    abilities: [
      triggered(when.attacksAlone(YOUR_CREATURES), [fx.pump(ref.eventObject, 0, 0, ["firstStrike", "menace"])], {
        label: "Attacks alone: first strike and menace",
      }),
    ],
  },
  "Bullseye, Death Dealer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...SACRIFICE_ARTIFACT_OR_DISCARD,
          ...fx.when(cond.any(cond.v("s"), cond.v("d")), fx.reflexive([target.any()], [fx.damage(2, ref.target())])),
        ],
        { label: "Sacrifice an artifact or discard a nonland card: 2 damage" },
      ),
      // Cost "sacrifice an artifact or discard a nonland card": one ability per branch of the cost.
      activated({
        mana: "{3}",
        tap: true,
        sacrificeOther: { filter: ARTIFACT },
        targets: [target.any()],
        effects: [fx.damage(2, ref.target())],
        label: "2 damage (sacrifice an artifact)",
      }),
      activated({
        mana: "{3}",
        tap: true,
        discard: 1,
        discardFilter: NONLAND_CARD,
        targets: [target.any()],
        effects: [fx.damage(2, ref.target())],
        label: "2 damage (discard a nonland card)",
      }),
    ],
  },
  "Cloak and Dagger, Entwined": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // "That player reveals their hand"; a nonland card from it, otherwise the chosen creature, until Cloak and Dagger
          // leaves.
          fx.reveal(ref.handOf(ref.target("p"))),
          fx.exileFromHandLinked(ref.target("p"), NONLAND_CARD, true),
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.refCount(ref.exiledWith), 1)),
            fx.may("Exile the chosen creature?", fx.exileUntilLeaves(ref.target("c"))),
          ),
        ],
        {
          targets: [
            target.player("p", "opponent"),
            // "That player controls": checked on targeting and again on resolution.
            target.of(
              ref.target("p"),
              target.upTo(1, target.creature("c", { controller: "opponent" })),
              "creature that opponent controls",
            ),
          ],
          label: "Exile a nonland card from their hand or the chosen creature",
        },
      ),
    ],
  },
  "The Coming of Galactus": {
    abilities: [
      chapter([1], [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.nonland())],
        label: "Chapter I — Destroy up to one nonland permanent",
      }),
      chapter([2, 3], [fx.loseLife(2, ref.eachOpponent)], { label: "Chapters II, III — Each opponent loses 2 life" }),
      chapter([4], [fx.createTokens(GALACTUS)], { label: "Chapter IV — 16/16 Galactus" }),
    ],
  },
  "Daredevil, Man Without Fear": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Radar Sense — You may look at the top card of your library" }),
      triggered(
        when.attackWith(),
        fx.may(
          "Exile the top card of your library?",
          fx.exileTop(ref.you, 1, "d"),
          fx.when(cond.refMatches(ref.stored("d"), { subtype: "Hero" }), fx.pump(ref.self, 2, 1)),
          fx.grantPlay(ref.stored("d")),
        ),
        { label: "Exile the top card: playable this turn (+2/+1 if it's a Hero)" },
      ),
    ],
  },
  "Ghost, Spectral Saboteur": { keywords: ["unblockable"] },
  "Iron Man, Master of Machines": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { ...ARTIFACT, controller: "you", other: true }, label: "+1/+0 for each other artifact you control" },
      ),
      triggered(when.attacksSelf, [fx.draw(1)], {
        condition: cond.amountAtLeast(
          amount.turnEvents({ event: "zone", to: "battlefield", types: ["Artifact"], who: "you" }),
          1,
        ),
        label: "Draw if an artifact entered under your control this turn",
      }),
    ],
  },
  "Kang, Temporal Tyrant": {
    abilities: [
      triggered(when.attacksSelf, [fx.connive(ref.self)], { label: "Connives" }),
      triggered(when.draw(2), fx.drain(1), { label: "Second card drawn: drain 1" }),
    ],
  },
  "Killmonger, Scourge of Wakanda": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.nonland("t", { controller: "opponent" })], [fx.destroy(ref.target())])),
        ],
        { label: "Sacrifice another creature: destroy a nonland permanent an opponent controls" },
      ),
      staticAbility(
        "self",
        { power: 2, toughness: 1 },
        {
          condition: cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 2),
          label: "+2/+1 with two or more creature cards in your graveyard",
        },
      ),
    ],
  },
  "King T'Challa": {
    abilities: [
      triggered(when.draw(2, "any"), [fx.draw(1)], { label: "A player draws their second card: draw" }),
      activated({ mana: "{4}{W}{U}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform him" }),
    ],
  },
  "Black Panther, Hope Enduring": {
    abilities: [
      eventReplacement({
        event: "damage",
        toFilter: { self: true },
        modify: { prevent: true },
        label: "Prevent all damage that would be dealt to it",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "Draw a card" }),
    ],
  },
  "The Kingpin of Crime": {
    // Extort (702.101): read from the text.
    abilities: [
      // A rule for the turn, not a change of characteristics: the creatures that arrive later are affected too (the
      // static of an emblem until end of turn).
      triggered(
        when.attackWith(),
        fx.mayPayLife(
          2,
          "Pay 2 life: creatures you control deal damage equal to their toughness if it's greater?",
          fx.emblem(
            msg("The Kingpin of Crime (this turn)"),
            msg(
              "Creatures you control with toughness greater than their power assign combat damage equal to their toughness rather than their power.",
            ),
            [
              staticAbility(
                YOUR_CREATURES,
                { addPowerRules: [powerFor.combatToughness] },
                {
                  label: "Combat damage equal to toughness if it's greater",
                },
              ),
            ],
            false,
            true,
          ),
        ),
        { label: "Pay 2 life: combat damage according to toughness" },
      ),
    ],
  },
  "Madame Hydra": {
    abilities: [
      triggered(when.castSpell("you", { subtype: "Villain" }), [fx.createTokens(VILLAIN)], {
        label: "Villain spell: a 2/1 Villain with menace",
      }),
    ],
  },
  "The Mighty Thor, Jane Foster": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.exileCard(ref.target(), { name: "f" }), fx.toBattlefield(ref.stored("f"), { tapped: true })],
        {
          targets: [
            target.upTo(1, target.permanent("t", ["Artifact", "Creature"], { token: false }, "nontoken artifact or creature")),
          ],
          label: "Exile, then return tapped an artifact or creature",
        },
      ),
      triggered(when.enters({ subtype: "Equipment", controller: "you" }), [fx.draw(1)], {
        label: "An Equipment enters: draw",
      }),
    ],
  },
  "Moon Girl and Devil Dinosaur": {
    abilities: [
      triggered(when.draw(2), [fx.modify(ref.self, { setPower: 6, setToughness: 6, addKeywords: ["trample"] })], {
        label: "Second card drawn: 6/6 and trample",
      }),
      triggered(when.enters({ ...ARTIFACT, controller: "you" }), [fx.draw(1)], {
        oncePerTurn: true,
        label: "An artifact enters: draw (once each turn)",
      }),
    ],
  },
  "Speedball, New Warrior": {
    abilities: [
      triggered(
        when.castSpell("any", undefined, { objects: { self: true } }),
        [fx.pump(ref.self, 2, 2), fx.changeTarget(ref.eventObject)],
        { label: "Targeted by a spell: +2/+2, you may change the target" },
      ),
    ],
  },
  "Spider-Man, To the Rescue": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(
          cond.sourceMatches({ tapped: false }),
          fx.may(
            "Tap Spider-Man to make another creature indestructible?",
            fx.tap(ref.self),
            fx.reflexive(
              [target.creature("t", { controller: "you", other: true, attacking: false })],
              [fx.modify(ref.target(), { addKeywords: ["indestructible"] })],
            ),
          ),
        ),
        { label: "No One Dies! — Tap him: another creature gains indestructible" },
      ),
    ],
  },
  "Spider-Woman, Secret Agent": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.modifyWhileYouControl(ref.target(), {
            addAbilities: [
              eventReplacement({
                event: "untap",
                toFilter: { self: true },
                modify: { prevent: true },
                label: "Can't become untapped",
              }),
            ],
          }),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Tap a creature an opponent controls; it can't become untapped",
        },
      ),
    ],
  },
  "The Super Hero Civil War": {
    abilities: [
      // "For as long as this Saga remains on the battlefield" (PLAN-L L4).
      chapter([1], fx.gainControlWhileSource(ref.target(), false, true), {
        targets: [{ ...target.upTo(2, target.creature()), maxTotalManaValue: 6 }],
        label: "Chapter I — Control of up to two creatures with total mana value 6 or less",
      }),
      chapter([2], [fx.pumpAll(YOUR_CREATURES, 1, 1, ["vigilance"])], {
        label: "Chapter II — Creatures you control get +1/+1 and gain vigilance",
      }),
      chapter([3], [fx.fight(ref.target("a"), ref.target("b"))], {
        targets: [
          target.creature("a", { controller: "you" }),
          { ...target.upTo(1, target.creature("b")), otherThan: ["a"], label: "other creature" },
        ],
        label: "Chapter III — A creature you control fights another creature",
      }),
    ],
  },
  "Thanos, the Mad Titan": {
    abilities: [
      activated({
        mana: "{C}{W}{U}{B}{R}{G}",
        powerUp: true,
        effects: [
          fx.addCounters(ref.self, 2),
          CHOOSE_PARITY,
          fx.destroyAll({ types: ["Creature"], other: true, chosen: "parity" }),
        ],
        label: "Power-up: two +1/+1 counters, destroy the creatures of the chosen parity",
      }),
    ],
  },
  "U.S.Agent, John Walker": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(STURDY_SHIELD, 1, undefined, undefined, ref.self)], {
        label: "Sturdy Shield, attached to him",
      }),
    ],
  },
  "Vision Quest": {
    // Library and/or graveyard, one choice (PLAN-L L4); the X counters are put on as it enters (614.1c).
    spell: spell(
      [],
      [
        fx.search(
          { ...ARTIFACT_CREATURE, compare: [cmp.manaValue("<=", amount.x)] },
          { to: "battlefield", counters: { kind: "+1/+1", n: amount.x } },
          1,
          undefined,
          "v",
          undefined,
          { alsoFrom: ["graveyard"] },
        ),
        ...fx.when(cond.xAtLeast(4), fx.modify(ref.stored("v"), { addKeywords: ["haste"] })),
      ],
    ),
  },
  "War Machine, Legacy of Iron": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), amount.powerOf(ref.self), 0)], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature gets +X/+0 (X: its power)",
      }),
    ],
  },
  "Winter Soldier, Icy Assassin": {
    abilities: [
      staticAbility(
        "self",
        { power: 2 },
        { per: { subtype: "Equipment", attached: "toSource" }, label: "+2/+0 for each attached Equipment" },
      ),
      activated({
        mana: "{3}{W}{B}",
        fromGraveyard: true,
        effects: [
          fx.moveTo(ref.self, { to: "battlefield", counters: { kind: "finality", n: 1 } }, { name: "w" }),
          ...fx.when(
            cond.controls({ subtype: "Equipment" }),
            fx.may(
              "Attach an Equipment you control to Winter Soldier?",
              fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Equipment" }), ref.you, "e"),
              fx.attach(ref.stored("w"), ref.stored("e")),
            ),
          ),
        ],
        label: "Returns from the graveyard with a finality counter",
      }),
    ],
  },
  // Vigilance: read from the text.
  "Captain America, Living Legend": {
    abilities: [
      triggered(
        { on: "taps", who: { types: ["Creature"], controller: "you" }, firstThisTurn: true },
        [fx.untap(ref.eventObject)],
        { condition: cond.yourTurn, label: "A creature you control becomes tapped for the first time on your turn: untap it" },
      ),
    ],
  },
  // Reach and trample: read from the text.
  "Hulk, Gamma Goliath": {
    abilities: [
      playerStatic({
        abilityCost: { ability: "powerUp", notSelf: true, reduce: 3, source: { types: ["Creature"] } },
        label: "Power-up abilities of other creatures you control cost {3} less",
      }),
      activated({
        mana: "{6}{R}{G}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 5)],
        label: "Power-up: five +1/+1 counters",
      }),
    ],
  },
  "Ares, God of War": {
    keywords: ["mustAttack"],
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "you", attacking: true }), [fx.toHand(ref.eventObject)], {
        label: "An attacking creature you control dies: it returns to its owner's hand",
      }),
    ],
  },
  "The Astonishing Ant-Man": {
    abilities: [
      triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "You draw: a +1/+1 counter" }),
      activated({
        mana: "{2}{G}",
        tap: true,
        removeCountersX: "+1/+1",
        effects: [fx.createTokens(INSECT_G, amount.x)],
        label: "Remove X +1/+1 counters: X 1/1 Insects",
      }),
    ],
  },
  // Vigilance: read from the text.
  "Absorbing Man": {
    abilities: [
      triggered(
        { on: "step", step: "main1", whose: "you" },
        [
          fx.becomeCopy(ref.self, ref.target(), "untilYourNextTurn", {
            except: {
              setName: "Absorbing Man",
              addTypes: ["Creature"],
              addSubtypes: ["Human", "Villain"],
              addSupertypes: ["Legendary"],
              setPower: 4,
              setToughness: 4,
              addKeywords: ["vigilance"],
            },
          }),
        ],
        {
          targets: [
            target.upTo(1, {
              id: "t",
              label: "artifact, non-Aura enchantment or land",
              filter: {
                objects: {
                  anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"], notSubtype: "Aura" }, { types: ["Land"] }],
                },
              },
            }),
          ],
          label: "Until your next turn, it becomes a copy of an artifact, non-Aura enchantment or land",
        },
      ),
    ],
  },
  "Taskmaster, Mercenary Mimic": {
    abilities: [
      triggered(
        { on: "step", step: "main1", whose: "you" },
        [
          fx.becomeCopy(ref.self, ref.target(), "untilYourNextTurn", {
            except: {
              setName: "Taskmaster, Mercenary Mimic",
              addTypes: ["Creature"],
              setSubtypes: ["Human", "Mercenary", "Villain"],
              addSupertypes: ["Legendary"],
            },
          }),
        ],
        {
          targets: [
            target.upTo(1, {
              id: "t",
              label: "creature, or creature card from a graveyard",
              filter: { objects: { types: ["Creature"], other: true }, cards: { filter: { types: ["Creature"] }, whose: "any" } },
            }),
          ],
          label: "Until your next turn, it becomes a copy of a creature or creature card",
        },
      ),
    ],
  },
  "Scientist Supreme of A.I.M.": {
    abilities: [
      activated({
        payLife: 2,
        oncePerTurn: true,
        activationCondition: cond.yourTurn,
        targets: [
          {
            id: "t",
            label: "ability you control from an artifact source",
            filter: { stackItems: { only: "abilities", controller: "you", source: { types: ["Artifact"] } } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Pay 2 life: copy an artifact ability you control",
      }),
    ],
  },
  // Flying: read from the text.
  "Storm, Windrider": {
    abilities: [
      staticAbility(
        { types: ["Creature"], keyword: "flying", controller: "opponent" },
        { addBlockRules: [{ cantAttackPlayer: "you", label: "Can't attack Storm's controller" }] },
        { label: "Creatures with flying can't attack you" },
      ),
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { addBlockRules: [block.notBy({ keyword: "flying" }, "Can't be blocked by creatures with flying")] },
        { label: "Creatures with flying can't block creatures you control" },
      ),
      triggered(
        when.castSpell("you", {}, { objects: { types: ["Creature"] } }),
        [fx.modify(ref.filtered(ref.targetsOfEventObject, { types: ["Creature"] }), { addKeywords: ["flying"] }, "endOfTurn")],
        { label: "A spell that targets creatures: they gain flying" },
      ),
    ],
  },
  "The Ruinous Wrecking Crew": {
    abilities: [
      entersWith({ counters: amount.x, label: "Enters with X +1/+1 counters" }),
      triggeredModal(
        when.entersSelf,
        // "Choose up to X": each combination of modes, under the condition X ≥ its number of modes.
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
          .map((bits): ModeDef => {
            const has = (k: number) => (bits & (1 << k)) !== 0;
            const n = [0, 1, 2, 3].filter(has).length;
            const labels = [
              "discard and draw",
              "an opponent loses 2 life",
              "destroy a token",
              "each player sacrifices a creature",
            ];
            return {
              ...mode(
                [0, 1, 2, 3]
                  .filter(has)
                  .map((k) => labels[k] as string)
                  .reduce((a, b) => msg("{a} + {b}", { a, b })),
                [
                  ...(has(1) ? [target.player("p", "opponent")] : []),
                  ...(has(2) ? [{ id: "k", label: "token", filter: { objects: { token: true } } }] : []),
                ],
                [
                  ...(has(0) ? [fx.discard(1), fx.draw(1)] : []),
                  ...(has(1) ? [fx.loseLife(2, ref.target("p"))] : []),
                  ...(has(2) ? [fx.destroy(ref.target("k"))] : []),
                  ...(has(3) ? [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] })] : []),
                ],
              ),
              condition: cond.amountAtLeast(amount.sourceX, n),
            };
          })
          .concat([mode("None", [], [])]),
        { label: "Up to X modes" },
      ),
    ],
  },
  // Deathtouch and ward (get five poison counters): read from the text.
  "The Serpent Society": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true, keyword: "deathtouch" }),
        [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], token: false })],
        { label: "Another creature you control with deathtouch dies: each opponent sacrifices a nontoken creature" },
      ),
    ],
  },
  // "Discard a card or pay {2}" (additional cost) and the ward of the same name: the ward is read from the text.
  "Titania, Rugged Rumbler": {
    additionalCost: { discard: 1, discardOr: { mana: { generic: 2, colored: {}, x: 0 } } },
  },
  "Worlds Within Worlds": {
    spell: spell(
      [],
      [
        fx.moveTo(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), { to: "exile" }, { name: "w" }),
        fx.pickFromZone(
          "hand",
          { types: ["Creature"] },
          { to: "battlefield" },
          {
            count: 99,
            min: 0,
            who: ref.eachPlayer,
            prompt: "Put creature cards from your hand onto the battlefield",
          },
        ),
        fx.toHand(ref.stored("w")),
        fx.exileOnResolve,
      ],
    ),
  },
};
