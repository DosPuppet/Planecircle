/**
 * Rules gaps found by the 2026-09-30 audit (the 2026-09-30 audit in docs/history.md, § 3.1) and fixed by PLAN-R in docs/history.md: one `describe` per
 * gap (audit number, or N… for those found while preparing the plan).
 */
import { card, type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { dealDamage, destroy, gainLife } from "../src/actions";
import * as dsl from "../src/dsl";
import { cond, eventReplacement, fx, ref, triggered, when } from "../src/dsl";
import { addEffect, runEffect } from "../src/effects";
import { submit } from "../src/game";
import { bump, snapshot } from "../src/layers";
import { legalActions } from "../src/legal";
import { chooseReplacementOrder } from "../src/modifiers";
import { spellCost } from "../src/stack";
import { changeCounters, chars, FACE_DOWN_ID, moveObject, syncControl } from "../src/state";
import { legalTargets } from "../src/targets";
import { plainText } from "../src/text";
import { simultaneously } from "../src/triggers";
import { canBlock, eliminate, forcedAttacks } from "../src/turn";
import type { CardDef, Effect, GameEvent, GameState, TokenSpec } from "../src/types";
import { projectView } from "../src/view";
import { act, advanceUntil, customCard, idOf, idsOf, passAccepting, passBoth, passUntil, scenario } from "./helpers";

const raw = (name: string, typeLine: string, oracleText: string, keywords: string[], manaCost = "{3}{W}"): RawCard => ({
  name,
  number: "1",
  rarity: "common",
  manaCost,
  cmc: 4,
  typeLine,
  oracleText,
  power: "3",
  toughness: "3",
  colors: ["W"],
  keywords,
  image: "",
  artCrop: "",
  legalities: { standard: "legal" },
});

const resolution = (controller: string, source?: { id: string; defId: string }) => ({
  item: { id: "x", controller, sourceId: source?.id ?? "none", sourceDefId: source?.defId ?? "none", targets: {} },
  controller,
  targets: {},
  vars: {},
  pc: 0,
});

describe("#8: 704.5b, only a draw that was impossible since the last check makes you lose", () => {
  it("Herald of Eternal Dawn leaves the game long after the impossible draw: no loss", () => {
    let s = scenario({ p1: { battlefield: ["Herald of Eternal Dawn"], library: [] }, step: "upkeep" });
    s = passUntil(s, (x) => x.turn.step === "main1");
    expect(s.players.p1?.lost).toBe(false);
    destroy(s, idOf(s, "p1", "battlefield", "Herald of Eternal Dawn"));
    s = passUntil(s, (x) => !!x.players.p1?.lost || x.turn.step !== "main1");
    expect(s.players.p1?.lost).toBe(false);
  });

  it("without Herald, the impossible draw makes you lose, announced as such; poison is announced as poison", () => {
    const events: GameEvent[] = [];
    let s = scenario({ p1: { library: [] }, step: "upkeep" });
    s = passUntil(s, (x) => x.over);
    expect(s.winner).toBe("p2");
    const poisoned = scenario({});
    const p2 = poisoned.players.p2;
    if (p2) p2.counters = { ...p2.counters, poison: 10 };
    const r = submit(poisoned, "p1", { type: "pass" });
    events.push(...r.events);
    expect(events.find((e) => e.type === "lose")).toMatchObject({ player: "p2", reason: "poison" });
  });
});

describe("#9: the shared second doesn't prevent special actions (702.61b)", () => {
  const disguised = toCardDef(
    raw("Disguised Spy", "Creature — Human Rogue", "Flying\nDisguise {1}{W}", ["Flying", "Disguise"]),
    {},
    "TST",
  );
  it("with a Samut instant on the stack, you can turn a card face up, not cast a spell", () => {
    let s = scenario({
      p1: { battlefield: ["Plains", "Plains", "Plains", "Plains", "Plains"], hand: [disguised, "Giant Growth"] },
      p2: { battlefield: ["Samut, Tyrant of Naktamun", "Mountain", "Mountain"], hand: ["Lightning Strike"] },
    });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", disguised.name), faceDown: true });
    s = passBoth(s);
    const hidden = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    s = act(s, "p1", { type: "pass" });
    s = act(s, "p2", { type: "cast", card: idOf(s, "p2", "hand", "Lightning Strike"), targets: { t: ["p1"] } });
    s = act(s, "p2", { type: "pass" });
    const options = legalActions(s, "p1");
    const up = options.find((a) => a.type === "activate" && a.source === hidden);
    expect(up).toBeDefined();
    expect(options.some((a) => a.type === "cast")).toBe(false);
    s = act(s, "p1", { type: "activate", source: hidden, ability: up?.type === "activate" ? up.ability : -1 });
    expect(s.objects[hidden]?.defId).not.toBe(FACE_DOWN_ID);
  });
});

describe('#10: winning or losing the game by an effect respects "can\'t lose"', () => {
  it('an opponent with Herald of Eternal Dawn: "you win the game" does nothing; "you lose" doesn\'t either for them', () => {
    const s = scenario({ p2: { battlefield: ["Herald of Eternal Dawn"] } });
    runEffect(s, resolution("p1") as never, fx.winGame);
    expect(s.over).toBe(false);
    runEffect(s, resolution("p2") as never, fx.loseGame);
    expect(s.players.p2?.lost).toBe(false);
    runEffect(s, resolution("p1") as never, fx.loseGame);
    expect(s.winner).toBe("p2");
  });
});

describe("#11: protection from everything doesn't prevent damage that can't be prevented", () => {
  it("Progenitus takes the damage when it can't be prevented (Sunspine Lynx)", () => {
    const s = scenario({ p1: { battlefield: ["Sunspine Lynx"] }, p2: { battlefield: ["Progenitus"] } });
    const progenitus = idOf(s, "p2", "battlefield", "Progenitus");
    const lynx = idOf(s, "p1", "battlefield", "Sunspine Lynx");
    const source = { id: lynx, defId: s.objects[lynx]?.defId as string };
    const r = { ...resolution("p1", source), targets: { t: [progenitus] } };
    runEffect(s, r as never, fx.damage(3, ref.target()));
    expect(s.objects[progenitus]?.damage).toBe(3);
  });
});

describe("#16: 506.4, a permanent that stops being a creature leaves combat", () => {
  it("an attacker that became a plain artifact doesn't damage the defending player", () => {
    let s = scenario({ p1: { battlefield: ["Bear Cub"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    addEffect(s, [bear], { setTypes: ["Artifact"] }, "endOfTurn");
    s = passUntil(s, (x: GameState) => x.turn.step === "main2");
    expect(s.combat?.attackers.some((a) => a.id === bear) ?? false).toBe(false);
    expect(s.players.p2?.life).toBe(20);
  });
});

describe("N2: counters put as a cost aren't doubled by Doubling Season", () => {
  it("Ajani's +1: one more loyalty counter (cost), two +1/+1 on the creature (effect)", () => {
    let s = scenario({ p1: { battlefield: ["Ajani, Caller of the Pride", "Doubling Season", "Bear Cub"] } });
    const ajani = idOf(s, "p1", "battlefield", "Ajani, Caller of the Pride");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const before = s.objects[ajani]?.counters.loyalty ?? 0;
    s = act(s, "p1", { type: "activate", source: ajani, ability: 0, targets: { t: [bear] } });
    expect(s.objects[ajani]?.counters.loyalty).toBe(before + 1);
    s = passBoth(s);
    expect(s.objects[bear]?.counters["+1/+1"]).toBe(2);
  });
});

describe("#3: a requirement to attack doesn't force paying an attack tax (508.1d)", () => {
  it("Juggernaut facing Archangel of Tithes: not attacking is accepted, with or without mana; autopilot doesn't attack", () => {
    for (const lands of [[], ["Plains"]]) {
      let s = scenario({ p1: { battlefield: ["Juggernaut", ...lands] }, p2: { battlefield: ["Archangel of Tithes"] } });
      s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
      expect(forcedAttacks(s, "p1")).toEqual([]);
      s = act(s, "p1", { type: "declareAttackers", attackers: [] });
      expect(s.combat?.attackers ?? []).toEqual([]);
    }
  });

  it("without a tax, Juggernaut must still attack", () => {
    let s = scenario({ p1: { battlefield: ["Juggernaut"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    expect(() => act(s, "p1", { type: "declareAttackers", attackers: [] })).toThrow(/must attack/);
    expect(forcedAttacks(s, "p1")).toEqual([{ id: idOf(s, "p1", "battlefield", "Juggernaut"), defender: "p2" }]);
  });
});

describe("N3: attack taxes add up", () => {
  it("deux Archangel of Tithes : {2} par attaquant", () => {
    let s = scenario({
      p1: { battlefield: ["Bear Cub", "Forest", "Forest"] },
      p2: { battlefield: ["Archangel of Tithes", "Archangel of Tithes"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    expect(
      s.battlefield.filter((id) => s.objects[id]?.tapped && s.defs[s.objects[id]?.defId ?? ""]?.name === "Forest"),
    ).toHaveLength(2);
  });
});

describe("#5: a spell cast without paying its cost still pays the increases (601.2f, 118.9d)", () => {
  it("Lightning Strike for free facing Thalia, the Survivor costs {1}", () => {
    const s = scenario({ p2: { battlefield: ["Thalia, the Survivor"] } });
    const cost = spellCost(s, "p1", card("Lightning Strike"), { free: true });
    expect(cost.generic).toBe(1);
    expect(Object.values(cost.colored).every((n) => !n)).toBe(true);
  });
});

describe("#1: cleanup step, state-based actions and priority (514.3a)", () => {
  /** A 2/2 creature with two -1/-1 counters, kept alive by Giant Growth until end of turn. */
  function pumped(extra: (string | CardDef)[] = []) {
    let s = scenario({ p1: { battlefield: ["Forest", ...extra], hand: ["Giant Growth"] } });
    const first = extra[0];
    const bear = first ? idOf(s, "p1", "battlefield", typeof first === "string" ? first : first.name) : "";
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", "Giant Growth"), targets: { t: [bear] } });
    s = passBoth(s);
    const o = s.objects[bear];
    if (o) changeCounters(s, o, "-1/-1", 2);
    bump(s);
    return { s, bear };
  }

  it("the creature dies during the cleanup of the same turn, not at the next upkeep", () => {
    const { s: s0, bear } = pumped(["Bear Cub"]);
    let s = s0;
    let diedAt: [number, string] | null = null;
    for (let i = 0; i < 300 && !diedAt; i++) {
      const next = advanceUntil(s, (x) => x !== s, 1);
      if (next === s) break;
      s = next;
      if (!s.battlefield.includes(bear)) diedAt = [s.turn.number, s.turn.step];
    }
    expect(diedAt).toEqual([3, "cleanup"]);
  });

  it('its "when it dies" trigger resolves during cleanup, followed by a new cleanup', () => {
    const mourner = customCard({
      name: "Pleureur",
      power: 2,
      toughness: 2,
      abilities: [triggered(when.dies({ self: true }), [fx.gainLife(3)], { label: "3 PV" })],
    });
    const { s: s0 } = pumped([mourner]);
    const s = advanceUntil(s0, (x) => x.turn.number === 4 || x.players.p1?.life === 23);
    expect(s.players.p1?.life).toBe(23);
    expect(s.turn).toMatchObject({ number: 3, step: "cleanup" });
    const next = advanceUntil(s, (x) => x.turn.number === 4);
    expect(next.turn.number).toBe(4);
    expect(next.turn.cleanupAgain).toBeFalsy();
  });

  it("with nothing to do, no priority during cleanup", () => {
    let s = scenario({ step: "end" });
    s = advanceUntil(s, (x) => x.turn.number === 4 || (x.turn.step === "cleanup" && x.pending?.kind === "priority"));
    expect(s.turn.number).toBe(4);
  });
});

describe("#2: lifelink, one life gain per source and per batch of damage (119.9, 120.3f)", () => {
  const lifelinker = (name: string, keywords: CardDef["keywords"]) =>
    customCard({ name, power: 5, toughness: 5, keywords: ["lifelink", ...keywords] });

  function combat(attackers: CardDef[], blockers: string[]) {
    let s = scenario({ p1: { battlefield: ["Ajani's Pridemate", ...attackers] }, p2: { battlefield: blockers } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const ids = attackers.map((a) => idOf(s, "p1", "battlefield", a.name));
    s = act(s, "p1", { type: "declareAttackers", attackers: ids.map((id) => ({ id, defender: "p2" })) });
    if (blockers.length) {
      s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
      const blocker = idsOf(s, "p2", "battlefield", blockers[0] as string)[0] as string;
      s = act(s, "p2", { type: "declareBlockers", blocks: [{ blocker, attacker: ids[0] as string }] });
    }
    s = advanceUntil(s, (x) => x.turn.step === "main2");
    return { s, pridemate: idOf(s, "p1", "battlefield", "Ajani's Pridemate") };
  }

  it("a 5/5 trampler blocked by a 2/2: 5 life in a single gain", () => {
    const { s, pridemate } = combat([lifelinker("Trampler", ["trample"])], ["Bear Cub"]);
    expect(s.players.p1?.life).toBe(25);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(1);
  });

  it("two attackers with lifelink: two gains", () => {
    const { s, pridemate } = combat([lifelinker("Lien A", []), lifelinker("Lien B", [])], []);
    expect(s.players.p1?.life).toBe(30);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(2);
  });

  it("double strike: one gain per damage step", () => {
    const { s, pridemate } = combat([lifelinker("Double", ["doubleStrike"])], []);
    expect(s.players.p1?.life).toBe(30);
    expect(s.objects[pridemate]?.counters["+1/+1"]).toBe(2);
  });
});

describe("#6: permanents that enter at the same time see each other enter (603.6a)", () => {
  const WATCHER: TokenSpec = {
    name: "Guetteur",
    colors: ["W"],
    types: ["Creature"],
    subtypes: ["Spirit"],
    power: 1,
    toughness: 1,
    abilities: [triggered(when.enters({ types: ["Creature"], other: true }), [fx.gainLife(1)], { label: "1 PV" })],
  };

  it("two tokens created together: each sees the other enter (two triggers)", () => {
    const s = scenario({});
    simultaneously(s, () => runEffect(s, resolution("p1") as never, fx.createTokens(WATCHER, 2)));
    expect(s.triggers.map((t) => t.sourceId).sort()).toEqual(s.battlefield.filter((id) => s.objects[id]?.isToken).sort());
  });

  it("a token that enters alone doesn't see itself", () => {
    const s = scenario({});
    simultaneously(s, () => runEffect(s, resolution("p1") as never, fx.createTokens(WATCHER, 1)));
    expect(s.triggers).toHaveLength(0);
  });
});

describe("N6: a single way to read player statics (condition checked, effects on the player included)", () => {
  const withAbility = (name: string, ab: CardDef["abilities"][number]) =>
    customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });

  it('a "this turn" effect that increases life gain applies', () => {
    const s = scenario({});
    runEffect(s, resolution("p1") as never, fx.thisTurn({ replacement: { event: "lifeGain", to: "you", modify: { add: 1 } } }));
    gainLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(23);
  });

  it("a player static with an unmet condition doesn't apply (delirium)", () => {
    const aura = withAbility(
      "Delirium Bonus",
      eventReplacement({ event: "lifeGain", to: "you", modify: { add: 5 }, condition: cond.delirium }),
    );
    const s = scenario({ p1: { battlefield: [aura] } });
    gainLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(22);
  });

  it("a counter doubler with an unmet condition doesn't double", () => {
    const season = withAbility(
      "Delirium Season",
      eventReplacement({ event: "counters", to: "yourSide", modify: { times: 2 }, condition: cond.delirium }),
    );
    const s = scenario({ p1: { battlefield: [season, "Bear Cub"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")];
    if (bear) changeCounters(s, bear, "+1/+1", 1);
    expect(bear?.counters["+1/+1"]).toBe(1);
  });
});

describe("#14 and #17: what accompanies an entry is in place before the enter event (614.1c, 614.12, 508.4)", () => {
  const zombieWatcher = customCard({
    name: "Guetteur de Zombies",
    power: 1,
    toughness: 1,
    abilities: [triggered(when.enters({ subtype: "Zombie" }), [fx.gainLife(2)], { label: "2 PV" })],
  });

  it('a creature put back "as a Zombie in addition" triggers "whenever a Zombie enters"', () => {
    const s = scenario({ p1: { battlefield: [zombieWatcher], graveyard: ["Bear Cub"] } });
    const bear = idOf(s, "p1", "graveyard", "Bear Cub");
    const r = { ...resolution("p1"), targets: { t: [bear] } };
    simultaneously(s, () =>
      runEffect(
        s,
        r as never,
        fx.moveTo(ref.target(), { to: "battlefield", addSubtypes: ["Zombie"], counters: { kind: "+1/+1", n: 1 } }),
      ),
    );
    expect(s.triggers.map((t) => s.defs[t.sourceDefId]?.name)).toContain("Guetteur de Zombies");
    const back = idOf(s, "p1", "battlefield", "Bear Cub");
    expect(s.objects[back]?.counters["+1/+1"]).toBe(1);
  });

  it('a token created tapped doesn\'t "become" tapped', () => {
    const tapWatcher: TokenSpec = {
      name: "Sentinelle",
      colors: ["W"],
      types: ["Creature"],
      subtypes: ["Soldier"],
      power: 1,
      toughness: 1,
      abilities: [triggered(when.tapsSelf, [fx.gainLife(1)], { label: "1 PV" })],
    };
    const s = scenario({});
    simultaneously(s, () =>
      runEffect(s, resolution("p1") as never, { op: "createTokens", token: tapWatcher, count: 1, tapped: true }),
    );
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(s.objects[token]?.tapped).toBe(true);
    expect(s.triggers).toHaveLength(0);
  });

  it('with several opponents, the controller chooses what the "tapped and attacking" tokens attack', () => {
    let s = scenario({ players: 3, p1: { battlefield: ["Bear Cub"] } });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", { type: "declareAttackers", attackers: [{ id: bear, defender: "p2" }] });
    const soldier: TokenSpec = {
      name: "Soldat",
      colors: ["W"],
      types: ["Creature"],
      subtypes: ["Soldier"],
      power: 1,
      toughness: 1,
    };
    const r = { ...resolution("p1", { id: bear, defId: s.objects[bear]?.defId as string }), vars: {} as Record<string, unknown> };
    const effect = { op: "createTokens", token: soldier, count: 1, tapped: true, attacking: true } as const;
    const asked = runEffect(s, r as never, effect as never) as {
      ask?: { key: string; request: { options: string[]; suggested: string[] } };
    };
    expect(asked?.ask?.request.options.sort()).toEqual(["p2", "p3"]);
    expect(asked?.ask?.request.suggested).toEqual(["p2"]);
    r.vars[asked?.ask?.key ?? ""] = ["p3"];
    runEffect(s, r as never, effect as never);
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(s.combat?.attackers.find((a) => a.id === token)?.defender).toBe("p3");
  });
});

describe("N7, N8, N9, #13: permanent copies", () => {
  const CLONE = customCard({ name: "Clone de test", power: 0, toughness: 0, asEnters: [fx.chooseCopy({})] });

  /** A Clone that enters copies Ajani, Caller of the Pride (planeswalker with 4 loyalty counters, mana value 3). */
  function cloneOfAjani() {
    const s = scenario({ p1: { hand: [CLONE] }, p2: { battlefield: ["Ajani, Caller of the Pride"] } });
    const ajani = idOf(s, "p2", "battlefield", "Ajani, Caller of the Pride");
    const inHand = idOf(s, "p1", "hand", CLONE.name);
    const clone = moveObject(s, inHand, "battlefield", { enters: { copyOf: s.objects[ajani]?.defId } }) as string;
    return { s, ajani, clone };
  }

  it("N7: a Clone that copies a planeswalker enters with its loyalty", () => {
    const { s, ajani, clone } = cloneOfAjani();
    expect(s.objects[clone]?.counters.loyalty).toBe(s.defs[s.objects[ajani]?.defId ?? ""]?.loyalty);
    expect(chars(s, clone).types).toContain("Planeswalker");
  });

  it("#13: the mana value seen by filters is that of what is copied", () => {
    const { s, ajani, clone } = cloneOfAjani();
    expect(snapshot(s, clone).manaValue).toBe(snapshot(s, ajani).manaValue);
    expect(snapshot(s, clone).manaValue).toBeGreaterThan(0);
  });

  it('N8: the token copy of a Clone copies what it copies, and a token created tapped doesn\'t "become" tapped', () => {
    const { s, clone } = cloneOfAjani();
    const r = { ...resolution("p1"), targets: { t: [clone] } };
    runEffect(s, r as never, fx.copyToken(ref.target()));
    const token = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, token).name).toBe("Ajani, Caller of the Pride");
  });

  it("N9: Assimilation Aegis, the equipped creature becomes a copy of the exiled card", () => {
    const s = scenario({ p1: { battlefield: ["Assimilation Aegis", "Bear Cub"] }, p2: { graveyard: ["Shivan Dragon"] } });
    const aegis = idOf(s, "p1", "battlefield", "Assimilation Aegis");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const dragon = moveObject(s, idOf(s, "p2", "graveyard", "Shivan Dragon"), "exile") as string;
    s.linkedExile.push({ sourceId: aegis, cards: [dragon] });
    const o = s.objects[aegis];
    if (o) o.attachedTo = bear;
    bump(s);
    expect(chars(s, bear).name).toBe("Shivan Dragon");
    expect(chars(s, bear).power).toBe(5);
  });
});

describe("#7 and 303.4f: choosing a permanent that enters without being cast", () => {
  const CLONE = customCard({
    name: "Reanimated Clone",
    power: 0,
    toughness: 0,
    asEnters: [fx.chooseCopy({ types: ["Creature"] }, { anyController: true })],
  });
  type Asked = { ask?: { key: string; request: { options: string[] } } };

  it("#7: a Clone reanimated during a resolution asks what it copies, then enters as that copy", () => {
    const s = scenario({ p1: { graveyard: [CLONE] }, p2: { battlefield: ["Bear Cub", "Shivan Dragon"] } });
    const clone = idOf(s, "p1", "graveyard", CLONE.name);
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const r = { ...resolution("p1"), targets: { t: [clone] }, vars: {} as Record<string, unknown> };
    const effect = fx.moveTo(ref.target(), { to: "battlefield" });
    const asked = runEffect(s, r as never, effect) as Asked;
    expect(asked.ask?.request.options).toContain(dragon);
    r.vars[asked.ask?.key ?? ""] = [dragon];
    runEffect(s, r as never, effect);
    const back = idOf(s, "p1", "battlefield", CLONE.name);
    expect(chars(s, back).name).toBe("Shivan Dragon");
  });

  it("#7: outside a resolution, it automatically copies the first possible permanent", () => {
    const s = scenario({ p1: { graveyard: [CLONE] }, p2: { battlefield: ["Shivan Dragon"] } });
    const id = moveObject(s, idOf(s, "p1", "graveyard", CLONE.name), "battlefield") as string;
    expect(chars(s, id).name).toBe("Shivan Dragon");
  });

  it("303.4f: a reanimated Aura asks what it enchants", () => {
    const s = scenario({ p1: { graveyard: ["Pacifism"] }, p2: { battlefield: ["Bear Cub", "Shivan Dragon"] } });
    const aura = idOf(s, "p1", "graveyard", "Pacifism");
    const dragon = idOf(s, "p2", "battlefield", "Shivan Dragon");
    const r = { ...resolution("p1"), targets: { t: [aura] }, vars: {} as Record<string, unknown> };
    const effect = fx.moveTo(ref.target(), { to: "battlefield" });
    const asked = runEffect(s, r as never, effect) as Asked;
    expect(asked.ask?.request.options).toHaveLength(2);
    r.vars[asked.ask?.key ?? ""] = [dragon];
    runEffect(s, r as never, effect);
    const placed = idOf(s, "p1", "battlefield", "Pacifism");
    expect(s.objects[placed]?.attachedTo).toBe(dragon);
  });

  it("303.4g: with nothing to enchant, the Aura stays in the graveyard", () => {
    const s = scenario({ p1: { graveyard: ["Pacifism"] } });
    const aura = idOf(s, "p1", "graveyard", "Pacifism");
    expect(moveObject(s, aura, "battlefield")).toBeNull();
    expect(s.objects[aura]?.zone).toBe("graveyard");
  });
});

describe("R1: order of replacements that modify a number (616.1)", () => {
  const ench = (name: string, ab: CardDef["abilities"][number]) =>
    customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });

  it("chooseReplacementOrder: the affected player gets the most favorable order", () => {
    expect(chooseReplacementOrder(3, [{ add: 2 }, { times: 2 }], "min")).toBe(8);
    expect(chooseReplacementOrder(3, [{ add: 2 }, { times: 2 }], "max")).toBe(10);
    expect(chooseReplacementOrder(0, [{ add: 2 }], "max")).toBe(0);
    expect(chooseReplacementOrder(1, [{ atLeast: 4 }, { times: 2 }], "min")).toBe(4);
  });

  it("Artist's Talent (+2) and Twinflame Tyrant (×2): 3 damage to the opponent becomes 8, not 10", () => {
    const talent = ench(
      "Talent",
      eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", combat: false, modify: { add: 2 } }),
    );
    const tyrant = ench(
      "Tyran",
      eventReplacement({ event: "damage", source: { controller: "you" }, to: "opponentSide", modify: { times: 2 } }),
    );
    const s = scenario({ p1: { battlefield: [talent, tyrant, "Bear Cub"] } });
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    const r = { ...resolution("p1", { id: bear, defId: s.objects[bear]?.defId as string }), targets: { t: ["p2"] } };
    runEffect(s, r as never, fx.damage(3, ref.target()));
    expect(s.players.p2?.life).toBe(12);
  });

  it("Yoshimaru (+1) and Doubling Season (×2): one +1/+1 counter becomes four", () => {
    const yoshimaru = ench(
      "Yoshimaru",
      eventReplacement({ event: "counters", to: "yourSide", counter: "+1/+1", modify: { add: 1 } }),
    );
    const season = ench("Saison", eventReplacement({ event: "counters", to: "yourSide", modify: { times: 2 } }));
    const s = scenario({ p1: { battlefield: [yoshimaru, season, "Bear Cub"] } });
    const bear = s.objects[idOf(s, "p1", "battlefield", "Bear Cub")];
    if (bear) changeCounters(s, bear, "+1/+1", 1);
    expect(bear?.counters["+1/+1"]).toBe(4);
  });

  it('life gain: "that much plus 1" then the double', () => {
    const angel = ench("Ange", eventReplacement({ event: "lifeGain", to: "you", modify: { add: 1 } }));
    const crystal = ench("Cristal", eventReplacement({ event: "lifeGain", to: "you", modify: { times: 2 } }));
    const s = scenario({ p1: { battlefield: [angel, crystal] } });
    gainLife(s, "p1", 2);
    expect(s.players.p1?.life).toBe(26);
  });

  it("N12: drawing for a gift also goes through replacements; two Vnwxt stack", () => {
    const vnwxt = ench("Vnwxt", eventReplacement({ event: "draw", to: "you", modify: { times: 2 } }));
    const s = scenario({ p2: { battlefield: [vnwxt, vnwxt], hand: ["Forest", "Forest", "Forest"] } });
    const before = s.players.p2?.hand.length ?? 0;
    runEffect(s, resolution("p1") as never, { op: "gift", kind: "card" } as never);
    expect((s.players.p2?.hand.length ?? 0) - before).toBe(4);
  });
});

describe("#4 and N11: spell copies, new targets and object on the stack (707.10, 707.10c)", () => {
  const choose = (s: GameState, values: (string | number)[]) => act(s, s.pending?.player ?? "p1", { type: "choose", values });
  const strike = (s: GameState, target: string) =>
    act(s, "p1", { type: "cast", card: idsOf(s, "p1", "hand", "Lightning Strike")[0] as string, targets: { t: [target] } });

  /** Thousand-Year Storm: the second Lightning Strike each turn is copied once. */
  function stormCopy(p2: string[]) {
    let s = scenario({
      p1: {
        battlefield: ["Thousand-Year Storm", "Mountain", "Mountain", "Mountain", "Mountain"],
        hand: ["Lightning Strike", "Lightning Strike"],
      },
      p2: { battlefield: p2 },
    });
    s = passBoth(strike(s, "p2"));
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    s = strike(s, elves);
    // Thousand-Year Storm's trigger resolves: the copy is put on the stack, its targets are to be chosen.
    s = passUntil(s, (x) => x.pending?.kind === "choice");
    return { s, elves };
  }

  it("the copy offers the original targets and accepts a new target", () => {
    const { s: s0, elves } = stormCopy(["Llanowar Elves", "Pelakka Wurm"]);
    const req = s0.pending?.kind === "choice" ? s0.pending.request : undefined;
    expect(req?.intent).toBe("changeTarget");
    expect(req?.suggested).toEqual([elves]);
    const copy = s0.stack[s0.stack.length - 1];
    expect(copy?.copy).toBe(true);
    // N11: the copy is an object on the stack (with no card), which a \"counter target spell\" can target.
    expect(s0.objects[copy?.id ?? ""]?.zone).toBe("stack");
    let s = choose(s0, ["p2"]);
    expect(s.stack[s.stack.length - 1]?.targets.t).toEqual(["p2"]);
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.players.p2?.life).toBe(20 - 3 - 3);
    expect(idsOf(s, "p2", "graveyard", "Llanowar Elves")).toHaveLength(1);
    // The copy ceased to exist when it left the stack.
    expect(s.objects[copy?.id ?? ""]).toBeUndefined();
  });

  it("the target chosen for the copy becomes its target: ward triggers", () => {
    const { s: s0 } = stormCopy(["Llanowar Elves", "Zul Ashur, Lich Lord"]);
    const zul = idOf(s0, "p2", "battlefield", "Zul Ashur, Lich Lord");
    const s = choose(s0, [zul]);
    const top = s.stack[s.stack.length - 1];
    expect(top?.kind).toBe("ability");
    expect(s.defs[top?.sourceDefId ?? ""]?.name).toBe("Zul Ashur, Lich Lord");
  });

  it("a copy isn't cast: \"whenever you cast a spell that targets\" doesn't trigger for it", () => {
    const heroic = customCard({
      name: "Test Hero",
      power: 1,
      toughness: 1,
      abilities: [triggered(when.targetedBySpellYouCast, [fx.draw(1)], { label: "piochez" })],
    });
    let s = scenario({
      p1: {
        battlefield: ["Thousand-Year Storm", heroic, "Mountain", "Forest", "Forest", "Forest"],
        hand: ["Giant Growth", "Giant Growth"],
        library: ["Forest", "Forest", "Forest", "Forest"],
      },
    });
    const hero = idOf(s, "p1", "battlefield", heroic.name);
    const growth = () => idsOf(s, "p1", "hand", "Giant Growth")[0] as string;
    const empty = (x: GameState) => x.stack.length === 0 && x.pending?.kind === "priority";
    s = passAccepting(act(s, "p1", { type: "cast", card: growth(), targets: { t: [hero] } }), empty);
    s = passAccepting(act(s, "p1", { type: "cast", card: growth(), targets: { t: [hero] } }), empty);
    // Two cast spells that target the hero: two draws; the copy gives none.
    expect(s.players.p1?.library).toHaveLength(2);
    // Two Giant Growths and the copy: +9.
    expect(chars(s, hero).power).toBe(10);
  });
});

describe("#15: division announced when put on the stack; the share of a target that became illegal is lost (601.2d, 608.2b)", () => {
  it("Chandra, Flameshaper −4: 4 and 4; one of the targets disappears, the other receives only its 4", () => {
    let s = scenario({ p1: { battlefield: ["Chandra, Flameshaper"] }, p2: { battlefield: ["Pelakka Wurm", "Llanowar Elves"] } });
    const chandra = idOf(s, "p1", "battlefield", "Chandra, Flameshaper");
    (s.objects[chandra] as { counters: Record<string, number> }).counters.loyalty = 6;
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    const elves = idOf(s, "p2", "battlefield", "Llanowar Elves");
    const a = legalActions(s, "p1").find(
      (x) => x.type === "activate" && x.source === chandra && plainText(x.label ?? "").startsWith("−4"),
    );
    if (a?.type !== "activate") throw new Error("ability −4 unavailable");
    s = act(s, "p1", { type: "activate", source: chandra, ability: a.ability, targets: { t: [wurm, elves] } });
    expect(s.pending?.kind === "choice" && s.pending.request.type).toBe("divide");
    s = act(s, "p1", { type: "choose", values: [4, 4] });
    destroy(s, elves);
    s = passUntil(s, (x) => x.stack.length === 0);
    expect(s.objects[wurm]?.damage).toBe(4);
    expect(idsOf(s, "p2", "battlefield", "Pelakka Wurm")).toHaveLength(1);
  });
});

describe("#12, N10 and 800.4a: control is a layer (613.1b, 613.7)", () => {
  const steal = (s: GameState, id: string, to: string, e: Effect) =>
    runEffect(s, { ...resolution(to), targets: { t: [id] } } as never, e);

  it("N10: stolen then taken back in the same turn, the permanent returns to its base controller at end of turn", () => {
    let s = scenario({ p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    steal(s, wurm, "p1", fx.gainControl(ref.target()));
    expect(s.objects[wurm]?.controller).toBe("p1");
    steal(s, wurm, "p2", fx.gainControl(ref.target()));
    expect(s.objects[wurm]?.controller).toBe("p2");
    s = passUntil(s, (x) => x.turn.number === 4);
    expect(s.objects[wurm]?.controller).toBe("p2");
  });

  it('#12: a more recent permanent gift survives the end of an "until end of turn" steal', () => {
    let s = scenario({ p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    steal(s, wurm, "p1", fx.gainControl(ref.target()));
    runEffect(s, { ...resolution("p2"), targets: { t: [wurm] } } as never, fx.giveControl(ref.target(), ref.you));
    runEffect(s, { ...resolution("p2"), targets: { t: [wurm] } } as never, fx.giveControl(ref.target(), ref.eachOpponent));
    expect(s.objects[wurm]?.controller).toBe("p1");
    s = passUntil(s, (x) => x.turn.number === 4);
    // The old code gave the permanent back to the controller remembered at the time of the steal (p2).
    expect(s.objects[wurm]?.controller).toBe("p1");
  });

  it("Confiscate: control follows the Aura and returns when it leaves", () => {
    const s = scenario({ p1: { hand: ["Confiscate"] }, p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    const aura = moveObject(s, idOf(s, "p1", "hand", "Confiscate"), "battlefield", { enters: { attachTo: wurm } }) as string;
    syncControl(s);
    expect(s.objects[wurm]?.controller).toBe("p1");
    destroy(s, aura);
    syncControl(s);
    expect(s.objects[wurm]?.controller).toBe("p2");
    expect(syncControl(s)).toBe(false);
  });

  it("800.4a: when the thief leaves the game, the permanent returns to its controller instead of being exiled", () => {
    const s = scenario({ players: 3, p2: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p2", "battlefield", "Pelakka Wurm");
    runEffect(s, { ...resolution("p3"), targets: { t: [wurm] } } as never, fx.giveControl(ref.target(), ref.you));
    expect(s.objects[wurm]?.controller).toBe("p3");
    eliminate(s, ["p3"]);
    expect(s.objects[wurm]?.zone).toBe("battlefield");
    expect(s.objects[wurm]?.controller).toBe("p2");
  });
});

describe("R2.5: layers, copy exceptions, added colors and dependencies (707.9b, 105.3, 613.8)", () => {
  it('707.9b: the copy of a token "except it\'s a 1/1 red Balloon" keeps those exceptions', () => {
    const s = scenario({ p1: { battlefield: ["Pelakka Wurm"] } });
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const balloon = fx.copyToken(ref.target(), { pt: 1, addColors: ["R"], addSubtypes: ["Balloon"], addKeywords: ["flying"] });
    runEffect(s, { ...resolution("p1"), targets: { t: [wurm] } } as never, balloon);
    const first = s.battlefield.find((id) => s.objects[id]?.isToken) as string;
    expect(chars(s, first)).toMatchObject({ power: 1, toughness: 1 });
    // 105.3: red in addition to its other colors.
    expect(chars(s, first).colors).toEqual(expect.arrayContaining(["G", "R"]));
    runEffect(s, { ...resolution("p1"), targets: { t: [first] } } as never, fx.copyToken(ref.target()));
    const second = s.battlefield.find((id) => s.objects[id]?.isToken && id !== first) as string;
    expect(chars(s, second)).toMatchObject({ name: "Pelakka Wurm", power: 1, toughness: 1 });
    expect(chars(s, second).subtypes).toContain("Balloon");
    expect(chars(s, second).keywords).toContain("flying");
    expect(chars(s, second).colors).toContain("R");
  });

  it('613.8: "for each" counts a permanent that got the type from an effect', () => {
    const counter = customCard({
      name: "Compteur de Dragons",
      power: 0,
      toughness: 1,
      abilities: [
        {
          kind: "static",
          affects: "self",
          mods: { power: 1 },
          per: { types: ["Creature"], subtype: "Dragon", controller: "you" },
        } as CardDef["abilities"][number],
      ],
    });
    const s = scenario({ p1: { battlefield: [counter, "Bear Cub"] } });
    const id = idOf(s, "p1", "battlefield", counter.name);
    expect(chars(s, id).power).toBe(0);
    runEffect(
      s,
      { ...resolution("p1"), targets: { t: [idOf(s, "p1", "battlefield", "Bear Cub")] } } as never,
      fx.modify(ref.target(), { addSubtypes: ["Dragon"] }, "permanent"),
    );
    expect(chars(s, id).power).toBe(1);
  });
});

describe("R4.1: block rules parameterized by a filter", () => {
  it("Stromkirk Noble can't be blocked by a creature that became a Human through an effect", () => {
    const s = scenario({ p1: { battlefield: ["Stromkirk Noble"] }, p2: { battlefield: ["Bear Cub"] }, step: "declareBlockers" });
    const noble = idOf(s, "p1", "battlefield", "Stromkirk Noble");
    const bear = idOf(s, "p2", "battlefield", "Bear Cub");
    s.combat = {
      attackers: [{ id: noble, defender: "p2", blockers: [], blocked: false }],
      blockers: [],
      blockQueue: [],
    } as never;
    bump(s);
    expect(canBlock(s, bear, noble)).toBe(true);
    runEffect(s, { ...resolution("p2"), targets: { t: [bear] } } as never, fx.modify(ref.target(), { addSubtypes: ["Human"] }));
    expect(canBlock(s, bear, noble)).toBe(false);
  });
});

describe('R4.2: protection and hexproof "from [filter]" (702.16, 702.11d)', () => {
  const warded = customCard({
    name: "Protected from Instants and Sorceries",
    power: 2,
    toughness: 2,
    abilities: [dsl.protectionAbility(dsl.protection.from({ types: ["Instant", "Sorcery"] }, "Protection"))],
  });

  it("neither targeted by an instant (even its own), nor damaged by a sorcery; targetable by an ability", () => {
    const s = scenario({ p1: { battlefield: [warded], hand: ["Lightning Strike"] } });
    const id = idOf(s, "p1", "battlefield", warded.name);
    const strike = idOf(s, "p1", "hand", "Lightning Strike");
    expect(legalTargets(s, "p1", { id: "t", filter: { objects: { types: ["Creature"] } } }, strike)).not.toContain(id);
    const sorcery = customCard({ name: "Rituel de test", types: ["Sorcery"], typeLine: "Sorcery" });
    s.defs[sorcery.id] = sorcery;
    dealDamage(s, { defId: sorcery.id, controller: "p2", keywords: [] }, id, 3, false);
    expect(s.objects[id]?.damage).toBe(0);
    dealDamage(s, { defId: warded.id, controller: "p2", keywords: [] }, id, 1, false);
    expect(s.objects[id]?.damage).toBe(1);
  });
});

describe("R5: simultaneous blocks in multiplayer (509.1)", () => {
  it("the first defender's blocks stay hidden until the last one's declaration", () => {
    let s = scenario({
      players: 3,
      p1: { battlefield: ["Pelakka Wurm", "Bear Cub"] },
      p2: { battlefield: ["Llanowar Elves"] },
      p3: { battlefield: ["Bear Cub"] },
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareAttackers");
    const wurm = idOf(s, "p1", "battlefield", "Pelakka Wurm");
    const bear = idOf(s, "p1", "battlefield", "Bear Cub");
    s = act(s, "p1", {
      type: "declareAttackers",
      attackers: [
        { id: wurm, defender: "p2" },
        { id: bear, defender: "p3" },
      ],
    });
    s = passUntil(s, (x) => x.pending?.kind === "declareBlockers");
    const first = s.pending?.player as string;
    const blocker = idOf(s, first as never, "battlefield", first === "p2" ? "Llanowar Elves" : "Bear Cub");
    s = act(s, first, { type: "declareBlockers", blocks: [{ blocker, attacker: first === "p2" ? wurm : bear }] });
    const second = s.pending?.player as string;
    expect(s.pending?.kind).toBe("declareBlockers");
    expect(second).not.toBe(first);
    expect(s.combat?.blockers).toEqual([]);
    expect(projectView(s, second).battlefield.find((o) => o.id === blocker)?.blocking).toBeFalsy();
    s = act(s, second, { type: "declareBlockers", blocks: [] });
    expect(s.combat?.blockers.map((b) => b.id)).toEqual([blocker]);
  });
});

describe("R6: mandatory action loop, drawn game (104.4b)", () => {
  it('"gain 1 life, lose 1 life" endlessly: the game is declared a draw', () => {
    const ench = (name: string, ab: CardDef["abilities"][number]) =>
      customCard({ name, types: ["Enchantment"], typeLine: "Enchantment", abilities: [ab] });
    const gain = ench("Gain", triggered(when.loseLife("you"), [fx.gainLife(1)], { label: "gain" }));
    const lose = ench("Perte", triggered(when.gainLife, [fx.loseLife(1)], { label: "perte" }));
    let s = scenario({ p1: { battlefield: [gain, lose] } });
    runEffect(s, resolution("p1") as never, fx.gainLife(1));
    s = passUntil(act(s, "p1", { type: "pass" }), (x) => x.over);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
  });
});

describe("R6: 800.4a, triggers of a player who leaves the game cease to exist", () => {
  it("a pending trigger of an eliminated player no longer blocks cleanup", () => {
    let s = scenario({ players: 3, step: "end" });
    s.triggers.push({
      id: "t-perdu",
      sourceId: "absent",
      sourceDefId: "absent",
      abilityIndex: 0,
      controller: "p3",
      targets: {},
      sourceSnapshot: { keywords: [], power: 0, controller: "p3" },
    } as never);
    eliminate(s, ["p3"]);
    expect(s.triggers).toEqual([]);
    s = passUntil(s, (x) => x.turn.number > 3);
    expect(s.turn.number).toBe(4);
  });
});
