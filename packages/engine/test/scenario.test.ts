import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { submit } from "../src/game";
import { createScenario } from "../src/scenario";
import { isSummoningSick } from "../src/state";
import type { GameState } from "../src/types";

const names = (s: GameState, ids: string[]) => ids.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);

describe("createScenario", () => {
  it("keeps the library order, no mulligan, and starts at the given turn", () => {
    const { state: s, events } = createScenario({
      seed: 1,
      active: "p1",
      players: [
        {
          id: "p1",
          name: "You",
          library: [card("Plains"), card("Forest"), card("Mountain")],
          hand: [card("Savannah Lions")],
          battlefield: [{ def: card("Llanowar Elves") }, { def: card("Forest"), tapped: true }],
        },
        { id: "p2", name: "AI", life: 7, library: [card("Island")], hand: [] },
      ],
    });
    expect(s.setup.mulliganQueue).toEqual([]);
    expect(s.turn.number).toBe(1);
    expect(s.pending).toMatchObject({ kind: "priority", player: "p1" });
    expect(s.turn.step).toBe("upkeep");
    expect(names(s, s.players.p1?.library ?? [])).toEqual(["Plains", "Forest", "Mountain"]);
    expect(names(s, s.players.p1?.hand ?? [])).toEqual(["Savannah Lions"]);
    expect(s.players.p2?.life).toBe(7);
    const elves = s.battlefield.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Llanowar Elves") ?? "";
    expect(isSummoningSick(s, elves)).toBe(false);
    // Untap: the active player's tapped land untapped.
    expect(s.battlefield.every((id) => !s.objects[id]?.tapped)).toBe(true);
    expect(events.some((e) => e.type === "turnStart")).toBe(true);
  });

  it("draws at the start of a turn after the first; summoning sickness if requested", () => {
    const { state } = createScenario({
      seed: 1,
      active: "p1",
      turn: 3,
      players: [
        {
          id: "p1",
          name: "You",
          library: [card("Plains"), card("Forest")],
          hand: [],
          battlefield: [{ def: card("Savannah Lions"), sick: true }, { def: card("Llanowar Elves") }],
        },
        { id: "p2", name: "AI", library: [card("Island")], hand: [] },
      ],
    });
    let s = state;
    for (let i = 0; i < 5 && s.turn.step !== "main1"; i++) s = submit(s, s.pending?.player ?? "p1", { type: "pass" }).state;
    expect(s.turn.step).toBe("main1");
    expect(names(s, s.players.p1?.hand ?? [])).toEqual(["Plains"]);
    const [lions, elves] = ["Savannah Lions", "Llanowar Elves"].map(
      (n) => s.battlefield.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === n) ?? "",
    );
    expect(isSummoningSick(s, lions ?? "")).toBe(true);
    expect(isSummoningSick(s, elves ?? "")).toBe(false);
  });

  it("can start with the mulligan using the planned hand", () => {
    const hand = ["Plains", "Plains", "Forest", "Savannah Lions", "Llanowar Elves", "Giant Growth", "Forest"].map((n) => card(n));
    const { state: s } = createScenario({
      seed: 1,
      active: "p1",
      mulligan: true,
      players: [
        { id: "p1", name: "You", library: [card("Plains")], hand },
        { id: "p2", name: "AI", library: [card("Island")], hand: [card("Island")] },
      ],
    });
    expect(s.pending).toMatchObject({ kind: "mulligan", player: "p1" });
    const kept = submit(submit(s, "p1", { type: "keep" }).state, "p2", { type: "keep" }).state;
    expect(kept.turn.number).toBe(1);
    expect(kept.turn.active).toBe("p1");
    expect(kept.players.p1?.hand.length).toBe(7);
  });
});
