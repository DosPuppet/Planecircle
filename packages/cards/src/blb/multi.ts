/** Bloomburrow — multicolored cards (legendaries included). */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  BAT_1,
  type CardScript,
  CRAGFLAME,
  CREATURE_YOU_CONTROL,
  cond,
  costReducer,
  entersWith,
  expend,
  FLYER_YOU,
  FOOD,
  FOOD_ABILITY,
  fx,
  GAINED_OR_LOST,
  graveyardReplacement,
  INSTANT_SORCERY,
  kin,
  loyalty,
  manaAbility,
  mode,
  NONFLYER_YOU,
  otter,
  playerStatic,
  RABBIT,
  ref,
  SQUIRREL,
  staticAbility,
  THRESHOLD,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VREN_RAT,
  valiant,
  when,
} from "./common";

const NONCREATURE = { notTypes: ["Creature" as const] };
const blinkWithCounter = [
  fx.exileCard(ref.target(), { name: "b" }),
  fx.toBattlefield(ref.stored("b"), { counters: { kind: "+1/+1", n: 1 } }),
];

export const MULTI: Record<string, CardScript> = {
  "Alania, Divergent Storm": {
    abilities: [
      triggered(
        // The copy of an Otter spell becomes a token as it resolves (707.10).
        { on: "castSpell", by: "you", firstOf: ["Instant", "Sorcery", "Otter"] },
        fx.may("Have an opponent draw a card to copy this spell?", fx.draw(1, ref.target()), fx.copySpell(ref.eventObject, 1)),
        { targets: [target.player("t", "opponent")], label: "Copies the spell (an opponent draws)" },
      ),
    ],
  },
  "Baylen, the Haymaker": {
    abilities: [
      activated({
        tapOthers: { filter: { token: true }, count: 2 },
        effects: [fx.addManaChoice(1)],
        label: "Tap two tokens: one mana",
      }),
      activated({
        tapOthers: { filter: { token: true }, count: 3 },
        effects: [fx.draw(1)],
        label: "Tap three tokens: draw",
      }),
      activated({
        tapOthers: { filter: { token: true }, count: 4 },
        effects: [fx.addCounters(ref.self, 3), fx.pump(ref.self, 0, 0, ["trample"])],
        label: "Tap four tokens: three +1/+1 counters",
      }),
    ],
  },
  "Burrowguard Mentor": { cda: { pt: amount.count(CREATURE_YOU_CONTROL) } },
  "Camellia, the Seedmiser": {
    abilities: [
      staticAbility(kin(["Squirrel"], { other: true }), { addKeywords: ["menace"] }, { label: "Menace" }),
      triggered(when.sacrifice({ subtype: "Food" }), [fx.createTokens(SQUIRREL)], { batched: true, label: "1/1 Squirrel" }),
      activated({
        mana: "{2}",
        forage: true,
        effects: [fx.addCountersAll(kin(["Squirrel"], { other: true }), 1)],
        label: "Forage: +1/+1 counter on each other Squirrel",
      }),
    ],
  },
  "Cindering Cutthroat": {
    abilities: [
      entersWith({ counters: 1, condition: cond.opponentLostLife, label: "A +1/+1 counter" }),
      activated({ mana: "{1}{B/R}", effects: [fx.pump(ref.self, 0, 0, ["menace"])], label: "Menace" }),
    ],
  },
  "Clement, the Worrywort": {
    abilities: [
      triggered(when.enters(CREATURE_YOU_CONTROL), [fx.bounce(ref.target())], {
        targets: [
          {
            ...target.upTo(1, target.creature("t", { controller: "you" })),
            // "Lesser" than that of the creature that entered, on targeting then on resolution (608.2b).
            maxManaValueAmount: amount.plus(amount.manaValueOf(ref.eventObject), -1),
          },
        ],
        label: "Returns a creature with lesser MV",
      }),
      staticAbility(
        kin(["Frog"]),
        { addAbilities: [manaAbility(["G", "U"], 1, { restriction: { spell: { types: ["Creature"] } } })] },
        { label: "{T}: {G} or {U} (creature spells)" },
      ),
    ],
  },
  "Corpseberry Cultivator": {
    abilities: [
      triggered(when.yourCombat, fx.mayForage("Fourrager ?"), { label: "Forage" }),
      triggered(when.forage, [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
    ],
  },
  "Dreamdew Entrancer": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.counters(ref.target(), "stun", 3),
          ...fx.when(cond.refMatches(ref.target(), { controller: "you" }), fx.draw(2)),
        ],
        { targets: [target.upTo(1, target.creature())], label: "Taps a creature (three stun counters)" },
      ),
    ],
  },
  "Finneas, Ace Archer": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCountersAll({ ...CREATURE_YOU_CONTROL, other: true, anyOf: [{ token: true }, { subtype: "Rabbit" }] }, 1),
          ...fx.when(cond.amountAtLeast(amount.totalPower(CREATURE_YOU_CONTROL), 10), fx.draw(1)),
        ],
        { label: "Counters on tokens and Rabbits; draw at power 10" },
      ),
    ],
  },
  "Fireglass Mentor": {
    abilities: [
      triggered(when.secondMain, [fx.impulse(2)], {
        condition: cond.opponentLostLife,
        label: "Exiles two cards, play one of them",
      }),
    ],
  },
  "Gev, Scaled Scorch": {
    abilities: [
      entersWith({
        affects: { types: ["Creature"], controller: "you", other: true },
        counters: amount.opponentsLostLife,
        label: "Counters for each opponent who lost life",
      }),
      triggered(when.castSpell("you", { subtype: "Lizard" }), [fx.damage(1, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "1 damage to an opponent",
      }),
    ],
  },
  "Glarb, Calamity's Augur": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "Look at the top card" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ types: ["Land"] }, { minManaValue: 4, notTypes: ["Land"] }] } },
        label: "Lands and spells with MV 4 or greater from the top",
      }),
      activated({ tap: true, effects: [fx.surveil(2)], label: "Surveil 2" }),
    ],
  },
  "Head of the Homestead": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(RABBIT, 2)], { label: "Two 1/1 Rabbits" })],
  },
  "Helga, Skittish Seer": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"], minManaValue: 4 }),
        [fx.draw(1), fx.gainLife(1), fx.addCounters(ref.self, 1)],
        { label: "Draw, +1 life, +1/+1 counter" },
      ),
      manaAbility(["W", "U", "B", "R", "G"], 1, {
        selfPower: true,
        restriction: { spell: { types: ["Creature"], anyOf: [{ minManaValue: 4 }, { hasX: true }] } },
      }),
    ],
  },
  "Hugs, Grisly Guardian": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.exileTop(ref.you, amount.sourceX, "h"), fx.grantPlay(ref.stored("h"), { untilYourNextTurn: true })],
        { label: "Exiles X cards (playable until your next turn)" },
      ),
      playerStatic({ extraLands: 1, label: "An additional land" }),
    ],
  },
  "The Infamous Cruelclaw": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        // "By discarding a card rather than paying its mana cost": the discard is paid while casting (601.2h).
        [fx.exileUntil({ notTypes: ["Land"] }, "c"), fx.castNow(ref.stored("c"), { free: true, discard: 1 })],
        { label: "Exiles up to one nonland card; cast it by discarding" },
      ),
    ],
  },
  "Junkblade Bruiser": {
    abilities: [expend(4, [fx.pump(ref.self, 2, 1)], { label: "+2/+1" })],
  },
  "Kastral, the Windcrested": {
    abilities: [
      triggeredModal(when.combatDamageBatch(kin(["Bird"])), [
        mode(
          "A Bird from your hand or graveyard",
          [],
          [
            fx.pickFromZone(
              "hand",
              { types: ["Creature"], subtype: "Bird" },
              { to: "battlefield", counters: { kind: "finality", n: 1 } },
              {
                min: 0,
                store: "k",
                prompt: "Bird from your hand (or none)",
              },
            ),
            ...fx.when(
              cond.not(cond.v("k")),
              fx.pickFromZone(
                "graveyard",
                { types: ["Creature"], subtype: "Bird" },
                { to: "battlefield", counters: { kind: "finality", n: 1 } },
                { min: 0, prompt: "Bird from your graveyard" },
              ),
            ),
          ],
        ),
        mode("+1/+1 counter on each Bird", [], [fx.addCountersAll(kin(["Bird"]), 1)]),
        mode("Draw a card", [], [fx.draw(1)]),
      ]),
    ],
  },
  "Lilysplash Mentor": {
    abilities: [
      activated({
        mana: "{1}{G}{U}",
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: blinkWithCounter,
        label: "Exiles and returns a creature (+1/+1 counter)",
      }),
    ],
  },
  "Lunar Convocation": {
    abilities: [
      triggered(when.yourEndStep, [fx.loseLife(1, ref.eachOpponent)], {
        condition: cond.lifeGainedAtLeast(1),
        label: "Each opponent loses 1 life",
      }),
      triggered(when.yourEndStep, [fx.createTokens(BAT_1)], {
        condition: cond.all(cond.lifeGainedAtLeast(1), cond.lostLife),
        label: "1/1 flying Bat",
      }),
      activated({ mana: "{1}{B}", payLife: 2, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Mabel, Heir to Cragflame": {
    abilities: [
      staticAbility(kin(["Mouse"], { other: true }), { power: 1, toughness: 1 }, { label: "Mice +1/+1" }),
      triggered(when.entersSelf, [fx.createTokens(CRAGFLAME)], { label: "Cragflame (Equipment)" }),
    ],
  },
  "Mind Drill Assailant": {
    abilities: [
      staticAbility("self", { power: 3 }, { condition: THRESHOLD, label: "Threshold: +3/+0" }),
      activated({ mana: "{2}{U/B}", effects: [fx.surveil(1)], label: "Surveil 1" }),
    ],
  },
  "Moonrise Cleric": {
    abilities: [triggered(when.attacksSelf, [fx.gainLife(1)], { label: "+1 life" })],
  },
  "Muerra, Trash Tactician": {
    abilities: [
      triggered(when.step("main1", "you"), [fx.addManaCombination(amount.count(kin(["Raccoon"])), ["R", "G"])], {
        label: "{R} or {G} for each Raccoon",
      }),
      expend(4, [fx.gainLife(3)], { label: "+3 life" }),
      expend(8, [fx.exileTop(ref.you, 2, "m"), fx.grantPlay(ref.stored("m"), { untilYourNextTurn: true })], {
        label: "Exiles two cards (playable)",
      }),
    ],
  },
  "Plumecreed Mentor": {
    abilities: [
      triggered(when.enters(FLYER_YOU), [fx.addCounters(ref.target(), 1)], {
        targets: [targetObj("t", NONFLYER_YOU, "creature without flying you control")],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Pond Prophet": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })] },
  "Ral, Crackling Wit": {
    abilities: [
      triggered(when.castSpell("you", NONCREATURE), [fx.counters(ref.self, "loyalty", 1)], { label: "Loyalty counter" }),
      loyalty(1, { effects: [otter()], label: "1/1 Otter with prowess" }),
      loyalty(-3, { effects: [fx.draw(3), fx.discard(2)], label: "Draw three cards, discard two" }),
      loyalty(-10, {
        effects: [
          fx.draw(3),
          fx.emblem("Ral", msg("Instant and sorcery spells you cast have storm."), [
            // Storm (702.40a): the spells cast before it this turn by all players, counted when it was cast.
            triggered(when.castSpellStorm(INSTANT_SORCERY), [fx.copySpell(ref.eventObject, amount.eventAmount)], {
              label: "Storm",
            }),
          ]),
        ],
        label: "Draw three cards, emblem (storm)",
      }),
    ],
  },
  "Seedglaive Mentor": { abilities: [valiant([fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" })] },
  "Seedpod Squire": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 1, 1)], {
        targets: [targetObj("t", NONFLYER_YOU, "creature without flying you control")],
        label: "+1/+1",
      }),
    ],
  },
  "Starseer Mentor": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.target(), 3, { discard: true, sacrifice: { notTypes: ["Land"] } })], {
        condition: GAINED_OR_LOST,
        targets: [target.player("t", "opponent")],
        label: "Loses 3 life unless sacrifice or discard",
      }),
    ],
  },
  "Stormcatch Mentor": { abilities: [costReducer(INSTANT_SORCERY, 1, "Instants and sorceries cost {1} less")] },
  "Tempest Angler": {
    abilities: [triggered(when.castSpell("you", NONCREATURE), [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" })],
  },
  "Tidecaller Mentor": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        condition: THRESHOLD,
        targets: [target.upTo(1, target.nonland("t"))],
        label: "Threshold — returns a nonland permanent",
      }),
    ],
  },
  "Veteran Guardmouse": {
    abilities: [valiant([fx.pump(ref.self, 1, 0, ["firstStrike"]), fx.scry(1)], { label: "+1/+0, first strike, scry 1" })],
  },
  "Vinereap Mentor": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Food" }),
      triggered(when.diesSelf, [fx.createTokens(FOOD)], { label: "Food" }),
    ],
  },
  "Vren, the Relentless": {
    abilities: [
      graveyardReplacement({
        fromBattlefield: true,
        filter: { types: ["Creature"], controller: "opponent" },
        label: "Opponents' creatures are exiled",
      }),
      triggered(when.eachEndStep, [fx.createTokens(VREN_RAT, amount.opponentCreaturesExiledThisTurn)], {
        label: "Rats for each exiled creature of opponents",
      }),
    ],
  },
  "Wandertale Mentor": {
    abilities: [expend(4, [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }), manaAbility(["R", "G"])],
  },
  "Ygra, Eater of All": {
    abilities: [
      staticAbility(
        { types: ["Creature"], other: true },
        { addTypes: ["Artifact"], addSubtypes: ["Food"], addAbilities: [FOOD_ABILITY] },
        { label: "Other creatures are Foods" },
      ),
      triggered(when.dies({ types: ["Artifact"], subtype: "Food" }), [fx.addCounters(ref.self, 2)], {
        label: "Two +1/+1 counters",
      }),
    ],
  },
  "Zoraline, Cosmos Caller": {
    abilities: [
      triggered(when.attacks(kin(["Bat"])), [fx.gainLife(1)], { label: "+1 life" }),
      ...[when.entersSelf, when.attacksSelf].map((w) =>
        triggered(
          w,
          fx.mayPayWithLife(
            "{W}{B}",
            2,
            "Pay {W}{B} and 2 life to reanimate a permanent?",
            fx.reflexive(
              [
                target.cardInGraveyard(
                  "t",
                  { notTypes: ["Land"], permanent: true, maxManaValue: 3 },
                  "you",
                  "nonland permanent with MV 3 or less",
                ),
              ],
              [fx.toBattlefield(ref.target(), { counters: { kind: "finality", n: 1 } })],
            ),
          ),
          { label: "Reanimates a permanent (finality counter)" },
        ),
      ),
    ],
  },
  "Bria, Riptide Rogue": {
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you", other: true }, { addKeywords: ["prowess"] }, { label: "Prowess" }),
      triggered(when.castSpell("you", NONCREATURE), [fx.pump(ref.target(), 0, 0, ["unblockable"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Can't be blocked",
      }),
    ],
  },
  "Byrke, Long Ear of the Law": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "A +1/+1 counter on up to two creatures",
      }),
      triggered(
        when.attacks({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }),
        [fx.doubleCounters(ref.eventObject)],
        {
          label: "Doubles its +1/+1 counters",
        },
      ),
    ],
  },
};
