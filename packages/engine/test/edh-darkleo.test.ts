/**
 * Commander (EDH pseudo-set): rules tests of the "I Am Ninja, Sneaking in the Shadows" deck (Dark Leo &
 * Shredder, white and black). Ninjutsu and Ninjas, unblockable attackers, fear, copies (Helm of the Host, Legion Loyalty,
 * Strionic Resonator), life loss, lands.
 */
import { describe, expect, it } from "vitest";
import { bump, chars } from "../src/layers";
import { legalActions } from "../src/legal";
import { matchesObjectFilter } from "../src/targets";
import { canBlock } from "../src/turn";
import type { ActionOption, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  attackPlayer,
  castable,
  idOf,
  idsOf,
  lands,
  nameOf,
  namesIn,
  passAccepting,
  picking,
  scenario,
  settle,
  settleNoBlocks,
  throughCombat,
} from "./helpers";

type S = GameState;
/** Makes an object a commander (already on the battlefield). */
function makeCommander(s: S, id: ObjectId): S {
  const o = s.objects[id];
  if (!o) throw new Error("objet introuvable");
  s.commander ??= { cards: {} };
  s.commander.cards[o.uid] = { owner: o.owner, defId: o.defId, casts: 0, damage: {} };
  bump(s);
  return s;
}
const castIt = (s: S, p: PlayerId, name: string, extra: object = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra } as never);
const activations = (s: S, p: PlayerId, source: ObjectId) =>
  legalActions(s, p).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );
/** Activates the ability whose label starts this way. */
const activateLabeled = (s: S, p: PlayerId, source: ObjectId, prefix: string, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => a.label?.startsWith(prefix));
  if (!o) throw new Error(`no ability "${prefix}" for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
const tapMana = (s: S, name: string, color?: string, player: PlayerId = "p1") => {
  const source = idOf(s, player, "battlefield", name);
  const o = legalActions(s, player).find((a) => a.type === "tapForMana" && a.source === source);
  if (o?.type !== "tapForMana") throw new Error(`no mana for ${name}`);
  return act(s, player, { type: "tapForMana", source, ability: o.ability, ...(color ? { color } : {}) } as never);
};
const tokens = (s: S, name: string, p: PlayerId = "p1") =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
const handNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const defenderOf = (s: S, id: string) => s.combat?.attackers.find((a) => a.id === id)?.defender;

/** Declares the attackers, nobody blocks, then the active player's priority in the declare blockers step. */
function attackNoBlocks(s: S, attacks: { id: string; defender: string }[]): S {
  let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
  cur = act(cur, "p1", { type: "declareAttackers", attackers: attacks });
  for (
    let i = 0;
    i < 40 && !(cur.turn.step === "declareBlockers" && cur.pending?.kind === "priority" && !cur.stack.length);
    i++
  ) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: p.request.suggested });
    else break;
  }
  return cur;
}
/** Ninjutsu of the named card (p1's hand) returning `returned`; the stack resolves. */
function ninjutsu(s: S, ninja: string, returned: string): S {
  const card = idOf(s, "p1", "hand", ninja);
  const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === card);
  if (o?.type !== "activate") throw new Error(`no ninjutsu for ${ninja}`);
  const cur = act(s, "p1", {
    type: "activate",
    source: card,
    ability: o.ability,
    targets: {},
    picks: { returnAttacker: [returned] },
  });
  return passAccepting(cur, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
}
/** Goes to the second main phase (combat damage) answering the choices. */
const finishCombat = (s: S, answer?: Parameters<typeof throughCombat>[1]) => throughCombat(s, answer);

describe("Dark Leo & Shredder (EDH)", () => {
  describe("Ninjas", () => {
    it("Nezumi Prowler: ninjutsu {1}{B}; when it enters, a creature you control gains deathtouch and lifelink", () => {
      let s = scenario({ p1: { battlefield: ["Bear Cub", "Swamp", "Swamp"], hand: ["Nezumi Prowler"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Nezumi Prowler", bear);
      const prowler = idOf(s, "p1", "battlefield", "Nezumi Prowler");
      // Bear Cub returned to hand; the Ninja attacks p2, tapped.
      expect(handNames(s, "p1")).toEqual(["Bear Cub"]);
      expect(s.objects[prowler]?.tapped).toBe(true);
      expect(defenderOf(s, prowler)).toBe("p2");
      expect(chars(s, prowler).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
    });

    it("Okiba-Gang Shinobi: combat damage to a player, they discard two cards", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 4)], hand: ["Okiba-Gang Shinobi"] },
        p2: { hand: ["Shock", "Bear Cub", "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Okiba-Gang Shinobi", bear);
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(2);
    });

    it("Throat Slitter: destroys a nonblack creature of the damaged player (a black one can't be targeted)", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 3)], hand: ["Throat Slitter"] },
        p2: { battlefield: ["Highborn Vampire", "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Throat Slitter", bear);
      // Only legal target: Savannah Lions (Highborn Vampire is black).
      s = finishCombat(s);
      expect(idsOf(s, "p2", "graveyard", "Savannah Lions")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Highborn Vampire")).toHaveLength(1);
    });

    it("Ink-Eyes: a creature card from the damaged player's graveyard enters under your control; {1}{B}: regenerate", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 7)], hand: ["Ink-Eyes, Servant of Oni"] },
        p2: { graveyard: ["Savannah Lions", "Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Ink-Eyes, Servant of Oni", bear);
      s = finishCombat(s, (req) => (req.intent === "may" ? [1] : undefined));
      expect(s.players.p2?.life).toBe(15);
      const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
      expect(s.objects[lions]?.owner).toBe("p2");
      // Regeneration: a shield that prevents the next destruction.
      const inkEyes = idOf(s, "p1", "battlefield", "Ink-Eyes, Servant of Oni");
      s = settle(activateLabeled(s, "p1", inkEyes, "Regenerate"));
      expect(s.objects[inkEyes]?.regenShields).toBe(1);
    });

    it("Nashi: exiles the top card of each library; only one playable spell, paid with life", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Swamp", 4)], hand: ["Nashi, Moon Sage's Scion"], library: ["Savannah Lions"] },
        p2: { library: ["Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attackNoBlocks(s, [{ id: bear, defender: "p2" }]);
      s = ninjutsu(s, "Nashi, Moon Sage's Scion", bear);
      s = finishCombat(s);
      const shock = s.exile.find((id) => nameOf(s, id) === "Shock") as string;
      const lions = s.exile.find((id) => nameOf(s, id) === "Savannah Lions") as string;
      expect(shock && lions).toBeTruthy();
      // No red or white mana: the spells are cast by paying life equal to their mana value.
      expect(castable(s, "p1", shock)).toBe(true);
      expect(castable(s, "p1", lions)).toBe(true);
      const life = s.players.p1?.life ?? 0;
      s = settle(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } } as never));
      expect(s.players.p1?.life).toBe(life - 1);
      expect(s.players.p2?.life).toBe(15);
      // "One of those cards": the other is no longer playable.
      expect(castable(s, "p1", lions)).toBe(false);
    });

    it("Orochi Soul-Reaver: your creatures damage a player: a Treasure, and the top card of their library manifested", () => {
      let s = scenario({
        p1: { battlefield: ["Orochi Soul-Reaver", "Bear Cub"] },
        p2: { library: ["Highborn Vampire", "Forest"] },
      });
      s = attack(s, [idOf(s, "p1", "battlefield", "Orochi Soul-Reaver"), idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(13);
      // Only once for both creatures ("one or more").
      expect(tokens(s, "Treasure")).toHaveLength(1);
      const faceDown = s.battlefield.filter((id) => s.objects[id]?.faceDown);
      expect(faceDown).toHaveLength(1);
      const fd = faceDown[0] as string;
      expect(s.objects[fd]?.controller).toBe("p1");
      expect(s.objects[fd]?.owner).toBe("p2");
      expect(pt(s, fd)).toEqual([2, 2]);
    });

    it("Throatseeker: your unblocked attacking Ninjas have lifelink (not before blockers, not if they're blocked)", () => {
      let s = scenario({
        p1: { battlefield: ["Throatseeker", "Nezumi Prowler", "Okiba-Gang Shinobi"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const seeker = idOf(s, "p1", "battlefield", "Throatseeker");
      const prowler = idOf(s, "p1", "battlefield", "Nezumi Prowler");
      const okiba = idOf(s, "p1", "battlefield", "Okiba-Gang Shinobi");
      s = attack(s, [prowler, okiba]);
      // Blockers not yet declared: none is "unblocked".
      expect(chars(s, prowler).keywords).not.toContain("lifelink");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
      s = act(s, "p2", {
        type: "declareBlockers",
        blocks: [{ blocker: idOf(s, "p2", "battlefield", "Bear Cub"), attacker: okiba }],
      });
      expect(chars(s, prowler).keywords).toContain("lifelink");
      expect(chars(s, okiba).keywords).not.toContain("lifelink");
      expect(chars(s, seeker).keywords).not.toContain("lifelink");
      s = finishCombat(s);
      expect(s.players.p1?.life).toBe(23);
      // Outside combat, no more lifelink.
      expect(chars(s, prowler).keywords).not.toContain("lifelink");
    });
  });

  describe("other creatures", () => {
    it("Archetype of Courage: your creatures have first strike; opponents' lose it and can't gain it", () => {
      let s = scenario({
        p1: { battlefield: ["Archetype of Courage", "Bear Cub"] },
        p2: { battlefield: ["Brazen Collector", "Savannah Lions", "Plains"], hand: ["Interjection"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("firstStrike");
      const collector = idOf(s, "p2", "battlefield", "Brazen Collector");
      expect(chars(s, collector).keywords).not.toContain("firstStrike");
      // Interjection (more recent): +2/+2, but not first strike.
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Interjection", { targets: { t: [lions] } }));
      expect(pt(s, lions)).toEqual([4, 3]);
      expect(chars(s, lions).keywords).not.toContain("firstStrike");
    });

    it("Astarion: Feed, an opponent loses as much as they lost this turn; Friends, you gain as much as you gained", () => {
      const feedFirst = (label: string) => (req: { type: string; intent?: string; labels?: Record<string, string> }) =>
        req.type === "pick" && req.intent === "triggerMode"
          ? Object.entries(req.labels ?? {})
              .filter(([, l]) => l.startsWith(label))
              .map(([k]) => k)
          : undefined;
      let s = scenario({ p1: { battlefield: ["Astarion, the Decadent"] } });
      s = attack(s, [idOf(s, "p1", "battlefield", "Astarion, the Decadent")]);
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p1?.life).toBe(24);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 100);
      s = settle(s, feedFirst("Feed") as never);
      expect(s.players.p2?.life).toBe(12);

      let t = scenario({ p1: { battlefield: ["Astarion, the Decadent"] } });
      t = attack(t, [idOf(t, "p1", "battlefield", "Astarion, the Decadent")]);
      t = finishCombat(t);
      t = advanceUntil(t, (x) => x.turn.step === "end" && x.pending?.kind === "choice", 100);
      t = settle(t, feedFirst("Friends") as never);
      expect(t.players.p1?.life).toBe(28);
    });

    it("Bloodline Pretender: changeling; a +1/+1 counter when another creature of the chosen type enters", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Plains"], hand: ["Bloodline Pretender", "Nezumi Prowler", "Savannah Lions"] },
      });
      s = settle(castIt(s, "p1", "Bloodline Pretender"), picking(["Ninja"]));
      const pretender = idOf(s, "p1", "battlefield", "Bloodline Pretender");
      expect(s.objects[pretender]?.chosen?.creatureType).toBe("Ninja");
      expect(matchesObjectFilter(s, "p1", pretender, { subtype: "Turtle" })).toBe(true);
      s = settle(castIt(s, "p1", "Nezumi Prowler"));
      expect(s.objects[pretender]?.counters["+1/+1"]).toBe(1);
      // Savannah Lions (a Cat): nothing.
      s = settle(castIt(s, "p1", "Savannah Lions"));
      expect(s.objects[pretender]?.counters["+1/+1"]).toBe(1);
    });

    it("Changeling Outcast: can't block or be blocked; all creature types", () => {
      let s = scenario({
        p1: { battlefield: ["Changeling Outcast"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const outcast = idOf(s, "p1", "battlefield", "Changeling Outcast");
      expect(["Ninja", "Rat", "Turtle"].every((t) => matchesObjectFilter(s, "p1", outcast, { subtype: t }))).toBe(true);
      s = attack(s, [outcast]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Bear Cub"), outcast)).toBe(false);
      expect(chars(s, outcast).keywords).toEqual(expect.arrayContaining(["cantBlock", "unblockable"]));
    });

    it("Leonardo, Worldly Warrior: costs {1} less per creature you control; double strike", () => {
      const s = scenario({
        p1: {
          battlefield: ["Bear Cub", "Savannah Lions", "Llanowar Elves", ...lands("Plains", 5)],
          hand: ["Leonardo, Worldly Warrior"],
        },
      });
      const leo = idOf(s, "p1", "hand", "Leonardo, Worldly Warrior");
      // {7}{W} − 3 = {4}{W}: five Plains (Llanowar Elves counts as a creature, no need for its mana).
      expect(castable(s, "p1", leo)).toBe(true);
      const t = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 5)], hand: ["Leonardo, Worldly Warrior"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Leonardo, Worldly Warrior"))).toBe(false);
      const u = settle(castIt(s, "p1", "Leonardo, Worldly Warrior"));
      expect(chars(u, idOf(u, "p1", "battlefield", "Leonardo, Worldly Warrior")).keywords).toContain("doubleStrike");
    });

    it("Mirror Entity: {X}: your creatures have base power and toughness X/X and all creature types", () => {
      let s = scenario({ p1: { battlefield: ["Mirror Entity", "Bear Cub", ...lands("Plains", 4)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Mirror Entity"), "Creatures you control", { x: 4 }));
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(["Bear", "Ninja", "Turtle"].every((t) => matchesObjectFilter(s, "p1", bear, { subtype: t }))).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(pt(s, bear)).toEqual([2, 2]);
    });

    it("Splinter, Aging Champion: destroys up to one tapped creature; when it leaves, you and another player draw", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 3), hand: ["Splinter, Aging Champion"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Savannah Lions"], hand: ["Murder"] },
      });
      const offered: string[][] = [];
      s = settle(castIt(s, "p1", "Splinter, Aging Champion"), (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "triggerTarget") offered.push(namesIn(cur, req.options) as string[]);
        return undefined;
      });
      expect(offered[0]).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const p1Hand = s.players.p1?.hand.length ?? 0;
      const p2Hand = s.players.p2?.hand.length ?? 0;
      // It dies: p1 and p2 draw.
      const splinter = s.objects[idOf(s, "p1", "battlefield", "Splinter, Aging Champion")];
      if (splinter) splinter.damage = 5;
      bump(s);
      s = settle(act(s, "p1", { type: "pass" }));
      expect(s.players.p1?.hand.length).toBe(p1Hand + 1);
      expect(s.players.p2?.hand.length).toBe(p2Hand + 1);
    });
  });

  describe("enchantements", () => {
    it("Cover of Darkness: creatures of the chosen type have fear (blocked only by black or artifact creatures)", () => {
      let s = scenario({
        p1: { battlefield: ["Nezumi Prowler", "Bear Cub", "Swamp", "Swamp"], hand: ["Cover of Darkness"] },
        p2: { battlefield: ["Savannah Lions", "Highborn Vampire"] },
      });
      s = settle(castIt(s, "p1", "Cover of Darkness"), picking(["Ninja"]));
      const prowler = idOf(s, "p1", "battlefield", "Nezumi Prowler");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = attack(s, [prowler, bear]);
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      const vampire = idOf(s, "p2", "battlefield", "Highborn Vampire");
      expect(canBlock(s, lions, prowler)).toBe(false);
      expect(canBlock(s, vampire, prowler)).toBe(true);
      expect(canBlock(s, lions, bear)).toBe(true);
    });

    it("Legion Loyalty: your creatures have myriad (a copy attacks each of the other opponents)", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Legion Loyalty", "Bear Cub"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = settleNoBlocks(s, (req) => (req.type === "pick" ? req.options : undefined));
      const copies = tokens(s, "Bear Cub");
      expect(copies).toHaveLength(1);
      expect(defenderOf(s, copies[0] as string)).toBe("p3");
      s = finishCombat(s);
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p3?.life).toBe(18);
      // Exiled at end of combat.
      expect(tokens(s, "Bear Cub")).toHaveLength(0);
    });

    it("No Mercy: a creature that deals damage to you is destroyed", () => {
      let s = scenario({ p1: { battlefield: ["No Mercy"] }, p2: { battlefield: ["Bear Cub", "Savannah Lions"] }, active: "p2" });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: bear, defender: "p1" }] });
      s = finishCombat(s);
      expect(s.players.p1?.life).toBe(18);
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Savannah Lions")).toHaveLength(1);
    });

    it("Wound Reflection: at each end step, each opponent loses as much as they lost this turn", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Wound Reflection", "Bear Cub"] } });
      s = attackPlayer(s, [idOf(s, "p1", "battlefield", "Bear Cub")], "p2");
      s = finishCombat(s);
      s = advanceUntil(s, (x) => x.turn.step === "cleanup" || x.turn.active === "p2", 100);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p3?.life).toBe(20);
    });
  });

  describe("instants and artifacts", () => {
    it("Akroma's Will: one mode; both if you control a commander", () => {
      const modesOf = (s: S) =>
        legalActions(s, "p1")
          .flatMap((a) => (a.type === "cast" && nameOf(s, a.card) === "Akroma's Will" ? a.modes : []))
          .map((m) => m.label);
      let s = scenario({ p1: { battlefield: ["Bear Cub", ...lands("Plains", 4)], hand: ["Akroma's Will"] } });
      expect(modesOf(s)).toHaveLength(2);
      s = makeCommander(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      const labels = modesOf(s);
      expect(labels).toHaveLength(3);
      const both = legalActions(s, "p1")
        .flatMap((a) => (a.type === "cast" && nameOf(s, a.card) === "Akroma's Will" ? a.modes : []))
        .find((m) => m.label?.startsWith("Both"));
      s = settle(castIt(s, "p1", "Akroma's Will", { mode: both?.index }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toEqual(
        expect.arrayContaining(["flying", "vigilance", "doubleStrike", "lifelink", "indestructible"]),
      );
      expect(chars(s, bear).protections.map((p) => p.label)).toContain("Protection from each color");
    });

    it("Helm of the Host: at the beginning of your combat, a nonlegendary copy token of the equipped creature, with haste", () => {
      let s = scenario({ p1: { battlefield: ["Helm of the Host", "Splinter, Aging Champion", ...lands("Plains", 5)] } });
      const splinter = idOf(s, "p1", "battlefield", "Splinter, Aging Champion");
      const helm = idOf(s, "p1", "battlefield", "Helm of the Host");
      s = settle(activateLabeled(s, "p1", helm, "Equip", { targets: { t: [splinter] } }));
      expect(s.objects[helm]?.attachedTo).toBe(splinter);
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.stack.length > 0);
      s = settle(s);
      const copies = tokens(s, "Splinter, Aging Champion");
      expect(copies).toHaveLength(1);
      const copy = copies[0] as string;
      expect(chars(s, copy).supertypes).not.toContain("Legendary");
      expect(chars(s, copy).keywords).toContain("haste");
      // The original stays (no legend rule).
      expect(s.objects[splinter]?.zone).toBe("battlefield");
    });

    it("Sonic Screwdriver: mana of any color; untaps another artifact; scry 1; an unblockable creature", () => {
      let s = scenario({
        p1: { battlefield: ["Sonic Screwdriver", { name: "Sol Ring", tapped: true }, "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const screwdriver = idOf(s, "p1", "battlefield", "Sonic Screwdriver");
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      s = tapMana(s, "Sonic Screwdriver", "B");
      expect(s.players.p1?.manaPool.B).toBe(1);
      s = scenario({
        p1: { battlefield: ["Sonic Screwdriver", { name: "Sol Ring", tapped: true }, "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const sd = idOf(s, "p1", "battlefield", "Sonic Screwdriver");
      const ring2 = idOf(s, "p1", "battlefield", "Sol Ring");
      // "Another artifact": it can't target itself.
      const untap = activations(s, "p1", sd).find((a) => a.label?.startsWith("Untap"));
      expect(untap?.targets[0]?.legal).toEqual([ring2]);
      s = settle(activateLabeled(s, "p1", sd, "Untap", { targets: { t: [ring2] } }));
      expect(s.objects[ring2]?.tapped).toBe(false);
      expect(ring && screwdriver).toBeTruthy();
      // {3}: unblockable this turn (Sol Ring pays {2}).
      let t = scenario({
        p1: { battlefield: ["Sonic Screwdriver", "Bear Cub", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(
        activateLabeled(t, "p1", idOf(t, "p1", "battlefield", "Sonic Screwdriver"), "A creature", { targets: { t: [bear] } }),
      );
      t = attack(t, [bear]);
      expect(canBlock(t, idOf(t, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
    });

    it("Strionic Resonator: copies a triggered ability you control", () => {
      let s = scenario({ p1: { battlefield: ["Strionic Resonator", ...lands("Plains", 5)], hand: ["Inspiring Overseer"] } });
      s = castIt(s, "p1", "Inspiring Overseer");
      s = passAccepting(s, (x) => x.stack.some((i) => i.kind === "ability"));
      const trigger = s.stack.find((i) => i.kind === "ability")?.id as string;
      expect(trigger).toBeTruthy();
      const hand = s.players.p1?.hand.length ?? 0;
      s = settle(
        activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Strionic Resonator"), "Copy", { targets: { t: [trigger] } }),
      );
      expect(s.players.p1?.life).toBe(22);
      expect(s.players.p1?.hand.length).toBe(hand + 2);
    });

    it("Whispersilk Cloak: the equipped creature is unblockable and has shroud", () => {
      let s = scenario({
        p1: { battlefield: ["Whispersilk Cloak", "Bear Cub", ...lands("Plains", 2)] },
        p2: { battlefield: ["Savannah Lions", "Mountain"], hand: ["Shock"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(
        activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Whispersilk Cloak"), "Equip", { targets: { t: [bear] } }),
      );
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["unblockable", "shroud"]));
      s = act(s, "p1", { type: "pass" });
      const shock = legalActions(s, "p2").find((a) => a.type === "cast" && nameOf(s, a.card) === "Shock");
      expect(shock?.type === "cast" && shock.modes[0]?.targets[0]?.legal.includes(bear)).toBe(false);
      expect(shock?.type === "cast" && shock.modes[0]?.targets[0]?.legal.includes("p1")).toBe(true);
    });
  });

  describe("terrains", () => {
    it("Access Tunnel: a creature with power 3 or less can't be blocked this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Access Tunnel", "Bear Cub", "Highborn Vampire", ...lands("Plains", 3)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const tunnel = idOf(s, "p1", "battlefield", "Access Tunnel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const ability = activations(s, "p1", tunnel).find((a) => a.label?.startsWith("A creature"));
      expect(namesIn(s, ability?.targets[0]?.legal)).toEqual(["Bear Cub", "Savannah Lions"]);
      s = settle(activateLabeled(s, "p1", tunnel, "A creature", { targets: { t: [bear] } }));
      s = attack(s, [bear]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
    });

    it("Shizo: a legendary creature gains fear until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Shizo, Death's Storehouse", "Swamp", "Splinter, Aging Champion", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions", "Highborn Vampire"] },
      });
      const shizo = idOf(s, "p1", "battlefield", "Shizo, Death's Storehouse");
      const splinter = idOf(s, "p1", "battlefield", "Splinter, Aging Champion");
      const ability = activations(s, "p1", shizo).find((a) => a.label?.startsWith("A legendary creature"));
      expect(namesIn(s, ability?.targets[0]?.legal)).toEqual(["Splinter, Aging Champion"]);
      s = settle(activateLabeled(s, "p1", shizo, "A legendary creature", { targets: { t: [splinter] } }));
      s = attack(s, [splinter]);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Savannah Lions"), splinter)).toBe(false);
      expect(canBlock(s, idOf(s, "p2", "battlefield", "Highborn Vampire"), splinter)).toBe(true);
    });

    it("The Black Gate: 3 life or tapped; unblockable by the creatures of the player with the most life", () => {
      // Enters: pay 3 life (untapped) or not (tapped).
      const s = scenario({ p1: { hand: ["The Black Gate"] } });
      const gate = idOf(s, "p1", "hand", "The Black Gate");
      const plays = legalActions(s, "p1").filter((a) => a.type === "playLand" && a.card === gate);
      expect(plays.map((a) => a.type === "playLand" && !!a.payLife)).toEqual([true, false]);
      const paid = act(s, "p1", { type: "playLand", card: gate, payLife: true } as never);
      expect(paid.players.p1?.life).toBe(17);
      expect(paid.objects[idOf(paid, "p1", "battlefield", "The Black Gate")]?.tapped).toBe(false);
      const unpaid = act(s, "p1", { type: "playLand", card: gate } as never);
      expect(unpaid.players.p1?.life).toBe(20);
      expect(unpaid.objects[idOf(unpaid, "p1", "battlefield", "The Black Gate")]?.tapped).toBe(true);

      // At three: p2 has the most life; the creature can't be blocked by their creatures, but by p3's.
      let t = scenario({
        players: 3,
        p1: { battlefield: ["The Black Gate", "Swamp", "Swamp", "Bear Cub"] },
        p2: { life: 30, battlefield: ["Savannah Lions"] },
        p3: { battlefield: ["Llanowar Elves"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(
        activateLabeled(t, "p1", idOf(t, "p1", "battlefield", "The Black Gate"), "A creature", { targets: { t: [bear] } }),
      );
      const rule = chars(t, bear).blockRules.find((r) => r.cantBeBlockedByPlayer);
      expect(rule?.cantBeBlockedByPlayer).toBe("p2");
      t = attackPlayer(t, [bear], "p2");
      expect(canBlock(t, idOf(t, "p2", "battlefield", "Savannah Lions"), bear)).toBe(false);
      // You have the most life: you choose yourself, the effect does nothing.
      let u = scenario({
        p1: { life: 30, battlefield: ["The Black Gate", "Swamp", "Swamp", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const bear2 = idOf(u, "p1", "battlefield", "Bear Cub");
      u = settle(
        activateLabeled(u, "p1", idOf(u, "p1", "battlefield", "The Black Gate"), "A creature", { targets: { t: [bear2] } }),
      );
      u = attack(u, [bear2]);
      expect(canBlock(u, idOf(u, "p2", "battlefield", "Savannah Lions"), bear2)).toBe(true);
    });

    it("Tainted Field: {C}; {W} or {B} only if you control a Swamp", () => {
      const s = scenario({ p1: { battlefield: ["Tainted Field"] } });
      const field = idOf(s, "p1", "battlefield", "Tainted Field");
      const colors = (x: S) => legalActions(x, "p1").filter((a) => a.type === "tapForMana" && a.source === field).length;
      expect(colors(s)).toBe(1);
      const t = scenario({ p1: { battlefield: ["Tainted Field", "Swamp"] } });
      expect(
        legalActions(t, "p1").filter((a) => a.type === "tapForMana" && a.source === idOf(t, "p1", "battlefield", "Tainted Field"))
          .length,
      ).toBe(2);
    });
  });
});

describe("PLAN-M M9a: approximations lifted", () => {
  it("Helm of the Host: the token gains haste by an effect, not as a copy exception (a copy of it has no haste, 707.9b)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Helm of the Host", "Splinter, Aging Champion", ...lands("Plains", 5), ...lands("Island", 2)],
        hand: ["Phantasmal Image"],
      },
    });
    const splinter = idOf(s, "p1", "battlefield", "Splinter, Aging Champion");
    const helm = idOf(s, "p1", "battlefield", "Helm of the Host");
    s = settle(activateLabeled(s, "p1", helm, "Equip", { targets: { t: [splinter] } }));
    s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "priority" && x.stack.length > 0);
    s = settle(s);
    const copy = tokens(s, "Splinter, Aging Champion")[0] as string;
    expect(chars(s, copy).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.step === "main2" && x.pending?.kind === "priority");
    // Phantasmal Image copies the token: nonlegendary (an exception of the copied token), without haste.
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Phantasmal Image") }), picking([copy]));
    const image = idOf(s, "p1", "battlefield", "Phantasmal Image");
    expect(image).toBeDefined();
    expect(chars(s, image as string).supertypes).not.toContain("Legendary");
    expect(chars(s, image as string).keywords).not.toContain("haste");
  });
});
