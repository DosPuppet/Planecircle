/**
 * Every effect `op` written by a handled card has a handler (PLAN-M M2): `runEffectWith` (effects.ts) does nothing for an
 * unknown op, so a typo or a raw `{ op: … } as Effect` literal without a handler would be a silent no-op. The handlers are
 * registered by `ops/index.ts` (`opRegistry.ts`), loaded with the engine.
 */
import { describe, expect, it } from "vitest";
import { registeredOps } from "../../engine/src/opRegistry";
import { implementedCards, TOKEN_SPECS } from "../src/index";
import { unionVariants } from "./debtSurface";

/** The `op` values found in a card definition (abilities, modes, tokens it creates…), with the card that writes them. */
function writtenOps(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (v: unknown, card: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, card);
    else if (v && typeof v === "object") {
      const op = (v as { op?: unknown }).op;
      if (typeof op === "string") out.set(op, (out.get(op) ?? new Set()).add(card));
      for (const x of Object.values(v)) walk(x, card);
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  for (const [name, t] of Object.entries(TOKEN_SPECS)) walk(t, `token ${name}`);
  return out;
}

/**
 * Ops applied outside a resolution, by the special action that carries them (`activateAbility`, stack.ts), with no
 * handler: never put on the stack.
 */
const SPECIAL_ACTION_OPS = new Set(["foretell"]);

describe("effect handlers", () => {
  const handled = new Set([...registeredOps(), ...SPECIAL_ACTION_OPS]);

  it("every op written by a handled card has a handler", () => {
    const missing = [...writtenOps()]
      .filter(([op]) => !handled.has(op))
      .map(([op, cards]) => `${op} (${[...cards].slice(0, 3).join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("every op of the Effect union has a handler, and every handler an op of the union", () => {
    const declared = new Set(unionVariants("Effect", "op").keys());
    expect([...declared].filter((op) => !handled.has(op))).toEqual([]);
    expect(registeredOps().filter((op) => !declared.has(op))).toEqual([]);
  });
});
