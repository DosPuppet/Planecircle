/** Source Material (PZA): card rules tests (PLAN-G). */
import { describe, expect, it } from "vitest";
import { drawCards } from "../src/actions";
import { legalActions } from "../src/legal";
import { changeCounters, chars, moveObject } from "../src/state";
import { playerStatic } from "../src/statics";
import { act, advanceUntil, attack, customCard, idOf, idsOf, lands, scenario, settle, steal, throughCombat } from "./helpers";

const ARTIFACT = customCard({ name: "Test Trinket", types: ["Artifact"], typeLine: "Artifact" });
const CONSTRUCT = customCard({
  name: "Test Construct",
  types: ["Artifact", "Creature"],
  typeLine: "Artifact Creature — Construct",
  power: 1,
  toughness: 1,
});

describe("Source Material", () => {
  describe("Modular (702.43): Arcbound Ravager", () => {
    it("enters with a counter; sacrificing an artifact adds one; when it dies, its counters go onto an artifact creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), ARTIFACT, CONSTRUCT], hand: ["Arcbound Ravager"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Arcbound Ravager") }));
      const ravager = idOf(s, "p1", "battlefield", "Arcbound Ravager");
      expect(s.objects[ravager]?.counters["+1/+1"]).toBe(1);
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === ravager);
      const trinket = idOf(s, "p1", "battlefield", "Test Trinket");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: ravager,
          ability: ab?.type === "activate" ? ab.ability : 0,
          sacrifice: [trinket],
        }),
      );
      expect(s.objects[ravager]?.counters["+1/+1"]).toBe(2);
      // Ravager sacrifices itself: its two counters go onto the artifact creature.
      const construct = idOf(s, "p1", "battlefield", "Test Construct");
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: ravager,
          ability: ab?.type === "activate" ? ab.ability : 0,
          sacrifice: [ravager],
        }),
        (req) => (req.type === "pick" && req.options.includes(construct) ? [construct] : undefined),
      );
      expect(idsOf(s, "p1", "graveyard", "Arcbound Ravager")).toHaveLength(1);
      expect(s.objects[construct]?.counters["+1/+1"]).toBe(2);
      expect(chars(s, construct).power).toBe(3);
    });
  });

  describe("Graft (702.58): Cytoplast Manipulator", () => {
    it("enters with two counters; another creature enters: a counter can be moved onto it", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Cytoplast Manipulator", counters: { "+1/+1": 2 } }, ...lands("Forest", 2)],
          hand: ["Bear Cub"],
        },
      });
      const cyto = idOf(s, "p1", "battlefield", "Cytoplast Manipulator");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }), (req) =>
        req.type === "yesNo" ? [1] : undefined,
      );
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[cyto]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("{U}, {T}: gain control of a creature with a +1/+1 counter", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Cytoplast Manipulator", counters: { "+1/+1": 2 } }, "Island"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
      });
      const cyto = idOf(s, "p1", "battlefield", "Cytoplast Manipulator");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cyto);
      // Creatures with a +1/+1 counter, its own included; not the Elves.
      expect(ab?.type === "activate" && ab.targets[0]?.legal).toEqual([cyto, bear]);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: cyto,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: [bear] },
        }),
      );
      expect(s.objects[bear]?.controller).toBe("p1");
      // The Manipulator leaves the battlefield: the creature goes back to its owner at once (the only control
      // effect in play, removed with the source).
      moveObject(s, cyto, "exile");
      expect(s.objects[bear]?.controller).toBe("p2");
    });

    it("control lasts as long as the Manipulator remains on the battlefield, even under another player (PLAN-L L4)", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Cytoplast Manipulator", counters: { "+1/+1": 2 } }, "Island"] },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }] },
      });
      const cyto = idOf(s, "p1", "battlefield", "Cytoplast Manipulator");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cyto);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: cyto,
          ability: ab?.type === "activate" ? ab.ability : 0,
          targets: { t: [bear] },
        }),
      );
      s = steal(s, cyto, "p2");
      expect(s.objects[cyto]?.controller).toBe("p2");
      expect(s.objects[bear]?.controller).toBe("p1");
    });
  });

  describe("G9: Source Material", () => {
    const equip = (s: ReturnType<typeof scenario>, eq: string, creature: string) => {
      (s.objects[eq] as { attachedTo?: string }).attachedTo = creature;
      s.version += 1;
    };

    it("Teleportation Circle: at your end step, one of your artifacts or creatures is exiled, then returns", () => {
      let s = scenario({ p1: { battlefield: ["Teleportation Circle", { name: "Bear Cub", counters: { "+1/+1": 2 } }] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "choice" || x.turn.active === "p2", 200);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
      const back = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] as string]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Rhythm of the Wild: your creature spells can't be countered", () => {
      const s = scenario({ p1: { battlefield: ["Rhythm of the Wild"] } });
      expect(playerStatic(s, "p1", "uncounterable")).toBe(true);
    });

    it("Metallic Mimic: your other creatures of the chosen type enter with a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Metallic Mimic", "Bear Cub"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Metallic Mimic") }), (req) =>
        req.type === "pick" && req.options.includes("Bear") ? ["Bear"] : undefined,
      );
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Metallic Mimic")).subtypes).toContain("Bear");
    });

    it("Umezawa's Jitte: two counters when dealing combat damage; a removed counter gives 2 life", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Umezawa's Jitte"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const jitte = idOf(s, "p1", "battlefield", "Umezawa's Jitte");
      equip(s, jitte, cub);
      s = throughCombat(attack(s, [cub]));
      expect(s.objects[jitte]?.counters.charge).toBe(2);
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === jitte && a.label?.includes("2 life"));
      s = settle(act(s, "p1", { type: "activate", source: jitte, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect([s.players.p1?.life, s.objects[jitte]?.counters.charge]).toEqual([22, 1]);
    });

    it("Shadowspear: {1}, opposing permanents lose hexproof and indestructible", () => {
      let s = scenario({ p1: { battlefield: ["Shadowspear", "Plains"] }, p2: { battlefield: ["Carnage Tyrant"] } });
      const spear = idOf(s, "p1", "battlefield", "Shadowspear");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === spear && !a.label?.startsWith("Equip"));
      s = settle(act(s, "p1", { type: "activate", source: spear, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect(chars(s, idOf(s, "p2", "battlefield", "Carnage Tyrant")).keywords).not.toContain("hexproof");
    });

    it("All Will Be One: you put counters, as much damage", () => {
      let s = scenario({
        p1: { battlefield: ["All Will Be One", "Bear Cub", ...lands("Forest", 2)], hand: ["Hardened Scales"] },
      });
      changeCounters(s, s.objects[idOf(s, "p1", "battlefield", "Bear Cub")] as never, "+1/+1", 3);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      expect(s.players.p2?.life).toBe(17);
    });
  });
  describe("G4e: combat", () => {
    it("Waves of Aggression: untaps the attackers, an extra combat and main phase; retrace", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 5)], hand: ["Waves of Aggression"] } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = throughCombat(attack(s, [cub]));
      expect(s.players.p2?.life).toBe(18);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Waves of Aggression") }));
      expect(s.objects[cub]?.tapped).toBe(false);
      s = throughCombat(attack(s, [cub]));
      expect(s.players.p2?.life).toBe(16);
      expect(s.turn.active).toBe("p1");
      // Retrace: from the graveyard, discarding a land card.
      const r = scenario({ p1: { battlefield: lands("Mountain", 5), graveyard: ["Waves of Aggression"], hand: ["Bear Cub"] } });
      const waves = idOf(r, "p1", "graveyard", "Waves of Aggression");
      expect(legalActions(r, "p1").some((a) => a.type === "cast" && a.card === waves)).toBe(false);
      const q = scenario({ p1: { battlefield: lands("Mountain", 5), graveyard: ["Waves of Aggression"], hand: ["Forest"] } });
      const w2 = idOf(q, "p1", "graveyard", "Waves of Aggression");
      expect(legalActions(q, "p1").some((a) => a.type === "cast" && a.card === w2)).toBe(true);
    });
  });
  describe("G4e: library and drawing", () => {
    it("Trouble in Pairs: an opponent's second spell or second draw, you draw; their extra turns are skipped", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Trouble in Pairs"], library: lands("Plains", 5) },
        p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(s.players.p1?.hand).toHaveLength(0);
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      drawCards(s, "p2", 2);
      s = settle(s);
      expect(s.players.p1?.hand).toHaveLength(2);
      s.extraTurns = ["p2"];
      s = advanceUntil(s, (x) => x.turn.number > 3);
      expect(s.turn.active).toBe("p1");
    });
  });
  describe("G4e: last cards (2)", () => {
    it("Plague of Vermin: each player pays life, the process repeats until no one pays; a Rat per life paid (PLAN-M M9a)", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 7), hand: ["Plague of Vermin"] } });
      // Round 1: 3 and 2; round 2: 1 and 0; round 3: nobody pays, the process stops.
      const answers: Record<string, number[]> = { p1: [3, 1, 0], p2: [2, 0, 0] };
      let asked = 0;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Plague of Vermin") }), (req, player) => {
        if (req.type !== "number") return undefined;
        asked++;
        return [answers[player]?.shift() ?? 0];
      });
      expect(asked).toBe(6);
      expect(s.players.p1?.life).toBe(16);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(4);
      expect(idsOf(s, "p2", "battlefield", "Rat")).toHaveLength(2);
    });
  });
});

describe("Source Material: approximations lifted (PLAN-H, H2c)", () => {
  it("Plague of Vermin: in multiplayer, each player pays in turn (starting with you) and creates that many Rats", () => {
    let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 7), hand: ["Plague of Vermin"] } });
    const payers: string[] = [];
    // Round 1: 3, 2, 1; round 2: only p3 pays; round 3: nobody.
    const paid: Record<string, number[]> = { p1: [3, 0, 0], p2: [2, 0, 0], p3: [1, 1, 0] };
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Plague of Vermin") }), (req, player) => {
      if (req.type !== "number") return undefined;
      payers.push(player);
      return [paid[player]?.shift() ?? 0];
    });
    expect(payers).toEqual(["p1", "p2", "p3", "p1", "p2", "p3", "p1", "p2", "p3"]);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([17, 18, 18]);
    expect(["p1", "p2", "p3"].map((p) => idsOf(s, p, "battlefield", "Rat").length)).toEqual([3, 2, 2]);
  });
});

describe("attacked player (PLAN-H, lot H5)", () => {
  it('Trouble in Pairs: "you attack with two or more creatures" — those attacking your planeswalkers don\'t count', () => {
    const run = (elvesAtWalker: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Trouble in Pairs", "Ajani Resolute"], library: lands("Plains", 5) },
      });
      const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
      const [bear, elves] = ["Bear Cub", "Llanowar Elves"].map((n) => idOf(s, "p1", "battlefield", n));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", {
        type: "declareAttackers",
        attackers: [
          { id: bear as string, defender: "p2" },
          { id: elves as string, defender: elvesAtWalker ? walker : "p2" },
        ],
      });
      return settle(s).players.p2?.hand.length;
    };
    expect(run(true)).toBe(0);
    expect(run(false)).toBe(1);
  });
});
