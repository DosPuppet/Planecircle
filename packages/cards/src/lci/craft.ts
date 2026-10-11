/** The Lost Caverns of Ixalan — craft cards (Craft with …) and their back faces. Scripts by face name. */
import {
  ARTIFACT_ENTERED,
  ARTIFACT_OR_CREATURE,
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  craft,
  descend,
  entersWith,
  fx,
  GNOME,
  GOLEM_4,
  manaAbility,
  ref,
  staticAbility,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const ARTIFACT = { filter: { types: ["Artifact" as const] }, count: 1 };
const CREATURE = { filter: { types: ["Creature" as const] }, count: 1 };
const ARTIFACT_OR_CREATURE_TARGET = targetObj("t", ARTIFACT_OR_CREATURE, "artifact or creature");
const mayMillTwo = [...fx.may("Mill two cards?", fx.mill(2))];

export const CRAFT: Record<string, CardScript> = {
  // --- White ------------------------------------------------------------------
  "Clay-Fired Bricks": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ types: ["Land"], basic: true, subtype: "Plains" }), fx.gainLife(2)], {
        label: "Basic Plains into your hand, +2 life",
      }),
      craft("{5}{W}{W}", ARTIFACT),
    ],
  },
  "Cosmium Kiln": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GNOME, 2)], { label: "Two 1/1 Gnomes" }),
      staticAbility(CREATURE_YOU_CONTROL, { power: 1, toughness: 1 }, { label: "Your creatures +1/+1" }),
    ],
  },
  "Market Gnome": {
    abilities: [
      triggered(when.diesSelf, [fx.gainLife(1), fx.draw(1)], { label: "+1 life, draw" }),
      triggered({ on: "leaves", who: "self", to: "exile", whileCrafting: true }, [fx.gainLife(1), fx.draw(1)], {
        label: "Exiled for a craft: +1 life, draw",
      }),
    ],
  },
  "Oteclan Landmark": {
    abilities: [triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }), craft("{2}{W}", ARTIFACT)],
  },
  "Oteclan Levitator": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["flying"])], {
        targets: [target.creature("t", { attacking: true, not: { keyword: "flying" } })],
        label: "Flying",
      }),
    ],
  },
  "Spring-Loaded Sawblades": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t", { tapped: true, controller: "opponent" })],
        label: "5 damage",
      }),
      craft("{3}{W}", ARTIFACT),
    ],
  },
  "Bladewheel Chariot": {
    abilities: [
      activated({
        tapOthers: { filter: { types: ["Artifact"] }, count: 2 },
        effects: [fx.animateVehicle()],
        label: "Tap two artifacts: becomes a creature",
      }),
    ],
  },
  // --- Blue -------------------------------------------------------------------
  "Braided Net": {
    abilities: [
      entersWith({ counters: 3, counterKind: "net", label: "Enters with three net counters" }),
      activated({
        tap: true,
        removeCounters: { kind: "net", n: 1 },
        targets: [target.nonland("t", { other: true })],
        effects: [fx.tap(ref.target()), fx.modifyWhileAffectedTapped(ref.target(), { addKeywords: ["noActivatedAbilities"] })],
        label: "Tap a nonland permanent",
      }),
      craft("{1}{U}", ARTIFACT),
    ],
  },
  "Braided Quipu": {
    abilities: [
      activated({
        mana: "{3}{U}",
        tap: true,
        effects: [
          fx.draw(amount.count({ types: ["Artifact"], controller: "you" })),
          fx.moveTo(ref.self, { to: "libraryTop", fromTop: 3 }),
        ],
        label: "A card for each artifact, then third from the top",
      }),
    ],
  },
  "Inverted Iceberg": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(1), fx.draw(1)], { label: "Mill a card, draw one" }),
      craft("{4}{U}{U}", ARTIFACT),
    ],
  },
  "Iceberg Titan": {
    abilities: [
      // "You may tap or untap": the target on triggering, the action on resolution (like Granite Witness).
      triggered(
        when.attacksSelf,
        [
          ...fx.when(
            cond.refMatches(ref.target(), { tapped: false }),
            fx.mayForStore(ref.you, "Tap the target?", "e", fx.tap(ref.target())),
          ),
          ...fx.when(
            cond.all(cond.not(cond.v("e")), cond.refMatches(ref.target(), { tapped: true })),
            fx.may("Untap the target?", fx.untap(ref.target())),
          ),
        ],
        { targets: [ARTIFACT_OR_CREATURE_TARGET], label: "You may tap or untap an artifact or creature" },
      ),
    ],
  },
  "Lodestone Needle": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun", 2)], {
        targets: [target.optional(ARTIFACT_OR_CREATURE_TARGET)],
        label: "Tap it, two stun counters",
      }),
      craft("{2}{U}", ARTIFACT),
    ],
  },
  "Guidestone Compass": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.explore(ref.target())],
        label: "A creature explores",
      }),
    ],
  },
  "Waterlogged Hulk": {
    abilities: [
      activated({ tap: true, effects: [fx.mill(1)], label: "Mill a card" }),
      craft("{3}{U}", { filter: { subtype: "Island" }, count: 1 }),
    ],
  },
  "Watertight Gondola": {
    abilities: [
      staticAbility("self", { addKeywords: ["unblockable"] }, { condition: descend(8), label: "Descend 8 — can't be blocked" }),
    ],
  },
  // --- Black ------------------------------------------------------------------
  "Tithing Blade": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachOpponent, { types: ["Creature"] })], {
        label: "Each opponent sacrifices a creature",
      }),
      craft("{4}{B}", CREATURE),
    ],
  },
  "Consuming Sepulcher": { abilities: [triggered(when.yourUpkeep, [...fx.drain(1)], { label: "Drain 1" })] },
  "Visage of Dread": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.target(), { filter: ARTIFACT_OR_CREATURE, chooser: "controller" })], {
        targets: [target.player("t", "opponent")],
        label: "Discard an artifact or creature",
      }),
      craft("{5}{B}", { filter: { types: ["Creature"] }, count: 2 }),
    ],
  },
  "Dread Osseosaur": {
    abilities: [when.entersSelf, when.attacksSelf].map((t) => triggered(t, mayMillTwo, { label: "Mill two cards" })),
  },
  // --- Red --------------------------------------------------------------------
  "Dire Flail": {
    abilities: [staticAbility("attached", { power: 2 }, { label: "+2/+0" }), craft("{3}{R}{R}", ARTIFACT)],
  },
  "Dire Blunderbuss": {
    abilities: [
      staticAbility("attached", { power: 3 }, { label: "+3/+0" }),
      triggered(
        when.attacks({ attached: "host" }),
        [
          fx.sacrifice(ref.you, { types: ["Artifact"], other: true }, 1, { optional: true, store: "s" }),
          ...fx.when(
            cond.v("s"),
            fx.reflexive([target.creature()], [fx.damage(amount.powerOf(ref.target("a")), ref.target(), ref.target("a"))], {
              a: ref.eventObject,
            }),
          ),
        ],
        { label: "Sacrifice an artifact: damage equal to its power" },
      ),
    ],
  },
  "Idol of the Deep King": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(2, ref.target())], { targets: [target.any()], label: "2 damage" }),
      craft("{2}{R}", ARTIFACT),
    ],
  },
  "Sovereign's Macuahuitl": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it",
      }),
      staticAbility("attached", { power: 2 }, { label: "+2/+0" }),
    ],
  },
  "Saheeli's Lattice": {
    abilities: [
      triggered(when.entersSelf, [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.draw(2))], {
        label: "Discard: draw two cards",
      }),
      craft("{4}{R}", { filter: { subtype: "Dinosaur" }, count: 1, orMore: true }),
    ],
  },
  "Mastercraft Raptor": { cda: { power: amount.linkedTotalPower } },
  // --- Green ------------------------------------------------------------------
  "Jade Seedstones": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(3, ref.target())], {
        targets: [target.between(1, 3, target.creature("t", { controller: "you" }))],
        label: "Distribute three +1/+1 counters",
      }),
      craft("{5}{G}{G}", { ...CREATURE, preferHighManaValue: true }),
    ],
  },
  "Jadeheart Attendant": {
    abilities: [
      triggered(when.entersSelf, [fx.gainLife(amount.manaValueOf(ref.linked))], {
        label: "Life equal to the exiled card's mana value",
      }),
    ],
  },
  "Kaslem's Stonetree": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.lookAtTop(6, { filter: { types: ["Land"] }, count: 1, to: { to: "battlefield", tapped: true }, rest: "bottom" })],
        { label: "A tapped land from the top six cards" },
      ),
      craft("{5}{G}", { filter: { subtype: "Cave" }, count: 1 }),
    ],
  },
  // --- Multicolored and colorless -------------------------------------------------
  "Master's Guide-Mural": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(GOLEM_4)], { label: "4/4 Golem" }), craft("{4}{W}{W}{U}", ARTIFACT)],
  },
  "Master's Manufactory": {
    abilities: [
      activated({
        tap: true,
        activationCondition: ARTIFACT_ENTERED,
        effects: [fx.createTokens(GOLEM_4)],
        label: "4/4 Golem",
      }),
    ],
  },
  "Sunbird Standard": {
    abilities: [manaAbility(["W", "U", "B", "R", "G"]), craft("{5}", { count: 1, orMore: true, distinctColors: true })],
  },
  "Sunbird Effigy": {
    cda: { pt: amount.linkedColors },
    abilities: [
      activated({
        tap: true,
        effects: [{ op: "addManaColorsAmong", filter: {}, linked: true }],
        label: "One mana of each color among the exiled cards",
      }),
    ],
  },
  "Throne of the Grim Captain": {
    abilities: [
      activated({ tap: true, effects: [fx.mill(2)], label: "Mill two cards" }),
      craft("{4}", {
        count: 4,
        each: [{ subtype: "Dinosaur" }, { subtype: "Merfolk" }, { subtype: "Pirate" }, { subtype: "Vampire" }],
      }),
    ],
  },
  "The Grim Captain": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.sacrifice(ref.eachOpponent, { notTypes: ["Land"] }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "battlefield", tapped: true, attacking: true, underYourControl: true },
            { count: 1, min: 0, pool: ref.linked, prompt: "Exiled creature card to put onto the battlefield attacking" },
          ),
        ],
        { label: "Opponent sacrifices; an exiled creature attacks" },
      ),
    ],
  },
};
