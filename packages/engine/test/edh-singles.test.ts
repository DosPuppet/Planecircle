/**
 * Commander (EDH pseudo-set): rules tests for single cards of the precons never named elsewhere (PLAN-L L11), A to K.
 */
import { describe, expect, it } from "vitest";
import { bump, chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { plainText } from "../src/text";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  castable,
  castNowOf,
  exiled,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  picking,
  scenario,
  settle,
  throughCombat,
} from "./helpers";

type S = GameState;
const handNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const graveyardNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.graveyard).sort();
const onField = (s: S, p: PlayerId, name: string) => idsOf(s, p, "battlefield", name).length;
const tokens = (s: S, p: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const plusOne = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const life = (s: S, p: PlayerId) => s.players[p]?.life;
const castIt = (s: S, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const castOption = (s: S, p: PlayerId, card: string) =>
  legalActions(s, p).filter((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activations = (s: S, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Activates the ability whose label starts this way (the first one offered without a label). */
const activate = (s: S, p: PlayerId, source: ObjectId, prefix = "", extra: object = {}) => {
  const o = activations(s, p, source).find((a) => plainText(a.label ?? "").startsWith(prefix));
  if (!o) throw new Error(`no ability "${prefix}" for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
/** The permanent becomes its owner's commander (as if cast from the command zone). */
function makeCommander(s: S, id: ObjectId): S {
  const o = s.objects[id];
  if (!o) throw new Error("no such object");
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  bump(s);
  return s;
}
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
/** p1 ends its main phase and goes to its end step (triggers of the end step on the stack). */
const toEndStep = (s: S) => advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "priority", 100);

describe("Commander (EDH): single cards, A to K (PLAN-L L11)", () => {
  describe("mythics", () => {
    it("Akroma, Angel of Fury: can't be countered; flying, trample; {R}: +1/+0", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 9), hand: ["Akroma, Angel of Fury"] },
        p2: {
          battlefield: lands("Island", 2),
          hand: ["Counterspell"],
        },
      });
      s = castIt(s, "p1", "Akroma, Angel of Fury");
      s = act(s, "p1", { type: "pass" });
      const spell = s.stack[0]?.id as string;
      s = settle(castIt(s, "p2", "Counterspell", { targets: { t: [spell] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Counterspell"]);
      const akroma = idOf(s, "p1", "battlefield", "Akroma, Angel of Fury");
      expect(chars(s, akroma).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
      s = settle(activate(s, "p1", akroma, "+1/+0"));
      expect(chars(s, akroma).power).toBe(7);
    });

    it("Akroma, Angel of Fury: morph, cast face down for {3}, turned face up for {3}{R}{R}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 9), hand: ["Akroma, Angel of Fury"] } });
      const card = idOf(s, "p1", "hand", "Akroma, Angel of Fury");
      expect(castOption(s, "p1", card).some((o) => o.faceDown)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card, faceDown: true }));
      const id = s.battlefield.find((x) => s.objects[x]?.controller === "p1" && chars(s, x).name === "") as string;
      expect(chars(s, id)).toMatchObject({ power: 2, toughness: 2 });
      expect(s.battlefield.filter((x) => s.objects[x]?.tapped)).toHaveLength(3);
      s = settle(activate(s, "p1", id, "Turn face up"));
      expect(chars(s, id)).toMatchObject({ name: "Akroma, Angel of Fury", power: 6, toughness: 6 });
      expect(s.battlefield.filter((x) => s.objects[x]?.tapped)).toHaveLength(9);
    });

    it("April O'Neil and Donatello: a Turtle enters, investigate; tokens created under your control, plus a Mutagen", () => {
      let s = scenario({
        p1: { battlefield: ["April O'Neil, Live on the Scene", ...lands("Island", 6)], hand: ["Donatello, the Brains"] },
      });
      s = settle(castIt(s, "p1", "Donatello, the Brains"));
      // Donatello (Mutant Ninja Turtle) enters: April investigates, and Donatello adds a Mutagen to the Clue.
      expect(tokens(s, "p1", "Clue")).toHaveLength(1);
      expect(tokens(s, "p1", "Mutagen")).toHaveLength(1);
      // The Mutagen: {1}, {T}, sacrifice it: a +1/+1 counter on target creature (as a sorcery).
      const donatello = idOf(s, "p1", "battlefield", "Donatello, the Brains");
      const mutagen = tokens(s, "p1", "Mutagen")[0] as string;
      s = settle(activate(s, "p1", mutagen, "", { targets: { t: [donatello] } }));
      expect(plusOne(s, donatello)).toBe(1);
      expect(tokens(s, "p1", "Mutagen")).toHaveLength(0);
      // A non-Turtle creature entering doesn't investigate.
      let t = scenario({
        p1: { battlefield: ["April O'Neil, Live on the Scene", ...lands("Forest", 2)], hand: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "Bear Cub"));
      expect(tokens(t, "p1", "Clue")).toHaveLength(0);
    });

    it("Donatello, the Brains: only tokens created under your control get a Mutagen", () => {
      let s = scenario({
        p1: { battlefield: ["Donatello, the Brains"] },
        p2: { battlefield: ["Biogenic Ooze", ...lands("Forest", 4)] },
        active: "p2",
      });
      s = settle(activate(s, "p2", idOf(s, "p2", "battlefield", "Biogenic Ooze")));
      expect(tokens(s, "p2", "Ooze")).toHaveLength(1);
      expect(tokens(s, "p1", "Mutagen")).toHaveLength(0);
      expect(tokens(s, "p2", "Mutagen")).toHaveLength(0);
    });

    it("Archon of Cruelty: enters or attacks: the opponent sacrifices, discards, loses 3; you draw and gain 3", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 8), hand: ["Archon of Cruelty"], library: lands("Swamp", 5) },
        p2: { battlefield: ["Bear Cub"], hand: ["Shock", "Island"] },
      });
      s = settle(castIt(s, "p1", "Archon of Cruelty"), picking(["p2"]));
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([23, 17]);
      expect(handNames(s, "p1")).toEqual(["Swamp"]);
      const archon = idOf(s, "p1", "battlefield", "Archon of Cruelty");
      expect(chars(s, archon).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const cards = s.players.p2?.hand.length ?? 0;
      s = throughCombat(attack(s, [archon]), picking(["p2"]));
      expect(s.players.p2?.hand).toHaveLength(cards - 1);
      expect(life(s, "p1")).toBe(26);
      // 3 life lost, then 6 combat damage.
      expect(life(s, "p2")).toBe(8);
    });

    it("Atla Palani: {2}, {T}: a 0/1 Egg with defender; an Egg dies: reveal until a creature card, onto the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: ["Atla Palani, Nest Tender", ...lands("Plains", 2)],
          library: ["Island", "Island", "Serra Angel", "Island"],
        },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Atla Palani, Nest Tender")));
      const egg = tokens(s, "p1", "Egg")[0] as string;
      expect(chars(s, egg)).toMatchObject({ power: 0, toughness: 1 });
      expect(chars(s, egg).keywords).toContain("defender");
      expect(chars(s, egg).subtypes).toContain("Egg");
      s = settle(castIt(act(s, "p1", { type: "pass" }), "p2", "Shock", { targets: { t: [egg] } }));
      expect(onField(s, "p1", "Serra Angel")).toBe(1);
      // The two Islands revealed before it go to the bottom.
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island", "Island", "Island"]);
    });

    it("Biogenic Ooze: enters with an Ooze; at your end step, a counter on each Ooze; {1}{G}{G}{G}: an Ooze", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 9), hand: ["Biogenic Ooze"] } });
      s = settle(castIt(s, "p1", "Biogenic Ooze"));
      const ooze = idOf(s, "p1", "battlefield", "Biogenic Ooze");
      expect(tokens(s, "p1", "Ooze")).toHaveLength(1);
      s = settle(activate(s, "p1", ooze));
      const all = tokens(s, "p1", "Ooze");
      expect(all).toHaveLength(2);
      expect(chars(s, all[0] as string)).toMatchObject({ power: 2, toughness: 2 });
      s = settle(toEndStep(s));
      expect([ooze, ...all].map((id) => plusOne(s, id))).toEqual([1, 1, 1]);
    });

    it("Blightsteel Colossus: infect, trample, indestructible; shuffled into the library instead of the graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Blightsteel Colossus"] }, p2: { battlefield: ["Bear Cub"] } });
      const colossus = idOf(s, "p1", "battlefield", "Blightsteel Colossus");
      expect(chars(s, colossus).keywords).toEqual(expect.arrayContaining(["trample", "infect", "indestructible"]));
      s = advanceUntil(attack(s, [colossus]), (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: colossus }],
      });
      s = throughCombat(s);
      // Infect: -1/-1 counters on the blocker, poison counters for the player (trample: 9 assigned to the player).
      expect(onField(s, "p2", "Bear Cub")).toBe(0);
      expect(s.players.p2?.counters?.poison).toBe(9);
      expect(life(s, "p2")).toBe(20);
    });

    it("Blightsteel Colossus and Greater Good: sacrificed, it is shuffled into the library; draw 11, discard three", () => {
      let s = scenario({
        p1: { battlefield: ["Greater Good", "Blightsteel Colossus"], library: lands("Swamp", 15) },
      });
      const colossus = idOf(s, "p1", "battlefield", "Blightsteel Colossus");
      s = activate(s, "p1", idOf(s, "p1", "battlefield", "Greater Good"), "", { sacrifice: [colossus] });
      // Sacrificed as a cost: into the library (16 cards), not the graveyard.
      expect(onField(s, "p1", "Blightsteel Colossus")).toBe(0);
      expect(graveyardNames(s, "p1")).toEqual([]);
      expect(namesIn(s, s.players.p1?.library)).toContain("Blightsteel Colossus");
      expect(s.players.p1?.library).toHaveLength(16);
      // Draw 11 (its power), then discard three (Swamps).
      s = settle(s, (req, _p, cur) =>
        req.type === "pick" && req.intent === "discard"
          ? req.options.filter((id) => nameOf(cur, id) === "Swamp").slice(0, 3)
          : undefined,
      );
      expect(s.players.p1?.hand).toHaveLength(8);
      expect(graveyardNames(s, "p1")).toEqual(["Swamp", "Swamp", "Swamp"]);
      expect(s.players.p1?.library).toHaveLength(5);
    });

    it("Elspeth, Sun's Champion: +1 three 1/1 Soldiers; −3 destroy creatures with power 4 or greater; −7 an emblem", () => {
      let s = scenario({
        p1: { battlefield: ["Elspeth, Sun's Champion", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
      });
      const elspeth = idOf(s, "p1", "battlefield", "Elspeth, Sun's Champion");
      s = settle(activate(s, "p1", elspeth, "+1"));
      expect(tokens(s, "p1", "Soldier")).toHaveLength(3);
      expect(s.objects[elspeth]?.counters.loyalty).toBe(5);
      let t = scenario({
        p1: { battlefield: ["Elspeth, Sun's Champion", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
      });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Elspeth, Sun's Champion"), "−3"));
      expect([onField(t, "p2", "Serra Angel"), onField(t, "p2", "Savannah Lions"), onField(t, "p1", "Bear Cub")]).toEqual([
        0, 1, 1,
      ]);
      let u = scenario({
        p1: { battlefield: [{ name: "Elspeth, Sun's Champion", counters: { loyalty: 7 } }, "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      u = settle(activate(u, "p1", idOf(u, "p1", "battlefield", "Elspeth, Sun's Champion"), "−7"));
      const bear = idOf(u, "p1", "battlefield", "Bear Cub");
      expect(chars(u, bear)).toMatchObject({ power: 4, toughness: 4 });
      expect(chars(u, bear).keywords).toContain("flying");
      expect(chars(u, idOf(u, "p2", "battlefield", "Savannah Lions")).power).toBe(2);
    });

    it("Imperial Recruiter: enters, search for a creature card with power 2 or less, into your hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Imperial Recruiter"], library: ["Serra Angel", "Shock", "Bear Cub"] },
      });
      let offered: string[] = [];
      s = settle(castIt(s, "p1", "Imperial Recruiter"), (req, _p, cur) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = namesIn(cur, req.options) as string[];
        return req.options.slice(0, 1);
      });
      expect(offered).toEqual(["Bear Cub"]);
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
    });

    it("Kethis: legendary spells cost {1} less; exile two legendary cards: legendary cards playable from the graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: ["Kethis, the Hidden Hand", "Island"],
          hand: ["Donatello, the Brains"],
          graveyard: ["Elspeth, Sun's Champion", "Akroma, Angel of Fury", "Archon of Cruelty", "April O'Neil, Live on the Scene"],
        },
      });
      // Donatello ({2}{U}) is still out of reach with one land; April O'Neil ({1}{U}) is in the graveyard.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Donatello, the Brains"))).toBe(false);
      const april = idOf(s, "p1", "graveyard", "April O'Neil, Live on the Scene");
      expect(castable(s, "p1", april)).toBe(false);
      const kethis = idOf(s, "p1", "battlefield", "Kethis, the Hidden Hand");
      const pair = [idOf(s, "p1", "graveyard", "Elspeth, Sun's Champion"), idOf(s, "p1", "graveyard", "Akroma, Angel of Fury")];
      s = settle(activate(s, "p1", kethis, "", { picks: { graveyardExile: pair } }));
      expect(exiled(s, "Elspeth, Sun's Champion")).toHaveLength(1);
      expect(exiled(s, "Akroma, Angel of Fury")).toHaveLength(1);
      // Archon of Cruelty is not legendary: not playable.
      expect(castable(s, "p1", idOf(s, "p1", "graveyard", "Archon of Cruelty"))).toBe(false);
      // {1}{U} minus {1}: one Island is enough.
      expect(castable(s, "p1", april)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: april }));
      expect(onField(s, "p1", "April O'Neil, Live on the Scene")).toBe(1);
      // Until end of turn only.
      let t = scenario({
        p1: {
          battlefield: ["Kethis, the Hidden Hand", "Island"],
          graveyard: ["Elspeth, Sun's Champion", "Akroma, Angel of Fury", "April O'Neil, Live on the Scene"],
        },
      });
      const april2 = idOf(t, "p1", "graveyard", "April O'Neil, Live on the Scene");
      t = settle(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Kethis, the Hidden Hand"), "", {
          picks: {
            graveyardExile: [
              idOf(t, "p1", "graveyard", "Elspeth, Sun's Champion"),
              idOf(t, "p1", "graveyard", "Akroma, Angel of Fury"),
            ],
          },
        }),
      );
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(castable(t, "p1", april2)).toBe(false);
    });
  });

  describe("rares (1)", () => {
    it("Agent Frank Horrigan: enters or attacks, proliferate twice; indestructible once it attacked this turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Forest", { name: "Bear Cub", counters: { "+1/+1": 1 } }],
          hand: ["Agent Frank Horrigan"],
        },
        p2: { battlefield: [{ name: "Savannah Lions", counters: { "+1/+1": 1 } }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const prolif = (req: ChoiceRequest) => (req.type === "pick" && req.intent === "proliferate" ? [bear] : undefined);
      s = settle(castIt(s, "p1", "Agent Frank Horrigan"), prolif);
      expect(plusOne(s, bear)).toBe(3);
      // The opponent's creature was not chosen.
      expect(plusOne(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toBe(1);
      const agent = idOf(s, "p1", "battlefield", "Agent Frank Horrigan");
      expect(chars(s, agent).keywords).toContain("trample");
      expect(chars(s, agent).keywords).not.toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = throughCombat(attack(s, [agent]), prolif);
      expect(plusOne(s, bear)).toBe(5);
      expect(chars(s, agent).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, agent).keywords).not.toContain("indestructible");
    });

    it("Arcade Cabinet: enters, a counter on up to four creatures; {2}, {T}, sacrifice a token: double each kind of counter", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 5), "Bear Cub", "Savannah Lions"], hand: ["Arcade Cabinet"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(castIt(s, "p1", "Arcade Cabinet"), picking([bear, lions, angel]));
      expect([plusOne(s, bear), plusOne(s, lions), plusOne(s, angel)]).toEqual([1, 1, 1]);
      const cabinet = idOf(s, "p1", "battlefield", "Arcade Cabinet");
      // No token to sacrifice: not activatable.
      expect(activations(s, "p1", cabinet)).toHaveLength(0);
      let t = scenario({
        p1: {
          battlefield: [
            ...lands("Plains", 2),
            "Arcade Cabinet",
            "Elspeth, Sun's Champion",
            { name: "Bear Cub", counters: { "+1/+1": 2, stun: 1 } },
          ],
        },
      });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Elspeth, Sun's Champion"), "+1"));
      const soldier = tokens(t, "p1", "Soldier")[0] as string;
      const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Arcade Cabinet"), "", { sacrifice: [soldier], targets: { t: [bear2] } }),
      );
      expect(tokens(t, "p1", "Soldier")).toHaveLength(2);
      expect(t.objects[bear2]?.counters).toMatchObject({ "+1/+1": 4, stun: 2 });
    });

    it("Auron: attacks, a +1/+1 counter, then exile a creature with less power until Auron leaves", () => {
      let s = scenario({
        p1: { battlefield: ["Auron, Venerated Guardian"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Plains"], hand: ["Swords to Plowshares"] },
      });
      const auron = idOf(s, "p1", "battlefield", "Auron, Venerated Guardian");
      expect(chars(s, auron).keywords).toContain("vigilance");
      s = settle(attack(s, [auron]));
      expect(plusOne(s, auron)).toBe(1);
      // Power 3 after the counter: Bear Cub (2) is the only legal target, not Serra Angel (4).
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(onField(s, "p2", "Serra Angel")).toBe(1);
      expect(s.objects[auron]?.tapped).toBe(false);
      s = throughCombat(s);
      // Auron leaves: the Bear Cub returns.
      s = settle(castIt(act(s, "p1", { type: "pass" }), "p2", "Swords to Plowshares", { targets: { t: [auron] } }));
      expect(exiled(s, "Auron, Venerated Guardian")).toHaveLength(1);
      expect(onField(s, "p2", "Bear Cub")).toBe(1);
    });

    it("Bebop: deathtouch; combat damage to a player: may draw X and lose X life, X its counters", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Bebop, Skull & Crossbones", counters: { "+1/+1": 2 } }], library: lands("Swamp", 5) },
      });
      const bebop = idOf(s, "p1", "battlefield", "Bebop, Skull & Crossbones");
      expect(chars(s, bebop).keywords).toContain("deathtouch");
      s = throughCombat(attack(s, [bebop]), yes);
      expect(life(s, "p2")).toBe(16);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(life(s, "p1")).toBe(18);
    });

    it("Biomass Mutation: your creatures have base power and toughness X/X until end of turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 5), { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Savannah Lions"],
          hand: ["Biomass Mutation"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Biomass Mutation", { x: 3 }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear)).toMatchObject({ power: 4, toughness: 4 });
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toMatchObject({ power: 3, toughness: 3 });
      expect(chars(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toMatchObject({ power: 4, toughness: 4 });
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, bear)).toMatchObject({ power: 3, toughness: 3 });
    });

    it("Birds of Paradise: flying; {T}: one mana of any color", () => {
      let s = scenario({
        p1: { battlefield: ["Birds of Paradise"], hand: ["Swords to Plowshares"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const birds = idOf(s, "p1", "battlefield", "Birds of Paradise");
      expect(chars(s, birds).keywords).toContain("flying");
      s = settle(castIt(s, "p1", "Swords to Plowshares", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.objects[birds]?.tapped).toBe(true);
    });

    it("Blasphemous Act: {1} less for each creature on the battlefield; 13 damage to each creature", () => {
      const board = ["Bear Cub", "Savannah Lions", "Blightsteel Colossus", "Birds of Paradise"];
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 5), ...board], hand: ["Blasphemous Act"] },
        p2: { battlefield: ["Serra Angel", "Archon of Cruelty", "Biogenic Ooze", "Bear Cub"] },
      });
      // Eight creatures: {8}{R} - {8} = {R}.
      s = settle(castIt(s, "p1", "Blasphemous Act"));
      expect(s.battlefield.filter((id) => s.objects[id]?.tapped)).toHaveLength(1);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature")).map((id) => nameOf(s, id))).toEqual([
        "Blightsteel Colossus",
      ]);
      const t = scenario({
        p1: { battlefield: lands("Mountain", 5), hand: ["Blasphemous Act"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Blasphemous Act"))).toBe(false);
    });

    it("Blitzball Stadium: support X; {3}, {T}: unblockable, draws a card per kind of counter on damage to a player", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 9), { name: "Bear Cub", counters: { shield: 1 } }, "Savannah Lions"],
          hand: ["Blitzball Stadium"],
          library: lands("Island", 5),
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Blitzball Stadium", { x: 2 }), picking([bear, lions]));
      expect([plusOne(s, bear), plusOne(s, lions)]).toEqual([1, 1]);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Blitzball Stadium"), "", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toContain("unblockable");
      s = throughCombat(attack(s, [bear]));
      expect(life(s, "p2")).toBe(17);
      // Two kinds of counters (+1/+1 and shield): two cards.
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Branching Evolution: +1/+1 counters put on your creatures are doubled", () => {
      let s = scenario({
        p1: { battlefield: ["Branching Evolution", ...lands("Plains", 3), "Bear Cub"], hand: ["Arcade Cabinet"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Arcade Cabinet"), picking([bear, lions]));
      expect([plusOne(s, bear), plusOne(s, lions)]).toEqual([2, 1]);
    });

    it("Casualties of War: one or more modes, each destroys a target of its type", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), ...lands("Bayou", 2)], hand: ["Casualties of War"] },
        p2: { battlefield: ["Arcade Cabinet", "Bear Cub", "Branching Evolution", "Forest", "Elspeth, Sun's Champion", "Plains"] },
      });
      const card = idOf(s, "p1", "hand", "Casualties of War");
      const modes = castOption(s, "p1", card)[0]?.modes ?? [];
      // Every non-empty set of the five modes, at no extra cost.
      expect(modes).toHaveLength(31);
      const all = modes.find((m) => m.targets.length === 5);
      const id = (name: string) => idOf(s, "p2", "battlefield", name);
      s = settle(
        castIt(s, "p1", "Casualties of War", {
          mode: all?.index,
          targets: {
            a: [id("Arcade Cabinet")],
            c: [id("Bear Cub")],
            e: [id("Branching Evolution")],
            l: [id("Forest")],
            w: [id("Elspeth, Sun's Champion")],
          },
        }),
      );
      expect(
        namesIn(
          s,
          s.battlefield.filter((x) => s.objects[x]?.controller === "p2"),
        ),
      ).toEqual(["Plains"]);
    });
  });

  describe("rares (2)", () => {
    it("Chasm Skulker: you draw, a +1/+1 counter; dies: as many 1/1 Squids with islandwalk as counters", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Chasm Skulker"], library: lands("Island", 5) },
        p2: { battlefield: lands("Mountain", 3), hand: ["Lightning Bolt"] },
      });
      const skulker = idOf(s, "p1", "battlefield", "Chasm Skulker");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(plusOne(s, skulker)).toBe(1);
      s = settle(castIt(act(s, "p1", { type: "pass" }), "p2", "Lightning Bolt", { targets: { t: [skulker] } }));
      expect(graveyardNames(s, "p1")).toEqual(["Chasm Skulker"]);
      const squids = tokens(s, "p1", "Squid");
      expect(squids).toHaveLength(1);
      expect(chars(s, squids[0] as string)).toMatchObject({ power: 1, toughness: 1, colors: ["U"] });
      expect(chars(s, squids[0] as string).blockRules.some((r) => r.unblockableIfDefenderControls)).toBe(true);
    });

    it("Chocobo Knights: whenever you attack, your creatures with counters gain double strike", () => {
      let s = scenario({
        p1: { battlefield: ["Chocobo Knights", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = settle(attack(s, [bear, lions]));
      expect(chars(s, bear).keywords).toContain("doubleStrike");
      expect(chars(s, lions).keywords).not.toContain("doubleStrike");
      s = throughCombat(s);
      expect(life(s, "p2")).toBe(12);
    });

    it("Cleansing Nova: destroy all creatures, or all artifacts and enchantments", () => {
      const board = { battlefield: ["Bear Cub", "Arcade Cabinet", "Branching Evolution", "Elspeth, Sun's Champion"] };
      const modeOf = (s: S, label: string) =>
        castOption(s, "p1", idOf(s, "p1", "hand", "Cleansing Nova"))[0]?.modes.find((m) => plainText(m.label ?? "") === label)
          ?.index;
      let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Cleansing Nova"] }, p2: board });
      s = settle(castIt(s, "p1", "Cleansing Nova", { mode: modeOf(s, "Destroy all creatures") }));
      expect(
        namesIn(
          s,
          s.battlefield.filter((x) => s.objects[x]?.controller === "p2"),
        ).sort(),
      ).toEqual(["Arcade Cabinet", "Branching Evolution", "Elspeth, Sun's Champion"]);
      let t = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Cleansing Nova"] }, p2: board });
      t = settle(castIt(t, "p1", "Cleansing Nova", { mode: modeOf(t, "Destroy all artifacts and enchantments") }));
      expect(
        namesIn(
          t,
          t.battlefield.filter((x) => t.objects[x]?.controller === "p2"),
        ).sort(),
      ).toEqual(["Bear Cub", "Elspeth, Sun's Champion"]);
    });

    it("Clever Concealment: convoke; your target nonland permanents phase out until your next turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Bear Cub", "Savannah Lions", "Arcade Cabinet"],
          hand: ["Clever Concealment"],
        },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      const cabinet = idOf(s, "p1", "battlefield", "Arcade Cabinet");
      const card = idOf(s, "p1", "hand", "Clever Concealment");
      // Two Plains and two creatures tapped (convoke) pay {2}{W}{W}.
      expect(castable(s, "p1", card)).toBe(true);
      const legal = castOption(s, "p1", card)[0]?.modes[0]?.targets[0]?.legal ?? [];
      expect(legal).not.toContain(idOf(s, "p2", "battlefield", "Serra Angel"));
      expect(legal).not.toContain(idOf(s, "p1", "battlefield", "Plains"));
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [bear, cabinet] }, picks: { convoke: [bear, lions] } }));
      expect([s.objects[bear]?.zone, s.objects[cabinet]?.zone, s.objects[lions]?.zone]).toEqual([
        "phasedOut",
        "phasedOut",
        "battlefield",
      ]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[bear]?.zone).toBe("phasedOut");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect([s.objects[bear]?.zone, s.objects[cabinet]?.zone]).toEqual(["battlefield", "battlefield"]);
    });

    it("Continue?: up to four creature cards put into your graveyard from the battlefield this turn return", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 2), "Mountain", "Bear Cub"],
          hand: ["Continue?", "Shock"],
          graveyard: ["Savannah Lions"],
        },
      });
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      const card = idOf(s, "p1", "hand", "Continue?");
      const legal = castOption(s, "p1", card)[0]?.modes[0]?.targets[0]?.legal ?? [];
      expect(namesIn(s, legal)).toEqual(["Bear Cub"]);
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: legal } }));
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      expect(graveyardNames(s, "p1")).toEqual(["Continue?", "Savannah Lions", "Shock"]);
    });

    it("Cosmic Crucible: four mana at your first main phase; copy your first noncreature spell each turn", () => {
      let s = scenario({
        step: "upkeep",
        p1: { battlefield: ["Cosmic Crucible"], hand: ["Shock", "Lightning Bolt"] },
      });
      s = advanceUntil(s, (x) => x.turn.step === "main1" && x.stack.length > 0);
      s = settle(s, (req) =>
        req.type === "divide" && req.intent === "manaColor" ? req.among.map((c) => (c === "R" ? 4 : 0)) : undefined,
      );
      expect(s.players.p1?.manaPool.R).toBe(4);
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }), yes);
      expect(life(s, "p2")).toBe(16);
      // Only once each turn.
      let asked = false;
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }), (req) => {
        if (req.type === "yesNo") asked = true;
        return yes(req);
      });
      expect(asked).toBe(false);
      expect(life(s, "p2")).toBe(13);
    });

    it("Currency Converter: discarded cards may be exiled; {2}, {T}: loot; {T}: an exiled card returns, a Treasure or a 2/2 Rogue", () => {
      let s = scenario({
        p1: { battlefield: ["Currency Converter", ...lands("Mountain", 2)], hand: ["Island"], library: lands("Swamp", 5) },
      });
      const converter = idOf(s, "p1", "battlefield", "Currency Converter");
      const island = idOf(s, "p1", "hand", "Island");
      s = settle(activate(s, "p1", converter, "Draw"), (req) =>
        req.type === "pick" && req.intent === "discard" ? [island] : yes(req),
      );
      expect(handNames(s, "p1")).toEqual(["Swamp"]);
      expect(exiled(s, "Island")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(activate(s, "p1", converter, "An exiled card"));
      expect(graveyardNames(s, "p1")).toEqual(["Island"]);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      // A nonland card: a 2/2 black Rogue.
      let t = scenario({
        p1: { battlefield: ["Currency Converter", ...lands("Mountain", 2)], hand: ["Shock"], library: lands("Swamp", 5) },
      });
      const c2 = idOf(t, "p1", "battlefield", "Currency Converter");
      t = settle(activate(t, "p1", c2, "Draw"), (req, _p, cur) =>
        req.type === "pick" && req.intent === "discard" ? req.options.filter((id) => nameOf(cur, id) === "Shock") : yes(req),
      );
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      t = settle(activate(t, "p1", c2, "An exiled card"));
      const rogue = tokens(t, "p1", "Rogue")[0] as string;
      expect(chars(t, rogue)).toMatchObject({ power: 2, toughness: 2, colors: ["B"] });
    });

    it("Deflecting Swat: free if you control a commander; you choose new targets for a spell", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Bear Cub"], hand: ["Deflecting Swat"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = castIt(s, "p2", "Shock", { targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const card = idOf(s, "p1", "hand", "Deflecting Swat");
      // No mana, no commander: not castable.
      expect(castable(s, "p1", card)).toBe(false);
      s = makeCommander(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(castable(s, "p1", card)).toBe(true);
      const shock = s.stack[0]?.id as string;
      s = settle(act(s, "p1", { type: "cast", card, alternative: true, targets: { t: [shock] } }), (req) =>
        req.type === "pick" && req.intent === "changeTarget" && req.options.includes("p2") ? ["p2"] : undefined,
      );
      expect([life(s, "p1"), life(s, "p2")]).toEqual([20, 18]);
    });

    it("Delighted Halfling: {C}, or any color only for a legendary spell, which can't be countered", () => {
      const t = scenario({ p1: { battlefield: ["Delighted Halfling", "Plains"], hand: ["Bear Cub"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
      let s = scenario({
        p1: { battlefield: ["Delighted Halfling", "Plains", "Swamp"], hand: ["Kethis, the Hidden Hand"] },
        p2: { battlefield: lands("Island", 2), hand: ["Counterspell"] },
      });
      s = castIt(s, "p1", "Kethis, the Hidden Hand");
      expect(s.objects[idOf(s, "p1", "battlefield", "Delighted Halfling")]?.tapped).toBe(true);
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Counterspell", { targets: { t: [s.stack[0]?.id as string] } }));
      expect(onField(s, "p1", "Kethis, the Hidden Hand")).toBe(1);
    });

    it("Dreadhorde Invasion: at your upkeep, lose 1 life and amass Zombies 1; a Zombie token with power 6+ attacks: lifelink", () => {
      let s = scenario({ active: "p2", p1: { battlefield: ["Dreadhorde Invasion"] } });
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      const army = tokens(s, "p1", "Zombie Army")[0] as string;
      expect(life(s, "p1")).toBe(19);
      expect(plusOne(s, army)).toBe(1);
      expect(chars(s, army).subtypes).toEqual(expect.arrayContaining(["Zombie", "Army"]));
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 4);
      expect(plusOne(s, army)).toBe(2);
      expect(life(s, "p1")).toBe(18);
      (s.objects[army] as { counters: Record<string, number> }).counters["+1/+1"] = 6;
      bump(s);
      s = throughCombat(attack(s, [army]));
      expect(life(s, "p2")).toBe(14);
      expect(life(s, "p1")).toBe(24);
    });

    it("Dusk Legion Duelist: vigilance; +1/+1 counters put on it: draw a card, only once each turn", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Plains", 6), "Dusk Legion Duelist"],
          hand: ["Arcade Cabinet", "Arcade Cabinet"],
          library: lands("Plains", 5),
        },
      });
      const duelist = idOf(s, "p1", "battlefield", "Dusk Legion Duelist");
      expect(chars(s, duelist).keywords).toContain("vigilance");
      s = settle(castIt(s, "p1", "Arcade Cabinet"), picking([duelist]));
      expect(handNames(s, "p1")).toEqual(["Arcade Cabinet", "Plains"]);
      s = settle(castIt(s, "p1", "Arcade Cabinet"), picking([duelist]));
      expect(plusOne(s, duelist)).toBe(2);
      expect(handNames(s, "p1")).toEqual(["Plains"]);
    });

    it("Electric Seaweed: defender, haste; until end of turn, each other creature that dies deals 1 to each non-Wall creature", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Electric Seaweed"] },
        p2: { battlefield: ["Birds of Paradise", "Savannah Lions", "Serra Angel"] },
      });
      s = settle(castIt(s, "p1", "Electric Seaweed"));
      const seaweed = idOf(s, "p1", "battlefield", "Electric Seaweed");
      expect(chars(s, seaweed).keywords).toEqual(expect.arrayContaining(["defender", "haste"]));
      // Haste: {T} right away, 1 damage to the Birds; the chain kills the Lions, then the Bear Cub.
      s = settle(activate(s, "p1", seaweed, "", { targets: { t: [idOf(s, "p2", "battlefield", "Birds of Paradise")] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Birds of Paradise", "Savannah Lions"]);
      expect(graveyardNames(s, "p1")).toEqual(["Bear Cub"]);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(s.objects[angel]?.damage).toBe(3);
      expect(s.objects[seaweed]?.damage).toBe(0);
    });
  });

  describe("rares (3)", () => {
    it("Fantastic Elasticity: bounce a nonland permanent, or get back an instant or sorcery; rebound", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Fantastic Elasticity"], graveyard: ["Shock"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Fantastic Elasticity");
      const modes = castOption(s, "p1", card)[0]?.modes ?? [];
      const bounce = modes.find((m) => plainText(m.label ?? "").startsWith("Return"))?.index;
      const regrow = modes.find((m) => plainText(m.label ?? "").startsWith("Get back"))?.index;
      s = settle(
        act(s, "p1", { type: "cast", card, mode: bounce, targets: { n: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
      );
      expect(handNames(s, "p2")).toEqual(["Serra Angel"]);
      expect(exiled(s, "Fantastic Elasticity")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && !!castNowOf(x));
      const again = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, again)).toBe("Fantastic Elasticity");
      s = settle(
        act(s, "p1", { type: "cast", card: again, mode: regrow, targets: { g: [idOf(s, "p1", "graveyard", "Shock")] } }),
      );
      expect(handNames(s, "p1")).toContain("Shock");
      expect(graveyardNames(s, "p1")).toEqual(["Fantastic Elasticity"]);
    });

    it("Feral Ghoul: menace; another creature of yours dies, a +1/+1 counter; dies: rad counters equal to its power", () => {
      let s = scenario({
        p1: { battlefield: ["Feral Ghoul", "Bear Cub", ...lands("Mountain", 2)], hand: ["Shock", "Lightning Bolt"] },
      });
      const ghoul = idOf(s, "p1", "battlefield", "Feral Ghoul");
      expect(chars(s, ghoul).keywords).toContain("menace");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(plusOne(s, ghoul)).toBe(1);
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: [ghoul] } }));
      expect(graveyardNames(s, "p1")).toContain("Feral Ghoul");
      expect(s.players.p2?.counters?.rad).toBe(3);
      expect(s.players.p1?.counters?.rad ?? 0).toBe(0);
    });

    it("Fight Rigging: hideaway 5; at combat, a counter on your creature, then with power 7+ the hidden card is free", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Bear Cub"],
          hand: ["Fight Rigging"],
          library: ["Island", "Serra Angel", "Island", "Island", "Island", "Swamp"],
        },
      });
      s = settle(castIt(s, "p1", "Fight Rigging"), (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Serra Angel") : undefined,
      );
      const angel = exiled(s, "Serra Angel")[0] as string;
      expect(angel).toBeDefined();
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Swamp");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority", 50);
      s = settle(s, picking([bear]));
      expect(plusOne(s, bear)).toBe(1);
      // Bear Cub (3/3): no creature with power 7 or greater, the card stays hidden.
      expect(castable(s, "p1", angel)).toBe(false);
      let t = scenario({
        p1: {
          battlefield: [...lands("Forest", 3), "Blightsteel Colossus"],
          hand: ["Fight Rigging"],
          library: ["Island", "Serra Angel", "Island", "Island", "Island", "Swamp"],
        },
      });
      t = settle(castIt(t, "p1", "Fight Rigging"), (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Serra Angel") : undefined,
      );
      const angel2 = exiled(t, "Serra Angel")[0] as string;
      t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority", 50);
      t = settle(t, picking([idOf(t, "p1", "battlefield", "Blightsteel Colossus")]));
      expect(castable(t, "p1", angel2)).toBe(true);
      t = settle(act(t, "p1", { type: "cast", card: angel2 }));
      expect(onField(t, "p1", "Serra Angel")).toBe(1);
    });

    it("First Family: X the colors among your permanents and the spells you've cast this turn, itself included (PLAN-M M9a)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2), "Mountain", "Bear Cub", "Savannah Lions"],
          hand: ["Shock", "First Family"],
        },
      });
      // Green and white permanents; red (Shock) and green-blue (First Family) spells cast this turn: four colors.
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = settle(castIt(s, "p1", "First Family"));
      expect(s.players.p1?.hand).toHaveLength(4);
      expect(life(s, "p1")).toBe(24);
    });

    it("Flame On!: X +1/+1 counters, X your noncreature nonland cards in the graveyard, and flying; rebound", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Mountain", 5), "Bear Cub"],
          hand: ["Flame On!"],
          graveyard: ["Shock", "Arcade Cabinet", "Savannah Lions", "Island"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Flame On!", { targets: { t: [bear] } }));
      expect(plusOne(s, bear)).toBe(2);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(exiled(s, "Flame On!")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && !!castNowOf(x));
      s = settle(act(s, "p1", { type: "cast", card: castNowOf(s)?.cards[0] as string, targets: { t: [bear] } }));
      expect(plusOne(s, bear)).toBe(4);
      expect(graveyardNames(s, "p1")).toContain("Flame On!");
    });

    it("Florian: at your postcombat main phase, look at X cards (life lost by opponents), exile one, playable this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Florian, Voldaren Scion", "Mountain"], library: ["Island", "Shock", "Swamp", "Forest"] },
      });
      const florian = idOf(s, "p1", "battlefield", "Florian, Voldaren Scion");
      expect(chars(s, florian).keywords).toContain("firstStrike");
      s = throughCombat(attack(s, [florian]));
      expect(life(s, "p2")).toBe(17);
      s = settle(s, (req, _p, cur) =>
        req.type === "pick" ? req.options.filter((id) => nameOf(cur, id) === "Shock") : undefined,
      );
      const shock = exiled(s, "Shock")[0] as string;
      // Three cards looked at (3 life lost): the other two go to the bottom, under the Forest.
      const library = namesIn(s, s.players.p1?.library);
      expect([library[0], ...library.slice(1).sort()]).toEqual(["Forest", "Island", "Swamp"]);
      expect(castable(s, "p1", shock)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(15);
    });

    it("Foot Chopper: enters with a 1/1 Ninja attached; flying; it deals combat damage to a player: sacrifice it, draw its power", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Foot Chopper"], library: lands("Swamp", 5) } });
      s = settle(castIt(s, "p1", "Foot Chopper"));
      const ninja = tokens(s, "p1", "Ninja")[0] as string;
      const chopper = idOf(s, "p1", "battlefield", "Foot Chopper");
      expect(s.objects[chopper]?.attachedTo).toBe(ninja);
      expect(chars(s, ninja)).toMatchObject({ power: 1, toughness: 1 });
      expect(chars(s, ninja).keywords).toContain("flying");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      const hand = s.players.p1?.hand.length ?? 0;
      s = throughCombat(attack(s, [ninja]), (req) => yes(req) ?? picking([ninja])(req));
      expect(life(s, "p2")).toBe(19);
      expect(tokens(s, "p1", "Ninja")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
      expect(onField(s, "p1", "Foot Chopper")).toBe(1);
    });

    it("Forgotten Ancient: a spell is cast, you may put a counter on it; at your upkeep, move its counters", () => {
      let s = scenario({
        p1: { battlefield: ["Forgotten Ancient", "Bear Cub", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Mountain"], hand: ["Lightning Bolt"] },
      });
      const ancient = idOf(s, "p1", "battlefield", "Forgotten Ancient");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }), yes);
      expect(plusOne(s, ancient)).toBe(1);
      // An opponent's spell too.
      s = settle(castIt(act(s, "p1", { type: "pass" }), "p2", "Lightning Bolt", { targets: { t: ["p1"] } }), yes);
      expect(plusOne(s, ancient)).toBe(2);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.stack.length > 0);
      s = settle(s, (req) => yes(req) ?? picking([bear])(req));
      expect([plusOne(s, ancient), plusOne(s, bear)]).toEqual([0, 2]);
    });

    it("Franklin Richards: at your combat, if you cast a noncreature spell this turn, discover 6", () => {
      let s = scenario({
        p1: {
          battlefield: ["Franklin Richards, Ascendant", "Mountain"],
          hand: ["Shock"],
          library: ["Island", "Blightsteel Colossus", "Serra Angel", "Swamp"],
        },
      });
      // No noncreature spell: nothing happens.
      let t = s;
      t = advanceUntil(t, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority", 50);
      expect(t.stack).toHaveLength(0);
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && !!castNowOf(x), 50);
      const angel = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, angel)).toBe("Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: angel }));
      expect(onField(s, "p1", "Serra Angel")).toBe(1);
    });

    it("Galvanic Iteration: your next instant or sorcery this turn is copied; flashback {1}{U}{R}", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Volcanic Island", 7)], hand: ["Galvanic Iteration", "Shock", "Lightning Bolt"] },
      });
      s = settle(castIt(s, "p1", "Galvanic Iteration"));
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(16);
      const gi = idOf(s, "p1", "graveyard", "Galvanic Iteration");
      expect(castable(s, "p1", gi)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: gi }));
      expect(exiled(s, "Galvanic Iteration")).toHaveLength(1);
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(10);
    });

    it("Generous Patron: support 2; you put counters on a creature you don't control: draw a card", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 6), hand: ["Generous Patron", "Arcade Cabinet"], library: lands("Forest", 5) },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Generous Patron"), picking([lions]));
      expect(plusOne(s, lions)).toBe(1);
      expect(handNames(s, "p1")).toEqual(["Arcade Cabinet", "Forest"]);
      const patron = idOf(s, "p1", "battlefield", "Generous Patron");
      s = settle(castIt(s, "p1", "Arcade Cabinet"), picking([patron]));
      // Only on its own creature: no card.
      expect(plusOne(s, patron)).toBe(1);
      expect(handNames(s, "p1")).toEqual(["Forest"]);
    });

    it("Grand Crescendo: X 1/1 green and white Citizens; your creatures gain indestructible until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Grand Crescendo"] } });
      s = settle(castIt(s, "p1", "Grand Crescendo", { x: 2 }));
      const citizens = tokens(s, "p1", "Citizen");
      expect(citizens).toHaveLength(2);
      expect(chars(s, citizens[0] as string)).toMatchObject({ power: 1, toughness: 1 });
      expect([...chars(s, citizens[0] as string).colors].sort()).toEqual(["G", "W"]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toContain("indestructible");
      expect(chars(s, citizens[1] as string).keywords).toContain("indestructible");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
    });

    it("Guardian Project: a nontoken creature with a new name enters: draw a card", () => {
      let s = scenario({
        p1: {
          battlefield: ["Guardian Project", "Bear Cub", ...lands("Forest", 3), ...lands("Plains", 6)],
          hand: ["Bear Cub", "Savannah Lions", "Serra Angel"],
          graveyard: ["Savannah Lions"],
          library: lands("Plains", 5),
        },
      });
      s = settle(castIt(s, "p1", "Bear Cub"));
      s = settle(castIt(s, "p1", "Savannah Lions"));
      expect(handNames(s, "p1")).toEqual(["Serra Angel"]);
      s = settle(castIt(s, "p1", "Serra Angel"));
      expect(handNames(s, "p1")).toEqual(["Plains"]);
    });
  });

  describe("rares (4)", () => {
    it("H.E.R.B.I.E.: flying; {T}: {C}; {1}, {T}: any color; at combat, if you cast a noncreature spell this turn, surveil 1", () => {
      let s = scenario({
        p1: {
          battlefield: ["H.E.R.B.I.E., Lovable Robot", "Mountain", "Island"],
          hand: ["Swords to Plowshares"],
          library: ["Swamp", "Island"],
        },
        p2: { battlefield: ["Bear Cub"] },
      });
      const herbie = idOf(s, "p1", "battlefield", "H.E.R.B.I.E., Lovable Robot");
      expect(chars(s, herbie).keywords).toContain("flying");
      // {1} (a land), {T}: {W} for Swords to Plowshares.
      s = settle(activate(s, "p1", herbie, "One mana"), (req) =>
        req.intent === "manaColor" && req.type === "pick" ? ["W"] : undefined,
      );
      expect(s.players.p1?.manaPool.W).toBe(1);
      s = settle(castIt(s, "p1", "Swords to Plowshares", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(s.objects[herbie]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice", 50);
      expect(s.pending?.kind === "choice" && s.pending.request.intent).toBe("surveilGraveyard");
      s = settle(s, (req) => (req.type === "pick" ? req.options : undefined));
      expect(graveyardNames(s, "p1")).toEqual(["Swamp", "Swords to Plowshares"]);
    });

    it("Harold and Bob: reach, vigilance; dies: one of your Forests taps for three mana of one color and two rad counters", () => {
      let s = scenario({
        p1: { battlefield: ["Harold and Bob, First Numens", "Forest", "Plains"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Bolt"] },
      });
      const hb = idOf(s, "p1", "battlefield", "Harold and Bob, First Numens");
      expect(chars(s, hb).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
      const forest = idOf(s, "p1", "battlefield", "Forest");
      s = settle(castIt(act(s, "p1", { type: "pass" }), "p2", "Lightning Bolt", { targets: { t: [hb] } }), picking([forest]));
      expect(onField(s, "p1", "Harold and Bob, First Numens")).toBe(0);
      const ability = activations(s, "p1", forest).find((a) => plainText(a.label ?? "").startsWith("Three mana"));
      expect(ability).toBeDefined();
      s = settle(act(s, "p1", { type: "activate", source: forest, ability: ability?.ability ?? -1 } as never), (req) =>
        req.intent === "manaColor" && req.type === "pick" ? ["W"] : undefined,
      );
      expect(s.players.p1?.manaPool.W).toBe(3);
      expect(s.players.p1?.counters?.rad).toBe(2);
    });

    it("High Score: one more +1/+1 counter on your creatures; at your end step, draw if you control the greatest power", () => {
      let s = scenario({
        p1: {
          battlefield: ["High Score", ...lands("Plains", 3), "Bear Cub"],
          hand: ["Arcade Cabinet"],
          library: lands("Plains", 3),
        },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Arcade Cabinet"), picking([bear, lions]));
      expect([plusOne(s, bear), plusOne(s, lions)]).toEqual([2, 1]);
      s = settle(toEndStep(s));
      expect(handNames(s, "p1")).toEqual(["Plains"]);
      let t = scenario({
        p1: { battlefield: ["High Score", "Bear Cub"], library: lands("Plains", 3) },
        p2: { battlefield: ["Serra Angel"] },
      });
      t = settle(toEndStep(t));
      expect(t.players.p1?.hand).toHaveLength(0);
    });

    it("Ignoble Hierarch: exalted; {T}: {B}, {R} or {G}", () => {
      let s = scenario({ p1: { battlefield: ["Ignoble Hierarch", "Bear Cub"], hand: ["Lightning Bolt"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(17);
      const t = scenario({
        p1: { battlefield: ["Ignoble Hierarch"], hand: ["Swords to Plowshares"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Swords to Plowshares"))).toBe(false);
      // Exalted: the creature attacking alone gets +1/+1.
      s = settle(attack(s, [bear]));
      expect(chars(s, bear).power).toBe(3);
      s = throughCombat(s);
      expect(life(s, "p2")).toBe(14);
    });

    it("Incubation Druid: one mana of a type your lands could produce; three with a +1/+1 counter; {3}{G}{G}: adapt 3", () => {
      const t = scenario({
        p1: { battlefield: ["Incubation Druid", "Forest"], hand: ["Swords to Plowshares"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Swords to Plowshares"))).toBe(false);
      let s = scenario({
        p1: { battlefield: ["Incubation Druid", ...lands("Forest", 5), "Mountain"] },
      });
      const druid = idOf(s, "p1", "battlefield", "Incubation Druid");
      s = settle(activate(s, "p1", druid, "Adapt"));
      expect(plusOne(s, druid)).toBe(3);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      // White: no land of yours could produce it.
      expect(() => act(s, "p1", { type: "tapForMana", source: druid, ability: 1, color: "W" } as never)).toThrow();
      s = act(s, "p1", { type: "tapForMana", source: druid, ability: 1, color: "R" } as never);
      expect(s.players.p1?.manaPool.R).toBe(3);
    });

    it("Inexorable Tide: whenever you cast a spell, proliferate", () => {
      let s = scenario({
        p1: { battlefield: ["Inexorable Tide", { name: "Bear Cub", counters: { "+1/+1": 1 } }, "Mountain"], hand: ["Shock"] },
        p2: { battlefield: [{ name: "Savannah Lions", counters: { "+1/+1": 1 } }] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Shock", { targets: { t: ["p2"] } }), (req) =>
        req.type === "pick" && req.intent === "proliferate" ? [bear] : undefined,
      );
      expect(plusOne(s, bear)).toBe(2);
      expect(plusOne(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toBe(1);
    });

    it("Into the Time Vortex: cascade (a nonland card with mana value less than 5); rebound", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 5),
          hand: ["Into the Time Vortex"],
          library: ["Island", "Blightsteel Colossus", "Serra Angel", "Bear Cub", "Swamp"],
        },
      });
      s = castIt(s, "p1", "Into the Time Vortex");
      s = advanceUntil(s, (x) => !!castNowOf(x), 20);
      // Serra Angel has mana value 5, not less: skipped.
      const bear = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, bear)).toBe("Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: bear }));
      expect(onField(s, "p1", "Bear Cub")).toBe(1);
      expect(exiled(s, "Into the Time Vortex")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && !!castNowOf(x));
      expect(nameOf(s, castNowOf(s)?.cards[0] as string)).toBe("Into the Time Vortex");
    });

    it("Invisible Force Field: up to four of your permanents gain indestructible until end of turn; rebound", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub", "Arcade Cabinet"], hand: ["Invisible Force Field"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const cabinet = idOf(s, "p1", "battlefield", "Arcade Cabinet");
      const card = idOf(s, "p1", "hand", "Invisible Force Field");
      expect(castOption(s, "p1", card)[0]?.modes[0]?.targets[0]?.legal).not.toContain(
        idOf(s, "p2", "battlefield", "Serra Angel"),
      );
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [bear, cabinet] } }));
      expect(chars(s, bear).keywords).toContain("indestructible");
      expect(chars(s, cabinet).keywords).toContain("indestructible");
      expect(exiled(s, "Invisible Force Field")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, bear).keywords).not.toContain("indestructible");
    });

    it("It's Clobberin' Time!: your creature deals damage equal to its power to an opposing creature, or destroy an artifact or enchantment", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 3), "Serra Angel"], hand: ["It's Clobberin' Time!"] },
        p2: { battlefield: ["Archon of Cruelty", "Arcade Cabinet"] },
      });
      const card = idOf(s, "p1", "hand", "It's Clobberin' Time!");
      const modes = castOption(s, "p1", card)[0]?.modes ?? [];
      const fight = modes.find((m) => plainText(m.label ?? "").startsWith("Your creature"))?.index;
      const archon = idOf(s, "p2", "battlefield", "Archon of Cruelty");
      s = settle(
        act(s, "p1", {
          type: "cast",
          card,
          mode: fight,
          targets: { a: [idOf(s, "p1", "battlefield", "Serra Angel")], b: [archon] },
        }),
      );
      expect(s.objects[archon]?.damage).toBe(4);
      // One-sided: the Angel takes no damage.
      expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
      expect(exiled(s, "It's Clobberin' Time!")).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number > 3 && !!castNowOf(x));
      const again = castNowOf(s)?.cards[0] as string;
      const destroy = castOption(s, "p1", again)[0]?.modes.find((m) => plainText(m.label ?? "").startsWith("Destroy"))?.index;
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: again,
          mode: destroy,
          targets: { d: [idOf(s, "p2", "battlefield", "Arcade Cabinet")] },
        }),
      );
      expect(onField(s, "p2", "Arcade Cabinet")).toBe(0);
    });

    it("Jason Bright: a Zombie or Mutant of yours with modified power dies, draw; {2}, sacrifice a creature: a counter and flying", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Jason Bright, Glowing Prophet",
            "Feral Ghoul",
            "Agent Frank Horrigan",
            "Bear Cub",
            ...lands("Island", 4),
          ],
          library: lands("Island", 5),
        },
      });
      const jason = idOf(s, "p1", "battlefield", "Jason Bright, Glowing Prophet");
      const ghoul = idOf(s, "p1", "battlefield", "Feral Ghoul");
      // Bear Cub sacrificed: Feral Ghoul gets a counter; Bear Cub is no Zombie nor Mutant: no card.
      s = settle(
        activate(s, "p1", jason, "", { sacrifice: [idOf(s, "p1", "battlefield", "Bear Cub")], targets: { t: [jason] } }),
      );
      expect(plusOne(s, jason)).toBe(1);
      expect(chars(s, jason).keywords).toContain("flying");
      expect(plusOne(s, ghoul)).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      // Feral Ghoul (3/3 for base 2/2) sacrificed: a card.
      s = settle(activate(s, "p1", jason, "", { sacrifice: [ghoul], targets: { t: [jason] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Knollspine Dragon: enters, you may discard your hand and draw as many cards as the damage dealt to the opponent this turn", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Mountain", 9),
          hand: ["Lightning Bolt", "Knollspine Dragon", "Island", "Swamp"],
          library: lands("Forest", 5),
        },
      });
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }));
      s = settle(castIt(s, "p1", "Knollspine Dragon"), (req) => yes(req) ?? picking(["p2"])(req));
      expect(graveyardNames(s, "p1")).toEqual(["Island", "Lightning Bolt", "Swamp"]);
      expect(handNames(s, "p1")).toEqual(["Forest", "Forest", "Forest"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Knollspine Dragon")).keywords).toContain("flying");
    });
  });

  describe("gaps found by L11, fixed", () => {
    /** Legal targets of the first target word of a card in p2's hand. */
    const targetsOf = (s: S, name: string) => {
      const card = idOf(s, "p2", "hand", name);
      const o = legalActions(s, "p2").find((a) => a.type === "cast" && a.card === card);
      return o?.type === "cast" ? (o.modes[0]?.targets[0]?.legal ?? []) : [];
    };

    it("Akroma, Angel of Fury: protection from white and from blue", () => {
      const s = scenario({
        p1: { battlefield: ["Akroma, Angel of Fury", "Bear Cub"] },
        p2: { battlefield: ["Plains", "Mountain"], hand: ["Swords to Plowshares", "Shock"] },
        active: "p2",
      });
      const akroma = idOf(s, "p1", "battlefield", "Akroma, Angel of Fury");
      expect(targetsOf(s, "Swords to Plowshares")).not.toContain(akroma);
      expect(targetsOf(s, "Swords to Plowshares")).toContain(idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(targetsOf(s, "Shock")).toContain(akroma);
    });

    it("Emrakul, the Promised End: protection from instants", () => {
      const s = scenario({
        p1: { battlefield: ["Emrakul, the Promised End"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
        active: "p2",
      });
      expect(targetsOf(s, "Shock")).not.toContain(idOf(s, "p1", "battlefield", "Emrakul, the Promised End"));
    });
  });
});
