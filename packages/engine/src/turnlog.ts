/**
 * Log of the turn's events (P1 of the audit, step 8): instead of one counter per card in `TurnStats` ("Foods
 * sacrificed this turn", "creatures exiled this turn"…), the engine records each event of the turn in `s.turnLog`, and
 * the cards query it through a generic amount (`amount.turnEvents(query)`).
 *
 * The log is emptied at the beginning of each turn. Its entries are small and plain JSON (fuzz invariants).
 */
import type { CardType, Color, GameState, ObjectId, PlayerId, TurnLogEntry, TurnLogQuery, Zone } from "./types";

/** Did the object attack this turn (under this identity: an object that came back to the battlefield is new)? */
export function attackedThisTurn(s: GameState, id: ObjectId): boolean {
  return objectDidThisTurn(s, id, "attack");
}

/** Did the object deal damage this turn? (same identity as `sourceKey`, see `logDamage`) */
export function dealtDamageThisTurn(s: GameState, id: ObjectId): boolean {
  const key = s.objects[id]?.uid ?? id;
  return s.turnLog.some((e) => e.e === "damage" && e.sourceKey === key);
}

/**
 * Index of the entries by object (`id`: counters, activations, taps, discards, mounts, attacks), derived from the log
 * and memoized per array: the log only grows during a turn (`logTurnEvent`) and it is replaced by a new array at the
 * beginning of the next turn (likewise in a copy of the state). The entries of an object are those of that object
 * only: an object that changes zones is a new object (400.7), with a new id.
 */
interface ObjectIndex {
  /** Entries already indexed. */
  n: number;
  byId: Map<ObjectId, TurnLogEntry[]>;
  /** Counters put, "player|kind" (one value per pair, in order of first occurrence); copied on each addition. */
  countersPut: Map<ObjectId, string[]>;
}
const objectIndexes = new WeakMap<TurnLogEntry[], ObjectIndex>();
const NO_ENTRIES: readonly TurnLogEntry[] = [];
/** No counter put this turn: a shared array (no allocation, constant object shape for V8). */
const NO_COUNTERS_PUT: string[] = [];

function objectIndex(s: GameState): ObjectIndex {
  const log = s.turnLog;
  let ix = objectIndexes.get(log);
  if (!ix || ix.n > log.length) {
    ix = { n: 0, byId: new Map(), countersPut: new Map() };
    objectIndexes.set(log, ix);
  }
  for (; ix.n < log.length; ix.n++) {
    const e = log[ix.n] as TurnLogEntry;
    const id = "id" in e ? e.id : undefined;
    if (!id) continue;
    const list = ix.byId.get(id);
    if (list) list.push(e);
    else ix.byId.set(id, [e]);
    if (e.e === "counters") {
      const key = `${e.player}|${e.kind}`;
      const kinds = ix.countersPut.get(id) ?? NO_COUNTERS_PUT;
      if (!kinds.includes(key)) ix.countersPut.set(id, [...kinds, key]);
    }
  }
  return ix;
}

/** Entries of the turn that concern this object (under this identity). */
export function objectTurnEvents(s: GameState, id: ObjectId): readonly TurnLogEntry[] {
  return objectIndex(s).byId.get(id) ?? NO_ENTRIES;
}

/** An entry of this kind for the object this turn? */
export function objectDidThisTurn(s: GameState, id: ObjectId, event: TurnLogEntry["e"]): boolean {
  return objectTurnEvents(s, id).some((e) => e.e === event);
}

/**
 * Activations of the object this turn: a loyalty ability (606.3), or the "only once each turn" ability at index
 * `index`.
 */
export function activatedThisTurn(s: GameState, id: ObjectId, which: { loyalty: true } | { index: number }): boolean {
  return objectTurnEvents(s, id).some((e) => e.e === "activate" && ("loyalty" in which ? !!e.loyalty : e.index === which.index));
}

/**
 * Counters put on the object this turn, "player|kind" (filter `countersPutByYouThisTurn`); the returned array is never
 * modified afterwards (the last known information keeps it).
 */
export function countersPutThisTurn(s: GameState, id: ObjectId): string[] {
  return objectIndex(s).countersPut.get(id) ?? NO_COUNTERS_PUT;
}

/**
 * Invalidation of the layer cache after an entry: installed by `layers.ts` (which depends on this module) so as to
 * invalidate it only if it reads the log (PLAN-S, P2); by default, always.
 */
let invalidate = (s: GameState): void => {
  s.version += 1;
};
export function onTurnLogged(fn: (s: GameState) => void): void {
  invalidate = fn;
}

export function logTurnEvent(s: GameState, entry: TurnLogEntry): void {
  s.turnLog.push(entry);
  // Static abilities depend on it (raid, "if you attacked with a Spacecraft").
  invalidate(s);
}

/**
 * Player "concerned" by an entry: controller of a permanent that leaves or enters the battlefield, otherwise owner of
 * the moved card (`byOwner`: always the owner); caster; damaged player; sacrificing player.
 */
function subjectOf(e: TurnLogEntry, byOwner?: boolean): PlayerId | undefined {
  switch (e.e) {
    case "zone":
      return !byOwner && (e.from === "battlefield" || e.to === "battlefield") ? e.controller : e.owner;
    default:
      return e.player;
  }
}

const hasAny = <T>(have: readonly T[] | undefined, want: readonly T[] | undefined) =>
  !want || want.some((x) => have?.includes(x));

type Chars = {
  types?: readonly CardType[];
  subtypes?: readonly string[];
  supertypes?: readonly string[];
  colors?: readonly Color[];
};

/** The characteristics comparator (`TurnLogQuery`: of the entry's object, or of the damage source). */
function charsMatch(have: Chars, q: Pick<TurnLogQuery, "types" | "subtype" | "supertype" | "colors">): boolean {
  if (!hasAny<CardType>(have.types, q.types)) return false;
  if (q.subtype && !have.subtypes?.includes(q.subtype)) return false;
  if (q.supertype && !have.supertypes?.includes(q.supertype)) return false;
  return hasAny<Color>(have.colors, q.colors);
}

function matches(s: GameState, e: TurnLogEntry, q: TurnLogQuery, me: PlayerId, subject?: PlayerId, source?: ObjectId): boolean {
  if (e.e !== q.event) return false;
  // Damage dealt to the ability's source or by it.
  if (q.self && (e.e !== "damage" || !source || (q.self === "target" ? e.id : e.sourceId) !== source)) return false;
  const who = subjectOf(e, q.byOwner);
  // "An opponent": an opponent still in the game (800.4a: a player who has left the game is no longer an opponent).
  const opponent = () => who !== me && !!who && !s.players[who]?.lost;
  if (subject !== undefined ? who !== subject : q.who === "you" ? who !== me : q.who === "opponent" ? !opponent() : false)
    return false;
  if (!charsMatch(e, q)) return false;
  if (q.notTypes?.some((x) => e.types?.includes(x))) return false;
  if (q.notSubtype && e.subtypes?.includes(q.notSubtype)) return false;
  if (q.keyword && !(e as { keywords?: string[] }).keywords?.includes(q.keyword)) return false;
  if (q.token !== undefined && !!(e as { token?: boolean }).token !== q.token) return false;
  if (q.faceDown !== undefined && !!(e as { faceDown?: boolean }).faceDown !== q.faceDown) return false;
  if (e.e === "zone") {
    if (q.from && e.from !== q.from) return false;
    if (q.to && e.to !== q.to) return false;
  }
  if ((e.e === "cast" || e.e === "playLand") && q.fromZone && e.fromZone !== q.fromZone) return false;
  if (e.e === "cast" && q.warped && !e.warped) return false;
  if (e.e === "cast" && q.minManaValue !== undefined && (e.manaValue ?? 0) < q.minManaValue) return false;
  if (e.e === "activate" && q.equip && !e.equip) return false;
  if (e.e === "untap" && q.untapStep && !e.untapStep) return false;
  if (e.e === "activate" && q.loyalty && !e.loyalty) return false;
  if (e.e === "attack" && q.againstYou && e.defender !== me) return false;
  if (e.e === "damage") {
    if (q.combat !== undefined && e.combat !== q.combat) return false;
    if (q.toPlayer !== undefined && e.toPlayer !== q.toPlayer) return false;
    const src = q.source;
    if (src?.controller === "you" && e.sourceController !== me) return false;
    if (
      src &&
      !charsMatch(
        { types: e.sourceTypes, subtypes: e.sourceSubtypes, supertypes: e.sourceSupertypes, colors: e.sourceColors },
        src,
      )
    )
      return false;
  }
  return true;
}

/** Weight of an entry: its quantity (damage, life, discarded cards) for a sum, otherwise 1. */
const weight = (e: TurnLogEntry, q: TurnLogQuery) => (q.sum && "amount" in e ? e.amount : 1);

/**
 * Values of an entry for `distinct`: damage source, bending kind, card types, concerned player, attacking
 * creature.
 */
function distinctValues(e: TurnLogEntry, d: NonNullable<TurnLogQuery["distinct"]>): readonly string[] {
  switch (d) {
    case "source":
      return e.e === "damage" ? [e.sourceKey ?? e.sourceController] : [];
    case "kind":
      return e.e === "bend" ? [e.kind] : [];
    case "type":
      return e.types ?? [];
    case "player": {
      const p = subjectOf(e);
      return p ? [p] : [];
    }
    case "object":
      return e.e === "attack" && e.id ? [e.id] : [];
    case "defender":
      return e.e === "attack" ? [e.defender] : [];
  }
}

/**
 * Number of matching entries of the turn (or sum of the quantities, `sum`; or number of different values,
 * `distinct`), seen from `me`. `perPlayer`: the largest total among the concerned players ("a player was dealt 10 or
 * more combat damage this turn").
 */
export function countTurnEvents(s: GameState, q: TurnLogQuery, me: PlayerId, subject?: PlayerId, source?: ObjectId): number {
  if (q.distinct) {
    const values = new Set<string>();
    for (const e of s.turnLog)
      if (matches(s, e, q, me, subject, source)) for (const v of distinctValues(e, q.distinct)) values.add(v);
    return values.size;
  }
  if (subject !== undefined) return s.turnLog.reduce((n, e) => n + (matches(s, e, q, me, subject, source) ? weight(e, q) : 0), 0);
  if (q.perPlayer) {
    return Math.max(
      0,
      ...s.playerOrder.map((p) => s.turnLog.reduce((n, e) => n + (matches(s, e, q, me, p, source) ? weight(e, q) : 0), 0)),
    );
  }
  return s.turnLog.reduce((n, e) => n + (matches(s, e, q, me, undefined, source) ? weight(e, q) : 0), 0);
}

/**
 * Entry of a zone change (characteristics known at the time of the move). `controller`: the one who controlled it when
 * it left the battlefield, or who controls it when it enters.
 */
export function zoneEntry(
  from: Zone | null,
  to: Zone,
  owner: PlayerId,
  controller: PlayerId,
  c: { types: CardType[]; subtypes: string[]; token: boolean; faceDown?: boolean },
  id?: ObjectId,
): TurnLogEntry {
  return {
    e: "zone",
    from,
    to,
    owner,
    controller,
    types: c.types,
    subtypes: c.subtypes,
    token: c.token || undefined,
    ...(c.faceDown ? { faceDown: true } : {}),
    ...(id ? { id } : {}),
  };
}

/**
 * Did this permanent enter the battlefield this turn (its arrival is logged with its identifier)? A change of control
 * isn't an arrival (Renet, Temporal Apprentice; power-up: "if he entered this turn").
 */
export function enteredThisTurn(s: GameState, id: ObjectId): boolean {
  return objectDidThisTurn(s, id, "zone");
}
