/** Board textures: the choice is remembered, and the "random" draw always gives a real texture. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOARD_THEMES,
  domEffects,
  loadArena3d,
  loadBoardTheme,
  loadEffects,
  loadQuality3d,
  resolveBoardTheme,
  saveArena3d,
  saveBoardTheme,
  saveEffects,
  saveQuality3d,
} from "../src/boardThemes";

describe("board textures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a chosen texture is shown as is", () => {
    for (const t of BOARD_THEMES) expect(resolveBoardTheme(t.id, 0.5)).toBe(t.id);
  });

  it('"random" picks one of the textures, for any roll in [0, 1)', () => {
    const ids = BOARD_THEMES.map((t) => t.id);
    for (const roll of [0, 0.13, 0.5, 0.999999]) expect(ids).toContain(resolveBoardTheme("random", roll));
    // Every texture can come up.
    const seen = new Set(Array.from({ length: 70 }, (_, i) => resolveBoardTheme("random", i / 70)));
    expect(seen.size).toBe(BOARD_THEMES.length);
  });

  it("the choice is remembered; an unknown value or unavailable storage gives the default texture", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    expect(loadBoardTheme()).toBe("night");
    saveBoardTheme("wood");
    expect(loadBoardTheme()).toBe("wood");
    saveBoardTheme("random");
    expect(loadBoardTheme()).toBe("random");
    store.set("planecircle.board", "unknown");
    expect(loadBoardTheme()).toBe("night");
    // Ids saved before PLAN-I (French) are read as their English id.
    store.set("planecircle.board", "bois"); // i18n-ignore: legacy stored id
    expect(loadBoardTheme()).toBe("wood");
    store.set("planecircle.board", "hasard"); // i18n-ignore: legacy stored id
    expect(loadBoardTheme()).toBe("random");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("unavailable");
      },
    });
    expect(loadBoardTheme()).toBe("night");
  });

  it("graphics (PLAN-V): full by default with a mouse, light on a small touch screen; the choice is remembered", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    let coarse = false;
    vi.stubGlobal("window", { matchMedia: () => ({ matches: coarse }) });
    expect(loadEffects()).toBe("full");
    coarse = true;
    expect(loadEffects()).toBe("light");
    saveEffects("full");
    expect(loadEffects()).toBe("full");
    store.set("planecircle.effects", "unknown");
    expect(loadEffects()).toBe("light");
    // The 3D board (PLAN-W): remembered when chosen, never a default; the DOM board then shows "full".
    saveEffects("3d");
    expect(loadEffects()).toBe("3d");
    expect([domEffects("3d"), domEffects("full"), domEffects("light")]).toEqual(["full", "full", "light"]);
    store.delete("planecircle.effects");
    expect(loadEffects()).toBe("light");
    // The 3D quality: automatic by default, a level chosen by hand remembered.
    expect(loadQuality3d()).toBe("auto");
    saveQuality3d("low");
    expect(loadQuality3d()).toBe("low");
    store.set("planecircle.quality3d", "ultra");
    expect(loadQuality3d()).toBe("auto");
    // The 3D arena (PLAN-X): the tavern by default, the shrine remembered.
    expect(loadArena3d()).toBe("tavern");
    saveArena3d("shrine");
    expect(loadArena3d()).toBe("shrine");
    saveArena3d("neon");
    expect(loadArena3d()).toBe("neon");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("unavailable");
      },
    });
    coarse = false;
    expect(loadEffects()).toBe("full");
  });
});
