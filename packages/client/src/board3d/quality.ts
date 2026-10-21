/**
 * Quality of the 3D board (PLAN-W W6): three presets, and a governor that steps down when the frames are too slow
 * (it never steps up again in the session: a board that stutters once would stutter again). Pure.
 */

export type Quality = "high" | "medium" | "low";

export interface Preset {
  /** Most device pixels per CSS pixel. */
  dpr: number;
  /** Size of the shadow map (0: no shadows). */
  shadows: number;
  /** Bloom (glows and flames), drawn at half resolution. */
  bloom: boolean;
  /** Multisampling of the composed image (0: none; the renderer's own antialiasing without bloom). */
  samples: number;
}

export const PRESETS: Record<Quality, Preset> = {
  high: { dpr: 1.5, shadows: 2048, bloom: true, samples: 4 },
  medium: { dpr: 1.25, shadows: 1024, bloom: true, samples: 0 },
  low: { dpr: 1, shadows: 0, bloom: false, samples: 0 },
};

const ORDER: Quality[] = ["high", "medium", "low"];

/** The next level down, or null at the lowest. */
export function lower(q: Quality): Quality | null {
  return ORDER[ORDER.indexOf(q) + 1] ?? null;
}

/** Too slow: the median frame of the window above this (ms), that is under about 45 frames per second. */
export const SLOW_MS = 22;
/** Frames measured before judging (about two seconds of animation). */
export const WINDOW = 90;

/**
 * Watches the frames drawn back to back (an animation: a card flying, the hand moving) and steps the quality down when
 * their median is too slow. A frame after a pause is not counted (its time includes the pause).
 */
export class Governor {
  private frames: number[] = [];

  constructor(
    public level: Quality,
    private onChange: (q: Quality) => void,
  ) {}

  /** A frame drawn `ms` after the previous one, which was drawn too (`continued`). */
  frame(ms: number, continued: boolean): void {
    if (!continued) return;
    this.frames.push(ms);
    if (this.frames.length < WINDOW) return;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] as number;
    this.frames = [];
    const next = median > SLOW_MS ? lower(this.level) : null;
    if (!next) return;
    this.level = next;
    this.onChange(next);
  }
}
