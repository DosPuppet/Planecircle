/**
 * The neon city's textures (PLAN-Y), drawn on canvases: the towers' windows, the screens' ads (invented brands, never a
 * real one), the neon signs' glowing words, the battlefields' dark mats with their faint grid.
 */
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from "three";

function canvas(w: number, h: number, read = false): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: read }) as CanvasRenderingContext2D];
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function texture(c: HTMLCanvasElement, color = true): CanvasTexture {
  const t = new CanvasTexture(c);
  if (color) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let cjk: boolean | null = null;

/**
 * Can this device draw katakana and kanji? A missing font draws them as its "missing glyph", as wide as a code point
 * no font has: then the signs fall back to Latin words.
 */
export function hasCjk(): boolean {
  if (cjk !== null) return cjk;
  const [, g] = canvas(8, 8);
  g.font = "32px sans-serif";
  cjk = Math.abs(g.measureText("ネ").width - g.measureText("\u{10FFFD}").width) > 0.5;
  return cjk;
}

/** The neon palette: magenta, cyan, violet, amber, acid green, hot pink. */
export const NEON = ["#ff2bd6", "#22e4ff", "#9b5cff", "#ffb020", "#7dff4a", "#ff4f7b"];

/** The facades' styles: each its own textures and material (a building picks one by its seed). */
export const FACADES = ["glass", "concrete", "flats", "works"] as const;
export type Facade = (typeof FACADES)[number];

/** A lit window's interior: a ceiling light's gradient, maybe a silhouette, curtains, or a television's blue. */
function interior(h: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, hh: number) {
  const k = r();
  const warm = k < 0.55;
  const base = warm ? [255, 196, 120] : k < 0.85 ? [205, 228, 255] : [120, 200, 255];
  const grad = h.createLinearGradient(0, y, 0, y + hh);
  const [cr, cg, cb] = base as [number, number, number];
  const bright = 0.45 + r() * 0.55;
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},${bright})`);
  grad.addColorStop(1, `rgba(${cr * 0.55},${cg * 0.5},${cb * 0.45},${bright * 0.7})`);
  h.fillStyle = grad;
  h.fillRect(x, y, w, hh);
  // A television's blue flicker frozen in a corner, or a lamp.
  if (r() < 0.18) {
    h.fillStyle = "rgba(90,160,255,0.8)";
    h.fillRect(x + w * (0.1 + r() * 0.5), y + hh * 0.45, w * 0.25, hh * 0.3);
  }
  // Someone at the window.
  if (r() < 0.12) {
    h.fillStyle = "rgba(10,8,12,0.85)";
    const px = x + w * (0.2 + r() * 0.5);
    h.beginPath();
    h.arc(px, y + hh * 0.42, hh * 0.1, 0, Math.PI * 2);
    h.fill();
    h.fillRect(px - hh * 0.12, y + hh * 0.52, hh * 0.24, hh * 0.48);
  }
  // Curtains half drawn, or blinds.
  const c = r();
  if (c < 0.3) {
    const tint = ["rgba(160,40,60,0.75)", "rgba(40,60,140,0.7)", "rgba(200,180,140,0.65)", "rgba(40,120,90,0.7)"][
      Math.floor(r() * 4)
    ] as string;
    h.fillStyle = tint;
    h.fillRect(x, y, w * (0.15 + r() * 0.3), hh);
    h.fillRect(x + w * (0.7 + r() * 0.2), y, w, hh);
  } else if (c < 0.5) {
    h.fillStyle = "rgba(0,0,0,0.45)";
    for (let s2 = y + 2; s2 < y + hh; s2 += 3) h.fillRect(x, s2, w, 1.2);
  }
}

/** The glass's dark reflection of the sky and the city: a gradient and a few streaks. */
function darkGlass(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, hh: number) {
  const grad = g.createLinearGradient(x, y, x + w, y + hh);
  grad.addColorStop(0, "#1a2233");
  grad.addColorStop(0.6, "#0e131d");
  grad.addColorStop(1, "#202a3c");
  g.fillStyle = grad;
  g.fillRect(x, y, w, hh);
  if (r() < 0.4) {
    g.fillStyle = "rgba(160,190,255,0.08)";
    g.fillRect(x + w * r(), y, w * 0.12, hh);
  }
}

/**
 * A facade's textures (one tile: several floors and bays, tiled in world units over the buildings): its color map and
 * its emissive map (the lit windows, each with its own interior, their light bleeding a little around them: the bloom
 * makes it a glow). Four styles: a glass curtain wall with offices; concrete with recessed windows, sills and air
 * conditioners; flats with balconies and sliding doors; works with corrugated panels and high windows.
 */
export function facade(style: Facade): { map: CanvasTexture; emissive: CanvasTexture } {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [e, h] = canvas(S, S);
  const r = rng(FACADES.indexOf(style) * 97 + 13);
  h.fillStyle = "#000";
  h.fillRect(0, 0, S, S);
  const lit = (x: number, y: number, w: number, hh: number, share: number) => {
    if (r() > share) {
      darkGlass(g, r, x, y, w, hh);
      return;
    }
    g.fillStyle = "#2a2a30";
    g.fillRect(x, y, w, hh);
    // The light bleeding out around the window, then the interior.
    h.save();
    h.shadowColor = "rgba(255,200,140,0.6)";
    h.shadowBlur = 10;
    interior(h, r, x, y, w, hh);
    h.restore();
    interior(h, r, x, y, w, hh);
  };
  if (style === "glass") {
    g.fillStyle = "#151a24";
    g.fillRect(0, 0, S, S);
    const rows = 8;
    const cols = 6;
    for (let j = 0; j < rows; j++) {
      // Whole floors lit together (offices), or dark.
      const floor = r() < 0.5 ? 0.85 : 0.08;
      for (let i = 0; i < cols; i++) lit(i * (S / cols) + 2, j * (S / rows) + 3, S / cols - 4, S / rows - 9, floor);
      // The floor's slab line.
      g.fillStyle = "#30363f";
      g.fillRect(0, (j + 1) * (S / rows) - 6, S, 6);
    }
    g.fillStyle = "#3b414b";
    for (let i = 0; i <= cols; i++) g.fillRect(i * (S / cols) - 1, 0, 3, S);
  } else if (style === "concrete") {
    g.fillStyle = "#4a4a4f";
    g.fillRect(0, 0, S, S);
    // Stains running down the concrete.
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(20,20,24,${0.05 + r() * 0.1})`;
      g.fillRect(r() * S, r() * S, 2 + r() * 6, 30 + r() * 120);
    }
    const rows = 8;
    const cols = 5;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * (S / cols) + 18;
        const y = j * (S / rows) + 12;
        const w = S / cols - 36;
        const hh = S / rows - 26;
        g.fillStyle = "#26262a";
        g.fillRect(x - 4, y - 4, w + 8, hh + 8);
        lit(x, y, w, hh, 0.4);
        // The frame's cross, the sill, sometimes an air conditioner below.
        g.fillStyle = "#57575c";
        g.fillRect(x + w / 2 - 1, y, 3, hh);
        g.fillRect(x - 6, y + hh + 2, w + 12, 4);
        if (r() < 0.3) {
          g.fillStyle = "#8a8c90";
          g.fillRect(x + w * 0.55, y + hh + 6, w * 0.4, 10);
        }
      }
  } else if (style === "flats") {
    g.fillStyle = "#3b3640";
    g.fillRect(0, 0, S, S);
    const rows = 7;
    const cols = 4;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * (S / cols) + 10;
        const y = j * (S / rows) + 8;
        const w = S / cols - 20;
        const hh = S / rows - 22;
        lit(x, y, w * 0.62, hh, 0.45);
        lit(x + w * 0.68, y + hh * 0.25, w * 0.3, hh * 0.5, 0.3);
        // The balcony: its slab and railing; laundry or a plant on some.
        g.fillStyle = "#6a6570";
        g.fillRect(x - 6, y + hh, w + 12, 6);
        g.fillStyle = "rgba(150,150,160,0.8)";
        for (let b = x - 6; b < x + w + 6; b += 6) g.fillRect(b, y + hh - 12, 1.5, 12);
        g.fillRect(x - 6, y + hh - 13, w + 12, 2);
        if (r() < 0.25) {
          g.fillStyle = ["#c84", "#48a", "#ddd", "#a44"][Math.floor(r() * 4)] as string;
          g.fillRect(x + r() * w * 0.8, y + hh - 22, 8, 12);
        }
      }
  } else {
    g.fillStyle = "#30353a";
    g.fillRect(0, 0, S, S);
    // Corrugated panels: ribs.
    for (let x = 0; x < S; x += 8) {
      g.fillStyle = x % 16 ? "#3a4046" : "#262a2f";
      g.fillRect(x, 0, 4, S);
    }
    const rows = 4;
    const cols = 6;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) lit(i * (S / cols) + 8, j * (S / rows) + 14, S / cols - 16, 22, 0.35);
    // Pipes and vents.
    g.fillStyle = "#555b62";
    for (let k = 0; k < 4; k++) g.fillRect(r() * S, 0, 5, S);
  }
  const map = texture(c);
  const emissive = texture(e);
  for (const t of [map, emissive]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, emissive };
}

/** Invented brands and their slogans: no real company. */
const ADS: { brand: string; jp: string; line: string; hue: string; second: string }[] = [
  { brand: "NEXA", jp: "ネクサ", line: "THINK FASTER", hue: "#22e4ff", second: "#ff2bd6" },
  { brand: "SYNTH RAMEN", jp: "合成ラーメン", line: "24H · 新鮮", hue: "#ffb020", second: "#ff4f7b" },
  { brand: "OMNI//CORP", jp: "オムニ", line: "WE OWN TOMORROW", hue: "#9b5cff", second: "#22e4ff" },
  { brand: "DREAM.EXE", jp: "夢を見る", line: "SLEEP IS OPTIONAL", hue: "#ff2bd6", second: "#7dff4a" },
  { brand: "KAIJU COLA", jp: "怪獣コーラ", line: "TASTE THE QUAKE", hue: "#ff4f7b", second: "#ffb020" },
  { brand: "HYPERLINK", jp: "ハイパー", line: "NEURAL 5G", hue: "#7dff4a", second: "#22e4ff" },
  { brand: "ZERO GRAVITY", jp: "無重力", line: "SKY TAXI · 空", hue: "#22e4ff", second: "#9b5cff" },
  { brand: "MANA DRINK", jp: "マナ", line: "+1/+1 ALL DAY", hue: "#ffb020", second: "#7dff4a" },
];

/**
 * A screen's ads: `slides` stacked vertically in one texture (the screen's shader shows one at a time, glitching from
 * one to the next), each a brand, its name in katakana, a slogan, shapes; the bottom strip a ticker line.
 */
export function adSlides(seed: number, slides = 4): { texture: CanvasTexture; colors: Color[] } {
  const W = 256;
  const H = 160;
  // Read back for the slides' colors.
  const [c, g] = canvas(W, H * slides, true);
  const r = rng(seed);
  for (let s = 0; s < slides; s++) {
    const ad = ADS[(seed * 3 + s * 5) % ADS.length] as (typeof ADS)[number];
    const y0 = s * H;
    const grad = g.createLinearGradient(0, y0, W, y0 + H);
    grad.addColorStop(0, "#07040f");
    grad.addColorStop(1, ad.second === "#7dff4a" ? "#06140a" : "#120518");
    g.fillStyle = grad;
    g.fillRect(0, y0, W, H);
    // Shapes: a ring, bars, a sweep.
    g.strokeStyle = ad.second;
    g.lineWidth = 6;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.arc(W * (0.2 + r() * 0.6), y0 + H * 0.5, 30 + r() * 30, 0, Math.PI * 2);
    g.stroke();
    for (let b = 0; b < 6; b++) {
      g.fillStyle = b % 2 ? ad.hue : ad.second;
      g.fillRect(r() * W, y0 + r() * H, 30 + r() * 80, 3);
    }
    g.globalAlpha = 1;
    g.shadowColor = ad.hue;
    g.shadowBlur = 14;
    g.fillStyle = ad.hue;
    g.font = "bold 44px sans-serif";
    g.textAlign = "center";
    g.fillText(ad.brand, W / 2, y0 + 62, W - 20);
    g.shadowColor = ad.second;
    g.fillStyle = ad.second;
    g.font = "bold 30px sans-serif";
    if (hasCjk()) g.fillText(ad.jp, W / 2, y0 + 100, W - 20);
    g.shadowBlur = 6;
    g.fillStyle = "#f2f2ff";
    g.font = "18px monospace";
    g.fillText(ad.line, W / 2, y0 + 132, W - 20);
    g.shadowBlur = 0;
  }
  // Each slide's light: its average color, saturated (what a screen throws around it).
  const colors = Array.from({ length: slides }, (_, k) => {
    const data = g.getImageData(0, k * H, W, H).data;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    for (let i = 0; i < data.length; i += 16) {
      rr += data[i] as number;
      gg += data[i + 1] as number;
      bb += data[i + 2] as number;
    }
    const color = new Color(rr, gg, bb);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    return color.setHSL(hsl.h, Math.min(1, hsl.s * 1.6 + 0.2), 0.55);
  });
  const t = texture(c);
  t.wrapS = RepeatWrapping;
  return { texture: t, colors };
}

/** A neon sign's word, glowing on transparent: vertical (katakana, kanji) or horizontal. */
export function neonWord(text: string, color: string, vertical: boolean): CanvasTexture {
  const chars = [...text];
  const [c, g] = vertical ? canvas(64, 64 * chars.length) : canvas(40 * chars.length + 40, 72);
  g.font = vertical ? "bold 48px sans-serif" : "bold 50px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  // The tube: a wide soft halo, then the bright core.
  for (const [blur, alpha, fill] of [
    [18, 0.9, color],
    [6, 1, color],
    [0, 1, "#ffffff"],
  ] as const) {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    if (fill === "#ffffff") g.font = vertical ? "bold 42px sans-serif" : "bold 44px sans-serif";
    if (vertical)
      chars.forEach((ch, i) => {
        g.fillText(ch, 32, 32 + i * 64);
      });
    else g.fillText(text, c.width / 2, 38);
  }
  return texture(c);
}

/** The battlefields' mats: dark rubber with a faint cyan grid of hexagons. */
export function hexMat(): CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#0f1220";
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "rgba(34, 228, 255, 0.16)";
  g.lineWidth = 2;
  const R = 22;
  const w = Math.sqrt(3) * R;
  for (let row = -1; row < S / (1.5 * R) + 1; row++)
    for (let col = -1; col < S / w + 1; col++) {
      const x = col * w + (row % 2 ? w / 2 : 0);
      const y = row * 1.5 * R;
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        g.lineTo(x + R * Math.cos(a), y + R * Math.sin(a));
      }
      g.stroke();
    }
  const t = texture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
}

/** Yellow and black hazard stripes (the helipad's edges). */
export function hazard(): CanvasTexture {
  const [c, g] = canvas(128, 32);
  g.fillStyle = "#16130a";
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = "#e8b81c";
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.fill();
  }
  const t = texture(c);
  t.wrapS = RepeatWrapping;
  return t;
}
