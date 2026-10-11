/**
 * Measurements of the engine surfaces for the debt guard (debt.test.ts ; PLAN-C in docs/history.md, lot C1).
 *
 * The `typescript` 7 package does not expose the compiler API: a small parser is enough, the engine's type files
 * being regular (interfaces and unions of objects with a discriminant).
 */
import { readdirSync, readFileSync } from "node:fs";
import { implementedCards } from "../src/index";

const ROOT = new URL("../../", import.meta.url);

export const source = (path: string) => readFileSync(new URL(path, ROOT), "utf8");

/** The text without its comments (strings are kept as they are). */
export function stripComments(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    const next = text[i + 1];
    if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const OPEN = new Set(["{", "[", "("]);
const CLOSE = new Set(["}", "]", ")"]);

/** Index of the closing brace matching the one at `start`. */
function matching(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
      i = j;
      continue;
    }
    if (OPEN.has(c)) depth += 1;
    else if (CLOSE.has(c)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("unclosed brace");
}

/** Names of the members of an object type body (top level only). */
function members(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let atStart = true;
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < body.length && body[j] !== c) j += body[j] === "\\" ? 2 : 1;
      i = j;
      atStart = false;
      continue;
    }
    if (OPEN.has(c)) {
      depth += 1;
      atStart = false;
      continue;
    }
    if (CLOSE.has(c)) {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;
    if (c === ";" || c === "\n" || c === ",") {
      atStart = true;
      continue;
    }
    if (atStart && /\S/.test(c)) {
      atStart = false;
      const m = /^(?:readonly\s+)?(\w+)\??\s*:/.exec(body.slice(i));
      if (m) out.push(m[1] as string);
    }
  }
  return out;
}

const MODEL_FILES = [
  "engine/src/types.ts",
  "engine/src/model/cards.ts",
  "engine/src/model/rules.ts",
  "engine/src/model/effects.ts",
  "engine/src/model/state.ts",
  "engine/src/model/decisions.ts",
];

let modelText: string | null = null;
function model(): string {
  modelText ??= MODEL_FILES.map((f) => stripComments(source(f))).join("\n");
  return modelText;
}

/** Fields of a model interface (without those inherited through `extends`). */
export function interfaceFields(name: string): string[] {
  const text = model();
  const m = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(text);
  if (!m) throw new Error(`interface ${name} introuvable`);
  const open = m.index + m[0].length - 1;
  return members(text.slice(open + 1, matching(text, open)));
}

/** Variants of a union of objects with a discriminant: discriminant value → variant fields. */
export function unionVariants(name: string, discriminant: string): Map<string, string[]> {
  const text = model();
  const m = new RegExp(`export type ${name}\\s*=`).exec(text);
  if (!m) throw new Error(`type ${name} introuvable`);
  const out = new Map<string, string[]>();
  let i = m.index + m[0].length;
  // The union stops at the first top-level ";".
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === ";") break;
    if (c === '"') {
      // Literal member ("| \"self\""): counted as a variant without fields.
      const end = text.indexOf('"', i + 1);
      out.set(text.slice(i + 1, end), []);
      i = end;
      continue;
    }
    if (c === "{") {
      const end = matching(text, i);
      const body = text.slice(i + 1, end);
      const fields = members(body);
      const value = new RegExp(`(?:^|[;\\s{])${discriminant}\\??\\s*:\\s*"([^"]+)"`).exec(body)?.[1];
      if (value) out.set(value, fields);
      i = end;
    } else if (c === "(" || c === "[") i = matching(text, i);
  }
  if (out.size === 0) throw new Error(`union ${name} vide`);
  return out;
}

/**
 * Field names declared across the model (interfaces and variants): at the start of a line, and also after `{`, `;` or
 * `,` (union variant written on one line, nested object), without which these keys escaped the guard (audit of
 * 2026-10-07).
 */
export function declaredFieldNames(): Set<string> {
  const text = model();
  return new Set([
    ...[...text.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((m) => m[1] as string),
    ...[...text.matchAll(/[{;,]\s*(?:readonly\s+)?(\w+)\??\s*:/g)].map((m) => m[1] as string),
  ]);
}

/** Runtime imports (excluding `import type`) between the `engine/src` files, then the largest cycle (Tarjan). */
export function largestImportCycle(): string[] {
  const dir = new URL("engine/src/", ROOT);
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(new URL(rel, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}${e.name}/`);
      else if (e.name.endsWith(".ts")) files.push(`${rel}${e.name}`);
    }
  };
  walk("");
  const norm = (from: string, spec: string): string | null => {
    if (!spec.startsWith(".")) return null;
    const parts = from.split("/").slice(0, -1);
    for (const p of spec.split("/")) {
      if (p === "..") parts.pop();
      else if (p !== ".") parts.push(p);
    }
    const base = parts.join("/");
    return files.includes(`${base}.ts`) ? `${base}.ts` : files.includes(`${base}/index.ts`) ? `${base}/index.ts` : null;
  };
  const edges = new Map<string, string[]>();
  for (const f of files) {
    const text = stripComments(readFileSync(new URL(f, dir), "utf8"));
    const deps: string[] = [];
    for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+"([^"]+)"/gm)) {
      if (m[2]) continue;
      // `import { type A, type B }`: only types.
      const names = /\{([\s\S]*)\}/.exec(m[3] ?? "")?.[1];
      if (names?.split(",").every((n) => !n.trim() || n.trim().startsWith("type "))) continue;
      const to = norm(f, m[4] as string);
      if (to) deps.push(to);
    }
    edges.set(f, deps);
  }
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  let best: string[] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v) as number, idx.get(w) as number));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > best.length) best = comp;
    }
  };
  for (const f of files) if (!idx.has(f)) strong(f);
  return best.sort();
}

/** String literals in the `engine/src` code (comments excluded). */
export function engineLiterals(): string[] {
  const dir = new URL("engine/src/", ROOT);
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(new URL(rel, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}${e.name}/`);
      else if (e.name.endsWith(".ts")) {
        const text = stripComments(readFileSync(new URL(`${rel}${e.name}`, dir), "utf8"));
        for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push((m[1] ?? m[2]) as string);
      }
    }
  };
  walk("");
  return out;
}

/**
 * Surfaces measured by the debt guard (`debt.test.ts`, `ceilings` section, and `tools/debt-ceilings.ts`):
 * model interfaces (number of fields) and unions with a discriminant (variants, and fields of all variants).
 * PLAN-H H0: ten structures added, which were growing untracked; H10: `FilterCompare`; PLAN-M M5: the `CardDef` groups
 * (`KickerDef`, `CardRules`, the `CastOption` union).
 */
export const INTERFACE_SURFACES = [
  "CardDef",
  "GameObject",
  "StackItem",
  "PlayerState",
  "GameState",
  "ObjectFilter",
  "FilterCompare",
  "CostDef",
  "ActivatedAbilityDef",
  "CastPermissionAbilityDef",
  "PlayFromZone",
  "LayerMods",
  "TriggerMod",
  "EventReplacement",
  "CastInfo",
  "TurnLogQuery",
  "MoveSpec",
  "BlockRule",
  "TargetSpec",
  "AdditionalCost",
  "CastLimit",
  "NextSpell",
  "KickerDef",
  "CardRules",
] as const;
export const UNION_SURFACES = [
  ["Effect", "op"],
  ["TriggerSpec", "on"],
  ["Condition", "kind"],
  ["Amount", "kind"],
  ["Ref", "kind"],
  ["CastOption", "kind"],
] as const;

/** Size of each model surface: fields of an interface, variants of a union, fields of all its variants. */
export function measureSurfaces(): Record<string, number> {
  const out: Record<string, number> = {};
  out["Single-card values"] = singleCardValues(implementedCards());
  for (const name of INTERFACE_SURFACES) out[name] = interfaceFields(name).length;
  for (const [name, discriminant] of UNION_SURFACES) {
    const variants = unionVariants(name, discriminant);
    out[name] = variants.size;
    out[`${name} (fields)`] = [...variants.values()].reduce((n, f) => n + f.length, 0);
  }
  return out;
}

/** String literals written in the model (closed union values: `"host" | "notHost"`…). */
function modelLiterals(): Set<string> {
  return new Set([...model().matchAll(/"([^"\n]+)"/g)].map((m) => m[1] as string));
}

/**
 * Fields whose value is printed data or a free name, not a model choice: types, colors, keywords,
 * counter kinds, card names and remembered values, discriminants tracked separately (`op`, `kind`, `on`).
 */
const PLAYER_TEXT = new Set(["label", "prompt", "text"]);

const NOT_MODEL_VALUES = new Set([
  "op",
  "kind",
  "on",
  "id",
  "name",
  "store",
  "keyword",
  "keywords",
  "addKeywords",
  "removeKeywords",
  "forbidKeywords",
  "types",
  "supertypes",
  "subtypes",
  "addTypes",
  "addSubtypes",
  "setSubtypes",
  "subtype",
  "anySubtype",
  "notSubtype",
  "noneOfSubtypes",
  "firstOf",
  "colors",
  "addColors",
  "setColors",
  "becomes",
  "color",
  "produce",
  "extraMana",
  "manaProduced",
  "counter",
  "counterKind",
  "withCounter",
  "perCounter",
  "addCounter",
  "number",
  "key",
  "origin",
  "labels",
  "options",
  "layout",
  "rarity",
]);

/** Parent keys whose `kind` field is a closed list of values rather than a union discriminant (`KickerDef.kind`). */
const QUALIFIED_KINDS = new Set(["kicker"]);

/**
 * Closed model union values (`attached: "toHost"`, `spellFate.fate: "rebound"`…) that a single handled card
 * writes, counted per field and value pair: single-card debt that the keys do not show (audit of
 * 2026-10-07). Tracked by a ceiling rather than a list.
 */
export function singleCardValues(cards: readonly { name: string }[]): number {
  const literals = modelLiterals();
  const users = new Map<string, Set<string>>();
  const walk = (v: unknown, card: string, key: string, parent: string): void => {
    if (Array.isArray(v)) for (const x of v) walk(x, card, key, parent);
    else if (v && typeof v === "object") {
      // Player-facing texts (labels, prompts; English since PLAN-I) are not model values, even when they read like one.
      if (key === "labels") return;
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, card, k, key);
    } else if (typeof v === "string") {
      // A `kind` that is not a union discriminant (`KickerDef.kind`, PLAN-M M5) is a model value, qualified by its parent.
      const field = key === "kind" && QUALIFIED_KINDS.has(parent) ? `${parent}.kind` : key;
      if (!NOT_MODEL_VALUES.has(field) && !PLAYER_TEXT.has(field) && literals.has(v))
        users.set(`${field}=${v}`, (users.get(`${field}=${v}`) ?? new Set()).add(card));
    }
  };
  for (const c of cards) walk(c, c.name, "", "");
  return [...users.values()].filter((u) => u.size === 1).length;
}
