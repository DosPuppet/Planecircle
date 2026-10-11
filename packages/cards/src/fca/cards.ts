/** Through the Ages (FCA): card scripts (PLAN-G). */
import { type Effect, msg, type TargetSpec, type TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCostMode,
  amount,
  type CardScript,
  cond,
  doesntUntap,
  entersWith,
  eventReplacement,
  fx,
  HUMAN,
  INSTANT_SORCERY,
  manaAbility,
  modal,
  mode,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
const WARRIOR_W: TokenSpec = {
  name: "Warrior",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Warrior"],
  power: 1,
  toughness: 1,
};
const CONSTRUCT: TokenSpec = {
  name: "Construct",
  colors: [],
  types: ["Artifact", "Creature"],
  subtypes: ["Construct"],
  power: 0,
  toughness: 0,
  abilities: [
    staticAbility(
      "self",
      { power: 1, toughness: 1 },
      { per: { types: ["Artifact"], controller: "you" }, label: "+1/+1 for each artifact" },
    ),
  ],
};
const IN_COMBAT = cond.any(
  cond.step("beginCombat"),
  cond.step("declareAttackers"),
  cond.step("declareBlockers"),
  cond.step("firstStrikeDamage"),
  cond.step("combatDamage"),
  cond.step("endCombat"),
);
/** "Choose two —": each pair of modes. */
function chooseTwo(...choices: { label: string; targets?: TargetSpec[]; effects: Effect[] }[]) {
  return modal(
    ...choices.flatMap((a, i) =>
      choices
        .slice(i + 1)
        .map((b) =>
          mode(
            msg("{a}; {b}", { a: a.label, b: b.label }),
            [...(a.targets ?? []), ...(b.targets ?? [])],
            [...a.effects, ...b.effects],
          ),
        ),
    ),
  );
}

export const CARDS: Record<string, CardScript> = {
  "Light Up the Stage": {
    // Spectacle {R}: read from the text.
    spell: spell([], [fx.exileTop(ref.you, 2, "l"), fx.grantPlay(ref.stored("l"), { untilYourNextTurn: true })]),
  },
  "Mizzix's Mastery": {
    spell: altCostMode(
      "Overload",
      "{5}{R}{R}{R}",
      {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery card in your graveyard")],
        effects: [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 999), fx.exileOnResolve],
      },
      {
        effects: [
          fx.moveTo(ref.zone("graveyard", ref.you, INSTANT_SORCERY), { to: "exile" }, { name: "c" }),
          fx.castCopiesFree([ref.stored("c")], 999),
          fx.exileOnResolve,
        ],
      },
    ),
  },
  "Ragavan, Nimble Pilferer": {
    // Dash {1}{R}: read from the text.
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.createTokens(TREASURE),
          fx.exileTop(ref.eventPlayer, 1, "r"),
          // "You may cast that card": a land (or a land back face) can't be played this way.
          fx.grantPlay(ref.stored("r"), { castOnly: true }),
        ],
        { label: "A Treasure; exile the top card of their library, castable this turn" },
      ),
    ],
  },
  // — G7: Through the Ages —
  // Vigilance: read from the text.
  "Adeline, Resplendent Cathar": {
    cda: { power: amount.count(YOUR_CREATURES) },
    abilities: [
      triggered(
        when.attackWith(),
        fx.forEachPlayer(ref.eachOpponent, (p) => [fx.createTappedTokens(HUMAN, 1, { attacking: ref.withPlaneswalkers(p) })]),
        {
          label: "You attack: a 1/1 Human tapped and attacking for each opponent",
        },
      ),
    ],
  },
  "Ranger-Captain of Eos": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Creature"], maxManaValue: 1 }, { to: "hand" })], {
        label: "Search for a creature card with mana value 1 or less",
      }),
      activated({
        sacrifice: true,
        effects: [fx.thisTurn({ castLimit: { who: "opponents", maxSpells: 0, spellTypes: { notTypes: ["Creature"] } } })],
        label: "Sacrifice it: your opponents can't cast noncreature spells this turn",
      }),
    ],
  },
  "Sram, Senior Edificer": {
    abilities: [
      triggered(when.castSpell("you", { anySubtype: ["Aura", "Equipment", "Vehicle"] }), [fx.draw(1)], {
        label: "Aura, Equipment, or Vehicle spell: draw",
      }),
    ],
  },
  Counterspell: { spell: spell([target.spell()], [fx.counter(ref.target())]) },
  "Urza, Lord High Artificer": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(CONSTRUCT)], { label: "A 0/0 Construct (+1/+1 for each artifact)" }),
      manaAbility("U", 1, { noTap: true, tapAnother: "artifact" }),
      activated({
        mana: "{5}",
        effects: [fx.shuffle(ref.you), fx.exileTop(ref.you, 1, "u"), fx.grantPlay(ref.stored("u"), { free: true })],
        label: "Shuffle, exile the top card: playable for free this turn",
      }),
    ],
  },
  // Flash: read from the text.
  "Venser, Shaper Savant": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [{ id: "t", label: "spell or permanent", filter: { spells: {}, objects: {} } }],
        label: "Return target spell or permanent",
      }),
    ],
  },
  "Dark Ritual": { spell: spell([], [fx.addMana("B", "B", "B")]) },
  "Fatal Push": {
    spell: spell(
      [target.creature()],
      [
        ...fx.when(
          cond.any(
            cond.targetMatches("t", { maxManaValue: 2 }),
            cond.all(
              cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1),
              cond.targetMatches("t", { maxManaValue: 4 }),
            ),
          ),
          fx.destroy(ref.target()),
        ),
      ],
    ),
  },
  "Syr Konrad, the Grim": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.damage(1, ref.eachOpponent)], {
        label: "Another creature dies: 1 damage to each opponent",
      }),
      triggered(
        {
          on: "zoneChange",
          from: ["hand", "library", "exile", "stack"],
          to: ["graveyard"],
          filter: { types: ["Creature"] },
          whose: "any",
        },
        [fx.damage(1, ref.eachOpponent)],
        { label: "A creature card is put into a graveyard from anywhere other than the battlefield: 1 damage to each opponent" },
      ),
      triggered(
        { on: "zoneChange", from: ["graveyard"], filter: { types: ["Creature"] }, whose: "you" },
        [fx.damage(1, ref.eachOpponent)],
        {
          label: "A creature card leaves your graveyard: 1 damage to each opponent",
        },
      ),
      activated({ mana: "{1}{B}", effects: [fx.mill(1, ref.eachPlayer)], label: "Each player mills a card" }),
    ],
  },
  "Yawgmoth, Thran Physician": {
    abilities: [
      protectionAbility(protection.from({ subtype: "Human" }, "Protection from Humans")),
      activated({
        payLife: 1,
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        targets: [target.optional(target.creature())],
        effects: [fx.counters(ref.target(), "-1/-1"), fx.draw(1)],
        label: "1 life, sacrifice another creature: a −1/−1 counter, draw",
      }),
      activated({ mana: "{B}{B}", discard: 1, effects: [fx.proliferate()], label: "Discard a card: proliferate" }),
    ],
  },
  "Godo, Bandit Warlord": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Artifact"], subtype: "Equipment" }, { to: "battlefield" })], {
        label: "You may search for an Equipment and put it onto the battlefield",
      }),
      triggered(
        when.attacksSelf,
        [fx.untap(ref.union(ref.self, ref.permanentsOf(ref.you, { subtype: "Samurai" }))), fx.extraCombat],
        { oncePerTurn: true, label: "First attack this turn: untap it and your Samurai; an additional combat" },
      ),
    ],
  },
  // Indestructible: read from the text.
  "Purphoros, God of the Forge": {
    abilities: [
      staticAbility(
        "self",
        { setTypes: ["Enchantment"] },
        {
          condition: cond.not(cond.amountAtLeast(amount.devotion("R"), 5)),
          label: "Not a creature as long as your devotion to red is less than five",
        },
      ),
      triggered(when.enters({ ...YOUR_CREATURES, other: true }), [fx.damage(2, ref.eachOpponent)], {
        label: "Another creature you control enters: 2 damage to each opponent",
      }),
      activated({ mana: "{2}{R}", effects: [fx.pumpAll(YOUR_CREATURES, 1, 0)], label: "Your creatures get +1/+0" }),
    ],
  },
  "Azusa, Lost but Seeking": {
    abilities: [playerStatic({ extraLands: 2, label: "Two additional lands on each of your turns" })],
  },
  // Trample: read from the text.
  "Traxos, Scourge of Kroog": {
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
      triggered(
        when.castSpell("you", { anyOf: [{ types: ["Artifact"] }, { legendary: true }, { subtype: "Saga" }] }),
        [fx.untap(ref.self)],
        { label: "Historic spell: untap it" },
      ),
    ],
  },
  // First strike, vigilance, lifelink: read from the text.
  "Danitha Capashen, Paragon": {
    abilities: [
      playerStatic({
        spellCost: { filter: { anySubtype: ["Aura", "Equipment"] }, reduce: 1 },
        label: "Your Aura and Equipment spells cost {1} less",
      }),
    ],
  },
  "Kenrith, the Returned King": {
    abilities: [
      activated({
        mana: "{R}",
        effects: [fx.pumpAll({ types: ["Creature"] }, 0, 0, ["trample", "haste"])],
        label: "All creatures gain trample and haste",
      }),
      activated({
        mana: "{1}{G}",
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "A +1/+1 counter",
      }),
      activated({
        mana: "{2}{W}",
        targets: [target.player()],
        effects: [fx.gainLife(5, ref.target())],
        label: "Target player gains 5 life",
      }),
      activated({
        mana: "{3}{U}",
        targets: [target.player()],
        effects: [fx.draw(1, ref.target())],
        label: "Target player draws",
      }),
      activated({
        mana: "{4}{B}",
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card in a graveyard")],
        effects: [fx.toBattlefield(ref.target())],
        label: "A creature card from a graveyard onto the battlefield",
      }),
    ],
  },
  // Vigilance: read from the text.
  "Loran of the Third Path": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.optional(target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"))],
        label: "Destroy up to one artifact or enchantment",
      }),
      activated({
        tap: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.draw(1), fx.draw(1, ref.target())],
        label: "You and target opponent each draw a card",
      }),
    ],
  },
  // Lifelink: read from the text.
  "Mangara, the Diplomat": {
    abilities: [
      // "… if two or more of those creatures are attacking you and/or planeswalkers you control".
      triggered(when.opponentAttacksYouWith(2, true), [fx.draw(1)], {
        label: "An opponent attacks you with two or more creatures: draw",
      }),
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.draw(1)], { label: "An opponent's second spell: draw" }),
    ],
  },
  // Defender: read from the text.
  "Wall of Omens": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })] },
  Brainstorm: {
    spell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          {},
          { to: "libraryTop" },
          { count: 2, min: 2, prompt: "Two cards to put back on top of your library" },
        ),
      ],
    ),
  },
  "Cryptic Command": {
    spell: chooseTwo(
      { label: "Counter target spell", targets: [target.spell("s")], effects: [fx.counter(ref.target("s"))] },
      {
        label: "Return target permanent",
        targets: [
          target.permanent("p", ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"], {}, "permanent"),
        ],
        effects: [fx.bounce(ref.target("p"))],
      },
      {
        label: "Tap all creatures your opponents control",
        effects: [fx.tap(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))],
      },
      { label: "Draw a card", effects: [fx.draw(1)] },
    ),
  },
  "Deadly Dispute": {
    additionalCost: { sacrifice: { filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, count: 1 } },
    spell: spell([], [fx.draw(2), fx.createTokens(TREASURE)]),
  },
  "Diabolic Intent": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([], [fx.search({}, { to: "hand" })]),
  },
  // Deathtouch: read from the text.
  "Varragoth, Bloodsky Sire": {
    abilities: [
      activated({
        mana: "{1}{B}",
        oncePerTurn: true,
        activationCondition: cond.sourceMatches({ attackedThisTurn: true }),
        targets: [target.player()],
        effects: [fx.search({}, { to: "libraryTop" }, 1, ref.target())],
        label: "Boast: target player puts a card from their library on top",
      }),
    ],
  },
  // Haste: read from the text.
  "Captain Lannery Storm": {
    abilities: [
      triggered(when.attacksSelf, [fx.createTokens(TREASURE)], { label: "Attacks: a Treasure" }),
      triggered(when.sacrifice({ subtype: "Treasure" }), [fx.pump(ref.self, 1, 0)], {
        label: "You sacrifice a Treasure: +1/+0",
      }),
    ],
  },
  "Lightning Bolt": { spell: spell([target.any()], [fx.damage(3, ref.target())]) },
  "Najeela, the Blade-Blossom": {
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], subtype: "Warrior" }),
        fx.may("create a 1/1 Warrior tapped and attacking", {
          ...fx.createTokens(WARRIOR_W, 1, ref.controllerOf(ref.eventObject)),
          tapped: true,
          attacking: true,
        } as Effect),
        { label: "A Warrior attacks: its controller may create an attacking 1/1 Warrior" },
      ),
      activated({
        mana: "{W}{U}{B}{R}{G}",
        activationCondition: IN_COMBAT,
        effects: [
          fx.untap(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"], attacking: true })),
          fx.pumpAll({ attacking: true }, 0, 0, ["trample", "lifelink", "haste"]),
          fx.extraCombat,
        ],
        label: "Untap the attackers; trample, lifelink, haste; an additional combat",
      }),
    ],
  },
  Farseek: {
    spell: spell(
      [],
      [
        fx.search(
          { types: ["Land"], anySubtype: ["Plains", "Island", "Swamp", "Mountain"] },
          { to: "battlefield", tapped: true },
        ),
      ],
    ),
  },
  "Nature's Claim": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
      [fx.gainLife(4, ref.controllerOf(ref.target())), fx.destroy(ref.target())],
    ),
  },
  // Trample: read from the text.
  "Primeval Titan": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, 2)], {
        label: "Up to two land cards, tapped",
      }),
      triggered(when.attacksSelf, [fx.search({ types: ["Land"] }, { to: "battlefield", tapped: true }, 2)], {
        label: "Up to two land cards, tapped",
      }),
    ],
  },
  "Dovin's Veto": {
    rules: { cantBeCountered: true },
    spell: spell([target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")], [fx.counter(ref.target())]),
  },
  "Isshin, Two Heavens as One": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", on: "attack" },
        label: "Abilities triggered by an attacking creature trigger an additional time",
      }),
    ],
  },
  "Kinnan, Bonder Prodigy": {
    abilities: [
      eventReplacement({
        event: "mana",
        source: { notTypes: ["Land"], controller: "you" },
        modify: { add: 1 },
        label: "A nonland permanent tapped for mana: one additional mana of the same type",
      }),
      activated({
        mana: "{5}{G}{U}",
        effects: [
          fx.lookAtTop(5, {
            filter: { types: ["Creature"], notSubtype: "Human" },
            count: 1,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        label: "Among the top five, a non-Human creature onto the battlefield",
      }),
    ],
  },
  "Chromatic Lantern": {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addAbilities: [manaAbility([...ANY])] },
        {
          label: "Your lands tap for mana of any color",
        },
      ),
      manaAbility([...ANY]),
    ],
  },
  // Flying, crew 1: read from the text.
  "Smuggler's Copter": {
    abilities: [
      triggered(when.attacksSelf, fx.may("draw then discard", ...fx.loot()), {
        label: "Attacks: you may draw and discard",
      }),
      triggered({ on: "blocks", who: "self" }, fx.may("draw then discard", ...fx.loot()), {
        label: "Blocks: you may draw and discard",
      }),
    ],
  },
  "Strixhaven Stadium": {
    abilities: [
      manaAbility("C", 1, { addCounter: "point" }),
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"] }, to: { players: "any" } },
        [fx.removeCounters(ref.self, 1, "point")],
        {
          condition: cond.not(cond.amountAtLeast(amount.refCount(ref.except(ref.eventPlayer, ref.you)), 1)),
          label: "A creature deals combat damage to you: remove a point counter",
        },
      ),
      triggered(
        when.combatDamage(YOUR_CREATURES, true),
        [
          fx.counters(ref.self, "point"),
          ...fx.when(cond.amountAtLeast(amount.countersOn(ref.self, "point"), 10), [
            fx.removeCounters(ref.self, 99, "point"),
            fx.playerLoses(ref.eventPlayer),
          ]),
        ],
        { label: "One of your creatures deals damage to an opponent: a point counter; ten: they lose the game" },
      ),
    ],
  },
  // — G4e: hard sub-lot —
  // Lifelink: read from the text.
  "K'rrik, Son of Yawgmoth": {
    abilities: [
      playerStatic({ phyrexianMana: "B", label: "Each {B} in your costs can be paid with 2 life" }),
      triggered(when.castSpell("you", { colors: ["B"] }), [fx.addCounters(ref.self, 1)], {
        label: "Black spell: a +1/+1 counter",
      }),
    ],
  },
  "Laboratory Maniac": {
    abilities: [
      playerStatic({
        winOnEmptyDraw: true,
        label: "If you would draw from an empty library, you win the game instead",
      }),
    ],
  },
  "Nyxbloom Ancient": {
    abilities: [
      eventReplacement({
        event: "mana",
        to: "you",
        modify: { times: 3 },
        label: "A permanent you tap for mana produces three times as much",
      }),
    ],
  },
  "Ancient Copper Dragon": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.rollDie(20, "d20"), fx.createTokens(TREASURE, amount.v("d20"))], {
        label: "Combat damage to a player: roll a d20, that many Treasures",
      }),
    ],
  },
  "Teferi, Mage of Zhalfir": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["flash"] },
        label: "Your creature cards have flash",
      }),
      playerStatic({
        castLimit: { who: "opponents", sorceryTiming: true },
        label: "Your opponents can cast spells only any time they could cast a sorcery",
      }),
    ],
  },
  "Atraxa, Grand Unifier": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(10, { count: 8, onePerType: true, rest: "bottom" })], {
        label: "Enters: reveal ten cards; one of each card type into your hand",
      }),
    ],
  },
  "Carpet of Flowers": {
    abilities: [
      // "If you haven't added mana with this ability this turn": declining doesn't count.
      triggered(
        when.eachMain,
        fx.may(
          "Add mana (as much as the opponent's Islands)?",
          fx.addManaChoice(amount.refCount(ref.permanentsOf(ref.target(), { subtype: "Island" }))),
          fx.doneOncePerTurn,
        ),
        {
          targets: [target.player("t", "opponent")],
          oncePerTurn: "ifDone",
          label:
            "Beginning of each of your main phases: X mana of one color, where X is the number of Islands target opponent controls",
        },
      ),
    ],
  },
  "Winota, Joiner of Forces": {
    abilities: [
      triggered(
        when.attacks({ types: ["Creature"], controller: "you", notSubtype: "Human" }),
        [
          fx.lookAtTop(6, {
            filter: { types: ["Creature"], subtype: "Human" },
            count: 1,
            to: { to: "battlefield", tapped: true, attacking: true },
            rest: "bottom",
            store: "w",
          }),
          fx.pump(ref.stored("w"), 0, 0, ["indestructible"]),
        ],
        { label: "A non-Human creature attacks: a Human among the top six cards enters tapped and attacking" },
      ),
    ],
  },
  "Jodah, the Unifier": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", legendary: true },
        { power: 1, toughness: 1 },
        {
          perAmount: amount.count({ types: ["Creature"], controller: "you", legendary: true }),
          label: "Your legendary creatures: +X/+X (X: your legendary creatures)",
        },
      ),
      triggered(
        { on: "castSpell", by: "you", filter: { legendary: true }, fromHand: true },
        [fx.cascade(amount.manaValueOf(ref.eventObject), { legendary: true })],
        { label: "You cast a legendary spell from your hand: legendary cascade" },
      ),
    ],
  },
  "Bolas's Citadel": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "You may look at the top card of your library" }),
      playerStatic({
        playFrom: { zone: "libraryTop", what: "lands" },
        label: "You may play lands from the top of your library",
      }),
      playerStatic({
        playFrom: { zone: "libraryTop", what: "spells", payLifeManaValue: true },
        label: "Spells from the top of your library: life equal to their MV rather than their cost",
      }),
      activated({
        tap: true,
        sacrificeOther: { filter: { notTypes: ["Land"] }, count: 10, includeSelf: true },
        effects: [fx.loseLife(10, ref.eachOpponent)],
        label: "{T}, sacrifice ten nonland permanents: each opponent loses 10 life",
      }),
    ],
  },
  "Gix, Yawgmoth Praetor": {
    abilities: [
      triggered(
        { on: "dealsCombatDamage", who: { types: ["Creature"] }, to: { players: "opponent" } },
        fx.mayPayLifeFor(
          ref.controllerOf(ref.eventObject),
          1,
          "Pay 1 life and draw a card?",
          fx.draw(1, ref.controllerOf(ref.eventObject)),
        ),
        { label: "A creature deals damage to one of your opponents: its controller may pay 1 life and draw" },
      ),
      activated({
        mana: "{4}{B}{B}{B}",
        discardX: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.exileTop(ref.target(), amount.x, "g"), fx.grantPlay(ref.stored("g"), { free: true, forever: true })],
        label: "{4}{B}{B}{B}, discard X cards: exile the opponent's top X cards; play them without paying",
      }),
    ],
  },
};
