/**
 * The three.js scene of the 3D board (PLAN-W W3): the table (a ground in the texture's palette, a mat under each
 * battlefield, a raised rim), the lights, and a mesh for every card of the model. Drawn on demand only (a change, an
 * image arriving, a resize): an idle board costs nothing. A lost WebGL context calls `onLost` (back to the DOM board).
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import type { Lang } from "../translate";
import type { Framing } from "./camera";
import type { CardNode } from "./model";
import { type Rect, type Table, toWorld } from "./seats";
import { CardTextures, textureKey } from "./textures";

/** Palette of the chosen table texture (`--bd-0` deep, `--bd-1` mid, `--bd-pool` light, styles.css). */
export interface Palette {
  deep: string;
  mid: string;
  pool: string;
}

/** Thickness of a card (world units): a sliver of edge under the face. */
const CARD_THICKNESS = 0.012;
/** Texture cache: about 100 card faces. */
const TEXTURE_BUDGET = 64 * 1024 * 1024;

/** A rounded rectangle centered on the origin, in the XY plane. */
function roundedRect(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Card geometries for one shape (height / width): the face, UVs over the whole card, and the body under it. */
function cardGeometries(ratio: number) {
  const shape = roundedRect(1, ratio, 0.06);
  const face = new ShapeGeometry(shape, 6);
  const pos = face.attributes.position;
  const uv = face.attributes.uv;
  if (pos && uv) for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) / ratio + 0.5);
  // Lying on the table: the shape's top edge away from the viewer.
  face.rotateX(-Math.PI / 2);
  const body = new ExtrudeGeometry(shape, { depth: CARD_THICKNESS, bevelEnabled: false, curveSegments: 6 });
  body.rotateX(-Math.PI / 2);
  // Just under the face (not level with it: the two would flicker).
  body.translate(0, -CARD_THICKNESS - 0.001, 0);
  return { face, body };
}

/** Fine grain for the ground and the mats (a tiled noise canvas). */
function grainTexture(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.random() * 55;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(canvas);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(24, 24);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class TableScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(34, 1, 0.1, 100);
  private textures: CardTextures;
  private grain = grainTexture();
  private ground = new MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  private mat = new MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
  private rimMat = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
  private edgeMat = new MeshStandardMaterial({ color: "#16130f", roughness: 0.8 });
  private hemi = new HemisphereLight("#ffffff", "#000000", 0.55);
  private pool = new PointLight("#ffffff", 1, 0, 2);
  private tableGroup = new Group();
  private cardGroup = new Group();
  private cards = new Map<string, { group: Group; face: Mesh; key: string }>();
  private geometries = new Map<number, ReturnType<typeof cardGeometries>>();
  private frame = 0;
  private lost = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onLost: () => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = new CardTextures(TEXTURE_BUDGET, anisotropy, () => this.requestRender());
    this.ground.map = this.grain;
    this.mat.map = this.grain;
    const ground = new Mesh(new PlaneGeometry(80, 80), this.ground);
    ground.rotateX(-Math.PI / 2);
    ground.position.y = -0.02;
    this.scene.add(ground, this.tableGroup, this.cardGroup);
    // Light: a key light from the viewer's left, a soft fill from the sky, a pool of the texture's light over the middle.
    const key = new DirectionalLight("#fff4e6", 1.5);
    key.position.set(-6, 14, 9);
    this.scene.add(key, new AmbientLight("#ffffff", 0.18), this.hemi, this.pool);
    canvas.addEventListener("webglcontextlost", this.onContextLost);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    cancelAnimationFrame(this.frame);
    this.onLost();
  };

  /** Draws once at the next frame (several changes in a frame draw once). */
  requestRender(): void {
    if (this.lost || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  setPalette(p: Palette): void {
    this.scene.background = new Color(p.deep);
    this.ground.color.set(p.mid).multiplyScalar(0.55);
    this.mat.color.set(p.mid).multiplyScalar(0.8);
    this.rimMat.color.set(p.pool).multiplyScalar(0.35);
    this.hemi.color.set(p.pool);
    this.hemi.groundColor.set(p.deep);
    this.pool.color.set(p.pool);
    this.requestRender();
  }

  /** Size of the canvas (CSS px) and the camera's framing. */
  setView(width: number, height: number, framing: Framing): void {
    this.renderer.setSize(width, height, false);
    this.camera.fov = framing.fov;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.near = framing.near;
    this.camera.far = framing.far;
    this.camera.position.set(...framing.eye);
    this.camera.lookAt(...framing.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.requestRender();
  }

  /** The table: a mat under each battlefield and a raised rim around them. */
  setTable(table: Table): void {
    for (const child of [...this.tableGroup.children]) {
      this.tableGroup.remove(child);
      if (child instanceof Mesh) child.geometry.dispose();
    }
    const box = (r: Rect, inset: number) => {
      const a = toWorld(table, r.x + inset, r.y + inset);
      const b = toWorld(table, r.x + r.w - inset, r.y + r.h - inset);
      return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: b.x - a.x, h: b.z - a.z };
    };
    for (const seat of table.seats) {
      const z = box(seat.zone, 6);
      if (z.w <= 0 || z.h <= 0) continue;
      const mat = new Mesh(new ExtrudeGeometry(roundedRect(z.w, z.h, 0.18), { depth: 0.015, bevelEnabled: false }), this.mat);
      mat.rotateX(-Math.PI / 2);
      mat.position.set(z.x, -0.015, z.z);
      this.tableGroup.add(mat);
    }
    // Rim: four rails around the battlefields.
    const all = table.seats.map((s) => s.zone).concat(table.seats.map((s) => s.piles));
    const x0 = Math.min(...all.map((r) => r.x));
    const x1 = Math.max(...all.map((r) => r.x + r.w));
    const y0 = Math.min(...all.map((r) => r.y));
    const y1 = Math.max(...all.map((r) => r.y + r.h));
    const outer = box({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, -18);
    const rail = 0.22;
    const height = 0.09;
    for (const [x, z, w, d] of [
      [outer.x, outer.z - outer.h / 2, outer.w + rail, rail],
      [outer.x, outer.z + outer.h / 2, outer.w + rail, rail],
      [outer.x - outer.w / 2, outer.z, rail, outer.h + rail],
      [outer.x + outer.w / 2, outer.z, rail, outer.h + rail],
    ] as const) {
      const m = new Mesh(new BoxGeometry(w, height, d), this.rimMat);
      m.position.set(x, height / 2 - 0.02, z);
      this.tableGroup.add(m);
    }
    // The pool's light falls off with the square of its height: the same light on the table whatever its size.
    const lift = Math.max(outer.w, outer.h) * 0.45;
    this.pool.position.set(0, lift, 0);
    this.pool.intensity = 1.1 * lift * lift;
    this.requestRender();
  }

  private geometry(ratio: number) {
    const key = Math.round(ratio * 1000);
    let g = this.geometries.get(key);
    if (!g) {
      g = cardGeometries(ratio);
      this.geometries.set(key, g);
    }
    return g;
  }

  /** The cards: added, moved and removed after the model (by uid). */
  setCards(nodes: CardNode[], lang: Lang): void {
    const pinned = new Set(nodes.map((n) => textureKey(n.obj, n.obj, lang)));
    const seen = new Set<string>();
    for (const n of nodes) {
      seen.add(n.uid);
      const key = textureKey(n.obj, n.obj, lang);
      let card = this.cards.get(n.uid);
      if (!card) {
        const g = this.geometry(n.pose.h / n.pose.w);
        const face = new Mesh(g.face, new MeshStandardMaterial({ roughness: 0.55, metalness: 0 }));
        const group = new Group();
        group.add(face, new Mesh(g.body, this.edgeMat));
        this.cardGroup.add(group);
        card = { group, face, key: "" };
        this.cards.set(n.uid, card);
      }
      if (card.key !== key) {
        const material = card.face.material as MeshStandardMaterial;
        material.map = this.textures.get(n.obj, n.obj, lang, pinned);
        material.needsUpdate = true;
        card.key = key;
      }
      // Shadows behind a token pile are a little darker, as on the DOM board.
      (card.face.material as MeshStandardMaterial).color.setScalar(n.kind === "shadow" ? 0.7 : 1);
      card.group.position.set(n.pose.x, n.pose.y, n.pose.z);
      card.group.rotation.y = (-n.pose.rot * Math.PI) / 180;
      card.group.scale.set(n.pose.w, 1, n.pose.w);
    }
    for (const [uid, card] of this.cards) {
      if (seen.has(uid)) continue;
      this.cardGroup.remove(card.group);
      (card.face.material as MeshStandardMaterial).dispose();
      this.cards.delete(uid);
    }
    this.requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.textures.dispose();
    this.grain.dispose();
    for (const g of this.geometries.values()) {
      g.face.dispose();
      g.body.dispose();
    }
    this.renderer.dispose();
  }
}
