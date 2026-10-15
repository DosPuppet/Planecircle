/**
 * Imports the tokens of the Standard sets from Scryfall (token sets "t<code>") and writes
 * packages/cards/data/tokens.json: name, type line, P/T, colors, text and image URL.
 * The client uses it to show a token with its image (`tokenImage`, packages/cards/src/tokenImages.ts).
 * Then, for each token a card script creates whose name these sets lack (Commander decks, reprints), the tokens of that
 * exact name from any set (newest first), or else a card of that name (Kobolds of Kher Keep): one per profile.
 *
 * Usage: npm run import-tokens
 * The images are not downloaded: only their URLs are kept (Scryfall CDN).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createdTokens } from "../packages/cards/src/createdTokens";
import { CARDS } from "../packages/cards/src/index";
import { SET_INFO } from "../packages/cards/src/setRegistry";

/** Sets whose tokens are taken (the newest first: their image is preferred for the same name). */
const SETS = [
  "lci",
  "dsk",
  "blb",
  "fin",
  "otj",
  "big",
  "dft",
  "eoe",
  "fdn",
  "tdm",
  "woe",
  "mkm",
  "tla",
  "spm",
  "hob",
  "ecl",
  "sos",
  "msh",
  "tmt",
];
// Every set of the registry (`cards/src/setRegistry.ts`) except FRA (no tokens on Scryfall), the reprints and the
// Commander pseudo-set: a set added to the registry must take its place in this order of preference.
const missing = SET_INFO.filter((x) => !x.reprint && !x.byName)
  .map((x) => x.code.toLowerCase())
  .filter((c) => c !== "fra" && !SETS.includes(c));
if (missing.length) throw new Error(`Registry sets missing from the token list: ${missing.join(", ")}`);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "cards", "data", "tokens.json");
const HEADERS = { "User-Agent": "MTGX/0.1 (non-commercial project)", Accept: "application/json" };

interface ScryfallToken {
  name: string;
  type_line: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  oracle_text?: string;
  set: string;
  image_uris?: { normal: string };
  card_faces?: {
    name: string;
    type_line: string;
    power?: string;
    toughness?: string;
    colors?: string[];
    oracle_text?: string;
    image_uris?: { normal: string };
  }[];
}

export interface TokenArt {
  name: string;
  typeLine: string;
  power?: number;
  toughness?: number;
  colors: string[];
  text: string;
  image: string;
  set: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string, extra = "&unique=prints"): Promise<ScryfallToken[]> {
  const out: ScryfallToken[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}${extra}`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    await sleep(120); // politeness towards the API (10 requests per second at most), also after a 404
    if (res.status === 429) {
      await sleep(2000); // too many requests: wait, then the same page again
      continue;
    }
    if (res.status === 404) return out; // no tokens for this set, no card of that name
    if (!res.ok) throw new Error(`Scryfall ${res.status} for ${q}`);
    const page = (await res.json()) as { data: ScryfallToken[]; has_more: boolean; next_page?: string };
    out.push(...page.data);
    url = page.has_more ? (page.next_page ?? null) : null;
  }
  return out;
}

const num = (v?: string) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : undefined);

/**
 * The faces of a Scryfall result that are tokens (`anyCard`: or cards, for a token named after a card). A Role is named
 * as the engine names it ("Cursed" on Scryfall, "Cursed Role" in the scripts).
 */
function faces(t: ScryfallToken, anyCard = false): TokenArt[] {
  // Double-faced tokens (two tokens back to back): each face is a token.
  const fs = t.card_faces?.length ? t.card_faces : [t];
  const out: TokenArt[] = [];
  for (const f of fs) {
    const image = f.image_uris?.normal ?? t.image_uris?.normal;
    if (!image || (!anyCard && !f.type_line.includes("Token"))) continue;
    const role = /\bRole\b/.test(f.type_line.replace(/^[^—]*/, "")) && !/ Role$/.test(f.name);
    out.push({
      name: role ? `${f.name} Role` : f.name,
      typeLine: f.type_line,
      power: num(f.power),
      toughness: num(f.toughness),
      colors: f.colors ?? t.colors ?? [],
      text: f.oracle_text ?? "",
      image,
      set: t.set,
    });
  }
  return out;
}

const tokens: TokenArt[] = [];
for (const set of SETS) {
  const found = await search(`set:t${set}`);
  for (const t of found) tokens.push(...faces(t));
  console.log(`t${set}: ${found.length} token(s)`);
}

// Tokens of the scripts that no Standard token set has: by exact name, in any set.
const known = new Set(tokens.map((t) => t.name.toLowerCase()));
const wanted = [...new Set(createdTokens(CARDS).map((c) => c.spec.name))].filter((n) => !known.has(n.toLowerCase())).sort();
const profileOf = (t: TokenArt) => `${t.power}/${t.toughness}|${[...t.colors].sort().join("")}|${t.typeLine}`;
const none: string[] = [];
for (const name of wanted) {
  const exact = (t: TokenArt) => t.name.toLowerCase() === name.toLowerCase();
  // "Cursed Role": the Scryfall name has no "Role".
  const q = name.replace(/ Role$/, "");
  let found = (await search(`!"${q}" t:token`, "&unique=art&order=released&dir=desc")).flatMap((t) => faces(t)).filter(exact);
  if (!found.length)
    found = (await search(`!"${q}"`, "&unique=prints&order=released&dir=desc")).flatMap((t) => faces(t, true)).filter(exact);
  if (!found.length) none.push(name);
  // One image per profile (P/T, colors, type line): the newest.
  const profiles = new Set<string>();
  for (const t of found) {
    if (profiles.has(profileOf(t))) continue;
    profiles.add(profileOf(t));
    tokens.push(t);
  }
}
console.log(
  `${wanted.length} script token name(s) outside the Standard token sets; without any image: ${none.join(", ") || "none"}`,
);
writeFileSync(OUT, `${JSON.stringify(tokens, null, 1)}\n`);
console.log(`${tokens.length} token faces written to ${OUT}`);
