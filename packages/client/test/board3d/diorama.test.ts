/** 3D board (PLAN-X): the diorama's season follows the date (in Japan). */
import { describe, expect, it } from "vitest";
import { seasonOf } from "../../src/board3d/diorama";

describe("diorama season", () => {
  it("spring from March, summer from June, autumn from September, winter from December", () => {
    const at = (month: number) => seasonOf(new Date(2026, month, 15));
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(at)).toEqual([
      "winter",
      "winter",
      "spring",
      "spring",
      "spring",
      "summer",
      "summer",
      "summer",
      "autumn",
      "autumn",
      "autumn",
      "winter",
    ]);
  });
});
