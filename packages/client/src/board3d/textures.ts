/**
 * Card faces of the 3D board (PLAN-W W3): an art card drawn on a canvas as the DOM board draws it (frame in the card's
 * color, art crop, name on a dark gradient), then a texture. The image comes through the same URLs as the DOM (`faceArt`,
 * `faceImage`: language, printing, relay); Scryfall sends `access-control-allow-origin: *`, so it can be a WebGL
 * texture. Until it arrives, and when it fails, the frame and the name show. Textures live in a byte-budgeted cache;
 * those on the table are pinned.
 */
import { type CardFace, HIDDEN_CARD_ID, type ObjectView } from "@mtgx/engine";
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { frameOf } from "../board/Card";
import { CARD_RATIO, PERM_RATIO } from "../board/layout";
import { faceArt, faceImage, faceName } from "../i18n";
import { detectBlockedScryfall } from "../images";
import type { Lang } from "../translate";
import { Lru } from "./lru";

/** Canvas of an art card: enough for a card about 200 px wide on the screen. */
const W = 320;
const H = Math.round(W * PERM_RATIO);
/** A whole card (the hand): its text must stay readable when it rises. */
const FULL_W = 488;
const FULL_H = Math.round(FULL_W * CARD_RATIO);
/** Frame colors of the art cards (`styles.css`, `.c-W`…). */
const FRAME: Record<string, string> = {
  W: "#e8dcc0",
  U: "#2f7fc4",
  B: "#5d5563",
  R: "#d0453a",
  G: "#2f8a4f",
  M: "#d4b45a",
  C: "#a9b0b8",
  L: "#9c8a66",
};
/** Width of the frame (the DOM's 2 px border on a card about 110 px wide). */
const BORDER = Math.round(W * 0.02);
/** Bytes of one texture on the GPU (RGBA and its mipmaps). */
const bytes = (w: number, h: number) => w * h * 4 * (4 / 3);

/** A face drawn as an art card (battlefield, piles) or as the whole card (hand). */
export type FaceKind = "art" | "full";

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draws an art card: the frame, the art (cropped to cover, or a whole card framed on its art box), the name. */
function paint(g: CanvasRenderingContext2D, frame: string, name: string, image?: { img: HTMLImageElement; full: boolean }) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = frame;
  roundRect(g, 0, 0, W, H, W * 0.06);
  g.fill();
  const iw = W - 2 * BORDER;
  const ih = H - 2 * BORDER;
  g.save();
  roundRect(g, BORDER, BORDER, iw, ih, W * 0.045);
  g.clip();
  g.fillStyle = "#111";
  g.fillRect(BORDER, BORDER, iw, ih);
  if (image) {
    const { img, full } = image;
    if (full) {
      // The whole card, framed on its art box (`.card img.full`: top −4 %, left −9.5 %, width 119 %).
      const w = iw * 1.19;
      g.drawImage(img, BORDER - iw * 0.095, BORDER - ih * 0.04, w, (w * img.naturalHeight) / img.naturalWidth);
    } else {
      const scale = Math.max(iw / img.naturalWidth, ih / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      g.drawImage(img, BORDER + (iw - w) / 2, BORDER + (ih - h) / 2, w, h);
    }
  }
  // The name on a dark gradient at the top (`.art-name`).
  const band = H * 0.2;
  const shade = g.createLinearGradient(0, BORDER, 0, BORDER + band);
  shade.addColorStop(0, "rgba(0,0,0,0.72)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shade;
  g.fillRect(BORDER, BORDER, iw, band);
  g.fillStyle = "#fff";
  g.shadowColor = "#000";
  g.shadowBlur = 3;
  g.font = `600 ${Math.round(W * 0.085)}px Inter, system-ui, sans-serif`;
  g.textBaseline = "top";
  let text = name;
  while (text.length > 1 && g.measureText(text).width > iw - W * 0.05) text = text.slice(0, -1);
  g.fillText(text === name ? name : `${text.trimEnd()}…`, BORDER + W * 0.025, BORDER + W * 0.02);
  g.restore();
}

/** Draws a whole card: the image as printed, or until it arrives the frame color and the name. */
function paintFull(g: CanvasRenderingContext2D, frame: string, name: string, img?: HTMLImageElement) {
  g.clearRect(0, 0, FULL_W, FULL_H);
  g.save();
  roundRect(g, 0, 0, FULL_W, FULL_H, FULL_W * 0.045);
  g.clip();
  if (img) g.drawImage(img, 0, 0, FULL_W, FULL_H);
  else {
    g.fillStyle = "#16130f";
    g.fillRect(0, 0, FULL_W, FULL_H);
    g.strokeStyle = frame;
    g.lineWidth = FULL_W * 0.04;
    roundRect(g, 0, 0, FULL_W, FULL_H, FULL_W * 0.045);
    g.stroke();
    g.fillStyle = "#fff";
    g.font = `600 ${Math.round(FULL_W * 0.06)}px Inter, system-ui, sans-serif`;
    g.textBaseline = "top";
    g.fillText(name, FULL_W * 0.07, FULL_W * 0.07, FULL_W * 0.86);
  }
  g.restore();
}

/** A card back (a face down card the viewer can't look at). */
function paintBack(g: CanvasRenderingContext2D) {
  const { width, height } = g.canvas;
  const edge = width * 0.02;
  const grad = g.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#3a2a1a");
  grad.addColorStop(1, "#1a120a");
  g.fillStyle = grad;
  roundRect(g, 0, 0, width, height, width * 0.06);
  g.fill();
  g.strokeStyle = "#8a6a3a";
  g.lineWidth = edge * 1.5;
  roundRect(g, edge * 2, edge * 2, width - edge * 4, height - edge * 4, width * 0.04);
  g.stroke();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${src}`));
    img.src = src;
  });
}

export class CardTextures {
  private cache: Lru<CanvasTexture>;

  /** `changed`: a texture got its image (draw again); `anisotropy`: the GPU's best for cards seen at an angle. */
  constructor(
    budget: number,
    private anisotropy: number,
    private changed: () => void,
  ) {
    this.cache = new Lru(budget, (t) => t.dispose());
  }

  /** The texture of a card's face; `pinned`: the keys of every card on the table (never evicted). */
  get(
    face: CardFace,
    obj: ObjectView | undefined,
    lang: Lang,
    pinned: ReadonlySet<string>,
    kind: FaceKind = "art",
  ): CanvasTexture {
    const key = textureKey(face, obj, lang, kind);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    canvas.width = kind === "full" ? FULL_W : W;
    canvas.height = kind === "full" ? FULL_H : H;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.anisotropy;
    texture.minFilter = LinearMipmapLinearFilter;
    if (face.defId === HIDDEN_CARD_ID) paintBack(g);
    else {
      const frame = FRAME[frameOf(obj)] ?? (FRAME.C as string);
      const name = faceName(face, lang);
      if (kind === "full") {
        paintFull(g, frame, name);
        void this.fillFull(g, texture, face, frame, name, lang);
      } else {
        paint(g, frame, name);
        void this.fill(g, texture, face, frame, name, lang);
      }
    }
    this.cache.set(key, texture, bytes(canvas.width, canvas.height), pinned);
    return texture;
  }

  /** Paints the whole card once its image arrives (else the frame and the name stay). */
  private async fillFull(g: CanvasRenderingContext2D, t: CanvasTexture, face: CardFace, frame: string, name: string, lang: Lang) {
    const src = faceImage(face, lang);
    if (!src) return;
    try {
      paintFull(g, frame, name, await loadImage(src));
      t.needsUpdate = true;
      this.changed();
    } catch {
      void detectBlockedScryfall();
    }
  }

  /** Paints the image once it arrives: the art crop, else the whole card, else the frame alone stays. */
  private async fill(g: CanvasRenderingContext2D, t: CanvasTexture, face: CardFace, frame: string, name: string, lang: Lang) {
    const crop = faceArt(face, lang);
    const tries = [crop, { src: faceImage(face, lang), full: true }].filter(
      (x, i, all): x is { src: string; full: boolean } => !!x?.src && all.findIndex((y) => y?.src === x.src) === i,
    );
    for (const { src, full } of tries) {
      try {
        const img = await loadImage(src);
        paint(g, frame, name, { img, full });
        t.needsUpdate = true;
        this.changed();
        return;
      } catch {
        // Scryfall blocked by the network? The server's relay takes over (auto mode), as for the DOM board.
        void detectBlockedScryfall();
      }
    }
  }

  dispose(): void {
    this.cache.clear();
  }
}

/** What tells two card faces apart on the table: image, frame color, name, and the way they are drawn. */
export function textureKey(face: CardFace, obj: ObjectView | undefined, lang: Lang, kind: FaceKind = "art"): string {
  if (face.defId === HIDDEN_CARD_ID) return `back|${kind}`;
  const src = kind === "full" ? faceImage(face, lang) : faceArt(face, lang)?.src;
  return `${kind}|${src ?? ""}|${frameOf(obj)}|${faceName(face, lang)}`;
}
