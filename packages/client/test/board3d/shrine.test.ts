/** 3D board (PLAN-X): the shrine's plan keeps the stage over open water, the banks and the torii around it. */
import { describe, expect, it } from "vitest";
import { shrinePlan, WALK } from "../../src/board3d/shrine/plan";
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
      // The torii in the water beyond the far side.
      expect(plan.torii.z).toBeLessThan(plan.stage.z0 - 1);
      expect(plan.height(plan.torii.x, plan.torii.z)).toBeLessThan(plan.level - 0.5);
      // The same banks every time.
      expect(shrinePlan(rim).height(3.3, -20.1)).toBe(plan.height(3.3, -20.1));
    });

  it("the tide: a few hundredths of a unit, two minutes from high to high", () => {
    const samples = Array.from({ length: 241 }, (_, i) => tideAt(i / 2));
    expect(Math.max(...samples)).toBeCloseTo(0.09, 3);
    expect(Math.min(...samples)).toBeCloseTo(-0.09, 3);
    expect(tideAt(0)).toBeCloseTo(tideAt(120), 9);
  });
});
