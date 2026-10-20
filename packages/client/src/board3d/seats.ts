/**
 * The table of the 3D board (PLAN-W W2): where each player's battlefield and piles lie, in table pixels laid out as the
 * DOM board's grid (opponents' bars, opponents' battlefields side by side, center strip, your battlefield, your hand),
 * then on the table plane at 100 pixels per world unit, the center strip on z = 0. Pure.
 */

/** Pixels per world unit: `placement.ts` works in pixels, the scene in world units. */
export const PX = 100;
/** Gap between the opponents' battlefields (`.opponents`). */
const OPP_GAP = 8;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Seat {
  player: string;
  mine: boolean;
  /** The battlefield, in table pixels. */
  zone: Rect;
  /** Library, graveyard and exile: a column at the left end of the seat. */
  piles: Rect;
}

export interface Table {
  w: number;
  h: number;
  /** The center strip (phases, banner, stack). */
  center: Rect;
  seats: Seat[];
}

/**
 * Seats for `players` (the viewer first, then the opponents from left to right) on a table the size of the viewport;
 * `insets`: heights kept for the DOM HUD (opponents' bars at the top, center strip, your bar and hand at the bottom);
 * `depth`: the battlefields made deeper than the screen leaves them (seen at an angle, the table looks shallower).
 */
export function seatTable(
  viewport: { w: number; h: number },
  players: string[],
  insets: { top: number; center: number; bottom: number },
  depth = 1,
): Table {
  const { w, h } = viewport;
  const fieldH = Math.max(0, ((h - insets.top - insets.center - insets.bottom) / 2) * depth);
  const pileW = Math.round(Math.min(110, Math.max(56, w * 0.06)));
  const seat = (player: string, mine: boolean, x: number, y: number, width: number): Seat => ({
    player,
    mine,
    piles: { x, y, w: pileW, h: fieldH },
    zone: { x: x + pileW, y, w: Math.max(0, width - pileW), h: fieldH },
  });
  const [me = "", ...opponents] = players;
  const n = Math.max(1, opponents.length);
  const oppW = (w - OPP_GAP * (n - 1)) / n;
  const centerY = insets.top + fieldH;
  return {
    w,
    h,
    center: { x: 0, y: centerY, w, h: insets.center },
    seats: [
      seat(me, true, 0, centerY + insets.center, w),
      ...opponents.map((p, i) => seat(p, false, i * (oppW + OPP_GAP), insets.top, oppW)),
    ],
  };
}

/** World position (x, z) of a table pixel: the middle of the center strip at the origin, z towards the viewer. */
export function toWorld(t: Table, x: number, y: number): { x: number; z: number } {
  return { x: (x - t.w / 2) / PX, z: (y - (t.center.y + t.center.h / 2)) / PX };
}

/** The table's extent in world units (what the camera must show). */
export function tableBounds(t: Table): { x0: number; x1: number; z0: number; z1: number } {
  const zones = t.seats.map((s) => s.zone);
  const top = Math.min(...zones.map((z) => z.y));
  const bottom = Math.max(...zones.map((z) => z.y + z.h));
  const a = toWorld(t, 0, top);
  const b = toWorld(t, t.w, bottom);
  return { x0: a.x, x1: b.x, z0: a.z, z1: b.z };
}
