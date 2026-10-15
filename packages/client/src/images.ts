/**
 * Card images: straight from Scryfall, or relayed by the Planecircle server (/scry/) when the player's network blocks
 * cards.scryfall.io (company or school proxy…).
 *
 * - `auto` (default): direct, and switches to the relay if a Scryfall image does not load;
 * - `on` / `off`: the player's choice (checkbox "Images through the Planecircle server"), remembered.
 *
 * Every image URL displayed goes through `imageUrl`.
 *
 * Custom art (`tools/custom-art.ts`): local images served on /art/ (outside Git). They replace Scryfall's only for the
 * cards of a deck that chooses the custom printing (`CUSTOM_PRINTING`: the whole The Vision and Mario & Luigi precons,
 * or any card chosen in the deck builder), the tokens and the card back of a player whose deck uses some, and when the
 * "Custom art" checkbox is ticked (default; remembered). Without /art/manifest.json on the server, the checkbox does
 * not appear. Art sets (one per proxy deck, "custom:<set>"): only the images of that set (tokens and card back included).
 */
import { create } from "zustand";

export type ImageMode = "auto" | "on" | "off";

const SCRYFALL = "https://cards.scryfall.io/";
const RELAY = "/scry/";
const KEY = "mtgx.images";
/** Small known image for the detection (FDN Forest, "small" format). */
const PROBE = "small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg";
const PROBE_TIMEOUT_MS = 4000;
const ART = "/art/";
const ART_KEY = "planecircle.customArt";

/** The images of one art set (or the shared ones): English name of the card (or of the face) → prepared file. */
export interface ArtSet {
  cards: Record<string, string>;
  tokens: Record<string, string>;
  back?: string;
}
/** /art/manifest.json: the shared images (the first folder wins on a name) and those of each art set (version 2). */
export interface ArtManifest extends ArtSet {
  version: 1 | 2;
  sets?: Record<string, ArtSet>;
}

/**
 * The list to look in: the art set's (`set`: "mario"), alone (a deck doesn't borrow another deck's images: without an
 * image in its set, the card keeps Scryfall's); the shared one for the plain custom printing (`true` or "") or a set
 * the server doesn't have.
 */
function lists(custom: ArtManifest, set?: string | true): ArtSet[] {
  const own = typeof set === "string" && set ? custom.sets?.[set] : undefined;
  return own ? [own] : [custom];
}
const cardFile = (x: ArtSet, name: string) => x.cards[name] ?? x.cards[name.split(" // ")[0] ?? ""];

function load(): ImageMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

function loadCustomOn(): boolean {
  try {
    return localStorage.getItem(ART_KEY) !== "off";
  } catch {
    return true;
  }
}

interface ImageStore {
  mode: ImageMode;
  /** `auto` mode: Scryfall does not answer, the relay is used. */
  blocked: boolean;
  setMode(mode: ImageMode): void;
  /** The server's custom art (null: none). */
  custom: ArtManifest | null;
  customOn: boolean;
  setCustomOn(on: boolean): void;
}

export const useImages = create<ImageStore>((set) => ({
  mode: load(),
  blocked: false,
  setMode(mode) {
    try {
      if (mode === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      // Storage unavailable (private browsing): the choice holds for this visit.
    }
    set({ mode });
  },
  custom: null,
  customOn: loadCustomOn(),
  setCustomOn(customOn) {
    try {
      if (customOn) localStorage.removeItem(ART_KEY);
      else localStorage.setItem(ART_KEY, "off");
    } catch {
      // Storage unavailable: the choice holds for this visit.
    }
    set({ customOn });
  },
}));

/** Is the relay in use right now? */
export const relayActive = (s: Pick<ImageStore, "mode" | "blocked"> = useImages.getState()): boolean =>
  s.mode === "on" || (s.mode === "auto" && s.blocked);

/** URL to display for a Scryfall image (relayed if needed). */
export function imageUrl(url: string): string;
export function imageUrl(url: string | undefined): string | undefined;
export function imageUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith(SCRYFALL) || !relayActive()) return url;
  return RELAY + url.slice(SCRYFALL.length);
}

/**
 * Art crop of a Scryfall card image (battlefield art cards, PLAN-V): same image id, `art_crop` instead of `normal`.
 * Any other image (custom art): undefined.
 */
export function artCropOf(url: string | undefined): string | undefined {
  return url?.startsWith(`${SCRYFALL}normal/`) ? `${SCRYFALL}art_crop/${url.slice(SCRYFALL.length + 7)}` : undefined;
}

/**
 * Custom art of a card (by its English name, or that of its first face) or of a token; `set`: the art set to look in
 * first (`CardFace.customArt`).
 */
export function customImage(name: string, token = false, set?: string | true): string | undefined {
  const { custom, customOn } = useImages.getState();
  if (!custom || !customOn) return undefined;
  for (const x of lists(custom, set)) {
    const file = token ? x.tokens[name] : cardFile(x, name);
    if (file) return ART + file;
  }
  return undefined;
}

/** Does the server have custom art for this card (checkbox ticked or not), in this art set or in the shared ones? */
export function hasCustomArt(custom: ArtManifest | null, name: string, set?: string): boolean {
  return !!custom && lists(custom, set).some((x) => !!cardFile(x, name));
}

/** The art sets that have an image of this card (deck builder: one "Illustration" choice per set). */
export function customArtSets(custom: ArtManifest | null, name: string): string[] {
  return Object.entries(custom?.sets ?? {})
    .filter(([, x]) => !!cardFile(x, name))
    .map(([set]) => set);
}

/** Components: re-render when the relay turns on or off, or when the custom art changes. */
export const useRelayActive = (): boolean => {
  useImages((s) => s.customOn && s.custom);
  return useImages(relayActive);
};

/** Loads /art/manifest.json if it exists (at start-up), and applies the custom card back. */
export async function loadCustomArt(): Promise<void> {
  try {
    const res = await fetch(`${ART}manifest.json`, { cache: "no-cache" });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return;
    const custom = (await res.json()) as ArtManifest;
    if ((custom?.version !== 1 && custom?.version !== 2) || typeof custom.cards !== "object") return;
    useImages.setState({ custom: { ...custom, tokens: custom.tokens ?? {} } });
  } catch {
    // No custom art (or offline).
  }
}

/** Custom card back (if there is one and the checkbox is ticked): for a player whose deck uses some, of their art set. */
export function useCustomBack(set?: string | true): string | undefined {
  return useImages((s) => {
    if (!s.customOn || !s.custom) return undefined;
    const back = lists(s.custom, set).find((x) => x.back)?.back;
    return back ? ART + back : undefined;
  });
}

function loads(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = src;
  });
}

let checking: Promise<void> | null = null;
/**
 * `auto` mode: can Scryfall be reached? Otherwise, the relay is used, provided it answers
 * (offline, no point switching). Called at start-up, and when a direct image fails.
 */
export function detectBlockedScryfall(): Promise<void> {
  if (useImages.getState().mode !== "auto" || useImages.getState().blocked) return Promise.resolve();
  checking ??= (async () => {
    if (await loads(`${SCRYFALL}${PROBE}?probe=${Date.now()}`)) return;
    if (await loads(`${RELAY}${PROBE}`)) useImages.setState({ blocked: true });
  })().finally(() => {
    checking = null;
  });
  return checking;
}
