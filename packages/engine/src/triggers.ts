/**
 * Triggered abilities (603).
 *
 * - Detection: at the time of the event (via the rules events emitted by state.ts / actions.ts).
 *   "Leaves the battlefield" abilities look back in time (603.10a): during a batch of simultaneous events
 *   (state-based actions, an effect), the sources are those present at the start of the batch.
 * - Putting on the stack: just before a player receives priority (603.3b), in APNAP order;
 *   each player orders their triggers, chooses their mode and targets (603.3c–d) via the generic choices.
 * - Delayed (603.7) and reflexive (603.12) abilities: created by effects, with their own effects and targets.
 */

import { gainLife } from "./actions";
import { ask, cardRef } from "./choices";
import { boardAmount, concreteSpec, evalAmount, needsConcrete, resolveRef, staticContext } from "./effects";
import { RulesError, rethrowAsRules } from "./errors";
import { withScan } from "./layers";
import { shareName } from "./names";
import {
  apnapOrder,
  castInfoOf,
  chars,
  commandZoneAbilities,
  emit,
  isCreature,
  isPlayer,
  newId,
  obj,
  onBattlefield,
  opponentsOf,
  type RulesEvent,
  rulesEvent,
  snapshot,
} from "./state";
import { playerStatic, playerStatics } from "./statics";
import {
  holderOf,
  legalTargets,
  matchesCard,
  matchesObjectFilter,
  matchesView,
  resolveFilter,
  validateTargets,
  withChosen,
} from "./targets";
import { msg } from "./text";
import { countTurnEvents, logTurnEvent, objectDidThisTurn } from "./turnlog";
import type {
  AbilityDef,
  Amount,
  CardType,
  Condition,
  DelayedTiming,
  DelayedTrigger,
  GameState,
  InlineAbility,
  LkiSnapshot,
  ObjectFilter,
  ObjectId,
  PendingTrigger,
  PlayerId,
  StackItem,
  TargetFilter,
  TargetSpec,
  TriggerEventData,
  TriggeredAbilityDef,
  TriggerSpec,
} from "./types";
import { PERMANENT_TYPES } from "./types";

interface Source {
  id: ObjectId;
  view: LkiSnapshot;
}

const hasTriggers = (abilities: readonly AbilityDef[] | undefined) => !!abilities?.some((a) => a.kind === "triggered");

/**
 * Sources in force, cached as long as the state hasn't changed (PLAN-C, lot C15): version of the layer cache, moment
 * of the turn, and composition of the zones read (to be safe, in case a move doesn't advance the version).
 */
const sourcesCache = new WeakMap<GameState, { key: string; out: Source[] }>();

/** State copy: the copy takes over the sources of the original, validated by their key (see `carryLayerCache`). */
export function carrySourcesCache(from: GameState, to: GameState): void {
  const hit = sourcesCache.get(from);
  if (hit) sourcesCache.set(to, hit);
}

function sourcesKey(s: GameState): string {
  let zones = `${s.battlefield.length}:${s.battlefield[s.battlefield.length - 1] ?? ""}|${s.stack.length}:${s.stack[s.stack.length - 1]?.id ?? ""}|${s.effects.length}`;
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    zones += `|${pl?.graveyard.length ?? 0}:${pl?.graveyard[pl.graveyard.length - 1] ?? ""}:${pl?.command.length ?? 0}`;
  }
  // The views of the sources carry the tapped state, which doesn't always advance the version (`bumpFor`).
  let tapped = "";
  for (const id of s.battlefield) tapped += s.objects[id]?.tapped ? "1" : "0";
  return `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}|${zones}|${tapped}`;
}

function liveSources(s: GameState): Source[] {
  const key = sourcesKey(s);
  const hit = sourcesCache.get(s);
  if (hit && hit.key === key) return hit.out;
  const out = computeLiveSources(s);
  sourcesCache.set(s, { key, out });
  return out;
}

function computeLiveSources(s: GameState): Source[] {
  return withScan(s, () => computeLiveSourcesScanned(s));
}

function computeLiveSourcesScanned(s: GameState): Source[] {
  const out: Source[] = [];
  // Granted or copied (layer 1) triggered abilities: the printed abilities can't be relied on.
  // Prowess (702.108) and decayed (702.147): the triggered ability is added by the layers to any creature that has the
  // keyword (printed, granted or, for decayed, by a counter).
  const grants = (m: { addAbilities?: AbilityDef[]; addKeywords?: string[] }) =>
    !!m.addAbilities?.some((a) => a.kind === "triggered") ||
    !!m.addKeywords?.includes("prowess") ||
    !!m.addKeywords?.includes("decayed");
  const granted =
    s.effects.some((e) => e.copyOf || e.textOf || e.replaceWord || grants(e)) ||
    s.battlefield.some((id) => (s.defs[obj(s, id).defId]?.abilities ?? []).some((ab) => ab.kind === "static" && grants(ab.mods)));
  for (const id of s.battlefield) {
    // Quick filter on the printed abilities, unless an effect grants triggered abilities.
    const o = obj(s, id);
    const d = s.defs[o.faceDefId ?? o.defId];
    // Room: the triggered abilities are carried by its doors; Class, Case, station thresholds: by their
    // levels.
    const levels = !!d?.classLevels || !!d?.caseSolved || !!d?.station;
    if (
      !granted &&
      !levels &&
      !hasTriggers(d?.abilities) &&
      !d?.keywords.includes("prowess") &&
      !d?.keywords.includes("decayed") &&
      !(o.counters.decayed ?? 0) &&
      !d?.faceDefs?.some((f) => hasTriggers(f.abilities))
    )
      continue;
    const view = snapshot(s, id);
    if (hasTriggers(view.abilities)) out.push({ id, view });
  }
  // Cards with an ability that triggers from the graveyard (Flamewake Phoenix).
  for (const p of s.playerOrder) {
    for (const id of s.players[p]?.graveyard ?? []) {
      const abs = s.defs[obj(s, id).defId]?.abilities;
      if (abs?.some((a) => a.kind === "triggered" && a.fromGraveyard)) out.push({ id, view: snapshot(s, id) });
    }
  }
  // "When you cast this spell": the spell on the stack (Emrakul, the Exigent Doom).
  for (const item of s.stack) {
    if (item.kind !== "spell" || !s.objects[item.id]) continue;
    const abs = s.defs[item.sourceDefId]?.abilities;
    if (abs?.some((a) => a.kind === "triggered" && a.trigger.on === "castSelf"))
      out.push({ id: item.id, view: snapshot(s, item.id) });
  }
  // Command zone: emblems (a commander waiting to be cast has no active ability there, 113.6).
  for (const p of s.playerOrder) {
    for (const id of s.players[p]?.command ?? []) {
      // The filter by ability (`fromCommand`) is done in `detectTriggers`: the ability indices stay those of the
      // definition.
      if (hasTriggers(commandZoneAbilities(s, id))) out.push({ id, view: snapshot(s, id) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Batches of simultaneous events (looking back in time)
// ---------------------------------------------------------------------------

let batchBefore: Source[] | null = null;
/** Number of the current batch of simultaneous events (`GameState.batch.eventBatch`), null outside a batch. */
let currentBatch: number | null = null;
/**
 * Lifelink during a batch of simultaneous events: a single life gain per source (120.3f, 119.9). A creature that
 * damages several objects or players at the same time (trample, several blockers) triggers "whenever you gain life"
 * only once.
 */
let lifelinkBatch: Map<string, { controller: PlayerId; amount: number }> | null = null;
/**
 * 603.6a: permanents entering at the same time see each other enter. Each entering of a batch is detected right away
 * (sources present at that instant), then reviewed at the end of the batch for the sources that entered after it in
 * the same batch.
 */
let enterBatch: { ev: RulesEvent; seen: Set<ObjectId> }[] | null = null;

/** Sets aside a lifelink gain until the end of the current batch; false if there is no batch (immediate gain). */
export function queueLifelink(key: string, controller: PlayerId, amount: number): boolean {
  if (!lifelinkBatch) return false;
  const pending = lifelinkBatch.get(key);
  if (pending) pending.amount += amount;
  else lifelinkBatch.set(key, { controller, amount });
  return true;
}

/** Amount evaluated outside a resolution (sums, power of an object, speed…), as during a resolution without a target. */
function checkAmount(
  s: GameState,
  a: Amount,
  controller: PlayerId,
  sourceId?: ObjectId,
  eventObject?: ObjectId,
  event?: TriggerEventData,
): number {
  // The object of the event (Increment: "if the mana spent to cast that spell").
  return evalAmount(s, staticContext(s, controller, sourceId, { event, eventObject }), a);
}

/** Runs `fn` as a set of simultaneous events (state-based actions, an effect…). */
export function simultaneously<T>(s: GameState, fn: () => T): T {
  if (batchBefore) return fn();
  batchBefore = liveSources(s);
  s.batch.eventBatch = (s.batch.eventBatch ?? 0) + 1;
  currentBatch = s.batch.eventBatch;
  lifelinkBatch = new Map();
  enterBatch = [];
  try {
    const result = fn();
    // Enterings of the batch: permanents that entered together see each other enter (603.6a).
    const enters = enterBatch;
    enterBatch = null;
    for (const { ev, seen } of enters) detectTriggers(s, ev, (src) => !seen.has(src.id));
    // Lifelink gains happen with the damage of the batch: one per source, in the order of the damage.
    const gains = lifelinkBatch;
    lifelinkBatch = null;
    for (const { controller, amount } of gains.values()) gainLife(s, controller, amount);
    return result;
  } finally {
    batchBefore = null;
    lifelinkBatch = null;
    enterBatch = null;
    currentBatch = null;
  }
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

/** The player has the most life, or is tied (among the players still in the game). */
export function mostLife(s: GameState, p: PlayerId): boolean {
  const life = (x: PlayerId) => s.players[x]?.life ?? 0;
  return s.playerOrder.every((x) => s.players[x]?.lost || life(p) >= life(x));
}

/** "Once each turn" key of a triggered ability (`TriggeredAbilityDef.oncePerTurn`). */
export const onceKey = (defId: string, sourceId: string, index: number): string => `${defId}:${sourceId}:${index}`;

/**
 * Condition outside a resolution. `eventObject`: the object of the trigger event, for an intervening "if" that concerns
 * it (603.4: "whenever an opponent discards a card, if it's a land card").
 */
export function checkCondition(
  s: GameState,
  c: Condition,
  controller: PlayerId,
  sourceId?: ObjectId,
  eventObject?: ObjectId,
  /** The whole trigger event ("if 3 or more damage": Innocent Bystander). */
  event?: TriggerEventData,
): boolean {
  switch (c.kind) {
    case "step":
      return s.turn.step === c.step && (!c.first || (s.turn.endSteps ?? 0) <= 1);
    case "cast": {
      const info = castInfoOf(s, sourceId);
      return !!info && (!c.from || info.from === c.from) && (!c.via || info.via === c.via);
    }
    case "prime": {
      const n = checkAmount(s, c.amount, controller, sourceId);
      if (n < 2) return false;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
      return true;
    }
    case "turnsTakenAtLeast":
      return (s.players[controller]?.turnsTaken ?? 0) >= c.n;
    case "maxSpeed":
      return (s.players[controller]?.speed ?? 0) >= 4;
    case "firstCombat":
      return (s.turn.combats ?? 0) <= 1;
    case "controlsGreatestPower": {
      const creatures = s.battlefield.filter((id) => isCreature(s, id));
      const best = Math.max(-Infinity, ...creatures.map((id) => chars(s, id).power));
      return creatures.some((id) => s.objects[id]?.controller === controller && chars(s, id).power === best);
    }
    case "attackingAlone": {
      const atk = s.combat?.attackers ?? [];
      return atk.length === 1 && !!s.players[atk[0]?.defender ?? ""];
    }
    case "opponentDealtNoncombatDamageLastTurn":
      return opponentsOf(s, controller).some((q) => (s.players[q]?.noncombatDamageLastTurn ?? 0) > 0);
    case "classLevel":
      return (s.objects[sourceId ?? ""]?.classLevel ?? 1) === c.level;
    case "saddled":
      return !!sourceId && !!s.objects[sourceId] && objectDidThisTurn(s, sourceId, "saddled");
    case "solved":
      return !!s.objects[sourceId ?? ""]?.solved;
    case "doorLocked":
      return !!sourceId && !s.objects[sourceId]?.unlocked?.includes(c.door);
    case "chosenMode":
      return !!sourceId && s.objects[sourceId]?.chosen?.mode === c.mode;
    case "sourceDealtDamage":
      return !!(sourceId && (c.combat ? s.objects[sourceId]?.dealtCombatDamage : s.objects[sourceId]?.dealtDamage));
    case "behold": {
      const f = { ...c.filter, controller: "you" as const };
      const here = s.battlefield.some((id) => matchesObjectFilter(s, controller, id, f, sourceId));
      return (
        here || (s.players[controller]?.hand ?? []).some((id) => id !== sourceId && matchesCard(s, controller, id, f, sourceId))
      );
    }
    case "beheld":
    case "metWhenCast": {
      // The resolving spell (or on the stack): what was recorded when it was cast.
      const item = s.resolving && s.resolving.item.id === sourceId ? s.resolving.item : s.stack.find((x) => x.id === sourceId);
      return c.kind === "beheld" ? !!item?.cast?.beheld : !!item?.cast?.metWhenCast;
    }
    case "spentColor": {
      const spent = castInfoOf(s, sourceId, true)?.spentColors ?? {};
      return (spent[c.color] ?? 0) >= c.n;
    }
    case "sneakWindow":
      return (
        s.turn.step === "declareBlockers" &&
        s.turn.active === controller &&
        s.pending?.kind !== "declareBlockers" &&
        !!s.combat?.attackers.some((a) => !a.blocked && s.objects[a.id]?.controller === controller)
      );
    case "designation":
      return !!s.players[controller]?.designations?.includes(c.which);
    case "monarch":
      return s.monarch === controller;
    case "harnessed":
      return !!sourceId && !!s.objects[sourceId]?.harnessed;
    case "eventObjectGreatestPower": {
      const id = eventObject;
      const v = id ? (s.lki[id] ?? (s.objects[id]?.zone === "battlefield" ? snapshot(s, id) : undefined)) : undefined;
      if (!v) return false;
      if (c.strictAmongAll) return s.battlefield.every((x) => x === id || !isCreature(s, x) || chars(s, x).power < v.power);
      const others = [
        ...s.battlefield
          .filter((x) => x !== id && s.objects[x]?.controller === v.controller && isCreature(s, x))
          .map((x) => chars(s, x).power),
        ...(s.batch.leftBatch ?? [])
          .filter((x) => x !== id)
          .map((x) => s.lki[x])
          .filter((l) => !!l && l.controller === v.controller && l.types.includes("Creature"))
          .map((l) => l?.power ?? 0),
      ];
      return others.every((p) => v.power >= p);
    }
    case "prepared": {
      const src = sourceId ? s.objects[sourceId] : undefined;
      return !!src?.preparedCopy && !!s.objects[src.preparedCopy];
    }
    case "controls": {
      const n = s.battlefield.filter((id) =>
        matchesObjectFilter(s, controller, id, { ...c.filter, controller: "you" }, sourceId),
      ).length;
      return n >= (c.atLeast ?? 1);
    }
    case "kicked": {
      // Permanent that entered from a kicked spell (otherwise: evaluated as it enters or at resolution); once it has
      // left, its last known information ("if the gift was promised", 603.4).
      const o = sourceId ? s.objects[sourceId] : undefined;
      return !!(o ? o.kicked : sourceId && s.lki[sourceId]?.kicked);
    }
    case "yourTurn":
      return s.turn.active === controller;
    case "opponentsTurn":
      return s.turn.active !== controller;
    case "extraTurn":
      return !!s.turn.extra;
    case "counterAtLeast": {
      // The source, or its last known information ("if it had a counter…" when dying).
      const counters = sourceId ? (s.objects[sourceId]?.counters ?? s.lki[sourceId]?.counters) : undefined;
      return !!counters && (counters[c.counter] ?? 0) >= c.n;
    }
    case "not":
      return !checkCondition(s, c.cond, controller, sourceId, eventObject, event);
    case "all":
      return c.of.every((x) => checkCondition(s, x, controller, sourceId, eventObject, event));
    case "battlefieldCount":
      return s.battlefield.filter((id) => matchesView(snapshot(s, id), c.filter, controller, sourceId)).length >= c.atLeast;
    case "sourceMatches": {
      if (!sourceId) return false;
      if (onBattlefield(s, sourceId)) return matchesObjectFilter(s, controller, sourceId, c.filter, sourceId);
      // Departed source ("when it dies, if it wasn't a token"): its last known information (603.10).
      const lki = s.objects[sourceId] ? undefined : s.lki[sourceId];
      return !!lki && matchesView(lki, c.filter, controller, sourceId);
    }
    case "targetMatches":
    case "refMatches":
    case "eventObjectMatches": {
      // On triggering: the object of the event (its last known information if it left).
      if (!eventObject) return false;
      // Still on the battlefield: the full filter ("entered this turn", counters put this turn…).
      if (s.objects[eventObject]?.zone === "battlefield" && !s.lki[eventObject])
        return matchesObjectFilter(s, controller, eventObject, c.filter, sourceId);
      const v = s.lki[eventObject] ?? (s.objects[eventObject] ? snapshot(s, eventObject) : undefined);
      return !!v && matchesView(v, c.filter, controller, sourceId);
    }
    case "xAtLeast":
      return false; // evaluated on casting (stack.ts) or during the resolution (effects.ts)
    // Evolve (702.100): "if that creature has greater power or toughness".
    case "amountGreater":
      return (
        checkAmount(s, c.a, controller, sourceId, eventObject, event) >
        checkAmount(s, c.b, controller, sourceId, eventObject, event)
      );
    case "amountAtLeast": {
      const a = c.amount;
      if (typeof a === "number") return a >= c.n;
      if (a.kind === "count" && a.zone && a.zone !== "battlefield") {
        // Cards of a zone ("two or more instant and/or sorcery cards in your graveyard").
        const zone = a.zone;
        const players = a.whose === "all" ? s.playerOrder : a.whose === "opponents" ? opponentsOf(s, controller) : [controller];
        const n = players
          .flatMap((p) => (zone === "exile" ? s.exile.filter((id) => s.objects[id]?.owner === p) : (s.players[p]?.[zone] ?? [])))
          .filter((id) => matchesView(snapshot(s, id), { ...a.filter, controller: undefined }, controller, sourceId)).length;
        return n >= c.n;
      }
      if (a.kind === "count") return boardAmount(s, a, controller, sourceId) >= c.n;
      return checkAmount(s, a, controller, sourceId, eventObject, event) >= c.n;
    }
    case "any":
      return c.of.some((x) => checkCondition(s, x, controller, sourceId, eventObject, event));
    case "opponentHasMore": {
      const measure = (p: PlayerId): number => {
        if (c.what === "life") return s.players[p]?.life ?? 0;
        if (c.what === "hand") return s.players[p]?.hand.length ?? 0;
        const type = c.what === "lands" ? "Land" : "Creature";
        return s.battlefield.filter((id) => s.objects[id]?.controller === p && chars(s, id).types.includes(type)).length;
      };
      const mine = measure(controller);
      return opponentsOf(s, controller).some((p) => measure(p) > mine);
    }
    case "mostLife": {
      // With a reference (the defending player…): evaluated during the resolution (effects.ts).
      if (c.ref) return false;
      return mostLife(s, controller);
    }
    case "handAtMost": {
      // "if they have no cards in hand" outside a resolution ("To solve" of a Case, condition of a trigger).
      const ctx = staticContext(s, controller, sourceId, { sourceDefId: "" });
      return resolveRef(s, ctx, c.ref).some((p) => !!s.players[p] && (s.players[p]?.hand.length ?? 0) <= c.n);
    }
    case "var":
      return false; // evaluated during the resolution (effects.ts)
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function matchWho(who: "self" | ObjectFilter, v: LkiSnapshot, src: Source): boolean {
  if (who === "self") return v.id === src.id;
  // "the equipped / enchanted creature"
  if (who.attached === "host" && v.id !== src.view.attachedTo) return false;
  return matchesView(v, withChosen(who, src.view), src.view.controller, src.id);
}

/**
 * Does what was dealt the damage match `to` (player relative to the ability's controller, or object: alive, otherwise
 * its last information)? Without `to`, everything matches.
 */
function damagedMatches(s: GameState, target: string, to: TargetFilter | undefined, me: PlayerId, srcId: ObjectId): boolean {
  if (!to) return true;
  if (s.players[target]) return !!to.players && whose(to.players, target, me);
  const v = liveView(s, target) ?? s.lki[target];
  return !!to.objects && !!v && matchesView(v, to.objects, me, srcId);
}

function whose(rel: "you" | "opponent" | "any", player: PlayerId, controller: PlayerId): boolean {
  return rel === "any" || (rel === "you" ? player === controller : player !== controller);
}

/** Text of a modal spell (700.2). */
const MODAL_TEXT = /\bchoose (?:one|two|three|four|five|up to|any number|one or more|one or both)\b|\bSpree\b/i;

/**
 * Generic `action` trigger (PLAN-J J3): the engine's event of that name, done by a player `whose` relative to the
 * controller (you by default), or on the source itself (`self`).
 */
function matchAction(
  s: GameState,
  ev: RulesEvent,
  t: Extract<TriggerSpec, { on: "action" }>,
  src: Source,
  me: PlayerId,
): TriggerEventData | null {
  if (ev.e !== t.action) return null;
  // The source's chosen player (Shinryu), even if they have just lost the game.
  const chosen = t.whose === "chosen" ? (s.objects[src.id] ?? s.lki[src.id])?.chosen?.player : undefined;
  const by = (p: PlayerId) => (t.whose === "chosen" ? p === chosen : whose(t.whose ?? "you", p, me));
  switch (ev.e) {
    // "Searches their library": not another player's (Sphinx Ambassador).
    case "search":
      return by(ev.player) && !ev.library ? { player: ev.player } : null;
    // A player who has just lost still counts as an opponent.
    case "playerLost":
      if (t.whose === "chosen") return ev.player === chosen ? { player: ev.player } : null;
      return ev.player !== me && (t.whose === "any" || opponentsOf(s, me).includes(ev.player) || s.players[ev.player]?.lost)
        ? { player: ev.player }
        : null;
    case "discover":
      return by(ev.player) ? { player: me, amount: ev.n } : null;
    case "forage":
    case "gift":
    case "bend":
    case "crime":
    case "collectEvidence":
    case "scry":
      return by(ev.player) ? { player: me } : null;
    case "expend":
      return by(ev.player) && ev.n === t.n ? { player: me } : null;
    case "caseSolved":
      return by(ev.player) ? { player: me, objectId: ev.objectId } : null;
    case "manifestDread":
      return by(ev.player) ? { objectId: ev.graveyard?.[0], player: me } : null;
    case "attackTriggered":
      return by(ev.player) ? { objectId: ev.objectId, player: me } : null;
    case "exhaust":
      return by(ev.player) ? { objectId: ev.source, player: me } : null;
    case "saddled":
      return t.self && ev.objectId === src.id ? { objectId: src.id, player: src.view.controller } : null;
    case "plotted":
      return t.self && ev.card === src.id ? { objectId: src.id, player: me } : null;
    case "transformed":
    case "monstrous":
      return t.self && ev.objectId === src.id ? { objectId: src.id, player: me } : null;
    case "cycled":
      return t.self && ev.card === src.id ? { objectId: src.id, player: ev.player, amount: ev.x } : null;
  }
  return null;
}

function liveView(s: GameState, id: ObjectId | null): LkiSnapshot | null {
  return id && s.objects[id] ? snapshot(s, id) : null;
}

/**
 * Enterings that trigger nothing (family G, `triggerMod` `none` on `enter`): Torpor Orb, Hushbringer, Karn, Argent
 * Defender (`everyone`: the abilities of all players); Elesh Norn, Mother of Machines (`sources`: only those of her
 * opponents' permanents). Any ability that the entering makes trigger is concerned ("enters", landfall…), delayed ones
 * included; `src`: the source of the ability (absent: ability of an object outside the battlefield, which only
 * `everyone` concerns).
 */
function entryMuted(s: GameState, ev: RulesEvent, src: Source | undefined): boolean {
  if (ev.e !== "zone" || ev.to !== "battlefield") return false;
  const v = liveView(s, ev.newId);
  if (!v) return false;
  const permanent = !!src && s.objects[src.id]?.zone === "battlefield";
  return s.playerOrder.some((p) =>
    playerStatics(s, p, "triggerMod").some(({ id, ab }) => {
      const m = ab.triggerMod;
      if (m?.effect !== "none" || m.on !== "enter") return false;
      if (m.entering && !matchesView(v, m.entering, p, id)) return false;
      if (m.everyone) return true;
      return permanent && !!src && matchesView(src.view, m.sources ?? { controller: "you" }, p, id);
    }),
  );
}

/** Does the event match the trigger? Returns the data of the event, or null. */
/**
 * "Whenever you attack a player [with one or more …]" (`attackWith` with `eachPlayer`): each player (not a planeswalker)
 * attacked by at least `min` matching attackers of `attacker`, with their number, in turn order.
 */
function playersAttacked(
  s: GameState,
  t: Extract<TriggerSpec, { on: "attackWith" }>,
  attacker: PlayerId,
  me: PlayerId,
  sourceId: ObjectId,
): { player: PlayerId; count: number }[] {
  const counts = new Map<PlayerId, number>();
  for (const a of s.combat?.attackers ?? []) {
    if (!s.players[a.defender]) continue;
    const v = liveView(s, a.id);
    if (!v || v.controller !== attacker || (t.filter && !matchesView(v, t.filter, me, sourceId))) continue;
    counts.set(a.defender, (counts.get(a.defender) ?? 0) + 1);
  }
  return s.playerOrder.flatMap((p) => {
    const count = counts.get(p) ?? 0;
    return count >= (t.min ?? 1) ? [{ player: p, count }] : [];
  });
}

function matchTrigger(s: GameState, ev: RulesEvent, t: TriggerSpec, src: Source): TriggerEventData | null {
  const me = src.view.controller;
  switch (t.on) {
    case "enters": {
      if (ev.e !== "zone" || ev.to !== "battlefield") return null;
      const v = liveView(s, ev.newId);
      if (t.fromZone) {
        const arrived = ev.newId ? s.objects[ev.newId] : undefined;
        // Cast from the graveyard or exile: the spell went through the stack.
        const castFrom = t.fromZone === "graveyard" || t.fromZone === "exile" ? arrived?.cast?.from : undefined;
        if (ev.from !== t.fromZone && castFrom !== t.fromZone) return null;
      }
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "dies": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || ev.to !== "graveyard" || !ev.lki) return null;
      // "Dies": a creature, unless the filter names other types ("a creature or artifact dies", Edge of Eternities).
      const typed = t.who !== "self" && (!!t.who.types || !!t.who.anyOf);
      if (!typed && !ev.lki.types.includes("Creature")) return null;
      return matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined, player: ev.lki.controller }
        : null;
    }
    case "destroyed":
      return ev.e === "destroyed" && (!t.byOpponent || opponentsOf(s, me).includes(ev.by)) && matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, player: ev.by }
        : null;
    case "action":
      return matchAction(s, ev, t, src, me);
    case "controlChange":
      return ev.e === "controlChange" && ev.from === me && ev.to !== me ? { objectId: ev.objectId, player: ev.to } : null;
    case "leaves": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || !ev.lki) return null;
      if (t.to && ev.to !== t.to) return null;
      if (t.whileCrafting && !s.turn.crafting) return null;
      // "Without dying": not a creature put into the graveyard.
      if (t.withoutDying && ev.to === "graveyard" && ev.lki.types.includes("Creature")) return null;
      // Zenos yae Galvus: "when the chosen creature leaves the battlefield" (linked to the source).
      if (t.who === "linked") return s.objects[src.id]?.linked?.includes(ev.lki.id) ? { objectId: ev.lki.id } : null;
      if (typeof t.who === "object")
        return matchWho(t.who, ev.lki, src)
          ? {
              objectId: ev.lki.id,
              player: ev.lki.controller,
              // To exile (Kaya) or another zone (without dying): the card becomes the object of the event.
              ...((t.to === "exile" || t.withoutDying) && ev.newId ? { newObjectId: ev.newId } : {}),
            }
          : null;
      return ev.lki.id === src.id ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined } : null;
    }
    case "attacks": {
      if (ev.e !== "attack") return null;
      const v = liveView(s, ev.attacker);
      if (!v || !matchWho(t.who, v, src)) return null;
      // "… attacks you" (Sabotage Strategist): you, not your planeswalkers.
      if (t.defending === "you" && ev.defender !== me) return null;
      // "… attacks you or a planeswalker you control" (Jace, Reality Sculptor).
      if (t.defending === "youOrYourPlaneswalkers" && ev.defender !== me && s.objects[ev.defender]?.controller !== me)
        return null;
      // "… attacks a player" (Shredder, Namor): not a planeswalker.
      if (t.defending === "player" && !s.players[ev.defender]) return null;
      if (t.alone && (s.combat?.attackers.length ?? 0) !== 1) return null;
      return { objectId: ev.attacker, player: ev.defender };
    }
    case "attackWith": {
      if (t.defending) {
        if (ev.e !== "attackWith" || !opponentsOf(s, me).includes(ev.player)) return null;
        // Attackers of this opponent who attack you (Lulu), or you and/or your planeswalkers (Tomik).
        const walkers = t.defending === "youOrYourPlaneswalkers";
        const count = (s.combat?.attackers ?? []).filter(
          (a) =>
            s.objects[a.id]?.controller === ev.player &&
            (a.defender === me || (walkers && s.objects[a.defender]?.controller === me)),
        ).length;
        return count >= (t.min ?? 1) ? { player: ev.player, amount: count } : null;
      }
      if (ev.e !== "attackWith" || (!t.anyPlayer && ev.player !== me)) return null;
      // "Whenever you attack a player": the first player attacked; the others get their own trigger (`playersAttacked`).
      if (t.eachPlayer) {
        const first = playersAttacked(s, t, ev.player, me, src.id)[0];
        return first ? { player: first.player, amount: first.count } : null;
      }
      // "Whenever you attack with one or more [Rats]": only the matching attackers.
      const f = t.filter;
      const count = f
        ? (s.combat?.attackers ?? []).filter((a) => {
            const v = liveView(s, a.id);
            return !!v && v.controller === ev.player && matchesView(v, f, me, src.id);
          }).length
        : ev.count;
      return count >= (t.min ?? 1) ? { player: me, amount: count } : null;
    }
    case "dealsCombatDamage":
    case "dealsDamage": {
      if (ev.e !== "damage") return null;
      if (t.on === "dealsDamage" && t.spellToSoleTarget) {
        const item = ev.stackId
          ? s.resolving?.item.id === ev.stackId
            ? s.resolving.item
            : s.stack.find((x) => x.id === ev.stackId)
          : undefined;
        const targets = item ? Object.values(item.targets).flat() : [];
        if (!item || targets.length !== 1 || targets[0] !== ev.target || !s.objects[ev.target] || !isCreature(s, ev.target))
          return null;
        const v = liveView(s, item.sourceId) ?? s.lki[item.sourceId] ?? null;
        if (!v || !matchWho(t.who, v, src)) return null;
        return { objectId: ev.target, amount: ev.amount };
      }
      if (t.on === "dealsDamage" && t.anySourceYouControl) {
        if (ev.sourceController !== me || (t.noncombatOnly && ev.combat)) return null;
        const toOpp = !!s.players[ev.target] && ev.target !== me;
        if (!damagedMatches(s, ev.target, t.to, me, src.id)) return null;
        if (t.exactToughness) {
          const victim = s.objects[ev.target];
          if (victim?.zone !== "battlefield" || !isCreature(s, ev.target) || chars(s, ev.target).toughness !== ev.amount)
            return null;
        }
        return { objectId: ev.sourceId ?? undefined, player: toOpp ? ev.target : undefined, amount: ev.amount };
      }
      if (!ev.sourceId) return null;
      if (t.on === "dealsCombatDamage" && !ev.combat) return null;
      if (t.on === "dealsDamage" && t.noncombatOnly && ev.combat) return null;
      const toPlayer = !!s.players[ev.target];
      // "… to a player", "… to one of your opponents" (Gonti, Night Minister), "… to a creature" (Mephidross Vampire).
      if (!damagedMatches(s, ev.target, t.to, me, src.id)) return null;
      const v = liveView(s, ev.sourceId) ?? s.lki[ev.sourceId] ?? null;
      if (!v || !matchWho(t.who, v, src)) return null;
      // "… deals damage to a Spider, destroy that creature": the damaged object.
      if (t.on === "dealsDamage" && t.eventObject === "damaged")
        return toPlayer ? null : { objectId: ev.target, amount: ev.amount };
      return { objectId: ev.sourceId, player: toPlayer ? ev.target : undefined, amount: ev.amount };
    }
    case "castSpell": {
      if (ev.e !== "cast" || !whose(t.by, ev.player, me)) return null;
      const v = liveView(s, ev.stackId);
      // "a spell of the chosen color" (Diamond Mare): the choice of the source.
      const f = t.filter ? resolveFilter(s, t.filter, src.id) : undefined;
      const filterOk = !f || (!!v && matchesView(v, f, me, src.id));
      if (!filterOk && !t.targeting?.orFilter) return null;
      // "a spell that targets a creature you control / an opponent" (Danitha).
      if (t.targeting) {
        const item = s.stack.find((x) => x.id === ev.stackId);
        const targets = item ? Object.values(item.targets).flat() : [];
        const tg = t.targeting;
        const ok = targets.some((id) =>
          s.players[id]
            ? !!tg.players && whose(tg.players, id, me)
            : !!tg.objects && matchesObjectFilter(s, me, id, tg.objects, src.id),
        );
        // Danitha, Sword of Hope: "an Equipment spell or a spell that targets…".
        if (!ok && !(t.targeting.orFilter && f && filterOk)) return null;
      }
      if (t.singleTarget) {
        const item = s.stack.find((x) => x.id === ev.stackId);
        if (!item || Object.values(item.targets).flat().length !== 1) return null;
      }
      // "your second spell each turn".
      if (t.nth !== undefined && s.players[ev.player]?.turnStats.spellsCast !== t.nth) return null;
      if (t.notTheirTurn && s.turn.active === ev.player) return null;
      // Modal spell (700.2): "choose one / two / up to…" or spree; not the engine's modes for overload or cleave.
      if (t.modal) {
        const d = s.defs[s.objects[ev.stackId]?.defId ?? ""];
        if ((d?.spell?.modes?.length ?? 0) < 2 || !MODAL_TEXT.test(d?.text ?? "")) return null;
      }
      const from = s.stack.find((x) => x.id === ev.stackId)?.cast?.from;
      if (t.notFromHand && from === "hand") return null;
      if (t.fromExile && from !== "exile") return null;
      if (t.fromHand && from !== "hand") return null;
      if (t.usingManaFrom) {
        const f = t.usingManaFrom;
        const sources = s.stack.find((x) => x.id === ev.stackId)?.manaSources ?? [];
        const ok = sources.some((id) => {
          const v = s.objects[id]?.zone === "battlefield" ? snapshot(s, id) : s.lki[id];
          return !!v && matchesView(v, f, me, src.id);
        });
        if (!ok) return null;
      }
      if (t.minManaSpent !== undefined && (s.stack.find((x) => x.id === ev.stackId)?.cast?.manaSpent ?? 0) < t.minManaSpent)
        return null;
      if (t.notOwned && s.objects[ev.stackId]?.owner === ev.player) return null;
      // Alania: the first instant, the first sorcery or the first Otter spell other than Alania this turn.
      if (t.firstOf) {
        const CARD_TYPES = ["Instant", "Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];
        const sourceName = src.view.name;
        // Turn log: a single spell of this type, this one; of this creature subtype, a single one not named like the
        // source ("other than Alania": a spell with her name doesn't count, before or now).
        const castOf = (k: string) =>
          CARD_TYPES.includes(k)
            ? countTurnEvents(s, { event: "cast", types: [k as CardType] }, me, ev.player)
            : s.turnLog.filter(
                (x) => x.e === "cast" && x.player === ev.player && x.subtypes.includes(k) && !shareName(x.name, sourceName),
              ).length;
        const first =
          !!v &&
          ev.stackId !== src.id &&
          t.firstOf.some(
            (k) =>
              (v.types.includes(k as CardType) || (v.subtypes.includes(k) && !shareName(v.name, sourceName))) && castOf(k) === 1,
          );
        if (!first) return null;
      }
      // `amount`: instants and sorceries already cast this turn (Thousand-Year Storm); with `storm`, all the spells cast
      // before it this turn (702.40a), counted when it was cast.
      return { objectId: ev.stackId, player: ev.player, amount: t.storm ? ev.spellsBefore : ev.instantSorceryBefore };
    }
    case "discard":
      if (t.self) return ev.e === "discard" && ev.cards.includes(src.id) ? { objectId: src.id, player: ev.player } : null;
      return ev.e === "discard" && whose(t.whose, ev.player, me) ? { objectId: ev.cards[0], player: ev.player } : null;
    case "discardBatch":
      return ev.e === "discardBatch" && whose(t.whose, ev.player, me) ? { player: ev.player, amount: ev.count } : null;
    case "loyaltyActivated": {
      if (ev.e !== "loyalty") return null;
      if (t.byOpponent ? ev.player === me : ev.player !== me) return null;
      if (t.minRemoved !== undefined && -ev.cost < t.minRemoved) return null;
      return { objectId: ev.sourceId, player: ev.player };
    }
    case "life": {
      const changed =
        t.change === "gain"
          ? ev.e === "lifeGain"
          : t.change === "loss"
            ? ev.e === "lifeLoss"
            : ev.e === "lifeGain" || ev.e === "lifeLoss";
      if (!changed || (ev.e !== "lifeGain" && ev.e !== "lifeLoss") || !whose(t.whose ?? "you", ev.player, me)) return null;
      if (t.first && !(ev.e === "lifeGain" && ev.first)) return null;
      return { player: ev.player, amount: ev.amount };
    }
    case "isDealtDamage": {
      if (ev.e === "damage" && t.combat !== undefined && ev.combat !== t.combat) return null;
      // "Whenever you are dealt / an opponent is dealt damage": from any source (Massacre Girl).
      if (t.who === "you" || t.who === "opponent") {
        if (ev.e !== "damage" || ev.amount <= 0 || !s.players[ev.target]) return null;
        if (t.who === "you" ? ev.target !== me : ev.target === me || !!s.players[ev.target]?.lost) return null;
        return { player: ev.target, amount: ev.amount, ...(ev.sourceId ? { objectId: ev.sourceId } : {}) };
      }
      if (typeof t.who === "object") {
        if (ev.e !== "damage" || ev.amount <= 0 || (t.excess && !ev.excess)) return null;
        const v = liveView(s, ev.target);
        // Excess damage (120.4a, Magmatic Galleon): the excess, for the controller of the damaged creature.
        if (t.excess)
          return v && matchWho(t.who, v, src) ? { objectId: ev.target, amount: ev.excess, player: v.controller } : null;
        return v && matchWho(t.who, v, src) ? { objectId: ev.target, amount: ev.amount, player: me } : null;
      }
      // The enchanted or equipped creature (Cryoshatter, Pain for All), the enchanted player (Grievous Wound), or the source.
      const who = t.who === "attached" ? src.view.attachedTo : src.id;
      if (who && isPlayer(s, who)) return ev.e === "damage" && ev.target === who ? { player: who, amount: ev.amount } : null;
      return ev.e === "damage" && who && ev.target === who && ev.amount > 0
        ? { objectId: who, amount: ev.amount, player: me }
        : null;
    }
    case "blocks": {
      if (ev.e !== "block") return null;
      const v = liveView(s, ev.blocker);
      if (!v || !matchWho(t.who, v, src)) return null;
      // "… blocks a creature with flying" (Skystinger).
      const a = liveView(s, ev.attacker);
      if (t.attacker && (!a || !matchesView(a, t.attacker, me, src.id))) return null;
      return { objectId: t.eventObject === "attacker" ? ev.attacker : ev.blocker, player: v.controller };
    }
    case "chapter": {
      // 714.2b: each chapter reached or passed by the lore counters put.
      if (ev.e !== "counters" || ev.kind !== "lore" || ev.objectId !== src.id) return null;
      const after = s.objects[src.id]?.counters.lore ?? 0;
      const before = after - ev.amount;
      return t.chapters.some((n) => before < n && n <= after) ? { objectId: src.id, player: src.view.controller } : null;
    }
    case "classLevel":
      return ev.e === "classLevel" && ev.objectId === src.id && ev.level === t.level
        ? { objectId: src.id, player: src.view.controller }
        : null;
    case "activateAbility": {
      if (ev.e !== "activated" || ev.player !== me) return null;
      const item = s.stack.find((x) => x.id === ev.stackId);
      if (!item || item.copy) return null;
      if (t.source) {
        const v = s.objects[item.sourceId]?.zone === "battlefield" ? snapshot(s, item.sourceId) : s.lki[item.sourceId];
        if (!v || !matchesView(v, t.source, me, src.id)) return null;
      }
      const tg = t.targeting;
      if (
        tg &&
        !Object.values(item.targets)
          .flat()
          .some((id) =>
            s.players[id]
              ? !!tg.players && whose(tg.players, id, me)
              : !!tg.objects && matchesObjectFilter(s, me, id, tg.objects, src.id),
          )
      )
        return null;
      return { objectId: item.id, player: me };
    }
    case "explores": {
      if (ev.e !== "explore" || (t.land !== undefined && t.land !== ev.land)) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: v.controller } : null;
    }
    // Fallout: "whenever one or more nonland cards are milled" (once per mill, all players).
    case "milled": {
      if (ev.e !== "milled") return null;
      const rows = ev.byPlayer.filter((x) =>
        t.whose === "you" ? x.player === me : t.whose === "opponent" ? x.player !== me : true,
      );
      const n = rows.reduce((sum, x) => sum + (t.nonland ? x.nonland : x.cards), 0);
      return n > 0 ? { player: rows[0]?.player, amount: n } : null;
    }
    case "combatDamageBatch": {
      if (ev.e !== "combatDamageBatch" || !damagedMatches(s, ev.player, t.to, me, src.id)) return null;
      // The creatures of the batch that match ("those creatures", "one of those Dragons").
      const matching = ev.sources.filter((id) => {
        const v = liveView(s, id) ?? s.lki[id];
        return !!v && matchesView(v, t.who, me, src.id);
      });
      if (!matching.length) return null;
      const [first, ...rest] = matching;
      return { player: ev.player, objectId: first, others: rest.map((id) => ({ objectId: id })) };
    }
    case "sacrifice": {
      if (ev.e !== "sacrifice" || (ev.player !== me && !t.anyPlayer) || (t.byOpponent && ev.player === me)) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: ev.player } : null;
    }
    case "crews": {
      if (ev.e !== "crewed" || !ev.crew.includes(src.id)) return null;
      if (t.mainPhase && (s.turn.active !== me || (s.turn.step !== "main1" && s.turn.step !== "main2"))) return null;
      return { objectId: ev.vehicle, player: me };
    }
    case "turnedFaceUp": {
      if (ev.e !== "turnedFaceUp") return null;
      if (!t.who) return ev.objectId === src.id ? { objectId: src.id, player: src.view.controller } : null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "becomesAttached": {
      if (ev.e !== "attached") return null;
      const a = liveView(s, ev.objectId);
      const host = liveView(s, ev.to);
      if (!a || !host || !matchWho(t.who, a, src) || (t.to && !matchWho(t.to, host, src))) return null;
      return { objectId: a.id, player: host.controller };
    }
    case "becomesBlocked": {
      if (ev.e !== "blocked") return null;
      const v = liveView(s, ev.attacker);
      return v && matchWho(t.who, v, src) ? { objectId: v.id, player: v.controller } : null;
    }
    case "eerie": {
      if (ev.e === "zone" && ev.to === "battlefield") {
        const v = liveView(s, ev.newId);
        return v && v.controller === me && v.types.includes("Enchantment") ? { objectId: v.id, player: me } : null;
      }
      if (ev.e !== "unlock" || ev.player !== me) return null;
      const room = s.objects[ev.objectId];
      const doors = s.defs[room?.defId ?? ""]?.faceDefs?.length ?? 0;
      return doors > 0 && (room?.unlocked?.length ?? 0) >= doors ? { objectId: ev.objectId, player: me } : null;
    }
    case "unlockDoor":
      return ev.e === "unlock" && ev.objectId === src.id && (t.door === undefined || t.door === ev.door)
        ? { objectId: src.id, player: ev.player }
        : null;
    case "diesOrExiled": {
      if (ev.e !== "zone" || ev.from !== "battlefield" || (ev.to !== "graveyard" && ev.to !== "exile") || !ev.lki) return null;
      if (!ev.lki.types.includes("Creature") || (t.minPower !== undefined && ev.lki.power < t.minPower)) return null;
      return matchWho(t.who, ev.lki, src)
        ? { objectId: ev.lki.id, newObjectId: ev.newId ?? undefined, player: ev.lki.controller }
        : null;
    }
    case "playLand":
      if (ev.e !== "playLand" || !whose(t.whose ?? "you", ev.player, me) || (t.from && !t.from.includes(ev.from))) return null;
      return { objectId: ev.objectId, player: ev.player };
    case "copySpell": {
      if (ev.e !== "copySpell" || ev.player !== me) return null;
      const v = liveView(s, ev.stackId);
      if (t.filter && (!v || !matchesView(v, t.filter, me, src.id))) return null;
      return { objectId: ev.stackId, player: me };
    }
    case "castSelf":
      // `amount.eventAmount`: the spells cast before it this turn (storm).
      return ev.e === "cast" && ev.stackId === src.id ? { objectId: src.id, player: me, amount: ev.spellsBefore } : null;
    case "zoneChange": {
      if (ev.e !== "zone" || !ev.from || !t.from.includes(ev.from) || (t.to && !t.to.includes(ev.to))) return null;
      const card = (ev.newId && s.objects[ev.newId]) || undefined;
      const owner = card?.owner ?? ev.lki?.owner;
      // Share the Spoils: a card exiled with the source is played (cast or put onto the battlefield) by a player.
      if (t.linked) {
        const old = ev.oldId;
        if (!old || !s.objects[src.id]?.linked?.includes(old)) return null;
        return { objectId: ev.newId ?? undefined, player: card?.controller ?? owner ?? me };
      }
      if (t.whose === "you" && owner !== me) return null;
      // "… into an opponent's graveyard" (Bloodchief Ascension): an opponent still in the game.
      if (t.whose === "opponent" && (!owner || owner === me || !!s.players[owner]?.lost)) return null;
      if (t.filter) {
        const d = s.defs[card?.defId ?? ev.lki?.defId ?? ""];
        // From the battlefield: its types and its controller at the time of leaving (Kaya, Spirits' Justice: "creatures
        // you control and/or creature cards in your graveyard"); elsewhere: the card and its
        // owner.
        const types = ev.from === "battlefield" && ev.lki ? ev.lki.types : d?.types;
        if (!d || !types || (t.filter.types && !t.filter.types.some((x) => types.includes(x)))) return null;
        const controller = ev.from === "battlefield" && ev.lki ? ev.lki.controller : owner;
        if (t.filter.controller && (controller === me) !== (t.filter.controller === "you")) return null;
        if (t.filter.permanent && !d.types.some((x) => PERMANENT_TYPES.includes(x))) return null;
        // "one or more creature cards" (Robot Domination, Moonshadow): a token isn't a card.
        const token = card?.isToken ?? ev.lki?.isToken ?? false;
        if (t.filter.token === false && token) return null;
        if (t.filter.token && !token) return null;
      }
      // From the battlefield: the permanent as it was (last known information: its counters, Reyhan), then the card it
      // became (`ref.eventObject` follows it).
      if (ev.from === "battlefield" && ev.oldId)
        return { objectId: ev.oldId, newObjectId: ev.newId ?? undefined, player: owner ?? me };
      return { objectId: ev.newId ?? undefined, player: owner ?? me };
    }
    case "step": {
      if (ev.e !== "step" || !whose(t.whose, ev.active, me)) return null;
      const main = ev.step === "main1" || ev.step === "main2";
      if (t.step === "main" ? !main : ev.step !== t.step) return null;
      const rank = s.turn.mainPhase ?? 1;
      return t.nth === undefined || (main && (t.nth === "postcombat" ? rank >= 2 : rank === t.nth))
        ? { player: ev.active }
        : null;
    }
    case "landfall": {
      if (ev.e !== "zone" || ev.to !== "battlefield") return null;
      const v = liveView(s, ev.newId);
      return v?.types.includes("Land") && v.controller === me ? { objectId: v.id, player: me } : null;
    }
    case "draw":
      // The drawn card is the object of the event (miracle: Lorehold, the Historian).
      return ev.e === "draw" &&
        whose(t.whose, ev.player, me) &&
        (t.nth === undefined || ev.nth === t.nth) &&
        !(t.exceptTurnDraw && ev.turnDraw)
        ? { player: ev.player, amount: 1, objectId: ev.objectId }
        : null;
    case "taps": {
      if (t.untap) {
        if (ev.e !== "untap") return null;
        const v = liveView(s, ev.objectId);
        return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: v.controller } : null;
      }
      if (ev.e !== "tap" || (t.byYou && ev.by !== me)) return null;
      if (t.cause && ev.cause !== t.cause) return null;
      if (t.firstThisTurn && !ev.first) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, player: v.controller } : null;
    }
    case "becomesTarget": {
      if (ev.e !== "targeted") return null;
      // "Whenever a creature you control becomes the target…" (Pawpatch Recruit): the targeted object.
      const who = t.who;
      const hit =
        who === "self"
          ? ev.targets.includes(src.id)
            ? src.id
            : undefined
          : ev.targets.find((id) => {
              if (t.players && s.players[id]) return true;
              const v = liveView(s, id);
              const zone = s.objects[id]?.zone;
              return !!v && (zone === "battlefield" || (!!t.spells && zone === "stack")) && matchWho(who, v, src);
            });
      if (!hit) return null;
      if (t.only === "abilities" && s.stack.find((x) => x.id === ev.stackId)?.kind === "spell") return null;
      if (t.by === "opponent" && ev.controller === me) return null;
      // Valiant: a spell or ability you control.
      if (t.by === "you" && ev.controller !== me) return null;
      if (who !== "self") return { objectId: hit, player: ev.controller };
      // "Whenever you cast a spell that targets this creature": a copy isn't cast.
      const byItem = s.stack.find((x) => x.id === ev.stackId);
      if (t.by === "yourSpell" && (ev.controller !== me || byItem?.kind !== "spell" || byItem.copy)) return null;
      return { objectId: ev.stackId, player: ev.controller };
    }
    case "countersPut": {
      if (ev.e !== "counters" || (t.kind && ev.kind !== t.kind) || (t.firstThisTurn && !ev.first)) return null;
      if (t.by === "you" && ev.by !== me) return null;
      const v = liveView(s, ev.objectId);
      return v && matchWho(t.who, v, src) ? { objectId: ev.objectId, amount: ev.amount, player: v.controller } : null;
    }
  }
}

/**
 * 508.5: defending player of the attacking source, otherwise of the attacking object of the event (Raid Bombardment) —
 * the attacked player or the controller of the attacked planeswalker —, fixed on triggering in the event data.
 */
function frozenDefendingPlayer(s: GameState, source: ObjectId, eventObject: ObjectId | undefined): PlayerId | undefined {
  const atk =
    s.combat?.attackers.find((a) => a.id === source) ??
    (eventObject ? s.combat?.attackers.find((a) => a.id === eventObject) : undefined);
  if (!atk) return undefined;
  return s.players[atk.defender] ? atk.defender : (s.objects[atk.defender]?.controller ?? s.lki[atk.defender]?.controller);
}

/** `only`: look only at some sources (review of the enterings at the end of a batch, 603.6a). */
export function detectTriggers(s: GameState, ev: RulesEvent, only?: (src: Source) => boolean): void {
  if (s.over) return;
  const leaving = ev.e === "zone" && ev.from === "battlefield";
  let sources: Source[];
  if (leaving) {
    sources = batchBefore ?? liveSources(s);
    // The leaving object can trigger itself ("when this creature dies").
    if (ev.lki && hasTriggers(ev.lki.abilities) && !sources.some((x) => x.id === ev.lki?.id)) {
      sources = [...sources, { id: ev.lki.id, view: ev.lki }];
    }
  } else {
    sources = liveSources(s);
    if (!only && enterBatch && ev.e === "zone" && ev.to === "battlefield")
      enterBatch.push({ ev, seen: new Set(sources.map((x) => x.id)) });
  }
  if (only) sources = sources.filter(only);
  for (const src of sources) {
    (src.view.abilities ?? []).forEach((ab, index) => {
      if (ab.kind !== "triggered") return;
      // A "from the graveyard" ability triggers only there, the others never from the graveyard.
      const zone = s.objects[src.id]?.zone;
      if (!!ab.fromGraveyard !== (zone === "graveyard")) return;
      // Command zone: emblems; of a card, only "from the command zone" (113.6, eminence).
      if (zone === "command" && !s.objects[src.id]?.isToken && !ab.fromCommand) return;
      // A spell on the stack: only "when you cast this spell" (113.6; Ugin, Eye of the Storms doesn't trigger itself
      // with "whenever you cast a colorless spell").
      if (zone === "stack" && ab.trigger.on !== "castSelf") return;
      const matched = matchTrigger(s, ev, ab.trigger, src);
      if (!matched || entryMuted(s, ev, src)) return;
      const defending = s.combat ? frozenDefendingPlayer(s, src.id, matched.objectId) : undefined;
      const data = defending ? { ...matched, defendingPlayer: defending } : matched;
      // "… for the first time each turn": the first event is noted before the "if …" condition (603.4).
      if (ab.oncePerTurn === "firstEvent") {
        const key = onceKey(src.view.defId, src.id, index);
        if (s.turn.onceFired.includes(key)) return;
        s.turn.onceFired.push(key);
      }
      // Nowhere to Run: the ward of the creatures of its controller's opponents doesn't trigger.
      if (
        ab.ward &&
        ev.e === "targeted" &&
        ev.controller !== src.view.controller &&
        src.view.types.includes("Creature") &&
        playerStatic(s, ev.controller, "ignoreOpponentsHexproofWard")
      )
        return;
      if (ab.condition && !checkCondition(s, ab.condition, src.view.controller, src.id, data.objectId, data)) return;
      if (ab.triggerCondition && !checkCondition(s, ab.triggerCondition, src.view.controller, src.id, data.objectId, data))
        return;
      // "one or more …": a single trigger per batch of simultaneous events (an effect of a resolution, a combat damage
      // step, a pass of state-based actions); outside a batch (costs paid while casting), the events share the current
      // number.
      const batch = currentBatch ?? s.batch.eventBatch ?? 0;
      if (ab.batched) {
        // The objects and players of the other events of the batch join the pending trigger (`ref.eventObjects`,
        // `ref.eventPlayers`).
        const same = s.triggers.filter((t) => t.sourceId === src.id && t.abilityIndex === index && t.batch === batch);
        if (same.length > 0) {
          if (data.objectId || data.player)
            for (const t of same) {
              const all = [t.event, ...(t.event.others ?? [])];
              const knownObject = !data.objectId || all.some((x) => x.objectId === data.objectId);
              const knownPlayer = !data.player || all.some((x) => x.player === data.player);
              if (!knownObject || !knownPlayer)
                t.event.others = [
                  ...(t.event.others ?? []),
                  {
                    ...(data.objectId ? { objectId: data.objectId } : {}),
                    ...(data.newObjectId ? { newObjectId: data.newObjectId } : {}),
                    ...(data.player ? { player: data.player } : {}),
                  },
                ];
            }
          return;
        }
      }
      // "This ability triggers only once": noted on the object.
      if (ab.once) {
        const o = s.objects[src.id];
        if (o?.used?.includes(index)) return;
        if (o) o.used = [...(o.used ?? []), index];
      }
      if (ab.oncePerTurn && ab.oncePerTurn !== "firstEvent") {
        const key = onceKey(src.view.defId, src.id, index);
        if (s.turn.onceFired.includes(key)) return;
        // "Do this only once each turn": noted when the effect is done (`doneOncePerTurn`).
        if (ab.oncePerTurn !== "ifDone") s.turn.onceFired.push(key);
      }
      // Fathom Mage: "whenever a +1/+1 counter is put on it", once for each counter (each trigger counts one).
      const each = ab.trigger.on === "countersPut" && !!ab.trigger.each;
      const perCounter = each ? Math.max(0, data.amount ?? 1) : 1;
      const event0 = each ? { ...data, amount: 1 } : data;
      // "Whenever you attack a player": one trigger for each player attacked (Echoing Assault).
      const events =
        ab.trigger.on === "attackWith" && ab.trigger.eachPlayer && ev.e === "attackWith"
          ? playersAttacked(s, ab.trigger, ev.player, src.view.controller, src.id).map((p) => ({
              ...data,
              player: p.player,
              amount: p.count,
            }))
          : [event0];
      const again = (1 + triggerDoublers(s, src, ev)) * perCounter;
      for (const event of events)
        for (let k = 0; k < again; k++) {
          s.triggers.push({
            id: newId(s, "t"),
            sourceId: src.id,
            sourceDefId: src.view.defId,
            abilityIndex: index,
            controller: src.view.controller,
            sourceSnapshot: { keywords: src.view.keywords, power: src.view.power, controller: src.view.controller },
            event,
            targets: {},
            // Granted ability (not in the definition): it is carried with the trigger.
            inline: (s.defs[src.view.defId]?.abilities[index] ?? null) === ab ? undefined : inlineOf(ab),
            ...(ab.batched ? { batch } : {}),
          });
        }
      // Firebender Ascension: an attacking creature causes, by attacking, one of its abilities to trigger.
      if (ev.e === "attack" && ev.attacker === src.id && src.view.types.includes("Creature"))
        detectTriggers(s, { e: "attackTriggered", player: src.view.controller, objectId: src.id });
    });
  }
  if (!only) detectDelayedOnEvent(s, ev);
}

/**
 * Delayed abilities on an event (603.7c: "when this creature dies this turn", "when you lose control of this Equipment
 * this turn"): the event must concern a watched object.
 */
function detectDelayedOnEvent(s: GameState, ev: RulesEvent): void {
  for (const d of [...s.delayed]) {
    if (!d.on || (d.at === "thisTurn" && (s.turn.number < d.notBeforeTurn || s.turn.number > (d.untilTurn ?? d.notBeforeTurn))))
      continue;
    const src = delayedSource(s, d);
    const data = matchTrigger(s, ev, d.on, src);
    // A watched player: the events that concern them ("deals combat damage to that player this turn", Great Train
    // Heist; PLAN-L L4).
    const byPlayer = !!(d.watch && data?.player && d.watch.includes(data.player));
    if (!data || (!data.objectId && !byPlayer)) continue;
    if (d.watch && !byPlayer && !(data.objectId && d.watch.includes(data.objectId))) continue;
    if (entryMuted(s, ev, undefined)) continue;
    const c = d.ability.condition;
    if (c && !checkCondition(s, c, d.controller, d.sourceId, data.objectId, data)) continue;
    // 603.7c: without a duration, it triggers only once.
    if (d.at === "next") s.delayed = s.delayed.filter((x) => x !== d);
    pushInline(s, d.controller, d.sourceId, d.sourceDefId, d.ability, data);
  }
}

/** The source of a delayed ability, seen from its controller (its last information, otherwise an empty object). */
function delayedSource(s: GameState, d: DelayedTrigger): Source {
  const v = liveView(s, d.sourceId) ?? s.lki[d.sourceId];
  const base: LkiSnapshot = v ?? {
    id: d.sourceId,
    defId: d.sourceDefId,
    owner: d.controller,
    controller: d.controller,
    types: [],
    subtypes: [],
    supertypes: [],
    colors: [],
    power: 0,
    toughness: 0,
    keywords: [],
    isToken: false,
  };
  return { id: d.sourceId, view: { ...base, controller: d.controller } };
}

function inlineOf(ab: TriggeredAbilityDef): InlineAbility {
  return {
    targets: ab.targets,
    effects: ab.effects,
    label: ab.label,
    ...(ab.condition ? { condition: ab.condition } : {}),
    ...(ab.modes ? { modes: ab.modes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Delayed and reflexive abilities
// ---------------------------------------------------------------------------

/** Creates a delayed ability "at the beginning of the next end step". */
export function createDelayed(
  s: GameState,
  controller: PlayerId,
  sourceId: ObjectId,
  sourceDefId: string,
  ability: InlineAbility,
  at: DelayedTiming = "nextEndStep",
  event?: { on: TriggerSpec; watch?: ObjectId[]; untilTurn?: number },
): void {
  // "… this turn": on an event, until the end of this turn.
  if (event) {
    s.delayed.push({ id: newId(s, "d"), controller, sourceId, sourceDefId, at, notBeforeTurn: s.turn.number, ability, ...event });
    return;
  }
  const lateInTurn = s.turn.step === "end" || s.turn.step === "cleanup";
  // "at your next end step": that of this turn if it is yours and it hasn't passed.
  s.delayed.push({
    id: newId(s, "d"),
    controller,
    sourceId,
    sourceDefId,
    at,
    // "at the beginning of the end step of your next turn": not this turn.
    notBeforeTurn:
      at === "yourNextEndStep" || at === "nextUpkeep" || at === "yourNextUpkeep" || lateInTurn
        ? s.turn.number + 1
        : s.turn.number,
    ability,
  });
}

/**
 * Additional triggers (family G): Fractured Realm (your permanents), Starfield Vocalist (an entering), Traveling
 * Chocobo (the entering of a land or a Bird of yours), Annie Joins Up (your legendary creatures), Roaming Throne (the
 * other creatures of the chosen type), Windcrag Siege (an attacking creature), Cloud, Midgar Mercenary (itself and its
 * Equipment, as long as it's equipped), The Masamune (deaths: the equipped creature and your emblems), Krang (draws).
 */
function triggerDoublers(s: GameState, src: Source, ev: RulesEvent): number {
  const player = src.view.controller;
  const entered = ev.e === "zone" && ev.to === "battlefield" ? (ev.newId ?? undefined) : undefined;
  // By default, the abilities of your permanents (or of a permanent that just left the battlefield).
  const permanent = (s.objects[src.id]?.zone ?? "battlefield") === "battlefield";
  return playerStatics(s, player, "triggerMod").filter(({ id, ab }) => {
    const m = ab.triggerMod;
    if (m?.effect !== "again") return false;
    if (m.on === "enter" && !entered) return false;
    // Windcrag Siege: "if a creature attacking causes a triggered ability of a permanent you control to trigger".
    if (m.on === "attack" && ev.e !== "attack" && ev.e !== "attackWith") return false;
    // Krang: "if a player drawing a card causes a triggered ability of a permanent you control to trigger".
    if (m.on === "draw" && ev.e !== "draw") return false;
    if (m.entering && !(entered && s.objects[entered] && matchesObjectFilter(s, player, entered, m.entering, id))) return false;
    if (
      m.on === "dies" &&
      !(ev.e === "zone" && ev.from === "battlefield" && ev.to === "graveyard" && ev.lki?.types.includes("Creature"))
    )
      return false;
    if (m.emblems && s.objects[src.id]?.zone === "command" && s.objects[src.id]?.isToken) return true;
    if (!m.sources) return permanent;
    const holder = id ? s.objects[id] : undefined;
    // The host of the source may have left the battlefield (its "when it dies" ability): the attachment is undone only
    // by state-based actions.
    if (m.sources.attached === "host" && holder?.attachedTo !== src.id) return false;
    return matchesView(src.view, holder ? withChosen(m.sources, holder) : m.sources, player, id);
  }).length;
}

/** At the beginning of the end step (or at end of combat): the delayed abilities whose time it is trigger. */
export function releaseDelayedTriggers(s: GameState, moment: "end" | "endCombat" | "upkeep" | "main" = "end"): void {
  const due = s.delayed.filter((d) => {
    if (d.on || d.notBeforeTurn > s.turn.number) return false;
    // Mana Sculpt: "at the beginning of your next main phase" (the postcombat one included).
    if (moment === "main") return d.at === "yourNextMain" && s.turn.active === d.controller;
    if (d.at === "yourNextMain") return false;
    if (moment === "endCombat") return d.at === "endOfCombat";
    // Firion: "at the beginning of the next upkeep".
    // Rebound: "at the beginning of your next upkeep".
    if (moment === "upkeep") return d.at === "nextUpkeep" || (d.at === "yourNextUpkeep" && s.turn.active === d.controller);
    if (d.at === "endOfCombat" || d.at === "nextUpkeep" || d.at === "yourNextUpkeep") return false;
    // "… of your next turn": only during a turn of its controller.
    return (d.at !== "yourNextEndStep" && d.at !== "yourEndStep") || s.turn.active === d.controller;
  });
  if (due.length === 0) return;
  s.delayed = s.delayed.filter((d) => !due.includes(d));
  for (const d of due) pushInline(s, d.controller, d.sourceId, d.sourceDefId, d.ability);
}

/** Puts a delayed or reflexive ability on hold (it will go on the stack at the next priority). */
export function pushInline(
  s: GameState,
  controller: PlayerId,
  sourceId: ObjectId,
  sourceDefId: string,
  ability: InlineAbility,
  event: TriggerEventData = {},
): void {
  s.triggers.push({
    id: newId(s, "t"),
    sourceId,
    sourceDefId,
    abilityIndex: -1,
    controller,
    sourceSnapshot: { keywords: [], power: 0, controller },
    event,
    targets: { ...(ability.bound ?? {}) },
    inline: ability,
  });
}

/**
 * Triggered abilities inherent to the rules, without a source object: the monarch's draw and transfer (724.2),
 * radiation (Fallout) and speed (702.179). They go through the stack like the others (they can be responded to,
 * countered); their "if…" condition is checked again at resolution (603.4).
 */
const RULES_TRIGGERS = {
  monarch: {
    name: "Monarch",
    fr: "Monarque",
    text: "At the beginning of the monarch's end step, that player draws a card.",
    frText: "Au début de l'étape de fin du monarque, ce joueur pioche une carte.",
    ability: {
      targets: [],
      effects: [{ op: "draw", who: { kind: "you" }, amount: 1 }],
      label: msg("Monarch: draw a card"),
    },
  },
  monarchSteal: {
    name: "Monarch",
    fr: "Monarque",
    text: "Whenever a creature deals combat damage to the monarch, its controller becomes the monarch.",
    frText: "Chaque fois qu'une créature inflige des blessures de combat au monarque, son contrôleur devient le monarque.",
    ability: {
      targets: [],
      // The creature of the event: its controller at resolution (its last information if it left).
      effects: [{ op: "becomeMonarch", who: { kind: "controllerOf", ref: { kind: "eventObject" } } }],
      label: msg("Monarch: the creature's controller becomes the monarch"),
    },
  },
  radiation: {
    name: "Radiation",
    fr: "Radiation",
    text:
      "At the beginning of your precombat main phase, if you have one or more rad counters, mill that many cards. For each " +
      "nonland card milled this way, you lose 1 life and a rad counter.",
    frText:
      "Au début de votre phase principale précombat, si vous avez un ou plusieurs marqueurs de radiation, meulez autant de " +
      "cartes. Pour chaque carte non-terrain meulée de cette manière, vous perdez 1 point de vie et un marqueur de radiation.",
    ability: {
      targets: [],
      effects: [{ op: "radiation" }],
      condition: { kind: "amountAtLeast", amount: { kind: "poison", counter: "rad" }, n: 1 },
      label: msg("Radiation: mill a card per counter"),
    },
  },
  speed: {
    name: "Speed",
    fr: "Vitesse",
    text:
      "Whenever one or more opponents lose life during your turn, if your speed is less than 4, increase your speed by 1. " +
      "This ability triggers only once each turn.",
    frText:
      "Chaque fois qu'un ou plusieurs adversaires perdent des points de vie pendant votre tour, si votre vitesse est " +
      "inférieure à 4, augmentez votre vitesse de 1. Cette capacité ne se déclenche qu'une fois par tour.",
    ability: {
      targets: [],
      effects: [{ op: "speed", by: 1 }],
      condition: { kind: "not", cond: { kind: "maxSpeed" } },
      label: msg("Speed: increase your speed by 1"),
    },
  },
} satisfies Record<string, { name: string; fr: string; text: string; frText: string; ability: InlineAbility }>;

export type RulesTriggerName = keyof typeof RULES_TRIGGERS;

/**
 * Puts on hold a triggered ability inherent to the rules (`RULES_TRIGGERS`), controlled by `player`. Its source is a
 * synthetic definition (`rules:<name>`, registered in `s.defs` like that of an emblem), without an object: the stack
 * shows it under its name ("Monarch", "Radiation", "Speed"). Returns false if its "if…" condition isn't met (it
 * doesn't trigger). `event`: the trigger event (the creature that damages the monarch).
 */
export function rulesTrigger(s: GameState, player: PlayerId, name: RulesTriggerName, event: TriggerEventData = {}): boolean {
  const r = RULES_TRIGGERS[name];
  const ability: InlineAbility = structuredClone(r.ability);
  const defId = `rules:${name}`;
  // 603.4: an "if…" ability triggers only if the condition is met.
  if (ability.condition && !checkCondition(s, ability.condition, player, defId)) return false;
  s.defs[defId] ??= {
    id: defId,
    name: r.name,
    typeLine: "Rules ability",
    fr: { name: r.fr, typeLine: "Capacité inhérente aux règles", text: r.frText },
    manaCost: null,
    manaCostText: "",
    colors: [],
    supertypes: [],
    types: [],
    subtypes: [],
    keywords: [],
    abilities: [],
    text: r.text,
    implemented: true,
    isToken: true,
  };
  pushInline(s, player, defId, defId, ability, event);
  return true;
}

// ---------------------------------------------------------------------------
// Putting on the stack
// ---------------------------------------------------------------------------

export function triggeredAbility(s: GameState, t: { sourceDefId: string; abilityIndex: number }): TriggeredAbilityDef | null {
  const ab = s.defs[t.sourceDefId]?.abilities[t.abilityIndex];
  return ab?.kind === "triggered" ? ab : null;
}

/** Targets of a trigger: those of the delayed/reflexive ability, of the chosen mode, or of the ability. */
export function triggerTargetSpecs(
  s: GameState,
  t: {
    sourceDefId: string;
    abilityIndex: number;
    mode?: number;
    inline?: InlineAbility;
    controller?: PlayerId;
    sourceId?: ObjectId;
    event?: TriggerEventData;
  },
): TargetSpec[] {
  const ab = t.inline ? undefined : triggeredAbility(s, t);
  const modes = t.inline ? t.inline.modes : ab?.modes;
  const specs = modes ? (modes[t.mode ?? 0]?.targets ?? []) : t.inline ? t.inline.targets : (ab?.targets ?? []);
  // Values evaluated at targeting (Moseo: "mana value X or less, where X is the life gained this turn"; Prismabasher:
  // "up to X target creatures"; Fear of Falling: "that defending player controls").
  if (!t.controller || !specs.some(needsConcrete)) return specs;
  const ctx = staticContext(s, t.controller, t.sourceId ?? "", { sourceDefId: t.sourceDefId, event: t.event });
  return specs.map((x) => concreteSpec(s, ctx, x));
}

/** Card and ability of a pending trigger (interface: reminder of the effect while choosing its targets). */
export function pendingTriggerSource(s: GameState, triggerId: string): { defId: string; label?: string } | null {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) return null;
  const label = t.inline?.label ?? triggeredAbility(s, t)?.label;
  return { defId: t.sourceDefId, ...(label ? { label } : {}) };
}

function triggerLabel(s: GameState, t: PendingTrigger): string {
  const label = t.inline?.label ?? triggeredAbility(s, t)?.label;
  return label ? msg("{card} — {label}", { card: cardRef(t.sourceDefId), label }) : cardRef(t.sourceDefId);
}

/**
 * Puts the pending triggered abilities on the stack, asking the necessary questions.
 * Returns true if something changed (ability put on the stack or question asked).
 */
export function processTriggers(s: GameState): boolean {
  if (s.triggers.length === 0) return false;
  // 800.4a: a trigger of a player who left the game (created afterwards, from last information) doesn't exist.
  if (s.triggers.some((t) => s.players[t.controller]?.lost))
    s.triggers = s.triggers.filter((t) => !s.players[t.controller]?.lost);
  let changed = false;
  // 603.3b: APNAP — the active player puts theirs first (they will resolve last).
  for (const p of apnapOrder(s)) {
    const mine = s.triggers.filter((t) => t.controller === p);
    if (mine.length === 0) continue;
    if (mine.length > 1 && !mine.every((t) => t.ordered)) {
      ask(
        s,
        p,
        {
          type: "order",
          intent: "triggerOrder",
          prompt: msg("Order of resolution of your triggered abilities (the first one resolves first)"),
          items: mine.map((t) => t.id),
          labels: Object.fromEntries(mine.map((t) => [t.id, triggerLabel(s, t)])),
          suggested: mine.map((t) => t.id),
          // The autopilot chooses the suggested order, except in full control or when the player holds priority and the
          // order matters (`autopilot.ts`); the order is then offered to the player, prefilled.
          autoOk: true,
        },
        { kind: "triggerOrder", player: p },
      );
      return true;
    }
    // In the desired order of resolution, the last one goes on the stack first.
    for (const t of [...mine].reverse()) {
      if (!chooseTriggerMode(s, t)) return true; // question asked
      if (!chooseTriggerTargets(s, t)) return true;
      s.triggers = s.triggers.filter((x) => x.id !== t.id);
      const specs = triggerTargetSpecs(s, t);
      if (!t.inline && !triggeredAbility(s, t)) continue;
      // 603.3d: an ability without a legal target for a required target is removed.
      if (specs.some((spec) => !spec.optional && (t.targets[spec.id]?.length ?? 0) === 0)) continue;
      // 702.174: the opponent of a permanent's promised gift travels with its abilities ("gift promised"), even if the
      // permanent leaves the battlefield before they resolve.
      const cast = s.objects[t.sourceId]?.cast;
      const item: StackItem = {
        id: newId(s, "a"),
        kind: "ability",
        controller: t.controller,
        sourceId: t.sourceId,
        sourceDefId: t.sourceDefId,
        abilityIndex: t.abilityIndex,
        mode: t.mode ?? 0,
        targets: t.targets,
        x: 0,
        kicked: false,
        sourceSnapshot: t.sourceSnapshot,
        event: t.event,
        inline: t.inline,
        ...(cast?.giftTo ? { cast: { from: cast.from, giftTo: cast.giftTo } } : {}),
      };
      s.stack.push(item);
      s.priority.passes = 0;
      changed = true;
      const all = Object.values(item.targets).flat();
      if (all.length) rulesEvent(s, { e: "targeted", stackId: item.id, controller: item.controller, targets: all });
      checkCrime(s, item.controller, all);
      emit({
        type: "trigger",
        player: t.controller,
        stackId: item.id,
        defId: t.sourceDefId,
        targets: specs.flatMap((spec) => t.targets[spec.id] ?? []),
      });
    }
  }
  return changed;
}

/** Modal ability: the controller chooses the mode (603.3c). Returns false if a question was asked. */
function chooseTriggerMode(s: GameState, t: PendingTrigger): boolean {
  if (t.mode !== undefined) return true;
  // Reflexive or granted ability: its modes travel with it.
  const ab = t.inline ? undefined : triggeredAbility(s, t);
  const modes = t.inline ? t.inline.modes : ab?.modes;
  if (!modes) return true;
  // Only the modes whose required targets exist are offered (and, for Demonic Pact, not chosen yet).
  const o = s.objects[t.sourceId];
  const used =
    !ab?.uniqueModes || (ab.uniqueModes === "turn" && o?.usedModes?.turn !== s.turn.number) ? [] : (o?.usedModes?.modes ?? []);
  const possible = modes
    .map((m, i) => ({ m, i }))
    .filter(({ i }) => !used.includes(i))
    // Bumi, King of Three Trials: a conditional mode ("up to X modes") is offered only if it is met.
    .filter(({ m }) => !m.condition || checkCondition(s, m.condition, t.controller, t.sourceId))
    .filter(({ m }) => m.targets.every((spec) => spec.optional || legalTargets(s, t.controller, spec).length > 0));
  if (possible.length <= 1) {
    t.mode = possible[0]?.i ?? modes.findIndex((_, i) => !used.includes(i));
    markModeUsed(s, t);
    return true;
  }
  ask(
    s,
    t.controller,
    {
      type: "pick",
      intent: "triggerMode",
      prompt: msg("{source}: choose a mode", { source: triggerLabel(s, t) }),
      options: possible.map(({ i }) => String(i)),
      labels: Object.fromEntries(possible.map(({ m, i }) => [String(i), m.label ?? msg("Mode {n}", { n: i + 1 })])),
      min: 1,
      max: 1,
      suggested: [String(possible[0]?.i ?? 0)],
    },
    { kind: "triggerMode", trigger: t.id },
  );
  return false;
}

/** Chooses the targets of a trigger; returns false if a question was asked. */
function chooseTriggerTargets(s: GameState, t: PendingTrigger): boolean {
  for (const spec of triggerTargetSpecs(s, t)) {
    if (t.targets[spec.id] !== undefined) continue;
    const taken = new Set((spec.otherThan ?? []).flatMap((o) => t.targets[o] ?? []));
    // "another card": the creature of the event, under its old as well as its new id (dead: its card).
    if (spec.notEventObject && t.event?.objectId) taken.add(t.event.objectId);
    if (spec.notEventObject && t.event?.newObjectId) taken.add(t.event.newObjectId);
    // "Target player … the cards in their graveyard": only those of the player chosen for the other "target" word.
    const of = spec.of?.kind === "target" ? (t.targets[spec.of.id] ?? []).map((x) => holderOf(s, x)) : undefined;
    const legal = legalTargets(s, t.controller, spec, t.sourceId).filter(
      (id) => !taken.has(id) && (!of || of.includes(holderOf(s, id))),
    );
    const count = spec.count ?? 1;
    // "up to X targets" with X = 0: no target.
    if (count === 0) {
      t.targets[spec.id] = [];
      continue;
    }
    // "one to three targets" (`target.between`): at least `minCount` (Armament Dragon, Glint Weaver).
    const min = spec.optional ? 0 : (spec.minCount ?? count);
    // "controlled by different players": as many different players as required targets are needed.
    const holdersOf = (id: string) => {
      const o = s.objects[id];
      return o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
    };
    const available = spec.differentPlayers ? new Set(legal.map(holdersOf)).size : legal.length;
    if (legal.length === 0 || available < min) {
      t.targets[spec.id] = [];
      continue;
    }
    if (legal.length === count && min === count && !spec.samePlayer && !spec.differentPlayers) {
      t.targets[spec.id] = legal;
      continue;
    }
    const first = suggestTarget(s, t.controller, legal);
    let group: { kind: "same" | "different"; holders: Record<string, string> } | undefined;
    if (spec.samePlayer || spec.differentPlayers) {
      const holders: Record<string, string> = {};
      for (const id of legal) {
        const o = s.objects[id];
        holders[id] = o ? (o.zone === "battlefield" ? o.controller : o.owner) : id;
      }
      group = { kind: spec.samePlayer ? "same" : "different", holders };
    }
    const suggested: string[] = [];
    // Phoenix, Warden of Fire: "with total mana value 6 or less".
    const mv = (id: string) => (s.objects[id] ? (snapshot(s, id).manaValue ?? 0) : 0);
    let total = 0;
    for (const id of [first, ...legal.filter((x) => x !== first)]) {
      if (suggested.length >= count) break;
      if (spec.maxTotalManaValue !== undefined && total + mv(id) > spec.maxTotalManaValue) continue;
      total += mv(id);
      if (group?.kind === "same" && suggested.length && group.holders[suggested[0] as string] !== group.holders[id]) continue;
      if (group?.kind === "different" && suggested.some((x) => group?.holders[x] === group?.holders[id])) continue;
      suggested.push(id);
    }
    ask(
      s,
      t.controller,
      {
        type: "pick",
        intent: "triggerTarget",
        prompt:
          count > 1
            ? msg("{source}: choose up to {n} targets — {target}", {
                source: triggerLabel(s, t),
                n: count,
                target: spec.label ?? msg("a target"),
              })
            : msg("{source}: choose {target}", { source: triggerLabel(s, t), target: spec.label ?? msg("a target") }),
        options: legal,
        min: Math.min(min, legal.length),
        max: count,
        suggested,
        group,
      },
      { kind: "triggerTarget", trigger: t.id, spec: spec.id },
    );
    return false;
  }
  return true;
}

/** Target suggested by default: the best opposing creature, otherwise an opponent, otherwise the first option. */
function suggestTarget(s: GameState, controller: PlayerId, legal: string[]): string {
  const opps = new Set(opponentsOf(s, controller));
  const theirs = legal
    .filter((id) => onBattlefield(s, id) && opps.has(obj(s, id).controller))
    .sort((a, b) => chars(s, b).power - chars(s, a).power);
  return theirs[0] ?? legal.find((id) => opps.has(id)) ?? (legal[0] as string);
}

export function answerTriggerOrder(s: GameState, player: PlayerId, order: string[]): void {
  const mine = new Map(s.triggers.filter((t) => t.controller === player).map((t) => [t.id, t]));
  const others = s.triggers.filter((t) => t.controller !== player);
  const ordered = order.map((id) => mine.get(id)).filter((t): t is PendingTrigger => !!t);
  for (const t of ordered) t.ordered = true;
  s.triggers = [...others, ...ordered];
}

export function answerTriggerTarget(s: GameState, triggerId: string, specId: string, values: string[]): void {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) throw new RulesError(msg("Triggered ability not found"));
  const spec = triggerTargetSpecs(s, t).find((x) => x.id === specId);
  if (!spec) throw new RulesError(msg("Unknown target"));
  if (
    spec.notEventObject &&
    ((t.event?.objectId && values.includes(t.event.objectId)) || (t.event?.newObjectId && values.includes(t.event.newObjectId)))
  )
    throw new RulesError(msg("A target other than the creature of the event"));
  try {
    t.targets[specId] =
      validateTargets(
        s,
        t.controller,
        [{ ...spec, optional: true }],
        { ...t.targets, [specId]: values },
        { sourceId: t.sourceId },
      )[specId] ?? [];
  } catch (e) {
    rethrowAsRules(e);
  }
}

export function answerTriggerMode(s: GameState, triggerId: string, mode: number): void {
  const t = s.triggers.find((x) => x.id === triggerId);
  if (!t) throw new RulesError(msg("Triggered ability not found"));
  t.mode = mode;
  markModeUsed(s, t);
}

/** "Choose a mode that hasn't been chosen": the mode is remembered on the source. */
function markModeUsed(s: GameState, t: PendingTrigger): void {
  if (t.inline || t.mode === undefined || t.mode < 0 || !triggeredAbility(s, t)?.uniqueModes) return;
  const o = s.objects[t.sourceId];
  if (!o) return;
  // "… this turn": the list starts over every turn.
  const turn = triggeredAbility(s, t)?.uniqueModes === "turn" ? s.turn.number : o.usedModes?.turn;
  const modes = turn === o.usedModes?.turn ? (o.usedModes?.modes ?? []) : [];
  o.usedModes = { modes: [...modes, t.mode], ...(turn !== undefined ? { turn } : {}) };
}

/**
 * 700.13: committing a crime — targeting an opponent, an object they control (permanent, spell, ability) or a card in
 * their graveyard.
 */
export function checkCrime(s: GameState, player: PlayerId, targets: string[]): void {
  const opponent = (p: PlayerId | undefined) => !!p && p !== player && !!s.players[p];
  const crime = targets.some((id) => {
    if (s.players[id]) return opponent(id);
    const o = s.objects[id];
    if (o?.zone === "battlefield") return opponent(o.controller);
    if (o?.zone === "graveyard") return opponent(o.owner);
    const item = s.stack.find((x) => x.id === id);
    return opponent(item?.controller);
  });
  if (!crime) return;
  // Turn log: "if you've committed a crime this turn" conditions.
  logTurnEvent(s, { e: "crime", player });
  rulesEvent(s, { e: "crime", player });
}
