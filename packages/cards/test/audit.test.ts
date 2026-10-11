/** Oracle ↔ script audit (`src/audit.ts`): no new gap, and the list of known gaps stays up to date. */

import { dsl } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { customCard } from "../../engine/test/helpers";
import baseline from "../data/audit-baseline.json";
import { auditCard, auditTargets, effectNumbers, issueKey, paragraphs, targetWords } from "../src/audit";
import { implementedCards } from "../src/index";

describe("audit Oracle ↔ script", () => {
  it("splits the Oracle text into classified paragraphs", () => {
    const kinds = (text: string, spell = false) => paragraphs(text, spell).map((p) => p.kind);
    expect(kinds("Flying, vigilance\nWhenever this creature attacks, draw a card.\n{2}, {T}: Add {G}.")).toEqual([
      "keywords",
      "triggered",
      "activated",
    ]);
    // Reminder text and ability word removed; quoted ability: static.
    expect(kinds("Landfall — Whenever a land you control enters, you gain 1 life.")).toEqual(["triggered"]);
    expect(kinds('Enchanted land has "{T}: Add {C}."')).toEqual(["static"]);
    // A sorcery doesn't describe a triggered ability.
    expect(kinds("When you next cast an instant spell this turn, copy it.", true)).toEqual(["spell"]);
    expect(kinds("+1: Draw a card.\n−3: Destroy target creature.")).toEqual(["activated", "activated"]);
    // Ability words with a number or punctuation (Descend 4, "No One Dies!"): the ability stays triggered.
    expect(
      kinds("Descend 4 — When this creature enters, if there are four or more permanent cards in your graveyard, draw a card."),
    ).toEqual(["triggered"]);
    expect(kinds("No One Dies! — When Spider-Man enters, you may tap him.")).toEqual(["triggered"]);
    // The modes belong to the paragraph that introduces them.
    expect(kinds("When this creature enters, choose one —\n• Draw a card.\n• Scry 2.")).toEqual(["triggered", "mode", "mode"]);
    expect(kinds("Firebending 2\nBasic landcycling {2}")).toEqual(["keywords", "keywords"]);
  });

  it("counts the statics carried by the script (abilities, fields, distinct effects of an ability)", () => {
    const base = implementedCards().find((c) => c.name === "Frenzied Baloth");
    expect(base && auditCard(base).filter((i) => i.kind === "static")).toEqual([]);
    if (!base) return;
    // Without its "can't be countered" field, a static of the text is no longer carried.
    const stripped = { ...base, rules: { ...base.rules, cantBeCountered: undefined } };
    expect(auditCard(stripped as typeof base).map((i) => i.kind)).toContain("static");
  });

  it('spots a spell whose targets don\'t follow the text (targeted "each opponent", forgotten target)', () => {
    const sort = (text: string, targets: number) =>
      customCard({
        name: "Sort d'essai",
        typeLine: "Sorcery",
        types: ["Sorcery"],
        text,
        spell: dsl.spell(
          Array.from({ length: targets }, (_, i) => dsl.target.creature(`t${i}`)),
          [],
        ),
      });
    expect(targetWords("Change the target of target spell or ability with a single target.")).toBe(1);
    expect(targetWords("Earthbend 2. (Target land you control becomes a 0/0 creature.)")).toBe(1);
    expect(auditTargets(sort("Each opponent loses 2 life.", 1)).map((i) => i.kind)).toEqual(["target"]);
    expect(auditTargets(sort("Destroy target creature. Draw a card.", 0)).map((i) => i.kind)).toEqual(["target"]);
    expect(auditTargets(sort("Destroy target creature. Draw a card.", 1))).toEqual([]);
  });

  it("spots effect numbers", () => {
    expect(effectNumbers("It deals 3 damage to any target. Draw two cards.")).toEqual([3, 2]);
    expect(effectNumbers("Put two +1/+1 counters on target creature.")).toEqual([2]);
    expect(effectNumbers("Target creature gets +3/+0 until end of turn.")).toEqual([3]);
  });

  it("no handled card has a gap outside the list of known gaps (data/audit-baseline.json)", () => {
    const known = baseline as Record<string, string>;
    const found = implementedCards()
      .filter((c) => !c.isToken)
      .flatMap(auditCard)
      .map(issueKey);
    expect(found.filter((k) => !(k in known))).toEqual([]);
    // A fixed gap must leave the list.
    expect(Object.keys(known).filter((k) => !found.includes(k))).toEqual([]);
  });
});
