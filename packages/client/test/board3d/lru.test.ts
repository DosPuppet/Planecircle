/** 3D board (PLAN-W W3): the texture cache keeps its byte budget, never evicting the cards on the table. */
import { describe, expect, it } from "vitest";
import { Lru } from "../../src/board3d/lru";

describe("texture cache", () => {
  it("evicts the least recently used entries over the budget, and frees them", () => {
    const dropped: string[] = [];
    const lru = new Lru<string>(300, (v) => dropped.push(v));
    lru.set("a", "A", 100);
    lru.set("b", "B", 100);
    lru.set("c", "C", 100);
    expect(lru.get("a")).toBe("A"); // a is now the most recent
    lru.set("d", "D", 100);
    expect(dropped).toEqual(["B"]);
    expect([lru.has("a"), lru.has("b"), lru.size, lru.bytes]).toEqual([true, false, 3, 300]);
  });

  it("pinned entries (on the table) stay, even over the budget", () => {
    const dropped: string[] = [];
    const lru = new Lru<string>(150, (v) => dropped.push(v));
    lru.set("a", "A", 100);
    lru.set("b", "B", 100, new Set(["a", "b"]));
    expect(dropped).toEqual([]);
    expect(lru.bytes).toBe(200);
    lru.trim(new Set(["b"]));
    expect(dropped).toEqual(["A"]);
  });

  it("replacing a value frees the old one; clear frees everything", () => {
    const dropped: string[] = [];
    const lru = new Lru<string>(1000, (v) => dropped.push(v));
    lru.set("a", "A1", 10);
    lru.set("a", "A2", 20);
    expect([dropped, lru.bytes]).toEqual([["A1"], 20]);
    lru.set("b", "B", 5);
    lru.clear();
    expect(dropped).toEqual(["A1", "A2", "B"]);
    expect([lru.size, lru.bytes]).toEqual([0, 0]);
  });
});
