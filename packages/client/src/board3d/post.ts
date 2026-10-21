/**
 * Post-processing of the 3D board (PLAN-W W6): bloom on what shines (the glow rims of the cards, the flames), at half
 * resolution, then the tone mapping and the sRGB output (OutputPass). Only with a preset that has bloom; otherwise the
 * renderer draws straight to the screen.
 */
import { HalfFloatType, type PerspectiveCamera, type Scene, Vector2, type WebGLRenderer, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** Only what is brighter than the lit table blooms: emissive rims and flames (linear luminance). */
const THRESHOLD = 1;
const STRENGTH = 0.24;
const RADIUS = 0.22;

export class Post {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, samples: number) {
    const size = renderer.getDrawingBufferSize(new Vector2());
    const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(size.x / 2, size.y / 2), STRENGTH, RADIUS, THRESHOLD);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Size of the drawing (CSS px; the renderer's pixel ratio applies). */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.bloom.resolution.set((width * pixelRatio) / 2, (height * pixelRatio) / 2);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
