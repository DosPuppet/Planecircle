/**
 * Sound effects (Web Audio): recorded samples (decoded and cached buffers, randomly drawn variants, slight pitch
 * variation) and synthesized cues (synth.ts, a chunk loaded on demand); safeguards against cacophony.
 * Sound must never break a game: any error (file, decoding, refused context) is ignored.
 */
import { create } from "zustand";
import { SOUND_FILES, SOUNDS, type SoundDef, type SoundKey } from "./sounds";

const BASE = `${import.meta.env.BASE_URL}sounds/`;
/** Minimum gap between two plays of the same sound. */
const MIN_GAP_MS = 60;
const MAX_VOICES = 8;
const STORAGE_KEY = "planecircle.audio";

// ---------------------------------------------------------------------------
// Settings (preference specific to this browser)
// ---------------------------------------------------------------------------

interface AudioSettings {
  volume: number;
  muted: boolean;
}

function loadSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<AudioSettings> | null;
    return {
      volume: typeof raw?.volume === "number" ? Math.min(1, Math.max(0, raw.volume)) : 0.7,
      muted: raw?.muted === true,
    };
  } catch {
    return { volume: 0.7, muted: false };
  }
}

export const useAudio = create<AudioSettings & { setVolume(v: number): void; toggleMute(): void }>((set, get) => {
  const save = () => {
    try {
      const { volume, muted } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }));
    } catch {
      // storage unavailable (private browsing…): setting not kept
    }
  };
  return {
    ...loadSettings(),
    setVolume(volume) {
      set({ volume, muted: volume === 0 ? get().muted : false });
      save();
    },
    toggleMute() {
      set({ muted: !get().muted });
      save();
    },
  };
});

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundKey, number>();
let voices = 0;

/** Log of the sounds played (dev mode): checked by the Playwright tests. */
const devLog: string[] | null = import.meta.env.DEV ? [] : null;
if (devLog) (window as unknown as { __sfxLog: string[] }).__sfxLog = devLog;

function context(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  } catch {
    ctx = null;
  }
  return ctx;
}

function applyVolume(): void {
  const { volume, muted } = useAudio.getState();
  if (master) master.gain.value = muted ? 0 : volume;
}
useAudio.subscribe(applyVolume);

function load(file: string): Promise<AudioBuffer | null> {
  let p = buffers.get(file);
  if (!p) {
    const c = context();
    p = c
      ? fetch(BASE + file)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
          .then((data) => c.decodeAudioData(data))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(file, p);
  }
  return p;
}

/**
 * Browsers block sound until the user has interacted with the page:
 * the context is resumed on the first gesture (called by the listeners of main.tsx).
 */
export function unlockAudio(): void {
  const c = context();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

let synthModule: Promise<typeof import("./synth") | null> | null = null;
/** The synthesizer, loaded once (its own chunk). */
const synth = () => {
  synthModule ??= import("./synth").catch(() => null);
  return synthModule;
};

/** Loads every sound in advance (start of the game), so that they play without latency. */
export function preloadSounds(): void {
  for (const f of SOUND_FILES) void load(f);
  void synth();
}

export function playSound(key: SoundKey, opts: { delay?: number; gain?: number } = {}): void {
  const { muted, volume } = useAudio.getState();
  if (muted || volume === 0) return;
  const c = context();
  if (!c) return;
  const now = performance.now() + (opts.delay ?? 0) * 1000;
  if (now - (lastPlayed.get(key) ?? Number.NEGATIVE_INFINITY) < MIN_GAP_MS) return;
  lastPlayed.set(key, now);
  const def: SoundDef = SOUNDS[key];
  devLog?.push(key);
  const startAt = () => c.currentTime + Math.max(0, (now - performance.now()) / 1000);
  if ("synth" in def) {
    void synth().then((m) => {
      if (!m || !master) return;
      try {
        m.playSynth(c, master, def.synth, startAt(), def.volume * (opts.gain ?? 1));
      } catch {
        // playback impossible: carry on without sound
      }
    });
    return;
  }
  const file = def.files[Math.floor(Math.random() * def.files.length)] as string;
  void load(file).then((buffer) => {
    if (!buffer || !master || voices >= MAX_VOICES) return;
    try {
      const src = c.createBufferSource();
      src.buffer = buffer;
      if (!def.steady) src.playbackRate.value = 0.95 + Math.random() * 0.1;
      const gain = c.createGain();
      gain.gain.value = Math.min(1, def.volume * (opts.gain ?? 1));
      src.connect(gain).connect(master);
      voices += 1;
      src.onended = () => {
        voices -= 1;
      };
      src.start(startAt());
    } catch {
      // playback impossible: carry on without sound
    }
  });
}
