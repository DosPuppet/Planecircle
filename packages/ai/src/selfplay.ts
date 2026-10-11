/**
 * AI against AI games with invariant checks: used for fuzzing the engine and for the tests.
 */

import type { CardDef, GameVariant } from "@mtgx/engine";
import {
  type Agent,
  chars,
  cloneState,
  computeBattlefield,
  createGame,
  type Decision,
  fallbackDecision,
  type GameState,
  legalActions,
  plainText,
  RulesError,
  submit,
  syncControl,
} from "@mtgx/engine";
import { corruptDecision } from "./chaos";
import { buildCastDecision } from "./options";
import { mulberry32 } from "./random";

export interface SelfPlayResult {
  state: GameState;
  decisions: { player: string; decision: Decision }[];
  illegal: number;
  turns: number;
  /** Cut-offs by a safety cap of the engine (`capReached` events, `engine/src/limits.ts`). */
  caps: number;
}

/** Checks the consistency of the state; returns the list of violations. */
export function checkInvariants(s: GameState, deckSizes: Record<string, number>): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const place = (id: string, where: string) => {
    if (seen.has(id)) errors.push(`${id} present in ${seen.get(id)} and ${where}`);
    seen.set(id, where);
    if (!s.objects[id]) errors.push(`${id} (${where}) does not exist`);
  };
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    for (const z of ["library", "hand", "graveyard", "command", "phasedOut"] as const)
      for (const id of pl[z] ?? []) place(id, `${p}.${z}`);
  }
  for (const id of s.battlefield) place(id, "battlefield");
  for (const id of s.exile) place(id, "exile");
  // A spell on the stack, copies included (object without a card, 707.10).
  for (const item of s.stack) if (item.kind === "spell") place(item.sourceId, "stack");
  // A single pass over the objects (at each decision): zone, numbers, cards of each player.
  // Neither tokens nor copies of prepared spells (Reality Fracture) are cards. A melded permanent stands for its two
  // cards.
  const owned: Record<string, number> = {};
  for (const id in s.objects) {
    const o = s.objects[id] as GameState["objects"][string];
    const where = seen.get(id);
    if (where === undefined) errors.push(`${id} (${o.defId}) is in no zone`);
    if (!(where ?? "").endsWith(o.zone)) errors.push(`${id}: zone ${o.zone} but stored in ${where ?? ""}`);
    if (o.damage < 0) errors.push(`${id}: negative damage`);
    if (!Number.isFinite(o.damage)) errors.push(`${id}: damage ${o.damage}`);
    for (const k in o.counters) {
      const n = o.counters[k] as number;
      if (!(Number.isFinite(n) && n >= 0)) errors.push(`${id}: counters ${k} = ${n}`);
    }
    if (!o.isToken && !o.preparedFor && !o.cardCopy) owned[o.owner] = (owned[o.owner] ?? 0) + (o.melded?.length ?? 1);
  }
  // The cards of eliminated players leave the game (800.4a); the others are kept.
  for (const p of s.playerOrder) {
    const n = owned[p] ?? 0;
    const size = deckSizes[p] ?? 0;
    // Eliminated during the game: 0 cards; eliminated by the final blow: their cards stay.
    const ok = s.players[p]?.lost ? n === 0 || n === size : n === size;
    if (!ok) errors.push(`${p}: ${n} cards instead of ${size}`);
  }
  // Commander (PLAN-E): a player still in the game has exactly one object per commander (903.3, the designation
  // follows the card).
  if (s.commander) {
    const copies: Record<string, number> = {};
    for (const id in s.objects) {
      const o = s.objects[id] as GameState["objects"][string];
      if (!o.isToken && s.commander.cards[o.uid]) copies[o.uid] = (copies[o.uid] ?? 0) + 1;
    }
    for (const [uid, c] of Object.entries(s.commander.cards))
      if (!s.players[c.owner]?.lost && copies[uid] !== 1) errors.push(`commander ${c.defId}: ${copies[uid] ?? 0} object(s)`);
  }
  // Layer 2: control is already up to date (a new computation changes nothing). Game over: the loser's objects stay
  // in place, and so do their control effects.
  // The copy is costly: only if there is a source of control (control effect, original base controller, attached
  // Aura), that is everything `controlClaims` reads.
  const controlInPlay =
    s.effects.some((e) => e.controller) ||
    s.battlefield.some((id) => {
      const o = s.objects[id];
      return !!o && ((o.baseController !== undefined && o.baseController !== o.controller) || !!o.attachedTo);
    });
  const probe = s.over || !controlInPlay ? null : cloneState(s);
  if (probe && syncControl(probe)) {
    const moved = s.battlefield.filter((id) => probe.objects[id]?.controller !== s.objects[id]?.controller);
    for (const id of moved) {
      const o = s.objects[id];
      errors.push(`${id} (${o?.defId}): stale control, ${o?.controller} instead of ${probe.objects[id]?.controller}`);
    }
  }
  // The layer cache must never diverge from a fresh computation.
  const fresh = computeBattlefield(s);
  for (const id of s.battlefield) {
    const cached = chars(s, id) as unknown as Record<string, unknown>;
    const now = fresh.get(id) as unknown as Record<string, unknown> | undefined;
    if (!sameJson(cached, now)) {
      // Diverging fields, to find the missing `bump`.
      const diff = Object.keys({ ...cached, ...now }).filter((k) => JSON.stringify(cached[k]) !== JSON.stringify(now?.[k]));
      errors.push(`${id} (${s.objects[id]?.defId}): stale characteristics cache (${diff.join(", ")})`);
    }
  }
  // Numbers: never NaN or infinite; counters, damage and mana never negative.
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (!pl) continue;
    if (!Number.isFinite(pl.life)) errors.push(`${p}: life ${pl.life}`);
    for (const [m, n] of Object.entries(pl.manaPool)) if (!(Number.isFinite(n) && n >= 0)) errors.push(`${p}: mana ${m} = ${n}`);
  }
  // References: an Aura or an Equipment is attached to a permanent (or to a player); the combatants are on the
  // battlefield. Attachment is checked only at priority: in the middle of a resolution, state-based actions (704.5m-n)
  // have not yet detached what is illegally attached. The "cast now" priority (608.2g) is still inside the resolution
  // (Zoyowa's Justice shuffles an enchanted creature, then discovers).
  const onBattlefield = new Set(s.battlefield);
  const settled = s.pending?.kind === "priority" && !s.pending.castNow;
  for (const id of settled ? s.battlefield : []) {
    const to = s.objects[id]?.attachedTo;
    if (to && !onBattlefield.has(to) && !s.players[to]) errors.push(`${id} attached to ${to}, not on the battlefield`);
  }
  for (const a of s.combat?.attackers ?? []) if (!onBattlefield.has(a.id)) errors.push(`attacker ${a.id} not on the battlefield`);
  for (const b of s.combat?.blockers ?? []) if (!onBattlefield.has(b.id)) errors.push(`blocker ${b.id} not on the battlefield`);
  if (s.pending && s.players[s.pending.player]?.lost)
    errors.push(`decision expected from an eliminated player (${s.pending.player})`);
  // Serializable to JSON (save, replay, sending): no Map, no Set, no function, no non-finite number.
  const bad = nonJson({ ...s, defs: undefined });
  if (bad) errors.push(`state not serializable to JSON: ${bad}`);
  if (!s.over && !s.pending) errors.push("game not over without a pending decision");
  if (s.over && s.pending) errors.push("game over with a pending decision");
  return errors;
}

/** Equality in the sense of JSON.stringify (missing keys and `undefined` alike), without building the strings. */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameJson(a[i] ?? null, b[i] ?? null)) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const k in x) if (x[k] !== undefined && !sameJson(x[k], y[k])) return false;
  for (const k in y) if (y[k] !== undefined && x[k] === undefined) return false;
  return true;
}

/** Path of the first element of `v` that would not survive JSON.stringify / JSON.parse, or null. */
function nonJson(v: unknown): string | null {
  // The path is built only on failure (the walk over the whole state at each decision must stay light).
  const path: (string | number)[] = [];
  const walk = (x: unknown): string | null => {
    if (x === null || x === undefined || typeof x === "string" || typeof x === "boolean") return null;
    if (typeof x === "number") return Number.isFinite(x) ? null : ` = ${x}`;
    if (typeof x !== "object") return `: ${typeof x}`;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        const r = walk(x[i]);
        if (r) {
          path.unshift(i);
          return r;
        }
      }
      return null;
    }
    const proto = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) return `: instance of ${proto?.constructor?.name ?? "?"}`;
    for (const k in x) {
      const r = walk((x as Record<string, unknown>)[k]);
      if (r) {
        path.unshift(k);
        return r;
      }
    }
    return null;
  };
  const r = walk(v);
  return r ? `state${path.map((k) => (typeof k === "number" ? `[${k}]` : `.${k}`)).join("")}${r}` : null;
}

/** Plays a game between AIs (2 players or more: one deck and one agent per player). */
export function playGame(opts: {
  seed: number;
  decks: CardDef[][];
  agents: Agent[];
  maxDecisions?: number;
  /**
   * Turn cap: beyond it, the game stops unfinished. A game may never end under the rules (each player controls a
   * Darksteel Angel: "you can't lose") and the AI slows down as the board grows.
   */
  maxTurns?: number;
  check?: boolean;
  startingLife?: number;
  /** Commander (PLAN-E): variant and indices of the commanders of each deck. */
  variant?: GameVariant;
  commanders?: (number[] | undefined)[];
  /** "Chaos" fuzz: before each decision, `perDecision` corrupted variants are submitted and must be refused cleanly. */
  chaos?: { seed: number; perDecision: number };
  /**
   * Every `offers` priorities, each option of `legalActions`, built with its default choices (first target, first
   * mode…), must be accepted by the engine: `legal.ts` offers nothing that `stack.ts` refuses (PLAN-C, lot C2).
   */
  offers?: number;
}): SelfPlayResult {
  const ids = opts.decks.map((_, i) => `p${i + 1}`);
  const deckSizes = Object.fromEntries(ids.map((id, i) => [id, opts.decks[i]?.length ?? 0]));
  let { state } = createGame({
    seed: opts.seed,
    startingLife: opts.startingLife,
    variant: opts.variant,
    players: ids.map((id, i) => ({ id, name: `AI ${i + 1}`, deck: opts.decks[i] ?? [], commanders: opts.commanders?.[i] })),
  });
  const agents: Record<string, Agent> = Object.fromEntries(ids.map((id, i) => [id, opts.agents[i] as Agent]));
  const decisions: SelfPlayResult["decisions"] = [];
  let illegal = 0;
  let caps = 0;
  const max = opts.maxDecisions ?? 5000;
  const chaosRand = opts.chaos ? mulberry32(opts.chaos.seed) : null;
  for (let i = 0; i < max && state.pending && !state.over; i++) {
    if (opts.maxTurns && state.turn.number > opts.maxTurns) break;
    const p = state.pending;
    if (opts.offers && p.kind === "priority" && i % opts.offers === 0)
      checkOffers(state, p.player, `seed ${opts.seed}, decision ${i}`);
    // The host's default declaration (blocking requirements 509.1c, forced attacks) is always accepted.
    if (opts.offers && (p.kind === "declareBlockers" || p.kind === "declareAttackers")) {
      try {
        submit(state, p.player, fallbackDecision(state, p));
      } catch (e) {
        if (!(e instanceof RulesError)) throw e;
        throw new Error(`Default declaration refused (seed ${opts.seed}, decision ${i}): ${p.kind} — ${plainText(e.message)}`);
      }
    }
    let d = (agents[p.player] as Agent)(state, p.player);
    if (chaosRand && opts.chaos) probe(state, p.player, d, chaosRand, opts.chaos.perDecision, `seed ${opts.seed}, decision ${i}`);
    let step: ReturnType<typeof submit>;
    try {
      step = submit(state, p.player, d);
    } catch (e) {
      if (!(e instanceof RulesError)) throw e;
      illegal++;
      d = fallbackDecision(state, p);
      step = submit(state, p.player, d);
    }
    state = step.state;
    caps += step.events.filter((e) => e.type === "capReached").length;
    decisions.push({ player: p.player, decision: d });
    if (opts.check) {
      const errors = checkInvariants(state, deckSizes);
      if (errors.length) throw new Error(`Invariants violated (seed ${opts.seed}, decision ${i}):\n${errors.join("\n")}`);
    }
  }
  return { state, decisions, illegal, turns: state.turn.number, caps };
}

/** Each offered option, with its default choices, is accepted (otherwise: `legal.ts` and `stack.ts` diverge). */
export function checkOffers(state: GameState, player: string, where: string): void {
  for (const [k, a] of legalActions(state, player).entries()) {
    if (a.type === "pass") continue;
    const d0 = buildCastDecision(a, (list) => list[0], mulberry32(k + 1));
    if (!d0) continue;
    // Objects paid as a cost: another choice than the suggestion (the last options) must be accepted too. Except for
    // the additional costs that tap, return or exile permanents: they can take a mana source the spell needs (such a
    // choice is rightly refused), the suggestion is kept.
    const keepSuggestion = new Set(["costTap", "costBounce", "costExile"]);
    const picks =
      (a.type === "cast" || a.type === "activate") && a.picks
        ? Object.fromEntries(
            a.picks
              .filter((p) => !p.when && !p.countIsX && !p.repeat && !p.atMost)
              // A cost of some modes only: with the decision's mode.
              .filter((p) => !p.modes || ("mode" in d0 && p.modes.includes(d0.mode ?? 0)))
              .map((p) => [
                p.slot,
                keepSuggestion.has(p.slot)
                  ? p.suggested
                  : p.minTotal
                    ? p.options
                    : p.oneOf
                      ? lastGroup(p.oneOf)
                      : p.options.slice(-p.count),
              ]),
          )
        : {};
    const d = Object.keys(picks).length && (d0.type === "cast" || d0.type === "activate") ? { ...d0, picks } : d0;
    try {
      submit(state, player, d);
    } catch (e) {
      const id = "card" in a ? a.card : "source" in a ? a.source : "";
      const name = state.defs[state.objects[id]?.defId ?? ""]?.name ?? id;
      if (!(e instanceof RulesError))
        throw new Error(`Engine error on an offered option (${where}): ${a.type} ${name}\n${JSON.stringify(d)}`, {
          cause: e,
        });
      throw new Error(
        `Option offered then refused (${where}): ${a.type} ${name} — ${plainText(e.message)}\n${JSON.stringify(d)}`,
      );
    }
  }
}

/** "One of these groups" (forage): the last objects of the last group. */
function lastGroup(groups: { count: number; options: string[] }[]): string[] {
  const g = groups[groups.length - 1];
  return g ? g.options.slice(-g.count) : [];
}

/** State without the definitions (shared, immutable): used to check that a submission changed nothing. */
function fingerprint(s: GameState): string {
  return JSON.stringify({ ...s, defs: undefined });
}

/**
 * Submits corrupted variants of `d`: each one must be refused by a RulesError (or accepted if it happens to be legal),
 * and the original state must never change (`submit` is transactional).
 */
function probe(state: GameState, player: string, d: Decision, rand: () => number, count: number, where: string): void {
  const before = fingerprint(state);
  for (let k = 0; k < count; k++) {
    const bad = corruptDecision(state, d, rand);
    try {
      submit(state, player, bad);
    } catch (e) {
      if (!(e instanceof RulesError)) {
        throw new Error(`Chaos (${where}): non-RulesError error for ${JSON.stringify(bad)} (legal: ${JSON.stringify(d)})`, {
          cause: e,
        });
      }
    }
  }
  if (fingerprint(state) !== before) throw new Error(`Chaos (${where}): a submission changed the original state`);
}
