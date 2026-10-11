/**
 * Duskmourn, lot C: legendaries, Rooms and unique cards (granted convoke, doors, face down, modal delirium,
 * spell copies, damage replacements…).
 */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  CREATURE_OR_ENCHANTMENT,
  CREATURE_YOU_CONTROL,
  chapter,
  cond,
  costReducer,
  doesntUntap,
  eerie,
  eventReplacement,
  fx,
  graveyardReplacement,
  INSTANT_SORCERY,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  survival,
  TOY,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const TAPPED = cond.sourceMatches({ tapped: true });
const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;

/** Toby: 4/4 white Beast "this token can't attack or block alone". */
const TOBY_BEAST: TokenSpec = {
  name: "Beast",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Beast"],
  power: 4,
  toughness: 4,
  abilities: [blockAbility(block.notAlone)],
  text: "This token can't attack or block alone.",
};

/** Zimone: Primo, the Indivisible, 0/0 green and blue legendary Fractal. */
const PRIMO: TokenSpec = {
  name: "Primo, the Indivisible",
  colors: ["G", "U"],
  types: ["Creature"],
  subtypes: ["Fractal"],
  power: 0,
  toughness: 0,
  legendary: true,
};

/** Niko: Shard, enchantment "{2}, Sacrifice this token: Scry 1, then draw a card". */
const SHARD: TokenSpec = {
  name: "Shard",
  colors: [],
  types: ["Enchantment"],
  subtypes: ["Shard"],
  abilities: [activated({ mana: "{2}", sacrifice: true, effects: [fx.scry(1), fx.draw(1)], label: "Scry 1, draw" })],
  text: "{2}, Sacrifice this token: Scry 1, then draw a card.",
};

const LETS_PLAY = {
  minus: [fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -1, -1)],
  discard: [fx.discard(2, ref.eachOpponent)],
  drain: fx.drain(3),
};

export const LEGENDS: Record<string, CardScript> = {
  // White
  "Dazzling Theater": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { types: ["Creature"] }, keywords: ["convoke"] },
        label: "Your creature spells have convoke",
      }),
    ],
  },
  "Prop Room": {
    abilities: [
      playerStatic({
        untapOnOthersUntap: { types: ["Creature"] },
        label: "Your creatures untap during each other player's untap step",
      }),
    ],
  },
  "Dollmaker's Shop": {
    // "one or more non-Toy creatures attack a player": not a planeswalker.
    abilities: [
      triggered(when.attackWith(1, { types: ["Creature"], notSubtype: "Toy", attacking: "opponent" }), [fx.createTokens(TOY)], {
        label: "1/1 Toy token",
      }),
    ],
  },
  "Porcelain Gallery": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { setPower: 1, setToughness: 1 },
        { per: CREATURE_YOU_CONTROL, label: "Base power and toughness equal to the number of your creatures" },
      ),
    ],
  },
  "Orphans of the Wheat": {
    abilities: [
      triggered(
        when.attacksSelf,
        // "Any number of untapped creatures you control": itself too, if it is still untapped (vigilance; PLAN-L L4).
        [fx.tapChosen({ types: ["Creature"] }, "n"), fx.pump(ref.self, amount.v("n"), amount.v("n"))],
        { label: "Tap creatures: +1/+1 for each" },
      ),
    ],
  },
  "Possessed Goat": {
    abilities: [
      activated({
        mana: "{3}",
        discard: 1,
        once: true,
        effects: [fx.addCounters(ref.self, 3), fx.modify(ref.self, { addColors: ["B"], addSubtypes: ["Demon"] }, "permanent")],
        label: "Three +1/+1 counters, becomes a black Demon",
      }),
    ],
  },
  "Reluctant Role Model": {
    abilities: [
      triggeredModal(
        when.secondMain,
        [
          mode("A flying counter", [], [fx.counters(ref.self, "flying", 1)]),
          mode("A lifelink counter", [], [fx.counters(ref.self, "lifelink", 1)]),
          mode("A +1/+1 counter", [], [fx.addCounters(ref.self, 1)]),
        ],
        { condition: TAPPED, label: "Survival — a counter" },
      ),
      triggered(when.dies(CREATURE_YOU_CONTROL), [fx.lkiCountersTo(ref.target())], {
        condition: cond.eventObjectMatches({ withCounter: "any" }),
        targets: [target.upTo(1, target.creature())],
        label: "Its counters onto a creature",
      }),
    ],
  },
  "Toby, Beastie Befriender": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TOBY_BEAST)], { label: "4/4 Beast token" }),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, token: true },
        { addKeywords: ["flying"] },
        {
          condition: cond.controls({ types: ["Creature"], token: true }, 4),
          label: "Your creature tokens have flying (four or more)",
        },
      ),
    ],
  },
  "Unidentified Hovership": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.upTo(1, target.creature("t", { maxToughness: 5 }))],
        label: "Exile a creature with toughness 5 or less",
      }),
      triggered(when.leavesSelf, [fx.manifestDreadBy({ who: ref.ownerOf(ref.linked) })], {
        label: "Its owner manifests dread",
      }),
    ],
  },
  "Veteran Survivor": {
    abilities: [
      survival([fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.upTo(1, target.cardInGraveyard("t", {}, "any"))],
        label: "Exile a card from a graveyard",
      }),
      staticAbility(
        "self",
        { power: 3, toughness: 3, addKeywords: ["hexproof"] },
        {
          condition: cond.amountAtLeast(amount.refCount(ref.linked), 3),
          label: "+3/+3 and hexproof (three exiled cards)",
        },
      ),
    ],
  },

  // Blue
  "Central Elevator": {
    // "A Room card that doesn't have the same name as a Room you control": a Room has both its names (PLAN-L L4).
    abilities: [
      triggered(
        when.unlockThisDoor,
        [fx.search({ subtype: "Room", not: { sameNameAs: { subtype: "Room", controller: "you" } } })],
        { label: "Search for a Room" },
      ),
    ],
  },
  "Promising Stairs": {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1), ...fx.when(cond.amountAtLeast(amount.unlockedDoorNames, 8), fx.winGame)], {
        label: "Surveil 1; eight doors: you win the game",
      }),
    ],
  },
  "Creeping Peeper": {
    abilities: [
      manaAbility("U", 1, {
        restriction: { spell: { types: ["Enchantment"] }, ability: ["unlock", "turnFaceUp"] },
      }),
    ],
  },
  "Fear of Impostors": {
    abilities: [
      triggered(when.entersSelf, [fx.counter(ref.target()), fx.manifestDreadBy({ who: ref.controllerOf(ref.target()) })], {
        targets: [target.spell()],
        label: "Counter a spell; its controller manifests dread",
      }),
    ],
  },
  "Floodpits Drowner": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap a creature, stun counter",
      }),
      activated({
        mana: "{1}{U}",
        tap: true,
        targets: [target.creature("t", { withCounter: "stun" })],
        effects: [
          fx.moveTo(ref.self, { to: "libraryTop", shuffle: true }),
          fx.moveTo(ref.target(), { to: "libraryTop", shuffle: true }),
        ],
        label: "Shuffle it and a stunned creature into the libraries",
      }),
    ],
  },
  "Leyline of Transformation": {
    leyline: true,
    asEnters: [fx.chooseForSelf("creatureType")],
    // Spells and cards outside the battlefield: not handled.
    abilities: [staticAbility(CREATURE_YOU_CONTROL, { addChosen: "subtype" }, { label: "Your creatures are the chosen type" })],
  },
  "Marina Vendrell's Grimoire": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(5)], { condition: cond.wasCast, label: "Draw five cards" }),
      playerStatic({ maxHandSize: "none", cantLose: "life", label: "No maximum hand size; you don't lose at 0 life" }),
      triggered(when.gainLife, [fx.draw(amount.eventAmount)], { label: "Draw that many cards" }),
      triggered(
        when.loseLife("you"),
        [fx.discard(amount.eventAmount), ...fx.when(cond.not(cond.amountAtLeast(amount.cardsIn("hand"), 1)), fx.loseGame)],
        { label: "Discard that many cards; with no cards in hand, you lose" },
      ),
    ],
  },
  "The Mindskinner": {
    keywords: ["unblockable"],
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponent",
        modify: { prevent: true },
        onPrevent: { opponentsMill: true },
        label: "Damage to opponents prevented: they mill that many",
      }),
    ],
  },
  "Mirror Room": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.copyToken(ref.target(), { addSubtypes: ["Reflection"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Token copy (Reflection)",
      }),
    ],
  },
  "Fractured Realm": {
    abilities: [playerStatic({ triggerMod: { effect: "again" }, label: "Your triggered abilities trigger an additional time" })],
  },
  "Paranormal Analyst": {
    abilities: [
      triggered(when.manifestDread, [fx.toHand(ref.eventObject)], { label: "The card put into the graveyard returns to hand" }),
    ],
  },
  "Stay Hidden, Stay Silent": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the enchanted creature" }),
      doesntUntap("attached"),
      activated({
        mana: "{4}{U}{U}",
        sorcerySpeed: true,
        effects: [fx.moveTo(ref.attached, { to: "libraryTop", shuffle: true }), fx.manifestDread],
        label: "Shuffle the enchanted creature, manifest dread",
      }),
    ],
  },
  "The Tale of Tamiyo": {
    abilities: [
      chapter([1, 2, 3], [fx.millWhileShared], { label: "Mill two cards (and repeat if they share a type)" }),
      chapter([4], [fx.exileCard(ref.target(), { name: "c" }), fx.castCopiesFree([ref.stored("c")], 99)], {
        targets: [
          target.upTo(
            20,
            target.cardInGraveyard(
              "t",
              { anyOf: [{ types: ["Instant", "Sorcery"] }, { types: ["Planeswalker"], subtype: "Tamiyo" }] },
              "you",
              "instant, sorcery, or Tamiyo card",
            ),
          ),
        ],
      }),
    ],
  },
  "Unable to Scream": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { loseAllAbilities: true, addTypes: ["Artifact", "Creature"], addSubtypes: ["Toy"], setPower: 0, setToughness: 2 },
        { label: "Loses its abilities, 0/2 Toy" },
      ),
      // "As long as enchanted creature is face down, it can't be turned face up" (granted after "loses all abilities").
      staticAbility(
        { attached: "host", faceDown: true },
        { addKeywords: ["cantBeTurnedFaceUp"] },
        { label: "Can't be turned face up" },
      ),
    ],
  },

  // Black
  "Come Back Wrong": {
    spell: spell(
      [target.creature()],
      [
        fx.destroy(ref.target(), "d"),
        fx.moveTo(ref.stored("d"), { to: "battlefield", underYourControl: true }, { name: "b", filter: { types: ["Creature"] } }),
        fx.delayed([fx.sacrificeIt(ref.target("b"))], { b: ref.stored("b") }),
      ],
    ),
  },
  "Cynical Loner": {
    abilities: [
      blockAbility(block.notBy({ subtype: "Glimmer" }, "Can't be blocked by Glimmers")),
      survival([...fx.may("Search for a card to put into your graveyard?", fx.search({}, { to: "graveyard" }))], {
        label: "Put a card from your library into your graveyard",
      }),
    ],
  },
  "Doomsday Excruciator": {
    abilities: [
      triggered(when.entersSelf, [fx.exileLibraryButBottom(ref.eachPlayer, 6)], {
        condition: cond.wasCast,
        label: "Each player exiles their library except the bottom six cards",
      }),
      triggered(when.yourUpkeep, [fx.draw(1)], { label: "Draw a card" }),
    ],
  },
  "Let's Play a Game": {
    spell: modal(
      mode("Creatures your opponents control -1/-1", [], LETS_PLAY.minus),
      mode("Each opponent discards two cards", [], LETS_PLAY.discard),
      mode("Drain 3", [], LETS_PLAY.drain),
      { ...mode("-1/-1 and discard", [], [...LETS_PLAY.minus, ...LETS_PLAY.discard]), condition: cond.delirium },
      { ...mode("-1/-1 and drain", [], [...LETS_PLAY.minus, ...LETS_PLAY.drain]), condition: cond.delirium },
      { ...mode("Discard and drain", [], [...LETS_PLAY.discard, ...LETS_PLAY.drain]), condition: cond.delirium },
      {
        ...mode("All three modes", [], [...LETS_PLAY.minus, ...LETS_PLAY.discard, ...LETS_PLAY.drain]),
        condition: cond.delirium,
      },
    ),
  },
  "Leyline of the Void": {
    leyline: true,
    abilities: [graveyardReplacement({ graveyardOf: "opponent", label: "What would go to an opponent's graveyard is exiled" })],
  },
  "Meathook Massacre II": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, amount.sourceX)], {
        label: "Each player sacrifices X creatures",
      }),
      triggered(
        when.dies(CREATURE_YOU_CONTROL),
        [
          ...fx.mayPayLife(
            3,
            "Pay 3 life to return it?",
            fx.toBattlefield(ref.eventObject, { underYourControl: true, counters: { kind: "finality", n: 1 } }),
          ),
        ],
        { label: "Pay 3 life: it returns (finality)" },
      ),
      triggered(
        when.dies({ types: ["Creature"], controller: "opponent" }),
        [
          ...fx.unlessPays(
            ref.eventPlayer,
            { life: 3 },
            fx.toBattlefield(ref.eventObject, { underYourControl: true, counters: { kind: "finality", n: 1 } }),
          ),
        ],
        { label: "Unless they pay 3 life, it returns under your control" },
      ),
    ],
  },
  "Nowhere to Run": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -3, -3)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-3/-3",
      }),
      playerStatic({ ignoreOpponentsHexproofWard: true, label: "Ignores opponents' hexproof and ward" }),
    ],
  },
  "Osseous Sticktwister": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.punisher(ref.eachOpponent, 0, {
            discard: true,
            sacrifice: { notTypes: ["Land"] },
            damage: amount.powerOf(ref.self),
          }),
        ],
        { condition: cond.delirium, label: "Delirium — sacrifice, discard or damage" },
      ),
    ],
  },
  "Sporogenic Infection": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.target(), { types: ["Creature"], attached: "notHost" })], {
        targets: [target.player()],
        label: "They sacrifice another creature",
      }),
      triggered(when.attachedIsDealtDamage, [fx.destroy(ref.attached)], { label: "Destroy the enchanted creature" }),
    ],
  },

  // Red
  "Charred Foyer": {
    abilities: [triggered(when.yourUpkeep, [fx.impulse(1)], { label: "Exile the top card, playable this turn" })],
  },
  "Cursed Recording": {
    abilities: [
      triggered(
        when.castSpell("you", INSTANT_SORCERY),
        [
          fx.counters(ref.self, "time", 1),
          ...fx.when(cond.counterAtLeast("time", 7), fx.removeCounters(ref.self, 99, "time"), fx.damage(20, ref.you)),
        ],
        { label: "Time counter; at seven, 20 damage" },
      ),
      activated({ tap: true, effects: [fx.copyNextSpell], label: "Copy the next instant or sorcery" }),
    ],
  },
  "Grab the Prize": {
    additionalCost: { discard: 1 },
    spell: spell(
      [],
      [fx.draw(2), ...fx.when(cond.refMatches(ref.costDiscarded, { notTypes: ["Land"] }), fx.damage(2, ref.eachOpponent))],
    ),
  },
  "Leyline of Resonance": {
    leyline: true,
    abilities: [
      triggered(
        // "that targets only a single creature you control": a single target, one of your creatures.
        { on: "castSpell", by: "you", filter: INSTANT_SORCERY, targeting: { objects: CREATURE_YOU_CONTROL }, singleTarget: true },
        [fx.copySpell(ref.eventObject, 1)],
        { label: "Copy that spell" },
      ),
    ],
  },
  "Screaming Nemesis": {
    abilities: [
      triggered(when.isDealtDamage, [fx.damage(amount.eventAmount, ref.target()), fx.cantGainLife(ref.target())], {
        targets: [
          {
            id: "t",
            label: "another target",
            filter: { players: "any", objects: { types: ["Creature", "Planeswalker", "Battle"], other: true } },
          },
        ],
        label: "That much damage; that player can't gain life",
      }),
    ],
  },
  "Waltz of Rage": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.damageAll(amount.powerOf(ref.target()), { types: ["Creature"] }, undefined, ref.target()),
        fx.emblem(
          "Waltz of Rage",
          "Until end of turn, whenever a creature you control dies, exile the top card of your library. You may play it until the end of your next turn.",
          [triggered(when.dies(CREATURE_YOU_CONTROL), [fx.impulse(1, "yourNextTurn")], { label: "Exile the top card" })],
          false,
          true,
        ),
      ],
    ),
  },

  // Green
  Anthropede: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.may(
            "Discard a card to destroy a Room?",
            fx.discard(1, ref.you, { store: "d" }),
            ...fx.when(
              cond.v("d"),
              fx.reflexive([target.permanent("t", ["Enchantment"], { subtype: "Room" }, "Room")], [fx.destroy(ref.target())]),
            ),
          ),
          ...fx.when(
            cond.not(cond.v("d")),
            fx.mayPay(
              "{2}",
              "Pay {2} to destroy a Room?",
              fx.reflexive([target.permanent("t", ["Enchantment"], { subtype: "Room" }, "Room")], [fx.destroy(ref.target())]),
            ),
          ),
        ],
        { label: "Discard or pay {2}: destroy a Room" },
      ),
    ],
  },
  "Cathartic Parting": {
    spell: spell(
      [
        target.permanent(
          "t",
          ["Artifact", "Enchantment"],
          { controller: "opponent" },
          "artifact or enchantment an opponent controls",
        ),
        target.upTo(4, target.cardInGraveyard("g")),
      ],
      [
        fx.moveTo(ref.target(), { to: "libraryTop", shuffle: true }),
        fx.moveTo(ref.target("g"), { to: "libraryTop", shuffle: true }),
      ],
    ),
  },
  "Coordinated Clobbering": {
    spell: spell(
      [
        target.between(1, 2, target.creature("a", { controller: "you", tapped: false })),
        target.creature("t", { controller: "opponent" }),
      ],
      [fx.tap(ref.target("a")), fx.eachOfDealsDamage(ref.target("a"), ref.target("t"))],
    ),
  },
  "Cryptid Inspector": {
    abilities: [
      triggered(when.enters({ controller: "you", faceDown: true }), [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
      triggered(when.permanentTurnedFaceUp({ controller: "you" }), [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
    ],
  },
  "Hauntwoods Shrieker": {
    abilities: [
      triggered(when.attacksSelf, [fx.manifestDread], { label: "Manifest dread" }),
      activated({
        mana: "{1}{G}",
        targets: [{ id: "t", label: "face-down permanent", filter: { objects: { faceDown: true } } }],
        effects: [fx.revealFaceDown(ref.target())],
        label: "Reveal a face-down permanent",
      }),
    ],
  },
  "Hedge Shredder": {
    abilities: [
      triggered(when.attacksSelf, [...fx.may("Mill two cards?", fx.mill(2))], { label: "Mill two cards" }),
      triggered(
        when.zoneChange(["library"], { to: ["graveyard"], filter: { types: ["Land"] }, whose: "you" }),
        [fx.toBattlefield(ref.eventObject, { tapped: true })],
        { label: "The milled land enters tapped" },
      ),
    ],
  },
  "Insidious Fungus": {
    abilities: [
      activated({
        mana: "{2}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact"], {}, "artifact")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy one artifact",
      }),
      activated({
        mana: "{2}",
        sacrifice: true,
        targets: [target.permanent("t", ["Enchantment"], {}, "enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy one enchantment",
      }),
      activated({
        mana: "{2}",
        sacrifice: true,
        effects: [
          fx.draw(1),
          fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { min: 0, prompt: "A land" }),
        ],
        label: "Draw, then a land from your hand tapped",
      }),
    ],
  },
  "Omnivorous Flytrap": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [
            fx.countersDivided(2, ref.target()),
            ...fx.when(cond.amountAtLeast(amount.cardTypesInGraveyard, 6), fx.doubleCounters(ref.target())),
          ],
          {
            condition: cond.delirium,
            targets: [target.between(1, 2, target.creature())],
            label: "Delirium — two +1/+1 counters divided",
          },
        ),
      ),
    ],
  },
  "Overgrown Zealot": {
    abilities: [manaAbility([...ANY_COLOR]), manaAbility([...ANY_COLOR], 2, { restriction: { ability: ["turnFaceUp"] } })],
  },
  "Rootwise Survivor": {
    abilities: [
      survival(
        [
          fx.addCounters(ref.target(), 3),
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 0, setToughness: 0 },
            "permanent",
          ),
          fx.modify(ref.target(), { addKeywords: ["haste"] }, "untilYourNextTurn"),
        ],
        {
          targets: [target.upTo(1, target.permanent("t", ["Land"], { controller: "you" }, "land you control"))],
          label: "A land becomes a 0/0 creature with three counters",
        },
      ),
    ],
  },
  "Say Its Name": {
    spell: spell(
      [],
      [
        fx.mill(3),
        fx.pickFromZone("graveyard", { types: ["Creature", "Land"] }, { to: "hand" }, { min: 0, prompt: "A creature or a land" }),
      ],
    ),
    abilities: [
      activated({
        fromGraveyard: true,
        exileSelf: true,
        exileFromGraveyard: { filter: { name: "Say Its Name" }, count: 2 },
        sorcerySpeed: true,
        effects: [
          fx.pickFromZone("graveyard", { name: "Altanak, the Thrice-Called" }, { to: "battlefield" }, { min: 0, store: "g" }),
          ...fx.when(
            cond.not(cond.v("g")),
            fx.pickFromZone("hand", { name: "Altanak, the Thrice-Called" }, { to: "battlefield" }, { min: 0, store: "h" }),
          ),
          ...fx.when(
            cond.all(cond.not(cond.v("g")), cond.not(cond.v("h"))),
            fx.search({ name: "Altanak, the Thrice-Called" }, { to: "battlefield" }),
          ),
        ],
        label: "Search for Altanak",
      }),
    ],
  },
  "Threats Around Every Corner": {
    abilities: [
      triggered(when.entersSelf, [fx.manifestDread], { label: "Manifest dread" }),
      triggered(
        when.enters({ controller: "you", faceDown: true }),
        [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        {
          label: "A tapped basic land",
        },
      ),
    ],
  },
  "Tyvar, the Pummeler": {
    abilities: [
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 1 },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Tap another creature: indestructible",
      }),
      activated({
        mana: "{3}{G}{G}",
        effects: [fx.pumpAll(CREATURE_YOU_CONTROL, amount.maxPower(CREATURE_YOU_CONTROL), amount.maxPower(CREATURE_YOU_CONTROL))],
        label: "Your creatures +X/+X (greatest power)",
      }),
    ],
  },
  "Valgavoth's Onslaught": {
    spell: spell([], [fx.manifestDreadBy({ times: amount.x, store: "m" }), fx.addCounters(ref.stored("m"), amount.x)]),
  },
  "Walk-In Closet": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", what: "lands" },
        label: "You may play lands from your graveyard",
      }),
    ],
  },
  "Forgotten Cellar": {
    abilities: [
      triggered(
        when.unlockThisDoor,
        [
          fx.emblem(
            "Forgotten Cellar",
            "This turn, you may cast spells from your graveyard, and if a card would be put into your graveyard from anywhere, exile it instead.",
            [playerStatic({ playFrom: { zone: "graveyard", what: "spells" } }), graveyardReplacement({ graveyardOf: "you" })],
            false,
            true,
          ),
        ],
        { label: "Spells from your graveyard this turn" },
      ),
    ],
  },

  // Multicolored
  "Beastie Beatdown": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("t", { controller: "opponent" })],
      [
        ...fx.when(cond.delirium, fx.addCounters(ref.target("a"), 2)),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("t"), ref.target("a")),
      ],
    ),
  },
  "Disturbing Mirth": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { ...CREATURE_OR_ENCHANTMENT, other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(2)),
        ],
        { label: "Sacrifice: draw two cards" },
      ),
      triggered(when.sacrifice({ self: true }), [fx.manifestDread], { label: "Manifest dread" }),
    ],
  },
  "Growing Dread": {
    abilities: [
      triggered(when.entersSelf, [fx.manifestDread], { label: "Manifest dread" }),
      triggered(when.permanentTurnedFaceUp({ controller: "you" }), [fx.addCounters(ref.eventObject, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Inquisitive Glimmer": {
    abilities: [
      costReducer({ types: ["Enchantment"] }, 1, "Your enchantment spells cost {1} less"),
      playerStatic({ abilityCost: { ability: "unlock", reduce: 1 }, label: "Unlocking costs you {1} less" }),
    ],
  },
  "Nashi, Searcher in the Dark": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.mill(amount.eventAmount, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { anyOf: [{ legendary: true }, { types: ["Enchantment"] }] },
            { to: "hand" },
            {
              count: amount.eventAmount,
              min: 0,
              pool: ref.stored("m"),
              store: "p",
              prompt: "Legendary or enchantment cards",
            },
          ),
          ...fx.when(cond.not(cond.v("p")), fx.addCounters(ref.self, 1)),
        ],
        { label: "Mill that many; legendaries and enchantments into your hand" },
      ),
    ],
  },
  "Niko, Light of Hope": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SHARD, 2)], { label: "Two Shard tokens" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { controller: "you", legendary: false })],
        effects: [
          fx.exileCard(ref.target(), { name: "x" }),
          fx.becomeCopy(ref.permanentsOf(ref.you, { subtype: "Shard" }), ref.stored("x")),
          fx.delayed([fx.toBattlefield(ref.target("x"))], { x: ref.stored("x") }),
        ],
        label: "Exile a creature: your Shards become copies of it",
      }),
    ],
  },
  "Oblivious Bookworm": {
    abilities: [
      triggered(
        when.yourEndStep,
        [...fx.may("Draw a card?", fx.draw(1), ...fx.when(cond.not(cond.faceDownOrUp), fx.discard(1)))],
        { label: "Draw (then discard, unless face down this turn)" },
      ),
    ],
  },
  "Rip, Spawn Hunter": {
    abilities: [
      survival(
        [
          fx.lookAtTop(amount.powerOf(ref.self), {
            filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Vehicle" }] },
            count: amount.powerOf(ref.self),
            distinctPower: true,
            revealAll: true,
            rest: "bottom",
          }),
        ],
        { label: "Creatures and Vehicles among the top X" },
      ),
    ],
  },
  "Sawblade Skinripper": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { ...CREATURE_OR_ENCHANTMENT, other: true } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifice: +1/+1 counter",
      }),
      triggered(when.yourEndStep, [fx.damage(amount.sacrificedThisTurn, ref.target())], {
        condition: cond.sacrificedThisTurn,
        targets: [target.any()],
        label: "Damage equal to the sacrificed permanents",
      }),
    ],
  },
  "Misty Salon": {
    abilities: [
      triggered(
        when.unlockThisDoor,
        [
          fx.createXXToken(
            { name: "Spirit", colors: ["U"], types: ["Creature"], subtypes: ["Spirit"], keywords: ["flying"] },
            amount.unlockedDoors,
          ),
        ],
        { label: "X/X flying Spirit" },
      ),
    ],
  },
  "Victor, Valgavoth's Seneschal": {
    abilities: [
      eerie(
        [
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), fx.surveil(2)),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.discard(1, ref.eachOpponent)),
          ...fx.when(
            cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))),
            fx.pickFromZone(
              "graveyard",
              { types: ["Creature"] },
              { to: "battlefield", underYourControl: true },
              {
                pool: ref.allGraveyards,
                prompt: "A creature card from a graveyard",
              },
            ),
          ),
        ],
        { label: "Surveil 2, discard, then reanimation" },
      ),
    ],
  },
  "Zimone, All-Questioning": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.createTokens(PRIMO, 1, undefined, "p"),
          fx.addCounters(ref.stored("p"), amount.count({ types: ["Land"], controller: "you" })),
        ],
        {
          condition: cond.all(
            cond.amountAtLeast(amount.landsEnteredThisTurn, 1),
            cond.prime(amount.count({ types: ["Land"], controller: "you" })),
          ),
          label: "Primo, with as many counters as lands",
        },
      ),
    ],
  },

  // Artifacts
  "Found Footage": {
    abilities: [
      playerStatic({ lookAt: "faceDown", label: "You see opponents' face-down creatures" }),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.surveil(2), fx.draw(1)], label: "Surveil 2, draw" }),
    ],
  },
  Saw: {
    abilities: [
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
      triggered(
        when.attacks({ attached: "host" }),
        [
          fx.sacrifice(ref.you, { other: true, attached: "notHost" }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.draw(1)),
        ],
        { label: "Sacrifice another permanent: draw" },
      ),
    ],
  },
};
