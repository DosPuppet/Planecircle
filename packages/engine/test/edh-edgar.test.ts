/**
 * Commander (EDH pseudo-set, PLAN-E, E10): rules tests for the Vampires of Edgar Markov's deck, from their Oracle
 * text (creatures, New Blood, Olivia's Wrath, Pact of the Serpent, Sorin, Imperious Bloodlord), and for the city's blessing.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { castOption } from "../src/cardDef";
import { chars } from "../src/layers";
import { legalActions } from "../src/legal";
import type { GameState, PlayerId } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  cast,
  castable,
  castTargets,
  idOf,
  idsOf,
  lands,
  nameOf,
  picking,
  pickNamed,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
} from "./helpers";

type S = GameState;
const DIRE_MOON = "Vampire of the Dire Moon";
const KEEPER = "Bloodline Keeper // Lord of Lineage";
const GROOM = "Edgar, Charmed Groom // Edgar Markov's Coffin";

/** Activates the ability of `source` whose label contains `label`. */
const activateLabel = (s: S, player: PlayerId, source: string, label: string, extra: object = {}) => {
  const a = legalActions(s, player).find((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
  if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const hasActivation = (s: S, player: PlayerId, source: string, label: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source && x.label?.includes(label));
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
const tokensOf = (s: S, player: PlayerId) =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === player);
const life = (s: S, p: PlayerId) => s.players[p]?.life;
const handSize = (s: S, p: PlayerId) => s.players[p]?.hand.length ?? 0;
/** "You may": no. */
const sayNo: Answer = (req) => (req.intent === "may" ? [0] : undefined);
/** "You may": yes; for targets and object choices, `want` if it is among the options. */
const yesPicking =
  (want: string[]): Answer =>
  (req) =>
    req.intent === "may" ? [1] : picking(want)(req);
/** Moves the game to the start of p1's next main phase (upkeep and draw resolved). */
const toNextMain = (s: S) => {
  const turn = s.turn.number;
  return advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > turn);
};

describe("Commander (EDH): Edgar Markov's Vampires", () => {
  describe("aristocrats: sacrifices and deaths", () => {
    it("Viscera Seer sacrifices Blood Artist itself: it triggers (the targeted player loses 1 life, you gain 1), then scry 1", () => {
      let s = scenario({ p1: { battlefield: ["Blood Artist", "Viscera Seer"] } });
      const artist = idOf(s, "p1", "battlefield", "Blood Artist");
      s = activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Viscera Seer"), "scry", { sacrifice: [artist] });
      s = settle(s, picking(["p2"]));
      expect(idsOf(s, "p1", "graveyard", "Blood Artist")).toHaveLength(1);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
    });

    it("Blood Artist: the death of an opposing creature triggers it too", () => {
      let s = scenario({
        p1: { battlefield: ["Blood Artist", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      s = castTargets(s, "p1", "Shock", { t: [idOf(s, "p2", "battlefield", "Savannah Lions")] });
      s = settle(s, picking(["p2"]));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
    });

    it("Cordial Vampire: a creature dies, a +1/+1 counter on each Vampire you control (not the others)", () => {
      let s = scenario({
        p1: { battlefield: ["Cordial Vampire", "Viscera Seer", "Savannah Lions", "Llanowar Elves"] },
        p2: { battlefield: [DIRE_MOON] },
      });
      s = activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Viscera Seer"), "scry", {
        sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")],
      });
      s = settle(s);
      expect(s.objects[idOf(s, "p1", "battlefield", "Cordial Vampire")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Viscera Seer")]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", "Llanowar Elves")]?.counters["+1/+1"] ?? 0).toBe(0);
      expect(s.objects[idOf(s, "p2", "battlefield", DIRE_MOON)]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Cruel Celebrant: one of your creatures dies, each opponent loses 1 life and you gain 1; an opposing creature, nothing", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Cruel Celebrant", "Viscera Seer", "Savannah Lions", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      s = activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Viscera Seer"), "scry", {
        sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")],
      });
      s = settle(s);
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([21, 19, 19]);
      s = castTargets(s, "p1", "Shock", { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] });
      s = settle(s);
      expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([21, 19, 19]);
    });

    it("Indulgent Aristocrat: {2}, sacrifice a creature (itself included): a +1/+1 counter on each Vampire", () => {
      let s = scenario({ p1: { battlefield: ["Indulgent Aristocrat", DIRE_MOON, "Savannah Lions", ...lands("Plains", 2)] } });
      const aristocrat = idOf(s, "p1", "battlefield", "Indulgent Aristocrat");
      s = activateLabel(s, "p1", aristocrat, "+1/+1 on each", { sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")] });
      s = settle(s);
      expect(s.objects[aristocrat]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[idOf(s, "p1", "battlefield", DIRE_MOON)]?.counters["+1/+1"]).toBe(1);
      expect(card("Indulgent Aristocrat").keywords).toContain("lifelink");
    });

    it("Elenda: +1/+1 for each other creature that dies; when it dies, as many 1/1 white Vampire tokens with lifelink as its power", () => {
      let s = scenario({ p1: { battlefield: ["Elenda, the Dusk Rose", "Viscera Seer", "Savannah Lions"] } });
      const elenda = idOf(s, "p1", "battlefield", "Elenda, the Dusk Rose");
      const seer = idOf(s, "p1", "battlefield", "Viscera Seer");
      s = settle(activateLabel(s, "p1", seer, "scry", { sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")] }));
      expect(pt(s, elenda)).toEqual([2, 2]);
      s = settle(activateLabel(s, "p1", seer, "scry", { sacrifice: [elenda] }));
      const tokens = tokensOf(s, "p1");
      expect(tokens).toHaveLength(2);
      expect(chars(s, tokens[0] as string).colors).toEqual(["W"]);
      expect(chars(s, tokens[0] as string).keywords).toContain("lifelink");
    });

    it("Yahenni: +1/+1 when an opposing creature dies (not yours); sacrifice another creature: indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Yahenni, Undying Partisan", "Savannah Lions", "Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const yahenni = idOf(s, "p1", "battlefield", "Yahenni, Undying Partisan");
      s = settle(castTargets(s, "p1", "Shock", { t: [idOf(s, "p2", "battlefield", "Llanowar Elves")] }));
      expect(s.objects[yahenni]?.counters["+1/+1"]).toBe(1);
      s = settle(
        activateLabel(s, "p1", yahenni, "indestructible", { sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")] }),
      );
      expect(s.objects[yahenni]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, yahenni).keywords).toContain("indestructible");
      // "Another creature": Yahenni cannot sacrifice itself.
      expect(hasActivation(s, "p1", yahenni, "indestructible")).toBe(false);
    });
  });

  describe("lords and big abilities", () => {
    it("Legion Lieutenant, Markov Baron, Stromkirk Captain, Edgar, Charmed Groom: +1/+1 to your other Vampires only; the Captain's initiative", () => {
      const s = scenario({
        p1: { battlefield: ["Legion Lieutenant", "Markov Baron", "Stromkirk Captain", GROOM, DIRE_MOON, "Savannah Lions"] },
        p2: { battlefield: [DIRE_MOON] },
      });
      const moon = idOf(s, "p1", "battlefield", DIRE_MOON);
      expect(pt(s, moon)).toEqual([5, 5]);
      expect(chars(s, moon).keywords).toContain("firstStrike");
      // Each gets the bonus from the other three.
      expect(pt(s, idOf(s, "p1", "battlefield", "Legion Lieutenant"))).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
      expect(pt(s, idOf(s, "p2", "battlefield", DIRE_MOON))).toEqual([1, 1]);
      expect(card("Markov Baron").keywords).toEqual(expect.arrayContaining(["convoke", "lifelink"]));
      expect(castOption(card("Markov Baron"), "madness")).toBeDefined();
    });

    it("Bloodline Keeper: {T} creates a 2/2 flying Vampire; {B}: transform only with five Vampires; Lord of Lineage gives +2/+2", () => {
      let s = scenario({ p1: { battlefield: [KEEPER, "Swamp", DIRE_MOON] } });
      const keeper = idOf(s, "p1", "battlefield", KEEPER);
      s = settle(activateLabel(s, "p1", keeper, "token"));
      const token = tokensOf(s, "p1")[0] as string;
      expect(pt(s, token)).toEqual([2, 2]);
      expect(chars(s, token).keywords).toContain("flying");
      expect(chars(s, token).subtypes).toEqual(["Vampire"]);
      // Three Vampires: no transformation.
      expect(hasActivation(s, "p1", keeper, "Transform")).toBe(false);

      s = scenario({ p1: { battlefield: [KEEPER, "Swamp", ...Array(4).fill(DIRE_MOON)] } });
      const keeper2 = idOf(s, "p1", "battlefield", KEEPER);
      s = settle(activateLabel(s, "p1", keeper2, "Transform"));
      expect(chars(s, keeper2).name).toBe("Lord of Lineage");
      expect(pt(s, keeper2)).toEqual([5, 5]);
      expect(pt(s, idOf(s, "p1", "battlefield", DIRE_MOON))).toEqual([3, 3]);
      // The back face also has "{T}: Create a 2/2 black Vampire creature token with flying."
      expect(hasActivation(s, "p1", keeper2, "token")).toBe(true);
    });

    it("Captivating Vampire: +1/+1 to other Vampires; tap five Vampires (itself included, even if it came this turn): gain control of the targeted creature, which becomes a Vampire", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Captivating Vampire", sick: true }, ...Array(4).fill(DIRE_MOON)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const captivating = idOf(s, "p1", "battlefield", "Captivating Vampire");
      expect(pt(s, idOf(s, "p1", "battlefield", DIRE_MOON))).toEqual([2, 2]);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(activateLabel(s, "p1", captivating, "gain control", { targets: { t: [lions] } }));
      expect(s.objects[lions]?.controller).toBe("p1");
      expect(chars(s, lions).subtypes).toContain("Vampire");
      // Now a Vampire, it gets the +1/+1.
      expect(pt(s, lions)).toEqual([3, 2]);
      expect(idsOf(s, "p1", "battlefield", DIRE_MOON).every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(s.objects[captivating]?.tapped).toBe(true);
    });

    it("Captivating Vampire: no activation with only four untapped Vampires", () => {
      const s = scenario({
        p1: { battlefield: ["Captivating Vampire", ...Array(3).fill(DIRE_MOON), { name: DIRE_MOON, tapped: true }] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      expect(hasActivation(s, "p1", idOf(s, "p1", "battlefield", "Captivating Vampire"), "gain control")).toBe(false);
    });

    it("Knight of the Ebon Legion: {2}{B} +3/+3 and deathtouch; at your end step, +1/+1 if a player lost 4 or more life this turn", () => {
      let s = scenario({ p1: { battlefield: ["Knight of the Ebon Legion", ...lands("Swamp", 3)] } });
      const knight = idOf(s, "p1", "battlefield", "Knight of the Ebon Legion");
      s = settle(activateLabel(s, "p1", knight, "+3/+3"));
      expect(pt(s, knight)).toEqual([4, 5]);
      expect(chars(s, knight).keywords).toContain("deathtouch");
      s = throughCombat(attack(s, [knight]));
      expect(life(s, "p2")).toBe(16);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[knight]?.counters["+1/+1"]).toBe(1);
    });

    it("Knight of the Ebon Legion: no counter if nobody lost 4 life", () => {
      let s = scenario({ p1: { battlefield: ["Knight of the Ebon Legion"] } });
      const knight = idOf(s, "p1", "battlefield", "Knight of the Ebon Legion");
      s = throughCombat(attack(s, [knight]));
      expect(life(s, "p2")).toBe(19);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(s.objects[knight]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Master of Dark Rites: {T}, sacrifice another creature: {B}{B}{B} for Vampire, Cleric or Demon spells only", () => {
      let s = scenario({
        p1: { battlefield: ["Master of Dark Rites", "Savannah Lions"], hand: [DIRE_MOON, "Murder"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      const master = idOf(s, "p1", "battlefield", "Master of Dark Rites");
      expect(castable(s, "p1", idOf(s, "p1", "hand", DIRE_MOON))).toBe(false);
      // A mana ability (605.1a): resolved at once.
      s = activateLabel(s, "p1", master, "{B}{B}{B}", { sacrifice: [idOf(s, "p1", "battlefield", "Savannah Lions")] });
      expect(s.players.p1?.restrictedMana?.map((m) => m.type)).toEqual(["B", "B", "B"]);
      expect(castable(s, "p1", idOf(s, "p1", "hand", DIRE_MOON))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Murder"))).toBe(false);
    });

    it("Vito: when you gain life, the targeted opponent loses that much; {3}{B}{B}: your creatures gain lifelink", () => {
      let s = scenario({ p1: { battlefield: ["Vito, Thorn of the Dusk Rose", ...lands("Swamp", 5)] } });
      const vito = idOf(s, "p1", "battlefield", "Vito, Thorn of the Dusk Rose");
      s = settle(activateLabel(s, "p1", vito, "lifelink"));
      expect(chars(s, vito).keywords).toContain("lifelink");
      s = throughCombat(attack(s, [vito]), picking(["p2"]));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 18]);
    });

    it("Sorin, Imperious Bloodlord: +1 deathtouch and lifelink, and a counter if it is a Vampire (not otherwise)", () => {
      let s = scenario({ p1: { battlefield: ["Sorin, Imperious Bloodlord", DIRE_MOON, "Savannah Lions"] } });
      const sorin = idOf(s, "p1", "battlefield", "Sorin, Imperious Bloodlord");
      const moon = idOf(s, "p1", "battlefield", DIRE_MOON);
      s = settle(activateLabel(s, "p1", sorin, "Deathtouch", { targets: { t: [moon] } }));
      expect(s.objects[moon]?.counters["+1/+1"]).toBe(1);
      expect(s.objects[sorin]?.counters.loyalty).toBe(5);
      let t = scenario({ p1: { battlefield: ["Sorin, Imperious Bloodlord", "Savannah Lions"] } });
      const lions = idOf(t, "p1", "battlefield", "Savannah Lions");
      t = settle(
        activateLabel(t, "p1", idOf(t, "p1", "battlefield", "Sorin, Imperious Bloodlord"), "Deathtouch", {
          targets: { t: [lions] },
        }),
      );
      expect(chars(t, lions).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      expect(t.objects[lions]?.counters["+1/+1"] ?? 0).toBe(0);
    });

    it("Sorin: +1 sacrifice a Vampire, when you do 3 damage to any target and 3 life; −3 a Vampire from hand", () => {
      let s = scenario({ p1: { battlefield: ["Sorin, Imperious Bloodlord", DIRE_MOON], hand: ["Malakir Bloodwitch"] } });
      const sorin = idOf(s, "p1", "battlefield", "Sorin, Imperious Bloodlord");
      s = settle(activateLabel(s, "p1", sorin, "3 damage"), yesPicking(["p2", idOf(s, "p1", "battlefield", DIRE_MOON)]));
      expect(idsOf(s, "p1", "graveyard", DIRE_MOON)).toHaveLength(1);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([23, 17]);
      let t = scenario({ p1: { battlefield: ["Sorin, Imperious Bloodlord"], hand: ["Malakir Bloodwitch", "Savannah Lions"] } });
      const offered: (string | undefined)[][] = [];
      t = settle(
        activateLabel(t, "p1", idOf(t, "p1", "battlefield", "Sorin, Imperious Bloodlord"), "Put a Vampire"),
        (req, _p, cur) => {
          if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
          offered.push(req.options.map((id) => nameOf(cur, id)));
          return pickNamed(cur, req, "Malakir Bloodwitch");
        },
      );
      // Only Vampire creature cards are offered.
      expect(offered[0]).toEqual(["Malakir Bloodwitch"]);
      expect(idsOf(t, "p1", "battlefield", "Malakir Bloodwitch")).toHaveLength(1);
      expect(idsOf(t, "p1", "hand", "Savannah Lions")).toHaveLength(1);
      // The Bloodwitch's arrival triggers: a Vampire, each opponent loses 1 life.
      expect(life(t, "p2")).toBe(19);
    });
  });

  describe("enters", () => {
    it("Champion of Dusk: draw X cards and lose X life, X being the number of Vampires you control (itself included)", () => {
      let s = scenario({ p1: { battlefield: [...Array(3).fill(DIRE_MOON), ...lands("Swamp", 5)], hand: ["Champion of Dusk"] } });
      s = settle(cast(s, "p1", "Champion of Dusk"));
      expect(handSize(s, "p1")).toBe(4);
      expect(life(s, "p1")).toBe(16);
    });

    it("Malakir Bloodwitch: each opponent loses 1 life per Vampire you control; you gain the total lost; protection from white", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: [DIRE_MOON, DIRE_MOON, ...lands("Swamp", 5)], hand: ["Malakir Bloodwitch"] },
      });
      s = settle(cast(s, "p1", "Malakir Bloodwitch"));
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([26, 17, 17]);
      const witch = idOf(s, "p1", "battlefield", "Malakir Bloodwitch");
      expect(chars(s, witch).protections.map((p) => p.from)).toEqual([{ colors: ["W"] }]);
      expect(chars(s, witch).keywords).toContain("flying");
    });

    it("Forerunner of the Legion: search for a Vampire, put on top of the library; another Vampire enters: +1/+1 to the targeted creature", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Plains", 3),
          hand: ["Forerunner of the Legion"],
          library: ["Forest", "Forest", DIRE_MOON, "Forest"],
        },
      });
      s = settle(cast(s, "p1", "Forerunner of the Legion"), (req, _p, cur) =>
        req.intent === "may" ? [1] : pickNamed(cur, req, DIRE_MOON),
      );
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe(DIRE_MOON);

      let t = scenario({ p1: { battlefield: ["Forerunner of the Legion", "Swamp"], hand: [DIRE_MOON] } });
      const forerunner = idOf(t, "p1", "battlefield", "Forerunner of the Legion");
      t = settle(cast(t, "p1", DIRE_MOON), picking([forerunner]));
      expect(pt(t, forerunner)).toEqual([3, 3]);
    });

    it("Forerunner of the Legion: you may choose not to search (the library stays in order)", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Forerunner of the Legion"], library: ["Forest", DIRE_MOON] },
      });
      s = settle(cast(s, "p1", "Forerunner of the Legion"), sayNo);
      expect(nameOf(s, s.players.p1?.library[0] ?? "")).toBe("Forest");
    });

    it("Vampire Socialite: if an opponent lost life this turn, +1/+1 on each other Vampire, and your other Vampires enter with an additional counter", () => {
      let s = scenario({
        p1: {
          battlefield: [DIRE_MOON, "Mountain", "Mountain", "Swamp", "Swamp"],
          hand: ["Shock", "Vampire Socialite", DIRE_MOON],
        },
      });
      const first = idOf(s, "p1", "battlefield", DIRE_MOON);
      s = settle(castTargets(s, "p1", "Shock", { t: ["p2"] }));
      s = settle(cast(s, "p1", "Vampire Socialite"));
      expect(s.objects[first]?.counters["+1/+1"]).toBe(1);
      const socialite = idOf(s, "p1", "battlefield", "Vampire Socialite");
      expect(s.objects[socialite]?.counters["+1/+1"] ?? 0).toBe(0);
      s = settle(cast(s, "p1", DIRE_MOON));
      const second = idsOf(s, "p1", "battlefield", DIRE_MOON).find((id) => id !== first) as string;
      expect(s.objects[second]?.counters["+1/+1"]).toBe(1);
    });

    it("Vampire Socialite: with no opposing life loss this turn, neither a counter on entering nor an additional counter", () => {
      let s = scenario({
        p1: { battlefield: [DIRE_MOON, "Mountain", "Swamp", "Swamp"], hand: ["Vampire Socialite", DIRE_MOON] },
      });
      s = settle(cast(s, "p1", "Vampire Socialite"));
      s = settle(cast(s, "p1", DIRE_MOON));
      expect(idsOf(s, "p1", "battlefield", DIRE_MOON).map((id) => s.objects[id]?.counters["+1/+1"] ?? 0)).toEqual([0, 0]);
      expect(card("Vampire Socialite").keywords).toContain("menace");
    });

    it("Welcoming Vampire: creatures with power 2 or less enter under your control: draw, once each turn", () => {
      let s = scenario({ p1: { battlefield: ["Welcoming Vampire", ...lands("Swamp", 2)], hand: [DIRE_MOON, DIRE_MOON] } });
      s = settle(cast(s, "p1", DIRE_MOON));
      expect(handSize(s, "p1")).toBe(2);
      s = settle(cast(s, "p1", DIRE_MOON));
      expect(handSize(s, "p1")).toBe(1);
    });

    it("Charismatic Conqueror: an opposing artifact or creature enters untapped; if it is not tapped, you create a 1/1 white Vampire with lifelink", () => {
      const start = () =>
        scenario({
          active: "p2",
          p1: { battlefield: ["Charismatic Conqueror"] },
          p2: { battlefield: ["Plains"], hand: ["Savannah Lions"] },
        });
      let s = settle(cast(start(), "p2", "Savannah Lions"), sayNo);
      expect(s.objects[idOf(s, "p2", "battlefield", "Savannah Lions")]?.tapped).toBe(false);
      const token = tokensOf(s, "p1")[0] as string;
      expect(chars(s, token).keywords).toContain("lifelink");
      expect(chars(s, token).colors).toEqual(["W"]);

      s = settle(cast(start(), "p2", "Savannah Lions"), (req) => (req.intent === "may" ? [1] : undefined));
      expect(s.objects[idOf(s, "p2", "battlefield", "Savannah Lions")]?.tapped).toBe(true);
      expect(tokensOf(s, "p1")).toEqual([]);
    });
  });

  describe("attacks", () => {
    it("Drana: dealing damage to a player (first strike), a +1/+1 counter on each attacking creature, before regular damage", () => {
      let s = scenario({ p1: { battlefield: ["Drana, Liberator of Malakir", "Savannah Lions"] } });
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Drana, Liberator of Malakir"), lions]));
      expect(s.objects[lions]?.counters["+1/+1"]).toBe(1);
      // Drana 2 (first strike), then the 3/2 Lions.
      expect(life(s, "p2")).toBe(15);
    });

    it("Mavren Fein: nontoken Vampires attack: a single 1/1 white Vampire with lifelink", () => {
      let s = scenario({ p1: { battlefield: ["Mavren Fein, Dusk Apostle", DIRE_MOON, "Savannah Lions"] } });
      s = settleNoBlocks(
        attack(s, [idOf(s, "p1", "battlefield", "Mavren Fein, Dusk Apostle"), idOf(s, "p1", "battlefield", DIRE_MOON)]),
      );
      expect(tokensOf(s, "p1")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Mavren Fein, Dusk Apostle", "Savannah Lions"] } });
      t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Savannah Lions")]));
      expect(tokensOf(t, "p1")).toEqual([]);
    });

    it("Sanctum Seeker: each Vampire that attacks: each opponent loses 1 life and you gain 1", () => {
      let s = scenario({ p1: { battlefield: ["Sanctum Seeker", "Legion Lieutenant"] } });
      s = throughCombat(
        attack(s, [idOf(s, "p1", "battlefield", "Sanctum Seeker"), idOf(s, "p1", "battlefield", "Legion Lieutenant")]),
      );
      // Drain 2, then 4 + 2 combat damage.
      expect([life(s, "p1"), life(s, "p2")]).toEqual([22, 12]);
    });

    it("Clavileño: when you attack, an attacking non-Demon Vampire becomes a Demon; when it dies, draw and a tapped 4/3 flying Vampire Demon", () => {
      let s = scenario({ p1: { battlefield: ["Clavileño, First of the Blessed", DIRE_MOON, "Mountain"], hand: ["Shock"] } });
      const moon = idOf(s, "p1", "battlefield", DIRE_MOON);
      s = throughCombat(attack(s, [moon]));
      expect(chars(s, moon).subtypes).toEqual(expect.arrayContaining(["Vampire", "Demon"]));
      const hand = handSize(s, "p1");
      s = settle(castTargets(s, "p1", "Shock", { t: [moon] }));
      expect(handSize(s, "p1")).toBe(hand);
      const demon = tokensOf(s, "p1")[0] as string;
      expect(chars(s, demon).name).toBe("Vampire Demon");
      expect(pt(s, demon)).toEqual([4, 3]);
      expect(s.objects[demon]?.tapped).toBe(true);
    });

    it("Clavileño: a Vampire that is already a Demon is not a target", () => {
      let s = scenario({ p1: { battlefield: ["Clavileño, First of the Blessed", "Savannah Lions"] } });
      s = throughCombat(attack(s, [idOf(s, "p1", "battlefield", "Savannah Lions")]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).subtypes).not.toContain("Demon");
    });
  });

  describe("Edgar, Charmed Groom // Edgar Markov's Coffin", () => {
    it("when Edgar dies, it returns transformed; the Coffin creates a 1/1 white and black Vampire with lifelink and takes a bloodline counter", () => {
      let s = scenario({ p1: { battlefield: [GROOM, "Viscera Seer"] } });
      s = settle(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Viscera Seer"), "scry", {
          sacrifice: [idOf(s, "p1", "battlefield", GROOM)],
        }),
      );
      const coffin = idOf(s, "p1", "battlefield", GROOM);
      expect(chars(s, coffin).name).toBe("Edgar Markov's Coffin");
      expect(chars(s, coffin).types).toEqual(["Artifact"]);
      s = toNextMain(s);
      expect(s.objects[coffin]?.counters.bloodline).toBe(1);
      const token = tokensOf(s, "p1")[0] as string;
      expect(chars(s, token).colors).toEqual(["W", "B"]);
      expect(chars(s, token).keywords).toContain("lifelink");
    });

    it("at the third bloodline counter, they are removed and the Coffin transforms into Edgar", () => {
      let s = scenario({ p1: { battlefield: [GROOM, "Viscera Seer"] } });
      s = settle(
        activateLabel(s, "p1", idOf(s, "p1", "battlefield", "Viscera Seer"), "scry", {
          sacrifice: [idOf(s, "p1", "battlefield", GROOM)],
        }),
      );
      const coffin = idOf(s, "p1", "battlefield", GROOM);
      (s.objects[coffin] as { counters: Record<string, number> }).counters.bloodline = 2;
      s = toNextMain(s);
      expect(chars(s, coffin).name).toMatch(/^Edgar, Charmed Groom/);
      expect(s.objects[coffin]?.counters.bloodline ?? 0).toBe(0);
      // Edgar gives +1/+1 to the other Vampires, including the token created at this upkeep.
      expect(pt(s, tokensOf(s, "p1")[0] as string)).toEqual([2, 2]);
    });
  });

  describe("ascend (702.131): Twilight Prophet", () => {
    it("with ten permanents, you get the city's blessing; at your upkeep, the top card to hand and drain of its mana value", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Twilight Prophet", ...lands("Swamp", 9)], library: ["Champion of Dusk", "Forest", "Forest"] },
      });
      expect(card("Twilight Prophet").keywords).toEqual(expect.arrayContaining(["flying", "ascend"]));
      expect(s.players.p1?.designations).toContain("citysBlessing");
      s = toNextMain(s);
      expect(idsOf(s, "p1", "hand", "Champion of Dusk")).toHaveLength(1);
      expect([life(s, "p1"), life(s, "p2"), life(s, "p3")]).toEqual([25, 15, 15]);
    });

    it("with nine permanents, no blessing or drain; the blessing stays after losing permanents", () => {
      let s = scenario({
        p1: { battlefield: ["Twilight Prophet", ...lands("Swamp", 8)], library: ["Champion of Dusk", "Forest"] },
      });
      expect(s.players.p1?.designations ?? []).not.toContain("citysBlessing");
      s = toNextMain(s);
      expect(life(s, "p2")).toBe(20);

      let t = scenario({
        p1: { battlefield: ["Twilight Prophet", "Viscera Seer", ...lands("Swamp", 8)], library: ["Champion of Dusk", "Forest"] },
      });
      expect(t.players.p1?.designations).toContain("citysBlessing");
      const seer = idOf(t, "p1", "battlefield", "Viscera Seer");
      t = settle(activateLabel(t, "p1", seer, "scry", { sacrifice: [seer] }));
      t = toNextMain(t);
      expect(t.players.p1?.designations).toContain("citysBlessing");
      expect(life(t, "p2")).toBe(15);
    });
  });

  describe("spells", () => {
    it("New Blood: as an additional cost, tap an untapped Vampire; gain control of the targeted creature, which becomes a Vampire (approximation of the text change)", () => {
      let s = scenario({
        p1: { battlefield: [DIRE_MOON, ...lands("Swamp", 4)], hand: ["New Blood"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = settle(castTargets(s, "p1", "New Blood", { t: [lions] }));
      expect(s.objects[lions]?.controller).toBe("p1");
      expect(chars(s, lions).subtypes).toContain("Vampire");
      expect(s.objects[idOf(s, "p1", "battlefield", DIRE_MOON)]?.tapped).toBe(true);
    });

    it("New Blood: without an untapped Vampire, no casting", () => {
      const s = scenario({
        p1: { battlefield: [{ name: DIRE_MOON, tapped: true }, ...lands("Swamp", 4)], hand: ["New Blood"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "New Blood"))).toBe(false);
    });

    it("Olivia's Wrath: each non-Vampire creature gets −X/−X, X being the number of Vampires you control", () => {
      let s = scenario({
        p1: { battlefield: [DIRE_MOON, DIRE_MOON, "Savannah Lions", ...lands("Swamp", 5)], hand: ["Olivia's Wrath"] },
        p2: { battlefield: [DIRE_MOON, "Llanowar Elves", "Charismatic Conqueror"] },
      });
      s = settle(cast(s, "p1", "Olivia's Wrath"));
      expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toEqual([]);
      expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toEqual([]);
      expect(idsOf(s, "p1", "battlefield", DIRE_MOON)).toHaveLength(2);
      expect(idsOf(s, "p2", "battlefield", DIRE_MOON)).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Charismatic Conqueror")).toHaveLength(1);
    });

    it("Pact of the Serpent: choose a type; the targeted player draws X cards and loses X life (its creatures of that type)", () => {
      let s = scenario({
        p1: { battlefield: [DIRE_MOON, ...lands("Swamp", 3)], hand: ["Pact of the Serpent"] },
        p2: { battlefield: [DIRE_MOON, DIRE_MOON, "Savannah Lions"] },
      });
      const hand = handSize(s, "p2");
      s = settle(castTargets(s, "p1", "Pact of the Serpent", { t: ["p2"] }), (req) =>
        req.type === "pick" && req.options.includes("Vampire") ? ["Vampire"] : undefined,
      );
      expect(handSize(s, "p2")).toBe(hand + 2);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([20, 18]);
    });
  });
});
