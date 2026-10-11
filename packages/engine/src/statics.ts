import { evalAmount, staticContext } from "./effects";
import type { AmountMod } from "./modifiers";
import { alivePlayers, chars, commandZoneAbilities, isCreature, newId, nextTimestamp, obj, opponentsOf, snapshot } from "./state";
import { matchesObjectFilter, matchesView, withChosen } from "./targets";
import { checkCondition } from "./triggers";
import type {
  AbilityDef,
  Amount,
  EventReplacement,
  GameState,
  ObjectId,
  PlayerEffect,
  PlayerId,
  PlayerStaticAbilityDef,
  PreventionAbilityDef,
} from "./types";

type Entry = { id: ObjectId; ab: AbilityDef };

/**
 * Index of the abilities by controller, recomputed only when the state changes (same key as the layer cache); player
 * statics are also stored there by key, and event replacements by kind of event (PLAN-C, C15).
 */
interface Index {
  key: string;
  byPlayer: Map<PlayerId, Entry[]>;
  statics: Map<PlayerId, Map<string, Entry[]>>;
  replacements: Map<string, { p: PlayerId; e: Entry }[]>;
}
const cache = new WeakMap<GameState, Index>();

/** State copy: the copy takes over the index of the original, validated by its key (see `carryLayerCache`). */
export function carryStaticsCache(from: GameState, to: GameState): void {
  const hit = cache.get(from);
  if (hit) cache.set(to, hit);
}
const NOT_KEYS = new Set(["kind", "label", "condition", "affects"]);

function current(s: GameState): Index {
  const key = `${s.version}|${s.turn.number}|${s.turn.active}|${s.turn.step}`;
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit;
  const byPlayer = new Map<PlayerId, Entry[]>();
  const add = (p: PlayerId, e: Entry) => {
    const list = byPlayer.get(p);
    if (list) list.push(e);
    else byPlayer.set(p, [e]);
  };
  for (const id of s.battlefield) {
    const p = obj(s, id).controller;
    for (const ab of chars(s, id).abilities) add(p, { id, ab });
  }
  for (const p of s.playerOrder) {
    // Command zone: emblems (a commander waiting to be cast has no active ability, 113.6).
    for (const id of s.players[p]?.command ?? []) {
      for (const ab of commandZoneAbilities(s, id)) add(p, { id, ab });
    }
  }
  const statics = new Map<PlayerId, Map<string, Entry[]>>();
  const replacements = new Map<string, { p: PlayerId; e: Entry }[]>();
  // Player statics: stored for each player they concern (their controller, their opponents, or all).
  const keysOf = (p: PlayerId) => {
    let m = statics.get(p);
    if (!m) {
      m = new Map();
      statics.set(p, m);
    }
    return m;
  };
  for (const [p, list] of byPlayer) {
    keysOf(p);
    for (const e of list) {
      if (e.ab.kind === "playerStatic") {
        const affected = affectedPlayers(s, p, e.id, e.ab.affects);
        for (const k of Object.keys(e.ab)) {
          if (NOT_KEYS.has(k) || !(e.ab as unknown as Record<string, unknown>)[k]) continue;
          for (const q of affected) {
            const byKey = keysOf(q);
            const l = byKey.get(k);
            if (l) l.push(e);
            else byKey.set(k, [e]);
          }
        }
      } else if (e.ab.kind === "eventReplacement") {
        const l = replacements.get(e.ab.event);
        if (l) l.push({ p, e });
        else replacements.set(e.ab.event, [{ p, e }]);
      }
    }
  }
  const out = { key, byPlayer, statics, replacements };
  cache.set(s, out);
  return out;
}

/** Players affected by a player static controlled by `p` (`affects`). */
function affectedPlayers(s: GameState, p: PlayerId, sourceId: ObjectId, affects: PlayerStaticAbilityDef["affects"]): PlayerId[] {
  switch (affects) {
    case "each":
      return alivePlayers(s);
    case "opponents":
      return opponentsOf(s, p);
    case "enchanted": {
      // Grievous Wound: the player the source enchants (none if it is not attached to a player).
      const host = s.objects[sourceId]?.attachedTo;
      return host && s.players[host] && !s.players[host]?.lost ? [host] : [];
    }
    default:
      return [p];
  }
}

function index(s: GameState): Map<PlayerId, Entry[]> {
  return current(s).byPlayer;
}

/** Abilities of the permanents (and emblems) this player controls, with their source. */
export function controlledAbilitiesWithSource(s: GameState, player: PlayerId): Entry[] {
  return index(s).get(player) ?? [];
}

export type PlayerStaticKey = keyof Omit<PlayerStaticAbilityDef, "kind" | "label" | "condition">;

/** Effects on this player still in force (created by resolutions, `s.playerEffects`). */
function liveEffects(s: GameState, player: PlayerId): PlayerEffect[] {
  return s.playerEffects.filter(
    (e) =>
      e.player === player && (e.until === null || s.turn.number <= e.until) && (e.from === undefined || s.turn.number >= e.from),
  );
}

/**
 * Player statics in force for this player: those of the permanents and emblems they control whose condition is met,
 * then the effects on them (`s.playerEffects`, without a source). The only access to player statics: never filter
 * `controlledAbilitiesWithSource` on `kind === "playerStatic"` by hand (condition and effects forgotten).
 */
export function playerStatics(
  s: GameState,
  player: PlayerId,
  /** Only those that carry this key; the condition of the others is not evaluated (a condition can read a static). */
  key: PlayerStaticKey,
): { id?: ObjectId; ab: PlayerStaticAbilityDef; timestamp?: number }[] {
  const out: { id?: ObjectId; ab: PlayerStaticAbilityDef; timestamp?: number }[] = [];
  for (const { id, ab } of current(s).statics.get(player)?.get(key) ?? []) {
    // The condition is read from the point of view of the source's controller (`affects`: the static affects other players).
    const controller = (id && s.objects[id]?.controller) || player;
    if (ab.kind === "playerStatic" && (!ab.condition || checkCondition(s, ab.condition, controller, id))) out.push({ id, ab });
  }
  for (const e of liveEffects(s, player)) if (e.ability[key]) out.push({ ab: e.ability, timestamp: e.timestamp });
  return out;
}

/** A numeric event replacement in force: its controller, its source (printed ability) or its effect (shield). */
export interface ActiveReplacement {
  r: EventReplacement;
  controller: PlayerId;
  sourceId?: ObjectId;
  /** Player effect that carries it: a one-shot shield (615.7) is removed when it applies. */
  effectId?: string;
  once?: boolean;
}

/**
 * "That much plus N" of a replacement (`modify.add`), evaluated from its point of view (`ref.self`: its source, Fated
 * Firepower, Hawkeye); an amount that is not a written number is floored at 0 ("that much as its power"). 0: nothing to add.
 */
export function replacementAdd(s: GameState, a: ActiveReplacement): number {
  const add = a.r.modify.add;
  if (add === undefined || typeof add === "number") return add ?? 0;
  return Math.max(0, evalAmount(s, staticContext(s, a.controller, a.sourceId ?? ""), add));
}

/** "At least N" of a replacement (`modify.atLeast`, Ojer Axonil: its power), evaluated from its point of view. */
export function replacementAtLeast(s: GameState, a: ActiveReplacement): number | undefined {
  const min = a.r.modify.atLeast;
  return min === undefined ? undefined : evalAmount(s, staticContext(s, a.controller, a.sourceId ?? ""), min);
}

/**
 * Numeric event replacements in force (R1): `eventReplacement` abilities of the permanents and emblems of each player
 * still in the game (condition met), then player effects that carry a `replacement`.
 */
export function eventReplacements(s: GameState, event: EventReplacement["event"]): ActiveReplacement[] {
  const out: ActiveReplacement[] = [];
  const printed = current(s).replacements.get(event) ?? [];
  for (const p of s.playerOrder) {
    if (s.players[p]?.lost) continue;
    for (const { p: q, e } of printed) {
      const { id, ab } = e;
      if (q === p && ab.kind === "eventReplacement" && (!ab.condition || checkCondition(s, ab.condition, p, id)))
        out.push({ r: ab, controller: p, sourceId: id });
    }
    for (const e of liveEffects(s, p)) {
      const r = e.ability.replacement;
      if (r?.event === event) out.push({ r, controller: p, effectId: e.id, once: e.once });
    }
  }
  return out;
}

/**
 * Does the replacement apply to this player or this permanent? `to` is relative to the replacement's controller (the
 * permanent counts for its controller); `toFilter`: a matching permanent.
 */
export function recipientMatches(s: GameState, a: ActiveReplacement, target: string): boolean {
  const r = a.r;
  const player = !!s.players[target];
  const victim = player ? target : s.objects[target]?.controller;
  if (!victim) return false;
  if (r.toFilter && (player || !matchesObjectFilter(s, a.controller, target, r.toFilter, a.sourceId))) return false;
  switch (r.to) {
    case "you":
      return player && target === a.controller;
    case "yourSide":
      return victim === a.controller;
    case "opponent":
      return player && opponentsOf(s, a.controller).includes(target);
    case "opponentSide":
      return opponentsOf(s, a.controller).includes(victim);
    default:
      return true;
  }
}

/** The player concerned by a replacement, without a permanent filter (`to` seen from the replacement's controller). */
export function playerSide(s: GameState, a: ActiveReplacement, player: PlayerId): boolean {
  switch (a.r.to) {
    case "you":
    case "yourSide":
      return player === a.controller;
    case "opponent":
    case "opponentSide":
      return opponentsOf(s, a.controller).includes(player);
    default:
      return true;
  }
}

/**
 * Modifications of a numeric event (R1, 616.1): the replacements in force that apply (`applies`), as "that much plus N"
 * and "twice that"; `prevented`: one of them prevents the event (Mornsong Aria: "players can't draw cards"). One-shot
 * shields that apply are removed.
 */
export function quantityMods(
  s: GameState,
  event: EventReplacement["event"],
  applies: (a: ActiveReplacement) => boolean,
): { mods: AmountMod[]; prevented: boolean } {
  const mods: AmountMod[] = [];
  let prevented = false;
  for (const a of eventReplacements(s, event)) {
    if (!applies(a)) continue;
    if (a.r.modify.prevent) prevented = true;
    const add = replacementAdd(s, a);
    if (add) mods.push({ add });
    if (a.r.modify.times) mods.push({ times: a.r.modify.times });
    consumeReplacement(s, a);
  }
  return { mods, prevented };
}

/** Removes a "the next time" shield that just applied (615.7). */
export function consumeReplacement(s: GameState, a: ActiveReplacement): void {
  if (!a.once || !a.effectId) return;
  s.playerEffects = s.playerEffects.filter((e) => e.id !== a.effectId);
  s.version += 1;
}

export function playerStatic(s: GameState, player: PlayerId, key: PlayerStaticKey): boolean {
  return playerStatics(s, player, key).length > 0;
}

/**
 * The Master, Multiplied (`tokenShield`): a creature token that a triggered ability of its controller, now resolving,
 * can't make them sacrifice or exile (myriad, "sacrifice it at the beginning of the next end step").
 */
export function tokenShielded(s: GameState, id: ObjectId): boolean {
  const o = s.objects[id];
  const item = s.resolving?.item;
  if (!o?.isToken || o.zone !== "battlefield" || item?.kind !== "ability" || !item.event || item.controller !== o.controller)
    return false;
  return isCreature(s, id) && playerStatic(s, o.controller, "tokenShield");
}

/**
 * Can the player not lose the game (104.3)? `reason: "life"`: for having 0 or less life (704.5a), which
 * `cantLose: "life"` is enough to prevent (Marina Vendrell's Grimoire); otherwise only `cantLose: true` (Herald of
 * Eternal Dawn), which also prevents their opponents from winning.
 */
export function cantLose(s: GameState, player: PlayerId, reason?: "life"): boolean {
  return playerStatics(s, player, "cantLose").some(({ ab }) => ab.cantLose === true || (reason && ab.cantLose === reason));
}

/** Does the player skip their draw step, or the extra turns they would begin (500.11)? */
export function skips(s: GameState, player: PlayerId, what: "drawStep" | "extraTurns"): boolean {
  return playerStatics(s, player, "skips").some(({ ab }) => ab.skips === what);
}

/**
 * Can damage not be prevented (Sunspine Lynx; Frenzied Baloth: combat damage)? These statics concern all players: one
 * player having one is enough.
 */
export function damageUnpreventable(s: GameState, combat: boolean): boolean {
  return s.playerOrder.some((p) =>
    playerStatics(s, p, "damageUnpreventable").some(({ ab }) => ab.damageUnpreventable === true || combat),
  );
}

/**
 * Can the player look at this hidden object at any time (`lookAt`)? The top card of their library (Vizier of the
 * Menagerie, and any permission to play from the top of the library, family C) or a face-down creature of an opponent
 * (Found Footage; 708.5: its controller can always see it).
 */
export function mayLookAt(s: GameState, viewer: PlayerId, id: ObjectId): boolean {
  const o = s.objects[id];
  if (!o) return false;
  if (o.zone === "library") {
    if (s.players[viewer]?.library[0] !== id) return false;
    return (
      playerStatics(s, viewer, "lookAt").some(({ ab }) => ab.lookAt === "libraryTop") ||
      playerStatics(s, viewer, "playFrom").some(({ ab }) => ab.playFrom?.zone === "libraryTop")
    );
  }
  return (
    o.zone === "battlefield" &&
    !!o.faceDown &&
    o.controller !== viewer &&
    isCreature(s, id) &&
    playerStatics(s, viewer, "lookAt").some(({ ab }) => ab.lookAt === "faceDown")
  );
}

/**
 * 502.3: how this permanent untaps during its controller's untap step, according to the `untap` replacements limited
 * to that step (`untapStep`): `true`, it doesn't untap; `"may"`, its controller may choose not to untap it (Hedge
 * Whisperer); `undefined`, normally.
 */
export function untapStepRule(s: GameState, id: ObjectId): true | "may" | undefined {
  let rule: true | "may" | undefined;
  for (const a of eventReplacements(s, "untap")) {
    if (!a.r.untapStep || !a.r.modify.prevent || !recipientMatches(s, a, id)) continue;
    if (a.r.untapStep === true) return true;
    rule = "may";
  }
  return rule;
}

/** Can the player not lose life ("your life total can't change")? */
export function lifeLossPrevented(s: GameState, player: PlayerId): boolean {
  return eventReplacements(s, "lifeLoss").some((a) => a.r.modify.prevent && recipientMatches(s, a, player));
}

/**
 * Life a player can pay (119.4): their total, or none if they can't lose life (119.8, Teferi's Protection). Paying 0
 * life is always possible.
 */
/** Life of a "pay N life" cost (`CostDef.payLife`), an amount evaluated for the source (War Room). */
export function lifeCost(s: GameState, player: PlayerId, source: ObjectId, n: Amount | undefined): number {
  if (n === undefined) return 0;
  return typeof n === "number" ? n : Math.max(0, evalAmount(s, staticContext(s, player, source), n));
}

export function payableLife(s: GameState, player: PlayerId): number {
  const life = s.players[player]?.life ?? 0;
  return lifeLossPrevented(s, player) ? Math.min(life, 0) : life;
}

/**
 * Does the player have protection from a source controlled by `from` (702.16)? From everything (702.16j), or from their
 * opponents (a source of another player).
 */
export function playerProtectedFrom(
  s: GameState,
  player: PlayerId,
  from: PlayerId | undefined,
  /** The source (Serra's Emissary: protection from the chosen card type). */
  sourceId?: ObjectId,
): boolean {
  return playerStatics(s, player, "protection").some(({ id, ab }) => {
    const p = ab.protection;
    if (p === "everything") return true;
    if (p === "opponents") return from !== player;
    if (!p || !sourceId) return false;
    const holder = id ? s.objects[id] : undefined;
    const v = s.objects[sourceId] ? snapshot(s, sourceId) : s.lki[sourceId];
    return !!v && matchesView(v, holder ? withChosen(p, holder) : p, player, id);
  });
}

/** Sum of a numeric player static (a boolean counts as 1): controlled abilities and effects in force. */
export function playerStaticTotal(s: GameState, player: PlayerId, key: PlayerStaticKey): number {
  let n = 0;
  for (const { ab } of playerStatics(s, player, key)) {
    const v = ab[key];
    n += typeof v === "number" ? v : v ? 1 : 0;
  }
  return n;
}

/** Values of a player static carried by the effects in force ("can't attack this player"). */
export function playerEffectValues<K extends PlayerStaticKey>(
  s: GameState,
  player: PlayerId,
  key: K,
): NonNullable<PlayerStaticAbilityDef[K]>[] {
  return liveEffects(s, player)
    .map((e) => e.ability[key])
    .filter((v): v is NonNullable<PlayerStaticAbilityDef[K]> => v !== undefined && v !== null && v !== false);
}

/** Creates an effect on a player until the end of turn `until` (null: the whole game). */
export function addPlayerEffect(
  s: GameState,
  player: PlayerId,
  ability: Omit<PlayerStaticAbilityDef, "kind">,
  until: number | null,
  once = false,
  from?: number,
): void {
  s.playerEffects.push({
    id: newId(s, "pe"),
    player,
    ability: { kind: "playerStatic", ...ability },
    until,
    ...(from !== undefined ? { from } : {}),
    once: once || undefined,
    timestamp: nextTimestamp(s),
  });
  s.version += 1; // characteristics can depend on it
}

/**
 * Removes the first one-shot effect of this player that carries `key` (with this value, if given); true if there was
 * one.
 */
export function consumePlayerEffect<K extends PlayerStaticKey>(
  s: GameState,
  player: PlayerId,
  key: K,
  value?: PlayerStaticAbilityDef[K],
): boolean {
  const live = liveEffects(s, player).find(
    (e) => e.once && !!e.ability[key] && (value === undefined || e.ability[key] === value),
  );
  if (!live) return false;
  s.playerEffects = s.playerEffects.filter((e) => e !== live);
  // Static abilities or P/T can depend on the player's effects (like `consumeReplacement`).
  s.version += 1;
  return true;
}

/** Static preventions of the permanents of all players, with their controller and their source. */
export function preventions(s: GameState): { controller: PlayerId; sourceId: ObjectId; ab: PreventionAbilityDef }[] {
  const out: { controller: PlayerId; sourceId: ObjectId; ab: PreventionAbilityDef }[] = [];
  for (const [controller, list] of index(s)) {
    for (const { id, ab } of list)
      if (ab.kind === "prevention" && s.objects[id]?.zone === "battlefield") out.push({ controller, sourceId: id, ab });
  }
  return out;
}
