/**
 * Commander (EDH pseudo-set): rules tests for the "Counter Blitz" preconstructed deck (Final Fantasy X). Counters
 * moved and proliferated, multikicker, prevention changed into counters, creature Sagas, oaths, returning with flying.
 */

import { describe, expect, it } from "vitest";
import { activated, fx, ref, target } from "../src/dsl";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { availableMana } from "../src/mana";
import type { GameState, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  castable,
  customCard,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const hand = (s: GameState, p: PlayerId) => s.players[p]?.hand.length ?? 0;
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const plusOne = (s: GameState, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const yes = (req: { type: string }) => (req.type === "yesNo" ? [1] : undefined);

describe("Counter Blitz (EDH)", () => {
  describe("commandant", () => {
    it("Tidus: at the beginning of combat, a counter moves from one of your creatures to another", () => {
      let s = scenario({
        p1: { battlefield: ["Tidus, Yuna's Guardian", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0), 50);
      // The creature with a counter is the only possible source; the destination is chosen.
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : picking([lions])(req)));
      expect([plusOne(s, bear), plusOne(s, lions)]).toEqual([1, 1]);
    });

    it("Tidus, encouragement: your creatures with counters damage a player: draw and proliferate, once per turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tidus, Yuna's Guardian", { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          library: lands("Island", 5),
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const h = hand(s, "p1");
      // At the beginning of combat, the counter is not moved.
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice", 50);
      s = settle(s, (req) => (req.type === "yesNo" ? [0] : undefined));
      s = throughCombat(attack(s, [bear]), (req) =>
        req.type === "yesNo" ? [1] : req.type === "pick" && req.intent === "proliferate" ? req.options : undefined,
      );
      expect(hand(s, "p1")).toBe(h + 1);
      expect(plusOne(s, bear)).toBe(2);
    });
  });

  describe("marqueurs", () => {
    it("Everflowing Chalice: multikicker paid twice, two charge counters, {C}{C}", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Everflowing Chalice"] } });
      s = settle(castIt(s, "p1", "Everflowing Chalice", { x: 2 }));
      const chalice = idOf(s, "p1", "battlefield", "Everflowing Chalice");
      expect(s.objects[chalice]?.counters.charge).toBe(2);
    });

    it("Gatta and Luzzu: damage to the chosen creature becomes +1/+1 counters this turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Mountain", "Bear Cub"], hand: ["Gatta and Luzzu", "Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Gatta and Luzzu"), picking([bear]));
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [bear] } }));
      expect([s.objects[bear]?.damage, plusOne(s, bear)]).toEqual([0, 2]);
    });

    it("Fathom Mage: evolve, then a +1/+1 counter draws a card", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Fathom Mage"], hand: ["Bear Cub"], library: lands("Island", 3) },
      });
      const h = hand(s, "p1");
      s = settle(castIt(s, "p1", "Bear Cub"), yes);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Fathom Mage"))).toBe(1);
      expect(hand(s, "p1")).toBe(h - 1 + 1);
    });

    it("Gyre Sage: {G} per +1/+1 counter", () => {
      const s = scenario({ p1: { battlefield: [{ name: "Gyre Sage", counters: { "+1/+1": 3 } }] } });
      const sage = idOf(s, "p1", "battlefield", "Gyre Sage");
      expect(chars(s, sage).abilities.some((a) => a.kind === "mana")).toBe(true);
      // Three +1/+1 counters: three mana.
      expect(availableMana(s, "p1")).toBe(3);
    });

    it("Bane of Progress: destroys artifacts and enchantments, one counter per permanent destroyed", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 6), hand: ["Bane of Progress"] },
        p2: { battlefield: ["Sol Ring", "Arcane Signet", "Propaganda"] },
      });
      s = settle(castIt(s, "p1", "Bane of Progress"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bane of Progress"))).toBe(3);
      expect(onField(s, "p2", "Sol Ring")).toBe(0);
    });

    it("Damning Verdict: only creatures without a counter are destroyed", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), { name: "Bear Cub", counters: { "+1/+1": 1 } }], hand: ["Damning Verdict"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Damning Verdict"));
      expect([onField(s, "p1", "Bear Cub"), onField(s, "p2", "Serra Angel")]).toEqual([1, 0]);
    });

    it("Sin: its counters go onto one of your creatures when it dies, then it goes to the library", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Plains", 2),
            "Swamp",
            { name: "Sin, Unending Cataclysm", counters: { "+1/+1": 4 } },
            "Bear Cub",
          ],
          hand: ["Vindicate"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const sin = idOf(s, "p1", "battlefield", "Sin, Unending Cataclysm");
      s = settle(castIt(s, "p1", "Vindicate", { targets: { t: [sin] } }), picking([bear]));
      expect(plusOne(s, bear)).toBe(4);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toContain("Sin, Unending Cataclysm");
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).not.toContain("Sin, Unending Cataclysm");
    });
  });

  describe('"on entering" (PLAN-H H9)', () => {
    /** Passes until the named card is on the battlefield (before any triggered ability). */
    const untilOnField = (s: GameState, name: string, answer: Answer = () => undefined) => {
      let cur = s;
      for (let i = 0; i < 50 && onField(cur, "p1", name) === 0; i++) {
        const p = cur.pending;
        if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
        else if (p?.kind === "choice")
          cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
        else break;
      }
      return cur;
    };

    it("Sin: removes all counters from the chosen permanents (both sides) and enters with twice as many +1/+1 counters", () => {
      let s = scenario({
        p1: {
          battlefield: [
            ...lands("Forest", 5),
            ...lands("Island", 2),
            { name: "Bear Cub", counters: { "+1/+1": 2 } },
            { name: "Savannah Lions", counters: { "+1/+1": 1 } },
          ],
          hand: ["Sin, Unending Cataclysm"],
        },
        p2: { battlefield: [{ name: "Serra Angel", counters: { "+1/+1": 1, stun: 1 } }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = castIt(s, "p1", "Sin, Unending Cataclysm");
      s = untilOnField(s, "Sin, Unending Cataclysm", picking([bear, angel]));
      // On entering: 2 + 1 + 1 counters removed, eight +1/+1 counters, already there when it enters.
      const sin = idOf(s, "p1", "battlefield", "Sin, Unending Cataclysm");
      expect(plusOne(s, sin)).toBe(8);
      expect([plusOne(s, bear), plusOne(s, angel), s.objects[angel]?.counters.stun ?? 0, plusOne(s, lions)]).toEqual([
        0, 0, 0, 1,
      ]);
    });

    it("Altered Ego: enters as a copy with X additional +1/+1 counters; put onto the battlefield by an effect, X is 0", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 4), ...lands("Island", 2)], hand: ["Altered Ego"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = castIt(s, "p1", "Altered Ego", { x: 2 });
      s = untilOnField(s, "Altered Ego", picking([angel]));
      const ego = idOf(s, "p1", "battlefield", "Altered Ego");
      expect(chars(s, ego).name).toBe("Serra Angel");
      expect(plusOne(s, ego)).toBe(2);
      let z = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Altered Ego"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel2 = idOf(z, "p2", "battlefield", "Serra Angel");
      z = settle(castIt(z, "p1", "Zombify", { targets: { t: [idOf(z, "p1", "graveyard", "Altered Ego")] } }), picking([angel2]));
      const back = idOf(z, "p1", "battlefield", "Altered Ego");
      expect(chars(z, back).name).toBe("Serra Angel");
      expect(plusOne(z, back)).toBe(0);
    });
  });

  describe("creatures and summons", () => {
    it("Luminous Broodmoth: one of your creatures without flying dies and returns with a flying counter", () => {
      let s = scenario({ p1: { battlefield: ["Luminous Broodmoth", "Bear Cub", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.counters.flying).toBe(1);
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Kimahri: a counter, taps an opposing creature and may become a copy of one (name kept)", () => {
      let s = scenario({ p1: { battlefield: ["Kimahri, Valiant Guardian"] }, p2: { battlefield: ["Serra Angel"] } });
      const k = idOf(s, "p1", "battlefield", "Kimahri, Valiant Guardian");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && (x.pending?.kind === "choice" || x.stack.length > 0), 50);
      s = settle(s, (req) => (req.type === "yesNo" ? [1] : picking([angel])(req)));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(chars(s, k).name).toBe("Kimahri, Valiant Guardian");
      expect([chars(s, k).power, chars(s, k).keywords.includes("flying"), chars(s, k).keywords.includes("vigilance")]).toEqual([
        5,
        true,
        true,
      ]);
    });

    it("Summon: Valefor, chapter I: each opponent returns to hand a creature with greater mana value", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Summon: Valefor"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Summon: Valefor"));
      expect([onField(s, "p2", "Serra Angel"), onField(s, "p2", "Bear Cub")]).toEqual([0, 1]);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id))).toContain("Serra Angel");
    });

    it("Wakka: at your end step, if Wakka got a counter this turn, your other creatures get one", () => {
      let s = scenario({ p1: { battlefield: ["Wakka, Devoted Guardian", "Bear Cub"] } });
      const wakka = idOf(s, "p1", "battlefield", "Wakka, Devoted Guardian");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = throughCombat(attack(s, [wakka]));
      expect(plusOne(s, wakka)).toBe(1);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.pending?.kind === "priority", 100);
      expect(plusOne(s, bear)).toBe(1);
    });
  });

  describe("sorts", () => {
    it("Collective Effort: escalate, two modes for {1} more", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Collective Effort"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Collective Effort");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
      const modes = opt?.type === "cast" ? opt.modes : [];
      const both = modes.find((m) => m.label?.includes("power 4") && m.label.includes("target player"));
      expect(both).toBeDefined();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Collective Effort", { mode: both?.index, targets: { c: [angel], p: ["p1"] } }));
      expect(onField(s, "p2", "Serra Angel")).toBe(0);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Promise of Loyalty: each player keeps one creature, with an oath counter, and sacrifices the others", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub"], hand: ["Promise of Loyalty"] },
        p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Promise of Loyalty"), (req, p) =>
        // The creature kept (the others are sacrificed together).
        p === "p2" && req.type === "pick" ? [angel] : undefined,
      );
      expect([onField(s, "p2", "Serra Angel"), onField(s, "p2", "Savannah Lions")]).toEqual([1, 0]);
      expect(s.objects[angel]?.counters.vow).toBe(1);
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      // Creatures with an oath counter can't attack the caster (nor their planeswalkers).
      expect(chars(s, angel).blockRules.map((r) => r.cantAttackPlayer)).toEqual(["p1"]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === "p2");
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] })).toThrow();
    });

    it("Yuna's Whistle: the first revealed creature goes to hand; X counters, X its mana value", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Bear Cub"],
          hand: ["Yuna's Whistle"],
          library: ["Island", "Serra Angel", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Yuna's Whistle"), picking([bear]));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toContain("Serra Angel");
      expect(plusOne(s, bear)).toBe(5);
    });

    it("Temple of the False God: {C}{C} only with five or more lands", () => {
      const few = scenario({ p1: { battlefield: ["Temple of the False God", ...lands("Plains", 3)], hand: ["Serra Angel"] } });
      expect(castable(few, "p1", idOf(few, "p1", "hand", "Serra Angel"))).toBe(false);
      const many = scenario({ p1: { battlefield: ["Temple of the False God", ...lands("Plains", 4)], hand: ["Serra Angel"] } });
      expect(castable(many, "p1", idOf(many, "p1", "hand", "Serra Angel"))).toBe(true);
    });
  });
});

describe("player attacked in multiplayer (PLAN-H, lot H5)", () => {
  /** p1 attacks: each named creature toward the given defender (player, or "walker": p2's Ajani). */
  const attackWith = (s: GameState, attackers: [string, string][]) => {
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", {
      type: "declareAttackers",
      attackers: attackers.map(([name, d]) => ({
        id: idOf(s, "p1", "battlefield", name),
        defender: d === "walker" ? walker : d,
      })),
    });
  };

  it('Lulu, Stern Guardian: "an opponent attacks you" — not your planeswalkers; the target is a creature attacking you', () => {
    const base = () =>
      scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: ["Lulu, Stern Guardian", "Ajani Resolute"] },
      });
    let s = base();
    s = settle(attackWith(s, [["Bear Cub", "walker"]]));
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters.stun ?? 0).toBe(0);

    s = base();
    const offered: string[][] = [];
    s = settle(
      attackWith(s, [
        ["Bear Cub", "p3"],
        ["Llanowar Elves", "p2"],
      ]),
      (req, _p, cur) => {
        if (req.type === "pick") offered.push(req.options.map((o) => nameOf(cur, String(o)) ?? String(o)));
        return undefined;
      },
    );
    // Only one possible target: chosen without a question; the creature attacking p3 is never offered.
    expect(offered.flat()).not.toContain("Bear Cub");
    expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters.stun).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters.stun ?? 0).toBe(0);
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it('Fathom Mage: two +1/+1 counters put at once, two triggers, each its own "you may draw"', () => {
    const booster = customCard({
      name: "Test Booster",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [activated({ tap: true, targets: [target.creature()], effects: [fx.addCounters(ref.target(), 2)] })],
    });
    let s = scenario({ p1: { battlefield: ["Fathom Mage", booster], library: lands("Island", 3) } });
    const mage = idOf(s, "p1", "battlefield", "Fathom Mage");
    const asked: string[] = [];
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: idOf(s, "p1", "battlefield", "Test Booster"),
        ability: 0,
        targets: { t: [mage] },
      }),
      (req) => {
        if (req.intent !== "may") return undefined;
        asked.push(req.prompt);
        // The first yes, the second no.
        return [asked.length === 1 ? 1 : 0];
      },
    );
    expect(plusOne(s, mage)).toBe(2);
    expect(asked).toHaveLength(2);
    expect(hand(s, "p1")).toBe(1);
  });
});

describe("PLAN-M M9b: approximations lifted", () => {
  it("Yuna, Grand Summoner: the next creature spell cast this turn enters with two more +1/+1 counters, paid with its mana or not", () => {
    let s = scenario({
      p1: { battlefield: ["Yuna, Grand Summoner", ...lands("Forest", 4)], hand: ["Shock", "Bear Cub", "Llanowar Elves"] },
    });
    const yuna = idOf(s, "p1", "battlefield", "Yuna, Grand Summoner");
    // Tapped by hand for {R}: Shock (not a creature spell) doesn't use up the effect.
    s = act(s, "p1", { type: "tapForMana", source: yuna, ability: 0, color: "R" });
    s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    // Bear Cub, paid with the Forests: the next creature spell.
    s = settle(castIt(s, "p1", "Bear Cub"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(2);
    // Only the next one.
    s = settle(castIt(s, "p1", "Llanowar Elves"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(0);
  });

  it("Yuna, Grand Summoner: tapped by the automatic payment of a creature spell, that spell is the next one", () => {
    let s = scenario({ p1: { battlefield: ["Yuna, Grand Summoner", "Forest"], hand: ["Bear Cub"] } });
    s = settle(castIt(s, "p1", "Bear Cub"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Yuna, Grand Summoner")]?.tapped).toBe(true);
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(2);
    // The effect ended with the spell (nothing left for later).
    expect(s.playerEffects.some((e) => e.ability.nextSpell)).toBe(false);
  });

  it("Collective Effort: escalate—tap an untapped creature you control for each mode beyond the first, chosen by the player", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 3), "Bear Cub", "Savannah Lions", "Llanowar Elves"],
        hand: ["Collective Effort"],
      },
      p2: { battlefield: ["Serra Angel", "Resourceful Defense"] },
    });
    const card = idOf(s, "p1", "hand", "Collective Effort");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const defense = idOf(s, "p2", "battlefield", "Resourceful Defense");
    const option = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    // Modes by combination: 0 A, 1 B, 2 A+B, 3 C, 4 A+C, 5 B+C, 6 A+B+C. Without mana, the escalate is a creature.
    const taps = option?.type === "cast" ? (option.picks ?? []).filter((p) => p.slot === "costTap") : [];
    expect(taps.map((p) => [p.count, p.modes])).toEqual([
      [1, [2, 4, 5]],
      [2, [6]],
    ]);
    // A choice for a mode without that cost is refused.
    expect(() =>
      castIt(s, "p1", "Collective Effort", { mode: 0, targets: { c: [angel] }, picks: { costTap: [bear] } }),
    ).toThrow();
    s = settle(
      castIt(s, "p1", "Collective Effort", {
        mode: 6,
        targets: { c: [angel], e: [defense], p: ["p1"] },
        picks: { costTap: [bear, elves] },
      }),
    );
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Resourceful Defense")).toHaveLength(0);
    expect([bear, lions, elves].map((id) => s.objects[id]?.tapped)).toEqual([true, false, true]);
    expect([bear, lions, elves].map((id) => plusOne(s, id))).toEqual([1, 1, 1]);
  });

  it("Collective Effort: with a single untapped creature, the three modes together aren't offered", () => {
    const s = scenario({
      p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Collective Effort"] },
      p2: { battlefield: ["Serra Angel", "Resourceful Defense"] },
    });
    const card = idOf(s, "p1", "hand", "Collective Effort");
    const option = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(option?.type === "cast" && option.modes.map((m) => m.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
