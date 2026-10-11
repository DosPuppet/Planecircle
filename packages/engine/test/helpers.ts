/**
 * Test tools: build a precise game position and play decisions.
 */
import { card } from "@mtgx/cards";
import { addControlEffect } from "../src/control";
import { createGame, submit } from "../src/game";
import { legalActions } from "../src/legal";
import { isNameAllowed } from "../src/names";
import { cloneState, createObject, registerDef, syncControl } from "../src/state";
import { advance, emptyCombat, forcedAttacks } from "../src/turn";
import { zoneEntry } from "../src/turnlog";
import type {
  CardDef,
  CastNowRequest,
  ChoiceRequest,
  ChoiceValue,
  Decision,
  GameEvent,
  GameState,
  PlayerId,
  Step,
} from "../src/types";

export interface Permanent {
  name: string | CardDef;
  tapped?: boolean;
  /** Arrived this turn (summoning sick). */
  sick?: boolean;
  damage?: number;
  /** Counters already placed (a 0/0 creature that must survive). */
  counters?: Record<string, number>;
}

export interface Side {
  life?: number;
  battlefield?: (string | CardDef | Permanent)[];
  hand?: (string | CardDef)[];
  library?: (string | CardDef)[];
  graveyard?: (string | CardDef)[];
  /** Commander (PLAN-E): commanders in the command zone (the game becomes a Commander game). */
  command?: (string | CardDef)[];
}

const def = (c: string | CardDef): CardDef => (typeof c === "string" ? card(c) : c);

const NAMES = ["Alice", "Bob", "Chloe", "David", "Emma", "Farid"];

export interface ScenarioOptions {
  p1?: Side;
  p2?: Side;
  p3?: Side;
  p4?: Side;
  /** Number of players (2 by default): p1, p2, p3... */
  players?: number;
  active?: PlayerId;
  step?: Step;
  turn?: number;
}

export function scenario(opts: ScenarioOptions): GameState {
  const ids = Array.from({ length: opts.players ?? 2 }, (_, i) => `p${i + 1}`);
  const { state } = createGame({
    seed: 42,
    startingPlayer: "p1",
    players: ids.map((id, i) => ({ id, name: NAMES[i] ?? id, deck: [] })),
  });
  const s = cloneState(state);
  {
    const turn = opts.turn ?? 3;
    s.setup.mulliganQueue = [];
    s.pending = null;
    s.turn = {
      number: turn,
      active: opts.active ?? "p1",
      step: opts.step ?? "main1",
      landsPlayed: 0,
      onceFired: [],
      startingPlayer: "p1",
    };
    // Rank of the starting main phase (505.1a): the second main phase of a turn with no added combat.
    if (s.turn.step === "main1" || s.turn.step === "main2") s.turn.mainPhase = s.turn.step === "main1" ? 1 : 2;
    for (const p of ids) {
      const side = (opts as Record<string, Side | undefined>)[p] ?? {};
      const player = s.players[p];
      if (!player) continue;
      player.life = side.life ?? 20;
      // Everyone has already taken a turn: the creatures present are not summoning sick.
      player.lastTurnStarted = p === s.turn.active ? turn : Math.max(1, turn - 1);
      // Turns already begun by this player (Jace Reawakened): every other turn in a two-player game.
      player.turnsTaken = Math.ceil(turn / 2);
      player.drewFromEmptyLibrary = false;
      const add = (c: string | CardDef, zone: "hand" | "library" | "graveyard") => {
        const d = def(c);
        registerDef(s, d);
        createObject(s, d.id, p, zone);
      };
      for (const c of side.hand ?? []) add(c, "hand");
      for (const c of side.library ?? Array(10).fill("Forest")) add(c, "library");
      for (const c of side.graveyard ?? []) add(c, "graveyard");
      for (const c of side.command ?? []) {
        const d = def(c);
        registerDef(s, d);
        const o = createObject(s, d.id, p, "command");
        s.commander ??= { cards: {} };
        s.commander.cards[o.uid] = { owner: p, defId: d.id, casts: 0, damage: {} };
      }
      for (const entry of side.battlefield ?? []) {
        const perm: Permanent =
          typeof entry === "object" && "name" in entry && !("types" in entry) ? entry : { name: entry as string | CardDef };
        const d = def(perm.name);
        registerDef(s, d);
        const o = createObject(s, d.id, p, "battlefield");
        o.controlledSince = perm.sick ? turn : 0;
        // Arrived this turn: its arrival is in the turn log ("entered this turn").
        if (perm.sick)
          s.turnLog.push(zoneEntry(null, "battlefield", p, p, { types: d.types, subtypes: d.subtypes, token: false }, o.id));
        o.tapped = !!perm.tapped;
        o.damage = perm.damage ?? 0;
        if (d.loyalty) o.counters.loyalty = d.loyalty;
        if (perm.counters) Object.assign(o.counters, perm.counters);
      }
    }
    if (s.turn.step === "declareAttackers" || s.turn.step === "declareBlockers") s.combat = emptyCombat();
    s.flow = "priority";
    s.priority = { holder: s.turn.active, passes: 0 };
    advance(s);
  }
  return s;
}

export function act(s: GameState, player: PlayerId, d: Decision): GameState {
  return submit(s, player, d).state;
}

/** The player who must decide passes, until `until` is true (or 200 passes). */
export function passUntil(s: GameState, until: (s: GameState) => boolean): GameState {
  let cur = s;
  for (let i = 0; i < 200 && !until(cur) && cur.pending?.kind === "priority"; i++) {
    cur = act(cur, cur.pending.player, { type: "pass" });
  }
  return cur;
}

/** Like passUntil, but also accepts the suggested answer to choices (damage assignment...). */
export function passAccepting(s: GameState, until: (s: GameState) => boolean): GameState {
  let cur = s;
  for (let i = 0; i < 300 && !until(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}

/** "Cast now" priority pending during a resolution (608.2g), or `undefined`. */
export function castNowOf(s: GameState): CastNowRequest | undefined {
  return s.pending?.kind === "priority" ? s.pending.castNow : undefined;
}

/** Passes (and follows suggested choices) up to a "cast now" priority. */
export function untilCastNow(s: GameState): GameState {
  return passAccepting(s, (x) => !!castNowOf(x));
}

/** Both players pass once: resolves the top of the stack (or ends the step). */
export function passBoth(s: GameState): GameState {
  let cur = s;
  for (let i = 0; i < 2 && cur.pending?.kind === "priority"; i++) cur = act(cur, cur.pending.player, { type: "pass" });
  return cur;
}

export function idsOf(s: GameState, player: PlayerId, zone: "hand" | "battlefield" | "graveyard", name: string): string[] {
  const list = zone === "battlefield" ? s.battlefield : (s.players[player]?.[zone] ?? []);
  return list.filter((id) => {
    const o = s.objects[id];
    return o && o.controller === player && s.defs[o.defId]?.name === name;
  });
}

export function idOf(s: GameState, player: PlayerId, zone: "hand" | "battlefield" | "graveyard", name: string): string {
  const id = idsOf(s, player, zone, name)[0];
  if (!id) throw new Error(`${name} introuvable (${player}, ${zone})`);
  return id;
}

/** A player takes control of a permanent (permanent control effect, layer 2), on the given state. */
export function steal(s: GameState, id: string, to: PlayerId): GameState {
  addControlEffect(s, [id], to, "permanent");
  syncControl(s);
  return s;
}

export function customCard(partial: Partial<CardDef> & { name: string }): CardDef {
  return {
    id: `test-${partial.name.toLowerCase().replace(/\W+/g, "-")}`,
    typeLine: "Creature",
    manaCost: { generic: 0, colored: {}, x: 0 },
    manaCostText: "{0}",
    colors: [],
    supertypes: [],
    types: ["Creature"],
    subtypes: [],
    keywords: [],
    abilities: [],
    text: "",
    implemented: true,
    ...partial,
  };
}

/**
 * Advances the game until the condition: passes priority, neither attacks (except forced attacks, 508.1d) nor blocks,
 * discards the excess and accepts suggested choices.
 */
export function advanceUntil(s: GameState, until: (s: GameState) => boolean, max = 600): GameState {
  let cur = s;
  for (let i = 0; i < max && !until(cur); i++) {
    const p = cur.pending;
    if (!p) break;
    if (p.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p.kind === "declareAttackers")
      cur = act(cur, p.player, { type: "declareAttackers", attackers: forcedAttacks(cur, p.player) });
    else if (p.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p.kind === "discard") {
      const hand = cur.players[p.player]?.hand ?? [];
      cur = act(cur, p.player, { type: "discard", cards: hand.slice(0, p.count) });
    } else if (p.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}

/**
 * Like `advanceUntil` (neither attacking nor blocking), collecting the steps begun (`step` events, one entry per
 * step, added steps included; a new turn's untap step emits none).
 */
export function stepTrail(s: GameState, until: (s: GameState) => boolean, max = 600): { s: GameState; steps: Step[] } {
  let cur = s;
  const steps: Step[] = [];
  for (let i = 0; i < max && !until(cur); i++) {
    const p = cur.pending;
    let d: Decision;
    if (p?.kind === "priority") d = { type: "pass" };
    else if (p?.kind === "declareAttackers") d = { type: "declareAttackers", attackers: [] };
    else if (p?.kind === "declareBlockers") d = { type: "declareBlockers", blocks: [] };
    else if (p?.kind === "choice") d = { type: "choose", values: p.request.suggested };
    else break;
    const r = submit(cur, p.player, d);
    for (const e of r.events) if (e.type === "step") steps.push(e.step);
    cur = r.state;
  }
  return { s: cur, steps };
}

// ---------------------------------------------------------------------------
// Helpers for the set test files (PLAN-C in docs/history.md, lot C2): written once, imported by each.
// ---------------------------------------------------------------------------

/** Answer to a choice during `settle`: `undefined` takes the suggested answer. */
export type Answer = (req: ChoiceRequest, player: PlayerId, s: GameState) => ChoiceValue[] | undefined;

export const lands = (name: string, n: number) => Array(n).fill(name) as string[];
export const nameOf = (s: GameState, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
export const namesIn = (s: GameState, ids: string[] | undefined) => (ids ?? []).map((id) => nameOf(s, id));
export const exiled = (s: GameState, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

function settleWith(s: GameState, answer: Answer, noBlocks: boolean): GameState {
  let cur = s;
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    else if (noBlocks && p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
}

/**
 * Like `settle`, keeping what happened: the events of each decision, and before each answer, the state with its question
 * (`asked`: who is asked, and the events seen so far).
 */
export function settleLogged(
  s: GameState,
  answer: Answer = () => undefined,
): { s: GameState; events: GameEvent[]; asked: { player: PlayerId; state: GameState; before: GameEvent[] }[] } {
  let cur = s;
  const events: GameEvent[] = [];
  const asked: { player: PlayerId; state: GameState; before: GameEvent[] }[] = [];
  for (let i = 0; i < 300; i++) {
    const p = cur.pending;
    if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
    let d: Decision;
    if (p?.kind === "priority") d = { type: "pass" };
    else if (p?.kind === "choice") {
      asked.push({ player: p.player, state: cur, before: [...events] });
      d = { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested };
    } else break;
    const r = submit(cur, p.player, d);
    events.push(...r.events);
    cur = r.state;
  }
  return { s: cur, events, asked };
}

/** Passes and answers choices (suggested answer by default) until an empty stack, with no pending trigger. */
export const settle = (s: GameState, answer: Answer = () => undefined): GameState => settleWith(s, answer, false);

/** Like `settle`, and the defenders don't block. */
export const settleNoBlocks = (s: GameState, answer: Answer = () => undefined): GameState => settleWith(s, answer, true);

/** Plays (without attacking or blocking) to the second main phase, answering choices. */
export function throughCombat(s: GameState, answer: Answer = () => undefined): GameState {
  let cur = s;
  for (let i = 0; i < 300 && cur.turn.step !== "main2"; i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
}

/** Casts the named card from hand; `extra` completes the decision (targets, X, kicker...). */
export const cast = (s: GameState, player: PlayerId, name: string, extra: object = {}) =>
  act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });

/** Variant of `cast` with the targets as a parameter. */
export const castTargets = (
  s: GameState,
  player: PlayerId,
  name: string,
  targets?: Record<string, string[]>,
  extra: object = {},
) => act(s, player, { type: "cast", card: idOf(s, player, "hand", name), targets, ...extra });

export const castable = (s: GameState, player: PlayerId, card: string) =>
  legalActions(s, player).some((a) => a.type === "cast" && a.card === card);

export const canActivate = (s: GameState, player: PlayerId, source: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source);

/** Answer that picks the wanted objects (or players) when they are among the options. */
export const picking =
  (want: string[]) =>
  (req: ChoiceRequest, _player?: PlayerId, s?: GameState): ChoiceValue[] | undefined => {
    if (req.type === "name" && s) {
      const named = wantedName(s, req, want);
      return named.length > 0 ? named : undefined;
    }
    if (req.type !== "pick") return undefined;
    const picked = want.filter((w) => req.options.includes(w));
    return picked.length > 0 ? picked : undefined;
  };

/** "Name" question (card name, creature type): the first wanted name that is accepted; none otherwise. */
export const wantedName = (s: GameState, req: ChoiceRequest, want: string[]): string[] =>
  req.type === "name" ? want.filter((w) => isNameAllowed(s, req.of, w)).slice(0, 1) : [];

/** Selects the object named `name` among a choice's options. */
export const pickNamed = (s: GameState, req: ChoiceRequest, name: string) =>
  req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === name).slice(0, 1) : undefined;

/** Goes to p1's declare attackers and attacks player `defender` with `attackers` (multiplayer game). */
export function attackPlayer(s: GameState, attackers: string[], defender: PlayerId): GameState {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender })) });
}

/**
 * Plays the combat (like `throughCombat`) noting, by name, the options of each target choice of a triggered
 * ability; "you may": yes; otherwise the suggested answer.
 */
export function combatTargetsOffered(s: GameState): { s: GameState; offered: (string | undefined)[][] } {
  const offered: (string | undefined)[][] = [];
  const out = throughCombat(s, (req, _p, cur) => {
    if (req.intent === "may") return [1];
    if (req.type === "pick" && req.intent === "triggerTarget") offered.push(namesIn(cur, req.options));
    return undefined;
  });
  return { s: out, offered };
}

/** Goes to p1's declare attackers and attacks p2 with `attackers`. */
export function attack(s: GameState, attackers: string[]): GameState {
  const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
}

/**
 * "You put counters": `player` casts Fleeting Flight (from its hand, with a Plains) on `target` and lets the
 * spell resolve; returns the state and the source names of the triggered abilities waiting on the stack.
 */
export function counterFrom(s: GameState, player: PlayerId, target: string): { s: GameState; triggered: string[] } {
  let cur = act(s, player, { type: "cast", card: idOf(s, player, "hand", "Fleeting Flight"), targets: { t: [target] } });
  cur = passUntil(cur, (x) => !x.stack.some((i) => i.kind === "spell"));
  const triggered = cur.stack.filter((i) => i.kind === "ability").map((i) => cur.defs[i.sourceDefId]?.name ?? "");
  return { s: cur, triggered };
}
