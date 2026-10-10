/**
 * Commander: "Multiverse Reforged" precon of Reality Fracture (Jace, Multiverse Architect, four colors without
 * green). Planeswalkers and big creatures put back onto the battlefield, tokens, monarch, control.
 */
import type { CardScript, Effect, ObjectFilter, TokenSpec } from "@mtgx/engine";
import { msg } from "@mtgx/engine";
import { creature } from "../fdn/common";
import {
  activated,
  amount,
  cond,
  entersWith,
  eventReplacement,
  fx,
  loyalty,
  manaAbility,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  SOLDIER,
  SPIRIT,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
  whenCycled,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };

const CITIZEN: TokenSpec = creature("Citizen", ["G", "W"], ["Citizen"], 1, 1);
const WARRIOR: TokenSpec = creature("Warrior", ["W"], ["Warrior"], 1, 1);
const ANGEL_4_4: TokenSpec = creature("Angel", ["W"], ["Angel"], 4, 4, { keywords: ["flying"] });
const ROGUE: TokenSpec = creature("Rogue", ["B"], ["Rogue"], 2, 2);
const KOBOLDS: TokenSpec = creature("Kobolds of Kher Keep", ["R"], ["Kobold"], 0, 1);
const SHARK: TokenSpec = creature("Shark", ["U"], ["Shark"], 0, 0, { keywords: ["flying"] });
/** 1/1 colorless Phyrexian Mite artifact, toxic 1, "can't block". */
const MITE: TokenSpec = {
  name: "Phyrexian Mite",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Phyrexian", "Mite"],
  power: 1,
  toughness: 1,
  keywords: ["cantBlock"],
  toxic: 1,
  text: "Toxic 1. This token can't block.",
};
const MYR: TokenSpec = { name: "Myr", colors: [], types: ["Artifact", "Creature"], subtypes: ["Myr"], power: 1, toughness: 1 };
/** Gingerbrute: 1/1 Food Golem with haste. */
const GINGERBRUTE: TokenSpec = {
  name: "Gingerbrute",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Food", "Golem"],
  power: 1,
  toughness: 1,
  keywords: ["haste"],
  abilities: [
    activated({
      mana: "{1}",
      effects: [
        fx.modify(ref.self, {
          addBlockRules: [{ cantBeBlockedBy: { not: { keyword: "haste" } }, label: "Can't be blocked except by haste" }],
        }),
      ],
      label: "Can't be blocked this turn except by creatures with haste",
    }),
    activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "You gain 3 life" }),
  ],
  text: "Haste. {1}: This token can't be blocked this turn except by creatures with haste. {2}, {T}, Sacrifice this token: You gain 3 life.",
};
/** Incubator (701.53): "{2}: Transform this token"; it becomes a 0/0 Phyrexian artifact creature. */
const INCUBATOR: TokenSpec = {
  name: "Incubator",
  colors: [],
  types: ["Artifact"],
  subtypes: ["Incubator"],
  abilities: [
    activated({
      mana: "{2}",
      effects: [fx.modify(ref.self, { addTypes: ["Creature"], setSubtypes: ["Phyrexian"] }, "permanent", 0)],
      label: "Transform it: 0/0 Phyrexian artifact creature",
    }),
  ],
  text: "{2}: Transform this token.",
};
/** Incubate X (701.53): an Incubator with X +1/+1 counters. */
const incubate = (x: Parameters<typeof amount.plus>[0]): Effect[] => [
  fx.createTokens(INCUBATOR, 1, undefined, "incubator"),
  fx.addCounters(ref.stored("incubator"), x),
];

/** "[Type] spells cost {1} less" from the command zone as well (eminence: The Ur-Sphinx). */
const eminenceReduction = (subtype: string, label: string) =>
  playerStatic({ spellCost: { filter: { subtype, not: { name: "The Ur-Sphinx" } }, reduce: 1 }, fromCommand: true, label });

export const EDH_MULTIVERSE: Record<string, CardScript> = {
  // --- Commander ----------------------------------------------------------------------------------------------------
  "Jace, Multiverse Architect": {
    abilities: [
      triggered(
        { on: "step", step: "beginCombat", whose: "opponent" },
        fx.unlessPays(
          ref.eventPlayer,
          { mana: "{2}" },
          fx.thisTurn({ cantAttack: { of: "you", subtype: "Jace" } }, ref.eventPlayer),
        ),
        { label: "The opponent pays {2}, or their creatures can't attack your Jaces this turn" },
      ),
      loyalty(1, {
        effects: [
          fx.draw(2),
          fx.pickFromZone("hand", {}, { to: "libraryBottom" }, { count: 1, prompt: "One card on the bottom of your library" }),
        ],
        label: "Draw two cards, then put a card from your hand on the bottom of your library",
      }),
      loyalty(-3, {
        targets: [
          target.permanent(
            "t",
            ["Planeswalker", "Creature"],
            { controller: "you", other: true },
            "other planeswalker or creature",
          ),
        ],
        effects: [
          fx.exile(ref.target()),
          fx.revealUntilN({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }, 1, { to: "battlefield" }),
        ],
        label: "Exile another planeswalker or creature you control; a planeswalker or creature from your library enters",
      }),
    ],
  },

  // --- Mana ---------------------------------------------------------------------------------------------------------
  "Azorius Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("W", "U")], label: "{W}{U}" })] },
  "Dimir Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("U", "B")], label: "{U}{B}" })] },
  "Izzet Signet": { abilities: [activated({ mana: "{1}", tap: true, effects: [fx.addMana("U", "R")], label: "{U}{R}" })] },
  "Fetid Heath": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{W/B}",
        tap: true,
        effects: [fx.addManaCombination(2, ["W", "B"])],
        label: "{W}{W}, {W}{B}, or {B}{B}",
      }),
    ],
  },
  "Mystic Gate": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{W/U}",
        tap: true,
        effects: [fx.addManaCombination(2, ["W", "U"])],
        label: "{W}{W}, {W}{U}, or {U}{U}",
      }),
    ],
  },
  "Kher Keep": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{1}{R}", tap: true, effects: [fx.createTokens(KOBOLDS)], label: "Kobolds of Kher Keep 0/1" }),
    ],
  },
  "Cursed Mirror": {
    asEnters: [
      fx.chooseCopy({ types: ["Creature"] }, { anyController: true, duration: "endOfTurn", except: { addKeywords: ["haste"] } }),
    ],
    abilities: [manaAbility("R")],
  },
  "Omnath, Locus of the Void": {
    // "+1/+1 for each unspent mana you have": base power and toughness 6 plus that mana.
    cdaPower: amount.plus(6, amount.manaInPool),
    cdaToughness: amount.plus(6, amount.manaInPool),
    abilities: [
      playerStatic({ keepUnspentMana: { types: [], becomes: "C" }, label: "Unspent mana becomes colorless" }),
      triggered(when.landfall, [fx.addMana("C", "C")], { label: "Landfall: {C}{C}" }),
    ],
  },
  "Contaminated Landscape": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(
            { types: ["Land"], basic: true, anySubtype: ["Plains", "Island", "Swamp"] },
            { to: "battlefield", tapped: true },
          ),
        ],
        label: "Search for a basic Plains, Island, or Swamp",
      }),
    ],
  },
  "Perilous Landscape": {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        effects: [
          fx.search(
            { types: ["Land"], basic: true, anySubtype: ["Island", "Mountain", "Plains"] },
            { to: "battlefield", tapped: true },
          ),
        ],
        label: "Search for a basic Island, Mountain, or Plains",
      }),
    ],
  },
  "Turbulent Crater": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.count({ types: ["Land"], controller: "opponent" }), 8)),
        label: "Tapped unless your opponents control eight or more lands",
      }),
    ],
  },
  "Turbulent Shore": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.count({ types: ["Land"], controller: "opponent" }), 8)),
        label: "Tapped unless your opponents control eight or more lands",
      }),
    ],
  },
  "Turbulent Wetlands": {
    abilities: [
      entersWith({
        tapped: true,
        condition: cond.not(cond.amountAtLeast(amount.count({ types: ["Land"], controller: "opponent" }), 8)),
        label: "Tapped unless your opponents control eight or more lands",
      }),
    ],
  },

  // --- Creatures -----------------------------------------------------------------------------------------------------
  "Akroma, Angel of Fury": {
    cantBeCountered: true,
    abilities: [
      protectionAbility(protection.from({ colors: ["W", "U"] }, "Protection from white and from blue")),
      activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" }),
    ],
  },
  "Archfiend of Despair": {
    abilities: [
      playerStatic({ cantGainLife: true, affects: "opponents", label: "Your opponents can't gain life" }),
      triggered(
        when.eachEndStep,
        fx.forEachPlayer(ref.eachOpponent, (p) => [
          fx.loseLife({ kind: "turnEvents", query: { event: "lifeLoss", sum: true }, of: p }, p),
        ]),
        { label: "Each opponent loses life equal to the life they lost this turn" },
      ),
    ],
  },
  "Archon of Cruelty": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.sacrifice(ref.target(), { anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }] }),
            fx.discard(1, ref.target()),
            fx.loseLife(3, ref.target()),
            fx.draw(1),
            fx.gainLife(3),
          ],
          {
            targets: [target.player("t", "opponent")],
            label: "The opponent sacrifices a creature or planeswalker, discards, loses 3 life; you draw and gain 3 life",
          },
        ),
      ),
    ],
  },
  "Avacyn, Angel of Horror": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false }),
        [fx.delayed([fx.toBattlefield(ref.target("c"), { underYourControl: true })], { c: ref.eventObject })],
        { label: "A nontoken creature you control dies: it returns at the beginning of the next end step" },
      ),
    ],
  },
  "Dack Fayden, Helping Hand": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.revealUntilN({ types: ["Creature"] }, amount.refCount(ref.eachOpponent), { to: "battlefield" }, "dack"),
          fx.goad(ref.stored("dack"), "permanent"),
          ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [fx.giveControl(ref.nth(ref.stored("dack"), n), p)]),
        ],
        { label: "One creature per opponent enters, goaded, and each opponent gains control of one" },
      ),
    ],
  },
  "Darksteel Angel": {
    abilities: [
      playerStatic({ cantLose: true, label: "You can't lose the game and your opponents can't win the game" }),
      eventReplacement({
        event: "counters",
        to: "yourSide",
        toFilter: { types: ["Creature"] },
        counter: "-1/-1",
        modify: { prevent: true },
        label: "-1/-1 counters can't be put on creatures you control",
      }),
    ],
  },
  "Ginger, Queen of Sweets": {
    abilities: [
      triggered(when.entersSelf, [fx.becomeMonarch()], { label: "You become the monarch" }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(6)], label: "Sacrifice it: you gain 6 life" }),
      triggered({ on: "step", step: "upkeep", whose: "any" }, [fx.createTokens(GINGERBRUTE)], {
        condition: cond.monarch,
        label: "You're the monarch: a Gingerbrute",
      }),
    ],
  },
  "Jhoira, Weatherlight Corsair": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.revealUntilN(
              { permanent: true, anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] },
              1,
              { to: "battlefield", underYourControl: true },
              "jhoira",
              ref.target(),
            ),
            fx.loseLife(amount.greatestManaValueOf(ref.stored("jhoira"))),
          ],
          {
            targets: [target.player("t", "opponent")],
            label:
              "The opponent reveals until a historic permanent: it enters under your control; you lose life equal to its mana value",
          },
        ),
      ),
    ],
  },
  "Memnarch, the Warden": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MYR, 2)], { label: "Two 1/1 Myr" }),
      triggered(when.attacksSelf, [fx.draw(amount.count({ types: ["Artifact"], controller: "you" }))], {
        label: "Draw a card for each artifact you control",
      }),
    ],
  },
  "Nissa, Leyline Tamer": {
    abilities: [
      triggered(
        when.landfall,
        [
          fx.draw(1),
          fx.countResolution("nissa"),
          ...fx.when(cond.not(cond.v("nissa", 2)), fx.revealUntilN({ types: ["Creature"] }, 1, { to: "battlefield" })),
        ],
        { label: "Landfall: draw; the first time this turn, a creature from your library enters" },
      ),
    ],
  },
  "Niv-Mizzet, Ghost Counsel": {
    abilities: [
      triggered(
        when.gainLife,
        fx.mayPayLife(amount.eventAmount, "Pay that much life to draw that many cards?", fx.draw(amount.eventAmount)),
        { label: "You gain life: you may pay that much life and draw that many cards" },
      ),
      activated({ tap: true, effects: [fx.loseLife(1, ref.eachOpponent), fx.gainLife(1)], label: "Each opponent loses 1 life" }),
    ],
  },
  "Ob Nixilis, the Ascended": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.destroyAll({ types: ["Creature"], controller: "opponent", tapped: true }, "obd"), fx.gainLife(amount.v("obd"))],
        { label: "Destroy the tapped creatures your opponents control; 1 life for each creature destroyed" },
      ),
      triggered(when.eachEndStep, [fx.createTokens(ANGEL_4_4)], {
        condition: cond.lifeGainedAtLeast(1),
        label: "You gained life this turn: a 4/4 flying Angel",
      }),
    ],
  },
  "Serra's Emissary": {
    // The card type is chosen as an "as enters" choice (like Arachne, Psionic Weaver).
    asEnters: [
      fx.chooseForSelf("mode", {
        options: ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle", "Kindred"],
      }),
    ],
    abilities: [
      staticAbility(
        CREATURE_YOU,
        { addProtections: [protection.from({ chosen: "cardType" }, "Protection from the chosen type")] },
        {
          label: "Creatures you control have protection from the chosen type",
        },
      ),
      playerStatic({ protection: { chosen: "cardType" }, label: "You have protection from the chosen type" }),
    ],
  },
  "Tamiyo, Upriser Crowned": {
    abilities: [
      triggered(when.entersSelf, [fx.becomeMonarch()], { label: "You become the monarch" }),
      triggered(
        when.combatDamageBatch({ types: ["Creature"] }, true),
        [fx.tap(ref.eventObjects), fx.counters(ref.eventObjects, "stun", 1)],
        {
          triggerCondition: cond.monarch,
          label: "Creatures deal damage to you while you're the monarch: tapped, a stun counter",
        },
      ),
    ],
  },
  "The Ur-Sphinx": {
    abilities: [
      eminenceReduction("Sphinx", "Eminence — other Sphinx spells you cast cost {1} less"),
      triggered(
        when.attackWith(1, { subtype: "Sphinx", controller: "you" }),
        fx.forEachPlayer(ref.eachPlayer, (p, n) => [
          fx.mill(amount.eventAmount, p, { name: `sphinx${n}` }),
          fx.castNow(ref.stored(`sphinx${n}`), { free: true }),
        ]),
        { label: "Each player mills that many cards; one milled card per player, cast for free" },
      ),
    ],
  },
  "Venser, Fervent Forger": {
    abilities: [
      triggeredModal(when.entersSelf, [
        {
          label: "Copy an opponent's instant or sorcery twice",
          targets: [
            target.spell(
              "s",
              { types: ["Instant", "Sorcery"], controller: "opponent" },
              "instant or sorcery spell an opponent controls",
            ),
          ],
          effects: [fx.copySpell(ref.target("s"), 2)],
        },
        {
          label: "Two token copies of an opponent's permanent, with haste, sacrificed at the end step",
          targets: [
            {
              id: "p",
              label: "permanent an opponent controls",
              filter: { objects: { permanent: true, controller: "opponent" } },
            },
          ],
          effects: [fx.copyToken(ref.target("p"), { count: 2, addKeywords: ["haste"], sacrificeAtEndStep: true })],
        },
      ]),
    ],
  },

  // --- Artifacts and enchantments -----------------------------------------------------------------------------------
  "Currency Converter": {
    abilities: [
      triggered(
        when.discard("you"),
        fx.may("Exile the discarded card?", fx.exileCard(ref.eventObject, { name: "cc" }), fx.link(ref.stored("cc"))),
        {
          label: "You discard: you may exile that card",
        },
      ),
      activated({ mana: "{2}", tap: true, effects: [fx.draw(1), fx.discard(1)], label: "Draw, and then discard" }),
      activated({
        tap: true,
        effects: [
          fx.pickFromZone("graveyard", {}, { to: "graveyard" }, { pool: ref.linked, count: 1, store: "cc" }),
          ...fx.when(cond.refMatches(ref.stored("cc"), { types: ["Land"] }), fx.createTokens(TREASURE)),
          ...fx.when(cond.refMatches(ref.stored("cc"), { notTypes: ["Land"] }), fx.createTokens(ROGUE)),
        ],
        label: "An exiled card into the graveyard: land, a Treasure; otherwise, a 2/2 Rogue",
      }),
    ],
  },
  "Dreadhorde Invasion": {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.amass(ref.you, "Zombie", 1)], {
        label: "Lose 1 life and amass Zombies 1",
      }),
      triggered(
        when.attacks({ subtype: "Zombie", token: true, controller: "you", minPower: 6 }),
        [fx.pump(ref.eventObject, 0, 0, ["lifelink"])],
        {
          label: "A Zombie token with power 6 or greater attacks: lifelink",
        },
      ),
    ],
  },
  "Proteus Staff": {
    abilities: [
      activated({
        mana: "{2}{U}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [
          fx.moveTo(ref.target(), { to: "libraryBottom" }),
          fx.revealUntilN({ types: ["Creature"] }, 1, { to: "battlefield" }, undefined, ref.controllerOf(ref.target())),
        ],
        label:
          "The creature on the bottom of the library; its controller reveals until a creature and puts it onto the battlefield",
      }),
    ],
  },
  "Shark Typhoon": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [{ ...fx.createTokens(SHARK), pt: amount.manaValueOf(ref.eventObject) } as Effect],
        {
          label: "Noncreature spell: an X/X flying Shark",
        },
      ),
      whenCycled([{ ...fx.createTokens(SHARK), pt: amount.eventAmount } as Effect], { label: "Cycled: an X/X flying Shark" }),
    ],
  },
  "Skrelv's Hive": {
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(1), fx.createTokens(MITE)], { label: "Lose 1 life; a Phyrexian Mite" }),
      staticAbility(
        { ...CREATURE_YOU, keyword: "toxic" },
        { addKeywords: ["lifelink"] },
        {
          condition: cond.amountAtLeast(amount.maxOverPlayers(ref.eachOpponent, amount.poison), 3),
          label: "Corrupted: creatures you control with toxic have lifelink",
        },
      ),
    ],
  },
  "Staff of the Storyteller": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SPIRIT)], { label: "A 1/1 flying Spirit" }),
      triggered(when.enters({ types: ["Creature"], token: true, controller: "you" }), [fx.counters(ref.self, "story", 1)], {
        batched: true,
        label: "You create creature tokens: a story counter",
      }),
      activated({
        mana: "{W}",
        tap: true,
        removeCounters: { kind: "story", n: 1 },
        effects: [fx.draw(1)],
        label: "Remove a story counter: draw",
      }),
    ],
  },
  "Whirlwind of Thought": {
    abilities: [triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.draw(1)], { label: "Noncreature spell: draw" })],
  },

  // --- Spells ----------------------------------------------------------------------------------------------------------
  Brainsurge: {
    spell: spell(
      [],
      [fx.draw(4), fx.pickFromZone("hand", {}, { to: "libraryTop" }, { count: 2, prompt: "Two cards on top of your library" })],
    ),
  },
  Despark: {
    spell: spell(
      [{ id: "t", label: "permanent with mana value 4 or greater", filter: { objects: { permanent: true, minManaValue: 4 } } }],
      [fx.exile(ref.target())],
    ),
  },
  "Fact or Fiction": { spell: spell([], [fx.piles(5, { revealed: true, opponentSeparates: true })]) },
  "Grand Crescendo": {
    spell: spell([], [fx.createTokens(CITIZEN, amount.x), fx.pumpAll(CREATURE_YOU, 0, 0, ["indestructible"])]),
  },
  "Lingering Souls": { spell: spell([], [fx.createTokens(SPIRIT, 2)]) },
  "Martial Coup": {
    spell: spell(
      [],
      [
        fx.createTokens(SOLDIER, amount.x, undefined, "coup"),
        ...fx.when(
          cond.xAtLeast(5),
          fx.destroy(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.stored("coup"))),
        ),
      ],
    ),
  },
  "White Sun's Twilight": {
    spell: spell(
      [],
      [
        fx.gainLife(amount.x),
        fx.createTokens(MITE, amount.x, undefined, "twilight"),
        ...fx.when(
          cond.xAtLeast(5),
          fx.destroy(ref.except(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), ref.stored("twilight"))),
        ),
      ],
    ),
  },
  "Mass Polymorph": {
    spell: spell(
      [],
      [
        fx.exileCard(ref.permanentsOf(ref.you, { types: ["Creature"] }), { name: "poly" }),
        fx.revealUntilN({ types: ["Creature"] }, amount.refCount(ref.stored("poly")), { to: "battlefield" }),
      ],
    ),
  },
  "Synthetic Destiny": {
    spell: spell(
      [],
      [
        fx.exileCard(ref.permanentsOf(ref.you, { types: ["Creature"] }), { name: "synth" }),
        fx.delayed([fx.revealUntilN({ types: ["Creature"] }, amount.v("n"), { to: "battlefield" })], undefined, {
          n: amount.refCount(ref.stored("synth")),
        }),
      ],
    ),
  },
  "Occult Epiphany": {
    spell: spell(
      [],
      [
        fx.draw(amount.x),
        fx.discard(amount.x, ref.you, { store: "occult" }),
        fx.createTokens(SPIRIT, { kind: "aggregate", fn: "distinct", property: "cardType", of: ref.stored("occult") } as never),
      ],
    ),
  },
  "Secure the Wastes": { spell: spell([], [fx.createTokens(WARRIOR, amount.x)]) },
  Sunfall: {
    spell: spell(
      [],
      [
        fx.exileCard(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"] }), { name: "sunfall" }),
        ...incubate(amount.refCount(ref.stored("sunfall"))),
      ],
    ),
  },
  "Teferi's Reproach": {
    exileOnResolve: true,
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.untilTheirNextTurn({ protection: "everything" }, ref.target()),
        ...(["lifeGain", "lifeLoss"] as const).map((event) =>
          fx.untilTheirNextTurn({ replacement: { event, to: "you", modify: { prevent: true } } }, ref.target()),
        ),
        fx.phaseOut(ref.permanentsOf(ref.target(), { notTypes: ["Land"] })),
      ],
    ),
  },
  "Elspeth, Sun's Champion": {
    abilities: [
      loyalty(1, { effects: [fx.createTokens(SOLDIER, 3)], label: "Three 1/1 Soldiers" }),
      loyalty(-3, {
        effects: [fx.destroyAll({ types: ["Creature"], minPower: 4 })],
        label: "Destroy all creatures with power 4 or greater",
      }),
      loyalty(-7, {
        effects: [
          fx.emblem(msg("Elspeth's emblem"), msg("Creatures you control get +2/+2 and have flying."), [
            staticAbility(CREATURE_YOU, { power: 2, toughness: 2, addKeywords: ["flying"] }, { label: "+2/+2 and flying" }),
          ]),
        ],
        label: "Emblem: your creatures get +2/+2 and flying",
      }),
    ],
  },
};
