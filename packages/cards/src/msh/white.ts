/** Marvel Super Heroes — white cards (lot A). */
import type { ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  bothIfKicked,
  type CardScript,
  CLUE,
  chapter,
  cond,
  entersWith,
  fx,
  HERO,
  investigate,
  mode,
  playerStatic,
  ref,
  SOLDIER,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  WALL_C,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };
const OTHER_HEROES_YOU_CONTROL: ObjectFilter = { subtype: "Hero", controller: "you", other: true };
/** "Whenever [this creature] attacks alone" */
const ATTACKS_ALONE_SELF: TriggerSpec = { on: "attacks", who: "self", alone: true };
/** "a spell that targets a creature you control" */
const TARGETS_YOUR_CREATURE = { objects: CREATURES_YOU_CONTROL };

/** The Void (The Sentry): legendary 5/5 black Horror Villain, flying, indestructible, attacks each combat. */
const THE_VOID: TokenSpec = {
  name: "The Void",
  legendary: true,
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Horror", "Villain"],
  power: 5,
  toughness: 5,
  keywords: ["flying", "indestructible", "mustAttack"],
};

export const WHITE: Record<string, CardScript> = {
  "Agent 13, Sharon Carter": {
    abilities: [
      triggered(when.attacksAlone(CREATURES_YOU_CONTROL), [investigate()], {
        label: "A creature you control attacks alone: investigate",
      }),
    ],
  },
  "Agent Phil Coulson": {
    abilities: [
      activated({
        tap: true,
        effects: [fx.addCountersAll(OTHER_HEROES_YOU_CONTROL, 1)],
        label: "A +1/+1 counter on each other Hero you control",
      }),
    ],
  },
  "Agents of S.H.I.E.L.D.": {
    abilities: [
      triggered(when.attacksAlone(CREATURES_YOU_CONTROL), [fx.pump(ref.eventObject, 1, 1)], {
        label: "The creature attacking alone gets +1/+1",
      }),
    ],
  },
  "Avengers Assemble!": {
    // Flash: read from the text.
    abilities: [
      staticAbility(
        { subtype: "Hero", controller: "you" },
        { power: 2, toughness: 2 },
        { label: "Heroes you control get +2/+2" },
      ),
      triggered(when.eachEndStep, [fx.draw(1)], {
        condition: cond.any(
          cond.attackedWith("Hero"),
          cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Hero", who: "you" }), 1),
        ),
        label: "Draw a card (a Hero attacked or entered this turn)",
      }),
    ],
  },
  "Borough Backup": {
    // Basic landcycling {2}: read from the text.
    spell: spell([], [fx.createTokens(HERO, 2)]),
  },
  "Brave Brawler": {
    abilities: [
      activated({
        mana: "{4}{W}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Power-up: two +1/+1 counters",
      }),
    ],
  },
  "Captain America, Wings of Freedom": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.pumpAll(OTHER_HEROES_YOU_CONTROL, amount.toughnessOf(ref.self), amount.toughnessOf(ref.self))],
        { label: "Other Heroes you control get +X/+X (X: its toughness)" },
      ),
    ],
  },
  "Captain Mar-Vell, Space-Born": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: {}, keywords: ["flash"] },
        condition: cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "opponent" }), 1),
        label: "Cosmic Awareness — your spells have flash if an opponent cast a spell this turn",
      }),
    ],
  },
  "Colleen Wing, Street Samurai": {
    abilities: [
      triggered(when.castSpell("you", undefined, TARGETS_YOUR_CREATURE), [fx.addCounters(ref.self, 1), fx.scry(1)], {
        label: "A +1/+1 counter, scry 1",
      }),
    ],
  },
  "Crowd of True Believers": {
    abilities: [
      activated({
        tap: true,
        // "attacking alone" (506.5): the only attacking creature, whatever it attacks.
        activationCondition: cond.not(cond.amountAtLeast(amount.count({ types: ["Creature"], attacking: true }), 2)),
        targets: [
          {
            id: "t",
            label: "creature you control attacking alone",
            filter: { objects: { ...CREATURES_YOU_CONTROL, attacking: true } },
          },
        ],
        effects: [fx.pump(ref.target(), 1, 0), fx.gainLife(1)],
        label: "+1/+0 to your creature attacking alone, gain 1 life",
      }),
    ],
  },
  "Helicarrier Strike": {
    // Teamwork 2: read from the text.
    spell: spell(
      [
        {
          id: "t",
          label: "attacking or blocking creature",
          filter: { objects: { types: ["Creature"], anyOf: [{ attacking: true }, { blocking: true }] } },
        },
      ],
      [fx.damage(amount.kicked(4, 2), ref.target())],
    ),
  },
  "Hero in Training": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1), ...fx.when(cond.controls({ subtype: "Hero", other: true }), fx.gainLife(2))], {
        label: "Draw; 2 life if you control another Hero",
      }),
    ],
  },
  "Invisible Woman, Sue Storm": {
    abilities: [
      triggered(
        when.youPutCounters(OTHER_HEROES_YOU_CONTROL, "+1/+1"),
        fx.may("Create a 0/4 Wall with defender?", fx.createTokens(WALL_C)),
        { batched: true, label: "A 0/4 Wall with defender" },
      ),
    ],
  },
  "Luke Cage, Power Man": {
    abilities: [
      triggered(ATTACKS_ALONE_SELF, [fx.pump(ref.self, 2, 0, ["indestructible"])], {
        label: "Unbreakable Skin — +2/+0 and indestructible",
      }),
    ],
  },
  "Mockingbird, Ace Agent": {
    abilities: [
      triggered(when.castSpell("you", undefined, TARGETS_YOUR_CREATURE), [fx.addCounters(ref.self, 1)], {
        label: "A +1/+1 counter",
      }),
    ],
  },
  "Monica Rambeau": {
    abilities: [
      activated({ mana: "{2}{R}{W}{W}", sorcerySpeed: true, effects: [fx.transform(ref.self)], label: "Transform her" }),
    ],
  },
  "Photon, Living Light": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [fx.addCountersAll({ ...CREATURES_YOU_CONTROL, other: true }, 1)],
        { label: "A +1/+1 counter on each other creature you control" },
      ),
    ],
  },
  "Murdock's Crusade": {
    // Teamwork 4: read from the text; "choose both" requires teamwork.
    spell: bothIfKicked(
      mode(
        "Street Justice — exile a creature with toughness 4 or greater",
        [target.creature("t", { minToughness: 4 })],
        [fx.exile(ref.target())],
      ),
      mode(
        "Legal Justice — exile an enchantment with mana value 4 or greater",
        [target.permanent("u", ["Enchantment"], { minManaValue: 4 }, "enchantment with mana value 4 or greater")],
        [fx.exile(ref.target("u"))],
      ),
      "Both (teamwork)",
    ),
  },
  "Nick Fury, Agent of S.H.I.E.L.D.": {
    abilities: [
      activated({
        mana: "{W}{U}{B}{R}{G}",
        powerUp: true,
        effects: [
          fx.addCounters(ref.self, 2),
          fx.lookAtTop(7, {
            filter: { anyOf: [{ subtype: "Hero" }, { subtype: "Equipment" }, { subtype: "Vehicle" }] },
            to: { to: "battlefield" },
            rest: "bottom",
            store: "nf",
          }),
          // "If it's a double-faced card, you may transform it."
          fx.transform(ref.stored("nf"), true),
        ],
        label: "Power-up: two +1/+1 counters, a Hero, Equipment or Vehicle from among the top seven",
      }),
    ],
  },
  "Night Nurse, Healer of Heroes": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { permanent: true, enteredThisTurn: true },
            "you",
            "permanent card put into your graveyard this turn",
          ),
        ],
        label: "Return to hand a permanent card put into your graveyard this turn",
      }),
    ],
  },
  "Okoye, Dora Milaje Leader": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(SOLDIER, 2)], { label: "Two 1/1 Soldiers" }),
      staticAbility(
        { ...CREATURES_YOU_CONTROL, token: true, attacking: true },
        { addKeywords: ["firstStrike"] },
        { label: "Attacking creature tokens you control have first strike" },
      ),
    ],
  },
  "Origin of the Avengers": {
    abilities: [
      chapter([1], [fx.scry(2)], { label: "Scry 2" }),
      chapter(
        [2],
        [
          fx.pickFromZone(
            "hand",
            { types: ["Creature"], subtype: "Hero", maxManaValue: 3 },
            { to: "battlefield" },
            { min: 0, store: "h", prompt: "A Hero with mana value 3 or less from your hand" },
          ),
          ...fx.when(cond.not(cond.v("h")), fx.draw(1)),
        ],
        { label: "A Hero from your hand onto the battlefield, otherwise draw" },
      ),
      chapter([3], [fx.addCountersAll(CREATURES_YOU_CONTROL, 1)], { label: "A +1/+1 counter on each creature you control" }),
    ],
  },
  "Panther Pounce": {
    spell: spell(
      [target.player("p"), target.creature()],
      [fx.createTokens(CLUE, 1, ref.target("p")), fx.pump(ref.target(), 1, 0, ["flying"]), fx.untap(ref.target())],
    ),
  },
  "Patriot, Shield Wielder": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.pump(ref.target(), 2, 0, ["hexproof"])],
        label: "Another creature you control gets +2/+0 and gains hexproof",
      }),
    ],
  },
  "Quake, Agent of S.H.I.E.L.D.": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.tap(ref.target())], {
        targets: [target.permanent("t", ["Creature", "Land"], {}, "creature or land")],
        label: "Seismic Takedown — tap a creature or land",
      }),
    ],
  },
  "Raft Security Officer": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature()],
        // "Costs {1} less to activate if it targets a creature with power 3 or less" (read with the target).
        reduction: { generic: amount.refCount(ref.filtered(ref.target(), { maxPower: 3 })) },
        effects: [fx.tap(ref.target())],
        label: "Taps a creature ({1} less if its power is 3 or less)",
      }),
    ],
  },
  "Red Guardian, Super-Soldier": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [
          {
            id: "t",
            label: "creature an opponent controls that dealt damage this turn",
            filter: { objects: { types: ["Creature"], controller: "opponent", dealtDamageThisTurn: true } },
          },
        ],
        label: "Destroy a creature an opponent controls that dealt damage this turn",
      }),
    ],
  },
  "The Sentry, Golden Guardian": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(THE_VOID, 1, ref.target("p"))], {
        targets: [target.player("p", "opponent")],
        label: "An opponent creates The Void, 5/5",
      }),
    ],
  },
  "S.H.I.E.L.D. Spy Kit": {
    // Equip {1}: read from the text.
    abilities: [
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.attacksAlone({ attached: "host" }), [fx.untap(ref.attached), fx.scry(1)], {
        label: "Equipped creature attacks alone: untap it, scry 1",
      }),
    ],
  },
  "Super Villain Lockup": {
    // Flash: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", tapped: true })],
        label: "Exile a tapped creature an opponent controls until this leaves",
      }),
    ],
  },
  "Super-Soldier Serum": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          toughness: 2,
          addKeywords: ["firstStrike", "vigilance"],
          addSupertypes: ["Legendary"],
          addSubtypes: ["Soldier"],
        },
        { label: "+2/+2, first strike and vigilance; legendary Soldier" },
      ),
      ...[when.attacks({ attached: "host" }), when.blocks({ attached: "host" })].map((w) =>
        triggered(w, [fx.attach(ref.attached, ref.target())], {
          targets: [
            target.upTo(
              99,
              target.permanent("t", ["Artifact"], { subtype: "Equipment", controller: "you" }, "Equipment you control"),
            ),
          ],
          label: "Attach target Equipment you control to enchanted creature",
        }),
      ),
    ],
  },
  "Wakandan Drone Flock": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" })],
  },
  "White Widow, Free Agent": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "A +1/+1 counter on each of up to two creatures",
            [target.upTo(2, target.creature())],
            [fx.addCounters(ref.target(), 1)],
          ),
          mode(
            "Return to hand an artifact or enchantment card from your graveyard",
            [
              target.cardInGraveyard(
                "u",
                { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] },
                "you",
                "artifact or enchantment card from your graveyard",
              ),
            ],
            [fx.toHand(ref.target("u"))],
          ),
        ],
        { label: "+1/+1 counters, or an artifact or enchantment from your graveyard" },
      ),
    ],
  },
  "Agent Maria Hill": {
    abilities: [
      triggered({ on: "taps", who: "self", cause: "teamwork" }, [fx.addCounters(ref.self, 1), fx.draw(1)], {
        label: "Tapped for teamwork: a +1/+1 counter and draw a card",
      }),
    ],
  },
  // First strike: read from the text.
  "Captain America, Super-Soldier": {
    abilities: [
      entersWith({ counters: 1, counterKind: "shield", label: "Enters with a shield counter" }),
      playerStatic({
        hexproof: true,
        condition: cond.counterAtLeast("shield", 1),
        label: "You have hexproof as long as it has a shield counter",
      }),
      staticAbility(
        { types: ["Creature"], subtype: "Hero", controller: "you", other: true },
        { addKeywords: ["hexproof"] },
        { condition: cond.counterAtLeast("shield", 1), label: "Other Heroes you control have hexproof" },
      ),
    ],
  },
};
