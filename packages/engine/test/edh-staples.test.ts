/**
 * Commander (EDH pseudo-set, PLAN-E, E9): rules tests of the common spells and engines of the Commander decks
 * (Oracle text). Player protection from everything and life total that cannot change (Teferi's Protection, The One
 * Ring), tutors, counterspells, board wipes, land back face of a modal card, token doubling, drain.
 */
import { describe, expect, it } from "vitest";
import * as dsl from "../src/dsl";
import { bump, chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { payableLife, playerProtectedFrom } from "../src/statics";
import { plainText } from "../src/text";
import type { ActionOption, CardDef, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  customCard,
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

const { fx, ref, target } = dsl;
const SINK = "Sink into Stupor // Soporific Springs";

/** Test ritual costing {0} (engine cards, not from the catalog). */
const sorcery = (name: string, spell: CardDef["spell"]): CardDef =>
  customCard({ name, typeLine: "Sorcery", types: ["Sorcery"], spell });
const DRAIN = sorcery("Ponction d'essai", dsl.spell([], [fx.loseLife(3, ref.eachOpponent)]));
const BLAST = sorcery("Souffle d'essai", dsl.spell([], [fx.damage(3, ref.eachOpponent)]));
const GIFT = sorcery("Don d'essai", dsl.spell([], [fx.gainLife(3, ref.eachPlayer)]));
const REANIMATE = sorcery(
  "Retour d'essai",
  dsl.spell([target.cardInGraveyard("t", { types: ["Artifact"] })], [fx.toBattlefield(ref.target())]),
);

const castOptions = (s: GameState, player: PlayerId, card: ObjectId) =>
  legalActions(s, player).filter((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activateOption = (s: GameState, player: PlayerId, source: ObjectId) =>
  legalActions(s, player).find(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Activates the (first) offered ability of this source. */
function activate(s: GameState, player: PlayerId, source: ObjectId, targets?: Record<string, string[]>): GameState {
  const o = activateOption(s, player, source);
  if (!o) throw new Error("no ability to activate");
  return act(s, player, { type: "activate", source, ability: o.ability, targets });
}
const tokens = (s: GameState, player: PlayerId, name: string) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === player && nameOf(s, id) === name);
const handNames = (s: GameState, player: PlayerId) => namesIn(s, s.players[player]?.hand).sort();
/** Chooses the mode whose label is given (modal triggered ability). */
const modeNamed = (label: string) => (req: ChoiceRequest) =>
  req.type === "pick" && req.intent === "triggerMode"
    ? Object.entries(req.labels ?? {})
        .filter(([, l]) => plainText(l) === label)
        .map(([k]) => k)
    : undefined;
/** p2 casts a Shock on p1, then p1 has priority. */
const shockP1 = (s: GameState) => {
  const t = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } });
  return act(t, "p2", { type: "pass" });
};

describe("Commander (EDH): common spells and engines (E9)", () => {
  describe("Teferi's Protection", () => {
    it("until your next turn: can't be targeted, damaged, nor lose or gain life; your permanents phase out; exiled", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Teferi's Protection"] },
        p2: { battlefield: ["Mountain", "Savannah Lions"], hand: ["Shock", DRAIN, BLAST, GIFT] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = act(s, "p2", { type: "pass" });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teferi's Protection") }));
      expect(exiled(s, "Teferi's Protection")).toHaveLength(1);
      expect(s.objects[bear]?.zone).toBe("phasedOut");
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p1")).toEqual([]);
      // Protection from everything: no target (even for its own spells), damage prevented.
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(true);
      expect(playerProtectedFrom(s, "p1", "p1")).toBe(true);
      expect(() => act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } })).toThrow();
      for (const name of [DRAIN.name, BLAST.name, GIFT.name])
        s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", name) }));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p2?.life).toBe(23);
      // Creatures can still attack this player; combat damage is prevented.
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Savannah Lions"), defender: "p1" }],
      });
      s = throughCombat(s);
      expect(s.players.p1?.life).toBe(20);
      // On p1's next turn: phase back in (before untap), protection ends.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(s.objects[bear]?.zone).toBe("battlefield");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(false);
      expect(payableLife(s, "p1")).toBe(20);
    });

    it("a curse attached to the player falls off (protection, 702.16b; PLAN-L L4)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Plains", 3), hand: ["Teferi's Protection"] },
        p2: { battlefield: lands("Swamp", 5), hand: ["Grievous Wound"] },
      });
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Grievous Wound"), targets: { enchant: ["p1"] } }));
      const wound = idOf(s, "p2", "battlefield", "Grievous Wound");
      expect(s.objects[wound]?.attachedTo).toBe("p1");
      s = act(s, "p2", { type: "pass" });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teferi's Protection") }));
      expect(s.battlefield.some((id) => s.objects[id]?.defId === s.objects[wound]?.defId)).toBe(false);
      expect(idsOf(s, "p2", "graveyard", "Grievous Wound")).toHaveLength(1);
    });

    it("'your life total can't change': no life payment beyond 0 (119.8)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 3), ...lands("Swamp", 6)], hand: ["Teferi's Protection", "Toxic Deluge"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      // The Swamps' mana stays in the pool when they phase out.
      for (const swamp of idsOf(s, "p1", "battlefield", "Swamp"))
        s = act(s, "p1", { type: "tapForMana", source: swamp, ability: 0 });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teferi's Protection") }));
      expect(payableLife(s, "p1")).toBe(0);
      const deluge = idOf(s, "p1", "hand", "Toxic Deluge");
      expect(() => act(s, "p1", { type: "cast", card: deluge, x: 2 })).toThrow(/Not enough life/);
      s = settle(act(s, "p1", { type: "cast", card: deluge, x: 0 }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });
  });

  describe("The One Ring", () => {
    it("cast: protection from everything until your next turn; indestructible", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["The One Ring"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "The One Ring") }));
      const ring = idOf(s, "p1", "battlefield", "The One Ring");
      expect(chars(s, ring).keywords).toContain("indestructible");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(true);
      // Not the "your life total can't change" rule: paying life remains possible.
      expect(payableLife(s, "p1")).toBe(20);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(false);
    });

    it("put onto the battlefield without being cast: no protection", () => {
      let s = scenario({ p1: { graveyard: ["The One Ring"], hand: [REANIMATE] } });
      const ring = idOf(s, "p1", "graveyard", "The One Ring");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", REANIMATE.name), targets: { t: [ring] } }));
      expect(idsOf(s, "p1", "battlefield", "The One Ring")).toHaveLength(1);
      expect(playerProtectedFrom(s, "p1", "p2")).toBe(false);
    });

    it("{T}: a burden counter, then a card per counter; at upkeep, 1 life lost per counter", () => {
      let s = scenario({ p1: { battlefield: ["The One Ring"], library: lands("Island", 12) } });
      const ring = idOf(s, "p1", "battlefield", "The One Ring");
      s = settle(activate(s, "p1", ring));
      expect(s.objects[ring]?.counters.burden).toBe(1);
      expect(s.players.p1?.hand).toHaveLength(1);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.players.p1?.life).toBe(19);
      const before = s.players.p1?.hand.length ?? 0;
      s = settle(activate(s, "p1", ring));
      expect(s.objects[ring]?.counters.burden).toBe(2);
      expect(s.players.p1?.hand.length).toBe(before + 2);
    });
  });

  describe("tuteurs", () => {
    it("Demonic Tutor: any card from the library into hand", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Demonic Tutor"], library: ["Forest", "Forest", "Shock"] },
      });
      const shock = s.players.p1?.library.find((id) => nameOf(s, id) === "Shock") as string;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Demonic Tutor") }), picking([shock]));
      expect(handNames(s, "p1")).toEqual(["Shock"]);
    });

    it("Enlightened Tutor: only an artifact or an enchantment, put on top after the shuffle", () => {
      let s = scenario({
        p1: { battlefield: ["Plains"], hand: ["Enlightened Tutor"], library: ["Bear Cub", "Forest", "Sanguine Bond", "Forest"] },
      });
      let offered: string[] = [];
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Enlightened Tutor") }), (req) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = namesIn(s, req.options) as string[];
        return req.options.filter((id) => nameOf(s, id) === "Sanguine Bond");
      });
      expect(offered).toEqual(["Sanguine Bond"]);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Sanguine Bond");
      expect(s.players.p1?.hand).toEqual([]);
    });
  });

  describe("contresorts", () => {
    it("Force of Negation: outside your turn, a blue card exiled from hand; the countered spell is exiled", () => {
      let s = scenario({
        active: "p2",
        p1: { hand: ["Force of Negation", "Opt"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = shockP1(s);
      const fon = idOf(s, "p1", "hand", "Force of Negation");
      expect(castOptions(s, "p1", fon).some((o) => o.altAvailable)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: fon, alternative: true, targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(exiled(s, "Shock")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toEqual([]);
    });

    it("Force of Negation: during your turn, only for its mana cost", () => {
      let s = scenario({ p1: { battlefield: ["Mountain"], hand: ["Force of Negation", "Opt", "Shock"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shock"), targets: { t: ["p2"] } });
      expect(castOptions(s, "p1", idOf(s, "p1", "hand", "Force of Negation")).some((o) => o.altAvailable)).toBe(false);
    });

    it("Rewind: counters a spell and untaps up to four lands", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 4), hand: ["Rewind"] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = shockP1(s);
      s = settle(
        act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rewind"), targets: { t: [s.stack[0]?.id as string] } }),
      );
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Unwind: only a noncreature spell; untaps up to three lands", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: ["Unwind"] },
        p2: { battlefield: [...lands("Mountain", 2), ...lands("Forest", 2)], hand: ["Shock", "Bear Cub"] },
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const unwind = idOf(s, "p1", "hand", "Unwind");
      expect(() => act(s, "p1", { type: "cast", card: unwind, targets: { t: [s.stack[0]?.id as string] } })).toThrow();
      s = settle(s);
      s = shockP1(s);
      s = settle(act(s, "p1", { type: "cast", card: unwind, targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });
  });

  describe("destructions", () => {
    it("Snuff Out: 4 life instead of mana if you control a Swamp; nonblack creature only", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp"], hand: ["Snuff Out"] },
        p2: { battlefield: ["Bear Cub", "Vampire of the Dire Moon"] },
      });
      const snuff = idOf(s, "p1", "hand", "Snuff Out");
      expect(castOptions(s, "p1", snuff).some((o) => o.altAvailable)).toBe(true);
      const vampire = idOf(s, "p2", "battlefield", "Vampire of the Dire Moon");
      expect(() => act(s, "p1", { type: "cast", card: snuff, alternative: true, targets: { t: [vampire] } })).toThrow();
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: snuff,
          alternative: true,
          targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
        }),
      );
      expect(s.players.p1?.life).toBe(16);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Swamp")]?.tapped).toBe(false);
      // Without a Swamp: no alternative cost.
      const t = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Snuff Out"] }, p2: { battlefield: ["Bear Cub"] } });
      expect(castOptions(t, "p1", idOf(t, "p1", "hand", "Snuff Out")).some((o) => o.altAvailable)).toBe(false);
    });

    it("Vindicate: destroys any permanent, lands included", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", "Swamp", "Mountain"], hand: ["Vindicate"] },
        p2: { battlefield: ["Forest"] },
      });
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Vindicate"),
          targets: { t: [idOf(s, "p2", "battlefield", "Forest")] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Forest")).toHaveLength(1);
    });

    it("Damn: one targeted creature for {B}{B}; overloaded for {2}{W}{W}, each creature", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Damn"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      s = settle(
        act(s, "p1", {
          type: "cast",
          card: idOf(s, "p1", "hand", "Damn"),
          mode: 0,
          targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] },
        }),
      );
      expect(namesIn(s, s.players.p2?.graveyard)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Healer's Hawk"], hand: ["Damn"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Damn"), mode: 1 }));
      expect(t.battlefield.filter((id) => chars(t, id).types.includes("Creature"))).toEqual([]);
    });

    it("Toxic Deluge: pay X life as an additional cost; all creatures -X/-X", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Vampire Nighthawk"], hand: ["Toxic Deluge"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Toxic Deluge"), x: 2 }));
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const hawk = idOf(s, "p1", "battlefield", "Vampire Nighthawk");
      expect([chars(s, hawk).power, chars(s, hawk).toughness]).toEqual([0, 1]);
    });

    it("Farewell: one or more modes (creatures and graveyards: artifacts and enchantments stay)", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Farewell"], graveyard: ["Opt"] },
        p2: { battlefield: ["Bear Cub", "Goblin Firebomb", "Sanguine Bond"], graveyard: ["Shock"] },
      });
      const farewell = idOf(s, "p1", "hand", "Farewell");
      const modes = castOptions(s, "p1", farewell).flatMap((o) => o.modes);
      expect(modes).toHaveLength(15);
      const both = modes.find((m) => plainText(m.label ?? "") === "Exile all creatures + Exile all graveyards");
      s = settle(act(s, "p1", { type: "cast", card: farewell, mode: both?.index }));
      expect(exiled(s, "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Shock")).toHaveLength(1);
      expect(exiled(s, "Opt")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Goblin Firebomb")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Sanguine Bond")).toHaveLength(1);
      // Farewell joins the graveyard after exiling the graveyards.
      expect(idsOf(s, "p1", "graveyard", "Farewell")).toHaveLength(1);
    });
  });

  describe("draw and tempo", () => {
    it("Frantic Search: draw two cards, discard two, untap up to three lands", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 3), hand: ["Frantic Search", "Bear Cub", "Shock"], library: lands("Forest", 5) },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Frantic Search") }));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(s.players.p1?.graveyard).toHaveLength(3);
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Frantic Search: the lands to untap are chosen, any player's (PLAN-M M9b)", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Island", 3), { name: "Forest", tapped: true }],
          hand: ["Frantic Search", "Bear Cub", "Shock"],
          library: lands("Forest", 5),
        },
        p2: { battlefield: [{ name: "Mountain", tapped: true }] },
      });
      const forest = idOf(s, "p1", "battlefield", "Forest");
      const mountain = idOf(s, "p2", "battlefield", "Mountain");
      const islands = idsOf(s, "p1", "battlefield", "Island");
      let asked: ChoiceRequest | undefined;
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Frantic Search") }), (req) => {
        if (req.type !== "pick" || !req.options.includes(mountain)) return undefined;
        asked = req;
        return [forest, mountain, islands[0] as string];
      });
      // Your lands by default; the opponent's tapped Mountain is offered too.
      expect(asked?.type === "pick" && [asked.max, [...asked.options].sort()]).toEqual([
        3,
        [...islands, forest, mountain].sort(),
      ]);
      expect(asked?.suggested).toHaveLength(3);
      expect(asked?.suggested).not.toContain(mountain);
      expect([forest, mountain, ...islands].map((id) => s.objects[id]?.tapped)).toEqual([false, false, false, true, true]);
    });

    it("Village Rites: a creature sacrificed as an additional cost; draw two cards", () => {
      const none = scenario({ p1: { battlefield: ["Swamp"], hand: ["Village Rites"] } });
      expect(castOptions(none, "p1", idOf(none, "p1", "hand", "Village Rites"))).toEqual([]);
      let s = scenario({ p1: { battlefield: ["Swamp", "Bear Cub"], hand: ["Village Rites"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Village Rites"), sacrifice: [bear] }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Sink into Stupor: returns an opposing spell or nonland permanent to its owner's hand", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 3), hand: [SINK] },
        p2: { battlefield: ["Mountain"], hand: ["Shock"] },
      });
      s = shockP1(s);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", SINK), targets: { t: [s.stack[0]?.id as string] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(handNames(s, "p2")).toEqual(["Shock"]);
      let t = scenario({
        p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: [SINK] },
        p2: { battlefield: ["Forest", "Bear Cub"] },
      });
      const sink = idOf(t, "p1", "hand", SINK);
      for (const bad of [idOf(t, "p2", "battlefield", "Forest"), idOf(t, "p1", "battlefield", "Bear Cub")])
        expect(() => act(t, "p1", { type: "cast", card: sink, targets: { t: [bad] } })).toThrow();
      t = settle(act(t, "p1", { type: "cast", card: sink, targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      expect(handNames(t, "p2")).toEqual(["Bear Cub"]);
    });

    it("Soporific Springs: the back face is played as a land; 3 life for it to enter untapped; {T}: {U}", () => {
      let s = scenario({ p1: { hand: [SINK] } });
      const card = idOf(s, "p1", "hand", SINK);
      const plays = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === card);
      expect(plays.map((a) => a.type === "playLand" && !!a.payLife)).toEqual([true, false]);
      s = act(s, "p1", { type: "playLand", card, payLife: true });
      const land = s.battlefield.find((id) => s.objects[id]?.controller === "p1") as string;
      expect(chars(s, land).name).toBe("Soporific Springs");
      expect(s.objects[land]?.tapped).toBe(false);
      expect(s.players.p1?.life).toBe(17);
      expect(manaAbilitiesOf(s, land).flatMap((m) => m.produce)).toEqual(["U"]);
      let t = scenario({ p1: { hand: [SINK] } });
      t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", SINK) });
      expect(t.objects[t.battlefield[0] as string]?.tapped).toBe(true);
      expect(t.players.p1?.life).toBe(20);
    });

    it("Black Market Connections: at your first main phase, one or more modes", () => {
      let s = scenario({ step: "upkeep", p1: { battlefield: ["Black Market Connections"], library: lands("Swamp", 5) } });
      s = advanceUntil(s, (x) => x.pending?.kind === "choice");
      expect(s.turn.step).toBe("main1");
      s = settle(s, modeNamed("Treasure, 1 life + Draw, 2 life + 3/2 Shapeshifter, 3 life"));
      expect(s.players.p1?.life).toBe(14);
      expect(tokens(s, "p1", "Treasure")).toHaveLength(1);
      const shifter = tokens(s, "p1", "Shapeshifter")[0] as string;
      expect([chars(s, shifter).power, chars(s, shifter).toughness]).toEqual([3, 2]);
      expect(chars(s, shifter).keywords).toContain("changeling");
      // One card from the draw step, one from the mode.
      expect(s.players.p1?.hand).toHaveLength(2);
    });
  });

  describe("artifacts and enchantments", () => {
    it("Skullclamp: +1/-1 ; the equipped creature dies, draw two cards", () => {
      let s = scenario({ p1: { battlefield: ["Skullclamp", "Llanowar Elves", "Mountain"] } });
      const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Skullclamp"), { t: [elves] }));
      expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Phyrexian Altar: sacrifice a creature, one mana of any color", () => {
      let s = scenario({ p1: { battlefield: ["Phyrexian Altar", "Bear Cub"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Phyrexian Altar")));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      const pool: Record<string, number> = s.players.p1?.manaPool ?? {};
      expect(Object.values(pool).reduce((a, b) => a + b, 0)).toBe(1);
    });

    it("Herald's Horn: your creature spells of the chosen type cost {1} less; at upkeep, the top card into hand", () => {
      let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Herald's Horn"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Herald's Horn") }), () => ["Vampire"]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Herald's Horn")]?.chosen).toMatchObject({ creatureType: "Vampire" });
      // Two Swamps suffice for Vampire Nighthawk ({1}{B}{B}), not for Bear Cub ({1}{G}) which is not a Vampire.
      let t = scenario({
        p1: {
          battlefield: ["Herald's Horn", ...lands("Swamp", 2)],
          hand: ["Vampire Nighthawk"],
          library: ["Vampire of the Dire Moon", "Forest"],
        },
      });
      const horn = t.objects[idOf(t, "p1", "battlefield", "Herald's Horn")];
      if (horn) horn.chosen = { creatureType: "Vampire" };
      bump(t);
      t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Vampire Nighthawk") }));
      expect(idsOf(t, "p1", "battlefield", "Vampire Nighthawk")).toHaveLength(1);
      t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "upkeep" && x.turn.number > 3);
      t = settle(t, (req) => (req.type === "pick" ? req.options.slice(0, 1) : undefined));
      expect(handNames(t, "p1")).toContain("Vampire of the Dire Moon");
    });

    it("Vanquisher's Banner: your creatures of the chosen type +1/+1; a spell of that type cast, draw a card", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 6), "Vampire Nighthawk", "Bear Cub"],
          hand: ["Vanquisher's Banner", "Vampire of the Dire Moon"],
        },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vanquisher's Banner") }), () => ["Vampire"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Vampire Nighthawk")).power).toBe(3);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") }));
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Anointed Procession: twice as many tokens created by an effect under your control", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Anointed Procession"], hand: ["Dragon Fodder"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dragon Fodder") }));
      expect(tokens(s, "p1", "Goblin")).toHaveLength(4);
    });

    it("Anointed Procession and Edgar Markov's eminence: two Vampires per Vampire spell", () => {
      let s = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Swamp", "Anointed Procession"], hand: ["Vampire of the Dire Moon"] },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Vampire of the Dire Moon") }));
      expect(tokens(s, "p1", "Vampire")).toHaveLength(2);
    });

    it("Exquisite Blood: an opponent loses life, you gain as much", () => {
      let s = scenario({ p1: { battlefield: ["Exquisite Blood"], hand: [DRAIN] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DRAIN.name) }));
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Exquisite Blood and Sanguine Bond: the loop stops when the opponent loses the game", () => {
      let s = scenario({
        p1: { battlefield: ["Exquisite Blood", "Sanguine Bond", "Forest"], hand: ["Sami's Curiosity"] },
        p2: { life: 7 },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sami's Curiosity") }));
      expect(s.players.p2?.lost).toBe(true);
      expect(s.winner).toBe("p1");
    });

    it("Exquisite Blood and Sanguine Bond with three players: the loop moves on to the next opponent until the win", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Exquisite Blood", "Sanguine Bond", "Forest"], hand: ["Sami's Curiosity"] },
        p2: { life: 4 },
        p3: { life: 5 },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sami's Curiosity") }));
      expect(s.players.p2?.lost).toBe(true);
      expect(s.players.p3?.lost).toBe(true);
      expect(s.winner).toBe("p1");
    });

    it("Blade of the Bloodchief: a creature dies, a +1/+1 counter on the equipped creature, two on a Vampire", () => {
      for (const [host, n] of [
        ["Bear Cub", 1],
        ["Vampire Nighthawk", 2],
      ] as const) {
        let s = scenario({
          p1: { battlefield: ["Blade of the Bloodchief", host, ...lands("Mountain", 2)], hand: ["Shock"] },
          p2: { battlefield: ["Llanowar Elves"] },
        });
        const h = idOf(s, "p1", "battlefield", host);
        s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Blade of the Bloodchief"), { t: [h] }));
        s = settle(
          act(s, "p1", {
            type: "cast",
            card: idOf(s, "p1", "hand", "Shock"),
            targets: { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] },
          }),
        );
        expect(s.objects[h]?.counters["+1/+1"]).toBe(n);
      }
    });
  });
});
