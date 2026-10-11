/**
 * PLAN-J: single-card forms of the model replaced by generic ones (debt pass of 2026-10-09). One test per removed
 * variant or field, on the card that used it, for the cases the merge could have changed.
 */
import { describe, expect, it } from "vitest";
import { dealDamage, sourceFromObject } from "../src/actions";
import { addEffect } from "../src/effects";
import { submit } from "../src/game";
import { legalActions } from "../src/legal";
import { bump, chars, moveObject } from "../src/state";
import { matchesObjectFilter } from "../src/targets";
import { filterEvents } from "../src/view";
import { advanceUntil, cast, idOf, lands, scenario, settle } from "./helpers";

describe("PLAN-J J1: exact merges into existing forms", () => {
  it("Ketramose (exileAtLeast → count of exile): face-down cards and every owner's cards count", () => {
    const s = scenario({
      p1: { battlefield: ["Ketramose, the New Dawn"], graveyard: lands("Plains", 4) },
      p2: { graveyard: lands("Swamp", 3) },
    });
    const ketramose = idOf(s, "p1", "battlefield", "Ketramose, the New Dawn");
    const exile = (p: "p1" | "p2", faceDown: boolean) => {
      const id = s.players[p]?.graveyard[0] ?? "";
      const n = moveObject(s, id, "exile") ?? "";
      if (faceDown) (s.objects[n] as { exiledFaceDown?: string[] }).exiledFaceDown = [p];
      bump(s);
    };
    for (let i = 0; i < 4; i++) exile("p1", i % 2 === 0);
    for (let i = 0; i < 2; i++) exile("p2", false);
    // Six cards in exile: can't attack or block.
    expect(chars(s, ketramose).keywords).toEqual(expect.arrayContaining(["cantAttack", "cantBlock"]));
    exile("p2", true);
    // Seven, two of them face down and three of them the opponent's.
    expect(chars(s, ketramose).keywords).not.toContain("cantAttack");
  });

  it("Sab-Sunen (evenCounters → odd amount): an odd number of counters of any kind", () => {
    const s = scenario({ p1: { battlefield: [{ name: "Sab-Sunen, Luxa Embodied", counters: { "+1/+1": 2 } }] } });
    const sab = idOf(s, "p1", "battlefield", "Sab-Sunen, Luxa Embodied");
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
    const o = s.objects[sab];
    if (o) o.counters = { "+1/+1": 2, stun: 1 };
    bump(s);
    expect(chars(s, sab).keywords).toContain("cantAttack");
    if (o) o.counters = {};
    bump(s);
    expect(chars(s, sab).keywords).not.toContain("cantAttack");
  });

  it("Wojek Investigator (opponentsWithMoreInHand → players where): only opponents with strictly more cards", () => {
    let s = scenario({
      players: 3,
      turn: 2,
      active: "p3",
      p1: { battlefield: ["Wojek Investigator"], hand: ["Opt"] },
      p2: { hand: ["Opt", "Opt"] },
      p3: { hand: ["Opt"] },
    });
    const clues = (x: typeof s) =>
      x.battlefield.filter((id) => x.objects[id]?.controller === "p1" && chars(x, id).name === "Clue").length;
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "draw");
    // p2 has more cards than p1 (2 > 1), p3 the same number: a single Clue.
    expect(clues(s)).toBe(1);
  });
});

describe("PLAN-J J4a [rules 179]: the turn log carries the objects of damage and untaps", () => {
  it('"was dealt damage this turn" also counts damage no longer marked (removed by regeneration)', () => {
    const s = scenario({ p1: { battlefield: ["Shivan Dragon"] }, p2: { battlefield: ["Serra Angel"] } });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    expect(matchesObjectFilter(s, "p1", angel, { damaged: true })).toBe(false);
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Shivan Dragon")), angel, 2, false);
    const o = s.objects[angel];
    if (o) o.damage = 0;
    bump(s);
    expect(matchesObjectFilter(s, "p1", angel, { damaged: true })).toBe(true);
  });

  it("The Millennium Calendar: nothing untapped during your untap step, no trigger", () => {
    let s = scenario({ p1: { battlefield: ["The Millennium Calendar", "Forest"] }, active: "p2", step: "end", turn: 2 });
    s = advanceUntil(s, (x) => x.turn.active === "p1" && x.turn.step === "main1" && x.stack.length === 0);
    const cal = idOf(s, "p1", "battlefield", "The Millennium Calendar");
    expect(s.objects[cal]?.counters.time ?? 0).toBe(0);
    expect(s.turnLog.some((e) => e.e === "untap")).toBe(false);
  });
});

describe("PLAN-J J5 [rules 182]: small approximation lifts", () => {
  it("Thousand Moons Infantry: untaps during the opponent's untap step (no trigger at the upkeep)", () => {
    let s = scenario({ p1: { battlefield: [{ name: "Thousand Moons Infantry", tapped: true }] }, active: "p1", step: "end" });
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.turn.step === "upkeep");
    const inf = idOf(s, "p1", "battlefield", "Thousand Moons Infantry");
    expect(s.objects[inf]?.tapped).toBe(false);
    expect(s.stack).toHaveLength(0);
  });

  it("Hancock, Ghoulish Mayor: X counts counters of any kind", () => {
    const s = scenario({
      p1: { battlefield: [{ name: "Hancock, Ghoulish Mayor", counters: { "+1/+1": 1, shield: 1 } }, "Glowing One"] },
    });
    // Glowing One (Zombie Mutant 1/1 printed): +2/+2 for two counters of two kinds.
    const one = idOf(s, "p1", "battlefield", "Glowing One");
    const printed = s.defs[s.objects[one]?.defId ?? ""]?.power ?? 0;
    expect(chars(s, one).power).toBe(printed + 2);
  });

  it("Sorcerous Spyglass: as it enters, its controller (only) looks at an opponent's hand, then names a card", () => {
    const s = scenario({
      p1: { battlefield: lands("Island", 2), hand: ["Sorcerous Spyglass"] },
      p2: { hand: ["Shock", "Island"] },
    });
    let r = submit(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sorcerous Spyglass") });
    const events = [...r.events];
    for (let i = 0; i < 20 && r.state.pending && (r.state.stack.length || r.state.pending.kind === "choice"); i++) {
      const p = r.state.pending;
      r =
        p.kind === "choice"
          ? submit(r.state, p.player, {
              type: "choose",
              values: [String(p.request.type === "name" ? "Shock" : (p.request as { suggested: unknown[] }).suggested[0])],
            })
          : submit(r.state, p.player, { type: "pass" });
      events.push(...r.events);
    }
    const look = events.find((e) => e.type === "reveal" && e.look);
    expect(look?.type === "reveal" && look.defIds.map((d) => s.defs[d]?.name).sort()).toEqual(["Island", "Shock"]);
    expect(filterEvents(events, "p2").some((e) => e.type === "reveal" && e.look)).toBe(false);
  });

  it("Riku of Many Paths: Expel the Interlopers (a number to choose) is not a modal spell", () => {
    let s = scenario({
      p1: { battlefield: ["Riku of Many Paths", ...lands("Plains", 5)], hand: ["Expel the Interlopers"] },
    });
    // Since PLAN-M M8a, the number is chosen as it resolves (a single mode).
    s = cast(s, "p1", "Expel the Interlopers");
    expect(s.triggers).toHaveLength(0);
    expect(s.stack.filter((i) => i.kind === "ability")).toHaveLength(0);
  });
});

describe("PLAN-J J6a: public reveals read from the text", () => {
  it('Sylvan Tutor ("search … reveal it"): the found card is shown to the opponent too', () => {
    const s = scenario({
      p1: { battlefield: ["Forest"], hand: ["Sylvan Tutor"], library: ["Serra Angel", "Forest", "Forest"] },
    });
    let r = submit(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Sylvan Tutor") });
    const events = [...r.events];
    for (let i = 0; i < 20 && r.state.pending && (r.state.stack.length || r.state.pending.kind === "choice"); i++) {
      const p = r.state.pending;
      r =
        p.kind === "choice" && p.request.type === "pick"
          ? submit(r.state, p.player, {
              type: "choose",
              values: p.request.options.filter((o) => s.defs[s.objects[String(o)]?.defId ?? ""]?.name === "Serra Angel"),
            })
          : submit(r.state, p.player, { type: "pass" });
      events.push(...r.events);
    }
    const shown = filterEvents(events, "p2").find((e) => e.type === "reveal" && !e.look);
    expect(shown?.type === "reveal" && shown.defIds.map((d) => s.defs[d]?.name)).toEqual(["Serra Angel"]);
  });
});

describe("PLAN-J J6b [rules 183]: library order", () => {
  it('Commune with Nature: "the rest on the bottom of your library in any order" asks the order', () => {
    const lib = ["Opt", "Shock", "Island", "Forest", "Swamp", "Plains"];
    let s = scenario({ p1: { battlefield: ["Forest"], hand: ["Commune with Nature"], library: lib } });
    s = cast(s, "p1", "Commune with Nature");
    let asked: string[] = [];
    s = settle(s, (req) => {
      if (req.type === "pick") return [];
      if (req.type === "order") {
        asked = req.items.map(String);
        return [...req.items].reverse();
      }
      return undefined;
    });
    expect(asked).toHaveLength(5);
    const names = (ids: string[]) => ids.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
    // The order chosen, the last card at the bottom; Plains (sixth) now on top.
    expect(names(s.players.p1?.library ?? [])).toEqual(["Plains", "Swamp", "Forest", "Island", "Shock", "Opt"]);
  });
});

describe("PLAN-J J6c [rules 184]: X tied to an activated ability's target", () => {
  it("Likeness Looter: only targets whose mana value is an affordable X are offered, each with its X", () => {
    const s = scenario({
      p1: { battlefield: ["Likeness Looter", ...lands("Island", 2)], graveyard: ["Bear Cub", "Shivan Dragon"] },
    });
    const looter = idOf(s, "p1", "battlefield", "Likeness Looter");
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const a = legalActions(s, "p1").find((x) => x.type === "activate" && x.source === looter && x.ability === 1);
    const t = a?.type === "activate" ? a.targets[0] : undefined;
    expect(t?.legal).toEqual([bear]);
    expect(t?.xEquals?.[bear]).toBe(2);
  });
});

describe('PLAN-J J6d [rules 185]: "is a [creature type]" keeps the noncreature subtypes (205.1b)', () => {
  it("a Vehicle that becomes a Citizen is still a Vehicle", () => {
    const s = scenario({ p1: { battlefield: ["Cultivator's Caravan"] } });
    const caravan = idOf(s, "p1", "battlefield", "Cultivator's Caravan");
    addEffect(s, [caravan], { setSubtypes: ["Citizen"] }, "endOfTurn");
    expect(chars(s, caravan).subtypes.sort()).toEqual(["Citizen", "Vehicle"]);
  });
});
