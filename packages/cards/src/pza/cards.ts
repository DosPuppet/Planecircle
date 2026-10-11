/** Source Material (PZA): card scripts (PLAN-G). */
import type { Effect } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  playerStatic,
  protection,
  RAT,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "../tdm/common";

const RATS = { types: ["Creature" as const], subtype: "Rat", controller: "you" as const };
const EQUIPPED = { types: ["Creature" as const], attached: "host" as const };
const PAY_FOR_RATS = "pay any amount of life (one Rat per life)";
/** Plague of Vermin: at most that many rounds of payments (a safety cap, docs/approximations.md). */
const PLAGUE_ROUNDS = 20;
const SEATS = [0, 1, 2, 3, 4, 5];

/**
 * Plague of Vermin: "starting with you, each player may pay any amount of life. Repeat this process until no one pays
 * life": round `r` (you `a<r>`, then each opponent `b<r>_<n>` in turn order) is followed by another one only if someone
 * paid in it.
 */
function plagueRound(r: number): Effect[] {
  const pays = [
    fx.payLifeX(PAY_FOR_RATS, `a${r}`),
    ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [fx.payLifeX(PAY_FOR_RATS, `b${r}_${n}`, p)]),
  ];
  if (r + 1 >= PLAGUE_ROUNDS) return pays;
  const someonePaid = cond.any(cond.v(`a${r}`), ...SEATS.map((n) => cond.v(`b${r}_${n}`)));
  return [...pays, ...fx.when(someonePaid, plagueRound(r + 1))];
}
const ROUNDS = Array.from({ length: PLAGUE_ROUNDS }, (_, r) => r);

export const CARDS: Record<string, CardScript> = {
  // Modular 1: read from the text.
  "Arcbound Ravager": {
    abilities: [
      activated({
        sacrificeOther: { filter: { types: ["Artifact"] }, includeSelf: true },
        effects: [fx.addCounters(ref.self, 1)],
        label: "Sacrifice an artifact: a +1/+1 counter",
      }),
    ],
  },
  // Graft 2: read from the text.
  "Cytoplast Manipulator": {
    abilities: [
      activated({
        mana: "{U}",
        tap: true,
        targets: [target.creature("t", { withCounter: "+1/+1" })],
        // "For as long as this creature remains on the battlefield" (PLAN-L L4).
        effects: [fx.gainControlWhileSource(ref.target(), false, true)],
        label: "Control of a creature with a +1/+1 counter, for as long as this one remains",
      }),
    ],
  },
  // — G9 : Source Material —
  "Teleportation Circle": {
    abilities: [
      triggered(when.step("end"), [fx.moveTo(ref.target(), { to: "exile" }, { name: "f" }), fx.toBattlefield(ref.stored("f"))], {
        targets: [
          target.optional(target.permanent("t", ["Artifact", "Creature"], { controller: "you" }, "your artifact or creature")),
        ],
        label: "Exile, then return one of your artifacts or creatures",
      }),
    ],
  },
  "Ashcoat of the Shadow Swarm": {
    abilities: [
      triggered(when.attacksSelf, [fx.pumpAll({ ...RATS, other: true }, amount.count(RATS), amount.count(RATS))], {
        label: "Your other Rats get +X/+X (X: your Rats)",
      }),
      triggered({ on: "blocks", who: "self" }, [fx.pumpAll({ ...RATS, other: true }, amount.count(RATS), amount.count(RATS))], {
        label: "Your other Rats get +X/+X (X: your Rats)",
      }),
      triggered(
        when.step("end"),
        fx.may(
          "mill four cards",
          fx.mill(4),
          fx.pickFromZone("graveyard", { types: ["Creature"], subtype: "Rat" }, { to: "hand" }, { count: 2, min: 0 }),
        ),
        { label: "You may mill four cards, then get back up to two Rats" },
      ),
    ],
  },
  "Silverclad Ferocidons": {
    abilities: [
      triggered(when.isDealtDamage, [fx.sacrifice(ref.eachOpponent, { permanent: true })], {
        label: "Enrage: each opponent sacrifices a permanent",
      }),
    ],
  },
  "Rhythm of the Wild": {
    abilities: [
      playerStatic({
        uncounterable: { filter: { types: ["Creature"] } },
        label: "Your creature spells can't be countered",
      }),
      staticAbility(
        { types: ["Creature"], controller: "you", token: false },
        { addKeywords: ["riot"] },
        {
          label: "Your nontoken creatures have riot",
        },
      ),
    ],
  },
  // Equip {2}: read from the text.
  "Conqueror's Flail": {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { perAmount: amount.colorsAmong(), label: "+1/+1 for each color among your permanents" },
      ),
      playerStatic({
        castLimit: { who: "opponents", during: "yourTurn", maxSpells: 0 },
        condition: cond.controls(EQUIPPED),
        label: "Attached: your opponents can't cast spells during your turn",
      }),
    ],
  },
  "Metallic Mimic": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility("self", { addChosen: "subtype" }, { label: "Is the chosen type" }),
      entersWith({
        counters: 1,
        affects: { types: ["Creature"], controller: "you", chosen: "subtype", other: true },
        label: "Your other creatures of the chosen type enter with a +1/+1 counter",
      }),
    ],
  },
  // Equip {2}: read from the text.
  Shadowspear: {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1, addKeywords: ["trample", "lifelink"] },
        {
          label: "+1/+1, trample and lifelink",
        },
      ),
      activated({
        mana: "{1}",
        effects: [fx.modify(ref.permanentsOf(ref.eachOpponent, {}), { removeKeywords: ["hexproof", "indestructible"] })],
        label: "Your opponents' permanents lose hexproof and indestructible",
      }),
    ],
  },
  // Equip {2}: read from the text.
  "Sword of Sinew and Steel": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addProtections: [
            protection.from({ colors: ["B"] }, "Protection from black"),
            protection.from({ colors: ["R"] }, "Protection from red"),
          ],
        },
        { label: "+2/+2, protection from black and from red" },
      ),
      triggered(when.combatDamage(EQUIPPED, true), [fx.destroy(ref.union(ref.target("p"), ref.target("a")))], {
        targets: [
          target.optional(target.permanent("p", ["Planeswalker"], {}, "planeswalker")),
          target.optional(target.permanent("a", ["Artifact"], {}, "artifact")),
        ],
        label: "Destroy up to one planeswalker and up to one artifact",
      }),
    ],
  },
  // Equip {2}: read from the text.
  "Umezawa's Jitte": {
    abilities: [
      triggered(when.combatDamage(EQUIPPED), [fx.counters(ref.self, "charge", 2)], { label: "Two charge counters" }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        effects: [fx.pump(ref.permanentsOf(ref.you, EQUIPPED), 2, 2)],
        label: "Remove a counter: the equipped creature gets +2/+2",
      }),
      activated({
        removeCounters: { kind: "charge", n: 1 },
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -1, -1)],
        label: "Remove a counter: target creature gets −1/−1",
      }),
      activated({ removeCounters: { kind: "charge", n: 1 }, effects: [fx.gainLife(2)], label: "Remove a counter: 2 life" }),
    ],
  },
  "All Will Be One": {
    abilities: [
      triggered({ on: "countersPut", who: {}, by: "you" }, [fx.damage(amount.eventAmount, ref.target())], {
        targets: [
          {
            id: "t",
            label: "opponent, or a creature or planeswalker they control",
            filter: { players: "opponent", objects: { types: ["Creature", "Planeswalker"], controller: "opponent" } },
          },
        ],
        label: "You put counters: that much damage",
      }),
    ],
  },
  "Waves of Aggression": {
    spell: spell(
      [],
      [
        fx.untap(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"], attackedThisTurn: true })),
        fx.extraCombatAfterMain,
      ],
    ),
  },
  "Trouble in Pairs": {
    abilities: [
      playerStatic({ skips: "extraTurns", affects: "opponents", label: "Your opponents skip their extra turns" }),
      triggered(when.opponentAttacksYouWith(2), [fx.draw(1)], {
        label: "An opponent attacks you with two or more creatures: draw",
      }),
      triggered({ on: "draw", whose: "opponent", nth: 2 }, [fx.draw(1)], {
        label: "An opponent draws their second card each turn: draw",
      }),
      triggered({ on: "castSpell", by: "opponent", nth: 2 }, [fx.draw(1)], {
        label: "An opponent casts their second spell each turn: draw",
      }),
    ],
  },
  // "Starting with you, each player may pay any amount of life" (then each opponent, in turn order), round after round
  // until no one pays; then each player creates a Rat for each life they paid in all.
  "Plague of Vermin": {
    spell: spell(
      [],
      [
        ...plagueRound(0),
        fx.createTokens(RAT, amount.plus(...ROUNDS.map((r) => amount.v(`a${r}`)))),
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [
          fx.createTokens(RAT, amount.plus(...ROUNDS.map((r) => amount.v(`b${r}_${n}`))), p),
        ]),
      ],
    ),
  },
};
