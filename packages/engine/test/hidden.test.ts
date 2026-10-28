/**
 * Face-down exile (406.3; PLAN-C in docs/history.md, lot C6): a card exiled face down is only shown to players who
 * may look at it, in the view as in the events. Cards seen in another player's hand (Deep-Cavern Bat, Duress): the
 * whole hand is shown with the choice, and the viewer keeps seeing these cards while they stay in that hand.
 */

import { describe, expect, it } from "vitest";
import { drawCards } from "../src/actions";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import { HIDDEN_CARD_ID, moveObject } from "../src/state";
import type { GameEvent, GameState } from "../src/types";
import { filterEvents, projectView } from "../src/view";
import { cast, castTargets, exiled, idOf, idsOf, lands, namesIn, pickNamed, scenario, settle, settleLogged } from "./helpers";

const exileView = (s: GameState, viewer: string, id: string) => projectView(s, viewer).exile.find((o) => o.id === id);

describe("face-down exile", () => {
  it("foretell: only the owner sees the foretold card (view and event)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Sozin's Comet"] } });
    const comet = idOf(s, "p1", "hand", "Sozin's Comet");
    const foretell = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === comet && a.label === "Foretell");
    const step = submit(s, "p1", {
      type: "activate",
      source: comet,
      ability: foretell?.type === "activate" ? foretell.ability : -1,
    });
    const events: GameEvent[] = step.events;
    s = settle(step.state);
    const id = exiled(s, "Sozin's Comet")[0] as string;
    expect(exileView(s, "p1", id)?.name).toBe("Sozin's Comet");
    expect(exileView(s, "p2", id)?.defId).toBe(HIDDEN_CARD_ID);
    expect(exileView(s, "p2", id)?.name).toBe("");
    const theirs = filterEvents(events, "p2").find((e) => e.type === "foretold");
    expect(theirs).toEqual({ type: "foretold", player: "p1", defId: HIDDEN_CARD_ID });
  });

  it("Doomsday Excruciator: libraries exiled face down are seen by nobody", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 10), hand: ["Doomsday Excruciator"], library: lands("Swamp", 10) },
      p2: { library: [...Array(8).fill("Opt"), ...lands("Island", 6)] },
    });
    s = settle(cast(s, "p1", "Doomsday Excruciator"));
    expect(s.players.p2?.library).toHaveLength(6);
    const theirs = s.exile.filter((id) => s.objects[id]?.owner === "p2");
    expect(theirs).toHaveLength(8);
    for (const viewer of ["p1", "p2"]) {
      expect(theirs.every((id) => exileView(s, viewer, id)?.defId === HIDDEN_CARD_ID)).toBe(true);
    }
  });
});

/** The names of the cards of `owner`'s hand that `viewer` knows (their view). */
const knownHand = (s: GameState, viewer: string, owner: string) =>
  projectView(s, viewer).players[owner]?.knownHand?.map((o) => o.name);

describe("cards seen in another player's hand", () => {
  it("Deep-Cavern Bat: the whole hand is shown, its lands can't be chosen; the cards left there stay known", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Deep-Cavern Bat"] },
      p2: { hand: ["Shivan Dragon", "Forest", "Opt"], library: ["Island", "Island"] },
    });
    s = cast(s, "p1", "Deep-Cavern Bat");
    let options: (string | undefined)[] = [];
    let unchoosable: (string | undefined)[] = [];
    let shown: (string | undefined)[] = [];
    s = settle(s, (req, p, cur) => {
      if (req.type !== "pick" || req.intent !== "pickCards" || p !== "p1") return undefined;
      options = namesIn(cur, req.options);
      unchoosable = namesIn(cur, req.unchoosable);
      shown = (projectView(cur, "p1").pending as { objects?: { name: string }[] }).objects?.map((o) => o.name) ?? [];
      return pickNamed(cur, req, "Shivan Dragon");
    });
    expect(options.sort()).toEqual(["Opt", "Shivan Dragon"]);
    expect(unchoosable).toEqual(["Forest"]);
    // The window shows the whole hand: the cards to choose from and the land.
    expect(shown.sort()).toEqual(["Forest", "Opt", "Shivan Dragon"]);
    expect(exiled(s, "Shivan Dragon")).toHaveLength(1);
    expect(knownHand(s, "p1", "p2")).toEqual(["Forest", "Opt"]);
    // Their own hand: nothing to recall.
    expect(knownHand(s, "p2", "p2")).toBeUndefined();
    // A card drawn since is unknown; a card that leaves the hand and comes back is another object, unknown too.
    drawCards(s, "p2", 1);
    const opt = idOf(s, "p2", "hand", "Opt");
    const back = moveObject(s, moveObject(s, opt, "graveyard") as string, "hand");
    expect(back).toBeTruthy();
    expect(knownHand(s, "p1", "p2")).toEqual(["Forest"]);
    expect(projectView(s, "p1").players.p2?.handCount).toBe(3);
  });

  it("Duress with nothing to choose: you see the hand anyway (in the log and later), the opponent's view unchanged", () => {
    const s0 = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Duress"] },
      p2: { hand: ["Shivan Dragon", "Forest"] },
    });
    const { s, events, asked } = settleLogged(castTargets(s0, "p1", "Duress", { t: ["p2"] }));
    expect(asked.filter((a) => a.player === "p1")).toHaveLength(0);
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(knownHand(s, "p1", "p2")?.sort()).toEqual(["Forest", "Shivan Dragon"]);
    const look = (viewer: string) => filterEvents(events, viewer).filter((e) => e.type === "reveal");
    expect(look("p1")).toEqual([{ type: "reveal", player: "p1", defIds: expect.any(Array), look: true }]);
    expect(look("p2")).toEqual([]);
  });

  it("Duress: the cards that can't be discarded are shown with the choice, once", () => {
    const s0 = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Duress"] },
      p2: { hand: ["Shivan Dragon", "Opt", "Forest"] },
    });
    const { s, events, asked } = settleLogged(castTargets(s0, "p1", "Duress", { t: ["p2"] }), (req, _p, cur) =>
      pickNamed(cur, req, "Opt"),
    );
    const req = asked.find((a) => a.player === "p1")?.state.pending;
    const pick = req?.kind === "choice" && req.request.type === "pick" ? req.request : undefined;
    expect(namesIn(s0, pick?.options)).toEqual(["Opt"]);
    expect(namesIn(s0, pick?.unchoosable).sort()).toEqual(["Forest", "Shivan Dragon"]);
    expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    expect(knownHand(s, "p1", "p2")?.sort()).toEqual(["Forest", "Shivan Dragon"]);
    // A single "you look at" for the whole resolution (the op runs again once answered).
    expect(filterEvents(events, "p1").filter((e) => e.type === "reveal")).toHaveLength(1);
  });

  it("Gitaxian Probe: only the player who looks knows the cards (three players)", () => {
    const s0 = scenario({
      players: 3,
      p1: { battlefield: ["Island"], hand: ["Gitaxian Probe"] },
      p2: { hand: ["Shivan Dragon", "Forest"] },
    });
    const s = settle(castTargets(s0, "p1", "Gitaxian Probe", { p: ["p2"] }));
    expect(knownHand(s, "p1", "p2")?.sort()).toEqual(["Forest", "Shivan Dragon"]);
    expect(knownHand(s, "p3", "p2")).toBeUndefined();
  });
});
