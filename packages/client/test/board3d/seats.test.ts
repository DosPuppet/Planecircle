/** 3D board (PLAN-W W2): the seats of 2 to 4 players, as the DOM board's grid lays them out. */
import { describe, expect, it } from "vitest";
import { seatTable, tableBounds, toWorld } from "../../src/board3d/seats";

const INSETS = { top: 70, center: 64, bottom: 150 };

describe("3D board seats", () => {
  it("a duel: your battlefield under the center strip, the opponent's above, the same height, piles on the left", () => {
    const t = seatTable({ w: 1600, h: 900 }, ["me", "them"], INSETS);
    const [me, them] = t.seats;
    expect(me?.mine).toBe(true);
    expect(them?.player).toBe("them");
    expect(me?.zone.h).toBe(them?.zone.h);
    expect(them?.zone.y).toBe(70);
    expect((them?.zone.y as number) + (them?.zone.h as number)).toBe(t.center.y);
    expect(me?.zone.y).toBe(t.center.y + t.center.h);
    expect((me?.zone.y as number) + (me?.zone.h as number)).toBe(900 - INSETS.bottom);
    expect(me?.piles.x).toBe(0);
    expect(me?.zone.x).toBe(me?.piles.w);
    expect((me?.zone.x as number) + (me?.zone.w as number)).toBe(1600);
    // The middle of the center strip is the origin; your side is towards the viewer.
    expect(toWorld(t, 800, t.center.y + t.center.h / 2)).toEqual({ x: 0, z: 0 });
    expect(toWorld(t, 800, me?.zone.y as number).z).toBeGreaterThan(0);
    const b = tableBounds(t);
    expect([b.x0, b.x1]).toEqual([-8, 8]);
    expect(b.z0).toBeLessThan(0);
    expect(b.z1).toBeGreaterThan(0);
  });

  it("four players: the three opponents side by side, 8 px apart, sharing the width", () => {
    const t = seatTable({ w: 1600, h: 900 }, ["me", "a", "b", "c"], INSETS);
    const opp = t.seats.slice(1);
    expect(opp.map((s) => s.player)).toEqual(["a", "b", "c"]);
    for (let i = 1; i < 3; i++) {
      const prev = opp[i - 1]?.piles as { x: number; w: number };
      const prevEnd = (opp[i - 1]?.zone.x as number) + (opp[i - 1]?.zone.w as number);
      expect((opp[i]?.piles.x as number) - prevEnd).toBeCloseTo(8, 9);
      expect(prev.w).toBe(opp[i]?.piles.w);
    }
    const last = opp[2];
    expect((last?.zone.x as number) + (last?.zone.w as number)).toBeCloseTo(1600, 9);
  });
});
