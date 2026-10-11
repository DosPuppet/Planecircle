/**
 * Effect interpreter. Effects are data (see types.ts): the state stays serializable,
 * and a resolution can be suspended on a player choice and then resumed.
 */

import { type DamageSource, payLife, removeFromCombat, sourceFromObject } from "./actions";
import { castOption } from "./cardDef";
import { cardRef } from "./choices";
import { colorIdentity } from "./identity";
import { copiedDefId, hasType } from "./layers";
import { manaValue } from "./mana";
import { nameList, shareName } from "./names";
import { opHandler, registeredOps } from "./opRegistry";
import type { EntersContext } from "./replacement";
import { spellView } from "./stack";
import {
  alivePlayers,
  bump,
  castInfoOf,
  changeCounters,
  chars,
  commanderOf,
  emit,
  endDetachedEffects,
  isCreature,
  isPlayer,
  moveObject,
  newId,
  nextTimestamp,
  onBattlefield,
  opponentsOf,
  rulesEvent,
  shuffle,
  snapshot,
} from "./state";
import { playerStatic, playerStatics } from "./statics";
import {
  ALL_CREATURE_TYPES,
  matchesCard,
  matchesObjectFilter,
  matchesView,
  NON_CREATURE_SUBTYPES,
  protectedFrom,
  resolveFilter,
  sourceView,
} from "./targets";
import { msg } from "./text";
import { checkCondition, mostLife, pushInline } from "./triggers";
import { countTurnEvents } from "./turnlog";
import type {
  AggregateProperty,
  Amount,
  ChoiceRequest,
  ChoiceValue,
  Condition,
  CostPaid,
  Effect,
  GameState,
  Keyword,
  LayerMods,
  LkiSnapshot,
  ManaCost,
  MoveSpec,
  ObjectFilter,
  ObjectId,
  PlayerId,
  Ref,
  Resolution,
  TargetSpec,
  TriggerEventData,
  Zone,
} from "./types";
import { BASIC_LAND_TYPES, PERMANENT_TYPES } from "./types";

export interface EffectContext {
  controller: PlayerId;
  /** Spell: the object on the stack. Ability: the source permanent. */
  sourceId: ObjectId;
  sourceDefId: string;
  /** Last known information of the source. */
  sourceSnapshot: { keywords: Keyword[]; power: number };
  /** Targets still legal at resolution. */
  targets: Record<string, string[]>;
  x: number;
  kicked: boolean;
  /** Triggered ability: data of the trigger event. */
  event?: TriggerEventData;
  /** Values stored during the resolution (see `store`). */
  vars?: Record<string, ChoiceValue[]>;
  /** Objects paid for the cost of what is resolving; creature returned to hand for Web-slinging. */
  paid?: CostPaid & { bounced?: ObjectId[] };
}

/**
 * Filter values that depend on what is resolving: comparisons (`resolveCompare` with this context: "… X or less", the
 * X of the ability or the spell, Day of Black Sun, Doppelgang; "with greater power than the targeted creature", Fell
 * the Mighty); "that shares a creature type with it" (Shared Animosity: the object of the event).
 */
export function withX(s: GameState, f: ObjectFilter, ctx: EffectContext): ObjectFilter {
  // "… with a different name than that spell" (Tibalt's Trickery): a designated object read inside `not`.
  if (f.not?.shares) f = { ...f, not: withX(s, f.not, ctx) };
  const shares = f.shares;
  if (shares) f = { ...f, shares: undefined };
  if (shares?.what === "creatureType") {
    // Several designated objects (two commanders): a creature type of one of them is enough.
    const vs = resolveRef(s, ctx, shares.with)
      .filter((x) => s.objects[x])
      .map((x) => snapshot(s, x));
    const all = vs.some((v) => v.keywords.includes("changeling") || v.subtypes.includes(ALL_CREATURE_TYPES));
    const types = [...new Set(vs.flatMap((v) => v.subtypes.filter((st) => !NON_CREATURE_SUBTYPES.has(st))))];
    // A changeling shares each of its types with any creature (approximated: any creature).
    f = all ? { ...f, types: [...(f.types ?? []), "Creature"] } : { ...f, anySubtype: types };
  }
  if (shares?.what === "cardType") {
    // A sacrificed permanent: its last known information.
    const types = new Set(
      resolveRef(s, ctx, shares.with).flatMap((x) =>
        s.objects[x]?.zone === "battlefield"
          ? chars(s, x).types
          : (s.lki[x]?.types ?? s.defs[s.objects[x]?.defId ?? ""]?.types ?? []),
      ),
    );
    // Nothing designated: nothing matches (an empty `types` would not constrain the type).
    f = types.size ? { ...f, types: [...types] } : { ...f, not: {} };
  }
  if (shares?.what === "color") {
    // "That share a color with it" (Raiding Schemes): any color of the designated objects.
    const colors = [...new Set(resolveRef(s, ctx, shares.with).flatMap((x) => viewOf(s, x)?.colors ?? []))];
    f = colors.length ? { ...f, colors } : { ...f, not: {} };
  }
  // "… attacking that player" (Namor, Atlantean King): the designated players.
  if (f.attacking && typeof f.attacking === "object" && !Array.isArray(f.attacking))
    f = { ...f, attacking: resolveRef(s, ctx, f.attacking).filter((p) => isPlayer(s, p)) };
  if (shares?.what === "name") {
    const id = resolveRef(s, ctx, shares.with).find((x) => s.objects[x] || s.lki[x]);
    // Its computed (or last known) name: "A // B" for a split card, which shares each of its names.
    const name = id ? ((s.objects[id] ? chars(s, id).name : s.lki[id]?.name) ?? "") : "";
    // Without a designated object, nothing matches.
    f = { ...f, name: name || "\u0000" };
  }
  return resolveCompare(s, f, ctx.sourceId, ctx);
}

/**
 * The only resolver of the dynamic comparisons of filters (`ObjectFilter.compare`, PLAN-H H10): each amount `to` is
 * replaced by its value. During a resolution (`withX`), it is evaluated with the context of what is resolving (its X,
 * its targets, its stored values); elsewhere (`resolveFilter`: targets, statics, triggers, permissions), from the
 * point of view of the source alone, and the X is then that of the permanent (the X of the spell that put it onto the
 * battlefield, 0 without X).
 */
export function resolveCompare(s: GameState, f: ObjectFilter, sourceId?: ObjectId, ctx?: EffectContext): ObjectFilter {
  if (!f.compare?.some((c) => typeof c.to === "object")) return f;
  const c =
    ctx ??
    ({
      ...staticContext(s, (sourceId && (s.objects[sourceId]?.controller ?? s.lki[sourceId]?.controller)) || "", sourceId),
      x: (sourceId && s.objects[sourceId]?.x) || 0,
    } satisfies EffectContext);
  return { ...f, compare: f.compare.map((x) => (typeof x.to === "object" ? { ...x, to: evalAmount(s, c, x.to) } : x)) };
}

/** The `zone` reference: the objects of a zone of the designated players, matching the filter. */
function zoneObjects(s: GameState, ctx: EffectContext, ref: Extract<Ref, { kind: "zone" }>): string[] {
  const players = resolveRef(s, ctx, ref.who);
  const f = ref.filter ? { ...withX(s, ref.filter, ctx), controller: undefined } : undefined;
  const card = (id: ObjectId) => !f || matchesCard(s, ctx.controller, id, f, ctx.sourceId);
  switch (ref.zone) {
    case "battlefield":
      return s.battlefield.filter(
        (id) =>
          players.includes(s.objects[id]?.controller ?? "") && matchesObjectFilter(s, ctx.controller, id, f ?? {}, ctx.sourceId),
      );
    case "graveyard":
      return players.flatMap((p) => s.players[p]?.graveyard ?? []).filter(card);
    case "hand": {
      const max = ref.maxManaValue !== undefined ? evalAmount(s, ctx, ref.maxManaValue) : Number.POSITIVE_INFINITY;
      return players.flatMap((p) =>
        (s.players[p]?.hand ?? []).filter((id) => card(id) && manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost) <= max),
      );
    }
    case "exile":
      // Face up only; neither card copies nor copies of prepared spells.
      return s.exile.filter((id) => {
        const o = s.objects[id];
        return !!o && players.includes(o.owner) && !o.faceDown && !o.cardCopy && !o.preparedFor && card(id);
      });
    case "library":
      return players.flatMap((p) => s.players[p]?.library ?? []).filter(card);
    case "command":
      // The cards of the command zone (commanders), not emblems.
      return players.flatMap((p) => s.players[p]?.command ?? []).filter((id) => !s.objects[id]?.isToken && card(id));
    case "stack": {
      const resolving = s.resolving?.item.id;
      return s.stack.filter((x) => x.id !== resolving && players.includes(x.controller)).map((x) => x.id);
    }
  }
}

/** Characteristics of a live object, or its last known information. */
export function viewOf(s: GameState, id: string): LkiSnapshot | undefined {
  if (s.objects[id]) return snapshot(s, id);
  return s.lki[id];
}

/**
 * "Its controller": the controller of a permanent, a spell or an ability; of an object that left the battlefield this
 * turn (the card it became, or its last information), its last known controller (608.2h: Winds of Abandon,
 * Indomitable Creativity); of another card, its owner.
 */
export function lastController(s: GameState, id: ObjectId): PlayerId | undefined {
  const o = s.objects[id];
  if (!o) return s.stack.find((x) => x.id === id)?.controller ?? s.lki[id]?.controller;
  if (o.zone === "battlefield" || o.zone === "stack") return o.controller;
  if (o.arrivedFrom === "battlefield") {
    // Last information is cleared every turn: the most recent one of this card is that of its leaving.
    let last: PlayerId | undefined;
    for (const k in s.lki) if (s.lki[k]?.uid === o.uid) last = s.lki[k]?.controller;
    if (last) return last;
  }
  return o.owner;
}

/** Stores a resolution value ("if you do", "the life lost this way"). */
export function store(r: Resolution, name: string | undefined, n: number): void {
  if (!name) return;
  r.vars[`$${name}`] = [n];
}

export function readVar(ctx: EffectContext, name: string): number {
  return Number(ctx.vars?.[`$${name}`]?.[0] ?? 0);
}

/** Fixed reference (`InlineAbility.bound`) of the permanent that grants an activated ability (`ref.grantor`). */
export const GRANTOR_KEY = "$grantor";

/** Does the specification depend on the game (values or player evaluated at targeting and at resolution)? */
export function needsConcrete(t: TargetSpec): boolean {
  return (
    t.countAmount !== undefined ||
    t.manaValueAmount !== undefined ||
    t.maxManaValueAmount !== undefined ||
    t.maxTotalManaValueAmount !== undefined ||
    (t.of !== undefined && t.of.kind !== "target")
  );
}

/**
 * A target specification whose values depend on the game, made concrete in this context: number of targets
 * (`countAmount`), exact mana value (`manaValueAmount`) or maximum (`maxManaValueAmount`), total mana value
 * (`maxTotalManaValueAmount`), player who holds the targets (`of` → `ofPlayers`; another "target" word is checked
 * against the chosen targets, in `validateTargets`). Evaluated at targeting and at resolution. `resolving`: at
 * resolution, a player who is no longer designated (the defending player of a creature removed from combat) leaves the
 * targets as they are.
 */
export function concreteSpec(s: GameState, ctx: EffectContext, t: TargetSpec, resolving = false): TargetSpec {
  if (!needsConcrete(t)) return t;
  const out: TargetSpec = { ...t, countAmount: undefined, manaValueAmount: undefined, maxManaValueAmount: undefined };
  if (t.countAmount !== undefined) out.count = Math.max(0, evalAmount(s, ctx, t.countAmount));
  if (t.maxTotalManaValueAmount !== undefined) {
    out.maxTotalManaValue = evalAmount(s, ctx, t.maxTotalManaValueAmount);
    out.maxTotalManaValueAmount = undefined;
  }
  if (t.of && t.of.kind !== "target") {
    const players = resolveRef(s, ctx, t.of).filter((id) => isPlayer(s, id));
    out.of = undefined;
    if (players.length > 0 || !resolving) out.ofPlayers = players;
  }
  const extra: ObjectFilter = {
    ...(t.manaValueAmount !== undefined ? { manaValue: evalAmount(s, ctx, t.manaValueAmount) } : {}),
    ...(t.maxManaValueAmount !== undefined ? { maxManaValue: evalAmount(s, ctx, t.maxManaValueAmount) } : {}),
  };
  if (Object.keys(extra).length) {
    const f = t.filter;
    out.filter = {
      ...f,
      objects: f.objects ? { ...f.objects, ...extra } : f.objects,
      cards: f.cards ? { ...f.cards, filter: { ...f.cards.filter, ...extra } } : undefined,
    };
  }
  return out;
}

/**
 * Evaluation context outside a resolution (statics, costs, trigger conditions, hand size…): no targets, no X, no
 * stored values. The only constructor of this context (PLAN-C, lot C10); `kicked`: that of the source.
 */
export function staticContext(
  s: GameState,
  controller: PlayerId,
  sourceId = "",
  opts: { sourceDefId?: string; event?: TriggerEventData; eventObject?: ObjectId } = {},
): EffectContext {
  const event =
    opts.event || opts.eventObject ? { ...opts.event, objectId: opts.eventObject ?? opts.event?.objectId } : undefined;
  return {
    controller,
    sourceId,
    sourceDefId: opts.sourceDefId ?? ((sourceId && s.objects[sourceId]?.defId) || ""),
    sourceSnapshot: { keywords: [], power: 0 },
    targets: {},
    x: 0,
    kicked: false,
    ...(event ? { event: event as TriggerEventData } : {}),
  };
}

/** Condition evaluated during the resolution (it can depend on the kicker or the stored values). */
export function evalCondition(s: GameState, ctx: EffectContext, c: Condition): boolean {
  switch (c.kind) {
    case "kicked":
      return ctx.kicked;
    case "var":
      return readVar(ctx, c.name) >= (c.atLeast ?? 1);
    case "not":
      return !evalCondition(s, ctx, c.cond);
    case "all":
      return c.of.every((x) => evalCondition(s, ctx, x));
    case "mostLife": {
      const p = c.ref ? resolveRef(s, ctx, c.ref).find((x) => isPlayer(s, x)) : ctx.controller;
      return !!p && mostLife(s, p);
    }
    case "refMatches": {
      // "of the chosen type": the choice of the source (its last information if it was sacrificed: A Killer Among Us).
      const f = resolveFilter(s, c.filter, ctx.sourceId);
      return resolveRef(s, ctx, c.ref).some((id) => {
        const v = viewOf(s, id);
        return !!v && matchesView(v, f, ctx.controller, ctx.sourceId);
      });
    }
    case "beholdSharingType": {
      const found = resolveRef(s, ctx, c.ref);
      const v = found[0] ? viewOf(s, found[0]) : undefined;
      if (!v) return false;
      const pl = s.players[ctx.controller];
      const candidates = [
        ...s.battlefield.filter((id) => s.objects[id]?.controller === ctx.controller && isCreature(s, id)),
        ...(pl?.hand ?? []).filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Creature")),
      ].filter((id) => !found.includes(id) && id !== ctx.sourceId);
      const views = candidates.map((id) => viewOf(s, id)).filter((x): x is NonNullable<typeof x> => !!x);
      // Possible types: those of the object, or (changeling) those of the creatures to behold.
      const types = new Set(
        (v.keywords.includes("changeling") ? views.flatMap((x) => x.subtypes) : v.subtypes).filter((t) => t !== "*"),
      );
      return [...types].some(
        (t) => views.filter((x) => matchesView(x, { subtype: t }, ctx.controller, ctx.sourceId)).length >= c.count,
      );
    }
    case "targetMatches":
      // "If [the target] …" during the resolution (target still present, or its last information).
      return (ctx.targets[c.spec] ?? []).some((id) => {
        // Still on the battlefield: the full filter ("entered this turn"…: Malamet Battle Glyph).
        if (s.objects[id]?.zone === "battlefield") return matchesObjectFilter(s, ctx.controller, id, c.filter, ctx.sourceId);
        const v = s.lki[id] && !s.objects[id] ? s.lki[id] : viewOf(s, id);
        return !!v && matchesView(v, c.filter, ctx.controller, ctx.sourceId);
      });
    case "eventObjectMatches": {
      const id = ctx.event?.objectId;
      const v = id ? (s.lki[id] ?? viewOf(s, id)) : undefined;
      return !!v && matchesView(v, c.filter, ctx.controller, ctx.sourceId);
    }
    case "xAtLeast":
      return ctx.x >= c.n;
    case "amountGreater":
      return evalAmount(s, ctx, c.a) > evalAmount(s, ctx, c.b);
    case "amountAtLeast":
      return evalAmount(s, ctx, c.amount) >= c.n;
    case "any":
      return c.of.some((x) => evalCondition(s, ctx, x));
    case "handAtMost":
      return resolveRef(s, ctx, c.ref).some((p) => !!s.players[p] && (s.players[p]?.hand.length ?? 0) <= c.n);
    default:
      // The object and the trigger event, for a condition read at resolution (Selvala: "if its power is greater than
      // each other creature's").
      return checkCondition(s, c, ctx.controller, ctx.sourceId, ctx.event?.objectId, ctx.event);
  }
}

/** The object of an event as it still is, otherwise what it became, otherwise its last known information. */
function eventObjectNow(s: GameState, ev: { objectId?: ObjectId; newObjectId?: ObjectId }): ObjectId[] {
  if (!ev.objectId) return [];
  // The object as it still is, otherwise what it became after its zone change.
  if (s.objects[ev.objectId] || s.stack.some((x) => x.id === ev.objectId)) return [ev.objectId];
  if (ev.newObjectId && s.objects[ev.newObjectId]) return [ev.newObjectId];
  // Gone without leaving an object (token, copy): its last known information (counters, copied definition).
  return s.lki[ev.objectId] ? [ev.objectId] : [];
}

export function resolveRef(s: GameState, ctx: EffectContext, ref: Ref): string[] {
  switch (ref.kind) {
    case "target":
      return ctx.targets[ref.id] ?? [];
    case "grantor":
      return (ctx.targets[GRANTOR_KEY] ?? []).filter((id) => !!s.objects[id]);
    case "self":
      return [ctx.sourceId];
    case "chosenPlayer": {
      const p = (s.objects[ctx.sourceId] ?? s.lki[ctx.sourceId])?.chosen?.player;
      return p && s.players[p] && !s.players[p]?.lost ? [p] : [];
    }
    case "you":
      return [ctx.controller];
    case "eachOpponent":
      return opponentsOf(s, ctx.controller);
    case "eachPlayer":
      return alivePlayers(s);
    case "eventObject":
      return ctx.event ? eventObjectNow(s, ctx.event) : [];
    case "eventObjects": {
      const ev = ctx.event;
      if (!ev) return [];
      return [...new Set([ev, ...(ev.others ?? [])].flatMap((x) => eventObjectNow(s, x)))];
    }
    case "eventPlayer":
      return ctx.event?.player ? [ctx.event.player] : [];
    case "eventPlayers": {
      const ev = ctx.event;
      return [...new Set([ev?.player, ...(ev?.others ?? []).map((x) => x.player)].filter((p): p is PlayerId => !!p))];
    }
    case "controllerOf":
      return resolveRef(s, ctx, ref.ref).flatMap((id) => {
        if (isPlayer(s, id)) return [id];
        const p = lastController(s, id);
        return p ? [p] : [];
      });
    case "ownerOf":
      return resolveRef(s, ctx, ref.ref).flatMap((id) => {
        if (isPlayer(s, id)) return [id];
        const p = s.objects[id]?.owner ?? s.lki[id]?.owner;
        return p ? [p] : [];
      });
    case "stored":
      // Stored objects, still present or known by their last information (sacrificed…), or chosen players
      // (`fx.chooseOpponent`).
      return (ctx.vars?.[`$ids:${ref.name}`] ?? []).map(String).filter((id) => !!s.objects[id] || !!s.lki[id] || isPlayer(s, id));
    case "selfCard": {
      // "This card": the object that has the same physical identity as the source, wherever it is.
      const uid = s.objects[ctx.sourceId]?.uid ?? s.lki[ctx.sourceId]?.uid;
      if (!uid) return [];
      const found = Object.values(s.objects).find((o) => o.uid === uid);
      return found ? [found.id] : [];
    }
    case "linked": {
      const linked = s.objects[ctx.sourceId]?.linked ?? s.lki[ctx.sourceId]?.linked ?? [];
      return linked.filter((id) => !!s.objects[id]);
    }
    case "union":
      return [...new Set(ref.of.flatMap((r) => resolveRef(s, ctx, r)))];
    case "numberChoosers": {
      const chosen = numbersChosen(ctx, ref.store);
      if (!chosen.length) return [];
      const hi = Math.max(...chosen.map(([, n]) => n));
      const lo = Math.min(...chosen.map(([, n]) => n));
      return chosen
        .filter(([, n]) => (ref.which === "highest" ? n === hi : ref.which === "lowest" ? n === lo : n !== lo))
        .map(([p]) => p);
    }
    case "nth": {
      const all = resolveRef(s, ctx, ref.of);
      return all[ref.n] === undefined ? [] : [all[ref.n] as string];
    }
    case "commanders": {
      if (!s.commander) return [];
      const who = new Set(resolveRef(s, ctx, ref.who));
      return Object.values(s.objects)
        .filter((o) => who.has(commanderOf(s, o)?.owner ?? ""))
        .map((o) => o.id);
    }
    case "combatPartners": {
      const of = new Set(resolveRef(s, ctx, ref.ref));
      const out = new Set<ObjectId>();
      for (const a of s.combat?.attackers ?? []) {
        if (of.has(a.id)) for (const b of a.blockers) out.add(b);
        if (a.blockers.some((b) => of.has(b))) out.add(a.id);
      }
      return [...out].filter((id) => s.objects[id]?.zone === "battlefield");
    }
    case "except": {
      const out = new Set(resolveRef(s, ctx, ref.exclude));
      return resolveRef(s, ctx, ref.ref).filter((id) => !out.has(id));
    }
    case "filtered": {
      // `controller`: the controller, or the last known controller (Winds of Abandon: "their exiled creatures").
      const c = ref.filter.controller;
      return resolveRef(s, ctx, ref.ref).filter(
        (id) =>
          !!s.objects[id] &&
          (!c || (lastController(s, id) === ctx.controller) === (c === "you")) &&
          matchesCard(s, ctx.controller, id, { ...ref.filter, controller: undefined }, ctx.sourceId),
      );
    }
    case "libraryTop":
      return resolveRef(s, ctx, ref.who).flatMap((p) => {
        const lib = s.players[p]?.library ?? [];
        if (ref.count !== undefined) return ref.bottom ? lib.slice(-ref.count) : lib.slice(0, ref.count);
        const id = ref.bottom ? lib[lib.length - 1] : lib[0];
        return id ? [id] : [];
      });
    case "sameName": {
      // The names are read now, before what the effect does (on the battlefield: the computed name).
      const nameOf_ = (id: string) => (s.objects[id] ? chars(s, id).name : s.lki[id]?.name);
      const names = resolveRef(s, ctx, ref.ref).map(nameOf_);
      const same = (id: ObjectId) => names.some((n) => shareName(chars(s, id).name, n));
      if (ref.zone === "battlefield") return s.battlefield.filter(same);
      return (s.players[ctx.controller]?.graveyard ?? []).filter(same);
    }
    case "targetsOfEventObject": {
      // The cast spell (the object of the event): its targets, according to its stack item.
      const id = ctx.event?.objectId;
      const item = s.stack.find((x) => x.id === id || x.sourceId === id);
      return item ? Object.values(item.targets).flat() : [];
    }
    case "abilitiesFromEventObject": {
      const src = ctx.event?.objectId;
      const resolving = s.resolving?.item.id;
      return s.stack
        .filter((x) => x.kind !== "spell" && x.id !== resolving && x.sourceId === src)
        .map((x) => x.id)
        .slice(-1);
    }
    case "playersWhere":
      return resolveRef(s, ctx, ref.of).filter((p) => isPlayer(s, p) && evalCondition(s, { ...ctx, controller: p }, ref.where));
    case "crewedBy": {
      const c = s.objects[ctx.sourceId]?.crewedBy;
      return c && c.turn === s.turn.number ? c.ids.filter((id) => onBattlefield(s, id)) : [];
    }
    case "exiledWith":
      return s.linkedExile
        .filter((l) => l.sourceId === ctx.sourceId)
        .flatMap((l) => l.cards)
        .filter((id) => s.objects[id]?.zone === "exile");
    case "playersWithMost": {
      const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
      const f = { ...ref.filter, controller: undefined };
      const count = (p: string) =>
        s.battlefield.filter((id) => s.objects[id]?.controller === p && matchesObjectFilter(s, p, id, f, ctx.sourceId)).length;
      const most = Math.max(0, ...alive.map(count));
      return alive.filter((p) => count(p) === most);
    }
    case "defendingPlayer": {
      // Triggered ability: the defending player fixed on triggering (508.5; Namor killed in response, myriad).
      if (ctx.event?.defendingPlayer) return [ctx.event.defendingPlayer];
      // The source attacks; otherwise, the attacker of the event ("whenever a creature you control attacks", Raid
      // Bombardment).
      const atk =
        s.combat?.attackers.find((a) => a.id === ctx.sourceId) ?? s.combat?.attackers.find((a) => a.id === ctx.event?.objectId);
      if (!atk) return [];
      if (isPlayer(s, atk.defender)) return [atk.defender];
      const pw = s.objects[atk.defender];
      return pw ? [pw.controller] : [];
    }
    case "cost":
      switch (ref.paid) {
        case "sacrificed":
          return ctx.paid?.sacrificed ?? [];
        case "discarded":
          return (ctx.paid?.discarded ?? []).filter((id) => !!s.objects[id]);
        case "exiled":
          return [...(ctx.paid?.exiled ?? [])];
        case "bounced":
          return [...(ctx.paid?.bounced ?? s.objects[ctx.sourceId]?.cast?.costBounced ?? [])];
        case "beheld":
          return [...(ctx.paid?.beheld ?? [])];
        case "defender":
          return ctx.paid?.defender ? [ctx.paid.defender] : [];
      }
      return [];
    case "withPlaneswalkers": {
      const players = resolveRef(s, ctx, ref.of).filter((p) => isPlayer(s, p));
      const walkers = s.battlefield.filter(
        (id) => players.includes(s.objects[id]?.controller ?? "") && hasType(s, id, "Planeswalker"),
      );
      return [...players, ...walkers];
    }
    case "zone":
      return zoneObjects(s, ctx, ref);
    case "attachmentsOf": {
      const hosts = new Set(resolveRef(s, ctx, ref.ref));
      return s.battlefield.filter((id) => hosts.has(s.objects[id]?.attachedTo ?? ""));
    }
    case "attached": {
      // With `of`: the permanents the designated objects are attached to.
      if (ref.of)
        return resolveRef(s, ctx, ref.of).flatMap((id) => {
          const host = s.objects[id]?.attachedTo;
          return host && onBattlefield(s, host) ? [host] : [];
        });
      const host = s.objects[ctx.sourceId]?.attachedTo ?? s.lki[ctx.sourceId]?.attachedTo;
      // Player Aura (Grievous Wound): the enchanted player.
      return host && (onBattlefield(s, host) || isPlayer(s, host)) ? [host] : [];
    }
  }
}

/** Chosen numbers (`fx.chooseNumbers`): [player, number], stored under `$num:<store>:<player>`. */
function numbersChosen(ctx: EffectContext, store: string): [string, number][] {
  const prefix = `$num:${store}:`;
  return Object.entries(ctx.vars ?? {})
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => [k.slice(prefix.length), Number(v[0] ?? 0)]);
}

export function evalAmount(s: GameState, ctx: EffectContext, a: Amount): number {
  if (typeof a === "number") return a;
  switch (a.kind) {
    case "x":
      return ctx.x;
    case "kicked":
      return ctx.kicked ? a.yes : a.no;
    case "powerOf": {
      // The creature of the event that left the battlefield ("when it dies, where X is its power"): its power at the time
      // of leaving (608.2h, last known information), not that of the card it became.
      const gone = a.ref.kind === "eventObject" ? ctx.event?.objectId : undefined;
      const lki = gone && !s.objects[gone] ? s.lki[gone] : undefined;
      if (lki) return Math.max(0, lki.power);
      const id = resolveRef(s, ctx, a.ref)[0];
      if (!id) return 0;
      if (onBattlefield(s, id)) return Math.max(0, chars(s, id).power);
      if (id === ctx.sourceId) return Math.max(0, ctx.sourceSnapshot.power);
      if (s.lki[id]) return Math.max(0, s.lki[id].power);
      // Card outside the battlefield (Close Encounter: exiled card): printed power.
      return Math.max(0, s.defs[s.objects[id]?.defId ?? ""]?.power ?? 0);
    }
    case "eventAmount":
      return ctx.event?.amount ?? 0;
    case "aggregate":
      return aggregate(s, ctx, a);
    case "spent":
      return (a.of ? resolveRef(s, ctx, a.of) : [ctx.sourceId]).reduce((n, id) => n + spentOn(s, id, a.what), 0);
    case "count":
      if (a.zone && a.zone !== "battlefield") {
        const players =
          a.whose === "all" ? alivePlayers(s) : a.whose === "opponents" ? opponentsOf(s, ctx.controller) : [ctx.controller];
        return players
          .flatMap((p) =>
            a.zone === "exile"
              ? s.exile.filter((id) => s.objects[id]?.owner === p)
              : (s.players[p]?.[a.zone as "graveyard" | "hand"] ?? []),
          )
          .filter((id) => matchesCard(s, ctx.controller, id, { ...a.filter, controller: undefined }, ctx.sourceId)).length;
      }
      return boardAmount(s, a, ctx.controller, ctx.sourceId);
    case "countersOn": {
      // The object of the event that left the battlefield ("when a creature with counters on it dies"): its counters at
      // the time of leaving (last known information), not those of the card it became.
      const gone = a.ref.kind === "eventObject" ? ctx.event?.objectId : undefined;
      const lki = gone && !s.objects[gone] ? s.lki[gone]?.counters : undefined;
      const id = resolveRef(s, ctx, a.ref)[0];
      const counters = lki ?? ((id && (s.objects[id]?.counters ?? s.lki[id]?.counters)) || {});
      // "the number of counters on …" (Warden of the Grove): all kinds together.
      if (a.counter === "any") return Object.values(counters).reduce((n, k) => n + Math.max(0, k), 0);
      return counters[a.counter] ?? 0;
    }
    case "sum":
      return a.of.reduce<number>((n, x) => n + evalAmount(s, ctx, x), 0);
    case "neg":
      return -evalAmount(s, ctx, a.of);
    case "div":
      return (a.up ? Math.ceil : Math.floor)(evalAmount(s, ctx, a.of) / a.by);
    case "pow":
      return a.base ** Math.min(20, Math.max(0, evalAmount(s, ctx, a.of)));
    case "var":
      return readVar(ctx, a.name);
    case "commanderCasts":
      // Jirina Kudro, Henzie "Toolbox" Torre: all your commanders together.
      return Object.values(s.commander?.cards ?? {})
        .filter((c) => c.owner === ctx.controller)
        .reduce((n, c) => n + c.casts, 0);
    case "lifeTotal": {
      const p = a.who ? resolveRef(s, ctx, a.who).find((x) => isPlayer(s, x)) : ctx.controller;
      const pl = p ? s.players[p] : undefined;
      return Math.max(0, (a.starting ? pl?.startingLife : pl?.life) ?? 0);
    }
    case "graveyardsWithAtLeast":
      return s.playerOrder.filter((p) => !s.players[p]?.lost && (s.players[p]?.graveyard.length ?? 0) >= a.n).length;
    case "manaValueOf": {
      const id = resolveRef(s, ctx, a.ref)[0];
      if (!id) return 0;
      // An object that ceased to exist (token moved off the battlefield): its last known information.
      if (!s.objects[id]) return s.lki[id]?.manaValue ?? manaValue(s.defs[s.lki[id]?.defId ?? ""]?.manaCost);
      return viewOf(s, id)?.manaValue ?? manaValue(s.defs[s.objects[id]?.defId ?? ""]?.manaCost);
    }
    case "toughnessOf": {
      const gone = a.ref.kind === "eventObject" ? ctx.event?.objectId : undefined;
      const lki = gone && !s.objects[gone] ? s.lki[gone] : undefined;
      if (lki) return Math.max(0, lki.toughness);
      const id = resolveRef(s, ctx, a.ref)[0];
      return id ? Math.max(0, viewOf(s, id)?.toughness ?? 0) : 0;
    }
    case "speed":
      return s.players[ctx.controller]?.speed ?? 0;
    case "refCount":
      return resolveRef(s, ctx, a.ref).length;
    case "manaSymbols": {
      // Devotion: your permanents (cost of what they copy); otherwise the designated objects (last known information).
      const ids = a.of ? resolveRef(s, ctx, a.of) : s.battlefield.filter((id) => s.objects[id]?.controller === ctx.controller);
      return ids.reduce((n, id) => {
        const defId = onBattlefield(s, id) ? copiedDefId(s, id) : (s.objects[id]?.defId ?? s.lki[id]?.defId ?? "");
        const cost = s.defs[defId]?.manaCost;
        if (!cost) return n;
        return (
          n +
          (cost.colored[a.color] ?? 0) +
          (cost.hybrid ?? []).filter((h) => h.includes(a.color)).length +
          (cost.twoHybrid ?? []).filter((m) => m === a.color).length
        );
      }, 0);
    }
    case "max":
      return Math.max(0, ...a.of.map((x) => evalAmount(s, ctx, x)));
    case "manaInPool": {
      const pl = s.players[ctx.controller];
      if (!pl) return 0;
      return Object.values(pl.manaPool).reduce((n, v) => n + v, 0) + (pl.restrictedMana?.length ?? 0);
    }
    case "poison":
      return s.players[ctx.controller]?.counters?.[a.counter ?? "poison"] ?? 0;
    case "numberChosen":
      return Math.max(0, ...numbersChosen(ctx, a.store).map(([, n]) => n));
    case "maxOverPlayers": {
      const values = resolveRef(s, ctx, a.players)
        .filter((p) => isPlayer(s, p))
        .map((p) => evalAmount(s, { ...ctx, controller: p }, a.amount));
      return a.sum ? values.reduce((n, v) => n + v, 0) : Math.max(0, ...values);
    }
    case "unlockedDoors":
      return s.battlefield.reduce(
        (n, id) => n + (s.objects[id]?.controller === ctx.controller ? (s.objects[id]?.unlocked?.length ?? 0) : 0),
        0,
      );
    case "cardsIn":
      return s.players[ctx.controller]?.[a.zone].length ?? 0;
    case "inExile":
      return resolveRef(s, ctx, a.ref).filter((id) => s.objects[id]?.zone === "exile").length;
    case "turnEvents":
      if (!a.of) return countTurnEvents(s, a.query, ctx.controller, undefined, ctx.sourceId);
      return resolveRef(s, ctx, a.of)
        .filter((x) => isPlayer(s, x))
        .reduce((n, p) => n + countTurnEvents(s, a.query, ctx.controller, p, ctx.sourceId), 0);
    case "lkiPower":
      return Math.max(0, ctx.sourceSnapshot.power);
    case "raw": {
      if (a.of) {
        // Without a designated object still on the battlefield, no value: no comparison is true.
        const id = resolveRef(s, ctx, a.of).find((x) => s.objects[x]?.zone === "battlefield");
        return id ? chars(s, id).power : Number.NaN;
      }
      const id = ctx.sourceId;
      if (a.what === "power") return id && s.objects[id]?.zone === "battlefield" ? chars(s, id).power : (s.lki[id]?.power ?? 0);
      // Resolving permanent spell (Mockingbird): the mana spent is on the stack item.
      return (
        (id && (s.objects[id]?.cast?.manaSpent ?? s.lki[id]?.manaSpent ?? s.stack.find((x) => x.id === id)?.cast?.manaSpent)) || 0
      );
    }
  }
}

/** Number of permanents matching the filter, seen from a player. */
export function boardAmount(
  s: GameState,
  a: Extract<Amount, { kind: "count" }>,
  controller: PlayerId,
  sourceId?: ObjectId,
): number {
  return s.battlefield.filter((id) => matchesObjectFilter(s, controller, id, a.filter, sourceId)).length;
}

const PERMANENT = new Set<string>(PERMANENT_TYPES);

/** Values of a property of an object (only one for a number, several for colors, types…). */
function propertyValues(s: GameState, id: ObjectId, property: AggregateProperty, counter?: string): (number | string)[] {
  const o = s.objects[id];
  // On the battlefield: the computed characteristics; an object that left: its last known information; elsewhere: the
  // printed card (708.2: face down, mana value 0).
  const here = o?.zone === "battlefield";
  const v: Pick<LkiSnapshot, "power" | "toughness" | "colors" | "types" | "subtypes" | "name"> | undefined = here
    ? chars(s, id)
    : o
      ? undefined
      : s.lki[id];
  const d = o && !v ? s.defs[o.defId] : undefined;
  const counters = (here ? o.counters : o ? o.counters : s.lki[id]?.counters) ?? {};
  switch (property) {
    case "power":
      return [v ? v.power : (d?.power ?? 0)];
    case "toughness":
      return [v ? v.toughness : (d?.toughness ?? 0)];
    case "manaValue":
      return [
        here ? (snapshot(s, id).manaValue ?? 0) : !o ? (s.lki[id]?.manaValue ?? 0) : o.faceDown ? 0 : manaValue(d?.manaCost),
      ];
    case "color":
      return v ? v.colors : (d?.colors ?? []);
    case "colorPair": {
      const colors = v ? v.colors : (d?.colors ?? []);
      return colors.length === 2 ? [[...colors].sort().join("")] : [];
    }
    case "cardType":
      return v ? v.types : (d?.types ?? []);
    case "permanentType":
      return (v ? v.types : (d?.types ?? [])).filter((t) => PERMANENT.has(t));
    case "subtype":
      return v ? v.subtypes : (d?.subtypes ?? []);
    case "basicLandType":
      return (v ? v.subtypes : (d?.subtypes ?? [])).filter((t) => (BASIC_LAND_TYPES as readonly string[]).includes(t));
    case "name":
      // 709.4: each name of a split card; an object without a name has none.
      return nameList(v ? v.name : o ? chars(s, id).name : undefined);
    case "counterKind":
      return Object.entries(counters)
        .filter(([, n]) => n > 0)
        .map(([k]) => k);
    case "counters":
      // "the number of counters among permanents you control" (Dimension X Pizzasaur): all kinds.
      if (counter === "any") return [Object.values(counters).reduce((n, k) => n + Math.max(0, k), 0)];
      return [Math.max(0, counters[counter ?? ""] ?? 0)];
    case "colorIdentity": {
      // The color identity is that of the card (903.4), wherever it is.
      const def = s.defs[o?.defId ?? s.lki[id]?.defId ?? ""];
      return def ? colorIdentity(def) : [];
    }
  }
}

/** Objects of an aggregate: designated (`of`), of a zone (`zone`, `whose`), or of the filter on the battlefield. */
function aggregateObjects(s: GameState, ctx: EffectContext, a: Extract<Amount, { kind: "aggregate" }>): ObjectId[] {
  if (a.of) {
    // The objects of the batch that left the battlefield: their last known information (608.2h; "the total power of
    // those creatures", The Skullspore Nexus), not the cards they became.
    const ev = ctx.event;
    const ids =
      a.of.kind === "eventObjects" && ev
        ? [
            ...new Set(
              [ev, ...(ev.others ?? [])].flatMap((x) =>
                x.objectId && !s.objects[x.objectId] && s.lki[x.objectId] ? [x.objectId] : eventObjectNow(s, x),
              ),
            ),
          ]
        : resolveRef(s, ctx, a.of);
    return a.filter ? ids.filter((id) => matchesCard(s, ctx.controller, id, a.filter as ObjectFilter, ctx.sourceId)) : ids;
  }
  const filter = a.filter ?? {};
  if (!a.zone) return s.battlefield.filter((id) => matchesObjectFilter(s, ctx.controller, id, filter, ctx.sourceId));
  const zone = a.zone;
  const players =
    a.whose === "all" ? alivePlayers(s) : a.whose === "opponents" ? opponentsOf(s, ctx.controller) : [ctx.controller];
  return players
    .flatMap((p) => (zone === "exile" ? s.exile.filter((id) => s.objects[id]?.owner === p) : (s.players[p]?.[zone] ?? [])))
    .filter((id) => matchesCard(s, ctx.controller, id, { ...filter, controller: undefined }, ctx.sourceId));
}

/** `Amount` `aggregate`: sum, greatest value, distinct values or most shared creature type. */
function aggregate(s: GameState, ctx: EffectContext, a: Extract<Amount, { kind: "aggregate" }>): number {
  const ids = aggregateObjects(s, ctx, a);
  if (a.fn === "mostShared") {
    // The greatest number of objects that have a creature type in common; a changeling has them all.
    const views = ids.map((id) => viewOf(s, id)).filter((v): v is LkiSnapshot => !!v);
    const changelings = views.filter((v) => v.keywords.includes("changeling")).length;
    const per = new Map<string, number>();
    for (const v of views) {
      if (v.keywords.includes("changeling")) continue;
      for (const t of new Set(v.subtypes)) per.set(t, (per.get(t) ?? 0) + 1);
    }
    return changelings + Math.max(0, ...per.values());
  }
  const values = ids.flatMap((id) => propertyValues(s, id, a.property, a.counter));
  if (a.fn === "distinct") return new Set(values).size;
  const numbers = values.map(Number);
  if (a.fn === "max") return Math.max(0, ...numbers);
  return numbers.reduce((n, x) => n + Math.max(0, x), 0);
}

/**
 * What was spent to cast the object: the spell on the stack (or resolving), otherwise the permanent it became.
 */
function spentOn(s: GameState, id: ObjectId, what: "x" | "mana" | "colors" | "cave" | "artifact"): number {
  switch (what) {
    case "x": {
      const item = s.resolving?.item.id === id ? s.resolving.item : s.stack.find((x) => x.id === id);
      return item?.x ?? s.objects[id]?.x ?? 0;
    }
    case "mana":
      // An object that has left the battlefield: its last known information (Satoru).
      return castInfoOf(s, id, true)?.manaSpent ?? s.lki[id]?.manaSpent ?? 0;
    case "colors": {
      const spent = castInfoOf(s, id)?.spentColors ?? {};
      return (["W", "U", "B", "R", "G"] as const).filter((c) => (spent[c] ?? 0) > 0).length;
    }
    case "cave":
      return castInfoOf(s, id, true)?.spentFrom?.cave ?? 0;
    case "artifact":
      return castInfoOf(s, id, true)?.spentFrom?.artifact ?? 0;
  }
}

export function damageSource(s: GameState, ctx: EffectContext, ref?: Ref): DamageSource | null {
  if (!ref || (ref.kind === "self" && !onBattlefield(s, ctx.sourceId))) {
    // 120.3: an ability of a permanent deals its damage with that permanent as the source (Trance Kuja).
    if (!ref && onBattlefield(s, ctx.sourceId) && s.objects[ctx.sourceId]?.defId === ctx.sourceDefId) {
      return sourceFromObject(s, ctx.sourceId);
    }
    // A resolving spell: it is identified by its stack item (Imodane, the Pyrohammer).
    const spell =
      s.resolving?.item.kind === "spell" && s.resolving.item.sourceId === ctx.sourceId ? s.resolving.item.id : undefined;
    // Lo and Li: "Lesson spells you control have lifelink" (static read at the time of damage).
    const d = s.defs[ctx.sourceDefId];
    const granted = d
      ? playerStatics(s, ctx.controller, "spellKeywords")
          .filter(
            ({ ab }) => ab.spellKeywords && matchesView(spellView(d, ctx.controller), ab.spellKeywords.filter, ctx.controller),
          )
          .flatMap(({ ab }) => ab.spellKeywords?.keywords ?? [])
      : [];
    const keywords = granted.length ? [...new Set([...ctx.sourceSnapshot.keywords, ...granted])] : ctx.sourceSnapshot.keywords;
    return { defId: ctx.sourceDefId, controller: ctx.controller, keywords, stackId: spell };
  }
  const id = resolveRef(s, ctx, ref)[0];
  if (!id || !onBattlefield(s, id)) return null;
  return sourceFromObject(s, id);
}

export function addPump(s: GameState, affected: ObjectId[], power: number, toughness: number, keywords: Keyword[] = []): void {
  if (affected.length === 0) return;
  bump(s);
  s.effects.push({
    id: newId(s, "e"),
    timestamp: nextTimestamp(s),
    affected,
    power,
    toughness,
    addKeywords: keywords,
    duration: "endOfTurn",
  });
}

/** Result of an effect: done, question to the player (the resolution is suspended), or skipping effects. */
export type OpResult =
  | undefined
  | { ask: { player: PlayerId; request: ChoiceRequest; key: string } }
  | { castNow: { player: PlayerId; cards: ObjectId[]; prompt: string; key: string } }
  | { skip: number };

export function contextOf(r: Resolution): EffectContext {
  return {
    controller: r.controller,
    sourceId: r.item.sourceId,
    sourceDefId: r.item.sourceDefId,
    sourceSnapshot: r.item.sourceSnapshot,
    targets: r.targets,
    x: r.item.x,
    kicked: r.item.kicked,
    event: r.item.event,
    vars: r.vars,
    paid: { ...r.item.paid, bounced: r.item.cast?.costBounced },
  };
}

/** The object's card, cited in a player-facing text (`cardRef`: shown in the interface language). */
export function cardRefOf(s: GameState, id: string): string {
  const defId = s.objects[id]?.defId;
  return defId && s.defs[defId] ? cardRef(defId) : id;
}

export function moveAndLog(s: GameState, id: ObjectId, to: "hand" | "exile" | "graveyard"): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  emit({ type: "moved", owner: o.owner, objectId: id, defId: o.defId, from: o.zone, to });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  return moveObject(s, id, to);
}

/**
 * Mill (701.13): the designated cards, from each player's library, go to their graveyard; a single grouped event
 * ("whenever one or more nonland cards are milled", Fallout). Returns the cards in the graveyards.
 */
export function millCards(s: GameState, byPlayer: [PlayerId, ObjectId[]][]): ObjectId[] {
  const out: ObjectId[] = [];
  const counts: { player: PlayerId; nonland: number; cards: number }[] = [];
  for (const [player, ids] of byPlayer) {
    let nonland = 0;
    let cards = 0;
    for (const id of ids) {
      const land = !!s.defs[s.objects[id]?.defId ?? ""]?.types.includes("Land");
      const now = moveAndLog(s, id, "graveyard");
      if (!now) continue;
      out.push(now);
      cards++;
      if (!land) nonland++;
    }
    if (cards) counts.push({ player, nonland, cards });
  }
  if (counts.length) rulesEvent(s, { e: "milled", byPlayer: counts });
  return out;
}

/** Adds a continuous effect (layers) to objects. */
export function addEffect(s: GameState, ids: ObjectId[], mods: LayerMods, duration: "endOfTurn" | "permanent"): void {
  if (ids.length === 0) return;
  bump(s);
  s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: ids, duration, ...mods });
}

/** Destination whose number of counters is evaluated (`evalMoveSpec`): what `moveWithSpec` receives. */
export type EvaluatedMoveSpec = Omit<MoveSpec, "counters"> & { counters?: { kind: string; n: number } };

/** Evaluates the number of counters of an effect destination ("with X additional +1/+1 counters"). */
export function evalMoveSpec(s: GameState, ctx: EffectContext, spec: MoveSpec): EvaluatedMoveSpec {
  const c = spec.counters;
  if (!c || typeof c.n === "number") return spec as EvaluatedMoveSpec;
  return { ...spec, counters: { kind: c.kind, n: Math.max(0, evalAmount(s, ctx, c.n)) } };
}

/** Moves an object according to an effect destination; returns its new id. */
/** `choices`: entering choices made during the resolution (what a Clone copies, what an Aura enchants, the life */
/** paid for a shock land). */
export function moveWithSpec(
  s: GameState,
  controller: PlayerId,
  id: ObjectId,
  spec: EvaluatedMoveSpec,
  choices?: Partial<EntersContext>,
): ObjectId | null {
  const o = s.objects[id];
  if (!o) return null;
  // Face down, 2/2: cloaked (701.58, Vannifar: "cloak a card from your hand"), with ward {2}, under your control;
  // manifested (701.40), under its owner's control (except "under your control").
  if (spec.to === "battlefield" && spec.as) {
    const cloak = spec.as === "cloak";
    return putFaceDown(s, cloak || spec.underYourControl ? controller : o.owner, id, cloak);
  }
  const zone: Zone = spec.to === "libraryTop" || spec.to === "libraryBottom" ? "library" : (spec.to as Zone);
  // Exiled face down (406.3): the players who can look at it.
  const viewers =
    zone === "exile" && spec.faceDown
      ? spec.faceDown === "you"
        ? [controller]
        : spec.faceDown === "owner"
          ? [o.owner]
          : []
      : undefined;
  emit({
    type: "moved",
    owner: o.owner,
    objectId: id,
    defId: o.defId,
    from: o.zone,
    to: zone,
    ...(viewers ? { faceDown: viewers } : {}),
  });
  if (o.zone === "battlefield") removeFromCombat(s, id);
  const newController = spec.to === "battlefield" ? (spec.underYourControl ? controller : o.owner) : undefined;
  // Shock land: the life is paid as it enters, by the player who will control it.
  const shock = s.defs[o.defId]?.shockLand;
  if (choices?.shockPaid && shock && newController) payLife(s, newController, shock);
  const mods = { addTypes: spec.addTypes, addSubtypes: spec.addSubtypes, addKeywords: spec.addKeywords };
  const newId_ = moveObject(s, id, zone, {
    controller: newController,
    position: spec.to === "libraryBottom" ? "bottom" : "top",
    transformed: spec.transformed,
    tapped: spec.tapped || !!spec.attacking,
    // Counters, types and attack: in place before the entering event (614.1c, 614.12, 508.4).
    enters:
      spec.to === "battlefield"
        ? {
            mods: { ...spec.mods, ...mods, setTypes: spec.setTypes, setSubtypes: spec.setSubtypes },
            // 508.4: the defender chosen during the resolution (`chooseAttacked`), otherwise that of one of your creatures.
            attacking: spec.attacking === true && s.combat ? attackingDefender(s, newController ?? o.owner) : undefined,
            ...choices,
            // The counters of the effect, then those of the "as it enters" effects (Altered Ego, Sin).
            counters: [...(spec.counters ? [spec.counters] : []), ...(choices?.counters ?? [])],
          }
        : undefined,
  });
  // "… Nth from the top of the library" (Riptide Gearhulk).
  if (newId_ && spec.to === "libraryTop" && spec.fromTop && spec.fromTop > 1) {
    const lib = s.players[o.owner]?.library;
    if (lib && lib[0] === newId_) {
      lib.shift();
      lib.splice(Math.min(spec.fromTop - 1, lib.length), 0, newId_);
    }
  }
  // "Shuffle it into its owner's library."
  if (newId_ && zone === "library" && spec.shuffle) shuffle(s, s.players[o.owner]?.library ?? []);
  const moved = newId_ ? s.objects[newId_] : undefined;
  // Counters on an exiled card ("exile it with a loot counter on it", Tinybones).
  if (moved && zone === "exile" && spec.counters) changeCounters(s, moved, spec.counters.kind, spec.counters.n);
  if (moved && zone === "exile" && viewers) moved.exiledFaceDown = viewers;
  // Warp: castable from exile from the next turn.
  if (moved && zone === "exile" && spec.warp) moved.exiledVia = { kind: "warp", turn: s.turn.number };
  // Unearth (702.84a): "if it would leave the battlefield, exile it instead".
  if (moved && zone === "battlefield" && spec.exileIfLeaves) moved.exileIfLeaves = true;
  // The back face (712.14), the tapped state, the counters, the types and the attack are set by `moveObject` before the
  // entering event (see `EntersContext`).
  return newId_;
}

/**
 * 508.4: defender of a permanent put onto the battlefield attacking, lacking a choice: what a creature of its
 * controller is attacking, otherwise its first opponent.
 */
export function attackingDefender(s: GameState, controller: PlayerId): string {
  return (
    s.combat?.attackers.find((a) => s.objects[a.id]?.controller === controller)?.defender ?? opponentsOf(s, controller)[0] ?? ""
  );
}

/** Can this Aura or Equipment be attached to this permanent? (301.5c, 303.4d) */
export function canAttach(s: GameState, what: ObjectId, to: ObjectId): boolean {
  const a = s.objects[what];
  // Curse (Aura "enchant player"): a player still in the game (Maddening Hex).
  if (a?.zone === "battlefield" && isPlayer(s, to)) return !!s.defs[a.defId]?.enchant?.player && !s.players[to]?.lost;
  if (a?.zone !== "battlefield" || !onBattlefield(s, to) || what === to) return false;
  const d = s.defs[a.defId];
  // 702.16c: protection — neither enchanted nor equipped by what matches its quality.
  if (protectedFrom(s, to, sourceView(s, what))) return false;
  if (d?.enchant) return matchesObjectFilter(s, a.controller, to, d.enchant.filter, what);
  if (chars(s, what).subtypes.includes("Equipment")) return isCreature(s, to);
  return false;
}

/** 701.3: attaches the object; no effect if impossible or if it is already attached to it. */
export function attach(s: GameState, what: ObjectId, to: ObjectId): boolean {
  const a = s.objects[what];
  if (!a || a.attachedTo === to || !canAttach(s, what, to)) return false;
  a.attachedTo = to;
  a.timestamp = nextTimestamp(s); // 613.7e: new timestamp
  bump(s);
  // Attached elsewhere: what lasted "for as long as it remains attached" to the previous host ends (611.2b).
  endDetachedEffects(s);
  emit({ type: "attach", objectId: what, defId: a.defId, to, toDefId: s.objects[to]?.defId ?? "" });
  if (!isPlayer(s, to)) rulesEvent(s, { e: "attached", objectId: what, to });
  return true;
}

/**
 * Puts a discarded card in its place (701.9): into the graveyard, or into exile if it has madness (702.35a); in that
 * case, a triggered ability "cast it for its madness cost, otherwise put it into your graveyard" is put on hold.
 * `byEffect`: the discard comes from an effect (not from a cost or the maximum hand size).
 */
export function moveDiscarded(s: GameState, player: PlayerId, card: ObjectId, byEffect = false): ObjectId | null {
  const d = s.defs[s.objects[card]?.defId ?? ""];
  const madness = castOption(d, "madness")?.cost;
  // Library of Leng: discarded by an effect, the card can go on top of the library (automatic choice: yes, except a
  // card with madness).
  if (byEffect && !madness && playerStatic(s, player, "discardToLibraryTop"))
    return moveObject(s, card, "library", { position: "top" });
  if (!d || !madness) return moveObject(s, card, "graveyard");
  const exiled = moveObject(s, card, "exile");
  if (exiled) {
    const c: Ref = { kind: "target", id: "c" };
    pushInline(s, player, exiled, d.id, {
      targets: [],
      effects: [
        { op: "castNow", what: c, cost: madness },
        { op: "moveTo", what: c, spec: { to: "graveyard" } },
      ],
      bound: { c: [exiled] },
      label: msg("Madness: cast it for its madness cost, otherwise it goes to the graveyard"),
    });
  }
  return exiled;
}

/** Signals a discarded card ("whenever an opponent discards a card" triggers). */
export function announceDiscard(s: GameState, player: PlayerId, card: ObjectId | null): void {
  // Chaos (Mayhem): the card discarded this turn can be cast from the graveyard (turn log, `rulesEvent`).
  if (card) rulesEvent(s, { e: "discard", player, cards: [card] });
}

/** End of a discard: "whenever you discard one or more cards" (once, with their number). */
export function announceDiscardBatch(s: GameState, player: PlayerId, count: number): void {
  if (count > 0) rulesEvent(s, { e: "discardBatch", player, count });
}

/** Number of this player's next turn (current turn excluded). */
export function nextTurnOf(s: GameState, player: PlayerId): number {
  const alive = s.playerOrder.filter((p) => !s.players[p]?.lost);
  const i = alive.indexOf(s.turn.active);
  for (let k = 1; k <= alive.length; k++) if (alive[(i + k) % alive.length] === player) return s.turn.number + k;
  return s.turn.number + alive.length;
}

/** Allows a player to play these exiled cards until the end of this turn, or of their next turn. */
export function grantPlay(
  s: GameState,
  player: PlayerId,
  cards: ObjectId[],
  until: "thisTurn" | "yourNextTurn" | "yourNextEndStep" | "forever" | number,
  opts: {
    free?: boolean;
    anyTime?: boolean;
    condition?: Condition;
    source?: ObjectId;
    extraCost?: number;
    tapped?: boolean;
    anyMana?: boolean;
    after?: "exile" | "bottom";
    group?: string;
    orHand?: boolean;
    now?: boolean;
    flashback?: boolean;
    harmonize?: boolean;
    cost?: ManaCost;
    payLifeManaValue?: boolean;
    adventureOnly?: boolean;
  },
): void {
  const last =
    typeof until === "number"
      ? until
      : until === "forever"
        ? Number.MAX_SAFE_INTEGER
        : until === "thisTurn" || (until === "yourNextEndStep" && beforeYourEndStep(s, player))
          ? s.turn.number
          : nextTurnOf(s, player);
  const endStep = until === "yourNextEndStep" ? { beforeEndStep: true } : {};
  s.playPermissions = [
    ...(s.playPermissions ?? []),
    ...cards.map((card) => ({ card, player, until: last, ...endStep, ...opts })),
  ];
}

/** It is this player's turn, before their end step: "your next end step" is that of this turn. */
function beforeYourEndStep(s: GameState, player: PlayerId): boolean {
  return s.turn.active === player && s.turn.step !== "end" && s.turn.step !== "cleanup";
}

/** A play permission still valid: before the end of its last turn, or before its end step. */
export function permissionActive(s: GameState, p: { until: number; beforeEndStep?: boolean }): boolean {
  if (p.until > s.turn.number) return true;
  if (p.until < s.turn.number) return false;
  return !(p.beforeEndStep && (s.turn.step === "end" || s.turn.step === "cleanup"));
}

/** Physical identity of the designated card (for an effect that lasts as long as it remains exiled). */
export function exiledUid(s: GameState, ctx: EffectContext, ref: Ref): string | undefined {
  const id = resolveRef(s, ctx, ref)[0];
  return id ? s.objects[id]?.uid : undefined;
}

/**
 * Puts a card onto the battlefield face down under the control of `controller`. It can be turned face up for its mana
 * cost if it is a creature card, or for its disguise cost (701.34c, 701.58c).
 */
export function putFaceDown(s: GameState, controller: PlayerId, id: ObjectId, ward: boolean): ObjectId | null {
  const o = s.objects[id];
  if (!o || o.zone === "battlefield") return null;
  const d = s.defs[o.defId];
  const disguise = castOption(d, "faceDown")?.cost;
  const upCosts = [...(disguise ? [disguise] : []), ...(d?.types.includes("Creature") && d.manaCost ? [d.manaCost] : [])];
  emit({ type: "moved", owner: o.owner, from: o.zone, to: "battlefield" });
  return moveObject(s, id, "battlefield", { controller, faceDown: { ward, upCosts } });
}

/** Cards of a zone owned by given players. */
export function zoneCards(s: GameState, players: string[], zone: "graveyard" | "library" | "hand"): ObjectId[] {
  return players.flatMap((p) => s.players[p]?.[zone] ?? []);
}

/** `op → handler` table: `opRegistry.ts`, filled by `ops/index.ts`. */
export type { OpHandlers } from "./opRegistry";

/**
 * Runs an effect. Effects that ask for a choice return `ask`: the resolution is suspended,
 * then the effect is replayed once the answer is stored in `r.vars[key]`.
 */
export function runEffect(s: GameState, r: Resolution, e: Effect): OpResult {
  return runEffectWith(s, r, e, contextOf(r), (suffix: string) => `${r.pc}:${suffix}`);
}

/** Runs an effect with a given context and choice keys ("as it enters" loop, `asEntersChoices`). */
export function runEffectWith(
  s: GameState,
  r: Resolution,
  e: Effect,
  ctx: EffectContext,
  key: (suffix: string) => string,
): OpResult {
  const handler = opHandler(e.op);
  if (!handler && registeredOps().length === 0)
    throw new Error("No effect handler registered: import the engine through game.ts (which imports ops/index.ts)");
  return handler ? handler(s, r, e as never, ctx, key) : undefined;
}
