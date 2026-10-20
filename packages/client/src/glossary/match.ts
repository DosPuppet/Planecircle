/**
 * Glossary words in a rules text: the text cut into plain pieces and terms (the entries of `entries.ts`). Pure, so that
 * `glossary.test.ts` checks it on the catalog's texts.
 */
import type { Lang } from "../translate";
import { GLOSSARY, type GlossaryEntry } from "./entries";

export interface TermHit {
  entry: GlossaryEntry;
  /** The words as written in the text. */
  text: string;
}

/** An ability word only before its dash ("Landfall — …", "Descend 4 — …"), never in the middle of a sentence. */
const ABILITY_WORD_END = "(?=(?:\\s*\\d+)?\\s*[—–-]\\s)";

/** Forms of an entry in a text of that language: French texts may be in English (no French printing). */
export function entryForms(entry: GlossaryEntry, lang: Lang): string | undefined {
  const own = lang === "fr" ? [entry.fr ?? entry.en, entry.en] : [entry.en];
  const forms = [...new Set(own.filter((f): f is string => !!f))];
  if (!forms.length) return undefined;
  const source = forms.map((f) => `(?:${f})`).join("|");
  return entry.kind === "abilityWord" ? `(?:${source})${ABILITY_WORD_END}` : source;
}

/** One expression per language, with a named group per entry, between word boundaries (letters of any alphabet). */
const compiled = new Map<Lang, { re: RegExp; entries: GlossaryEntry[] }>();

function matcher(lang: Lang) {
  let m = compiled.get(lang);
  if (!m) {
    const entries = GLOSSARY.filter((e) => entryForms(e, lang));
    const groups = entries.map((e, i) => `(?<g${i}>${entryForms(e, lang)})`).join("|");
    m = { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${groups})(?![\\p{L}\\p{N}])`, "giu"), entries };
    compiled.set(lang, m);
  }
  return m;
}

/** The text cut into plain pieces and glossary terms, in order. */
export function splitTerms(text: string, lang: Lang): (string | TermHit)[] {
  const { re, entries } = matcher(lang);
  const out: (string | TermHit)[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)?.[0];
    const entry = i ? entries[Number(i.slice(1))] : undefined;
    if (!entry || m.index === undefined) continue;
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push({ entry, text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** The glossary entries found in a text, each once, in order of appearance. */
export function termsIn(text: string, lang: Lang): GlossaryEntry[] {
  const seen = new Set<GlossaryEntry>();
  for (const part of splitTerms(text, lang)) if (typeof part !== "string") seen.add(part.entry);
  return [...seen];
}
