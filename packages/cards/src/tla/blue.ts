/** Avatar: The Last Airbender: blue cards (lot A). */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CLUE,
  chapter,
  cond,
  costReducer,
  doesntUntap,
  exhaust,
  fx,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  SPIRIT_KOH,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Number of Lesson cards in your graveyard. */
const LESSONS = amount.countIn("graveyard", { subtype: "Lesson" });
/** "as long as there are three or more Lesson cards in your graveyard" */
const THREE_LESSONS = cond.amountAtLeast(LESSONS, 3);

export const BLUE: Record<string, CardScript> = {
  "Boomerang Basics": {
    // The controller is read from the last known information of the returned permanent.
    spell: spell(
      [target.nonland()],
      [fx.bounce(ref.target()), ...fx.when(cond.targetMatches("t", { controller: "you" }), fx.draw(1))],
    ),
  },
  "Ember Island Production": {
    spell: modal(
      mode(
        "4/4 Hero copy of a creature you control",
        [target.creature("t", { controller: "you" })],
        [fx.copyToken(ref.target(), { nonlegendary: true, pt: 4, addSubtypes: ["Hero"] })],
      ),
      mode(
        "2/2 Coward copy of a creature an opponent controls",
        [target.creature("u", { controller: "opponent" })],
        [fx.copyToken(ref.target("u"), { nonlegendary: true, pt: 2, addSubtypes: ["Coward"] })],
      ),
    ),
  },
  "First-Time Flyer": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { condition: cond.amountAtLeast(LESSONS, 1), label: "+1/+1 as long as a Lesson is in your graveyard" },
      ),
    ],
  },
  "Flexible Waterbender": {
    abilities: [
      activated({
        mana: "{3}",
        waterbend: true,
        effects: [fx.modify(ref.self, { setPower: 5, setToughness: 2 })],
        label: "Waterbend {3}: base power and toughness 5/2 until end of turn",
      }),
    ],
  },
  "Forecasting Fortune Teller": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(CLUE)], { label: "A Clue" })],
  },
  "Geyser Leaper": {
    abilities: [
      activated({
        mana: "{4}",
        waterbend: true,
        effects: fx.loot(1),
        label: "Waterbend {4}: draw a card, then discard a card",
      }),
    ],
  },
  "Giant Koi": {
    // Islandcycling read from the text.
    abilities: [
      activated({
        mana: "{3}",
        waterbend: true,
        effects: [fx.modify(ref.self, { addKeywords: ["unblockable"] })],
        label: "Waterbend {3}: can't be blocked this turn",
      }),
    ],
  },
  "Gran-Gran": {
    abilities: [
      triggered(when.tapsSelf, fx.loot(1), { label: "Draw a card, then discard a card" }),
      costReducer({ notTypes: ["Creature"] }, 1, "Noncreature spells: {1} less (three Lessons in the graveyard)", {
        condition: THREE_LESSONS,
      }),
    ],
  },
  "Honest Work": {
    enchant: { filter: { types: ["Creature"], controller: "opponent" }, label: "creature an opponent controls" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.tap(ref.attached), fx.removeCounters(ref.attached, amount.countersOn(ref.attached, "any"))],
        { label: "Tap the enchanted creature and remove all counters from it" },
      ),
      staticAbility(
        "attached",
        {
          loseAllAbilities: true,
          setSubtypes: ["Citizen"],
          setPower: 1,
          setToughness: 1,
          setName: "Humble Merchant",
          addAbilities: [manaAbility("C")],
        },
        { label: '1/1 Citizen with "{T}: Add {C}" named Humble Merchant' },
      ),
    ],
  },
  "Invasion Submersible": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland("t", { other: true }))],
        label: "Returns another nonland permanent",
      }),
      exhaust({
        mana: "{3}",
        waterbend: true,
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "permanent"), fx.addCounters(ref.self, 3)],
        label: "Waterbend {3}: becomes an artifact creature with three +1/+1 counters",
      }),
    ],
  },
  "Katara, Bending Prodigy": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.sourceMatches({ tapped: true }),
        label: "Tapped: a +1/+1 counter",
      }),
      activated({ mana: "{6}", waterbend: true, effects: [fx.draw(1)], label: "Waterbend {6}: draw a card" }),
    ],
  },
  "Knowledge Seeker": {
    abilities: [
      triggered(when.draw(2), [fx.addCounters(ref.self, 1)], { label: "Second card drawn: a +1/+1 counter" }),
      triggered(when.diesSelf, [fx.createTokens(CLUE)], { label: "A Clue" }),
    ],
  },
  "The Legend of Kuruk": {
    abilities: [
      chapter([1, 2], [fx.scry(2), fx.draw(1)], { label: "Scry 2, then draw a card" }),
      chapter([3], [fx.exileCard(ref.self, { name: "flip" }), fx.toBattlefield(ref.stored("flip"), { transformed: true })], {
        label: "Returns transformed",
      }),
    ],
  },
  "Avatar Kuruk": {
    abilities: [
      triggered(when.castSpell("you"), [fx.createTokens(SPIRIT_KOH)], { label: "A 1/1 Spirit" }),
      exhaust({
        mana: "{20}",
        waterbend: true,
        effects: [fx.extraTurn],
        label: "Waterbend {20}: an extra turn",
      }),
    ],
  },
  "Lost Days": {
    // The owner chooses: second from the top or on the bottom.
    spell: spell(
      [{ id: "t", label: "creature or enchantment", filter: { objects: { types: ["Creature", "Enchantment"] } } }],
      [fx.topOrBottom(ref.target(), undefined, 2), fx.createTokens(CLUE)],
    ),
  },
  "Master Pakku": {
    // Prowess read from the text.
    abilities: [
      triggered(when.tapsSelf, [fx.mill(LESSONS, ref.target())], {
        targets: [target.player()],
        label: "Target player mills X cards (Lessons in your graveyard)",
      }),
    ],
  },
  "The Mechanist, Aerial Artisan": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.createTokens(CLUE)], { label: "A Clue" }),
      activated({
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { controller: "you", token: true }, "artifact token you control")],
        effects: [
          fx.modify(ref.target(), {
            addTypes: ["Artifact", "Creature"],
            addSubtypes: ["Construct"],
            setPower: 3,
            setToughness: 1,
            addKeywords: ["flying"],
          }),
        ],
        label: "The token becomes a 3/1 flying Construct until end of turn",
      }),
    ],
  },
  "North Pole Patrol": {
    abilities: [
      activated({
        tap: true,
        targets: [{ id: "t", label: "other permanent you control", filter: { objects: { controller: "you", other: true } } }],
        effects: [fx.untap(ref.target())],
        label: "Untap another permanent you control",
      }),
      activated({
        mana: "{3}",
        waterbend: true,
        tap: true,
        targets: [target.creature("t", { controller: "opponent" })],
        effects: [fx.tap(ref.target())],
        label: "Waterbend {3}: tap a creature an opponent controls",
      }),
    ],
  },
  "Octopus Form": {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 1, 1, ["hexproof"]), fx.untap(ref.target())],
    ),
  },
  "Otter-Penguin": {
    abilities: [
      triggered(when.draw(2), [fx.pump(ref.self, 1, 2), fx.modify(ref.self, { addKeywords: ["unblockable"] })], {
        label: "Second card drawn: +1/+2 and can't be blocked this turn",
      }),
    ],
  },
  "Rowdy Snowballers": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap a creature an opponent controls, a stun counter",
      }),
    ],
  },
  "Serpent of the Pass": {
    rules: { flashIf: THREE_LESSONS },
    costReduction: { generic: amount.countIn("graveyard", { notTypes: ["Creature", "Land"] }) },
  },
  "Sokka's Haiku": {
    spell: spell(
      [target.spell("s"), target.permanent("l", ["Land"], {}, "land")],
      [fx.counter(ref.target("s")), fx.draw(1), fx.mill(3), fx.untap(ref.target("l"))],
    ),
  },
  "The Spirit Oasis": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.count({ subtype: "Shrine", controller: "you" }))], {
        label: "Draw a card for each Shrine",
      }),
      triggered(when.enters({ subtype: "Shrine", controller: "you", other: true }), [fx.draw(1)], {
        label: "Another Shrine: draw a card",
      }),
    ],
  },
  "Teo, Spirited Glider": {
    abilities: [
      triggered(
        when.attackWith(1, { keyword: "flying" }),
        [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "nl", storeFilter: { notTypes: ["Land"] } }),
          ...fx.when(
            cond.v("nl"),
            fx.reflexive([target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
          ),
        ],
        { label: "Draw then discard; nonland card: a +1/+1 counter" },
      ),
    ],
  },
  "Tiger-Seal": {
    abilities: [
      triggered(when.yourUpkeep, [fx.tap(ref.self)], { label: "Tap this creature" }),
      triggered(when.draw(2), [fx.untap(ref.self)], { label: "Second card drawn: untap this creature" }),
    ],
  },
  "Ty Lee, Chi Blocker": {
    // Flash and prowess read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        [fx.tap(ref.target()), fx.modifyWhileYouControl(ref.target(), { addAbilities: [doesntUntap("self")] })],
        {
          targets: [target.upTo(1, target.creature())],
          label: "Tap a creature; it doesn't untap as long as you control Ty Lee",
        },
      ),
    ],
  },
  "Waterbender Ascension": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you" }, true),
        [fx.counters(ref.self, "quest"), ...fx.when(cond.counterAtLeast("quest", 4), fx.draw(1))],
        { label: "A quest counter; at 4 or more, draw a card" },
      ),
      activated({
        mana: "{4}",
        waterbend: true,
        targets: [target.creature()],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "Waterbend {4}: a creature can't be blocked this turn",
      }),
    ],
  },
  "Waterbending Scroll": {
    abilities: [
      activated({
        mana: "{6}",
        tap: true,
        reduction: { generic: amount.count({ subtype: "Island", controller: "you" }) },
        effects: [fx.draw(1)],
        label: "Draw a card ({1} less for each Island)",
      }),
    ],
  },
  "Watery Grasp": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      doesntUntap("attached"),
      activated({
        mana: "{5}",
        waterbend: true,
        effects: [fx.moveTo(ref.attached, { to: "libraryTop", shuffle: true })],
        label: "Waterbend {5}: shuffle the enchanted creature into its owner's library",
      }),
    ],
  },
  "Yue, the Moon Spirit": {
    abilities: [
      activated({
        mana: "{5}",
        waterbend: true,
        tap: true,
        effects: [fx.castNow(ref.handOf(ref.you, { notTypes: ["Creature", "Land"] }), { free: true })],
        label: "Waterbend {5}: cast a noncreature spell from your hand for free",
      }),
    ],
  },
  // Waterbend {5} as an additional cost: read from the text.
  "Benevolent River Spirit": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" })],
  },
  // Waterbend {X} as an additional cost: read from the text.
  "Crashing Wave": {
    spell: spell(
      [{ ...target.creature(), count: 99, optional: true, countX: "upTo" }],
      [
        fx.tap(ref.target()),
        fx.countersDivided(3, ref.permanentsOf(ref.eachOpponent, { types: ["Creature"], tapped: true }), {
          counter: "stun",
          anyNumber: true,
        }),
      ],
    ),
  },
  // "you may waterbend {6}": a kicker read from the text.
  "Spirit Water Revival": {
    spell: spell(
      [],
      [
        ...fx.when(
          cond.kicked,
          fx.moveTo(ref.graveyardOf(ref.you), { to: "libraryTop", shuffle: true }),
          fx.draw(7),
          fx.emblem("Spirit Water Revival", msg("You have no maximum hand size."), [
            playerStatic({ maxHandSize: "none", label: "Without maximum hand size" }),
          ]),
        ),
        ...fx.when(cond.not(cond.kicked), fx.draw(2)),
        fx.exileOnResolve,
      ],
    ),
  },
  // "you may waterbend {10}": a kicker read from the text.
  "Secret of Bloodbending": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        ...fx.when(cond.kicked, fx.controlNextTurn(ref.target())),
        ...fx.when(cond.not(cond.kicked), fx.controlNextTurn(ref.target(), true)),
        fx.exileOnResolve,
      ],
    ),
  },
  // Ward—waterbend {4}: read from the text.
  "The Unagi of Kyoshi Island": {
    abilities: [
      triggered(when.draw(2, "opponent"), [fx.draw(2)], {
        label: "An opponent draws their second card each turn: draw two cards",
      }),
    ],
  },
  "Waterbending Lesson": {
    spell: spell([], [fx.draw(3), ...fx.unlessPays(ref.you, { mana: "{2}", waterbend: true }, fx.discard(1))]),
  },
};
