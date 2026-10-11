/** Bloomburrow — blue cards. */
import {
  activated,
  amount,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  cost,
  costReducer,
  entersWith,
  FISH,
  FOOD_ABILITY,
  fx,
  INSTANT_SORCERY,
  kin,
  modal,
  mode,
  OTTER,
  otter,
  pawprint,
  playerStatic,
  ref,
  spell,
  staticAbility,
  THRESHOLD,
  target,
  targetObj,
  triggered,
  wardAbility,
  when,
} from "./common";

const BIRD_FROG_OTTER_RAT = ["Bird", "Frog", "Otter", "Rat"];

/** "Exile it, then return it to the battlefield under its owner's control." */
const blink = (what: ReturnType<typeof ref.target>, counters?: { kind: string; n: number }) => [
  fx.exileCard(what, { name: "b" }),
  fx.toBattlefield(ref.stored("b"), counters ? { counters } : {}),
];

export const BLUE: Record<string, CardScript> = {
  "Azure Beastbinder": {
    abilities: [
      blockAbility(block.notBy({ minPower: 2 }, "Can't be blocked by creatures with power 2 or greater")),
      triggered(
        when.attacksSelf,
        [fx.modify(ref.target(), { loseAllAbilities: true, setPower: 2, setToughness: 2 }, "untilYourNextTurn")],
        {
          targets: [
            target.upTo(
              1,
              target.permanent(
                "t",
                ["Artifact", "Creature", "Planeswalker"],
                { controller: "opponent" },
                "artifact, creature or planeswalker an opponent controls",
              ),
            ),
          ],
          label: "Loses its abilities, base P/T 2/2",
        },
      ),
    ],
  },
  "Bellowing Crier": {
    abilities: [triggered(when.entersSelf, fx.loot(1), { label: "Draw, and then discard" })],
  },
  "Calamitous Tide": {
    spell: spell([target.upTo(2, target.creature())], [fx.bounce(ref.target()), fx.draw(2), fx.discard(1)]),
  },
  "Daring Waverider": {
    // Cast during resolution (608.2g), exiled instead of going to the graveyard.
    abilities: [
      triggered(when.entersSelf, [fx.castNow(ref.target(), { free: true, after: "exile" })], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Instant", "Sorcery"], maxManaValue: 4 },
            "you",
            "instant or sorcery with MV 4 or less",
          ),
        ],
        label: "Casts an instant or sorcery for free",
      }),
    ],
  },
  "Dazzling Denial": {
    spell: spell(
      [target.spell()],
      [
        ...fx.when(
          cond.not(cond.controls({ types: ["Creature"], subtype: "Bird" })),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{2}" }, fx.counter(ref.target())),
        ),
        ...fx.when(
          cond.controls({ types: ["Creature"], subtype: "Bird" }),
          fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
        ),
      ],
    ),
  },
  "Dire Downdraft": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { anyOf: [{ attacking: true }, { tapped: true }] }) },
    spell: spell([target.creature()], [fx.topOrBottom(ref.target())]),
  },
  "Dour Port-Mage": {
    abilities: [
      triggered(when.leavesWithoutDying({ types: ["Creature"], controller: "you", other: true }), [fx.draw(1)], {
        batched: true,
        label: "Draw a card",
      }),
      activated({
        mana: "{1}{U}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.bounce(ref.target())],
        label: "Returns a creature",
      }),
    ],
  },
  "Eddymurk Crab": {
    costReduction: { generic: amount.countIn("graveyard", INSTANT_SORCERY) },
    abilities: [
      entersWith({ tapped: true, condition: cond.not(cond.yourTurn), label: "Tapped outside your turn" }),
      triggered(when.entersSelf, [fx.tap(ref.target())], {
        targets: [target.upTo(2, target.creature())],
        label: "Taps up to two creatures",
      }),
    ],
  },
  "Eluge, the Shoreless Sea": {
    cdaPT: amount.count({ types: ["Land"], subtype: "Island", controller: "you" }),
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          [fx.counters(ref.target(), "flood", 1), fx.modifyWhileCounter(ref.target(), { addSubtypes: ["Island"] }, "flood")],
          {
            targets: [target.permanent("t", ["Land"], {}, "land")],
            label: "Flood counter (Island)",
          },
        ),
      ),
      // "{U} (or {1}) less for each land with a flood counter" (118.7c; PLAN-L L4).
      costReducer(INSTANT_SORCERY, 0, "First instant or sorcery costs less", {
        colored: "U",
        genericAmount: amount.count({ types: ["Land"], controller: "you", withCounter: "flood" }),
        condition: cond.not(cond.amountAtLeast(amount.instantSorceryCast, 1)),
      }),
    ],
  },
  "Finch Formation": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["flying"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Flying",
      }),
    ],
  },
  "Gossip's Talent": {
    abilities: [triggered(when.enters(CREATURE_YOU_CONTROL), [fx.surveil(1)], { label: "Surveil 1" })],
    classLevels: [
      [
        triggered(when.attackWith(1), [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
          targets: [
            targetObj(
              "t",
              { types: ["Creature"], attacking: true, controller: "you", maxPower: 3 },
              "attacking creature with power 3 or less",
            ),
          ],
          label: "Can't be blocked",
        }),
      ],
      [
        triggered(
          when.combatDamage(CREATURE_YOU_CONTROL, true),
          fx.may("Exile this creature and return it?", ...blink(ref.eventObject)),
          { label: "Exiles and returns the creature" },
        ),
      ],
    ],
  },
  "Into the Flood Maw": {
    spell: spell(
      [
        {
          ...target.creature("t", { controller: "opponent" }),
          kickedFilter: { objects: { notTypes: ["Land"], controller: "opponent" } },
        },
      ],
      [fx.bounce(ref.target())],
    ),
  },
  Kitnap: {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    controlsEnchanted: true,
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Taps the creature" }),
      // "If the gift wasn't promised": read on the Aura (the gift of a permanent is not known to its effects).
      triggered(when.entersSelf, [fx.counters(ref.attached, "stun", 3)], {
        condition: cond.not(cond.gift),
        label: "Three stun counters (no gift)",
      }),
    ],
  },
  "Kitsa, Otterball Elite": {
    abilities: [
      activated({ tap: true, effects: fx.loot(1), label: "Draw, and then discard" }),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.spell("t", { types: ["Instant", "Sorcery"], controller: "you" }, "instant or sorcery you control")],
        effects: [fx.copySpell(ref.target(), 1)],
        activationCondition: cond.sourceMatches({ minPower: 3 }),
        label: "Copies an instant or sorcery",
      }),
    ],
  },
  Knightfisher: {
    abilities: [
      triggered(when.enters(kin(["Bird"], { other: true, token: false })), [fx.createTokens(FISH)], { label: "1/1 Fish" }),
    ],
  },
  "Long River Lurker": {
    abilities: [
      staticAbility(
        kin(["Frog"], { other: true }),
        { addKeywords: ["ward"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
        { label: "Ward {1}" },
      ),
      triggered(
        when.entersSelf,
        [
          fx.pump(ref.target(), 0, 0, ["unblockable"]),
          fx.modify(ref.target(), {
            addAbilities: [
              triggered(
                when.combatDamage("self"),
                fx.may(
                  "Exile this creature and return it?",
                  fx.exileCard(ref.self, { name: "b" }),
                  fx.toBattlefield(ref.stored("b")),
                ),
                { label: "Exiles and returns the creature" },
              ),
            ],
          }),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Can't be blocked" },
      ),
    ],
  },
  "Long River's Pull": {
    spell: spell(
      [{ ...target.spell("t", { types: ["Creature"] }, "creature spell"), kickedFilter: { spells: {} } }],
      [fx.counter(ref.target())],
    ),
  },
  "Mind Spiral": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("t", { controller: "opponent" }))],
      [fx.draw(3, ref.target("p")), ...fx.when(cond.gift, fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1))],
    ),
  },
  Mindwhisker: {
    abilities: [
      triggered(when.yourUpkeep, [fx.surveil(1)], { label: "Surveil 1" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { power: -1 },
        { condition: THRESHOLD, label: "Threshold: -1/-0" },
      ),
    ],
  },
  Mockingbird: {
    asEnters: [
      fx.chooseCopy(
        { types: ["Creature"], compare: [cmp.manaValue("<=", amount.sourceManaSpent)] },
        { anyController: true, except: { addSubtypes: ["Bird"], addKeywords: ["flying"] } },
      ),
    ],
  },
  "Nightwhorl Hermit": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["unblockable"] },
        { condition: THRESHOLD, label: "Threshold: +1/+0, can't be blocked" },
      ),
    ],
  },
  "Otterball Antics": {
    flashback: "{3}{U}",
    spell: spell(
      [],
      [
        fx.createTokens(OTTER, 1, undefined, "o"),
        ...fx.when(cond.not(cond.spellCastFromHand), fx.addCounters(ref.stored("o"), 1)),
      ],
    ),
  },
  "Pearl of Wisdom": {
    costReduction: { generic: 1, condition: cond.controls({ types: ["Creature"], subtype: "Otter" }) },
    spell: spell([], [fx.draw(2)]),
  },
  "Plumecreed Escort": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["hexproof"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Hexproof",
      }),
    ],
  },
  "Portent of Calamity": {
    // "For each card type, you may exile a card of that type": one choice, at most one card per card type; four or
    // more exiled: a spell among them may be cast for free, then the rest goes to the hand.
    spell: spell(
      [],
      [
        fx.lookAtTop(amount.x, {
          count: amount.x,
          onePerType: true,
          to: { to: "exile" },
          rest: "graveyard",
          store: "ex",
          revealAll: true,
        }),
        ...fx.when(cond.amountAtLeast(amount.v("ex"), 4), fx.castNow(ref.stored("ex"), { free: true })),
        fx.toHand(ref.stored("ex")),
      ],
    ),
  },
  "Season of Weaving": {
    spell: pawprint(
      { pips: 1, label: "Draw a card", effects: [fx.draw(1)] },
      {
        pips: 2,
        label: "Copy of an artifact or creature",
        // "Choose an artifact or creature you control": untargeted choice, on resolution.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Artifact", "Creature"] }), ref.you, "w", {
            prompt: "Choose the artifact or creature to copy",
          }),
          fx.copyToken(ref.stored("w")),
        ],
      },
      {
        pips: 3,
        label: "Returns each nonland, nontoken permanent",
        effects: [fx.moveAll("battlefield", ref.eachPlayer, { notTypes: ["Land"], token: false }, { to: "hand" })],
      },
    ),
  },
  "Shore Up": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 1, 1, ["hexproof"]), fx.untap(ref.target())],
    ),
  },
  "Shoreline Looter": {
    keywords: ["unblockable"],
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(1), ...fx.when(cond.not(THRESHOLD), fx.discard(1))], {
        label: "Threshold — Draw (discard without threshold)",
      }),
    ],
  },
  "Skyskipper Duo": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileCard(ref.target(), { name: "k" }), fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") })],
        {
          targets: [target.upTo(1, target.creature("t", { controller: "you", other: true }))],
          label: "Exiles a creature (it returns at the end step)",
        },
      ),
    ],
  },
  Spellgyre: {
    spell: modal(
      mode("Counter a spell", [target.spell()], [fx.counter(ref.target())]),
      mode("Surveil 2, then draw two cards", [], [fx.surveil(2), fx.draw(2)]),
    ),
  },
  "Splash Lasher": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "Taps a creature (stun counter)",
      }),
    ],
  },
  "Splash Portal": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [...fx.when(cond.refMatches(ref.target(), { anySubtype: BIRD_FROG_OTTER_RAT }), fx.draw(1)), ...blink(ref.target())],
    ),
  },
  "Stormchaser's Talent": {
    abilities: [triggered(when.entersSelf, [otter()], { label: "1/1 Otter with prowess" })],
    classLevels: [
      [
        triggered(when.classLevel(2), [fx.toHand(ref.target())], {
          targets: [target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery in your graveyard")],
          label: "Gets back an instant or sorcery",
        }),
      ],
      [triggered(when.castSpell("you", INSTANT_SORCERY), [otter()], { label: "1/1 Otter with prowess" })],
    ],
  },
  "Sugar Coat": {
    enchant: { filter: { anyOf: [{ types: ["Creature"] }, { subtype: "Food" }] }, label: "creature or Food" },
    abilities: [
      staticAbility(
        "attached",
        { setTypes: ["Artifact"], setSubtypes: ["Food"], setColors: [], loseAllAbilities: true, addAbilities: [FOOD_ABILITY] },
        { label: "Colorless Food" },
      ),
    ],
  },
  "Thought Shucker": {
    abilities: [
      activated({
        mana: "{1}{U}",
        once: true,
        activationCondition: THRESHOLD,
        effects: [fx.addCounters(ref.self, 1), fx.draw(1)],
        label: "Threshold — +1/+1 counter, draw",
      }),
    ],
  },
  "Thundertrap Trainer": {
    abilities: [
      triggered(when.entersSelf, [fx.lookAtTop(4, { filter: { notTypes: ["Creature", "Land"] } })], {
        label: "Looks at 4 cards: a noncreature spell",
      }),
    ],
  },
  "Valley Floodcaller": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: { notTypes: ["Creature"] }, keywords: ["flash"] },
        label: "Noncreature spells have flash",
      }),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.pumpAll(kin(BIRD_FROG_OTTER_RAT), 1, 1), fx.untapAll(kin(BIRD_FROG_OTTER_RAT))],
        { label: "Birds, Frogs, Otters and Rats +1/+1, untapped" },
      ),
    ],
  },
  "Waterspout Warden": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, 0, 0, ["flying"])], {
        condition: cond.controls({ types: ["Creature"], enteredThisTurn: true, other: true }),
        label: "Flying",
      }),
    ],
  },
  "Wishing Well": {
    abilities: [
      activated({
        tap: true,
        sorcerySpeed: true,
        effects: [
          fx.counters(ref.self, "coin", 1),
          fx.reflexive(
            [
              {
                ...target.cardInGraveyard("t", INSTANT_SORCERY, "you", "instant or sorcery with MV equal to the counters"),
                manaValueAmount: amount.countersOn(ref.self, "coin"),
              },
            ],
            [fx.castNow(ref.target(), { free: true, after: "exile" })],
          ),
        ],
        label: "Coin counter, casts a spell from the graveyard",
      }),
    ],
  },
};
