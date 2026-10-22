/**
 * The neon city's plan (PLAN-Y): the rooftop the battlefields lie on, and the megacity around it, in world units from
 * the battlefields' rim. Pure (the tests check that nothing stands over the table and nothing tall on its near side).
 *
 * The stage (the rim and a walkway) is a helipad on the roof of a tower; the roof reaches a little beyond it (its
 * clutter on the far side, screens on frames at its sides). Around, the city drops to streets far below: blocks of buildings
 * on a grid, lower than the roof so the camera looks down into the canyons; two towers rise beside the far corners,
 * where the camera sees them whole, their faces covered in screens.
 */
import type { Bounds } from "../arena";

export interface Building {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Height of its roof (world units; the deck is at 0). */
  top: number;
  /** A seed for its windows, signs and colors. */
  seed: number;
}

export interface NeonPlan {
  rim: Bounds;
  stage: Bounds;
  /** The roof around the stage (its parapet on the edges). */
  roof: Bounds;
  deck: number;
  /** The streets' level, far below. */
  street: number;
  buildings: Building[];
  /** The two towers beside the far corners (also in `buildings`). */
  towers: [Building, Building];
  /** The streets' middle lines: along x at these z, along z at these x. */
  avenues: { x: number[]; z: number[] };
}

/** The walkway around the battlefields. */
export const WALK = 0.75;
/**
 * The roof beyond the walkway: deep on the far side (its clutter stands there), narrow on the sides (just the parapet:
 * the camera looks past it down into the city), a sliver on the near side.
 */
export const LEDGE = { far: 1.6, side: 0.55, near: 0.3 };
const STREET = -24;
const CELL = 6;
const ROAD = 2.4;
/** From our roof's sides to the middle of the avenues beside it. */
const WIDE = 2.9;

function hash(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function neonPlan(rim: Bounds): NeonPlan {
  const stage = { x0: rim.x0 - WALK, x1: rim.x1 + WALK, z0: rim.z0 - WALK, z1: rim.z1 + WALK };
  const roof = { x0: stage.x0 - LEDGE.side, x1: stage.x1 + LEDGE.side, z0: stage.z0 - LEDGE.far, z1: stage.z1 + LEDGE.near };
  const cx = (roof.x0 + roof.x1) / 2;
  const deck = -0.03;
  // Streets around our tower, then a grid outwards.
  const buildings: Building[] = [];
  // The avenues beside our tower are wide (a plaza each side): the camera looks down into them past the roof's edge.
  const avX: number[] = [roof.x0 - WIDE, roof.x1 + WIDE];
  const avZ: number[] = [roof.z0 - ROAD / 2 - 0.3, roof.z1 + ROAD / 2 + 0.3];
  for (let x = (avX[0] as number) - CELL; x > cx - 46; x -= CELL) avX.unshift(x);
  for (let x = (avX[avX.length - 1] as number) + CELL; x < cx + 46; x += CELL) avX.push(x);
  for (let z = (avZ[0] as number) - CELL; z > roof.z0 - 44; z -= CELL) avZ.unshift(z);
  for (let z = (avZ[avZ.length - 1] as number) + CELL; z < roof.z1 + 20; z += CELL) avZ.push(z);
  for (let i = 0; i < avX.length - 1; i++)
    for (let j = 0; j < avZ.length - 1; j++) {
      const x0 = (avX[i] as number) + ROAD / 2;
      const x1 = (avX[i + 1] as number) - ROAD / 2;
      const z0 = (avZ[j] as number) + ROAD / 2;
      const z1 = (avZ[j + 1] as number) - ROAD / 2;
      // Our own tower's block: the roof.
      if (x0 < roof.x1 && x1 > roof.x0 && z0 < roof.z1 && z1 > roof.z0) continue;
      // Each block one to four buildings, lower than our roof (the camera looks down on them), lower near us.
      const split = hash(i, j) < 0.5 ? 1 : 2;
      for (let k = 0; k < split; k++)
        for (let l = 0; l < split; l++) {
          const w = (x1 - x0) / split;
          const d = (z1 - z0) / split;
          const seed = i * 131 + j * 17 + k * 7 + l;
          const near = Math.min(Math.abs(x0 + w * (k + 0.5) - cx), 40) / 40;
          buildings.push({
            x0: x0 + w * k + 0.15,
            x1: x0 + w * (k + 1) - 0.15,
            z0: z0 + d * l + 0.15,
            z1: z0 + d * (l + 1) - 0.15,
            top: -1.6 - 2.5 * hash(seed, 3) - 5 * (1 - near) * hash(seed, 5) - 9 * hash(seed, 7) ** 2,
            seed,
          });
        }
    }
  // The two towers beside the far corners, taller than our roof: their screens face the table.
  const tower = (side: -1 | 1, seed: number): Building => {
    const x = side < 0 ? roof.x0 - WIDE - ROAD / 2 - 2.4 : roof.x1 + WIDE + ROAD / 2 + 0.2;
    return { x0: x, x1: x + 2.2, z0: roof.z0 - 0.4, z1: roof.z0 + 2.6, top: 2.6 + hash(seed, 1), seed };
  };
  const towers: [Building, Building] = [tower(-1, 901), tower(1, 907)];
  // They replace whatever stood there.
  const kept = buildings.filter((b) => !towers.some((t) => b.x0 < t.x1 && b.x1 > t.x0 && b.z0 < t.z1 && b.z1 > t.z0));
  return {
    rim,
    stage,
    roof,
    deck,
    street: STREET,
    buildings: [...kept, ...towers],
    towers,
    avenues: { x: avX, z: avZ },
  };
}
