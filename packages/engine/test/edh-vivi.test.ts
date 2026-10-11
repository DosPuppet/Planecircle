/**
 * Commander (EDH pseudo-set): rules tests for the "Vivi Ornitier Storm" deck (Vivi Ornitier, cEDH). Free mana and
 * rituals, pitch spells, Baubles and "look at" effects, soulbond (Tandem Lookout), transmute, extra turns that lose
 * the game, Chain of Vapor's copies, Intuition.
 */
import { describe, expect, it } from "vitest";
import { castOption } from "../src/cardDef";
import { submit } from "../src/game";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import { filterEvents } from "../src/view";
import {
  act,
  advanceUntil,
  castable,
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
} from "./helpers";

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
const yes = (req: ChoiceRequest) => (req.type === "yesNo" ? [1] : undefined);
/** p2 receives priority (p1 passes with an empty stack). */
const toP2 = (s: GameState) => act(s, "p1", { type: "pass" });
describe("Vivi Ornitier, Storm (EDH)", () => {
  describe("mana", () => {
    it("City of Traitors: {C}{C}; playing another land sacrifices it (not its own play)", () => {
      let s = scenario({ p1: { hand: ["City of Traitors"] } });
      s = settle(playLand(s, "p1", "City of Traitors"));
      expect(idsOf(s, "p1", "battlefield", "City of Traitors")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["City of Traitors"], hand: ["Island"] } });
      t = settle(playLand(t, "p1", "Island"));
      expect(idsOf(t, "p1", "battlefield", "City of Traitors")).toHaveLength(0);
      expect(graveyardNames(t, "p1")).toEqual(["City of Traitors"]);
    });

    it("Lion's Eye Diamond: discard your hand, sacrifice it: three mana of one color", () => {
      let s = scenario({ p1: { battlefield: ["Lion's Eye Diamond"], hand: ["Island", "Shock"] } });
      const led = idOf(s, "p1", "battlefield", "Lion's Eye Diamond");
      s = settle(activate(s, "p1", led), picking(["R"]));
      expect(handNames(s, "p1")).toEqual([]);
      expect(graveyardNames(s, "p1")).toEqual(["Island", "Lion's Eye Diamond", "Shock"]);
      expect(Object.values(pool(s, "p1")).reduce((a, b) => a + b, 0)).toBe(3);
    });

    it("Simian Spirit Guide: exiled from the hand for {R}", () => {
      let s = scenario({ p1: { hand: ["Simian Spirit Guide", "Lightning Bolt"] } });
      const guide = idOf(s, "p1", "hand", "Simian Spirit Guide");
      s = activate(s, "p1", guide);
      expect(exiled(s, "Simian Spirit Guide")).toHaveLength(1);
      expect(pool(s, "p1").R).toBe(1);
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
    });

    it("Rite of Flame: {R}{R}, plus {R} for each Rite of Flame in each graveyard", () => {
      let s = scenario({
        p1: { battlefield: ["Mountain"], hand: ["Rite of Flame"], graveyard: ["Rite of Flame"] },
        p2: { graveyard: ["Rite of Flame"] },
      });
      s = settle(castIt(s, "p1", "Rite of Flame"));
      expect(pool(s, "p1").R).toBe(4);
    });

    it("Desperate Ritual: {R}{R}{R}", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Desperate Ritual"] } });
      s = settle(castIt(s, "p1", "Desperate Ritual"));
      expect(pool(s, "p1").R).toBe(3);
    });

    it("Mox Amber: mana of a color among your legendary creatures and planeswalkers", () => {
      const s = scenario({ p1: { battlefield: ["Mox Amber", "Vivi Ornitier"], hand: ["Lightning Bolt"] } });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Lightning Bolt"))).toBe(true);
      const t = scenario({ p1: { battlefield: ["Mox Amber"], hand: ["Lightning Bolt"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Lightning Bolt"))).toBe(false);
    });

    it("Paradise Mantle: the equipped creature taps for any color", () => {
      let s = scenario({ p1: { battlefield: ["Paradise Mantle", "Bear Cub", "Island"], hand: ["Lightning Bolt"] } });
      const mantle = idOf(s, "p1", "battlefield", "Paradise Mantle");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", mantle, { targets: { t: [bear] } }));
      expect(s.objects[mantle]?.attachedTo).toBe(bear);
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.objects[bear]?.tapped).toBe(true);
    });

    it("Jeweled Amulet: {1}, {T}: a charge counter, the type of mana spent noted; {T}, remove it: one mana of that type", () => {
      let s = scenario({ p1: { battlefield: ["Jeweled Amulet", "Forest"], hand: ["Bear Cub"] } });
      const amulet = idOf(s, "p1", "battlefield", "Jeweled Amulet");
      s = settle(activate(s, "p1", amulet));
      expect(s.objects[amulet]?.counters.charge).toBe(1);
      expect(s.objects[amulet]?.chosen?.manaType).toBe("G");
      // Not a second time while it has a counter; the second ability is a mana ability of the noted type only.
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
      expect(activations(s, "p1", amulet)).toEqual([]);
      const tap = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === amulet);
      expect(tap?.type === "tapForMana" && tap.colors).toEqual(["G"]);
      const u = settle(act(s, "p1", { type: "tapForMana", source: amulet, ability: 0, color: "G" }));
      expect(u.objects[amulet]?.counters.charge ?? 0).toBe(0);
      expect(pool(u, "p1").G).toBe(1);
      // The noted type stays (the last one noted).
      expect(u.objects[amulet]?.chosen?.manaType).toBe("G");
      // The automatic payment uses it: the Forest and the Amulet pay for Bear Cub ({1}{G}).
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.objects[amulet]?.counters.charge ?? 0).toBe(0);
      // A charge counter without a noted type (ruling): no mana.
      const t = scenario({ p1: { battlefield: [{ name: "Jeweled Amulet", counters: { charge: 1 } }] } });
      const amulet2 = idOf(t, "p1", "battlefield", "Jeweled Amulet");
      expect(legalActions(t, "p1").some((a) => a.type === "tapForMana" && a.source === amulet2)).toBe(false);
    });

    it("Fiery Islet: {U} or {R} for 1 life; {1}, {T}, sacrifice it: draw a card", () => {
      let s = scenario({ p1: { battlefield: ["Fiery Islet"], hand: ["Lightning Bolt"] } });
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }));
      expect(s.players.p1?.life).toBe(19);
      let t = scenario({ p1: { battlefield: ["Fiery Islet", "Island"] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Fiery Islet")));
      expect(t.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("cards and information", () => {
    it("Gitaxian Probe: you look at the hand (only you), and draw; Phyrexian mana", () => {
      const s = scenario({ p1: { hand: ["Gitaxian Probe"] }, p2: { hand: ["Shock", "Island"] } });
      // {U/P}: 2 life without blue mana.
      let r = submit(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Gitaxian Probe"), targets: { p: ["p2"] } });
      const events = [...r.events];
      while (r.state.stack.length && r.state.pending?.kind === "priority") {
        r = submit(r.state, r.state.pending.player, { type: "pass" });
        events.push(...r.events);
      }
      expect(r.state.players.p1?.life).toBe(18);
      expect(r.state.players.p1?.hand).toHaveLength(1);
      const look = events.find((e) => e.type === "reveal" && e.look);
      expect(look?.type === "reveal" && look.defIds.map((d) => s.defs[d]?.name).sort()).toEqual(["Island", "Shock"]);
      expect(filterEvents(events, "p2").some((e) => e.type === "reveal" && e.look)).toBe(false);
      expect(filterEvents(events, "p1").some((e) => e.type === "reveal" && e.look)).toBe(true);
    });

    it("Mishra's Bauble: look at the top card; you draw at the beginning of the next turn's upkeep", () => {
      let s = scenario({
        p1: { battlefield: ["Mishra's Bauble"], library: lands("Island", 5) },
        p2: { library: lands("Swamp", 5) },
      });
      const bauble = idOf(s, "p1", "battlefield", "Mishra's Bauble");
      s = settle(activate(s, "p1", bauble, { targets: { p: ["p2"] } }));
      expect(s.players.p1?.hand).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "draw");
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Intuition: three cards; the targeted opponent chooses the one that goes to your hand, the rest to the graveyard", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Intuition"], library: ["Shock", "Lightning Bolt", "Opt", "Island"] },
      });
      s = settle(castIt(s, "p1", "Intuition", { targets: { o: ["p2"] } }), (req, p, st) =>
        req.type === "pick" && p === "p1"
          ? req.options.filter((id) => ["Shock", "Lightning Bolt", "Opt"].includes(nameOf(st, id) ?? ""))
          : req.type === "pick" && p === "p2"
            ? req.options.filter((id) => nameOf(st, id) === "Opt")
            : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Opt"]);
      expect(graveyardNames(s, "p1")).toEqual(["Intuition", "Lightning Bolt", "Shock"]);
      expect(s.players.p1?.library).toHaveLength(1);
    });

    it("Jeska's Will: one mode, or both while you control a commander", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Jeska's Will"], library: ["Shock", "Island", "Opt", "Swamp"] },
        p2: { hand: ["Island", "Island", "Island", "Island"] },
      });
      const card = idOf(s, "p1", "hand", "Jeska's Will");
      const modesOf = (st: GameState, c: string) => {
        const o = legalActions(st, "p1").find((a) => a.type === "cast" && a.card === c);
        return o?.type === "cast" ? o.modes.map((m) => m.index) : [];
      };
      // Without a commander: the two modes alone.
      expect(modesOf(s, card)).toEqual([0, 1]);
      s = settle(castIt(s, "p1", "Jeska's Will", { mode: 0, targets: { o: ["p2"] } }));
      expect(pool(s, "p1").R).toBe(4);
      let t = scenario({
        p1: {
          battlefield: [...lands("Mountain", 3), "Vivi Ornitier"],
          hand: ["Jeska's Will"],
          library: ["Shock", "Island", "Opt"],
        },
        p2: { hand: ["Island", "Island"] },
      });
      t.commander = {
        cards: {
          [t.objects[idOf(t, "p1", "battlefield", "Vivi Ornitier")]?.uid ?? ""]: {
            owner: "p1",
            defId: t.objects[idOf(t, "p1", "battlefield", "Vivi Ornitier")]?.defId ?? "",
            casts: 0,
            damage: {},
          },
        },
      };
      const jw = idOf(t, "p1", "hand", "Jeska's Will");
      expect(modesOf(t, jw)).toEqual([0, 1, 2]);
      t = settle(castIt(t, "p1", "Jeska's Will", { mode: 2, targets: { p: ["p2"] } }));
      expect(pool(t, "p1").R).toBe(2);
      expect(exiled(t, "Shock")).toHaveLength(1);
      expect(castable(t, "p1", exiled(t, "Shock")[0] ?? "")).toBe(true);
    });

    it("Wheel of Fortune: each player discards their hand, then draws seven cards", () => {
      let s = scenario({
        p1: { battlefield: lands("Mountain", 3), hand: ["Wheel of Fortune", "Shock"], library: lands("Island", 10) },
        p2: { hand: ["Opt", "Island", "Island"], library: lands("Swamp", 10) },
      });
      s = settle(castIt(s, "p1", "Wheel of Fortune"));
      expect(s.players.p1?.hand).toHaveLength(7);
      expect(s.players.p2?.hand).toHaveLength(7);
      expect(graveyardNames(s, "p2")).toEqual(["Island", "Island", "Opt"]);
    });

    it("Dizzy Spell: transmute, a card with the same mana value, only as a sorcery", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Dizzy Spell"], library: ["Bear Cub", "Shock", "Island"] },
      });
      const dizzy = idOf(s, "p1", "hand", "Dizzy Spell");
      s = settle(activate(s, "p1", dizzy), (req, _p, st) =>
        req.type === "pick" && req.intent === "search" ? req.options.filter((id) => nameOf(st, id) === "Shock") : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Shock"]);
      expect(graveyardNames(s, "p1")).toEqual(["Dizzy Spell"]);
      // Not during the opponent's turn.
      const t = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Dizzy Spell"] }, active: "p2" });
      expect(activations(act(t, "p2", { type: "pass" }), "p1", idOf(t, "p1", "hand", "Dizzy Spell"))).toHaveLength(0);
    });
  });

  describe("interaction", () => {
    it("Chain of Vapor: bounce; the controller may sacrifice a land to copy it (new target)", () => {
      let s = scenario({
        p1: { battlefield: ["Island", "Bear Cub"], hand: ["Chain of Vapor"] },
        p2: { battlefield: ["Savannah Lions", "Plains"] },
      });
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = castIt(s, "p1", "Chain of Vapor", { targets: { t: [lions] } });
      // p2 sacrifices its Plains and copies the spell onto the Bear.
      s = settle(s, (req, p) =>
        p === "p2" && req.type === "yesNo"
          ? [1]
          : p === "p2" && req.type === "pick" && req.options.includes(bear)
            ? [bear]
            : undefined,
      );
      expect(handNames(s, "p2")).toEqual(["Savannah Lions"]);
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(graveyardNames(s, "p2")).toEqual(["Plains"]);
    });

    it("Misdirection: exile a blue card instead of paying; the target of a spell with a single target changes", () => {
      let s = scenario({
        p1: { hand: ["Misdirection", "Opt"], battlefield: ["Bear Cub"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
        active: "p2",
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never);
      const shock = s.stack[0]?.id ?? "";
      s = act(s, "p2", { type: "pass" });
      const alt = legalActions(s, "p1").find(
        (a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Misdirection") && a.altAvailable,
      );
      expect(alt).toBeDefined();
      s = castIt(s, "p1", "Misdirection", { alternative: true, targets: { t: [shock] } });
      s = settle(s, (req) => (req.type === "pick" && req.options.includes(bear) ? [bear] : undefined));
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    });

    it("Mogg Salvage and Submerge: free with the right lands", () => {
      const s = scenario({
        p1: { battlefield: ["Mountain"], hand: ["Mogg Salvage"] },
        p2: { battlefield: ["Island", "Mishra's Bauble"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Mogg Salvage"))).toBe(true);
      const t = scenario({
        p1: { battlefield: ["Mountain"], hand: ["Mogg Salvage"] },
        p2: { battlefield: ["Plains", "Mishra's Bauble"] },
      });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Mogg Salvage"))).toBe(false);
      let u = scenario({ p1: { battlefield: ["Island"], hand: ["Submerge"] }, p2: { battlefield: ["Forest", "Bear Cub"] } });
      const bear = idOf(u, "p2", "battlefield", "Bear Cub");
      u = settle(castIt(u, "p1", "Submerge", { alternative: true, targets: { t: [bear] } }));
      expect(nameOf(u, u.players.p2?.library[0] ?? "")).toBe("Bear Cub");
    });

    it("Pact of Negation: free counter; at your next upkeep, pay {3}{U}{U} or lose the game", () => {
      let s = scenario({
        p1: { hand: ["Pact of Negation"], battlefield: lands("Island", 5) },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never);
      s = act(s, "p2", { type: "pass" });
      s = castIt(s, "p1", "Pact of Negation", { targets: { t: [s.stack[0]?.id ?? ""] } });
      s = settle(s);
      expect(s.players.p1?.life).toBe(20);
      // Next upkeep: paid with the five Islands.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.over).toBeFalsy();
      // Without the mana: lost.
      let t = scenario({
        p1: { hand: ["Pact of Negation"], battlefield: lands("Island", 2) },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
        active: "p2",
      });
      t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never);
      t = act(t, "p2", { type: "pass" });
      t = settle(castIt(t, "p1", "Pact of Negation", { targets: { t: [t.stack[0]?.id ?? ""] } }));
      t = advanceUntil(t, (x) => !!x.over || (x.turn.active === "p1" && x.turn.step === "main1"));
      expect(t.over).toBe(true);
      expect(t.winner).toBe("p2");
    });

    it("Pyroblast: counters only a blue spell; Red Elemental Blast only targets blue", () => {
      let s = scenario({
        p1: { hand: ["Pyroblast", "Red Elemental Blast"], battlefield: lands("Mountain", 2) },
        p2: { battlefield: ["Island"], hand: ["Opt"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Opt") } as never);
      const opt = s.stack[0]?.id ?? "";
      s = act(s, "p2", { type: "pass" });
      s = settle(castIt(s, "p1", "Pyroblast", { mode: 0, targets: { s: [opt] } }));
      expect(graveyardNames(s, "p2")).toEqual(["Opt"]);
      expect(s.players.p2?.hand).toHaveLength(0);
      // A red spell: Pyroblast can target it but does nothing; REB can't target it.
      let t = scenario({
        p1: { hand: ["Pyroblast", "Red Elemental Blast"], battlefield: lands("Mountain", 2) },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
        active: "p2",
      });
      t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never);
      const shock = t.stack[0]?.id ?? "";
      t = act(t, "p2", { type: "pass" });
      const reb = idOf(t, "p1", "hand", "Red Elemental Blast");
      expect(
        legalActions(t, "p1").some(
          (a) => a.type === "cast" && a.card === reb && a.modes.some((m) => m.targets.some((x) => x.legal.includes(shock))),
        ),
      ).toBe(false);
      t = settle(castIt(t, "p1", "Pyroblast", { mode: 0, targets: { s: [shock] } }));
      expect(t.players.p1?.life).toBe(18);
    });

    it("Pyrokinesis: exile a red card; 4 damage divided among creatures", () => {
      let s = scenario({ p1: { hand: ["Pyrokinesis", "Shock"] }, p2: { battlefield: ["Bear Cub", "Savannah Lions"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castIt(s, "p1", "Pyrokinesis", { alternative: true, targets: { t: [bear, lions] } }));
      expect(exiled(s, "Shock")).toHaveLength(1);
      expect(graveyardNames(s, "p2")).toEqual(["Bear Cub", "Savannah Lions"]);
    });

    it("Mental Misstep: counters a spell with mana value 1 only", () => {
      let s = scenario({ p1: { hand: ["Mental Misstep"] }, p2: { battlefield: ["Mountain"], hand: ["Shock"] }, active: "p2" });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } } as never);
      s = act(s, "p2", { type: "pass" });
      s = settle(castIt(s, "p1", "Mental Misstep", { targets: { t: [s.stack[0]?.id ?? ""] } }));
      expect(s.players.p1?.life).toBe(18);
      expect(graveyardNames(s, "p2")).toEqual(["Shock"]);
    });

    it("Tormod's Crypt: exiles target player's graveyard; Twisted Image switches P/T and draws", () => {
      let s = scenario({ p1: { battlefield: ["Tormod's Crypt"] }, p2: { graveyard: ["Shock", "Opt"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Tormod's Crypt"), { targets: { p: ["p2"] } }));
      expect(s.players.p2?.graveyard).toHaveLength(0);
      let t = scenario({ p1: { battlefield: ["Island", "Tandem Lookout"], hand: ["Twisted Image"] } });
      const look = idOf(t, "p1", "battlefield", "Tandem Lookout");
      t = settle(castIt(t, "p1", "Twisted Image", { targets: { t: [look] } }));
      expect([chars(t, look).power, chars(t, look).toughness]).toEqual([1, 2]);
      expect(t.players.p1?.hand).toHaveLength(1);
    });
  });

  describe("creatures and extra turns", () => {
    it("Tandem Lookout: soulbond; each paired creature draws when it deals damage to an opponent", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Island", 3)], hand: ["Tandem Lookout"], library: lands("Island", 10) },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Tandem Lookout"), picking([bear]));
      const lookout = idOf(s, "p1", "battlefield", "Tandem Lookout");
      expect(s.objects[lookout]?.pairedWith).toBe(bear);
      expect(s.objects[bear]?.pairedWith).toBe(lookout);
      // The Bear (paired) deals combat damage: a card.
      s = act(
        advanceUntil(s, (x) => x.pending?.kind === "declareAttackers"),
        "p1",
        {
          type: "declareAttackers",
          attackers: [{ id: bear, defender: "p2" }],
        },
      );
      s = advanceUntil(s, (x) => x.turn.step === "main2", 200);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Tandem Lookout: a creature entering later may pair with it; the pair breaks when one leaves", () => {
      let s = scenario({
        p1: { battlefield: ["Tandem Lookout", "Forest", "Forest"], hand: ["Bear Cub"] },
        p2: { battlefield: lands("Mountain", 1), hand: ["Shock"] },
      });
      const lookout = idOf(s, "p1", "battlefield", "Tandem Lookout");
      s = settle(castIt(s, "p1", "Bear Cub"), yes);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[lookout]?.pairedWith).toBe(bear);
      s = toP2(s);
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [bear] } } as never);
      s = passAccepting(s, (x) => x.stack.length === 0);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(s.objects[lookout]?.pairedWith).toBeUndefined();
    });

    it("Dragon's Rage Channeler: surveil 1 per noncreature spell; delirium: 3/3 flying that attacks", () => {
      let s = scenario({
        p1: { battlefield: ["Dragon's Rage Channeler", "Mountain"], hand: ["Lightning Bolt"], library: lands("Island", 5) },
      });
      const drc = idOf(s, "p1", "battlefield", "Dragon's Rage Channeler");
      s = settle(castIt(s, "p1", "Lightning Bolt", { targets: { t: ["p2"] } }), (req) =>
        req.type === "pick" && req.intent !== "triggerTarget" ? req.options : undefined,
      );
      expect(chars(s, drc).power).toBe(1);
      const t = scenario({
        p1: { battlefield: ["Dragon's Rage Channeler"], graveyard: ["Island", "Shock", "Bear Cub", "Mishra's Bauble"] },
      });
      const d2 = idOf(t, "p1", "battlefield", "Dragon's Rage Channeler");
      expect([chars(t, d2).power, chars(t, d2).toughness]).toEqual([3, 3]);
      expect(chars(t, d2).keywords).toEqual(expect.arrayContaining(["flying", "mustAttack"]));
    });

    it("Final Fortune: an extra turn, at the end step of which you lose", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Final Fortune"] } });
      s = settle(castIt(s, "p1", "Final Fortune"));
      expect(s.extraTurns).toEqual(["p1"]);
      s = advanceUntil(s, (x) => !!x.over || (x.turn.number === 4 && x.turn.step === "main1"));
      expect(s.turn.active).toBe("p1");
      expect(s.over).toBeFalsy();
      s = advanceUntil(s, (x) => !!x.over, 300);
      expect(s.turn.number).toBe(4);
      expect(s.winner).toBe("p2");
    });

    it("Borne Upon a Wind: your spells have flash this turn; draw a card", () => {
      // During the opponent's turn (p2 passes): a creature spell can be cast after it.
      let s = scenario({
        p1: { battlefield: lands("Island", 5), hand: ["Borne Upon a Wind", "Tandem Lookout"], library: lands("Island", 5) },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      const lookout = idOf(s, "p1", "hand", "Tandem Lookout");
      expect(castable(s, "p1", lookout)).toBe(false);
      s = passAccepting(
        castIt(s, "p1", "Borne Upon a Wind"),
        (x) => x.stack.length === 0 && x.pending?.kind === "priority" && x.pending.player === "p1",
      );
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(castable(s, "p1", lookout)).toBe(true);
    });

    it("Crowd's Favor: +1/+0 and first strike, convoke", () => {
      // Convoke with a red creature (no land).
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Dragon's Rage Channeler"], hand: ["Crowd's Favor"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Crowd's Favor"))).toBe(true);
      s = settle(castIt(s, "p1", "Crowd's Favor", { targets: { t: [bear] } }));
      expect(chars(s, bear).power).toBe(3);
      expect(chars(s, bear).keywords).toContain("firstStrike");
    });
  });

  it("flashback read from the Oracle text (PLAN-L L11): Faithless Looting, Strike It Rich, Lingering Souls", () => {
    const s = scenario({
      p1: { battlefield: lands("Mountain", 3), graveyard: ["Faithless Looting", "Strike It Rich", "Lingering Souls"] },
    });
    const cost = (name: string) =>
      castOption(s.defs[s.objects[idOf(s, "p1", "graveyard", name)]?.defId ?? ""], "flashback")?.cost;
    expect(cost("Faithless Looting")).toMatchObject({ generic: 2, colored: { R: 1 } });
    expect(cost("Strike It Rich")).toMatchObject({ generic: 2, colored: { R: 1 } });
    expect(cost("Lingering Souls")).toMatchObject({ generic: 1, colored: { B: 1 } });
    const looting = idOf(s, "p1", "graveyard", "Faithless Looting");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === looting)).toBe(true);
  });
});

describe("PLAN-M M9b: automatic payment", () => {
  it("Vivi Ornitier makes more mana than the spell needs: the rest goes to the pool (found by the strict fuzz)", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Vivi Ornitier", counters: { "+1/+1": 4 } }], hand: ["Mogg Salvage"] },
      p2: { battlefield: ["Jeweled Amulet"] },
    });
    const amulet = idOf(s, "p2", "battlefield", "Jeweled Amulet");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mogg Salvage"), targets: { t: [amulet] } });
    // {2}{R} paid; the fourth mana stays in the pool.
    expect(Object.values(pool(s, "p1")).reduce((a, b) => a + b, 0)).toBe(1);
    s = settle(s);
    expect(idsOf(s, "p2", "graveyard", "Jeweled Amulet")).toHaveLength(1);
  });
});
