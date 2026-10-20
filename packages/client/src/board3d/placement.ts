/**
 * Where each card of a battlefield lies (PLAN-W W2), in pixels of its zone (x right, y down from the top edge), as the
 * DOM board's CSS places it (`styles.css`, "Battlefield"): rows and lines centered, slots separated by GAP, lands piled,
 * token piles with their shadows, Auras and Equipment peeking above their host, planeswalkers in a column on the right.
 * The 3D board lays these pixels on the table (100 px per world unit, `seats.ts`), so both boards keep the same
 * proportions. Pure.
 */
import type { ObjectView } from "@mtgx/engine";
import {
  ATTACH_PEEK,
  type BattlefieldFit,
  type BattlefieldModel,
  GAP,
  LAND_SCALE,
  PERM_RATIO,
  type Slot,
  splitLines,
  TAP_DEG,
  TAP_W,
  TOKEN_OFFSET,
  TOKEN_SHADOWS,
} from "../board/layout";

/** Padding of `.battlefield` (px). */
export const PAD_X = 14;
export const PAD_Y = 4;
/** Gap between the rows, and between the lines of a row (`.bf-rows`, `.perm-row`). */
const ROW_GAP = 6;
/** Extra margin before the first slot of a new block (`.slot.block-start`). */
const BLOCK_MARGIN = 18;
/** Left margin, padding and border of the planeswalker column (`.walker-zone`). */
const WALKER_INDENT = 27;
/** Attackers move this far towards the middle of the table (`.perm.advance-up`). */
export const ADVANCE = 16;
/** Pile of identical lands: each land overlaps the previous one by this share of a land's width. */
const LAND_OVERLAP = 0.74;
/** Vertical offset of each shadow card of a token pile (share of a card's width, `.token-shadow`). */
const SHADOW_RISE = 0.03;

/** A card lying on the battlefield. */
export interface Placed {
  id: string;
  uid: string;
  obj: ObjectView;
  /** Center, in pixels of the zone. */
  x: number;
  y: number;
  /** Size of the card, untapped (px). */
  w: number;
  h: number;
  /** Lean, in degrees clockwise (a tapped card). */
  rot: number;
  /** Painting order in the zone: higher is in front. */
  layer: number;
  kind: "permanent" | "attachment" | "exiled" | "shadow";
  /** Top card of a token pile: the ids of the whole pile. */
  pile?: string[];
}

/** A box laid out in a line: its width and height, and how to place its cards once its top-left corner is known. */
interface Box {
  w: number;
  h: number;
  place(left: number, top: number, out: Placed[]): void;
}

const slotWidth = (o: ObjectView, w: number) => (o.tapped ? w * TAP_W : w);

/**
 * The battlefield of a player: `fit` comes from `fitBattlefield` for this zone, `mine` says whether it is the viewer's
 * (their front row towards the middle of the table, an opponent's back row away from it), `attacking` whether a
 * permanent moves forward (declared or chosen attacker).
 */
export function placeBattlefield(
  m: BattlefieldModel,
  fit: BattlefieldFit,
  zone: { w: number; h: number },
  mine: boolean,
  attacking: (o: ObjectView) => boolean,
): Placed[] {
  const out: Placed[] = [];
  const cardW = fit.cardW;
  if (!cardW) return out;
  let layer = 0;
  const advance = mine ? -ADVANCE : ADVANCE;

  /** A permanent with what stacks under it: Auras and Equipment, then the cards it exiled. */
  const perm = (o: ObjectView, w: number): Box => {
    const h = w * PERM_RATIO;
    const under = [...(m.attachments.get(o.id) ?? []), ...(m.exiled.get(o.id) ?? [])];
    const nAttached = m.attachments.get(o.id)?.length ?? 0;
    return {
      w: slotWidth(o, w),
      h: h * (1 + ATTACH_PEEK * under.length),
      place(left, top, acc) {
        const dy = attacking(o) ? advance : 0;
        under.forEach((a, i) => {
          acc.push({
            id: a.id,
            uid: a.uid,
            obj: a,
            x: left + slotWidth(a, w) / 2,
            y: top + dy + h * ATTACH_PEEK * i + h / 2,
            w,
            h,
            rot: a.tapped && i < nAttached ? TAP_DEG : 0,
            layer: layer++,
            kind: i < nAttached ? "attachment" : "exiled",
          });
        });
        acc.push({
          id: o.id,
          uid: o.uid,
          obj: o,
          x: left + slotWidth(o, w) / 2,
          y: top + dy + h * ATTACH_PEEK * under.length + h / 2,
          w,
          h,
          rot: o.tapped ? TAP_DEG : 0,
          layer: layer++,
          kind: "permanent",
        });
      },
    };
  };

  /** A slot of a line: a card, a pile of lands (overlapping), or a pile of tokens (shadows, then the top card). */
  const slot = (s: Slot, w: number): Box => {
    if (s.kind === "tokens") {
      const top = s.objs[0] as ObjectView;
      const shadows = Math.min(TOKEN_SHADOWS, s.objs.length - 1);
      const inset = w * TOKEN_OFFSET * shadows;
      const topBox = perm(top, w);
      return {
        w: inset + topBox.w,
        h: topBox.h,
        place(left, top0, acc) {
          s.objs.slice(1, 1 + shadows).forEach((o, i) => {
            const rise = shadows - i;
            acc.push({
              id: o.id,
              uid: o.uid,
              obj: o,
              x: left + w * TOKEN_OFFSET * i + slotWidth(o, w) / 2,
              y: top0 - w * SHADOW_RISE * rise + (w * PERM_RATIO) / 2,
              w,
              h: w * PERM_RATIO,
              rot: o.tapped ? TAP_DEG : 0,
              layer: layer++,
              kind: "shadow",
            });
          });
          const before = acc.length;
          topBox.place(left + inset, top0, acc);
          (acc[before] as Placed).pile = s.objs.map((o) => o.id);
        },
      };
    }
    const boxes = s.objs.map((o) => perm(o, w));
    const overlap = s.kind === "pile" ? w * LAND_OVERLAP : 0;
    const h = Math.max(...boxes.map((b) => b.h));
    return {
      w: boxes.reduce((sum, b) => sum + b.w, 0) - overlap * (boxes.length - 1),
      h,
      place(left, top, acc) {
        let x = left;
        for (const b of boxes) {
          b.place(x, top + (h - b.h) / 2, acc);
          x += b.w - overlap;
        }
      },
    };
  };

  /** A line: slots side by side, centered, with a wider space where a new block starts. */
  const line = (slots: Slot[], w: number): Box => {
    const boxes = slots.map((s) => slot(s, w));
    const margins = slots.map((s, i) => (i > 0 && s.block !== slots[i - 1]?.block ? BLOCK_MARGIN : 0));
    const h = boxes.length ? Math.max(...boxes.map((b) => b.h)) : 0;
    return {
      w: boxes.reduce((sum, b, i) => sum + b.w + (margins[i] as number), 0) + GAP * Math.max(0, boxes.length - 1),
      h,
      place(left, top, acc) {
        let x = left;
        boxes.forEach((b, i) => {
          x += margins[i] as number;
          b.place(x, top + (h - b.h) / 2, acc);
          x += b.w + GAP;
        });
      },
    };
  };

  const landW = cardW * LAND_SCALE;
  const rowLines = (slots: Slot[], n: number, w: number) => {
    const ls = splitLines(slots, n).filter((l) => l.length);
    return (mine ? ls : ls.reverse()).map((l) => line(l, w));
  };
  const rows = [
    { lines: rowLines(m.front, fit.frontLines, cardW), min: cardW * PERM_RATIO + 10 },
    { lines: rowLines(m.back, fit.backLines, landW), min: landW * PERM_RATIO },
  ];
  if (!mine) rows.reverse();
  const heights = rows.map((r) =>
    Math.max(r.min, r.lines.reduce((sum, l) => sum + l.h, 0) + ROW_GAP * Math.max(0, r.lines.length - 1)),
  );
  // Planeswalker column: as wide as its widest card (a tapped one leans).
  const walkerBoxes = m.walkers.map((s) => perm(s.objs[0] as ObjectView, cardW));
  const columnW = Math.max(0, ...walkerBoxes.map((b) => b.w));
  const walkersW = walkerBoxes.length ? WALKER_INDENT + columnW : 0;
  const rowsLeft = PAD_X;
  const rowsW = zone.w - 2 * PAD_X - walkersW;
  const contentH = zone.h - 2 * PAD_Y;
  let y = PAD_Y + (contentH - heights.reduce((a, b) => a + b, 0) - ROW_GAP * (rows.length - 1)) / 2;
  rows.forEach((r, i) => {
    const rowH = heights[i] as number;
    const linesH = r.lines.reduce((sum, l) => sum + l.h, 0) + ROW_GAP * Math.max(0, r.lines.length - 1);
    let ly = y + (rowH - linesH) / 2;
    for (const l of r.lines) {
      l.place(rowsLeft + (rowsW - l.w) / 2, ly, out);
      ly += l.h + ROW_GAP;
    }
    y += rowH + ROW_GAP;
  });

  // Planeswalkers: a column on the right, overlapping when they don't fit in height (the later ones in front).
  if (walkerBoxes.length) {
    const overlap = Math.min(0, fit.walkerStep - cardW * PERM_RATIO);
    const total = walkerBoxes.reduce((sum, b) => sum + b.h, 0) + overlap * (walkerBoxes.length - 1);
    let wy = PAD_Y + (contentH - total) / 2;
    const left = zone.w - PAD_X - columnW;
    for (const b of walkerBoxes) {
      b.place(left, wy, out);
      wy += b.h + overlap;
    }
  }
  return out;
}
