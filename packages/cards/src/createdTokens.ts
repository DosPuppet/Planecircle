/**
 * The tokens the card scripts create: every `TokenSpec` reachable from a card definition (effects, abilities, faces).
 * Used by the token import (`tools/import-tokens.ts`: Scryfall images for the names the Standard token sets lack) and
 * by the token image test (every token shows an image).
 */
import type { CardDef, TokenSpec } from "@mtgx/engine";

/** A token spec found in the scripts, and the cards that create it. */
export interface CreatedToken {
  spec: TokenSpec;
  cards: string[];
}

/** A `TokenSpec`: a name, colors, types and subtypes, and none of a card's own fields. */
const isTokenSpec = (x: Record<string, unknown>): x is TokenSpec & Record<string, unknown> =>
  typeof x.name === "string" &&
  Array.isArray(x.colors) &&
  Array.isArray(x.types) &&
  Array.isArray(x.subtypes) &&
  !("typeLine" in x) &&
  !("manaCost" in x);

/** Same profile as the engine's token definition (`tokenDefId`): name, P/T, colors, types. */
const profile = (t: TokenSpec) => `${t.name}|${t.power ?? ""}/${t.toughness ?? ""}|${t.colors.join("")}|${t.types.join(" ")}`;

/** Engine type line of a token (`createTokens`, engine/src/actions.ts). */
export const tokenTypeLine = (t: TokenSpec) => `Token ${t.types.join(" ")} — ${t.subtypes.join(" ")}`;

export function createdTokens(cards: Record<string, CardDef>): CreatedToken[] {
  const found = new Map<string, CreatedToken>();
  const seen = new WeakSet<object>();
  const walk = (x: unknown, card: string) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    // A shared spec (Treasure) counts for every card that creates it, but is only walked once.
    if (isTokenSpec(o)) {
      const key = profile(o);
      const e = found.get(key) ?? { spec: o, cards: [] };
      if (!e.cards.includes(card)) e.cards.push(card);
      found.set(key, e);
    }
    if (seen.has(o)) return;
    seen.add(o);
    for (const v of Object.values(o)) walk(v, card);
  };
  for (const [name, def] of Object.entries(cards)) walk(def, name);
  return [...found.values()];
}
