/** Hidden information audit, Commander with 3 and 4 players (PLAN-E), seeds 3 and 4; split to run in parallel. */
import { describe, expect, it } from "vitest";
import { auditCommander } from "./hiddenInfoAudit";

describe("hidden information", () => {
  it("Commander with 3 and 4 players (PLAN-E): nothing hidden leaks, public commanders included (seeds 3-4)", () => {
    expect(auditCommander(3, 4).slice(0, 10)).toEqual([]);
  }, 240_000);
});
