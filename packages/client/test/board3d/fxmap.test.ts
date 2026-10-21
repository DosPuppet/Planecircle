/** 3D board (PLAN-W W7): engine events → particles, on the right card or seat, in step with sounds and numbers. */
import type { CardFace, GameEvent, GameView, ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { costColors, fxFor } from "../../src/board3d/fxmap";

const perm = (id: string, over: Partial<ObjectView> = {}) =>
  ({ id, uid: `u-${id}`, colors: [], counters: {}, types: ["Creature"], isToken: false, ...over }) as unknown as ObjectView;
const view = (battlefield: ObjectView[], stack: unknown[] = []) => ({ viewer: "me", battlefield, stack }) as unknown as GameView;
const faces = { bolt: { manaCost: "{R}" }, growth: { manaCost: "{1}{G}{U}" } } as unknown as Record<string, CardFace>;

describe("3D board effects", () => {
  it("damage bursts on the card hit, a step apart; damage to a player is left to the DOM numbers", () => {
    const events: GameEvent[] = [
      { type: "damage", sourceDefId: "bolt", target: "a", targetDefId: "bear", amount: 3, combat: false },
      { type: "damage", sourceDefId: "bolt", target: "b", targetDefId: "bear", amount: 2, combat: true },
      { type: "damage", sourceDefId: "bolt", target: "me", amount: 2, combat: true },
    ];
    const fx = fxFor(events, view([perm("a"), perm("b")]), view([perm("a"), perm("b")]), faces);
    expect(fx).toEqual([
      { kind: "burst", uid: "u-a", amount: 3, delay: 0 },
      { kind: "burst", uid: "u-b", amount: 2, delay: 0.22 },
    ]);
  });

  it("a creature that died is found in the previous view; embers where it was", () => {
    const fx = fxFor([{ type: "dies", objectId: "a", defId: "bear", to: "graveyard" }], view([]), view([perm("a")]), faces);
    expect(fx).toEqual([{ kind: "embers", uid: "u-a", delay: 0 }]);
  });

  it("a spell draws runes in its colors on its caster's side; a token and a land have their own effect", () => {
    const events: GameEvent[] = [
      { type: "cast", player: "me", stackId: "s1", defId: "growth", targets: [] },
      { type: "token", objectId: "t", defId: "goblin", controller: "me" },
      { type: "playLand", player: "me", objectId: "l", defId: "forest" },
      { type: "life", player: "me", delta: 3, life: 23 },
      { type: "life", player: "me", delta: -2, life: 21 },
      { type: "turnStart", turn: 2, player: "me" },
    ];
    const after = view([perm("t", { colors: ["R"], isToken: true }), perm("l", { types: ["Land"] })]);
    const fx = fxFor(events, after, view([]), faces);
    expect(fx.map((f) => f.kind)).toEqual(["rune", "spawn", "dust", "heal", "sweep"]);
    expect(fx[0]).toMatchObject({ rune: "spell", player: "me", colors: ["G", "U"] });
    expect(fx[1]).toMatchObject({ uid: "u-t", colors: ["R"] });
    expect(fx[3]).toMatchObject({ player: "me", amount: 3 });
  });

  it("a permanent entering: a sigil under it; an ability: a small circle under its source", () => {
    const before = view([perm("src", { colors: ["B"] })]);
    const after = view([perm("src", { colors: ["B"] }), perm("bear", { colors: ["G"] })], [{ id: "s9", sourceId: "src" }]);
    const fx = fxFor([{ type: "activate", player: "me", stackId: "s9", defId: "x", targets: [] }], after, before, faces);
    expect(fx).toEqual([
      { kind: "rune", rune: "ability", uid: "u-src", colors: ["B"], delay: 0 },
      { kind: "rune", rune: "summon", uid: "u-bear", colors: ["G"], delay: 0 },
    ]);
  });

  it("blockers clash; counters gained sparkle", () => {
    const events: GameEvent[] = [
      { type: "block", player: "me", blocks: [{ blocker: "b", attacker: "a", blockerDefId: "x", attackerDefId: "y" }] },
    ];
    const before = view([perm("a"), perm("b", { counters: { "+1/+1": 1 } })]);
    const after = view([perm("a"), perm("b", { counters: { "+1/+1": 3 } })]);
    expect(fxFor(events, after, before, faces)).toEqual([
      { kind: "clash", uid: "u-b", delay: 0 },
      { kind: "sparkle", uid: "u-b", amount: 2, delay: 0 },
    ]);
  });

  it("the delays stop growing at 2.2 s; colors of a cost", () => {
    const events: GameEvent[] = Array.from({ length: 20 }, (_, i) => ({
      type: "damage" as const,
      sourceDefId: "bolt",
      target: "a",
      targetDefId: "bear",
      amount: i,
      combat: false,
    }));
    const fx = fxFor(events, view([perm("a")]), null, faces);
    expect(Math.max(...fx.map((f) => f.delay))).toBe(2.2);
    expect([costColors("{2}{W}{W}"), costColors("{3}"), costColors(undefined)]).toEqual([["W"], ["C"], ["C"]]);
  });
});
