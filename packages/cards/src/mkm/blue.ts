/** Murders at Karlov Manor — blue cards. */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  cond,
  costReducer,
  doesntUntap,
  eventReplacement,
  fx,
  INSTANT_SORCERY,
  investigate,
  playerStatic,
  ref,
  SUSPECTED,
  spell,
  staticAbility,
  THOPTER,
  target,
  triggered,
  when,
} from "./common";

/** "You may draw a card. If you do, discard a card." */
const mayLoot = fx.may("Draw a card, then discard a card?", fx.draw(1), fx.discard(1));

/** Benthic Criminologists: "you may sacrifice an artifact; if you do, draw a card". */
const sacrificeArtifactToDraw = [
  fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
  ...fx.when(cond.v("s"), fx.draw(1)),
];

/** "Enchant creature". */
const ENCHANT_CREATURE: CardScript["enchant"] = { filter: { types: ["Creature"] }, label: "creature" };

/** Burden of Proof: the enchanted creature is a Detective you control. */
const ENCHANTS_YOUR_DETECTIVE = cond.controls({ attached: "host", subtype: "Detective" });

/** Empty library (Living Conundrum). */
const LIBRARY_EMPTY = cond.not(cond.amountAtLeast(amount.cardsIn("library"), 1));

/** Thopter: 0/0 colorless artifact creature with flying (Intrude on the Mind). */
const THOPTER_0: TokenSpec = {
  name: "Thopter",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Thopter"],
  power: 0,
  toughness: 0,
  keywords: ["flying"],
};

export const BLUE: Record<string, CardScript> = {
  "Agency Outfitter": {
    abilities: [
      // Graveyard, hand and/or library, one choice: up to one card of each name.
      triggered(
        when.entersSelf,
        [
          fx.search({}, { to: "battlefield" }, 1, undefined, undefined, undefined, {
            alsoFrom: ["graveyard", "hand"],
            each: [{ name: "Magnifying Glass" }, { name: "Thinking Cap" }],
          }),
        ],
        { label: "Search for a Magnifying Glass and a Thinking Cap" },
      ),
    ],
  },
  "Behind the Mask": {
    // Collect evidence 6 (optional additional cost): read from the text.
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [
        ...fx.when(
          cond.not(cond.kicked),
          fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 4, setToughness: 3 }),
        ),
        ...fx.when(cond.kicked, fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 1, setToughness: 1 })),
      ],
    ),
  },
  "Benthic Criminologists": {
    abilities: [
      triggered(when.entersSelf, sacrificeArtifactToDraw, { label: "Sacrifice an artifact: draw a card" }),
      triggered(when.attacksSelf, sacrificeArtifactToDraw, { label: "Sacrifice an artifact: draw a card" }),
    ],
  },
  "Bubble Smuggler": {
    // Disguise: read from the text. "As this creature is turned face up, put four +1/+1 counters on it."
    faceUpCounters: { kind: "+1/+1", n: 4 },
  },
  "Burden of Proof": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { power: 2, toughness: 2 }, { condition: ENCHANTS_YOUR_DETECTIVE, label: "+2/+2 (Detective)" }),
      staticAbility(
        "attached",
        {
          setPower: 1,
          setToughness: 1,
          addBlockRules: [block.onlyBlocks({ not: { subtype: "Detective" } }, "Can't block Detectives")],
        },
        { condition: cond.not(ENCHANTS_YOUR_DETECTIVE), label: "Base 1/1, can't block Detectives" },
      ),
    ],
  },
  Candlestick: {
    // Equip {2}: read from the text.
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(when.attacksSelf, [fx.surveil(2)], { label: "Surveil 2" })],
        },
        { label: "+1/+1 and surveil 2 when attacking" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Case of the Filched Falcon": {
    abilities: [triggered(when.entersSelf, [investigate()], { label: "Investigate" })],
    caseToSolve: cond.controls({ types: ["Artifact"] }, 3),
    caseSolved: [
      activated({
        mana: "{2}{U}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact"], { notTypes: ["Creature"] }, "noncreature artifact")],
        effects: [
          fx.addCounters(ref.target(), 4),
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Bird"], setPower: 0, setToughness: 0, addKeywords: ["flying"] },
            "permanent",
          ),
        ],
        label: "The artifact becomes a 0/0 flying Bird with four +1/+1 counters",
      }),
    ],
  },
  "Case of the Ransacked Lab": {
    abilities: [costReducer(INSTANT_SORCERY, 1, "Your instants and sorceries cost {1} less")],
    caseToSolve: cond.amountAtLeast(amount.instantSorceryCast, 4),
    caseSolved: [triggered(when.castSpell("you", INSTANT_SORCERY), [fx.draw(1)], { label: "Instant or sorcery: draw a card" })],
  },
  "Cold Case Cracker": {
    abilities: [triggered(when.diesSelf, [investigate()], { label: "Investigate" })],
  },
  "Coveted Falcon": {
    // Disguise: read from the text.
    abilities: [
      triggered(when.attacksSelf, [fx.gainControl(ref.target())], {
        targets: [
          {
            id: "t",
            label: "permanent you own but don't control",
            filter: { objects: { permanent: true, owner: "you", controller: "opponent" } },
          },
        ],
        label: "Gain control of a permanent you own",
      }),
      triggered(
        when.turnedFaceUp,
        [fx.giveControl(ref.target("p"), ref.target("o")), fx.draw(amount.refCount(ref.target("p")))],
        {
          targets: [
            target.player("o", "opponent"),
            target.upTo(99, {
              id: "p",
              label: "permanents you control",
              filter: { objects: { permanent: true, controller: "you" } },
            }),
          ],
          label: "Give permanents to an opponent; draw that many cards",
        },
      ),
    ],
  },
  "Crimestopper Sprite": {
    // Collect evidence 6 (optional additional cost): read from the text. In the effects of a triggered ability,
    // `cond.kicked` reads the ability and not the permanent: two exclusive versions, chosen by the condition.
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target())], {
        targets: [target.creature()],
        condition: cond.not(cond.kicked),
        label: "Tap a creature",
      }),
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature()],
        condition: cond.kicked,
        label: "Evidence collected: tap a creature, stun counter",
      }),
    ],
  },
  "Curious Inquiry": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility(
        "attached",
        {
          power: 1,
          toughness: 1,
          addAbilities: [triggered(when.combatDamageToPlayer, [investigate()], { label: "Investigate" })],
        },
        { label: "+1/+1; combat damage to a player: investigate" },
      ),
    ],
  },
  Deduce: {
    spell: spell([], [fx.draw(1), investigate()]),
  },
  "Dramatic Accusation": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the enchanted creature" }),
      doesntUntap("attached"),
      activated({
        mana: "{U}{U}",
        effects: [fx.moveTo(ref.attached, { to: "libraryTop", shuffle: true })],
        label: "Shuffle the enchanted creature into its owner's library",
      }),
    ],
  },
  "Eliminate the Impossible": {
    spell: spell(
      [],
      [
        investigate(),
        fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -2, 0),
        fx.suspect(ref.permanentsOf(ref.eachOpponent, SUSPECTED), false),
      ],
    ),
  },
  "Exit Specialist": {
    // Disguise: read from the text.
    abilities: [
      blockAbility(block.notBy({ minPower: 3 }, "Can't be blocked by creatures with power 3 or greater")),
      triggered(when.turnedFaceUp, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { other: true })],
        label: "Return another creature to its owner's hand",
      }),
    ],
  },
  "Fae Flight": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.attached, 0, 0, ["hexproof"])], {
        label: "The enchanted creature gains hexproof this turn",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["flying"] }, { label: "+1/+0 and flying" }),
    ],
  },
  "Forensic Gadgeteer": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Artifact"] }), [investigate()], { label: "Artifact spell: investigate" }),
      playerStatic({
        abilityCost: { source: { types: ["Artifact"], controller: "you" }, reduce: 1, minOneMana: true },
        label: "Activated abilities of your artifacts cost {1} less",
      }),
    ],
  },
  "Furtive Courier": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["unblockable"] },
        {
          condition: cond.amountAtLeast(amount.turnEvents({ event: "sacrifice", who: "you", types: ["Artifact"] }), 1),
          label: "Can't be blocked if you sacrificed an artifact this turn",
        },
      ),
      triggered(when.attacksSelf, fx.loot(1), { label: "Draw a card, then discard a card" }),
    ],
  },
  "Hotshot Investigators": {
    abilities: [
      triggered(
        when.entersSelf,
        // "If you controlled it": read before returning it.
        [...fx.when(cond.targetMatches("t", { controller: "you" }), investigate()), fx.bounce(ref.target())],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Return another creature; investigate if you controlled it",
        },
      ),
    ],
  },
  "Jaded Analyst": {
    abilities: [
      triggered(when.draw(2), [fx.modify(ref.self, { removeKeywords: ["defender"], addKeywords: ["vigilance"] })], {
        label: "Second card drawn: loses defender, gains vigilance",
      }),
    ],
  },
  "Living Conundrum": {
    abilities: [
      eventReplacement({
        event: "draw",
        to: "you",
        modify: { prevent: true },
        condition: LIBRARY_EMPTY,
        label: "Empty library: skip the draw",
      }),
      staticAbility(
        "self",
        { setPower: 10, setToughness: 10, addKeywords: ["flying", "vigilance"] },
        { condition: LIBRARY_EMPTY, label: "Empty library: 10/10, flying and vigilance" },
      ),
    ],
  },
  "Lost in the Maze": {
    abilities: [
      // "X target creatures": the X of the spell, evaluated when targeting (`countAmount`).
      triggered(
        when.entersSelf,
        [fx.tap(ref.target()), fx.counters(ref.except(ref.target(), ref.permanentsOf(ref.you, { types: ["Creature"] })), "stun")],
        {
          targets: [{ ...target.creature(), count: 1, countAmount: amount.sourceX }],
          label: "Tap X creatures; stun counter on your opponents' ones",
        },
      ),
      staticAbility(
        { types: ["Creature"], controller: "you", tapped: true },
        { addKeywords: ["hexproof"] },
        {
          label: "Your tapped creatures have hexproof",
        },
      ),
    ],
  },
  "Mistway Spy": {
    // Disguise: read from the text.
    abilities: [
      triggered(
        when.turnedFaceUp,
        [
          fx.emblem(
            "Mistway Spy",
            "Until end of turn, whenever a creature you control deals combat damage to a player, investigate.",
            [
              triggered(when.combatDamage({ types: ["Creature"], controller: "you" }, true), [investigate()], {
                label: "Investigate",
              }),
            ],
            false,
            true,
          ),
        ],
        { label: "This turn, whenever a creature of yours deals combat damage to a player, investigate" },
      ),
    ],
  },
  "Out Cold": {
    cantBeCountered: true,
    spell: spell([target.upTo(2, target.creature())], [fx.tap(ref.target()), fx.counters(ref.target(), "stun"), investigate()]),
  },
  "Proft's Eidetic Memory": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      playerStatic({ maxHandSize: "none", label: "No maximum hand size" }),
      triggered(when.yourCombat, [fx.addCounters(ref.target(), amount.plus(amount.cardsDrawnThisTurn, -1))], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.drewAtLeast(2),
        label: "X +1/+1 counters (cards drawn this turn minus one)",
      }),
    ],
  },
  "Projektor Inspector": {
    abilities: [
      // "This creature or another Detective": it is itself a Detective.
      triggered(when.enters({ subtype: "Detective", controller: "you" }), mayLoot, {
        label: "A Detective enters: draw, then discard",
      }),
      triggered(when.permanentTurnedFaceUp({ subtype: "Detective", controller: "you" }), mayLoot, {
        label: "A Detective is turned face up: draw, then discard",
      }),
    ],
  },
  "Reasonable Doubt": {
    spell: spell(
      [target.spell("s"), target.upTo(1, target.creature("c"))],
      [
        ...fx.unlessPays(ref.controllerOf(ref.target("s")), { mana: "{2}" }, fx.counter(ref.target("s"))),
        fx.suspect(ref.target("c")),
      ],
    ),
  },
  "Reenact the Crime": {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { notTypes: ["Land"], enteredThisTurn: true },
          "any",
          "nonland card put into a graveyard this turn",
        ),
      ],
      [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 99)],
    ),
  },
  "Sudden Setback": {
    spell: spell(
      [{ id: "t", label: "spell or nonland permanent", filter: { spells: {}, objects: { notTypes: ["Land"] } } }],
      [fx.topOrBottom(ref.target())],
    ),
  },
  "Unauthorized Exit": {
    spell: spell([target.nonland()], [fx.bounce(ref.target()), fx.surveil(1)]),
  },
  "Surveillance Monitor": {
    abilities: [
      triggered(when.entersSelf, fx.mayCollectEvidence(4, {}), { label: "You may collect evidence 4" }),
      triggered(when.collectEvidence, [fx.createTokens(THOPTER)], {
        label: "You collect evidence: a 1/1 flying Thopter",
      }),
    ],
  },
  "Forensic Researcher": {
    abilities: [
      activated({
        tap: true,
        targets: [{ id: "t", label: "another permanent you control", filter: { objects: { controller: "you", other: true } } }],
        effects: [fx.untap(ref.target())],
        label: "Untap another target permanent you control",
      }),
      activated({
        tap: true,
        collectEvidence: 3,
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.tap(ref.target())],
        label: "Collect evidence 3: tap a creature you don't control",
      }),
    ],
  },
  "Cryptic Coat": {
    abilities: [
      triggered(when.entersSelf, [fx.cloak(ref.libraryTop(ref.you), "c"), fx.attach(ref.stored("c"))], {
        label: "Cloak the top card, then attach this Equipment to it",
      }),
      staticAbility("attached", { power: 1, addKeywords: ["unblockable"] }, { label: "+1/+0, can't be blocked" }),
      activated({ mana: "{1}{U}", effects: [fx.bounce(ref.self)], label: "Return this Equipment to your hand" }),
    ],
  },
  "Conspiracy Unraveler": {
    abilities: [
      playerStatic({
        altCostAll: { collectEvidence: 10 },
        label: "You may collect evidence 10 rather than pay the mana cost of your spells",
      }),
    ],
  },
  "Intrude on the Mind": {
    spell: spell(
      [],
      [
        fx.piles(5, { revealed: true, storeGraveyard: "g" }),
        fx.createTokens(THOPTER_0, 1, undefined, "t"),
        fx.addCounters(ref.stored("t"), amount.v("g")),
      ],
    ),
  },
};
