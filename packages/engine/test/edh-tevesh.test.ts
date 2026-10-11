/**
 * Commander (EDH pseudo-set): rules tests for the "Tevesh Szat + Jeska" deck (Tevesh Szat, Doom of Fools and Jeska,
 * Thrice Reborn). Demons, reanimation (Animate Dead, Dread Return, Soul Exchange), removal and utility lands.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
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
  picking,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
  untilCastNow,
} from "./helpers";

const handNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const graveyardNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const battlefieldNames = (s: GameState, p: PlayerId) =>
  namesIn(
    s,
    s.battlefield.filter((id) => s.objects[id]?.controller === p),
  ).sort();
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
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
const castCommander = (s: GameState, p: PlayerId, name: string, extra: object = {}) => {
  const id = (s.players[p]?.command ?? []).find((x) => nameOf(s, x) === name) ?? "";
  return act(s, p, { type: "cast", card: id, ...extra } as never);
};
/** Answers the pick of a mode or of an option ("0", "1"…) by rank. */
const rank = (n: number) => (req: ChoiceRequest) =>
  req.type === "pick" && req.options.includes(String(n)) && req.options.includes("0") ? [String(n)] : undefined;
const BLACK_VANILLA = customCard({ name: "Test Shade", power: 1, toughness: 1, colors: ["B"] });
const THRULL = customCard({ name: "Test Thrull", subtypes: ["Thrull"], power: 0, toughness: 1, colors: ["B"] });

describe("Tevesh Szat & Jeska (EDH)", () => {
  describe("Demons", () => {
    it("Abyssal Persecutor: your opponents can't lose the game (at 0 life or less, they stay)", () => {
      let s = scenario({
        p1: { battlefield: ["Abyssal Persecutor", ...lands("Swamp", 2)], hand: ["Sign in Blood"] },
        p2: { life: 2 },
      });
      s = settle(castIt(s, "p1", "Sign in Blood", { targets: { p: ["p2"] } }));
      expect(s.players.p2?.life).toBe(0);
      expect(s.players.p2?.lost).toBeFalsy();
      expect(s.players.p2?.hand).toHaveLength(2);
    });

    it("Bloodthirster: combat damage to a player untaps it and adds a combat phase; not the same player twice", () => {
      let s = scenario({ p1: { battlefield: ["Bloodthirster"] } });
      const b = idOf(s, "p1", "battlefield", "Bloodthirster");
      s = settleNoBlocks(attack(s, [b]));
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.step === "main2");
      expect(s.players.p2?.life).toBe(14);
      expect(s.objects[b]?.tapped).toBe(false);
      // The additional combat: Bloodthirster can't attack p2 again.
      expect(s.pending?.kind).toBe("declareAttackers");
      expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: b, defender: "p2" }] })).toThrow();
    });

    it("Demon of Death's Gate: pay 6 life and sacrifice three black creatures rather than its mana cost", () => {
      let s = scenario({
        p1: { battlefield: [BLACK_VANILLA, BLACK_VANILLA, BLACK_VANILLA, "Bear Cub"], hand: ["Demon of Death's Gate"] },
      });
      const offer = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Demon of Death's Gate");
      expect(offer).toBeDefined();
      s = settle(castIt(s, "p1", "Demon of Death's Gate", { alternative: true }));
      expect(battlefieldNames(s, "p1")).toEqual(["Bear Cub", "Demon of Death's Gate"]);
      expect(s.players.p1?.life).toBe(14);
      // Two black creatures only (the Bear Cub is green): no alternative cost.
      const t = scenario({ p1: { battlefield: [BLACK_VANILLA, BLACK_VANILLA, "Bear Cub"], hand: ["Demon of Death's Gate"] } });
      expect(legalActions(t, "p1").some((a) => a.type === "cast")).toBe(false);
    });

    it("Demon of Death's Gate: the player chooses the three sacrificed black creatures (PLAN-M M6)", () => {
      let s = scenario({
        p1: { battlefield: [BLACK_VANILLA, BLACK_VANILLA, BLACK_VANILLA, "Zulaport Cutthroat"], hand: ["Demon of Death's Gate"] },
      });
      const shades = s.battlefield.filter((id) => nameOf(s, id) === "Test Shade");
      const zulaport = idOf(s, "p1", "battlefield", "Zulaport Cutthroat");
      const offer = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Demon of Death's Gate");
      const pick = offer?.type === "cast" ? offer.picks?.find((p) => p.slot === "altSacrifice") : undefined;
      expect(pick?.suggested).toEqual(shades);
      // Two shades and the Cutthroat: one shade stays.
      const chosen = [shades[1] as string, shades[2] as string, zulaport];
      s = settle(castIt(s, "p1", "Demon of Death's Gate", { alternative: true, picks: { altSacrifice: chosen } }));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p1")).toContain(shades[0]);
      expect(battlefieldNames(s, "p1")).toEqual(["Demon of Death's Gate", "Test Shade"]);
      // Two objects for three: refused.
      const t = scenario({
        p1: { battlefield: [BLACK_VANILLA, BLACK_VANILLA, BLACK_VANILLA], hand: ["Demon of Death's Gate"] },
      });
      const two = t.battlefield.slice(0, 2);
      expect(() => castIt(t, "p1", "Demon of Death's Gate", { alternative: true, picks: { altSacrifice: two } })).toThrow();
    });

    it("Herald of Slaanesh: Demon spells cost {2} less; other Demons you control have haste", () => {
      let s = scenario({
        p1: { battlefield: ["Herald of Slaanesh", ...lands("Swamp", 2)], hand: ["Abyssal Persecutor"] },
      });
      s = settle(castIt(s, "p1", "Abyssal Persecutor"));
      const p = idOf(s, "p1", "battlefield", "Abyssal Persecutor");
      expect(chars(s, p).keywords).toContain("haste");
      expect(chars(s, idOf(s, "p1", "battlefield", "Herald of Slaanesh")).keywords).not.toContain("haste");
    });

    it("Kardur: opposing creatures must attack a player other than you; an attacking creature dies: drain 1", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Mountain", 2)], hand: ["Kardur, Doomscourge"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Kardur, Doomscourge"));
      // p2's turn: the Bear Cub attacks p3 (not p1).
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [] })).toThrow();
      expect(() => act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] })).toThrow();
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p3" }] });
      expect(s.combat?.attackers.map((a) => a.defender)).toEqual(["p3"]);
    });

    it("Kardur: whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Kardur, Doomscourge", "Bear Cub"] },
        p2: { battlefield: ["Abyssal Persecutor"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Abyssal Persecutor"), attacker: bear }],
      } as never);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Orcus: each other creature gets -X/-X and you lose X life", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 3), "Bear Cub"], hand: ["Orcus, Prince of Undeath"] },
        p2: { battlefield: ["Abyssal Persecutor"] },
      });
      s = settle(castIt(s, "p1", "Orcus, Prince of Undeath", { x: 2 }), rank(0));
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(chars(s, idOf(s, "p2", "battlefield", "Abyssal Persecutor")).power).toBe(4);
      expect(chars(s, idOf(s, "p1", "battlefield", "Orcus, Prince of Undeath")).power).toBe(5);
      expect(s.players.p1?.life).toBe(18);
    });

    it("Orcus: up to X creature cards with total mana value X or less return, with haste", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 4), ...lands("Mountain", 3)],
          hand: ["Orcus, Prince of Undeath"],
          graveyard: ["Bear Cub", "Savannah Lions", "Abyssal Persecutor"],
        },
      });
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const lions = idOf(s, "p1", "graveyard", "Savannah Lions");
      const persecutor = idOf(s, "p1", "graveyard", "Abyssal Persecutor");
      s = castIt(s, "p1", "Orcus, Prince of Undeath", { x: 3 });
      // Bear Cub and Savannah Lions (total 3); the Persecutor (4) would exceed X.
      s = settle(s, (req) => {
        if (req.intent === "triggerMode") return ["1"];
        if (req.type === "pick" && req.options.includes(bear)) return [bear, lions];
        return undefined;
      });
      expect(s.players.p1?.graveyard).toEqual([persecutor]);
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, back).keywords).toContain("haste");
      expect(battlefieldNames(s, "p1")).toContain("Savannah Lions");
    });

    it("Rakdos, the Showstopper: a coin for each creature that isn't a Demon, Devil, or Imp; tails are destroyed", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), ...lands("Mountain", 3), "Abyssal Persecutor"],
          hand: ["Rakdos, the Showstopper"],
        },
        p2: { battlefield: Array(8).fill("Bear Cub") },
      });
      s = settle(castIt(s, "p1", "Rakdos, the Showstopper"));
      const bears = s.battlefield.filter((id) => nameOf(s, id) === "Bear Cub").length;
      // Seeded chance: some coins came up tails, not all (8 coins).
      expect(bears).toBeGreaterThan(0);
      expect(bears).toBeLessThan(8);
      expect(battlefieldNames(s, "p1")).toContain("Abyssal Persecutor");
    });

    it("Reaper from the Abyss: at each end step, if a creature died this turn, destroy target non-Demon creature", () => {
      let s = scenario({
        p1: { battlefield: ["Reaper from the Abyss", "Mountain"], hand: ["Lightning Bolt"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions", "Abyssal Persecutor"] },
      });
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      let offered: (string | undefined)[] = [];
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2", 200);
      s = scenario({
        p1: { battlefield: ["Reaper from the Abyss", "Mountain"], hand: ["Lightning Bolt"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions", "Abyssal Persecutor"] },
      });
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      const lions2 = idOf(s, "p2", "battlefield", "Savannah Lions");
      for (let i = 0; i < 100 && s.turn.active === "p1"; i++) {
        const p = s.pending;
        if (p?.kind === "choice" && p.request.type === "pick") {
          offered = namesIn(s, p.request.options.map(String));
          s = act(s, p.player, { type: "choose", values: [lions2] });
        } else s = advanceUntil(s, (x) => x.pending?.kind === "choice" || x.turn.active !== "p1", 1);
      }
      expect(lions).toBeDefined();
      expect(offered).not.toContain("Abyssal Persecutor");
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub", "Savannah Lions"]);
    });

    it("Shadowborn Demon: destroys a non-Demon creature; at upkeep, fewer than six creature cards: sacrifice", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Shadowborn Demon"] },
        p2: { battlefield: ["Bear Cub", "Abyssal Persecutor"] },
      });
      s = settle(castIt(s, "p1", "Shadowborn Demon"), picking([idOf(s, "p2", "battlefield", "Bear Cub")]));
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(graveyardNames(s, "p1")).toEqual(["Shadowborn Demon"]);
      // Six creature cards in the graveyard: no sacrifice.
      let t = scenario({
        p1: { battlefield: ["Shadowborn Demon"], graveyard: Array(6).fill("Bear Cub") },
        active: "p2",
      });
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(battlefieldNames(t, "p1")).toEqual(["Shadowborn Demon"]);
    });

    it("Shadowgrange Archfiend: each opponent sacrifices their greatest-power creature; gain the greatest power", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Swamp", 7), hand: ["Shadowgrange Archfiend"] },
        p2: { battlefield: ["Bear Cub", "Abyssal Persecutor"] },
        p3: { battlefield: ["Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Shadowgrange Archfiend"));
      expect(graveyardNames(s, "p2")).toEqual(["Abyssal Persecutor"]);
      expect(graveyardNames(s, "p3")).toEqual(["Savannah Lions"]);
      expect(s.players.p1?.life).toBe(26);
    });

    it("Falthis, Shadowcat Familiar: commanders you control have menace and deathtouch", () => {
      let s = scenario({
        p1: {
          battlefield: ["Falthis, Shadowcat Familiar", ...lands("Swamp", 2), ...lands("Mountain", 2), ...lands("Plains", 2)],
          command: ["Edgar Markov"],
        },
      });
      s = settle(castCommander(s, "p1", "Edgar Markov"));
      const rakdos = idOf(s, "p1", "battlefield", "Edgar Markov");
      expect(chars(s, rakdos).keywords).toEqual(expect.arrayContaining(["menace", "deathtouch"]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Falthis, Shadowcat Familiar")).keywords).not.toContain("menace");
    });
  });

  describe("Jeska, Thrice Reborn", () => {
    it("enters with a loyalty counter for each time you've cast a commander from the command zone", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), command: ["Jeska, Thrice Reborn"] },
      });
      s = settle(castCommander(s, "p1", "Jeska, Thrice Reborn"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Jeska, Thrice Reborn")]?.counters.loyalty).toBe(1);
    });

    it("0: until your next turn, the creature deals triple combat damage to your opponents", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Jeska, Thrice Reborn", counters: { loyalty: 2 } }, "Bear Cub"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Jeska, Thrice Reborn"), { targets: { t: [bear] } }));
      s = throughCombat(attack(s, [bear]));
      expect(s.players.p2?.life).toBe(14);
    });

    it("−X: X damage to each of up to three targets", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Jeska, Thrice Reborn", counters: { loyalty: 3 } }] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      const jeska = idOf(s, "p1", "battlefield", "Jeska, Thrice Reborn");
      const targets = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Savannah Lions"), "p2"];
      s = settle(activate(s, "p1", jeska, { x: 2, targets: { t: targets } }, 1));
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub", "Savannah Lions"]);
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[jeska]?.counters.loyalty).toBe(1);
    });
  });

  describe("reanimation", () => {
    it("Animate Dead: a creature card from a graveyard returns under your control, enchanted (-1/-0)", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Animate Dead"] },
        p2: { graveyard: ["Abyssal Persecutor"] },
      });
      const card = idOf(s, "p2", "graveyard", "Abyssal Persecutor");
      s = settle(castIt(s, "p1", "Animate Dead", { targets: { enchant: [card] } }));
      const back = idOf(s, "p1", "battlefield", "Abyssal Persecutor");
      expect(s.objects[back]?.controller).toBe("p1");
      expect(chars(s, back).power).toBe(5);
      const aura = idOf(s, "p1", "battlefield", "Animate Dead");
      expect(s.objects[aura]?.attachedTo).toBe(back);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Animate Dead: when it leaves the battlefield, the creature's controller sacrifices it", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Animate Dead"], graveyard: ["Bear Cub"] },
        p2: { battlefield: lands("Plains", 2), hand: ["Disenchant"] },
      });
      s = settle(castIt(s, "p1", "Animate Dead", { targets: { enchant: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      const aura = idOf(s, "p1", "battlefield", "Animate Dead");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(castIt(s, "p2", "Disenchant", { targets: { t: [aura] } }));
      expect(graveyardNames(s, "p1")).toEqual(["Animate Dead", "Bear Cub"]);
    });

    it("Dread Return: returns a creature card; flashback by sacrificing three creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Savannah Lions", "Zulaport Cutthroat"],
          graveyard: ["Dread Return", "Abyssal Persecutor"],
        },
      });
      const dr = idOf(s, "p1", "graveyard", "Dread Return");
      const offer = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === dr);
      expect(offer).toBeDefined();
      const creatures = s.battlefield.filter((id) => s.objects[id]?.controller === "p1");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: dr,
          targets: { t: [idOf(s, "p1", "graveyard", "Abyssal Persecutor")] },
          sacrifice: creatures,
        } as never),
      );
      expect(battlefieldNames(s, "p1")).toEqual(["Abyssal Persecutor"]);
      expect(namesIn(s, s.exile)).toContain("Dread Return");
    });

    it("Soul Exchange: exile a creature you control as an additional cost; +2/+2 counter if it was a Thrull", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), THRULL], hand: ["Soul Exchange"], graveyard: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Soul Exchange", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.counters["+2/+2"]).toBe(1);
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 4]);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 2), "Savannah Lions"], hand: ["Soul Exchange"], graveyard: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "Soul Exchange", { targets: { t: [idOf(t, "p1", "graveyard", "Bear Cub")] } }));
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).power).toBe(2);
      expect(namesIn(t, t.exile)).toEqual(["Savannah Lions"]);
    });

    it("Buried Alive: up to three creature cards from your library into your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 3),
          hand: ["Buried Alive"],
          library: ["Bear Cub", "Forest", "Savannah Lions", "Abyssal Persecutor", "Forest"],
        },
      });
      s = settle(castIt(s, "p1", "Buried Alive"), (req) => (req.type === "pick" ? req.options.slice(0, 3) : undefined));
      expect(graveyardNames(s, "p1")).toEqual(["Abyssal Persecutor", "Bear Cub", "Buried Alive", "Savannah Lions"]);
    });

    it("Volrath's Stronghold: a creature card from your graveyard on top of your library", () => {
      let s = scenario({
        p1: { battlefield: ["Volrath's Stronghold", "Swamp", "Swamp"], graveyard: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "graveyard", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Volrath's Stronghold"), { targets: { t: [card] } }));
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Bear Cub");
    });
  });

  describe("spells", () => {
    it("Chaos Warp: the permanent is shuffled into its owner's library, whose top card enters if it's a permanent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3)], hand: ["Chaos Warp"] },
        p2: { battlefield: ["Abyssal Persecutor"], library: lands("Forest", 5) },
      });
      s = settle(castIt(s, "p1", "Chaos Warp", { targets: { t: [idOf(s, "p2", "battlefield", "Abyssal Persecutor")] } }));
      expect(battlefieldNames(s, "p2")).not.toContain("Abyssal Persecutor");
      expect(s.players.p2?.library).toHaveLength(5);
      // The top card (a Forest or the Persecutor) entered under its owner's control.
      expect(battlefieldNames(s, "p2")).toHaveLength(1);
    });

    it("Hellfire: destroys all nonblack creatures, then deals 3 + that many damage to you", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub", "Abyssal Persecutor"], hand: ["Hellfire"] },
        p2: { battlefield: ["Savannah Lions", "Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Hellfire"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature")).map((id) => nameOf(s, id))).toEqual([
        "Abyssal Persecutor",
      ]);
      expect(s.players.p1?.life).toBe(14);
    });

    it("Kindred Dominance: destroys all creatures that aren't of the chosen type", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 7), "Abyssal Persecutor", "Bear Cub"], hand: ["Kindred Dominance"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Kindred Dominance"), (req, _p, cur) =>
        req.type === "name" ? picking(["Demon"])(req, undefined, cur) : undefined,
      );
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature")).map((id) => nameOf(s, id))).toEqual([
        "Abyssal Persecutor",
      ]);
    });

    it("Promise of Power entwined: draw five, lose 5 life, then an X/X flying Demon (X = cards in hand)", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 9), hand: ["Promise of Power"] } });
      s = settle(castIt(s, "p1", "Promise of Power", { mode: 2 }));
      expect(s.players.p1?.hand).toHaveLength(5);
      expect(s.players.p1?.life).toBe(15);
      const demon = tokensNamed(s, "p1", "Demon")[0] ?? "";
      expect([chars(s, demon).power, chars(s, demon).toughness]).toEqual([5, 5]);
      expect(chars(s, demon).keywords).toContain("flying");
    });

    it("Seize the Spotlight: fame, gain control of a creature (untapped, haste); fortune, a card and a Treasure", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Mountain", 3), hand: ["Seize the Spotlight"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
        p3: { battlefield: ["Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Seize the Spotlight"), (req, p) => rank(p === "p2" ? 0 : 1)(req));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(false);
      expect(chars(s, bear).keywords).toContain("haste");
      expect(tokensNamed(s, "p1", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Stinging Study: X is the mana value of a commander you own on the battlefield or in the command zone", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Stinging Study"], command: ["Tevesh Szat, Doom of Fools"] },
      });
      // Tevesh Szat, Doom of Fools: mana value 5.
      s = settle(castIt(s, "p1", "Stinging Study"));
      expect(s.players.p1?.hand).toHaveLength(5);
      expect(s.players.p1?.life).toBe(15);
    });

    it("Temur Battle Rage: double strike; trample too with ferocious", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Mountain", "Bear Cub", "Abyssal Persecutor"], hand: ["Temur Battle Rage"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Temur Battle Rage", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["doubleStrike", "trample"]));
    });

    it("Tibalt's Trickery: counters the spell; its controller mills 1 to 3, then may cast a nonland card of another name", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Tibalt's Trickery"] },
        p2: {
          battlefield: lands("Swamp", 2),
          hand: ["Sign in Blood"],
          library: ["Forest", "Forest", "Forest", "Sign in Blood", "Forest", "Bear Cub", "Forest", "Forest"],
        },
        active: "p2",
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", "Sign in Blood"),
        targets: { p: ["p2"] },
      } as never);
      s = act(s, "p2", { type: "pass" });
      const spell = s.stack[0]?.id ?? "";
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tibalt's Trickery"), targets: { t: [spell] } } as never);
      const declined = settle(s);
      // Milled 2 Forests (seeded roll), then exiled down to the Bear Cub (not the other Sign in Blood), not cast: all on
      // the bottom, in a random order.
      expect(graveyardNames(declined, "p2")).toEqual(["Forest", "Forest", "Sign in Blood"]);
      expect(declined.players.p2?.life).toBe(20);
      expect(namesIn(declined, declined.players.p2?.library.slice(0, 2))).toEqual(["Forest", "Forest"]);
      expect(namesIn(declined, declined.players.p2?.library.slice(-4)).sort()).toEqual([
        "Bear Cub",
        "Forest",
        "Forest",
        "Sign in Blood",
      ]);
      // The spell's controller may cast it without paying its mana cost.
      s = untilCastNow(s);
      expect(s.pending?.player).toBe("p2");
      const bear = castNowOf(s)?.cards[0] ?? "";
      expect(nameOf(s, bear)).toBe("Bear Cub");
      s = settle(act(s, "p2", { type: "cast", card: bear } as never));
      expect(battlefieldNames(s, "p2")).toContain("Bear Cub");
    });

    it("Vandalblast: an artifact you don't control; overload: each of them", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), "Sol Ring"], hand: ["Vandalblast"] },
        p2: { battlefield: ["Sol Ring", "Arcane Signet"] },
      });
      s = settle(castIt(s, "p1", "Vandalblast", { mode: 1 }));
      expect(graveyardNames(s, "p2")).toEqual(["Arcane Signet", "Sol Ring"]);
      expect(battlefieldNames(s, "p1")).toContain("Sol Ring");
    });

    it("Night's Whisper, Sign in Blood, Infernal Grasp", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Night's Whisper", "Sign in Blood", "Infernal Grasp"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Night's Whisper"));
      s = settle(castIt(s, "p1", "Sign in Blood", { targets: { p: ["p2"] } }));
      s = settle(castIt(s, "p1", "Infernal Grasp", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(s.players.p1?.life).toBe(16);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub"]);
    });
  });

  describe("permanents", () => {
    it("Anger: in your graveyard, while you control a Mountain, creatures you control have haste", () => {
      const s = scenario({ p1: { battlefield: ["Mountain", "Bear Cub"], graveyard: ["Anger"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
      const t = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], graveyard: ["Anger"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
      const u = scenario({ p1: { battlefield: ["Mountain", "Bear Cub"], hand: ["Anger"] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("haste");
    });

    it("Bitter Reunion: discard a card to draw two; sacrifice it: creatures you control gain haste", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Bitter Reunion", "Forest"], library: lands("Swamp", 5) },
      });
      s = settle(castIt(s, "p1", "Bitter Reunion"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(handNames(s, "p1")).toEqual(["Swamp", "Swamp"]);
      let t = scenario({ p1: { battlefield: ["Bitter Reunion", "Mountain", { name: "Bear Cub", sick: true }] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Bitter Reunion")));
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
    });

    it("Rite of Belzenlok: Clerics, then a 6/6 Demon that needs another creature each upkeep", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Rite of Belzenlok"] } });
      s = settle(castIt(s, "p1", "Rite of Belzenlok"));
      expect(tokensNamed(s, "p1", "Cleric")).toHaveLength(2);
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 5));
      expect(tokensNamed(s, "p1", "Cleric")).toHaveLength(4);
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 7));
      const demon = tokensNamed(s, "p1", "Demon")[0] ?? "";
      expect(chars(s, demon).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
      expect(graveyardNames(s, "p1")).toEqual(["Rite of Belzenlok"]);
      // Next upkeep: a Cleric is sacrificed.
      s = settle(advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number === 9));
      expect(tokensNamed(s, "p1", "Cleric")).toHaveLength(3);
    });

    it("Maze of Ith: untaps an attacking creature; no combat damage to or by it", () => {
      let s = scenario({
        p1: { battlefield: ["Abyssal Persecutor"] },
        p2: { battlefield: ["Maze of Ith"] },
      });
      const persecutor = idOf(s, "p1", "battlefield", "Abyssal Persecutor");
      s = attack(s, [persecutor]);
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p2");
      s = settle(activate(s, "p2", idOf(s, "p2", "battlefield", "Maze of Ith"), { targets: { t: [persecutor] } }));
      expect(s.objects[persecutor]?.tapped).toBe(false);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(20);
    });

    it("Wasteland: destroys a nonbasic land, not a basic one", () => {
      let s = scenario({
        p1: { battlefield: ["Wasteland"] },
        p2: { battlefield: ["Command Tower", "Forest"] },
      });
      const waste = idOf(s, "p1", "battlefield", "Wasteland");
      expect(activations(s, "p1", waste)).toHaveLength(1);
      expect(() => activate(s, "p1", waste, { targets: { t: [idOf(s, "p2", "battlefield", "Forest")] } })).toThrow();
      s = settle(activate(s, "p1", waste, { targets: { t: [idOf(s, "p2", "battlefield", "Command Tower")] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Command Tower"]);
    });

    it("Westvale Abbey: Clerics for {5} and 1 life; sacrifice five creatures: Ormendahl, untapped", () => {
      const ABBEY = "Westvale Abbey // Ormendahl, Profane Prince";
      let s = scenario({ p1: { battlefield: [ABBEY, ...lands("Swamp", 5), ...Array(5).fill("Bear Cub")] } });
      const abbey = idOf(s, "p1", "battlefield", ABBEY);
      s = settle(activate(s, "p1", abbey));
      expect(tokensNamed(s, "p1", "Human Cleric")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
      let t = scenario({ p1: { battlefield: [ABBEY, ...lands("Swamp", 5), ...Array(5).fill("Bear Cub")] } });
      const abbey2 = idOf(t, "p1", "battlefield", ABBEY);
      t = settle(activate(t, "p1", abbey2, {}, 1));
      expect(nameOf(t, abbey2)).toBeDefined();
      const c = chars(t, abbey2);
      expect(c.name).toBe("Ormendahl, Profane Prince");
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "lifelink", "indestructible", "haste"]));
      expect(t.objects[abbey2]?.tapped).toBe(false);
      expect(graveyardNames(t, "p1")).toHaveLength(5);
    });

    it("Tainted Peak: {C}, or {B} or {R} while you control a Swamp", () => {
      const s = scenario({ p1: { battlefield: ["Tainted Peak", "Swamp"] } });
      const peak = idOf(s, "p1", "battlefield", "Tainted Peak");
      expect(s.defs[s.objects[peak]?.defId ?? ""]?.abilities.filter((a) => a.kind === "mana")).toHaveLength(2);
    });
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it("Stinging Study: with two commanders, you choose the one whose mana value is X (suggested: the greatest)", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 5),
        hand: ["Stinging Study"],
        command: ["Tevesh Szat, Doom of Fools", "Jeska, Thrice Reborn"],
        library: lands("Swamp", 8),
      },
    });
    const jeska = s.players.p1?.command.find((id) => nameOf(s, id) === "Jeska, Thrice Reborn") as string;
    let suggested: string[] = [];
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stinging Study") }), (req, _p, st) => {
      if (req.type !== "pick") return undefined;
      suggested = namesIn(st, req.suggested.map(String)) as string[];
      return [jeska];
    });
    expect(suggested).toEqual(["Tevesh Szat, Doom of Fools"]);
    // Jeska, Thrice Reborn: mana value 3.
    expect(s.players.p1?.hand).toHaveLength(3);
    expect(s.players.p1?.life).toBe(17);
  });
});
