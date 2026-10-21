/**
 * The camera of the 3D board (PLAN-W W2): it looks down at the table at a fixed angle, as on MTG Arena (the far side
 * smaller), from as close as the whole table still fits in the screen, inside the bands the DOM HUD keeps. Pure.
 */
import { lookAt, type Mat4, multiply, perspective, transform, type Vec3 } from "./project";
import { seatTable, type Table, tableBounds } from "./seats";

export interface Framing {
  eye: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  near: number;
  far: number;
}

/** Angle of the view below the horizon (degrees): 90 would be straight down. */
export const PITCH = 52;
export const FOV = 34;

export function viewProjection(f: Framing, aspect: number): Mat4 {
  return multiply(perspective(f.fov, aspect, f.near, f.far), lookAt(f.eye, f.target));
}

/**
 * The closest camera that shows the table `bounds` (world units, on y = 0) inside the screen less `margin` (shares of
 * the screen height or width kept free at the top, bottom and on each side), the table centered in what is left.
 */
export function frameTable(o: {
  aspect: number;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  margin: { top: number; bottom: number; side: number };
  fov?: number;
  pitch?: number;
}): Framing {
  const fov = o.fov ?? FOV;
  const pitch = ((o.pitch ?? PITCH) * Math.PI) / 180;
  const { x0, x1, z0, z1 } = o.bounds;
  const cx = (x0 + x1) / 2;
  // Allowed band, in normalized device coordinates (y up).
  const yLow = -1 + 2 * o.margin.bottom;
  const yHigh = 1 - 2 * o.margin.top;
  const xMax = 1 - 2 * o.margin.side;
  const framing = (tz: number, d: number): Framing => ({
    eye: [cx, d * Math.sin(pitch), tz + d * Math.cos(pitch)],
    target: [cx, 0, tz],
    fov,
    near: d / 20,
    far: d * 4,
  });
  const ndc = (f: Framing, p: Vec3) => {
    const [x, y, , w] = transform(viewProjection(f, o.aspect), p);
    return { x: x / w, y: y / w };
  };
  // For a distance, the target that centers the table's far and near edges in the band.
  const centered = (d: number): Framing => {
    const mid = (yLow + yHigh) / 2;
    let lo = z0 - (z1 - z0);
    let hi = z1 + (z1 - z0);
    for (let i = 0; i < 60; i++) {
      const tz = (lo + hi) / 2;
      const f = framing(tz, d);
      const c = (ndc(f, [cx, 0, z0]).y + ndc(f, [cx, 0, z1]).y) / 2;
      // Moving the target towards the viewer moves the table up on the screen.
      if (c > mid) hi = tz;
      else lo = tz;
    }
    return framing((lo + hi) / 2, d);
  };
  const fits = (f: Framing) => {
    const far = ndc(f, [x0, 0, z0]);
    const nearL = ndc(f, [x0, 0, z1]);
    const nearR = ndc(f, [x1, 0, z1]);
    return far.y <= yHigh && nearL.y >= yLow && Math.abs(nearL.x) <= xMax && Math.abs(nearR.x) <= xMax;
  };
  // The closest distance that fits (the table only shrinks as the camera backs away).
  const size = Math.max(x1 - x0, z1 - z0, 1e-3);
  let lo = size * 0.1;
  let hi = size * 20;
  for (let i = 0; i < 60; i++) {
    const d = (lo + hi) / 2;
    if (fits(centered(d))) hi = d;
    else lo = d;
  }
  return centered(hi);
}

/** Room a diorama asks for around the table so its scenery shows: shares of the screen's width (each side) and height. */
export interface Room {
  side: number;
  top: number;
}

/**
 * The seats and the camera together: seen at an angle the table looks shallower than the screen, so the battlefields are
 * made deeper (larger cards) until the table fills the band the HUD leaves in height as well as in width, less the
 * `room` a diorama keeps around it (a narrower table, as on a narrower screen).
 */
export function frameSeats(
  viewport: { w: number; h: number },
  players: string[],
  insets: { top: number; center: number; bottom: number },
  room: Room = { side: 0, top: 0 },
): { table: Table; framing: Framing; depth: number } {
  const aspect = viewport.w / Math.max(1, viewport.h);
  const margin = {
    top: insets.top / Math.max(1, viewport.h) + room.top,
    bottom: insets.bottom / Math.max(1, viewport.h),
    side: 0.01 + room.side,
  };
  const laid = { w: viewport.w * (1 - 2 * room.side), h: viewport.h };
  const at = (depth: number) => {
    const table = seatTable(laid, players, insets, depth);
    const bounds = tableBounds(table);
    const framing = frameTable({ aspect, bounds, margin });
    const vp = viewProjection(framing, aspect);
    const y = (z: number) => {
      const [, cy, , w] = transform(vp, [0, 0, z]);
      return cy / w;
    };
    const fill = (y(bounds.z0) - y(bounds.z1)) / (2 - 2 * margin.top - 2 * margin.bottom);
    return { table, framing, depth, fill };
  };
  const flat = at(1);
  if (!(flat.fill < 0.999)) return flat;
  let lo = 1;
  let hi = 4;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).fill < 0.999) lo = mid;
    else hi = mid;
  }
  return at(hi);
}
