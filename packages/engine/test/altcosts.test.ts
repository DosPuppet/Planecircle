/** Alternative costs that make you pay something other than mana (PLAN-G G4e): Force of Will, Daze, Force of Vigor. */
import { describe, expect, it } from "vitest";
import { legalActions } from "../src/legal";
import { act, idOf, idsOf, lands, nameOf, namesIn, scenario, settle } from "./helpers";

type S = ReturnType<typeof scenario>;
const opt = (s: S, name: string) =>
  legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", name));
/** p2 casts a Shock on p1, then p1 has priority. */
const shockFirst = (s: S) => {
  const t = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
  return act(t, "p2", { type: "pass" });
};

describe("alternative costs paid in other ways", () => {
  it("Force of Will: 1 life and a blue card exiled from hand; counters", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Will", "Opt", "Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    const o = opt(s, "Force of Will");
    expect(o?.type === "cast" && o.altAvailable).toBe(true);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Will"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
      }),
    );
    expect(s.players.p1?.life).toBe(19);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
  });

  it("Force of Will: with no other blue card in hand, no alternative cost", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Will", "Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    expect(opt(s, "Force of Will")).toBeUndefined();
  });

  it("Daze: an Island returned to hand instead of mana", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Island"], hand: ["Daze"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Daze"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
      }),
    );
    expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Force of Vigor: free by exiling a green card, only during another player's turn", () => {
    const mine = scenario({ p1: { hand: ["Force of Vigor", "Bear Cub"] }, p2: { battlefield: ["Ghostly Prison"] } });
    expect(opt(mine, "Force of Vigor")).toBeUndefined();
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Vigor", "Bear Cub"] },
      p2: { battlefield: ["Ghostly Prison", ...lands("Mountain", 1)], hand: ["Shock"] },
    });
    s = shockFirst(s);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Vigor"),
        alternative: true,
        targets: { t: [idOf(s, "p2", "battlefield", "Ghostly Prison")] },
      }),
    );
    expect(idsOf(s, "p2", "graveyard", "Ghostly Prison")).toHaveLength(1);
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  // PLAN-M M6: the objects of the alternative cost are chosen by the player (the suggestion: the former automatic pick).
  it("Force of Will: the player chooses the exiled blue card (the cheapest is only the suggestion)", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Will", "Opt", "Counterspell"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    const o = opt(s, "Force of Will");
    const pick = o?.type === "cast" ? o.picks?.find((p) => p.slot === "handExile") : undefined;
    expect(pick?.when).toBe("alternative");
    expect(namesIn(s, pick?.suggested)).toEqual(["Opt"]);
    expect(namesIn(s, pick?.options)).toEqual(["Opt", "Counterspell"]);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Will"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
        picks: { handExile: [idOf(s, "p1", "hand", "Counterspell")] },
      }),
    );
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Counterspell"]);
    expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
  });

  it("Force of Will: a card that isn't blue can't be exiled", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Will", "Opt", "Bear Cub"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Will"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
        picks: { handExile: [idOf(s, "p1", "hand", "Bear Cub")] },
      }),
    ).toThrow();
  });

  it("Force of Vigor: the player chooses the exiled green card", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Force of Vigor", "Bear Cub", "Giant Growth"] },
      p2: { battlefield: ["Ghostly Prison", ...lands("Mountain", 1)], hand: ["Shock"] },
    });
    s = shockFirst(s);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Force of Vigor"),
        alternative: true,
        targets: { t: [idOf(s, "p2", "battlefield", "Ghostly Prison")] },
        picks: { handExile: [idOf(s, "p1", "hand", "Bear Cub")] },
      }),
    );
    expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "hand", "Giant Growth")).toHaveLength(1);
  });

  it("Daze: the player chooses the returned Island (a tapped one is only the suggestion)", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Island", tapped: true }, "Island"], hand: ["Daze"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = shockFirst(s);
    const [tapped, untapped] = idsOf(s, "p1", "battlefield", "Island") as [string, string];
    expect(s.objects[tapped]?.tapped).toBe(true);
    const o = opt(s, "Daze");
    const pick = o?.type === "cast" ? o.picks?.find((p) => p.slot === "altReturn") : undefined;
    expect(pick?.suggested).toEqual([tapped]);
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Daze"),
        alternative: true,
        targets: { t: [s.stack[0]?.id as string] },
        picks: { altReturn: [untapped] },
      }),
    );
    expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Island").map((id) => s.objects[id]?.tapped)).toEqual([true]);
  });
});
