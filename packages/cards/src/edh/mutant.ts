/**
 * Commander: "Mutant Menace" precon from Fallout (The Wise Mothman, black, green, blue). Rad counters (at the
 * beginning of their precombat main phase, a player mills that many cards and loses 1 life for each nonland card),
 * milled cards, proliferate, Mutants.
 */
import type { CardScript, ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  BASIC_LAND,
  block,
  CLUE,
  chapter,
  cmp,
  cond,
  entersWith,
  escalate,
  eventReplacement,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  wardAbility,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
const ZOMBIE_OR_MUTANT_YOU: ObjectFilter = { ...CREATURE_YOU, anySubtype: ["Zombie", "Mutant"] };
const ZOMBIE_MUTANT: TokenSpec = {
  name: "Zombie Mutant",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Zombie", "Mutant"],
  power: 2,
  toughness: 2,
};
const ALIEN: TokenSpec = { name: "Alien", colors: ["U"], types: ["Creature"], subtypes: ["Alien"], power: 0, toughness: 0 };
/** "Whenever one or more nonland cards are milled" (`amount.eventAmount`: their number). */
const NONLAND_MILLED: TriggerSpec = { on: "milled", whose: "any", nonland: true };
/** Evolve, with an extra effect when it evolves (Watchful Radstag). */
const evolveThen = (...more: Parameters<typeof triggered>[1][]) =>
  triggered(when.enters({ ...CREATURE_YOU, other: true }), [fx.addCounters(ref.self, 1), ...more.flat()], {
    condition: cond.any(
      cond.amountGreater(amount.powerOf(ref.eventObject), amount.powerOf(ref.self)),
      cond.amountGreater(amount.toughnessOf(ref.eventObject), amount.toughnessOf(ref.self)),
    ),
    label: "Evolve",
  });

export const EDH_MUTANT: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  // Flying: read from the text.
  "The Wise Mothman": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(w, [fx.rad(ref.eachPlayer, 1)], { label: "Each player gets a rad counter" }),
      ),
      triggered(NONLAND_MILLED, [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature(), countAmount: amount.eventAmount, minCount: 0, label: "up to X creatures" }],
        label: "Nonland cards are milled: a +1/+1 counter on up to X creatures",
      }),
    ],
  },

  // --- Mutants and legends ------------------------------------------------------------------------------------------
  // Trample: read from the text.
  "Agent Frank Horrigan": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["indestructible"] },
        { condition: cond.sourceMatches({ attackedThisTurn: true }), label: "Indestructible if it attacked this turn" },
      ),
      ...[when.entersSelf, when.attacksSelf].map((w) => triggered(w, [fx.proliferate(2)], { label: "Proliferate twice" })),
    ],
  },
  // Menace, trample: read from the text.
  "Alpha Deathclaw": {
    abilities: [
      ...[when.entersSelf, when.becomesMonstrous].map((w) =>
        triggered(w, [fx.destroy(ref.target())], {
          targets: [target.permanent("t", [], {}, "permanent")],
          label: "Enters or becomes monstrous: destroy a permanent",
        }),
      ),
      activated({ mana: "{5}{B}{G}", effects: [fx.monstrosity(4)], label: "Monstrosity 4" }),
    ],
  },
  "Hancock, Ghoulish Mayor": {
    abilities: [
      // "where X is the number of counters on Hancock" (all kinds).
      {
        ...staticAbility(
          { ...ZOMBIE_OR_MUTANT_YOU, other: true },
          { power: 1, toughness: 1 },
          { label: "+X/+X to your other Zombies and Mutants" },
        ),
        perCounter: "any",
      },
      // Undying (702.93).
      triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { counters: { kind: "+1/+1", n: 1 } })], {
        condition: cond.not(cond.counterAtLeast("+1/+1", 1)),
        label: "Undying: returns with a +1/+1 counter",
      }),
    ],
  },
  // Reach, vigilance: read from the text.
  "Harold and Bob, First Numens": {
    abilities: [
      // Approximation: the Forest gains the ability forever; Harold and Bob stays in the graveyard (no Aura).
      triggered(
        when.diesSelf,
        [
          fx.modify(
            ref.target(),
            {
              addAbilities: [
                activated({
                  tap: true,
                  effects: [fx.addManaChoice(3, ANY_COLOR, undefined, true), fx.rad(ref.you, 2)],
                  label: "Three mana of any one color; you get two rad counters",
                }),
              ],
            },
            "permanent",
          ),
        ],
        {
          targets: [target.permanent("t", ["Land"], { controller: "you", subtype: "Forest" }, "Forest you control")],
          label: 'One of your Forests gains "{T}: three mana of any one color, two rad counters"',
        },
      ),
    ],
  },
  "Jason Bright, Glowing Prophet": {
    abilities: [
      // "with power different from its base power".
      triggered(when.dies({ ...ZOMBIE_OR_MUTANT_YOU, not: { compare: [cmp.power("=", "basePower")] } }), [fx.draw(1)], {
        label: "A modified Zombie or Mutant dies: draw a card",
      }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { types: ["Creature"] }, includeSelf: true },
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"])],
        label: "Fly with me: a +1/+1 counter and flying",
      }),
    ],
  },
  // Vigilance: read from the text.
  "Lily Bowen, Raging Grandma": {
    abilities: [
      entersWith({ counters: 2, label: "Two +1/+1 counters" }),
      triggered(
        when.yourUpkeep,
        [
          ...fx.when(cond.not(cond.amountAtLeast(amount.powerOf(ref.self), 17)), fx.doubleCounters(ref.self)),
          ...fx.when(
            cond.amountAtLeast(amount.powerOf(ref.self), 17),
            fx.removeCounters(ref.self, amount.plus(amount.countersOn(ref.self), -1), "+1/+1", "r"),
            fx.gainLife(amount.v("r")),
          ),
        ],
        { label: "Double its counters (power 16 or less), otherwise keep one and gain life" },
      ),
    ],
  },
  // Vigilance, trample: read from the text.
  "Marcus, Mutant Mayor": {
    abilities: [
      triggered(
        when.combatDamage(CREATURE_YOU, true),
        [
          ...fx.when(cond.eventObjectMatches({ withCounter: "+1/+1" }), fx.draw(1)),
          ...fx.when(cond.not(cond.eventObjectMatches({ withCounter: "+1/+1" })), fx.addCounters(ref.eventObject, 1)),
        ],
        { label: "One of your creatures deals damage to a player: draw a card if it has a +1/+1 counter, otherwise it gets one" },
      ),
    ],
  },
  "Piper Wright, Publick Reporter": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.createTokens(CLUE, amount.eventAmount)], { label: "Investigate that many times" }),
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "You sacrifice a Clue: a +1/+1 counter",
      }),
    ],
  },
  "Raul, Trouble Shooter": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { milledThisTurn: true }, what: "spells", oncePerTurn: true },
        condition: cond.yourTurn,
        label: "Once each turn: cast a spell from among the cards milled this turn",
      }),
      activated({ tap: true, effects: [fx.mill(1, ref.eachPlayer)], label: "Each player mills a card" }),
    ],
  },
  "Strong, the Brutish Thespian": {
    // Ward {2}: read from the text.
    abilities: [
      triggered(when.isDealtDamage, [fx.rad(ref.you, 3), fx.addCounters(ref.self, 3)], {
        label: "Enrage: three rad counters and three +1/+1 counters",
      }),
      playerStatic({ radiationGains: true, label: "You gain life instead of losing life from radiation" }),
    ],
  },
  "The Master, Transcendent": {
    abilities: [
      triggered(when.entersSelf, [fx.rad(ref.target("p"), 2)], {
        targets: [target.player("p")],
        label: "Target player gets two rad counters",
      }),
      activated({
        tap: true,
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], milledThisTurn: true }, "any", "creature card milled this turn"),
        ],
        effects: [
          fx.toBattlefield(ref.target(), { underYourControl: true }),
          fx.modify(ref.target(), { setColors: ["G"], setSubtypes: ["Mutant"], setPower: 3, setToughness: 3 }, "permanent"),
        ],
        label: "A creature milled this turn enters under your control: 3/3 green Mutant",
      }),
    ],
  },

  // --- Other creatures ---------------------------------------------------------------------------------------------
  // Flying: read from the text.
  "Bloatfly Swarm": {
    abilities: [
      entersWith({ counters: 5, label: "Five +1/+1 counters" }),
      eventReplacement({
        event: "damage",
        toFilter: { self: true, withCounter: "+1/+1" },
        modify: { prevent: true },
        onPrevent: {
          reflexive: [fx.removeCounters(ref.self, amount.eventAmount, "+1/+1", "r"), fx.rad(ref.eachPlayer, amount.v("r"))],
        },
        label: "Damage prevented: that many +1/+1 counters removed, and that many rad counters to each player",
      }),
    ],
  },
  "Cathedral Acolyte": {
    abilities: [
      staticAbility(
        { ...CREATURE_YOU, withCounter: "any" },
        { addAbilities: [wardAbility({ mana: { generic: 1, colored: {}, x: 0 } })] },
        { label: "Your creatures with a counter have ward {1}" },
      ),
      activated({
        tap: true,
        targets: [{ ...target.creature("t", { enteredThisTurn: true }), label: "creature that entered this turn" }],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "A +1/+1 counter on a creature that entered this turn",
      }),
    ],
  },
  // Menace: read from the text.
  "Feral Ghoul": {
    abilities: [
      triggered(when.dies({ ...CREATURE_YOU, other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Another creature you control dies: a +1/+1 counter",
      }),
      triggered(when.diesSelf, [fx.rad(ref.eachOpponent, amount.powerOf(ref.eventObject))], {
        label: "Each opponent gets rad counters equal to its power",
      }),
    ],
  },
  // Deathtouch: read from the text.
  "Glowing One": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rad(ref.eventPlayer, 4)], { label: "That player gets four rad counters" }),
      triggered(NONLAND_MILLED, [fx.gainLife(amount.eventAmount)], {
        label: "A nonland card milled: you gain 1 life",
      }),
    ],
  },
  // Flying, "can't block": read from the text.
  "Infesting Radroach": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rad(ref.eventPlayer, amount.eventAmount)], {
        label: "That player gets that many rad counters",
      }),
      triggered(
        { on: "milled", whose: "opponent", nonland: true },
        fx.may("Return Infesting Radroach to your hand?", fx.toHand(ref.self)),
        { fromGraveyard: true, label: "An opponent mills a nonland card: it returns to your hand" },
      ),
    ],
  },
  // Trample: read from the text.
  "Lumbering Megasloth": {
    // "{1} less for each counter among permanents and players": players only have poison and rad counters.
    costReduction: {
      generic: amount.plus(
        amount.countersAmong({ permanent: true }, "any"),
        amount.sumOverPlayers(ref.eachPlayer, amount.poison),
        amount.sumOverPlayers(ref.eachPlayer, amount.rad),
      ),
    },
    abilities: [entersWith({ tapped: true })],
  },
  // Vigilance: read from the text.
  "Mirelurk Queen": {
    abilities: [
      triggered(when.entersSelf, [fx.rad(ref.target("p"), 2)], {
        targets: [target.player("p")],
        label: "Target player gets two rad counters",
      }),
      triggered(NONLAND_MILLED, [fx.draw(1), fx.addCounters(ref.self, 1)], {
        oncePerTurn: true,
        label: "Nonland cards are milled: draw a card, then a +1/+1 counter",
      }),
    ],
  },
  // Ward {2}: read from the text.
  "Nightkin Ambusher": {
    abilities: [
      triggered(when.entersSelf, [fx.rad(ref.target("p"), 4)], {
        targets: [target.player("p")],
        label: "Target player gets four rad counters",
      }),
      // "As long as defending player has a rad counter": the player it attacks, or the controller of the attacked
      // planeswalker (506.2); outside combat, there is no defending player.
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        {
          condition: cond.amountAtLeast(amount.maxOverPlayers(ref.defendingPlayer, amount.rad), 1),
          label: "Can't be blocked as long as defending player has a rad counter",
        },
      ),
    ],
  },
  "Rampaging Yao Guai": {
    // Vigilance, trample: read from the text.
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          {
            ...target.permanent(
              "t",
              ["Artifact", "Enchantment"],
              {},
              "artifacts and enchantments with total mana value X or less",
            ),
            count: 10,
            minCount: 0,
            maxTotalManaValueAmount: amount.sourceX,
          },
        ],
        label: "Destroy artifacts and enchantments with total mana value X or less",
      }),
    ],
  },
  // Flying, menace: read from the text.
  "Screeching Scorchbeast": {
    abilities: [
      triggered(when.attacksSelf, [fx.rad(ref.eachPlayer, 2)], { label: "Each player gets two rad counters" }),
      triggered(
        NONLAND_MILLED,
        [
          ...fx.mayForStore(
            ref.you,
            "Create that many 2/2 Zombie Mutants?",
            "z",
            fx.createTokens(ZOMBIE_MUTANT, amount.eventAmount),
          ),
          ...fx.when(cond.v("z"), fx.doneOncePerTurn),
        ],
        { oncePerTurn: "ifDone", label: "Nonland cards are milled: that many Zombie Mutants (once per turn)" },
      ),
    ],
  },
  "Tato Farmer": {
    abilities: [
      triggered(when.landfall, fx.may("Get two rad counters?", fx.rad(ref.you, 2)), {
        label: "Landfall: you may get two rad counters",
      }),
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"], milledThisTurn: true }, "any", "land card milled this turn")],
        effects: [fx.toBattlefield(ref.target(), { tapped: true, underYourControl: true })],
        label: "A land milled this turn enters tapped under your control",
      }),
    ],
  },
  // Flying: read from the text.
  "Vexing Radgull": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.maxOverPlayers(ref.eventPlayer, amount.rad), 1)),
            fx.rad(ref.eventPlayer, 2),
          ),
          ...fx.when(cond.amountAtLeast(amount.maxOverPlayers(ref.eventPlayer, amount.rad), 1), fx.proliferate()),
        ],
        { label: "Two rad counters if that player has none, otherwise proliferate" },
      ),
    ],
  },
  "Watchful Radstag": {
    abilities: [evolveThen([fx.copyToken(ref.self)])],
  },
  "Winding Constrictor": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] },
        modify: { add: 1 },
        label: "One more counter on your artifacts and creatures",
      }),
    ],
  },
  // Menace: read from the text.
  "Young Deathclaws": {
    abilities: [
      // Approximation: scavenge of a creature card from your graveyard for {4} (not for its mana cost).
      activated({
        mana: "{4}",
        sorcerySpeed: true,
        exileFromGraveyard: { filter: { types: ["Creature"] } },
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), amount.powerOf(ref.costExiled))],
        label: "Scavenge: exile a creature card from your graveyard, as many counters as its power",
      }),
    ],
  },

  // --- Artifacts and enchantments -----------------------------------------------------------------------------------
  "Branching Evolution": {
    abilities: [
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "+1/+1",
        modify: { times: 2 },
        label: "Twice that many +1/+1 counters on your creatures",
      }),
    ],
  },
  "Contagion Clasp": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.creature()],
        label: "A -1/-1 counter",
      }),
      activated({ mana: "{4}", tap: true, effects: [fx.proliferate()], label: "Proliferate" }),
    ],
  },
  "Guardian Project": {
    abilities: [
      triggered(when.enters({ ...CREATURE_YOU, token: false }), [fx.draw(1)], {
        condition: cond.all(
          cond.not(
            cond.amountAtLeast(amount.refCount(ref.filtered(ref.sameNameOnBattlefield(ref.eventObject), CREATURE_YOU)), 2),
          ),
          cond.not(cond.amountAtLeast(amount.refCount(ref.sameNameInGraveyard(ref.eventObject)), 1)),
        ),
        label: "A nontoken creature with a new name enters: draw a card",
      }),
    ],
  },
  "Nuka-Nuke Launcher": {
    // Equip {3}: read from the text.
    abilities: [
      staticAbility("attached", { power: 3, addBlockRules: [block.intimidate] }, { label: "+3/+0 and intimidate" }),
      // "Until the end of defending player's next turn, that player gets two rad counters whenever they cast a spell"
      // (PLAN-L L5): a delayed ability that watches that player.
      triggered(
        { on: "attacks", who: { attached: "host" } },
        [
          fx.whenThisTurn(when.castSpell("any"), ref.defendingPlayer, [fx.rad(ref.eventPlayer, 2)], {
            until: "theirNextTurn",
            label: "Two rad counters",
          }),
        ],
        { label: "Until the end of the defending player's next turn, each of their spells gives them two rad counters" },
      ),
    ],
  },
  "Power Fist": {
    // Equip {2}: read from the text.
    abilities: [
      staticAbility(
        "attached",
        {
          addKeywords: ["trample"],
          addAbilities: [
            triggered(when.combatDamageToPlayer, [fx.addCounters(ref.self, amount.eventAmount)], {
              label: "That many +1/+1 counters",
            }),
          ],
        },
        { label: "Trample; deals damage to a player: that many +1/+1 counters" },
      ),
    ],
  },
  // Flying, Crew 2: read from the text.
  "Recon Craft Theta": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ALIEN, 1, undefined, "a"), fx.addCounters(ref.stored("a"), 1)], {
        label: "A 0/0 Alien with a +1/+1 counter",
      }),
      triggered(when.attacksSelf, [fx.proliferate()], { label: "Proliferate" }),
    ],
  },
  "Strength Bobblehead": {
    abilities: [
      manaAbility(ANY_COLOR),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), amount.count({ subtype: "Bobblehead", controller: "you" }))],
        label: "X +1/+1 counters (X: your Bobbleheads)",
      }),
    ],
  },
  "Struggle for Project Purity": {
    asEnters: [fx.chooseForSelf("mode", { options: ["Brotherhood", "Enclave"] })],
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(1, ref.eachOpponent), fx.draw(amount.refCount(ref.eachOpponent))], {
        condition: cond.chosenMode("Brotherhood"),
        label: "Brotherhood: each opponent draws a card; you draw that many",
      }),
      triggered(when.opponentAttacksYouWith(1), [fx.rad(ref.eventPlayer, amount.plus(amount.eventAmount, amount.eventAmount))], {
        condition: cond.chosenMode("Enclave"),
        label: "Enclave: the attacking player gets two rad counters for each attacker",
      }),
    ],
  },
  "Vault 12: The Necropolis": {
    abilities: [
      chapter([1], [fx.rad(ref.eachPlayer, 3)], { label: "Each player gets three rad counters" }),
      chapter([2], [fx.createTokens(ZOMBIE_MUTANT, amount.sumOverPlayers(ref.eachPlayer, amount.rad))], {
        label: "A 2/2 Zombie Mutant for each rad counter among players",
      }),
      chapter([3], [fx.addCountersAll(ZOMBIE_OR_MUTANT_YOU, 2)], { label: "Two +1/+1 counters on your Zombies and Mutants" }),
    ],
  },
  "Vault 87: Forced Evolution": {
    abilities: [
      chapter([1], [fx.gainControlWhileSource(ref.target())], {
        targets: [{ ...target.creature("t", { notSubtype: "Mutant" }), label: "non-Mutant creature" }],
        label: "Gain control of a non-Mutant creature for as long as you control this Saga",
      }),
      chapter([2], [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addSubtypes: ["Mutant"] }, "permanent")], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A +1/+1 counter; it becomes a Mutant",
      }),
      chapter([3], [fx.draw(amount.maxPower({ ...CREATURE_YOU, subtype: "Mutant" }))], {
        label: "Draw cards equal to the greatest power among your Mutants",
      }),
    ],
  },

  // --- Instants and sorceries -----------------------------------------------------------------------------------------
  Atomize: {
    spell: spell([target.nonland()], [fx.destroy(ref.target()), fx.proliferate()]),
  },
  "Biomass Mutation": {
    spell: spell([], [fx.setBasePTAll(CREATURE_YOU, amount.x)]),
  },
  "Casualties of War": {
    spell: escalate(
      "{0}",
      {
        label: "Destroy target artifact",
        targets: [target.permanent("a", ["Artifact"], {}, "artifact")],
        effects: [fx.destroy(ref.target("a"))],
      },
      { label: "Destroy a creature", targets: [target.creature("c")], effects: [fx.destroy(ref.target("c"))] },
      {
        label: "Destroy an enchantment",
        targets: [target.permanent("e", ["Enchantment"], {}, "enchantment")],
        effects: [fx.destroy(ref.target("e"))],
      },
      {
        label: "Destroy target land",
        targets: [target.permanent("l", ["Land"], {}, "land")],
        effects: [fx.destroy(ref.target("l"))],
      },
      {
        label: "Destroy target planeswalker",
        targets: [target.permanent("w", ["Planeswalker"], {}, "planeswalker")],
        effects: [fx.destroy(ref.target("w"))],
      },
    ),
  },
  "Contaminated Drink": {
    spell: spell([], [fx.draw(amount.x), fx.rad(ref.you, { kind: "div", of: amount.plus(amount.x, 1), by: 2 })]),
  },
  Find: {
    spell: spell(
      [
        {
          ...target.cardInGraveyard("f", { types: ["Creature"] }, "you", "creature cards in your graveyard"),
          count: 2,
          minCount: 0,
        },
      ],
      [fx.toHand(ref.target("f"))],
    ),
  },
  // "You may put two +1/+1 counters on a creature you control": chosen on resolution, without targeting.
  Finality: {
    spell: spell(
      [],
      [
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "c", {
          optional: true,
          prompt: "You may choose a creature you control: it gets two +1/+1 counters",
        }),
        fx.addCounters(ref.stored("c"), 2),
        fx.pumpAll({ types: ["Creature"] }, -4, -4),
      ],
    ),
  },
  "Mutational Advantage": {
    spell: spell(
      [],
      [
        // "Those permanents": those with counters on resolution, with damage prevented until end of turn (even if they
        // lose their counters; not those that get counters later). The prevention is an effect on these objects (615),
        // not a granted ability: an effect that removes abilities doesn't remove it.
        fx.modifyAll({ permanent: true, controller: "you", withCounter: "any" }, { addKeywords: ["hexproof", "indestructible"] }),
        fx.preventDamageThisTurn(ref.permanentsOf(ref.you, { withCounter: "any" })),
        fx.proliferate(),
      ],
    ),
  },
  "Nuclear Fallout": {
    spell: spell(
      [],
      [
        fx.pumpAll(
          { types: ["Creature"] },
          amount.neg(amount.plus(amount.x, amount.x)),
          amount.neg(amount.plus(amount.x, amount.x)),
        ),
        fx.rad(ref.eachPlayer, amount.x),
      ],
    ),
  },
  Putrefy: {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [{ op: "destroy", what: ref.target(), noRegenerate: true }],
    ),
  },
  // Storm: read from the text.
  Radstorm: { spell: spell([], [fx.proliferate()]) },
  "Rampant Growth": {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })]),
  },

  // --- Lands --------------------------------------------------------------------------------------------------------
  // Approximation: it always enters untapped, without rad counters.
  "Mariposa Military Base": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        tap: true,
        reduction: { generic: amount.rad },
        effects: [fx.draw(1)],
        label: "Draw a card ({1} less for each rad counter)",
      }),
    ],
  },
  "Mortuary Mire": {
    abilities: [
      entersWith({ tapped: true }),
      triggered(
        when.entersSelf,
        fx.may("Put a creature card from your graveyard on top of your library?", fx.moveTo(ref.target(), { to: "libraryTop" })),
        {
          targets: [
            target.upTo(1, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")),
          ],
          label: "A creature card from your graveyard on top of your library",
        },
      ),
      manaAbility("B"),
    ],
  },
};
