/** 3D board (PLAN-W W3): the cards of every battlefield, in world units, from the same placement as the DOM board. */
import type { ObjectView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { PERM_RATIO } from "../../src/board/layout";
import { pileNodes, tableNodes } from "../../src/board3d/model";
import { PX, seatTable } from "../../src/board3d/seats";

const card = (id: string, controller: string, types: ObjectView["types"], over: Partial<ObjectView> = {}) =>
  ({
    id,
    uid: `u${id}`,
    defId: id,
    name: id,
    controller,
    owner: controller,
    types,
    zone: "battlefield",
    tapped: false,
    counters: {},
    keywords: [],
    isToken: false,
    attachedTo: null,
    attacking: false,
    blocking: null,
    ...over,
  }) as unknown as ObjectView;

describe("3D board model", () => {
  it("your cards lie on your side of the table, the opponent's on theirs, each card once", () => {
    const table = seatTable({ w: 1600, h: 900 }, ["me", "them"], { top: 70, center: 64, bottom: 150 });
    const view = {
      battlefield: [card("a", "me", ["Creature"]), card("b", "me", ["Land"], { tapped: true }), card("c", "them", ["Creature"])],
      exile: [],
      exiledWith: {},
    };
    const { nodes, fits } = tableNodes(
      view,
      table,
      () => "",
      () => false,
    );
    const at = (id: string) => nodes.find((n) => n.id === id);
    expect(nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(at("a")?.pose.z).toBeGreaterThan(0);
    expect(at("c")?.pose.z).toBeLessThan(0);
    expect([at("a")?.mine, at("c")?.mine]).toEqual([true, false]);
    expect(at("b")?.pose.rot).toBe(17);
    // World size = table pixels / PX; above the table, never in it.
    const fit = fits.get("me");
    expect(at("a")?.pose.w).toBeCloseTo((fit?.cardW ?? 0) / PX, 9);
    expect(at("a")?.pose.h).toBeCloseTo(((fit?.cardW ?? 0) * PERM_RATIO) / PX, 9);
    expect(nodes.every((n) => n.pose.y > 0)).toBe(true);
  });

  it("an Aura lies under its host: lower on the table, behind it", () => {
    const table = seatTable({ w: 1600, h: 900 }, ["me", "them"], { top: 70, center: 64, bottom: 150 });
    const view = {
      battlefield: [card("host", "me", ["Creature"]), card("aura", "them", ["Enchantment"], { attachedTo: "host" })],
      exile: [],
      exiledWith: {},
    };
    const { nodes } = tableNodes(
      view,
      table,
      () => "",
      () => false,
    );
    const host = nodes.find((n) => n.id === "host");
    const aura = nodes.find((n) => n.id === "aura");
    expect(aura?.player).toBe("me");
    expect(aura?.pose.y).toBeLessThan(host?.pose.y as number);
    expect(aura?.pose.z).toBeLessThan(host?.pose.z as number);
  });
});

describe("3D board piles", () => {
  it("library, graveyard and exile in the seat's column, the library nearest its player, thick as it is full", () => {
    const table = seatTable({ w: 1600, h: 900 }, ["me", "them"], { top: 70, center: 64, bottom: 150 });
    const dead = card("dead", "me", ["Creature"], { zone: "graveyard" });
    const gone = card("gone", "me", ["Creature"], { zone: "exile" });
    const held = card("held", "them", ["Creature"], { zone: "exile" });
    const view = {
      players: {
        me: { libraryCount: 40, graveyard: [card("old", "me", ["Land"]), dead] },
        them: { libraryCount: 10, graveyard: [] },
      },
      exile: [gone, held],
      exiledWith: { x: ["held"] },
    } as unknown as Parameters<typeof pileNodes>[0];
    const piles = pileNodes(view, table);
    const of = (player: string, kind: string) => piles.find((n) => n.player === player && n.kind === kind);
    // Your library at the bottom of your column, then the graveyard and exile towards the middle.
    expect(of("me", "library")?.pose.z).toBeGreaterThan(of("me", "graveyard")?.pose.z as number);
    expect(of("me", "graveyard")?.pose.z).toBeGreaterThan(of("me", "exile")?.pose.z as number);
    // The graveyard shows its last card (a card put there flies by its uid); the library, a thickness.
    expect(of("me", "graveyard")?.uid).toBe("udead");
    expect(of("me", "graveyard")?.count).toBe(2);
    expect(of("me", "library")?.pose.y).toBeGreaterThan(of("them", "library")?.pose.y as number);
    // Empty piles are not drawn; a card held under its exiler is not on the exile pile.
    expect(of("them", "graveyard")).toBeUndefined();
    expect(of("them", "exile")).toBeUndefined();
    expect(of("them", "library")?.pose.z).toBeLessThan(0);
    expect(of("me", "exile")?.uid).toBe("ugone");
  });
});
