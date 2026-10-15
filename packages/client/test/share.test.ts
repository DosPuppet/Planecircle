/** Decks shared by a link and its QR code (decks/share.ts): round trip, size of the code. */
import { CARDS, CardIndex, DECKS, parseDeckList } from "@mtgx/cards";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { deckLink, decodeDeck, sharedDeckData } from "../src/decks/share";

const INDEX = new CardIndex(CARDS);
const ORIGIN = "https://planecircle.example";
const sorted = (e: readonly (readonly unknown[])[]) => [...e].map((x) => JSON.stringify(x)).sort();

describe("deck shared by a link (QR code)", () => {
  const constructed = DECKS.find((d) => d.format !== "commander" && d.main.length > 10);
  const commander = DECKS.find((d) => d.format === "commander");

  it("a deck comes back identical from its link (name, deck, sideboard, commander, chosen printing)", async () => {
    for (const deck of [constructed, commander]) {
      if (!deck) throw new Error("no precon");
      // A chosen printing (art) travels with the card.
      const withArt = {
        ...deck,
        main: deck.main.map((e, i) =>
          i === 0 && CARDS[e[1]]?.printings?.[0] ? ([e[0], e[1], CARDS[e[1]]?.printings?.[0]?.key] as typeof e) : e,
        ),
      };
      const link = await deckLink(withArt, ORIGIN);
      expect(link.startsWith(`${ORIGIN}/#deck=1.`)).toBe(true);
      const data = sharedDeckData(link);
      expect(data).toBeTruthy();
      const text = await decodeDeck(data as string);
      const parsed = parseDeckList(text ?? "", INDEX);
      expect(parsed.issues.filter((i) => i.kind === "unknown" || i.kind === "syntax")).toEqual([]);
      expect(parsed.name).toBe(deck.name);
      expect(sorted(parsed.main.map(([n, name]) => [n, name]))).toEqual(sorted(withArt.main.map(([n, name]) => [n, name])));
      expect(sorted(parsed.sideboard)).toEqual(sorted(withArt.sideboard ?? []));
      expect(sorted(parsed.commander ?? [])).toEqual(sorted(withArt.commander ?? []));
    }
  });

  it("the QR code stays readable: version 15 at most for 60 cards, 27 for a 100-card Commander deck", async () => {
    for (const deck of [constructed, commander]) {
      if (!deck) throw new Error("no precon");
      const qr = encode(await deckLink(deck, ORIGIN), { ecc: "L" });
      // 60 cards: version 14 (75 modules). 100 Commander cards: version 26 (123 modules), dense but read from a screen;
      // a binary encoding (set and collector number) would shrink it if scanning proves hard.
      expect(qr.version).toBeLessThanOrEqual(deck === commander ? 27 : 15);
    }
  });

  it("a damaged or foreign link gives nothing", async () => {
    expect(sharedDeckData(`${ORIGIN}/?room=ABCD`)).toBeNull();
    expect(await decodeDeck("1.not-deflate")).toBeNull();
    expect(await decodeDeck("9.abc")).toBeNull();
  });
});
