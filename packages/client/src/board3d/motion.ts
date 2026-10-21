/**
 * Card motion on the 3D board (PLAN-W W4): a critically damped spring per card, keyed by its uid, towards the pose the
 * model gives it. A card keeps its uid from zone to zone (hand, battlefield, graveyard), so it flies from where it was
 * to where it goes; a card seen nowhere before starts where `start` says (the stack, above the table). Pure: the scene
 * steps it once a frame while something moves.
 */
import type { CardPose } from "./project";

const KEYS = ["x", "y", "z", "w", "h", "rot"] as const;

/** Stiffness of the springs (1/s²): most of the way in 0.3 s, at rest in under a second. */
export const STIFFNESS = 180;
/** Close enough to stop moving: a fifth of a table pixel, a twentieth of a degree. */
const EPS: CardPose = { x: 2e-3, y: 2e-3, z: 2e-3, w: 2e-3, h: 2e-3, rot: 0.05 };

interface Spring {
  pose: CardPose;
  vel: CardPose;
  target: CardPose;
}

const zero = (): CardPose => ({ x: 0, y: 0, z: 0, w: 0, h: 0, rot: 0 });

/** One step of a critically damped spring (no overshoot), semi-implicit; the time step is split if too long. */
export function stepSpring(s: Spring, dt: number, stiffness = STIFFNESS): boolean {
  const damping = 2 * Math.sqrt(stiffness);
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++)
    for (const k of KEYS) {
      const a = stiffness * (s.target[k] - s.pose[k]) - damping * s.vel[k];
      s.vel[k] += a * h;
      s.pose[k] += s.vel[k] * h;
    }
  // A velocity per second: five times the tolerance still moves less than it in a frame.
  const moving = KEYS.some((k) => Math.abs(s.target[k] - s.pose[k]) > EPS[k] || Math.abs(s.vel[k]) > 5 * EPS[k]);
  if (!moving) s.pose = { ...s.target };
  return moving;
}

export class Springs {
  private springs = new Map<string, Spring>();
  /** Last pose of every card seen, also after it left (to fly back from there). */
  private last = new Map<string, CardPose>();

  /** `speed`: 1 normally, more in fast mode; Infinity jumps at once (reduced motion). */
  constructor(private speed = 1) {}

  /**
   * The cards and where they must go. A new card starts at its last known pose, else at `start(uid, target)` (else at
   * its target); the cards gone are forgotten (their last pose kept).
   */
  setTargets(targets: Map<string, CardPose>, start: (uid: string, target: CardPose) => CardPose | undefined): void {
    for (const [uid, s] of this.springs) {
      if (targets.has(uid)) continue;
      this.last.set(uid, s.pose);
      this.springs.delete(uid);
    }
    for (const [uid, target] of targets) {
      const s = this.springs.get(uid);
      if (s) {
        s.target = { ...target };
        continue;
      }
      const from = this.last.get(uid) ?? start(uid, target) ?? target;
      this.springs.set(uid, { pose: { ...from }, vel: zero(), target: { ...target } });
    }
  }

  /** Remembers where a card was seen outside the springs (the hand, the stack): a card leaving it starts there. */
  remember(uid: string, pose: CardPose): void {
    this.last.set(uid, { ...pose });
  }

  /** Moves every card by `dt` seconds; true while one still moves. */
  step(dt: number): boolean {
    let moving = false;
    for (const s of this.springs.values()) {
      if (this.speed === Number.POSITIVE_INFINITY) s.pose = { ...s.target };
      else moving = stepSpring(s, dt * this.speed) || moving;
    }
    return moving;
  }

  pose(uid: string): CardPose | undefined {
    return this.springs.get(uid)?.pose;
  }
}
