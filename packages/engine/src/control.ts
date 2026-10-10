/**
 * Layer 2 (613.1b): control of permanents. Each permanent has a base controller (`baseController`, set when it
 * enters); control effects (`ContinuousEffect.controller`: steal "until end of turn", donate, exchange, "for as long as
 * you control") and the Auras that grant control (Confiscate, Eriette) apply to it in timestamp order (613.7).
 * `syncControl` (state.ts, which calls it when a permanent leaves the battlefield) recomputes the controller of each
 * permanent and changes it if needed: when an effect ends, the permanent goes back to whoever would control it without
 * it, even if other effects ended in the meantime.
 *
 * `o.controller` remains the stored value that the whole engine reads; it is up to date only after `syncControl`,
 * called at the end of each control operation, in state-based actions, after cleanup and when a player leaves the game
 * (800.4a).
 */
import { bump, newId, nextTimestamp, syncControl } from "./state";
import type { ContinuousEffect, GameState, ObjectId, PlayerId } from "./types";

/** Adds a control effect and applies it at once. */
export function addControlEffect(
  s: GameState,
  ids: ObjectId[],
  to: PlayerId,
  duration: ContinuousEffect["duration"],
  extra: Pick<ContinuousEffect, "whileSource" | "whileControlledBy" | "whileAttached" | "until" | "sinceTurn"> = {},
): void {
  if (ids.length === 0) return;
  s.effects.push({ id: newId(s, "e"), timestamp: nextTimestamp(s), affected: [...ids], duration, controller: to, ...extra });
  bump(s);
  syncControl(s);
}
