/** 3D board (PLAN-W W4): cards fly by critically damped springs, from where they were to where the model puts them. */
import { describe, expect, it } from "vitest";
import { Springs, stepSpring } from "../../src/board3d/motion";
import type { CardPose } from "../../src/board3d/project";

const pose = (x: number, z = 0, rot = 0): CardPose => ({ x, y: 0, z, w: 1, h: 1.2, rot });
const run = (springs: Springs, seconds: number) => {
  let moving = true;
  for (let t = 0; t < seconds && moving; t += 1 / 60) moving = springs.step(1 / 60);
  return moving;
};

describe("3D board motion", () => {
  it("a spring reaches its target in under a second, without overshooting", () => {
    const s = { pose: pose(0), vel: { x: 0, y: 0, z: 0, w: 0, h: 0, rot: 0 }, target: pose(3, 0, 17) };
    let max = 0;
    let t = 0;
    while (stepSpring(s, 1 / 60) && t < 3) {
      max = Math.max(max, s.pose.x);
      t += 1 / 60;
    }
    expect(t).toBeLessThan(1);
    expect(max).toBeLessThanOrEqual(3 + 1e-6);
    expect(s.pose).toEqual(pose(3, 0, 17));
  });

  it("a new card starts where `start` says, a card coming back from where it left", () => {
    const springs = new Springs();
    springs.setTargets(new Map([["a", pose(2)]]), () => pose(-5));
    expect(springs.pose("a")?.x).toBe(-5);
    expect(run(springs, 3)).toBe(false);
    expect(springs.pose("a")?.x).toBe(2);
    // Gone (to the stack), then back: from where it was last.
    springs.setTargets(new Map(), () => undefined);
    springs.setTargets(new Map([["a", pose(0, 4)]]), () => pose(9));
    expect(springs.pose("a")).toEqual(pose(2));
    // A card remembered from elsewhere (the hand) starts there.
    springs.remember("b", pose(1, 7));
    springs.setTargets(new Map([["b", pose(0)]]), () => pose(9));
    expect(springs.pose("b")).toEqual(pose(1, 7));
  });

  it("retargeted in flight, a card turns towards the new place; reduced motion jumps at once", () => {
    const springs = new Springs();
    springs.setTargets(new Map([["a", pose(0)]]), () => undefined);
    springs.setTargets(new Map([["a", pose(4)]]), () => undefined);
    springs.step(0.1);
    springs.setTargets(new Map([["a", pose(-4)]]), () => undefined);
    run(springs, 3);
    expect(springs.pose("a")?.x).toBe(-4);
    const instant = new Springs(Number.POSITIVE_INFINITY);
    instant.setTargets(new Map([["a", pose(5)]]), () => pose(0));
    expect(instant.step(1 / 60)).toBe(false);
    expect(instant.pose("a")?.x).toBe(5);
  });
});

describe("3D board jolts", () => {
  it("a card hit is thrown off its place, then springs back; reduced motion keeps it still", () => {
    const springs = new Springs();
    springs.setTargets(new Map([["a", pose(1, 2)]]), () => undefined);
    springs.kick("a", 0.2, () => 0);
    expect(springs.pose("a")).toMatchObject({ x: 1.2, z: 2 });
    expect(run(springs, 3)).toBe(false);
    expect(springs.pose("a")).toEqual(pose(1, 2));
    const still = new Springs(Number.POSITIVE_INFINITY);
    still.setTargets(new Map([["a", pose(1, 2)]]), () => undefined);
    still.kick("a", 0.2, () => 0);
    expect(still.pose("a")).toEqual(pose(1, 2));
  });
});
