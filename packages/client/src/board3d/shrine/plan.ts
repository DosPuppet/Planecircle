/**
 * The shrine's plan (PLAN-X): where things lie around the table, in world units, from the battlefields' rim. Pure (the
 * terrain, the water, the buildings and the life all read it; its tests check that nothing stands on the table).
 *
 * The hinoki stage covers the rim and a walkway around it, over the bay; the water's level at rest lies under the stage.
 * Banks rise beyond its left and right sides (a beach, then the land), farther away towards the far side, where the
 * bay opens and the torii stands in the water; the pagoda on the left bank, the halls on the right.
 */
import type { Bounds } from "../arena";

export interface ShrinePlan {
  rim: Bounds;
  /** The stage's deck: the rim and its walkway. */
  stage: Bounds;
  /** Top of the deck. */
  deck: number;
  /** The water's level at rest (the tide moves it a few hundredths). */
  level: number;
  /** Ground height (seabed under the water, beach, land) at a point. */
  height(x: number, z: number): number;
  /** Where the shore is (the ground at the water's level) beyond each side of the stage, at a depth z. */
  shore(side: -1 | 1, z: number): number;
  torii: { x: number; z: number };
}

/** The walkway around the battlefields. */
export const WALK = 0.75;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Value noise, deterministic (no Math.random: the same banks every time). */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j);
  const b = hash(i + 1, j);
  const c = hash(i, j + 1);
  const d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function shrinePlan(rim: Bounds): ShrinePlan {
  const stage = { x0: rim.x0 - WALK, x1: rim.x1 + WALK, z0: rim.z0 - WALK, z1: rim.z1 + WALK };
  const cx = (stage.x0 + stage.x1) / 2;
  const hw = (stage.x1 - stage.x0) / 2;
  const level = -0.62;
  const seabed = -1.6;
  /**
   * The beach's middle beyond a side of the stage: about two units of water at the table's height, receding towards the
   * far side (the bay opens), closer towards the near side; a slow wave along it, and noise.
   */
  const gap = (side: -1 | 1, z: number) =>
    1.9 +
    0.45 * Math.sin(z * 0.42 + side * 1.7) +
    0.5 * (noise(z * 0.35, side * 9) - 0.5) +
    Math.max(0, stage.z0 - z) * 0.5 -
    Math.max(0, z - stage.z1) * 0.35;
  const height = (x: number, z: number) => {
    const side = x < cx ? -1 : 1;
    const s = Math.abs(x - cx) - hw - gap(side, z);
    const land = smooth(-1.8, 2.2, s);
    // The land: low dunes near the beach, then higher and uneven.
    const top = 0.1 + 0.55 * smooth(1.5, 8, s) + 0.3 * (noise(x * 0.32, z * 0.32) - 0.4) * smooth(0.5, 3, s);
    // The seabed: rippled sand, a little deeper far out.
    const bed = seabed + 0.08 * (noise(x * 0.9, z * 0.9) - 0.5) - 0.25 * smooth(0, 10, stage.z0 - z);
    return bed + (top - bed) * land;
  };
  const shore = (side: -1 | 1, z: number) => {
    // The beach crosses the level near s = 0.45 (where the land's share brings the ground up to it): searched.
    let lo = 0;
    let hi = 12;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (height(cx + side * (hw + mid), z) < level) lo = mid;
      else hi = mid;
    }
    return cx + side * (hw + (lo + hi) / 2);
  };
  return {
    rim,
    stage,
    deck: -0.03,
    level,
    height,
    shore,
    torii: { x: cx, z: stage.z0 - 3.2 },
  };
}
