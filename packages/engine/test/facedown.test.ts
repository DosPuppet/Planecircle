/**
 * Face-down cards (708): disguise, cloak, manifest dread; hidden information.
 */
import { type RawCard, toCardDef } from "@mtgx/cards";
import { describe, expect, it } from "vitest";
import { destroy } from "../src/actions";
import { castOption } from "../src/cardDef";
import { fx, triggered, when } from "../src/dsl";
import { runEffect } from "../src/effects";
import { legalActions } from "../src/legal";
import { chars, FACE_DOWN_ID } from "../src/state";
import type { GameState } from "../src/types";
import { projectView } from "../src/view";
import { act, idOf, passBoth, scenario } from "./helpers";

const DISGUISED = toCardDef(
  {
    name: "Disguised Spy",
    number: "1",
    rarity: "common",
    manaCost: "{3}{W}",
    cmc: 4,
    typeLine: "Creature — Human Rogue",
    oracleText: "Flying\nDisguise {1}{W}\nWhen this creature is turned face up, you gain 3 life.",
    power: "3",
    toughness: "3",
    colors: ["W"],
    keywords: ["Flying", "Disguise"],
    image: "",
    artCrop: "",
    legalities: { standard: "legal" },
  } satisfies RawCard,
  { abilities: [triggered(when.turnedFaceUp, [fx.gainLife(3)], { label: "3 PV" })] },
  "TST",
);

const resolution = (_s: GameState, controller: string) => ({
  item: { id: "x", controller, sourceId: "none", sourceDefId: "none", targets: {} },
  controller,
  targets: {},
  vars: {},
  pc: 0,
});

describe("disguise (702.168)", () => {
  it("cast face down for {3}: a nameless 2/2 creature with ward {2}; turned face up for its disguise cost", () => {
    expect(castOption(DISGUISED, "faceDown")).toBeDefined();
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Plains", "Plains", "Plains"], hand: [DISGUISED] } });
    const card = idOf(s, "p1", "hand", DISGUISED.name);
    const faceDownOption = legalActions(s, "p1").find((a) => a.type === "cast" && a.card === card && a.faceDown);
    expect(faceDownOption).toBeDefined();
    s = act(s, "p1", { type: "cast", card, faceDown: true });
    expect(s.stack[0]?.sourceDefId).toBe(FACE_DOWN_ID);
    s = passBoth(s);
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(s, id)).toMatchObject({ name: "", power: 2, toughness: 2, keywords: ["ward"] });
    // The opponent can't see the card; its controller can.
    const opp = projectView(s, "p2");
    expect(JSON.stringify(opp)).not.toContain(DISGUISED.id);
    const mine = projectView(s, "p1").battlefield.find((o) => o.id === id);
    expect(mine?.faceDownCard?.name).toBe(DISGUISED.name);
    // Turn face up: special action ({1}{W}), then "when it's turned face up".
    const up = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === id);
    expect(up?.type === "activate" && up.label).toBe("Turn face up");
    s = act(s, "p1", { type: "activate", source: id, ability: up?.type === "activate" ? up.ability : -1 });
    expect(chars(s, id).name).toBe(DISGUISED.name);
    expect(chars(s, id).power).toBe(3);
    s = passBoth(s);
    expect(s.players.p1?.life).toBe(23);
  });

  it("a face-down card that leaves the battlefield is revealed", () => {
    let s = scenario({ p1: { battlefield: ["Plains", "Plains", "Plains"], hand: [DISGUISED] } });
    s = act(s, "p1", { type: "cast", card: idOf(s, "p1", "hand", DISGUISED.name), faceDown: true });
    s = passBoth(s);
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    destroy(s, id);
    expect(idOf(s, "p1", "graveyard", DISGUISED.name)).toBeDefined();
  });
});

describe("manifest dread (701.62) and cloak (701.58)", () => {
  it("looks at the top two cards, manifests one, the other to the graveyard; a creature turns up for its cost", () => {
    const s = scenario({ p1: { battlefield: ["Forest", "Forest"], library: ["Bear Cub", "Forest", "Forest"] } });
    const r = resolution(s, "p1");
    const ask = runEffect(s, r as never, { op: "manifestDread" });
    expect(ask && "ask" in ask).toBe(true);
    const bear = s.players.p1?.library[0] as string;
    (r.vars as Record<string, unknown>)[`${r.pc}:dread0`] = [bear];
    runEffect(s, r as never, { op: "manifestDread" });
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(s, id).keywords).toEqual([]); // pas de garde
    expect(s.players.p1?.graveyard).toHaveLength(1);
    const up = legalActions(s, "p1").find((a) => a.type === "activate" && a.source === id);
    expect(up).toBeDefined(); // Bear Cub : {1}{G}
  });

  it("cloak: face down with ward {2}; a land can't be turned face up", () => {
    const s = scenario({ p1: { library: ["Forest"], battlefield: lands(5) } });
    const r = resolution(s, "p1");
    const top = s.players.p1?.library[0] as string;
    runEffect(s, r as never, fx.putFaceDown({ kind: "stored", name: "x" }, true));
    (r.vars as Record<string, unknown>)["$ids:x"] = [top];
    runEffect(s, r as never, fx.putFaceDown({ kind: "stored", name: "x" }, true));
    const id = s.battlefield.find((x) => s.objects[x]?.defId === FACE_DOWN_ID) as string;
    expect(chars(s, id).keywords).toEqual(["ward"]);
    expect(legalActions(s, "p1").some((a) => a.type === "activate" && a.source === id)).toBe(false);
  });
});

function lands(n: number): string[] {
  return Array(n).fill("Forest");
}
