/**
 * Engine events → sound effects (pure function, tested): which sound, and when.
 * The delays follow those of the visual effects of playEffects (store.ts): a step of 0.22 s per damage,
 * life gain or death, so that the hit is heard when the flash shows.
 */
import type { CardFace, GameEvent, GameView } from "@mtgx/engine";
import type { SoundKey } from "./sounds";

export interface Cue {
  key: SoundKey;
  /** Seconds after the update is received. */
  delay: number;
  /** Volume multiplier (stacks of grouped sounds: a little louder). */
  gain: number;
}

const STEP = 0.22;
const MAX_DELAY = 2.2;
/** Beyond this, a series of the same sound (12 tokens dying) is played only once, louder. */
const MAX_REPEAT = 3;

const PERMANENT_TYPES = /\b(Creature|Artifact|Enchantment|Planeswalker|Battle|Land)\b/;

export function soundsFor(events: GameEvent[], view: GameView, prev: GameView | null, faces: Record<string, CardFace>): Cue[] {
  const cues: Cue[] = [];
  let step = 0;
  const at = () => Math.min(step * STEP, MAX_DELAY);
  const add = (key: SoundKey) => cues.push({ key, delay: at(), gain: 1 });
  // The sounds tied to a visual effect move one step forward, like playEffects.
  const addStep = (key: SoundKey) => {
    add(key);
    step += 1;
  };
  const me = view.viewer;

  for (const e of events) {
    switch (e.type) {
      case "gameStart":
        add("shuffle");
        break;
      case "mulligan":
        if (e.player === me) add("shuffle");
        break;
      case "turnStart":
        if (e.player === me) add("turn");
        break;
      case "draw":
        if (e.player === me) add("draw");
        break;
      case "playLand":
        add("land");
        break;
      case "cast":
      case "copy":
        add("cast");
        add(castColor(faces[e.defId]));
        break;
      case "activate":
      case "trigger":
        add("ability");
        break;
      case "resolve": {
        // Only a permanent spell "lands": the other spells are heard through their effects.
        const item = prev?.stack.find((i) => i.id === e.stackId);
        const face = faces[e.defId];
        const permanent = face && PERMANENT_TYPES.test(face.typeLine) && !/\b(Instant|Sorcery)\b/.test(face.typeLine);
        if (item?.kind === "spell" && permanent) add("resolve");
        break;
      }
      case "countered":
      case "fizzle":
        add("counter");
        break;
      case "attack":
        if (e.attackers.length) add("attack");
        break;
      case "block":
        if (e.blocks.length) add("block");
        break;
      case "damage":
        // Damage to players: heard through the "life" event that follows.
        if (e.targetDefId && e.amount > 0) addStep(e.amount >= 5 ? "hitHeavy" : "hit");
        break;
      case "life":
        if (e.delta < 0) addStep("hitHeavy");
        else if (e.delta > 0) addStep("heal");
        break;
      case "dies":
        addStep("dies");
        break;
      case "token":
        add("token");
        break;
      case "attach":
        add("attach");
        break;
      case "poison":
        add("poison");
        break;
      case "moved":
        if (e.to === "command") add("command");
        break;
      case "gameOver":
        add(e.winner === me ? "win" : "lose");
        break;
    }
  }

  // Your lands that were just tapped (mana payment): no engine event, the views are compared.
  if (prev) {
    const wasUntapped = new Set(prev.battlefield.filter((o) => !o.tapped).map((o) => o.id));
    const tapped = view.battlefield.filter(
      (o) => o.controller === me && o.tapped && o.types.includes("Land") && wasUntapped.has(o.id),
    );
    if (tapped.length) cues.unshift({ key: "tap", delay: 0, gain: 1 });
  }

  return collapse(cues);
}

/** The cue of a spell's colors, read in its mana cost (hybrid symbols included): one color, several, or none. */
export function castColor(face: CardFace | undefined): SoundKey {
  const colors = new Set((face?.manaCost ?? "").match(/[WUBRG]/g) ?? []);
  if (colors.size > 1) return "castM";
  const [c] = [...colors];
  return c ? (`cast${c}` as SoundKey) : "castC";
}

/** A series of more than MAX_REPEAT identical sounds becomes a single sound, a little louder. */
function collapse(cues: Cue[]): Cue[] {
  const counts = new Map<SoundKey, number>();
  for (const c of cues) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  const seen = new Set<SoundKey>();
  const out: Cue[] = [];
  for (const c of cues) {
    if ((counts.get(c.key) ?? 0) <= MAX_REPEAT) out.push(c);
    else if (!seen.has(c.key)) {
      seen.add(c.key);
      out.push({ ...c, gain: 1.3 });
    }
  }
  return out;
}
