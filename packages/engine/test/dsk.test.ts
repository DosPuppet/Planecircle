/**
 * Duskmourn: House of Horror: Eerie, Survival, Delirium, manifest dread by another player (lot A);
 * Impending, Enduring, additional costs chosen automatically, doors (lot B); modes under delirium, Valgavoth, player
 * Aura, choice by the opponent, ninjutsu, delayed trigger by emblem, global alternative cost, Nowhere to Run,
 * Marvin, Found Footage (lots C and D).
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import * as dsl from "../src/dsl";
import { putFaceDown } from "../src/effects";
import { RulesError } from "../src/errors";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { chars, createObject, moveObject, registerDef, rulesEvent, turnFaceUp } from "../src/state";
import { plainText } from "../src/text";
import type { GameState } from "../src/types";
import { projectView } from "../src/view";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  canActivate,
  cast,
  castable,
  castNowOf,
  combatTargetsOffered,
  customCard,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passUntil,
  picking,
  pickNamed,
  scenario,
  settle as settleAnswering,
  settleNoBlocks,
  steal,
  throughCombat,
  untilCastNow,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const ROOM = "Grand Entryway // Elegant Rotunda";

describe("Duskmourn", () => {
  it("Eerie: an enchantment enters, then a fully unlocked Room", () => {
    let s = scenario({ p1: { battlefield: ["Balemurk Leech", ...lands("Plains", 5)], hand: [ROOM] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ROOM), face: 0 });
    s = settle(s);
    // The Room enters (enchantment), then the door creates a Glimmer (enchantment creature): two triggers.
    expect(idsOf(s, "p1", "battlefield", "Glimmer")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(18);
    const room = idOf(s, "p1", "battlefield", ROOM);
    const unlock = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === room);
    s = act(s, "p1", { type: "activate", source: room, ability: unlock?.type === "activate" ? unlock.ability : -1 });
    s = settle(s);
    // Fully unlocked Room: a third trigger.
    expect(s.players.p2?.life).toBe(17);
  });

  it("Survival: at the beginning of the second main phase, only if the creature is tapped", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Cautious Survivor", tapped: true }, "Cautious Survivor"] } });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p1?.life).toBe(22);
  });

  it("Survival: only the turn's second main phase, whether added or not (Waves of Aggression)", () => {
    const side = {
      battlefield: [{ name: "Cautious Survivor", tapped: true }, ...lands("Mountain", 5)],
      hand: ["Waves of Aggression"],
    };
    // Cast in the first main phase: the main phase added after the added combat is the turn's second.
    let s = scenario({ p1: side });
    s = settle(cast(s, "p1", "Waves of Aggression"));
    s = advanceUntil(s, (x) => (x.turn.combats ?? 0) === 2);
    expect(s.players.p1?.life).toBe(22);
    // The normal main phase, third of the turn, no longer triggers it.
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p1?.life).toBe(22);
    // Cast in the second main phase: the added main phase is the third.
    let t = scenario({ step: "main2", p1: side });
    t = settle(cast(t, "p1", "Waves of Aggression"));
    t = advanceUntil(t, (x) => x.turn.step === "end");
    expect(t.turn.mainPhase).toBe(3);
    expect(t.players.p1?.life).toBe(20);
  });

  it("Delirium: four card types in your graveyard", () => {
    const three = scenario({ p1: { battlefield: ["Spineseeker Centipede"], graveyard: ["Opt", "Forest", "Llanowar Elves"] } });
    expect(chars(three, idOf(three, "p1", "battlefield", "Spineseeker Centipede")).power).toBe(2);
    const four = scenario({
      p1: { battlefield: ["Spineseeker Centipede"], graveyard: ["Opt", "Forest", "Llanowar Elves", "Pyroclasm"] },
      // The opponent's graveyard does not count.
      p2: { graveyard: ["Pyroclasm"] },
    });
    const c = chars(four, idOf(four, "p1", "battlefield", "Spineseeker Centipede"));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toContain("vigilance");
  });

  it("manifest dread by the controller of the destroyed creature (Unwanted Remake)", () => {
    let s = scenario({
      p1: { battlefield: ["Plains"], hand: ["Unwanted Remake"] },
      p2: { battlefield: ["Shivan Dragon"], library: ["Forest", "Island", "Swamp"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Unwanted Remake"),
      targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] },
    });
    s = settle(s);
    const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
    expect(faceDown).toHaveLength(1);
    expect(s.objects[faceDown[0] as string]?.controller).toBe("p2");
    // The Dragon and the non-manifested card go to p2's graveyard.
    expect(s.players.p2?.graveyard).toHaveLength(2);
  });

  it("Impending: cast for its impending cost, it enters with time counters and is not a creature", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Overlord of the Mistmoors"] } });
    const card = idOf(s, "p1", "hand", "Overlord of the Mistmoors");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(opt?.type === "cast" && plainText(opt.altLabel ?? "")).toBe("Impending 4 — {2}{W}{W}");
    s = act(s, "p1", { type: "cast", card, alternative: true });
    s = settle(s);
    const overlord = idOf(s, "p1", "battlefield", "Overlord of the Mistmoors");
    expect(s.objects[overlord]?.counters.time).toBe(4);
    expect(chars(s, overlord).types).toEqual(["Enchantment"]);
    expect(idsOf(s, "p1", "battlefield", "Insect")).toHaveLength(2);
    // End step: a time counter is removed.
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(s.objects[overlord]?.counters.time).toBe(3);
  });

  it("Enduring: it dies and comes back as a noncreature enchantment", () => {
    let s = scenario({ p1: { battlefield: ["Enduring Innocence", ...lands("Mountain", 2)], hand: ["Pyroclasm"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    const back = idOf(s, "p1", "battlefield", "Enduring Innocence");
    expect(chars(s, back).types).toEqual(["Enchantment"]);
    expect(chars(s, back).subtypes).toEqual([]);
  });

  it("additional cost chosen automatically: the exiled creature is linked to Fear of Abduction", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Plains", 6)], hand: ["Fear of Abduction"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Abduction") });
    expect(s.objects[elves]).toBeUndefined(); // exiled to pay the cost
    s = settle(s);
    const fear = idOf(s, "p1", "battlefield", "Fear of Abduction");
    const linked = (s.objects[fear]?.linked ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(linked.sort()).toEqual(["Llanowar Elves", "Shivan Dragon"]);
  });

  it("Keys to the House: lock or unlock a door of your choice", () => {
    let s = scenario({ p1: { battlefield: ["Keys to the House", ...lands("Plains", 6)], hand: [ROOM] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ROOM), face: 0 });
    s = settle(s);
    const room = idOf(s, "p1", "battlefield", ROOM);
    const keys = idOf(s, "p1", "battlefield", "Keys to the House");
    const toggle = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === keys && a.label?.includes("door"));
    s = act(s, "p1", {
      type: "activate",
      source: keys,
      ability: toggle?.type === "activate" ? toggle.ability : -1,
      targets: { r: [room] },
    });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.length === 0);
    // Two possible doors: lock Grand Entryway or unlock Elegant Rotunda.
    expect(s.pending?.kind === "choice" && s.pending.request.type === "pick" && s.pending.request.options).toHaveLength(2);
    s = act(s, "p1", { type: "choose", values: [`${room}#0`] });
    s = settle(s);
    expect(s.objects[room]?.unlocked).toEqual([]);
  });

  it("Let's Play a Game: one mode, or several with delirium", () => {
    const modes = (s: S) => {
      const card = idOf(s, "p1", "hand", "Let's Play a Game");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      return opt?.type === "cast" ? opt.modes.length : 0;
    };
    const hand = { battlefield: lands("Swamp", 4), hand: ["Let's Play a Game"] };
    expect(modes(scenario({ p1: hand }))).toBe(3);
    expect(modes(scenario({ p1: { ...hand, graveyard: ["Opt", "Forest", "Llanowar Elves", "Pyroclasm"] } }))).toBe(7);
  });

  it("Valgavoth: the opposing creature that dies is exiled and can be cast during your turn for life", () => {
    let s = scenario({
      p1: { battlefield: ["Valgavoth, Terror Eater", ...lands("Mountain", 2)], hand: ["Pyroclasm"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    const cub = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Bear Cub") as string;
    expect(cub).toBeDefined();
    expect(s.players.p2?.graveyard.some((id) => s.objects[id]?.defId === s.objects[cub]?.defId)).toBe(false);
    s = act(s, "p1", { type: "cast", card: cub });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Grievous Wound: the enchanted player no longer gains life and loses half their life when damaged", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), ...lands("Mountain", 2)], hand: ["Grievous Wound", "Lightning Strike"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Grievous Wound"), targets: { enchant: ["p2"] } });
    s = settle(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Grievous Wound")]?.attachedTo).toBe("p2");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = settle(s);
    // 20 - 3 = 17, then half rounded up (9): 8.
    expect(s.players.p2?.life).toBe(8);
  });

  it("Trial of Agony: the opponent chooses the creature that is dealt 5 damage; the other can't block", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain"], hand: ["Trial of Agony"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Trial of Agony"), targets: { t: [cub, elves] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice" && x.pending.player === "p2");
    s = act(s, "p2", { type: "choose", values: [elves] });
    s = settle(s);
    expect(s.objects[elves]).toBeUndefined();
    expect(chars(s, cub).keywords).toContain("cantBlock");
  });

  it("Kaito: ninjutsu with an unblocked attacker; it is a creature during your turn", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", "Island", "Swamp", "Swamp"], hand: ["Kaito, Bane of Nightmares"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: elves, defender: "p2" }] });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", { type: "declareBlockers", blocks: [] });
    const kaito = idOf(s, "p1", "hand", "Kaito, Bane of Nightmares");
    const ninjutsu = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === kaito);
    expect(ninjutsu).toBeDefined();
    s = act(s, "p1", { type: "activate", source: kaito, ability: ninjutsu?.type === "activate" ? ninjutsu.ability : -1 });
    expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
    s = passBoth2(s);
    const k = idOf(s, "p1", "battlefield", "Kaito, Bane of Nightmares");
    expect(s.combat?.attackers.some((a) => a.id === k)).toBe(true);
    expect(chars(s, k)).toMatchObject({ power: 3, toughness: 4 });
    expect(chars(s, k).types).toEqual(expect.arrayContaining(["Planeswalker", "Creature"]));
  });

  it("Turn Inside Out: when the creature dies this turn, you manifest dread", () => {
    let s = scenario({
      p1: {
        battlefield: ["Llanowar Elves", ...lands("Mountain", 3)],
        hand: ["Turn Inside Out", "Pyroclasm"],
        library: lands("Forest", 4),
      },
    });
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Turn Inside Out"), targets: { t: [elves] } });
    s = settle(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    expect(s.battlefield.filter((id) => s.objects[id]?.faceDown && s.objects[id]?.controller === "p1")).toHaveLength(1);
  });

  it("Turn Inside Out: a delayed ability (no emblem); the targeted opposing creature that dies this turn, not the next", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 1), hand: ["Turn Inside Out"], library: lands("Forest", 4) },
      p2: { battlefield: ["Llanowar Elves", "Bear Cub"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Turn Inside Out"), targets: { t: [elves] } });
    s = settle(s);
    expect(s.players.p1?.command).toHaveLength(0);
    // Another creature that dies triggers nothing.
    moveObject(s, bear, "graveyard");
    expect(s.triggers).toHaveLength(0);
    moveObject(s, elves, "graveyard");
    expect(s.triggers.map((t) => t.controller)).toEqual(["p1"]);
    s = settleAnswering(s);
    expect(s.battlefield.filter((id) => s.objects[id]?.faceDown && s.objects[id]?.controller === "p1")).toHaveLength(1);
    // On the next turn, the ability has ended.
    let t = scenario({
      p1: { battlefield: lands("Mountain", 1), hand: ["Turn Inside Out"], library: lands("Forest", 4) },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const elves2 = idOf(t, "p2", "battlefield", "Llanowar Elves");
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Turn Inside Out"), targets: { t: [elves2] } }));
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    moveObject(t, elves2, "graveyard");
    expect(t.triggers).toHaveLength(0);
  });

  it("Leyline of Mutation: {W}{U}{B}{R}{G} instead of the mana cost", () => {
    let s = scenario({
      p1: { battlefield: ["Leyline of Mutation", "Plains", "Island", "Swamp", "Mountain", "Forest"], hand: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p1", "hand", "Shivan Dragon");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dragon);
    expect(opt?.type === "cast" && plainText(opt.altLabel ?? "")).toBe("Leyline of Mutation — {W}{U}{B}{R}{G}");
    s = act(s, "p1", { type: "cast", card: dragon, alternative: true });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Nowhere to Run: hexproof ignored, ward that does not trigger", () => {
    const hexproof = customCard({ name: "Test Hexproof", power: 2, toughness: 2, keywords: ["hexproof"] });
    let s = scenario({
      p1: { battlefield: ["Nowhere to Run", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: [hexproof, "Lionheart Glimmer"] },
    });
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike") as [string, string];
    const hex = idOf(s, "p2", "battlefield", "Test Hexproof");
    const glimmer = idOf(s, "p2", "battlefield", "Lionheart Glimmer");
    s = act(s, "p1", { type: "cast", card: a, targets: { t: [hex] } });
    s = settle(s);
    expect(s.objects[hex]).toBeUndefined();
    s = act(s, "p1", { type: "cast", card: b, targets: { t: [glimmer] } });
    // Ward does not trigger: nothing else on the stack but the spell.
    expect(s.stack).toHaveLength(1);
    s = settle(s);
    expect(s.objects[glimmer]?.damage).toBe(3);
  });

  it("Marvin: it has the activated abilities of your other creatures", () => {
    const s = scenario({ p1: { battlefield: ["Marvin, Murderous Mimic", "Ragged Playmate"] } });
    const labels = chars(s, idOf(s, "p1", "battlefield", "Marvin, Murderous Mimic")).abilities.map((ab) =>
      "label" in ab ? ab.label : undefined,
    );
    expect(labels).toContain("A creature with power 2 or less can't be blocked");
  });

  it("Found Footage: you see your opponents' face-down creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Found Footage", "Plains"], hand: ["Unwanted Remake"] },
      p2: { battlefield: ["Bear Cub"], library: ["Llanowar Elves", "Forest"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Unwanted Remake"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    const hidden = s.battlefield.find((id) => s.objects[id]?.faceDown) as string;
    expect(projectView(s, "p1").battlefield.find((o) => o.id === hidden)?.faceDownCard).toBeDefined();
  });
});

/** Priority passed until the stack is empty. */
const passBoth2 = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");

describe("Duskmourn: meta cards checked against their Oracle text (PLAN-C, lot C13)", () => {
  const manaColors = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : []));

  it("Floodfarm Verge, Gloomlake Verge, Blazemire Verge, Hushwood Verge: the second color with one of the two basic land types", () => {
    const verges: [string, string, string, [string, string]][] = [
      ["Floodfarm Verge", "W", "U", ["Plains", "Island"]],
      ["Gloomlake Verge", "U", "B", ["Island", "Swamp"]],
      ["Blazemire Verge", "B", "R", ["Swamp", "Mountain"]],
      ["Hushwood Verge", "G", "W", ["Forest", "Plains"]],
    ];
    for (const [name, always, second, types] of verges) {
      const alone = scenario({ p1: { battlefield: [name] } });
      const v = idOf(alone, "p1", "battlefield", name);
      expect(manaColors(alone, v), name).toEqual([always]);
      // The conditional ability does not activate without the right land type.
      expect(() => act(alone, "p1", { type: "tapForMana", source: v, ability: 1 }), name).toThrow();
      for (const basic of types) {
        let s = scenario({ p1: { battlefield: [name, basic] } });
        const id = idOf(s, "p1", "battlefield", name);
        expect(manaColors(s, id), `${name} + ${basic}`).toEqual([always, second]);
        s = act(s, "p1", { type: "tapForMana", source: id, ability: 1 });
        expect(s.players.p1?.manaPool[second as "W"], `${name} + ${basic}`).toBe(1);
      }
    }
  });

  it("Unholy Annex // Ritual Chamber: draw and lose 2 life without a Demon; the door creates a 6/6 flying Demon, then drains 2", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 8), hand: ["Unholy Annex // Ritual Chamber"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Unholy Annex // Ritual Chamber"), face: 0 });
    s = settle(s);
    // End step without a Demon: a card drawn, 2 life lost.
    let t = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(t.players.p1?.life).toBe(18);
    expect(t.players.p2?.life).toBe(20);
    // Ritual Chamber unlocked: a 6/6 flying Demon token; the end step then drains 2 life.
    const room = idOf(s, "p1", "battlefield", "Unholy Annex // Ritual Chamber");
    const unlock = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === room);
    s = act(s, "p1", { type: "activate", source: room, ability: unlock?.type === "activate" ? unlock.ability : -1 });
    s = settle(s);
    const demon = idOf(s, "p1", "battlefield", "Demon");
    expect(chars(s, demon)).toMatchObject({ power: 6, toughness: 6 });
    expect(chars(s, demon).keywords).toContain("flying");
    expect(chars(s, demon).colors).toEqual(["B"]);
    t = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(t.players.p1?.hand).toHaveLength(1);
    expect(t.players.p1?.life).toBe(22);
    expect(t.players.p2?.life).toBe(18);
  });

  it("Ghost Vacuum: exiles a card from a graveyard; later, the exiled creatures come back as 1/1 Spirits with a flying counter", () => {
    let s = scenario({
      p1: { battlefield: ["Ghost Vacuum", ...lands("Plains", 6)] },
      p2: { graveyard: ["Shivan Dragon", "Opt"] },
    });
    const vacuum = idOf(s, "p1", "battlefield", "Ghost Vacuum");
    s = act(s, "p1", {
      type: "activate",
      source: vacuum,
      ability: 0,
      targets: { t: [idOf(s, "p2", "graveyard", "Shivan Dragon")] },
    });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
    expect(s.players.p2?.graveyard).toHaveLength(1);
    // On the next turn (artifact untapped): {6}, {T}, sacrifice, at sorcery speed.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    s = act(s, "p1", { type: "activate", source: vacuum, ability: 1 });
    s = settle(s);
    expect(s.objects[vacuum]).toBeUndefined();
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    const c = chars(s, dragon);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Dragon", "Spirit"]));
    expect(c.keywords).toContain("flying");
    expect(s.objects[dragon]?.counters.flying).toBe(1);
    expect(s.objects[dragon]?.owner).toBe("p2");
  });

  it("Sheltered by Ghosts: exiles an opposing permanent until it leaves; +1/+0, lifelink and ward {2}", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Mountain", 2)],
        hand: ["Sheltered by Ghosts", "Pyroclasm"],
      },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sheltered by Ghosts"), targets: { enchant: [cub] } });
    s = settleAnswering(s, picking([dragon]));
    expect(s.objects[dragon]).toBeUndefined();
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
    const c = chars(s, cub);
    expect([c.power, c.toughness]).toEqual([3, 2]);
    expect(c.keywords).toEqual(expect.arrayContaining(["lifelink", "ward"]));
    // The enchanted creature dies, the Aura leaves: the Dragon comes back.
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Sheltered by Ghosts")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Floodpits Drowner: taps an opposing creature with a stun counter; then shuffles them into the libraries", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Floodpits Drowner"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Floodpits Drowner") });
    s = settleAnswering(s, picking([dragon]));
    expect(s.objects[dragon]?.tapped).toBe(true);
    expect(s.objects[dragon]?.counters.stun).toBe(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Floodpits Drowner")).keywords).toEqual(
      expect.arrayContaining(["flash", "vigilance"]),
    );
    // {1}{U}, {T}: it and the stunned creature return to their owner's library.
    let t = scenario({
      p1: { battlefield: ["Floodpits Drowner", ...lands("Island", 2)], library: lands("Island", 3) },
      p2: {
        battlefield: [{ name: "Shivan Dragon", tapped: true, counters: { stun: 1 } }, "Bear Cub"],
        library: lands("Forest", 3),
      },
    });
    const drowner = idOf(t, "p1", "battlefield", "Floodpits Drowner");
    const d2 = idOf(t, "p2", "battlefield", "Shivan Dragon");
    const ab = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === drowner);
    const index = ab?.type === "activate" ? ab.ability : -1;
    // A creature without a stun counter is not a target.
    expect(() =>
      act(t, "p1", {
        type: "activate",
        source: drowner,
        ability: index,
        targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] },
      }),
    ).toThrow();
    t = act(t, "p1", { type: "activate", source: drowner, ability: index, targets: { t: [d2] } });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Floodpits Drowner")).toHaveLength(0);
    expect(idsOf(t, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(t.players.p1?.library.map((id) => nameOf(t, id))).toContain("Floodpits Drowner");
    expect(t.players.p2?.library.map((id) => nameOf(t, id))).toContain("Shivan Dragon");
  });

  it("Enduring Curiosity: a creature of yours damages a player, draw; dead, it comes back as an enchantment", () => {
    let s = scenario({
      p1: {
        battlefield: ["Enduring Curiosity", "Bear Cub", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        library: lands("Island", 3),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const curiosity = idOf(s, "p1", "battlefield", "Enduring Curiosity");
    s = attack(s, [cub, curiosity]);
    s = throughCombat(s);
    // Two creatures damage the player: two cards.
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.hand).toHaveLength(3);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [curiosity] } });
    s = settle(s);
    const back = idOf(s, "p1", "battlefield", "Enduring Curiosity");
    expect(chars(s, back).types).toEqual(["Enchantment"]);
  });

  it("Chainsaw: 3 damage on entering; a rev counter per batch of deaths; +X/+0 to the equipped creature", () => {
    let s = scenario({
      p1: { battlefield: ["Llanowar Elves", ...lands("Mountain", 5)], hand: ["Chainsaw"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Chainsaw") });
    s = settleAnswering(s, picking([cub]));
    expect(s.objects[cub]).toBeUndefined();
    const saw = idOf(s, "p1", "battlefield", "Chainsaw");
    expect(s.objects[saw]?.counters.rev).toBe(1);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const equip = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === saw);
    s = act(s, "p1", {
      type: "activate",
      source: saw,
      ability: equip?.type === "activate" ? equip.ability : -1,
      targets: { t: [elves] },
    });
    s = settle(s);
    expect(chars(s, elves)).toMatchObject({ power: 2, toughness: 1 });
    // Several creatures die together: a single counter.
    let t = scenario({
      p1: { battlefield: ["Chainsaw", ...lands("Mountain", 2)], hand: ["Pyroclasm"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Pyroclasm") });
    t = settle(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Chainsaw")]?.counters.rev).toBe(1);
  });

  it("Get Out: counters a creature spell, or returns one or two of your creatures or enchantments", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Get Out"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Get Out"), mode: 0, targets: { t: [spell] } });
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: ["Bear Cub", "Nowhere to Run", "Llanowar Elves", ...lands("Island", 2)], hand: ["Get Out"] },
    });
    const targets = [idOf(t, "p1", "battlefield", "Bear Cub"), idOf(t, "p1", "battlefield", "Nowhere to Run")];
    // "One or two targets": at least one.
    expect(() => act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Get Out"), mode: 1, targets: { b: [] } })).toThrow();
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Get Out"), mode: 1, targets: { b: targets } });
    t = settle(t);
    expect(namesIn(t, t.players.p1?.hand).sort()).toEqual(["Bear Cub", "Nowhere to Run"]);
    expect(idsOf(t, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
  });

  it('Get Out: "you own" - a creature stolen by the opponent comes back to your hand, not a creature you stole from them', () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 2)], hand: ["Get Out"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    steal(s, bear, "p2");
    steal(s, elves, "p1");
    const getOut = idOf(s, "p1", "hand", "Get Out");
    expect(() => act(s, "p1", { type: "cast", card: getOut, mode: 1, targets: { b: [elves] } })).toThrow();
    s = settle(act(s, "p1", { type: "cast", card: getOut, mode: 1, targets: { b: [bear] } }));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
  });

  it("Split Up: destroys all tapped creatures, or all untapped ones", () => {
    const board = {
      p1: { battlefield: [{ name: "Llanowar Elves", tapped: true }, "Bear Cub", ...lands("Plains", 3)], hand: ["Split Up"] },
      p2: { battlefield: [{ name: "Shivan Dragon", tapped: true }, "Serra Angel"] },
    };
    let s = scenario(board);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Split Up"), mode: 0 });
    s = settle(s);
    expect(
      namesIn(
        s,
        s.battlefield.filter((id) => chars(s, id).types.includes("Creature")),
      ).sort(),
    ).toEqual(["Bear Cub", "Serra Angel"]);
    let t = scenario(board);
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Split Up"), mode: 1 });
    t = settle(t);
    expect(
      namesIn(
        t,
        t.battlefield.filter((id) => chars(t, id).types.includes("Creature")),
      ).sort(),
    ).toEqual(["Llanowar Elves", "Shivan Dragon"]);
  });

  it("Unidentified Hovership: exiles a creature with toughness 5 or less; when it leaves, its owner manifests dread", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Unidentified Hovership", "Bovine Intervention"] },
      p2: { battlefield: ["Shivan Dragon"], library: lands("Forest", 3) },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Unidentified Hovership") });
    s = settleAnswering(s, picking([dragon]));
    expect(s.objects[dragon]).toBeUndefined();
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
    const ship = idOf(s, "p1", "battlefield", "Unidentified Hovership");
    expect(chars(s, ship).keywords).toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bovine Intervention"), targets: { t: [ship] } });
    s = settle(s);
    // The owner of the exiled card (p2) manifests dread; the Dragon stays in exile.
    const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
    expect(faceDown).toHaveLength(1);
    expect(s.objects[faceDown[0] as string]?.controller).toBe("p2");
    expect(s.exile.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(true);
  });

  it("Unidentified Hovership: the owner of the exiled creature is the one who manifests, even if another controlled it", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 5),
        hand: ["Unidentified Hovership", "Bovine Intervention"],
        library: lands("Plains", 3),
      },
      p2: { battlefield: ["Shivan Dragon"], library: lands("Forest", 3) },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    steal(s, dragon, "p1");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Unidentified Hovership") });
    s = settleAnswering(s, picking([dragon]));
    const ship = idOf(s, "p1", "battlefield", "Unidentified Hovership");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bovine Intervention"), targets: { t: [ship] } }));
    const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
    expect(faceDown.map((id) => s.objects[id]?.controller)).toEqual(["p2"]);
  });
});

// ---------------------------------------------------------------------------
// Lot K8: mythic, rare and uncommon cards never named in a test, checked against their Oracle text.
// ---------------------------------------------------------------------------

/** Four card types (instant, land, creature, sorcery): delirium. */
const DELIRIUM = ["Opt", "Forest", "Llanowar Elves", "Pyroclasm"];
/** Opens doors of a Room set up by `scenario` (without triggering "when you unlock"). */
const openDoors = (s: S, name: string, doors: number[], player = "p1") => {
  const id = idOf(s, player, "battlefield", name);
  const o = s.objects[id];
  if (o) o.unlocked = doors;
  bump(s);
  return id;
};
/** Unlocks the Room's still-locked door (special action, at sorcery speed). */
const unlock = (s: S, room: string, player = "p1") => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === room);
  return act(s, player, { type: "activate", source: room, ability: a?.type === "activate" ? a.ability : -1 });
};
/** Activates ability `index` (order of the source's activatable abilities in `legalActions`). */
const activateNth = (s: S, source: string, index = 0, extra: object = {}, player = "p1") => {
  const all = legalActions(s, player).filter((x) => x.type === "activate" && x.source === source);
  const a = all[index];
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
};
/** Answers "yes" or "no" to questions, and chooses the wanted objects when they are offered. */
const answering =
  (opts: { yes?: boolean | Record<string, boolean>; pick?: string[] } = {}) =>
  (req: Parameters<ReturnType<typeof picking>>[0], player: string) => {
    if (req.type === "yesNo" && opts.yes !== undefined) {
      const yes = typeof opts.yes === "boolean" ? opts.yes : opts.yes[player];
      return yes === undefined ? undefined : [yes ? 1 : 0];
    }
    return opts.pick ? picking(opts.pick)(req) : undefined;
  };
const faceDownOf = (s: S, player: string) =>
  s.battlefield.filter((id) => s.objects[id]?.faceDown && s.objects[id]?.controller === player);
const creaturesOf = (s: S, player: string) =>
  namesIn(
    s,
    s.battlefield.filter((id) => s.objects[id]?.controller === player && chars(s, id).types.includes("Creature")),
  ).sort();

describe("Duskmourn, lot K8: mythics", () => {
  it("Charred Foyer: at your upkeep, the top card is exiled and playable this turn", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Charred Foyer // Warped Space"], library: ["Mountain", "Forest", "Forest"] },
    });
    openDoors(s, "Charred Foyer // Warped Space", [0]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") as string;
    expect(mountain).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    // On p1's next turn, it is no longer playable.
    const later = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > s.turn.number);
    expect(legalActions(later, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
  });

  it("Warped Space: once per turn, a spell cast from exile can cost {0}", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Charred Foyer // Warped Space"], library: ["Shivan Dragon", "Forest", "Forest"] },
    });
    openDoors(s, "Charred Foyer // Warped Space", [0, 1]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const dragon = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dragon);
    expect(opt?.type === "cast" && opt.freeAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card: dragon, free: true });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    // Once per turn only: the second exiled card (Painter's Studio) is paid for.
    let t = scenario({
      p1: {
        battlefield: ["Charred Foyer // Warped Space", "Painter's Studio // Defaced Gallery", ...lands("Mountain", 3)],
        library: ["Bear Cub", "Llanowar Elves", "Forest"],
      },
    });
    openDoors(t, "Charred Foyer // Warped Space", [1]);
    const studio = openDoors(t, "Painter's Studio // Defaced Gallery", [1]);
    t = settle(unlock(t, studio));
    const freeOf = (x: S, name: string) => {
      const card = x.exile.find((id) => nameOf(x, id) === name) as string;
      const o = legalActions(x, "p1").find((a) => a.type === "cast" && a.card === card);
      return [card, o?.type === "cast" && !!o.freeAvailable] as const;
    };
    const [cub, cubFree] = freeOf(t, "Bear Cub");
    expect(cubFree).toBe(true);
    t = settle(act(t, "p1", { type: "cast", card: cub, free: true }));
    expect(freeOf(t, "Llanowar Elves")[1]).toBe(false);
  });

  it("Dollmaker's Shop: when you attack a player, a 1/1 white Toy artifact creature token", () => {
    let s = scenario({ p1: { battlefield: ["Dollmaker's Shop // Porcelain Gallery", "Bear Cub"] } });
    openDoors(s, "Dollmaker's Shop // Porcelain Gallery", [0]);
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settle(s);
    const toy = idOf(s, "p1", "battlefield", "Toy");
    expect(chars(s, toy)).toMatchObject({ power: 1, toughness: 1, colors: ["W"] });
    expect(chars(s, toy).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });

  it("Porcelain Gallery: your creatures have base P/T equal to the number of creatures you control", () => {
    const s = scenario({
      p1: { battlefield: ["Dollmaker's Shop // Porcelain Gallery", "Shivan Dragon", "Llanowar Elves", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    openDoors(s, "Dollmaker's Shop // Porcelain Gallery", [1]);
    for (const name of ["Shivan Dragon", "Llanowar Elves", "Bear Cub"])
      expect(chars(s, idOf(s, "p1", "battlefield", name)), name).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toMatchObject({ power: 4, toughness: 4 });
  });

  it("Funeral Room: each creature of yours that dies drains 1; not the opponent's", () => {
    let s = scenario({
      p1: {
        battlefield: ["Funeral Room // Awakening Hall", "Bear Cub", "Llanowar Elves", ...lands("Mountain", 2)],
        hand: ["Pyroclasm"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    openDoors(s, "Funeral Room // Awakening Hall", [0]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Pyroclasm") });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Awakening Hall: when unlocked, all creature cards in your graveyard come back", () => {
    let s = scenario({
      p1: {
        battlefield: ["Funeral Room // Awakening Hall", ...lands("Swamp", 8)],
        graveyard: ["Bear Cub", "Shivan Dragon", "Opt"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const room = openDoors(s, "Funeral Room // Awakening Hall", [0]);
    s = unlock(s, room);
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub", "Shivan Dragon"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Llanowar Elves"]);
  });

  it("Hauntwoods Shrieker: it manifests dread when attacking; {1}{G} reveals a face-down permanent and turns a creature up", () => {
    let s = scenario({
      p1: { battlefield: ["Hauntwoods Shrieker", ...lands("Forest", 2)], library: ["Shivan Dragon", "Island", "Forest"] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Hauntwoods Shrieker")]);
    s = settleNoBlocks(s, (req) => pickNamed(s, req, "Shivan Dragon"));
    const [hidden] = faceDownOf(s, "p1");
    expect(hidden).toBeDefined();
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Island"]);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Hauntwoods Shrieker"), 0, { targets: { t: [hidden as string] } });
    s = settleAnswering(s, answering({ yes: true }));
    expect(s.objects[hidden as string]?.faceDown).toBeUndefined();
    expect(nameOf(s, hidden as string)).toBe("Shivan Dragon");
    // A revealed land card stays face down.
    let t = scenario({
      p1: { battlefield: ["Hauntwoods Shrieker", ...lands("Forest", 2)], library: ["Shivan Dragon", "Island", "Forest"] },
    });
    t = attack(t, [idOf(t, "p1", "battlefield", "Hauntwoods Shrieker")]);
    t = settleNoBlocks(t, (req, _p, cur) => pickNamed(cur, req, "Island"));
    const [land] = faceDownOf(t, "p1") as [string];
    t = activateNth(t, idOf(t, "p1", "battlefield", "Hauntwoods Shrieker"), 0, { targets: { t: [land] } });
    t = settleAnswering(t, answering({ yes: true }));
    expect(t.objects[land]?.faceDown).toBeDefined();
  });

  it("Meathook Massacre II: each player sacrifices X creatures; paying 3 life brings yours back, the opponent who doesn't pay gives you theirs", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 6)], hand: ["Meathook Massacre II"] },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Meathook Massacre II"), x: 1 });
    s = settleAnswering(s, answering({ yes: { p1: true, p2: false }, pick: [angel] }));
    expect(s.players.p1?.life).toBe(17);
    expect(s.players.p2?.life).toBe(20);
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub", "Serra Angel"]);
    expect(creaturesOf(s, "p2")).toEqual(["Llanowar Elves"]);
    for (const name of ["Bear Cub", "Serra Angel"])
      expect(s.objects[idOf(s, "p1", "battlefield", name)]?.counters.finality, name).toBe(1);
    // The opponent who pays 3 life keeps their card in the graveyard.
    let t = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Meathook Massacre II"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Meathook Massacre II"), x: 1 });
    t = settleAnswering(t, answering({ yes: { p2: true } }));
    expect(t.players.p2?.life).toBe(17);
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Serra Angel"]);
    expect(creaturesOf(t, "p1")).toEqual([]);
  });

  it("Mirror Room: when unlocked, a token copy of one of your creatures, which is also a Reflection", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Mirror Room // Fractured Realm"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mirror Room // Fractured Realm"), face: 0 });
    s = settleAnswering(s, picking([cub]));
    const copies = idsOf(s, "p1", "battlefield", "Bear Cub").filter((id) => id !== cub);
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.isToken).toBe(true);
    expect(chars(s, copies[0] as string).subtypes).toEqual(expect.arrayContaining(["Bear", "Reflection"]));
  });

  it("Fractured Realm: a triggered ability of one of your permanents triggers one more time", () => {
    let s = scenario({
      p1: { battlefield: ["Mirror Room // Fractured Realm", ...lands("Island", 3)], hand: ["Tunnel Surveyor"] },
    });
    openDoors(s, "Mirror Room // Fractured Realm", [1]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tunnel Surveyor") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Glimmer")).toHaveLength(2);
  });

  it("Niko: two Shards; {2}, {T}: a nonlegendary creature exiled, the Shards copy it until the end step", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Plains", "Plains", "Island", "Island"], hand: ["Niko, Light of Hope"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Niko, Light of Hope") });
    s = settle(s);
    const shards = idsOf(s, "p1", "battlefield", "Shard");
    expect(shards).toHaveLength(2);
    expect(chars(s, shards[0] as string).types).toEqual(["Enchantment"]);
    // On the next turn: Niko can't target a legendary creature (itself).
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    const niko = idOf(s, "p1", "battlefield", "Niko, Light of Hope");
    expect(() => activateNth(s, niko, 0, { targets: { t: [niko] } })).toThrow();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activateNth(s, niko, 0, { targets: { t: [cub] } });
    s = settle(s);
    expect(s.objects[cub]).toBeUndefined();
    for (const id of shards) expect(chars(s, id)).toMatchObject({ name: "Bear Cub", power: 2, toughness: 2 });
    // At the end step, the creature comes back and the Shards become Shards again.
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    for (const id of shards) expect(chars(s, id).name).toBe("Shard");
  });

  it("Overlord of the Balemurk: mill 4, then a non-Avatar creature or a planeswalker to hand (not an Avatar)", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 2),
        hand: ["Overlord of the Balemurk"],
        library: ["Overlord of the Mistmoors", "Bear Cub", "Opt", "Forest", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Balemurk"), alternative: true });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options) as string[];
      return pickNamed(cur, req, "Bear Cub");
    });
    expect(offered).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt", "Overlord of the Mistmoors"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Overlord of the Balemurk")]?.counters.time).toBe(5);
  });

  it("Overlord of the Boilerbilges: 4 damage to any target, on entering as on attacking", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Overlord of the Boilerbilges"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Boilerbilges"), alternative: true });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.life).toBe(16);
    let t = scenario({ p1: { battlefield: ["Overlord of the Boilerbilges"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = attack(t, [idOf(t, "p1", "battlefield", "Overlord of the Boilerbilges")]);
    t = settleNoBlocks(t, picking([angel]));
    expect(t.objects[angel]).toBeUndefined();
  });

  it("Overlord of the Floodpits: draw two cards, then discard one", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Overlord of the Floodpits"], library: ["Opt", "Forest", "Island"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Floodpits"), alternative: true });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Overlord of the Floodpits")]?.counters.time).toBe(4);
  });

  it("Overlord of the Hauntwoods: a tapped colorless Everywhere land, of all basic land types", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Overlord of the Hauntwoods"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Overlord of the Hauntwoods"), alternative: true });
    s = settle(s);
    const everywhere = idOf(s, "p1", "battlefield", "Everywhere");
    expect(s.objects[everywhere]?.tapped).toBe(true);
    const c = chars(s, everywhere);
    expect(c.types).toEqual(["Land"]);
    expect(c.colors).toEqual([]);
    expect(c.subtypes.sort()).toEqual(["Forest", "Island", "Mountain", "Plains", "Swamp"]);
  });

  it("The Rollercrusher Ride: X damage to each of up to X creatures; under delirium, your noncombat damage is doubled", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["The Rollercrusher Ride"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Rollercrusher Ride"), x: 2 });
    s = settleAnswering(s, picking([cub, dragon]));
    expect(s.objects[cub]).toBeUndefined();
    expect(s.objects[dragon]?.damage).toBe(2);
    // Delirium: noncombat damage from a source of yours is doubled, not combat damage.
    let t = scenario({
      p1: {
        battlefield: ["The Rollercrusher Ride", "Bear Cub", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        graveyard: DELIRIUM,
      },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    t = settle(t);
    expect(t.players.p2?.life).toBe(14);
    t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
    t = throughCombat(t);
    expect(t.players.p2?.life).toBe(12);
  });

  it("The Wandering Rescuer: your other tapped creatures have hexproof", () => {
    const s = scenario({
      p1: {
        battlefield: [{ name: "The Wandering Rescuer", tapped: true }, { name: "Bear Cub", tapped: true }, "Llanowar Elves"],
      },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    const kw = (p: string, name: string) => chars(s, idOf(s, p, "battlefield", name)).keywords;
    expect(kw("p1", "Bear Cub")).toContain("hexproof");
    expect(kw("p1", "Llanowar Elves")).not.toContain("hexproof");
    expect(kw("p1", "The Wandering Rescuer")).not.toContain("hexproof");
    expect(kw("p1", "The Wandering Rescuer")).toEqual(expect.arrayContaining(["flash", "convoke", "doubleStrike"]));
    expect(kw("p2", "Serra Angel")).not.toContain("hexproof");
  });

  it("Tyvar: tapping another creature makes it indestructible and taps it; {3}{G}{G}: +X/+X, X the greatest power", () => {
    let s = scenario({
      p1: { battlefield: ["Tyvar, the Pummeler", "Bear Cub", "Shivan Dragon", ...lands("Forest", 5)] },
    });
    const tyvar = idOf(s, "p1", "battlefield", "Tyvar, the Pummeler");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => activateNth(s, tyvar, 0, { tap: [tyvar] })).toThrow();
    s = activateNth(s, tyvar, 0, { tap: [cub] });
    s = settle(s);
    expect(s.objects[cub]?.tapped).toBe(true);
    expect(s.objects[tyvar]?.tapped).toBe(true);
    expect(chars(s, tyvar).keywords).toContain("indestructible");
    s = act(s, "p1", { type: "activate", source: tyvar, ability: 1 });
    s = settle(s);
    // Shivan Dragon (5): +5/+5.
    expect(chars(s, tyvar)).toMatchObject({ power: 8, toughness: 8 });
    expect(chars(s, cub)).toMatchObject({ power: 7, toughness: 7 });
  });

  it("Walk-In Closet: you may play lands from your graveyard", () => {
    const s = scenario({
      p1: { battlefield: ["Walk-In Closet // Forgotten Cellar"], graveyard: ["Forest", "Bear Cub"] },
    });
    openDoors(s, "Walk-In Closet // Forgotten Cellar", [0]);
    const forest = idOf(s, "p1", "graveyard", "Forest");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Bear Cub"))).toBe(false);
  });

  it("Forgotten Cellar: this turn, your spells are cast from the graveyard, and what would go to the graveyard is exiled", () => {
    let s = scenario({
      p1: {
        battlefield: ["Walk-In Closet // Forgotten Cellar", ...lands("Forest", 5), ...lands("Mountain", 2)],
        graveyard: ["Lightning Strike"],
      },
    });
    const room = openDoors(s, "Walk-In Closet // Forgotten Cellar", [0]);
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    expect(castable(s, "p1", strike)).toBe(false);
    s = unlock(s, room);
    s = settle(s);
    expect(castable(s, "p1", strike)).toBe(true);
    s = act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
    expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });
});

describe("Duskmourn, lot K8: rares (1)", () => {
  it("Balustrade Wurm: can't be countered; delirium, {2}{G}{G}: returns from the graveyard with a finality counter", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Balustrade Wurm"] },
      p2: { battlefield: lands("Island", 3), hand: ["Twist Reality"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Balustrade Wurm") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Twist Reality"), mode: 0, targets: { t: [spell] } });
    s = settle(s);
    const wurm = idOf(s, "p1", "battlefield", "Balustrade Wurm");
    expect(chars(s, wurm).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    // From the graveyard: only with delirium.
    const without = scenario({ p1: { battlefield: lands("Forest", 4), graveyard: ["Balustrade Wurm", "Opt", "Forest"] } });
    expect(canActivate(without, "p1", idOf(without, "p1", "graveyard", "Balustrade Wurm"))).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Forest", 4), graveyard: ["Balustrade Wurm", "Opt", "Forest", "Pyroclasm"] } });
    t = activateNth(t, idOf(t, "p1", "graveyard", "Balustrade Wurm"));
    t = settle(t);
    expect(t.objects[idOf(t, "p1", "battlefield", "Balustrade Wurm")]?.counters.finality).toBe(1);
  });

  it("Central Elevator: when unlocked, search for a Room card", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 4),
        hand: ["Central Elevator // Promising Stairs"],
        library: ["Bear Cub", ROOM, "Forest"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Central Elevator // Promising Stairs"), face: 0 });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(offered).toEqual([ROOM]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual([ROOM]);
  });

  it("Central Elevator: not a Room with the same name as a Room you control (either door's name; PLAN-L L4)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), ROOM],
        hand: ["Central Elevator // Promising Stairs"],
        library: [ROOM, "Central Elevator // Promising Stairs", "Funeral Room // Awakening Hall"],
      },
    });
    // The Room in play has its second door unlocked: it is named "Elegant Rotunda" (a locked Room has no name).
    openDoors(s, ROOM, [1]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Central Elevator // Promising Stairs"), face: 0 });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options) as string[];
      return undefined;
    });
    // The Room in play and Central Elevator itself (now a Room you control) are excluded.
    expect(offered).toEqual(["Funeral Room // Awakening Hall"]);
  });

  it("Promising Stairs: surveil 1 at upkeep; eight unlocked door names, you win the game", () => {
    const rooms = [
      "Central Elevator // Promising Stairs",
      ROOM,
      "Funeral Room // Awakening Hall",
      "Bottomless Pool // Locker Room",
    ];
    const setup = (allOpen: boolean) => {
      let s = scenario({ active: "p2", step: "main2", p1: { battlefield: rooms, library: ["Opt", "Forest", "Forest"] } });
      for (const [i, r] of rooms.entries()) openDoors(s, r, i === 3 && !allOpen ? [0] : [0, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && (x.pending?.kind === "choice" || x.turn.step === "draw"));
      // Surveil 1: Opt goes to the graveyard.
      return settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Opt"));
    };
    // Seven names: the surveil happens, no victory.
    const seven = setup(false);
    expect(seven.players.p2?.lost).toBeFalsy();
    expect(namesIn(seven, seven.players.p1?.graveyard)).toEqual(["Opt"]);
    const eight = setup(true);
    expect(eight.players.p2?.lost).toBe(true);
  });

  it("Come Back Wrong: destroys a creature, it comes back under your control and is sacrificed at your next end step", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Come Back Wrong"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Come Back Wrong"),
      targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Serra Angel"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(creaturesOf(s, "p1")).toEqual([]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Serra Angel"]);
  });

  it("Cursed Recording: a time counter per instant or sorcery; at the seventh, they are removed and it deals 20 damage to you", () => {
    let s = scenario({
      p1: {
        life: 25,
        battlefield: [{ name: "Cursed Recording", counters: { time: 5 } }, ...lands("Island", 2)],
        hand: ["Opt", "Opt"],
      },
    });
    const rec = idOf(s, "p1", "battlefield", "Cursed Recording");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
    s = settle(s);
    expect(s.objects[rec]?.counters.time).toBe(6);
    expect(s.players.p1?.life).toBe(25);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
    s = settle(s);
    expect(s.objects[rec]?.counters.time ?? 0).toBe(0);
    expect(s.players.p1?.life).toBe(5);
  });

  it("Cursed Recording: {T}: the next instant or sorcery cast this turn is copied", () => {
    let s = scenario({ p1: { battlefield: ["Cursed Recording", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    s = activateNth(s, idOf(s, "p1", "battlefield", "Cursed Recording"));
    s = settle(s);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(14);
  });

  it("Dazzling Theater: your creature spells have convoke", () => {
    const board = { battlefield: [...lands("Mountain", 2), ...Array(4).fill("Bear Cub")], hand: ["Shivan Dragon"] };
    const without = scenario({ p1: board });
    expect(castable(without, "p1", idOf(without, "p1", "hand", "Shivan Dragon"))).toBe(false);
    let s = scenario({ p1: { ...board, battlefield: [...board.battlefield, "Dazzling Theater // Prop Room"] } });
    openDoors(s, "Dazzling Theater // Prop Room", [0]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shivan Dragon") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Prop Room: your creatures untap during other players' untap steps (not your lands)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Dazzling Theater // Prop Room", { name: "Bear Cub", tapped: true }, { name: "Forest", tapped: true }],
      },
    });
    openDoors(s, "Dazzling Theater // Prop Room", [1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
  });

  it("Demonic Counsel: a Demon card; with delirium, any card", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 2),
          hand: ["Demonic Counsel"],
          graveyard,
          library: ["Shivan Dragon", "Doomsday Excruciator", "Forest"],
        },
      });
      let offered: string[] = [];
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Demonic Counsel") });
      s = settleAnswering(s, (req, _p, cur) => {
        if (req.type === "pick") offered = (namesIn(cur, req.options) as string[]).sort();
        return undefined;
      });
      return offered;
    };
    expect(run([])).toEqual(["Doomsday Excruciator"]);
    expect(run(DELIRIUM)).toEqual(["Doomsday Excruciator", "Forest", "Shivan Dragon"]);
  });

  it("Dissection Tools: manifests dread and attaches to it (+2/+2, deathtouch, lifelink); equips by sacrificing a creature", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Forest", 5)],
        hand: ["Dissection Tools"],
        library: ["Forest", "Island", "Swamp"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dissection Tools") });
    s = settle(s);
    const [hidden] = faceDownOf(s, "p1") as [string];
    const tools = idOf(s, "p1", "battlefield", "Dissection Tools");
    expect(s.objects[tools]?.attachedTo).toBe(hidden);
    expect(chars(s, hidden)).toMatchObject({ power: 4, toughness: 4 });
    expect(chars(s, hidden).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = activateNth(s, tools, 0, { sacrifice: [cub], targets: { t: [elves] } });
    s = settle(s);
    expect(s.objects[cub]).toBeUndefined();
    expect(s.objects[tools]?.attachedTo).toBe(elves);
  });

  it("Enduring Courage: another creature of yours that enters gets +2/+0 and haste; come back as an enchantment, it keeps going", () => {
    let s = scenario({
      p1: {
        battlefield: ["Enduring Courage", ...lands("Mountain", 3), ...lands("Forest", 2)],
        hand: ["Bear Cub", "Lightning Strike", "Llanowar Elves"],
      },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    s = settle(s);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub)).toMatchObject({ power: 4, toughness: 2 });
    expect(chars(s, cub).keywords).toContain("haste");
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Enduring Courage")] },
    });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Enduring Courage")).types).toEqual(["Enchantment"]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(3);
    // An opposing creature doesn't benefit.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Enduring Courage"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Bear Cub") });
    t = settle(t);
    expect(chars(t, idOf(t, "p2", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("Enduring Tenacity: when you gain life, the targeted opponent loses as much", () => {
    let s = scenario({
      p1: { battlefield: ["Enduring Tenacity", ...lands("Swamp", 2)], hand: ["Winter's Intervention"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Winter's Intervention"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p2?.life).toBe(18);
  });

  it('Enduring Vitality: your creatures have "{T}: add one mana of any color" (not the opponent\'s)', () => {
    const s = scenario({
      p1: { battlefield: ["Enduring Vitality", "Bear Cub", { name: "Llanowar Elves", sick: true }] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const colorsOf = (p: string, name: string) =>
      legalActions(s, p).flatMap((a) =>
        a.type === "tapForMana" && a.source === idOf(s, p, "battlefield", name) ? a.colors : [],
      );
    expect(colorsOf("p1", "Bear Cub").sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Enduring Vitality")).keywords).toContain("vigilance");
    expect(colorsOf("p2", "Serra Angel")).toEqual([]);
  });

  it("Entity Tracker: eerie, draw a card (enchantment enters, Room fully unlocked)", () => {
    let s = scenario({
      p1: { battlefield: ["Entity Tracker", ROOM, ...lands("Swamp", 2), ...lands("Plains", 4)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const room = openDoors(s, ROOM, [0]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    s = unlock(s, room);
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Fear of Missing Out: on entering, discard then draw; delirium, on its first attack, untap a creature and fight again", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Fear of Missing Out", "Opt"], library: ["Forest", "Forest"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Missing Out") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    // Delirium: a tapped creature is untapped and a combat phase is added.
    let t = scenario({
      p1: { battlefield: ["Fear of Missing Out", { name: "Bear Cub", tapped: true }], graveyard: DELIRIUM },
    });
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = attack(t, [idOf(t, "p1", "battlefield", "Fear of Missing Out")]);
    t = settleNoBlocks(t, picking([cub]));
    expect(t.objects[cub]?.tapped).toBe(false);
    t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers" || x.turn.active === "p2");
    expect(t.turn.active).toBe("p1");
    // Without delirium, no trigger.
    let u = scenario({ p1: { battlefield: ["Fear of Missing Out", { name: "Bear Cub", tapped: true }] } });
    u = attack(u, [idOf(u, "p1", "battlefield", "Fear of Missing Out")]);
    expect(u.stack).toHaveLength(0);
  });

  it('Fear of Missing Out: "for the first time each turn" - without delirium on the first attack, a later attack in the turn triggers nothing', () => {
    let s = scenario({
      p1: {
        battlefield: ["Fear of Missing Out", { name: "Bear Cub", tapped: true }],
        hand: ["Pyroclasm"],
        graveyard: DELIRIUM.slice(0, 3),
      },
    });
    const fomo = idOf(s, "p1", "battlefield", "Fear of Missing Out");
    s = attack(s, [fomo]);
    expect(s.triggers).toHaveLength(0);
    // Delirium arrives afterwards (a sorcery in the graveyard); a second attack in the same turn doesn't trigger the ability.
    moveObject(s, idOf(s, "p1", "hand", "Pyroclasm"), "graveyard");
    rulesEvent(s, { e: "attack", attacker: fomo, defender: "p2" });
    expect(s.triggers).toHaveLength(0);
    // On its controller's next turn, the first attack triggers again.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    s = advanceUntil(s, (x) => x.turn.active === "p1");
    s = attack(s, [fomo]);
    expect(s.triggers.length + s.stack.length).toBeGreaterThan(0);
  });

  it("Ghostly Dancers: on entering, an enchantment from the graveyard to hand or an unlocked door; eerie, a 3/1 flying Spirit", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Ghostly Dancers"], graveyard: ["Nowhere to Run", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ghostly Dancers") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Nowhere to Run"]);
    // "... or ..." chosen on resolution (PLAN-D, D6): the locked door opens, the Room is fully
    // unlocked (eerie).
    let t = scenario({ p1: { battlefield: [ROOM, ...lands("Plains", 5)], hand: ["Ghostly Dancers"] } });
    const room = openDoors(t, ROOM, [0]);
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Ghostly Dancers") });
    t = settleAnswering(t, (req) => (req.type === "pick" && req.intent === "other" ? ["1"] : undefined));
    expect(t.objects[room]?.unlocked).toEqual([0, 1]);
    const spirit = idOf(t, "p1", "battlefield", "Spirit");
    expect(chars(t, spirit)).toMatchObject({ power: 3, toughness: 1, colors: ["W"] });
    expect(chars(t, spirit).keywords).toContain("flying");
  });

  it("Hedge Shredder: when attacking, you may mill two cards; milled lands enter tapped", () => {
    let s = scenario({
      p1: { battlefield: ["Hedge Shredder", "Bear Cub"], library: ["Forest", "Opt", "Island"] },
    });
    const shredder = idOf(s, "p1", "battlefield", "Hedge Shredder");
    s = activateNth(s, shredder, 0, { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settle(s);
    s = attack(s, [shredder]);
    s = settleNoBlocks(s, answering({ yes: true }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    const forest = idOf(s, "p1", "battlefield", "Forest");
    expect(s.objects[forest]?.tapped).toBe(true);
  });

  it("Kona: survival, a permanent from your hand onto the battlefield (not an instant)", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Kona, Rescue Beastie", tapped: true }], hand: ["Shivan Dragon", "Opt"] } });
    let offered: string[] = [];
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick")
      offered = namesIn(s, s.pending.request.options) as string[];
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Shivan Dragon"));
    expect(offered).toEqual(["Shivan Dragon"]);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });
});

describe("Duskmourn, lot K8: rares (2)", () => {
  it("Leyline of Hope: each life gain increases by 1; with 7 more life than at the start, your creatures get +2/+2", () => {
    let s = scenario({
      p1: { battlefield: ["Leyline of Hope", ...lands("Swamp", 2)], hand: ["Winter's Intervention"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Winter's Intervention"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(s.players.p1?.life).toBe(23);
    const at = (life: number) => {
      const t = scenario({ p1: { life, battlefield: ["Leyline of Hope", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
      return [
        chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power,
        chars(t, idOf(t, "p2", "battlefield", "Serra Angel")).power,
      ];
    };
    expect(at(26)).toEqual([2, 4]);
    expect(at(27)).toEqual([4, 4]);
  });

  it("Leyline of Resonance: an instant or sorcery that targets one of your creatures is copied (not if it targets an opposing creature)", () => {
    const run = (who: "p1" | "p2") => {
      let s = scenario({
        p1: {
          battlefield: ["Leyline of Resonance", ...lands("Swamp", 2), ...(who === "p1" ? ["Bear Cub"] : [])],
          hand: ["Give In to Violence"],
        },
        p2: { battlefield: who === "p2" ? ["Bear Cub"] : [] },
      });
      const cub = idOf(s, who, "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Give In to Violence"), targets: { t: [cub] } });
      s = settle(s);
      return chars(s, cub).power;
    };
    expect(run("p1")).toBe(6);
    expect(run("p2")).toBe(4);
  });

  it("Leyline of Transformation: your creatures are the chosen type in addition to their other types", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Island", 4)], hand: ["Leyline of Transformation"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Leyline of Transformation") });
    s = settleAnswering(s, (req) => (req.type === "name" && req.of === "creatureType" ? ["Dragon"] : undefined));
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).subtypes).toEqual(expect.arrayContaining(["Bear", "Dragon"]));
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).subtypes).not.toContain("Dragon");
  });

  it("Marina Vendrell: the enchantment cards among the top seven go to hand, the rest on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: ["Plains", "Island", "Swamp", "Mountain", "Forest"],
        hand: ["Marina Vendrell"],
        library: ["Nowhere to Run", "Bear Cub", ROOM, "Forest", "Opt", "Island", "Swamp", "Mountain"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Marina Vendrell") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual([ROOM, "Nowhere to Run"].sort());
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Mountain");
    expect(s.players.p1?.library).toHaveLength(6);
  });

  it("Marina Vendrell: {T}, at sorcery speed: lock or unlock a door of one of your Rooms", () => {
    let s = scenario({ p1: { battlefield: ["Marina Vendrell", ROOM] } });
    const room = openDoors(s, ROOM, [0]);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Marina Vendrell"), 0, { targets: { r: [room] } });
    let options: string[] = [];
    s = settleAnswering(s, (req) => {
      if (req.type !== "pick") return undefined;
      if (!req.options.includes(`${room}#1`)) return undefined;
      options = req.options;
      return [`${room}#1`];
    });
    expect(options).toHaveLength(2);
    expect(s.objects[room]?.unlocked).toEqual([0, 1]);
  });

  it("Marina Vendrell's Grimoire: cast, draw five cards; a life gain draws as many cards", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 4), ...lands("Swamp", 5)],
        hand: ["Marina Vendrell's Grimoire", "Commune with Evil"],
        library: lands("Forest", 20),
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Marina Vendrell's Grimoire") });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(6);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Commune with Evil") });
    s = settle(s);
    // Commune with Evil: one card in hand, then 3 life gained, so three cards drawn.
    expect(s.players.p1?.life).toBe(23);
    expect(s.players.p1?.hand).toHaveLength(5 + 1 + 3);
  });

  it("Marina Vendrell's Grimoire: no loss at 0 life; a life loss makes you discard as many, and with no card in hand you lose", () => {
    const run = (hand: string[]) => {
      let s = scenario({ p1: { life: 2, battlefield: ["Marina Vendrell's Grimoire", ...lands("Mountain", 2)], hand } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
      return settle(s);
    };
    const kept = run(["Lightning Strike", "Opt", "Opt", "Opt", "Opt"]);
    expect(kept.players.p1?.life).toBe(-1);
    expect(kept.players.p1?.lost).toBeFalsy();
    expect(kept.players.p1?.hand).toHaveLength(1);
    expect(run(["Lightning Strike", "Opt"]).players.p1?.lost).toBe(true);
  });

  it("Nashi: combat damage to a player, mill as many; legendary or enchantment cards to hand, otherwise a +1/+1 counter", () => {
    const run = (library: string[], pick: string[]) => {
      let s = scenario({ p1: { battlefield: ["Nashi, Searcher in the Dark"], library } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Nashi, Searcher in the Dark")]);
      s = throughCombat(s, (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => pick.includes(nameOf(cur, id) as string)) : undefined,
      );
      return s;
    };
    const s = run(["Nowhere to Run", "Bear Cub", "Forest"], ["Nowhere to Run"]);
    expect(s.players.p2?.life).toBe(18);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Nowhere to Run"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Bear Cub"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Nashi, Searcher in the Dark")]?.counters["+1/+1"] ?? 0).toBe(0);
    const t = run(["Forest", "Bear Cub", "Island"], []);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(t.objects[idOf(t, "p1", "battlefield", "Nashi, Searcher in the Dark")]?.counters["+1/+1"]).toBe(1);
  });

  it("Omnivorous Flytrap: delirium, two +1/+1 counters divided; doubled with six types; nothing without delirium", () => {
    let minTargets: number | undefined;
    const run = (graveyard: string[]) => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Omnivorous Flytrap"], graveyard } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Omnivorous Flytrap") });
      s = settleAnswering(s, (req) => {
        if (req.type === "pick" && req.options.includes(cub)) minTargets = req.min;
        return picking([cub])(req);
      });
      return s.objects[cub]?.counters["+1/+1"] ?? 0;
    };
    expect(run([])).toBe(0);
    expect(run(DELIRIUM)).toBe(2);
    expect(run([...DELIRIUM, "Nowhere to Run", "Bear Trap"])).toBe(4);
    // "One or two targets": at least one.
    expect(minTargets).toBe(1);
  });

  it("Peer Past the Veil: discard your hand, then draw a card per card type in your graveyard", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Peer Past the Veil", "Bear Cub", "Forest"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Peer Past the Veil") });
    s = settle(s);
    // Creature and land: two cards.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Peer Past the Veil"]);
  });

  it("Razorkin Needlehead: initiative during your turn only; 1 damage to the opponent who draws", () => {
    const mine = scenario({ p1: { battlefield: ["Razorkin Needlehead"] } });
    expect(chars(mine, idOf(mine, "p1", "battlefield", "Razorkin Needlehead")).keywords).toContain("firstStrike");
    const theirs = scenario({ active: "p2", p1: { battlefield: ["Razorkin Needlehead"] } });
    expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Razorkin Needlehead")).keywords).not.toContain("firstStrike");
    let s = scenario({ step: "main2", p1: { battlefield: ["Razorkin Needlehead"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p2?.life).toBe(19);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.players.p1?.life).toBe(20);
  });

  it("Reluctant Role Model: survival, a counter of your choice; a creature of yours that dies with counters gives them to a creature", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Reluctant Role Model", tapped: true }] } });
    // "a flying, lifelink or +1/+1 counter": no printed lifelink (PLAN-D, D8: keyword quoted, not printed).
    expect(chars(s, idOf(s, "p1", "battlefield", "Reluctant Role Model")).keywords).not.toContain("lifelink");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    let modes: string[] = [];
    s = settleAnswering(s, (req) => {
      if (req.type !== "pick" || req.intent !== "triggerMode") return undefined;
      modes = req.options;
      return ["1"];
    });
    expect(modes).toEqual(["0", "1", "2"]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Reluctant Role Model")]?.counters.lifelink).toBe(1);
    let t = scenario({
      p1: {
        battlefield: [
          "Reluctant Role Model",
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          "Shivan Dragon",
          ...lands("Mountain", 4),
        ],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
    });
    const dragon = idOf(t, "p1", "battlefield", "Shivan Dragon");
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] },
    });
    t = settleAnswering(t, picking([dragon]));
    expect(t.objects[dragon]?.counters["+1/+1"]).toBe(1);
    // A creature without a counter: no trigger.
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p1", "battlefield", "Reluctant Role Model")] },
    });
    t = passUntil(t, (x) => x.stack.length === 0);
    expect(t.pending?.kind).toBe("priority");
    expect(t.stack).toHaveLength(0);
    expect(t.objects[dragon]?.counters["+1/+1"]).toBe(1);
  });

  it("Restricted Office: when unlocked, destroy all creatures with power 3 or greater", () => {
    let s = scenario({
      p1: { battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Plains", 4)], hand: ["Restricted Office // Lecture Hall"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Restricted Office // Lecture Hall"), face: 0 });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub"]);
    expect(creaturesOf(s, "p2")).toEqual(["Llanowar Elves"]);
  });

  it("Lecture Hall: your other permanents have hexproof", () => {
    const s = scenario({
      p1: { battlefield: ["Restricted Office // Lecture Hall", "Bear Cub", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const hall = openDoors(s, "Restricted Office // Lecture Hall", [1]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("hexproof");
    expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).keywords).toContain("hexproof");
    expect(chars(s, hall).keywords).not.toContain("hexproof");
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("hexproof");
  });

  it("Rip: survival, reveal as many cards as its power; creatures and Vehicles to hand, the rest on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Rip, Spawn Hunter", tapped: true }],
        library: ["Bear Cub", "Forest", "Hedge Shredder", "Opt", "Shivan Dragon"],
      },
    });
    let offered: string[] = [];
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = (namesIn(cur, req.options) as string[]).sort();
      return req.options;
    });
    expect(offered).toEqual(["Bear Cub", "Hedge Shredder"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Hedge Shredder"]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Shivan Dragon");
  });

  it("Roaring Furnace: when unlocked, as much damage as cards in your hand to an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Roaring Furnace // Steaming Sauna", "Opt", "Opt", "Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Roaring Furnace // Steaming Sauna"), face: 0 });
    s = settleAnswering(s, picking([angel]));
    expect(s.objects[angel]?.damage).toBe(3);
  });

  it("Steaming Sauna: no maximum hand size; draw a card at your end step", () => {
    let s = scenario({ p1: { battlefield: ["Roaring Furnace // Steaming Sauna"], hand: Array(9).fill("Opt") } });
    openDoors(s, "Roaring Furnace // Steaming Sauna", [1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(10);
  });
});

describe("Duskmourn, lot K8: rares (3)", () => {
  it("Silent Hallcreeper: unblockable; each combat damage to a player, a mode not yet chosen", () => {
    let s = scenario({ p1: { battlefield: ["Silent Hallcreeper", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const creeper = idOf(s, "p1", "battlefield", "Silent Hallcreeper");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, creeper).keywords).toContain("unblockable");
    s = attack(s, [creeper]);
    s = throughCombat(s, (req) => (req.type === "pick" && req.intent === "triggerMode" ? ["0"] : undefined));
    expect(s.objects[creeper]?.counters["+1/+1"]).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: creeper, defender: "p2" }] });
    let modes: string[] = [];
    s = throughCombat(s, (req) => {
      if (req.type === "pick" && req.intent === "triggerMode") {
        modes = req.options;
        return ["2"];
      }
      return picking([cub])(req);
    });
    // The first mode has already been chosen; the third: it becomes a copy of Bear Cub.
    expect(modes).toEqual(["1", "2"]);
    expect(chars(s, creeper).name).toBe("Bear Cub");
  });

  it("The Jolly Balloon Man: {1}, {T}: a 1/1 red Balloon token copy with flying and haste, sacrificed at the end step", () => {
    let s = scenario({ p1: { battlefield: ["The Jolly Balloon Man", "Serra Angel", "Mountain"] } });
    const man = idOf(s, "p1", "battlefield", "The Jolly Balloon Man");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(() => activateNth(s, man, 0, { targets: { t: [man] } })).toThrow();
    s = activateNth(s, man, 0, { targets: { t: [angel] } });
    s = settle(s);
    const token = idsOf(s, "p1", "battlefield", "Serra Angel").find((id) => id !== angel) as string;
    const c = chars(s, token);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors.sort()).toEqual(["R", "W"]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Angel", "Balloon"]));
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "haste", "vigilance"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[token]).toBeUndefined();
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toEqual([angel]);
  });

  it("The Swarmweaver: two 1/1 black and green flying Insects; delirium, Insects and Spiders +1/+1 and deathtouch", () => {
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["The Swarmweaver"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Swarmweaver") });
    s = settle(s);
    const insects = idsOf(s, "p1", "battlefield", "Insect");
    expect(insects).toHaveLength(2);
    const c = chars(s, insects[0] as string);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.colors.sort()).toEqual(["B", "G"]);
    expect(c.keywords).toContain("flying");
    const t = scenario({
      p1: { battlefield: ["The Swarmweaver", "Twitching Doll", "Bear Cub"], graveyard: DELIRIUM },
      p2: { battlefield: ["Twitching Doll"] },
    });
    const doll = chars(t, idOf(t, "p1", "battlefield", "Twitching Doll"));
    expect([doll.power, doll.keywords.includes("deathtouch")]).toEqual([3, true]);
    expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(2);
    expect(chars(t, idOf(t, "p2", "battlefield", "Twitching Doll")).power).toBe(2);
  });

  it("The Tale of Tamiyo (I to III): mill two cards; if they share a type, draw and repeat", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 3),
        hand: ["The Tale of Tamiyo"],
        library: ["Forest", "Forest", "Island", "Opt", "Bear Cub", "Swamp"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The Tale of Tamiyo") });
    s = settle(s);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest", "Forest", "Opt"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("The Tale of Tamiyo (IV): exile instants and sorceries from your graveyard, and cast copies of them", () => {
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: [{ name: "The Tale of Tamiyo", counters: { lore: 3 } }], graveyard: ["Lightning Strike", "Bear Cub"] },
    });
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    // Bear Cub (creature) is not a target.
    expect(req?.type === "pick" && req.options).toEqual([strike]);
    s = act(s, "p1", { type: "choose", values: [strike] });
    s = untilCastNow(s);
    const copy = castNowOf(s)?.cards[0] as string;
    s = act(s, "p1", { type: "cast", card: copy, targets: { t: ["p2"] } });
    s = settle(s);
    expect(s.players.p2?.life).toBe(17);
    expect(s.exile.some((id) => nameOf(s, id) === "Lightning Strike")).toBe(true);
  });

  it("Thornspire Verge: {R} always, {G} only with a Mountain or a Forest", () => {
    const colors = (battlefield: string[]) => {
      const s = scenario({ p1: { battlefield } });
      const v = idOf(s, "p1", "battlefield", "Thornspire Verge");
      return legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === v ? a.colors : []));
    };
    expect(colors(["Thornspire Verge"])).toEqual(["R"]);
    expect(colors(["Thornspire Verge", "Plains"])).toEqual(["R"]);
    expect(colors(["Thornspire Verge", "Mountain"])).toEqual(["R", "G"]);
    expect(colors(["Thornspire Verge", "Forest"])).toEqual(["R", "G"]);
  });

  it("Toby: a 4/4 Beast that can't attack or block alone; with four creature tokens, your tokens have flying", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 6), ...lands("Mountain", 4)],
        hand: ["Toby, Beastie Befriender", "Midnight Mayhem"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Toby, Beastie Befriender") });
    s = settle(s);
    const beast = idOf(s, "p1", "battlefield", "Beast");
    expect(chars(s, beast)).toMatchObject({ power: 4, toughness: 4, colors: ["W"] });
    expect(chars(s, beast).keywords).not.toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Midnight Mayhem") });
    s = settle(s);
    expect(chars(s, beast).keywords).toContain("flying");
    expect(chars(s, idOf(s, "p1", "battlefield", "Toby, Beastie Befriender")).keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.active === "p1" && x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: beast, defender: "p2" }] })).toThrow();
    const gremlin = idOf(s, "p1", "battlefield", "Gremlin");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: beast, defender: "p2" },
        { id: gremlin, defender: "p2" },
      ],
    });
    expect(s.combat?.attackers).toHaveLength(2);
  });

  it("Twitching Doll: its mana adds a nest counter; {T}, sacrifice: a 2/2 Spider with reach per counter", () => {
    let s = scenario({ p1: { battlefield: ["Twitching Doll"] } });
    const doll = idOf(s, "p1", "battlefield", "Twitching Doll");
    s = act(s, "p1", { type: "tapForMana", source: doll, ability: 0, color: "U" });
    expect(s.players.p1?.manaPool.U).toBe(1);
    expect(s.objects[doll]?.counters.nest).toBe(1);
    let t = scenario({ p1: { battlefield: [{ name: "Twitching Doll", counters: { nest: 3 } }] } });
    t = activateNth(t, idOf(t, "p1", "battlefield", "Twitching Doll"));
    t = settle(t);
    const spiders = idsOf(t, "p1", "battlefield", "Spider");
    expect(spiders).toHaveLength(3);
    expect(chars(t, spiders[0] as string)).toMatchObject({ power: 2, toughness: 2, colors: ["G"] });
    expect(chars(t, spiders[0] as string).keywords).toContain("reach");
  });

  it("Undead Sprinter: castable from the graveyard if a non-Zombie creature died this turn, with a +1/+1 counter", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Swamp"], hand: ["Lightning Strike"], graveyard: ["Undead Sprinter"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const sprinter = idOf(s, "p1", "graveyard", "Undead Sprinter");
    expect(castable(s, "p1", sprinter)).toBe(false);
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
    });
    s = settle(s);
    expect(castable(s, "p1", sprinter)).toBe(true);
    s = act(s, "p1", { type: "cast", card: sprinter });
    s = settle(s);
    const id = idOf(s, "p1", "battlefield", "Undead Sprinter");
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
    expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    // A Zombie that dies is not enough.
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"], graveyard: ["Undead Sprinter"] },
      p2: { battlefield: ["Unstoppable Slasher"] },
    });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p2", "battlefield", "Unstoppable Slasher")] },
    });
    t = settle(t);
    expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Undead Sprinter"))).toBe(false);
  });

  it("Unstoppable Slasher: the damaged player loses half their life; dead without a counter, it comes back tapped with two stun counters", () => {
    let s = scenario({ p1: { battlefield: ["Unstoppable Slasher"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Unstoppable Slasher")]);
    s = throughCombat(s);
    // 20 - 2 = 18, then half rounded up (9).
    expect(s.players.p2?.life).toBe(9);
    let t = scenario({
      p1: { battlefield: ["Unstoppable Slasher", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(t, "p1", "battlefield", "Unstoppable Slasher")] },
    });
    t = settle(t);
    const back = idOf(t, "p1", "battlefield", "Unstoppable Slasher");
    expect(t.objects[back]?.tapped).toBe(true);
    expect(t.objects[back]?.counters.stun).toBe(2);
    // With counters, it stays in the graveyard.
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: [back] } });
    t = settle(t);
    expect(idsOf(t, "p1", "battlefield", "Unstoppable Slasher")).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.graveyard)).toContain("Unstoppable Slasher");
  });

  it("Valgavoth's Lair: hexproof, enters tapped, produces mana of the chosen color", () => {
    let s = scenario({ p1: { hand: ["Valgavoth's Lair"] } });
    const card = idOf(s, "p1", "hand", "Valgavoth's Lair");
    const opt = legalActions(s, "p1").find((a) => a.type === "playLand" && a.card === card);
    expect(opt?.type === "playLand" && opt.choose?.type === "pick" && opt.choose.options).toEqual(
      expect.arrayContaining(["W", "U", "B", "R", "G"]),
    );
    s = act(s, "p1", { type: "playLand", card, chosen: "B" });
    const lair = idOf(s, "p1", "battlefield", "Valgavoth's Lair");
    expect(s.objects[lair]?.tapped).toBe(true);
    expect(chars(s, lair).keywords).toContain("hexproof");
    const o = s.objects[lair];
    if (o) o.tapped = false;
    expect(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === lair ? a.colors : []))).toEqual(["B"]);
  });

  it("Valgavoth's Onslaught: manifest dread X times, then X +1/+1 counters on each of those creatures", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Valgavoth's Onslaught"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Valgavoth's Onslaught"), x: 2 });
    s = settle(s);
    const hidden = faceDownOf(s, "p1");
    expect(hidden).toHaveLength(2);
    for (const id of hidden) expect(chars(s, id)).toMatchObject({ power: 4, toughness: 4 });
    expect(s.players.p1?.graveyard).toHaveLength(3);
  });

  it("Victor: eerie, surveil 2 the first time, opposing discard the second, reanimation the third", () => {
    let s = scenario({
      p1: { battlefield: ["Victor, Valgavoth's Seneschal", ...lands("Swamp", 8)], hand: Array(4).fill("Nowhere to Run") },
      p2: { battlefield: ["Shivan Dragon"], hand: ["Opt", "Opt"], graveyard: ["Serra Angel"] },
    });
    const castOne = (x: S) => settle(act(x, "p1", { type: "cast", card: idOf(x, "p1", "hand", "Nowhere to Run") }));
    s = castOne(s);
    expect(s.players.p2?.hand).toHaveLength(2);
    s = castOne(s);
    expect(s.players.p2?.hand).toHaveLength(1);
    s = castOne(s);
    expect(creaturesOf(s, "p1")).toEqual(["Serra Angel", "Victor, Valgavoth's Seneschal"]);
    // The fourth time, nothing.
    s = castOne(s);
    expect(s.players.p2?.hand).toHaveLength(1);
  });

  it("Waltz of Rage: your creature damages each other creature equal to its power; your creatures that die this turn exile a playable card", () => {
    let s = scenario({
      p1: {
        battlefield: ["Shivan Dragon", "Bear Cub", ...lands("Mountain", 5)],
        hand: ["Waltz of Rage"],
        library: ["Forest", "Island"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Waltz of Rage"), targets: { t: [dragon] } });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Shivan Dragon"]);
    expect(creaturesOf(s, "p2")).toEqual([]);
    expect(s.objects[dragon]?.damage).toBe(0);
    // Bear Cub (yours) died: one exiled card, playable; not for the opposing Angel.
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(forest).toBeDefined();
    expect(s.exile.some((id) => nameOf(s, id) === "Island")).toBe(false);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
  });

  it("Winter: each player draws two cards at your upkeep; delirium, the opponent's maximum hand size is 7 minus the number of types", () => {
    let s = scenario({ active: "p2", step: "main2", p1: { battlefield: ["Winter, Misanthropic Guide"] } });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p2?.hand).toHaveLength(2);
    let t = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Winter, Misanthropic Guide"], graveyard: DELIRIUM },
      p2: { hand: Array(6).fill("Opt") },
    });
    t = passUntil(t, (x) => x.pending?.kind === "discard" || x.turn.active === "p1");
    expect(t.pending?.kind === "discard" && t.pending.count).toBe(3);
  });

  it("Zimone: at your end step, if a land entered this turn and you control a prime number of lands, Primo", () => {
    const run = (battlefield: string[], play: boolean) => {
      let s = scenario({ p1: { battlefield: ["Zimone, All-Questioning", ...battlefield], hand: ["Forest"] } });
      if (play) s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      const primo = idsOf(s, "p1", "battlefield", "Primo, the Indivisible");
      return primo.length === 0 ? null : chars(s, primo[0] as string);
    };
    const primo = run(lands("Forest", 2), true);
    expect(primo).toMatchObject({ power: 3, toughness: 3 });
    expect(primo?.colors.sort()).toEqual(["G", "U"]);
    expect(primo?.supertypes).toContain("Legendary");
    expect(run(lands("Forest", 3), true)).toBeNull();
    expect(run(lands("Forest", 3), false)).toBeNull();
  });
});

describe("Duskmourn, lot K8: uncommons (1)", () => {
  it("Altanak: targeted by an opponent, draw (not by you); {1}{G}, discard it: a land from the graveyard returns tapped", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Altanak, the Thrice-Called"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    const altanak = idOf(s, "p1", "battlefield", "Altanak, the Thrice-Called");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: [altanak] } });
    s = settle(s);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(chars(s, altanak).keywords).toContain("trample");
    let t = scenario({
      p1: { battlefield: ["Altanak, the Thrice-Called", ...lands("Swamp", 2)], hand: ["Give In to Violence"] },
    });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Give In to Violence"),
      targets: { t: [idOf(t, "p1", "battlefield", "Altanak, the Thrice-Called")] },
    });
    t = settle(t);
    expect(t.players.p1?.hand).toHaveLength(0);
    // From hand.
    let u = scenario({
      p1: { battlefield: ["Forest", "Swamp"], hand: ["Altanak, the Thrice-Called"], graveyard: ["Plains", "Bear Cub"] },
    });
    const card = idOf(u, "p1", "hand", "Altanak, the Thrice-Called");
    u = activateNth(u, card, 0, { targets: { t: [idOf(u, "p1", "graveyard", "Plains")] } });
    u = settle(u);
    expect(u.objects[idOf(u, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    expect(namesIn(u, u.players.p1?.graveyard).sort()).toEqual(["Altanak, the Thrice-Called", "Bear Cub"]);
  });

  // PLAN-M M10a: "search your graveyard, hand, and/or library for a card named Altanak … If you search your library
  // this way, shuffle": one choice among the three zones.
  it("Say Its Name: Altanak chosen among the graveyard, the hand and the library; the library searched only if taken from it", () => {
    const run = (from: "graveyard" | "hand" | "library") => {
      let s = scenario({
        p1: {
          hand: ["Altanak, the Thrice-Called"],
          graveyard: ["Say Its Name", "Say Its Name", "Say Its Name", "Altanak, the Thrice-Called"],
          library: ["Forest", "Altanak, the Thrice-Called", "Forest"],
        },
      });
      const ids = {
        graveyard: idOf(s, "p1", "graveyard", "Altanak, the Thrice-Called"),
        hand: idOf(s, "p1", "hand", "Altanak, the Thrice-Called"),
        library: s.players.p1?.library[1] as string,
      };
      const say = idOf(s, "p1", "graveyard", "Say Its Name");
      s = passUntil(activateNth(s, say), (x) => x.pending?.kind === "choice");
      const p = s.pending;
      const req = p?.kind === "choice" ? p.request : undefined;
      expect(req?.type === "pick" && [req.intent, req.max, [...req.options].sort()]).toEqual([
        "search",
        1,
        Object.values(ids).sort(),
      ]);
      return settle(act(s, "p1", { type: "choose", values: [ids[from]] }));
    };
    for (const from of ["graveyard", "hand", "library"] as const) {
      const s = run(from);
      expect(idsOf(s, "p1", "battlefield", "Altanak, the Thrice-Called")).toHaveLength(1);
      expect(s.turnLog.some((e) => e.e === "search")).toBe(from === "library");
      expect(idsOf(s, "p1", "graveyard", "Altanak, the Thrice-Called")).toHaveLength(from === "graveyard" ? 0 : 1);
      expect(idsOf(s, "p1", "hand", "Altanak, the Thrice-Called")).toHaveLength(from === "hand" ? 0 : 1);
    }
  });

  it("Arabella: when attacking, X damage to each opponent and X life, X the number of your creatures with power 2 or less", () => {
    let s = scenario({ p1: { battlefield: ["Arabella, Abandoned Doll", "Bear Cub", "Shivan Dragon"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Arabella, Abandoned Doll")]);
    s = settleNoBlocks(s);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Attack-in-the-Box: when attacking, +4/+0 if you want, and it is then sacrificed at the next end step", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Attack-in-the-Box"] } });
      const box = idOf(s, "p1", "battlefield", "Attack-in-the-Box");
      s = attack(s, [box]);
      s = settleNoBlocks(s, answering({ yes }));
      const power = chars(s, box).power;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      return [power, s.objects[box] !== undefined];
    };
    expect(run(true)).toEqual([6, false]);
    expect(run(false)).toEqual([2, true]);
  });

  it("Baseball Bat: attached on entering (+1/+1); when the equipped creature attacks, tap up to one creature", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Forest", "Plains"], hand: ["Baseball Bat"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Baseball Bat") });
    s = settleAnswering(s, picking([cub]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Baseball Bat")]?.attachedTo).toBe(cub);
    expect(chars(s, cub)).toMatchObject({ power: 3, toughness: 3 });
    s = attack(s, [cub]);
    s = settleNoBlocks(s, picking([angel]));
    expect(s.objects[angel]?.tapped).toBe(true);
  });

  it("Beastie Beatdown: your creature damages the opposing creature equal to its power; delirium, two +1/+1 counters first", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Mountain", "Forest"], hand: ["Beastie Beatdown"], graveyard },
        p2: { battlefield: ["Serra Angel"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Beastie Beatdown"), targets: { a: [cub], t: [angel] } });
      s = settle(s);
      return [s.objects[cub]?.counters["+1/+1"] ?? 0, s.objects[angel]?.damage ?? "morte"];
    };
    expect(run([])).toEqual([0, 2]);
    expect(run(DELIRIUM)).toEqual([2, "morte"]);
  });

  it("Betrayer's Bargain: sacrifice a creature or an enchantment, or pay {2}; 5 damage, and the creature is exiled if it dies", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Betrayer's Bargain"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Betrayer's Bargain"),
      sacrifice: [],
      targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(4);
    // Sacrificing a creature: {1}{R} only.
    let t = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Betrayer's Bargain"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Betrayer's Bargain"),
      sacrifice: [cub],
      targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] },
    });
    t = settle(t);
    expect(t.objects[cub]).toBeUndefined();
    expect(t.exile.some((id) => nameOf(t, id) === "Serra Angel")).toBe(true);
  });

  it("Break Down the Door: exile an artifact, or an enchantment, or manifest dread", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Break Down the Door"] },
      p2: { battlefield: ["Bear Trap", "Nowhere to Run"] },
    });
    const trap = idOf(s, "p2", "battlefield", "Bear Trap");
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Break Down the Door"),
        mode: 0,
        targets: { a: [idOf(s, "p2", "battlefield", "Nowhere to Run")] },
      }),
    ).toThrow();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Break Down the Door"), mode: 0, targets: { a: [trap] } });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Bear Trap")).toBe(true);
    let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Break Down the Door"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Break Down the Door"), mode: 2 });
    t = settle(t);
    expect(faceDownOf(t, "p1")).toHaveLength(1);
  });

  it("Broodspinner: reach, surveil 2 on entering; {4}{B}{G}, {T}, sacrifice: a flying Insect per card type in the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Broodspinner", ...lands("Swamp", 3), ...lands("Forest", 3)],
        graveyard: ["Opt", "Forest", "Pyroclasm"],
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Broodspinner")).keywords).toContain("reach");
    s = activateNth(s, idOf(s, "p1", "battlefield", "Broodspinner"));
    s = settle(s);
    // Broodspinner, sacrificed, is in the graveyard on resolution: four types.
    const insects = idsOf(s, "p1", "battlefield", "Insect");
    expect(insects).toHaveLength(4);
    expect(chars(s, insects[0] as string).keywords).toContain("flying");
  });

  it("Cathartic Parting: the opposing artifact or enchantment and up to four cards from your graveyard are shuffled into the libraries", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Cathartic Parting"], graveyard: ["Bear Cub", "Opt"], library: [] },
      p2: { battlefield: ["Bear Trap"], library: [], graveyard: ["Opt"] },
    });
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Cathartic Parting"),
        targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")], g: s.players.p2?.graveyard ?? [] },
      }),
    ).toThrow();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Cathartic Parting"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")], g: s.players.p1?.graveyard ?? [] },
    });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.library)).toEqual(["Bear Trap"]);
    expect(namesIn(s, s.players.p1?.library).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Conductive Machete, Cursed Windbreaker, Killer's Mask: manifest dread and attach the Equipment to it", () => {
    const run = (name: string, mana: string[]) => {
      let s = scenario({ p1: { battlefield: mana, hand: [name] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name) });
      s = settle(s);
      const [hidden] = faceDownOf(s, "p1") as [string];
      expect(s.objects[idOf(s, "p1", "battlefield", name)]?.attachedTo, name).toBe(hidden);
      return chars(s, hidden);
    };
    expect(run("Conductive Machete", lands("Forest", 4))).toMatchObject({ power: 4, toughness: 3 });
    expect(run("Cursed Windbreaker", lands("Island", 3)).keywords).toContain("flying");
    expect(run("Killer's Mask", lands("Swamp", 3)).keywords).toContain("menace");
  });

  it("Coordinated Clobbering: tap one or two of your untapped creatures; each damages the opposing creature equal to its power", () => {
    let s = scenario({
      p1: {
        battlefield: ["Bear Cub", "Llanowar Elves", { name: "Shivan Dragon", tapped: true }, "Forest"],
        hand: ["Coordinated Clobbering"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ids = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")];
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const card = idOf(s, "p1", "hand", "Coordinated Clobbering");
    expect(() =>
      act(s, "p1", { type: "cast", card, targets: { a: [idOf(s, "p1", "battlefield", "Shivan Dragon")], t: [angel] } }),
    ).toThrow();
    // "One or two": at least one creature.
    expect(() => act(s, "p1", { type: "cast", card, targets: { a: [], t: [angel] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { a: ids, t: [angel] } });
    s = settle(s);
    expect(s.objects[angel]?.damage).toBe(3);
    expect(ids.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Cynical Loner: can't be blocked by Glimmers; survival, search for a card and put it into the graveyard", () => {
    let s = scenario({ p1: { battlefield: ["Cynical Loner"] }, p2: { battlefield: ["Lionheart Glimmer", "Bear Cub"] } });
    const loner = idOf(s, "p1", "battlefield", "Cynical Loner");
    s = attack(s, [loner]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() =>
      act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Lionheart Glimmer"), attacker: loner }],
      }),
    ).toThrow();
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: loner }],
    });
    let t = scenario({
      p1: { battlefield: [{ name: "Cynical Loner", tapped: true }], library: ["Forest", "Shivan Dragon", "Island"] },
    });
    t = advanceUntil(t, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    t = settleAnswering(t, (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Shivan Dragon")));
    expect(namesIn(t, t.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
  });

  it("Dashing Bloodsucker: eerie, +2/+0 and lifelink until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Dashing Bloodsucker", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const sucker = idOf(s, "p1", "battlefield", "Dashing Bloodsucker");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(chars(s, sucker)).toMatchObject({ power: 4, toughness: 5 });
    expect(chars(s, sucker).keywords).toContain("lifelink");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, sucker).power).toBe(2);
  });

  it("Defiant Survivor: survival, manifest dread", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Defiant Survivor", tapped: true }] } });
    s = advanceUntil(
      s,
      (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    expect(faceDownOf(s, "p1")).toHaveLength(1);
  });

  it("Defiled Crypt: once per turn, when cards leave your graveyard, a 2/2 Horror; Cadaver Lab returns a creature to hand", () => {
    let s = scenario({
      p1: { battlefield: ["Defiled Crypt // Cadaver Lab", "Ghost Vacuum", "Swamp"], graveyard: ["Bear Cub", "Opt"] },
    });
    const room = openDoors(s, "Defiled Crypt // Cadaver Lab", [0]);
    s = unlock(s, room);
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    const horror = idOf(s, "p1", "battlefield", "Horror");
    expect(chars(s, horror)).toMatchObject({ power: 2, toughness: 2, colors: ["B"] });
    expect(chars(s, horror).types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    // A second time this turn: no token.
    s = activateNth(s, idOf(s, "p1", "battlefield", "Ghost Vacuum"), 0, { targets: { t: [idOf(s, "p1", "graveyard", "Opt")] } });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Horror")).toHaveLength(1);
  });

  it("Disturbing Mirth: sacrifice another enchantment or a creature to draw two cards; sacrificed, it manifests dread", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp", "Mountain"], hand: ["Disturbing Mirth"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Disturbing Mirth") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.players.p1?.hand).toHaveLength(2);
    // Popular Egotist sacrifices it: manifest dread, and the Egotist drains 1.
    let t = scenario({ p1: { battlefield: ["Disturbing Mirth", "Popular Egotist", ...lands("Swamp", 2)] } });
    t = activateNth(t, idOf(t, "p1", "battlefield", "Popular Egotist"), 0, {
      sacrifice: [idOf(t, "p1", "battlefield", "Disturbing Mirth")],
    });
    t = settleAnswering(t, picking(["p2"]));
    expect(faceDownOf(t, "p1")).toHaveLength(1);
    expect(t.players.p2?.life).toBe(19);
    expect(t.players.p1?.life).toBe(21);
  });

  it("Diversion Specialist: {1}, sacrifice another creature or an enchantment: the top card is exiled, playable this turn", () => {
    let s = scenario({ p1: { battlefield: ["Diversion Specialist", "Bear Cub", "Mountain"], library: ["Forest", "Island"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Diversion Specialist")).keywords).toContain("menace");
    s = activateNth(s, idOf(s, "p1", "battlefield", "Diversion Specialist"), 0, {
      sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
    });
    s = settle(s);
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
  });

  it("Drag to the Roots: destroys a nonland permanent; {2} less with delirium", () => {
    const hand = { battlefield: ["Swamp", "Forest"], hand: ["Drag to the Roots"] };
    const without = scenario({ p1: hand, p2: { battlefield: ["Bear Trap"] } });
    expect(castable(without, "p1", idOf(without, "p1", "hand", "Drag to the Roots"))).toBe(false);
    let s = scenario({ p1: { ...hand, graveyard: DELIRIUM }, p2: { battlefield: ["Bear Trap", "Forest"] } });
    expect(() =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Drag to the Roots"),
        targets: { t: [idOf(s, "p2", "battlefield", "Forest")] },
      }),
    ).toThrow();
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Drag to the Roots"),
      targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")] },
    });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Trap"]);
  });

  it("Duskmourn's Domination: you control the enchanted creature, which has -3/-0 and loses all abilities", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Duskmourn's Domination"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Duskmourn's Domination"), targets: { enchant: [dragon] } });
    s = settle(s);
    const c = chars(s, dragon);
    expect(c.controller).toBe("p1");
    expect([c.power, c.toughness]).toEqual([2, 5]);
    expect(c.keywords).not.toContain("flying");
    expect(c.abilities).toHaveLength(0);
  });
});

describe("Duskmourn, lot K8: uncommons (2)", () => {
  it("Ethereal Armor: +1/+1 per enchantment you control, and the initiative", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Nowhere to Run", "Plains"], hand: ["Ethereal Armor"] },
      p2: { battlefield: ["Nowhere to Run"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ethereal Armor"), targets: { enchant: [cub] } });
    s = settle(s);
    expect(chars(s, cub)).toMatchObject({ power: 4, toughness: 4 });
    expect(chars(s, cub).keywords).toContain("firstStrike");
  });

  it("Exorcise: exiles an artifact, an enchantment or a creature with power 4 or greater (not a small creature)", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Exorcise"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const card = idOf(s, "p1", "hand", "Exorcise");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = settle(s);
    expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
  });

  it("Fear of Being Hunted: haste; it must be blocked if able", () => {
    let s = scenario({ p1: { battlefield: ["Fear of Being Hunted"] }, p2: { battlefield: ["Bear Cub"] } });
    const fear = idOf(s, "p1", "battlefield", "Fear of Being Hunted");
    expect(chars(s, fear).keywords).toContain("haste");
    s = attack(s, [fear]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).toThrow();
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: fear }],
    });
    expect(s.combat?.blockers).toHaveLength(1);
  });

  it("Fear of Burning Alive: 4 damage to each opponent; delirium, its noncombat damage is redirected to one of its creatures", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Fear of Burning Alive"], graveyard },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Burning Alive") });
      s = settle(s);
      return [s.players.p2?.life, creaturesOf(s, "p2")];
    };
    expect(run([])).toEqual([16, ["Serra Angel"]]);
    expect(run(DELIRIUM)).toEqual([16, []]);
  });

  it("Fear of Exposure: additional cost, tap two untapped creatures or lands; trample", () => {
    const four = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Fear of Exposure"] } });
    expect(castable(four, "p1", idOf(four, "p1", "hand", "Fear of Exposure"))).toBe(false);
    let s = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Fear of Exposure"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Exposure") });
    s = settle(s);
    const fear = idOf(s, "p1", "battlefield", "Fear of Exposure");
    expect(chars(s, fear).keywords).toContain("trample");
    expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(5);
  });

  it("Fear of Failed Tests: combat damage to a player, draw that many cards", () => {
    let s = scenario({ p1: { battlefield: ["Fear of Failed Tests"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Fear of Failed Tests")]);
    s = throughCombat(s);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Fear of Falling: when attacking, an opposing creature gets -2/-0 and loses flying until your next turn", () => {
    let s = scenario({ p1: { battlefield: ["Fear of Falling"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = attack(s, [idOf(s, "p1", "battlefield", "Fear of Falling")]);
    s = settleNoBlocks(s, picking([angel]));
    expect(chars(s, angel).power).toBe(2);
    expect(chars(s, angel).keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).power).toBe(2);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, angel).power).toBe(4);
    expect(chars(s, angel).keywords).toContain("flying");
  });

  it("Fear of Impostors: flash; counters a spell, and its controller manifests dread", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 3), hand: ["Fear of Impostors"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
    const spell = s.stack[0]?.id as string;
    s = act(s, "p2", { type: "pass" });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fear of Impostors") });
    s = settleAnswering(s, picking([spell]));
    expect(namesIn(s, s.players.p2?.graveyard)).toContain("Bear Cub");
    expect(faceDownOf(s, "p2")).toHaveLength(1);
    expect(faceDownOf(s, "p1")).toHaveLength(0);
  });

  it("Fear of Infinity: flying, lifelink, can't block; eerie, it can return from the graveyard to hand", () => {
    const s0 = scenario({ p1: { battlefield: ["Fear of Infinity"] } });
    expect(chars(s0, idOf(s0, "p1", "battlefield", "Fear of Infinity")).keywords).toEqual(
      expect.arrayContaining(["flying", "lifelink", "cantBlock"]),
    );
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Nowhere to Run"], graveyard: ["Fear of Infinity"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, answering({ yes: true }));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Fear of Infinity"]);
    // On the battlefield, the ability does not work.
    let t = scenario({
      p1: { battlefield: ["Fear of Infinity", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settleAnswering(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Nowhere to Run") }), answering({ yes: true }));
    expect(idsOf(t, "p1", "battlefield", "Fear of Infinity")).toHaveLength(1);
  });

  it("Ghostly Keybearer: combat damage to a player, unlock a door of one of your Rooms", () => {
    let s = scenario({ p1: { battlefield: ["Ghostly Keybearer", ROOM] } });
    const room = openDoors(s, ROOM, [0]);
    s = attack(s, [idOf(s, "p1", "battlefield", "Ghostly Keybearer")]);
    s = throughCombat(s, picking([room]));
    expect(s.objects[room]?.unlocked).toEqual([0, 1]);
  });

  it("Glimmer Seeker: survival, draw if you control a Glimmer, otherwise create a Glimmer", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({ p1: { battlefield: [{ name: "Glimmer Seeker", tapped: true }, ...battlefield] } });
      s = advanceUntil(
        s,
        (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
      );
      return [s.players.p1?.hand.length, idsOf(s, "p1", "battlefield", "Glimmer").length];
    };
    expect(run([])).toEqual([0, 1]);
    expect(run(["Lionheart Glimmer"])).toEqual([1, 0]);
  });

  it('Greenhouse: your lands have "{T}: add one mana of any color"', () => {
    const colors = (p: "p1" | "p2", name: string) => {
      const s = scenario({
        active: p,
        p1: { battlefield: ["Greenhouse // Rickety Gazebo", "Plains"] },
        p2: { battlefield: ["Forest"] },
      });
      openDoors(s, "Greenhouse // Rickety Gazebo", [0]);
      const id = idOf(s, p, "battlefield", name);
      return [...new Set(legalActions(s, p).flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : [])))].sort();
    };
    expect(colors("p1", "Plains")).toEqual(["B", "G", "R", "U", "W"]);
    expect(colors("p2", "Forest")).toEqual(["G"]);
  });

  it("Rickety Gazebo: when unlocked, mill four cards and take up to two permanent cards from among them", () => {
    let s = scenario({
      p1: {
        battlefield: ["Greenhouse // Rickety Gazebo", ...lands("Forest", 4)],
        library: ["Bear Cub", "Opt", "Forest", "Nowhere to Run", "Island"],
      },
    });
    const room = openDoors(s, "Greenhouse // Rickety Gazebo", [0]);
    s = unlock(s, room);
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = (namesIn(cur, req.options) as string[]).sort();
      return req.options.filter((id) => ["Bear Cub", "Nowhere to Run"].includes(nameOf(cur, id) as string));
    });
    expect(offered).toEqual(["Bear Cub", "Forest", "Nowhere to Run"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Nowhere to Run"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Gremlin Tamer: eerie, a 1/1 red Imp token", () => {
    let s = scenario({
      p1: { battlefield: ["Gremlin Tamer", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Gremlin"))).toMatchObject({ power: 1, toughness: 1, colors: ["R"] });
  });

  it("Growing Dread: flash, manifest dread; when you turn a permanent face up, a +1/+1 counter on it", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Island"], hand: ["Growing Dread"], library: ["Bear Cub", "Island"] },
    });
    expect(chars(s, idOf(s, "p1", "hand", "Growing Dread")).keywords).toContain("flash");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Growing Dread") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    const [hidden] = faceDownOf(s, "p1") as [string];
    s = activateNth(s, hidden);
    s = settle(s);
    expect(nameOf(s, hidden)).toBe("Bear Cub");
    expect(s.objects[hidden]?.counters["+1/+1"]).toBe(1);
  });

  it("Haunted Screen: {T}: {W} or {B}; {T}, 1 life: {G}, {U} or {R}; {7}, once: a 0/0 Spirit with seven counters", () => {
    let s = scenario({ p1: { battlefield: ["Haunted Screen", ...lands("Plains", 7)] } });
    const screen = idOf(s, "p1", "battlefield", "Haunted Screen");
    const byAbility = (x: S) =>
      legalActions(x, "p1").flatMap((a) =>
        a.type === "tapForMana" && a.source === screen ? [`${a.ability}:${a.colors.join("")}`] : [],
      );
    expect(byAbility(s)).toEqual(["0:WB", "1:GUR"]);
    const paid = act(s, "p1", { type: "tapForMana", source: screen, ability: 1, color: "G" });
    expect(paid.players.p1?.life).toBe(19);
    expect(paid.players.p1?.manaPool.G).toBe(1);
    s = activateNth(s, screen, 0);
    s = settle(s);
    expect(chars(s, screen)).toMatchObject({ power: 7, toughness: 7 });
    expect(chars(s, screen).subtypes).toContain("Spirit");
    expect(canActivate(s, "p1", screen)).toBe(false);
  });

  it("House Cartographer: survival, reveal up to one land, put into hand; the rest on the bottom", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "House Cartographer", tapped: true }], library: ["Opt", "Bear Cub", "Forest", "Island"] },
    });
    s = advanceUntil(
      s,
      (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Island");
    expect((namesIn(s, s.players.p1?.library.slice(1)) as string[]).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Infernal Phantom: eerie, +2/+0; when it dies, damage equal to its power to any target", () => {
    let s = scenario({
      p1: {
        battlefield: ["Infernal Phantom", ...lands("Swamp", 2), ...lands("Mountain", 2)],
        hand: ["Nowhere to Run", "Lightning Strike"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    const phantom = idOf(s, "p1", "battlefield", "Infernal Phantom");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(chars(s, phantom).power).toBe(4);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [phantom] } });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Inquisitive Glimmer: your enchantment spells cost {1} less, and unlocking too", () => {
    let s = scenario({
      p1: { battlefield: ["Inquisitive Glimmer", "Swamp", ROOM, ...lands("Plains", 2)], hand: ["Nowhere to Run", "Bear Cub"] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Nowhere to Run"))).toBe(true);
    const room = openDoors(s, ROOM, [0]);
    // Elegant Rotunda ({2}{W}) with two Plains.
    s = unlock(s, room);
    s = settle(s);
    expect(s.objects[room]?.unlocked).toEqual([0, 1]);
  });

  it("Insidious Fungus: {2}, sacrifice: destroy an artifact, or an enchantment, or draw and put a land tapped", () => {
    let s = scenario({ p1: { battlefield: ["Insidious Fungus", ...lands("Forest", 2)] }, p2: { battlefield: ["Bear Trap"] } });
    const fungus = idOf(s, "p1", "battlefield", "Insidious Fungus");
    s = activateNth(s, fungus, 0, { targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")] } });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Trap"]);
    let t = scenario({ p1: { battlefield: ["Insidious Fungus", ...lands("Forest", 2)], hand: ["Plains"], library: ["Opt"] } });
    t = act(t, "p1", { type: "activate", source: idOf(t, "p1", "battlefield", "Insidious Fungus"), ability: 2 });
    t = settleAnswering(t, (req, _p, cur) => pickNamed(cur, req, "Plains"));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Opt"]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
  });

  it("Intruding Soulrager: {T}, sacrifice a Room: 2 damage to each opponent, draw", () => {
    let s = scenario({ p1: { battlefield: ["Intruding Soulrager", ROOM] } });
    const room = openDoors(s, ROOM, [0]);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Intruding Soulrager"), 0, { sacrifice: [room] });
    s = settle(s);
    expect(s.objects[room]).toBeUndefined();
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Irreverent Gremlin: another creature with power 2 or less enters, discard to draw, once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Irreverent Gremlin", ...lands("Forest", 3)],
        hand: ["Bear Cub", "Llanowar Elves", "Opt"],
        library: lands("Island", 3),
      },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Irreverent Gremlin")).keywords).toContain("menace");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    s = settleAnswering(s, (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Opt")));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Llanowar Elves"]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Llanowar Elves") });
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.pending?.kind).toBe("priority");
    expect(s.players.p1?.hand).toHaveLength(1);
  });
});

describe("Duskmourn, lot K8: uncommons (3)", () => {
  it("Live or Die: a creature card from your graveyard returns, or a creature is destroyed", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Live or Die"], graveyard: ["Patched Plaything"] } });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Live or Die"),
      mode: 0,
      targets: { t: [idOf(s, "p1", "graveyard", "Patched Plaything")] },
    });
    s = settle(s);
    // Patched Plaything was not cast from hand: no -1/-1 counter.
    expect(chars(s, idOf(s, "p1", "battlefield", "Patched Plaything"))).toMatchObject({ power: 4, toughness: 3 });
    let t = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Live or Die"] }, p2: { battlefield: ["Serra Angel"] } });
    t = act(t, "p1", {
      type: "cast",
      card: idOf(t, "p1", "hand", "Live or Die"),
      mode: 1,
      targets: { d: [idOf(t, "p2", "battlefield", "Serra Angel")] },
    });
    t = settle(t);
    expect(namesIn(t, t.players.p2?.graveyard)).toEqual(["Serra Angel"]);
  });

  it("Miasma Demon: discard as many cards as you want; as many targeted creatures get -2/-2", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Miasma Demon", "Opt", "Opt", "Forest"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    const targets = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Llanowar Elves")];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Miasma Demon") });
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      if (req.options.includes(targets[0] as string)) return targets;
      return req.options.filter((id) => nameOf(cur, id) === "Opt");
    });
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(creaturesOf(s, "p2")).toEqual(["Serra Angel"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Miasma Demon")).keywords).toContain("flying");
  });

  it("Norin: can't block; one of your blocked creatures may be exiled and replayed this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Norin, Swift Survivalist", "Bear Cub", ...lands("Forest", 2)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Norin, Swift Survivalist")).keywords).toContain("cantBlock");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    s = act(s, "p2", {
      type: "declareBlockers",
      blocks: [{ blocker: idOf(s, "p2", "battlefield", "Serra Angel"), attacker: cub }],
    });
    s = settleAnswering(s, answering({ yes: true }));
    const exiled = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(exiled).toBeDefined();
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(castable(s, "p1", exiled)).toBe(true);
  });

  it("Oblivious Bookworm: at your end step, draw then discard, unless a permanent entered face down this turn", () => {
    const run = (manifest: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Oblivious Bookworm", ...lands("Forest", 2)],
          hand: manifest ? ["Manifest Dread"] : [],
          library: lands("Island", 6),
        },
      });
      if (manifest) s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Manifest Dread") }));
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
      s = settleAnswering(s, answering({ yes: true }));
      return s.players.p1?.hand.length;
    };
    expect(run(false)).toBe(0);
    expect(run(true)).toBe(1);
  });

  it("Optimistic Scavenger: eerie, a +1/+1 counter on a targeted creature", () => {
    let s = scenario({
      p1: { battlefield: ["Optimistic Scavenger", "Bear Cub", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, (req) =>
      req.type === "pick" && req.options.includes(cub) && !req.options.includes("p2") ? [cub] : undefined,
    );
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Orphans of the Wheat: when attacking, tap creatures; +1/+1 for each", () => {
    let s = scenario({ p1: { battlefield: ["Orphans of the Wheat", "Bear Cub", "Llanowar Elves"] } });
    const orphans = idOf(s, "p1", "battlefield", "Orphans of the Wheat");
    const others = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Llanowar Elves")];
    s = attack(s, [orphans]);
    s = settleNoBlocks(s, picking(others));
    expect(chars(s, orphans)).toMatchObject({ power: 4, toughness: 3 });
    expect(others.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it('Orphans of the Wheat: with vigilance, it can tap itself ("any number of untapped creatures you control", PLAN-L L4)', () => {
    let s = scenario({ p1: { battlefield: ["Orphans of the Wheat", "Bear Cub"] } });
    const orphans = idOf(s, "p1", "battlefield", "Orphans of the Wheat");
    (s.objects[orphans] as { counters: Record<string, number> }).counters.vigilance = 1;
    bump(s);
    s = attack(s, [orphans]);
    expect(s.objects[orphans]?.tapped).toBe(false);
    s = settleNoBlocks(s, picking([orphans, idOf(s, "p1", "battlefield", "Bear Cub")]));
    expect(chars(s, orphans)).toMatchObject({ power: 4, toughness: 3 });
    expect(s.objects[orphans]?.tapped).toBe(true);
  });

  it("Osseous Sticktwister: delirium, at your end step, each opponent sacrifices, discards, or takes damage equal to its power", () => {
    const run = (graveyard: string[], choice: string) => {
      let s = scenario({ p1: { battlefield: ["Osseous Sticktwister"], graveyard }, p2: { hand: ["Opt"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p2" || (x.turn.step === "end" && x.pending?.kind === "choice"));
      s = settleAnswering(s, (req) => (req.type === "pick" && req.intent === "punisher" ? [choice] : undefined));
      return [s.players.p2?.life, s.players.p2?.hand.length];
    };
    expect(run([], "life")).toEqual([20, 1]);
    expect(run(DELIRIUM, "life")).toEqual([18, 1]);
    expect(run(DELIRIUM, "discard")).toEqual([20, 0]);
  });

  it("Overgrown Zealot: {T}: one mana of any color; {T}: two mana of one color, only to turn face up", () => {
    let s = scenario({
      p1: {
        battlefield: ["Overgrown Zealot", ...lands("Forest", 2)],
        hand: ["Manifest Dread", "Llanowar Elves"],
        library: ["Bear Cub", "Island"],
      },
    });
    s = settleAnswering(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Manifest Dread") }), (req, _p, cur) =>
      pickNamed(cur, req, "Bear Cub"),
    );
    const zealot = idOf(s, "p1", "battlefield", "Overgrown Zealot");
    expect(legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === zealot)).toHaveLength(2);
    s = act(s, "p1", { type: "tapForMana", source: zealot, ability: 1, color: "G" });
    // This mana does not cast Llanowar Elves, but turns the face-down creature up ({1}{G}).
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Llanowar Elves"))).toBe(false);
    const [hidden] = faceDownOf(s, "p1") as [string];
    s = activateNth(s, hidden);
    s = settle(s);
    expect(nameOf(s, hidden)).toBe("Bear Cub");
    expect(s.objects[hidden]?.faceDown).toBeUndefined();
  });

  it("Painter's Studio: when unlocked, exile the top two cards, playable until the end of your next turn", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 3),
        hand: ["Painter's Studio // Defaced Gallery"],
        library: ["Forest", "Opt", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Painter's Studio // Defaced Gallery"), face: 0 });
    s = settle(s);
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    expect(s.exile.some((id) => nameOf(s, id) === "Opt")).toBe(true);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Island");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
  });

  it("Defaced Gallery: when you attack, your attacking creatures get +1/+0", () => {
    let s = scenario({ p1: { battlefield: ["Painter's Studio // Defaced Gallery", "Bear Cub", "Llanowar Elves"] } });
    openDoors(s, "Painter's Studio // Defaced Gallery", [1]);
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settleNoBlocks(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).power).toBe(1);
  });

  it("Paranormal Analyst: when you manifest dread, the card put into the graveyard goes to your hand", () => {
    let s = scenario({
      p1: {
        battlefield: ["Paranormal Analyst", ...lands("Forest", 2)],
        hand: ["Manifest Dread"],
        library: ["Bear Cub", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Manifest Dread") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Bear Cub"));
    expect(faceDownOf(s, "p1")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Patched Plaything: double strike; cast from hand, it enters with two -1/-1 counters", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Patched Plaything"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Patched Plaything") });
    s = settle(s);
    const toy = idOf(s, "p1", "battlefield", "Patched Plaything");
    expect(s.objects[toy]?.counters["-1/-1"]).toBe(2);
    expect(chars(s, toy)).toMatchObject({ power: 2, toughness: 1 });
    expect(chars(s, toy).keywords).toContain("doubleStrike");
  });

  it("Patchwork Beastie: can't attack or block without delirium; at your upkeep, you may mill a card", () => {
    const kw = (graveyard: string[]) => {
      const s = scenario({ p1: { battlefield: ["Patchwork Beastie"], graveyard } });
      return chars(s, idOf(s, "p1", "battlefield", "Patchwork Beastie")).keywords;
    };
    expect(kw([])).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    expect(kw(DELIRIUM)).not.toContain("cantAttack");
    let s = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Patchwork Beastie"], library: ["Opt", "Forest", "Forest"] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.pending?.kind === "choice");
    s = settleAnswering(s, answering({ yes: true }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
  });

  it("Piggy Bank: when it dies, a Treasure token", () => {
    let s = scenario({ p1: { battlefield: ["Piggy Bank", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Piggy Bank")] },
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Popular Egotist: {1}{B}, sacrifice another creature or an enchantment: indestructible, then tapped; each sacrifice drains 1", () => {
    let s = scenario({ p1: { battlefield: ["Popular Egotist", "Bear Cub", ...lands("Swamp", 2)] } });
    const egotist = idOf(s, "p1", "battlefield", "Popular Egotist");
    expect(() => activateNth(s, egotist, 0, { sacrifice: [egotist] })).toThrow();
    s = activateNth(s, egotist, 0, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.objects[egotist]?.tapped).toBe(true);
    expect(chars(s, egotist).keywords).toContain("indestructible");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
  });

  it("Razorkin Hordecaller: haste; when you attack, a 1/1 red Imp token", () => {
    let s = scenario({ p1: { battlefield: ["Razorkin Hordecaller", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Razorkin Hordecaller")).keywords).toContain("haste");
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settleNoBlocks(s);
    expect(idsOf(s, "p1", "battlefield", "Gremlin")).toHaveLength(1);
  });

  it("Rite of the Moth: a creature from your graveyard returns with a finality counter; flashback {3}{W}{W}{B}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 3)], graveyard: ["Rite of the Moth", "Serra Angel"] },
    });
    const rite = idOf(s, "p1", "graveyard", "Rite of the Moth");
    s = act(s, "p1", { type: "cast", card: rite, targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } });
    s = settle(s);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.counters.finality).toBe(1);
    expect(s.exile.some((id) => nameOf(s, id) === "Rite of the Moth")).toBe(true);
  });

  it("Rootwise Survivor: survival, three +1/+1 counters on one of your lands, which becomes a 0/0 Elemental with haste", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Rootwise Survivor", tapped: true }, "Forest"] } });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    s = settleAnswering(s, picking([forest]));
    const c = chars(s, forest);
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Elemental"]));
    expect(c.keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    expect(chars(s, forest).keywords).not.toContain("haste");
    expect(chars(s, forest).types).toContain("Creature");
  });

  it("Savior of the Small: survival, a creature card with mana value 3 or less from your graveyard to hand", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Savior of the Small", tapped: true }], graveyard: ["Shivan Dragon", "Bear Cub"] },
    });
    s = advanceUntil(
      s,
      (x) => x.turn.step === "main2" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    // Shivan Dragon (MV 6) is not a target: the only legal target is chosen.
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
  });

  it("Saw: +2/+0; when the equipped creature attacks, sacrifice another permanent to draw", () => {
    let s = scenario({ p1: { battlefield: ["Saw", "Bear Cub", ...lands("Forest", 3)], library: ["Opt", "Island"] } });
    const saw = idOf(s, "p1", "battlefield", "Saw");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = activateNth(s, saw, 0, { targets: { t: [cub] } });
    s = settle(s);
    expect(chars(s, cub).power).toBe(4);
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = attack(s, [cub]);
    let offered: string[] = [];
    s = settleNoBlocks(s, (req) => {
      if (req.type !== "pick") return undefined;
      offered = req.options;
      return [forest];
    });
    expect(offered).not.toContain(cub);
    expect(offered).not.toContain(saw);
    expect(s.objects[forest]).toBeUndefined();
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
  });

  it("Sawblade Skinripper: {2}, sacrifice: a +1/+1 counter; at your end step, damage equal to the permanents sacrificed this turn", () => {
    let s = scenario({ p1: { battlefield: ["Sawblade Skinripper", "Bear Cub", "Nowhere to Run", ...lands("Swamp", 4)] } });
    const ripper = idOf(s, "p1", "battlefield", "Sawblade Skinripper");
    expect(chars(s, ripper).keywords).toContain("menace");
    s = activateNth(s, ripper, 0, { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] });
    s = settle(s);
    s = activateNth(s, ripper, 0, { sacrifice: [idOf(s, "p1", "battlefield", "Nowhere to Run")] });
    s = settle(s);
    expect(s.objects[ripper]?.counters["+1/+1"]).toBe(2);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.life).toBe(18);
    // Without a sacrifice this turn: nothing.
    let t = scenario({ p1: { battlefield: ["Sawblade Skinripper"] } });
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(t.players.p2?.life).toBe(20);
  });

  it("Scrabbling Skullcrab: eerie, the targeted player mills two cards", () => {
    let s = scenario({
      p1: { battlefield: ["Scrabbling Skullcrab", ...lands("Swamp", 2)], hand: ["Nowhere to Run"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, picking(["p2"]));
    expect(s.players.p2?.graveyard).toHaveLength(2);
  });

  it("Shardmage's Rescue: +1/+1; hexproof as long as the Aura entered this turn", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains"], hand: ["Shardmage's Rescue"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shardmage's Rescue"), targets: { enchant: [cub] } });
    s = settle(s);
    expect(chars(s, cub)).toMatchObject({ power: 3, toughness: 3 });
    expect(chars(s, cub).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("hexproof");
    expect(chars(s, cub).power).toBe(3);
  });

  it("Shrewd Storyteller: survival, a +1/+1 counter on a targeted creature", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Shrewd Storyteller", tapped: true }, "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    s = settleAnswering(s, picking([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Shroudstomper: deathtouch; on entering or attacking, each opponent loses 2 life, you gain 2 life and draw", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)], hand: ["Shroudstomper"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shroudstomper") });
    s = settle(s);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p1?.hand.length]).toEqual([22, 18, 1]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Shroudstomper")).keywords).toContain("deathtouch");
    let t = scenario({ p1: { battlefield: ["Shroudstomper"] } });
    t = attack(t, [idOf(t, "p1", "battlefield", "Shroudstomper")]);
    t = settleNoBlocks(t);
    expect([t.players.p1?.life, t.players.p2?.life, t.players.p1?.hand.length]).toEqual([22, 18, 1]);
  });

  it("Skullsnap Nuisance: flying; eerie, surveil 1", () => {
    let s = scenario({
      p1: { battlefield: ["Skullsnap Nuisance", ...lands("Swamp", 2)], hand: ["Nowhere to Run"], library: ["Opt", "Forest"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Skullsnap Nuisance")).keywords).toContain("flying");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settleAnswering(s, (req, _p, cur) => pickNamed(cur, req, "Opt"));
    expect(namesIn(s, s.players.p1?.graveyard)).toContain("Opt");
  });

  it("Smoky Lounge: at the beginning of your first main phase, {R}{R} for Room spells or unlocking", () => {
    let s = scenario({
      step: "upkeep",
      p1: {
        battlefield: ["Smoky Lounge // Misty Salon", "Mountain"],
        hand: ["Painter's Studio // Defaced Gallery", "Lightning Strike"],
      },
    });
    openDoors(s, "Smoky Lounge // Misty Salon", [0]);
    s = advanceUntil(s, (x) => x.turn.step === "main1" && x.stack.length > 0);
    s = settle(s);
    // The mana is added to the pool at the start of the phase (not by a mana ability).
    expect(s.players.p1?.restrictedMana?.map((m) => m.type)).toEqual(["R", "R"]);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Painter's Studio // Defaced Gallery"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Lightning Strike"))).toBe(false);
  });

  it("Misty Salon: when unlocked, an X/X blue flying Spirit, X the number of unlocked doors among your Rooms", () => {
    let s = scenario({ p1: { battlefield: ["Smoky Lounge // Misty Salon", ROOM, ...lands("Island", 4)] } });
    const room = openDoors(s, "Smoky Lounge // Misty Salon", [0]);
    openDoors(s, ROOM, [0, 1]);
    s = unlock(s, room);
    s = settle(s);
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    expect(chars(s, spirit)).toMatchObject({ power: 4, toughness: 4, colors: ["U"] });
    expect(chars(s, spirit).keywords).toContain("flying");
  });

  it("Splitskin Doll: draw, then discard unless you control another creature with power 2 or less", () => {
    const run = (battlefield: string[]) => {
      let s = scenario({ p1: { battlefield: [...battlefield, ...lands("Plains", 2)], hand: ["Splitskin Doll", "Opt"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Splitskin Doll") });
      s = settle(s);
      return s.players.p1?.hand.length;
    };
    expect(run([])).toBe(1);
    expect(run(["Shivan Dragon"])).toBe(1);
    expect(run(["Bear Cub"])).toBe(2);
  });

  it("Sporogenic Infection: the targeted player sacrifices a creature other than the enchanted one; when damaged, the enchanted creature is destroyed", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)], hand: ["Sporogenic Infection", "Lightning Strike"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sporogenic Infection"), targets: { enchant: [angel] } });
    s = settleAnswering(s, picking(["p2"]));
    expect(creaturesOf(s, "p2")).toEqual(["Serra Angel"]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [angel] } });
    s = settle(s);
    expect(creaturesOf(s, "p2")).toEqual([]);
  });

  it("Stay Hidden, Stay Silent: taps the creature, which no longer untaps; {4}{U}{U}: shuffled into the library, then manifest dread", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 8), hand: ["Stay Hidden, Stay Silent"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stay Hidden, Stay Silent"), targets: { enchant: [angel] } });
    s = settle(s);
    expect(s.objects[angel]?.tapped).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1");
    expect(s.objects[angel]?.tapped).toBe(true);
    s = activateNth(s, idOf(s, "p1", "battlefield", "Stay Hidden, Stay Silent"));
    s = settle(s);
    expect(namesIn(s, s.players.p2?.library)).toContain("Serra Angel");
    expect(creaturesOf(s, "p2")).toEqual([]);
    expect(faceDownOf(s, "p1")).toHaveLength(1);
  });

  it("Surgical Suite: when unlocked, a creature card with mana value 3 or less returns from your graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Plains", 2),
        hand: ["Surgical Suite // Hospital Room"],
        graveyard: ["Shivan Dragon", "Bear Cub"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Surgical Suite // Hospital Room"), face: 0 });
    s = settle(s);
    // Shivan Dragon (MV 6) is not a target.
    expect(creaturesOf(s, "p1")).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Shivan Dragon"]);
  });

  it("Hospital Room: when you attack, a +1/+1 counter on an attacking creature", () => {
    let s = scenario({ p1: { battlefield: ["Surgical Suite // Hospital Room", "Bear Cub", "Llanowar Elves"] } });
    openDoors(s, "Surgical Suite // Hospital Room", [1]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attack(s, [cub]);
    s = settleNoBlocks(s, picking([elves]));
    // Llanowar Elves does not attack: only Bear Cub is a target.
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[elves]?.counters["+1/+1"]).toBeUndefined();
  });
});

describe("Duskmourn, lot K8: uncommons (4)", () => {
  it("Threats Around Every Corner: manifest dread; a face-down permanent of yours enters, search for a tapped basic land", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Threats Around Every Corner"],
        library: ["Bear Cub", "Opt", "Island", "Forest"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Threats Around Every Corner") });
    s = settle(s);
    expect(faceDownOf(s, "p1")).toHaveLength(1);
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
  });

  it("Under the Skin: manifest dread; a permanent card from your graveyard may return to hand", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["Under the Skin"],
        graveyard: ["Serra Angel", "Opt"],
        library: ["Forest", "Island"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Under the Skin") });
    let offered: string[] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Serra Angel")) {
        offered = (namesIn(cur, req.options) as string[]).sort();
        return pickNamed(cur, req, "Serra Angel");
      }
      return undefined;
    });
    expect(faceDownOf(s, "p1")).toHaveLength(1);
    expect(offered).not.toContain("Opt");
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Serra Angel"]);
  });

  it("Unnerving Grasp: return up to one nonland permanent, then manifest dread", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Unnerving Grasp"] },
      p2: { battlefield: ["Serra Angel", "Forest"] },
    });
    const card = idOf(s, "p1", "hand", "Unnerving Grasp");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.hand)).toEqual(["Serra Angel"]);
    expect(faceDownOf(s, "p1")).toHaveLength(1);
  });

  it("Untimely Malfunction: destroy an artifact, or change the target of a spell, or one or two creatures can't block", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Untimely Malfunction"] },
      p2: { battlefield: ["Bear Trap"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Untimely Malfunction"),
      mode: 0,
      targets: { a: [idOf(s, "p2", "battlefield", "Bear Trap")] },
    });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Trap"]);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Untimely Malfunction"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Serra Angel"] },
    });
    const two = [idOf(t, "p2", "battlefield", "Bear Cub"), idOf(t, "p2", "battlefield", "Llanowar Elves")];
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Untimely Malfunction"), mode: 2, targets: { c: [] } }),
    ).toThrow();
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Untimely Malfunction"), mode: 2, targets: { c: two } });
    t = settle(t);
    for (const id of two) expect(chars(t, id).keywords).toContain("cantBlock");
    expect(chars(t, idOf(t, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("cantBlock");
    // Change the target: the opposing Lightning aimed at Bear Cub hits its caster.
    let u = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub", ...lands("Mountain", 2)], hand: ["Untimely Malfunction"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    const cub = idOf(u, "p1", "battlefield", "Bear Cub");
    u = act(u, "p2", { type: "cast", card: idOf(u, "p2", "hand", "Lightning Strike"), targets: { t: [cub] } });
    const strike = u.stack[0]?.id as string;
    u = act(u, "p2", { type: "pass" });
    u = act(u, "p1", { type: "cast", card: idOf(u, "p1", "hand", "Untimely Malfunction"), mode: 1, targets: { s: [strike] } });
    u = settleAnswering(u, picking(["p2"]));
    expect(u.objects[cub]?.damage ?? 0).toBe(0);
    expect(u.players.p2?.life).toBe(17);
  });

  it("Unwilling Vessel: vigilance; eerie, a possession counter; when it dies, an X/X flying Spirit, X its counters", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Unwilling Vessel", counters: { "+1/+1": 1 } }, ...lands("Swamp", 2), ...lands("Mountain", 2)],
        hand: ["Nowhere to Run", "Lightning Strike"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const vessel = idOf(s, "p1", "battlefield", "Unwilling Vessel");
    expect(chars(s, vessel).keywords).toContain("vigilance");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nowhere to Run") });
    s = settle(s);
    expect(s.objects[vessel]?.counters.possession).toBe(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [vessel] } });
    s = settle(s);
    const spirit = idOf(s, "p1", "battlefield", "Spirit");
    expect(chars(s, spirit)).toMatchObject({ power: 2, toughness: 2, colors: ["U"] });
    expect(chars(s, spirit).keywords).toContain("flying");
  });

  it("Valgavoth's Faithful: {3}{B}, sacrifice it: a creature card from your graveyard returns to the battlefield", () => {
    let s = scenario({ p1: { battlefield: ["Valgavoth's Faithful", ...lands("Swamp", 4)], graveyard: ["Serra Angel"] } });
    s = activateNth(s, idOf(s, "p1", "battlefield", "Valgavoth's Faithful"), 0, {
      targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] },
    });
    s = settle(s);
    expect(creaturesOf(s, "p1")).toEqual(["Serra Angel"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Valgavoth's Faithful"]);
  });

  it("Vengeful Possession: control until end of turn, untapped, haste; you may discard to draw", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Vengeful Possession", "Opt"], library: ["Forest", "Forest"] },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vengeful Possession"), targets: { t: [angel] } });
    s = settleAnswering(s, (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Opt")));
    expect(chars(s, angel).controller).toBe("p1");
    expect(s.objects[angel]?.tapped).toBe(false);
    expect(chars(s, angel).keywords).toContain("haste");
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, angel).controller).toBe("p2");
  });

  it("Veteran Survivor: survival, exile a card from a graveyard; with three exiled cards, +3/+3 and hexproof", () => {
    let s = scenario({
      p1: { battlefield: ["Veteran Survivor", ...lands("Island", 2)], hand: ["Stay Hidden, Stay Silent"] },
      p2: { graveyard: ["Opt", "Forest", "Bear Cub"] },
    });
    const vet = idOf(s, "p1", "battlefield", "Veteran Survivor");
    // Tapped by Stay Hidden, Stay Silent, it no longer untaps: survival triggers every turn.
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stay Hidden, Stay Silent"), targets: { enchant: [vet] } }),
    );
    for (let i = 0; i < 3; i++) {
      expect(chars(s, vet)).toMatchObject({ power: 2, toughness: 1 });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main2" && x.pending?.kind === "choice");
      const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
      s = act(s, "p1", { type: "choose", values: req?.type === "pick" ? [req.options[0] as string] : [] });
      s = settle(s);
      s = advanceUntil(s, (x) => x.turn.step !== "main2");
    }
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(chars(s, vet)).toMatchObject({ power: 5, toughness: 4 });
    expect(chars(s, vet).keywords).toContain("hexproof");
  });

  it("Vile Mutilator: sacrifice a creature or an enchantment; each opponent sacrifices an enchantment then a nontoken creature", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Swamp", 7)], hand: ["Vile Mutilator"] },
      p2: { battlefield: ["Nowhere to Run", "Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Vile Mutilator"),
      sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(namesIn(s, s.players.p2?.graveyard).sort()).toEqual(["Nowhere to Run", "Serra Angel"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Vile Mutilator")).keywords).toEqual(
      expect.arrayContaining(["flying", "trample"]),
    );
  });

  it("Violent Urge: +1/+0 and the initiative; with delirium, double strike", () => {
    const run = (graveyard: string[]) => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Mountain"], hand: ["Violent Urge"], graveyard } });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Violent Urge"), targets: { t: [cub] } }));
      const c = chars(s, cub);
      return [c.power, c.keywords.includes("firstStrike"), c.keywords.includes("doubleStrike")];
    };
    expect(run([])).toEqual([3, true, false]);
    expect(run(DELIRIUM)).toEqual([3, true, true]);
  });

  it("Wickerfolk Thresher: delirium, when attacking, the top card goes to the battlefield if it's a land, otherwise to hand", () => {
    const run = (top: string, yes = true) => {
      let s = scenario({ p1: { battlefield: ["Wickerfolk Thresher"], graveyard: DELIRIUM, library: [top, "Island"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Wickerfolk Thresher")]);
      s = settleNoBlocks(s, (req) => (req.type === "yesNo" ? [yes ? 1 : 0] : req.type === "pick" && !yes ? [] : undefined));
      return [namesIn(s, s.players.p1?.hand), idsOf(s, "p1", "battlefield", "Forest").length];
    };
    expect(run("Forest")).toEqual([[], 1]);
    // The declined land goes to hand.
    expect(run("Forest", false)).toEqual([["Forest"], 0]);
    expect(run("Bear Cub")).toEqual([["Bear Cub"], 0]);
  });

  it("Wildfire Wickerfolk: haste; delirium, +1/+1 and trample", () => {
    const at = (graveyard: string[]) => {
      const s = scenario({ p1: { battlefield: ["Wildfire Wickerfolk"], graveyard } });
      const c = chars(s, idOf(s, "p1", "battlefield", "Wildfire Wickerfolk"));
      return [c.power, c.toughness, c.keywords.includes("haste"), c.keywords.includes("trample")];
    };
    expect(at([])).toEqual([3, 2, true, false]);
    expect(at(DELIRIUM)).toEqual([4, 3, true, true]);
  });

  it("Withering Torment: destroys a creature or an enchantment, and you lose 2 life", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Withering Torment"] },
      p2: { battlefield: ["Nowhere to Run", "Bear Trap"] },
    });
    const card = idOf(s, "p1", "hand", "Withering Torment");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Bear Trap")] } })).toThrow();
    s = act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Nowhere to Run")] } });
    s = settle(s);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Nowhere to Run"]);
    expect(s.players.p1?.life).toBe(18);
  });
});

describe("Duskmourn: lifted approximations (scripts)", () => {
  it("Unstoppable Slasher: a counter of any kind keeps it from coming back", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Unstoppable Slasher", counters: { oil: 1 } }, ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
      },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Unstoppable Slasher")] },
    });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Unstoppable Slasher")).toHaveLength(0);
    expect(namesIn(s, s.players.p1?.graveyard)).toContain("Unstoppable Slasher");
  });

  it("Unwilling Vessel: X counts all its counters, of any kind", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Unwilling Vessel", counters: { possession: 1, oil: 2 } }, ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
      },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Lightning Strike"),
      targets: { t: [idOf(s, "p1", "battlefield", "Unwilling Vessel")] },
    });
    s = settle(s);
    expect(chars(s, idOf(s, "p1", "battlefield", "Spirit"))).toMatchObject({ power: 3, toughness: 3 });
  });

  it("Twitching Doll: a Spider per counter, of any kind", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Twitching Doll", counters: { nest: 2, oil: 1 } }] } });
    s = activateNth(s, idOf(s, "p1", "battlefield", "Twitching Doll"));
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Spider")).toHaveLength(3);
  });

  it('Irreverent Gremlin: declining the discard does not count for "once each turn"; with no card to discard, no draw', () => {
    let s = scenario({
      p1: {
        battlefield: ["Irreverent Gremlin", ...lands("Forest", 3)],
        hand: ["Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Opt"],
        library: lands("Island", 3),
      },
    });
    const cast = (x: S) => act(x, "p1", { type: "cast", card: idOf(x, "p1", "hand", "Llanowar Elves") });
    // First trigger declined.
    s = settleAnswering(cast(s), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(3);
    // Second: discard Opt, draw.
    s = settleAnswering(cast(s), (req, _p, cur) => (req.type === "yesNo" ? [1] : pickNamed(cur, req, "Opt")));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Island", "Llanowar Elves"]);
    // Done once this turn: no more triggers.
    s = cast(s);
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.pending?.kind).toBe("priority");
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    // Empty hand: accepting does not draw.
    let t = scenario({
      p1: { battlefield: ["Irreverent Gremlin", "Forest"], hand: ["Llanowar Elves"], library: lands("Island", 3) },
    });
    t = settleAnswering(cast(t), (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(t.players.p1?.library).toHaveLength(3);
  });

  it("Vengeful Possession: with no card to discard, no draw", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Vengeful Possession"], library: ["Forest", "Forest"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Vengeful Possession"),
      targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = settleAnswering(s, (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Fear of the Dark: only the defending player counts (a Glimmer with another opponent prevents nothing)", () => {
    const run = (defender: "p2" | "p3") => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Fear of the Dark"] },
        p3: { battlefield: ["Lionheart Glimmer"] },
      });
      const fear = idOf(s, "p1", "battlefield", "Fear of the Dark");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: fear, defender }] });
      s = passUntil(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
      return chars(s, fear)
        .keywords.filter((k) => k === "menace" || k === "deathtouch")
        .sort();
    };
    expect(run("p2")).toEqual(["deathtouch", "menace"]);
    expect(run("p3")).toEqual([]);
  });

  it("Dollmaker's Shop: only when a non-Toy creature attacks", () => {
    const run = (attackers: string[]) => {
      let s = scenario({ p1: { battlefield: ["Dollmaker's Shop // Porcelain Gallery", "Twitching Doll", "Bear Cub"] } });
      openDoors(s, "Dollmaker's Shop // Porcelain Gallery", [0]);
      s = attack(
        s,
        attackers.map((n) => idOf(s, "p1", "battlefield", n)),
      );
      s = settle(s);
      return idsOf(s, "p1", "battlefield", "Toy").length;
    };
    expect(run(["Twitching Doll"])).toBe(0);
    expect(run(["Twitching Doll", "Bear Cub"])).toBe(1);
  });

  it("Leyline of Resonance: only a spell that targets just one of your creatures", () => {
    const run = (withOpponentTarget: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Leyline of Resonance", "Bear Cub", ...lands("Mountain", 5)], hand: ["Dragonclaw Strike"] },
        p2: { battlefield: ["Gigantosaurus"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const giant = idOf(s, "p2", "battlefield", "Gigantosaurus");
      s = act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Dragonclaw Strike"),
        targets: { a: [cub], b: withOpponentTarget ? [giant] : [] },
      });
      const copies = s.stack.filter((i) => i.kind === "ability").length;
      s = settle(s);
      return { copies, power: s.objects[cub] ? chars(s, cub).power : 0 };
    };
    // A single target (yours): copied, the creature is doubled twice.
    expect(run(false)).toEqual({ copies: 1, power: 8 });
    // Two targets: no copy.
    expect(run(true).copies).toBe(0);
  });
});

describe("Duskmourn: generic forms (PLAN-A A3)", () => {
  it("Creeping Peeper: its mana unlocks a door, but does not pay another ability of a Room", () => {
    const VAULT = customCard({
      name: "Test Vault",
      typeLine: "Enchantment — Room",
      types: ["Enchantment"],
      subtypes: ["Room"],
      abilities: [dsl.activated({ mana: "{1}", effects: [dsl.fx.gainLife(1)], label: "Gain 1 life" })],
    });
    const s = scenario({ p1: { battlefield: ["Creeping Peeper", VAULT] } });
    expect(canActivate(s, "p1", idOf(s, "p1", "battlefield", "Test Vault"))).toBe(false);
    // Unlock Elegant Rotunda ({2}{W}): two Plains and Creeping Peeper's {U}.
    let t = scenario({ p1: { battlefield: ["Creeping Peeper", ROOM, ...lands("Plains", 2)] } });
    const room = openDoors(t, ROOM, [0]);
    t = settle(unlock(t, room));
    expect(t.objects[room]?.unlocked).toEqual([0, 1]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Creeping Peeper")]?.tapped).toBe(true);
  });

  describe("Monstrous Emergence", () => {
    const setup = (battlefield: string[], hand: string[] = []) =>
      scenario({
        p1: { battlefield: [...battlefield, ...lands("Forest", 2)], hand: ["Monstrous Emergence", ...hand] },
        p2: { battlefield: ["Serra Angel"] },
      });
    const castWith = (s: S, beheld: string[]) =>
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Monstrous Emergence"),
        targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        picks: { behold: beheld },
      });

    it("the creature chosen by the player (not the greatest power) sets the damage", () => {
      let s = setup(["Bear Cub", "Shivan Dragon"]);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Monstrous Emergence"));
      const pick = opt?.type === "cast" ? opt.picks?.find((p) => p.slot === "behold") : undefined;
      expect(pick?.optional).toBeFalsy();
      expect(namesIn(s, pick?.options).sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
      s = settle(castWith(s, [idOf(s, "p1", "battlefield", "Bear Cub")]));
      expect(s.objects[angel]?.damage).toBe(2);
    });

    it("a creature card revealed from hand; with no creature or card, the spell can't be cast", () => {
      let s = setup([], ["Shivan Dragon"]);
      s = settle(castWith(s, [idOf(s, "p1", "hand", "Shivan Dragon")]));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      const t = setup([], ["Opt"]);
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Monstrous Emergence"))).toBe(false);
      // The additional cost is mandatory.
      const u = setup(["Bear Cub"]);
      expect(() => castWith(u, [])).toThrow(RulesError);
    });

    it("the chosen creature left the battlefield: its power as it last existed (official ruling)", () => {
      let s = setup(["Bear Cub", "Shivan Dragon"]);
      const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
      s = castWith(s, [dragon]);
      moveObject(s, dragon, "graveyard");
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });
});

describe('Duskmourn, PLAN-A A4a: "that player controls"', () => {
  it("Fear of Falling: with several players, only the defending player's creatures are targets", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Fear of Falling"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      p3: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const run = combatTargetsOffered(attackPlayer(s, [idOf(s, "p1", "battlefield", "Fear of Falling")], "p3"));
    expect(run.offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
    s = run.s;
    expect(chars(s, idOf(s, "p3", "battlefield", "Shivan Dragon")).keywords).not.toContain("flying");
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).toContain("flying");
  });

  it("Fear of Falling: the target is rechecked on resolution (608.2b): passed to another player, it is illegal", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Fear of Falling"] },
      p3: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const dragon = idOf(s, "p3", "battlefield", "Shivan Dragon");
    s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Fear of Falling")], "p3");
    expect(s.pending?.kind).toBe("choice");
    s = act(s, "p1", { type: "choose", values: [dragon] });
    expect(s.stack.at(-1)?.targets.t).toEqual([dragon]);
    // p2 (another opponent) takes control of the Dragon before resolution: it is no longer the defending player's.
    s = steal(s, dragon, "p2");
    s = settleNoBlocks(s);
    expect(chars(s, dragon).keywords).toContain("flying");
    expect(chars(s, dragon).power).toBe(5);
  });

  it("Fear of Burning Alive: with several players, the targeted creature is the damaged player's", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Fear of Burning Alive", "Mountain", "Mountain"], hand: ["Lightning Strike"], graveyard: DELIRIUM },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      p3: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p3"] } });
    const offered: (string | undefined)[][] = [];
    s = settleAnswering(s, (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") offered.push(namesIn(cur, req.options));
      return undefined;
    });
    expect(offered.map((x) => [...x].sort())).toEqual([["Llanowar Elves", "Shivan Dragon"]]);
    expect(s.players.p3?.life).toBe(17);
    // p2's creatures are not affected.
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("attacked player (PLAN-H, lot H5)", () => {
  it("Dollmaker's Shop: a non-Toy creature that attacks a planeswalker does not attack a player", () => {
    const run = (atWalker: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Dollmaker's Shop // Porcelain Gallery", "Bear Cub"] },
        p2: { battlefield: ["Ajani Resolute"] },
      });
      openDoors(s, "Dollmaker's Shop // Porcelain Gallery", [0]);
      const defender = atWalker ? idOf(s, "p2", "battlefield", "Ajani Resolute") : "p2";
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender }] });
      s = settle(s);
      return idsOf(s, "p1", "battlefield", "Toy").length;
    };
    expect(run(true)).toBe(0);
    expect(run(false)).toBe(1);
  });
});

describe("Duskmourn: player statics and untapping (PLAN-H, H8b)", () => {
  it("Found Footage (look at face-down creatures) does not show the top card of your library; Johann (look at the top), does", () => {
    const s = scenario({
      p1: { battlefield: ["Found Footage"], library: ["Shivan Dragon", "Forest"] },
      p2: { battlefield: ["Johann, Apprentice Sorcerer"], library: ["Opt", "Forest"] },
    });
    const top1 = s.players.p1?.library[0];
    const top2 = s.players.p2?.library[0];
    expect(projectView(s, "p1").playableElsewhere.map((o) => o.id)).not.toContain(top1);
    expect(projectView(s, "p2").playableElsewhere.map((o) => o.id)).toContain(top2);
  });

  it("Prop Room: a creature that \"doesn't untap during its controller's untap step\" untaps during another player's", () => {
    const STUCK = customCard({ name: "Test Statue", power: 1, toughness: 1, abilities: [dsl.doesntUntap("self")] });
    let s = scenario({ p1: { battlefield: ["Dazzling Theater // Prop Room", { name: STUCK, tapped: true }] } });
    openDoors(s, "Dazzling Theater // Prop Room", [1]);
    const stuck = idOf(s, "p1", "battlefield", "Test Statue");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[stuck]?.tapped).toBe(false);
  });
});

describe("Duskmourn, PLAN-M M8b: approximations lifted", () => {
  it("Acrobatic Cheerleader: survival puts a flying counter on it; this ability triggers only once", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Acrobatic Cheerleader", tapped: true }] } });
    const cheer = idOf(s, "p1", "battlefield", "Acrobatic Cheerleader");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority");
    s = settle(s);
    expect(s.objects[cheer]?.counters.flying).toBe(1);
    expect(chars(s, cheer).keywords).toContain("flying");
    // The counter gone and the creature tapped again on its next turn: it doesn't trigger again.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const o = s.objects[cheer];
    if (o) {
      o.counters.flying = 0;
      o.tapped = true;
    }
    bump(s);
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(s.stack).toHaveLength(0);
    expect(s.objects[cheer]?.counters.flying ?? 0).toBe(0);
  });

  it("Rip, Spawn Hunter: the creature and Vehicle cards put into hand have different powers", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Rip, Spawn Hunter", tapped: true }],
        library: ["Bear Cub", "Bear Cub", "Forest", "Serra Angel", "Opt"],
      },
    });
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    if (req?.type !== "pick") throw new Error("pick expected");
    expect((namesIn(s, req.options) as string[]).sort()).toEqual(["Bear Cub", "Bear Cub", "Serra Angel"]);
    // The suggestion takes one card of each power.
    expect((namesIn(s, req.suggested.map(String)) as string[]).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    // Two Bear Cubs (power 2 both) are refused.
    const bears = req.options.filter((id) => nameOf(s, id) === "Bear Cub");
    expect(() => act(s, "p1", { type: "choose", values: bears })).toThrow(RulesError);
    s = settleAnswering(s);
    expect((namesIn(s, s.players.p1?.hand) as string[]).sort()).toEqual(["Bear Cub", "Serra Angel"]);
  });

  it("Unable to Scream: the enchanted face-down creature can't be turned face up, by its cost or by an effect", () => {
    // The Aura, attached on arrival to the designated creature.
    const enchant = (s: S, host: string) => {
      const d = card("Unable to Scream");
      registerDef(s, d);
      const aura = createObject(s, d.id, "p2", "battlefield");
      aura.attachedTo = host;
      bump(s);
    };
    const s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Bear Cub"] } });
    const hidden = putFaceDown(s, "p1", idOf(s, "p1", "hand", "Bear Cub"), false) as string;
    bump(s);
    // Without the Aura: its mana cost turns it face up.
    expect(canActivate(s, "p1", hidden)).toBe(true);
    enchant(s, hidden);
    expect(chars(s, hidden).keywords).toContain("cantBeTurnedFaceUp");
    expect(chars(s, hidden)).toMatchObject({ power: 0, toughness: 2 });
    expect(canActivate(s, "p1", hidden)).toBe(false);
    turnFaceUp(s, hidden);
    expect(s.objects[hidden]?.faceDown).toBeDefined();
    // A face-up enchanted creature doesn't have the restriction.
    const t = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    enchant(t, bear);
    expect(chars(t, bear).keywords).not.toContain("cantBeTurnedFaceUp");
    expect(chars(t, bear)).toMatchObject({ power: 0, toughness: 2 });
  });
});
