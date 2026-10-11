/**
 * What `legalActions` offers, the engine accepts (PLAN-C in docs/history.md, lot C2). Gaps found by the strict fuzz
 * (`--offers`): each test replays the position and checks the rule.
 */
import { card } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { activated, fx, manaAbility, ref, target } from "../src/dsl";
import { RulesError } from "../src/errors";
import { fallbackDecision } from "../src/host";
import { legalActions } from "../src/legal";
import { chars } from "../src/state";
import { forcedAttackers } from "../src/turn";
import type { ActionOption, GameState } from "../src/types";
import { act, advanceUntil, customCard, exiled, idOf, idsOf, lands, scenario, settle } from "./helpers";

/** Artifact "{T}: Add {C}" (without sacrificing itself). */
const stone = (name: string) => customCard({ name, types: ["Artifact"], typeLine: "Artifact", abilities: [manaAbility("C")] });
/** Artifact without a mana ability. */
const trinket = (name: string) => customCard({ name, types: ["Artifact"], typeLine: "Artifact" });
const bear = (name: string, subtypes: string[] = ["Bear"]) =>
  customCard({ name, power: 2, toughness: 2, subtypes, typeLine: `Creature — ${subtypes.join(" ")}` });

const castOption = (s: GameState, player: string, card: string) =>
  legalActions(s, player).find((a): a is Extract<ActionOption, { type: "cast" }> => a.type === "cast" && a.card === card);
const activations = (s: GameState, player: string, source: string) =>
  legalActions(s, player).filter(
    (a): a is Extract<ActionOption, { type: "activate" }> => a.type === "activate" && a.source === source,
  );

describe("offered options, accepted decisions", () => {
  it("Guardian of the Great Door and Springleaf Drum: creatures tapped for the cost no longer serve the Drum (strict fuzz)", () => {
    // {W}{W} and four permanents to tap: the only solution taps the two Islands and two creatures, and pays with the
    // Plains and the Drum (which taps the third creature).
    let s = scenario({
      p1: {
        battlefield: ["Springleaf Drum", "Plains", ...lands("Island", 2), bear("Ours A"), bear("Ours B"), bear("Ours C")],
        hand: ["Guardian of the Great Door"],
      },
    });
    const guardian = idOf(s, "p1", "hand", "Guardian of the Great Door");
    const option = castOption(s, "p1", guardian);
    expect(option).toBeDefined();
    const tap = option?.picks?.find((p) => p.slot === "costTap");
    expect(tap?.suggested.filter((id) => chars(s, id).types.includes("Creature"))).toHaveLength(2);
    s = settle(act(s, "p1", { type: "cast", card: guardian, picks: { costTap: tap?.suggested ?? [] } } as never));
    expect(idsOf(s, "p1", "battlefield", "Guardian of the Great Door")).toHaveLength(1);
  });

  it("'discard a card or pay {2}': payment accounts for the commander tax (Titania from the command zone)", () => {
    const affordable = (n: number) => {
      const s = scenario({
        p1: { command: ["Titania, Rugged Rumbler"], battlefield: [...lands("Forest", n)], hand: ["Forest"] },
      });
      const titania = s.players.p1?.command[0] ?? "";
      const rec = s.commander?.cards[s.objects[titania]?.uid ?? ""];
      if (rec) rec.casts = 1;
      return castOption(s, "p1", titania)?.additional?.discard?.orPayAffordable;
    };
    // {2}{B/G} + taxe {2} + {2} : sept mana.
    expect(affordable(5)).toBe(false);
    expect(affordable(7)).toBe(true);
  });

  it("Terror of the Peaks: not offered as a target if the player cannot pay the extra 3 life", () => {
    const at = (life: number) => {
      const s = scenario({
        p1: { life, battlefield: ["Mountain"], hand: ["Shock"] },
        p2: { battlefield: ["Terror of the Peaks"] },
      });
      const terror = idOf(s, "p2", "battlefield", "Terror of the Peaks");
      const legal = castOption(s, "p1", idOf(s, "p1", "hand", "Shock"))?.modes[0]?.targets[0]?.legal ?? [];
      return legal.includes(terror);
    };
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
  });

  it("sources that cost life: no more than the player can pay (119.4; Mana Confluence at 1 life)", () => {
    // Two Mana Confluence for {1}{R}: at 1 life, only one can pay (the spell is not offered); at 3 life, both.
    const at = (life: number) => {
      const s = scenario({ p1: { life, battlefield: ["Mana Confluence", "Mana Confluence"], hand: ["Axgard Cavalry"] } });
      const cavalry = idOf(s, "p1", "hand", "Axgard Cavalry");
      return { s, offered: !!castOption(s, "p1", cavalry), cavalry };
    };
    expect(at(1).offered).toBe(false);
    const two = at(3);
    expect(two.offered).toBe(true);
    const after = settle(act(two.s, "p1", { type: "cast", card: two.cavalry }));
    expect(idsOf(after, "p1", "battlefield", "Axgard Cavalry")).toHaveLength(1);
    expect(after.players.p1?.life).toBe(1);
  });

  it("'X targets' with X = 0: no target (601.2c, Hide on the Ceiling)", () => {
    let s = scenario({ p1: { battlefield: ["Island"], hand: ["Hide on the Ceiling"] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Hide on the Ceiling"), x: 0, targets: { t: [] } });
    expect(s.stack).toHaveLength(1);
  });

  it("wither as an additional cost: the targeted creature can pay the cost (601.2h, Cinder Strike)", () => {
    const giant = customCard({ name: "Test Giant", power: 5, toughness: 5 });
    let s = scenario({ p1: { battlefield: ["Mountain", giant], hand: ["Cinder Strike"] } });
    const g = idOf(s, "p1", "battlefield", "Test Giant");
    const option = castOption(s, "p1", idOf(s, "p1", "hand", "Cinder Strike"));
    expect(option?.kickerAffordable).toBe(true);
    expect(option?.kickerPermanents).toEqual([g]);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cinder Strike"), targets: { t: [g] }, kicked: true });
    expect(s.objects[g]?.counters["-1/-1"]).toBe(1);
    s = settle(s);
    // 4 damage on a 4/4 (5/5 with a -1/-1 counter): it dies.
    expect(idsOf(s, "p1", "graveyard", "Test Giant")).toHaveLength(1);
  });

  it("an artifact sacrificed for the cost can first produce its mana (601.2g, Hungering Puppetbeast)", () => {
    let s = scenario({ p1: { battlefield: ["Hungering Puppetbeast", stone("Test Stone")] } });
    const beast = idOf(s, "p1", "battlefield", "Hungering Puppetbeast");
    const option = activations(s, "p1", beast)[0];
    expect(option).toBeDefined();
    s = act(s, "p1", { type: "activate", source: beast, ability: option?.ability ?? -1, targets: {} });
    s = settle(s);
    expect(idsOf(s, "p1", "graveyard", "Test Stone")).toHaveLength(1);
    expect(s.objects[beast]?.counters["+1/+1"]).toBe(1);
  });

  it("paying 0 life is always possible, even with a negative total (119.4, Herald of Eternal Dawn)", () => {
    const squire = customCard({
      name: "Test Squire",
      power: 1,
      toughness: 1,
      manaCost: { generic: 0, colored: { W: 1 }, x: 0 },
      manaCostText: "{W}",
      colors: ["W"],
    });
    let s = scenario({ p1: { life: -3, battlefield: ["Plains", "Herald of Eternal Dawn"], hand: [squire] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Test Squire"))).toBeDefined();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test Squire") });
    expect(s.stack).toHaveLength(1);
  });

  it("a mana's proofs do not take the card that exiles itself to pay for its ability (Cryptex, Sage of the Fang)", () => {
    const base = { battlefield: ["Cryptex", ...lands("Forest", 3)], graveyard: ["Sage of the Fang"] };
    let s = scenario({ p1: base, p2: { battlefield: ["Forest"] } });
    const sage = idOf(s, "p1", "graveyard", "Sage of the Fang");
    // Only card in the graveyard: Cryptex cannot gather proofs without exiling Sage of the Fang.
    expect(activations(s, "p1", sage)).toEqual([]);
    expect(() =>
      act(s, "p1", { type: "activate", source: sage, ability: 1, targets: { t: [idOf(s, "p1", "battlefield", "Cryptex")] } }),
    ).toThrow(RulesError);
    // With another mana value 3 card in the graveyard, the proofs take it.
    s = scenario({
      p1: {
        ...base,
        battlefield: [...base.battlefield, bear("Test Bear")],
        graveyard: ["Sage of the Fang", "Lightning Strike", "Opt", "Opt"],
      },
    });
    const sage2 = idOf(s, "p1", "graveyard", "Sage of the Fang");
    const option = activations(s, "p1", sage2)[0];
    expect(option).toBeDefined();
    const bears = idOf(s, "p1", "battlefield", "Test Bear");
    s = act(s, "p1", { type: "activate", source: sage2, ability: option?.ability ?? -1, targets: { t: [bears] } });
    expect(s.exile.some((id) => s.objects[id]?.defId === card("Sage of the Fang").id)).toBe(true);
  });

  it("'pay X life': X does not exceed the life total (Krumar Initiate)", () => {
    const s = scenario({ p1: { life: 3, battlefield: ["Krumar Initiate", ...lands("Swamp", 8)] } });
    const option = activations(s, "p1", idOf(s, "p1", "battlefield", "Krumar Initiate"))[0];
    expect(option?.xMax).toBe(3);
  });

  it("'sacrifice one or more artifacts': X is at least 1 (Radiant Lotus)", () => {
    const s = scenario({ p1: { battlefield: ["Radiant Lotus", trinket("Test Trinket")] } });
    const lotus = idOf(s, "p1", "battlefield", "Radiant Lotus");
    const option = activations(s, "p1", lotus)[0];
    expect(option?.xMin).toBe(1);
    expect(() =>
      act(s, "p1", { type: "activate", source: lotus, ability: option?.ability ?? -1, targets: { t: ["p1"] }, x: 0 }),
    ).toThrow(RulesError);
  });

  it("'tap X artifacts': those that pay the mana do not count (Secluded Starforge)", () => {
    // Two mana artifacts pay {2}: X is 0. One more artifact, without mana: X is 1.
    const base = ["Secluded Starforge", stone("Stone A"), stone("Stone B"), bear("Test Bear")];
    let s = scenario({ p1: { battlefield: base } });
    const forge = () => idOf(s, "p1", "battlefield", "Secluded Starforge");
    const pump = () => activations(s, "p1", forge()).find((a) => a.targets.length > 0);
    expect(pump()?.xMax ?? 0).toBe(0);
    s = scenario({ p1: { battlefield: [...base, trinket("Test Trinket")] } });
    expect(pump()?.xMax).toBe(1);
    const bears = idOf(s, "p1", "battlefield", "Test Bear");
    s = act(s, "p1", { type: "activate", source: forge(), ability: pump()?.ability ?? -1, targets: { t: [bears] }, x: 1 });
    expect(s.objects[idOf(s, "p1", "battlefield", "Test Trinket")]?.tapped).toBe(true);
  });

  it("'this spell costs {3} less if it targets a tapped creature': only tapped targets if necessary (Luminous Rebuke)", () => {
    const s = scenario({
      p1: { battlefield: lands("Plains", 2), hand: ["Luminous Rebuke"] },
      p2: { battlefield: [{ name: bear("Tapped Bear"), tapped: true }, bear("Untapped Bear")] },
    });
    const option = castOption(s, "p1", idOf(s, "p1", "hand", "Luminous Rebuke"));
    expect(option?.modes[0]?.targets[0]?.legal).toEqual([idOf(s, "p2", "battlefield", "Tapped Bear")]);
  });

  it("'{W}{U} more for each target beyond the first': no more targets than the mana allows (Officious Interrogation)", () => {
    const s = scenario({ p1: { battlefield: ["Plains", "Island"], hand: ["Officious Interrogation"] } });
    const option = castOption(s, "p1", idOf(s, "p1", "hand", "Officious Interrogation"));
    expect(option?.modes[0]?.targets[0]?.count ?? 1).toBe(1);
  });

  it("two targets that share a creature type: not offered without such a pair (Secret Tunnel)", () => {
    const base = ["Secret Tunnel", ...lands("Forest", 4)];
    let s = scenario({ p1: { battlefield: [...base, bear("Ours A"), bear("Loup B", ["Wolf"])] } });
    const tunnel = () => idOf(s, "p1", "battlefield", "Secret Tunnel");
    expect(activations(s, "p1", tunnel()).some((a) => a.targets.length > 0)).toBe(false);
    s = scenario({ p1: { battlefield: [...base, bear("Ours A"), bear("Ours B")] } });
    expect(activations(s, "p1", tunnel()).some((a) => a.targets.length > 0)).toBe(true);
  });

  it("a mana ability with no possible color is not offered (106.7, Pit of Offerings)", () => {
    const s = scenario({ p1: { battlefield: ["Pit of Offerings"] } });
    const pit = idOf(s, "p1", "battlefield", "Pit of Offerings");
    const taps = legalActions(s, "p1").filter((a) => a.type === "tapForMana" && a.source === pit);
    expect(taps.map((a) => (a.type === "tapForMana" ? a.colors : []))).toEqual([["C"]]);
    expect(chars(s, pit).name).toBe("Pit of Offerings");
  });

  it("two Springleaf Drums share the creature to tap (payment)", () => {
    const spell = customCard({
      name: "Test Spell",
      types: ["Sorcery"],
      typeLine: "Sorcery",
      manaCost: { generic: 2, colored: { W: 1 }, x: 0 },
      manaCostText: "{2}{W}",
      colors: ["W"],
    });
    const base = ["Plains", "Springleaf Drum", "Springleaf Drum", bear("Ours A")];
    let s = scenario({ p1: { battlefield: base, hand: [spell] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Test Spell"))).toBeUndefined();
    s = scenario({ p1: { battlefield: [...base, bear("Ours B")], hand: [spell] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Test Spell"))).toBeDefined();
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Test Spell") });
    expect(s.stack).toHaveLength(1);
  });

  it("harmony: by default, a creature without a mana ability (the land creature pays the rest)", () => {
    const reef = customCard({
      name: "Test Reef",
      types: ["Land", "Creature"],
      typeLine: "Land Creature",
      power: 4,
      toughness: 4,
      abilities: [manaAbility("U")],
    });
    const giant = customCard({ name: "Test Giant", power: 9, toughness: 9 });
    let s = scenario({ p1: { battlefield: [reef, giant], graveyard: ["Winternight Stories"] } });
    const stories = idOf(s, "p1", "graveyard", "Winternight Stories");
    const option = castOption(s, "p1", stories);
    expect(option?.additional?.tap?.suggested).toEqual([idOf(s, "p1", "battlefield", "Test Giant")]);
    s = act(s, "p1", { type: "cast", card: stories });
    expect(s.stack).toHaveLength(1);
  });

  it("'up to two targets' (`minCount: 0`): activation without a target is accepted", () => {
    const hearse = customCard({
      name: "Test Hearse",
      types: ["Artifact"],
      typeLine: "Artifact",
      abilities: [
        activated({
          tap: true,
          targets: [target.between(0, 2, target.cardInGraveyard("t", {}, "any"))],
          effects: [fx.exileCard(ref.target())],
        }),
      ],
    });
    let s = scenario({ p1: { battlefield: [hearse] } });
    const source = idOf(s, "p1", "battlefield", "Test Hearse");
    expect(activations(s, "p1", source)).toHaveLength(1);
    s = act(s, "p1", { type: "activate", source, ability: 0, targets: { t: [] } });
    expect(s.stack).toHaveLength(1);
  });

  it("emerge: the sacrificed creature does not pay the alternative cost's mana (Cresting Mosasaurus)", () => {
    const alt = (s: GameState) => castOption(s, "p1", idOf(s, "p1", "hand", "Cresting Mosasaurus"))?.altAvailable;
    // {6}{U} minus 1 (Llanowar Elves): six mana, without that of the sacrificed Elves.
    let s = scenario({ p1: { battlefield: [...lands("Island", 5), "Llanowar Elves"], hand: ["Cresting Mosasaurus"] } });
    expect(alt(s)).toBeFalsy();
    s = scenario({ p1: { battlefield: [...lands("Island", 6), "Llanowar Elves"], hand: ["Cresting Mosasaurus"] } });
    expect(alt(s)).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Cresting Mosasaurus"), alternative: true });
    expect(s.stack).toHaveLength(1);
  });

  it("delve and exile: the permanent exiled before the mana no longer adds any (Champion of the Path, Lavaleaper)", () => {
    const champion = (s: GameState) => castOption(s, "p1", idOf(s, "p1", "hand", "Champion of the Path"));
    // {3}{R}: two Mountains produce four with Lavaleaper, but Lavaleaper is the only Elemental to exile.
    let s = scenario({ p1: { battlefield: ["Lavaleaper", ...lands("Mountain", 3)], hand: ["Champion of the Path"] } });
    expect(champion(s)).toBeUndefined();
    s = scenario({ p1: { battlefield: ["Lavaleaper", ...lands("Mountain", 4)], hand: ["Champion of the Path"] } });
    expect(champion(s)?.normalAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Champion of the Path") });
    expect(s.stack).toHaveLength(1);
    expect(exiled(s, "Lavaleaper")).toHaveLength(1);
    // An Elemental from hand is exiled in its place: Lavaleaper stays, the two Mountains suffice.
    s = scenario({
      p1: { battlefield: ["Lavaleaper", ...lands("Mountain", 2)], hand: ["Champion of the Path", "Lavaleaper"] },
    });
    expect(champion(s)?.normalAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Champion of the Path") });
    expect(s.stack).toHaveLength(1);
    expect(idsOf(s, "p1", "battlefield", "Lavaleaper")).toHaveLength(1);
  });

  it("web-slinging: the creature returned before the mana no longer triples the mana (Spider-Man, Brooklyn Visionary, Nyxbloom Ancient)", () => {
    const spider = (s: GameState) => castOption(s, "p1", idOf(s, "p1", "hand", "Spider-Man, Brooklyn Visionary"));
    // {2}{G}: Chromatic Lantern produces three with Nyxbloom Ancient, but Nyxbloom is the only tapped creature.
    let s = scenario({
      p1: {
        battlefield: [{ name: "Nyxbloom Ancient", tapped: true }, "Chromatic Lantern"],
        hand: ["Spider-Man, Brooklyn Visionary"],
      },
    });
    expect(spider(s)).toBeUndefined();
    // Another, cheaper tapped creature is returned by default: Nyxbloom stays.
    s = scenario({
      p1: {
        battlefield: [{ name: "Nyxbloom Ancient", tapped: true }, { name: "Llanowar Elves", tapped: true }, "Chromatic Lantern"],
        hand: ["Spider-Man, Brooklyn Visionary"],
      },
    });
    expect(spider(s)?.altAvailable).toBe(true);
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Spider-Man, Brooklyn Visionary"), alternative: true });
    expect(s.stack).toHaveLength(1);
    expect(idsOf(s, "p1", "hand", "Llanowar Elves")).toHaveLength(1);
  });

  it("'attacks each combat if able' with no allowed defender: not forced to attack (508.1d, The Void and Storm, Windrider)", () => {
    // The Void (The Sentry's token): flying, attacks each combat; Storm: flying creatures cannot attack you.
    const voidToken = customCard({ name: "Test Void", power: 5, toughness: 5, keywords: ["flying", "mustAttack"] });
    let s = scenario({ p1: { battlefield: [voidToken] }, p2: { battlefield: ["Storm, Windrider"] } });
    const v = idOf(s, "p1", "battlefield", "Test Void");
    s = advanceUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(forcedAttackers(s, "p1")).toEqual([]);
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [{ id: v, defender: "p2" }] })).toThrow(RulesError);
    const p = s.pending;
    if (p?.kind !== "declareAttackers") throw new Error("declare attackers decision expected");
    expect(fallbackDecision(s, p)).toEqual({ type: "declareAttackers", attackers: [] });
    s = act(s, "p1", fallbackDecision(s, p));
    expect(s.combat?.attackers ?? []).toHaveLength(0);
  });
  it("land with an 'as it enters' question (PLAN-H H9): each offered answer, and 'none' when allowed, is accepted", () => {
    const s = scenario({
      p1: { hand: ["Echoing Deeps", "Cavern of Souls", "Multiversal Passage"], graveyard: ["Forest"] },
      p2: { graveyard: ["Restless Vents"] },
    });
    const offered = legalActions(s, "p1").filter((a): a is Extract<ActionOption, { type: "playLand" }> => a.type === "playLand");
    expect(offered.length).toBeGreaterThan(3);
    for (const option of offered) {
      const { choose, faceName: _f, ...decision } = option;
      const answers = choose?.type === "pick" ? [...choose.options, ...(choose.min === 0 ? [""] : [])] : [undefined];
      for (const chosen of answers.slice(0, 5))
        expect(() => act(s, "p1", { ...decision, ...(chosen !== undefined ? { chosen } : {}) })).not.toThrow();
    }
    // Multiversal Passage: the basic land type comes from the option, not from `chosen`.
    const passage = idOf(s, "p1", "hand", "Multiversal Passage");
    expect(() => act(s, "p1", { type: "playLand", card: passage, chosen: "Island" })).toThrow(RulesError);
  });
  it("additional sacrifice (Deadly Dispute): a Treasure sacrificed for the cost doesn't pay its mana (PLAN-M M8b, FCA fuzz seed 26)", () => {
    const TREASURE = customCard({
      name: "Test Treasure",
      types: ["Artifact"],
      typeLine: "Artifact — Treasure",
      subtypes: ["Treasure"],
      abilities: [manaAbility(["W", "U", "B", "R", "G"], 1, { sacrifice: true })],
    });
    // The Treasure is the only black source and the only permanent to sacrifice: not offered.
    const s = scenario({ p1: { battlefield: ["Island", "Plains", TREASURE], hand: ["Deadly Dispute"] } });
    expect(castOption(s, "p1", idOf(s, "p1", "hand", "Deadly Dispute"))).toBeUndefined();
    // With a creature to sacrifice, it comes first by default and the Treasure pays {B}.
    const t = scenario({ p1: { battlefield: ["Island", TREASURE, bear("Test Bear")], hand: ["Deadly Dispute"] } });
    const option = castOption(t, "p1", idOf(t, "p1", "hand", "Deadly Dispute"));
    expect(option?.additional?.sacrifice?.options.map((id) => t.defs[t.objects[id]?.defId ?? ""]?.name)).toEqual([
      "Test Bear",
      "Test Treasure",
    ]);
    const after = settle(
      act(t, "p1", {
        type: "cast",
        card: idOf(t, "p1", "hand", "Deadly Dispute"),
        sacrifice: [idOf(t, "p1", "battlefield", "Test Bear")],
      }),
    );
    expect(after.players.p1?.hand).toHaveLength(2);
  });
});
