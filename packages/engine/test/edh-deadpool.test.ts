/**
 * Commander (EDH pseudo-set): rules tests for the "Deadpool, Commander Deck" deck (Deadpool, Trading Card). The
 * exchange of text boxes (612, layer 3), token copies, creatures given to the opponents, chaos.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import { objectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  castNowOf,
  customCard,
  idOf,
  lands,
  nameOf,
  namesIn,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

const graveyardNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const battlefieldNames = (s: GameState, p: PlayerId) =>
  namesIn(
    s,
    s.battlefield.filter((id) => s.objects[id]?.controller === p),
  ).sort();
const activations = (s: GameState, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
const activate = (s: GameState, p: PlayerId, source: ObjectId, extra: object = {}, index = 0) => {
  const o = activations(s, p, source)[index];
  if (!o) throw new Error(`no ability for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const tokensNamed = (s: GameState, p: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
/** Answers the pick of an option ("0", "1"…) by rank. */
const rank = (n: number) => (req: ChoiceRequest) =>
  req.type === "pick" && req.options.includes(String(n)) && req.options.includes("0") ? [String(n)] : undefined;
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
const ARTIFACT = customCard({
  name: "Test Relic",
  types: ["Artifact"],
  typeLine: "Artifact",
  manaCost: { generic: 3, colored: {}, x: 0 },
});
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
/** Answers Deadpool's question with the named creature (or nothing). */
const swapWith =
  (want: string | null) =>
  (req: ChoiceRequest, _p: PlayerId, s: GameState): string[] | undefined =>
    req.type === "pick" && /text box/.test(req.prompt)
      ? req.options.filter((id) => want !== null && nameOf(s, id) === want).slice(0, 1)
      : undefined;
const DEADPOOL_LANDS = [...lands("Swamp", 2), ...lands("Mountain", 2)];

describe("Deadpool (EDH)", () => {
  describe("Deadpool, Trading Card: exchange of text boxes", () => {
    it("as he enters, Deadpool and the other creature exchange their text boxes (not their name, types or P/T)", () => {
      let s = scenario({
        p1: { battlefield: DEADPOOL_LANDS, hand: ["Deadpool, Trading Card"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      s = settle(castIt(s, "p1", "Deadpool, Trading Card"), swapWith("Llanowar Elves"));
      const dp = idOf(s, "p1", "battlefield", "Deadpool, Trading Card");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(chars(s, dp).abilities.map((a) => a.kind)).toEqual(["mana"]);
      expect([chars(s, dp).power, chars(s, dp).toughness, chars(s, dp).name]).toEqual([5, 3, "Deadpool, Trading Card"]);
      expect(chars(s, elves).abilities.map((a) => a.kind)).toEqual(["triggered", "activated"]);
      expect([chars(s, elves).power, chars(s, elves).toughness]).toEqual([1, 1]);
      // The view shows the text box each one has.
      expect(objectView(s, dp).textBox?.name).toBe("Llanowar Elves");
      expect(objectView(s, elves).textBox?.name).toBe("Deadpool, Trading Card");
      // p2's upkeep: the Elves (with Deadpool's text) make their controller lose 3 life; p1's upkeep: nothing.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw");
      expect(s.players.p2?.life).toBe(17);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect(s.players.p1?.life).toBe(20);
    });

    it('the text taken triggers as Deadpool enters (an "enters" ability)', () => {
      let s = scenario({
        p1: { battlefield: [...DEADPOOL_LANDS, "Bear Cub"], hand: ["Deadpool, Trading Card"] },
        p2: { battlefield: ["Fleshbag Marauder", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Deadpool, Trading Card"), (req, p, cur) => {
        const swap = swapWith("Fleshbag Marauder")(req, p, cur);
        if (swap) return swap;
        // Each player sacrifices a creature: p1 its Bear Cub, p2 its Lions.
        if (req.type === "pick")
          return req.options.filter((id) => ["Bear Cub", "Savannah Lions"].includes(nameOf(cur, id) ?? ""));
        return undefined;
      });
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(graveyardNames(s, "p2")).toEqual(["Savannah Lions"]);
    });

    it('"you may": without a choice, nothing is exchanged', () => {
      let s = scenario({
        p1: { battlefield: DEADPOOL_LANDS, hand: ["Deadpool, Trading Card"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      s = settle(castIt(s, "p1", "Deadpool, Trading Card"), swapWith(null));
      const dp = idOf(s, "p1", "battlefield", "Deadpool, Trading Card");
      expect(chars(s, dp).abilities.map((a) => a.kind)).toEqual(["triggered", "activated"]);
      expect(objectView(s, dp).textBox).toBeUndefined();
    });

    it("the exchange lasts after Deadpool leaves; the other creature can be sacrificed with his ability", () => {
      let s = scenario({
        p1: { battlefield: [...DEADPOOL_LANDS, ...lands("Swamp", 2)], hand: ["Deadpool, Trading Card", "Infernal Grasp"] },
        p2: { battlefield: ["Llanowar Elves", ...lands("Forest", 3)], library: lands("Forest", 5) },
      });
      s = settle(castIt(s, "p1", "Deadpool, Trading Card"), swapWith("Llanowar Elves"));
      const dp = idOf(s, "p1", "battlefield", "Deadpool, Trading Card");
      s = settle(castIt(s, "p1", "Infernal Grasp", { targets: { t: [dp] } }));
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(chars(s, elves).abilities.map((a) => a.kind)).toEqual(["triggered", "activated"]);
      // p2 sacrifices the Elves ("{3}, Sacrifice this creature"): each other player (p1) draws.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      const hand = s.players.p1?.hand.length ?? 0;
      const ab = chars(s, elves).abilities.findIndex((a) => a.kind === "activated");
      s = settle(act(s, "p2", { type: "activate", source: elves, ability: ab } as never));
      expect(s.players.p1?.hand.length).toBe(hand + 1);
      expect(graveyardNames(s, "p2")).toEqual(["Llanowar Elves"]);
    });
  });

  describe("Deadpool returning to the battlefield", () => {
    it("exiled and returned by Conjurer's Closet, he exchanges again (the question names him)", () => {
      let s = scenario({
        p1: { battlefield: ["Deadpool, Trading Card", "Conjurer's Closet"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const dp = idOf(s, "p1", "battlefield", "Deadpool, Trading Card");
      let prompt = "";
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s, (req, p, cur) => {
        if (req.type === "pick" && req.options.includes(dp)) return [dp];
        if (req.type === "pick" && /text box/.test(req.prompt)) prompt = req.prompt;
        return swapWith("Llanowar Elves")(req, p, cur);
      });
      expect(prompt).toContain("deadpool-trading-card");
      const back = idOf(s, "p1", "battlefield", "Deadpool, Trading Card");
      expect(objectView(s, back).textBox?.name).toBe("Llanowar Elves");
      expect(objectView(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).textBox?.name).toBe("Deadpool, Trading Card");
    });
  });

  describe("copies", () => {
    it("a token copy of Deadpool has his printed text and exchanges its own text box as it enters", () => {
      let s = scenario({
        p1: {
          battlefield: [...DEADPOOL_LANDS, ...lands("Mountain", 2), "Orthion, Hero of Lavabrink"],
          hand: ["Deadpool, Trading Card"],
        },
        p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Deadpool, Trading Card"), swapWith("Llanowar Elves"));
      const dp = idOf(s, "p1", "battlefield", "Deadpool, Trading Card");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Orthion, Hero of Lavabrink"), { targets: { t: [dp] } }),
        swapWith("Savannah Lions"),
      );
      const copy = tokensNamed(s, "p1", "Deadpool, Trading Card")[0] ?? "";
      expect(chars(s, copy).keywords).toContain("haste");
      // The copy took the Lions' text (no ability); the Lions have Deadpool's printed text.
      expect(chars(s, copy).abilities.filter((a) => a.kind !== "static")).toEqual([]);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      expect(chars(s, lions).abilities.map((a) => a.kind)).toEqual(["triggered", "activated"]);
    });

    it("Saw in Half: destroys a creature; its controller creates two copies with half its power and toughness (rounded up)", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Saw in Half"] },
        p2: { battlefield: ["Abyssal Persecutor"] },
      });
      s = settle(castIt(s, "p1", "Saw in Half", { targets: { t: [idOf(s, "p2", "battlefield", "Abyssal Persecutor")] } }));
      const copies = tokensNamed(s, "p2", "Abyssal Persecutor");
      expect(copies).toHaveLength(2);
      expect([chars(s, copies[0] ?? "").power, chars(s, copies[0] ?? "").toughness]).toEqual([3, 3]);
      let t = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Saw in Half"] } });
      t = settle(castIt(t, "p1", "Saw in Half", { targets: { t: [idOf(t, "p1", "battlefield", "Llanowar Elves")] } }));
      const elves = tokensNamed(t, "p1", "Llanowar Elves");
      expect(elves.map((id) => [chars(t, id).power, chars(t, id).toughness])).toEqual([
        [1, 1],
        [1, 1],
      ]);
    });

    it("The Master, Multiplied: copies aren't sacrificed by your triggered abilities, nor by the legend rule", () => {
      let s = scenario({
        p1: {
          battlefield: ["The Master, Multiplied", "Orthion, Hero of Lavabrink", "Kardur, Doomscourge", ...lands("Mountain", 2)],
        },
      });
      const kardur = idOf(s, "p1", "battlefield", "Kardur, Doomscourge");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Orthion, Hero of Lavabrink"), { targets: { t: [kardur] } }));
      expect(tokensNamed(s, "p1", "Kardur, Doomscourge")).toHaveLength(1);
      // The legendary copy and the original both stay; at the end step, the copy isn't sacrificed.
      expect(battlefieldNames(s, "p1").filter((n) => n === "Kardur, Doomscourge")).toHaveLength(2);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(tokensNamed(s, "p1", "Kardur, Doomscourge")).toHaveLength(1);
    });

    it("Orthion without The Master: the copy is sacrificed at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Orthion, Hero of Lavabrink", "Bear Cub", ...lands("Mountain", 2)] } });
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Orthion, Hero of Lavabrink"), {
          targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
        }),
      );
      expect(tokensNamed(s, "p1", "Bear Cub")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(tokensNamed(s, "p1", "Bear Cub")).toHaveLength(0);
    });

    it("Mirror Box: no legend rule; legendary creatures +1/+1; nontoken creatures +1/+1 per other creature of the same name", () => {
      let s = scenario({
        p1: { battlefield: ["Mirror Box", "Orthion, Hero of Lavabrink", "Bear Cub", ...lands("Mountain", 2)] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const orthion = idOf(s, "p1", "battlefield", "Orthion, Hero of Lavabrink");
      expect(chars(s, orthion).power).toBe(4);
      s = settle(activate(s, "p1", orthion, { targets: { t: [bear] } }));
      // The original Bear Cub: 2/2 +1/+1 (one other Bear Cub); the token: 2/2.
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 3]);
      const token = tokensNamed(s, "p1", "Bear Cub")[0] ?? "";
      expect(chars(s, token).power).toBe(2);
    });

    it("Delina, Wild Mage: a d20 when attacking; a token copy, tapped and attacking, exiled at end of combat", () => {
      let s = scenario({ p1: { battlefield: ["Delina, Wild Mage", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [idOf(s, "p1", "battlefield", "Delina, Wild Mage")]);
      s = settleNoBlocks(s, (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : req.type === "yesNo" ? [0] : undefined,
      );
      expect(tokensNamed(s, "p1", "Bear Cub").length).toBeGreaterThanOrEqual(1);
      const copy = tokensNamed(s, "p1", "Bear Cub")[0] ?? "";
      expect(s.combat?.attackers.some((a) => a.id === copy)).toBe(true);
      s = throughCombat(s);
      expect(tokensNamed(s, "p1", "Bear Cub")).toHaveLength(0);
    });

    it("Jaxis, the Troublemaker: discard a card: a hasty token copy that draws when it dies", () => {
      let s = scenario({
        p1: { battlefield: ["Jaxis, the Troublemaker", "Bear Cub", "Mountain"], hand: ["Forest"], library: lands("Swamp", 3) },
      });
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Jaxis, the Troublemaker"), {
          targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
        }),
      );
      const copy = tokensNamed(s, "p1", "Bear Cub")[0] ?? "";
      expect(chars(s, copy).keywords).toContain("haste");
      expect(graveyardNames(s, "p1")).toEqual(["Forest"]);
      // Sacrificed at the end step: it dies, its controller draws.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Jaxis, the Troublemaker: printed blitz {1}{R}: haste, draws when it dies, sacrificed at the next end step", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Jaxis, the Troublemaker"], library: lands("Swamp", 3) },
      });
      const jaxis = idOf(s, "p1", "hand", "Jaxis, the Troublemaker");
      // {3}{R} is not payable with two lands: only the blitz cost is.
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === jaxis);
      expect(opt?.type === "cast" && opt.altAvailable).toBe(true);
      s = settle(castIt(s, "p1", "Jaxis, the Troublemaker", { alternative: true }));
      const j = idOf(s, "p1", "battlefield", "Jaxis, the Troublemaker");
      expect(s.objects[j]?.cast?.via).toBe("blitz");
      expect(chars(s, j).keywords).toContain("haste");
      // Sacrificed at the beginning of the end step: it dies, its controller draws a card.
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(graveyardNames(s, "p1")).toEqual(["Jaxis, the Troublemaker"]);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Echoing Assault: a 1/1 copy of an attacking nontoken creature, tapped and attacking; tokens have menace", () => {
      let s = scenario({ p1: { battlefield: ["Echoing Assault", "Abyssal Persecutor"] } });
      const p = idOf(s, "p1", "battlefield", "Abyssal Persecutor");
      s = settleNoBlocks(attack(s, [p]), (req) => (req.type === "pick" && req.options.includes(p) ? [p] : undefined));
      const copy = tokensNamed(s, "p1", "Abyssal Persecutor")[0] ?? "";
      expect([chars(s, copy).power, chars(s, copy).toughness]).toEqual([1, 1]);
      expect(chars(s, copy).keywords).toContain("menace");
      expect(s.combat?.attackers.some((a) => a.id === copy)).toBe(true);
    });

    it("Gogo, Mysterious Mime: becomes a copy of another creature until end of turn (keeping its name); both +2/+0", () => {
      let s = scenario({ p1: { battlefield: ["Gogo, Mysterious Mime", "Abyssal Persecutor"] } });
      const gogo = idOf(s, "p1", "battlefield", "Gogo, Mysterious Mime");
      const p = idOf(s, "p1", "battlefield", "Abyssal Persecutor");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0, 50);
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(p) ? [p] : undefined));
      expect(chars(s, gogo).name).toBe("Gogo, Mysterious Mime");
      expect([chars(s, gogo).power, chars(s, p).power]).toEqual([8, 8]);
      expect(chars(s, gogo).keywords).toEqual(expect.arrayContaining(["flying", "trample", "haste"]));
    });

    it("Blade of Selves: the equipped creature has myriad", () => {
      const s = scenario({ p1: { battlefield: ["Blade of Selves", "Bear Cub"] } });
      const blade = idOf(s, "p1", "battlefield", "Blade of Selves");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const o = s.objects[blade];
      if (o) o.attachedTo = bear;
      s.version += 1;
      expect(chars(s, bear).abilities.some((a) => a.kind === "triggered" && a.trigger.on === "attacks")).toBe(true);
    });
  });

  describe("creatures given to the opponents", () => {
    it("Xantcha: enters under an opponent's control; can't attack its owner; any player may activate its ability", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Swamp", 5), ...lands("Mountain", 2)], hand: ["Xantcha, Sleeper Agent"] },
      });
      s = settle(castIt(s, "p1", "Xantcha, Sleeper Agent"), (req) =>
        req.type === "pick" && req.options.includes("p3") ? ["p3"] : undefined,
      );
      const x = idOf(s, "p3", "battlefield", "Xantcha, Sleeper Agent");
      expect(s.objects[x]?.controller).toBe("p3");
      // Its owner (p1) activates it: its controller (p3) loses 2 life, p1 draws.
      s = settle(activate(s, "p1", x));
      expect(s.players.p3?.life).toBe(18);
      expect(s.players.p1?.hand).toHaveLength(1);
      // p3 must attack with it, but not p1.
      s = advanceUntil(s, (y) => y.turn.active === "p3" && y.pending?.kind === "declareAttackers");
      expect(() => act(s, "p3", { type: "declareAttackers", attackers: [{ id: x, defender: "p1" }] })).toThrow();
      expect(() => act(s, "p3", { type: "declareAttackers", attackers: [] })).toThrow();
      s = act(s, "p3", { type: "declareAttackers", attackers: [{ id: x, defender: "p2" }] });
    });

    it("Oft-Nabbed Goat: only its controller's opponents may activate it (sorcery speed); dies with -1/-1 counters", () => {
      let s = scenario({
        p1: { battlefield: ["Oft-Nabbed Goat", "Forest"] },
        p2: { battlefield: ["Forest", "Forest"] },
        active: "p2",
      });
      const goat = idOf(s, "p1", "battlefield", "Oft-Nabbed Goat");
      expect(activations(s, "p1", goat)).toHaveLength(0);
      s = settle(activate(s, "p2", goat));
      expect(s.objects[goat]?.controller).toBe("p2");
      expect(s.objects[goat]?.counters["-1/-1"]).toBe(1);
      expect(s.players.p2?.hand).toHaveLength(1);
      // p1 takes it back during their own turn.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      s = settle(activate(s, "p1", goat, {}, 0));
      expect(s.objects[goat]?.counters["-1/-1"]).toBe(2);
      expect(s.objects[goat]?.controller).toBe("p1");
    });

    it("Oft-Nabbed Goat: dies with -1/-1 counters: its owner draws that many, each other player loses that much life", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Oft-Nabbed Goat", counters: { "-1/-1": 2 } }], library: lands("Swamp", 5) },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      s = settle(castIt(s, "p2", "Lightning Bolt", { targets: { t: [idOf(s, "p1", "battlefield", "Oft-Nabbed Goat")] } }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p2?.life).toBe(18);
    });

    it("Humble Defector: draws two, then target opponent gains control of it (only during your turn)", () => {
      let s = scenario({ p1: { battlefield: ["Humble Defector"], library: lands("Swamp", 5) } });
      const h = idOf(s, "p1", "battlefield", "Humble Defector");
      s = settle(activate(s, "p1", h, { targets: { p: ["p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.objects[h]?.controller).toBe("p2");
      // During p1's turn only: p2 can't use it on p1's turn.
      expect(activations(s, "p2", h)).toHaveLength(0);
    });

    it("Alexios: at each player's upkeep, that player gains control of it, untaps it, a +1/+1 counter; it can't attack its owner", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Alexios, Deimos of Kosmos", tapped: true }] },
        active: "p2",
        step: "untap",
      });
      const a = idOf(s, "p1", "battlefield", "Alexios, Deimos of Kosmos");
      s = settle(advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep" && x.stack.length > 0));
      expect(s.objects[a]?.controller).toBe("p2");
      expect(s.objects[a]?.tapped).toBe(false);
      expect(s.objects[a]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, a).keywords).toEqual(expect.arrayContaining(["haste", "mustAttack", "cantBeSacrificed"]));
      // p2 can't attack its owner (p1) with it: in a duel, it can't attack.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: a, defender: "p1" }] })).toThrow();
    });

    it("Vislor Turlough: an opponent may gain control of it, goaded; end step: draw, then lose life equal to the hand", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Vislor Turlough"] } });
      s = settle(castIt(s, "p1", "Vislor Turlough"), yes);
      const v = idOf(s, "p2", "battlefield", "Vislor Turlough");
      expect(objectView(s, v).goaded?.[0]?.by).toBe("p1");
      let t = scenario({ p1: { battlefield: ["Vislor Turlough"], hand: ["Forest"], library: lands("Swamp", 3) } });
      t = advanceUntil(t, (x) => x.turn.active === "p2");
      expect(t.players.p1?.life).toBe(18);
    });

    it("Life of the Party: each opponent creates a token copy of it, goaded for the rest of the game", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Life of the Party"] } });
      s = settle(castIt(s, "p1", "Life of the Party"));
      const copy = tokensNamed(s, "p2", "Life of the Party")[0] ?? "";
      expect(objectView(s, copy).goaded?.[0]?.by).toBe("p1");
      // It attacks: +X/+0 (creatures you control).
      let t = scenario({ p1: { battlefield: ["Life of the Party", "Bear Cub"] } });
      const l = idOf(t, "p1", "battlefield", "Life of the Party");
      t = settleNoBlocks(attack(t, [l]));
      expect(chars(t, l).power).toBe(2);
    });
  });

  describe("chaos", () => {
    it("Opposition Agent: you choose what an opponent finds; the card is exiled and you may play it", () => {
      let s = scenario({
        p1: { battlefield: ["Opposition Agent"] },
        p2: { battlefield: ["Bloodstained Mire"], library: ["Forest", "Swamp", "Mountain", "Forest"] },
        active: "p2",
      });
      const mire = idOf(s, "p2", "battlefield", "Bloodstained Mire");
      s = activate(s, "p2", mire);
      let asked: PlayerId | undefined;
      s = settle(s, (req, p, cur) => {
        if (req.type === "pick" && req.intent === "search") {
          asked = p;
          return req.options.filter((id) => nameOf(cur, id) === "Mountain");
        }
        return undefined;
      });
      expect(asked).toBe("p1");
      expect(namesIn(s, s.exile)).toEqual(["Mountain"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const mountain = s.exile[0] ?? "";
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    });

    it("Possibility Storm: the spell is exiled, a card sharing a type may be cast for free, all exiled cards to the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: ["Possibility Storm", ...lands("Swamp", 2)],
          hand: ["Sign in Blood"],
          library: ["Forest", "Night's Whisper", "Swamp", "Swamp", "Swamp"],
        },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sign in Blood"), targets: { p: ["p1"] } } as never);
      s = untilCastNow(s);
      // The spell left the stack (exiled first) and never resolves.
      expect(s.stack.some((x) => x.kind === "spell")).toBe(false);
      const found = castNowOf(s)?.cards[0] ?? "";
      expect(nameOf(s, found)).toBe("Night's Whisper");
      s = settle(act(s, "p1", { type: "cast", card: found } as never));
      // Only Night's Whisper resolved: two Swamps drawn, 2 life lost.
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Swamp", "Swamp"]);
      expect(s.players.p1?.life).toBe(18);
      // The spell and the Forest went to the bottom, in a random order (official ruling).
      expect(s.exile).toHaveLength(0);
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Swamp");
      expect(library.slice(1).sort()).toEqual(["Forest", "Sign in Blood"]);
    });

    it("Possibility Storm: the card not cast goes to the bottom too; the search uses the spell's card types", () => {
      let s = scenario({
        p1: {
          battlefield: ["Possibility Storm", ...lands("Forest", 2)],
          hand: ["Bear Cub"],
          library: ["Night's Whisper", "Forest", "Bear Cub", "Swamp"],
        },
      });
      s = castIt(s, "p1", "Bear Cub");
      s = untilCastNow(s);
      const found = castNowOf(s)?.cards[0] ?? "";
      expect(nameOf(s, found)).toBe("Bear Cub");
      // Declined: Night's Whisper, the Forest, the found Bear Cub and the cast one all go to the bottom.
      s = settle(act(s, "p1", { type: "pass" }));
      expect(s.exile).toHaveLength(0);
      expect(battlefieldNames(s, "p1")).not.toContain("Bear Cub");
      const library = namesIn(s, s.players.p1?.library);
      expect(library[0]).toBe("Swamp");
      expect(library.slice(1).sort()).toEqual(["Bear Cub", "Bear Cub", "Forest", "Night's Whisper"]);
    });

    it("Share the Spoils: the top card of each library is exiled; each player may play them; when they do, another one", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Share the Spoils"], library: ["Forest", "Swamp"] },
        p2: { library: ["Mountain", "Island"] },
      });
      s = settle(castIt(s, "p1", "Share the Spoils"));
      expect(namesIn(s, s.exile).sort()).toEqual(["Forest", "Mountain"]);
      const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") ?? "";
      // p1 plays p2's Mountain: p1 exiles their next card.
      s = act(s, "p1", { type: "playLand", card: mountain } as never);
      s = settle(s);
      expect(namesIn(s, s.exile).sort()).toEqual(["Forest", "Swamp"]);
    });

    it("Mob Verdict: votes; each vote an opponent receives: 2 damage to them and their creatures; each vote you receive: draw", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Mountain", 4), hand: ["Mob Verdict"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const votes: Record<PlayerId, PlayerId> = { p1: "p2", p2: "p1", p3: "p2" };
      s = settle(castIt(s, "p1", "Mob Verdict"), (req, p) =>
        req.type === "pick" && req.prompt.includes("Vote") ? [votes[p] ?? ""] : undefined,
      );
      expect(s.players.p2?.life).toBe(16);
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub"]);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p3?.life).toBe(20);
    });

    it("Prisoner's Dilemma: all silence 4; all snitch 8; otherwise 12 to those who chose silence", () => {
      const play = (choices: Record<PlayerId, number>) =>
        settle(
          castIt(
            scenario({ players: 3, p1: { battlefield: lands("Mountain", 5), hand: ["Prisoner's Dilemma"] } }),
            "p1",
            "Prisoner's Dilemma",
          ),
          (req, p) => rank(choices[p] ?? 0)(req),
        );
      let s = play({ p2: 0, p3: 0 });
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([16, 16]);
      s = play({ p2: 1, p3: 1 });
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([12, 12]);
      s = play({ p2: 0, p3: 1 });
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([8, 20]);
    });

    it("Ensnared by the Mara: villainous choice, a free spell for the caster or damage equal to four cards' mana value", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Ensnared by the Mara"] },
        p2: { library: ["Forest", "Sign in Blood", "Abyssal Persecutor", "Forest", "Forest"] },
      });
      const forFree = settle(castIt(s, "p1", "Ensnared by the Mara"), (req) => rank(0)(req));
      expect(namesIn(forFree, forFree.exile)).toEqual(["Forest", "Sign in Blood"]);
      s = settle(castIt(s, "p1", "Ensnared by the Mara"), (req) => rank(1)(req));
      // Forest, Sign in Blood (2), Abyssal Persecutor (4), Forest: 6 damage.
      expect(s.players.p2?.life).toBe(14);
    });

    it("Tempt with Mayhem: each opponent may copy the spell; you copy it once plus once for each of them", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: [...lands("Mountain", 4), ...lands("Swamp", 2)],
          hand: ["Sign in Blood", "Tempt with Mayhem"],
          library: lands("Swamp", 10),
        },
        p2: { library: lands("Swamp", 10) },
        p3: { library: lands("Swamp", 10) },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sign in Blood"), targets: { p: ["p1"] } } as never);
      const spell = s.stack[0]?.id ?? "";
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tempt with Mayhem"), targets: { t: [spell] } } as never);
      // p2 copies, p3 declines: p1 copies twice; each copy keeps its target (p1) here.
      s = settle(s, (req, p) => (req.type === "yesNo" ? [p === "p2" ? 1 : 0] : undefined));
      expect(s.players.p1?.life).toBe(12);
    });
  });

  describe("other cards", () => {
    it("Karn, Silver Golem: {1}: a noncreature artifact becomes a creature with P/T equal to its mana value", () => {
      let s = scenario({ p1: { battlefield: ["Karn, Silver Golem", ARTIFACT, "Mountain"] } });
      const relic = idOf(s, "p1", "battlefield", "Test Relic");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Karn, Silver Golem"), { targets: { t: [relic] } }));
      expect(chars(s, relic).types).toContain("Creature");
      expect([chars(s, relic).power, chars(s, relic).toughness]).toEqual([3, 3]);
    });

    it("Xenic Poltergeist: {T}: a noncreature artifact becomes a creature until your next upkeep", () => {
      let s = scenario({ p1: { battlefield: ["Xenic Poltergeist", ARTIFACT] } });
      const relic = idOf(s, "p1", "battlefield", "Test Relic");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Xenic Poltergeist"), { targets: { t: [relic] } }));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, relic).power).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(chars(s, relic).types).not.toContain("Creature");
    });

    it("Warstorm Surge: a creature you control enters, it deals damage equal to its power to any target", () => {
      let s = scenario({ p1: { battlefield: ["Warstorm Surge", ...lands("Swamp", 4)], hand: ["Abyssal Persecutor"] } });
      s = settle(castIt(s, "p1", "Abyssal Persecutor"), (req) =>
        req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect(s.players.p2?.life).toBe(14);
    });

    it("Mana Geyser: {R} for each tapped land your opponents control", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Mana Geyser"] },
        p2: { battlefield: [{ name: "Forest", tapped: true }, { name: "Forest", tapped: true }, "Forest"] },
      });
      s = settle(castIt(s, "p1", "Mana Geyser"));
      expect(s.players.p1?.manaPool.R).toBe(2);
    });

    it("Hagra Mauling costs {1} less if an opponent controls no basic lands", () => {
      const cost = (p2: string[]) => {
        const s = scenario({
          p1: { battlefield: lands("Swamp", 3), hand: ["Hagra Mauling // Hagra Broodpit"] },
          p2: { battlefield: [...p2, "Bear Cub"] },
        });
        return legalActions(s, "p1").some((a) => a.type === "cast" && !a.face && nameOf(s, a.card)?.startsWith("Hagra"));
      };
      expect(cost(["Command Tower"])).toBe(true);
      expect(cost(["Forest"])).toBe(false);
    });

    it("Sundering Eruption: destroys a land; its controller may search a basic land; creatures without flying can't block", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Sundering Eruption // Volcanic Fissure"] },
        p2: { battlefield: ["Command Tower", "Bear Cub", "Abyssal Persecutor"], library: ["Swamp", "Forest"] },
      });
      s = settle(
        castIt(s, "p1", "Sundering Eruption // Volcanic Fissure", {
          targets: { t: [idOf(s, "p2", "battlefield", "Command Tower")] },
        }),
      );
      expect(graveyardNames(s, "p2")).toEqual(["Command Tower"]);
      expect(battlefieldNames(s, "p2").filter((n) => n === "Swamp" || n === "Forest")).toHaveLength(1);
      expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).toContain("cantBlock");
      expect(chars(s, idOf(s, "p2", "battlefield", "Abyssal Persecutor")).keywords).not.toContain("cantBlock");
    });

    it('Olinda the Oblivious: an odor counter on a creature of each opponent; "you lose 2 life" at their upkeep', () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Olinda the Oblivious"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Olinda the Oblivious"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.counters.odor).toBe(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw");
      expect(s.players.p2?.life).toBe(18);
    });

    it("Changing Loyalty: when the enchanted creature dies, it returns under your control", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Mountain"], hand: ["Changing Loyalty", "Lightning Bolt"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Changing Loyalty", { targets: { enchant: [bear] } }));
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: [bear] } }));
      expect(battlefieldNames(s, "p1")).toContain("Bear Cub");
    });

    it('Conjurer\'s Closet: at your end step, a creature you control is exiled and returns (its "enters" ability again)', () => {
      let s = scenario({
        p1: { battlefield: ["Conjurer's Closet", "Fleshbag Marauder", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const fleshbag = idOf(s, "p1", "battlefield", "Fleshbag Marauder");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
      s = settle(s, (req, _p, cur) =>
        req.type === "pick" && req.options.includes(fleshbag)
          ? [fleshbag]
          : req.type === "pick"
            ? req.options.filter((id) => ["Bear Cub", "Savannah Lions"].includes(nameOf(cur, id) ?? ""))
            : undefined,
      );
      expect(graveyardNames(s, "p2")).toEqual(["Savannah Lions"]);
      expect(battlefieldNames(s, "p1")).toContain("Fleshbag Marauder");
    });

    it("Golden Argosy: the creatures that crewed it are exiled when it attacks and return tapped at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Golden Argosy", "Bear Cub"] } });
      const argosy = idOf(s, "p1", "battlefield", "Golden Argosy");
      s = settle(activate(s, "p1", argosy));
      s = settleNoBlocks(attack(s, [argosy]));
      expect(battlefieldNames(s, "p1")).not.toContain("Bear Cub");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
    });

    it("Disrupt Decorum: goads all creatures you don't control", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 4), hand: ["Disrupt Decorum"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Disrupt Decorum"));
      expect(objectView(s, idOf(s, "p2", "battlefield", "Bear Cub")).goaded?.[0]?.by).toBe("p1");
    });

    it("Elturel Survivors: attacking, +X/+0 where X is the lands of the defending player", () => {
      let s = scenario({ p1: { battlefield: ["Elturel Survivors"] }, p2: { battlefield: lands("Forest", 3) } });
      const e = idOf(s, "p1", "battlefield", "Elturel Survivors");
      expect(chars(s, e).power).toBe(0);
      s = attack(s, [e]);
      expect(chars(s, e).power).toBe(3);
    });

    it("Pinnacle Monk: returns an instant or sorcery card from your graveyard to your hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Pinnacle Monk // Mystic Peak"], graveyard: ["Lightning Bolt"] },
      });
      s = settle(castIt(s, "p1", "Pinnacle Monk // Mystic Peak"));
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Lightning Bolt"]);
    });

    it("Slicer: at an opponent's upkeep, they may control it this turn (goaded), otherwise it converts", () => {
      const SLICER = "Slicer, Hired Muscle // Slicer, High-Speed Antagonist";
      let s = scenario({ p1: { battlefield: [SLICER] }, active: "p2", step: "untap" });
      const slicer = idOf(s, "p1", "battlefield", SLICER);
      let t = settle(
        advanceUntil(s, (x) => x.turn.step === "upkeep" && x.stack.length > 0),
        (req) => rank(0)(req),
      );
      expect(t.objects[slicer]?.controller).toBe("p2");
      expect(chars(t, slicer).keywords).toContain("cantBeSacrificed");
      s = settle(
        advanceUntil(s, (x) => x.turn.step === "upkeep" && x.stack.length > 0),
        (req) => rank(1)(req),
      );
      expect(chars(s, slicer).name).toBe("Slicer, High-Speed Antagonist");
      // Living metal: a creature during its controller's turn only.
      expect(chars(s, slicer).types).not.toContain("Creature");
      t = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(chars(t, slicer).types).toContain("Creature");
    });
  });
});
