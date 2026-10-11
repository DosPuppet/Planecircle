/**
 * Secrets of Strixhaven (partial set: cards from the meta decks): each handled card is checked against its Oracle
 * text (plan R, lot R7). Prepare (Emeritus of Ideation), Opus (Colorstorm Stallion), Infusion (Moseo), Hardened
 * Academic, flashback (Practiced Offense, Daydream, Flashback), Witherbloom Charm, Professor Dellian Fel, Tablet of
 * Discovery, Dissection Practice and the set's dual lands.
 */

import { describe, expect, it } from "vitest";
import { INCREMENT, INFUSION, OPUS, opusInstead, REPARTEE } from "../../cards/src/sos/common";
import { destroy } from "../src/actions";
import { fx, ref, SACRIFICE_TOKEN_AT_END_STEP, spell, triggered } from "../src/dsl";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { checkCondition } from "../src/triggers";
import type { AbilityDef, CardDef, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  castTargets as cast,
  castNowOf,
  customCard,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  passUntil,
  scenario,
  settle,
  untilCastNow,
} from "./helpers";

type S = GameState;
const castOptions = (s: S, player: string, card: string) =>
  legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

/** Activates the ability of `source` whose label contains `label` (the first if absent). */
const activate = (
  s: S,
  player: string,
  source: string,
  label?: string,
  targets?: Record<string, string[]>,
  extra: object = {},
) => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
  );
  return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
};
describe("Secrets of Strixhaven", () => {
  describe("Prepare: Emeritus of Ideation", () => {
    it("flying and ward {2}; enters prepared: Ancestral Recall is cast from exile (a targeted player draws three cards)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 6)], hand: ["Emeritus of Ideation"], library: lands("Forest", 5) },
      });
      s = settle(cast(s, "p1", "Emeritus of Ideation"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      expect(chars(s, emeritus).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      const recall = exiled(s, "Ancestral Recall");
      expect(recall).toHaveLength(1);
      expect(s.objects[emeritus]?.preparedCopy).toBe(recall[0]);
      s = settle(act(s, "p1", { type: "cast", card: recall[0] as string, targets: { t: ["p1"] } }));
      expect(s.players.p1?.hand).toHaveLength(3);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
      expect(exiled(s, "Ancestral Recall")).toHaveLength(0);
    });

    it("on attacking, exiling eight cards from the graveyard makes it prepared; with seven, nothing", () => {
      const run = (graveyard: number) => {
        let s = scenario({ p1: { battlefield: ["Emeritus of Ideation"], graveyard: lands("Island", graveyard) } });
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: emeritus, defender: "p2" }] });
        s = settle(s, (req) => (req.type === "yesNo" ? [1] : req.type === "pick" ? req.options.slice(0, 8) : undefined));
        return s;
      };
      const s = run(9);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      expect(exiled(s, "Island")).toHaveLength(8);
      expect(exiled(s, "Ancestral Recall")).toHaveLength(1);
      const t = run(7);
      expect(t.players.p1?.graveyard).toHaveLength(7);
      expect(exiled(t, "Ancestral Recall")).toHaveLength(0);
    });
  });

  describe("Opus: Colorstorm Stallion", () => {
    it("each instant or sorcery cast: +1/+1 until end of turn; five or more mana spent: a copy token", () => {
      let s = scenario({
        p1: {
          battlefield: ["Colorstorm Stallion", ...lands("Island", 3), ...lands("Mountain", 3)],
          hand: ["Opt", "Traumatic Critique"],
          library: lands("Forest", 5),
        },
      });
      const stallion = idOf(s, "p1", "battlefield", "Colorstorm Stallion");
      expect(chars(s, stallion).keywords).toEqual(expect.arrayContaining(["ward", "haste"]));
      s = settle(cast(s, "p1", "Opt"));
      expect([chars(s, stallion).power, chars(s, stallion).toughness]).toEqual([4, 4]);
      expect(idsOf(s, "p1", "battlefield", "Colorstorm Stallion")).toHaveLength(1);
      // X = 3: {3}{U}{R}, five mana spent.
      s = settle(cast(s, "p1", "Traumatic Critique", { t: ["p2"] }, { x: 3 }));
      expect(s.players.p2?.life).toBe(17);
      expect([chars(s, stallion).power, chars(s, stallion).toughness]).toEqual([5, 5]);
      const copies = idsOf(s, "p1", "battlefield", "Colorstorm Stallion").filter((id) => id !== stallion);
      expect(copies).toHaveLength(1);
      expect(s.objects[copies[0] as string]?.isToken).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([chars(s, stallion).power, chars(s, stallion).toughness]).toEqual([3, 3]);
    });

    it("a creature spell doesn't trigger Opus", () => {
      let s = scenario({ p1: { battlefield: ["Colorstorm Stallion", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Bear Cub"));
      const stallion = idOf(s, "p1", "battlefield", "Colorstorm Stallion");
      expect(chars(s, stallion).power).toBe(3);
    });
  });

  describe("Infusion: Moseo, Vein's New Dean", () => {
    it("on entering: a 1/1 black and green Pest that gains 1 life when it attacks", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Moseo, Vein's New Dean"] } });
      s = settle(cast(s, "p1", "Moseo, Vein's New Dean"));
      const pest = idOf(s, "p1", "battlefield", "Pest");
      const c = chars(s, pest);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([1, 1, ["B", "G"]]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Moseo, Vein's New Dean")).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: pest, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p1?.life).toBe(21);
    });

    it("at your end step, if you gained X life: a creature card with MV X or less returns from the graveyard", () => {
      const run = (life: "charm" | "practice" | "none") => {
        let s = scenario({
          p1: {
            battlefield: ["Moseo, Vein's New Dean", "Swamp", "Forest"],
            hand: ["Witherbloom Charm", "Dissection Practice"],
            graveyard: ["Serra Angel"],
          },
        });
        if (life === "charm") s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
        if (life === "practice") s = settle(cast(s, "p1", "Dissection Practice", { p: ["p2"], a: [], b: [] }));
        s = advanceUntil(s, (x) => x.turn.active === "p2", 200);
        return s;
      };
      // 5 life gained: the Angel (MV 5) returns.
      expect(idsOf(run("charm"), "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      // 1 life gained: MV 5 > 1, the Angel stays in the graveyard.
      expect(idsOf(run("practice"), "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(run("none"), "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Moseo: mana value checked on targeting (PLAN-D, D4)", () => {
    it("1 life gained: only a card with mana value 1 or less can be targeted", () => {
      let s = scenario({
        p1: {
          battlefield: ["Moseo, Vein's New Dean", "Swamp", "Forest"],
          hand: ["Dissection Practice"],
          graveyard: ["Serra Angel", "Llanowar Elves"],
        },
      });
      s = settle(cast(s, "p1", "Dissection Practice", { p: ["p2"], a: [], b: [] }));
      let options: string[] = [];
      s = advanceUntil(
        s,
        (x) => {
          const p = x.pending;
          if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "triggerTarget")
            options = p.request.options.map((id) => nameOf(x, id) ?? id);
          return x.turn.active === "p2";
        },
        200,
      );
      expect(options).toEqual(["Llanowar Elves"]);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Hardened Academic", () => {
    it("flying and haste; discard a card: lifelink until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Hardened Academic"], hand: ["Opt"] } });
      const academic = idOf(s, "p1", "battlefield", "Hardened Academic");
      expect(chars(s, academic).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      expect(chars(s, academic).keywords).not.toContain("lifelink");
      s = settle(activate(s, "p1", academic, undefined, undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(chars(s, academic).keywords).toContain("lifelink");
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, academic).keywords).not.toContain("lifelink");
    });

    it("cards leave your graveyard: a +1/+1 counter on a targeted creature you control; the opposing graveyard, no", () => {
      const run = (whose: "p1" | "p2") => {
        let s = scenario({
          p1: {
            battlefield: ["Hardened Academic", "Bear Cub", ...lands("Forest", 2)],
            hand: ["Heritage Reclamation"],
            graveyard: whose === "p1" ? ["Opt"] : [],
            library: lands("Forest", 3),
          },
          p2: { graveyard: whose === "p2" ? ["Opt"] : [] },
        });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        const opt = s.players[whose]?.graveyard[0] as string;
        s = cast(s, "p1", "Heritage Reclamation", { g: [opt] }, { mode: 2 });
        s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
        expect(exiled(s, "Opt")).toHaveLength(1);
        return s.objects[bear]?.counters["+1/+1"] ?? 0;
      };
      expect(run("p1")).toBe(1);
      expect(run("p2")).toBe(0);
    });
  });

  describe("Flashback: Practiced Offense", () => {
    it("a +1/+1 counter on each creature of the targeted player; the targeted creature gains double strike or lifelink", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Plains", 3)], hand: ["Practiced Offense"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const [bear, angel] = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Serra Angel")];
      s = settle(cast(s, "p1", "Practiced Offense", { p: ["p1"], c: [bear] }, { mode: 0 }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[angel]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(chars(s, bear).keywords).not.toContain("lifelink");
      expect(idsOf(s, "p1", "graveyard", "Practiced Offense")).toHaveLength(1);
    });

    it("flashback {1}{W} from the graveyard (lifelink), then the card is exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)], graveyard: ["Practiced Offense"] },
      });
      const card = idOf(s, "p1", "graveyard", "Practiced Offense");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(castOptions(s, "p1", card)).not.toHaveLength(0);
      s = act(s, "p1", { type: "cast", card, targets: { p: ["p1"], c: [bear] } });
      // "Choose one": asked on resolution (608.2d), it's not a mode.
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      const p = s.pending;
      expect(p?.kind === "choice" && p.request.type === "pick" && p.request.labels?.["1"]).toBe("lifelink");
      s = settle(act(s, "p1", { type: "choose", values: ["1"] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("lifelink");
      expect(exiled(s, "Practiced Offense")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });
  });

  describe("Daydream", () => {
    it("exiles a creature you control and returns it with a +1/+1 counter (damage cleared); flashback {2}{W}", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Serra Angel", damage: 3 }, ...lands("Plains", 4)], hand: ["Daydream"] } });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Daydream", { t: [angel] }));
      const back = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(back).not.toBe(angel);
      expect(s.objects[back]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[back]?.damage).toBe(0);
      const card = idOf(s, "p1", "graveyard", "Daydream");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [back] } }));
      const again = idOf(s, "p1", "battlefield", "Serra Angel");
      // New object: a single counter.
      expect(s.objects[again]?.counters["+1/+1"]).toBe(1);
      expect(exiled(s, "Daydream")).toHaveLength(1);
    });

    it("an opposing creature is not a legal target", () => {
      const s = scenario({ p1: { battlefield: ["Plains"], hand: ["Daydream"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(() => cast(s, "p1", "Daydream", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    });
  });

  describe("Flashback (the card)", () => {
    it("an instant in your graveyard gains flashback until end of turn, for its mana cost", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Flashback"], graveyard: ["Lightning Strike"] } });
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
      s = settle(cast(s, "p1", "Flashback", { t: [strike] }));
      expect(castOptions(s, "p1", strike)).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(3);
    });

    it("the permission ends at end of turn", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Flashback"], graveyard: ["Lightning Strike"] } });
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      s = settle(cast(s, "p1", "Flashback", { t: [strike] }));
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
    });

    it("a creature card is not a legal target", () => {
      const s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Flashback"], graveyard: ["Bear Cub"] } });
      expect(() => cast(s, "p1", "Flashback", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] })).toThrow();
    });
  });

  describe("Witherbloom Charm", () => {
    it("you may sacrifice a permanent: if you do, draw two cards", () => {
      const run = (sacrifice: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Swamp", "Forest", "Bear Cub"], hand: ["Witherbloom Charm"], library: lands("Island", 3) },
        });
        s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 0 }), (req) => {
          if (req.type === "yesNo") return [sacrifice ? 1 : 0];
          if (req.type === "pick") {
            if (!sacrifice) return req.min === 0 ? [] : undefined;
            const bear = req.options.find((id) => nameOf(s, id) === "Bear Cub");
            return bear ? [bear] : undefined;
          }
          return undefined;
        });
        return s;
      };
      const yes = run(true);
      expect(idsOf(yes, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(yes.players.p1?.hand).toHaveLength(2);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(no.players.p1?.hand).toHaveLength(0);
    });

    it("destroys a nonland permanent with MV 2 or less; MV 3, no", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest"], hand: ["Witherbloom Charm"] },
        p2: { battlefield: ["Bear Cub", "Brazen Scourge"] },
      });
      expect(() =>
        cast(s, "p1", "Witherbloom Charm", { t: [idOf(s, "p2", "battlefield", "Brazen Scourge")] }, { mode: 2 }),
      ).toThrow();
      s = settle(cast(s, "p1", "Witherbloom Charm", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }, { mode: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("you gain 5 life", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Forest"], hand: ["Witherbloom Charm"] } });
      s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
      expect(s.players.p1?.life).toBe(25);
    });
  });

  describe("Professor Dellian Fel", () => {
    it("+2: 3 life; 0: draw and lose 1 life; -3: destroys a creature", () => {
      let s = scenario({
        p1: { battlefield: ["Professor Dellian Fel"], library: lands("Swamp", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const pw = idOf(s, "p1", "battlefield", "Professor Dellian Fel");
      expect(s.objects[pw]?.counters.loyalty).toBe(5);
      s = settle(activate(s, "p1", pw, "Gain 3"));
      expect(s.players.p1?.life).toBe(23);
      expect(s.objects[pw]?.counters.loyalty).toBe(7);
      // Only one loyalty ability per turn.
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === pw)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", pw, "Draw"));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(s.players.p1?.life).toBe(22);
      expect(s.objects[pw]?.counters.loyalty).toBe(7);
      s = advanceUntil(s, (x) => x.turn.number === 7 && x.turn.step === "main1" && x.pending?.kind === "priority");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, "p1", pw, "Destroys", { t: [angel] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[pw]?.counters.loyalty).toBe(4);
    });

    it('-6: emblem "whenever you gain life, a targeted opponent loses that much life"', () => {
      let s = scenario({ p1: { battlefield: ["Professor Dellian Fel", "Swamp", "Forest"], hand: ["Witherbloom Charm"] } });
      const pw = idOf(s, "p1", "battlefield", "Professor Dellian Fel");
      (s.objects[pw] as { counters: Record<string, number> }).counters.loyalty = 6;
      s.version += 1;
      s = settle(activate(s, "p1", pw, "Emblem"));
      expect(s.objects[pw]).toBeUndefined();
      s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
      expect(s.players.p1?.life).toBe(25);
      expect(s.players.p2?.life).toBe(15);
    });
  });

  describe("Tablet of Discovery", () => {
    it("on entering, mill a card: you may play it this turn (here an instant, cast from the graveyard)", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Tablet of Discovery"], library: ["Lightning Strike", "Forest"] },
      });
      s = settle(cast(s, "p1", "Tablet of Discovery"));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect(s.players.p1?.library).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("the permission ends at end of turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Tablet of Discovery"], library: ["Lightning Strike", "Forest"] },
      });
      s = settle(cast(s, "p1", "Tablet of Discovery"));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
      s = passUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
    });

    it("{T}: add {R}", () => {
      let s = scenario({ p1: { battlefield: ["Tablet of Discovery"], hand: ["Burst Lightning"] } });
      const tablet = idOf(s, "p1", "battlefield", "Tablet of Discovery");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === tablet && a.colors.includes("R"))).toBe(
        true,
      );
      s = settle(cast(s, "p1", "Burst Lightning", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[tablet]?.tapped).toBe(true);
    });
  });

  describe("Dissection Practice", () => {
    it("an opponent loses 1 life, you gain 1; up to one creature +1/+1, up to one other -1/-1", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Dissection Practice"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mine = idOf(s, "p1", "battlefield", "Bear Cub");
      const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dissection Practice", { p: ["p2"], a: [mine], b: [theirs] }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
      expect([chars(s, mine).power, chars(s, mine).toughness]).toEqual([3, 3]);
      expect([chars(s, theirs).power, chars(s, theirs).toughness]).toEqual([1, 1]);
    });
  });

  describe("Dual lands (Sundown Pass, Shattered Sanctum, Stormcarved Coast, Deathcap Glade)", () => {
    it("enter tapped, unless you control two or more other lands", () => {
      const play = (name: string, others: number) => {
        let s = scenario({ p1: { battlefield: lands("Plains", others), hand: [name] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
        const id = idOf(s, "p1", "battlefield", name);
        const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        return { tapped: s.objects[id]?.tapped, colors: colors.sort() };
      };
      expect(play("Sundown Pass", 1).tapped).toBe(true);
      expect(play("Sundown Pass", 2)).toEqual({ tapped: false, colors: ["R", "W"] });
      expect(play("Shattered Sanctum", 2)).toEqual({ tapped: false, colors: ["B", "W"] });
      expect(play("Stormcarved Coast", 2)).toEqual({ tapped: false, colors: ["R", "U"] });
      expect(play("Deathcap Glade", 2)).toEqual({ tapped: false, colors: ["B", "G"] });
    });
  });
});

describe("Secrets of Strixhaven, core: Increment, Repartee, Opus, Infusion", () => {
  const tester = (name: string, power: number, toughness: number, ...abilities: AbilityDef[]) =>
    customCard({ name, power, toughness, abilities });
  /** Colorless sorcery with cost {N}: "draw a card". */
  const sorcery = (n: number) =>
    customCard({
      name: `Sorcery costing ${n}`,
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: n, colored: {}, x: 0 },
      manaCostText: `{${n}}`,
      spell: spell([], [fx.draw(1)]),
    });

  it("Increment: a counter if the mana spent exceeds the power or toughness (the lesser of the two), not otherwise", () => {
    const pupil = tester("Test Pupil", 1, 3, INCREMENT);
    let s = scenario({ p1: { battlefield: [pupil, ...lands("Island", 3)], hand: ["Opt", sorcery(2)] } });
    const id = idOf(s, "p1", "battlefield", pupil.name);
    // Opt: 1 mana, not more than power 1.
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
    // 2 mana > power 1 (but not > toughness 3).
    s = settle(cast(s, "p1", "Sorcery costing 2"));
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
  });

  it("Repartee: an instant or sorcery that targets a creature, not a player; not a creature spell", () => {
    const duelist = tester(
      "Test Duelist",
      1,
      1,
      triggered(REPARTEE, [fx.addCounters(ref.self, 1)], { label: "Repartee: a +1/+1 counter" }),
    );
    let s = scenario({
      p1: { battlefield: [duelist, ...lands("Mountain", 6)], hand: ["Lightning Strike", "Lightning Strike"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const id = idOf(s, "p1", "battlefield", duelist.name);
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: ["p2"] } }));
    expect(s.objects[id]?.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(act(s, "p1", { type: "cast", card: b as string, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
    expect(s.objects[id]?.counters["+1/+1"]).toBe(1);
  });

  it("Opus: on each instant or sorcery; five or more mana spent: the stronger effect", () => {
    const soloist = tester(
      "Test Soloist",
      1,
      3,
      triggered(OPUS, opusInstead([fx.damage(1, ref.eachOpponent)], [fx.damage(3, ref.eachOpponent)]), {
        label: "Opus: 1 damage (3 if five mana)",
      }),
    );
    let s = scenario({ p1: { battlefield: [soloist, ...lands("Island", 6)], hand: ["Opt", sorcery(5)] } });
    s = settle(cast(s, "p1", "Opt"));
    expect(s.players.p2?.life).toBe(19);
    s = settle(cast(s, "p1", "Sorcery costing 5"));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Infusion: true only if you gained life this turn", () => {
    const s = scenario({});
    expect(checkCondition(s, INFUSION, "p1")).toBe(false);
    s.turnLog.push({ e: "lifeGain", player: "p1", amount: 1 });
    expect(checkCondition(s, INFUSION, "p1")).toBe(true);
  });
});

describe("Secrets of Strixhaven, lot A — blanc", () => {
  /**
   * Secrets of Strixhaven, lot A - white cards: each card with non-trivial behavior is checked against its Oracle
   * text (plan R, lot R7): prepare (prepared spells cast from exile, "becomes prepared"), Repartee,
   * flashback, return from the graveyard, temporary exile.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Answers `ids` to the first "pick" request that offers them all. */
  const pickIds =
    (...ids: string[]): Answer =>
    (req) =>
      req.type === "pick" && ids.every((id) => req.options.includes(id)) ? ids : undefined;
  /** Casts the card's prepared spell (the exiled copy). */
  const castPrepared = (s: S, player: string, spellName: string, targets?: Record<string, string[]>) =>
    act(s, player, { type: "cast", card: exiled(s, spellName)[0] as string, targets });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };

  describe("Spells", () => {
    it("Ajani's Response: costs {3} less against a tapped creature; destroys the targeted creature", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Plains", 2), hand: ["Ajani's Response"] },
          p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Bear Cub"] },
        });
      let s = setup();
      s = settle(cast(s, "p1", "Ajani's Response", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      // An untapped creature: {4}{W}, impossible with two lands.
      const t = setup();
      expect(() => cast(t, "p1", "Ajani's Response", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] })).toThrow();
    });

    it("Antiquities on the Loose: two 2/2 Spirits; with flashback, a +1/+1 counter on each Spirit, then exiled", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 9), hand: ["Antiquities on the Loose"] } });
      s = settle(cast(s, "p1", "Antiquities on the Loose"));
      const spirits = idsOf(s, "p1", "battlefield", "Spirit");
      expect(spirits).toHaveLength(2);
      const c = chars(s, spirits[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([2, 2, ["R", "W"]]);
      expect(spirits.map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([0, 0]);
      const card = idOf(s, "p1", "graveyard", "Antiquities on the Loose");
      s = settle(act(s, "p1", { type: "cast", card }));
      const all = idsOf(s, "p1", "battlefield", "Spirit");
      expect(all).toHaveLength(4);
      expect(all.map((id) => s.objects[id]?.counters["+1/+1"])).toEqual([1, 1, 1, 1]);
      expect(exiled(s, "Antiquities on the Loose")).toHaveLength(1);
    });

    it("Dig Site Inventory: a +1/+1 counter and vigilance until end of turn; flashback {W}", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)], hand: ["Dig Site Inventory"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Dig Site Inventory", { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, bear).keywords).toContain("vigilance");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Dig Site Inventory"), targets: { t: [bear] } }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(exiled(s, "Dig Site Inventory")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("vigilance");
    });

    it("Harsh Annotation: destroys the creature; its controller creates a 1/1 white and black flying Inkling", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Harsh Annotation"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Harsh Annotation", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      const inkling = idOf(s, "p2", "battlefield", "Inkling");
      const c = chars(s, inkling);
      expect([c.power, c.toughness, [...c.colors].sort(), c.keywords]).toEqual([1, 1, ["B", "W"], ["flying"]]);
      expect(idsOf(s, "p1", "battlefield", "Inkling")).toHaveLength(0);
    });

    it("Interjection: +2/+2 and first strike until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Plains"], hand: ["Interjection"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Interjection", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("firstStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Rapier Wit: taps the creature and draws; a stun counter only during your turn", () => {
      const run = (active: "p1" | "p2") => {
        let s = scenario({
          active,
          p1: { battlefield: lands("Plains", 2), hand: ["Rapier Wit"], library: lands("Plains", 3) },
          p2: { battlefield: ["Bear Cub"] },
        });
        const bear = idOf(s, "p2", "battlefield", "Bear Cub");
        if (active === "p2") s = act(s, "p2", { type: "pass" });
        s = settle(cast(s, "p1", "Rapier Wit", { t: [bear] }));
        return { tapped: s.objects[bear]?.tapped, stun: s.objects[bear]?.counters.stun ?? 0, hand: s.players.p1?.hand.length };
      };
      expect(run("p1")).toEqual({ tapped: true, stun: 1, hand: 1 });
      expect(run("p2")).toEqual({ tapped: true, stun: 0, hand: 1 });
    });

    it("Restoration Seminar: a nonland permanent card returns from your graveyard; the spell is exiled (Paradigm)", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Restoration Seminar"], graveyard: ["Serra Angel", "Plains"] },
      });
      const plains = idOf(s, "p1", "graveyard", "Plains");
      expect(() => cast(s, "p1", "Restoration Seminar", { t: [plains] })).toThrow();
      s = settle(cast(s, "p1", "Restoration Seminar", { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(exiled(s, "Restoration Seminar")).toHaveLength(1);
    });

    it("Stand Up for Yourself: only a creature with power 3 or greater", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Stand Up for Yourself"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      expect(() => cast(s, "p1", "Stand Up for Yourself", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
      s = settle(cast(s, "p1", "Stand Up for Yourself", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });
  });

  describe("Prepared creatures", () => {
    it("Elite Interceptor: enters prepared; Rejoinder taps an untapped creature and draws, then it becomes unprepared", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Elite Interceptor"], library: lands("Plains", 3) },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Elite Interceptor"));
      const interceptor = idOf(s, "p1", "battlefield", "Elite Interceptor");
      expect(s.objects[interceptor]?.preparedCopy).toBe(exiled(s, "Rejoinder")[0]);
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", "Rejoinder", { t: [bear] }), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[interceptor]?.preparedCopy).toBeUndefined();
    });

    it("Elite Interceptor: Rejoinder can untap a tapped creature", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Serra Angel", tapped: true }, ...lands("Plains", 3)],
          hand: ["Elite Interceptor"],
          library: lands("Plains", 3),
        },
      });
      s = settle(cast(s, "p1", "Elite Interceptor"));
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      s = settle(castPrepared(s, "p1", "Rejoinder", { t: [angel] }), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.objects[angel]?.tapped).toBe(false);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Emeritus of Truce: the targeted player creates an Inkling; prepared if an opponent has more creatures; Swords to Plowshares", () => {
      const run = (who: "p1" | "p2") => {
        let s = scenario({
          p1: { battlefield: lands("Plains", 4), hand: ["Emeritus of Truce"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Emeritus of Truce"), pickIds(who));
        return s;
      };
      // The Inkling on the opponent's side: two creatures against one, the Emeritus becomes prepared.
      let s = run("p2");
      expect(idsOf(s, "p2", "battlefield", "Inkling")).toHaveLength(1);
      expect(exiled(s, "Swords to Plowshares")).toHaveLength(1);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castPrepared(s, "p1", "Swords to Plowshares", { t: [angel] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(24);
      expect(s.players.p1?.life).toBe(20);
      // The Inkling on your side: two against one, no preparation.
      const t = run("p1");
      expect(idsOf(t, "p1", "battlefield", "Inkling")).toHaveLength(1);
      expect(exiled(t, "Swords to Plowshares")).toHaveLength(0);
    });

    it("Honorbound Page and Quill-Blade Laureate: Forum's Favor (+1/+0, flying) and Twofold Intent (+1/+0, double strike)", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 9)], hand: ["Honorbound Page", "Quill-Blade Laureate"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Honorbound Page"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Honorbound Page")).keywords).toContain("firstStrike");
      s = settle(castPrepared(s, "p1", "Forum's Favor", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("flying");
      s = settle(cast(s, "p1", "Quill-Blade Laureate"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Quill-Blade Laureate")).keywords).toContain("doubleStrike");
      s = settle(castPrepared(s, "p1", "Twofold Intent", { t: [bear] }));
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
    });

    it("Joined Researchers: at each end step, prepared if an opponent has more cards in hand; Secret Rendezvous", () => {
      const run = (oppHand: number) =>
        advanceUntil(
          scenario({
            p1: { battlefield: ["Joined Researchers", ...lands("Plains", 3)], library: lands("Plains", 10) },
            p2: { hand: lands("Island", oppHand), library: lands("Island", 10) },
          }),
          (x) => x.turn.active === "p2",
        );
      expect(exiled(run(0), "Secret Rendezvous")).toHaveLength(0);
      let s = run(3);
      expect(exiled(s, "Secret Rendezvous")).toHaveLength(1);
      // On p1's next turn, the prepared spell is cast (sorcery): each player draws three cards.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.pending?.kind === "priority");
      const [h1, h2] = [s.players.p1?.hand.length ?? 0, s.players.p2?.hand.length ?? 0];
      s = settle(castPrepared(s, "p1", "Secret Rendezvous", { t: ["p2"] }));
      expect(s.players.p1?.hand.length).toBe(h1 + 3);
      expect(s.players.p2?.hand.length).toBe(h2 + 3);
    });

    it("Spiritcall Enthusiast: tokens enter under your control -> prepared; Scrollboost: +2/+2 to one or two creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Spiritcall Enthusiast", "Bear Cub", ...lands("Plains", 6)], hand: ["Eager Glyphmage"] },
      });
      const enthusiast = idOf(s, "p1", "battlefield", "Spiritcall Enthusiast");
      expect(exiled(s, "Scrollboost")).toHaveLength(0);
      s = settle(cast(s, "p1", "Eager Glyphmage"));
      expect(exiled(s, "Scrollboost")).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", "Scrollboost", { t: [bear, enthusiast] }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(pt(s, enthusiast)).toEqual([5, 5]);
    });

    it("Spiritcall Enthusiast: an opposing token doesn't prepare it", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Harsh Annotation"] },
        p2: { battlefield: ["Spiritcall Enthusiast", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Harsh Annotation", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p2", "battlefield", "Inkling")).toHaveLength(1);
      expect(exiled(s, "Scrollboost")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["Spiritcall Enthusiast", ...lands("Plains", 2)], hand: ["Harsh Annotation"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Harsh Annotation", { t: [idOf(t, "p2", "battlefield", "Bear Cub")] }));
      expect(exiled(t, "Scrollboost")).toHaveLength(0);
    });
  });

  describe("Repartee", () => {
    const strikeSetup = (permanent: string) =>
      scenario({
        p1: { battlefield: [permanent, "Bear Cub", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
        p2: { battlefield: ["Serra Angel"] },
      });
    const strikes = (s: S) => idsOf(s, "p1", "hand", "Lightning Strike");

    it("Graduation Day: a spell that targets a creature puts a +1/+1 counter on a targeted creature you control", () => {
      let s = strikeSetup("Graduation Day");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: ["p2"] } }));
      expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: [angel] } }), pickIds(bear));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("Informed Inkwright: a 1/1 flying Inkling", () => {
      let s = strikeSetup("Informed Inkwright");
      expect(chars(s, idOf(s, "p1", "battlefield", "Informed Inkwright")).keywords).toContain("vigilance");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes(s)[0] as string,
          targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Inkling")).toHaveLength(1);
    });

    it("Inkshape Demonstrator: ward {2}; +1/+0 and lifelink until end of turn", () => {
      let s = strikeSetup("Inkshape Demonstrator");
      const demo = idOf(s, "p1", "battlefield", "Inkshape Demonstrator");
      expect(chars(s, demo).keywords).toContain("ward");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes(s)[0] as string,
          targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        }),
      );
      expect(pt(s, demo)).toEqual([4, 4]);
      expect(chars(s, demo).keywords).toContain("lifelink");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, demo)).toEqual([3, 4]);
      expect(chars(s, demo).keywords).not.toContain("lifelink");
    });

    it("Rehearsed Debater: +1/+1 until end of turn", () => {
      let s = strikeSetup("Rehearsed Debater");
      const debater = idOf(s, "p1", "battlefield", "Rehearsed Debater");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: strikes(s)[0] as string,
          targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] },
        }),
      );
      expect(pt(s, debater)).toEqual([4, 4]);
    });

    it("Stirring Hopesinger: a +1/+1 counter on each creature you control, not on the opponent's", () => {
      let s = strikeSetup("Stirring Hopesinger");
      const hope = idOf(s, "p1", "battlefield", "Stirring Hopesinger");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: [angel] } }));
      expect(s.objects[hope]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[angel]?.counters["+1/+1"] ?? 0).toBe(0);
      // A spell that only targets a player doesn't trigger Repartee.
      s = settle(act(s, "p1", { type: "cast", card: strikes(s)[0] as string, targets: { t: ["p2"] } }));
      expect(s.objects[hope]?.counters["+1/+1"]).toBe(1);
    });
  });

  describe("Other permanents", () => {
    it("Ascendant Dustspeaker: a +1/+1 counter on another creature; at the beginning of your combat, exiles a card from a graveyard", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Ascendant Dustspeaker"] },
        p2: { graveyard: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Ascendant Dustspeaker"));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ascendant Dustspeaker")]?.counters["+1/+1"] ?? 0).toBe(0);
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = advanceUntil(
        act(s, "p1", { type: "pass" }),
        (x) => x.pending?.kind === "choice" && x.pending.request.type === "pick" && x.pending.request.options.includes(angel),
      );
      s = settle(s, pickIds(angel));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });

    it("Eager Glyphmage: a 1/1 flying Inkling on entering", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Eager Glyphmage"] } });
      s = settle(cast(s, "p1", "Eager Glyphmage"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Inkling")).keywords).toContain("flying");
    });

    it("Ennis, Debate Moderator: exiles another creature until the end step; a +1/+1 counter if cards were exiled", () => {
      const run = (exile: boolean) => {
        let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 2)], hand: ["Ennis, Debate Moderator"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settle(cast(s, "p1", "Ennis, Debate Moderator"), (req) =>
          req.type === "pick" && req.options.includes(bear) ? (exile ? [bear] : []) : undefined,
        );
        const ennis = idOf(s, "p1", "battlefield", "Ennis, Debate Moderator");
        const mid = { bear: idsOf(s, "p1", "battlefield", "Bear Cub").length, exiled: exiled(s, "Bear Cub").length };
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return {
          mid,
          bear: idsOf(s, "p1", "battlefield", "Bear Cub").length,
          counters: s.objects[ennis]?.counters["+1/+1"] ?? 0,
        };
      };
      expect(run(true)).toEqual({ mid: { bear: 0, exiled: 1 }, bear: 1, counters: 1 });
      expect(run(false)).toEqual({ mid: { bear: 1, exiled: 0 }, bear: 1, counters: 0 });
    });

    it("Owlin Historian and Stone Docent: surveil 1; exiling the Docent from the graveyard (2 life, surveil 1) gives +1/+1", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 4),
          hand: ["Owlin Historian"],
          graveyard: ["Stone Docent"],
          library: lands("Plains", 5),
        },
      });
      s = settle(cast(s, "p1", "Owlin Historian"), (req) => (req.type === "pick" ? [] : undefined));
      const owl = idOf(s, "p1", "battlefield", "Owlin Historian");
      expect(pt(s, owl)).toEqual([2, 3]);
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Stone Docent")), (req) => (req.type === "pick" ? [] : undefined));
      expect(exiled(s, "Stone Docent")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(22);
      expect(pt(s, owl)).toEqual([3, 4]);
    });

    it("Stone Docent: sorcery speed only", () => {
      let s = scenario({ p1: { battlefield: ["Plains"], graveyard: ["Stone Docent"] } });
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority");
      const docent = idOf(s, "p1", "graveyard", "Stone Docent");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === docent)).toBe(false);
    });

    it("Primary Research: returns a permanent card with MV 3 or less; at your end step, draw if a card left your graveyard", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: lands("Plains", 5),
            hand: ["Primary Research"],
            graveyard: ["Bear Cub", "Serra Angel"],
            library: lands("Plains", 5),
          },
        });
      let s = setup();
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      // The Angel (MV 5) is not a possible target: the Bear Cub is the only one.
      s = settle(cast(s, "p1", "Primary Research"), (req) => {
        if (req.type === "pick") expect(req.options).not.toContain(angel);
        return undefined;
      });
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand.length).toBe(hand + 1);
    });

    it("Primary Research: with no card leaving the graveyard, no draw", () => {
      let s = scenario({ p1: { battlefield: ["Primary Research"], library: lands("Plains", 5) } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p1?.hand).toHaveLength(0);
    });

    it("Shattered Acolyte: lifelink; {1}, sacrifice it: destroys an artifact or enchantment", () => {
      let s = scenario({
        p1: { battlefield: ["Shattered Acolyte", "Plains"] },
        p2: { battlefield: ["Fishing Pole", "Graduation Day"] },
      });
      const acolyte = idOf(s, "p1", "battlefield", "Shattered Acolyte");
      expect(chars(s, acolyte).keywords).toContain("lifelink");
      s = settle(activate(s, "p1", acolyte, { t: [idOf(s, "p2", "battlefield", "Fishing Pole")] }));
      expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Shattered Acolyte")).toHaveLength(1);
    });

    it("Summoned Dromedary: {1}{W}: returns from the graveyard to your hand", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 2), graveyard: ["Summoned Dromedary"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Summoned Dromedary")));
      expect(idsOf(s, "p1", "hand", "Summoned Dromedary")).toHaveLength(1);
    });
  });
});

describe("Secrets of Strixhaven, lot A — bleu", () => {
  /**
   * Secrets of Strixhaven, lot A - blue cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, lot R7). Prepare (Campus Composer, Encouraging Aviator, Harmonized Trio, Jadzi, Skycoach
   * Conductor...), Opus (Deluge Virtuoso, Exhibition Tidecaller, Muse Seeker), Increment (Pensive Professor, Tester of the
   * Tangential, Textbook Tabulator), stun counters, cost reductions and X spells.
   */
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string, s: S) => ChoiceValue[] | undefined;
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passes and answers choices (suggested answer by default) until the stack is empty, with no trigger pending. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const castExiled = (s: S, name: string, targets?: Record<string, string[]>, extra: object = {}) =>
    act(s, "p1", { type: "cast", card: exiled(s, name)[0] as string, targets, ...extra });
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  const setCounters = (s: S, id: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters["+1/+1"] = n;
  };

  it("Banishing Betrayal: returns a nonland permanent to its owner's hand, then surveil 1", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Banishing Betrayal"], library: ["Opt", "Forest"] },
      p2: { battlefield: ["Serra Angel", "Plains"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => cast(s, "p1", "Banishing Betrayal", { t: [idOf(s, "p2", "battlefield", "Plains")] })).toThrow();
    s = settle(cast(s, "p1", "Banishing Betrayal", { t: [angel] }), (req, _p, cur) =>
      req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Opt") : undefined,
    );
    expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
  });

  it("Campus Composer: ward {2}; enters prepared, Aqueous Aria creates a 3/3 blue and red flying Elemental", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 9), hand: ["Campus Composer"] } });
    s = settle(cast(s, "p1", "Campus Composer"));
    const composer = idOf(s, "p1", "battlefield", "Campus Composer");
    expect(chars(s, composer).keywords).toContain("ward");
    expect(exiled(s, "Aqueous Aria")).toHaveLength(1);
    s = settle(castExiled(s, "Aqueous Aria"));
    const elemental = idOf(s, "p1", "battlefield", "Elemental");
    expect(pt(s, elemental)).toEqual([3, 3]);
    expect([...chars(s, elemental).colors].sort()).toEqual(["R", "U"]);
    expect(chars(s, elemental).keywords).toContain("flying");
    expect(s.objects[composer]?.preparedCopy).toBeUndefined();
  });

  it("Chase Inspiration: a creature you control gets +0/+3 and hexproof until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Island"], hand: ["Chase Inspiration"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    expect(() => cast(s, "p1", "Chase Inspiration", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Chase Inspiration", { t: [bear] }));
    expect(pt(s, bear)).toEqual([2, 5]);
    expect(chars(s, bear).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  describe("Deluge Virtuoso", () => {
    it("on entering: taps an opposing creature and puts a stun counter on it", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Deluge Virtuoso"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Deluge Virtuoso"), (req) =>
        req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
      );
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun).toBe(1);
      // The stun counter replaces the next untap.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(s.objects[bear]?.counters.stun ?? 0).toBe(0);
    });

    it("Opus: +1/+1; five or more mana spent: +2/+2 instead", () => {
      let s = scenario({
        p1: {
          battlefield: ["Deluge Virtuoso", ...lands("Island", 7)],
          hand: ["Opt", "Homesickness"],
          library: lands("Forest", 6),
        },
      });
      const v = idOf(s, "p1", "battlefield", "Deluge Virtuoso");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, v)).toEqual([3, 3]);
      s = settle(cast(s, "p1", "Homesickness", { p: ["p1"], c: [] }));
      expect(pt(s, v)).toEqual([5, 5]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, v)).toEqual([2, 2]);
    });
  });

  it("Divergent Equation: returns X instant and sorcery cards from the graveyard to hand, then exiles itself", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Divergent Equation"], graveyard: ["Opt", "Boltwave", "Bear Cub"] },
    });
    const opt = idOf(s, "p1", "graveyard", "Opt");
    const bolt = idOf(s, "p1", "graveyard", "Boltwave");
    expect(() => cast(s, "p1", "Divergent Equation", { t: [idOf(s, "p1", "graveyard", "Bear Cub")] }, { x: 1 })).toThrow();
    s = settle(cast(s, "p1", "Divergent Equation", { t: [opt, bolt] }, { x: 2 }));
    expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Boltwave")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(exiled(s, "Divergent Equation")).toHaveLength(1);
  });

  it("Echocasting Symposium: the targeted player creates a token copy of a creature you control; Paradigm", () => {
    let s = scenario({ p1: { battlefield: ["Serra Angel", ...lands("Island", 6)], hand: ["Echocasting Symposium"] } });
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Echocasting Symposium", { p: ["p1"], c: [angel] }));
    const copies = idsOf(s, "p1", "battlefield", "Serra Angel").filter((id) => id !== angel);
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0] as string]?.isToken).toBe(true);
    expect(exiled(s, "Echocasting Symposium")).toHaveLength(1);

    let t = scenario({ p1: { battlefield: ["Serra Angel", ...lands("Island", 6)], hand: ["Echocasting Symposium"] } });
    t = settle(cast(t, "p1", "Echocasting Symposium", { p: ["p2"], c: [idOf(t, "p1", "battlefield", "Serra Angel")] }));
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    // The targeted player creates the token: they are its owner, not just its controller.
    const token = t.objects[idOf(t, "p2", "battlefield", "Serra Angel")];
    expect([token?.owner, token?.controller]).toEqual(["p2", "p2"]);
  });

  it("Encouraging Aviator: on attacking, becomes prepared; Jump gives flying to a creature until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Encouraging Aviator", "Bear Cub", "Island"] } });
    const aviator = idOf(s, "p1", "battlefield", "Encouraging Aviator");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(exiled(s, "Jump")).toHaveLength(0);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = settle(act(s, "p1", { type: "declareAttackers", attackers: [{ id: aviator, defender: "p2" }] }));
    expect(exiled(s, "Jump")).toHaveLength(1);
    expect(chars(s, bear).keywords).not.toContain("flying");
    s = settle(castExiled(s, "Jump", { t: [bear] }));
    expect(chars(s, bear).keywords).toContain("flying");
  });

  it("Exhibition Tidecaller: Opus, the targeted player mills three cards; ten if five or more mana", () => {
    let s = scenario({
      p1: { battlefield: ["Exhibition Tidecaller", ...lands("Island", 7)], hand: ["Opt", "Homesickness"] },
      p2: { library: lands("Forest", 20) },
    });
    const toP2: Answer = (req) => (req.type === "pick" && req.options.includes("p2") ? ["p2"] : undefined);
    s = settle(cast(s, "p1", "Opt"), toP2);
    expect(s.players.p2?.graveyard).toHaveLength(3);
    s = settle(cast(s, "p1", "Homesickness", { p: ["p1"], c: [] }), toP2);
    expect(s.players.p2?.graveyard).toHaveLength(13);
  });

  describe("Flow State", () => {
    it("looks at three cards: one into hand, the others on the bottom", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Flow State"], library: ["Opt", "Bear Cub", "Serra Angel", "Forest"] },
      });
      s = settle(cast(s, "p1", "Flow State"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(3);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
    });

    it("with an instant and a sorcery in the graveyard: two cards into hand instead", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 2),
          hand: ["Flow State"],
          graveyard: ["Opt", "Boltwave"],
          library: ["Opt", "Bear Cub", "Serra Angel", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Flow State"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Forest");
    });
  });

  it("Fractal Anomaly: a 0/0 Fractal with a +1/+1 counter per card drawn this turn (0: it dies)", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Fractal Anomaly", "Opt"], library: lands("Forest", 5) } });
    s = settle(cast(s, "p1", "Opt"));
    s = settle(cast(s, "p1", "Fractal Anomaly"));
    const fractal = idOf(s, "p1", "battlefield", "Fractal");
    expect(pt(s, fractal)).toEqual([1, 1]);
    expect([...chars(s, fractal).colors].sort()).toEqual(["G", "U"]);

    let t = scenario({ p1: { battlefield: ["Island"], hand: ["Fractal Anomaly"] } });
    t = settle(cast(t, "p1", "Fractal Anomaly"));
    expect(idsOf(t, "p1", "battlefield", "Fractal")).toHaveLength(0);
  });

  it("Fractalize: until end of turn, the creature becomes a green and blue Fractal with base P/T X+1", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Fractalize"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Fractalize", { t: [angel] }, { x: 3 }));
    const c = chars(s, angel);
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect([...c.colors].sort()).toEqual(["G", "U"]);
    expect(c.subtypes).toEqual(["Fractal"]);
    expect(c.keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, angel)).toEqual([4, 4]);
    expect(chars(s, angel).subtypes).toEqual(["Angel"]);
    expect(chars(s, angel).colors).toEqual(["W"]);
  });

  it("Harmonized Trio: {T} and tap two creatures, becomes prepared; Brainstorm draws three and puts two back", () => {
    let s = scenario({
      p1: {
        battlefield: ["Harmonized Trio", "Bear Cub", "Serra Angel", "Island"],
        hand: ["Opt"],
        library: ["Forest", "Plains", "Swamp", "Mountain"],
      },
    });
    const trio = idOf(s, "p1", "battlefield", "Harmonized Trio");
    expect(exiled(s, "Brainstorm")).toHaveLength(0);
    s = settle(activate(s, "p1", trio));
    expect(s.objects[trio]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.tapped).toBe(true);
    expect(exiled(s, "Brainstorm")).toHaveLength(1);
    s = settle(castExiled(s, "Brainstorm"), (req, _p, cur) =>
      req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Opt")
        ? req.options.filter((id) => ["Opt", "Forest"].includes(nameOf(cur, id) ?? ""))
        : undefined,
    );
    expect((s.players.p1?.hand ?? []).map((id) => nameOf(s, id)).sort()).toEqual(["Plains", "Swamp"]);
    expect(s.players.p1?.library).toHaveLength(3);
    expect(
      (s.players.p1?.library ?? [])
        .slice(0, 2)
        .map((id) => nameOf(s, id))
        .sort(),
    ).toEqual(["Forest", "Opt"]);
  });

  it("Homesickness: the targeted player draws two cards; up to two tapped creatures with a stun counter", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Homesickness"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Homesickness", { p: ["p1"], c: [bear, angel] }));
    expect(s.players.p1?.hand).toHaveLength(2);
    for (const id of [bear, angel]) {
      expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[id]?.counters.stun).toBe(1);
    }
  });

  it("Hydro-Channeler: its mana can only be used for instants and sorceries; {1}, {T}: one mana of any color", () => {
    const s = scenario({ p1: { battlefield: ["Hydro-Channeler", "Forest"], hand: ["Opt", "Boltwave"] } });
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Opt"))).not.toHaveLength(0);
    // The Boltwave ({R}): the second ability, {1} paid by the Forest, gives {R}.
    let r = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Hydro-Channeler")), (req) =>
      req.type === "pick" && req.options.includes("R") ? ["R"] : undefined,
    );
    r = settle(cast(r, "p1", "Boltwave"));
    expect(r.players.p2?.life).toBe(17);
    // Its mana doesn't pay for a creature spell.
    const t = scenario({ p1: { battlefield: ["Hydro-Channeler", "Forest"], hand: ["Bear Cub"] } });
    expect(castOptions(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toHaveLength(0);
  });

  describe("Jadzi, Steward of Fate", () => {
    it("on entering: draw two cards, then discard two; enters prepared", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Jadzi, Steward of Fate"], library: lands("Forest", 4) },
      });
      s = settle(cast(s, "p1", "Jadzi, Steward of Fate"));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      expect(exiled(s, "Oracle's Gift")).toHaveLength(1);
    });

    it("Oracle's Gift: X Fractals, then X +1/+1 counters on each Fractal you control", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Island", 10),
          hand: ["Opt", "Fractal Anomaly", "Jadzi, Steward of Fate"],
          library: lands("Forest", 6),
        },
      });
      // A 1/1 Fractal already present (a card drawn by Opt).
      s = settle(cast(s, "p1", "Opt"));
      s = settle(cast(s, "p1", "Fractal Anomaly"));
      const first = idOf(s, "p1", "battlefield", "Fractal");
      s = settle(cast(s, "p1", "Jadzi, Steward of Fate"));
      s = settle(castExiled(s, "Oracle's Gift", undefined, { x: 2 }));
      const fractals = idsOf(s, "p1", "battlefield", "Fractal");
      expect(fractals).toHaveLength(3);
      expect(pt(s, first)).toEqual([3, 3]);
      for (const id of fractals.filter((x) => x !== first)) expect(pt(s, id)).toEqual([2, 2]);
    });
  });

  it("Landscape Painter: enters prepared; Vibrant Idea draws two cards", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Landscape Painter"], library: lands("Forest", 4) } });
    s = settle(cast(s, "p1", "Landscape Painter"));
    s = settle(castExiled(s, "Vibrant Idea"));
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Mathemagics: the targeted player draws 2^X cards", () => {
    const run = (x: number) => {
      let s = scenario({ p1: { battlefield: lands("Island", 8), hand: ["Mathemagics"], library: lands("Forest", 20) } });
      s = settle(cast(s, "p1", "Mathemagics", { p: ["p1"] }, { x }));
      return s.players.p1?.hand.length;
    };
    expect(run(0)).toBe(1);
    expect(run(1)).toBe(2);
    expect(run(3)).toBe(8);
  });

  /** Discards a card other than Homesickness. */
  const keepHomesickness: Answer = (req, _p, cur) =>
    req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Homesickness")
      ? req.options.filter((id) => nameOf(cur, id) !== "Homesickness").slice(0, 1)
      : undefined;

  it("Muse Seeker: Opus, draw then discard; no discard if five or more mana", () => {
    let s = scenario({
      p1: { battlefield: ["Muse Seeker", ...lands("Island", 7)], hand: ["Opt", "Homesickness"], library: lands("Forest", 10) },
    });
    s = settle(cast(s, "p1", "Opt"), keepHomesickness);
    // Opt draws a card, Muse Seeker draws one and discards one: Homesickness + one card.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(2);
    s = settle(cast(s, "p1", "Homesickness", { p: ["p2"], c: [] }));
    // Homesickness (six mana): Muse Seeker draws without discarding.
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(3);
  });

  it("Muse's Encouragement: a 3/3 flying Elemental, then surveil 2", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Muse's Encouragement"], library: ["Opt", "Opt", "Forest"] },
    });
    s = settle(cast(s, "p1", "Muse's Encouragement"), (req) => (req.type === "pick" ? req.options : undefined));
    expect(idsOf(s, "p1", "battlefield", "Elemental")).toHaveLength(1);
    expect(s.players.p1?.graveyard.filter((id) => nameOf(s, id) === "Opt")).toHaveLength(2);
  });

  it("Orysa, Tide Choreographer: costs {3} less with total toughness 10 or greater; draws two cards on entering", () => {
    const wall = customCard({ name: "Test Wall", power: 0, toughness: 10 });
    const s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Orysa, Tide Choreographer"] } });
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Orysa, Tide Choreographer"))).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: [wall, ...lands("Island", 2)], hand: ["Orysa, Tide Choreographer"], library: lands("Forest", 3) },
    });
    t = settle(cast(t, "p1", "Orysa, Tide Choreographer"));
    expect(idsOf(t, "p1", "battlefield", "Orysa, Tide Choreographer")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(2);
  });

  it("Pensive Professor: Increment, then each +1/+1 counter put on it draws a card", () => {
    let s = scenario({
      p1: { battlefield: ["Pensive Professor", ...lands("Island", 2)], hand: ["Opt", "Opt"], library: lands("Forest", 5) },
    });
    const prof = idOf(s, "p1", "battlefield", "Pensive Professor");
    s = settle(cast(s, "p1", "Opt"));
    // 1 mana > power 0: a counter, and a card drawn (plus the one from Opt).
    expect(s.objects[prof]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(3);
    // 1 mana is greater than neither power (1) nor toughness (3): nothing.
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[prof]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(3);
  });

  it("Procrastinate: taps the targeted creature and puts twice X stun counters on it", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Procrastinate"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Procrastinate", { t: [angel] }, { x: 2 }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(4);
  });

  describe("Run Behind", () => {
    it("the owner puts the creature on top or on the bottom of their library", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Run Behind"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Run Behind", { t: [angel] }), (req, player) =>
        req.type === "pick" && player === "p2" ? ["top"] : undefined,
      );
      expect(nameOf(s, s.players.p2?.library[0] as string)).toBe("Serra Angel");
    });

    it("costs {1} less if it targets an attacking creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Run Behind"] },
        p2: { battlefield: ["Serra Angel"] },
        active: "p2",
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "p1", "Run Behind", { t: [angel] })).toThrow();
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p1");
      s = settle(cast(s, "p1", "Run Behind", { t: [angel] }), (req) => (req.type === "pick" ? ["bottom"] : undefined));
      expect(nameOf(s, s.players.p2?.library.at(-1) as string)).toBe("Serra Angel");
    });
  });

  it("Skycoach Conductor: All Aboard exiles a non-Pilot creature you control and returns it", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Island", 4)], hand: ["Skycoach Conductor"] },
    });
    s = settle(cast(s, "p1", "Skycoach Conductor"));
    const conductor = idOf(s, "p1", "battlefield", "Skycoach Conductor");
    expect(chars(s, conductor).keywords).toEqual(expect.arrayContaining(["flash", "flying", "vigilance"]));
    expect(() => castExiled(s, "All Aboard", { t: [conductor] })).toThrow();
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(castExiled(s, "All Aboard", { t: [bear] }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(bear);
    expect(s.objects[back]?.tapped).toBe(false);
  });

  it("Spellbook Seeker: enters prepared; Careful Study draws two cards then discards two", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Spellbook Seeker"], library: lands("Forest", 4) } });
    s = settle(cast(s, "p1", "Spellbook Seeker"));
    s = settle(castExiled(s, "Careful Study"));
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Tester of the Tangential: at the beginning of combat, pay {X} to move X +1/+1 counters onto another creature", () => {
    let s = scenario({ p1: { battlefield: ["Tester of the Tangential", "Bear Cub", ...lands("Island", 2)] } });
    const tester = idOf(s, "p1", "battlefield", "Tester of the Tangential");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    setCounters(s, tester, 3);
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
    s = settle(s, (req) =>
      req.type === "number" ? [2] : req.type === "pick" && req.options.includes(bear) ? [bear] : undefined,
    );
    expect(s.objects[tester]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Island" && s.objects[id]?.tapped)).toHaveLength(2);
  });

  it("Textbook Tabulator: surveil 2 on entering; Increment according to the mana spent", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 7), hand: ["Textbook Tabulator", "Opt", "Homesickness"], library: lands("Forest", 6) },
    });
    s = settle(cast(s, "p1", "Textbook Tabulator"), (req) => (req.type === "pick" ? req.options : undefined));
    expect(s.players.p1?.graveyard).toHaveLength(2);
    const tab = idOf(s, "p1", "battlefield", "Textbook Tabulator");
    // 1 mana > power 0: a counter.
    s = settle(cast(s, "p1", "Opt"));
    expect(s.objects[tab]?.counters["+1/+1"]).toBe(1);
  });

  it("Wisdom of Ages: all instant and sorcery cards in the graveyard return to hand; no maximum hand size", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 7),
        hand: ["Wisdom of Ages", ...lands("Forest", 6)],
        graveyard: ["Opt", "Boltwave", "Lightning Strike", "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Wisdom of Ages"));
    expect(s.players.p1?.hand).toHaveLength(9);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(1);
    expect(exiled(s, "Wisdom of Ages")).toHaveLength(1);
    // End of turn: no discard at seven cards, neither this turn nor later.
    s = advanceUntil(s, (x) => x.turn.active === "p2" || x.pending?.kind === "discard");
    expect(s.pending?.kind).not.toBe("discard");
    expect(s.players.p1?.hand).toHaveLength(9);
  });
});

describe("Secrets of Strixhaven, lot A — noir", () => {
  /**
   * Secrets of Strixhaven, lot A - black cards: each handled card is checked against its Oracle text (plan R, lot R7).
   * Prepare (Adventurous Eater, Cheerful Osteomancer, Emeritus of Woe, Grave Researcher, Leech Collector, Scathing
   * Shadelock, Scheming Silvertongue), Repartee, Infusion, converge and spells of the color.
   */
  type S = GameState;
  /** Casts the prepared spell copy of `source` (it waits in exile). */
  const castPrepared = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const copy = s.objects[source]?.preparedCopy;
    if (!copy) throw new Error("creature not prepared");
    return act(s, player, { type: "cast", card: copy, targets });
  };
  const prepared = (s: S, id: string) => !!s.objects[id]?.preparedCopy;
  const activate = (s: S, player: string, source: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  /** Witherbloom Charm, mode "gain 5 life" ({B}{G}): enough to fill the Infusion. */
  const gainFive = (s: S) => settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));

  describe("Prepare", () => {
    it("Adventurous Eater enters prepared: Have a Bite puts a +1/+1 counter and gains 1 life", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Adventurous Eater"] } });
      s = settle(cast(s, "p1", "Adventurous Eater"));
      const eater = idOf(s, "p1", "battlefield", "Adventurous Eater");
      expect(prepared(s, eater)).toBe(true);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", eater, { t: [bear] }));
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.life).toBe(21);
      expect(prepared(s, eater)).toBe(false);
    });

    it("Cheerful Osteomancer: Raise Dead returns a creature card from your graveyard to your hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Cheerful Osteomancer"], graveyard: ["Bear Cub", "Opt"] },
      });
      s = settle(cast(s, "p1", "Cheerful Osteomancer"));
      const osteo = idOf(s, "p1", "battlefield", "Cheerful Osteomancer");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      expect(() => castPrepared(s, "p1", osteo, { t: [idOf(s, "p1", "graveyard", "Opt")] })).toThrow();
      s = settle(castPrepared(s, "p1", osteo, { t: [bear] }));
      expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
    });

    it("Emeritus of Woe: Demonic Tutor puts a card from the library into your hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Emeritus of Woe"], library: [...lands("Forest", 4), "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Emeritus of Woe"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Woe");
      expect(exiled(s, "Demonic Tutor")).toHaveLength(1);
      s = settle(castPrepared(s, "p1", emeritus), (req) =>
        req.type === "pick" ? req.options.filter((o) => nameOf(s, String(o)) === "Serra Angel") : undefined,
      );
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(4);
      expect(prepared(s, emeritus)).toBe(false);
    });

    it("Emeritus of Woe becomes prepared again at your end step if two creatures died this turn, not just one", () => {
      const run = (bears: number) => {
        let s = scenario({
          p1: { battlefield: ["Emeritus of Woe", ...lands("Swamp", 3)], hand: ["Withering Curse"] },
          p2: { battlefield: lands("Bear Cub", bears) },
        });
        const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Woe");
        expect(prepared(s, emeritus)).toBe(false);
        s = settle(cast(s, "p1", "Withering Curse"));
        expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return prepared(s, emeritus);
      };
      expect(run(2)).toBe(true);
      expect(run(1)).toBe(false);
    });

    it("Grave Researcher: at your upkeep, surveil 1, then prepared with three creature cards in the graveyard", () => {
      const run = (creatures: number) => {
        let s = scenario({
          active: "p2",
          step: "main2",
          p1: { battlefield: ["Grave Researcher"], graveyard: lands("Bear Cub", creatures), library: lands("Island", 5) },
        });
        const researcher = idOf(s, "p1", "battlefield", "Grave Researcher");
        // Surveil puts the top card (a land) into the graveyard: it doesn't count.
        s = advanceUntil(s, (x) => x.pending?.kind === "choice" && x.pending.request.intent === "surveilGraveyard", 300);
        s = settle(s, (req) => (req.type === "pick" ? req.options : undefined));
        return { s, researcher };
      };
      const { s, researcher } = run(3);
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(prepared(s, researcher)).toBe(true);
      const t = run(2);
      expect(prepared(t.s, t.researcher)).toBe(false);
    });

    it("Grave Researcher: Reanimate puts a creature from an opposing graveyard under your control, and you lose life equal to its MV", () => {
      let s = scenario({
        active: "p2",
        step: "main2",
        p1: { battlefield: ["Grave Researcher", "Swamp"], graveyard: lands("Bear Cub", 3), library: lands("Island", 5) },
        p2: { graveyard: ["Serra Angel"] },
      });
      const researcher = idOf(s, "p1", "battlefield", "Grave Researcher");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1", 300);
      expect(prepared(s, researcher)).toBe(true);
      const angel = s.players.p2?.graveyard[0] as string;
      s = settle(castPrepared(s, "p1", researcher, { t: [angel] }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.players.p1?.life).toBe(15);
    });

    it("Leech Collector becomes prepared the first time you gain life; Bloodletting: each opponent loses 2 life", () => {
      let s = scenario({
        p1: { battlefield: ["Leech Collector", "Swamp", "Swamp", "Forest"], hand: ["Witherbloom Charm"] },
      });
      const leech = idOf(s, "p1", "battlefield", "Leech Collector");
      expect(prepared(s, leech)).toBe(false);
      s = gainFive(s);
      expect(prepared(s, leech)).toBe(true);
      s = settle(castPrepared(s, "p1", leech));
      expect(s.players.p2?.life).toBe(18);
      expect(prepared(s, leech)).toBe(false);
    });

    it("Scathing Shadelock becomes prepared at the beginning of your first main phase; Venomous Words: +2/+0 and deathtouch", () => {
      let s = scenario({ active: "p2", step: "main2", p1: { battlefield: ["Scathing Shadelock", "Swamp", "Bear Cub"] } });
      const shadelock = idOf(s, "p1", "battlefield", "Scathing Shadelock");
      expect(prepared(s, shadelock)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1", 300);
      s = settle(s);
      expect(prepared(s, shadelock)).toBe(true);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castPrepared(s, "p1", shadelock, { t: [bear] }));
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, bear).keywords).toContain("deathtouch");
    });

    it("Scheming Silvertongue: prepared at the beginning of your second main phase if you gained 2 or more life; Sign in Blood", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Scheming Silvertongue", ...lands("Swamp", 3), "Forest"],
            hand: ["Witherbloom Charm"],
            library: lands("Island", 5),
          },
        });
        if (gain) s = gainFive(s);
        s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority" && x.triggers.length === 0);
        s = settle(s);
        return { s, silver: idOf(s, "p1", "battlefield", "Scheming Silvertongue") };
      };
      const { s: base, silver } = run(true);
      const c = chars(base, silver);
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      expect(prepared(base, silver)).toBe(true);
      const s = settle(castPrepared(base, "p1", silver, { t: ["p1"] }));
      // The Charm left the hand: both drawn cards.
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.life).toBe(23);
      const t = run(false);
      expect(prepared(t.s, t.silver)).toBe(false);
    });
  });

  describe("Repartee", () => {
    it("Lecturing Scornmage: a +1/+1 counter if the instant targets a creature, not if it targets a player", () => {
      let s = scenario({
        p1: { battlefield: ["Lecturing Scornmage", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const mage = idOf(s, "p1", "battlefield", "Lecturing Scornmage");
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.objects[mage]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(s.objects[mage]?.counters["+1/+1"]).toBe(1);
    });

    it("Melancholic Poet: each opponent loses 1 life and you gain 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Melancholic Poet", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Forum Necroscribe: ward (discard a card); returns a creature card from your graveyard to the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: ["Forum Necroscribe", ...lands("Mountain", 2)],
          hand: ["Lightning Strike"],
          graveyard: ["Serra Angel"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Forum Necroscribe")).keywords).toContain("ward");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(0);
    });
  });

  describe("Infusion", () => {
    it("Foolish Fate destroys the creature; if you gained life, its controller loses 3 life", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["Foolish Fate", "Witherbloom Charm"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        if (gain) s = gainFive(s);
        s = settle(cast(s, "p1", "Foolish Fate", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        return s.players.p2?.life;
      };
      expect(run(false)).toBe(20);
      expect(run(true)).toBe(17);
    });

    it("Poisoner's Apprentice: -4/-4 on an opposing creature on entering, only if you gained life", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["Poisoner's Apprentice", "Witherbloom Charm"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        if (gain) s = gainFive(s);
        s = settle(cast(s, "p1", "Poisoner's Apprentice"));
        return idsOf(s, "p2", "battlefield", "Serra Angel").length;
      };
      expect(run(false)).toBe(1);
      expect(run(true)).toBe(0);
    });

    it("Ulna Alley Shopkeep: menace; +2/+0 as long as you gained life this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Ulna Alley Shopkeep", "Swamp", "Forest"], hand: ["Witherbloom Charm"] },
      });
      const shop = idOf(s, "p1", "battlefield", "Ulna Alley Shopkeep");
      expect(chars(s, shop).keywords).toContain("menace");
      expect([chars(s, shop).power, chars(s, shop).toughness]).toEqual([2, 3]);
      s = gainFive(s);
      expect([chars(s, shop).power, chars(s, shop).toughness]).toEqual([4, 3]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, shop).power).toBe(2);
    });

    it("Tragedy Feaster: at your end step, sacrifice a permanent, unless you gained life", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: ["Tragedy Feaster", "Swamp", "Forest", "Bear Cub"], hand: ["Witherbloom Charm"] },
        });
        const feaster = idOf(s, "p1", "battlefield", "Tragedy Feaster");
        expect(chars(s, feaster).keywords).toEqual(expect.arrayContaining(["trample", "ward"]));
        if (gain) s = gainFive(s);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return s.battlefield.filter((id) => s.objects[id]?.controller === "p1").length;
      };
      expect(run(false)).toBe(3);
      expect(run(true)).toBe(4);
    });

    it("Withering Curse: -2/-2 to all creatures; with Infusion, destroys all creatures instead", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 4), "Forest"], hand: ["Withering Curse", "Witherbloom Charm"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        if (gain) s = gainFive(s);
        s = settle(cast(s, "p1", "Withering Curse"));
        return s;
      };
      const s = run(false);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([2, 2]);
      const t = run(true);
      expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    });
  });

  describe("Other cards", () => {
    it("Arcane Omens (converge): the targeted player discards as many cards as colors of mana spent", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Island", "Mountain"], hand: ["Arcane Omens"] },
        p2: { hand: lands("Plains", 5) },
      });
      s = settle(cast(s, "p1", "Arcane Omens", { t: ["p2"] }));
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(s.players.p2?.graveyard).toHaveLength(3);
    });

    it("Arnyn: a creature you control with power or toughness 1 or less dies: an opponent loses 2 life, you gain 2 life", () => {
      let s = scenario({
        p1: {
          battlefield: ["Arnyn, Deathbloom Botanist", "Burrog Banemaker", "Bear Cub", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Arnyn, Deathbloom Botanist")).keywords).toContain("deathtouch");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Burrog Banemaker")] }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });

    it("Burrog Banemaker: deathtouch; {1}{B}: +1/+1 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Burrog Banemaker", "Swamp", "Swamp"] } });
      const frog = idOf(s, "p1", "battlefield", "Burrog Banemaker");
      expect(chars(s, frog).keywords).toContain("deathtouch");
      s = settle(activate(s, "p1", frog));
      expect([chars(s, frog).power, chars(s, frog).toughness]).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, frog).power).toBe(1);
    });

    it("Cost of Brilliance: the targeted player draws two cards and loses 2 life; a +1/+1 counter on up to one creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Cost of Brilliance"] },
        p2: { library: lands("Island", 5) },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Cost of Brilliance", { p: ["p2"], c: [bear] }));
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(s.players.p2?.life).toBe(18);
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(1);
    });

    it("End of the Hunt: the opponent exiles their creature or planeswalker with the greatest mana value", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["End of the Hunt"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "p1", "End of the Hunt", { t: ["p2"] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
    });

    it("Eternal Student: {1}{B}, exile it from your graveyard: two 1/1 white and black flying Inklings", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Eternal Student"] } });
      const student = idOf(s, "p1", "graveyard", "Eternal Student");
      s = settle(activate(s, "p1", student));
      const inklings = idsOf(s, "p1", "battlefield", "Inkling");
      expect(inklings).toHaveLength(2);
      const c = chars(s, inklings[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort(), c.keywords]).toEqual([1, 1, ["B", "W"], ["flying"]]);
      expect(exiled(s, "Eternal Student")).toHaveLength(1);
    });

    it("Masterful Flourish: +1/+0 and indestructible until end of turn, only on your creature", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Masterful Flourish"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(() => cast(s, "p1", "Masterful Flourish", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] })).toThrow();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Masterful Flourish", { t: [bear] }));
      expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("indestructible");
    });

    it("Postmortem Professor: can't block; on attacking, drains 1; returns from the graveyard by exiling an instant or sorcery", () => {
      let s = scenario({ p1: { battlefield: ["Postmortem Professor"] } });
      const prof = idOf(s, "p1", "battlefield", "Postmortem Professor");
      expect(chars(s, prof).keywords).toContain("cantBlock");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: prof, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);

      let t = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Postmortem Professor", "Bear Cub"] } });
      const card = idOf(t, "p1", "graveyard", "Postmortem Professor");
      expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === card)).toBe(false);
      t = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Postmortem Professor", "Opt"] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "graveyard", "Postmortem Professor")));
      expect(idsOf(t, "p1", "battlefield", "Postmortem Professor")).toHaveLength(1);
      expect(exiled(t, "Opt")).toHaveLength(1);
    });

    it("Pull from the Grave: up to two creature cards from your graveyard to hand, and you gain 2 life", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Pull from the Grave"], graveyard: ["Bear Cub", "Serra Angel", "Opt"] },
      });
      const targets = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Serra Angel")];
      s = settle(cast(s, "p1", "Pull from the Grave", { t: targets }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Serra Angel"]);
      expect(s.players.p1?.life).toBe(22);
    });

    it('Rabid Attack: your targeted creatures get +1/+0 and "when it dies, draw a card"', () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Serra Angel", "Swamp", "Swamp", "Mountain", "Mountain"],
          hand: ["Rabid Attack", "Lightning Strike"],
          library: lands("Island", 5),
        },
      });
      const [bear, angel] = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Serra Angel")];
      s = settle(cast(s, "p1", "Rabid Attack", { t: [bear, angel] }));
      expect([chars(s, bear).power, chars(s, angel).power]).toEqual([3, 5]);
      expect(chars(s, bear).toughness).toBe(2);
      s = settle(cast(s, "p1", "Lightning Strike", { t: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Send in the Pest: each opponent discards a card, and you create a Pest", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Send in the Pest"] }, p2: { hand: ["Opt", "Opt"] } });
      s = settle(cast(s, "p1", "Send in the Pest"));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Pest")).toHaveLength(1);
    });

    it("Sneering Shadewriter: flying; on entering, each opponent loses 2 life and you gain 2 life", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Sneering Shadewriter"] } });
      s = settle(cast(s, "p1", "Sneering Shadewriter"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Sneering Shadewriter")).keywords).toContain("flying");
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });

    it("Wander Off exiles the targeted creature", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Wander Off"] }, p2: { battlefield: ["Serra Angel"] } });
      s = settle(cast(s, "p1", "Wander Off", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
    });
  });
});

describe("Secrets of Strixhaven, lot A — rouge", () => {
  /**
   * Secrets of Strixhaven, lot A - red cards: each card is checked against its Oracle text (plan R, lot R7).
   * Prepare (Blazing Firesinger, Goblin Glasswright, Maelstrom Artisan, Pigment Wrangler, Strife Scholar, Emeritus of
   * Conflict), Opus (Expressive Firedancer, Molten-Core Maestro, Tackle Artist, Thunderdrum Soloist), converge
   * (Archaic's Agony), Paradigm (Improvisation Capstone), cards that leave the graveyard (Garrison Excavator, Living
   * History), copies (Mica), damage and draw spells.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);

  /** Activates the ability of `source` whose label contains `label` (the first if absent). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, ...extra });
  };
  /** Casts the creature's prepared spell (its copy in exile). */
  const castPrepared = (s: S, spellName: string, targets?: Record<string, string[]>) => {
    const copy = exiled(s, spellName)[0];
    if (!copy) throw new Error(`${spellName} is not in exile`);
    return act(s, "p1", { type: "cast", card: copy, targets });
  };

  describe("Ancestral Anger", () => {
    it("trample and +X/+0, X = 1 plus the Ancestral Anger in your graveyard; draw a card", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Mountain", "Mountain"],
          hand: ["Ancestral Anger", "Ancestral Anger"],
          graveyard: ["Ancestral Anger", "Ancestral Anger"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const [first, second] = idsOf(s, "p1", "hand", "Ancestral Anger") as [string, string];
      s = settle(act(s, "p1", { type: "cast", card: first, targets: { t: [bear] } }));
      // Two copies in the graveyard during resolution (the spell itself is on the stack): +3/+0.
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(act(s, "p1", { type: "cast", card: second, targets: { t: [bear] } }));
      // Three in the graveyard this time: +4/+0 more.
      expect(pt(s, bear)).toEqual([9, 2]);
    });
  });

  describe("Archaic's Agony", () => {
    it("converge: X damage (five colors); the excess exiles as many cards, playable until the end of your next turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Plains", "Island", "Swamp", "Mountain", "Forest"],
          hand: ["Archaic's Agony"],
          library: ["Forest", "Island", "Swamp", "Plains"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Archaic's Agony", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      // 5 damage to a 2/2: 3 excess, three cards exiled.
      expect(s.players.p1?.library).toHaveLength(1);
      expect(s.exile).toHaveLength(3);
      const forest = exiled(s, "Forest")[0] as string;
      s = act(s, "p1", { type: "playLand", card: forest });
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(2);
      expect(exiled(s, "Forest")).toHaveLength(0);
    });

    it("a single color spent: 1 damage, no excess, nothing is exiled", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Archaic's Agony"], library: lands("Forest", 4) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Archaic's Agony", { t: [bear] }));
      expect(s.objects[bear]?.damage).toBe(1);
      expect(s.exile).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(4);
    });
  });

  describe("Artistic Process", () => {
    const run = (mode: number, targets?: (s: S) => Record<string, string[]>) => {
      const s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 5)], hand: ["Artistic Process"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      return settle(cast(s, "p1", "Artistic Process", targets?.(s), { mode }));
    };

    it("6 damage to a targeted creature", () => {
      const s = run(0, (x: S) => ({ t: [idOf(x, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("2 damage to each creature you don't control", () => {
      const s = run(1);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.damage).toBe(0);
    });

    it("a 3/3 blue and red flying Elemental, with haste until end of turn", () => {
      let s = run(2);
      const token = idOf(s, "p1", "battlefield", "Elemental");
      const c = chars(s, token);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([3, 3, ["R", "U"]]);
      expect(c.keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, token).keywords).not.toContain("haste");
    });
  });

  describe("Prepare", () => {
    it("Blazing Firesinger: enters prepared; Seething Song adds {R}{R}{R}{R}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Blazing Firesinger", "Artistic Process"] } });
      s = settle(cast(s, "p1", "Blazing Firesinger"));
      const singer = idOf(s, "p1", "battlefield", "Blazing Firesinger");
      expect(s.objects[singer]?.preparedCopy).toBe(exiled(s, "Seething Song")[0]);
      s = settle(castPrepared(s, "Seething Song"));
      expect(s.players.p1?.manaPool.R).toBe(5);
      expect(s.objects[singer]?.preparedCopy).toBeUndefined();
      // The mana is used to cast a five-mana spell with no other land.
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 2 }));
      expect(idsOf(s, "p1", "battlefield", "Elemental")).toHaveLength(1);
    });

    it("Goblin Glasswright: Craft with Pride creates a Treasure", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Goblin Glasswright"] } });
      s = settle(cast(s, "p1", "Goblin Glasswright"));
      s = settle(castPrepared(s, "Craft with Pride"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
    });

    it("Maelstrom Artisan: haste; Rocket Volley destroys a nonbasic land, not a basic land", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Maelstrom Artisan"] },
        p2: { battlefield: ["Sundown Pass", "Plains"] },
      });
      s = settle(cast(s, "p1", "Maelstrom Artisan"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Maelstrom Artisan")).keywords).toContain("haste");
      expect(() => castPrepared(s, "Rocket Volley", { t: [idOf(s, "p2", "battlefield", "Plains")] })).toThrow();
      s = settle(castPrepared(s, "Rocket Volley", { t: [idOf(s, "p2", "battlefield", "Sundown Pass")] }));
      expect(idsOf(s, "p2", "graveyard", "Sundown Pass")).toHaveLength(1);
    });

    it("Strife Scholar: ward; Awaken the Ages creates two 2/2 red and white Spirits", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 9), hand: ["Strife Scholar"] } });
      s = settle(cast(s, "p1", "Strife Scholar"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Strife Scholar")).keywords).toContain("ward");
      s = settle(castPrepared(s, "Awaken the Ages"));
      const spirits = idsOf(s, "p1", "battlefield", "Spirit");
      expect(spirits).toHaveLength(2);
      const c = chars(s, spirits[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort()]).toEqual([2, 2, ["R", "W"]]);
    });

    it("Pigment Wrangler: flying; Striking Palette copies the next instant or sorcery cast this turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 10), hand: ["Pigment Wrangler", "Lightning Strike", "Lightning Strike"] },
      });
      s = settle(cast(s, "p1", "Pigment Wrangler"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Pigment Wrangler")).keywords).toContain("flying");
      s = settle(castPrepared(s, "Striking Palette"));
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      // The spell and its copy: 6 damage.
      expect(s.players.p2?.life).toBe(14);
      // Only once: the second Lightning Strike is not copied.
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(11);
    });

    it("Emeritus of Conflict: first strike; your third spell of the turn prepares it, Lightning Bolt deals 3 damage", () => {
      let s = scenario({
        p1: {
          battlefield: ["Emeritus of Conflict", ...lands("Island", 3), "Mountain"],
          hand: ["Opt", "Opt", "Opt"],
          library: lands("Forest", 5),
        },
      });
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Conflict");
      expect(chars(s, emeritus).keywords).toContain("firstStrike");
      for (let i = 0; i < 2; i++) s = settle(cast(s, "p1", "Opt"));
      expect(exiled(s, "Lightning Bolt")).toHaveLength(0);
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[emeritus]?.preparedCopy).toBe(exiled(s, "Lightning Bolt")[0]);
      s = settle(castPrepared(s, "Lightning Bolt", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
    });
  });

  describe("Opus", () => {
    it("Expressive Firedancer: +1/+1; five or more mana: double strike too", () => {
      let s = scenario({
        p1: {
          battlefield: ["Expressive Firedancer", "Island", ...lands("Mountain", 5)],
          hand: ["Opt", "Artistic Process"],
          library: lands("Forest", 3),
        },
      });
      const dancer = idOf(s, "p1", "battlefield", "Expressive Firedancer");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, dancer)).toEqual([3, 3]);
      expect(chars(s, dancer).keywords).not.toContain("doubleStrike");
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect(pt(s, dancer)).toEqual([4, 4]);
      expect(chars(s, dancer).keywords).toContain("doubleStrike");
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, dancer)).toEqual([2, 2]);
      expect(chars(s, dancer).keywords).not.toContain("doubleStrike");
    });

    it("Molten-Core Maestro: a +1/+1 counter; five or more mana: as much {R} as its power", () => {
      let s = scenario({
        p1: {
          battlefield: ["Molten-Core Maestro", "Island", ...lands("Mountain", 5)],
          hand: ["Opt", "Artistic Process"],
          library: lands("Forest", 3),
        },
      });
      const maestro = idOf(s, "p1", "battlefield", "Molten-Core Maestro");
      expect(chars(s, maestro).keywords).toContain("menace");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[maestro]?.counters["+1/+1"]).toBe(1);
      expect(s.players.p1?.manaPool.R ?? 0).toBe(0);
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect(s.objects[maestro]?.counters["+1/+1"]).toBe(2);
      // Power 4 after the second counter.
      expect(s.players.p1?.manaPool.R).toBe(4);
    });

    it("Tackle Artist: a +1/+1 counter, two if five or more mana; a creature spell doesn't count", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tackle Artist", "Island", "Forest", ...lands("Mountain", 6)],
          hand: ["Opt", "Artistic Process", "Bear Cub"],
          library: lands("Forest", 3),
        },
      });
      const artist = idOf(s, "p1", "battlefield", "Tackle Artist");
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[artist]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[artist]?.counters["+1/+1"]).toBe(1);
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect(s.objects[artist]?.counters["+1/+1"]).toBe(3);
    });

    it("Thunderdrum Soloist: 1 damage to each opponent, 3 instead if five or more mana", () => {
      let s = scenario({
        players: 3,
        p1: {
          battlefield: ["Thunderdrum Soloist", "Island", ...lands("Mountain", 5)],
          hand: ["Opt", "Artistic Process"],
          library: lands("Forest", 3),
        },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Thunderdrum Soloist")).keywords).toContain("reach");
      s = settle(cast(s, "p1", "Opt"));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 19]);
      s = settle(cast(s, "p1", "Artistic Process", undefined, { mode: 1 }));
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 16, 16]);
    });
  });

  describe("Cards that leave your graveyard", () => {
    it("Garrison Excavator: a 2/2 Spirit when cards leave your graveyard (Duel Tactics flashback)", () => {
      let s = scenario({
        p1: { battlefield: ["Garrison Excavator", ...lands("Mountain", 2)], graveyard: ["Duel Tactics"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Garrison Excavator")).keywords).toContain("menace");
      const tactics = idOf(s, "p1", "graveyard", "Duel Tactics");
      s = settle(act(s, "p1", { type: "cast", card: tactics, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
      expect(exiled(s, "Duel Tactics")).toHaveLength(1);
    });

    it("Living History: a Spirit on entering; you attack after a card left your graveyard: +2/+0 to an attacker", () => {
      const run = (leave: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", ...lands("Mountain", 4)],
            hand: ["Living History"],
            graveyard: ["Duel Tactics"],
          },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Living History"));
        expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
        if (leave) {
          const tactics = idOf(s, "p1", "graveyard", "Duel Tactics");
          s = settle(
            act(s, "p1", { type: "cast", card: tactics, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
          );
        }
        s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
        s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.turn.step === "declareAttackers");
        return pt(s, bear);
      };
      expect(run(true)).toEqual([4, 2]);
      expect(run(false)).toEqual([2, 2]);
    });

    it("Zealous Lorecaster: returns an instant or sorcery card from your graveyard to hand (not a creature)", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 6), hand: ["Zealous Lorecaster"], graveyard: ["Lightning Strike", "Bear Cub"] },
      });
      s = cast(s, "p1", "Zealous Lorecaster");
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.triggers.length > 0 || x.stack.length === 0);
      s = settle(s, (req) => {
        if (req.type !== "pick") return undefined;
        expect(req.options).not.toContain(idOf(s, "p1", "graveyard", "Bear Cub"));
        return [idOf(s, "p1", "graveyard", "Lightning Strike")];
      });
      expect(idsOf(s, "p1", "hand", "Lightning Strike")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("Mica, Reader of Ruins", () => {
    it("ward; you may sacrifice an artifact: if you do, the instant or sorcery spell is copied", () => {
      const run = (sacrifice: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Mica, Reader of Ruins", "Tablet of Discovery", ...lands("Mountain", 2)],
            hand: ["Lightning Strike"],
          },
        });
        expect(chars(s, idOf(s, "p1", "battlefield", "Mica, Reader of Ruins")).keywords).toContain("ward");
        const tablet = idOf(s, "p1", "battlefield", "Tablet of Discovery");
        s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }), (req) => {
          if (req.type === "yesNo") return [sacrifice ? 1 : 0];
          if (req.type === "pick" && req.options.includes(tablet)) return sacrifice ? [tablet] : [];
          return undefined;
        });
        return s;
      };
      const yes = run(true);
      expect(yes.players.p2?.life).toBe(14);
      expect(idsOf(yes, "p1", "graveyard", "Tablet of Discovery")).toHaveLength(1);
      const no = run(false);
      expect(no.players.p2?.life).toBe(17);
      expect(idsOf(no, "p1", "battlefield", "Tablet of Discovery")).toHaveLength(1);
    });
  });

  describe("Rubble Rouser", () => {
    it("on entering, you may discard a card to draw one", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Rubble Rouser", "Opt"], library: ["Island", "Forest"] },
      });
      s = settle(cast(s, "p1", "Rubble Rouser"), (req) =>
        req.type === "yesNo" ? [1] : req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === "Opt") : undefined,
      );
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
    });

    it("{T}, exile a card from your graveyard: add {R}, then 1 damage to each opponent", () => {
      let s = scenario({ p1: { battlefield: ["Rubble Rouser"], graveyard: ["Opt"] } });
      const rouser = idOf(s, "p1", "battlefield", "Rubble Rouser");
      s = activate(s, "p1", rouser, "Exile");
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      s = settle(s);
      expect(s.players.p2?.life).toBe(19);
    });

    it("with no card in the graveyard, the ability can't be activated", () => {
      const s = scenario({ p1: { battlefield: ["Rubble Rouser"] } });
      const rouser = idOf(s, "p1", "battlefield", "Rubble Rouser");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === rouser)).toBe(false);
    });
  });

  describe("Steal the Show", () => {
    it("the targeted player discards as many cards as they want, then draws that many", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Steal the Show"] },
        p2: { hand: ["Opt", "Opt", "Bear Cub"], library: lands("Island", 5) },
      });
      s = settle(cast(s, "p1", "Steal the Show", { p: ["p2"] }, { mode: 0 }), (req, player) =>
        player === "p2" && req.type === "pick" ? req.options.filter((id) => nameOf(s, id) === "Opt") : undefined,
      );
      expect(s.players.p2?.graveyard).toHaveLength(2);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Island", "Island"]);
    });

    it("damage equal to the number of instant and sorcery cards in your graveyard; both modes together", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 3),
          hand: ["Steal the Show"],
          graveyard: ["Opt", "Lightning Strike", "Duel Tactics", "Bear Cub"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Steal the Show", { p: ["p1"], c: [angel] }, { mode: 2 }), (req) =>
        req.type === "pick" ? [] : undefined,
      );
      expect(s.objects[angel]?.damage).toBe(3);
    });
  });

  describe("Damage spells", () => {
    it("Duel Tactics: 1 damage and the creature can't block this turn; flashback {1}{R}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Duel Tactics"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Duel Tactics", { t: [angel] }));
      expect(s.objects[angel]?.damage).toBe(1);
      expect(chars(s, angel).keywords).toContain("cantBlock");
      const card = idOf(s, "p1", "graveyard", "Duel Tactics");
      expect(castOptions(s, "p1", card)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [angel] } }));
      expect(s.objects[angel]?.damage).toBe(2);
      expect(exiled(s, "Duel Tactics")).toHaveLength(1);
    });

    it("Heated Argument: 6 damage; a card exiled from the graveyard: 2 damage to the creature's controller", () => {
      const run = (exile: boolean) => {
        let s = scenario({
          p1: { battlefield: lands("Mountain", 5), hand: ["Heated Argument"], graveyard: ["Opt"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        s = settle(cast(s, "p1", "Heated Argument", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) =>
          req.type === "pick" ? (exile ? req.options.slice(0, 1) : []) : undefined,
        );
        expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
        return s;
      };
      const yes = run(true);
      expect(yes.players.p2?.life).toBe(18);
      expect(exiled(yes, "Opt")).toHaveLength(1);
      const no = run(false);
      expect(no.players.p2?.life).toBe(20);
      expect(idsOf(no, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Tome Blast: 2 damage to any target; flashback {4}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 7), hand: ["Tome Blast"] } });
      s = settle(cast(s, "p1", "Tome Blast", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(18);
      const card = idOf(s, "p1", "graveyard", "Tome Blast");
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(16);
      expect(exiled(s, "Tome Blast")).toHaveLength(1);
    });

    it("Unsubtle Mockery: 4 damage to a creature, then surveil 1", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Unsubtle Mockery"], library: ["Island", "Forest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Unsubtle Mockery", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) =>
        req.type === "pick" ? req.options.slice(0, 1) : undefined,
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Unsubtle Mockery")).toHaveLength(1);
      expect(s.players.p1?.graveyard.length).toBe(2);
      expect(s.players.p1?.library).toHaveLength(1);
    });
  });

  describe("Charging Strifeknight", () => {
    it("haste; {T}, discard a card: draw a card", () => {
      let s = scenario({ p1: { battlefield: ["Charging Strifeknight"], hand: ["Opt"], library: ["Island"] } });
      const knight = idOf(s, "p1", "battlefield", "Charging Strifeknight");
      expect(chars(s, knight).keywords).toContain("haste");
      s = settle(activate(s, "p1", knight, undefined, { discard: [idOf(s, "p1", "hand", "Opt")] }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      expect(s.objects[knight]?.tapped).toBe(true);
    });
  });

  describe("Improvisation Capstone", () => {
    it("exiles up to a total mana value of 4 or more; the exiled spells are cast without paying their cost", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 7),
          hand: ["Improvisation Capstone"],
          library: ["Lightning Strike", "Forest", "Bear Cub", "Serra Angel", "Island"],
        },
      });
      s = untilCastNow(cast(s, "p1", "Improvisation Capstone"));
      // Lightning Strike (2) + Forest (0) + Bear Cub (2) = 4: three cards exiled, the land is not offered.
      expect(s.players.p1?.library).toHaveLength(2);
      const strike = exiled(s, "Lightning Strike")[0] as string;
      const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
      expect([...(castNowOf(s)?.cards ?? [])].sort()).toEqual([strike, bear].sort());
      s = act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "cast", card: bear });
      s = settle(s);
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      // Paradigm: the spell is exiled after it resolves.
      expect(exiled(s, "Improvisation Capstone")).toHaveLength(1);
      // Mana: only the seven lands were used for the Capstone; the exiled spells were free.
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(7);
    });
  });
});

describe("Secrets of Strixhaven, lot A — vert", () => {
  /**
   * Secrets of Strixhaven, lot A - green cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, lot R7): Opus and Increment in numbers, Fractals, Infusion, prepare (Regrowth, Stream of Life,
   * Rampant Growth, Bind to Life), converge, stun counters on entering.
   */
  type S = GameState;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Activates the ability of `source` whose label contains `label` (the first if absent). */
  const activate = (s: S, player: string, source: string, label?: string, targets?: Record<string, string[]>) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets });
  };
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((a) => a.type === "activate" && a.source === source);
  /** Casts the prepared spell of `creature` (its copy in exile). */
  const castPrepared = (s: S, creature: string, targets?: Record<string, string[]>, extra: object = {}) => {
    const copy = s.objects[creature]?.preparedCopy;
    if (!copy) throw new Error("creature not prepared");
    return act(s, s.objects[creature]?.controller ?? "p1", { type: "cast", card: copy, targets, ...extra });
  };
  /** Declares `attacker` as attacking player p2. */
  const attackWith = (s: S, name: string) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const id = idOf(cur, "p1", "battlefield", name);
    cur = act(cur, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
    return cur;
  };

  it("Aberrant Manawurm: trample; each instant or sorcery cast gives it +X/+0, X = mana spent", () => {
    let s = scenario({
      p1: { battlefield: ["Aberrant Manawurm", "Island", ...lands("Mountain", 2)], hand: ["Opt", "Lightning Strike"] },
    });
    const wurm = idOf(s, "p1", "battlefield", "Aberrant Manawurm");
    expect(chars(s, wurm).keywords).toContain("trample");
    s = settle(cast(s, "p1", "Opt"));
    expect(pt(s, wurm)).toEqual([3, 5]);
    s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
    expect(pt(s, wurm)).toEqual([5, 5]);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(pt(s, wurm)).toEqual([2, 5]);
  });

  it("Additive Evolution: a green and blue 0/0 Fractal with three counters; at the beginning of combat, a counter and vigilance", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Additive Evolution"] } });
    s = settle(cast(s, "p1", "Additive Evolution"));
    const fractal = idOf(s, "p1", "battlefield", "Fractal");
    expect(s.objects[fractal]?.isToken).toBe(true);
    expect([...chars(s, fractal).colors].sort()).toEqual(["G", "U"]);
    expect(pt(s, fractal)).toEqual([3, 3]);
    expect(chars(s, fractal).keywords).not.toContain("vigilance");
    // The Fractal just entered: no attack, this turn's combat passes through to the second main phase.
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(s.objects[fractal]?.counters["+1/+1"]).toBe(4);
    expect(chars(s, fractal).keywords).toContain("vigilance");
  });

  describe("Ambitious Augmenter", () => {
    it("Increment, then dying with counters: a Fractal that receives its counters", () => {
      let s = scenario({ p1: { battlefield: ["Ambitious Augmenter", ...lands("Mountain", 2)], hand: ["Lightning Strike"] } });
      const augmenter = idOf(s, "p1", "battlefield", "Ambitious Augmenter");
      // Lightning Strike: 2 mana > power 1 -> a counter (resolved before the spell), then 3 damage kills it.
      s = settle(cast(s, "p1", "Lightning Strike", { t: [augmenter] }));
      expect(idsOf(s, "p1", "graveyard", "Ambitious Augmenter")).toHaveLength(1);
      const fractal = idOf(s, "p1", "battlefield", "Fractal");
      expect(s.objects[fractal]?.counters["+1/+1"]).toBe(1);
      expect(pt(s, fractal)).toEqual([1, 1]);
    });

    it("no counter on dying: no Fractal", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Ambitious Augmenter"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      s = settle(cast(s, "p2", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Ambitious Augmenter")] }));
      expect(idsOf(s, "p1", "graveyard", "Ambitious Augmenter")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Fractal")).toHaveLength(0);
    });
  });

  it("Burrog Barrage: +1/+0 only after another instant or sorcery, then damage equal to its power", () => {
    const run = (optFirst: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Island", ...lands("Forest", 2)], hand: ["Opt", "Burrog Barrage"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      if (optFirst) s = settle(cast(s, "p1", "Opt"));
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Burrog Barrage", { a: [idOf(s, "p1", "battlefield", "Bear Cub")], b: [angel] }));
      return s.objects[angel]?.damage;
    };
    expect(run(false)).toBe(2);
    expect(run(true)).toBe(3);
  });

  it("Chelonian Tackle: +0/+10, then it fights an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Chelonian Tackle"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "p1", "Chelonian Tackle", { a: [bear], b: [angel] }));
    expect(pt(s, bear)).toEqual([2, 12]);
    expect(s.objects[bear]?.damage).toBe(4);
    expect(s.objects[angel]?.damage).toBe(2);
  });

  it("Comforting Counsel: a growth counter per life gain; at five, your creatures get +3/+3", () => {
    let s = scenario({
      p1: {
        battlefield: ["Comforting Counsel", "Bear Cub", ...lands("Forest", 2)],
        hand: ["Oracle's Restoration", "Oracle's Restoration"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    const counsel = idOf(s, "p1", "battlefield", "Comforting Counsel");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const theirs = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
    expect(s.objects[counsel]?.counters.growth).toBe(1);
    expect(pt(s, bear)).toEqual([3, 3]);
    // Three more gains (set up directly), then the fifth through a spell.
    (s.objects[counsel] as { counters: Record<string, number> }).counters.growth = 4;
    s.version += 1;
    expect(pt(s, bear)).toEqual([3, 3]);
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
    expect(s.objects[counsel]?.counters.growth).toBe(5);
    expect(pt(s, bear)).toEqual([2 + 2 + 3, 2 + 2 + 3]);
    expect(pt(s, theirs)).toEqual([2, 2]);
  });

  it("Efflorescence: two +1/+1 counters; Infusion: trample and indestructible until end of turn", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4)], hand: ["Oracle's Restoration", "Efflorescence"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      if (gain) s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
      s = settle(cast(s, "p1", "Efflorescence", { t: [bear] }));
      return { counters: s.objects[bear]?.counters["+1/+1"], keywords: chars(s, bear).keywords };
    };
    const plain = run(false);
    expect(plain.counters).toBe(2);
    expect(plain.keywords).not.toContain("trample");
    const infused = run(true);
    expect(infused.counters).toBe(2);
    expect(infused.keywords).toEqual(expect.arrayContaining(["trample", "indestructible"]));
  });

  describe("Emeritus of Abundance", () => {
    it("vigilance; enters prepared: Regrowth returns a card from your graveyard to your hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Emeritus of Abundance"], graveyard: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Emeritus of Abundance"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Abundance");
      expect(chars(s, emeritus).keywords).toContain("vigilance");
      expect(exiled(s, "Regrowth")).toHaveLength(1);
      s = settle(castPrepared(s, emeritus, { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }));
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
    });

    it("on attacking with eight or more lands, it becomes prepared; with seven, no", () => {
      const run = (n: number) => {
        const s = settle(
          attackWith(
            scenario({ p1: { battlefield: ["Emeritus of Abundance", ...lands("Forest", n)] } }),
            "Emeritus of Abundance",
          ),
        );
        return exiled(s, "Regrowth").length;
      };
      expect(run(8)).toBe(1);
      expect(run(7)).toBe(0);
    });
  });

  it("Emil, Vastlands Roamer: trample for creatures with +1/+1 counters; Fractal with X counters (land names)", () => {
    let s = scenario({
      p1: { battlefield: ["Emil, Vastlands Roamer", ...lands("Forest", 3), "Island", "Swamp"] },
    });
    const emil = idOf(s, "p1", "battlefield", "Emil, Vastlands Roamer");
    expect(chars(s, emil).keywords).not.toContain("trample");
    s = settle(activate(s, "p1", emil));
    const fractal = idOf(s, "p1", "battlefield", "Fractal");
    // Forest, Island, Swamp: three different names.
    expect(s.objects[fractal]?.counters["+1/+1"]).toBe(3);
    expect(chars(s, fractal).keywords).toContain("trample");
    expect(s.objects[emil]?.tapped).toBe(true);
  });

  it("Environmental Scientist: on entering, you may search for a basic land card and put it into your hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 2), hand: ["Environmental Scientist"], library: ["Bear Cub", "Island", "Opt"] },
    });
    s = settle(cast(s, "p1", "Environmental Scientist"), (req) => (req.type === "yesNo" ? [1] : undefined));
    expect(idsOf(s, "p1", "hand", "Island")).toHaveLength(1);
    expect(s.players.p1?.library).toHaveLength(2);
  });

  it("Follow the Lumarets: a creature or land from among four; Infusion: up to two; the rest on the bottom", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 3)],
          hand: ["Oracle's Restoration", "Follow the Lumarets"],
          library: ["Swamp", "Bear Cub", "Opt", "Island", "Serra Angel", "Lightning Strike"],
        },
      });
      if (gain) s = settle(cast(s, "p1", "Oracle's Restoration", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      let max = 0;
      const before = s.players.p1?.hand.length ?? 0;
      s = settle(cast(s, "p1", "Follow the Lumarets"), (req) => {
        if (req.type !== "pick") return undefined;
        max = req.max;
        // Opt is neither a creature nor a land.
        expect(req.options.map((id) => nameOf(s, id))).not.toContain("Opt");
        return req.options.slice(0, req.max);
      });
      return { max, gained: (s.players.p1?.hand.length ?? 0) - (before - 1), lib: s.players.p1?.library.length };
    };
    expect(run(false)).toEqual({ max: 1, gained: 1, lib: 5 });
    // With Oracle's Restoration (a card drawn earlier): two cards taken.
    expect(run(true)).toEqual({ max: 2, gained: 2, lib: 3 });
  });

  it("Germination Practicum: two +1/+1 counters on each of your creatures; Paradigm (exiled)", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", ...lands("Forest", 5)], hand: ["Germination Practicum"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Germination Practicum"));
    for (const id of idsOf(s, "p1", "battlefield", "Bear Cub")) expect(s.objects[id]?.counters["+1/+1"]).toBe(2);
    expect(s.objects[idOf(s, "p2", "battlefield", "Bear Cub")]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(exiled(s, "Germination Practicum")).toHaveLength(1);
  });

  describe("Glorious Decay", () => {
    it("4 damage to a creature with flying (a creature without flying is not a legal target)", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Glorious Decay"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      expect(() => cast(s, "p1", "Glorious Decay", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }, { mode: 1 })).toThrow();
      s = settle(cast(s, "p1", "Glorious Decay", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }, { mode: 1 }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("exiles a card from a graveyard and you draw a card", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Glorious Decay"] },
        p2: { graveyard: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Glorious Decay", { t: [idOf(s, "p2", "graveyard", "Serra Angel")] }, { mode: 2 }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });

  it("Infirmary Healer: enters prepared; Stream of Life makes the targeted player gain X life", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Infirmary Healer"] } });
    s = settle(cast(s, "p1", "Infirmary Healer"));
    const healer = idOf(s, "p1", "battlefield", "Infirmary Healer");
    s = settle(castPrepared(s, healer, { t: ["p1"] }, { x: 3 }));
    expect(s.players.p1?.life).toBe(23);
    expect(exiled(s, "Stream of Life")).toHaveLength(0);
  });

  it("Lumaret's Favor: +2/+4; Infusion: the spell is copied when cast", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 3)], hand: ["Oracle's Restoration", "Lumaret's Favor"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      if (gain) s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
      s = settle(cast(s, "p1", "Lumaret's Favor", { t: [bear] }));
      return pt(s, bear);
    };
    expect(run(false)).toEqual([4, 6]);
    expect(run(true)).toEqual([2 + 1 + 4, 2 + 1 + 8]);
  });

  it("Mindful Biomancer: 1 life on entering; {2}{G}: +2/+2, only once each turn", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 8), hand: ["Mindful Biomancer"] } });
    s = settle(cast(s, "p1", "Mindful Biomancer"));
    expect(s.players.p1?.life).toBe(21);
    const biomancer = idOf(s, "p1", "battlefield", "Mindful Biomancer");
    s = settle(activate(s, "p1", biomancer));
    expect(pt(s, biomancer)).toEqual([4, 4]);
    expect(canActivate(s, "p1", biomancer)).toBe(false);
  });

  it("Noxious Newt: deathtouch; {T}: add {G}", () => {
    const s = scenario({ p1: { battlefield: ["Noxious Newt"] } });
    const newt = idOf(s, "p1", "battlefield", "Noxious Newt");
    expect(chars(s, newt).keywords).toContain("deathtouch");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === newt && a.colors.includes("G"))).toBe(true);
  });

  it("Oracle's Restoration: +1/+1 on your creature, you draw a card and gain 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub", "Forest"], hand: ["Oracle's Restoration"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [bear] }));
    expect(pt(s, bear)).toEqual([3, 3]);
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Pestbrood Sloth: on dying, two 1/1 black and green Pests", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Pestbrood Sloth", damage: 1 }, ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
    });
    s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p1", "battlefield", "Pestbrood Sloth")] }));
    const pests = idsOf(s, "p1", "battlefield", "Pest");
    expect(pests).toHaveLength(2);
    expect([...chars(s, pests[0] as string).colors].sort()).toEqual(["B", "G"]);
  });

  it("Planar Engineering: sacrifice two lands, then four basic lands enter tapped", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Planar Engineering"],
        library: [...lands("Island", 2), ...lands("Swamp", 2), "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Planar Engineering"));
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(2);
    expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(2);
    const fetched = [...idsOf(s, "p1", "battlefield", "Island"), ...idsOf(s, "p1", "battlefield", "Swamp")];
    expect(fetched).toHaveLength(4);
    expect(fetched.every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  it("Shopkeeper's Bane: trample; on attacking, you gain 2 life", () => {
    let s = scenario({ p1: { battlefield: ["Shopkeeper's Bane"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Shopkeeper's Bane")).keywords).toContain("trample");
    s = settle(attackWith(s, "Shopkeeper's Bane"));
    expect(s.players.p1?.life).toBe(22);
  });

  it("Slumbering Trudge: enters with 3 - X stun counters, tapped if X <= 2", () => {
    const run = (x: number) => {
      let s = scenario({ p1: { battlefield: lands("Forest", x + 1), hand: ["Slumbering Trudge"] } });
      s = settle(cast(s, "p1", "Slumbering Trudge", undefined, { x }));
      const o = s.objects[idOf(s, "p1", "battlefield", "Slumbering Trudge")];
      return [o?.counters.stun ?? 0, o?.tapped];
    };
    expect(run(0)).toEqual([3, true]);
    expect(run(1)).toEqual([2, true]);
    expect(run(2)).toEqual([1, true]);
    expect(run(3)).toEqual([0, false]);
  });

  it("Snarl Song: converge, two Fractals with X counters and X life (X = colors spent)", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 5), "Island"], hand: ["Snarl Song"] } });
    s = settle(cast(s, "p1", "Snarl Song"));
    const fractals = idsOf(s, "p1", "battlefield", "Fractal");
    expect(fractals).toHaveLength(2);
    for (const id of fractals) expect(pt(s, id)).toEqual([2, 2]);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Studious First-Year: enters prepared; Rampant Growth puts a basic land onto the battlefield tapped", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Studious First-Year"], library: ["Bear Cub", "Island"] } });
    s = settle(cast(s, "p1", "Studious First-Year"));
    const student = idOf(s, "p1", "battlefield", "Studious First-Year");
    s = settle(castPrepared(s, student));
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    expect(s.objects[student]?.preparedCopy).toBeUndefined();
  });

  describe("Tenured Concocter", () => {
    it("targeted by an opposing spell: you may draw a card", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Tenured Concocter"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
      });
      const concocter = idOf(s, "p1", "battlefield", "Tenured Concocter");
      expect(chars(s, concocter).keywords).toContain("vigilance");
      s = settle(cast(s, "p2", "Lightning Strike", { t: [concocter] }), (req, p) =>
        req.type === "yesNo" && p === "p1" ? [1] : undefined,
      );
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[concocter]?.damage).toBe(3);
    });

    it("Infusion: +2/+0 as long as you gained life this turn; your own spells don't make you draw", () => {
      let s = scenario({ p1: { battlefield: ["Tenured Concocter", "Forest"], hand: ["Oracle's Restoration"] } });
      const concocter = idOf(s, "p1", "battlefield", "Tenured Concocter");
      expect(pt(s, concocter)).toEqual([4, 5]);
      s = settle(cast(s, "p1", "Oracle's Restoration", { t: [concocter] }));
      expect(pt(s, concocter)).toEqual([7, 6]);
      // Only Restoration's draw.
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, concocter)).toEqual([4, 5]);
    });
  });

  it("Thornfist Striker: ward {1}; Infusion: your creatures get +1/+0 and trample", () => {
    let s = scenario({
      p1: { battlefield: ["Thornfist Striker", "Bear Cub", "Forest"], hand: ["Oracle's Restoration"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const striker = idOf(s, "p1", "battlefield", "Thornfist Striker");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, striker).keywords).toContain("ward");
    expect(chars(s, bear).keywords).not.toContain("trample");
    s = settle(cast(s, "p1", "Oracle's Restoration", { t: [striker] }));
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toContain("trample");
    expect(pt(s, striker)).toEqual([5, 4]);
    expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Topiary Lecturer: Increment; {T}: as much {G} as its power", () => {
    let s = scenario({ p1: { battlefield: ["Topiary Lecturer", ...lands("Forest", 2)], hand: ["Bear Cub", "Bear Cub"] } });
    const lecturer = idOf(s, "p1", "battlefield", "Topiary Lecturer");
    const [a, b] = idsOf(s, "p1", "hand", "Bear Cub");
    // 2 mana > power 1: a counter.
    s = settle(act(s, "p1", { type: "cast", card: a as string }));
    expect(pt(s, lecturer)).toEqual([2, 3]);
    // Tapped Forests: the Professor produces {G}{G} on its own; 2 mana exceeds neither its power nor its toughness.
    s = settle(act(s, "p1", { type: "cast", card: b as string }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
    expect(s.objects[lecturer]?.tapped).toBe(true);
    expect(pt(s, lecturer)).toEqual([2, 3]);
  });

  it("Vastlands Scavenger: deathtouch; Bind to Life mills seven cards and a milled creature enters", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 8),
        hand: ["Vastlands Scavenger"],
        library: [...lands("Island", 3), "Serra Angel", ...lands("Island", 3), "Bear Cub"],
      },
    });
    s = settle(cast(s, "p1", "Vastlands Scavenger"));
    const scavenger = idOf(s, "p1", "battlefield", "Vastlands Scavenger");
    expect(chars(s, scavenger).keywords).toContain("deathtouch");
    s = settle(castPrepared(s, scavenger));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    // Seven cards milled, including the Angel put back onto the battlefield.
    expect(s.players.p1?.graveyard).toHaveLength(6);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  it("Wild Hypothesis: a Fractal with X counters, then surveil 2", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Wild Hypothesis"], library: ["Opt", "Island", "Bear Cub"] },
    });
    let surveilled = 0;
    s = settle(cast(s, "p1", "Wild Hypothesis", undefined, { x: 2 }), (req) => {
      if (req.type !== "pick") return undefined;
      surveilled = req.options.length;
      return req.options;
    });
    expect(pt(s, idOf(s, "p1", "battlefield", "Fractal"))).toEqual([2, 2]);
    expect(surveilled).toBe(2);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
  });

  it("Zimone's Experiment: up to two creatures or lands from among five: lands tapped onto the battlefield, creatures to hand", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Zimone's Experiment"],
        library: ["Bear Cub", "Opt", "Island", "Serra Angel", "Lightning Strike", "Swamp"],
      },
    });
    s = settle(cast(s, "p1", "Zimone's Experiment"), (req) =>
      req.type === "pick" ? req.options.filter((id) => ["Bear Cub", "Island"].includes(nameOf(s, id) ?? "")) : undefined,
    );
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    const island = idOf(s, "p1", "battlefield", "Island");
    expect(s.objects[island]?.tapped).toBe(true);
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib[0]).toBe("Swamp");
    expect([...lib.slice(1)].sort()).toEqual(["Lightning Strike", "Opt", "Serra Angel"]);
  });

  it("Zimone's Experiment: up to two among the creature and land cards (PLAN-M M8a); none chosen: all five underneath", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Zimone's Experiment"],
        library: ["Bear Cub", "Opt", "Island", "Serra Angel", "Lightning Strike", "Swamp"],
      },
    });
    let shape: unknown[] = [];
    s = settle(cast(s, "p1", "Zimone's Experiment"), (req, _p, cur) => {
      if (req.type !== "pick") return undefined;
      shape = [namesIn(cur, req.options), req.min, req.max];
      return [];
    });
    expect(shape).toEqual([["Bear Cub", "Island", "Serra Angel"], 0, 2]);
    expect(s.players.p1?.hand).toHaveLength(0);
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib).toHaveLength(6);
    expect(lib[0]).toBe("Swamp");
  });

  it("Zimone's Experiment: the revealed land goes from the library to the battlefield, without passing through the hand (PLAN-H, H2)", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4),
        hand: ["Zimone's Experiment"],
        library: ["Island", "Opt", "Swamp", "Serra Angel", "Lightning Strike", "Forest"],
      },
    });
    s = settle(cast(s, "p1", "Zimone's Experiment"), (req) =>
      req.type === "pick" ? req.options.filter((id) => ["Island", "Swamp"].includes(nameOf(s, id) ?? "")) : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Swamp")).toHaveLength(1);
    // No land card entered the hand; both arrive from the library.
    const moves = s.turnLog.filter((e) => e.e === "zone" && e.types.includes("Land"));
    expect(moves.some((e) => e.e === "zone" && e.to === "hand")).toBe(false);
    expect(moves.filter((e) => e.e === "zone" && e.from === "library" && e.to === "battlefield")).toHaveLength(2);
    expect(s.players.p1?.hand).toHaveLength(0);
  });
});

describe("Secrets of Strixhaven, lot A — multicolores", () => {
  /**
   * Secrets of Strixhaven, lot A: multicolored cards checked against their Oracle text (plan R, lot R7). Prepare
   * (Abigale, Kirol, Lluwen, Sanar, Tam), Repartee, Opus, Increment, Infusion, cards that leave the graveyard,
   * college charms and legends.
   */
  type S = GameState;
  const castOptions = (s: S, player: string, card: string) =>
    legalActions(s, player).filter((a) => a.type === "cast" && a.card === card);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string, kind = "+1/+1") => s.objects[id]?.counters[kind] ?? 0;

  /** Answer: choose these objects when offered; "yes" to questions. */
  const pickIds =
    (...ids: string[]): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const hit = ids.filter((id) => req.options.includes(id));
      return hit.length ? hit.slice(0, req.max) : undefined;
    };
  /** Activates the ability of `source` whose label contains `label` (the first if absent). */
  const activate = (
    s: S,
    player: string,
    source: string,
    label?: string,
    targets?: Record<string, string[]>,
    extra: object = {},
  ) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  /** Passes priority until the first main phase (triggers resolved). */
  const passUntilMain = (s: S): S => {
    let cur = s;
    for (let i = 0; i < 20 && !(cur.turn.step === "main1" && cur.stack.length === 0 && cur.triggers.length === 0); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Enchantment (non-Aura) with no ability. */
  const ENCHANTMENT = customCard({ name: "Test Enchantment", types: ["Enchantment"], typeLine: "Enchantment" });
  const canActivate = (s: S, player: string, source: string) =>
    legalActions(s, player).some((x) => x.type === "activate" && x.source === source);
  /** Colorless sorcery with cost {N}: "draw a card" is not needed here, it does nothing. */
  const sorcery = (n: number): CardDef =>
    customCard({
      name: `Sorcery costing ${n}`,
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: n, colored: {}, x: 0 },
      manaCostText: `{${n}}`,
      spell: { modes: [{ targets: [], effects: [] }] },
    });

  describe("Silverquill (white and black)", () => {
    it("Abigale: a creature spell makes it prepared; Heroic Stanza puts a +1/+1 counter on a creature", () => {
      let s = scenario({
        p1: { battlefield: ["Abigale, Poet Laureate", "Plains", "Swamp", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      const abigale = idOf(s, "p1", "battlefield", "Abigale, Poet Laureate");
      expect(chars(s, abigale).keywords).toContain("flying");
      expect(s.objects[abigale]?.preparedCopy).toBeUndefined();
      s = settle(cast(s, "p1", "Bear Cub"));
      const stanza = exiled(s, "Heroic Stanza");
      expect(stanza).toHaveLength(1);
      expect(s.objects[abigale]?.preparedCopy).toBe(stanza[0]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: stanza[0] as string, targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(s.objects[abigale]?.preparedCopy).toBeUndefined();
    });

    it("Conciliator's Duelist: on entering, draw and each player loses 1 life; Repartee exiles a creature until the end step", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2), ...lands("Mountain", 2)],
          hand: ["Conciliator's Duelist", "Lightning Strike"],
          library: lands("Island", 3),
        },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Conciliator's Duelist"));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([19, 19]);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [angel] }), pickIds(bear));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.objects[angel]?.damage).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Bear Cub")).toHaveLength(0);
    });

    it("Fix What's Broken: pay X life; each artifact and creature card with MV X returns from your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), ...lands("Swamp", 2)],
          hand: ["Fix What's Broken"],
          graveyard: ["Bear Cub", "Swiftfoot Boots", "Llanowar Elves", "Juggernaut", "Opt"],
        },
      });
      s = settle(cast(s, "p1", "Fix What's Broken", undefined, { x: 2 }));
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Swiftfoot Boots")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Juggernaut")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Inkling Mascot: Repartee - flying until end of turn and surveil 1", () => {
      let s = scenario({
        p1: { battlefield: ["Inkling Mascot", ...lands("Mountain", 2)], hand: ["Lightning Strike"], library: lands("Island", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const mascot = idOf(s, "p1", "battlefield", "Inkling Mascot");
      expect(chars(s, mascot).keywords).not.toContain("flying");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }), (req) =>
        req.type === "pick" ? req.options.slice(0, 1) : undefined,
      );
      expect(chars(s, mascot).keywords).toContain("flying");
      // Surveil 1: the top card goes to the graveyard.
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, mascot).keywords).not.toContain("flying");
    });

    it("Killian's Confidence: +1/+1 and draw; from the graveyard, combat damage to a player lets you pay {W/B} to return it", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Plains", "Swamp", "Plains"],
          hand: ["Killian's Confidence"],
          library: lands("Island", 3),
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Killian's Confidence", { t: [bear] }));
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Killian's Confidence")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = advanceUntil(s, (x) => x.pending?.kind === "choice" || x.turn.step === "end");
      expect(s.pending?.kind).toBe("choice");
      s = settle(s, () => [1]);
      expect(s.players.p2?.life).toBe(17);
      expect(idsOf(s, "p1", "hand", "Killian's Confidence")).toHaveLength(1);
    });

    it("Moment of Reckoning: the same mode can be chosen several times (two destructions and a return)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Swamp", 4)],
          hand: ["Moment of Reckoning"],
          graveyard: ["Serra Angel"],
        },
        p2: { battlefield: ["Bear Cub", "Swiftfoot Boots", "Forest"] },
      });
      const card = idOf(s, "p1", "hand", "Moment of Reckoning");
      const modes = castOptions(s, "p1", card);
      const first = modes[0];
      expect(first?.type === "cast" && first.modes.length).toBe(14);
      // Generated modes: two destructions and a return (index 9).
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const boots = idOf(s, "p2", "battlefield", "Swiftfoot Boots");
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card, mode: 9, targets: { d0: [bear], d1: [boots], g0: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      // A land is not a nonland permanent.
      const t = scenario({
        p1: { battlefield: lands("Swamp", 7), hand: ["Moment of Reckoning"] },
        p2: { battlefield: ["Forest"] },
      });
      const forest = idOf(t, "p2", "battlefield", "Forest");
      expect(() => cast(t, "p1", "Moment of Reckoning", { d0: [forest] }, { mode: 4 })).toThrow();
    });

    it("Render Speechless: you choose a nonland card from the opponent's hand; two +1/+1 counters on up to one creature", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), ...lands("Swamp", 2)], hand: ["Render Speechless"] },
        p2: { hand: ["Forest", "Opt", "Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "hand", "Serra Angel");
      const forest = idOf(s, "p2", "hand", "Forest");
      let asked: string[] = [];
      s = settle(cast(s, "p1", "Render Speechless", { p: ["p2"], c: [bear] }), (req, player) => {
        if (req.type !== "pick" || player !== "p1") return undefined;
        asked = req.options;
        return [angel];
      });
      expect(asked).toHaveLength(2);
      expect(asked).not.toContain(forest);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(counters(s, bear)).toBe(2);
    });

    it("Scolding Administrator: Repartee, a +1/+1 counter; on dying, its counters go on up to one targeted creature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Scolding Administrator", "Bear Cub", "Serra Angel", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike"],
        },
      });
      const admin = idOf(s, "p1", "battlefield", "Scolding Administrator");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      expect(chars(s, admin).keywords).toContain("menace");
      const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
      s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: [bear] } }));
      expect(counters(s, admin)).toBe(1);
      expect(pt(s, admin)).toEqual([3, 3]);
      // Damage already marked: the second Strike (after a second counter, 4/4) kills it.
      (s.objects[admin] as { damage: number }).damage = 1;
      s = settle(act(s, "p1", { type: "cast", card: b as string, targets: { t: [admin] } }), pickIds(angel));
      expect(idsOf(s, "p1", "graveyard", "Scolding Administrator")).toHaveLength(1);
      expect(counters(s, angel)).toBe(2);

      // "if it had counters": with no counter, the ability doesn't trigger (no target asked).
      let t = scenario({ p1: { battlefield: ["Scolding Administrator", "Bear Cub"] } });
      destroy(t, idOf(t, "p1", "battlefield", "Scolding Administrator"));
      expect(t.triggers).toHaveLength(0);
      let asked = false;
      t = settle(t, () => {
        asked = true;
        return undefined;
      });
      expect(asked).toBe(false);
      expect(t.stack).toHaveLength(0);
    });

    it("Silverquill Charm: exiles a creature with power 2 or less (not 3); or drain 3", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Plains", "Swamp"], hand: ["Silverquill Charm", "Silverquill Charm"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const [a, b] = idsOf(s, "p1", "hand", "Silverquill Charm");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card: a as string, mode: 1, targets: { t: [angel] } })).toThrow();
      s = settle(
        act(s, "p1", { type: "cast", card: a as string, mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }),
      );
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: b as string, mode: 2 }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
    });

    it("Silverquill, the Disputant: sacrificing a creature with power 1 or more copies the cast instant", () => {
      let s = scenario({
        p1: { battlefield: ["Silverquill, the Disputant", "Bear Cub", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }), pickIds(bear));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(14);
    });

    it("Snooping Page: Repartee makes it unblockable this turn; combat damage to a player: draw, lose 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Snooping Page", ...lands("Mountain", 2)], hand: ["Lightning Strike"], library: lands("Island", 3) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const page = idOf(s, "p1", "battlefield", "Snooping Page");
      s = settle(cast(s, "p1", "Lightning Strike", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      expect(chars(s, page).keywords).toContain("unblockable");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: page, defender: "p2" }] });
      // The Angel can't block it: the declare blockers step asks nothing.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers" || x.turn.step === "end");
      expect(s.turn.step).toBe("end");
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.life).toBe(19);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Social Snub: cast while controlling a creature, it can be copied; each player sacrifices a creature, drain 1 (twice)", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Llanowar Elves", ...lands("Plains", 2), "Swamp"], hand: ["Social Snub"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Social Snub"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
      // With no creature: no copy.
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Swamp"], hand: ["Social Snub"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      t = settle(cast(t, "p1", "Social Snub"), (req) => (req.type === "yesNo" ? [1] : undefined));
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([21, 19]);
      expect(t.battlefield.filter((id) => chars(t, id).types.includes("Creature"))).toHaveLength(1);
    });

    it('Social Snub: "while controlling a creature" is checked on trigger; the creature gone afterwards, the copy is still possible (PLAN-D, D5)', () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Plains", 2), "Swamp"], hand: ["Social Snub"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Social Snub") });
      // The trigger waits on the stack; the creature leaves the battlefield in response.
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      let asked = false;
      s = settle(s, (req) => {
        if (req.type === "yesNo") {
          asked = true;
          return [1];
        }
        return undefined;
      });
      expect(asked).toBe(true);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
    });
  });

  describe("Lorehold (red and white)", () => {
    it("Ark of Hunger: {T} mills a card playable this turn; when it leaves the graveyard, 1 damage to each opponent and +1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Ark of Hunger", ...lands("Mountain", 2)], library: ["Lightning Strike", "Forest"] },
      });
      const ark = idOf(s, "p1", "battlefield", "Ark of Hunger");
      s = settle(activate(s, "p1", ark));
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([20, 20]);
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 16]);
    });

    it("Aziza: tapping three creatures copies the cast instant; without three untapped creatures, no copy", () => {
      const run = (creatures: string[]) => {
        let s = scenario({
          p1: { battlefield: ["Aziza, Mage Tower Captain", ...creatures, ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
        });
        s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
        return s;
      };
      const s = run(["Bear Cub", "Llanowar Elves"]);
      expect(s.players.p2?.life).toBe(14);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature") && s.objects[id]?.tapped)).toHaveLength(3);
      expect(run(["Bear Cub"]).players.p2?.life).toBe(17);
    });

    it("Borrowed Knowledge: discard your hand, then draw as many as the opponent's hand, or as many as cards discarded", () => {
      const setup = () =>
        scenario({
          p1: {
            battlefield: [...lands("Mountain", 2), ...lands("Plains", 2)],
            hand: ["Borrowed Knowledge", "Opt", "Opt"],
            library: lands("Island", 6),
          },
          p2: { hand: ["Forest", "Forest", "Forest", "Forest"] },
        });
      let s = settle(cast(setup(), "p1", "Borrowed Knowledge", { p: ["p2"] }, { mode: 0 }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(4);
      s = settle(cast(setup(), "p1", "Borrowed Knowledge", undefined, { mode: 1 }));
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Colossus of the Blood Age: on entering, 3 damage to each opponent and +3 life; on dying, discard as many as you want and draw that many plus one", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 4), ...lands("Plains", 2), "Swamp", ...lands("Forest", 2)],
          hand: ["Colossus of the Blood Age", "Grapple with Death", "Opt", "Opt"],
          library: lands("Island", 6),
        },
      });
      s = settle(cast(s, "p1", "Colossus of the Blood Age"));
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([23, 17]);
      const colossus = idOf(s, "p1", "battlefield", "Colossus of the Blood Age");
      const opts = idsOf(s, "p1", "hand", "Opt");
      // Grapple with Death destroys the Colossus (and gains 1 life); two cards discarded, three drawn.
      s = settle(cast(s, "p1", "Grapple with Death", { t: [colossus] }), pickIds(...opts));
      expect(s.players.p1?.life).toBe(24);
      expect(idsOf(s, "p1", "graveyard", "Colossus of the Blood Age")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Kirol and Spirit Mascot: a card leaves your graveyard - Kirol becomes prepared, the Mascot gets a counter; Pack a Punch", () => {
      let s = scenario({
        p1: {
          battlefield: ["Kirol, History Buff", "Spirit Mascot", "Bear Cub", "Swamp", "Forest", "Mountain", "Plains", "Plains"],
          graveyard: ["Teacher's Pest"],
          library: lands("Island", 3),
        },
      });
      const kirol = idOf(s, "p1", "battlefield", "Kirol, History Buff");
      const mascot = idOf(s, "p1", "battlefield", "Spirit Mascot");
      expect(exiled(s, "Pack a Punch")).toHaveLength(0);
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Teacher's Pest")));
      expect(idsOf(s, "p1", "battlefield", "Teacher's Pest")).toHaveLength(1);
      expect(counters(s, mascot)).toBe(1);
      const punch = exiled(s, "Pack a Punch");
      expect(punch).toHaveLength(1);
      expect(s.objects[kirol]?.preparedCopy).toBe(punch[0]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: punch[0] as string, targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(2);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(idsOf(s, "p1", "graveyard", "Island")).toHaveLength(1);
      expect(s.objects[kirol]?.preparedCopy).toBeUndefined();
    });

    it("Lorehold Charm: sacrifice of an opposing nontoken artifact; return of an artifact or creature with MV 2 or less; +1/+1 and trample", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Mountain", 3), ...lands("Plains", 3)],
          hand: ["Lorehold Charm", "Lorehold Charm", "Lorehold Charm"],
          graveyard: ["Llanowar Elves", "Serra Angel"],
        },
        p2: { battlefield: ["Swiftfoot Boots", "Bear Cub"] },
      });
      const [a, b, c] = idsOf(s, "p1", "hand", "Lorehold Charm");
      s = settle(act(s, "p1", { type: "cast", card: a as string, mode: 0 }));
      expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card: b as string, mode: 1, targets: { t: [angel] } })).toThrow();
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: b as string,
          mode: 1,
          targets: { t: [idOf(s, "p1", "graveyard", "Llanowar Elves")] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: c as string, mode: 2 }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    });

    it("Practiced Scrollsmith: exiles a noncreature, nonland card from your graveyard, castable until the end of your next turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 2), ...lands("Plains", 1), "Island"],
          hand: ["Practiced Scrollsmith"],
          graveyard: ["Opt", "Bear Cub"],
          library: lands("Island", 5),
        },
      });
      const bearCard = idOf(s, "p1", "graveyard", "Bear Cub");
      s = cast(s, "p1", "Practiced Scrollsmith");
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(bearCard) ? undefined : undefined));
      const scroll = idOf(s, "p1", "battlefield", "Practiced Scrollsmith");
      expect(chars(s, scroll).keywords).toContain("firstStrike");
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const opt = exiled(s, "Opt")[0] as string;
      expect(opt).toBeDefined();
      // Still castable on the opponent's next turn (until the end of your next turn).
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep" && x.pending?.kind === "priority");
      s = act(s, "p2", { type: "pass" });
      expect(castOptions(s, "p1", opt)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: opt }));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Pursue the Past: +2 life, discard a card to draw two; flashback {2}{R}{W}", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 3), ...lands("Plains", 3)],
          hand: ["Pursue the Past", "Opt"],
          library: lands("Island", 6),
        },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Pursue the Past"), pickIds(opt));
      expect(s.players.p1?.life).toBe(22);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
      const card = idOf(s, "p1", "graveyard", "Pursue the Past");
      // Flashback, without discarding: only the life.
      s = settle(act(s, "p1", { type: "cast", card }), (req) => (req.type === "pick" && req.min === 0 ? [] : undefined));
      expect(s.players.p1?.life).toBe(24);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(exiled(s, "Pursue the Past")).toHaveLength(1);
    });

    it("Startled Relic Sloth: at the beginning of your combat, exiles up to one card from a graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Startled Relic Sloth"] }, p2: { graveyard: ["Opt"] } });
      const sloth = idOf(s, "p1", "battlefield", "Startled Relic Sloth");
      expect(chars(s, sloth).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      const opt = idOf(s, "p2", "graveyard", "Opt");
      s = act(s, "p1", { type: "pass" });
      s = act(s, "p2", { type: "pass" });
      expect(s.turn.step).toBe("beginCombat");
      s = settle(s, pickIds(opt));
      expect(exiled(s, "Opt")).toHaveLength(1);
    });

    it("Wilt in the Heat: costs {2} less if a card left your graveyard this turn; the creature is exiled instead of dying", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Plains", "Swamp", "Forest"], hand: ["Wilt in the Heat"], graveyard: ["Teacher's Pest"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const wilt = idOf(s, "p1", "hand", "Wilt in the Heat");
      // {2}{R}{W}: four lands suffice, but keep Swamp and Forest for Teacher's Pest.
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Teacher's Pest")));
      expect(castOptions(s, "p1", wilt)).not.toHaveLength(0);
      s = settle(act(s, "p1", { type: "cast", card: wilt, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
      // Without a card having left the graveyard: {2}{R}{W} with two lands, impossible.
      const t = scenario({
        p1: { battlefield: ["Mountain", "Plains"], hand: ["Wilt in the Heat"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      expect(castOptions(t, "p1", idOf(t, "p1", "hand", "Wilt in the Heat"))).toHaveLength(0);
    });
  });

  describe("Prismari (blue and red)", () => {
    it("Abstract Paintmage: at the beginning of your first main phase, {U}{R} reserved for instants and sorceries", () => {
      let s = scenario({
        step: "draw",
        p1: { battlefield: ["Abstract Paintmage"], hand: ["Lightning Strike", "Fanatical Firebrand"] },
      });
      s = passUntilMain(s);
      expect(s.turn.step).toBe("main1");
      expect(s.players.p1?.restrictedMana).toHaveLength(2);
      expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Fanatical Firebrand"))).toHaveLength(0);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("Elemental Mascot: Opus +1/+0; five or more mana, the top card is exiled and playable", () => {
      let s = scenario({
        p1: {
          battlefield: ["Elemental Mascot", ...lands("Island", 4), ...lands("Mountain", 4)],
          hand: ["Opt", sorcery(5)],
          library: ["Forest", "Lightning Strike", "Forest"],
        },
      });
      const mascot = idOf(s, "p1", "battlefield", "Elemental Mascot");
      expect(chars(s, mascot).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, mascot)).toEqual([2, 4]);
      expect(exiled(s, "Lightning Strike")).toHaveLength(0);
      s = settle(cast(s, "p1", "Sorcery costing 5"));
      expect(pt(s, mascot)).toEqual([3, 4]);
      const strike = exiled(s, "Lightning Strike")[0] as string;
      expect(strike).toBeDefined();
      s = settle(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("Prismari, the Inspiration: instants and sorceries have storm (one copy per spell cast before this turn)", () => {
      let s = scenario({
        p1: { battlefield: ["Prismari, the Inspiration", "Island", ...lands("Mountain", 2)], hand: ["Opt", "Lightning Strike"] },
      });
      const prismari = idOf(s, "p1", "battlefield", "Prismari, the Inspiration");
      expect(chars(s, prismari).keywords).toEqual(expect.arrayContaining(["flying", "ward"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(14);
    });

    it("Prismari: the storm count is read when the spell is cast; a spell cast in response is not counted (PLAN-M M7)", () => {
      let s = scenario({
        p1: { battlefield: ["Prismari, the Inspiration", "Island", "Mountain"], hand: ["Opt", "Shock"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }));
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
      s = act(s, "p1", { type: "pass" });
      // The storm trigger is on the stack above Shock; p2 answers with a spell of their own.
      expect(s.stack).toHaveLength(2);
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = settle(s);
      expect(s.players.p1?.life).toBe(18);
      // One copy (Opt was cast before it), not two.
      expect(s.players.p2?.life).toBe(16);
    });

    it("Rapturous Moment: draw three cards, discard two, add {U}{U}{R}{R}{R}", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Mountain", 3)],
          hand: ["Rapturous Moment"],
          library: lands("Forest", 5),
        },
      });
      s = settle(cast(s, "p1", "Rapturous Moment"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(3);
      expect(s.players.p1?.manaPool).toMatchObject({ U: 2, R: 3 });
    });

    it("Resonating Lute: your lands produce two mana of one color for instants and sorceries; {T}: draw with seven cards in hand", () => {
      let s = scenario({
        p1: {
          battlefield: ["Resonating Lute", "Island"],
          hand: ["Lightning Strike", ...lands("Forest", 5)],
          library: lands("Island", 3),
        },
      });
      const lute = idOf(s, "p1", "battlefield", "Resonating Lute");
      expect(canActivate(s, "p1", lute)).toBe(false);
      s = settle(cast(s, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(s.players.p2?.life).toBe(17);
      const t = scenario({ p1: { battlefield: ["Resonating Lute"], hand: lands("Forest", 7), library: lands("Island", 3) } });
      expect(canActivate(t, "p1", idOf(t, "p1", "battlefield", "Resonating Lute"))).toBe(true);
      const u = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Resonating Lute")));
      expect(u.players.p1?.hand).toHaveLength(8);
    });

    it("Sanar: enters prepared (Wild Idea searches for an instant or sorcery); {T}: a Treasure if you cast an instant or sorcery", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 4), ...lands("Mountain", 3)],
          hand: ["Sanar, Unfinished Genius", "Opt"],
          library: ["Forest", "Lightning Strike", "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Sanar, Unfinished Genius"));
      const sanar = idOf(s, "p1", "battlefield", "Sanar, Unfinished Genius");
      const idea = exiled(s, "Wild Idea");
      expect(idea).toHaveLength(1);
      (s.objects[sanar] as { controlledSince: number }).controlledSince = 0;
      expect(canActivate(s, "p1", sanar)).toBe(false);
      s = settle(cast(s, "p1", "Opt"));
      s = settle(activate(s, "p1", sanar));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: idea[0] as string }));
      expect(idsOf(s, "p1", "hand", "Lightning Strike")).toHaveLength(1);
    });

    it("Spectacular Skywhale: Opus +3/+0; five or more mana, three +1/+1 counters instead", () => {
      let s = scenario({ p1: { battlefield: ["Spectacular Skywhale", ...lands("Island", 6)], hand: ["Opt", sorcery(5)] } });
      const whale = idOf(s, "p1", "battlefield", "Spectacular Skywhale");
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, whale)).toEqual([4, 4]);
      s = settle(cast(s, "p1", "Sorcery costing 5"));
      expect(counters(s, whale)).toBe(3);
      expect(pt(s, whale)).toEqual([7, 7]);
    });

    it("Splatter Technique: 4 damage to each creature; or draw four cards", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Island", 6), ...lands("Mountain", 6)],
          hand: ["Splatter Technique", "Splatter Technique"],
          library: lands("Forest", 5),
        },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const [a, b] = idsOf(s, "p1", "hand", "Splatter Technique");
      s = settle(act(s, "p1", { type: "cast", card: a as string, mode: 1 }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: b as string, mode: 0 }));
      expect(s.players.p1?.hand).toHaveLength(4);
    });

    it("Stadium Tidalmage: on entering (and on attacking), you may draw then discard", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Mountain", 2)],
          hand: ["Stadium Tidalmage", "Opt"],
          library: lands("Forest", 3),
        },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = settle(cast(s, "p1", "Stadium Tidalmage"), pickIds(opt));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Forest")).toHaveLength(1);
    });

    it("Stress Dream: 5 damage to up to one creature; look at two cards, one into hand, the other on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 2), ...lands("Mountain", 3)],
          hand: ["Stress Dream"],
          library: ["Opt", "Lightning Strike", "Forest"],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Stress Dream", { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] }));
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      const lib = s.players.p1?.library ?? [];
      expect(lib).toHaveLength(2);
      expect(nameOf(s, lib[0] as string)).toBe("Forest");
    });

    it("Visionary's Dance: two 3/3 flying Elementals; {2}, discard it: one of the top two cards into hand, the other into the graveyard", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), ...lands("Mountain", 3)], hand: ["Visionary's Dance"] },
      });
      s = settle(cast(s, "p1", "Visionary's Dance"));
      const els = idsOf(s, "p1", "battlefield", "Elemental");
      expect(els).toHaveLength(2);
      const c = chars(s, els[0] as string);
      expect([c.power, c.toughness, [...c.colors].sort(), c.keywords]).toEqual([3, 3, ["R", "U"], ["flying"]]);
      let t = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Visionary's Dance"], library: ["Opt", "Forest", "Island"] },
      });
      const dance = idOf(t, "p1", "hand", "Visionary's Dance");
      t = settle(activate(t, "p1", dance));
      expect(idsOf(t, "p1", "graveyard", "Visionary's Dance")).toHaveLength(1);
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(t.players.p1?.graveyard).toHaveLength(2);
      expect(t.players.p1?.library).toHaveLength(1);
    });
  });

  describe("Quandrix (green and blue)", () => {
    it("Applied Geometry: a token copy of a non-Aura permanent you control, 0/0 Fractal creature with six +1/+1 counters", () => {
      let s = scenario({
        p1: {
          battlefield: ["Swiftfoot Boots", ...lands("Plains", 2), ...lands("Forest", 2), ...lands("Island", 2)],
          hand: ["Applied Geometry", "Pacifism"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Pacifism", { enchant: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
      const pacifism = idOf(s, "p1", "battlefield", "Pacifism");
      expect(() => cast(s, "p1", "Applied Geometry", { t: [pacifism] })).toThrow();
      s = settle(cast(s, "p1", "Applied Geometry", { t: [idOf(s, "p1", "battlefield", "Swiftfoot Boots")] }));
      const boots = idsOf(s, "p1", "battlefield", "Swiftfoot Boots");
      expect(boots).toHaveLength(2);
      const token = boots.find((id) => s.objects[id]?.isToken) as string;
      const c = chars(s, token);
      expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Equipment", "Fractal"]));
      expect([c.power, c.toughness]).toEqual([6, 6]);
      expect(counters(s, token)).toBe(6);
    });

    it("Berta: Increment, and each +1/+1 counter put on it adds one mana; {X}, {T}: a Fractal with X counters", () => {
      let s = scenario({
        p1: { battlefield: ["Berta, Wise Extrapolator", ...lands("Island", 7)], hand: [sorcery(2)] },
      });
      const berta = idOf(s, "p1", "battlefield", "Berta, Wise Extrapolator");
      s = settle(cast(s, "p1", "Sorcery costing 2"), (req) =>
        req.type === "pick" && req.options.includes("U") ? ["U"] : undefined,
      );
      expect(counters(s, berta)).toBe(1);
      expect(s.players.p1?.manaPool.U).toBe(1);
      s = settle(activate(s, "p1", berta, undefined, undefined, { x: 3 }));
      const fractal = idOf(s, "p1", "battlefield", "Fractal");
      expect(counters(s, fractal)).toBe(3);
      expect(pt(s, fractal)).toEqual([3, 3]);
      expect([...chars(s, fractal).colors].sort()).toEqual(["G", "U"]);
    });

    it("Cuboid Colony: Increment (a two-mana spell exceeds 1/1, a one-mana spell doesn't)", () => {
      let s = scenario({ p1: { battlefield: ["Cuboid Colony", ...lands("Island", 3)], hand: ["Opt", sorcery(2)] } });
      const colony = idOf(s, "p1", "battlefield", "Cuboid Colony");
      expect(chars(s, colony).keywords).toEqual(expect.arrayContaining(["flash", "flying", "trample"]));
      s = settle(cast(s, "p1", "Opt"));
      expect(counters(s, colony)).toBe(0);
      s = settle(cast(s, "p1", "Sorcery costing 2"));
      expect(counters(s, colony)).toBe(1);
    });

    it("Embrace the Paradox: draw three cards and put a land from your hand onto the battlefield tapped", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 3)],
          hand: ["Embrace the Paradox"],
          library: ["Opt", "Mountain", "Opt"],
        },
      });
      // Only the drawn Mountain is offered.
      s = settle(cast(s, "p1", "Embrace the Paradox"));
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(s.objects[mountain]?.tapped).toBe(true);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Fractal Mascot: on entering, taps an opposing creature and puts a stun counter on it", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), ...lands("Island", 3)], hand: ["Fractal Mascot"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Fractal Mascot"), pickIds(angel));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(1);
      // At its untap step, the counter is removed instead of untapping it.
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(0);
    });

    it("Growth Curve: a +1/+1 counter, then the number of counters is doubled", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Forest", "Island"], hand: ["Growth Curve"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { counters: Record<string, number> }).counters["+1/+1"] = 1;
      s.version += 1;
      s = settle(cast(s, "p1", "Growth Curve", { t: [bear] }));
      expect(counters(s, bear)).toBe(4);
    });

    it("Mind into Matter: draw X cards, then a permanent card with MV X or less enters tapped", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2)],
          hand: ["Mind into Matter"],
          library: ["Serra Angel", "Bear Cub", "Forest"],
        },
      });
      let offered = 0;
      s = settle(cast(s, "p1", "Mind into Matter", undefined, { x: 2 }), (req) => {
        if (req.type === "pick") offered = req.options.length;
        return undefined;
      });
      // The Angel (MV 5) is not offered: only the Bear Cub (MV 2).
      expect(offered).toBe(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    });

    it("Proctor's Gaze: returns up to one nonland permanent; a basic land enters tapped", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), ...lands("Island", 2)], hand: ["Proctor's Gaze"], library: ["Opt", "Plains"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(cast(s, "p1", "Proctor's Gaze", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
      expect(idsOf(s, "p2", "hand", "Serra Angel")).toHaveLength(1);
      const plains = idOf(s, "p1", "battlefield", "Plains");
      expect(s.objects[plains]?.tapped).toBe(true);
    });

    it("Pterafractyl: enters with X +1/+1 counters; you gain 2 life", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 2), ...lands("Island", 3)], hand: ["Pterafractyl"] } });
      s = settle(cast(s, "p1", "Pterafractyl", undefined, { x: 3 }));
      const ptera = idOf(s, "p1", "battlefield", "Pterafractyl");
      expect(pt(s, ptera)).toEqual([4, 3]);
      expect(chars(s, ptera).keywords).toContain("flying");
      expect(s.players.p1?.life).toBe(22);
    });

    it("Quandrix Charm: base power and toughness 5/5 until end of turn; destroys an enchantment; counterspell unless {2}", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Forest", 3), ...lands("Island", 3)],
          hand: ["Quandrix Charm", "Quandrix Charm"],
        },
        p2: { battlefield: [ENCHANTMENT] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      (s.objects[bear] as { counters: Record<string, number> }).counters["+1/+1"] = 1;
      s.version += 1;
      const [a, b] = idsOf(s, "p1", "hand", "Quandrix Charm");
      s = settle(act(s, "p1", { type: "cast", card: a as string, mode: 2, targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([6, 6]);
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: b as string,
          mode: 1,
          targets: { t: [idOf(s, "p2", "battlefield", ENCHANTMENT.name)] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", ENCHANTMENT.name)).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([3, 3]);
      // Counterspell mode: the opponent, with no mana, can't pay {2}.
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Forest", "Island"], hand: ["Quandrix Charm"] },
        p2: { battlefield: ["Mountain", "Mountain"], hand: ["Lightning Strike"] },
      });
      t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
      const spell = t.stack[0]?.id as string;
      t = act(t, "p2", { type: "pass" });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Quandrix Charm"), mode: 0, targets: { t: [spell] } }));
      expect(t.players.p1?.life).toBe(20);
      expect(idsOf(t, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    });

    it("Tam: Landfall - becomes prepared; Deep Sight draws a card and gains 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Tam, Observant Sequencer", "Forest", "Island"], hand: ["Forest"], library: lands("Island", 3) },
      });
      const tam = idOf(s, "p1", "battlefield", "Tam, Observant Sequencer");
      s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      const sight = exiled(s, "Deep Sight");
      expect(sight).toHaveLength(1);
      expect(s.objects[tam]?.preparedCopy).toBe(sight[0]);
      s = settle(act(s, "p1", { type: "cast", card: sight[0] as string }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(21);
    });
  });

  describe("Witherbloom (black and green)", () => {
    it("Blech: each life gain puts a counter on each of your Pests, Bats, Insects, Snakes and Spiders", () => {
      const bat = customCard({ name: "Test Bat", subtypes: ["Bat"], power: 1, toughness: 1 });
      let s = scenario({
        p1: { battlefield: ["Blech, Loafing Pest", bat, "Bear Cub", "Swamp", "Forest"], hand: ["Witherbloom Charm"] },
        p2: { battlefield: [customCard({ name: "Opposing Insect", subtypes: ["Insect"], power: 1, toughness: 1 })] },
      });
      s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Blech, Loafing Pest"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", bat.name))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(counters(s, idOf(s, "p2", "battlefield", "Opposing Insect"))).toBe(0);
    });

    it("Bogwater Lumaret and Pest Mascot: each creature that enters under your control gains 1 life; each gain, a counter", () => {
      let s = scenario({
        p1: { battlefield: ["Pest Mascot", ...lands("Swamp", 2), ...lands("Forest", 2)], hand: ["Bogwater Lumaret", "Bear Cub"] },
      });
      const mascot = idOf(s, "p1", "battlefield", "Pest Mascot");
      s = settle(cast(s, "p1", "Bogwater Lumaret"));
      expect(s.players.p1?.life).toBe(21);
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.players.p1?.life).toBe(22);
      expect(counters(s, mascot)).toBe(2);
    });

    it("Cauldron of Essence: one of your creatures dies, drain 1; {1}{B}{G}, {T}, sacrifice a creature: a creature card returns", () => {
      let s = scenario({
        p1: { battlefield: ["Cauldron of Essence", "Bear Cub", "Swamp", "Forest", "Forest"], graveyard: ["Serra Angel"] },
      });
      const cauldron = idOf(s, "p1", "battlefield", "Cauldron of Essence");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        activate(s, "p1", cauldron, undefined, { t: [idOf(s, "p1", "graveyard", "Serra Angel")] }, { sacrifice: [bear] }),
      );
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([21, 19]);
    });

    it("Dina's Guidance: a creature card from the library, into your hand or your graveyard", () => {
      const run = (toGraveyard: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Swamp", "Forest", "Forest"],
            hand: ["Dina's Guidance"],
            library: ["Forest", "Serra Angel", "Forest"],
          },
        });
        s = settle(cast(s, "p1", "Dina's Guidance"), (req) => (req.type === "yesNo" ? [toGraveyard ? 1 : 0] : undefined));
        return s;
      };
      expect(idsOf(run(false), "p1", "hand", "Serra Angel")).toHaveLength(1);
      const g = run(true);
      expect(idsOf(g, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(g.players.p1?.hand).toHaveLength(0);
    });

    it("Essenceknit Scholar: a Pest on entering; at your end step, if one of your creatures died, draw", () => {
      const run = (kill: boolean) => {
        let s = scenario({
          p1: {
            battlefield: ["Bear Cub", ...lands("Swamp", 3), ...lands("Forest", 3)],
            hand: ["Essenceknit Scholar", "Grapple with Death"],
            library: lands("Island", 5),
          },
        });
        s = settle(cast(s, "p1", "Essenceknit Scholar"));
        expect(idsOf(s, "p1", "battlefield", "Pest")).toHaveLength(1);
        if (kill) s = settle(cast(s, "p1", "Grapple with Death", { t: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return s.players.p1?.library.length ?? 0;
      };
      expect(run(true)).toBe(4);
      expect(run(false)).toBe(5);
    });

    it("Grapple with Death: destroys an artifact or creature, +1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest", "Forest"], hand: ["Grapple with Death"] },
        p2: { battlefield: ["Swiftfoot Boots"] },
      });
      s = settle(cast(s, "p1", "Grapple with Death", { t: [idOf(s, "p2", "battlefield", "Swiftfoot Boots")] }));
      expect(idsOf(s, "p2", "graveyard", "Swiftfoot Boots")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Lluwen: enters prepared (Pest Friend creates a Pest); exiling a creature card from the graveyard prepares it again, at sorcery speed", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)],
          hand: ["Lluwen, Exchange Student"],
          graveyard: ["Bear Cub"],
        },
      });
      s = settle(cast(s, "p1", "Lluwen, Exchange Student"));
      const lluwen = idOf(s, "p1", "battlefield", "Lluwen, Exchange Student");
      const friend = exiled(s, "Pest Friend");
      expect(friend).toHaveLength(1);
      s = settle(act(s, "p1", { type: "cast", card: friend[0] as string }));
      expect(idsOf(s, "p1", "battlefield", "Pest")).toHaveLength(1);
      expect(s.objects[lluwen]?.preparedCopy).toBeUndefined();
      s = settle(activate(s, "p1", lluwen, undefined, undefined, { exile: [idOf(s, "p1", "graveyard", "Bear Cub")] }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Pest Friend")).toHaveLength(1);
    });

    it("Mind Roots: the targeted player discards two cards; a discarded land enters tapped under your control", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Forest", "Forest"], hand: ["Mind Roots"] },
        p2: { hand: ["Mountain", "Opt"] },
      });
      s = settle(cast(s, "p1", "Mind Roots", { p: ["p2"] }), (req) =>
        req.type === "pick" ? req.options.slice(0, req.max) : undefined,
      );
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(s.objects[mountain]?.tapped).toBe(true);
      expect(s.objects[mountain]?.owner).toBe("p2");
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Old-Growth Educator: Infusion - two +1/+1 counters if it enters after a life gain", () => {
      const run = (gain: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Swamp", 3), ...lands("Forest", 3)], hand: ["Old-Growth Educator", "Witherbloom Charm"] },
        });
        if (gain) s = settle(cast(s, "p1", "Witherbloom Charm", undefined, { mode: 1 }));
        s = settle(cast(s, "p1", "Old-Growth Educator"));
        const id = idOf(s, "p1", "battlefield", "Old-Growth Educator");
        expect(chars(s, id).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
        return pt(s, id);
      };
      expect(run(true)).toEqual([6, 6]);
      expect(run(false)).toEqual([4, 4]);
    });

    it('Root Manipulation: your creatures get +2/+2, menace and "when it attacks, gain 1 life" until end of turn', () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 2), ...lands("Forest", 3)], hand: ["Root Manipulation"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Root Manipulation"));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("menace");
      expect(pt(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 4]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Teacher's Pest: menace; when it attacks, +1 life; {B}{G}: returns from the graveyard tapped", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Forest"], graveyard: ["Teacher's Pest"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "graveyard", "Teacher's Pest")));
      const pest = idOf(s, "p1", "battlefield", "Teacher's Pest");
      expect(s.objects[pest]?.tapped).toBe(true);
      expect(chars(s, pest).keywords).toContain("menace");
    });

    it("Witherbloom, the Balancer: affinity for creatures, and your instants and sorceries have it too", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Llanowar Elves", "Bear Cub", "Swamp", "Forest", "Forest", "Forest", "Mountain"],
          hand: ["Witherbloom, the Balancer", "Lightning Strike"],
        },
      });
      // {6}{B}{G} minus 3: five lands suffice.
      s = settle(cast(s, "p1", "Witherbloom, the Balancer"));
      const w = idOf(s, "p1", "battlefield", "Witherbloom, the Balancer");
      expect(chars(s, w).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
      // No untapped land left: Lightning Strike ({1}{R}) costs {R} less... {R} remains to pay.
      const strike = idOf(s, "p1", "hand", "Lightning Strike");
      expect(castOptions(s, "p1", strike)).toHaveLength(0);
      const t = scenario({
        p1: { battlefield: ["Witherbloom, the Balancer", "Mountain"], hand: ["Lightning Strike"] },
      });
      const u = settle(cast(t, "p1", "Lightning Strike", { t: ["p2"] }));
      expect(u.players.p2?.life).toBe(17);
    });
  });

  describe("Silverquill and others: enter abilities", () => {
    it("Imperious Inkmage (surveil 2) and Stirring Honormancer (X = your creatures: one into hand, the rest into the graveyard)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Bear Cub", ...lands("Plains", 4), ...lands("Swamp", 4)],
          hand: ["Imperious Inkmage", "Stirring Honormancer"],
          library: ["Opt", "Forest", "Island", "Mountain", "Plains", "Swamp"],
        },
      });
      s = settle(cast(s, "p1", "Imperious Inkmage"), (req) => (req.type === "pick" ? req.options.slice(0, 2) : undefined));
      expect(s.players.p1?.graveyard).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Imperious Inkmage")).keywords).toContain("vigilance");
      // Bear Cub, Inkmage and Honormancer: three cards looked at.
      s = settle(cast(s, "p1", "Stirring Honormancer"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(4);
      expect(s.players.p1?.library).toHaveLength(1);
    });
    it("Molten Note: damage equal to the mana spent, untaps your creatures; flashback {6}{R}{W}", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Mountain", 6), ...lands("Plains", 6)],
          hand: ["Molten Note"],
        },
        p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // X = 2: four mana spent.
      s = settle(cast(s, "p1", "Molten Note", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }, { x: 2 }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.objects[bear]?.tapped).toBe(false);
      const note = idOf(s, "p1", "graveyard", "Molten Note");
      expect(castOptions(s, "p1", note)).not.toHaveLength(0);
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = settle(act(s, "p1", { type: "cast", card: note, targets: { t: [dragon] } }));
      // Eight mana spent: the Dragon (5/5) dies; the card is exiled.
      expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
      expect(exiled(s, "Molten Note")).toHaveLength(1);
    });

    it("Nita, Forum Conciliator: {2}, sacrifice another creature: an opposing exiled instant is cast this turn, then exiled; a counter on your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Nita, Forum Conciliator", "Bear Cub", ...lands("Island", 4)] },
        p2: { graveyard: ["Lightning Strike"] },
      });
      const nita = idOf(s, "p1", "battlefield", "Nita, Forum Conciliator");
      const strike = idOf(s, "p2", "graveyard", "Lightning Strike");
      const ab = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === nita);
      s = settle(
        act(s, "p1", {
          type: "activate",
          source: nita,
          ability: ab?.type === "activate" ? ab.ability : -1,
          targets: { t: [strike] },
          sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")],
        }),
      );
      const card = exiled(s, "Lightning Strike")[0] as string;
      expect(castOptions(s, "p1", card)).not.toHaveLength(0);
      const before = s.objects[nita]?.counters["+1/+1"] ?? 0;
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[nita]?.counters["+1/+1"]).toBe(before + 1);
      // "then exile it": the card stays in exile, and is not recast.
      const again = exiled(s, "Lightning Strike")[0] as string;
      expect(again).toBeDefined();
      expect(castOptions(s, "p1", again)).toHaveLength(0);
    });
  });
});

describe("Secrets of Strixhaven, lot A - colorless and lands", () => {
  /**
   * Secrets of Strixhaven, lot A - colorless cards and lands: each card is checked against its Oracle text (plan R,
   * lot R7). Converge avatars (The Dawning Archaic, Rancorous, Sundering and Transcendent Archaic), prepare
   * (Biblioplex Tomekeeper, Skycoach Waypoint), Diary of Dreams, Mage Tower Referee, Page, Loose Leaf, Potioner's Trove,
   * Strixhaven Skycoach and the lands.
   */
  type S = GameState;
  const FIVE_COLORS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Colorless sorcery with cost {0}: "nothing". */
  const FREE_SORCERY = customCard({
    name: "Free Sorcery",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    spell: spell([], []),
  });

  /** Passes and answers choices (suggested answer by default) until the stack is empty, with no trigger pending. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority" && p.castNow) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  const yes: Answer = (req) => (req.intent === "may" ? [1] : undefined);
  const no: Answer = (req) => (req.intent === "may" ? [0] : undefined);
  const canCast = (s: S, player: string, name: string) =>
    legalActions(s, player).some((a) => a.type === "cast" && a.card === idOf(s, player, "hand", name));
  const activation = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && (!label || (x.label ?? "").includes(label)),
    );
  /** Activates the ability of `source` whose label contains `label` (the first if absent). */
  const activate = (
    s: S,
    player: string,
    source: string,
    label?: string,
    targets?: Record<string, string[]>,
    extra: object = {},
  ) => {
    const a = activation(s, player, source, label);
    return act(s, player, { type: "activate", source, ability: a?.type === "activate" ? a.ability : -1, targets, ...extra });
  };
  const attackWith = (s: S, id: string) => {
    const t = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(t, "p1", { type: "declareAttackers", attackers: [{ id, defender: "p2" }] });
  };

  describe("The Dawning Archaic", () => {
    it("costs {1} less per instant or sorcery card in your graveyard; reach", () => {
      const run = (landCount: number) =>
        scenario({
          p1: {
            battlefield: lands("Mountain", landCount),
            hand: ["The Dawning Archaic"],
            graveyard: ["Lightning Strike", "Opt", "Opt", "Bear Cub"],
          },
        });
      expect(canCast(run(6), "p1", "The Dawning Archaic")).toBe(false);
      let s = run(7);
      expect(canCast(s, "p1", "The Dawning Archaic")).toBe(true);
      s = settle(cast(s, "p1", "The Dawning Archaic"));
      const archaic = idOf(s, "p1", "battlefield", "The Dawning Archaic");
      expect(chars(s, archaic).keywords).toContain("reach");
      expect(pt(s, archaic)).toEqual([7, 7]);
    });

    it("on attacking: casts an instant from the graveyard for free, which is exiled instead of returning there", () => {
      let s = scenario({ p1: { battlefield: ["The Dawning Archaic"], graveyard: ["Lightning Strike"] } });
      const archaic = idOf(s, "p1", "battlefield", "The Dawning Archaic");
      s = settle(attackWith(s, archaic));
      const offer = castNowOf(s);
      const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
      expect(offer?.cards).toContain(strike);
      s = settle(act(s, "p1", { type: "cast", card: strike, free: true, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(exiled(s, "Lightning Strike")).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(10);
    });
  });

  describe("Converge: Rancorous Archaic", () => {
    it("a +1/+1 counter per color of mana spent; reach and trample", () => {
      const run = (manaLands: string[]) => {
        const s = settle(
          cast(scenario({ p1: { battlefield: manaLands, hand: ["Rancorous Archaic"] } }), "p1", "Rancorous Archaic"),
        );
        return { s, id: idOf(s, "p1", "battlefield", "Rancorous Archaic") };
      };
      const five = run(FIVE_COLORS);
      expect(pt(five.s, five.id)).toEqual([7, 7]);
      expect(five.s.objects[five.id]?.counters["+1/+1"]).toBe(5);
      expect(chars(five.s, five.id).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
      const one = run(lands("Forest", 5));
      expect(pt(one.s, one.id)).toEqual([3, 3]);
    });
  });

  describe("Converge: Sundering Archaic", () => {
    const board = (manaLands: string[]) =>
      scenario({
        p1: { battlefield: manaLands, hand: ["Sundering Archaic"] },
        p2: { battlefield: ["Serra Angel", "Forest"], graveyard: ["Opt"] },
      });

    it("exiles an opposing nonland permanent with mana value at most the number of colors spent", () => {
      let s = board([...FIVE_COLORS, "Forest"]);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Sundering Archaic"), (req) =>
        req.intent === "triggerTarget" && req.type === "pick" ? [angel] : undefined,
      );
      expect(exiled(s, "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Forest")).toHaveLength(1);
    });

    it("with three colors spent, a permanent with mana value 5 stays in play", () => {
      let s = board(["Island", "Mountain", ...lands("Forest", 4)]);
      s = settle(cast(s, "p1", "Sundering Archaic"));
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(exiled(s, "Serra Angel")).toHaveLength(0);
    });

    it("{2}: puts a card from a graveyard on the bottom of its owner's library", () => {
      let s = scenario({
        p1: { battlefield: ["Sundering Archaic", ...lands("Forest", 2)] },
        p2: { graveyard: ["Opt"], library: lands("Island", 3) },
      });
      const archaic = idOf(s, "p1", "battlefield", "Sundering Archaic");
      const opt = idOf(s, "p2", "graveyard", "Opt");
      s = settle(activate(s, "p1", archaic, "bottom", { t: [opt] }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      // A card that changes zone becomes a new object (400.7): it is recognized by its name.
      expect(nameOf(s, s.players.p2?.library.at(-1) as string)).toBe("Opt");
      expect(s.players.p2?.library).toHaveLength(4);
    });
  });

  describe("Converge: Transcendent Archaic", () => {
    it("you may draw X cards (X = colors spent), then you discard two cards", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Island", "Mountain", ...lands("Forest", 5)], hand: ["Transcendent Archaic"] },
        });
      let s = settle(cast(start(), "p1", "Transcendent Archaic"), yes);
      expect(chars(s, idOf(s, "p1", "battlefield", "Transcendent Archaic")).keywords).toContain("vigilance");
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(2);
      s = settle(cast(start(), "p1", "Transcendent Archaic"), no);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });

    it('"if you draw one or more cards this way": no card drawn (Mornsong Aria), no discard (PLAN-M M8b)', () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Mountain", ...lands("Forest", 5)], hand: ["Transcendent Archaic", "Opt", "Opt"] },
        p2: { battlefield: ["Mornsong Aria"] },
      });
      s = settle(cast(s, "p1", "Transcendent Archaic"), yes);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Opt", "Opt"]);
      expect(s.players.p1?.graveyard).toHaveLength(0);
    });
  });

  describe("Prepare: Biblioplex Tomekeeper and Skycoach Waypoint", () => {
    it("Biblioplex Tomekeeper: a targeted creature becomes prepared", () => {
      let s = scenario({ p1: { battlefield: ["Emeritus of Ideation", ...lands("Plains", 4)], hand: ["Biblioplex Tomekeeper"] } });
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
      s = settle(cast(s, "p1", "Biblioplex Tomekeeper"), (req) =>
        req.intent === "triggerMode" ? ["0"] : req.intent === "triggerTarget" ? [emeritus] : undefined,
      );
      expect(exiled(s, "Ancestral Recall")).toHaveLength(1);
      expect(s.objects[emeritus]?.preparedCopy).toBe(exiled(s, "Ancestral Recall")[0]);
    });

    it("Biblioplex Tomekeeper: a targeted creature stops being prepared (or no target)", () => {
      const start = () =>
        scenario({
          p1: {
            battlefield: [...lands("Island", 5), ...lands("Plains", 4)],
            hand: ["Emeritus of Ideation", "Biblioplex Tomekeeper"],
          },
        });
      let s = settle(cast(start(), "p1", "Emeritus of Ideation"));
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      expect(exiled(s, "Ancestral Recall")).toHaveLength(1);
      s = settle(cast(s, "p1", "Biblioplex Tomekeeper"), (req) =>
        req.intent === "triggerMode" ? ["1"] : req.intent === "triggerTarget" ? [emeritus] : undefined,
      );
      expect(exiled(s, "Ancestral Recall")).toHaveLength(0);
      expect(s.objects[emeritus]?.preparedCopy).toBeUndefined();
      // "Up to one": no target chosen, the creature stays prepared.
      let t = settle(cast(start(), "p1", "Emeritus of Ideation"));
      t = settle(cast(t, "p1", "Biblioplex Tomekeeper"), (req) =>
        req.intent === "triggerMode" ? ["1"] : req.intent === "triggerTarget" ? [] : undefined,
      );
      expect(exiled(t, "Ancestral Recall")).toHaveLength(1);
    });

    it("Skycoach Waypoint: {T} for {C}; {3}, {T}: a targeted creature becomes prepared (no effect without a prepared spell)", () => {
      let s = scenario({ p1: { battlefield: ["Skycoach Waypoint", "Emeritus of Ideation", "Bear Cub", ...lands("Plains", 3)] } });
      const waypoint = idOf(s, "p1", "battlefield", "Skycoach Waypoint");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === waypoint ? a.colors : []));
      expect(colors).toEqual(["C"]);
      const emeritus = idOf(s, "p1", "battlefield", "Emeritus of Ideation");
      s = settle(activate(s, "p1", waypoint, "prepared", { t: [emeritus] }));
      expect(s.objects[waypoint]?.tapped).toBe(true);
      expect(s.objects[emeritus]?.preparedCopy).toBe(exiled(s, "Ancestral Recall")[0]);
      let t = scenario({ p1: { battlefield: ["Skycoach Waypoint", "Bear Cub", ...lands("Plains", 3)] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Skycoach Waypoint"), "prepared", { t: [bear] }));
      expect(t.objects[bear]?.preparedCopy).toBeUndefined();
      expect(t.exile).toHaveLength(0);
    });
  });

  describe("Diary of Dreams", () => {
    it("a page counter per instant or sorcery cast; drawing costs {1} less per page counter", () => {
      let s = scenario({
        p1: { battlefield: ["Diary of Dreams", ...lands("Island", 2)], hand: [FREE_SORCERY, FREE_SORCERY, FREE_SORCERY] },
      });
      const diary = idOf(s, "p1", "battlefield", "Diary of Dreams");
      expect(activation(s, "p1", diary, "Draw")).toBeUndefined();
      s = settle(cast(s, "p1", FREE_SORCERY.name));
      s = settle(cast(s, "p1", FREE_SORCERY.name));
      expect(s.objects[diary]?.counters.page).toBe(2);
      // Two lands: {5} - 2 = {3}, too expensive.
      expect(activation(s, "p1", diary, "Draw")).toBeUndefined();
      s = settle(cast(s, "p1", FREE_SORCERY.name));
      expect(s.objects[diary]?.counters.page).toBe(3);
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", diary, "Draw"));
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(s.objects[diary]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(s.objects[diary]?.counters.page).toBe(3);
    });

    it("a creature spell doesn't add a page counter", () => {
      let s = scenario({ p1: { battlefield: ["Diary of Dreams", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      s = settle(cast(s, "p1", "Bear Cub"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Diary of Dreams")]?.counters.page ?? 0).toBe(0);
    });
  });

  describe("Mage Tower Referee", () => {
    it("each multicolored spell cast: a +1/+1 counter; not for a monocolored spell", () => {
      let s = scenario({
        p1: { battlefield: ["Mage Tower Referee", ...lands("Island", 2), "Mountain"], hand: ["Prismari Charm", "Opt"] },
      });
      const referee = idOf(s, "p1", "battlefield", "Mage Tower Referee");
      expect(pt(s, referee)).toEqual([2, 1]);
      s = settle(cast(s, "p1", "Opt"));
      expect(pt(s, referee)).toEqual([2, 1]);
      s = settle(cast(s, "p1", "Prismari Charm", undefined, { mode: 0 }));
      expect(pt(s, referee)).toEqual([3, 2]);
    });
  });

  describe("Page, Loose Leaf", () => {
    it("{T}: add {C}; Grandeur: discard another Page to reveal up to one instant or sorcery", () => {
      let s = scenario({
        p1: {
          battlefield: ["Page, Loose Leaf"],
          hand: ["Page, Loose Leaf", "Bear Cub"],
          library: ["Forest", "Bear Cub", "Opt", "Island", "Swamp"],
        },
      });
      const page = idOf(s, "p1", "battlefield", "Page, Loose Leaf");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === page ? a.colors : []));
      expect(colors).toEqual(["C"]);
      // Discarding a card not named Page, Loose Leaf is refused.
      expect(() => activate(s, "p1", page, "Grandeur", undefined, { discard: [idOf(s, "p1", "hand", "Bear Cub")] })).toThrow();
      s = settle(activate(s, "p1", page, "Grandeur", undefined, { discard: [idOf(s, "p1", "hand", "Page, Loose Leaf")] }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Opt"]);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Page, Loose Leaf"]);
      const library = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
      expect(library.slice(0, 2)).toEqual(["Island", "Swamp"]);
      expect(library.slice(2).sort()).toEqual(["Bear Cub", "Forest"]);
    });
  });

  describe("Potioner's Trove", () => {
    it("{T}: one mana of any color; {T}: 2 life, only after an instant or sorcery this turn", () => {
      let s = scenario({ p1: { battlefield: ["Potioner's Trove", "Island"], hand: ["Opt"] } });
      const trove = idOf(s, "p1", "battlefield", "Potioner's Trove");
      const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === trove ? a.colors : []));
      expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
      expect(activation(s, "p1", trove, "life")).toBeUndefined();
      s = settle(cast(s, "p1", "Opt"));
      expect(s.objects[trove]?.tapped).toBe(false);
      s = settle(activate(s, "p1", trove, "life"));
      expect(s.players.p1?.life).toBe(22);
    });
  });

  describe("Strixhaven Skycoach", () => {
    it("on entering, you may search for a basic land card for your hand; flying and Crew 2", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Strixhaven Skycoach"], library: ["Bear Cub", "Island"] },
      });
      s = settle(cast(s, "p1", "Strixhaven Skycoach"), (req) =>
        req.intent === "may"
          ? [1]
          : req.intent === "search" && req.type === "pick"
            ? req.options.filter((id) => nameOf(s, String(id)) === "Island")
            : undefined,
      );
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
      const coach = idOf(s, "p1", "battlefield", "Strixhaven Skycoach");
      expect(chars(s, coach).keywords).toContain("flying");
      expect(chars(s, coach).types).not.toContain("Creature");
      expect(activation(s, "p1", coach, "Crew")).toBeUndefined();
      let t = scenario({ p1: { battlefield: ["Strixhaven Skycoach", "Bear Cub"] } });
      const c2 = idOf(t, "p1", "battlefield", "Strixhaven Skycoach");
      t = settle(activate(t, "p1", c2, "Crew"));
      expect(chars(t, c2).types).toContain("Creature");
      expect(pt(t, c2)).toEqual([3, 2]);
    });
  });

  describe("Lands", () => {
    it("surveil lands: enter tapped; two colors; {2}{X}{Y}, {T}: surveil 1", () => {
      const expected: Record<string, string[]> = {
        "Fields of Strife": ["R", "W"],
        "Forum of Amity": ["B", "W"],
        "Paradox Gardens": ["G", "U"],
        "Spectacle Summit": ["R", "U"],
        "Titan's Grave": ["B", "G"],
      };
      for (const [name, pair] of Object.entries(expected)) {
        let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: [name] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name) });
        expect(s.objects[idOf(s, "p1", "battlefield", name)]?.tapped).toBe(true);
        const t = scenario({ p1: { battlefield: [name] } });
        const id = idOf(t, "p1", "battlefield", name);
        const colors = legalActions(t, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        expect(colors.sort()).toEqual(pair);
      }
      // Surveil 1: the top card goes to the graveyard if you want.
      let s = scenario({
        p1: { battlefield: ["Fields of Strife", "Mountain", "Plains", ...lands("Plains", 2)], library: ["Opt", "Island"] },
      });
      const fields = idOf(s, "p1", "battlefield", "Fields of Strife");
      const top = s.players.p1?.library[0] as string;
      s = settle(activate(s, "p1", fields, "Surveil"), (req) =>
        req.type === "pick" && req.options.includes(top) ? [top] : undefined,
      );
      expect(s.objects[fields]?.tapped).toBe(true);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Opt"]);
      expect(s.players.p1?.library.map((id) => nameOf(s, id))).toEqual(["Island"]);
    });

    it("Dreamroot Cascade: enters tapped unless you control two or more other lands; {G} or {U}", () => {
      const play = (others: number) => {
        let s = scenario({ p1: { battlefield: lands("Plains", others), hand: ["Dreamroot Cascade"] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Dreamroot Cascade") });
        const id = idOf(s, "p1", "battlefield", "Dreamroot Cascade");
        const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === id ? a.colors : []));
        return { tapped: s.objects[id]?.tapped, colors: colors.sort() };
      };
      expect(play(1).tapped).toBe(true);
      expect(play(2)).toEqual({ tapped: false, colors: ["G", "U"] });
    });

    it("Terramorphic Expanse: {T}, sacrifice it: a basic land from the library enters tapped", () => {
      let s = scenario({ p1: { battlefield: ["Terramorphic Expanse"], library: ["Bear Cub", "Mountain", "Opt"] } });
      const expanse = idOf(s, "p1", "battlefield", "Terramorphic Expanse");
      s = settle(activate(s, "p1", expanse));
      expect(idsOf(s, "p1", "battlefield", "Terramorphic Expanse")).toHaveLength(0);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(["Terramorphic Expanse"]);
      const mountain = idOf(s, "p1", "battlefield", "Mountain");
      expect(s.objects[mountain]?.tapped).toBe(true);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });
});

describe("Secrets of Strixhaven, lot B1: spells with {X} in their cost", () => {
  /** Sorcery {X}{U}: "draw a card". */
  const XSPELL = customCard({
    name: "Test Equation",
    types: ["Sorcery"],
    typeLine: "Sorcery",
    colors: ["U"],
    manaCost: { generic: 0, colored: { U: 1 }, x: 1 },
    manaCostText: "{X}{U}",
    spell: spell([], [fx.draw(1)]),
  });

  it("Matterbending Mage: returns another creature; a spell with {X} makes it unblockable this turn, not another", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Matterbending Mage", XSPELL, "Opt"], library: lands("Island", 5) },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Matterbending Mage"));
    expect(idsOf(s, "p2", "hand", "Bear Cub")).toHaveLength(1);
    const mage = idOf(s, "p1", "battlefield", "Matterbending Mage");
    s = settle(cast(s, "p1", "Opt"));
    expect(chars(s, mage).keywords).not.toContain("unblockable");
    s = settle(cast(s, "p1", XSPELL.name, undefined, { x: 1 }));
    expect(chars(s, mage).keywords).toContain("unblockable");
  });

  it("Geometer's Arthropod: a spell with {X}: the top X cards, one into hand, the others on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: ["Geometer's Arthropod", ...lands("Island", 4)],
        hand: [XSPELL],
        library: ["Opt", "Bear Cub", "Serra Angel", "Shivan Dragon", "Forest"],
      },
    });
    s = settle(cast(s, "p1", XSPELL.name, undefined, { x: 3 }), (req) => {
      if (req.type !== "pick") return undefined;
      const angel = req.options.find((id) => nameOf(s, id) === "Serra Angel");
      // Only the top three cards are offered.
      expect(req.options.some((id) => nameOf(s, id) === "Shivan Dragon")).toBe(false);
      return angel ? [angel] : undefined;
    });
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    // The sorcery's draw took "Opt" or the Dragon depending on the order: the Dragon is now above the other two.
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib.slice(-2).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Paradox Surveyor: five cards, a land or a card with {X} into hand; not another card", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), "Island"],
        hand: ["Paradox Surveyor"],
        library: ["Bear Cub", XSPELL, "Opt", "Serra Angel", "Island", "Shivan Dragon"],
      },
    });
    let offered: string[] = [];
    s = settle(cast(s, "p1", "Paradox Surveyor"), (req) => {
      if (req.type !== "pick") return undefined;
      offered = req.options.map((id) => nameOf(s, id) ?? "");
      return [req.options.find((id) => nameOf(s, id) === XSPELL.name) as string];
    });
    expect(offered.sort()).toEqual(["Island", XSPELL.name].sort());
    expect(idsOf(s, "p1", "hand", XSPELL.name)).toHaveLength(1);
    expect(s.players.p1?.library.map((id) => nameOf(s, id))[0]).toBe("Shivan Dragon");
  });
});

describe("Secrets of Strixhaven, lot B2: colors spent on the triggering spell", () => {
  it("Magmablood Archaic: converge on entering; an instant: your creatures get +1/+0 per color spent on it", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Forest", "Island", "Plains", "Swamp", "Bear Cub"],
        hand: ["Magmablood Archaic", "Lightning Strike"],
      },
    });
    s = settle(cast(s, "p1", "Magmablood Archaic"));
    const archaic = idOf(s, "p1", "battlefield", "Magmablood Archaic");
    // {2/R}{2/R}{2/R} paid with five lands of five colors: five counters.
    expect(s.objects[archaic]?.counters["+1/+1"]).toBe(5);
    let t = scenario({
      p1: { battlefield: ["Magmablood Archaic", "Bear Cub", "Mountain", "Forest"], hand: ["Lightning Strike"] },
    });
    const bear = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(cast(t, "p1", "Lightning Strike", { t: ["p2"] }));
    // {1}{R} paid with a Mountain and a Forest: two colors.
    expect(chars(t, bear).power).toBe(4);
    expect(chars(t, bear).toughness).toBe(2);
  });

  it("Wildgrowth Archaic: a creature spell enters with a +1/+1 counter per color spent on it", () => {
    // 0/0: two counters so that it survives.
    let s = scenario({
      p1: { battlefield: [{ name: "Wildgrowth Archaic", counters: { "+1/+1": 2 } }, "Forest", "Island"], hand: ["Bear Cub"] },
    });
    s = settle(cast(s, "p1", "Bear Cub"));
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
  });
});

describe("Secrets of Strixhaven, lot B3: costs", () => {
  it("Group Project: a 2/2 Spirit; flashback by tapping three untapped creatures (no mana), then exile", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Bear Cub", "Llanowar Elves", "Plains", "Plains"], hand: ["Group Project"] },
    });
    s = settle(cast(s, "p1", "Group Project"));
    expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(1);
    const card = idOf(s, "p1", "graveyard", "Group Project");
    // Four untapped creatures (the Spirit included): flashback is possible without mana.
    for (const id of s.battlefield) {
      const o = s.objects[id];
      if (o && nameOf(s, id) === "Plains") o.tapped = true;
    }
    expect(castOptions(s, "p1", card)).not.toHaveLength(0);
    s = settle(act(s, "p1", { type: "cast", card }));
    expect(idsOf(s, "p1", "battlefield", "Spirit")).toHaveLength(2);
    expect(exiled(s, "Group Project")).toHaveLength(1);
    const tappedCreatures = s.battlefield.filter((id) => chars(s, id).types.includes("Creature") && s.objects[id]?.tapped);
    expect(tappedCreatures).toHaveLength(3);
    // Only two untapped creatures: no flashback.
    const t = scenario({ p1: { battlefield: ["Bear Cub", "Bear Cub"], graveyard: ["Group Project"] } });
    expect(castOptions(t, "p1", idOf(t, "p1", "graveyard", "Group Project"))).toHaveLength(0);
  });

  it("Soaring Stoneglider: exile two cards from your graveyard or pay {1}{W} more", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Soaring Stoneglider"], graveyard: ["Opt", "Bear Cub"] } });
    const card = idOf(s, "p1", "hand", "Soaring Stoneglider");
    s = settle(act(s, "p1", { type: "cast", card, kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Soaring Stoneglider")).toHaveLength(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.exile).toHaveLength(2);
    // Without exiling: {2}{W} + {1}{W}.
    let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Soaring Stoneglider"], graveyard: ["Opt"] } });
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Soaring Stoneglider") }));
    expect(idsOf(t, "p1", "battlefield", "Soaring Stoneglider")).toHaveLength(1);
    expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(5);
    // One land short, only one card in the graveyard: impossible.
    const u = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Soaring Stoneglider"], graveyard: ["Opt"] } });
    expect(castOptions(u, "p1", idOf(u, "p1", "hand", "Soaring Stoneglider"))).toHaveLength(0);
  });

  it("Brush Off: {1}{U} less if it targets an instant or sorcery spell; full price for a creature spell", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Brush Off"] },
      p2: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike", "Bear Cub"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    s = passUntil(s, (x) => x.pending?.player === "p1");
    const strike = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Brush Off"), targets: { t: [strike] } });
    s = settle(s);
    expect(s.players.p1?.life).toBe(20);
    expect(idsOf(s, "p2", "graveyard", "Lightning Strike")).toHaveLength(1);
    // A creature spell: {2}{U}{U}, unpayable with two Islands.
    let t = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 2), hand: ["Brush Off"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
    });
    t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Bear Cub") });
    t = passUntil(t, (x) => x.pending?.player === "p1");
    const bear = t.stack[0]?.id as string;
    expect(() => act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Brush Off"), targets: { t: [bear] } })).toThrow();
  });
});

describe("Secrets of Strixhaven, lot C1: halves per player, playable exile, counters put, next main phase", () => {
  it("Pox Plague: each player loses half their life, discards half their hand, sacrifices half their permanents (rounded down)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Pox Plague", "Opt", "Opt", "Opt", "Opt"] },
      p2: { life: 15, battlefield: ["Bear Cub", "Forest", "Forest"], hand: ["Opt", "Opt", "Opt"] },
    });
    s = settle(cast(s, "p1", "Pox Plague"));
    expect(s.players.p1?.life).toBe(10);
    expect(s.players.p2?.life).toBe(8);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p1")).toHaveLength(3);
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(2);
  });

  it("Suspend Aggression: a nonland permanent and your top card exiled, playable by their owner until the end of their next turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Plains", "Island", "Island"],
        hand: ["Suspend Aggression"],
        library: ["Opt", ...lands("Island", 8)],
      },
      p2: { battlefield: ["Bear Cub", "Forest", "Forest"], library: lands("Forest", 8) },
    });
    s = settle(cast(s, "p1", "Suspend Aggression", { t: [idOf(s, "p2", "battlefield", "Bear Cub")] }));
    const bear = exiled(s, "Bear Cub")[0] as string;
    const opt = exiled(s, "Opt")[0] as string;
    expect(bear && opt).toBeTruthy();
    expect(castOptions(s, "p1", opt)).not.toHaveLength(0);
    // Opponent's turn (4): they can cast their Bear.
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
    expect(castOptions(s, "p2", bear)).not.toHaveLength(0);
    // Your next turn (5): Opt stays playable; the Bear is no longer playable for the opponent on turn 6.
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(castOptions(s, "p1", opt)).not.toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.number === 6 && x.turn.step === "main1");
    expect(castOptions(s, "p2", bear)).toHaveLength(0);
  });

  it("Fractal Tender: at each end step, if you put a counter on it this turn, a Fractal with three counters", () => {
    const big = customCard({
      name: "Sorcery costing four",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 4, colored: {}, x: 0 },
      manaCostText: "{4}",
      spell: spell([], [fx.draw(1)]),
    });
    let s = scenario({
      p1: { battlefield: ["Fractal Tender", ...lands("Island", 4)], hand: [big], library: lands("Island", 5) },
    });
    const tender = idOf(s, "p1", "battlefield", "Fractal Tender");
    s = settle(cast(s, "p1", big.name));
    // Increment: 4 mana > 3.
    expect(s.objects[tender]?.counters["+1/+1"]).toBe(1);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.turn.number === 3);
    s = settle(s);
    const fractals = idsOf(s, "p1", "battlefield", "Fractal");
    expect(fractals).toHaveLength(1);
    expect(s.objects[fractals[0] as string]?.counters["+1/+1"]).toBe(3);
    // Next turn (opponent's): no counter put, no Fractal.
    s = advanceUntil(s, (x) => x.turn.number === 5);
    expect(idsOf(s, "p1", "battlefield", "Fractal")).toHaveLength(1);
  });

  it("Mana Sculpt: counters; with a Wizard, {C} equal to the mana spent on this spell at the beginning of your next main phase", () => {
    let s = scenario({
      active: "p2",
      turn: 4,
      p1: { battlefield: ["Pensive Professor", ...lands("Island", 3)], hand: ["Mana Sculpt"] },
      p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"] },
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    s = passUntil(s, (x) => x.pending?.player === "p1");
    const strike = s.stack[0]?.id as string;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mana Sculpt"), targets: { t: [strike] } }));
    expect(s.players.p1?.life).toBe(20);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p1?.manaPool.C).toBe(2);
  });
});

describe("Secrets of Strixhaven, lot C2: free spell once each turn, copies", () => {
  it("Zaffai and the Tempests: once during each of your turns, an instant or sorcery from your hand without paying", () => {
    let s = scenario({
      p1: { battlefield: ["Zaffai and the Tempests"], hand: ["Lightning Strike", "Lightning Strike", "Bear Cub"] },
    });
    const [a, b] = idsOf(s, "p1", "hand", "Lightning Strike");
    expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toHaveLength(0);
    s = settle(act(s, "p1", { type: "cast", card: a as string, targets: { t: ["p2"] }, free: true }));
    expect(s.players.p2?.life).toBe(17);
    // The permission is used up for this turn.
    expect(castOptions(s, "p1", b as string)).toHaveLength(0);
    // During the opponent's turn: no free spell.
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1" && x.pending?.player === "p1");
    expect(castOptions(s, "p1", b as string)).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(castOptions(s, "p1", b as string)).not.toHaveLength(0);
  });

  it("Choreographed Sparks: copies an instant you control; can't itself be copied", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Lightning Strike", "Choreographed Sparks"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    const strike = s.stack[0]?.id as string;
    const card = idOf(s, "p1", "hand", "Choreographed Sparks");
    const opt = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label?.startsWith("Copy an instant or sorcery")) : undefined;
    expect(mode).toBeDefined();
    s = settle(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { a: [strike] } }));
    expect(s.players.p2?.life).toBe(14);
    expect(Object.values(s.defs).find((d) => d.name === "Choreographed Sparks")?.rules?.cantBeCopied).toBe(true);
  });

  it("Choreographed Sparks: the copy of a creature spell has haste and is sacrificed at the beginning of the end step", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), ...lands("Forest", 2)], hand: ["Bear Cub", "Choreographed Sparks"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    const bearSpell = s.stack[0]?.id as string;
    const card = idOf(s, "p1", "hand", "Choreographed Sparks");
    const opt = legalActions(s, "p1").find((x) => x.type === "cast" && x.card === card);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label?.startsWith("Copy a creature spell")) : undefined;
    s = settle(act(s, "p1", { type: "cast", card, mode: mode?.index, targets: { b: [bearSpell] } }));
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    expect(bears).toHaveLength(2);
    const token = bears.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).keywords).toContain("haste");
    // An ability the token gains (PLAN-M M7), not a delayed ability.
    expect(chars(s, token).abilities).toContainEqual(SACRIFICE_TOKEN_AT_END_STEP);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("Secrets of Strixhaven, lot C3: cascade and miracle", () => {
  /** Plays out the resolution, casting (or not) the card offered by a "cast now". */
  const resolveAll = (s: S, castIt: boolean, max = 80) => {
    let cur = s;
    for (let i = 0; i < max && cur.stack.length + cur.triggers.length + (cur.pending?.kind === "choice" ? 1 : 0) > 0; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && p.castNow) {
        const card = p.castNow.cards[0] as string;
        cur = act(cur, p.player, castIt ? { type: "cast", card, targets: { t: ["p2"] } } : { type: "pass" });
      } else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else break;
    }
    return cur;
  };

  it("Quandrix, the Proof: cascade (a nonland card of lesser MV, cast for free; the rest on the bottom)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), ...lands("Island", 3)],
        hand: ["Quandrix, the Proof"],
        library: ["Island", "Shivan Dragon", "Lightning Strike", "Forest", "Plains"],
      },
    });
    s = resolveAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Quandrix, the Proof") }), true);
    expect(idsOf(s, "p1", "battlefield", "Quandrix, the Proof")).toHaveLength(1);
    // Shivan Dragon (MV 6) is not of lesser MV than 6: Lightning Strike is cast for free.
    expect(s.players.p2?.life).toBe(17);
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib.slice(0, 2)).toEqual(["Forest", "Plains"]);
    expect(lib.slice(2).sort()).toEqual(["Island", "Shivan Dragon"]);
  });

  it("Quandrix, the Proof: your instants and sorceries cast from hand have cascade; declined, the card goes on the bottom", () => {
    let s = scenario({
      p1: {
        battlefield: ["Quandrix, the Proof", ...lands("Mountain", 2)],
        hand: ["Lightning Strike"],
        library: ["Forest", "Opt", "Plains"],
      },
    });
    s = resolveAll(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }),
      false,
    );
    expect(s.players.p2?.life).toBe(17);
    // Opt (MV 1 < 2) offered and declined: it goes on the bottom, Plains stays on top.
    const lib = s.players.p1?.library.map((id) => nameOf(s, id)) ?? [];
    expect(lib[0]).toBe("Plains");
    expect(lib.slice(1).sort()).toEqual(["Forest", "Opt"]);
  });

  it("Lorehold, the Historian: the first card drawn each turn, an instant or sorcery, can be cast for {2}", () => {
    let s = scenario({
      turn: 2,
      active: "p2",
      p1: {
        battlefield: ["Lorehold, the Historian", ...lands("Plains", 2)],
        library: ["Lightning Strike", "Lightning Strike", ...lands("Plains", 5)],
      },
    });
    // p1's turn 3: the draw step's draw is the first of the turn.
    s = advanceUntil(s, (x) => x.turn.number === 3 && !!castNowOf(x));
    const offer = castNowOf(s);
    expect(offer).toBeDefined();
    s = resolveAll(s, true);
    expect(s.players.p2?.life).toBe(17);
    // Two tapped Plains: the miracle cost {2} (not {1}{R}).
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Plains" && s.objects[id]?.tapped)).toHaveLength(2);
  });

  it("Lorehold, the Historian: at the opponent's upkeep, you may discard a card to draw one", () => {
    let s = scenario({
      active: "p1",
      p1: { battlefield: ["Lorehold, the Historian"], hand: ["Opt"], library: lands("Plains", 5) },
    });
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.pending?.kind === "choice" && x.pending.request.intent === "discard");
    const p = s.pending;
    if (p?.kind === "choice") s = act(s, "p1", { type: "choose", values: [idOf(s, "p1", "hand", "Opt")] });
    s = settle(s);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Plains"]);
  });
});

// Cards from the Standard meta decks (PLAN-C in docs/history.md, lot C13).
describe("Secrets of Strixhaven: Standard meta cards", () => {
  describe("Vibrant Outburst", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: ["Island", "Mountain"], hand: ["Vibrant Outburst"] },
        p2: { battlefield: ["Serra Angel", "Fire Elemental"] },
      });

    it("3 damage to any target (a player) and taps up to one targeted creature", () => {
      let s = setup();
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Vibrant Outburst", { d: ["p2"], c: [angel] }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p2", "battlefield", "Fire Elemental")]?.tapped).toBe(false);
    });

    it("3 damage to a creature, with no creature to tap", () => {
      let s = setup();
      const fire = idOf(s, "p2", "battlefield", "Fire Elemental");
      s = settle(cast(s, "p1", "Vibrant Outburst", { d: [fire], c: [] }));
      expect(s.objects[fire]?.damage).toBe(3);
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(false);
      expect(s.players.p2?.life).toBe(20);
    });
  });
});
