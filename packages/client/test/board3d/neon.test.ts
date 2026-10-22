/** 3D board (PLAN-Y): the neon city's plan keeps the table clear, the city below the roof but for two towers. */
import { describe, expect, it } from "vitest";
import { LEDGE, neonPlan, WALK } from "../../src/board3d/neon/plan";
import { RAIN_OVER_TABLE } from "../../src/board3d/neon/weather";

const RIMS = [
  { x0: -8, x1: 8, z0: -5.5, z1: 5.5 },
  { x0: -6.4, x1: 6.4, z0: -4, z1: 4 },
  { x0: -12.8, x1: 12.8, z0: -7, z1: 7 },
];

describe("the neon city's plan", () => {
  for (const rim of RIMS)
    it(`rim ${rim.x1 * 2}×${rim.z1 * 2}: the roof under the stage, the city below it, two towers beside the far corners`, () => {
      const plan = neonPlan(rim);
      expect(plan.stage).toEqual({ x0: rim.x0 - WALK, x1: rim.x1 + WALK, z0: rim.z0 - WALK, z1: rim.z1 + WALK });
      expect(plan.roof.x0).toBeCloseTo(plan.stage.x0 - LEDGE.side, 9);
      expect(plan.roof.z0).toBeCloseTo(plan.stage.z0 - LEDGE.far, 9);
      const { roof } = plan;
      for (const b of plan.buildings) {
        // Nothing on our roof.
        expect(b.x1 <= roof.x0 || b.x0 >= roof.x1 || b.z1 <= roof.z0 || b.z0 >= roof.z1, JSON.stringify(b)).toBe(true);
        expect(b.x1).toBeGreaterThan(b.x0);
        expect(b.z1).toBeGreaterThan(b.z0);
        // Below the deck (the camera looks down on them), but the two towers.
        if (!plan.towers.includes(b)) expect(b.top).toBeLessThan(plan.deck - 1);
      }
      // The towers beside the far corners: off the roof's sides, towards its far edge, never on the near side.
      const [left, right] = plan.towers;
      expect(left.x1).toBeLessThan(roof.x0 - 1);
      expect(right.x0).toBeGreaterThan(roof.x1 + 1);
      for (const t of plan.towers) expect(t.z1).toBeLessThan((roof.z0 + roof.z1) / 2);
      // The streets far below.
      expect(plan.street).toBeLessThan(-15);
      // The same city every time.
      expect(neonPlan(rim).buildings).toEqual(plan.buildings);
    });

  it("the rain over the cards: few drops (readability)", () => {
    expect(RAIN_OVER_TABLE).toBeLessThanOrEqual(0.15);
  });
});
