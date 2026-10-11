/** Foundations — blue cards. */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  castPermission,
  cond,
  costReducer,
  DRAKE,
  doesntUntap,
  FAERIE,
  flashback,
  flashFor,
  flashForAll,
  fx,
  INSTANT_SORCERY,
  kicker,
  manaAbility,
  playerStatic,
  prevention,
  ref,
  SCION_OF_THE_DEEP,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Think Twice": { castOptions: [flashback("{2}{U}")], spell: spell([], [fx.draw(1)]) },
  Opt: { spell: spell([], [fx.scry(1), fx.draw(1)]) },
  "Arcane Epiphany": {
    costReduction: { generic: 1, condition: cond.controls({ subtype: "Wizard" }) },
    spell: spell([], [fx.draw(3)]),
  },
  "Archmage of Runes": {
    abilities: [
      costReducer(INSTANT_SORCERY, 1, "Instants and sorceries: {1} less"),
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.draw(1)], { label: "draw a card" }),
    ],
  },
  "Bigfin Bouncer": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "returns an opponent's creature",
      }),
    ],
  },
  "Cephalid Inkmage": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(3)], { label: "surveil 3" }),
      staticAbility("self", { addKeywords: ["unblockable"] }, { condition: cond.threshold, label: "Threshold: unblockable" }),
    ],
  },
  "Clinquant Skymage": {
    abilities: [triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" })],
  },
  "Drake Hatcher": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.counters(ref.self, "incubation", amount.eventAmount)], {
        label: "incubation counters",
      }),
      activated({
        removeCounters: { kind: "incubation", n: 3 },
        effects: [fx.createTokens(DRAKE)],
        label: "2/2 flying Drake (3 counters)",
      }),
    ],
  },
  "Erudite Wizard": {
    abilities: [triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" })],
  },
  "Faebloom Trick": {
    spell: spell(
      [],
      [fx.createTokens(FAERIE, 2), fx.reflexive([target.creature("t", { controller: "opponent" })], [fx.tap(ref.target())])],
    ),
  },
  "Grappling Kraken": {
    abilities: [
      triggered(when.landfall, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "taps and stuns",
      }),
    ],
  },
  "High Fae Trickster": { abilities: [flashForAll("Your spells have flash")] },
  "Homunculus Horde": {
    abilities: [triggered(when.draw(2), [fx.copyToken(ref.self)], { label: "token copy" })],
  },
  "Icewind Elemental": { abilities: [triggered(when.entersSelf, fx.loot(1), { label: "draws then discards" })] },
  "Inspiration from Beyond": {
    castOptions: [flashback("{5}{U}{U}")],
    spell: spell(
      [],
      [
        fx.mill(3),
        fx.pickFromZone("graveyard", INSTANT_SORCERY, { to: "hand" }, { prompt: "Return an instant or a sorcery to hand" }),
      ],
    ),
  },
  "Kiora, the Rising Tide": {
    abilities: [
      triggered(when.entersSelf, fx.loot(2), { label: "draw 2, discard 2" }),
      triggered(when.attacksSelf, fx.may("Create Scion of the Deep (8/8)?", fx.createTokens(SCION_OF_THE_DEEP)), {
        condition: cond.threshold,
        label: "Threshold: Scion of the Deep",
      }),
    ],
  },
  "Lunar Insight": { spell: spell([], [fx.draw(amount.differentManaValues)]) },
  "Mischievous Mystic": {
    abilities: [triggered(when.draw(2), [fx.createTokens(FAERIE)], { label: "1/1 flying Faerie" })],
  },
  "Rune-Sealed Wall": { abilities: [activated({ tap: true, effects: [fx.surveil(1)], label: "Surveil 1" })] },
  "Skyship Buccaneer": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: cond.raid, label: "Raid: draw a card" })],
  },
  "Strix Lookout": {
    abilities: [activated({ mana: "{1}{U}", tap: true, effects: fx.loot(1), label: "Draw then discard" })],
  },
  "Uncharted Voyage": { spell: spell([target.creature()], [fx.topOrBottom(ref.target()), fx.surveil(1)]) },
  Aetherize: {
    spell: spell([], [fx.moveAll("battlefield", ref.eachPlayer, { types: ["Creature"], attacking: true }, { to: "hand" })]),
  },
  "Brineborn Cutthroat": {
    abilities: [
      triggered(when.castSpell("you"), [fx.addCounters(ref.self, 1)], {
        condition: cond.opponentsTurn,
        label: "a +1/+1 counter",
      }),
    ],
  },
  "Extravagant Replication": {
    abilities: [
      triggered(when.yourUpkeep, [fx.copyToken(ref.target())], {
        targets: [targetObj("t", { controller: "you", notTypes: ["Land"], other: true }, "other nonland permanent of yours")],
        label: "token copy",
      }),
    ],
  },
  "Fleeting Distraction": { spell: spell([target.creature()], [fx.pump(ref.target(), -1, 0), fx.draw(1)]) },
  "Lightshell Duo": { abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "surveil 2" })] },
  Micromancer: {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Search for an instant or a sorcery with value 1?", fx.search({ ...INSTANT_SORCERY, manaValue: 1 })),
        { label: "searches for a spell with value 1" },
      ),
    ],
  },
  "Mocking Sprite": { abilities: [costReducer(INSTANT_SORCERY, 1, "Instants and sorceries: {1} less")] },
  "Run Away Together": {
    spell: spell(
      [{ ...target.exactly(2, target.creature()), differentPlayers: true, label: "two creatures of different players" }],
      [fx.bounce(ref.target())],
    ),
  },
  "Self-Reflection": {
    castOptions: [flashback("{3}{U}")],
    spell: spell([target.creature("t", { controller: "you" })], [fx.copyToken(ref.target())]),
  },
  Refute: { spell: spell([target.spell()], [fx.counter(ref.target()), ...fx.loot(1)]) },
  "Essence Scatter": {
    spell: spell([target.spell("t", { types: ["Creature"] }, "creature spell")], [fx.counter(ref.target())]),
  },
  "An Offer You Can't Refuse": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
      [fx.counter(ref.target()), fx.createTokens(TREASURE, 2, ref.controllerOf(ref.target()))],
    ),
  },
  "Tolarian Terror": { costReduction: { generic: amount.countIn("graveyard", INSTANT_SORCERY) } },
  "Imprisoned in the Moon": {
    enchant: {
      filter: { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }, { types: ["Planeswalker"] }] },
      label: "creature, land or planeswalker",
    },
    abilities: [
      staticAbility(
        "attached",
        { setTypes: ["Land"], setSubtypes: [], setColors: [], loseAllAbilities: true, addAbilities: [manaAbility("C")] },
        { label: 'Colorless land "{T}: Add {C}"' },
      ),
    ],
  },
  "Witness Protection": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        {
          loseAllAbilities: true,
          setTypes: ["Creature"],
          setSubtypes: ["Citizen"],
          setColors: ["G", "W"],
          setPower: 1,
          setToughness: 1,
          setName: "Legitimate Businessperson",
        },
        { label: "1/1 Citizen with no abilities" },
      ),
    ],
  },
  "Spectral Sailor": { abilities: [activated({ mana: "{3}{U}", effects: [fx.draw(1)], label: "Draw a card" })] },
  "Curator of Destinies": {
    rules: { cantBeCountered: true },
    abilities: [triggered(when.entersSelf, [fx.piles(5)], { label: "two piles" })],
  },
  "Sphinx of Forgotten Lore": {
    abilities: [
      triggered(when.attacksSelf, [fx.grantFlashback(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery in your graveyard")],
        label: "flashback granted",
      }),
    ],
  },
  Omniscience: { abilities: [castPermission({ freeFrom: "hand", label: "Spells from your hand without paying their cost" })] },
  "Time Stop": { spell: spell([], [fx.endTurn]) },

  // --- Reprints ---
  "Arcanis the Omnipotent": {
    abilities: [
      activated({ tap: true, effects: [fx.draw(3)], label: "Draw three cards" }),
      activated({ mana: "{2}{U}{U}", effects: [fx.toHand(ref.self)], label: "Return to hand" }),
    ],
  },
  "Burrog Befuddler": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), -1, 0)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "-1/-0",
      }),
    ],
  },
  Cancel: { spell: spell([target.spell()], [fx.counter(ref.target())]) },
  "Chart a Course": {
    spell: spell([], [fx.draw(2), ...fx.when(cond.not(cond.raid), fx.discard(1))]),
  },
  Confiscate: {
    enchant: { filter: { permanent: true }, label: "permanent" },
    rules: { controlsEnchanted: true },
  },
  "Corsair Captain": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(TREASURE)], { label: "Treasure" }),
      staticAbility(
        { types: ["Creature"], subtype: "Pirate", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Other Pirates +1/+1",
        },
      ),
    ],
  },
  "Dictate of Kruphix": {
    abilities: [triggered(when.step("draw", "any"), [fx.draw(1, ref.eventPlayer)], { label: "one more card" })],
  },
  "Dive Down": {
    spell: spell([target.creature("t", { controller: "you" })], [fx.pump(ref.target(), 0, 3, ["hexproof"])]),
  },
  "Eaten by Piranhas": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { loseAllAbilities: true, setSubtypes: ["Skeleton"], setColors: ["B"], setPower: 1, setToughness: 1 },
        { label: "1/1 black Skeleton with no abilities" },
      ),
    ],
  },
  "Exclusion Mage": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "returns an opponent's creature",
      }),
    ],
  },
  "Finale of Revelation": {
    spell: spell(
      [],
      [
        ...fx.when(cond.not(cond.xAtLeast(10)), fx.draw(amount.x)),
        ...fx.when(
          cond.xAtLeast(10),
          fx.moveAll("graveyard", ref.you, {}, { to: "libraryTop" }),
          fx.shuffle(),
          fx.draw(amount.x),
          fx.untapUpTo({ types: ["Land"] }, 5),
          fx.emblem("Finale of Revelation", msg("ctx:Finale of Revelation|You have no maximum hand size."), [
            playerStatic({ maxHandSize: "none" }),
          ]),
        ),
        fx.exileOnResolve,
      ],
    ),
  },
  Flashfreeze: {
    spell: spell([target.spell("t", { colors: ["R", "G"] }, "red or green spell")], [fx.counter(ref.target())]),
  },
  "Fog Bank": {
    abilities: [
      prevention({ self: true }, { combatOnly: true, label: "Combat damage dealt to it prevented" }),
      prevention({}, { combatOnly: true, source: { self: true }, label: "Combat damage it deals prevented" }),
    ],
  },
  "Gateway Sneak": {
    abilities: [
      triggered(when.enters({ subtype: "Gate", controller: "you" }), [fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "unblockable this turn",
      }),
      triggered(when.combatDamageToPlayer, [fx.draw(1)], { label: "draw a card" }),
    ],
  },
  "Harbinger of the Tides": {
    castOptions: [flashFor("{2}")],
    abilities: [
      triggered(when.entersSelf, fx.may("Return the target tapped creature?", fx.bounce(ref.target())), {
        targets: [targetObj("t", { types: ["Creature"], controller: "opponent", tapped: true }, "opponent's tapped creature")],
        label: "returns a tapped creature",
      }),
    ],
  },
  "Into the Roil": {
    kicker: kicker("{1}{U}"),
    spell: spell([target.nonland()], [fx.toHand(ref.target()), ...fx.when(cond.kicked, fx.draw(1))]),
  },
  "Kitesail Corsair": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.sourceMatches({ attacking: true }), label: "Flying while attacking" },
      ),
    ],
  },
  "Mystic Archaeologist": {
    abilities: [activated({ mana: "{3}{U}{U}", effects: [fx.draw(2)], label: "Draw two cards" })],
  },
  "Mystical Teachings": {
    castOptions: [flashback("{5}{B}")],
    spell: spell([], [fx.search({ anyOf: [{ types: ["Instant"] }, { keyword: "flash" }] })]),
  },
  Negate: { spell: spell([target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")], [fx.counter(ref.target())]) },
  "Quick Study": { spell: spell([], [fx.draw(2)]) },
  "Rite of Replication": {
    kicker: kicker("{5}"),
    spell: spell([target.creature()], [fx.copyToken(ref.target(), { count: amount.kicked(5, 1) })]),
  },
  "River's Rebuke": {
    spell: spell([target.player()], [fx.moveAll("battlefield", ref.target(), { notTypes: ["Land"] }, { to: "hand" })]),
  },
  "Shipwreck Dowser": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery in your graveyard")],
        label: "gets back an instant or a sorcery",
      }),
    ],
  },
  "Sphinx of the Final Word": {
    rules: { cantBeCountered: true },
    abilities: [
      playerStatic({
        uncounterable: { filter: { types: ["Instant", "Sorcery"] } },
        label: "Your instants and sorceries can't be countered",
      }),
    ],
  },
  "Starlight Snare": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "taps the creature" }), doesntUntap("attached")],
  },
  "Storm Fleet Spy": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { condition: cond.raid, label: "Raid: draw a card" })],
  },
  "Tempest Djinn": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        { per: { subtype: "Island", basic: true, controller: "you" }, label: "+1/+0 for each basic Island" },
      ),
    ],
  },
  Unsummon: { spell: spell([target.creature()], [fx.bounce(ref.target())]) },
  "Voracious Greatshark": {
    abilities: [
      triggered(when.entersSelf, [fx.counter(ref.target())], {
        targets: [target.spell("t", { types: ["Artifact", "Creature"] }, "artifact or creature spell")],
        label: "counters a spell",
      }),
    ],
  },
};
