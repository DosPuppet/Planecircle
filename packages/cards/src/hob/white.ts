/** The Hobbit — white cards (lot A). */
import { msg, type ObjectFilter, type TargetSpec } from "@mtgx/engine";
import {
  AXE,
  activated,
  amount,
  BASIC_LAND,
  BIRD_SOLDIER,
  type CardScript,
  chapter,
  cond,
  DWARF,
  flashback,
  fx,
  kicker,
  modal,
  mode,
  playerStatic,
  recruit,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "./common";

const CREATURES_YOU_CONTROL: ObjectFilter = { types: ["Creature"], controller: "you" };

/** "For each opponent, up to one target nonland permanent that player controls": at most one per player. */
const ONE_NONLAND_PER_OPPONENT: TargetSpec = {
  ...target.upTo(5, target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls (one per opponent)")),
  differentPlayers: true,
};

/** "target creature you own" (whoever controls it). */
const CREATURE_YOU_OWN: ObjectFilter = { owner: "you" };

/** The attacking creatures the target player controls (Settle the Wreckage). */
const ATTACKERS_OF_TARGET = ref.permanentsOf(ref.target(), { types: ["Creature"], attacking: true });

export const WHITE: Record<string, CardScript> = {
  "Celebrate the Mountain-king": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [ONE_NONLAND_PER_OPPONENT],
        label: "Exiles a nonland permanent of each opponent until it leaves",
      }),
      triggered(when.entersSelf, recruit(), { label: "Recruit" }),
    ],
  },
  "Dáin, Lord of the Iron Hills": {
    // Vigilance and Storied: read from the text.
    abilities: [
      playerStatic({
        attackTax: 1,
        condition: cond.enduringStory,
        label: "Enduring story: attacking you costs {1} per creature",
      }),
    ],
  },
  "Dwarven Provisioner": {
    abilities: [
      activated({ mana: "{3}{W}", effects: [fx.pumpAll(CREATURES_YOU_CONTROL, 1, 1)], label: "Your creatures get +1/+1" }),
    ],
  },
  "Dwarven Shortsword": {
    // Equip {2}: read from the text.
    abilities: [
      staticAbility("attached", { power: 1, toughness: 2 }, { label: "+1/+2" }),
      triggered(when.entersSelf, [fx.createTokens(DWARF, 1, undefined, "d"), fx.attach(ref.stored("d"))], {
        label: "A 2/2 Dwarf, then attach this Equipment to it",
      }),
    ],
  },
  "Eagle of the Great Shelf": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.pump(
            ref.self,
            amount.count({ ...CREATURES_YOU_CONTROL, other: true }),
            amount.count({ ...CREATURES_YOU_CONTROL, other: true }),
          ),
        ],
        { label: "+1/+1 for each other creature you control" },
      ),
    ],
  },
  "The Eagles Are Coming!": {
    kicker: kicker("{2}{W}{W}"),
    spell: spell(
      [{ ...target.creature("t", CREATURE_YOU_OWN), label: "creature you own", kickedCount: 99 }],
      [
        fx.moveTo(ref.target(), { to: "hand" }, { name: "returned" }),
        fx.delayedAt("nextUpkeep", [fx.createTokens(BIRD_SOLDIER, amount.v("n"))], undefined, { n: amount.v("returned") }),
      ],
    ),
  },
  "Esgaroth Garrison": {
    cda: { power: amount.count(CREATURES_YOU_CONTROL) },
    abilities: [triggered(when.entersSelf, recruit(), { label: "Recruit" })],
  },
  "Fíli the Pathfinder": {
    // Storied: read from the text.
    abilities: [
      staticAbility(
        CREATURES_YOU_CONTROL,
        { power: 1, toughness: 1 },
        {
          condition: cond.enduringStory,
          label: "Enduring story: your creatures get +1/+1",
        },
      ),
      // "Fíli or another nontoken Dwarf you control": Fíli is itself a nontoken Dwarf.
      triggered(when.enters({ subtype: "Dwarf", token: false, controller: "you" }), [fx.createTokens(DWARF)], {
        label: "A 2/2 Dwarf",
      }),
    ],
  },
  "Gleaming Splendor": {
    abilities: [
      triggered(when.draw(2, "opponent"), [fx.createTokens(TREASURE)], {
        label: "An opponent draws their second card of the turn: a Treasure",
      }),
      activated({
        mana: "{2}{W}",
        targets: [target.exactly(2, target.player("t"))],
        effects: [fx.draw(1, ref.target())],
        label: "Two target players each draw a card",
      }),
    ],
  },
  "Iron Hills Blacksmith": {
    // Double strike: read from the text.
    abilities: [triggered(when.entersSelf, [fx.createTokens(AXE)], { label: "An Axe Equipment" })],
  },
  "Lake-town Lookout": {
    abilities: [triggered(when.diesSelf, recruit(), { label: "Recruit" })],
  },
  "Lake-town Toymaker": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), 3, 0, ["firstStrike"])], {
        condition: cond.drewAtLeast(2),
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Two cards drawn this turn: +3/+0 and first strike",
      }),
    ],
  },
  "Magnificent End": {
    costReduction: { generic: 3, condition: cond.targetMatches("t", { tapped: true }) },
    spell: spell([target.creature()], [fx.damage(5, ref.target())]),
  },
  "Moment of Glory": {
    castOptions: [flashback("{4}{W}")],
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.addCounters(ref.target(), 1),
        ...fx.when(
          cond.spellCastFromGraveyard,
          fx.addCounters(ref.except(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.target()), 1),
        ),
      ],
    ),
  },
  "The Mountain-king's Return": {
    abilities: [
      chapter([1], recruit(), { label: "Recruit" }),
      chapter([2], [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { types: ["Creature"], maxManaValue: 3 },
            "you",
            "creature card with mana value 3 or less from your graveyard",
          ),
        ],
        label: "A creature with mana value 3 or less from your graveyard returns to the battlefield",
      }),
      chapter([3], [fx.addCounters(ref.target(), 1)], {
        targets: [target.upTo(1, target.creature())],
        label: "A +1/+1 counter on up to one creature",
      }),
    ],
  },
  "Ori, Keeper of Songs": {
    // Storied: read from the text.
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["vigilance"] },
        { condition: cond.enduringStory, label: "Enduring story: +1/+0 and vigilance" },
      ),
    ],
  },
  "The Queen of Dale": {
    abilities: [
      // "Their first noncreature spell each turn": the turn log counts only one for that player; a trigger condition
      // (checked on cast only), not an "if" checked again on resolution.
      triggered(when.castSpell("opponent", { notTypes: ["Creature"] }), recruit(), {
        triggerCondition: cond.not(cond.amountAtLeast(amount.noncreatureCastBy(ref.eventPlayer), 2)),
        label: "An opponent's first noncreature spell this turn: recruit",
      }),
    ],
  },
  "Roads Go Ever, Ever On": {
    abilities: [
      chapter(
        [1],
        [
          fx.search({ ...BASIC_LAND, subtype: "Plains" }, { to: "exile" }, 2, undefined, "plains"),
          fx.link(ref.stored("plains")),
          fx.gainLife(2),
        ],
        { label: "Exile up to two basic Plains from your library; you gain 2 life" },
      ),
      chapter([2, 3], [fx.chooseAmong(ref.linked, ref.you, "c", { anyZone: true }), fx.toHand(ref.stored("c"))], {
        label: "A card exiled with this Saga to its owner's hand",
      }),
      chapter(
        [4],
        [
          fx.emblem(
            "Roads Go Ever, Ever On",
            msg(
              "Whenever you attack this turn, target creature you control gets +1/+1 until end of turn for each Plains you control.",
            ),
            [
              triggered(
                when.attackWith(1),
                [
                  fx.pump(
                    ref.target(),
                    amount.count({ subtype: "Plains", controller: "you" }),
                    amount.count({ subtype: "Plains", controller: "you" }),
                  ),
                ],
                {
                  targets: [target.creature("t", { controller: "you" })],
                  label: "+1/+1 for each Plains you control",
                },
              ),
            ],
            false,
            true,
          ),
        ],
        { label: "This turn, each attack pumps one of your creatures" },
      ),
    ],
  },
  "Settle the Wreckage": {
    spell: spell(
      [target.player("t")],
      [
        // "That player may search for that many basic land cards" (zero up to that many): the number is that of the
        // exiled attacking creatures, tokens included. It is counted before the exile (an exiled token ceases to
        // exist), hence the search done first; the lands enter tapped and don't attack, the order changes nothing.
        fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, amount.refCount(ATTACKERS_OF_TARGET), ref.target()),
        fx.exile(ATTACKERS_OF_TARGET),
      ],
    ),
  },
  "Stone by Sunlight": {
    spell: modal(
      mode(
        "Destroy a creature with power 4 or greater",
        [{ ...target.creature("t", { minPower: 4 }), label: "creature with power 4 or greater" }],
        [fx.destroy(ref.target())],
      ),
      mode(
        "The creature becomes an artifact and gains indestructible",
        [target.creature("c")],
        [fx.modify(ref.target("c"), { addTypes: ["Artifact"], addKeywords: ["indestructible"] })],
      ),
    ),
  },
  "Thorin's Last Stand": {
    spell: modal(
      mode("Your creatures get +2/+1", [], [fx.pumpAll(CREATURES_YOU_CONTROL, 2, 1)]),
      mode(
        "Destroy an artifact or enchantment; you gain 2 life",
        [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        [fx.destroy(ref.target()), fx.gainLife(2)],
      ),
    ),
  },
  // Adventure: An Unexpected Party // At the Door.
  "An Unexpected Party": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { ...CREATURES_YOU_CONTROL, chosen: "subtype" },
        { power: 2, toughness: 2 },
        { label: "Your creatures of the chosen type get +2/+2" },
      ),
    ],
  },
  "At the Door": { spell: spell([], [fx.createTokens(DWARF, amount.x)]) },
  // Adventure: the creature has only flying.
  "Velvetwing Butterflies": {},
  "Gaze in Wonder": {
    spell: spell([{ ...target.between(1, 2, target.creature()), label: "one or two creatures" }], [fx.tap(ref.target())]),
  },
  "Vow to Erebor": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [
        fx.untap(ref.target()),
        fx.pump(ref.target(), 2, 2),
        ...fx.when(
          cond.targetMatches("t", { subtype: "Dwarf" }),
          fx.may(
            "Attach an Equipment you control to this Dwarf?",
            fx.chooseAmong(ref.permanentsOf(ref.you, { subtype: "Equipment" }), ref.you, "e"),
            fx.attach(ref.target(), ref.stored("e")),
          ),
        ),
      ],
    ),
  },
};
