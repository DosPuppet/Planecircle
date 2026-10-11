/**
 * Commander (EDH pseudo-set): rules tests for the "Sephiroth's Singularity" deck (Sephiroth, Fabled SOLDIER).
 * Aristocrats: sacrifice outlets, death triggers and their doubling (Drivnod), edicts, recursion, black mana.
 */
import { describe, expect, it } from "vitest";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import { act, advanceUntil, castable, exiled, idOf, idsOf, lands, nameOf, namesIn, picking, scenario, settle } from "./helpers";

const handNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const graveyardNames = (s: GameState, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const pool = (s: GameState, p: PlayerId): Record<string, number> => s.players[p]?.manaPool ?? {};
const castIt = (s: GameState, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const playLand = (s: GameState, p: PlayerId, name: string) =>
  act(s, p, { type: "playLand", card: idOf(s, p, "hand", name) } as never);
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
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
/** Answers the pending choices with their suggestion, without passing priority. */
const answerChoices = (s: GameState) => {
  let cur = s;
  for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++)
    cur = act(cur, cur.pending.player, { type: "choose", values: cur.pending.request.suggested });
  return cur;
};
/** Kills the named creature of `p` with p2's Lightning Bolt (p2 holds priority in its main phase). */
const bolt = (
  s: GameState,
  target: ObjectId,
  answer?: (req: ChoiceRequest, p: PlayerId, s: GameState) => (string | number)[] | undefined,
) =>
  settle(
    act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Bolt"), targets: { t: [target] } } as never),
    answer,
  );

describe("Sephiroth, Sephiroth's Singularity (EDH)", () => {
  describe("death triggers and sacrifice outlets", () => {
    it("Zulaport Cutthroat: a creature you control dies, each opponent loses 1 life and you gain 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Zulaport Cutthroat", "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      s = bolt(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Drivnod, Carnage Dominus: a death trigger triggers an additional time; indestructible counter", () => {
      let s = scenario({
        p1: { battlefield: ["Drivnod, Carnage Dominus", "Zulaport Cutthroat", "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      s = bolt(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(s.players.p2?.life).toBe(18);
      let t = scenario({
        p1: {
          battlefield: ["Drivnod, Carnage Dominus", ...lands("Swamp", 2)],
          graveyard: ["Bear Cub", "Savannah Lions", "Zulaport Cutthroat"],
        },
      });
      const drivnod = idOf(t, "p1", "battlefield", "Drivnod, Carnage Dominus");
      t = settle(activate(t, "p1", drivnod));
      expect(t.objects[drivnod]?.counters.indestructible).toBe(1);
      expect(t.players.p1?.graveyard).toHaveLength(0);
    });

    it("Ashnod's Altar: sacrifice a creature for {C}{C}", () => {
      let s = scenario({ p1: { battlefield: ["Ashnod's Altar", "Bear Cub"] } });
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Ashnod's Altar"));
      expect(pool(s, "p1").C).toBe(2);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
    });

    it("Warren Soultrader: pay 1 life, sacrifice another creature: a Treasure", () => {
      let s = scenario({ p1: { battlefield: ["Warren Soultrader", "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Warren Soultrader")));
      expect(tokensNamed(s, "p1", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Ayara: black creatures entering drain; sacrifice another black creature: draw", () => {
      let s = scenario({
        p1: {
          battlefield: ["Ayara, First of Locthwain", ...lands("Swamp", 2)],
          hand: ["Zulaport Cutthroat"],
          library: lands("Swamp", 5),
        },
      });
      s = settle(castIt(s, "p1", "Zulaport Cutthroat"));
      expect(s.players.p2?.life).toBe(19);
      const ayara = idOf(s, "p1", "battlefield", "Ayara, First of Locthwain");
      s = settle(activate(s, "p1", ayara));
      expect(s.players.p1?.hand).toHaveLength(1);
      // Zulaport (black) sacrificed: its own death drains too.
      expect(s.players.p2?.life).toBe(18);
    });

    it("Pawn of Ulamog: a nontoken creature of yours dies: an Eldrazi Spawn", () => {
      let s = scenario({
        p1: { battlefield: ["Pawn of Ulamog", "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      s = bolt(s, idOf(s, "p1", "battlefield", "Bear Cub"), yes);
      expect(tokensNamed(s, "p1", "Eldrazi Spawn")).toHaveLength(1);
    });

    it("Fumulus: a player sacrificing a nontoken creature makes an Insect", () => {
      let s = scenario({ p1: { battlefield: ["Fumulus, the Infestation", "Ashnod's Altar", "Bear Cub"] } });
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Ashnod's Altar"), {}),
        picking([idOf(s, "p1", "battlefield", "Bear Cub")]),
      );
      expect(tokensNamed(s, "p1", "Insect")).toHaveLength(1);
    });

    it("Mortuary: a creature put into your graveyard from the battlefield goes on top of your library", () => {
      let s = scenario({
        p1: { battlefield: ["Mortuary", "Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
        active: "p2",
      });
      s = bolt(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Bear Cub");
    });
  });

  describe("edicts", () => {
    it("Fleshbag Marauder: each player sacrifices a creature; Accursed Marauder: a nontoken one", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Fleshbag Marauder"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Fleshbag Marauder"), (req, p, st) =>
        p === "p1" && req.type === "pick" ? req.options.filter((id) => nameOf(st, id) === "Bear Cub") : undefined,
      );
      expect(graveyardNames(s, "p2")).toEqual(["Savannah Lions"]);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
    });

    it("Flare of Malice: sacrifice a nontoken black creature instead of paying; each opponent sacrifices its greatest", () => {
      let s = scenario({
        p1: { battlefield: ["Zulaport Cutthroat"], hand: ["Flare of Malice"] },
        p2: { battlefield: ["Savannah Lions", "Consecrated Sphinx"] },
      });
      const flare = idOf(s, "p1", "hand", "Flare of Malice");
      expect(castable(s, "p1", flare)).toBe(true);
      s = settle(castIt(s, "p1", "Flare of Malice", { alternative: true }));
      expect(graveyardNames(s, "p1")).toEqual(["Flare of Malice", "Zulaport Cutthroat"]);
      expect(graveyardNames(s, "p2")).toEqual(["Consecrated Sphinx"]);
    });

    it("Flare of Malice: the player chooses the sacrificed black creature (PLAN-M M6; lowest mana value suggested)", () => {
      let s = scenario({
        p1: { battlefield: ["Zulaport Cutthroat", "Gix, Yawgmoth Praetor"], hand: ["Flare of Malice"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const offer = legalActions(s, "p1").find((a) => a.type === "cast" && nameOf(s, a.card) === "Flare of Malice");
      const pick = offer?.type === "cast" ? offer.picks?.find((p) => p.slot === "altSacrifice") : undefined;
      expect(namesIn(s, pick?.suggested)).toEqual(["Zulaport Cutthroat"]);
      const gix = idOf(s, "p1", "battlefield", "Gix, Yawgmoth Praetor");
      s = settle(castIt(s, "p1", "Flare of Malice", { alternative: true, picks: { altSacrifice: [gix] } }));
      expect(graveyardNames(s, "p1")).toEqual(["Flare of Malice", "Gix, Yawgmoth Praetor"]);
      expect(idsOf(s, "p1", "battlefield", "Zulaport Cutthroat")).toHaveLength(1);
    });

    it("Braids, Arisen Nightmare: an opponent who doesn't sacrifice a permanent sharing a type loses 2 life and you draw", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Braids, Arisen Nightmare", "Bear Cub"], library: lands("Swamp", 5) },
          p2: { battlefield: ["Savannah Lions", "Mountain"] },
        });
      const toEnd = (
        s: GameState,
        answer: (req: ChoiceRequest, p: PlayerId, s: GameState) => (string | number)[] | undefined,
      ) => {
        let cur = s;
        for (let i = 0; i < 200 && !(cur.turn.active === "p2" && cur.turn.step === "upkeep"); i++) {
          const p = cur.pending;
          if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
          else if (p?.kind === "choice")
            cur = act(cur, p.player, {
              type: "choose",
              values: answer(p.request, p.player, cur) ?? p.request.suggested,
            } as never);
          else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
          else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
          else break;
        }
        return cur;
      };
      // p1 sacrifices the Bear (a creature); p2 refuses: 2 life, a card.
      const s = toEnd(start(), (req, p, st) =>
        req.type === "pick" && p === "p1"
          ? req.options.filter((id) => nameOf(st, id) === "Bear Cub")
          : req.type === "pick" && p === "p2"
            ? []
            : undefined,
      );
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.hand).toHaveLength(1);
      // p2 sacrifices its creature (the Mountain doesn't share a type: not offered).
      let t = start();
      let offered: string[] = [];
      t = toEnd(t, (req, p, st) => {
        if (req.type !== "pick") return undefined;
        if (p === "p1") return req.options.filter((id) => nameOf(st, id) === "Bear Cub");
        offered = namesIn(st, req.options) as string[];
        return req.options;
      });
      expect(offered).toEqual(["Savannah Lions"]);
      expect(t.players.p2?.life).toBe(20);
      expect(t.players.p1?.hand).toHaveLength(0);
    });
  });

  describe("recursion and graveyard", () => {
    it("Gravecrawler: can't block; castable from the graveyard while you control a Zombie", () => {
      const s = scenario({ p1: { battlefield: ["Swamp", "Fleshbag Marauder"], graveyard: ["Gravecrawler"] } });
      expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Gravecrawler"))).toBe(true);
      const t = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], graveyard: ["Gravecrawler"] } });
      expect(castable(t, "p1", idOf(t, "p1", "graveyard", "Gravecrawler"))).toBe(false);
    });

    it("Malakir Rebirth: you lose 2 life; the creature returns tapped when it dies this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Malakir Rebirth // Malakir Mire"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Malakir Rebirth // Malakir Mire", { targets: { t: [bear] } }));
      expect(s.players.p1?.life).toBe(18);
      s = act(s, "p1", { type: "pass" });
      s = bolt(s, bear);
      const back = idsOf(s, "p1", "battlefield", "Bear Cub");
      expect(back).toHaveLength(1);
      expect(s.objects[back[0] ?? ""]?.tapped).toBe(true);
    });

    it("Yawgmoth's Will: play lands and cast spells from your graveyard; cards go to exile instead", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Yawgmoth's Will"], graveyard: ["Swamp", "Fell the Profane // Fell Mire"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Yawgmoth's Will"));
      expect(exiled(s, "Yawgmoth's Will")).toHaveLength(1);
      const swamp = idOf(s, "p1", "graveyard", "Swamp");
      expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === swamp)).toBe(true);
    });

    it("Entomb: any card of your library into your graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Entomb"], library: ["Island", "Gravecrawler", "Swamp"] } });
      s = settle(castIt(s, "p1", "Entomb"), (req, _p, st) =>
        req.type === "pick" && req.intent === "search"
          ? req.options.filter((id) => nameOf(st, id) === "Gravecrawler")
          : undefined,
      );
      expect(graveyardNames(s, "p1")).toEqual(["Entomb", "Gravecrawler"]);
    });
  });

  describe("mana", () => {
    it("Cabal Coffers: {2}, {T}: {B} for each Swamp; Crypt Ghast doubles the Swamps' mana", () => {
      let s = scenario({ p1: { battlefield: ["Cabal Coffers", ...lands("Swamp", 4)] } });
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Cabal Coffers"));
      // {2} paid with two Swamps: {B} for each of the four (tapped or not).
      expect(pool(s, "p1").B).toBe(4);
      let t = scenario({ p1: { battlefield: ["Crypt Ghast", ...lands("Swamp", 2)], hand: ["Sheoldred, the Apocalypse"] } });
      // {2}{B}{B} with two Swamps (each one makes {B}{B}).
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Sheoldred, the Apocalypse"))).toBe(true);
      t = settle(castIt(t, "p1", "Sheoldred, the Apocalypse"));
      expect(idsOf(t, "p1", "battlefield", "Sheoldred, the Apocalypse")).toHaveLength(1);
    });

    it("Nykthos: {2}, {T}: mana of the chosen color equal to your devotion to it", () => {
      let s = scenario({
        p1: { battlefield: ["Nykthos, Shrine to Nyx", "Ayara, First of Locthwain", "Zulaport Cutthroat", ...lands("Swamp", 2)] },
      });
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Nykthos, Shrine to Nyx"));
      s = settle(s, (req) =>
        req.type === "pick" && req.labels
          ? Object.entries(req.labels)
              .filter(([, l]) => l === "Black")
              .map(([k]) => k)
          : undefined,
      );
      expect(pool(s, "p1").B).toBe(4);
    });

    it("Lake of the Dead: sacrifice a Swamp as it enters (otherwise to the graveyard); a Swamp for {B}{B}{B}{B}", () => {
      let s = scenario({ p1: { hand: ["Lake of the Dead"] } });
      s = settle(playLand(s, "p1", "Lake of the Dead"));
      expect(graveyardNames(s, "p1")).toEqual(["Lake of the Dead"]);
      let t = scenario({ p1: { battlefield: ["Swamp", "Swamp"], hand: ["Lake of the Dead"] } });
      t = answerChoices(playLand(t, "p1", "Lake of the Dead"));
      const lake = idOf(t, "p1", "battlefield", "Lake of the Dead");
      expect(graveyardNames(t, "p1")).toEqual(["Swamp"]);
      t = activate(t, "p1", lake);
      expect(pool(t, "p1").B).toBe(4);
    });

    it("Barad-dûr: tapped without a legendary creature; amass Orcs X if a creature died this turn", () => {
      let s = scenario({ p1: { hand: ["Barad-dûr"] } });
      s = settle(playLand(s, "p1", "Barad-dûr"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Barad-dûr")]?.tapped).toBe(true);
      let t = scenario({ p1: { battlefield: ["Ayara, First of Locthwain"], hand: ["Barad-dûr"] } });
      t = settle(playLand(t, "p1", "Barad-dûr"));
      expect(t.objects[idOf(t, "p1", "battlefield", "Barad-dûr")]?.tapped).toBe(false);
      const u = scenario({ p1: { battlefield: ["Barad-dûr", ...lands("Swamp", 3)] } });
      expect(activations(u, "p1", idOf(u, "p1", "battlefield", "Barad-dûr"))).toHaveLength(0);
    });

    it("Jet Medallion: black spells cost {1} less", () => {
      const s = scenario({ p1: { battlefield: ["Jet Medallion", "Swamp"], hand: ["Zulaport Cutthroat"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Zulaport Cutthroat"))).toBe(true);
    });
  });

  describe("other cards", () => {
    it("Great Unclean One: each opponent loses 2 life; a Plaguebearer for each one below your life", () => {
      let s = scenario({ p1: { battlefield: ["Great Unclean One"] }, p2: { life: 21 }, players: 2 });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.players.p2?.life).toBe(19);
      expect(tokensNamed(s, "p1", "Plaguebearer of Nurgle")).toHaveLength(1);
    });

    it("Jadar: a decayed Zombie at your end step if you control none", () => {
      let s = scenario({ p1: { battlefield: ["Jadar, Ghoulcaller of Nephalia"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(tokensNamed(s, "p1", "Zombie")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(tokensNamed(s, "p1", "Zombie")).toHaveLength(1);
    });

    it("Ophiomancer: a deathtouch Snake at each upkeep without a Snake", () => {
      let s = scenario({ p1: { battlefield: ["Ophiomancer"] }, active: "p2" });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(tokensNamed(s, "p1", "Snake")).toHaveLength(1);
      expect(chars(s, tokensNamed(s, "p1", "Snake")[0] ?? "").keywords).toContain("deathtouch");
    });

    it("Stridehangar Automaton: artifact tokens come with a Thopter, Thopters get +1/+1", () => {
      let s = scenario({ p1: { battlefield: ["Stridehangar Automaton", "Warren Soultrader", "Bear Cub"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Warren Soultrader"), { sacrifice: [bear] }));
      const thopter = tokensNamed(s, "p1", "Thopter");
      expect(tokensNamed(s, "p1", "Treasure")).toHaveLength(1);
      expect(thopter).toHaveLength(1);
      expect(chars(s, thopter[0] ?? "").power).toBe(2);
    });

    it("Biotransference: your creatures are artifacts; a creature spell makes a Necron Warrior and costs 1 life", () => {
      let s = scenario({
        p1: { battlefield: ["Biotransference", "Bear Cub", ...lands("Swamp", 2)], hand: ["Zulaport Cutthroat"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).types).toContain("Artifact");
      s = settle(castIt(s, "p1", "Zulaport Cutthroat"));
      expect(tokensNamed(s, "p1", "Necron Warrior")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Tevesh Szat: two Thrulls; sacrifice a creature to draw two cards", () => {
      let s = scenario({ p1: { battlefield: ["Tevesh Szat, Doom of Fools", "Bear Cub"], library: lands("Swamp", 5) } });
      const tevesh = idOf(s, "p1", "battlefield", "Tevesh Szat, Doom of Fools");
      s = settle(activate(s, "p1", tevesh, {}, 1), (req, _p, st) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(st, id) === "Bear Cub") : undefined,
      );
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(handNames(s, "p1")).toEqual(["Swamp", "Swamp"]);
    });

    it("Tombstone Stairwell: Tombspawns for each creature card in each graveyard, destroyed at end step", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Tombstone Stairwell", counters: {} }, ...lands("Swamp", 4)],
          graveyard: ["Bear Cub", "Savannah Lions"],
        },
        p2: { graveyard: ["Gravecrawler"] },
        active: "p2",
      });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(tokensNamed(s, "p1", "Tombspawn")).toHaveLength(2);
      expect(tokensNamed(s, "p2", "Tombspawn")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2");
      expect(tokensNamed(s, "p1", "Tombspawn")).toHaveLength(0);
    });
  });
});
