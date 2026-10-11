/**
 * Turn structure (500–514), priority (117), combat (506–511) and state-based actions (704).
 */

import {
  type DamageSource,
  dealDamage,
  destroy,
  drawCard,
  drawCards,
  phaseIn,
  putIntoGraveyard,
  removeFromCombat,
  setMonarch,
  setSpeed,
  sourceFromObject,
} from "./actions";
import { cardRule } from "./cardDef";
import { absentAnswer, ask, cardRef } from "./choices";
import { announceDiscard, announceDiscardBatch, evalAmount, moveDiscarded, staticContext } from "./effects";
import { rethrowAsRules } from "./errors";
import { bumpFor, copiedDefId, copiedDefMap, copyingIn, effectivePower, snapshot } from "./layers";
import { MAX_FLOW_STEPS, MAX_SBA_PASSES } from "./limits";
import { manaValue, payMana } from "./mana";
import { answerCastNow, answerResolutionChoice, dropNowPermissions, RulesError, resolveTop } from "./stack";
import { announceNext } from "./stackChoices";
import {
  alivePlayers,
  apnapOrder,
  bump,
  changeCounters,
  chars,
  counterCount,
  creaturesControlledBy,
  emit,
  emptyPool,
  emptyTurnStats,
  hasKeyword,
  hasType,
  isCreature,
  isPlayer,
  isSummoningSick,
  M1M1,
  moveObject,
  nextPlayer,
  obj,
  onBattlefield,
  opponentsOf,
  P1P1,
  rulesEvent,
  shuffle,
  syncControl,
  tapObject,
  untapObject,
} from "./state";
import {
  cantLose,
  consumePlayerEffect,
  playerEffectValues,
  playerProtectedFrom,
  playerStatic,
  playerStatics,
  playerStaticTotal,
  skips,
  untapStepRule,
} from "./statics";
import { matchesObjectFilter, matchesView, protectedFrom, resolveFilter, sourceView } from "./targets";
import { msg } from "./text";
import { createDelayed, processTriggers, pushInline, releaseDelayedTriggers, rulesTrigger, simultaneously } from "./triggers";
import { countTurnEvents, logTurnEvent } from "./turnlog";
import type {
  CardDef,
  Effect,
  GameState,
  ManaType,
  ObjectFilter,
  ObjectId,
  PendingDecision,
  PlayerId,
  StackItem,
  Step,
} from "./types";
import { STEPS } from "./types";

export const MAX_HAND_SIZE = 7;

// ---------------------------------------------------------------------------
// Main loop: advance until the next decision
// ---------------------------------------------------------------------------

/**
 * 104.4b: a loop made only of mandatory actions, which nothing can stop: the game is a draw. Called by the
 * guards of the engine (flow, state-based actions), of the host, and by the loop detection (game.ts).
 */
export function declareLoopDraw(s: GameState): void {
  if (s.over) return;
  s.over = true;
  s.winner = null;
  s.flow = "over";
  s.pending = null;
  emit({ type: "gameOver", winner: null, reason: "loop" });
}

export function advance(s: GameState): void {
  let guard = 0;
  while (!s.pending && !s.over) {
    if (++guard > MAX_FLOW_STEPS) {
      declareLoopDraw(s);
      return;
    }
    switch (s.flow) {
      case "mulligan":
        nextMulligan(s);
        break;
      case "stepStart":
        beginStep(s);
        break;
      case "priority":
        // 117.5: state-based actions, then triggered abilities, until stable;
        // either can ask a question (legend rule, targets…).
        stateBasedActions(s);
        // An active player eliminated by these actions ends the turn (`eliminate` changes the flow).
        if (s.over || s.pending || s.flow !== "priority") break;
        // New targets of a copy, division: before the triggers (ward depends on it) and priority.
        if (announceNext(s)) break;
        if (processTriggers(s) || s.flow !== "priority") break;
        s.pending = { kind: "priority", player: s.priority.holder };
        break;
      case "stepEnd":
        endStep(s);
        break;
      case "tba":
      case "resolving":
        throw new Error(`Decision expected (${s.flow}) but none is set`);
      case "over":
        return;
    }
  }
}

/**
 * First player to receive priority: the active player, or, if they left the game during their turn (800.4a:
 * the turn continues without an active player), the next player.
 */
function firstPriority(s: GameState): PlayerId {
  const active = s.turn.active;
  return s.players[active]?.lost ? nextPlayer(s, active) : active;
}

function givePriority(s: GameState): void {
  s.priority = { holder: firstPriority(s), passes: 0 };
  s.flow = "priority";
}

/**
 * Untap step (502.3): the active player's permanents untap, except those they chose to keep tapped (`keep`),
 * those that don't untap during their untap step (`untap` replacement with `untapStep`) and those that are
 * exerted (701.43). Prop Room, Unwinding Clock: the creatures (the artifacts) of another player untap too (it is
 * not their controller's untap step).
 */
function untapStep(s: GameState, keep: ObjectId[]): void {
  const active = s.turn.active;
  for (const id of s.battlefield) {
    const o = obj(s, id);
    // Prop Room, Unwinding Clock: this player's creatures (artifacts) also untap during the other players' untap
    // steps.
    const propRoom =
      o.controller !== active &&
      playerStatics(s, o.controller, "untapOnOthersUntap").some(
        ({ id: src, ab }) => !!ab.untapOnOthersUntap && matchesObjectFilter(s, o.controller, id, ab.untapOnOthersUntap, src),
      );
    if (o.controller !== active && !propRoom) continue;
    // 701.43: an exerted permanent doesn't untap during the next untap step (of its controller).
    if (o.exerted && !propRoom) {
      o.exerted = undefined;
      continue;
    }
    if (!o.tapped || keep.includes(id)) continue;
    if (!propRoom && untapStepRule(s, id) === true) continue;
    // 122.1d: a stun counter is removed instead of untapping (`untapObject`).
    untapObject(s, o);
  }
  s.flow = "stepEnd"; // no priority during the untap step
}

/** Answer to the untap step question: the permanents kept tapped. */
export function answerUntapStep(s: GameState, keep: string[]): void {
  untapStep(s, keep);
}

/** Beginning of a step: triggers the "at the beginning of…" abilities. */
function stepEvent(s: GameState): void {
  if (s.turn.step === "end") releaseDelayedTriggers(s);
  // Monarch (724.2): "at the beginning of the monarch's end step, that player draws a card" (ability on the stack).
  if (s.turn.step === "end" && s.monarch === s.turn.active && !s.players[s.monarch]?.lost) rulesTrigger(s, s.monarch, "monarch");
  if (s.turn.step === "endCombat") releaseDelayedTriggers(s, "endCombat");
  if (s.turn.step === "main1" || s.turn.step === "main2") releaseDelayedTriggers(s, "main");
  // Radiation (Fallout): at the beginning of their precombat main phase, if the active player has rad counters
  // (condition checked again on resolution).
  if (s.turn.step === "main1" && s.turn.mainPhase === 1 && !s.players[s.turn.active]?.lost)
    rulesTrigger(s, s.turn.active, "radiation");
  if (s.turn.step === "upkeep") {
    releaseDelayedTriggers(s, "upkeep");
    suspendUpkeep(s);
  }
  rulesEvent(s, { e: "step", step: s.turn.step, active: s.turn.active });
}

/**
 * Suspend (702.62a): at the beginning of its owner's upkeep, each suspended card in exile loses a time counter;
 * when the last is removed, they may cast it without paying its mana cost (a creature has haste).
 */
const SUSPEND_TICK: Effect[] = [
  { op: "removeCounters", what: { kind: "self" }, n: 1, kind: "time" },
  { op: "if", cond: { kind: "not", cond: { kind: "counterAtLeast", counter: "time", n: 1 } }, skip: 2 },
  { op: "playerEffect", ability: { nextSpell: { filter: { types: ["Creature"] }, haste: true } }, once: true },
  { op: "castNow", what: { kind: "self" }, free: true },
];

function suspendUpkeep(s: GameState): void {
  for (const id of s.exile) {
    const o = s.objects[id];
    if (!o?.suspended || o.owner !== s.turn.active || (o.counters.time ?? 0) <= 0) continue;
    pushInline(s, o.owner, id, o.defId, {
      targets: [],
      effects: SUSPEND_TICK,
      label: msg("Suspend: remove a time counter"),
    });
  }
}

// ---------------------------------------------------------------------------
// Mulligan de Londres (103.5)
// ---------------------------------------------------------------------------

function nextMulligan(s: GameState): void {
  // 103.5: end of a round; those who decided to take a mulligan take it together, then decide again.
  if (s.setup.mulliganQueue.length === 0 && s.setup.mulliganTaken?.length) {
    const taken = s.setup.mulliganTaken;
    s.setup.mulliganTaken = [];
    for (const q of taken) takeMulligan(s, q);
    s.setup.mulliganQueue = taken;
  }
  const p = s.setup.mulliganQueue[0];
  if (!p) {
    if (askLeylines(s)) return;
    s.turn.number = 1;
    s.turn.active = s.turn.startingPlayer;
    s.turn.step = "untap";
    startTurnOf(s, s.turn.active);
    emit({ type: "turnStart", turn: 1, player: s.turn.active });
    s.flow = "stepStart";
    return;
  }
  const mulligans = s.players[p]?.mulligans ?? 0;
  s.pending = { kind: "mulligan", player: p, mulligans, bottom: mulliganBottom(s, mulligans) };
}

/**
 * Cards to put on the bottom of the library when keeping after `mulligans` mulligans (103.5); 103.5c: in a
 * multiplayer game (three players or more), the first mulligan is free; in Commander too, duel included
 * (rule of the format, choice of the user).
 */
function mulliganBottom(s: GameState, mulligans: number): number {
  return Math.max(0, mulligans - (s.playerOrder.length > 2 || s.commander ? 1 : 0));
}

/** "Leyline" cards of the opening hand (103.6), offered in play order. Returns true if a question is asked. */
function askLeylines(s: GameState): boolean {
  s.setup.leylineAsked ??= [];
  const asked = s.setup.leylineAsked;
  const start = s.playerOrder.indexOf(s.turn.startingPlayer);
  const order = s.playerOrder.map((_, i) => s.playerOrder[(start + i) % s.playerOrder.length] as PlayerId);
  for (const p of order) {
    if (asked.includes(p)) continue;
    asked.push(p);
    const cards = (s.players[p]?.hand ?? []).filter((id) => leylineFor(s, p, id));
    if (cards.length === 0) continue;
    const reveals = cards.some((id) => {
      const l = leylineFor(s, p, id);
      return typeof l === "object" && !!l.revealFirstUpkeep;
    });
    ask(
      s,
      p,
      {
        type: "pick",
        intent: "leyline",
        prompt: reveals
          ? msg("Cards of your opening hand you may put onto the battlefield or reveal")
          : msg("Cards of your opening hand you may put onto the battlefield"),
        options: cards,
        min: 0,
        max: cards.length,
        suggested: cards,
      },
      { kind: "leyline", player: p },
    );
    return true;
  }
  return false;
}

/** Can the card of the opening hand begin on the battlefield (Gemstone Caverns: if you are not starting)? */
function leylineFor(s: GameState, player: PlayerId, id: ObjectId): CardDef["leyline"] {
  const l = s.defs[obj(s, id).defId]?.leyline;
  return l && (l === true || !l.notStartingPlayer || s.turn.startingPlayer !== player) ? l : undefined;
}

export function answerLeylines(s: GameState, player: PlayerId, cards: ObjectId[]): void {
  for (const id of cards) {
    const o = s.objects[id];
    const l = o?.zone === "hand" && o.owner === player ? leylineFor(s, player, id) : undefined;
    if (!l) continue;
    // The Chancellors: revealed, the card stays in hand; its effects wait for the first upkeep (that of the first
    // turn, which hasn't begun yet).
    if (o && l !== true && l.revealFirstUpkeep) {
      emit({ type: "reveal", player, defIds: [o.defId] });
      createDelayed(s, player, id, o.defId, { targets: [], effects: l.revealFirstUpkeep, bound: {}, vars: {} }, "nextUpkeep");
      const d = s.delayed[s.delayed.length - 1];
      if (d) d.notBeforeTurn = s.turn.number;
      continue;
    }
    const placed = moveObject(s, id, "battlefield");
    if (l === true) continue;
    if (l.counter && placed && s.objects[placed]) changeCounters(s, obj(s, placed), l.counter, 1);
    // "If you do, exile a card from your hand": automatic choice, the nonland card with the lowest mana value (a
    // land if there is none).
    if (l.exileFromHand) {
      const hand = s.players[player]?.hand ?? [];
      const mv = (h: ObjectId) => {
        const d = s.defs[obj(s, h).defId];
        return d?.types.includes("Land") ? 100 : manaValue(d?.manaCost);
      };
      const pick = [...hand].sort((a, b) => mv(a) - mv(b))[0];
      if (pick) moveObject(s, pick, "exile");
    }
  }
  s.flow = "mulligan";
}

/** 103.5: the player decides to take a mulligan; they will take it with the others at the end of this round. */
export function declareMulligan(s: GameState, p: PlayerId): void {
  s.setup.mulliganQueue = s.setup.mulliganQueue.filter((q) => q !== p);
  s.setup.mulliganTaken = [...(s.setup.mulliganTaken ?? []), p];
}

export function takeMulligan(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  player.mulligans += 1;
  for (const id of [...player.hand]) moveObject(s, id, "library", { position: "bottom" });
  shuffle(s, player.library);
  for (let i = 0; i < 7; i++) drawCard(s, p);
  emit({ type: "mulligan", player: p, count: player.mulligans });
}

export function keepHand(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  const bottom = mulliganBottom(s, player.mulligans);
  if (bottom > 0) {
    s.pending = { kind: "bottomCards", player: p, count: Math.min(bottom, player.hand.length) };
    return;
  }
  s.setup.mulliganQueue.shift();
  emit({ type: "keep", player: p, handSize: player.hand.length });
}

export function bottomCards(s: GameState, p: PlayerId, cards: ObjectId[], count: number): void {
  const player = s.players[p];
  if (!player) return;
  if (new Set(cards).size !== count || cards.some((c) => !player.hand.includes(c))) {
    throw new RulesError(msg("Choose {count} card(s) from your hand", { count }));
  }
  for (const c of cards) moveObject(s, c, "library", { position: "bottom" });
  s.setup.mulliganQueue.shift();
  emit({ type: "keep", player: p, handSize: player.hand.length });
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function beginStep(s: GameState): void {
  const active = s.turn.active;
  // 505.1a: rank of the main phase, before its triggers (only the first one precedes combat).
  if (s.turn.step === "main1") s.turn.mainPhase = 1;
  else if (s.turn.step === "main2") s.turn.mainPhase = (s.turn.mainPhase ?? 1) + 1;
  if (s.turn.step !== "untap" && s.turn.step !== "cleanup") stepEvent(s);
  switch (s.turn.step) {
    case "untap": {
      // 502.1: phasing in precedes untapping.
      phaseIn(s, active);
      // 502.3: the active player first chooses the permanents they may leave tapped (Hedge Whisperer: "you may
      // choose not to untap this creature during your untap step"), then everything untaps at the same time.
      const optional = s.battlefield.filter((id) => {
        const o = obj(s, id);
        return o.controller === active && o.tapped && !o.exerted && untapStepRule(s, id) === "may";
      });
      if (optional.length === 0) {
        untapStep(s, []);
        return;
      }
      ask(
        s,
        active,
        {
          type: "pick",
          intent: "other",
          prompt: msg("Permanents you don't untap during this untap step"),
          options: optional,
          min: 0,
          max: optional.length,
          // Suggested answer: keep them tapped while an effect lasts "for as long as they remain tapped".
          suggested: optional.filter((id) => s.effects.some((e) => e.whileSourceTapped === id)),
        },
        { kind: "untap", player: active },
      );
      s.flow = "tba";
      return;
    }
    case "draw":
      // 103.8a: in a duel, the starting player skips the draw of their first turn
      // (103.8c: in multiplayer, nobody skips their draw).
      if (s.turn.number > 1 || s.playerOrder.length > 2) {
        drawCards(s, active, 1);
      }
      givePriority(s);
      return;
    case "main1":
      // 714.3b: at the beginning of the precombat main phase, a lore counter on each Saga of the active player.
      for (const id of s.battlefield) {
        const o = obj(s, id);
        if (o.controller === active && s.defs[copiedDefId(s, id)]?.saga) changeCounters(s, o, "lore", 1);
      }
      givePriority(s);
      return;
    case "beginCombat":
      s.combat = emptyCombat();
      s.turn.combats = (s.turn.combats ?? 0) + 1;
      givePriority(s);
      return;
    case "declareAttackers":
      if (attackCandidates(s, active).length > 0) {
        s.pending = { kind: "declareAttackers", player: active };
        s.flow = "tba";
      } else givePriority(s);
      return;
    case "declareBlockers": {
      // Each attacked player declares their blockers, in APNAP order, without seeing the others': they are applied
      // together at the end (509.1).
      const c = s.combat ?? emptyCombat();
      s.combat = c;
      c.blockQueue = apnapOrder(s).filter(
        (p) => p !== active && c.attackers.some((a) => defendingPlayer(s, a.defender) === p) && hasAnyLegalBlock(s, p),
      );
      // Blockers are being declared: no attacker is "unblocked" yet (filter `blocked`).
      bumpFor(s, "blocks");
      nextBlockingPlayer(s);
      return;
    }
    case "firstStrikeDamage":
      startCombatDamage(s, true);
      return;
    case "combatDamage":
      startCombatDamage(s, false);
      return;
    case "cleanup": {
      // 402.2: maximum hand size (`null`: "you have no maximum hand size").
      const max = maxHandSize(s, active);
      const excess = max === null ? 0 : (s.players[active]?.hand.length ?? 0) - max;
      if (excess > 0) {
        s.pending = { kind: "discard", player: active, count: excess };
        s.flow = "tba";
        return;
      }
      finishCleanup(s);
      return;
    }
    default:
      givePriority(s);
  }
}

export function discardToHandSize(s: GameState, p: PlayerId, cards: ObjectId[], count: number): void {
  const player = s.players[p];
  if (!player) return;
  if (new Set(cards).size !== count || cards.some((c) => !player.hand.includes(c))) {
    throw new RulesError(msg("Discard exactly {count} card(s)", { count }));
  }
  const defIds = cards.map((c) => obj(s, c).defId);
  for (const c of cards) announceDiscard(s, p, moveDiscarded(s, p, c));
  announceDiscardBatch(s, p, cards.length);
  emit({ type: "discard", player: p, defIds });
  finishCleanup(s);
}

function finishCleanup(s: GameState): void {
  // 514.2: damage is removed and "until end of turn" effects end.
  for (const id of s.battlefield) {
    const o = obj(s, id);
    // Ancient Adamantoise: its damage stays.
    if (!hasKeyword(s, id, "keepsDamage")) o.damage = 0;
    o.deathtouched = false;
    delete o.regenShields;
    o.damagedBy = undefined;
  }
  s.effects = s.effects.filter(
    (e) =>
      e.duration !== "endOfTurn" &&
      !(e.duration === "endOfYourNextTurn" && e.until === s.turn.active && s.turn.number > (e.sinceTurn ?? 0)),
  );
  s.replacements = [];
  // "Until end of turn" emblems (Jace Reawakened −6, Prairie Dog).
  expireEmblems(s);
  // End of the "until end of turn" control changes (Involuntary Employment): layer 2 recomputed.
  syncControl(s);
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (pl) {
      pl.manaKeep = undefined;
      pl.manaKeepCombat = undefined;
      if (pl.restrictedMana?.some((m) => m.keep)) {
        pl.restrictedMana = pl.restrictedMana.filter((m) => !m.keep);
        if (!pl.restrictedMana.length) pl.restrictedMana = undefined;
        bumpFor(s, "mana");
      }
    }
  }
  bump(s);
  // 514.3a: if state-based actions are performed or abilities trigger during cleanup, the players receive
  // priority, then a new cleanup step takes place.
  const acted = stateBasedActions(s);
  if (s.over) return;
  if (acted || s.pending || s.triggers.length > 0) {
    s.turn.cleanupAgain = true;
    givePriority(s);
    return;
  }
  s.flow = "stepEnd";
}

function nextStep(s: GameState): Step | null {
  const step = s.turn.step;
  if (step === "cleanup") return null;
  if (step === "declareAttackers" && (s.combat?.attackers.length ?? 0) === 0) return "endCombat";
  if (step === "declareBlockers") {
    const firstStrike = combatants(s).some((id) => hasKeyword(s, id, "firstStrike") || hasKeyword(s, id, "doubleStrike"));
    return firstStrike ? "firstStrikeDamage" : "combatDamage";
  }
  return STEPS[STEPS.indexOf(step) + 1] ?? null;
}

/** Last step of its phase: the phases added "after this phase" come next (500.8). */
function endsPhase(s: GameState, next: Step | null): boolean {
  switch (s.turn.step) {
    // A beginning phase without a draw (Necropotence) or reduced to its upkeep (Obeka) ends with the upkeep.
    case "upkeep":
      return !!s.turn.upkeepOnly || next !== "draw";
    case "draw":
    case "main1":
    case "main2":
    case "endCombat":
      return true;
    default:
      return false;
  }
}

/**
 * The next step given the added steps and phases: first a step added after this one (500.10); at the end of a
 * phase, the first added phase (500.8), the turn then resuming where it was going.
 */
function addedNext(s: GameState, next: Step | null): Step | null {
  const t = s.turn;
  const step = t.addedSteps?.shift();
  if (!t.addedSteps?.length) delete t.addedSteps;
  if (step) return step;
  if (!endsPhase(s, next)) return next;
  delete t.upkeepOnly;
  const phase = t.addedPhases?.shift();
  if (!t.addedPhases?.length) delete t.addedPhases;
  if (phase) {
    if (t.resumeAt === undefined && next) t.resumeAt = next;
    if (phase === "upkeep") t.upkeepOnly = true;
    return phase;
  }
  const resume = t.resumeAt;
  delete t.resumeAt;
  return resume ?? next;
}

/** The added steps and phases end with the turn (or when the turn is ended, 723). */
function clearAdded(s: GameState): void {
  delete s.turn.addedPhases;
  delete s.turn.addedSteps;
  delete s.turn.resumeAt;
  delete s.turn.upkeepOnly;
}

function endStep(s: GameState): void {
  // 500.4: mana pools empty at the end of each step and phase.
  for (const p of s.playerOrder) {
    const player = s.players[p];
    if (!player) continue;
    // Savage Ventmaw: the mana kept until end of turn (and not yet spent) stays in the pool; the firebending mana,
    // until end of combat. Spent mana is counted first against the mana that empties the soonest.
    const keep = player.manaKeep;
    const keepCombat = s.turn.step === "endCombat" ? undefined : player.manaKeepCombat;
    if (s.turn.step === "endCombat") player.manaKeepCombat = undefined;
    const pool = emptyPool();
    for (const m of Object.keys(player.manaPool) as ManaType[]) {
      const k = Math.min(keep?.[m] ?? 0, player.manaPool[m]);
      const kc = Math.min(keepCombat?.[m] ?? 0, player.manaPool[m] - k);
      pool[m] = k + kc;
      if (keep && keep[m] !== undefined) keep[m] = k;
      if (keepCombat && keepCombat[m] !== undefined) keepCombat[m] = kc;
    }
    // The Last Agni Kai: these types don't empty; Ozai, the Phoenix King: unspent mana becomes red.
    const unspent = playerStatics(s, p, "keepUnspentMana").map(({ ab }) => ab.keepUnspentMana);
    for (const k of unspent) for (const m of k?.types ?? []) pool[m] = player.manaPool[m];
    const becomes = unspent.find((k) => k?.becomes)?.becomes;
    if (becomes) {
      const total = (Object.keys(player.manaPool) as ManaType[]).reduce((n, m) => n + player.manaPool[m], 0);
      for (const m of Object.keys(pool) as ManaType[]) pool[m] = 0;
      pool[becomes] = total;
    }
    // The pool changes the layer cache only if it changed (an empty pool stays empty at each step).
    const changed =
      !!player.restrictedMana?.length || (Object.keys(pool) as ManaType[]).some((m) => pool[m] !== player.manaPool[m]);
    player.manaPool = pool;
    // The mana marked "kept until end of turn" stays (Klauth); it empties at cleanup.
    const kept = player.restrictedMana?.filter((m) => m.keep);
    player.restrictedMana = kept?.length ? kept : undefined;
    if (changed) bumpFor(s, "mana");
  }
  if (s.turn.step === "endCombat") {
    // The next controlled combat phase (Secret of Bloodbending) is over.
    if (s.turnControl?.combatOnly && s.turnControl.turn === s.turn.number) s.turnControl = undefined;
    s.combat = null;
    bump(s);
  }
  // 514.3a: after a priority during cleanup, a new cleanup step (and not the next turn).
  if (s.turn.step === "cleanup" && s.turn.cleanupAgain) {
    s.turn.cleanupAgain = false;
    s.lki = {};
    s.flow = "stepStart";
    return;
  }

  // Last known information: no longer needed once the stack is empty and the step is over.
  s.lki = {};
  let next = nextStep(s);
  // 500.11: a skipped step doesn't happen (Necropotence: "skip your draw step").
  if (next === "draw" && skips(s, s.turn.active, "drawStep")) next = "main1";
  // 500.8, 500.10: steps added after this one, then phases added after the phase that ends.
  next = addedNext(s, next);
  if (next) {
    s.turn.step = next;
    if (next === "end") s.turn.endSteps = (s.turn.endSteps ?? 0) + 1;
    emit({ type: "step", step: next });
  } else {
    s.turn.number += 1;
    // Delayed abilities "… this turn": they end with the turn (or with the turn they last until).
    if (s.delayed.some((d) => d.at === "thisTurn"))
      s.delayed = s.delayed.filter((d) => d.at !== "thisTurn" || (d.untilTurn ?? 0) >= s.turn.number);
    // 500.7: an extra turn (the last one created first), otherwise the next player.
    let extra = s.extraTurns?.pop();
    // Trouble in Pairs: an opponent who would begin an extra turn skips it.
    while (extra && skips(s, extra, "extraTurns")) extra = s.extraTurns?.pop();
    const extraTurn = !!extra && !!s.players[extra] && !s.players[extra]?.lost;
    s.turn.active = extraTurn && extra ? extra : nextPlayer(s, s.turn.active);
    // A static may depend on it (Medomai the Ageless: "can't attack during extra turns").
    if (extraTurn !== !!s.turn.extra) bump(s);
    if (extraTurn) s.turn.extra = true;
    else delete s.turn.extra;
    // Ral Zarek: a player who must skip their turn skips it (one effect consumed per skipped turn).
    for (let guard = 0; guard < s.playerOrder.length && consumePlayerEffect(s, s.turn.active, "skips", "turn"); guard++)
      s.turn.active = nextPlayer(s, s.turn.active);
    s.turn.endSteps = 0;
    clearAdded(s);
    delete s.turn.mainPhase;
    s.turn.combats = 0;
    s.turn.step = "untap";
    startTurnOf(s, s.turn.active);
    s.turn.landsPlayed = 0;
    emit({ type: "turnStart", turn: s.turn.number, player: s.turn.active });
  }
  s.flow = "stepStart";
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/** 117.3b: after resolution, the active player receives priority. */
export function afterResolution(s: GameState): void {
  if (s.endTurnRequested) {
    // 723.1: the turn goes directly to the cleanup step.
    s.endTurnRequested = false;
    clearAdded(s);
    s.turn.step = "cleanup";
    emit({ type: "step", step: "cleanup" });
    s.flow = "stepStart";
    return;
  }
  s.priority = { holder: firstPriority(s), passes: 0 };
  s.flow = "priority";
}

/**
 * 723: "End the turn". Everything on the stack is exiled (the resolving spell included),
 * pending abilities disappear, combat stops, then the turn moves to cleanup.
 */
export function endTheTurn(s: GameState, r: { item: StackItem }): void {
  for (const item of s.stack) {
    if (item.id === r.item.id) continue;
    if (item.kind === "spell" && s.objects[item.sourceId]) moveObject(s, item.sourceId, "exile");
  }
  s.stack = s.stack.filter((x) => x.id === r.item.id);
  r.item.flashback = true; // the resolving spell is exiled at the end of its resolution
  s.triggers = [];
  s.combat = null;
  for (const p of s.playerOrder) {
    const pl = s.players[p];
    if (pl) {
      pl.manaPool = emptyPool();
      pl.restrictedMana = undefined;
    }
  }
  s.endTurnRequested = true;
  bump(s);
  emit({ type: "endTurn", player: r.item.controller });
}

/**
 * Temporary emblems (`GameObject.expires`): at cleanup (without a player), those whose end turn is reached; at
 * the beginning of `startOf`'s turn, those that last until their next turn.
 */
function expireEmblems(s: GameState, startOf?: PlayerId): void {
  for (const p of s.playerOrder) {
    for (const id of [...(s.players[p]?.command ?? [])]) {
      const x = s.objects[id]?.expires;
      if (!x) continue;
      const due = "endOfTurn" in x ? startOf === undefined && s.turn.number >= x.endOfTurn : x.turnOf === startOf;
      if (due) moveObject(s, id, "exile");
    }
  }
}

export function startTurnOf(s: GameState, p: PlayerId): void {
  // 722: the controlled turn begins (or the previous control ends).
  if (s.turnControl?.turn !== undefined && s.turnControl.turn !== s.turn.number) s.turnControl = undefined;
  if (s.turnControl && s.turnControl.turn === undefined && s.turnControl.player === p) {
    s.turnControl.turn = s.turn.number;
    // Emrakul, the Promised End: "after that turn, that player takes an extra turn".
    if (s.turnControl.thenExtraTurn) s.extraTurns = [...(s.extraTurns ?? []), p];
    emit({ type: "turnControl", player: p, by: s.turnControl.by, combatOnly: s.turnControl.combatOnly });
  }
  const player = s.players[p];
  if (player) {
    player.lastTurnStarted = s.turn.number;
    player.turnsTaken = (player.turnsTaken ?? 0) + 1;
  }
  // The "this turn" statistics reset for everyone (the noncombat damage of the past turn is kept).
  for (const q of s.playerOrder) {
    const pl = s.players[q];
    if (!pl) continue;
    pl.noncombatDamageLastTurn = countTurnEvents(s, { event: "damage", combat: false, toPlayer: true, sum: true }, q, q);
    pl.turnStats = emptyTurnStats();
  }
  s.turnLog = [];
  // Player effects "this turn" (or until a past turn): expired.
  s.playerEffects = s.playerEffects.filter((e) => e.until === null || e.until >= s.turn.number);
  s.turn.onceFired = [];
  // "the first time this ability resolves this turn" (Nissa, Leyline Tamer; Belladonna Took): counters reset
  // each turn.
  s.turn.resolutionCounts = undefined;
  // "Until your next turn": effects and temporary emblems of this player.
  const before = s.effects.length;
  s.effects = s.effects.filter((e) => !(e.duration === "untilYourNextTurn" && e.until === p));
  if (s.effects.length !== before) bump(s);
  expireEmblems(s, p);
  s.turn.graveyardTypesUsed = [];
  // Permissions to play from exile: the expired ones disappear. Discover (701.57a): a card that
  // wasn't cast goes to its owner's hand.
  for (const perm of s.playPermissions ?? []) {
    if (perm.until < s.turn.number && perm.orHand && s.objects[perm.card]?.zone === "exile") moveObject(s, perm.card, "hand");
  }
  if (s.playPermissions) s.playPermissions = s.playPermissions.filter((p) => p.until >= s.turn.number);
}

export function emptyCombat(): NonNullable<GameState["combat"]> {
  return { attackers: [], blockers: [], firstStrikers: [], blockQueue: [], damageStep: null, assignQueue: [], assignments: {} };
}

/** 117.3d: priority passes to the next player; if all pass in succession, the stack resolves or the step ends. */
export function passPriority(s: GameState, player: PlayerId): void {
  s.priority.passes += 1;
  if (s.priority.passes >= alivePlayers(s).length) {
    if (s.stack.length > 0) {
      if (resolveTop(s)) afterResolution(s);
    } else {
      s.flow = "stepEnd";
    }
  } else {
    s.priority.holder = nextPlayer(s, player);
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function combatants(s: GameState): ObjectId[] {
  if (!s.combat) return [];
  return [...s.combat.attackers.map((a) => a.id), ...s.combat.blockers.map((b) => b.id)].filter((id) => onBattlefield(s, id));
}

/**
 * Combat damage a creature assigns: its power, or its toughness if it is greater (Ghalta),
 * or the absolute value of a negative power (Loot, the Anomaly).
 */
export function combatPower(s: GameState, id: ObjectId): number {
  return effectivePower(chars(s, id), "combatDamage");
}

export function canAttack(s: GameState, id: ObjectId): boolean {
  const o = s.objects[id];
  if (o?.zone !== "battlefield" || !isCreature(s, id)) return false;
  if (o.controller !== s.turn.active || o.tapped || isSummoningSick(s, id)) return false;
  const defender = hasKeyword(s, id, "defender") && !hasKeyword(s, id, "attacksDespiteDefender");
  return !defender && !hasKeyword(s, id, "cantAttack");
}

/**
 * Attack requirement of a creature (508.1d): attack ("attacks each combat if able", goad), attack a player other
 * than `not` (goad, 701.38a), or one of the players `players` (Silver Surfer, Galactus). An attack against a
 * planeswalker satisfies only the first.
 */
export type AttackRequirement =
  | { kind: "attack" }
  | { kind: "otherPlayer"; not: PlayerId }
  | { kind: "player"; players: PlayerId[] };

/** The attack requirements of a creature. */
export function attackRequirements(s: GameState, id: ObjectId): AttackRequirement[] {
  const out: AttackRequirement[] = [];
  if (hasKeyword(s, id, "mustAttack")) out.push({ kind: "attack" });
  const goaders = new Set<string>();
  for (const r of chars(s, id).blockRules) {
    // 701.38c: each player who goads it adds their requirements; the same player, only once. The rules of `fx.goad`
    // all have the same label: a rule of the same shape that isn't a goad (Maximum Carnage) has its own and keeps
    // its requirements next to a goad by the same player.
    const key = `${r.goadedBy}|${r.label}`;
    if (r.goadedBy && r.goadedBy !== "you" && !goaders.has(key)) {
      goaders.add(key);
      out.push({ kind: "attack" }, { kind: "otherPlayer", not: r.goadedBy });
    }
    if (r.mustAttackPlayer === "mostLifeOpponent") {
      // Galactus: an opponent with the most life among its controller's opponents.
      const opps = opponentsOf(s, obj(s, id).controller);
      const top = Math.max(...opps.map((p) => s.players[p]?.life ?? 0));
      out.push({ kind: "player", players: opps.filter((p) => (s.players[p]?.life ?? 0) === top) });
    } else if (r.mustAttackPlayer && r.mustAttackPlayer !== "eventPlayer")
      out.push({ kind: "player", players: [r.mustAttackPlayer] });
  }
  return out;
}

/** Number of requirements satisfied by an attack against this defender (`null`: it doesn't attack). */
function obeyedAttack(s: GameState, reqs: AttackRequirement[], defender: string | null): number {
  if (!defender) return 0;
  const player = s.players[defender] ? defender : null;
  return reqs.filter(
    (r) => r.kind === "attack" || (player !== null && (r.kind === "otherPlayer" ? player !== r.not : r.players.includes(player))),
  ).length;
}

/** What this creature can attack: its controller's defenders, minus its restrictions (tax included). */
export function allowedDefenders(s: GameState, id: ObjectId): string[] {
  if (!canAttack(s, id)) return [];
  return attackableDefenders(s, obj(s, id).controller).filter((d) => !attackRestriction(s, id, d));
}

/**
 * The defenders that satisfy the most requirements of this creature without paying a tax (goad: a player other
 * than the one who goaded it); all those it can attack if it has no requirement or can satisfy none.
 */
export function preferredDefenders(s: GameState, id: ObjectId): string[] {
  const allowed = allowedDefenders(s, id);
  const reqs = attackRequirements(s, id);
  if (reqs.length === 0) return allowed;
  const free = allowed.filter((d) => attackTaxFor(s, d) === 0);
  const best = Math.max(0, ...free.map((d) => obeyedAttack(s, reqs, d)));
  return best > 0 ? free.filter((d) => obeyedAttack(s, reqs, d) === best) : allowed;
}

type Attack = { id: ObjectId; defender: string };

/**
 * Tomik, Orzhov Lawmage: a single creature attacks each of its planeswalkers;
 * Mirri: a single one attacks its controller.
 */
function oneAttackerOnly(s: GameState, defender: string): boolean {
  const walker = s.objects[defender];
  return walker
    ? playerStatics(s, walker.controller, "maxOneAttacker").some(({ ab }) => ab.maxOneAttacker === "walkers")
    : playerStatics(s, defender, "maxOneAttacker").some(({ ab }) => ab.maxOneAttacker === "you");
}

/** Does the declaration respect "only one creature can attack" (Mirri, Tomik)? */
function oneAttackerLegal(s: GameState, attacks: Attack[]): boolean {
  for (const d of new Set(attacks.map((a) => a.defender)))
    if (oneAttackerOnly(s, d) && attacks.filter((a) => a.defender === d).length > 1) return false;
  return true;
}

/** The lone creature of this declaration can't attack alone (Toby, Beastie Befriender). */
function loneNotAlone(s: GameState, attacks: Attack[]): boolean {
  const lone = attacks.length === 1 ? attacks[0]?.id : undefined;
  return !!lone && chars(s, lone).blockRules.some((r) => r.notAlone);
}

/** Does the declaration respect "only one creature can attack" and "can't attack alone"? */
function attackShapeLegal(s: GameState, attacks: Attack[]): boolean {
  return oneAttackerLegal(s, attacks) && !loneNotAlone(s, attacks);
}

/**
 * "Not alone": another creature that can join this lone attack at no cost, otherwise null. It makes legal a
 * declaration that respects the requirements of the first (508.1d).
 */
function attackCompanion(s: GameState, player: PlayerId, attacks: Attack[]): Attack | null {
  for (const id of attackCandidates(s, player)) {
    if (attacks.some((a) => a.id === id)) continue;
    for (const defender of allowedDefenders(s, id)) {
      const a = { id, defender };
      if (attackTaxFor(s, defender) === 0 && oneAttackerLegal(s, [...attacks, a])) return a;
    }
  }
  return null;
}

/** Maximum number of nodes of the search for the maximum (as for blocks). */
const ATTACK_SEARCH_NODES = 50_000;

/**
 * 508.1d: the largest number of attack requirements a legal declaration can obey without paying a cost, and such
 * a declaration (for the creatures with requirements only, plus a companion if one of them can't attack
 * alone). `prefer`: the wanted attacks, tried first. `paid`: the attacks whose declaration pays the tax; each one
 * is added to its creature's choices, without exempting the others from their requirements at no cost.
 */
function bestRequiredAttacks(
  s: GameState,
  player: PlayerId,
  prefer: Attack[] = [],
  paid: Attack[] = [],
): { max: number; best: Attack[] } {
  const relevant = attackCandidates(s, player)
    .map((id) => ({ id, reqs: attackRequirements(s, id) }))
    .filter((x) => x.reqs.length > 0);
  if (relevant.length === 0) return { max: 0, best: [] };
  // For each creature: the defenders without a tax that satisfy at least one requirement, from best to worst (on a
  // tie, the wanted attack, then players before planeswalkers), then "doesn't attack".
  const domains = relevant.map(({ id, reqs }) => {
    const wanted = prefer.find((a) => a.id === id)?.defender;
    const opts = allowedDefenders(s, id)
      .filter((d) => attackTaxFor(s, d) === 0 || paid.some((a) => a.id === id && a.defender === d))
      .map((d) => ({ d: d as string | null, n: obeyedAttack(s, reqs, d) }))
      .filter((o) => o.n > 0)
      .sort((a, b) => b.n - a.n || Number(b.d === wanted) - Number(a.d === wanted));
    return [...opts, { d: null, n: 0 }];
  });
  const rest = domains.map((d) => d[0]?.n ?? 0);
  for (let i = rest.length - 2; i >= 0; i--) rest[i] = (rest[i] as number) + (rest[i + 1] as number);
  const bound = rest[0] ?? 0;
  let best: Attack[] = [];
  let max = -1;
  let nodes = 0;
  const current: Attack[] = [];
  const visit = (i: number, score: number): void => {
    if (++nodes > ATTACK_SEARCH_NODES || max === bound) return;
    if (i === relevant.length) {
      if (score <= max || !oneAttackerLegal(s, current)) return;
      const companion = loneNotAlone(s, current) ? attackCompanion(s, player, current) : undefined;
      if (companion === null) return;
      max = score;
      best = companion ? [...current, companion] : [...current];
      return;
    }
    if (score + (rest[i] ?? 0) <= max) return;
    for (const o of domains[i] ?? []) {
      if (o.d) current.push({ id: relevant[i]?.id as ObjectId, defender: o.d });
      visit(i + 1, score + o.n);
      if (o.d) current.pop();
    }
  };
  visit(0, 0);
  return { max: Math.max(0, max), best };
}

/** Number of attack requirements obeyed by a declaration (a paid attack counts too). */
function obeyedAttacks(s: GameState, attacks: Attack[]): number {
  return attacks.reduce((n, a) => n + obeyedAttack(s, attackRequirements(s, a.id), a.defender), 0);
}

/**
 * 508.1d: why this declaration obeys fewer attack requirements than another legal declaration (at no cost),
 * otherwise null.
 */
export function unmetAttackRequirement(s: GameState, player: PlayerId, attacks: Attack[]): string | null {
  const paid = attacks.filter((a) => attackTaxFor(s, a.defender) > 0);
  const { max, best } = bestRequiredAttacks(s, player, [], paid);
  if (max === 0 || obeyedAttacks(s, attacks) >= max) return null;
  for (const b of best) {
    const reqs = attackRequirements(s, b.id);
    const mine = attacks.find((a) => a.id === b.id);
    if (obeyedAttack(s, reqs, mine?.defender ?? null) >= obeyedAttack(s, reqs, b.defender)) continue;
    const name = chars(s, b.id).name;
    if (!mine) return msg("{name} must attack if able", { name });
    if (reqs.some((r) => r.kind === "player")) return msg("{name} must attack the required player if able", { name });
    return msg("{name} is goaded: it must attack a player other than the one who goaded it if able", { name });
  }
  return msg("This declaration doesn't obey as many attack requirements as possible");
}

/**
 * Creatures that must attack (508.1d): those of the best declaration of the requirements. A requirement never
 * forces paying a cost: if each possible defender demands an attack tax (Archangel of Tithes), they don't have
 * to attack.
 */
export function forcedAttackers(s: GameState, player: PlayerId): ObjectId[] {
  return forcedAttacks(s, player).map((a) => a.id);
}

/**
 * The forced attacks, each toward the defender that satisfies the most requirements (goad: a player other than
 * the one who goaded it; failing that, a player before a planeswalker): default declaration and autopilot.
 */
export function forcedAttacks(s: GameState, player: PlayerId): Attack[] {
  return bestRequiredAttacks(s, player).best;
}

/**
 * Wanted attacks (by the AI) completed to obey as many requirements as possible: the creatures that have some take
 * the best attack close to the wanted one; the others keep theirs, or attack another defender without a tax if
 * "only one creature can attack" (Mirri, Tomik) now forbids it, or stay home.
 */
export function repairAttacks(s: GameState, player: PlayerId, attacks: Attack[]): Attack[] {
  if (!unmetAttackRequirement(s, player, attacks)) return attacks;
  const { best } = bestRequiredAttacks(s, player, attacks);
  const fixed = new Set(best.map((a) => a.id));
  const merged = [...best];
  for (const a of attacks) {
    if (fixed.has(a.id)) continue;
    const others = allowedDefenders(s, a.id).filter((d) => d !== a.defender && attackTaxFor(s, d) === 0);
    const defender = [a.defender, ...others].find((d) => oneAttackerLegal(s, [...merged, { id: a.id, defender: d }]));
    if (defender) merged.push({ id: a.id, defender });
  }
  return attackShapeLegal(s, merged) && !unmetAttackRequirement(s, player, merged) ? merged : best;
}

/**
 * Why this creature can't attack this defender (player or planeswalker), otherwise null: "can't attack you or
 * planeswalkers you control" (Eriette of the Charmed Apple), "can't attack a player it has already attacked
 * this turn" (Port Razer).
 */
function attackRestriction(s: GameState, id: ObjectId, defender: string): string | null {
  const dp = defendingPlayer(s, defender);
  const rules = chars(s, id).blockRules;
  if (rules.some((r) => r.cantAttackPlayer === dp)) return msg("{name} can't attack this player", { name: chars(s, id).name });
  if (
    rules.some((r) => r.notDefendersAttackedThisTurn) &&
    s.turnLog.some((e) => e.e === "attack" && e.id === id && e.defender === dp)
  )
    return msg("{name} has already attacked this player this turn", { name: chars(s, id).name });
  return null;
}

/**
 * Attack tax to attack this defender: {N} per creature. Propaganda taxes only the attacks against its controller,
 * Archangel of Tithes (`defending: "youOrYourPlaneswalkers"`) also those against its planeswalkers.
 */
export function attackTaxFor(s: GameState, defender: string): number {
  const walker = !s.players[defender];
  let n = 0;
  for (const { ab } of playerStatics(s, defendingPlayer(s, defender), "attackTax")) {
    const tax = ab.attackTax;
    if (typeof tax === "number") n += walker ? 0 : tax;
    else if (tax) n += tax.amount;
  }
  return n;
}

export function attackCandidates(s: GameState, player: PlayerId): ObjectId[] {
  return creaturesControlledBy(s, player).filter((id) => canAttack(s, id));
}

/**
 * Defending player of an attack: the attacked player, or the controller of the attacked planeswalker (last known if
 * it is gone).
 */
export function defendingPlayer(s: GameState, defender: string): PlayerId {
  if (s.players[defender]) return defender;
  return s.objects[defender]?.controller ?? s.lki[defender]?.controller ?? defender;
}

/**
 * What a player can attack: their opponents and their planeswalkers (506.2). `declared`: false for a permanent put
 * onto the battlefield attacking (508.4), which the players' attack restrictions don't concern.
 */
export function attackableDefenders(s: GameState, player: PlayerId, declared = true): string[] {
  // "Can't attack [this player or their planeswalkers]" (`cantAttack`): Sandswirl Wanderglyph ("it can't attack
  // you or planeswalkers you control this turn"); with a subtype, only those planeswalkers (Jace, Multiverse
  // Architect: "its creatures can't attack your Jaces this turn").
  const bans = declared ? playerEffectValues(s, player, "cantAttack") : [];
  const banned = (d: string) => {
    const walker = s.objects[d];
    const of = walker ? walker.controller : d;
    return bans.some((b) => b.of === of && (!b.subtype || (!!walker && chars(s, d).subtypes.includes(b.subtype))));
  };
  const opps = opponentsOf(s, player);
  // The Aetherspark: "as long as it's attached to a creature, it can't be attacked".
  const walkers = s.battlefield.filter(
    (id) => opps.includes(obj(s, id).controller) && hasType(s, id, "Planeswalker") && !obj(s, id).attachedTo,
  );
  return [...opps, ...walkers].filter((d) => !banned(d));
}

/**
 * 402.2: maximum hand size (7, `null`: none). The effects that set it ("your maximum hand size is five", "you have
 * no maximum hand size", possibly for opponents) are effects on the rules of the game, applied in the order of
 * their timestamps (613.11): the most recent wins. The timestamp of a static ability is that of its source
 * (permanent, emblem); that of a player effect, that of its creation.
 */
function maxHandSize(s: GameState, player: PlayerId): number | null {
  const set: { ts: number; value: () => number | null }[] = [];
  const tsOf = (id: ObjectId | undefined, timestamp: number | undefined) =>
    timestamp ?? (id ? (s.objects[id]?.timestamp ?? 0) : 0);
  for (const { id, ab, timestamp } of playerStatics(s, player, "maxHandSize")) {
    const amount = ab.maxHandSize;
    if (amount === undefined) continue;
    if (amount === "none") {
      set.push({ ts: tsOf(id, timestamp), value: () => null });
      continue;
    }
    const ctx = staticContext(s, (id && s.objects[id]?.controller) || player, id, { sourceDefId: "" });
    set.push({ ts: tsOf(id, timestamp), value: () => Math.max(0, evalAmount(s, ctx, amount)) });
  }
  if (!set.length) return MAX_HAND_SIZE;
  let last = set[0] as (typeof set)[number];
  for (const e of set) if (e.ts >= last.ts) last = e;
  return last.value();
}

export function declareAttackers(s: GameState, player: PlayerId, declared: { id: ObjectId; defender: string }[]): void {
  let attackers = declared;
  const seen = new Set<ObjectId>();
  const defenders = attackableDefenders(s, player);
  for (const a of attackers) {
    if (seen.has(a.id)) throw new RulesError(msg("Creature declared twice"));
    seen.add(a.id);
    if (!canAttack(s, a.id) || obj(s, a.id).controller !== player) throw new RulesError(msg("This creature can't attack"));
    if (!defenders.includes(a.defender)) throw new RulesError(msg("Invalid defending player or planeswalker"));
    const restriction = attackRestriction(s, a.id, a.defender);
    if (restriction) throw new RulesError(restriction);
  }
  // Tomik, Orzhov Lawmage: at most one creature attacks each planeswalker of its controller; Mirri, Weatherlight
  // Duelist: at most one creature attacks its controller.
  for (const w of new Set(attackers.map((a) => a.defender))) {
    if (oneAttackerOnly(s, w) && attackers.filter((a) => a.defender === w).length > 1) {
      throw new RulesError(
        s.objects[w]
          ? msg("Only one creature can attack {name}", { name: chars(s, w).name })
          : msg("Only one creature can attack this player"),
      );
    }
  }
  // 508.1d: the declaration obeys as many attack requirements as possible ("attacks each combat if able",
  // goad, "attacks that player"); a requirement never forces paying an attack tax.
  const unmet = unmetAttackRequirement(s, player, attackers);
  if (unmet) throw new RulesError(unmet);
  // Toby, Beastie Befriender: "this token can't attack alone".
  const alone = attackers.length === 1 ? attackers[0]?.id : undefined;
  if (alone && chars(s, alone).blockRules.some((r) => r.notAlone))
    throw new RulesError(msg("{name} can't attack alone", { name: chars(s, alone).name }));
  // 508.1f: the attacking creatures become tapped, then (508.1h) the attack tax is paid (Archangel of Tithes: {1}
  // for each creature attacking a protected player or their planeswalkers); a creature sacrificed to pay it
  // (Eldrazi Spawn) leaves combat.
  for (const a of attackers) if (!hasKeyword(s, a.id, "vigilance")) tapObject(s, obj(s, a.id));
  const tax = attackers.reduce((n, a) => n + attackTaxFor(s, a.defender), 0);
  if (tax > 0) {
    try {
      payMana(s, player, { generic: tax, colored: {}, x: 0 });
    } catch (e) {
      rethrowAsRules(e, msg("You must pay {cost} to attack", { cost: `{${tax}}` }));
    }
    attackers = attackers.filter((a) => s.objects[a.id]?.zone === "battlefield" && s.objects[a.id]?.controller === player);
  }
  if (!s.combat) s.combat = emptyCombat();
  for (const a of attackers) s.combat.attackers.push({ id: a.id, defender: a.defender, blockers: [], blocked: false });
  bump(s);
  for (const a of attackers) rulesEvent(s, { e: "attack", attacker: a.id, defender: a.defender });
  // Turn log: attacks ("if you attacked with a Spacecraft", Sandswirl Wanderglyph).
  for (const a of attackers) {
    const c = chars(s, a.id);
    const defender = defendingPlayer(s, a.defender) ?? a.defender;
    logTurnEvent(s, { e: "attack", player, defender, types: c.types, subtypes: c.subtypes, id: a.id });
  }
  if (attackers.length > 0) rulesEvent(s, { e: "attackWith", player, count: attackers.length });
  if (attackers.length > 0) {
    emit({ type: "attack", player, attackers: attackers.map((a) => ({ id: a.id, defId: obj(s, a.id).defId })) });
  }
  givePriority(s);
}

export function canBlock(s: GameState, blocker: ObjectId, attacker: ObjectId): boolean {
  const b = s.objects[blocker];
  if (b?.zone !== "battlefield" || !isCreature(s, blocker) || b.tapped) return false;
  const a = s.combat?.attackers.find((x) => x.id === attacker);
  if (!a || !onBattlefield(s, attacker) || b.controller !== defendingPlayer(s, a.defender)) return false;
  if (hasKeyword(s, blocker, "cantBlock") || hasKeyword(s, blocker, "decayed") || hasKeyword(s, attacker, "unblockable"))
    return false;
  // 702.16f: a creature with protection from [filter] can't be blocked by what matches it.
  if (protectedFrom(s, attacker, snapshot(s, blocker))) return false;
  // "Can't be blocked by creatures that player controls" (The Black Gate).
  if (chars(s, attacker).blockRules.some((r) => r.cantBeBlockedByPlayer === b.controller)) return false;
  if (hasKeyword(s, attacker, "flying") && !hasKeyword(s, blocker, "flying") && !hasKeyword(s, blocker, "reach")) return false;
  // Block rules (R4.1): "can block only [filter]" (Drone), "can't be blocked by [filter]".
  const own = chars(s, blocker).blockRules;
  if (own.some((r) => r.canBlockOnly && !matchesView(snapshot(s, attacker), r.canBlockOnly, b.controller, blocker))) return false;
  // Landwalk (702.14): unblockable if the defender controls a matching permanent.
  const walks = chars(s, attacker).blockRules.filter((r) => r.unblockableIfDefenderControls);
  if (
    walks.some((r) =>
      s.battlefield.some(
        (id) =>
          obj(s, id).controller === b.controller &&
          matchesObjectFilter(s, b.controller, id, r.unblockableIfDefenderControls as ObjectFilter, attacker),
      ),
    )
  )
    return false;
  // Champion of Lambholt: power compared with that of the permanent of the rule, when blocking.
  for (const r of chars(s, attacker).blockRules) {
    const ref = r.cantBeBlockedByWeakerThan;
    if (ref && ref !== "source" && s.objects[ref]?.zone === "battlefield" && chars(s, blocker).power < chars(s, ref).power)
      return false;
  }
  const rules = chars(s, attacker).blockRules.filter((r) => r.cantBeBlockedBy);
  if (rules.length) {
    const v = snapshot(s, blocker);
    const who = obj(s, attacker).controller;
    if (rules.some((r) => matchesView(v, resolveFilter(s, r.cantBeBlockedBy as ObjectFilter, attacker), who, attacker)))
      return false;
  }
  return true;
}

/** Minimum number of blockers of an attacker: 1, 2 with menace, more according to its block rules. */
export function minBlockers(s: GameState, id: ObjectId): number {
  const rules = chars(s, id).blockRules.map((r) => r.minBlockers ?? 0);
  return Math.max(hasKeyword(s, id, "menace") ? 2 : 1, ...rules);
}

/** Maximum number of blockers of an attacker ("can't be blocked by more than one creature"). */
function maxBlockers(s: GameState, id: ObjectId): number {
  return Math.min(Number.POSITIVE_INFINITY, ...chars(s, id).blockRules.map((r) => r.maxBlockers ?? Number.POSITIVE_INFINITY));
}

/** For each potential blocker, the attackers it can block. */
export function blockCandidates(s: GameState, player: PlayerId): { blocker: ObjectId; attackers: ObjectId[] }[] {
  const attackers = s.combat?.attackers.map((a) => a.id) ?? [];
  return creaturesControlledBy(s, player)
    .map((blocker) => ({ blocker, attackers: attackers.filter((a) => canBlock(s, blocker, a)) }))
    .filter((c) => c.attackers.length > 0);
}

function hasAnyLegalBlock(s: GameState, player: PlayerId): boolean {
  const cands = blockCandidates(s, player);
  return (s.combat?.attackers ?? []).some((a) => {
    const n = cands.filter((c) => c.attackers.includes(a.id)).length;
    return n >= minBlockers(s, a.id);
  });
}

type Block = { blocker: ObjectId; attacker: ObjectId };

/**
 * 509.1c: a block requirement of a defender — an attacker that "must be blocked if able", or a creature that
 * "blocks if able" (`attackers`: only those attackers, "blocks this Wolf if able").
 */
export type BlockRequirement =
  | { kind: "attacker"; attacker: ObjectId }
  | { kind: "blocker"; blocker: ObjectId; attackers?: ObjectId[] };

/** The block requirements of `player`; none if blocking costs something (509.1d, Archangel of Tithes). */
export function blockRequirements(s: GameState, player: PlayerId): BlockRequirement[] {
  const tax = s.playerOrder.filter((p) => p !== player).reduce((n, p) => n + playerStaticTotal(s, p, "blockTax"), 0);
  if (tax > 0) return [];
  const attackers = (s.combat?.attackers ?? []).filter((a) => defendingPlayer(s, a.defender) === player).map((a) => a.id);
  const out: BlockRequirement[] = attackers
    .filter((a) => hasKeyword(s, a, "mustBeBlocked"))
    .map((attacker) => ({ kind: "attacker" as const, attacker }));
  for (const id of creaturesControlledBy(s, player)) {
    const rules = chars(s, id).blockRules.filter((r) => r.mustBlock || r.mustBlockAttacker);
    if (rules.length === 0) continue;
    if (rules.some((r) => r.mustBlock)) out.push({ kind: "blocker", blocker: id });
    else {
      const specific = rules.map((r) => r.mustBlockAttacker).filter((x): x is ObjectId => !!x && attackers.includes(x));
      if (specific.length) out.push({ kind: "blocker", blocker: id, attackers: specific });
    }
  }
  return out;
}

/** Requirements obeyed by a declaration. */
function obeyedRequirements(reqs: BlockRequirement[], blocks: Block[]): BlockRequirement[] {
  return reqs.filter((r) => {
    if (r.kind === "attacker") return blocks.some((b) => b.attacker === r.attacker);
    const b = blocks.find((x) => x.blocker === r.blocker);
    return !!b && (!r.attackers || r.attackers.includes(b.attacker));
  });
}

/** Number of creatures this player can block with (Mirri, Weatherlight Duelist: only one). */
function maxBlockingCreatures(s: GameState, player: PlayerId): number {
  return Math.min(
    Number.POSITIVE_INFINITY,
    ...playerStatics(s, player, "maxBlockingCreatures").map(({ ab }) => ab.maxBlockingCreatures ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * Does the declaration respect the number of blockers of each attacker (menace, "no more than one"), the number of
 * blocking creatures and "not alone"?
 */
function blockShapeLegal(s: GameState, player: PlayerId, blocks: Block[]): boolean {
  if (new Set(blocks.map((b) => b.blocker)).size > maxBlockingCreatures(s, player)) return false;
  const per = new Map<ObjectId, number>();
  for (const b of blocks) per.set(b.attacker, (per.get(b.attacker) ?? 0) + 1);
  for (const [a, n] of per) if (n < minBlockers(s, a) || n > maxBlockers(s, a)) return false;
  const lone = blocks.length === 1 ? blocks[0]?.blocker : undefined;
  return !lone || !chars(s, lone).blockRules.some((r) => r.notAlone);
}

/** Maximum nodes of the search for the maximum: beyond, the best found (which can only underestimate the maximum). */
const BLOCK_SEARCH_NODES = 50_000;

/**
 * 509.1c: the largest number of requirements a legal declaration can obey, and such a declaration (for the
 * concerned creatures only). `prefer`: the wanted blocks, tried first (the AI repairing its blocks).
 */
function bestRequiredBlocks(
  s: GameState,
  player: PlayerId,
  reqs: BlockRequirement[],
  prefer: Block[] = [],
): { max: number; best: Block[] } {
  if (reqs.length === 0) return { max: 0, best: [] };
  const attackers = (s.combat?.attackers ?? []).filter((a) => defendingPlayer(s, a.defender) === player).map((a) => a.id);
  const required = new Set(reqs.flatMap((r) => (r.kind === "attacker" ? [r.attacker] : [])));
  const own = new Map(reqs.flatMap((r) => (r.kind === "blocker" ? [[r.blocker, r] as const] : [])));
  const relevant = creaturesControlledBy(s, player).filter((id) => own.has(id) || [...required].some((a) => canBlock(s, id, a)));
  const domains = relevant.map((id) => {
    const r = own.get(id);
    const useful = attackers.filter(
      (a) => canBlock(s, id, a) && (required.has(a) || (r?.kind === "blocker" && (!r.attackers || r.attackers.includes(a)))),
    );
    const wanted = prefer.find((b) => b.blocker === id)?.attacker;
    const options: (ObjectId | null)[] = [null, ...useful];
    // The wanted block first (if useful); otherwise "doesn't block" first.
    if (wanted && useful.includes(wanted)) options.sort((x, y) => (x === wanted ? -1 : y === wanted ? 1 : 0));
    return options;
  });
  let best: Block[] = [];
  let max = -1;
  let nodes = 0;
  const current: Block[] = [];
  const visit = (i: number): void => {
    if (++nodes > BLOCK_SEARCH_NODES || max === reqs.length) return;
    if (i === relevant.length) {
      if (!blockShapeLegal(s, player, current)) return;
      const n = obeyedRequirements(reqs, current).length;
      if (n > max) {
        max = n;
        best = [...current];
      }
      return;
    }
    for (const a of domains[i] ?? [null]) {
      if (a) current.push({ blocker: relevant[i] as ObjectId, attacker: a });
      visit(i + 1);
      if (a) current.pop();
    }
  };
  visit(0);
  return { max: Math.max(0, max), best };
}

/**
 * 509.1c: the first requirement not obeyed by this declaration while another legal declaration obeys more;
 * null if the declaration obeys the maximum possible.
 */
export function unmetBlockRequirement(s: GameState, player: PlayerId, blocks: Block[]): BlockRequirement | null {
  const reqs = blockRequirements(s, player);
  if (reqs.length === 0) return null;
  const obeyed = obeyedRequirements(reqs, blocks);
  if (obeyed.length >= bestRequiredBlocks(s, player, reqs).max) return null;
  return reqs.find((r) => !obeyed.includes(r)) ?? null;
}

/** Default blocks: those that obey the most requirements (509.1c); empty without requirements. */
export function requiredBlocks(s: GameState, player: PlayerId): Block[] {
  return bestRequiredBlocks(s, player, blockRequirements(s, player)).best;
}

/**
 * Wanted blocks (by the AI) completed to obey as many requirements as possible: the concerned creatures take the
 * best block close to the wanted one, the others keep theirs.
 */
export function repairBlocks(s: GameState, player: PlayerId, blocks: Block[]): Block[] {
  if (!unmetBlockRequirement(s, player, blocks)) return blocks;
  const { best } = bestRequiredBlocks(s, player, blockRequirements(s, player), blocks);
  const fixed = new Set(best.map((b) => b.blocker));
  const reqs = blockRequirements(s, player);
  const own = new Set(reqs.flatMap((r) => (r.kind === "blocker" ? [r.blocker] : [])));
  const required = reqs.flatMap((r) => (r.kind === "attacker" ? [r.attacker] : []));
  const relevant = (id: ObjectId) => own.has(id) || required.some((a) => canBlock(s, id, a));
  const merged = [...blocks.filter((b) => !fixed.has(b.blocker) && !relevant(b.blocker)), ...best];
  return blockShapeLegal(s, player, merged) ? merged : best;
}

export function declareBlockers(s: GameState, player: PlayerId, blocks: { blocker: ObjectId; attacker: ObjectId }[]): void {
  const c = s.combat;
  if (!c) throw new RulesError(msg("No combat in progress"));
  const seen = new Set<ObjectId>();
  for (const b of blocks) {
    if (seen.has(b.blocker)) throw new RulesError(msg("A creature can block only one attacker"));
    seen.add(b.blocker);
    if (obj(s, b.blocker).controller !== player || !canBlock(s, b.blocker, b.attacker)) {
      throw new RulesError(msg("Illegal block"));
    }
  }
  const lone = blocks.length === 1 ? blocks[0]?.blocker : undefined;
  if (lone && chars(s, lone).blockRules.some((r) => r.notAlone))
    throw new RulesError(msg("{name} can't block alone", { name: chars(s, lone).name }));
  // 509.1c: the declaration obeys as many block requirements as possible (without paying a cost, 509.1d).
  const unmet = unmetBlockRequirement(s, player, blocks);
  if (unmet?.kind === "attacker")
    throw new RulesError(msg("{name} must be blocked if able", { name: chars(s, unmet.attacker).name }));
  if (unmet?.kind === "blocker") throw new RulesError(msg("{name} must block if able", { name: chars(s, unmet.blocker).name }));
  // Archangel of Tithes (attacker): {1} per blocking creature.
  const perBlocker = s.playerOrder.filter((p) => p !== player).reduce((n, p) => n + playerStaticTotal(s, p, "blockTax"), 0);
  if (blocks.length && perBlocker > 0) {
    const tax = blocks.length * perBlocker;
    try {
      payMana(s, player, { generic: tax, colored: {}, x: 0 });
    } catch (e) {
      rethrowAsRules(e, msg("You must pay {cost} to block", { cost: `{${tax}}` }));
    }
  }
  const cap = maxBlockingCreatures(s, player);
  if (new Set(blocks.map((b) => b.blocker)).size > cap)
    throw new RulesError(
      cap === 1 ? msg("You can block with only one creature") : msg("You can block with only {n} creatures", { n: cap }),
    );
  for (const a of c.attackers) {
    const n = blocks.filter((b) => b.attacker === a.id).length;
    const min = minBlockers(s, a.id);
    if (n > 0 && n < min)
      throw new RulesError(
        min === 2 && hasKeyword(s, a.id, "menace")
          ? msg("A creature with menace must be blocked by two or more creatures")
          : msg("This creature can't be blocked except by {n} or more creatures", { n: min }),
      );
    const max = maxBlockers(s, a.id);
    if (n > max)
      throw new RulesError(
        max === 1
          ? msg("This creature can't be blocked by more than one creature")
          : msg("This creature can't be blocked by more than {n} creatures", { n: max }),
      );
  }
  // 509.1: the defenders' blocks are simultaneous; these are kept (and hidden) until the last defender.
  c.pendingBlocks = [...(c.pendingBlocks ?? []), { player, blocks }];
  nextBlockingPlayer(s);
}

/** Applies the blocks of all defenders together (509.1), in the order of their declarations. */
function commitBlocks(s: GameState): void {
  const c = s.combat;
  if (!c) return;
  const pending = c.pendingBlocks ?? [];
  c.pendingBlocks = undefined;
  for (const { player, blocks } of pending) applyBlocks(s, c, player, blocks);
  // Attackers become blocked or unblocked (filters `blocked` and `blocking` of static abilities: Throatseeker).
  bumpFor(s, "blocks");
}

function applyBlocks(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  player: PlayerId,
  blocks: { blocker: ObjectId; attacker: ObjectId }[],
): void {
  blocks = blocks.filter((b) => onBattlefield(s, b.blocker) && c.attackers.some((a) => a.id === b.attacker));
  c.blockers.push(...blocks.map((b) => ({ id: b.blocker, attacker: b.attacker })));
  for (const b of blocks) rulesEvent(s, { e: "block", blocker: b.blocker, attacker: b.attacker });
  // 509.1h: each attacker that has at least one blocker becomes blocked (Norin).
  for (const a of new Set(blocks.map((b) => b.attacker))) {
    const o = s.objects[a];
    if (o) rulesEvent(s, { e: "blocked", attacker: a, player: o.controller });
  }
  for (const a of c.attackers) {
    if (defendingPlayer(s, a.defender) !== player) continue;
    a.blockers = blocks.filter((b) => b.attacker === a.id).map((b) => b.blocker);
    a.blocked = a.blockers.length > 0;
  }
  if (blocks.length > 0) {
    emit({
      type: "block",
      player,
      blocks: blocks.map((b) => ({ ...b, blockerDefId: obj(s, b.blocker).defId, attackerDefId: obj(s, b.attacker).defId })),
    });
  }
}

function nextBlockingPlayer(s: GameState): void {
  const p = s.combat?.blockQueue.shift();
  if (p) {
    s.pending = { kind: "declareBlockers", player: p };
    s.flow = "tba";
  } else {
    commitBlocks(s);
    givePriority(s);
  }
}

/** Lethal damage remaining for a creature (702.2c: 1 is enough with deathtouch). */
function lethalFor(s: GameState, id: ObjectId, deathtouch: boolean): number {
  const remaining = Math.max(0, chars(s, id).toughness - obj(s, id).damage);
  return deathtouch ? Math.min(1, remaining) : remaining;
}

function dealsDamageNow(s: GameState, id: ObjectId, firstStrikeStep: boolean): boolean {
  const kw = chars(s, id).keywords;
  if (firstStrikeStep) return kw.includes("firstStrike") || kw.includes("doubleStrike");
  return !s.combat?.firstStrikers.includes(id) || kw.includes("doubleStrike");
}

/** Default division: kill as many blockers as possible, the rest to the player with trample. */
function defaultAssignment(s: GameState, attacker: ObjectId): Record<string, number> {
  const a = s.combat?.attackers.find((x) => x.id === attacker);
  const out: Record<string, number> = {};
  if (!a) return out;
  const src = sourceFromObject(s, attacker);
  const deathtouch = src.keywords.includes("deathtouch");
  const trample = src.keywords.includes("trample");
  const blockers = a.blockers.filter((b) => onBattlefield(s, b));
  const order = [...blockers].sort((x, y) => lethalFor(s, x, deathtouch) - lethalFor(s, y, deathtouch));
  let remaining = Math.max(0, combatPower(s, attacker));
  for (const b of order) {
    const amount = Math.min(remaining, lethalFor(s, b, deathtouch));
    out[b] = amount;
    remaining -= amount;
  }
  if (remaining > 0) {
    if (trample) out[a.defender] = remaining;
    else if (order[0]) out[order[0]] = (out[order[0]] ?? 0) + remaining;
  }
  return out;
}

/**
 * 510.1: each blocked attacker divides its damage. A real choice exists only if there are several
 * blockers, or one blocker and trample: the question is then asked of the attacker's controller.
 */
function startCombatDamage(s: GameState, firstStrikeStep: boolean): void {
  const c = s.combat;
  if (!c) {
    givePriority(s);
    return;
  }
  c.damageStep = firstStrikeStep ? "first" : "regular";
  c.assignments = {};
  c.assignQueue = c.attackers
    .filter((a) => {
      if (!a.blocked || !onBattlefield(s, a.id) || !dealsDamageNow(s, a.id, firstStrikeStep)) return false;
      if (combatPower(s, a.id) <= 0) return false;
      const alive = a.blockers.filter((b) => onBattlefield(s, b)).length;
      return alive >= 2 || (alive === 1 && hasKeyword(s, a.id, "trample"));
    })
    .map((a) => a.id);
  nextCombatAssignment(s);
}

function nextCombatAssignment(s: GameState): void {
  const c = s.combat;
  if (!c) {
    givePriority(s);
    return;
  }
  const attacker = c.assignQueue.shift();
  if (!attacker) {
    combatDamage(s, c.damageStep === "first");
    c.damageStep = null;
    givePriority(s);
    return;
  }
  const a = c.attackers.find((x) => x.id === attacker);
  if (!a) {
    nextCombatAssignment(s);
    return;
  }
  const src = sourceFromObject(s, attacker);
  const deathtouch = src.keywords.includes("deathtouch");
  const trample = src.keywords.includes("trample");
  const blockers = a.blockers.filter((b) => onBattlefield(s, b));
  const among = trample ? [...blockers, a.defender] : blockers;
  const suggestedMap = defaultAssignment(s, attacker);
  ask(
    s,
    obj(s, attacker).controller,
    {
      type: "divide",
      intent: "combatDamage",
      prompt: msg("Assign {card}'s {n} damage", { n: combatPower(s, attacker), card: cardRef(obj(s, attacker).defId) }),
      among,
      total: combatPower(s, attacker),
      lethal: trample
        ? { player: a.defender, needs: Object.fromEntries(blockers.map((b) => [b, lethalFor(s, b, deathtouch)])) }
        : undefined,
      suggested: among.map((id) => suggestedMap[id] ?? 0),
      // Several blockers: the player divides (prefilled suggestion); one blocker and trample: the autopilot
      // assigns lethal damage to the blocker and the rest to the player (PLAN-C, C18).
      autoOk: blockers.length <= 1,
    },
    { kind: "combatDamage", attacker },
  );
  s.flow = "tba";
}

export function answerCombatAssignment(s: GameState, attacker: ObjectId, division: Record<string, number>): void {
  if (!s.combat) throw new RulesError(msg("No combat in progress"));
  s.combat.assignments[attacker] = division;
  nextCombatAssignment(s);
}

function combatDamage(s: GameState, firstStrikeStep: boolean): void {
  const c = s.combat;
  if (!c) return;
  const assignments: { src: DamageSource; target: string; amount: number }[] = [];
  const dealt: ObjectId[] = [];

  for (const a of c.attackers) {
    if (!onBattlefield(s, a.id) || !dealsDamageNow(s, a.id, firstStrikeStep)) continue;
    const power = combatPower(s, a.id);
    if (power <= 0) continue;
    dealt.push(a.id);
    const src = sourceFromObject(s, a.id);
    const trample = src.keywords.includes("trample");
    if (!a.blocked) {
      assignments.push({ src, target: a.defender, amount: power });
      continue;
    }
    const blockers = a.blockers.filter((b) => onBattlefield(s, b));
    if (blockers.length === 0) {
      // 702.19e: a blocked attacker with trample whose blockers are gone deals damage to the player.
      if (trample) assignments.push({ src, target: a.defender, amount: power });
      continue;
    }
    const division = c.assignments[a.id] ?? defaultAssignment(s, a.id);
    for (const [target, amount] of Object.entries(division)) if (amount > 0) assignments.push({ src, target, amount });
  }

  for (const b of c.blockers) {
    if (!onBattlefield(s, b.id) || !onBattlefield(s, b.attacker) || !dealsDamageNow(s, b.id, firstStrikeStep)) continue;
    const power = combatPower(s, b.id);
    if (power <= 0) continue;
    dealt.push(b.id);
    assignments.push({ src: sourceFromObject(s, b.id), target: b.attacker, amount: power });
  }

  if (firstStrikeStep) c.firstStrikers = dealt;
  // 510.2: all combat damage is dealt simultaneously.
  simultaneously(s, () => {
    for (const x of assignments) dealDamage(s, x.src, x.target, x.amount, true);
    // "Whenever one or more creatures … deal combat damage to a player": once per player.
    const byPlayer = new Map<PlayerId, ObjectId[]>();
    for (const x of assignments) {
      if (!s.players[x.target] || x.amount <= 0 || !x.src.id) continue;
      byPlayer.set(x.target, [...(byPlayer.get(x.target) ?? []), x.src.id]);
    }
    for (const [player, sources] of byPlayer) rulesEvent(s, { e: "combatDamageBatch", player, sources });
    // Monarch (724.2): each creature that deals combat damage to the monarch triggers an ability controlled by
    // them, which makes the creature's controller the monarch on resolution.
    const monarch = s.monarch;
    if (monarch) for (const id of new Set(byPlayer.get(monarch))) rulesTrigger(s, monarch, "monarchSteal", { objectId: id });
  });
}

// ---------------------------------------------------------------------------
// State-based actions (704)
// ---------------------------------------------------------------------------

export function checkGameOver(s: GameState): void {
  const losers: PlayerId[] = [];
  for (const p of s.playerOrder) {
    const player = s.players[p];
    if (!player || player.lost) continue;
    // Laboratory Maniac: the impossible draw was replaced by a win (opponents eliminated, except `cantLose`).
    if (player.drewFromEmptyLibrary === "win") {
      player.drewFromEmptyLibrary = false;
      const opponents = opponentsOf(s, p);
      if (!opponents.some((q) => cantLose(s, q))) losers.push(...opponents.filter((q) => !losers.includes(q)));
      continue;
    }
    // Herald of Eternal Dawn: "you can't lose the game". 704.5c: 10 or more poison counters.
    // Marina Vendrell's Grimoire: "you don't lose the game for having 0 or less life".
    const lifeLoss = player.life <= 0 && !cantLose(s, p, "life");
    const poisoned = (player.counters?.poison ?? 0) >= 10;
    // 704.6c: 21 or more combat damage from the same commander over the course of the game.
    const commanderDamage = !!s.commander && Object.values(s.commander.cards).some((c) => (c.damage[p] ?? 0) >= 21);
    if ((lifeLoss || player.drewFromEmptyLibrary || poisoned || commanderDamage) && !cantLose(s, p)) {
      losers.push(p);
      emit({
        type: "lose",
        player: p,
        reason: lifeLoss ? "life" : poisoned ? "poison" : commanderDamage ? "commander" : "draw",
      });
    }
    // 704.5b: only an impossible draw since the last check counts; a player who couldn't lose doesn't lose
    // later because of an old draw.
    player.drewFromEmptyLibrary = false;
  }
  eliminate(s, [...new Set(losers)]);
}

/**
 * Eliminates players. If at most one player remains, the game ends; otherwise (800.4a)
 * their objects leave the game and the game continues without them.
 */
export function eliminate(s: GameState, losers: PlayerId[]): void {
  if (losers.length === 0) return;
  bump(s); // characteristics may depend on the players still in the game
  const holderLeaving = losers.includes(s.priority.holder);
  const activeLeaving = losers.includes(s.turn.active);
  for (const p of losers) {
    const player = s.players[p];
    if (player) player.lost = true;
  }
  // All losers are marked before the triggers read the characteristics again.
  bump(s);
  // 724.4: the monarch leaves the game: the active player becomes the monarch (the next one if they are leaving).
  if (s.monarch && losers.includes(s.monarch)) {
    const next = [s.turn.active, ...s.playerOrder].find((p) => !s.players[p]?.lost);
    s.monarch = undefined;
    if (next) setMonarch(s, next);
  }
  for (const p of losers) rulesEvent(s, { e: "playerLost", player: p });
  const alive = alivePlayers(s);
  if (alive.length <= 1) {
    s.over = true;
    s.winner = alive[0] ?? null;
    s.flow = "over";
    s.pending = null;
    emit({ type: "gameOver", winner: s.winner });
    return;
  }
  for (const p of losers) removePlayerObjects(s, p);
  s.setup.mulliganQueue = s.setup.mulliganQueue.filter((q) => !losers.includes(q));
  if (s.setup.mulliganTaken) s.setup.mulliganTaken = s.setup.mulliganTaken.filter((q) => !losers.includes(q));
  const pending = s.pending;
  const pendingLeaving = !!pending && losers.includes(pending.player);
  if (pendingLeaving) s.pending = null;
  if (s.flow === "mulligan") return;
  // Concession in the middle of a resolution (800.4a): the player who was asked the question, or the controller of what
  // resolves, leaves the game; the resolution resumes without them, or stops if the object left the stack with them.
  const resolvingGone = !!s.resolving && !s.stack.some((x) => x.id === s.resolving?.item.id);
  const resume = s.flow === "resolving" && !!s.resolving?.awaiting && (pendingLeaving || resolvingGone);
  if (resume) {
    s.pending = null;
    resumeWithoutLeaver(s, pending);
  }
  if (activeLeaving) {
    // Simplification: the turn of a player who leaves the game stops immediately.
    s.combat = null;
    bump(s);
    s.turn.step = "cleanup";
    s.flow = "stepEnd";
  } else if (pendingLeaving && s.flow === "tba") {
    nextBlockingPlayer(s); // only case where a nonactive player owes a turn-based action
  } else if (holderLeaving && !resume) {
    // After a resumed resolution, priority has already been given back (to the active player, 117.3b).
    s.priority = { holder: nextPlayer(s, s.priority.holder), passes: 0 };
  }
}

/**
 * 800.4a: the player whom a resolution was asking a question, or the controller of what resolves, leaves the game
 * (concession). The spell or ability of a leaving player has left the stack with them: the resolution stops.
 * Otherwise, it resumes with the answer of an absent player
 * (`absentAnswer`, refusal of a "cast it now"), like `continueResolution` for the following questions.
 */
function resumeWithoutLeaver(s: GameState, pending: PendingDecision | null): void {
  const r = s.resolving;
  if (!r?.awaiting) return;
  if (!pending || !s.stack.some((x) => x.id === r.item.id)) {
    s.resolving = null;
    dropNowPermissions(s);
    afterResolution(s);
    return;
  }
  // Mana ability (605.3b): priority goes back to the player who activated it.
  const back = r.returnPriority;
  const done = pending.kind === "choice" ? answerResolutionChoice(s, absentAnswer(pending.request)) : answerCastNow(s, null);
  if (!done) return;
  if (back) {
    s.priority = back;
    s.flow = "priority";
  } else afterResolution(s);
}

function removePlayerObjects(s: GameState, p: PlayerId): void {
  const player = s.players[p];
  if (!player) return;
  bump(s);
  // 800.4a: the effects that give them control of objects end (layer 2: `syncControl` ignores the effects and
  // the Auras of a player who has left the game), then what they still control is exiled.
  syncControl(s);
  // Their phased-out permanents phase in before leaving the game (they would never come back otherwise).
  phaseIn(s, p);
  for (const o of Object.values(s.objects)) {
    if (o.owner !== p && o.controller === p && o.zone === "battlefield") moveObject(s, o.id, "exile");
    // Controlled by another effect: when it ends, it goes back to its owner.
    else if (o.owner !== p && o.baseController === p) o.baseController = o.owner;
  }
  s.effects = s.effects.filter((e) => e.controller !== p);
  const gone = new Set(
    Object.values(s.objects)
      .filter((o) => o.owner === p)
      .map((o) => o.id),
  );
  for (const id of gone) delete s.objects[id];
  player.library = [];
  player.hand = [];
  player.graveyard = [];
  player.command = [];
  player.phasedOut = [];
  s.battlefield = s.battlefield.filter((id) => !gone.has(id));
  s.exile = s.exile.filter((id) => !gone.has(id));
  // 800.4a: a spell they control without owning it (opponent's card cast from exile) is exiled; a copy ceases
  // to exist (`moveObject`).
  for (const item of s.stack)
    if (item.kind === "spell" && item.controller === p && !gone.has(item.sourceId) && s.objects[item.sourceId])
      moveObject(s, item.sourceId, "exile");
  s.stack = s.stack.filter((item) => item.controller !== p && (item.kind === "ability" || !gone.has(item.sourceId)));
  // 800.4a: their pending triggered abilities and delayed abilities cease to exist.
  s.triggers = s.triggers.filter((t) => t.controller !== p);
  s.delayed = s.delayed.filter((d) => d.controller !== p);
  if (s.combat) {
    // Creatures stop attacking: "attacking creatures" static abilities depend on it.
    bump(s);
    s.combat.attackers = s.combat.attackers.filter((a) => !gone.has(a.id) && defendingPlayer(s, a.defender) !== p);
    s.combat.blockers = s.combat.blockers.filter((b) => !gone.has(b.id));
    s.combat.blockQueue = s.combat.blockQueue.filter((q) => q !== p);
    s.combat.pendingBlocks = s.combat.pendingBlocks?.filter((b) => b.player !== p);
    for (const a of s.combat.attackers) a.blockers = a.blockers.filter((b) => !gone.has(b));
  }
  s.effects = s.effects.filter((e) => e.affected.some((id) => !gone.has(id)));
  // Their permanents are gone: their static abilities no longer apply (Ygra, Eater of All).
  bump(s);
}

/** State-based actions (704.3). Returns true if one of them was performed (or a question asked). */
export function stateBasedActions(s: GameState): boolean {
  let acted = false;
  simultaneously(s, () => {
    acted = stateBasedActionsOnce(s);
  });
  return acted;
}

function stateBasedActionsOnce(s: GameState): boolean {
  const alive = () => s.playerOrder.filter((p) => !s.players[p]?.lost).length;
  const before = alive();
  let acted = false;
  for (let guard = 0; guard < MAX_SBA_PASSES; guard++) {
    checkGameOver(s);
    if (s.over) return true;
    if (alive() !== before) acted = true;
    // Soulbond (702.95e): a pair breaks when one of them leaves the battlefield, changes controller or stops being a
    // creature (checked with these actions).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (!o.pairedWith) continue;
      const other = s.objects[o.pairedWith];
      if (
        other?.zone === "battlefield" &&
        other.pairedWith === id &&
        other.controller === o.controller &&
        isCreature(s, id) &&
        isCreature(s, other.id)
      )
        continue;
      delete o.pairedWith;
      if (other?.pairedWith === id) delete other.pairedWith;
      bump(s);
    }
    // 702.179a: "Start your engines!" — a player without speed who controls such a permanent has speed 1.
    for (const id of s.battlefield) {
      const c = s.players[obj(s, id).controller];
      if (c && c.speed === undefined && hasKeyword(s, id, "startYourEngines")) setSpeed(s, c.id, 1);
    }
    // Storied (The Hobbit): with three or more artifacts, legendaries and/or Sagas, the controller of a permanent
    // with this ability gains an enduring story, for the rest of the game.
    for (const id of s.battlefield) {
      const p = obj(s, id).controller;
      const pl = s.players[p];
      if (!pl || !cardRule(s.defs[obj(s, id).defId], "storied") || pl.designations?.includes("enduringStory")) continue;
      const n = s.battlefield.filter((x) => {
        if (obj(s, x).controller !== p) return false;
        const c = chars(s, x);
        return c.types.includes("Artifact") || c.supertypes.includes("Legendary") || c.subtypes.includes("Saga");
      }).length;
      if (n >= 3) {
        pl.designations = [...(pl.designations ?? []), "enduringStory"];
        bump(s);
      }
    }
    // Ascend (702.131b): the controller of a permanent that has it and controls ten or more permanents gets the
    // city's blessing for the rest of the game (a static ability, checked at the same moments as these actions).
    for (const id of s.battlefield) {
      const pl = s.players[obj(s, id).controller];
      if (!pl || pl.designations?.includes("citysBlessing") || !hasKeyword(s, id, "ascend")) continue;
      if (s.battlefield.filter((x) => obj(s, x).controller === pl.id).length >= 10) {
        pl.designations = [...(pl.designations ?? []), "citysBlessing"];
        bump(s);
      }
    }
    const toGraveyard: ObjectId[] = [];
    const toDestroy: ObjectId[] = [];
    let changed = false;
    // Copied definitions, in one pass (Saga check); with no copy in play, the face of each permanent.
    const copied = copyingIn(s) ? copiedDefMap(s) : null;

    for (const id of s.battlefield) {
      const o = obj(s, id);
      // 704.5q: +1/+1 and -1/-1 counters cancel out.
      const both = Math.min(counterCount(o, P1P1), counterCount(o, M1M1));
      if (both > 0) {
        changeCounters(s, o, P1P1, -both);
        changeCounters(s, o, M1M1, -both);
        changed = true;
      }
      // 704.5i: a planeswalker with no loyalty counters goes to the graveyard.
      if (
        hasType(s, id, "Planeswalker") &&
        counterCount(o, "loyalty") <= 0 &&
        !playerStatic(s, o.controller, "walkersSurviveZeroLoyalty")
      ) {
        toGraveyard.push(id);
        continue;
      }
      // 714.4: a Saga whose last chapter is reached, and with no chapter waiting, is sacrificed.
      // Active face: a Saga on the back (Summons of FIN); a Saga transformed back to the front is no longer one.
      const saga = s.defs[copied?.get(id) ?? o.faceDefId ?? o.defId]?.saga;
      if (
        saga &&
        counterCount(o, "lore") >= saga.chapters &&
        !s.stack.some((x) => x.kind === "ability" && x.sourceId === id) &&
        !s.triggers.some((t) => t.sourceId === id)
      ) {
        toGraveyard.push(id);
        continue;
      }
      if (!isCreature(s, id)) continue;
      const c = chars(s, id);
      if (c.toughness <= 0)
        toGraveyard.push(id); // 704.5f
      else if (o.damage >= c.toughness || (o.deathtouched && o.damage > 0)) toDestroy.push(id); // 704.5g–h
    }

    // Layer 2: Confiscate (the Aura's controller controls the enchanted permanent, and gives it back when the Aura
    // leaves), end of "for as long as you control" effects.
    if (syncControl(s)) changed = true;

    // 704.5m–n: illegally attached Auras (graveyard), illegally attached Equipment (unattached).
    for (const id of s.battlefield) {
      const o = obj(s, id);
      const d = s.defs[o.defId];
      if (d?.enchant) {
        const host = o.attachedTo;
        // Player Aura (Grievous Wound): attached to a player still in the game, without protection from it (702.16b,
        // Teferi's Protection: curses fall off).
        const legal = d.enchant.player
          ? !!host && isPlayer(s, host) && !s.players[host]?.lost && !playerProtectedFrom(s, host, o.controller, id)
          : !!host &&
            host !== id &&
            onBattlefield(s, host) &&
            !protectedFrom(s, host, sourceView(s, id)) &&
            matchesObjectFilter(s, o.controller, host, d.enchant.filter, id);
        if (!legal) toGraveyard.push(id);
      } else if (
        o.attachedTo &&
        !(
          onBattlefield(s, o.attachedTo) &&
          isCreature(s, o.attachedTo) &&
          hasType(s, id, "Artifact") &&
          // 301.5c: an Equipment that is also a creature can't equip a creature (animated Iron Man Armor).
          !isCreature(s, id) &&
          !protectedFrom(s, o.attachedTo, sourceView(s, id))
        )
      ) {
        o.lastAttachedTo = o.attachedTo;
        o.attachedTo = undefined;
        bump(s);
        changed = true;
      }
    }

    // 704.5y: several Roles of the same player attached to the same permanent: only the most recent stays.
    const roles = new Map<string, ObjectId[]>();
    for (const id of s.battlefield) {
      const o = obj(s, id);
      if (!o.attachedTo || toGraveyard.includes(id) || !chars(s, id).subtypes.includes("Role")) continue;
      const key = `${o.attachedTo}|${o.controller}`;
      roles.set(key, [...(roles.get(key) ?? []), id]);
    }
    for (const ids of roles.values()) {
      if (ids.length < 2) continue;
      const newest = [...ids].sort((a, b) => obj(s, b).timestamp - obj(s, a).timestamp)[0];
      for (const id of ids) if (id !== newest) toGraveyard.push(id);
    }

    // 704.5j: legend rule (v1: the most recent is kept automatically).
    const legends = new Map<string, ObjectId[]>();
    for (const id of s.battlefield) {
      const o = obj(s, id);
      // Computed characteristics: a copy (Hall of Echoes) has the copied name and supertype.
      const c = chars(s, id);
      if (!c.supertypes.includes("Legendary")) continue;
      if (
        playerStatics(s, o.controller, "noLegendRule").some(
          ({ id: src, ab }) =>
            ab.noLegendRule === true || matchesObjectFilter(s, o.controller, id, ab.noLegendRule as ObjectFilter, src),
        )
      )
        continue;
      const key = `${o.controller}|${c.name}`;
      legends.set(key, [...(legends.get(key) ?? []), id]);
    }
    let legendChoice: { player: PlayerId; ids: ObjectId[] } | null = null;
    for (const ids of legends.values()) {
      if (ids.length < 2) continue;
      legendChoice ??= { player: obj(s, ids[0] as ObjectId).controller, ids };
    }

    for (const id of new Set(toGraveyard)) {
      if (onBattlefield(s, id)) {
        putIntoGraveyard(s, id);
        changed = true;
      }
    }
    for (const id of toDestroy) {
      if (onBattlefield(s, id) && destroy(s, id)) changed = true;
    }
    for (const id of s.battlefield) obj(s, id).deathtouched = false;
    // 506.4: a permanent that stops being a creature (Vehicle, animated land) is removed from combat.
    if (s.combat) {
      for (const id of combatants(s)) {
        if (!isCreature(s, id)) {
          removeFromCombat(s, id);
          changed = true;
        }
      }
    }
    if (changed) {
      acted = true;
      continue;
    }
    if (legendChoice) {
      acted = true;
      // 704.5j: the player chooses the legend they keep; the others go to the graveyard.
      const newest = [...legendChoice.ids].sort((x, y) => obj(s, y).timestamp - obj(s, x).timestamp)[0] as ObjectId;
      ask(
        s,
        legendChoice.player,
        {
          type: "pick",
          intent: "legend",
          prompt: msg("Legend rule: choose the {card} to keep", { card: cardRef(obj(s, newest).defId) }),
          options: legendChoice.ids,
          min: 1,
          max: 1,
          suggested: [newest],
        },
        { kind: "legend" },
      );
      return acted;
    }
    // 903.9a and 903.9b: a commander put into a graveyard, exile, the hand or the library of its owner since the
    // last check: its owner may return it to the command zone (one question per object, never answered by the
    // autopilot; a refusal holds until its next zone change).
    const offer = commanderReturnOffer(s);
    if (offer) {
      acted = true;
      ask(
        s,
        offer.owner,
        {
          type: "yesNo",
          intent: "commanderZone",
          prompt: msg("Put {card} back into the command zone?", { card: cardRef(obj(s, offer.id).defId) }),
          // In hand, the commander is recast without tax (903.8): keeping it is suggested (Command Beacon);
          // elsewhere, yes.
          suggested: [obj(s, offer.id).zone === "hand" ? 0 : 1],
        },
        { kind: "commanderZone", card: offer.id },
      );
    }
    return acted;
  }
  // Still actions to do after `MAX_SBA_PASSES` passes: a loop of mandatory actions (104.4b).
  declareLoopDraw(s);
  return true;
}

/**
 * 903.9a and 903.9b: the first commander in the graveyard, exile, the hand or the library of its owner whose return
 * has not been offered yet. 903.9b is a replacement: the question is asked right after it is put into the hand or the
 * library, at the next check (timing approximation).
 */
function commanderReturnOffer(s: GameState): { owner: PlayerId; id: ObjectId } | undefined {
  const cards = s.commander?.cards;
  if (!cards) return undefined;
  // Checked at each pass of state-based actions: same zones in the same order, without copying the lists.
  for (const [uid, rec] of Object.entries(cards)) {
    const owner = s.players[rec.owner];
    if (!owner || owner.lost) continue;
    for (const zone of [owner.graveyard, s.exile, owner.hand, owner.library])
      for (const id of zone) {
        const o = s.objects[id];
        if (o && !o.isToken && o.uid === uid && rec.offered !== id) {
          rec.offered = id;
          return { owner: rec.owner, id };
        }
      }
  }
  return undefined;
}

/** Zones from which a commander can return to the command zone (903.9a, 903.9b). */
const COMMANDER_RETURN_ZONES: readonly string[] = ["graveyard", "exile", "hand", "library"];

/**
 * 903.9a and 903.9b: answer of the owner; yes, the commander (still in the zone it was put into) goes to the
 * command zone.
 */
export function answerCommanderZone(s: GameState, card: ObjectId, yes: boolean): void {
  const o = s.objects[card];
  if (!yes || !o || !COMMANDER_RETURN_ZONES.includes(o.zone)) return;
  emit({ type: "moved", owner: o.owner, objectId: card, defId: o.defId, from: o.zone, to: "command" });
  moveObject(s, card, "command");
}

export function answerLegendChoice(s: GameState, keep: ObjectId, options: ObjectId[]): void {
  for (const id of options) if (id !== keep && onBattlefield(s, id)) putIntoGraveyard(s, id);
}
