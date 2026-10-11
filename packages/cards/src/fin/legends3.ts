/** Final Fantasy — legendaries and unique cards (lot D3). */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chapter,
  cond,
  flashback,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  spree,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;
const PERMANENT_CARD = { permanent: true };
const SAGA_YOU = { subtype: "Saga", controller: "you" as const };
/** Choco: "look at that many cards", as many as the Birds that attacked (counted when it triggers). */
const CHOCO_LOOK = amount.eventAmount;

/** Sin: exile a permanent card at random, tapped copy; repeat if it was a land (at most six times). */
const sinRound = (k: number): ReturnType<typeof fx.when> => {
  const name = `sin${k}`;
  const body = [
    fx.pickFromZone("graveyard", PERMANENT_CARD, { to: "exile" }, { random: true, store: name }),
    fx.copyToken(ref.stored(name), { tapped: true }),
  ];
  return k === 0 ? body.flat() : fx.when(cond.refMatches(ref.stored(`sin${k - 1}`), { types: ["Land"] }), ...body);
};

export const LEGENDS3: Record<string, CardScript> = {
  "Clash of the Eikons": {
    spell: spree(
      {
        cost: "{0}",
        label: "Fight",
        targets: [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        effects: [fx.fight(ref.target("a"), ref.target("b"))],
      },
      {
        cost: "{0}",
        label: "Remove a lore counter",
        targets: [targetObj("r", SAGA_YOU, "Saga you control")],
        effects: [fx.removeCounters(ref.target("r"), 1, "lore")],
      },
      {
        cost: "{0}",
        label: "Put a lore counter",
        targets: [targetObj("l", SAGA_YOU, "Saga you control")],
        effects: [fx.counters(ref.target("l"), "lore", 1)],
      },
    ),
  },
  "Summon: Fenrir": {
    abilities: [
      chapter([1], [fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })], {
        label: "Crescent Fang",
      }),
      chapter([2], [fx.nextCreatureSpell({ counters: 1 })], { label: "Heavenward Howl" }),
      chapter([3], [fx.when(cond.controlsGreatestPower, fx.draw(1))], { label: "Ecliptic Growl" }),
    ],
  },
  "Torgal, A Fine Hound": {
    abilities: [
      triggered(
        when.castSpell("you", { types: ["Creature"], subtype: "Human" }),
        [fx.spellArrivalCounters(ref.eventObject, amount.count({ ...YOURS, anyOf: [{ subtype: "Dog" }, { subtype: "Wolf" }] }))],
        { oncePerTurn: true, label: "First Human: counters for each Dog or Wolf" },
      ),
      manaAbility([...ALL_COLORS]),
    ],
  },
  "Summon: Brynhildr": {
    abilities: [
      chapter([1], [fx.exileTop(ref.you, 1, "b"), fx.link(ref.stored("b")), fx.grantPlay(ref.stored("b"))], {
        label: "Chain: exile the top card",
      }),
      chapter([2, 3], [fx.grantPlay(ref.linked), fx.nextCreatureSpell({ haste: true })], { label: "Gestalt Mode" }),
    ],
  },
  "Lightning, Army of One": {
    abilities: [triggered(when.combatDamageToPlayer, [fx.doubleDamageTo(ref.eventPlayer)], { label: "Stagger" })],
  },
  "Noctis, Prince of Lucis": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { types: ["Artifact"] }, what: "spells", payLife: 3, finality: true },
        label: "Artifacts from your graveyard (3 life, finality)",
      }),
    ],
  },
  "Omega, Heartless Evolution": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.counters(ref.target(), "stun", amount.count({ types: ["Land"], basic: false, controller: "you" })),
          fx.gainLife(amount.count({ types: ["Land"], basic: false, controller: "you" })),
        ],
        {
          targets: [{ ...target.upTo(8, target.nonland("t", { controller: "opponent" })), differentPlayers: true }],
          label: "Wave Cannon",
        },
      ),
    ],
  },
  "Vivi Ornitier": {
    abilities: [
      manaAbility(["U", "R"], 1, {
        selfPower: true,
        noTap: true,
        oncePerTurn: true,
        condition: cond.yourTurn,
        combination: true,
      }),
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.addCounters(ref.self, 1), fx.damage(1, ref.eachOpponent)],
        { label: "+1/+1 counter, 1 damage to each opponent" },
      ),
    ],
  },
  "Garnet, Princess of Alexandria": {
    abilities: [
      // "From each of any number of Sagas": the Sagas are chosen (none is possible).
      triggered(
        when.attacksSelf,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Saga", withCounter: "lore" }), ref.you, "sagas", {
            anyNumber: true,
            prompt: "Remove a lore counter from each of these Sagas",
          }),
          fx.removeCounters(ref.stored("sagas"), 1, "lore", "g"),
          fx.addCounters(ref.self, amount.v("g")),
        ],
        { label: "Lore counters → +1/+1 counters" },
      ),
    ],
  },
  "Choco, Seeker of Paradise": {
    abilities: [
      // The cards looked at stay on top while the one for the hand is chosen, then the lands among the others;
      // the rest goes to the graveyard (without being milled).
      triggered(
        when.attackWith(1, { ...YOURS, subtype: "Bird" }),
        [
          fx.lookAtTop(CHOCO_LOOK, { count: 1, rest: "top", store: "h" }),
          fx.lookAtTop(amount.plus(CHOCO_LOOK, amount.neg(amount.v("h"))), {
            filter: { types: ["Land"] },
            count: CHOCO_LOOK,
            to: { to: "battlefield", tapped: true },
            rest: "graveyard",
          }),
        ],
        { label: "Attacking Birds: look at that many cards" },
      ),
      triggered(when.landfall, [fx.pump(ref.self, 1, 0)], { label: "Landfall: +1/+0" }),
    ],
  },
  "Sin, Spira's Punishment": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(t, [0, 1, 2, 3, 4, 5].map(sinRound), { label: "Copy of a random permanent card" }),
      ),
    ],
  },
  "Memories Returning": {
    castOptions: [flashback("{7}{U}{U}")],
    // You and the chosen opponent take turns among the five revealed cards (PLAN-L L4): each choice is made among those
    // not chosen yet (`chooseAmong` keeps them as "<name>Rest").
    spell: spell(
      [],
      [
        fx.reveal(ref.libraryTopCards(ref.you, 5)),
        fx.chooseAmong(ref.libraryTopCards(ref.you, 5), ref.you, "a", { anyZone: true, prompt: "Put one into your hand" }),
        fx.toHand(ref.stored("a")),
        fx.chooseOpponent("o"),
        fx.chooseAmong(ref.stored("aRest"), ref.stored("o"), "b", {
          anyZone: true,
          prompt: "Put one on the bottom of their library",
        }),
        fx.moveTo(ref.stored("b"), { to: "libraryBottom" }),
        fx.chooseAmong(ref.stored("bRest"), ref.you, "c", { anyZone: true, prompt: "Put one into your hand" }),
        fx.toHand(ref.stored("c")),
        fx.chooseAmong(ref.stored("cRest"), ref.stored("o"), "d", {
          anyZone: true,
          prompt: "Put one on the bottom of their library",
        }),
        fx.moveTo(ref.stored("d"), { to: "libraryBottom" }),
        fx.toHand(ref.stored("dRest")),
      ],
    ),
  },
  "Balthier and Fran": {
    abilities: [
      staticAbility(
        { subtype: "Vehicle", controller: "you" },
        { power: 1, toughness: 1, addKeywords: ["reach", "vigilance"] },
        { label: "Your Vehicles: +1/+1, reach and vigilance" },
      ),
      triggered(
        when.attacks({ subtype: "Vehicle", controller: "you", crew: "bySource" }),
        fx.mayPay("{1}{R}{G}", "Pay {1}{R}{G} for an additional combat phase?", fx.extraCombat),
        { condition: cond.firstCombat, label: "Additional combat" },
      ),
    ],
  },
  "Aettir and Priwen": {
    abilities: [
      staticAbility(
        "attached",
        { setPower: 1, setToughness: 1 },
        { perLife: true, label: "Base power and toughness equal to your life total" },
      ),
    ],
  },
  Blitzball: {
    abilities: [
      manaAbility([...ALL_COLORS]),
      activated({
        tap: true,
        sacrifice: true,
        activationCondition: cond.opponentDamagedByLegendary,
        effects: [fx.draw(2)],
        label: "GOOOAL! Draw two cards",
      }),
    ],
  },
  "Genji Glove": {
    abilities: [
      staticAbility("attached", { addKeywords: ["doubleStrike"] }, { label: "Double strike" }),
      triggered(when.attacks({ attached: "host" }), [fx.untap(ref.eventObject), fx.extraCombat], {
        condition: cond.firstCombat,
        label: "Untap it, additional combat phase",
      }),
    ],
  },
  "Cloud, Planet's Champion": {
    rules: { equipDiscountWhenTargeted: 2 },
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["doubleStrike", "indestructible"] },
        { condition: cond.all(cond.yourTurn, cond.sourceMatches({ equipped: true })), label: "Equipped during your turn" },
      ),
    ],
  },
};
