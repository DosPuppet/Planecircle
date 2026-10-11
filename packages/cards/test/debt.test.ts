/**
 * Debt guard (audit of 2026-09-30, § 3.3; PLAN-R in docs/history.md, lot F2; extended by the audit of 2026-10-02,
 * § 5.1, PLAN-C in docs/history.md, lot C1): no new flag, keyword, operation, property or field specific to one card
 * without a justification in data/debt-baseline.json, and the baseline only goes down. Rule: end of CLAUDE.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import baseline from "../data/debt-baseline.json";
import { implementedCards } from "../src/index";
import {
  declaredFieldNames,
  engineLiterals,
  interfaceFields,
  largestImportCycle,
  measureSurfaces,
  unionVariants,
} from "./debtSurface";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Fields of PlayerStaticAbilityDef (lines indented by two spaces in the interface). */
function playerStaticKeys(): string[] {
  const body = /export interface PlayerStaticAbilityDef \{([\s\S]*?)\n\}/.exec(source("engine/src/model/cards.ts"))?.[1];
  if (!body) throw new Error("PlayerStaticAbilityDef not found");
  return (
    [...body.matchAll(/^ {2}(\w+)\??:/gm)]
      .map((m) => m[1] as string)
      // Meta keys (scope and conditions), like `NOT_KEYS` in engine/src/statics.ts.
      .filter((k) => !["kind", "condition", "label", "affects"].includes(k))
  );
}

/** Members of Keyword that are not printed keywords (values of KEYWORD_NAMES in scryfall.ts). */
function nonPrintedKeywords(): string[] {
  // Comments removed first: a ";" in a comment would cut the union.
  const types = source("engine/src/types.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  const union = /export type Keyword =([\s\S]*?);/.exec(types)?.[1];
  const names = /const KEYWORD_NAMES[^{]*\{([\s\S]*?)\n\};/.exec(source("cards/src/scryfall.ts"))?.[1];
  if (!union || !names) throw new Error("Keyword or KEYWORD_NAMES not found");
  const printed = new Set([...names.matchAll(/:\s*"(\w+)"/g)].map((m) => m[1]));
  return [...union.matchAll(/"(\w+)"/g)].map((m) => m[1] as string).filter((k) => !printed.has(k));
}

/** Effect operations used by a single implemented card (tokens included). */
function singleCardOps(): string[] {
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, name: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, name);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.op === "string") users.set(o.op, (users.get(o.op) ?? new Set()).add(name));
      for (const x of Object.values(o)) walk(x, name);
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  return [...users].filter(([, cards]) => cards.size === 1).map(([op]) => op);
}

/**
 * Variants of the Condition, Amount, Ref, CastOption (discriminant `kind`) and TriggerSpec (`on`) unions written by a
 * single implemented card, noted "Union.variant" (audit of 2026-10-07: like the ops, they escaped the guard; PLAN-M M5:
 * the cast options of `CardDef`).
 */
function singleCardVariants(): string[] {
  const unions = [
    ["Condition", "kind"],
    ["Amount", "kind"],
    ["Ref", "kind"],
    ["TriggerSpec", "on"],
    ["CastOption", "kind"],
  ] as const;
  const declared = unions.map(([name, d]) => [name, d, new Set(unionVariants(name, d).keys())] as const);
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, name: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, name);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const [union, d, variants] of declared) {
        const value = o[d];
        if (typeof value === "string" && variants.has(value)) {
          const k = `${union}.${value}`;
          users.set(k, (users.get(k) ?? new Set()).add(name));
        }
      }
      for (const x of Object.values(o)) walk(x, name);
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  return [...users].filter(([, cards]) => cards.size === 1).map(([k]) => k);
}

/**
 * Properties declared in the engine model and used by a single implemented card, at any depth of its
 * definition (except fields of PlayerStaticAbilityDef, tracked separately).
 */
function singleCardKeys(): string[] {
  const declared = declaredFieldNames();
  const statics = new Set(playerStaticKeys());
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, name: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, name);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        // A key written without a value (`toCardDef`, `activated()` copy all the options) is not used.
        if (x === undefined) continue;
        if (declared.has(k) && !statics.has(k)) users.set(k, (users.get(k) ?? new Set()).add(name));
        walk(x, name);
      }
    }
  };
  for (const c of implementedCards()) walk(c, c.name);
  return [...users].filter(([, cards]) => cards.size === 1).map(([k]) => k);
}

/** GameObject fields that count "this turn": their place is the turn log (turnlog.ts). */
function turnFields(): string[] {
  return interfaceFields("GameObject").filter((k) => /Turn$/.test(k));
}

/** Card names hardcoded in the engine code's strings (comments excluded). */
function engineCardLiterals(): string[] {
  const names = implementedCards()
    .map((c) => c.name)
    .filter((n) => /[ ,]/.test(n) && n.length >= 8);
  const found = new Set<string>();
  for (const l of engineLiterals()) if (/[A-Z]/.test(l)) for (const n of names) if (l.includes(n)) found.add(n);
  return [...found];
}

const RULE = 'see "Rule: no single-card debt" in CLAUDE.md: look for a generic form, otherwise justify the entry';

describe("debt guard (data/debt-baseline.json)", () => {
  const sections: [keyof typeof baseline, () => string[]][] = [
    ["playerStatic", playerStaticKeys],
    ["keyword", nonPrintedKeywords],
    ["op", singleCardOps],
    ["variant", singleCardVariants],
    ["singleCardKeys", singleCardKeys],
    ["turnFields", turnFields],
    ["engineCardLiterals", engineCardLiterals],
  ];
  it.each(sections)("%s: nothing new, nothing stale", (section, find) => {
    const known = baseline[section] as Record<string, string>;
    const found = find();
    // The reader finds something (except in the emptied sections: engine card names; "this turn" fields,
    // all in the turn log since PLAN-H H11).
    if (section !== "engineCardLiterals" && section !== "turnFields") expect(found.length).toBeGreaterThan(0);
    expect(
      found.filter((k) => !(k in known)),
      `New card-specific entry (${RULE})`,
    ).toEqual([]);
    expect(
      Object.keys(known).filter((k) => !found.includes(k)),
      "Entry gone or made generic: remove it from data/debt-baseline.json",
    ).toEqual([]);
  });

  it("model surface ceilings (ceilings): neither exceeded nor too high", () => {
    const measured = measureSurfaces();
    const ceilings = baseline.ceilings as Record<string, number>;
    for (const [name, n] of Object.entries(measured)) {
      const max = ceilings[name];
      expect(max, `${name}: ceiling missing from data/debt-baseline.json`).toBeDefined();
      expect(n, `${name} exceeds its ceiling (${RULE}; raising the ceiling must be justified in the lot)`).toBeLessThanOrEqual(
        max as number,
      );
      expect(n, `${name} went down: lower its ceiling in data/debt-baseline.json`).toBe(max);
    }
    expect(Object.keys(ceilings).sort()).toEqual(Object.keys(measured).sort());
  });

  it("largest engine import cycle: does not grow", () => {
    const cycle = largestImportCycle();
    expect(cycle.length, `Import cycle grew: ${cycle.join(", ")}`).toBeLessThanOrEqual(baseline.importCycleMax);
    expect(cycle.length, "Import cycle shrank: lower importCycleMax in data/debt-baseline.json").toBe(baseline.importCycleMax);
  });
});
