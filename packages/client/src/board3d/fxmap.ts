/**
 * Engine events → effects of the 3D board (PLAN-W W7): which effect, on which card (by uid: its mesh) or player (their
 * seat), and when. Pure and tested; the timing follows `soundsFor` and `playEffects` (one step of 0.22 s per visible
 * effect, 2.2 s at most), so sound, numbers and particles land together.
 */
import type { CardFace, GameEvent, GameView, ObjectView } from "@mtgx/engine";

export type Fx3dKind =
  /** Sparks where damage lands, and the card jolts. */
  | "burst"
  /** Green motes rising from a player's side: life gained. */
  | "heal"
  /** Embers where a creature died (it then flies to its graveyard). */
  | "embers"
  /**
   * A circle of runes in the colors of the magic, with its own light: a spell cast (on its caster's side), a permanent
   * entering the battlefield (under it), an ability (smaller, under its source).
   */
  | "rune"
  /** A token appears in a ring of light. */
  | "spawn"
  /** Dust where a land lands. */
  | "dust"
  /** Sparks where a blocker meets its attacker. */
  | "clash"
  /** Counters put on a permanent. */
  | "sparkle"
  /** A light sweeps the table: a turn begins. */
  | "sweep";

export interface Fx3d {
  kind: Fx3dKind;
  /** The card it happens on (its mesh), or the player (their seat). */
  uid?: string;
  player?: string;
  /** Colors as mana letters (W, U, B, R, G, C). */
  colors?: string[];
  /** Damage, life or counters: the effect grows with it. */
  amount?: number;
  /** A rune: "spell" (on the caster's side), "summon" (under the permanent), "ability" (small, under its source). */
  rune?: "spell" | "summon" | "ability";
  /** Seconds after the update. */
  delay: number;
}

const STEP = 0.22;
const MAX_DELAY = 2.2;

/** The colors of a mana cost ("{2}{G}{U}" → G, U), colorless when it has none. */
export function costColors(cost: string | undefined): string[] {
  const colors = [...new Set([...(cost ?? "").matchAll(/[WUBRG]/g)].map((m) => m[0]))];
  return colors.length ? colors : ["C"];
}

export function fxFor(events: GameEvent[], view: GameView, prev: GameView | null, faces: Record<string, CardFace>): Fx3d[] {
  const fx: Fx3d[] = [];
  let step = 0;
  const at = () => Math.min(step * STEP, MAX_DELAY);
  // A card by its id, before or after the update (a dying creature is only in the previous view).
  const objects = new Map<string, ObjectView>();
  for (const o of prev?.battlefield ?? []) objects.set(o.id, o);
  for (const o of view.battlefield) objects.set(o.id, o);
  const uidOf = (id: string | undefined) => (id ? objects.get(id)?.uid : undefined);

  for (const e of events) {
    switch (e.type) {
      case "damage": {
        const uid = e.targetDefId ? uidOf(e.target) : undefined;
        if (!uid) break;
        fx.push({ kind: "burst", uid, amount: e.amount, delay: at() });
        step++;
        break;
      }
      case "life":
        if (e.delta > 0) {
          fx.push({ kind: "heal", player: e.player, amount: e.delta, delay: at() });
          step++;
        }
        break;
      case "dies": {
        const uid = uidOf(e.objectId);
        if (!uid) break;
        fx.push({ kind: "embers", uid, delay: at() });
        step++;
        break;
      }
      case "cast":
      case "copy":
        fx.push({ kind: "rune", rune: "spell", player: e.player, colors: costColors(faces[e.defId]?.manaCost), delay: at() });
        break;
      case "activate":
      case "trigger": {
        // Under the permanent the ability comes from (an emblem, a card elsewhere: nothing on the table).
        const source = view.stack.find((item) => item.id === e.stackId)?.sourceId;
        const o = source ? objects.get(source) : undefined;
        if (o) fx.push({ kind: "rune", rune: "ability", uid: o.uid, colors: o.colors.length ? o.colors : ["C"], delay: at() });
        break;
      }
      case "token": {
        const o = objects.get(e.objectId);
        if (!o) break;
        fx.push({ kind: "spawn", uid: o.uid, colors: o.colors.length ? o.colors : ["C"], delay: at() });
        break;
      }
      case "playLand": {
        const uid = uidOf(e.objectId);
        if (uid) fx.push({ kind: "dust", uid, delay: at() });
        break;
      }
      case "block":
        for (const b of e.blocks) {
          const uid = uidOf(b.blocker);
          if (uid) fx.push({ kind: "clash", uid, delay: at() });
        }
        break;
      case "turnStart":
        fx.push({ kind: "sweep", player: e.player, delay: 0 });
        break;
    }
  }

  // Counters put on a permanent (no event of their own): what each permanent gained since the previous view; and the
  // permanents that entered (a land and a token have their own effect).
  if (prev) {
    const before = new Map(prev.battlefield.map((o) => [o.id, o]));
    const lands = new Set(events.flatMap((e) => (e.type === "playLand" ? [e.objectId] : [])));
    for (const o of view.battlefield) {
      if (before.has(o.id) || o.isToken || lands.has(o.id) || o.types.includes("Land")) continue;
      fx.push({ kind: "rune", rune: "summon", uid: o.uid, colors: o.colors.length ? o.colors : ["C"], delay: at() });
    }
    for (const o of view.battlefield) {
      const was = before.get(o.id);
      if (!was) continue;
      const gained = Object.entries(o.counters).reduce((sum, [k, n]) => sum + Math.max(0, n - (was.counters[k] ?? 0)), 0);
      if (gained > 0) fx.push({ kind: "sparkle", uid: o.uid, amount: gained, delay: at() });
    }
  }
  return fx;
}
