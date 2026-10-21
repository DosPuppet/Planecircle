/** 3D board (PLAN-W W7): particles live, fade and die; once they are gone, the board can rest. */
import { Color, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { Particles } from "../../src/board3d/particles";

describe("3D board particles", () => {
  it("a burst lives for its lifetime, then nothing is left to draw", () => {
    const p = new Particles();
    expect(p.step(1 / 60)).toBe(false);
    p.emit({
      at: new Vector3(1, 0.1, 2),
      count: 40,
      colors: [new Color("#ff0000")],
      speed: [1, 2],
      up: 0.5,
      life: [0.3, 0.5],
      size: [0.1, 0.2],
      gravity: 2,
    });
    expect(p.active).toBe(true);
    let t = 0;
    while (p.step(1 / 60) && t < 5) t += 1 / 60;
    expect(t).toBeGreaterThan(0.25);
    expect(t).toBeLessThan(0.6);
    expect(p.active).toBe(false);
    p.dispose();
  });

  it("a ring starts on its radius; particles never sink under the table", () => {
    const p = new Particles();
    p.emit({
      at: new Vector3(0, 0.05, 0),
      count: 12,
      colors: [new Color("#ffffff")],
      speed: [0, 0],
      up: 0,
      life: [1, 1],
      size: [0.1, 0.1],
      gravity: 50,
      ring: 2,
    });
    const pos = p.mesh.geometry.getAttribute("offset");
    for (let i = 0; i < 12; i++) expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeCloseTo(2, 6);
    for (let i = 0; i < 30; i++) p.step(1 / 60);
    for (let i = 0; i < 12; i++) expect(pos.getY(i)).toBeGreaterThan(0);
    p.dispose();
  });

  it("the pool is reused: more than it holds never grows it", () => {
    const p = new Particles();
    const burst = () =>
      p.emit({
        at: new Vector3(),
        count: 1000,
        colors: [new Color("#ffffff")],
        speed: [1, 1],
        up: 0,
        life: [1, 1],
        size: [0.1, 0.1],
        gravity: 0,
      });
    for (let i = 0; i < 5; i++) burst();
    expect(p.mesh.geometry.getAttribute("offset").count).toBe(2400);
    p.dispose();
  });
});
