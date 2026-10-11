/** Marvel's Spider-Man — colorless cards and lands (lot A). */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  entersWith,
  FOOD,
  fx,
  HUMAN_CITIZEN,
  manaAbility,
  ROBOT_FLYER,
  ref,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Two-color lands "enters tapped; {T}: add {X} or {Y}; {4}, {T}: surveil 1". */
const surveilLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    manaAbility([a, b]),
    activated({ mana: "{4}", tap: true, effects: [fx.surveil(1)], label: "Surveil 1" }),
  ],
});

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Artifacts ---------------------------------------------------------------
  "Bagel and Schmear": {
    abilities: [
      activated({
        mana: "{W}",
        tap: true,
        sacrifice: true,
        sorcerySpeed: true,
        targets: [target.upTo(1, target.creature("t"))],
        effects: [fx.addCounters(ref.target(), 1), fx.draw(1)],
        label: "Share: a +1/+1 counter on up to one creature, draw a card",
      }),
      activated({
        mana: "{2}",
        tap: true,
        sacrifice: true,
        effects: [fx.gainLife(3), fx.draw(1)],
        label: "Nosh: you gain 3 life and draw a card",
      }),
    ],
  },
  "Doc Ock's Tentacles": {
    // Equip {5}: read from the text.
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", minManaValue: 5 }),
        fx.may("Attach Doc Ock's Tentacles to that creature?", fx.attach(ref.eventObject)),
        { label: "You may attach it to the creature with mana value 5 or greater" },
      ),
      staticAbility("attached", { power: 4, toughness: 4 }, { label: "+4/+4" }),
    ],
  },
  "Eerie Gravestone": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" }),
      activated({
        mana: "{1}{B}",
        sacrifice: true,
        effects: [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Creature"] },
            { to: "hand" },
            { count: 1, min: 0, pool: ref.stored("m"), prompt: "You may put a milled creature card into your hand" },
          ),
        ],
        label: "Mill four cards, a creature card to your hand",
      }),
    ],
  },
  "Hot Dog Cart": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food token" }),
      manaAbility(["W", "U", "B", "R", "G"]),
    ],
  },
  "Living Brain, Mechanical Marvel": {
    abilities: [
      triggered(
        when.yourCombat,
        [fx.modify(ref.target(), { addTypes: ["Artifact", "Creature"], setPower: 3, setToughness: 3 }), fx.untap(ref.target())],
        {
          targets: [
            target.permanent("t", ["Artifact"], { controller: "you", notSubtype: "Equipment" }, "non-Equipment artifact"),
          ],
          label: "A non-Equipment artifact you control becomes a 3/3 creature and untaps",
        },
      ),
    ],
  },
  "Mechanical Mobster": {
    abilities: [
      triggered(when.entersSelf, [fx.exileCard(ref.target("g")), fx.connive(ref.target("c"))], {
        targets: [target.upTo(1, target.cardInGraveyard("g", {}, "any")), target.creature("c", { controller: "you" })],
        label: "Exiles up to one card from a graveyard; a creature you control connives",
      }),
    ],
  },
  "News Helicopter": {
    // Flying: read from the text.
    abilities: [triggered(when.entersSelf, [fx.createTokens(HUMAN_CITIZEN)], { label: "A 1/1 Human Citizen token" })],
  },
  "Passenger Ferry": {
    // Crew 2: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayPay(
          "{U}",
          "Pay {U} so that another target attacking creature can't be blocked this turn?",
          fx.reflexive(
            [{ ...target.creature("t", { attacking: true, other: true }), label: "other attacking creature" }],
            [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
          ),
        ),
        { label: "Pay {U}: another attacking creature can't be blocked" },
      ),
    ],
  },
  "Peter Parker's Camera": {
    abilities: [
      entersWith({ counters: 3, counterKind: "film", label: "Enters with three film counters" }),
      activated({
        mana: "{2}",
        tap: true,
        removeCounters: { kind: "film", n: 1 },
        targets: [
          {
            id: "t",
            label: "activated or triggered ability you control",
            filter: { stackItems: { only: "abilities", controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copy an activated or triggered ability you control",
      }),
    ],
  },
  "Rocket-Powered Goblin Glider": {
    // Equip {2} and Mayhem {2}: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        condition: cond.castFromGraveyard,
        targets: [target.creature("t", { controller: "you" })],
        label: "Cast from the graveyard: attach it to a creature you control",
      }),
      staticAbility("attached", { power: 2, addKeywords: ["flying", "haste"] }, { label: "+2/+0, flying and haste" }),
    ],
  },
  "Spider-Bot": {
    // Reach: read from the text.
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Search for a basic land card to put on top?", fx.search(BASIC_LAND, { to: "libraryTop" })),
        { label: "You may put a basic land on top of your library" },
      ),
    ],
  },
  "Spider-Mobile": {
    // Trample and crew 2: read from the text.
    abilities: [when.attacksSelf, when.blocks("self")].map((w) =>
      triggered(
        w,
        [
          fx.pump(
            ref.self,
            amount.count({ subtype: "Spider", controller: "you" }),
            amount.count({ subtype: "Spider", controller: "you" }),
          ),
        ],
        { label: "+1/+1 for each Spider you control" },
      ),
    ),
  },
  "Spider-Slayer, Hatred Honed": {
    abilities: [
      triggered(
        when.dealsDamage("self", { to: { objects: { subtype: "Spider" } }, eventObject: "damaged" }),
        [fx.destroy(ref.eventObject)],
        { label: "Destroys the Spider it damaged" },
      ),
      activated({
        mana: "{6}",
        fromGraveyard: true,
        exileSelf: true,
        effects: [fx.createTappedTokens(ROBOT_FLYER, 2)],
        label: "Two tapped 1/1 flying Robots",
      }),
    ],
  },
  "Spider-Suit": {
    // Equip {3}: read from the text.
    abilities: [
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addSubtypes: ["Spider", "Hero"] },
        { label: "+2/+2, Spider Hero in addition to its other types" },
      ),
    ],
  },
  "Steel Wrecking Ball": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(5, ref.target())], {
        targets: [target.creature("t")],
        label: "5 damage to a creature",
      }),
      activated({
        mana: "{1}{R}",
        fromHand: true,
        discardSelf: true,
        targets: [target.permanent("t", ["Artifact"], {}, "artifact")],
        effects: [fx.destroy(ref.target())],
        label: "Discard it: destroy an artifact",
      }),
    ],
  },
  "Subway Train": {
    // Crew 2: read from the text.
    abilities: [
      triggered(when.entersSelf, fx.mayPay("{G}", "Pay {G} to search for a basic land card?", fx.search(BASIC_LAND)), {
        label: "Pay {G}: a basic land to your hand",
      }),
    ],
  },

  // --- Lands -------------------------------------------------------------------
  "Daily Bugle Building": {
    abilities: [
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [{ ...target.creature("t", { legendary: true }), label: "legendary creature" }],
        effects: [fx.modify(ref.target(), { addKeywords: ["menace"] })],
        label: "Smear Campaign: a legendary creature gains menace",
      }),
    ],
  },
  "Ominous Asylum": surveilLand("B", "R"),
  "Savage Mansion": surveilLand("R", "G"),
  "Sinister Hideout": surveilLand("U", "B"),
  "Suburban Sanctuary": surveilLand("G", "W"),
  "University Campus": surveilLand("W", "U"),
  "Vibrant Cityscape": {
    abilities: [
      activated({
        tap: true,
        sacrifice: true,
        effects: [fx.search(BASIC_LAND, { to: "battlefield", tapped: true })],
        label: "Search for a basic land",
      }),
    ],
  },
};
