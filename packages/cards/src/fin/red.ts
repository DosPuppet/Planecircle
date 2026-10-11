/** Final Fantasy — red cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  chocobo,
  cond,
  flashback,
  fx,
  jobGear,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  tiered,
  triggered,
  when,
  wizard,
} from "./common";

export const RED: Record<string, CardScript> = {
  "Blazing Bomb": {
    abilities: [
      triggered(when.castNoncreatureWithMana(4), [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
      activated({
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.creature("t")],
        effects: [fx.damage(amount.powerOf(ref.self), ref.target())],
        label: "Damage equal to its power",
      }),
    ],
  },
  "Call the Mountain Chocobo": {
    castOptions: [flashback("{5}{R}")],
    spell: spell([], [fx.search({ types: ["Land"], subtype: "Mountain" }), chocobo()]),
  },
  "Choco-Comet": { spell: spell([target.any("t")], [fx.damage(amount.x, ref.target()), chocobo()]) },
  "Coral Sword": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target()), fx.pump(ref.target(), 0, 0, ["firstStrike"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach, first strike",
      }),
      staticAbility("attached", { power: 1 }, { label: "+1/+0" }),
    ],
  },
  "Fire Magic": {
    spell: tiered(
      { cost: "{0}", label: "Fire (1 damage)", effects: [fx.damageAll(1, { types: ["Creature"] })] },
      { cost: "{2}", label: "Fira (2 damage)", effects: [fx.damageAll(2, { types: ["Creature"] })] },
      { cost: "{5}", label: "Firaga (3 damage)", effects: [fx.damageAll(3, { types: ["Creature"] })] },
    ),
  },
  "Freya Crescent": {
    abilities: [
      staticAbility("self", { addKeywords: ["flying"] }, { condition: cond.yourTurn, label: "Jump: flying during your turn" }),
      manaAbility("R", 1, { restriction: { spell: { subtype: "Equipment" }, ability: ["equip"] } }),
    ],
  },
  "Haste Magic": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 3, 1, ["haste"]), fx.impulse(1, "yourNextEndStep")]),
  },
  "Laughing Mad": { additionalCost: { discard: 1 }, castOptions: [flashback("{3}{R}")], spell: spell([], [fx.draw(2)]) },
  "Light of Judgment": {
    // "Destroy up to one Equipment attached to that creature": chosen on resolution, not targeted.
    spell: spell(
      [target.creature("c")],
      [
        fx.damage(6, ref.target("c")),
        fx.chooseAmong(ref.filtered(ref.attachmentsOf(ref.target("c")), { subtype: "Equipment" }), ref.you, "e", {
          optional: true,
          prompt: "Light of Judgment: destroy up to one Equipment attached to the creature",
        }),
        fx.destroy(ref.stored("e")),
      ],
    ),
  },
  "Mysidian Elder": { abilities: [triggered(when.entersSelf, [wizard()], { label: "0/1 Wizard" })] },
  "Opera Love Song": {
    spell: modal(
      mode("Exile the top two cards, playable", [], [fx.impulse(2, "yourNextEndStep")]),
      mode("One or two creatures get +2/+0", [target.upTo(2, target.creature("t"))], [fx.pump(ref.target(), 2, 0)]),
    ),
  },
  "Prompto Argentum": {
    abilities: [triggered(when.castNoncreatureWithMana(4), [fx.createTokens(TREASURE)], { label: "Treasure" })],
  },
  "Queen Brahne": { abilities: [triggered(when.attacksSelf, [wizard()], { label: "0/1 Wizard" })] },
  "Red Mage's Rapier": {
    abilities: [
      staticAbility(
        "attached",
        {
          addSubtypes: ["Wizard"],
          addAbilities: [
            triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, 2, 0)], { label: "+2/+0" }),
          ],
        },
        { label: "Wizard, +2/+0 for each noncreature spell" },
      ),
    ],
  },
  Sabotender: {
    abilities: [triggered(when.landfall, [fx.damage(1, ref.eachOpponent)], { label: "1 damage to each opponent" })],
  },
  "Samurai's Katana": { abilities: jobGear("Samurai", 2, 2, ["trample", "haste"]) },
  Sandworm: {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.destroy(ref.target()),
          fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        ],
        { targets: [targetObj("t", { types: ["Land"] }, "land")], label: "Destroy target land" },
      ),
    ],
  },
  "Self-Destruct": {
    spell: spell(
      [target.creature("s", { controller: "you" }), { ...target.any("t"), otherThan: ["s"] }],
      [
        fx.damage(amount.powerOf(ref.target("s")), ref.target("t"), ref.target("s")),
        fx.damage(amount.powerOf(ref.target("s")), ref.target("s"), ref.target("s")),
      ],
    ),
  },
  "Sorceress's Schemes": {
    castOptions: [flashback("{4}{R}")],
    // "Target instant or sorcery card from your graveyard or exiled card with flashback you own" (PLAN-L L4).
    spell: spell(
      [
        {
          id: "t",
          label: "instant or sorcery card in your graveyard, or exiled card with flashback you own",
          filter: {
            cards: { filter: { types: ["Instant", "Sorcery"] }, whose: "you" },
            exiled: { withCost: "flashback", own: true },
          },
        },
      ],
      [fx.toHand(ref.target()), fx.addMana("R")],
    ),
  },
  Suplex: {
    spell: modal(
      mode("3 damage, exiled if it dies", [target.creature("t")], [fx.exileIfDies(ref.target()), fx.damage(3, ref.target())]),
      mode("Exile an artifact", [targetObj("t", { types: ["Artifact"] }, "artifact")], [fx.exile(ref.target())]),
    ),
  },
  "Thunder Magic": {
    spell: tiered(
      { cost: "{0}", label: "Thunder (2 damage)", targets: [target.creature("t")], effects: [fx.damage(2, ref.target())] },
      {
        cost: "{3}",
        label: "Thundara (4 damage)",
        targets: [target.creature("t")],
        effects: [fx.damage(4, ref.target())],
      },
      {
        cost: "{5}{R}",
        label: "Thundaga (8 damage)",
        targets: [target.creature("t")],
        effects: [fx.damage(8, ref.target())],
      },
    ),
  },
  "Warrior's Sword": { abilities: jobGear("Warrior", 3, 2) },
};
