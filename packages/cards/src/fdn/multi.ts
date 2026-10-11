/** Foundations — multicolored cards. */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  castPermission,
  cmp,
  cond,
  ELF_WARRIOR,
  entersWith,
  fx,
  graveyardReplacement,
  INSTANT_SORCERY,
  KOMAS_COIL,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  PHYREXIAN_GOBLIN,
  playerStatic,
  protection,
  protectionAbility,
  ref,
  SOLDIER,
  SPIRIT,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
} from "./common";

export const MULTI: Record<string, CardScript> = {
  "Alesha, Who Laughs at Fate": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
      triggered(when.yourEndStep, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], compare: [cmp.manaValue("<=", amount.sourcePower)] },
            "you",
            "creature with mana value ≤ Alesha's power",
          ),
        ],
        condition: cond.raid,
        label: "Raid: reanimates a creature",
      }),
    ],
  },
  "Koma, World-Eater": {
    rules: { cantBeCountered: true },
    abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(KOMAS_COIL, 4)], { label: "four 3/3 Koma's Coils" })],
  },
  "Anthem of Champions": { abilities: [staticAbility(CREATURE_YOU_CONTROL, { power: 1, toughness: 1 })] },
  "Ashroot Animist": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), amount.powerOf(ref.self), amount.powerOf(ref.self), ["trample"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+X/+X, trample",
      }),
    ],
  },
  "Dreadwing Scavenger": {
    abilities: [
      triggered(when.entersSelf, fx.loot(1), { label: "draws then discards" }),
      triggered(when.attacksSelf, fx.loot(1), { label: "draws then discards" }),
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        { condition: cond.threshold, label: "Threshold: +1/+1 and deathtouch" },
      ),
    ],
  },
  "Fiendish Panda": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
      triggered(when.diesSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], notSubtype: "Bear", compare: [cmp.manaValue("<=", amount.sourcePower)] },
            "you",
            "non-Bear creature with mana value ≤ its power",
          ),
        ],
        label: "reanimates a creature",
      }),
    ],
  },
  "Kykar, Zephyr Awakener": {
    abilities: [
      triggeredModal(when.castSpell("you", { notTypes: ["Creature"] }), [
        mode(
          "Exile another creature (it returns at the end step)",
          [target.creature("t", { controller: "you", other: true })],
          [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        ),
        mode("1/1 flying Spirit", [], [fx.createTokens(SPIRIT)]),
      ]),
    ],
  },
  "Perforating Artist": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.eachOpponent, 3, { discard: true, sacrifice: { notTypes: ["Land"] } })], {
        condition: cond.raid,
        label: "Raid: 3 life unless sacrifice or discard",
      }),
    ],
  },
  "Wardens of the Cycle": {
    abilities: [
      triggeredModal(
        when.yourEndStep,
        [mode("You gain 2 life", [], [fx.gainLife(2)]), mode("Draw, lose 1 life", [], [fx.draw(1), fx.loseLife(1)])],
        { condition: cond.morbid, label: "Morbid" },
      ),
    ],
  },
  "Zimone, Paradox Sculptor": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature("t", { controller: "you" }))],
        label: "+1/+1 counters",
      }),
      activated({
        mana: "{G}{U}",
        tap: true,
        targets: [
          target.upTo(2, targetObj("t", { types: ["Creature", "Artifact"], controller: "you" }, "creature or artifact of yours")),
        ],
        effects: [fx.doubleAllCounters(ref.target())],
        label: "Double the counters",
      }),
    ],
  },
  "Balmor, Battlemage Captain": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.pumpAll({ controller: "you" }, 1, 0, ["trample"])], {
        label: "your creatures +1/+0 and trample",
      }),
    ],
  },
  "Empyrean Eagle": {
    abilities: [staticAbility({ ...OTHER_CREATURE_YOU_CONTROL, keyword: "flying" }, { power: 1, toughness: 1 })],
  },
  "Good-Fortune Unicorn": {
    abilities: [
      triggered(when.enters(OTHER_CREATURE_YOU_CONTROL), [fx.addCounters(ref.eventObject, 1)], { label: "a +1/+1 counter" }),
    ],
  },
  "Heroic Reinforcements": {
    spell: spell([], [fx.createTokens(SOLDIER, 2), fx.pumpAll({ controller: "you" }, 1, 1, ["haste"])]),
  },
  "Lathril, Blade of the Elves": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.createTokens(ELF_WARRIOR, amount.eventAmount)], { label: "Elf Warriors" }),
      activated({
        tap: true,
        tapOthers: { filter: { subtype: "Elf" }, count: 10 },
        effects: fx.drain(10),
        label: "Tap ten Elves: drains 10",
      }),
    ],
  },
  "Ruby, Daring Tracker": {
    abilities: [
      manaAbility(["R", "G"]),
      triggered(when.attacksSelf, [fx.pump(ref.self, 2, 2)], { condition: cond.ferocious, label: "+2/+2" }),
    ],
  },
  "Tatyova, Benthic Druid": {
    abilities: [triggered(when.landfall, [fx.gainLife(1), fx.draw(1)], { label: "+1 life, draw" })],
  },
  "Elenda, Saint of Dusk": {
    abilities: [
      protectionAbility(protection.hexproofFrom({ types: ["Instant"] }, "Hexproof from instants")),
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["menace"] },
        { condition: cond.lifeAboveStart(1), label: "+1/+1, menace" },
      ),
      staticAbility("self", { power: 5, toughness: 5 }, { condition: cond.lifeAboveStart(10), label: "+5/+5" }),
    ],
  },
  "Niv-Mizzet, Visionary": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "No maximum hand size" }),
      triggered(
        when.dealsDamage({}, { anySourceYouControl: true, noncombatOnly: true, to: { players: "opponent" } }),
        [fx.draw(amount.eventAmount)],
        { label: "draw that many cards" },
      ),
    ],
  },
  "Consuming Aberration": {
    cda: { pt: amount.countIn("graveyard", {}, "opponents") },
    abilities: [
      // "Each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards
      // into their graveyard."
      triggered(
        when.castSpell("you"),
        fx.forEachPlayer(ref.eachOpponent, (p) => [
          { op: "revealUntilN", who: p, n: 1, filter: { types: ["Land"] }, to: { to: "graveyard" }, rest: "graveyard" },
        ]),
        { label: "each opponent mills until a land" },
      ),
    ],
  },
  "Muldrotha, the Gravetide": {
    abilities: [castPermission({ graveyardPermanentTypes: true, label: "One permanent of each type from the graveyard" })],
  },
  Progenitus: {
    abilities: [protectionAbility(protection.everything)],
    rules: { shuffleIntoLibrary: true },
  },
  "Thousand-Year Storm": {
    abilities: [
      triggered(when.castSpell("you", INSTANT_SORCERY), [fx.copySpell(ref.eventObject, amount.eventAmount)], {
        label: "copies the spell",
      }),
    ],
  },

  // --- Reprints ---
  "Aurelia, the Warleader": {
    abilities: [
      triggered(when.attacksSelf, [fx.untapUpTo({ types: ["Creature"] }, 99), fx.extraCombat], {
        oncePerTurn: true,
        label: "untaps your creatures, additional combat",
      }),
    ],
  },
  "Ayli, Eternal Pilgrim": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.gainLife(amount.toughnessOf(ref.costSacrificed))],
        label: "Sacrifice a creature: life equal to its toughness",
      }),
      activated({
        mana: "{1}{W}{B}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        activationCondition: cond.lifeAboveStart(10),
        targets: [target.nonland()],
        effects: [fx.exileCard(ref.target())],
        label: "Sacrifice a creature: exile a permanent",
      }),
    ],
  },
  "Boros Charm": {
    spell: modal(
      mode(
        "4 damage to a player or planeswalker",
        [{ id: "t", label: "player or planeswalker", filter: { players: "any", objects: { types: ["Planeswalker"] } } }],
        [fx.damage(4, ref.target())],
      ),
      mode("Your permanents are indestructible", [], [fx.modifyAll({ controller: "you" }, { addKeywords: ["indestructible"] })]),
      mode("Double strike", [target.creature()], [fx.pump(ref.target(), 0, 0, ["doubleStrike"])]),
    ),
  },
  Cloudblazer: { abilities: [triggered(when.entersSelf, [fx.gainLife(2), fx.draw(2)], { label: "+2 life, draw two cards" })] },
  "Deadly Brew": {
    spell: spell(
      [],
      [
        fx.sacrifice(ref.you, { types: ["Creature", "Planeswalker"] }, 1, { store: "mine" }),
        fx.sacrifice(ref.eachOpponent, { types: ["Creature", "Planeswalker"] }),
        ...fx.when(
          cond.v("mine"),
          fx.may(
            "Return another permanent card from your graveyard to hand?",
            fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { excludeStored: "mine" }),
          ),
        ),
      ],
    ),
  },
  "Drogskol Reaver": { abilities: [triggered(when.gainLife, [fx.draw(1)], { label: "draw a card" })] },
  "Dryad Militant": {
    abilities: [
      graveyardReplacement({
        filter: { types: ["Instant", "Sorcery"] },
        label: "Instants and sorceries exiled instead of the graveyard",
      }),
    ],
  },
  "Enigma Drake": { cda: { power: amount.countIn("graveyard", INSTANT_SORCERY) } },
  "Garna, Bloodfist of Keld": {
    abilities: [
      triggered(
        when.dies({ ...CREATURE_YOU_CONTROL, other: true }),
        [
          ...fx.when(cond.eventObjectMatches({ attacking: true }), fx.draw(1)),
          ...fx.when(cond.not(cond.eventObjectMatches({ attacking: true })), fx.damage(1, ref.eachOpponent, ref.self)),
        ],
        { label: "attacking: draw; otherwise 1 damage" },
      ),
    ],
  },
  "Halana and Alena, Partners": {
    abilities: [
      triggered(
        when.yourCombat,
        [fx.addCounters(ref.target(), amount.powerOf(ref.self)), fx.pump(ref.target(), 0, 0, ["haste"])],
        {
          targets: [target.creature("t", { controller: "you", other: true })],
          label: "X counters and haste",
        },
      ),
    ],
  },
  "Immersturm Predator": {
    abilities: [
      triggered(when.tapsSelf, [fx.exileCard(ref.target()), fx.addCounters(ref.self, 1)], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "any"))],
        label: "exiles a card, a +1/+1 counter",
      }),
      activated({
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.pump(ref.self, 0, 0, ["indestructible"]), fx.tap(ref.self)],
        label: "Sacrifice a creature: indestructible, tapped",
      }),
    ],
  },
  "Maelstrom Pulse": { spell: spell([target.nonland()], [fx.destroySameName(ref.target())]) },
  Mortify: {
    spell: spell([targetObj("t", { types: ["Creature", "Enchantment"] }, "creature or enchantment")], [fx.destroy(ref.target())]),
  },
  "Ovika, Enigma Goliath": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [
          fx.createTokens(PHYREXIAN_GOBLIN, amount.manaValueOf(ref.eventObject), undefined, "g"),
          fx.pump(ref.stored("g"), 0, 0, ["haste"]),
        ],
        { label: "X Phyrexian Goblins with haste" },
      ),
    ],
  },
  "Prime Speaker Zegana": {
    abilities: [
      entersWith({
        counters: amount.maxPower({ types: ["Creature"], controller: "you" }),
        label: "Counters: greatest power",
      }),
      triggered(when.entersSelf, [fx.draw(amount.powerOf(ref.self))], { label: "draw as many as its power" }),
    ],
  },
  "Savage Ventmaw": {
    abilities: [
      triggered(when.attacksSelf, [fx.addManaUntilEndOfTurn("R", "R", "R", "G", "G", "G")], { label: "{R}{R}{R}{G}{G}{G}" }),
    ],
  },
  "Teach by Example": { spell: spell([], [fx.copyNextSpell]) },
  "Trygon Predator": {
    abilities: [
      triggered(when.combatDamageToPlayer, fx.may("Destroy the target artifact or enchantment?", fx.destroy(ref.target())), {
        targets: [
          target.optional(
            target.of(
              ref.eventPlayer,
              target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment of that player"),
            ),
          ),
        ],
        label: "destroys an artifact or an enchantment",
      }),
    ],
  },
  "Unflinching Courage": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addKeywords: ["trample", "lifelink"] },
        { label: "+2/+2, trample, lifelink" },
      ),
    ],
  },
  "Wilt-Leaf Liege": {
    rules: { opponentDiscardToBattlefield: true },
    abilities: [
      staticAbility(
        { ...CREATURE_YOU_CONTROL, other: true, colors: ["G"] },
        { power: 1, toughness: 1 },
        { label: "Other green creatures +1/+1" },
      ),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, other: true, colors: ["W"] },
        { power: 1, toughness: 1 },
        { label: "Other white creatures +1/+1" },
      ),
    ],
  },
};
