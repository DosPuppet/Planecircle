/** Glossary: the words found in rules texts, in both languages, and every form checked against the catalog's texts. */
import { CARDS } from "@mtgx/cards";
import type { CardDef } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { GLOSSARY, type GlossaryEntry, glossaryForKeyword } from "../src/glossary/entries";
import { entryForms, splitTerms, termsIn } from "../src/glossary/match";
import { KEYWORD_LABEL } from "../src/i18n";

const ids = (text: string, lang: "en" | "fr") => termsIn(text, lang).map((e) => e.id);

describe("glossary words in a text", () => {
  it("finds keywords, keeps the rest of the text", () => {
    const parts = splitTerms("Flying, first strike\nWhen this creature enters, scry 2.", "en");
    expect(parts.map((p) => (typeof p === "string" ? p : `[${p.entry.id}:${p.text}]`)).join("")).toBe(
      "[flying:Flying], [firstStrike:first strike]\nWhen this creature enters, [scry:scry] 2.",
    );
  });

  it("prefers the longer form and respects word boundaries", () => {
    expect(ids("Double strike", "en")).toEqual(["doubleStrike"]);
    expect(ids("Double initiative", "fr")).toEqual(["doubleStrike"]);
    expect(ids("When this creature enters, manifest dread.", "en")).toEqual(["manifestDread"]);
    // Flashback is not flash, enchanted is not enchant, Équipement the card type is not Equip. i18n-ignore: French card text
    expect(ids("Flashback {2}{R}", "en")).toEqual(["flashback"]);
    expect(ids("Enchanted creature gets +1/+1.", "en")).toEqual([]);
    expect(ids("Les créatures-artefacts Équipement que vous contrôlez", "fr")).toEqual([]); // i18n-ignore: French card text
    expect(ids("Équipement {2}", "fr")).toEqual(["equip"]); // i18n-ignore: French card text
  });

  it("conjugated keyword actions, in both languages", () => {
    expect(ids("Target player mills two cards. It explores.", "en")).toEqual(["mill", "explore"]);
    expect(ids("Meulez deux cartes, puis surveillez 1.", "fr")).toEqual(["mill", "surveil"]); // i18n-ignore: French card text
  });

  it("an ability word only before its dash", () => {
    expect(ids("Landfall — Whenever a land you control enters, draw a card.", "en")).toEqual(["landfall"]);
    expect(ids("Toucheterre - À chaque fois qu'un terrain arrive", "fr")).toEqual(["landfall"]); // i18n-ignore: French card text
    expect(ids("Descend 4 — This creature gets +2/+0.", "en")).toEqual(["descend"]);
    expect(ids("Raid the village.", "en")).toEqual([]);
  });

  it("the defending player is not defender", () => {
    expect(ids("Le joueur défenseur perd 2 points de vie.", "fr")).toEqual([]); // i18n-ignore: French card text
    expect(ids("Défenseur", "fr")).toEqual(["defender"]); // i18n-ignore: French card text
  });

  it("a French text without a French printing is searched in English too", () => {
    expect(ids("Warp {2}{W} (You may cast this card from your hand for its warp cost.)", "fr")).toEqual(["warp"]);
  });

  it("every engine keyword with a badge explanation has its entry", () => {
    for (const e of GLOSSARY) if (e.keyword) expect(glossaryForKeyword(e.keyword), e.id).toBe(e);
    for (const k of ["flying", "reach", "trample", "ward", "changeling"] as const) {
      expect(glossaryForKeyword(k)?.name, k).toBe(KEYWORD_LABEL[k]);
    }
  });

  it("entries have unique ids and names", () => {
    expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
    expect(new Set(GLOSSARY.map((e) => e.name)).size).toBe(GLOSSARY.length);
  });
});

/** Every rules text of the catalog, per language (French: only the French printings). */
function catalogTexts(): { en: string[]; fr: string[] } {
  const en: string[] = [];
  const fr: string[] = [];
  const add = (c: Pick<CardDef, "text" | "fr">) => {
    if (c.text) en.push(c.text);
    if (c.fr?.text) fr.push(c.fr.text);
  };
  for (const c of Object.values(CARDS)) {
    add(c);
    for (const f of c.faceDefs ?? []) add(f as Pick<CardDef, "text" | "fr">);
  }
  return { en, fr };
}

describe("glossary forms against the catalog", () => {
  const texts = catalogTexts();
  const finds = (entry: GlossaryEntry, lang: "en" | "fr") => texts[lang].some((t) => termsIn(t, lang).includes(entry));
  // Highlighted entries: every English form, and every French form of its own, finds a text of the catalog.
  const highlighted = GLOSSARY.filter((e) => entryForms(e, "en"));

  it.each(highlighted.map((e) => [e.id, e] as const))("%s is found in an English text", (_, entry) => {
    expect(finds(entry, "en")).toBe(true);
  });

  it.each(highlighted.filter((e) => e.fr).map((e) => [e.id, e] as const))("%s is found in a French text", (_, entry) => {
    // Only the French forms: a French text in English would hide a wrong French form.
    const own = { ...entry, en: undefined };
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${entryForms(own, "fr")})(?![\\p{L}\\p{N}])`, "iu");
    expect(texts.fr.some((t) => re.test(t))).toBe(true);
  });
});
