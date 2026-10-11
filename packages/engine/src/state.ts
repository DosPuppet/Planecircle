/**
 * State manipulation primitives: ids, deterministic randomness,
 * events, zones and computed characteristics (layers).
 */
import { cardRule } from "./cardDef";
import { colorIdentity } from "./identity";
import type {
  AbilityDef,
  CardDef,
  CastInfo,
  Color,
  CommanderState,
  ContinuousEffect,
  GameObject,
  GameState,
  LkiSnapshot,
  ManaCost,
  ManaType,
  ObjectId,
  PlayerId,
  Step,
  TurnLogEntry,
  TurnStats,
  Zone,
} from "./types";
import { COLORS } from "./types";

/** Permanent types (Descend: "a permanent card was put into your graveyard"). */

// Display events: `events.ts` (no dependencies), re-exported here.
export { collectEvents, emit } from "./events";

import { emit } from "./events";

// ---------------------------------------------------------------------------
// Rules events: listened to by the triggers module (triggers.ts).
// Distinct from GameEvent, which only serves the display.
// ---------------------------------------------------------------------------

export type RulesEvent =
  /** An Aura or an Equipment becomes attached to a permanent (by `attach`, or entering attached; Eriette). */
  | { e: "attached"; objectId: ObjectId; to: ObjectId }
  | {
      e: "zone";
      oldId: ObjectId | null;
      newId: ObjectId | null;
      from: Zone | null;
      to: Zone;
      /** Characteristics at the time of leaving the battlefield. */
      lki: LkiSnapshot | null;
    }
  /**
   * `instantSorceryBefore`: instants and sorceries already cast this turn by this player (for an instant or a sorcery);
   * `spellsBefore`: spells already cast this turn by all players (storm, 702.40a).
   */
  | { e: "cast"; player: PlayerId; stackId: ObjectId; instantSorceryBefore?: number; spellsBefore: number }
  /** A spell copy put on the stack by this player (707.10). */
  | { e: "copySpell"; player: PlayerId; stackId: ObjectId }
  /** A permanent destroyed by a spell or ability this player controls (701.8). */
  | { e: "destroyed"; lki: LkiSnapshot; by: PlayerId }
  /** Discarded cards (new ids, in the graveyard). */
  | { e: "discard"; player: PlayerId; cards: ObjectId[] }
  | { e: "discardBatch"; player: PlayerId; count: number }
  | { e: "cycled"; player: PlayerId; card: ObjectId; x: number }
  | { e: "exhaust"; player: PlayerId; source: ObjectId }
  | { e: "crime"; player: PlayerId }
  | { e: "plotted"; card: ObjectId }
  | { e: "attack"; attacker: ObjectId; defender: PlayerId }
  /** `excess`: excess damage (120.4a) dealt to a creature or a planeswalker. */
  | {
      e: "damage";
      sourceId: ObjectId | null;
      /** Spell that deals the damage (resolving stack item). */
      stackId?: string;
      sourceController?: PlayerId;
      target: string;
      amount: number;
      combat: boolean;
      excess?: number;
    }
  | { e: "step"; step: Step; active: PlayerId }
  /** `first`: first time this player gains life this turn. */
  | { e: "lifeGain"; player: PlayerId; amount: number; first: boolean }
  | { e: "lifeLoss"; player: PlayerId; amount: number }
  /** `nth`: rank of this card among those drawn by this player this turn. */
  /** `turnDraw`: the draw of the draw step (504.1). */
  | { e: "draw"; player: PlayerId; nth: number; objectId?: ObjectId; turnDraw?: boolean }
  | { e: "attackWith"; player: PlayerId; count: number }
  | { e: "counters"; objectId: ObjectId; kind: string; amount: number; first: boolean; by: PlayerId }
  /** A spell or ability was just put on the stack with these targets (stack item id). */
  | { e: "targeted"; stackId: string; controller: PlayerId; targets: string[] }
  | { e: "untap"; objectId: ObjectId }
  /** A double-faced permanent transformed (701.28): it now has the abilities of the visible face. */
  | { e: "transformed"; objectId: ObjectId }
  /** `by`: the player who taps it (controller of what is resolving; otherwise, cost or mana, its controller). */
  /** `cause`: tapped to pay for teamwork; `first`: the first time this turn. */
  | { e: "tap"; objectId: ObjectId; by: PlayerId; cause?: "teamwork" | "mana"; first?: boolean }
  /** A player just scried or surveilled. */
  | { e: "scry"; player: PlayerId }
  /** A player searched their library (Wan Shi Tong). */
  | { e: "search"; player: PlayerId }
  /** Loyalty ability activated (`cost`: loyalty change, negative if counters are removed). */
  | { e: "loyalty"; player: PlayerId; sourceId: ObjectId; cost: number }
  /** A creature blocks. */
  | { e: "block"; blocker: ObjectId; attacker: ObjectId }
  /** Creatures dealt combat damage to this player (one damage step). */
  | { e: "combatDamageBatch"; player: PlayerId; sources: ObjectId[] }
  /** Cards were milled (701.13), at once: per player, the number of nonland cards (Fallout). */
  | { e: "milled"; byPlayer: { player: PlayerId; nonland: number; cards: number }[] }
  /** A permanent is sacrificed (by its controller). */
  | { e: "sacrifice"; objectId: ObjectId; player: PlayerId }
  /** A player loses the game. */
  | { e: "playerLost"; player: PlayerId }
  /** A permanent changes controller (Zidane, Tantalus Thief). */
  | { e: "controlChange"; objectId: ObjectId; from: PlayerId; to: PlayerId }
  /** A creature explores (701.44), revealing a land card or not. */
  | { e: "explore"; objectId: ObjectId; land: boolean }
  /** A player discovers N (701.57). */
  | { e: "discover"; player: PlayerId; n: number }
  /** A player activates an ability (that isn't a mana ability). */
  | { e: "activated"; player: PlayerId; stackId: string }
  /** A Mount becomes saddled. */
  | { e: "saddled"; objectId: ObjectId }
  /** Creatures saddled a Mount or crewed a Vehicle (cost paid). */
  | { e: "crewed"; vehicle: ObjectId; crew: ObjectId[] }
  /** A player manifests dread ("whenever you manifest dread" triggers). */
  | { e: "manifestDread"; player: PlayerId; graveyard?: ObjectId[] }
  /** A face-down permanent is turned face up. */
  | { e: "turnedFaceUp"; objectId: ObjectId }
  /** A Class reaches a level. */
  | { e: "classLevel"; objectId: ObjectId; level: number }
  /** A player plays a land. */
  | { e: "playLand"; player: PlayerId; objectId: ObjectId; from: Zone }
  /** Expend N (Bloomburrow): this player just spent their Nth total mana to cast spells this turn. */
  | { e: "expend"; player: PlayerId; n: number }
  /** A player forages (701.61). */
  | { e: "forage"; player: PlayerId }
  /** Collect evidence (701.59). */
  | { e: "collectEvidence"; player: PlayerId }
  /** A Case is solved (Case File Auditor). */
  | { e: "caseSolved"; player: PlayerId; objectId: ObjectId }
  /** A permanent becomes monstrous (701.37b). */
  | { e: "monstrous"; objectId: ObjectId }
  /** A player gives a gift (702.174). */
  | { e: "gift"; player: PlayerId }
  /** A Room door is unlocked. */
  | { e: "unlock"; objectId: ObjectId; door: number; player: PlayerId }
  | { e: "blocked"; attacker: ObjectId; player: PlayerId }
  /** Bending (Avatar): this player waterbends, earthbends, firebends or airbends. */
  | { e: "bend"; player: PlayerId; kind: BendKind }
  /** An attacking creature caused one of its abilities to trigger by attacking (Firebender Ascension). */
  | { e: "attackTriggered"; player: PlayerId; objectId: ObjectId };

/** Bending (Avatar): water (paying a cost), earth, fire (the ability resolves) or air. */
export type BendKind = "water" | "earth" | "fire" | "air";

/**
 * "You [element]bend": triggers ("whenever you …bend") and turn log ("if you've done all four this
 * turn").
 */
export function bent(s: GameState, player: PlayerId, kind: BendKind): void {
  logTurnEvent(s, { e: "bend", player, kind });
  rulesEvent(s, { e: "bend", player, kind });
}

/** Signals a rules event: the matching triggered abilities are put on hold. */
export function rulesEvent(s: GameState, ev: RulesEvent): void {
  if (ev.e === "zone" && ev.from === "battlefield" && ev.lki) {
    s.batch.leftBatch ??= [];
    s.batch.leftBatch.push(ev.lki.id);
  }
  // A single card per event (`announceDiscard`): its id (chaos, "discarded this turn").
  if (ev.e === "discard")
    logTurnEvent(s, {
      e: "discard",
      player: ev.player,
      amount: ev.cards.length,
      ...(ev.cards.length === 1 ? { id: ev.cards[0] } : {}),
    });
  detectTriggers(s, ev);
}

// ---------------------------------------------------------------------------
// State copy: the engine mutates a copy, states already returned never change.
// ---------------------------------------------------------------------------

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k in v) out[k] = deepClone((v as Record<string, unknown>)[k]);
  return out as T;
}

/**
 * Deep copy of the state, except the card definitions (immutable, shared).
 * Much faster than Immer for our use (AI simulations): see tools/bench.ts.
 */
export function cloneState(s: GameState): GameState {
  const { defs, ...rest } = s;
  const copy = deepClone(rest) as GameState;
  copy.defs = { ...defs };
  carryLayerCache(s, copy);
  carryStaticsCache(s, copy);
  carrySourcesCache(s, copy);
  return copy;
}

/**
 * How the source was cast: the spell on the stack (or resolving), otherwise the permanent it became. `permanentFirst`:
 * the permanent first (mana spent known as it enters).
 */
export function castInfoOf(s: GameState, sourceId: ObjectId | undefined, permanentFirst = false): CastInfo | undefined {
  if (!sourceId) return undefined;
  const o = s.objects[sourceId]?.cast;
  if (permanentFirst && o) return o;
  const item = s.resolving?.item.id === sourceId ? s.resolving.item : s.stack.find((x) => x.id === sourceId);
  return item?.cast ?? o;
}

// ---------------------------------------------------------------------------
// Ids, timestamps, randomness (mulberry32, state stored in the game)
// ---------------------------------------------------------------------------

export function newId(s: GameState, prefix = "o"): string {
  // One counter per prefix: creating one more effect or trigger doesn't shift the object ids.
  const n = s.idCounters[prefix] ?? 1;
  s.idCounters[prefix] = n + 1;
  return `${prefix}${n}`;
}

export function nextTimestamp(s: GameState): number {
  s.timestamp += 1;
  return s.timestamp;
}

export function random(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    const tmp = items[i] as T;
    items[i] = items[j] as T;
    items[j] = tmp;
  }
}

export function emptyTurnStats(): TurnStats {
  return {
    spellsCast: 0,
  };
}

export function emptyPool(): Record<ManaType, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** Changes the controller of a permanent (control timestamp, rules event). */
export function setController(s: GameState, o: GameObject, to: PlayerId): void {
  const from = o.controller;
  o.controller = to;
  o.controlledSince = s.turn.number;
  if (from !== to) rulesEvent(s, { e: "controlChange", objectId: o.id, from, to });
}

// Layer 2 (613.1b): the controller of each permanent, computed from the control effects (control.ts).

/** A player who has left the game no longer controls anything through an effect (800.4a). */
const inGame = (s: GameState, p: PlayerId | undefined) => !!p && !!s.players[p] && !s.players[p]?.lost;

/**
 * Recomputes the controller of each permanent (layer 2). Returns true if a controller changed. Idempotent: a second
 * call changes nothing (fuzz invariant).
 */
export function syncControl(s: GameState): boolean {
  let changed = false;
  // The controller of an Aura that grants control can itself depend on an effect: a few passes at most.
  for (let pass = 0; pass < 4; pass++) {
    const claims = controlClaims(s);
    let moved = false;
    for (const id of s.battlefield) {
      const o = s.objects[id];
      if (!o) continue;
      const base = o.baseController ?? o.controller;
      const list = claims.get(id);
      let to = base;
      if (list) {
        list.sort((a, b) => a.ts - b.ts);
        to = (list[list.length - 1] as { to: PlayerId }).to;
      }
      if (to === o.controller) continue;
      removeFromCombat(s, id);
      setController(s, o, to);
      moved = true;
    }
    if (!moved) break;
    changed = true;
    bump(s);
  }
  return changed;
}

/**
 * 611.2b: the effects that last "for as long as [an Aura or an Equipment] is attached to it" (Eriette, Assimilation
 * Aegis) end as soon as it leaves the battlefield or is no longer attached to an affected object; true if one ended.
 */
export function endDetachedEffects(s: GameState): boolean {
  const ended = s.effects.filter(
    (e) =>
      e.whileAttached &&
      (s.objects[e.whileAttached]?.zone !== "battlefield" || !e.affected.includes(s.objects[e.whileAttached]?.attachedTo ?? "")),
  );
  if (!ended.length) return false;
  s.effects = s.effects.filter((e) => !ended.includes(e));
  bump(s);
  return true;
}

/** Controllers imposed on each permanent, with their timestamp. Removes the "for as long as" effects that have ended. */
function controlClaims(s: GameState): Map<ObjectId, { ts: number; to: PlayerId }[]> {
  const claims = new Map<ObjectId, { ts: number; to: PlayerId }[]>();
  const claim = (id: ObjectId, ts: number, to: PlayerId) => {
    const list = claims.get(id);
    if (list) list.push({ ts, to });
    else claims.set(id, [{ ts, to }]);
  };
  // Possession Engine: "for as long as you control [the source]"; the effect ends for good (611.2b).
  // Eriette: "for as long as that Aura is attached to it".
  endDetachedEffects(s);
  const ended = s.effects.filter(
    (e) => e.whileControlledBy && e.whileSource && s.objects[e.whileSource]?.controller !== e.whileControlledBy,
  );
  if (ended.length) {
    s.effects = s.effects.filter((e) => !ended.includes(e));
    bump(s);
  }
  for (const e of s.effects) {
    if (!e.controller || !inGame(s, e.controller)) continue;
    for (const id of e.affected) claim(id, e.timestamp, e.controller);
  }
  for (const id of s.battlefield) {
    const aura = s.objects[id];
    const host = aura?.attachedTo ? s.objects[aura.attachedTo] : undefined;
    if (!aura || host?.zone !== "battlefield" || !inGame(s, aura.controller)) continue;
    const d = s.defs[aura.defId];
    // Confiscate: "you control enchanted permanent".
    if (cardRule(d, "controlsEnchanted")) claim(host.id, aura.timestamp, aura.controller);
  }
  return claims;
}

export function obj(s: GameState, id: ObjectId): GameObject {
  const o = s.objects[id];
  if (!o) throw new Error(`Unknown object: ${id}`);
  return o;
}

export function defOf(s: GameState, id: ObjectId): CardDef {
  const d = s.defs[obj(s, id).defId];
  if (!d) throw new Error(`Unknown definition for ${id}`);
  return d;
}

export function isPlayer(s: GameState, id: string): boolean {
  return id in s.players;
}

// ---------------------------------------------------------------------------
// Players (N players: duel, multiplayer, Commander)
// ---------------------------------------------------------------------------

export function isAlive(s: GameState, p: PlayerId): boolean {
  return !!s.players[p] && !s.players[p]?.lost;
}

export function alivePlayers(s: GameState): PlayerId[] {
  return s.playerOrder.filter((p) => isAlive(s, p));
}

/** Opponents still in the game, in turn order starting from the next player. */
export function opponentsOf(s: GameState, p: PlayerId): PlayerId[] {
  const i = s.playerOrder.indexOf(p);
  const rotated = [...s.playerOrder.slice(i + 1), ...s.playerOrder.slice(0, Math.max(0, i))];
  return rotated.filter((q) => q !== p && isAlive(s, q));
}

/** Next player in the game in turn order (the player themselves if alone). */
export function nextPlayer(s: GameState, p: PlayerId): PlayerId {
  return opponentsOf(s, p)[0] ?? p;
}

/** APNAP order (101.4): active player first, then the others in turn order. */
export function apnapOrder(s: GameState): PlayerId[] {
  const active = s.turn.active;
  return [...(isAlive(s, active) ? [active] : []), ...opponentsOf(s, active)];
}

export function onBattlefield(s: GameState, id: ObjectId): boolean {
  return s.objects[id]?.zone === "battlefield";
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

export const P1P1 = "+1/+1";
export const M1M1 = "-1/-1";

export function counterCount(o: { counters: Record<string, number> }, kind: string): number {
  return o.counters[kind] ?? 0;
}

/** Kinds of P/T counters other than +1/+1 and -1/-1 (122.1a: "+2/+2" of Soul Exchange, "+1/+0"…). */
const PT_COUNTER = /^([+-]\d+)\/([+-]\d+)$/;

/** Net P/T change due to the P/T counters (122.1a): +1/+1, -1/-1 and the other "+N/+M" kinds. */
export function counterPT(o: { counters: Record<string, number> }): { power: number; toughness: number } {
  const n = counterCount(o, P1P1) - counterCount(o, M1M1);
  let power = n;
  let toughness = n;
  for (const [kind, k] of Object.entries(o.counters)) {
    if (!k || kind === P1P1 || kind === M1M1) continue;
    const m = PT_COUNTER.exec(kind);
    if (!m) continue;
    power += Number(m[1]) * k;
    toughness += Number(m[2]) * k;
  }
  return { power, toughness };
}

/** Taps a permanent ("whenever it becomes tapped"). */
export function tapObject(s: GameState, o: GameObject, cause?: "teamwork" | "mana"): void {
  if (o.tapped) return;
  o.tapped = true;
  // Captain America, Living Legend: "if it's the first time this creature became tapped this turn".
  const first = !objectDidThisTurn(s, o.id, "tap");
  const by = s.resolving?.controller ?? o.controller;
  logTurnEvent(s, { e: "tap", player: by, id: o.id });
  bumpFor(s, "tapped"); // static abilities can depend on it ("tapped legendary creatures you control")
  rulesEvent(s, { e: "tap", objectId: o.id, by, ...(cause ? { cause } : {}), first });
}

/**
 * Untaps a permanent. 122.1d: if it has a stun counter, one is removed from it instead. Returns true if it was
 * untapped.
 */
export function untapObject(s: GameState, o: GameObject): boolean {
  if (!o.tapped) return false;
  // Blossombind: "enchanted creature can't become untapped". Those of the untap step only (`untapStep`) are read by
  // that step (`untapStepRule`), not here.
  if (quantityMods(s, "untap", (a) => !a.r.untapStep && recipientMatches(s, a, o.id)).prevented) return false;
  if ((o.counters.stun ?? 0) > 0) {
    changeCounters(s, o, "stun", -1);
    return false;
  }
  o.tapped = false;
  // Hedge Whisperer: "for as long as this creature remains tapped"; Braided Net: "for as long as it remains tapped".
  const whileTapped = (e: ContinuousEffect) => e.whileAffectedTapped && e.affected.includes(o.id);
  if (s.effects.some((e) => e.whileSourceTapped === o.id || whileTapped(e))) {
    s.effects = s.effects
      .filter((e) => e.whileSourceTapped !== o.id)
      .flatMap((e) =>
        whileTapped(e) ? (e.affected.length > 1 ? [{ ...e, affected: e.affected.filter((x) => x !== o.id) }] : []) : [e],
      );
    bump(s);
  } else bumpFor(s, "tapped");
  const untapStep = s.turn.step === "untap" && s.turn.active === o.controller;
  logTurnEvent(s, { e: "untap", player: o.controller, id: o.id, ...(untapStep ? { untapStep: true } : {}) });
  rulesEvent(s, { e: "untap", objectId: o.id });
  return true;
}

/** Counters the permanent's controller wants as few of as possible (order of replacements, 616.1). */
const HARMFUL_COUNTERS = new Set(["-1/-1", "stun", "time", "doom", "bounty", "finality"]);

/**
 * Adds (or removes, if n < 0) counters; returns the number actually changed. `asCost`: counters put to pay a cost
 * (loyalty +N, "put a counter:"); "if an effect would" replacements don't apply to them.
 */
/**
 * Puts (n > 0) or removes counters. `asCost`: paid as a cost; `by`: the player who puts them (by default the controller
 * of what is resolving, otherwise of the permanent): the damage source's controller for infect and wither (120.3d),
 * the payer of a cost, the controller of a permanent entering with counters (122.6a).
 */
export function changeCounters(
  s: GameState,
  o: GameObject,
  kind: string,
  n: number,
  opts: boolean | { asCost?: boolean; by?: PlayerId } = false,
): number {
  const asCost = typeof opts === "boolean" ? opts : !!opts.asCost;
  const putBy = (typeof opts === "object" ? opts.by : undefined) ?? s.resolving?.controller ?? o.controller;
  // Replacements (616.1), in the order chosen by the permanent's controller: Doubling Season, The Earth Crystal
  // ("twice that", including as it enters), Yoshimaru, Caradora ("that many plus one" +1/+1 counters). They want the
  // most counters, except for harmful counters.
  if (n > 0 && o.zone === "battlefield") {
    // Counter replacements (R1, family H); Blossombind: "counters can't be put on it".
    const q = quantityMods(
      s,
      "counters",
      (a) =>
        (!a.r.counter || a.r.counter === kind) &&
        !(asCost && a.r.effectOnly) &&
        // "if you would put": the one who puts them (controller of what is resolving, otherwise of the permanent).
        (!a.r.byYou || putBy === a.controller) &&
        recipientMatches(s, a, o.id),
    );
    if (q.prevented) return 0;
    n = chooseReplacementOrder(n, q.mods, HARMFUL_COUNTERS.has(kind) ? "min" : "max");
  }
  const before = counterCount(o, kind);
  const after = Math.max(0, before + n);
  if (after === 0) delete o.counters[kind];
  else o.counters[kind] = after;
  // An ability counter takes the timestamp of its arrival (613.7): the latest one put on (layers.ts).
  if (KEYWORD_COUNTERS[kind]) {
    if (after > before) o.counterTimestamps = { ...o.counterTimestamps, [kind]: nextTimestamp(s) };
    else if (after === 0 && o.counterTimestamps?.[kind] !== undefined) {
      const { [kind]: _, ...rest } = o.counterTimestamps;
      o.counterTimestamps = Object.keys(rest).length ? rest : undefined;
    }
  }
  if (after !== before) bump(s);
  // "As long as this land has a doom counter" (Ultima): the effect ends for it when it has none left.
  if (after === 0 && before > 0 && s.effects.some((e) => e.whileAffectedHasCounter === kind && e.affected.includes(o.id)))
    s.effects = s.effects.flatMap((e) =>
      e.whileAffectedHasCounter === kind && e.affected.includes(o.id)
        ? e.affected.length > 1
          ? [{ ...e, affected: e.affected.filter((x) => x !== o.id) }]
          : []
        : [e],
    );
  if (after > before && o.zone === "battlefield") {
    // "the first time counters are put on this creature this turn" (Stalwart Successor).
    const first = !objectDidThisTurn(s, o.id, "counters");
    // Turn log (Lasting Tarfire: "if you put a counter on a creature this turn"; Fractal Tender, Kid Loki: "on it"):
    // the one who puts them is the controller of what is resolving, otherwise (cost, action) the controller of the
    // permanent. Noted before the event, which its triggers read.
    const by = putBy;
    const c = chars(s, o.id);
    logTurnEvent(s, { e: "counters", player: by, kind, n: after - before, types: c.types, subtypes: c.subtypes, id: o.id });
    rulesEvent(s, { e: "counters", objectId: o.id, kind, amount: after - before, first, by });
  }
  return after - before;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

function zoneArray(s: GameState, o: GameObject): ObjectId[] | null {
  switch (o.zone) {
    case "battlefield":
      return s.battlefield;
    case "exile":
      return s.exile;
    case "stack":
      return null; // handled by s.stack
    default:
      return s.players[o.owner]?.[o.zone] ?? null;
  }
}

export function createObject(
  s: GameState,
  defId: string,
  owner: PlayerId,
  zone: Zone,
  opts: { uid?: string; isToken?: boolean; controller?: PlayerId } = {},
): GameObject {
  const id = newId(s);
  bump(s);
  const o: GameObject = {
    id,
    uid: opts.uid ?? `c${id}`,
    defId,
    owner,
    controller: opts.controller ?? owner,
    zone,
    tapped: false,
    damage: 0,
    deathtouched: false,
    counters: {},
    controlledSince: s.turn.number,
    timestamp: nextTimestamp(s),
    isToken: opts.isToken ?? false,
  };
  if (zone === "battlefield") o.baseController = o.controller;
  s.objects[id] = o;
  const arr = zoneArray(s, o);
  arr?.push(id);
  return o;
}

/** Commander (903.3, PLAN-E): the entry of the commander whose card `o` is (not a token or a copy), otherwise undefined. */
export function commanderOf(s: GameState, o: GameObject | undefined): CommanderState["cards"][string] | undefined {
  return o && !o.isToken && s.commander ? s.commander.cards[o.uid] : undefined;
}

const NO_ABILITIES: readonly AbilityDef[] = [];

/**
 * Abilities that function in the command zone (113.6): all those of an emblem; of a card (a commander waiting to be
 * cast), only those that say they function from the command zone (`fromCommand`: eminence).
 */
export function commandZoneAbilities(s: GameState, id: ObjectId): readonly AbilityDef[] {
  const o = s.objects[id];
  if (!o) return NO_ABILITIES;
  const abilities = s.defs[o.defId]?.abilities ?? NO_ABILITIES;
  if (o.isToken) return abilities;
  return abilities.some(fromCommand) ? abilities.filter(fromCommand) : NO_ABILITIES;
}

const fromCommand = (ab: AbilityDef) =>
  (ab.kind === "triggered" || ab.kind === "static" || ab.kind === "playerStatic") && !!ab.fromCommand;

/** Commander (903.4): color identity of a player's commanders (empty without a commander, 903.4f). */
export function commanderIdentity(s: GameState, player: PlayerId): Color[] {
  if (!s.commander) return [];
  const out = new Set<Color>();
  for (const c of Object.values(s.commander.cards)) {
    const d = c.owner === player ? s.defs[c.defId] : undefined;
    if (d) for (const color of colorIdentity(d)) out.add(color);
  }
  return COLORS.filter((c) => out.has(c));
}

/**
 * Moves an object to another zone. The object becomes a new object (400.7):
 * returns its new id, or null if it ceases to exist (token leaving the battlefield).
 */
export function moveObject(
  s: GameState,
  id: ObjectId,
  to: Zone,
  opts: {
    controller?: PlayerId;
    position?: "top" | "bottom";
    enters?: EntersContext;
    /** Enters face down (manifest, cloak): the real card stays hidden, without entering replacements or triggers. */
    faceDown?: { ward: boolean; upCosts: ManaCost[] };
    /** Receives the actual destination, after replacements (exiled instead of dying…). */
    landed?: { to?: Zone };
    /** Enters transformed (712.14) or tapped: set before the entering replacements and triggers. */
    transformed?: boolean;
    /** Modal double-faced card played by its back face (712.12, land back face): it enters back face up. */
    modalBack?: boolean;
    tapped?: boolean;
  } = {},
): ObjectId | null {
  const o = obj(s, id);
  // Copy of a prepared spell or of a card (Uldaros): it leaves exile only for the stack; elsewhere, it ceases to exist
  // (a copy of a resolving permanent spell becomes a token).
  if ((o.preparedFor || o.cardCopy) && to !== "stack" && !(o.cardCopy && o.zone === "stack" && to === "battlefield")) {
    removeObject(s, id);
    return null;
  }
  // 303.4g: an Aura that would enter without being cast and with nothing legal to enchant stays in its zone.
  const auraDef = s.defs[o.defId]?.enchant;
  if (
    to === "battlefield" &&
    auraDef &&
    !auraDef.player &&
    o.zone !== "stack" &&
    !opts.enters?.attachTo &&
    !opts.faceDown &&
    auraHosts(s, opts.controller ?? o.controller, id).length === 0
  )
    return null;
  // A prepared permanent leaving the battlefield: the copy of its spell ceases to exist.
  if (o.preparedCopy && o.zone === "battlefield") setPrepared(s, o, false);
  // Unearth (702.84a): an unearthed permanent that would leave the battlefield is exiled instead.
  if (o.exileIfLeaves && o.zone === "battlefield" && to !== "battlefield" && to !== "exile") to = "exile";
  // 614.1a / 616.1: "instead of the graveyard" replacements (Progenitus, finality, Rest in Peace, Valgavoth…).
  let shuffleIn = false;
  let linkTo: ObjectId | undefined;
  if (to === "graveyard") {
    const r = replaceGraveyard(s, o);
    to = r.to;
    shuffleIn = !!r.shuffle;
    linkTo = r.linkTo;
  }
  if (opts.landed) opts.landed.to = to;
  const from = zoneArray(s, o);
  if (from) {
    const i = from.indexOf(id);
    if (i >= 0) from.splice(i, 1);
  }
  // Last known information (608.2h), taken before removal from combat: "when an attacking creature dies".
  const lki = o.zone === "battlefield" ? snapshot(s, id) : null;
  if (lki) {
    s.lki[id] = lki;
  }
  // 506.4: a permanent leaving the battlefield is removed from combat, whatever effect moves it.
  if (o.zone === "battlefield" && s.combat) {
    s.combat.attackers = s.combat.attackers.filter((a) => a.id !== id);
    s.combat.blockers = s.combat.blockers.filter((b) => b.id !== id);
    for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => b !== id);
  }
  // Turn log: "creatures exiled this turn" (Vren), "cards that left your graveyard" (Bonecache)…
  // Only public moves: a draw (library → hand) isn't in it (hidden information).
  const hidden = (z: Zone) => z === "library" || z === "hand";
  // Arrival on the battlefield: logged once the new object exists, with its identifier ("entered this turn").
  let arrival: Extract<TurnLogEntry, { e: "zone" }> | undefined;
  if (o.zone !== to && !(hidden(o.zone) && hidden(to))) {
    const d = s.defs[o.defId];
    const entry = zoneEntry(
      o.zone,
      to,
      o.owner,
      lki?.controller ?? (to === "battlefield" ? (opts.controller ?? o.controller) : o.controller),
      // Face down (708): a 2/2 creature without a creature type; the real card isn't noted.
      (opts.faceDown || o.faceDown) && to === "battlefield"
        ? { types: ["Creature"], subtypes: [], token: o.isToken, faceDown: true }
        : {
            types: lki?.types ?? d?.types ?? [],
            subtypes: lki?.subtypes ?? d?.subtypes ?? [],
            token: o.isToken,
          },
    );
    if (to === "battlefield" && entry.e === "zone") arrival = entry;
    else logTurnEvent(s, entry);
  }
  const from0 = o.zone;
  delete s.objects[id];
  // Melded permanent: it becomes its two cards again in the destination zone (701.42c).
  if (o.melded) {
    const parts = o.melded.map((p) =>
      createObject(s, p.defId, o.owner, to, { uid: p.uid, controller: to === "battlefield" ? o.controller : o.owner }),
    );
    if (to === "library") shuffle(s, s.players[o.owner]?.library ?? []);
    if (arrival && parts[0]) logTurnEvent(s, { ...arrival, id: parts[0].id });
    bump(s);
    rulesEvent(s, { e: "zone", oldId: id, newId: parts[0]?.id ?? null, from: from0, to, lki });
    if (from0 === "battlefield") releaseLinkedExile(s, id);
    return parts[0]?.id ?? null;
  }
  // Control effects in force before leaving (a "for as long as" effect removed below may be one).
  const controlEffects = from0 === "battlefield" && s.effects.some((e) => e.controller);
  // Possession Engine: effects that last "for as long as you control [the source]" end.
  if (from0 === "battlefield" && s.effects.some((e) => e.whileSource === id || e.whileSourceTapped === id)) {
    s.effects = s.effects.filter((e) => e.whileSource !== id && e.whileSourceTapped !== id);
    bump(s);
  }
  // 613.1b, 611.2: a change of control tied to this permanent (Aura that grants control, "for as long as" effect) ends
  // as soon as it leaves, without waiting for state-based actions (a resolution can still ask for a choice).
  if (from0 === "battlefield" && (o.attachedTo || controlEffects)) syncControl(s);
  // Emrakul: effects "until this card is cast from exile" end. When cast, the card moves to the stack before payment
  // (601.2a): the effect lasts until the spell is cast (601.2i, `castSpell`).
  if (from0 === "exile" && to !== "stack" && s.effects.some((e) => e.untilExiledUid === o.uid)) {
    s.effects = s.effects.filter((e) => e.untilExiledUid !== o.uid);
    bump(s);
  }
  if (o.isToken && to !== "battlefield") {
    bump(s);
    // A token leaving the battlefield ceases to exist, but it does "die" (triggers).
    rulesEvent(s, { e: "zone", oldId: id, newId: null, from: from0, to, lki });
    if (from0 === "battlefield") releaseLinkedExile(s, id);
    return null;
  }

  // Face down: the card is revealed when leaving the battlefield; a spell cast face down enters face down.
  const staysFaceDown = !!o.faceDown && o.zone === "stack" && to === "battlefield";
  const cardId = o.faceDown && !staysFaceDown ? o.faceDown.card : o.defId;
  const hide = to === "battlefield" && !!opts.faceDown;
  if (hide) s.defs[FACE_DOWN_ID] ??= FACE_DOWN_DEF;
  const moved = createObject(s, hide ? FACE_DOWN_ID : cardId, o.owner, to, {
    uid: o.uid,
    isToken: o.isToken || (!!o.cardCopy && to === "battlefield"),
    controller: to === "battlefield" || to === "stack" ? (opts.controller ?? o.controller) : o.owner,
  });
  if (arrival) logTurnEvent(s, { ...arrival, id: moved.id });
  if (o.preparedFor) moved.preparedFor = o.preparedFor;
  if (o.cardCopy && to === "stack") moved.cardCopy = true;
  if (staysFaceDown) moved.faceDown = o.faceDown;
  if (hide && opts.faceDown) moved.faceDown = { card: cardId, ...opts.faceDown };
  if (to === "library" && opts.position !== "bottom") {
    const lib = s.players[o.owner]?.library;
    if (lib) {
      lib.pop();
      lib.unshift(moved.id);
    }
  }
  if (shuffleIn) shuffle(s, s.players[o.owner]?.library ?? []);
  if (to === "battlefield" && (opts.transformed || opts.modalBack)) {
    const d = s.defs[moved.defId];
    const back = d?.layout === (opts.modalBack ? "modal_dfc" : "transform") ? d.faceDefs?.[1] : undefined;
    if (back) moved.faceDefId = back.id;
  }
  if (to === "battlefield" && opts.tapped) moved.tapped = true;
  // "put into a graveyard from the battlefield this turn" (Supper for Spiders); "milled this turn": from the library to
  // the graveyard (Raul, Tato Farmer).
  if (from0 === "battlefield" || (from0 === "library" && to === "graveyard")) moved.arrivedFrom = from0;
  if (to === "battlefield") applyEntersReplacements(s, moved, opts.enters ?? {});
  const linker = linkTo ? s.objects[linkTo] : undefined;
  if (linker) {
    linker.linked = [...(linker.linked ?? []), moved.id];
    bump(s);
  }
  rulesEvent(s, { e: "zone", oldId: id, newId: moved.id, from: from0, to, lki });
  // Entering attached (an Aura cast or put onto the battlefield): it becomes attached.
  if (to === "battlefield" && moved.attachedTo && s.objects[moved.attachedTo])
    rulesEvent(s, { e: "attached", objectId: moved.id, to: moved.attachedTo });
  if (from0 === "battlefield") releaseLinkedExile(s, id);
  return moved.id;
}

/** Card hidden from the viewer (exiled face down, 406.3): the view only shows its back. */
export const HIDDEN_CARD_ID = "hidden-card";

/** Id of the generic definition of a face-down object (708.2). */
export const FACE_DOWN_ID = "face-down";

/** Generic definition of a face-down object: 2/2 creature without a name, cost or abilities (708.2). */
export const FACE_DOWN_DEF: CardDef = {
  id: FACE_DOWN_ID,
  name: "",
  typeLine: "Face-down Creature",
  fr: { typeLine: "Créature face cachée" },
  manaCost: null,
  manaCostText: "",
  colors: [],
  supertypes: [],
  types: ["Creature"],
  subtypes: [],
  power: 2,
  toughness: 2,
  keywords: [],
  abilities: [],
  text: "",
  implemented: true,
};

/** Turns a face-down permanent face up (702.168d, 701.58c); its "turned face up" abilities trigger. */
export function turnFaceUp(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || !o.faceDown) return;
  // "Can't be turned face up" (Unable to Scream, Karlov Watchdog).
  if (chars(s, id).keywords.includes("cantBeTurnedFaceUp")) return;
  o.defId = o.faceDown.card;
  delete o.faceDown;
  // "As it is turned face up, put N counters on it" (a replacement-like effect, before the event).
  const fc = s.defs[o.defId]?.faceUpCounters;
  if (fc) {
    bump(s);
    const n = Math.max(0, evalAmount(s, staticContext(s, o.controller, id), fc.n));
    if (n) changeCounters(s, o, fc.kind, n);
  }
  logTurnEvent(s, { e: "turnFaceUp", player: o.controller });
  bump(s);
  emit({ type: "turnedFaceUp", objectId: id, defId: o.defId });
  rulesEvent(s, { e: "turnedFaceUp", objectId: id });
}

/** Room: unlocks a door (709.5e); "when you unlock this door" triggers. */
export function unlockDoor(s: GameState, id: ObjectId, door: number): void {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || o.unlocked?.includes(door)) return;
  o.unlocked = [...(o.unlocked ?? []), door].sort();
  bump(s);
  rulesEvent(s, { e: "unlock", objectId: id, door, player: o.controller });
}

/** Room: split card whose halves are enchantments (doors). */
const COMBAT_STEPS = new Set([
  "beginCombat",
  "declareAttackers",
  "declareBlockers",
  "firstStrikeDamage",
  "combatDamage",
  "endCombat",
]);

/** 722: the player who makes the pending decision (the controller of the turn, if there is one). */
export function decider(s: GameState): PlayerId | undefined {
  const p = s.pending;
  if (!p) return undefined;
  const tc = s.turnControl;
  const inCombat = COMBAT_STEPS.has(s.turn.step);
  if (tc && tc.turn === s.turn.number && p.player === tc.player && !s.players[tc.by]?.lost && (!tc.combatOnly || inCombat))
    return tc.by;
  return p.player;
}

export function isRoom(d: CardDef | undefined): boolean {
  return d?.layout === "split" && !!d.faceDefs?.every((f) => f.subtypes.includes("Room"));
}

/** Registers a card definition in the game, with the definitions of its faces. */
export function registerDef(s: GameState, d: CardDef): void {
  s.defs[d.id] ??= d;
  for (const f of d.faceDefs ?? []) s.defs[f.id] ??= f;
  if (d.meldResultDef) registerDef(s, d.meldResultDef);
}

/** Removes an object from the game without going through a zone (spell copy ceasing to exist, melded card). */
export function removeFromGame(s: GameState, id: ObjectId): void {
  removeObject(s, id);
}

function removeObject(s: GameState, id: ObjectId): void {
  const o = s.objects[id];
  if (!o) return;
  const arr = zoneArray(s, o);
  const i = arr?.indexOf(id) ?? -1;
  if (arr && i >= 0) arr.splice(i, 1);
  delete s.objects[id];
}

/**
 * Reality Fracture: a permanent that has a prepared spell becomes prepared (a copy of that spell is created in exile,
 * which its controller can cast) or unprepared (the copy ceases to exist). Without a prepared spell, nothing.
 */
export function setPrepared(s: GameState, o: GameObject, on: boolean): void {
  if (!on) {
    if (o.preparedCopy) removeObject(s, o.preparedCopy);
    delete o.preparedCopy;
    return;
  }
  const spell = s.defs[o.defId]?.prepareSpell;
  if (!spell || o.zone !== "battlefield" || (o.preparedCopy && s.objects[o.preparedCopy])) return;
  s.defs[spell.id] ??= spell;
  const copy = createObject(s, spell.id, o.controller, "exile");
  copy.preparedFor = o.id;
  o.preparedCopy = copy.id;
}

// ---------------------------------------------------------------------------
// Computed characteristics: see layers.ts (re-exported here for convenience).
// ---------------------------------------------------------------------------

import { removeFromCombat } from "./actions";
import { evalAmount, staticContext } from "./effects";
import { bump, bumpFor, carryLayerCache, chars, KEYWORD_COUNTERS, snapshot } from "./layers";
import { chooseReplacementOrder } from "./modifiers";
import { applyEntersReplacements, auraHosts, type EntersContext, releaseLinkedExile, replaceGraveyard } from "./replacement";
import { carryStaticsCache, quantityMods, recipientMatches } from "./statics";
import { carrySourcesCache, detectTriggers } from "./triggers";
import { logTurnEvent, objectDidThisTurn, zoneEntry } from "./turnlog";

export {
  bump,
  type Characteristics,
  chars,
  creaturesControlledBy,
  hasKeyword,
  hasType,
  isCreature,
  isSummoningSick,
  sickForActivation,
  snapshot,
} from "./layers";

/**
 * Kicker paid any number of times, counted as the X of the spell: replicate (702.56), squad (702.157), multikicker
 * (702.33c).
 */
export const kickerPaidTimes = (d: CardDef): boolean =>
  d.kicker?.kind === "replicate" || d.kicker?.kind === "squad" || d.kicker?.kind === "multikicker";
