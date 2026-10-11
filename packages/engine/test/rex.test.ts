/** Jurassic World Collection (REX): rules tests of the cards (PLAN-G). */
import { describe, expect, it } from "vitest";
import { destroy, drawCards } from "../src/actions";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { canBlock } from "../src/turn";
import type { GameState } from "../src/types";
import { objectView } from "../src/view";
import { act, advanceUntil, attack, customCard, idOf, idsOf, lands, nameOf, scenario, settle, throughCombat } from "./helpers";

type S = ReturnType<typeof scenario>;
const castIt = (s: S, name: string, extra: object = {}) =>
  act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });

describe("Jurassic World Collection", () => {
  it("Don't Move: destroys tapped creatures; until your next turn, a tapped creature is destroyed", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Don't Move"] },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Llanowar Elves", "Forest"] },
    });
    s = settle(castIt(s, "Don't Move"));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    s = settle(act(s, "p1", { type: "pass" }));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = settle(act(s, "p2", { type: "tapForMana", source: idOf(s, "p2", "battlefield", "Llanowar Elves"), ability: 0 }));
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
  });

  it("Spitting Dilophosaurus: opposing creatures with a -1/-1 counter can't block", () => {
    let s = scenario({
      p1: { battlefield: ["Spitting Dilophosaurus", "Bear Cub"] },
      p2: { battlefield: [{ name: "Shivan Dragon", counters: { "-1/-1": 1 } }] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(canBlock(s, idOf(s, "p2", "battlefield", "Shivan Dragon"), cub)).toBe(false);
  });

  it("Life Finds a Way: a nontoken creature with power 4 or greater enters, populate", () => {
    let s = scenario({
      p1: { battlefield: ["Life Finds a Way", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Dragon Fodder"] },
    });
    s = settle(castIt(s, "Dragon Fodder"));
    s = settle(castIt(s, "Shivan Dragon"));
    expect(idsOf(s, "p1", "battlefield", "Goblin")).toHaveLength(3);
  });

  it("Savage Order: sacrifice a creature with power 4; a Dinosaur from the library, indestructible", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Shivan Dragon"], hand: ["Savage Order"], library: ["Polyraptor", "Forest"] },
    });
    s = settle(castIt(s, "Savage Order", { sacrifice: [idOf(s, "p1", "battlefield", "Shivan Dragon")] }));
    const raptor = idOf(s, "p1", "battlefield", "Polyraptor");
    expect(raptor).toBeDefined();
    destroy(s, raptor);
    expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(1);
  });

  it("Compy Swarm: at your end step, if a creature died, a tapped token copy", () => {
    let s = scenario({ p1: { battlefield: ["Compy Swarm", "Bear Cub"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Compy Swarm")).toHaveLength(2);
  });

  it("Ravenous Tyrannosaurus: when attacking, damage equal to its power; the excess to the controller", () => {
    let s = scenario({ p1: { battlefield: ["Ravenous Tyrannosaurus"] }, p2: { battlefield: ["Bear Cub"] } });
    const rex = idOf(s, "p1", "battlefield", "Ravenous Tyrannosaurus");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = throughCombat(attack(s, [rex]), (req) => (req.type === "pick" && req.options.includes(cub) ? [cub] : undefined));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    // 4 excess damage (6 - 2), then 6 combat damage.
    expect(s.players.p2?.life).toBe(10);
  });

  it("Permission Denied: counters a noncreature spell; opponents cast no more this turn", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Plains", "Island"], hand: ["Permission Denied"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    s = settle(castIt(s, "Permission Denied", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.pending?.kind === "priority" && s.pending.player === "p2").toBe(true);
  });

  describe("G4e: difficult sub-lot", () => {
    it("Grim Giganotosaurus: monstrosity 10, cheaper per opposing creature with power 4; destroys the other artifacts and creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Grim Giganotosaurus", ...lands("Swamp", 6), ...lands("Forest", 5), "Bear Cub"] },
        p2: { battlefield: ["Shivan Dragon", "Mana Crypt"] },
      });
      const giga = idOf(s, "p1", "battlefield", "Grim Giganotosaurus");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === giga);
      s = settle(act(s, "p1", { type: "activate", source: giga, ability: ab?.type === "activate" ? ab.ability : 0 }));
      expect(s.objects[giga]?.counters["+1/+1"]).toBe(10);
      // Monstrous is a designation (701.37b), not a counter; the view shows it.
      expect(s.objects[giga]?.monstrous).toBe(true);
      expect(Object.keys(s.objects[giga]?.counters ?? {})).toEqual(["+1/+1"]);
      expect(objectView(s, giga).monstrous).toBe(true);
      expect(
        s.battlefield.filter((id) => !s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land")).map((id) => nameOf(s, id)),
      ).toEqual(["Grim Giganotosaurus"]);
    });

    it("Grim Giganotosaurus: proliferating it doesn't make it monstrous again; activating it again does nothing", () => {
      let s = scenario({
        p1: { battlefield: ["Grim Giganotosaurus", ...lands("Swamp", 8), ...lands("Forest", 10)], hand: ["Bear Cub", "Atomize"] },
        p2: { battlefield: ["Inexorable Tide"] },
      });
      const giga = idOf(s, "p1", "battlefield", "Grim Giganotosaurus");
      const monstrosity = (x: GameState) => {
        const ab = legalActions(x, "p1").find((a) => a.type === "activate" && a.source === giga);
        if (ab?.type !== "activate") throw new Error("no monstrosity");
        return settle(act(x, "p1", { type: "activate", source: giga, ability: ab.ability }));
      };
      s = monstrosity(s);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const tide = idOf(s, "p2", "battlefield", "Inexorable Tide");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Atomize"), targets: { t: [tide] } }), (req) =>
        req.type === "pick" && req.intent === "proliferate" ? [giga] : undefined,
      );
      expect(s.objects[giga]?.counters["+1/+1"]).toBe(11);
      expect(s.objects[bear]?.zone).toBe("battlefield");
      // Already monstrous: the ability can be activated (701.37c), but it does nothing.
      s = monstrosity(s);
      expect(s.objects[giga]?.counters["+1/+1"]).toBe(11);
      expect(s.objects[bear]?.zone).toBe("battlefield");
    });

    it("Indoraptor: bloodthirst, as many counters as damage dealt to opponents this turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Swamp"], hand: ["Shock", "Indoraptor, the Perfect Hybrid"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } }));
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indoraptor, the Perfect Hybrid") }));
      expect(s.objects[idOf(s, "p1", "battlefield", "Indoraptor, the Perfect Hybrid")]?.counters["+1/+1"]).toBe(2);
    });

    it("Henry Wu: your Humans exploit; exploiting a non-Human creature draws (and a Treasure if power 3)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Henry Wu, InGen Geneticist", "Shivan Dragon", ...lands("Plains", 2)],
          hand: ["Soul Warden"],
          library: lands("Plains", 5),
        },
      });
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Soul Warden") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.hand.length).toBeGreaterThanOrEqual(1);
    });
  });
  describe("G4e: combat", () => {
    it("Swooping Pteranodon: takes an opposing creature until end of turn; at the end step, a land deals 3 to it", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), ...lands("Plains", 2)], hand: ["Swooping Pteranodon"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
      });
      const cub = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castIt(s, "Swooping Pteranodon"), (req) =>
        req.type === "pick" && req.options.includes(cub) ? [cub] : undefined,
      );
      expect(s.objects[cub]?.controller).toBe("p1");
      expect(s.objects[cub]?.tapped).toBe(false);
      expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Owen Grady and Blue: partners; counter of your choice on a Dinosaur; your Dinosaurs enter with Blue's counters", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), "Forest", "Polyraptor"],
          hand: ["Owen Grady, Raptor Trainer"],
          library: ["Blue, Loyal Raptor", "Forest"],
        },
      });
      s = settle(castIt(s, "Owen Grady, Raptor Trainer"), (req) =>
        req.type === "pick" && req.options.includes("p1") ? ["p1"] : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Blue, Loyal Raptor")).toHaveLength(1);
      const raptor = idOf(s, "p1", "battlefield", "Polyraptor");
      const owen = idOf(s, "p1", "battlefield", "Owen Grady, Raptor Trainer");
      // Owen just arrived: as if he had been there since the start of the turn ({T} without summoning sickness).
      (s.objects[owen] as { controlledSince: number }).controlledSince = 0;
      s = settle(act(s, "p1", { type: "activate", source: owen, ability: 1, targets: { t: [raptor] } }), (req) =>
        req.type === "pick" && req.options.includes("2") ? ["2"] : undefined,
      );
      expect(s.objects[raptor]?.counters.trample).toBe(1);
      expect(chars(s, raptor).keywords).toContain("trample");

      const dino = customCard({ name: "Dino de test", types: ["Creature"], subtypes: ["Dinosaur"], power: 1, toughness: 1 });
      let t = scenario({
        p1: { battlefield: [{ name: "Blue, Loyal Raptor", counters: { flying: 1, "+1/+1": 2 } }], hand: [dino] },
      });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Dino de test") }));
      const d = idOf(t, "p1", "battlefield", "Dino de test");
      expect(t.objects[d]?.counters).toMatchObject({ flying: 1, "+1/+1": 1 });
    });
  });
  describe("G4e: casting otherwise", () => {
    it("Cresting Mosasaurus: emerge (sacrifice, cost reduced by its mana value); cast, returns the non-Dinosaurs", () => {
      let s = scenario({
        p1: { battlefield: ["Shivan Dragon", "Island"], hand: ["Cresting Mosasaurus"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "Cresting Mosasaurus", { alternative: true }));
      expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Cresting Mosasaurus")).toHaveLength(1);
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    });

    it("Cresting Mosasaurus: the player chooses the emerge victim; the cost is reduced by that creature's mana value", () => {
      const start = (islands: number) =>
        scenario({
          p1: { battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Island", islands)], hand: ["Cresting Mosasaurus"] },
        });
      const pickOf = (s: S) => {
        const o = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Cresting Mosasaurus");
        return o?.type === "cast" ? o.picks?.find((p) => p.slot === "altSacrifice") : undefined;
      };
      // One Island: only the Dragon (mana value 6) leaves {U} to pay; the Bear Cub isn't offered.
      expect(pickOf(start(1))).toBeUndefined();
      let s = start(5);
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pickOf(s)?.options).toEqual([dragon, cub]);
      expect(pickOf(s)?.suggested).toEqual([dragon]);
      // The Bear Cub (mana value 2): {6}{U} − 2 = {4}{U}, the five Islands.
      s = settle(castIt(s, "Cresting Mosasaurus", { alternative: true, picks: { altSacrifice: [cub] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Cresting Mosasaurus")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      // Four Islands: not enough for the Bear Cub.
      const t = start(4);
      const cub4 = idOf(t, "p1", "battlefield", "Bear Cub");
      expect(() => castIt(t, "Cresting Mosasaurus", { alternative: true, picks: { altSacrifice: [cub4] } })).toThrow();
    });

    it("Hunting Velociraptor: rampage {2}{R} for your Dinosaurs after combat damage from a Dinosaur", () => {
      let s = scenario({
        p1: { battlefield: ["Hunting Velociraptor", ...lands("Mountain", 3)], hand: ["Polyraptor"] },
      });
      const poly = idOf(s, "p1", "hand", "Polyraptor");
      const alt = () => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === poly);
      expect(alt()).toBeUndefined();
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Hunting Velociraptor")]));
      const o = alt();
      expect(o?.type === "cast" && o.altAvailable).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: poly, alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Polyraptor")).toHaveLength(1);
    });
  });
  describe("G4e: exile and copies", () => {
    it("Dino DNA: exiles a creature card from a graveyard; {6}: a green 6/6 Dinosaur copy with trample", () => {
      let s = scenario({ p1: { battlefield: ["Dino DNA", ...lands("Forest", 7)] }, p2: { graveyard: ["Bear Cub"] } });
      const dna = idOf(s, "p1", "battlefield", "Dino DNA");
      s = settle(
        act(s, "p1", { type: "activate", source: dna, ability: 0, targets: { t: [idOf(s, "p2", "graveyard", "Bear Cub")] } }),
      );
      const cub = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
      expect(s.objects[dna]?.linked).toContain(cub);
      s = settle(act(s, "p1", { type: "activate", source: dna, ability: 1, targets: { t: [cub] } }));
      const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, token)).toMatchObject({ name: "Bear Cub", power: 6, toughness: 6, colors: ["G"], subtypes: ["Dinosaur"] });
      expect(chars(s, token).keywords).toContain("trample");
    });
  });
  describe("G4e: last cards", () => {
    it("Ian Malcolm: the second draw exiles the top card; the other players may cast it during their turn", () => {
      let s = scenario({
        p1: { battlefield: ["Ian Malcolm, Chaotician", "Mountain"], library: lands("Island", 3) },
        p2: { library: ["Forest", "Forest", "Shock"] },
      });
      drawCards(s, "p2", 2);
      s = settle(s);
      const shock = s.exile.find((id) => nameOf(s, id) === "Shock") as string;
      expect(shock).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
    });

    it("Indominus Rex: discard of creatures, a counter per ability found, and a card drawn for each", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), ...lands("Island", 2)],
          hand: ["Indominus Rex, Alpha", "Shivan Dragon", "Llanowar Elves"],
          library: lands("Forest", 3),
        },
      });
      const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indominus Rex, Alpha") }), (req) =>
        req.type === "pick" && req.options.includes(dragon) ? [dragon] : undefined,
      );
      const rex = idOf(s, "p1", "battlefield", "Indominus Rex, Alpha");
      expect(s.objects[rex]?.counters.flying).toBe(1);
      expect(chars(s, rex).keywords).toContain("flying");
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Forest", "Llanowar Elves"]);
    });

    it("Indominus Rex (PLAN-H H9): the counters are there as it enters; a card drawn for each counter", () => {
      const TRAMPLER = customCard({ name: "Test Flying Trampler", keywords: ["flying", "trample"], power: 3, toughness: 3 });
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), ...lands("Island", 2)],
          hand: ["Indominus Rex, Alpha", "Shivan Dragon", TRAMPLER],
          library: lands("Forest", 5),
        },
      });
      const discard = [idOf(s, "p1", "hand", "Shivan Dragon"), idOf(s, "p1", "hand", TRAMPLER.name)];
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Indominus Rex, Alpha") });
      for (let i = 0; i < 20 && idsOf(s, "p1", "battlefield", "Indominus Rex, Alpha").length === 0; i++) {
        const p = s.pending;
        if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
        else if (p?.kind === "choice")
          s = act(s, p.player, {
            type: "choose",
            values: p.request.type === "pick" && p.request.options.includes(discard[0] as string) ? discard : p.request.suggested,
          });
      }
      const rex = idOf(s, "p1", "battlefield", "Indominus Rex, Alpha");
      // Flying (two cards have it: a single counter) and trample, on entering.
      expect(s.objects[rex]?.counters).toMatchObject({ flying: 1, trample: 1 });
      s = settle(s);
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });
  describe("G4e: last cards (2)", () => {
    it("Welcome to . . . // Jurassic Park: 0/4 Wall, 3/3 Dinosaur, then the Walls are destroyed and the Saga returns as a land", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3)], hand: ["Welcome to . . . // Jurassic Park"], library: lands("Forest", 5) },
        p2: { battlefield: ["Mana Crypt"] },
      });
      const crypt = idOf(s, "p2", "battlefield", "Mana Crypt");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Welcome to . . . // Jurassic Park") }), (req) =>
        req.type === "pick" && req.options.includes(crypt) ? [crypt] : undefined,
      );
      expect(chars(s, crypt)).toMatchObject({ power: 0, toughness: 4 });
      expect(chars(s, crypt).subtypes).toContain("Wall");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 5);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Dinosaur")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 7);
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Mana Crypt")).toHaveLength(1);
      const park = s.battlefield.find((id) => chars(s, id).name === "Jurassic Park");
      expect(park).toBeDefined();
    });

    it("Welcome to . . . (chapter I): up to one noncreature artifact per opponent, never two of the same", () => {
      const base = () =>
        scenario({
          players: 3,
          p1: { battlefield: lands("Forest", 3), hand: ["Welcome to . . . // Jurassic Park"] },
          p2: { battlefield: ["Mana Crypt", "Mana Crypt"] },
          p3: { battlefield: ["Mana Crypt"] },
        });
      let s = base();
      const [a2, b2] = idsOf(s, "p2", "battlefield", "Mana Crypt") as [string, string];
      const c3 = idOf(s, "p3", "battlefield", "Mana Crypt");
      const saga = "Welcome to . . . // Jurassic Park";
      let t = castIt(base(), saga);
      for (let i = 0; i < 10 && t.pending?.kind === "priority"; i++) t = act(t, t.pending.player, { type: "pass" });
      const p = t.pending;
      expect(p?.kind === "choice" && p.request.type === "pick" && p.request.max).toBe(2);
      expect(() => act(t, "p1", { type: "choose", values: [a2, b2] })).toThrow();
      s = settle(castIt(s, saga), (req) => (req.type === "pick" && req.options.includes(c3) ? [a2, c3] : undefined));
      for (const id of [a2, c3]) expect(chars(s, id)).toMatchObject({ power: 0, toughness: 4 });
      expect(chars(s, b2).types).not.toContain("Creature");
    });
  });
});

describe("Jurassic World Collection: randomly chosen opponent (PLAN-H H4)", () => {
  it("Indoraptor: rage, a single randomly drawn opponent takes the damage (no question)", () => {
    let s = scenario({
      players: 3,
      p1: {
        battlefield: [{ name: "Indoraptor, the Perfect Hybrid", counters: { "+1/+1": 2 } }, "Mountain"],
        hand: ["Shock"],
      },
    });
    const raptor = idOf(s, "p1", "battlefield", "Indoraptor, the Perfect Hybrid");
    let asked = 0;
    s = settle(castIt(s, "Shock", { targets: { t: [raptor] } }), (req) => {
      if (req.type === "pick" && req.options.includes("p2") && req.options.includes("p3")) asked++;
      return undefined;
    });
    expect(asked).toBe(0);
    const power = chars(s, raptor).power;
    expect(power).toBe(5);
    const lost = [20 - (s.players.p2?.life ?? 0), 20 - (s.players.p3?.life ?? 0)].sort((a, b) => a - b);
    expect(lost).toEqual([0, power]);
  });
});
