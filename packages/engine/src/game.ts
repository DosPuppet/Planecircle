/**
 * Public API of the engine: game creation and submission of decisions.
 * Each call returns a new state (working copy, the received state is never modified) and the events produced.
 */

// The effect handlers (ops/*.ts) register themselves here: effects.ts does not import them (opRegistry.ts).
import "./ops/index";
import { drawCard } from "./actions";
import { divisionOf, validateChoice } from "./choices";
import { checkDecisionShape } from "./decisionShape";
import { outcomeHash } from "./fingerprint";
import { LOOP_LIMIT, LOOP_SUSPECT } from "./limits";
import { activateManaAbility, undoMana } from "./mana";
import { customArtSet, keyedPrinting } from "./printing";
import { activateAbility, answerCastNow, answerResolutionChoice, castSpell, playLand, RulesError } from "./stack";
import { answerStackChoice } from "./stackChoices";
import {
  cloneState,
  collectEvents,
  createObject,
  decider,
  emit,
  emptyPool,
  emptyTurnStats,
  opponentsOf,
  random,
  registerDef,
  shuffle,
} from "./state";
import { msg } from "./text";
import { answerTriggerMode, answerTriggerOrder, answerTriggerTarget } from "./triggers";
import {
  advance,
  afterResolution,
  answerCombatAssignment,
  answerCommanderZone,
  answerLegendChoice,
  answerLeylines,
  answerUntapStep,
  bottomCards,
  declareAttackers,
  declareBlockers,
  declareLoopDraw,
  declareMulligan,
  discardToHandSize,
  eliminate,
  keepHand,
  passPriority,
} from "./turn";
import type { CardDef, Decision, GameEvent, GameState, PlayerId } from "./types";

export interface PlayerSetup {
  id: PlayerId;
  name: string;
  deck: CardDef[];
  /** Printing chosen for each card of the deck (same order; absent: the card's own art). */
  printings?: (string | null | undefined)[];
  /** Commander (903.6, PLAN-E): indices of the commanders in `deck`; they start in the command zone. */
  commanders?: number[];
}

export interface GameOptions {
  seed: number;
  /** Two players or more, in turn order. */
  players: PlayerSetup[];
  startingPlayer?: PlayerId;
  startingLife?: number;
  /** Game variant: Commander (903: command zone, tax, commander damage, 40 life by default). */
  variant?: GameVariant;
}

/** Rules variants of a game (PLAN-E). */
export type GameVariant = "commander";

/** Default starting life: 20, or 40 in Commander (903.7). */
export function defaultStartingLife(variant?: GameVariant): number {
  return variant === "commander" ? 40 : 20;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/** Empty state of a game: the players, without any card (shared by `createGame` and `createScenario`). */
export function blankState(opts: {
  seed: number;
  players: { id: PlayerId; name: string; life?: number }[];
  startingLife?: number;
  variant?: GameVariant;
}): GameState {
  if (opts.players.length < 2) throw new Error("At least two players are needed");
  const first = opts.players[0] as { id: PlayerId };
  const s: GameState = {
    version: 0,
    rng: opts.seed | 0,
    idCounters: {},
    timestamp: 0,
    defs: {},
    objects: {},
    players: {},
    playerOrder: opts.players.map((p) => p.id),
    battlefield: [],
    exile: [],
    stack: [],
    turn: {
      number: 0,
      active: first.id,
      step: "untap",
      landsPlayed: 0,
      onceFired: [],
      startingPlayer: first.id,
    },
    flow: "mulligan",
    priority: { holder: first.id, passes: 0 },
    combat: null,
    effects: [],
    pending: null,
    setup: { mulliganQueue: [] },
    batch: {},
    resolving: null,
    replacements: [],
    triggers: [],
    delayed: [],
    linkedExile: [],
    lki: {},
    turnLog: [],
    playerEffects: [],
    winner: null,
    over: false,
  };
  const startingLife = opts.startingLife ?? defaultStartingLife(opts.variant);
  if (opts.variant === "commander") s.commander = { cards: {} };
  for (const p of opts.players) {
    const life = p.life ?? startingLife;
    s.players[p.id] = {
      id: p.id,
      name: p.name,
      life,
      library: [],
      hand: [],
      graveyard: [],
      command: [],
      phasedOut: [],
      manaPool: emptyPool(),
      drewFromEmptyLibrary: false,
      lost: false,
      mulligans: 0,
      lastTurnStarted: 0,
      startingLife,
      turnStats: emptyTurnStats(),
    };
  }
  return s;
}

export function createGame(opts: GameOptions): StepResult {
  const [state, events] = collectEvents(() => {
    const s = blankState(opts);
    for (const p of opts.players) {
      p.deck.forEach((card, i) => {
        registerDef(s, card);
        // 903.6: the commander starts the game in the command zone.
        const commander = !!s.commander && !!p.commanders?.includes(i);
        const o = createObject(s, card.id, p.id, commander ? "command" : "library");
        if (commander && s.commander) s.commander.cards[o.uid] = { owner: p.id, defId: card.id, casts: 0, damage: {} };
        // Art of another printing (reprint, or printing from the table, checked by the caller): recorded by physical
        // identity, followed from one zone to another.
        const key = p.printings?.[i];
        if (key && (customArtSet(key) !== undefined || card.printings?.some((x) => x.key === key) || keyedPrinting(key)))
          s.printings = { ...s.printings, [o.uid]: key };
      });
      shuffle(s, s.players[p.id]?.library ?? []);
    }
    const starting = opts.startingPlayer ?? (s.playerOrder[Math.floor(random(s) * s.playerOrder.length)] as PlayerId);
    s.turn.startingPlayer = starting;
    s.turn.active = starting;
    emit({ type: "gameStart", startingPlayer: starting });
    for (const p of s.playerOrder) for (let i = 0; i < 7; i++) drawCard(s, p);
    s.setup.mulliganQueue = [starting, ...opponentsOf(s, starting)];
    advance(s);
    return s;
  });
  return { state, events };
}

function expect<T extends Decision["type"]>(d: Decision, ...types: T[]): asserts d is Extract<Decision, { type: T }> {
  if (!types.includes(d.type as T)) throw new RulesError(msg("Unexpected decision: {type}", { type: d.type }));
}

function apply(s: GameState, submitter: PlayerId, d: Decision): void {
  checkDecisionShape(s, d);
  // Any decision other than producing or undoing mana makes the mana taps final.
  if (d.type !== "tapForMana" && d.type !== "undoMana") s.manaUndo = undefined;
  s.batch.leftBatch = undefined;
  if (d.type === "concede") {
    const player = submitter;
    const pl = s.players[player];
    if (pl && !pl.lost) {
      emit({ type: "lose", player, reason: "concede" });
      eliminate(s, [player]);
    }
    return;
  }
  const p = s.pending;
  if (s.over || !p) throw new RulesError(msg("No decision pending"));
  // 722: the player who controls this turn decides instead of the controlled player (the decision remains the controlled player's).
  if (p.player !== submitter && decider(s) !== submitter) throw new RulesError(msg("It is not your decision to make"));
  const player = p.player;

  // The pending decision is consumed before applying the answer: the handler
  // can itself set the next decision (next defender, cards to put back…).
  s.pending = null;
  switch (p.kind) {
    case "mulligan":
      expect(d, "keep", "mulligan");
      if (d.type === "keep") keepHand(s, player);
      else declareMulligan(s, player);
      return;
    case "bottomCards":
      expect(d, "bottom");
      bottomCards(s, player, d.cards, p.count);
      return;
    case "declareAttackers":
      expect(d, "declareAttackers");
      declareAttackers(s, player, d.attackers);
      return;
    case "declareBlockers":
      expect(d, "declareBlockers");
      declareBlockers(s, player, d.blocks);
      return;
    case "discard":
      expect(d, "discard");
      discardToHandSize(s, player, d.cards, p.count);
      return;
    case "choice": {
      expect(d, "choose");
      try {
        validateChoice(p.request, d.values, s);
      } catch (e) {
        s.pending = p; // the question remains asked
        throw e;
      }
      emit({ type: "choice", player, intent: p.request.intent });
      switch (p.purpose.kind) {
        case "effect": {
          // Mana ability (605.3b): priority goes back to the player who activated it.
          const back = s.resolving?.returnPriority;
          if (answerResolutionChoice(s, d.values)) {
            if (back) {
              s.priority = back;
              s.flow = "priority";
            } else afterResolution(s);
          }
          return;
        }
        case "combatDamage":
          if (p.request.type !== "divide") throw new RulesError(msg("Division expected"));
          answerCombatAssignment(s, p.purpose.attacker, divisionOf(p.request, d.values));
          return;
        case "legend":
          if (p.request.type !== "pick") throw new RulesError(msg("Choice expected"));
          answerLegendChoice(s, String(d.values[0]), p.request.options);
          return;
        case "triggerOrder":
          answerTriggerOrder(s, p.purpose.player, d.values.map(String));
          return;
        case "triggerTarget":
          answerTriggerTarget(s, p.purpose.trigger, p.purpose.spec, d.values.map(String));
          return;
        case "triggerMode":
          answerTriggerMode(s, p.purpose.trigger, Number(d.values[0]));
          return;
        case "leyline":
          answerLeylines(s, p.purpose.player, d.values.map(String));
          return;
        case "stackChoice":
          answerStackChoice(s, p.purpose.stackId, p.request, d.values);
          return;
        case "commanderZone":
          answerCommanderZone(s, p.purpose.card, d.values[0] === 1);
          return;
        case "untap":
          answerUntapStep(s, d.values.map(String));
          return;
      }
      return;
    }
    case "priority":
      if (p.castNow) {
        // 608.2g: cast one of the offered cards (or pass to decline), then the resolution resumes.
        expect(d, "pass", "cast", "tapForMana", "undoMana");
        if (d.type === "tapForMana" || d.type === "undoMana") {
          if (d.type === "tapForMana")
            activateManaAbility(s, player, d.source, d.ability, d.colors ?? d.color, false, [], d.picks?.costTap);
          else undoMana(s, player, d.source);
          s.pending = p;
          return;
        }
        let spell: string | null = null;
        if (d.type === "cast") {
          if (!p.castNow.cards.includes(d.card)) throw new RulesError(msg("This card cannot be cast now"));
          castSpell(s, player, d.card, d);
          // The cast spell (new object on the stack, 400.7): the following effects can refer to it.
          spell = s.stack[s.stack.length - 1]?.sourceId ?? d.card;
        }
        if (answerCastNow(s, spell)) afterResolution(s);
        return;
      }
      expect(d, "pass", "playLand", "cast", "activate", "tapForMana", "undoMana");
      switch (d.type) {
        case "pass":
          passPriority(s, player);
          break;
        case "playLand":
          playLand(s, player, d.card, !!d.payLife, d.landType, d.chosen, !!d.back);
          s.priority.passes = 0;
          break;
        case "cast":
          castSpell(s, player, d.card, d);
          break;
        case "activate":
          activateAbility(s, player, d.source, d.ability, d);
          break;
        case "tapForMana":
          activateManaAbility(s, player, d.source, d.ability, d.colors ?? d.color, false, [], d.picks?.costTap);
          break;
        case "undoMana":
          undoMana(s, player, d.source);
          break;
      }
      return;
  }
}

/**
 * Applies a player's decision then advances the game until the next decision.
 * Throws a RulesError if the decision is illegal (the original state stays unchanged).
 */
export function submit(state: GameState, player: PlayerId, decision: Decision): StepResult {
  const [next, events] = collectEvents(() => {
    const s = cloneState(state);
    const stacked = s.stack.length > 0;
    apply(s, player, decision);
    advance(s);
    watchLoop(s, decision, stacked);
    return s;
  });
  return { state: next, events };
}

/**
 * 104.4b: detection of a loop of mandatory actions. As long as the players only pass (or answer the choices of the
 * loop: order of triggers, targets) while the stack is not empty (triggers that set themselves off again), we count;
 * beyond `LOOP_SUSPECT`, we take the canonical fingerprint of the state (`outcomeHash`): the same one three times, or
 * more than `LOOP_LIMIT` passes, and the game is a draw. A loop that accumulates (tokens each turn, triggers on the
 * stack: Ganax and Draconic Visitor) is recognized by its fingerprint in which tokens and stack objects count only
 * once: the same one three times, without the stack or the battlefield shrinking.
 */
function watchLoop(s: GameState, d: Decision, stacked: boolean): void {
  if (s.over) return;
  if (d.type === "choose" && s.loop && s.stack.length > 0) return;
  if (d.type !== "pass" || !stacked || s.stack.length === 0) {
    s.loop = undefined;
    return;
  }
  s.loop ??= { passes: 0, seen: [] };
  const loop = s.loop;
  loop.passes += 1;
  if (loop.passes > LOOP_LIMIT) {
    declareLoopDraw(s);
    return;
  }
  if (loop.passes < LOOP_SUSPECT) return;
  const h = outcomeHash(s);
  if (loop.seen.filter((x) => x === h).length >= 2) {
    declareLoopDraw(s);
    return;
  }
  loop.seen.push(h);
  const g = { h: outcomeHash(s, true), stack: s.stack.length, field: s.battlefield.length };
  loop.growth ??= [];
  const same = loop.growth.filter((x) => x.h === g.h);
  const last = same.at(-1);
  // The stack and the battlefield have not shrunk since last time (a finite chain makes the stack go down).
  if (last && (g.stack < last.stack || g.field < last.field)) loop.growth = loop.growth.filter((x) => x.h !== g.h);
  else if (same.length >= 2) {
    declareLoopDraw(s);
    return;
  }
  loop.growth.push(g);
}

/**
 * Copy-free variant, reserved for simulations (AI) on a working copy obtained by `cloneState`.
 * Warning: if the decision is illegal, the state may remain half modified.
 */
export function applyMutable(s: GameState, player: PlayerId, decision: Decision): void {
  collectEvents(() => {
    const stacked = s.stack.length > 0;
    apply(s, player, decision);
    advance(s);
    watchLoop(s, decision, stacked);
  });
}

/** 104.4b: the host notices a loop of automatic decisions; the game is a draw. */
export function drawByLoop(state: GameState): StepResult {
  const [next, events] = collectEvents(() => {
    const s = cloneState(state);
    declareLoopDraw(s);
    return s;
  });
  return { state: next, events };
}
