/**
 * Aetherdrift, lot A: Vehicles and Mounts (pilots, crew by toughness, "saddle / saddled"), cycling with X,
 * grouped discard, Verges, Roads, exhaust.
 */
import { TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { legalActions } from "../src/legal";
import { manaValue } from "../src/mana";
import { abilitiesOf } from "../src/stack";
import { bump, chars, moveObject } from "../src/state";
import { playerStatic } from "../src/statics";
import { plainText } from "../src/text";
import { stateBasedActions } from "../src/turn";
import { objectDidThisTurn } from "../src/turnlog";
import type { CardDef, ChoiceRequest, GameState, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castable,
  counterFrom,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  passUntil,
  picking,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
  stepTrail,
  throughCombat,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const abilityIndex = (s: S, id: string, label: string) =>
  chars(s, id).abilities.findIndex((a) => a.kind === "activated" && plainText(a.label ?? "").startsWith(label));

describe("Aetherdrift: Vehicles and Mounts", () => {
  it("a pilot crews as if its power were 2 greater (Crew 3 with a 1/1 creature)", () => {
    const s = scenario({ p1: { battlefield: ["Hulldrifter"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    const crew = abilityIndex(s, hull, "Crew");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === hull && a.ability === crew)).toBe(false);
    createTokens(s, "p1", TOKEN_SPECS.Pilot as TokenSpec, 1);
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === hull && a.ability === crew)).toBe(true);
  });

  it("Interface Ace crews with its toughness; Reckless Velocitaur gives +2/+0 to the equipped Vehicle", () => {
    let s = scenario({ p1: { battlefield: ["Hulldrifter", "Interface Ace"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = act(s, "p1", { type: "activate", source: hull, ability: abilityIndex(s, hull, "Crew") });
    s = passAccepting(s, (x) => x.stack.length === 0);
    expect(chars(s, hull).types).toContain("Creature");
    // "Whenever it becomes tapped during your turn, untap it": the Ace untapped.
    expect(s.objects[idOf(s, "p1", "battlefield", "Interface Ace")]?.tapped).toBe(false);
    let t = scenario({ p1: { battlefield: ["Hulldrifter", "Reckless Velocitaur"] } });
    const h2 = idOf(t, "p1", "battlefield", "Hulldrifter");
    t = act(t, "p1", { type: "activate", source: h2, ability: abilityIndex(t, h2, "Crew") });
    t = passAccepting(t, (x) => x.stack.length === 0);
    expect(chars(t, h2).power).toBe(5);
    expect(chars(t, h2).keywords).toContain("trample");
  });

  it("'attacks while saddled' (Gilded Ghoda: Treasure) only if it is saddled", () => {
    let s = scenario({ p1: { battlefield: ["Gilded Ghoda", "Llanowar Elves"] }, step: "main1" });
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    s = act(s, "p1", { type: "activate", source: ghoda, ability: abilityIndex(s, ghoda, "Saddle") });
    s = passBoth(s);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: ghoda, defender: "p2" }] });
    s = passAccepting(s, (x) => x.stack.length === 0 && idsOf(x, "p1", "battlefield", "Treasure").length > 0);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("cycling with X: Valor's Flagship creates X Pilots", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Valor's Flagship"] } });
    const ship = idOf(s, "p1", "hand", "Valor's Flagship");
    s = act(s, "p1", { type: "activate", source: ship, ability: abilityIndex(s, ship, "Cycling"), x: 3 });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(3);
  });

  it("grouped discard: Marauding Mako gets a counter when a card is cycled", () => {
    let s = scenario({ p1: { battlefield: ["Marauding Mako", ...lands("Plains", 2)], hand: ["Lightshield Parry"] } });
    const mako = idOf(s, "p1", "battlefield", "Marauding Mako");
    const parry = idOf(s, "p1", "hand", "Lightshield Parry");
    s = act(s, "p1", { type: "activate", source: parry, ability: abilityIndex(s, parry, "Cycling") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[mako]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Verge: the second color only with the right land type; Roads enter tapped without a Mount or Vehicle", () => {
    const s = scenario({ p1: { battlefield: ["Sunbillow Verge"] } });
    const verge = idOf(s, "p1", "battlefield", "Sunbillow Verge");
    const colors = (x: S) =>
      legalActions(x, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === verge ? a.colors : []));
    expect(colors(s)).toEqual(["W"]);
    const t = scenario({ p1: { battlefield: ["Sunbillow Verge", "Mountain"] } });
    const v2 = idOf(t, "p1", "battlefield", "Sunbillow Verge");
    expect(legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === v2 ? a.colors : []))).toEqual([
      "W",
      "R",
    ]);
    let r = scenario({ p1: { hand: ["Rocky Roads"] } });
    r = act(r, "p1", { type: "playLand", card: idOf(r, "p1", "hand", "Rocky Roads") });
    expect(r.objects[idOf(r, "p1", "battlefield", "Rocky Roads")]?.tapped).toBe(true);
    let q = scenario({ p1: { battlefield: ["Hulldrifter"], hand: ["Rocky Roads"] } });
    q = act(q, "p1", { type: "playLand", card: idOf(q, "p1", "hand", "Rocky Roads") });
    expect(q.objects[idOf(q, "p1", "battlefield", "Rocky Roads")]?.tapped).toBe(false);
  });

  it("exhaust: Basri does not untap during the next untap step", () => {
    let s = scenario({ p1: { battlefield: ["Basri, Tomorrow's Champion", "Plains"] } });
    const basri = idOf(s, "p1", "battlefield", "Basri, Tomorrow's Champion");
    s = act(s, "p1", { type: "activate", source: basri, ability: abilityIndex(s, basri, "1/1 Cat") });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Cat")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(s.objects[basri]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(false);
  });
});

describe("Aetherdrift: speed (702.179) and exhaust (702.177)", () => {
  it("'Start your engines!' starts speed at 1; it increases once per turn when an opponent loses life", () => {
    let s = scenario({
      p1: { battlefield: ["Walking Sarcophagus", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    expect(s.players.p1?.speed).toBe(1); // state-based actions before priority
    s = passBoth(s);
    // The speed ability triggers and goes on the stack (it can be responded to).
    expect(s.players.p1?.speed).toBe(1);
    expect(s.stack.map((x) => x.sourceDefId)).toEqual(["rules:speed"]);
    s = passBoth(s);
    expect(s.players.p1?.speed).toBe(2);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(s.stack).toEqual([]); // only once per turn
    expect(s.players.p1?.speed).toBe(2);
  });

  it("speed (702.179): 'if your speed is less than 4', checked on trigger and on resolution", () => {
    let s = scenario({
      p1: { battlefield: ["Walking Sarcophagus", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    s.players.p1!.speed = 4;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
    // Maximum speed: the ability does not trigger, and does not count for 'once per turn'.
    expect([s.players.p1?.speed, s.turn.onceFired.includes("rules:speed")]).toEqual([4, false]);
    s.players.p1!.speed = 3;
    s = passBoth(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
    expect(s.stack.map((x) => x.sourceDefId)).toEqual(["rules:speed"]);
    // Speed reaches 4 before resolution: the ability does nothing (and does not take it past 4).
    s.players.p1!.speed = 4;
    s = passBoth(s);
    expect([s.stack.length, s.players.p1?.speed]).toEqual([0, 4]);
  });

  it("speed: the ability belongs to the active player; their own life loss does not trigger it", () => {
    let s = scenario({
      p1: { battlefield: ["Walking Sarcophagus", ...lands("Mountain", 4)], hand: ["Lightning Strike"] },
      p2: { battlefield: ["Walking Sarcophagus"] },
    });
    s.players.p2!.speed = 1;
    s = passBoth(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p1"] } }));
    expect([s.stack.length, s.players.p1?.speed, s.players.p2?.speed]).toEqual([0, 1, 1]);
  });

  it("maximum speed: Walking Sarcophagus +1/+2; Spikeshell Harrier lowers the speed of the fastest player", () => {
    const s = scenario({ p1: { battlefield: ["Walking Sarcophagus"] }, p2: { battlefield: ["Walking Sarcophagus"] } });
    s.players.p1!.speed = 4;
    s.version += 1;
    const mine = idOf(s, "p1", "battlefield", "Walking Sarcophagus");
    expect(chars(s, mine).power).toBe(3);
    expect(chars(s, idOf(s, "p2", "battlefield", "Walking Sarcophagus")).power).toBe(2);
    let t = scenario({
      p1: { battlefield: ["Walking Sarcophagus"] },
      p2: { battlefield: [...lands("Island", 5)], hand: ["Spikeshell Harrier"] },
      active: "p2",
    });
    t.players.p1!.speed = 4;
    t.players.p2!.speed = 1;
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Spikeshell Harrier") });
    t = passAccepting(t, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.speed).toBe(3);
  });

  it("exhaust: a single activation, triggers 'when you activate an exhaust ability'", () => {
    let s = scenario({ p1: { battlefield: ["Prowcatcher Specialist", "Rangers' Refueler", ...lands("Mountain", 8)] } });
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    const hand = s.players.p1?.hand.length ?? 0;
    s = act(s, "p1", { type: "activate", source: pro, ability: abilityIndex(s, pro, "Exhaust") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[pro]?.counters["+1/+1"]).toBe(2);
    expect(s.players.p1?.hand.length).toBe(hand + 1); // Rangers' Refueler
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === pro)).toBe(false);
  });

  it("Elvish Refueler: an exhaust ability that can be reactivated during your turn as long as none has been activated", () => {
    let s = scenario({
      p1: { battlefield: ["Elvish Refueler", "Skystreak Engineer", ...lands("Island", 5), ...lands("Forest", 5)] },
    });
    const eng = idOf(s, "p1", "battlefield", "Skystreak Engineer");
    s.objects[eng]!.used = [abilityIndex(s, eng, "Exhaust")];
    s.version += 1;
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === eng)).toBe(true);
    s = act(s, "p1", { type: "activate", source: eng, ability: abilityIndex(s, eng, "Exhaust") });
    s = passBoth(s);
    const ref = idOf(s, "p1", "battlefield", "Elvish Refueler");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === ref)).toBe(true);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === eng)).toBe(false);
  });

  it("Samut: +X/+0 to other creatures (X = speed); Vnwxt at max speed draws double", () => {
    const s = scenario({ p1: { battlefield: ["Samut, the Driving Force", "Bear Cub"] } });
    s.players.p1!.speed = 3;
    s.version += 1;
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(5);
    let t = scenario({ p1: { battlefield: ["Vnwxt, Verbose Host", ...lands("Island", 3)], hand: ["Stock Up"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    const before = t.players.p1?.hand.length ?? 0;
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    // Draw step draw: two cards.
    expect((t.players.p1?.hand.length ?? 0) - before).toBeGreaterThanOrEqual(2);
  });
});

describe("Aetherdrift, lot C", () => {
  it("Possession Engine: control as long as you control the Vehicle; neither attacks nor blocks", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Possession Engine"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Possession Engine") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    // The Vehicle leaves: the Angel goes back to its opponent, without restriction.
    const engine = idOf(s, "p1", "battlefield", "Possession Engine");
    moveObject(s, engine, "graveyard");
    stateBasedActions(s);
    const back = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, back).keywords).not.toContain("cantAttack");
  });

  it("Trade the Helm swaps control; Skyseer's Chariot taxes abilities of the chosen name", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Trade the Helm"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Trade the Helm"),
      targets: { a: [idOf(s, "p1", "battlefield", "Bear Cub")], b: [idOf(s, "p2", "battlefield", "Serra Angel")] },
    });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Engine Rat", ...lands("Swamp", 6)] }, p2: { battlefield: ["Skyseer's Chariot"] } });
    const chariot = idOf(t, "p2", "battlefield", "Skyseer's Chariot");
    t.objects[chariot]!.chosen = { cardName: "Engine Rat" };
    t.version += 1;
    const rat = idOf(t, "p1", "battlefield", "Engine Rat");
    // {5}{B} + {2} = 8 mana: 6 Swamps are not enough.
    expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === rat)).toBe(false);
  });

  it("Waxen Shapethief enters as a copy; Ancient Vendetta exiles cards of the chosen name", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Serra Angel"], hand: ["Waxen Shapethief"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Waxen Shapethief") });
    s = passBoth(s);
    s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "battlefield", "Serra Angel")] });
    const copies = s.battlefield.filter((id) => chars(s, id).name === "Serra Angel");
    expect(copies).toHaveLength(2);
    let t = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Ancient Vendetta"] },
      p2: { hand: ["Opt", "Opt"], graveyard: ["Opt"], library: ["Opt", "Forest", "Opt", "Forest"] },
    });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Ancient Vendetta"), targets: { t: ["p2"] } });
    t = passBoth(t);
    t = act(t, "p1", { type: "choose", values: ["Opt"] });
    expect(t.exile.filter((id) => t.objects[id]?.owner === "p2")).toHaveLength(4);
  });

  it("Radiant Lotus: sacrifice one or more artifacts; the targeted player adds three mana of the chosen color per artifact", () => {
    const run = (who: "p1" | "p2") => {
      let s = scenario({ p1: { battlefield: ["Radiant Lotus", "Nutrient Block", "Scrap Compactor"] } });
      const lotus = idOf(s, "p1", "battlefield", "Radiant Lotus");
      s = act(s, "p1", { type: "activate", source: lotus, ability: 0, x: 2, targets: { p: [who] } });
      // An ability that targets is not a mana ability (605.1a): it uses the stack.
      expect(s.stack.length).toBeGreaterThan(0);
      // The Nutrient Block trigger (sacrificed) resolves first; the color is chosen on resolution (red).
      for (let i = 0; i < 8 && (s.stack.length > 0 || s.pending?.kind === "choice"); i++) {
        s = s.pending?.kind === "choice" ? act(s, s.pending.player, { type: "choose", values: ["3"] }) : passBoth(s);
      }
      return s;
    };
    const mine = run("p1");
    expect(mine.players.p1?.manaPool.R).toBe(6);
    expect(idsOf(mine, "p1", "battlefield", "Radiant Lotus")).toHaveLength(1);
    const theirs = run("p2");
    expect(theirs.players.p2?.manaPool.R).toBe(6);
    expect(theirs.players.p1?.manaPool.R).toBe(0);
  });

  it("Ketramose: a single trigger for several cards exiled at the same time", () => {
    let s = scenario({
      p1: { battlefield: ["Ketramose, the New Dawn", "Dauntless Scrapbot"], library: lands("Plains", 10) },
      p2: { graveyard: ["Opt", "Opt", "Opt"] },
    });
    const bot = idOf(s, "p1", "battlefield", "Dauntless Scrapbot");
    const ab = chars(s, bot).abilities.findIndex((a) => a.kind === "triggered");
    expect(ab).toBeGreaterThanOrEqual(0);
    // The Scrapbot's enters trigger exiles the three cards of the opposing graveyard at the same time.
    moveObject(s, bot, "hand");
    const scrap = idOf(s, "p1", "hand", "Dauntless Scrapbot");
    s.players.p1!.hand = [scrap];
    moveObject(s, scrap, "battlefield");
    const hand = s.players.p1?.hand.length ?? 0;
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(s.players.p2?.graveyard).toHaveLength(0);
    // A single 'draw, lose 1 life' (plus any draws from other effects: none here).
    expect(s.players.p1?.life).toBe(19);
    expect((s.players.p1?.hand.length ?? 0) - hand).toBe(1);
  });

  it("The Aetherspark: attached, it can't be attacked", () => {
    let s = scenario({
      p1: { battlefield: ["The Aetherspark", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel"] },
      active: "p1",
    });
    const spark = idOf(s, "p1", "battlefield", "The Aetherspark");
    s.objects[spark]!.counters.loyalty = 4;
    const plus = chars(s, spark).abilities.findIndex((a) => a.kind === "activated" && a.label?.includes("Attach"));
    s = act(s, "p1", {
      type: "activate",
      source: spark,
      ability: plus,
      targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] },
    });
    s = passBoth(s);
    expect(s.objects[spark]?.attachedTo).toBe(idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
  });
});

describe("Aetherdrift: Standard meta deck cards (PLAN-C, lot C13)", () => {
  /** Answers 'yes' to questions and chooses the wanted objects. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const manaColors = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : []));

  it("Riverpyre Verge: {R} always, {U} only with an Island or a Mountain", () => {
    const s = scenario({ p1: { battlefield: ["Riverpyre Verge", "Forest"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Riverpyre Verge"))).toEqual(["R"]);
    const t = scenario({ p1: { battlefield: ["Riverpyre Verge", "Island"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Riverpyre Verge"))).toEqual(["R", "U"]);
  });

  it("Bleachbone Verge: {B} always, {W} only with a Plains or a Swamp", () => {
    const s = scenario({ p1: { battlefield: ["Bleachbone Verge", "Island"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Bleachbone Verge"))).toEqual(["B"]);
    const t = scenario({ p1: { battlefield: ["Bleachbone Verge", "Swamp"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Bleachbone Verge"))).toEqual(["B", "W"]);
  });

  describe("Spell Pierce", () => {
    /** p1 casts Lightning Strike on p2; p2 responds with Spell Pierce. */
    const setup = (extra: number) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2 + extra), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Island"], hand: ["Spell Pierce"] },
      });
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      return cast(s, "p2", "Spell Pierce", { targets: { t: [s.stack[0]?.id as string] } });
    };

    it("counters the noncreature spell if its controller doesn't pay {2}", () => {
      const s = settle(setup(0));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
    });

    it("the controller pays {2}: the spell resolves", () => {
      const s = settle(setup(2), (req) => (req.intent === "unlessPay" ? [1] : undefined));
      expect(s.players.p2?.life).toBe(17);
    });

    it("does not target a creature spell", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
        p2: { battlefield: ["Island"], hand: ["Spell Pierce"] },
      });
      s = cast(s, "p1", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      expect(legalActions(s, "p2").some((a) => a.type === "cast")).toBe(false);
    });
  });

  it("Greasewrench Goblin: exhaust — discard up to two cards, draw that many, +1/+1 counter", () => {
    let s = scenario({
      p1: { battlefield: ["Greasewrench Goblin", ...lands("Mountain", 3)], hand: ["Opt", "Island"], library: lands("Plains", 5) },
    });
    const goblin = idOf(s, "p1", "battlefield", "Greasewrench Goblin");
    const hand = [...(s.players.p1?.hand ?? [])];
    s = settle(activate(s, "p1", goblin, "Exhaust"), choosing(hand));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(expect.arrayContaining(["Opt", "Island"]));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains", "Plains"]);
    expect(s.objects[goblin]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", goblin)).toBe(false);
  });

  it("Perilous Snare: exiles an opposing nonland permanent until it leaves; max speed: +1/+1 counter", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Perilous Snare"] },
      p2: { battlefield: ["Serra Angel", "Island"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Perilous Snare"), choosing([angel]));
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    expect(s.players.p1?.speed).toBe(1);
    const snare = idOf(s, "p1", "battlefield", "Perilous Snare");
    destroy(s, snare);
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: ["Perilous Snare", "Bear Cub"] } });
    const trap = idOf(t, "p1", "battlefield", "Perilous Snare");
    expect(canActivate(t, "p1", trap)).toBe(false);
    t.players.p1!.speed = 4;
    t.version += 1;
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(activate(t, "p1", trap, "Max speed", { targets: { t: [cub] } }));
    expect(t.objects[cub]?.counters["+1/+1"]).toBe(1);
  });

  it("Bloodghast: can't block, haste if an opponent has 10 life or less, returns from the graveyard (landfall)", () => {
    const s = scenario({ p1: { battlefield: ["Bloodghast"] } });
    const ghast = idOf(s, "p1", "battlefield", "Bloodghast");
    expect(chars(s, ghast).keywords).toContain("cantBlock");
    expect(chars(s, ghast).keywords).not.toContain("haste");
    const low = scenario({ p1: { battlefield: ["Bloodghast"] }, p2: { life: 10 } });
    expect(chars(low, idOf(low, "p1", "battlefield", "Bloodghast")).keywords).toContain("haste");

    let t = scenario({ p1: { graveyard: ["Bloodghast"], hand: ["Swamp"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Swamp") });
    t = settle(t, choosing());
    expect(idsOf(t, "p1", "battlefield", "Bloodghast")).toHaveLength(1);
    expect(idsOf(t, "p1", "graveyard", "Bloodghast")).toHaveLength(0);
  });

  it("Oildeep Gearhulk: the targeted player discards the chosen card, then draws", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 2)], hand: ["Oildeep Gearhulk"] },
      p2: { hand: ["Shivan Dragon", "Opt"], library: lands("Mountain", 5) },
    });
    const dragon = idOf(s, "p2", "hand", "Shivan Dragon");
    s = settle(cast(s, "p1", "Oildeep Gearhulk"), choosing(["p2", dragon]));
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Mountain", "Opt"]);
    const hulk = idOf(s, "p1", "battlefield", "Oildeep Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["lifelink", "ward"]));
  });

  it("Repurposing Bay: an artifact with mana value equal to 1 plus that of the sacrificed artifact", () => {
    const gadget = (name: string, mv: number) =>
      customCard({
        name,
        typeLine: "Artifact",
        types: ["Artifact"],
        manaCost: { generic: mv, colored: {}, x: 0 },
        manaCostText: `{${mv}}`,
      });
    let s = scenario({
      p1: {
        battlefield: ["Repurposing Bay", gadget("Rouage", 1), ...lands("Island", 2)],
        library: [gadget("Engrenage", 3), gadget("Ressort", 2), "Island"],
      },
    });
    const bay = idOf(s, "p1", "battlefield", "Repurposing Bay");
    let offered: (string | undefined)[] = [];
    s = settle(activate(s, "p1", bay, "mana value 1"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
      return undefined;
    });
    expect(offered).toEqual(["Ressort"]);
    expect(idsOf(s, "p1", "battlefield", "Ressort")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Rouage")).toHaveLength(1);
  });

  it("Chandra, Spark Hunter: 0 creates a 3/2 Vehicle; at the beginning of combat it becomes a creature with haste", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Spark Hunter"] } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Spark Hunter");
    s = settle(activate(s, "p1", chandra, "0:"));
    const vehicle = idOf(s, "p1", "battlefield", "Vehicle");
    expect(chars(s, vehicle).types).not.toContain("Creature");
    expect([chars(s, vehicle).power, chars(s, vehicle).toughness]).toEqual([3, 2]);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.stack.length > 0);
    s = settle(s, choosing([vehicle]));
    expect(chars(s, vehicle).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, vehicle).keywords).toContain("haste");
  });

  it("Chandra, Spark Hunter: +2 — discard a card, then draw", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Spark Hunter"], hand: ["Opt"], library: lands("Mountain", 5) } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Spark Hunter");
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settle(activate(s, "p1", chandra, "+2"), choosing([opt]));
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Mountain"]);
    expect(s.objects[chandra]?.counters.loyalty).toBe(6);
  });

  it("Monument to Endurance: on each discard, a mode not yet chosen this turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Monument to Endurance", ...lands("Swamp", 6)],
        hand: ["Intimidation Tactics", "Intimidation Tactics"],
        library: lands("Plains", 5),
      },
    });
    const modesSeen: string[][] = [];
    const cycle = (cur: S, pickLabel: string) => {
      const card = idsOf(cur, "p1", "hand", "Intimidation Tactics")[0] as string;
      return settle(activate(cur, "p1", card, "Cycling"), (req) => {
        if (req.type !== "pick" || !req.labels) return undefined;
        modesSeen.push(req.options.map((o) => req.labels?.[o] ?? String(o)));
        const want = req.options.find((o) => req.labels?.[o]?.includes(pickLabel));
        return want === undefined ? undefined : [want];
      });
    };
    s = cycle(s, "loses 3 life");
    expect(s.players.p2?.life).toBe(17);
    s = cycle(s, "Treasure");
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(modesSeen[1]?.some((l) => l.includes("loses 3 life"))).toBe(false);
  });

  it("Intimidation Tactics: exiles an artifact or creature card from the opponent's hand", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Intimidation Tactics"] },
      p2: { hand: ["Shivan Dragon", "Opt", "Forest"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Intimidation Tactics", { targets: { t: ["p2"] } }), (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options);
      return undefined;
    });
    expect(offered).toEqual(["Shivan Dragon"]);
    expect(namesIn(s, s.exile)).toContain("Shivan Dragon");
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Bounce Off: returns a creature (or a Vehicle) to its owner's hand", () => {
    let s = scenario({
      p1: { battlefield: ["Island"], hand: ["Bounce Off"] },
      p2: { battlefield: ["Serra Angel", "Hulldrifter"] },
    });
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toContain(hull);
    s = settle(cast(s, "p1", "Bounce Off", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
  });

  it("Broadside Barrage: 5 damage to a creature, then draw and discard", () => {
    let s = scenario({
      p1: { battlefield: ["Island", "Mountain", "Mountain"], hand: ["Broadside Barrage", "Opt"], library: lands("Plains", 5) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settle(
      cast(s, "p1", "Broadside Barrage", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
      choosing([opt]),
    );
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Lumbering Worldwagon: power equal to the number of lands; on arrival, a tapped basic land", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Lumbering Worldwagon"], library: ["Opt", "Plains"] } });
    s = settle(cast(s, "p1", "Lumbering Worldwagon"), choosing());
    const plains = idOf(s, "p1", "battlefield", "Plains");
    expect(s.objects[plains]?.tapped).toBe(true);
    const wagon = idOf(s, "p1", "battlefield", "Lumbering Worldwagon");
    expect(chars(s, wagon).power).toBe(4);
  });
});

describe("Aetherdrift, lot K8: mythic rares", () => {
  /** The 'activate' option of `source` whose label contains `label`. */
  const option = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    return a?.type === "activate" ? a : undefined;
  };
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = option(s, player, source, label);
    if (!a) throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  it("Brightglass Gearhulk: up to two artifact, creature or enchantment cards with MV 1 or less", () => {
    const relic = customCard({ name: "Relique", typeLine: "Artifact", types: ["Artifact"] });
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Plains", 2)],
          hand: ["Brightglass Gearhulk"],
          library: ["Llanowar Elves", relic, "Opt", "Bear Cub", "Island", "Llanowar Elves"],
        },
      });
    let offered: (string | undefined)[] = [];
    const s = settle(cast(setup(), "p1", "Brightglass Gearhulk"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options.map(String));
      return req.options.slice(0, 2);
    });
    // Neither an instant (Opt), nor MV 2 (Bear Cub), nor a land.
    expect([...new Set(offered)].sort()).toEqual(["Llanowar Elves", "Relique"]);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.library).toHaveLength(4);
    const hulk = idOf(s, "p1", "battlefield", "Brightglass Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["firstStrike", "trample"]));
    // 'You may': declining searches for nothing.
    const no = settle(cast(setup(), "p1", "Brightglass Gearhulk"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(no.players.p1?.hand).toHaveLength(0);
    expect(no.players.p1?.library).toHaveLength(6);
  });

  it("Coalstoke Gearhulk: a creature with MV 4 or less from a graveyard, under your control with a finality counter, menace, deathtouch and haste, exiled at your end step", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 2), ...lands("Mountain", 3)],
        hand: ["Coalstoke Gearhulk"],
        graveyard: ["Llanowar Elves"],
      },
      p2: { graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Coalstoke Gearhulk"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options.map(String));
      return req.options.filter((o) => namesIn(cur, [String(o)])[0] === "Bear Cub");
    });
    // Any graveyard, but not the MV 6 creature.
    expect([...offered].sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[cub]?.counters.finality).toBe(1);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["menace", "deathtouch", "haste"]));
    const hulk = idOf(s, "p1", "battlefield", "Coalstoke Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["menace", "deathtouch"]));
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
  });

  it("Hazoret, Godseeker: neither attacks nor blocks without max speed; {1}, {T}: a creature with power 2 or less can't be blocked", () => {
    let s = scenario({ p1: { battlefield: ["Hazoret, Godseeker", "Bear Cub", "Serra Angel", "Mountain"] } });
    const hazoret = idOf(s, "p1", "battlefield", "Hazoret, Godseeker");
    expect(s.players.p1?.speed).toBe(1);
    expect(chars(s, hazoret).keywords).toEqual(expect.arrayContaining(["indestructible", "haste", "cantAttack", "cantBlock"]));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const legal = option(s, "p1", hazoret, "Unblockable")?.targets[0]?.legal ?? [];
    expect(legal).toContain(cub);
    expect(legal).not.toContain(angel);
    s = settle(activate(s, "p1", hazoret, "Unblockable", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toContain("unblockable");
    expect(s.objects[hazoret]?.tapped).toBe(true);
    const max = scenario({ p1: { battlefield: ["Hazoret, Godseeker"] } });
    max.players.p1!.speed = 4;
    max.version += 1;
    expect(chars(max, idOf(max, "p1", "battlefield", "Hazoret, Godseeker")).keywords).not.toContain("cantAttack");
  });

  it("Loot, the Pathfinder: three exhaust abilities ({U}: draw three cards, {R}: 3 damage), each only once", () => {
    let s = scenario({ p1: { battlefield: ["Loot, the Pathfinder", ...lands("Island", 2), "Mountain"] } });
    const loot = idOf(s, "p1", "battlefield", "Loot, the Pathfinder");
    expect(chars(s, loot).keywords).toEqual(expect.arrayContaining(["doubleStrike", "vigilance", "haste"]));
    s = settle(activate(s, "p1", loot, "draw three"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.objects[loot]?.tapped).toBe(true);
    s.objects[loot]!.tapped = false;
    s.version += 1;
    expect(option(s, "p1", loot, "draw three")).toBeUndefined();
    s = settle(activate(s, "p1", loot, "3 damage", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Loot, the Pathfinder: exhaust — {G}, {T}: three mana of one color", () => {
    let s = scenario({ p1: { battlefield: ["Loot, the Pathfinder", "Forest"] } });
    const loot = idOf(s, "p1", "battlefield", "Loot, the Pathfinder");
    s = settle(activate(s, "p1", loot, "three mana"), (req) => (req.type === "pick" ? ["R"] : undefined));
    expect(s.players.p1?.manaPool.R).toBe(3);
  });

  it("March of the World Ooze: your creatures have base P/T 6/6 and are Oozes; 3/3 Elephant when an opponent casts a spell outside their turn", () => {
    let s = scenario({
      p1: { battlefield: ["March of the World Ooze", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
      p2: { battlefield: ["Bear Cub", "Island", "Island"], hand: ["Opt", "Opt"] },
    });
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(pt(s, mine)).toEqual([7, 7]);
    expect(chars(s, mine).subtypes).toEqual(expect.arrayContaining(["Bear", "Ooze"]));
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Opt"));
    const elephants = idsOf(s, "p1", "battlefield", "Elephant");
    expect(elephants).toHaveLength(1);
    expect(pt(s, elephants[0] as string)).toEqual([6, 6]);
    // During their own turn, the opponent triggers nothing.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["March of the World Ooze"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    t = settle(cast(t, "p2", "Opt"));
    expect(idsOf(t, "p1", "battlefield", "Elephant")).toHaveLength(0);
  });

  it("Mimeoplasm, Revered One: exiles up to X creature cards from your graveyard, three counters per card; {2}: copy of a card exiled with it, 0/0 and keeps this ability", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), ...lands("Forest", 2), ...lands("Island", 4)],
        hand: ["Mimeoplasm, Revered One"],
        graveyard: ["Serra Angel", "Bear Cub", "Shivan Dragon", "Opt"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Mimeoplasm, Revered One", { x: 2 }), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options.map(String));
      return [angel, dragon];
    });
    expect([...offered].sort()).toEqual(["Bear Cub", "Serra Angel", "Shivan Dragon"]);
    const mimeo = idOf(s, "p1", "battlefield", "Mimeoplasm, Revered One");
    expect(s.objects[mimeo]?.counters["+1/+1"]).toBe(6);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
    const exAngel = exiled(s, "Serra Angel")[0] as string;
    const exDragon = exiled(s, "Shivan Dragon")[0] as string;
    expect(option(s, "p1", mimeo, "copy")?.targets[0]?.legal.sort()).toEqual([exAngel, exDragon].sort());
    s = settle(activate(s, "p1", mimeo, "copy", { targets: { t: [exAngel] } }));
    const c = chars(s, mimeo);
    expect(c.name).toBe("Serra Angel");
    expect([c.power, c.toughness]).toEqual([6, 6]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    // The copy keeps the ability: it can become the Dragon.
    expect(option(s, "p1", mimeo, "copy")?.targets[0]?.legal).toContain(exDragon);
  });

  it("Mu Yanling, Wind Rider: colorless 3/2 Vehicle with crew 1; your Vehicles fly", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Mu Yanling, Wind Rider"] },
      p2: { battlefield: ["Salvation Engine"] },
    });
    s = settle(cast(s, "p1", "Mu Yanling, Wind Rider"));
    const v = idOf(s, "p1", "battlefield", "Vehicle");
    const c = chars(s, v);
    expect([c.power, c.toughness, c.colors]).toEqual([3, 2, []]);
    expect(c.subtypes).toContain("Vehicle");
    expect(c.types).not.toContain("Creature");
    expect(c.keywords).toContain("flying");
    expect(c.abilities.some((a) => a.kind === "activated" && plainText(a.label ?? "").includes("Crew 1"))).toBe(true);
    // An opposing Vehicle doesn't fly.
    expect(chars(s, idOf(s, "p2", "battlefield", "Salvation Engine")).keywords).not.toContain("flying");
  });

  it("Mu Yanling, Wind Rider: a single draw when several flying creatures damage a player; nothing for a creature without flying", () => {
    let s = scenario({
      p1: { battlefield: ["Mu Yanling, Wind Rider", "Serra Angel", "Serra Angel", "Bear Cub"], library: lands("Plains", 5) },
    });
    const angels = idsOf(s, "p1", "battlefield", "Serra Angel");
    s = attack(s, [...angels]);
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(12);
    expect(s.players.p1?.hand).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Mu Yanling, Wind Rider", "Bear Cub"] } });
    t = attack(t, [idOf(t, "p1", "battlefield", "Bear Cub")]);
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(t.players.p2?.life).toBe(18);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Pyrewood Gearhulk: other creatures you control get +2/+2, vigilance and menace until end of turn; damage can't be prevented this turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), ...lands("Forest", 3), "Bear Cub"], hand: ["Pyrewood Gearhulk"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Pyrewood Gearhulk"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const hulk = idOf(s, "p1", "battlefield", "Pyrewood Gearhulk");
    expect(pt(s, cub)).toEqual([4, 4]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["vigilance", "menace"]));
    expect(pt(s, hulk)).toEqual([7, 7]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, cub)).toEqual([2, 2]);
    expect(chars(s, cub).keywords).not.toContain("menace");
    expect(playerStatic(s, "p1", "damageUnpreventable")).toBe(false);
  });

  it("Riptide Gearhulk: up to one nonland permanent per opponent, put third from the top of its owner's library", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Plains", 2), ...lands("Island", 3), "Bear Cub"], hand: ["Riptide Gearhulk"] },
      p2: { battlefield: ["Serra Angel", "Island"], library: lands("Forest", 4) },
      p3: { battlefield: ["Llanowar Elves"], library: lands("Plains", 4) },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elf = idOf(s, "p3", "battlefield", "Llanowar Elves");
    const offered: string[][] = [];
    s = settle(cast(s, "p1", "Riptide Gearhulk"), (req) => {
      if (req.type !== "pick") return undefined;
      offered.push(req.options.map(String));
      return req.options.filter((o) => o === angel || o === elf);
    });
    const all = offered.flat();
    expect(all).not.toContain(idOf(s, "p1", "battlefield", "Bear Cub"));
    expect(all).not.toContain(idOf(s, "p2", "battlefield", "Island"));
    expect(namesIn(s, s.players.p2?.library?.slice(0, 3))).toEqual(["Forest", "Forest", "Serra Angel"]);
    expect(namesIn(s, s.players.p3?.library?.slice(0, 3))).toEqual(["Plains", "Plains", "Llanowar Elves"]);
    const hulk = idOf(s, "p1", "battlefield", "Riptide Gearhulk");
    expect(chars(s, hulk).keywords).toEqual(expect.arrayContaining(["doubleStrike", "prowess"]));
  });

  it("Riptide Gearhulk: prowess, +1/+1 when you cast a noncreature spell", () => {
    let s = scenario({ p1: { battlefield: ["Riptide Gearhulk", "Island"], hand: ["Opt"] } });
    const hulk = idOf(s, "p1", "battlefield", "Riptide Gearhulk");
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, hulk)).toEqual([3, 6]);
  });

  it("Sab-Sunen, Luxa Embodied: counter at the beginning of your first main phase, two cards if the number is odd; attacks only with an even number", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Sab-Sunen, Luxa Embodied"], library: lands("Island", 10) },
    });
    const sab = idOf(s, "p1", "battlefield", "Sab-Sunen, Luxa Embodied");
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
    s = advanceUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0,
    );
    s = settle(s);
    expect(s.objects[sab]?.counters["+1/+1"]).toBe(1);
    // One card in the draw step, two from Sab-Sunen.
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(chars(s, sab).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    s = settle(s);
    expect(s.objects[sab]?.counters["+1/+1"]).toBe(2);
    // Even number: no extra draw (a single draw step card).
    expect(s.players.p1?.hand).toHaveLength(4);
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
    expect(chars(s, sab).keywords).toEqual(expect.arrayContaining(["reach", "trample", "indestructible"]));
  });

  it("Salvation Engine: other artifact creatures you control get +2/+2; when attacking, returns up to one artifact card from your graveyard", () => {
    const relic = customCard({ name: "Relique", typeLine: "Artifact", types: ["Artifact"] });
    const s = scenario({
      p1: { battlefield: ["Salvation Engine", "Walking Sarcophagus", "Bear Cub"] },
      p2: { battlefield: ["Walking Sarcophagus"] },
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Walking Sarcophagus"))).toEqual([4, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Walking Sarcophagus"))).toEqual([2, 1]);
    let t = scenario({
      p1: { battlefield: ["Salvation Engine", "Serra Angel", "Bear Cub"], graveyard: [relic, "Opt"] },
    });
    const engine = idOf(t, "p1", "battlefield", "Salvation Engine");
    t = settle(activate(t, "p1", engine, "Crew 6"));
    expect(chars(t, engine).types).toContain("Creature");
    t = attack(t, [engine]);
    t = settleNoBlocks(t);
    expect(idsOf(t, "p1", "battlefield", "Relique")).toHaveLength(1);
    expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("The Last Ride: 13/13 minus your life; {2}{B}, pay 2 life: draw a card (impossible with less than 2 life)", () => {
    let s = scenario({ p1: { life: 5, battlefield: ["The Last Ride", ...lands("Swamp", 3)] } });
    const ride = idOf(s, "p1", "battlefield", "The Last Ride");
    expect(pt(s, ride)).toEqual([8, 8]);
    s = settle(activate(s, "p1", ride, "Draw"));
    expect(s.players.p1?.life).toBe(3);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(pt(s, ride)).toEqual([10, 10]);
    const low = scenario({ p1: { life: 1, battlefield: ["The Last Ride", ...lands("Swamp", 3)] } });
    // No creature for crew: only the draw could be activated, but 1 life can't pay 2 life.
    expect(canActivate(low, "p1", idOf(low, "p1", "battlefield", "The Last Ride"))).toBe(false);
  });

  it("The Speed Demon: at your end step, draw X cards and lose X life (X = your speed); nothing at the opponent's end step", () => {
    let s = scenario({ p1: { battlefield: ["The Speed Demon"], library: lands("Swamp", 10) } });
    s.players.p1!.speed = 3;
    s.version += 1;
    const demon = idOf(s, "p1", "battlefield", "The Speed Demon");
    expect(chars(s, demon).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.turn.active === "p1",
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.life).toBe(17);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
    expect(s.players.p1?.life).toBe(17);
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Thunderous Velocipede: your other creatures and Vehicles enter with a +1/+1 counter (MV 4 or less) or three (MV 5 or more)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Thunderous Velocipede", ...lands("Plains", 5), ...lands("Island", 5), ...lands("Forest", 2)],
        hand: ["Bear Cub", "Serra Angel", "Hulldrifter"],
      },
      p2: { battlefield: [...lands("Forest", 2)], hand: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Bear Cub"));
    s = settle(cast(s, "p1", "Serra Angel"));
    s = settle(cast(s, "p1", "Hulldrifter"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.counters["+1/+1"]).toBe(3);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hulldrifter")]?.counters["+1/+1"]).toBe(3);
    expect(s.objects[idOf(s, "p1", "battlefield", "Thunderous Velocipede")]?.counters["+1/+1"] ?? 0).toBe(0);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Thunderous Velocipede"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = settle(cast(t, "p2", "Bear Cub"));
    expect(t.objects[idOf(t, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Aetherdrift, lot K8: rares (1)", () => {
  /** Answers 'yes' to questions and chooses the wanted objects. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Activates the ability of `source` whose label starts with `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  const artifact = (name: string, mv: number): CardDef =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });
  const creature = (name: string, subtypes: string[], power = 1, toughness = 1): CardDef =>
    customCard({ name, typeLine: `Creature — ${subtypes.join(" ")}`, subtypes, power, toughness });
  /** Saddles the Mount `mount` (Saddle N) with the other available creatures. */
  const saddle = (s: S, mount: string) => settle(activate(s, "p1", mount, "Saddle"));
  /** Crew 2: a creature with power 1 isn't enough, one with power 2 animates the Vehicle. */
  const expectCrew2 = (vehicle: string) => {
    const weak = scenario({ p1: { battlefield: [vehicle, "Llanowar Elves"] } });
    const w = idOf(weak, "p1", "battlefield", vehicle);
    const crew = abilityIndex(weak, w, "Crew");
    expect(crew).toBeGreaterThanOrEqual(0);
    expect(legalActions(weak, "p1").some((a) => a.type === "activate" && a.source === w && a.ability === crew)).toBe(false);
    let s = scenario({ p1: { battlefield: [vehicle, "Bear Cub"] } });
    const v = idOf(s, "p1", "battlefield", vehicle);
    expect(chars(s, v).types).not.toContain("Creature");
    s = settle(activate(s, "p1", v, "Crew"));
    expect(chars(s, v).types).toContain("Creature");
  };

  it("Aatchik: on arrival, a 1/1 green Insect per artifact or creature card in your graveyard only", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 3), ...lands("Forest", 3)],
        hand: ["Aatchik, Emerald Radian"],
        graveyard: ["Bear Cub", artifact("Rouage", 1), "Opt", "Forest"],
      },
      p2: { graveyard: ["Serra Angel", "Serra Angel"] },
    });
    s = settle(cast(s, "p1", "Aatchik, Emerald Radian"));
    const insects = idsOf(s, "p1", "battlefield", "Insect");
    expect(insects).toHaveLength(2);
    const c = chars(s, insects[0] as string);
    expect([c.power, c.toughness, c.colors, c.subtypes]).toEqual([1, 1, ["G"], ["Insect"]]);
  });

  it("Aatchik: when another Insect you control dies, +1/+1 counter and each opponent loses 1 life (neither a non-Insect nor an opposing Insect)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Aatchik, Emerald Radian", creature("Beetle", ["Insect"]), "Bear Cub"] },
      p2: { battlefield: [creature("Cafard", ["Insect"])] },
    });
    const aatchik = idOf(s, "p1", "battlefield", "Aatchik, Emerald Radian");
    destroy(s, idOf(s, "p1", "battlefield", "Beetle"));
    s = settle(s);
    expect(s.objects[aatchik]?.counters["+1/+1"]).toBe(1);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 19]);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    destroy(s, idOf(s, "p2", "battlefield", "Cafard"));
    s = settle(s);
    expect(s.objects[aatchik]?.counters["+1/+1"]).toBe(1);
    expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
  });

  it("Afterburner Expert: exhaust {2}{G}{G}, two +1/+1 counters, only once", () => {
    let s = scenario({ p1: { battlefield: ["Afterburner Expert", ...lands("Forest", 8)] } });
    const expert = idOf(s, "p1", "battlefield", "Afterburner Expert");
    s = settle(activate(s, "p1", expert, "Exhaust"));
    expect(s.objects[expert]?.counters["+1/+1"]).toBe(2);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Forest" && s.objects[id]?.tapped)).toHaveLength(4);
    expect(canActivate(s, "p1", expert)).toBe(false);
  });

  it("Afterburner Expert: returns from your graveyard when you activate an exhaust ability; the opponent's stays in the graveyard", () => {
    let s = scenario({
      p1: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 4)], graveyard: ["Afterburner Expert"] },
      p2: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 4)], graveyard: ["Afterburner Expert"] },
    });
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Prowcatcher Specialist"), "Exhaust"));
    expect(idsOf(s, "p1", "battlefield", "Afterburner Expert")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Afterburner Expert")).toHaveLength(1);
  });

  it("Agonasaur Rex: trample; cycling {2}{G} — draw, then two +1/+1 counters, trample and indestructible on up to one creature or Vehicle", () => {
    let s = scenario({
      p1: { battlefield: ["Debris Beetle", ...lands("Forest", 3)], hand: ["Agonasaur Rex"], library: lands("Plains", 3) },
    });
    const rex = idOf(s, "p1", "hand", "Agonasaur Rex");
    expect(chars(s, rex).keywords).toContain("trample");
    const beetle = idOf(s, "p1", "battlefield", "Debris Beetle");
    s = settle(activate(s, "p1", rex, "Cycling"), choosing([beetle]));
    expect(idsOf(s, "p1", "graveyard", "Agonasaur Rex")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    // The (unanimated) Vehicle gets the counters and the abilities.
    expect(s.objects[beetle]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, beetle).keywords).toEqual(expect.arrayContaining(["trample", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, beetle).keywords).not.toContain("indestructible");
  });

  it("Boommobile: on arrival, four mana of one color that only pay for abilities; exhaust — X damage to any target and a +1/+1 counter", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Boommobile", "Shock"] } });
    s = settle(cast(s, "p1", "Boommobile"), (req) => (req.type === "pick" && req.options.includes("R") ? ["R"] : undefined));
    const boom = idOf(s, "p1", "battlefield", "Boommobile");
    // No untapped land left: the Boommobile's mana doesn't pay for a spell.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
    const ex = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === boom && a.label?.includes("damage"));
    expect(ex?.type === "activate" && ex.xMax).toBe(1);
    s = settle(activate(s, "p1", boom, "Exhaust", { x: 1, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(19);
    expect(s.objects[boom]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", boom)).toBe(false);
    expectCrew2("Boommobile");
  });

  it("Bulwark Ox: when it attacks while saddled, a +1/+1 counter on a targeted creature; nothing if it isn't saddled", () => {
    let s = scenario({ p1: { battlefield: ["Bulwark Ox", "Bear Cub"] } });
    const ox = idOf(s, "p1", "battlefield", "Bulwark Ox");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = saddle(s, ox);
    s = settleNoBlocks(attack(s, [ox]), choosing([cub]));
    expect(s.objects[cub]?.counters["+1/+1"]).toBe(1);
    let t = scenario({ p1: { battlefield: ["Bulwark Ox", "Bear Cub"] } });
    const ox2 = idOf(t, "p1", "battlefield", "Bulwark Ox");
    t = settleNoBlocks(attack(t, [ox2]));
    expect(t.battlefield.some((id) => (t.objects[id]?.counters["+1/+1"] ?? 0) > 0)).toBe(false);
  });

  it("Bulwark Ox: sacrifice it, your creatures with counters gain hexproof and indestructible until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bulwark Ox", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Llanowar Elves"] },
      p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1 } }] },
    });
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Bulwark Ox"), "Your creatures"));
    expect(idsOf(s, "p1", "graveyard", "Bulwark Ox")).toHaveLength(1);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel")).keywords).not.toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("indestructible");
  });

  it("Burnout Bashtronaut: menace; {2}: +1/+0 until end of turn; double strike only at max speed", () => {
    let s = scenario({ p1: { battlefield: ["Burnout Bashtronaut", ...lands("Mountain", 2)] } });
    const bash = idOf(s, "p1", "battlefield", "Burnout Bashtronaut");
    expect(chars(s, bash).keywords).toContain("menace");
    expect(s.players.p1?.speed).toBe(1);
    s.players.p1!.speed = 3;
    s.version += 1;
    expect(chars(s, bash).keywords).not.toContain("doubleStrike");
    s = settle(activate(s, "p1", bash, "+1/+0"));
    expect([chars(s, bash).power, chars(s, bash).toughness]).toEqual([2, 1]);
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(chars(s, bash).keywords).toContain("doubleStrike");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, bash).power).toBe(1);
  });

  it("Captain Howler: ward — {2} and 2 life", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Captain Howler, Sea Scourge"] },
      p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
    });
    const howler = idOf(s, "p1", "battlefield", "Captain Howler, Sea Scourge");
    s = settle(cast(s, "p2", "Shock", { targets: { t: [howler] } }), (req) => (req.intent === "unlessPay" ? [1] : undefined));
    expect(s.players.p2?.life).toBe(18);
    expect(s.objects[howler]?.damage).toBe(2);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Captain Howler, Sea Scourge"] },
      p2: { battlefield: lands("Mountain", 3), hand: ["Shock"] },
    });
    const h2 = idOf(t, "p1", "battlefield", "Captain Howler, Sea Scourge");
    t = settle(cast(t, "p2", "Shock", { targets: { t: [h2] } }), (req) => (req.intent === "unlessPay" ? [0] : undefined));
    expect(t.objects[h2]?.damage).toBe(0);
    expect(idsOf(t, "p2", "graveyard", "Shock")).toHaveLength(1);
  });

  it("Captain Howler: discarding two cards gives +4/+0 to the targeted creature, and you draw when it deals combat damage to a player this turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Captain Howler, Sea Scourge", "Greasewrench Goblin", "Bear Cub", ...lands("Mountain", 3)],
        hand: ["Opt", "Island"],
        library: lands("Plains", 6),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const hand = [...(s.players.p1?.hand ?? [])];
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Greasewrench Goblin"), "Exhaust"), choosing([...hand, cub]));
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect([chars(s, cub).power, chars(s, cub).toughness]).toEqual([6, 2]);
    const before = s.players.p1?.hand.length ?? 0;
    s = settleNoBlocks(attack(s, [cub]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.hand.length).toBe(before + 1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).power).toBe(2);
  });

  it("Caradora: on arrival, you may search for a Mount or Vehicle card", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), ...lands("Plains", 2)],
        hand: ["Caradora, Heart of Alacria"],
        library: ["Bear Cub", "Bulwark Ox", "Debris Beetle", "Forest"],
      },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Caradora, Heart of Alacria"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "search") {
        offered = namesIn(cur, req.options);
        return req.options.filter((o) => nameOf(cur, o) === "Debris Beetle");
      }
      return undefined;
    });
    expect(offered.sort()).toEqual(["Bulwark Ox", "Debris Beetle"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Debris Beetle"]);
    let t = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), ...lands("Plains", 2)],
        hand: ["Caradora, Heart of Alacria"],
        library: ["Bulwark Ox"],
      },
    });
    t = settle(cast(t, "p1", "Caradora, Heart of Alacria"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Caradora: one more +1/+1 counter on your creatures, not on the opponent's", () => {
    const s = scenario({
      p1: {
        battlefield: ["Caradora, Heart of Alacria", "Bear Cub", ...lands("Plains", 2)],
        hand: ["Fleeting Flight", "Fleeting Flight"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let cur = counterFrom(s, "p1", cub).s;
    expect(cur.objects[cub]?.counters["+1/+1"]).toBe(2);
    cur = counterFrom(cur, "p1", angel).s;
    expect(cur.objects[angel]?.counters["+1/+1"]).toBe(1);
  });

  it("Count on Luck: at your upkeep, exile the top card; it is playable this turn only", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Count on Luck"], library: ["Mountain", ...lands("Forest", 9)] },
    });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain") as string;
    expect(mountain).toBeDefined();
    expect(s.exile).toHaveLength(1);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    // Not at the opponent's upkeep; next turn, the Mountain is no longer playable.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.exile).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.exile).toHaveLength(2);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(false);
  });

  it("Cryptcaller Chariot: menace and crew 2; discarding two cards creates two tapped 2/2 black Zombies", () => {
    let s = scenario({
      p1: {
        battlefield: ["Cryptcaller Chariot", "Greasewrench Goblin", ...lands("Mountain", 3)],
        hand: ["Opt", "Island"],
        library: lands("Plains", 4),
      },
    });
    const chariot = idOf(s, "p1", "battlefield", "Cryptcaller Chariot");
    expect(chars(s, chariot).keywords).toContain("menace");
    expectCrew2("Cryptcaller Chariot");
    const hand = [...(s.players.p1?.hand ?? [])];
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Greasewrench Goblin"), "Exhaust"), choosing(hand));
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(2);
    const z = chars(s, zombies[0] as string);
    expect([z.power, z.toughness, z.colors]).toEqual([2, 2, ["B"]]);
    expect(zombies.every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Cursecloth Wrappings: your Zombies get +1/+1, not the opponent's", () => {
    const s = scenario({
      p1: { battlefield: ["Cursecloth Wrappings", creature("Goule", ["Zombie"], 2, 2), "Bear Cub"] },
      p2: { battlefield: [creature("Mort-vivant", ["Zombie"], 2, 2)] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Goule")).power).toBe(3);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
    expect(chars(s, idOf(s, "p2", "battlefield", "Mort-vivant")).power).toBe(2);
  });

  it("Cursecloth Wrappings: {T} — a creature card gains embalm until end of turn (its mana cost); the token is a white Zombie (PLAN-M M10d)", () => {
    let s = scenario({
      p1: { battlefield: ["Cursecloth Wrappings", ...lands("Forest", 2)], graveyard: ["Bear Cub", "Opt"] },
      p2: { graveyard: ["Serra Angel"] },
    });
    const wraps = idOf(s, "p1", "battlefield", "Cursecloth Wrappings");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === wraps);
    expect(opt?.type === "activate" && namesIn(s, opt.targets[0]?.legal)).toEqual(["Bear Cub"]);
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    const embalmOf = (x: GameState) => legalActions(x, "p1").find((a) => a.type === "activate" && a.source === cub);
    expect(embalmOf(s)).toBeUndefined();
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: wraps,
        ability: opt?.type === "activate" ? opt.ability : -1,
        targets: { t: [cub] },
      }),
    );
    // Nothing paid yet: the card stays in the graveyard with embalm ({1}{G}, its mana cost).
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toEqual([cub]);
    expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => !s.objects[id]?.tapped)).toBe(true);
    const embalm = embalmOf(s);
    expect(embalm).toBeDefined();
    s = act(s, "p1", { type: "activate", source: cub, ability: embalm?.type === "activate" ? embalm.ability : -1 });
    expect(s.exile.map((id) => nameOf(s, id))).toContain("Bear Cub");
    expect(idsOf(s, "p1", "battlefield", "Forest").every((id) => s.objects[id]?.tapped)).toBe(true);
    s = settle(s);
    const token = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, token).subtypes).toEqual(expect.arrayContaining(["Bear", "Zombie"]));
    expect(chars(s, token).colors).toEqual(["W"]);
    // 2/2, +1/+1 from the Wrappings (it's a Zombie you control).
    expect(chars(s, token).power).toBe(3);
    // Until end of turn only.
    let t = scenario({ p1: { battlefield: ["Cursecloth Wrappings"], graveyard: ["Bear Cub"] } });
    const c2 = idOf(t, "p1", "graveyard", "Bear Cub");
    const o2 = legalActions(t, "p1").find(
      (a) => a.type === "activate" && a.source === idOf(t, "p1", "battlefield", "Cursecloth Wrappings"),
    );
    t = settle(
      act(t, "p1", {
        type: "activate",
        source: idOf(t, "p1", "battlefield", "Cursecloth Wrappings"),
        ability: o2?.type === "activate" ? o2.ability : -1,
        targets: { t: [c2] },
      }),
    );
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(abilitiesOf(t, c2).some((a) => a.kind === "activated" && a.fromGraveyard)).toBe(false);
  });

  it("Daretti: power equal to the greatest mana value among your artifacts", () => {
    const s = scenario({
      p1: { battlefield: ["Daretti, Rocketeer Engineer", artifact("Rouage", 1), artifact("Engrenage", 4)] },
      p2: { battlefield: [artifact("Colosse", 9)] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Daretti, Rocketeer Engineer")).power).toBe(4);
    const t = scenario({ p1: { battlefield: ["Daretti, Rocketeer Engineer"] } });
    expect(chars(t, idOf(t, "p1", "battlefield", "Daretti, Rocketeer Engineer")).power).toBe(0);
  });

  it("Daretti: on arrival or when attacking, if you sacrifice an artifact, the targeted artifact card in your graveyard returns", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), artifact("Rouage", 1)],
          hand: ["Daretti, Rocketeer Engineer"],
          graveyard: [artifact("Engrenage", 4)],
        },
      });
    let s = setup();
    const gear = idOf(s, "p1", "graveyard", "Engrenage");
    const cog = idOf(s, "p1", "battlefield", "Rouage");
    s = settle(cast(s, "p1", "Daretti, Rocketeer Engineer"), choosing([gear, cog]));
    expect(idsOf(s, "p1", "battlefield", "Engrenage")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Rouage")).toHaveLength(1);
    // Without a sacrifice, nothing returns.
    let t = setup();
    t = settle(cast(t, "p1", "Daretti, Rocketeer Engineer"), (req) =>
      req.type === "yesNo" ? [0] : req.type === "pick" && req.intent === "sacrifice" ? [] : undefined,
    );
    expect(idsOf(t, "p1", "battlefield", "Rouage")).toHaveLength(1);
    expect(idsOf(t, "p1", "graveyard", "Engrenage")).toHaveLength(1);
    // When attacking.
    let u = scenario({
      p1: { battlefield: ["Daretti, Rocketeer Engineer", artifact("Rouage", 1)], graveyard: [artifact("Engrenage", 4)] },
    });
    const g2 = idOf(u, "p1", "graveyard", "Engrenage");
    const c2 = idOf(u, "p1", "battlefield", "Rouage");
    u = settleNoBlocks(attack(u, [idOf(u, "p1", "battlefield", "Daretti, Rocketeer Engineer")]), choosing([g2, c2]));
    expect(idsOf(u, "p1", "battlefield", "Engrenage")).toHaveLength(1);
  });

  it("Debris Beetle: trample, crew 2; on arrival, each opponent loses 3 life and you gain 3", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Debris Beetle"] },
    });
    s = settle(cast(s, "p1", "Debris Beetle"));
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([23, 17, 17]);
    const beetle = idOf(s, "p1", "battlefield", "Debris Beetle");
    expect(chars(s, beetle).keywords).toContain("trample");
    expectCrew2("Debris Beetle");
  });

  it("Demonic Junker: affinity for artifacts", () => {
    const mk = (n: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Swamp", n), artifact("Rouage", 1), artifact("Engrenage", 1), artifact("Ressort", 1)],
          hand: ["Demonic Junker"],
        },
      });
    const ok = mk(4);
    expect(castable(ok, "p1", idOf(ok, "p1", "hand", "Demonic Junker"))).toBe(true);
    const short = mk(3);
    expect(castable(short, "p1", idOf(short, "p1", "hand", "Demonic Junker"))).toBe(false);
  });

  it("Demonic Junker: destroys up to one creature per player; two +1/+1 counters only if one of your creatures is destroyed", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 7), "Bear Cub"], hand: ["Demonic Junker"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup();
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Demonic Junker"), choosing([cub, angel]));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Demonic Junker")]?.counters["+1/+1"]).toBe(2);
    let t = setup();
    t = settle(cast(t, "p1", "Demonic Junker"), choosing([idOf(t, "p2", "battlefield", "Serra Angel")]));
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(t.objects[idOf(t, "p1", "battlefield", "Demonic Junker")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Demonic Junker: no counters if your targeted creature isn't destroyed (indestructible)", () => {
    const golem = customCard({
      name: "Golem",
      typeLine: "Creature — Golem",
      subtypes: ["Golem"],
      power: 2,
      toughness: 2,
      keywords: ["indestructible"],
    });
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 7), golem], hand: ["Demonic Junker"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const g = idOf(s, "p1", "battlefield", "Golem");
    s = settle(cast(s, "p1", "Demonic Junker"), choosing([g, idOf(s, "p2", "battlefield", "Serra Angel")]));
    expect(idsOf(s, "p1", "battlefield", "Golem")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Demonic Junker")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("District Mascot: enters with a +1/+1 counter; {1}{G} and two counters removed: destroy a targeted artifact", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["District Mascot"] } });
    s = settle(cast(s, "p1", "District Mascot"));
    const mascot = idOf(s, "p1", "battlefield", "District Mascot");
    expect(s.objects[mascot]?.counters["+1/+1"]).toBe(1);
    expect([chars(s, mascot).power, chars(s, mascot).toughness]).toEqual([1, 1]);
    let t = scenario({
      p1: { battlefield: [{ name: "District Mascot", counters: { "+1/+1": 2 } }, ...lands("Forest", 2)] },
      p2: { battlefield: [artifact("Rouage", 1), "Serra Angel"] },
    });
    const m2 = idOf(t, "p1", "battlefield", "District Mascot");
    const opt = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === m2);
    expect(opt?.type === "activate" && namesIn(t, opt.targets[0]?.legal)).toEqual(["Rouage"]);
    t = settle(activate(t, "p1", m2, "Destroy", { targets: { t: [idOf(t, "p2", "battlefield", "Rouage")] } }));
    expect(idsOf(t, "p2", "graveyard", "Rouage")).toHaveLength(1);
    // No more counters: the 0/0 Mascot dies.
    expect(idsOf(t, "p1", "graveyard", "District Mascot")).toHaveLength(1);
    // A single counter: ability unavailable.
    expect(canActivate(s, "p1", mascot)).toBe(false);
  });

  it("District Mascot: when it attacks while saddled, a +1/+1 counter on it", () => {
    let s = scenario({ p1: { battlefield: [{ name: "District Mascot", counters: { "+1/+1": 1 } }, "Bear Cub"] } });
    const mascot = idOf(s, "p1", "battlefield", "District Mascot");
    s = saddle(s, mascot);
    s = settleNoBlocks(attack(s, [mascot]));
    expect(s.objects[mascot]?.counters["+1/+1"]).toBe(2);
  });
});

describe("Aetherdrift, lot K8: rares (2)", () => {
  /** Activates the ability of `source` whose label starts with `label`. */
  const activate = (s: S, source: string, label: string, extra: object = {}) =>
    act(s, "p1", { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  /** Answers 'yes' to questions and chooses the wanted objects. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      return picking(want)(req);
    };
  const handSize = (s: S) => s.players.p1?.hand.length ?? 0;

  it("Draconautics Engineer: exhaust {R} — haste to other creatures and a counter; exhaust {3}{R} — 4/4 flying Dinosaur Dragon", () => {
    let s = scenario({
      p1: { battlefield: ["Draconautics Engineer", { name: "Bear Cub", sick: true }, ...lands("Mountain", 5)] },
      p2: { battlefield: [{ name: "Llanowar Elves", sick: true }] },
    });
    const eng = idOf(s, "p1", "battlefield", "Draconautics Engineer");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, eng, "Exhaust — haste"));
    expect(chars(s, cub).keywords).toContain("haste");
    expect(chars(s, eng).keywords).not.toContain("haste");
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("haste");
    expect(s.objects[eng]?.counters["+1/+1"]).toBe(1);
    s = settle(activate(s, eng, "Exhaust — 4/4 Dinosaur"));
    const token = idOf(s, "p1", "battlefield", "Dinosaur Dragon");
    expect(chars(s, token)).toMatchObject({ power: 4, toughness: 4, colors: ["R"] });
    expect(chars(s, token).subtypes).toEqual(expect.arrayContaining(["Dinosaur", "Dragon"]));
    expect(chars(s, token).keywords).toContain("flying");
    // Each exhaust ability can be activated only once.
    expect(canActivate(s, "p1", eng)).toBe(false);
  });

  it("Explosive Getaway: exiles up to one artifact or creature, returned at the end step; 4 damage to each creature", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", ...lands("Mountain", 4), "Serra Angel", "Bear Cub"], hand: ["Explosive Getaway"] },
      p2: { battlefield: ["Shivan Dragon", "Llanowar Elves"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Explosive Getaway", { targets: { t: [angel] } }));
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Shivan Dragon")]?.damage).toBe(4);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    s = advanceUntil(s, (x) => idsOf(x, "p1", "battlefield", "Serra Angel").length > 0, 100);
    expect(s.turn.step).toBe("end");
    expect(s.turn.active).toBe("p1");

    // 'Up to one': with no target, only the damage.
    let t = scenario({
      p1: { battlefield: ["Plains", ...lands("Mountain", 4), "Serra Angel"], hand: ["Explosive Getaway"] },
    });
    t = settle(cast(t, "p1", "Explosive Getaway", { targets: { t: [] } }));
    expect(idsOf(t, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Far Fortune, End Boss: when you attack, 1 damage to each opponent", () => {
    let s = scenario({ p1: { battlefield: ["Far Fortune, End Boss", "Bear Cub"] } });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = settleNoBlocks(s);
    expect(s.players.p2?.life).toBe(19);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(17);
    // Without an attack, no damage.
    let t = scenario({ p1: { battlefield: ["Far Fortune, End Boss", "Bear Cub"] } });
    t = throughCombat(advanceUntil(t, (x) => x.pending?.kind === "declareAttackers"));
    expect(t.players.p2?.life).toBe(20);
  });

  it("Far Fortune, End Boss: at max speed, your sources deal 1 more damage to opponents and their permanents", () => {
    const setup = (speed: number) => {
      const s = scenario({
        p1: {
          battlefield: ["Far Fortune, End Boss", "Bear Cub", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s.players.p1!.speed = speed;
      s.version += 1;
      return s;
    };
    let s = setup(4);
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(16);
    s = settle(cast(s, "p1", "Lightning Strike", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // Your own permanents don't take extra damage.
    let own = setup(4);
    const cub = idOf(own, "p1", "battlefield", "Bear Cub");
    own.objects[cub]!.counters["+1/+1"] = 2;
    own.version += 1;
    own = settle(cast(own, "p1", "Lightning Strike", { targets: { t: [cub] } }));
    expect(own.objects[cub]?.damage).toBe(3);
    // Below max speed: only 3 damage.
    let t = setup(3);
    t = settle(cast(t, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(t.players.p2?.life).toBe(17);
  });

  it("Fearless Swashbuckler: your Vehicles have haste; a Pirate and a Vehicle attack: draw three, discard two", () => {
    let s = scenario({
      p1: {
        battlefield: ["Fearless Swashbuckler", { name: "Air Response Unit", sick: true }, "Bear Cub"],
        hand: ["Opt", "Island"],
        library: lands("Plains", 6),
      },
    });
    const ship = idOf(s, "p1", "battlefield", "Air Response Unit");
    const fish = idOf(s, "p1", "battlefield", "Fearless Swashbuckler");
    expect(chars(s, ship).keywords).toContain("haste");
    s = settle(activate(s, ship, "Crew", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    s = attack(s, [fish, ship]);
    s = settleNoBlocks(s);
    expect(handSize(s)).toBe(3);
    expect(s.players.p1?.graveyard).toHaveLength(2);

    // The Pirate attacks alone: no draw.
    let t = scenario({
      p1: { battlefield: ["Fearless Swashbuckler", "Air Response Unit"], hand: ["Opt"], library: lands("Plains", 6) },
    });
    t = attack(t, [idOf(t, "p1", "battlefield", "Fearless Swashbuckler")]);
    t = settleNoBlocks(t);
    expect(handSize(t)).toBe(1);
  });

  it("Full Throttle: two more combats; at the beginning of each combat, creatures that attacked untap", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 6), "Bear Cub", { name: "Llanowar Elves", tapped: true }],
        hand: ["Full Throttle"],
      },
    });
    s = settle(cast(s, "p1", "Full Throttle"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    // The two added combats follow the main phase, then comes the normal combat: three combats in a row.
    expect(s.turn.addedPhases).toEqual(["beginCombat", "beginCombat"]);
    for (let i = 0; i < 3; i++) {
      s = attack(s, [cub]);
      s = settleNoBlocks(s);
    }
    s = throughCombat(s);
    expect(s.turn.active).toBe("p1");
    expect(s.players.p2?.life).toBe(14);
    // The Elves did not attack: they stay tapped.
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.tapped).toBe(true);
  });

  it("Full Throttle: cast in the second main phase, two combats right after it, with no main phase between them", () => {
    let s = scenario({
      step: "main2",
      p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Full Throttle"] },
    });
    s = settle(cast(s, "p1", "Full Throttle"));
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [cub]);
    // The second added combat follows the first; after it, the turn goes straight to the end step.
    const first = stepTrail(s, (x) => x.pending?.kind === "declareAttackers");
    expect(first.steps).toEqual(["declareBlockers", "combatDamage", "endCombat", "beginCombat", "declareAttackers"]);
    const { s: end, steps } = stepTrail(attack(first.s, [cub]), (x) => x.turn.step === "end");
    expect(steps).toEqual(["declareBlockers", "combatDamage", "endCombat", "end"]);
    expect(end.players.p2?.life).toBe(16);
  });

  it("Gas Guzzler: enters tapped; at max speed, {B} and another creature or Vehicle sacrificed: draw", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Gas Guzzler"] } });
    s = settle(cast(s, "p1", "Gas Guzzler"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Gas Guzzler")]?.tapped).toBe(true);

    let t = scenario({
      p1: { battlefield: ["Gas Guzzler", "Air Response Unit", "Swamp"], library: lands("Plains", 5) },
    });
    const guzzler = idOf(t, "p1", "battlefield", "Gas Guzzler");
    expect(canActivate(t, "p1", guzzler)).toBe(false);
    t.players.p1!.speed = 4;
    t.version += 1;
    const opt = legalActions(t, "p1").find((a) => a.type === "activate" && a.source === guzzler);
    // A noncreature Vehicle can be sacrificed, but not the Guzzler itself.
    expect(opt?.type === "activate" && opt.additional?.sacrifice?.options).toEqual([
      idOf(t, "p1", "battlefield", "Air Response Unit"),
    ]);
    const hand = handSize(t);
    t = settle(activate(t, guzzler, "Max speed", { sacrifice: [idOf(t, "p1", "battlefield", "Air Response Unit")] }));
    expect(handSize(t)).toBe(hand + 1);
    expect(idsOf(t, "p1", "graveyard", "Air Response Unit")).toHaveLength(1);
  });

  it("Gastal Thrillroller: artifact creature until end of turn on arrival; returns from the graveyard with a finality counter", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Gastal Thrillroller"] } });
    s = settle(cast(s, "p1", "Gastal Thrillroller"));
    const car = idOf(s, "p1", "battlefield", "Gastal Thrillroller");
    expect(chars(s, car).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, car).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
    s = attack(s, [car]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(16);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, car).types).not.toContain("Creature");

    // From the graveyard: {2}{R} and discard a card (a cost: impossible with an empty hand).
    const empty = scenario({ p1: { battlefield: lands("Mountain", 3), graveyard: ["Gastal Thrillroller"] } });
    expect(canActivate(empty, "p1", idOf(empty, "p1", "graveyard", "Gastal Thrillroller"))).toBe(false);
    let t = scenario({ p1: { battlefield: lands("Mountain", 3), graveyard: ["Gastal Thrillroller"], hand: ["Opt"] } });
    const gy = idOf(t, "p1", "graveyard", "Gastal Thrillroller");
    t = settle(activate(t, gy, "Return with", { discard: [idOf(t, "p1", "hand", "Opt")] }));
    const back = idOf(t, "p1", "battlefield", "Gastal Thrillroller");
    expect(t.objects[back]?.counters.finality).toBe(1);
    expect(idsOf(t, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(chars(t, back).types).toContain("Creature");
  });

  it("Gonti, Night Minister: a creature damages an opponent, its controller exiles the top card and may play it with mana of any type; a spell you don't own gives a Treasure", () => {
    let s = scenario({
      // A Plains only: mana of any type pays the Elves' {G}.
      p1: { battlefield: ["Gonti, Night Minister", "Bear Cub", "Plains"] },
      p2: { library: ["Llanowar Elves", ...lands("Island", 5)] },
    });
    s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(18);
    const elves = s.exile.find((id) => s.objects[id]?.owner === "p2") as string;
    expect(namesIn(s, [elves])).toEqual(["Llanowar Elves"]);
    expect(castable(s, "p1", elves)).toBe(true);
    // Playable as long as it stays in exile: still on the following turn.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    expect(castable(s, "p1", elves)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: elves }));
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Treasure")).toHaveLength(0);

    // Combat damage dealt to you (and not to an opponent) triggers nothing.
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Gonti, Night Minister"], library: lands("Forest", 5) },
      p2: { battlefield: ["Bear Cub"] },
    });
    t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
    t = act(t, "p2", { type: "declareAttackers", attackers: [{ id: idOf(t, "p2", "battlefield", "Bear Cub"), defender: "p1" }] });
    t = settleNoBlocks(t);
    t = throughCombat(t);
    expect(t.players.p1?.life).toBe(18);
    expect(t.exile).toHaveLength(0);
  });

  it("Guardian Sunmare: saddled, when attacking it searches for a nonland permanent with mana value 3 or less", () => {
    const library = ["Shivan Dragon", "Forest", "Bear Cub", "Serra Angel", "Llanowar Elves"];
    let s = scenario({ p1: { battlefield: ["Guardian Sunmare", "Serra Angel"], library } });
    const mare = idOf(s, "p1", "battlefield", "Guardian Sunmare");
    expect(chars(s, mare).keywords).toContain("ward");
    s = settle(activate(s, mare, "Saddle", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
    s = attack(s, [mare]);
    let offered: (string | undefined)[] = [];
    s = settleNoBlocks(s, (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((o) => namesIn(cur, [o])[0] === "Bear Cub").slice(0, 1);
    });
    expect([...offered].sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);

    // Not saddled: no search.
    let t = scenario({ p1: { battlefield: ["Guardian Sunmare"], library } });
    t = attack(t, [idOf(t, "p1", "battlefield", "Guardian Sunmare")]);
    t = settleNoBlocks(t);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Howlsquad Heavy: your other Goblins have haste; at the beginning of combat, a 1/1 Goblin that must attack", () => {
    let s = scenario({
      p1: {
        battlefield: ["Howlsquad Heavy", { name: "Swab Goblin", sick: true }, { name: "Bear Cub", sick: true }],
      },
    });
    const heavy = idOf(s, "p1", "battlefield", "Howlsquad Heavy");
    expect(chars(s, idOf(s, "p1", "battlefield", "Swab Goblin")).keywords).toContain("haste");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
    expect(chars(s, heavy).keywords).not.toContain("haste");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const goblin = idOf(s, "p1", "battlefield", "Goblin");
    expect(chars(s, goblin)).toMatchObject({ power: 1, toughness: 1, colors: ["R"] });
    expect(chars(s, goblin).keywords).toContain("haste");
    // The token attacks if it can: a declaration without it is refused.
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow();
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: goblin, defender: "p2" }] });
    s = throughCombat(s);
    expect(s.players.p2?.life).toBe(19);
  });

  it("Howlsquad Heavy: at max speed, {T}: {R} for each Goblin you control", () => {
    const s = scenario({ p1: { battlefield: ["Howlsquad Heavy", "Swab Goblin", "Bear Cub"] } });
    const heavy = idOf(s, "p1", "battlefield", "Howlsquad Heavy");
    const manaOpt = (x: S) => legalActions(x, "p1").find((a) => a.type === "tapForMana" && a.source === heavy);
    expect(manaOpt(s)).toBeUndefined();
    s.players.p1!.speed = 4;
    s.version += 1;
    const opt = manaOpt(s);
    if (opt?.type !== "tapForMana") throw new Error("mana ability missing");
    const t = act(s, "p1", { type: "tapForMana", source: heavy, ability: opt.ability });
    expect(t.players.p1?.manaPool.R).toBe(2);
  });

  it("Kolodin, Triumph Caster: your Mounts and Vehicles have haste; a Mount enters saddled, a Vehicle enters as a creature", () => {
    let s = scenario({
      p1: {
        battlefield: ["Kolodin, Triumph Caster", ...lands("Mountain", 2), ...lands("Plains", 2)],
        hand: ["Gilded Ghoda", "Spotcycle Scouter"],
      },
      p2: { battlefield: ["Hulldrifter"] },
    });
    s = settle(cast(s, "p1", "Gilded Ghoda"));
    s = settle(cast(s, "p1", "Spotcycle Scouter"));
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    const scouter = idOf(s, "p1", "battlefield", "Spotcycle Scouter");
    expect(chars(s, ghoda).keywords).toContain("haste");
    expect(chars(s, scouter).keywords).toContain("haste");
    expect(chars(s, scouter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(objectDidThisTurn(s, ghoda, "saddled")).toBe(true);
    // Opposing Vehicles don't have haste.
    expect(chars(s, idOf(s, "p2", "battlefield", "Hulldrifter")).keywords).not.toContain("haste");
    // The saddled Mount attacks right away: Treasure.
    s = attack(s, [ghoda, scouter]);
    s = settleNoBlocks(s);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, scouter).types).not.toContain("Creature");
  });

  it("Lifecraft Engine: your creature Vehicles have the chosen type; your creatures of that type, other than it, get +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), "Llanowar Elves", "Bear Cub", "Serra Angel", "Air Response Unit"],
        hand: ["Lifecraft Engine"],
      },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Lifecraft Engine"), (req) =>
      req.type === "pick" && req.options.includes("Elf") ? ["Elf"] : undefined,
    );
    const engine = idOf(s, "p1", "battlefield", "Lifecraft Engine");
    expect(s.objects[engine]?.chosen?.creatureType).toBe("Elf");
    expect(chars(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toMatchObject({ power: 2, toughness: 2 });
    expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves"))).toMatchObject({ power: 1, toughness: 1 });
    // An equipped Vehicle becomes an Elf and gets +1/+1.
    const aru = idOf(s, "p1", "battlefield", "Air Response Unit");
    s = settle(activate(s, aru, "Crew", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(chars(s, aru).subtypes).toContain("Elf");
    expect(chars(s, aru)).toMatchObject({ power: 4, toughness: 4 });
    // The equipped Lifecraft Engine is an Elf, without +1/+1.
    s = settle(activate(s, engine, "Crew", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
    expect(chars(s, engine).subtypes).toContain("Elf");
    expect(chars(s, engine)).toMatchObject({ power: 4, toughness: 4 });
  });

  it("Marketback Walker: enters with X counters; {4}: a counter; when it dies, a card per counter", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 8), hand: ["Marketback Walker"], library: lands("Plains", 6) } });
    s = settle(cast(s, "p1", "Marketback Walker", { x: 2 }));
    const walker = idOf(s, "p1", "battlefield", "Marketback Walker");
    expect(chars(s, walker)).toMatchObject({ power: 2, toughness: 2 });
    s = settle(activate(s, walker, "+1/+1 counter"));
    expect(s.objects[walker]?.counters["+1/+1"]).toBe(3);
    const hand = handSize(s);
    destroy(s, walker);
    s = settle(s);
    expect(handSize(s)).toBe(hand + 3);
  });

  it("Mendicant Core, Guidelight: power equal to the number of your artifacts; at max speed, pay {1} to copy an artifact spell", () => {
    const gadget = customCard({
      name: "Rouage",
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: 1, colored: {}, x: 0 },
      manaCostText: "{1}",
    });
    const setup = (speed: number) => {
      const s = scenario({
        p1: { battlefield: ["Mendicant Core, Guidelight", "Cultivator's Caravan", ...lands("Plains", 3)], hand: [gadget] },
        p2: { battlefield: ["Cultivator's Caravan"] },
      });
      s.players.p1!.speed = speed;
      s.version += 1;
      return s;
    };
    let s = setup(4);
    const core = idOf(s, "p1", "battlefield", "Mendicant Core, Guidelight");
    expect(chars(s, core).power).toBe(2);
    s = settle(cast(s, "p1", "Rouage"), choosing());
    const gadgets = idsOf(s, "p1", "battlefield", "Rouage");
    expect(gadgets).toHaveLength(2);
    expect(gadgets.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(chars(s, core).power).toBe(4);
    // Declining to pay: no copy.
    let no = setup(4);
    no = settle(cast(no, "p1", "Rouage"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(idsOf(no, "p1", "battlefield", "Rouage")).toHaveLength(1);
    // Below max speed: no trigger.
    let t = setup(3);
    t = settle(cast(t, "p1", "Rouage"), choosing());
    expect(idsOf(t, "p1", "battlefield", "Rouage")).toHaveLength(1);
  });

  it("Mindspring Merfolk: exhaust {X}{U}{U}, {T} — draw X cards, a +1/+1 counter on each of your Merfolk", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mindspring Merfolk", "Brineborn Cutthroat", "Bear Cub", ...lands("Island", 4)],
        library: lands("Plains", 6),
      },
      p2: { battlefield: ["Brineborn Cutthroat"] },
    });
    const merfolk = idOf(s, "p1", "battlefield", "Mindspring Merfolk");
    const hand = handSize(s);
    s = settle(activate(s, merfolk, "Exhaust", { x: 2 }));
    expect(handSize(s)).toBe(hand + 2);
    expect(s.objects[merfolk]?.tapped).toBe(true);
    expect(s.objects[merfolk]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Brineborn Cutthroat")]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBeUndefined();
    expect(s.objects[idOf(s, "p2", "battlefield", "Brineborn Cutthroat")]?.counters["+1/+1"]).toBeUndefined();
    // A single activation, even untapped.
    s.objects[merfolk]!.tapped = false;
    s.version += 1;
    expect(canActivate(s, "p1", merfolk)).toBe(false);
  });
});

describe("Aetherdrift, lot K8: rares (3)", () => {
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Is the ability of `source` whose label contains `label` offered? */
  const offered = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label));
  const manaColors = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === source ? a.colors : []));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });

  it("Muraganda Raceway: {T}: {C}; at max speed only, {T}: {C}{C}", () => {
    let s = scenario({ p1: { battlefield: ["Muraganda Raceway"] } });
    const raceway = idOf(s, "p1", "battlefield", "Muraganda Raceway");
    // 'Start your engines!': speed starts at 1.
    expect(s.players.p1?.speed).toBe(1);
    const abilities = (x: S) =>
      legalActions(x, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === raceway ? [a.ability] : []));
    expect(abilities(s)).toHaveLength(1);
    s.players.p1!.speed = 4;
    s.version += 1;
    const both = abilities(s);
    expect(both).toHaveLength(2);
    s = act(s, "p1", { type: "tapForMana", source: raceway, ability: both[1] as number });
    expect(s.players.p1?.manaPool.C).toBe(2);
  });

  it("Oviya: {G}, {T} — a creature or Vehicle card from hand; two +1/+1 counters only if it's an artifact", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Oviya, Automech Artisan", "Forest"], hand: ["Hulldrifter", "Bear Cub", "Shock"] } });
    let s = setup();
    const oviya = idOf(s, "p1", "battlefield", "Oviya, Automech Artisan");
    const hull = idOf(s, "p1", "hand", "Hulldrifter");
    let options: (string | undefined)[] = [];
    s = settle(activate(s, "p1", oviya, "A creature"), (req, _p, cur) => {
      if (req.type === "pick") options = namesIn(cur, req.options as string[]);
      return picking([hull])(req);
    });
    expect(options.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect(idsOf(s, "p1", "hand", "Hulldrifter")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hulldrifter")]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[oviya]?.tapped).toBe(true);

    let t = setup();
    const cub = idOf(t, "p1", "hand", "Bear Cub");
    t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Oviya, Automech Artisan"), "A creature"), picking([cub]));
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Oviya: creatures that attack an opponent have trample, not the others", () => {
    let s = scenario({ p1: { battlefield: ["Oviya, Automech Artisan", "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const oviya = idOf(s, "p1", "battlefield", "Oviya, Automech Artisan");
    expect(chars(s, cub).keywords).not.toContain("trample");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: cub, defender: "p2" }] });
    expect(chars(s, cub).keywords).toContain("trample");
    expect(chars(s, oviya).keywords).not.toContain("trample");
  });

  it("Quag Feast: mill two cards, then destroy the target if its mana value doesn't exceed the size of your graveyard", () => {
    const setup = (graveyard: string[]) =>
      scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Quag Feast"], graveyard, library: lands("Forest", 5) },
        p2: { battlefield: ["Serra Angel", "Hulldrifter", "Island"] },
      });
    let s = setup([]);
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toContain(idOf(s, "p2", "battlefield", "Hulldrifter"));
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Island"));
    // Mana value 5, two cards in the graveyard: the Angel survives.
    s = settle(cast(s, "p1", "Quag Feast", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(s.players.p1?.library).toHaveLength(3);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    // Three cards already in the graveyard, plus two milled: five, the Angel is destroyed.
    let t = setup(["Opt", "Opt", "Opt"]);
    t = settle(cast(t, "p1", "Quag Feast", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Redshift: vigilance; {T}: X mana of one color (X = its power), to be spent only on abilities", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Redshift, Rocketeer Chief", counters: { "+1/+1": 1 } }, "Riverchurn Monument"],
        hand: ["Shock"],
      },
    });
    const red = idOf(s, "p1", "battlefield", "Redshift, Rocketeer Chief");
    expect(chars(s, red).keywords).toContain("vigilance");
    // Not Shock (a spell); but the Monument's {1} ability, yes.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
    expect(offered(s, "p1", idOf(s, "p1", "battlefield", "Riverchurn Monument"), "Target players")).toBe(true);
    s = act(s, "p1", { type: "tapForMana", source: red, ability: 0, color: "R" });
    expect(s.players.p1?.restrictedMana?.filter((m) => m.type === "R")).toHaveLength(3);
    expect(s.players.p1?.manaPool.R).toBe(0);
  });

  it("Redshift: exhaust — put as many permanent cards from your hand onto the battlefield as you want", () => {
    let s = scenario({
      p1: {
        battlefield: ["Redshift, Rocketeer Chief", ...lands("Mountain", 6), ...lands("Forest", 6)],
        hand: ["Serra Angel", "Bear Cub", "Island", "Shock"],
      },
    });
    const red = idOf(s, "p1", "battlefield", "Redshift, Rocketeer Chief");
    const angel = idOf(s, "p1", "hand", "Serra Angel");
    const island = idOf(s, "p1", "hand", "Island");
    let options: (string | undefined)[] = [];
    s = settle(activate(s, "p1", red, "Exhaust"), (req, _p, cur) => {
      if (req.type === "pick") options = namesIn(cur, req.options as string[]);
      return picking([angel, island])(req);
    });
    expect(options.sort()).toEqual(["Bear Cub", "Island", "Serra Angel"]);
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Shock"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    expect(offered(s, "p1", red, "Exhaust")).toBe(false);
  });

  it("Regal Imperiosaur: other Dinosaurs you control get +1/+1", () => {
    const raptor = customCard({
      name: "Raptor",
      typeLine: "Creature — Dinosaur",
      subtypes: ["Dinosaur"],
      power: 2,
      toughness: 2,
    });
    const s = scenario({
      p1: { battlefield: ["Regal Imperiosaur", raptor, "Bear Cub"] },
      p2: { battlefield: [raptor] },
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Regal Imperiosaur"))).toEqual([5, 4]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Raptor"))).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Raptor"))).toEqual([2, 2]);
    // Two Imperiosaurs: each gives +1/+1 to the other.
    const t = scenario({ p1: { battlefield: ["Regal Imperiosaur", "Regal Imperiosaur"] } });
    for (const id of idsOf(t, "p1", "battlefield", "Regal Imperiosaur")) expect(pt(t, id)).toEqual([6, 5]);
  });

  it("Riverchurn Monument: {1}, {T} — each targeted player mills two cards", () => {
    let s = scenario({ p1: { battlefield: ["Riverchurn Monument", "Island"] } });
    const monument = idOf(s, "p1", "battlefield", "Riverchurn Monument");
    s = settle(activate(s, "p1", monument, "Target players", { targets: { t: ["p1", "p2"] } }));
    expect(s.players.p1?.graveyard).toHaveLength(2);
    expect(s.players.p2?.graveyard).toHaveLength(2);
    expect(s.objects[monument]?.tapped).toBe(true);
  });

  it("Riverchurn Monument: exhaust — each targeted player mills as many cards as their graveyard holds", () => {
    let s = scenario({
      p1: { battlefield: ["Riverchurn Monument", ...lands("Island", 4)], graveyard: ["Opt"] },
      p2: { graveyard: ["Opt", "Opt", "Opt"] },
    });
    const monument = idOf(s, "p1", "battlefield", "Riverchurn Monument");
    s = settle(activate(s, "p1", monument, "Exhaust", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.graveyard).toHaveLength(6);
    expect(s.players.p2?.library).toHaveLength(7);
    // Untargeted player: nothing.
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.objects[monument]?.tapped).toBe(true);
  });

  it("Sita Varma: exhaust — X +1/+1 counters, then you may give its power as base P/T to your other creatures until end of turn", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [
            "Sita Varma, Masked Racer",
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            ...lands("Forest", 3),
            ...lands("Island", 2),
          ],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup();
    const sita = idOf(s, "p1", "battlefield", "Sita Varma, Masked Racer");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", sita, "Exhaust", { x: 2 }), (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(pt(s, sita)).toEqual([4, 5]);
    // Base P/T 4/4, plus its counter.
    expect(pt(s, cub)).toEqual([5, 5]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
    expect(offered(s, "p1", sita, "Exhaust")).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, cub)).toEqual([3, 3]);
    expect(pt(s, sita)).toEqual([4, 5]);

    let t = setup();
    const cub2 = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Sita Varma, Masked Racer"), "Exhaust", { x: 2 }), (req) =>
      req.type === "yesNo" ? [0] : undefined,
    );
    expect(pt(t, cub2)).toEqual([3, 3]);
  });

  it("Spectacular Pileup: creatures and Vehicles lose indestructible, then are all destroyed", () => {
    const colossus = customCard({ name: "Colosse", keywords: ["indestructible"], power: 5, toughness: 5 });
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), colossus], hand: ["Spectacular Pileup"] },
      p2: { battlefield: ["Serra Angel", "Hulldrifter", "Riverchurn Monument"] },
    });
    s = settle(cast(s, "p1", "Spectacular Pileup"));
    expect(idsOf(s, "p1", "graveyard", "Colosse")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
    // An artifact that is neither a creature nor a Vehicle, and the lands, stay.
    expect(idsOf(s, "p2", "battlefield", "Riverchurn Monument")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Plains")).toHaveLength(5);
  });

  it("Spectacular Pileup: cycling {2}, draw a card", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Spectacular Pileup"], library: lands("Island", 3) } });
    const pileup = idOf(s, "p1", "hand", "Spectacular Pileup");
    s = settle(activate(s, "p1", pileup, "Cycling"));
    expect(idsOf(s, "p1", "graveyard", "Spectacular Pileup")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Thopter Fabricator: a 1/1 flying Thopter when you draw your second card of the turn, not the first or the third", () => {
    let s = scenario({
      p1: {
        battlefield: ["Thopter Fabricator", ...lands("Island", 3)],
        hand: ["Opt", "Opt", "Opt"],
        library: lands("Plains", 5),
      },
    });
    const fab = idOf(s, "p1", "battlefield", "Thopter Fabricator");
    expect(chars(s, fab).keywords).toContain("flying");
    expect(abilityIndex(s, fab, "Crew")).toBeGreaterThanOrEqual(0);
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(0);
    s = settle(cast(s, "p1", "Opt"));
    const thopters = idsOf(s, "p1", "battlefield", "Thopter");
    expect(thopters).toHaveLength(1);
    const c = chars(s, thopters[0] as string);
    expect([c.power, c.toughness, c.colors]).toEqual([1, 1, []]);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.keywords).toContain("flying");
    s = settle(cast(s, "p1", "Opt"));
    expect(idsOf(s, "p1", "battlefield", "Thopter")).toHaveLength(1);
  });

  it("Unstoppable Plan: at your end step, untap your nonland permanents (not lands, not the opponent's)", () => {
    let s = scenario({
      step: "main2",
      p1: {
        battlefield: [
          "Unstoppable Plan",
          { name: "Bear Cub", tapped: true },
          { name: "Hulldrifter", tapped: true },
          { name: "Forest", tapped: true },
        ],
      },
      p2: { battlefield: [{ name: "Serra Angel", tapped: true }] },
    });
    s = settle(advanceUntil(s, (x) => x.turn.step === "end"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hulldrifter")]?.tapped).toBe(false);
    expect(s.objects[idOf(s, "p1", "battlefield", "Forest")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
    // At the opponent's end step: nothing.
    let t = scenario({
      active: "p2",
      step: "main2",
      p1: { battlefield: ["Unstoppable Plan", { name: "Bear Cub", tapped: true }] },
    });
    t = settle(advanceUntil(t, (x) => x.turn.step === "end"));
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
  });

  it("Voyager Glidecar: scry 1 on arrival", () => {
    let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Voyager Glidecar"], library: ["Opt", "Island", "Forest"] } });
    let asked = false;
    s = settle(cast(s, "p1", "Voyager Glidecar"), (req) => {
      if (req.type !== "pick" || req.intent !== "scryBottom") return undefined;
      asked = true;
      expect(req.options).toHaveLength(1);
      return req.options;
    });
    expect(asked).toBe(true);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Forest", "Opt"]);
  });

  it("Voyager Glidecar: tap three other untapped creatures — flying artifact creature until end of turn, and a +1/+1 counter", () => {
    let s = scenario({
      p1: { battlefield: ["Voyager Glidecar", "Bear Cub", "Bear Cub", { name: "Llanowar Elves", tapped: true }] },
    });
    const car = idOf(s, "p1", "battlefield", "Voyager Glidecar");
    expect(abilityIndex(s, car, "Crew")).toBeGreaterThanOrEqual(0);
    // Only two untapped creatures: impossible.
    expect(offered(s, "p1", car, "Becomes")).toBe(false);
    s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]!.tapped = false;
    s.version += 1;
    s = settle(activate(s, "p1", car, "Becomes"));
    expect(chars(s, car).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, car).keywords).toContain("flying");
    expect(s.objects[car]?.counters["+1/+1"]).toBe(1);
    expect(pt(s, car)).toEqual([3, 4]);
    expect(s.battlefield.filter((id) => nameOf(s, id) !== "Voyager Glidecar").every((id) => s.objects[id]?.tapped)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, car).types).not.toContain("Creature");
    expect(s.objects[car]?.counters["+1/+1"]).toBe(1);
  });

  it("Wastewood Verge: {G} always, {B} only with a Swamp or a Forest", () => {
    const s = scenario({ p1: { battlefield: ["Wastewood Verge", "Island"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Wastewood Verge"))).toEqual(["G"]);
    const t = scenario({ p1: { battlefield: ["Wastewood Verge", "Swamp"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Wastewood Verge"))).toEqual(["G", "B"]);
    const u = scenario({ p1: { battlefield: ["Wastewood Verge", "Forest"] } });
    expect(manaColors(u, idOf(u, "p1", "battlefield", "Wastewood Verge"))).toEqual(["G", "B"]);
  });

  it("Willowrush Verge: {U} always, {G} only with a Forest or an Island", () => {
    const s = scenario({ p1: { battlefield: ["Willowrush Verge", "Mountain"] } });
    expect(manaColors(s, idOf(s, "p1", "battlefield", "Willowrush Verge"))).toEqual(["U"]);
    const t = scenario({ p1: { battlefield: ["Willowrush Verge", "Forest"] } });
    expect(manaColors(t, idOf(t, "p1", "battlefield", "Willowrush Verge"))).toEqual(["U", "G"]);
    const u = scenario({ p1: { battlefield: ["Willowrush Verge", "Island"] } });
    expect(manaColors(u, idOf(u, "p1", "battlefield", "Willowrush Verge"))).toEqual(["U", "G"]);
  });

  it("Webstrike Elite: reach; cycling {X}{G}{G} — draw, and destroy up to one artifact or enchantment with mana value X", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Webstrike Elite"], library: lands("Island", 3) },
      p2: { battlefield: [artifact("Rouage", 3)] },
    });
    const elite = idOf(s, "p1", "hand", "Webstrike Elite");
    expect(chars(s, elite).keywords).toContain("reach");
    const cog = idOf(s, "p2", "battlefield", "Rouage");
    s = settle(activate(s, "p1", elite, "Cycling", { x: 3 }), picking([cog]));
    expect(idsOf(s, "p2", "graveyard", "Rouage")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    expect(idsOf(s, "p1", "graveyard", "Webstrike Elite")).toHaveLength(1);
  });

  it("Winter: ward (pay 2 life) for it and for your artifacts, not for your other creatures", () => {
    const setup = () =>
      scenario({
        active: "p2",
        p1: { battlefield: ["Winter, Cursed Rider", "Walking Sarcophagus", "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
    const shock = (target: string, pay: boolean) => {
      let s = setup();
      s = cast(s, "p2", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", target)] } });
      return settle(s, (req) => (req.intent === "unlessPay" ? [pay ? 1 : 0] : undefined));
    };
    // Without paying: Shock is countered.
    let s = shock("Winter, Cursed Rider", false);
    expect(idsOf(s, "p1", "battlefield", "Winter, Cursed Rider")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    s = shock("Walking Sarcophagus", false);
    expect(idsOf(s, "p1", "battlefield", "Walking Sarcophagus")).toHaveLength(1);
    // By paying 2 life, the spell resolves.
    s = shock("Winter, Cursed Rider", true);
    expect(s.players.p2?.life).toBe(18);
    expect(idsOf(s, "p1", "graveyard", "Winter, Cursed Rider")).toHaveLength(1);
    // A nonartifact creature doesn't have ward.
    let asked = false;
    let t = setup();
    t = cast(t, "p2", "Shock", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } });
    t = settle(t, (req) => {
      if (req.intent === "unlessPay") asked = true;
      return undefined;
    });
    expect(asked).toBe(false);
    expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Winter: exhaust, {T}, exile X artifact cards from your graveyard — other nonartifact creatures get -X/-X", () => {
    let s = scenario({
      p1: {
        battlefield: ["Winter, Cursed Rider", "Walking Sarcophagus", ...lands("Island", 2), ...lands("Swamp", 2)],
        graveyard: ["Hulldrifter", "Riverchurn Monument", "Opt"],
      },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const winter = idOf(s, "p1", "battlefield", "Winter, Cursed Rider");
    // Only two artifact cards: X = 3 is refused.
    expect(() => activate(s, "p1", winter, "Exhaust", { x: 3 })).toThrow();
    s = settle(activate(s, "p1", winter, "Exhaust", { x: 2 }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt"]);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([2, 2]);
    expect(pt(s, winter)).toEqual([3, 2]);
    expect(idsOf(s, "p1", "battlefield", "Walking Sarcophagus")).toHaveLength(1);
    expect(s.objects[winter]?.tapped).toBe(true);
  });

  it("Zahur: sacrifice another creature — surveil 1, only once per turn", () => {
    let s = scenario({ p1: { battlefield: ["Zahur, Glory's Past", "Bear Cub", "Llanowar Elves"], library: ["Opt", "Forest"] } });
    const zahur = idOf(s, "p1", "battlefield", "Zahur, Glory's Past");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", zahur, "Surveil", { sacrifice: [cub] }), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
    expect(offered(s, "p1", zahur, "Surveil")).toBe(false);
    // Speed 1: no Zombie.
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(0);
  });

  it("Zahur: max speed — a tapped 2/2 black Zombie when one of your nontoken creatures dies, not a token", () => {
    let s = scenario({ p1: { battlefield: ["Zahur, Glory's Past", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    s.players.p1!.speed = 4;
    s.version += 1;
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s);
    const zombies = idsOf(s, "p1", "battlefield", "Zombie");
    expect(zombies).toHaveLength(1);
    const z = zombies[0] as string;
    expect(s.objects[z]?.tapped).toBe(true);
    expect([...pt(s, z), chars(s, z).colors]).toEqual([2, 2, ["B"]]);
    // The Zombie (a token) dies: nothing; an opponent's creature: nothing.
    destroy(s, z);
    destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(0);
  });
});

describe("Aetherdrift, lot K8: uncommons (1)", () => {
  /** Activation option of `source` whose label starts with `label` (or `undefined`). */
  const option = (s: S, player: string, source: string, label: string) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && x.ability === abilityIndex(s, source, label),
    );
    return a?.type === "activate" ? a : undefined;
  };
  /** Activates the ability of `source` whose label starts with `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  /** Advances to p1's beginning of combat, when a trigger is waiting (target choice or stack). */
  const toBeginCombat = (s: S) =>
    advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0));

  it("Adrenaline Jockey: 4 damage to the player who casts a spell during another player's turn, not during their own", () => {
    let s = scenario({
      p1: { battlefield: ["Adrenaline Jockey", "Mountain"], hand: ["Shock"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = settle(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(18);
    s = act(s, "p1", { type: "pass" });
    s = settle(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p2?.life).toBe(14);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Adrenaline Jockey: a +1/+1 counter whenever you activate an exhaust ability", () => {
    let s = scenario({ p1: { battlefield: ["Adrenaline Jockey", "Prowcatcher Specialist", ...lands("Mountain", 4)] } });
    const jockey = idOf(s, "p1", "battlefield", "Adrenaline Jockey");
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    s = settle(activate(s, "p1", pro, "Exhaust"));
    expect(s.objects[jockey]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[pro]?.counters["+1/+1"]).toBe(2);
  });

  it("Aether Syphon: {2}, {T}: draw; at max speed only, each opponent mills two cards per card drawn", () => {
    const run = (speed: number) => {
      let s = scenario({ p1: { battlefield: ["Aether Syphon", ...lands("Island", 2)] } });
      s.players.p1!.speed = speed;
      s.version += 1;
      const syphon = idOf(s, "p1", "battlefield", "Aether Syphon");
      s = settle(activate(s, "p1", syphon, "Draw"));
      expect(s.objects[syphon]?.tapped).toBe(true);
      return s;
    };
    const slow = run(3);
    expect(slow.players.p1?.hand).toHaveLength(1);
    expect(slow.players.p2?.library).toHaveLength(10);
    const max = run(4);
    expect(max.players.p1?.hand).toHaveLength(1);
    expect(max.players.p2?.library).toHaveLength(8);
    expect(max.players.p2?.graveyard).toHaveLength(2);
    // 'Start your engines!': speed starts at 1.
    expect(scenario({ p1: { battlefield: ["Aether Syphon"] } }).players.p1?.speed).toBe(1);
  });

  it("Air Response Unit: Crew 1 makes it a 3/3 flying artifact creature that attacks without tapping (vigilance)", () => {
    let s = scenario({ p1: { battlefield: ["Air Response Unit", "Llanowar Elves"] } });
    const unit = idOf(s, "p1", "battlefield", "Air Response Unit");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, unit).types).not.toContain("Creature");
    s = settle(activate(s, "p1", unit, "Crew", { tap: [elf] }));
    const c = chars(s, unit);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = attack(s, [unit]);
    expect(s.objects[unit]?.tapped).toBe(false);
  });

  it("Alacrian Armory: your creatures get +0/+1 and vigilance, not the opponent's", () => {
    const s = scenario({ p1: { battlefield: ["Alacrian Armory", "Bear Cub"] }, p2: { battlefield: ["Bear Cub"] } });
    const mine = chars(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    expect([mine.power, mine.toughness, mine.keywords.includes("vigilance")]).toEqual([2, 3, true]);
    const theirs = chars(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    expect([theirs.power, theirs.toughness, theirs.keywords.includes("vigilance")]).toEqual([2, 2, false]);
  });

  it("Alacrian Armory: at the beginning of your combat, the targeted Vehicle becomes an artifact creature, the targeted Mount becomes saddled", () => {
    let s = scenario({ p1: { battlefield: ["Alacrian Armory", "Hulldrifter"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(toBeginCombat(s), picking([hull]));
    const c = chars(s, hull);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([3, 3]);
    let t = scenario({ p1: { battlefield: ["Alacrian Armory", "Gilded Ghoda"] } });
    const ghoda = idOf(t, "p1", "battlefield", "Gilded Ghoda");
    t = settle(toBeginCombat(t), picking([ghoda]));
    expect(objectDidThisTurn(t, ghoda, "saddled")).toBe(true);
    // Saddled, it creates a Treasure when attacking.
    t = act(
      advanceUntil(t, (x) => x.pending?.kind === "declareAttackers"),
      "p1",
      {
        type: "declareAttackers",
        attackers: [{ id: ghoda, defender: "p2" }],
      },
    );
    t = settleNoBlocks(t);
    expect(idsOf(t, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Amonkhet Raceway: {T}: {C}; at max speed only, {T}: a creature gains haste", () => {
    let s = scenario({ p1: { battlefield: ["Amonkhet Raceway", { name: "Bear Cub", sick: true }] } });
    const raceway = idOf(s, "p1", "battlefield", "Amonkhet Raceway");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === raceway && a.colors.includes("C"))).toBe(
      true,
    );
    expect(option(s, "p1", raceway, "Max speed")).toBeUndefined();
    s.players.p1!.speed = 4;
    s.version += 1;
    s = settle(activate(s, "p1", raceway, "Max speed", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toContain("haste");
    s = attack(s, [cub]);
    expect(s.combat?.attackers.map((a) => a.id)).toContain(cub);
  });

  it("Apocalypse Runner: {T}: your creature with power 2 or less gains lifelink and can't be blocked; Crew 3", () => {
    let s = scenario({
      p1: { battlefield: ["Apocalypse Runner", "Bear Cub", "Serra Angel"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    const runner = idOf(s, "p1", "battlefield", "Apocalypse Runner");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const legal = option(s, "p1", runner, "Lifelink")?.targets[0]?.legal ?? [];
    expect(legal).toContain(cub);
    expect(legal).not.toContain(angel);
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Llanowar Elves"));
    s = settle(activate(s, "p1", runner, "Lifelink", { targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["lifelink", "unblockable"]));
    expect(s.objects[runner]?.tapped).toBe(true);
    // Crew 3: the Cub (power 2) isn't enough alone.
    const t = scenario({ p1: { battlefield: ["Apocalypse Runner", "Bear Cub"] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Apocalypse Runner"), "Crew")).toBeUndefined();
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("lifelink");
  });

  it("Autarch Mammoth: a 3/3 Elephant on arrival, and when it attacks while saddled (not without being saddled); Saddle 5", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Autarch Mammoth"] } });
    s = settle(cast(s, "p1", "Autarch Mammoth"));
    const elephants = idsOf(s, "p1", "battlefield", "Elephant");
    expect(elephants).toHaveLength(1);
    const e = chars(s, elephants[0] as string);
    expect([e.power, e.toughness, e.colors]).toEqual([3, 3, ["G"]]);

    const ride = (saddle: boolean) => {
      let t = scenario({ p1: { battlefield: ["Autarch Mammoth", "Serra Angel", "Llanowar Elves"] } });
      const mammoth = idOf(t, "p1", "battlefield", "Autarch Mammoth");
      const riders = [idOf(t, "p1", "battlefield", "Serra Angel"), idOf(t, "p1", "battlefield", "Llanowar Elves")];
      if (saddle) t = settle(activate(t, "p1", mammoth, "Saddle", { tap: riders }));
      return settleNoBlocks(attack(t, [mammoth]));
    };
    expect(idsOf(ride(true), "p1", "battlefield", "Elephant")).toHaveLength(1);
    expect(idsOf(ride(false), "p1", "battlefield", "Elephant")).toHaveLength(0);
    // Saddle 5: the Angel (power 4) alone isn't enough.
    const u = scenario({ p1: { battlefield: ["Autarch Mammoth", "Serra Angel"] } });
    expect(option(u, "p1", idOf(u, "p1", "battlefield", "Autarch Mammoth"), "Saddle")).toBeUndefined();
  });

  it("Back on Track: returns a creature or Vehicle card from your graveyard to the battlefield and creates a Pilot", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Back on Track"], graveyard: ["Hulldrifter", "Opt"] },
      p2: { graveyard: ["Bear Cub"] },
    });
    const hull = idOf(s, "p1", "graveyard", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).toEqual([hull]);
    s = settle(cast(s, "p1", "Back on Track", { targets: { t: [hull] } }));
    expect(idsOf(s, "p1", "battlefield", "Hulldrifter")).toHaveLength(1);
    const pilots = idsOf(s, "p1", "battlefield", "Pilot");
    expect(pilots).toHaveLength(1);
    expect([chars(s, pilots[0] as string).power, chars(s, pilots[0] as string).toughness]).toEqual([1, 1]);
    // The Pilot crews as if its power were 2 greater: Crew 3 by itself.
    const h = idOf(s, "p1", "battlefield", "Hulldrifter");
    expect(option(s, "p1", h, "Crew")).toBeDefined();
  });

  it("Boom Scholar: exhaust abilities of your other permanents cost {2} less, not its own", () => {
    const s = scenario({ p1: { battlefield: ["Boom Scholar", "Prowcatcher Specialist", ...lands("Mountain", 2)] } });
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    // {3}{R} − {2} = {1}{R}.
    expect(option(s, "p1", pro, "Exhaust")).toBeDefined();
    const t = scenario({ p1: { battlefield: ["Boom Scholar", ...lands("Mountain", 2), ...lands("Forest", 2)] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Boom Scholar"), "Exhaust")).toBeUndefined();
    const u = scenario({ p1: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 2)] } });
    expect(option(u, "p1", idOf(u, "p1", "battlefield", "Prowcatcher Specialist"), "Exhaust")).toBeUndefined();
  });

  it("Boom Scholar: exhaust — your creatures and Vehicles gain trample, two +1/+1 counters on it", () => {
    let s = scenario({
      p1: { battlefield: ["Boom Scholar", "Bear Cub", "Hulldrifter", ...lands("Mountain", 3), ...lands("Forest", 3)] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const scholar = idOf(s, "p1", "battlefield", "Boom Scholar");
    s = settle(activate(s, "p1", scholar, "Exhaust"));
    expect(s.objects[scholar]?.counters["+1/+1"]).toBe(2);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
    expect(chars(s, idOf(s, "p1", "battlefield", "Hulldrifter")).keywords).toContain("trample");
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("trample");
    expect(canActivate(s, "p1", scholar)).toBe(false);
  });

  it("Boosted Sloop: menace; whenever you attack (even without it), draw then discard", () => {
    let s = scenario({
      p1: { battlefield: ["Boosted Sloop", "Bear Cub"], hand: ["Opt"], library: lands("Plains", 5) },
    });
    const sloop = idOf(s, "p1", "battlefield", "Boosted Sloop");
    expect(chars(s, sloop).keywords).toContain("menace");
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), picking([opt]));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    // Without an attack, nothing.
    let t = scenario({ p1: { battlefield: ["Boosted Sloop", "Bear Cub"], hand: ["Opt"] } });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Opt"]);
  });

  it("Broodheart Engine: surveil 1 at the beginning of your upkeep", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Broodheart Engine"], library: ["Opt", ...lands("Forest", 5)] },
    });
    s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent.startsWith("surveil"));
    expect(s.turn.active).toBe("p1");
    expect(s.turn.step).toBe("upkeep");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.type === "pick" ? namesIn(s, req.options) : []).toEqual(["Opt"]);
    s = act(s, "p1", { type: "choose", values: req?.type === "pick" ? req.options : [] });
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
  });

  it("Broodheart Engine: {2}{B}{G}, {T}, sacrifice: returns a creature or Vehicle card from your graveyard, at sorcery speed", () => {
    let s = scenario({
      p1: {
        battlefield: ["Broodheart Engine", ...lands("Swamp", 2), ...lands("Forest", 2)],
        graveyard: ["Serra Angel", "Opt"],
      },
    });
    const engine = idOf(s, "p1", "battlefield", "Broodheart Engine");
    const angel = idOf(s, "p1", "graveyard", "Serra Angel");
    expect(option(s, "p1", engine, "Return")?.targets[0]?.legal).toEqual([angel]);
    s = settle(activate(s, "p1", engine, "Return", { targets: { t: [angel] } }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Broodheart Engine")).toHaveLength(1);
    // Not during the opponent's turn.
    const t = scenario({
      active: "p2",
      p1: { battlefield: ["Broodheart Engine", ...lands("Swamp", 2), ...lands("Forest", 2)], graveyard: ["Serra Angel"] },
    });
    expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Broodheart Engine"))).toBe(false);
  });

  it("Caelorna, Coral Tyrant: legendary 0/8 creature with no ability", () => {
    const s = scenario({ p1: { battlefield: ["Caelorna, Coral Tyrant"] } });
    const c = chars(s, idOf(s, "p1", "battlefield", "Caelorna, Coral Tyrant"));
    expect([c.power, c.toughness]).toEqual([0, 8]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toContain("Octopus");
    expect(c.abilities).toHaveLength(0);
  });

  it("Canyon Vaulter: the Vehicle it equips or the Mount it saddles during your main phase gains flying", () => {
    let s = scenario({ p1: { battlefield: ["Canyon Vaulter", "Apocalypse Runner"] } });
    const vaulter = idOf(s, "p1", "battlefield", "Canyon Vaulter");
    const runner = idOf(s, "p1", "battlefield", "Apocalypse Runner");
    s = settle(activate(s, "p1", runner, "Crew", { tap: [vaulter] }));
    expect(chars(s, runner).keywords).toContain("flying");
    let t = scenario({ p1: { battlefield: ["Canyon Vaulter", "Gilded Ghoda"] } });
    const ghoda = idOf(t, "p1", "battlefield", "Gilded Ghoda");
    t = settle(activate(t, "p1", ghoda, "Saddle", { tap: [idOf(t, "p1", "battlefield", "Canyon Vaulter")] }));
    expect(chars(t, ghoda).keywords).toContain("flying");
    // Outside the main phase (beginning of combat): no flying.
    let u = scenario({ p1: { battlefield: ["Canyon Vaulter", "Apocalypse Runner"] }, step: "beginCombat" });
    const r2 = idOf(u, "p1", "battlefield", "Apocalypse Runner");
    u = settle(activate(u, "p1", r2, "Crew", { tap: [idOf(u, "p1", "battlefield", "Canyon Vaulter")] }));
    expect(chars(u, r2).types).toContain("Creature");
    expect(chars(u, r2).keywords).not.toContain("flying");
    // Equipped by another creature: no flying.
    let w = scenario({ p1: { battlefield: ["Canyon Vaulter", "Apocalypse Runner", "Serra Angel"] } });
    const r3 = idOf(w, "p1", "battlefield", "Apocalypse Runner");
    w = settle(activate(w, "p1", r3, "Crew", { tap: [idOf(w, "p1", "battlefield", "Serra Angel")] }));
    expect(chars(w, r3).keywords).not.toContain("flying");
  });

  it("Carrion Cruiser: on arrival, mill two cards then return a creature or Vehicle card from your graveyard", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Carrion Cruiser"], library: ["Opt", "Bear Cub"], graveyard: ["Hulldrifter"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Carrion Cruiser"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      offered = namesIn(cur, req.options);
      return req.options.filter((id) => cur.defs[cur.objects[id]?.defId ?? ""]?.name === "Hulldrifter");
    });
    expect(offered.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Hulldrifter"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Opt"]);
    const cruiser = idOf(s, "p1", "battlefield", "Carrion Cruiser");
    expect(abilityIndex(s, cruiser, "Crew 1")).toBeGreaterThanOrEqual(0);
  });

  it("Cloudspire Captain: your Mounts and Vehicles get +1/+1; it crews and saddles as if its power were 2 greater", () => {
    let s = scenario({
      p1: { battlefield: ["Cloudspire Captain", "Hulldrifter", "Gilded Ghoda"] },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const captain = idOf(s, "p1", "battlefield", "Cloudspire Captain");
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    const ghoda = chars(s, idOf(s, "p1", "battlefield", "Gilded Ghoda"));
    expect([ghoda.power, ghoda.toughness]).toEqual([3, 3]);
    expect([chars(s, captain).power, chars(s, captain).toughness]).toEqual([2, 3]);
    const theirs = chars(s, idOf(s, "p2", "battlefield", "Hulldrifter"));
    expect([theirs.power, theirs.toughness]).toEqual([3, 2]);
    // Power 2 + 2: Crew 3 by itself.
    s = settle(activate(s, "p1", hull, "Crew", { tap: [captain] }));
    expect(chars(s, hull).types).toContain("Creature");
    expect([chars(s, hull).power, chars(s, hull).toughness]).toEqual([4, 3]);
    let t = scenario({ p1: { battlefield: ["Cloudspire Captain", "Dracosaur Auxiliary"] } });
    const draco = idOf(t, "p1", "battlefield", "Dracosaur Auxiliary");
    t = settle(activate(t, "p1", draco, "Saddle", { tap: [idOf(t, "p1", "battlefield", "Cloudspire Captain")] }));
    expect(objectDidThisTurn(t, draco, "saddled")).toBe(true);
  });

  it("Cloudspire Coordinator: scry 2 on arrival", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Plains"], hand: ["Cloudspire Coordinator"] } });
    let seen = 0;
    s = settle(cast(s, "p1", "Cloudspire Coordinator"), (req) => {
      if (req.type === "pick" && req.intent === "scryBottom") seen = req.options.length;
      return undefined;
    });
    expect(seen).toBe(2);
  });

  it("Cloudspire Coordinator: {T}: a Pilot per Mount or Vehicle that entered under your control this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Cloudspire Coordinator", "Gilded Ghoda"], hand: ["Hulldrifter", "Apocalypse Runner"] },
      p2: { hand: ["Air Response Unit"] },
    });
    const coord = idOf(s, "p1", "battlefield", "Cloudspire Coordinator");
    moveObject(s, idOf(s, "p1", "hand", "Hulldrifter"), "battlefield");
    moveObject(s, idOf(s, "p1", "hand", "Apocalypse Runner"), "battlefield");
    moveObject(s, idOf(s, "p2", "hand", "Air Response Unit"), "battlefield");
    // The Vehicle that left still counts: it entered this turn.
    moveObject(s, idOf(s, "p1", "battlefield", "Apocalypse Runner"), "graveyard");
    s = settle(s);
    s = settle(activate(s, "p1", coord, "A Pilot"));
    const pilots = idsOf(s, "p1", "battlefield", "Pilot");
    expect(pilots).toHaveLength(2);
    expect([chars(s, pilots[0] as string).power, chars(s, pilots[0] as string).colors]).toEqual([1, []]);
    // The Pilots crew as if their power were 2 greater: Crew 3 with a single one.
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(activate(s, "p1", hull, "Crew", { tap: [pilots[0] as string] }));
    expect(chars(s, hull).types).toContain("Creature");
  });

  it("Cloudspire Skycycle: on arrival, distributes two +1/+1 counters among one or two other targets you control (creatures or Vehicles)", () => {
    const run = (want: (s: S) => string[]) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Plains", 2), "Bear Cub", "Hulldrifter"],
          hand: ["Cloudspire Skycycle"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      let req: { options: string[]; min: number; max: number } | undefined;
      s = settle(cast(s, "p1", "Cloudspire Skycycle"), (r, _p, cur) => {
        if (r.type !== "pick" || r.intent !== "triggerTarget") return undefined;
        req = { options: namesIn(cur, r.options) as string[], min: r.min, max: r.max };
        return want(cur);
      });
      return { s, req };
    };
    const one = run((x) => [idOf(x, "p1", "battlefield", "Bear Cub")]);
    expect(one.req?.options.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect([one.req?.min, one.req?.max]).toEqual([1, 2]);
    expect(one.s.objects[idOf(one.s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(2);
    const two = run((x) => [idOf(x, "p1", "battlefield", "Bear Cub"), idOf(x, "p1", "battlefield", "Hulldrifter")]);
    expect(two.s.objects[idOf(two.s, "p1", "battlefield", "Bear Cub")]?.counters["+1/+1"]).toBe(1);
    expect(two.s.objects[idOf(two.s, "p1", "battlefield", "Hulldrifter")]?.counters["+1/+1"]).toBe(1);
    const cycle = chars(two.s, idOf(two.s, "p1", "battlefield", "Cloudspire Skycycle"));
    expect(cycle.keywords).toContain("flying");
    expect(cycle.abilities.some((a) => a.kind === "activated" && plainText(a.label ?? "").startsWith("Crew 1"))).toBe(true);
  });

  it("Country Roads: enters tapped unless you control a Mount or a Vehicle; {T}: {W}", () => {
    let s = scenario({ p1: { hand: ["Country Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Country Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Country Roads")]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Country Roads"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Country Roads") });
    const roads = idOf(t, "p1", "battlefield", "Country Roads");
    expect(t.objects[roads]?.tapped).toBe(false);
    expect(legalActions(t, "p1").some((a) => a.type === "tapForMana" && a.source === roads && a.colors.includes("W"))).toBe(true);
  });

  it("Country Roads: {1}{W}, {T}, sacrifice: a 1/1 Pilot, at sorcery speed only", () => {
    let s = scenario({ p1: { battlefield: ["Country Roads", ...lands("Plains", 2)] } });
    const roads = idOf(s, "p1", "battlefield", "Country Roads");
    s = settle(activate(s, "p1", roads, "1/1 Pilot"));
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Country Roads")).toHaveLength(1);
    const t = scenario({ active: "p2", p1: { battlefield: ["Country Roads", ...lands("Plains", 2)] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Country Roads"), "1/1 Pilot")).toBeUndefined();
  });

  it("Defend the Rider: your targeted permanent gains hexproof and indestructible, or a 1/1 Pilot", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Defend the Rider"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).toContain(cub);
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(cast(s, "p1", "Defend the Rider", { mode: 0, targets: { t: [cub] } }));
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    destroy(s, cub);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Forest"], hand: ["Defend the Rider"] } });
    t = settle(cast(t, "p1", "Defend the Rider", { mode: 1 }));
    expect(idsOf(t, "p1", "battlefield", "Pilot")).toHaveLength(1);
  });

  it("Detention Chariot: exiles an opposing artifact or creature until the Vehicle leaves the battlefield", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), "Bear Cub"], hand: ["Detention Chariot"] },
      p2: { battlefield: ["Serra Angel", "Hulldrifter", "Island"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Detention Chariot"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") offered = namesIn(cur, req.options);
      return picking([angel])(req);
    });
    expect(offered.sort()).toEqual(["Hulldrifter", "Serra Angel"]);
    expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
    destroy(s, idOf(s, "p1", "battlefield", "Detention Chariot"));
    s = settle(s);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Detention Chariot: cycling {W} (discard it, draw a card); Crew 3", () => {
    let s = scenario({ p1: { battlefield: ["Plains"], hand: ["Detention Chariot"], library: lands("Island", 3) } });
    const chariot = idOf(s, "p1", "hand", "Detention Chariot");
    s = settle(activate(s, "p1", chariot, "Cycling"));
    expect(idsOf(s, "p1", "graveyard", "Detention Chariot")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);
    const t = scenario({ p1: { battlefield: ["Detention Chariot", "Bear Cub", "Llanowar Elves"] } });
    const c = idOf(t, "p1", "battlefield", "Detention Chariot");
    expect(option(t, "p1", c, "Crew 3")).toBeDefined();
    const u = scenario({ p1: { battlefield: ["Detention Chariot", "Bear Cub"] } });
    expect(option(u, "p1", idOf(u, "p1", "battlefield", "Detention Chariot"), "Crew 3")).toBeUndefined();
  });

  describe("Diversion Unit", () => {
    /** p1 casts Lightning Strike on p2; p2 sacrifices Diversion Unit to counter it. */
    const setup = (extra: number) => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2 + extra), hand: ["Lightning Strike"] },
        p2: { battlefield: ["Diversion Unit", "Island"] },
      });
      s = cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      const unit = idOf(s, "p2", "battlefield", "Diversion Unit");
      expect(chars(s, unit).keywords).toContain("flying");
      return activate(s, "p2", unit, "Counter", { targets: { t: [s.stack[0]?.id as string] } });
    };

    it("counters the instant or sorcery if its controller doesn't pay {3}; the Unit is sacrificed", () => {
      const s = settle(setup(0));
      expect(s.players.p2?.life).toBe(20);
      expect(idsOf(s, "p1", "graveyard", "Lightning Strike")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Diversion Unit")).toHaveLength(1);
    });

    it("the controller pays {3}: the spell resolves", () => {
      const s = settle(setup(3), (req) => (req.intent === "unlessPay" ? [1] : undefined));
      expect(s.players.p2?.life).toBe(17);
    });

    it("does not target a creature spell", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
        p2: { battlefield: ["Diversion Unit", "Island"] },
      });
      s = cast(s, "p1", "Bear Cub");
      s = act(s, "p1", { type: "pass" });
      expect(canActivate(s, "p2", idOf(s, "p2", "battlefield", "Diversion Unit"))).toBe(false);
    });
  });

  it("Dracosaur Auxiliary: flying and haste; when it attacks while saddled, 2 damage to any target; Saddle 3", () => {
    const run = (saddle: boolean) => {
      let s = scenario({
        p1: { battlefield: [{ name: "Dracosaur Auxiliary", sick: true }, "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const draco = idOf(s, "p1", "battlefield", "Dracosaur Auxiliary");
      expect(chars(s, draco).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      if (saddle) s = settle(activate(s, "p1", draco, "Saddle", { tap: [idOf(s, "p1", "battlefield", "Serra Angel")] }));
      return settleNoBlocks(attack(s, [draco]), picking([idOf(s, "p2", "battlefield", "Bear Cub")]));
    };
    const ridden = run(true);
    expect(idsOf(ridden, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const alone = run(false);
    expect(idsOf(alone, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(alone.players.p2?.life).toBe(20);
    // Saddle 3: the Cub (power 2) isn't enough.
    const t = scenario({ p1: { battlefield: ["Dracosaur Auxiliary", "Bear Cub"] } });
    expect(option(t, "p1", idOf(t, "p1", "battlefield", "Dracosaur Auxiliary"), "Saddle")).toBeUndefined();
  });
});

describe("Aetherdrift, lot K8: uncommons (2)", () => {
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  /** The names offered by object choices, and the answer: the object named `want` (otherwise the suggestion). */
  const recording = (seen: string[][], want?: string): Answer => {
    return (req: ChoiceRequest, _p, cur) => {
      if (req.type !== "pick" || !req.options.every((o) => typeof o === "string" && cur.objects[o])) return undefined;
      seen.push(namesIn(cur, req.options as string[]).map(String));
      return want === undefined ? undefined : pickNamed(cur, req, want);
    };
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });

  it("Dredger's Insight: mills four cards, you may return an artifact, creature or land card milled; +1 life when an artifact or creature card leaves your graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2),
        hand: ["Dredger's Insight"],
        library: ["Opt", "Bear Cub", "Shock", "Island", "Plains", "Plains"],
      },
      p2: { graveyard: ["Bear Cub"] },
    });
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Dredger's Insight"), recording(seen, "Bear Cub"));
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Island"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Island", "Opt", "Shock"]);
    expect(s.players.p1?.library).toHaveLength(2);
    // The returned creature card left your graveyard: +1 life.
    expect(s.players.p1?.life).toBe(21);
    // Neither an instant card nor a land card, nor a card from the opposing graveyard.
    moveObject(s, idOf(s, "p1", "graveyard", "Opt"), "exile");
    moveObject(s, idOf(s, "p1", "graveyard", "Island"), "exile");
    moveObject(s, idOf(s, "p2", "graveyard", "Bear Cub"), "exile");
    s = settle(act(s, "p1", { type: "pass" }));
    expect(s.players.p1?.life).toBe(21);
  });

  it("Dune Drifter: returns an artifact or creature card with MV X or less from your graveyard; Crew 2", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)],
        hand: ["Dune Drifter"],
        graveyard: ["Bear Cub", "Llanowar Elves", "Serra Angel", "Opt"],
      },
      p2: { graveyard: ["Llanowar Elves"] },
    });
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Dune Drifter", { x: 2 }), recording(seen, "Bear Cub"));
    // MV 2 or less, from your graveyard: neither the Angel (MV 5), nor Opt, nor the opposing card.
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    const drifter = idOf(s, "p1", "battlefield", "Dune Drifter");
    expect(chars(s, drifter).types).not.toContain("Creature");
    s = settle(act(s, "p1", { type: "activate", source: drifter, ability: abilityIndex(s, drifter, "Crew"), tap: [cub] }));
    expect(chars(s, drifter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, drifter)).toEqual([3, 3]);
  });

  it("Earthrumbler: exiling an artifact or creature card from your graveyard animates it until end of turn; not with another card", () => {
    const blocked = scenario({ p1: { battlefield: ["Earthrumbler"], graveyard: ["Opt"] } });
    expect(canActivate(blocked, "p1", idOf(blocked, "p1", "battlefield", "Earthrumbler"))).toBe(false);
    let s = scenario({ p1: { battlefield: ["Earthrumbler"], graveyard: ["Opt", "Bear Cub"] } });
    const rumbler = idOf(s, "p1", "battlefield", "Earthrumbler");
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    expect(chars(s, rumbler).types).not.toContain("Creature");
    s = settle(activate(s, "p1", rumbler, "Becomes", { picks: { graveyardExile: [cub] } }));
    expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    const c = chars(s, rumbler);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([7, 6]);
    expect(c.keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, rumbler).types).not.toContain("Creature");
  });

  it("Embalmed Ascendant: 2/2 black Zombie on arrival; at max speed only, a creature of yours that dies drains 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Swamp", "Swamp"], hand: ["Embalmed Ascendant"] } });
    s = settle(cast(s, "p1", "Embalmed Ascendant"));
    const zombie = idOf(s, "p1", "battlefield", "Zombie");
    expect(pt(s, zombie)).toEqual([2, 2]);
    expect(chars(s, zombie).colors).toEqual(["B"]);
    expect(s.players.p1?.speed).toBe(1);
    destroy(s, zombie);
    s = settle(act(s, "p1", { type: "pass" }));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);

    let t = scenario({ p1: { battlefield: ["Embalmed Ascendant", "Bear Cub"] }, p2: { battlefield: ["Llanowar Elves"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    destroy(t, idOf(t, "p2", "battlefield", "Llanowar Elves"));
    t = settle(act(t, "p1", { type: "pass" }));
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = settle(act(t, "p1", { type: "pass" }));
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([21, 19]);
  });

  it("Endrider Spikespitter: at max speed, at your upkeep, the top card is exiled and playable this turn; nothing below", () => {
    const run = (speed: number) => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Endrider Spikespitter"], library: ["Mountain", ...lands("Forest", 5)] },
      });
      s.players.p1!.speed = speed;
      s.version += 1;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      return s;
    };
    const s = run(4);
    expect(chars(s, idOf(s, "p1", "battlefield", "Endrider Spikespitter")).keywords).toContain("reach");
    const mountain = s.exile.find((id) => nameOf(s, id) === "Mountain");
    expect(mountain).toBeDefined();
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Forest"]);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    const t = run(3);
    expect(t.exile).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Mountain"]);
  });

  it("Fang Guardian: flash; another creature or Vehicle you control gains +2/+2 until end of turn", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Bear Cub", "Hulldrifter", ...lands("Forest", 4)], hand: ["Fang Guardian"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = act(s, "p2", { type: "pass" });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Fang Guardian"), recording(seen, "Bear Cub"));
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Hulldrifter"]);
    expect(pt(s, cub)).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(pt(s, cub)).toEqual([2, 2]);
  });

  it("Fang-Druid Summoner: a creature card with no abilities, from your graveyard or your library", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Fang-Druid Summoner"],
        graveyard: ["Kalakscion, Hunger Tyrant", "Llanowar Elves"],
      },
    });
    const seen: string[][] = [];
    s = settle(cast(s, "p1", "Fang-Druid Summoner"), recording(seen, "Kalakscion, Hunger Tyrant"));
    expect(seen[0]).toEqual(["Kalakscion, Hunger Tyrant"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Kalakscion, Hunger Tyrant"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Fang-Druid Summoner")).keywords).toContain("reach");

    let t = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Fang-Druid Summoner"],
        library: ["Llanowar Elves", "Opt", "Bear Cub", "Forest"],
      },
    });
    const seen2: string[][] = [];
    t = settle(cast(t, "p1", "Fang-Druid Summoner"), recording(seen2, "Bear Cub"));
    expect(seen2.at(-1)).toEqual(["Bear Cub"]);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Bear Cub"]);
    expect(t.players.p1?.library).toHaveLength(3);
  });

  it("Foul Roads: enters tapped without a Mount or Vehicle; {T}: {B}; {1}{B}, {T}, sacrifice: 1/1 Pilot, at sorcery speed only", () => {
    let s = scenario({ p1: { hand: ["Foul Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Foul Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Foul Roads")]?.tapped).toBe(true);
    let m = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Foul Roads"] } });
    m = act(m, "p1", { type: "playLand", card: idOf(m, "p1", "hand", "Foul Roads") });
    const roads = idOf(m, "p1", "battlefield", "Foul Roads");
    expect(m.objects[roads]?.tapped).toBe(false);
    expect(legalActions(m, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === roads ? a.colors : []))).toEqual(["B"]);

    let t = scenario({ p1: { battlefield: ["Foul Roads", "Swamp", "Swamp"] } });
    const road = idOf(t, "p1", "battlefield", "Foul Roads");
    t = settle(activate(t, "p1", road, "1/1 Pilot"));
    const pilot = idOf(t, "p1", "battlefield", "Pilot");
    expect(pt(t, pilot)).toEqual([1, 1]);
    expect(chars(t, pilot).colors).toEqual([]);
    expect(idsOf(t, "p1", "graveyard", "Foul Roads")).toHaveLength(1);
    // During the opponent's turn: no activation.
    let o = scenario({ active: "p2", p1: { battlefield: ["Foul Roads", "Swamp", "Swamp"] } });
    o = act(o, "p2", { type: "pass" });
    expect(canActivate(o, "p1", idOf(o, "p1", "battlefield", "Foul Roads"))).toBe(false);
  });

  it("Fuel the Flames: 2 damage to each creature, on both sides; cycling {2}", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Fuel the Flames"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Fuel the Flames"));
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);

    let t = scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Fuel the Flames"], library: lands("Island", 3) } });
    t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Fuel the Flames"), "Cycling"));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
    expect(idsOf(t, "p1", "graveyard", "Fuel the Flames")).toHaveLength(1);
  });

  it("Gallant Strike: destroys a creature with toughness 4 or greater, not another; cycling {2}", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Bear Cub"], hand: ["Gallant Strike"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toEqual([angel]);
    s = settle(cast(s, "p1", "Gallant Strike", { targets: { t: [angel] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Gallant Strike"], library: lands("Island", 3) } });
    t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Gallant Strike"), "Cycling"));
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Gastal Raider: the targeted opponent discards the instant or sorcery you choose; max speed: +1/+1 and menace", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Gastal Raider"] },
      p2: { hand: ["Opt", "Shock", "Bear Cub"] },
    });
    const seen: string[][] = [];
    const chooser: string[] = [];
    s = settle(cast(s, "p1", "Gastal Raider"), (req, p, cur) => {
      if (req.type === "pick" && req.options.some((o) => cur.objects[o as string])) chooser.push(p);
      return recording(seen, "Shock")(req, p, cur);
    });
    // You are the one who chooses, among instants and sorceries only.
    expect(chooser).toEqual(["p1"]);
    expect(seen.at(-1)?.sort()).toEqual(["Opt", "Shock"]);
    expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Shock"]);
    expect(namesIn(s, s.players.p2?.hand).sort()).toEqual(["Bear Cub", "Opt"]);
    const raider = idOf(s, "p1", "battlefield", "Gastal Raider");
    expect(pt(s, raider)).toEqual([2, 1]);
    expect(chars(s, raider).keywords).not.toContain("menace");
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(pt(s, raider)).toEqual([3, 2]);
    expect(chars(s, raider).keywords).toContain("menace");
  });

  it("Gastal Thrillseeker: 1 damage to the targeted opponent and +1 life on arrival; max speed: deathtouch and haste", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Mountain"], hand: ["Gastal Thrillseeker"] } });
    s = settle(cast(s, "p1", "Gastal Thrillseeker"));
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
    const lizard = idOf(s, "p1", "battlefield", "Gastal Thrillseeker");
    expect(chars(s, lizard).keywords).not.toContain("deathtouch");
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(chars(s, lizard).keywords).toEqual(expect.arrayContaining(["deathtouch", "haste"]));
  });

  it("Gastal Thrillseeker at speed 3: max speed reached during combat damage doesn't give it deathtouch for that damage (510.2, simultaneous)", () => {
    // An unblocked attacker makes the opponent lose life in the same combat: speed goes to 4, but after
    // the damage, dealt at the same time; the blocker (10/10) survives 2 damage. In both attacker orders.
    for (const order of [
      ["Gastal Thrillseeker", "Bear Cub"],
      ["Bear Cub", "Gastal Thrillseeker"],
    ]) {
      let s = scenario({ p1: { battlefield: order }, p2: { battlefield: ["Gigantosaurus"] } });
      s.players.p1!.speed = 3;
      s.version += 1;
      const lizard = idOf(s, "p1", "battlefield", "Gastal Thrillseeker");
      const giant = idOf(s, "p2", "battlefield", "Gigantosaurus");
      expect(chars(s, lizard).keywords).not.toContain("deathtouch");
      s = attack(s, [lizard, idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: giant, attacker: lizard }] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(s.players.p1?.speed).toBe(4);
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[giant]?.zone).toBe("battlefield");
      expect(s.objects[giant]?.damage).toBe(2);
    }
  });

  it("Gloryheath Lynx: lifelink; attacks while saddled: a basic Plains card in hand, not without being saddled", () => {
    const run = (saddled: boolean) => {
      let s = scenario({ p1: { battlefield: ["Gloryheath Lynx", "Bear Cub"], library: ["Forest", "Plains", "Forest"] } });
      const lynx = idOf(s, "p1", "battlefield", "Gloryheath Lynx");
      if (saddled) {
        s = act(s, "p1", {
          type: "activate",
          source: lynx,
          ability: abilityIndex(s, lynx, "Saddle"),
          tap: [idOf(s, "p1", "battlefield", "Bear Cub")],
        });
        s = passBoth(s);
      }
      return throughCombat(attack(s, [lynx]));
    };
    const s = run(true);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
    const t = run(false);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(t.players.p1?.library).toHaveLength(3);
  });

  it("Greenbelt Guardian: {G} gives trample to a targeted creature; exhaust {3}{G}: three +1/+1 counters, only once", () => {
    let s = scenario({
      p1: { battlefield: ["Greenbelt Guardian", ...lands("Forest", 9)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const guardian = idOf(s, "p1", "battlefield", "Greenbelt Guardian");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activate(s, "p1", guardian, "Trample", { targets: { t: [angel] } }));
    expect(chars(s, angel).keywords).toContain("trample");
    const exhaust = abilityIndex(s, guardian, "Exhaust");
    s = settle(act(s, "p1", { type: "activate", source: guardian, ability: exhaust }));
    expect(s.objects[guardian]?.counters["+1/+1"]).toBe(3);
    expect(pt(s, guardian)).toEqual([5, 5]);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === guardian && a.ability === exhaust)).toBe(
      false,
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, angel).keywords).not.toContain("trample");
  });

  it("Guidelight Pathmaker: the searched artifact card enters the battlefield if its MV is 2 or less, otherwise to hand", () => {
    const run = (want: string) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Island", 3)],
          hand: ["Guidelight Pathmaker"],
          library: [artifact("Rouage", 2), "Opt", artifact("Engrenage", 3), "Island"],
        },
      });
      const seen: string[][] = [];
      s = settle(cast(s, "p1", "Guidelight Pathmaker"), (req, p, cur) =>
        req.type === "yesNo" ? [1] : recording(seen, want)(req, p, cur),
      );
      expect(seen.at(-1)?.sort()).toEqual(["Engrenage", "Rouage"]);
      return s;
    };
    const s = run("Rouage");
    expect(idsOf(s, "p1", "battlefield", "Rouage")).toHaveLength(1);
    expect(chars(s, idOf(s, "p1", "battlefield", "Guidelight Pathmaker")).keywords).toContain("vigilance");
    const t = run("Engrenage");
    expect(idsOf(t, "p1", "battlefield", "Engrenage")).toHaveLength(0);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Engrenage"]);
  });

  it("Guidelight Synergist: +1/+0 for each artifact you control (itself included), not the opponent's", () => {
    const s = scenario({
      p1: { battlefield: ["Guidelight Synergist", "Hulldrifter"] },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const bot = idOf(s, "p1", "battlefield", "Guidelight Synergist");
    expect(pt(s, bot)).toEqual([2, 4]);
    expect(chars(s, bot).keywords).toContain("flying");
    const alone = scenario({ p1: { battlefield: ["Guidelight Synergist"] } });
    expect(pt(alone, idOf(alone, "p1", "battlefield", "Guidelight Synergist"))).toEqual([1, 4]);
  });

  it("Haunt the Network: two 1/1 flying Thopters, then the targeted opponent loses X life and you gain X (X: your artifacts)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 3), "Hulldrifter"], hand: ["Haunt the Network"] },
      p2: { battlefield: ["Hulldrifter"] },
    });
    s = settle(cast(s, "p1", "Haunt the Network", { targets: { t: ["p2"] } }));
    const thopters = idsOf(s, "p1", "battlefield", "Thopter");
    expect(thopters).toHaveLength(2);
    const c = chars(s, thopters[0] as string);
    expect([c.power, c.toughness, c.colors]).toEqual([1, 1, []]);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.keywords).toContain("flying");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
  });

  it("Haunted Hellride: when you attack, a creature you control gains +1/+0 and deathtouch, and untaps; Crew 1", () => {
    let s = scenario({
      p1: { battlefield: ["Haunted Hellride", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const ride = idOf(s, "p1", "battlefield", "Haunted Hellride");
    s = settle(act(s, "p1", { type: "activate", source: ride, ability: abilityIndex(s, ride, "Crew"), tap: [elves] }));
    expect(pt(s, ride)).toEqual([3, 3]);
    const seen: string[][] = [];
    s = settle(attack(s, [cub]), recording(seen, "Bear Cub"));
    // Your creatures only (the animated Vehicle included), not the opposing Angel.
    expect(seen[0]?.sort()).toEqual(["Bear Cub", "Haunted Hellride", "Llanowar Elves"]);
    expect(s.objects[cub]?.tapped).toBe(false);
    expect(pt(s, cub)).toEqual([3, 2]);
    expect(chars(s, cub).keywords).toContain("deathtouch");
    expect(s.combat?.attackers.some((a) => a.id === cub)).toBe(true);
  });

  it("Hellish Sideswipe: sacrifice an artifact or creature; destroys a creature or Vehicle; draw if the sacrificed one was a Vehicle", () => {
    const none = scenario({ p1: { battlefield: ["Swamp"], hand: ["Hellish Sideswipe"] }, p2: { battlefield: ["Serra Angel"] } });
    expect(castable(none, "p1", idOf(none, "p1", "hand", "Hellish Sideswipe"))).toBe(false);

    let s = scenario({
      p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Hellish Sideswipe"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(
      cast(s, "p1", "Hellish Sideswipe", { targets: { t: [angel] }, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }),
    );
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(0);

    let t = scenario({
      p1: { battlefield: ["Swamp", "Hulldrifter"], hand: ["Hellish Sideswipe"], library: lands("Island", 3) },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const theirs = idOf(t, "p2", "battlefield", "Hulldrifter");
    t = settle(
      cast(t, "p1", "Hellish Sideswipe", { targets: { t: [theirs] }, sacrifice: [idOf(t, "p1", "battlefield", "Hulldrifter")] }),
    );
    expect(idsOf(t, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Island"]);
  });

  it("Hour of Victory: 2/2 Zombie on arrival; max speed, {1}{B}, sacrifice: a card from your library to hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Hour of Victory"], library: ["Forest", "Opt", "Forest"] },
    });
    s = settle(cast(s, "p1", "Hour of Victory"));
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(1);
    expect(s.players.p1?.speed).toBe(1);
    const hour = idOf(s, "p1", "battlefield", "Hour of Victory");
    expect(canActivate(s, "p1", hour)).toBe(false);
    s.players.p1!.speed = 4;
    s.version += 1;
    s = settle(activate(s, "p1", hour, "Max speed"), recording([], "Opt"));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "graveyard", "Hour of Victory")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Kalakscion, Hunger Tyrant: legendary 7/2 creature with no abilities; legend rule", () => {
    let s = scenario({
      p1: { battlefield: ["Kalakscion, Hunger Tyrant", ...lands("Swamp", 3)], hand: ["Kalakscion, Hunger Tyrant"] },
    });
    const first = idOf(s, "p1", "battlefield", "Kalakscion, Hunger Tyrant");
    const c = chars(s, first);
    expect([c.power, c.toughness]).toEqual([7, 2]);
    expect(c.abilities).toHaveLength(0);
    expect(c.keywords).toHaveLength(0);
    expect(c.supertypes).toContain("Legendary");
    s = settle(cast(s, "p1", "Kalakscion, Hunger Tyrant"), picking([first]));
    expect(idsOf(s, "p1", "battlefield", "Kalakscion, Hunger Tyrant")).toEqual([first]);
    expect(idsOf(s, "p1", "graveyard", "Kalakscion, Hunger Tyrant")).toHaveLength(1);
  });

  it("Lagorin: attacks while saddled, a +1/+1 counter on each of up to two targeted Mounts or Vehicles; nothing when not saddled", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Lagorin, Soul of Alacria", "Bear Cub", "Gilded Ghoda"] },
        p2: { battlefield: ["Hulldrifter"] },
      });
    let s = setup();
    const lagorin = idOf(s, "p1", "battlefield", "Lagorin, Soul of Alacria");
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    expect(chars(s, lagorin).keywords).toContain("flying");
    s = act(s, "p1", {
      type: "activate",
      source: lagorin,
      ability: abilityIndex(s, lagorin, "Saddle"),
      tap: [idOf(s, "p1", "battlefield", "Bear Cub")],
    });
    s = passBoth(s);
    const seen: string[][] = [];
    s = settle(attack(s, [lagorin]), (req, p, cur) => {
      recording(seen)(req, p, cur);
      return req.type === "pick" ? [ghoda, hull] : undefined;
    });
    expect(seen[0]?.sort()).toEqual(["Gilded Ghoda", "Hulldrifter", "Lagorin, Soul of Alacria"]);
    expect(s.objects[ghoda]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[hull]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[lagorin]?.counters["+1/+1"] ?? 0).toBe(0);

    let t = setup();
    const lag2 = idOf(t, "p1", "battlefield", "Lagorin, Soul of Alacria");
    const none: string[][] = [];
    t = settle(attack(t, [lag2]), recording(none));
    expect(none).toHaveLength(0);
    expect(Object.values(t.objects).every((o) => !o.counters["+1/+1"])).toBe(true);
  });
});

describe("Aetherdrift, lot K8: uncommons (3)", () => {
  /** Answers 'yes' to questions and chooses the wanted objects. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const hasAbility = (s: S, player: string, source: string, label: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label));
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Legal targets offered for the spell `card` (mode `mode`, target `slot`). */
  const legalTargets = (s: S, card: string, slot = 0, mode = 0) => {
    const o = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    return o?.type === "cast" ? (o.modes.find((m) => m.index === mode)?.targets[slot]?.legal ?? []) : [];
  };
  const toEnd = (s: S) => advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);

  it("Locust Spray: the targeted creature gets -1/-1 until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp"], hand: ["Locust Spray"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Locust Spray", { targets: { t: [cub] } }));
    expect(pt(s, cub)).toEqual([1, 1]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, cub)).toEqual([2, 2]);
  });

  it("Locust Spray: cycling {B} — discard it, draw a card", () => {
    let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Locust Spray"], library: lands("Plains", 3) } });
    const spray = idOf(s, "p1", "hand", "Locust Spray");
    s = settle(activate(s, "p1", spray, "Cycling"));
    expect(idsOf(s, "p1", "graveyard", "Locust Spray")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
  });

  it("Marshals' Pathcruiser: a basic land in hand on arrival; exhaust {W}{U}{B}{R}{G}: artifact creature with two counters", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 3), hand: ["Marshals' Pathcruiser"], library: ["Opt", "Island", "Opt"] },
    });
    let offered: (string | undefined)[] = [];
    s = settle(cast(s, "p1", "Marshals' Pathcruiser"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
      return undefined;
    });
    expect(offered).toEqual(["Island"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Island"]);

    let t = scenario({
      p1: { battlefield: ["Marshals' Pathcruiser", "Plains", "Island", "Swamp", "Mountain", "Forest"] },
    });
    const cruiser = idOf(t, "p1", "battlefield", "Marshals' Pathcruiser");
    expect(chars(t, cruiser).types).not.toContain("Creature");
    t = settle(activate(t, "p1", cruiser, "Exhaust"));
    expect(chars(t, cruiser).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(t, cruiser)).toEqual([8, 7]);
    expect(hasAbility(t, "p1", cruiser, "Exhaust")).toBe(false);
    // With no duration: it remains a creature in the following turns (611.2a).
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(t, cruiser).types).toContain("Creature");
  });

  it("Rangers' Refueler: exhaust {4} — becomes an artifact creature for good, with a +1/+1 counter; it draws a card", () => {
    let s = scenario({ p1: { battlefield: ["Rangers' Refueler", ...lands("Island", 4)] } });
    const refueler = idOf(s, "p1", "battlefield", "Rangers' Refueler");
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(activate(s, "p1", refueler, "Exhaust"));
    expect(chars(s, refueler).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, refueler)).toEqual([4, 4]);
    expect(s.players.p1?.hand.length).toBe(hand + 1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, refueler).types).toContain("Creature");
  });

  it("Memory Guardian: costs {1} less per artifact you control", () => {
    const gadget = (n: number) => customCard({ name: `Gadget ${n}`, typeLine: "Artifact", types: ["Artifact"] });
    const s = scenario({
      p1: { battlefield: [gadget(1), gadget(2), gadget(3), "Island", "Island"], hand: ["Memory Guardian"] },
    });
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Memory Guardian"))).toBe(true);
    const t = scenario({ p1: { battlefield: [gadget(1), gadget(2), "Island", "Island"], hand: ["Memory Guardian"] } });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Memory Guardian"))).toBe(false);
    const g = settle(cast(s, "p1", "Memory Guardian"));
    expect(chars(g, idOf(g, "p1", "battlefield", "Memory Guardian")).keywords).toContain("flying");
  });

  it("Molt Tender: {T}: mill a card; {T}, exile a card from the graveyard: one mana of any color", () => {
    let s = scenario({ p1: { battlefield: ["Molt Tender"], library: ["Opt", "Island"] } });
    const tender = idOf(s, "p1", "battlefield", "Molt Tender");
    // Empty graveyard: the mana ability can't be activated.
    expect(hasAbility(s, "p1", tender, "One mana")).toBe(false);
    s = settle(activate(s, "p1", tender, "Mill"));
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(1);
    expect(s.objects[tender]?.tapped).toBe(true);

    let t = scenario({ p1: { battlefield: ["Molt Tender"], graveyard: ["Opt"] } });
    const t2 = idOf(t, "p1", "battlefield", "Molt Tender");
    t = activate(t, "p1", t2, "One mana");
    if (t.pending?.kind === "choice") t = act(t, "p1", { type: "choose", values: ["B"] });
    expect(t.players.p1?.manaPool.B).toBe(1);
    expect(t.players.p1?.graveyard).toHaveLength(0);
    expect(namesIn(t, t.exile)).toEqual(["Opt"]);
    expect(t.stack).toHaveLength(0); // mana ability: no stack
  });

  it("Momentum Breaker: each opponent sacrifices a creature or Vehicle of their choice, otherwise discards a card", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Momentum Breaker"] },
      p2: { battlefield: ["Bear Cub", "Hulldrifter"], hand: ["Opt"] },
    });
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    s = settle(cast(s, "p1", "Momentum Breaker"), choosing([hull]));
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.players.p1?.speed).toBe(1);

    let t = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Momentum Breaker"] },
      p2: { battlefield: ["Island"], hand: ["Opt"] },
    });
    t = settle(cast(t, "p1", "Momentum Breaker"));
    expect(idsOf(t, "p2", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(t, "p2", "battlefield", "Island")).toHaveLength(1);
  });

  it("Momentum Breaker with three players: only the opponent who can't sacrifice discards; you are not affected", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Swamp", 2), "Bear Cub"], hand: ["Momentum Breaker", "Opt"] },
      p2: { battlefield: ["Bear Cub"], hand: ["Opt"] },
      p3: { battlefield: ["Island"], hand: ["Opt"] },
    });
    s = settle(cast(s, "p1", "Momentum Breaker"));
    expect([idsOf(s, "p2", "graveyard", "Bear Cub").length, s.players.p2?.hand.length]).toEqual([1, 1]);
    expect([idsOf(s, "p3", "graveyard", "Opt").length, s.players.p3?.hand.length]).toEqual([1, 0]);
    expect([idsOf(s, "p1", "battlefield", "Bear Cub").length, s.players.p1?.hand.length]).toEqual([1, 1]);
  });

  it("Momentum Breaker: {2}, sacrifice it: you gain life equal to your speed", () => {
    let s = scenario({ p1: { battlefield: ["Momentum Breaker", ...lands("Swamp", 2)] } });
    s.players.p1!.speed = 3;
    s.version += 1;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Momentum Breaker"), "Life"));
    expect(s.players.p1?.life).toBe(23);
    expect(idsOf(s, "p1", "graveyard", "Momentum Breaker")).toHaveLength(1);
  });

  it("Nesting Bot: a 1/1 Servo when it dies; max speed: +1/+0", () => {
    let s = scenario({
      p1: { battlefield: ["Nesting Bot"] },
      p2: { battlefield: ["Swamp"], hand: ["Locust Spray"] },
      active: "p2",
    });
    const bot = idOf(s, "p1", "battlefield", "Nesting Bot");
    expect(pt(s, bot)).toEqual([1, 1]);
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(pt(s, bot)).toEqual([2, 1]);
    s = settle(cast(s, "p2", "Locust Spray", { targets: { t: [bot] } }));
    expect(idsOf(s, "p1", "graveyard", "Nesting Bot")).toHaveLength(1);
    const servo = idOf(s, "p1", "battlefield", "Servo");
    expect(pt(s, servo)).toEqual([1, 1]);
    expect(chars(s, servo).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
  });

  it("Ooze Patrol: mill two cards, then a counter per artifact or creature card in the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Ooze Patrol"],
        library: ["Bear Cub", "Island"],
        graveyard: ["Hulldrifter", "Opt"],
      },
    });
    s = settle(cast(s, "p1", "Ooze Patrol"));
    expect(s.players.p1?.library).toHaveLength(0);
    const ooze = idOf(s, "p1", "battlefield", "Ooze Patrol");
    // Bear Cub (creature) and Hulldrifter (artifact); neither Opt nor the Island.
    expect(s.objects[ooze]?.counters["+1/+1"]).toBe(2);
    expect(pt(s, ooze)).toEqual([4, 4]);
  });

  it("Outpace Oblivion: 5 damage to up to one targeted creature or planeswalker", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Outpace Oblivion"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Outpace Oblivion"), choosing([angel]));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(20);
  });

  it("Outpace Oblivion: {2}, sacrifice it: 2 damage to each player who doesn't have max speed", () => {
    let s = scenario({ p1: { battlefield: ["Outpace Oblivion", ...lands("Mountain", 2)] } });
    s.players.p1!.speed = 4;
    s.version += 1;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Outpace Oblivion"), "2 damage"));
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p2?.life).toBe(18);
    let t = scenario({ p1: { battlefield: ["Outpace Oblivion", ...lands("Mountain", 2)] } });
    t.players.p1!.speed = 3;
    t.version += 1;
    t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Outpace Oblivion"), "2 damage"));
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([18, 18]);
  });

  it("Pacesetter Paragon: exhaust {2}{R} — a +1/+1 counter and double strike until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Pacesetter Paragon", ...lands("Mountain", 6)] } });
    const pal = idOf(s, "p1", "battlefield", "Pacesetter Paragon");
    s = settle(activate(s, "p1", pal, "Exhaust"));
    expect(pt(s, pal)).toEqual([3, 4]);
    expect(chars(s, pal).keywords).toContain("doubleStrike");
    expect(hasAbility(s, "p1", pal, "Exhaust")).toBe(false);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, pal).keywords).not.toContain("doubleStrike");
    expect(pt(s, pal)).toEqual([3, 4]);
  });

  it("Pit Automaton: {C}{C} only to activate abilities; defender", () => {
    const s = scenario({ p1: { battlefield: ["Pit Automaton", "Pit Automaton"], hand: ["Pit Automaton"] } });
    const [a, b] = idsOf(s, "p1", "battlefield", "Pit Automaton") as [string, string];
    expect(chars(s, a).keywords).toContain("defender");
    // The mana of the two Automatons doesn't pay for a {2} spell…
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Pit Automaton"))).toBe(false);
    // … but it pays the {2} of the other's ability.
    expect(hasAbility(s, "p1", b, "Copy")).toBe(true);
  });

  it("Pit Automaton: the next exhaust ability this turn is copied", () => {
    let s = scenario({ p1: { battlefield: ["Pit Automaton", "Prowcatcher Specialist", ...lands("Mountain", 6)] } });
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Pit Automaton"), "Copy"));
    const pro = idOf(s, "p1", "battlefield", "Prowcatcher Specialist");
    s = settle(activate(s, "p1", pro, "Exhaust"));
    expect(s.objects[pro]?.counters["+1/+1"]).toBe(4);
  });

  it("Plow Through: your creature fights an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Serra Angel"], hand: ["Plow Through"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const card = idOf(s, "p1", "hand", "Plow Through");
    expect(legalTargets(s, card, 0)).not.toContain(cub);
    expect(legalTargets(s, card, 1)).not.toContain(angel);
    s = settle(cast(s, "p1", "Plow Through", { mode: 0, targets: { a: [angel], b: [cub] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.objects[angel]?.damage).toBe(2);
  });

  it("Plow Through: destroy a targeted Vehicle (not another creature)", () => {
    let s = scenario({
      p1: { battlefield: ["Forest"], hand: ["Plow Through"] },
      p2: { battlefield: ["Hulldrifter", "Bear Cub"] },
    });
    const card = idOf(s, "p1", "hand", "Plow Through");
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    expect(legalTargets(s, card, 0, 1)).toEqual([hull]);
    s = settle(cast(s, "p1", "Plow Through", { mode: 1, targets: { t: [hull] } }));
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);
  });

  it("Point the Way: {3}{G}, sacrifice it: up to X tapped basic lands, X being your speed", () => {
    let s = scenario({
      p1: { battlefield: ["Point the Way", ...lands("Forest", 4)], library: ["Plains", "Opt", "Island", "Swamp"] },
    });
    s.players.p1!.speed = 2;
    s.version += 1;
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Point the Way"), "basic lands"));
    const fetched = s.battlefield.filter((id) => ["Plains", "Island", "Swamp"].includes(chars(s, id).name));
    expect(fetched).toHaveLength(2);
    expect(fetched.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Point the Way")).toHaveLength(1);
  });

  it("Pride of the Road: max speed — at the beginning of combat, double strike to a creature or Vehicle you control", () => {
    let s = scenario({ p1: { battlefield: ["Pride of the Road", "Bear Cub"] } });
    const pride = idOf(s, "p1", "battlefield", "Pride of the Road");
    expect(chars(s, pride).keywords).toContain("vigilance");
    s.players.p1!.speed = 3;
    s.version += 1;
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(chars(s, pride).keywords).not.toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("doubleStrike");

    let t = scenario({ p1: { battlefield: ["Pride of the Road", "Bear Cub"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && (x.stack.length > 0 || x.pending?.kind === "choice"));
    t = settle(t, choosing([cub]));
    expect(chars(t, cub).keywords).toContain("doubleStrike");
    expect(chars(t, idOf(t, "p1", "battlefield", "Pride of the Road")).keywords).not.toContain("doubleStrike");
  });

  it("Push the Limit: Mounts and Vehicles return from the graveyard, become creatures with haste, then are sacrificed", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 7),
        hand: ["Push the Limit"],
        graveyard: ["Hulldrifter", "Gilded Ghoda", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Push the Limit"));
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    const ghoda = idOf(s, "p1", "battlefield", "Gilded Ghoda");
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(chars(s, hull).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, hull).keywords).toContain("haste");
    expect(chars(s, ghoda).keywords).toContain("haste");
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && idsOf(x, "p1", "graveyard", "Hulldrifter").length > 0,
    );
    expect(idsOf(s, "p1", "graveyard", "Hulldrifter")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Gilded Ghoda")).toHaveLength(1);
  });

  it("Racers' Scoreboard: draw two cards then discard one; max speed: your spells cost {1} less", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Racers' Scoreboard", "Opt"], library: lands("Plains", 4) },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    s = settle(cast(s, "p1", "Racers' Scoreboard"), choosing([opt]));
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains", "Plains"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);

    const t = scenario({ p1: { battlefield: ["Racers' Scoreboard", "Forest"], hand: ["Bear Cub"] } });
    const cub = idOf(t, "p1", "hand", "Bear Cub");
    t.players.p1!.speed = 3;
    t.version += 1;
    expect(castable(t, "p1", cub)).toBe(false);
    t.players.p1!.speed = 4;
    t.version += 1;
    expect(castable(t, "p1", cub)).toBe(true);
  });

  it("Rangers' Aetherhive: a 1/1 flying Thopter whenever you activate an exhaust ability", () => {
    let s = scenario({ p1: { battlefield: ["Rangers' Aetherhive", "Prowcatcher Specialist", ...lands("Mountain", 4)] } });
    const hive = idOf(s, "p1", "battlefield", "Rangers' Aetherhive");
    expect(chars(s, hive).keywords).toContain("vigilance");
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Prowcatcher Specialist"), "Exhaust"));
    const thopter = idOf(s, "p1", "battlefield", "Thopter");
    expect(pt(s, thopter)).toEqual([1, 1]);
    expect(chars(s, thopter).keywords).toContain("flying");
    // An opponent's exhaust doesn't count.
    let t = scenario({
      p1: { battlefield: ["Rangers' Aetherhive"] },
      p2: { battlefield: ["Prowcatcher Specialist", ...lands("Mountain", 4)] },
      active: "p2",
    });
    t = settle(activate(t, "p2", idOf(t, "p2", "battlefield", "Prowcatcher Specialist"), "Exhaust"));
    expect(idsOf(t, "p1", "battlefield", "Thopter")).toHaveLength(0);
  });

  it("Reef Roads: {U}; {1}{U}, {T}, sacrifice it: a 1/1 Pilot, at sorcery speed only", () => {
    let s = scenario({ p1: { battlefield: ["Reef Roads", "Island", "Island"] } });
    const roads = idOf(s, "p1", "battlefield", "Reef Roads");
    expect(legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === roads ? a.colors : []))).toEqual(["U"]);
    s = settle(activate(s, "p1", roads, "1/1 Pilot"));
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Reef Roads")).toHaveLength(1);
    const t = scenario({ p1: { battlefield: ["Reef Roads", "Island", "Island"] }, active: "p2" });
    expect(hasAbility(t, "p1", idOf(t, "p1", "battlefield", "Reef Roads"), "1/1 Pilot")).toBe(false);
  });

  it("Reef Roads: enters tapped unless you control a Mount or a Vehicle", () => {
    let s = scenario({ p1: { hand: ["Reef Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Reef Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Reef Roads")]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Reef Roads"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Reef Roads") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Reef Roads")]?.tapped).toBe(false);
  });

  it("Rise from the Wreck: up to one creature card, one Mount card, one Vehicle card and one creature card with no abilities", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3),
        hand: ["Rise from the Wreck"],
        graveyard: ["Serra Angel", "Gilded Ghoda", "Hulldrifter", "Bear Cub", "Opt"],
      },
    });
    const g = (n: string) => idOf(s, "p1", "graveyard", n);
    const card = idOf(s, "p1", "hand", "Rise from the Wreck");
    expect(legalTargets(s, card, 1)).toEqual([g("Gilded Ghoda")]);
    expect(legalTargets(s, card, 2)).toEqual([g("Hulldrifter")]);
    expect(legalTargets(s, card, 3)).toEqual([g("Bear Cub")]);
    expect(legalTargets(s, card, 0)).not.toContain(g("Opt"));
    s = settle(
      cast(s, "p1", "Rise from the Wreck", {
        targets: { a: [g("Serra Angel")], b: [g("Gilded Ghoda")], c: [g("Hulldrifter")], d: [g("Bear Cub")] },
      }),
    );
    expect(namesIn(s, s.players.p1?.hand).sort()).toEqual(["Bear Cub", "Gilded Ghoda", "Hulldrifter", "Serra Angel"]);
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Opt", "Rise from the Wreck"]);
  });

  it("Risen Necroregent: max speed — a 2/2 Zombie at the beginning of your end step, not below", () => {
    let s = scenario({ p1: { battlefield: ["Risen Necroregent"] } });
    s.players.p1!.speed = 3;
    s.version += 1;
    s = toEnd(s);
    expect(idsOf(s, "p1", "battlefield", "Zombie")).toHaveLength(0);
    let t = scenario({ p1: { battlefield: ["Risen Necroregent"] } });
    t.players.p1!.speed = 4;
    t.version += 1;
    t = advanceUntil(t, (x) => idsOf(x, "p1", "battlefield", "Zombie").length > 0 || x.turn.active === "p2");
    const zombie = idOf(t, "p1", "battlefield", "Zombie");
    expect(t.turn.step).toBe("end");
    expect(pt(t, zombie)).toEqual([2, 2]);
    expect(chars(t, zombie).colors).toEqual(["B"]);
  });

  it("Road Rage: X damage, X being 2 plus the number of Mounts and Vehicles you control", () => {
    let s = scenario({
      p1: { battlefield: ["Mountain", "Hulldrifter"], hand: ["Road Rage"] },
      p2: { battlefield: ["Serra Angel", "Gilded Ghoda"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Road Rage", { targets: { t: [angel] } }));
    // 2 + Hulldrifter; the opposing Mount doesn't count.
    expect(s.objects[angel]?.damage).toBe(3);
    let t = scenario({
      p1: { battlefield: ["Mountain", "Hulldrifter", "Gilded Ghoda"], hand: ["Road Rage"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = settle(cast(t, "p1", "Road Rage", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Roadside Assistance: enchants a Vehicle; 1/1 Pilot on arrival; +1/+1 and lifelink", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Hulldrifter"], hand: ["Roadside Assistance"] } });
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(cast(s, "p1", "Roadside Assistance", { targets: { enchant: [hull] } }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Roadside Assistance")]?.attachedTo).toBe(hull);
    expect(pt(s, hull)).toEqual([4, 3]);
    expect(chars(s, hull).keywords).toContain("lifelink");
    expect(idsOf(s, "p1", "battlefield", "Pilot")).toHaveLength(1);
  });

  it("Roadside Blowout: returns an opposing creature or Vehicle, draw; {2} less against mana value 1", () => {
    let s = scenario({
      p1: { battlefield: ["Island"], hand: ["Roadside Blowout"], library: lands("Plains", 3) },
      p2: { battlefield: ["Llanowar Elves", "Serra Angel"] },
    });
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "p1", "Roadside Blowout", { targets: { t: [elves] } }));
    expect(idsOf(s, "p2", "hand", "Llanowar Elves")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    // Against mana value 5, the full cost is due: an Island isn't enough.
    const t = scenario({
      p1: { battlefield: ["Island"], hand: ["Roadside Blowout"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(() => cast(t, "p1", "Roadside Blowout", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } })).toThrow();
    const u = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Roadside Blowout"] },
      p2: { battlefield: ["Serra Angel", "Island"] },
    });
    const card = idOf(u, "p1", "hand", "Roadside Blowout");
    expect(legalTargets(u, card)).toEqual([idOf(u, "p2", "battlefield", "Serra Angel")]);
  });
});

describe("Aetherdrift, lot K8: uncommons (4)", () => {
  /** Activates the ability of `source` whose label starts with `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) =>
    act(s, player, { type: "activate", source, ability: abilityIndex(s, source, label), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });
  /** Vanilla legend: printed characteristics, no abilities. */
  const vanillaLegend = (name: string, power: number, toughness: number, mv: number, subtypes: string[]) => {
    const s = scenario({ p1: { battlefield: [name] } });
    const c = chars(s, idOf(s, "p1", "battlefield", name));
    expect([c.power, c.toughness]).toEqual([power, toughness]);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toEqual(subtypes);
    expect(c.abilities).toHaveLength(0);
    expect(c.keywords).toHaveLength(0);
    expect(manaValue(s.defs[s.objects[idOf(s, "p1", "battlefield", name)]?.defId ?? ""]?.manaCost)).toBe(mv);
  };

  it("Rocketeer Boostbuggy: Crew 1; whenever it attacks, a Treasure", () => {
    let s = scenario({ p1: { battlefield: ["Rocketeer Boostbuggy", "Llanowar Elves"] } });
    const bug = idOf(s, "p1", "battlefield", "Rocketeer Boostbuggy");
    expect(chars(s, bug).types).not.toContain("Creature");
    s = settle(activate(s, "p1", bug, "Crew"));
    expect(chars(s, bug).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, bug)).toEqual([3, 2]);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    s = settleNoBlocks(attack(s, [bug]));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    // Crew: creature until end of turn only.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bug).types).not.toContain("Creature");
  });

  it("Rocketeer Boostbuggy: exhaust {3} — becomes an artifact creature for good, with a +1/+1 counter; only once", () => {
    let s = scenario({ p1: { battlefield: ["Rocketeer Boostbuggy", ...lands("Mountain", 6)] } });
    const bug = idOf(s, "p1", "battlefield", "Rocketeer Boostbuggy");
    s = settle(activate(s, "p1", bug, "Exhaust"));
    expect(chars(s, bug).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, bug)).toEqual([4, 3]);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === bug && a.label?.startsWith("Exhaust"))).toBe(
      false,
    );
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bug).types).toContain("Creature");
  });

  it("Rover Blades: the equipped creature has double strike; piloted, it becomes a 2/2 creature with double strike and detaches", () => {
    let s = scenario({ p1: { battlefield: ["Rover Blades", "Llanowar Elves", "Bear Cub", ...lands("Plains", 4)] } });
    const blades = idOf(s, "p1", "battlefield", "Rover Blades");
    const elf = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, blades).types).not.toContain("Creature");
    s = settle(activate(s, "p1", blades, "Equip", { targets: { t: [elf] } }));
    expect(s.objects[blades]?.attachedTo).toBe(elf);
    expect(chars(s, elf).keywords).toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("doubleStrike");
    // Crew 2 with the Cub (power 2): a creature can't be attached, the Equipment detaches.
    s = settle(activate(s, "p1", blades, "Crew", { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(chars(s, blades).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(pt(s, blades)).toEqual([2, 2]);
    expect(chars(s, blades).keywords).toContain("doubleStrike");
    expect(s.objects[blades]?.attachedTo).toBeFalsy();
    expect(chars(s, elf).keywords).not.toContain("doubleStrike");
  });

  it("Sabotage Strategist: creatures attacking you get -1/-0 until end of turn, not those attacking another player", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Angel", "Bear Cub", "Sabotage Strategist"] },
      p2: { battlefield: ["Sabotage Strategist"] },
    });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const mine = chars(s, idOf(s, "p1", "battlefield", "Sabotage Strategist"));
    expect(mine.keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    s = settle(attack(s, [angel, cub]));
    // Only p2's Strategist (the attacked player) triggers.
    expect(pt(s, angel)).toEqual([3, 4]);
    expect(pt(s, cub)).toEqual([1, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Sabotage Strategist: exhaust {5}{U}{U} — three +1/+1 counters", () => {
    let s = scenario({ p1: { battlefield: ["Sabotage Strategist", ...lands("Island", 7)] } });
    const strat = idOf(s, "p1", "battlefield", "Sabotage Strategist");
    s = settle(activate(s, "p1", strat, "Exhaust"));
    expect(s.objects[strat]?.counters["+1/+1"]).toBe(3);
    expect(pt(s, strat)).toEqual([5, 5]);
    expect(canActivate(s, "p1", strat)).toBe(false);
  });

  it("Scrounging Skyray: as many +1/+1 counters as cards discarded together; nothing when an opponent discards", () => {
    let s = scenario({
      p1: { battlefield: ["Scrounging Skyray", "Mountain"], hand: ["Skycrash"] },
      p2: { battlefield: ["Mountain"], hand: ["Skycrash"] },
    });
    const ray2 = idOf(s, "p1", "battlefield", "Scrounging Skyray");
    expect(chars(s, ray2).keywords).toContain("flying");
    // Cycling: one card discarded, one counter.
    s = settle(activate(s, "p1", idOf(s, "p1", "hand", "Skycrash"), "Cycling"));
    expect(s.objects[ray2]?.counters["+1/+1"]).toBe(1);
    // The opponent cycles: no counter.
    s = act(s, "p1", { type: "pass" });
    s = settle(activate(s, "p2", idOf(s, "p2", "hand", "Skycrash"), "Cycling"));
    expect(s.objects[ray2]?.counters["+1/+1"]).toBe(1);
  });

  it("Scrounging Skyray: two cards discarded at the same time (end of turn, nine-card hand) give two counters", () => {
    let s = scenario({ step: "main2", p1: { battlefield: ["Scrounging Skyray"], hand: lands("Forest", 9) } });
    const ray = idOf(s, "p1", "battlefield", "Scrounging Skyray");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.hand).toHaveLength(7);
    s = settle(s);
    expect(s.objects[ray]?.counters["+1/+1"]).toBe(2);
  });

  it("Shefet Archfiend: on arrival, all other creatures get -2/-2 until end of turn (not those that arrive later)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Swamp", 7), ...lands("Forest", 2), "Llanowar Elves"],
        hand: ["Shefet Archfiend", "Bear Cub"],
      },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = settle(cast(s, "p1", "Shefet Archfiend"));
    const fiend = idOf(s, "p1", "battlefield", "Shefet Archfiend");
    expect(pt(s, fiend)).toEqual([5, 5]);
    expect(chars(s, fiend).keywords).toContain("flying");
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(pt(s, angel)).toEqual([2, 2]);
    s = settle(cast(s, "p1", "Bear Cub"));
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Skycrash: destroys a targeted artifact (not a nonartifact creature); cycling {R}", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["Skycrash"] },
      p2: { battlefield: ["Hulldrifter", "Serra Angel"] },
    });
    const hull = idOf(s, "p2", "battlefield", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toContain(hull);
    expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
    s = settle(cast(s, "p1", "Skycrash", { targets: { t: [hull] } }));
    expect(idsOf(s, "p2", "graveyard", "Hulldrifter")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: ["Mountain"], hand: ["Skycrash"], library: ["Opt"] } });
    t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Skycrash"), "Cycling"));
    expect(idsOf(t, "p1", "graveyard", "Skycrash")).toHaveLength(1);
    expect(namesIn(t, t.players.p1?.hand)).toEqual(["Opt"]);
  });

  it("Skyserpent Seeker: exhaust {4} — reveals up to two lands, put onto the battlefield tapped, the rest on the bottom; +1/+1 counter", () => {
    let s = scenario({
      p1: {
        battlefield: ["Skyserpent Seeker", ...lands("Forest", 4)],
        library: ["Opt", "Plains", "Shock", "Island", "Bear Cub", "Mountain"],
      },
    });
    const seeker = idOf(s, "p1", "battlefield", "Skyserpent Seeker");
    expect(chars(s, seeker).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
    s = settle(activate(s, "p1", seeker, "Exhaust"));
    const plains = idOf(s, "p1", "battlefield", "Plains");
    const island = idOf(s, "p1", "battlefield", "Island");
    expect([s.objects[plains]?.tapped, s.objects[island]?.tapped]).toEqual([true, true]);
    expect(idsOf(s, "p1", "battlefield", "Mountain")).toHaveLength(0);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib.slice(0, 2)).toEqual(["Bear Cub", "Mountain"]);
    expect(lib.slice(2).sort()).toEqual(["Opt", "Shock"]);
    expect(s.objects[seeker]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", seeker)).toBe(false);
  });

  it("Slick Imitator: max speed — {1}, sacrifice: copies a spell you control; not before max speed nor on an opposing spell", () => {
    let s = scenario({
      p1: { battlefield: ["Slick Imitator", "Mountain", "Island"], hand: ["Shock"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const imitator = idOf(s, "p1", "battlefield", "Slick Imitator");
    s.players.p1!.speed = 3;
    s.version += 1;
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    expect(canActivate(s, "p1", imitator)).toBe(false);
    s.players.p1!.speed = 4;
    s.version += 1;
    expect(canActivate(s, "p1", imitator)).toBe(true);
    s = settle(activate(s, "p1", imitator, "Max speed", { targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p2?.life).toBe(16);
    expect(idsOf(s, "p1", "graveyard", "Slick Imitator")).toHaveLength(1);

    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Slick Imitator", "Island"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    t.players.p1!.speed = 4;
    t.version += 1;
    t = cast(t, "p2", "Shock", { targets: { t: ["p1"] } });
    t = act(t, "p2", { type: "pass" });
    expect(t.pending?.kind === "priority" && t.pending.player).toBe("p1");
    expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Slick Imitator"))).toBe(false);
  });

  it("Spire Mechcycle: haste; exhaust by tapping another Mount or Vehicle — artifact creature, a counter per other Mount or Vehicle", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Spire Mechcycle", sick: true }, "Hulldrifter", "Gilded Ghoda", "Bear Cub"],
      },
      p2: { battlefield: ["Hulldrifter"] },
    });
    const cycle = idOf(s, "p1", "battlefield", "Spire Mechcycle");
    const hull = idOf(s, "p1", "battlefield", "Hulldrifter");
    s = settle(activate(s, "p1", cycle, "Exhaust", { tap: [hull] }));
    expect(s.objects[hull]?.tapped).toBe(true);
    expect(chars(s, cycle).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    // Hulldrifter and Gilded Ghoda: two counters (neither the Cub nor the opposing Vehicle).
    expect(s.objects[cycle]?.counters["+1/+1"]).toBe(2);
    expect(pt(s, cycle)).toEqual([7, 6]);
    // Haste: it attacks the turn it arrives.
    s = attack(s, [cycle]);
    expect(s.combat?.attackers.some((a) => a.id === cycle)).toBe(true);

    // No other untapped Mount or Vehicle: no exhaust (crew remains possible).
    const t = scenario({ p1: { battlefield: ["Spire Mechcycle", "Bear Cub", { name: "Hulldrifter", tapped: true }] } });
    const c2 = idOf(t, "p1", "battlefield", "Spire Mechcycle");
    expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === c2 && a.label?.startsWith("Exhaust"))).toBe(
      false,
    );
    // The exhaust doesn't end with the turn.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, cycle).types).toContain("Creature");
  });

  it("Sundial, Dawn Tyrant: legendary 3/3 artifact creature with no abilities", () => {
    vanillaLegend("Sundial, Dawn Tyrant", 3, 3, 2, ["Construct"]);
    const s = scenario({ p1: { battlefield: ["Sundial, Dawn Tyrant"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Sundial, Dawn Tyrant")).types).toEqual(
      expect.arrayContaining(["Artifact", "Creature"]),
    );
  });

  it("Terrian, World Tyrant: legendary 9/7 creature with no abilities", () => {
    vanillaLegend("Terrian, World Tyrant", 9, 7, 5, ["Dinosaur", "Ooze"]);
  });

  it("Tyrox, Saurid Tyrant: legendary 4/1 creature with no abilities", () => {
    vanillaLegend("Tyrox, Saurid Tyrant", 4, 1, 2, ["Dinosaur", "Warrior"]);
  });

  it("Thundering Broodwagon: on arrival, destroys an opposing nonland permanent with mana value 4 or less", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), ...lands("Forest", 2), "Llanowar Elves"], hand: ["Thundering Broodwagon"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", "Llanowar Elves", "Island"] },
    });
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Thundering Broodwagon"), (req, _p, cur) => {
      if (req.type === "pick") offered = namesIn(cur, req.options as string[]) as string[];
      return picking([cub])(req);
    });
    // Neither the Angel (MV 5), nor the Island, nor p1's Elves.
    expect(offered.sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    const wagon = idOf(s, "p1", "battlefield", "Thundering Broodwagon");
    expect(chars(s, wagon).keywords).toEqual(expect.arrayContaining(["reach", "menace"]));
    expect(chars(s, wagon).types).not.toContain("Creature");
    expect(abilityIndex(s, wagon, "Crew 3")).toBeGreaterThanOrEqual(0);
  });

  it("Transit Mage: you may search for an artifact with mana value 4 or 5; declining searches for nothing", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Island", 3),
          hand: ["Transit Mage"],
          library: [artifact("Rouage", 3), artifact("Engrenage", 4), artifact("Ressort", 5), artifact("Piston", 6)],
        },
      });
    let offered: string[] = [];
    let s = settle(cast(setup(), "p1", "Transit Mage"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick" || req.intent !== "search") return undefined;
      offered = namesIn(cur, req.options as string[]) as string[];
      return req.options.filter((o) => namesIn(cur, [o as string])[0] === "Ressort");
    });
    expect(offered.sort()).toEqual(["Engrenage", "Ressort"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Ressort"]);
    expect(s.players.p1?.library).toHaveLength(3);
    s = settle(cast(setup(), "p1", "Transit Mage"), (req) => (req.type === "yesNo" ? [0] : undefined));
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.library).toHaveLength(4);
  });

  it("Tune Up: returns an artifact card from your graveyard; a Vehicle becomes an artifact creature for good", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 8), hand: ["Tune Up", "Tune Up"], graveyard: ["Hulldrifter", artifact("Rouage", 3)] },
      p2: { graveyard: [artifact("Piston", 2)] },
    });
    const hull = idOf(s, "p1", "graveyard", "Hulldrifter");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast");
    const legal = opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [];
    expect(legal).toHaveLength(2);
    expect(legal).not.toContain(s.players.p2?.graveyard[0]);
    s = settle(cast(s, "p1", "Tune Up", { targets: { t: [hull] } }));
    const back = idOf(s, "p1", "battlefield", "Hulldrifter");
    expect(chars(s, back).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    s = settle(cast(s, "p1", "Tune Up", { targets: { t: [idOf(s, "p1", "graveyard", "Rouage")] } }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Rouage")).types).toEqual(["Artifact"]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, back).types).toContain("Creature");
  });

  it("Unswerving Sloth: if it attacks while saddled, indestructible until end of turn and your creatures untap; nothing otherwise", () => {
    let s = scenario({ p1: { battlefield: ["Unswerving Sloth", "Serra Angel", { name: "Bear Cub", tapped: true }] } });
    const sloth = idOf(s, "p1", "battlefield", "Unswerving Sloth");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", sloth, "Saddle", { tap: [angel] }));
    expect(s.objects[angel]?.tapped).toBe(true);
    s = settleNoBlocks(attack(s, [sloth]));
    expect(chars(s, sloth).keywords).toContain("indestructible");
    expect([s.objects[angel]?.tapped, s.objects[cub]?.tapped, s.objects[sloth]?.tapped]).toEqual([false, false, false]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, sloth).keywords).not.toContain("indestructible");

    let t = scenario({ p1: { battlefield: ["Unswerving Sloth", { name: "Bear Cub", tapped: true }] } });
    const sloth2 = idOf(t, "p1", "battlefield", "Unswerving Sloth");
    t = settleNoBlocks(attack(t, [sloth2]));
    expect(chars(t, sloth2).keywords).not.toContain("indestructible");
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
  });

  it("Veteran Beastrider: at your end step, your creatures untap (not the opponent's); {2}{G}{W}: your creatures +1/+1", () => {
    let s = scenario({
      p1: {
        battlefield: ["Veteran Beastrider", { name: "Bear Cub", tapped: true }, ...lands("Forest", 2), ...lands("Plains", 2)],
      },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
    });
    const mine = idOf(s, "p1", "battlefield", "Bear Cub");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Veteran Beastrider"), "Your creatures"));
    expect(pt(s, mine)).toEqual([3, 3]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Veteran Beastrider"))).toEqual([4, 5]);
    expect(pt(s, theirs)).toEqual([2, 2]);
    s = advanceUntil(
      s,
      (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    expect(s.turn.active).toBe("p1");
    expect(s.objects[mine]?.tapped).toBe(false);
    expect(s.objects[theirs]?.tapped).toBe(true);
  });

  it("Voyage Home: affinity for artifacts (yours only); draw three cards and gain 3 life", () => {
    const setup = (artifacts: number) =>
      scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Island", 2), ...Array(artifacts).fill(artifact("Rouage", 1))],
          hand: ["Voyage Home"],
        },
        p2: { battlefield: Array(3).fill(artifact("Piston", 1)) },
      });
    const few = setup(2);
    expect(castable(few, "p1", idOf(few, "p1", "hand", "Voyage Home"))).toBe(false);
    let s = setup(3);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Voyage Home"))).toBe(true);
    s = settle(cast(s, "p1", "Voyage Home"));
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Wickerfolk Indomitable: cast from the graveyard by paying 2 life and sacrificing an artifact or creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], graveyard: ["Wickerfolk Indomitable"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const wicker = idOf(s, "p1", "graveyard", "Wickerfolk Indomitable");
    expect(castable(s, "p1", wicker)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: wicker, sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
    expect(idsOf(s, "p1", "battlefield", "Wickerfolk Indomitable")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(18);
    expect(pt(s, idOf(s, "p1", "battlefield", "Wickerfolk Indomitable"))).toEqual([4, 3]);

    // Nothing to sacrifice (the opposing creature doesn't count): no casting from the graveyard.
    const t = scenario({
      p1: { battlefield: lands("Swamp", 4), graveyard: ["Wickerfolk Indomitable"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Wickerfolk Indomitable"))).toBe(false);
    // From hand: no additional cost.
    let h = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Wickerfolk Indomitable"] } });
    h = settle(cast(h, "p1", "Wickerfolk Indomitable"));
    expect(idsOf(h, "p1", "battlefield", "Wickerfolk Indomitable")).toHaveLength(1);
    expect(h.players.p1?.life).toBe(20);
  });

  it("Wild Roads: enters tapped unless a Mount or Vehicle; {1}{G}, {T}, sacrifice: colorless 1/1 Pilot, at sorcery speed only", () => {
    let s = scenario({ p1: { hand: ["Wild Roads"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Wild Roads") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Wild Roads")]?.tapped).toBe(true);
    let m = scenario({ p1: { battlefield: ["Gilded Ghoda"], hand: ["Wild Roads"] } });
    m = act(m, "p1", { type: "playLand", card: idOf(m, "p1", "hand", "Wild Roads") });
    expect(m.objects[idOf(m, "p1", "battlefield", "Wild Roads")]?.tapped).toBe(false);

    let t = scenario({ p1: { battlefield: ["Wild Roads", "Forest", "Forest"] } });
    const roads = idOf(t, "p1", "battlefield", "Wild Roads");
    const manaColors = legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === roads ? a.colors : []));
    expect(manaColors).toEqual(["G"]);
    t = settle(activate(t, "p1", roads, "1/1 Pilot"));
    expect(idsOf(t, "p1", "graveyard", "Wild Roads")).toHaveLength(1);
    const pilot = idOf(t, "p1", "battlefield", "Pilot");
    expect(pt(t, pilot)).toEqual([1, 1]);
    expect(chars(t, pilot).colors).toEqual([]);

    // At the beginning of combat (priority to p1, but not at sorcery speed): no activation.
    const o = scenario({ step: "beginCombat", p1: { battlefield: ["Wild Roads", "Forest", "Forest"] } });
    expect(o.pending?.kind === "priority" && o.pending.player).toBe("p1");
    expect(canActivate(o, "p1", idOf(o, "p1", "battlefield", "Wild Roads"))).toBe(false);
  });

  it("Wretched Doll: {B}, {T}: surveil 1", () => {
    let s = scenario({ p1: { battlefield: ["Wretched Doll", "Swamp", "Swamp"], library: ["Opt", "Island"] } });
    const doll = idOf(s, "p1", "battlefield", "Wretched Doll");
    expect(pt(s, doll)).toEqual([3, 1]);
    let seen: string[] = [];
    s = settle(activate(s, "p1", doll, "Surveil"), (req, _p, cur) => {
      if (req.type !== "pick" || !req.intent.startsWith("surveil")) return undefined;
      seen = namesIn(cur, req.options as string[]) as string[];
      return req.options;
    });
    expect(seen).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.objects[doll]?.tapped).toBe(true);
    expect(canActivate(s, "p1", doll)).toBe(false);
  });
});

describe("Wreck Remover (lot K8)", () => {
  it("on arrival: exiles up to one targeted card from a graveyard, and you gain 1 life", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Wreck Remover"] }, p2: { graveyard: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "graveyard", "Serra Angel");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Wreck Remover") });
    for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values: p.request.type === "pick" && p.request.options.includes(angel) ? [angel] : p.request.suggested,
        });
      else break;
    }
    expect(s.players.p2?.graveyard).toHaveLength(0);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Serra Angel")).toBe(true);
    expect(s.players.p1?.life).toBe(21);
  });
});

describe("Aetherdrift: approximations lifted (lot A1)", () => {
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const artifact = (name: string, mv: number) =>
    customCard({
      name,
      typeLine: "Artifact",
      types: ["Artifact"],
      manaCost: { generic: mv, colored: {}, x: 0 },
      manaCostText: `{${mv}}`,
    });

  it("Webstrike Elite: only an artifact or enchantment with mana value X can be targeted", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Webstrike Elite"], library: lands("Island", 3) },
      p2: { battlefield: [artifact("Rouage", 3), artifact("Engrenage", 2)] },
    });
    const elite = idOf(s, "p1", "hand", "Webstrike Elite");
    const cog = idOf(s, "p2", "battlefield", "Rouage");
    const gear = idOf(s, "p2", "battlefield", "Engrenage");
    let offered: string[] = [];
    s = settle(activate(s, "p1", elite, "Cycling", { x: 2 }), (req) => {
      if (req.type !== "pick" || !req.options.includes(gear)) return undefined;
      offered = req.options.map(String);
      return [gear];
    });
    expect(offered).toEqual([gear]);
    expect(offered).not.toContain(cog);
    expect(idsOf(s, "p2", "graveyard", "Engrenage")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Rouage")).toHaveLength(1);
  });

  it("Caradora: the extra +1/+1 counter applies to your creatures and your Vehicles, not to your other permanents", async () => {
    const { changeCounters } = await import("../src/state");
    const s = scenario({ p1: { battlefield: ["Caradora, Heart of Alacria", "Spotcycle Scouter", artifact("Rouage", 1)] } });
    const vehicle = s.objects[idOf(s, "p1", "battlefield", "Spotcycle Scouter")];
    const cog = s.objects[idOf(s, "p1", "battlefield", "Rouage")];
    if (!vehicle || !cog) throw new Error("permanents introuvables");
    expect(chars(s, vehicle.id).types).not.toContain("Creature");
    changeCounters(s, vehicle, "+1/+1", 1);
    changeCounters(s, cog, "+1/+1", 1);
    expect(vehicle.counters["+1/+1"]).toBe(2);
    expect(cog.counters["+1/+1"]).toBe(1);
  });
});

describe("Aetherdrift: delayed abilities tied to an object (PLAN-A, lot A4b)", () => {
  it("Grim Javelineer: +1/+0 to an attacker; when it dies this turn, surveil 1, even if it lost its abilities", () => {
    let s = scenario({ p1: { battlefield: ["Grim Javelineer", "Bear Cub"], library: lands("Swamp", 3) } });
    const javelineer = idOf(s, "p1", "battlefield", "Grim Javelineer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [javelineer, bear]);
    s = settleNoBlocks(s, picking([bear]));
    expect(chars(s, bear).power).toBe(3);
    // The delayed ability isn't an ability of the creature: it loses all its abilities, then dies.
    s.effects.push({ id: "e-lose", timestamp: 999, affected: [bear], duration: "endOfTurn", loseAllAbilities: true });
    bump(s);
    expect(chars(s, bear).abilities).toHaveLength(0);
    destroy(s, bear);
    expect(s.triggers.map((t) => s.defs[t.sourceDefId]?.name)).toEqual(["Grim Javelineer"]);
    expect(s.triggers[0]?.controller).toBe("p1");
  });

  it("Grim Javelineer: the creature that dies on the following turn triggers nothing", () => {
    let s = scenario({ p1: { battlefield: ["Grim Javelineer", "Bear Cub"], library: lands("Swamp", 3) } });
    const javelineer = idOf(s, "p1", "battlefield", "Grim Javelineer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = attack(s, [javelineer, bear]);
    s = settleNoBlocks(s, picking([bear]));
    expect(s.delayed).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.delayed).toHaveLength(0);
    destroy(s, bear);
    expect(s.triggers).toHaveLength(0);
  });
});

describe("attacked player in multiplayer (PLAN-H, lot H5)", () => {
  it("Oviya: trample for any creature attacking one of your opponents, not for those attacking you nor for a planeswalker", () => {
    let s = scenario({
      players: 3,
      active: "p2",
      p1: { battlefield: ["Oviya, Automech Artisan"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves", "Savannah Lions"] },
      p3: { battlefield: ["Ajani Resolute"] },
    });
    const [bear, elves, lions] = ["Bear Cub", "Llanowar Elves", "Savannah Lions"].map((n) => idOf(s, "p2", "battlefield", n));
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p2", {
      type: "declareAttackers",
      attackers: [
        { id: bear as string, defender: "p3" },
        { id: elves as string, defender: "p1" },
        { id: lions as string, defender: walker },
      ],
    });
    expect([bear, elves, lions].map((id) => chars(s, id as string).keywords.includes("trample"))).toEqual([true, false, false]);
  });
});

describe("attacked player (PLAN-H, lot H5)", () => {
  it("Sabotage Strategist: 'attacking you' — nothing for creatures attacking your planeswalkers", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Sabotage Strategist", "Ajani Resolute"] },
    });
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    const [bear, elves] = ["Bear Cub", "Llanowar Elves"].map((n) => idOf(s, "p1", "battlefield", n) as string);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: bear as string, defender: walker },
        { id: elves as string, defender: "p2" },
      ],
    });
    s = settle(s);
    expect([chars(s, bear as string).power, chars(s, elves as string).power]).toEqual([2, 0]);
  });
});

describe("chosen card name: public information only", () => {
  it("Skyseer's Chariot: the opposing hand shows neither in the order of names nor in the suggestion", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Skyseer's Chariot"] },
      p2: { battlefield: ["Engine Rat"], hand: ["Shock"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Skyseer's Chariot") } as never);
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    if (p?.kind !== "choice" || p.request.type !== "name") throw new Error("no name choice");
    // The opposing (public) permanent first; Shock, in the opposing hand, is neither offered nor suggested.
    expect(p.request.of).toBe("card");
    expect(p.request.featured[0]).toBe("Engine Rat");
    expect(p.request.suggested).toEqual(["Engine Rat"]);
    expect(p.request.featured).not.toContain("Shock");
  });
});
