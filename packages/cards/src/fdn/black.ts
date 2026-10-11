/** Foundations — black cards. */
import {
  activated,
  altCost,
  amount,
  type CardScript,
  CREATURE_OPP,
  CREATURE_YOU_CONTROL,
  castPermission,
  cond,
  cost,
  entersWith,
  FOOD,
  flashback,
  fx,
  INSECT,
  kicker,
  modal,
  mode,
  protection,
  protectionAbility,
  RAT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  when,
  ZOMBIE,
} from "./common";

const ANOTHER_CREATURE = { types: ["Creature" as const], other: true };

export const BLACK: Record<string, CardScript> = {
  "Arbiter of Woe": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.eachOpponent), fx.loseLife(2, ref.eachOpponent), fx.draw(1), fx.gainLife(2)],
        { label: "discards, -2 life; you draw, +2 life" },
      ),
    ],
  },
  "Diregraf Ghoul": { abilities: [entersWith({ tapped: true })] },
  "Billowing Shriekmass": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "mills 3" }),
      staticAbility("self", { power: 2, toughness: 1 }, { condition: cond.threshold, label: "Threshold: +2/+1" }),
    ],
  },
  "Bloodthirsty Conqueror": {
    abilities: [triggered(when.loseLife("opponent"), [fx.gainLife(amount.eventAmount)], { label: "gain that much life" })],
  },
  "Crypt Feaster": {
    abilities: [triggered(when.attacksSelf, [fx.pump(ref.self, 2, 0)], { condition: cond.threshold, label: "Threshold: +2/+0" })],
  },
  "Gutless Plunderer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(3, { count: 1, to: { to: "libraryTop" }, rest: "graveyard" })], {
        condition: cond.raid,
        label: "Raid: scry 3",
      }),
    ],
  },
  "High-Society Hunter": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ANOTHER_CREATURE, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.addCounters(ref.self, 1)),
        ],
        { label: "optional sacrifice: a +1/+1 counter" },
      ),
      triggered(when.dies({ types: ["Creature"], token: false, other: true }), [fx.draw(1)], { label: "draw a card" }),
    ],
  },
  "Hungry Ghoul": {
    abilities: [
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifice a creature: a +1/+1 counter",
      }),
    ],
  },
  "Infernal Vessel": {
    abilities: [
      triggered(
        when.dies({ self: true, notSubtype: "Demon" }),
        [fx.toBattlefield(ref.eventObject, { counters: { kind: "+1/+1", n: 2 }, addSubtypes: ["Demon"] })],
        { label: "returns as a Demon" },
      ),
    ],
  },
  "Infestation Sage": { abilities: [triggered(when.diesSelf, [fx.createTokens(INSECT)], { label: "1/1 flying Insect" })] },
  "Midnight Snack": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FOOD)], { condition: cond.raid, label: "Raid: Food" }),
      activated({
        mana: "{2}{B}",
        sacrifice: true,
        targets: [target.player("t", "opponent")],
        effects: [fx.loseLife(amount.lifeGainedThisTurn, ref.target())],
        label: "The opponent loses the life gained this turn",
      }),
    ],
  },
  "Revenge of the Rats": {
    castOptions: [flashback("{2}{B}{B}")],
    spell: spell([], [fx.createTappedTokens(RAT, amount.countIn("graveyard", { types: ["Creature"] }))]),
  },
  "Sanguine Syphoner": { abilities: [triggered(when.attacksSelf, fx.drain(1), { label: "drains 1" })] },
  "Seeker's Folly": {
    spell: modal(
      mode("The target opponent discards two cards", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
      mode("Opponents' creatures -1/-1", [], [fx.pumpAll({ controller: "opponent" }, -1, -1)]),
    ),
  },
  "Soul-Shackled Zombie": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "ex", filter: { types: ["Creature"] } }), ...fx.when(cond.v("ex"), fx.drain(2))],
        {
          targets: [
            {
              ...target.upTo(2, target.cardInGraveyard("t", {}, "any")),
              samePlayer: true,
              label: "cards from a single graveyard",
            },
          ],
          label: "exiles up to two cards",
        },
      ),
    ],
  },
  Stab: { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2)]) },
  "Tragic Banshee": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.when(cond.not(cond.morbid), fx.pump(ref.target(), -1, -1)),
          ...fx.when(cond.morbid, fx.pump(ref.target(), -13, -13)),
        ],
        { targets: [target.creature("t", { controller: "opponent" })], label: "-1/-1 (Morbid: -13/-13)" },
      ),
    ],
  },
  "Vampire Gourmand": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.you, ANOTHER_CREATURE, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.draw(1), fx.modify(ref.self, { addKeywords: ["unblockable"] })),
        ],
        { label: "optional sacrifice: draws, unblockable" },
      ),
    ],
  },
  "Vampire Soulcaller": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] })],
        label: "gets back a creature",
      }),
    ],
  },
  "Vengeful Bloodwitch": {
    abilities: [
      triggered(when.dies(CREATURE_YOU_CONTROL), fx.drain(1, ref.target()), {
        targets: [target.player("t", "opponent")],
        label: "drains 1",
      }),
    ],
  },
  "Bake into a Pie": { spell: spell([target.creature()], [fx.destroy(ref.target()), fx.createTokens(FOOD)]) },
  "Burglar Rat": {
    abilities: [triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], { label: "each opponent discards" })],
  },
  Exsanguinate: {
    spell: spell([], [fx.loseLife(amount.x, ref.eachOpponent, "lost"), fx.gainLife(amount.v("lost"))]),
  },
  "Fake Your Own Death": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 2, 0),
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { tapped: true }), fx.createTokens(TREASURE)], {
              label: "returns tapped, Treasure",
            }),
          ],
        }),
      ],
    ),
  },
  "Hero's Downfall": { spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]) },
  "Macabre Waltz": {
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature cards in your graveyard"))],
      [fx.toHand(ref.target()), fx.discard(1)],
    ),
  },
  "Marauding Blight-Priest": {
    abilities: [triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "each opponent loses 1 life" })],
  },
  "Painful Quandary": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.punisher(ref.eventPlayer, 5, { discard: true })], {
        label: "loses 5 life unless they discard",
      }),
    ],
  },
  "Phyrexian Arena": {
    abilities: [triggered(when.yourUpkeep, [fx.draw(1), fx.loseLife(1)], { label: "draw, lose 1 life" })],
  },
  Pilfer: {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { notTypes: ["Land"] }, chooser: "controller" })],
    ),
  },
  "Reassembling Skeleton": {
    abilities: [
      activated({
        mana: "{1}{B}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true })],
        label: "Return from the graveyard",
      }),
    ],
  },
  "Rise of the Dark Realms": {
    spell: spell(
      [],
      [fx.moveAll("graveyard", ref.eachPlayer, { types: ["Creature"] }, { to: "battlefield", underYourControl: true })],
    ),
  },
  "Rune-Scarred Demon": {
    abilities: [triggered(when.entersSelf, [fx.search({})], { label: "searches for a card" })],
  },
  "Stromkirk Bloodthief": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", subtype: "Vampire" })],
        condition: cond.opponentLostLife,
        label: "a +1/+1 counter on a Vampire",
      }),
    ],
  },
  "Zul Ashur, Lich Lord": {
    abilities: [
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"], subtype: "Zombie" }, "you", "Zombie creature card")],
        effects: [fx.allowCastFromGraveyard(ref.target())],
        label: "Allow casting a Zombie from the graveyard",
      }),
    ],
  },
  Zombify: { spell: spell([target.cardInGraveyard("t", { types: ["Creature"] })], [fx.toBattlefield(ref.target())]) },
  "Abyssal Harvester": {
    abilities: [
      activated({
        tap: true,
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], enteredThisTurn: true },
            "any",
            "creature card put into a graveyard this turn",
          ),
        ],
        effects: [
          fx.exileCard(ref.target(), { name: "h" }),
          fx.copyToken(ref.stored("h"), { addSubtypes: ["Nightmare"], store: "tok" }),
          // "Then exile all other Nightmare tokens you control": after the copy is created.
          fx.exile(ref.except(ref.permanentsOf(ref.you, { subtype: "Nightmare", token: true }), ref.stored("tok"))),
        ],
        label: "Exile and copy a creature that died this turn",
      }),
    ],
  },
  "Blasphemous Edict": {
    castOptions: [
      altCost({
        mana: "{B}",
        condition: cond.battlefieldCount({ types: ["Creature"] }, 13),
        label: "Pay {B} (13 or more creatures on the battlefield)",
      }),
    ],
    spell: spell([], [fx.sacrifice(ref.eachPlayer, { types: ["Creature"] }, 13)]),
  },
  "Nine-Lives Familiar": {
    abilities: [
      entersWith({ counters: 8, counterKind: "revival", condition: cond.wasCast, label: "Eight revival counters" }),
      triggered(
        when.diesSelf,
        [
          fx.delayed(
            [
              fx.moveTo(ref.target("k"), { to: "battlefield" }, { name: "back" }),
              fx.counters(ref.stored("back"), "revival", amount.v("rev")),
            ],
            { k: ref.eventObject },
            { rev: amount.plus(amount.lkiCounters("revival"), -1) },
          ),
        ],
        { condition: cond.counterAtLeast("revival", 1), label: "returns at the end step" },
      ),
    ],
  },
  "Tinybones, Bauble Burglar": {
    abilities: [
      triggered(when.discard("opponent"), [fx.moveTo(ref.eventObject, { to: "exile", counters: { kind: "stash", n: 1 } })], {
        label: "exiles with a stash counter",
      }),
      castPermission({ stash: true, label: "Play the stash cards" }),
      activated({
        mana: "{3}{B}",
        tap: true,
        sorcerySpeed: true,
        effects: [fx.discard(1, ref.eachOpponent)],
        label: "Each opponent discards a card",
      }),
    ],
  },
  "Eaten Alive": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1, orPay: cost("{3}{B}") } },
    spell: spell([target.creatureOrPlaneswalker()], [fx.exileCard(ref.target())]),
  },

  // --- Reprints ---
  "Bloodtithe Collector": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.eachOpponent)], {
        condition: cond.opponentLostLife,
        label: "each opponent discards",
      }),
    ],
  },
  "Cemetery Recruitment": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] })],
      [
        fx.moveTo(ref.target(), { to: "hand" }, { name: "z", filter: { subtype: "Zombie" } }),
        ...fx.when(cond.v("z"), fx.draw(1)),
      ],
    ),
  },
  "Crossway Troublemakers": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Vampire", controller: "you", attacking: true },
        { addKeywords: ["deathtouch", "lifelink"] },
        {
          label: "Attacking Vampires: deathtouch, lifelink",
        },
      ),
      triggered(
        when.dies({ types: ["Creature"], subtype: "Vampire", controller: "you" }),
        fx.mayPayLife(2, "Pay 2 life to draw?", fx.draw(1)),
        { label: "2 life: draw" },
      ),
    ],
  },
  "Crow of Dark Tidings": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2)], { label: "mills 2" }),
      triggered(when.diesSelf, [fx.mill(2)], { label: "mills 2" }),
    ],
  },
  "Deadly Plot": {
    spell: modal(
      mode("Destroy target creature or planeswalker", [target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
      mode(
        "Reanimate a tapped Zombie",
        [target.cardInGraveyard("t", { types: ["Creature"], subtype: "Zombie" }, "you", "Zombie creature card")],
        [fx.toBattlefield(ref.target(), { tapped: true })],
      ),
    ),
  },
  "Death Baron": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Skeleton", controller: "you" },
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
      ),
      staticAbility(
        { types: ["Creature"], subtype: "Zombie", controller: "you", other: true },
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
      ),
    ],
  },
  Deathmark: {
    spell: spell(
      [targetObj("t", { types: ["Creature"], colors: ["G", "W"] }, "green or white creature")],
      [fx.destroy(ref.target())],
    ),
  },
  "Demonic Pact": {
    abilities: [
      triggeredModal(
        when.yourUpkeep,
        [
          mode("4 damage and +4 life", [target.any()], [fx.damage(4, ref.target(), ref.self), fx.gainLife(4)]),
          mode("An opponent discards two cards", [target.player("t", "opponent")], [fx.discard(2, ref.target())]),
          mode("Draw two cards", [], [fx.draw(2)]),
          mode("You lose the game", [], [fx.loseGame]),
        ],
        { uniqueModes: true, label: "mode not chosen yet" },
      ),
    ],
  },
  "Desecration Demon": {
    abilities: [
      triggered(
        when.step("beginCombat", "any"),
        [
          fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 1, { optional: true, store: "sac" }),
          ...fx.when(cond.v("sac"), fx.tap(ref.self), fx.addCounters(ref.self, 1)),
        ],
        { label: "an opponent may sacrifice a creature" },
      ),
    ],
  },
  "Dread Summons": {
    spell: spell(
      [],
      [
        fx.mill(amount.x, ref.eachPlayer, { name: "c", filter: { types: ["Creature"] } }),
        fx.createTappedTokens(ZOMBIE, amount.v("c")),
      ],
    ),
  },
  "Driver of the Dead": {
    abilities: [
      triggered(when.diesSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 2 })],
        label: "reanimates a creature with value 2 or less",
      }),
    ],
  },
  Duress: {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { notTypes: ["Creature", "Land"] }, chooser: "controller" })],
    ),
  },
  "Feed the Swarm": {
    spell: spell(
      [targetObj("t", { types: ["Creature", "Enchantment"], controller: "opponent" }, "opponent's creature or enchantment")],
      [fx.destroy(ref.target()), fx.loseLife(amount.manaValueOf(ref.target()))],
    ),
  },
  "Gatekeeper of Malakir": {
    kicker: kicker("{B}"),
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.target(), { types: ["Creature"] })], {
        targets: [target.player()],
        condition: cond.kicked,
        label: "Kicker: the player sacrifices a creature",
      }),
    ],
  },
  "Kalastria Highborn": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], subtype: "Vampire", controller: "you" }),
        fx.mayPay("{B}", "Pay {B}: the target player loses 2 life and you gain 2?", fx.drain(2, ref.target())),
        { targets: [target.player()], label: "{B}: drains 2" },
      ),
    ],
  },
  "Knight of Malice": {
    abilities: [
      protectionAbility(protection.hexproofFrom({ colors: ["W"] }, "Hexproof from white")),
      staticAbility(
        "self",
        { power: 1 },
        { condition: cond.battlefieldCount({ colors: ["W"] }, 1), label: "+1/+0 (white permanent)" },
      ),
    ],
  },
  "Maalfeld Twins": { abilities: [triggered(when.diesSelf, [fx.createTokens(ZOMBIE, 2)], { label: "two 2/2 Zombies" })] },
  "Massacre Wurm": {
    abilities: [
      triggered(when.entersSelf, [fx.pumpAll({ controller: "opponent" }, -2, -2)], { label: "opponents' creatures -2/-2" }),
      triggered(when.dies(CREATURE_OPP), [fx.loseLife(2, ref.eventPlayer)], { label: "its controller loses 2 life" }),
    ],
  },
  "Midnight Reaper": {
    abilities: [
      triggered(when.dies({ ...CREATURE_YOU_CONTROL, token: false }), [fx.damage(1, ref.you, ref.self), fx.draw(1)], {
        label: "1 damage, draw",
      }),
    ],
  },
  "Moment of Craving": { spell: spell([target.creature()], [fx.pump(ref.target(), -2, -2), fx.gainLife(2)]) },
  "Myojin of Night's Reach": {
    abilities: [
      entersWith({ counters: 1, counterKind: "divinity", condition: cond.castFromHand, label: "Divinity counter" }),
      staticAbility(
        "self",
        { addKeywords: ["indestructible"] },
        { condition: cond.counterAtLeast("divinity", 1), label: "Indestructible" },
      ),
      activated({
        removeCounters: { kind: "divinity", n: 1 },
        effects: [fx.discard(99, ref.eachOpponent)],
        label: "Each opponent discards their hand",
      }),
    ],
  },
  "Nullpriest of Oblivion": {
    kicker: kicker("{3}{B}"),
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Creature"] })],
        condition: cond.kicked,
        label: "Kicker: reanimates a creature",
      }),
    ],
  },
  "Offer Immortality": { spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["deathtouch", "indestructible"])]) },
  "Pulse Tracker": {
    abilities: [triggered(when.attacksSelf, [fx.loseLife(1, ref.eachOpponent)], { label: "each opponent loses 1 life" })],
  },
  "Sanguine Indulgence": {
    costReduction: { generic: 3, condition: cond.lifeGainedAtLeast(3) },
    spell: spell(
      [target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature cards in your graveyard"))],
      [fx.toHand(ref.target())],
    ),
  },
  "Skeleton Archer": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target(), ref.self)], { targets: [target.any()], label: "1 damage" }),
    ],
  },
  "Suspicious Shambler": {
    abilities: [
      activated({
        mana: "{4}{B}{B}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(ZOMBIE, 2)],
        label: "Exile from the graveyard: two Zombies",
      }),
    ],
  },
  "Tribute to Hunger": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.sacrifice(ref.target(), { types: ["Creature"] }, 1, { store: "s" }), fx.gainLife(amount.toughnessOf(ref.stored("s")))],
    ),
  },
  "Undying Malice": {
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), {
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.eventObject, { tapped: true, counters: { kind: "+1/+1", n: 1 } })], {
              label: "returns tapped with a counter",
            }),
          ],
        }),
      ],
    ),
  },
  "Untamed Hunger": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["menace"] }, { label: "+2/+1 and menace" })],
  },
  "Vampire Interloper": { keywords: ["cantBlock"] },
  "Vampire Neonate": {
    abilities: [activated({ mana: "{2}", tap: true, effects: fx.drain(1), label: "Drain 1 life" })],
  },
  "Vampire Spawn": { abilities: [triggered(when.entersSelf, fx.drain(2), { label: "drains 2" })] },
  "Vampiric Rites": {
    abilities: [
      activated({
        mana: "{1}{B}",
        sacrificeOther: { filter: { types: ["Creature"] } },
        effects: [fx.gainLife(1), fx.draw(1)],
        label: "Sacrifice a creature: +1 life, draw",
      }),
    ],
  },
  "Vile Entomber": {
    abilities: [triggered(when.entersSelf, [fx.search({}, { to: "graveyard" })], { label: "a card into the graveyard" })],
  },
  "Wishclaw Talisman": {
    abilities: [
      entersWith({ counters: 3, counterKind: "wish", label: "Three wish counters" }),
      activated({
        mana: "{1}",
        tap: true,
        removeCounters: { kind: "wish", n: 1 },
        activationCondition: cond.yourTurn,
        effects: [fx.search({}), fx.giveControl(ref.self, ref.eachOpponent)],
        label: "Search for a card (an opponent takes the talisman)",
      }),
    ],
  },
};
