/**
 * Paths of the shrine's life (PLAN-X X4): rounded loops around a rectangle, walked by arc length (the koi around the
 * stage, the lantern ghost on the walkway). Pure (the tests check that the walkway's loop never reaches the mats).
 */
import type { Bounds } from "../arena";

export interface Loop {
  length: number;
  /** The point at arc length `s` (any number: it wraps), and the heading there (radians, 0 along +x, turning to -z). */
  at(s: number): { x: number; z: number; heading: number };
}

/** The loop `offset` outside `b` (negative: inside), its corners rounded with `radius`, counterclockwise from above. */
export function loop(b: Bounds, offset: number, radius: number): Loop {
  const x0 = b.x0 - offset;
  const x1 = b.x1 + offset;
  const z0 = b.z0 - offset;
  const z1 = b.z1 + offset;
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (z1 - z0) / 2));
  const w = x1 - x0 - 2 * r;
  const d = z1 - z0 - 2 * r;
  const arc = (Math.PI / 2) * r;
  // Straight runs and quarter arcs, from the near side's left end, going right (+x) along the near side.
  const pieces: { len: number; at(u: number): [number, number, number] }[] = [
    { len: w, at: (u) => [x0 + r + w * u, z1, 0] },
    { len: arc, at: (u) => corner(x1 - r, z1 - r, -Math.PI / 2 + (Math.PI / 2) * u) },
    { len: d, at: (u) => [x1, z1 - r - d * u, Math.PI / 2] },
    { len: arc, at: (u) => corner(x1 - r, z0 + r, (Math.PI / 2) * u) },
    { len: w, at: (u) => [x1 - r - w * u, z0, Math.PI] },
    { len: arc, at: (u) => corner(x0 + r, z0 + r, Math.PI / 2 + (Math.PI / 2) * u) },
    { len: d, at: (u) => [x0, z0 + r + d * u, -Math.PI / 2] },
    { len: arc, at: (u) => corner(x0 + r, z1 - r, Math.PI + (Math.PI / 2) * u) },
  ];
  /** A point on a corner's arc, at angle `a` (0: +x, π/2: -z), its heading along the loop. */
  function corner(cx: number, cz: number, a: number): [number, number, number] {
    return [cx + r * Math.cos(a), cz - r * Math.sin(a), a + Math.PI / 2];
  }
  const length = pieces.reduce((n, p) => n + p.len, 0);
  return {
    length,
    at(s: number) {
      let t = ((s % length) + length) % length;
      for (const p of pieces) {
        if (t <= p.len || p === pieces[pieces.length - 1]) {
          const [x, z, heading] = p.at(p.len > 0 ? Math.min(1, t / p.len) : 0);
          return { x, z, heading };
        }
        t -= p.len;
      }
      return { x: x0, z: z1, heading: 0 };
    },
  };
}
