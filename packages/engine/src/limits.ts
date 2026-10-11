/**
 * Safety caps of the engine (docs/engine.md, section on the safety caps; PLAN-C in docs/history.md, lot C1).
 *
 * The loop guards declare the game a draw (104.4b); the others cut an amount. A cut emits the `capReached` event (game
 * log, counted by the fuzz): it signals an approximation, never normal operation. Every new cap goes here, in
 * docs/engine.md and in docs/approximations.md.
 */
import { emit } from "./events";

/** Steps of the game flow (`advance`) without a decision: beyond, a loop of mandatory actions, the game is a draw. */
export const MAX_FLOW_STEPS = 100_000;
/** Consecutive passes of state-based actions: beyond, the game is a draw. */
export const MAX_SBA_PASSES = 100;
/** Passes with a non-empty stack beyond which the fingerprint of the state is recorded (mandatory loop, 104.4b). */
export const LOOP_SUSPECT = 20;
/** Passes with a non-empty stack beyond which the game is a draw, even without a repeated fingerprint. */
export const LOOP_LIMIT = 2000;
/** Consecutive automatic decisions (AI, autopilot) in a turn: beyond, the game is a draw (`GameHost`). */
export const MAX_AUTOMATIC_DECISIONS = 10_000;
/** Tokens created by a single event. */
export const MAX_TOKENS_PER_EVENT = 100;
/** Objects on the battlefield beyond which no token is created. */
export const MAX_BATTLEFIELD = 400;
/** Replaced amount (damage, counters, life, cards, tokens): doublers multiplying each other would give infinity. */
export const MAX_AMOUNT = 1_000_000;
/**
 * Announced X (spells and abilities, squad and replicate counts): beyond, the decision is refused (a cost of that many
 * symbols would be built before the payment fails; the options of `legalActions` stay far below).
 */
export const MAX_X = 1_000_000;
/** Numeric replacements of a single event whose orders are all tried (616.1); beyond, the order of the code. */
export const MAX_PERMUTED = 5;
/** Repetitions of `repeat` ("for each vote, …"): each one copies its effects into the resolution. */
export const MAX_REPEATS = 100;
/** Applications of the layers to resolve dependencies (613.8, fixed point). */
export const MAX_LAYER_PASSES = 3;

export type CapName = "tokens" | "amount" | "permutations" | "layers";

/** A cut happened: log event (without hidden information). */
export function capReached(cap: CapName): void {
  emit({ type: "capReached", cap });
}
