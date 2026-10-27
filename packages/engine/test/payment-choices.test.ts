/**
 * Payment choices (PLAN-L L7): Phyrexian mana paid with life or mana as the player chooses (107.4f), the color of a
 * hybrid symbol chosen for any hybrid cost (107.4e). The automatic payment with multicolor lands: the color of a land
 * tapped by hand, the least flexible lands first, the colors the rest of the hand needs spared.
 */
import { describe, expect, it } from "vitest";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { canPay, manaSources, parseManaCost } from "../src/mana";
import type { GameState, ManaType } from "../src/types";
import { act, cast, castable, idOf, lands, scenario, settle } from "./helpers";

const castOption = (s: GameState, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
const tappedLands = (s: GameState, name: string) =>
  s.battlefield.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === name && s.objects[id]?.tapped).length;

describe("payment choices (PLAN-L L7)", () => {
  it("Gut Shot: {R/P} paid with {R} or 2 life, as the player chooses", () => {
    const setup = () => scenario({ p1: { battlefield: ["Mountain"], hand: ["Gut Shot"] } });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Gut Shot");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.phyrexianLife).toEqual([0, 1]);
    const cast = (life?: number) =>
      act(setup(), "p1", {
        type: "cast",
        card,
        targets: { t: ["p2"] },
        ...(life !== undefined ? { phyrexianLife: life } : {}),
      });
    // Without a choice: the mana pays first.
    const auto = cast();
    expect([auto.players.p1?.life, tappedLands(auto, "Mountain")]).toEqual([20, 1]);
    const life = cast(1);
    expect([life.players.p1?.life, tappedLands(life, "Mountain")]).toEqual([18, 0]);
    const mana = cast(0);
    expect([mana.players.p1?.life, tappedLands(mana, "Mountain")]).toEqual([20, 1]);
    // More symbols than the cost has: refused.
    expect(() => cast(2)).toThrow(RulesError);
  });

  it("K'rrik: three {B/P}, any number of them paid with life; not more life than the player has", () => {
    const setup = (life = 20) => {
      const s = scenario({ p1: { battlefield: lands("Swamp", 7), hand: ["K'rrik, Son of Yawgmoth"] } });
      if (s.players.p1) s.players.p1.life = life;
      return s;
    };
    const s = setup();
    const card = idOf(s, "p1", "hand", "K'rrik, Son of Yawgmoth");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && opt.phyrexianLife).toEqual([0, 1, 2, 3]);
    const two = act(setup(), "p1", { type: "cast", card, phyrexianLife: 2 });
    expect([two.players.p1?.life, tappedLands(two, "Swamp")]).toEqual([16, 5]);
    // 5 life: at most two symbols with life (paying life needs at least that much, 119.4).
    const low = setup(5);
    const lowOpt = castOption(low, card);
    expect(lowOpt?.type === "cast" && lowOpt.phyrexianLife).toEqual([0, 1, 2]);
    expect(() => act(setup(5), "p1", { type: "cast", card, phyrexianLife: 3 })).toThrow(RulesError);
  });

  it("only the mana: no choice offered when life can't pay (4 Swamps, 1 life)", () => {
    const s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Surgical Extraction"] }, p2: { graveyard: ["Shock"] } });
    if (s.players.p1) s.players.p1.life = 1;
    const opt = castOption(s, idOf(s, "p1", "hand", "Surgical Extraction"));
    expect(opt?.type).toBe("cast");
    expect(opt?.type === "cast" && opt.phyrexianLife).toBeUndefined();
  });

  it("hybrid: the color is chosen for any hybrid spell (Dryad Militant {G/W})", () => {
    const setup = () => scenario({ p1: { battlefield: ["Forest", "Plains"], hand: ["Dryad Militant"] } });
    const s = setup();
    const card = idOf(s, "p1", "hand", "Dryad Militant");
    const opt = castOption(s, card);
    expect(opt?.type === "cast" && [opt.hybridColors, opt.hybridMatters]).toEqual([["G", "W"], undefined]);
    const w = act(setup(), "p1", { type: "cast", card, hybridAs: "W" });
    expect([tappedLands(w, "Plains"), tappedLands(w, "Forest")]).toEqual([1, 0]);
    const g = act(setup(), "p1", { type: "cast", card, hybridAs: "G" });
    expect([tappedLands(g, "Plains"), tappedLands(g, "Forest")]).toEqual([0, 1]);
    expect(() => act(setup(), "p1", { type: "cast", card, hybridAs: "U" })).toThrow(RulesError);
  });
});

describe("automatic payment and multicolor lands", () => {
  it("by hand: a dual land offers each of its colors and produces the chosen one", () => {
    const s = scenario({ p1: { battlefield: ["Dismal Backwater", "Meticulous Archive"] } });
    const backwater = idOf(s, "p1", "battlefield", "Dismal Backwater");
    const archive = idOf(s, "p1", "battlefield", "Meticulous Archive");
    const offered = (id: string) =>
      legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? [a.colors] : []));
    expect(offered(backwater)).toEqual([["U", "B"]]);
    expect(offered(archive)).toEqual([["W"], ["U"]]);
    let t = act(s, "p1", { type: "tapForMana", source: backwater, ability: 0, color: "B" });
    t = act(t, "p1", { type: "tapForMana", source: archive, ability: 1, color: "U" });
    expect(t.players.p1?.manaPool).toMatchObject({ W: 0, U: 1, B: 1 });
  });

  it("a land with two basic land types or a Verge is tapped after a basic land, whatever the order they were played in", () => {
    // Meticulous Archive (Plains Island) has one ability per color: it is still a dual land, kept for later.
    for (const order of [
      ["Meticulous Archive", "Plains"],
      ["Plains", "Meticulous Archive"],
    ]) {
      const s = cast(scenario({ p1: { battlefield: order, hand: ["Healer's Hawk"] } }), "p1", "Healer's Hawk");
      expect([tappedLands(s, "Plains"), tappedLands(s, "Meticulous Archive")]).toEqual([1, 0]);
    }
    // Gloomlake Verge ({U}, or {B} with an Island or a Swamp): Duress paid with the Swamp, Opt still castable.
    const v = cast(scenario({ p1: { battlefield: ["Gloomlake Verge", "Swamp"], hand: ["Duress", "Opt"] } }), "p1", "Duress", {
      targets: { t: ["p2"] },
    });
    expect([tappedLands(v, "Swamp"), tappedLands(v, "Gloomlake Verge")]).toEqual([1, 0]);
    expect(castable(v, "p1", idOf(v, "p1", "hand", "Opt"))).toBe(true);
  });

  it("the colors the rest of the hand needs are spared (as on Arena)", () => {
    // Opt ({U}) with Dismal Backwater (U/B) and Mystic Monastery (U/R/W): the land whose other colors no card needs.
    const pay = (other: string) => {
      const s = settle(
        cast(scenario({ p1: { battlefield: ["Dismal Backwater", "Mystic Monastery"], hand: ["Opt", other] } }), "p1", "Opt"),
      );
      return [
        tappedLands(s, "Dismal Backwater"),
        tappedLands(s, "Mystic Monastery"),
        castable(s, "p1", idOf(s, "p1", "hand", other)),
      ];
    };
    expect(pay("Duress")).toEqual([0, 1, true]);
    expect(pay("Healer's Hawk")).toEqual([1, 0, true]);
  });

  it("castable exactly when a payment exists: the solver against every color of every land (500 random boards)", () => {
    const pool = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes", "Dismal Backwater", "Blossoming Sands"];
    pool.push("Jungle Hollow", "Mystic Monastery", "Adarkar Wastes", "Meticulous Archive", "Gloomlake Verge", "Mana Confluence");
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const payable = (options: ManaType[][], colored: ManaType[], generic: number): boolean => {
      const pick = (i: number, got: ManaType[]): boolean => {
        if (i === options.length) {
          const left = [...got];
          for (const m of colored) {
            const k = left.indexOf(m);
            if (k < 0) return false;
            left.splice(k, 1);
          }
          return left.length >= generic;
        }
        return pick(i + 1, got) || (options[i] ?? []).some((m) => pick(i + 1, [...got, m]));
      };
      return pick(0, []);
    };
    const wrong: string[] = [];
    for (let n = 0; n < 500; n++) {
      const board = Array.from({ length: 1 + random(6) }, () => pool[random(pool.length)] as string);
      const s = scenario({ p1: { battlefield: board } });
      const colored = Array.from({ length: 1 + random(Math.min(4, board.length)) }, () => "WUBRG"[random(5)] as ManaType);
      const generic = random(3);
      const text = `${generic ? `{${generic}}` : ""}${colored.map((m) => `{${m}}`).join("")}`;
      // The types each land can produce now (a Verge's {B} needs an Island or a Swamp).
      const sources = manaSources(s, "p1");
      const options = s.battlefield.map((id) => [...new Set(sources.filter((x) => x.id === id).flatMap((x) => x.colors))]);
      if (canPay(s, "p1", parseManaCost(text)) !== payable(options, colored, generic)) wrong.push(`${board.join(", ")}: ${text}`);
    }
    expect(wrong).toEqual([]);
  });
});
