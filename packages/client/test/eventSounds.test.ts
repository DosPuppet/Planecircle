import { existsSync } from "node:fs";
import type { CardFace, GameEvent, GameView, ObjectView, StackItemView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { castColor, soundsFor } from "../src/audio/eventSounds";
import { SOUND_FILES, SOUND_LABELS, SOUNDS } from "../src/audio/sounds";

const land = (id: string, tapped: boolean, controller = "p1") =>
  ({ id, controller, tapped, types: ["Land"] }) as unknown as ObjectView;
const view = (over: Partial<GameView> = {}) => ({ viewer: "p1", battlefield: [], stack: [], ...over }) as unknown as GameView;
const faces: Record<string, CardFace> = {
  bear: { typeLine: "Creature — Bear" } as CardFace,
  bolt: { typeLine: "Instant", manaCost: "{R}" } as CardFace,
};
const keys = (events: GameEvent[], prev: GameView | null = null, v = view()) =>
  soundsFor(events, v, prev, faces).map((c) => c.key);

describe("event sounds", () => {
  it("one sound per game action, from the player's point of view", () => {
    expect(
      keys([
        { type: "gameStart", startingPlayer: "p1" },
        { type: "turnStart", turn: 1, player: "p1" },
        { type: "draw", player: "p1" },
        { type: "draw", player: "p2" },
        { type: "playLand", player: "p1", objectId: "1", defId: "forest" },
        { type: "cast", player: "p2", stackId: "s1", defId: "bolt", targets: [] },
        { type: "activate", player: "p1", stackId: "s2", defId: "x", targets: [] },
        { type: "countered", stackId: "s1", defId: "bolt", by: "x" },
        { type: "token", objectId: "9", defId: "token:x", controller: "p1" },
        { type: "turnStart", turn: 2, player: "p2" },
      ]),
    ).toEqual(["shuffle", "turn", "draw", "land", "cast", "castR", "ability", "counter", "token"]);
  });

  it("Commander: a commander entering the command zone has its sound", () => {
    expect(keys([{ type: "moved", owner: "p1", objectId: "c", defId: "bear", from: "graveyard", to: "command" }])).toEqual([
      "command",
    ]);
  });

  it("combat: attack, block, hits; heavy damage and life loss hit harder", () => {
    expect(
      keys([
        { type: "attack", player: "p2", attackers: [{ id: "a", defId: "bear" }] },
        { type: "block", player: "p1", blocks: [] },
        { type: "damage", sourceDefId: "x", target: "a", targetDefId: "bear", amount: 2, combat: true },
        { type: "damage", sourceDefId: "x", target: "b", targetDefId: "bear", amount: 6, combat: true },
        { type: "damage", sourceDefId: "x", target: "p1", amount: 3, combat: true },
        { type: "life", player: "p1", delta: -3, life: 17 },
        { type: "life", player: "p2", delta: 2, life: 22 },
        { type: "dies", objectId: "a", defId: "bear", to: "graveyard" },
      ]),
    ).toEqual(["attack", "hit", "hitHeavy", "hitHeavy", "heal", "dies"]);
  });

  it("delays follow the visual effects (0.22 s per damage, gain or death)", () => {
    const cues = soundsFor(
      [
        { type: "damage", sourceDefId: "x", target: "a", targetDefId: "bear", amount: 1, combat: true },
        { type: "life", player: "p1", delta: -1, life: 19 },
        { type: "dies", objectId: "a", defId: "bear", to: "graveyard" },
      ],
      view(),
      null,
      faces,
    );
    expect(cues.map((c) => c.delay)).toEqual([0, 0.22, 0.44]);
  });

  it("a permanent spell is played on resolution, not an instant or an ability", () => {
    const prev = view({
      stack: [
        { id: "s1", kind: "spell" },
        { id: "s2", kind: "spell" },
        { id: "s3", kind: "ability" },
      ] as StackItemView[],
    });
    expect(
      keys(
        [
          { type: "resolve", stackId: "s1", defId: "bear" },
          { type: "resolve", stackId: "s2", defId: "bolt" },
          { type: "resolve", stackId: "s3", defId: "bear" },
        ],
        prev,
      ),
    ).toEqual(["resolve"]);
  });

  it("victory or defeat", () => {
    expect(keys([{ type: "gameOver", winner: "p1" }])).toEqual(["win"]);
    expect(keys([{ type: "gameOver", winner: "p2" }])).toEqual(["lose"]);
  });

  it("more than 3 of the same sound: a single playback, louder", () => {
    const deaths: GameEvent[] = Array.from({ length: 12 }, (_, i) => ({
      type: "dies",
      objectId: `t${i}`,
      defId: "token:x",
      to: "graveyard",
    }));
    const cues = soundsFor(deaths, view(), null, faces);
    expect(cues).toEqual([{ key: "dies", delay: 0, gain: 1.3 }]);
    expect(keys(deaths.slice(0, 3))).toEqual(["dies", "dies", "dies"]);
  });

  it('"tap" only for your lands that have just been tapped', () => {
    const prev = view({ battlefield: [land("a", false), land("b", true), land("c", false, "p2")] });
    expect(keys([], prev, view({ battlefield: [land("a", true), land("b", true), land("c", true, "p2")] }))).toEqual(["tap"]);
    expect(keys([], prev, view({ battlefield: [land("a", false), land("b", true), land("c", true, "p2")] }))).toEqual([]);
  });

  it("a cast has the cue of its colors: one color, several (hybrid included), or none", () => {
    const face = (manaCost: string) => ({ manaCost }) as CardFace;
    expect(castColor(face("{2}{W}{W}"))).toBe("castW");
    expect(castColor(face("{1}{U}"))).toBe("castU");
    expect(castColor(face("{B}{G}"))).toBe("castM");
    expect(castColor(face("{R/G}"))).toBe("castM");
    expect(castColor(face("{4}"))).toBe("castC");
    expect(castColor(undefined)).toBe("castC");
  });

  it("every sound has a label in the listening panel", () => {
    expect(Object.keys(SOUND_LABELS).sort()).toEqual(Object.keys(SOUNDS).sort());
  });

  it("each file in the table is present in public/sounds", () => {
    const missing = SOUND_FILES.filter((f) => !existsSync(new URL(`../public/sounds/${f}`, import.meta.url)));
    expect(missing).toEqual([]);
  });
});
