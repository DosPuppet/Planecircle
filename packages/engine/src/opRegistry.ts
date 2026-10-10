/**
 * The `op → handler` table of the effect interpreter (`runEffectWith`, effects.ts). The `ops/*.ts` modules export their
 * `HANDLERS`, registered by `ops/index.ts`, which `game.ts` imports: effects.ts does not import the handlers, which keeps
 * `ops/` out of the engine's import cycle (PLAN-M M2). This module imports only types.
 */
import type { EffectContext, OpResult } from "./effects";
import type { Effect, GameState, Resolution } from "./types";

/** Handling of an effect `op`: s, resolution, effect (typed by its `op`), context, choice key. */
export type Handler<E extends Effect> = (
  s: GameState,
  r: Resolution,
  e: E,
  ctx: EffectContext,
  key: (suffix: string) => string,
) => OpResult;
export type AnyHandler = Handler<never>;
/** `op → handler` table, split by domain in `ops/`. */
export type OpHandlers = { [K in Effect["op"]]?: Handler<Extract<Effect, { op: K }>> };

const registry: Record<string, AnyHandler> = {};

/** Adds the handlers of an `ops/` domain; an `op` has one handler only. */
export function registerOps(handlers: OpHandlers): void {
  for (const [op, handler] of Object.entries(handlers as Record<string, AnyHandler>)) {
    if (registry[op] && registry[op] !== handler) throw new Error(`effect op "${op}" registered twice`);
    registry[op] = handler;
  }
}

/** The handler of an `op` (undefined: unknown op). */
export function opHandler(op: string): AnyHandler | undefined {
  return registry[op];
}

/** The registered ops (the test that every op written by a card has a handler). */
export function registeredOps(): string[] {
  return Object.keys(registry);
}
