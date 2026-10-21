/**
 * The three.js scene of the 3D board (PLAN-W W3): the table (a ground in the texture's palette, a mat under each
 * battlefield, a raised rim), the lights, and a mesh for every card of the model. Drawn on demand only (a change, an
 * image arriving, a resize): an idle board costs nothing. A lost WebGL context calls `onLost` (back to the DOM board).
 */

import type { CardFace, ObjectView } from "@mtgx/engine";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { CARD_RATIO } from "../board/layout";
import type { Lang } from "../translate";
import { type Bounds, clearOfRim, propPose } from "./arena";
import type { Arena, ArenaMaterial } from "./assets";
import type { Framing } from "./camera";
import type { CardNode } from "./model";
import { Springs } from "./motion";
import { Post } from "./post";
import type { CardPose } from "./project";
import { Governor, PRESETS, type Quality } from "./quality";
import { type Rect, type Table, toWorld } from "./seats";
import { CardTextures, textureKey } from "./textures";

/** Palette of the chosen table texture (`--bd-0` deep, `--bd-1` mid, `--bd-pool` light, styles.css). */
export interface Palette {
  deep: string;
  mid: string;
  pool: string;
}

/** Width of a card's glow rim, in card widths. */
const RIM = 0.045;
/** A glow rim shines above the bloom's threshold (its color times this). */
const RIM_GLOW = 1.3;

/** Render order of the hand: after everything on the table. */
const HAND_ORDER = 1_000_000;

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
  /** Stacking order on the screen, as the DOM paints the hand (the hovered or dragged card in front). */
  order: number;
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
  // The glow rim: a slightly larger card under the face, showing only around it (W6).
  const rim = new ShapeGeometry(roundedRect(1 + 2 * RIM, ratio + 2 * RIM, 0.06 + RIM), 6);
  rim.rotateX(-Math.PI / 2);
  rim.translate(0, -0.0005, 0);
  return { face, body, rim };
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
  /** The arena (W5): its props, their flames, the rim they stand around. */
  private arena: Arena | null = null;
  private propGroup = new Group();
  private rim: Bounds | null = null;
  private cardGroup = new Group();
  private cards = new Map<string, { group: Group; face: Mesh; body: Mesh; rim: Mesh | null; key: string }>();
  private geometries = new Map<number, ReturnType<typeof cardGeometries>>();
  private springs: Springs;
  private target = new Vector3();
  /** The hand: whole cards facing the camera, where the DOM hand lays them (`handSource`, read each frame). */
  private handGroup = new Group();
  /** The hand has a scene of its own, drawn after the post-processing: its cards keep their colors (no tone mapping). */
  private handScene = new Scene();
  private hand = new Map<string, { mesh: Mesh; key: string }>();
  private handFace: ShapeGeometry;
  private handSource: () => HandPose[] = () => [];
  private viewport = { w: 1, h: 1 };
  /** Light, shadows and bloom (W6): the key light casts the shadows; the governor steps the quality down. */
  private key = new DirectionalLight("#fff4e6", 1.5);
  private post: Post | null = null;
  private governor: Governor;
  private continued = false;
  private glowColors: Record<string, string> = {};
  private rimMaterials = new Map<string, MeshBasicMaterial>();
  private flames: PointLight[] = [];
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
    quality: Quality = "high",
  ) {
    this.springs = new Springs(speed);
    this.handFace = new ShapeGeometry(roundedRect(1, CARD_RATIO, 0.045), 6);
    cardUvs(this.handFace, CARD_RATIO);
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // Shadows drawn again only when something moves (`needsUpdate`), soft.
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = new CardTextures(TEXTURE_BUDGET, anisotropy, () => this.requestRender());
    this.ground.map = this.grain;
    this.mat.map = this.grain;
    const ground = new Mesh(new PlaneGeometry(80, 80), this.ground);
    ground.rotateX(-Math.PI / 2);
    ground.position.y = -0.02;
    this.ground.userData.size = 80;
    this.scene.add(ground, this.tableGroup, this.propGroup, this.cardGroup);
    this.handScene.add(this.handGroup);
    // Light: a key light from the viewer's left, a soft fill from the sky, a pool of the texture's light over the middle.
    this.key.position.set(-6, 14, 9);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target, new AmbientLight("#ffffff", 0.18), this.hemi, this.pool);
    ground.receiveShadow = true;
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.governor = new Governor(quality, (q) => this.applyQuality(q));
    this.applyQuality(quality);
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

  /** The arena is drawn (dev checks). */
  get arenaShown(): boolean {
    return !!this.arena && this.propGroup.children.length > 0;
  }

  /** The quality drawn now (dev checks). */
  get quality(): Quality {
    return this.governor.level;
  }

  /**
   * A quality preset: pixel ratio, shadows (materials recompiled when they appear or go), bloom and multisampling (the
   * composer made again).
   */
  private applyQuality(q: Quality) {
    const p = PRESETS[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.dpr));
    this.renderer.setSize(this.viewport.w, this.viewport.h, false);
    const shadows = p.shadows > 0;
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => {
        for (const m of ([] as Material[]).concat((o as Mesh).material ?? [])) m.needsUpdate = true;
      });
    }
    this.key.castShadow = shadows;
    if (shadows && this.key.shadow.mapSize.x !== p.shadows) {
      this.key.shadow.mapSize.set(p.shadows, p.shadows);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.post?.dispose();
    this.post = p.bloom ? new Post(this.renderer, this.scene, this.camera, p.samples) : null;
    this.post?.setSize(this.viewport.w, this.viewport.h, this.renderer.getPixelRatio());
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  /** Colors of the glows (CSS variables of the board: --playable, --target…), for the rims of the cards. */
  setGlowColors(colors: Record<string, string>): void {
    this.glowColors = colors;
    for (const [glow, m] of this.rimMaterials) m.color.set(colors[glow] ?? "#ffffff").multiplyScalar(RIM_GLOW);
    this.requestRender();
  }

  private rimMaterial(glow: string): MeshBasicMaterial {
    let m = this.rimMaterials.get(glow);
    if (!m) {
      m = new MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false });
      m.toneMapped = false;
      m.color.set(this.glowColors[glow] ?? "#ffffff").multiplyScalar(RIM_GLOW);
      this.rimMaterials.set(glow, m);
    }
    return m;
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
    const ms = Math.max(0, now - this.last);
    this.governor.frame(ms, this.continued);
    const dt = Math.min(0.05, ms / 1000);
    this.last = now;
    const moving = this.springs.step(dt);
    for (const [uid, card] of this.cards) {
      const p = this.springs.pose(uid);
      if (p) this.place(card, p);
    }
    // A card in flight moves its shadow; still, the shadow map stays as it is.
    if (moving) this.renderer.shadowMap.needsUpdate = true;
    this.syncHand();
    this.flicker(now);
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.hand.size) {
      this.renderer.autoClear = false;
      this.renderer.render(this.handScene, this.camera);
      this.renderer.autoClear = true;
    }
    this.continued = moving || now < this.liveUntil;
    if (this.continued) this.frame = requestAnimationFrame(this.tick);
  };

  /** The flames waver while the board is drawing anyway (an idle board stays still: no endless animation). */
  private flicker(now: number) {
    const t = now / 1000;
    this.flames.forEach((f, i) => {
      const n = 0.5 * Math.sin(t * 13.1 + i * 1.7) + 0.3 * Math.sin(t * 7.3 + i * 4.1) + 0.2 * Math.sin(t * 23.7 + i);
      f.intensity = (f.userData.base as number) * (0.88 + 0.12 * n);
    });
  }

  private place(card: { group: Group }, p: CardPose) {
    card.group.position.set(p.x, p.y, p.z);
    card.group.rotation.y = (-p.rot * Math.PI) / 180;
    card.group.scale.set(p.w, 1, p.w);
  }

  get webgl(): WebGLRenderer {
    return this.renderer;
  }

  setPalette(p: Palette): void {
    this.scene.background = new Color(p.deep);
    // With the arena, the table is wood and the rim carved: only the mats keep the texture's color.
    if (!this.arena?.materials.tabletop) this.ground.color.set(p.mid).multiplyScalar(0.55);
    this.mat.color.set(p.mid).multiplyScalar(this.arena ? 1.1 : 0.8);
    if (!this.arena?.materials.rim) this.rimMat.color.set(p.pool).multiplyScalar(0.35);
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
    this.post?.setSize(width, height, this.renderer.getPixelRatio());
    this.renderer.shadowMap.needsUpdate = true;
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
    this.rim = { x0: outer.x - outer.w / 2, x1: outer.x + outer.w / 2, z0: outer.z - outer.h / 2, z1: outer.z + outer.h / 2 };
    // The key light's shadows cover the table and its props.
    const reach = Math.max(outer.w, outer.h) / 2 + 6;
    const cam = this.key.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = 1;
    cam.far = 80;
    cam.updateProjectionMatrix();
    for (const child of this.tableGroup.children) child.receiveShadow = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.placeProps();
    // The pool's light falls off with the square of its height: the same light on the table whatever its size.
    const lift = Math.max(outer.w, outer.h) * 0.45;
    this.pool.position.set(0, lift, 0);
    this.pool.intensity = 1.1 * lift * lift;
    this.requestRender();
  }

  /**
   * The arena (null: the plain table): its HDRI lights the scene and shows in reflections, its wood covers the table,
   * its leather and carved wood the mats and the rim, its props stand around the rim.
   */
  setArena(arena: Arena | null): void {
    this.arena = arena;
    this.scene.environment = arena?.environment ?? null;
    this.scene.environmentIntensity = 0.55;
    const apply = (target: MeshStandardMaterial, m: ArenaMaterial | undefined, repeat: number, colored: boolean) => {
      if (!m) return;
      const tiled = (t: Texture | undefined) => {
        if (!t) return null;
        const c = t.clone();
        c.repeat.set(repeat, repeat);
        c.channel = 0;
        return c;
      };
      target.map = colored ? tiled(m.map) : target.map;
      target.normalMap = tiled(m.normalMap);
      const arm = tiled(m.arm);
      target.aoMap = arm;
      target.roughnessMap = arm;
      target.metalnessMap = arm;
      target.roughness = 1;
      target.metalness = 1;
      if (colored) target.color.set("#ffffff");
      target.needsUpdate = true;
    };
    if (arena) {
      const size = this.ground.userData.size as number;
      apply(this.ground, arena.materials.tabletop, size / (arena.materials.tabletop?.tile ?? size), true);
      // The mats and the rim have UVs in world units (extruded shapes): one tile every `tile`.
      apply(this.mat, arena.materials.mat, 1 / (arena.materials.mat?.tile ?? 1), false);
      apply(this.rimMat, arena.materials.rim, 1 / (arena.materials.rim?.tile ?? 1), true);
    }
    this.placeProps();
    this.requestRender();
  }

  /**
   * The props around the rim: each sized by its largest dimension, set down on the table, turned; a flame lights its
   * top. One whose footprint would reach inside the rim (a narrow screen) is left out: never on a battlefield.
   */
  private placeProps() {
    this.propGroup.clear();
    this.flames = [];
    const arena = this.arena;
    const rim = this.rim;
    if (!arena || !rim) return;
    const box = new Box3();
    const dims = new Vector3();
    for (const p of arena.manifest.props ?? []) {
      const model = arena.models.get(p.model);
      if (!model) continue;
      const pose = propPose(p, rim);
      const body = model.clone(true);
      // Laid on its side: its longest side (y, standing) along the table.
      if (p.lie) body.rotation.z = Math.PI / 2;
      const prop = new Group();
      prop.add(body);
      prop.rotation.y = pose.turn;
      box.setFromObject(prop).getSize(dims);
      prop.scale.setScalar(p.size / Math.max(dims.x, dims.y, dims.z, 1e-6));
      prop.position.set(pose.x, 0, pose.z);
      prop.updateMatrixWorld(true);
      box.setFromObject(prop);
      // Its base on the table, its middle where the manifest says.
      prop.position.x += pose.x - (box.min.x + box.max.x) / 2;
      prop.position.z += pose.z - (box.min.z + box.max.z) / 2;
      prop.position.y += -0.02 - box.min.y;
      prop.updateMatrixWorld(true);
      box.setFromObject(prop);
      if (!clearOfRim({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }, rim)) continue;
      if (p.light) {
        const flame = new PointLight("#ffb265", 2.5, 0, 2);
        flame.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.15, (box.min.z + box.max.z) / 2);
        flame.userData.base = flame.intensity;
        this.flames.push(flame);
        this.propGroup.add(flame);
      }
      prop.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.propGroup.add(prop);
    }
    this.renderer.shadowMap.needsUpdate = true;
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
        face.castShadow = true;
        face.receiveShadow = true;
        body.castShadow = true;
        const group = new Group();
        group.add(face, body);
        this.cardGroup.add(group);
        card = { group, face, body, rim: null, key: "" };
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
      // Its glow (W6): a rim of the glow's color around it, which the bloom makes shine.
      if (n.glow && !card.rim) {
        card.rim = new Mesh(this.geometry(n.pose.h / n.pose.w).rim, this.rimMaterial(n.glow));
        card.group.add(card.rim);
      }
      if (card.rim) {
        card.rim.visible = !!n.glow;
        if (n.glow) card.rim.material = this.rimMaterial(n.glow);
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
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
        // The hand lies on one plane in front of the table: drawn without depth, in the DOM's order (overlapping cards
        // at the same depth would flicker, and transparent ones at the same distance swap places from frame to frame).
        const material = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
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
      card.mesh.renderOrder = HAND_ORDER + p.order;
      card.mesh.visible = true;
      this.springs.remember(p.uid, { x: at.x, y: at.y, z: at.z, w: p.w * unit, h: p.h * unit, rot: 0 });
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.propGroup.clear();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.post?.dispose();
    for (const m of this.rimMaterials.values()) m.dispose();
    this.textures.dispose();
    this.grain.dispose();
    this.handFace.dispose();
    for (const g of this.geometries.values()) {
      g.face.dispose();
      g.body.dispose();
      g.rim.dispose();
    }
    this.renderer.dispose();
  }
}
