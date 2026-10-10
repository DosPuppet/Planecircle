/** Helpers shared by the `fx` builder families (dsl/fx-*.ts). */
import type { Effect, ObjectFilter, Ref } from "../types";

/** List of effects, where `fx.may(...)` may appear as is (it is flattened). */
export type Effects = (Effect | Effect[])[];

/**
 * The permanents of the filter, as a reference (`zone`): yours, your opponents' or all players' according to its
 * `controller` ("each creature you control", "all creatures").
 */
export function allMatching(filter: ObjectFilter): Ref {
  const who: Ref =
    filter.controller === "you"
      ? { kind: "you" }
      : filter.controller === "opponent"
        ? { kind: "eachOpponent" }
        : { kind: "eachPlayer" };
  return { kind: "zone", zone: "battlefield", who, filter };
}
