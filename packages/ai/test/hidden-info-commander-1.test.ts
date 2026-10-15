/** Hidden information audit, Commander with 3 and 4 players (PLAN-E), seeds 1 and 2; split to run in parallel. */
import { describe, expect, it } from "vitest";
import { auditCommander } from "./hiddenInfoAudit";

describe("hidden information", () => {
  it("Commander with 3 and 4 players (PLAN-E): nothing hidden leaks, public commanders included (seeds 1-2)", () => {
    expect(auditCommander(1, 2).slice(0, 10)).toEqual([]);
  }, 240_000);
});
