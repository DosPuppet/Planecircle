/** 3D board (PLAN-X): the shrine's plan keeps the stage over open water, the banks, the torii and the islet around it. */
import { describe, expect, it } from "vitest";
import { shrinePlan, WALK } from "../../src/board3d/shrine/plan";
import { BRIDGE_HALF, railPosts, railRuns } from "../../src/board3d/shrine/stage";
import { tideAt } from "../../src/board3d/shrine/water";

const RIMS = [
  { x0: -8, x1: 8, z0: -5.5, z1: 5.5 },
  { x0: -6.4, x1: 6.4, z0: -4, z1: 4 },
  { x0: -12.8, x1: 12.8, z0: -7, z1: 7 },
];

describe("the shrine's plan", () => {
  for (const rim of RIMS)
    it(`rim ${rim.x1 * 2}×${rim.z1 * 2}: the stage stands over the water, the banks beyond it`, () => {
      const plan = shrinePlan(rim);
      expect(plan.stage).toEqual({ x0: rim.x0 - WALK, x1: rim.x1 + WALK, z0: rim.z0 - WALK, z1: rim.z1 + WALK });
      // Under the stage, the seabed is well under the water (no sand through the deck); a unit around it, still water
      // (shallows towards the near corners).
      for (let x = plan.stage.x0 - 1; x <= plan.stage.x1 + 1; x += 0.5)
        for (let z = plan.stage.z0 - 1; z <= plan.stage.z1 + 1; z += 0.5) {
          const under = x >= plan.stage.x0 && x <= plan.stage.x1 && z >= plan.stage.z0 && z <= plan.stage.z1;
          expect(plan.height(x, z), `${x}, ${z}`).toBeLessThan(plan.level - (under ? 0.4 : 0.1));
        }
      // The shore beyond each side, the land above the water beyond it.
      for (let z = plan.stage.z0; z <= plan.stage.z1; z += 1)
        for (const side of [-1, 1] as const) {
          const shore = plan.shore(side, z);
          expect(side * (shore - (side < 0 ? plan.stage.x0 : plan.stage.x1))).toBeGreaterThan(1.2);
          expect(plan.height(shore + side * 4, z)).toBeGreaterThan(plan.level + 0.3);
        }
      // The torii in the water between the stage's left side and the beach, the hall on dry land behind it.
      const { torii, hall, islet } = plan;
      expect(torii.x).toBeLessThan(plan.stage.x0 - 0.9);
      expect(torii.x).toBeGreaterThan(plan.shore(-1, torii.z) + 0.3);
      for (const dz of [-1.3, 0, 1.3]) expect(plan.height(torii.x, torii.z + dz)).toBeLessThan(plan.level - 0.3);
      expect(plan.height(hall.x, hall.z)).toBeGreaterThan(plan.level + 0.1);
      // The islet out of the water off the right side, clear of the stage; the bridge aimed at it.
      expect(plan.height(islet.x, islet.z)).toBeGreaterThan(plan.level + 0.05);
      expect(islet.x - islet.r - plan.stage.x1).toBeGreaterThan(0.6);
      expect(Math.abs(plan.bridge - islet.z)).toBeLessThan(islet.r / 2);
      // The same banks every time.
      expect(shrinePlan(rim).height(3.3, -20.1)).toBe(plan.height(3.3, -20.1));
    });

  it("the tide: a few hundredths of a unit, two minutes from high to high", () => {
    const samples = Array.from({ length: 241 }, (_, i) => tideAt(i / 2));
    expect(Math.max(...samples)).toBeCloseTo(0.09, 3);
    expect(Math.min(...samples)).toBeCloseTo(-0.09, 3);
    expect(tideAt(0)).toBeCloseTo(tideAt(120), 9);
  });

  it("the railings: none on the near side (they would rise into your battlefield), an opening for the bridge", () => {
    const plan = shrinePlan(RIMS[0] as (typeof RIMS)[number]);
    const runs = railRuns(plan);
    for (const [, az, , bz] of runs) expect(Math.max(az, bz)).toBeLessThan(plan.stage.z1 - 0.4);
    // On the right side, nothing within the opening; the posts once each.
    const right = runs.filter(([ax, , bx]) => ax > plan.stage.x1 - 0.5 && bx > plan.stage.x1 - 0.5);
    expect(right).toHaveLength(2);
    for (const [, az, , bz] of right)
      expect(Math.min(az, bz) >= plan.bridge + BRIDGE_HALF - 1e-9 || Math.max(az, bz) <= plan.bridge - BRIDGE_HALF + 1e-9).toBe(
        true,
      );
    const posts = railPosts(plan);
    for (const [i, [x, z]] of posts.entries()) expect(posts.findIndex(([a, b]) => Math.hypot(a - x, b - z) < 0.01)).toBe(i);
  });
});
