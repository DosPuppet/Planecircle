/**
 * Commander (EDH pseudo-set): rules tests of the "Weight of the World" deck (The Vision, colorless), and of the proxy set's reserve cards. Artifacts that
 * untap, Equipment, Urza's lands, colorless spells and creatures, three Ugin and Karn, Living Legacy.
 */
import { describe, expect, it } from "vitest";
import { submit } from "../src/game";
import { bump, chars, snapshot } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { protectedFrom } from "../src/targets";
import { msg, plainText } from "../src/text";
import type { ActionOption, ChoiceRequest, GameState, ObjectId, PlayerId } from "../src/types";
import {
  act,
  advanceUntil,
  attack,
  canActivate,
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
/** Activates the ability at rank `index` (in the definition) of this source. */
const activate = (s: S, p: PlayerId, source: ObjectId, index?: number, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => index === undefined || a.ability === index);
  if (!o) throw new Error(`no ability ${index ?? ""} for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
/** Taps the source for mana (the first mana ability offered, or the one at rank `ability`). */
const tapMana = (s: S, name: string, ability?: number, color?: string, player: PlayerId = "p1") => {
  const source = idOf(s, player, "battlefield", name);
  const o = legalActions(s, player).find(
    (a) => a.type === "tapForMana" && a.source === source && (ability === undefined || a.ability === ability),
  );
  if (o?.type !== "tapForMana") throw new Error(`no mana for ${name}`);
  return act(s, player, { type: "tapForMana", source, ability: o.ability, ...(color ? { color } : {}) } as never);
};
const pool = (s: S, p: PlayerId = "p1") => s.players[p]?.manaPool;
const handNames = (s: S, p: PlayerId) => namesIn(s, s.players[p]?.hand).sort();
const tokens = (s: S, name: string, p: PlayerId = "p1") =>
  s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && nameOf(s, id) === name);
const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
/** Chooses the mode with the given label (modal spell or modal triggered ability). */
const modeNamed = (label: string) => (req: ChoiceRequest) =>
  req.type === "pick" && req.intent === "triggerMode"
    ? Object.entries(req.labels ?? {})
        .filter(([, l]) => plainText(l) === label)
        .map(([k]) => k)
    : undefined;
/** Rank of the mode of a spell with the given label. */
const spellMode = (s: S, p: PlayerId, card: string, label: string) => {
  const m = legalActions(s, p)
    .flatMap((a) => (a.type === "cast" && a.card === card ? a.modes : []))
    .find((x) => plainText(x.label ?? "") === label);
  if (!m) throw new Error(`no mode "${label}"`);
  return m.index;
};
/** The cast option of the card (modes, targets, free). */
const castOption = (s: S, p: PlayerId, card: string) => {
  const o = legalActions(s, p).find((a) => a.type === "cast" && a.card === card);
  return o?.type === "cast" ? o : undefined;
};

/** Activates the ability whose label starts this way (loyalty abilities: "+1", "−3"…). */
const activateLabeled = (s: S, p: PlayerId, source: ObjectId, prefix: string, extra: object = {}) => {
  const o = activations(s, p, source).find((a) => plainText(a.label ?? "").startsWith(prefix));
  if (!o) throw new Error(`no ability "${prefix}" for ${nameOf(s, source)}`);
  return act(s, p, { type: "activate", source, ability: o.ability, ...extra } as never);
};
/** Activates the Equip ability (the first offered, or the one whose label starts this way) on the creature. */
const equip = (s: S, equipment: string, creature: ObjectId, label = "Equip", p: PlayerId = "p1") => {
  const source = idOf(s, p, "battlefield", equipment);
  const o = activations(s, p, source).find(
    (a) => plainText(a.label ?? "").startsWith(label) && a.targets[0]?.legal.includes(creature),
  );
  if (!o) throw new Error(`no Equip "${label}" for ${equipment}`);
  return settle(act(s, p, { type: "activate", source, ability: o.ability, targets: { t: [creature] } } as never));
};
/** The creatures that the Equip ability with this label can target. */
const equipTargets = (s: S, equipment: string, label: string, p: PlayerId = "p1") =>
  namesIn(
    s,
    activations(s, p, idOf(s, p, "battlefield", equipment)).find((a) => plainText(a.label ?? "").startsWith(label))?.targets[0]
      ?.legal ?? [],
  ).sort();

describe("The Vision (EDH)", () => {
  describe("artefacts", () => {
    it("Basalt Monolith: {C}{C}{C}, doesn't untap during your untap step, {3}: untap it", () => {
      let s = scenario({ p1: { battlefield: ["Basalt Monolith", ...lands("Wastes", 3)] } });
      s = tapMana(s, "Basalt Monolith");
      expect(pool(s)?.C).toBe(3);
      const monolith = idOf(s, "p1", "battlefield", "Basalt Monolith");
      // {3}: untap it (paid with the mana it just produced).
      s = settle(activate(s, "p1", monolith, 2));
      expect(s.objects[monolith]?.tapped).toBe(false);
      s = tapMana(s, "Basalt Monolith");
      // p1's next turn: it stays tapped.
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.objects[monolith]?.tapped).toBe(true);
    });

    it("Cloud Key: spells of the chosen type cost {1} less", () => {
      let s = scenario({ p1: { hand: ["Cloud Key", "Sol Ring", "Shock"], battlefield: lands("Wastes", 3) } });
      s = settle(castIt(s, "p1", "Cloud Key"), (req) =>
        req.type === "pick" && req.options.includes("Artifact") ? ["Artifact"] : undefined,
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Cloud Key")]?.chosen?.mode).toBe("Artifact");
      // Sol Ring ({1}) costs nothing now: castable with no untapped land.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      s = settle(castIt(s, "p1", "Sol Ring"));
      expect(idsOf(s, "p1", "battlefield", "Sol Ring")).toHaveLength(1);
      // Shock (instant, red) isn't affected: no red mana, no reduction.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
    });

    it("Darksteel Forge: your artifacts have indestructible", () => {
      let s = scenario({
        p1: { battlefield: ["Darksteel Forge", "Sol Ring"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      expect(chars(s, ring).keywords).toContain("indestructible");
      s = settle(castIt(s, "p2", "Vindicate", { targets: { t: [ring] } }));
      expect(s.objects[ring]?.zone).toBe("battlefield");
    });

    it("Darksteel Monolith: once each turn, a colorless spell from your hand without paying its mana cost", () => {
      let s = scenario({ p1: { battlefield: ["Darksteel Monolith"], hand: ["Basalt Monolith", "Mox Opal", "Shock"] } });
      const basalt = idOf(s, "p1", "hand", "Basalt Monolith");
      expect(castOption(s, "p1", basalt)?.freeAvailable).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Shock"))).toBe(false);
      s = settle(castIt(s, "p1", "Basalt Monolith", { free: true }));
      expect(idsOf(s, "p1", "battlefield", "Basalt Monolith")).toHaveLength(1);
      // Once each turn: Mox Opal ({0}) can still be cast normally, but no longer for free through the permission.
      const mox = idOf(s, "p1", "hand", "Mox Opal");
      expect(castOption(s, "p1", mox)?.freeAvailable).toBeFalsy();
      expect(castable(s, "p1", mox)).toBe(true);
    });

    it("Forsaken Monument: +2/+2 to your colorless creatures, an additional {C} for each permanent tapped for {C}, 2 life per colorless spell", () => {
      let s = scenario({
        p1: { battlefield: ["Forsaken Monument", "Sol Ring", "Shimmer Myr", "Bear Cub", "Command Tower"], hand: ["Mox Opal"] },
      });
      expect(pt(s, idOf(s, "p1", "battlefield", "Shimmer Myr"))).toEqual([4, 4]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      s = tapMana(s, "Sol Ring");
      expect(pool(s)?.C).toBe(3);
      s = settle(castIt(s, "p1", "Mox Opal"));
      expect(s.players.p1?.life).toBe(22);
    });

    it("Gerrard's Hourglass Pendant: extra turns are skipped; permanents that died this turn return tapped", () => {
      let s = scenario({
        p1: { battlefield: ["Gerrard's Hourglass Pendant", "Bear Cub", ...lands("Wastes", 4)], graveyard: ["Sol Ring"] },
        p2: { hand: ["Shock"], battlefield: ["Mountain"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Bear Cub dies this turn; Sol Ring was already in the graveyard.
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [bear] } }));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Gerrard's Hourglass Pendant")));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[back]?.tapped).toBe(true);
      expect(idsOf(s, "p1", "graveyard", "Sol Ring")).toHaveLength(1);
      expect(s.exile.some((id) => nameOf(s, id) === "Gerrard's Hourglass Pendant")).toBe(true);
    });

    it("Liquimetal Torque: the targeted nonland permanent becomes an artifact until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Liquimetal Torque"] }, p2: { battlefield: ["Bear Cub"] } });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Liquimetal Torque"), 1, { targets: { t: [bear] } }));
      expect(chars(s, bear).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).types).not.toContain("Artifact");
    });

    it("Manifold Key: untaps another artifact; makes a creature unblockable this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Manifold Key", { name: "Sol Ring", tapped: true }, "Bear Cub", ...lands("Wastes", 4)] },
      });
      const key = idOf(s, "p1", "battlefield", "Manifold Key");
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      expect(activations(s, "p1", key).find((a) => a.ability === 0)?.targets[0]?.legal).not.toContain(key);
      s = settle(activate(s, "p1", key, 0, { targets: { t: [ring] } }));
      expect(s.objects[ring]?.tapped).toBe(false);
      let t = scenario({ p1: { battlefield: ["Manifold Key", "Bear Cub", ...lands("Wastes", 3)] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Manifold Key"), 1, { targets: { t: [bear] } }));
      expect(chars(t, bear).keywords).toContain("unblockable");
    });

    it("Moonsilver Key: searches for an artifact with a mana ability or a basic land", () => {
      let s = scenario({
        p1: {
          battlefield: ["Moonsilver Key", "Wastes"],
          library: ["Darksteel Forge", "Sol Ring", "Wastes", "Urza's Mine", "Abstergo Entertainment"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Moonsilver Key")), (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
        return undefined;
      });
      expect(offered.sort()).toEqual(["Sol Ring", "Wastes"]);
    });

    it("Mox Opal: metalcraft, one mana of any color with three artifacts", () => {
      const s = scenario({ p1: { battlefield: ["Mox Opal", "Sol Ring"] } });
      const mox = idOf(s, "p1", "battlefield", "Mox Opal");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === mox)).toBe(false);
      const t = scenario({ p1: { battlefield: ["Mox Opal", "Sol Ring", "Basalt Monolith"] } });
      const u = tapMana(t, "Mox Opal", undefined, "R");
      expect(pool(u)?.R).toBe(1);
    });

    it("Mystic Forge: casts artifact and colorless spells from the top; {T}, 1 life: exile the top card", () => {
      let s = scenario({ p1: { battlefield: ["Mystic Forge", "Wastes"], library: ["Sol Ring", "Shock", "Bear Cub"] } });
      const ring = s.players.p1?.library[0] as string;
      expect(castable(s, "p1", ring)).toBe(true);
      s = settle(act(s, "p1", { type: "cast", card: ring } as never));
      expect(idsOf(s, "p1", "battlefield", "Sol Ring")).toHaveLength(1);
      // Shock on top: neither artifact nor colorless.
      expect(castable(s, "p1", s.players.p1?.library[0] as string)).toBe(false);
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Mystic Forge")));
      expect(s.players.p1?.life).toBe(19);
      expect(s.exile.some((id) => nameOf(s, id) === "Shock")).toBe(true);
    });

    it("Nevinyrral's Disk: enters tapped; destroys all artifacts, creatures and enchantments", () => {
      let s = scenario({
        p1: { hand: ["Nevinyrral's Disk"], battlefield: [...lands("Wastes", 5), "Sol Ring", "Bear Cub"] },
        p2: { battlefield: ["Bear Cub", "Mountain"] },
      });
      s = settle(castIt(s, "p1", "Nevinyrral's Disk"));
      const disk = idOf(s, "p1", "battlefield", "Nevinyrral's Disk");
      expect(s.objects[disk]?.tapped).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = settle(activate(s, "p1", disk));
      expect(s.battlefield.map((id) => nameOf(s, id)).sort()).toEqual([...lands("Wastes", 5), "Mountain"].sort());
    });

    it("The Mightstone and Weakstone: draw two cards or -5/-5; {C}{C} for artifact spells", () => {
      let s = scenario({ p1: { hand: ["The Mightstone and Weakstone"], battlefield: lands("Wastes", 5) } });
      s = settle(castIt(s, "p1", "The Mightstone and Weakstone"), modeNamed("Draw two cards"));
      expect(s.players.p1?.hand).toHaveLength(2);
      let t = scenario({
        p1: { hand: ["The Mightstone and Weakstone"], battlefield: lands("Wastes", 5) },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "The Mightstone and Weakstone"), modeNamed("Target creature gets −5/−5"));
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      // The mana can be spent only on artifact spells.
      const u = scenario({ p1: { battlefield: ["The Mightstone and Weakstone"], hand: ["Shock", "Basalt Monolith"] } });
      expect(castable(u, "p1", idOf(u, "p1", "hand", "Basalt Monolith"))).toBe(false);
      const ab = manaAbilitiesOf(u, idOf(u, "p1", "battlefield", "The Mightstone and Weakstone"))[0];
      expect([ab?.amount, ab?.restriction?.spell?.types]).toEqual([2, ["Artifact"]]);
    });

    it("Unwinding Clock: your artifacts untap during other players' untap steps", () => {
      let s = scenario({
        p1: { battlefield: ["Unwinding Clock", { name: "Sol Ring", tapped: true }, { name: "Bear Cub", tapped: true }] },
      });
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(s.objects[idOf(s, "p1", "battlefield", "Sol Ring")]?.tapped).toBe(false);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Vedalken Orrery: you may cast spells as though they had flash", () => {
      const s = scenario({
        p1: { battlefield: ["Vedalken Orrery", ...lands("Forest", 2)], hand: ["Bear Cub"] },
        active: "p2",
      });
      const t = act(s, "p2", { type: "pass" });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(true);
    });

    it("Voltaic Key: untaps the targeted artifact", () => {
      let s = scenario({ p1: { battlefield: ["Voltaic Key", { name: "Basalt Monolith", tapped: true }, "Wastes"] } });
      const mono = idOf(s, "p1", "battlefield", "Basalt Monolith");
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Voltaic Key"), 0, { targets: { t: [mono] } }));
      expect(s.objects[mono]?.tapped).toBe(false);
    });

    it("Fractured Powerstone: {C}; the planar die, outside Planechase, does nothing", () => {
      let s = scenario({ p1: { battlefield: ["Fractured Powerstone"] } });
      const stone = idOf(s, "p1", "battlefield", "Fractured Powerstone");
      expect(activations(s, "p1", stone)).toHaveLength(1);
      s = settle(activate(s, "p1", stone));
      expect(s.objects[stone]?.tapped).toBe(true);
    });
  });
  describe("Equipment", () => {
    it("Adaptive Omnitool: +1/+1 per artifact; when attacking, an artifact among the top six cards", () => {
      let s = scenario({
        p1: {
          battlefield: ["Adaptive Omnitool", "Sol Ring", "Bear Cub", ...lands("Wastes", 3)],
          library: ["Forest", "Basalt Monolith", "Forest", "Forest", "Forest", "Forest", "Mox Opal"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Adaptive Omnitool", bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      s = attack(s, [bear]);
      s = settleNoBlocks(s, (req, _p, cur) =>
        req.type === "pick" && req.intent === "lookAtTop"
          ? req.options.filter((id) => nameOf(cur, id) === "Basalt Monolith")
          : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Basalt Monolith"]);
      // Mox Opal (seventh card) wasn't looked at; the five Forests go to the bottom.
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Mox Opal");
    });

    it("Brotherhood Regalia: ward {2}, Assassin, unblockable; Equip legendary creature {1} or Equip {3}", () => {
      let s = scenario({
        p1: { battlefield: ["Brotherhood Regalia", "Liberator, Urza's Battlethopter", "Bear Cub", "Wastes"] },
      });
      expect(equipTargets(s, "Brotherhood Regalia", "Equip legendary creature")).toEqual(["Liberator, Urza's Battlethopter"]);
      // With a single mana, only the legendary Equip {1} is possible.
      expect(activations(s, "p1", idOf(s, "p1", "battlefield", "Brotherhood Regalia")).map((a) => a.label)).toEqual([
        msg("Equip legendary creature {cost}", { cost: "{1}" }),
      ]);
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = equip(s, "Brotherhood Regalia", lib, "Equip legendary creature");
      expect(chars(s, lib).subtypes).toContain("Assassin");
      expect(chars(s, lib).keywords).toContain("unblockable");
      expect(chars(s, lib).abilities.some((a) => a.kind === "triggered" && a.ward)).toBe(true);
    });

    it("Champion's Helm: +2/+2; hexproof only if the equipped creature is legendary", () => {
      let s = scenario({ p1: { battlefield: ["Champion's Helm", "Bear Cub", "Liberator, Urza's Battlethopter", "Wastes"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Champion's Helm", bear);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).not.toContain("hexproof");
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      s = equip(s, "Champion's Helm", lib);
      expect(chars(s, lib).keywords).toContain("hexproof");
    });

    it("Commander's Plate: +3/+3, protection from each color outside your commander's identity; Equip commander {3}", () => {
      // Colorless commander (The Vision, in the command zone): protection from all five colors.
      let s = scenario({
        p1: { command: ["The Vision"], battlefield: ["Commander's Plate", "Bear Cub", ...lands("Wastes", 5)] },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel", "Llanowar Elves"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // No commander on the battlefield: only "Equip {5}".
      expect(equipTargets(s, "Commander's Plate", "Equip commander")).toEqual([]);
      s = equip(s, "Commander's Plate", bear, "Equip {5}");
      expect(pt(s, bear)).toEqual([5, 5]);
      const from = (x: S, name: string) => protectedFrom(x, bear, snapshot(x, idOf(x, "p2", "battlefield", name)));
      expect([from(s, "Shivan Dragon"), from(s, "Serra Angel"), from(s, "Llanowar Elves")]).toEqual([true, true, true]);
      // White, black and red commander (Edgar Markov): protection from blue and green only.
      let t = scenario({
        p1: { command: ["Edgar Markov"], battlefield: ["Commander's Plate", "Bear Cub", ...lands("Wastes", 5)] },
        p2: { battlefield: ["Shivan Dragon", "Serra Angel", "Llanowar Elves"] },
      });
      t = equip(t, "Commander's Plate", idOf(t, "p1", "battlefield", "Bear Cub"), "Equip {5}");
      expect([from(t, "Shivan Dragon"), from(t, "Serra Angel"), from(t, "Llanowar Elves")]).toEqual([false, false, true]);
    });

    it("Excalibur, Sword of Eden: costs X less (total mana value of your historic permanents); Equip legendary creature {2}", () => {
      let s = scenario({
        p1: {
          hand: ["Excalibur, Sword of Eden"],
          battlefield: [
            "Basalt Monolith",
            "Darksteel Forge",
            "Liberator, Urza's Battlethopter",
            "Bear Cub",
            ...lands("Wastes", 2),
          ],
        },
      });
      // 12 − (3 + 9 + 3): free.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Excalibur, Sword of Eden"))).toBe(true);
      s = settle(castIt(s, "p1", "Excalibur, Sword of Eden"));
      expect(s.battlefield.every((id) => !s.objects[id]?.tapped)).toBe(true);
      expect(equipTargets(s, "Excalibur, Sword of Eden", "Equip")).toEqual(["Liberator, Urza's Battlethopter"]);
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = equip(s, "Excalibur, Sword of Eden", lib);
      expect(chars(s, lib).power).toBe(11);
      expect(chars(s, lib).keywords).toContain("vigilance");
    });

    it("Hammer of Nazahn: when one of your Equipment enters (itself included), you may attach it to one of your creatures", () => {
      let s = scenario({
        p1: { hand: ["Hammer of Nazahn", "Champion's Helm"], battlefield: ["Bear Cub", ...lands("Wastes", 7)] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Hammer of Nazahn"));
      const hammer = idOf(s, "p1", "battlefield", "Hammer of Nazahn");
      expect(s.objects[hammer]?.attachedTo).toBe(bear);
      expect(chars(s, bear).power).toBe(4);
      expect(chars(s, bear).keywords).toContain("indestructible");
      s = settle(castIt(s, "p1", "Champion's Helm"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Champion's Helm")]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([6, 4]);
    });

    it("Mithril Coat: when it enters, attached to a legendary creature you control; indestructible", () => {
      let s = scenario({
        p1: { hand: ["Mithril Coat"], battlefield: ["Bear Cub", "Liberator, Urza's Battlethopter", ...lands("Wastes", 3)] },
      });
      s = settle(castIt(s, "p1", "Mithril Coat"));
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      expect(s.objects[idOf(s, "p1", "battlefield", "Mithril Coat")]?.attachedTo).toBe(lib);
      expect(chars(s, lib).keywords).toContain("indestructible");
    });

    it("Nettlecyst: living weapon; +1/+1 per artifact and/or enchantment you control", () => {
      let s = scenario({ p1: { hand: ["Nettlecyst"], battlefield: ["Sol Ring", "Wastes"] } });
      s = settle(castIt(s, "p1", "Nettlecyst"));
      const [germ] = tokens(s, "Phyrexian Germ");
      expect(s.objects[idOf(s, "p1", "battlefield", "Nettlecyst")]?.attachedTo).toBe(germ);
      expect(pt(s, germ ?? "")).toEqual([2, 2]);
      expect(chars(s, germ ?? "").colors).toEqual(["B"]);
    });

    it("Silver Shroud Costume: attached when it enters, shroud until end of turn; the equipped creature is unblockable", () => {
      let s = scenario({ p1: { hand: ["Silver Shroud Costume"], battlefield: ["Bear Cub", ...lands("Wastes", 2)] } });
      s = settle(castIt(s, "p1", "Silver Shroud Costume"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["shroud", "unblockable"]));
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(chars(s, bear).keywords).not.toContain("shroud");
      expect(chars(s, bear).keywords).toContain("unblockable");
    });

    it("Sword of Feast and Famine: protection from black and green; the damaged player discards, you untap your lands", () => {
      let s = scenario({
        p1: { battlefield: ["Sword of Feast and Famine", "Bear Cub", ...lands("Wastes", 2)] },
        p2: { hand: ["Shock", "Forest"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Sword of Feast and Famine", bear);
      expect(chars(s, bear).protections.map((r) => r.label)).toEqual(["Protection from black", "Protection from green"]);
      expect(idsOf(s, "p1", "battlefield", "Wastes").every((id) => s.objects[id]?.tapped)).toBe(true);
      s = attack(s, [bear]);
      s = throughCombat(s);
      expect(s.players.p2?.life).toBe(16);
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Wastes").every((id) => !s.objects[id]?.tapped)).toBe(true);
    });

    it("Sword of Truth and Justice: a +1/+1 counter on one of your creatures, then proliferate", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Sword of Truth and Justice",
            "Bear Cub",
            { name: "Karn, Living Legacy", counters: { loyalty: 4 } },
            ...lands("Wastes", 2),
          ],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = equip(s, "Sword of Truth and Justice", bear);
      s = attack(s, [bear]);
      s = throughCombat(s);
      // A counter on Bear Cub, then proliferate: Bear Cub and Karn.
      expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
      expect(s.objects[idOf(s, "p1", "battlefield", "Karn, Living Legacy")]?.counters.loyalty).toBe(5);
    });
  });
  describe("planeswalkers", () => {
    it("Karn, Living Legacy: +1 a tapped Powerstone; −1 pay X, one of the top X cards to hand", () => {
      let s = scenario({
        p1: {
          battlefield: ["Karn, Living Legacy", ...lands("Wastes", 3)],
          library: ["Forest", "Sol Ring", "Mox Opal", "Bear Cub", "Shock"],
        },
      });
      const karn = idOf(s, "p1", "battlefield", "Karn, Living Legacy");
      s = settle(activate(s, "p1", karn, 0));
      const [stone] = tokens(s, "Powerstone");
      expect(s.objects[stone ?? ""]?.tapped).toBe(true);
      expect(s.objects[karn]?.counters.loyalty).toBe(5);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      // Draw: Forest. Pay 3: Sol Ring, Mox Opal, Bear Cub; Mox Opal to hand, the rest on the bottom.
      s = settle(activate(s, "p1", karn, 1), (req, _p, cur) =>
        req.type === "number" && req.intent === "payX"
          ? [3]
          : req.type === "pick" && req.intent === "lookAtTop"
            ? req.options.filter((id) => nameOf(cur, id) === "Mox Opal")
            : undefined,
      );
      expect(handNames(s, "p1")).toEqual(["Forest", "Mox Opal"]);
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Shock");
      expect(s.players.p1?.library).toHaveLength(3);
    });

    it('Karn, Living Legacy: −7, emblem "tap an untapped artifact: 1 damage to any target"', () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Karn, Living Legacy", counters: { loyalty: 7 } }, "Sol Ring", "Basalt Monolith"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Karn, Living Legacy"), 2));
      const emblem = s.players.p1?.command[0] as string;
      expect(s.objects[emblem]?.isToken).toBe(true);
      // The emblem's ability is activated from the command zone, once per untapped artifact.
      s = settle(activate(s, "p1", emblem, 0, { targets: { t: ["p2"] } }));
      s = settle(activate(s, "p1", emblem, 0, { targets: { t: ["p2"] } }));
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Sol Ring").every((id) => s.objects[id]?.tapped)).toBe(true);
      expect(canActivate(s, "p1", emblem)).toBe(false);
      // An opponent can't activate it.
      expect(canActivate(s, "p2", emblem)).toBe(false);
    });

    it("Ugin, the Ineffable: colorless spells cost {2} less; +1 exile face down and a 2/2 Spirit; the card goes to hand when it leaves", () => {
      let s = scenario({
        p1: { battlefield: ["Ugin, the Ineffable", "Wastes"], hand: ["Basalt Monolith"], library: ["Sol Ring", "Forest"] },
        p2: { hand: ["Shock"], battlefield: ["Mountain"] },
      });
      // Basalt Monolith ({3}) for a single mana.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Basalt Monolith"))).toBe(true);
      s = settle(activateLabeled(s, "p1", idOf(s, "p1", "battlefield", "Ugin, the Ineffable"), "+1"));
      const exiledRing = s.exile.find((id) => nameOf(s, id) === "Sol Ring") as string;
      expect(s.objects[exiledRing]?.exiledFaceDown).toEqual(["p1"]);
      const [spirit] = tokens(s, "Spirit");
      expect(pt(s, spirit ?? "")).toEqual([2, 2]);
      expect(chars(s, spirit ?? "").colors).toEqual([]);
      s = act(s, "p1", { type: "pass" });
      s = settle(castIt(s, "p2", "Shock", { targets: { t: [spirit] } }));
      expect(handNames(s, "p1")).toEqual(["Basalt Monolith", "Sol Ring"]);
    });

    it("Ugin, the Ineffable: −3 destroys a permanent that's one or more colors", () => {
      const s = scenario({
        p1: { battlefield: ["Ugin, the Ineffable"] },
        p2: { battlefield: ["Bear Cub", "Sol Ring", "Forest"] },
      });
      const legal = activations(s, "p1", idOf(s, "p1", "battlefield", "Ugin, the Ineffable")).find((a) =>
        plainText(a.label ?? "").startsWith("−3"),
      )?.targets[0]?.legal;
      expect(namesIn(s, legal)).toEqual(["Bear Cub"]);
    });

    it("Ugin, the Spirit Dragon: −X exiles each colored permanent with mana value X or less; −10", () => {
      let s = scenario({
        p1: { battlefield: ["Ugin, the Spirit Dragon", "Savannah Lions"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Sol Ring", "Forest"] },
      });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Ugin, the Spirit Dragon"), 1, { x: 3 }));
      expect(s.battlefield.map((id) => nameOf(s, id)).sort()).toEqual([
        "Forest",
        "Shivan Dragon",
        "Sol Ring",
        "Ugin, the Spirit Dragon",
      ]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ugin, the Spirit Dragon")]?.counters.loyalty).toBe(4);
      let t = scenario({
        p1: {
          battlefield: [{ name: "Ugin, the Spirit Dragon", counters: { loyalty: 10 } }],
          library: ["Bear Cub", "Sol Ring", "Shock", "Wastes", "Basalt Monolith", "Forest", "Mox Opal", "Forest"],
        },
      });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "Ugin, the Spirit Dragon"), 2));
      expect(t.players.p1?.life).toBe(27);
      // All the permanent cards drawn (six) go to the battlefield; Shock stays in hand.
      expect(handNames(t, "p1")).toEqual(["Shock"]);
      expect(idsOf(t, "p1", "battlefield", "Basalt Monolith")).toHaveLength(1);
    });
  });

  describe("creatures", () => {
    it("Glaring Fleshraker: an Eldrazi Spawn per colorless spell; 1 damage to each opponent per other colorless creature that enters", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Glaring Fleshraker"], hand: ["Mox Opal"] },
      });
      s = settle(castIt(s, "p1", "Mox Opal"));
      const [spawn] = tokens(s, "Eldrazi Spawn");
      expect(pt(s, spawn ?? "")).toEqual([0, 1]);
      expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
      // The Spawn: "sacrifice this token: add {C}".
      s = act(s, "p1", { type: "tapForMana", source: spawn, ability: 0 } as never);
      expect(pool(s)?.C).toBe(1);
    });

    it("Liberator, Urza's Battlethopter: flash for colorless and artifact spells; a counter if the mana spent exceeds its power", () => {
      let s = scenario({
        p1: { battlefield: ["Liberator, Urza's Battlethopter", ...lands("Wastes", 4)], hand: ["Sol Ring", "Basalt Monolith"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      const lib = idOf(s, "p1", "battlefield", "Liberator, Urza's Battlethopter");
      s = passAccepting(castIt(s, "p1", "Sol Ring"), (x) => x.stack.length === 0);
      expect(s.objects[lib]?.counters["+1/+1"] ?? 0).toBe(0);
      // Empty stack: priority returns to the active player (p2), who passes.
      s = act(s, "p2", { type: "pass" });
      s = passAccepting(castIt(s, "p1", "Basalt Monolith"), (x) => x.stack.length === 0);
      expect(s.objects[lib]?.counters["+1/+1"]).toBe(1);
    });

    it("Scrap Trawler: when one of your artifacts goes to the graveyard, an artifact card with lesser mana value returns to hand", () => {
      let s = scenario({
        p1: { battlefield: ["Scrap Trawler", "Basalt Monolith"], graveyard: ["Sol Ring", "Darksteel Forge", "Basalt Monolith"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      const mono = idOf(s, "p1", "battlefield", "Basalt Monolith");
      s = settle(castIt(s, "p2", "Vindicate", { targets: { t: [mono] } }));
      // Mana value less than 3: only Sol Ring (neither Darksteel Forge nor the other Basalt Monolith).
      expect(handNames(s, "p1")).toEqual(["Sol Ring"]);
      // Without a card with lesser mana value, nothing returns; Scrap Trawler dying counts too (3: Sol Ring).
      let t = scenario({
        p1: { battlefield: ["Scrap Trawler"], graveyard: ["Darksteel Forge", "Sol Ring"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      t = settle(castIt(t, "p2", "Vindicate", { targets: { t: [idOf(t, "p1", "battlefield", "Scrap Trawler")] } }));
      expect(handNames(t, "p1")).toEqual(["Sol Ring"]);
    });

    it("Shimmer Myr: your artifact spells have flash", () => {
      let s = scenario({
        p1: { battlefield: ["Shimmer Myr", ...lands("Forest", 3)], hand: ["Sol Ring", "Bear Cub"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Skittering Cicada: flash for colorless spells; trample and +X/+X (X: the spell's mana value)", () => {
      let s = scenario({ p1: { battlefield: ["Skittering Cicada", ...lands("Wastes", 3)], hand: ["Basalt Monolith"] } });
      const cicada = idOf(s, "p1", "battlefield", "Skittering Cicada");
      s = settle(castIt(s, "p1", "Basalt Monolith"));
      expect(pt(s, cicada)).toEqual([5, 5]);
      expect(chars(s, cicada).keywords).toContain("trample");
    });

    it("Wandering Archaic: an opponent casts an instant or sorcery; they pay {2}, otherwise you may copy it", () => {
      const start = () =>
        scenario({
          p1: { battlefield: ["Wandering Archaic // Explore the Vastlands"] },
          p2: { hand: ["Shock"], battlefield: lands("Mountain", 3) },
          active: "p2",
        });
      // The opponent doesn't pay: the copy targets p2.
      let s = start();
      s = settle(castIt(s, "p2", "Shock", { targets: { t: ["p1"] } }), (req, p) =>
        req.intent === "unlessPay" || (req.type === "yesNo" && p === "p2") ? [0] : picking(["p2"])(req),
      );
      expect([s.players.p1?.life, s.players.p2?.life]).toEqual([18, 18]);
      // The opponent pays {2}: no copy.
      let t = start();
      t = settle(castIt(t, "p2", "Shock", { targets: { t: ["p1"] } }), (req, p) =>
        req.intent === "unlessPay" || (req.type === "yesNo" && p === "p2") ? [1] : undefined,
      );
      expect([t.players.p1?.life, t.players.p2?.life]).toEqual([18, 20]);
    });

    it("Explore the Vastlands: each player takes a land and/or an instant or sorcery from their top five cards, and gains 3 life", () => {
      let s = scenario({
        players: 3,
        p1: {
          hand: ["Wandering Archaic // Explore the Vastlands"],
          battlefield: lands("Wastes", 5),
          library: ["Bear Cub", "Forest", "Shock", "Island", "Sol Ring", "Vindicate"],
        },
        p2: { library: ["Bear Cub", "Sol Ring", "Mox Opal", "Shock", "Shock", "Forest"] },
        p3: { library: ["Bear Cub", "Sol Ring", "Mox Opal", "Basalt Monolith", "Shivan Dragon", "Forest"] },
      });
      const card = idOf(s, "p1", "hand", "Wandering Archaic // Explore the Vastlands");
      const back = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.face === 1);
      expect(back).toBeDefined();
      const asked: PlayerId[] = [];
      s = settle(act(s, "p1", { type: "cast", card, face: 1 } as never), (req, p) => {
        if (req.type === "pick" && req.intent === "lookAtTop") asked.push(p);
        return undefined;
      });
      // Each player chooses for themselves (p3 has neither a land nor an instant among their five cards).
      expect(asked).toEqual(["p1", "p1", "p2"]);
      expect(handNames(s, "p1")).toEqual(["Forest", "Shock"]);
      expect(handNames(s, "p2")).toEqual(["Shock"]);
      expect(handNames(s, "p3")).toEqual([]);
      expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([23, 23, 23]);
      // The other cards looked at go to the bottom: p1 keeps Vindicate (sixth) on top.
      expect(namesIn(s, s.players.p1?.library)[0]).toBe("Vindicate");
    });
  });
  describe("sorts", () => {
    it("All Is Dust: each player sacrifices their permanents that are one or more colors", () => {
      let s = scenario({
        players: 3,
        p1: { hand: ["All Is Dust"], battlefield: [...lands("Wastes", 7), "Sol Ring", "Savannah Lions"] },
        p2: { battlefield: ["Bear Cub", "Forest", "Basalt Monolith"] },
        p3: { battlefield: ["Shivan Dragon", "Glaring Fleshraker"] },
      });
      s = settle(castIt(s, "p1", "All Is Dust"));
      expect(s.battlefield.map((id) => nameOf(s, id)).sort()).toEqual(
        ["Basalt Monolith", "Forest", "Glaring Fleshraker", "Sol Ring", ...lands("Wastes", 7)].sort(),
      );
      expect(idsOf(s, "p3", "graveyard", "Shivan Dragon")).toHaveLength(1);
    });

    it("Desecrate Reality: up to one even-mana-value permanent per opponent; adamant, an odd one returns", () => {
      let s = scenario({
        players: 3,
        p1: {
          hand: ["Desecrate Reality"],
          battlefield: lands("Wastes", 7),
          graveyard: ["Basalt Monolith", "Sol Ring", "Bear Cub"],
        },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Forest"] },
        p3: { battlefield: ["Mox Opal", "Llanowar Elves"] },
      });
      const card = idOf(s, "p1", "hand", "Desecrate Reality");
      const spec = castOption(s, "p1", card)?.modes[0]?.targets[0];
      // Even mana value (0 included): Bear Cub (2), Shivan Dragon (6), Forest (0), Mox Opal (0); not Llanowar Elves (1).
      expect(namesIn(s, spec?.legal).sort()).toEqual(["Bear Cub", "Forest", "Mox Opal", "Shivan Dragon"]);
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      const mox = idOf(s, "p3", "battlefield", "Mox Opal");
      // Two targets of the same opponent: refused.
      expect(() =>
        castIt(s, "p1", "Desecrate Reality", { targets: { t: [dragon, idOf(s, "p2", "battlefield", "Forest")] } }),
      ).toThrow();
      // Seven colorless mana spent: adamant; an odd-mana-value permanent card returns (Basalt Monolith or Sol Ring).
      s = settle(castIt(s, "p1", "Desecrate Reality", { targets: { t: [dragon, mox] } }), (req, _p, cur) =>
        req.type === "pick" && req.options.some((id) => nameOf(cur, id) === "Basalt Monolith")
          ? req.options.filter((id) => nameOf(cur, id) === "Basalt Monolith")
          : undefined,
      );
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual(["Mox Opal", "Shivan Dragon"]);
      expect(idsOf(s, "p1", "battlefield", "Basalt Monolith")).toHaveLength(1);
      // Without three colorless mana spent: nothing returns.
      let t = scenario({
        p1: { hand: ["Desecrate Reality"], battlefield: lands("Forest", 7), graveyard: ["Sol Ring"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      t = settle(castIt(t, "p1", "Desecrate Reality", { targets: { t: [idOf(t, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(t, "p1", "graveyard", "Sol Ring")).toHaveLength(1);
    });

    it("Echoes of Eternity: each colorless spell is copied; triggered abilities of your colorless permanents trigger an additional time", () => {
      let s = scenario({
        p1: { battlefield: ["Echoes of Eternity", "Glaring Fleshraker"], hand: ["Mox Opal"] },
      });
      s = settle(castIt(s, "p1", "Mox Opal"));
      // The Mox Opal copy becomes a token (707.10); the legend rule keeps only one.
      expect(s.battlefield.filter((id) => nameOf(s, id) === "Mox Opal").length).toBeGreaterThanOrEqual(1);
      expect(s.players.p1?.graveyard.length ?? 0).toBeLessThanOrEqual(1);
      // Fleshraker: two Spawn (doubled trigger), each deals 1 damage twice.
      expect(tokens(s, "Eldrazi Spawn")).toHaveLength(2);
      expect(s.players.p2?.life).toBe(16);
      // A colored spell is neither copied nor counted.
      let t = scenario({ p1: { battlefield: ["Echoes of Eternity", "Forest", "Forest"], hand: ["Bear Cub"] } });
      t = settle(castIt(t, "p1", "Bear Cub"));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Eldrazi Confluence: choose three modes, the same one several times", () => {
      let s = scenario({
        p1: { hand: ["Eldrazi Confluence"], battlefield: lands("Wastes", 4) },
        p2: { battlefield: ["Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Eldrazi Confluence");
      const labels = castOption(s, "p1", card)?.modes.map((m) => plainText(m.label ?? "")) ?? [];
      expect(labels).toHaveLength(10);
      const three = labels.find((l) => l === "A 1/1 Eldrazi Scion + A 1/1 Eldrazi Scion + A 1/1 Eldrazi Scion");
      expect(three).toBeDefined();
      s = settle(castIt(s, "p1", "Eldrazi Confluence", { mode: spellMode(s, "p1", card, three as string) }));
      expect(tokens(s, "Eldrazi Scion")).toHaveLength(3);
      // +3/−3 twice on Bear Cub (it dies) and a blink of a permanent.
      let t = scenario({
        p1: { hand: ["Eldrazi Confluence"], battlefield: [...lands("Wastes", 4), "Sol Ring"] },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
      });
      const c2 = idOf(t, "p1", "hand", "Eldrazi Confluence");
      const label = "A creature gets +3/−3 + Exile a nonland permanent, then return it tapped + A 1/1 Eldrazi Scion";
      const dragon = idOf(t, "p2", "battlefield", "Shivan Dragon");
      t = settle(
        castIt(t, "p1", "Eldrazi Confluence", {
          mode: spellMode(t, "p1", c2, label),
          targets: { p0: [idOf(t, "p2", "battlefield", "Bear Cub")], e0: [dragon] },
        }),
      );
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      const back = idOf(t, "p2", "battlefield", "Shivan Dragon");
      expect([back !== dragon, t.objects[back]?.tapped]).toEqual([true, true]);
    });

    it("Eldritch Immunity: protection from each color for one creature; overload, for all of yours", () => {
      let s = scenario({ p1: { hand: ["Eldritch Immunity"], battlefield: ["Wastes", "Bear Cub", "Savannah Lions"] } });
      const card = idOf(s, "p1", "hand", "Eldritch Immunity");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Eldritch Immunity", { mode: spellMode(s, "p1", card, "Normal cost"), targets: { t: [bear] } }));
      expect(chars(s, bear).protections.map((r) => r.label)).toEqual(["Protection from each color"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).protections).toEqual([]);
      let t = scenario({
        p1: { hand: ["Eldritch Immunity"], battlefield: [...lands("Wastes", 5), "Bear Cub", "Savannah Lions"] },
      });
      const c2 = idOf(t, "p1", "hand", "Eldritch Immunity");
      t = settle(castIt(t, "p1", "Eldritch Immunity", { mode: spellMode(t, "p1", c2, "Overload — {4}{C}") }));
      for (const n of ["Bear Cub", "Savannah Lions"])
        expect(chars(t, idOf(t, "p1", "battlefield", n)).protections).toHaveLength(1);
    });

    it("Kozilek's Command: choose two — Spawn, scry X then draw, exile a creature with mana value X or less, cards from graveyards", () => {
      let s = scenario({
        p1: { hand: ["Kozilek's Command"], battlefield: lands("Wastes", 4) },
        p2: { battlefield: ["Bear Cub", "Shivan Dragon"], graveyard: ["Sol Ring", "Shock", "Forest"] },
      });
      const card = idOf(s, "p1", "hand", "Kozilek's Command");
      const label = "A player creates X 0/1 Eldrazi Spawn + Exile a creature with mana value X or less";
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      // X = 2: Shivan Dragon (6) is not a legal target.
      expect(() =>
        castIt(s, "p1", "Kozilek's Command", {
          x: 2,
          mode: spellMode(s, "p1", card, label),
          targets: { p1: ["p1"], c3: [idOf(s, "p2", "battlefield", "Shivan Dragon")] },
        }),
      ).toThrow();
      s = settle(
        castIt(s, "p1", "Kozilek's Command", {
          x: 2,
          mode: spellMode(s, "p1", card, label),
          targets: { p1: ["p1"], c3: [bear] },
        }),
      );
      expect(tokens(s, "Eldrazi Spawn")).toHaveLength(2);
      expect(s.exile.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      // Scry X then draw, and up to X cards from graveyards exiled.
      let t = scenario({
        p1: { hand: ["Kozilek's Command"], battlefield: lands("Wastes", 4) },
        p2: { graveyard: ["Sol Ring", "Shock", "Forest"] },
      });
      const c2 = idOf(t, "p1", "hand", "Kozilek's Command");
      const gy = (t.players.p2?.graveyard ?? []).slice(0, 2);
      t = settle(
        castIt(t, "p1", "Kozilek's Command", {
          x: 2,
          mode: spellMode(t, "p1", c2, "A player scries X, then draws a card + Exile up to X cards from graveyards"),
          targets: { p2: ["p1"], g4: gy },
        }),
      );
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(t.players.p2?.graveyard).toHaveLength(1);
    });

    it("Null Elemental Blast: counters a multicolored spell or destroys a multicolored permanent", () => {
      let s = scenario({
        p1: { hand: ["Null Elemental Blast"], battlefield: ["Wastes"] },
        p2: { battlefield: ["Trygon Predator", "Bear Cub"] },
      });
      const card = idOf(s, "p1", "hand", "Null Elemental Blast");
      const destroy = castOption(s, "p1", card)?.modes.find((m) => m.label === "Destroy a multicolored permanent");
      expect(namesIn(s, destroy?.targets[0]?.legal)).toEqual(["Trygon Predator"]);
      s = settle(
        castIt(s, "p1", "Null Elemental Blast", {
          mode: destroy?.index,
          targets: { p: [idOf(s, "p2", "battlefield", "Trygon Predator")] },
        }),
      );
      expect(idsOf(s, "p2", "graveyard", "Trygon Predator")).toHaveLength(1);
      // Against a multicolored spell (Vindicate).
      let t = scenario({
        p1: { hand: ["Null Elemental Blast"], battlefield: ["Wastes", "Sol Ring"] },
        p2: { hand: ["Vindicate"], battlefield: ["Plains", "Swamp", "Swamp"] },
        active: "p2",
      });
      t = castIt(t, "p2", "Vindicate", { targets: { t: [idOf(t, "p1", "battlefield", "Sol Ring")] } });
      t = act(t, "p2", { type: "pass" });
      const vindicate = t.stack[0]?.id as string;
      const c2 = idOf(t, "p1", "hand", "Null Elemental Blast");
      t = settle(
        castIt(t, "p1", "Null Elemental Blast", {
          mode: spellMode(t, "p1", c2, "Counter a multicolored spell"),
          targets: { s: [vindicate] },
        }),
      );
      expect(idsOf(t, "p1", "battlefield", "Sol Ring")).toHaveLength(1);
      expect(idsOf(t, "p2", "graveyard", "Vindicate")).toHaveLength(1);
    });
  });
  describe("terrains", () => {
    const playLand = (s: S, name: string, extra: object = {}) =>
      act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", name), ...extra } as never);

    it("Abstergo Entertainment: {1}, {T} one mana of any color; a historic card returns, then all graveyards are exiled", () => {
      let s = scenario({
        p1: { battlefield: ["Abstergo Entertainment", ...lands("Wastes", 4)], graveyard: ["Sol Ring", "Bear Cub"] },
        p2: { graveyard: ["Shock", "Liberator, Urza's Battlethopter"] },
      });
      const abstergo = idOf(s, "p1", "battlefield", "Abstergo Entertainment");
      const spec = activations(s, "p1", abstergo).find((a) => a.label?.startsWith("A historic card"))?.targets[0];
      // Only from your graveyard, and historic: Sol Ring (not Bear Cub, nor the opponent's legendary creature).
      expect(namesIn(s, spec?.legal)).toEqual(["Sol Ring"]);
      s = settle(
        activateLabeled(s, "p1", abstergo, "A historic card", { targets: { t: [idOf(s, "p1", "graveyard", "Sol Ring")] } }),
      );
      expect(handNames(s, "p1")).toEqual(["Sol Ring"]);
      expect([s.players.p1?.graveyard.length, s.players.p2?.graveyard.length]).toEqual([0, 0]);
      expect(s.exile.map((id) => nameOf(s, id)).sort()).toEqual([
        "Abstergo Entertainment",
        "Bear Cub",
        "Liberator, Urza's Battlethopter",
        "Shock",
      ]);
    });

    it("Buried Ruin: {2}, {T}, sacrifice it: an artifact card from your graveyard returns to hand", () => {
      let s = scenario({ p1: { battlefield: ["Buried Ruin", "Wastes", "Wastes"], graveyard: ["Sol Ring", "Bear Cub"] } });
      s = settle(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Buried Ruin"), undefined, {
          targets: { t: [idOf(s, "p1", "graveyard", "Sol Ring")] },
        }),
      );
      expect(handNames(s, "p1")).toEqual(["Sol Ring"]);
      expect(idsOf(s, "p1", "graveyard", "Buried Ruin")).toHaveLength(1);
    });

    it("Emergence Zone: {1}, {T}, sacrifice it: you may cast spells as though they had flash this turn", () => {
      let s = scenario({
        p1: { battlefield: ["Emergence Zone", "Forest", "Forest", "Forest"], hand: ["Bear Cub"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
      s = passAccepting(activate(s, "p1", idOf(s, "p1", "battlefield", "Emergence Zone")), (x) => x.stack.length === 0);
      s = act(s, "p2", { type: "pass" });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(true);
    });

    it("Urza's lands: Mine and Power Plant {C}{C}, Tower {C}{C}{C} with the other two; Planar Nexus has every nonbasic land type", () => {
      let s = scenario({ p1: { battlefield: ["Urza's Mine", "Urza's Tower"] } });
      s = tapMana(s, "Urza's Mine");
      s = tapMana(s, "Urza's Tower");
      expect(pool(s)?.C).toBe(2);
      let t = scenario({ p1: { battlefield: ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"] } });
      for (const n of ["Urza's Mine", "Urza's Power Plant", "Urza's Tower"]) t = tapMana(t, n);
      expect(pool(t)?.C).toBe(7);
      // Planar Nexus is a Mine and a Power Plant: Urza's Tower produces {C}{C}{C}.
      let u = scenario({ p1: { battlefield: ["Planar Nexus", "Urza's Tower"] } });
      expect(chars(u, idOf(u, "p1", "battlefield", "Planar Nexus")).subtypes).toEqual(
        expect.arrayContaining(["Mine", "Power-Plant", "Tower", "Urza's", "Cave", "Sphere", "Desert", "Gate"]),
      );
      expect(chars(u, idOf(u, "p1", "battlefield", "Planar Nexus")).subtypes).not.toContain("Island");
      u = tapMana(u, "Urza's Tower");
      expect(pool(u)?.C).toBe(3);
    });

    it("Urza's Workshop: metalcraft, {C} for each Urza's land", () => {
      const s = scenario({ p1: { battlefield: ["Urza's Workshop", "Urza's Mine", "Planar Nexus", "Sol Ring", "Mox Opal"] } });
      const shop = idOf(s, "p1", "battlefield", "Urza's Workshop");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === shop && a.ability === 1)).toBe(false);
      const t = scenario({
        p1: { battlefield: ["Urza's Workshop", "Urza's Mine", "Planar Nexus", "Sol Ring", "Mox Opal", "Basalt Monolith"] },
      });
      expect(pool(tapMana(t, "Urza's Workshop", 1))?.C).toBe(3);
    });

    it("Urza's Cave: {3}, {T}, sacrifice it: a land card put onto the battlefield tapped", () => {
      let s = scenario({ p1: { battlefield: ["Urza's Cave", ...lands("Wastes", 3)], library: ["Bear Cub", "Urza's Tower"] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "Urza's Cave")));
      expect(s.objects[idOf(s, "p1", "battlefield", "Urza's Tower")]?.tapped).toBe(true);
    });

    it("Urza's Saga: I gains {T}: {C}; II gains the Construct ability; III searches for an artifact with cost {0} or {1}, then it's sacrificed", () => {
      let s = scenario({
        p1: {
          hand: ["Urza's Saga"],
          battlefield: ["Wastes", "Wastes", "Sol Ring"],
          library: ["Forest", "Forest", "Darksteel Citadel", "Basalt Monolith", "Mox Opal", "Forest", "Forest"],
        },
      });
      s = settle(playLand(s, "Urza's Saga"));
      const saga = idOf(s, "p1", "battlefield", "Urza's Saga");
      expect(s.objects[saga]?.counters.lore).toBe(1);
      expect(manaAbilitiesOf(s, saga)).toHaveLength(1);
      s = advanceUntil(
        s,
        (x) =>
          x.turn.number > 3 &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.player === "p1" &&
          (x.objects[saga]?.counters.lore ?? 0) >= 2,
      );
      expect(s.objects[saga]?.counters.lore).toBe(2);
      s = settle(activateLabeled(s, "p1", saga, "A 0/0 Construct artifact creature token"));
      const [construct] = tokens(s, "Construct");
      // Sol Ring, the Construct: two artifacts.
      expect(pt(s, construct ?? "")).toEqual([2, 2]);
      let offered: (string | undefined)[] = [];
      s = advanceUntil(
        s,
        (x) =>
          x.turn.active === "p1" && x.turn.number > 5 && x.pending?.kind === "choice" && x.pending.request.intent === "search",
      );
      const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
      offered = req?.type === "pick" ? namesIn(s, req.options) : [];
      // Mana cost {0} or {1}: Mox Opal; neither Darksteel Citadel (no mana cost) nor Basalt Monolith.
      expect(offered).toEqual(["Mox Opal"]);
      s = settle(s);
      expect(idsOf(s, "p1", "battlefield", "Mox Opal")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Urza's Saga")).toHaveLength(1);
    });

    it("Sanctum of Ugin: a colorless spell with mana value 7 or greater; you may sacrifice it to search for a colorless creature", () => {
      let s = scenario({
        p1: {
          battlefield: ["Sanctum of Ugin", ...lands("Wastes", 9)],
          hand: ["Darksteel Forge"],
          library: ["Bear Cub", "Scrap Trawler", "Forest"],
        },
      });
      let offered: (string | undefined)[] = [];
      s = settle(castIt(s, "p1", "Darksteel Forge"), (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "search") offered = namesIn(cur, req.options);
        return undefined;
      });
      expect(offered).toEqual(["Scrap Trawler"]);
      expect(handNames(s, "p1")).toEqual(["Scrap Trawler"]);
      expect(idsOf(s, "p1", "graveyard", "Sanctum of Ugin")).toHaveLength(1);
    });

    it("Scorched Ruins: two untapped lands must be sacrificed for it to enter; otherwise it goes to the graveyard; {C}{C}{C}{C}", () => {
      let s = scenario({ p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", "Wastes", { name: "Forest", tapped: true }] } });
      s = playLand(s, "Scorched Ruins");
      expect(idsOf(s, "p1", "battlefield", "Scorched Ruins")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Wastes")).toHaveLength(2);
      s = tapMana(s, "Scorched Ruins");
      expect(pool(s)?.C).toBe(4);
      // A single untapped land: to the graveyard.
      let t = scenario({ p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", { name: "Forest", tapped: true }] } });
      t = settle(playLand(t, "Scorched Ruins"));
      expect(idsOf(t, "p1", "graveyard", "Scorched Ruins")).toHaveLength(1);
      expect(idsOf(t, "p1", "battlefield", "Wastes")).toHaveLength(1);
    });

    it("Shrine of the Forsaken Gods: {C}{C} for colorless spells, with seven or more lands", () => {
      const s = scenario({ p1: { battlefield: ["Shrine of the Forsaken Gods", ...lands("Forest", 5)] } });
      const shrine = idOf(s, "p1", "battlefield", "Shrine of the Forsaken Gods");
      expect(legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === shrine)).toHaveLength(1);
      const t = scenario({ p1: { battlefield: ["Shrine of the Forsaken Gods", ...lands("Forest", 6)], hand: ["Shock"] } });
      const u = tapMana(t, "Shrine of the Forsaken Gods", 1);
      // Restricted mana (colorless spells only): separate pool.
      expect(u.players.p1?.restrictedMana?.filter((m) => m.type === "C")).toHaveLength(2);
      expect(manaAbilitiesOf(t, idOf(t, "p1", "battlefield", "Shrine of the Forsaken Gods"))[1]?.restriction?.spell).toEqual({
        colorCount: 0,
      });
    });

    it("The Grey Havens: scry 1 when it enters; one mana of a color among the legendary creature cards in your graveyard", () => {
      let s = scenario({
        p1: { hand: ["The Grey Havens"], graveyard: ["Edgar Markov", "Bear Cub", "Shivan Dragon"] },
      });
      const asked: string[] = [];
      s = settle(playLand(s, "The Grey Havens"), (req) => {
        if (req.intent?.startsWith("scry")) asked.push("scry");
        return undefined;
      });
      expect(asked).toContain("scry");
      const havens = idOf(s, "p1", "battlefield", "The Grey Havens");
      const colors = [...new Set(manaAbilitiesOf(s, havens).flatMap((m) => m.produce))].sort();
      // Edgar Markov (white, black, red); neither Bear Cub nor Shivan Dragon (nonlegendary).
      expect(colors).toEqual(["B", "C", "R", "W"]);
    });

    it("The Mycosynth Gardens: {X}, {T}: becomes a copy of a nontoken artifact with mana value X that you control", () => {
      let s = scenario({ p1: { battlefield: ["The Mycosynth Gardens", "Sol Ring", "Wastes"] } });
      const gardens = idOf(s, "p1", "battlefield", "The Mycosynth Gardens");
      const ring = idOf(s, "p1", "battlefield", "Sol Ring");
      s = settle(activateLabeled(s, "p1", gardens, "Becomes a copy", { x: 1, targets: { t: [ring] } }));
      expect(nameOf(s, gardens)).toBe("The Mycosynth Gardens");
      expect(chars(s, gardens).name).toBe("Sol Ring");
      expect(chars(s, gardens).types).toEqual(["Artifact"]);
    });

    it("Vesuva: you may have it enter tapped as a copy of a land", () => {
      let s = scenario({ p1: { hand: ["Vesuva"], battlefield: ["Urza's Tower"] }, p2: { battlefield: ["Urza's Mine"] } });
      const mine = idOf(s, "p2", "battlefield", "Urza's Mine");
      s = settle(playLand(s, "Vesuva", { chosen: mine }));
      const vesuva = idOf(s, "p1", "battlefield", "Vesuva");
      expect(chars(s, vesuva).name).toBe("Urza's Mine");
      expect(s.objects[vesuva]?.tapped).toBe(true);
    });

    it("War Room: {3}, {T}, pay life equal to the number of colors in your commanders' color identity: draw a card", () => {
      let s = scenario({ p1: { command: ["The Vision"], battlefield: ["War Room", ...lands("Wastes", 3)] } });
      s = settle(activate(s, "p1", idOf(s, "p1", "battlefield", "War Room")));
      expect([s.players.p1?.life, s.players.p1?.hand.length]).toEqual([20, 1]);
      let t = scenario({ p1: { command: ["Edgar Markov"], battlefield: ["War Room", ...lands("Wastes", 3)] } });
      t = settle(activate(t, "p1", idOf(t, "p1", "battlefield", "War Room")));
      expect([t.players.p1?.life, t.players.p1?.hand.length]).toEqual([17, 1]);
      // Not enough life: the ability isn't offered.
      const u = scenario({ p1: { life: 2, command: ["Edgar Markov"], battlefield: ["War Room", ...lands("Wastes", 3)] } });
      expect(canActivate(u, "p1", idOf(u, "p1", "battlefield", "War Room"))).toBe(false);
    });

    it("Witch's Clinic: {2}, {T}: the targeted commander gains lifelink until end of turn", () => {
      let s = scenario({
        p1: { battlefield: ["Witch's Clinic", "Wastes", "Wastes", "Bear Cub", "The Vision"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const clinic = idOf(s, "p1", "battlefield", "Witch's Clinic");
      // No commander: no target.
      expect(canActivate(s, "p1", clinic)).toBe(false);
      const vision = idOf(s, "p1", "battlefield", "The Vision");
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = makeCommander(makeCommander(s, vision), dragon);
      // One commander, yours or an opponent's; not Bear Cub.
      const legal = activations(s, "p1", clinic)[0]?.targets[0]?.legal;
      expect(namesIn(s, legal).sort()).toEqual(["Shivan Dragon", "The Vision"]);
      s = settle(activate(s, "p1", clinic, undefined, { targets: { t: [vision] } }));
      expect(chars(s, vision).keywords).toContain("lifelink");
    });
  });

  describe('"Weight of the World" list and proxy set reserve', () => {
    it("Candelabra of Tawnos: {X}, {T}: untap exactly X targeted lands", () => {
      let s = scenario({ p1: { battlefield: ["Candelabra of Tawnos", ...lands("Wastes", 4)] } });
      const candelabra = idOf(s, "p1", "battlefield", "Candelabra of Tawnos");
      const [a, b, c, d] = idsOf(s, "p1", "battlefield", "Wastes") as [string, string, string, string];
      for (const id of [a, b, c, d]) s = act(s, "p1", { type: "tapForMana", source: id, ability: 0 } as never);
      expect(pool(s)?.C).toBe(4);
      expect(() => activate(s, "p1", candelabra, 0, { x: 2, targets: { t: [a, b, c] } })).toThrow();
      s = settle(activate(s, "p1", candelabra, 0, { x: 2, targets: { t: [a, b] } }));
      expect([a, b, c].map((id) => s.objects[id]?.tapped)).toEqual([false, false, true]);
      expect(s.objects[candelabra]?.tapped).toBe(true);
    });

    it("Null Brooch: {2}, {T}, discard your hand: counter a noncreature spell (not a creature spell)", () => {
      let s = scenario({
        p1: { battlefield: ["Null Brooch", ...lands("Wastes", 2)], hand: ["Bear Cub", "Forest"] },
        p2: { hand: ["Shock", "Bear Cub"], battlefield: lands("Mountain", 2).concat(lands("Forest", 2)) },
        active: "p2",
      });
      const brooch = idOf(s, "p1", "battlefield", "Null Brooch");
      s = castIt(s, "p2", "Bear Cub");
      s = act(s, "p2", { type: "pass" });
      expect(canActivate(s, "p1", brooch)).toBe(false);
      s = settle(s);
      s = castIt(s, "p2", "Shock", { targets: { t: ["p1"] } });
      s = act(s, "p2", { type: "pass" });
      const shock = s.stack[0]?.id as string;
      s = settle(activate(s, "p1", brooch, 0, { targets: { t: [shock] } }));
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p1?.hand).toEqual([]);
      expect(namesIn(s, s.players.p1?.graveyard).sort()).toEqual(["Bear Cub", "Forest"]);
      expect(idsOf(s, "p2", "graveyard", "Shock")).toHaveLength(1);
    });

    it("Mishra's Workshop: {C}{C}{C} to be spent only on artifact spells", () => {
      const s = scenario({
        p1: { battlefield: ["Mishra's Workshop"], hand: ["Palladium Myr", "Glaring Fleshraker"] },
      });
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Palladium Myr"))).toBe(true);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Glaring Fleshraker"))).toBe(false);
      const t = tapMana(s, "Mishra's Workshop");
      expect(t.players.p1?.restrictedMana).toHaveLength(3);
    });

    it("Palladium Myr: {T}: {C}{C}; Foundry Inspector: your artifact spells cost {1} less", () => {
      let s = scenario({ p1: { battlefield: ["Palladium Myr", "Foundry Inspector"], hand: ["Sol Ring", "Bear Cub"] } });
      // Sol Ring ({1}) costs nothing; Bear Cub, which isn't an artifact, still costs {1}{G}.
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Sol Ring"))).toBe(true);
      s = tapMana(s, "Palladium Myr");
      expect(pool(s)?.C).toBe(2);
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    });

    it("Eldrazi Conscription: +10/+10, trample and annihilator 2", () => {
      let s = scenario({
        p1: { battlefield: ["Bear Cub", ...lands("Wastes", 8)], hand: ["Eldrazi Conscription"] },
        p2: { battlefield: ["Forest", "Sol Ring", "Savannah Lions"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Eldrazi Conscription", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([12, 12]);
      expect(chars(s, bear).keywords).toContain("trample");
      s = throughCombat(attack(s, [bear]));
      // The defending player sacrifices two of their three permanents, then takes 12 damage (no blockers).
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(8);
    });

    it("Portal to Phyrexia: each opponent sacrifices three creatures; at your upkeep, a creature from a graveyard returns to you, plus Phyrexian", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: lands("Wastes", 9), hand: ["Portal to Phyrexia"] },
        p2: { battlefield: ["Bear Cub", "Savannah Lions", "Shivan Dragon", "Llanowar Elves"] },
        p3: { battlefield: ["Bear Cub"] },
      });
      s = settle(castIt(s, "p1", "Portal to Phyrexia"));
      expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(1);
      expect(idsOf(s, "p3", "battlefield", "Bear Cub")).toHaveLength(0);
      const dragon = idsOf(s, "p2", "graveyard", "Shivan Dragon")[0];
      expect(dragon).toBeDefined();
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3, 2000);
      const mine = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
      expect(mine).toHaveLength(1);
      expect(chars(s, mine[0] as string).subtypes).toContain("Phyrexian");
    });

    it("508.1f-h: an attacking creature is tapped before the attack tax; sacrificed to pay it, it leaves combat", () => {
      let s = scenario({
        p1: { battlefield: ["Glaring Fleshraker", "Wastes"], hand: ["Mox Opal"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      s = settle(castIt(s, "p1", "Mox Opal"));
      const [spawn] = tokens(s, "Eldrazi Spawn") as [string];
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers" && x.turn.active === "p1" && x.turn.number > 3);
      // {2} tax for the Spawn: the Wastes and the Spawn itself ("sacrifice this token: add {C}").
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: spawn, defender: "p2" }] });
      expect(s.objects[spawn]).toBeUndefined();
      expect(s.combat?.attackers ?? []).toEqual([]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Wastes")]?.tapped).toBe(true);
      // A creature without vigilance that attacks is tapped before payment: it can't pay its own tax.
      let t = scenario({
        p1: { battlefield: ["Llanowar Elves", "Forest"] },
        p2: { battlefield: ["Ghostly Prison"] },
      });
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      const elves = idOf(t, "p1", "battlefield", "Llanowar Elves");
      expect(() => act(t, "p1", { type: "declareAttackers", attackers: [{ id: elves, defender: "p2" }] })).toThrow(
        msg("You must pay {cost} to attack", { cost: "{2}" }),
      );
    });

    it("Super State: base 9/9, flying, first strike, trample, haste; its combat damage to an opponent also hits the others", () => {
      let s = scenario({
        players: 3,
        p1: { battlefield: ["Bear Cub", ...lands("Wastes", 7)], hand: ["Super State"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(castIt(s, "p1", "Super State", { targets: { enchant: [bear] } }));
      expect(pt(s, bear)).toEqual([9, 9]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "firstStrike", "trample", "haste"]));
      s = throughCombat(attack(s, [bear]));
      expect(s.players.p2?.life).toBe(11);
      expect(s.players.p3?.life).toBe(11);
      expect(s.players.p1?.life).toBe(20);
    });
  });
});

describe("PLAN-M M11b: the questions of a land played", () => {
  const offer = (s: S, name: string) => {
    const card = idOf(s, "p1", "hand", name);
    const o = legalActions(s, "p1").find(
      (a): a is Extract<ActionOption, { type: "playLand" }> => a.type === "playLand" && a.card === card,
    );
    return { card, request: o?.choose };
  };

  it("Scorched Ruins: the two untapped lands sacrificed are chosen with the land played (not the first ones)", () => {
    const s = scenario({
      p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", "Forest", "Island", { name: "Plains", tapped: true }] },
    });
    const { card, request } = offer(s, "Scorched Ruins");
    const [wastes, forest, island] = ["Wastes", "Forest", "Island"].map((n) => idOf(s, "p1", "battlefield", n)) as [
      string,
      string,
      string,
    ];
    // "Sacrifice two untapped lands": the three untapped ones offered, two to choose; the suggestion is the first two.
    expect(request?.type === "pick" && [request.options, request.min, request.max, request.suggested]).toEqual([
      [wastes, forest, island],
      2,
      2,
      [wastes, forest],
    ]);
    const t = act(s, "p1", { type: "playLand", card, answer: [forest, island] });
    expect(idsOf(t, "p1", "battlefield", "Scorched Ruins")).toHaveLength(1);
    expect(namesIn(t, t.players.p1?.graveyard).sort()).toEqual(["Forest", "Island"]);
    expect(idsOf(t, "p1", "battlefield", "Wastes")).toHaveLength(1);
    // An answer that isn't two of the offered lands is refused.
    expect(() => act(s, "p1", { type: "playLand", card, answer: [forest] })).toThrow();
    expect(() => act(s, "p1", { type: "playLand", card, answer: [forest, idOf(s, "p1", "battlefield", "Plains")] })).toThrow();
    // The offer changed nothing: the question was asked on a copy (no land sacrificed, no event).
    expect(s.battlefield).toHaveLength(4);
  });

  it("Scorched Ruins: exactly two untapped lands, no question; without an answer, the suggestion", () => {
    const s = scenario({ p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", "Forest", { name: "Plains", tapped: true }] } });
    expect(offer(s, "Scorched Ruins").request).toBeUndefined();
    const u = scenario({ p1: { hand: ["Scorched Ruins"], battlefield: ["Wastes", "Forest", "Island"] } });
    const t = act(u, "p1", { type: "playLand", card: idOf(u, "p1", "hand", "Scorched Ruins") });
    expect(namesIn(t, t.players.p1?.graveyard).sort()).toEqual(["Forest", "Wastes"]);
  });

  it("Lake of the Dead: the Swamp sacrificed is chosen with the land played", () => {
    const s = scenario({ p1: { hand: ["Lake of the Dead"], battlefield: ["Swamp", { name: "Swamp", tapped: true }] } });
    const { card, request } = offer(s, "Lake of the Dead");
    const [untapped, tapped] = idsOf(s, "p1", "battlefield", "Swamp");
    expect(request?.type === "pick" && request.options).toEqual([untapped, tapped]);
    const t = act(s, "p1", { type: "playLand", card, answer: [tapped as string] });
    expect(idsOf(t, "p1", "battlefield", "Lake of the Dead")).toHaveLength(1);
    expect(t.objects[untapped as string]?.zone).toBe("battlefield");
    expect(idsOf(t, "p1", "graveyard", "Swamp")).toHaveLength(1);
  });

  it("Port Town: the card revealed is asked (a detail, autoOk); revealed: untapped; none: tapped", () => {
    const s = scenario({ p1: { hand: ["Port Town", "Island", "Plains", "Opt"] } });
    const { card, request } = offer(s, "Port Town");
    const island = idOf(s, "p1", "hand", "Island");
    const plains = idOf(s, "p1", "hand", "Plains");
    // "A Plains or Island card from your hand": not Opt.
    expect(request?.type === "pick" && [request.options, request.min, request.max, request.autoOk]).toEqual([
      [island, plains],
      0,
      1,
      true,
    ]);
    const shown = submit(s, "p1", { type: "playLand", card, answer: [plains] });
    expect(shown.state.objects[idOf(shown.state, "p1", "battlefield", "Port Town")]?.tapped).toBe(false);
    expect(shown.events.find((e) => e.type === "reveal")).toMatchObject({ defIds: [s.objects[plains]?.defId] });
    const none = submit(s, "p1", { type: "playLand", card, answer: [] });
    expect(none.state.objects[idOf(none.state, "p1", "battlefield", "Port Town")]?.tapped).toBe(true);
    expect(none.events.some((e) => e.type === "reveal")).toBe(false);
    // Without an answer: the suggestion, revealed.
    const auto = act(s, "p1", { type: "playLand", card });
    expect(auto.objects[idOf(auto, "p1", "battlefield", "Port Town")]?.tapped).toBe(false);
    // Nothing to reveal: no question, tapped.
    const u = scenario({ p1: { hand: ["Foreboding Ruins", "Forest"] } });
    expect(offer(u, "Foreboding Ruins").request).toBeUndefined();
    const v = act(u, "p1", { type: "playLand", card: idOf(u, "p1", "hand", "Foreboding Ruins") });
    expect(v.objects[idOf(v, "p1", "battlefield", "Foreboding Ruins")]?.tapped).toBe(true);
  });
});
