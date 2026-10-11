/**
 * Bloomburrow: Offspring, Gift (gift-specific targets, gift of a permanent), Forage (effect, activation cost,
 * alternative cost), Expend, Valiant, paw modes, granted prowess, Mockingbird, Vren, Sunspine Lynx.
 */

import { TOKEN_SPECS } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, destroy } from "../src/actions";
import { protection, protectionAbility } from "../src/dsl";
import { permissionActive } from "../src/effects";
import { RulesError } from "../src/errors";
import { legalActions } from "../src/legal";
import { spellCost } from "../src/stack";
import { changeCounters, chars, moveObject } from "../src/state";
import { plainText } from "../src/text";
import type { GameObject, GameState, PlayerId, TokenSpec } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  canActivate,
  cast,
  castable,
  castNowOf,
  counterFrom,
  customCard,
  exiled,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  passUntil,
  pickNamed,
  settle as resolve,
  scenario,
  untilCastNow,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const castOption = (s: S, name: string) => {
  const card = idOf(s, "p1", "hand", name);
  const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
  return { card, opt: opt?.type === "cast" ? opt : undefined };
};

describe("Bloomburrow", () => {
  it("Offspring: when paid, the creature creates a 1/1 token copy of itself", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Intrepid Rabbit"] } });
    const { card, opt } = castOption(s, "Intrepid Rabbit");
    expect(plainText(opt?.kickerPrompt?.with ?? "")).toBe("Offspring {1}");
    s = act(s, "p1", { type: "cast", card, kicked: true });
    s = settle(s);
    const rabbits = idsOf(s, "p1", "battlefield", "Intrepid Rabbit");
    expect(rabbits).toHaveLength(2);
    const token = rabbits.find((id) => s.objects[id]?.isToken) as string;
    expect(s.defs[s.objects[token]?.defId ?? ""]?.name).toBe("Intrepid Rabbit");
    // The token is 1/1 (plus the +1/+1 from its own enter trigger, if any, until end of turn).
    expect(s.effects.some((e) => e.affected.includes(token) && e.setPower === 1 && e.setToughness === 1)).toBe(true);
  });

  it("Offspring unpaid: no token", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Intrepid Rabbit"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Intrepid Rabbit") });
    s = settle(s);
    expect(idsOf(s, "p1", "battlefield", "Intrepid Rabbit")).toHaveLength(1);
  });

  it('Gift of a Food: the opponent gets it, and "if the gift wasn\'t promised" is inverted', () => {
    const setup = () =>
      scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Jolly Gerbils"], hand: ["Nocturnal Hunger"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
    let s = setup();
    const { card, opt } = castOption(s, "Nocturnal Hunger");
    expect(opt?.kickerPrompt?.with).toBe("Gift a Food");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(act(s, "p1", { type: "cast", card, kicked: true, targets: { t: [dragon] } }));
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(1);
    expect(s.players.p1?.life).toBe(20);
    // Jolly Gerbils: "whenever you give a gift, draw a card".
    expect(s.players.p1?.hand.length).toBe(hand);
    let t = setup();
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Nocturnal Hunger"), targets: { t: [dragon] } }));
    expect(idsOf(t, "p2", "battlefield", "Food")).toHaveLength(0);
    expect(t.players.p1?.life).toBe(18);
  });

  it("Gift: a different target if the gift is promised (Into the Flood Maw)", () => {
    const s = scenario({
      p1: { battlefield: ["Island"], hand: ["Into the Flood Maw"] },
      p2: { battlefield: ["Anthem of Champions"] },
    });
    const anthem = idOf(s, "p2", "battlefield", "Anthem of Champions");
    const { card, opt } = castOption(s, "Into the Flood Maw");
    expect(opt?.modes[0]?.targets[0]?.kickedLegal).toContain(anthem);
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: [anthem] } })).toThrow(RulesError);
    const t = settle(act(s, "p1", { type: "cast", card, kicked: true, targets: { t: [anthem] } }));
    expect(t.players.p2?.hand.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).toContain("Anthem of Champions");
    // The gift Fish enters tapped under the opponent's control.
    const fish = idOf(t, "p2", "battlefield", "Fish");
    expect(t.objects[fish]?.tapped).toBe(true);
  });

  it("Gift of a permanent: the opponent draws when it enters (Scrapshooter)", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] },
      p2: { battlefield: ["Anthem of Champions"], library: ["Forest", "Island"] },
    });
    const hand2 = s.players.p2?.hand.length ?? 0;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true }));
    expect(s.players.p2?.hand.length).toBe(hand2 + 1);
    expect(idsOf(s, "p2", "battlefield", "Anthem of Champions")).toHaveLength(0);
  });

  it("Gift with several opponents: the opponent is chosen on casting the spell, before priority (702.174a)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Swamp", 3), hand: ["Nocturnal Hunger"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nocturnal Hunger"), kicked: true, targets: { t: [dragon] } });
    // The spell is on the stack; nobody has priority yet: its controller chooses the opponent.
    expect(s.pending?.kind).toBe("choice");
    expect(s.pending?.player).toBe("p1");
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" ? req.options : []).toEqual(["p2", "p3"]);
    expect(req?.suggested).toEqual(["p2"]);
    expect(() => act(s, "p1", { type: "choose", values: ["p1"] })).toThrow(RulesError);
    s = settle(act(s, "p1", { type: "choose", values: ["p3"] }));
    expect(idsOf(s, "p3", "battlefield", "Food")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(0);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
  });

  it("Gift of a permanent with several opponents: the opponent chosen on casting it draws on entering (Scrapshooter)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] },
      p2: { battlefield: ["Anthem of Champions"], library: ["Forest", "Island"] },
      p3: { library: ["Forest", "Island"] },
    });
    const hand2 = s.players.p2?.hand.length ?? 0;
    const hand3 = s.players.p3?.hand.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true });
    s = settle(act(s, "p1", { type: "choose", values: ["p3"] }));
    expect(s.players.p3?.hand.length).toBe(hand3 + 1);
    expect(s.players.p2?.hand.length).toBe(hand2);
  });

  it("Gift of a permanent: gone before its gift trigger resolves, the gift still goes to the chosen opponent (PLAN-M M7)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] },
      p2: { battlefield: ["Anthem of Champions"], library: ["Forest", "Island"] },
      p3: { library: ["Forest", "Island"] },
    });
    const hand2 = s.players.p2?.hand.length ?? 0;
    const hand3 = s.players.p3?.hand.length ?? 0;
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true });
    s = act(s, "p1", { type: "choose", values: ["p3"] });
    s = passAccepting(s, (x) => x.stack.some((i) => i.kind === "ability") && x.pending?.kind === "priority");
    // In response, Scrapshooter leaves the battlefield.
    destroy(s, idOf(s, "p1", "battlefield", "Scrapshooter"));
    s = settle(s);
    expect(s.players.p3?.hand.length).toBe(hand3 + 1);
    expect(s.players.p2?.hand.length).toBe(hand2);
  });

  it("Gift in a duel, or with several players and no gift promised: no question", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Scrapshooter"), kicked: true });
    expect(s.pending?.kind).toBe("priority");
    let t = scenario({ players: 3, p1: { battlefield: lands("Forest", 3), hand: ["Scrapshooter"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Scrapshooter") });
    expect(t.pending?.kind).toBe("priority");
  });

  it("Gift copied during casting (Teach by Example): the copy keeps the opponent chosen for the original (707.10)", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Island", 2), ...lands("Swamp", 3)], hand: ["Teach by Example", "Nocturnal Hunger"] },
      p2: { battlefield: ["Shivan Dragon", "Shivan Dragon"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Teach by Example") }));
    const [a, b] = idsOf(s, "p2", "battlefield", "Shivan Dragon") as [string, string];
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nocturnal Hunger"), kicked: true, targets: { t: [a] } });
    expect(s.stack).toHaveLength(2);
    // First the original's gift opponent (lower on the stack), then the copy's new targets.
    const req = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(req?.type === "pick" ? req.options : []).toEqual(["p2", "p3"]);
    s = act(s, "p1", { type: "choose", values: ["p3"] });
    expect(s.stack.every((x) => x.cast?.giftTo === "p3")).toBe(true);
    const retarget = s.pending?.kind === "choice" ? s.pending.request : null;
    expect(retarget?.type === "pick" ? retarget.options : []).toContain(b);
    s = settle(act(s, "p1", { type: "choose", values: [b] }));
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(2);
    expect(idsOf(s, "p3", "battlefield", "Food")).toHaveLength(2);
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(0);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Gift copied by the opponent in a duel (Return the Favor): the gift still goes to the promised opponent (707.10)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Llanowar Elves"], hand: ["Nocturnal Hunger"] },
      p2: { battlefield: [...lands("Mountain", 3), "Shivan Dragon"], hand: ["Return the Favor"] },
    });
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Nocturnal Hunger"), kicked: true, targets: { t: [dragon] } });
    const hunger = s.stack[0]?.id as string;
    s = act(s, "p1", { type: "pass" });
    const favor = idOf(s, "p2", "hand", "Return the Favor");
    const opt = legalActions(s, "p2").find((x) => x.type === "cast" && x.card === favor);
    const mode = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Copy a spell or ability")?.index : undefined;
    s = act(s, "p2", { type: "cast", card: favor, mode, targets: { c: [hunger] } });
    s = passAccepting(s, (x) => x.stack.length === 2 && x.pending?.kind === "choice" && x.pending.player === "p2");
    // The copy, controlled by p2, targets p1's Llanowar Elves.
    s = settle(act(s, "p2", { type: "choose", values: [elves] }));
    expect(idsOf(s, "p1", "graveyard", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Food")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
  });

  it("Forage: three cards exiled from the graveyard, otherwise a sacrificed Food", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Treetop Sentries"], graveyard: ["Opt", "Forest", "Stab"] },
    });
    const hand = s.players.p1?.hand.length ?? 0;
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Treetop Sentries") }));
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect(s.players.p1?.hand.length).toBe(hand); // the creature is gone, one card drawn
    let t = scenario({
      p1: { battlefield: [...lands("Forest", 4), "Bakersbane Duo"], hand: ["Treetop Sentries"] },
    });
    // Bakersbane Duo is not a Food: with no graveyard and no Food, you can't forage.
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Treetop Sentries") }));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Feed the Cycle: forage rather than pay {B} (alternative cost)", () => {
    const s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Feed the Cycle"], graveyard: ["Opt", "Forest", "Stab"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    const { card, opt } = castOption(s, "Feed the Cycle");
    expect(opt?.normalAvailable).toBeFalsy();
    expect(plainText(opt?.altLabel ?? "")).toBe("Forage — {1}{B}");
    const t = settle(
      act(s, "p1", { type: "cast", card, alternative: true, targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }),
    );
    expect(idsOf(t, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
    expect(t.players.p1?.graveyard.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).toEqual(["Feed the Cycle"]);
  });

  it("Feed the Cycle: the player chooses how to forage, three cards or a Food (PLAN-M M6)", () => {
    const food = customCard({ name: "Test Food", types: ["Artifact"], typeLine: "Artifact — Food", subtypes: ["Food"] });
    const start = () =>
      scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), food],
          hand: ["Feed the Cycle"],
          graveyard: ["Opt", "Forest", "Stab", "Island"],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
    let s = start();
    const { card, opt } = castOption(s, "Feed the Cycle");
    const pick = opt?.picks?.find((p) => p.slot === "forage");
    const foodId = idOf(s, "p1", "battlefield", "Test Food");
    expect(pick?.when).toBe("alternative");
    expect(pick?.oneOf?.map((g) => g.count)).toEqual([3, 1]);
    // The suggestion: three cards, lands first.
    expect((pick?.suggested ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toEqual(["Forest", "Island", "Opt"]);
    const target = { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] };
    s = settle(act(s, "p1", { type: "cast", card, alternative: true, targets: target, picks: { forage: [foodId] } }));
    expect(idsOf(s, "p1", "battlefield", "Test Food")).toHaveLength(0);
    // The four cards, Feed the Cycle and the sacrificed Food.
    expect(s.players.p1?.graveyard).toHaveLength(6);
    // Two cards, or two cards and the Food: refused.
    const t = start();
    const gy = t.players.p1?.graveyard ?? [];
    const card2 = idOf(t, "p1", "hand", "Feed the Cycle");
    const target2 = { t: [idOf(t, "p2", "battlefield", "Shivan Dragon")] };
    expect(() =>
      act(t, "p1", { type: "cast", card: card2, alternative: true, targets: target2, picks: { forage: gy.slice(0, 2) } }),
    ).toThrow();
    expect(() =>
      act(t, "p1", {
        type: "cast",
        card: card2,
        alternative: true,
        targets: target2,
        picks: { forage: [...gy.slice(0, 2), idOf(t, "p1", "battlefield", "Test Food")] },
      }),
    ).toThrow();
    // Three chosen cards (the Stab, not the lands).
    const u = settle(
      act(t, "p1", {
        type: "cast",
        card: card2,
        alternative: true,
        targets: target2,
        picks: { forage: gy.filter((id) => t.defs[t.objects[id]?.defId ?? ""]?.name !== "Forest") },
      }),
    );
    expect((u.players.p1?.graveyard ?? []).map((id) => u.defs[u.objects[id]?.defId ?? ""]?.name).sort()).toEqual([
      "Feed the Cycle",
      "Forest",
    ]);
  });

  it("Expend 4: only once, when the fourth mana is spent on spells", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 6), "Teapot Slinger"], hand: ["Playful Shove", "Playful Shove", "Playful Shove"] },
    });
    const p2 = () => s.players.p2?.life ?? 0;
    const shove = () => idsOf(s, "p1", "hand", "Playful Shove")[0] as string;
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    expect(p2()).toBe(19);
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    // Fourth mana: 1 damage from the spell, 2 from Teapot Slinger.
    expect(p2()).toBe(16);
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    expect(p2()).toBe(15);
  });

  it("Valiant: the first time each turn, by a spell or ability you control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Heartfire Hero"], hand: ["Giant Growth", "Giant Growth"] },
    });
    const hero = idOf(s, "p1", "battlefield", "Heartfire Hero");
    s = settle(act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [hero] } }));
    expect(s.objects[hero]?.counters["+1/+1"]).toBe(1);
    s = settle(act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [hero] } }));
    expect(s.objects[hero]?.counters["+1/+1"]).toBe(1);
  });

  it("Valiant: an opposing spell doesn't trigger it", () => {
    let s = scenario({
      p1: { battlefield: ["Heartfire Hero"] },
      p2: { battlefield: ["Forest"], hand: ["Giant Growth"] },
      active: "p2",
    });
    const hero = idOf(s, "p1", "battlefield", "Heartfire Hero");
    s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Giant Growth"), targets: { t: [hero] } }));
    expect(s.objects[hero]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Heartfire Hero: when it dies, damage equal to its power", () => {
    let s = scenario({
      p1: { battlefield: [{ name: "Heartfire Hero", damage: 0 }, "Swamp", "Swamp"], hand: ["Fell"] },
    });
    const hero = idOf(s, "p1", "battlefield", "Heartfire Hero");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Fell"), targets: { t: [hero] } }));
    // Fell targets it: Valiant first gives it a +1/+1 counter (power 2 on dying).
    expect(s.players.p2?.life).toBe(18);
  });

  it("Seasons: fifteen mode combinations, the same mode several times", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 5), hand: ["Season of the Burrow"] } });
    const { card, opt } = castOption(s, "Season of the Burrow");
    expect(s.defs[s.objects[card]?.defId ?? ""]?.spell?.modes).toHaveLength(15);
    // With no possible target, only the {P} mode combinations are offered.
    expect(opt?.modes).toHaveLength(5);
    const five = opt?.modes.find((m) => m.label?.split(" + ").length === 5);
    s = settle(act(s, "p1", { type: "cast", card, mode: five?.index }));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(5);
  });

  it("Seasons: two copies of a targeted mode each have their own target", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 5), hand: ["Season of the Burrow"] },
      p2: { battlefield: ["Shivan Dragon", "Anthem of Champions"], library: ["Forest", "Island", "Swamp"] },
    });
    const { card, opt } = castOption(s, "Season of the Burrow");
    const twice = opt?.modes.find((m) => m.targets.length === 2 && m.label?.split(" + ").length === 2);
    expect(twice).toBeDefined();
    const [a, b] = twice?.targets ?? [];
    s = settle(
      act(s, "p1", {
        type: "cast",
        card,
        mode: twice?.index,
        targets: {
          [a?.id as string]: [idOf(s, "p2", "battlefield", "Shivan Dragon")],
          [b?.id as string]: [idOf(s, "p2", "battlefield", "Anthem of Champions")],
        },
      }),
    );
    expect(s.battlefield.filter((id) => s.objects[id]?.controller === "p2")).toHaveLength(0);
    expect(s.players.p2?.hand).toHaveLength(2);
  });

  it("Prowess of an Otter token and granted prowess (Bria)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 4), "Bria, Riptide Rogue", "Llanowar Elves"], hand: ["Otterball Antics", "Opt"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Otterball Antics") }));
    const otter = idOf(s, "p1", "battlefield", "Otter");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = passAccepting(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }), (x) => x.stack.length === 0);
    expect(chars(s, otter).power).toBeGreaterThanOrEqual(2);
    // Llanowar Elves has prowess thanks to Bria (two noncreature spells cast).
    expect(chars(s, elves).power).toBe(3);
  });

  it("Mockingbird: copies an opposing creature of MV <= mana spent, plus a flying Bird", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Mockingbird"] }, p2: { battlefield: ["Llanowar Elves"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Mockingbird"), x: 1 });
    s = settle(s);
    const bird = s.battlefield.find(
      (id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"),
    ) as string;
    const c = chars(s, bird);
    expect(c.name).toBe("Llanowar Elves");
    expect(c.subtypes).toContain("Bird");
    expect(c.keywords).toContain("flying");
  });

  it("Vren: opposing creatures are exiled; a Rat per exiled creature at the end step", () => {
    let s = scenario({
      p1: { battlefield: ["Vren, the Relentless", "Swamp", "Swamp"], hand: ["Fell"] },
      p2: { battlefield: ["Shivan Dragon"] },
    });
    s = settle(
      act(s, "p1", {
        type: "cast",
        card: idOf(s, "p1", "hand", "Fell"),
        targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] },
      }),
    );
    expect(s.players.p2?.graveyard).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.step === "cleanup" || idsOf(x, "p1", "battlefield", "Rat").length > 0);
    expect(idsOf(s, "p1", "battlefield", "Rat")).toHaveLength(1);
  });

  it("Sunspine Lynx: damage according to each player's nonbasic lands", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Hidden Grotto"], hand: ["Sunspine Lynx"] },
      p2: { battlefield: ["Fabled Passage", "Three Tree City"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sunspine Lynx") }));
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Sunspine Lynx with three players: each player, as much damage as their own nonbasic lands", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: lands("Mountain", 4), hand: ["Sunspine Lynx"] },
      p2: { battlefield: ["Fabled Passage", "Forest"] },
      p3: { battlefield: ["Fabled Passage", "Three Tree City", "Hidden Grotto"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sunspine Lynx") }));
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([20, 19, 17]);
  });

  it("Agate-Blade Assassin: the defending player loses 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Agate-Blade Assassin"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Agate-Blade Assassin"), defender: "p2" }],
    });
    s = settle(s);
    expect(s.players.p2?.life).toBe(19);
    expect(s.players.p1?.life).toBe(21);
  });

  it("Carrot Cake: a Rabbit on entering and another when it's sacrificed", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Carrot Cake"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Carrot Cake") }));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(1);
    const cake = idOf(s, "p1", "battlefield", "Carrot Cake");
    const eat = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cake);
    s = settle(act(s, "p1", { type: "activate", source: cake, ability: eat?.type === "activate" ? eat.ability : -1 }));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(2);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Starfall Invocation: with the gift, a creature destroyed this way comes back", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Shivan Dragon"], hand: ["Starfall Invocation"] },
      p2: { battlefield: ["Llanowar Elves"], library: ["Forest"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Starfall Invocation"), kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(s.players.p2?.hand).toHaveLength(1);
  });

  it("Cache Grab: a permanent card milled into hand, and a Food for a Squirrel", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2),
        hand: ["Cache Grab"],
        library: ["Opt", "Bushy Bodyguard", "Stab", "Island"],
      },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cache Grab") }));
    const names = (zone: "hand" | "graveyard") => s.players.p1?.[zone].map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names("hand")).toHaveLength(1);
    expect(names("graveyard")).toContain("Cache Grab");
    // The suggested card is the first permanent card: Bushy Bodyguard (a Squirrel), hence the Food.
    expect(names("hand")).toEqual(["Bushy Bodyguard"]);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Cruelclaw's Heist: the exiled card stays playable with the gift", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 2), hand: ["Cruelclaw's Heist"] },
      p2: { hand: ["Shivan Dragon", "Forest"], library: ["Island"] },
    });
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cruelclaw's Heist"), kicked: true, targets: { t: ["p2"] } }),
    );
    const dragon = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Shivan Dragon");
    expect(dragon).toBeDefined();
    expect(s.playPermissions?.some((p) => p.card === dragon && p.player === "p1")).toBe(true);
  });

  it("Osteomancer Adept: a creature cast from the graveyard by foraging, with a finality counter", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 2), "Osteomancer Adept"],
        graveyard: ["Llanowar Elves", "Opt", "Stab", "Forest"],
      },
    });
    const adept = idOf(s, "p1", "battlefield", "Osteomancer Adept");
    const tap = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === adept);
    s = settle(act(s, "p1", { type: "activate", source: adept, ability: tap?.type === "activate" ? tap.ability : -1 }));
    const elves = idOf(s, "p1", "graveyard", "Llanowar Elves");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === elves)).toBe(true);
    s = settle(act(s, "p1", { type: "cast", card: elves }));
    const onField = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(s.objects[onField]?.counters.finality).toBe(1);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Festival of Embers: an instant cast from the graveyard for 1 life, then exiled", () => {
    let s = scenario({
      p1: { battlefield: ["Festival of Embers", "Island"], graveyard: ["Opt"], library: ["Forest", "Forest"] },
    });
    const opt = idOf(s, "p1", "graveyard", "Opt");
    s = settle(act(s, "p1", { type: "cast", card: opt }));
    expect(s.players.p1?.life).toBe(19);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Stormchaser's Talent: Otter on entering, then level 2 (returns an instant)", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Stormchaser's Talent"], graveyard: ["Opt"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stormchaser's Talent") }));
    expect(idsOf(s, "p1", "battlefield", "Otter")).toHaveLength(1);
    const cls = idOf(s, "p1", "battlefield", "Stormchaser's Talent");
    const up = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === cls);
    s = settle(act(s, "p1", { type: "activate", source: cls, ability: up?.type === "activate" ? up.ability : -1 }));
    expect(s.objects[cls]?.classLevel).toBe(2);
    expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
  });

  it("Dour Port-Mage: a creature returned (without dying) makes you draw", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Dour Port-Mage", "Llanowar Elves"], library: ["Forest", "Forest"] },
    });
    const mage = idOf(s, "p1", "battlefield", "Dour Port-Mage");
    const hand = s.players.p1?.hand.length ?? 0;
    const bounce = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === mage);
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: mage,
        ability: bounce?.type === "activate" ? bounce.ability : -1,
        targets: { t: [idOf(s, "p1", "battlefield", "Llanowar Elves")] },
      }),
    );
    expect(s.players.p1?.hand.length).toBe(hand + 2);
  });

  it("Valley Flamecaller: +1 damage for a Mouse you control", () => {
    let s = scenario({ p1: { battlefield: ["Valley Flamecaller", "Kindlespark Duo"] } });
    const duo = idOf(s, "p1", "battlefield", "Kindlespark Duo");
    const ping = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === duo);
    // Kindlespark Duo is a Lizard Otter: 1 + 1 damage.
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: duo,
        ability: ping?.type === "activate" ? ping.ability : -1,
        targets: { t: ["p2"] },
      }),
    );
    expect(s.players.p2?.life).toBe(18);
  });

  it("Wishing Well: casts for free, during resolution, a spell with MV equal to the coin counters", () => {
    let s = scenario({ p1: { battlefield: ["Wishing Well"], graveyard: ["Opt", "Stab"], library: ["Forest", "Forest"] } });
    const well = idOf(s, "p1", "battlefield", "Wishing Well");
    const act0 = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === well);
    s = untilCastNow(act(s, "p1", { type: "activate", source: well, ability: act0?.type === "activate" ? act0.ability : -1 }));
    expect(s.objects[well]?.counters.coin).toBe(1);
    const opt = idOf(s, "p1", "graveyard", "Opt");
    // Opt (MV 1), targeted by the reflexive ability, is the only card offered.
    expect(castNowOf(s)?.cards).toEqual([opt]);
    s = settle(act(s, "p1", { type: "cast", card: opt }));
    // Opt resolved (draw) then was exiled instead of going to the graveyard.
    expect(s.players.p1?.hand).toHaveLength(1);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Opt")).toBe(true);
  });

  it("Alania: copies the first instant of the turn (an opponent draws)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Alania, Divergent Storm"], hand: ["Playful Shove", "Playful Shove"] },
      p2: { library: ["Forest", "Island"] },
    });
    const shove = () => idsOf(s, "p1", "hand", "Playful Shove")[0] as string;
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    // The spell and its copy: 2 damage; the opponent drew a card.
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p2?.hand).toHaveLength(1);
    s = settle(act(s, "p1", { type: "cast", card: shove(), targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
  });

  it("Alania: also copies the first Otter spell of the turn, the copy becomes a token; not the second", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Alania, Divergent Storm"], hand: ["Thieving Otter", "Thieving Otter"] },
      p2: { library: ["Forest", "Island"] },
    });
    const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
    s = resolve(cast(s, "p1", "Thieving Otter"), yes);
    const otters = idsOf(s, "p1", "battlefield", "Thieving Otter");
    expect(otters).toHaveLength(2);
    expect(otters.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    expect(s.players.p2?.hand).toHaveLength(1);
    s = resolve(cast(s, "p1", "Thieving Otter"), yes);
    expect(idsOf(s, "p1", "battlefield", "Thieving Otter")).toHaveLength(3);
    expect(s.players.p2?.hand).toHaveLength(1);
  });

  it('Alania: an Alania spell cast earlier doesn\'t count as the first Otter spell ("other than Alania", PLAN-L L4)', () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 7), ...lands("Mountain", 2), "Alania, Divergent Storm"],
        hand: ["Alania, Divergent Storm", "Thieving Otter"],
      },
      p2: { library: ["Forest", "Island"] },
    });
    const yes: Answer = (req) => (req.type === "yesNo" ? [1] : undefined);
    // The second Alania: not an Otter spell "other than Alania", no copy (nobody draws).
    s = resolve(cast(s, "p1", "Alania, Divergent Storm"), yes);
    expect(s.players.p2?.hand).toHaveLength(0);
    // Thieving Otter: the first Otter spell other than Alania, copied.
    s = resolve(cast(s, "p1", "Thieving Otter"), yes);
    expect(idsOf(s, "p1", "battlefield", "Thieving Otter")).toHaveLength(2);
    expect(s.players.p2?.hand).toHaveLength(1);
  });
});

describe("Bloomburrow: cards from the meta decks (PLAN-C, lot C13)", () => {
  /** Answers "yes" to questions and picks the wanted objects. */
  const choosing =
    (want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [1];
      if (req.type !== "pick") return undefined;
      const picked = want.filter((w) => req.options.includes(w));
      return picked.length > 0 ? picked : undefined;
    };
  /** Activates the ability of `source` whose label contains `label`. */
  const activate = (s: S, player: string, source: string, label: string, extra: object = {}) => {
    const a = legalActions(s, player).find(
      (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label}`);
    return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  /** Plays until the next turn (end step included). */
  const toNextTurn = (s: S) => advanceUntil(s, (x) => x.turn.number > s.turn.number);

  it("Fountainport: a 1/1 blue Fish for {3} and 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Fountainport", ...lands("Island", 3)] } });
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Fountainport"), "Fish"));
    const fish = idOf(s, "p1", "battlefield", "Fish");
    expect(pt(s, fish)).toEqual([1, 1]);
    expect(chars(s, fish).colors).toEqual(["U"]);
    expect(s.players.p1?.life).toBe(19);
  });

  it("Fountainport: {2}, {T}, sacrifice a token: draw a card", () => {
    let s = scenario({ p1: { battlefield: ["Fountainport", ...lands("Island", 2)], library: lands("Plains", 5) } });
    createTokens(s, "p1", TOKEN_SPECS.Treasure as TokenSpec, 1);
    s.version += 1;
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Fountainport"), "Sacrifice a token"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
  });

  it("Fountainport: {4}, {T}: a Treasure", () => {
    let s = scenario({ p1: { battlefield: ["Fountainport", ...lands("Island", 4)] } });
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Fountainport"), "Treasure"));
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  describe("Dawn's Truce", () => {
    const setup = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Dawn's Truce"] },
        p2: { battlefield: lands("Mountain", 2), hand: ["Lightning Strike"], library: lands("Mountain", 5) },
      });
      return resolve(cast(s, "p1", "Dawn's Truce", { kicked }));
    };
    const strikeTargets = (s: S) => {
      const opt = legalActions(s, "p2").find((a) => a.type === "cast");
      return opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    };

    it("you and your permanents have hexproof until end of turn", () => {
      let s = setup(false);
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, cub).keywords).toContain("hexproof");
      expect(chars(s, cub).keywords).not.toContain("indestructible");
      expect(s.players.p2?.hand).toHaveLength(1);
      s = act(s, "p1", { type: "pass" });
      const legal = strikeTargets(s);
      expect(legal).toContain("p2");
      expect(legal).not.toContain("p1");
      expect(legal).not.toContain(cub);
    });

    it("gift promised: the opponent draws, your permanents are also indestructible", () => {
      const s = setup(true);
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toEqual(
        expect.arrayContaining(["hexproof", "indestructible"]),
      );
    });
  });

  it("Hired Claw: 1 damage when you attack with a Lizard; {1}{R} once, if an opponent lost life", () => {
    let s = scenario({ p1: { battlefield: ["Hired Claw", ...lands("Mountain", 4)] } });
    const claw = idOf(s, "p1", "battlefield", "Hired Claw");
    expect(canActivate(s, "p1", claw)).toBe(false);
    s = resolve(attack(s, [claw]));
    expect(s.players.p2?.life).toBe(19);
    s = resolve(activate(s, "p1", claw, "counter"));
    expect(s.objects[claw]?.counters["+1/+1"]).toBe(1);
    expect(canActivate(s, "p1", claw)).toBe(false);
  });

  it("Emberheart Challenger: valiant — the top card is exiled and playable this turn; prowess", () => {
    let s = scenario({
      p1: { battlefield: ["Emberheart Challenger", "Forest"], hand: ["Giant Growth"], library: lands("Mountain", 5) },
    });
    const hero = idOf(s, "p1", "battlefield", "Emberheart Challenger");
    expect(chars(s, hero).keywords).toContain("haste");
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [hero] } }));
    expect(namesIn(s, s.exile)).toEqual(["Mountain"]);
    const mountain = s.exile[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === mountain)).toBe(true);
    expect(chars(s, hero).power).toBe(6); // 2 + 3 (Giant Growth) + 1 (prouesse)
  });

  describe("Eddymurk Crab", () => {
    it("costs {1} less per instant or sorcery card in the graveyard; taps up to two creatures", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Eddymurk Crab"], graveyard: ["Opt", "Opt", "Opt", "Hop to It", "Opt"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const targets = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
      s = resolve(cast(s, "p1", "Eddymurk Crab"), choosing(targets));
      for (const id of targets) expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[idOf(s, "p1", "battlefield", "Eddymurk Crab")]?.tapped).toBe(false);
    });

    it("enters tapped if it isn't your turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 7), hand: ["Eddymurk Crab"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      s = resolve(cast(s, "p1", "Eddymurk Crab"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Eddymurk Crab")]?.tapped).toBe(true);
    });
  });

  describe("Lunar Convocation", () => {
    it("you gained life: each opponent loses 1 life at your end step, without a Bat", () => {
      let s = scenario({ p1: { battlefield: ["Lunar Convocation", "Vampire Neonate", ...lands("Swamp", 2)] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(s.players.p2?.life).toBe(19);
      s = toNextTurn(s);
      expect(s.players.p2?.life).toBe(18);
      expect(idsOf(s, "p1", "battlefield", "Bat")).toHaveLength(0);
    });

    it("gained and lost life: a flying Bat; {1}{B}, 2 life: draw", () => {
      let s = scenario({
        p1: { battlefield: ["Lunar Convocation", "Vampire Neonate", ...lands("Swamp", 4)], library: lands("Plains", 5) },
      });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Lunar Convocation"), "Draw"));
      expect(s.players.p1?.life).toBe(19);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
      s = toNextTurn(s);
      const bat = idOf(s, "p1", "battlefield", "Bat");
      expect(chars(s, bat).keywords).toContain("flying");
      expect(s.players.p2?.life).toBe(18);
    });
  });

  describe("Essence Channeler", () => {
    it("flying and vigilance if you lost life this turn; a +1/+1 counter when you gain life", () => {
      let s = scenario({
        p1: { battlefield: ["Essence Channeler", "Vampire Neonate", ...lands("Swamp", 2)] },
        p2: { battlefield: ["Vampire Neonate", ...lands("Swamp", 2)] },
      });
      const channeler = idOf(s, "p1", "battlefield", "Essence Channeler");
      expect(chars(s, channeler).keywords).not.toContain("flying");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      expect(s.objects[channeler]?.counters["+1/+1"]).toBe(1);
      expect(chars(s, channeler).keywords).not.toContain("flying");
      s = act(s, "p1", { type: "pass" });
      s = resolve(activate(s, "p2", idOf(s, "p2", "battlefield", "Vampire Neonate"), ""));
      expect(s.players.p1?.life).toBe(20);
      expect(chars(s, channeler).keywords).toEqual(expect.arrayContaining(["flying", "vigilance"]));
    });

    it("when it dies, puts its counters on a creature you control", () => {
      let s = scenario({
        p1: {
          battlefield: [{ name: "Essence Channeler", counters: { "+1/+1": 2 } }, "Bear Cub", ...lands("Swamp", 2)],
          hand: ["Stab"],
        },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      const channeler = idOf(s, "p1", "battlefield", "Essence Channeler");
      destroy(s, channeler);
      s = resolve(s, choosing([cub]));
      expect(idsOf(s, "p1", "graveyard", "Essence Channeler")).toHaveLength(1);
      expect(s.objects[cub]?.counters["+1/+1"]).toBe(2);
    });
  });

  describe("Iridescent Vinelasher", () => {
    it("landfall: 1 damage to an opponent", () => {
      let s = scenario({ p1: { battlefield: ["Iridescent Vinelasher"], hand: ["Swamp"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Swamp") }));
      expect(s.players.p2?.life).toBe(19);
    });

    it("offspring: a 1/1 token copy, and two landfall triggers", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Iridescent Vinelasher", "Swamp"] } });
      s = resolve(cast(s, "p1", "Iridescent Vinelasher", { kicked: true }));
      const all = idsOf(s, "p1", "battlefield", "Iridescent Vinelasher");
      expect(all).toHaveLength(2);
      const token = all.find((id) => s.objects[id]?.isToken) as string;
      expect(pt(s, token)).toEqual([1, 1]);
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Swamp") }));
      expect(s.players.p2?.life).toBe(18);
    });
  });

  describe("Beza, the Bounding Spring", () => {
    it("catch-up: Treasure, 4 life, two Fish and a card when the opponent has more of each", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 4), hand: ["Beza, the Bounding Spring"], life: 10, library: lands("Plains", 5) },
        p2: { battlefield: [...lands("Forest", 5), "Bear Cub", "Bear Cub"], hand: ["Opt", "Opt"] },
      });
      s = resolve(cast(s, "p1", "Beza, the Bounding Spring"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(14);
      expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Plains"]);
    });

    it("nothing when the opponent doesn't have more (ties included)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Beza, the Bounding Spring"] },
        p2: { battlefield: [...lands("Forest", 4), "Bear Cub", "Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Beza, the Bounding Spring"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
      expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(0);
      expect(s.players.p1?.hand).toHaveLength(0);
    });
  });

  it("Hop to It : trois jetons Lapin 1/1 blancs", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Hop to It"] } });
    s = resolve(cast(s, "p1", "Hop to It"));
    const rabbits = idsOf(s, "p1", "battlefield", "Rabbit");
    expect(rabbits).toHaveLength(3);
    for (const r of rabbits) {
      expect(pt(s, r)).toEqual([1, 1]);
      expect(chars(s, r).colors).toEqual(["W"]);
    }
  });

  it("Caretaker's Talent: one draw per turn for tokens; level 2 copies a token; level 3 +2/+2", () => {
    let s = scenario({
      p1: { battlefield: ["Caretaker's Talent", ...lands("Plains", 8)], hand: ["Hop to It"], library: lands("Island", 5) },
    });
    const talent = idOf(s, "p1", "battlefield", "Caretaker's Talent");
    s = resolve(cast(s, "p1", "Hop to It"));
    expect(s.players.p1?.hand).toHaveLength(1); // a single trigger for three tokens
    const rabbit = idOf(s, "p1", "battlefield", "Rabbit");
    s = resolve(activate(s, "p1", talent, "Level 2"), choosing([rabbit]));
    expect(idsOf(s, "p1", "battlefield", "Rabbit")).toHaveLength(4);
    expect(s.players.p1?.hand).toHaveLength(1); // only once per turn
    expect(pt(s, rabbit)).toEqual([1, 1]);
    s = resolve(activate(s, "p1", talent, "Level 3"));
    for (const r of idsOf(s, "p1", "battlefield", "Rabbit")) expect(pt(s, r)).toEqual([3, 3]);
  });

  describe("Rottenmouth Viper", () => {
    it("on entering: a blight counter; the opponent with no permanent or card loses 4 life", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 6), hand: ["Rottenmouth Viper"] }, p2: { hand: [] } });
      s = resolve(cast(s, "p1", "Rottenmouth Viper"));
      expect(s.objects[idOf(s, "p1", "battlefield", "Rottenmouth Viper")]?.counters.blight).toBe(1);
      expect(s.players.p2?.life).toBe(16);
    });

    it("additional cost: sacrificing nonland permanents reduces it by {1} each, player's choice", () => {
      // Only two Swamps: four sacrifices are needed ({5}{B} - 4 = {1}{B}).
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), "Bear Cub", "Llanowar Elves", "Fountainport", "Vampire Neonate", "Savannah Lions"],
          hand: ["Rottenmouth Viper"],
        },
        p2: { hand: [] },
      });
      const { card, opt } = castOption(s, "Rottenmouth Viper");
      expect(opt).toBeDefined();
      const pick = opt?.picks?.find((p) => p.slot === "sacrificeToPay");
      expect(pick?.options).not.toContain(idOf(s, "p1", "battlefield", "Fountainport"));
      expect(pick?.options).toHaveLength(4);
      const chosen = ["Bear Cub", "Llanowar Elves", "Vampire Neonate", "Savannah Lions"].map((n) =>
        idOf(s, "p1", "battlefield", n),
      );
      s = act(s, "p1", { type: "cast", card, picks: { sacrificeToPay: chosen } });
      for (const n of ["Bear Cub", "Llanowar Elves", "Vampire Neonate", "Savannah Lions"])
        expect(idsOf(s, "p1", "graveyard", n)).toHaveLength(1);
      s = resolve(s);
      expect(idsOf(s, "p1", "battlefield", "Rottenmouth Viper")).toHaveLength(1);
    });

    it("any number: more sacrifices than the generic cost are allowed, the extra ones reduce nothing (PLAN-M M10d)", () => {
      // Six Swamps pay the whole cost; the two creatures are sacrificed anyway ("you may sacrifice any number").
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 6), "Bear Cub", "Savannah Lions"], hand: ["Rottenmouth Viper"] },
        p2: { hand: [] },
      });
      const { card } = castOption(s, "Rottenmouth Viper");
      const chosen = ["Bear Cub", "Savannah Lions"].map((n) => idOf(s, "p1", "battlefield", n));
      s = act(s, "p1", { type: "cast", card, picks: { sacrificeToPay: chosen } });
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Savannah Lions")).toHaveLength(1);
      // Four Swamps tapped ({5}{B} − 2), two left.
      expect(idsOf(s, "p1", "battlefield", "Swamp").filter((id) => !s.objects[id]?.tapped)).toHaveLength(2);
      // With a single Swamp: five sacrifices reduce {5}, the sixth reduces nothing but is sacrificed.
      let t = scenario({
        p1: {
          battlefield: ["Swamp", ...Array.from({ length: 6 }, () => "Bear Cub")],
          hand: ["Rottenmouth Viper"],
        },
        p2: { hand: [] },
      });
      t = act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Rottenmouth Viper"),
        picks: { sacrificeToPay: idsOf(t, "p1", "battlefield", "Bear Cub") },
      });
      expect(idsOf(t, "p1", "graveyard", "Bear Cub")).toHaveLength(6);
      t = resolve(t);
      expect(idsOf(t, "p1", "battlefield", "Rottenmouth Viper")).toHaveLength(1);
    });

    it("with no choice, automatic payment sacrifices nothing if the mana suffices, and as little as possible otherwise", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 6), "Bear Cub"], hand: ["Rottenmouth Viper"] },
        p2: { hand: [] },
      });
      s = resolve(cast(s, "p1", "Rottenmouth Viper"));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub", "Savannah Lions"], hand: ["Rottenmouth Viper"] },
        p2: { hand: [] },
      });
      t = resolve(cast(t, "p1", "Rottenmouth Viper"));
      expect(idsOf(t, "p1", "graveyard", "Bear Cub").length + idsOf(t, "p1", "graveyard", "Savannah Lions").length).toBe(1);
      expect(idsOf(t, "p1", "battlefield", "Rottenmouth Viper")).toHaveLength(1);
    });

    it("on attacking: one more counter, then 4 life per counter (or a discard instead)", () => {
      let s = scenario({
        p1: { battlefield: [{ name: "Rottenmouth Viper", counters: { blight: 1 } }] },
        p2: { hand: ["Opt"] },
      });
      const viper = idOf(s, "p1", "battlefield", "Rottenmouth Viper");
      s = resolve(attack(s, [viper]));
      expect(s.objects[viper]?.counters.blight).toBe(2);
      // The opponent discards their only card once, then loses 4 life the second time.
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.life).toBe(16);
    });
  });

  it("Starscape Cleric: flying, can't block; whenever you gain life, each opponent loses 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Starscape Cleric", "Vampire Neonate", ...lands("Swamp", 2)] } });
    const cleric = idOf(s, "p1", "battlefield", "Starscape Cleric");
    expect(chars(s, cleric).keywords).toEqual(expect.arrayContaining(["flying", "cantBlock"]));
    s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
    expect(s.players.p2?.life).toBe(18);
  });

  it("Keen-Eyed Curator: {1} exiles a card from a graveyard; +4/+4 and trample with four types among the exiled cards", () => {
    let s = scenario({
      p1: { battlefield: ["Keen-Eyed Curator", ...lands("Forest", 4)] },
      p2: { graveyard: ["Forest", "Opt", "Bear Cub", "Hop to It"] },
    });
    const curator = idOf(s, "p1", "battlefield", "Keen-Eyed Curator");
    for (const name of ["Forest", "Opt", "Bear Cub"]) {
      s = resolve(activate(s, "p1", curator, "Exile", { targets: { t: [idOf(s, "p2", "graveyard", name)] } }));
    }
    expect(s.players.p2?.graveyard).toHaveLength(1);
    expect(pt(s, curator)).toEqual([3, 3]);
    s = resolve(activate(s, "p1", curator, "Exile", { targets: { t: [idOf(s, "p2", "graveyard", "Hop to It")] } }));
    expect(pt(s, curator)).toEqual([7, 7]);
    expect(chars(s, curator).keywords).toContain("trample");
  });
});

describe('"You put counters" (lot K2)', () => {
  it("Stocking the Pantry: only the +1/+1 counters you put on your creatures trigger it", () => {
    const setup = (active: PlayerId) =>
      scenario({
        active,
        p1: { battlefield: ["Plains", "Bear Cub", "Stocking the Pantry"], hand: ["Fleeting Flight"] },
        p2: { battlefield: ["Plains", "Bear Cub"], hand: ["Fleeting Flight"] },
      });
    const a = setup("p2");
    expect(counterFrom(a, "p2", idOf(a, "p1", "battlefield", "Bear Cub")).triggered).toEqual([]);
    const b = setup("p1");
    expect(counterFrom(b, "p1", idOf(b, "p1", "battlefield", "Bear Cub")).triggered).toEqual(["Stocking the Pantry"]);
    expect(counterFrom(b, "p1", idOf(b, "p2", "battlefield", "Bear Cub")).triggered).toEqual([]);
  });
});

describe("Mana in any combination (lot K2)", () => {
  it("Muerra, Trash Tactician: {R} or {G} for each Raccoon, split by the player", () => {
    let s = scenario({ step: "draw", p1: { battlefield: ["Muerra, Trash Tactician", "Teapot Slinger"] } });
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    expect(p?.kind === "choice" && p.request.type === "divide" && p.request.among).toEqual(["R", "G"]);
    s = act(s, "p1", { type: "choose", values: [1, 1] });
    expect(s.players.p1?.manaPool.R).toBe(1);
    expect(s.players.p1?.manaPool.G).toBe(1);
  });
});

describe("Untargeted choices handed back to the player (lot K6)", () => {
  /** A creature that spells of color `c` can't target: only an untargeted choice designates it. */
  const shielded = (name: string, c: "G" | "U") =>
    customCard({
      name,
      power: 2,
      toughness: 2,
      abilities: [protectionAbility(protection.from({ colors: [c] }, "Protection from a color"))],
    });
  const counters = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;

  it("Season of Gathering: the creature that gets the counter is chosen on resolution, without targeting it", () => {
    const ward = shielded("Test Green Ward", "G");
    let s = scenario({ p1: { battlefield: [...lands("Forest", 6), ward, "Bear Cub"], hand: ["Season of Gathering"] } });
    const { card, opt } = castOption(s, "Season of Gathering");
    const one = opt?.modes.find((m) => m.label === "+1/+1 counter, vigilance and trample");
    expect(one?.targets).toEqual([]);
    const wardId = idOf(s, "p1", "battlefield", "Test Green Ward");
    let options: string[] = [];
    s = resolve(act(s, "p1", { type: "cast", card, mode: one?.index }), (req) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map(String);
      return [wardId];
    });
    expect(namesIn(s, options).sort()).toEqual(["Bear Cub", "Test Green Ward"]);
    // Protection from green: the creature isn't targeted, it gets the counter, vigilance and trample.
    expect(counters(s, wardId)).toBe(1);
    expect(chars(s, wardId).keywords).toEqual(expect.arrayContaining(["vigilance", "trample"]));
    expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Season of Weaving: the artifact or creature copied is chosen on resolution, without targeting it", () => {
    const ward = shielded("Test Blue Ward", "U");
    let s = scenario({ p1: { battlefield: [...lands("Island", 6), ward, "Bear Cub"], hand: ["Season of Weaving"] } });
    const { card, opt } = castOption(s, "Season of Weaving");
    const copy = opt?.modes.find((m) => m.label === "Copy of an artifact or creature");
    expect(copy?.targets).toEqual([]);
    const wardId = idOf(s, "p1", "battlefield", "Test Blue Ward");
    s = resolve(act(s, "p1", { type: "cast", card, mode: copy?.index }), (req) => (req.type === "pick" ? [wardId] : undefined));
    expect(idsOf(s, "p1", "battlefield", "Test Blue Ward")).toHaveLength(2);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Wick, the Whorled Mind: the counter goes on a Snail chosen on resolution; with no Snail, a token", () => {
    const snail = customCard({ name: "Test Snail", subtypes: ["Snail"], power: 1, toughness: 1 });
    let s = scenario({ p1: { battlefield: [...lands("Swamp", 4), snail, snail], hand: ["Wick, the Whorled Mind"] } });
    const [a, b] = idsOf(s, "p1", "battlefield", "Test Snail") as [string, string];
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Wick, the Whorled Mind"), (req) => {
      if (req.type !== "pick") return undefined;
      options = req.options.map(String);
      return [b];
    });
    expect(options.sort()).toEqual([a, b].sort());
    expect([counters(s, a), counters(s, b)]).toEqual([0, 1]);
    expect(idsOf(s, "p1", "battlefield", "Snail")).toHaveLength(0);

    s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Wick, the Whorled Mind"] } });
    s = resolve(cast(s, "p1", "Wick, the Whorled Mind"));
    const token = idOf(s, "p1", "battlefield", "Snail");
    expect(counters(s, token)).toBe(0);
  });

  describe("Mistbreath Elder", () => {
    const upkeep = (battlefield: string[]) => {
      const s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Mistbreath Elder", ...battlefield] } });
      return passAccepting(s, (x) => x.pending?.kind === "choice" || (x.turn.active === "p1" && x.turn.step === "main1"));
    };

    it("the other creature returned is chosen on resolution (mandatory return); the Elder gets a counter", () => {
      let s = upkeep(["Bear Cub", "Llanowar Elves"]);
      const p = s.pending;
      expect(p?.kind === "choice" && p.request.type === "pick" && p.request.min).toBe(1);
      expect(p?.kind === "choice" && p.request.type === "pick" && namesIn(s, p.request.options.map(String)).sort()).toEqual([
        "Bear Cub",
        "Llanowar Elves",
      ]);
      s = resolve(act(s, "p1", { type: "choose", values: [idOf(s, "p1", "battlefield", "Llanowar Elves")] }));
      expect(namesIn(s, s.players.p1?.hand)).toContain("Llanowar Elves");
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Mistbreath Elder"))).toBe(1);
    });

    it("with no other creature, you may return it itself (declined: it stays, with no counter)", () => {
      const ask = upkeep([]);
      expect(ask.pending?.kind === "choice" && ask.pending.request.type).toBe("yesNo");
      const no = resolve(act(ask, "p1", { type: "choose", values: [0] }));
      expect(counters(no, idOf(no, "p1", "battlefield", "Mistbreath Elder"))).toBe(0);
      const yes = resolve(act(ask, "p1", { type: "choose", values: [1] }));
      expect(idsOf(yes, "p1", "battlefield", "Mistbreath Elder")).toHaveLength(0);
      expect(namesIn(yes, yes.players.p1?.hand)).toContain("Mistbreath Elder");
    });
  });
});

describe("Pawpatch Recruit (lot K6)", () => {
  it("the counter goes on a creature other than the one targeted by the opponent", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Pawpatch Recruit", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const recruit = idOf(s, "p1", "battlefield", "Pawpatch Recruit");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [bear] } });
    let options: string[] = [];
    for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "triggerTarget") {
        options = p.request.options;
        expect(() => act(s, "p1", { type: "choose", values: [bear] })).toThrow();
        s = act(s, "p1", { type: "choose", values: [recruit] });
      } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else break;
    }
    expect(options).not.toContain(bear);
    expect(s.objects[recruit]?.counters["+1/+1"]).toBe(1);
  });
});

describe("Season of the Bold (lot K7)", () => {
  it("{P}{P}{P}: the emblem lasts until the end of your next turn (not until its start)", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 5), hand: ["Season of the Bold"] } });
    const card = idOf(s, "p1", "hand", "Season of the Bold");
    const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    const three = opt?.type === "cast" ? opt.modes.find((m) => m.label === "Each spell: 2 damage to a creature") : undefined;
    expect(three).toBeDefined();
    s = resolve(act(s, "p1", { type: "cast", card, mode: three?.index }));
    const emblems = (x: S) => (x.players.p1?.command ?? []).length;
    expect(emblems(s)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main2" && x.pending?.kind === "priority");
    expect(emblems(s)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.number === 6 && x.pending?.kind === "priority");
    expect(emblems(s)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lot K8: mythic, rare and uncommon cards that no test named.
// ---------------------------------------------------------------------------

/** Answers to choices: mode of a triggered ability (by label), yes or no, wanted objects. */
const answer =
  (o: { mode?: string; yes?: boolean; pick?: string[] } = {}): Answer =>
  (req) => {
    if (req.type === "yesNo") return o.yes === undefined ? undefined : [o.yes ? 1 : 0];
    if (req.type !== "pick") return undefined;
    // Mode of an ability, or "as you choose" option (608.2d): by label.
    if (req.intent === "triggerMode" || (o.mode && req.labels)) {
      const mode = o.mode?.toLowerCase();
      const hit = Object.entries(req.labels ?? {}).find(([, l]) => !!mode && l.toLowerCase().includes(mode));
      if (hit || req.intent === "triggerMode") return hit ? [hit[0]] : undefined;
    }
    const picked = (o.pick ?? []).filter((w) => req.options.includes(w));
    return picked.length > 0 ? picked : undefined;
  };
/** Activates the ability of `source` whose label contains `label`. */
const activateK8 = (s: S, player: PlayerId, source: string, label: string, extra: object = {}): S => {
  const a = legalActions(s, player).find(
    (x) => x.type === "activate" && x.source === source && plainText(x.label ?? "").includes(label),
  );
  if (a?.type !== "activate") throw new Error(`ability "${label}" not found`);
  return act(s, player, { type: "activate", source, ability: a.ability, ...extra });
};
const canActivateK8 = (s: S, player: PlayerId, source: string, label: string) =>
  legalActions(s, player).some((x) => x.type === "activate" && x.source === source && !!x.label?.includes(label));
const ptOf = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
const plusOne = (s: S, id: string) => s.objects[id]?.counters["+1/+1"] ?? 0;
const handOf = (s: S, p: PlayerId = "p1") => namesIn(s, s.players[p]?.hand);
const graveOf = (s: S, p: PlayerId = "p1") => namesIn(s, s.players[p]?.graveyard);
/** Passes and answers choices until a "cast now" priority (608.2g). */
const toCastNow = (s: S, ans: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 300 && !castNowOf(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: ans(p.request, p.player, cur) ?? p.request.suggested });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};
/** A still valid permission to play this card. */
const playable = (s: S, card: string) => (s.playPermissions ?? []).some((p) => p.card === card && permissionActive(s, p));
/** The combination of modes of a paw-mode spell whose labels are exactly `labels`. */
const pawMode = (s: S, name: string, labels: string[]) => {
  const { opt } = castOption(s, name);
  const m = opt?.modes.find((x) => plainText(x.label ?? "") === labels.join(" + "));
  if (!m) throw new Error(`combination not found: ${labels.join(" + ")}`);
  return m.index;
};

describe("Bloomburrow, lot K8 : mythiques", () => {
  it("Byrke: vigilance; on entering, a +1/+1 counter on each of up to two targeted creatures", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), ...lands("Plains", 3), "Bear Cub"], hand: ["Byrke, Long Ear of the Law"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = resolve(cast(s, "p1", "Byrke, Long Ear of the Law"), answer({ pick: [cub, angel] }));
    const byrke = idOf(s, "p1", "battlefield", "Byrke, Long Ear of the Law");
    expect(chars(s, byrke).keywords).toContain("vigilance");
    expect([plusOne(s, cub), plusOne(s, angel), plusOne(s, elves), plusOne(s, byrke)]).toEqual([1, 1, 0, 0]);
  });

  it("Byrke: an attacking creature you control with a +1/+1 counter doubles its counters; with no counter, nothing", () => {
    let s = scenario({
      p1: { battlefield: ["Byrke, Long Ear of the Law", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Savannah Lions"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    s = resolve(attack(s, [cub, lions]));
    expect(plusOne(s, cub)).toBe(4);
    expect(plusOne(s, lions)).toBe(0);
  });

  it("Dragonhawk: exiles X cards (X = your creatures with power 4 or greater), playable until your next end step; 2 damage per card left in exile", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 5), "Shivan Dragon", "Bear Cub"],
        hand: ["Dragonhawk, Fate's Tempest"],
        library: ["Mountain", "Opt", "Forest", "Forest"],
      },
    });
    s = resolve(cast(s, "p1", "Dragonhawk, Fate's Tempest"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Dragonhawk, Fate's Tempest")).keywords).toContain("flying");
    // Shivan Dragon and Dragonhawk: two cards (Bear Cub doesn't have power 4).
    expect(namesIn(s, s.exile).sort()).toEqual(["Mountain", "Opt"]);
    const mountain = exiled(s, "Mountain")[0] as string;
    const opt = exiled(s, "Opt")[0] as string;
    expect(playable(s, opt)).toBe(true);
    s = act(s, "p1", { type: "playLand", card: mountain });
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    // Opt stayed in exile: 2 damage; it is no longer playable after your end step.
    expect(s.players.p2?.life).toBe(18);
    expect(s.exile).toContain(opt);
    expect(playable(s, opt)).toBe(false);
  });

  it("Eluge: P/T equal to your Islands; on entering, a flood counter makes a targeted land an Island as long as it has that counter", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 4), "Forest"], hand: ["Eluge, the Shoreless Sea"] } });
    const forest = idOf(s, "p1", "battlefield", "Forest");
    s = resolve(cast(s, "p1", "Eluge, the Shoreless Sea"), answer({ pick: [forest] }));
    const eluge = idOf(s, "p1", "battlefield", "Eluge, the Shoreless Sea");
    expect(s.objects[forest]?.counters.flood).toBe(1);
    expect(chars(s, forest).subtypes).toEqual(expect.arrayContaining(["Forest", "Island"]));
    expect(ptOf(s, eluge)).toEqual([5, 5]);
    // The effect survives Eluge, but not the flood counter.
    moveObject(s, eluge, "graveyard");
    expect(chars(s, forest).subtypes).toContain("Island");
    changeCounters(s, s.objects[forest] as GameObject, "flood", -1);
    expect(chars(s, forest).subtypes).not.toContain("Island");
  });

  it("Eluge: the first instant or sorcery each turn costs {1} less per flooded land, not the second", () => {
    let s = scenario({
      p1: {
        battlefield: ["Eluge, the Shoreless Sea", "Island", { name: "Forest", counters: { flood: 1 } }, ...lands("Mountain", 3)],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
    });
    const untapped = (x: S) => x.battlefield.filter((id) => chars(x, id).types.includes("Land") && !x.objects[id]?.tapped);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(untapped(s)).toHaveLength(4);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(untapped(s)).toHaveLength(2);
    expect(s.players.p2?.life).toBe(14);
  });

  it('Eluge: the reduction removes {U} symbols first ("{U} (or {1})", 118.7c; PLAN-L L4)', () => {
    // Two flooded lands, tapped: Cancel ({1}{U}{U}) costs {1}, paid by the Mountain.
    const s = scenario({
      p1: {
        battlefield: [
          "Eluge, the Shoreless Sea",
          { name: "Forest", counters: { flood: 1 }, tapped: true },
          { name: "Forest", counters: { flood: 1 }, tapped: true },
          "Mountain",
        ],
        hand: ["Cancel"],
      },
    });
    const cancel = s.defs[s.objects[idOf(s, "p1", "hand", "Cancel")]?.defId ?? ""];
    expect(cancel && spellCost(s, "p1", cancel, {})).toMatchObject({ generic: 1, colored: {} });
  });

  it("Glarb: deathtouch; lands and spells with MV 4 or greater playable from the top of the library, not the others", () => {
    const setup = (top: string) =>
      scenario({ p1: { battlefield: ["Glarb, Calamity's Augur", ...lands("Mountain", 6)], library: [top, "Forest"] } });
    let s = setup("Forest");
    expect(chars(s, idOf(s, "p1", "battlefield", "Glarb, Calamity's Augur")).keywords).toContain("deathtouch");
    const land = s.players.p1?.library[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === land)).toBe(true);
    s = setup("Shivan Dragon");
    const dragon = s.players.p1?.library[0] as string;
    expect(castable(s, "p1", dragon)).toBe(true);
    s = resolve(act(s, "p1", { type: "cast", card: dragon }));
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    s = setup("Lightning Strike");
    expect(castable(s, "p1", s.players.p1?.library[0] as string)).toBe(false);
  });

  it("Glarb : {T} : surveillance 2", () => {
    let s = scenario({ p1: { battlefield: ["Glarb, Calamity's Augur"], library: ["Opt", "Stab", "Forest"] } });
    const glarb = idOf(s, "p1", "battlefield", "Glarb, Calamity's Augur");
    s = resolve(activateK8(s, "p1", glarb, "Surveil 2"), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(s).sort()).toEqual(["Opt", "Stab"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Forest"]);
  });

  it("Helga: a creature spell with MV 4 or greater makes you draw, gain 1 life and put a counter on her; not an MV 3 spell", () => {
    let s = scenario({
      p1: { battlefield: ["Helga, Skittish Seer", ...lands("Mountain", 8)], hand: ["Shivan Dragon", "Goblin Smuggler"] },
    });
    const helga = idOf(s, "p1", "battlefield", "Helga, Skittish Seer");
    s = resolve(cast(s, "p1", "Goblin Smuggler"));
    expect([s.players.p1?.life, plusOne(s, helga), s.players.p1?.hand.length]).toEqual([20, 0, 1]);
    s = resolve(cast(s, "p1", "Shivan Dragon"));
    expect([s.players.p1?.life, plusOne(s, helga), s.players.p1?.hand.length]).toEqual([21, 1, 1]);
  });

  it("Helga: {T}: X mana of one color (X = her power), only for creature spells with MV 4 or greater", () => {
    const s = scenario({
      p1: {
        battlefield: [{ name: "Helga, Skittish Seer", counters: { "+1/+1": 3 } }, ...lands("Mountain", 2)],
        hand: ["Shivan Dragon", "Lightning Strike", "Goblin Smuggler"],
      },
    });
    // Power 4: Helga's {R}{R}{R}{R} and two Mountains pay for Shivan Dragon.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Shivan Dragon"))).toBe(true);
    const t = scenario({
      p1: {
        battlefield: [{ name: "Helga, Skittish Seer", counters: { "+1/+1": 3 } }],
        hand: ["Lightning Strike", "Goblin Smuggler"],
      },
    });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Lightning Strike"))).toBe(false);
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Goblin Smuggler"))).toBe(false);
  });

  it("Helga: her mana also pays a creature spell with {X} in its cost, whatever its mana value", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Helga, Skittish Seer", counters: { "+1/+1": 3 } }],
        hand: ["Wildwood Scourge", "Goblin Smuggler"],
      },
    });
    // Wildwood Scourge ({X}{G}) with X = 1: mana value 2, paid by Helga's mana alone.
    s = resolve(cast(s, "p1", "Wildwood Scourge", { x: 1 }));
    expect(idsOf(s, "p1", "battlefield", "Wildwood Scourge")).toHaveLength(1);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Goblin Smuggler"))).toBe(false);
  });

  it("Hugs: exiles X cards, playable until the end of your next turn; an additional land on each of your turns", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 3), ...lands("Forest", 3)],
        hand: ["Hugs, Grisly Guardian", "Plains"],
        library: ["Island", "Swamp", "Forest", "Forest"],
      },
    });
    s = resolve(cast(s, "p1", "Hugs, Grisly Guardian", { x: 2 }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Hugs, Grisly Guardian")).keywords).toContain("trample");
    expect(namesIn(s, s.exile).sort()).toEqual(["Island", "Swamp"]);
    const island = exiled(s, "Island")[0] as string;
    const swamp = exiled(s, "Swamp")[0] as string;
    s = act(s, "p1", { type: "playLand", card: island });
    s = act(s, "p1", { type: "playLand", card: swamp });
    // Two lands this turn, not a third.
    const plains = idOf(s, "p1", "hand", "Plains");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === plains)).toBe(false);
  });

  it("Hugs: the exiled cards stay playable during your next turn, not after", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 3), ...lands("Forest", 3)],
        hand: ["Hugs, Grisly Guardian"],
        library: lands("Island", 6),
      },
    });
    s = resolve(cast(s, "p1", "Hugs, Grisly Guardian", { x: 1 }));
    const island = s.exile[0] as string;
    s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1");
    expect(playable(s, island)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.number === 6);
    expect(playable(s, island)).toBe(false);
  });

  it("Kitsa: vigilance and prowess; {T}: draw then discard", () => {
    let s = scenario({ p1: { battlefield: ["Kitsa, Otterball Elite"], hand: ["Stab"], library: ["Opt", "Forest"] } });
    const kitsa = idOf(s, "p1", "battlefield", "Kitsa, Otterball Elite");
    expect(chars(s, kitsa).keywords).toEqual(expect.arrayContaining(["vigilance", "prowess"]));
    s = resolve(activateK8(s, "p1", kitsa, "Draw, and then discard"), (req, _p, cur) => pickNamed(cur, req, "Stab"));
    expect(handOf(s)).toEqual(["Opt"]);
    expect(graveOf(s)).toEqual(["Stab"]);
  });

  it("Kitsa: {2}, {T}: copies an instant or sorcery you control, only if its power is 3 or greater", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Kitsa, Otterball Elite", counters: { "+1/+1": 1 } }, ...lands("Mountain", 3)],
        hand: ["Shock"],
      },
    });
    const kitsa = idOf(s, "p1", "battlefield", "Kitsa, Otterball Elite");
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    const shock = s.stack[0]?.id as string;
    // Power 2 until prowess has resolved.
    expect(canActivateK8(s, "p1", kitsa, "Copies")).toBe(false);
    s = passBoth(s);
    expect(chars(s, kitsa).power).toBe(3);
    s = resolve(activateK8(s, "p1", kitsa, "Copies", { targets: { t: [shock] } }));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Lumra: reach and vigilance; mills four cards then returns all land cards from the graveyard tapped; P/T = your lands", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 6),
        hand: ["Lumra, Bellow of the Woods"],
        graveyard: ["Plains"],
        library: ["Island", "Opt", "Swamp", "Bear Cub", "Mountain"],
      },
    });
    s = resolve(cast(s, "p1", "Lumra, Bellow of the Woods"));
    const lumra = idOf(s, "p1", "battlefield", "Lumra, Bellow of the Woods");
    expect(chars(s, lumra).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
    expect(graveOf(s).sort()).toEqual(["Bear Cub", "Opt"]);
    for (const n of ["Plains", "Island", "Swamp"]) expect(s.objects[idOf(s, "p1", "battlefield", n)]?.tapped).toBe(true);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Mountain"]);
    expect(ptOf(s, lumra)).toEqual([9, 9]);
  });

  it("Maha: flying, trample and ward; opposing creatures have base toughness 1, yours don't", () => {
    const s = scenario({
      p1: { battlefield: ["Maha, Its Feathers Night", "Bear Cub"] },
      p2: { battlefield: ["Serra Angel", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
    });
    const maha = idOf(s, "p1", "battlefield", "Maha, Its Feathers Night");
    expect(chars(s, maha).keywords).toEqual(expect.arrayContaining(["flying", "trample", "ward"]));
    expect(ptOf(s, maha)).toEqual([6, 5]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toEqual([4, 1]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([3, 2]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Ral: a noncreature spell gives him a loyalty counter; +1: a 1/1 blue and red Otter with prowess", () => {
    let s = scenario({
      p1: {
        battlefield: ["Ral, Crackling Wit", "Island", "Forest"],
        hand: ["Opt", "Llanowar Elves"],
        library: lands("Plains", 3),
      },
    });
    const ral = idOf(s, "p1", "battlefield", "Ral, Crackling Wit");
    s = resolve(cast(s, "p1", "Opt"));
    expect(s.objects[ral]?.counters.loyalty).toBe(5);
    s = resolve(cast(s, "p1", "Llanowar Elves"));
    expect(s.objects[ral]?.counters.loyalty).toBe(5);
    s = resolve(activateK8(s, "p1", ral, "Otter"));
    expect(s.objects[ral]?.counters.loyalty).toBe(6);
    const otter = idOf(s, "p1", "battlefield", "Otter");
    expect(ptOf(s, otter)).toEqual([1, 1]);
    expect(chars(s, otter).colors.sort()).toEqual(["R", "U"]);
    expect(chars(s, otter).keywords).toContain("prowess");
  });

  it("Ral: −3: draw three cards, then discard two", () => {
    let s = scenario({ p1: { battlefield: ["Ral, Crackling Wit"], hand: ["Opt"], library: ["Plains", "Island", "Swamp"] } });
    const ral = idOf(s, "p1", "battlefield", "Ral, Crackling Wit");
    s = resolve(activateK8(s, "p1", ral, "discard two"));
    expect(s.objects[ral]?.counters.loyalty).toBe(1);
    expect(s.players.p1?.hand).toHaveLength(2);
    expect(s.players.p1?.graveyard).toHaveLength(2);
  });

  it("Ral: −10: draw three cards; emblem — your instants and sorceries have storm", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ral, Crackling Wit", counters: { loyalty: 10 } }, ...lands("Mountain", 2)],
        hand: ["Shock", "Shock"],
        library: lands("Plains", 4),
      },
    });
    const ral = idOf(s, "p1", "battlefield", "Ral, Crackling Wit");
    s = resolve(activateK8(s, "p1", ral, "emblem"));
    expect(s.players.p1?.hand).toHaveLength(5);
    expect(s.players.p1?.command ?? []).toHaveLength(1);
    // First spell of the turn: no copy; second: one copy.
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(14);
  });

  it("Ral: the emblem also counts spells cast by opponents before yours this turn", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ral, Crackling Wit", counters: { loyalty: 10 } }, "Mountain"],
        hand: ["Shock"],
        library: lands("Plains", 4),
      },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Ral, Crackling Wit"), "emblem"));
    s = act(s, "p1", { type: "pass" });
    s = resolve(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(s.players.p1?.life).toBe(18);
    expect(s.turn.active).toBe("p1");
    // A spell (the opponent's) cast before: one copy.
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(16);
  });

  it("Ral: the emblem's storm is counted when the spell is cast, not at resolution (PLAN-M M7)", () => {
    let s = scenario({
      p1: {
        battlefield: [{ name: "Ral, Crackling Wit", counters: { loyalty: 10 } }, ...lands("Mountain", 2)],
        hand: ["Shock", "Shock"],
        library: lands("Plains", 4),
      },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Ral, Crackling Wit"), "emblem"));
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = cast(s, "p1", "Shock", { targets: { t: ["p2"] } });
    s = act(s, "p1", { type: "pass" });
    // The storm trigger waits on the stack; p2 casts a spell in response.
    expect(s.stack).toHaveLength(2);
    s = resolve(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: ["p1"] } }));
    expect(s.players.p1?.life).toBe(18);
    expect(s.players.p2?.life).toBe(14);
  });

  it("Season of Loss: {P} each player sacrifices a creature, then {P}{P} draw for each creature that died under your control this turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Season of Loss"], library: lands("Plains", 3) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const mode = pawMode(s, "Season of Loss", [
      "Each player sacrifices a creature",
      "Draw for each creature that died under your control",
    ]);
    s = resolve(cast(s, "p1", "Season of Loss", { mode }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(handOf(s)).toEqual(["Plains"]);
  });

  it("Season of Loss: {P}{P}{P} each opponent loses X life (X = creature cards in your graveyard)", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 5), "Bear Cub"], hand: ["Season of Loss"], graveyard: ["Llanowar Elves", "Opt"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const mode = pawMode(s, "Season of Loss", [
      "Each player sacrifices a creature",
      "Each opponent loses X life (creatures in the graveyard)",
    ]);
    s = resolve(cast(s, "p1", "Season of Loss", { mode }));
    // Llanowar Elves and Bear Cub, sacrificed by the first mode.
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(20);
  });

  it("Stormsplitter: haste; an instant or sorcery creates a token copy, exiled at the next end step; not a creature spell", () => {
    let s = scenario({
      p1: { battlefield: ["Stormsplitter", ...lands("Mountain", 2)], hand: ["Shock", "Fanatical Firebrand"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Stormsplitter")).keywords).toContain("haste");
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    expect(idsOf(s, "p1", "battlefield", "Stormsplitter")).toHaveLength(2);
    s = resolve(cast(s, "p1", "Fanatical Firebrand"));
    expect(idsOf(s, "p1", "battlefield", "Stormsplitter")).toHaveLength(2);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const left = idsOf(s, "p1", "battlefield", "Stormsplitter");
    expect(left).toHaveLength(1);
    expect(s.objects[left[0] as string]?.isToken).toBeFalsy();
  });

  it("The Infamous Cruelclaw: menace; combat damage to a player — exiles up to one nonland card, cast by discarding a card", () => {
    let s = scenario({
      p1: { battlefield: ["The Infamous Cruelclaw"], hand: ["Opt"], library: ["Forest", "Serra Angel", "Island"] },
    });
    const claw = idOf(s, "p1", "battlefield", "The Infamous Cruelclaw");
    expect(chars(s, claw).keywords).toContain("menace");
    s = toCastNow(attack(s, [claw]), answer({ yes: true }));
    // The discard is the cost paid while casting the spell (rather than its mana cost), not before (PLAN-M M10d).
    expect(graveOf(s)).toEqual([]);
    const angel = exiled(s, "Serra Angel")[0] as string;
    expect(exiled(s, "Forest")).toHaveLength(1);
    const option = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === angel);
    expect(option?.type === "cast" && option.additional?.discard?.count).toBe(1);
    s = resolve(act(s, "p1", { type: "cast", card: angel, discard: [idOf(s, "p1", "hand", "Opt")] }));
    expect(graveOf(s)).toEqual(["Opt"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
  });

  it("The Infamous Cruelclaw: with no card to discard, the exiled card can't be cast and stays in exile (PLAN-M M10d)", () => {
    let s = scenario({ p1: { battlefield: ["The Infamous Cruelclaw"], library: ["Serra Angel", "Island"] } });
    s = toCastNow(attack(s, [idOf(s, "p1", "battlefield", "The Infamous Cruelclaw")]));
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(exiled(s, "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
  });

  it("Warren Warleader: whenever you attack, a tapped and attacking 1/1 Rabbit, or your attackers +1/+1", () => {
    const setup = () => scenario({ p1: { battlefield: ["Warren Warleader", "Bear Cub", "Savannah Lions"] } });
    let s = setup();
    const ids = ["Warren Warleader", "Bear Cub"].map((n) => idOf(s, "p1", "battlefield", n));
    s = resolve(attack(s, ids), answer({ mode: "Rabbit" }));
    const rabbit = idOf(s, "p1", "battlefield", "Rabbit");
    expect(s.objects[rabbit]?.tapped).toBe(true);
    expect(s.combat?.attackers.map((a) => a.id)).toContain(rabbit);
    expect(ptOf(s, ids[1] as string)).toEqual([2, 2]);
    let t = setup();
    t = resolve(attack(t, ids), answer({ mode: "Attackers" }));
    expect(ptOf(t, ids[0] as string)).toEqual([5, 5]);
    expect(ptOf(t, ids[1] as string)).toEqual([3, 3]);
    expect(ptOf(t, idOf(t, "p1", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
    expect(idsOf(t, "p1", "battlefield", "Rabbit")).toHaveLength(0);
  });

  it("Warren Warleader: offspring {2}", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 6), hand: ["Warren Warleader"] } });
    s = resolve(cast(s, "p1", "Warren Warleader", { kicked: true }));
    const all = idsOf(s, "p1", "battlefield", "Warren Warleader");
    expect(all).toHaveLength(2);
    expect(ptOf(s, all.find((id) => s.objects[id]?.isToken) as string)).toEqual([1, 1]);
  });

  it("Ygra: ward; other creatures are Foods; each Food put into the graveyard from the battlefield gives it two counters", () => {
    let s = scenario({
      p1: { battlefield: ["Ygra, Eater of All", "Bear Cub", ...lands("Forest", 2)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ygra = idOf(s, "p1", "battlefield", "Ygra, Eater of All");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(chars(s, ygra).keywords).toContain("ward");
    expect(chars(s, ygra).subtypes).not.toContain("Food");
    for (const id of [cub, angel]) {
      expect(chars(s, id).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, id).subtypes).toContain("Food");
    }
    // The Food creature has "{2}, {T}, sacrifice this permanent: you gain 3 life".
    s = resolve(activateK8(s, "p1", cub, "+3 life"));
    expect(s.players.p1?.life).toBe(23);
    expect(plusOne(s, ygra)).toBe(2);
    destroy(s, angel);
    s = resolve(s);
    expect(plusOne(s, ygra)).toBe(4);
  });
});

describe("Bloomburrow, lot K8 : rares (1)", () => {
  const tokens = (s: S, name: keyof typeof TOKEN_SPECS, n: number) => {
    createTokens(s, "p1", TOKEN_SPECS[name] as TokenSpec, n);
    s.version += 1;
    return s;
  };

  it("Azure Beastbinder: vigilance; can't be blocked by creatures with power 2 or greater; on attacking, an opposing creature loses its abilities and becomes 2/2 until your next turn", () => {
    let s = scenario({
      p1: { battlefield: ["Azure Beastbinder"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    const binder = idOf(s, "p1", "battlefield", "Azure Beastbinder");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    expect(chars(s, binder).keywords).toContain("vigilance");
    s = resolve(attack(s, [binder]), answer({ pick: [angel] }));
    expect(ptOf(s, angel)).toEqual([2, 2]);
    expect(chars(s, angel).keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: binder }] })).toThrow(RulesError);
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: elves, attacker: binder }] })).not.toThrow();
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(ptOf(s, angel)).toEqual([2, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(ptOf(s, angel)).toEqual([4, 4]);
    expect(chars(s, angel).keywords).toContain("flying");
  });

  it("Baylen: tap four tokens — three +1/+1 counters and trample; tap three tokens — draw; two — a mana", () => {
    let s = tokens(scenario({ p1: { battlefield: ["Baylen, the Haymaker"], library: lands("Plains", 3) } }), "Treasure", 4);
    const baylen = idOf(s, "p1", "battlefield", "Baylen, the Haymaker");
    expect(canActivateK8(s, "p1", baylen, "three tokens")).toBe(true);
    s = resolve(activateK8(s, "p1", baylen, "four tokens"));
    expect(plusOne(s, baylen)).toBe(3);
    expect(chars(s, baylen).keywords).toContain("trample");
    expect(idsOf(s, "p1", "battlefield", "Treasure").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(canActivateK8(s, "p1", baylen, "two tokens")).toBe(false);
    let t = tokens(scenario({ p1: { battlefield: ["Baylen, the Haymaker"], library: lands("Plains", 3) } }), "Treasure", 3);
    expect(canActivateK8(t, "p1", baylen, "four tokens")).toBe(false);
    t = resolve(activateK8(t, "p1", idOf(t, "p1", "battlefield", "Baylen, the Haymaker"), "three tokens"));
    expect(handOf(t)).toEqual(["Plains"]);
  });

  it("Byway Barterer: menace; expend 4 — you may discard your hand to draw two cards", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: ["Byway Barterer", ...lands("Mountain", 4)],
          hand: ["Lightning Strike", "Lightning Strike", "Opt"],
          library: lands("Plains", 3),
        },
      });
    const run = (yes: boolean) => {
      let s = setup();
      s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
      return resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), answer({ yes }));
    };
    expect(chars(setup(), idOf(setup(), "p1", "battlefield", "Byway Barterer")).keywords).toContain("menace");
    const yes = run(true);
    expect(handOf(yes)).toEqual(["Plains", "Plains"]);
    expect(graveOf(yes)).toContain("Opt");
    expect(handOf(run(false))).toEqual(["Opt"]);
  });

  it("Camellia: menace for her and your other Squirrels; sacrificing a Food creates a Squirrel; {2}, forage: a counter on each other Squirrel", () => {
    let s = scenario({
      p1: {
        battlefield: ["Camellia, the Seedmiser", "Bushy Bodyguard", "Bear Cub", ...lands("Forest", 4)],
        graveyard: ["Opt", "Stab", "Island"],
      },
      p2: { battlefield: ["Bushy Bodyguard"] },
    });
    s = tokens(s, "Food", 1);
    const camellia = idOf(s, "p1", "battlefield", "Camellia, the Seedmiser");
    const bushy = idOf(s, "p1", "battlefield", "Bushy Bodyguard");
    expect(chars(s, camellia).keywords).toContain("menace");
    expect(chars(s, bushy).keywords).toContain("menace");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("menace");
    expect(chars(s, idOf(s, "p2", "battlefield", "Bushy Bodyguard")).keywords).not.toContain("menace");
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Food"), "+3 life"));
    const squirrel = idOf(s, "p1", "battlefield", "Squirrel");
    expect(ptOf(s, squirrel)).toEqual([1, 1]);
    s = resolve(activateK8(s, "p1", camellia, "Forage"));
    expect(s.players.p1?.graveyard).toHaveLength(0);
    expect([plusOne(s, bushy), plusOne(s, squirrel), plusOne(s, camellia)]).toEqual([1, 1, 0]);
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
  });

  it('Clement: vigilance; your Frogs have "{T}: {G} or {U}, only for a creature spell"', () => {
    const s = scenario({ p1: { battlefield: ["Clement, the Worrywort"], hand: ["Llanowar Elves", "Giant Growth"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Clement, the Worrywort")).keywords).toContain("vigilance");
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Llanowar Elves"))).toBe(true);
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Giant Growth"))).toBe(false);
  });

  it("Clement: a creature that enters under your control returns one of your creatures of lesser mana value", () => {
    let s = scenario({
      p1: { battlefield: ["Clement, the Worrywort", "Bear Cub", ...lands("Plains", 5)], hand: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Serra Angel"), answer({ pick: [cub] }));
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Clement: only your creatures of lesser mana value can be targeted, and the target is chosen on trigger", () => {
    let s = scenario({
      p1: { battlefield: ["Clement, the Worrywort", "Bear Cub", "Serra Angel", ...lands("Plains", 5)], hand: ["Llanowar Elves"] },
    });
    s = passUntil(cast(s, "p1", "Llanowar Elves"), (x) => x.pending?.kind === "choice");
    // Llanowar Elves (MV 1): no creature of lesser mana value, nothing is offered.
    expect(s.pending?.kind === "choice" && s.pending.request.intent === "triggerTarget").toBe(false);
    s = resolve(s);
    expect(handOf(s)).toEqual([]);
    let t = scenario({
      p1: { battlefield: ["Clement, the Worrywort", "Bear Cub", "Serra Angel", ...lands("Plains", 5)], hand: ["Serra Angel"] },
    });
    t = passUntil(cast(t, "p1", "Serra Angel"), (x) => x.pending?.kind === "choice");
    const req = t.pending?.kind === "choice" ? t.pending.request : undefined;
    expect(req?.intent).toBe("triggerTarget");
    // Clement (MV 3) and Bear Cub (MV 2), not the other Serra Angel (MV 5, not lesser).
    expect(namesIn(t, req?.type === "pick" ? req.options : []).sort()).toEqual(["Bear Cub", "Clement, the Worrywort"]);
  });

  it("Coiling Rebirth: a creature card returns from the graveyard; with the gift, a 1/1 token copy as well, unless legendary", () => {
    const setup = (creature: string) =>
      scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Coiling Rebirth"], graveyard: [creature] },
        p2: { library: lands("Island", 3) },
      });
    const run = (creature: string, kicked: boolean) => {
      const s = setup(creature);
      return resolve(cast(s, "p1", "Coiling Rebirth", { kicked, targets: { t: [idOf(s, "p1", "graveyard", creature)] } }));
    };
    const plain = run("Serra Angel", false);
    expect(idsOf(plain, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(plain.players.p2?.hand).toHaveLength(0);
    const gift = run("Serra Angel", true);
    const angels = idsOf(gift, "p1", "battlefield", "Serra Angel");
    expect(angels).toHaveLength(2);
    const token = angels.find((id) => gift.objects[id]?.isToken) as string;
    expect(ptOf(gift, token)).toEqual([1, 1]);
    expect(chars(gift, token).keywords).toContain("flying");
    expect(gift.players.p2?.hand).toHaveLength(1);
    const legend = run("Byrke, Long Ear of the Law", true);
    expect(idsOf(legend, "p1", "battlefield", "Byrke, Long Ear of the Law")).toHaveLength(1);
  });

  it("Colossification: on entering, taps the enchanted creature; +20/+20", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 7), "Bear Cub"], hand: ["Colossification"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Colossification", { targets: { enchant: [cub] } }));
    expect(s.objects[cub]?.tapped).toBe(true);
    expect(ptOf(s, cub)).toEqual([22, 22]);
  });

  it("Darkstar Augur: flying; at your upkeep, the top card into hand, and you lose life equal to its mana value", () => {
    let s = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: ["Darkstar Augur"], library: ["Serra Angel", "Forest"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Darkstar Augur")).keywords).toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // Serra Angel at upkeep (5 life), then the drawn Forest.
    expect(handOf(s).sort()).toEqual(["Forest", "Serra Angel"]);
    expect(s.players.p1?.life).toBe(15);
  });

  it("Darkstar Augur: offspring {B}", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Darkstar Augur"] } });
    s = resolve(cast(s, "p1", "Darkstar Augur", { kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Darkstar Augur")).toHaveLength(2);
  });

  it("Dreamdew Entrancer: reach; taps up to one creature with three stun counters; draw two cards if you control it", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Forest", 2), ...lands("Island", 2), "Bear Cub"],
          hand: ["Dreamdew Entrancer"],
          library: lands("Plains", 3),
        },
        p2: { battlefield: ["Serra Angel"] },
      });
    let s = setup();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Dreamdew Entrancer"), answer({ pick: [angel] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Dreamdew Entrancer")).keywords).toContain("reach");
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[angel]?.counters.stun).toBe(3);
    expect(s.players.p1?.hand).toHaveLength(0);
    let t = setup();
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = resolve(cast(t, "p1", "Dreamdew Entrancer"), answer({ pick: [cub] }));
    expect(t.objects[cub]?.counters.stun).toBe(3);
    expect(handOf(t)).toEqual(["Plains", "Plains"]);
  });

  it("Fecund Greenshell: reach; with ten or more lands, your creatures have +2/+2", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: ["Fecund Greenshell", "Bear Cub", ...lands("Forest", n)] },
        p2: { battlefield: ["Bear Cub"] },
      });
      return [ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub")), ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"))];
    };
    expect(run(9)).toEqual([
      [2, 2],
      [2, 2],
    ]);
    expect(run(10)).toEqual([
      [4, 4],
      [2, 2],
    ]);
  });

  it("Fecund Greenshell: it or a creature with toughness greater than its power enters — the top card: a land onto the battlefield tapped, otherwise into hand", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Fecund Greenshell"], library: ["Island", "Opt"] } });
    s = resolve(cast(s, "p1", "Fecund Greenshell"), answer({ yes: true }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Fecund Greenshell")).keywords).toContain("reach");
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    let t = scenario({
      p1: {
        battlefield: ["Fecund Greenshell", "Swamp", ...lands("Forest", 2)],
        hand: ["Bear Cub", "Vampire Neonate"],
        library: ["Opt", "Island"],
      },
    });
    // Vampire Neonate (0/3): Opt isn't a land, it goes to hand; Bear Cub (2/2) doesn't trigger anything.
    t = resolve(cast(t, "p1", "Vampire Neonate"));
    expect(handOf(t).sort()).toEqual(["Bear Cub", "Opt"]);
    t = resolve(cast(t, "p1", "Bear Cub"));
    expect(handOf(t)).toEqual(["Opt"]);
    expect(namesIn(t, t.players.p1?.library)).toEqual(["Island"]);
    // A land that is declined stays on the library (not in hand), and the next card isn't looked at.
    let u = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Fecund Greenshell"], library: ["Island", "Opt"] } });
    u = resolve(cast(u, "p1", "Fecund Greenshell"), (req) => (req.intent === "lookAtTop" ? [] : undefined));
    expect(handOf(u)).toEqual([]);
    expect(namesIn(u, u.players.p1?.library)).toEqual(["Island", "Opt"]);
  });

  it("Finneas: reach and vigilance; on attacking, a counter on each other token creature or Rabbit; draw if total power reaches 10", () => {
    let s = scenario({
      p1: { battlefield: ["Finneas, Ace Archer", "Intrepid Rabbit", "Bear Cub"], library: lands("Plains", 3) },
    });
    s = tokens(s, "Cat", 1);
    const finneas = idOf(s, "p1", "battlefield", "Finneas, Ace Archer");
    const rabbit = idOf(s, "p1", "battlefield", "Intrepid Rabbit");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const cat = idOf(s, "p1", "battlefield", "Cat");
    expect(chars(s, finneas).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
    s = resolve(attack(s, [finneas]));
    expect([plusOne(s, rabbit), plusOne(s, cat), plusOne(s, cub), plusOne(s, finneas)]).toEqual([1, 1, 0, 0]);
    // 2 + 4 + 2 + 3 = 11: one card.
    expect(handOf(s)).toEqual(["Plains"]);
    let t = scenario({ p1: { battlefield: ["Finneas, Ace Archer", "Intrepid Rabbit"], library: lands("Plains", 3) } });
    t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Finneas, Ace Archer")]));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("For the Common Good: X copies of one of your tokens; your tokens indestructible until your next turn; 1 life per token", () => {
    let s = tokens(scenario({ p1: { battlefield: lands("Forest", 5), hand: ["For the Common Good"] } }), "Food", 1);
    const food = idOf(s, "p1", "battlefield", "Food");
    s = resolve(cast(s, "p1", "For the Common Good", { x: 2, targets: { t: [food] } }));
    const foods = idsOf(s, "p1", "battlefield", "Food");
    expect(foods).toHaveLength(3);
    for (const id of foods) expect(chars(s, id).keywords).toContain("indestructible");
    expect(s.players.p1?.life).toBe(23);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, food).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(chars(s, food).keywords).not.toContain("indestructible");
  });

  it("Gev: ward; with no opponent who lost life, no counter; a Lizard spell deals 1 damage to a targeted opponent", () => {
    let s = scenario({
      p1: { battlefield: ["Gev, Scaled Scorch", ...lands("Forest", 2)], hand: ["Bear Cub", "Hired Claw", "Mountain"] },
    });
    const gev = idOf(s, "p1", "battlefield", "Gev, Scaled Scorch");
    expect(chars(s, gev).keywords).toContain("ward");
    // Nobody lost life: no counter; Bear Cub isn't a Lizard.
    s = resolve(cast(s, "p1", "Bear Cub"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    expect(s.players.p2?.life).toBe(20);
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Mountain") });
    s = resolve(cast(s, "p1", "Hired Claw"), answer({ pick: ["p2"] }));
    expect(s.players.p2?.life).toBe(19);
    // The opponent lost life before resolution: Hired Claw enters with a +1/+1 counter.
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Hired Claw"))).toBe(1);
  });

  it("Gev: opposing creatures don't enter with counters", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Gev, Scaled Scorch"] },
      p2: { battlefield: [...lands("Mountain", 1), ...lands("Forest", 2)], hand: ["Shock", "Bear Cub"] },
    });
    s = resolve(cast(s, "p2", "Shock", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(18);
    s = resolve(cast(s, "p2", "Bear Cub"));
    expect(plusOne(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Hearthborn Battler: haste; a player's second spell in a turn deals 2 damage to a targeted opponent; not the first or the third", () => {
    let s = scenario({
      p1: { battlefield: ["Hearthborn Battler", ...lands("Mountain", 3)], hand: ["Shock", "Shock", "Shock"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Hearthborn Battler")).keywords).toContain("haste");
    const shock = (x: S) => resolve(cast(x, "p1", "Shock", { targets: { t: ["p2"] } }));
    s = shock(s);
    expect(s.players.p2?.life).toBe(18);
    s = shock(s);
    expect(s.players.p2?.life).toBe(14);
    s = shock(s);
    expect(s.players.p2?.life).toBe(12);
  });

  it("Innkeeper's Talent: at the beginning of combat on your turn, a +1/+1 counter on a targeted creature you control", () => {
    let s = scenario({ p1: { battlefield: ["Innkeeper's Talent", "Bear Cub"] }, p2: { battlefield: ["Serra Angel"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(plusOne(s, cub)).toBe(1);
    expect(plusOne(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
  });

  it("Innkeeper's Talent: level 2 — your permanents with counters have ward {1}; level 3 — your counters are doubled", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Innkeeper's Talent",
          { name: "Bear Cub", counters: { "+1/+1": 1 } },
          "Llanowar Elves",
          ...lands("Forest", 6),
        ],
        hand: ["Fleeting Flight", "Plains"],
      },
    });
    const talent = idOf(s, "p1", "battlefield", "Innkeeper's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, cub).keywords).not.toContain("ward");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    expect(chars(s, cub).keywords).toContain("ward");
    expect(chars(s, elves).keywords).not.toContain("ward");
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
    s = resolve(cast(s, "p1", "Fleeting Flight", { targets: { t: [elves] } }));
    expect(plusOne(s, elves)).toBe(2);
    expect(chars(s, elves).keywords).toContain("ward");
  });

  it("Innkeeper's Talent: level 3 — only counters you put are doubled, even on an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Innkeeper's Talent", "Bear Cub", ...lands("Forest", 5), "Plains"], hand: ["Fleeting Flight"] },
      p2: { battlefield: ["Serra Angel", "Plains"], hand: ["Fleeting Flight"] },
    });
    const talent = idOf(s, "p1", "battlefield", "Innkeeper's Talent");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // You put a counter on the opposing Angel: two.
    s = resolve(cast(s, "p1", "Fleeting Flight", { targets: { t: [angel] } }));
    expect(plusOne(s, angel)).toBe(2);
    // An opponent puts a counter on your Bear Cub: just one.
    let t = scenario({
      active: "p2",
      p1: { battlefield: [{ name: "Innkeeper's Talent" }, "Bear Cub"] },
      p2: { battlefield: ["Plains"], hand: ["Fleeting Flight"] },
    });
    const tal = idOf(t, "p1", "battlefield", "Innkeeper's Talent");
    (t.objects[tal] as { classLevel?: number }).classLevel = 3;
    t.version += 1;
    const cub2 = idOf(t, "p1", "battlefield", "Bear Cub");
    t = resolve(cast(t, "p2", "Fleeting Flight", { targets: { t: [cub2] } }));
    expect(plusOne(t, cub2)).toBe(1);
  });

  it("Jackdaw Savior: flying; it or another of your flying creatures dies — another creature card of lesser mana value returns from the graveyard", () => {
    let s = scenario({
      p1: { battlefield: ["Jackdaw Savior", "Bear Cub"], graveyard: ["Llanowar Elves", "Serra Angel"] },
    });
    const jackdaw = idOf(s, "p1", "battlefield", "Jackdaw Savior");
    expect(chars(s, jackdaw).keywords).toContain("flying");
    destroy(s, jackdaw);
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p1", "battlefield", "Jackdaw Savior")).toHaveLength(0);
    // A creature without flying that dies triggers nothing.
    let t = scenario({ p1: { battlefield: ["Jackdaw Savior", "Bear Cub"], graveyard: ["Llanowar Elves"] } });
    destroy(t, idOf(t, "p1", "battlefield", "Bear Cub"));
    t = resolve(t);
    expect(idsOf(t, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
  });

  it("Jackdaw Savior: the card of lesser mana value is targeted on trigger; having left the graveyard, nothing returns", () => {
    let s = scenario({ p1: { battlefield: ["Jackdaw Savior"], graveyard: ["Llanowar Elves", "Bear Cub", "Serra Angel"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Jackdaw Savior"));
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.intent).toBe("triggerTarget");
    // Neither Serra Angel (MV 5), nor Jackdaw Savior herself (MV 3, not lesser).
    expect(namesIn(s, req?.type === "pick" ? req.options : []).sort()).toEqual(["Bear Cub", "Llanowar Elves"]);
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    s = act(s, "p1", { type: "choose", values: [cub] });
    expect(s.stack.at(-1)?.targets.t).toEqual([cub]);
    moveObject(s, cub, "exile");
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(graveOf(s)).toContain("Llanowar Elves");
  });

  it("Kastral: Birds deal combat damage — a counter on each Bird, or draw a card", () => {
    const setup = () =>
      scenario({ p1: { battlefield: ["Kastral, the Windcrested", "Healer's Hawk", "Bear Cub"], library: lands("Plains", 3) } });
    const go = (mode: string) => {
      const s = setup();
      const ids = ["Kastral, the Windcrested", "Healer's Hawk"].map((n) => idOf(s, "p1", "battlefield", n));
      return {
        s: resolve(
          passAccepting(attack(s, ids), (x) => x.turn.step === "combatDamage"),
          answer({ mode }),
        ),
        ids,
      };
    };
    const a = go("counter");
    expect(a.ids.map((id) => plusOne(a.s, id))).toEqual([1, 1]);
    expect(plusOne(a.s, idOf(a.s, "p1", "battlefield", "Bear Cub"))).toBe(0);
    // A single trigger for two Birds.
    expect(a.s.players.p1?.hand).toHaveLength(0);
    const b = go("Draw");
    expect(handOf(b.s)).toEqual(["Plains"]);
    expect(b.ids.map((id) => plusOne(b.s, id))).toEqual([0, 0]);
  });

  it("Kastral: or a Bird from your hand put onto the battlefield with a finality counter", () => {
    let s = scenario({ p1: { battlefield: ["Kastral, the Windcrested"], hand: ["Healer's Hawk"] } });
    s = resolve(
      passAccepting(attack(s, [idOf(s, "p1", "battlefield", "Kastral, the Windcrested")]), (x) => x.turn.step === "combatDamage"),
      answer({ mode: "Bird" }),
    );
    const hawk = idOf(s, "p1", "battlefield", "Healer's Hawk");
    expect(s.objects[hawk]?.counters.finality).toBe(1);
  });

  it("Kitnap: you control the enchanted creature, tapped; with no gift, three stun counters; with it, the opponent draws", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Kitnap"] },
        p2: { battlefield: ["Serra Angel"], library: lands("Plains", 2) },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      return { s: resolve(cast(s, "p1", "Kitnap", { kicked, targets: { enchant: [angel] } })), angel };
    };
    const a = run(false);
    expect(a.s.objects[a.angel]?.controller).toBe("p1");
    expect(a.s.objects[a.angel]?.tapped).toBe(true);
    expect(a.s.objects[a.angel]?.counters.stun).toBe(3);
    expect(a.s.players.p2?.hand).toHaveLength(0);
    const b = run(true);
    expect(b.s.objects[b.angel]?.controller).toBe("p1");
    expect(b.s.objects[b.angel]?.tapped).toBe(true);
    expect(b.s.objects[b.angel]?.counters.stun ?? 0).toBe(0);
    expect(b.s.players.p2?.hand).toHaveLength(1);
  });
});

/** Passes and answers choices until the condition (the defenders don't block). */
const driveUntil = (s: S, until: (x: S) => boolean, ans: Answer = () => undefined): S => {
  let cur = s;
  for (let i = 0; i < 400 && !until(cur); i++) {
    const p = cur.pending;
    if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
    else if (p?.kind === "choice")
      cur = act(cur, p.player, { type: "choose", values: ans(p.request, p.player, cur) ?? p.request.suggested });
    else if (p?.kind === "declareAttackers") cur = act(cur, p.player, { type: "declareAttackers", attackers: [] });
    else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
    else break;
  }
  return cur;
};

describe("Bloomburrow, lot K8 : rares (2)", () => {
  it("Mabel: your other Mice +1/+1; on entering, Cragflame, a legendary colorless Equipment (+1/+1, vigilance, trample, haste; equip {2})", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 3), ...lands("Plains", 2), "Flowerfoot Swordmaster", "Bear Cub"],
        hand: ["Mabel, Heir to Cragflame"],
      },
      p2: { battlefield: ["Flowerfoot Swordmaster"] },
    });
    s = resolve(cast(s, "p1", "Mabel, Heir to Cragflame"));
    const mabel = idOf(s, "p1", "battlefield", "Mabel, Heir to Cragflame");
    expect(ptOf(s, mabel)).toEqual([3, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Flowerfoot Swordmaster"))).toEqual([2, 3]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Flowerfoot Swordmaster"))).toEqual([1, 2]);
    const crag = idOf(s, "p1", "battlefield", "Cragflame");
    const c = chars(s, crag);
    expect(c.supertypes).toContain("Legendary");
    expect(c.colors).toEqual([]);
    expect(c.subtypes).toContain("Equipment");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", crag, "Equip {2}", { targets: { t: [cub] } }));
    expect(ptOf(s, cub)).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["vigilance", "trample", "haste"]));
  });

  it("Manifold Mouse: at the beginning of combat on your turn, a targeted Mouse gains double strike or trample, your choice", () => {
    const run = (mode: string) => {
      const s = scenario({ p1: { battlefield: ["Manifold Mouse", "Flowerfoot Swordmaster", "Bear Cub"] } });
      const sword = idOf(s, "p1", "battlefield", "Flowerfoot Swordmaster");
      return { s: driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ mode, pick: [sword] })), sword };
    };
    const a = run("Double strike");
    expect(chars(a.s, a.sword).keywords).toContain("doubleStrike");
    expect(chars(a.s, a.sword).keywords).not.toContain("trample");
    const b = run("Trample");
    expect(chars(b.s, b.sword).keywords).toContain("trample");
    // Only your Mice are legal targets: Bear Cub gains nothing.
    let s = scenario({ p1: { battlefield: ["Manifold Mouse", "Bear Cub"] } });
    s = driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ mode: "Trample" }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("trample");
    expect(chars(s, idOf(s, "p1", "battlefield", "Manifold Mouse")).keywords).toContain("trample");
  });

  it("Manifold Mouse: offspring {2}", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Manifold Mouse"] } });
    s = resolve(cast(s, "p1", "Manifold Mouse", { kicked: true }));
    expect(idsOf(s, "p1", "battlefield", "Manifold Mouse")).toHaveLength(2);
  });

  it("Mind Spring: draw X cards", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 5), hand: ["Mind Spring"], library: lands("Plains", 5) } });
    s = resolve(cast(s, "p1", "Mind Spring", { x: 3 }));
    expect(handOf(s)).toEqual(["Plains", "Plains", "Plains"]);
  });

  it("Portent of Calamity: four types exiled — a spell cast for free, the rest into hand; the unexiled cards into the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Portent of Calamity"],
        library: ["Forest", "Serra Angel", "Opt", "Duress", "Opt", "Plains"],
      },
    });
    s = toCastNow(cast(s, "p1", "Portent of Calamity", { x: 5 }));
    const angel = exiled(s, "Serra Angel")[0] as string;
    expect(castNowOf(s)?.cards).toContain(angel);
    s = resolve(act(s, "p1", { type: "cast", card: angel }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(handOf(s).sort()).toEqual(["Duress", "Forest", "Opt"]);
    expect(graveOf(s).sort()).toEqual(["Opt", "Portent of Calamity"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Plains"]);
  });

  it("Portent of Calamity: the player chooses one card per type (PLAN-M M8a); three chosen, no free spell", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Portent of Calamity"],
        library: ["Forest", "Serra Angel", "Opt", "Duress", "Opt", "Plains"],
      },
    });
    const lib = s.players.p1?.library ?? [];
    const [forest, angel, opt1, , opt2] = lib as string[];
    s = cast(s, "p1", "Portent of Calamity", { x: 5 });
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    const req = s.pending?.kind === "choice" ? s.pending.request : undefined;
    expect(req?.type === "pick" && [req.options.length, req.min, req.max]).toEqual([5, 0, 5]);
    // Two instants: refused.
    expect(() => act(s, "p1", { type: "choose", values: [opt1 as string, opt2 as string] })).toThrow(RulesError);
    s = resolve(act(s, "p1", { type: "choose", values: [forest as string, angel as string, opt1 as string] }));
    expect(castNowOf(s)).toBeUndefined();
    expect(handOf(s).sort()).toEqual(["Forest", "Opt", "Serra Angel"]);
    expect(graveOf(s).sort()).toEqual(["Duress", "Opt", "Portent of Calamity"]);
  });

  it("Portent of Calamity: fewer than four cards exiled — no free spell, they go to hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Portent of Calamity"], library: ["Forest", "Serra Angel", "Plains"] },
    });
    s = resolve(cast(s, "p1", "Portent of Calamity", { x: 2 }));
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(handOf(s).sort()).toEqual(["Forest", "Serra Angel"]);
  });

  it("Salvation Swan: flash and flying; it or another Bird enters — one of your creatures without flying is exiled and returns at the end step with a flying counter", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Salvation Swan"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Salvation Swan"), answer({ pick: [cub] }));
    const swan = idOf(s, "p1", "battlefield", "Salvation Swan");
    expect(chars(s, swan).keywords).toEqual(expect.arrayContaining(["flash", "flying"]));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(exiled(s, "Bear Cub")).toHaveLength(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[back]?.counters.flying).toBe(1);
    expect(chars(s, back).keywords).toContain("flying");
  });

  it("Scavenger's Talent: a Food when one or more of your creatures die, once per turn", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenger's Talent", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Scavenger's Talent: level 2 — sacrificing a permanent mills two cards for a targeted player; level 3 — at your end step, sacrificing three permanents reanimates a creature with a finality counter", () => {
    let s = scenario({
      p1: { battlefield: ["Scavenger's Talent", ...lands("Swamp", 7)], graveyard: ["Serra Angel"] },
      p2: { library: lands("Island", 5) },
    });
    s.version += 1;
    createTokens(s, "p1", TOKEN_SPECS.Food as TokenSpec, 4);
    const talent = idOf(s, "p1", "battlefield", "Scavenger's Talent");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(activateK8(s, "p1", idsOf(s, "p1", "battlefield", "Food")[0] as string, "+3 life"), answer({ pick: ["p2"] }));
    expect(s.players.p2?.graveyard).toHaveLength(2);
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    s = driveUntil(
      s,
      (x) => x.turn.active === "p2",
      (req) =>
        req.type === "yesNo"
          ? [1]
          : req.type === "pick" && req.intent === "sacrifice"
            ? req.options.slice(0, 3)
            : req.type === "pick" && req.options.includes("p2")
              ? ["p2"]
              : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    expect(s.objects[angel]?.counters.finality).toBe(1);
    // Three sacrifices at level 2: six more cards milled (the library had only three).
    expect(s.players.p2?.library).toHaveLength(0);
  });

  it("Serra Redeemer: flying; another creature with power 2 or less enters under your control — two +1/+1 counters; not a stronger or opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Redeemer", ...lands("Plains", 7)], hand: ["Savannah Lions", "Serra Angel"] },
      p2: { battlefield: ["Plains"], hand: ["Savannah Lions"] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Serra Redeemer")).keywords).toContain("flying");
    s = resolve(cast(s, "p1", "Savannah Lions"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(2);
    s = resolve(cast(s, "p1", "Serra Angel"));
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toBe(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = resolve(cast(s, "p2", "Savannah Lions"));
    expect(plusOne(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toBe(0);
  });

  it("Tender Wildguide: {T}: one mana of any color; {T}: a +1/+1 counter on it; offspring {2}", () => {
    let s = scenario({ p1: { battlefield: ["Tender Wildguide"] } });
    const guide = idOf(s, "p1", "battlefield", "Tender Wildguide");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === guide ? a.colors : []));
    expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    s = resolve(activateK8(s, "p1", guide, "counter"));
    expect(plusOne(s, guide)).toBe(1);
    expect(s.objects[guide]?.tapped).toBe(true);
    let t = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Tender Wildguide"] } });
    t = resolve(cast(t, "p1", "Tender Wildguide", { kicked: true }));
    expect(idsOf(t, "p1", "battlefield", "Tender Wildguide")).toHaveLength(2);
  });

  it("Thornvault Forager: {T}, forage: two mana; {3}{G}, {T}: searches for a Squirrel card", () => {
    let s = scenario({ p1: { battlefield: ["Thornvault Forager"], graveyard: ["Opt", "Stab", "Island"] } });
    const forager = idOf(s, "p1", "battlefield", "Thornvault Forager");
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === forager && a.colors.includes("G"))).toBe(
      true,
    );
    s = resolve(activateK8(s, "p1", forager, "Forage"));
    const pool = s.players.p1?.manaPool ?? {};
    expect(Object.values(pool).reduce((n: number, v) => n + (typeof v === "number" ? v : 0), 0)).toBe(2);
    expect(s.players.p1?.graveyard).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: ["Thornvault Forager", ...lands("Forest", 4)], library: ["Forest", "Bushy Bodyguard", "Opt"] },
    });
    t = resolve(activateK8(t, "p1", idOf(t, "p1", "battlefield", "Thornvault Forager"), "Squirrel"));
    expect(handOf(t)).toEqual(["Bushy Bodyguard"]);
  });

  it("Thornvault Forager: the player chooses the three cards foraged for the cost (PLAN-M M6)", () => {
    let s = scenario({ p1: { battlefield: ["Thornvault Forager"], graveyard: ["Opt", "Stab", "Island", "Forest"] } });
    const forager = idOf(s, "p1", "battlefield", "Thornvault Forager");
    const offer = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === forager && plainText(x.label ?? "").includes("Forage"),
    );
    const pick = offer?.type === "activate" ? offer.picks?.find((p) => p.slot === "forage") : undefined;
    // The suggestion: the lands first.
    expect(namesIn(s, pick?.suggested)).toEqual(["Island", "Forest", "Opt"]);
    const [opt, stab, island] = s.players.p1?.graveyard ?? [];
    s = resolve(activateK8(s, "p1", forager, "Forage", { picks: { forage: [opt, stab, island] } }));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
  });

  it("Thundertrap Trainer: looks at four cards, a noncreature nonland card into hand, the rest on the bottom; offspring {4}", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Island", 6),
        hand: ["Thundertrap Trainer"],
        library: ["Bear Cub", "Forest", "Opt", "Island", "Plains"],
      },
    });
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Thundertrap Trainer"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "lookAtTop") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(options).toEqual(["Opt"]);
    expect(handOf(s)).toEqual(["Opt"]);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Plains");
    let t = scenario({ p1: { battlefield: lands("Island", 6), hand: ["Thundertrap Trainer"] } });
    t = resolve(cast(t, "p1", "Thundertrap Trainer", { kicked: true }));
    expect(idsOf(t, "p1", "battlefield", "Thundertrap Trainer")).toHaveLength(2);
  });

  it("Valley Floodcaller: flash; your noncreature spells have flash; each gives +1/+1 to your Birds, Frogs, Otters and Rats and untaps them", () => {
    let s = scenario({
      p1: {
        battlefield: [
          { name: "Valley Floodcaller", tapped: true },
          { name: "Healer's Hawk", tapped: true },
          { name: "Bear Cub", tapped: true },
          "Island",
          "Swamp",
        ],
        hand: ["Opt", "Duress"],
        library: lands("Plains", 3),
      },
    });
    const caller = idOf(s, "p1", "battlefield", "Valley Floodcaller");
    const hawk = idOf(s, "p1", "battlefield", "Healer's Hawk");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, caller).keywords).toContain("flash");
    s = cast(s, "p1", "Opt");
    // A sorcery while the stack isn't empty.
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Duress"))).toBe(true);
    s = resolve(s);
    expect([s.objects[caller]?.tapped, s.objects[hawk]?.tapped, s.objects[cub]?.tapped]).toEqual([false, false, true]);
    expect(ptOf(s, caller)).toEqual([3, 3]);
    expect(ptOf(s, hawk)).toEqual([2, 2]);
    expect(ptOf(s, cub)).toEqual([2, 2]);
  });

  it("Valley Mightcaller: trample; another Frog, Rabbit, Raccoon or Squirrel enters under your control — a +1/+1 counter", () => {
    let s = scenario({
      p1: { battlefield: ["Valley Mightcaller", ...lands("Forest", 4)], hand: ["Bushy Bodyguard", "Bear Cub"] },
      p2: { battlefield: lands("Forest", 2), hand: ["Bushy Bodyguard"] },
    });
    const caller = idOf(s, "p1", "battlefield", "Valley Mightcaller");
    expect(chars(s, caller).keywords).toContain("trample");
    s = resolve(cast(s, "p1", "Bushy Bodyguard"), answer({ yes: false }));
    expect(plusOne(s, caller)).toBe(1);
    s = resolve(cast(s, "p1", "Bear Cub"));
    expect(plusOne(s, caller)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = resolve(cast(s, "p2", "Bushy Bodyguard"), answer({ yes: false }));
    expect(plusOne(s, caller)).toBe(1);
  });

  it("Valley Questcaller: your other Rabbits, Bats, Birds and Mice +1/+1; their entering (one or several) makes you look at a card", () => {
    let s = scenario({
      p1: { battlefield: ["Valley Questcaller", "Healer's Hawk", "Bear Cub", ...lands("Plains", 3)], hand: ["Hop to It"] },
      p2: { battlefield: ["Healer's Hawk"] },
    });
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Valley Questcaller"))).toEqual([2, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Healer's Hawk"))).toEqual([2, 2]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Healer's Hawk"))).toEqual([1, 1]);
    let scries = 0;
    s = resolve(cast(s, "p1", "Hop to It"), (req) => {
      if (req.intent === "scryBottom") scries += 1;
      return undefined;
    });
    expect(scries).toBe(1);
    for (const id of idsOf(s, "p1", "battlefield", "Rabbit")) expect(ptOf(s, id)).toEqual([2, 2]);
  });

  it("Valley Rotcaller: menace; on attacking, each opponent loses X life and you gain X (your other Squirrels, Bats, Lizards and Rats)", () => {
    let s = scenario({ p1: { battlefield: ["Valley Rotcaller", "Bushy Bodyguard", "Hired Claw", "Bear Cub"] } });
    const rot = idOf(s, "p1", "battlefield", "Valley Rotcaller");
    expect(chars(s, rot).keywords).toContain("menace");
    s = resolve(attack(s, [rot]));
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Whiskervale Forerunner: valiant — looks at five cards; outside your turn, a creature with MV 3 or less goes into hand", () => {
    let s = scenario({
      active: "p2",
      p1: {
        battlefield: ["Whiskervale Forerunner", "Forest"],
        hand: ["Giant Growth"],
        library: ["Serra Angel", "Bear Cub", "Forest", "Opt", "Island", "Plains"],
      },
    });
    const fore = idOf(s, "p1", "battlefield", "Whiskervale Forerunner");
    s = act(s, "p2", { type: "pass" });
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [fore] } }), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "lookAtTop") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(options).toEqual(["Bear Cub"]);
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Plains");
  });

  it("Whiskervale Forerunner: during your turn, the creature can go onto the battlefield", () => {
    let s = scenario({
      p1: { battlefield: ["Whiskervale Forerunner", "Forest"], hand: ["Giant Growth"], library: ["Bear Cub", "Forest"] },
    });
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Whiskervale Forerunner")] } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it('Whiskervale Forerunner: during your turn, you can also keep it in hand ("if you don\'t put it onto the battlefield")', () => {
    let s = scenario({
      p1: {
        battlefield: ["Whiskervale Forerunner", "Forest"],
        hand: ["Giant Growth"],
        library: ["Bear Cub", "Forest", "Opt", "Island", "Plains", "Swamp"],
      },
    });
    let asked = false;
    s = resolve(
      cast(s, "p1", "Giant Growth", { targets: { t: [idOf(s, "p1", "battlefield", "Whiskervale Forerunner")] } }),
      (req) => {
        if (req.type !== "yesNo") return undefined;
        asked = true;
        return [0];
      },
    );
    expect(asked).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Swamp");
  });

  it("Zoraline: flying and vigilance; on entering, pay {W}{B} and 2 life to reanimate a nonland permanent with MV 3 or less with a finality counter", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: [...lands("Plains", 3), ...lands("Swamp", 2)],
          hand: ["Zoraline, Cosmos Caller"],
          graveyard: ["Bear Cub", "Serra Angel", "Forest", "Banishing Light"],
        },
      });
    let s = setup();
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Zoraline, Cosmos Caller"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "triggerTarget") {
        options = namesIn(cur, req.options) as string[];
        return [idOf(cur, "p1", "graveyard", "Bear Cub")];
      }
      return undefined;
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Zoraline, Cosmos Caller")).keywords).toEqual(
      expect.arrayContaining(["flying", "vigilance"]),
    );
    expect(options.sort()).toEqual(["Banishing Light", "Bear Cub"]);
    expect(s.players.p1?.life).toBe(18);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.counters.finality).toBe(1);
    const no = resolve(cast(setup(), "p1", "Zoraline, Cosmos Caller"), answer({ yes: false }));
    expect(no.players.p1?.life).toBe(20);
    expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Zoraline: each Bat you control that attacks gains you 1 life", () => {
    let s = scenario({ p1: { battlefield: ["Zoraline, Cosmos Caller", "Starscape Cleric", "Bear Cub"] } });
    const ids = ["Zoraline, Cosmos Caller", "Starscape Cleric", "Bear Cub"].map((n) => idOf(s, "p1", "battlefield", n));
    s = resolve(attack(s, ids), answer({ yes: false }));
    // Two Bats (Starscape Cleric also makes each opponent lose 1 life per life gained).
    expect(s.players.p1?.life).toBe(22);
  });
});

/** Creates `n` `name` tokens (TOKEN_SPECS) for `player`. */
const addTokens = (s: S, name: string, n: number, player: PlayerId = "p1"): S => {
  createTokens(s, player, TOKEN_SPECS[name] as TokenSpec, n);
  s.version += 1;
  return s;
};

describe("Bloomburrow, lot K8 : peu communes (1)", () => {
  it("Bandit's Talent: each opponent discards two cards, unless they discard a nonland card", () => {
    const run = (hand: string[], pick?: string) => {
      const s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Bandit's Talent"] }, p2: { hand } });
      return resolve(cast(s, "p1", "Bandit's Talent"), (req, _p, cur) => (pick ? pickNamed(cur, req, pick) : undefined));
    };
    const a = run(["Forest", "Island", "Opt"], "Opt");
    expect(handOf(a, "p2").sort()).toEqual(["Forest", "Island"]);
    const b = run(["Forest", "Island", "Plains"]);
    expect(b.players.p2?.hand).toHaveLength(1);
  });

  it("Bandit's Talent: level 2 — at the upkeep of an opponent with one card in hand or fewer, they lose 2 life; level 3 — one more draw per such opponent", () => {
    let s = scenario({
      p1: { battlefield: ["Bandit's Talent", ...lands("Swamp", 5)], library: lands("Plains", 5) },
      p2: { hand: ["Opt", "Opt"], library: lands("Island", 5) },
    });
    const talent = idOf(s, "p1", "battlefield", "Bandit's Talent");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    // Two cards at their upkeep: nothing.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.players.p2?.life).toBe(20);
    // p1 draws two cards at their draw step (p2 has three).
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(s.players.p1?.hand).toHaveLength(1);
    let t = scenario({
      active: "p1",
      step: "end",
      p1: { battlefield: [{ name: "Bandit's Talent" }], library: lands("Plains", 5) },
      p2: { hand: ["Opt"], library: lands("Island", 5) },
    });
    t.objects[idOf(t, "p1", "battlefield", "Bandit's Talent")]!.classLevel = 3;
    t.version += 1;
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "draw");
    expect(t.players.p2?.life).toBe(18);
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    // Two cards in hand for p2 after their draw: no extra draw.
    expect(t.players.p1?.hand).toHaveLength(1);
    let u = scenario({
      active: "p2",
      step: "end",
      p1: { battlefield: [{ name: "Bandit's Talent" }], library: lands("Plains", 5) },
      p2: { hand: [], library: lands("Island", 5) },
    });
    u.objects[idOf(u, "p1", "battlefield", "Bandit's Talent")]!.classLevel = 3;
    u.version += 1;
    u = advanceUntil(u, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(u.players.p1?.hand).toHaveLength(2);
  });

  it("Blacksmith's Talent: a Sword (+1/+1, equip {2}); level 2 — at the beginning of combat, attaches an Equipment; level 3 — double strike and haste during your turn", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 8), "Bear Cub"], hand: ["Blacksmith's Talent"] } });
    s = resolve(cast(s, "p1", "Blacksmith's Talent"));
    const sword = idOf(s, "p1", "battlefield", "Sword");
    expect(chars(s, sword).subtypes).toContain("Equipment");
    expect(chars(s, sword).colors).toEqual([]);
    const talent = idOf(s, "p1", "battlefield", "Blacksmith's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    s = driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ pick: [sword, cub] }));
    expect(s.objects[sword]?.attachedTo).toBe(cub);
    expect(ptOf(s, cub)).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["doubleStrike", "haste"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, cub).keywords).not.toContain("doubleStrike");
  });

  it("Blooming Blast: 2 damage to a creature; with the gift (a Treasure), 3 more damage to its controller", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: lands("Mountain", 2), hand: ["Blooming Blast"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      return resolve(cast(s, "p1", "Blooming Blast", { kicked, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    };
    const a = run(false);
    expect(a.objects[idOf(a, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect(a.players.p2?.life).toBe(20);
    expect(idsOf(a, "p2", "battlefield", "Treasure")).toHaveLength(0);
    const b = run(true);
    expect(b.players.p2?.life).toBe(17);
    expect(idsOf(b, "p2", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Builder's Talent: a 0/4 white Wall with defender; level 2 — a noncreature nonland permanent that enters puts a counter; level 3 — returns such a card from the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 11)],
        hand: ["Builder's Talent", "Banishing Light"],
        graveyard: ["Short Bow", "Bear Cub"],
      },
      p2: { battlefield: ["Serra Angel"] },
    });
    s = resolve(cast(s, "p1", "Builder's Talent"));
    const wall = idOf(s, "p1", "battlefield", "Wall");
    expect(ptOf(s, wall)).toEqual([0, 4]);
    expect(chars(s, wall).colors).toEqual(["W"]);
    expect(chars(s, wall).keywords).toContain("defender");
    const talent = idOf(s, "p1", "battlefield", "Builder's Talent");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(cast(s, "p1", "Banishing Light"), answer({ pick: [idOf(s, "p2", "battlefield", "Serra Angel"), wall] }));
    expect(plusOne(s, wall)).toBe(1);
    let options: string[] = [];
    s = resolve(activateK8(s, "p1", talent, "Level 3"), (req, _p, cur) => {
      if (req.type === "pick" && req.intent === "triggerTarget") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(idsOf(s, "p1", "battlefield", "Short Bow")).toHaveLength(1);
    expect(options.every((n) => n !== "Bear Cub")).toBe(true);
    // Short Bow entered: another counter (level 2).
    expect(plusOne(s, wall)).toBe(2);
  });

  it("Consumed by Greed: the targeted opponent sacrifices their creature with the greatest power; with the gift, a creature card returns to hand", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: lands("Swamp", 3), hand: ["Consumed by Greed"], graveyard: ["Llanowar Elves"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"], library: lands("Island", 2) },
      });
      return resolve(
        cast(s, "p1", "Consumed by Greed", {
          kicked,
          targets: { p: ["p2"], t: kicked ? [idOf(s, "p1", "graveyard", "Llanowar Elves")] : [] },
        }),
      );
    };
    const a = run(false);
    expect(idsOf(a, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(a, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(a.players.p1?.hand).toHaveLength(0);
    const b = run(true);
    expect(handOf(b)).toEqual(["Llanowar Elves"]);
    expect(b.players.p2?.hand).toHaveLength(1);
  });

  it("Coruscation Mage: each noncreature spell you cast deals 1 damage to each opponent; offspring {2}", () => {
    let s = scenario({
      p1: { battlefield: ["Coruscation Mage", "Island", "Forest"], hand: ["Opt", "Llanowar Elves"], library: lands("Plains", 2) },
    });
    s = resolve(cast(s, "p1", "Opt"));
    expect(s.players.p2?.life).toBe(19);
    s = resolve(cast(s, "p1", "Llanowar Elves"));
    expect(s.players.p2?.life).toBe(19);
    let t = scenario({ p1: { battlefield: lands("Mountain", 4), hand: ["Coruscation Mage"] } });
    t = resolve(cast(t, "p1", "Coruscation Mage", { kicked: true }));
    expect(idsOf(t, "p1", "battlefield", "Coruscation Mage")).toHaveLength(2);
  });

  it("Dewdrop Cure: up to two creature cards with MV 2 or less return from the graveyard; three with the gift", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Plains", 3),
          hand: ["Dewdrop Cure"],
          graveyard: ["Bear Cub", "Llanowar Elves", "Savannah Lions", "Serra Angel"],
        },
        p2: { library: lands("Island", 2) },
      });
    let s = setup();
    const { opt } = castOption(s, "Dewdrop Cure");
    expect(namesIn(s, opt?.modes[0]?.targets[0]?.legal).sort()).toEqual(["Bear Cub", "Llanowar Elves", "Savannah Lions"]);
    const three = ["Bear Cub", "Llanowar Elves", "Savannah Lions"].map((n) => idOf(s, "p1", "graveyard", n));
    expect(() => cast(s, "p1", "Dewdrop Cure", { targets: { t: three } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Dewdrop Cure", { targets: { t: three.slice(0, 2) } }));
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
    let t = setup();
    t = resolve(cast(t, "p1", "Dewdrop Cure", { kicked: true, targets: { t: three } }));
    expect(graveOf(t).sort()).toEqual(["Dewdrop Cure", "Serra Angel"]);
    expect(t.players.p2?.hand).toHaveLength(1);
  });

  it("Downwind Ambusher: flash; -1/-1 to an opposing creature, or destroys an opposing creature damaged this turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 4), "Mountain"], hand: ["Downwind Ambusher", "Shock"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    expect(castOption(s, "Downwind Ambusher").opt).toBeDefined();
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Shock", { targets: { t: [angel] } }));
    s = resolve(cast(s, "p1", "Downwind Ambusher"), answer({ mode: "Destroy", pick: [angel] }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Downwind Ambusher"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    t = resolve(cast(t, "p1", "Downwind Ambusher"), answer({ mode: "-1/-1" }));
    expect(idsOf(t, "p2", "battlefield", "Llanowar Elves")).toHaveLength(0);
    expect(chars(t, idOf(t, "p1", "battlefield", "Downwind Ambusher")).keywords).toContain("flash");
  });

  it("Feather of Flight: flash; on entering, draw a card; +1/+0 and flying", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Feather of Flight"], library: lands("Island", 2) },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Feather of Flight", { targets: { enchant: [cub] } }));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(chars(s, cub).keywords).toContain("flying");
    expect(handOf(s)).toEqual(["Island"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Feather of Flight")).keywords).toContain("flash");
  });

  it("Flamecache Gecko: on entering, {B}{R} if an opponent lost life this turn; {1}{R}, discard a card: draw", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Shock", "Flamecache Gecko"] } });
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    s = resolve(cast(s, "p1", "Flamecache Gecko"));
    expect([s.players.p1?.manaPool.B, s.players.p1?.manaPool.R]).toEqual([1, 1]);
    let t = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Flamecache Gecko", "Opt"], library: lands("Plains", 2) },
    });
    t = resolve(cast(t, "p1", "Flamecache Gecko"));
    expect(t.players.p1?.manaPool.B ?? 0).toBe(0);
    t = resolve(activateK8(t, "p1", idOf(t, "p1", "battlefield", "Flamecache Gecko"), "Discard"));
    expect(graveOf(t)).toEqual(["Opt"]);
    expect(handOf(t)).toEqual(["Plains"]);
  });

  it("Flowerfoot Swordmaster: valiant — your Mice +1/+0 until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Flowerfoot Swordmaster", "Seedglaive Mentor", "Bear Cub", "Forest"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Flowerfoot Swordmaster"] },
    });
    const sword = idOf(s, "p1", "battlefield", "Flowerfoot Swordmaster");
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [sword] } }));
    expect(ptOf(s, sword)).toEqual([5, 5]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Seedglaive Mentor"))).toEqual([4, 2]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Flowerfoot Swordmaster"))).toEqual([1, 2]);
  });

  it("Gossip's Talent: a creature enters under your control — surveil 1", () => {
    let s = scenario({
      p1: { battlefield: ["Gossip's Talent", ...lands("Forest", 2)], hand: ["Bear Cub"], library: ["Opt", "Plains"] },
    });
    s = resolve(cast(s, "p1", "Bear Cub"), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(s)).toEqual(["Opt"]);
  });

  it("Gossip's Talent: level 2 — on attacking, an attacker with power 3 or less can't be blocked; level 3 — after combat damage, exiled then returned", () => {
    let s = scenario({
      p1: { battlefield: ["Gossip's Talent", "Bear Cub", ...lands("Island", 6)] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const talent = idOf(s, "p1", "battlefield", "Gossip's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    s = resolve(attack(s, [cub]));
    expect(chars(s, cub).keywords).toContain("unblockable");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: angel, attacker: cub }] })).toThrow(RulesError);
    s = driveUntil(s, (x) => x.turn.step === "main2", answer({ yes: true }));
    expect(s.players.p2?.life).toBe(18);
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(cub);
    expect(s.objects[back]?.tapped).toBe(false);
  });

  it("Hazel's Nocturne: up to two creature cards from the graveyard into hand; each opponent loses 2 life, you gain 2", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Hazel's Nocturne"], graveyard: ["Bear Cub", "Serra Angel", "Opt"] },
    });
    const ids = ["Bear Cub", "Serra Angel"].map((n) => idOf(s, "p1", "graveyard", n));
    s = resolve(cast(s, "p1", "Hazel's Nocturne", { targets: { t: ids } }));
    expect(handOf(s).sort()).toEqual(["Bear Cub", "Serra Angel"]);
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
  });

  it("Hivespine Wolverine: a +1/+1 counter on one of your creatures, or fights a creature token, or destroys an artifact or an enchantment", () => {
    const setup = () =>
      addTokens(
        scenario({
          p1: { battlefield: [...lands("Forest", 5), "Bear Cub"], hand: ["Hivespine Wolverine"] },
          p2: { battlefield: ["Banishing Light", "Serra Angel"] },
        }),
        "Cat",
        1,
        "p2",
      );
    let s = setup();
    const cat = idOf(s, "p2", "battlefield", "Cat");
    s = resolve(cast(s, "p1", "Hivespine Wolverine"), answer({ mode: "Fights", pick: [cat] }));
    expect(idsOf(s, "p2", "battlefield", "Cat")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Hivespine Wolverine")]?.damage).toBe(1);
    let t = setup();
    t = resolve(
      cast(t, "p1", "Hivespine Wolverine"),
      answer({ mode: "Destroy", pick: [idOf(t, "p2", "battlefield", "Banishing Light")] }),
    );
    expect(idsOf(t, "p2", "battlefield", "Banishing Light")).toHaveLength(0);
    let u = setup();
    const cub = idOf(u, "p1", "battlefield", "Bear Cub");
    u = resolve(cast(u, "p1", "Hivespine Wolverine"), answer({ mode: "counter", pick: [cub] }));
    expect(plusOne(u, cub)).toBe(1);
  });

  it("Hivespine Wolverine: the fight only targets a creature token", () => {
    const s = scenario({
      p1: { battlefield: lands("Forest", 5), hand: ["Hivespine Wolverine"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const t = resolve(cast(s, "p1", "Hivespine Wolverine"), answer({ mode: "Fights" }));
    expect(t.objects[idOf(t, "p2", "battlefield", "Serra Angel")]?.damage).toBe(0);
  });

  it("Hoarder's Overflow: a stash counter on entering and on each expend 4; {1}{R}, sacrifice it: discard your hand, draw a card per counter", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Mountain", 6),
        hand: ["Hoarder's Overflow", "Lightning Strike", "Opt"],
        library: lands("Plains", 4),
      },
    });
    s = resolve(cast(s, "p1", "Hoarder's Overflow"));
    const hoard = idOf(s, "p1", "battlefield", "Hoarder's Overflow");
    expect(s.objects[hoard]?.counters.stash).toBe(1);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(s.objects[hoard]?.counters.stash).toBe(2);
    s = resolve(activateK8(s, "p1", hoard, "Discard your hand"));
    expect(graveOf(s)).toEqual(expect.arrayContaining(["Opt", "Hoarder's Overflow"]));
    expect(handOf(s)).toEqual(["Plains", "Plains"]);
  });

  it("Honored Dreyleader: trample; enters with a counter per other Squirrel and Food; another Squirrel or Food that enters adds one", () => {
    let s = addTokens(
      scenario({
        p1: {
          battlefield: [...lands("Forest", 7), "Bushy Bodyguard", "Bear Cub"],
          hand: ["Honored Dreyleader", "Bushy Bodyguard", "Bear Cub"],
        },
      }),
      "Food",
      1,
    );
    s = resolve(cast(s, "p1", "Honored Dreyleader"));
    const drey = idOf(s, "p1", "battlefield", "Honored Dreyleader");
    expect(chars(s, drey).keywords).toContain("trample");
    expect(plusOne(s, drey)).toBe(2);
    s = resolve(cast(s, "p1", "Bushy Bodyguard"), answer({ yes: false }));
    expect(plusOne(s, drey)).toBe(3);
    s = resolve(cast(s, "p1", "Bear Cub"));
    expect(plusOne(s, drey)).toBe(3);
  });

  it("Hunter's Talent: on entering, one of your creatures deals damage equal to its power to a creature you don't control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 2), "Serra Angel"], hand: ["Hunter's Talent"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = resolve(
      cast(s, "p1", "Hunter's Talent"),
      answer({ pick: [idOf(s, "p1", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")] }),
    );
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(s.objects[idOf(s, "p1", "battlefield", "Serra Angel")]?.damage).toBe(0);
  });

  it("Hunter's Talent: level 2 — on attacking, an attacker +1/+0 and trample; level 3 — draw at your end step if you control a creature with power 4 or greater", () => {
    let s = scenario({
      p1: { battlefield: ["Hunter's Talent", "Bear Cub", ...lands("Forest", 6)], library: lands("Plains", 3) },
    });
    const talent = idOf(s, "p1", "battlefield", "Hunter's Talent");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", talent, "Level 2"));
    s = resolve(activateK8(s, "p1", talent, "Level 3"));
    s = resolve(attack(s, [cub]));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(chars(s, cub).keywords).toContain("trample");
    // Power 3 only: no draw at the end step.
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.hand).toHaveLength(0);
    let t = scenario({
      active: "p1",
      step: "main2",
      p1: { battlefield: ["Hunter's Talent", "Serra Angel"], library: lands("Plains", 3) },
    });
    t.objects[idOf(t, "p1", "battlefield", "Hunter's Talent")]!.classLevel = 3;
    t.version += 1;
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(handOf(t)).toEqual(["Plains"]);
  });
});

describe("Bloomburrow, lot K8 : peu communes (2)", () => {
  it("Huskburster Swarm: costs {1} less per creature card you own in exile and in your graveyard; menace and deathtouch", () => {
    const setup = (n: number, exiledOne: boolean) => {
      const s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Huskburster Swarm"], graveyard: Array(n).fill("Bear Cub") } });
      if (exiledOne) moveObject(s, s.players.p1?.graveyard[0] as string, "exile");
      return s;
    };
    const castableSwarm = (s: S) => castable(s, "p1", idOf(s, "p1", "hand", "Huskburster Swarm"));
    expect(castableSwarm(setup(6, false))).toBe(false);
    expect(castableSwarm(setup(7, false))).toBe(true);
    // One of the seven exiled creature cards: it still counts.
    expect(castableSwarm(setup(7, true))).toBe(true);
    let s = setup(7, false);
    s = resolve(cast(s, "p1", "Huskburster Swarm"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Huskburster Swarm")).keywords).toEqual(
      expect.arrayContaining(["menace", "deathtouch"]),
    );
  });

  it("Knightfisher: flying; another nontoken Bird enters under your control — a 1/1 blue Fish; not another creature", () => {
    let s = scenario({ p1: { battlefield: ["Knightfisher", ...lands("Plains", 3)], hand: ["Healer's Hawk", "Savannah Lions"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Knightfisher")).keywords).toContain("flying");
    s = resolve(cast(s, "p1", "Savannah Lions"));
    expect(idsOf(s, "p1", "battlefield", "Fish")).toHaveLength(0);
    s = resolve(cast(s, "p1", "Healer's Hawk"));
    const fish = idOf(s, "p1", "battlefield", "Fish");
    expect(ptOf(s, fish)).toEqual([1, 1]);
    expect(chars(s, fish).colors).toEqual(["U"]);
  });

  it("Lilypad Village: {T}: {U} only for a creature spell; {U}, {T}: surveil 2 if a Bird, Frog, Otter or Rat entered this turn", () => {
    const a = scenario({ p1: { battlefield: ["Lilypad Village", "Mountain"], hand: ["Opt", "Plumecreed Escort"] } });
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Plumecreed Escort"))).toBe(true);
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Opt"))).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Lilypad Village", "Island", "Plains"], hand: ["Healer's Hawk"], library: ["Opt", "Stab", "Forest"] },
    });
    const village = idOf(s, "p1", "battlefield", "Lilypad Village");
    expect(canActivateK8(s, "p1", village, "Surveil 2")).toBe(false);
    s = resolve(cast(s, "p1", "Healer's Hawk"));
    s = resolve(activateK8(s, "p1", village, "Surveil 2"), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(s).sort()).toEqual(["Opt", "Stab"]);
  });

  it("Lilysplash Mentor: reach; {1}{G}{U}: exiles another of your creatures, which returns with a +1/+1 counter (sorcery)", () => {
    let s = scenario({ p1: { battlefield: ["Lilysplash Mentor", "Bear Cub", ...lands("Forest", 2), "Island"] } });
    const mentor = idOf(s, "p1", "battlefield", "Lilysplash Mentor");
    expect(chars(s, mentor).keywords).toContain("reach");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", mentor, "Exiles", { targets: { t: [cub] } }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(cub);
    expect(plusOne(s, back)).toBe(1);
    const t = scenario({ active: "p2", p1: { battlefield: ["Lilysplash Mentor", "Bear Cub", ...lands("Forest", 2), "Island"] } });
    expect(canActivateK8(act(t, "p2", { type: "pass" }), "p1", idOf(t, "p1", "battlefield", "Lilysplash Mentor"), "Exile")).toBe(
      false,
    );
  });

  it("Long River Lurker: ward {1}, and your other Frogs too; on entering, one of your creatures is unblockable, and may be exiled then returned after its combat damage", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub", "Lilysplash Mentor"], hand: ["Long River Lurker"] },
      p2: { battlefield: ["Serra Angel", "Clement, the Worrywort"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Long River Lurker"), answer({ pick: [cub] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Long River Lurker")).keywords).toContain("ward");
    expect(chars(s, idOf(s, "p1", "battlefield", "Lilysplash Mentor")).keywords).toContain("ward");
    expect(chars(s, idOf(s, "p2", "battlefield", "Clement, the Worrywort")).keywords).not.toContain("ward");
    expect(chars(s, cub).keywords).not.toContain("ward");
    expect(chars(s, cub).keywords).toContain("unblockable");
    s = attack(s, [cub]);
    s = driveUntil(s, (x) => x.turn.step === "main2", answer({ yes: true }));
    expect(s.players.p2?.life).toBe(18);
    expect(idOf(s, "p1", "battlefield", "Bear Cub")).not.toBe(cub);
  });

  it("Long River's Pull: counters a creature spell; with the gift, any spell", () => {
    const setup = (spell: string) => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: lands("Island", 2), hand: ["Long River's Pull"] },
        p2: { battlefield: ["Mountain", "Forest"], hand: [spell, "Bear Cub"], library: lands("Plains", 2) },
      });
      s = act(s, "p2", {
        type: "cast",
        card: idOf(s, "p2", "hand", spell),
        ...(spell === "Shock" ? { targets: { t: ["p1"] } } : {}),
      });
      return act(s, "p2", { type: "pass" });
    };
    let s = setup("Shock");
    const shock = s.stack[0]?.id as string;
    expect(() => cast(s, "p1", "Long River's Pull", { targets: { t: [shock] } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Long River's Pull", { kicked: true, targets: { t: [shock] } }));
    expect(s.players.p1?.life).toBe(20);
    expect(handOf(s, "p2")).toEqual(["Bear Cub", "Plains"]);
    let t = setup("Bear Cub");
    t = resolve(cast(t, "p1", "Long River's Pull", { targets: { t: [t.stack[0]?.id as string] } }));
    expect(idsOf(t, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(graveOf(t, "p2")).toEqual(["Bear Cub"]);
  });

  it("Lupinflower Village: {T}: {W} only for a creature spell; {1}{W}, {T}, sacrifice it: a Bat, Bird, Mouse or Rabbit among six cards", () => {
    const a = scenario({ p1: { battlefield: ["Lupinflower Village"], hand: ["Fleeting Flight", "Savannah Lions"] } });
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Savannah Lions"))).toBe(true);
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Fleeting Flight"))).toBe(false);
    let s = scenario({
      p1: {
        battlefield: ["Lupinflower Village", ...lands("Plains", 2)],
        library: ["Bear Cub", "Savannah Lions", "Healer's Hawk", "Forest", "Opt", "Island", "Swamp"],
      },
    });
    let options: string[] = [];
    s = resolve(
      activateK8(s, "p1", idOf(s, "p1", "battlefield", "Lupinflower Village"), "Looks at six cards"),
      (req, _p, cur) => {
        if (req.type === "pick" && req.intent === "lookAtTop") options = namesIn(cur, req.options) as string[];
        return undefined;
      },
    );
    expect(options).toEqual(["Healer's Hawk"]);
    expect(handOf(s)).toEqual(["Healer's Hawk"]);
    expect(graveOf(s)).toEqual(["Lupinflower Village"]);
    expect(namesIn(s, s.players.p1?.library)[0]).toBe("Swamp");
  });

  it("Mabel's Mettle: +2/+2 to a targeted creature, +1/+1 to up to one other", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub", "Savannah Lions"], hand: ["Mabel's Mettle"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    expect(() => cast(s, "p1", "Mabel's Mettle", { targets: { t: [cub], u: [cub] } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Mabel's Mettle", { targets: { t: [cub], u: [lions] } }));
    expect(ptOf(s, cub)).toEqual([4, 4]);
    expect(ptOf(s, lions)).toEqual([3, 2]);
  });

  it("Mindwhisker: surveil 1 at your upkeep; threshold — opposing creatures have -1/-0", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: ["Mindwhisker"], graveyard: Array(n).fill("Opt") },
        p2: { battlefield: ["Bear Cub"] },
      });
      return ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"));
    };
    expect(run(6)).toEqual([2, 2]);
    expect(run(7)).toEqual([1, 2]);
    let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Mindwhisker"], library: ["Opt", "Forest"] } });
    s = driveUntil(
      s,
      (x) => x.turn.active === "p1" && x.turn.step === "main1",
      (req) => (req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined),
    );
    expect(graveOf(s)).toEqual(["Opt"]);
    expect(handOf(s)).toEqual(["Forest"]);
  });

  it("Moonstone Harbinger: flying and deathtouch; gaining or losing life during your turn gives +1/+0 and deathtouch to your Bats, once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Moonstone Harbinger", "Starscape Cleric", "Vampire Neonate", "Bear Cub", ...lands("Swamp", 2), "Mountain"],
        hand: ["Shock"],
      },
    });
    const harb = idOf(s, "p1", "battlefield", "Moonstone Harbinger");
    const cleric = idOf(s, "p1", "battlefield", "Starscape Cleric");
    expect(chars(s, harb).keywords).toEqual(expect.arrayContaining(["flying", "deathtouch"]));
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
    expect(ptOf(s, cleric)).toEqual([3, 1]);
    expect(chars(s, cleric).keywords).toContain("deathtouch");
    expect(ptOf(s, harb)).toEqual([2, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p1"] } }));
    expect(ptOf(s, cleric)).toEqual([3, 1]);
    let t = scenario({
      active: "p2",
      p1: { battlefield: ["Moonstone Harbinger"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    t = resolve(cast(t, "p2", "Shock", { targets: { t: ["p1"] } }));
    expect(ptOf(t, idOf(t, "p1", "battlefield", "Moonstone Harbinger"))).toEqual([1, 3]);
  });

  it("Mouse Trapper: flash; valiant — taps a targeted opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Mouse Trapper", "Forest"], hand: ["Giant Growth"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const trapper = idOf(s, "p1", "battlefield", "Mouse Trapper");
    expect(chars(s, trapper).keywords).toContain("flash");
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [trapper] } }));
    expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.tapped).toBe(true);
  });

  it("Mudflat Village: {1}{B}, {T}, sacrifice it: a Bat, Lizard, Rat or Squirrel card returns to hand", () => {
    let s = scenario({ p1: { battlefield: ["Mudflat Village", ...lands("Swamp", 2)], graveyard: ["Bear Cub", "Hired Claw"] } });
    const village = idOf(s, "p1", "battlefield", "Mudflat Village");
    const claw = idOf(s, "p1", "graveyard", "Hired Claw");
    const cub = idOf(s, "p1", "graveyard", "Bear Cub");
    expect(() => activateK8(s, "p1", village, "Gets back", { targets: { t: [cub] } })).toThrow(RulesError);
    s = resolve(activateK8(s, "p1", village, "Gets back", { targets: { t: [claw] } }));
    expect(handOf(s)).toEqual(["Hired Claw"]);
    expect(graveOf(s).sort()).toEqual(["Bear Cub", "Mudflat Village"]);
  });

  it("Oakhollow Village: {G}, {T}: a counter on each of your Frogs, Rabbits, Raccoons and Squirrels that entered this turn", () => {
    let s = scenario({
      p1: { battlefield: ["Bushy Bodyguard", ...lands("Forest", 5)], hand: ["Bushy Bodyguard", "Bear Cub", "Oakhollow Village"] },
    });
    const old = idOf(s, "p1", "battlefield", "Bushy Bodyguard");
    s = resolve(cast(s, "p1", "Bushy Bodyguard"), answer({ yes: false }));
    s = resolve(cast(s, "p1", "Bear Cub"));
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Oakhollow Village") });
    const fresh = idsOf(s, "p1", "battlefield", "Bushy Bodyguard").find((id) => id !== old) as string;
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Oakhollow Village"), "newcomers"));
    expect(plusOne(s, fresh)).toBe(1);
    expect(plusOne(s, old)).toBe(0);
    expect(plusOne(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
  });

  it("Overprotect: +3/+3, trample, hexproof and indestructible until end of turn", () => {
    let s = scenario({ p1: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Overprotect"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Overprotect", { targets: { t: [cub] } }));
    expect(ptOf(s, cub)).toEqual([5, 5]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["trample", "hexproof", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(ptOf(s, cub)).toEqual([2, 2]);
  });

  it("Parting Gust: exiles a nontoken creature; with no gift, it returns at the end step with a +1/+1 counter; with it, a tapped Fish for the opponent", () => {
    const setup = () =>
      scenario({ p1: { battlefield: lands("Plains", 2), hand: ["Parting Gust"] }, p2: { battlefield: ["Serra Angel"] } });
    let s = setup();
    s = resolve(cast(s, "p1", "Parting Gust", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    const back = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(plusOne(s, back)).toBe(1);
    let t = setup();
    t = resolve(cast(t, "p1", "Parting Gust", { kicked: true, targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
    expect(t.objects[idOf(t, "p2", "battlefield", "Fish")]?.tapped).toBe(true);
    t = advanceUntil(t, (x) => x.turn.active === "p2");
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(exiled(t, "Serra Angel")).toHaveLength(1);
    // A token isn't a legal target.
    const u = addTokens(setup(), "Cat", 1, "p2");
    const { opt } = castOption(u, "Parting Gust");
    expect(opt?.modes[0]?.targets[0]?.legal).not.toContain(idOf(u, "p2", "battlefield", "Cat"));
  });

  it("Patchwork Banner: your creatures of the chosen type +1/+1; {T}: one mana of any color", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 3), "Bear Cub", "Llanowar Elves"], hand: ["Patchwork Banner"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = resolve(cast(s, "p1", "Patchwork Banner"), answer({ pick: ["Bear"] }));
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([1, 1]);
    expect(ptOf(s, idOf(s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    const banner = idOf(s, "p1", "battlefield", "Patchwork Banner");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === banner ? a.colors : []));
    expect(colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
  });

  it("Pawpatch Formation: destroys a creature with flying, or an enchantment, or draw a card and create a Food", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Pawpatch Formation"], library: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel", "Bear Cub", "Banishing Light"] },
      });
    const modeOf = (s: S, label: string) => castOption(s, "Pawpatch Formation").opt?.modes.find((m) => m.label?.includes(label));
    let s = setup();
    const fly = modeOf(s, "flying");
    expect(fly?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
    s = resolve(
      cast(s, "p1", "Pawpatch Formation", { mode: fly?.index, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
    );
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    let t = setup();
    const ench = modeOf(t, "enchantment");
    t = resolve(
      cast(t, "p1", "Pawpatch Formation", {
        mode: ench?.index,
        targets: { t: [idOf(t, "p2", "battlefield", "Banishing Light")] },
      }),
    );
    expect(idsOf(t, "p2", "battlefield", "Banishing Light")).toHaveLength(0);
    let u = setup();
    u = resolve(cast(u, "p1", "Pawpatch Formation", { mode: modeOf(u, "Food")?.index }));
    expect(handOf(u)).toEqual(["Plains"]);
    expect(idsOf(u, "p1", "battlefield", "Food")).toHaveLength(1);
  });

  it("Peerless Recycling: a permanent card from the graveyard into hand; two with the gift", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Peerless Recycling"], graveyard: ["Bear Cub", "Forest", "Opt"] },
        p2: { library: lands("Island", 2) },
      });
    let s = setup();
    const ids = ["Bear Cub", "Forest"].map((n) => idOf(s, "p1", "graveyard", n));
    expect(castOption(s, "Peerless Recycling").opt?.modes[0]?.targets[0]?.legal).not.toContain(idOf(s, "p1", "graveyard", "Opt"));
    expect(() => cast(s, "p1", "Peerless Recycling", { targets: { t: ids } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Peerless Recycling", { targets: { t: ids.slice(0, 1) } }));
    expect(handOf(s)).toEqual(["Bear Cub"]);
    let t = setup();
    t = resolve(cast(t, "p1", "Peerless Recycling", { kicked: true, targets: { t: ids } }));
    expect(handOf(t).sort()).toEqual(["Bear Cub", "Forest"]);
    expect(t.players.p2?.hand).toHaveLength(1);
  });

  it("Persistent Marshstalker: +1/+0 per other Rat; threshold — when you attack with Rats, {2}{B} returns it from the graveyard tapped and attacking", () => {
    const s0 = scenario({ p1: { battlefield: ["Persistent Marshstalker", "Shoreline Looter", "Bear Cub"] } });
    expect(ptOf(s0, idOf(s0, "p1", "battlefield", "Persistent Marshstalker"))).toEqual([4, 1]);
    const setup = (others: number) =>
      scenario({
        p1: {
          battlefield: ["Shoreline Looter", ...lands("Swamp", 3)],
          graveyard: ["Persistent Marshstalker", ...Array(others).fill("Opt")],
        },
      });
    let s = setup(6);
    s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Shoreline Looter")]), answer({ yes: true }));
    const stalker = idOf(s, "p1", "battlefield", "Persistent Marshstalker");
    expect(s.objects[stalker]?.tapped).toBe(true);
    expect(s.combat?.attackers.map((a) => a.id)).toContain(stalker);
    let t = setup(5);
    t = resolve(attack(t, [idOf(t, "p1", "battlefield", "Shoreline Looter")]), answer({ yes: true }));
    expect(idsOf(t, "p1", "battlefield", "Persistent Marshstalker")).toHaveLength(0);
  });
});

describe("Bloomburrow, lot K8 : peu communes (3)", () => {
  it("Plumecreed Escort: flash and flying; on entering, one of your creatures gains hexproof until end of turn", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Plumecreed Escort"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const { opt } = castOption(s, "Plumecreed Escort");
    expect(opt).toBeDefined();
    s = resolve(cast(s, "p1", "Plumecreed Escort"), answer({ pick: [cub] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Plumecreed Escort")).keywords).toEqual(
      expect.arrayContaining(["flash", "flying"]),
    );
    expect(chars(s, cub).keywords).toContain("hexproof");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, cub).keywords).not.toContain("hexproof");
  });

  it("Plumecreed Mentor: it or another of your flying creatures enters — a counter on one of your creatures without flying; not for a creature without flying", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 2), ...lands("Plains", 3), "Bear Cub"],
        hand: ["Plumecreed Mentor", "Healer's Hawk", "Savannah Lions"],
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Plumecreed Mentor"));
    expect(plusOne(s, cub)).toBe(1);
    s = resolve(cast(s, "p1", "Healer's Hawk"), answer({ pick: [cub] }));
    expect(plusOne(s, cub)).toBe(2);
    s = resolve(cast(s, "p1", "Savannah Lions"));
    expect(plusOne(s, cub) + plusOne(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(2);
  });

  it("Quaketusk Boar: reach, trample and haste; Shrike Force: flying, double strike and vigilance; Brightblade Stoat: first strike and lifelink; Galewind Moose: flash, reach, vigilance and trample", () => {
    const s = scenario({ p1: { battlefield: ["Quaketusk Boar", "Shrike Force", "Brightblade Stoat", "Galewind Moose"] } });
    const kw = (n: string) => chars(s, idOf(s, "p1", "battlefield", n)).keywords;
    expect(kw("Quaketusk Boar")).toEqual(expect.arrayContaining(["reach", "trample", "haste"]));
    expect(kw("Shrike Force")).toEqual(expect.arrayContaining(["flying", "doubleStrike", "vigilance"]));
    expect(kw("Brightblade Stoat")).toEqual(expect.arrayContaining(["firstStrike", "lifelink"]));
    expect(kw("Galewind Moose")).toEqual(expect.arrayContaining(["flash", "reach", "vigilance", "trample"]));
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Galewind Moose"))).toEqual([6, 6]);
  });

  it("Brightblade Stoat: in combat, its first-strike damage gains life", () => {
    let s = scenario({ p1: { battlefield: ["Brightblade Stoat"] } });
    s = driveUntil(attack(s, [idOf(s, "p1", "battlefield", "Brightblade Stoat")]), (x) => x.turn.step === "main2");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([22, 18]);
  });

  it("Rabid Gnaw: your creature gets +1/+0, then deals damage equal to its power to a creature you don't control", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Rabid Gnaw"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Rabid Gnaw", { targets: { t: [cub], u: [angel] } }));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(s.objects[angel]?.damage).toBe(3);
    expect(s.objects[cub]?.damage).toBe(0);
  });

  it("Repel Calamity: destroys a creature with power or toughness 4 or greater", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Repel Calamity"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub", { name: "Vampire Neonate", counters: { "+1/+1": 1 } }] },
    });
    const { opt } = castOption(s, "Repel Calamity");
    expect(namesIn(s, opt?.modes[0]?.targets[0]?.legal).sort()).toEqual(["Serra Angel", "Vampire Neonate"]);
    s = resolve(cast(s, "p1", "Repel Calamity", { targets: { t: [idOf(s, "p2", "battlefield", "Vampire Neonate")] } }));
    expect(idsOf(s, "p2", "battlefield", "Vampire Neonate")).toHaveLength(0);
  });

  it("Reptilian Recruiter: trample; takes control until end of turn of a creature with power 2 or less (untapped, haste), or any with another Lizard", () => {
    const setup = (lizard: boolean) =>
      scenario({
        p1: { battlefield: [...lands("Mountain", 5), ...(lizard ? ["Hired Claw"] : [])], hand: ["Reptilian Recruiter"] },
        p2: { battlefield: [{ name: "Bear Cub", tapped: true }, "Serra Angel"] },
      });
    let s = setup(false);
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Reptilian Recruiter"), answer({ pick: [cub] }));
    expect(chars(s, idOf(s, "p1", "battlefield", "Reptilian Recruiter")).keywords).toContain("trample");
    expect(s.objects[cub]?.controller).toBe("p1");
    expect(s.objects[cub]?.tapped).toBe(false);
    expect(chars(s, cub).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.objects[cub]?.controller).toBe("p2");
    let t = setup(false);
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = resolve(cast(t, "p1", "Reptilian Recruiter"), answer({ pick: [angel] }));
    expect(t.objects[angel]?.controller).toBe("p2");
    let u = setup(true);
    u = resolve(cast(u, "p1", "Reptilian Recruiter"), answer({ pick: [angel] }));
    expect(u.objects[angel]?.controller).toBe("p1");
  });

  it("Rockface Village: {T}: {R} only for a creature spell; {R}, {T}: a Lizard, Mouse, Otter or Raccoon gains +1/+0 and haste (sorcery)", () => {
    const a = scenario({ p1: { battlefield: ["Rockface Village"], hand: ["Shock", "Fanatical Firebrand"] } });
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Fanatical Firebrand"))).toBe(true);
    expect(castable(a, "p1", idOf(a, "p1", "hand", "Shock"))).toBe(false);
    let s = scenario({
      p1: { battlefield: ["Rockface Village", "Mountain", { name: "Hired Claw", sick: true }, { name: "Bear Cub", sick: true }] },
    });
    const village = idOf(s, "p1", "battlefield", "Rockface Village");
    const claw = idOf(s, "p1", "battlefield", "Hired Claw");
    expect(() => activateK8(s, "p1", village, "haste", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } })).toThrow(
      RulesError,
    );
    s = resolve(activateK8(s, "p1", village, "haste", { targets: { t: [claw] } }));
    expect(ptOf(s, claw)).toEqual([2, 2]);
    expect(chars(s, claw).keywords).toContain("haste");
  });

  it("Ruthless Negotiation: the targeted opponent exiles a card from their hand; cast from the graveyard (flashback {4}{B}), draw a card", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 6), hand: ["Ruthless Negotiation"], library: lands("Plains", 2) },
      p2: { hand: ["Opt", "Forest"] },
    });
    s = resolve(cast(s, "p1", "Ruthless Negotiation", { targets: { t: ["p2"] } }));
    expect(s.players.p2?.hand).toHaveLength(1);
    expect(s.exile).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(0);
    const card = idOf(s, "p1", "graveyard", "Ruthless Negotiation");
    s = resolve(act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } }));
    expect(s.players.p2?.hand).toHaveLength(0);
    expect(handOf(s)).toEqual(["Plains"]);
    expect(exiled(s, "Ruthless Negotiation")).toHaveLength(1);
  });

  it("Seasoned Warrenguard: +2/+0 when it attacks while you control a token", () => {
    let s = scenario({ p1: { battlefield: ["Seasoned Warrenguard"] } });
    const guard = idOf(s, "p1", "battlefield", "Seasoned Warrenguard");
    s = resolve(attack(s, [guard]));
    expect(ptOf(s, guard)).toEqual([1, 2]);
    let t = addTokens(scenario({ p1: { battlefield: ["Seasoned Warrenguard"] } }), "Food", 1);
    t = resolve(attack(t, [guard]));
    expect(ptOf(t, guard)).toEqual([3, 2]);
  });

  it("Seedglaive Mentor: vigilance and haste; valiant — a +1/+1 counter", () => {
    let s = scenario({ p1: { battlefield: ["Seedglaive Mentor", "Forest", "Forest"], hand: ["Giant Growth", "Giant Growth"] } });
    const mentor = idOf(s, "p1", "battlefield", "Seedglaive Mentor");
    expect(chars(s, mentor).keywords).toEqual(expect.arrayContaining(["vigilance", "haste"]));
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [mentor] } }));
    s = resolve(cast(s, "p1", "Giant Growth", { targets: { t: [mentor] } }));
    expect(plusOne(s, mentor)).toBe(1);
  });

  it("Shoreline Looter: unblockable; combat damage to a player — draw, then discard unless you have seven cards in the graveyard", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: ["Shoreline Looter"], hand: ["Opt"], graveyard: Array(n).fill("Stab"), library: lands("Plains", 2) },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Shoreline Looter")).keywords).toContain("unblockable");
      return driveUntil(attack(s, [idOf(s, "p1", "battlefield", "Shoreline Looter")]), (x) => x.turn.step === "main2");
    };
    const a = run(6);
    expect(a.players.p1?.hand).toHaveLength(1);
    expect(a.players.p1?.graveyard).toHaveLength(7);
    const b = run(7);
    expect(handOf(b).sort()).toEqual(["Opt", "Plains"]);
  });

  it("Short Bow: the equipped creature has +1/+1, reach and vigilance; equip {1}", () => {
    let s = scenario({ p1: { battlefield: ["Short Bow", "Bear Cub", "Forest"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Short Bow"), "Equip {1}", { targets: { t: [cub] } }));
    expect(ptOf(s, cub)).toEqual([3, 3]);
    expect(chars(s, cub).keywords).toEqual(expect.arrayContaining(["reach", "vigilance"]));
  });

  it("Sinister Monolith: at the beginning of combat on your turn, each opponent loses 1 life and you gain 1; {T}, 2 life, sacrifice it: draw two cards (sorcery)", () => {
    let s = scenario({ p1: { battlefield: ["Sinister Monolith"], library: lands("Plains", 3) } });
    const mono = idOf(s, "p1", "battlefield", "Sinister Monolith");
    s = resolve(activateK8(s, "p1", mono, "Draw two cards"));
    expect(s.players.p1?.life).toBe(18);
    expect(handOf(s)).toEqual(["Plains", "Plains"]);
    expect(graveOf(s)).toEqual(["Sinister Monolith"]);
    let t = scenario({ p1: { battlefield: ["Sinister Monolith"] } });
    t = advanceUntil(t, (x) => x.turn.step === "main2");
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([21, 19]);
  });

  it("Spellgyre: counters a spell, or surveil 2 then draw two cards", () => {
    let s = scenario({
      active: "p2",
      p1: { battlefield: lands("Island", 4), hand: ["Spellgyre"], library: ["Opt", "Stab", "Plains", "Island"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    s = act(cast(s, "p2", "Shock", { targets: { t: ["p1"] } }), "p2", { type: "pass" });
    const modes = castOption(s, "Spellgyre").opt?.modes ?? [];
    const counter = modes.find((m) => m.label?.includes("Counter"));
    const t = s;
    s = resolve(cast(s, "p1", "Spellgyre", { mode: counter?.index, targets: { t: [s.stack[0]?.id as string] } }));
    expect(s.players.p1?.life).toBe(20);
    const draw = modes.find((m) => m.label?.includes("Surveil"));
    const u = resolve(cast(t, "p1", "Spellgyre", { mode: draw?.index }), (req) =>
      req.type === "pick" && req.intent === "surveilGraveyard" ? req.options : undefined,
    );
    expect(graveOf(u).sort()).toEqual(["Opt", "Spellgyre", "Stab"]);
    expect(handOf(u)).toEqual(["Plains", "Island"]);
  });

  it("Splash Lasher: taps up to one targeted creature and puts a stun counter; offspring {1}{U}", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Splash Lasher"] },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const picks = [angel, cub];
    s = resolve(cast(s, "p1", "Splash Lasher", { kicked: true }), (req) =>
      req.type === "pick" && req.intent === "triggerTarget" ? [picks.shift() as string] : undefined,
    );
    expect(idsOf(s, "p1", "battlefield", "Splash Lasher")).toHaveLength(2);
    for (const id of [angel, cub]) {
      expect(s.objects[id]?.tapped).toBe(true);
      expect(s.objects[id]?.counters.stun).toBe(1);
    }
  });

  it("Splash Portal: exiles one of your creatures then returns it; draw if it's a Bird, Frog, Otter or Rat", () => {
    const run = (name: string) => {
      const s = scenario({ p1: { battlefield: ["Island", name], hand: ["Splash Portal"], library: lands("Plains", 2) } });
      const id = idOf(s, "p1", "battlefield", name);
      const t = resolve(cast(s, "p1", "Splash Portal", { targets: { t: [id] } }));
      expect(idOf(t, "p1", "battlefield", name)).not.toBe(id);
      return t.players.p1?.hand.length;
    };
    expect(run("Healer's Hawk")).toBe(1);
    expect(run("Bear Cub")).toBe(0);
  });

  it("Star Charter: flying; at your end step, if you gained or lost life, a creature with power 3 or less among four cards into hand", () => {
    const run = (gain: boolean) => {
      let s = scenario({
        p1: {
          battlefield: ["Star Charter", "Vampire Neonate", ...lands("Swamp", 2)],
          library: ["Serra Angel", "Bear Cub", "Forest", "Opt", "Plains"],
        },
      });
      if (gain) s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      return advanceUntil(s, (x) => x.turn.active === "p2");
    };
    const a = run(true);
    expect(handOf(a)).toEqual(["Bear Cub"]);
    expect(namesIn(a, a.players.p1?.library)[0]).toBe("Plains");
    const b = run(false);
    expect(b.players.p1?.hand).toHaveLength(0);
    expect(chars(b, idOf(b, "p1", "battlefield", "Star Charter")).keywords).toContain("flying");
  });
});

describe("Bloomburrow, lot K8 : peu communes (4)", () => {
  /** Casts two Lightning Strikes at p2: the fourth mana spent on spells this turn (expend 4). */
  const expend4 = (s: S, ans: Answer = () => undefined) => {
    const a = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), ans);
    return resolve(cast(a, "p1", "Lightning Strike", { targets: { t: ["p2"] } }), ans);
  };
  const strikes = { hand: ["Lightning Strike", "Lightning Strike"] };

  it("Bark-Knuckle Boxer: expend 4 — indestructible until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Bark-Knuckle Boxer", ...lands("Mountain", 4)], ...strikes } });
    const boxer = idOf(s, "p1", "battlefield", "Bark-Knuckle Boxer");
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(chars(s, boxer).keywords).not.toContain("indestructible");
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(chars(s, boxer).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, boxer).keywords).not.toContain("indestructible");
  });

  it("Bonecache Overseer: {T}, 1 life: draw, only if three cards left your graveyard or you sacrificed a Food this turn", () => {
    let s = addTokens(
      scenario({ p1: { battlefield: ["Bonecache Overseer", ...lands("Forest", 2)], library: lands("Plains", 2) } }),
      "Food",
      1,
    );
    const over = idOf(s, "p1", "battlefield", "Bonecache Overseer");
    expect(canActivateK8(s, "p1", over, "Draw")).toBe(false);
    s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Food"), "+3 life"));
    s = resolve(activateK8(s, "p1", over, "Draw"));
    expect(handOf(s)).toEqual(["Plains"]);
    expect(s.players.p1?.life).toBe(22);
    let t = scenario({
      p1: {
        battlefield: ["Bonecache Overseer", ...lands("Forest", 2)],
        hand: ["Bushy Bodyguard"],
        graveyard: ["Opt", "Stab", "Island"],
      },
    });
    t = resolve(cast(t, "p1", "Bushy Bodyguard"), answer({ yes: true }));
    expect(t.players.p1?.graveyard).toHaveLength(0);
    expect(canActivateK8(t, "p1", idOf(t, "p1", "battlefield", "Bonecache Overseer"), "Draw")).toBe(true);
  });

  it("Brambleguard Captain: at the beginning of combat on your turn, one of your creatures gains +X/+0 (X = the Captain's power)", () => {
    let s = scenario({ p1: { battlefield: ["Brambleguard Captain", "Bear Cub"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = driveUntil(s, (x) => x.pending?.kind === "declareAttackers", answer({ pick: [cub] }));
    expect(ptOf(s, cub)).toEqual([4, 2]);
  });

  it("Brambleguard Veteran: expend 4 — your Raccoons +1/+1 and vigilance until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Brambleguard Veteran", "Bark-Knuckle Boxer", "Bear Cub", ...lands("Mountain", 4)], ...strikes },
    });
    s = expend4(s);
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Brambleguard Veteran"))).toEqual([4, 5]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Bark-Knuckle Boxer")).keywords).toContain("vigilance");
    expect(ptOf(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
  });

  it("Brazen Collector: first strike; on attacking, adds {R}, which stays until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Brazen Collector"] } });
    const col = idOf(s, "p1", "battlefield", "Brazen Collector");
    expect(chars(s, col).keywords).toContain("firstStrike");
    s = driveUntil(attack(s, [col]), (x) => x.turn.step === "main2");
    expect(s.players.p1?.manaPool.R).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(s.players.p1?.manaPool.R ?? 0).toBe(0);
  });

  it("Burrowguard Mentor: trample; P/T equal to the number of creatures you control", () => {
    const s = scenario({
      p1: { battlefield: ["Burrowguard Mentor", "Bear Cub", "Llanowar Elves"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const m = idOf(s, "p1", "battlefield", "Burrowguard Mentor");
    expect(ptOf(s, m)).toEqual([3, 3]);
    expect(chars(s, m).keywords).toContain("trample");
  });

  it("Calamitous Tide: up to two creatures returned to their owner's hand; draw two cards, then discard one", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub"], hand: ["Calamitous Tide"], library: ["Opt", "Plains"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const ids = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Serra Angel")];
    s = resolve(cast(s, "p1", "Calamitous Tide", { targets: { t: ids } }), (req, _p, cur) => pickNamed(cur, req, "Plains"));
    expect(handOf(s, "p2")).toEqual(["Serra Angel"]);
    expect(handOf(s).sort()).toEqual(["Bear Cub", "Opt"]);
    expect(graveOf(s).sort()).toEqual(["Calamitous Tide", "Plains"]);
  });

  it("Clifftop Lookout: reach; reveals up to one land, put onto the battlefield tapped, the rest on the bottom", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Clifftop Lookout"], library: ["Opt", "Bear Cub", "Island", "Swamp"] },
    });
    s = resolve(cast(s, "p1", "Clifftop Lookout"));
    expect(chars(s, idOf(s, "p1", "battlefield", "Clifftop Lookout")).keywords).toContain("reach");
    expect(s.objects[idOf(s, "p1", "battlefield", "Island")]?.tapped).toBe(true);
    const lib = namesIn(s, s.players.p1?.library);
    expect(lib[0]).toBe("Swamp");
    expect(lib.slice(1).sort()).toEqual(["Bear Cub", "Opt"]);
  });

  it("Curious Forager: on entering, you may forage; if you do, a permanent card returns from the graveyard to hand", () => {
    const setup = () =>
      addTokens(
        scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Curious Forager"], graveyard: ["Bear Cub", "Opt"] } }),
        "Food",
        1,
      );
    let s = setup();
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Curious Forager"), (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.type === "pick" && req.intent === "triggerTarget") options = namesIn(cur, req.options) as string[];
      return undefined;
    });
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(0);
    expect(handOf(s)).toEqual(["Bear Cub"]);
    expect(options.includes("Opt")).toBe(false);
    const t = resolve(cast(setup(), "p1", "Curious Forager"), answer({ yes: false }));
    expect(idsOf(t, "p1", "battlefield", "Food")).toHaveLength(1);
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Daring Waverider: on entering, casts for free an instant or sorcery with MV 4 or less from your graveyard, exiled afterward", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 6), hand: ["Daring Waverider"], graveyard: ["Lightning Strike", "Opt"] },
    });
    s = toCastNow(cast(s, "p1", "Daring Waverider"), answer({ pick: [idOf(s, "p1", "graveyard", "Lightning Strike")] }));
    const strike = idOf(s, "p1", "graveyard", "Lightning Strike");
    expect(castNowOf(s)?.cards).toEqual([strike]);
    s = resolve(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(17);
    expect(exiled(s, "Lightning Strike")).toHaveLength(1);
    expect(graveOf(s)).toEqual(["Opt"]);
  });

  it("Harnesser of Storms: a noncreature or Otter spell — you may exile the top card, playable this turn; once per turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Harnesser of Storms", ...lands("Island", 2)],
        hand: ["Opt", "Opt"],
        library: ["Forest", "Island", "Plains", "Swamp"],
      },
    });
    s = resolve(cast(s, "p1", "Opt"), answer({ yes: true }));
    const forest = exiled(s, "Forest")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    s = resolve(cast(s, "p1", "Opt"), answer({ yes: true }));
    expect(s.exile).toHaveLength(1);
    let t = scenario({ p1: { battlefield: ["Harnesser of Storms", "Island", "Mountain"], hand: ["Stormcatch Mentor"] } });
    const t0 = t.exile.length;
    t = resolve(cast(t, "p1", "Stormcatch Mentor"), answer({ yes: true }));
    expect(t.exile.length).toBe(t0 + 1);
  });

  it("Harvestrite Host: it or another Rabbit enters — one of your creatures +1/+0; draw on the second resolution of the turn, not the third", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Plains", 7), "Bear Cub"],
        hand: ["Harvestrite Host", "Intrepid Rabbit", "Savannah Lions"],
        library: lands("Island", 3),
      },
    });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(cast(s, "p1", "Harvestrite Host"), answer({ pick: [cub] }));
    expect(ptOf(s, cub)).toEqual([3, 2]);
    expect(s.players.p1?.hand).toHaveLength(2);
    s = resolve(cast(s, "p1", "Intrepid Rabbit"), answer({ pick: [cub] }));
    expect(handOf(s).sort()).toEqual(["Island", "Savannah Lions"]);
    s = resolve(cast(s, "p1", "Savannah Lions"), answer({ pick: [cub] }));
    expect(handOf(s)).toEqual(["Island"]);
  });

  it("Hazardroot Herbalist: whenever you attack, one of your creatures +1/+0; a token also gains deathtouch", () => {
    let s = addTokens(scenario({ p1: { battlefield: ["Hazardroot Herbalist", "Bear Cub"] } }), "Cat", 1);
    const cat = idOf(s, "p1", "battlefield", "Cat");
    s = resolve(attack(s, [idOf(s, "p1", "battlefield", "Bear Cub")]), answer({ pick: [cat] }));
    expect(ptOf(s, cat)).toEqual([2, 1]);
    expect(chars(s, cat).keywords).toContain("deathtouch");
    let t = scenario({ p1: { battlefield: ["Hazardroot Herbalist", "Bear Cub"] } });
    const cub = idOf(t, "p1", "battlefield", "Bear Cub");
    t = resolve(attack(t, [cub]), answer({ pick: [cub] }));
    expect(ptOf(t, cub)).toEqual([3, 2]);
    expect(chars(t, cub).keywords).not.toContain("deathtouch");
  });

  it("Heirloom Epic: {4}, {T}: draw a card (sorcery)", () => {
    let s = scenario({ p1: { battlefield: ["Heirloom Epic", ...lands("Plains", 4)], library: lands("Island", 2) } });
    const epic = idOf(s, "p1", "battlefield", "Heirloom Epic");
    s = resolve(activateK8(s, "p1", epic, "Draw"));
    expect(handOf(s)).toEqual(["Island"]);
    const t = scenario({ active: "p2", p1: { battlefield: ["Heirloom Epic", ...lands("Plains", 4)] } });
    expect(canActivateK8(act(t, "p2", { type: "pass" }), "p1", epic, "Draw")).toBe(false);
  });

  it("Heirloom Epic: creatures you control can pay its mana, summoning sick ones too (convoke, PLAN-L L5)", () => {
    let s = scenario({
      p1: {
        battlefield: ["Heirloom Epic", ...lands("Plains", 2), "Bear Cub", { name: "Bear Cub", sick: true }],
        library: lands("Island", 2),
      },
    });
    const epic = idOf(s, "p1", "battlefield", "Heirloom Epic");
    expect(canActivateK8(s, "p1", epic, "Draw")).toBe(true);
    s = resolve(activateK8(s, "p1", epic, "Draw"));
    expect(handOf(s)).toEqual(["Island"]);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Plains").every((id) => s.objects[id]?.tapped)).toBe(true);
  });

  it("Starforged Sword: with the gift (a tapped Fish), attaches on entering; +3/+3 and loses flying; equip {3}", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Healer's Hawk"], hand: ["Starforged Sword"] } });
    const hawk = idOf(s, "p1", "battlefield", "Healer's Hawk");
    s = resolve(cast(s, "p1", "Starforged Sword", { kicked: true }), answer({ pick: [hawk] }));
    expect(s.objects[idOf(s, "p2", "battlefield", "Fish")]?.tapped).toBe(true);
    expect(ptOf(s, hawk)).toEqual([4, 4]);
    expect(chars(s, hawk).keywords).not.toContain("flying");
    let t = scenario({ p1: { battlefield: [...lands("Plains", 7), "Healer's Hawk"], hand: ["Starforged Sword"] } });
    t = resolve(cast(t, "p1", "Starforged Sword"));
    const sword = idOf(t, "p1", "battlefield", "Starforged Sword");
    expect(t.objects[sword]?.attachedTo).toBeFalsy();
    t = resolve(activateK8(t, "p1", sword, "Equip {3}", { targets: { t: [idOf(t, "p1", "battlefield", "Healer's Hawk")] } }));
    expect(t.objects[sword]?.attachedTo).toBe(idOf(t, "p1", "battlefield", "Healer's Hawk"));
  });

  it("Stargaze: look at X cards twice, X into hand and the rest into the graveyard; you lose X life", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 4), hand: ["Stargaze"], library: ["Opt", "Stab", "Forest", "Island", "Plains"] },
    });
    s = resolve(cast(s, "p1", "Stargaze", { x: 2 }), (req, _p, cur) =>
      req.type === "pick" && req.intent === "lookAtTop"
        ? req.options.filter((id) => ["Opt", "Island"].includes(nameOf(cur, id) ?? ""))
        : undefined,
    );
    expect(handOf(s).sort()).toEqual(["Island", "Opt"]);
    expect(graveOf(s).sort()).toEqual(["Forest", "Stab", "Stargaze"]);
    expect(namesIn(s, s.players.p1?.library)).toEqual(["Plains"]);
    expect(s.players.p1?.life).toBe(18);
  });

  it("Starseer Mentor: flying and vigilance; at your end step, if you gained or lost life, the opponent loses 3 life unless they sacrifice or discard", () => {
    const run = (gain: boolean, p2: { battlefield?: string[]; hand?: string[] } = {}) => {
      let s = scenario({
        p1: { battlefield: ["Starseer Mentor", "Vampire Neonate", ...lands("Swamp", 2)] },
        p2: { hand: [], ...p2 },
      });
      if (gain) s = resolve(activateK8(s, "p1", idOf(s, "p1", "battlefield", "Vampire Neonate"), ""));
      return advanceUntil(s, (x) => x.turn.active === "p2");
    };
    expect(chars(run(false), idOf(run(false), "p1", "battlefield", "Starseer Mentor")).keywords).toEqual(
      expect.arrayContaining(["flying", "vigilance"]),
    );
    expect(run(false).players.p2?.life).toBe(20);
    // Neonate: 1 life, then 3 life for lack of a permanent or card.
    expect(run(true).players.p2?.life).toBe(16);
    const c = run(true, { hand: ["Opt"] });
    // With a card in hand, the opponent may discard it rather than lose 3 life.
    expect([c.players.p2?.life, c.players.p2?.graveyard.length]).toEqual(c.players.p2?.graveyard.length ? [19, 1] : [16, 0]);
  });
});

describe("Bloomburrow, lot K8 : peu communes (5)", () => {
  it("Fireglass Mentor: at the beginning of your second main phase, if an opponent lost life, exiles two cards; one is playable this turn", () => {
    const run = (shock: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Fireglass Mentor", "Mountain"], hand: ["Shock"], library: ["Forest", "Opt", "Plains"] },
      });
      if (shock) s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      return driveUntil(
        s,
        (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority",
        (req, _p, cur) => pickNamed(cur, req, "Forest"),
      );
    };
    const s = run(true);
    expect(namesIn(s, s.exile).sort()).toEqual(["Forest", "Opt"]);
    const forest = exiled(s, "Forest")[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(true);
    expect(playable(s, exiled(s, "Opt")[0] as string)).toBe(false);
    expect(run(false).exile).toHaveLength(0);
  });

  it("Stormcatch Mentor: haste and prowess; your instants and sorceries cost {1} less", () => {
    const s = scenario({ p1: { battlefield: ["Stormcatch Mentor", "Mountain"], hand: ["Lightning Strike", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Stormcatch Mentor")).keywords).toEqual(
      expect.arrayContaining(["haste", "prowess"]),
    );
    expect(castable(s, "p1", idOf(s, "p1", "hand", "Lightning Strike"))).toBe(true);
    const t = scenario({ p1: { battlefield: ["Stormcatch Mentor", "Forest"], hand: ["Bear Cub"] } });
    expect(castable(t, "p1", idOf(t, "p1", "hand", "Bear Cub"))).toBe(false);
  });

  it("Sugar Coat: flash; the enchanted creature becomes a colorless artifact Food, without its other types or abilities", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Sugar Coat"] },
      p2: { battlefield: ["Serra Angel", ...lands("Plains", 2)] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(castOption(s, "Sugar Coat").opt).toBeDefined();
    s = resolve(cast(s, "p1", "Sugar Coat", { targets: { enchant: [angel] } }));
    const c = chars(s, angel);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Food"]);
    expect(c.colors).toEqual([]);
    expect(c.keywords).not.toContain("flying");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    s = resolve(activateK8(s, "p2", angel, "+3 life"));
    expect(s.players.p2?.life).toBe(23);
  });

  it("Tangle Tumbler: vigilance; {3}, {T}: a +1/+1 counter on a targeted creature; tap two tokens: it becomes an artifact creature", () => {
    let s = addTokens(scenario({ p1: { battlefield: ["Tangle Tumbler", "Bear Cub", ...lands("Forest", 3)] } }), "Food", 2);
    const tumbler = idOf(s, "p1", "battlefield", "Tangle Tumbler");
    expect(chars(s, tumbler).types).not.toContain("Creature");
    s = resolve(activateK8(s, "p1", tumbler, "Tap two tokens"));
    expect(chars(s, tumbler).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, tumbler).keywords).toContain("vigilance");
    expect(ptOf(s, tumbler)).toEqual([6, 6]);
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    s = resolve(activateK8(s, "p1", tumbler, "counter", { targets: { t: [cub] } }));
    expect(plusOne(s, cub)).toBe(1);
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(chars(s, tumbler).types).not.toContain("Creature");
  });

  it("Thought-Stalker Warlock: menace; if the targeted opponent lost life this turn, you choose a nonland card from their hand; otherwise they discard a card", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Swamp", 3), "Mountain"], hand: ["Shock", "Thought-Stalker Warlock"] },
      p2: { hand: ["Forest", "Opt", "Stab"] },
    });
    s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
    let chooser: string | undefined;
    let options: string[] = [];
    s = resolve(cast(s, "p1", "Thought-Stalker Warlock"), (req, p, cur) => {
      if (req.type !== "pick" || req.intent !== "discard") return undefined;
      chooser = p;
      options = namesIn(cur, req.options) as string[];
      return pickNamed(cur, req, "Stab");
    });
    expect(chooser).toBe("p1");
    expect(options.sort()).toEqual(["Opt", "Stab"]);
    expect(graveOf(s, "p2")).toEqual(["Stab"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Thought-Stalker Warlock")).keywords).toContain("menace");
    let t = scenario({
      p1: { battlefield: lands("Swamp", 3), hand: ["Thought-Stalker Warlock"] },
      p2: { hand: ["Forest", "Opt"] },
    });
    t = resolve(cast(t, "p1", "Thought-Stalker Warlock"));
    expect(t.players.p2?.hand).toHaveLength(1);
    expect(t.players.p2?.graveyard).toHaveLength(1);
  });

  it("Three Tree Scribe: it or another of your creatures leaves the battlefield without dying — a counter on one of your creatures; not when dying", () => {
    let s = scenario({
      p1: { battlefield: ["Three Tree Scribe", "Bear Cub", "Llanowar Elves", "Island"], hand: ["Splash Portal"] },
    });
    const scribe = idOf(s, "p1", "battlefield", "Three Tree Scribe");
    s = resolve(
      cast(s, "p1", "Splash Portal", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      answer({ pick: [scribe] }),
    );
    expect(plusOne(s, scribe)).toBe(1);
    destroy(s, idOf(s, "p1", "battlefield", "Llanowar Elves"));
    s = resolve(s, answer({ pick: [scribe] }));
    expect(plusOne(s, scribe)).toBe(1);
  });

  it("Tidecaller Mentor: menace; threshold — on entering, returns up to one nonland permanent to its owner's hand", () => {
    const run = (n: number) => {
      const s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Swamp"], hand: ["Tidecaller Mentor"], graveyard: Array(n).fill("Opt") },
        p2: { battlefield: ["Serra Angel"] },
      });
      return resolve(cast(s, "p1", "Tidecaller Mentor"), answer({ pick: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    };
    const a = run(7);
    expect(handOf(a, "p2")).toEqual(["Serra Angel"]);
    expect(chars(a, idOf(a, "p1", "battlefield", "Tidecaller Mentor")).keywords).toContain("menace");
    expect(idsOf(run(6), "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Valley Rally: your creatures +2/+0; with the gift (a Food), one of your creatures gains first strike", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub", "Llanowar Elves"], hand: ["Valley Rally"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const cub = idOf(s, "p1", "battlefield", "Bear Cub");
      return { s: resolve(cast(s, "p1", "Valley Rally", { kicked, targets: { t: kicked ? [cub] : [] } })), cub };
    };
    const a = run(false);
    expect(ptOf(a.s, a.cub)).toEqual([4, 2]);
    expect(ptOf(a.s, idOf(a.s, "p1", "battlefield", "Llanowar Elves"))).toEqual([3, 1]);
    expect(ptOf(a.s, idOf(a.s, "p2", "battlefield", "Bear Cub"))).toEqual([2, 2]);
    expect(chars(a.s, a.cub).keywords).not.toContain("firstStrike");
    const b = run(true);
    expect(chars(b.s, b.cub).keywords).toContain("firstStrike");
    expect(idsOf(b.s, "p2", "battlefield", "Food")).toHaveLength(1);
  });

  it("Vinereap Mentor: a Food on entering and one on dying", () => {
    let s = scenario({ p1: { battlefield: ["Swamp", "Forest"], hand: ["Vinereap Mentor"] } });
    s = resolve(cast(s, "p1", "Vinereap Mentor"));
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(1);
    destroy(s, idOf(s, "p1", "battlefield", "Vinereap Mentor"));
    s = resolve(s);
    expect(idsOf(s, "p1", "battlefield", "Food")).toHaveLength(2);
  });

  it("Wandertale Mentor: expend 4 — a +1/+1 counter; {T}: {R} or {G}", () => {
    let s = scenario({
      p1: { battlefield: ["Wandertale Mentor", ...lands("Mountain", 4)], hand: ["Lightning Strike", "Lightning Strike"] },
    });
    const m = idOf(s, "p1", "battlefield", "Wandertale Mentor");
    const colors = legalActions(s, "p1").flatMap((a) => (a.type === "tapForMana" && a.source === m ? a.colors : []));
    expect(colors.sort()).toEqual(["G", "R"]);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(plusOne(s, m)).toBe(0);
    s = resolve(cast(s, "p1", "Lightning Strike", { targets: { t: ["p2"] } }));
    expect(plusOne(s, m)).toBe(1);
  });

  it("Wear Down: destroys an artifact or an enchantment; two with the gift", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 2), hand: ["Wear Down"] },
        p2: { battlefield: ["Banishing Light", "Patchwork Banner", "Serra Angel"], library: lands("Plains", 2) },
      });
    let s = setup();
    const ids = ["Banishing Light", "Patchwork Banner"].map((n) => idOf(s, "p2", "battlefield", n));
    expect(castOption(s, "Wear Down").opt?.modes[0]?.targets[0]?.legal).not.toContain(
      idOf(s, "p2", "battlefield", "Serra Angel"),
    );
    expect(() => cast(s, "p1", "Wear Down", { targets: { t: ids } })).toThrow(RulesError);
    s = resolve(cast(s, "p1", "Wear Down", { targets: { t: ids.slice(0, 1) } }));
    expect(idsOf(s, "p2", "battlefield", "Banishing Light")).toHaveLength(0);
    let t = setup();
    t = resolve(cast(t, "p1", "Wear Down", { kicked: true, targets: { t: ids } }));
    expect(graveOf(t, "p2").sort()).toEqual(["Banishing Light", "Patchwork Banner"]);
    expect(t.players.p2?.hand).toHaveLength(1);
  });

  it("Wick's Patrol: on entering, mills three cards; a targeted opposing creature gets -X/-X (X = the greatest MV in your graveyard)", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Swamp", 6),
        hand: ["Wick's Patrol"],
        graveyard: ["Bear Cub"],
        library: ["Opt", "Serra Angel", "Forest", "Island"],
      },
      p2: { battlefield: ["Serra Angel", "Bear Cub"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = resolve(cast(s, "p1", "Wick's Patrol"), answer({ pick: [angel] }));
    expect(graveOf(s).sort()).toEqual(["Bear Cub", "Forest", "Opt", "Serra Angel"]);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });

  it("Wildfire Howl: 2 damage to each creature; with the gift, also 1 damage to any target", () => {
    const run = (kicked: boolean) => {
      const s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Bear Cub"], hand: ["Wildfire Howl"] },
        p2: { battlefield: ["Serra Angel"], library: lands("Plains", 2) },
      });
      return resolve(cast(s, "p1", "Wildfire Howl", { kicked, targets: { t: kicked ? ["p2"] : [] } }));
    };
    const a = run(false);
    expect(idsOf(a, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(a.objects[idOf(a, "p2", "battlefield", "Serra Angel")]?.damage).toBe(2);
    expect(a.players.p2?.life).toBe(20);
    const b = run(true);
    expect(b.players.p2?.life).toBe(19);
    expect(b.players.p2?.hand).toHaveLength(1);
  });
});

describe("PLAN-M M11a: forage during a resolution asks how and what", () => {
  const FOOD = customCard({ name: "Test Food", types: ["Artifact"], typeLine: "Artifact — Food", subtypes: ["Food"] });
  const setup = () =>
    scenario({
      p1: {
        battlefield: [...lands("Forest", 4), FOOD],
        hand: ["Treetop Sentries"],
        graveyard: ["Opt", "Forest", "Stab", "Shock"],
      },
    });
  const castSentries = (s: S, answer: Answer) =>
    resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Treetop Sentries") }), answer);

  it("Treetop Sentries: a Food rather than three cards (both possible: the player chooses how)", () => {
    let ways: unknown;
    const s = castSentries(setup(), (req) => {
      if (req.type === "yesNo") return [1];
      if (req.intent !== "forage" || req.type !== "pick") return undefined;
      ways = [req.options, req.suggested];
      return ["food"];
    });
    // Suggested: three cards from the graveyard (the former automatic choice).
    expect(ways).toEqual([["graveyard", "food"], ["graveyard"]]);
    expect(idsOf(s, "p1", "battlefield", "Test Food")).toHaveLength(0);
    expect(s.players.p1?.graveyard).toHaveLength(5);
    // The card drawn for foraging.
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Treetop Sentries: the three cards exiled are chosen (not the lands first)", () => {
    let s = setup();
    const keep = idOf(s, "p1", "graveyard", "Forest");
    let suggested: unknown;
    s = castSentries(s, (req, _p, cur) => {
      if (req.type === "yesNo") return [1];
      if (req.intent !== "forage" || req.type !== "pick") return undefined;
      if (req.options.includes("graveyard")) return ["graveyard"];
      suggested = req.suggested.map((id) => nameOf(cur, String(id)));
      return req.options.filter((id) => id !== keep);
    });
    expect(suggested).toEqual(expect.arrayContaining(["Forest"]));
    expect(namesIn(s, s.players.p1?.graveyard)).toEqual(["Forest"]);
    expect(idsOf(s, "p1", "battlefield", "Test Food")).toHaveLength(1);
  });
});
