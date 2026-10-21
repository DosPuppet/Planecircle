/**
 * The arena of the 3D board (PLAN-W W5): what `tools/arena-assets.ts` built (served on /arena/), and where its props
 * stand around the table. Pure: the loaders are in `assets.ts`.
 */

/**
 * A prop on the table, outside the battlefields: an anchor on the rim, an offset (world units), its size (its largest
 * dimension, world units: a card is about 1.1 wide), a turn (degrees).
 */
export interface Prop {
  model: string;
  anchor: "far-left" | "far" | "far-right" | "left" | "right" | "near-left" | "near-right";
  at: [number, number];
  size: number;
  turn: number;
  /** Laid on its side (a sword, a shield): its longest side along the table. */
  lie?: boolean;
  /** A flame at its top: a warm light. */
  light?: boolean;
}

/** data/arena/manifest.json; version 0: nothing built (the plain table). */
export interface ArenaManifest {
  version: number;
  hdri?: string;
  materials?: Record<string, { tile: number; diff?: string; nor_gl?: string; arm?: string }>;
  models?: Record<string, string>;
  props?: Prop[];
}

/** The rim of the table, in world units. */
export interface Bounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Where a prop stands: its center on the table, and its turn about the vertical (radians). */
export function propPose(p: Prop, b: Bounds): { x: number; z: number; turn: number } {
  const midX = (b.x0 + b.x1) / 2;
  const midZ = (b.z0 + b.z1) / 2;
  const anchors: Record<Prop["anchor"], [number, number]> = {
    "far-left": [b.x0, b.z0],
    far: [midX, b.z0],
    "far-right": [b.x1, b.z0],
    left: [b.x0, midZ],
    right: [b.x1, midZ],
    "near-left": [b.x0, b.z1],
    "near-right": [b.x1, b.z1],
  };
  const [ax, az] = anchors[p.anchor];
  return { x: ax + p.at[0], z: az + p.at[1], turn: (p.turn * Math.PI) / 180 };
}

/** Does a prop's footprint (its box on the table, world units) stay off the battlefields, inside the rim? */
export function clearOfRim(box: { x0: number; x1: number; z0: number; z1: number }, b: Bounds): boolean {
  return box.x1 < b.x0 || box.x0 > b.x1 || box.z1 < b.z0 || box.z0 > b.z1;
}
