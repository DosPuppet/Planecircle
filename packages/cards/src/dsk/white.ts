/** Duskmourn — white cards. */
import {
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  cost,
  eerie,
  entersWith,
  eventReplacement,
  fx,
  GLIMMER_CREATURE,
  glimmer,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  survival,
  target,
  triggered,
  wardAbility,
  when,
} from "./common";

export const WHITE: Record<string, CardScript> = {
  "Acrobatic Cheerleader": {
    abilities: [survival([fx.counters(ref.self, "flying", 1)], { once: true, label: "A flying counter" })],
  },
  "Cult Healer": {
    abilities: [eerie([fx.pump(ref.self, 0, 0, ["lifelink"])], { label: "Lifelink" })],
  },
  "Emerge from the Cocoon": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
      [fx.toBattlefield(ref.target()), fx.gainLife(3)],
    ),
  },
  "Ethereal Armor": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 1 },
        { per: { types: ["Enchantment"], controller: "you" }, label: "+1/+1 for each enchantment" },
      ),
      staticAbility("attached", { addKeywords: ["firstStrike"] }, { label: "First strike" }),
    ],
  },
  Exorcise: {
    spell: spell(
      [
        {
          id: "t",
          label: "artifact, enchantment, or creature with power 4 or greater",
          filter: {
            objects: { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }, { types: ["Creature"], minPower: 4 }] },
          },
        },
      ],
      [fx.exile(ref.target())],
    ),
  },
  "Fear of Immobility": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.tap(ref.target()),
          fx.when(cond.targetMatches("t", { controller: "opponent" }), fx.counters(ref.target(), "stun", 1)),
        ],
        { targets: [target.upTo(1, target.creature())], label: "Tap a creature (stun counter)" },
      ),
    ],
  },
  "Fear of Surveillance": {
    abilities: [triggered(when.attacksSelf, [fx.surveil(1)], { label: "Surveil 1" })],
  },
  "Friendly Ghost": {
    abilities: [triggered(when.entersSelf, [fx.pump(ref.target(), 2, 4)], { targets: [target.creature()], label: "+2/+4" })],
  },
  "Glimmer Seeker": {
    abilities: [
      survival(
        [
          ...fx.when(cond.controls(GLIMMER_CREATURE), fx.draw(1)),
          ...fx.when(cond.not(cond.controls(GLIMMER_CREATURE)), glimmer()),
        ],
        {
          label: "Draw, or create a Glimmer",
        },
      ),
    ],
  },
  "Grand Entryway": {
    abilities: [triggered(when.unlockThisDoor, [glimmer()], { label: "1/1 Glimmer token" })],
  },
  "Elegant Rotunda": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(2, target.creature())],
        label: "+1/+1 counter on up to two creatures",
      }),
    ],
  },
  "Hardened Escort": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 1, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+0 and indestructible",
      }),
    ],
  },
  "Jump Scare": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 2, 2, ["flying"]), fx.modify(ref.target(), { addTypes: ["Enchantment"], addSubtypes: ["Horror"] })],
    ),
  },
  "Leyline of Hope": {
    leyline: true,
    abilities: [
      eventReplacement({ event: "lifeGain", to: "you", modify: { add: 1 }, label: "Life gains +1" }),
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 2, toughness: 2 },
        { condition: cond.lifeAboveStart(7), label: "+2/+2 (7 more life)" },
      ),
    ],
  },
  "Lionheart Glimmer": {
    abilities: [triggered(when.attackWith(), [fx.pumpAll(CREATURE_YOU_CONTROL, 1, 1)], { label: "Your creatures +1/+1" })],
  },
  "Living Phone": {
    abilities: [
      triggered(when.diesSelf, [fx.lookAtTop(5, { filter: { types: ["Creature"], maxPower: 2 }, rest: "bottom" })], {
        label: "Creature with power 2 or less among the top five",
      }),
    ],
  },
  "Optimistic Scavenger": {
    abilities: [eerie([fx.addCounters(ref.target(), 1)], { targets: [target.creature()], label: "+1/+1 counter" })],
  },
  "Patched Plaything": {
    abilities: [entersWith({ counters: 2, counterKind: "-1/-1", condition: cond.castFromHand, label: "Two -1/-1 counters" })],
  },
  "Savior of the Small": {
    abilities: [
      survival([fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card (mana value 3 or less)"),
        ],
        label: "Creature from your graveyard into your hand",
      }),
    ],
  },
  "Seized from Slumber": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Shardmage's Rescue": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      staticAbility(
        "attached",
        { addKeywords: ["hexproof"] },
        {
          condition: cond.sourceMatches({ enteredThisTurn: true }),
          label: "Hexproof (this turn)",
        },
      ),
    ],
  },
  "Sheltered by Ghosts": {
    enchant: { filter: { types: ["Creature"], controller: "you" }, label: "creature you control" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" })],
        label: "Exile a permanent until it leaves",
      }),
      staticAbility(
        "attached",
        { power: 1, addKeywords: ["lifelink", "ward"], addAbilities: [wardAbility({ mana: cost("{2}") })] },
        { label: "+1/+0, lifelink and ward {2}" },
      ),
    ],
  },
  "Split Up": {
    spell: modal(
      mode("Destroy the tapped creatures", [], [fx.destroyAll({ types: ["Creature"], tapped: true })]),
      mode("Destroy the untapped creatures", [], [fx.destroyAll({ types: ["Creature"], tapped: false })]),
    ),
  },
  "Splitskin Doll": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.draw(1), ...fx.when(cond.not(cond.controls({ types: ["Creature"], other: true, maxPower: 2 })), fx.discard(1))],
        { label: "Draw (then discard unless a creature with power 2 or less)" },
      ),
    ],
  },
  "Surgical Suite": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card (mana value 3 or less)"),
        ],
        label: "Creature from your graveyard onto the battlefield",
      }),
    ],
  },
  "Hospital Room": {
    abilities: [
      triggered(when.attackWith(), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { attacking: true })],
        label: "+1/+1 counter on an attacking creature",
      }),
    ],
  },
  "Trapped in the Screen": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Creature", "Enchantment"],
            { controller: "opponent" },
            "artifact, creature, or enchantment an opponent controls",
          ),
        ],
        label: "Exile a permanent until it leaves",
      }),
    ],
  },
  "Unsettling Twins": {
    abilities: [triggered(when.entersSelf, [fx.manifestDread], { label: "Manifest dread" })],
  },
  "Unwanted Remake": {
    spell: spell([target.creature()], [fx.destroy(ref.target()), fx.manifestDreadBy({ who: ref.controllerOf(ref.target()) })]),
  },
  "The Wandering Rescuer": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", tapped: true, other: true },
        { addKeywords: ["hexproof"] },
        { label: "Your other tapped creatures have hexproof" },
      ),
    ],
  },
};
