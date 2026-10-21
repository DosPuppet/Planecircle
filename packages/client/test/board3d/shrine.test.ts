/** 3D board (PLAN-X): the shrine's plan keeps the stage over open water, the banks, the torii and the islet around it. */
import { describe, expect, it } from "vitest";
import { OVER_TABLE } from "../../src/board3d/shrine/fall";
import { KOI_RING } from "../../src/board3d/shrine/life";
import { loop } from "../../src/board3d/shrine/paths";
import { shrinePlan, WALK } from "../../src/board3d/shrine/plan";
import { SEASONS } from "../../src/board3d/shrine/season";
import { BRIDGE_HALF, railPosts, railRuns } from "../../src/board3d/shrine/stage";
import { growTree } from "../../src/board3d/shrine/trees";
import { tideAt } from "../../src/board3d/shrine/water";
import { CROSS_EVERY, CROSS_FOR, obakeAt, walkwayLoop } from "../../src/board3d/shrine/yokai";

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

  it("the seasons: sakura in bloom and petals in spring, momiji red in autumn, bare branches and snow in winter", () => {
    expect(SEASONS.spring.sakura?.tile).toBe("blossom");
    expect(SEASONS.spring.falling?.kind).toBe("petal");
    expect(SEASONS.summer.falling).toBeNull();
    expect(SEASONS.autumn.momiji?.tile).toBe("maple");
    expect(SEASONS.autumn.falling?.kind).toBe("leaf");
    expect(SEASONS.winter.sakura).toBeNull();
    expect(SEASONS.winter.momiji).toBeNull();
    expect(SEASONS.winter.falling?.kind).toBe("snow");
    for (const [name, look] of Object.entries(SEASONS)) expect(look.snow > 0, name).toBe(name === "winter");
  });

  it("trees grow upwards from their root, the same every time, the pines wide and flat", () => {
    for (const kind of ["sakura", "momiji", "pine"] as const) {
      const { wood, tips } = growTree(kind, 5);
      expect(wood.getAttribute("position").count).toBeGreaterThan(100);
      expect(tips.length).toBeGreaterThan(4);
      for (const t of tips) expect(t.at.y, kind).toBeGreaterThan(0.3);
      expect(growTree(kind, 5).tips.map((t) => t.at.toArray())).toEqual(tips.map((t) => t.at.toArray()));
    }
    const spread = (kind: "sakura" | "pine") => {
      const { tips } = growTree(kind, 5);
      const ys = tips.map((t) => t.at.y);
      const xs = tips.map((t) => Math.hypot(t.at.x, t.at.z));
      return Math.max(...xs) / (Math.max(...ys) - Math.min(...ys) + 0.01);
    };
    expect(spread("pine")).toBeGreaterThan(spread("sakura"));
  });

  it("a loop around a rectangle: closed, its length its perimeter, its heading along the way", () => {
    const l = loop({ x0: -2, x1: 2, z0: -1, z1: 1 }, 0.5, 0.4);
    // The rectangle grown by 0.5, corners of radius 0.4: straight runs and four quarter circles.
    expect(l.length).toBeCloseTo(2 * (5 - 0.8) + 2 * (3 - 0.8) + 2 * Math.PI * 0.4, 6);
    const a = l.at(0);
    const b = l.at(l.length);
    expect([b.x, b.z]).toEqual([a.x, a.z]);
    for (let s = 0; s < l.length; s += 0.05) {
      const p = l.at(s);
      const q = l.at(s + 0.01);
      // Moving along the heading (0: +x, π/2: -z).
      expect((q.x - p.x) * Math.cos(p.heading) - (q.z - p.z) * Math.sin(p.heading)).toBeGreaterThan(0.009);
    }
  });

  it("the lantern ghost walks the walkway, never on the mats; it hops, then stops to look around", () => {
    for (const rim of RIMS) {
      const plan = shrinePlan(rim);
      const walk = walkwayLoop(plan);
      for (let s = 0; s < walk.length; s += 0.05) {
        const { x, z } = walk.at(s);
        // Outside the rim (the mats and piles are inside it) by more than the ghost's half width, on the deck.
        const outside = Math.max(rim.x0 - x, x - rim.x1, rim.z0 - z, z - rim.z1);
        const inside = Math.min(x - plan.stage.x0, plan.stage.x1 - x, z - plan.stage.z0, plan.stage.z1 - z);
        expect(outside, `${x}, ${z}`).toBeGreaterThan(0.25);
        expect(inside, `${x}, ${z}`).toBeGreaterThan(0.25);
      }
      let last = obakeAt(0, walk.length).s;
      let pauses = 0;
      for (let t = 0.02; t < 30; t += 0.02) {
        const step = obakeAt(t, walk.length);
        expect(Math.abs(step.s - last) < 0.1 || Math.abs(step.s - last) > walk.length - 0.1).toBe(true);
        if (step.pause) pauses++;
        last = step.s;
      }
      expect(pauses).toBeGreaterThan(0);
    }
  });

  it("flying things over the cards: rarely and briefly (the user's rule)", () => {
    expect(CROSS_FOR / CROSS_EVERY).toBeLessThan(0.15);
    expect(OVER_TABLE).toBeLessThanOrEqual(0.15);
  });

  it("the koi swim clear of the torii's legs and between the bridge's pillars", () => {
    for (const rim of RIMS) {
      const plan = shrinePlan(rim);
      // The torii's legs stand 0.42 on each side of its line; a koi is 0.27 long.
      const legs = plan.stage.x0 - (plan.torii.x + 0.42);
      expect(KOI_RING[1] + 0.14).toBeLessThan(legs);
      expect(KOI_RING[0] - 0.14).toBeGreaterThan(0.2);
    }
  });
});
