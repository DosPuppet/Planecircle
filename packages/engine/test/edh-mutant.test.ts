/**
 * Commander (EDH pseudo-set): rules tests of the "Mutant Menace" precon (Fallout). Rad counters and
 * radiation, milled cards (grouped triggers, "milled this turn"), player proliferate.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, sourceFromObject } from "../src/actions";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { changeCounters } from "../src/state";
import { canBlock } from "../src/turn";
import type { GameState, PlayerId } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const plusOne = (s: GameState, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const activate = (s: GameState, p: PlayerId, name: string, extra: object = {}) => {
  const source = idOf(s, p, "battlefield", name);
  const o = legalActions(s, p).find((a) => a.type === "activate" && a.source === source);
  if (o?.type !== "activate") throw new Error(`no ability for ${name}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const toMain1Of = (s: GameState, p: PlayerId) =>
  advanceUntil(s, (x) => x.turn.active === p && x.turn.step === "main1" && x.pending?.kind === "priority", 600);

describe("Mutant Menace (EDH)", () => {
  describe("radiation", () => {
    it("at the beginning of their first main phase, the player mills; each nonland card: 1 life and one counter fewer", () => {
      let s = scenario({ active: "p2", p1: { library: ["Opt", "Forest", "Shock", "Opt", "Opt"] } });
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 3 };
      s = toMain1Of(s, "p1");
      // Radiation is a triggered ability: on the stack at the beginning of the main phase.
      expect(s.stack.map((x) => [x.sourceDefId, x.controller])).toEqual([["rules:radiation", "p1"]]);
      expect(s.players.p1?.graveyard.length).toBe(0);
      s = settle(s);
      // Draw (Opt), then mill three: Forest, Shock, Opt → two nonland cards.
      expect([s.players.p1?.counters?.rad, s.players.p1?.life, s.players.p1?.graveyard.length]).toEqual([1, 18, 3]);
    });

    it('radiation: "if that player has one or more counters", rechecked on resolution; the number is read on resolution', () => {
      let s = scenario({ active: "p2", p1: { library: ["Opt", "Shock", "Shock", "Shock", "Opt"] } });
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 1 };
      s = toMain1Of(s, "p1");
      const item = projectView(s, "p2").stack[0];
      expect([item?.fr?.name, item?.effect]).toEqual(["Radiation", "Radiation: mill a card per counter"]);
      // No more counters before resolution: the ability does nothing.
      const q = s.players.p1;
      if (q) q.counters = { ...q.counters, rad: 0 };
      let t = settle(s);
      expect([t.players.p1?.graveyard.length, t.players.p1?.life]).toEqual([0, 20]);
      // One more counter in response: the player mills according to the number at the time of resolution.
      if (q) q.counters = { ...q.counters, rad: 2 };
      t = settle(s);
      expect([t.players.p1?.graveyard.length, t.players.p1?.life, t.players.p1?.counters?.rad]).toEqual([2, 18, 0]);
    });

    it("radiation: with no counter at the beginning of the main phase, nothing triggers", () => {
      let s = scenario({ active: "p2", p1: { library: ["Opt", "Shock", "Opt"] } });
      s = toMain1Of(s, "p1");
      expect(s.stack).toEqual([]);
    });

    it("Strong, the Brutish Thespian: radiation makes you gain life", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Strong, the Brutish Thespian"], library: ["Opt", "Shock", "Opt"] } });
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 2 };
      s = settle(toMain1Of(s, "p1"));
      expect([s.players.p1?.counters?.rad, s.players.p1?.life]).toEqual([0, 22]);
    });

    it("The Wise Mothman: each player gets a counter; milled nonland cards put +1/+1 counters", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Swamp", "Forest", "Bear Cub"], hand: ["The Wise Mothman"] },
        p2: { library: ["Opt", "Shock", "Forest"] },
      });
      s = settle(castIt(s, "p1", "The Wise Mothman"));
      expect([s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([1, 1]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const moth = idOf(s, "p1", "battlefield", "The Wise Mothman");
      // The opponent suffers radiation on their turn: they mill a nonland card (Shock, under the drawn Opt).
      s = toMain1Of(s, "p2");
      s = settle(s, picking([bear]));
      expect(plusOne(s, bear) + plusOne(s, moth)).toBe(1);
    });

    it("proliferate gives one more rad counter to a player who has some", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2).concat(["Swamp", "Swamp"]), hand: ["Atomize"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const p2 = s.players.p2;
      if (p2) p2.counters = { ...p2.counters, rad: 2 };
      s = settle(castIt(s, "p1", "Atomize", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) =>
        req.type === "pick" && req.intent === "proliferate" ? ["p2"] : undefined,
      );
      expect(s.players.p2?.counters?.rad).toBe(3);
    });
  });

  describe("milled cards", () => {
    it("Raul: each player mills; once each turn, a spell milled this turn is cast from the graveyard", () => {
      let s = scenario({
        p1: { battlefield: ["Raul, Trouble Shooter", "Mountain"], library: ["Shock", "Forest"] },
        p2: { library: ["Opt"] },
      });
      s = settle(activate(s, "p1", "Raul, Trouble Shooter"));
      const shock = idOf(s, "p1", "graveyard", "Shock");
      expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === shock)).toBe(true);
    });

    it("Tato Farmer: a land milled this turn enters tapped under your control", () => {
      let s = scenario({
        p1: { battlefield: ["Tato Farmer", "Raul, Trouble Shooter"] },
        p2: { library: ["Plains", "Opt"] },
      });
      s = settle(activate(s, "p1", "Raul, Trouble Shooter"));
      const plains = idOf(s, "p2", "graveyard", "Plains");
      s = settle(activate(s, "p1", "Tato Farmer", { targets: { t: [plains] } }));
      const mine = idsOf(s, "p1", "battlefield", "Plains");
      expect(mine).toHaveLength(1);
      expect(s.objects[mine[0] ?? ""]?.tapped).toBe(true);
    });

    it("Screeching Scorchbeast: milled nonland cards create as many Mutant Zombies, once each turn", () => {
      let s = scenario({
        p1: { battlefield: ["Screeching Scorchbeast", "Raul, Trouble Shooter"], library: ["Opt"] },
        p2: { library: ["Shock"] },
      });
      s = settle(activate(s, "p1", "Raul, Trouble Shooter"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(tokens(s, "p1", "Zombie Mutant")).toHaveLength(2);
    });
  });

  describe("creatures and spells", () => {
    it('Alpha Deathclaw: when it enters, destroys a targeted permanent, whatever its type ("target permanent")', () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Forest", "Forest"], hand: ["Alpha Deathclaw"] },
        p2: { battlefield: ["Plains", "Bear Cub"] },
      });
      const plains = idOf(s, "p2", "battlefield", "Plains");
      s = settle(castIt(s, "p1", "Alpha Deathclaw"), picking([plains]));
      expect(idsOf(s, "p2", "graveyard", "Plains")).toHaveLength(1);
    });

    it("Alpha Deathclaw: monstrosity 4; when it becomes monstrous, destroys a targeted permanent; only once", () => {
      let s = scenario({
        p1: { battlefield: ["Alpha Deathclaw", ...lands("Swamp", 7), ...lands("Forest", 7)] },
        p2: { battlefield: ["Plains", "Bear Cub"] },
      });
      const claw = idOf(s, "p1", "battlefield", "Alpha Deathclaw");
      const monstrosity = (x: GameState) => {
        const ab = legalActions(x, "p1").find((a) => a.type === "activate" && a.source === claw);
        if (ab?.type !== "activate") throw new Error("no monstrosity");
        return act(x, "p1", { type: "activate", source: claw, ability: ab.ability });
      };
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(monstrosity(s), picking([bear]));
      expect(s.objects[claw]?.counters["+1/+1"]).toBe(4);
      expect(s.objects[claw]?.monstrous).toBe(true);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      // A second activation: no counters, no trigger.
      const plains = idOf(s, "p2", "battlefield", "Plains");
      s = settle(monstrosity(s), picking([plains]));
      expect(s.objects[claw]?.counters["+1/+1"]).toBe(4);
      expect(s.objects[plains]?.zone).toBe("battlefield");
    });

    it("Glowing One: it gives four rad counters to the player it damages", () => {
      let s = scenario({ p1: { battlefield: ["Glowing One"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Glowing One")]));
      expect(s.players.p2?.counters?.rad).toBe(4);
    });

    it("Bloatfly Swarm: damage removes +1/+1 counters and irradiates each player", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", { name: "Bloatfly Swarm", counters: { "+1/+1": 5 } }], hand: ["Shock"] },
      });
      const fly = idOf(s, "p1", "battlefield", "Bloatfly Swarm");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [fly] } }));
      expect([s.objects[fly]?.damage, plusOne(s, fly), s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([
        0, 3, 2, 2,
      ]);
    });

    it("Hancock: +X/+X to other Zombies and Mutants, X its counters; undying brings it back with a counter", () => {
      let s = scenario({ p1: { battlefield: ["Hancock, Ghoulish Mayor", "Glowing One", "Mountain"], hand: ["Shock"] } });
      const hancock = idOf(s, "p1", "battlefield", "Hancock, Ghoulish Mayor");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [hancock] } }));
      const back = idOf(s, "p1", "battlefield", "Hancock, Ghoulish Mayor");
      expect(plusOne(s, back)).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Glowing One")).power).toBe(3);
      // "Each other creature": Hancock (2/1, one +1/+1 counter) doesn't pump itself.
      expect([chars(s, back).power, chars(s, back).toughness]).toEqual([3, 2]);
    });

    it("Nuclear Fallout: each creature -2X/-2X, each player X rad counters", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3)], hand: ["Nuclear Fallout"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Nuclear Fallout", { x: 1 }));
      expect([onField(s, "p2", "Bear Cub"), onField(s, "p2", "Serra Angel")]).toEqual([0, 1]);
      expect([s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([1, 1]);
    });

    it("Vault 12: chapter II, a Mutant Zombie per rad counter among the players", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Vault 12: The Necropolis"] } });
      s = settle(castIt(s, "p1", "Vault 12: The Necropolis"));
      expect([s.players.p1?.counters?.rad, s.players.p2?.counters?.rad]).toEqual([3, 3]);
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 0 };
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.pending?.kind === "priority" &&
          x.turn.number > 3,
        600,
      );
      // p2 suffered radiation during their turn (library of Forests: no nonland card, they keep their 3).
      expect(tokens(s, "p1", "Zombie Mutant").length).toBe(3);
    });

    it("Contaminated Drink: draw X, then half of X (rounded up) as rad counters", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Swamp", "Island", "Island"], hand: ["Contaminated Drink"], library: lands("Island", 5) },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Contaminated Drink", { x: 2 }));
      expect(hand(s, "p1")).toBe(h - 1 + 2);
      expect(s.players.p1?.counters?.rad).toBe(1);
    });
  });
});

describe("Mutant Menace: approximations lifted (PLAN-H, H2c)", () => {
  it("Finality: you may put two +1/+1 counters on one of your creatures (chosen, not targeted); then -4/-4 to all", () => {
    const start = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 3), "Serra Angel"], hand: ["Find // Finality"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = start();
    const mine = idOf(s, "p1", "battlefield", "Serra Angel");
    const offered: string[][] = [];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Find // Finality"), face: 1 }), (req) => {
      if (req.type !== "pick") return undefined;
      offered.push(req.options.map(String));
      return [mine];
    });
    // The choice is made on resolution, among your creatures only.
    expect(offered).toEqual([[mine]]);
    expect(plusOne(s, mine)).toBe(2);
    expect(chars(s, mine).power).toBe(2);
    expect(onField(s, "p2", "Serra Angel")).toBe(0);
    // "You may": with no creature chosen, no counters, and your Angel dies too.
    let t = start();
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Find // Finality"), face: 1 }), (req) =>
      req.type === "pick" ? [] : undefined,
    );
    expect(onField(t, "p1", "Serra Angel")).toBe(0);
  });

  it("Nightkin Ambusher: unblockable as long as the defending player (not another opponent) has a rad counter", () => {
    const run = (defender: PlayerId) => {
      let s = scenario({ players: 3, p1: { battlefield: ["Nightkin Ambusher"] } });
      const p2 = s.players.p2;
      if (p2) p2.counters = { ...p2.counters, rad: 1 };
      const ambusher = idOf(s, "p1", "battlefield", "Nightkin Ambusher");
      s = attackPlayer(s, [ambusher], defender);
      return chars(s, ambusher).keywords.includes("unblockable");
    };
    expect(run("p2")).toBe(true);
    expect(run("p3")).toBe(false);
  });

  it("Mutational Advantage: damage prevented on permanents that had counters on resolution, not on those that get them later", () => {
    let s = scenario({
      p1: {
        battlefield: [
          ...lands("Island", 1),
          ...lands("Forest", 2),
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          "Llanowar Elves",
        ],
        hand: ["Mutational Advantage"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(castIt(s, "p1", "Mutational Advantage"), picking([cub]));
    expect(plusOne(s, cub)).toBe(2);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    // The Elves get a counter after resolution: they aren't protected.
    changeCounters(s, s.objects[elves] as never, "+1/+1", 1);
    dealDamage(s, sourceFromObject(s, elves), cub, 3, false);
    dealDamage(s, sourceFromObject(s, cub), elves, 1, false);
    expect(s.objects[cub]?.damage).toBe(0);
    expect(s.objects[elves]?.damage).toBe(1);
  });

  it("Mutational Advantage: prevention is an effect, not an ability: Final Showdown (loses abilities) doesn't remove it", () => {
    let s = scenario({
      p1: {
        battlefield: [
          ...lands("Island", 1),
          ...lands("Forest", 2),
          ...lands("Plains", 2),
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
        ],
        hand: ["Mutational Advantage", "Final Showdown"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(castIt(s, "p1", "Mutational Advantage"), picking([cub]));
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Final Showdown"));
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Creatures lose all abilities") : undefined;
    expect(mode).toBeDefined();
    s = settle(castIt(s, "p1", "Final Showdown", { mode: mode?.index }));
    // Hexproof and indestructible are granted abilities: they are lost.
    expect(chars(s, cub).keywords).not.toContain("hexproof");
    expect(chars(s, cub).keywords).not.toContain("indestructible");
    // The damage stays prevented, combat damage or not.
    dealDamage(s, sourceFromObject(s, cub), cub, 3, false);
    dealDamage(s, sourceFromObject(s, cub), cub, 2, true);
    expect(s.objects[cub]?.damage).toBe(0);
  });
});

describe("Mutant Menace: rad counters of the targeted player on entering", () => {
  // The targeted player (here the second opponent) does get the counters: the target was asked for, then lost.
  it.each([
    ["Mirelurk Queen", lands("Island", 5), 2],
    ["Nightkin Ambusher", [...lands("Island", 2), ...lands("Swamp", 2)], 4],
    ["The Master, Transcendent", ["Plains", "Swamp", "Forest", "Island"], 2],
  ] as const)("%s: the targeted player gets their rad counters", (name, mana, n) => {
    let s = scenario({ players: 3, p1: { battlefield: [...mana], hand: [name] } });
    s = settle(castIt(s, "p1", name), picking(["p3"]));
    expect(idsOf(s, "p1", "battlefield", name)).toHaveLength(1);
    expect([s.players.p1?.counters?.rad ?? 0, s.players.p2?.counters?.rad ?? 0, s.players.p3?.counters?.rad]).toEqual([0, 0, n]);
  });
});

describe("player attacked in multiplayer (PLAN-H, lot H5)", () => {
  it("Struggle for Project Purity (Enclave): only creatures attacking you count, not those attacking your planeswalkers", () => {
    const run = (attackers: [string, "p2" | "walker"][]) => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Struggle for Project Purity", "Ajani Resolute"] },
      });
      const struggle = s.objects[idOf(s, "p2", "battlefield", "Struggle for Project Purity")];
      if (struggle) struggle.chosen = { ...struggle.chosen, mode: "Enclave" };
      const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
      const ids = attackers.map(([n, d]) => ({ id: idOf(s, "p1", "battlefield", n), defender: d === "walker" ? walker : d }));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = settle(act(s, "p1", { type: "declareAttackers", attackers: ids }));
      return s.players.p1?.counters?.rad ?? 0;
    };
    expect(run([["Bear Cub", "walker"]])).toBe(0);
    expect(
      run([
        ["Bear Cub", "p2"],
        ["Llanowar Elves", "walker"],
      ]),
    ).toBe(2);
    expect(
      run([
        ["Bear Cub", "p2"],
        ["Llanowar Elves", "p2"],
      ]),
    ).toBe(4);
  });

  describe("Nuka-Nuke Launcher (PLAN-L L5)", () => {
    const RED = customCard({ name: "Red Test Creature", power: 1, toughness: 1, colors: ["R"] });
    const THOPTER = customCard({ name: "Test Thopter", power: 0, toughness: 2, types: ["Artifact", "Creature"] });
    const equip = (s: GameState, name: string) => {
      const launcher = idOf(s, "p1", "battlefield", "Nuka-Nuke Launcher");
      (s.objects[launcher] as { attachedTo?: string }).attachedTo = idOf(s, "p1", "battlefield", name);
      s.version += 1;
    };
    const rad = (s: GameState, p: PlayerId) => s.players[p]?.counters?.rad ?? 0;
    /** `p` casts Shock at p1 as soon as they have priority (the others pass), then it resolves. */
    const shockP1 = (s0: GameState, p: PlayerId) => {
      let s = s0;
      for (let i = 0; i < 6 && s.pending?.kind === "priority" && s.pending.player !== p; i++)
        s = act(s, s.pending.player, { type: "pass" });
      return settle(castIt(s, p, "Shock", { targets: { t: ["p1"] } }));
    };

    it("the defending player gets two rad counters per spell until the end of their next turn; not the others", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Nuka-Nuke Launcher", "Bear Cub"] },
        p2: { battlefield: lands("Mountain", 3), hand: ["Shock", "Shock", "Shock"] },
        p3: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      equip(s, "Bear Cub");
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(15);
      s = shockP1(s, "p2");
      expect(rad(s, "p2")).toBe(2);
      s = shockP1(s, "p3");
      expect(rad(s, "p3")).toBe(0);
      // p2's own turn: still in force.
      s = toMain1Of(s, "p2");
      s = shockP1(s, "p2");
      expect(rad(s, "p2")).toBe(4);
      // After p2's turn: over.
      s = toMain1Of(s, "p3");
      s = shockP1(s, "p2");
      expect(rad(s, "p2")).toBe(4);
    });

    it("intimidate: blocked only by artifact creatures and creatures sharing a color with it", () => {
      let s = scenario({
        p1: { battlefield: ["Nuka-Nuke Launcher", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves", RED, THOPTER] },
      });
      equip(s, "Bear Cub");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackPlayer(s, [bear], "p2");
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Llanowar Elves"), bear)).toBe(true);
      expect(canBlock(s, idOf(s, "p2", "battlefield", THOPTER.name), bear)).toBe(true);
      expect(canBlock(s, idOf(s, "p2", "battlefield", RED.name), bear)).toBe(false);
    });
  });
});
