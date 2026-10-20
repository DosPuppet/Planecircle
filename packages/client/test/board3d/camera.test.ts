/** 3D board (PLAN-W W2): the camera shows the whole table, as close as it can, whatever the screen's shape. */
import { describe, expect, it } from "vitest";
import { frameSeats, frameTable, viewProjection } from "../../src/board3d/camera";
import { transform } from "../../src/board3d/project";
import { seatTable, tableBounds } from "../../src/board3d/seats";

const INSETS = { top: 70, center: 64, bottom: 150 };

describe("3D board camera", () => {
  for (const [w, h] of [
    [1024, 768],
    [1600, 900],
    [2560, 1080],
  ] as const)
    for (const players of [2, 4])
      it(`${w}×${h}, ${players} players: the table inside the band, filling it on one side`, () => {
        const table = seatTable({ w, h }, ["p1", "p2", "p3", "p4"].slice(0, players), INSETS);
        const bounds = tableBounds(table);
        const margin = { top: INSETS.top / h, bottom: INSETS.bottom / h, side: 0.01 };
        const f = frameTable({ aspect: w / h, bounds, margin });
        const vp = viewProjection(f, w / h);
        const ndc = (x: number, z: number) => {
          const [nx, ny, , nw] = transform(vp, [x, 0, z]);
          return { x: nx / nw, y: ny / nw };
        };
        const corners = [
          ndc(bounds.x0, bounds.z0),
          ndc(bounds.x1, bounds.z0),
          ndc(bounds.x1, bounds.z1),
          ndc(bounds.x0, bounds.z1),
        ];
        const eps = 1e-6;
        for (const c of corners) {
          expect(c.y).toBeLessThanOrEqual(1 - 2 * margin.top + eps);
          expect(c.y).toBeGreaterThanOrEqual(-1 + 2 * margin.bottom - eps);
          expect(Math.abs(c.x)).toBeLessThanOrEqual(1 - 2 * margin.side + eps);
        }
        // As close as possible: the height or the width of the band is filled.
        const [farL, farR, nearR, nearL] = corners as { x: number; y: number }[];
        const heightFill = ((farL?.y as number) - (nearL?.y as number)) / (2 - 2 * margin.top - 2 * margin.bottom);
        const widthFill = ((nearR?.x as number) - (nearL?.x as number)) / (2 - 4 * margin.side);
        expect(Math.max(heightFill, widthFill)).toBeGreaterThan(0.999);
        // Seen at an angle: the far side is narrower.
        expect((farR?.x as number) - (farL?.x as number)).toBeLessThan((nearR?.x as number) - (nearL?.x as number));
        // The camera looks down at the table from the viewer's side.
        expect(f.eye[1]).toBeGreaterThan(0);
        expect(f.eye[2]).toBeGreaterThan(f.target[2]);
      });
});

describe("3D board seats and camera together", () => {
  for (const [w, h] of [
    [1600, 900],
    [1280, 720],
    [2560, 1080],
  ] as const)
    it(`${w}×${h}: the battlefields deepen until the table fills the band in height and width`, () => {
      const { table, framing, depth } = frameSeats({ w, h }, ["p1", "p2"], INSETS);
      const vp = viewProjection(framing, w / h);
      const b = tableBounds(table);
      const ndc = (x: number, z: number) => {
        const [nx, ny, , nw] = transform(vp, [x, 0, z]);
        return { x: nx / nw, y: ny / nw };
      };
      const band = 2 - (2 * (INSETS.top + INSETS.bottom)) / h;
      expect((ndc(0, b.z0).y - ndc(0, b.z1).y) / band).toBeGreaterThan(0.995);
      expect(ndc(b.x1, b.z1).x - ndc(b.x0, b.z1).x).toBeGreaterThan(2 * 0.98 * 0.995);
      expect(depth).toBeGreaterThanOrEqual(1);
      expect(table.seats[0]?.zone.h).toBeCloseTo(((h - INSETS.top - INSETS.center - INSETS.bottom) / 2) * depth, 6);
    });
});
