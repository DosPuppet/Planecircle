/** 3D board (PLAN-W W6): quality presets, and the governor stepping down on slow frames only. */
import { describe, expect, it } from "vitest";
import { Governor, lower, PRESETS, type Quality, SLOW_MS, WINDOW } from "../../src/board3d/quality";

describe("3D board quality", () => {
  it("presets get lighter from high to low", () => {
    expect([lower("high"), lower("medium"), lower("low")]).toEqual(["medium", "low", null]);
    expect(PRESETS.high.dpr).toBeGreaterThan(PRESETS.low.dpr);
    expect(PRESETS.high.shadows).toBeGreaterThan(PRESETS.medium.shadows);
    expect([PRESETS.low.shadows, PRESETS.low.bloom]).toEqual([0, false]);
  });

  it("steps down after a window of slow frames, never up; frames after a pause do not count", () => {
    const changes: Quality[] = [];
    const g = new Governor("high", (q) => changes.push(q));
    for (let i = 0; i < WINDOW * 3; i++) g.frame(16.7, true);
    expect(changes).toEqual([]);
    // Long gaps after a pause (the board idle) are not slow frames.
    for (let i = 0; i < WINDOW * 3; i++) g.frame(800, false);
    expect(changes).toEqual([]);
    for (let i = 0; i < WINDOW; i++) g.frame(SLOW_MS + 10, true);
    expect(changes).toEqual(["medium"]);
    for (let i = 0; i < WINDOW; i++) g.frame(40, true);
    for (let i = 0; i < WINDOW; i++) g.frame(40, true);
    expect(changes).toEqual(["medium", "low"]);
    expect(g.level).toBe("low");
  });

  it("a few slow frames among fast ones (a texture uploaded) do not step down", () => {
    const changes: Quality[] = [];
    const g = new Governor("high", (q) => changes.push(q));
    for (let i = 0; i < WINDOW; i++) g.frame(i % 5 === 0 ? 60 : 16, true);
    expect(changes).toEqual([]);
  });
});
