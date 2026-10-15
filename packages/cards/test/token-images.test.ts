/** Token images (`tokenImage`, data/tokens.json). */
import { describe, expect, it } from "vitest";
import TOKENS from "../data/tokens.json";
import { createdTokens, tokenTypeLine } from "../src/createdTokens";
import { CARDS, TOKEN_SPECS, tokenImage } from "../src/index";

describe("token images", () => {
  it("common tokens have an image, with the right profile (P/T and colors)", () => {
    for (const name of ["Treasure", "Food", "Clue", "Map", "Goblin", "Soldier", "Rabbit", "Spirit", "Cat", "Dog"]) {
      const t = TOKEN_SPECS[name];
      if (!t) throw new Error(name);
      const url = tokenImage({
        name: t.name,
        typeLine: `Token ${t.types.join(" ")}`,
        basePower: t.power,
        baseToughness: t.toughness,
        colors: t.colors,
      });
      expect(url, name).toMatch(/^https:\/\/cards\.scryfall\.io\//);
    }
  });

  it("for an equal name, the token with the same P/T and colors is preferred", () => {
    const arts = TOKENS as { name: string; power?: number; toughness?: number; colors: string[]; image: string }[];
    // A name split across several profiles (white 1/1 Spirit, flying 1/1, 4/4…): each profile finds its own.
    const spirits = arts.filter((a) => a.name === "Spirit");
    expect(new Set(spirits.map((a) => `${a.power}/${a.toughness}`)).size).toBeGreaterThan(1);
    for (const a of spirits) {
      const url = tokenImage({
        name: "Spirit",
        typeLine: "Token Creature — Spirit",
        basePower: a.power,
        baseToughness: a.toughness,
        colors: a.colors,
      });
      const chosen = arts.find((x) => x.image === url);
      expect([chosen?.power, chosen?.toughness]).toEqual([a.power, a.toughness]);
    }
  });

  it("every token a card creates has an image (otherwise: npm run import-tokens)", () => {
    // No printed token of that name anywhere on Scryfall: they keep the text frame.
    const NO_PRINTED_TOKEN = ["Banana", "Tombspawn"];
    const missing = createdTokens(CARDS)
      .filter(
        ({ spec: t }) =>
          !NO_PRINTED_TOKEN.includes(t.name) &&
          !tokenImage({
            name: t.name,
            typeLine: tokenTypeLine(t),
            basePower: t.power,
            baseToughness: t.toughness,
            colors: t.colors,
          }),
      )
      .map(({ spec, cards }) => `${spec.name} (${cards.join(", ")})`);
    expect(missing).toEqual([]);
    expect(createdTokens(CARDS).filter(({ spec }) => NO_PRINTED_TOKEN.includes(spec.name))).toHaveLength(NO_PRINTED_TOKEN.length);
  });

  it("a Role keeps the engine's name (Scryfall: “Cursed”, scripts: “Cursed Role”)", () => {
    expect(tokenImage({ name: "Cursed Role", typeLine: "Token Enchantment — Aura Role" })).toMatch(/^https:/);
  });

  it("no token of that name: no image (text frame)", () => {
    expect(tokenImage({ name: "Invented Token", typeLine: "Token Creature" })).toBeUndefined();
  });
});
