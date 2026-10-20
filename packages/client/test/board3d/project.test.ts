/** 3D board (PLAN-W W2): matrices as three.js computes them, proxies exactly over their cards, pointer to table. */
import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import {
  type CardPose,
  cardCorners,
  cardMatrix3d,
  invert,
  lookAt,
  type Mat4,
  multiply,
  perspective,
  pointerToTable,
  screenRect,
  toScreen,
  transform,
  type Vec3,
} from "../../src/board3d/project";

const VIEW = { w: 1600, h: 900 };
const EYE: Vec3 = [0.4, 9, 7];
const TARGET: Vec3 = [0, 0, 0.5];
const viewProj = () => multiply(perspective(34, VIEW.w / VIEW.h, 0.5, 60), lookAt(EYE, TARGET));
const close = (a: number[], b: number[]) => {
  for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i] as number, 9);
};

/** Where a CSS matrix3d (transform-origin 0 0) puts the element point (u, v). */
function cssPoint(m: Mat4, u: number, v: number) {
  const [x, y, , w] = transform(m, [u, v, 0]);
  return { x: x / w, y: y / w };
}

describe("3D board projection", () => {
  it("perspective and lookAt give three's PerspectiveCamera matrices", () => {
    const cam = new PerspectiveCamera(34, VIEW.w / VIEW.h, 0.5, 60);
    cam.position.set(...EYE);
    cam.lookAt(...TARGET);
    cam.updateMatrixWorld();
    close(perspective(34, VIEW.w / VIEW.h, 0.5, 60), [...cam.projectionMatrix.elements]);
    close(lookAt(EYE, TARGET), [...cam.matrixWorldInverse.elements]);
  });

  it("a proxy's matrix3d lays its corners and center on the card's, tapped or not", () => {
    const vp = viewProj();
    for (const card of [
      { x: -1.2, z: 1.4, y: 0, w: 1.1, h: 1.32, rot: 0 },
      { x: 2.5, z: -2, y: 0.05, w: 0.8, h: 0.96, rot: 17 },
    ] as CardPose[]) {
      const elem = { w: 110, h: 132 };
      const m = cardMatrix3d(vp, VIEW, card, elem);
      const corners = cardCorners(card).map((p) => toScreen(vp, VIEW, p));
      const mapped = [
        [0, 0],
        [elem.w, 0],
        [elem.w, elem.h],
        [0, elem.h],
      ].map(([u, v]) => cssPoint(m, u as number, v as number));
      mapped.forEach((p, i) => {
        expect(p.x).toBeCloseTo(corners[i]?.x as number, 6);
        expect(p.y).toBeCloseTo(corners[i]?.y as number, 6);
      });
      const center = toScreen(vp, VIEW, [card.x, card.y, card.z]);
      const c = cssPoint(m, elem.w / 2, elem.h / 2);
      expect(c.x).toBeCloseTo(center.x, 6);
      expect(c.y).toBeCloseTo(center.y, 6);
      // CSS neither draws nor hit-tests an element whose matrix can't be inverted.
      expect(invert(m)).not.toBeNull();
    }
  });

  it("a tapped card leans clockwise on the screen, inside a wider rectangle", () => {
    const vp = viewProj();
    const card = { x: 0, z: 1, y: 0, w: 1, h: 1.2, rot: 0 };
    const [tl, tr] = cardCorners({ ...card, rot: 17 }).map((p) => toScreen(vp, VIEW, p));
    expect((tr?.y as number) > (tl?.y as number)).toBe(true);
    const flat = screenRect(vp, VIEW, card);
    const leaning = screenRect(vp, VIEW, { ...card, rot: 17 });
    expect(leaning.right - leaning.left).toBeGreaterThan(flat.right - flat.left);
  });

  it("the pointer finds the table point under it; above the horizon, none", () => {
    const vp = viewProj();
    const inv = invert(vp) as Mat4;
    for (const [x, z] of [
      [0, 0],
      [-3.2, 2.1],
      [4, -3],
    ] as const) {
      const s = toScreen(vp, VIEW, [x, 0, z]);
      const p = pointerToTable(inv, VIEW, s.x, s.y);
      expect(p?.x).toBeCloseTo(x, 6);
      expect(p?.z).toBeCloseTo(z, 6);
    }
    const flat = invert(multiply(perspective(34, VIEW.w / VIEW.h, 0.5, 60), lookAt([0, 1, 5], [0, 1, 0]))) as Mat4;
    expect(pointerToTable(flat, VIEW, 800, 10)).toBeNull();
  });
});
