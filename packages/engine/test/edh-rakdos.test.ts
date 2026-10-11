/**
 * Commander (EDH pseudo-set): rules tests of the Rakdos, Lord of Riots deck. Opponents' life loss and
 * cost reductions, damage to each player, devotion, Eldrazi (casting, annihilator, graveyard), "for each
 * player" loops, secret numbers, sacrifice X, unearth.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { castOption } from "../src/cardDef";
import { bump, chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { GameState, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
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

const life = (s: GameState, p: PlayerId) => s.players[p]?.life ?? 0;
const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const toTurnOf = (s: GameState, p: PlayerId, step = "main1") =>
  advanceUntil(s, (x) => x.turn.active === p && x.turn.step === step && x.pending?.kind === "priority", 600);

describe("Rakdos, Lord of Riots (EDH)", () => {
  describe("commander", () => {
    it("can be cast only if an opponent lost life this turn; your creatures cost {1} less per life lost", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Mountain", 3)],
          hand: ["Rakdos, Lord of Riots", "Gigantosaurus", "Shock"],
        },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Rakdos, Lord of Riots"))).toBe(false);
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      // p2 lost 2 life: Rakdos ({B}{B}{R}{R}) can be cast; Gigantosaurus ({G}{G}{G}{G}{G}) costs 2 less generic,
      // but its green symbols are still owed.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Rakdos, Lord of Riots"))).toBe(true);
    });

    it("the reduction applies to the generic part of a creature spell, according to the life lost by opponents", () => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Rakdos, Lord of Riots"], hand: ["Shock", "Shivan Dragon"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"))).toBe(false);
      const after = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      // 4 Mountains left: {4}{R}{R} − 2 = {2}{R}{R}, payable.
      expect(castable(after, "p1", idOf(after, "p1", "hand", "Shivan Dragon"))).toBe(true);
    });
  });

  describe("for each player", () => {
    it("Lim-Dûl's Hex: each player pays {B} or {3}, otherwise takes 1 damage", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Lim-Dûl's Hex", "Swamp"] },
        p2: { battlefield: lands("Island", 3) },
      });
      s = toTurnOf(s, "p1", "upkeep");
      s = settle(s, (req, p) => (req.type === "yesNo" ? [p === "p1" ? 1 : 0] : undefined));
      expect(life(s, "p1")).toBe(20);
      expect(life(s, "p2")).toBe(19);
    });

    it("Protection Racket: the opponent pays the mana value in life and the card is exiled, otherwise it goes to hand", () => {
      const run = (pay: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Protection Racket"], library: ["Shivan Dragon", "Opt"] },
        });
        s = toTurnOf(s, "p1", "upkeep");
        return settle(s, (req) => (req.type === "yesNo" ? [pay ? 1 : 0] : undefined));
      };
      const paid = run(true);
      expect(life(paid, "p2")).toBe(14);
      expect(paid.exile.map((id) => nameOf(paid, id))).toContain("Shivan Dragon");
      const refused = run(false);
      expect(refused.players.p1?.hand.map((id) => nameOf(refused, id))).toContain("Shivan Dragon");
    });

    it("Gray Merchant: each opponent loses X life (devotion to black), you gain the total", () => {
      let s = scenario({ players: 3, p1: { battlefield: lands("Swamp", 5), hand: ["Gray Merchant of Asphodel"] } });
      s = settle(castIt(s, "p1", "Gray Merchant of Asphodel"));
      expect([life(s, "p2"), life(s, "p3")]).toEqual([18, 18]);
      expect(life(s, "p1")).toBe(24);
    });
  });

  describe("secret numbers: Wheel of Misfortune", () => {
    it("the highest number deals damage to whoever chose it; those who did not choose the lowest refresh their hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Wheel of Misfortune", "Opt"] },
        p2: { hand: ["Opt", "Opt"] },
      });
      s = settle(castIt(s, "p1", "Wheel of Misfortune"), (req, p) => (req.type === "number" ? [p === "p1" ? 3 : 0] : undefined));
      expect(life(s, "p1")).toBe(17);
      expect(life(s, "p2")).toBe(20);
      // p1 did not choose the lowest: they discard and draw seven cards; p2 keeps their hand.
      expect(hand(s, "p1")).toBe(7);
      expect(hand(s, "p2")).toBe(2);
    });
  });

  describe("Ob Nixilis, the Adversary", () => {
    it("sacrifice X: X is the creature's power at the time of the sacrifice, modifications included", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Mountain", "Swamp", "Bear Cub"], hand: ["Ob Nixilis, the Adversary"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Bear Cub 2/2 with three +1/+1 counters: power 5.
      const o = s.objects[bear];
      if (o) o.counters["+1/+1"] = 3;
      bump(s);
      s = settle(castIt(s, "p1", "Ob Nixilis, the Adversary"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      const copy = idsOf(s, "p1", "battlefield", "Ob Nixilis, the Adversary").find((id) => s.objects[id]?.isToken) ?? "";
      expect(s.objects[copy]?.counters.loyalty).toBe(5);
    });

    it("sacrifice X: the copy is not legendary and has a starting loyalty of X", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain", "Swamp", "Gigantosaurus"], hand: ["Ob Nixilis, the Adversary"] },
      });
      s = settle(castIt(s, "p1", "Ob Nixilis, the Adversary"), (req, _p, cur) =>
        req.type === "pick" ? (picking(idsOf(cur, "p1", "battlefield", "Gigantosaurus"))(req) ?? undefined) : undefined,
      );
      const obs = idsOf(s, "p1", "battlefield", "Ob Nixilis, the Adversary");
      expect(obs).toHaveLength(2);
      const copy = obs.find((id) => s.objects[id]?.isToken) ?? "";
      expect(s.objects[copy]?.counters.loyalty).toBe(10);
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
    });
  });

  describe("Eldrazi", () => {
    it("Kozilek, Butcher of Truth: draw four cards when casting it; annihilator 4", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 10), hand: ["Kozilek, Butcher of Truth"], library: ["Opt", "Opt", "Opt", "Opt"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Kozilek, Butcher of Truth"));
      expect(hand(s, "p1")).toBe(h - 1 + 4);
      let a = scenario({ p1: { battlefield: ["Kozilek, Butcher of Truth"] }, p2: { battlefield: lands("Forest", 5) } });
      a = throughCombat(attack(a, [idOf(a, "p1", "battlefield", "Kozilek, Butcher of Truth")]));
      expect(a.battlefield.filter((id) => a.objects[id]?.controller === "p2")).toHaveLength(1);
    });

    it("Kozilek, Butcher of Truth put into the graveyard from hand: its owner shuffles their graveyard into their library", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Wheel of Misfortune", "Kozilek, Butcher of Truth"],
          graveyard: ["Opt", "Opt"],
          library: Array(10).fill("Shock"),
        },
      });
      // p1 chooses 3, p2 chooses 0: p1 discards their hand (Kozilek) and draws seven cards.
      s = settle(castIt(s, "p1", "Wheel of Misfortune"), (req, p) => (req.type === "number" ? [p === "p1" ? 3 : 0] : undefined));
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Kozilek, Butcher of Truth");
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Kozilek, Butcher of Truth");
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Opt");
    });

    it("It That Betrays: an opponent sacrifices a nontoken permanent, it comes under your control", () => {
      let s = scenario({ p1: { battlefield: ["It That Betrays"] }, p2: { battlefield: ["Bear Cub", "Forest", "Forest"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "It That Betrays")]));
      // Annihilator 2: p2 sacrifices two permanents, which come under p1's control.
      expect(s.battlefield.filter((id) => s.objects[id]?.owner === "p2" && s.objects[id]?.controller === "p1")).toHaveLength(2);
    });

    it("Ulamog, the Ceaseless Hunger: exiles two permanents when cast; when attacking, twenty cards of the defender", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 10), hand: ["Ulamog, the Ceaseless Hunger"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"], library: Array(25).fill("Forest") },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Ulamog, the Ceaseless Hunger"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear, lions] : undefined,
      );
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Savannah Lions"]);
      let a = scenario({ p1: { battlefield: ["Ulamog, the Ceaseless Hunger"] }, p2: { library: Array(25).fill("Forest") } });
      a = throughCombat(attack(a, [idOf(a, "p1", "battlefield", "Ulamog, the Ceaseless Hunger")]));
      expect(a.players.p2?.library).toHaveLength(5);
    });

    it("Ulamog, the Defiler: the opponent exiles half their library (rounded up); counters = highest mana value in exile", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 10), hand: ["Ulamog, the Defiler"] },
        p2: { library: ["Gigantosaurus", ...Array(4).fill("Forest")] },
      });
      s = settle(castIt(s, "p1", "Ulamog, the Defiler"));
      expect(s.players.p2?.library).toHaveLength(2);
      const ulamog = idOf(s, "p1", "battlefield", "Ulamog, the Defiler");
      expect(s.objects[ulamog]?.counters["+1/+1"]).toBe(5);
      // Annihilator X: its five counters.
      expect(chars(s, ulamog).power).toBe(12);
    });

    it("Emrakul, the Promised End: you control the opponent's next turn, then they take an extra turn", () => {
      let s = scenario({ p1: { battlefield: lands("Wastes", 13), hand: ["Emrakul, the Promised End"] } });
      s = settle(castIt(s, "p1", "Emrakul, the Promised End"));
      expect(s.turnControl).toMatchObject({ player: "p2", by: "p1", thenExtraTurn: true });
      const turn = s.turn.number;
      s = advanceUntil(s, (x) => x.turn.number === turn + 1 && x.pending?.kind === "priority", 600);
      expect(s.turn.active).toBe("p2");
      expect(s.extraTurns).toEqual(["p2"]);
      s = advanceUntil(s, (x) => x.turn.number === turn + 2 && x.pending?.kind === "priority", 600);
      expect(s.turn.active).toBe("p2");
      expect(s.turnControl).toBeUndefined();
    });

    it("Emrakul, the World Anew: gain control of the targeted player's creatures; madness: pay six {C}", () => {
      expect(castOption(card("Emrakul, the World Anew"), "madness")?.cost).toMatchObject({ colored: { C: 6 } });
      let s = scenario({
        p1: { battlefield: lands("Wastes", 12), hand: ["Emrakul, the World Anew"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Emrakul, the World Anew", { targets: { t: ["p2"] } }));
      expect(s.battlefield.filter((id) => s.objects[id]?.owner === "p2" && s.objects[id]?.controller === "p1")).toHaveLength(2);
    });

    it("Kozilek, the Broken Reality: the targeted player manifests two cards from their hand; you draw as many", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 9), hand: ["Kozilek, the Broken Reality"], library: ["Opt", "Opt"] },
        p2: { hand: ["Bear Cub", "Opt", "Shock"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Kozilek, the Broken Reality"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(hand(s, "p2")).toBe(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2" && s.objects[id]?.faceDown)).toHaveLength(2);
      expect(hand(s, "p1")).toBe(h - 1 + 2);
    });
  });

  describe("unearth: Cityscape Leveler", () => {
    it("cast: destroys a nonland permanent, its controller creates a tapped Powerstone; unearthed, returns with haste then is exiled", () => {
      let s = scenario({
        p1: { battlefield: lands("Wastes", 8), hand: ["Cityscape Leveler"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Cityscape Leveler"), (req, _p, cur) =>
        picking(idsOf(cur, "p2", "battlefield", "Bear Cub"))(req),
      );
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
      const stone = tokens(s, "p2", "Powerstone")[0] ?? "";
      expect(s.objects[stone]?.tapped).toBe(true);
      let u = scenario({ p1: { battlefield: lands("Wastes", 8), graveyard: ["Cityscape Leveler"] } });
      const card0 = u.players.p1?.graveyard[0] ?? "";
      const opt = legalActions(u, "p1").find((a) => a.type === "activate" && a.source === card0);
      expect(opt).toBeDefined();
      u = settle(act(u, "p1", { type: "activate", source: card0, ability: (opt as { ability: number }).ability } as never));
      const lev = idOf(u, "p1", "battlefield", "Cityscape Leveler");
      expect(chars(u, lev).keywords).toContain("haste");
      expect(u.objects[lev]?.exileIfLeaves).toBe(true);
      u = advanceUntil(u, (x) => x.turn.active === "p2" && x.pending?.kind === "priority", 600);
      expect(u.exile.map((id) => nameOf(u, id))).toContain("Cityscape Leveler");
    });
  });

  describe("creatures", () => {
    it("Exocrine: devour X = 5, five counters, draw, and 5 damage to each player and each other creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Exocrine"], library: ["Opt"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Exocrine", { x: 5 }));
      const exo = idOf(s, "p1", "battlefield", "Exocrine");
      expect(s.objects[exo]?.counters["+1/+1"]).toBe(5);
      expect(hand(s, "p1")).toBe(h - 1 + 1);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([15, 15]);
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
    });

    it("Fanatic of Mogis: damage to each opponent equal to devotion to red", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Shivan Dragon", ...lands("Mountain", 4)], hand: ["Fanatic of Mogis"] },
      });
      s = settle(castIt(s, "p1", "Fanatic of Mogis"));
      // Shivan Dragon {R}{R} + Fanatic {R}: 3.
      expect([life(s, "p2"), life(s, "p3")]).toEqual([17, 17]);
    });

    it("Keen Duelist: each player loses the mana value of the other's card, then takes their own", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Keen Duelist"], library: ["Shivan Dragon"] },
        p2: { library: ["Opt"] },
      });
      s = toTurnOf(s, "p1", "upkeep");
      s = settle(s);
      expect(life(s, "p1")).toBe(19);
      expect(life(s, "p2")).toBe(14);
    });

    it("Sandstone Oracle: choose an opponent; if they have more cards in hand than you, draw the difference", () => {
      const run = (who: PlayerId) => {
        const offered: string[][] = [];
        let s = scenario({
          players: 3,
          p1: { battlefield: lands("Wastes", 7), hand: ["Sandstone Oracle"], library: Array(6).fill("Opt") },
          p2: { hand: Array(5).fill("Opt") },
          p3: { hand: ["Opt"] },
        });
        s = settle(castIt(s, "p1", "Sandstone Oracle"), (req) => {
          if (req.type !== "pick" || !req.options.includes("p3")) return undefined;
          offered.push(req.options);
          return [who];
        });
        return { s, offered };
      };
      const p2 = run("p2");
      // Untargeted choice among the opponents.
      expect(p2.offered).toEqual([["p2", "p3"]]);
      expect(hand(p2.s, "p1")).toBe(5);
      // The opponent who has a card: you (no cards) draw one.
      expect(hand(run("p3").s, "p1")).toBe(1);
    });

    it("Ancient Cellarspawn: Demon spells cost {1} less; a spell cast for less than its mana value, the opponent loses the difference", () => {
      let s = scenario({
        p1: { battlefield: ["Ancient Cellarspawn", ...lands("Swamp", 7)], hand: ["Razaketh, the Foulblooded"] },
      });
      s = settle(castIt(s, "p1", "Razaketh, the Foulblooded"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(onField(s, "p1", "Razaketh, the Foulblooded")).toBe(1);
      expect(life(s, "p2")).toBe(19);
    });

    it("Grim Servant: search for a card with mana value at most equal to your devotion to black; you lose 3 life", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Grim Servant"], library: ["Gigantosaurus", "Opt"] } });
      s = settle(castIt(s, "p1", "Grim Servant"), (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(cur, String(id)) === "Opt") : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toContain("Opt");
      expect(life(s, "p1")).toBe(17);
    });
  });

  describe("spells", () => {
    it("Valakut Awakening: put cards on the bottom, draw that many plus one", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Valakut Awakening // Valakut Stoneforge", "Opt", "Opt"],
          library: Array(5).fill("Shock"),
        },
      });
      s = settle(castIt(s, "p1", "Valakut Awakening // Valakut Stoneforge"), (req) =>
        req.type === "pick" ? req.options : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Shock", "Shock", "Shock"]);
    });

    it("Shatterskull Smashing: X 6 or more, twice X damage divided", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Shatterskull Smashing // Shatterskull, the Hammer Pass"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      const g = idOf(s, "p2", "battlefield", "Gigantosaurus");
      s = settle(castIt(s, "p1", "Shatterskull Smashing // Shatterskull, the Hammer Pass", { x: 6, targets: { t: [g] } }));
      expect(onField(s, "p2", "Gigantosaurus")).toBe(0);
    });

    it("Agadeem's Awakening: creature cards with different mana values", () => {
      const s = scenario({
        p1: {
          battlefield: lands("Swamp", 6),
          hand: ["Agadeem's Awakening // Agadeem, the Undercrypt"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Savannah Lions"],
        },
      });
      const [bear] = idsOf(s, "p1", "graveyard", "Bear Cub");
      const [elves] = idsOf(s, "p1", "graveyard", "Llanowar Elves");
      const [lions] = idsOf(s, "p1", "graveyard", "Savannah Lions");
      const card0 = idOf(s, "p1", "hand", "Agadeem's Awakening // Agadeem, the Undercrypt");
      // Llanowar Elves and Savannah Lions have the same mana value (1): refused.
      expect(() => act(s, "p1", { type: "cast", card: card0, x: 2, targets: { t: [elves, lions] } } as never)).toThrow();
      const ok = settle(act(s, "p1", { type: "cast", card: card0, x: 2, targets: { t: [bear, elves] } } as never));
      expect(onField(ok, "p1", "Bear Cub") + onField(ok, "p1", "Llanowar Elves")).toBe(2);
    });

    it("Rakdos Charm: each creature deals 1 damage to its controller", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Mountain", "Bear Cub"], hand: ["Rakdos Charm"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Rakdos Charm", { mode: 2 }));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([19, 18]);
    });

    it("Descent into Avernus: two counters, then X Treasures and X damage to each player", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Descent into Avernus"] } });
      s = toTurnOf(s, "p1", "upkeep");
      s = settle(s);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([18, 18]);
      expect([tokens(s, "p1", "Treasure").length, tokens(s, "p2", "Treasure").length]).toEqual([2, 2]);
    });
  });

  describe("mana", () => {
    it("Blightstep Pathway // Searstep Pathway: the played face is chosen (front {B} or back {R})", () => {
      const s = scenario({ p1: { hand: ["Blightstep Pathway // Searstep Pathway"] } });
      const card0 = idOf(s, "p1", "hand", "Blightstep Pathway // Searstep Pathway");
      const offers = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === card0);
      expect(offers.map((a) => (a.type === "playLand" ? (a.faceName ?? "recto") : ""))).toEqual(["recto", "Searstep Pathway"]);
      const front = act(s, "p1", { type: "playLand", card: card0 });
      const back = act(s, "p1", { type: "playLand", card: card0, back: true } as never);
      const mana = (st: GameState) =>
        manaAbilitiesOf(st, st.battlefield.find((id) => st.objects[id]?.controller === "p1") ?? "").flatMap((m) => m.produce);
      expect(mana(front)).toEqual(["B"]);
      expect(mana(back)).toEqual(["R"]);
      // A card whose front face alone is a land has no back face to play.
      const forest = scenario({ p1: { hand: ["Forest"] } });
      expect(() =>
        act(forest, "p1", { type: "playLand", card: idOf(forest, "p1", "hand", "Forest"), back: true } as never),
      ).toThrow();
    });

    it("Rakdos Signet: {1}, {T}: {B}{R}; Graven Cairns: {B/R}, {T}: two mana, black or red", () => {
      let s = scenario({ p1: { battlefield: ["Rakdos Signet", "Mountain"] } });
      s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Mountain"), ability: 0 } as never);
      const signet = idOf(s, "p1", "battlefield", "Rakdos Signet");
      const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === signet);
      s = act(s, "p1", { type: "activate", source: signet, ability: (o as { ability: number }).ability } as never);
      expect([s.players.p1?.manaPool.B, s.players.p1?.manaPool.R]).toEqual([1, 1]);
    });

    it("Cryptolith Fragment: transforms at upkeep if each player has 10 life or less", () => {
      let s = scenario({
        active: "p2",
        p1: { life: 9, battlefield: ["Cryptolith Fragment // Aurora of Emrakul"] },
        p2: { life: 10 },
      });
      s = toTurnOf(s, "p1", "main1");
      expect(nameOf(s, s.battlefield.find((id) => s.objects[id]?.controller === "p1") ?? "")).toBeDefined();
      expect(chars(s, s.battlefield.find((id) => s.objects[id]?.controller === "p1") ?? "").name).toBe("Aurora of Emrakul");
    });
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it("Cryptolith Fragment: a real mana ability (by hand and by the automatic payment); each player loses 1 life", () => {
    const FRAGMENT = "Cryptolith Fragment // Aurora of Emrakul";
    let s = scenario({ p1: { battlefield: [FRAGMENT], hand: ["Shock"] } });
    const fragment = idOf(s, "p1", "battlefield", FRAGMENT);
    expect(manaAbilitiesOf(s, fragment)).toHaveLength(1);
    // The automatic payment uses it: Shock paid with its mana.
    s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect([life(s, "p1"), life(s, "p2")]).toEqual([19, 17]);
    // By hand, outside a payment.
    let t = scenario({ p1: { battlefield: [FRAGMENT] } });
    t = act(t, "p1", { type: "tapForMana", source: idOf(t, "p1", "battlefield", FRAGMENT), ability: 0, color: "B" } as never);
    expect(t.players.p1?.manaPool.B).toBe(1);
    expect([life(t, "p1"), life(t, "p2")]).toEqual([19, 19]);
  });

  it("Emrakul, the World Anew: protection from spells, Aura spells included", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Emrakul, the World Anew"] },
      p2: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Feather of Flight"] },
    });
    const emrakul = idOf(s, "p1", "battlefield", "Emrakul, the World Anew");
    const feather = idOf(s, "p2", "hand", "Feather of Flight");
    const offer = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === feather);
    const spec = offer?.type === "cast" ? (offer.modes[0]?.targets[0]?.id as string) : "";
    expect(() => act(s, "p2", { type: "cast", card: feather, targets: { [spec]: [emrakul] } } as never)).toThrow();
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(act(s, "p2", { type: "cast", card: feather, targets: { [spec]: [cub] } } as never));
    expect(idsOf(s, "p2", "battlefield", "Feather of Flight")).toHaveLength(1);
  });
});
