/** Foundations — green cards. */
import {
  ART_ENCH_OR_FLYER,
  activated,
  amount,
  BASIC_LAND,
  BEAST,
  BEAST_3,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  ELF_WARRIOR,
  entersWith,
  eventReplacement,
  FOOD,
  fromGraveyard,
  fx,
  kicker,
  manaAbility,
  modal,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  playerStatic,
  RACCOON,
  ref,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  triggeredModal,
  WITH_P1P1,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Llanowar Elves": { abilities: [manaAbility("G")] },
  "Druid of the Cowl": { abilities: [manaAbility("G")] },
  "Giant Growth": { spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3)]) },
  "Bite Down": {
    spell: spell(
      [
        target.creature("a", { controller: "you" }),
        target.permanent("b", ["Creature", "Planeswalker"], { controller: "opponent" }, "opponent's creature or planeswalker"),
      ],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  Overrun: { spell: spell([], [fx.pumpAll({ controller: "you" }, 3, 3, ["trample"])]) },
  "Primal Might": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.optional(target.creature("b", { controller: "opponent" }))],
      [fx.pump(ref.target("a"), amount.x, amount.x), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  "Wildheart Invoker": {
    abilities: [
      activated({
        mana: "{8}",
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), 5, 5, ["trample"])],
        label: "+5/+5 and trample",
      }),
    ],
  },
  "Ghalta, Primal Hunger": { costReduction: { generic: amount.totalPower({ types: ["Creature"], controller: "you" }) } },
  "Eager Trufflesnout": { abilities: [triggered(when.combatDamageToPlayer, [fx.createTokens(FOOD)], { label: "Food" })] },
  "Mossborn Hydra": {
    abilities: [
      entersWith({ counters: 1 }),
      triggered(when.landfall, [fx.doubleCounters(ref.self)], { label: "doubles its counters" }),
    ],
  },
  "Heroes' Bane": {
    abilities: [
      entersWith({ counters: 4 }),
      activated({
        mana: "{2}{G}{G}",
        effects: [fx.addCounters(ref.self, amount.powerOf(ref.self))],
        label: "X counters (X = its power)",
      }),
    ],
  },
  "Imperious Perfect": {
    abilities: [
      staticAbility(
        { subtype: "Elf", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Other Elves +1/+1" },
      ),
      activated({ mana: "{G}", tap: true, effects: [fx.createTokens(ELF_WARRIOR)], label: "1/1 Elf Warrior" }),
    ],
  },
  "Dwynen, Gilt-Leaf Daen": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Elf", controller: "you", other: true }, { power: 1, toughness: 1 }),
      triggered(
        when.attacksSelf,
        [fx.gainLife(amount.count({ types: ["Creature"], subtype: "Elf", controller: "you", attacking: true }))],
        { label: "1 life for each attacking Elf" },
      ),
    ],
  },
  "Aggressive Mammoth": {
    abilities: [staticAbility({ types: ["Creature"], controller: "you", other: true }, { addKeywords: ["trample"] })],
  },
  "Garruk's Uprising": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], {
        condition: cond.controls({ types: ["Creature"], minPower: 4 }),
        label: "draw a card",
      }),
      staticAbility({ types: ["Creature"], controller: "you" }, { addKeywords: ["trample"] }),
      triggered(when.enters({ types: ["Creature"], controller: "you", minPower: 4 }), [fx.draw(1)], {
        label: "draw a card",
      }),
    ],
  },
  "Pelakka Wurm": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(7)], { label: "+7 life" }),
      triggered(when.diesSelf, [fx.draw(1)], { label: "draw a card" }),
    ],
  },
  "Elfsworn Giant": { abilities: [triggered(when.landfall, [fx.createTokens(ELF_WARRIOR)], { label: "1/1 Elf Warrior" })] },
  "Rampaging Baloths": { abilities: [triggered(when.landfall, [fx.createTokens(BEAST)], { label: "4/4 Beast" })] },
  "Wary Thespian": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "surveil 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "surveil 1" }),
    ],
  },
  "Needletooth Pack": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.target(), 2)], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.morbid,
        label: "Morbid: two +1/+1 counters",
      }),
    ],
  },
  "Dwynen's Elite": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ELF_WARRIOR)], {
        condition: cond.controls({ types: ["Creature"], subtype: "Elf", other: true }),
        label: "1/1 Elf Warrior",
      }),
    ],
  },
  "Beast-Kin Ranger": {
    abilities: [triggered(when.enters({ ...CREATURE_YOU_CONTROL, other: true }), [fx.pump(ref.self, 1, 0)], { label: "+1/+0" })],
  },
  "Nessian Hornbeetle": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: cond.controls({ types: ["Creature"], other: true, minPower: 4 }),
        label: "a +1/+1 counter",
      }),
    ],
  },
  "Ambush Wolf": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target())], {
        targets: [target.optional(target.cardInGraveyard("t", {}, "any"))],
        label: "exiles a card from a graveyard",
      }),
    ],
  },
  "Apothecary Stomper": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("Two +1/+1 counters", [target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 2)]),
        mode("You gain 4 life", [], [fx.gainLife(4)]),
      ]),
    ],
  },
  "Cackling Prowler": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], { condition: cond.morbid, label: "Morbid: a +1/+1 counter" }),
    ],
  },
  "Elvish Regrower": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard")],
        label: "gets back a permanent",
      }),
    ],
  },
  "Felling Blow": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.addCounters(ref.target("a"), 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Preposterous Proportions": {
    spell: spell([], [fx.pumpAll({ controller: "you" }, 10, 10, ["vigilance"])]),
  },
  "Spinner of Souls": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", token: false, other: true }),
        fx.may("Reveal until a creature card?", fx.revealUntil({ types: ["Creature"] })),
        { label: "reveals until a creature" },
      ),
    ],
  },
  "Sylvan Scavenging": {
    abilities: [
      triggeredModal(when.yourEndStep, [
        mode("+1/+1 counter", [target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
        mode("3/3 Raccoon (ferocious)", [], [...fx.when(cond.ferocious, fx.createTokens(RACCOON))]),
      ]),
    ],
  },
  "Treetop Snarespinner": {
    abilities: [
      activated({
        mana: "{2}{G}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Affectionate Indrik": {
    abilities: [
      triggered(when.entersSelf, fx.may("Fight the target creature?", fx.fight(ref.self, ref.target())), {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "fight",
      }),
    ],
  },
  "Blanchwood Armor": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: { subtype: "Forest", controller: "you" }, label: "+1/+1 for each Forest" },
      ),
    ],
  },
  "Broken Wings": {
    spell: spell([targetObj("t", ART_ENCH_OR_FLYER, "artifact, enchantment or flying creature")], [fx.destroy(ref.target())]),
  },
  Bushwhack: {
    spell: modal(
      mode("ctx:infinitive|Search for a basic land", [], [fx.search(BASIC_LAND)]),
      mode(
        "Fight",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.fight(ref.target("a"), ref.target("b"))],
      ),
    ),
  },
  "Elvish Archdruid": {
    abilities: [
      staticAbility({ types: ["Creature"], subtype: "Elf", controller: "you", other: true }, { power: 1, toughness: 1 }),
      manaAbility("G", 1, { per: { types: ["Creature"], subtype: "Elf", controller: "you" } }),
    ],
  },
  "Genesis Wave": {
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.x, {
          filter: { permanent: true },
          count: amount.x,
          maxManaValue: amount.x,
          to: { to: "battlefield" },
          rest: "graveyard",
        }),
      ],
    ),
  },
  "Gnarlid Colony": {
    kicker: kicker("{2}{G}"),
    abilities: [
      entersWith({ counters: 2, condition: cond.kicked, label: "Kicker: two counters" }),
      staticAbility(WITH_P1P1, { addKeywords: ["trample"] }),
    ],
  },
  "Grow from the Ashes": {
    kicker: kicker("{2}"),
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield" }, amount.kicked(2, 1))]),
  },
  "Inspiring Call": {
    spell: spell([], [fx.draw(amount.count(WITH_P1P1)), fx.modifyAll(WITH_P1P1, { addKeywords: ["indestructible"] })]),
  },
  "Mild-Mannered Librarian": {
    abilities: [
      activated({
        mana: "{3}{G}",
        once: true,
        effects: [fx.modify(ref.self, { addSubtypes: ["Werewolf"] }, "permanent"), fx.addCounters(ref.self, 2), fx.draw(1)],
        label: "Becomes a Werewolf",
      }),
    ],
  },
  "Reclamation Sage": {
    abilities: [
      triggered(when.entersSelf, fx.may("Destroy the target artifact or enchantment?", fx.destroy(ref.target())), {
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        label: "destroys an artifact or an enchantment",
      }),
    ],
  },
  "Scavenging Ooze": {
    abilities: [
      activated({
        mana: "{G}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [
          fx.exileCard(ref.target(), { name: "c", filter: { types: ["Creature"] } }),
          ...fx.when(cond.v("c"), fx.addCounters(ref.self, 1), fx.gainLife(1)),
        ],
        label: "Exile one card from a graveyard",
      }),
    ],
  },
  "Snakeskin Veil": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["hexproof"])],
    ),
  },
  "Wildwood Scourge": {
    abilities: [
      entersWith({ counters: amount.x }),
      triggered(
        when.countersPut({ types: ["Creature"], controller: "you", other: true, notSubtype: "Hydra" }, "+1/+1"),
        [fx.addCounters(ref.self, 1)],
        { label: "a +1/+1 counter" },
      ),
    ],
  },
  "Loot, Exuberant Explorer": {
    abilities: [
      playerStatic({ extraLands: 1, label: "One additional land each turn" }),
      activated({
        mana: "{4}{G}{G}",
        tap: true,
        effects: [
          fx.lookAtTop(6, {
            filter: { types: ["Creature"] },
            maxManaValue: amount.count({ types: ["Land"], controller: "you" }),
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        label: "Look at 6 cards, put a creature onto the battlefield",
      }),
    ],
  },
  "Quilled Greatwurm": {
    castOptions: [fromGraveyard({ removeCountersAmong: 6 })],
    abilities: [
      triggered(when.combatDamage(CREATURE_YOU_CONTROL), [fx.addCounters(ref.eventObject, amount.eventAmount)], {
        condition: cond.yourTurn,
        label: "that many +1/+1 counters",
      }),
    ],
  },
  "Doubling Season": {
    abilities: [
      eventReplacement({ event: "tokens", to: "you", modify: { times: 2 }, label: "Tokens doubled" }),
      eventReplacement({ event: "counters", to: "yourSide", effectOnly: true, modify: { times: 2 }, label: "Counters doubled" }),
    ],
  },

  // --- Reprints ---
  "Biogenic Upgrade": {
    spell: spell(
      [target.between(1, 3, target.creature())],
      [fx.countersDivided(3, ref.target()), fx.doubleCounters(ref.target())],
    ),
  },
  "Circuitous Route": {
    spell: spell([], [fx.search({ anyOf: [BASIC_LAND, { subtype: "Gate" }] }, { to: "battlefield", tapped: true }, 2)]),
  },
  "Fierce Empath": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Search for a creature with value 6 or greater?", fx.search({ types: ["Creature"], minManaValue: 6 })),
        {
          label: "searches for a big creature",
        },
      ),
    ],
  },
  "Fynn, the Fangbearer": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you", keyword: "deathtouch" }, true),
        [fx.poison(ref.eventPlayer, 2)],
        { label: "two poison counters" },
      ),
    ],
  },
  "Gnarlback Rhino": {
    abilities: [triggered(when.targetedBySpellYouCast, [fx.draw(1)], { label: "draw a card" })],
  },
  "Joraga Invocation": {
    spell: spell(
      [],
      [
        fx.pumpAll({ controller: "you" }, 3, 3),
        fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["mustBeBlocked"] }),
      ],
    ),
  },
  "Mold Adder": {
    abilities: [
      triggered(when.castSpell("opponent", { colors: ["U", "B"] }), fx.may("Put a +1/+1 counter?", fx.addCounters(ref.self, 1)), {
        label: "a +1/+1 counter",
      }),
    ],
  },
  "New Horizons": {
    enchant: { filter: { types: ["Land"] }, label: "land" },
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "a +1/+1 counter",
      }),
      staticAbility(
        "attached",
        { addAbilities: [manaAbility(["W", "U", "B", "R", "G"], 2)] },
        {
          label: '"{T}: two mana of any one color"',
        },
      ),
    ],
  },
  "Ordeal of Nylea": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(
        when.attacks({ attached: "host" }),
        [
          fx.addCounters(ref.attached, 1),
          ...fx.when(cond.amountAtLeast(amount.countersOn(ref.attached), 3), fx.sacrificeIt(ref.self)),
        ],
        { label: "counter; at 3, sacrifice the Ordeal" },
      ),
      // "When you sacrifice the Ordeal": however it happens (bargain, sacrifice effect).
      triggered(when.sacrifice({ self: true }), [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)], {
        label: "Sacrificed: two basic lands",
      }),
    ],
  },
  "Predator Ooze": {
    abilities: [
      triggered(when.attacksSelf, [fx.addCounters(ref.self, 1)], { label: "a +1/+1 counter" }),
      triggered(when.dies({ types: ["Creature"], damagedBySource: true }), [fx.addCounters(ref.self, 1)], {
        label: "a +1/+1 counter",
      }),
    ],
  },
  "Primeval Bounty": {
    abilities: [
      triggered(when.castSpell("you", { types: ["Creature"] }), [fx.createTokens(BEAST_3)], { label: "3/3 Beast" }),
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.addCounters(ref.target(), 3)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "three +1/+1 counters",
      }),
      triggered(when.landfall, [fx.gainLife(3)], { label: "+3 life" }),
    ],
  },
  "Springbloom Druid": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.you, { types: ["Land"] }, 1, { optional: true, store: "land" }),
          ...fx.when(cond.v("land"), fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 2)),
        ],
        { label: "sacrifices a land: two basic lands" },
      ),
    ],
  },
  "Surrak, the Hunt Caller": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 0, 0, ["haste"])], {
        targets: [target.creature("t", { controller: "you" })],
        condition: cond.amountAtLeast(amount.totalPower({ types: ["Creature"], controller: "you" }), 8),
        label: "Formidable: haste",
      }),
    ],
  },
  "Thrashing Brontodon": {
    abilities: [
      activated({
        mana: "{1}",
        sacrifice: true,
        targets: [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        effects: [fx.destroy(ref.target())],
        label: "Sacrifice: destroy an artifact or an enchantment",
      }),
    ],
  },
  "Venom Connoisseur": {
    abilities: [
      triggered(
        when.enters(OTHER_CREATURE_YOU_CONTROL),
        [
          fx.pump(ref.self, 0, 0, ["deathtouch"]),
          fx.countResolution("n"),
          ...fx.when(
            cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))),
            fx.modifyAll({ types: ["Creature"], controller: "you" }, { addKeywords: ["deathtouch"] }),
          ),
        ],
        { label: "Alliance: deathtouch" },
      ),
    ],
  },
  "Vizier of the Menagerie": {
    abilities: [
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { types: ["Creature"] }, what: "spells", anyMana: true },
        label: "Creatures from the top of your library",
      }),
    ],
  },
  "Wildborn Preserver": {
    abilities: [
      triggered(
        when.enters({ ...OTHER_CREATURE_YOU_CONTROL, notSubtype: "Human" }),
        [fx.payX("pay X for X +1/+1 counters?", "x"), fx.addCounters(ref.self, amount.v("x"))],
        { label: "pay X: X counters" },
      ),
    ],
  },
};
