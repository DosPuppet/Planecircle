/**
 * Hidden information audit (online play): at each decision of AI vs AI games, nothing that
 * a player receives (view, filtered events, faces) may cite a card that exists only in an
 * opponent's hand or library and that was never made public nor revealed to this player.
 */
import { toCardDef } from "@mtgx/cards";
import {
  type CardDef,
  type ChoiceRequest,
  type ChoiceValue,
  createGame,
  type Decision,
  fallbackDecision,
  filterEvents,
  type GameEvent,
  type GameState,
  projectView,
  RulesError,
  submit,
  visibleFaces,
} from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { idOf, scenario } from "../../engine/test/helpers";
import { aiAgent, forAgent, mulberry32, randomAgent } from "../src";

import { ALL, auditGame, defIdsIn, PUBLIC_ZONES, randomDeck } from "./hiddenInfoAudit";

describe("hidden information", () => {
  it("no player receives a hidden card of an opponent (view, events, faces)", () => {
    const leaks: string[] = [];
    for (let seed = 1; seed <= 20; seed++) leaks.push(...auditGame(seed));
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 120_000);

  // Commander with 3 and 4 players: hidden-info-commander-1/2.test.ts (files of their own, run in parallel).
});

/** Strings of a question (options, proposed names, suggestion, labels), and those of the lands to play. */
function requestStrings(view: ReturnType<typeof projectView>): string[] {
  const p = view.pending;
  const reqs: ChoiceRequest[] = [];
  if (p?.kind === "choice" && p.request) reqs.push(p.request);
  if (p?.kind === "priority") for (const a of p.actions ?? []) if (a.type === "playLand" && a.choose) reqs.push(a.choose);
  return reqs.flatMap((r) => [
    ...r.suggested.map(String),
    ...Object.keys(r.labels ?? {}),
    ...Object.values(r.labels ?? {}),
    ...(r.type === "pick" ? r.options : r.type === "name" ? r.featured : []),
  ]);
}

describe("hidden information: names to choose (card name, land name, creature type)", () => {
  it("the question cites no card that the opponent has only in hand or library", () => {
    const plains = ALL.find((c) => c.name === "Plains") as CardDef;
    const mine = ["Skyseer's Chariot", "Petrified Hamlet", "Cavern of Souls"].map(
      (n) => ALL.find((c) => c.name === n) as CardDef,
    );
    const deck = [...Array(30).fill(plains), ...mine.flatMap((d) => Array(10).fill(d))] as CardDef[];
    let asked = 0;
    const leaks: string[] = [];
    // Creature types of each card name, computed once (not a catalog walk per decision).
    const subtypesOf = new Map(ALL.map((c) => [c.name, c.subtypes]));
    for (let seed = 1; seed <= 6; seed++) {
      let { state } = createGame({
        seed,
        players: [
          { id: "p1", name: "p1", deck },
          { id: "p2", name: "p2", deck: randomDeck(seed * 13) },
        ],
      });
      const agents = { p1: randomAgent(seed * 3), p2: randomAgent(seed * 5) };
      const opponentCards = new Set(
        Object.values(state.objects)
          .filter((o) => o.owner === "p2")
          .map((o) => o.defId),
      );
      const ownNames = new Set(deck.map((d) => d.name));
      const publicNames = new Set<string>();
      for (let i = 0; i < 1500 && state.pending && !state.over; i++) {
        for (const o of Object.values(state.objects))
          if (PUBLIC_ZONES.has(o.zone) && !o.faceDown) publicNames.add(state.defs[o.defId]?.name ?? "");
        const view = projectView(state, "p1");
        const strings = new Set(requestStrings(view));
        const nameAsked = view.pending?.kind === "choice" && view.pending.request?.type === "name";
        if (nameAsked) asked++;
        // Creature types known to p1: those of public cards or its own (only when a name is requested).
        const knownTypes = nameAsked
          ? new Set([...publicNames, ...ownNames].flatMap((n) => subtypesOf.get(n) ?? []))
          : new Set<string>();
        for (const d of opponentCards) {
          const name = state.defs[d]?.name ?? "";
          if (!ownNames.has(name) && !publicNames.has(name) && strings.has(name))
            leaks.push(`graine ${seed}, tour ${state.turn.number} : p1 voit ${name}`);
          if (!nameAsked) continue;
          // Creature types: only those of public cards or your own.
          const types = state.defs[d]?.types.includes("Creature") ? (state.defs[d]?.subtypes ?? []) : [];
          for (const t of types) if (!knownTypes.has(t) && strings.has(t)) leaks.push(`graine ${seed} : p1 voit le type ${t}`);
        }
        const p = state.pending;
        let r: ReturnType<typeof submit>;
        try {
          r = submit(state, p.player, agents[p.player as "p1" | "p2"](state, p.player));
        } catch (e) {
          if (!(e instanceof RulesError)) throw e;
          r = submit(state, p.player, fallbackDecision(state, p));
        }
        state = r.state;
      }
    }
    expect(asked).toBeGreaterThan(0);
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 120_000);
});

/** Test disguise card: cast face down, it must not be revealed to the opponent. */
const DISGUISED = toCardDef(
  {
    name: "Audit Spy",
    number: "1",
    rarity: "common",
    // Costs out of reach: the card is only played face down (and is not turned up).
    manaCost: "{12}{W}",
    cmc: 13,
    typeLine: "Creature — Human Rogue",
    oracleText: "Disguise {12}{W}",
    power: "3",
    toughness: "3",
    colors: ["W"],
    keywords: ["Disguise"],
    image: "",
    artCrop: "",
    legalities: { standard: "legal" },
  },
  { abilities: [] },
  "TST",
);

describe("hidden information: face-down cards (708)", () => {
  it("the opponent doesn't see the card of a face-down permanent until it is revealed", () => {
    const plains = ALL.find((c) => c.name === "Plains") as CardDef;
    let leaks = 0;
    let faceDownSeen = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const deck = [...Array(24).fill(DISGUISED), ...Array(36).fill(plains)] as CardDef[];
      let { state } = createGame({
        seed,
        players: [
          { id: "p1", name: "p1", deck },
          { id: "p2", name: "p2", deck: randomDeck(seed) },
        ],
      });
      const agents = { p1: randomAgent(seed * 3), p2: randomAgent(seed * 5) };
      let revealed = false;
      for (let i = 0; i < 2500 && state.pending && !state.over; i++) {
        const p = state.pending;
        let r: ReturnType<typeof submit>;
        try {
          r = submit(state, p.player, agents[p.player as "p1" | "p2"](state, p.player));
        } catch (e) {
          if (!(e instanceof RulesError)) throw e;
          r = submit(state, p.player, fallbackDecision(state, p));
        }
        state = r.state;
        if (r.events.some((e) => e.type === "turnedFaceUp")) revealed = true;
        if (Object.values(state.objects).some((o) => o.defId === DISGUISED.id && PUBLIC_ZONES.has(o.zone))) revealed = true;
        if (state.battlefield.some((id) => state.objects[id]?.faceDown)) faceDownSeen++;
        // 708.5: p2 taking control of a face-down permanent may look at it; the card is then known to it.
        if (state.battlefield.some((id) => state.objects[id]?.faceDown && state.objects[id]?.controller === "p2"))
          revealed = true;
        if (revealed) break;
        const view = projectView(state, "p2");
        const evs = filterEvents(r.events, "p2");
        // A question that makes you look at the opponent's hand or library (Solve for Disappointment: "choose the
        // card it discards") legitimately reveals those cards: only the face-down permanent is audited here.
        const shown =
          view.pending?.kind === "choice"
            ? { ...view.pending, objects: view.pending.objects?.filter((o) => o.zone !== "hand" && o.zone !== "library") }
            : view.pending;
        const audited = { ...view, pending: shown } as typeof view;
        const seen = defIdsIn([audited, evs, Object.keys(visibleFaces(state, audited, evs)).map((defId) => ({ defId }))]);
        if (seen.has(DISGUISED.id)) leaks++;
      }
    }
    expect(faceDownSeen).toBeGreaterThan(0);
    expect(leaks).toBe(0);
  }, 120_000);
});

/** Plays until `player` is asked a question of `type`, answering the others with `answer`. */
function untilAsked(
  s: GameState,
  player: string,
  type: ChoiceRequest["type"],
  answer: (req: ChoiceRequest, p: string) => ChoiceValue[] | undefined,
): { s: GameState; events: GameEvent[] } {
  let cur = s;
  const events: GameEvent[] = [];
  for (let i = 0; i < 100; i++) {
    const p = cur.pending;
    if (p?.kind === "choice" && p.player === player && p.request.type === type) break;
    const d: Decision =
      p?.kind === "choice" ? { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested } : { type: "pass" };
    const r = submit(cur, p?.player ?? "", d);
    events.push(...r.events);
    cur = r.state;
  }
  return { s: cur, events };
}

describe("hidden information: secret choices (PLAN-M M10b, 701.38c)", () => {
  const start = () =>
    scenario({
      players: 3,
      p1: { battlefield: ["Mountain", "Mountain", "Mountain"], hand: ["Wheel of Misfortune"], library: Array(10).fill("Swamp") },
      p2: { hand: ["Opt"], library: Array(10).fill("Swamp") },
      p3: { library: Array(10).fill("Swamp") },
    });
  const cast = (s: GameState) => submit(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Wheel of Misfortune") }).state;

  it("Wheel of Misfortune: what the next players receive and what their AI knows doesn't depend on the earlier numbers", () => {
    const at = (n: number) =>
      untilAsked(cast(start()), "p2", "number", (req, p) => (req.type === "number" && p === "p1" ? [n] : undefined));
    const low = at(0);
    const high = at(20);
    for (const v of ["p2", "p3"]) {
      // The view and the events: nothing about p1's number (the question is asked to p2 alike).
      expect(projectView(low.s, v)).toEqual(projectView(high.s, v));
      expect(filterEvents(low.events, v)).toEqual(filterEvents(high.events, v));
      expect(filterEvents(high.events, v).some((e) => e.type === "chose")).toBe(false);
    }
    // The state the AI of p2 decides on holds no answer of p1, and its decision is the same.
    const known = (x: GameState) => forAgent(x, "p2", mulberry32(5));
    expect(known(low.s).resolving?.vars).toEqual(known(high.s).resolving?.vars);
    const decide = (x: GameState) => aiAgent("medium", { seed: 3, fair: true, players: 3 })(x, "p2");
    expect(decide(low.s)).toEqual(decide(high.s));
  });

  it("A Killer Among Us: the opponent's view and AI don't hold the secretly chosen type", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Forest", "Forest", "Forest", "Forest"], hand: ["A Killer Among Us"] },
    });
    s = submit(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "A Killer Among Us") }).state;
    const r = untilAsked(s, "p1", "pick", () => undefined);
    let cur = r.s;
    const events = [...r.events];
    for (let i = 0; i < 20 && cur.pending; i++) {
      const p = cur.pending;
      const d: Decision =
        p.kind === "choice"
          ? {
              type: "choose",
              values: p.request.type === "pick" && p.request.options.includes("Goblin") ? ["Goblin"] : p.request.suggested,
            }
          : { type: "pass" };
      const x = submit(cur, p.player, d);
      events.push(...x.events);
      cur = x.state;
      if (cur.stack.length === 0 && cur.triggers.length === 0 && cur.pending?.kind === "priority") break;
    }
    const killer = idOf(cur, "p1", "battlefield", "A Killer Among Us");
    expect(cur.objects[killer]?.chosen?.creatureType).toBe("Goblin");
    expect(projectView(cur, "p2").battlefield.find((o) => o.id === killer)?.chosen).toBeNull();
    expect(filterEvents(events, "p2").some((e) => e.type === "chose")).toBe(false);
    expect(forAgent(cur, "p2", mulberry32(1)).objects[killer]?.chosen?.creatureType).toBeUndefined();
    expect(forAgent(cur, "p1", mulberry32(1)).objects[killer]?.chosen?.creatureType).toBe("Goblin");
  });
});
