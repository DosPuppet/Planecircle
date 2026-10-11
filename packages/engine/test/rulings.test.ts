/**
 * Tests drawn from official rulings (Scryfall rulings and comprehensive rules) for frequent meta interactions:
 * lifelink, copies, replacements, cleanup (PLAN-R in docs/history.md, lot R7).
 */
import { card, nameCatalog } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { createTokens, dealDamage, destroy, gainLife, sacrifice, sourceFromObject } from "../src/actions";
import { eventReplacement, fx, graveyardReplacement, ref, spell, target, triggered, when } from "../src/dsl";
import { addEffect, runEffect } from "../src/effects";
import { RulesError } from "../src/errors";
import { fallbackDecision } from "../src/host";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { nameValidator } from "../src/names";
import { counterItem } from "../src/stack";
import { changeCounters, chars, createObject, moveObject, registerDef } from "../src/state";
import { addPlayerEffect } from "../src/statics";
import { matchesObjectFilter } from "../src/targets";
import {
  allowedDefenders,
  attackRequirements,
  blockRequirements,
  forcedAttacks,
  preferredDefenders,
  repairAttacks,
  requiredBlocks,
  stateBasedActions,
} from "../src/turn";
import { countTurnEvents } from "../src/turnlog";
import type { CardDef, ChoiceRequest, ChoiceValue, GameState } from "../src/types";
import { act, advanceUntil, customCard, idOf, idsOf, lands, passAccepting, passUntil, scenario } from "./helpers";

const ench = (name: string, ab: CardDef["abilities"][number]) =>
  customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });

const resolution = (controller: string) => ({
  item: { id: "x", controller, sourceId: "none", sourceDefId: "none", targets: {} },
  controller,
  targets: {},
  vars: {},
  pc: 0,
});

/** Passes and accepts the suggested choices until the condition holds. */
const settle = (s: GameState, until: (x: GameState) => boolean) => passAccepting(s, until);

describe("lifelink (702.15, Ajani's Pridemate rulings)", () => {
  const linker = (name: string) => customCard({ name, power: 2, toughness: 2, keywords: ["lifelink"] });

  it("two sources with lifelink dealing damage at the same time: two separate life gains", () => {
    const a = linker("Lien A");
    const b = linker("Lien B");
    let s = scenario({ p1: { battlefield: ["Ajani's Pridemate", a, b] } });
    const pridemate = idOf(s, "p1", "battlefield", "Ajani's Pridemate");
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: idOf(s, "p1", "battlefield", a.name), defender: "p2" },
        { id: idOf(s, "p1", "battlefield", b.name), defender: "p2" },
      ],
    });
    s = settle(s, (x) => x.turn.step === "endCombat" && x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p1?.life).toBe(24);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(2);
  });

  it("prevented damage does not gain life", () => {
    const a = linker("Lien C");
    const s = scenario({ p1: { battlefield: [a] }, p2: { battlefield: ["Progenitus"] } });
    const src = idOf(s, "p1", "battlefield", a.name);
    dealDamage(
      s,
      { id: src, defId: a.id, controller: "p1", keywords: ["lifelink"] },
      idOf(s, "p2", "battlefield", "Progenitus"),
      3,
      false,
    );
    expect(s.players.p1?.life).toBe(20);
  });
});

describe("spell copies (707.10)", () => {
  it("a copy is not cast: prowess triggers only for cast spells", () => {
    const prowler = customCard({ name: "Test Prowess", power: 1, toughness: 1, keywords: ["prowess"] });
    let s = scenario({
      p1: {
        battlefield: ["Thousand-Year Storm", prowler, "Forest", "Forest", "Forest", "Forest"],
        hand: ["Giant Growth", "Giant Growth"],
      },
    });
    const id = idOf(s, "p1", "battlefield", prowler.name);
    const empty = (x: GameState) => x.stack.length === 0 && x.pending?.kind === "priority";
    for (let i = 0; i < 2; i++) {
      const growth = idsOf(s, "p1", "hand", "Giant Growth")[0] as string;
      s = settle(act(s, "p1", { type: "cast", card: growth, targets: { t: [id] } }), empty);
    }
    // Two Giant Growths cast and a copy (+9), two prowess triggers (+2): 1 + 9 + 2.
    expect(chars(s, id).power).toBe(12);
  });

  it("countering the original does not counter the copy", () => {
    let s = scenario({
      p1: { battlefield: ["Thousand-Year Storm", "Bear Cub", "Forest", "Forest"], hand: ["Giant Growth", "Giant Growth"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const empty = (x: GameState) => x.stack.length === 0 && x.pending?.kind === "priority";
    s = settle(
      act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [bear] } }),
      empty,
    );
    s = act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Giant Growth")[0] as string, targets: { t: [bear] } });
    const original = s.stack[0]?.id as string;
    // Thousand-Year Storm's trigger resolves: the copy is above the original.
    s = settle(s, (x) => x.stack.some((i) => i.copy) && x.pending?.kind === "priority");
    expect(counterItem(s, original, "test")).toBe(true);
    s = settle(s, empty);
    // First Giant Growth and the copy: +6.
    expect(chars(s, bear).power).toBe(2 + 6);
  });
});

describe("remplacements (616, 615)", () => {
  it("616.1: the damaged player applies their shield after the opposing doubler (New Way Forward returns 6, not 3)", () => {
    const tyrant = ench(
      "Tyran D",
      eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }),
    );
    const s = scenario({ p1: { battlefield: [tyrant, "Bear Cub"] }, p2: { library: Array(8).fill("Forest") } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    addPlayerEffect(
      s,
      "p2",
      {
        replacement: {
          event: "damage",
          to: "you",
          modify: { prevent: true },
          sourceIs: bear,
          origin: { id: bear, defId: s.objects[bear]?.defId as string },
          onPrevent: {
            reflexive: [fx.draw({ kind: "eventAmount" }), fx.damage({ kind: "eventAmount" }, { kind: "eventPlayer" })],
          },
        },
      },
      s.turn.number,
      true,
    );
    dealDamage(s, sourceFromObject(s, bear), "p2", 3, false);
    expect(s.players.p2?.life).toBe(20);
    const t = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect(t.players.p1?.life).toBe(20 - 6);
  });

  it("616.1: a prevention from another player goes before the doublers (The Mindskinner mills 3, not 6)", () => {
    const s = scenario({
      p1: { battlefield: ["The Mindskinner", "Twinflame Tyrant", "Bear Cub"] },
      p2: { library: Array(10).fill("Forest") },
    });
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub")), "p2", 3, false);
    expect(s.players.p2?.life).toBe(20);
    expect(s.players.p2?.library).toHaveLength(7);
  });

  it("The Mindskinner mills (701.13): a mill replacement applies (The Water Crystal: plus four)", () => {
    const s = scenario({
      p1: { battlefield: ["The Mindskinner", "The Water Crystal", "Bear Cub"] },
      p2: { library: Array(12).fill("Forest") },
    });
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub")), "p2", 2, false);
    expect(s.players.p2?.life).toBe(20);
    // 2 prevented, the opponent mills 2 + 4.
    expect(s.players.p2?.library).toHaveLength(6);
  });

  it("two damage doublers stack: 3 damage becomes 12", () => {
    const tyrant = (name: string) =>
      ench(name, eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }));
    const s = scenario({ p1: { battlefield: [tyrant("Tyran A"), tyrant("Tyran B"), "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      {
        ...resolution("p1"),
        item: { ...resolution("p1").item, sourceId: bear, sourceDefId: s.objects[bear]?.defId },
        targets: { t: ["p2"] },
      } as never,
      fx.damage(3, ref.target()),
    );
    expect(s.players.p2?.life).toBe(20 - 12);
  });

  it("prevented damage is not doubled (615 before 616)", () => {
    const s = scenario({
      p1: {
        battlefield: [
          ench(
            "Tyran C",
            eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }),
          ),
        ],
      },
      p2: { battlefield: ["Progenitus"] },
    });
    const progenitus = idOf(s, "p2", "battlefield", "Progenitus");
    dealDamage(s, { defId: "test", controller: "p1", keywords: [] }, progenitus, 3, false);
    expect(s.objects[progenitus]?.damage).toBe(0);
  });

  it("'exile it instead': a creature exiled instead of going to the graveyard doesn't 'die'", () => {
    const exile = ench("Test Exile", graveyardReplacement({}));
    const mourner = ench("Test Mourning", triggered(when.dies({ types: ["Creature"] }), [fx.gainLife(5)], { label: "mourning" }));
    let s = scenario({ p1: { battlefield: [exile, mourner, "Bear Cub"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(0);
    expect(s.players.p1?.life).toBe(20);
  });
});

describe("token and counter replacements (R1, family H)", () => {
  it("616.1: a replaced artifact token (Draconic Visitor) is also doubled (Doubling Season)", () => {
    const s = scenario({ p1: { battlefield: ["Doubling Season", "Draconic Visitor", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      { ...resolution("p1"), item: { ...resolution("p1").item, sourceId: bear } } as never,
      fx.createTokens({ name: "Treasure", colors: [], types: ["Artifact"], subtypes: ["Treasure"] }),
    );
    const dragons = s.battlefield.filter((id) => s.objects[id]?.isToken && chars(s, id).subtypes.includes("Dragon"));
    expect(dragons).toHaveLength(2);
  });

  it("a prevention ('counters can't be put') wins over a doubler", () => {
    const shield = ench("No Counters", eventReplacement({ event: "counters", modify: { prevent: true } }));
    const s = scenario({ p1: { battlefield: ["Doubling Season", shield, "Bear Cub"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")];
    if (bear) changeCounters(s, bear, "+1/+1", 1);
    expect(bear?.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("nettoyage (514)", () => {
  it("a cleanup discard that triggers: priority, then a new cleanup step (514.3a)", () => {
    const counter = ench("Test Discard", triggered(when.discard("you"), [fx.gainLife(1)], { label: "discard" }));
    const hand = Array(9).fill("Forest") as string[];
    let s = scenario({ p1: { battlefield: [counter], hand }, step: "end" });
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(s.players.p1?.hand).toHaveLength(7);
    expect(s.players.p1?.life).toBe(22);
  });
});

describe("prouesse multiple (702.108b)", () => {
  it("Thor Odinson ('prowess, prowess'): +2/+2 per noncreature spell", () => {
    let s = scenario({ p1: { battlefield: ["Thor Odinson", "Island"], hand: ["Opt"] } });
    const thor = idOf(s, "p1", "battlefield", "Thor Odinson");
    const base = chars(s, thor).power;
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
    );
    expect(chars(s, thor).power).toBe(base + 2);
  });
});

describe("Tablet of Discovery (SOS): permissions and restricted mana", () => {
  it("a milled land can be played this turn; restricted {R}{R} pays for an instant", () => {
    let s = scenario({
      p1: {
        battlefield: ["Mountain", "Mountain", "Mountain"],
        hand: ["Tablet of Discovery", "Lightning Strike"],
        library: ["Island", "Forest"],
      },
    });
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tablet of Discovery") }),
      (x) => x.stack.length === 0 && x.pending?.kind === "priority",
    );
    const island = idOf(s, "p1", "graveyard", "Island");
    s = act(s, "p1", { type: "playLand", card: island });
    expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    // Only source: the Tablet, whose {R}{R} (reserved for instants and sorceries) pays for Lightning Strike ({1}{R}).
    let t = scenario({ p1: { battlefield: ["Tablet of Discovery"], hand: ["Lightning Strike"] } });
    t = act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    expect(t.stack.length).toBe(1);
  });
});

describe("Ashiok, Wicked Manipulator (rulings of 2023-09-01)", () => {
  const pricey = customCard({
    name: "Ruling Priest",
    power: 1,
    toughness: 1,
    abilities: [{ kind: "activated", cost: { payLife: 3 }, effects: [fx.gainLife(1)], targets: [], label: "Gagnez 1 PV" }],
  });

  it("doesn't allow paying more life than the total, even with enough cards", () => {
    const s = scenario({
      p1: { life: 2, battlefield: ["Ashiok, Wicked Manipulator", pricey], library: Array(10).fill("Swamp") },
    });
    const priest = idOf(s, "p1", "battlefield", pricey.name);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === priest)).toBe(false);
  });

  it("the replacement is mandatory: no life paid as long as the library suffices", () => {
    let s = scenario({ p1: { battlefield: ["Ashiok, Wicked Manipulator", pricey], library: Array(4).fill("Swamp") } });
    const priest = idOf(s, "p1", "battlefield", pricey.name);
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === priest);
    s = act(s, "p1", { type: "activate", source: priest, ability: a?.type === "activate" ? a.ability : 0 });
    expect(s.players.p1?.life).toBe(20);
    expect(s.players.p1?.library).toHaveLength(1);
  });
});

describe("509.1c: 'must be blocked if able' and menace", () => {
  it("with a single creature able to block, no block is required; with two, both must block", () => {
    const lure = customCard({ name: "Menacing Lure", power: 2, toughness: 2, keywords: ["mustBeBlocked", "menace"] });
    const run = (blockers: string[]) => {
      let s = scenario({ p1: { battlefield: [lure] }, p2: { battlefield: blockers } });
      const attacker = idOf(s, "p1", "battlefield", lure.name);
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: attacker, defender: "p2" }] });
      return { s: advanceUntil(s, (x) => x.pending?.kind === "declareBlockers"), attacker };
    };
    // A single creature: no block possible with menace, so nothing is required (the engine asks nothing).
    const one = run(["Bear Cub"]);
    if (one.s.pending?.kind === "declareBlockers")
      expect(() => act(one.s, "p2", { type: "declareBlockers", blocks: [] })).not.toThrow();
    expect(requiredBlocks(one.s, "p2")).toEqual([]);
    const two = run(["Bear Cub", "Llanowar Elves"]);
    expect(() => act(two.s, "p2", { type: "declareBlockers", blocks: [] })).toThrow();
    const [a, b] = two.s.battlefield.filter((id) => two.s.objects[id]?.controller === "p2");
    expect(() =>
      act(two.s, "p2", {
        type: "declareBlockers",
        blocks: [
          { blocker: a as string, attacker: two.attacker },
          { blocker: b as string, attacker: two.attacker },
        ],
      }),
    ).not.toThrow();
  });
});

describe("608.2h: last known information of the creature that dies", () => {
  it("Rakdos Joins Up: the damage equals the legendary creature's power when it died, counters included", () => {
    const hero = customCard({ name: "Test Hero", supertypes: ["Legendary"], power: 2, toughness: 2 });
    let s = scenario({
      p1: { battlefield: ["Rakdos Joins Up", { name: hero, counters: { "+1/+1": 2 } }] },
      p2: { life: 20 },
    });
    destroy(s, idOf(s, "p1", "battlefield", "Test Hero"));
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("'card': a token that changes zones is not a card", () => {
  it("Moonshadow: a token put into the graveyard doesn't remove a -1/-1 counter; a permanent card does", () => {
    const token = customCard({ name: "Test Token", power: 1, toughness: 1 });
    let s = scenario({ p1: { battlefield: [{ name: "Moonshadow", counters: { "-1/-1": 6 } }, "Bear Cub", token] } });
    const shadow = idOf(s, "p1", "battlefield", "Moonshadow");
    const tok = idOf(s, "p1", "battlefield", "Test Token");
    s.objects[tok]!.isToken = true;
    destroy(s, tok);
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[shadow]?.counters["-1/-1"]).toBe(6);
    destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[shadow]?.counters["-1/-1"]).toBe(5);
  });
});

describe("fixes of lot A6 of Marvel Super Heroes", () => {
  it("608.2h: 'when an attacking creature dies' sees that it was attacking (last known information before 506.4)", () => {
    const mourner = ench(
      "Deuil d'attaquant",
      triggered(when.dies({ types: ["Creature"], attacking: true }), [fx.gainLife(5)], { label: "mourning" }),
    );
    let s = scenario({ p1: { battlefield: [mourner, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    destroy(s, bear);
    s = settle(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.players.p1?.life).toBe(25);
  });

  it("301.5c: an Equipment that becomes a creature becomes unattached", () => {
    const gear = customCard({
      name: "Test Gear",
      types: ["Artifact"],
      subtypes: ["Equipment"],
      typeLine: "Artifact — Equipment",
    });
    const s = scenario({ p1: { battlefield: [gear, "Bear Cub"] } });
    const g = idOf(s, "p1", "battlefield", "Test Gear");
    s.objects[g]!.attachedTo = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      { ...resolution("p1"), item: { ...resolution("p1").item, sourceId: g } } as never,
      fx.modify(ref.self, { addTypes: ["Creature"], setPower: 2, setToughness: 2 }),
    );
    stateBasedActions(s);
    expect(s.objects[g]?.attachedTo).toBeUndefined();
  });

  it("P/T defined by an ability: 'legendary creatures you control' counts only legendary ones", () => {
    const adaptoid = customCard({
      name: "Test Adaptoid",
      power: 0,
      toughness: 4,
      cda: { power: { kind: "count", filter: { types: ["Creature"], controller: "you", legendary: true } } },
    });
    const hero = customCard({ name: "Test Legend", supertypes: ["Legendary"], power: 1, toughness: 1 });
    const s = scenario({ p1: { battlefield: [adaptoid, hero, "Bear Cub"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Test Adaptoid")).power).toBe(1);
  });
});

describe("foundation of Marvel's Spider-Man", () => {
  it("700.9: modified = a counter, an Equipment, or an Aura controlled by the creature's controller", () => {
    const aura = customCard({ name: "Test Aura", types: ["Enchantment"], subtypes: ["Aura"], typeLine: "Enchantment — Aura" });
    const s = scenario({
      p1: { battlefield: ["Bear Cub", { name: "Llanowar Elves", counters: { "+1/+1": 1 } }, "Serra Angel"] },
      p2: { battlefield: [aura] },
    });
    const modified = (name: string) => matchesObjectFilter(s, "p1", idOf(s, "p1", "battlefield", name), { modified: true });
    expect(modified("Bear Cub")).toBe(false);
    expect(modified("Llanowar Elves")).toBe(true);
    // Opponent's Aura: the creature is not modified.
    const a = idOf(s, "p2", "battlefield", "Test Aura");
    s.objects[a]!.attachedTo = idOf(s, "p1", "battlefield", "Serra Angel");
    bump(s);
    expect(modified("Serra Angel")).toBe(false);
    s.objects[a]!.controller = "p1";
    bump(s);
    expect(modified("Serra Angel")).toBe(true);
  });

  it("615: Anti-Venom receives the counters within the replacement itself, with no ability on the stack", () => {
    const s = scenario({ p1: { battlefield: ["Anti-Venom, Horrifying Healer"] }, p2: { battlefield: ["Bear Cub"] } });
    const venom = idOf(s, "p1", "battlefield", "Anti-Venom, Horrifying Healer");
    dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Bear Cub")), venom, 2, true);
    expect(s.objects[venom]?.damage ?? 0).toBe(0);
    expect(s.objects[venom]?.counters["+1/+1"]).toBe(2);
    expect(s.stack).toHaveLength(0);
    expect(s.triggers).toHaveLength(0);
  });

  it("305.1: 'play a land from exile' doesn't count a land played from hand", () => {
    const watcher = customCard({
      name: "Test Exile Watcher",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [triggered({ on: "playLand", from: ["exile"] }, [fx.addCounters(ref.self, 1)])],
    });
    let s = scenario({ p1: { battlefield: [watcher], hand: ["Forest"] } });
    const w = idOf(s, "p1", "battlefield", "Test Exile Watcher");
    s = passAccepting(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }), (x) => x.triggers.length === 0);
    expect(s.objects[w]?.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("turn log: a played land is recorded with its starting zone (Spider-Man 2099)", () => {
    let s = scenario({ p1: { hand: ["Forest"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect(countTurnEvents(s, { event: "playLand", who: "you", fromZone: "hand" }, "p1")).toBe(1);
    expect(countTurnEvents(s, { event: "playLand", who: "you", fromZone: "graveyard" }, "p1")).toBe(0);
    expect(countTurnEvents(s, { event: "playLand", who: "opponent" }, "p1")).toBe(0);
  });

  it("Chimil, the Inner Sun: 'spells you control' also covers a creature spell", () => {
    let s = scenario({ p1: { battlefield: ["Chimil, the Inner Sun", "Forest", "Forest"], hand: ["Bear Cub"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") });
    const item = s.stack[0]?.id as string;
    expect(counterItem(s, item, "test")).toBe(false);
    expect(s.stack).toHaveLength(1);
  });
});

describe("fixes of lot A of Teenage Mutant Ninja Turtles", () => {
  it("603.3d: targets 'of different players' all on the same player — no legal target, no impossible choice", () => {
    let s = scenario({
      p1: { battlefield: Array(6).fill("Island"), hand: ["Kitsune, Dragon's Daughter"] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kitsune, Dragon's Daughter") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind !== "choice");
    expect(s.pending?.kind).toBe("priority");
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
  });
});

describe("fixes of lot A of The Hobbit", () => {
  it("106.6: restricted mana produced by hand goes into the restricted pool, not the free pool", () => {
    let s = scenario({ p1: { battlefield: ["Castle Doom"], hand: ["Bear Cub"] } });
    const castle = idOf(s, "p1", "battlefield", "Castle Doom");
    // Second mana ability: one color, only for an artifact spell.
    s = act(s, "p1", { type: "tapForMana", source: castle, ability: 1, color: "G" });
    expect(s.players.p1?.manaPool.G).toBe(0);
    expect(s.players.p1?.restrictedMana).toEqual([
      { type: "G", restriction: { spell: { types: ["Artifact"] } }, source: castle },
    ]);
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
  });
});

describe("end-of-The-Hobbit fixes", () => {
  it("613.1b: the Aura that gives control leaves — control returns at once, before state-based actions", () => {
    let s = scenario({
      p1: { battlefield: [...Array(6).fill("Island")], hand: ["Confiscate"] },
      p2: { battlefield: ["Forest"] },
    });
    const forest = idOf(s, "p2", "battlefield", "Forest");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Confiscate"), targets: { enchant: [forest] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    expect(s.objects[forest]?.controller).toBe("p1");
    // Returned to hand in the middle of a resolution: no state-based actions in between.
    moveObject(s, idOf(s, "p1", "battlefield", "Confiscate"), "hand");
    expect(s.objects[forest]?.controller).toBe("p2");
  });

  it("ceiling: ten token doublers do not create 1,024 tokens, but at most 100 (documented approximation)", () => {
    const doubler = customCard({
      name: "Test Token Doubler",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [eventReplacement({ event: "tokens", to: "you", modify: { times: 2 } })],
    });
    const s = scenario({ p1: { battlefield: Array(10).fill(doubler) } });
    const made = createTokens(
      s,
      "p1",
      { name: "Test Soldier", colors: ["W"], types: ["Creature"], subtypes: ["Soldier"], power: 1, toughness: 1 },
      1,
    );
    expect(made).toHaveLength(100);
  });
});

describe("509.1c and 509.1d: satisfy as many blocking requirements as possible (PLAN-C, lot C4)", () => {
  /** p1 attacks p2 with `attackers`; returns the position at the declare blockers step. */
  const toBlocks = (p1: (string | CardDef)[], p2: (string | CardDef)[], extra: Partial<Parameters<typeof scenario>[0]> = {}) => {
    let s = scenario({ p1: { battlefield: p1 }, p2: { battlefield: p2 }, ...extra });
    const attackers = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Creature"));
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
    return advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
  };
  const wolf = customCard({ name: "Test Wolf", power: 2, toughness: 2, subtypes: ["Wolf"] });
  const lure = customCard({ name: "Test Lure", power: 2, toughness: 2, keywords: ["mustBeBlocked"] });
  const guard = customCard({ name: "Test Guard", power: 1, toughness: 5 });

  it("'blocks this Wolf if able' and an attacker that 'must be blocked': either block is accepted", () => {
    let s = toBlocks([wolf, lure], [guard]);
    const [w, l, g] = [
      idOf(s, "p1", "battlefield", wolf.name),
      idOf(s, "p1", "battlefield", lure.name),
      idOf(s, "p2", "battlefield", guard.name),
    ];
    // Tolsimir: the creature must block this Wolf if able.
    addEffect(s, [g], { addBlockRules: [{ mustBlockAttacker: w, label: "Blocks this Wolf if able" }] }, "endOfTurn");
    // Only one requirement can be satisfied: block the Wolf or the lure; not blocking satisfies none.
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: g, attacker: w }] })).not.toThrow();
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: g, attacker: l }] })).not.toThrow();
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).toThrow(RulesError);
    // The default block (host fallback, autopilot) is accepted.
    const fallback = requiredBlocks(s, "p2");
    expect(fallback).toHaveLength(1);
    s = act(s, "p2", { type: "declareBlockers", blocks: fallback });
    expect(s.pending?.kind).not.toBe("declareBlockers");
  });

  it("two creatures that block if able, a single attacker: both must block", () => {
    const eager = (name: string) => customCard({ name, power: 1, toughness: 1 });
    const s = toBlocks([wolf], [eager("Eager A"), eager("Eager B")]);
    const [a, b] = ["Eager A", "Eager B"].map((n) => idOf(s, "p2", "battlefield", n)) as [string, string];
    addEffect(s, [a, b], { addBlockRules: [{ mustBlock: true, label: "Bloque si possible" }] }, "endOfTurn");
    const w = idOf(s, "p1", "battlefield", wolf.name);
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: a, attacker: w }] })).toThrow(RulesError);
    expect(() =>
      act(s, "p2", {
        type: "declareBlockers",
        blocks: [
          { blocker: a, attacker: w },
          { blocker: b, attacker: w },
        ],
      }),
    ).not.toThrow();
  });

  it("509.1d: with a block tax, no requirement applies (Archangel of Tithes)", () => {
    const s = toBlocks(["Archangel of Tithes", lure], [guard]);
    expect(blockRequirements(s, "p2")).toEqual([]);
    expect(requiredBlocks(s, "p2")).toEqual([]);
    expect(() => act(s, "p2", { type: "declareBlockers", blocks: [] })).not.toThrow();
  });

  it("the default attack declaration attacks with what must attack (Juggernaut: rope expired online)", () => {
    let s = scenario({ p1: { battlefield: ["Juggernaut"] }, p2: { battlefield: [guard] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const p = s.pending;
    if (p?.kind !== "declareAttackers") throw new Error("no declare attackers decision");
    const d = fallbackDecision(s, p);
    expect(d).toEqual({
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Juggernaut"), defender: "p2" }],
    });
    expect(() => act(s, "p1", d)).not.toThrow();
  });
});

describe("106.6: mana marked as tapped by hand (PLAN-C, lot C5)", () => {
  const elf = customCard({
    name: "Test Elf",
    power: 1,
    toughness: 1,
    subtypes: ["Elf"],
    typeLine: "Creature — Elf",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
  });
  const bear = customCard({
    name: "Test Bear",
    power: 2,
    toughness: 2,
    subtypes: ["Bear"],
    typeLine: "Creature — Bear",
    manaCost: { generic: 1, colored: {}, x: 0 },
    manaCostText: "{1}",
  });
  const withCavern = () => {
    const s = scenario({ p1: { battlefield: ["Cavern of Souls"], hand: [elf, bear] } });
    const cavern = idOf(s, "p1", "battlefield", "Cavern of Souls");
    const o = s.objects[cavern];
    if (o) o.chosen = { creatureType: "Elf" };
    return { s, cavern };
  };

  it("Cavern of Souls tapped by hand: its colored mana is offered, keeps the chosen type and makes the spell uncounterable", () => {
    let { s, cavern } = withCavern();
    expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === cavern && a.ability === 1)).toBe(true);
    s = act(s, "p1", { type: "tapForMana", source: cavern, ability: 1, color: "G" });
    expect(s.players.p1?.restrictedMana?.[0]).toMatchObject({ type: "G", source: cavern, chosen: { creatureType: "Elf" } });
    // The mana doesn't serve the Bear (other type), it serves the Elf.
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Test Bear"))).toBe(false);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test Elf") });
    expect(s.players.p1?.restrictedMana).toBeUndefined();
    expect(s.stack[0]?.uncounterable).toBe(true);
  });

  it("the type stays the one chosen at production, even if the Cavern leaves the battlefield", () => {
    let { s, cavern } = withCavern();
    s = act(s, "p1", { type: "tapForMana", source: cavern, ability: 1, color: "G" });
    moveObject(s, cavern, "graveyard");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test Elf") });
    expect(s.stack[0]?.uncounterable).toBe(true);
  });
});

describe("approximations lifted (PLAN-C, lot C12)", () => {
  it("Ordeal of Nylea: sacrificed some other way, it still searches for two basic lands", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"], library: ["Forest", "Island", "Plains"] } });
    const def = card("Ordeal of Nylea");
    registerDef(s, def);
    const o = createObject(s, def.id, "p1", "battlefield");
    o.attachedTo = idOf(s, "p1", "battlefield", "Bear Cub");
    const ordeal = o.id;
    sacrifice(s, ordeal);
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
    const lands = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).types.includes("Land"));
    expect(lands).toHaveLength(2);
  });

  it("'one or more …': one trigger per batch of simultaneous events (one per effect of a resolution)", () => {
    const watcher = customCard({
      name: "Test Watcher",
      types: ["Enchantment"],
      typeLine: "Enchantment",
      abilities: [
        triggered(when.zoneChange(["graveyard"], { whose: "you" }), [fx.gainLife(1)], {
          batched: true,
          label: "Cards leave your graveyard: 1 life",
        }),
      ],
    });
    const twoEffects = customCard({
      name: "Two Exiles",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell(
        [target.cardInGraveyard("a", {}, "you"), target.cardInGraveyard("b", {}, "you")],
        [fx.exileCard(ref.target("a")), fx.exileCard(ref.target("b"))],
      ),
    });
    const oneEffect = customCard({
      name: "An Exile",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      spell: spell([target.upTo(2, target.cardInGraveyard("t", {}, "you"))], [fx.exileCard(ref.target())]),
    });
    const run = (sorcery: CardDef, targets: (s: GameState, gy: string[]) => Record<string, string[]>) => {
      let s = scenario({ p1: { battlefield: [watcher], hand: [sorcery], graveyard: ["Opt", "Opt"] } });
      const gy = s.players.p1?.graveyard ?? [];
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", sorcery.name), targets: targets(s, gy) });
      s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0);
      return s.players.p1?.life;
    };
    expect(run(twoEffects, (_s, gy) => ({ a: [gy[0] as string], b: [gy[1] as string] }))).toBe(22);
    expect(run(oneEffect, (_s, gy) => ({ t: [...gy] }))).toBe(21);
  });
});

describe("mana of a source sacrificed for its cost (last known information)", () => {
  it("Roxanne, Starfall Savant and a Treasure: the tapped then sacrificed token produces one more mana (2)", async () => {
    const { TOKEN_SPECS } = await import("@mtgx/cards");
    let s = scenario({ p1: { battlefield: ["Roxanne, Starfall Savant"] } });
    s = structuredClone(s);
    createTokens(s, "p1", TOKEN_SPECS.Treasure as NonNullable<(typeof TOKEN_SPECS)["Treasure"]>, 1);
    const treasure = idOf(s, "p1", "battlefield", "Treasure");
    s = act(s, "p1", { type: "tapForMana", source: treasure, ability: 0, color: "R" });
    expect(s.players.p1?.manaPool.R).toBe(2);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(0);
  });
});

describe("701.38 and 508.1d: goad and attack requirements (PLAN-H, lot H3)", () => {
  /** p1 controls a Cub goaded by `goaders`; position at p1's declare attackers step. */
  const goaded = (players: number, goaders: string[], extra: Parameters<typeof scenario>[0] = {}) => {
    let s = scenario({ players, ...extra, p1: { battlefield: ["Bear Cub", ...(extra.p1?.battlefield ?? [])] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    for (const by of goaders) addEffect(s, [bear], { addBlockRules: [{ goadedBy: by, label: "Goaded" }] }, "permanent");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return { s, bear };
  };
  const declare = (s: GameState, attackers: { id: string; defender: string }[]) =>
    act(s, "p1", { type: "declareAttackers", attackers });

  it("goaded by a player: it must attack, and a player other than that one if able", () => {
    const { s, bear } = goaded(3, ["p2"]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
    // The default declaration (host, autopilot) attacks the other player.
    expect(forcedAttacks(s, "p1")).toEqual([{ id: bear, defender: "p3" }]);
    expect(preferredDefenders(s, bear)).toEqual(["p3"]);
    expect(fallbackDecision(s, s.pending as never)).toEqual({
      type: "declareAttackers",
      attackers: [{ id: bear, defender: "p3" }],
    });
  });

  it("in a duel, goaded by the only opponent: it attacks them ('attacks if able' requirement)", () => {
    const { s, bear } = goaded(2, ["p2"]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).not.toThrow();
  });

  it("goaded by two players: an opponent who didn't goad it, otherwise either of the two (701.38c)", () => {
    const three = goaded(3, ["p2", "p3"]);
    expect(() => declare(three.s, [])).toThrow(RulesError);
    expect(() => declare(three.s, [{ id: three.bear, defender: "p2" }])).not.toThrow();
    expect(() => declare(three.s, [{ id: three.bear, defender: "p3" }])).not.toThrow();
    const four = goaded(4, ["p2", "p3"]);
    expect(() => declare(four.s, [{ id: four.bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(four.s, [{ id: four.bear, defender: "p3" }])).toThrow(RulesError);
    expect(() => declare(four.s, [{ id: four.bear, defender: "p4" }])).not.toThrow();
  });

  it("goaded twice by the same player: the same requirements, only once", () => {
    const { s, bear } = goaded(3, ["p2", "p2"]);
    expect(attackRequirements(s, bear)).toHaveLength(2);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
  });

  it("a planeswalker doesn't satisfy 'a player other than you': attack that player, not their planeswalker", () => {
    const { s, bear } = goaded(3, ["p2"], { p3: { battlefield: ["Ajani Resolute"] } });
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    expect(() => declare(s, [{ id: bear, defender: walker }])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
  });

  it("an obligation doesn't force payment: the other player demands a tax, it may attack the one who goaded it", () => {
    const { s, bear } = goaded(3, ["p2"], { p1: { battlefield: lands("Plains", 2) }, p3: { battlefield: ["Propaganda"] } });
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).not.toThrow();
    // Paying the tax to attack p3 satisfies more requirements: allowed.
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
    expect(forcedAttacks(s, "p1")).toEqual([{ id: bear, defender: "p2" }]);
  });

  it("tax everywhere: goaded, it isn't forced to attack", () => {
    const { s } = goaded(3, ["p2"], { p2: { battlefield: ["Propaganda"] }, p3: { battlefield: ["Propaganda"] } });
    expect(() => declare(s, [])).not.toThrow();
    expect(forcedAttacks(s, "p1")).toEqual([]);
  });

  it("restriction and goad: it can't attack the other player, so it attacks the one who goaded it", () => {
    const { s, bear } = goaded(3, ["p2"]);
    addEffect(s, [bear], { addBlockRules: [{ cantAttackPlayer: "p3", label: "Can't attack p3" }] }, "permanent");
    expect(allowedDefenders(s, bear)).toEqual(["p2"]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).not.toThrow();
  });

  it("'attacks that player each combat if able': only an attack against that player satisfies it", () => {
    const { s, bear } = goaded(3, []);
    addEffect(s, [bear], { addBlockRules: [{ mustAttackPlayer: "p3", label: "Attaque p3" }] }, "permanent");
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).not.toThrow();
    // It can't attack that player: no obligation.
    addEffect(s, [bear], { addBlockRules: [{ cantAttackPlayer: "p3", label: "Can't attack p3" }] }, "permanent");
    expect(() => declare(s, [])).not.toThrow();
  });

  it("508.1d: as many requirements as possible; a voluntary attack can't satisfy fewer (Mirri)", () => {
    // Mirri, Weatherlight Duelist (p3), tapped: only one creature can attack p3 each combat.
    const { s, bear } = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions"] },
      p3: { battlefield: [{ name: "Mirri, Weatherlight Duelist", tapped: true }] },
    });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    // A single creature on p3.
    expect(() =>
      declare(s, [
        { id: lions, defender: "p3" },
        { id: bear, defender: "p3" },
      ]),
    ).toThrow(RulesError);
    // The Lions on p3 would force the goaded Cub to attack p2 (one requirement instead of two): refused.
    const wrong = [
      { id: lions, defender: "p3" },
      { id: bear, defender: "p2" },
    ];
    expect(() => declare(s, wrong)).toThrow(RulesError);
    expect(() =>
      declare(s, [
        { id: lions, defender: "p2" },
        { id: bear, defender: "p3" },
      ]),
    ).not.toThrow();
    // The AI that wanted to send the Lions at p3 gets its declaration repaired: the Cub takes p3, the Lions attack p2.
    const repaired = repairAttacks(s, "p1", wrong);
    expect(repaired).toEqual(
      expect.arrayContaining([
        { id: bear, defender: "p3" },
        { id: lions, defender: "p2" },
      ]),
    );
    expect(repaired).toHaveLength(2);
    expect(() => declare(s, repaired)).not.toThrow();
  });

  it("508.1d: paying a tax for one creature doesn't excuse another from its costless requirements", () => {
    // Two creatures goaded by p2, Propaganda on p3: the Cub pays to attack p3, the Lions must attack p2.
    const { s, bear } = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions", ...lands("Plains", 2)] },
      p3: { battlefield: ["Propaganda"] },
    });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    addEffect(s, [lions], { addBlockRules: [{ goadedBy: "p2", label: "Goaded" }] }, "permanent");
    expect(() => declare(s, [{ id: bear, defender: "p3" }])).toThrow(RulesError);
    expect(() =>
      declare(s, [
        { id: bear, defender: "p3" },
        { id: lions, defender: "p2" },
      ]),
    ).not.toThrow();
    // Same with "attacks each combat if able".
    const t = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions", ...lands("Plains", 2)] },
      p3: { battlefield: ["Propaganda"] },
    });
    const lions2 = idOf(t.s, "p1", "battlefield", "Savannah Lions");
    addEffect(t.s, [lions2], { addKeywords: ["mustAttack"] }, "permanent");
    expect(() => declare(t.s, [{ id: t.bear, defender: "p3" }])).toThrow(RulesError);
  });

  it("'can't attack alone': goaded, it attacks with another creature rather than stay home", () => {
    let s = scenario({ players: 2, p1: { battlefield: ["Bear Cub", "Savannah Lions"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    addEffect(
      s,
      [bear],
      {
        addBlockRules: [
          { notAlone: true, label: "Can't attack alone" },
          { goadedBy: "p2", label: "Goaded" },
        ],
      },
      "permanent",
    );
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(forcedAttacks(s, "p1")).toEqual([
      { id: bear, defender: "p2" },
      { id: lions, defender: "p2" },
    ]);
    expect(() => declare(s, [])).toThrow(RulesError);
    expect(() => declare(s, [{ id: bear, defender: "p2" }])).toThrow(RulesError);
    expect(() => declare(s, forcedAttacks(s, "p1"))).not.toThrow();
  });

  it("a rule of the same form that isn't a goad keeps its requirements next to a goad from the same player", () => {
    // Maximum Carnage (p2) then a goad from p2: four requirements; a second goad from p2 adds nothing.
    const { s, bear } = goaded(3, ["p2"], {
      p1: { battlefield: ["Savannah Lions"] },
      p3: { battlefield: [{ name: "Mirri, Weatherlight Duelist", tapped: true }] },
    });
    addEffect(s, [bear], { addBlockRules: [{ goadedBy: "p2", label: "Maximum Carnage" }] }, "permanent");
    expect(attackRequirements(s, bear)).toHaveLength(4);
    addEffect(s, [bear], { addBlockRules: [{ goadedBy: "p2", label: "Goaded" }] }, "permanent");
    expect(attackRequirements(s, bear)).toHaveLength(4);
    // The Lions, goaded by p2 (two requirements), give up the only slot on p3 (Mirri) to the Cub (four).
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    addEffect(s, [lions], { addBlockRules: [{ goadedBy: "p2", label: "Goaded" }] }, "permanent");
    expect(() =>
      declare(s, [
        { id: lions, defender: "p3" },
        { id: bear, defender: "p2" },
      ]),
    ).toThrow(RulesError);
    expect(() =>
      declare(s, [
        { id: lions, defender: "p2" },
        { id: bear, defender: "p3" },
      ]),
    ).not.toThrow();
  });
});

describe("508.4 and 702.49c: player attacked by a permanent put onto the battlefield attacking (PLAN-H, lot H5)", () => {
  /** Declares p1's attacks, then no blocks. */
  const attackThenNoBlocks = (s: GameState, attacks: { id: string; defender: string }[]): GameState => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    cur = act(cur, "p1", { type: "declareAttackers", attackers: attacks });
    // Until the active player's priority in the declare blockers step.
    for (let i = 0; i < 20 && !(cur.turn.step === "declareBlockers" && cur.pending?.kind === "priority"); i++) {
      const p = cur.pending;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "declareBlockers") cur = act(cur, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return cur;
  };
  const ninjutsuOn = (s: GameState, returned: string): GameState => {
    const kaito = idOf(s, "p1", "hand", "Kaito, Bane of Nightmares");
    const option = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === kaito);
    const ability = option?.type === "activate" ? option.ability : -1;
    let cur = act(s, "p1", { type: "activate", source: kaito, ability, targets: {}, picks: { returnAttacker: [returned] } });
    cur = passAccepting(cur, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    return cur;
  };
  const defenderOf = (s: GameState, id: string) => s.combat?.attackers.find((a) => a.id === id)?.defender;

  it("702.49c: the ninja attacks what the returned creature was attacking, not what your first creature attacks", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Island", "Swamp", "Swamp"], hand: ["Kaito, Bane of Nightmares"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attackThenNoBlocks(s, [
      { id: bear, defender: "p2" },
      { id: elves, defender: "p3" },
    ]);
    s = ninjutsuOn(s, elves);
    expect(defenderOf(s, idOf(s, "p1", "battlefield", "Kaito, Bane of Nightmares"))).toBe("p3");
  });

  it("702.49c: the returned creature was attacking a planeswalker, the ninja attacks it too", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Llanowar Elves", "Island", "Swamp", "Swamp"], hand: ["Kaito, Bane of Nightmares"] },
      p2: { battlefield: ["Ajani Resolute"] },
    });
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = attackThenNoBlocks(s, [
      { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
      { id: elves, defender: walker },
    ]);
    s = ninjutsuOn(s, elves);
    expect(defenderOf(s, idOf(s, "p1", "battlefield", "Kaito, Bane of Nightmares"))).toBe(walker);
  });

  it("508.4: its controller chooses what the permanent put onto the battlefield attacking attacks; it hasn't 'attacked'", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Kinscaer Sentry", "Bear Cub"], hand: ["Kinscaer Sentry", "Savannah Lions"] },
      p3: { battlefield: ["Ajani Resolute"] },
    });
    const walker = idOf(s, "p3", "battlefield", "Ajani Resolute");
    const sentry = idOf(s, "p1", "battlefield", "Kinscaer Sentry");
    const inHand = idOf(s, "p1", "hand", "Kinscaer Sentry");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: sentry, defender: "p2" },
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
      ],
    });
    const asked: string[][] = [];
    let handPrompts = 0;
    for (let i = 0; i < 60 && s.turn.step === "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice" && p.request.type === "pick" && p.request.intent === "other") {
        asked.push([...p.request.options].sort());
        expect(p.request.suggested).toEqual(["p2"]);
        s = act(s, p.player, { type: "choose", values: [walker] });
      } else if (p?.kind === "choice" && p.request.type === "pick") {
        handPrompts++;
        s = act(s, p.player, { type: "choose", values: p.request.options.includes(inHand) ? [inHand] : [] });
      } else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else break;
    }
    // Its opponents and their planeswalkers; the new Kinscaer Sentry attacks the chosen planeswalker.
    expect(asked).toEqual([["p2", "p3", walker].sort()]);
    const entered = idsOf(s, "p1", "battlefield", "Kinscaer Sentry").find((id) => id !== sentry) as string;
    expect(defenderOf(s, entered)).toBe(walker);
    // Put onto the battlefield attacking, it didn't attack: its "when it attacks" ability doesn't trigger.
    expect(handPrompts).toBe(1);
    expect(idsOf(s, "p1", "hand", "Savannah Lions")).toHaveLength(1);
  });

  it("508.4: a single option (duel without a planeswalker), no question", () => {
    let s = scenario({ p1: { battlefield: ["Kinscaer Sentry", "Bear Cub"], hand: ["Kinscaer Sentry"] } });
    const sentry = idOf(s, "p1", "battlefield", "Kinscaer Sentry");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: sentry, defender: "p2" },
        { id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" },
      ],
    });
    let defenderQuestions = 0;
    for (let i = 0; i < 60 && s.turn.step === "declareAttackers"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        if (p.request.intent === "other") defenderQuestions++;
        const yes = p.request.type === "pick" ? p.request.options.slice(0, 1) : p.request.suggested;
        s = act(s, p.player, { type: "choose", values: yes });
      } else break;
    }
    expect(defenderQuestions).toBe(0);
    const entered = idsOf(s, "p1", "battlefield", "Kinscaer Sentry").find((id) => id !== sentry) as string;
    expect(defenderOf(s, entered)).toBe("p2");
  });
});

describe("'Keep the chosen permanents': choices in APNAP order, then the fate at the same time (PLAN-H H8a)", () => {
  /** Resolves the stack, answering choices with `answer`. */
  const resolveAll = (s: GameState, answer: (req: ChoiceRequest, player: string, cur: GameState) => ChoiceValue[]) => {
    let cur = s;
    for (let i = 0; i < 100; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player, cur) });
      else break;
    }
    return cur;
  };
  const nameIs = (s: GameState, id: unknown) => s.defs[s.objects[String(id)]?.defId ?? ""]?.name;

  it("Liliana, Dreadhorde General -9 with three players: each opponent chooses in turn; a permanent counts for each of its types", () => {
    // Official rulings: starting with the next opponent in turn order, each opponent chooses
    // knowing the previous choices, then everyone sacrifices at the same time; an artifact creature can be chosen both
    // as an artifact and as a creature.
    let s = scenario({
      players: 3,
      p1: { battlefield: [{ name: "Liliana, Dreadhorde General", counters: { loyalty: 9 } }] },
      p2: { battlefield: ["Adaptive Automaton", "Sol Ring", "Bear Cub", "Forest"] },
      p3: { battlefield: ["Forest", "Island", "Bear Cub"] },
    });
    const lili = idOf(s, "p1", "battlefield", "Liliana, Dreadhorde General");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === lili && x.label?.includes("each type"));
    if (a?.type !== "activate") throw new Error("-9 ability unavailable");
    s = act(s, "p1", { type: "activate", source: lili, ability: a.ability });
    const field = s.battlefield.length;
    const asked: string[] = [];
    s = resolveAll(s, (req, player, cur) => {
      if (req.type !== "pick") return req.suggested;
      // Nothing is sacrificed before the choices end.
      expect(cur.battlefield.length).toBe(field);
      asked.push(`${player}:${cur.objects[String(req.options[0])]?.controller}`);
      const keep = req.options.find((id) => ["Adaptive Automaton", "Island"].includes(nameIs(cur, id) ?? ""));
      return [keep ?? (req.options[0] as string)];
    });
    expect(asked).toEqual(["p2:p2", "p2:p2", "p3:p3"]);
    const left = (p: string) =>
      s.battlefield
        .filter((id) => s.objects[id]?.controller === p)
        .map((id) => nameIs(s, id))
        .sort();
    expect(left("p2")).toEqual(["Adaptive Automaton", "Forest"]);
    expect(left("p3")).toEqual(["Bear Cub", "Island"]);
  });
});

describe("PLAN-H H8b: 'can't' versus replacements and preventions", () => {
  /** "Whenever you gain life, draw a card." */
  const GAIN_DRAW = ench("Test Gain", triggered(when.gainLife, [fx.draw(1)], { label: "Draw a card" }));

  it("Grievous Wound (119.7, 101.2): the enchanted player doesn't gain life, even with Angel of Vitality, and nothing triggers; other players do", () => {
    const s = scenario({
      players: 3,
      p2: { battlefield: ["Angel of Vitality", GAIN_DRAW] },
      p3: { battlefield: ["Angel of Vitality"] },
    });
    const def = card("Grievous Wound") as CardDef;
    registerDef(s, def);
    createObject(s, def.id, "p1", "battlefield").attachedTo = "p2";
    bump(s);
    for (const p of ["p1", "p2", "p3"]) gainLife(s, p, 3);
    expect([s.players.p1?.life, s.players.p2?.life, s.players.p3?.life]).toEqual([23, 20, 24]);
    expect(countTurnEvents(s, { event: "lifeGain" }, "p2", "p2")).toBe(0);
    expect(s.triggers).toHaveLength(0);
  });

  /** Prevents all damage that would be dealt to its controller's creatures (combat or not). */
  const SHIELD = ench("Bouclier d'essai", { kind: "prevention", filter: { types: ["Creature"], controller: "you" } });
  const src = { defId: "test", controller: "p2", keywords: [] };

  it("Frenzied Baloth: combat damage can't be prevented (neither Diamond Weapon's Immunity nor a prevention); other damage can", () => {
    const s = scenario({ p1: { battlefield: ["Diamond Weapon", "Bear Cub", SHIELD] }, p2: { battlefield: ["Frenzied Baloth"] } });
    const dw = idOf(s, "p1", "battlefield", "Diamond Weapon");
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    dealDamage(s, src, dw, 3, true);
    dealDamage(s, src, cub, 1, true);
    dealDamage(s, src, cub, 1, false);
    expect([s.objects[dw]?.damage, s.objects[cub]?.damage]).toEqual([3, 1]);
  });

  it("Sunspine Lynx: no damage can be prevented, combat or not", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", SHIELD] }, p2: { battlefield: ["Sunspine Lynx"] } });
    const cub = idOf(s, "p1", "battlefield", "Bear Cub");
    dealDamage(s, src, cub, 1, false);
    expect(s.objects[cub]?.damage).toBe(1);
  });

  it("losing the game (104.3): Phyrexian Unlife only prevents the loss at 0 life; Angel's Grace also prevents the poison loss", () => {
    const poisoned = (life: number, effect?: boolean) => {
      const s = scenario({ p1: { life, battlefield: ["Phyrexian Unlife"] } });
      if (effect) addPlayerEffect(s, "p1", { cantLose: true }, s.turn.number);
      (s.players.p1 as { counters?: { poison?: number } }).counters = { poison: 10 };
      stateBasedActions(s);
      return s.players.p1?.lost;
    };
    expect(poisoned(0)).toBe(true);
    expect(poisoned(0, true)).toBe(false);
    const s = scenario({ p1: { life: 0, battlefield: ["Phyrexian Unlife"] } });
    stateBasedActions(s);
    expect(s.players.p1?.lost).toBe(false);
  });
});

describe("PLAN-H H9: 'as it enters' (614.1c, 614.12) and copies (707.9, 707.10)", () => {
  /** Plays until the stack is empty: card choices receive the given answers in turn, the others the suggestion. */
  const play = (s: GameState, picks: string[][] = [], typed: string[] = []) => {
    const asked: ChoiceRequest[] = [];
    let cur = s;
    for (let i = 0; i < 200; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        asked.push(p.request);
        const r = p.request;
        const given = r.intent === "pickCards" ? picks.shift() : r.intent === "chooseOnEnter" ? typed.splice(0, 1) : undefined;
        cur = act(cur, p.player, {
          type: "choose",
          values: given?.length || r.intent === "pickCards" ? (given ?? []) : r.suggested,
        });
      } else break;
    }
    return { s: cur, asked };
  };
  const castCard = (s: GameState, name: string) => act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name) });

  it("707.10: the copy of a Bandit Face spell (Double Down) becomes a token that chooses what it copies itself", () => {
    const s0 = scenario({
      p1: { battlefield: ["Double Down", "Serra Angel", "Bear Cub", ...lands("Island", 4)], hand: ["Visage Bandit"] },
    });
    const angel = idOf(s0, "p1", "battlefield", "Serra Angel");
    const cub = idOf(s0, "p1", "battlefield", "Bear Cub");
    const { s, asked } = play(castCard(s0, "Visage Bandit"), [[angel], [cub]]);
    // Two questions: the token (the copy resolves first), then the card.
    expect(asked.filter((r) => r.intent === "pickCards")).toHaveLength(2);
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).name).toBe("Serra Angel");
    expect(chars(s, token).subtypes).toEqual(expect.arrayContaining(["Angel", "Shapeshifter", "Rogue"]));
    const bandit = s.battlefield.find(
      (id) => !s.objects[id]?.isToken && s.defs[s.objects[id]?.defId ?? ""]?.name === "Visage Bandit",
    );
    expect(bandit && chars(s, bandit).name).toBe("Bear Cub");
  });

  it("707.9 and 614.12: Phantasmal Image copying Adaptive Automaton makes the model's 'as it enters' choice", () => {
    const s0 = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Phantasmal Image"] },
      p2: { battlefield: ["Adaptive Automaton"] },
    });
    const automaton = idOf(s0, "p2", "battlefield", "Adaptive Automaton");
    const { s, asked } = play(castCard(s0, "Phantasmal Image"), [[automaton]], ["Goblin"]);
    expect(asked.map((r) => r.intent)).toEqual(["pickCards", "chooseOnEnter"]);
    const image = idOf(s, "p1", "battlefield", "Phantasmal Image");
    expect(chars(s, image).name).toBe("Adaptive Automaton");
    expect(s.objects[image]?.chosen?.creatureType).toBe("Goblin");
    expect(chars(s, image).subtypes).toEqual(expect.arrayContaining(["Construct", "Goblin", "Illusion"]));
  });

  it("708.2: a permanent put face down (cloak) has no 'as it enters' effect: no question, no choice", () => {
    const s = scenario({ p1: { hand: ["Adaptive Automaton"] } });
    const card = idOf(s, "p1", "hand", "Adaptive Automaton");
    const r = { ...resolution("p1"), targets: { t: [card] } };
    expect(runEffect(s, r as never, fx.moveTo(ref.target(), { to: "battlefield", as: "cloak" }))).toBeUndefined();
    const id = s.battlefield.find((x) => s.objects[x]?.owner === "p1") as string;
    expect(s.objects[id]?.faceDown).toBeDefined();
    expect(s.objects[id]?.chosen).toBeUndefined();
  });

  it("a permanent put onto the battlefield under another player's control: that player chooses, among their permanents", () => {
    const s = scenario({
      p1: { battlefield: ["Serra Angel"], graveyard: ["Waxen Shapethief"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    const wax = idOf(s, "p1", "graveyard", "Waxen Shapethief");
    const cub = idOf(s, "p2", "battlefield", "Bear Cub");
    const r = { ...resolution("p2"), targets: { t: [wax] } };
    const effect = fx.moveTo(ref.target(), { to: "battlefield", underYourControl: true });
    const asked = runEffect(s, r as never, effect) as { ask?: { player: string; key: string; request: ChoiceRequest } };
    expect(asked.ask?.player).toBe("p2");
    expect(asked.ask?.request.type === "pick" && asked.ask.request.options).toEqual([cub]);
    (r.vars as Record<string, ChoiceValue[]>)[asked.ask?.key ?? ""] = [cub];
    expect(runEffect(s, r as never, effect)).toBeUndefined();
    const back = s.battlefield.find((id) => s.objects[id]?.controller === "p2" && id !== cub) as string;
    expect(chars(s, back).name).toBe("Bear Cub");
  });

  it("a token copy of a permanent with a choice (Electroduplicate on Adaptive Automaton): its controller is asked (614.12, PLAN-L L5)", () => {
    const s0 = scenario({
      p1: { battlefield: ["Adaptive Automaton", ...lands("Mountain", 3)], hand: ["Electroduplicate"] },
    });
    const automaton = idOf(s0, "p1", "battlefield", "Adaptive Automaton");
    const cast = act(s0, "p1", { type: "cast", card: idOf(s0, "p1", "hand", "Electroduplicate"), targets: { t: [automaton] } });
    const { s, asked } = play(cast);
    expect(asked.filter((r) => r.intent === "chooseOnEnter")).toHaveLength(1);
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(s.objects[token]?.chosen?.creatureType).toBeDefined();
  });

  it("702.136: a creature with riot put back onto the battlefield by an effect (Zombify) asks for the counter or haste", () => {
    const s0 = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Zombify"], graveyard: ["Spider-Punk"] } });
    const punk = idOf(s0, "p1", "graveyard", "Spider-Punk");
    const cast = act(s0, "p1", { type: "cast", card: idOf(s0, "p1", "hand", "Zombify"), targets: { t: [punk] } });
    const { s, asked } = play(cast);
    const riot = asked.find((r) => r.type === "pick" && r.options.includes("haste"));
    expect(riot?.suggested).toEqual(["haste"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Spider-Punk")).keywords).toContain("haste");
  });

  it("Waxen Shapethief copying Sorcerous Spyglass names a card; activated abilities of sources with that name are forbidden", () => {
    const s0 = scenario({
      p1: { battlefield: ["Sorcerous Spyglass", ...lands("Island", 6)], hand: ["Waxen Shapethief", "Waxen Shapethief"] },
    });
    const glass = idOf(s0, "p1", "battlefield", "Sorcerous Spyglass");
    const cycling = (x: GameState) =>
      legalActions(x, "p1").some((a) => a.type === "activate" && x.objects[a.source]?.zone === "hand");
    expect(cycling(s0)).toBe(true);
    const { s, asked } = play(castCard(s0, "Waxen Shapethief"), [[glass]], ["Waxen Shapethief"]);
    expect(asked.map((r) => r.intent)).toEqual(["pickCards", "chooseOnEnter"]);
    const wax = s.battlefield.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Waxen Shapethief") as string;
    expect(chars(s, wax).name).toBe("Sorcerous Spyglass");
    expect(s.objects[wax]?.chosen?.cardName).toBe("Waxen Shapethief");
    // The other Waxen Shapethief's cycling (an ability activated from hand) can no longer be activated.
    expect(cycling(s)).toBe(false);
  });
});

describe("201.3, 709.4, 715.4, 712.8a: names of multi-faced cards (audit of 2026-10-07, D1)", () => {
  /** Ancient Vendetta: p1 names `name`; p2's cards (library) exiled. */
  const vendetta = (name: string, library: string[]) => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Ancient Vendetta"] }, p2: { library } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ancient Vendetta"), targets: { t: ["p2"] } });
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    s = act(s, "p1", { type: "choose", values: [name] });
    s = passUntil(s, (x) => x.stack.length === 0 && x.pending?.kind !== "choice");
    return s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
  };
  const ROOM = "Dazzling Theater // Prop Room";
  const ADVENTURER = "Beanstalk Wurm // Plant Beans";
  const MODAL = "Sink into Stupor // Soporific Springs";
  const LIB = [ROOM, ADVENTURER, MODAL, "Opt", "Opt"];

  it("709.4: a split card (Room) outside the battlefield has both its names", () => {
    expect(vendetta("Dazzling Theater", LIB)).toEqual([ROOM]);
    expect(vendetta("Prop Room", LIB)).toEqual([ROOM]);
  });

  it("715.4: outside the stack, an adventurer has only its main name", () => {
    expect(vendetta("Beanstalk Wurm", LIB)).toEqual([ADVENTURER]);
    expect(vendetta("Plant Beans", LIB)).toEqual([]);
  });

  it("712.8a: outside the battlefield and the stack, a modal double-faced card has its front face's name", () => {
    expect(vendetta("Sink into Stupor", LIB)).toEqual([MODAL]);
    expect(vendetta("Soporific Springs", LIB)).toEqual([]);
  });

  it("201.3: 'A // B' is not a card name (catalog and game names); each face is one", () => {
    const s = scenario({ p1: { hand: [ROOM, ADVENTURER, MODAL] } });
    const allowed = nameValidator(s, "card");
    for (const full of [ROOM, ADVENTURER, MODAL]) expect(allowed(full)).toBe(false);
    for (const face of ["Dazzling Theater", "Prop Room", "Beanstalk Wurm", "Plant Beans", "Soporific Springs"])
      expect(allowed(face)).toBe(true);
    const catalog = nameCatalog();
    expect(catalog.cards).not.toContain(ROOM);
    expect(catalog.cards).toContain("Prop Room");
    expect(catalog.lands).toContain("Soporific Springs");
  });

  it("712.8a: on the battlefield, the name of the visible face; a Room, those of its unlocked doors", () => {
    const s = scenario({ p1: { battlefield: [MODAL, ADVENTURER, ROOM] } });
    const room = idOf(s, "p1", "battlefield", ROOM);
    (s.objects[room] as { unlocked?: number[] }).unlocked = [1];
    bump(s);
    expect(matchesObjectFilter(s, "p1", room, { name: "Prop Room" })).toBe(true);
    expect(matchesObjectFilter(s, "p1", room, { name: "Dazzling Theater" })).toBe(false);
    const modal = idOf(s, "p1", "battlefield", MODAL);
    expect(chars(s, modal).name).toBe("Sink into Stupor");
    expect(matchesObjectFilter(s, "p1", modal, { name: "Sink into Stupor" })).toBe(true);
    expect(matchesObjectFilter(s, "p1", idOf(s, "p1", "battlefield", ADVENTURER), { name: "Plant Beans" })).toBe(false);
  });
});

describe("701.38: goad is not an ability (audit of 2026-10-07, D2)", () => {
  it("a goaded creature that then loses all abilities stays goaded; what it had gained is lost", () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Goaded by p2 (resolution effect, fx.goad), with flying for the same duration; then "loses all abilities".
    runEffect(
      s,
      { ...resolution("p2"), targets: { t: [bear] } } as never,
      fx.goad(ref.target(), "untilYourNextTurn", { addKeywords: ["flying"] }),
    );
    addEffect(s, [bear], { loseAllAbilities: true }, "permanent");
    expect(chars(s, bear).keywords).not.toContain("flying");
    expect(chars(s, bear).blockRules.map((r) => r.goadedBy)).toEqual(["p2"]);
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] })).toThrow(RulesError);
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p3" }] })).not.toThrow();
  });
});

describe("702.116a and 508.5: myriad, defending player locked in at trigger time (audit of 2026-10-07, D4)", () => {
  /** Duel: Goldlust Triad attacks `at`; `meanwhile` acts before the myriad resolves. */
  const myriad = (at: "p2" | "walker", meanwhile: (s: GameState, triad: string, walker: string) => void) => {
    let s = scenario({ p1: { battlefield: ["Goldlust Triad"] }, p2: { battlefield: ["Ajani Resolute"] } });
    const triad = idOf(s, "p1", "battlefield", "Goldlust Triad");
    const walker = idOf(s, "p2", "battlefield", "Ajani Resolute");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: triad, defender: at === "p2" ? "p2" : walker }] });
    s = advanceUntil(s, (x) => x.stack.length > 0 && x.pending?.kind === "priority");
    meanwhile(s, triad, walker);
    let asked = 0;
    s = passAccepting(s, (x) => {
      if (x.pending?.kind === "choice") asked++;
      return x.stack.length === 0 && x.triggers.length === 0;
    });
    const copies = s.battlefield.filter((id) => s.objects[id]?.isToken);
    return { asked, copies };
  };

  it("the creature dies before resolution: in a duel, no opponent other than the defending player, no copy", () => {
    expect(myriad("p2", (s, triad) => destroy(s, triad))).toEqual({ asked: 0, copies: [] });
  });

  it("the attacked planeswalker is removed before resolution: its controller stays the defending player, no copy", () => {
    expect(myriad("walker", (s, _t, walker) => void moveObject(s, walker, "graveyard"))).toEqual({ asked: 0, copies: [] });
  });
});

describe("603.2 and 603.2e: Elesh Norn, Mother of Machines (deck Nissa)", () => {
  it("an opposing land entering triggers an ability of your permanent twice; the opponent's, never", () => {
    // Ruling of 2023-02-04: only the controller of the permanent whose ability triggers matters, not that of the
    // permanent that enters.
    let s = scenario({
      active: "p2",
      p1: { battlefield: ["Elesh Norn, Mother of Machines", "Polluted Bonds"] },
      p2: { battlefield: ["Polluted Bonds"], hand: ["Plains"] },
    });
    s = act(s, "p2", { type: "playLand", card: idOf(s, "p2", "hand", "Plains") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
    expect([s.players.p1?.life, s.players.p2?.life]).toEqual([24, 16]);
    // A land of p1: p2's Polluted Bonds (an opposing permanent for Elesh Norn) doesn't trigger.
    let t = scenario({
      p1: { battlefield: ["Elesh Norn, Mother of Machines"], hand: ["Plains"] },
      p2: { battlefield: ["Polluted Bonds"] },
    });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Plains") });
    expect(t.stack).toEqual([]);
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
  });
});

describe("603.2d and 707.10: Echoes of Eternity (deck The Vision)", () => {
  it("the 'when you cast this spell' ability of a colorless spell triggers once more; the spell is copied", () => {
    // Ruling (Modern Horizons 3): Echoes of Eternity also affects triggered abilities of colorless spells you
    // control, like "when you cast this spell"; the copy of a permanent spell becomes a token.
    let s = scenario({
      p1: { battlefield: ["Echoes of Eternity", ...lands("Wastes", 7)], hand: ["Ugin, Eye of the Storms"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon", "Sol Ring"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Ugin, Eye of the Storms") });
    // Each exile targets a different colored permanent: Bear Cub, then Shivan Dragon.
    const wanted = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Shivan Dragon")];
    for (let i = 0; i < 200 && !(s.stack.length === 0 && s.triggers.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        const req = p.request;
        const pick =
          req.type === "pick" && req.intent === "triggerTarget" ? wanted.find((id) => req.options.includes(id)) : undefined;
        if (pick) wanted.splice(wanted.indexOf(pick), 1);
        s = act(s, p.player, { type: "choose", values: pick ? [pick] : req.suggested });
      } else break;
    }
    // Two exiles (doubled trigger): both colored permanents; Sol Ring (colorless) stays.
    expect(idsOf(s, "p2", "battlefield", "Sol Ring")).toHaveLength(1);
    expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(2);
    // The spell and its copy (a token): the legend rule leaves only one.
    expect(s.battlefield.filter((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Ugin, Eye of the Storms")).toHaveLength(1);
  });
});

describe("500.7: Gerrard's Hourglass Pendant (deck The Vision)", () => {
  it("a player who would begin an extra turn skips it, whoever controls the Pendant", () => {
    let s = scenario({
      p1: { hand: ["Temporal Manipulation"], battlefield: lands("Island", 5) },
      p2: { battlefield: ["Gerrard's Hourglass Pendant"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Temporal Manipulation") });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    s = advanceUntil(s, (x) => x.turn.number > 3 && x.turn.step === "main1");
    // p1's extra turn is skipped: the next turn is p2's.
    expect([s.turn.number, s.turn.active]).toEqual([4, "p2"]);
  });
});

describe("Deck Dark Leo & Shredder: rulings", () => {
  const throughCombat = (s0: GameState): GameState => {
    let s = s0;
    for (let i = 0; i < 300 && s.turn.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else break;
    }
    return s;
  };

  it("509.1h and 702.49c: a Ninja put onto the battlefield attacking by ninjutsu is unblocked (Throatseeker)", () => {
    let s = scenario({ p1: { battlefield: ["Throatseeker", "Bear Cub", ...lands("Swamp", 4)], hand: ["Okiba-Gang Shinobi"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    s = passAccepting(s, (x) => x.turn.step === "declareBlockers" && x.pending?.kind === "priority");
    const okiba = idOf(s, "p1", "hand", "Okiba-Gang Shinobi");
    const o = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === okiba);
    s = act(s, "p1", {
      type: "activate",
      source: okiba,
      ability: o?.type === "activate" ? o.ability : -1,
      targets: {},
      picks: { returnAttacker: [bear] },
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    const ninja = idOf(s, "p1", "battlefield", "Okiba-Gang Shinobi");
    expect(chars(s, ninja).keywords).toContain("lifelink");
    s = throughCombat(s);
    expect(s.players.p1?.life).toBe(23);
  });

  it("Wound Reflection: life lost this turn, not counting life gained", () => {
    let s = scenario({ p1: { battlefield: ["Wound Reflection", "Bear Cub"] } });
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: idOf(s, "p1", "battlefield", "Bear Cub"), defender: "p2" }] });
    s = throughCombat(s);
    gainLife(s, "p2", 5);
    expect(s.players.p2?.life).toBe(23);
    s = advanceUntil(s, (x) => x.turn.active === "p2", 200);
    expect(s.players.p2?.life).toBe(21);
  });

  it("Akroma's Will: the commander is checked on cast; gone afterwards, both modes apply", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Savannah Lions", ...lands("Plains", 4)], hand: ["Akroma's Will"] },
      p2: { battlefield: ["Mountain"], hand: ["Shock"] },
    });
    const lions = idOf(s, "p1", "battlefield", "Savannah Lions");
    const o = s.objects[lions];
    if (!o) throw new Error("Savannah Lions");
    s.commander = { cards: { [o.uid]: { owner: "p1", defId: o.defId, casts: 0, damage: {} } } };
    bump(s);
    const will = idOf(s, "p1", "hand", "Akroma's Will");
    const both = legalActions(s, "p1")
      .flatMap((a) => (a.type === "cast" && a.card === will ? a.modes : []))
      .find((m) => m.label?.startsWith("Both"));
    expect(both).toBeDefined();
    s = act(s, "p1", { type: "cast", card: will, mode: both?.index } as never);
    // In response, the commander dies.
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Shock"), targets: { t: [lions] } });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(idsOf(s, "p1", "battlefield", "Savannah Lions")).toHaveLength(0);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["flying", "doubleStrike", "lifelink", "indestructible"]));
  });

  it("Archetype of Courage: an opposing creature's double strike is not affected", () => {
    const s = scenario({
      p1: { battlefield: ["Archetype of Courage"] },
      p2: { battlefield: ["Leonardo, Worldly Warrior"] },
    });
    expect(chars(s, idOf(s, "p2", "battlefield", "Leonardo, Worldly Warrior")).keywords).toContain("doubleStrike");
  });
});

describe("ability counters in layer 6 (122.1b, 613.7; PLAN-L L5)", () => {
  it("a counter's keyword is lost to a later 'loses all abilities', and comes back with a counter put on after it", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const o = s.objects[bear];
    if (!o) throw new Error("bear");
    changeCounters(s, o, "flying", 1);
    expect(chars(s, bear).keywords).toContain("flying");
    addEffect(s, [bear], { loseAllAbilities: true }, "permanent");
    expect(chars(s, bear).keywords).not.toContain("flying");
    changeCounters(s, o, "flying", 1);
    expect(chars(s, bear).keywords).toContain("flying");
  });

  it("'loses all abilities' before the counter: the counter's keyword stays (Abigale)", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    addEffect(s, [bear], { loseAllAbilities: true }, "permanent");
    changeCounters(s, s.objects[bear] as never, "lifelink", 1);
    expect(chars(s, bear).keywords).toContain("lifelink");
  });
});
