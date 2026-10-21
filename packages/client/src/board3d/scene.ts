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
  PCFShadowMap,
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
import { type Bounds, clearOfRim, outward, propPose } from "./arena";
import type { Arena, ArenaMaterial } from "./assets";
import type { Framing } from "./camera";
import { type Diorama, seasonOf } from "./diorama";
import type { Fx3d } from "./fxmap";
import type { CardNode } from "./model";
import { Springs } from "./motion";
import { FX_COLORS, Particles } from "./particles";
import { Post } from "./post";
import type { CardPose } from "./project";
import { Governor, PRESETS, type Quality } from "./quality";
import { Runes } from "./runes";
import { type Rect, type Table, toWorld } from "./seats";
import { CardTextures, textureKey } from "./textures";

/** Palette of the chosen table texture (`--bd-0` deep, `--bd-1` mid, `--bd-pool` light, styles.css). */
export interface Palette {
  deep: string;
  mid: string;
  pool: string;
}

/** A soft white rounded card, its edges fading (the glow of a card of the hand, tinted by its material). */
function haloTexture(): CanvasTexture {
  const w = 160;
  const h = 206;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.shadowColor = "#fff";
  g.shadowBlur = 16;
  g.shadowOffsetX = w * 3;
  g.fillStyle = "#fff";
  // The bright part reaches a little past the card's edge (the plane is 1.36 cards wide), the blur fades beyond it.
  g.fillRect(-w * 3 + w * 0.105, h * 0.085, w * 0.79, h * 0.83);
  return new CanvasTexture(c);
}

/** Margin of a card's contact shadow, in card widths. */
const SHADE = 0.12;

/** A soft dark rounded card (the contact shadow): a blurred shadow drawn off the canvas, only the shadow showing. */
function shadeTexture(): CanvasTexture {
  const w = 128;
  const h = 154;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.shadowColor = "#000";
  g.shadowBlur = 16;
  g.shadowOffsetX = w * 3;
  g.fillStyle = "#000";
  g.fillRect(-w * 3 + w * 0.12, h * 0.1, w * 0.76, h * 0.8);
  return new CanvasTexture(c);
}

/** Width of a card's glow rim, in card widths. */
const RIM = 0.045;
/** A glow rim shines above the bloom's threshold (its color times this). */
const RIM_GLOW = 0.9;

/** Flames that cast shadows at the highest quality. */
const FLAME_SHADOWS = 3;

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
  // The contact shadow: a soft dark card on the table under it, larger (W6).
  const shade = new PlaneGeometry(1 + 2 * SHADE, ratio + 2 * SHADE);
  shade.rotateX(-Math.PI / 2);
  // The glow rim: a slightly larger card under the face, showing only around it (W6).
  const rim = new ShapeGeometry(roundedRect(1 + 2 * RIM, ratio + 2 * RIM, 0.06 + RIM), 6);
  rim.rotateX(-Math.PI / 2);
  rim.translate(0, -0.0005, 0);
  return { face, body, rim, shade };
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
  /** A diorama built in code (PLAN-X), in place of the tavern's props. */
  private diorama: Diorama | null = null;
  private propGroup = new Group();
  private rim: Bounds | null = null;
  private cardGroup = new Group();
  private cards = new Map<string, { group: Group; face: Mesh; body: Mesh; rim: Mesh | null; shade: Mesh; key: string }>();
  private shadeMap = shadeTexture();
  private geometries = new Map<number, ReturnType<typeof cardGeometries>>();
  private springs: Springs;
  private target = new Vector3();
  /** The hand: whole cards facing the camera, where the DOM hand lays them (`handSource`, read each frame). */
  private handGroup = new Group();
  /** The hand has a scene of its own, drawn after the post-processing: its cards keep their colors (no tone mapping). */
  private handScene = new Scene();
  private hand = new Map<string, { mesh: Mesh; halo: Mesh; shine: Mesh; key: string }>();
  /** The glow of a card of the hand (W6): a halo just behind it, in the hand's order (the next card covers it). */
  private haloMap = haloTexture();
  private haloFace = new PlaneGeometry(1.36, CARD_RATIO * 1.28);
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
  /**
   * The fire of a big fireplace, off the table on the left (with the arena): a warm, low light that casts the long
   * shadows of the props and wavers. Between two moves the board draws only for it, at most 20 frames a second.
   */
  private fire = new PointLight("#ff8a3c", 0, 0, 2);
  private fireBase = 0;
  private ambientTimer = 0;
  /** Frames drawn (dev checks). */
  renders = 0;
  /** Effects (W7): particles, the effects waiting for their time, the light of a turn's sweep. */
  private particles = new Particles();
  private runes = new Runes();
  private fxQueue: { at: number; fx: Fx3d; where?: Vector3 }[] = [];
  private seats = new Map<string, { x: number; z: number; w: number; mine: boolean }>();
  private sweepLight = new PointLight("#ffd9a0", 0, 0, 2);
  private sweep: { start: number; from: number; to: number; z: number } | null = null;
  private speed: number;
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
    /** The quality drawn, at the start and whenever the governor steps it down (shown in the Graphics setting). */
    private onQuality: (q: Quality) => void = () => {},
    /** Automatic quality: the governor steps it down on slow frames; chosen by hand, it stays. */
    private auto = true,
  ) {
    this.springs = new Springs(speed);
    this.speed = speed;
    this.handFace = new ShapeGeometry(roundedRect(1, CARD_RATIO, 0.045), 6);
    cardUvs(this.handFace, CARD_RATIO);
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // Shadows drawn again only when something moves (`needsUpdate`), soft.
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures = new CardTextures(TEXTURE_BUDGET, anisotropy, () => this.requestRender());
    this.ground.map = this.grain;
    this.mat.map = this.grain;
    const ground = new Mesh(new PlaneGeometry(80, 80), this.ground);
    ground.rotateX(-Math.PI / 2);
    ground.position.y = -0.02;
    this.ground.userData.size = 80;
    this.scene.add(
      ground,
      this.tableGroup,
      this.propGroup,
      this.cardGroup,
      this.particles.mesh,
      this.runes.group,
      this.sweepLight,
    );
    this.handScene.add(this.handGroup);
    // Light: a key light from the viewer's left, a soft fill from the sky, a pool of the texture's light over the middle.
    this.key.position.set(-6, 14, 9);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    // A point light: its shadows fall all around it (six directions), on the props in the corners as on the cards.
    this.fire.shadow.bias = -0.002;
    this.fire.shadow.normalBias = 0.03;
    this.fire.shadow.camera.near = 0.5;
    this.fire.shadow.camera.far = 70;
    this.scene.add(this.key, this.key.target, this.fire, new AmbientLight("#ffffff", 0.18), this.hemi, this.pool);
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

  /** The arena is drawn (dev checks): the tavern's props, or a diorama. */
  get arenaShown(): boolean {
    return !!this.arena && (!!this.diorama || this.propGroup.children.length > 0);
  }

  /** The diorama drawn, by name (dev checks). */
  get dioramaShown(): string | null {
    return this.diorama ? (this.arena?.manifest.diorama ?? null) : null;
  }

  /** Card images asked for and settled (arrived or failed): the loading screen waits for them. */
  get cardImages(): { started: number; settled: number } {
    return { started: this.textures.started, settled: this.textures.settled };
  }

  /** Particles alive (dev checks). */
  get particlesAlive(): number {
    return this.particles.count;
  }

  /** A quality chosen in the Graphics setting: a level by hand (it stays), or automatic from `level`. */
  setQuality(level: Quality, auto: boolean): void {
    this.auto = auto;
    if (this.governor.level === level) return;
    this.governor.level = level;
    this.applyQuality(level);
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
    // The fire casts the shadows when it burns (the arena), else the key light.
    const caster = this.fireBase > 0 ? this.fire : this.key;
    this.key.castShadow = shadows && caster === this.key;
    this.fire.castShadow = shadows && caster === this.fire;
    // A point light's shadows are six maps: half the size of the preset's.
    const size = caster === this.fire ? p.shadows / 2 : p.shadows;
    if (shadows && caster.shadow.mapSize.x !== size) {
      caster.shadow.mapSize.set(size, size);
      caster.shadow.map?.dispose();
      caster.shadow.map = null;
    }
    this.onQuality(q);
    this.flameShadows();
    this.diorama?.setQuality(q);
    this.post?.dispose();
    this.post = p.bloom ? new Post(this.renderer, this.scene, this.camera, p.samples) : null;
    this.post?.setSize(this.viewport.w, this.viewport.h, this.renderer.getPixelRatio());
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  /**
   * At the highest quality, the largest flames cast shadows too (each in six directions: the three tallest only, on
   * small maps): every object on the table then has the shadows of the lights around it.
   */
  private flameShadows() {
    const on = this.renderer.shadowMap.enabled && this.governor.level === "high";
    const tallest = [...this.flames].sort((a, b) => b.position.y - a.position.y).slice(0, FLAME_SHADOWS);
    for (const f of this.flames) {
      f.castShadow = on && tallest.includes(f);
      if (!f.castShadow) continue;
      f.shadow.mapSize.set(512, 512);
      f.shadow.bias = -0.003;
      f.shadow.normalBias = 0.02;
      f.shadow.camera.near = 0.1;
      f.shadow.camera.far = 40;
    }
    this.renderer.shadowMap.needsUpdate = true;
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
    if (this.auto) this.governor.frame(ms, this.continued);
    const dt = Math.min(0.05, ms / 1000);
    this.last = now;
    const moving = this.springs.step(dt);
    for (const [uid, card] of this.cards) {
      const p = this.springs.pose(uid);
      if (p) this.place(card, p);
    }
    // A card in flight moves its shadow; still, the shadow map stays as it is.
    if (moving) this.renderer.shadowMap.needsUpdate = true;
    // Particles go by the real time (a slow device must not make them last longer), within reason.
    const effects = this.runEffects(now, Math.min(0.25, ms / 1000));
    this.syncHand();
    this.flicker(now);
    this.diorama?.update(dt, now / 1000);
    this.renders++;
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.hand.size) {
      this.renderer.autoClear = false;
      this.renderer.render(this.handScene, this.camera);
      this.renderer.autoClear = true;
    }
    // Animation frames follow each other (the governor judges them, and a diorama at the full rate); between them,
    // the fire or a diorama held to a lower rate, by a timer.
    const ambient = this.ambientFps();
    this.continued = moving || effects || now < this.liveUntil || ambient >= 50;
    if (this.continued) this.frame = requestAnimationFrame(this.tick);
    else if (ambient > 0 && !this.ambientTimer)
      this.ambientTimer = window.setTimeout(() => {
        this.ambientTimer = 0;
        this.requestRender();
      }, 1000 / ambient);
  };

  /** Frames a second the board keeps drawing between moves: a diorama's rate, the fire's 20, or none. */
  private ambientFps(): number {
    if (this.speed !== 1) return 0;
    return Math.max(this.diorama?.fps(this.governor.level) ?? 0, this.wavering ? 20 : 0);
  }

  /**
   * The fire wavers: with the arena, above the lowest quality, at the normal pace (not with reduced motion, nor in the
   * fast test mode: the interface tests draw in software, where every frame is slow).
   */
  private get wavering(): boolean {
    return this.fireBase > 0 && this.governor.level !== "low" && this.speed === 1;
  }

  /**
   * The effects (W7), each at its time, on its card (its current place) or its player's side (the seat's middle):
   * particles, a jolt, a light sweeping the table. True while one is still going.
   */
  play(list: Fx3d[]): void {
    // Reduced motion: no effect (the DOM's numbers stay).
    if (this.speed === Number.POSITIVE_INFINITY) return;
    const now = performance.now();
    for (const fx of list) {
      // A card that is leaving (a creature dying, one hit and destroyed) is found now, where it still lies.
      const p = fx.uid ? this.springs.pose(fx.uid) : undefined;
      const where = p ? new Vector3(p.x, p.y + 0.05, p.z) : undefined;
      this.fxQueue.push({ at: now + (fx.delay * 1000) / this.speed, fx, where });
    }
    this.requestRender();
  }

  private runEffects(now: number, dt: number): boolean {
    const due = this.fxQueue.filter((q) => q.at <= now);
    this.fxQueue = this.fxQueue.filter((q) => q.at > now);
    // A card that has just come (a permanent entering, a token) is on the table a frame or two after its update: its
    // effect waits for it a little.
    for (const q of due) if (!this.emit(q.fx, q.where) && now - q.at < 600) this.fxQueue.push(q);
    let sweeping = false;
    if (this.sweep) {
      const t = (now - this.sweep.start) / (1100 / this.speed);
      if (t >= 1) {
        this.sweep = null;
        this.sweepLight.intensity = 0;
      } else {
        sweeping = true;
        this.sweepLight.position.set(this.sweep.from + (this.sweep.to - this.sweep.from) * t, 1.4, this.sweep.z);
        this.sweepLight.intensity = 9 * Math.sin(Math.PI * t);
      }
    }
    const runes = this.runes.step(dt);
    return this.particles.step(dt) || runes || this.fxQueue.length > 0 || sweeping;
  }

  /**
   * One effect: where it happens (the card now, else its place when it was asked, else its player's side). False when
   * that place is not known yet (a card not on the table yet).
   */
  private emit(fx: Fx3d, asked?: Vector3): boolean {
    // A card arriving (a summoning, a token, a land) at its place on the table; any other where it is now.
    const arriving = fx.kind === "spawn" || fx.kind === "dust" || fx.rune === "summon";
    const pose = fx.uid ? (arriving ? this.springs.target(fx.uid) : this.springs.pose(fx.uid)) : undefined;
    const card = asked ?? (pose ? new Vector3(pose.x, pose.y + 0.05, pose.z) : undefined);
    const seat = fx.player ? this.seats.get(fx.player) : undefined;
    const side = seat ? new Vector3(seat.x, 0.1, seat.z) : undefined;
    const colors = (keys: string[]) => keys.map((k) => FX_COLORS[k] ?? (FX_COLORS.C as Color));
    const amount = Math.min(10, fx.amount ?? 1);
    switch (fx.kind) {
      case "burst":
        if (!card) return false;
        this.particles.emit({
          at: card,
          count: 24 + amount * 6,
          colors: colors(["damage", "R", "clash"]),
          speed: [1.5, 3.5],
          up: 0.55,
          life: [0.35, 0.7],
          size: [0.1, 0.24],
          gravity: 6,
        });
        if (fx.uid) this.springs.kick(fx.uid, 0.12 + 0.02 * amount);
        return true;
      case "heal":
        if (!side) return false;
        this.particles.emit({
          at: side,
          count: 30 + amount * 4,
          colors: colors(["heal", "G"]),
          speed: [0.2, 0.6],
          up: 0.95,
          life: [0.9, 1.5],
          size: [0.1, 0.2],
          gravity: -1.2,
          ring: Math.min(2.5, (seat?.w ?? 4) * 0.15),
        });
        return true;
      case "embers":
        if (!card) return false;
        this.particles.emit({
          at: card,
          count: 50,
          colors: colors(["embers", "R"]),
          speed: [0.4, 1.4],
          up: 0.8,
          life: [0.8, 1.4],
          size: [0.08, 0.18],
          gravity: -1,
        });
        return true;
      case "rune": {
        // The colors of the magic mixed into the circle's (and its light's) color.
        const mix = new Color(0, 0, 0);
        for (const c of colors(fx.colors ?? ["C"])) mix.add(c);
        mix.multiplyScalar(1 / Math.max(1, fx.colors?.length ?? 1));
        const w = pose ? Math.max(pose.w, pose.h) : 1.2;
        if (fx.rune === "spell" && side) this.runes.cast(side, mix, 1.7, 1.9 / this.speed);
        else if (fx.rune === "summon" && card) this.runes.cast(card, mix, w * 0.85, 1.6 / this.speed);
        else if (fx.rune === "ability" && card) this.runes.cast(card, mix, w * 0.6, 1.1 / this.speed, 0.7);
        else return false;
        return true;
      }
      case "spawn":
        if (!card) return false;
        this.particles.emit({
          at: card,
          count: 36,
          colors: colors(fx.colors ?? ["C"]),
          speed: [1, 1.6],
          up: 0.2,
          life: [0.4, 0.7],
          size: [0.1, 0.2],
          gravity: 0,
          ring: 0.6,
        });
        return true;
      case "dust":
        if (!card) return false;
        this.particles.emit({
          at: card,
          count: 26,
          colors: colors(["dust"]),
          speed: [0.6, 1.2],
          up: 0.15,
          life: [0.4, 0.8],
          size: [0.15, 0.3],
          gravity: 0.5,
          ring: 0.4,
        });
        return true;
      case "clash":
        if (!card) return false;
        this.particles.emit({
          at: card,
          count: 40,
          colors: colors(["clash", "W"]),
          speed: [2, 4],
          up: 0.4,
          life: [0.25, 0.5],
          size: [0.06, 0.14],
          gravity: 4,
        });
        return true;
      case "sparkle":
        if (!card) return false;
        this.particles.emit({
          at: card,
          count: 14 + amount * 6,
          colors: colors(["counters", "G"]),
          speed: [0.3, 0.8],
          up: 0.9,
          life: [0.6, 1],
          size: [0.08, 0.16],
          gravity: -0.5,
        });
        return true;
      case "sweep":
        if (!seat) return false;
        // From the side the player sits on, across their half of the table.
        this.sweepLight.color.set(seat.mine ? "#ffd9a0" : "#ffb0a0");
        this.sweep = { start: performance.now(), from: seat.x - seat.w / 2, to: seat.x + seat.w / 2, z: seat.z };
        return true;
    }
  }

  /** The flames waver, and the fireplace's fire (its strength and a little its color; never its place: its shadows stay). */
  private flicker(now: number) {
    const t = now / 1000;
    if (this.fireBase > 0) {
      const n =
        0.4 * Math.sin(t * 2.3) + 0.3 * Math.sin(t * 5.7 + 1.3) + 0.2 * Math.sin(t * 11.3 + 0.4) + 0.1 * Math.sin(t * 17.9);
      const still = !this.wavering;
      this.fire.intensity = this.fireBase * (still ? 1 : 0.82 + 0.18 * n);
      this.fire.color.setRGB(1, still ? 0.54 : 0.5 + 0.08 * n, still ? 0.24 : 0.2 + 0.06 * n);
    }
    this.flames.forEach((f, i) => {
      const n = 0.5 * Math.sin(t * 13.1 + i * 1.7) + 0.3 * Math.sin(t * 7.3 + i * 4.1) + 0.2 * Math.sin(t * 23.7 + i);
      f.intensity = (f.userData.base as number) * (0.88 + 0.12 * n);
    });
  }

  private place(card: { group: Group; shade: Mesh }, p: CardPose) {
    card.group.position.set(p.x, p.y, p.z);
    card.group.rotation.y = (-p.rot * Math.PI) / 180;
    card.group.scale.set(p.w, 1, p.w);
    // Its shadow on the table, cast away from the fire (on the left): wider and fainter as the card rises.
    const lift = Math.max(0, p.y);
    card.shade.position.set((0.05 + lift * 0.35) / p.w, 0.0006 - p.y, (lift * 0.15) / p.w);
    card.shade.scale.setScalar(1 + lift * 0.35);
    (card.shade.material as MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - lift / 3);
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
    this.seats.clear();
    for (const seat of table.seats) {
      const z = box(seat.zone, 6);
      this.seats.set(seat.player, { x: z.x, z: z.z, w: z.w, mine: seat.mine });
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
      m.castShadow = true;
      m.userData.rim = true;
      m.visible = !this.diorama;
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
    this.placeFire();
    if (this.rim) this.diorama?.layout(this.rim);
    this.renderer.shadowMap.needsUpdate = true;
    this.placeProps();
    // The pool's light falls off with the square of its height: the same light on the table whatever its size.
    const lift = Math.max(outer.w, outer.h) * 0.45;
    this.pool.position.set(0, lift, 0);
    this.pool.intensity = 1.1 * lift * lift;
    this.requestRender();
  }

  /** The fireplace off the table's left side, low, its light across the table (its strength grows with its distance). */
  // (Its light is a point light: see the constructor.)
  private placeFire() {
    const rim = this.rim;
    if (!rim) return;
    const midX = (rim.x0 + rim.x1) / 2;
    const midZ = (rim.z0 + rim.z1) / 2;
    this.fire.position.set(rim.x0 - 7, 4.5, midZ - 2);
    const d = this.fire.position.distanceTo(new Vector3(midX, 0, midZ));
    // The tavern's fire; a diorama has its own lights.
    this.fireBase = this.arena && !this.diorama ? 3 * d * d : 0;
    this.fire.intensity = this.fireBase;
  }

  /**
   * The arena (null: the plain table): its HDRI lights the scene and shows in reflections, its wood covers the table,
   * its leather and carved wood the mats and the rim, its props stand around the rim; or a diorama built in code.
   */
  async setArena(arena: Arena | null): Promise<void> {
    // A diorama (PLAN-X): its code, its ground and its lights in place of the tavern's.
    if (arena?.manifest.diorama) {
      await this.setDiorama(arena);
      return;
    }
    this.arena = arena;
    // The fireplace lights the arena: the pool over the middle goes (once, while the loading screen still covers the
    // board: the materials are compiled again for one light less, and every light costs on every pixel).
    this.pool.visible = !arena;
    // A room lit by its fire: the light from above only fills.
    this.key.intensity = arena ? 0.8 : 1.5;
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
    this.placeFire();
    this.applyQuality(this.governor.level);
  }

  /**
   * The shrine's diorama (PLAN-X): its code loaded (a chunk of its own), built around the table; the tavern's ground,
   * rim, fire and pool give way to it. Done while the loading screen covers the board (its lights compile once).
   */
  private async setDiorama(arena: Arena) {
    const { createShrine } = await import("./shrine/shrine");
    this.arena = arena;
    this.pool.visible = false;
    this.ground.visible = false;
    for (const child of this.tableGroup.children) if (child.userData.rim) child.visible = false;
    this.scene.environment = arena.environment;
    this.scene.environmentIntensity = 0.35;
    this.diorama = createShrine({
      scene: this.scene,
      renderer: this.renderer,
      camera: this.camera,
      key: this.key,
      hemi: this.hemi,
      arena,
      quality: this.governor.level,
      season: seasonOf(new Date()),
    });
    this.scene.add(this.diorama.group);
    if (this.rim) this.diorama.layout(this.rim);
    this.applyQuality(this.governor.level);
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
    const scale = arena.manifest.metersToWorld ?? 12;
    for (const p of arena.manifest.props ?? []) {
      const model = arena.models.get(p.model);
      if (!model) continue;
      const pose = propPose(p, rim);
      const prop = new Group();
      prop.add(model.clone(true));
      prop.rotation.y = pose.turn;
      // One scale for every prop: their models are in meters, their proportions stay those of life.
      prop.scale.setScalar(scale);
      prop.updateMatrixWorld(true);
      box.setFromObject(prop);
      // Its base on the table, its middle at its place; then pushed outward until it is clear of the battlefields.
      prop.position.set(pose.x - (box.min.x + box.max.x) / 2, -0.02 - box.min.y, pose.z - (box.min.z + box.max.z) / 2);
      const [ox, oz] = outward(p.anchor);
      for (let step = 0; step < 80; step++) {
        prop.updateMatrixWorld(true);
        box.setFromObject(prop);
        if (clearOfRim({ x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }, rim)) break;
        prop.position.x += ox * 0.25;
        prop.position.z += oz * 0.25;
      }
      if (p.light) {
        // A flame at its top; the higher it stands, the stronger, to light the table as a candle does.
        const lift = box.max.y;
        const flame = new PointLight("#ffb265", 1.6 * Math.max(1, lift) ** 2, 0, 2);
        flame.position.set((box.min.x + box.max.x) / 2, lift + 0.15, (box.min.z + box.max.z) / 2);
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
    this.flameShadows();
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
        const shadeMaterial = new MeshBasicMaterial({ map: this.shadeMap, transparent: true, depthWrite: false, opacity: 0.5 });
        shadeMaterial.toneMapped = false;
        const shade = new Mesh(g.shade, shadeMaterial);
        shade.renderOrder = 1;
        const group = new Group();
        group.add(face, body, shade);
        this.cardGroup.add(group);
        card = { group, face, body, rim: null, shade, key: "" };
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
      (card.shade.material as MeshBasicMaterial).dispose();
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
  setHand(
    cards: { uid: string; face: CardFace; obj?: ObjectView; glow?: string | null }[],
    lang: Lang,
    source: () => HandPose[],
  ): void {
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
        // Blended over the table (not added to it): its color stays the glow's on the warm wood.
        const haloMaterial = new MeshBasicMaterial({
          map: this.haloMap,
          alphaMap: this.haloMap,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        haloMaterial.toneMapped = false;
        // And a light added on top of it: the halo shines on the dark mats as on the wood.
        const shineMaterial = new MeshBasicMaterial({
          map: this.haloMap,
          transparent: true,
          blending: AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        });
        shineMaterial.toneMapped = false;
        card = {
          mesh: new Mesh(this.handFace, material),
          halo: new Mesh(this.haloFace, haloMaterial),
          shine: new Mesh(this.haloFace, shineMaterial),
          key: "",
        };
        card.mesh.visible = false;
        card.halo.visible = false;
        card.shine.visible = false;
        this.handGroup.add(card.halo, card.shine, card.mesh);
        this.hand.set(c.uid, card);
      }
      const glow = this.glowColors[c.glow ?? ""] ?? "#000000";
      (card.halo.material as MeshBasicMaterial).color.set(glow);
      (card.shine.material as MeshBasicMaterial).color.set(glow).multiplyScalar(0.55);
      card.halo.userData.on = !!c.glow;
      if (card.key !== key) {
        const material = card.mesh.material as MeshBasicMaterial;
        material.map = this.textures.get(c.face, c.obj, lang, pinned, "full");
        material.needsUpdate = true;
        card.key = key;
      }
    }
    for (const [uid, card] of this.hand) {
      if (seen.has(uid)) continue;
      this.handGroup.remove(card.mesh, card.halo, card.shine);
      (card.mesh.material as MeshBasicMaterial).dispose();
      (card.halo.material as MeshBasicMaterial).dispose();
      (card.shine.material as MeshBasicMaterial).dispose();
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
      // Each card above its own halo, under the next card (and its halo).
      card.mesh.renderOrder = HAND_ORDER + 2 * p.order;
      card.mesh.visible = true;
      card.halo.position.copy(card.mesh.position);
      card.halo.quaternion.copy(card.mesh.quaternion);
      card.halo.scale.copy(card.mesh.scale);
      card.halo.renderOrder = HAND_ORDER + 2 * p.order - 1;
      card.halo.visible = card.halo.userData.on === true;
      card.shine.position.copy(card.mesh.position);
      card.shine.quaternion.copy(card.mesh.quaternion);
      card.shine.scale.copy(card.mesh.scale);
      card.shine.renderOrder = HAND_ORDER + 2 * p.order - 0.5;
      card.shine.visible = card.halo.visible;
      this.springs.remember(p.uid, { x: at.x, y: at.y, z: at.z, w: p.w * unit, h: p.h * unit, rot: 0 });
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.ambientTimer);
    this.propGroup.clear();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.post?.dispose();
    this.diorama?.dispose();
    this.particles.dispose();
    this.runes.dispose();
    for (const m of this.rimMaterials.values()) m.dispose();
    this.textures.dispose();
    this.grain.dispose();
    this.shadeMap.dispose();
    this.haloMap.dispose();
    this.haloFace.dispose();
    this.handFace.dispose();
    for (const g of this.geometries.values()) {
      g.face.dispose();
      g.body.dispose();
      g.rim.dispose();
      g.shade.dispose();
    }
    this.renderer.dispose();
  }
}
