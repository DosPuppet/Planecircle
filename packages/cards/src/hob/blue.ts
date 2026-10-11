/**
 * The Hobbit — blue cards (lot A). Recruit: "Draw a card, then discard a card. If you discarded a nonland card, create
 * a 1/1 white Human Soldier token" (`recruit`, in hob/common.ts).
 */
import type { CardType, ModeDef, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  doesntUntap,
  equipAbility,
  flashback,
  fx,
  modal,
  mode,
  playerStatic,
  recruit,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const INSTANT_SORCERY: ObjectFilter = { types: ["Instant", "Sorcery"] };

/** Recruit: draw, discard; a discarded nonland card gives a 1/1 Human Soldier. */
/** "Exile [the target]. If you do, return it at the beginning of the next end step." */
const FLICKER_UNTIL_END_STEP = [
  fx.exileCard(ref.target(), { name: "k" }),
  fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
];

/**
 * Burglar's Plot: "two target nonland permanents that share a card type". One mode per card type (approximation: the
 * "share a card type" constraint does not exist on targets).
 */
const SHARED_TYPES: [CardType, string, string][] = [
  ["Artifact", "Exchange control of two artifacts", "nonland artifacts"],
  ["Creature", "Exchange control of two creatures", "nonland creatures"],
  ["Enchantment", "Exchange control of two enchantments", "nonland enchantments"],
  ["Planeswalker", "Exchange control of two planeswalkers", "nonland planeswalkers"],
  ["Battle", "Exchange control of two battles", "nonland battles"],
];
const exchangeModes: ModeDef[] = SHARED_TYPES.map(([type, label, targetLabel]) =>
  mode(
    label,
    [
      target.permanent("a", [type], { notTypes: ["Land"] }, targetLabel),
      { ...target.permanent("b", [type], { notTypes: ["Land"] }, targetLabel), otherThan: ["a"] },
    ],
    [fx.exchangeControl(ref.target("a"), ref.target("b"))],
  ),
);

export const BLUE: Record<string, CardScript> = {
  // --- Bilbo, Luckwearer // Burglar's Plot ----------------------------------
  "Bilbo, Luckwearer": {
    keywords: ["unblockable"],
    abilities: [triggered(when.combatDamageToPlayer, fx.loot(1), { label: "Loot: draw a card, then discard a card" })],
  },
  "Burglar's Plot": { spell: modal(...exchangeModes) },

  "Bilbo, Thief in the Night": {
    abilities: [
      {
        kind: "costReduction",
        filter: {},
        generic: 1,
        fromZones: ["graveyard", "exile", "library", "command"],
        label: "Spells cast from anywhere other than your hand: {1} less",
      },
      triggered(
        when.attacksSelf,
        [
          fx.castNow(ref.filtered(ref.graveyardOf(ref.you), { types: ["Artifact", "Instant", "Sorcery"] }), {
            after: "exile",
            afterFilter: { types: ["Instant", "Sorcery"] },
          }),
        ],
        { label: "Cast an artifact, instant or sorcery from your graveyard" },
      ),
    ],
  },

  // --- Bilbo Baggins, Burglar // Take a Glance ------------------------------
  "Bilbo Baggins, Burglar": {
    abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })],
  },
  "Take a Glance": { spell: spell([], [fx.scry(2)]) },

  "Confusticate and Bebother": {
    spell: modal(
      mode(
        "Counter a spell unless its controller pays {4}",
        [target.spell()],
        fx.unlessPays(ref.controllerOf(ref.target()), { mana: "{4}" }, fx.counter(ref.target())),
      ),
      mode("Draw two cards, then discard a card", [], [fx.draw(2), fx.discard(1)]),
    ),
  },
  "Elven Raft-Steerer": {
    abilities: [
      triggeredModal(
        when.landfall,
        [
          mode("Tap an opponent's creature", [target.creature("t", { controller: "opponent" })], [fx.tap(ref.target())]),
          mode("Untap a creature you control", [target.creature("t", { controller: "you" })], [fx.untap(ref.target())]),
        ],
        { label: "Landfall: tap an opponent's creature or untap one of yours" },
      ),
    ],
  },
  "Elvenking's Harper": {
    abilities: [
      activated({
        mana: "{4}{U}",
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "A creature can't be blocked this turn",
      }),
    ],
  },
  "Enchanted River's Grasp": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.tap(ref.attached), fx.removeCounters(ref.attached, amount.countersOn(ref.attached, "any"))],
        { label: "Tap the enchanted creature and remove all counters from it" },
      ),
      staticAbility("attached", { loseAllAbilities: true }, { label: "Loses all abilities" }),
      doesntUntap("attached"),
    ],
  },
  "Fateful Discovery": {
    abilities: [triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.draw(1)], { label: "Draw a card" })],
  },
  "Gandalf, Wandering Wizard": {
    // Ward {3}: read from the text.
    abilities: [
      activated({
        mana: "{6}",
        effects: [
          fx.moveTo(ref.self, { to: "libraryTop", shuffle: true }),
          // Its owner draws, even if Gandalf is no longer on the battlefield.
          fx.draw(3, ref.ownerOf(ref.selfCard)),
        ],
        label: "Its owner shuffles it into their library and draws three cards",
      }),
    ],
  },
  "Great Gilded Boat": {
    // Crew 2: read from the text.
    abilities: [triggered(when.attackWith(), recruit(), { label: "Recruitment" })],
  },
  "Lakeshore Apothecary": {
    abilities: [triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Second card drawn: a +1/+1 counter" })],
  },

  // --- Lake-town Mariners // Gone Fishing -----------------------------------
  "Lake-town Mariners": {},
  "Gone Fishing": {
    spell: spell(
      [
        target.exactly(
          2,
          target.permanent("t", ["Creature", "Land"], { controller: "you" }, "creatures and/or lands you control"),
        ),
      ],
      [fx.exileCard(ref.target(), { name: "k" }), fx.toBattlefield(ref.stored("k"))],
    ),
  },

  "Long Lake Nuisance": {
    abilities: [triggered(when.entersSelf, recruit(), { label: "Recruitment" })],
  },
  "The Lord of the Eagles": {
    costReduction: {
      generic: amount.totalPower({ types: ["Creature"], controller: "you", keyword: "flying" }),
    },
  },
  "Mirkwood Meditator": {
    abilities: [
      triggered(
        when.landfall,
        fx.may("Its base power and toughness become 4/2?", fx.modify(ref.self, { setPower: 4, setToughness: 2 })),
        { label: "Landfall: base P/T 4/2 until end of turn" },
      ),
    ],
  },

  // --- Most Decrepit Old Bird // Speak Secrets ------------------------------
  "Most Decrepit Old Bird": {
    abilities: [staticAbility("self", { power: 1, toughness: 1 }, { condition: cond.threshold, label: "Threshold: +1/+1" })],
  },
  "Speak Secrets": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone("graveyard", INSTANT_SORCERY, { to: "hand" }, { pool: ref.stored("m"), prompt: "An instant or sorcery" }),
      ],
    ),
  },

  "Old Fat Spider Can't See Me": {
    abilities: [
      chapter([1], [fx.modifyWhileSource(ref.target(), { addKeywords: ["hexproof"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Chapter I — One of your creatures has hexproof while the Saga remains",
      }),
      // A prevention effect whose source is "that creature" (frozen on resolution), not an ability of the creature.
      chapter([2], [fx.whileSource({ replacement: { event: "damage", sourceRef: ref.target(), modify: { prevent: true } } })], {
        targets: [target.upTo(1, target.creature())],
        label: "Chapter II — Prevent the damage of up to one creature while the Saga remains",
      }),
      chapter([3, 4], [fx.draw(1)], { label: "Chapters III, IV — Draw a card" }),
    ],
  },
  "Plunder the Trollshaws": {
    castOptions: [flashback("{3}{U}")],
    spell: spell(
      [],
      [...fx.when(cond.spellCastFromGraveyard, fx.draw(2)), ...fx.when(cond.not(cond.spellCastFromGraveyard), fx.draw(1))],
    ),
  },
  "Ravenhill Flock": {
    abilities: [triggered(when.draw(), [fx.addCounters(ref.self, 1)], { label: "A +1/+1 counter" })],
  },
  "Riddles in the Dark": { spell: spell([], [fx.piles(4)]) },
  "Roll-Roll-Roll-Roll": {
    abilities: [
      chapter([1, 2, 3, 4], FLICKER_UNTIL_END_STEP, {
        targets: [
          target.upTo(1, target.permanent("t", ["Creature", "Land"], { controller: "you" }, "creature or land you control")),
        ],
        label: "Exile up to one of your creatures or lands; it returns at the next end step",
      }),
    ],
  },
  "Sound the Trumpets": {
    spell: spell(
      [target.spell()],
      [fx.counter(ref.target()), ...fx.when(cond.targetMatches("t", { maxManaValue: 2 }), recruit())],
    ),
  },
  "Uncover the Moon-Letters": {
    abilities: [
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        fx.may("Draw X cards (the mana spent), then discard two?", fx.draw(amount.eventManaSpent), fx.discard(2)),
        { label: "Noncreature spell: draw X cards, then discard two" },
      ),
    ],
  },
  "Uneasy Partings": {
    costReduction: { generic: 1, condition: cond.targetMatches("t", { attacking: true, token: false }) },
    spell: spell([target.creature()], [fx.topOrBottom(ref.target())]),
  },
  "Wizard's Staff": {
    // Equip {3}: read from the text.
    abilities: [
      staticAbility("attached", { addKeywords: ["prowess"] }, { label: "Equipped creature has prowess" }),
      playerStatic({
        triggerMod: { effect: "again", sources: { attached: "host" } },
        label: "Triggered abilities of the equipped creature trigger an additional time",
      }),
      equipAbility({ mana: "{1}", filter: { subtype: "Wizard" }, label: "Equip Wizard {1}" }),
    ],
  },
};
