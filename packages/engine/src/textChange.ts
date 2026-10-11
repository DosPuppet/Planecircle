/**
 * Text-changing effects that replace a word (612.2, layer 3): "change the text of that creature by replacing all
 * instances of one creature type with another" (New Blood). Pure functions over the serializable ability data: the
 * subtype fields of filters, token specs and type changes (`subtype`, `anySubtype`, `notSubtype`, `noneOfSubtypes`,
 * `subtypes`, `addSubtypes`, `setSubtypes`, `firstOf`) are mapped; names (612.1: the name of a card can't change), labels
 * and chosen values (`chosen: "subtype"`) are not. A token's name made of its subtype (111.4) follows it.
 */
import { isCreatureType } from "./names";
import type { WordChange } from "./types";

/** Fields that hold subtype words (a string or a list of strings). */
const SUBTYPE_KEYS = new Set([
  "subtype",
  "subtypes",
  "anySubtype",
  "notSubtype",
  "noneOfSubtypes",
  "addSubtypes",
  "setSubtypes",
  "firstOf",
]);

/** Whether `word` is a word of this kind (612.2: only words used as that kind are changed). */
function isWordOf(kind: WordChange["kind"], word: string): boolean {
  return kind === "creatureType" && isCreatureType(word);
}

const replaceWord = (w: unknown, c: WordChange): unknown => (w === c.from ? c.to : w);

function mapValue(value: unknown, c: WordChange): unknown {
  if (Array.isArray(value)) {
    let out: unknown[] | undefined;
    value.forEach((v, i) => {
      const m = mapValue(v, c);
      if (m !== v) {
        out ??= [...value];
        out[i] = m;
      }
    });
    return out ?? value;
  }
  if (!value || typeof value !== "object") return value;
  const memo = cache.get(value)?.get(keyOf(c));
  if (memo) return memo;
  const src = value as Record<string, unknown>;
  let out: Record<string, unknown> | undefined;
  for (const [k, v] of Object.entries(src)) {
    let m: unknown;
    if (SUBTYPE_KEYS.has(k))
      m = Array.isArray(v) ? (v.some((w) => w === c.from) ? v.map((w) => replaceWord(w, c)) : v) : replaceWord(v, c);
    else m = mapValue(v, c);
    if (m !== v) {
      out ??= { ...src };
      out[k] = m;
    }
  }
  // 111.4: a token named after its subtype ("a 1/1 Goblin creature token") is named after the new one.
  if (out && src.name === c.from && Array.isArray(src.subtypes) && src.subtypes.includes(c.from)) out.name = c.to;
  const result = out ?? value;
  let byChange = cache.get(value);
  if (!byChange) {
    byChange = new Map();
    cache.set(value, byChange);
  }
  byChange.set(keyOf(c), result);
  return result;
}

/** Mapped objects, by source object and change: the same input gives the same object (stable identities, no rework). */
const cache = new WeakMap<object, Map<string, unknown>>();
const keyOf = (c: WordChange) => `${c.kind}|${c.from}|${c.to}`;

/** `value` with every instance of the changed word replaced (the same object if nothing changes). */
export function replaceWords<T>(value: T, changes: readonly WordChange[]): T {
  let out: unknown = value;
  for (const c of changes) out = mapValue(out, c);
  return out as T;
}

/** The words of this kind used in `value`'s subtype fields, in order of appearance, without duplicates. */
export function wordsIn(value: unknown, kind: WordChange["kind"], out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) wordsIn(v, kind, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SUBTYPE_KEYS.has(k)) {
      for (const w of Array.isArray(v) ? v : [v]) if (typeof w === "string" && isWordOf(kind, w) && !out.includes(w)) out.push(w);
    } else wordsIn(v, kind, out);
  }
  return out;
}
