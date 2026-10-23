/** 3D board (PLAN-W W5): the arena's props stand around the table, never on a battlefield, at real size. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ArenaManifest, clearOfRim, outward, propPose, tavernScale } from "../../src/board3d/arena";
import { frameSeats, roomOn } from "../../src/board3d/camera";
import { tableBounds } from "../../src/board3d/seats";

type SourceArena = ArenaManifest & {
  models: { id: string; md5: string }[];
  materials: { slot: string; maps: string[]; md5: string }[];
  hdri?: { md5: string };
};
const arenas = (
  JSON.parse(readFileSync(new URL("../../../../tools/arena-assets.json", import.meta.url), "utf8")) as {
    arenas: Record<string, SourceArena>;
  }
).arenas;
const source = arenas.tavern as SourceArena;
const shrine = arenas.shrine as SourceArena;

describe("arena of the 3D board", () => {
  it("the source manifest: CC0 assets pinned, every prop on a listed model", () => {
    // PLAN-X: several arenas, the tavern with props, the shrine a diorama built in code.
    expect(Object.keys(arenas).sort()).toEqual(["neon", "shrine", "tavern"]);
    expect(arenas.neon?.diorama).toBe("neon");
    for (const [id, a] of Object.entries(arenas)) {
      const ids = new Set(a.models.map((m) => m.id));
      for (const m of [...a.models, ...a.materials, ...(a.hdri ? [a.hdri] : [])])
        expect(m.md5, `${id}: ${JSON.stringify(m)}`).toMatch(/^[a-f0-9]{32}$/);
      for (const p of a.props ?? []) expect(ids.has(p.model), p.model).toBe(true);
    }
    expect(source.materials.map((m) => m.slot).sort()).toEqual(["mat", "rim", "tabletop"]);
    expect(shrine.diorama).toBe("shrine");
    expect(shrine.props ?? []).toEqual([]);
    // One scale for every prop (their proportions stay those of life).
    expect(source.metersToWorld).toBeGreaterThan(5);
  });

  for (const [w, h] of [
    [1280, 720],
    [1600, 900],
    [2560, 1080],
  ] as const)
    it(`${w}×${h}: every prop stands off the battlefields`, () => {
      const { table } = frameSeats({ w, h }, ["p1", "p2"], { top: 70, center: 64, bottom: 150 });
      const b = tableBounds(table);
      for (const p of source.props ?? []) {
        const pose = propPose(p, b);
        // Its center at least 0.4 off the rim (the scene checks the real footprint, its box, and leaves out a prop
        // that would reach a battlefield).
        const half = 0.4;
        expect(clearOfRim({ x0: pose.x - half, x1: pose.x + half, z0: pose.z - half, z1: pose.z + half }, b), p.model).toBe(true);
      }
    });

  it("anchors on the rim, offsets in world units, turns in degrees", () => {
    const b = { x0: -8, x1: 8, z0: -5, z1: 5 };
    expect(propPose({ model: "m", anchor: "far-left", at: [-1, -2], turn: 90 }, b)).toEqual({
      x: -9,
      z: -7,
      turn: Math.PI / 2,
    });
    expect(propPose({ model: "m", anchor: "right", at: [1, 0], turn: 0 }, b)).toMatchObject({ x: 9, z: 0 });
    // Pushed away from the table: left and back from the far-left corner, right from the right side.
    const [lx, lz] = outward("far-left");
    expect(lx < 0 && lz < 0).toBe(true);
    expect(outward("right")).toEqual([1, 0]);
    expect(clearOfRim({ x0: -10, x1: -8.5, z0: 0, z1: 1 }, b)).toBe(true);
    expect(clearOfRim({ x0: -10, x1: -7.5, z0: 0, z1: 1 }, b)).toBe(false);
  });

  it("shrinks the tavern with a phone's table, never grows it on a large screen", () => {
    const rim = (w: number, h: number) =>
      tableBounds(frameSeats({ w, h }, ["p1", "p2"], { top: 70, center: 30, bottom: 90 }, roomOn({ w, h })).table);
    expect(tavernScale(rim(1600, 900))).toBe(1);
    expect(tavernScale(rim(2560, 1440))).toBe(1);
    const phone = tavernScale(rim(844, 390));
    expect(phone).toBeGreaterThan(0.4);
    expect(phone).toBeLessThan(0.6);
  });

  it("keeps a little more room around the table on a phone in landscape", () => {
    const shrine = { side: 0.06, top: 0.05 };
    expect(roomOn({ w: 1600, h: 900 }, shrine)).toBe(shrine);
    expect(roomOn({ w: 1600, h: 900 })).toBeUndefined();
    const phone = roomOn({ w: 844, h: 390 }, shrine);
    expect(phone?.side).toBeGreaterThan(shrine.side);
    expect(phone?.top).toBeGreaterThan(shrine.top);
    expect(roomOn({ w: 844, h: 390 })?.side).toBeGreaterThan(0);
  });
});
