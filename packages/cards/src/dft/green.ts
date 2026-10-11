/** Aetherdrift — green cards. */
import type { CardScript } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_VEHICLE,
  cond,
  ELEPHANT,
  entersWith,
  fx,
  MOUNT_OR_VEHICLE,
  manaAbility,
  modal,
  mode,
  pilot,
  ref,
  spell,
  staticAbility,
  target,
  targetCreatureOrVehicle,
  targetObj,
  triggered,
  when,
  whenCycled,
  whileSaddled,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Agonasaur Rex": {
    abilities: [
      whenCycled([fx.addCounters(ref.target(), 2), fx.pump(ref.target(), 0, 0, ["trample", "indestructible"])], {
        targets: [target.upTo(1, targetCreatureOrVehicle())],
        label: "Two +1/+1 counters, trample and indestructible",
      }),
    ],
  },
  "Alacrian Jaguar": { abilities: [whileSaddled([fx.pump(ref.self, 2, 2)], { label: "+2/+2" })] },
  "Autarch Mammoth": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ELEPHANT)], { label: "3/3 Elephant" }),
      whileSaddled([fx.createTokens(ELEPHANT)], { label: "3/3 Elephant" }),
    ],
  },
  "Beastrider Vanguard": {
    abilities: [
      activated({
        mana: "{4}{G}",
        effects: [fx.lookAtTop(3, { filter: { permanent: true }, count: 1, rest: "bottom" })],
        label: "Look at the top three cards",
      }),
    ],
  },
  "Bestow Greatness": { spell: spell([target.creature("t")], [fx.pump(ref.target(), 4, 4, ["trample"])]) },
  "Defend the Rider": {
    spell: modal(
      mode(
        "Hexproof and indestructible",
        [targetObj("t", { permanent: true, controller: "you" }, "permanent you control")],
        [fx.pump(ref.target(), 0, 0, ["hexproof", "indestructible"])],
      ),
      mode("1/1 Pilot", [], [pilot()]),
    ),
  },
  "District Mascot": {
    abilities: [
      entersWith({ counters: 1 }),
      activated({
        mana: "{1}{G}",
        removeCounters: { kind: "+1/+1", n: 2 },
        targets: [target.permanent("t", ["Artifact"])],
        effects: [fx.destroy(ref.target())],
        label: "Destroy target artifact",
      }),
      whileSaddled([fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
    ],
  },
  Earthrumbler: {
    abilities: [
      activated({
        exileFromGraveyard: { filter: CREATURE_OR_ARTIFACT },
        effects: [fx.animateVehicle()],
        label: "Becomes an artifact creature",
      }),
    ],
  },
  "Fang Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2)], {
        targets: [targetCreatureOrVehicle("t", { controller: "you", other: true })],
        label: "+2/+2",
      }),
    ],
  },
  "Lumbering Worldwagon": {
    cda: { power: amount.count({ types: ["Land"], controller: "you" }) },
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Search for a basic land?", fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })),
        { label: "Tapped basic land" },
      ),
      triggered(
        when.attacksSelf,
        fx.may("Search for a basic land?", fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true })),
        { label: "Tapped basic land" },
      ),
    ],
  },
  "Migrating Ketradon": { abilities: [triggered(when.entersSelf, [fx.gainLife(4)], { label: "+4 life" })] },
  "Molt Tender": {
    abilities: [
      activated({ tap: true, effects: [fx.mill(1)], label: "Mill a card" }),
      activated({
        tap: true,
        exileFromGraveyard: { filter: {} },
        effects: [fx.addManaChoice(1)],
        label: "One mana of any color",
      }),
    ],
  },
  "Ooze Patrol": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(2), fx.addCounters(ref.self, amount.countIn("graveyard", CREATURE_OR_ARTIFACT))], {
        label: "Mill two cards, +1/+1 counters",
      }),
    ],
  },
  "Plow Through": {
    spell: modal(
      mode(
        "Fight",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.fight(ref.target("a"), ref.target("b"))],
      ),
      mode("Destroy target Vehicle", [targetObj("t", { subtype: "Vehicle" }, "Vehicle")], [fx.destroy(ref.target())]),
    ),
  },
  "Pothole Mole": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(3),
          fx.pickFromZone("graveyard", { types: ["Land"] }, { to: "hand" }, { min: 0, prompt: "You may take back a land" }),
        ],
        { label: "Mill three cards, take back a land" },
      ),
    ],
  },
  "Regal Imperiosaur": {
    abilities: [
      staticAbility({ subtype: "Dinosaur", controller: "you", other: true }, { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Run Over": {
    costReduction: { generic: 1, condition: cond.targetMatches("a", MOUNT_OR_VEHICLE) },
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Silken Strength": {
    enchant: { filter: CREATURE_OR_VEHICLE, label: "creature or Vehicle" },
    abilities: [
      triggered(when.entersSelf, [fx.untap(ref.attached)], { label: "Untap the enchanted permanent" }),
      staticAbility("attached", { power: 1, toughness: 2, addKeywords: ["reach"] }, { label: "+1/+2 and reach" }),
    ],
  },
  "Veloheart Bike": {
    abilities: [triggered(when.entersSelf, [fx.gainLife(2)], { label: "+2 life" }), manaAbility(["W", "U", "B", "R", "G"])],
  },
  "Venomsac Lagac": { abilities: [whileSaddled([fx.pump(ref.self, 0, 3)], { label: "+0/+3" })] },
  "Webstrike Elite": {
    abilities: [
      // "… with mana value X": X is the one of the cycling cost paid (amount of the event), read when targeting.
      whenCycled([fx.destroy(ref.target())], {
        targets: [
          {
            ...target.upTo(
              1,
              target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment with mana value X"),
            ),
            manaValueAmount: amount.eventAmount,
          },
        ],
        label: "Destroy an artifact or enchantment with mana value X",
      }),
    ],
  },
};
