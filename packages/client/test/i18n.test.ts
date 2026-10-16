/** Interface texts: card names in engine prompts, log (revealed cards, poison, defeat). */
import { type CardFace, cardRef, type GameView } from "@mtgx/engine";
import { describe, expect, it } from "vitest";
import { describeEvents, localizeText } from "../src/i18n";

const face = (defId: string, name: string, fr: string) => ({ defId, name, fr: { name: fr } }) as unknown as CardFace;
const faces = { bolt: face("bolt", "Lightning Bolt", "Foudre"), bear: face("bear", "Bear Cub", "Ourson") };
const view = {
  viewer: "p1",
  players: { p1: { id: "p1", name: "Alice" }, p2: { id: "p2", name: "Bob" } },
} as unknown as GameView;

describe("interface texts", () => {
  it("engine card markers become the name in the chosen language", () => {
    const prompt = `Répartissez les 3 blessures de ${cardRef("bear")}`; // i18n-ignore: checks the French log
    expect(localizeText(prompt, faces, "fr")).toBe("Répartissez les 3 blessures de Ourson"); // i18n-ignore: checks the French log
    expect(localizeText(prompt, faces, "en")).toBe("Répartissez les 3 blessures de Bear Cub"); // i18n-ignore: checks the French log
    expect(localizeText(`Règle des légendes : ${cardRef("inconnue")}`, faces, "fr")).toBe("Règle des légendes : cette carte"); // i18n-ignore: checks the French log
  });

  it("log: revealed cards, poison counters, defeat by poison", () => {
    const lines = describeEvents(
      [
        { type: "reveal", player: "p2", defIds: ["bolt", "bear"] },
        { type: "poison", player: "p1", amount: 2, total: 9 },
        { type: "lose", player: "p2", reason: "poison" },
      ],
      view,
      faces,
      "fr",
    ).map((l) => l.text);
    expect(lines).toEqual([
      "Bob révèle Foudre, Ourson.", // i18n-ignore: checks the French log
      "Vous recevez 2 marqueurs poison (9).", // i18n-ignore: checks the French log
      "Bob perd (10 marqueurs poison).", // i18n-ignore: checks the French log
    ]);
  });

  it("log: life loss outside damage, without repeating the damage one; card names cited per line", () => {
    const lines = describeEvents(
      [
        { type: "damage", sourceDefId: "bolt", target: "p2", amount: 3, combat: false },
        { type: "life", player: "p2", delta: -3, life: 17 },
        { type: "life", player: "p1", delta: -2, life: 18 },
      ],
      view,
      faces,
      "fr",
    );
    expect(lines.map((l) => l.text)).toEqual(["Foudre inflige 3 à Bob.", "Vous perdez 2 PV (18)."]); // i18n-ignore: checks the French log
    expect(lines[0]?.cards?.map((c) => c.defId)).toEqual(["bolt"]);
    expect(lines[1]?.cards).toBeUndefined();
  });

  it("log: coin flips (heads, tails) and skipped turns (Ral Zarek, Guest Lecturer)", () => {
    const lines = describeEvents(
      [
        { type: "coinFlip", player: "p1", won: true },
        { type: "coinFlip", player: "p1", won: false },
        { type: "coinFlip", player: "p2", won: true },
        { type: "turnSkipped", player: "p2" },
        { type: "turnSkipped", player: "p1" },
      ],
      view,
      faces,
      "fr",
    ).map((l) => l.text);
    expect(lines).toEqual([
      "Vous lancez une pièce : face.", // i18n-ignore: checks the French log
      "Vous lancez une pièce : pile.", // i18n-ignore: checks the French log
      "Bob lance une pièce : face.", // i18n-ignore: checks the French log
      "Bob passe son tour.", // i18n-ignore: checks the French log
      "Vous passez votre tour.", // i18n-ignore: checks the French log
    ]);
  });
});
