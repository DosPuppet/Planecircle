/**
 * Duskmourn, lot D: the last 18 cards (player Aura, Valgavoth, Kaito's ninjutsu, Leylines, damage doubling under
 * delirium, variable number of targets, Marvin…).
 */
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  castPermission,
  cond,
  cost,
  entersWith,
  eventReplacement,
  fromGraveyard,
  fx,
  graveyardReplacement,
  loyalty,
  manaAbility,
  playerStatic,
  ref,
  SPIDER,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const ANY_COLOR = ["W", "U", "B", "R", "G"] as const;

export const LEGENDS2: Record<string, CardScript> = {
  "Grievous Wound": {
    enchant: { filter: {}, label: "player", player: true },
    abilities: [
      playerStatic({ cantGainLife: true, affects: "enchanted", label: "Enchanted player can't gain life" }),
      triggered(when.attachedPlayerDamaged, [fx.loseLife(amount.halfLife(ref.attached), ref.attached)], {
        label: "They lose half their life",
      }),
    ],
  },
  "Miasma Demon": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.discard(amount.cardsIn("hand"), ref.you, { optional: true, store: "d" }),
          ...fx.when(
            cond.v("d"),
            fx.reflexive([{ ...target.upTo(1, target.creature()), countAmount: amount.v("d") }], [fx.pump(ref.target(), -2, -2)]),
          ),
        ],
        { label: "Discard cards: that many creatures -2/-2" },
      ),
    ],
  },
  "Valgavoth, Terror Eater": {
    abilities: [
      graveyardReplacement({
        graveyardOf: "opponent",
        notControlledByYou: true,
        filter: { token: false },
        link: "object",
        label: "Opponents' cards are exiled",
      }),
      playerStatic({
        playFrom: { zone: "linked", payLifeManaValue: true },
        condition: cond.yourTurn,
        label: "Opponents' cards are exiled; playable during your turn for life",
      }),
    ],
  },
  "Warped Space": {
    // "Once each turn, you may pay {0} rather than pay the mana cost for a spell you cast from exile."
    abilities: [
      castPermission({ freeFrom: "exile", freeOncePerTurn: true, label: "Once each turn, {0} for a spell cast from exile" }),
    ],
  },
  "Norin, Swift Survivalist": {
    keywords: ["cantBlock"],
    abilities: [
      triggered(
        when.becomesBlocked(CREATURE_YOU_CONTROL),
        [
          ...fx.may(
            "Exile that creature (playable this turn)?",
            fx.exileCard(ref.eventObject, { name: "x" }),
            fx.grantPlay(ref.stored("x")),
          ),
        ],
        { label: "Exile the blocked creature, playable this turn" },
      ),
    ],
  },
  "The Rollercrusher Ride": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you" },
        combat: false,
        modify: { times: 2 },
        condition: cond.delirium,
        label: "Delirium — noncombat damage doubled",
      }),
      triggered(when.entersSelf, [fx.damage(amount.sourceX, ref.target())], {
        targets: [{ ...target.upTo(1, target.creature()), countAmount: amount.sourceX }],
        label: "X damage to each of up to X creatures",
      }),
    ],
  },
  "Trial of Agony": {
    spell: spell(
      [{ ...target.exactly(2, target.creature("t", { controller: "opponent" })), samePlayer: true }],
      [
        fx.chooseAmong(ref.target(), ref.controllerOf(ref.target()), "c"),
        fx.damage(5, ref.stored("c")),
        fx.pump(ref.stored("cRest"), 0, 0, ["cantBlock"]),
      ],
    ),
  },
  "Turn Inside Out": {
    spell: spell(
      [target.creature()],
      [
        fx.pump(ref.target(), 3, 0),
        fx.whenThisTurn(when.dies({}), ref.target(), [fx.manifestDread], { label: "Manifest dread" }),
      ],
    ),
  },
  "Leyline of Mutation": {
    leyline: true,
    abilities: [
      playerStatic({
        altCostAll: { mana: cost("{W}{U}{B}{R}{G}") },
        label: "Your spells: {W}{U}{B}{R}{G} rather than their cost",
      }),
    ],
  },
  "Monstrous Emergence": {
    // Additional cost: behold a creature (chosen by the player), whose power is read on resolution.
    additionalCost: { behold: { filter: { types: ["Creature"] }, required: true } },
    spell: spell([target.creature()], [fx.damage(amount.powerOf(ref.cost("beheld")), ref.target())]),
  },
  "Twitching Doll": {
    abilities: [
      manaAbility([...ANY_COLOR], 1, { addCounter: "nest" }),
      activated({
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(SPIDER, amount.lkiCounters("any"))],
        label: "A 2/2 Spider for each counter",
      }),
    ],
  },
  "Kaito, Bane of Nightmares": {
    abilities: [
      activated({
        mana: "{1}{U}{B}",
        fromHand: true,
        returnUnblockedAttacker: true,
        // 702.49c: it attacks what the returned creature was attacking.
        effects: [fx.toBattlefield(ref.self, { tapped: true, attacking: ref.cost("defender") })],
        label: "Ninjutsu {1}{U}{B}",
      }),
      staticAbility(
        "self",
        { addTypes: ["Creature"], addSubtypes: ["Ninja"], setPower: 3, setToughness: 4, addKeywords: ["hexproof"] },
        { condition: cond.all(cond.yourTurn, cond.counterAtLeast("loyalty", 1)), label: "During your turn: 3/4 Ninja" },
      ),
      loyalty(1, {
        effects: [
          fx.emblem("Kaito, Bane of Nightmares", "Ninjas you control get +1/+1.", [
            staticAbility({ types: ["Creature"], subtype: "Ninja", controller: "you" }, { power: 1, toughness: 1 }),
          ]),
        ],
        label: "Emblem: your Ninjas +1/+1",
      }),
      loyalty(0, { effects: [fx.surveil(2), fx.draw(amount.opponentsLostLife)], label: "Surveil 2, draw" }),
      loyalty(-2, {
        targets: [target.creature()],
        effects: [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 2)],
        label: "Tap a creature, two stun counters",
      }),
    ],
  },
  "Smoky Lounge": {
    abilities: [
      // {R}{R} added at the beginning of your first main phase (restricted mana in the pool).
      triggered(when.step("main1", "you"), [fx.addManaChoice(2, ["R"], { spell: { subtype: "Room" }, ability: ["unlock"] })], {
        label: "Add {R}{R}, for Room spells and unlocking doors",
      }),
    ],
  },
  "Undead Sprinter": {
    castOptions: [fromGraveyard({ condition: cond.creatureDiedMatching({ types: ["Creature"], notSubtype: "Zombie" }) })],
    abilities: [
      entersWith({ counters: 1, condition: cond.castFromGraveyard, label: "+1/+1 counter (cast from your graveyard)" }),
    ],
  },
  "Winter, Misanthropic Guide": {
    abilities: [
      triggered(when.yourUpkeep, [fx.draw(2, ref.eachPlayer)], { label: "Each player draws two cards" }),
      playerStatic({
        maxHandSize: amount.plus(7, amount.neg(amount.cardTypesInGraveyard)),
        affects: "opponents",
        condition: cond.delirium,
        label: "Delirium — opponents' maximum hand size: 7 minus the types",
      }),
    ],
  },
  "Ghost Vacuum": {
    abilities: [
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))],
        label: "Exile a card from a graveyard",
      }),
      activated({
        mana: "{6}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        effects: [
          fx.moveTo(
            ref.filtered(ref.linked, { types: ["Creature"] }),
            { to: "battlefield", underYourControl: true, counters: { kind: "flying", n: 1 }, addSubtypes: ["Spirit"] },
            { name: "s" },
          ),
          fx.modify(ref.stored("s"), { setPower: 1, setToughness: 1 }, "permanent"),
        ],
        label: "The exiled creatures return as 1/1 flying Spirits",
      }),
    ],
  },
  "Haunted Screen": {
    abilities: [
      manaAbility(["W", "B"]),
      manaAbility(["G", "U", "R"], 1, { payLife: 1 }),
      activated({
        mana: "{7}",
        once: true,
        effects: [
          fx.addCounters(ref.self, 7),
          fx.modify(ref.self, { addTypes: ["Creature"], addSubtypes: ["Spirit"], setPower: 0, setToughness: 0 }, "permanent"),
        ],
        label: "Seven +1/+1 counters: becomes a 0/0 Spirit",
      }),
    ],
  },
  "Marvin, Murderous Mimic": {
    abilities: [
      staticAbility(
        "self",
        { gainAbilitiesOf: { zone: "battlefield", filter: { types: ["Creature"], controller: "you" } } },
        {
          label: "Has the activated abilities of your other creatures",
        },
      ),
    ],
  },
};
