/**
 * A deck shared by a link and its QR code: `https://…/#deck=1.<data>`. The data is the decklist (MTGA format; set and
 * collector number only for a printing the player chose, to keep the code small) compressed with deflate and written in
 * base64url. A phone camera opens the link; Planecircle then offers to import the deck (`ImportModal`). The fragment
 * (#) never reaches the server.
 */
import { CARDS, type DeckEntry, type DeckList, exportName } from "@mtgx/cards";
import { keyedPrinting } from "@mtgx/engine";

const PREFIX = "#deck=";
/** Version of the format, for a later change of encoding. */
const VERSION = "1";

/** The decklist carried by the link: name, commander, deck, sideboard. */
export function shareText(deck: Pick<DeckList, "name" | "commander" | "main" | "sideboard">): string {
  const line = ([n, name, key]: DeckEntry) => {
    const c = CARDS[name];
    const p = key ? (c?.printings?.find((x) => x.key === key) ?? keyedPrinting(key)) : undefined;
    return `${n} ${exportName(c, name)}${p ? ` (${p.set}) ${p.number}` : ""}`;
  };
  const parts = [
    ...(deck.name ? ["About", `Name ${deck.name}`, ""] : []),
    ...(deck.commander?.length ? ["Commander", ...deck.commander.map(line), ""] : []),
    "Deck",
    ...deck.main.map(line),
    ...(deck.sideboard?.length ? ["", "Sideboard", ...deck.sideboard.map(line)] : []),
  ];
  return `${parts.join("\n")}\n`;
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));

/** Link that carries the deck, on this site (`origin`). */
export async function deckLink(deck: Parameters<typeof shareText>[0], origin: string = location.origin): Promise<string> {
  const packed = await through(new TextEncoder().encode(shareText(deck)), new CompressionStream("deflate-raw"));
  return `${origin}/${PREFIX}${VERSION}.${toBase64Url(packed)}`;
}

/** The deck data of a link or of its fragment (`#deck=…`), or null. */
export function sharedDeckData(urlOrHash: string): string | null {
  const i = urlOrHash.indexOf(PREFIX);
  return i < 0 ? null : urlOrHash.slice(i + PREFIX.length) || null;
}

/** The decklist (text, to import) of a link's data; null if it is not a deck link of a known version or is damaged. */
export async function decodeDeck(data: string): Promise<string | null> {
  const [version, payload] = data.split(".", 2);
  if (version !== VERSION || !payload) return null;
  try {
    return new TextDecoder().decode(await through(fromBase64Url(payload), new DecompressionStream("deflate-raw")));
  } catch {
    return null;
  }
}
