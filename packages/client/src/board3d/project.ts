/**
 * From the 3D table to the screen and back (PLAN-W W2), without three.js: 4×4 matrices in column-major order (the order
 * of three's `Matrix4.elements` and of CSS `matrix3d`), the CSS matrix that lays a card's DOM proxy exactly over its
 * mesh, its screen rectangle, and the point of the table under the pointer. Pure.
 *
 * World axes: x to the right, y up, z towards the viewer; the table is the plane y = 0.
 */

export type Mat4 = number[];
export type Vec3 = [number, number, number];

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** a × b (b applied first). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] as number) * (b[c * 4 + k] as number);
      out[c * 4 + r] = sum;
    }
  return out;
}

/** Perspective projection (as three's PerspectiveCamera): vertical field of view in degrees. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan((fovY * Math.PI) / 360);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Vec3): Vec3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** View matrix of a camera at `eye` looking at `target` (the inverse of its world matrix). */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const z = normalize(sub(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
}

/** Clip coordinates of a point. */
export function transform(m: Mat4, p: Vec3): [number, number, number, number] {
  const [x, y, z] = p;
  const at = (r: number) => (m[r] as number) * x + (m[4 + r] as number) * y + (m[8 + r] as number) * z + (m[12 + r] as number);
  return [at(0), at(1), at(2), at(3)];
}

/** Screen position (CSS px, y down) of a world point, through the view-projection matrix. */
export function toScreen(viewProj: Mat4, viewport: { w: number; h: number }, p: Vec3): { x: number; y: number } {
  const [x, y, , w] = transform(viewProj, p);
  return { x: ((x / w + 1) / 2) * viewport.w, y: ((1 - y / w) / 2) * viewport.h };
}

/** A card lying on the table: center, height above it, size (world units) and lean (degrees clockwise seen from above). */
export interface CardPose {
  x: number;
  z: number;
  y: number;
  w: number;
  h: number;
  rot: number;
}

/** World matrix of a card: its face up, its top edge away from the viewer, turned by `rot`. */
export function cardWorld(c: CardPose): Mat4 {
  const a = (-c.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Rotation about y (clockwise on screen for a positive lean), then translation.
  return [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, c.x, c.y, c.z, 1];
}

/** The four corners of a card in the world: top left, top right, bottom right, bottom left (as seen by the viewer). */
export function cardCorners(c: CardPose): Vec3[] {
  const m = cardWorld(c);
  return [
    [-c.w / 2, 0, -c.h / 2],
    [c.w / 2, 0, -c.h / 2],
    [c.w / 2, 0, c.h / 2],
    [-c.w / 2, 0, c.h / 2],
  ].map((p) => {
    const [x, y, z] = transform(m, p as Vec3);
    return [x, y, z] as Vec3;
  });
}

/**
 * The CSS `matrix3d` (16 numbers, column-major) that lays an element of `elem` CSS pixels, with `transform-origin: 0 0`,
 * exactly over a card: element pixels → card plane → world → clip → screen pixels. Its z row only passes the element's
 * own z (always 0) through: the browser must neither clip nor sort the proxies by depth (their order comes from the
 * model), and the matrix stays invertible (CSS does not draw, nor hit-test, an element whose matrix is not). The
 * division by w stays.
 */
export function cardMatrix3d(
  viewProj: Mat4,
  viewport: { w: number; h: number },
  card: CardPose,
  elem: { w: number; h: number },
): Mat4 {
  // Element pixels (u, v) → card plane (x, z) centered on the card.
  const toCard: Mat4 = [card.w / elem.w, 0, 0, 0, 0, 0, card.h / elem.h, 0, 0, 1, 0, 0, -card.w / 2, 0, -card.h / 2, 1];
  // Clip (x, y, z, w) → screen pixels (homogeneous): X = (x + w)/2·W, Y = (w − y)/2·H, Z = 0.
  const toScreenM: Mat4 = [viewport.w / 2, 0, 0, 0, 0, -viewport.h / 2, 0, 0, 0, 0, 0, 0, viewport.w / 2, viewport.h / 2, 0, 1];
  const m = multiply(toScreenM, multiply(viewProj, multiply(cardWorld(card), toCard)));
  m[2] = 0;
  m[6] = 0;
  m[10] = 1;
  m[14] = 0;
  return m;
}

/** CSS text of a matrix3d, small values rounded off (as three's CSS3DRenderer does, against the browsers' jitter). */
export function cssMatrix(m: Mat4): string {
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-10 ? 0 : v)).join(",")})`;
}

/** Bounding rectangle of a card on the screen (CSS px). */
export function screenRect(
  viewProj: Mat4,
  viewport: { w: number; h: number },
  card: CardPose,
): { left: number; top: number; right: number; bottom: number } {
  const pts = cardCorners(card).map((p) => toScreen(viewProj, viewport, p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Inverse of a 4×4 matrix (null when it is singular). */
export function invert(m: Mat4): Mat4 | null {
  const a = m;
  const inv = new Array<number>(16);
  const v = (i: number) => a[i] as number;
  inv[0] =
    v(5) * v(10) * v(15) -
    v(5) * v(11) * v(14) -
    v(9) * v(6) * v(15) +
    v(9) * v(7) * v(14) +
    v(13) * v(6) * v(11) -
    v(13) * v(7) * v(10);
  inv[4] =
    -v(4) * v(10) * v(15) +
    v(4) * v(11) * v(14) +
    v(8) * v(6) * v(15) -
    v(8) * v(7) * v(14) -
    v(12) * v(6) * v(11) +
    v(12) * v(7) * v(10);
  inv[8] =
    v(4) * v(9) * v(15) -
    v(4) * v(11) * v(13) -
    v(8) * v(5) * v(15) +
    v(8) * v(7) * v(13) +
    v(12) * v(5) * v(11) -
    v(12) * v(7) * v(9);
  inv[12] =
    -v(4) * v(9) * v(14) +
    v(4) * v(10) * v(13) +
    v(8) * v(5) * v(14) -
    v(8) * v(6) * v(13) -
    v(12) * v(5) * v(10) +
    v(12) * v(6) * v(9);
  inv[1] =
    -v(1) * v(10) * v(15) +
    v(1) * v(11) * v(14) +
    v(9) * v(2) * v(15) -
    v(9) * v(3) * v(14) -
    v(13) * v(2) * v(11) +
    v(13) * v(3) * v(10);
  inv[5] =
    v(0) * v(10) * v(15) -
    v(0) * v(11) * v(14) -
    v(8) * v(2) * v(15) +
    v(8) * v(3) * v(14) +
    v(12) * v(2) * v(11) -
    v(12) * v(3) * v(10);
  inv[9] =
    -v(0) * v(9) * v(15) +
    v(0) * v(11) * v(13) +
    v(8) * v(1) * v(15) -
    v(8) * v(3) * v(13) -
    v(12) * v(1) * v(11) +
    v(12) * v(3) * v(9);
  inv[13] =
    v(0) * v(9) * v(14) -
    v(0) * v(10) * v(13) -
    v(8) * v(1) * v(14) +
    v(8) * v(2) * v(13) +
    v(12) * v(1) * v(10) -
    v(12) * v(2) * v(9);
  inv[2] =
    v(1) * v(6) * v(15) -
    v(1) * v(7) * v(14) -
    v(5) * v(2) * v(15) +
    v(5) * v(3) * v(14) +
    v(13) * v(2) * v(7) -
    v(13) * v(3) * v(6);
  inv[6] =
    -v(0) * v(6) * v(15) +
    v(0) * v(7) * v(14) +
    v(4) * v(2) * v(15) -
    v(4) * v(3) * v(14) -
    v(12) * v(2) * v(7) +
    v(12) * v(3) * v(6);
  inv[10] =
    v(0) * v(5) * v(15) -
    v(0) * v(7) * v(13) -
    v(4) * v(1) * v(15) +
    v(4) * v(3) * v(13) +
    v(12) * v(1) * v(7) -
    v(12) * v(3) * v(5);
  inv[14] =
    -v(0) * v(5) * v(14) +
    v(0) * v(6) * v(13) +
    v(4) * v(1) * v(14) -
    v(4) * v(2) * v(13) -
    v(12) * v(1) * v(6) +
    v(12) * v(2) * v(5);
  inv[3] =
    -v(1) * v(6) * v(11) +
    v(1) * v(7) * v(10) +
    v(5) * v(2) * v(11) -
    v(5) * v(3) * v(10) -
    v(9) * v(2) * v(7) +
    v(9) * v(3) * v(6);
  inv[7] =
    v(0) * v(6) * v(11) -
    v(0) * v(7) * v(10) -
    v(4) * v(2) * v(11) +
    v(4) * v(3) * v(10) +
    v(8) * v(2) * v(7) -
    v(8) * v(3) * v(6);
  inv[11] =
    -v(0) * v(5) * v(11) +
    v(0) * v(7) * v(9) +
    v(4) * v(1) * v(11) -
    v(4) * v(3) * v(9) -
    v(8) * v(1) * v(7) +
    v(8) * v(3) * v(5);
  inv[15] =
    v(0) * v(5) * v(10) - v(0) * v(6) * v(9) - v(4) * v(1) * v(10) + v(4) * v(2) * v(9) + v(8) * v(1) * v(6) - v(8) * v(2) * v(5);
  const det = v(0) * (inv[0] as number) + v(1) * (inv[4] as number) + v(2) * (inv[8] as number) + v(3) * (inv[12] as number);
  if (Math.abs(det) < 1e-12) return null;
  return inv.map((x) => (x as number) / det);
}

/** The point of the table (y = 0) under a screen point, or null when the ray misses it (above the horizon). */
export function pointerToTable(
  invViewProj: Mat4,
  viewport: { w: number; h: number },
  sx: number,
  sy: number,
): { x: number; z: number } | null {
  const nx = (sx / viewport.w) * 2 - 1;
  const ny = 1 - (sy / viewport.h) * 2;
  const unproject = (nz: number): Vec3 => {
    const [x, y, z, w] = transform(invViewProj, [nx, ny, nz]);
    return [x / w, y / w, z / w];
  };
  const near = unproject(-1);
  const far = unproject(1);
  const dy = far[1] - near[1];
  if (Math.abs(dy) < 1e-12) return null;
  const t = -near[1] / dy;
  if (t < 0) return null;
  return { x: near[0] + (far[0] - near[0]) * t, z: near[2] + (far[2] - near[2]) * t };
}
