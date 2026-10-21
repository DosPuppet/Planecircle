/**
 * Geometry for the shrine's buildings (PLAN-X X2): a few shapes of Japanese architecture built from numbers, merged
 * into one geometry per material so that a building costs a few draw calls.
 */
import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Euler,
  BufferGeometry as Geometry,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** A geometry moved, turned (radians, XYZ) and scaled into place (it is changed, and returned). */
export function placed(
  g: BufferGeometry,
  at: [number, number, number],
  turn: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): BufferGeometry {
  const m = new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...turn)), new Vector3(...scale));
  return g.applyMatrix4(m);
}

/** One geometry from several (each with position, normal and uv; they are disposed). */
export function merged(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of parts) p.dispose();
  const out = mergeGeometries(flat) as BufferGeometry;
  for (const p of flat) p.dispose();
  return out;
}

/**
 * A beam along x, `length` long, its ends curving up by `lift` (the sori of a torii's lintel, of eaves), the curve
 * mostly near the ends.
 */
export function curvedBeam(length: number, height: number, depth: number, lift: number, segments = 24): BufferGeometry {
  const g = new BoxGeometry(length, height, depth, segments, 1, 1);
  const pos = g.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.abs(pos.getX(i)) / (length / 2);
    pos.setY(i, pos.getY(i) + lift * t ** 3);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A Japanese roof: from a ridge (half length `ridge` along x, at `height`) down to the eaves (half sizes `eaveX`,
 * `eaveZ`), concave (steep under the ridge, flatter towards the eaves), its corners swept up by `lift`; `thickness` of
 * slab, an underside (the reflections see it). UVs in world units (tiles follow the slope). Square roofs (pagoda):
 * `ridge` 0.
 */
export function roof(o: {
  eaveX: number;
  eaveZ: number;
  ridge: number;
  height: number;
  thickness: number;
  lift: number;
  rings?: number;
  side?: number;
}): BufferGeometry {
  const rings = o.rings ?? 10;
  const side = o.side ?? 12;
  const per = side * 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  /** The ring at `s` (0: ridge, 1: eaves), `below`: the underside. */
  const ring = (s: number, below: boolean) => {
    const hx = o.ridge + (o.eaveX - o.ridge) * s;
    const hz = o.eaveZ * s;
    const y0 = o.height * (1 - s ** 0.72) - (below ? o.thickness : 0);
    const corners: [number, number][] = [
      [hx, hz],
      [-hx, hz],
      [-hx, -hz],
      [hx, -hz],
    ];
    let along = 0;
    for (let k = 0; k <= per; k++) {
      // Around the ring: the last point closes it on the first corner (its own UVs: the seam).
      const p = k / side;
      const sideIndex = Math.floor(p) % 4;
      const f = p - Math.floor(p);
      const [ax, az] = corners[sideIndex] as [number, number];
      const [bx, bz] = corners[(sideIndex + 1) % 4] as [number, number];
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      const cx = hx > 1e-6 ? Math.abs(x) / hx : 0;
      const cz = hz > 1e-6 ? Math.abs(z) / hz : 0;
      const corner = cx ** 8 * cz ** 8;
      const y = y0 + o.lift * s ** 3 * corner + o.lift * 0.15 * s ** 2;
      if (k > 0) {
        const [px, , pz] = positions.slice(-3);
        along += Math.hypot(x - (px as number), z - (pz as number));
      }
      positions.push(x, y, z);
      uvs.push(along, s * Math.hypot(o.eaveZ, o.height));
    }
  };
  for (const below of [false, true]) {
    const base = positions.length / 3;
    for (let r = 0; r <= rings; r++) ring(r / rings, below);
    for (let r = 0; r < rings; r++)
      for (let k = 0; k < per; k++) {
        const a = base + r * (per + 1) + k;
        const b = a + per + 1;
        // Top faces up, the underside faces down.
        if (below) index.push(a, a + 1, b, a + 1, b + 1, b);
        else index.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  // The eaves' edge: the slab's thickness.
  const top = rings * (per + 1);
  const under = (rings + 1) * (per + 1) + rings * (per + 1);
  for (let k = 0; k < per; k++) index.push(top + k, under + k, top + k + 1, top + k + 1, under + k, under + k + 1);
  const g = new Geometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
