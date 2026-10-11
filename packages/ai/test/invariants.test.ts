/**
 * `checkInvariants` (fuzz and smoke): each check detects the inconsistency it targets.
 */
import { chars, type GameState } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { idOf, scenario } from "../../engine/test/helpers";
import { heuristicChoice } from "../src/choices";
import { checkInvariants } from "../src/selfplay";

/** Number of cards of each player, so only the introduced defect is reported. */
const sizes = (s: GameState) =>
  Object.fromEntries(s.playerOrder.map((p) => [p, Object.values(s.objects).filter((o) => o.owner === p && !o.isToken).length]));

describe("checkInvariants", () => {
  const base = () => scenario({ p1: { battlefield: ["Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });

  it("a consistent state reports nothing", () => {
    const s = base();
    expect(checkInvariants(s, sizes(s))).toEqual([]);
  });

  it("a value not serializable to JSON is reported with its path", () => {
    const s = base();
    const n = sizes(s);
    (s.players.p1 as unknown as Record<string, unknown>).x = [1, new Map()];
    expect(checkInvariants(s, n)).toEqual(["state not serializable to JSON: state.players.p1.x[1]: instance of Map"]);
    (s.players.p1 as unknown as Record<string, unknown>).x = undefined;
    s.players.p1!.life = Number.NaN;
    expect(checkInvariants(s, n).join("\n")).toContain("state.players.p1.life = NaN");
  });

  it("an autoOk question with a single possible answer is reported (PLAN-M)", () => {
    const s = base();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const request = {
      type: "pick" as const,
      intent: "reveal" as const,
      prompt: "Reveal",
      options: [bear],
      min: 1,
      max: 1,
      suggested: [bear],
      autoOk: true,
    };
    s.pending = { kind: "choice", player: "p1", request, purpose: { kind: "effect" } };
    expect(checkInvariants(s, sizes(s))).toEqual(["autoOk question with a single answer: Reveal"]);
    s.pending = { kind: "choice", player: "p1", request: { ...request, min: 0 }, purpose: { kind: "effect" } };
    expect(checkInvariants(s, sizes(s))).toEqual([]);
    // The AI answers a payment detail with the suggestion (PLAN-M M11).
    expect(heuristicChoice(s, "p1", { ...request, min: 0, suggested: [] })).toEqual([]);
  });

  it("an action outside the stack still waiting at priority is reported (PLAN-M M11c)", () => {
    const s = base();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s.offStack = [{ controller: "p1", sourceId: bear, sourceDefId: s.objects[bear]?.defId ?? "", effects: [], bound: {} }];
    expect(checkInvariants(s, sizes(s))).toEqual(["action outside the stack still waiting at priority (1)"]);
  });

  it("a stale characteristics cache (forgotten bump) is reported, field by field", () => {
    const s = base();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    chars(s, bear);
    s.objects[bear]!.counters["+1/+1"] = 2;
    expect(checkInvariants(s, sizes(s))).toEqual([expect.stringMatching(/stale characteristics cache \(power, toughness\)/)]);
  });

  it("a stale control (no effect justifies the current controller) is reported", () => {
    const s = base();
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s.objects[bear]!.baseController = "p2";
    s.objects[bear]!.controller = "p1";
    expect(checkInvariants(s, sizes(s)).join("\n")).toContain("stale control, p1 instead of p2");
  });
});
