/**
 * Tatami for the battlefields on the shrine's stage (PLAN-X X2): a woven straw texture drawn on a canvas (rows of
 * rush across the screen, each a slightly different shade, a faint seam every few rows) and its normal map (each row
 * rounded), tiled in world units on the mats.
 */
import { CanvasTexture, type MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from "three";
import { noise } from "./plan";

const SIZE = 512;
/** Pixels per row of rush. */
const ROW = 16;
/** World units the texture covers. */
export const TATAMI_TILE = 1.1;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}

export function tatami(): { map: CanvasTexture; normalMap: CanvasTexture } {
  const [color, g] = canvas();
  for (let y = 0; y < SIZE; y += ROW) {
    // Each row its own shade of aged rush, green-gold.
    const k = noise(y * 0.37, 1.3);
    g.fillStyle = `rgb(${Math.round(178 + k * 22)}, ${Math.round(163 + k * 20)}, ${Math.round(82 + k * 14)})`;
    g.fillRect(0, y, SIZE, ROW);
    // The rush's fibres: fine streaks along the row.
    for (let i = 0; i < 70; i++) {
      const x = noise(i * 3.1, y * 0.71) * SIZE;
      const w = 20 + noise(i, y) * 80;
      g.fillStyle = `rgba(${noise(i, y * 2) > 0.5 ? "90, 80, 40" : "230, 220, 160"}, ${0.08 + noise(y, i) * 0.12})`;
      g.fillRect(x, y + 2 + noise(i * 7, y) * (ROW - 5), w, 1.2);
    }
    // The groove between rows.
    g.fillStyle = "rgba(70, 60, 30, 0.45)";
    g.fillRect(0, y + ROW - 1.5, SIZE, 1.5);
  }
  // The weaving's warp, faint, across the rows.
  g.fillStyle = "rgba(80, 70, 40, 0.12)";
  for (let x = 0; x < SIZE; x += SIZE / 8) g.fillRect(x, 0, 2, SIZE);

  const [normal, n] = canvas();
  const image = n.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    // Each row a rounded ridge: its slope across the row.
    const phase = ((y % ROW) + 0.5) / ROW;
    const slope = Math.cos(Math.PI * phase) * 0.9;
    for (let x = 0; x < SIZE; x++) {
      const jitter = (noise(x * 0.15, y * 0.9) - 0.5) * 0.25;
      const nx = jitter;
      const ny = slope;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * SIZE + x) * 4;
      image.data[i] = Math.round((nx / len) * 127 + 128);
      image.data[i + 1] = Math.round((ny / len) * 127 + 128);
      image.data[i + 2] = Math.round((1 / len) * 127 + 128);
      image.data[i + 3] = 255;
    }
  }
  n.putImageData(image, 0, 0);
  const map = new CanvasTexture(color);
  map.colorSpace = SRGBColorSpace;
  const normalMap = new CanvasTexture(normal);
  for (const t of [map, normalMap]) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(1 / TATAMI_TILE, 1 / TATAMI_TILE);
    t.anisotropy = 8;
  }
  return { map, normalMap };
}

/** Dresses the battlefields' material as tatami. */
export function dressMats(mat: MeshStandardMaterial, t: { map: CanvasTexture; normalMap: CanvasTexture }): void {
  mat.map = t.map;
  mat.normalMap = t.normalMap;
  mat.normalScale = new Vector2(0.6, 0.6);
  mat.aoMap = null;
  mat.roughnessMap = null;
  mat.metalnessMap = null;
  // Warm under the cold moonlight, a little darker than the bare rush: the cards stand out.
  mat.color.set("#e2cf9c");
  mat.roughness = 0.78;
  mat.metalness = 0;
  mat.needsUpdate = true;
}
