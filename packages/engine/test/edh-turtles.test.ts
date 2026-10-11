/**
 * Commander (EDH pseudo-set): rules tests for the "Turtle Power!" preconstructed deck (Teenage Mutant Ninja Turtles).
 * Squad, fuse, counters (doubled, multiplied, counted), copies that attack the other opponents, tokens that
 * attack each opponent, doubled draw triggers, prevention changed into counters.
 */
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  castable,
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

describe("Turtle Power! (EDH)", () => {
  describe("keywords", () => {
    it("squad (702.157): paid twice, Roadkill Rodney enters with two copies", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 8), hand: ["Roadkill Rodney"] } });
      s = settle(castIt(s, "p1", "Roadkill Rodney", { x: 2 }));
      expect(onField(s, "p1", "Roadkill Rodney")).toBe(3);
      expect(tokens(s, "p1", "Roadkill Rodney")).toHaveLength(2);
      // Without squad: no copy (and the copies create none).
      let t = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Roadkill Rodney"] } });
      t = settle(castIt(t, "p1", "Roadkill Rodney"));
      expect(onField(t, "p1", "Roadkill Rodney")).toBe(1);
    });

    it("fuse (702.102): Double Jump and Flying Kick cast together from hand, left then right", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), ...lands("Mountain", 2), "Bear Cub"], hand: ["Double Jump // Flying Kick"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Double Jump // Flying Kick");
      const faces = legalActions(s, "p1").flatMap((a) => (a.type === "cast" && a.card === card ? [a.face] : []));
      expect(faces).toEqual(expect.arrayContaining([0, 1, 2]));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Double Jump // Flying Kick", { face: 2, targets: { j: [bear], ka: [bear], kb: [angel] } }));
      expect(s.objects[bear]?.counters.flying).toBe(1);
      expect([chars(s, bear).power, chars(s, bear).keywords.includes("flying")]).toEqual([5, true]);
      expect(onField(s, "p2", "Serra Angel")).toBe(0);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toContain("Double Jump // Flying Kick");
    });

    it("evolve (Ray Fillet): a counter when a bigger creature enters", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Ray Fillet, Wave Warrior"], hand: ["Bear Cub"] } });
      s = settle(castIt(s, "p1", "Bear Cub"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Ray Fillet, Wave Warrior"))).toBe(1);
    });
  });

  describe("commander and creatures", () => {
    it("Heroes in a Half Shell: Turtles and Ninjas that damage a player get a counter, and you draw", () => {
      let s = scenario({
        p1: { battlefield: ["Heroes in a Half Shell", "Splinter, the Mentor"], library: lands("Island", 5) },
      });
      const heroes = idOf(s, "p1", "battlefield", "Heroes in a Half Shell");
      const splinter = idOf(s, "p1", "battlefield", "Splinter, the Mentor");
      const h = hand(s, "p1");
      s = throughCombat(attack(s, [heroes, splinter]));
      expect([plusOne(s, heroes), plusOne(s, splinter)]).toEqual([1, 1]);
      expect(hand(s, "p1")).toBe(h + 1);
    });

    it("Shredder with three players: a nonlegendary copy attacks the other opponent, each loses half their life", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Shredder, Shadow Master"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Shredder, Shadow Master")], "p2");
      s = settle(s);
      const copy = tokens(s, "p1", "Shredder, Shadow Master")[0] ?? "";
      expect(s.combat?.attackers.find((a) => a.id === copy)?.defender).toBe("p3");
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      s = throughCombat(s);
      // 20 − 5 = 15, then half rounded up (8): 7.
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([7, 7]);
      expect(tokens(s, "p1", "Shredder, Shadow Master")).toHaveLength(0);
    });

    it("Krang: abilities triggered by a draw trigger twice (Baxter: two counters)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Island", "Krang, the All-Powerful", "Baxter, Fly in the Ointment"],
          hand: ["Opt"],
          library: lands("Island", 5),
        },
      });
      s = settle(castIt(s, "p1", "Opt"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Baxter, Fly in the Ointment"))).toBe(2);
    });

    it("Vigor: damage to another creature you control is prevented, that many +1/+1 counters instead", () => {
      let s = scenario({ p1: { battlefield: ["Mountain", "Vigor", "Bear Cub"], hand: ["Shock"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [bear] } }));
      expect([s.objects[bear]?.damage, plusOne(s, bear)]).toEqual([0, 2]);
    });

    it("Vigor: put into a graveyard, it dies first (Blood Artist), then its ability from the graveyard shuffles it into the library (rulings; PLAN-M M10d)", () => {
      let s = scenario({ p1: { battlefield: ["Vigor", "Blood Artist"], library: lands("Forest", 3) } });
      destroy(s, idOf(s, "p1", "battlefield", "Vigor"));
      // It is in the graveyard while its ability waits (not a replacement).
      expect(idsOf(s, "p1", "graveyard", "Vigor")).toHaveLength(1);
      expect(s.triggers.map((t) => nameOf(s, t.sourceId))).toEqual(expect.arrayContaining(["Vigor", "Blood Artist"]));
      s = settle(s);
      expect(s.players.p2?.life).toBe(19);
      expect(idsOf(s, "p1", "graveyard", "Vigor")).toHaveLength(0);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Vigor");
    });

    it("Raphael: your creatures with counters deal double damage", () => {
      let s = scenario({ p1: { battlefield: ["Raphael, the Muscle", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Corpsejack Menace and Casey Jones: twice as many counters, and as much damage to an opponent", () => {
      let s = scenario({
        p1: {
          battlefield: ["Casey Jones, Back Alley Brute", "Corpsejack Menace", "Bear Cub", ...lands("Plains", 2)],
          hand: ["Together Forever"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Together Forever"), picking([bear]));
      expect(plusOne(s, bear)).toBe(2);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Irma: becomes a copy of another creature you control, keeps its name and ability, then a counter", () => {
      let s = scenario({ p1: { battlefield: ["Irma, Part-Time Mutant", "Serra Angel"] } });
      const irma = idOf(s, "p1", "battlefield", "Irma, Part-Time Mutant");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0), 50);
      s = settle(s, picking([angel]));
      expect(chars(s, irma).name).toBe("Irma, Part-Time Mutant");
      expect([chars(s, irma).power, chars(s, irma).keywords.includes("flying")]).toEqual([5, true]);
    });

    it("Dimension X Pizzasaur: two counters, then destroys a creature with mana value at most your counters", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Dimension X Pizzasaur"] },
        p2: { battlefield: ["Savannah Lions", "Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      // The creature that gets the counters, then the one to destroy.
      const want = [bear, lions];
      s = settle(castIt(s, "p1", "Dimension X Pizzasaur"), (req) =>
        req.type === "pick" && req.intent === "triggerTarget" ? [want.shift() ?? ""] : undefined,
      );
      expect(plusOne(s, bear)).toBe(2);
      expect(onField(s, "p2", "Savannah Lions")).toBe(0);
      // Serra Angel (mana value 5) was not a legal target with two counters.
      expect(onField(s, "p2", "Serra Angel")).toBe(1);
    });
  });

  describe("artefacts, enchantements, sorts", () => {
    it("Coin of Mastery: a +1/+1 counter per artifact mana spent to cast the creature", () => {
      let s = scenario({
        p1: { battlefield: ["Coin of Mastery", "Sol Ring", ...lands("Forest", 2)], hand: ["Big Mother Mouser"] },
      });
      s = settle(castIt(s, "p1", "Big Mother Mouser"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Big Mother Mouser"))).toBe(4);
      // Sol Ring for a single {1}: the extra {C} stays in the mana pool, a single counter.
      let t = scenario({ p1: { battlefield: ["Coin of Mastery", "Sol Ring", "Forest"], hand: ["Bear Cub"] } });
      t = settle(castIt(t, "p1", "Bear Cub"));
      expect(plusOne(t, idOf(t, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Endless Foot Assault with three players: a tapped and attacking Ninja for each opponent", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Endless Foot Assault", "Bear Cub"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = settle(s);
      const ninjas = tokens(s, "p1", "Ninja");
      expect(ninjas.map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender).sort()).toEqual(["p2", "p3"]);
      expect(ninjas.every((id) => s.objects[id]?.tapped)).toBe(true);
    });

    it("Game Over: costs {2} less if a player has half their starting life or less", () => {
      const at = (life: number) => scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Game Over"] }, p2: { life } });
      const s = at(10);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Game Over"))).toBe(true);
      const t = at(11);
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Game Over"))).toBe(false);
    });

    it("Here Comes a New Hero!: the targeted player draws X, a copy of a creature with mana value X or less", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Here Comes a New Hero!"], library: lands("Island", 5) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Here Comes a New Hero!", { x: 2, targets: { p: ["p1"], c: [bear] } }));
      expect(hand(s, "p1")).toBe(h - 1 + 2);
      expect(tokens(s, "p1", "Bear Cub")).toHaveLength(1);
    });

    it("Wave Goodbye: creatures without a +1/+1 counter return to hand", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), { name: "Bear Cub", counters: { "+1/+1": 1 } }], hand: ["Wave Goodbye"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Wave Goodbye"));
      expect([onField(s, "p1", "Bear Cub"), onField(s, "p2", "Serra Angel")]).toEqual([1, 0]);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toContain("Serra Angel");
    });

    it("Thriving Grove: the chosen color is not green", () => {
      const s = scenario({ p1: { hand: ["Thriving Grove"] } });
      const grove = idOf(s, "p1", "hand", "Thriving Grove");
      const play = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === grove);
      const req = play?.type === "playLand" ? play.choose : undefined;
      expect(req?.type === "pick" ? [...req.options].sort() : []).toEqual(["B", "R", "U", "W"]);
    });

    it("Exploding Barrel: a pressure counter per mana; the ability costs {1} less per counter", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Exploding Barrel", counters: { pressure: 7 } }, "Mountain"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", "Exploding Barrel", { targets: { t: [angel] } }));
      expect(onField(s, "p2", "Serra Angel")).toBe(0);
    });
  });
});

describe("Turtle Power! (EDH) : provocation (PLAN-H, lot H3)", () => {
  it("Fast Forward: opposing creatures are goaded until your next turn", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Mountain", 5), hand: ["Fast Forward"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(castIt(s, "p1", "Fast Forward"));
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(chars(s, bear).blockRules.map((r) => r.goadedBy)).toEqual(["p1"]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2");
    const to = (defender: string) => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender }] });
    expect(() => act(s, "p2", { type: "declareAttackers", attackers: [] })).toThrow();
    expect(() => to("p1")).toThrow();
    s = to("p3");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, bear).blockRules).toEqual([]);
  });
});

describe("attacked player in multiplayer (PLAN-H, lot H5)", () => {
  it('Shredder, Shadow Master: "attacks a player" — nothing when it attacks a planeswalker', () => {
    const run = (atWalker: boolean) => {
      let s = scenario({ players: 3, p1: { battlefield: ["Shredder, Shadow Master"] }, p2: { battlefield: ["Ajani Resolute"] } });
      const defender = atWalker ? idOf(s, "p2", "battlefield", "Ajani Resolute") : "p2";
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Shredder, Shadow Master")], defender);
      s = settle(s);
      return tokens(s, "p1", "Shredder, Shadow Master").map((id) => s.combat?.attackers.find((a) => a.id === id)?.defender);
    };
    expect(run(false)).toEqual(["p3"]);
    expect(run(true)).toEqual([]);
  });
});
