/** Final Fantasy — blue cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  doesntUntap,
  flashback,
  fx,
  hero,
  manaAbility,
  ROBOT_WARRIOR,
  ref,
  spell,
  staticAbility,
  TOWN,
  target,
  tiered,
  triggered,
  when,
} from "./common";

export const BLUE: Record<string, CardScript> = {
  "Cargo Ship": {
    abilities: [
      manaAbility("C", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } } }),
    ],
  },
  "Combat Tutorial": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c", { controller: "you" }))],
      [fx.draw(2, ref.target("p")), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Dragoon's Wyvern": { abilities: [triggered(when.entersSelf, [hero()], { label: "1/1 Hero" })] },
  "Dreams of Laguna": { castOptions: [flashback("{3}{U}")], spell: spell([], [fx.surveil(1), fx.draw(1)]) },
  Eject: { rules: { cantBeCountered: true }, spell: spell([target.nonland("t")], [fx.bounce(ref.target()), fx.draw(1)]) },
  Ether: {
    abilities: [
      activated({
        tap: true,
        exileSelf: true,
        effects: [fx.addMana("U"), fx.copyNextSpell],
        label: "{U}, copy the next instant or sorcery",
      }),
    ],
  },
  "Ice Flan": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.permanent("t", ["Artifact", "Creature"], { controller: "opponent" }, "artifact or creature")],
        label: "Tap and stun",
      }),
    ],
  },
  "Ice Magic": {
    spell: tiered(
      { cost: "{0}", label: "Blizzard", targets: [target.creature("t")], effects: [fx.bounce(ref.target())] },
      { cost: "{2}", label: "Blizzara", targets: [target.creature("t")], effects: [fx.topOrBottom(ref.target())] },
      {
        cost: "{5}{U}",
        label: "Blizzaga",
        targets: [target.creature("t")],
        effects: [fx.moveTo(ref.target(), { to: "libraryTop" }), fx.shuffle(ref.controllerOf(ref.target()))],
      },
    ),
  },
  "Il Mheg Pixie": { abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveil 1" })] },
  "Magic Damper": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 1, 1, ["hexproof"]), fx.untap(ref.target())],
    ),
  },
  "Matoya, Archon Elder": { abilities: [triggered(when.scryOrSurveil, [fx.draw(1)], { label: "Draw" })] },
  "The Prima Vista": {
    abilities: [triggered(when.castNoncreatureWithMana(4), [fx.animateVehicle()], { label: "Becomes an artifact creature" })],
  },
  "Qiqirn Merchant": {
    abilities: [
      activated({ mana: "{1}", tap: true, effects: fx.loot(1), label: "Draw, then discard" }),
      activated({
        mana: "{7}",
        tap: true,
        sacrifice: true,
        reduction: { generic: amount.count({ ...TOWN, controller: "you" }) },
        effects: [fx.draw(3)],
        label: "Draw three cards",
      }),
    ],
  },
  "Relm's Sketching": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature", "Land"], {}, "artifact, creature or land")],
      [fx.copyToken(ref.target())],
    ),
  },
  "Retrieve the Esper": {
    castOptions: [flashback("{5}{U}")],
    spell: spell(
      [],
      [
        fx.createTokens(ROBOT_WARRIOR, 1, undefined, "r"),
        fx.when(cond.spellCastFromGraveyard, fx.addCounters(ref.stored("r"), 2)),
      ],
    ),
  },
  "Rook Turret": {
    abilities: [
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", other: true }),
        fx.may("Draw, then discard?", ...fx.loot(1)),
        {
          label: "Draw, then discard",
        },
      ),
    ],
  },
  Sahagin: {
    abilities: [
      triggered(when.castNoncreatureWithMana(4), [fx.addCounters(ref.self, 1), fx.pump(ref.self, 0, 0, ["unblockable"])], {
        label: "+1/+1 counter, can't be blocked",
      }),
    ],
  },
  "Scorpion Sentinel": {
    abilities: [
      staticAbility("self", { power: 3 }, { condition: cond.controls({ types: ["Land"] }, 7), label: "+3/+0 (seven lands)" }),
    ],
  },
  "Sleep Magic": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.attached)], { label: "Tap the creature" }),
      doesntUntap("attached"),
      triggered(when.attachedIsDealtDamage, [fx.sacrificeIt(ref.self)], { label: "Dealt damage: sacrifice the Aura" }),
    ],
  },
  Syncopate: {
    spell: spell(
      [target.spell("t")],
      fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{X}" }, fx.counterExile(ref.target())),
    ),
  },
  "Travel the Overworld": {
    costReduction: { generic: amount.count({ ...TOWN, controller: "you" }) },
    spell: spell([], [fx.draw(4)]),
  },
  "Ultros, Obnoxious Octopus": {
    abilities: [
      triggered(when.castNoncreatureWithMana(4), [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 1)], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap and stun",
      }),
      triggered(when.castNoncreatureWithMana(8), [fx.addCounters(ref.self, 8)], { label: "Eight +1/+1 counters" }),
    ],
  },
  "Valkyrie Aerial Unit": {
    costReduction: { generic: amount.count({ types: ["Artifact"], controller: "you" }) },
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" })],
  },
};
