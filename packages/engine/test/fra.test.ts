/**
 * Reality Fracture, batch A: primitives added to the engine (slow lands, scry or surveil,
 * finality counter, creatures that died this turn, noncombat damage, cards drawn, legendary
 * / toughness filters, negative amounts).
 */

import { describe, expect, it } from "vitest";
import { createTokens, dealDamage, destroy, drawCards, gainLife, sourceFromObject } from "../src/actions";
import { eventReplacement } from "../src/dsl";
import { RulesError } from "../src/errors";
import { submit } from "../src/game";
import { bump } from "../src/layers";
import { legalActions } from "../src/legal";
import { manaAbilitiesOf } from "../src/mana";
import { spellCost } from "../src/stack";
import { chars, setPrepared } from "../src/state";
import { plainText } from "../src/text";
import { simultaneously } from "../src/triggers";
import { countTurnEvents } from "../src/turnlog";
import type { GameState } from "../src/types";
import {
  type Answer,
  act,
  advanceUntil,
  attack,
  castable,
  customCard,
  idOf,
  idsOf,
  nameOf,
  namesIn,
  passAccepting,
  passBoth,
  pickNamed,
  scenario,
  settle,
  settleLogged,
  settleNoBlocks,
} from "./helpers";

type S = GameState;
const cast = (s: S, p: string, name: string, extra: Record<string, unknown> = {}) =>
  act(s, p, { type: "cast", card: idOf(s, p, "hand", name), ...extra });
const lands = (name: string, n: number) => Array(n).fill(name) as string[];

describe("Reality Fracture, batch A", () => {
  it("slow lands: tapped with fewer than two other lands, untapped otherwise", () => {
    let s = scenario({ p1: { hand: ["Deserted Beach", "Haunted Ridge"], battlefield: ["Plains"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Deserted Beach") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Deserted Beach")]?.tapped).toBe(true);
    let t = scenario({ p1: { hand: ["Haunted Ridge"], battlefield: ["Plains", "Island"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Haunted Ridge") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Haunted Ridge")]?.tapped).toBe(false);
  });

  it('"whenever you scry or surveil" and "if you surveilled this turn"', () => {
    let s = scenario({
      p1: { battlefield: ["Denzilore Fatehold", "Surveillance Phantasm", ...lands("Island", 4)], library: lands("Island", 10) },
    });
    const phantasm = idOf(s, "p1", "battlefield", "Surveillance Phantasm");
    expect(chars(s, phantasm).keywords).toContain("defender");
    s = act(s, "p1", { type: "activate", source: phantasm, ability: 1 });
    s = passBoth(s); // surveil 1 resolves
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [] });
    s = passBoth(s); // Denzilore's trigger
    expect(chars(s, phantasm).keywords).not.toContain("defender");
    expect(s.objects[phantasm]?.counters["+1/+1"]).toBe(1);
    expect(s.objects[idOf(s, "p1", "battlefield", "Denzilore Fatehold")]?.counters["+1/+1"]).toBe(1);
  });

  it("finality counter: the creature is exiled instead of dying", () => {
    let s = scenario({ p1: { graveyard: ["Proctor of Potential"], battlefield: ["Plains", "Island"] } });
    // Activation condition: having scried or surveilled this turn.
    const proctor = idOf(s, "p1", "graveyard", "Proctor of Potential");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === proctor)).toBe(false);
    s = { ...s, turnLog: [...s.turnLog, { e: "scry", player: "p1" }] };
    s = act(s, "p1", { type: "activate", source: proctor, ability: 1 });
    s = passBoth(s);
    const onField = idOf(s, "p1", "battlefield", "Proctor of Potential");
    expect(s.objects[onField]?.counters.finality).toBe(1);
    destroy(s, onField);
    expect(s.exile.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Proctor of Potential")).toBe(true);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("Darklight Phoenix: returns if two creatures died this turn", () => {
    let s = scenario({
      step: "main1",
      p1: { graveyard: ["Darklight Phoenix"], battlefield: ["Savannah Lions", "Llanowar Elves"] },
    });
    for (const n of ["Savannah Lions", "Llanowar Elves"]) destroy(s, idOf(s, "p1", "battlefield", n));
    expect(countTurnEvents(s, { event: "zone", from: "battlefield", to: "graveyard", types: ["Creature"] }, "p1")).toBe(2);
    s = passBoth(s); // moving to the beginning of combat: the trigger from the graveyard
    s = passBoth(s);
    expect(s.battlefield.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Darklight Phoenix")).toBe(true);
  });

  it("Grim Repriser: activate only if an opponent was dealt noncombat damage", () => {
    const s = scenario({ p1: { graveyard: ["Grim Repriser"], battlefield: ["Swamp", "Mountain"] } });
    const g = idOf(s, "p1", "graveyard", "Grim Repriser");
    const can = (x: S) => legalActions(x, "p1").some((a) => a.type === "activate" && a.source === g);
    expect(can(s)).toBe(false);
    dealDamage(s, sourceFromObject(s, idOf(s, "p1", "battlefield", "Mountain")), "p2", 1, false);
    expect(can(s)).toBe(true);
  });

  it("legendary filters and negative amounts (Yuriko: -X/-0)", () => {
    let s = scenario({
      p1: { hand: ["Yuriko, Hope from the Shadows"], battlefield: ["Island"], graveyard: lands("Island", 4) },
      p2: { battlefield: ["Serra Angel"] },
    });
    const angel = idOf(s, "p2", "battlefield", "Serra Angel");
    s = cast(s, "p1", "Yuriko, Hope from the Shadows");
    s = passBoth(s); // Yuriko enters, the modal trigger asks for a mode
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: ["0"] });
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: [angel] });
    s = passBoth(s);
    expect(chars(s, angel).power).toBe(0); // 4 - 4 cards in the graveyard
  });
});

describe("Reality Fracture, batch B", () => {
  const activate = (s: S, p: string, source: string, ability = 0, extra: Record<string, unknown> = {}) =>
    act(s, p, { type: "activate", source, ability, ...extra });
  const handNames = (s: S, p: string) => (s.players[p]?.hand ?? []).map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);

  it("basic landcycling: from hand, discards the card and searches for a basic land", () => {
    let s = scenario({
      p1: { hand: ["Apex Witchstalker"], battlefield: lands("Swamp", 2), library: ["Plains", "Swamp", "Swamp"] },
    });
    const witch = idOf(s, "p1", "hand", "Apex Witchstalker");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === witch);
    expect(opt).toBeDefined();
    s = activate(s, "p1", witch, (opt as { ability: number }).ability);
    expect(s.players.p1?.graveyard.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name)).toContain("Apex Witchstalker");
    s = passBoth(s);
    if (s.pending?.kind === "choice") s = act(s, "p1", { type: "choose", values: s.pending.request.suggested });
    expect(handNames(s, "p1")).toContain("Plains");
  });

  it('Proft, Sinister Mastermind: can be cast only with threshold; "discard this card" from hand', () => {
    const s = scenario({
      p1: { hand: ["Proft, Sinister Mastermind"], battlefield: lands("Swamp", 3) },
      p2: { battlefield: ["Savannah Lions"] },
    });
    const proft = idOf(s, "p1", "hand", "Proft, Sinister Mastermind");
    const acts = legalActions(s, "p1");
    expect(acts.some((a) => a.type === "cast" && a.card === proft)).toBe(false);
    expect(acts.some((a) => a.type === "activate" && a.source === proft)).toBe(true);
    const t = scenario({
      p1: { hand: ["Proft, Sinister Mastermind"], battlefield: lands("Swamp", 3), graveyard: lands("Swamp", 7) },
    });
    expect(
      legalActions(t, "p1").some((a) => a.type === "cast" && a.card === idOf(t, "p1", "hand", "Proft, Sinister Mastermind")),
    ).toBe(true);
  });

  it("Samut: an instant on the stack has split second — the opponent can only pass or produce mana", () => {
    let s = scenario({
      p1: { hand: ["Last Gasp"], battlefield: ["Samut, Tyrant of Naktamun", ...lands("Swamp", 2)] },
      p2: { hand: ["Unsummon"], battlefield: ["Island", "Serra Angel"] },
    });
    s = cast(s, "p1", "Last Gasp", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } });
    s = act(s, "p1", { type: "pass" });
    expect(s.pending?.player).toBe("p2");
    expect(legalActions(s, "p2").every((a) => a.type === "pass" || a.type === "tapForMana")).toBe(true);
  });

  it("convoke: Winter is paid by tapping creatures", () => {
    const s = scenario({
      p1: {
        hand: ["Winter, Team Player"],
        battlefield: ["Mountain", "Mountain", "Savannah Lions", "Savannah Lions", "Serra Angel"],
      },
    });
    const winter = idOf(s, "p1", "hand", "Winter, Team Player");
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === winter)).toBe(true);
    const t = act(s, "p1", { type: "cast", card: winter });
    const tapped = t.battlefield.filter((id) => t.objects[id]?.tapped).length;
    expect(tapped).toBe(5); // 2 lands + 3 creatures for {4}{R}
  });

  it("exhaust: Liliana the Repentant can be activated only once", () => {
    let s = scenario({
      p1: { battlefield: ["Liliana the Repentant", ...lands("Swamp", 12)], graveyard: ["Serra Angel", "Savannah Lions"] },
    });
    const lili = idOf(s, "p1", "battlefield", "Liliana the Repentant");
    const can = (x: S) => legalActions(x, "p1").some((a) => a.type === "activate" && a.source === lili);
    expect(can(s)).toBe(true);
    s = activate(s, "p1", lili, 1, { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } });
    s = passBoth(s);
    expect(can(s)).toBe(false);
  });

  it("exhaust: Liliana the Repentant is an exhaust ability (Boom Scholar reduces it by {2}); a +1/+1 counter on Liliana", () => {
    // Boom Scholar: "Exhaust abilities of other permanents you control cost {2} less to activate."
    let s = scenario({
      p1: { battlefield: ["Liliana the Repentant", "Boom Scholar", ...lands("Swamp", 4)], graveyard: ["Serra Angel"] },
    });
    const lili = idOf(s, "p1", "battlefield", "Liliana the Repentant");
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === lili)).toBe(true);
    s = activate(s, "p1", lili, 1, { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } });
    s = passBoth(s);
    expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    expect(s.objects[lili]?.counters["+1/+1"]).toBe(1);
  });

  it("domain and searching for different names: Fblthp, Knows the Way", () => {
    const s = scenario({ p1: { battlefield: ["Fblthp, Knows the Way", "Plains", "Island", "Island"] } });
    expect(chars(s, idOf(s, "p1", "battlefield", "Fblthp, Knows the Way")).power).toBe(2);
  });

  it('Titanbones: "when you discard this card", you gain 3 life', () => {
    // Titanbones is discarded by the opposing Rank Rat's effect.
    let s = scenario({
      p1: { hand: ["Titanbones, Towering Heart"] },
      p2: { hand: ["Rank Rat"], battlefield: lands("Swamp", 2) },
      active: "p2",
    });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Rank Rat") });
    for (let i = 0; i < 6 && s.players.p1?.life === 20; i++) {
      if (s.pending?.kind === "discard")
        s = act(s, s.pending.player, { type: "discard", cards: s.players.p1?.hand.slice(0, 1) ?? [] });
      else if (s.pending?.kind === "choice")
        s = act(s, s.pending.player, { type: "choose", values: s.pending.request.suggested });
      else s = passBoth(s);
    }
    expect(s.players.p1?.life).toBe(23);
  });
});

describe("Reality Fracture, batch C: prepared", () => {
  const exileNames = (s: S) => s.exile.map((id) => s.defs[s.objects[id]?.defId ?? ""]?.name);
  const castPrepared = (s: S, p: string, spellName: string, extra: Record<string, unknown> = {}) => {
    const copy = s.exile.find((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === spellName) as string;
    return act(s, p, { type: "cast", card: copy, ...extra });
  };

  it("enters prepared: a copy of the spell in exile, castable by its controller; casting it unprepares", () => {
    let s = scenario({ p1: { hand: ["Emergency Phytomedic"], battlefield: lands("Forest", 3) } });
    s = cast(s, "p1", "Emergency Phytomedic");
    s = passBoth(s);
    const medic = idOf(s, "p1", "battlefield", "Emergency Phytomedic");
    expect(exileNames(s)).toEqual(["Seed Suture"]);
    const copy = s.exile[0] as string;
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === copy)).toBe(true);
    expect(legalActions(s, "p2").length).toBe(0); // the opponent doesn't have priority; and the copy isn't theirs
    s = castPrepared(s, "p1", "Seed Suture", { targets: { t: [medic] } });
    expect(s.objects[medic]?.preparedCopy).toBeUndefined();
    s = passBoth(s);
    expect(s.objects[medic]?.counters["+1/+1"]).toBe(1);
    expect(s.players.p1?.life).toBe(21);
    // The copy ceased to exist: neither in exile nor in the graveyard.
    expect(exileNames(s)).toEqual([]);
    expect(s.players.p1?.graveyard).toHaveLength(0);
  });

  it("unprepared by an effect (Infinite Coursework) or by leaving the battlefield: the copy disappears", () => {
    let s = scenario({
      p1: { hand: ["Infinite Coursework"], battlefield: lands("Island", 3) },
      p2: { battlefield: ["Void Extrapolator", "Theorix Metamage"] },
    });
    const vx = idOf(s, "p2", "battlefield", "Void Extrapolator");
    const tm = idOf(s, "p2", "battlefield", "Theorix Metamage");
    for (const id of [vx, tm]) setPrepared(s, s.objects[id] as NonNullable<S["objects"][string]>, true);
    expect(exileNames(s)).toEqual(["Omit Variables", "Omit Variables"]);
    s = cast(s, "p1", "Infinite Coursework", { targets: { enchant: [vx] } });
    s = passBoth(s); // l'Aura arrive
    s = passBoth(s); // its trigger: taps and unprepares
    expect(s.objects[vx]?.tapped).toBe(true);
    expect(s.objects[vx]?.preparedCopy).toBeUndefined();
    expect(exileNames(s)).toEqual(["Omit Variables"]);
    destroy(s, tm);
    expect(exileNames(s)).toEqual([]);
  });

  it('"at the beginning of your upkeep, if it isn\'t prepared, it becomes prepared"', () => {
    let s = scenario({ step: "end", active: "p2", p1: { battlefield: ["Stingerquill Voxmancer"] } });
    expect(exileNames(s)).toEqual([]);
    for (let i = 0; i < 12 && !(s.turn.active === "p1" && s.turn.step === "main1"); i++) s = passBoth(s);
    expect(exileNames(s)).toEqual(["Vicious Verse"]);
  });

  it("Codie copies the prepared spell cast", () => {
    let s = scenario({
      p1: { hand: ["Stingerquill Voxmancer"], battlefield: ["Codie, Ravenous Codex", ...lands("Swamp", 3)] },
    });
    const vox = { type: "cast", card: idOf(s, "p1", "hand", "Stingerquill Voxmancer") } as const;
    s = act(s, "p1", vox);
    s = passBoth(s);
    const v = idOf(s, "p1", "battlefield", "Stingerquill Voxmancer");
    // Prepared by an effect (like Codie's): engine helper.
    setPrepared(s, s.objects[v] as NonNullable<S["objects"][string]>, true);
    s = castPrepared(s, "p1", "Vicious Verse", { targets: { t: ["p2"] } });
    s = passBoth(s); // Codie's trigger: copy
    for (let i = 0; i < 4 && s.stack.length; i++) s = passBoth(s);
    expect(s.players.p2?.life).toBe(18);
  });

  it("Codie: the copy of the prepared spell can change targets (707.10c)", () => {
    let s = scenario({
      players: 3,
      p1: { hand: ["Stingerquill Voxmancer"], battlefield: ["Codie, Ravenous Codex", ...lands("Swamp", 3)] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Stingerquill Voxmancer") });
    s = settle(s);
    const v = idOf(s, "p1", "battlefield", "Stingerquill Voxmancer");
    setPrepared(s, s.objects[v] as NonNullable<S["objects"][string]>, true);
    s = castPrepared(s, "p1", "Vicious Verse", { targets: { t: ["p2"] } });
    // The copy asks for its target: the other opponent.
    s = settle(s, (req) => (req.type === "pick" && req.options.includes("p3") ? ["p3"] : undefined));
    expect([s.players.p2?.life, s.players.p3?.life]).toEqual([19, 19]);
  });

  it("Heartwood Crafter: its mana doesn't pay for a spell cast from hand", () => {
    const s = scenario({ p1: { hand: ["Llanowar Elves"], battlefield: ["Heartwood Crafter"] } });
    expect(legalActions(s, "p1").some((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Llanowar Elves"))).toBe(
      false,
    );
  });
});

describe("Reality Fracture, batch D: Empower Jace", () => {
  const jaces = (s: S, p = "p1") =>
    s.battlefield.filter(
      (id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Jace"),
    );
  const loyaltyOf = (s: S, id: string) => s.objects[id]?.counters.loyalty ?? 0;

  it("creates a Jace token with N loyalty, then loads the same token", () => {
    let s = scenario({
      p1: { hand: ["Protege's Awakening", "No Admittance"], battlefield: lands("Mountain", 2), library: lands("Island", 5) },
    });
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1!, manaPool: { W: 0, U: 4, B: 0, R: 0, G: 0, C: 0 } } } };
    s = cast(s, "p1", "Protege's Awakening");
    s = passBoth(s);
    expect(jaces(s)).toHaveLength(1);
    const jace = jaces(s)[0] as string;
    expect(loyaltyOf(s, jace)).toBe(6);
    expect(chars(s, jace).types).toEqual(["Planeswalker"]);
    s = cast(s, "p1", "No Admittance", { targets: { t: ["p2"] } });
    s = passBoth(s);
    expect(jaces(s)).toEqual([jace]);
    expect(loyaltyOf(s, jace)).toBe(7);
    // Its abilities: −1 surveil, −3 draw.
    expect(legalActions(s, "p1").filter((a) => a.type === "activate" && a.source === jace)).toHaveLength(2);
  });

  it("planeswalkers gain the abilities of the Ways; Sanctum Lurker keeps them at 0 loyalty", () => {
    let s = scenario({ p1: { hand: ["Sanctum Lurker"], battlefield: ["Way of the Wildspeaker", ...lands("Swamp", 3)] } });
    s = cast(s, "p1", "Sanctum Lurker");
    s = passBoth(s); // Lurker arrive
    s = passBoth(s); // renforcez Jace 1
    const jace = jaces(s)[0] as string;
    expect(loyaltyOf(s, jace)).toBe(1);
    // [−1] surveil: Jace drops to 0 but stays (Sanctum Lurker).
    const surveil = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === jace && a.label?.includes("Surveil"));
    expect(surveil).toBeDefined();
    s = act(s, "p1", { type: "activate", source: jace, ability: (surveil as { ability: number }).ability });
    expect(s.objects[jace]?.zone).toBe("battlefield");
    expect(loyaltyOf(s, jace)).toBe(0);
    // Granted abilities: [+2] (Lurker) and [−4] (Wildspeaker) on the token.
    const labels = chars(s, jace).abilities.map((a) => (a.kind === "activated" ? a.label : ""));
    expect(labels.some((l) => plainText(l ?? "").startsWith("+2"))).toBe(true);
    expect(labels.some((l) => plainText(l ?? "").startsWith("−4"))).toBe(true);
  });

  it("Jace's Machinations: Jace loyalty abilities at instant speed, during the opponent's turn", () => {
    let s = scenario({
      active: "p2",
      p1: { hand: ["Jace's Machinations"], battlefield: lands("Island", 3), library: lands("Island", 5) },
    });
    s = act(s, "p2", { type: "pass" });
    s = cast(s, "p1", "Jace's Machinations");
    s = passBoth(s);
    const jace = jaces(s)[0] as string;
    expect(loyaltyOf(s, jace)).toBe(8);
    expect(s.pending?.player).toBe("p2");
    s = act(s, "p2", { type: "pass" });
    if (s.pending?.player === "p1")
      expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === jace)).toBe(true);
  });

  it("Countersculpt: {1} more without a Jace to scry", () => {
    const withoutJace = scenario({ p1: { hand: ["Countersculpt"], battlefield: lands("Island", 2) } });
    const cs = idOf(withoutJace, "p1", "hand", "Countersculpt");
    // No spell to counter: only the cost is checked through the available mana.
    const d = withoutJace.defs[withoutJace.objects[cs]?.defId ?? ""]!;
    expect(spellCost(withoutJace, "p1", d, {}).generic).toBe(1);
    const withJace = scenario({ p1: { hand: ["Countersculpt", "Jace, Reality Sculptor"], battlefield: lands("Island", 2) } });
    expect(spellCost(withJace, "p1", d, {}).generic).toBe(0);
  });

  it("Violent Echoes: empower Jace with the excess damage", () => {
    let s = scenario({
      p1: { hand: ["Violent Echoes"], battlefield: lands("Mountain", 4) },
      p2: { battlefield: ["Savannah Lions"] },
    });
    s = cast(s, "p1", "Violent Echoes", { targets: { t: [idOf(s, "p2", "battlefield", "Savannah Lions")] } });
    s = passBoth(s);
    expect(loyaltyOf(s, jaces(s)[0] as string)).toBe(5);
  });
});

describe("Reality Fracture, batch E: planeswalkers", () => {
  it('lands "tapped unless you control a planeswalker"', () => {
    let s = scenario({ p1: { hand: ["Fatehold Annex"] } });
    s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Fatehold Annex") });
    expect(s.objects[idOf(s, "p1", "battlefield", "Fatehold Annex")]?.tapped).toBe(true);
    let t = scenario({ p1: { hand: ["Fatehold Annex"], battlefield: ["Ajani Resolute"] } });
    t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Fatehold Annex") });
    expect(t.objects[idOf(t, "p1", "battlefield", "Fatehold Annex")]?.tapped).toBe(false);
  });

  it("Ajani Resolute: a loyalty counter whenever you gain life, and the 0 ability", () => {
    let s = scenario({ p1: { battlefield: ["Ajani Resolute"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani Resolute");
    expect(s.objects[ajani]?.counters.loyalty).toBe(2);
    const zero = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === ajani && plainText(a.label ?? "").startsWith("0"),
    );
    s = act(s, "p1", { type: "activate", source: ajani, ability: (zero as { ability: number }).ability });
    s = passBoth(s); // +1 PV
    s = passBoth(s); // trigger: loyalty
    expect(s.players.p1?.life).toBe(21);
    expect(s.objects[ajani]?.counters.loyalty).toBe(3);
  });

  it('Ajani Unrelenting: "whenever you activate a loyalty ability", a Cadet; Kiora sees the activation', () => {
    let s = scenario({ p1: { battlefield: ["Ajani Unrelenting"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani Unrelenting");
    const plus = legalActions(s, "p1").find(
      (a) => a.type === "activate" && a.source === ajani && plainText(a.label ?? "").startsWith("+1"),
    );
    s = act(s, "p1", { type: "activate", source: ajani, ability: (plus as { ability: number }).ability });
    expect(s.turnLog.filter((e) => e.e === "activate" && e.loyalty && e.player === "p1")).toHaveLength(1);
    for (let i = 0; i < 4 && s.stack.length; i++) s = passBoth(s);
    expect(s.battlefield.some((id) => s.defs[s.objects[id]?.defId ?? ""]?.name === "Cadet")).toBe(true);
  });

  it("Tam: proliferates as many times as planeswalker types", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Tam, the Possibility",
          "Ajani Resolute",
          "The Theorist, Jace Beleren",
          "Plains",
          "Island",
          "Swamp",
          "Mountain",
          "Forest",
        ],
      },
    });
    const tam = idOf(s, "p1", "battlefield", "Tam, the Possibility");
    s = act(s, "p1", { type: "activate", source: tam, ability: 1 });
    // Each proliferate is a choice (701.34a); the suggestion takes your planeswalkers.
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect(s.objects[idOf(s, "p1", "battlefield", "Ajani Resolute")]?.counters.loyalty).toBe(4); // 2 + 2
    expect(s.objects[idOf(s, "p1", "battlefield", "The Theorist, Jace Beleren")]?.counters.loyalty).toBe(5);
  });

  it("Winter, Tormented Loner: +1/+0 per creature or planeswalker card in the graveyard", () => {
    const s = scenario({
      p1: { battlefield: ["Winter, Tormented Loner"], graveyard: ["Savannah Lions", "Ajani Resolute", "Plains"] },
    });
    const w = idOf(s, "p1", "battlefield", "Winter, Tormented Loner");
    expect(chars(s, w).power).toBe((s.defs[s.objects[w]?.defId ?? ""]?.power ?? 0) + 2);
  });

  it("Mabel, Bitter Recluse: removes up to three counters", () => {
    let s = scenario({
      p1: { hand: ["Mabel, Bitter Recluse"], battlefield: ["Swamp"] },
      p2: { battlefield: ["Ajani Unrelenting"] },
    });
    const ajani = idOf(s, "p2", "battlefield", "Ajani Unrelenting");
    s = cast(s, "p1", "Mabel, Bitter Recluse");
    s = passBoth(s);
    s = passBoth(s);
    expect(s.objects[ajani]?.counters.loyalty).toBe(2); // 5 - 3
  });
});

describe("Proliferate: a choice (701.34a)", () => {
  it("the player chooses the permanents that get one more counter", () => {
    let s = scenario({
      p1: {
        battlefield: [
          "Tam, the Possibility",
          "Ajani Resolute",
          "The Theorist, Jace Beleren",
          "Plains",
          "Island",
          "Swamp",
          "Mountain",
          "Forest",
        ],
      },
    });
    const tam = idOf(s, "p1", "battlefield", "Tam, the Possibility");
    const ajani = idOf(s, "p1", "battlefield", "Ajani Resolute");
    const jace = idOf(s, "p1", "battlefield", "The Theorist, Jace Beleren");
    s = act(s, "p1", { type: "activate", source: tam, ability: 1 });
    s = passBoth(s);
    // Two proliferates: only Ajani the first time, nothing the second.
    for (const values of [[ajani], []]) {
      const p = s.pending;
      if (p?.kind !== "choice" || p.request.intent !== "proliferate") throw new Error("proliferate expected");
      expect(p.request.type === "pick" && p.request.options).toEqual(expect.arrayContaining([ajani, jace]));
      expect(p.request.autoOk).toBe(true);
      s = act(s, "p1", { type: "choose", values });
    }
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    const jaceLoyalty = s.defs[s.objects[jace]?.defId ?? ""]?.loyalty ?? 0;
    expect(s.objects[ajani]?.counters.loyalty).toBe(3);
    expect(s.objects[jace]?.counters.loyalty).toBe(jaceLoyalty);
  });
});

describe("Liliana the Faultless (lot K4)", () => {
  it('"{1}, {T}, discard a card": discarding is a cost; with no card in hand, the ability can\'t be activated', () => {
    const setup = (hand: string[]) => scenario({ p1: { battlefield: ["Liliana the Faultless", "Bear Cub", "Plains"], hand } });
    const empty = setup([]);
    const lili0 = idOf(empty, "p1", "battlefield", "Liliana the Faultless");
    expect(legalActions(empty, "p1").some((a) => a.type === "activate" && a.source === lili0)).toBe(false);
    let s = setup(["Island"]);
    const lili = idOf(s, "p1", "battlefield", "Liliana the Faultless");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === lili);
    s = act(s, "p1", {
      type: "activate",
      source: lili,
      ability: opt?.type === "activate" ? opt.ability : -1,
      targets: { t: [bear] },
    });
    // Ability on the stack: the card is already discarded.
    expect(s.stack).toHaveLength(1);
    expect(s.players.p1?.hand).toHaveLength(0);
    s = passBoth(s);
    expect(chars(s, bear).keywords).toContain("hexproof");
  });
});

describe("Reality Fracture, batch K6: Empower Jace with several Jace tokens", () => {
  it("the player chooses the Jace token that gets the counters (untargeted choice, on resolution)", () => {
    const s0 = scenario({ p1: { hand: ["No Admittance"], battlefield: lands("Mountain", 2) } });
    const [a, b] = createTokens(s0, "p1", { name: "Jace", colors: ["U"], types: ["Planeswalker"], subtypes: ["Jace"] }, 2) as [
      string,
      string,
    ];
    for (const id of [a, b]) (s0.objects[id] as { counters: Record<string, number> }).counters.loyalty = 2;
    let offered: string[] = [];
    const s = settle(cast(s0, "p1", "No Admittance", { targets: { t: ["p2"] } }), (req) => {
      if (req.type !== "pick" || !req.options.includes(a)) return undefined;
      offered = req.options;
      return [b];
    });
    expect([...offered].sort()).toEqual([a, b].sort());
    expect(s.players.p2?.life).toBe(17);
    expect(s.objects[a]?.counters.loyalty).toBe(2);
    expect(s.objects[b]?.counters.loyalty).toBe(3);
    // No new token: you already control one.
    expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(2);
  });
});

describe("Tokens described as tapped (batch K8)", () => {
  it("Tenured Tethermage: sacrificing a land, two tapped Heartwood tokens", () => {
    let s = scenario({ p1: { battlefield: ["Mountain", "Forest", "Island", "Plains"], hand: ["Tenured Tethermage"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Tenured Tethermage") });
    for (let i = 0; i < 30 && !(s.stack.length === 0 && s.pending?.kind === "priority"); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, {
          type: "choose",
          values:
            p.request.type === "yesNo"
              ? [1]
              : p.request.type === "pick"
                ? p.request.options.slice(0, Math.max(1, p.request.min))
                : p.request.suggested,
        });
      else break;
    }
    const tokens = s.battlefield.filter((id) => s.objects[id]?.isToken);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((id) => s.objects[id]?.tapped)).toBe(true);
  });
});

describe("Reality Fracture, batch K8: mythic, rare and uncommon cards", () => {
  /** Plays, answering choices (suggested answer by default) until `until`; neither attacks nor blocks. */
  const play = (s0: S, answer: Answer, until: (s: S) => boolean): S => {
    let s = s0;
    for (let i = 0; i < 400 && !until(s); i++) {
      const p = s.pending;
      if (p?.kind === "priority") s = act(s, p.player, { type: "pass" });
      else if (p?.kind === "choice")
        s = act(s, p.player, { type: "choose", values: answer(p.request, p.player, s) ?? p.request.suggested });
      else if (p?.kind === "declareAttackers") s = act(s, p.player, { type: "declareAttackers", attackers: [] });
      else if (p?.kind === "declareBlockers") s = act(s, p.player, { type: "declareBlockers", blocks: [] });
      else if (p?.kind === "discard") {
        const hand = s.players[p.player]?.hand ?? [];
        s = act(s, p.player, { type: "discard", cards: hand.slice(0, p.count) });
      } else break;
    }
    return s;
  };
  /** Answer: "yes" (or "no") to questions, `want` when it is among a choice's options. */
  const answering =
    (yes: boolean, want: string[] = []): Answer =>
    (req) => {
      if (req.type === "yesNo") return [yes ? 1 : 0];
      if (req.type === "pick") {
        const picked = want.filter((w) => req.options.includes(w));
        if (picked.length > 0) return picked.slice(0, req.max);
      }
      return undefined;
    };
  /** Resolves the stack and pending triggers by answering choices; with nothing to resolve, doesn't pass. */
  const resolve = (s: S, answer: Answer = () => undefined) =>
    s.stack.length > 0 || s.triggers.length > 0 || s.pending?.kind === "choice" ? settle(s, answer) : s;
  /** Activates `source`'s ability whose label starts with `label` (the first, with no label). */
  const activate = (s: S, player: string, source: string, label?: string, extra: object = {}) => {
    const opt = legalActions(s, player).find(
      (a) => a.type === "activate" && a.source === source && (!label || plainText(a.label ?? "").startsWith(label)),
    );
    if (opt?.type !== "activate") throw new Error(`ability "${label ?? "?"}" not found`);
    return act(s, player, { type: "activate", source, ability: opt.ability, ...extra });
  };
  const canUse = (s: S, player: string, source: string, label?: string) =>
    legalActions(s, player).some(
      (a) => a.type === "activate" && a.source === source && (!label || plainText(a.label ?? "").startsWith(label)),
    );
  const life = (s: S, p: string) => s.players[p]?.life;
  const handOf = (s: S, p: string) => namesIn(s, s.players[p]?.hand);
  const graveOf = (s: S, p: string) => namesIn(s, s.players[p]?.graveyard);
  const pt = (s: S, id: string) => [chars(s, id).power, chars(s, id).toughness];
  const counters = (s: S, id: string, kind = "+1/+1") => s.objects[id]?.counters[kind] ?? 0;
  const tokensNamed = (s: S, name: string, p = "p1") =>
    s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && chars(s, id).name === name);
  const jaceTokens = (s: S, p = "p1") =>
    s.battlefield.filter(
      (id) => s.objects[id]?.isToken && s.objects[id]?.controller === p && chars(s, id).subtypes.includes("Jace"),
    );
  const jaceLoyalty = (s: S, p = "p1") => s.objects[jaceTokens(s, p)[0] ?? ""]?.counters.loyalty ?? 0;
  const prepared = (s: S, id: string) => s.objects[id]?.preparedCopy !== undefined;
  /** Casts the copy of `id`'s prepared spell. */
  const castCopy = (s: S, id: string, extra: object = {}) =>
    act(s, s.objects[id]?.controller as string, { type: "cast", card: s.objects[id]?.preparedCopy as string, ...extra });
  /** Plays (without attacking or blocking) to the end step, triggers resolved, or to the next turn. */
  const toEndStep = (s: S, answer: Answer = () => undefined) => {
    const turn = s.turn.number;
    return play(
      s,
      answer,
      (x) =>
        x.turn.number > turn ||
        (x.turn.step === "end" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority"),
    );
  };
  /** Declares the attackers (toward p2), then plays without blocking to the second main phase. */
  const attackThrough = (s: S, attackers: string[], answer: Answer = () => undefined) =>
    play(attack(s, attackers), answer, (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority");

  describe("mythiques", () => {
    it("Aerid Konstrari: a Heartwood on entering and on dying; {6}: a Heartwood, then +X/+0 (X = your artifacts)", () => {
      let s = scenario({ p1: { hand: ["Aerid Konstrari"], battlefield: ["Mountain", ...lands("Forest", 3)] } });
      s = resolve(cast(s, "p1", "Aerid Konstrari"));
      expect(tokensNamed(s, "Heartwood")).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Aerid Konstrari", ...lands("Forest", 6)] } });
      const aerid = idOf(t, "p1", "battlefield", "Aerid Konstrari");
      t = resolve(activate(t, "p1", aerid));
      expect(tokensNamed(t, "Heartwood")).toHaveLength(1);
      expect(pt(t, aerid)).toEqual([6, 4]);
      destroy(t, aerid);
      t = resolve(t);
      expect(tokensNamed(t, "Heartwood")).toHaveLength(2);
    });

    it("Avatar of Burgeoning Echoes: a land entering under your control → empower Jace 2; your planeswalkers have [−10]", () => {
      let s = scenario({ p1: { hand: ["Forest"], battlefield: ["Avatar of Burgeoning Echoes", "Island", "Bear Cub"] } });
      s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
      expect(jaceTokens(s)).toHaveLength(1);
      expect(jaceLoyalty(s)).toBe(2);
      const jace = jaceTokens(s)[0] as string;
      expect(canUse(s, "p1", jace, "−10")).toBe(false);
      s.objects[jace]!.counters.loyalty = 10;
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", jace, "−10", { targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(2); // Island et Forest
      // An opposing land triggers nothing.
      let o = scenario({ active: "p2", p1: { battlefield: ["Avatar of Burgeoning Echoes"] }, p2: { hand: ["Forest"] } });
      o = resolve(act(o, "p2", { type: "playLand", card: idOf(o, "p2", "hand", "Forest") }));
      expect(jaceTokens(o)).toHaveLength(0);
    });

    it("Bloodline Recollector: prepared at the end step if three creatures died this turn, not with two", () => {
      const run = (deaths: number) => {
        let s = scenario({ p1: { battlefield: ["Bloodline Recollector"] }, p2: { battlefield: lands("Bear Cub", 3) } });
        for (const id of idsOf(s, "p2", "battlefield", "Bear Cub").slice(0, deaths)) destroy(s, id);
        s = toEndStep(s);
        return prepared(s, idOf(s, "p1", "battlefield", "Bloodline Recollector"));
      };
      expect(run(3)).toBe(true);
      expect(run(2)).toBe(false);
    });

    it("Craterclaw Colossus: haste; on entering, your creatures gain trample and +X/+0 (X = your artifacts)", () => {
      let s = scenario({
        p1: { hand: ["Craterclaw Colossus"], battlefield: [...lands("Mountain", 7), "Bear Cub", "The Echoverse Fulcrum"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      s = resolve(cast(s, "p1", "Craterclaw Colossus"));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const colossus = idOf(s, "p1", "battlefield", "Craterclaw Colossus");
      expect(pt(s, bear)).toEqual([4, 2]);
      expect(pt(s, colossus)).toEqual([7, 5]);
      expect(chars(s, bear).keywords).toContain("trample");
      expect(chars(s, colossus).keywords).toEqual(expect.arrayContaining(["haste", "trample"]));
      expect(pt(s, idOf(s, "p2", "battlefield", "Savannah Lions"))).toEqual([2, 1]);
    });

    it("Enlightened Confidant: life gained → surveil 1 at your end step; the card put into the graveyard returns if its mana value ≤ life gained", () => {
      const run = (gain: number, top: string) => {
        let s = scenario({ p1: { battlefield: ["Enlightened Confidant"], library: [top, "Forest", "Forest"] } });
        const topId = s.players.p1?.library[0] as string;
        if (gain > 0) gainLife(s, "p1", gain);
        let asked = false;
        s = toEndStep(s, (req) => {
          if (req.intent !== "surveilGraveyard") return undefined;
          asked = true;
          return [topId];
        });
        return { s, asked };
      };
      const cheap = run(2, "Bear Cub");
      expect(cheap.asked).toBe(true);
      expect(handOf(cheap.s, "p1")).toEqual(["Bear Cub"]);
      const dear = run(2, "Serra Angel");
      expect(handOf(dear.s, "p1")).toEqual([]);
      expect(graveOf(dear.s, "p1")).toEqual(["Serra Angel"]);
      const none = run(0, "Bear Cub");
      expect(none.asked).toBe(false);
      expect(graveOf(none.s, "p1")).toEqual([]);
    });

    it("Hexhaven Invigorator: when dealt damage, you may search for as many lands as damage, entering tapped", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { hand: ["Shock"], battlefield: ["Hexhaven Invigorator", "Mountain"], library: lands("Forest", 5) },
        });
        return resolve(
          cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Hexhaven Invigorator")] } }),
          answering(yes),
        );
      };
      const yes = run(true);
      const forests = idsOf(yes, "p1", "battlefield", "Forest");
      expect(forests).toHaveLength(2);
      expect(forests.every((id) => yes.objects[id]?.tapped)).toBe(true);
      expect(idsOf(run(false), "p1", "battlefield", "Forest")).toHaveLength(0);
    });

    it("Ingris Stingerquill: each attacker you control deals 1 damage to each opponent; {4}: a Cadet, then haste", () => {
      let s = scenario({ p1: { battlefield: ["Ingris Stingerquill", "Bear Cub", "Savannah Lions"] } });
      const attackers = [idOf(s, "p1", "battlefield", "Bear Cub"), idOf(s, "p1", "battlefield", "Savannah Lions")];
      s = settleNoBlocks(attack(s, attackers));
      expect(life(s, "p2")).toBe(18);
      expect(life(s, "p1")).toBe(20);
      let t = scenario({ p1: { battlefield: ["Ingris Stingerquill", "Bear Cub", ...lands("Mountain", 4)] } });
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Ingris Stingerquill")));
      const cadet = tokensNamed(t, "Cadet")[0] as string;
      expect(pt(t, cadet)).toEqual([2, 2]);
      expect(chars(t, cadet).keywords).toContain("haste");
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
    });

    it("Kwia Vigorbloom: flying, vigilance, lifelink, ward {2}; a Lotus on the first life gain of the turn only", () => {
      let s = scenario({ p1: { battlefield: ["Kwia Vigorbloom"] } });
      const kwia = idOf(s, "p1", "battlefield", "Kwia Vigorbloom");
      expect(chars(s, kwia).keywords).toEqual(expect.arrayContaining(["flying", "vigilance", "lifelink"]));
      gainLife(s, "p1", 1);
      s = resolve(s);
      gainLife(s, "p1", 1);
      s = resolve(s);
      const lotus = tokensNamed(s, "Lotus");
      expect(lotus).toHaveLength(1);
      expect(chars(s, lotus[0] as string).types).toEqual(["Artifact"]);
    });

    it("Overwrite the Multiverse: exiles all creatures, then empower Jace by the number of creatures exiled", () => {
      let s = scenario({
        p1: { hand: ["Overwrite the Multiverse"], battlefield: ["Bear Cub", ...lands("Swamp", 6)] },
        p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
      });
      s = resolve(cast(s, "p1", "Overwrite the Multiverse"));
      expect(s.battlefield.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(0);
      expect(namesIn(s, s.exile).sort()).toEqual(["Bear Cub", "Savannah Lions", "Serra Angel"]);
      expect(jaceLoyalty(s)).toBe(3);
    });

    it("Return to the Light Realms: returns all your nonland permanent cards from your graveyard", () => {
      let s = scenario({
        p1: {
          hand: ["Return to the Light Realms"],
          battlefield: lands("Plains", 9),
          graveyard: ["Bear Cub", "Eye of Jace", "Ajani Resolute", "Plains", "Shock"],
        },
        p2: { graveyard: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Return to the Light Realms"));
      for (const n of ["Bear Cub", "Eye of Jace", "Ajani Resolute"]) expect(idsOf(s, "p1", "battlefield", n)).toHaveLength(1);
      expect(graveOf(s, "p1").sort()).toEqual(["Plains", "Return to the Light Realms", "Shock"]);
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
    });

    it("Seasoned Cryomancer: draw 2, discard 2; as many creatures tapped and stunned as nonland cards discarded", () => {
      const run = (library: string[]) => {
        let s = scenario({
          p1: { hand: ["Seasoned Cryomancer"], battlefield: lands("Island", 3), library: [...library, "Forest"] },
          p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
        });
        const foes = [idOf(s, "p2", "battlefield", "Bear Cub"), idOf(s, "p2", "battlefield", "Savannah Lions")];
        s = resolve(cast(s, "p1", "Seasoned Cryomancer"), (req) => {
          if (req.type !== "pick") return undefined;
          if (req.intent === "discard") return req.options.slice(0, 2);
          return foes.filter((f) => req.options.includes(f)).slice(0, req.max);
        });
        return { s, foes };
      };
      const two = run(["Serra Angel", "Shock"]);
      expect(graveOf(two.s, "p1").sort()).toEqual(["Serra Angel", "Shock"]);
      for (const f of two.foes) {
        expect(two.s.objects[f]?.tapped).toBe(true);
        expect(counters(two.s, f, "stun")).toBe(1);
      }
      const one = run(["Serra Angel", "Plains"]);
      expect(one.foes.filter((f) => one.s.objects[f]?.tapped)).toHaveLength(1);
      const none = run(["Plains", "Plains"]);
      expect(none.foes.some((f) => none.s.objects[f]?.tapped)).toBe(false);
    });

    it("Seasoned Cryomancer: {3}{U}{U}, exile it from your graveyard: draw two cards", () => {
      let s = scenario({ p1: { graveyard: ["Seasoned Cryomancer"], battlefield: lands("Island", 5) } });
      const cryo = idOf(s, "p1", "graveyard", "Seasoned Cryomancer");
      s = resolve(activate(s, "p1", cryo));
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(namesIn(s, s.exile)).toEqual(["Seasoned Cryomancer"]);
    });

    it("Stingcaster Mage: haste; an instant or sorcery in your graveyard gains flashback equal to its cost", () => {
      let s = scenario({
        p1: { hand: ["Stingcaster Mage"], battlefield: lands("Mountain", 3), graveyard: ["Shock", "Bear Cub"] },
      });
      const shock = idOf(s, "p1", "graveyard", "Shock");
      expect(castable(s, "p1", shock)).toBe(false);
      s = resolve(cast(s, "p1", "Stingcaster Mage"), answering(true, [shock]));
      expect(chars(s, idOf(s, "p1", "battlefield", "Stingcaster Mage")).keywords).toContain("haste");
      expect(castable(s, "p1", shock)).toBe(true);
      s = resolve(act(s, "p1", { type: "cast", card: shock, targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(18);
      expect(namesIn(s, s.exile)).toEqual(["Shock"]);
    });

    it("The Echoverse Fulcrum: on entering, draw then discard; {5}, {T}, exile it: destroy all creatures, as a sorcery", () => {
      let s = scenario({ p1: { hand: ["The Echoverse Fulcrum", "Opt"], battlefield: lands("Island", 2) } });
      s = resolve(cast(s, "p1", "The Echoverse Fulcrum"));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      let t = scenario({
        p1: { battlefield: ["The Echoverse Fulcrum", "Bear Cub", ...lands("Island", 5)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const fulcrum = idOf(t, "p1", "battlefield", "The Echoverse Fulcrum");
      t = resolve(activate(t, "p1", fulcrum));
      expect(t.battlefield.filter((id) => chars(t, id).types.includes("Creature"))).toHaveLength(0);
      expect(namesIn(t, t.exile)).toEqual(["The Echoverse Fulcrum"]);
      const o = scenario({ active: "p2", p1: { battlefield: ["The Echoverse Fulcrum", ...lands("Island", 5)] } });
      const passed = act(o, "p2", { type: "pass" });
      expect(canUse(passed, "p1", idOf(passed, "p1", "battlefield", "The Echoverse Fulcrum"))).toBe(false);
    });
  });

  describe("rares", () => {
    it("Ajani's Anguish: on entering, X damage to any target; your creatures have trample", () => {
      let s = scenario({ p1: { hand: ["Ajani's Anguish"], battlefield: [...lands("Mountain", 4), "Bear Cub"] } });
      s = resolve(cast(s, "p1", "Ajani's Anguish", { x: 3 }), answering(true, ["p2"]));
      expect(life(s, "p2")).toBe(17);
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
    });

    it("Carnivorous Cultivator: deathtouch, enters prepared; combat damage to a player → a land card from the graveyard to hand", () => {
      let s = scenario({ p1: { hand: ["Carnivorous Cultivator"], battlefield: lands("Forest", 2) } });
      s = resolve(cast(s, "p1", "Carnivorous Cultivator"));
      const c = idOf(s, "p1", "battlefield", "Carnivorous Cultivator");
      expect(prepared(s, c)).toBe(true);
      expect(chars(s, c).keywords).toContain("deathtouch");
      let t = scenario({ p1: { battlefield: ["Carnivorous Cultivator"], graveyard: ["Forest", "Shock"] } });
      t = attackThrough(t, [idOf(t, "p1", "battlefield", "Carnivorous Cultivator")]);
      expect(life(t, "p2")).toBe(18);
      expect(handOf(t, "p1")).toEqual(["Forest"]);
    });
  });

  describe("rares (2)", () => {
    it("Cruel Calculations: draw as many cards as cards put from the targeted player's library into their graveyard this turn", () => {
      const run = (who: string) => {
        let s = scenario({
          p1: { hand: ["Dark Matter Manipulator", "Cruel Calculations"], battlefield: ["Swamp", ...lands("Island", 3)] },
        });
        s = resolve(cast(s, "p1", "Dark Matter Manipulator")); // meule 3
        s = resolve(cast(s, "p1", "Cruel Calculations", { targets: { t: [who] } }));
        return s.players.p1?.hand.length;
      };
      expect(run("p1")).toBe(3);
      expect(run("p2")).toBe(0);
    });

    it("Curse-Marred Demon: flying, trample; on entering, search for a card, then discard a card at random", () => {
      let s = scenario({
        p1: {
          hand: ["Curse-Marred Demon", "Opt"],
          battlefield: lands("Mountain", 4),
          library: ["Forest", "Serra Angel", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Curse-Marred Demon"), (req) =>
        req.intent === "search" ? pickNamed(s, req, "Serra Angel") : undefined,
      );
      const demon = idOf(s, "p1", "battlefield", "Curse-Marred Demon");
      expect(chars(s, demon).keywords).toEqual(expect.arrayContaining(["flying", "trample"]));
      expect(s.players.p1?.library).toHaveLength(2);
      expect(s.players.p1?.hand).toHaveLength(1);
      expect([...handOf(s, "p1"), ...graveOf(s, "p1")].sort()).toEqual(["Opt", "Serra Angel"]);
    });

    it("Dark Matter Manipulator: on entering, mill 3; +2/+0 for each seven cards in your graveyard", () => {
      let s = scenario({ p1: { hand: ["Dark Matter Manipulator"], battlefield: ["Swamp"], graveyard: lands("Plains", 4) } });
      s = resolve(cast(s, "p1", "Dark Matter Manipulator"));
      const dmm = idOf(s, "p1", "battlefield", "Dark Matter Manipulator");
      expect(s.players.p1?.graveyard).toHaveLength(7);
      expect(pt(s, dmm)).toEqual([3, 2]);
      const t = scenario({ p1: { battlefield: ["Dark Matter Manipulator"], graveyard: lands("Plains", 13) } });
      expect(pt(t, idOf(t, "p1", "battlefield", "Dark Matter Manipulator"))).toEqual([3, 2]);
      const u = scenario({ p1: { battlefield: ["Dark Matter Manipulator"], graveyard: lands("Plains", 14) } });
      expect(pt(u, idOf(u, "p1", "battlefield", "Dark Matter Manipulator"))).toEqual([5, 2]);
    });

    it("Diviner of Victory: enters prepared; +1/+1 until end of turn whenever you scry or surveil", () => {
      let s = scenario({ p1: { hand: ["Diviner of Victory", "Opt"], battlefield: lands("Island", 2) } });
      s = resolve(cast(s, "p1", "Diviner of Victory"));
      const d = idOf(s, "p1", "battlefield", "Diviner of Victory");
      expect(prepared(s, d)).toBe(true);
      expect(pt(s, d)).toEqual([1, 1]);
      s = resolve(cast(s, "p1", "Opt"));
      expect(pt(s, d)).toEqual([2, 2]);
    });

    it("Entrust the Spark: you may sacrifice a planeswalker; if you do, a planeswalker from the library enters", () => {
      const run = (yes: boolean, walker = true) => {
        const s = scenario({
          p1: {
            hand: ["Entrust the Spark"],
            battlefield: [...lands("Forest", 4), "Island", ...(walker ? ["Ajani Resolute"] : [])],
            library: ["Forest", "Ajani Unrelenting", "Forest"],
          },
        });
        return resolve(cast(s, "p1", "Entrust the Spark"), (req) => {
          if (req.type === "yesNo") return [yes ? 1 : 0];
          if (req.intent === "sacrifice" && req.type === "pick") return yes ? req.options.slice(0, 1) : [];
          return undefined;
        });
      };
      const yes = run(true);
      expect(graveOf(yes, "p1")).toContain("Ajani Resolute");
      expect(idsOf(yes, "p1", "battlefield", "Ajani Unrelenting")).toHaveLength(1);
      const no = run(false);
      expect(idsOf(no, "p1", "battlefield", "Ajani Resolute")).toHaveLength(1);
      expect(idsOf(no, "p1", "battlefield", "Ajani Unrelenting")).toHaveLength(0);
      const none = run(true, false);
      expect(idsOf(none, "p1", "battlefield", "Ajani Unrelenting")).toHaveLength(0);
    });

    it("Face Yourself: a copy with haste of each creature of the targeted player, sacrificed at the end step without a planeswalker", () => {
      const run = (walker: boolean) => {
        let s = scenario({
          p1: { hand: ["Face Yourself"], battlefield: [...lands("Mountain", 7), ...(walker ? ["Ajani Resolute"] : [])] },
          p2: { battlefield: ["Serra Angel", "Bear Cub"] },
        });
        s = resolve(cast(s, "p1", "Face Yourself", { targets: { p: ["p2"] } }));
        const copies = s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === "p1");
        expect(namesIn(s, copies).sort()).toEqual(["Bear Cub", "Serra Angel"]);
        expect(copies.every((id) => chars(s, id).keywords.includes("haste"))).toBe(true);
        s = toEndStep(s);
        return s.battlefield.filter((id) => s.objects[id]?.isToken && s.objects[id]?.controller === "p1").length;
      };
      expect(run(false)).toBe(0);
      expect(run(true)).toBe(2);
    });

    it("Flickering Hound: when you cast a creature spell, another of your creatures blinks through exile", () => {
      let s = scenario({
        p1: {
          hand: ["Savannah Lions"],
          battlefield: ["Flickering Hound", { name: "Bear Cub", tapped: true, counters: { "+1/+1": 1 } }, "Plains"],
        },
      });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const hound = idOf(s, "p1", "battlefield", "Flickering Hound");
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Savannah Lions"), (req) => {
        if (req.type !== "pick" || !req.options.includes(bear)) return undefined;
        offered = req.options;
        return [bear];
      });
      expect(offered).not.toContain(hound);
      expect(s.battlefield).not.toContain(bear);
      const back = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[back]?.tapped).toBe(false);
      expect(counters(s, back)).toBe(0);
      // A noncreature spell triggers nothing.
      let t = scenario({ p1: { hand: ["Shock"], battlefield: ["Flickering Hound", "Bear Cub", "Mountain"] } });
      const bear2 = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(t.battlefield).toContain(bear2);
    });

    it("Frostbite Pyromental: trample, haste; combat damage to a player → draw two cards; sacrificed at the end step", () => {
      let s = scenario({ p1: { battlefield: ["Frostbite Pyromental"] } });
      const f = idOf(s, "p1", "battlefield", "Frostbite Pyromental");
      expect(chars(s, f).keywords).toEqual(expect.arrayContaining(["trample", "haste"]));
      s = attackThrough(s, [f]);
      expect(life(s, "p2")).toBe(16);
      expect(s.players.p1?.hand).toHaveLength(2);
      s = toEndStep(s);
      expect(graveOf(s, "p1")).toEqual(["Frostbite Pyromental"]);
    });

    it("Gardenize: a charge counter when one of your creatures dies; {G} per counter at the beginning of your first main phase", () => {
      let s = scenario({
        p1: { battlefield: ["Gardenize", "Bear Cub", "Savannah Lions"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const g = idOf(s, "p1", "battlefield", "Gardenize");
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      destroy(s, idOf(s, "p1", "battlefield", "Savannah Lions"));
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = resolve(s);
      expect(counters(s, g, "charge")).toBe(2);
      const turn = s.turn.number;
      s = play(
        s,
        () => undefined,
        (x) =>
          x.turn.number > turn + 1 &&
          x.turn.step === "main1" &&
          x.stack.length === 0 &&
          x.triggers.length === 0 &&
          x.pending?.kind === "priority",
      );
      expect(s.turn.active).toBe("p1");
      expect(s.players.p1?.manaPool.G).toBe(2);
    });

    it("Germinate Recruits: as many Cadets as life gained this turn", () => {
      const run = (gain: number) => {
        let s = scenario({ p1: { hand: ["Germinate Recruits"], battlefield: lands("Plains", 3) } });
        if (gain) gainLife(s, "p1", gain);
        s = resolve(cast(s, "p1", "Germinate Recruits"));
        return tokensNamed(s, "Cadet").length;
      };
      expect(run(3)).toBe(3);
      expect(run(0)).toBe(0);
    });

    it("Gideon the Oathless: 1 damage to the opponent whose creature enters, and to the one who activates a loyalty ability", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Gideon the Oathless"] },
        p2: { hand: ["Bear Cub"], battlefield: [...lands("Forest", 2), "Ajani Resolute"] },
      });
      s = resolve(cast(s, "p2", "Bear Cub"));
      expect(life(s, "p2")).toBe(19);
      s = resolve(activate(s, "p2", idOf(s, "p2", "battlefield", "Ajani Resolute"), "0"));
      expect(life(s, "p2")).toBe(19 - 1 + 1);
      expect(life(s, "p1")).toBe(20);
      // Your own creatures and loyalty abilities trigger nothing.
      let t = scenario({
        p1: { hand: ["Bear Cub"], battlefield: ["Gideon the Oathless", ...lands("Forest", 2), "Ajani Resolute"] },
      });
      t = resolve(cast(t, "p1", "Bear Cub"));
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Ajani Resolute"), "0"));
      expect([life(t, "p1"), life(t, "p2")]).toEqual([21, 20]);
    });

    it("Gideon's Memorial: creature tokens +1/+0 and vigilance; its mana pays only for a planeswalker spell", () => {
      const s = scenario({ p1: { battlefield: ["Gideon's Memorial", "Bear Cub"], hand: ["Savannah Lions", "Ajani Resolute"] } });
      const [tok] = createTokens(
        s,
        "p1",
        { name: "Cadet", colors: [], types: ["Creature"], subtypes: [], power: 2, toughness: 2 },
        1,
      );
      bump(s);
      expect(pt(s, tok as string)).toEqual([3, 2]);
      expect(chars(s, tok as string).keywords).toContain("vigilance");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(pt(s, bear)).toEqual([2, 2]);
      expect(chars(s, bear).keywords).not.toContain("vigilance");
      expect(castable(s, "p1", idOf(s, "p1", "hand", "Savannah Lions"))).toBe(false);
      const t = scenario({ p1: { battlefield: ["Gideon's Memorial", "Plains"], hand: ["Ajani Resolute"] } });
      expect(castable(t, "p1", idOf(t, "p1", "hand", "Ajani Resolute"))).toBe(true);
    });

    it("Gideon's Memorial: {1}{W}, discard it: 4 damage to an attacking or blocking creature", () => {
      let s = scenario({
        active: "p2",
        p1: { hand: ["Gideon's Memorial"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const memorial = idOf(s, "p1", "hand", "Gideon's Memorial");
      s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
      s = act(s, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      s = act(s, "p2", { type: "pass" });
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === memorial);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([angel]);
      s = resolve(activate(s, "p1", memorial, undefined, { targets: { t: [angel] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(graveOf(s, "p1")).toEqual(["Gideon's Memorial"]);
    });

    it("Guiding Hydra: enters with X counters; at the beginning of your combat, you may move one onto each of your other creatures", () => {
      const run = (yes: boolean) => {
        let s = scenario({ p1: { hand: ["Guiding Hydra"], battlefield: [...lands("Plains", 4), "Bear Cub", "Savannah Lions"] } });
        s = resolve(cast(s, "p1", "Guiding Hydra", { x: 3 }));
        const hydra = idOf(s, "p1", "battlefield", "Guiding Hydra");
        expect(counters(s, hydra)).toBe(3);
        s = play(
          s,
          answering(yes),
          (x) =>
            x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
        );
        return [
          counters(s, hydra),
          counters(s, idOf(s, "p1", "battlefield", "Bear Cub")),
          counters(s, idOf(s, "p1", "battlefield", "Savannah Lions")),
        ];
      };
      expect(run(true)).toEqual([2, 1, 1]);
      expect(run(false)).toEqual([3, 0, 0]);
    });

    it("Identity Echo: {3}{R}, as a sorcery: exile one of your creatures, reveal up to one creature or planeswalker card and put it onto the battlefield", () => {
      let s = scenario({
        p1: {
          battlefield: ["Identity Echo", "Bear Cub", ...lands("Mountain", 4)],
          library: ["Forest", "Shock", "Serra Angel", "Plains"],
        },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const echo = idOf(s, "p1", "battlefield", "Identity Echo");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === echo);
      const legal = opt?.type === "activate" ? (opt.targets[0]?.legal ?? []) : [];
      expect(legal).toEqual([idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = resolve(activate(s, "p1", echo, undefined, { targets: { t: legal } }));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(idsOf(s, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
      const lib = namesIn(s, s.players.p1?.library);
      expect(lib[0]).toBe("Plains");
      expect(lib.slice(1).sort()).toEqual(["Forest", "Shock"]);
    });

    it("Lich's Relic: on entering, paying {2} destroys an opposing creature or planeswalker; equipped +2/+1; Equip {2}", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { hand: ["Lich's Relic"], battlefield: lands("Swamp", 3) },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(cast(s, "p1", "Lich's Relic"), answering(yes, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      };
      expect(graveOf(run(true), "p2")).toEqual(["Serra Angel"]);
      expect(graveOf(run(false), "p2")).toEqual([]);
      let t = scenario({ p1: { battlefield: ["Lich's Relic", "Bear Cub", ...lands("Swamp", 2)] } });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Lich's Relic"), "Equip", { targets: { t: [bear] } }));
      expect(pt(t, bear)).toEqual([4, 3]);
    });

    it("Loyal Tutor: search for a planeswalker card and put it on top of your library", () => {
      let s = scenario({
        p1: { hand: ["Loyal Tutor"], battlefield: ["Plains"], library: ["Forest", "Forest", "Ajani Resolute", "Forest"] },
      });
      s = resolve(cast(s, "p1", "Loyal Tutor"));
      expect(nameOf(s, s.players.p1?.library[0] as string)).toBe("Ajani Resolute");
      expect(s.players.p1?.library).toHaveLength(4);
    });
  });

  describe("prepared spells", () => {
    it("Bloodline Recollector — Ancestral Craving: the targeted player draws three cards and loses 3 life", () => {
      let s = scenario({ p1: { battlefield: ["Bloodline Recollector", "Swamp"] } });
      const r = idOf(s, "p1", "battlefield", "Bloodline Recollector");
      setPrepared(s, s.objects[r] as NonNullable<S["objects"][string]>, true);
      s = resolve(castCopy(s, r, { targets: { t: ["p2"] } }));
      expect(s.players.p2?.hand).toHaveLength(3);
      expect(life(s, "p2")).toBe(17);
      expect(prepared(s, r)).toBe(false);
    });

    it("Carnivorous Cultivator — Enroot: search for a land card and put it into your graveyard", () => {
      let s = scenario({ p1: { battlefield: ["Carnivorous Cultivator", "Forest"], library: ["Shock", "Plains", "Shock"] } });
      const c = idOf(s, "p1", "battlefield", "Carnivorous Cultivator");
      setPrepared(s, s.objects[c] as NonNullable<S["objects"][string]>, true);
      s = resolve(castCopy(s, c));
      expect(graveOf(s, "p1")).toEqual(["Plains"]);
      expect(s.players.p1?.library).toHaveLength(2);
    });

    it("Diviner of Victory — Unwind History: returns an opposing creature with mana value 3 or less, then surveil 1", () => {
      let s = scenario({
        p1: { battlefield: ["Diviner of Victory", ...lands("Island", 2)] },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const d = idOf(s, "p1", "battlefield", "Diviner of Victory");
      setPrepared(s, s.objects[d] as NonNullable<S["objects"][string]>, true);
      const copy = s.objects[d]?.preparedCopy as string;
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === copy);
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Bear Cub")]);
      let surveilled = false;
      s = resolve(castCopy(s, d, { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(handOf(s, "p2")).toEqual(["Bear Cub"]);
      expect(surveilled).toBe(true);
      expect(pt(s, d)).toEqual([2, 2]); // and the surveil triggers its ability
    });

    it("Pompous Battlemage: prowess, enters prepared; Improvised Act: you may discard a card, and if you do, draw", () => {
      let s = scenario({ p1: { hand: ["Pompous Battlemage", "Opt"], battlefield: lands("Mountain", 2) } });
      s = resolve(cast(s, "p1", "Pompous Battlemage"));
      const b = idOf(s, "p1", "battlefield", "Pompous Battlemage");
      expect(prepared(s, b)).toBe(true);
      expect(chars(s, b).keywords).toContain("prowess");
      const run = (discard: boolean) => {
        const t = resolve(castCopy(s, b), (req) =>
          req.intent === "discard" && req.type === "pick" ? (discard ? req.options.slice(0, 1) : []) : undefined,
        );
        return { hand: handOf(t, "p1"), grave: graveOf(t, "p1") };
      };
      expect(run(true)).toEqual({ hand: ["Forest"], grave: ["Opt"] });
      expect(run(false)).toEqual({ hand: ["Opt"], grave: [] });
    });

    it("Pyre Rhymer: prowess, enters prepared; Molten Tide: until end of turn, a Mountain tapped for mana adds an additional {R}", () => {
      let s = scenario({ p1: { hand: ["Pyre Rhymer"], battlefield: [...lands("Mountain", 5), "Stomping Ground"] } });
      s = resolve(cast(s, "p1", "Pyre Rhymer"));
      const r = idOf(s, "p1", "battlefield", "Pyre Rhymer");
      expect(prepared(s, r)).toBe(true);
      expect(chars(s, r).keywords).toContain("prowess");
      s = resolve(castCopy(s, r));
      const m = s.battlefield.find((id) => nameOf(s, id) === "Mountain" && !s.objects[id]?.tapped) as string;
      s = act(s, "p1", { type: "tapForMana", source: m, ability: 0 });
      expect(s.players.p1?.manaPool.R).toBe(2);
      // A Mountain Forest tapped for {G}: the additional mana is {R}, not {G}.
      const ground = idOf(s, "p1", "battlefield", "Stomping Ground");
      const g = manaAbilitiesOf(s, ground).findIndex((ab) => ab.produce.includes("G"));
      s = act(s, "p1", { type: "tapForMana", source: ground, ability: g, color: "G" });
      expect([s.players.p1?.manaPool.G, s.players.p1?.manaPool.R]).toEqual([1, 3]);
    });
  });

  describe("rares (3)", () => {
    it("Lyra, Archangel of Dawn: flying; each life gain puts a +1/+1 counter on each of your Angels", () => {
      let s = scenario({
        p1: { battlefield: ["Lyra, Archangel of Dawn", "Serra Angel", "Bear Cub"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      gainLife(s, "p1", 2);
      s = resolve(s);
      expect(counters(s, idOf(s, "p1", "battlefield", "Lyra, Archangel of Dawn"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(0);
      expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
      gainLife(s, "p2", 2);
      s = resolve(s);
      expect(counters(s, idOf(s, "p1", "battlefield", "Serra Angel"))).toBe(1);
    });

    it("Lyra, Tolarian Archangel: at each end step, a 3/3 flying Angel if you drew three cards this turn", () => {
      const run = (n: number) => {
        let s = scenario({ p1: { battlefield: ["Lyra, Tolarian Archangel"] } });
        drawCards(s, "p1", n);
        s = toEndStep(s);
        return tokensNamed(s, "Angel");
      };
      expect(run(2)).toHaveLength(0);
      const s = scenario({ p1: { battlefield: ["Lyra, Tolarian Archangel"] } });
      drawCards(s, "p1", 3);
      const t = toEndStep(s);
      const angels = t.battlefield.filter((id) => t.objects[id]?.isToken);
      expect(angels).toHaveLength(1);
      expect(pt(t, angels[0] as string)).toEqual([3, 3]);
      expect(chars(t, angels[0] as string).keywords).toContain("flying");
    });

    it("Lyra, Tolarian Archangel: {3}{U}{U}: until end of turn, its combat damage to a player draws two cards", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { battlefield: ["Lyra, Tolarian Archangel", ...lands("Island", 5)] } });
        const lyra = idOf(s, "p1", "battlefield", "Lyra, Tolarian Archangel");
        if (pay) s = resolve(activate(s, "p1", lyra));
        s = attackThrough(s, [lyra]);
        return [life(s, "p2"), s.players.p1?.hand.length];
      };
      expect(run(true)).toEqual([17, 2]);
      expect(run(false)).toEqual([17, 0]);
    });

    it("Master of Barbs: menace; when an opponent is dealt noncombat damage, your creatures get +1/+0", () => {
      let s = scenario({
        p1: { hand: ["Shock", "Shock"], battlefield: ["Master of Barbs", "Bear Cub", ...lands("Mountain", 2)] },
      });
      const master = idOf(s, "p1", "battlefield", "Master of Barbs");
      expect(chars(s, master).keywords).toContain("menace");
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(pt(s, master)).toEqual([2, 1]);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(pt(s, master)).toEqual([3, 1]);
    });

    it("Master of Barbs: from any source (even an opposing one); one trigger per batch of damaged opponents; not in combat", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Master of Barbs"] }, p2: { battlefield: ["Bear Cub"] } });
      const master = idOf(s, "p1", "battlefield", "Master of Barbs");
      const cub = sourceFromObject(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      // An opponent's source deals them noncombat damage.
      dealDamage(s, cub, "p2", 1, false);
      s = resolve(s);
      expect(pt(s, master)).toEqual([3, 1]);
      // Two opponents damaged at the same time: a single trigger.
      simultaneously(s, () => {
        dealDamage(s, cub, "p2", 1, false);
        dealDamage(s, cub, "p3", 1, false);
      });
      s = resolve(s);
      expect(pt(s, master)).toEqual([4, 1]);
      // Combat damage, or noncombat damage to you: nothing.
      dealDamage(s, cub, "p2", 1, true);
      dealDamage(s, cub, "p1", 1, false);
      expect(s.triggers).toHaveLength(0);
    });

    it("Null Summoner: cast, exiles a nonland card from the opponent's hand; with threshold, you may cast it with mana of any type", () => {
      const run = (grave: number) => {
        let s = scenario({
          p1: { hand: ["Null Summoner"], battlefield: ["Island", ...lands("Swamp", 8)], graveyard: lands("Plains", grave) },
          p2: { hand: ["Serra Angel", "Forest"] },
        });
        const angel = idOf(s, "p2", "hand", "Serra Angel");
        s = resolve(cast(s, "p1", "Null Summoner"), answering(true, [angel]));
        expect(handOf(s, "p2")).toEqual(["Forest"]);
        expect(namesIn(s, s.exile)).toEqual(["Serra Angel"]);
        return { s, angel: s.exile[0] as string };
      };
      const without = run(6);
      expect(castable(without.s, "p1", without.angel)).toBe(false);
      const w = run(7);
      expect(castable(w.s, "p1", w.angel)).toBe(true);
      const t = resolve(act(w.s, "p1", { type: "cast", card: w.angel }));
      expect(idsOf(t, "p1", "battlefield", "Serra Angel")).toHaveLength(1);
    });

    it("Null Summoner: entering without having been cast (Flickering Hound): nothing is exiled", () => {
      let s = scenario({
        p1: { hand: ["Savannah Lions"], battlefield: ["Flickering Hound", "Null Summoner", "Plains"] },
        p2: { hand: ["Serra Angel"] },
      });
      const ns = idOf(s, "p1", "battlefield", "Null Summoner");
      s = resolve(cast(s, "p1", "Savannah Lions"), answering(true, [ns]));
      expect(s.battlefield).not.toContain(ns);
      expect(handOf(s, "p2")).toEqual(["Serra Angel"]);
    });

    it("slow lands (Overgrown Farmland, Rockfall Vale, Shipwreck Marsh): tapped with fewer than two other lands; both their colors", () => {
      for (const [land, colors] of [
        ["Overgrown Farmland", ["G", "W"]],
        ["Rockfall Vale", ["R", "G"]],
        ["Shipwreck Marsh", ["U", "B"]],
      ] as const) {
        let s = scenario({ p1: { hand: [land], battlefield: ["Plains"] } });
        s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", land) });
        expect(s.objects[idOf(s, "p1", "battlefield", land)]?.tapped).toBe(true);
        let t = scenario({ p1: { hand: [land], battlefield: ["Plains", "Island"] } });
        t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", land) });
        const id = idOf(t, "p1", "battlefield", land);
        expect(t.objects[id]?.tapped).toBe(false);
        const offered = legalActions(t, "p1").filter((a) => a.type === "tapForMana" && a.source === id);
        expect(offered.flatMap((a) => (a.type === "tapForMana" ? a.colors : [])).sort()).toEqual([...colors].sort());
      }
    });

    it("Puppet Crafting: the enchanted artifact becomes a 5/5 Construct creature; {4}{G}: returns from the graveyard to hand", () => {
      let s = scenario({ p1: { hand: ["Puppet Crafting"], battlefield: ["Eye of Jace", "Bear Cub", ...lands("Forest", 2)] } });
      const eye = idOf(s, "p1", "battlefield", "Eye of Jace");
      expect(() =>
        cast(s, "p1", "Puppet Crafting", { targets: { enchant: [idOf(s, "p1", "battlefield", "Bear Cub")] } }),
      ).toThrow(RulesError);
      s = resolve(cast(s, "p1", "Puppet Crafting", { targets: { enchant: [eye] } }));
      expect(chars(s, eye).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, eye).subtypes).toContain("Construct");
      expect(pt(s, eye)).toEqual([5, 5]);
      let t = scenario({ p1: { graveyard: ["Puppet Crafting"], battlefield: lands("Forest", 5) } });
      t = resolve(activate(t, "p1", idOf(t, "p1", "graveyard", "Puppet Crafting")));
      expect(handOf(t, "p1")).toEqual(["Puppet Crafting"]);
    });

    it("Repurposed Enforcer: when it attacks, empower Jace X (X = your creatures)", () => {
      let s = scenario({ p1: { battlefield: ["Repurposed Enforcer", "Bear Cub", "Savannah Lions"] } });
      s = settleNoBlocks(attack(s, [idOf(s, "p1", "battlefield", "Repurposed Enforcer")]));
      expect(jaceLoyalty(s)).toBe(3);
    });

    it("Rise of the Deathbringer: draw according to the greatest power among your creatures and lose that much life; or all creatures −3/−3", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Rise of the Deathbringer"], battlefield: ["Serra Angel", "Bear Cub", ...lands("Swamp", 5)] },
          p2: { battlefield: ["Shivan Dragon"] },
        });
      const draw = resolve(cast(setup(), "p1", "Rise of the Deathbringer", { mode: 0 }));
      expect(draw.players.p1?.hand).toHaveLength(4);
      expect(life(draw, "p1")).toBe(16);
      const shrink = resolve(cast(setup(), "p1", "Rise of the Deathbringer", { mode: 1 }));
      expect(graveOf(shrink, "p1").sort()).toEqual(["Bear Cub", "Rise of the Deathbringer"]);
      expect(pt(shrink, idOf(shrink, "p1", "battlefield", "Serra Angel"))).toEqual([1, 1]);
      expect(pt(shrink, idOf(shrink, "p2", "battlefield", "Shivan Dragon"))).toEqual([2, 2]);
    });

    it("Roiling Canopy: enters tapped; a Forest entering with at least five other Forests gives +3/+3 to one of your creatures", () => {
      let c = scenario({ p1: { hand: ["Roiling Canopy"] } });
      c = act(c, "p1", { type: "playLand", card: idOf(c, "p1", "hand", "Roiling Canopy") });
      expect(c.objects[idOf(c, "p1", "battlefield", "Roiling Canopy")]?.tapped).toBe(true);
      const run = (forests: number) => {
        let s = scenario({ p1: { hand: ["Forest"], battlefield: ["Roiling Canopy", "Bear Cub", ...lands("Forest", forests)] } });
        s = resolve(act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Forest") }));
        return pt(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      };
      expect(run(5)).toEqual([5, 5]);
      expect(run(4)).toEqual([2, 2]);
    });

    it("Samut, Hazoret's Champion: your creatures have haste", () => {
      const s = scenario({
        p1: { battlefield: ["Samut, Hazoret's Champion", { name: "Bear Cub", sick: true }] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).toContain("haste");
      expect(chars(s, idOf(s, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("haste");
    });

    it("Simulacrum Shaper: on entering, you may search for a basic land, put onto the battlefield tapped; when it dies, draw", () => {
      const run = (yes: boolean) => {
        const s = scenario({
          p1: { hand: ["Simulacrum Shaper"], battlefield: lands("Forest", 3), library: ["Shock", "Plains", "Shock"] },
        });
        return resolve(cast(s, "p1", "Simulacrum Shaper"), answering(yes));
      };
      const yes = run(true);
      const plains = idOf(yes, "p1", "battlefield", "Plains");
      expect(yes.objects[plains]?.tapped).toBe(true);
      expect(idsOf(run(false), "p1", "battlefield", "Plains")).toHaveLength(0);
      destroy(yes, idOf(yes, "p1", "battlefield", "Simulacrum Shaper"));
      const after = resolve(yes);
      expect(after.players.p1?.hand).toHaveLength(1);
    });

    it("Solarium Sentry: +2 life when an opponent casts a spell with mana value 2 or less (not 3, not your spells)", () => {
      let s = scenario({
        active: "p2",
        p1: { battlefield: ["Solarium Sentry"] },
        p2: { hand: ["Bear Cub", "Seasoned Cryomancer"], battlefield: [...lands("Forest", 2), ...lands("Island", 3)] },
      });
      s = resolve(cast(s, "p2", "Bear Cub"));
      expect(life(s, "p1")).toBe(22);
      s = resolve(cast(s, "p2", "Seasoned Cryomancer"));
      expect(life(s, "p1")).toBe(22);
      let t = scenario({ p1: { hand: ["Bear Cub"], battlefield: ["Solarium Sentry", ...lands("Forest", 2)] } });
      t = resolve(cast(t, "p1", "Bear Cub"));
      expect(life(t, "p1")).toBe(20);
    });
  });

  describe("rares (4)", () => {
    it("Solitary Cell: on entering, exiles an opposing nonland permanent with mana value 3 or less until it leaves", () => {
      let s = scenario({
        p1: { hand: ["Solitary Cell"], battlefield: ["Mountain", "Plains"] },
        p2: { battlefield: ["Bear Cub", "Serra Angel", "Forest"] },
      });
      // Only legal target (the Angel has mana value 5): chosen automatically.
      s = resolve(cast(s, "p1", "Solitary Cell"));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      destroy(s, idOf(s, "p1", "battlefield", "Solitary Cell"));
      s = resolve(s);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Solitary Cell: {1}, {T}, discard a legendary card: draw a card", () => {
      const setup = (hand: string[]) => scenario({ p1: { hand, battlefield: ["Solitary Cell", "Mountain"] } });
      const plain = setup(["Bear Cub"]);
      expect(canUse(plain, "p1", idOf(plain, "p1", "battlefield", "Solitary Cell"))).toBe(false);
      let s = setup(["Samut, Hazoret's Champion"]);
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Solitary Cell")));
      expect(graveOf(s, "p1")).toEqual(["Samut, Hazoret's Champion"]);
      expect(handOf(s, "p1")).toEqual(["Forest"]);
    });

    it("Sphinx of False Conclusions: flash, flying; when it attacks, draw then discard; dying (if not a token), a token copy", () => {
      let s = scenario({ p1: { battlefield: ["Sphinx of False Conclusions"], hand: ["Opt"] } });
      const sphinx = idOf(s, "p1", "battlefield", "Sphinx of False Conclusions");
      expect(chars(s, sphinx).keywords).toEqual(expect.arrayContaining(["flash", "flying"]));
      s = settleNoBlocks(attack(s, [sphinx]));
      expect(s.players.p1?.hand).toHaveLength(1);
      expect(s.players.p1?.graveyard).toHaveLength(1);
      let t = scenario({ p1: { battlefield: ["Sphinx of False Conclusions"] } });
      destroy(t, idOf(t, "p1", "battlefield", "Sphinx of False Conclusions"));
      t = resolve(t);
      const copy = idOf(t, "p1", "battlefield", "Sphinx of False Conclusions");
      expect(t.objects[copy]?.isToken).toBe(true);
      destroy(t, copy);
      t = resolve(t);
      expect(idsOf(t, "p1", "battlefield", "Sphinx of False Conclusions")).toHaveLength(0);
    });

    it("Stinging Vitriol: 2 damage to the targeted opponent, who discards the nonland card of your choice", () => {
      let s = scenario({
        p1: { hand: ["Stinging Vitriol"], battlefield: ["Swamp", "Mountain"] },
        p2: { hand: ["Serra Angel", "Forest", "Shock"] },
      });
      const shock = idOf(s, "p2", "hand", "Shock");
      let options: (string | undefined)[] = [];
      s = resolve(cast(s, "p1", "Stinging Vitriol", { targets: { t: ["p2"] } }), (req, player, x) => {
        if (req.type !== "pick" || req.intent !== "discard") return undefined;
        expect(player).toBe("p1");
        options = namesIn(x, req.options);
        return [shock];
      });
      expect(options.sort()).toEqual(["Serra Angel", "Shock"]);
      expect(life(s, "p2")).toBe(18);
      expect(graveOf(s, "p2")).toEqual(["Shock"]);
    });

    it("Theorist's Sanctum: Island; tapped unless scrying a Jace; {2}{U}, {T}: empower Jace 2", () => {
      let s = scenario({ p1: { hand: ["Theorist's Sanctum"] } });
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Theorist's Sanctum") });
      const sanctum = idOf(s, "p1", "battlefield", "Theorist's Sanctum");
      expect(s.objects[sanctum]?.tapped).toBe(true);
      expect(chars(s, sanctum).subtypes).toContain("Island");
      let t = scenario({ p1: { hand: ["Theorist's Sanctum", "Jace, Reality Sculptor"] } });
      t = act(t, "p1", { type: "playLand", card: idOf(t, "p1", "hand", "Theorist's Sanctum") });
      expect(t.objects[idOf(t, "p1", "battlefield", "Theorist's Sanctum")]?.tapped).toBe(false);
      let u = scenario({ p1: { battlefield: ["Theorist's Sanctum", ...lands("Island", 3)] } });
      u = resolve(activate(u, "p1", idOf(u, "p1", "battlefield", "Theorist's Sanctum"), "Empower"));
      expect(jaceLoyalty(u)).toBe(2);
    });

    it("Theorist's Sanctum: the Jace to behold is chosen with the land (a card from hand revealed); none: tapped (PLAN-L L5)", () => {
      const setup = () => scenario({ p1: { hand: ["Theorist's Sanctum", "Jace, Reality Sculptor"] } });
      const s0 = setup();
      const land = idOf(s0, "p1", "hand", "Theorist's Sanctum");
      const jace = idOf(s0, "p1", "hand", "Jace, Reality Sculptor");
      const option = legalActions(s0, "p1").find((a) => a.type === "playLand" && a.card === land);
      const req = option?.type === "playLand" ? option.choose : undefined;
      expect(req?.type === "pick" && req.options).toEqual([jace]);
      // Beheld: untapped, the card revealed.
      const yes = submit(s0, "p1", { type: "playLand", card: land, chosen: jace });
      expect(yes.state.objects[idOf(yes.state, "p1", "battlefield", "Theorist's Sanctum")]?.tapped).toBe(false);
      expect(yes.events.some((e) => e.type === "reveal")).toBe(true);
      // Declined: tapped, nothing revealed.
      const s1 = setup();
      const no = submit(s1, "p1", { type: "playLand", card: idOf(s1, "p1", "hand", "Theorist's Sanctum"), chosen: "" });
      expect(no.state.objects[idOf(no.state, "p1", "battlefield", "Theorist's Sanctum")]?.tapped).toBe(true);
      expect(no.events.some((e) => e.type === "reveal")).toBe(false);
    });

    it("Variable Chaser: flying, prowess, enters prepared; Arc of Fortune: each player may discard their hand and draw seven cards", () => {
      let s = scenario({
        p1: { hand: ["Variable Chaser", "Opt"], battlefield: lands("Island", 6) },
        p2: { hand: ["Shock", "Shock"] },
      });
      s = resolve(cast(s, "p1", "Variable Chaser"));
      const v = idOf(s, "p1", "battlefield", "Variable Chaser");
      expect(prepared(s, v)).toBe(true);
      expect(chars(s, v).keywords).toEqual(expect.arrayContaining(["flying", "prowess"]));
      s = resolve(castCopy(s, v), (req, player) => (req.type === "yesNo" ? [player === "p1" ? 1 : 0] : undefined));
      expect(s.players.p1?.hand).toHaveLength(7);
      expect(graveOf(s, "p1")).toEqual(["Opt"]);
      expect(handOf(s, "p2")).toEqual(["Shock", "Shock"]);
    });

    it("Verdant Kraken: at each player's upkeep, you create a 3/3 Forest Tentacle token (land creature)", () => {
      let s = scenario({ p1: { battlefield: ["Verdant Kraken"] } });
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2" && x.turn.step === "main1",
      );
      const [tok] = s.battlefield.filter((id) => s.objects[id]?.isToken);
      expect(s.objects[tok as string]?.controller).toBe("p1");
      expect(chars(s, tok as string).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(chars(s, tok as string).subtypes).toContain("Forest");
      expect(pt(s, tok as string)).toEqual([3, 3]);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(2);
    });

    it("Vindictive Triumph: exiles a creature; mana value 3 or less, it returns tapped under your control and is exiled at the end step", () => {
      let s = scenario({
        p1: { hand: ["Vindictive Triumph"], battlefield: ["Plains", "Swamp", "Swamp"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Vindictive Triumph", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(s.objects[bear]?.tapped).toBe(true);
      s = toEndStep(s);
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { hand: ["Vindictive Triumph"], battlefield: ["Plains", "Swamp", "Swamp"] },
        p2: { battlefield: ["Serra Angel"] },
      });
      t = resolve(cast(t, "p1", "Vindictive Triumph", { targets: { t: [idOf(t, "p2", "battlefield", "Serra Angel")] } }));
      expect(namesIn(t, t.exile)).toEqual(["Serra Angel"]);
      expect(t.battlefield.some((id) => nameOf(t, id) === "Serra Angel")).toBe(false);
    });

    it("Vraska, Soul of Stone: your artifact creatures have vigilance; a noncreature spell cast creates a 1/1 Treasure Sculpture", () => {
      let s = scenario({
        p1: { hand: ["Shock", "Bear Cub"], battlefield: ["Vraska, Soul of Stone", "Mountain", ...lands("Forest", 2)] },
      });
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      const [tok] = s.battlefield.filter((id) => s.objects[id]?.isToken);
      expect(chars(s, tok as string).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, tok as string).subtypes).toEqual(expect.arrayContaining(["Sculpture", "Treasure"]));
      expect(pt(s, tok as string)).toEqual([1, 1]);
      expect(chars(s, tok as string).keywords).toContain("vigilance");
      expect(chars(s, idOf(s, "p1", "battlefield", "Vraska, Soul of Stone")).keywords).not.toContain("vigilance");
      s = resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Bear Cub") }));
      expect(s.battlefield.filter((id) => s.objects[id]?.isToken)).toHaveLength(1);
    });

    it("Vraska, the Cutting Glare: deathtouch; on entering with six lands, destroys an opposing permanent, whose controller creates a Treasure", () => {
      const run = (n: number) => {
        const s = scenario({
          p1: { hand: ["Vraska, the Cutting Glare"], battlefield: ["Forest", ...lands("Swamp", n - 1)] },
          p2: { battlefield: ["Serra Angel"] },
        });
        return resolve(
          cast(s, "p1", "Vraska, the Cutting Glare"),
          answering(true, [idOf(s, "p2", "battlefield", "Serra Angel")]),
        );
      };
      const six = run(6);
      expect(graveOf(six, "p2")).toEqual(["Serra Angel"]);
      expect(tokensNamed(six, "Treasure", "p2")).toHaveLength(1);
      expect(chars(six, idOf(six, "p1", "battlefield", "Vraska, the Cutting Glare")).keywords).toContain("deathtouch");
      const five = run(5);
      expect(graveOf(five, "p2")).toEqual([]);
      expect(tokensNamed(five, "Treasure", "p2")).toHaveLength(0);
    });

    it("Vraska's Final Mercy: lose 2 life and destroy a creature or planeswalker; or lose 2 life and empower Jace 6", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Vraska's Final Mercy"], battlefield: lands("Swamp", 2) },
          p2: { battlefield: ["Ajani Resolute"] },
        });
      let s = setup();
      s = resolve(
        cast(s, "p1", "Vraska's Final Mercy", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Ajani Resolute")] } }),
      );
      expect(life(s, "p1")).toBe(18);
      expect(graveOf(s, "p2")).toEqual(["Ajani Resolute"]);
      const t = resolve(cast(setup(), "p1", "Vraska's Final Mercy", { mode: 1 }));
      expect(life(t, "p1")).toBe(18);
      expect(jaceLoyalty(t)).toBe(6);
    });

    it("Fblthp, Knows the Way: on entering, up to X basic lands with different names into hand (X paid)", () => {
      let s = scenario({
        p1: {
          hand: ["Fblthp, Knows the Way"],
          battlefield: lands("Forest", 4),
          library: ["Plains", "Plains", "Island", "Shock"],
        },
      });
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Fblthp, Knows the Way", { x: 2 }), (req, _p, x) => {
        if (req.type !== "pick" || req.intent !== "search") return undefined;
        offered = req.options;
        expect(req.max).toBe(2);
        return [...(pickNamed(x, req, "Plains") ?? []), ...(pickNamed(x, req, "Island") ?? [])];
      });
      expect(offered.length).toBeGreaterThan(0);
      expect(handOf(s, "p1").sort()).toEqual(["Island", "Plains"]);
    });
  });

  describe("peu communes (1)", () => {
    /** Answer: the mode `mode` of a modal trigger, then `want` in the choices. */
    const withMode =
      (mode: number, want: string[] = []): Answer =>
      (req) => {
        if (req.intent === "triggerMode") return [String(mode)];
        return answering(true, want)(req, "p1", undefined as never);
      };

    it("Archive Arbiter: flying; on entering, destroy a noncreature nonland permanent, or gain 4 life", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Archive Arbiter"], battlefield: lands("Plains", 6) },
          p2: { battlefield: ["Eye of Jace", "Bear Cub"] },
        });
      let s = setup();
      const eye = idOf(s, "p2", "battlefield", "Eye of Jace");
      s = resolve(cast(s, "p1", "Archive Arbiter"), withMode(0, [eye]));
      expect(graveOf(s, "p2")).toEqual(["Eye of Jace"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Archive Arbiter")).keywords).toContain("flying");
      const t = resolve(cast(setup(), "p1", "Archive Arbiter"), withMode(1));
      expect(life(t, "p1")).toBe(24);
      expect(graveOf(t, "p2")).toEqual([]);
    });

    it("Arni, Humble Scribe: {T}: draw then discard; untaps when another nontoken creature enters under your control", () => {
      let s = scenario({ p1: { battlefield: ["Arni, Humble Scribe", ...lands("Forest", 2)], hand: ["Bear Cub", "Opt"] } });
      const arni = idOf(s, "p1", "battlefield", "Arni, Humble Scribe");
      s = resolve(activate(s, "p1", arni), (req) => (req.intent === "discard" ? pickNamed(s, req, "Opt") : undefined));
      expect(graveOf(s, "p1")).toEqual(["Opt"]);
      expect(s.objects[arni]?.tapped).toBe(true);
      createTokens(s, "p1", { name: "Cadet", colors: [], types: ["Creature"], subtypes: [], power: 2, toughness: 2 }, 1);
      s = resolve(s);
      expect(s.objects[arni]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(s.objects[arni]?.tapped).toBe(false);
    });

    it("Arni, Renowned Champion: trample; +X/+0 when another of your creatures enters (X = its power)", () => {
      let s = scenario({ p1: { hand: ["Serra Angel"], battlefield: ["Arni, Renowned Champion", ...lands("Plains", 5)] } });
      const arni = idOf(s, "p1", "battlefield", "Arni, Renowned Champion");
      expect(chars(s, arni).keywords).toContain("trample");
      s = resolve(cast(s, "p1", "Serra Angel"));
      expect(pt(s, arni)).toEqual([5, 5]);
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Arni, Renowned Champion"] },
        p2: { hand: ["Bear Cub"], battlefield: lands("Forest", 2) },
      });
      t = resolve(cast(t, "p2", "Bear Cub"));
      expect(pt(t, idOf(t, "p1", "battlefield", "Arni, Renowned Champion"))).toEqual([1, 5]);
    });

    it("Bloombrute: draw on the first life gain of the turn; {4}{G}{W}: trample and lifelink until end of turn", () => {
      let s = scenario({ p1: { battlefield: ["Bloombrute", "Bear Cub", ...lands("Forest", 5), "Plains"] } });
      gainLife(s, "p1", 1);
      s = resolve(s);
      gainLife(s, "p1", 1);
      s = resolve(s);
      expect(s.players.p1?.hand).toHaveLength(1);
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Bloombrute"), undefined, { targets: { t: [bear] } }));
      expect(chars(s, bear).keywords).toEqual(expect.arrayContaining(["trample", "lifelink"]));
      s = toEndStep(s);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p2",
      );
      expect(chars(s, bear).keywords).not.toContain("lifelink");
    });

    it("Clash of Elements: the owner puts the permanent on top (and takes 2 damage) or on the bottom of their library", () => {
      const run = (where: "top" | "bottom") => {
        const s = scenario({
          p1: { hand: ["Clash of Elements"], battlefield: ["Island", "Mountain", "Mountain"] },
          p2: { battlefield: ["Serra Angel"] },
        });
        let asked = "";
        const t = resolve(
          cast(s, "p1", "Clash of Elements", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
          (req, player) => {
            if (req.intent !== "topOrBottom") return undefined;
            asked = player;
            return [where];
          },
        );
        expect(asked).toBe("p2");
        const lib = namesIn(t, t.players.p2?.library);
        return { life: life(t, "p2"), pos: lib.indexOf("Serra Angel"), size: lib.length };
      };
      expect(run("top")).toEqual({ life: 18, pos: 0, size: 11 });
      expect(run("bottom")).toEqual({ life: 20, pos: 10, size: 11 });
    });

    it("Command the Stage: a Cadet, then a counter on each other Wizard token; returns to hand at upkeep if an opponent was dealt noncombat damage the previous turn", () => {
      let s = scenario({ p1: { hand: ["Command the Stage"], battlefield: lands("Mountain", 3) } });
      const [old] = createTokens(
        s,
        "p1",
        { name: "Cadet", colors: [], types: ["Creature"], subtypes: ["Wizard", "Soldier"], power: 2, toughness: 2 },
        1,
      );
      s = resolve(cast(s, "p1", "Command the Stage"));
      const cadets = tokensNamed(s, "Cadet");
      expect(cadets).toHaveLength(2);
      expect(counters(s, old as string)).toBe(1);
      expect(counters(s, cadets.find((id) => id !== old) as string)).toBe(0);
      const run = (damage: boolean) => {
        let t = scenario({ p1: { hand: ["Shock"], battlefield: ["Mountain"], graveyard: ["Command the Stage"] } });
        if (damage) t = resolve(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
        t = play(
          t,
          () => undefined,
          (x) => x.turn.active === "p2" && x.turn.step === "main1",
        );
        return handOf(t, "p1");
      };
      expect(run(true)).toEqual(["Command the Stage"]);
      expect(run(false)).toEqual(["Shock"]);
    });

    it("Craftwork Crusher: trample; on entering, two modes among 4 damage, a Cadet, draw", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Craftwork Crusher"], battlefield: [...lands("Mountain", 3), ...lands("Forest", 4)] },
          p2: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      s = resolve(cast(s, "p1", "Craftwork Crusher"), withMode(0, [idOf(s, "p2", "battlefield", "Serra Angel")]));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(tokensNamed(s, "Cadet")).toHaveLength(1);
      expect(s.players.p1?.hand).toHaveLength(0);
      expect(chars(s, idOf(s, "p1", "battlefield", "Craftwork Crusher")).keywords).toContain("trample");
      const t = resolve(cast(setup(), "p1", "Craftwork Crusher"), withMode(2));
      expect(tokensNamed(t, "Cadet")).toHaveLength(1);
      expect(t.players.p1?.hand).toHaveLength(1);
      expect(graveOf(t, "p2")).toEqual([]);
    });

    it("Danitha, Spear of Agony: first strike; a counter when you cast a spell that targets an opponent or an opposing creature", () => {
      let s = scenario({
        p1: {
          hand: ["Shock", "Shock", "Shock"],
          battlefield: ["Danitha, Spear of Agony", "Serra Angel", ...lands("Mountain", 3)],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const d = idOf(s, "p1", "battlefield", "Danitha, Spear of Agony");
      expect(chars(s, d).keywords).toContain("firstStrike");
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Serra Angel")] } }));
      expect(counters(s, d)).toBe(0);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(counters(s, d)).toBe(1);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(counters(s, d)).toBe(2);
    });

    it("Danitha, Sword of Hope: draw (once per turn) when casting an Equipment or a spell that targets one of your creatures", () => {
      let s = scenario({ p1: { hand: ["Lich's Relic", "Shock"], battlefield: ["Danitha, Sword of Hope", "Swamp", "Mountain"] } });
      s = resolve(cast(s, "p1", "Lich's Relic"), answering(false));
      expect(s.players.p1?.hand).toHaveLength(2);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: [idOf(s, "p1", "battlefield", "Danitha, Sword of Hope")] } }));
      expect(s.players.p1?.hand).toHaveLength(1);
      let t = scenario({ p1: { hand: ["Shock"], battlefield: ["Danitha, Sword of Hope", "Mountain"] } });
      t = resolve(cast(t, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(t.players.p1?.hand).toHaveLength(0);
    });

    it("Desperate Futurescribe: at the beginning of your combat, another of your creatures +1/+1; a +1/+1 counter instead if you scried or surveilled", () => {
      const run = (scry: boolean) => {
        let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Desperate Futurescribe", "Bear Cub", "Island"] } });
        if (scry) s = resolve(cast(s, "p1", "Opt"));
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = play(
          s,
          () => undefined,
          (x) =>
            x.turn.step === "beginCombat" && x.stack.length === 0 && x.triggers.length === 0 && x.pending?.kind === "priority",
        );
        return [counters(s, bear), ...pt(s, bear)];
      };
      expect(run(false)).toEqual([0, 3, 3]);
      expect(run(true)).toEqual([1, 3, 3]);
    });

    it("Edgar, Ancient Bloodlord: +1 life when another of your creatures dies; {2}, sacrifice another: +1/+1 counter and menace", () => {
      let s = scenario({
        p1: { battlefield: ["Edgar, Ancient Bloodlord", "Bear Cub", "Savannah Lions", ...lands("Plains", 2)] },
        p2: { battlefield: ["Serra Angel"] },
      });
      const edgar = idOf(s, "p1", "battlefield", "Edgar, Ancient Bloodlord");
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(s);
      expect(life(s, "p1")).toBe(21);
      s = resolve(activate(s, "p1", edgar));
      expect(graveOf(s, "p1").sort()).toEqual(["Bear Cub", "Savannah Lions"]);
      expect(counters(s, edgar)).toBe(1);
      expect(chars(s, edgar).keywords).toContain("menace");
      expect(life(s, "p1")).toBe(22);
    });

    it("Edgar, Moonlit Sovereign: flash; two counters at your end step with no spell cast this turn; {4}{G}: a counter on each creature that has one", () => {
      const run = (castSpell: boolean) => {
        let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Edgar, Moonlit Sovereign", "Island"] } });
        if (castSpell) s = resolve(cast(s, "p1", "Opt"));
        s = toEndStep(s);
        return counters(s, idOf(s, "p1", "battlefield", "Edgar, Moonlit Sovereign"));
      };
      expect(run(false)).toBe(2);
      expect(run(true)).toBe(0);
      let s = scenario({
        p1: {
          battlefield: [
            "Edgar, Moonlit Sovereign",
            { name: "Bear Cub", counters: { "+1/+1": 1 } },
            "Savannah Lions",
            ...lands("Forest", 5),
          ],
        },
      });
      const edgar = idOf(s, "p1", "battlefield", "Edgar, Moonlit Sovereign");
      expect(chars(s, edgar).keywords).toContain("flash");
      s = resolve(activate(s, "p1", edgar));
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(2);
      expect(counters(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(0);
      expect(counters(s, edgar)).toBe(0);
    });

    it("Essence Burn: 5 damage to a black or green creature or planeswalker, exiled if it would die", () => {
      let s = scenario({
        p1: { hand: ["Essence Burn"], battlefield: lands("Mountain", 2) },
        p2: { battlefield: ["Bear Cub", "Serra Angel"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Essence Burn"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Bear Cub")]);
      s = resolve(cast(s, "p1", "Essence Burn", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(graveOf(s, "p2")).toEqual([]);
    });

    it("Eye of Jace: surveil 1 at your upkeep; then, with seven cards in the graveyard, sacrifice it, 2 damage to each opponent and +2 life", () => {
      const run = (grave: number) => {
        let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Eye of Jace"], graveyard: lands("Plains", grave) } });
        s = play(
          s,
          (req) => (req.intent === "surveilGraveyard" && req.type === "pick" ? req.options : undefined),
          (x) => x.turn.active === "p1" && x.turn.step === "main1",
        );
        return { eye: idsOf(s, "p1", "battlefield", "Eye of Jace").length, life: [life(s, "p1"), life(s, "p2")] };
      };
      expect(run(5)).toEqual({ eye: 1, life: [20, 20] });
      expect(run(6)).toEqual({ eye: 0, life: [22, 18] });
    });

    it("Fblthp, Impossibly Lost: combat damage to an opponent during your turn → draw two cards, Fblthp is shuffled into the library", () => {
      let s = scenario({ p1: { battlefield: ["Fblthp, Impossibly Lost", "Bear Cub"] } });
      s = attackThrough(s, [idOf(s, "p1", "battlefield", "Bear Cub")]);
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(idsOf(s, "p1", "battlefield", "Fblthp, Impossibly Lost")).toHaveLength(0);
      expect(namesIn(s, s.players.p1?.library)).toContain("Fblthp, Impossibly Lost");
      // Empty library after the draw: you win.
      let w = scenario({ p1: { battlefield: ["Fblthp, Impossibly Lost", "Bear Cub"], library: ["Forest"] } });
      w = attackThrough(w, [idOf(w, "p1", "battlefield", "Bear Cub")]);
      expect(w.winner).toBe("p1");
    });

    it("Something Worth Saving: mill four cards (a real mill), a milled permanent card may return to hand, +1 life", () => {
      // "If you would mill, mill one more card": only a real mill is modified.
      const MILL_MORE = customCard({
        name: "Test Mill More",
        types: ["Enchantment"],
        typeLine: "Enchantment",
        abilities: [eventReplacement({ event: "mill", to: "you", modify: { add: 1 }, label: "Meule +1" })],
      });
      let s = scenario({
        p1: {
          battlefield: [MILL_MORE, ...lands("Forest", 2)],
          hand: ["Something Worth Saving"],
          library: ["Opt", "Shock", "Lightning Strike", "Opt", "Bear Cub", "Island"],
        },
      });
      const cub = s.players.p1?.library[4] as string;
      s = settle(cast(s, "p1", "Something Worth Saving"), (req) =>
        req.type === "pick" && req.options.includes(cub) ? [cub] : undefined,
      );
      expect(namesIn(s, s.players.p1?.hand)).toEqual(["Bear Cub"]);
      expect(namesIn(s, s.players.p1?.library)).toEqual(["Island"]);
      expect(s.players.p1?.life).toBe(21);
    });

    it("Fblthp, Impossibly Lost: one trigger per combat damage step (not once per turn), a single one for several creatures", () => {
      let s = scenario({
        p1: {
          battlefield: ["Fblthp, Impossibly Lost", "Brightblade Stoat", "Bear Cub", "Llanowar Elves"],
          library: lands("Island", 8),
        },
      });
      const fblthp = idOf(s, "p1", "battlefield", "Fblthp, Impossibly Lost");
      const onStack = (x: S) => x.stack.filter((i) => i.sourceId === fblthp).length;
      const [stoat, cub, elves] = ["Brightblade Stoat", "Bear Cub", "Llanowar Elves"].map((n) => idOf(s, "p1", "battlefield", n));
      s = play(
        attack(s, [stoat as string, cub as string, elves as string]),
        () => undefined,
        (x) => onStack(x) > 0,
      );
      expect(s.turn.step).toBe("firstStrikeDamage");
      expect(onStack(s)).toBe(1);
      // The first strike step's ability is removed from the stack (countered): Fblthp stays on the battlefield.
      s.stack = s.stack.filter((i) => i.sourceId !== fblthp);
      s = play(
        s,
        () => undefined,
        (x) => onStack(x) > 0 || x.turn.step === "main2",
      );
      expect(s.turn.step).toBe("combatDamage");
      // Bear Cub and Llanowar Elves damage the opponent at the same time: a single trigger.
      expect(onStack(s)).toBe(1);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.step === "main2" && x.stack.length === 0 && x.pending?.kind === "priority",
      );
      expect(s.players.p1?.hand).toHaveLength(2);
      expect(namesIn(s, s.players.p1?.library)).toContain("Fblthp, Impossibly Lost");
    });
  });

  describe("peu communes (2)", () => {
    it("Flourishing Grapple: an opposing red or white creature loses its abilities; your creature deals damage to it equal to its power", () => {
      let s = scenario({
        p1: { hand: ["Flourishing Grapple"], battlefield: ["Bear Cub", "Forest"] },
        p2: { battlefield: ["Serra Angel", "Llanowar Elves"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Flourishing Grapple"));
      const legalB = opt?.type === "cast" ? opt.modes[0]?.targets.find((t) => t.legal.includes(angel))?.legal : [];
      expect(legalB).toEqual([angel]); // not the Llanowar Elves (green)
      s = resolve(cast(s, "p1", "Flourishing Grapple", { targets: { b: [angel], a: [bear] } }));
      expect(s.objects[angel]?.damage).toBe(2);
      expect(s.objects[bear]?.damage).toBe(0);
      expect(chars(s, angel).keywords).not.toContain("flying");
    });

    it("Fulminous Forte: 1 damage to each opposing creature and planeswalker, or 5 damage to a creature or planeswalker", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Fulminous Forte"], battlefield: ["Savannah Lions", ...lands("Mountain", 3)] },
          p2: { battlefield: ["Llanowar Elves", "Ajani Resolute", "Serra Angel"] },
        });
      const all = resolve(cast(setup(), "p1", "Fulminous Forte", { mode: 0 }));
      expect(graveOf(all, "p2")).toEqual(["Llanowar Elves"]);
      expect(all.objects[idOf(all, "p2", "battlefield", "Ajani Resolute")]?.counters.loyalty).toBe(1);
      expect(idsOf(all, "p1", "battlefield", "Savannah Lions")).toHaveLength(1);
      let s = setup();
      s = resolve(cast(s, "p1", "Fulminous Forte", { mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
    });

    it("Gallia, the Merrymaker: haste; your other creatures with a +1/+1 counter have haste; {1}{R}, {T}: counter on a creature that entered this turn", () => {
      let s = scenario({
        p1: {
          hand: ["Gallia, the Merrymaker", "Bear Cub"],
          battlefield: [...lands("Mountain", 4), ...lands("Forest", 2), "Savannah Lions"],
        },
      });
      s = resolve(cast(s, "p1", "Gallia, the Merrymaker"));
      s = resolve(cast(s, "p1", "Bear Cub"));
      const gallia = idOf(s, "p1", "battlefield", "Gallia, the Merrymaker");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(chars(s, gallia).keywords).toContain("haste");
      expect(chars(s, bear).keywords).not.toContain("haste");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === gallia);
      expect(opt?.type === "activate" && [...(opt.targets[0]?.legal ?? [])].sort()).toEqual([gallia, bear].sort());
      s = resolve(activate(s, "p1", gallia, undefined, { targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(chars(s, bear).keywords).toContain("haste");
    });

    it("Gallia, Tragic Host: menace; {4}{B}, exile another creature card from your graveyard: returns tapped with a +1/+1 counter", () => {
      const lone = scenario({ p1: { graveyard: ["Gallia, Tragic Host", "Shock"], battlefield: lands("Swamp", 5) } });
      expect(canUse(lone, "p1", idOf(lone, "p1", "graveyard", "Gallia, Tragic Host"))).toBe(false);
      let s = scenario({ p1: { graveyard: ["Gallia, Tragic Host", "Bear Cub"], battlefield: lands("Swamp", 5) } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "graveyard", "Gallia, Tragic Host")));
      const g = idOf(s, "p1", "battlefield", "Gallia, Tragic Host");
      expect(s.objects[g]?.tapped).toBe(true);
      expect(counters(s, g)).toBe(1);
      expect(chars(s, g).keywords).toContain("menace");
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
    });

    it("Geist of Saint Thalia: flying; your noncreature spells cost {1} less", () => {
      const s = scenario({ p1: { battlefield: ["Geist of Saint Thalia"], hand: ["Clash of Elements", "Bear Cub"] } });
      const d = (n: string) => s.defs[s.objects[idOf(s, "p1", "hand", n)]?.defId ?? ""]!;
      expect(spellCost(s, "p1", d("Clash of Elements"), {}).generic).toBe(0);
      expect(spellCost(s, "p1", d("Bear Cub"), {}).generic).toBe(1);
      expect(spellCost(s, "p2", d("Clash of Elements"), {}).generic).toBe(1);
      expect(chars(s, idOf(s, "p1", "battlefield", "Geist of Saint Thalia")).keywords).toContain("flying");
    });

    it("Generous Revival: a creature card with mana value 3 or less returns with a +1/+1 counter; flashback {4}{W}", () => {
      let s = scenario({
        p1: {
          hand: ["Generous Revival"],
          battlefield: lands("Plains", 8),
          graveyard: ["Bear Cub", "Serra Angel", "Savannah Lions"],
        },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Generous Revival"));
      expect(namesIn(s, opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : []).sort()).toEqual([
        "Bear Cub",
        "Savannah Lions",
      ]);
      s = resolve(cast(s, "p1", "Generous Revival", { targets: { t: [idOf(s, "p1", "graveyard", "Bear Cub")] } }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      const fb = idOf(s, "p1", "graveyard", "Generous Revival");
      s = resolve(act(s, "p1", { type: "cast", card: fb, targets: { t: [idOf(s, "p1", "graveyard", "Savannah Lions")] } }));
      expect(counters(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(1);
      expect(namesIn(s, s.exile)).toEqual(["Generous Revival"]);
    });

    it("Ghalta the Unstoppable: costs {X} less (X = the greatest power among your creatures); your other creatures have trample", () => {
      const s = scenario({ p1: { hand: ["Ghalta the Unstoppable"], battlefield: ["Serra Angel", "Bear Cub"] } });
      const d = s.defs[s.objects[idOf(s, "p1", "hand", "Ghalta the Unstoppable")]?.defId ?? ""]!;
      expect(spellCost(s, "p1", d, {}).generic).toBe(4);
      const t = scenario({
        p1: { battlefield: ["Ghalta the Unstoppable", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      expect(chars(t, idOf(t, "p1", "battlefield", "Ghalta the Unstoppable")).keywords).toContain("trample");
      expect(chars(t, idOf(t, "p1", "battlefield", "Bear Cub")).keywords).toContain("trample");
      expect(chars(t, idOf(t, "p2", "battlefield", "Savannah Lions")).keywords).not.toContain("trample");
    });

    it("Hapatra, the Desert Fang: on entering, X −1/−1 counters on an opposing creature (X = the greatest mana value in your graveyard)", () => {
      let s = scenario({
        p1: {
          hand: ["Hapatra, the Desert Fang"],
          battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)],
          graveyard: ["Serra Angel", "Shock"],
        },
        p2: { battlefield: ["Shivan Dragon"] },
      });
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      s = resolve(cast(s, "p1", "Hapatra, the Desert Fang"), answering(true, [dragon]));
      expect(graveOf(s, "p2")).toEqual(["Shivan Dragon"]);
    });

    it("Hapatra, the Desert Fang: in multiplayer, up to one targeted creature per opponent", () => {
      const setup = () =>
        scenario({
          players: 3,
          p1: {
            hand: ["Hapatra, the Desert Fang"],
            battlefield: [...lands("Swamp", 3), ...lands("Forest", 2)],
            graveyard: ["Serra Angel"],
          },
          p2: { battlefield: ["Shivan Dragon", "Bear Cub"] },
          p3: { battlefield: ["Serra Angel"] },
        });
      let s = setup();
      const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
      const angel = idOf(s, "p3", "battlefield", "Serra Angel");
      let max = 0;
      s = resolve(cast(s, "p1", "Hapatra, the Desert Fang"), (req) => {
        if (req.type === "pick" && req.intent === "triggerTarget") {
          max = req.max;
          return [dragon, angel];
        }
        return undefined;
      });
      expect(max).toBeGreaterThanOrEqual(2);
      // X = 5 (Serra Angel): each gets five −1/−1 counters.
      expect(graveOf(s, "p2")).toEqual(["Shivan Dragon"]);
      expect(graveOf(s, "p3")).toEqual(["Serra Angel"]);
      expect(idsOf(s, "p2", "battlefield", "Bear Cub")).toHaveLength(1);
      // Two creatures of the same opponent: refused.
      const t = setup();
      const cub = idOf(t, "p2", "battlefield", "Bear Cub");
      const dragon2 = idOf(t, "p2", "battlefield", "Shivan Dragon");
      expect(() =>
        resolve(cast(t, "p1", "Hapatra, the Desert Fang"), (req) =>
          req.type === "pick" && req.intent === "triggerTarget" ? [dragon2, cub] : undefined,
        ),
      ).toThrow(RulesError);
    });

    it("Garruk, Veiled Butcher −3: each opponent discards two cards; a card per opponent who didn't discard two nonland cards", () => {
      const minusThree = (s: S) => {
        const garruk = idOf(s, "p1", "battlefield", "Garruk, Veiled Butcher");
        const ability = chars(s, garruk).abilities.findIndex(
          (ab) => ab.kind === "activated" && !!ab.label?.includes("Each opponent"),
        );
        return resolve(act(s, "p1", { type: "activate", source: garruk, ability }));
      };
      const run = (p3Hand: string[]) => {
        const s = scenario({
          players: 3,
          p1: { battlefield: ["Garruk, Veiled Butcher"] },
          p2: { hand: ["Shock", "Opt", "Forest"] },
          p3: { hand: p3Hand },
        });
        // Each opponent discards the first two cards of their hand (suggested answer).
        return minusThree(s);
      };
      // p2 discards Shock and Opt (two nonlands); p3, a land and a Shock: one card.
      let s = run(["Forest", "Shock"]);
      expect(graveOf(s, "p2")).toEqual(["Shock", "Opt"]);
      expect(graveOf(s, "p3")).toHaveLength(2);
      expect(handOf(s, "p1")).toHaveLength(1);
      // p3 has only one card: they discard only one, a card as well.
      s = run(["Opt"]);
      expect(handOf(s, "p1")).toHaveLength(1);
      // Both discard two nonland cards: no card.
      s = run(["Opt", "Shock"]);
      expect(handOf(s, "p1")).toHaveLength(0);
      // Neither does: two cards.
      s = scenario({
        players: 3,
        p1: { battlefield: ["Garruk, Veiled Butcher"] },
        p2: { hand: ["Forest"] },
        p3: { hand: [] },
      });
      s = minusThree(s);
      expect(handOf(s, "p1")).toHaveLength(2);
    });

    it("Hapatra, the Desert Frost: on entering, taps an opposing creature and stuns it; {2}{U}: untap a creature", () => {
      let s = scenario({
        p1: { hand: ["Hapatra, the Desert Frost"], battlefield: lands("Island", 7) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Hapatra, the Desert Frost"), answering(true, [angel]));
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(1);
      s = resolve(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Hapatra, the Desert Frost"), undefined, { targets: { t: [angel] } }),
      );
      // Untapping a stunned creature removes the counter instead (701.29).
      expect(s.objects[angel]?.tapped).toBe(true);
      expect(counters(s, angel, "stun")).toBe(0);
    });

    it("Hexhaven Dueling Arena: {T}: {C}; {2}, {T}: a creature that attacked becomes prepared (as a sorcery); {4}, {T}: a creature becomes prepared", () => {
      let s = scenario({ p1: { battlefield: ["Hexhaven Dueling Arena", "Pompous Battlemage", ...lands("Mountain", 4)] } });
      const arena = idOf(s, "p1", "battlefield", "Hexhaven Dueling Arena");
      const mage = idOf(s, "p1", "battlefield", "Pompous Battlemage");
      expect(legalActions(s, "p1").some((a) => a.type === "tapForMana" && a.source === arena && a.colors.includes("C"))).toBe(
        true,
      );
      expect(canUse(s, "p1", arena, "A creature that attacked")).toBe(false);
      s = resolve(activate(s, "p1", arena, "A creature becomes", { targets: { t: [mage] } }));
      expect(prepared(s, mage)).toBe(true);
      let t = scenario({ p1: { battlefield: ["Hexhaven Dueling Arena", "Pompous Battlemage", ...lands("Mountain", 2)] } });
      const mage2 = idOf(t, "p1", "battlefield", "Pompous Battlemage");
      t = attackThrough(t, [mage2]);
      t = resolve(
        activate(t, "p1", idOf(t, "p1", "battlefield", "Hexhaven Dueling Arena"), "A creature that attacked", {
          targets: { t: [mage2] },
        }),
      );
      expect(prepared(t, mage2)).toBe(true);
    });

    it("Hunter's Axe: +2/+0; when attacking, the equipped creature gains your choice of trample or deathtouch", () => {
      let s = scenario({ p1: { battlefield: ["Hunter's Axe", "Bear Cub", ...lands("Forest", 2)] } });
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Hunter's Axe"), "Equip", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([4, 2]);
      const run = (trample: boolean) => {
        const t = settleNoBlocks(attack(s, [bear]), answering(trample));
        return chars(t, bear).keywords.filter((k) => k === "trample" || k === "deathtouch");
      };
      expect(run(true)).toEqual(["trample"]);
      expect(run(false)).toEqual(["deathtouch"]);
    });

    it("Jiang Yanggu, Alone: menace; one of your creatures attacks alone → discard, draw, then a counter per card discarded this turn", () => {
      let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Jiang Yanggu, Alone", "Bear Cub"] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Jiang Yanggu, Alone")).keywords).toContain("menace");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = settleNoBlocks(attack(s, [bear]));
      expect(graveOf(s, "p1")).toEqual(["Opt"]);
      expect(handOf(s, "p1")).toEqual(["Forest"]);
      expect(counters(s, bear)).toBe(1);
      let t = scenario({ p1: { hand: ["Opt"], battlefield: ["Jiang Yanggu, Alone", "Bear Cub", "Savannah Lions"] } });
      t = settleNoBlocks(attack(t, [idOf(t, "p1", "battlefield", "Bear Cub"), idOf(t, "p1", "battlefield", "Savannah Lions")]));
      expect(handOf(t, "p1")).toEqual(["Opt"]);
    });

    it("Jiang Yanggu, Never Alone: on entering, Mowu (3/3 legendary Dog); at your end step, untap your tokens", () => {
      let s = scenario({
        p1: { hand: ["Jiang Yanggu, Never Alone"], battlefield: [...lands("Forest", 4), { name: "Bear Cub", tapped: true }] },
      });
      s = resolve(cast(s, "p1", "Jiang Yanggu, Never Alone"));
      const mowu = tokensNamed(s, "Mowu")[0] as string;
      expect(chars(s, mowu).supertypes).toContain("Legendary");
      expect(chars(s, mowu).subtypes).toEqual(["Dog"]);
      expect(pt(s, mowu)).toEqual([3, 3]);
      s.objects[mowu]!.tapped = true;
      s = toEndStep(s);
      expect(s.objects[mowu]?.tapped).toBe(false);
      expect(s.objects[idOf(s, "p1", "battlefield", "Bear Cub")]?.tapped).toBe(true);
    });

    it("Kiora of Fire and Ashes: on entering, a 5/5 flying Dragon; {8}: another", () => {
      let s = scenario({ p1: { hand: ["Kiora of Fire and Ashes"], battlefield: lands("Mountain", 14) } });
      s = resolve(cast(s, "p1", "Kiora of Fire and Ashes"));
      expect(tokensNamed(s, "Dragon")).toHaveLength(1);
      const dragon = tokensNamed(s, "Dragon")[0] as string;
      expect(pt(s, dragon)).toEqual([5, 5]);
      expect(chars(s, dragon).keywords).toContain("flying");
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Kiora of Fire and Ashes")));
      expect(tokensNamed(s, "Dragon")).toHaveLength(2);
    });

    it("Kiora of Salt and Sand: when attacking after a loyalty ability, untaps an attacker, unblockable; your planeswalkers have [−8] 8/8 Leviathan", () => {
      const run = (loyaltyFirst: boolean) => {
        let s = scenario({ p1: { battlefield: ["Kiora of Salt and Sand", "Bear Cub", "Ajani Resolute"] } });
        if (loyaltyFirst) s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Ajani Resolute"), "0"));
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = settleNoBlocks(attack(s, [bear]), answering(true, [bear]));
        return [s.objects[bear]?.tapped, chars(s, bear).keywords.includes("unblockable")];
      };
      expect(run(true)).toEqual([false, true]);
      expect(run(false)).toEqual([true, false]);
      let w = scenario({ p1: { battlefield: ["Kiora of Salt and Sand", { name: "Ajani Resolute", counters: { loyalty: 8 } }] } });
      w = resolve(activate(w, "p1", idOf(w, "p1", "battlefield", "Ajani Resolute"), "−8"));
      const lev = tokensNamed(w, "Leviathan")[0] as string;
      expect(pt(w, lev)).toEqual([8, 8]);
      expect(chars(w, lev).keywords).toContain("hexproof");
    });
  });

  describe("peu communes (3)", () => {
    const playLand = (s: S, p: string, name: string) => act(s, p, { type: "playLand", card: idOf(s, p, "hand", name) });

    it("Konstrari Charm: 6 damage to a flying creature; or two +1/+1 counters and trample; or {C}{C}{C}", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Konstrari Charm"], battlefield: ["Mountain", "Forest", "Bear Cub"] },
          p2: { battlefield: ["Serra Angel", "Savannah Lions"] },
        });
      let s = setup();
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Konstrari Charm"));
      expect(opt?.type === "cast" && opt.modes.find((m) => m.index === 0)?.targets[0]?.legal).toEqual([
        idOf(s, "p2", "battlefield", "Serra Angel"),
      ]);
      s = resolve(cast(s, "p1", "Konstrari Charm", { mode: 0, targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      let t = setup();
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(cast(t, "p1", "Konstrari Charm", { mode: 1, targets: { t: [bear] } }));
      expect(counters(t, bear)).toBe(2);
      expect(chars(t, bear).keywords).toContain("trample");
      const u = resolve(cast(setup(), "p1", "Konstrari Charm", { mode: 2 }));
      expect(u.players.p1?.manaPool.C).toBe(3);
    });

    it("Koth of the Homestead: +1 life for each land entering under your control; a Plains also puts a counter on a creature", () => {
      const run = (land: string) => {
        let s = scenario({ p1: { hand: [land], battlefield: ["Koth of the Homestead", "Bear Cub"] } });
        const bear = idOf(s, "p1", "battlefield", "Bear Cub");
        s = resolve(playLand(s, "p1", land), answering(true, [bear]));
        return [life(s, "p1"), counters(s, bear)];
      };
      expect(run("Plains")).toEqual([21, 1]);
      expect(run("Forest")).toEqual([21, 0]);
    });

    it("Koth, the Geomancer: reach; for each land entering, 1 damage to each opponent; a Mountain adds {R}", () => {
      const run = (land: string) => {
        let s = scenario({ p1: { hand: [land], battlefield: ["Koth, the Geomancer"] } });
        expect(chars(s, idOf(s, "p1", "battlefield", "Koth, the Geomancer")).keywords).toContain("reach");
        s = resolve(playLand(s, "p1", land));
        return [life(s, "p2"), s.players.p1?.manaPool.R];
      };
      expect(run("Mountain")).toEqual([19, 1]);
      expect(run("Forest")).toEqual([19, 0]);
    });

    it("Loot, the Nexus: {T}: one mana of the chosen color per different power among your creatures", () => {
      let s = scenario({ p1: { battlefield: ["Loot, the Nexus", "Bear Cub", "Serra Angel", "Savannah Lions"] } });
      const loot = idOf(s, "p1", "battlefield", "Loot, the Nexus");
      s = act(s, "p1", { type: "tapForMana", source: loot, ability: 0, color: "U" });
      // Powers: 2 (Loot, Bear Cub, Savannah Lions) and 4 (Serra Angel).
      expect(s.players.p1?.manaPool.U).toBe(2);
    });

    it("Mabel, Valley Hero: when it or another of your creatures enters, a counter on a creature that entered this turn", () => {
      let s = scenario({
        p1: {
          hand: ["Mabel, Valley Hero", "Bear Cub"],
          battlefield: ["Mountain", "Plains", "Forest", "Forest", "Forest", "Savannah Lions"],
        },
      });
      s = resolve(cast(s, "p1", "Mabel, Valley Hero"));
      const mabel = idOf(s, "p1", "battlefield", "Mabel, Valley Hero");
      expect(counters(s, mabel)).toBe(1);
      let offered: string[] = [];
      s = resolve(cast(s, "p1", "Bear Cub"), (req, _p, x) => {
        if (req.type !== "pick" || !req.options.includes(mabel)) return undefined;
        offered = req.options;
        return [idOf(x, "p1", "battlefield", "Bear Cub")];
      });
      expect(offered).not.toContain(idOf(s, "p1", "battlefield", "Savannah Lions"));
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
    });

    it("Marwyn, the Clearcutter: {2}, {T}, sacrifice an artifact or a land: draw a card", () => {
      const none = scenario({ p1: { battlefield: ["Marwyn, the Clearcutter", "Bear Cub"] } });
      expect(canUse(none, "p1", idOf(none, "p1", "battlefield", "Marwyn, the Clearcutter"))).toBe(false);
      let s = scenario({ p1: { battlefield: ["Marwyn, the Clearcutter", ...lands("Mountain", 3)] } });
      s = resolve(activate(s, "p1", idOf(s, "p1", "battlefield", "Marwyn, the Clearcutter")));
      expect(graveOf(s, "p1")).toEqual(["Mountain"]);
      expect(s.players.p1?.hand).toHaveLength(1);
    });

    it("Marwyn, the Preserver: your lands have hexproof; {2}: a land card from your graveyard to hand", () => {
      let s = scenario({
        p1: { battlefield: ["Marwyn, the Preserver", ...lands("Forest", 2)], graveyard: ["Plains", "Bear Cub"] },
        p2: { battlefield: ["Forest"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Forest")).keywords).toContain("hexproof");
      expect(chars(s, idOf(s, "p2", "battlefield", "Forest")).keywords).not.toContain("hexproof");
      s = resolve(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Marwyn, the Preserver"), undefined, {
          targets: { t: [idOf(s, "p1", "graveyard", "Plains")] },
        }),
      );
      expect(handOf(s, "p1")).toEqual(["Plains"]);
    });

    it("Massacre Girl, Most Wanted: another of your creatures dies → 1 damage to an opponent and +1 life; a counter when an opponent is dealt noncombat damage", () => {
      let s = scenario({
        p1: { battlefield: ["Massacre Girl, Most Wanted", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const girl = idOf(s, "p1", "battlefield", "Massacre Girl, Most Wanted");
      destroy(s, idOf(s, "p2", "battlefield", "Savannah Lions"));
      s = resolve(s);
      expect([life(s, "p1"), life(s, "p2")]).toEqual([20, 20]);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(s, answering(true, ["p2"]));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([21, 19]);
      // The damage from its own ability is noncombat: one counter.
      expect(counters(s, girl)).toBe(1);
    });

    it("Massacre Girl, Most Wanted: an opponent is dealt noncombat damage from any source, one counter per event", () => {
      let s = scenario({ players: 3, p1: { battlefield: ["Massacre Girl, Most Wanted"] }, p2: { battlefield: ["Bear Cub"] } });
      const girl = idOf(s, "p1", "battlefield", "Massacre Girl, Most Wanted");
      const cub = sourceFromObject(s, idOf(s, "p2", "battlefield", "Bear Cub"));
      // An opposing source, two opponents damaged: two counters.
      simultaneously(s, () => {
        dealDamage(s, cub, "p2", 1, false);
        dealDamage(s, cub, "p3", 1, false);
      });
      s = resolve(s);
      expect(counters(s, girl)).toBe(2);
      // Combat damage to an opponent, or noncombat damage to you: nothing.
      dealDamage(s, cub, "p2", 1, true);
      dealDamage(s, cub, "p1", 1, false);
      expect(s.triggers).toHaveLength(0);
    });

    it("Mind Meanderer: flying; vigilance as long as you control a Jace planeswalker; on entering, fights an opposing creature", () => {
      let s = scenario({
        p1: { hand: ["Mind Meanderer"], battlefield: [...lands("Island", 4), ...lands("Forest", 2)] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
      s = resolve(cast(s, "p1", "Mind Meanderer"), answering(true, [lions]));
      const mm = idOf(s, "p1", "battlefield", "Mind Meanderer");
      expect(graveOf(s, "p2")).toEqual(["Savannah Lions"]);
      expect(s.objects[mm]?.damage).toBe(2);
      expect(chars(s, mm).keywords).toContain("flying");
      expect(chars(s, mm).keywords).not.toContain("vigilance");
      const t = scenario({ p1: { battlefield: ["Mind Meanderer", "The Theorist, Jace Beleren"] } });
      expect(chars(t, idOf(t, "p1", "battlefield", "Mind Meanderer")).keywords).toContain("vigilance");
    });

    it("Multiply by Zero: the targeted creature has base P/T 0/0 until end of turn (counters count)", () => {
      let s = scenario({
        p1: { hand: ["Multiply by Zero", "Multiply by Zero"], battlefield: lands("Swamp", 4) },
        p2: { battlefield: ["Serra Angel", { name: "Bear Cub", counters: { "+1/+1": 1 } }] },
      });
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Multiply by Zero", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      s = resolve(cast(s, "p1", "Multiply by Zero", { targets: { t: [bear] } }));
      expect(pt(s, bear)).toEqual([1, 1]);
    });

    it("Paradox Shaper: prepared at your upkeep if it isn't; {2}: a card from your graveyard to the bottom of your library", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: { battlefield: ["Paradox Shaper", "Island", "Swamp", "Swamp"], graveyard: ["Shock"] },
      });
      const shaper = idOf(s, "p1", "battlefield", "Paradox Shaper");
      expect(prepared(s, shaper)).toBe(false);
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(prepared(s, shaper)).toBe(true);
      s = resolve(activate(s, "p1", shaper, undefined, { targets: { t: [idOf(s, "p1", "graveyard", "Shock")] } }));
      const lib = namesIn(s, s.players.p1?.library);
      expect(lib[lib.length - 1]).toBe("Shock");
      // Omit Variables : meule 3.
      s = resolve(castCopy(s, shaper));
      expect(s.players.p1?.graveyard).toHaveLength(3);
      expect(prepared(s, shaper)).toBe(false);
    });

    it("Perfected Theory: base P/T 1/1, or 4/5, until end of turn", () => {
      const run = (mode: number) => {
        let s = scenario({ p1: { hand: ["Perfected Theory"], battlefield: ["Island", "Serra Angel"] } });
        const angel = idOf(s, "p1", "battlefield", "Serra Angel");
        s = resolve(cast(s, "p1", "Perfected Theory", { mode, targets: { t: [angel] } }));
        return pt(s, angel);
      };
      expect(run(0)).toEqual([1, 1]);
      expect(run(1)).toEqual([4, 5]);
    });

    it("Pia, Aether Ascetic: on entering, you may discard a card; if you do, search for an enchantment card", () => {
      const run = (discard: boolean) => {
        const s = scenario({
          p1: {
            hand: ["Pia, Aether Ascetic", "Opt"],
            battlefield: lands("Forest", 3),
            library: ["Forest", "Gardenize", "Forest"],
          },
        });
        return resolve(cast(s, "p1", "Pia, Aether Ascetic"), (req) =>
          req.intent === "discard" && req.type === "pick" ? (discard ? req.options.slice(0, 1) : []) : undefined,
        );
      };
      const yes = run(true);
      expect(handOf(yes, "p1")).toEqual(["Gardenize"]);
      expect(graveOf(yes, "p1")).toEqual(["Opt"]);
      const no = run(false);
      expect(handOf(no, "p1")).toEqual(["Opt"]);
    });

    it("Pia, Determined Rebuilder: on entering, a 1/1 flying Thopter; {5}{R}: +X/+0 (X = your artifacts)", () => {
      let s = scenario({
        p1: { hand: ["Pia, Determined Rebuilder"], battlefield: [...lands("Mountain", 9), "Eye of Jace", "Bear Cub"] },
      });
      s = resolve(cast(s, "p1", "Pia, Determined Rebuilder"));
      const thopter = tokensNamed(s, "Thopter")[0] as string;
      expect(pt(s, thopter)).toEqual([1, 1]);
      expect(chars(s, thopter).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      expect(chars(s, thopter).keywords).toContain("flying");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      s = resolve(
        activate(s, "p1", idOf(s, "p1", "battlefield", "Pia, Determined Rebuilder"), undefined, { targets: { t: [bear] } }),
      );
      expect(pt(s, bear)).toEqual([4, 2]);
    });

    it("Plan for All Outcomes: on entering, the owner of another nonland permanent puts it on top or bottom; first noncreature spell of the turn → empower Jace 1", () => {
      let s = scenario({
        p1: { hand: ["Plan for All Outcomes"], battlefield: lands("Island", 4) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(cast(s, "p1", "Plan for All Outcomes"), (req, player) => {
        if (req.intent === "topOrBottom") {
          expect(player).toBe("p2");
          return ["bottom"];
        }
        return answering(true, [angel])(req, player, s);
      });
      const lib = namesIn(s, s.players.p2?.library);
      expect(lib[lib.length - 1]).toBe("Serra Angel");
      // Plan for All Outcomes was the first noncreature spell of the turn: no Jace.
      expect(jaceTokens(s)).toHaveLength(0);
      let t = scenario({
        p1: {
          hand: ["Opt", "Opt", "Bear Cub"],
          battlefield: ["Plan for All Outcomes", ...lands("Island", 3), ...lands("Forest", 2)],
        },
      });
      t = resolve(cast(t, "p1", "Bear Cub"));
      expect(jaceTokens(t)).toHaveLength(0);
      t = resolve(cast(t, "p1", "Opt"));
      expect(jaceLoyalty(t)).toBe(1);
      t = resolve(cast(t, "p1", "Opt"));
      expect(jaceLoyalty(t)).toBe(1);
    });
  });

  describe("peu communes (4)", () => {
    it("Precise Redaction: counters a white or black spell (not a green spell)", () => {
      const run = (spellName: string, land: string) => {
        let s = scenario({
          active: "p2",
          p1: { hand: ["Precise Redaction"], battlefield: lands("Island", 2) },
          p2: { hand: [spellName], battlefield: lands(land, 2) },
        });
        s = cast(s, "p2", spellName);
        s = act(s, "p2", { type: "pass" });
        const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Precise Redaction"));
        return { s, legal: opt?.type === "cast" ? (opt.modes[0]?.targets[0]?.legal ?? []) : [] };
      };
      const white = run("Savannah Lions", "Plains");
      expect(white.legal).toHaveLength(1);
      const s = resolve(cast(white.s, "p1", "Precise Redaction", { targets: { t: white.legal } }));
      expect(graveOf(s, "p2")).toEqual(["Savannah Lions"]);
      expect(run("Bear Cub", "Forest").legal).toHaveLength(0);
    });

    it("Primal Witchstalker: menace; on entering, mill 4, then a land card from your graveyard returns tapped", () => {
      let s = scenario({
        p1: {
          hand: ["Primal Witchstalker"],
          battlefield: ["Swamp", "Forest", "Forest"],
          library: ["Shock", "Plains", "Opt", "Opt", "Forest"],
        },
      });
      s = resolve(cast(s, "p1", "Primal Witchstalker"));
      const plains = idOf(s, "p1", "battlefield", "Plains");
      expect(s.objects[plains]?.tapped).toBe(true);
      expect(graveOf(s, "p1").sort()).toEqual(["Opt", "Opt", "Shock"]);
      expect(chars(s, idOf(s, "p1", "battlefield", "Primal Witchstalker")).keywords).toContain("menace");
    });

    it("Proft, Consulting Detective: when you scry or surveil, you may pay {2}: +1/+1 counter and draw", () => {
      const run = (pay: boolean) => {
        let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Proft, Consulting Detective", ...lands("Island", 3)] } });
        s = resolve(cast(s, "p1", "Opt"), answering(pay));
        return [counters(s, idOf(s, "p1", "battlefield", "Proft, Consulting Detective")), s.players.p1?.hand.length];
      };
      expect(run(true)).toEqual([1, 2]);
      expect(run(false)).toEqual([0, 1]);
    });

    it("Prophesied End: destroys a creature; if it wasn't attacking, its controller draws", () => {
      let s = scenario({
        p1: { hand: ["Prophesied End"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", "Prophesied End", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }));
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(s.players.p2?.hand).toHaveLength(1);
      let t = scenario({
        active: "p2",
        p1: { hand: ["Prophesied End"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Serra Angel"] },
      });
      const angel = idOf(t, "p2", "battlefield", "Serra Angel");
      t = advanceUntil(t, (x) => x.pending?.kind === "declareAttackers");
      t = act(t, "p2", { type: "declareAttackers", attackers: [{ id: angel, defender: "p1" }] });
      t = act(t, "p2", { type: "pass" });
      t = resolve(cast(t, "p1", "Prophesied End", { targets: { t: [angel] } }));
      expect(graveOf(t, "p2")).toEqual(["Serra Angel"]);
      expect(t.players.p2?.hand).toHaveLength(0);
    });

    it("Prudent Fateseer: enters prepared; your creatures +1/+0 on the first scry or surveil of the turn; Peer Review: a Cadet, surveil 1", () => {
      let s = scenario({ p1: { hand: ["Prudent Fateseer", "Opt", "Opt"], battlefield: lands("Island", 8) } });
      s = resolve(cast(s, "p1", "Prudent Fateseer"));
      const f = idOf(s, "p1", "battlefield", "Prudent Fateseer");
      expect(prepared(s, f)).toBe(true);
      s = resolve(cast(s, "p1", "Opt"));
      s = resolve(cast(s, "p1", "Opt"));
      expect(pt(s, f)).toEqual([2, 4]);
      let surveilled = false;
      s = resolve(castCopy(s, f), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(tokensNamed(s, "Cadet")).toHaveLength(1);
      expect(surveilled).toBe(true);
    });

    it("Recursive Recruitment: two Cadets; cast from a graveyard (flashback), a counter per three cards in the graveyard", () => {
      let s = scenario({
        p1: {
          hand: ["Recursive Recruitment"],
          battlefield: [...lands("Island", 6), ...lands("Swamp", 6)],
          graveyard: lands("Plains", 6),
        },
      });
      s = resolve(cast(s, "p1", "Recursive Recruitment"));
      expect(tokensNamed(s, "Cadet").map((id) => counters(s, id))).toEqual([0, 0]);
      // Flashback: during resolution, the spell is on the stack; six cards in the graveyard → two counters.
      s = resolve(act(s, "p1", { type: "cast", card: idOf(s, "p1", "graveyard", "Recursive Recruitment") }));
      const fresh = tokensNamed(s, "Cadet").slice(2);
      expect(fresh.map((id) => counters(s, id))).toEqual([2, 2]);
      expect(namesIn(s, s.exile)).toEqual(["Recursive Recruitment"]);
    });

    it("Refute Destiny: exiles a green or blue creature or planeswalker, then surveil 1", () => {
      let s = scenario({
        p1: { hand: ["Refute Destiny"], battlefield: lands("Plains", 2) },
        p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Refute Destiny"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Bear Cub")]);
      let surveilled = false;
      s = resolve(cast(s, "p1", "Refute Destiny", { targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(namesIn(s, s.exile)).toEqual(["Bear Cub"]);
      expect(surveilled).toBe(true);
    });

    it("Rescue Girl, First Responder: flying; {T}: another of your permanents returns to hand, only during your turn", () => {
      let s = scenario({
        p1: { battlefield: ["Rescue Girl, First Responder", "Bear Cub"] },
        p2: { battlefield: ["Savannah Lions"] },
      });
      const girl = idOf(s, "p1", "battlefield", "Rescue Girl, First Responder");
      expect(chars(s, girl).keywords).toContain("flying");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === girl);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([idOf(s, "p1", "battlefield", "Bear Cub")]);
      s = resolve(activate(s, "p1", girl, undefined, { targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } }));
      expect(handOf(s, "p1")).toEqual(["Bear Cub"]);
      let t = scenario({ active: "p2", p1: { battlefield: ["Rescue Girl, First Responder", "Bear Cub"] } });
      t = act(t, "p2", { type: "pass" });
      expect(canUse(t, "p1", idOf(t, "p1", "battlefield", "Rescue Girl, First Responder"))).toBe(false);
    });

    it("Restore with Empathy: a permanent card from your graveyard to hand, and +4 life", () => {
      let s = scenario({
        p1: { hand: ["Restore with Empathy"], battlefield: lands("Forest", 3), graveyard: ["Serra Angel", "Shock"] },
      });
      const opt = legalActions(s, "p1").find(
        (a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Restore with Empathy"),
      );
      expect(namesIn(s, opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [])).toEqual(["Serra Angel"]);
      s = resolve(cast(s, "p1", "Restore with Empathy", { targets: { t: [idOf(s, "p1", "graveyard", "Serra Angel")] } }));
      expect(handOf(s, "p1")).toEqual(["Serra Angel"]);
      expect(life(s, "p1")).toBe(24);
    });

    it("Rewrite Regrets: a creature or planeswalker card with mana value 6 or less returns to the battlefield; empower Jace 2", () => {
      let s = scenario({
        p1: {
          hand: ["Rewrite Regrets"],
          battlefield: lands("Swamp", 4),
          graveyard: ["Ajani Resolute", "Ghalta the Unstoppable", "Shock"],
        },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Rewrite Regrets"));
      expect(namesIn(s, opt?.type === "cast" ? opt.modes[0]?.targets[0]?.legal : [])).toEqual(["Ajani Resolute"]);
      s = resolve(cast(s, "p1", "Rewrite Regrets", { targets: { t: [idOf(s, "p1", "graveyard", "Ajani Resolute")] } }));
      expect(idsOf(s, "p1", "battlefield", "Ajani Resolute")).toHaveLength(1);
      expect(jaceLoyalty(s)).toBe(2);
    });

    it("Ruric Thar, Biomagus: flying, two prowess; draw when it becomes the target of an opponent's spell", () => {
      let s = scenario({ p1: { hand: ["Opt"], battlefield: ["Ruric Thar, Biomagus", "Island"] } });
      const ruric = idOf(s, "p1", "battlefield", "Ruric Thar, Biomagus");
      s = resolve(cast(s, "p1", "Opt"));
      expect(pt(s, ruric)).toEqual([6, 8]);
      let t = scenario({
        active: "p2",
        p1: { battlefield: ["Ruric Thar, Biomagus"] },
        p2: { hand: ["Shock", "Shock"], battlefield: lands("Mountain", 2) },
      });
      t = resolve(cast(t, "p2", "Shock", { targets: { t: [idOf(t, "p1", "battlefield", "Ruric Thar, Biomagus")] } }));
      expect(t.players.p1?.hand).toHaveLength(1);
      t = resolve(cast(t, "p2", "Shock", { targets: { t: ["p1"] } }));
      expect(t.players.p1?.hand).toHaveLength(1);
    });

    it("Ruric Thar, Magecrusher: can't be countered; reach, vigilance, trample; hexproof as long as it hasn't dealt combat damage", () => {
      let s = scenario({ p1: { battlefield: ["Ruric Thar, Magecrusher"] } });
      const ruric = idOf(s, "p1", "battlefield", "Ruric Thar, Magecrusher");
      expect(s.defs[s.objects[ruric]?.defId ?? ""]?.rules?.cantBeCountered).toBe(true);
      expect(chars(s, ruric).keywords).toEqual(expect.arrayContaining(["reach", "vigilance", "trample", "hexproof"]));
      s = attackThrough(s, [ruric]);
      expect(life(s, "p2")).toBe(13);
      expect(chars(s, ruric).keywords).not.toContain("hexproof");
    });

    it("Saheeli, Consul of Oversight: flying; a Thopter on the first scry or surveil of the turn", () => {
      let s = scenario({ p1: { hand: ["Opt", "Opt"], battlefield: ["Saheeli, Consul of Oversight", ...lands("Island", 2)] } });
      expect(chars(s, idOf(s, "p1", "battlefield", "Saheeli, Consul of Oversight")).keywords).toContain("flying");
      s = resolve(cast(s, "p1", "Opt"));
      s = resolve(cast(s, "p1", "Opt"));
      expect(tokensNamed(s, "Thopter")).toHaveLength(1);
    });

    it("Saheeli, Jewel of Avishkar: your Thopters have haste; a Thopter for each noncreature spell cast", () => {
      let s = scenario({
        p1: { hand: ["Shock", "Bear Cub"], battlefield: ["Saheeli, Jewel of Avishkar", "Mountain", ...lands("Forest", 2)] },
      });
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      const thopters = tokensNamed(s, "Thopter");
      expect(thopters).toHaveLength(1);
      expect(chars(s, thopters[0] as string).keywords).toEqual(expect.arrayContaining(["haste", "flying"]));
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(tokensNamed(s, "Thopter")).toHaveLength(1);
    });

    it("Stingerquill Charm: 3 damage to any target; or first strike and deathtouch; or a Cadet with haste", () => {
      const setup = () => scenario({ p1: { hand: ["Stingerquill Charm"], battlefield: ["Swamp", "Mountain", "Bear Cub"] } });
      const a = resolve(cast(setup(), "p1", "Stingerquill Charm", { mode: 0, targets: { t: ["p2"] } }));
      expect(life(a, "p2")).toBe(17);
      let b = setup();
      const bear = idOf(b, "p1", "battlefield", "Bear Cub");
      b = resolve(cast(b, "p1", "Stingerquill Charm", { mode: 1, targets: { t: [bear] } }));
      expect(chars(b, bear).keywords).toEqual(expect.arrayContaining(["firstStrike", "deathtouch"]));
      const c = resolve(cast(setup(), "p1", "Stingerquill Charm", { mode: 2 }));
      const cadet = tokensNamed(c, "Cadet")[0] as string;
      expect(chars(c, cadet).keywords).toContain("haste");
    });
  });

  describe("peu communes (5)", () => {
    it("Terminal Criticism: destroys a blue or red creature or planeswalker; +1 life", () => {
      let s = scenario({
        p1: { hand: ["Terminal Criticism"], battlefield: lands("Swamp", 2) },
        p2: { battlefield: ["Shivan Dragon", "Bear Cub"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Terminal Criticism"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Shivan Dragon")]);
      s = resolve(cast(s, "p1", "Terminal Criticism", { targets: { t: [idOf(s, "p2", "battlefield", "Shivan Dragon")] } }));
      expect(graveOf(s, "p2")).toEqual(["Shivan Dragon"]);
      expect(life(s, "p1")).toBe(21);
    });

    it("Tetsuko Umezawa, Fugitive: your creatures with power or toughness 1 or less can't be blocked", () => {
      const s = scenario({
        p1: { battlefield: ["Tetsuko Umezawa, Fugitive", "Savannah Lions", "Bear Cub"] },
        p2: { battlefield: ["Llanowar Elves"] },
      });
      expect(chars(s, idOf(s, "p1", "battlefield", "Tetsuko Umezawa, Fugitive")).keywords).toContain("unblockable");
      expect(chars(s, idOf(s, "p1", "battlefield", "Savannah Lions")).keywords).toContain("unblockable");
      expect(chars(s, idOf(s, "p1", "battlefield", "Bear Cub")).keywords).not.toContain("unblockable");
      expect(chars(s, idOf(s, "p2", "battlefield", "Llanowar Elves")).keywords).not.toContain("unblockable");
    });

    it("Tetsuko Umezawa, Pursuer: double strike, prowess; 1 damage to the controller of a blocking opposing creature with power or toughness 1 or less", () => {
      const run = (blocker: string) => {
        let s = scenario({ p1: { battlefield: ["Tetsuko Umezawa, Pursuer"] }, p2: { battlefield: [blocker] } });
        const t = idOf(s, "p1", "battlefield", "Tetsuko Umezawa, Pursuer");
        expect(chars(s, t).keywords).toEqual(expect.arrayContaining(["doubleStrike", "prowess"]));
        s = attack(s, [t]);
        s = advanceUntil(s, (x) => x.pending?.kind === "declareBlockers");
        s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker: idOf(s, "p2", "battlefield", blocker), attacker: t }] });
        s = resolve(s);
        return life(s, "p2");
      };
      expect(run("Savannah Lions")).toBe(19);
      expect(run("Bear Cub")).toBe(20);
    });

    it("Teyo, Diamondblade Mage: flash; on entering, one of your permanents gains deathtouch, with a +1/+1 counter (creature) or loyalty counter (planeswalker)", () => {
      const run = (who: string) => {
        let s = scenario({
          p1: { hand: ["Teyo, Diamondblade Mage"], battlefield: [...lands("Swamp", 4), "Bear Cub", "Ajani Resolute"] },
        });
        const t = idOf(s, "p1", "battlefield", who);
        s = resolve(cast(s, "p1", "Teyo, Diamondblade Mage"), answering(true, [t]));
        return { s, t };
      };
      const c = run("Bear Cub");
      expect(chars(c.s, c.t).keywords).toContain("deathtouch");
      expect(counters(c.s, c.t)).toBe(1);
      const w = run("Ajani Resolute");
      expect(w.s.objects[w.t]?.counters.loyalty).toBe(3);
      expect(counters(w.s, w.t)).toBe(0);
      expect(chars(w.s, idOf(w.s, "p1", "battlefield", "Teyo, Diamondblade Mage")).keywords).toContain("flash");
    });

    it("Teyo, Lightshield Expert: flash; on entering, one of your permanents gains hexproof, with a counter according to its type", () => {
      const run = (who: string) => {
        let s = scenario({
          p1: { hand: ["Teyo, Lightshield Expert"], battlefield: [...lands("Plains", 2), "Bear Cub", "Ajani Resolute"] },
        });
        const t = idOf(s, "p1", "battlefield", who);
        s = resolve(cast(s, "p1", "Teyo, Lightshield Expert"), answering(true, [t]));
        return { s, t };
      };
      const c = run("Bear Cub");
      expect(chars(c.s, c.t).keywords).toContain("hexproof");
      expect(counters(c.s, c.t)).toBe(1);
      const w = run("Ajani Resolute");
      expect(w.s.objects[w.t]?.counters.loyalty).toBe(3);
    });

    it("Theorix Charm: counters a noncreature spell unless its controller pays {2}; or −2/−2; or mill 3 then draw", () => {
      const counterRun = (oppLands: number, pay: boolean) => {
        let s = scenario({
          active: "p2",
          p1: { hand: ["Theorix Charm"], battlefield: ["Island", "Swamp"] },
          p2: { hand: ["Shock"], battlefield: lands("Mountain", oppLands) },
        });
        s = cast(s, "p2", "Shock", { targets: { t: ["p1"] } });
        s = act(s, "p2", { type: "pass" });
        const shock = s.stack[0]?.id as string;
        s = resolve(cast(s, "p1", "Theorix Charm", { mode: 0, targets: { t: [shock] } }), answering(pay));
        return life(s, "p1");
      };
      expect(counterRun(1, true)).toBe(20); // can't pay
      expect(counterRun(3, true)).toBe(18);
      expect(counterRun(3, false)).toBe(20);
      let s = scenario({ p1: { hand: ["Theorix Charm"], battlefield: ["Island", "Swamp"] }, p2: { battlefield: ["Bear Cub"] } });
      s = resolve(cast(s, "p1", "Theorix Charm", { mode: 1, targets: { t: [idOf(s, "p2", "battlefield", "Bear Cub")] } }));
      expect(graveOf(s, "p2")).toEqual(["Bear Cub"]);
      let t = scenario({
        p1: { hand: ["Theorix Charm"], battlefield: ["Island", "Swamp"], library: ["Shock", "Shock", "Shock", "Opt"] },
      });
      t = resolve(cast(t, "p1", "Theorix Charm", { mode: 2 }));
      expect(handOf(t, "p1")).toEqual(["Opt"]);
      expect(graveOf(t, "p1").sort()).toEqual(["Shock", "Shock", "Shock", "Theorix Charm"]);
    });

    it("Tinybones, Pocket Nuisance: on entering, each opponent discards; 1 damage to each opponent when a player discards (once per discard)", () => {
      let s = scenario({
        p1: {
          hand: ["Tinybones, Pocket Nuisance", "Seasoned Cryomancer"],
          battlefield: [...lands("Swamp", 3), ...lands("Island", 3)],
        },
        p2: { hand: ["Opt"] },
      });
      s = resolve(cast(s, "p1", "Tinybones, Pocket Nuisance"));
      expect(graveOf(s, "p2")).toEqual(["Opt"]);
      expect(life(s, "p2")).toBe(19);
      // Seasoned Cryomancer: two cards discarded at once, a single damage.
      s = resolve(cast(s, "p1", "Seasoned Cryomancer"), (req) =>
        req.intent === "discard" && req.type === "pick" ? req.options.slice(0, 2) : undefined,
      );
      expect(graveOf(s, "p1")).toHaveLength(2);
      expect(life(s, "p2")).toBe(18);
      expect(life(s, "p1")).toBe(20);
    });

    it("Traxos, Academy Guardian: costs {2} less if you cast a noncreature spell this turn; flying, vigilance, prowess", () => {
      let s = scenario({ p1: { hand: ["Traxos, Academy Guardian", "Opt"], battlefield: lands("Island", 3) } });
      const d = s.defs[s.objects[idOf(s, "p1", "hand", "Traxos, Academy Guardian")]?.defId ?? ""]!;
      expect(spellCost(s, "p1", d, {}).generic).toBe(3);
      s = resolve(cast(s, "p1", "Opt"));
      expect(spellCost(s, "p1", d, {}).generic).toBe(1);
      s = resolve(cast(s, "p1", "Traxos, Academy Guardian"));
      expect(chars(s, idOf(s, "p1", "battlefield", "Traxos, Academy Guardian")).keywords).toEqual(
        expect.arrayContaining(["flying", "vigilance", "prowess"]),
      );
    });

    it("Traxos, Scourge Eternal: doesn't untap during your untap step; untaps when you cast an artifact or creature spell", () => {
      let s = scenario({
        active: "p2",
        step: "end",
        p1: {
          hand: ["Bear Cub", "Shock"],
          battlefield: [{ name: "Traxos, Scourge Eternal", tapped: true }, ...lands("Forest", 2), "Mountain"],
        },
      });
      const traxos = idOf(s, "p1", "battlefield", "Traxos, Scourge Eternal");
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(s.objects[traxos]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(s.objects[traxos]?.tapped).toBe(true);
      s = resolve(cast(s, "p1", "Bear Cub"));
      expect(s.objects[traxos]?.tapped).toBe(false);
      expect(chars(s, traxos).keywords).toContain("trample");
    });

    it("Twisted Fates: destroys a nonland permanent; a +1/+1 counter on each creature of the targeted player", () => {
      let s = scenario({
        p1: { hand: ["Twisted Fates"], battlefield: [...lands("Plains", 3), ...lands("Swamp", 2), "Bear Cub", "Savannah Lions"] },
        p2: { battlefield: ["Ajani Resolute", "Serra Angel"] },
      });
      s = resolve(
        cast(s, "p1", "Twisted Fates", { targets: { t: [idOf(s, "p2", "battlefield", "Ajani Resolute")], p: ["p1"] } }),
      );
      expect(graveOf(s, "p2")).toEqual(["Ajani Resolute"]);
      expect(counters(s, idOf(s, "p1", "battlefield", "Bear Cub"))).toBe(1);
      expect(counters(s, idOf(s, "p1", "battlefield", "Savannah Lions"))).toBe(1);
      expect(counters(s, idOf(s, "p2", "battlefield", "Serra Angel"))).toBe(0);
    });

    it("Vigorbloom Charm: hexproof and indestructible; or draw and +3 life; or a +1/+1 counter then combat", () => {
      const setup = () =>
        scenario({
          p1: { hand: ["Vigorbloom Charm"], battlefield: ["Forest", "Plains", "Bear Cub"] },
          p2: { battlefield: ["Savannah Lions"] },
        });
      let a = setup();
      const bear = idOf(a, "p1", "battlefield", "Bear Cub");
      a = resolve(cast(a, "p1", "Vigorbloom Charm", { mode: 0, targets: { t: [bear] } }));
      expect(chars(a, bear).keywords).toEqual(expect.arrayContaining(["hexproof", "indestructible"]));
      const b = resolve(cast(setup(), "p1", "Vigorbloom Charm", { mode: 1 }));
      expect([b.players.p1?.hand.length, life(b, "p1")]).toEqual([1, 23]);
      let c = setup();
      c = resolve(
        cast(c, "p1", "Vigorbloom Charm", {
          mode: 2,
          targets: { a: [bear], b: [idOf(c, "p2", "battlefield", "Savannah Lions")] },
        }),
      );
      expect(graveOf(c, "p2")).toEqual(["Savannah Lions"]);
      expect(counters(c, bear)).toBe(1);
      expect(c.objects[bear]?.damage).toBe(2);
    });

    it("Vigorbloom Vanguard: enters prepared; your creatures with a +1/+1 counter have vigilance; Seed Suture: a +1/+1 counter and +1 life", () => {
      let s = scenario({ p1: { hand: ["Vigorbloom Vanguard"], battlefield: [...lands("Forest", 3), "Bear Cub"] } });
      s = resolve(cast(s, "p1", "Vigorbloom Vanguard"));
      const v = idOf(s, "p1", "battlefield", "Vigorbloom Vanguard");
      const bear = idOf(s, "p1", "battlefield", "Bear Cub");
      expect(prepared(s, v)).toBe(true);
      expect(chars(s, bear).keywords).not.toContain("vigilance");
      s = resolve(castCopy(s, v, { targets: { t: [bear] } }));
      expect(counters(s, bear)).toBe(1);
      expect(life(s, "p1")).toBe(21);
      expect(chars(s, bear).keywords).toContain("vigilance");
      expect(chars(s, v).keywords).not.toContain("vigilance");
    });

    it("Warrior's Blades: on entering, 3 damage to any target and +3 life; +2/+1; Equip {3}, {1} less per +1/+1 counter on the target", () => {
      let s = scenario({ p1: { hand: ["Warrior's Blades"], battlefield: [...lands("Mountain", 2), ...lands("Plains", 2)] } });
      s = resolve(cast(s, "p1", "Warrior's Blades"), answering(true, ["p2"]));
      expect([life(s, "p1"), life(s, "p2")]).toEqual([23, 17]);
      let t = scenario({
        p1: { battlefield: ["Warrior's Blades", { name: "Bear Cub", counters: { "+1/+1": 2 } }, "Plains", "Plains"] },
      });
      const bear = idOf(t, "p1", "battlefield", "Bear Cub");
      t = resolve(activate(t, "p1", idOf(t, "p1", "battlefield", "Warrior's Blades"), "Equip", { targets: { t: [bear] } }));
      expect(t.battlefield.filter((id) => t.objects[id]?.tapped)).toHaveLength(1);
      expect(pt(t, bear)).toEqual([6, 5]);
    });

    it("Woodwork Prodigy: prepared at your upkeep; Soul Tether: a Heartwood token", () => {
      let s = scenario({ active: "p2", step: "end", p1: { battlefield: ["Woodwork Prodigy", ...lands("Forest", 3)] } });
      const w = idOf(s, "p1", "battlefield", "Woodwork Prodigy");
      s = play(
        s,
        () => undefined,
        (x) => x.turn.active === "p1" && x.turn.step === "main1",
      );
      expect(prepared(s, w)).toBe(true);
      s = resolve(castCopy(s, w));
      expect(tokensNamed(s, "Heartwood")).toHaveLength(1);
    });

    it("Yargle, Glutton of Urborg and Yargle, Goliath of Otaria: no abilities, 9/3 and 3/9", () => {
      const s = scenario({ p1: { battlefield: ["Yargle, Glutton of Urborg", "Yargle, Goliath of Otaria"] } });
      expect(pt(s, idOf(s, "p1", "battlefield", "Yargle, Glutton of Urborg"))).toEqual([9, 3]);
      expect(pt(s, idOf(s, "p1", "battlefield", "Yargle, Goliath of Otaria"))).toEqual([3, 9]);
    });

    it("Yoshimaru, Scrappy Stray: on entering, another of your creatures fights an opposing creature; {6}: a counter on a nonlegendary creature", () => {
      let s = scenario({
        p1: { hand: ["Yoshimaru, Scrappy Stray"], battlefield: [...lands("Forest", 8), "Serra Angel"] },
        p2: { battlefield: ["Bear Cub"] },
      });
      const angel = idOf(s, "p1", "battlefield", "Serra Angel");
      const bear = idOf(s, "p2", "battlefield", "Bear Cub");
      s = resolve(cast(s, "p1", "Yoshimaru, Scrappy Stray"), answering(true, [angel, bear]));
      expect(graveOf(s, "p2")).toEqual(["Bear Cub"]);
      expect(s.objects[angel]?.damage).toBe(2);
      const yoshi = idOf(s, "p1", "battlefield", "Yoshimaru, Scrappy Stray");
      const opt = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === yoshi);
      expect(opt?.type === "activate" && opt.targets[0]?.legal).toEqual([angel]);
      s = resolve(activate(s, "p1", yoshi, undefined, { targets: { t: [angel] } }));
      expect(counters(s, angel)).toBe(1);
    });

    it("Your Fate Ends Here: destroys a creature or planeswalker with mana value 3 or more; surveil 1", () => {
      let s = scenario({
        p1: { hand: ["Your Fate Ends Here"], battlefield: lands("Plains", 3) },
        p2: { battlefield: ["Serra Angel", "Bear Cub"] },
      });
      const opt = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === idOf(s, "p1", "hand", "Your Fate Ends Here"));
      expect(opt?.type === "cast" && opt.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Serra Angel")]);
      let surveilled = false;
      s = resolve(
        cast(s, "p1", "Your Fate Ends Here", { targets: { t: [idOf(s, "p2", "battlefield", "Serra Angel")] } }),
        (req) => {
          if (req.intent === "surveilGraveyard") surveilled = true;
          return undefined;
        },
      );
      expect(graveOf(s, "p2")).toEqual(["Serra Angel"]);
      expect(surveilled).toBe(true);
    });
  });

  describe("uncommons (6): the Ways", () => {
    /** Casts the Way from hand (with enough `land`) and returns the state and the Jace token created. */
    const castWay = (way: string, land: string, n: number, extra: { battlefield?: string[]; hand?: string[] } = {}) => {
      let s = scenario({
        p1: { hand: [way, ...(extra.hand ?? [])], battlefield: [...lands(land, n), ...(extra.battlefield ?? [])] },
        p2: { battlefield: ["Serra Angel"] },
      });
      s = resolve(cast(s, "p1", way));
      return { s, jace: jaceTokens(s)[0] as string };
    };

    it("Way of the Cryomancer: empower Jace 5; [−3]: the next instant or sorcery cast this turn is copied", () => {
      let { s, jace } = castWay("Way of the Cryomancer", "Island", 3, { hand: ["Shock"], battlefield: ["Mountain"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      s = resolve(activate(s, "p1", jace, "−3: Copy"));
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      s = resolve(cast(s, "p1", "Shock", { targets: { t: ["p2"] } }));
      expect(life(s, "p2")).toBe(16);
    });

    it("Way of the Deathbringer: empower Jace 5; [−2]: you may sacrifice a creature for a 4/4 Beast with trample", () => {
      const run = (yes: boolean) => {
        let { s, jace } = castWay("Way of the Deathbringer", "Swamp", 3, { battlefield: ["Bear Cub"] });
        expect(s.objects[jace]?.counters.loyalty).toBe(5);
        s = resolve(activate(s, "p1", jace, "−2"), (req) => {
          if (req.type === "yesNo") return [yes ? 1 : 0];
          if (req.intent === "sacrifice" && req.type === "pick") return yes ? req.options.slice(0, 1) : [];
          return undefined;
        });
        return s;
      };
      const yes = run(true);
      const beast = tokensNamed(yes, "Beast")[0] as string;
      expect(pt(yes, beast)).toEqual([4, 4]);
      expect(chars(yes, beast).keywords).toContain("trample");
      expect(graveOf(yes, "p1")).toContain("Bear Cub");
      const no = run(false);
      expect(tokensNamed(no, "Beast")).toHaveLength(0);
      expect(idsOf(no, "p1", "battlefield", "Bear Cub")).toHaveLength(1);
    });

    it("Way of the Healer: empower Jace 5; [−2]: a Cadet, surveil 1", () => {
      let { s, jace } = castWay("Way of the Healer", "Plains", 4);
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      let surveilled = false;
      s = resolve(activate(s, "p1", jace, "−2"), (req) => {
        if (req.intent === "surveilGraveyard") surveilled = true;
        return undefined;
      });
      expect(tokensNamed(s, "Cadet")).toHaveLength(1);
      expect(surveilled).toBe(true);
    });

    it("Way of the Mentor: empower Jace 5; each life gain puts a loyalty counter on each of your planeswalkers", () => {
      let { s, jace } = castWay("Way of the Mentor", "Plains", 3, { battlefield: ["Ajani Unrelenting"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      gainLife(s, "p1", 2);
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(6);
      expect(s.objects[idOf(s, "p1", "battlefield", "Ajani Unrelenting")]?.counters.loyalty).toBe(6);
      gainLife(s, "p2", 2);
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(6);
    });

    it("Way of the Mind Sculptor: empower Jace 5; draw when you activate a loyalty ability by removing two or more counters", () => {
      let { s, jace } = castWay("Way of the Mind Sculptor", "Island", 5);
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      s = resolve(activate(s, "p1", jace, "−1"));
      expect(s.players.p1?.hand).toHaveLength(0);
      let t = castWay("Way of the Mind Sculptor", "Island", 5).s;
      t = resolve(activate(t, "p1", jaceTokens(t)[0] as string, "−3"));
      expect(t.players.p1?.hand).toHaveLength(2); // −3 from Jace, and the trigger
    });

    it("Way of the Necromancer: empower Jace 2; each creature you control that dies puts a loyalty counter on your planeswalkers", () => {
      let { s, jace } = castWay("Way of the Necromancer", "Swamp", 2, { battlefield: ["Bear Cub"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      destroy(s, idOf(s, "p2", "battlefield", "Serra Angel"));
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      destroy(s, idOf(s, "p1", "battlefield", "Bear Cub"));
      s = resolve(s);
      expect(s.objects[jace]?.counters.loyalty).toBe(3);
    });

    it("Way of the Paradox: empower Jace 5; each loyalty ability activated: +1 life and one more land this turn", () => {
      let { s, jace } = castWay("Way of the Paradox", "Forest", 3, { hand: ["Plains", "Island"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      s = resolve(activate(s, "p1", jace, "−1"));
      expect(life(s, "p1")).toBe(21);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Plains") });
      expect(legalActions(s, "p1").some((a) => a.type === "playLand")).toBe(true);
      s = act(s, "p1", { type: "playLand", card: idOf(s, "p1", "hand", "Island") });
      expect(idsOf(s, "p1", "battlefield", "Island")).toHaveLength(1);
    });

    it("Way of the Pyromancer : renforcez Jace 2 ; [+1] : ajoutez {R}", () => {
      let { s, jace } = castWay("Way of the Pyromancer", "Mountain", 2);
      expect(s.objects[jace]?.counters.loyalty).toBe(2);
      s = resolve(activate(s, "p1", jace, "+1"));
      expect(s.objects[jace]?.counters.loyalty).toBe(3);
      expect(s.players.p1?.manaPool.R).toBe(1);
    });

    it("Way of the Warlord: empower Jace 5; [−4]: 2 damage to up to one creature or planeswalker and 2 to a player", () => {
      let { s, jace } = castWay("Way of the Warlord", "Mountain", 3, { battlefield: ["Bear Cub"] });
      expect(s.objects[jace]?.counters.loyalty).toBe(5);
      const angel = idOf(s, "p2", "battlefield", "Serra Angel");
      s = resolve(activate(s, "p1", jace, "−4", { targets: { c: [angel], p: ["p2"] } }));
      expect(s.objects[angel]?.damage).toBe(2);
      expect(life(s, "p2")).toBe(18);
    });
  });

  describe("parade", () => {
    it("Gideon the Oathless: ward — discard a card; with no card to discard, the opposing spell is countered", () => {
      const run = (extra: string[]) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Gideon the Oathless"] },
          p2: { hand: ["Shock", ...extra], battlefield: ["Mountain"] },
        });
        const gideon = idOf(s, "p1", "battlefield", "Gideon the Oathless");
        s = resolve(cast(s, "p2", "Shock", { targets: { t: [gideon] } }), (req) => {
          if (req.type === "yesNo") return [1];
          if (req.type === "pick" && req.intent === "discard") return req.options.slice(0, 1);
          return undefined;
        });
        return { damage: s.objects[gideon]?.damage, grave: graveOf(s, "p2").sort() };
      };
      expect(run([])).toEqual({ damage: 0, grave: ["Shock"] });
      expect(run(["Opt"])).toEqual({ damage: 2, grave: ["Opt", "Shock"] });
    });

    it("Kwia Vigorbloom : parade {2}", () => {
      const run = (mountains: number) => {
        let s = scenario({
          active: "p2",
          p1: { battlefield: ["Kwia Vigorbloom"] },
          p2: { hand: ["Shock"], battlefield: lands("Mountain", mountains) },
        });
        const kwia = idOf(s, "p1", "battlefield", "Kwia Vigorbloom");
        s = resolve(cast(s, "p2", "Shock", { targets: { t: [kwia] } }), answering(true));
        return s.objects[kwia]?.damage;
      };
      expect(run(1)).toBe(0);
      expect(run(3)).toBe(2);
    });
  });
});

describe("Reality Fracture, PLAN-M M8a", () => {
  it("Garruk, Curse Breaker −4: until your next turn, creatures attacking one of your opponents (any player's) get +2/+2 and trample", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Garruk, Curse Breaker"] },
      p2: { battlefield: ["Bear Cub", "Savannah Lions"] },
    });
    const garruk = idOf(s, "p1", "battlefield", "Garruk, Curse Breaker");
    const minus4 = legalActions(s, "p1")
      .filter((a) => a.type === "activate" && a.source === garruk)
      .at(-1);
    s = settle(act(s, "p1", { type: "activate", source: garruk, ability: (minus4 as { ability: number }).ability }));
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    const lions = idOf(s, "p2", "battlefield", "Savannah Lions");
    // p2's turn: the Bear Cub attacks p3 (an opponent of Garruk's controller), the Lions attack p1.
    s = advanceUntil(s, (x) => x.turn.active === "p2" && x.pending?.kind === "declareAttackers");
    s = act(s, "p2", {
      type: "declareAttackers",
      attackers: [
        { id: bear, defender: "p3" },
        { id: lions, defender: "p1" },
      ],
    });
    s = passAccepting(s, (x) => x.stack.length === 0 && x.pending?.kind === "priority");
    expect([chars(s, bear).power, chars(s, bear).toughness]).toEqual([4, 4]);
    expect(chars(s, bear).keywords).toContain("trample");
    expect([chars(s, lions).power, chars(s, lions).toughness]).toEqual([2, 1]);
    expect(chars(s, lions).keywords).not.toContain("trample");
  });
});

describe("Extrapolate the Impossible: outside the game is the sideboard (rules 209)", () => {
  const setup = (sideboard: string[]) =>
    cast(
      scenario({ p1: { battlefield: ["Swamp", "Swamp"], hand: ["Extrapolate the Impossible"], sideboard } }),
      "p1",
      "Extrapolate the Impossible",
    );

  it("two cards with different names are revealed, an opponent chooses the one that goes into your hand", () => {
    const asked: { player: string; options: (string | undefined)[] }[] = [];
    const run = settleLogged(setup(["Shock", "Shock", "Negate"]), (req, player, cur) => {
      if (req.type !== "pick") return undefined;
      asked.push({ player, options: namesIn(cur, req.options.map(String)) });
      if (player === "p1") return pickNamed(cur, req, "Shock")?.slice(0, 1);
      return pickNamed(cur, req, "Negate");
    });
    const s = run.s;
    // You choose the first one (or none); the second, the only one with another name, needs no question; then the
    // opponent chooses.
    expect(asked).toEqual([
      { player: "p1", options: ["Shock", "Shock", "Negate"] },
      { player: "p2", options: ["Shock", "Negate"] },
    ]);
    const reveal = run.events.find((e) => e.type === "reveal" && !e.look);
    expect(reveal?.type === "reveal" && reveal.defIds.map((d) => s.defs[d]?.name).sort()).toEqual(["Negate", "Shock"]);
    expect(namesIn(s, s.players.p1?.hand)).toEqual(["Negate"]);
    // The other card stays outside the game (ruling).
    expect(namesIn(s, s.players.p1?.sideboard)).toEqual(["Shock", "Shock"]);
  });

  it("nothing without two cards with different names, nor when you decline", () => {
    // Two copies of one card: the first is chosen, no second one, nothing is revealed.
    const same = settleLogged(setup(["Shock", "Shock"]), (req, _p, cur) =>
      req.type === "pick" ? pickNamed(cur, req, "Shock")?.slice(0, 1) : undefined,
    );
    expect(same.events.some((e) => e.type === "reveal")).toBe(false);
    expect(same.s.players.p1?.hand).toHaveLength(0);
    expect(same.s.players.p1?.sideboard).toHaveLength(2);
    // Declined.
    const declined = settle(setup(["Shock", "Negate"]), (req) => (req.type === "pick" ? [] : undefined));
    expect(declined.players.p1?.hand).toHaveLength(0);
    expect(declined.players.p1?.sideboard).toHaveLength(2);
    // A single card (or no sideboard): no question.
    const one = settleLogged(setup(["Negate"]));
    expect(one.asked).toHaveLength(0);
    expect(one.s.players.p1?.sideboard).toHaveLength(1);
  });
});
