/**
 * Commander (EDH pseudo-set, PLAN-E): rules tests for the shared mana base of the Commander decks (E8):
 * pain lands and talismans, check lands, "two basic lands", Triomes, fetch lands, legendary
 * lands, filter and restricted lands, mana rocks, "no maximum hand size".
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { GameState, PlayerId } from "../src/types";
import { act, advanceUntil, canActivate, castable, idOf, idsOf, lands, nameOf, scenario, settle } from "./helpers";

type S = GameState;
const tapMana = (s: S, name: string, ability = 0, color?: string, player: PlayerId = "p1") =>
  act(s, player, {
    type: "tapForMana",
    source: idOf(s, player, "battlefield", name),
    ability,
    ...(color ? { color } : {}),
  } as never);
const playLand = (s: S, name: string) => act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
const tapped = (s: S, name: string) => s.objects[idOf(s, "p1", "battlefield", name)]?.tapped;
const produced = (s: S, player: PlayerId, name: string) =>
  [...new Set(manaAbilitiesOf(s, idOf(s, player, "battlefield", name)).flatMap((m) => m.produce))].sort();
const pool = (s: S) => s.players.p1?.manaPool;
/** Index of the activated ability (or cycling) offered for the object. */
const activation = (s: S, source: string, player: PlayerId = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
  return a?.type === "activate" ? a.ability : undefined;
};
const tokens = (s: S, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === "p1" && nameOf(s, id) === name);

describe("Commander (EDH): mana base", () => {
  describe("pain lands and talismans", () => {
    it("Adarkar Wastes, Caves of Koilos, Underground River: {C} at no cost, one color for 1 damage", () => {
      let s = scenario({ p1: { battlefield: ["Adarkar Wastes", "Caves of Koilos", "Underground River"] } });
      s = tapMana(s, "Adarkar Wastes", 0);
      expect([pool(s)?.C, s.players.p1?.life]).toEqual([1, 20]);
      s = tapMana(s, "Caves of Koilos", 1, "B");
      expect([pool(s)?.B, s.players.p1?.life]).toEqual([1, 19]);
      s = tapMana(s, "Underground River", 1, "U");
      expect([pool(s)?.U, s.players.p1?.life]).toEqual([1, 18]);
      expect(produced(s, "p1", "Adarkar Wastes")).toEqual(["C", "U", "W"]);
    });

    it("Talisman of Dominance, of Hierarchy, of Progress: {C}, or one color and 1 damage from the artifact", () => {
      let s = scenario({
        p1: { battlefield: ["Talisman of Dominance", "Talisman of Hierarchy", "Talisman of Progress"] },
      });
      expect(produced(s, "p1", "Talisman of Dominance")).toEqual(["B", "C", "U"]);
      expect(produced(s, "p1", "Talisman of Hierarchy")).toEqual(["B", "C", "W"]);
      expect(produced(s, "p1", "Talisman of Progress")).toEqual(["C", "U", "W"]);
      s = tapMana(s, "Talisman of Dominance", 1, "U");
      s = tapMana(s, "Talisman of Hierarchy", 0);
      s = tapMana(s, "Talisman of Progress", 1, "W");
      expect([pool(s)?.U, pool(s)?.C, pool(s)?.W, s.players.p1?.life]).toEqual([1, 1, 1, 18]);
    });

    it("Sol Ring: {C}{C}", () => {
      let s = scenario({ p1: { battlefield: ["Sol Ring"] } });
      s = tapMana(s, "Sol Ring");
      expect(pool(s)?.C).toBe(2);
    });
  });

  describe("check lands", () => {
    it("Glacial Fortress, Isolated Chapel: tapped without a Plains or other named type, untapped otherwise", () => {
      let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Glacial Fortress"] } });
      s = playLand(s, "Glacial Fortress");
      expect(tapped(s, "Glacial Fortress")).toBe(true);
      expect(produced(s, "p1", "Glacial Fortress")).toEqual(["U", "W"]);
      let t = scenario({ p1: { battlefield: ["Plains"], hand: ["Isolated Chapel"] } });
      t = playLand(t, "Isolated Chapel");
      expect(tapped(t, "Isolated Chapel")).toBe(false);
      expect(produced(t, "p1", "Isolated Chapel")).toEqual(["B", "W"]);
    });

    it("Dragonskull Summit, Drowned Catacomb: a nonbasic land type counts (Triome); an opponent's does not", () => {
      let s = scenario({ p1: { battlefield: ["Savai Triome"], hand: ["Dragonskull Summit"] } });
      s = playLand(s, "Dragonskull Summit");
      expect(tapped(s, "Dragonskull Summit")).toBe(false);
      let t = scenario({ p1: { hand: ["Drowned Catacomb"] }, p2: { battlefield: ["Island"] } });
      t = playLand(t, "Drowned Catacomb");
      expect(tapped(t, "Drowned Catacomb")).toBe(true);
      expect(produced(t, "p1", "Drowned Catacomb")).toEqual(["B", "U"]);
    });
  });

  describe('"two or more basic lands", Triomes, three-color lands', () => {
    it("Prairie Stream, Sunken Hollow: tapped with a single basic land, untapped with two; basic types", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Savai Triome"], hand: ["Prairie Stream"] } });
      s = playLand(s, "Prairie Stream");
      expect(tapped(s, "Prairie Stream")).toBe(true);
      expect(chars(s, idOf(s, "p1", "battlefield", "Prairie Stream")).subtypes).toEqual(["Plains", "Island"]);
      let t = scenario({ p1: { battlefield: ["Plains", "Island"], hand: ["Sunken Hollow"] } });
      t = playLand(t, "Sunken Hollow");
      expect(tapped(t, "Sunken Hollow")).toBe(false);
      expect(produced(t, "p1", "Sunken Hollow")).toEqual(["B", "U"]);
    });

    it("Savai Triome, Raffine's Tower, Arcane Sanctum: enter tapped; three colors; cycling {3}", () => {
      let s = scenario({ p1: { hand: ["Savai Triome", "Arcane Sanctum"] } });
      s = playLand(s, "Savai Triome");
      expect(tapped(s, "Savai Triome")).toBe(true);
      expect(produced(s, "p1", "Savai Triome")).toEqual(["B", "R", "W"]);
      s = { ...s, turn: { ...s.turn, landsPlayed: 0 } };
      s = playLand(s, "Arcane Sanctum");
      expect(tapped(s, "Arcane Sanctum")).toBe(true);
      expect(produced(s, "p1", "Arcane Sanctum")).toEqual(["B", "U", "W"]);
      // Cycling {3}: discard Raffine's Tower, draw a card.
      let c = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Raffine's Tower"], library: ["Plains"] } });
      const tower = idOf(c, "p1", "hand", "Raffine's Tower");
      const ability = activation(c, tower);
      expect(ability).toBeDefined();
      c = settle(act(c, "p1", { type: "activate", source: tower, ability: ability as number }));
      expect(idsOf(c, "p1", "graveyard", "Raffine's Tower")).toHaveLength(1);
      expect(idsOf(c, "p1", "hand", "Plains")).toHaveLength(1);
    });
  });

  describe("fetch lands", () => {
    it("Bloodstained Mire, Flooded Strand, Polluted Delta: {T}, 1 life, sacrifice: a card of one of the two types", () => {
      let s = scenario({
        p1: { battlefield: ["Polluted Delta"], library: ["Forest", "Savai Triome", "Island"] },
      });
      const delta = idOf(s, "p1", "battlefield", "Polluted Delta");
      s = act(s, "p1", { type: "activate", source: delta, ability: activation(s, delta) as number });
      let offered: string[] = [];
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        offered = req.options.map((id) => nameOf(s, id) as string).sort();
        return req.options.filter((id) => nameOf(s, id) === "Savai Triome");
      });
      // The Triome is a Swamp: it can be searched for; the Forest cannot.
      expect(offered).toEqual(["Island", "Savai Triome"]);
      expect(s.players.p1?.life).toBe(19);
      expect(idsOf(s, "p1", "graveyard", "Polluted Delta")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Savai Triome")).toHaveLength(1);
      // The searched card enters untapped, even a Triome ("enters tapped" is its own replacement).
      for (const [land, a, b] of [
        ["Bloodstained Mire", "Swamp", "Mountain"],
        ["Flooded Strand", "Plains", "Island"],
      ] as const) {
        let t = scenario({ p1: { battlefield: [land], library: [a, "Forest", b] } });
        const id = idOf(t, "p1", "battlefield", land);
        t = act(t, "p1", { type: "activate", source: id, ability: activation(t, id) as number });
        let names: string[] = [];
        t = settle(t, (req) => {
          if (req.type === "pick") names = req.options.map((x) => nameOf(t, x) as string).sort();
          return undefined;
        });
        expect(names).toEqual([a, b].sort());
      }
    });
  });

  describe("legendary lands", () => {
    it("Urborg, Tomb of Yawgmoth: each land, opponents' included, is also a Swamp", () => {
      const s = scenario({ p1: { battlefield: ["Urborg, Tomb of Yawgmoth", "Forest"] }, p2: { battlefield: ["Plains"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).subtypes).toEqual(["Forest", "Swamp"]);
      expect(produced(s, "p1", "Forest")).toEqual(["B", "G"]);
      expect(produced(s, "p1", "Urborg, Tomb of Yawgmoth")).toEqual(["B"]);
      expect(produced(s, "p2", "Plains")).toEqual(["B", "W"]);
    });

    it("Otawara, Soaring City: {U}; channel from hand, {1} less per legendary creature", () => {
      let s = scenario({
        p1: { battlefield: ["Arahbo, the First Fang", "Island", "Island"], hand: ["Otawara, Soaring City"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const ota = idOf(s, "p1", "hand", "Otawara, Soaring City");
      // {3}{U} minus {1} (one legendary creature): two Islands are not enough.
      expect(canActivate(s, "p1", ota)).toBe(false);
      s = scenario({
        p1: {
          battlefield: ["Arahbo, the First Fang", "Edgar Markov", "Island", "Island"],
          hand: ["Otawara, Soaring City"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const ota2 = idOf(s, "p1", "hand", "Otawara, Soaring City");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "activate", source: ota2, ability: activation(s, ota2) as number, targets: { t: [bear] } });
      s = settle(s);
      expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Otawara, Soaring City")).toHaveLength(1);
      // Land: {U}.
      const t = scenario({ p1: { battlefield: ["Otawara, Soaring City"] } });
      expect(produced(t, "p1", "Otawara, Soaring City")).toEqual(["U"]);
    });

    it("Phyrexian Tower: {C}, or {T} and sacrifice a creature: {B}{B}", () => {
      let s = scenario({ p1: { battlefield: ["Phyrexian Tower"] } });
      const tower = idOf(s, "p1", "battlefield", "Phyrexian Tower");
      expect(produced(s, "p1", "Phyrexian Tower")).toEqual(["C"]);
      expect(canActivate(s, "p1", tower)).toBe(false);
      s = scenario({ p1: { battlefield: ["Phyrexian Tower", "Savannah Lions"] } });
      const t2 = idOf(s, "p1", "battlefield", "Phyrexian Tower");
      s = act(s, "p1", { type: "activate", source: t2, ability: activation(s, t2) as number });
      expect(pool(s)?.B).toBe(2);
      expect(idsOf(s, "p1", "graveyard", "Savannah Lions")).toHaveLength(1);
      expect(tapped(s, "Phyrexian Tower")).toBe(true);
    });
  });

  describe("lands with abilities", () => {
    it("Bojuka Bog: enters tapped, exiles the targeted player's graveyard; {B}", () => {
      let s = scenario({
        p1: { hand: ["Bojuka Bog"], graveyard: ["Shock"] },
        p2: { graveyard: ["Bear Cub", "Savannah Lions"] },
      });
      s = playLand(s, "Bojuka Bog");
      s = settle(s, (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined));
      if (s.stack.length || s.pending?.kind !== "priority") throw new Error("trigger not resolved");
      expect(s.players.p2?.graveyard).toEqual([]);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Savannah Lions"]);
      expect(idsOf(s, "p1", "graveyard", "Shock")).toHaveLength(1);
      expect(tapped(s, "Bojuka Bog")).toBe(true);
      expect(produced(s, "p1", "Bojuka Bog")).toEqual(["B"]);
    });

    it("Sunken Ruins: {C}; {U/B}, {T}: {U}{U}, {U}{B} or {B}{B}", () => {
      let s = scenario({ p1: { battlefield: ["Sunken Ruins", "Swamp"] } });
      const ruins = idOf(s, "p1", "battlefield", "Sunken Ruins");
      s = act(s, "p1", { type: "activate", source: ruins, ability: activation(s, ruins) as number });
      // Split of the two mana between {U} and {B}: here {U}{B}.
      expect(s.pending).toMatchObject({ kind: "choice", request: { type: "divide", among: ["U", "B"], total: 2 } });
      s = act(s, "p1", { type: "choose", values: [1, 1] });
      expect([pool(s)?.U, pool(s)?.B]).toEqual([1, 1]);
      expect(tapped(s, "Swamp")).toBe(true);
      // Without another source: the {U/B} cost cannot be paid by Sunken Ruins itself.
      const t = scenario({ p1: { battlefield: ["Sunken Ruins"] } });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Sunken Ruins"))).toBe(false);
    });

    it("Unclaimed Territory: colored mana only pays for creature spells of the chosen type", () => {
      const hand = ["Unclaimed Territory", "Vampire of the Dire Moon", "Savannah Lions"];
      // The type is chosen when playing the land (614.12).
      for (const [type, vampire, lions] of [
        ["Vampire", true, false],
        ["Cat", false, true],
      ] as const) {
        let s = scenario({ p1: { hand } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Unclaimed Territory"), chosen: type });
        expect(s.objects[idOf(s, "p1", "battlefield", "Unclaimed Territory")]?.chosen?.creatureType).toBe(type);
        // {C} pays neither {B} nor {W}: only the colored mana, reserved for the chosen type, allows it.
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Vampire of the Dire Moon"))).toBe(vampire);
        expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(lions);
      }
      // Not for a noncreature spell: Shock stays unpayable.
      const t = scenario({ p1: { battlefield: ["Unclaimed Territory"], hand: ["Shock"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Shock"))).toBe(false);
    });

    it("Voldaren Estate: 1 damage for mana reserved for Vampire spells; Blood token, {1} less per Vampire", () => {
      let s = scenario({
        p1: { battlefield: ["Voldaren Estate"], hand: ["Vampire of the Dire Moon", "Savannah Lions"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Vampire of the Dire Moon"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(false);
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") });
      expect(s.players.p1?.life).toBe(19);
      // {5}, {T} minus two Vampires: three Swamps are enough.
      let b = scenario({
        p1: {
          battlefield: ["Voldaren Estate", "Vampire of the Dire Moon", "Edgar Markov", ...lands("Swamp", 4)],
          hand: ["Shock"],
          library: ["Plains"],
        },
      });
      const estate = idOf(b, "p1", "battlefield", "Voldaren Estate");
      b = settle(act(b, "p1", { type: "activate", source: estate, ability: activation(b, estate) as number }));
      expect(tokens(b, "Blood")).toHaveLength(1);
      expect(b.battlefield.filter((id) => nameOf(b, id) === "Swamp" && b.objects[id]?.tapped)).toHaveLength(3);
      // Blood: {1}, {T}, discard a card, sacrifice this token: draw a card.
      const blood = tokens(b, "Blood")[0] as string;
      b = settle(act(b, "p1", { type: "activate", source: blood, ability: 0 }));
      expect(idsOf(b, "p1", "graveyard", "Shock")).toHaveLength(1);
      expect(idsOf(b, "p1", "hand", "Plains")).toHaveLength(1);
      expect(tokens(b, "Blood")).toHaveLength(0);
    });
  });

  describe("artifacts", () => {
    it("Relic of Legends: {T}, or tap an untapped legendary creature (even one that entered this turn)", () => {
      let s = scenario({
        p1: { battlefield: ["Relic of Legends", { name: "Edgar Markov", sick: true }, "Savannah Lions"] },
      });
      s = tapMana(s, "Relic of Legends", 1, "R");
      expect(pool(s)?.R).toBe(1);
      expect(tapped(s, "Relic of Legends")).toBe(false);
      expect(tapped(s, "Edgar Markov")).toBe(true);
      expect(tapped(s, "Savannah Lions")).toBe(false);
      s = tapMana(s, "Relic of Legends", 0, "U");
      expect(pool(s)?.U).toBe(1);
      // Without an untapped legendary creature, the second ability is not available.
      const t = scenario({ p1: { battlefield: ["Relic of Legends", "Savannah Lions"], hand: ["Bear Cub"] } });
      expect(() => tapMana(t, "Relic of Legends", 1, "R")).toThrow();
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
      // Automatic payment taps the legendary creature: two mana for Bear Cub.
      let u = scenario({ p1: { battlefield: ["Relic of Legends", "Edgar Markov"], hand: ["Bear Cub"] } });
      expect(castable(u, "p1", idOf(u, "p1", "hand", "Bear Cub"))).toBe(true);
      u = act(u, "p1", { type: "cast", card: idOf(u, "p1", "hand", "Bear Cub") });
      expect([tapped(u, "Relic of Legends"), tapped(u, "Edgar Markov")]).toEqual([true, true]);
    });

    it("Relic of Legends: the player may choose the legendary creature tapped (PLAN-M M6, a payment detail)", () => {
      let s = scenario({
        p1: { battlefield: ["Relic of Legends", "Edgar Markov", "Gix, Yawgmoth Praetor", "Savannah Lions"] },
      });
      const relic = idOf(s, "p1", "battlefield", "Relic of Legends");
      const gix = idOf(s, "p1", "battlefield", "Gix, Yawgmoth Praetor");
      const offer = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === relic && a.ability === 1);
      const pick = offer?.type === "tapForMana" ? offer.picks?.[0] : undefined;
      expect(pick?.options).toHaveLength(2);
      expect(pick?.suggested).toEqual([idOf(s, "p1", "battlefield", "Edgar Markov")]);
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(() =>
        act(s, "p1", { type: "tapForMana", source: relic, ability: 1, color: "R", picks: { costTap: [lions] } }),
      ).toThrow();
      s = act(s, "p1", { type: "tapForMana", source: relic, ability: 1, color: "R", picks: { costTap: [gix] } });
      expect([tapped(s, "Gix, Yawgmoth Praetor"), tapped(s, "Edgar Markov")]).toEqual([true, false]);
    });

    it("Reliquary Tower, Thought Vessel, Decanter of Endless Water: no maximum hand size", () => {
      for (const source of ["Reliquary Tower", "Thought Vessel", "Decanter of Endless Water"]) {
        let s = scenario({ p1: { battlefield: [source], hand: lands("Plains", 9) } });
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        expect(s.players.p1?.hand).toHaveLength(9);
      }
      let s = scenario({ p1: { battlefield: ["Decanter of Endless Water", "Thought Vessel"] } });
      expect(produced(s, "p1", "Decanter of Endless Water")).toEqual(["B", "G", "R", "U", "W"]);
      s = tapMana(s, "Thought Vessel");
      expect(pool(s)?.C).toBe(1);
      // Control: without them, the hand is brought back to seven cards.
      let c = scenario({ p1: { hand: lands("Plains", 9) } });
      c = advanceUntil(c, (x) => x.turn.active === "p2");
      expect(c.players.p1?.hand).toHaveLength(7);
    });
  });
});

describe("Commander (EDH): mana base, rare lands (PLAN-L, L11)", () => {
  /** Plays the land from p1's hand (a fresh scenario each time) and tells whether it entered tapped. */
  const entersTapped = (name: string, opts: Parameters<typeof scenario>[0] = {}) => {
    const p1 = opts.p1 ?? {};
    let s = scenario({ ...opts, p1: { ...p1, hand: [name, ...(p1.hand ?? [])] } });
    s = playLand(s, name);
    return { tapped: tapped(s, name), produced: produced(s, "p1", name), s };
  };

  describe("pain lands", () => {
    it("Battlefield Forge, Brushland, Shivan Reef, Sulfurous Springs: {C} at no cost, one of two colors for 1 damage", () => {
      const cases = [
        ["Battlefield Forge", "R", ["C", "R", "W"]],
        ["Brushland", "G", ["C", "G", "W"]],
        ["Shivan Reef", "U", ["C", "R", "U"]],
        ["Sulfurous Springs", "B", ["B", "C", "R"]],
      ] as const;
      for (const [land, color, mana] of cases) {
        let s = scenario({ p1: { battlefield: [land] } });
        expect(produced(s, "p1", land)).toEqual(mana);
        s = tapMana(s, land, 0);
        expect([pool(s)?.C, s.players.p1?.life]).toEqual([1, 20]);
        let t = scenario({ p1: { battlefield: [land] } });
        t = tapMana(t, land, 1, color);
        expect([pool(t)?.[color], t.players.p1?.life]).toEqual([1, 19]);
        expect(entersTapped(land).tapped).toBe(false);
      }
    });

    it("Grand Coliseum: enters tapped; {C}, or any color for 1 damage", () => {
      expect(entersTapped("Grand Coliseum").tapped).toBe(true);
      let s = scenario({ p1: { battlefield: ["Grand Coliseum"] } });
      expect(produced(s, "p1", "Grand Coliseum")).toEqual(["B", "C", "G", "R", "U", "W"]);
      s = tapMana(s, "Grand Coliseum", 0);
      expect([pool(s)?.C, s.players.p1?.life]).toEqual([1, 20]);
      let t = scenario({ p1: { battlefield: ["Grand Coliseum"] } });
      t = tapMana(t, "Grand Coliseum", 1, "G");
      expect([pool(t)?.G, t.players.p1?.life]).toEqual([1, 19]);
    });
  });

  describe("check lands", () => {
    it("Clifftop Retreat, Hinterland Harbor, Rootbound Crag, Sulfur Falls, Sunpetal Grove, Woodland Cemetery", () => {
      const cases = [
        ["Clifftop Retreat", "Mountain", "Plains", ["R", "W"]],
        ["Hinterland Harbor", "Forest", "Island", ["G", "U"]],
        ["Rootbound Crag", "Mountain", "Forest", ["G", "R"]],
        ["Sulfur Falls", "Island", "Mountain", ["R", "U"]],
        ["Sunpetal Grove", "Forest", "Plains", ["G", "W"]],
        ["Woodland Cemetery", "Swamp", "Forest", ["B", "G"]],
      ] as const;
      for (const [land, a, b, mana] of cases) {
        // Tapped with neither type (a Wastes-like control: the other basic types); untapped with either one.
        const other = ["Plains", "Island", "Swamp", "Mountain", "Forest"].find((x) => x !== a && x !== b) as string;
        expect(entersTapped(land, { p1: { battlefield: [other] } }).tapped).toBe(true);
        expect(entersTapped(land, { p1: { battlefield: [a] } }).tapped).toBe(false);
        const withB = entersTapped(land, { p1: { battlefield: [b] } });
        expect(withB.tapped).toBe(false);
        expect(withB.produced).toEqual(mana);
      }
    });
  });

  describe('"two or more basic lands" (battle lands)', () => {
    it("Canopy Vista, Cinder Glade, Radiant Summit, Scorched Geyser, Smoldering Marsh, Sodden Verdure, Vernal Fen", () => {
      const cases = [
        ["Canopy Vista", ["Forest", "Plains"], ["G", "W"]],
        ["Cinder Glade", ["Mountain", "Forest"], ["G", "R"]],
        ["Radiant Summit", ["Mountain", "Plains"], ["R", "W"]],
        ["Scorched Geyser", ["Island", "Mountain"], ["R", "U"]],
        ["Smoldering Marsh", ["Swamp", "Mountain"], ["B", "R"]],
        ["Sodden Verdure", ["Forest", "Island"], ["G", "U"]],
        ["Vernal Fen", ["Swamp", "Forest"], ["B", "G"]],
      ] as const;
      for (const [land, types, mana] of cases) {
        expect(entersTapped(land, { p1: { battlefield: ["Plains"] } }).tapped).toBe(true);
        const two = entersTapped(land, { p1: { battlefield: ["Plains", "Island"] } });
        expect(two.tapped).toBe(false);
        expect(two.produced).toEqual(mana);
        expect(chars(two.s, idOf(two.s, "p1", "battlefield", land)).subtypes).toEqual(types);
      }
      // Two nonbasic lands with basic land types are not basic lands.
      expect(entersTapped("Cinder Glade", { p1: { battlefield: ["Bayou", "Taiga"] } }).tapped).toBe(true);
    });
  });

  describe("original dual lands", () => {
    it("Bayou, Plateau, Scrubland, Taiga, Tropical Island, Underground Sea, Volcanic Island: two basic types, untapped", () => {
      const cases = [
        ["Bayou", ["Swamp", "Forest"], ["B", "G"]],
        ["Plateau", ["Mountain", "Plains"], ["R", "W"]],
        ["Scrubland", ["Plains", "Swamp"], ["B", "W"]],
        ["Taiga", ["Mountain", "Forest"], ["G", "R"]],
        ["Tropical Island", ["Forest", "Island"], ["G", "U"]],
        ["Underground Sea", ["Island", "Swamp"], ["B", "U"]],
        ["Volcanic Island", ["Island", "Mountain"], ["R", "U"]],
      ] as const;
      for (const [land, types, mana] of cases) {
        const r = entersTapped(land);
        expect(r.tapped).toBe(false);
        expect(r.produced).toEqual(mana);
        const c = chars(r.s, idOf(r.s, "p1", "battlefield", land));
        expect(c.subtypes).toEqual(types);
        expect(c.supertypes ?? []).not.toContain("Basic");
      }
    });
  });

  describe("Triomes and cycling dual lands", () => {
    it("Indatha Triome, Jetmir's Garden, Ketria Triome, Ziatora's Proving Ground: tapped, three types, cycling {3}", () => {
      const cases = [
        ["Indatha Triome", ["Plains", "Swamp", "Forest"], ["B", "G", "W"]],
        ["Jetmir's Garden", ["Mountain", "Forest", "Plains"], ["G", "R", "W"]],
        ["Ketria Triome", ["Forest", "Island", "Mountain"], ["G", "R", "U"]],
        ["Ziatora's Proving Ground", ["Swamp", "Mountain", "Forest"], ["B", "G", "R"]],
      ] as const;
      for (const [land, types, mana] of cases) {
        const r = entersTapped(land, { p1: { battlefield: lands("Plains", 2) } });
        expect(r.tapped).toBe(true);
        expect(r.produced).toEqual(mana);
        expect(chars(r.s, idOf(r.s, "p1", "battlefield", land)).subtypes).toEqual(types);
        // Cycling {3}: not with two lands, yes with three.
        const two = scenario({ p1: { battlefield: lands("Island", 2), hand: [land] } });
        expect(canActivate(two, "p1", idOf(two, "p1", "hand", land))).toBe(false);
        let c = scenario({ p1: { battlefield: lands("Island", 3), hand: [land], library: ["Plains"] } });
        const card = idOf(c, "p1", "hand", land);
        c = settle(act(c, "p1", { type: "activate", source: card, ability: activation(c, card) as number }));
        expect(idsOf(c, "p1", "graveyard", land)).toHaveLength(1);
        expect(idsOf(c, "p1", "hand", "Plains")).toHaveLength(1);
      }
    });

    it("Fetid Pools, Rain-Slicked Copse: tapped, two basic types, cycling {2}", () => {
      for (const [land, types, mana] of [
        ["Fetid Pools", ["Island", "Swamp"], ["B", "U"]],
        ["Rain-Slicked Copse", ["Forest", "Island"], ["G", "U"]],
      ] as const) {
        const r = entersTapped(land, { p1: { battlefield: lands("Plains", 2) } });
        expect(r.tapped).toBe(true);
        expect(r.produced).toEqual(mana);
        expect(chars(r.s, idOf(r.s, "p1", "battlefield", land)).subtypes).toEqual(types);
        let c = scenario({ p1: { battlefield: lands("Island", 2), hand: [land], library: ["Plains"] } });
        const card = idOf(c, "p1", "hand", land);
        c = settle(act(c, "p1", { type: "activate", source: card, ability: activation(c, card) as number }));
        expect(idsOf(c, "p1", "graveyard", land)).toHaveLength(1);
        expect(idsOf(c, "p1", "hand", "Plains")).toHaveLength(1);
      }
    });
  });

  describe("fast lands, reveal lands", () => {
    it("Blackcleave Cliffs: untapped with two or fewer other lands, tapped with three", () => {
      const two = entersTapped("Blackcleave Cliffs", { p1: { battlefield: lands("Swamp", 2) } });
      expect(two.tapped).toBe(false);
      expect(two.produced).toEqual(["B", "R"]);
      expect(entersTapped("Blackcleave Cliffs").tapped).toBe(false);
      expect(entersTapped("Blackcleave Cliffs", { p1: { battlefield: lands("Swamp", 3) } }).tapped).toBe(true);
    });

    it("Foreboding Ruins, Fortified Village, Port Town, Vineglimmer Snarl: untapped if a card of either type is in hand", () => {
      const cases = [
        ["Foreboding Ruins", "Swamp", "Mountain", ["B", "R"]],
        ["Fortified Village", "Forest", "Plains", ["G", "W"]],
        ["Port Town", "Plains", "Island", ["U", "W"]],
        ["Vineglimmer Snarl", "Forest", "Island", ["G", "U"]],
      ] as const;
      for (const [land, a, b, mana] of cases) {
        const other = ["Plains", "Island", "Swamp", "Mountain", "Forest"].find((x) => x !== a && x !== b) as string;
        // A card of the right type on the battlefield does not count: only the hand.
        expect(entersTapped(land, { p1: { battlefield: [a], hand: [other] } }).tapped).toBe(true);
        expect(entersTapped(land, { p1: { hand: [a] } }).tapped).toBe(false);
        const r = entersTapped(land, { p1: { hand: [b] } });
        expect(r.tapped).toBe(false);
        expect(r.produced).toEqual(mana);
        // The revealed card stays in hand.
        expect(idsOf(r.s, "p1", "hand", b)).toHaveLength(1);
      }
      // A nonbasic card with the type counts (Smoldering Marsh is a Swamp Mountain).
      expect(entersTapped("Foreboding Ruins", { p1: { hand: ["Smoldering Marsh"] } }).tapped).toBe(false);
    });
  });

  describe('"two or more opponents", "opponents control eight or more lands"', () => {
    it("Morphic Pool, Rejuvenating Springs, Sea of Clouds, Spire Garden, Undergrowth Stadium: tapped in a duel only", () => {
      const cases = [
        ["Morphic Pool", ["B", "U"]],
        ["Rejuvenating Springs", ["G", "U"]],
        ["Sea of Clouds", ["U", "W"]],
        ["Spire Garden", ["G", "R"]],
        ["Undergrowth Stadium", ["B", "G"]],
      ] as const;
      for (const [land, mana] of cases) {
        expect(entersTapped(land).tapped).toBe(true);
        const multi = entersTapped(land, { players: 3 });
        expect(multi.tapped).toBe(false);
        expect(multi.produced).toEqual(mana);
      }
    });

    it("Turbulent Crater, Turbulent Shore, Turbulent Wetlands: untapped once the opponents together control eight lands", () => {
      const cases = [
        ["Turbulent Crater", ["Swamp", "Mountain"], ["B", "R"]],
        ["Turbulent Shore", ["Plains", "Island"], ["U", "W"]],
        ["Turbulent Wetlands", ["Island", "Swamp"], ["B", "U"]],
      ] as const;
      for (const [land, types, mana] of cases) {
        // Seven lands for the opponent, and the lands of the player do not count.
        expect(
          entersTapped(land, { p1: { battlefield: lands("Plains", 5) }, p2: { battlefield: lands("Island", 7) } }).tapped,
        ).toBe(true);
        const r = entersTapped(land, { p2: { battlefield: lands("Island", 8) } });
        expect(r.tapped).toBe(false);
        expect(r.produced).toEqual(mana);
        expect(chars(r.s, idOf(r.s, "p1", "battlefield", land)).subtypes).toEqual(types);
        // Four and four among two opponents.
        const multi = entersTapped(land, {
          players: 3,
          p2: { battlefield: lands("Island", 4) },
          p3: { battlefield: lands("Forest", 4) },
        });
        expect(multi.tapped).toBe(false);
      }
    });
  });

  describe("filter lands and two-mana lands", () => {
    it("Fetid Heath, Flooded Grove, Mystic Gate: {C}; {A/B}, {T}: two mana among the two colors", () => {
      const cases = [
        ["Fetid Heath", "Plains", ["W", "B"], [2, 0], "W"],
        ["Flooded Grove", "Forest", ["G", "U"], [0, 2], "U"],
        ["Mystic Gate", "Island", ["W", "U"], [1, 1], "W"],
      ] as const;
      for (const [land, basic, among, split, check] of cases) {
        expect(produced(scenario({ p1: { battlefield: [land] } }), "p1", land)).toEqual(["C"]);
        // The hybrid cost cannot be paid by the land itself.
        const alone = scenario({ p1: { battlefield: [land] } });
        expect(canActivate(alone, "p1", idOf(alone, "p1", "battlefield", land))).toBe(false);
        let s = scenario({ p1: { battlefield: [land, basic] } });
        const id = idOf(s, "p1", "battlefield", land);
        s = act(s, "p1", { type: "activate", source: id, ability: activation(s, id) as number });
        expect(s.pending).toMatchObject({ kind: "choice", request: { type: "divide", among, total: 2 } });
        s = act(s, "p1", { type: "choose", values: [...split] });
        expect([pool(s)?.[among[0]] ?? 0, pool(s)?.[among[1]] ?? 0]).toEqual(split);
        expect(pool(s)?.[check]).toBeGreaterThan(0);
        expect([tapped(s, land), tapped(s, basic)]).toEqual([true, true]);
      }
    });

    it("Darkwater Catacombs, Overflowing Basin, Skycloud Expanse, Sungrass Prairie, Viridescent Bog: {1}, {T}: two colors", () => {
      const cases = [
        ["Darkwater Catacombs", "U", "B"],
        ["Overflowing Basin", "G", "U"],
        ["Skycloud Expanse", "W", "U"],
        ["Sungrass Prairie", "G", "W"],
        ["Viridescent Bog", "B", "G"],
      ] as const;
      for (const [land, a, b] of cases) {
        expect(entersTapped(land).tapped).toBe(false);
        const alone = scenario({ p1: { battlefield: [land] } });
        expect(canActivate(alone, "p1", idOf(alone, "p1", "battlefield", land))).toBe(false);
        let s = scenario({ p1: { battlefield: [land, "Wastes"] } });
        const id = idOf(s, "p1", "battlefield", land);
        s = act(s, "p1", { type: "activate", source: id, ability: activation(s, id) as number });
        expect([pool(s)?.[a], pool(s)?.[b], pool(s)?.C ?? 0]).toEqual([1, 1, 0]);
        expect([tapped(s, land), tapped(s, "Wastes")]).toEqual([true, true]);
      }
    });
  });

  describe("fetch lands", () => {
    it("Windswept Heath, Wooded Foothills: 1 life, sacrifice, a card of either type (nonbasic included), untapped", () => {
      for (const [land, library, wanted] of [
        ["Windswept Heath", ["Forest", "Island", "Plains", "Scrubland"], ["Forest", "Plains", "Scrubland"]],
        ["Wooded Foothills", ["Bayou", "Island", "Mountain", "Volcanic Island"], ["Bayou", "Mountain", "Volcanic Island"]],
      ] as const) {
        let s = scenario({ p1: { battlefield: [land], library: [...library] } });
        const id = idOf(s, "p1", "battlefield", land);
        s = act(s, "p1", { type: "activate", source: id, ability: activation(s, id) as number });
        let offered: string[] = [];
        const pick = wanted[wanted.length - 1] as string;
        s = settle(s, (req) => {
          if (req.type !== "pick") return undefined;
          offered = req.options.map((x) => nameOf(s, x) as string).sort();
          return req.options.filter((x) => nameOf(s, x) === pick);
        });
        expect(offered).toEqual([...wanted]);
        expect(s.players.p1?.life).toBe(19);
        expect(idsOf(s, "p1", "graveyard", land)).toHaveLength(1);
        expect(idsOf(s, "p1", "battlefield", pick)).toHaveLength(1);
        expect(tapped(s, pick)).toBe(false);
      }
    });
  });

  describe("utility lands", () => {
    it("Boseiju, Who Endures: {G}; channel destroys a nonbasic land of an opponent, who may search for a land with a basic type", () => {
      expect(produced(scenario({ p1: { battlefield: ["Boseiju, Who Endures"] } }), "p1", "Boseiju, Who Endures")).toEqual(["G"]);
      // {1}{G}: one Forest is not enough, unless a legendary creature reduces it to {G}.
      const one = scenario({ p1: { battlefield: ["Forest"], hand: ["Boseiju, Who Endures"] }, p2: { battlefield: ["Taiga"] } });
      expect(canActivate(one, "p1", idOf(one, "p1", "hand", "Boseiju, Who Endures"))).toBe(false);
      const legend = scenario({
        p1: { battlefield: ["Forest", "Edgar Markov"], hand: ["Boseiju, Who Endures"] },
        p2: { battlefield: ["Taiga"] },
      });
      expect(canActivate(legend, "p1", idOf(legend, "p1", "hand", "Boseiju, Who Endures"))).toBe(true);
      let s = scenario({
        p1: { battlefield: ["Forest", "Forest", "Bayou"], hand: ["Boseiju, Who Endures"] },
        p2: { battlefield: ["Taiga", "Mountain"], library: ["Plains", "Scrubland", "Wastes"] },
      });
      const bos = idOf(s, "p1", "hand", "Boseiju, Who Endures");
      const ability = activation(s, bos) as number;
      // Neither a basic land, nor its own land.
      for (const bad of [idOf(s, "p2", "battlefield", "Mountain"), idOf(s, "p1", "battlefield", "Bayou")])
        expect(() => act(s, "p1", { type: "activate", source: bos, ability, targets: { t: [bad] } })).toThrow();
      s = act(s, "p1", { type: "activate", source: bos, ability, targets: { t: [idOf(s, "p2", "battlefield", "Taiga")] } });
      let offered: string[] = [];
      s = settle(s, (req, player) => {
        if (req.type !== "pick" || player !== "p2") return undefined;
        offered = req.options.map((x) => nameOf(s, x) as string).sort();
        return req.options.filter((x) => nameOf(s, x) === "Scrubland");
      });
      expect(idsOf(s, "p1", "graveyard", "Boseiju, Who Endures")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Taiga")).toHaveLength(1);
      expect(offered).toEqual(["Plains", "Scrubland"]);
      expect(idsOf(s, "p2", "battlefield", "Scrubland")).toHaveLength(1);
    });

    it("Gavony Township: {C}; {2}{G}{W}, {T}: a +1/+1 counter on each creature you control", () => {
      let s = scenario({
        p1: { battlefield: ["Gavony Township", "Forest", "Plains", "Wastes", "Wastes", "Savannah Lions", "Bear Cub"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(produced(s, "p1", "Gavony Township")).toEqual(["C"]);
      const g = idOf(s, "p1", "battlefield", "Gavony Township");
      s = settle(act(s, "p1", { type: "activate", source: g, ability: activation(s, g) as number }));
      for (const c of [...idsOf(s, "p1", "battlefield", "Savannah Lions"), ...idsOf(s, "p1", "battlefield", "Bear Cub")])
        expect(s.objects[c]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(tapped(s, "Gavony Township")).toBe(true);
    });

    it("Kher Keep: {C}; {1}{R}, {T}: a 0/1 red Kobold token named Kobolds of Kher Keep", () => {
      let s = scenario({ p1: { battlefield: ["Kher Keep", "Mountain", "Wastes"] } });
      expect(produced(s, "p1", "Kher Keep")).toEqual(["C"]);
      const k = idOf(s, "p1", "battlefield", "Kher Keep");
      s = settle(act(s, "p1", { type: "activate", source: k, ability: activation(s, k) as number }));
      const [kobold] = tokens(s, "Kobolds of Kher Keep");
      expect(kobold).toBeDefined();
      const c = chars(s, kobold as string);
      expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([0, 1, ["R"], ["Kobold"]]);
      expect(c.types).toContain("Creature");
    });

    it("Big Apple, 3 a.m.: enters tapped with a chosen color; {5}, {T}: a 1/1 black Rat for each opponent", () => {
      let s = scenario({ p1: { hand: ["Big Apple, 3 a.m."] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Big Apple, 3 a.m."), chosen: "U" });
      expect(tapped(s, "Big Apple, 3 a.m.")).toBe(true);
      expect(produced(s, "p1", "Big Apple, 3 a.m.")).toEqual(["U"]);
      let r = scenario({ players: 3, p1: { battlefield: ["Big Apple, 3 a.m.", ...lands("Wastes", 5)] } });
      const apple = idOf(r, "p1", "battlefield", "Big Apple, 3 a.m.");
      r = settle(act(r, "p1", { type: "activate", source: apple, ability: activation(r, apple) as number }));
      const rats = tokens(r, "Rat");
      expect(rats).toHaveLength(2);
      const c = chars(r, rats[0] as string);
      expect([c.power, c.toughness, c.colors]).toEqual([1, 1, ["B"]]);
    });

    it("Hidden Hideout: enters tapped; the commander's colors; {2}, {T}: lifelink for a creature of yours with a counter", () => {
      const r = entersTapped("Hidden Hideout", { p1: { command: ["Edgar Markov"] } });
      expect(r.tapped).toBe(true);
      expect(r.produced).toEqual(["B", "R", "W"]);
      let s = scenario({
        p1: {
          battlefield: ["Hidden Hideout", "Wastes", "Wastes", { name: "Savannah Lions", counters: { "+1/+1": 1 } }, "Bear Cub"],
        },
        p2: { battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }] },
      });
      const h = idOf(s, "p1", "battlefield", "Hidden Hideout");
      const ability = activation(s, h) as number;
      // Neither a creature without a counter, nor an opponent's creature.
      for (const bad of [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Bear Cub")])
        expect(() => act(s, "p1", { type: "activate", source: h, ability, targets: { t: [bad] } })).toThrow();
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = settle(act(s, "p1", { type: "activate", source: h, ability, targets: { t: [lions] } }));
      expect(chars(s, lions).keywords).toContain("lifelink");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, lions).keywords).not.toContain("lifelink");
    });

    it("Mariposa Military Base: {C}; {5}, {T}: draw a card, {1} less for each rad counter", () => {
      let s = scenario({ p1: { battlefield: ["Mariposa Military Base", "Wastes", "Wastes"], library: ["Plains"] } });
      expect(produced(s, "p1", "Mariposa Military Base")).toEqual(["C"]);
      const base = idOf(s, "p1", "battlefield", "Mariposa Military Base");
      const p1 = s.players.p1;
      if (p1) p1.counters = { ...p1.counters, rad: 2 };
      // {5} minus 2: two Wastes are not enough.
      expect(canActivate(s, "p1", base)).toBe(false);
      if (p1) p1.counters = { ...p1.counters, rad: 3 };
      expect(canActivate(s, "p1", base)).toBe(true);
      s = settle(act(s, "p1", { type: "activate", source: base, ability: activation(s, base) as number }));
      expect(idsOf(s, "p1", "hand", "Plains")).toHaveLength(1);
      expect(tapped(s, "Mariposa Military Base")).toBe(true);
    });
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it("Mariposa Military Base: you may have it enter tapped; if you do, you get two rad counters", () => {
    const start = () => scenario({ p1: { hand: ["Mariposa Military Base"] } });
    let s = start();
    const card = idOf(s, "p1", "hand", "Mariposa Military Base");
    // Playing it asks the question with the land (two options: untapped, or tapped with two rad counters).
    const offers = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === card);
    const choose = offers[0]?.type === "playLand" ? offers[0].choose : undefined;
    expect(choose?.type === "pick" ? choose.options : []).toEqual(["0", "1"]);
    s = settle(act(s, "p1", { type: "playLand", card, chosen: "1" }));
    expect(tapped(s, "Mariposa Military Base")).toBe(true);
    expect(s.players.p1?.counters?.rad).toBe(2);
    // Untapped: no rad counter (the suggested answer, also without a choice).
    let t = start();
    t = settle(act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Mariposa Military Base") }));
    expect(tapped(t, "Mariposa Military Base")).toBe(false);
    expect(t.players.p1?.counters?.rad ?? 0).toBe(0);
  });
});
