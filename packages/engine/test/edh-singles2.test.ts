/**
 * Commander (EDH pseudo-set): rules tests for single cards of the precons never named elsewhere (PLAN-L L11), L to Z.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castNowOf,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

const handNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const graveyardNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const tokens = (s: GameState, p: PlayerId, name?: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && (!name || nameOf(s, id) === name));
const plusOne = (s: GameState, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const pt = (s: GameState, id: string) => [chars(s, id).power, chars(s, id).toughness];
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const activations = (s: GameState, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Activates the `index`-th offered ability of this source. */
const activate = (s: GameState, p: PlayerId, source: ObjectId, extra: object = {}, index = 0) => {
  const o = activations(s, p, source)[index];
  if (!o) throw new Error(`no ability for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
/** Activates the ability numbered `ability` (index in the card's abilities). */
const activateNo = (s: GameState, p: PlayerId, source: ObjectId, ability: number, extra: object = {}) =>
  act(s, p, { type: "activate", source, ability, ...extra } as never);
/** "Yes" to any "you may" question, the suggested answer otherwise. */
const yes = (req: ChoiceRequest) => (req.intent === "may" || req.type === "yesNo" ? [1] : undefined);
const no = (req: ChoiceRequest) => (req.intent === "may" || req.type === "yesNo" ? [0] : undefined);
/** Advances (neither attacking nor blocking) until `until`, answering choices with `answer` (suggested otherwise). */
const advanceAnswering = (
  s: GameState,
  until: (s: GameState) => boolean,
  answer: (req: ChoiceRequest) => unknown[] | undefined,
) => {
  let cur = s;
  for (let i = 0; i < 600 && !until(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: (answer(p.request) ?? p.request.suggested) as never });
    else if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
const onField = (s: GameState, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;

describe("Commander (EDH): single cards, L to Z (L11)", () => {
  describe("mythic", () => {
    for (const name of ["Last Chance", "Warrior's Oath"])
      it(`${name}: an extra turn after this one; you lose at that turn's end step`, () => {
        let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: [name] } });
        s = settle(castIt(s, "p1", name));
        expect(exiled(s, name).length + idsOf(s, "p1", "graveyard", name).length).toBe(1);
        s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
        expect(s.turn.active).toBe("p1");
        expect(s.players.p1?.lost).toBeFalsy();
        s = advanceUntil(s, (x) => !!x.players.p1?.lost || x.turn.number > 4);
        expect(s.players.p1?.lost).toBe(true);
        expect(s.winner).toBe("p2");
      });

    it("Leonardo, the Balance: a token enters, a +1/+1 counter on each of your creatures, once each turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Leonardo, the Balance", "Bear Cub", ...lands("Mountain", 4)],
          hand: ["Dragon Fodder", "Dragon Fodder"],
        },
      });
      const leo = idOf(s, "p1", "battlefield", "Leonardo, the Balance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Dragon Fodder"), yes);
      expect([plusOne(s, leo), plusOne(s, bear)]).toEqual([1, 1]);
      expect(tokens(s, "p1", "Goblin").map((g) => plusOne(s, g))).toEqual([1, 1]);
      // Once each turn: a second token spell adds nothing.
      s = settle(castIt(s, "p1", "Dragon Fodder"), yes);
      expect([plusOne(s, leo), plusOne(s, bear)]).toEqual([1, 1]);
      // Declined: the limit isn't used up.
      let t = scenario({
        p1: { battlefield: ["Leonardo, the Balance", ...lands("Mountain", 4)], hand: ["Dragon Fodder", "Dragon Fodder"] },
      });
      const leo2 = idOf(t, "p1", "battlefield", "Leonardo, the Balance");
      t = settle(castIt(t, "p1", "Dragon Fodder"), no);
      expect(plusOne(t, leo2)).toBe(0);
      t = settle(castIt(t, "p1", "Dragon Fodder"), yes);
      expect(plusOne(t, leo2)).toBe(1);
    });

    it("Leonardo, the Balance: {W}{U}{B}{R}{G}, your creatures gain menace, trample and lifelink until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Leonardo, the Balance", "Bear Cub", "Plains", "Island", "Swamp", "Mountain", "Forest"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Leonardo, the Balance")));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["menace", "trample", "lifelink"]));
      expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("menace");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, bear).keywords).not.toContain("lifelink");
    });

    it("Michelangelo, the Heart: raid, at your second main phase a +1/+1 counter on target creature and a Food", () => {
      let s = scenario({ p1: { battlefield: ["Michelangelo, the Heart", "Bear Cub"] } });
      const mike = idOf(s, "p1", "battlefield", "Michelangelo, the Heart");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, mike).keywords).toContain("trample");
      s = attack(s, [mike]);
      s = throughCombat(s, picking([bear]));
      s = settle(s, picking([bear]));
      expect(s.players.p2?.life).toBe(18);
      expect(plusOne(s, bear)).toBe(1);
      expect(tokens(s, "p1", "Food")).toHaveLength(1);
      // Without attacking: nothing.
      let t = scenario({ p1: { battlefield: ["Michelangelo, the Heart", "Bear Cub"] } });
      t = settle(throughCombat(t));
      expect(tokens(t, "p1", "Food")).toHaveLength(0);
    });

    it("Mind's Dilation: an opponent's first spell each turn exiles their top card; you may cast it for free", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Mind's Dilation"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"], library: ["Lightning Bolt", "Mountain", "Opt"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
      s = passAccepting(s, (x) => !!castNowOf(x));
      const bolt = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, bolt)).toBe("Lightning Bolt");
      expect(s.objects[bolt]?.zone).toBe("exile");
      s = settle(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(18);
      // The second spell of the turn: no trigger (the Mountain stays on top).
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
      expect(nameOf(s, s.players.p2?.library[0] ?? "")).toBe("Mountain");
    });

    it("Samut, the Tested: +1 double strike; −2 two damage divided among one or two targets", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Samut, the Tested", counters: { loyalty: 5 } }, "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
      });
      const samut = idOf(s, "p1", "battlefield", "Samut, the Tested");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activateNo(s, "p1", samut, 0, { targets: { t: [bear] } }));
      expect(s.objects[samut]?.counters.loyalty).toBe(6);
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      let t = scenario({
        p1: { battlefield: [{ name: "Samut, the Tested", counters: { loyalty: 5 } }] },
        p2: { battlefield: ["Llanowar Elves", "Savannah Lions"] },
      });
      const elves = idOf(t, "p2", "battlefield", "Llanowar Elves");
      t = settle(activateNo(t, "p1", idOf(t, "p1", "battlefield", "Samut, the Tested"), 1, { targets: { t: [elves, "p2"] } }));
      expect(graveyardNames(t, "p2")).toEqual(["Llanowar Elves"]);
      expect(t.players.p2?.life).toBe(19);
      expect(t.objects[idOf(t, "p1", "battlefield", "Samut, the Tested")]?.counters.loyalty).toBe(3);
    });

    it("Samut, the Tested: −7, up to two creature and/or planeswalker cards from the library onto the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Samut, the Tested", counters: { loyalty: 7 } }],
          library: ["Forest", "Bear Cub", "Shock", "Serra Angel", "Forest"],
        },
      });
      let offered: string[] = [];
      s = settle(activateNo(s, "p1", idOf(s, "p1", "battlefield", "Samut, the Tested"), 2), (req) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = (namesIn(s, req.options) as string[]).sort();
        return req.options.filter((id) => ["Bear Cub", "Serra Angel"].includes(nameOf(s, id) ?? ""));
      });
      expect(offered).toEqual(["Bear Cub", "Serra Angel"]);
      expect([onField(s, "p1", "Bear Cub"), onField(s, "p1", "Serra Angel")]).toEqual([1, 1]);
      expect(graveyardNames(s, "p1")).toEqual(["Samut, the Tested"]);
    });

    it("Shivan Devastator: enters with X +1/+1 counters; flying, haste", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Shivan Devastator"] } });
      s = settle(castIt(s, "p1", "Shivan Devastator", { x: 4 }));
      const dragon = idOf(s, "p1", "battlefield", "Shivan Devastator");
      expect(pt(s, dragon)).toEqual([4, 4]);
      expect(chars(s, dragon).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
      s = attack(s, [dragon]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(16);
    });

    it("Ulamog, the Infinite Gyre: casting it destroys target permanent; indestructible; annihilator 4", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 11), hand: ["Ulamog, the Infinite Gyre"] },
        p2: { battlefield: ["Sanguine Bond", "Bear Cub", ...lands("Plains", 5)] },
      });
      const bond = idOf(s, "p2", "battlefield", "Sanguine Bond");
      s = castIt(s, "p1", "Ulamog, the Infinite Gyre");
      // The cast trigger resolves before the spell.
      s = settle(s, picking([bond]));
      expect(graveyardNames(s, "p2")).toEqual(["Sanguine Bond"]);
      const ulamog = idOf(s, "p1", "battlefield", "Ulamog, the Infinite Gyre");
      expect(chars(s, ulamog).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = attack(s, [ulamog]);
      s = settle(s);
      // Annihilator 4: p2 sacrifices four permanents (6 remain → 2).
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(2);
    });

    it("Ulamog, the Infinite Gyre: put into a graveyard, its owner shuffles the graveyard into the library", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ulamog, the Infinite Gyre", "Swamp"],
          hand: ["Village Rites"],
          graveyard: ["Opt", "Bear Cub"],
          library: lands("Forest", 3),
        },
      });
      const ulamog = idOf(s, "p1", "battlefield", "Ulamog, the Infinite Gyre");
      s = settle(castIt(s, "p1", "Village Rites", { sacrifice: [ulamog] }));
      // Ulamog, Opt and Bear Cub shuffled in (Village Rites resolves after the trigger); two cards drawn.
      expect(graveyardNames(s, "p1")).toEqual(["Village Rites"]);
      expect((s.players.p1?.library.length ?? 0) + (s.players.p1?.hand.length ?? 0)).toBe(6);
    });

    it("Yuna, Grand Summoner: another permanent with counters goes to the graveyard, that many +1/+1 counters", () => {
      let s = scenario({
        p1: {
          battlefield: ["Yuna, Grand Summoner", { name: "Bear Cub", counters: { "+1/+1": 3 } }, "Swamp"],
          hand: ["Village Rites"],
        },
      });
      const yuna = idOf(s, "p1", "battlefield", "Yuna, Grand Summoner");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Village Rites", { sacrifice: [bear] }), (req) =>
        req.intent === "may" ? [1] : picking([yuna])(req),
      );
      expect(plusOne(s, yuna)).toBe(3);
    });
  });
  describe("rare, L to O", () => {
    it("Leatherhead, Iron Gator: haste, trample; attacks, two +1/+1 counters on each creature you control", () => {
      let s = scenario({ p1: { battlefield: [{ name: "Leatherhead, Iron Gator", sick: true }, "Bear Cub"] } });
      const gator = idOf(s, "p1", "battlefield", "Leatherhead, Iron Gator");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, gator).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      s = attack(s, [gator]);
      s = throughCombat(s);
      expect([plusOne(s, gator), plusOne(s, bear)]).toEqual([2, 2]);
      expect(s.players.p2?.life).toBe(13);
    });

    it("Level Up: a +1/+1 counter as it enters; attacking doubles the counters, then draws at power 10 or more", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Forest", 2)], hand: ["Level Up"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Level Up", { targets: { enchant: [bear] } }));
      expect(plusOne(s, bear)).toBe(1);
      s = attack(s, [bear]);
      s = settle(s);
      expect(plusOne(s, bear)).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(0);
      let t = scenario({ p1: { battlefield: ["Gigantosaurus", ...lands("Forest", 2)], hand: ["Level Up"] } });
      const giant = idOf(t, "p1", "battlefield", "Gigantosaurus");
      t = settle(castIt(t, "p1", "Level Up", { targets: { enchant: [giant] } }));
      t = attack(t, [giant]);
      t = settle(t);
      expect(plusOne(t, giant)).toBe(2);
      expect(t.players.p1?.hand).toHaveLength(1);
    });

    it("Lily Bowen, Raging Grandma: enters with two counters; upkeep doubles them up to power 16, otherwise all but one removed for life", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Lily Bowen, Raging Grandma"] } });
      s = settle(castIt(s, "p1", "Lily Bowen, Raging Grandma"));
      const lily = idOf(s, "p1", "battlefield", "Lily Bowen, Raging Grandma");
      expect(pt(s, lily)).toEqual([2, 2]);
      expect(chars(s, lily).keywords).toContain("vigilance");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      expect(plusOne(s, lily)).toBe(4);
      let t = scenario({ p1: { battlefield: [{ name: "Lily Bowen, Raging Grandma", counters: { "+1/+1": 17 } }] } });
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "draw");
      const lily2 = idOf(t, "p1", "battlefield", "Lily Bowen, Raging Grandma");
      expect(plusOne(t, lily2)).toBe(1);
      expect(t.players.p1?.life).toBe(36);
    });

    it("Lockjaw, Slobbering Teleporter: a noncreature spell cast this turn, a counter at combat; it and another creature can't be blocked", () => {
      let s = scenario({
        p1: { battlefield: ["Lockjaw, Slobbering Teleporter", "Bear Cub", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Savannah Lions", "Llanowar Elves"] },
      });
      const dog = idOf(s, "p1", "battlefield", "Lockjaw, Slobbering Teleporter");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = passAccepting(
        s,
        (x) =>
          x.pending?.kind === "declareAttackers" ||
          (x.pending?.kind === "choice" && x.pending.request.intent === "triggerTarget"),
      );
      if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [bear] });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(plusOne(s, dog)).toBe(1);
      s = act(s, "p1", { type: "declareAttackers", attackers: [dog, bear].map((id) => ({ id, defender: "p2" })) });
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers", 50);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: lions, attacker: bear }] })).toThrow();
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: dog }] })).toThrow();
      // Without a noncreature spell: no counter.
      let t = scenario({ p1: { battlefield: ["Lockjaw, Slobbering Teleporter"] } });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      expect(plusOne(t, idOf(t, "p1", "battlefield", "Lockjaw, Slobbering Teleporter"))).toBe(0);
    });

    it("Lord Jyscal Guado: at each end step, if you put a counter on a creature this turn, investigate", () => {
      let s = scenario({ p1: { battlefield: ["Lord Jyscal Guado", "Bear Cub", "Plains"], hand: ["Fleeting Flight"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Lord Jyscal Guado")).keywords).toContain("flying");
      s = settle(castIt(s, "p1", "Fleeting Flight", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(tokens(s, "p1", "Clue")).toHaveLength(1);
      // The opponent's end step: no counter put this turn, no Clue.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep");
      expect(tokens(s, "p1", "Clue")).toHaveLength(1);
    });

    it("Maester Seymour: at combat, counters equal to its power on another creature; monstrosity X = counters among your creatures", () => {
      let s = scenario({ p1: { battlefield: ["Maester Seymour", "Bear Cub", ...lands("Forest", 5)] } });
      const seymour = idOf(s, "p1", "battlefield", "Maester Seymour");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(plusOne(s, bear)).toBe(1);
      expect(plusOne(s, seymour)).toBe(0);
      s = act(s, "p1", { type: "declareAttackers", attackers: [] });
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      s = settle(activate(s, "p1", seymour));
      // One counter among your creatures: Monstrosity 1.
      expect(plusOne(s, seymour)).toBe(1);
      expect(s.objects[seymour]?.monstrous).toBe(true);
      // Already monstrous: it can be activated again (701.37c), but nothing happens.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(activate(s, "p1", seymour));
      expect(plusOne(s, seymour)).toBe(1);
    });

    it("Marcus, Mutant Mayor: combat damage to a player, draw if the creature has a +1/+1 counter, otherwise a counter", () => {
      let s = scenario({
        p1: { battlefield: ["Marcus, Mutant Mayor", "Bear Cub", { name: "Savannah Lions", counters: { "+1/+1": 1 } }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(chars(s, idOf(s, "p1", "battlefield", "Marcus, Mutant Mayor")).keywords).toEqual(
        expect.arrayContaining(["vigilance", "trample"]),
      );
      s = attack(s, [bear, lions]);
      s = throughCombat(s);
      expect(plusOne(s, bear)).toBe(1);
      expect(plusOne(s, lions)).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Medusa, Inhuman Queen: whenever a player casts a noncreature spell, a +1/+1 counter on it", () => {
      let s = scenario({
        p1: { battlefield: ["Medusa, Inhuman Queen", "Mountain", "Forest"], hand: ["Shock", "Llanowar Elves"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const medusa = idOf(s, "p1", "battlefield", "Medusa, Inhuman Queen");
      expect(chars(s, medusa).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = settle(castIt(s, "p1", "Llanowar Elves"));
      expect(plusOne(s, medusa)).toBe(1);
      s = act(s, "p1", { type: "pass" });
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
      expect(plusOne(s, medusa)).toBe(2);
    });

    it("Memnarch, the Warden: two Myr as it enters; attacks, draws a card for each artifact you control; indestructible", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 10), hand: ["Memnarch, the Warden"] } });
      s = settle(castIt(s, "p1", "Memnarch, the Warden"));
      const memnarch = idOf(s, "p1", "battlefield", "Memnarch, the Warden");
      expect(tokens(s, "p1", "Myr")).toHaveLength(2);
      expect(pt(s, tokens(s, "p1", "Myr")[0] as string)).toEqual([1, 1]);
      expect(chars(s, memnarch).keywords).toContain("indestructible");
      let t = scenario({ p1: { battlefield: ["Memnarch, the Warden", "Goblin Firebomb", "Island"] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Memnarch, the Warden")]);
      t = settle(t);
      expect(t.players.p1?.hand).toHaveLength(2);
    });

    it("Mirage Mirror: {2}, a copy of target artifact, creature, enchantment or land until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Mirage Mirror", ...lands("Plains", 2)] }, p2: { battlefield: ["Serra Angel"] } });
      const mirror = idOf(s, "p1", "battlefield", "Mirage Mirror");
      s = settle(activate(s, "p1", mirror, { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(chars(s, mirror).name).toBe("Serra Angel");
      expect(pt(s, mirror)).toEqual([4, 4]);
      expect(chars(s, mirror).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, mirror).name).toBe("Mirage Mirror");
      expect(chars(s, mirror).types).toEqual(["Artifact"]);
    });

    it("Mole Module: crew 2, menace; combat damage to a player, mill four, a permanent card among them onto the battlefield", () => {
      let s = scenario({
        p1: { battlefield: ["Mole Module", "Bear Cub"], library: ["Opt", "Serra Angel", "Shock", "Forest", "Forest"] },
      });
      const mole = idOf(s, "p1", "battlefield", "Mole Module");
      s = settle(activate(s, "p1", mole, { tap: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(chars(s, mole).keywords).toContain("menace");
      s = attack(s, [mole]);
      let offered: string[] = [];
      s = throughCombat(s, (req, _p, cur) => {
        if (req.type === "yesNo" || req.intent === "may") return [1];
        if (req.type !== "pick") return undefined;
        offered = (namesIn(cur, req.options) as string[]).sort();
        return req.options.filter((id) => nameOf(cur, id) === "Serra Angel");
      });
      expect(s.players.p2?.life).toBe(14);
      expect(offered).toEqual(["Forest", "Serra Angel"]);
      expect(onField(s, "p1", "Serra Angel")).toBe(1);
      expect(graveyardNames(s, "p1")).toEqual(["Forest", "Opt", "Shock"]);
    });

    it("Ninja Pizza: a Food at your second main phase; your Foods tap and sacrifice for one mana of any color", () => {
      let s = scenario({ p1: { battlefield: ["Ninja Pizza"], hand: ["Shock"] } });
      s = settle(throughCombat(s));
      expect(tokens(s, "p1", "Food")).toHaveLength(1);
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(tokens(s, "p1", "Food")).toHaveLength(0);
    });

    it("Noble Hierarch: exalted; {T}: {G}, {W} or {U}", () => {
      let s = scenario({ p1: { battlefield: ["Noble Hierarch", "Bear Cub"] } });
      const noble = idOf(s, "p1", "battlefield", "Noble Hierarch");
      expect(manaAbilitiesOf(s, noble).flatMap((m) => m.produce)).toEqual(["G", "W", "U"]);
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(17);
    });

    it("O'aka, Traveling Merchant: {T}, remove a counter from a nonland permanent you control: draw a card", () => {
      const none = scenario({ p1: { battlefield: ["O'aka, Traveling Merchant", "Bear Cub"] } });
      expect(activations(none, "p1", idOf(none, "p1", "battlefield", "O'aka, Traveling Merchant"))).toEqual([]);
      let s = scenario({ p1: { battlefield: ["O'aka, Traveling Merchant", { name: "Bear Cub", counters: { "+1/+1": 2 } }] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "O'aka, Traveling Merchant")));
      expect(plusOne(s, bear)).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("O'aka, Traveling Merchant: the player chooses the kind of the removed counter (PLAN-M M6)", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["O'aka, Traveling Merchant", { name: "Bear Cub", counters: { "+1/+1": 2, charge: 1 } }] },
        });
      let s = start();
      const oaka = idOf(s, "p1", "battlefield", "O'aka, Traveling Merchant");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const pick = activations(s, "p1", oaka)[0]?.picks?.find((p) => p.slot === "counterFrom");
      expect(pick?.options).toEqual([bear, `${bear}:+1/+1`, `${bear}:charge`]);
      expect(pick?.labels?.[`${bear}:+1/+1`]).toBeDefined();
      // By default, the charge counter (+1/+1 last); chosen, a +1/+1 counter.
      const byDefault = settle(activate(start(), "p1", oaka));
      expect(byDefault.objects[bear]?.counters).toEqual({ "+1/+1": 2 });
      s = settle(activate(s, "p1", oaka, { picks: { counterFrom: [`${bear}:+1/+1`] } }));
      expect(s.objects[bear]?.counters).toMatchObject({ "+1/+1": 1, charge: 1 });
      expect(s.players.p1?.hand).toHaveLength(1);
      // A kind the permanent doesn't carry: refused.
      const t = start();
      expect(() => activate(t, "p1", oaka, { picks: { counterFrom: [`${bear}:-1/-1`] } })).toThrow();
    });

    it("Ob Nixilis, the Ascended: destroys the opponents' tapped creatures, 1 life each; an Angel at an end step after life gained", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 7), hand: ["Ob Nixilis, the Ascended"] },
        p2: {
          battlefield: [{ name: "Bear Cub", tapped: true }, { name: "Savannah Lions", tapped: true }, "Llanowar Elves"],
        },
      });
      s = settle(castIt(s, "p1", "Ob Nixilis, the Ascended"));
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub", "Savannah Lions"]);
      expect(onField(s, "p2", "Llanowar Elves")).toBe(1);
      expect(s.players.p1?.life).toBe(22);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      const angel = tokens(s, "p1", "Angel")[0] as string;
      expect(pt(s, angel)).toEqual([4, 4]);
      expect(chars(s, angel).keywords).toContain("flying");
      // The opponent's end step: no life gained this turn, no Angel.
      s = advanceUntil(s, (x) => x.turn.active === "p1");
      expect(tokens(s, "p1", "Angel")).toHaveLength(1);
    });

    it("Occult Epiphany: draw X, discard X; a 1/1 flying Spirit for each card type among the discarded cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Occult Epiphany", "Shock", "Bear Cub"], library: lands("Forest", 4) },
      });
      const keep = ["Shock", "Bear Cub"];
      s = settle(castIt(s, "p1", "Occult Epiphany", { x: 2 }), (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => keep.includes(nameOf(cur, id) ?? "")) : undefined,
      );
      if (s.pending?.kind === "discard")
        s = settle(act(s, "p1", { type: "discard", cards: [idOf(s, "p1", "hand", "Shock"), idOf(s, "p1", "hand", "Bear Cub")] }));
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub", "Occult Epiphany", "Shock"]);
      expect(handNames(s, "p1")).toEqual(["Forest", "Forest"]);
      const spirits = tokens(s, "p1", "Spirit");
      expect(spirits).toHaveLength(2);
      expect(chars(s, spirits[0] as string).keywords).toContain("flying");
    });

    it("Overwhelming Stampede: your creatures gain trample and get +X/+X, X the greatest power among them", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Serra Angel", ...lands("Forest", 5)], hand: ["Overwhelming Stampede"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Overwhelming Stampede"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([6, 6]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toEqual([8, 8]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(pt(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Path of Discovery: each creature entering under your control explores", () => {
      let s = scenario({
        p1: {
          battlefield: ["Path of Discovery", ...lands("Forest", 4)],
          hand: ["Bear Cub", "Llanowar Elves"],
          library: ["Forest", "Shock", "Opt"],
        },
      });
      s = settle(castIt(s, "p1", "Bear Cub"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(handNames(s, "p1")).toEqual(["Forest", "Llanowar Elves"]);
      s = settle(castIt(s, "p1", "Llanowar Elves"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(1);
    });

    it("Piper Wright, Publick Reporter: investigates once per damage dealt to a player; a Clue sacrificed, a +1/+1 counter", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Piper Wright, Publick Reporter", counters: { "+1/+1": 1 } }, ...lands("Island", 2)] },
      });
      const piper = idOf(s, "p1", "battlefield", "Piper Wright, Publick Reporter");
      s = attack(s, [piper]);
      s = throughCombat(s);
      const clues = tokens(s, "p1", "Clue");
      expect(clues).toHaveLength(2);
      s = settle(activate(s, "p1", clues[0] as string), picking([piper]));
      expect(plusOne(s, piper)).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
    });
  });
  describe("rare, P to S", () => {
    it("Power Fist: trample; combat damage to a player puts that many +1/+1 counters on the equipped creature", () => {
      let s = scenario({ p1: { battlefield: ["Power Fist", "Bear Cub", ...lands("Forest", 2)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Power Fist"), { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("trample");
      s = attack(s, [bear]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(18);
      expect(plusOne(s, bear)).toBe(2);
    });

    it("Power Pack: combat damage exiles an instant or sorcery from your graveyard; cast free at your next upkeep, then exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Power Pack"], graveyard: ["Lightning Bolt", "Bear Cub"] },
      });
      const pack = idOf(s, "p1", "battlefield", "Power Pack");
      expect(chars(s, pack).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "trample", "haste"]));
      s = attack(s, [pack]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(16);
      expect(exiled(s, "Lightning Bolt")).toHaveLength(1);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && !!castNowOf(x));
      const bolt = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, bolt)).toBe("Lightning Bolt");
      s = settle(act(s, "p1", { type: "cast", card: bolt, targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(13);
      expect(exiled(s, "Lightning Bolt")).toHaveLength(1);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
    });

    it("Protection Magic: a shield counter on each of up to three target creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", "Savannah Lions", "Plains", "Plains"], hand: ["Protection Magic"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Protection Magic", { targets: { t: [bear, lions] } }));
      expect([s.objects[bear]?.counters.shield, s.objects[lions]?.counters.shield]).toEqual([1, 1]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [bear] } }));
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      expect(s.objects[bear]?.counters.shield ?? 0).toBe(0);
      expect(s.objects[bear]?.damage).toBe(0);
    });

    it("Pull from Tomorrow: draw X cards, then discard a card", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Pull from Tomorrow"], library: lands("Forest", 5) } });
      s = settle(castIt(s, "p1", "Pull from Tomorrow", { x: 3 }));
      if (s.pending?.kind === "discard") s = settle(act(s, "p1", { type: "discard", cards: [s.players.p1?.hand[0] as string] }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(graveyardNames(s, "p1")).toEqual(["Forest", "Pull from Tomorrow"]);
    });

    it("Radstorm: storm; each copy proliferates", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Bear Cub", counters: { "+1/+1": 1 } }, ...lands("Island", 4), "Mountain"],
          hand: ["Shock", "Radstorm"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = settle(castIt(s, "p1", "Radstorm"), picking([bear]));
      expect(plusOne(s, bear)).toBe(3);
    });

    it("Rampaging Yao Guai: enters with X counters; destroys artifacts and enchantments with total mana value X or less", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 6), hand: ["Rampaging Yao Guai"] },
        p2: { battlefield: ["Goblin Firebomb", "Sanguine Bond"] },
      });
      const bomb = idOf(s, "p2", "battlefield", "Goblin Firebomb");
      const bond = idOf(s, "p2", "battlefield", "Sanguine Bond");
      const card = idOf(s, "p1", "hand", "Rampaging Yao Guai");
      // Total mana value 6 > X = 3: refused.
      expect(() => settle(act(s, "p1", { type: "cast", card, x: 3 }), picking([bomb, bond]))).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, x: 3 }), picking([bomb]));
      const yao = idOf(s, "p1", "battlefield", "Rampaging Yao Guai");
      expect(pt(s, yao)).toEqual([5, 5]);
      expect(chars(s, yao).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
      expect(graveyardNames(s, "p2")).toEqual(["Goblin Firebomb"]);
    });

    it("Rampant Rejuvenator: enters with two counters; dies, up to X basic lands onto the battlefield (X: its power)", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Rampant Rejuvenator"], library: [...lands("Forest", 3), "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = settle(castIt(s, "p1", "Rampant Rejuvenator"));
      const plant = idOf(s, "p1", "battlefield", "Rampant Rejuvenator");
      expect(pt(s, plant)).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      const before = onField(s, "p1", "Forest");
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [plant] } }), (req) =>
        req.type === "pick" ? req.options.slice(0, 2) : undefined,
      );
      expect(onField(s, "p1", "Forest")).toBe(before + 2);
    });

    it("Rat King, Pale Piper: it or another nontoken creature of yours leaves, a Rat; {2}, sacrifice a token: draw", () => {
      let s = scenario({
        p1: { battlefield: ["Rat King, Pale Piper", "Bear Cub", "Swamp", ...lands("Plains", 2)], hand: ["Village Rites"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Rat King, Pale Piper")).keywords).toContain("menace");
      s = settle(castIt(s, "p1", "Village Rites", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      const rats = tokens(s, "p1", "Rat");
      expect(rats).toHaveLength(1);
      expect(pt(s, rats[0] as string)).toEqual([1, 1]);
      // A token leaving: no Rat.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Rat King, Pale Piper"), { sacrifice: rats }));
      expect(tokens(s, "p1", "Rat")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(3);
    });

    it("Recon Craft Theta: an Alien with a +1/+1 counter as it enters; crew 2; attacks, proliferate", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Recon Craft Theta"] } });
      s = settle(castIt(s, "p1", "Recon Craft Theta"));
      const alien = tokens(s, "p1", "Alien")[0] as string;
      expect(pt(s, alien)).toEqual([1, 1]);
      let t = scenario({ p1: { battlefield: ["Recon Craft Theta", { name: "Bear Cub", counters: { "+1/+1": 1 } }] } });
      const craft = idOf(t, "p1", "battlefield", "Recon Craft Theta");
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", craft, { tap: [bear] }));
      expect(chars(t, craft).keywords).toContain("flying");
      t = attack(t, [craft]);
      t = settle(t, picking([bear]));
      expect(plusOne(t, bear)).toBe(2);
    });

    it("Recurring Insight: draw as many cards as the target opponent's hand; rebound", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 6), hand: ["Recurring Insight"], library: lands("Forest", 10) },
        p2: { hand: ["Shock", "Opt", "Forest"] },
      });
      s = settle(castIt(s, "p1", "Recurring Insight", { targets: { p: ["p2"] } }));
      expect(handNames(s, "p1")).toEqual(["Forest", "Forest", "Forest"]);
      expect(exiled(s, "Recurring Insight")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && !!castNowOf(x));
      const insight = castNowOf(s)?.cards[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: insight, targets: { p: ["p2"] } }));
      expect(idsOf(s, "p1", "graveyard", "Recurring Insight")).toHaveLength(1);
    });

    it("Resourceful Defense: a permanent of yours with counters leaves, its counters onto another; {4}{W} moves counters", () => {
      let s = scenario({
        p1: {
          battlefield: ["Resourceful Defense", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Savannah Lions", "Swamp"],
          hand: ["Village Rites"],
        },
      });
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Village Rites", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }), picking([lions]));
      expect(plusOne(s, lions)).toBe(2);
      let t = scenario({
        p1: {
          battlefield: [
            "Resourceful Defense",
            { name: "Bear Cub", counters: { "+1/+1": 2 } },
            "Savannah Lions",
            ...lands("Plains", 5),
          ],
        },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      const lions2 = idOf(t, "p1", "battlefield", "Savannah Lions");
      t = settle(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Resourceful Defense"), { targets: { a: [bear], b: [lions2] } }),
        (req) => (req.type === "number" ? [2] : undefined),
      );
      expect([plusOne(t, bear), plusOne(t, lions2)]).toEqual([0, 2]);
    });

    it("Rikku, Resourceful Guardian: counters put on a creature, it can't be blocked by opposing creatures; Steal moves a counter", () => {
      let s = scenario({
        p1: { battlefield: ["Rikku, Resourceful Guardian", "Bear Cub", "Plains", "Island"], hand: ["Fleeting Flight"] },
        p2: { battlefield: [{ name: "Savannah Lions", counters: { "+1/+1": 1 } }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Rikku, Resourceful Guardian"), { targets: { a: [lions], b: [bear] } }),
      );
      expect([plusOne(s, lions), plusOne(s, bear)]).toEqual([0, 1]);
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers", 50);
      expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: lions, attacker: bear }] })).toThrow();
    });

    it("Rocksteady, Mutant Marauder: partner with Bebop; another nontoken creature enters, a +1/+1 counter on target creature", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5)],
          hand: ["Rocksteady, Mutant Marauder", "Bear Cub"],
          library: ["Forest", "Bebop, Skull & Crossbones", "Forest"],
        },
      });
      s = settle(castIt(s, "p1", "Rocksteady, Mutant Marauder"), (req) =>
        req.intent === "may" ? [1] : req.type === "pick" && req.intent === "triggerTarget" ? ["p1"] : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Bear Cub", "Bebop, Skull & Crossbones"]);
      const rock = idOf(s, "p1", "battlefield", "Rocksteady, Mutant Marauder");
      expect(chars(s, rock).keywords).toContain("trample");
      s = settle(castIt(s, "p1", "Bear Cub"), picking([rock]));
      expect(plusOne(s, rock)).toBe(1);
    });

    it("Scholar of New Horizons: {T}, remove a counter: a Plains, onto the battlefield tapped if an opponent has more lands", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Scholar of New Horizons"], library: ["Forest", "Plains", "Forest"] },
        p2: { battlefield: lands("Mountain", 4) },
      });
      s = settle(castIt(s, "p1", "Scholar of New Horizons"));
      const scholar = idOf(s, "p1", "battlefield", "Scholar of New Horizons");
      expect(pt(s, scholar)).toEqual([2, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(activate(s, "p1", scholar), yes);
      expect(plusOne(s, scholar)).toBe(0);
      const plains = idsOf(s, "p1", "battlefield", "Plains");
      expect(plains).toHaveLength(3);
      expect(plains.filter((id) => s.objects[id]?.tapped)).toHaveLength(1);
      // As many lands as the opponent: into the hand.
      let t = scenario({
        p1: {
          battlefield: [{ name: "Scholar of New Horizons", counters: { "+1/+1": 1 } }, ...lands("Plains", 2)],
          library: ["Plains", "Forest"],
        },
        p2: { battlefield: lands("Mountain", 2) },
      });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Scholar of New Horizons")), yes);
      expect(handNames(t, "p1")).toEqual(["Plains"]);
    });

    it("Screamer-Killer: trample; you cast a creature spell with mana value 5 or greater, 5 damage to any target", () => {
      let s = scenario({
        p1: { battlefield: ["Screamer-Killer", ...lands("Plains", 6)], hand: ["Serra Angel", "Savannah Lions"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Screamer-Killer")).keywords).toContain("trample");
      s = settle(castIt(s, "p1", "Savannah Lions"), picking(["p2"]));
      expect(s.players.p2?.life).toBe(20);
      s = settle(castIt(s, "p1", "Serra Angel"), picking(["p2"]));
      expect(s.players.p2?.life).toBe(15);
    });

    it("Secure the Wastes: X 1/1 white Warriors", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Secure the Wastes"] } });
      s = settle(castIt(s, "p1", "Secure the Wastes", { x: 3 }));
      const warriors = tokens(s, "p1", "Warrior");
      expect(warriors).toHaveLength(3);
      expect(pt(s, warriors[0] as string)).toEqual([1, 1]);
      expect(chars(s, warriors[0] as string).colors).toEqual(["W"]);
    });

    it("Seize the Day: untaps a creature; an additional combat and main phase; flashback", () => {
      let s = scenario({
        step: "main2",
        p1: { battlefield: [{ name: "Bear Cub", tapped: true }, ...lands("Mountain", 4)], hand: ["Seize the Day"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Seize the Day", { targets: { t: [bear] } }));
      expect(s.objects[bear]?.tapped).toBe(false);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" || x.turn.active === "p2");
      expect(s.turn.active).toBe("p1");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(18);
      // Flashback from the graveyard.
      let t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], graveyard: ["Seize the Day"] } });
      const card = idOf(t, "p1", "graveyard", "Seize the Day");
      t = settle(act(t, "p1", { type: "cast", card, targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
      expect(exiled(t, "Seize the Day")).toHaveLength(1);
    });

    it("Shark Typhoon: a noncreature spell cast, an X/X flying Shark (X its mana value); cycling {X}{1}{U}, an X/X Shark", () => {
      let s = scenario({ p1: { battlefield: ["Shark Typhoon", "Mountain"], hand: ["Shock"] } });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      const shark = tokens(s, "p1", "Shark")[0] as string;
      expect(pt(s, shark)).toEqual([1, 1]);
      expect(chars(s, shark).keywords).toContain("flying");
      let t = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Shark Typhoon"] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "hand", "Shark Typhoon"), { x: 3 }));
      expect(graveyardNames(t, "p1")).toEqual(["Shark Typhoon"]);
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(pt(t, tokens(t, "p1", "Shark")[0] as string)).toEqual([3, 3]);
    });

    it("Shelinda, Yevon Acolyte: lifelink; another creature enters with power not less than Shelinda's, a counter on Shelinda", () => {
      let s = scenario({ p1: { battlefield: ["Shelinda, Yevon Acolyte", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const shelinda = idOf(s, "p1", "battlefield", "Shelinda, Yevon Acolyte");
      expect(chars(s, shelinda).keywords).toContain("lifelink");
      s = settle(castIt(s, "p1", "Bear Cub"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(plusOne(s, shelinda)).toBe(1);
    });

    it("Shellshock: up to one creature per opponent dealt X damage; a Mutagen for each creature dealt damage", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Mountain", 3), hand: ["Shellshock"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
        p3: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const elves = idOf(s, "p3", "battlefield", "Llanowar Elves");
      const card = idOf(s, "p1", "hand", "Shellshock");
      expect(() => act(s, "p1", { type: "cast", card, x: 2, targets: { t: [bear, lions] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, x: 2, targets: { t: [bear, elves] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub"]);
      expect(graveyardNames(s, "p3")).toEqual(["Llanowar Elves"]);
      expect(tokens(s, "p1", "Mutagen")).toHaveLength(2);
    });

    it("Special Move: two modes, Jump Kick destroys an artifact, Foot Toss deals damage equal to power then sacrifices", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Mountain", 3)], hand: ["Special Move"] },
        p2: { battlefield: ["Goblin Firebomb"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        castIt(s, "p1", "Special Move", {
          mode: 1,
          targets: { ja: [idOf(s, "p2", "battlefield", "Goblin Firebomb")], fa: [bear], fb: ["p2"] },
        }),
      );
      expect(graveyardNames(s, "p2")).toEqual(["Goblin Firebomb"]);
      expect(s.players.p2?.life).toBe(18);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub", "Special Move"]);
    });

    it("Sphere Grid: combat damage to a player, a +1/+1 counter; your creatures with +1/+1 counters have reach and trample", () => {
      let s = scenario({ p1: { battlefield: ["Sphere Grid", "Bear Cub", "Savannah Lions"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(chars(s, bear).keywords).not.toContain("trample");
      s = attack(s, [bear]);
      s = throughCombat(s);
      expect(plusOne(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["reach", "trample"]));
      expect(chars(s, lions).keywords).not.toContain("reach");
    });
  });
  describe("rare, S to Z", () => {
    it("Staff of the Storyteller: a Spirit as it enters; creature tokens created, a story counter; {W}, {T}, remove one: draw", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 4), ...lands("Mountain", 3)],
          hand: ["Staff of the Storyteller", "Dragon Fodder"],
        },
      });
      s = settle(castIt(s, "p1", "Staff of the Storyteller"));
      const staff = idOf(s, "p1", "battlefield", "Staff of the Storyteller");
      const spirit = tokens(s, "p1", "Spirit")[0] as string;
      expect(chars(s, spirit).keywords).toContain("flying");
      expect(s.objects[staff]?.counters.story).toBe(1);
      // Two Goblins at once: one counter.
      s = settle(castIt(s, "p1", "Dragon Fodder"));
      expect(s.objects[staff]?.counters.story).toBe(2);
      s = settle(activate(s, "p1", staff));
      expect(s.objects[staff]?.counters.story).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Steelbane Hydra: enters with X counters; {2}{G}, remove a +1/+1 counter: destroy target artifact or enchantment", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 7), hand: ["Steelbane Hydra"] },
        p2: { battlefield: ["Goblin Firebomb"] },
      });
      s = settle(castIt(s, "p1", "Steelbane Hydra", { x: 2 }));
      const hydra = idOf(s, "p1", "battlefield", "Steelbane Hydra");
      expect(pt(s, hydra)).toEqual([2, 2]);
      s = settle(activate(s, "p1", hydra, { targets: { t: [idOf(s, "p2", "battlefield", "Goblin Firebomb")] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Goblin Firebomb"]);
      expect(plusOne(s, hydra)).toBe(1);
    });

    it("Stormfist Crusader: menace; at your upkeep, each player draws a card and loses 1 life", () => {
      let s = scenario({ p1: { battlefield: ["Stormfist Crusader"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Stormfist Crusader")).keywords).toContain("menace");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([19, 19]);
      // p1: the Crusader's card and the draw step's; p2: the Crusader's card and its own draw step.
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p2?.hand).toHaveLength(2);
    });

    it("Summon: Ixion: I exiles an opposing creature until it leaves; II, III counters on up to two of yours and 2 life", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), "Savannah Lions"], hand: ["Summon: Ixion"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Summon: Ixion"), picking([bear]));
      const ixion = idOf(s, "p1", "battlefield", "Summon: Ixion");
      expect(chars(s, ixion).keywords).toContain("firstStrike");
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      s = advanceAnswering(
        s,
        (x) =>
          x.turn.active === "p1" &&
          x.turn.number > 3 &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.triggers.length === 0,
        picking([lions, ixion]),
      );
      expect([plusOne(s, lions), plusOne(s, ixion)]).toEqual([1, 1]);
      expect(s.players.p1?.life).toBe(22);
      s = advanceAnswering(
        s,
        (x) =>
          x.turn.active === "p1" &&
          x.turn.number > 5 &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.triggers.length === 0,
        picking([lions]),
      );
      // After III: sacrificed, the Bear Cub returns.
      expect(onField(s, "p1", "Summon: Ixion")).toBe(0);
      expect(onField(s, "p2", "Bear Cub")).toBe(1);
      expect(s.players.p1?.life).toBe(24);
    });

    it("Summon: Magus Sisters: haste; each chapter chooses one of three modes at random", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Summon: Magus Sisters"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
      s = settle(castIt(s, "p1", "Summon: Magus Sisters"), (req, _p, cur) =>
        req.type === "pick" && req.intent === "triggerTarget"
          ? req.options.filter(
              (id) =>
                nameOf(cur, id) === (req.options.includes(elves) && req.min === 0 ? "Llanowar Elves" : "Summon: Magus Sisters"),
            )
          : undefined,
      );
      const sisters = idOf(s, "p1", "battlefield", "Summon: Magus Sisters");
      expect(chars(s, sisters).keywords).toContain("haste");
      const combine = plusOne(s, sisters) === 3;
      const defense = s.objects[sisters]?.counters.shield === 1 && s.players.p1?.life === 23;
      const fight = idsOf(s, "p2", "graveyard", "Llanowar Elves").length === 1;
      expect([combine, defense, fight].filter(Boolean)).toHaveLength(1);
    });

    it("Summon: Yojimbo: vigilance; I exiles an artifact, enchantment or tapped creature an opponent controls", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Summon: Yojimbo"] },
        p2: { battlefield: ["Bear Cub", { name: "Savannah Lions", tapped: true }] },
      });
      // The untapped Bear Cub isn't a legal target: the tapped Savannah Lions is the only one.
      s = settle(castIt(s, "p1", "Summon: Yojimbo"));
      expect(exiled(s, "Savannah Lions")).toHaveLength(1);
      expect(onField(s, "p2", "Bear Cub")).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Summon: Yojimbo")).keywords).toContain("vigilance");
    });

    it("Summoner's Sending: at your end step, you may exile a creature card from a graveyard for a 1/1 flying Spirit", () => {
      let s = scenario({ p1: { battlefield: ["Summoner's Sending"] }, p2: { graveyard: ["Bear Cub"] } });
      const angel = idOf(s, "p2", "graveyard", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
      s = settle(s, (req) => (req.intent === "may" ? [1] : picking([angel])(req)));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      const spirit = tokens(s, "p1", "Spirit")[0] as string;
      // Mana value 2: no +1/+1 counter.
      expect(pt(s, spirit)).toEqual([1, 1]);
      expect(chars(s, spirit).keywords).toContain("flying");
    });

    it("Sunscorch Regent: an opponent casts a spell, a +1/+1 counter and 1 life", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Sunscorch Regent"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Shock", "Shock"] },
      });
      const regent = idOf(s, "p1", "battlefield", "Sunscorch Regent");
      expect(chars(s, regent).keywords).toContain("flying");
      s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
      s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }));
      expect(plusOne(s, regent)).toBe(2);
      expect(s.players.p1?.life).toBe(18);
    });

    it("Super Combo: your creature deals damage equal to its power to an opposing creature; replicate {2}", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 4)], hand: ["Super Combo"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(
        castIt(s, "p1", "Super Combo", { x: 1, targets: { a: [idOf(s, "p1", "battlefield", "Bear Cub")], b: [angel] } }),
      );
      // 2 + 2 damage: the 4/4 Angel dies.
      expect(graveyardNames(s, "p2")).toEqual(["Serra Angel"]);
      let t = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Forest", 2)], hand: ["Super Combo"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel2 = idOf(t, "p2", "battlefield", "Serra Angel");
      t = settle(castIt(t, "p1", "Super Combo", { targets: { a: [idOf(t, "p1", "battlefield", "Bear Cub")], b: [angel2] } }));
      expect(t.objects[angel2]?.damage).toBe(2);
    });

    it("Synthetic Destiny: exiles your creatures; at the next end step, as many creature cards revealed onto the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 6), "Bear Cub", "Savannah Lions"],
          hand: ["Synthetic Destiny"],
          library: ["Forest", "Serra Angel", "Opt", "Llanowar Elves", "Gigantosaurus", "Forest"],
        },
      });
      s = settle(castIt(s, "p1", "Synthetic Destiny"));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Savannah Lions")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect([onField(s, "p1", "Serra Angel"), onField(s, "p1", "Llanowar Elves"), onField(s, "p1", "Gigantosaurus")]).toEqual([
        1, 1, 0,
      ]);
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Tempestra, Dame of Games: sacrifice an artifact, a nonlegendary hasty copy of another creature, sacrificed at end step", () => {
      let s = scenario({
        p1: { battlefield: ["Tempestra, Dame of Games", "Marcus, Mutant Mayor", "Goblin Firebomb", ...lands("Mountain", 3)] },
      });
      const marcus = idOf(s, "p1", "battlefield", "Marcus, Mutant Mayor");
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Tempestra, Dame of Games"), {
          targets: { t: [marcus] },
          sacrifice: [idOf(s, "p1", "battlefield", "Goblin Firebomb")],
        }),
      );
      const copy = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
      expect(chars(s, copy).name).toBe("Marcus, Mutant Mayor");
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      expect(chars(s, copy).keywords).toContain("haste");
      expect(s.objects[marcus]?.zone).toBe("battlefield");
      expect(graveyardNames(s, "p1")).toEqual(["Goblin Firebomb"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[copy]?.zone ?? "gone").not.toBe("battlefield");
    });

    it("Temur Ascendancy: your creatures have haste; a creature with power 4 or greater enters, you may draw", () => {
      let s = scenario({
        p1: { battlefield: ["Temur Ascendancy", ...lands("Plains", 6)], hand: ["Serra Angel", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Savannah Lions"), yes);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).toContain("haste");
      s = settle(castIt(s, "p1", "Serra Angel"), yes);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("The Fantasticar: a noncreature spell, it may become a creature; the fourth one, sacrificed for four 4/4 Constructs", () => {
      let s = scenario({
        p1: { battlefield: ["The Fantasticar", ...lands("Mountain", 4)], hand: ["Shock", "Shock", "Shock", "Shock"] },
      });
      const car = idOf(s, "p1", "battlefield", "The Fantasticar");
      expect(chars(s, car).types).not.toContain("Creature");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }), yes);
      expect(chars(s, car).types).toContain("Creature");
      const sacrificeIt = (req: ChoiceRequest) => (req.type === "pick" && req.intent === "sacrifice" ? req.options : yes(req));
      for (let i = 0; i < 3; i++) s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }), sacrificeIt);
      expect(onField(s, "p1", "The Fantasticar")).toBe(0);
      const constructs = tokens(s, "p1", "Construct");
      expect(constructs).toHaveLength(4);
      expect(pt(s, constructs[0] as string)).toEqual([4, 4]);
      expect(chars(s, constructs[0] as string).keywords).toEqual(expect.arrayContaining(["flying", "haste"]));
    });

    it("Tokka & Rahzar, Unsupervised: another nontoken creature leaves, a counter and a Treasure, once each turn", () => {
      let s = scenario({
        p1: {
          battlefield: ["Tokka & Rahzar, Unsupervised", "Bear Cub", "Savannah Lions", ...lands("Swamp", 2)],
          hand: ["Village Rites", "Village Rites"],
        },
      });
      const tr = idOf(s, "p1", "battlefield", "Tokka & Rahzar, Unsupervised");
      expect(chars(s, tr).keywords).toContain("firstStrike");
      s = settle(castIt(s, "p1", "Village Rites", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")] }));
      expect(plusOne(s, tr)).toBe(1);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      s = settle(castIt(s, "p1", "Village Rites", { sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")] }));
      expect(plusOne(s, tr)).toBe(1);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
    });

    it("Tromell, Seymour's Butler: your other nontoken creatures enter with a counter; {1}, {T}: proliferate X times", () => {
      let s = scenario({
        p1: { battlefield: ["Tromell, Seymour's Butler", ...lands("Forest", 4)], hand: ["Bear Cub", "Dragon Fodder"] },
      });
      s = settle(castIt(s, "p1", "Bear Cub"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(plusOne(s, bear)).toBe(1);
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Tromell, Seymour's Butler"))).toBe(0);
      // One nontoken creature entered this turn: proliferate once.
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Tromell, Seymour's Butler")), picking([bear]));
      expect(plusOne(s, bear)).toBe(2);
    });

    it("Vanquish the Horde: costs {1} less for each creature on the battlefield; destroys all creatures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub", "Savannah Lions"], hand: ["Vanquish the Horde"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      s = settle(castIt(s, "p1", "Vanquish the Horde"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toEqual([]);
      const t = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Vanquish the Horde"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(legalActions(t, "p1").some((a) => a.type === "cast" && a.card === idOf(t, "p1", "hand", "Vanquish the Horde"))).toBe(
        false,
      );
    });

    it("Vault 87: Forced Evolution: I steals a non-Mutant creature while you control it; II a counter and Mutant; III draws", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), ...lands("Forest", 2)],
          hand: ["Vault 87: Forced Evolution"],
          library: lands("Forest", 10),
        },
        p2: { battlefield: ["Serra Angel", "Marcus, Mutant Mayor"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      let offered: string[] = [];
      s = settle(castIt(s, "p1", "Vault 87: Forced Evolution"), (req, _p, cur) => {
        if (req.type !== "pick") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return [angel];
      });
      expect(offered).not.toContain("Marcus, Mutant Mayor");
      expect(s.objects[angel]?.controller).toBe("p1");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && x.turn.step === "main1", 800);
      s = settle(s, picking([angel]));
      expect(plusOne(s, angel)).toBe(1);
      expect(chars(s, angel).subtypes).toContain("Mutant");
      const hand = s.players.p1?.hand.length ?? 0;
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 5 && x.turn.step === "main1", 800);
      s = settle(s);
      // III: 5 cards (the Angel, a 5/5 Mutant) plus the draw step; then the Saga is sacrificed and the Angel goes back.
      expect(s.players.p1?.hand.length).toBe(hand + 6);
      expect(s.objects[angel]?.controller).toBe("p2");
    });

    it("Voracious Hydra: enters with X counters; doubles them, or fights a creature you don't control", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Voracious Hydra"] } });
      s = settle(castIt(s, "p1", "Voracious Hydra", { x: 2 }), (req) =>
        req.type === "pick" && req.intent === "triggerMode" ? ["0"] : undefined,
      );
      const hydra = idOf(s, "p1", "battlefield", "Voracious Hydra");
      expect(plusOne(s, hydra)).toBe(4);
      expect(chars(s, hydra).keywords).toContain("trample");
      let t = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Voracious Hydra"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(t, "p2", "battlefield", "Bear Cub");
      t = settle(castIt(t, "p1", "Voracious Hydra", { x: 3 }), (req) =>
        req.type === "pick" && req.intent === "triggerMode" ? ["1"] : picking([bear])(req),
      );
      expect(graveyardNames(t, "p2")).toEqual(["Bear Cub"]);
      const hydra2 = idOf(t, "p1", "battlefield", "Voracious Hydra");
      expect([plusOne(t, hydra2), t.objects[hydra2]?.damage]).toEqual([3, 2]);
    });

    it("Walking Ballista: enters with X counters; {4}: a counter; remove a counter: 1 damage to any target", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 8), hand: ["Walking Ballista"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      s = settle(castIt(s, "p1", "Walking Ballista", { x: 2 }));
      const ballista = idOf(s, "p1", "battlefield", "Walking Ballista");
      expect(pt(s, ballista)).toEqual([2, 2]);
      s = settle(activate(s, "p1", ballista, {}, 0));
      expect(plusOne(s, ballista)).toBe(3);
      // Without mana left, removing a counter is the only ability offered.
      s = settle(activate(s, "p1", ballista, { targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] } }));
      s = settle(activate(s, "p1", ballista, { targets: { t: ["p2"] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Llanowar Elves"]);
      expect(s.players.p2?.life).toBe(19);
      expect(plusOne(s, ballista)).toBe(1);
    });

    it("Watchful Radstag: evolve; whenever it evolves, a token copy of it", () => {
      let s = scenario({
        p1: { battlefield: ["Watchful Radstag", ...lands("Plains", 6)], hand: ["Serra Angel", "Savannah Lions"] },
      });
      const stag = idOf(s, "p1", "battlefield", "Watchful Radstag");
      s = settle(castIt(s, "p1", "Savannah Lions"));
      expect(plusOne(s, stag)).toBe(0);
      s = settle(castIt(s, "p1", "Serra Angel"));
      expect(plusOne(s, stag)).toBe(1);
      const copies = s.battlefield.filter((id) => s.objects[id]?.isToken && nameOf(s, id) === "Watchful Radstag");
      expect(copies).toHaveLength(1);
    });

    it("Whirlwind of Thought: you cast a noncreature spell, draw a card", () => {
      let s = scenario({
        p1: { battlefield: ["Whirlwind of Thought", "Mountain", "Forest"], hand: ["Shock", "Llanowar Elves"] },
      });
      s = settle(castIt(s, "p1", "Llanowar Elves"));
      expect(s.players.p1?.hand).toHaveLength(1);
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(handNames(s, "p1")).toEqual(["Forest"]);
    });

    it("White Sun's Twilight: X life and X Phyrexian Mites; X 5 or more destroys all other creatures", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["White Sun's Twilight"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "White Sun's Twilight", { x: 2 }));
      expect(s.players.p1?.life).toBe(22);
      const mites = tokens(s, "p1", "Phyrexian Mite");
      expect(mites).toHaveLength(2);
      expect(chars(s, mites[0] as string).keywords).toContain("toxic");
      expect(onField(s, "p2", "Bear Cub")).toBe(1);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 7), "Savannah Lions"], hand: ["White Sun's Twilight"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "White Sun's Twilight", { x: 5 }));
      expect(tokens(t, "p1", "Phyrexian Mite")).toHaveLength(5);
      expect(onField(t, "p2", "Bear Cub")).toBe(0);
      expect(onField(t, "p1", "Savannah Lions")).toBe(0);
      expect(t.players.p1?.life).toBe(25);
    });

    it("Yuna's Decision: sacrifice a creature, draw, then a creature and/or land from hand; or one or two permanent cards back", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 4), "Bear Cub"],
          hand: ["Yuna's Decision", "Serra Angel", "Plains"],
          library: ["Opt", "Forest"],
        },
      });
      s = settle(castIt(s, "p1", "Yuna's Decision", { mode: 0 }), (req, _p, cur) =>
        req.type === "pick"
          ? req.options.filter((id) => ["Bear Cub", "Serra Angel", "Plains"].includes(nameOf(cur, id) ?? ""))
          : yes(req),
      );
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub", "Yuna's Decision"]);
      expect([onField(s, "p1", "Serra Angel"), onField(s, "p1", "Plains")]).toEqual([1, 1]);
      expect(handNames(s, "p1")).toEqual(["Opt"]);
      let t = scenario({
        p1: { battlefield: lands("Forest", 4), hand: ["Yuna's Decision"], graveyard: ["Bear Cub", "Shock", "Goblin Firebomb"] },
      });
      const bear = idOf(t, "p1", "graveyard", "Bear Cub");
      const bomb = idOf(t, "p1", "graveyard", "Goblin Firebomb");
      expect(() =>
        castIt(t, "p1", "Yuna's Decision", { mode: 1, targets: { g: [idOf(t, "p1", "graveyard", "Shock")] } }),
      ).toThrow();
      t = settle(castIt(t, "p1", "Yuna's Decision", { mode: 1, targets: { g: [bear, bomb] } }));
      expect(handNames(t, "p1")).toEqual(["Bear Cub", "Goblin Firebomb"]);
    });
  });

  describe("gaps found by L11, fixed", () => {
    it("Shelinda, Yevon Acolyte: a weaker creature gets the counter, and only it (the condition is read once)", () => {
      let s = scenario({ p1: { battlefield: ["Shelinda, Yevon Acolyte", "Forest"], hand: ["Llanowar Elves"] } });
      const shelinda = idOf(s, "p1", "battlefield", "Shelinda, Yevon Acolyte");
      s = settle(castIt(s, "p1", "Llanowar Elves"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toBe(1);
      expect(plusOne(s, shelinda)).toBe(0);
    });

    it("Summoner's Sending: mana value 4 or greater, the Spirit gets a +1/+1 counter", () => {
      let s = scenario({ p1: { battlefield: ["Summoner's Sending"] }, p2: { graveyard: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "graveyard", "Serra Angel");
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
      s = settle(s, (req) => (req.intent === "may" ? [1] : picking([angel])(req)));
      const spirit = tokens(s, "p1", "Spirit")[0] as string;
      expect(pt(s, spirit)).toEqual([2, 2]);
    });

    it("Swift Demise: destroys each creature you don't control that was dealt damage this turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 2), ...lands("Swamp", 3)], hand: ["Shock", "Swift Demise"] },
        p2: { battlefield: ["Gigantosaurus", "Bear Cub", "Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Gigantosaurus")] } }));
      s = settle(castIt(s, "p1", "Swift Demise", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub", "Gigantosaurus"]);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Yuna, Grand Summoner: the creature spell paid with its mana enters with two +1/+1 counters", () => {
      let s = scenario({ p1: { battlefield: ["Yuna, Grand Summoner", "Forest"], hand: ["Bear Cub"] } });
      const yuna = idOf(s, "p1", "battlefield", "Yuna, Grand Summoner");
      s = act(s, "p1", { type: "tapForMana", source: yuna, ability: 0, color: "G" });
      s = settle(castIt(s, "p1", "Bear Cub"));
      expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(2);
    });
  });
});
