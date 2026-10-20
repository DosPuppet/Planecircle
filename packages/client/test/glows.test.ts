/** Glows of the cards (PLAN-W W1): the rules the DOM board and the 3D board share. */
import type { ActionOption, GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { type GlowState, handGlow, permanentGlow, playableCards, stackGlow } from "../src/board/glows";

const o = (id: string, over: Partial<ObjectView> = {}) => ({ id, attacking: false, blocking: null, ...over }) as ObjectView;
const view = (pending: unknown = null) => ({ viewer: "p1", pending }) as unknown as GameView;
const state = (over: Partial<GlowState> = {}): GlowState => ({
  view: view(),
  acts: [],
  pick: null,
  casting: null,
  attackers: [],
  blocks: {},
  selectedBlocker: null,
  aiming: null,
  selection: [],
  resolving: null,
  ...over,
});

describe("glows", () => {
  it("a resolution shown lights its targets, and only them", () => {
    const glow = permanentGlow(
      state({ resolving: { item: { targets: ["a"] } }, acts: [{ type: "activate", source: "b" } as ActionOption] }),
    );
    expect(glow(o("a"))).toBe("target");
    expect(glow(o("b"))).toBe(null);
  });

  it("targeting: legal targets lit, picked ones checked", () => {
    const glow = permanentGlow(
      state({ casting: { stage: "target", sourceId: "s", picked: ["a"], spec: { legal: ["a", "b"] } } }),
    );
    expect([glow(o("a")), glow(o("b")), glow(o("c"))]).toEqual(["picked", "target", null]);
  });

  it("declaring attackers: candidates selectable, chosen attacking, the aimed one selected, attackable walkers lit", () => {
    const pending = {
      kind: "declareAttackers",
      player: "p1",
      candidates: ["a", "b", "c"],
      defenders: ["w"],
      allowed: { b: ["w"] },
    };
    const glow = permanentGlow(state({ view: view(pending), attackers: ["a"], aiming: "b" }));
    expect([glow(o("a")), glow(o("b")), glow(o("c")), glow(o("w")), glow(o("x"))]).toEqual([
      "attacking",
      "selected",
      "selectable",
      "target",
      null,
    ]);
  });

  it("declaring blockers: the attackers the selected blocker may block are lit", () => {
    const pending = {
      kind: "declareBlockers",
      player: "p1",
      candidates: [
        { blocker: "b1", attackers: ["x"] },
        { blocker: "b2", attackers: ["x"] },
      ],
    };
    const glow = permanentGlow(state({ view: view(pending), selectedBlocker: "b1", blocks: { b2: "x" } }));
    expect([glow(o("b1")), glow(o("b2")), glow(o("x"))]).toEqual(["selected", "blocking", "target"]);
  });

  it("otherwise: combat state, then activatable", () => {
    const glow = permanentGlow(state({ acts: [{ type: "activate", source: "c" } as ActionOption] }));
    expect([glow(o("a", { attacking: true })), glow(o("b", { blocking: "a" })), glow(o("c")), glow(o("d"))]).toEqual([
      "attacking",
      "blocking",
      "activatable",
      null,
    ]);
  });

  it("hand and stack", () => {
    const playable = playableCards([
      { type: "cast", card: "h1" },
      { type: "playLand", card: "h2" },
      { type: "activate", source: "h3" },
    ] as ActionOption[]);
    expect([...playable]).toEqual(["h1", "h2", "h3"]);
    expect(handGlow("h1", [], null, playable)).toBe("playable");
    expect(handGlow("h4", ["h4"], null, playable)).toBe("selected");
    expect(handGlow("h4", [], { stage: "mana", sourceId: "h4" }, playable)).toBe("selected");
    expect(handGlow("h4", [], null, playable)).toBe(null);
    expect(stackGlow("s1", true, null)).toBe("selected");
    expect(stackGlow("s0", false, null)).toBe(null);
    const targeting = { stage: "target", sourceId: "x", picked: ["s0"], spec: { legal: ["s0", "s1"] } };
    expect([stackGlow("s0", false, targeting), stackGlow("s1", true, targeting), stackGlow("s2", false, targeting)]).toEqual([
      "selected",
      "target",
      null,
    ]);
  });
});
