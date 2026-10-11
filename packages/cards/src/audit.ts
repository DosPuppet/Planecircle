/**
 * Oracle ↔ script audit (P1 of the 2026-09-29 audit): a card is "handled" as soon as a script exists. This audit
 * compares the Oracle text with the script to spot what is probably missing:
 *
 * - abilities: the text is split into paragraphs (keyword lines, triggered, activated, static, chapters); the script
 *   must have at least as many triggered and activated abilities as the text describes;
 * - numbers: the effect numbers of the text (damage, draw, life, +N/+N, tokens, counters, scry…) must appear in the
 *   script.
 *
 * It is a heuristic: a discrepancy is a clue to check, not a proof. The known and checked discrepancies are listed in
 * `data/audit-baseline.json`; the test `audit.test.ts` fails if a card adds a new one.
 */
import type { AbilityDef, CardDef } from "@mtgx/engine";

export type ParagraphKind = "keywords" | "triggered" | "activated" | "static" | "chapter" | "spell" | "mode";

export interface Paragraph {
  kind: ParagraphKind;
  text: string;
}

export interface AuditIssue {
  card: string;
  /**
   * "triggered", "activated": the text describes more of them than the script; "static": the text describes more
   * static abilities than the script carries (abilities, fields of the definition, keywords not printed, extra
   * triggered or activated abilities that implement them); "number": an effect number missing from the script;
   * "target": an instant or sorcery whose script does not have as many targets as "target" words in the text (one
   * target too many: a choice made on resolution, or "each", is targeted; one fewer: a forgotten target).
   */
  kind: "triggered" | "activated" | "static" | "number" | "target";
  detail: string;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fifteen: 15,
  twenty: 20,
};

/** Keywords (and keywords with a cost) that can form a keyword line. */
const KEYWORD_LINE =
  /^(?:(?:flying|first strike|double strike|deathtouch|defender|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|flash|prowess|changeling|convoke|delve|affinity for [a-z]+|fear|intimidate|shroud|skulk|landwalk|[a-z]+walk|protection from [^,.]+|ward(?: \{[^}]+\}|—[^.]+\.?)|equip(?: [^{]*)?\{[^}]*\}(?:\{[^}]*\})*|crew \d+|saddle \d+|station \d*|cycling \{[^}]*\}(?:\{[^}]*\})*|[a-z]+cycling \{[^}]*\}(?:\{[^}]*\})*|kicker \{[^}]*\}(?:\{[^}]*\})*|flashback \{[^}]*\}(?:\{[^}]*\})*|disguise \{[^}]*\}(?:\{[^}]*\})*|warp \{[^}]*\}(?:\{[^}]*\})*|plot \{[^}]*\}(?:\{[^}]*\})*|offspring \{[^}]*\}(?:\{[^}]*\})*|impending \d+—\{[^}]*\}(?:\{[^}]*\})*|craft with [^.]+|max speed|start your engines!|exhaust|mobilize \d+|surveil \d+|ninjutsu \{[^}]*\}(?:\{[^}]*\})*|evoke \{[^}]*\}(?:\{[^}]*\})*|bestow \{[^}]*\}(?:\{[^}]*\})*|mutate \{[^}]*\}(?:\{[^}]*\})*|enchant [^.]+|devour \d+|job select|toxic \d+|infect|wither|annihilator \d+|rebound|cascade|storm|split second|unearth \{[^}]*\}(?:\{[^}]*\})*|embalm \{[^}]*\}(?:\{[^}]*\})*|escape—[^.]+\.?|harmonize \{[^}]*\}(?:\{[^}]*\})*|echo \{[^}]*\}(?:\{[^}]*\})*|dash \{[^}]*\}(?:\{[^}]*\})*|evolve|exploit|riot|undying|persist|training|bargain|backup \d+|forage|gift [^.]+|spree|tiered|hideaway \d+|living weapon|buyback \{[^}]*\}(?:\{[^}]*\})*|mentor|melee|afflict \d+|renew|freerunning \{[^}]*\}(?:\{[^}]*\})*|the ring tempts you|basic landcycling \{[^}]*\}(?:\{[^}]*\})*|increment|mobilize x[^.]*|extort|battle cry|improvise|firebending (?:\d+|x(?:, where x is [^.]+)?))(?:,\s*|\s*$))+$/i;

/** Removes the reminder text (in parentheses) and the ability words ("Landfall — ", "Void — "). */
export function stripReminder(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^(?:[^—.:"{}•]{1,40}) — /u, "")
    .trim();
}

/** Splits an Oracle text into classified paragraphs. */
export function paragraphs(text: string, isSpell: boolean): Paragraph[] {
  const out: Paragraph[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // Saga chapters ("I, II — …"), Class levels and thresholds: counted apart.
    if (/^(?:[IVX]+(?:, [IVX]+)*) —/.test(line) || /^Level \d/.test(line) || /^\d+\+ \|/.test(line)) {
      out.push({ kind: "chapter", text: line });
      continue;
    }
    // Mode of a modal ability or spell ("• …"): part of the previous paragraph.
    if (line.startsWith("•")) {
      out.push({ kind: "mode", text: stripReminder(line.slice(1).trim()) });
      continue;
    }
    const t = stripReminder(line);
    if (!t) continue;
    if (KEYWORD_LINE.test(t.replace(/\.$/, ""))) {
      out.push({ kind: "keywords", text: t });
      continue;
    }
    // An instant or sorcery does not describe a triggered ability ("When you next cast…" is created by the spell).
    if (!isSpell && /^(?:When|Whenever|At the beginning|At end of|At the end)\b/.test(t)) {
      out.push({ kind: "triggered", text: t });
      continue;
    }
    // Activated ability: a cost before the colon (mana, {T}, loyalty, "Sacrifice…", "Exhaust — "…).
    const colon = t.indexOf(":");
    const cost = colon > 0 ? t.slice(0, colon) : "";
    if (
      !isSpell &&
      colon > 0 &&
      !cost.includes(".") &&
      // Quoted ability ("Enchanted land has "{T}: …""): granted to another object, it is not the card's own.
      !cost.includes('"') &&
      (/^[+−-]?(?:\d+|X):?$/.test(cost.trim()) ||
        /\{[^}]+\}/.test(cost) ||
        /^(?:Sacrifice|Tap|Untap|Remove|Discard|Exile|Pay|Return|Put|Collect|Forage|Reveal|Mill)\b/.test(cost))
    ) {
      out.push({ kind: "activated", text: t });
      continue;
    }
    out.push({ kind: isSpell ? "spell" : "static", text: t });
  }
  return out;
}

/** Abilities of a definition, all sources included (station thresholds, Class levels, solved Case). */
function allAbilities(d: CardDef): AbilityDef[] {
  return [
    ...d.abilities,
    ...(d.station?.thresholds.flatMap((t) => t.abilities) ?? []),
    ...(d.classLevels?.flatMap((l) => l.abilities) ?? []),
    ...(d.caseSolved ?? []),
  ];
}

function countKind(d: CardDef, kind: "triggered" | "activated"): number {
  return allAbilities(d).filter((a) =>
    kind === "triggered" ? a.kind === "triggered" : a.kind === "activated" || a.kind === "mana",
  ).length;
}

/** Fields of a definition that do not describe an ability (identity, text, image, faces, legality…). */
const IDENTITY_FIELDS = new Set([
  "id",
  "name",
  "typeLine",
  "manaCost",
  "manaCostText",
  "colors",
  "supertypes",
  "types",
  "subtypes",
  "power",
  "toughness",
  "keywords",
  "abilities",
  "spell",
  "text",
  "fr",
  "image",
  "artCrop",
  "layout",
  "faceDefs",
  "implemented",
  "set",
  "number",
  "rarity",
  "legalities",
  "isToken",
  "prepareFace",
]);

/** Qualifiers of a cast option that carry a sentence of their own (flashback's extra costs, morph…). */
const CAST_OPTION_EXTRAS = ["extra", "harmonize", "via", "impending", "morph", "reducedBy"] as const;

/**
 * Ability fields (costs, permissions, entering…) filled in a definition. The groups of PLAN-M M5 count by member, as
 * when their members were fields of their own: the card rules, the kicker, the P/T defined by an ability, each cast
 * option and its qualifiers.
 */
function abilityFields(d: CardDef): number {
  let n = 0;
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || IDENTITY_FIELDS.has(k)) continue;
    if (k === "rules" || k === "kicker" || k === "cda") n += Object.values(v as object).filter((x) => x !== undefined).length;
    else if (k === "castOptions")
      for (const o of d.castOptions ?? [])
        n += 1 + CAST_OPTION_EXTRAS.filter((q) => (o as Record<string, unknown>)[q] !== undefined).length;
    else n += 1;
  }
  return n;
}

/**
 * Statics carried by an ability: a static or player ability often implements several sentences of the text ("have
 * menace and +1/+0", "an additional land, from the graveyard"); its distinct effects are counted.
 */
function staticWeight(a: AbilityDef): number {
  if (a.kind === "triggered" || a.kind === "activated" || a.kind === "mana") return 0;
  if (a.kind === "static") return Math.max(1, Object.keys(a.mods).length);
  if (a.kind === "playerStatic")
    return Math.max(1, Object.keys(a).filter((k) => k !== "kind" && k !== "label" && k !== "condition").length);
  return 1;
}

/** Statics without a game effect to check (deck construction rule). */
const NO_SCRIPT_STATIC = /^A deck can have any number of cards named/;

/** Effect numbers cited by a paragraph ("deals 3 damage", "draw two cards", "+2/+2"…). */
export function effectNumbers(text: string): number[] {
  const out: number[] = [];
  const num = (w: string) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w.toLowerCase()]);
  const patterns: RegExp[] = [
    /deals? (\d+) damage/gi,
    /(?:draws?|drew) (\w+) cards?/gi,
    /(?:gains?|loses?) (\d+) life/gi,
    /(?:put|puts|with) (\w+) [+\-−]?\d*\/?[+\-−]?\d* ?(?:[a-z]+ )?counters?/gi,
    /create (\w+) /gi,
    /(?:scry|surveil|mill) (\d+)/gi,
    /look at the top (\w+) cards?/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = num(m[1] ?? "");
      if (n !== undefined && n > 1) out.push(n);
    }
  }
  // P/T modifications: "+2/+2", "-3/-0".
  // A "+1/+1" followed by "counter" is the name of the counter, not a modification.
  for (const m of text.matchAll(/([+\-−])(\d+)\/([+\-−])(\d+)(?! counters?)/g)) {
    const p = Number(m[2]);
    const t = Number(m[4]);
    if (p > 0) out.push(p);
    if (t > 0) out.push(t);
  }
  return out;
}

/** Every number present in the script (numeric values of the JSON, negative ones included as absolute values). */
function scriptNumbers(d: CardDef): Set<number> {
  const out = new Set<number>();
  const visit = (v: unknown) => {
    if (typeof v === "number") out.add(Math.abs(v));
    else if (typeof v === "string") {
      // Costs and mana as text ("{2}{R}"): the numbers count too.
      for (const m of v.matchAll(/\d+/g)) out.add(Number(m[0]));
    } else if (Array.isArray(v)) {
      for (const x of v) visit(x);
      // Mana as a list ("addMana: ["R", "R", "R"]") or sum of identical terms ("X + X + X"): the length is the
      // multiplier.
      if (v.length > 1 && v.every((x) => JSON.stringify(x) === JSON.stringify(v[0]))) out.add(v.length);
    } else if (v && typeof v === "object") for (const x of Object.values(v)) visit(x);
  };
  const {
    text: _t,
    fr: _f,
    image: _i,
    artCrop: _a,
    legalities: _l,
    number: _n,
    ...script
  } = d as CardDef & {
    artCrop?: unknown;
  };
  visit(script);
  return out;
}

/** Audits a definition (and its faces). Only handled cards make sense. */
export function auditCard(d: CardDef): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const faces: CardDef[] = d.faceDefs?.length ? d.faceDefs : [d];
  for (const f of faces) {
    const isSpell = f.types.includes("Instant") || f.types.includes("Sorcery");
    const paras = paragraphs(f.text ?? "", isSpell);
    let surplus = 0;
    for (const kind of ["triggered", "activated"] as const) {
      const expected = paras.filter((p) => p.kind === kind).length;
      // The two faces sometimes share the abilities (back face): those of the whole card are counted too.
      const have = Math.max(countKind(f, kind), faces.length > 1 ? 0 : countKind(d, kind));
      if (have < expected)
        issues.push({ card: d.name, kind, detail: `${f.name}: ${expected} in the text, ${have} in the script` });
      surplus += Math.max(0, have - expected);
    }
    // Statics of a permanent: each must be carried by something in the script. An instant or sorcery describes its
    // effect in "spell" paragraphs, counted elsewhere (numbers).
    if (!isSpell) {
      const statics = paras.filter((p) => p.kind === "static" && !NO_SCRIPT_STATIC.test(p.text)).length;
      const printed = paras.filter((p) => p.kind === "keywords").reduce((n, p) => n + p.text.split(",").length, 0);
      const own = (x: CardDef) =>
        allAbilities(x).reduce((n, a) => n + staticWeight(a), 0) + abilityFields(x) + Math.max(0, x.keywords.length - printed);
      const have = own(f) + (f !== d ? own(d) : 0) + surplus;
      if (have < statics)
        issues.push({ card: d.name, kind: "static", detail: `${f.name}: ${statics} in the text, ${have} in the script` });
    }
    const nums = scriptNumbers(f);
    if (f !== d) for (const n of scriptNumbers(d)) nums.add(n);
    const missing = [...new Set(paras.flatMap((p) => effectNumbers(p.text)))].filter((n) => !nums.has(n));
    if (missing.length) issues.push({ card: d.name, kind: "number", detail: `${f.name}: ${missing.join(", ")} missing` });
  }
  issues.push(...auditTargets(d));
  return issues;
}

/**
 * "target" words of a spell: outside abilities quoted in quotation marks (tokens) and reminder text, outside "change
 * the target of … with a single target" (the target of another spell is not one of this spell); earthbending counts
 * as a target.
 */
export function targetWords(text: string): number {
  const t = text
    .replace(/"[^"]*"/g, "")
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\bthe targets? of\b|\bwith a single target\b/gi, "");
  // Earthbend N: "target land you control" (reminder text).
  const earthbend = (t.match(/\bearthbend (?:\d+|X)\b/gi) ?? []).length;
  return (t.match(/\btarget\b/gi) ?? []).length + earthbend;
}

/** "up to N target", "any number of target", "one or two target" words of a spell (optional targets). */
export function upToWords(text: string): number {
  const t = text.replace(/"[^"]*"/g, "").replace(/\(([^)]*)\)/g, "");
  return (
    t.match(
      /\b(?:up to (?:one|two|three|four|five|six|seven|X|\d+)|any number of|one or two|one, two, or three) (?:other |another )?target\b/gi,
    ) ?? []
  ).length;
}

/** Targets of the script of a single-mode spell: those of the spell, plus those of its reflexive and delayed abilities. */
function scriptTargets(d: CardDef): number {
  const mode = d.spell?.modes[0];
  if (!mode) return 0;
  let nested = 0;
  const visit = (x: unknown, inToken: boolean): void => {
    if (Array.isArray(x)) for (const y of x) visit(y, inToken);
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      // Abilities of a created token: its own, not the spell's.
      const token = inToken || o.op === "createTokens" || o.op === "createTokenCopy";
      if (!token && Array.isArray(o.targets) && (o.op === "reflexive" || o.op === "delayed")) nested += o.targets.length;
      for (const v of Object.values(o)) visit(v, token);
    }
  };
  visit(mode.effects, false);
  return mode.targets.length + nested;
}

/** Audit of the targets of a single-mode instant or sorcery (without faces). */
export function auditTargets(d: CardDef): AuditIssue[] {
  if (d.faceDefs?.length || !d.spell || d.spell.modes.length !== 1) return [];
  if (!d.types.includes("Instant") && !d.types.includes("Sorcery")) return [];
  const words = targetWords(d.text ?? "");
  const have = scriptTargets(d);
  if (words !== have) return [{ card: d.name, kind: "target", detail: `${words} "target" in the text, ${have} in the script` }];
  // "up to N targets": as many optional targets in the script (spell without reflexive or delayed ability).
  const specs = d.spell.modes[0]?.targets ?? [];
  const upTo = upToWords(d.text ?? "");
  // Variable number of targets: optional, or between a minimum and a maximum ("one or two").
  const optional = specs.filter((t) => t.optional || (t.minCount !== undefined && t.minCount < (t.count ?? 1))).length;
  // Target conditioned by a cost (promised gift, bargain): optional in the script, without "up to".
  const conditional = /\bif the gift was promised\b|\bif this spell was (?:bargained|kicked)\b/i.test(d.text ?? "");
  if (have === specs.length && !conditional && upTo !== optional)
    return [
      {
        card: d.name,
        kind: "target",
        detail: `${upTo} variable number(s) of targets in the text, ${optional} in the script`,
      },
    ];
  return [];
}

/** Stable key of a discrepancy (for the list of known discrepancies). */
export const issueKey = (i: AuditIssue) => `${i.card} | ${i.kind} | ${i.detail}`;
