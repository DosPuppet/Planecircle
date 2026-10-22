/**
 * A planar reflection for the dioramas (PLAN-X's water, PLAN-Y's wet deck): before a mesh is drawn, the camera is
 * mirrored in a horizontal plane and the scene's reflected layer drawn from there into a texture (never the cards:
 * their layer is not in it), its near plane at the surface (Lengyel's oblique projection: nothing under it is
 * reflected). The mesh's shader samples it through `matrix` (world position → texture coordinates).
 */
import {
  HalfFloatType,
  Matrix4,
  type Mesh,
  PerspectiveCamera,
  Plane,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from "three";

/** The layer of what planar reflections draw (a diorama's buildings, its sky, the lights). */
export const REFLECT = 5;

export interface PlanarReflection {
  /** The reflection (null while off). */
  readonly texture: Texture | null;
  /** World position → the reflection's projective texture coordinates. */
  readonly matrix: Matrix4;
  /** On or off; `scale`: its size against the drawing buffer's. */
  set(on: boolean, scale?: number): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);

/** Reflects the scene in the plane y = `height()` for `mesh` (its `onBeforeRender` is taken). */
export function planarReflection(mesh: Mesh, height: () => number): PlanarReflection {
  let target: WebGLRenderTarget | null = null;
  let scale = 0.5;
  const matrix = new Matrix4();
  const mirror = new PerspectiveCamera();
  mirror.layers.set(REFLECT);
  const bias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const plane = new Plane();
  const clip = new Vector4();
  const q = new Vector4();
  const eye = new Vector3();
  const look = new Vector3();
  const up = new Vector3();
  const rotation = new Matrix4();
  const buffer = new Vector2();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (!target || !(camera as PerspectiveCamera).isPerspectiveCamera) return;
    const cam = camera as PerspectiveCamera;
    renderer.getDrawingBufferSize(buffer);
    const w = Math.max(1, Math.round(buffer.x * scale));
    const h = Math.max(1, Math.round(buffer.y * scale));
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    const y = height();
    // Mirror the eye and the point it looks at in the plane.
    eye.setFromMatrixPosition(cam.matrixWorld);
    rotation.extractRotation(cam.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    mirror.position.set(eye.x, 2 * y - eye.y, eye.z);
    up.set(0, 1, 0).applyMatrix4(rotation);
    mirror.up.set(up.x, -up.y, up.z);
    mirror.lookAt(look.x, 2 * y - look.y, look.z);
    mirror.far = cam.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(cam.projectionMatrix);
    matrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    // Oblique near plane (Lengyel).
    plane.set(UP, -y).applyMatrix4(mirror.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = mirror.projectionMatrix.elements;
    q.set(
      (Math.sign(clip.x) + (p[8] as number)) / (p[0] as number),
      (Math.sign(clip.y) + (p[9] as number)) / (p[5] as number),
      -1,
      (1 + (p[10] as number)) / (p[14] as number),
    );
    clip.multiplyScalar(2 / clip.dot(q));
    p[2] = clip.x;
    p[6] = clip.y;
    p[10] = clip.z + 1 - 0.003;
    p[14] = clip.w;
    mesh.visible = false;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    mesh.visible = true;
  };
  return {
    get texture() {
      return target?.texture ?? null;
    },
    matrix,
    set(on: boolean, s = 0.5) {
      scale = s;
      if (on === !!target) return;
      if (on) target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
      else {
        target?.dispose();
        target = null;
      }
    },
    dispose() {
      target?.dispose();
      target = null;
    },
  };
}
