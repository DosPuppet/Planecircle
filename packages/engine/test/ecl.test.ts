/**
 * Lorwyn Eclipsed (ECL): rules tests for the set (R7). First the meta cards (blight, evoke, mana
 * spent, Moonshadow…) and the foundation (blight, Vivid), then batch A by color, each with its local helpers.
 */

import { describe, expect, it } from "vitest";
import { dealDamage, destroy, sourceFromObject } from "../src/actions";
import * as dsl from "../src/dsl";
import { runEffect } from "../src/effects";
import { RulesError } from "../src/errors";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf, manaValue } from "../src/mana";
import { spellCost } from "../src/stack";
import { bump, chars } from "../src/state";
import { ALL_CREATURE_TYPES, isLegalTarget, matchesObjectFilter } from "../src/targets";
import { plainText } from "../src/text";
import { simultaneously } from "../src/triggers";
import type { CardDef, ChoiceRequest, ChoiceValue, Color, GameState, ManaCost, TokenSpec } from "../src/types";
import {
  act,
  advanceUntil,
  castNowOf,
  customCard,
  idOf,
  idsOf,
  namesIn,
  passAccepting,
  pickNamed,
  scenario,
  settle as settleAnswering,
  steal,
  untilCastNow,
  wantedName,
} from "./helpers";

type S = GameState;
const lands = (name: string, n: number) => Array(n).fill(name) as string[];
const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
/** Answers pending choices: picks `want` when it is among the options, otherwise the suggestion. */
const chooseWanted = (s: S, want: string[]) => {
  let cur = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
  for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
    const p = cur.pending;
    const r = p.request;
    const picked = r.type === "pick" ? want.filter((w) => r.options.includes(w)) : wantedName(cur, r, want);
    cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
    cur = passAccepting(cur, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
  }
  return settle(cur);
};

describe("Lorwyn Eclipsed", () => {
  describe("Moonshadow", () => {
    it("arrives with six −1/−1 counters (a 1/1 with menace)", () => {
      let s = scenario({ p1: { battlefield: ["Swamp"], hand: ["Moonshadow"] } });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Moonshadow") }));
      const moon = idOf(s, "p1", "battlefield", "Moonshadow");
      expect(s.objects[moon]?.counters["-1/-1"]).toBe(6);
      expect([chars(s, moon).power, chars(s, moon).toughness]).toEqual([1, 1]);
      expect(chars(s, moon).keywords).toContain("menace");
    });

    it("a permanent card discarded removes a counter; a discarded instant does not", () => {
      const run = (discarded: string) => {
        let s = scenario({ p1: { battlefield: ["Moonshadow", "Iron-Shield Elf"], hand: [discarded] } });
        const moon = idOf(s, "p1", "battlefield", "Moonshadow");
        (s.objects[moon] as { counters: Record<string, number> }).counters["-1/-1"] = 6;
        s.version += 1;
        const elf = idOf(s, "p1", "battlefield", "Iron-Shield Elf");
        const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === elf);
        s = settle(
          act(s, "p1", {
            type: "activate",
            source: elf,
            ability: a?.type === "activate" ? a.ability : -1,
            discard: [idOf(s, "p1", "hand", discarded)],
          }),
        );
        return s.objects[moon]?.counters["-1/-1"];
      };
      expect(run("Forest")).toBe(5);
      expect(run("Opt")).toBe(6);
    });

    it("several permanent cards put into the graveyard at the same time: only one counter removed", () => {
      let s = scenario({ p1: { battlefield: ["Moonshadow", "Fire Elemental", "Fishing Pole"] } });
      const moon = idOf(s, "p1", "battlefield", "Moonshadow");
      (s.objects[moon] as { counters: Record<string, number> }).counters["-1/-1"] = 6;
      s.version += 1;
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
      simultaneously(s, () => {
        destroy(s, fire);
        destroy(s, pole);
      });
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "graveyard", "Fire Elemental")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(s.objects[moon]?.counters["-1/-1"]).toBe(5);
    });
  });

  describe("Evoke and mana spent", () => {
    it("Emptiness evoked with {W}{W}: a creature with mana value 3 or less returns from the graveyard, then Emptiness is sacrificed", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Emptiness"], graveyard: ["Bear Cub", "Shivan Dragon"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Emptiness");
      const bear = idOf(s, "p1", "graveyard", "Bear Cub");
      const dragon = idOf(s, "p1", "graveyard", "Shivan Dragon");
      expect(castOption(s, card)?.type === "cast" && castOption(s, card)).toMatchObject({ altAvailable: true });
      s = act(s, "p1", { type: "cast", card, alternative: true });
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      // The dragon (mana value 6) is not a legal target.
      if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
        expect(s.pending.request.options).not.toContain(dragon);
      }
      s = chooseWanted(s, [bear]);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Emptiness")).toHaveLength(1);
      // {B}{B} was not spent: the Angel has no counter.
      expect(s.objects[idOf(s, "p2", "battlefield", "Serra Angel")]?.counters["-1/-1"] ?? 0).toBe(0);
    });

    it("Emptiness evoked with {B}{B}: three −1/−1 counters on a creature, nothing returns", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Emptiness"], graveyard: ["Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Emptiness"), alternative: true });
      s = chooseWanted(s, [angel]);
      expect(s.objects[angel]?.counters["-1/-1"]).toBe(3);
      expect([chars(s, angel).power, chars(s, angel).toughness]).toEqual([1, 1]);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Emptiness")).toHaveLength(1);
    });

    it("Deceit cast with {B}{B}: the opponent discards the chosen nonland card; Deceit stays on the battlefield", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Deceit"] },
        p2: { battlefield: ["Bear Cub"], hand: ["Forest", "Opt", "Serra Angel"] },
      });
      const angel = idOf(s, "p2", "hand", "Serra Angel");
      const forest = idOf(s, "p2", "hand", "Forest");
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Deceit") });
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      let sawCardChoice = false;
      for (let i = 0; i < 10 && s.pending?.kind === "choice"; i++) {
        const p = s.pending;
        const r = p.request;
        if (r.type === "pick" && r.options.includes(angel)) {
          sawCardChoice = true;
          expect(p.player).toBe("p1");
          expect(r.options).not.toContain(forest);
        }
        const values = r.type === "pick" && r.options.includes(angel) ? [angel] : r.suggested;
        s = act(s, p.player, { type: "choose", values });
        s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      }
      s = settle(s);
      expect(sawCardChoice).toBe(true);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(2);
      // {U}{U} was not spent: the Bear Cub stays on the battlefield.
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Deceit")).toHaveLength(1);
    });
  });

  describe("Blight", () => {
    it("Requiting Hex without blight: destroys a creature with mana value 2 or less, without life gain; mana value 3 or more refused", () => {
      let s = scenario({
        p1: { battlefield: ["Swamp", "Fire Elemental"], hand: ["Requiting Hex"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const card = idOf(s, "p1", "hand", "Requiting Hex");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card, targets: { t: [angel] } })).toThrow();
      s = settle(act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[idOf(s, "p1", "battlefield", "Fire Elemental")]?.counters["-1/-1"] ?? 0).toBe(0);
    });

    it("Pyrrhic Strike without blight: a single mode; the targeted creature must have mana value 3 or more", () => {
      const setup = () =>
        scenario({
          p1: { battlefield: lands("Plains", 3), hand: ["Pyrrhic Strike"] },
          p2: { battlefield: ["Bear Cub", "Serra Angel", "Fishing Pole"] },
        });
      const s = setup();
      const card = idOf(s, "p1", "hand", "Pyrrhic Strike");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => act(s, "p1", { type: "cast", card, mode: 1, targets: { c: [bear] } })).toThrow();
      const t = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { c: [angel] } }));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(t, "p2", "battlefield", "Fishing Pole")).toHaveLength(1);
      const u = setup();
      const v = settle(
        act(u, "p1", {
          type: "cast",
          card: idOf(u, "p1", "hand", "Pyrrhic Strike"),
          mode: 0,
          targets: { a: [idOf(u, "p2", "battlefield", "Fishing Pole")] },
        }),
      );
      expect(idsOf(v, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
      expect(idsOf(v, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    });
  });

  it("Iron-Shield Elf: discarding a card makes it indestructible until end of turn and taps it", () => {
    let s = scenario({
      p1: { battlefield: ["Iron-Shield Elf"], hand: ["Forest"] },
    });
    const elf = idOf(s, "p1", "battlefield", "Iron-Shield Elf");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === elf);
    s = settle(
      act(s, "p1", {
        type: "activate",
        source: elf,
        ability: a?.type === "activate" ? a.ability : -1,
        discard: [idOf(s, "p1", "hand", "Forest")],
      }),
    );
    expect(s.players.p1?.hand).toHaveLength(0);
    expect(s.objects[elf]?.tapped).toBe(true);
    expect(chars(s, elf).keywords).toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, elf).keywords).not.toContain("indestructible");
  });

  it("Firdoch Core: mana of any color; {4} makes it a 4/4 artifact creature until end of turn", () => {
    let s = scenario({ p1: { battlefield: ["Firdoch Core", ...lands("Forest", 4)] } });
    const core = idOf(s, "p1", "battlefield", "Firdoch Core");
    const colors = legalActions(s, "p1")
      .filter((a) => a.type === "tapForMana" && a.source === core)
      .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    expect(colors).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
    expect(chars(s, core).types).not.toContain("Creature");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === core);
    s = settle(act(s, "p1", { type: "activate", source: core, ability: a?.type === "activate" ? a.ability : -1 }));
    const c = chars(s, core);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect([c.power, c.toughness]).toEqual([4, 4]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, core).types).not.toContain("Creature");
  });

  it("Sapling Nursery: exiled, your Treefolk and your Forests become indestructible until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Sapling Nursery", ...lands("Forest", 2), "Bear Cub"], hand: ["Forest"] },
      p2: { battlefield: ["Forest"] },
    });
    s = settle(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
    const tree = idOf(s, "p1", "battlefield", "Treefolk");
    const nursery = idOf(s, "p1", "battlefield", "Sapling Nursery");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === nursery);
    s = settle(act(s, "p1", { type: "activate", source: nursery, ability: a?.type === "activate" ? a.ability : -1 }));
    expect(idsOf(s, "p1", "battlefield", "Sapling Nursery")).toHaveLength(0);
    expect(s.exile.some((id) => nameOf(s, id) === "Sapling Nursery")).toBe(true);
    expect(chars(s, tree).keywords).toContain("indestructible");
    for (const f of idsOf(s, "p1", "battlefield", "Forest")) expect(chars(s, f).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).keywords).not.toContain("indestructible");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, tree).keywords).not.toContain("indestructible");
  });

  it("Spell Snare: counters a spell with mana value 2, not a spell with another mana value", () => {
    const setup = (spell: string) => {
      let s = scenario({
        p1: { battlefield: ["Island"], hand: ["Spell Snare"] },
        p2: { battlefield: lands("Forest", 5), hand: [spell] },
        active: "p2",
      });
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", spell) });
      return act(s, "p2", { type: "pass" });
    };
    let s = setup("Bear Cub");
    const card = idOf(s, "p1", "hand", "Spell Snare");
    s = settle(act(s, "p1", { type: "cast", card, targets: { t: [s.stack[0]?.id as string] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const t = setup("Llanowar Elves");
    // With no mana value 2 spell on the stack, Spell Snare has no target: it is not offered.
    const opt = castOption(t, idOf(t, "p1", "hand", "Spell Snare"));
    expect(opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : []).not.toContain(t.stack[0]?.id);
    expect(() =>
      act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Spell Snare"), targets: { t: [t.stack[0]?.id as string] } }),
    ).toThrow();
  });

  it("Sear: 4 damage to a creature or planeswalker, never to a player", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Mountain"], hand: ["Sear"] }, p2: { battlefield: ["Serra Angel"] } });
    const card = idOf(s, "p1", "hand", "Sear");
    const opt = castOption(s, card);
    const legal = opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [];
    expect(legal).not.toContain("p2");
    expect(() => act(s, "p1", { type: "cast", card, targets: { t: ["p2"] } })).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Steam Vents: pay 2 life for it to enter untapped, otherwise it enters tapped; produces {U} or {R}", () => {
    const play = (payLife: boolean) => {
      let s = scenario({ p1: { hand: ["Steam Vents"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Steam Vents"), payLife });
      const vents = idOf(s, "p1", "battlefield", "Steam Vents");
      return { s, vents, tapped: s.objects[vents]?.tapped, life: s.players.p1?.life };
    };
    expect(play(false)).toMatchObject({ tapped: true, life: 20 });
    const paid = play(true);
    expect(paid).toMatchObject({ tapped: false, life: 18 });
    const colors = legalActions(paid.s, "p1")
      .filter((a) => a.type === "tapForMana" && a.source === paid.vents)
      .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    expect(colors).toEqual(expect.arrayContaining(["U", "R"]));
    expect(chars(paid.s, paid.vents).subtypes).toEqual(expect.arrayContaining(["Island", "Mountain"]));
  });
});

describe("Lorwyn Eclipsed: foundation (blight, Vivid)", () => {
  const resolution = (controller: string) => ({
    item: { id: "x", controller, sourceId: "none", sourceDefId: "none", targets: {} },
    controller,
    targets: {},
    vars: {},
    pc: 0,
  });

  it('blight as an effect: the player chooses their creature; with no creature, nothing (and "if you do" is false)', () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Pelakka Wurm"] }, p2: {} });
    const r = resolution("p1") as never as Parameters<typeof runEffect>[1];
    const asked = runEffect(s, r, dsl.fx.blight(2, dsl.ref.you, "b"));
    expect(asked && "ask" in asked ? asked.ask.request.type : undefined).toBe("pick");
    // Suggestion: the creature that survives best (the 7/7 Wurm).
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    expect(asked && "ask" in asked && asked.ask.request.suggested).toEqual([wurm]);
    const r2 = resolution("p2") as never as Parameters<typeof runEffect>[1];
    runEffect(s, r2, dsl.fx.blight(1, dsl.ref.you, "b"));
    expect((r2 as { vars: Record<string, unknown> }).vars.$b).toEqual([0]);
  });

  it("blight as a cost: the ability can be activated only with a creature, which gets the counters", () => {
    const card = customCard({
      name: "Test Blighter",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [dsl.activated({ tap: true, blight: 1, effects: [dsl.fx.gainLife(2)], label: "test" })],
    });
    let s = scenario({ p1: { battlefield: [card] } });
    const src = idOf(s, "p1", "battlefield", card.name);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === src)).toBe(false);
    s = scenario({ p1: { battlefield: [card, "Pelakka Wurm"] } });
    const src2 = idOf(s, "p1", "battlefield", card.name);
    s = settle(act(s, "p1", { type: "activate", source: src2, ability: 0 }));
    expect(s.objects[idOf(s, "p1", "battlefield", "Pelakka Wurm")]?.counters["-1/-1"]).toBe(1);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Vivid: number of colors among your permanents", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub", "Shivan Dragon", "Llanowar Elves", "Forest"] } });
    const r = resolution("p1") as never as Parameters<typeof runEffect>[1];
    runEffect(s, r, dsl.fx.gainLife(dsl.amount.colorsAmong()));
    expect(s.players.p1?.life).toBe(22);
  });
});

describe("Lorwyn Eclipsed, batch A — white", () => {
  /**
   * Lorwyn Eclipsed, batch A — white cards: −1/−1 counters that leave (Stoneback, Reejerey, Dounguard, Slumbering
   * Walker), persist granted (Rhys, Isilu), double-faced (Brigid, Eirdu), behold (Champion, Aspirant), blight as a
   * cost (Evershrike's Gift, Spiral into Solitude), Vivid (Kithkeeper) and the "becomes tapped" triggers of the Merfolk.
   */
  type S = GameState;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
  /** Answers pending choices: picks `want` when it is among the options, otherwise the suggestion. */
  const chooseWanted = (s: S, want: string[]) => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      const r = p.request;
      const picked = r.type === "pick" ? want.filter((w) => r.options.includes(w)) : wantedName(cur, r, want);
      cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
      cur = passAccepting(cur, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    }
    return settle(cur);
  };
  const cast = (s: S, name: string, targets?: Record<string, string[]>) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), targets });
  /** Activates the `index`-th ability offered for this source. */
  const activate = (s: S, source: string, targets?: Record<string, string[]>, index = 0) => {
    const a = legalActions(s, "p1").filter((x) => x.type === "activate" && x.source === source)[index];
    if (a?.type !== "activate") throw new Error("ability not offered");
    return act(s, "p1", { type: "activate", source, ability: a.ability, targets });
  };
  const canActivate = (s: S, source: string) => legalActions(s, "p1").some((x) => x.type === "activate" && x.source === source);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const minus = (s: S, id: string) => s.objects[id]?.counters["-1/-1"] ?? 0;
  const setMinus = (s: S, id: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters["-1/-1"] = n;
    s.version += 1;
  };
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const inExile = (s: S, name: string) => s.exile.some((id) => nameOf(s, id) === name);
  const attack = (s: S, names: string[]) => {
    let cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const attackers = names.map((n) => ({ id: idOf(cur, "p1", "battlefield", n), defender: "p2" }));
    cur = act(cur, "p1", { type: "declareAttackers", attackers });
    return cur;
  };
  /** Destroys a permanent outside any resolution, then lets the triggers resolve. */
  const kill = (s: S, id: string) => {
    simultaneously(s, () => destroy(s, id));
    return settle(act(s, "p1", { type: "pass" }));
  };

  it("Adept Watershaper: your other tapped creatures are indestructible, not the untapped ones nor the opponent's", () => {
    const s = scenario({
      p1: { battlefield: [{ name: "Adept Watershaper", tapped: true }, { name: "Bear Cub", tapped: true }, "Serra Angel"] },
      p2: { battlefield: [{ name: "Bear Cub", tapped: true }] },
    });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Serra Angel")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p1", "battlefield", "Adept Watershaper")).keywords).not.toContain("indestructible");
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).not.toContain("indestructible");
  });

  describe("Ajani, Outland Chaperone", () => {
    it("+1: a 1/1 green and white Kithkin; −2: 4 damage to a tapped creature only", () => {
      let s = scenario({
        p1: { battlefield: ["Ajani, Outland Chaperone"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon"] },
      });
      const ajani = idOf(s, "p1", "battlefield", "Ajani, Outland Chaperone");
      const start = s.objects[ajani]?.counters.loyalty ?? 0;
      s = settle(activate(s, ajani));
      const token = idOf(s, "p1", "battlefield", "Kithkin");
      expect(pt(s, token)).toEqual([1, 1]);
      expect(chars(s, token).colors.sort()).toEqual(["G", "W"]);
      expect(s.objects[ajani]?.counters.loyalty).toBe(start + 1);

      let t = scenario({
        p1: { battlefield: ["Ajani, Outland Chaperone"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon"] },
      });
      const a2 = idOf(t, "p1", "battlefield", "Ajani, Outland Chaperone");
      expect(() => activate(t, a2, { t: [idOf(t, "p2", "battlefield", "Shivan Dragon")] }, 1)).toThrow();
      t = settle(activate(t, a2, { t: [idOf(t, "p2", "battlefield", "Serra Angel")] }, 1));
      expect(idsOf(t, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    });

    it("−8: among the top X cards (X = your life), nonland permanents with mana value 3 or less enter", () => {
      let s = scenario({
        p1: {
          life: 4,
          battlefield: ["Ajani, Outland Chaperone"],
          library: ["Bear Cub", "Forest", "Serra Angel", "Llanowar Elves", "Bear Cub", ...lands("Forest", 5)],
        },
      });
      const ajani = idOf(s, "p1", "battlefield", "Ajani, Outland Chaperone");
      (s.objects[ajani] as { counters: Record<string, number> }).counters.loyalty = 8;
      const top = s.players.p1?.library.slice(0, 4) ?? [];
      // The −2 ability is not offered (no tapped creature): the third ability is activated by its index.
      s = chooseWanted(act(s, "p1", { type: "activate", source: ajani, ability: 2 }), top);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(0);
      expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(0);
    });
  });

  it("Appeal to Eirdu: one or two targeted creatures get +2/+1", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub", "Llanowar Elves"], hand: ["Appeal to Eirdu"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = settle(cast(s, "Appeal to Eirdu", { t: [bear, elves] }));
    expect(pt(s, bear)).toEqual([4, 3]);
    expect(pt(s, elves)).toEqual([3, 2]);
  });

  it("Bark of Doran: +0/+1, and the equipped creature deals damage by toughness if it exceeds its power", () => {
    let s = scenario({ p1: { battlefield: ["Bark of Doran", "Moonlit Lamenter", "Plains"] } });
    const bark = idOf(s, "p1", "battlefield", "Bark of Doran");
    const lamenter = idOf(s, "p1", "battlefield", "Moonlit Lamenter");
    s = settle(activate(s, bark, { t: [lamenter] }));
    expect(pt(s, lamenter)).toEqual([2, 6]);
    s = settle(attack(s, ["Moonlit Lamenter"]));
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p2?.life).toBe(14);
  });

  it("Brigid: Kithkin on entering; paying {G} transforms it (mana equal to the other creatures), paying {W} brings it back with a Kithkin", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3)], hand: ["Brigid, Clachan's Heart // Brigid, Doun's Mind"] } });
    s = settle(cast(s, "Brigid, Clachan's Heart // Brigid, Doun's Mind"));
    expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(1);

    s = scenario({
      p1: { battlefield: ["Brigid, Clachan's Heart // Brigid, Doun's Mind", "Forest", "Plains", "Bear Cub"] },
      step: "upkeep",
    });
    const brigid = idOf(s, "p1", "battlefield", "Brigid, Clachan's Heart // Brigid, Doun's Mind");
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    expect(chars(s, brigid).name).toBe("Brigid, Doun's Mind");
    expect(chars(s, brigid).subtypes).toContain("Soldier");
    const colors = legalActions(s, "p1")
      .filter((a) => a.type === "tapForMana" && a.source === brigid)
      .flatMap((a) => (a.type === "tapForMana" ? a.colors : []));
    expect(colors).toEqual(expect.arrayContaining(["G", "W"]));
    // Next turn: {W} paid, it becomes Brigid, Clachan's Heart again and creates a Kithkin.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.number === 5 && x.turn.step === "main2");
    // 712.8a: on the front face, the front face's name.
    expect(chars(s, brigid).name).toBe("Brigid, Clachan's Heart");
    expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(1);
  });

  it("Burdened Stoneback: enters as a 2/2; {1}{W} and a counter removed: a creature gains indestructible", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Burdened Stoneback"] } });
    s = settle(cast(s, "Burdened Stoneback"));
    const stone = idOf(s, "p1", "battlefield", "Burdened Stoneback");
    expect(minus(s, stone)).toBe(2);
    expect(pt(s, stone)).toEqual([2, 2]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(activate(s, stone, { t: [bear] }));
    expect(minus(s, stone)).toBe(1);
    expect(pt(s, stone)).toEqual([3, 3]);
    expect(chars(s, bear).keywords).toContain("indestructible");
  });

  describe("Champion of the Clachan", () => {
    it("exiles a Kithkin as a cost; your other Kithkin +1/+1; the exiled card returns to hand when it leaves", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Plains", 4), "Goldmeadow Nomad", "Timid Shieldbearer"], hand: ["Champion of the Clachan"] },
      });
      const shield = idOf(s, "p1", "battlefield", "Timid Shieldbearer");
      s = settle(cast(s, "Champion of the Clachan"));
      expect(inExile(s, "Goldmeadow Nomad")).toBe(true);
      expect(pt(s, shield)).toEqual([3, 3]);
      const champ = idOf(s, "p1", "battlefield", "Champion of the Clachan");
      expect(pt(s, champ)).toEqual([4, 5]);
      s = kill(s, champ);
      expect(idsOf(s, "p1", "hand", "Goldmeadow Nomad")).toHaveLength(1);
      expect(pt(s, shield)).toEqual([2, 2]);
    });

    it("with no Kithkin to exile, it can't be cast", () => {
      const s = scenario({ p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Champion of the Clachan"] } });
      expect(() => cast(s, "Champion of the Clachan")).toThrow();
    });
  });

  it("Crib Swap: exiles the creature; its controller creates a colorless 1/1 Shapeshifter with changeling", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Crib Swap"] }, p2: { battlefield: ["Serra Angel"] } });
    s = settle(cast(s, "Crib Swap", { t: [idOf(s, "p2", "battlefield", "Serra Angel")] }));
    expect(inExile(s, "Serra Angel")).toBe(true);
    const token = idOf(s, "p2", "battlefield", "Shapeshifter");
    expect(pt(s, token)).toEqual([1, 1]);
    expect(chars(s, token).colors).toEqual([]);
    expect(chars(s, token).keywords).toContain("changeling");
    expect(idsOf(s, "p1", "battlefield", "Shapeshifter")).toHaveLength(0);
  });

  it("Curious Colossus: the targeted opponent's creatures become 1/1 Cowards with no abilities, permanently", () => {
    let s = scenario({
      p1: { battlefield: lands("Plains", 7), hand: ["Curious Colossus"] },
      p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
    });
    s = settle(cast(s, "Curious Colossus"));
    s = chooseWanted(s, ["p2"]);
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, angel)).toEqual([1, 1]);
    expect(chars(s, angel).keywords).not.toContain("flying");
    expect(chars(s, angel).subtypes).toEqual(expect.arrayContaining(["Angel", "Coward"]));
    expect(chars(s, elves).abilities).toHaveLength(0);
    expect(pt(s, idOf(s, "p1", "battlefield", "Curious Colossus"))).toEqual([7, 7]);
  });

  describe("Eirdu and Isilu", () => {
    it("Eirdu: your creature spells have convoke", () => {
      const s = scenario({
        p1: { battlefield: ["Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight", "Bear Cub"], hand: ["Bear Cub"] },
      });
      const t = settle(cast(s, "Bear Cub"));
      expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(2);
      const without = scenario({ p1: { battlefield: ["Serra Angel", "Bear Cub"], hand: ["Bear Cub"] } });
      expect(() => cast(without, "Bear Cub")).toThrow();
    });

    it("{B} paid: Isilu; your other nontoken creatures have persist (once only, not the tokens)", () => {
      let s = scenario({
        p1: { battlefield: ["Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight", "Swamp", "Bear Cub", "Goldmeadow Nomad"] },
        step: "upkeep",
      });
      const eirdu = idOf(s, "p1", "battlefield", "Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight");
      s = advanceUntil(s, (x) => x.turn.step === "main2");
      expect(chars(s, eirdu).name).toBe("Isilu, Carrier of Twilight");
      expect(chars(s, eirdu).keywords).toEqual(expect.arrayContaining(["flying", "lifelink"]));
      s = kill(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(minus(s, back)).toBe(1);
      expect(pt(s, back)).toEqual([1, 1]);
      s = kill(s, back);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    });
  });

  it("Encumbered Reejerey: tapped with a −1/−1 counter, it removes one", () => {
    let s = scenario({ p1: { battlefield: ["Encumbered Reejerey"] } });
    const ree = idOf(s, "p1", "battlefield", "Encumbered Reejerey");
    setMinus(s, ree, 3);
    expect(pt(s, ree)).toEqual([2, 1]);
    s = settle(attack(s, ["Encumbered Reejerey"]));
    expect(minus(s, ree)).toBe(2);
    expect(pt(s, ree)).toEqual([3, 2]);
  });

  it("Evershrike's Gift: +1/+0 and flying; from the graveyard, {1}{W} and blight 2 return it to hand", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Bear Cub"], hand: ["Evershrike's Gift"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "Evershrike's Gift", { enchant: [bear] }));
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(chars(s, bear).keywords).toContain("flying");

    let t = scenario({ p1: { battlefield: [...lands("Plains", 2), "Pelakka Wurm"], graveyard: ["Evershrike's Gift"] } });
    const gift = idOf(t, "p1", "graveyard", "Evershrike's Gift");
    t = settle(activate(t, gift));
    expect(idsOf(t, "p1", "hand", "Evershrike's Gift")).toHaveLength(1);
    expect(minus(t, idOf(t, "p1", "battlefield", "Pelakka Wurm"))).toBe(2);
    // With no creature to blight, the ability is not offered.
    const u = scenario({ p1: { battlefield: lands("Plains", 2), graveyard: ["Evershrike's Gift"] } });
    expect(canActivate(u, idOf(u, "p1", "graveyard", "Evershrike's Gift"))).toBe(false);
  });

  it("Flock Impostor: returns another of your creatures to hand", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 3), "Bear Cub"], hand: ["Flock Impostor"] } });
    s = cast(s, "Flock Impostor");
    s = chooseWanted(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
    expect(idsOf(s, "p1", "hand", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Flock Impostor")).toHaveLength(1);
  });

  it("Gallant Fowlknight: your creatures +1/+0, and only your Kithkin gain first strike", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Timid Shieldbearer", "Bear Cub"], hand: ["Gallant Fowlknight"] },
    });
    s = settle(cast(s, "Gallant Fowlknight"));
    const shield = idOf(s, "p1", "battlefield", "Timid Shieldbearer");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const knight = idOf(s, "p1", "battlefield", "Gallant Fowlknight");
    expect(pt(s, shield)).toEqual([3, 2]);
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(pt(s, knight)).toEqual([4, 4]);
    expect(chars(s, shield).keywords).toContain("firstStrike");
    expect(chars(s, knight).keywords).toContain("firstStrike");
    expect(chars(s, bear).keywords).not.toContain("firstStrike");
  });

  it("Goldmeadow Nomad: {W} and exile it from the graveyard: a 1/1 Kithkin", () => {
    let s = scenario({ p1: { battlefield: ["Plains"], graveyard: ["Goldmeadow Nomad"] } });
    s = settle(activate(s, idOf(s, "p1", "graveyard", "Goldmeadow Nomad")));
    expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(1);
    expect(inExile(s, "Goldmeadow Nomad")).toBe(true);
  });

  it("Keep Out: 4 damage to a tapped creature (not an untapped one), or destroys an enchantment", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Keep Out"] },
        p2: { battlefield: [{ name: "Serra Angel", tapped: true }, "Shivan Dragon", "Clachan Festival"] },
      });
    let s = setup();
    const card = idOf(s, "p1", "hand", "Keep Out");
    expect(() =>
      act(s, "p1", { type: "cast", card, mode: 0, targets: { c: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }),
    ).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, mode: 0, targets: { c: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    let t = setup();
    t = settle(
      act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Keep Out"),
        mode: 1,
        targets: { e: [idOf(t, "p2", "battlefield", "Clachan Festival")] },
      }),
    );
    expect(idsOf(t, "p2", "graveyard", "Clachan Festival")).toHaveLength(1);
  });

  describe("Kinsbaile Aspirant", () => {
    it("behold a Kithkin or pay {2} more", () => {
      const alone = scenario({ p1: { battlefield: ["Plains"], hand: ["Kinsbaile Aspirant"] } });
      expect(() => cast(alone, "Kinsbaile Aspirant")).toThrow();
      const paid = settle(
        cast(scenario({ p1: { battlefield: lands("Plains", 3), hand: ["Kinsbaile Aspirant"] } }), "Kinsbaile Aspirant"),
      );
      expect(idsOf(paid, "p1", "battlefield", "Kinsbaile Aspirant")).toHaveLength(1);
      expect(idsOf(paid, "p1", "battlefield", "Plains").every((id) => paid.objects[id]?.tapped)).toBe(true);
      const beheld = scenario({ p1: { battlefield: ["Plains", "Goldmeadow Nomad"], hand: ["Kinsbaile Aspirant"] } });
      expect(idsOf(settle(cast(beheld, "Kinsbaile Aspirant")), "p1", "battlefield", "Kinsbaile Aspirant")).toHaveLength(1);
      // Another Kithkin card in hand is enough (not the card being cast itself).
      const inHand = scenario({ p1: { battlefield: ["Plains"], hand: ["Kinsbaile Aspirant", "Goldmeadow Nomad"] } });
      expect(idsOf(settle(cast(inHand, "Kinsbaile Aspirant")), "p1", "battlefield", "Kinsbaile Aspirant")).toHaveLength(1);
    });

    it("whenever another of your creatures enters, +1/+1 until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Kinsbaile Aspirant", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
      const asp = idOf(s, "p1", "battlefield", "Kinsbaile Aspirant");
      s = settle(cast(s, "Bear Cub"));
      expect(pt(s, asp)).toEqual([3, 2]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, asp)).toEqual([2, 1]);
    });
  });

  it("Kinscaer Sentry: when attacking, a creature with mana value ≤ X (attackers) enters from hand tapped and attacking", () => {
    let s = scenario({ p1: { battlefield: ["Kinscaer Sentry"], hand: ["Llanowar Elves", "Serra Angel"] } });
    s = attack(s, ["Kinscaer Sentry"]);
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
      expect(s.pending.request.options).not.toContain(idOf(s, "p1", "hand", "Serra Angel"));
    }
    s = chooseWanted(s, [idOf(s, "p1", "hand", "Llanowar Elves")]);
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(s.objects[elves]?.tapped).toBe(true);
    expect(s.combat?.attackers.some((a) => a.id === elves)).toBe(true);
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p2?.life).toBe(17);
    expect(s.players.p1?.life).toBe(22);
  });

  it("Kithkeeper: Vivid, a Kithkin per color among your permanents; tap three creatures: +3/+0 and flying", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 7), "Bear Cub"], hand: ["Kithkeeper"] } });
    s = settle(cast(s, "Kithkeeper"));
    // White (Kithkeeper) and green (Bear Cub): two tokens.
    expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(2);
    const keeper = idOf(s, "p1", "battlefield", "Kithkeeper");
    s = settle(activate(s, keeper));
    expect(pt(s, keeper)).toEqual([6, 3]);
    expect(chars(s, keeper).keywords).toContain("flying");
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Kithkin").every((id) => s.objects[id]?.tapped)).toBe(true);
    expect(s.objects[keeper]?.tapped).toBe(false);
    // With only two other creatures, Kithkeeper (summoning sickness included, 302.6) is the third.
    let t = scenario({ p1: { battlefield: [{ name: "Kithkeeper", sick: true }, "Bear Cub", "Llanowar Elves"] } });
    const k2 = idOf(t, "p1", "battlefield", "Kithkeeper");
    t = settle(activate(t, k2));
    expect(t.objects[k2]?.tapped).toBe(true);
    expect(chars(t, k2).keywords).toContain("flying");
  });

  it("Liminal Hold: exiles an opposing permanent as long as it stays on the battlefield; you gain 2 life", () => {
    let s = scenario({ p1: { battlefield: lands("Plains", 4), hand: ["Liminal Hold"] }, p2: { battlefield: ["Serra Angel"] } });
    s = cast(s, "Liminal Hold");
    s = chooseWanted(s, [idOf(s, "p2", "battlefield", "Serra Angel")]);
    expect(inExile(s, "Serra Angel")).toBe(true);
    expect(s.players.p1?.life).toBe(22);
    s = kill(s, idOf(s, "p1", "battlefield", "Liminal Hold"));
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Meanders Guide: when attacking, tapping another Merfolk returns a creature with mana value ≤ 3 from the graveyard", () => {
    let s = scenario({
      p1: { battlefield: ["Meanders Guide", "Wanderbrine Preacher"], graveyard: ["Bear Cub", "Serra Angel"] },
    });
    s = attack(s, ["Meanders Guide"]);
    s = chooseWanted(s, [idOf(s, "p1", "graveyard", "Bear Cub")]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Wanderbrine Preacher")]?.tapped).toBe(true);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
    // Wanderbrine Preacher tapped: 2 life.
    expect(s.players.p1?.life).toBe(22);
  });

  it("Moonlit Lamenter: {1}{W} and a counter removed: draw a card (as a sorcery)", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Moonlit Lamenter"] } });
    const lam = idOf(s, "p1", "battlefield", "Moonlit Lamenter");
    expect(canActivate(s, lam)).toBe(false);
    setMinus(s, lam, 1);
    s = settle(activate(s, lam));
    expect(minus(s, lam)).toBe(0);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Morningtide's Light: exiles the creatures, they return tapped at the end step; your damage prevented", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Bear Cub"], hand: ["Morningtide's Light"] },
      p2: { battlefield: ["Serra Angel", "Shivan Dragon"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "Morningtide's Light", { t: [idOf(s, "p1", "battlefield", "Bear Cub"), angel] }));
    expect(inExile(s, "Bear Cub")).toBe(true);
    expect(inExile(s, "Serra Angel")).toBe(true);
    expect(inExile(s, "Morningtide's Light")).toBe(true);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    const back = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    // Returned tapped at the end step (the Angel untapped on p2's turn, not the Bear Cub).
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    dealDamage(s, sourceFromObject(s, idOf(s, "p2", "battlefield", "Shivan Dragon")), "p1", 5, false);
    expect(s.players.p1?.life).toBe(20);
    expect(back).toBeDefined();
  });

  it("Personify: the creature is exiled then returns (new object, no damage); a 1/1 Shapeshifter", () => {
    let s = scenario({ p1: { battlefield: [...lands("Plains", 2), { name: "Bear Cub", damage: 1 }], hand: ["Personify"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "Personify", { t: [bear] }));
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(back).not.toBe(bear);
    expect(s.objects[back]?.damage).toBe(0);
    expect(idsOf(s, "p1", "battlefield", "Shapeshifter")).toHaveLength(1);
  });

  it("Protective Response: destroys an attacking or blocking creature, not another", () => {
    let s = scenario({
      p1: { battlefield: ["Serra Angel", "Bear Cub"] },
      p2: { battlefield: lands("Plains", 3), hand: ["Protective Response"] },
    });
    const card = idOf(s, "p2", "hand", "Protective Response");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = attack(s, ["Serra Angel"]);
    s = passAccepting(s, (x) => x.pending?.kind === "priority" && x.pending.player === "p2");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(() => act(s, "p2", { type: "cast", card, targets: { t: [bear] } })).toThrow();
    s = settle(act(s, "p2", { type: "cast", card, targets: { t: [angel] } }));
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Reluctant Dounguard: another creature enters, it removes a −1/−1 counter", () => {
    let s = scenario({ p1: { battlefield: ["Reluctant Dounguard", ...lands("Forest", 2)], hand: ["Bear Cub"] } });
    const dg = idOf(s, "p1", "battlefield", "Reluctant Dounguard");
    setMinus(s, dg, 2);
    s = settle(cast(s, "Bear Cub"));
    expect(minus(s, dg)).toBe(1);
    expect(pt(s, dg)).toEqual([3, 3]);
  });

  describe("Rhys, the Evermore", () => {
    it("another of your creatures gains persist until end of turn", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Rhys, the Evermore"] } });
      s = cast(s, "Rhys, the Evermore");
      s = chooseWanted(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = kill(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(minus(s, back)).toBe(1);
    });

    it("{W}, {T}: removes the −1/−1 counters from one of your creatures, as a sorcery", () => {
      let s = scenario({ p1: { battlefield: ["Plains", "Rhys, the Evermore", "Slumbering Walker"] } });
      const walker = idOf(s, "p1", "battlefield", "Slumbering Walker");
      setMinus(s, walker, 2);
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Rhys, the Evermore"), { t: [walker] }));
      expect(minus(s, walker)).toBe(0);
      expect(pt(s, walker)).toEqual([4, 7]);
    });
  });

  it("Riverguard's Reflexes: +2/+2, first strike, and the creature untaps", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 2), { name: "Bear Cub", tapped: true }], hand: ["Riverguard's Reflexes"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "Riverguard's Reflexes", { t: [bear] }));
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toContain("firstStrike");
    expect(s.objects[bear]?.tapped).toBe(false);
  });

  it("Slumbering Walker: at your end step, removing a counter returns a creature with power ≤ 2 from the graveyard", () => {
    let s = scenario({ p1: { battlefield: ["Slumbering Walker"], graveyard: ["Serra Angel", "Bear Cub"] } });
    const walker = idOf(s, "p1", "battlefield", "Slumbering Walker");
    setMinus(s, walker, 2);
    s = advanceUntil(s, (x) => x.turn.step === "end" && x.stack.length > 0);
    s = chooseWanted(s, [idOf(s, "p1", "graveyard", "Bear Cub")]);
    expect(minus(s, walker)).toBe(1);
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Spiral into Solitude: can't attack or block; {1}{W}, blight 1 and sacrifice it: exile the enchanted creature", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 4), "Pelakka Wurm"], hand: ["Spiral into Solitude"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "Spiral into Solitude", { enchant: [angel] }));
    expect(chars(s, angel).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    s = settle(activate(s, idOf(s, "p1", "battlefield", "Spiral into Solitude")));
    expect(inExile(s, "Serra Angel")).toBe(true);
    expect(idsOf(s, "p1", "graveyard", "Spiral into Solitude")).toHaveLength(1);
    expect(minus(s, idOf(s, "p1", "battlefield", "Pelakka Wurm"))).toBe(1);
  });

  it("Thoughtweft Imbuer: a creature that attacks alone gets +X/+X (X = your Kithkin)", () => {
    let s = scenario({ p1: { battlefield: ["Thoughtweft Imbuer", "Timid Shieldbearer", "Goldmeadow Nomad", "Bear Cub"] } });
    s = settle(attack(s, ["Bear Cub"]));
    // Three Kithkin: Timid Shieldbearer, Goldmeadow Nomad and the Imbuer itself.
    expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([5, 5]);
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p2?.life).toBe(15);
  });

  it("Tributary Vaulter and Wanderbrine Preacher: tapped, another Merfolk +2/+0 and 2 life", () => {
    let s = scenario({ p1: { battlefield: ["Tributary Vaulter", "Wanderbrine Preacher"] } });
    s = attack(s, ["Tributary Vaulter", "Wanderbrine Preacher"]);
    s = chooseWanted(s, [idOf(s, "p1", "battlefield", "Wanderbrine Preacher")]);
    expect(pt(s, idOf(s, "p1", "battlefield", "Wanderbrine Preacher"))).toEqual([4, 2]);
    s = advanceUntil(s, (x) => x.turn.step === "end");
    expect(s.players.p1?.life).toBe(22);
    expect(s.players.p2?.life).toBe(15);
  });

  it("Wanderbrine Trapper: {1}, {T} and tap another of your creatures: taps an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: ["Wanderbrine Trapper", "Bear Cub", "Plains"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(activate(s, idOf(s, "p1", "battlefield", "Wanderbrine Trapper"), { t: [angel] }));
    expect(s.objects[angel]?.tapped).toBe(true);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    const lone = scenario({ p1: { battlefield: ["Wanderbrine Trapper", "Plains"] }, p2: { battlefield: ["Serra Angel"] } });
    expect(canActivate(lone, idOf(lone, "p1", "battlefield", "Wanderbrine Trapper"))).toBe(false);
  });
});

describe("Lorwyn Eclipsed, batch A — blue", () => {
  /**
   * Lorwyn Eclipsed, batch A — blue cards: Auras (Aquitect's Defenses, Lofty Dreams, Noggle the Mind), creatures with
   * −1/−1 counters that are removed (Flitterwing Nuisance, Glen Elendra Guardian, Loch Mare), "becomes tapped"
   * (Pestered Wellguard, Champions of the Shoal), behold a Merfolk (Silvergill Mentor), Vivid (Rime Chill,
   * Shinestriker), copies (Omni-Changeling, Mirrorform), Sygg and its transformation.
   */
  type S = GameState;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const untilChoiceOrIdle = (s: S) =>
    passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
  /** Answers pending choices: `want` when these values are among the options (or for a yes/no), otherwise the suggestion. */
  const chooseWanted = (s: S, want: (string | number)[]) => {
    let cur = untilChoiceOrIdle(s);
    for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      const r = p.request;
      const picked =
        r.type === "pick"
          ? want.filter((w) => r.options.includes(w as string))
          : r.type === "yesNo"
            ? want.filter((w) => typeof w === "number").slice(0, 1)
            : wantedName(cur, r, want.map(String));
      cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
      cur = untilChoiceOrIdle(cur);
    }
    return settle(cur);
  };
  const cast = (s: S, card: string, extra: Record<string, unknown> = {}) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", card), ...extra });
  const activate = (s: S, source: string, label?: string, extra: Record<string, unknown> = {}) => {
    const a = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === source && (!label || x.label?.includes(label)),
    );
    if (a?.type !== "activate") throw new Error(`ability not found: ${label ?? source}`);
    return act(s, "p1", { type: "activate", source, ability: a.ability, ...extra });
  };
  const canActivate = (s: S, source: string) => legalActions(s, "p1").some((x) => x.type === "activate" && x.source === source);
  /** Goes to p1's declare attackers step and attacks p2. */
  const attack = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: "p2" })) });
  };
  const setCounters = (s: S, id: string, kind: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters[kind] = n;
    bump(s);
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const SYGG = "Sygg, Wanderwine Wisdom // Sygg, Wanderbrine Shield";
  const WALKER: CardDef = customCard({ name: "Test Walker", types: ["Planeswalker"], typeLine: "Planeswalker", loyalty: 5 });
  /** Attacks p2's planeswalker (Test Walker). */
  const attackWalker = (s: S, attackers: string[]) => {
    const cur = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const walker = idOf(cur, "p2", "battlefield", "Test Walker");
    return act(cur, "p1", { type: "declareAttackers", attackers: attackers.map((id) => ({ id, defender: walker })) });
  };

  describe("Auras", () => {
    it("Aquitect's Defenses: only on your creature; +1/+2 and hexproof until end of turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Aquitect's Defenses"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      expect(() => cast(s, "Aquitect's Defenses", { targets: { enchant: [angel] } })).toThrow();
      s = settle(cast(s, "Aquitect's Defenses", { targets: { enchant: [bear] } }));
      const aura = idOf(s, "p1", "battlefield", "Aquitect's Defenses");
      expect(s.objects[aura]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 4]);
      expect(chars(s, bear).keywords).toContain("hexproof");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, bear).keywords).not.toContain("hexproof");
      expect(pt(s, bear)).toEqual([3, 4]);
    });

    it("Lofty Dreams: draw a card; the enchanted creature gets +2/+2 and flying", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Bear Cub"], hand: ["Lofty Dreams"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "Lofty Dreams", { targets: { enchant: [bear] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(pt(s, bear)).toEqual([4, 4]);
      expect(chars(s, bear).keywords).toContain("flying");
    });

    it("Noggle the Mind: the creature loses its abilities and becomes a colorless 1/1 Noggle", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Noggle the Mind"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "Noggle the Mind", { targets: { enchant: [angel] } }));
      const c = chars(s, angel);
      expect(pt(s, angel)).toEqual([1, 1]);
      expect(c.colors).toEqual([]);
      expect(c.subtypes).toEqual(["Noggle"]);
      expect(c.keywords).not.toContain("flying");
      expect(c.keywords).not.toContain("vigilance");
    });
  });

  describe("−1/−1 counters removed as a cost", () => {
    it("Flitterwing Nuisance: enters as a 1/1; removing its counter draws on each combat damage dealt to a player this turn", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Bear Cub", "Fire Elemental"], hand: ["Flitterwing Nuisance"] },
      });
      s = settle(cast(s, "Flitterwing Nuisance"));
      const fw = idOf(s, "p1", "battlefield", "Flitterwing Nuisance");
      expect(s.objects[fw]?.counters["-1/-1"]).toBe(1);
      expect(pt(s, fw)).toEqual([1, 1]);
      s = settle(activate(s, fw));
      expect(s.objects[fw]?.counters["-1/-1"] ?? 0).toBe(0);
      expect(canActivate(s, fw)).toBe(false);
      const hand = s.players.p1?.hand.length ?? 0;
      s = attack(s, [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Fire Elemental")]);
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(20 - 2 - 5);
      expect(s.players.p1?.hand).toHaveLength(hand + 2);
      // The effect lasts only this turn.
      const emblem = () => (s.players.p1?.command ?? []).some((id) => nameOf(s, id) === "Flitterwing Nuisance");
      expect(emblem()).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2");
      expect(emblem()).toBe(false);
    });

    it("Flitterwing Nuisance: combat damage to a planeswalker also draws", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Bear Cub"], hand: ["Flitterwing Nuisance"] },
        p2: { battlefield: [WALKER] },
      });
      s = settle(cast(s, "Flitterwing Nuisance"));
      s = settle(activate(s, idOf(s, "p1", "battlefield", "Flitterwing Nuisance")));
      const hand = s.players.p1?.hand.length ?? 0;
      s = attackWalker(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = advanceUntil(s, (x) => x.turn.step === "end");
      expect(s.players.p2?.life).toBe(20);
      expect(s.players.p1?.hand).toHaveLength(hand + 1);
    });

    it("Glen Elendra Guardian: removes its counter to counter a noncreature spell, whose controller draws", () => {
      let s = scenario({
        p1: { battlefield: ["Glen Elendra Guardian", ...lands("Island", 4)] },
        p2: { battlefield: lands("Island", 3), hand: ["Opt", "Bear Cub"] },
        active: "p2",
      });
      const guardian = idOf(s, "p1", "battlefield", "Glen Elendra Guardian");
      setCounters(s, guardian, "-1/-1", 1);
      expect(pt(s, guardian)).toEqual([2, 3]);
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Opt") });
      s = act(s, "p2", { type: "pass" });
      const opt = s.stack[0]?.id as string;
      s = settle(activate(s, guardian, undefined, { targets: { t: [opt] } }));
      expect(idsOf(s, "p2", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(2);
      expect(s.objects[guardian]?.counters["-1/-1"] ?? 0).toBe(0);
      expect(pt(s, guardian)).toEqual([3, 4]);
      expect(canActivate(s, guardian)).toBe(false);
    });

    it("Glen Elendra Guardian: a creature spell isn't a legal target", () => {
      let s = scenario({
        p1: { battlefield: ["Glen Elendra Guardian", ...lands("Island", 2)] },
        p2: { battlefield: lands("Forest", 2), hand: ["Bear Cub"] },
        active: "p2",
      });
      const guardian = idOf(s, "p1", "battlefield", "Glen Elendra Guardian");
      setCounters(s, guardian, "-1/-1", 1);
      s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Bear Cub") });
      s = act(s, "p2", { type: "pass" });
      const bear = s.stack[0]?.id as string;
      expect(() => activate(s, guardian, undefined, { targets: { t: [bear] } })).toThrow();
    });

    it("Loch Mare: enters as a 1/2; one counter to draw, two to tap a creature with a stun counter", () => {
      let s = scenario({ p1: { battlefield: lands("Island", 7), hand: ["Loch Mare"] }, p2: { battlefield: ["Serra Angel"] } });
      s = settle(cast(s, "Loch Mare"));
      const mare = idOf(s, "p1", "battlefield", "Loch Mare");
      expect(s.objects[mare]?.counters["-1/-1"]).toBe(3);
      expect(pt(s, mare)).toEqual([1, 2]);
      s = settle(activate(s, mare, "Draw"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.objects[mare]?.counters["-1/-1"]).toBe(2);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(activate(s, mare, "Tap a creature", { targets: { t: [angel] } }));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(1);
      expect(s.objects[mare]?.counters["-1/-1"] ?? 0).toBe(0);
      expect(pt(s, mare)).toEqual([4, 5]);
      expect(canActivate(s, mare)).toBe(false);
    });
  });

  describe('"Whenever this creature becomes tapped"', () => {
    it("Pestered Wellguard: attacking creates a 1/1 Faerie with flying", () => {
      let s = scenario({ p1: { battlefield: ["Pestered Wellguard"] } });
      s = settle(attack(s, [idOf(s, "p1", "battlefield", "Pestered Wellguard")]));
      const faerie = idOf(s, "p1", "battlefield", "Faerie");
      expect(chars(s, faerie).colors).toEqual(["U", "B"]);
      expect(chars(s, faerie).keywords).toContain("flying");
    });

    it("Wanderwine Distracter: attacking gives -3/-0 to an opposing creature until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Wanderwine Distracter"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = chooseWanted(attack(s, [idOf(s, "p1", "battlefield", "Wanderwine Distracter")]), [angel]);
      expect(pt(s, angel)).toEqual([1, 4]);
    });

    it("Silvergill Peddler: becoming tapped draws then discards", () => {
      let s = scenario({ p1: { battlefield: ["Silvergill Peddler"], hand: ["Opt"], library: ["Bear Cub", "Forest"] } });
      s = chooseWanted(attack(s, [idOf(s, "p1", "battlefield", "Silvergill Peddler")]), [idOf(s, "p1", "hand", "Opt")]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("Champions of the Shoal: exiles a Merfolk as a cost; taps a creature with a stun counter; the Merfolk returns to hand", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Silvergill Peddler"], hand: ["Champions of the Shoal"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = chooseWanted(cast(s, "Champions of the Shoal"), [angel]);
      expect(idsOf(s, "p1", "battlefield", "Silvergill Peddler")).toHaveLength(0);
      expect(s.exile.some((id) => nameOf(s, id) === "Silvergill Peddler")).toBe(true);
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(1);
      destroy(s, idOf(s, "p1", "battlefield", "Champions of the Shoal"));
      s = settle(act(s, "p1", { type: "pass" }));
      expect(idsOf(s, "p1", "hand", "Silvergill Peddler")).toHaveLength(1);
    });

    it("Champions of the Shoal: with no Merfolk to exile, it can't be cast", () => {
      const s = scenario({ p1: { battlefield: [...lands("Island", 4), "Bear Cub"], hand: ["Champions of the Shoal"] } });
      expect(() => cast(s, "Champions of the Shoal")).toThrow();
    });
  });

  it("Gravelgill Scoundrel: when attacking, tapping another creature makes it unblockable this turn", () => {
    let s = scenario({ p1: { battlefield: ["Gravelgill Scoundrel", "Bear Cub"] } });
    const scoundrel = idOf(s, "p1", "battlefield", "Gravelgill Scoundrel");
    s = chooseWanted(attack(s, [scoundrel]), [1]);
    expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    expect(s.objects[scoundrel]?.tapped).toBe(false);
    expect(chars(s, scoundrel).keywords).toContain("unblockable");
    // Without doing so, it stays blockable.
    let t = scenario({ p1: { battlefield: ["Gravelgill Scoundrel", "Bear Cub"] } });
    t = chooseWanted(attack(t, [idOf(t, "p1", "battlefield", "Gravelgill Scoundrel")]), [0]);
    expect(t.objects[idOf(t, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(false);
    expect(chars(t, idOf(t, "p1", "battlefield", "Gravelgill Scoundrel")).keywords).not.toContain("unblockable");
  });

  it("Illusion Spinners: flash if you control a Faerie; hexproof only while untapped", () => {
    const setup = (faerie: boolean) =>
      scenario({
        p1: { battlefield: [...lands("Island", 5), ...(faerie ? ["Glamermite"] : [])], hand: ["Illusion Spinners"] },
        active: "p2",
      });
    const without = setup(false);
    expect(() => act(without, "p1", { type: "cast", card: idOf(without, "p1", "hand", "Illusion Spinners") })).toThrow();
    let s = setup(true);
    s = act(s, "p2", { type: "pass" });
    s = settle(cast(s, "Illusion Spinners"));
    const spinners = idOf(s, "p1", "battlefield", "Illusion Spinners");
    expect(chars(s, spinners).keywords).toContain("hexproof");
    (s.objects[spinners] as { tapped: boolean }).tapped = true;
    bump(s);
    expect(chars(s, spinners).keywords).not.toContain("hexproof");
  });

  it("Glamer Gifter: another creature becomes a base 4/4 with all creature types until end of turn", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: ["Glamer Gifter"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = chooseWanted(cast(s, "Glamer Gifter"), [bear]);
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).subtypes).toContain(ALL_CREATURE_TYPES);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Glamermite: untaps a creature (mode of your choice)", () => {
    let s = scenario({ p1: { battlefield: [...lands("Island", 3), { name: "Bear Cub", tapped: true }], hand: ["Glamermite"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = untilChoiceOrIdle(cast(s, "Glamermite"));
    // Choice of mode, then of target.
    for (let i = 0; i < 5 && s.pending?.kind === "choice"; i++) {
      const r = s.pending.request;
      const values = r.type === "pick" && r.options.includes(bear) ? [bear] : r.intent === "triggerMode" ? ["1"] : r.suggested;
      s = untilChoiceOrIdle(act(s, s.pending.player, { type: "choose", values }));
    }
    s = settle(s);
    expect(s.objects[bear]?.tapped).toBe(false);
  });

  it("Kulrath Mystic and Tanufel Rimespeaker: a spell with mana value 4 or more", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 5), "Kulrath Mystic", "Tanufel Rimespeaker"], hand: ["Serra Angel"] },
    });
    s = settle(cast(s, "Serra Angel"));
    const mystic = idOf(s, "p1", "battlefield", "Kulrath Mystic");
    expect(pt(s, mystic)).toEqual([4, 4]);
    expect(chars(s, mystic).keywords).toContain("vigilance");
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Omni-Changeling: enters as a copy of an opposing creature, with changeling added", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 5), hand: ["Omni-Changeling"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = chooseWanted(cast(s, "Omni-Changeling"), [angel]);
    const [copy] = s.battlefield.filter((id) => s.objects[id]?.controller === "p1" && chars(s, id).name === "Serra Angel");
    expect(copy).toBeDefined();
    expect(pt(s, copy as string)).toEqual([4, 4]);
    expect(chars(s, copy as string).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "changeling"]));
  });

  it("a copy has the mana value of what it copies (707.2): Lunar Insight counts only one value", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 8), "Shivan Dragon"],
        hand: ["Omni-Changeling", "Lunar Insight"],
        library: lands("Island", 3),
      },
    });
    s = chooseWanted(cast(s, "Omni-Changeling"), [idOf(s, "p1", "battlefield", "Shivan Dragon")]);
    const before = s.players.p1?.hand.length ?? 0;
    s = settle(cast(s, "Lunar Insight"));
    // The Dragon and its copy: a single mana value (6), one card (the hand lost Lunar Insight).
    expect(s.players.p1?.hand.length).toBe(before);
  });

  describe("Ondins", () => {
    it("Silvergill Mentor: {2} more without a Merfolk to behold (the card itself doesn't count); creates a 1/1 Merfolk", () => {
      const noMerfolk = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Silvergill Mentor"] } });
      expect(() => cast(noMerfolk, "Silvergill Mentor")).toThrow();
      let s = scenario({ p1: { battlefield: lands("Island", 4), hand: ["Silvergill Mentor"] } });
      s = settle(cast(s, "Silvergill Mentor"));
      expect(idsOf(s, "p1", "battlefield", "Island").every((id) => s.objects[id]?.tapped)).toBe(true);
      const token = idOf(s, "p1", "battlefield", "Merfolk");
      expect(chars(s, token).colors).toEqual(["W", "U"]);
      // Another Merfolk in hand or on the battlefield: {1}{U} is enough.
      for (const side of [
        { battlefield: lands("Island", 2), hand: ["Silvergill Mentor", "Silvergill Peddler"] },
        { battlefield: [...lands("Island", 2), "Silvergill Peddler"], hand: ["Silvergill Mentor"] },
      ]) {
        const t = settle(cast(scenario({ p1: side }), "Silvergill Mentor"));
        expect(idsOf(t, "p1", "battlefield", "Silvergill Mentor")).toHaveLength(1);
      }
    });

    it("Wanderwine Farewell: returns two permanents; with a Merfolk, a Merfolk token per permanent returned", () => {
      const run = (merfolk: boolean) => {
        let s = scenario({
          p1: { battlefield: [...lands("Island", 7), ...(merfolk ? ["Silvergill Peddler"] : [])], hand: ["Wanderwine Farewell"] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        const targets = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Bear Cub")];
        s = settle(cast(s, "Wanderwine Farewell", { targets: { t: targets } }));
        expect(s.players.p2?.hand).toHaveLength(2);
        return idsOf(s, "p1", "battlefield", "Merfolk").length;
      };
      expect(run(true)).toBe(2);
      expect(run(false)).toBe(0);
    });
  });

  describe("Vivid", () => {
    it("Rime Chill: {1} less per color; taps two creatures with a stun counter, draw a card", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 4), "Kulrath Mystic", "Bear Cub", "Fire Elemental"], hand: ["Rime Chill"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const targets = [idOf(s, "p2", "battlefield", "Serra Angel"), idOf(s, "p2", "battlefield", "Llanowar Elves")];
      s = settle(cast(s, "Rime Chill", { targets: { t: targets } }));
      for (const id of targets) {
        expect(s.objects[id]?.tapped).toBe(true);
        expect(s.objects[id]?.counters.stun).toBe(1);
      }
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Shinestriker: draw a card per color among your permanents", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 6), "Bear Cub", "Fire Elemental"], hand: ["Shinestriker"] } });
      s = settle(cast(s, "Shinestriker"));
      // Blue (Shinestriker), green, red.
      expect(s.players.p1?.hand).toHaveLength(3);
    });
  });

  it("Temporal Cleansing: the owner puts the permanent second from the top, or on the bottom", () => {
    const run = (where: "top" | "bottom", stolen = false) => {
      let s = scenario({
        p1: { battlefield: lands("Island", 4), hand: ["Temporal Cleansing"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      // Stolen by p1: it's still its owner, p2, who chooses.
      if (stolen) steal(s, angel, "p1");
      s = cast(s, "Temporal Cleansing", { targets: { t: [angel] } });
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      const p = s.pending;
      if (p?.kind !== "choice" || p.request.intent !== "topOrBottom") throw new Error("choix attendu");
      expect(p.player).toBe("p2");
      s = settle(act(s, p.player, { type: "choose", values: [where] }));
      expect(s.battlefield.some((id) => nameOf(s, id) === "Serra Angel")).toBe(false);
      return (s.players.p2?.library ?? []).findIndex((id) => nameOf(s, id) === "Serra Angel");
    };
    expect(run("top")).toBe(1);
    expect(run("bottom")).toBe(10);
    expect(run("bottom", true)).toBe(10);
  });

  it("Thirst for Identity: draw three cards, then discard a creature card or two cards", () => {
    const run = (library: string[], discard: string[]) => {
      let s = scenario({ p1: { battlefield: lands("Island", 3), hand: ["Thirst for Identity"], library } });
      s = cast(s, "Thirst for Identity");
      s = untilChoiceOrIdle(s);
      const ids = (s.players.p1?.hand ?? []).filter((id) => discard.includes(nameOf(s, id) ?? "")).slice(0, discard.length);
      s = chooseWanted(s, ids);
      return s.players.p1?.hand.length;
    };
    expect(run(["Bear Cub", "Forest", "Forest"], ["Bear Cub"])).toBe(2);
    expect(run(["Forest", "Island", "Forest"], ["Forest", "Forest"])).toBe(1);
  });

  it("Unwelcome Sprite: a spell cast during an opponent's turn triggers surveil 2", () => {
    let s = scenario({
      p1: { battlefield: ["Unwelcome Sprite", "Island"], hand: ["Opt"], library: ["Forest", "Forest", "Forest", "Forest"] },
      active: "p2",
    });
    s = act(s, "p2", { type: "pass" });
    s = untilChoiceOrIdle(cast(s, "Opt"));
    let surveil = false;
    for (let i = 0; i < 6 && s.pending?.kind === "choice"; i++) {
      if (s.pending.request.intent.startsWith("surveil")) surveil = true;
      s = untilChoiceOrIdle(act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested }));
    }
    expect(surveil).toBe(true);
  });

  it("Mirrorform: each of your nonland permanents becomes a copy of the targeted permanent", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 6), "Bear Cub", "Fishing Pole"], hand: ["Mirrorform"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const pole = idOf(s, "p1", "battlefield", "Fishing Pole");
    s = settle(cast(s, "Mirrorform", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    for (const id of [bear, pole]) {
      expect(chars(s, id).name).toBe("Serra Angel");
      expect(pt(s, id)).toEqual([4, 4]);
    }
    expect(chars(s, idOf(s, "p1", "battlefield", "Island")).name).toBe("Island");
  });

  describe("Sygg", () => {
    it("unblockable; on entering, a creature draws a card when it deals combat damage to a player", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: [SYGG] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = chooseWanted(cast(s, SYGG), [bear]);
      const sygg = idOf(s, "p1", "battlefield", SYGG);
      expect(chars(s, sygg).keywords).toContain("unblockable");
      s = attack(s, [bear]);
      s = advanceUntil(s, (x) => x.turn.step === "end" || x.turn.active === "p2");
      expect(s.players.p2?.life).toBe(18);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("the chosen creature also draws when damaging a planeswalker", () => {
      let s = scenario({ p1: { battlefield: [...lands("Island", 2), "Bear Cub"], hand: [SYGG] }, p2: { battlefield: [WALKER] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = chooseWanted(cast(s, SYGG), [bear]);
      s = attackWalker(s, [bear]);
      s = advanceUntil(s, (x) => x.turn.step === "end" || x.turn.active === "p2");
      expect(s.players.p2?.life).toBe(20);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("paying {W} at the beginning of the main phase transforms it; the chosen creature gains protection from each color", () => {
      let s = scenario({
        p1: { battlefield: [SYGG, "Plains", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
        step: "draw",
      });
      const sygg = idOf(s, "p1", "battlefield", SYGG);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = chooseWanted(
        passAccepting(s, (x) => x.pending?.kind === "choice"),
        [1, bear],
      );
      expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
      expect(chars(s, sygg).name).toBe("Sygg, Wanderbrine Shield");
      expect(chars(s, sygg).keywords).toContain("unblockable");
      expect(chars(s, bear).protections?.length ?? 0).toBeGreaterThan(0);
    });
  });
});

describe("Lorwyn Eclipsed, batch A — black", () => {
  /**
   * Lorwyn Eclipsed, batch A — black cards: each card with non-trivial behavior is checked against its Oracle text
   * (plan R, batch R7). Blight as an effect ("you may blight N; if you do…"), −1/−1 counters, Vivid,
   * behold or pay (Mudbutton Cursetosser), "when it dies this turn" emblem (Scarblade's Malice).
   */
  type S = GameState;
  type Answer = (req: ChoiceRequest, player: string) => ChoiceValue[] | undefined;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const counters = (s: S, id: string, kind = "-1/-1") => s.objects[id]?.counters[kind] ?? 0;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  /** Passes and answers choices (suggested answer by default) until the stack is empty, with no pending trigger. */
  const settle = (s: S, answer: Answer = () => undefined): S => {
    let cur = s;
    for (let i = 0; i < 300; i++) {
      const p = cur.pending;
      if (p?.kind === "priority" && cur.stack.length === 0 && cur.triggers.length === 0 && i > 0) break;
      if (p?.kind === "priority") cur = act(cur, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        cur = act(cur, p.player, { type: "choose", values: answer(p.request, p.player) ?? p.request.suggested });
      else break;
    }
    return cur;
  };
  /** Answers: fixed yes/no, and the wanted objects when they are among the options. */
  const answers =
    (opts: { yes?: boolean; want?: string[] }): Answer =>
    (req) => {
      if (req.type === "yesNo" && opts.yes !== undefined) return [opts.yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = (opts.want ?? []).filter((w) => req.options.includes(w));
        if (picked.length > 0) return picked.slice(0, req.max ?? picked.length);
      }
      return undefined;
    };
  const cast = (s: S, player: string, name: string, extra: object = {}) =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  /** Destroys the permanents (ordinary rules), then passes to put the triggers on the stack. */
  const kill = (s: S, ...ids: string[]) => {
    simultaneously(s, () => {
      for (const id of ids) destroy(s, id);
    });
    return act(s, s.pending?.kind === "priority" ? s.pending.player : "p1", { type: "pass" });
  };
  const setCounters = (s: S, id: string, kind: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters[kind] = n;
    s.version += 1;
  };

  describe("Marqueurs −1/−1", () => {
    it("Blight Rot: four −1/−1 counters on the targeted creature", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Blight Rot"] }, p2: { battlefield: ["Pelakka Wurm"] } });
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Blight Rot", { targets: { t: [wurm] } }));
      expect(counters(s, wurm)).toBe(4);
      expect(pt(s, wurm)).toEqual([3, 3]);
    });

    it("Darkness Descends: two −1/−1 counters on each creature, on both sides", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 4), "Bear Cub"], hand: ["Darkness Descends"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "p1", "Darkness Descends"));
      expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(counters(s, angel)).toBe(2);
      expect(pt(s, angel)).toEqual([2, 2]);
    });

    it("Bile-Vial Boggart: when it dies, a −1/−1 counter on up to one targeted creature", () => {
      let s = scenario({ p1: { battlefield: ["Bile-Vial Boggart"] }, p2: { battlefield: ["Serra Angel"] } });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(kill(s, idOf(s, "p1", "battlefield", "Bile-Vial Boggart")), answers({ want: [angel] }));
      expect(counters(s, angel)).toBe(1);
      expect(pt(s, angel)).toEqual([3, 3]);
    });

    it("Nightmare Sower: a spell cast during an opponent's turn puts a −1/−1 counter; during yours, nothing", () => {
      let s = scenario({
        p1: { battlefield: ["Nightmare Sower", "Island", "Island"], hand: ["Opt", "Opt"] },
        p2: { battlefield: ["Serra Angel"] },
        active: "p2",
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = act(s, "p2", { type: "pass" });
      s = settle(cast(s, "p1", "Opt"), answers({ want: [angel] }));
      expect(counters(s, angel)).toBe(1);
      let t = scenario({
        p1: { battlefield: ["Nightmare Sower", "Island"], hand: ["Opt"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      t = settle(cast(t, "p1", "Opt"));
      expect(counters(t, idOf(t, "p2", "battlefield", "Serra Angel"))).toBe(0);
    });

    it("Creakwood Safewright: enters with three counters; at your end step, removes one if there is an Elf in the graveyard", () => {
      const run = (graveyard: string[]) => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Creakwood Safewright"], graveyard } });
        s = settle(cast(s, "p1", "Creakwood Safewright"));
        const elf = idOf(s, "p1", "battlefield", "Creakwood Safewright");
        expect(counters(s, elf)).toBe(3);
        expect(pt(s, elf)).toEqual([2, 2]);
        s = advanceUntil(s, (x) => x.turn.active === "p2");
        return counters(s, elf);
      };
      expect(run(["Llanowar Elves"])).toBe(2);
      expect(run(["Bear Cub"])).toBe(3);
    });

    it("Heirloom Auntie: enters with two counters; another of your creatures dies: surveil 1, then a counter removed", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), "Bear Cub"], hand: ["Heirloom Auntie"], library: ["Opt", "Forest"] },
      });
      s = settle(cast(s, "p1", "Heirloom Auntie"));
      const auntie = idOf(s, "p1", "battlefield", "Heirloom Auntie");
      expect(pt(s, auntie)).toEqual([2, 2]);
      const top = s.players.p1?.library[0] as string;
      const topName = nameOf(s, top);
      s = settle(kill(s, idOf(s, "p1", "battlefield", "Bear Cub")), (req) =>
        req.type === "pick" && req.options.includes(top) ? [top] : undefined,
      );
      expect(counters(s, auntie)).toBe(1);
      expect(pt(s, auntie)).toEqual([3, 3]);
      // The surveilled card was put into the graveyard.
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toEqual(expect.arrayContaining(["Bear Cub", topName]));
      expect(s.players.p1?.graveyard).toHaveLength(2);
    });

    it("Gnarlbark Elm: {2}{B}, remove two counters: −2/−2 to a creature; with no counters, no more activation", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 6), hand: ["Gnarlbark Elm"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Gnarlbark Elm"));
      const elm = idOf(s, "p1", "battlefield", "Gnarlbark Elm");
      expect(pt(s, elm)).toEqual([1, 2]);
      const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === elm);
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = settle(
        act(s, "p1", { type: "activate", source: elm, ability: a?.type === "activate" ? a.ability : -1, targets: { t: [bear] } }),
      );
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(counters(s, elm)).toBe(0);
      expect(pt(s, elm)).toEqual([3, 4]);
      expect(legalActions(s, "p1").some((x) => x.type === "activate" && x.source === elm)).toBe(false);
    });

    it("Retched Wretch: dying with a −1/−1 counter, it returns without abilities; with no counter, it stays in the graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Retched Wretch"] } });
      const wretch = idOf(s, "p1", "battlefield", "Retched Wretch");
      setCounters(s, wretch, "-1/-1", 1);
      s = settle(kill(s, wretch));
      const back = idOf(s, "p1", "battlefield", "Retched Wretch");
      expect(counters(s, back)).toBe(0);
      expect(chars(s, back).abilities).toHaveLength(0);
      // Without abilities, it no longer returns.
      setCounters(s, back, "-1/-1", 1);
      s = settle(kill(s, back));
      expect(idsOf(s, "p1", "graveyard", "Retched Wretch")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Retched Wretch"] } });
      t = settle(kill(t, idOf(t, "p1", "battlefield", "Retched Wretch")));
      expect(idsOf(t, "p1", "battlefield", "Retched Wretch")).toHaveLength(0);
      expect(idsOf(t, "p1", "graveyard", "Retched Wretch")).toHaveLength(1);
    });
  });

  describe("Blight as an effect", () => {
    it("Blighted Blackthorn: on entering, blight 2 (chosen creature) draws a card and loses 1 life", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 5), "Pelakka Wurm"], hand: ["Blighted Blackthorn"] } });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Blighted Blackthorn"), answers({ yes: true, want: [wurm] }));
      expect(counters(s, wurm)).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Blighted Blackthorn: without blight, neither draw nor life loss", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Blighted Blackthorn"] } });
      s = settle(cast(s, "p1", "Blighted Blackthorn"), answers({ yes: false }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Blighted Blackthorn"))).toBe(0);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.life).toBe(20);
    });

    it("Blighted Blackthorn: also triggers when it attacks", () => {
      let s = scenario({ p1: { battlefield: ["Blighted Blackthorn"] } });
      const thorn = idOf(s, "p1", "battlefield", "Blighted Blackthorn");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: thorn, defender: "p2" }] });
      s = settle(s, answers({ yes: true }));
      expect(counters(s, thorn)).toBe(2);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Boggart Mischief: blight 1 creates two Goblins; a Goblin that dies drains 1 life", () => {
      let s = scenario({ p1: { battlefield: [...lands("Swamp", 3), "Pelakka Wurm"], hand: ["Boggart Mischief"] } });
      const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Boggart Mischief"), answers({ yes: true, want: [wurm] }));
      expect(counters(s, wurm)).toBe(1);
      const goblins = idsOf(s, "p1", "battlefield", "Goblin");
      expect(goblins).toHaveLength(2);
      expect(chars(s, goblins[0] as string).colors).toEqual(expect.arrayContaining(["B", "R"]));
      s = settle(kill(s, goblins[0] as string));
      expect(s.players.p2?.life).toBe(19);
      expect(s.players.p1?.life).toBe(21);
      // A non-Goblin creature that dies: nothing.
      s = settle(kill(s, wurm));
      expect(s.players.p2?.life).toBe(19);
    });

    it("Dream Seizer: blight 1 makes each opponent discard; otherwise, nothing", () => {
      const run = (yes: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Dream Seizer"] }, p2: { hand: ["Opt", "Forest"] } });
        s = settle(cast(s, "p1", "Dream Seizer"), answers({ yes }));
        return { hand: s.players.p2?.hand.length, seizer: counters(s, idOf(s, "p1", "battlefield", "Dream Seizer")) };
      };
      expect(run(true)).toEqual({ hand: 1, seizer: 1 });
      expect(run(false)).toEqual({ hand: 2, seizer: 0 });
    });

    it("Gutsplitter Gang: at the beginning of your first main phase, blight 2 or lose 3 life", () => {
      const run = (yes: boolean) => {
        let s = scenario({ p1: { battlefield: ["Gutsplitter Gang"] }, step: "draw" });
        for (let i = 0; i < 4 && s.turn.step === "draw" && s.pending?.kind === "priority"; i++)
          s = act(s, s.pending.player, { type: "pass" });
        s = settle(s, answers({ yes }));
        expect(s.turn.step).toBe("main1");
        return { life: s.players.p1?.life, counters: counters(s, idOf(s, "p1", "battlefield", "Gutsplitter Gang")) };
      };
      expect(run(true)).toEqual({ life: 20, counters: 2 });
      expect(run(false)).toEqual({ life: 17, counters: 0 });
    });

    it("Dose of Dawnglow: during your main phase, no blight; during the opponent's turn, blight 2", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Dose of Dawnglow"], graveyard: ["Pelakka Wurm"] } });
      s = settle(cast(s, "p1", "Dose of Dawnglow", { targets: { t: [idOf(s, "p1", "graveyard", "Pelakka Wurm")] } }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Pelakka Wurm"))).toBe(0);
      let t = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Dose of Dawnglow"], graveyard: ["Pelakka Wurm"] },
        active: "p2",
      });
      t = act(t, "p2", { type: "pass" });
      t = settle(cast(t, "p1", "Dose of Dawnglow", { targets: { t: [idOf(t, "p1", "graveyard", "Pelakka Wurm")] } }));
      expect(counters(t, idOf(t, "p1", "battlefield", "Pelakka Wurm"))).toBe(2);
    });
  });

  describe("Other cards", () => {
    it("Auntie's Sentence: you choose a nonland permanent card from the opponent's hand, which they discard", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Auntie's Sentence"] },
        p2: { hand: ["Forest", "Opt", "Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "hand", "Serra Angel");
      const forest = idOf(s, "p2", "hand", "Forest");
      const opt = idOf(s, "p2", "hand", "Opt");
      let seen = false;
      s = settle(cast(s, "p1", "Auntie's Sentence", { mode: 0, targets: { p: ["p2"] } }), (req, player) => {
        if (req.type === "pick" && req.options.includes(angel)) {
          seen = true;
          expect(player).toBe("p1");
          expect(req.options).not.toContain(forest);
          expect(req.options).not.toContain(opt);
          return [angel];
        }
        return undefined;
      });
      expect(seen).toBe(true);
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.hand).toHaveLength(3);
    });

    it("Auntie's Sentence: -2/-2 until end of turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Auntie's Sentence"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "p1", "Auntie's Sentence", { mode: 1, targets: { c: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Bitterbloom Bearer: at your upkeep, you lose 1 life and create a 1/1 blue and black Faerie with flying", () => {
      let s = scenario({ p1: { battlefield: ["Bitterbloom Bearer"] } });
      expect(idsOf(s, "p1", "battlefield", "Faerie")).toHaveLength(0);
      s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
      expect(s.players.p1?.life).toBe(19);
      const faeries = idsOf(s, "p1", "battlefield", "Faerie");
      expect(faeries).toHaveLength(1);
      const c = chars(s, faeries[0] as string);
      expect([c.power, c.toughness]).toEqual([1, 1]);
      expect(c.colors).toEqual(expect.arrayContaining(["U", "B"]));
      expect(c.keywords).toContain("flying");
    });

    it("Dawnhand Eulogist: mill 3; with an Elf in the graveyard, each opponent loses 2 life and you gain 2", () => {
      const run = (library: string[]) => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Dawnhand Eulogist"], library } });
        s = settle(cast(s, "p1", "Dawnhand Eulogist"));
        expect(s.players.p1?.graveyard).toHaveLength(3);
        return [s.players.p1?.life, s.players.p2?.life];
      };
      expect(run(["Forest", "Llanowar Elves", "Forest"])).toEqual([22, 18]);
      expect(run(["Forest", "Forest", "Forest"])).toEqual([20, 20]);
    });

    it("Gloom Ripper: X = Elves you control + Elf cards in your graveyard", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 5), "Llanowar Elves", "Bear Cub"],
          hand: ["Gloom Ripper"],
          graveyard: ["Llanowar Elves"],
        },
        p2: { battlefield: ["Pelakka Wurm"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Gloom Ripper"), answers({ want: [bear, wurm] }));
      // Llanowar Elves and Gloom Ripper on the battlefield, an Elf card in the graveyard: X = 3.
      expect(pt(s, bear)).toEqual([5, 2]);
      expect(pt(s, wurm)).toEqual([7, 4]);
    });

    it("Graveshifter: changeling; on entering, a creature card from your graveyard returns to hand", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Graveshifter"], graveyard: ["Serra Angel"] } });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      s = settle(cast(s, "p1", "Graveshifter"), answers({ yes: true, want: [angel] }));
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(0);
      const shifter = idOf(s, "p1", "battlefield", "Graveshifter");
      expect(chars(s, shifter).keywords).toContain("changeling");
    });

    it('Graveshifter: the card is targeted when put on the stack ("target"), the return is optional on resolution', () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Graveshifter"], graveyard: ["Serra Angel"] } });
      const angel = idOf(s, "p1", "graveyard", "Serra Angel");
      s = cast(s, "p1", "Graveshifter");
      for (let i = 0; i < 20 && s.pending?.kind === "priority"; i++) s = act(s, s.pending.player, { type: "pass" });
      // The "you may" question: the ability, still on the stack, already targets the card (chosen when put on the stack).
      expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("yesNo");
      const item = s.stack.find((i) => i.kind === "ability" && s.defs[i.sourceDefId]?.name === "Graveshifter");
      expect(Object.values(item?.targets ?? {}).flat()).toEqual([angel]);
      s = settle(s, answers({ yes: false }));
      expect(idsOf(s, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(0);
    });

    it("Moonglove Extractor: when it attacks, you draw a card and lose 1 life", () => {
      let s = scenario({ p1: { battlefield: ["Moonglove Extractor"] } });
      const ex = idOf(s, "p1", "battlefield", "Moonglove Extractor");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: ex, defender: "p2" }] });
      s = settle(s);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.life).toBe(19);
    });

    it("Boggart Prankster: when you attack, an attacking Goblin you control gets +1/+0", () => {
      let s = scenario({ p1: { battlefield: ["Boggart Prankster"] } });
      const gob = idOf(s, "p1", "battlefield", "Boggart Prankster");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: gob, defender: "p2" }] });
      s = settle(s, answers({ want: [gob] }));
      expect(pt(s, gob)).toEqual([2, 3]);
    });

    it("Mudbutton Cursetosser: {B} by beholding a Goblin, otherwise {2}{B}; can't block; when it dies, destroys an opposing creature with power 2 or less", () => {
      const withGoblin = scenario({ p1: { battlefield: ["Swamp", "Boggart Prankster"], hand: ["Mudbutton Cursetosser"] } });
      expect(() => cast(withGoblin, "p1", "Mudbutton Cursetosser")).not.toThrow();
      const alone = scenario({ p1: { battlefield: ["Swamp", "Swamp"], hand: ["Mudbutton Cursetosser"] } });
      expect(() => cast(alone, "p1", "Mudbutton Cursetosser")).toThrow();
      let s = scenario({ p1: { battlefield: lands("Swamp", 3), hand: ["Mudbutton Cursetosser"] } });
      s = settle(cast(s, "p1", "Mudbutton Cursetosser"));
      expect(idsOf(s, "p1", "battlefield", "Swamp").every((id) => s.objects[id]?.tapped)).toBe(true);
      const mud = idOf(s, "p1", "battlefield", "Mudbutton Cursetosser");
      expect(chars(s, mud).keywords).toContain("cantBlock");

      let t = scenario({ p1: { battlefield: ["Mudbutton Cursetosser"] }, p2: { battlefield: ["Bear Cub", "Serra Angel"] } });
      const bear = idOf(t, "p2", "battlefield", "Bear Cub");
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      let sawAngel = false;
      t = settle(kill(t, idOf(t, "p1", "battlefield", "Mudbutton Cursetosser")), (req) => {
        if (req.type === "pick" && req.options.includes(bear)) {
          sawAngel = req.options.includes(angel);
          return [bear];
        }
        return undefined;
      });
      expect(sawAngel).toBe(false);
      expect(idsOf(t, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("Nameless Inversion: +3/-3 and loses all creature types until end of turn", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Nameless Inversion"] },
        p2: { battlefield: ["Pelakka Wurm", "Graveshifter"] },
      });
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      s = settle(cast(s, "p1", "Nameless Inversion", { targets: { t: [wurm] } }));
      expect(pt(s, wurm)).toEqual([10, 4]);
      expect(chars(s, wurm).subtypes).toHaveLength(0);
      expect(chars(s, wurm).types).toContain("Creature");
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(chars(s, wurm).subtypes).toContain("Wurm");
    });

    it("Nameless Inversion: a targeted changeling also loses all its creature types", () => {
      const changeling = customCard({
        name: "Changelin de test",
        typeLine: "Creature — Shapeshifter",
        subtypes: ["Shapeshifter"],
        keywords: ["changeling"],
        power: 1,
        toughness: 5,
      });
      let s = scenario({
        p1: { battlefield: lands("Swamp", 2), hand: ["Nameless Inversion"] },
        p2: { battlefield: [changeling] },
      });
      const c = idOf(s, "p2", "battlefield", changeling.name);
      const goblins = (x: S) => matchesObjectFilter(x, "p2", c, { subtype: "Goblin" });
      expect(goblins(s)).toBe(true);
      s = settle(cast(s, "p1", "Nameless Inversion", { targets: { t: [c] } }));
      expect(pt(s, c)).toEqual([4, 2]);
      expect(goblins(s)).toBe(false);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(goblins(s)).toBe(true);
    });

    it("Perfect Intimidation: both modes — the opponent exiles two cards from their hand, all counters removed", () => {
      let s = scenario({
        p1: { battlefield: lands("Swamp", 4), hand: ["Perfect Intimidation"] },
        p2: { battlefield: ["Pelakka Wurm"], hand: ["Opt", "Forest", "Bear Cub"] },
      });
      const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
      setCounters(s, wurm, "+1/+1", 2);
      setCounters(s, wurm, "stun", 1);
      s = settle(cast(s, "p1", "Perfect Intimidation", { mode: 2, targets: { p: ["p2"], c: [wurm] } }));
      expect(s.players.p2?.hand).toHaveLength(1);
      expect(s.players.p2?.graveyard).toHaveLength(0);
      expect(s.exile.filter((id) => s.objects[id]?.owner === "p2")).toHaveLength(2);
      expect(Object.values(s.objects[wurm]?.counters ?? {}).every((n) => n === 0)).toBe(true);
      expect(pt(s, wurm)).toEqual([7, 7]);
    });

    it("Scarblade's Malice: deathtouch and lifelink; if the creature dies this turn, a 2/2 Elf token", () => {
      let s = scenario({ p1: { battlefield: ["Swamp", "Bear Cub", "Llanowar Elves"], hand: ["Scarblade's Malice"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(cast(s, "p1", "Scarblade's Malice", { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["deathtouch", "lifelink"]));
      // Another creature that dies: no token.
      s = settle(kill(s, idOf(s, "p1", "battlefield", "Llanowar Elves")));
      expect(idsOf(s, "p1", "battlefield", "Elf")).toHaveLength(0);
      s = settle(kill(s, bear));
      const elves = idsOf(s, "p1", "battlefield", "Elf");
      expect(elves).toHaveLength(1);
      expect(pt(s, elves[0] as string)).toEqual([2, 2]);
      expect(chars(s, elves[0] as string).colors).toEqual(expect.arrayContaining(["B", "G"]));
    });

    it("Shimmercreep: Vivid — each opponent loses X life and you gain X (colors among your permanents)", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 5), "Bear Cub", "Serra Angel"], hand: ["Shimmercreep"] },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      s = settle(cast(s, "p1", "Shimmercreep"));
      // Black (Shimmercreep), green and white; the opposing red doesn't count.
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(23);
      expect(nameOf(s, idOf(s, "p1", "battlefield", "Shimmercreep"))).toBe("Shimmercreep");
    });
  });
});

describe("Lorwyn Eclipsed, batch A — red", () => {
  /**
   * Lorwyn Eclipsed, batch A — red cards: each test checks the Oracle text (damage, counters, zones,
   * characteristics), by playing through decisions.
   */
  type S = GameState;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
  const waitChoice = (s: S) =>
    passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const counters = (s: S, id: string, kind = "-1/-1") => s.objects[id]?.counters[kind] ?? 0;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const castable = (s: S, card: string) => legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card);
  /**
   * Answers pending choices: each `pick` takes, in order, the values of `want` that are among the options
   * (they are then consumed), otherwise the suggestion; `yesNo` answers `yes`.
   */
  const answer = (s: S, want: string[] = [], yes = true) => {
    const queue = [...want];
    let cur = waitChoice(s);
    for (let i = 0; i < 12 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      const r = p.request;
      let values: ChoiceValue[] = r.suggested;
      if (r.type === "yesNo") values = [yes ? 1 : 0];
      else if (r.type === "pick") {
        const picked = queue.filter((w) => r.options.includes(w)).slice(0, r.max);
        for (const w of picked) queue.splice(queue.indexOf(w), 1);
        if (picked.length > 0) values = picked;
      }
      cur = waitChoice(act(cur, p.player, { type: "choose", values }));
    }
    return settle(cur);
  };
  const activate = (s: S, source: string, extra: Record<string, unknown> = {}) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
    if (a?.type !== "activate") throw new Error("ability not offered");
    return act(s, "p1", { type: "activate", source, ability: a.ability, ...extra });
  };
  /** Exiled cards that p1 can play (land or spell). */
  const playableFromExile = (s: S) =>
    legalActions(s, "p1")
      .filter((a) => (a.type === "playLand" || a.type === "cast") && s.objects[a.card]?.zone === "exile")
      .map((a) => (a.type === "playLand" || a.type === "cast" ? a.card : ""));

  it("Boulder Dash: 2 damage to one target and 1 to another target; the same target twice is refused", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Boulder Dash"] }, p2: { battlefield: ["Bear Cub"] } });
    const card = idOf(s, "p1", "hand", "Boulder Dash");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => act(s, "p1", { type: "cast", card, targets: { a: [bear], b: [bear] } })).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, targets: { a: [bear], b: ["p2"] } }));
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p2?.life).toBe(19);
  });

  it("Brambleback Brute: enters with two −1/−1 counters; {1}{R} and a counter removed: a creature can't block", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 5), hand: ["Brambleback Brute"] },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Brambleback Brute") }));
    const brute = idOf(s, "p1", "battlefield", "Brambleback Brute");
    expect(counters(s, brute)).toBe(2);
    expect(pt(s, brute)).toEqual([2, 3]);
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(activate(s, brute, { targets: { t: [bear] } }));
    expect(counters(s, brute)).toBe(1);
    expect(pt(s, brute)).toEqual([3, 4]);
    expect(chars(s, bear).keywords).toContain("cantBlock");
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(chars(s, bear).keywords).not.toContain("cantBlock");
  });

  it("Burning Curiosity: exiles two playable cards; with blight 1, three cards", () => {
    const run = (kicked: boolean) => {
      let s = scenario({
        p1: { battlefield: [...lands("Mountain", 3), "Pelakka Wurm"], hand: ["Burning Curiosity"], library: lands("Island", 6) },
      });
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Burning Curiosity"), kicked }));
      return {
        exiled: s.exile.filter((id) => nameOf(s, id) === "Island").length,
        playable: playableFromExile(s).length,
        blight: counters(s, idOf(s, "p1", "battlefield", "Pelakka Wurm")),
      };
    };
    expect(run(false)).toEqual({ exiled: 2, playable: 2, blight: 0 });
    expect(run(true)).toEqual({ exiled: 3, playable: 3, blight: 1 });
  });

  it("Cinder Strike: 2 damage, or 4 if the additional cost (blight 1) was paid", () => {
    const run = (kicked: boolean) => {
      let s = scenario({
        p1: { battlefield: ["Mountain", "Pelakka Wurm"], hand: ["Cinder Strike"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cinder Strike"), kicked, targets: { t: [angel] } }));
      return { damage: s.objects[angel]?.damage ?? "mort", wurm: counters(s, idOf(s, "p1", "battlefield", "Pelakka Wurm")) };
    };
    expect(run(false)).toEqual({ damage: 2, wurm: 0 });
    expect(run(true)).toEqual({ damage: "mort", wurm: 1 });
  });

  it("Collective Inferno: damage from your sources of the chosen type is doubled, not that of the others", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 9), "Sting-Slinger", "Fire Elemental"],
        hand: ["Collective Inferno", "Boulder Dash"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    s = answer(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Collective Inferno") }), ["Goblin"]);
    const inferno = idOf(s, "p1", "battlefield", "Collective Inferno");
    expect(s.objects[inferno]?.chosen?.creatureType).toBe("Goblin");
    // Sting-Slinger (Goblin): 2 damage doubled; the blight counter goes on the Fire Elemental.
    s = settle(activate(s, idOf(s, "p1", "battlefield", "Sting-Slinger")));
    expect(s.players.p2?.life).toBe(16);
    // Boulder Dash is not a Goblin: 2 and 1 damage, not doubled.
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Boulder Dash"), targets: { a: ["p2"], b: [bear] } }));
    expect(s.players.p2?.life).toBe(14);
    expect(s.objects[bear]?.damage).toBe(1);
  });

  it("End-Blaze Epiphany: X damage; if the creature dies this turn, exiles as many cards as its power, one playable", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["End-Blaze Epiphany"], library: ["Opt", ...lands("Island", 5)] },
      p2: { battlefield: ["Bear Cub", "Serra Angel"] },
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    // Power 2: two cards exiled (Opt and an Island); the card is chosen as the ability resolves (PLAN-M M8a), and only
    // that one can be played.
    let offered: (string | undefined)[] = [];
    s = settleAnswering(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "End-Blaze Epiphany"), x: 3, targets: { t: [bear] } }),
      (req, _p, cur) => {
        if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
        offered = namesIn(cur, req.options).sort();
        return pickNamed(cur, req, "Island");
      },
    );
    expect(offered).toEqual(["Island", "Opt"]);
    expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    const island = s.exile.find((id) => nameOf(s, id) === "Island") as string;
    expect(playableFromExile(s)).toEqual([island]);
    s = act(s, "p1", { type: "playLand", card: island });
    expect(playableFromExile(s)).toHaveLength(0);

    // The creature survives: nothing is exiled.
    let t = scenario({
      p1: { battlefield: lands("Mountain", 2), hand: ["End-Blaze Epiphany"], library: lands("Island", 6) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(t, "p2", "battlefield", "Serra Angel");
    t = answer(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "End-Blaze Epiphany"), x: 1, targets: { t: [angel] } }));
    expect(t.exile.filter((id) => nameOf(t, id) === "Island")).toHaveLength(0);
  });

  it("Enraged Flamecaster: a spell with mana value 4 or more deals 2 damage to each opponent, not a mana value 3 spell", () => {
    const run = (spell: string) => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 5), "Enraged Flamecaster"], hand: [spell] } });
      s = answer(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", spell) }));
      return s.players.p2?.life;
    };
    expect(run("Flamekin Gildweaver")).toBe(18);
    expect(run("Elder Auntie")).toBe(20);
  });

  it("Explosive Prodigy: X damage to an opposing creature, X = colors among your permanents", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Llanowar Elves", "Bear Cub"], hand: ["Explosive Prodigy"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = answer(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Explosive Prodigy") }), [angel]);
    // Green (Elves, Bear Cub) and red (the Prodigy itself): 2.
    expect(s.objects[angel]?.damage).toBe(2);
  });

  it("Feed the Flames: 5 damage; the creature that dies this turn is exiled", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Feed the Flames"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Feed the Flames"), targets: { t: [angel] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(0);
    expect(s.exile.some((id) => nameOf(s, id) === "Serra Angel")).toBe(true);
  });

  it("Giantfall: your creature deals damage equal to its power; or destroys an artifact", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 2), "Brambleback Brute"], hand: ["Giantfall"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const brute = idOf(s, "p1", "battlefield", "Brambleback Brute");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(() =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giantfall"), mode: 0, targets: { a: [angel], b: [brute] } }),
    ).toThrow();
    s = settle(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giantfall"), mode: 0, targets: { a: [brute], b: [angel] } }),
    );
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // Damage dealt by a creature, not combat: the Brute doesn't receive any.
    expect(s.objects[brute]?.damage ?? 0).toBe(0);

    let t = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Giantfall"] }, p2: { battlefield: ["Fishing Pole"] } });
    const pole = idOf(t, "p2", "battlefield", "Fishing Pole");
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Giantfall"), mode: 1, targets: { c: [pole] } }));
    expect(idsOf(t, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
  });

  it("Goatnap: gain control until end of turn, untapped, haste; a Goat (changeling) gets +3/+0", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Goatnap"] },
      p2: { battlefield: [{ name: "Sizzling Changeling", tapped: true }] },
    });
    const goat = idOf(s, "p2", "battlefield", "Sizzling Changeling");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Goatnap"), targets: { t: [goat] } }));
    expect(s.objects[goat]?.controller).toBe("p1");
    expect(s.objects[goat]?.tapped).toBe(false);
    expect(chars(s, goat).keywords).toContain("haste");
    expect(pt(s, goat)).toEqual([6, 2]);
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(s.objects[goat]?.controller).toBe("p2");
    expect(pt(s, goat)).toEqual([3, 2]);

    // A creature that isn't a Goat: no bonus.
    let t = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Goatnap"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(t, "p2", "battlefield", "Bear Cub");
    t = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Goatnap"), targets: { t: [bear] } }));
    expect(pt(t, bear)).toEqual([2, 2]);
  });

  it("Gristle Glutton: {T}, blight 1: discard a card, then draw; with no card in hand, no draw", () => {
    let s = scenario({ p1: { battlefield: ["Gristle Glutton"], hand: ["Shivan Dragon"], library: lands("Island", 3) } });
    const glutton = idOf(s, "p1", "battlefield", "Gristle Glutton");
    s = answer(activate(s, glutton));
    expect(counters(s, glutton)).toBe(1);
    expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);

    let t = scenario({ p1: { battlefield: ["Gristle Glutton", "Pelakka Wurm"], library: lands("Island", 3) } });
    t = answer(activate(t, idOf(t, "p1", "battlefield", "Gristle Glutton")));
    expect(t.players.p1?.hand).toHaveLength(0);
  });

  it("Hexing Squelcher: can't be countered; neither can your spells; your other creatures have ward (2 life)", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 4), hand: ["Hexing Squelcher", "Gristle Glutton"] },
      p2: { battlefield: lands("Island", 2), hand: ["Spell Snare", "Spell Snare"] },
    });
    const snareOn = (x: S) => {
      const snare = idOf(x, "p2", "hand", "Spell Snare");
      return settle(act(x, "p2", { type: "cast", card: snare, targets: { t: [x.stack[0]?.id as string] } }));
    };
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hexing Squelcher") });
    s = snareOn(act(s, "p1", { type: "pass" }));
    expect(idsOf(s, "p1", "battlefield", "Hexing Squelcher")).toHaveLength(1);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Gristle Glutton") });
    s = snareOn(act(s, "p1", { type: "pass" }));
    const glutton = idOf(s, "p1", "battlefield", "Gristle Glutton");
    expect(chars(s, glutton).keywords).toContain("ward");
    expect(chars(s, idOf(s, "p1", "battlefield", "Hexing Squelcher")).keywords).toContain("ward");
  });

  it("Impolite Entrance: trample and haste until end of turn, and draw a card", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", { name: "Bear Cub", sick: true }], hand: ["Impolite Entrance"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Impolite Entrance"), targets: { t: [bear] } }));
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Kindle the Inner Flame: token copy with haste, sacrificed at the end step; flashback by beholding three Elementals", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 4), "Fire Elemental"], hand: ["Kindle the Inner Flame"] },
    });
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kindle the Inner Flame"), targets: { t: [fire] } }));
    const copies = idsOf(s, "p1", "battlefield", "Fire Elemental");
    expect(copies).toHaveLength(2);
    const token = copies.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "battlefield", "Fire Elemental")).toHaveLength(1);

    // Flashback: a single Elemental, can't be cast; three (including a card in hand), can be cast.
    const gy = (hand: string[], battlefield: string[]) =>
      scenario({ p1: { battlefield: [...lands("Mountain", 2), ...battlefield], hand, graveyard: ["Kindle the Inner Flame"] } });
    const one = gy([], ["Fire Elemental"]);
    expect(castable(one, idOf(one, "p1", "graveyard", "Kindle the Inner Flame"))).toBe(false);
    let three = gy(["Flame-Chain Mauler"], ["Fire Elemental", "Enraged Flamecaster"]);
    const kindle = idOf(three, "p1", "graveyard", "Kindle the Inner Flame");
    expect(castable(three, kindle)).toBe(true);
    three = settle(
      act(three, "p1", { type: "cast", card: kindle, targets: { t: [idOf(three, "p1", "battlefield", "Fire Elemental")] } }),
    );
    expect(idsOf(three, "p1", "battlefield", "Fire Elemental")).toHaveLength(2);
    expect(three.exile.some((id) => nameOf(three, id) === "Kindle the Inner Flame")).toBe(true);
  });

  it("Kindle the Inner Flame: the three Elementals are chosen, the cards from the hand revealed (PLAN-L L5)", () => {
    const s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 2), "Fire Elemental", "Enraged Flamecaster"],
        hand: ["Flame-Chain Mauler", "Opt"],
        graveyard: ["Kindle the Inner Flame"],
      },
    });
    const kindle = idOf(s, "p1", "graveyard", "Kindle the Inner Flame");
    const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
    const three = [fire, idOf(s, "p1", "battlefield", "Enraged Flamecaster"), idOf(s, "p1", "hand", "Flame-Chain Mauler")];
    const cast = (behold: string[]) =>
      submit(s, "p1", { type: "cast", card: kindle, targets: { t: [fire] }, picks: { behold } } as never);
    const ok = cast(three);
    expect(ok.events.find((e) => e.type === "reveal")).toMatchObject({ defIds: [s.objects[three[2] as string]?.defId] });
    // The Elementals stay where they are.
    expect(ok.state.players.p1?.hand).toContain(three[2]);
    expect(() => cast(three.slice(0, 2))).toThrow(RulesError);
    expect(() => cast([fire, fire, three[2] as string])).toThrow(RulesError);
    expect(() => cast([...three.slice(0, 2), idOf(s, "p1", "hand", "Opt")])).toThrow(RulesError);
    // Cast from the hand: no behold.
    const h = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Fire Elemental"], hand: ["Kindle the Inner Flame"] } });
    const option = legalActions(h, "p1").find((a) => a.type === "cast" && nameOf(h, a.card) === "Kindle the Inner Flame");
    expect(option?.type === "cast" && (option.picks ?? []).some((p) => p.slot === "behold")).toBe(false);
  });

  it("Kulrath Zealot and Sizzling Changeling: the top card is exiled and playable until the end of your next turn", () => {
    let s = scenario({ p1: { battlefield: lands("Mountain", 6), hand: ["Kulrath Zealot"], library: lands("Island", 4) } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kulrath Zealot") }));
    expect(playableFromExile(s)).toHaveLength(1);

    let t = scenario({
      p1: { battlefield: ["Sizzling Changeling"], library: lands("Island", 4) },
      p2: { battlefield: lands("Mountain", 2), hand: ["Boulder Dash"] },
      active: "p2",
    });
    const changeling = idOf(t, "p1", "battlefield", "Sizzling Changeling");
    t = settle(
      act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Boulder Dash"), targets: { a: [changeling], b: ["p1"] } }),
    );
    expect(idsOf(t, "p1", "graveyard", "Sizzling Changeling")).toHaveLength(1);
    const exiled = t.exile.filter((id) => nameOf(t, id) === "Island");
    expect(exiled).toHaveLength(1);
    // Playable during your next turn.
    t = advanceUntil(t, (x) => x.turn.active === "p1" && x.turn.step === "main1");
    expect(playableFromExile(t)).toEqual(exiled);
  });

  it("Meek Attack: a creature with P + T ≤ 5 from hand enters with haste, sacrificed at the end step", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Meek Attack"], hand: ["Bear Cub", "Serra Angel"] } });
    const angel = idOf(s, "p1", "hand", "Serra Angel");
    s = activate(s, idOf(s, "p1", "battlefield", "Meek Attack"));
    s = waitChoice(s);
    if (s.pending?.kind === "choice" && s.pending.request.type === "pick") {
      expect(s.pending.request.options).not.toContain(angel);
    }
    s = answer(s, [idOf(s, "p1", "hand", "Bear Cub")]);
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).keywords).toContain("haste");
    s = advanceUntil(s, (x) => x.turn.active === "p2");
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(s.players.p1?.hand).toContain(angel);
  });

  it("Reckless Ransacking: +3/+2 until end of turn and a Treasure", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Bear Cub"], hand: ["Reckless Ransacking"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Reckless Ransacking"), targets: { t: [bear] } }));
    expect(pt(s, bear)).toEqual([5, 4]);
    expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
  });

  it("Scuzzback Scrounger: at the beginning of your first main phase, blight 1 gives a Treasure; declining, nothing", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: ["Scuzzback Scrounger", "Pelakka Wurm"] }, step: "upkeep" });
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.turn.step === "main1");
      s = answer(s, [idOf(s, "p1", "battlefield", "Pelakka Wurm")], yes);
      return {
        treasures: idsOf(s, "p1", "battlefield", "Treasure").length,
        wurm: counters(s, idOf(s, "p1", "battlefield", "Pelakka Wurm")),
      };
    };
    expect(run(true)).toEqual({ treasures: 1, wurm: 1 });
    expect(run(false)).toEqual({ treasures: 0, wurm: 0 });
  });

  it("Soulbright Seeker: {2} more without an Elemental to behold; the third resolution of the turn adds {R}{R}{R}{R}", () => {
    const noElemental = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Soulbright Seeker"] } });
    expect(castable(noElemental, idOf(noElemental, "p1", "hand", "Soulbright Seeker"))).toBe(false);
    const withHand = scenario({ p1: { battlefield: ["Mountain"], hand: ["Soulbright Seeker", "Flame-Chain Mauler"] } });
    expect(castable(withHand, idOf(withHand, "p1", "hand", "Soulbright Seeker"))).toBe(true);

    let s = scenario({ p1: { battlefield: [...lands("Mountain", 3), "Soulbright Seeker", "Bear Cub"] } });
    const seeker = idOf(s, "p1", "battlefield", "Soulbright Seeker");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    for (let i = 0; i < 3; i++) s = settle(activate(s, seeker, { targets: { t: [bear] } }));
    expect(chars(s, bear).keywords).toContain("trample");
    expect(s.players.p1?.manaPool.R).toBe(4);
  });

  it("Sourbread Auntie: blight 2 on entering creates two Goblins; declining, none", () => {
    const run = (yes: boolean) => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Pelakka Wurm"], hand: ["Sourbread Auntie"] } });
      s = answer(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sourbread Auntie") }), [], yes);
      return {
        goblins: idsOf(s, "p1", "battlefield", "Goblin").length,
        counters:
          counters(s, idOf(s, "p1", "battlefield", "Pelakka Wurm")) +
          counters(s, idOf(s, "p1", "battlefield", "Sourbread Auntie")),
      };
    };
    expect(run(true)).toEqual({ goblins: 2, counters: 2 });
    expect(run(false)).toEqual({ goblins: 0, counters: 0 });
  });

  it("Sting-Slinger: {1}{R}, {T}, blight 1: 2 damage to each opponent", () => {
    let s = scenario({ p1: { battlefield: [...lands("Mountain", 2), "Sting-Slinger"] }, players: 3 });
    const slinger = idOf(s, "p1", "battlefield", "Sting-Slinger");
    s = settle(activate(s, slinger));
    expect([s.players.p2?.life, s.players.p3?.life]).toEqual([18, 18]);
    expect(counters(s, slinger)).toBe(1);
    expect(s.objects[slinger]?.tapped).toBe(true);
  });

  it("Tweeze: 3 damage to any target; you may discard a card to draw one", () => {
    let s = scenario({
      p1: { battlefield: lands("Mountain", 3), hand: ["Tweeze", "Shivan Dragon"], library: lands("Island", 3) },
    });
    s = answer(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tweeze"), targets: { t: ["p2"] } }), [
      idOf(s, "p1", "hand", "Shivan Dragon"),
    ]);
    expect(s.players.p2?.life).toBe(17);
    expect(idsOf(s, "p1", "graveyard", "Shivan Dragon")).toHaveLength(1);
    expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Island"]);
  });

  it("Warren Torchmaster: at the beginning of combat, blight 1 gives haste to a targeted creature", () => {
    let s = scenario({ p1: { battlefield: ["Warren Torchmaster", "Pelakka Wurm", { name: "Bear Cub", sick: true }] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.turn.step === "declareAttackers");
    expect(s.turn.step).toBe("beginCombat");
    s = answer(s, [wurm, bear]);
    expect(counters(s, wurm)).toBe(1);
    expect(chars(s, bear).keywords).toContain("haste");
  });

  it("Boneclub Berserker, Boldwyr Aggressor: +2/+0 per other Goblin; your other Giants have double strike", () => {
    const s = scenario({
      p1: {
        battlefield: ["Boneclub Berserker", "Elder Auntie", "Sizzling Changeling", "Boldwyr Aggressor", "Brambleback Brute"],
      },
      p2: { battlefield: ["Bear Cub"] },
    });
    // Elder Auntie and the changeling (all types) are Goblins.
    expect(pt(s, idOf(s, "p1", "battlefield", "Boneclub Berserker"))).toEqual([6, 4]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Brambleback Brute")).keywords).toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Sizzling Changeling")).keywords).toContain("doubleStrike");
    expect(chars(s, idOf(s, "p1", "battlefield", "Elder Auntie")).keywords).not.toContain("doubleStrike");
  });

  it("Flamebraider: its mana is used only for Elemental spells", () => {
    const s = scenario({ p1: { battlefield: ["Flamebraider"], hand: ["Flame-Chain Mauler", "Gristle Glutton"] } });
    expect(castable(s, idOf(s, "p1", "hand", "Flame-Chain Mauler"))).toBe(true);
    expect(castable(s, idOf(s, "p1", "hand", "Gristle Glutton"))).toBe(false);
  });

  it("Flamebraider tapped by hand (PLAN-L L3): two restricted mana of the chosen types", () => {
    const s = scenario({ p1: { battlefield: ["Flamebraider"] } });
    const fb = idOf(s, "p1", "battlefield", "Flamebraider");
    const offer = legalActions(s, "p1").find((a) => a.type === "tapForMana" && a.source === fb && a.combination);
    expect(offer?.type === "tapForMana" && offer.amount).toBe(2);
    const t = act(s, "p1", {
      type: "tapForMana",
      source: fb,
      ability: offer?.type === "tapForMana" ? offer.ability : -1,
      colors: ["R", "G"],
    });
    expect(t.players.p1?.restrictedMana?.map((m) => m.type).sort()).toEqual(["G", "R"]);
  });
});

describe("Lorwyn Eclipsed, batch A — green", () => {
  /**
   * Lorwyn Eclipsed, batch A — green cards: Radiance (Aurora Awakener, Bloom Tender, Luminollusk, Prismabasher,
   * Prismatic Undercurrents, Wildvine Pummeler), −1/−1 counters (Bristlebane Battler), behold (Lys Alana Dignitary),
   * Auras, double-faced (Trystan) and cards with non-trivial effects.
   */
  type S = GameState;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
  /** Answers pending choices: picks `want` (at most the maximum asked) among the options, otherwise the suggestion. */
  const chooseWanted = (s: S, want: string[]) => {
    const until = (x: S) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority");
    let cur = passAccepting(s, until);
    for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      const r = p.request;
      const picked = r.type === "pick" ? want.filter((w) => r.options.includes(w)).slice(0, r.max) : wantedName(cur, r, want);
      cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
      cur = passAccepting(cur, until);
    }
    return settle(cur);
  };
  /** Answers "no" to yes/no questions, the suggestion elsewhere. */
  const declineAll = (s: S) => {
    const until = (x: S) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority");
    let cur = passAccepting(s, until);
    for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      cur = act(cur, p.player, { type: "choose", values: p.request.type === "yesNo" ? [0] : p.request.suggested });
      cur = passAccepting(cur, until);
    }
    return settle(cur);
  };
  const cast = (s: S, name: string, extra: Record<string, unknown> = {}) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra } as never);
  const activate = (s: S, source: string, extra: Record<string, unknown> = {}) => {
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === source);
    return act(s, "p1", {
      type: "activate",
      source,
      ability: a?.type === "activate" ? a.ability : -1,
      ...extra,
    } as never);
  };
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const TRYSTAN = "Trystan, Callous Cultivator // Trystan, Penitent Culler";
  const minus = (s: S, id: string) => s.objects[id]?.counters["-1/-1"] ?? 0;

  it("Assert Perfection: +1/+0, then the creature deals damage equal to its power to an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 2).concat("Bear Cub"), hand: ["Assert Perfection"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = settle(cast(s, "Assert Perfection", { targets: { a: [bear], b: [angel] } }));
    expect(pt(s, bear)).toEqual([3, 2]);
    expect(s.objects[angel]?.damage).toBe(3);
    expect(s.players.p2?.life).toBe(20);
    // With no opposing creature targeted: only the bonus.
    let t = scenario({ p1: { battlefield: lands("Forest", 2).concat("Bear Cub"), hand: ["Assert Perfection"] } });
    const b2 = idOf(t, "p1", "battlefield", "Bear Cub");
    t = settle(cast(t, "Assert Perfection", { targets: { a: [b2], b: [] } }));
    expect(pt(t, b2)).toEqual([3, 2]);
  });

  it("Bristlebane Battler: enters with five −1/−1 counters; each other creature that enters removes one", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Bristlebane Battler", "Llanowar Elves"] } });
    s = settle(cast(s, "Bristlebane Battler"));
    const battler = idOf(s, "p1", "battlefield", "Bristlebane Battler");
    expect(minus(s, battler)).toBe(5);
    expect(pt(s, battler)).toEqual([1, 1]);
    expect(chars(s, battler).keywords).toContain("trample");
    s = settle(cast(s, "Llanowar Elves"));
    expect(minus(s, battler)).toBe(4);
    expect(pt(s, battler)).toEqual([2, 2]);
  });

  it("Bristlebane Outrider: +2/+0 only if another creature entered under your control this turn", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Bristlebane Outrider", "Llanowar Elves"] } });
    s = settle(cast(s, "Bristlebane Outrider"));
    const rider = idOf(s, "p1", "battlefield", "Bristlebane Outrider");
    expect(pt(s, rider)).toEqual([3, 5]);
    s = settle(cast(s, "Llanowar Elves"));
    expect(pt(s, rider)).toEqual([5, 5]);
    // Already on the battlefield: a creature that entered this turn is enough; the next turn, the bonus disappears.
    let t = scenario({ p1: { battlefield: ["Bristlebane Outrider", "Forest"], hand: ["Llanowar Elves"] } });
    const r2 = idOf(t, "p1", "battlefield", "Bristlebane Outrider");
    expect(pt(t, r2)).toEqual([3, 5]);
    t = settle(cast(t, "Llanowar Elves"));
    expect(pt(t, r2)).toEqual([5, 5]);
    t = advanceUntil(t, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(t, r2)).toEqual([3, 5]);
  });

  it("Dundoolin Weaver: with three creatures, a permanent card returns to hand; otherwise nothing", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2).concat("Bear Cub", "Llanowar Elves"),
        hand: ["Dundoolin Weaver"],
        graveyard: ["Serra Angel"],
      },
    });
    s = settle(cast(s, "Dundoolin Weaver"));
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    let t = scenario({
      p1: { battlefield: lands("Forest", 2).concat("Bear Cub"), hand: ["Dundoolin Weaver"], graveyard: ["Serra Angel"] },
    });
    t = settle(cast(t, "Dundoolin Weaver"));
    expect(idsOf(t, "p1", "graveyard", "Serra Angel")).toHaveLength(1);
  });

  it("Formidable Speaker: discarding a card fetches a creature; {1}, {T} untaps another permanent", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Formidable Speaker", "Opt"], library: ["Forest", "Serra Angel", "Forest"] },
    });
    const opt = idOf(s, "p1", "hand", "Opt");
    s = chooseWanted(cast(s, "Formidable Speaker"), [opt, idsOf(s, "p1", "battlefield", "Forest")[0] as string]);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    // The ability: a tapped land is untapped.
    let t = scenario({ p1: { battlefield: ["Formidable Speaker", "Forest", { name: "Forest", tapped: true }] } });
    const speaker = idOf(t, "p1", "battlefield", "Formidable Speaker");
    const tappedForest = idsOf(t, "p1", "battlefield", "Forest").find((id) => t.objects[id]?.tapped) as string;
    t = settle(activate(t, speaker, { targets: { t: [tappedForest] } }));
    expect(t.objects[tappedForest]?.tapped).toBe(false);
    expect(t.objects[speaker]?.tapped).toBe(true);
  });

  it("Gilt-Leaf's Embrace: +2/+0; trample and indestructible until end of turn only", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3).concat("Bear Cub"), hand: ["Gilt-Leaf's Embrace"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "Gilt-Leaf's Embrace", { targets: { enchant: [bear] } }));
    expect(pt(s, bear)).toEqual([4, 2]);
    expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "indestructible"]));
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
    expect(pt(s, bear)).toEqual([4, 2]);
    expect(chars(s, bear).keywords).not.toContain("indestructible");
  });

  it("Luminollusk: gains as much life as colors among your permanents", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4).concat("Serra Angel", "Shivan Dragon"), hand: ["Luminollusk"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "Luminollusk"));
    // White, red and green (Luminollusk itself); the opposing Elf doesn't count.
    expect(s.players.p1?.life).toBe(23);
  });

  it("Lys Alana Dignitary: {2} more without an Elf to behold; {G}{G} only with an Elf card in the graveyard", () => {
    const noElf = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Lys Alana Dignitary"] } });
    expect(() => cast(noElf, "Lys Alana Dignitary")).toThrow();
    const rich = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Lys Alana Dignitary"] } });
    const paid = settle(cast(rich, "Lys Alana Dignitary"));
    expect(idsOf(paid, "p1", "battlefield", "Forest").filter((id) => paid.objects[id]?.tapped)).toHaveLength(4);
    // Beholding an Elf from hand: {1}{G} is enough.
    let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Lys Alana Dignitary", "Llanowar Elves"] } });
    s = settle(cast(s, "Lys Alana Dignitary"));
    expect(idsOf(s, "p1", "battlefield", "Lys Alana Dignitary")).toHaveLength(1);
    let u = scenario({ p1: { battlefield: ["Lys Alana Dignitary"] } });
    const d2 = idOf(u, "p1", "battlefield", "Lys Alana Dignitary");
    expect(legalActions(u, "p1").some((a) => a.type === "tapForMana" && a.source === d2)).toBe(false);
    u = scenario({ p1: { battlefield: ["Lys Alana Dignitary"], graveyard: ["Llanowar Elves"] } });
    const d3 = idOf(u, "p1", "battlefield", "Lys Alana Dignitary");
    expect(legalActions(u, "p1").some((a) => a.type === "tapForMana" && a.source === d3)).toBe(true);
  });

  it("Midnight Tilling: mill four cards, then a milled permanent card may return to hand", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 2),
        hand: ["Midnight Tilling"],
        library: ["Opt", "Serra Angel", "Opt", "Bear Cub", "Forest"],
      },
    });
    const opts = (x: S) => (x.pending?.kind === "choice" && x.pending.request.type === "pick" ? x.pending.request.options : []);
    s = passAccepting(cast(s, "Midnight Tilling"), (x) => x.pending?.kind === "choice");
    // Only the milled permanent cards are offered.
    const names = opts(s).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(names.sort()).toEqual(["Bear Cub", "Serra Angel"]);
    s = chooseWanted(s, [idOf(s, "p1", "graveyard", "Serra Angel")]);
    expect(idsOf(s, "p1", "hand", "Serra Angel")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(2);
    expect(s.players.p1?.library).toHaveLength(1);
  });

  it("Mistmeadow Council: costs {1} less with a Kithkin, and draws a card", () => {
    const without = scenario({ p1: { battlefield: lands("Forest", 4), hand: ["Mistmeadow Council"] } });
    expect(() => cast(without, "Mistmeadow Council")).toThrow();
    let s = scenario({ p1: { battlefield: lands("Forest", 4).concat("Surly Farrier"), hand: ["Mistmeadow Council"] } });
    s = settle(cast(s, "Mistmeadow Council"));
    expect(idsOf(s, "p1", "battlefield", "Mistmeadow Council")).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it("Moon-Vigil Adherents: +1/+1 per creature you control and per creature card in your graveyard", () => {
    const s = scenario({
      p1: { battlefield: ["Moon-Vigil Adherents", "Bear Cub"], graveyard: ["Serra Angel", "Opt"] },
      p2: { battlefield: ["Llanowar Elves"] },
    });
    // Two creatures (itself included) and a creature card in the graveyard.
    expect(pt(s, idOf(s, "p1", "battlefield", "Moon-Vigil Adherents"))).toEqual([3, 3]);
  });

  it("Morcant's Eyes: sacrificed, creates a 2/2 Elf per Elf card in the graveyard (itself included); sorcery", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 6).concat("Morcant's Eyes"), graveyard: ["Llanowar Elves", "Bear Cub"] },
    });
    const eyes = idOf(s, "p1", "battlefield", "Morcant's Eyes");
    s = settle(activate(s, eyes));
    const elves = idsOf(s, "p1", "battlefield", "Elf");
    expect(elves).toHaveLength(2);
    expect(pt(s, elves[0] as string)).toEqual([2, 2]);
    expect(chars(s, elves[0] as string).colors).toEqual(expect.arrayContaining(["B", "G"]));
    // Not as a sorcery during the opponent's turn.
    const t = scenario({ p1: { battlefield: lands("Forest", 6).concat("Morcant's Eyes") }, active: "p2" });
    const e2 = idOf(t, "p1", "battlefield", "Morcant's Eyes");
    expect(legalActions(t, "p1").some((a) => a.type === "activate" && a.source === e2)).toBe(false);
  });

  it("Mutable Explorer: creates a tapped Mutavault token", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Mutable Explorer"] } });
    s = settle(cast(s, "Mutable Explorer"));
    const vault = idOf(s, "p1", "battlefield", "Mutavault");
    expect(s.objects[vault]?.tapped).toBe(true);
    expect(chars(s, vault).types).toEqual(["Land"]);
  });

  it("Pitiless Fists: +2/+2, and the enchanted creature fights an opposing creature", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4).concat("Pelakka Wurm"), hand: ["Pitiless Fists"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = chooseWanted(cast(s, "Pitiless Fists", { targets: { enchant: [wurm] } }), [angel]);
    expect(pt(s, wurm)).toEqual([9, 9]);
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    // The Angel (power 4) dealt damage to the Wurm in return.
    expect(s.objects[wurm]?.damage).toBe(4);
  });

  it("Prismabasher: up to X creatures you control get +X/+X", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 6).concat("Serra Angel", "Bear Cub", "Llanowar Elves"), hand: ["Prismabasher"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const angel = idOf(s, "p1", "battlefield", "Serra Angel");
    s = cast(s, "Prismabasher");
    s = passAccepting(s, (x) => x.pending?.kind === "choice" || x.stack.some((i) => Object.keys(i.targets ?? {}).length > 0));
    // X = 2 (white, green): three targets can't be chosen; they are chosen on trigger (PLAN-D, D6).
    const pending = s.pending;
    expect(pending?.kind === "choice" && pending.request.type === "pick" && pending.request.intent).toBe("triggerTarget");
    if (pending?.kind === "choice" && pending.request.type === "pick") {
      expect(pending.request.max).toBe(2);
      s = act(s, pending.player, { type: "choose", values: [bear, elves] });
    }
    s = settle(s);
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(pt(s, elves)).toEqual([3, 3]);
    expect(pt(s, angel)).toEqual([4, 4]);
  });

  it("Prismatic Undercurrents: X basic land cards in hand, and one more land per turn", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 4).concat("Serra Angel"),
        hand: ["Prismatic Undercurrents", "Forest", "Forest"],
        library: ["Plains", "Opt", "Island", "Swamp"],
      },
    });
    s = settle(cast(s, "Prismatic Undercurrents"));
    // White and green: two basic lands.
    expect(s.players.p1?.hand).toHaveLength(4);
    expect(s.players.p1?.library).toHaveLength(2);
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") });
    expect(idsOf(s, "p1", "battlefield", "Forest")).toHaveLength(6);
  });

  it("Pummeler for Hire: gains as much life as the greatest power among your Giants", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5).concat("Pelakka Wurm"), hand: ["Pummeler for Hire"] } });
    s = settle(cast(s, "Pummeler for Hire"));
    // The Wurm (7) is not a Giant: only Pummeler (4) counts.
    expect(s.players.p1?.life).toBe(24);
  });

  it("Spry and Mighty: X = difference in powers; X cards drawn, +X/+X and trample to both creatures", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 5).concat("Pelakka Wurm", "Llanowar Elves", "Bear Cub"), hand: ["Spry and Mighty"] },
    });
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    // Two successive choices: the Wurm, then the Elves.
    s = chooseWanted(cast(s, "Spry and Mighty"), [wurm, elves]);
    // 7 − 1 = 6.
    expect(s.players.p1?.hand).toHaveLength(6);
    expect(pt(s, wurm)).toEqual([13, 13]);
    expect(pt(s, elves)).toEqual([7, 7]);
    expect(chars(s, elves).keywords).toContain("trample");
    expect(pt(s, bear)).toEqual([2, 2]);
  });

  it("Spry and Mighty (official ruling): without two creatures on resolution, the spell does nothing", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 5).concat("Pelakka Wurm"), hand: ["Spry and Mighty"] } });
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const hand = (s.players.p1?.hand.length ?? 0) - 1;
    s = chooseWanted(cast(s, "Spry and Mighty"), [wurm]);
    expect(s.players.p1?.hand).toHaveLength(hand);
    expect(pt(s, wurm)).toEqual([7, 7]);
  });

  it("Tend the Sprigs: a tapped basic land; with seven lands and/or Treefolk, a 3/4 Treefolk with reach", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 6), hand: ["Tend the Sprigs"], library: ["Plains", "Opt"] } });
    s = settle(cast(s, "Tend the Sprigs"));
    expect(s.objects[idOf(s, "p1", "battlefield", "Plains")]?.tapped).toBe(true);
    const tree = idOf(s, "p1", "battlefield", "Treefolk");
    expect(pt(s, tree)).toEqual([3, 4]);
    expect(chars(s, tree).keywords).toContain("reach");
    let t = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Tend the Sprigs"], library: ["Plains", "Opt"] } });
    t = settle(cast(t, "Tend the Sprigs"));
    expect(idsOf(t, "p1", "battlefield", "Treefolk")).toHaveLength(0);
  });

  it("Thoughtweft Charge: +3/+3; draws only if a creature entered under your control this turn", () => {
    let s = scenario({ p1: { battlefield: lands("Forest", 2).concat("Bear Cub"), hand: ["Thoughtweft Charge"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settle(cast(s, "Thoughtweft Charge", { targets: { t: [bear] } }));
    expect(pt(s, bear)).toEqual([5, 5]);
    expect(s.players.p1?.hand).toHaveLength(0);
    let t = scenario({
      p1: { battlefield: lands("Forest", 3).concat("Bear Cub"), hand: ["Thoughtweft Charge", "Llanowar Elves"] },
    });
    t = settle(cast(t, "Llanowar Elves"));
    t = settle(cast(t, "Thoughtweft Charge", { targets: { t: [idOf(t, "p1", "battlefield", "Bear Cub")] } }));
    expect(t.players.p1?.hand).toHaveLength(1);
  });

  it("Trystan: mills three cards on entering (+2 life with an Elf); {B} transforms it, and the back face makes you lose 2 life", () => {
    let s = scenario({
      p1: {
        battlefield: lands("Forest", 3).concat("Swamp"),
        hand: [TRYSTAN],
        library: ["Llanowar Elves", "Forest", "Forest", "Opt", "Forest", "Forest", "Bear Cub", "Forest"],
      },
    });
    s = settle(cast(s, TRYSTAN));
    const trystan = idOf(s, "p1", "battlefield", TRYSTAN);
    expect(chars(s, trystan).keywords).toContain("deathtouch");
    expect(s.players.p1?.graveyard).toHaveLength(3);
    expect(s.players.p1?.life).toBe(22);
    // Next turn: {B} paid at the beginning of the first main phase.
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.turn.number > 3);
    s = chooseWanted(s, []);
    expect(chars(s, trystan).name).toBe("Trystan, Penitent Culler");
    // Mills three more cards (six in all), exiles the Elf: the opponent loses 2 life.
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Llanowar Elves")).toBe(true);
    expect(s.players.p2?.life).toBe(18);
    expect(s.players.p1?.graveyard).toHaveLength(5);
  });

  it("Trystan declines to pay: it stays on the front face", () => {
    let s = scenario({
      p1: { battlefield: [TRYSTAN, "Swamp"] },
      step: "upkeep",
    });
    const trystan = idOf(s, "p1", "battlefield", TRYSTAN);
    s = advanceUntil(s, (x) => x.turn.step === "main1");
    s = declineAll(s);
    expect(chars(s, trystan).name).toBe("Trystan, Callous Cultivator");
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Aurora Awakener: reveals until X permanent cards, puts any number of them onto the battlefield, the rest on the bottom", () => {
    const setup = () =>
      scenario({
        p1: {
          battlefield: lands("Forest", 7).concat("Serra Angel"),
          hand: ["Aurora Awakener"],
          library: ["Opt", "Bear Cub", "Opt", "Shivan Dragon", "Llanowar Elves", "Forest"],
        },
      });
    // "Any number" (PLAN-M M8a): only the Dragon; the Bear Cub joins the rest on the bottom.
    let offered: (string | undefined)[] = [];
    let t = settleAnswering(cast(setup(), "Aurora Awakener"), (req, _p, cur) => {
      if (req.type !== "pick" || req.intent !== "pickCards") return undefined;
      offered = namesIn(cur, req.options);
      expect(req.min).toBe(0);
      return pickNamed(cur, req, "Shivan Dragon");
    });
    expect(offered).toEqual(["Bear Cub", "Shivan Dragon"]);
    expect(idsOf(t, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(t, "p1", "battlefield", "Bear Cub")).toHaveLength(0);
    const rest = namesIn(t, t.players.p1?.library);
    expect(rest.slice(0, 2)).toEqual(["Llanowar Elves", "Forest"]);
    expect(rest.slice(2).sort()).toEqual(["Bear Cub", "Opt", "Opt"]);
    // None: everything goes on the bottom.
    t = settleAnswering(cast(setup(), "Aurora Awakener"), (req) => (req.intent === "pickCards" ? [] : undefined));
    expect([...idsOf(t, "p1", "battlefield", "Bear Cub"), ...idsOf(t, "p1", "battlefield", "Shivan Dragon")]).toEqual([]);
    expect(t.players.p1?.library).toHaveLength(6);
    // The suggestion takes them all.
    let s = setup();
    s = settle(cast(s, "Aurora Awakener"));
    // X = 2 (white and green): the Bear Cub and the Dragon enter; the two Opts go on the bottom.
    expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    const lib = (s.players.p1?.library ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    expect(lib.slice(0, 2)).toEqual(["Llanowar Elves", "Forest"]);
    expect(lib.slice(2).sort()).toEqual(["Opt", "Opt"]);
  });

  it("Bloom Tender: one mana of each color among your permanents", () => {
    let s = scenario({ p1: { battlefield: ["Bloom Tender", "Serra Angel", "Shivan Dragon", "Forest"] } });
    s = activate(s, idOf(s, "p1", "battlefield", "Bloom Tender"));
    expect(s.players.p1?.manaPool).toMatchObject({ W: 1, R: 1, G: 1, U: 0, B: 0 });
  });

  it("Wildvine Pummeler: costs {1} less per color among your permanents", () => {
    const poor = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Wildvine Pummeler"] } });
    expect(() => cast(poor, "Wildvine Pummeler")).toThrow();
    let s = scenario({
      p1: { battlefield: lands("Forest", 5).concat("Serra Angel", "Shivan Dragon"), hand: ["Wildvine Pummeler"] },
    });
    // White and red: {4}{G}.
    s = settle(cast(s, "Wildvine Pummeler"));
    expect(idsOf(s, "p1", "battlefield", "Wildvine Pummeler")).toHaveLength(1);
  });

  it("Unforgiving Aim: destroys a creature with flying, an enchantment, or creates a 2/2 Elf", () => {
    const setup = () =>
      scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Unforgiving Aim"] },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
    let s = setup();
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    expect(() => cast(s, "Unforgiving Aim", { mode: 0, targets: { t: [bear] } })).toThrow();
    s = settle(cast(s, "Unforgiving Aim", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
    expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
    let t = setup();
    t = settle(cast(t, "Unforgiving Aim", { mode: 2 }));
    expect(idsOf(t, "p1", "battlefield", "Elf")).toHaveLength(1);
  });

  it("Vinebred Brawler: must be blocked; when attacking, another Elf gets +2/+1", () => {
    let s = scenario({ p1: { battlefield: ["Vinebred Brawler", "Llanowar Elves"] }, p2: { battlefield: ["Bear Cub"] } });
    const brawler = idOf(s, "p1", "battlefield", "Vinebred Brawler");
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    expect(chars(s, brawler).keywords).toContain("mustBeBlocked");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: brawler, defender: "p2" }] });
    s = chooseWanted(s, [elves]);
    expect(pt(s, elves)).toEqual([3, 2]);
  });

  it("Virulent Emissary and Crossroads Watcher: another creature that enters gives 1 life and +1/+0", () => {
    let s = scenario({
      p1: { battlefield: ["Virulent Emissary", "Crossroads Watcher", "Forest"], hand: ["Llanowar Elves"] },
    });
    s = settle(cast(s, "Llanowar Elves"));
    expect(s.players.p1?.life).toBe(21);
    expect(pt(s, idOf(s, "p1", "battlefield", "Crossroads Watcher"))).toEqual([4, 3]);
  });
});

describe("Lorwyn Eclipsed, batch A — multicolor", () => {
  /**
   * Lorwyn Eclipsed, batch A — multicolor and hybrid cards: Commands ("choose two"), evoke and mana spent,
   * blight, Vivid, tribes (Merfolk, Elves, Kithkin, Elementals, Goblins) and legendary cards.
   */
  type S = GameState;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const settled = (x: S) => x.stack.length === 0 && x.pending?.kind === "priority";
  const settle = (s: S) => passAccepting(s, settled);
  const nameOf = (s: S, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const minus = (s: S, id: string) => s.objects[id]?.counters["-1/-1"] ?? 0;
  /** Answers pending choices: picks `want` when it is among the options, otherwise the suggestion. */
  const chooseWanted = (s: S, want: string[]) => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "choice" || settled(x));
    for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      const r = p.request;
      const picked = r.type === "pick" ? want.filter((w) => r.options.includes(w)) : wantedName(cur, r, want);
      cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
      cur = passAccepting(cur, (x) => x.pending?.kind === "choice" || settled(x));
    }
    return settle(cur);
  };
  /** Answers `values` to the next yes/no question. */
  const answerYesNo = (s: S, values: ChoiceValue[]) => {
    const cur = passAccepting(s, (x) => (x.pending?.kind === "choice" && x.pending.request.type === "yesNo") || settled(x));
    return cur.pending?.kind === "choice" ? act(cur, cur.pending.player, { type: "choose", values }) : cur;
  };
  const cast = (s: S, name: string, extra: Record<string, unknown> = {}) =>
    act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name), ...extra });
  /** Activates `source`'s ability whose label contains `label`. */
  const activate = (s: S, source: string, label: string, extra: Record<string, unknown> = {}) => {
    const defs = s.defs[s.objects[source]?.defId ?? ""]?.abilities ?? [];
    const ability = defs.findIndex((a) => a.kind === "activated" && (a.label ?? "").includes(label));
    return act(s, "p1", { type: "activate", source, ability, ...extra });
  };
  const killNow = (s: S, ...ids: string[]) => {
    simultaneously(s, () => {
      for (const id of ids) destroy(s, id);
    });
    return settle(act(s, s.pending?.player ?? "p1", { type: "pass" }));
  };
  const setCounters = (s: S, id: string, kind: string, n: number) => {
    (s.objects[id] as { counters: Record<string, number> }).counters[kind] = n;
    s.version += 1;
  };
  const exiled = (s: S, name: string) => s.exile.filter((id) => nameOf(s, id) === name);

  describe("Ordres (choisissez deux)", () => {
    it("Grub's Command: destroys the artifact or creature; the player mills five cards and takes their Goblins", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2)], hand: ["Grub's Command"] },
        p2: {
          battlefield: ["Serra Angel"],
          library: ["Fanatical Firebrand", "Forest", "Krenko, Mob Boss", "Island", "Bear Cub", "Plains"],
        },
      });
      // Pairs: (copy, +1/+1), (copy, destroy), (copy, mill), (+1/+1, destroy), (+1/+1, mill), (destroy, mill).
      s = settle(
        cast(s, "Grub's Command", { mode: 5, targets: { de: [idOf(s, "p2", "battlefield", "Serra Angel")], mi: ["p2"] } }),
      );
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(s.players.p2?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Fanatical Firebrand", "Krenko, Mob Boss"]);
      expect(s.players.p2?.graveyard.map((id) => nameOf(s, id)).sort()).toEqual(["Bear Cub", "Forest", "Island", "Serra Angel"]);
      expect(nameOf(s, s.players.p2?.library[0] as string)).toBe("Plains");
    });

    it("Grub's Command: copy of a Goblin and +1/+1 and haste for a player's creatures", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 3), ...lands("Mountain", 2), "Fanatical Firebrand", "Bear Cub"],
          hand: ["Grub's Command"],
        },
      });
      const goblin = idOf(s, "p1", "battlefield", "Fanatical Firebrand");
      s = settle(cast(s, "Grub's Command", { mode: 0, targets: { kin: [goblin], pu: ["p1"] } }));
      const goblins = idsOf(s, "p1", "battlefield", "Fanatical Firebrand");
      expect(goblins).toHaveLength(2);
      // The copy enters after the +1/+1: only the creature already there benefits.
      expect(pt(s, goblin)).toEqual([2, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
      // Only a Goblin you control can be copied.
      const t = scenario({
        p1: { battlefield: lands("Swamp", 5), hand: ["Grub's Command"] },
        p2: { battlefield: ["Fanatical Firebrand"] },
      });
      expect(() =>
        cast(t, "Grub's Command", {
          mode: 0,
          targets: { kin: [idOf(t, "p2", "battlefield", "Fanatical Firebrand")], pu: ["p1"] },
        }),
      ).toThrow();
    });

    it("Ashling's Command: 2 damage to each creature of the targeted player and two Treasures", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), ...lands("Mountain", 2), "Llanowar Elves"], hand: ["Ashling's Command"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      s = settle(cast(s, "Ashling's Command", { mode: 5, targets: { dm: ["p2"], tr: ["p1"] } }));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
      expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    it("Brigid's Command: +3/+3 then fight (in mode order); Kithkin token for a player", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Forest", 2), "Plains", "Bear Cub"], hand: ["Brigid's Command"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(cast(s, "Brigid's Command", { mode: 5, targets: { pu: [bear], fa: [bear], fb: [angel] } }));
      expect(idsOf(s, "p2", "graveyard", "Serra Angel")).toHaveLength(1);
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(s.objects[bear]?.damage).toBe(4);
      let t = scenario({ p1: { battlefield: [...lands("Forest", 2), "Plains", "Bear Cub"], hand: ["Brigid's Command"] } });
      t = settle(
        cast(t, "Brigid's Command", { mode: 3, targets: { kt: ["p2"], pu: [idOf(t, "p1", "battlefield", "Bear Cub")] } }),
      );
      const token = idOf(t, "p2", "battlefield", "Kithkin");
      expect(pt(t, token)).toEqual([1, 1]);
      expect(chars(t, token).colors.sort()).toEqual(["G", "W"]);
    });

    it("Sygg's Command: copy of a Merfolk; the targeted creature is tapped with a stun counter", () => {
      let s = scenario({
        p1: { battlefield: ["Plains", ...lands("Island", 2), "Brineborn Cutthroat"], hand: ["Sygg's Command"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = settle(
        cast(s, "Sygg's Command", {
          mode: 2,
          targets: { kin: [idOf(s, "p1", "battlefield", "Brineborn Cutthroat")], st: [angel] },
        }),
      );
      expect(idsOf(s, "p1", "battlefield", "Brineborn Cutthroat")).toHaveLength(2);
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(s.objects[angel]?.counters.stun).toBe(1);
    });

    it("Trystan's Command: two permanent cards return to hand; the player's creatures get +3/+3 and untap", () => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Swamp", 2), ...lands("Forest", 4), { name: "Bear Cub", tapped: true }],
          hand: ["Trystan's Command"],
          graveyard: ["Shivan Dragon", "Fishing Pole", "Opt"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const gy = [idOf(s, "p1", "graveyard", "Shivan Dragon"), idOf(s, "p1", "graveyard", "Fishing Pole")];
      // An instant is not a permanent card.
      expect(() =>
        cast(s, "Trystan's Command", { mode: 4, targets: { gy: [idOf(s, "p1", "graveyard", "Opt")], pu: ["p1"] } }),
      ).toThrow();
      s = settle(cast(s, "Trystan's Command", { mode: 4, targets: { gy, pu: ["p1"] } }));
      expect(s.players.p1?.hand.map((id) => nameOf(s, id)).sort()).toEqual(["Fishing Pole", "Shivan Dragon"]);
      expect(pt(s, bear)).toEqual([5, 5]);
      expect(s.objects[bear]?.tapped).toBe(false);
    });
  });

  describe("Evoke and mana spent", () => {
    it("Catharsis evoked with {W}{W}: two 1/1 Kithkin, no bonus, then it is sacrificed", () => {
      let s = scenario({ p1: { battlefield: [...lands("Plains", 2), "Bear Cub"], hand: ["Catharsis"] } });
      s = settle(cast(s, "Catharsis", { alternative: true }));
      expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(2);
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([2, 2]);
      expect(idsOf(s, "p1", "graveyard", "Catharsis")).toHaveLength(1);
    });

    it("Catharsis cast with {R}{R}: your creatures get +1/+1 and haste, no token", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 6), "Bear Cub"], hand: ["Catharsis"] } });
      s = settle(cast(s, "Catharsis"));
      const cath = idOf(s, "p1", "battlefield", "Catharsis");
      expect(pt(s, cath)).toEqual([4, 5]);
      expect(chars(s, cath).keywords).toContain("haste");
      expect(pt(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toEqual([3, 3]);
      expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(0);
    });

    it("Vibrance evoked with {R}{R}: 3 damage to any target, no search", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 2), hand: ["Vibrance"], library: ["Forest", "Island"] } });
      s = chooseWanted(cast(s, "Vibrance", { alternative: true }), ["p2"]);
      expect(s.players.p2?.life).toBe(17);
      expect(s.players.p1?.life).toBe(20);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(idsOf(s, "p1", "graveyard", "Vibrance")).toHaveLength(1);
    });

    it("Wistfulness evoked with {U}{U}: draw two cards then discard one", () => {
      let s = scenario({
        p1: { battlefield: lands("Island", 2), hand: ["Wistfulness"], library: ["Opt", "Forest", "Island"] },
        p2: { battlefield: ["Fishing Pole"] },
      });
      s = chooseWanted(cast(s, "Wistfulness", { alternative: true }), []);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard.map((id) => nameOf(s, id))).toHaveLength(2);
      // {G}{G} was not spent: the opposing artifact stays.
      expect(idsOf(s, "p2", "battlefield", "Fishing Pole")).toHaveLength(1);
    });
  });

  describe("Blight", () => {
    it("Chaos Spewer: paying {2} avoids blighting; otherwise two −1/−1 counters on one of your creatures", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { battlefield: lands("Swamp", 5), hand: ["Chaos Spewer"] } });
        s = settle(answerYesNo(cast(s, "Chaos Spewer"), [pay ? 1 : 0]));
        const spewer = idOf(s, "p1", "battlefield", "Chaos Spewer");
        return { counters: minus(s, spewer), pt: pt(s, spewer), untapped: s.battlefield.filter((id) => !s.objects[id]?.tapped) };
      };
      const paid = run(true);
      expect(paid.counters).toBe(0);
      expect(paid.untapped).toHaveLength(1);
      const refused = run(false);
      expect(refused.counters).toBe(2);
      expect(refused.pt).toEqual([3, 2]);
    });

    it("High Perfect Morcant: each Elf that enters makes each opponent blight 1", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Swamp", 2), ...lands("Forest", 3)], hand: ["High Perfect Morcant", "Llanowar Elves"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = settle(cast(s, "High Perfect Morcant"));
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      expect(minus(s, bear)).toBe(1);
      s = settle(cast(s, "Llanowar Elves"));
      expect(idsOf(s, "p2", "graveyard", "Bear Cub")).toHaveLength(1);
    });

    it("High Perfect Morcant: tapping three Elves (Morcant included, even with summoning sickness, 302.6) proliferates", () => {
      const run = (elves: number) => {
        let s = scenario({
          p1: { battlefield: [{ name: "High Perfect Morcant", sick: true }, ...lands("Llanowar Elves", elves)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        const angel = idOf(s, "p2", "battlefield", "Serra Angel");
        setCounters(s, angel, "-1/-1", 1);
        s = chooseWanted(activate(s, idOf(s, "p1", "battlefield", "High Perfect Morcant"), "three Elves"), [angel]);
        return { s, angel };
      };
      // Automatic payment taps the other Elves first.
      const three = run(3);
      expect(minus(three.s, three.angel)).toBe(2);
      expect(three.s.objects[idOf(three.s, "p1", "battlefield", "High Perfect Morcant")]?.tapped).toBe(false);
      const two = run(2);
      expect(minus(two.s, two.angel)).toBe(2);
      expect(two.s.objects[idOf(two.s, "p1", "battlefield", "High Perfect Morcant")]?.tapped).toBe(true);
      expect(() => run(1)).toThrow();
    });

    it("Hovel Hurler: enters as a 4/5; removing a counter gives +1/+0 and flying to another creature", () => {
      let s = scenario({ p1: { battlefield: [...lands("Mountain", 7), "Bear Cub"], hand: ["Hovel Hurler"] } });
      s = settle(cast(s, "Hovel Hurler"));
      const hurler = idOf(s, "p1", "battlefield", "Hovel Hurler");
      expect(pt(s, hurler)).toEqual([4, 5]);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settle(activate(s, hurler, "+1/+0", { targets: { t: [bear] } }));
      expect(pt(s, hurler)).toEqual([5, 6]);
      expect(pt(s, bear)).toEqual([3, 2]);
      expect(chars(s, bear).keywords).toContain("flying");
      expect(() => activate(s, hurler, "+1/+0", { targets: { t: [hurler] } })).toThrow();
    });

    it("Reaping Willow: removing two counters returns a creature with mana value 3 or less from the graveyard", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 6), hand: ["Reaping Willow"], graveyard: ["Bear Cub", "Shivan Dragon"] },
      });
      s = settle(cast(s, "Reaping Willow"));
      const willow = idOf(s, "p1", "battlefield", "Reaping Willow");
      expect(pt(s, willow)).toEqual([1, 4]);
      expect(chars(s, willow).keywords).toContain("lifelink");
      expect(() =>
        activate(s, willow, "Return a creature", { targets: { t: [idOf(s, "p1", "graveyard", "Shivan Dragon")] } }),
      ).toThrow();
      s = settle(activate(s, willow, "Return a creature", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(pt(s, willow)).toEqual([3, 6]);
    });
  });

  describe("Tribus", () => {
    it("Boggart Cursecrafter: another Goblin you control dies → 1 damage to each opponent (not for itself)", () => {
      let s = scenario({ p1: { battlefield: ["Boggart Cursecrafter", "Fanatical Firebrand", "Bear Cub"] } });
      s = killNow(s, idOf(s, "p1", "battlefield", "Fanatical Firebrand"));
      expect(s.players.p2?.life).toBe(19);
      s = killNow(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      expect(s.players.p2?.life).toBe(19);
      s = killNow(s, idOf(s, "p1", "battlefield", "Boggart Cursecrafter"));
      expect(s.players.p2?.life).toBe(19);
    });

    it("Deepchannel Duelist: your other Merfolk have +1/+1; at your end step, it untaps a Merfolk", () => {
      let s = scenario({
        p1: { battlefield: ["Deepchannel Duelist", { name: "Brineborn Cutthroat", tapped: true }] },
        p2: { battlefield: ["Kiora, the Rising Tide"] },
      });
      const duelist = idOf(s, "p1", "battlefield", "Deepchannel Duelist");
      const cut = idOf(s, "p1", "battlefield", "Brineborn Cutthroat");
      expect(pt(s, duelist)).toEqual([2, 2]);
      expect(pt(s, cut)).toEqual([3, 2]);
      expect(pt(s, idOf(s, "p2", "battlefield", "Kiora, the Rising Tide"))).toEqual([3, 2]);
      s = advanceUntil(s, (x) => x.turn.step === "end" && x.pending?.kind === "choice");
      if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [cut] });
      s = passAccepting(s, (x) => x.turn.step === "end" && settled(x));
      expect(s.objects[cut]?.tapped).toBe(false);
    });

    it("Deepway Navigator: untaps your other Merfolk; +1/+0 to your Merfolk if three or more Merfolk attacked", () => {
      let s = scenario({
        p1: {
          battlefield: [
            "Plains",
            "Island",
            { name: "Brineborn Cutthroat", tapped: true },
            { name: "Kiora, the Rising Tide", tapped: true },
          ],
          hand: ["Deepway Navigator"],
        },
      });
      s = settle(cast(s, "Deepway Navigator"));
      expect(idsOf(s, "p1", "battlefield", "Brineborn Cutthroat").map((id) => s.objects[id]?.tapped)).toEqual([false]);
      expect(s.objects[idOf(s, "p1", "battlefield", "Kiora, the Rising Tide")]?.tapped).toBe(false);
      const attack = (n: number) => {
        let t = scenario({ p1: { battlefield: ["Deepway Navigator", "Brineborn Cutthroat", "Kiora, the Rising Tide"] } });
        const nav = idOf(t, "p1", "battlefield", "Deepway Navigator");
        t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
        const attackers = [
          nav,
          idOf(t, "p1", "battlefield", "Brineborn Cutthroat"),
          idOf(t, "p1", "battlefield", "Kiora, the Rising Tide"),
        ]
          .slice(0, n)
          .map((id) => ({ id, defender: "p2" }));
        t = act(t, "p1", { type: "declareAttackers", attackers });
        return pt(t, nav);
      };
      expect(attack(2)).toEqual([2, 2]);
      expect(attack(3)).toEqual([3, 2]);
    });

    it("Eclipsed Elf: looks at four cards, takes an Elf (not another creature), the rest on the bottom", () => {
      let s = scenario({
        p1: {
          battlefield: lands("Swamp", 3),
          hand: ["Eclipsed Elf"],
          library: ["Bear Cub", "Llanowar Elves", "Island", "Shivan Dragon", "Plains"],
        },
      });
      const elves = s.players.p1?.library[1] as string;
      const bear = s.players.p1?.library[0] as string;
      s = passAccepting(cast(s, "Eclipsed Elf"), (x) => x.pending?.kind === "choice" || settled(x));
      expect(s.pending?.kind === "choice" && s.pending.request.type === "pick" && s.pending.request.options).not.toContain(bear);
      s = chooseWanted(s, [elves]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Llanowar Elves"]);
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Plains");
      expect(s.players.p1?.library).toHaveLength(4);
    });

    it("Morcant's Loyalist: your other Elves have +1/+1; when it dies, another Elf returns from the graveyard", () => {
      let s = scenario({
        p1: { battlefield: ["Morcant's Loyalist", "Llanowar Elves"], graveyard: ["Infestation Sage", "Bear Cub"] },
      });
      const loyalist = idOf(s, "p1", "battlefield", "Morcant's Loyalist");
      expect(pt(s, loyalist)).toEqual([3, 2]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Llanowar Elves"))).toEqual([2, 2]);
      const sage = idOf(s, "p1", "graveyard", "Infestation Sage");
      simultaneously(s, () => destroy(s, loyalist));
      s = chooseWanted(act(s, "p1", { type: "pass" }), [sage]);
      expect(s.players.p1?.hand.map((id) => nameOf(s, id))).toEqual(["Infestation Sage"]);
      expect(idsOf(s, "p1", "graveyard", "Morcant's Loyalist")).toHaveLength(1);
      // It can't return itself, nor a card that isn't an Elf.
      let t = scenario({ p1: { battlefield: ["Morcant's Loyalist"], graveyard: ["Bear Cub"] } });
      simultaneously(t, () => destroy(t, idOf(t, "p1", "battlefield", "Morcant's Loyalist")));
      t = chooseWanted(act(t, "p1", { type: "pass" }), []);
      expect(t.players.p1?.hand).toHaveLength(0);
      expect(idsOf(t, "p1", "graveyard", "Morcant's Loyalist")).toHaveLength(1);
    });

    it("Thoughtweft Lieutenant: a Kithkin that enters gives +1/+1 and trample to one of your creatures", () => {
      let s = scenario({
        p1: { battlefield: ["Thoughtweft Lieutenant", "Bear Cub", ...lands("Plains", 2)], hand: ["Eclipsed Kithkin", "Opt"] },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = chooseWanted(cast(s, "Eclipsed Kithkin"), [bear]);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(chars(s, bear).keywords).toContain("trample");
    });

    it("Twinflame Travelers: another Elemental's enters-the-battlefield ability triggers twice", () => {
      const run = (withTravelers: boolean) => {
        let s = scenario({
          p1: {
            battlefield: [...lands("Island", 5), ...(withTravelers ? ["Twinflame Travelers"] : [])],
            hand: ["Icewind Elemental"],
            library: ["Forest", "Island", "Plains", "Swamp"],
          },
        });
        s = chooseWanted(cast(s, "Icewind Elemental"), []);
        return s.players.p1?.graveyard.length;
      };
      expect(run(false)).toBe(1);
      expect(run(true)).toBe(2);
    });

    it("Noggle Robber: a Treasure on entering, another on dying", () => {
      let s = scenario({ p1: { battlefield: lands("Mountain", 3), hand: ["Noggle Robber"] } });
      s = settle(cast(s, "Noggle Robber"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(1);
      s = killNow(s, idOf(s, "p1", "battlefield", "Noggle Robber"));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
    });

    it("Stoic Grove-Guide: exiled from your graveyard (as a sorcery), it creates a 2/2 Elf", () => {
      let s = scenario({ p1: { battlefield: lands("Swamp", 2), graveyard: ["Stoic Grove-Guide"] } });
      const card = idOf(s, "p1", "graveyard", "Stoic Grove-Guide");
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === card)).toBe(true);
      s = settle(activate(s, card, "Elf"));
      expect(exiled(s, "Stoic Grove-Guide")).toHaveLength(1);
      const elf = idOf(s, "p1", "battlefield", "Elf");
      expect(pt(s, elf)).toEqual([2, 2]);
      expect(chars(s, elf).colors.sort()).toEqual(["B", "G"]);
    });
  });

  describe("Divers", () => {
    it("Abigale: the targeted creature loses its abilities and gets flying, first strike and lifelink counters", () => {
      let s = scenario({
        p1: { battlefield: lands("Plains", 2), hand: ["Abigale, Eloquent First-Year"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = chooseWanted(cast(s, "Abigale, Eloquent First-Year"), [angel]);
      expect(s.objects[angel]?.counters).toMatchObject({ flying: 1, firstStrike: 1, lifelink: 1 });
      const kw = chars(s, angel).keywords;
      expect(kw).toEqual(expect.arrayContaining(["flying", "firstStrike", "lifelink"]));
      expect(kw).not.toContain("vigilance");
    });

    it("Feisty Spikeling: first strike only during your turn", () => {
      const mine = scenario({ p1: { battlefield: ["Feisty Spikeling"] } });
      expect(chars(mine, idOf(mine, "p1", "battlefield", "Feisty Spikeling")).keywords).toContain("firstStrike");
      const theirs = scenario({ p1: { battlefield: ["Feisty Spikeling"] }, active: "p2" });
      expect(chars(theirs, idOf(theirs, "p1", "battlefield", "Feisty Spikeling")).keywords).not.toContain("firstStrike");
    });

    it("Figure of Fable: 2/3 Scout, then 4/5 Soldier, then 7/8 Avatar with protection from your opponents (in order)", () => {
      let s = scenario({
        p1: { battlefield: ["Figure of Fable", ...lands("Forest", 16)], hand: ["Sear"] },
        p2: { hand: ["Sear"] },
      });
      const fig = idOf(s, "p1", "battlefield", "Figure of Fable");
      s = settle(activate(s, fig, "Avatar"));
      expect(pt(s, fig)).toEqual([1, 1]);
      s = settle(activate(s, fig, "2/3 Kithkin Scout"));
      expect(pt(s, fig)).toEqual([2, 3]);
      expect(chars(s, fig).subtypes).toEqual(["Kithkin", "Scout"]);
      s = settle(activate(s, fig, "4/5 Kithkin Soldier"));
      expect(pt(s, fig)).toEqual([4, 5]);
      s = settle(activate(s, fig, "Avatar"));
      expect(pt(s, fig)).toEqual([7, 8]);
      expect(chars(s, fig).subtypes).toEqual(["Kithkin", "Avatar"]);
      expect(chars(s, fig).protections.map((r) => r.label)).toEqual(["Protection from each of your opponents"]);
      // An opposing spell can't target it; one of your spells can.
      const spec = dsl.target.creatureOrPlaneswalker();
      expect(isLegalTarget(s, "p2", spec, fig, idOf(s, "p2", "hand", "Sear"))).toBe(false);
      expect(isLegalTarget(s, "p1", spec, fig, idOf(s, "p1", "hand", "Sear"))).toBe(true);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1");
      expect(pt(s, fig)).toEqual([7, 8]);
    });

    it("Flaring Cinder: on entering and for a spell with mana value 4 or more, discard a card to draw one", () => {
      let s = scenario({
        p1: { battlefield: [...lands("Island", 3), ...lands("Plains", 5)], hand: ["Flaring Cinder", "Opt", "Serra Angel"] },
      });
      const opt = idOf(s, "p1", "hand", "Opt");
      s = chooseWanted(cast(s, "Flaring Cinder"), [opt]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(2);
      const forest = s.players.p1?.hand.find((id) => nameOf(s, id) === "Forest") as string;
      s = chooseWanted(cast(s, "Serra Angel"), [forest]);
      expect(idsOf(s, "p1", "graveyard", "Forest")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Glister Bairn (Vivid): at the beginning of combat, another of your creatures gets +X/+X (X = colors)", () => {
      let s = scenario({ p1: { battlefield: ["Glister Bairn", "Bear Cub", "Fire Elemental", "Island"] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      // Green and blue (Bairn), green (Bear Cub), red (Elemental): three colors.
      s = advanceUntil(s, (x) => x.turn.step === "beginCombat" && x.pending?.kind === "choice");
      if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [bear] });
      s = passAccepting(s, (x) => x.turn.step === "beginCombat" && settled(x));
      expect(pt(s, bear)).toEqual([5, 5]);
    });

    it("Tam: your other creatures have hexproof from their colors; {T} makes a creature all colors", () => {
      let s = scenario({
        p1: { battlefield: ["Tam, Mindful First-Year", "Bear Cub", "Fire Elemental"] },
        p2: { hand: ["Sear"] },
      });
      const sear = idOf(s, "p2", "hand", "Sear");
      const spec = dsl.target.creatureOrPlaneswalker();
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const fire = idOf(s, "p1", "battlefield", "Fire Elemental");
      const tam = idOf(s, "p1", "battlefield", "Tam, Mindful First-Year");
      expect(isLegalTarget(s, "p2", spec, fire, sear)).toBe(false);
      expect(isLegalTarget(s, "p2", spec, bear, sear)).toBe(true);
      expect(isLegalTarget(s, "p2", spec, tam, sear)).toBe(true);
      // You can still target your own creatures.
      expect(isLegalTarget(s, "p1", spec, fire, sear)).toBe(true);
      s = settle(activate(s, tam, "all colors", { targets: { t: [bear] } }));
      expect(chars(s, bear).colors).toHaveLength(5);
      expect(isLegalTarget(s, "p2", spec, bear, sear)).toBe(false);
    });

    it("Voracious Tome-Skimmer: a spell cast during the opponent's turn lets you pay 1 life to draw", () => {
      let s = scenario({
        p1: { battlefield: ["Voracious Tome-Skimmer", "Island"], hand: ["Opt"] },
        active: "p2",
      });
      s = act(s, "p2", { type: "pass" });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Opt") });
      s = settle(answerYesNo(s, [1]));
      expect(s.players.p1?.life).toBe(19);
      // One card drawn by the Tome-Skimmer, one by each Opt.
      expect(s.players.p1?.hand).toHaveLength(2);
    });

    it("Wary Farmer: surveil 1 at your end step only if another creature entered this turn", () => {
      const run = (castBear: boolean) => {
        let s = scenario({ p1: { battlefield: ["Wary Farmer", "Forest", "Forest"], hand: ["Bear Cub"] } });
        if (castBear) s = settle(cast(s, "Bear Cub"));
        let asked = false;
        for (let i = 0; i < 100 && !(s.turn.active === "p2"); i++) {
          const p = s.pending;
          if (p?.kind === "choice" && p.request.intent === "surveilGraveyard") asked = true;
          if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
          else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
          else if (p?.kind === "choice") s = act(s, p.player, { type: "choose", values: p.request.suggested });
          else break;
        }
        return asked;
      };
      expect(run(false)).toBe(false);
      expect(run(true)).toBe(true);
    });

    it("Doran: your creature spells with toughness greater than their power cost {1} less; +X/+X when attacking", () => {
      let s = scenario({
        p1: { battlefield: ["Doran, Besieged by Time", "Mountain"], hand: ["Dragonlord's Servant", "Bear Cub"] },
      });
      s = settle(cast(s, "Dragonlord's Servant"));
      expect(idsOf(s, "p1", "battlefield", "Dragonlord's Servant")).toHaveLength(1);
      const t = scenario({ p1: { battlefield: ["Doran, Besieged by Time", "Forest"], hand: ["Bear Cub"] } });
      expect(() => cast(t, "Bear Cub")).toThrow();
      let u = scenario({ p1: { battlefield: ["Doran, Besieged by Time"] } });
      const doran = idOf(u, "p1", "battlefield", "Doran, Besieged by Time");
      u = advanceUntil(u, (x) => x.pending?.kind === "declareAttackers");
      u = act(u, "p1", { type: "declareAttackers", attackers: [{ id: doran, defender: "p2" }] });
      u = passAccepting(u, (x) => x.turn.step === "declareAttackers" && settled(x));
      expect(pt(u, doran)).toEqual([5, 10]);
    });

    it("Bre of Clan Stoutarm: life gained this turn → the exiled nonland card is cast for free if its mana value allows", () => {
      const setup = (gained: number, library: string[]) => {
        const s = scenario({ p1: { battlefield: ["Bre of Clan Stoutarm"], library } });
        if (gained) s.turnLog.push({ e: "lifeGain", player: "p1", amount: gained });
        s.version += 1;
        return s;
      };
      let s = untilCastNow(advanceUntil(setup(3, ["Forest", "Bear Cub", "Island"]), (x) => x.turn.step === "end"));
      const bear = castNowOf(s)?.cards[0] as string;
      expect(nameOf(s, bear)).toBe("Bear Cub");
      s = settle(act(s, "p1", { type: "cast", card: bear, free: true }));
      expect(idsOf(s, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
      expect(exiled(s, "Forest")).toHaveLength(1);
      // Mana value too high: the card goes to hand.
      let t = advanceUntil(setup(1, ["Shivan Dragon", "Island"]), (x) => x.turn.step === "end" && settled(x));
      t = settle(t);
      expect(idsOf(t, "p1", "hand", "Shivan Dragon")).toHaveLength(1);
      // No life gained: nothing is exiled.
      const u = advanceUntil(setup(0, ["Shivan Dragon", "Island"]), (x) => x.turn.active === "p2");
      expect(exiled(u, "Shivan Dragon")).toHaveLength(0);
    });

    it("Kirol: tapping two other creatures copies a triggered ability you control (once per turn)", () => {
      let s = scenario({
        p1: {
          battlefield: ["Kirol, Attentive First-Year", "Bear Cub", "Llanowar Elves", "Fire Elemental", ...lands("Mountain", 3)],
          hand: ["Noggle Robber"],
        },
      });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Noggle Robber") });
      s = passAccepting(s, (x) => x.stack.length === 1 && x.stack[0]?.kind === "ability" && x.pending?.kind === "priority");
      const trigger = s.stack[0]?.id as string;
      const kirol = idOf(s, "p1", "battlefield", "Kirol, Attentive First-Year");
      s = settle(activate(s, kirol, "Copy", { targets: { t: [trigger] } }));
      expect(idsOf(s, "p1", "battlefield", "Treasure")).toHaveLength(2);
      expect(s.objects[kirol]?.tapped).toBe(false);
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature") && s.objects[id]?.tapped)).toHaveLength(2);

      // "you control": an opponent's triggered ability can't be targeted.
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Kirol, Attentive First-Year", "Bear Cub", "Llanowar Elves"] },
        p2: { battlefield: lands("Mountain", 3), hand: ["Noggle Robber"] },
      });
      t = act(t, "p2", { type: "cast", card: idOf(t, "p2", "hand", "Noggle Robber") });
      t = passAccepting(t, (x) => x.stack.length === 1 && x.stack[0]?.kind === "ability" && x.pending?.kind === "priority");
      const theirs = t.stack[0]?.id as string;
      t = act(t, "p2", { type: "pass" });
      expect(t.pending?.kind === "priority" && t.pending.player).toBe("p1");
      const kirol2 = idOf(t, "p1", "battlefield", "Kirol, Attentive First-Year");
      expect(() => activate(t, kirol2, "Copy", { targets: { t: [theirs] } })).toThrow();
    });
  });
});

describe("Lorwyn Eclipsed, batch A — colorless", () => {
  /**
   * Lorwyn Eclipsed, batch A — colorless cards: colorless changelings (Changeling Wayfinder, Rooftop Percher), artifacts
   * (Chronicle of Victory, Dawn-Blessed Pennant, Foraging Wickermaw, Puca's Eye), Equipment (Stalactite Dagger) and
   * land (Eclipsed Realms).
   */
  type S = GameState;
  const lands = (name: string, n: number) => Array(n).fill(name) as string[];
  const settle = (s: S) => passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
  const castOption = (s: S, card: string) => legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
  /** Answers pending choices: picks `want` when it is among the options, otherwise the suggestion. */
  const chooseWanted = (s: S, want: string[]) => {
    let cur = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    for (let i = 0; i < 10 && cur.pending?.kind === "choice"; i++) {
      const p = cur.pending;
      const r = p.request;
      const picked = r.type === "pick" ? want.filter((w) => r.options.includes(w)) : wantedName(cur, r, want);
      cur = act(cur, p.player, { type: "choose", values: picked.length > 0 ? picked : r.suggested });
      cur = passAccepting(cur, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
    }
    return settle(cur);
  };
  const cast = (s: S, name: string, want: string[] = []) =>
    chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", name) }), want);
  /** Activatable abilities of the source (indices). */
  const activations = (s: S, source: string) =>
    legalActions(s, "p1").flatMap((a) => (a.type === "activate" && a.source === source ? [a.ability] : []));

  const mana = (generic: number, colored: Partial<Record<Color, number>> = {}): ManaCost => ({ generic, colored, x: 0 });
  /** Test creatures: an Elf for {G}, a Goblin, a Bear with no Lorwyn type, a changeling. */
  const ELF: CardDef = customCard({
    name: "Elfe d'essai",
    colors: ["G"],
    subtypes: ["Elf", "Warrior"],
    manaCost: mana(0, { G: 1 }),
    manaCostText: "{G}",
    power: 1,
    toughness: 1,
  });
  const BEAR: CardDef = customCard({
    name: "Ours d'essai",
    colors: ["G"],
    subtypes: ["Bear"],
    manaCost: mana(0, { G: 1 }),
    manaCostText: "{G}",
    power: 2,
    toughness: 2,
  });
  const GOBLIN: CardDef = customCard({ name: "Gobelin d'essai", subtypes: ["Goblin"], power: 1, toughness: 1 });
  const SHIFTER: CardDef = customCard({
    name: "Changeforme d'essai",
    subtypes: ["Shapeshifter"],
    keywords: ["changeling"],
    power: 1,
    toughness: 1,
  });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];

  describe("Changeling Wayfinder", () => {
    it("on entering, searches for a basic land card and puts it into hand; it has changeling", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Changeling Wayfinder"], library: ["Opt", "Plains", "Opt"] },
      });
      s = cast(s, "Changeling Wayfinder");
      const wayfinder = idOf(s, "p1", "battlefield", "Changeling Wayfinder");
      expect(idsOf(s, "p1", "hand", "Plains")).toHaveLength(1);
      expect(s.players.p1?.library).toHaveLength(2);
      expect(chars(s, wayfinder).keywords).toContain("changeling");
      expect(matchesObjectFilter(s, "p1", wayfinder, { subtype: "Kithkin" })).toBe(true);
    });

    it("the search is optional", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Changeling Wayfinder"], library: ["Opt", "Plains"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Changeling Wayfinder") });
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("yesNo");
      s = settle(act(s, "p1", { type: "choose", values: [0] }));
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(s.players.p1?.library).toHaveLength(2);
    });
  });

  describe("Rooftop Percher", () => {
    it("exiles up to two cards from graveyards (of different players) and gains 3 life", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 5), hand: ["Rooftop Percher"], graveyard: ["Opt"] },
        p2: { graveyard: ["Bear Cub", "Shivan Dragon"] },
      });
      const opt = idOf(s, "p1", "graveyard", "Opt");
      const dragon = idOf(s, "p2", "graveyard", "Shivan Dragon");
      s = cast(s, "Rooftop Percher", [opt, dragon]);
      expect(s.players.p1?.graveyard).toHaveLength(0);
      expect(s.players.p2?.graveyard.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toEqual(["Bear Cub"]);
      expect(s.exile).toHaveLength(2);
      expect(s.players.p1?.life).toBe(23);
      expect(chars(s, idOf(s, "p1", "battlefield", "Rooftop Percher")).keywords).toContain("flying");
    });

    it("with no card in the graveyards, you still gain 3 life", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 5), hand: ["Rooftop Percher"] } });
      s = cast(s, "Rooftop Percher");
      expect(s.players.p1?.life).toBe(23);
    });
  });

  describe("Chronicle of Victory", () => {
    const withChronicle = (extra: string[] = [], hand: (string | CardDef)[] = []) => {
      let s = scenario({
        p1: {
          battlefield: [...lands("Forest", 7), ELF, BEAR, SHIFTER, ...extra],
          hand: ["Chronicle of Victory", ...hand],
          library: lands("Forest", 10),
        },
      });
      s = cast(s, "Chronicle of Victory", ["Elf"]);
      return s;
    };

    it("your creatures of the chosen type (changelings included) have +2/+2, first strike and trample; not the others", () => {
      const s = withChronicle();
      const chronicle = idOf(s, "p1", "battlefield", "Chronicle of Victory");
      expect(s.objects[chronicle]?.chosen?.creatureType).toBe("Elf");
      const elf = idOf(s, "p1", "battlefield", ELF.name);
      const shifter = idOf(s, "p1", "battlefield", SHIFTER.name);
      const bear = idOf(s, "p1", "battlefield", BEAR.name);
      expect(pt(s, elf)).toEqual([3, 3]);
      expect(chars(s, elf).keywords).toEqual(expect.arrayContaining(["firstStrike", "trample"]));
      expect(pt(s, shifter)).toEqual([3, 3]);
      expect(pt(s, bear)).toEqual([2, 2]);
      expect(chars(s, bear).keywords).not.toContain("firstStrike");
    });

    it("a spell of the chosen type draws a card; another spell doesn't", () => {
      let s = withChronicle(
        [],
        [
          { ...ELF, id: "test-elfe-2", name: "Elfe d'essai 2" },
          { ...BEAR, id: "test-ours-2", name: "Ours d'essai 2" },
        ],
      );
      // The Forests tapped to cast the Chronicle are untapped.
      for (const id of s.battlefield) if (s.objects[id]) (s.objects[id] as { tapped: boolean }).tapped = false;
      s.version += 1;
      const hand = s.players.p1?.hand.length ?? 0;
      s = cast(s, "Elfe d'essai 2");
      expect(s.players.p1?.hand.length).toBe(hand); // −1 cast, +1 drawn
      s = cast(s, "Ours d'essai 2");
      expect(s.players.p1?.hand.length).toBe(hand - 1);
    });

    it("a changeling spell is of the chosen type: it draws", () => {
      let s = withChronicle([], [{ ...SHIFTER, id: "test-changeforme-2", name: "Changeforme d'essai 2" }]);
      const hand = s.players.p1?.hand.length ?? 0;
      s = cast(s, "Changeforme d'essai 2");
      expect(s.players.p1?.hand.length).toBe(hand);
    });

    it("with Stalactite Dagger, the equipped creature (of all types) also gets the bonus", () => {
      let s = withChronicle(["Stalactite Dagger"]);
      for (const id of s.battlefield) if (s.objects[id]) (s.objects[id] as { tapped: boolean }).tapped = false;
      s.version += 1;
      const dagger = idOf(s, "p1", "battlefield", "Stalactite Dagger");
      const bear = idOf(s, "p1", "battlefield", BEAR.name);
      const [equip] = activations(s, dagger);
      s = settle(act(s, "p1", { type: "activate", source: dagger, ability: equip ?? -1, targets: { t: [bear] } }));
      // 2/2, +1/+1 from the Dagger, +2/+2 from the Chronicle (chosen Elf).
      expect(pt(s, bear)).toEqual([5, 5]);
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["firstStrike", "trample"]));
    });
  });

  describe("Dawn-Blessed Pennant", () => {
    const withPennant = (tribe: string) => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Dawn-Blessed Pennant", GOBLIN, BEAR, SHIFTER] },
      });
      s = cast(s, "Dawn-Blessed Pennant", [tribe]);
      return s;
    };

    it("the choice is restricted to the eight Lorwyn tribes", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 1), hand: ["Dawn-Blessed Pennant"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dawn-Blessed Pennant") });
      s = passAccepting(s, (x) => x.pending?.kind === "choice");
      const r = s.pending?.kind === "choice" ? s.pending.request : undefined;
      expect(r?.type === "pick" && r.options).toEqual([
        "Elemental",
        "Elf",
        "Faerie",
        "Giant",
        "Goblin",
        "Kithkin",
        "Merfolk",
        "Treefolk",
      ]);
    });

    it("a permanent of the chosen type (changeling included) that enters under your control gains you 1 life; the others don't", () => {
      let s = withPennant("Goblin");
      expect(s.objects[idOf(s, "p1", "battlefield", "Dawn-Blessed Pennant")]?.chosen?.creatureType).toBe("Goblin");
      s = cast(s, GOBLIN.name);
      expect(s.players.p1?.life).toBe(21);
      s = cast(s, BEAR.name);
      expect(s.players.p1?.life).toBe(21);
      s = cast(s, SHIFTER.name);
      expect(s.players.p1?.life).toBe(22);
    });

    it("an opposing Goblin that enters doesn't gain life", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Dawn-Blessed Pennant"] },
        p2: { hand: [GOBLIN] },
      });
      s = cast(s, "Dawn-Blessed Pennant", ["Goblin"]);
      s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "main1" && x.pending?.kind === "priority");
      s = settle(act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", GOBLIN.name) }));
      expect(idsOf(s, "p2", "battlefield", GOBLIN.name)).toHaveLength(1);
      expect(s.players.p1?.life).toBe(20);
    });

    it("{2}, {T}, sacrifice: returns a card of the chosen type from your graveyard; a card of another type isn't a target", () => {
      let s = scenario({
        p1: { battlefield: lands("Forest", 3), hand: ["Dawn-Blessed Pennant"], graveyard: [GOBLIN, BEAR] },
      });
      s = cast(s, "Dawn-Blessed Pennant", ["Goblin"]);
      for (const id of s.battlefield) if (s.objects[id]) (s.objects[id] as { tapped: boolean }).tapped = false;
      s.version += 1;
      const pennant = idOf(s, "p1", "battlefield", "Dawn-Blessed Pennant");
      const goblin = idOf(s, "p1", "graveyard", GOBLIN.name);
      const bear = idOf(s, "p1", "graveyard", BEAR.name);
      // Only one of the eight abilities can be activated: that of the chosen tribe.
      const abilities = activations(s, pennant);
      expect(abilities).toHaveLength(1);
      expect(() =>
        act(s, "p1", { type: "activate", source: pennant, ability: abilities[0] ?? -1, targets: { t: [bear] } }),
      ).toThrow();
      s = settle(act(s, "p1", { type: "activate", source: pennant, ability: abilities[0] ?? -1, targets: { t: [goblin] } }));
      expect(idsOf(s, "p1", "hand", GOBLIN.name)).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", BEAR.name)).toHaveLength(1);
      expect(idsOf(s, "p1", "graveyard", "Dawn-Blessed Pennant")).toHaveLength(1);
    });
  });

  describe("Foraging Wickermaw", () => {
    it("on entering, surveil 1", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Foraging Wickermaw"], library: ["Opt", "Forest"] } });
      const opt = s.players.p1?.library[0] ?? "";
      s = cast(s, "Foraging Wickermaw", [opt]);
      expect(idsOf(s, "p1", "graveyard", "Opt")).toHaveLength(1);
    });

    it("{1}: one mana of the chosen color; it becomes that color until end of turn; only once per turn", () => {
      let s = scenario({ p1: { battlefield: ["Foraging Wickermaw", ...lands("Forest", 3)] } });
      const wick = idOf(s, "p1", "battlefield", "Foraging Wickermaw");
      expect(chars(s, wick).colors).toEqual([]);
      const abilities = activations(s, wick);
      expect(abilities).toHaveLength(5);
      const red =
        s.defs[s.objects[wick]?.defId ?? ""]?.abilities.findIndex((a) => "label" in a && !!a.label?.includes("{R}")) ?? -1;
      s = act(s, "p1", { type: "activate", source: wick, ability: red });
      s = passAccepting(s, (x) => x.pending?.kind === "priority");
      expect(s.players.p1?.manaPool.R).toBe(1);
      expect(chars(s, wick).colors).toEqual(["R"]);
      // Once per turn, whatever the color.
      expect(activations(s, wick)).toHaveLength(0);
      // On the next turn, it becomes colorless again and the ability is available again.
      s = advanceUntil(s, (x) => x.turn.number === 5 && x.turn.step === "main1" && x.pending?.kind === "priority");
      expect(chars(s, wick).colors).toEqual([]);
      expect(activations(s, wick)).toHaveLength(5);
    });
  });

  describe("Puca's Eye", () => {
    it("on entering: draw a card, then choose a color (during resolution): the artifact takes it", () => {
      let s = scenario({ p1: { battlefield: lands("Forest", 2), hand: ["Puca's Eye"], library: ["Opt", "Forest"] } });
      s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Puca's Eye") });
      s = passAccepting(s, (x) => x.pending?.kind === "choice" || (x.stack.length === 0 && x.pending?.kind === "priority"));
      // No color choice when the ability is put on the stack: the question comes after the draw.
      const p = s.pending;
      expect(p?.kind).toBe("choice");
      if (p?.kind !== "choice") return;
      expect(p.request.type === "pick" && p.request.options).toEqual(["W", "U", "B", "R", "G"]);
      expect(s.resolving).toBeTruthy();
      expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
      s = settle(act(s, p.player, { type: "choose", values: ["B"] }));
      const eye = idOf(s, "p1", "battlefield", "Puca's Eye");
      expect(chars(s, eye).colors).toEqual(["B"]);
      // The color stays (endless effect) on the next turn.
      s = advanceUntil(s, (x) => x.turn.number === 2 && x.pending?.kind === "priority");
      expect(chars(s, eye).colors).toEqual(["B"]);
    });

    it("{3}, {T}: draw a card, only with five colors among your permanents", () => {
      const COLORED = (c: Color, n: string) => customCard({ name: n, colors: [c], subtypes: ["Bear"], power: 1, toughness: 1 });
      const four = [COLORED("W", "Blanc"), COLORED("U", "Bleu"), COLORED("B", "Noir"), COLORED("R", "Rouge")];
      let s = scenario({ p1: { battlefield: ["Puca's Eye", ...four, ...lands("Forest", 3)], library: ["Opt"] } });
      const eye = idOf(s, "p1", "battlefield", "Puca's Eye");
      expect(activations(s, eye)).toHaveLength(0);
      s = scenario({
        p1: { battlefield: ["Puca's Eye", ...four, COLORED("G", "Vert"), ...lands("Forest", 3)], library: ["Opt"] },
      });
      const eye2 = idOf(s, "p1", "battlefield", "Puca's Eye");
      const [ability] = activations(s, eye2);
      expect(ability).toBeDefined();
      s = settle(act(s, "p1", { type: "activate", source: eye2, ability: ability ?? -1 }));
      expect(idsOf(s, "p1", "hand", "Opt")).toHaveLength(1);
      expect(s.objects[eye2]?.tapped).toBe(true);
    });
  });

  describe("Stalactite Dagger", () => {
    it("creates a 1/1 Shapeshifter; the equipped creature gets +1/+1 and all creature types", () => {
      let s = scenario({ p1: { battlefield: [...lands("Forest", 4), BEAR], hand: ["Stalactite Dagger"] } });
      s = cast(s, "Stalactite Dagger");
      const token = s.battlefield.find((id) => s.objects[id]?.isToken);
      expect(token).toBeDefined();
      expect(chars(s, token ?? "").keywords).toContain("changeling");
      expect(chars(s, token ?? "").colors).toEqual([]);
      expect(pt(s, token ?? "")).toEqual([1, 1]);
      const dagger = idOf(s, "p1", "battlefield", "Stalactite Dagger");
      const bear = idOf(s, "p1", "battlefield", BEAR.name);
      expect(matchesObjectFilter(s, "p1", bear, { subtype: "Merfolk" })).toBe(false);
      const [equip] = activations(s, dagger);
      s = settle(act(s, "p1", { type: "activate", source: dagger, ability: equip ?? -1, targets: { t: [bear] } }));
      expect(s.objects[dagger]?.attachedTo).toBe(bear);
      expect(pt(s, bear)).toEqual([3, 3]);
      expect(matchesObjectFilter(s, "p1", bear, { subtype: "Merfolk" })).toBe(true);
      expect(matchesObjectFilter(s, "p1", bear, { subtype: "Treefolk" })).toBe(true);
    });
  });

  describe("Eclipsed Realms", () => {
    const withRealms = () => {
      let s = scenario({ p1: { hand: ["Eclipsed Realms", ELF, BEAR, { ...ELF, id: "test-elfe-3", name: "Elfe d'essai 3" }] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Eclipsed Realms") });
      return settle(s);
    };

    it("the type is chosen among the eight Lorwyn tribes", () => {
      let s = scenario({ p1: { hand: ["Eclipsed Realms"] } });
      const play = legalActions(s, "p1").find(
        (a) => a.type === "playLand" && a.card === idOf(s, "p1", "hand", "Eclipsed Realms"),
      );
      const choose = play?.type === "playLand" ? play.choose : undefined;
      expect(choose && "options" in choose ? [...choose.options].sort() : choose).toEqual([
        "Elemental",
        "Elf",
        "Faerie",
        "Giant",
        "Goblin",
        "Kithkin",
        "Merfolk",
        "Treefolk",
      ]);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Eclipsed Realms"), chosen: "Goblin" } as never);
      expect(s.objects[idOf(s, "p1", "battlefield", "Eclipsed Realms")]?.chosen?.creatureType).toBe("Goblin");
    });

    it("played without resolution: the chosen type is the default one (the most present among its controller's)", () => {
      const s = withRealms();
      expect(s.objects[idOf(s, "p1", "battlefield", "Eclipsed Realms")]?.chosen?.creatureType).toBe("Elf");
    });

    it("the color mana is used only to cast a spell of the chosen type", () => {
      const s = withRealms();
      expect(castOption(s, idOf(s, "p1", "hand", ELF.name))).toBeDefined();
      expect(castOption(s, idOf(s, "p1", "hand", BEAR.name))).toBeUndefined();
      const after = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", ELF.name) }));
      expect(idsOf(after, "p1", "battlefield", ELF.name)).toHaveLength(1);
    });
  });
});

const ELF_TOKEN: TokenSpec = { name: "Elfe", colors: ["G"], types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1 };

describe("Lorwyn Eclipsed, batch B", () => {
  const BRIGID = "Brigid, Clachan's Heart // Brigid, Doun's Mind";
  const GRUB = "Grub, Storied Matriarch // Grub, Notorious Auntie";
  const resolutionOf = (s: S, controller: string, sourceId: string) =>
    ({
      item: { id: "x", controller, sourceId, sourceDefId: s.objects[sourceId]?.defId, targets: {} },
      controller,
      targets: {},
      vars: {},
      pc: 0,
    }) as never as Parameters<typeof runEffect>[1];
  const costOf = (s: S, name: string, opts: Parameters<typeof spellCost>[3] = {}) => {
    const card = idOf(s, "p1", "hand", name);
    return manaValue(spellCost(s, "p1", s.defs[s.objects[card]?.defId ?? ""] as CardDef, { ...opts, card }));
  };
  /** Passes until the stack and pending triggers are empty. */
  const settleAll = (s: S) =>
    passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  const goblinCard = customCard({ name: "Gobelin de main", subtypes: ["Goblin"], power: 1, toughness: 1 });

  it('Wild Unraveling: "blight 2 or pay {1}"; blighting counters for {U}{U}', () => {
    let s = scenario({
      p1: { battlefield: ["Pelakka Wurm", "Forest", "Island", "Island"], hand: ["Giant Growth", "Wild Unraveling"] },
    });
    expect(costOf(s, "Wild Unraveling")).toBe(3);
    expect(costOf(s, "Wild Unraveling", { kicked: true })).toBe(2);
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giant Growth"), targets: { t: [wurm] } });
    s = act(s, "p1", {
      type: "cast",
      card: idOf(s, "p1", "hand", "Wild Unraveling"),
      targets: { t: [s.stack[0]?.id as string] },
      kicked: true,
    });
    s = settle(s);
    expect(s.objects[wurm]?.counters["-1/-1"]).toBe(2);
    expect(chars(s, wurm).power).toBe(5);
    expect(idsOf(s, "p1", "graveyard", "Giant Growth")).toHaveLength(1);
  });

  it("Soul Immolation: X blighted at most the greatest toughness; X damage to each opponent and their creatures", () => {
    let s = scenario({
      p1: { battlefield: ["Pelakka Wurm", ...lands("Mountain", 5)], hand: ["Soul Immolation"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
    });
    const card = idOf(s, "p1", "hand", "Soul Immolation");
    expect(castOption(s, card)).toMatchObject({ xMax: 7 });
    expect(() => act(s, "p1", { type: "cast", card, x: 8 })).toThrow();
    s = settle(act(s, "p1", { type: "cast", card, x: 5 }));
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    expect(s.objects[wurm]?.counters["-1/-1"]).toBe(5);
    expect(s.players.p2?.life).toBe(15);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(0);
  });

  it('transformation by another effect: "when it transforms into Brigid, Clachan\'s Heart" triggers', () => {
    let s = scenario({ p1: { battlefield: [BRIGID] } });
    const brigid = idOf(s, "p1", "battlefield", BRIGID);
    runEffect(s, resolutionOf(s, "p1", brigid), dsl.fx.transform());
    s = settleAll(s);
    expect(nameOf(s, brigid)).toBe(BRIGID);
    expect(chars(s, brigid).name).toBe("Brigid, Doun's Mind");
    expect(idsOf(s, "p1", "battlefield", "Kithkin")).toHaveLength(0);
    runEffect(s, resolutionOf(s, "p1", brigid), dsl.fx.transform());
    s = settleAll(s);
    expect(chars(s, brigid).name).not.toBe("Brigid, Doun's Mind");
    expect(s.battlefield.filter((id) => chars(s, id).name === "Kithkin")).toHaveLength(1);
  });

  it("Grub, Notorious Auntie: blight 1 when attacking creates an attacking copy of the blighted creature", () => {
    let s = scenario({ p1: { battlefield: [GRUB, "Pelakka Wurm"] } });
    const grub = idOf(s, "p1", "battlefield", GRUB);
    runEffect(s, resolutionOf(s, "p1", grub), dsl.fx.transform());
    s = settle(s);
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: grub, defender: "p2" }] });
    s = chooseWanted(s, [idOf(s, "p1", "battlefield", "Pelakka Wurm")]);
    const wurms = s.battlefield.filter((id) => chars(s, id).name === "Pelakka Wurm");
    expect(wurms).toHaveLength(2);
    const token = wurms.find((id) => s.objects[id]?.isToken) as string;
    expect(s.objects[token]?.tapped).toBe(true);
    expect(s.combat?.attackers.some((a) => a.id === token)).toBe(true);
  });

  it("Champion of the Weird: beholds and exiles a Goblin card from hand, which returns when it leaves", () => {
    let s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Champion of the Weird", goblinCard] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Champion of the Weird") }));
    const champ = idOf(s, "p1", "battlefield", "Champion of the Weird");
    expect(s.exile.some((id) => nameOf(s, id) === goblinCard.name)).toBe(true);
    destroy(s, champ);
    s = settleAll(s);
    expect(idsOf(s, "p1", "hand", goblinCard.name)).toHaveLength(1);
  });

  it("Champion of the Weird: with no Goblin to behold, it can't be cast", () => {
    const s = scenario({ p1: { battlefield: lands("Swamp", 4), hand: ["Champion of the Weird"] } });
    expect(castOption(s, idOf(s, "p1", "hand", "Champion of the Weird"))).toBeUndefined();
  });

  it('"behold a Goblin or pay {2}": the card cast doesn\'t behold itself, another in hand does', () => {
    const alone = scenario({ p1: { hand: ["Mudbutton Cursetosser"] } });
    expect(costOf(alone, "Mudbutton Cursetosser")).toBe(3);
    const two = scenario({ p1: { hand: ["Mudbutton Cursetosser", "Mudbutton Cursetosser"] } });
    expect(costOf(two, "Mudbutton Cursetosser")).toBe(1);
  });

  it("each player blights 1: each chooses, and each chosen creature gets only one counter", () => {
    const each = customCard({
      name: "Mass Blight",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 0, colored: { B: 1 }, x: 0 },
      spell: dsl.spell([], [dsl.fx.blight(1, dsl.ref.eachPlayer)]),
    });
    let s = scenario({
      p1: { battlefield: ["Swamp", "Bear Cub", "Pelakka Wurm"], hand: [each] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", each.name) }), []);
    const counters = s.battlefield.map((id) => s.objects[id]?.counters["-1/-1"] ?? 0).filter((n) => n > 0);
    expect(counters).toEqual([1, 1]);
  });

  it("506.4: an attacker exiled for a cost (behold) leaves combat", () => {
    let s = scenario({
      p1: { battlefield: ["Changeling Wayfinder", ...lands("Plains", 4)], hand: ["Champion of the Clachan"] },
    });
    const wayfinder = idOf(s, "p1", "battlefield", "Changeling Wayfinder");
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: wayfinder, defender: "p2" }] });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Champion of the Clachan") });
    expect(s.combat?.attackers).toHaveLength(0);
  });

  const elf = customCard({ name: "Elfe de test", subtypes: ["Elf"], power: 1, toughness: 1 });
  const elfCost2 = customCard({
    name: "Two-Type Elf",
    subtypes: ["Elf"],
    power: 2,
    toughness: 2,
    manaCost: { generic: 1, colored: { G: 1 }, x: 0 },
  });

  it("Selfless Safewright: your other permanents of the chosen type gain hexproof and indestructible", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Forest", 5), elf, "Bear Cub"], hand: ["Selfless Safewright"] },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Selfless Safewright") }), ["Elf"]);
    const kw = (name: string) => chars(s, idOf(s, "p1", "battlefield", name)).keywords;
    expect(kw(elf.name)).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
    expect(kw("Bear Cub")).not.toContain("indestructible");
    expect(kw("Selfless Safewright")).not.toContain("indestructible");
  });

  it("Harmonized Crescendo: draw a card per permanent of the chosen type (choice made by the spell)", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Island", 6), elf, elf, "Bear Cub"],
        hand: ["Harmonized Crescendo"],
        library: lands("Island", 5),
      },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Harmonized Crescendo") }), ["Elf"]);
    expect(s.players.p1?.hand).toHaveLength(2);
  });

  it("Bloodline Bidding: returns the creature cards of the chosen type to the battlefield", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 8), hand: ["Bloodline Bidding"], graveyard: [elf, elf, "Bear Cub"] },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bloodline Bidding") }), ["Elf"]);
    expect(idsOf(s, "p1", "battlefield", elf.name)).toHaveLength(2);
    expect(idsOf(s, "p1", "graveyard", "Bear Cub")).toHaveLength(1);
  });

  it("Gathering Stone: spells of the chosen type cost {1} less; the top card of the chosen type goes to hand", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 4), hand: ["Gathering Stone", elfCost2], library: [elf, "Forest"] },
    });
    expect(costOf(s, elfCost2.name)).toBe(2);
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Gathering Stone") }), ["Elf"]);
    expect(idsOf(s, "p1", "hand", elf.name)).toHaveLength(1);
    expect(costOf(s, elfCost2.name)).toBe(1);
  });

  it("Rimefire Torque: a charge counter for each permanent of the chosen type that enters", () => {
    let s = scenario({ p1: { battlefield: lands("Island", 2), hand: ["Rimefire Torque"] } });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Rimefire Torque") }), ["Elf"]);
    const torque = idOf(s, "p1", "battlefield", "Rimefire Torque");
    const r = resolutionOf(s, "p1", torque);
    runEffect(s, r, dsl.fx.createTokens({ ...ELF_TOKEN }));
    runEffect(s, r, dsl.fx.createTokens({ ...ELF_TOKEN, name: "Ours", subtypes: ["Bear"] }));
    s = settleAll(s);
    expect(s.objects[torque]?.counters.charge).toBe(1);
  });

  it("Oko, Shadowmoor Scion, −6: the emblem gives +3/+3, vigilance and hexproof to the chosen type", () => {
    let s = scenario({ p1: { battlefield: ["Oko, Lorwyn Liege // Oko, Shadowmoor Scion", elf, "Bear Cub"] } });
    const oko = idOf(s, "p1", "battlefield", "Oko, Lorwyn Liege // Oko, Shadowmoor Scion");
    runEffect(s, resolutionOf(s, "p1", oko), dsl.fx.transform());
    const o = s.objects[oko];
    if (o) o.counters.loyalty = 6;
    const minus6 = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === oko && a.label?.includes("emblem"));
    expect(minus6).toBeDefined();
    const ability = minus6?.type === "activate" ? minus6.ability : -1;
    s = chooseWanted(act(s, "p1", { type: "activate", source: oko, ability }), ["Elf"]);
    const e = idOf(s, "p1", "battlefield", elf.name);
    expect(chars(s, e).power).toBe(4);
    expect(chars(s, e).keywords).toEqual(expect.arrayContaining(["vigilance", "hexproof"]));
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).power).toBe(2);
  });

  it("blight (Barbed Bloodletter): damage to creatures becomes −1/−1 counters", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Swamp", "Bear Cub"], hand: ["Barbed Bloodletter"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Barbed Bloodletter"), targets: {} }));
    s = chooseWanted(s, [bear]);
    expect(chars(s, bear).power).toBe(3);
    expect(chars(s, bear).keywords).toContain("wither");
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    dealDamage(s, sourceFromObject(s, bear), wurm, 3, false);
    expect(s.objects[wurm]?.counters["-1/-1"]).toBe(3);
    expect(s.objects[wurm]?.damage).toBe(0);
  });

  it("Squawkroaster: its power is the number of colors among your permanents", () => {
    const s = scenario({ p1: { battlefield: ["Squawkroaster", "Bear Cub", "Llanowar Elves", "Shivan Dragon"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Squawkroaster")).power).toBe(2);
  });

  it("Squawkroaster: Vivid counts the colors your permanents have, not their printed colors (PLAN-M M8b)", () => {
    // A green creature made red: one color among them (printed, there would be two).
    const PAINT = customCard({
      name: "Test Red Paint",
      typeLine: "Artifact",
      types: ["Artifact"],
      abilities: [dsl.staticAbility({ name: "Bear Cub" }, { setColors: ["R"] })],
    });
    const s = scenario({ p1: { battlefield: ["Squawkroaster", "Bear Cub", PAINT] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).colors).toEqual(["R"]);
    expect(chars(s, idOf(s, "p1", "battlefield", "Squawkroaster")).power).toBe(1);
  });

  it('"remove a counter from this creature": any kind of counter pays the cost', () => {
    let s = scenario({ p1: { battlefield: ["Moonlit Lamenter", "Plains", "Plains"], library: lands("Plains", 3) } });
    const lam = idOf(s, "p1", "battlefield", "Moonlit Lamenter");
    const o = s.objects[lam];
    if (o) o.counters = { "+1/+1": 1 };
    s = settle(act(s, "p1", { type: "activate", source: lam, ability: 1 }));
    expect(s.objects[lam]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.players.p1?.hand).toHaveLength(1);
  });

  it('122.1d: "untap" removes a stun counter instead of untapping', () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const o = s.objects[bear];
    if (o) {
      o.tapped = true;
      o.counters.stun = 1;
    }
    runEffect(s, resolutionOf(s, "p1", bear), dsl.fx.untap(dsl.ref.self));
    expect(s.objects[bear]?.tapped).toBe(true);
    expect(s.objects[bear]?.counters.stun ?? 0).toBe(0);
    runEffect(s, resolutionOf(s, "p1", bear), dsl.fx.untap(dsl.ref.self));
    expect(s.objects[bear]?.tapped).toBe(false);
  });

  it("turn log: a token created counts among the creatures that entered under your control this turn", () => {
    const s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(s, resolutionOf(s, "p1", bear), dsl.fx.createTokens(ELF_TOKEN));
    const entered = dsl.amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" });
    runEffect(s, resolutionOf(s, "p1", bear), dsl.fx.gainLife(entered));
    expect(s.players.p1?.life).toBe(21);
  });

  it('Morcant\'s Loyalist: "another Elf card" can be another copy, not itself', () => {
    let s = scenario({ p1: { battlefield: ["Morcant's Loyalist"], graveyard: ["Morcant's Loyalist"] } });
    destroy(s, idOf(s, "p1", "battlefield", "Morcant's Loyalist"));
    s = settleAll(s);
    expect(idsOf(s, "p1", "hand", "Morcant's Loyalist")).toHaveLength(1);
    expect(idsOf(s, "p1", "graveyard", "Morcant's Loyalist")).toHaveLength(1);
  });

  it("Shadow Urchin: a creature with counters dies, as many cards exiled (last known information)", () => {
    let s = scenario({ p1: { battlefield: ["Shadow Urchin", "Shivan Dragon"], library: lands("Forest", 6) } });
    const dragon = idOf(s, "p1", "battlefield", "Shivan Dragon");
    const o = s.objects[dragon];
    if (o) o.counters = { "-1/-1": 2, charge: 1 };
    destroy(s, dragon);
    s = settleAll(s);
    expect(s.players.p1?.library).toHaveLength(3);
    expect(s.exile).toHaveLength(3);
  });

  it("Collective Inferno: only your sources of the chosen type deal double, spells included", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Mountain", 7), "Bear Cub"], hand: ["Collective Inferno", "Lightning Strike"] },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Collective Inferno") }), ["Goblin"]);
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Bear Cub")), "p2", 2, false);
    expect(s.players.p2?.life).toBe(18);
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(15);
    const goblin = customCard({ name: "Gobelin d'essai", subtypes: ["Goblin"], power: 1, toughness: 1 });
    s = scenario({ p1: { battlefield: ["Collective Inferno", goblin] } });
    const inferno = s.objects[idOf(s, "p1", "battlefield", "Collective Inferno")];
    if (inferno) inferno.chosen = { creatureType: "Goblin" };
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", goblin.name)), "p2", 2, false);
    expect(s.players.p2?.life).toBe(16);
  });
});

describe("Lorwyn Eclipsed, batch C", () => {
  const settleAll = (s: S) =>
    passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  const elf = customCard({ name: "Elfe de test", subtypes: ["Elf"], power: 1, toughness: 1 });
  const goblin = customCard({ name: "Gobelin de test", subtypes: ["Goblin"], power: 1, toughness: 1 });
  const elfWarrior = customCard({ name: "Elfe guerrier", subtypes: ["Elf", "Warrior"], power: 2, toughness: 2 });

  it("Unbury: two creature cards that share a type, not two that share none", () => {
    const s = scenario({ p1: { battlefield: lands("Swamp", 2), hand: ["Unbury"], graveyard: [elf, goblin, elfWarrior] } });
    const card = idOf(s, "p1", "hand", "Unbury");
    const [e, g, w] = [elf.name, goblin.name, elfWarrior.name].map((n) => idOf(s, "p1", "graveyard", n));
    expect(() => act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [e as string, g as string] } })).toThrow();
    const t = settle(act(s, "p1", { type: "cast", card, mode: 1, targets: { t: [e as string, w as string] } }));
    expect(t.players.p1?.hand).toHaveLength(2);
  });

  it("Kinbinding: +X/+X per creature that entered under your control this turn (tokens included)", () => {
    let s = scenario({ p1: { battlefield: ["Kinbinding", "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(chars(s, bear).power).toBe(2);
    s = passAccepting(s, (x) => x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0);
    expect(chars(s, bear).power).toBe(3);
  });

  it("Winnowing: each player sacrifices their other creatures sharing no creature type with the chosen one", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Plains", 6), elf, elfWarrior, goblin], hand: ["Winnowing"] },
      p2: { battlefield: ["Bear Cub", "Shivan Dragon"] },
    });
    const keep = idOf(s, "p1", "battlefield", elf.name);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winnowing") }), [keep, dragon]);
    expect(idsOf(s, "p1", "battlefield", elfWarrior.name)).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", goblin.name)).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Shivan Dragon")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
  });

  it("Winnowing with three players: you choose for each player, then all sacrifice at the same time", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: [...lands("Plains", 6), elf, goblin], hand: ["Winnowing"] },
      p2: { battlefield: ["Bear Cub", "Llanowar Elves"] },
      p3: { battlefield: ["Shivan Dragon", "Savannah Lions"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Winnowing") });
    const field = s.battlefield.length;
    const asked: string[] = [];
    const want = [elf.name, "Llanowar Elves", "Savannah Lions"];
    s = settleAnswering(s, (req, p, cur) => {
      if (req.type !== "pick" || !cur) return undefined;
      expect(cur.battlefield.length).toBe(field);
      asked.push(`${p}:${cur.objects[String(req.options[0])]?.controller}`);
      return req.options.filter((id) => want.includes(nameOf(cur, id) ?? ""));
    });
    expect(asked).toEqual(["p1:p1", "p1:p2", "p1:p3"]);
    expect(idsOf(s, "p1", "battlefield", goblin.name)).toHaveLength(0);
    expect(idsOf(s, "p2", "battlefield", "Llanowar Elves")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(0);
    expect(idsOf(s, "p3", "battlefield", "Savannah Lions")).toHaveLength(1);
    expect(idsOf(s, "p3", "battlefield", "Shivan Dragon")).toHaveLength(0);
  });

  it("Glen Elendra's Answer: counters all opposing spells, a Faerie per spell countered", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 4)], hand: ["Glen Elendra's Answer"] },
      p2: { battlefield: [...lands("Forest", 2), "Bear Cub"], hand: ["Giant Growth", "Giant Growth"] },
      active: "p2",
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    for (const g of idsOf(s, "p2", "hand", "Giant Growth")) s = act(s, "p2", { type: "cast", card: g, targets: { t: [bear] } });
    s = act(s, "p2", { type: "pass" });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Glen Elendra's Answer") }));
    expect(idsOf(s, "p2", "graveyard", "Giant Growth")).toHaveLength(2);
    expect(chars(s, bear).power).toBe(2);
    expect(s.battlefield.filter((id) => chars(s, id).name === "Faerie")).toHaveLength(2);
  });

  it("Swat Away: the owner puts the targeted spell on top or on the bottom of their library", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 4), hand: ["Swat Away"] },
      p2: { battlefield: [...lands("Forest", 1), "Bear Cub"], hand: ["Giant Growth"] },
      active: "p2",
    });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Giant Growth"), targets: { t: [bear] } });
    s = act(s, "p2", { type: "pass" });
    const growth = s.stack[0]?.id as string;
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Swat Away"), targets: { t: [growth] } }), ["top"]);
    const top = s.players.p2?.library[0];
    expect(nameOf(s, top as string)).toBe("Giant Growth");
    expect(chars(s, bear).power).toBe(2);
  });

  it("Lasting Tarfire: 2 damage to each opponent at the end step, if you put a counter on a creature", () => {
    let s = scenario({ p1: { battlefield: ["Lasting Tarfire", "Bear Cub"] }, step: "main2" });
    s = passAccepting(s, (x) => x.turn.number === 4);
    expect(s.players.p2?.life).toBe(20);
    s = scenario({ p1: { battlefield: ["Lasting Tarfire", "Bear Cub"] }, step: "main2" });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    runEffect(
      s,
      {
        item: { id: "x", controller: "p1", sourceId: bear, sourceDefId: s.objects[bear]?.defId, targets: {} },
        controller: "p1",
        targets: {},
        vars: {},
        pc: 0,
      } as never,
      dsl.fx.addCounters(dsl.ref.self, 1),
    );
    s = passAccepting(s, (x) => x.turn.number === 4);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Lasting Tarfire: wither damage puts the counters for the source's controller (120.3d; PLAN-L L5)", () => {
    const run = (sourceController: "p1" | "p2") => {
      let s = scenario({
        p1: { battlefield: ["Lasting Tarfire", "Bear Cub"] },
        p2: { battlefield: ["Bear Cub"] },
        step: "main2",
      });
      const victim = idOf(s, sourceController === "p1" ? "p2" : "p1", "battlefield", "Bear Cub");
      dealDamage(s, { defId: "test", controller: sourceController, keywords: ["wither"] }, victim, 1, false);
      expect(s.objects[victim]?.counters["-1/-1"]).toBe(1);
      s = passAccepting(s, (x) => x.turn.number === 4);
      return s.players.p2?.life;
    };
    expect(run("p1")).toBe(18);
    expect(run("p2")).toBe(20);
  });

  it("Spinerock Tyrant: copy of a single-target spell; both spells have blight", () => {
    let s = scenario({
      p1: { battlefield: ["Spinerock Tyrant", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
      p2: { battlefield: ["Pelakka Wurm"] },
    });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: [wurm] } });
    s = chooseWanted(s, [wurm]);
    expect(s.objects[wurm]?.counters["-1/-1"]).toBe(6);
    expect(s.objects[wurm]?.damage).toBe(0);
  });

  const resolutionOf = (s: S, controller: string, sourceId: string) =>
    ({
      item: { id: "x", controller, sourceId, sourceDefId: s.objects[sourceId]?.defId, targets: {} },
      controller,
      targets: {},
      vars: {},
      pc: 0,
    }) as never as Parameters<typeof runEffect>[1];
  const castable = (s: S, card: string) => legalActions(s, "p1").some((a) => a.type === "cast" && a.card === card);

  it("Dawnhand Dissident: during your turn, a creature exiled with it is cast by removing three counters", () => {
    let s = scenario({
      p1: { battlefield: ["Dawnhand Dissident", "Pelakka Wurm", ...lands("Swamp", 2)] },
      p2: { graveyard: ["Bear Cub"] },
    });
    const dissident = idOf(s, "p1", "battlefield", "Dawnhand Dissident");
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    s = chooseWanted(
      act(s, "p1", { type: "activate", source: dissident, ability: 1, targets: { t: [idOf(s, "p2", "graveyard", "Bear Cub")] } }),
      [wurm],
    );
    const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    expect(s.objects[dissident]?.linked).toContain(bear);
    // The Bear Cub doesn't belong to it: nothing to cast. With its own card and three counters, yes.
    expect(castable(s, bear)).toBe(false);
    const own = scenario({
      p1: { battlefield: ["Dawnhand Dissident", "Pelakka Wurm", ...lands("Forest", 2)], graveyard: ["Bear Cub"] },
    });
    const d2 = idOf(own, "p1", "battlefield", "Dawnhand Dissident");
    const w2 = idOf(own, "p1", "battlefield", "Pelakka Wurm");
    let o = chooseWanted(
      act(own, "p1", { type: "activate", source: d2, ability: 1, targets: { t: [idOf(own, "p1", "graveyard", "Bear Cub")] } }),
      [w2],
    );
    const exiled = o.exile.find((id) => nameOf(o, id) === "Bear Cub") as string;
    expect(castable(o, exiled)).toBe(false);
    const w = o.objects[w2];
    if (w) w.counters["-1/-1"] = 3;
    expect(castable(o, exiled)).toBe(true);
    o = settle(act(o, "p1", { type: "cast", card: exiled }));
    expect(idsOf(o, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    expect(o.objects[w2]?.counters["-1/-1"] ?? 0).toBe(0);
  });

  it("Maralen: exiles the top two cards of the opponent's library; once per turn, a free spell with mana value at most its Elves and Faeries", () => {
    let s = scenario({
      p1: { battlefield: ["Swamp", "Island", ...lands("Forest", 3)], hand: ["Maralen, Fae Ascendant"] },
      p2: { library: ["Bear Cub", "Shivan Dragon", "Forest"] },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Maralen, Fae Ascendant") }), ["p2"]);
    const bear = s.exile.find((id) => nameOf(s, id) === "Bear Cub") as string;
    const dragon = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    expect(castable(s, bear)).toBe(false); // VM 2 > un seul Elfe/Faerie (Maralen)
    const r = resolutionOf(s, "p1", idOf(s, "p1", "battlefield", "Maralen, Fae Ascendant"));
    runEffect(s, r, dsl.fx.createTokens(ELF_TOKEN));
    s = settleAll(s);
    expect(castable(s, bear)).toBe(true);
    expect(castable(s, dragon)).toBe(false);
  });

  it("Taster of Wares: the opponent reveals X cards; an exiled instant is cast with mana of any type", () => {
    let s = scenario({
      p1: { battlefield: lands("Swamp", 5), hand: ["Taster of Wares"] },
      p2: { hand: ["Giant Growth", "Forest", "Bear Cub"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Taster of Wares"), targets: {} });
    s = chooseWanted(s, ["p2", idOf(s, "p2", "hand", "Giant Growth")]);
    const growth = s.exile.find((id) => nameOf(s, id) === "Giant Growth") as string;
    expect(growth).toBeDefined();
    expect(s.players.p2?.hand).toHaveLength(2);
    expect(castable(s, growth)).toBe(true);
  });

  it("Twilight Diviner: a creature returned from the graveyard gives a token copy, once per turn", () => {
    let s = scenario({ p1: { battlefield: ["Twilight Diviner"], graveyard: ["Bear Cub", "Bear Cub"] } });
    const diviner = idOf(s, "p1", "battlefield", "Twilight Diviner");
    const [a, b] = idsOf(s, "p1", "graveyard", "Bear Cub");
    runEffect(s, resolutionOf(s, "p1", diviner), dsl.fx.moveTo(dsl.ref.self, { to: "battlefield" }));
    s.objects[a as string] &&
      runEffect(
        s,
        { ...resolutionOf(s, "p1", diviner), targets: { t: [a as string] } } as never,
        dsl.fx.toBattlefield(dsl.ref.target()),
      );
    s = settleAll(s);
    s.objects[b as string] &&
      runEffect(
        s,
        { ...resolutionOf(s, "p1", diviner), targets: { t: [b as string] } } as never,
        dsl.fx.toBattlefield(dsl.ref.target()),
      );
    s = settleAll(s);
    expect(s.battlefield.filter((id) => chars(s, id).name === "Bear Cub")).toHaveLength(3);
  });

  it("Twilight Diviner: several creatures returned together from the graveyard: a single trigger, copy of the one you choose", () => {
    let s = scenario({
      p1: {
        battlefield: ["Twilight Diviner"],
        hand: ["Llanowar Elves"],
        graveyard: ["Bear Cub", "Shivan Dragon", "Healer's Hawk"],
      },
    });
    const diviner = idOf(s, "p1", "battlefield", "Twilight Diviner");
    const back = [idOf(s, "p1", "graveyard", "Bear Cub"), idOf(s, "p1", "graveyard", "Shivan Dragon")];
    const elves = idOf(s, "p1", "hand", "Llanowar Elves");
    // A single effect: two creatures from the graveyard and one from hand.
    runEffect(
      s,
      { ...resolutionOf(s, "p1", diviner), targets: { t: [...back, elves] } } as never,
      dsl.fx.toBattlefield(dsl.ref.target()),
    );
    expect(s.triggers).toHaveLength(1);
    s = passAccepting(s, (x) => x.pending?.kind === "choice");
    const p = s.pending;
    const req = p?.kind === "choice" ? p.request : undefined;
    if (req?.type !== "pick") throw new Error("choix attendu");
    expect((req.options as string[]).map((id) => chars(s, id).name).sort()).toEqual(["Bear Cub", "Shivan Dragon"]);
    const cur = s;
    s = act(s, "p1", { type: "choose", values: req.options.filter((id) => chars(cur, id as string).name === "Shivan Dragon") });
    s = settleAll(s);
    const dragons = s.battlefield.filter((id) => chars(s, id).name === "Shivan Dragon");
    expect(dragons.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    // Once per turn: another return from the graveyard no longer triggers anything.
    const hawk = idOf(s, "p1", "graveyard", "Healer's Hawk");
    runEffect(s, { ...resolutionOf(s, "p1", diviner), targets: { t: [hawk] } } as never, dsl.fx.toBattlefield(dsl.ref.target()));
    expect(s.triggers).toHaveLength(0);
  });

  it("Ashling, Rimebound: two mana restricted to spells with mana value 4 or more", () => {
    let s = scenario({ p1: { battlefield: ["Ashling, Rekindled // Ashling, Rimebound"], hand: ["Shivan Dragon", "Bear Cub"] } });
    const ashling = idOf(s, "p1", "battlefield", "Ashling, Rekindled // Ashling, Rimebound");
    runEffect(s, resolutionOf(s, "p1", ashling), dsl.fx.transform());
    s = chooseWanted(settleAll(s), ["R"]);
    expect(s.players.p1?.restrictedMana).toHaveLength(2);
    expect(castable(s, idOf(s, "p1", "hand", "Bear Cub"))).toBe(false);
    const t = scenario({ p1: { battlefield: [...lands("Mountain", 4)], hand: ["Shivan Dragon", "Bear Cub"] } });
    const pl = t.players.p1;
    if (pl)
      pl.restrictedMana = [
        { type: "R", restriction: { spell: { minManaValue: 4 } } },
        { type: "R", restriction: { spell: { minManaValue: 4 } } },
      ];
    expect(castable(t, idOf(t, "p1", "hand", "Shivan Dragon"))).toBe(true);
    const cast = settle(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Shivan Dragon") }));
    expect(cast.players.p1?.restrictedMana).toBeUndefined();
    expect(idsOf(cast, "p1", "battlefield", "Shivan Dragon")).toHaveLength(1);
  });

  it("Goliath Daydreamer: the instant cast from hand is exiled with a dream counter, then recast for free when attacking", () => {
    let s = scenario({ p1: { battlefield: ["Goliath Daydreamer", "Mountain", "Mountain"], hand: ["Lightning Strike"] } });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } }));
    s = settleAll(s);
    const strike = s.exile.find((id) => nameOf(s, id) === "Lightning Strike") as string;
    expect(s.objects[strike]?.counters.dream).toBe(1);
    expect(s.players.p2?.life).toBe(17);
    s = passAccepting(s, (x) => x.pending?.kind === "declareAttackers");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [{ id: idOf(s, "p1", "battlefield", "Goliath Daydreamer"), defender: "p2" }],
    });
    s = untilCastNow(s);
    expect(castNowOf(s)?.cards).toEqual([strike]);
    s = settleAll(act(s, "p1", { type: "cast", card: strike, targets: { t: ["p2"] } }));
    expect(s.players.p2?.life).toBe(14);
  });

  it("Dream Harvest: each opponent exiles up to total mana value 5; those cards are cast for free", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 7), hand: ["Dream Harvest"] },
      p2: { library: ["Bear Cub", "Forest", "Bear Cub", "Shivan Dragon", "Forest"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dream Harvest") }));
    // Bear Cub (2), Forest (0), Bear Cub (2), Shivan Dragon (6): total 10 ≥ 5 after the dragon.
    expect(s.players.p2?.library).toHaveLength(1);
    const dragon = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    expect(castable(s, dragon)).toBe(true);
  });

  it("Dream Harvest: only exiled cards that can be cast are allowed; a land card can't be played (PLAN-H, H2)", () => {
    let s = scenario({
      p1: { battlefield: lands("Island", 7), hand: ["Dream Harvest"] },
      p2: { library: ["Forest", "Shivan Dragon", "Bear Cub"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dream Harvest") }));
    const forest = s.exile.find((id) => nameOf(s, id) === "Forest") as string;
    const dragon = s.exile.find((id) => nameOf(s, id) === "Shivan Dragon") as string;
    expect(forest).toBeDefined();
    expect(castable(s, dragon)).toBe(true);
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === forest)).toBe(false);
  });

  it("Dream Harvest: a modal card's spell face is cast, its land back face can't be played (PLAN-M M8b)", () => {
    const SINK = "Sink into Stupor // Soporific Springs";
    let s = scenario({
      p1: { battlefield: lands("Island", 7), hand: ["Dream Harvest"] },
      p2: { battlefield: ["Bear Cub"], library: [SINK, "Bear Cub", "Forest"] },
    });
    s = settle(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Dream Harvest") }));
    // Sink into Stupor (3) and Bear Cub (2): total 5.
    const sink = s.exile.find((id) => nameOf(s, id) === SINK) as string;
    expect(sink).toBeDefined();
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === sink)).toBe(false);
    expect(castable(s, sink)).toBe(true);
  });

  it("Lluwen: discard a land card (and only a land): a Worm per land in the graveyard", () => {
    let s = scenario({
      p1: {
        battlefield: ["Lluwen, Imperfect Naturalist", ...lands("Swamp", 5)],
        hand: ["Bear Cub", "Forest"],
        graveyard: ["Forest"],
      },
    });
    const lluwen = idOf(s, "p1", "battlefield", "Lluwen, Imperfect Naturalist");
    expect(() =>
      act(s, "p1", { type: "activate", source: lluwen, ability: 1, discard: [idOf(s, "p1", "hand", "Bear Cub")] }),
    ).toThrow();
    s = settle(act(s, "p1", { type: "activate", source: lluwen, ability: 1, discard: [idOf(s, "p1", "hand", "Forest")] }));
    expect(s.battlefield.filter((id) => chars(s, id).name === "Worm")).toHaveLength(2);
  });

  it("Celestial Reunion: the card found goes onto the battlefield if you behold two creatures of its type", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 3), "Llanowar Elves"],
        hand: ["Celestial Reunion", "Llanowar Elves"],
        library: [elfWarrior],
      },
    });
    s = chooseWanted(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Celestial Reunion"), x: 2 }), [
      s.players.p1?.library[0] as string,
    ]);
    expect(idsOf(s, "p1", "battlefield", elfWarrior.name)).toHaveLength(1);
    let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Celestial Reunion"], library: [elfWarrior] } });
    t = chooseWanted(act(t, "p1", { type: "cast", card: idOf(t, "p1", "hand", "Celestial Reunion"), x: 2 }), [
      t.players.p1?.library[0] as string,
    ]);
    expect(idsOf(t, "p1", "hand", elfWarrior.name)).toHaveLength(1);
  });

  it("Raiding Schemes: tapping two creatures of the noncreature spell's color copies it", () => {
    let s = scenario({
      p1: {
        battlefield: ["Raiding Schemes", "Mountain", "Mountain", "Shivan Dragon", "Shivan Dragon"],
        hand: ["Lightning Strike"],
      },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Lightning Strike"), targets: { t: ["p2"] } });
    s = chooseWanted(s, []);
    expect(s.players.p2?.life).toBe(14);
  });

  it("Sanar: reveals up to X nonland cards, exiles one per color, playable this turn", () => {
    let s = scenario({
      p1: {
        battlefield: ["Sanar, Innovative First-Year", "Llanowar Elves"],
        library: ["Forest", "Shivan Dragon", "Bear Cub", "Giant Growth", "Opt"],
      },
      step: "upkeep",
    });
    s = passAccepting(
      s,
      (x) => x.turn.step === "main1" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
    );
    // Colors of your permanents: red, blue (Sanar), green (Llanowar); X = 3: Shivan Dragon, Bear Cub, Giant Growth.
    const exiled = s.exile.map((id) => nameOf(s, id));
    expect(exiled).toContain("Shivan Dragon");
    expect(exiled.filter((n) => n === "Bear Cub" || n === "Giant Growth")).toHaveLength(1);
    expect(s.players.p1?.library.length).toBe(5 - exiled.length - 1);
  });
});

describe("Lorwyn Eclipsed, batch D (replacements of families H and I, R1)", () => {
  const settleAll = (s: S) =>
    passAccepting(s, (x) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority");
  const resolutionOf = (s: S, controller: string, sourceId: string) =>
    ({
      item: { id: "x", controller, sourceId, sourceDefId: s.objects[sourceId]?.defId, targets: {} },
      controller,
      targets: {},
      vars: {},
      pc: 0,
    }) as never as Parameters<typeof runEffect>[1];

  it("Blossombind: the enchanted creature is tapped, no longer untaps and can't get counters", () => {
    let s = scenario({ p1: { battlefield: ["Island", "Island"], hand: ["Blossombind"] }, p2: { battlefield: ["Bear Cub"] } });
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s = settleAll(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Blossombind"), targets: { enchant: [bear] } }));
    expect(s.objects[bear]?.tapped).toBe(true);
    runEffect(s, resolutionOf(s, "p1", bear), dsl.fx.untap(dsl.ref.self));
    expect(s.objects[bear]?.tapped).toBe(true);
    runEffect(s, resolutionOf(s, "p1", bear), dsl.fx.addCounters(dsl.ref.self, 2));
    expect(s.objects[bear]?.counters["+1/+1"] ?? 0).toBe(0);
    s = advanceUntil(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
    expect(s.objects[bear]?.tapped).toBe(true);
  });

  it("Mornsong Aria: nobody draws or gains life; at their draw step, each loses 3 life and searches for a card", () => {
    let s = scenario({
      p1: { battlefield: ["Mornsong Aria"], library: ["Forest", "Shivan Dragon", "Island"] },
      p2: { library: ["Forest", "Forest"] },
      step: "end",
    });
    const before = s.players.p2?.hand.length ?? 0;
    s = passAccepting(s, (x) => x.turn.number === 4 && x.turn.step === "main1");
    expect(s.players.p2?.life).toBe(17);
    expect((s.players.p2?.hand.length ?? 0) - before).toBe(1);
    expect(s.players.p2?.library).toHaveLength(1);
    runEffect(s, resolutionOf(s, "p1", idOf(s, "p1", "battlefield", "Mornsong Aria")), dsl.fx.gainLife(5));
    expect(s.players.p1?.life).toBe(20);
  });

  it("Lavaleaper: creatures have haste; a tapped basic land produces one more mana, for each", () => {
    let s = scenario({ p1: { battlefield: ["Lavaleaper", "Mountain"] }, p2: { battlefield: ["Forest", "Bear Cub"] } });
    expect(chars(s, idOf(s, "p2", "battlefield", "Bear Cub")).keywords).toContain("haste");
    s = act(s, "p1", { type: "tapForMana", source: idOf(s, "p1", "battlefield", "Mountain"), ability: 0 });
    expect(s.players.p1?.manaPool.R).toBe(2);
  });

  it("Shimmerwilds Growth: the enchanted land is the chosen color and produces one mana of that color in addition", () => {
    let s = scenario({ p1: { battlefield: ["Forest", "Forest", "Island"], hand: ["Shimmerwilds Growth"] } });
    const island = idOf(s, "p1", "battlefield", "Island");
    s = chooseWanted(
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Shimmerwilds Growth"), targets: { enchant: [island] } }),
      ["R"],
    );
    expect(chars(s, island).colors).toEqual(["R"]);
    s = act(s, "p1", { type: "tapForMana", source: island, ability: 0 });
    expect(s.players.p1?.manaPool.U).toBe(1);
    expect(s.players.p1?.manaPool.R).toBe(1);
  });

  it('"Remove a counter from this creature": the kind is chosen by the player (PLAN-D, D7)', () => {
    const s = scenario({ p1: { battlefield: ["Moonlit Lamenter", "Plains", "Plains"], library: lands("Plains", 2) } });
    const lamenter = idOf(s, "p1", "battlefield", "Moonlit Lamenter");
    const o = s.objects[lamenter];
    if (o) o.counters = { "-1/-1": 1, oil: 1 };
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === lamenter);
    const pick = opt?.type === "activate" ? opt.picks?.find((p) => p.slot === "counterKind") : undefined;
    expect([...(pick?.options ?? [])].sort()).toEqual(["-1/-1", "oil"]);
    expect(pick?.suggested).toEqual(["-1/-1"]);
    expect(plainText(pick?.labels?.oil ?? "")).toBe("Oil counter (1)");
    if (opt?.type !== "activate") throw new Error("ability not offered");
    expect(() =>
      act(s, "p1", { type: "activate", source: lamenter, ability: opt.ability, picks: { counterKind: ["stun"] } }),
    ).toThrow(RulesError);
    const t = act(s, "p1", { type: "activate", source: lamenter, ability: opt.ability, picks: { counterKind: ["oil"] } });
    expect(t.objects[lamenter]?.counters["-1/-1"]).toBe(1);
    expect(t.objects[lamenter]?.counters.oil ?? 0).toBe(0);
    // With no choice: the −1/−1 first.
    const u = act(s, "p1", { type: "activate", source: lamenter, ability: opt.ability });
    expect(u.objects[lamenter]?.counters["-1/-1"] ?? 0).toBe(0);
    expect(u.objects[lamenter]?.counters.oil).toBe(1);
  });

  it("Mirrormind Crown: the first token creation of the turn may give copies of the equipped creature", () => {
    const s = scenario({ p1: { battlefield: ["Mirrormind Crown", "Pelakka Wurm"] } });
    const crown = idOf(s, "p1", "battlefield", "Mirrormind Crown");
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const c = s.objects[crown];
    if (c) c.attachedTo = wurm;
    // "You may" (PLAN-D, D7): the question is asked before any creation.
    const two = dsl.fx.createTokens(ELF_TOKEN, 2);
    const r1 = resolutionOf(s, "p1", crown);
    const asked = runEffect(s, r1, two);
    expect(asked && "ask" in asked ? asked.ask.request.type : undefined).toBe("yesNo");
    expect(s.battlefield.filter((id) => chars(s, id).name === "Elfe")).toHaveLength(0);
    r1.vars[`${r1.pc}:copies:p1`] = [1];
    runEffect(s, r1, two);
    expect(s.battlefield.filter((id) => chars(s, id).name === "Pelakka Wurm")).toHaveLength(3);
    runEffect(s, resolutionOf(s, "p1", crown), dsl.fx.createTokens(ELF_TOKEN, 1));
    expect(s.battlefield.filter((id) => chars(s, id).name === "Elfe")).toHaveLength(1);
    // Another turn: declined, Elves; the first time of the turn is still passed.
    s.turn.onceFired = [];
    const r2 = resolutionOf(s, "p1", crown);
    r2.vars[`${r2.pc}:copies:p1`] = [0];
    runEffect(s, r2, two);
    expect(s.battlefield.filter((id) => chars(s, id).name === "Elfe")).toHaveLength(3);
    expect(runEffect(s, resolutionOf(s, "p1", crown), dsl.fx.createTokens(ELF_TOKEN, 1))).toBeUndefined();
    expect(s.battlefield.filter((id) => chars(s, id).name === "Pelakka Wurm")).toHaveLength(3);
  });
});

// Cards from the Standard meta decks (PLAN-C in docs/history.md, batch C13).
describe("Lorwyn Eclipsed: shock lands of the Standard meta", () => {
  const SHOCKS: [string, string[], [string, string]][] = [
    ["Hallowed Fountain", ["Plains", "Island"], ["W", "U"]],
    ["Temple Garden", ["Forest", "Plains"], ["G", "W"]],
    ["Overgrown Tomb", ["Swamp", "Forest"], ["B", "G"]],
    ["Blood Crypt", ["Swamp", "Mountain"], ["B", "R"]],
  ];
  for (const [name, types, colors] of SHOCKS) {
    it(`${name}: on entering, pay 2 life, otherwise it enters tapped; it produces {${colors[0]}} or {${colors[1]}}`, () => {
      const base = scenario({ p1: { hand: [name] } });
      const land = idOf(base, "p1", "hand", name);
      const plays = legalActions(base, "p1").filter((a) => a.type === "playLand" && a.card === land);
      expect(plays.map((a) => a.type === "playLand" && !!a.payLife).sort()).toEqual([false, true]);
      // Pay 2 life: untapped.
      let s = act(base, "p1", { type: "playLand", card: land, payLife: true });
      const paid = idOf(s, "p1", "battlefield", name);
      expect(s.players.p1?.life).toBe(18);
      expect(s.objects[paid]?.tapped).toBe(false);
      expect(chars(s, paid).subtypes.slice().sort()).toEqual(types.slice().sort());
      const abilities = manaAbilitiesOf(s, paid);
      expect(abilities.flatMap((m) => m.produce).sort()).toEqual(colors.slice().sort());
      for (const color of colors) {
        const ability = abilities.findIndex((m) => m.produce.includes(color as Color));
        const t = act(s, "p1", { type: "tapForMana", source: paid, ability, color: color as Color });
        expect(t.players.p1?.manaPool[color as Color]).toBe(1);
      }
      // Don't pay: tapped, with no life loss.
      s = act(base, "p1", { type: "playLand", card: land });
      expect(s.players.p1?.life).toBe(20);
      expect(s.objects[idOf(s, "p1", "battlefield", name)]?.tapped).toBe(true);
    });
  }

  it("you can't pay 2 life with less than 2 life: the land enters tapped", () => {
    const s = scenario({ p1: { life: 1, hand: ["Blood Crypt"] } });
    const land = idOf(s, "p1", "hand", "Blood Crypt");
    expect(legalActions(s, "p1").some((a) => a.type === "playLand" && a.card === land && a.payLife)).toBe(false);
  });
});

describe("Shock lands put onto the battlefield by an effect (batch K3)", () => {
  const fetch = (tapped: boolean) =>
    customCard({
      name: tapped ? "Search tapped" : "Search",
      typeLine: "Sorcery",
      types: ["Sorcery"],
      spell: dsl.spell([], [dsl.fx.search({ types: ["Land"] }, { to: "battlefield", tapped })]),
    });
  const run = (answer: 0 | 1 | null, tapped = false) => {
    const card = fetch(tapped);
    let s = scenario({ p1: { hand: [card], library: ["Blood Crypt", "Island"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", card.name) });
    const asked: string[] = [];
    for (let i = 0; i < 20 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice") {
        asked.push(p.request.type);
        const r = p.request;
        const values =
          r.type === "yesNo"
            ? [answer ?? 0]
            : r.type === "pick"
              ? r.options.filter((o) => nameOfId(s, o) === "Blood Crypt")
              : r.suggested;
        s = act(s, p.player, { type: "choose", values });
      } else break;
    }
    const crypt = s.battlefield.find((id) => nameOfId(s, id) === "Blood Crypt");
    return { s, crypt, asked };
  };
  const nameOfId = (s: GameState, id: string) => s.defs[s.objects[id]?.defId ?? ""]?.name;

  it("the player may pay 2 life for it to enter untapped", () => {
    const yes = run(1);
    expect(yes.asked).toContain("yesNo");
    expect(yes.crypt && yes.s.objects[yes.crypt]?.tapped).toBe(false);
    expect(yes.s.players.p1?.life).toBe(18);
    const no = run(0);
    expect(no.crypt && no.s.objects[no.crypt]?.tapped).toBe(true);
    expect(no.s.players.p1?.life).toBe(20);
  });

  it("put onto the battlefield tapped: no question, no life paid", () => {
    const t = run(null, true);
    expect(t.asked).not.toContain("yesNo");
    expect(t.crypt && t.s.objects[t.crypt]?.tapped).toBe(true);
    expect(t.s.players.p1?.life).toBe(20);
  });
});

describe("Behold or pay (PLAN-D, D2)", () => {
  it("Kinsbaile Aspirant: behold a Kithkin you control ({W}), otherwise {2} more", () => {
    const castable = (battlefield: string[]) => {
      const s = scenario({ p1: { battlefield, hand: ["Kinsbaile Aspirant"] } });
      return legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Kinsbaile Aspirant"));
    };
    expect(castable(["Plains", "Goldmeadow Nomad"])).toBe(true);
    expect(castable(["Plains", "Bear Cub"])).toBe(false);
    expect(castable(["Plains", "Plains", "Plains", "Bear Cub"])).toBe(true);
    // Declining to behold with a single land: {2} more, refused.
    const s = scenario({ p1: { battlefield: ["Plains", "Goldmeadow Nomad"], hand: ["Kinsbaile Aspirant"] } });
    expect(() =>
      act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Kinsbaile Aspirant"), picks: { behold: [] } }),
    ).toThrow();
  });
});

describe("Lorwyn Eclipsed, PLAN-D D9: last rares and uncommons", () => {
  type Pick = Extract<ChoiceRequest, { type: "pick" }>;
  const done = (x: S) => x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority";
  const pickPending = (x: S) => x.pending?.kind === "choice" && x.pending.request.type === "pick";
  /** Passes (suggested answers) until the next "pick" choice or an empty stack. */
  const toPick = (s: S) => passAccepting(s, (x) => pickPending(x) || done(x));
  const pickRequest = (s: S) => (s.pending?.kind === "choice" ? (s.pending.request as Pick) : undefined);
  /** Answers `values` to the pending choice, then lets everything resolve. */
  const answer = (s: S, values: string[]) => {
    if (s.pending?.kind !== "choice") throw new Error("no pending choice");
    return passAccepting(act(s, s.pending.player, { type: "choose", values }), done);
  };
  const cast = (s: S, name: string, extra: Record<string, unknown> = {}, player = "p1") =>
    act(s, player, { type: "cast", card: idOf(s, player, "hand", name), ...extra });
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const handNames = (s: S, p = "p1") => (s.players[p]?.hand ?? []).map((id) => nameOf(s, id));
  const libNames = (s: S) => (s.players.p1?.library ?? []).map((id) => nameOf(s, id));
  const exiledNames = (s: S) => s.exile.map((id) => nameOf(s, id));
  const leave = (s: S, id: string) => {
    simultaneously(s, () => destroy(s, id));
    return passAccepting(act(s, "p1", { type: "pass" }), done);
  };

  it("Champion of the Path: exiles an Elemental as a cost; each of your other Elementals that enters damages each opponent by its power; the exiled card returns to hand", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Mountain", 4), ...lands("Island", 3), ...lands("Forest", 2)],
        hand: ["Champion of the Path", "Fire Elemental", "Rimekin Recluse", "Bear Cub"],
      },
    });
    // With no Elemental to exile, it can't be cast.
    const none = scenario({ p1: { battlefield: [...lands("Mountain", 4), "Bear Cub"], hand: ["Champion of the Path"] } });
    expect(castOption(none, idOf(none, "p1", "hand", "Champion of the Path"))).toBeUndefined();
    // An Elemental card from hand is exiled; the Champion (an Elemental) doesn't trigger itself.
    const fire = idOf(s, "p1", "hand", "Fire Elemental");
    s = passAccepting(cast(s, "Champion of the Path", { picks: { costExile: [fire] } }), done);
    expect(exiledNames(s)).toEqual(["Fire Elemental"]);
    const champ = idOf(s, "p1", "battlefield", "Champion of the Path");
    expect(pt(s, champ)).toEqual([7, 3]);
    expect(s.players.p2?.life).toBe(20);
    // Another Elemental enters: damage equal to ITS power (3), not the Champion's.
    s = toPick(cast(s, "Rimekin Recluse"));
    if (pickPending(s)) s = answer(s, []);
    expect(s.players.p2?.life).toBe(17);
    // A creature that isn't an Elemental: nothing.
    s = passAccepting(cast(s, "Bear Cub"), done);
    expect(s.players.p2?.life).toBe(17);
    // The Champion leaves: the exiled card returns to its owner's hand.
    s = leave(s, champ);
    expect(handNames(s)).toContain("Fire Elemental");
    expect(s.exile).toHaveLength(0);

    // An opposing Elemental that enters triggers nothing.
    let t = scenario({
      p1: { battlefield: ["Champion of the Path"] },
      p2: { battlefield: lands("Mountain", 5), hand: ["Fire Elemental"] },
      active: "p2",
    });
    t = passAccepting(cast(t, "Fire Elemental", {}, "p2"), done);
    expect(idsOf(t, "p2", "battlefield", "Fire Elemental")).toHaveLength(1);
    expect([t.players.p1?.life, t.players.p2?.life]).toEqual([20, 20]);
  });

  it("Champions of the Perfect: exiles an Elf as a cost; each creature spell cast draws; the exiled card returns to hand", () => {
    let s = scenario({
      p1: {
        battlefield: [...lands("Forest", 7), "Llanowar Elves"],
        hand: ["Champions of the Perfect", "Bear Cub", "Giant Growth"],
        library: ["Opt", "Island", "Plains", "Swamp"],
      },
    });
    const none = scenario({ p1: { battlefield: [...lands("Forest", 4), "Bear Cub"], hand: ["Champions of the Perfect"] } });
    expect(castOption(none, idOf(none, "p1", "hand", "Champions of the Perfect"))).toBeUndefined();
    // An Elf you control is exiled; casting the Champions themselves doesn't draw.
    const elves = idOf(s, "p1", "battlefield", "Llanowar Elves");
    s = passAccepting(cast(s, "Champions of the Perfect", { picks: { costExile: [elves] } }), done);
    expect(exiledNames(s)).toEqual(["Llanowar Elves"]);
    expect(idsOf(s, "p1", "battlefield", "Llanowar Elves")).toHaveLength(0);
    const champ = idOf(s, "p1", "battlefield", "Champions of the Perfect");
    expect(pt(s, champ)).toEqual([6, 6]);
    expect(handNames(s).sort()).toEqual(["Bear Cub", "Giant Growth"]);
    // A creature spell: the ability triggers on cast (the creature is still on the stack).
    s = cast(s, "Bear Cub");
    expect(s.stack.map((i) => i.kind)).toEqual(["spell", "ability"]);
    s = passAccepting(s, done);
    expect(handNames(s).sort()).toEqual(["Giant Growth", "Opt"]);
    // A noncreature spell: no draw.
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = passAccepting(cast(s, "Giant Growth", { targets: { t: [bear] } }), done);
    expect(handNames(s)).toEqual(["Opt"]);
    // The Champions leave: the exiled Elf returns to hand.
    s = leave(s, champ);
    expect(handNames(s).sort()).toEqual(["Llanowar Elves", "Opt"]);
  });

  it("Disruptor of Currents: flash and convoke; on entering, returns up to one other nonland permanent", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 2), "Bear Cub", "Bear Cub", "Bear Cub"], hand: ["Disruptor of Currents"] },
      p2: { battlefield: ["Serra Angel", "Fishing Pole", "Forest"] },
      active: "p2",
    });
    // Flash: cast during the opponent's turn.
    s = act(s, "p2", { type: "pass" });
    expect(s.pending?.kind === "priority" && s.pending.player).toBe("p1");
    const disruptor = idOf(s, "p1", "hand", "Disruptor of Currents");
    expect(castOption(s, disruptor)).toBeDefined();
    // Convoke: two Islands for {U}{U}, three creatures for {3}.
    const bears = idsOf(s, "p1", "battlefield", "Bear Cub");
    s = toPick(act(s, "p1", { type: "cast", card: disruptor, picks: { convoke: bears } }));
    expect(bears.map((id) => s.objects[id]?.tapped)).toEqual([true, true, true]);
    // Targets: another nonland permanent (the creatures and the artifact), neither a land nor itself.
    const req = pickRequest(s);
    const self = idOf(s, "p1", "battlefield", "Disruptor of Currents");
    const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(req?.options).toEqual(expect.arrayContaining([pole, angel, ...bears]));
    expect(req?.options).not.toContain(self);
    expect(req?.options).not.toContain(idOf(s, "p2", "battlefield", "Forest"));
    expect(req?.options).not.toContain(idOf(s, "p1", "battlefield", "Island"));
    expect(req?.min ?? 0).toBe(0);
    s = answer(s, [pole]);
    expect(handNames(s, "p2")).toEqual(["Fishing Pole"]);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });

  it("Blossoming Defense: a creature you control gets +2/+2 and hexproof until end of turn", () => {
    let s = scenario({
      p1: { battlefield: ["Forest", "Bear Cub"], hand: ["Blossoming Defense"] },
      p2: { battlefield: ["Serra Angel", ...lands("Mountain", 2)], hand: ["Lightning Strike"] },
    });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    // Not an opposing creature.
    expect(() => cast(s, "Blossoming Defense", { targets: { t: [angel] } })).toThrow(RulesError);
    s = passAccepting(cast(s, "Blossoming Defense", { targets: { t: [bear] } }), done);
    expect(pt(s, bear)).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toContain("hexproof");
    // The opponent can no longer target it.
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.kind === "priority" && s.pending.player).toBe("p2");
    expect(() => cast(s, "Lightning Strike", { targets: { t: [bear] } }, "p2")).toThrow(RulesError);
    // Until end of turn only.
    s = advanceUntil(s, (x) => x.turn.number === 4);
    expect(pt(s, bear)).toEqual([2, 2]);
    expect(chars(s, bear).keywords).not.toContain("hexproof");
  });

  it("Chomping Changeling: changeling (all creature types); on entering, destroys up to one artifact or enchantment", () => {
    let s = scenario({
      p1: { battlefield: lands("Forest", 3), hand: ["Chomping Changeling"] },
      p2: { battlefield: ["Serra Angel", "Fishing Pole"] },
    });
    s = toPick(cast(s, "Chomping Changeling"));
    const changeling = idOf(s, "p1", "battlefield", "Chomping Changeling");
    for (const subtype of ["Goblin", "Elf", "Merfolk", "Elemental", "Kithkin"])
      expect(matchesObjectFilter(s, "p1", changeling, { subtype })).toBe(true);
    const pole = idOf(s, "p2", "battlefield", "Fishing Pole");
    const req = pickRequest(s);
    expect(req?.options).toEqual([pole]);
    expect(req?.min ?? 0).toBe(0);
    s = answer(s, [pole]);
    expect(idsOf(s, "p2", "graveyard", "Fishing Pole")).toHaveLength(1);
    expect(idsOf(s, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
    // "Up to one": with no target, the ability does nothing.
    let t = scenario({ p1: { battlefield: lands("Forest", 3), hand: ["Chomping Changeling"] } });
    t = passAccepting(cast(t, "Chomping Changeling"), done);
    expect(idsOf(t, "p1", "battlefield", "Chomping Changeling")).toHaveLength(1);
  });

  /**
   * "Eclipsed" cycle: look at the top four cards, reveal at most one card of the given types (a changeling
   * or tribe card counts), the rest on the bottom in a random order.
   */
  const eclipsed = (card: string, mana: string[], library: string[], fits: string[], take: string) => {
    let s = scenario({ p1: { battlefield: mana, hand: [card], library } });
    const top4 = s.players.p1?.library.slice(0, 4) as string[];
    s = toPick(cast(s, card));
    const req = pickRequest(s);
    expect((req?.options ?? []).map((id) => nameOf(s, id)).sort()).toEqual(fits.slice().sort());
    expect(req?.min ?? 0).toBe(0);
    expect(req?.max).toBe(1);
    const chosen = (req?.options ?? []).find((id) => nameOf(s, id) === take) as string;
    s = answer(s, [chosen]);
    expect(handNames(s)).toEqual([take]);
    // The rest: on the bottom of the library (the fifth card goes on top).
    const lib = s.players.p1?.library ?? [];
    expect(nameOf(s, lib[0] as string)).toBe(library[4]);
    expect(lib.slice(-3).sort()).toEqual(top4.filter((id) => id !== chosen).sort());
    // "You may": take nothing, the four cards go on the bottom.
    let t = scenario({ p1: { battlefield: mana, hand: [card], library } });
    t = answer(toPick(cast(t, card)), []);
    expect(t.players.p1?.hand).toHaveLength(0);
    expect(libNames(t)[0]).toBe(library[4]);
    expect(libNames(t).slice(-4).sort()).toEqual(library.slice(0, 4).sort());
  };

  it("Eclipsed Boggart: among four cards, a Goblin, a Swamp or a Mountain to hand; the rest on the bottom", () => {
    eclipsed(
      "Eclipsed Boggart",
      lands("Swamp", 3),
      ["Boggart Mischief", "Blood Crypt", "Bear Cub", "Chomping Changeling", "Mountain"],
      ["Boggart Mischief", "Blood Crypt", "Chomping Changeling"],
      "Blood Crypt",
    );
  });

  it("Eclipsed Flamekin: among four cards, an Elemental, an Island or a Mountain to hand; the rest on the bottom", () => {
    eclipsed(
      "Eclipsed Flamekin",
      lands("Island", 3),
      ["Fire Elemental", "Forest", "Island", "Silvergill Peddler", "Mountain"],
      ["Fire Elemental", "Island"],
      "Fire Elemental",
    );
  });

  it("Eclipsed Merrow: among four cards, a Merfolk, a Plains or an Island to hand; the rest on the bottom", () => {
    eclipsed(
      "Eclipsed Merrow",
      lands("Plains", 3),
      ["Silvergill Peddler", "Hallowed Fountain", "Swamp", "Goldmeadow Nomad", "Plains"],
      ["Silvergill Peddler", "Hallowed Fountain"],
      "Silvergill Peddler",
    );
  });

  it("Rimekin Recluse: on entering, returns up to one other creature to its owner's hand", () => {
    let s = scenario({
      p1: { battlefield: [...lands("Island", 3), "Bear Cub"], hand: ["Rimekin Recluse"] },
      p2: { battlefield: ["Serra Angel", "Fishing Pole"] },
    });
    s = toPick(cast(s, "Rimekin Recluse"));
    const recluse = idOf(s, "p1", "battlefield", "Rimekin Recluse");
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const req = pickRequest(s);
    // Only one creature (not the artifact), and not itself.
    expect(req?.options.slice().sort()).toEqual([angel, bear].sort());
    expect(req?.options).not.toContain(recluse);
    expect(req?.min ?? 0).toBe(0);
    s = answer(s, [angel]);
    expect(handNames(s, "p2")).toEqual(["Serra Angel"]);
    expect(pt(s, recluse)).toEqual([3, 2]);
    // "Up to one": no target chosen, no card returns.
    let t = scenario({
      p1: { battlefield: lands("Island", 3), hand: ["Rimekin Recluse"] },
      p2: { battlefield: ["Serra Angel"] },
    });
    t = toPick(cast(t, "Rimekin Recluse"));
    t = answer(t, []);
    expect(idsOf(t, "p2", "battlefield", "Serra Angel")).toHaveLength(1);
  });
});

describe('PLAN-A A3: Pyrrhic Strike, "if the additional cost was paid, choose both instead"', () => {
  it("blight 2 paid: a single mode is refused", () => {
    const s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Plains", "Fire Elemental"], hand: ["Pyrrhic Strike"] },
      p2: { battlefield: ["Fishing Pole", "Shivan Dragon"] },
    });
    const card = idOf(s, "p1", "hand", "Pyrrhic Strike");
    const targets = { a: [idOf(s, "p2", "battlefield", "Fishing Pole")] };
    expect(() => act(s, "p1", { type: "cast", card, mode: 0, targets, kicked: true })).toThrow(RulesError);
    const t = act(s, "p1", { type: "cast", card, mode: 0, targets });
    expect(t.objects[idOf(t, "p1", "battlefield", "Fire Elemental")]?.counters["-1/-1"] ?? 0).toBe(0);
    const option = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card);
    expect(option?.type === "cast" && option.modes.map((m) => [m.index, !!m.requiresKicker, !!m.forbidsKicker])).toEqual([
      [0, false, true],
      [1, false, true],
      [2, true, false],
    ]);
  });
});

describe("player attacked (PLAN-H, lot H5)", () => {
  it("Swat Away: {2} less only if a creature attacks you (not another player, not your planeswalker)", () => {
    const run = (defender: "p1" | "p3" | "walker") => {
      let s = scenario({
        players: 3,
        active: "p2",
        p1: { battlefield: ["Island", "Island", "Ajani Resolute"], hand: ["Swat Away"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const target = defender === "walker" ? idOf(s, "p1", "battlefield", "Ajani Resolute") : defender;
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", {
        type: "declareAttackers",
        attackers: [{ id: idOf(s, "p2", "battlefield", "Bear Cub"), defender: target }],
      });
      for (let i = 0; i < 5 && !(s.pending?.kind === "priority" && s.pending.player === "p1"); i++)
        if (s.pending?.kind === "priority") s = act(s, s.pending.player, { type: "pass" });
      const swat = idOf(s, "p1", "hand", "Swat Away");
      return legalActions(s, "p1").some((a) => a.type === "cast" && a.card === swat);
    };
    expect(run("p1")).toBe(true);
    expect(run("p3")).toBe(false);
    expect(run("walker")).toBe(false);
  });
});
