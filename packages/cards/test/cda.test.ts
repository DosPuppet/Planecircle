/**
 * P/T defined by an ability and "for each" bonuses (`perAmount`): computed during layer calculation by
 * `cdaValue`, which only knows some kinds of amounts (`CDA_AMOUNT_KINDS`); another kind would be worth 0 without saying
 * so. No handled card may use one (PLAN-C in docs/history.md, lot C10).
 */
import { type Amount, CDA_AMOUNT_KINDS, cdaKey } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { implementedCards } from "../src/index";

function kinds(a: Amount | undefined, out: string[] = []): string[] {
  if (a === undefined || typeof a === "number") return out;
  out.push(cdaKey(a));
  if (a.kind === "sum") for (const x of a.of) kinds(x, out);
  return out;
}

describe("amounts of ability-defined P/T", () => {
  it("all the kinds used are computed by cdaValue", () => {
    const bad: string[] = [];
    for (const c of implementedCards()) {
      const amounts: (Amount | undefined)[] = [c.cda?.pt, c.cda?.power, c.cda?.toughness];
      for (const ab of c.abilities) if (ab.kind === "static" && ab.perAmount !== undefined) amounts.push(ab.perAmount);
      for (const a of amounts) for (const k of kinds(a)) if (!CDA_AMOUNT_KINDS.has(k)) bad.push(`${c.name}: ${k}`);
    }
    expect(bad).toEqual([]);
  });
});
