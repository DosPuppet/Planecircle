/** Foundations — red cards. */
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  DRAGON,
  DRAGON_5,
  doesntUntap,
  entersWith,
  eventReplacement,
  flashback,
  fx,
  GOBLIN,
  INSTANT_SORCERY,
  kicker,
  manaAbility,
  modal,
  mode,
  RAT_NO_BLOCK,
  ref,
  SACRIFICE_TOKEN_AT_END_STEP,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Fanatical Firebrand": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.any()],
        effects: [fx.damage(1, ref.target(), ref.self)],
        label: "1 damage",
      }),
    ],
  },
  "Shivan Dragon": { abilities: [activated({ mana: "{R}", effects: [fx.pump(ref.self, 1, 0)], label: "+1/+0" })] },
  "Burst Lightning": { kicker: kicker("{4}"), spell: spell([target.any()], [fx.damage(amount.kicked(4, 2), ref.target())]) },
  Boltwave: { spell: spell([], [fx.damage(3, ref.eachOpponent)]) },
  Abrade: {
    spell: modal(
      mode("3 damage to a creature", [target.creature()], [fx.damage(3, ref.target())]),
      mode(
        "ctx:infinitive|Destroy an artifact",
        [target.permanent("t", ["Artifact"], {}, "artifact")],
        [fx.destroy(ref.target())],
      ),
    ),
  },
  "Sure Strike": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 0, ["firstStrike"])]) },
  "Kindled Fury": { spell: spell([target.creature()], [fx.pump(ref.target(), 1, 0, ["firstStrike"])]) },
  "Dragon Fodder": { spell: spell([], [fx.createTokens(GOBLIN, 2)]) },
  "Thrill of Possibility": { additionalCost: { discard: 1 }, spell: spell([], [fx.draw(2)]) },
  "Seize the Spoils": { additionalCost: { discard: 1 }, spell: spell([], [fx.draw(2), fx.createTokens(TREASURE)]) },
  "Bulk Up": {
    castOptions: [flashback("{4}{R}{R}")],
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.powerOf(ref.target()), 0)]),
  },
  "Dragonlord's Servant": { abilities: [costReducer({ subtype: "Dragon" }, 1, "Dragons: {1} less")] },
  "Rapacious Dragon": { abilities: [triggered(when.entersSelf, [fx.createTokens(TREASURE, 2)], { label: "two Treasures" })] },
  "Brass's Bounty": { spell: spell([], [fx.createTokens(TREASURE, amount.count({ types: ["Land"], controller: "you" }))]) },
  "Obliterating Bolt": {
    spell: spell(
      [target.permanent("t", ["Creature", "Planeswalker"], {}, "creature or planeswalker")],
      [fx.exileIfDies(ref.target()), fx.damage(4, ref.target())],
    ),
  },
  "Scorching Dragonfire": {
    spell: spell(
      [target.permanent("t", ["Creature", "Planeswalker"], {}, "creature or planeswalker")],
      [fx.exileIfDies(ref.target()), fx.damage(3, ref.target())],
    ),
  },
  "Goblin Boarders": { abilities: [entersWith({ counters: 1, condition: cond.raid, label: "Raid: enters with a counter" })] },
  "Kargan Dragonrider": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["flying"] },
        { condition: cond.controls({ subtype: "Dragon" }), label: "Flying with a Dragon" },
      ),
    ],
  },
  "Goblin Oriflamme": {
    abilities: [staticAbility({ types: ["Creature"], controller: "you", attacking: true }, { power: 1 })],
  },
  "Viashino Pyromancer": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target(), ref.self)], {
        targets: [target.player()],
        label: "2 damage to the target player",
      }),
    ],
  },
  "Dragon Trainer": { abilities: [triggered(when.entersSelf, [fx.createTokens(DRAGON)], { label: "4/4 Dragon" })] },
  "Gorehorn Raider": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target(), ref.self)], {
        targets: [target.any()],
        condition: cond.raid,
        label: "Raid: 2 damage",
      }),
    ],
  },
  "Searslicer Goblin": {
    abilities: [triggered(when.yourEndStep, [fx.createTokens(GOBLIN)], { condition: cond.raid, label: "Raid: Goblin" })],
  },
  "Firebrand Archer": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.damage(1, ref.eachOpponent, ref.self)], {
        label: "1 damage to each opponent",
      }),
    ],
  },
  Guttersnipe: {
    abilities: [
      triggered(when.castSpell("you", { types: ["Instant", "Sorcery"] }), [fx.damage(2, ref.eachOpponent, ref.self)], {
        label: "2 damage to each opponent",
      }),
    ],
  },
  "Impact Tremors": {
    abilities: [
      triggered(when.enters(CREATURE_YOU_CONTROL), [fx.damage(1, ref.eachOpponent, ref.self)], {
        label: "1 damage to each opponent",
      }),
    ],
  },
  "Spitfire Lagac": {
    abilities: [triggered(when.landfall, [fx.damage(1, ref.eachOpponent, ref.self)], { label: "1 damage to each opponent" })],
  },
  "Crackling Cyclops": {
    abilities: [triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 3, 0)], { label: "+3/+0" })],
  },
  "Battle-Rattle Shaman": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 2, 0)], {
        targets: [target.optional(target.creature())],
        label: "+2/+0 to a creature",
      }),
    ],
  },
  "Battlesong Berserker": {
    abilities: [
      triggered(when.attackWith(1), [fx.pump(ref.target(), 1, 0, ["menace"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+0, menace",
      }),
    ],
  },
  "Courageous Goblin": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 1, 0, ["menace"])], { condition: cond.ferocious, label: "+1/+0, menace" }),
    ],
  },
  Electroduplicate: {
    castOptions: [flashback("{2}{R}{R}")],
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.copyToken(ref.target(), { addKeywords: ["haste"], addAbilities: [SACRIFICE_TOKEN_AT_END_STEP] })],
    ),
  },
  "Fiery Annihilation": {
    spell: spell(
      [
        target.creature(),
        {
          ...target.optional(targetObj("e", { subtype: "Equipment" }, "Equipment attached to that creature")),
          attachedToTarget: "t",
        },
      ],
      [fx.exileIfDies(ref.target()), fx.damage(5, ref.target()), fx.exileCard(ref.target("e"))],
    ),
  },
  "Goblin Negotiation": {
    spell: spell(
      [target.creature()],
      [fx.damageStoringExcess(amount.x, ref.target(), "excess"), fx.createTokens(GOBLIN, amount.v("excess"))],
    ),
  },
  "Incinerating Blast": {
    spell: spell(
      [target.creature()],
      [fx.damage(6, ref.target()), fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(1))],
    ),
  },
  "Rite of the Dragoncaller": {
    abilities: [triggered(when.castSpell("you", INSTANT_SORCERY), [fx.createTokens(DRAGON_5)], { label: "5/5 flying Dragon" })],
  },
  "Slumbering Cerberus": {
    abilities: [
      triggered(when.eachEndStep, [fx.untap(ref.self)], { condition: cond.morbid, label: "Morbid: untaps" }),
      doesntUntap("self", { label: "Doesn't untap during your untap step" }),
    ],
  },
  "Sower of Chaos": {
    abilities: [
      activated({
        mana: "{2}{R}",
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["cantBlock"] })],
        label: "A creature can't block",
      }),
    ],
  },
  "Axgard Cavalry": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 0, 0, ["haste"])],
        label: "Haste",
      }),
    ],
  },
  "Drakuseth, Maw of Flames": {
    abilities: [
      triggered(when.attacksSelf, [fx.damage(4, ref.target("a"), ref.self), fx.damage(3, ref.target("b"), ref.self)], {
        targets: [target.any("a"), { ...target.upTo(2, target.any("b")), otherThan: ["a"], label: "up to two other targets" }],
        label: "4 damage, then 3 and 3",
      }),
    ],
  },
  "Firespitter Whelp": {
    abilities: [
      triggered(
        when.castSpell("you", { anyOf: [{ notTypes: ["Creature"] }, { subtype: "Dragon" }] }),
        [fx.damage(1, ref.eachOpponent, ref.self)],
        { label: "1 damage to each opponent" },
      ),
    ],
  },
  "Frenzied Goblin": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay("{R}", "Pay {R}: the creature can't block?", fx.modify(ref.target(), { addKeywords: ["cantBlock"] })),
        {
          targets: [target.creature()],
          label: "{R}: can't block",
        },
      ),
    ],
  },
  "Goblin Surprise": {
    spell: modal(
      mode("Your creatures +2/+0", [], [fx.pumpAll({ controller: "you" }, 2, 0)]),
      mode("Two 1/1 Goblins", [], [fx.createTokens(GOBLIN, 2)]),
    ),
  },
  "Heartfire Immolator": {
    abilities: [
      activated({
        mana: "{R}",
        sacrifice: true,
        targets: [target.creatureOrPlaneswalker()],
        effects: [fx.damage(amount.powerOf(ref.self), ref.target(), ref.self)],
        label: "Damage equal to its power",
      }),
    ],
  },
  "Hidetsugu's Second Rite": {
    spell: spell([target.player()], [...fx.when(cond.refLife(ref.target(), 10), fx.damage(10, ref.target()))]),
  },
  "Krenko, Mob Boss": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.createTokens(GOBLIN, amount.count({ subtype: "Goblin", controller: "you" }))],
        label: "A Goblin for each Goblin",
      }),
    ],
  },
  "Seismic Rupture": { spell: spell([], [fx.damageAll(2, { not: { keyword: "flying" } })]) },
  Slagstorm: {
    spell: modal(
      mode("3 damage to each creature", [], [fx.damageAll(3, {})]),
      mode("3 damage to each player", [], [fx.damageAll(3, undefined, ref.eachPlayer)]),
    ),
  },
  "Kellan, Planar Trailblazer": {
    abilities: [
      activated({
        mana: "{1}{R}",
        effects: [
          ...fx.when(
            cond.sourceMatches({ subtype: "Scout" }),
            fx.modify(
              ref.self,
              {
                setSubtypes: ["Human", "Faerie", "Detective"],
                addAbilities: [
                  triggered(when.combatDamageToPlayer, [fx.impulse(1)], {
                    label: "exiles the top card, playable this turn",
                  }),
                ],
              },
              "permanent",
            ),
          ),
        ],
        label: "Becomes a Detective",
      }),
      activated({
        mana: "{2}{R}",
        effects: [
          ...fx.when(
            cond.sourceMatches({ subtype: "Detective" }),
            fx.modify(
              ref.self,
              { setSubtypes: ["Human", "Faerie", "Rogue"], setPower: 3, setToughness: 2, addKeywords: ["doubleStrike"] },
              "permanent",
            ),
          ),
        ],
        label: "Becomes a 3/2 Rogue with double strike",
      }),
    ],
  },
  "Strongbox Raider": {
    abilities: [
      triggered(when.entersSelf, [fx.impulse(2, "yourNextTurn")], {
        condition: cond.raid,
        label: "Raid: exiles 2 cards, play one of them",
      }),
    ],
  },
  "Twinflame Tyrant": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        to: "opponentSide",
        modify: { times: 2 },
        label: "Damage to opponents doubled",
      }),
    ],
  },
  "Etali, Primal Storm": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.exileTop(ref.eachPlayer, 1, "etali"), fx.castNow(ref.stored("etali"), { free: true, many: true })],
        { label: "exiles the top of each library, cast for free" },
      ),
    ],
  },
  "Flamewake Phoenix": {
    keywords: ["mustAttack"],
    abilities: [
      triggered(when.yourCombat, fx.mayPay("{R}", "Pay {R} to return from the graveyard?", fx.toBattlefield(ref.self)), {
        condition: cond.ferocious,
        fromGraveyard: true,
        label: "Ferocious: returns from the graveyard",
      }),
    ],
  },
  "Involuntary Employment": {
    spell: spell(
      [target.creature()],
      [fx.gainControl(ref.target()), fx.untap(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"]), fx.createTokens(TREASURE)],
    ),
  },

  // --- Reprints ---
  "Ball Lightning": {
    abilities: [triggered(when.eachEndStep, [fx.sacrificeIt(ref.self)], { label: "sacrifices itself" })],
  },
  "Bolt Bend": {
    costReduction: { generic: 3, condition: cond.ferocious },
    spell: spell([target.stackItemSingleTarget()], [fx.changeTarget(ref.target())]),
  },
  "Carnelian Orb of Dragonkind": {
    abilities: [manaAbility("R", 1, { rider: { spell: { types: ["Creature"], subtype: "Dragon" }, effect: "haste" } })],
  },
  "Crash Through": {
    spell: spell([], [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["trample"] }), fx.draw(1)]),
  },
  "Dragon Mage": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.discard(99, ref.eachPlayer), fx.draw(7, ref.eachPlayer)], {
        label: "each player discards their hand and draws seven cards",
      }),
    ],
  },
  "Dragonmaster Outcast": {
    abilities: [
      triggered(when.yourUpkeep, [fx.createTokens(DRAGON_5)], {
        condition: cond.controls({ types: ["Land"] }, 6),
        label: "5/5 flying Dragon",
      }),
    ],
  },
  "Dropkick Bomber": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Goblin", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Other Goblins +1/+1",
        },
      ),
      activated({
        mana: "{R}",
        targets: [target.creature("t", { subtype: "Goblin", controller: "you", other: true })],
        effects: [
          fx.modify(ref.target(), {
            addKeywords: ["flying"],
            addAbilities: [triggered(when.combatDamage("self"), [fx.sacrificeIt(ref.self)], { label: "sacrifices itself" })],
          }),
        ],
        label: "A Goblin flies (then sacrifices itself)",
      }),
    ],
  },
  "Ghitu Lavarunner": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["haste"] },
        {
          condition: cond.amountAtLeast(amount.countIn("graveyard", INSTANT_SORCERY), 2),
          label: "+1/+0, haste",
        },
      ),
    ],
  },
  "Giant Cindermaw": {
    abilities: [eventReplacement({ event: "lifeGain", modify: { prevent: true }, label: "No player can gain life" })],
  },
  "Goblin Smuggler": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { maxPower: 2, other: true })],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "A creature with power 2 or less is unblockable",
      }),
    ],
  },
  "Gratuitous Violence": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { types: ["Creature"], controller: "you" },
        modify: { times: 2 },
        label: "Damage from your creatures doubled",
      }),
    ],
  },
  "Harmless Offering": {
    spell: spell(
      [target.player("a", "opponent"), targetObj("b", { controller: "you" }, "permanent you control")],
      [fx.giveControl(ref.target("b"), ref.target("a"))],
    ),
  },
  "Hoarding Dragon": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Search for an artifact and exile it?",
          fx.search({ types: ["Artifact"] }, { to: "exile" }, 1, undefined, "art"),
          fx.link(ref.stored("art")),
        ),
        { label: "exiles an artifact" },
      ),
      triggered(when.diesSelf, fx.may("Put the exiled artifact into your hand?", fx.toHand(ref.linked)), {
        label: "gets back the exiled artifact",
      }),
    ],
  },
  "Lathliss, Dragon Queen": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Dragon", controller: "you", token: false, other: true }),
        [fx.createTokens(DRAGON_5)],
        {
          label: "5/5 flying Dragon",
        },
      ),
      activated({
        mana: "{1}{R}",
        effects: [fx.pumpAll({ subtype: "Dragon", controller: "you" }, 1, 0)],
        label: "Dragons +1/+0",
      }),
    ],
  },
  Mindsparker: {
    abilities: [
      triggered(
        when.castSpell("opponent", { types: ["Instant", "Sorcery"], colors: ["W", "U"] }),
        [fx.damage(2, ref.eventPlayer, ref.self)],
        { label: "2 damage" },
      ),
    ],
  },
  "Ravenous Giant": {
    abilities: [triggered(when.yourUpkeep, [fx.damage(1, ref.you, ref.self)], { label: "1 damage to you" })],
  },
  "Redcap Gutter-Dweller": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(RAT_NO_BLOCK, 2)], { label: "two 1/1 Rats" }),
      triggered(
        when.yourUpkeep,
        [
          fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.addCounters(ref.self, 1), fx.impulse(1)),
        ],
        { label: "optional sacrifice: counter, playable exile" },
      ),
    ],
  },
  "Stromkirk Noble": {
    abilities: [
      blockAbility(block.notBy({ subtype: "Human" }, "Can't be blocked by Humans")),
      triggered(when.combatDamageToPlayer, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
    ],
  },
  "Taurean Mauler": {
    keywords: ["changeling"],
    abilities: [
      triggered(when.castSpell("opponent"), fx.may("Put a +1/+1 counter?", fx.addCounters(ref.self, 1)), {
        label: "a +1/+1 counter",
      }),
    ],
  },
  "Terror of Mount Velus": {
    abilities: [
      triggered(when.entersSelf, [fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["doubleStrike"] })], {
        label: "double strike",
      }),
    ],
  },
  "Volley Veteran": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.count({ subtype: "Goblin", controller: "you" }), ref.target(), ref.self)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "damage equal to the number of Goblins",
      }),
    ],
  },
};
