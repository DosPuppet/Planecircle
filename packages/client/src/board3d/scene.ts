/**
 * The three.js scene of the 3D board (PLAN-W W3): the table (a ground in the texture's palette, a mat under each
 * battlefield, a raised rim), the lights, and a mesh for every card of the model. Drawn on demand only (a change, an
 * image arriving, a resize): an idle board costs nothing. A lost WebGL context calls `onLost` (back to the DOM board).
 */

import type { CardFace, ObjectView } from "@mtgx/engine";
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
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { CARD_RATIO } from "../board/layout";
import type { Lang } from "../translate";
import type { Framing } from "./camera";
import type { CardNode } from "./model";
import { Springs } from "./motion";
import type { CardPose } from "./project";
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

/** A card of the hand on the screen (board px): its center, size and angle (radians, clockwise), as the DOM lays it. */
export interface HandPose {
  uid: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number;
}

/** UVs over the whole card for a shape in the XY plane. */
function cardUvs(g: ShapeGeometry, ratio: number) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  if (pos && uv) for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) / ratio + 0.5);
}

/** Card geometries for one shape (height / width): the face, UVs over the whole card, and the body under it. */
function cardGeometries(ratio: number) {
  const shape = roundedRect(1, ratio, 0.06);
  const face = new ShapeGeometry(shape, 6);
  cardUvs(face, ratio);
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
  private cards = new Map<string, { group: Group; face: Mesh; body: Mesh; key: string }>();
  private geometries = new Map<number, ReturnType<typeof cardGeometries>>();
  private springs: Springs;
  private target = new Vector3();
  /** The hand: whole cards facing the camera, where the DOM hand lays them (`handSource`, read each frame). */
  private handGroup = new Group();
  private hand = new Map<string, { mesh: Mesh; key: string }>();
  private handFace: ShapeGeometry;
  private handSource: () => HandPose[] = () => [];
  private viewport = { w: 1, h: 1 };
  /** Animated until then (ms, performance clock): the DOM hand's own springs. */
  private liveUntil = 0;
  private frame = 0;
  private last = 0;
  private lost = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onLost: () => void,
    /** 1 normally, faster in the fast test mode, Infinity with reduced motion (cards jump). */
    speed = 1,
  ) {
    this.springs = new Springs(speed);
    this.handFace = new ShapeGeometry(roundedRect(1, CARD_RATIO, 0.045), 6);
    cardUvs(this.handFace, CARD_RATIO);
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
    this.scene.add(ground, this.tableGroup, this.cardGroup, this.handGroup);
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

  /**
   * Draws at the next frame, and goes on while a card flies or the hand moves: an idle board draws nothing (several
   * changes in a frame draw once).
   */
  requestRender(): void {
    if (this.lost || this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Is a frame coming (a card flying, the hand moving)? An idle board draws nothing. */
  get drawing(): boolean {
    return this.frame !== 0;
  }

  /** Cards of the hand shown (dev checks). */
  get handShown(): number {
    return [...this.hand.values()].filter((c) => c.mesh.visible).length;
  }

  /** Keeps drawing for `ms` milliseconds (the DOM hand is moving: hover, drag, a card coming in). */
  live(ms: number): void {
    this.liveUntil = Math.max(this.liveUntil, performance.now() + ms);
    this.requestRender();
  }

  private tick = (now: number) => {
    this.frame = 0;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const moving = this.springs.step(dt);
    for (const [uid, card] of this.cards) {
      const p = this.springs.pose(uid);
      if (p) this.place(card, p);
    }
    this.syncHand();
    this.renderer.render(this.scene, this.camera);
    if (moving || now < this.liveUntil) this.frame = requestAnimationFrame(this.tick);
  };

  private place(card: { group: Group }, p: CardPose) {
    card.group.position.set(p.x, p.y, p.z);
    card.group.rotation.y = (-p.rot * Math.PI) / 180;
    card.group.scale.set(p.w, 1, p.w);
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
    this.target.set(...framing.target);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.viewport = { w: width, h: height };
    this.live(400);
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

  /**
   * The cards of the table (battlefields and piles): added, moved and removed after the model, by uid. Each flies to
   * its place; a card seen nowhere before starts at `start` (the stack, above the table).
   */
  setCards(nodes: CardNode[], lang: Lang, start: (uid: string, target: CardPose) => CardPose | undefined): void {
    const pinned = new Set(nodes.map((n) => textureKey(n.obj, n.obj, lang)));
    for (const n of nodes) {
      const key = textureKey(n.obj, n.obj, lang);
      let card = this.cards.get(n.uid);
      if (!card) {
        const g = this.geometry(n.pose.h / n.pose.w);
        const face = new Mesh(g.face, new MeshStandardMaterial({ roughness: 0.55, metalness: 0 }));
        const body = new Mesh(g.body, this.edgeMat);
        const group = new Group();
        group.add(face, body);
        this.cardGroup.add(group);
        card = { group, face, body, key: "" };
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
      // A pile is as thick as it is full: its body reaches down to the table.
      card.body.scale.y = n.count ? Math.max(1, n.pose.y / (CARD_THICKNESS + 0.001)) : 1;
    }
    const targets = new Map(nodes.map((n) => [n.uid, n.pose]));
    for (const [uid, card] of this.cards) {
      if (targets.has(uid)) continue;
      this.cardGroup.remove(card.group);
      (card.face.material as MeshStandardMaterial).dispose();
      this.cards.delete(uid);
    }
    this.springs.setTargets(targets, start);
    for (const [uid, card] of this.cards) {
      const p = this.springs.pose(uid);
      if (p) this.place(card, p);
    }
    this.requestRender();
  }

  /** The cards of the hand (whole cards, unlit: their text keeps its colors); `source` says where the DOM lays them. */
  setHand(cards: { uid: string; face: CardFace; obj?: ObjectView }[], lang: Lang, source: () => HandPose[]): void {
    this.handSource = source;
    const pinned = new Set(cards.map((c) => textureKey(c.face, c.obj, lang, "full")));
    const seen = new Set<string>();
    for (const c of cards) {
      seen.add(c.uid);
      const key = textureKey(c.face, c.obj, lang, "full");
      let card = this.hand.get(c.uid);
      if (!card) {
        const material = new MeshBasicMaterial({ transparent: true });
        material.toneMapped = false;
        card = { mesh: new Mesh(this.handFace, material), key: "" };
        card.mesh.visible = false;
        this.handGroup.add(card.mesh);
        this.hand.set(c.uid, card);
      }
      if (card.key !== key) {
        const material = card.mesh.material as MeshBasicMaterial;
        material.map = this.textures.get(c.face, c.obj, lang, pinned, "full");
        material.needsUpdate = true;
        card.key = key;
      }
    }
    for (const [uid, card] of this.hand) {
      if (seen.has(uid)) continue;
      this.handGroup.remove(card.mesh);
      (card.mesh.material as MeshBasicMaterial).dispose();
      this.hand.delete(uid);
    }
    this.live(700);
  }

  /**
   * The hand's meshes where the DOM lays its cards: on a plane facing the camera, between it and the table, each card
   * where its DOM slot is on the screen. A card leaving the hand flies from there (its last pose is remembered).
   */
  private syncHand() {
    if (!this.hand.size) return;
    const distance = this.camera.position.distanceTo(this.target) * 0.45;
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    const unit = (2 * distance * tanHalf) / this.viewport.h;
    const spin = new Quaternion();
    const forward = new Vector3(0, 0, 1);
    for (const p of this.handSource()) {
      const card = this.hand.get(p.uid);
      if (!card) continue;
      const nx = (p.cx / this.viewport.w) * 2 - 1;
      const ny = 1 - (p.cy / this.viewport.h) * 2;
      const at = new Vector3(nx * distance * tanHalf * this.camera.aspect, ny * distance * tanHalf, -distance);
      at.applyMatrix4(this.camera.matrixWorld);
      card.mesh.position.copy(at);
      card.mesh.quaternion.copy(this.camera.quaternion).multiply(spin.setFromAxisAngle(forward, -p.angle));
      card.mesh.scale.setScalar(p.w * unit);
      card.mesh.visible = true;
      this.springs.remember(p.uid, { x: at.x, y: at.y, z: at.z, w: p.w * unit, h: p.h * unit, rot: 0 });
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.textures.dispose();
    this.grain.dispose();
    this.handFace.dispose();
    for (const g of this.geometries.values()) {
      g.face.dispose();
      g.body.dispose();
    }
    this.renderer.dispose();
  }
}
