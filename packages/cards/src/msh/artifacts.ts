/** Marvel Super Heroes — colorless cards and lands. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cond,
  entersWith,
  fx,
  manaAbility,
  mode,
  playerStatic,
  ROBOT_VILLAIN,
  ref,
  SOLDIER,
  staticAbility,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const ANY_COLOR: ManaType[] = ["W", "U", "B", "R", "G"];

/** Two-color lands "enters tapped; when it enters, you gain 1 life". */
const gainLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    entersWith({ tapped: true }),
    triggered(when.entersSelf, [fx.gainLife(1)], { label: "You gain 1 life" }),
    manaAbility([a, b]),
  ],
});

/** "{T}: Add {C}. {T}: Add {X} or {Y}. Activate only if it entered this turn or if you control a basic land." */
const fastLand = (a: ManaType, b: ManaType): CardScript => ({
  abilities: [
    manaAbility("C"),
    manaAbility([a, b], 1, {
      condition: cond.any(cond.sourceMatches({ enteredThisTurn: true }), cond.controls({ types: ["Land"], basic: true })),
    }),
  ],
});

/** Mana of any color, only for a spell or an ability of a source of the subtype. */
const tribalMana = (subtype: string) =>
  manaAbility(ANY_COLOR, 1, { restriction: { spell: { subtype }, abilityOfSource: { subtype } } });

export const ARTIFACTS: Record<string, CardScript> = {
  // --- Artifacts ---------------------------------------------------------------
  "A.I.M. Synthoids": {
    abilities: [triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" })],
  },
  "Captain America's Shield": {
    // Indestructible and Equip {2}: read from the text.
    abilities: [
      staticAbility("attached", { toughness: 8, addKeywords: ["vigilance"] }, { label: "+0/+8 and vigilance" }),
      triggered(when.attacks({ types: ["Creature"], attached: "host" }), [fx.tap(ref.target())], {
        targets: [target.of(ref.defendingPlayer, target.creature("t"), "creature defending player controls")],
        label: "Tap a creature defending player controls",
      }),
    ],
  },
  "Cosmic Cube": {
    // Ward {2}: read from the text.
    abilities: [
      triggered(
        when.attackWith(1),
        [
          // The card to cast is chosen among the top six, the rest goes to the bottom. Approximation: the chosen card
          // is exiled while it is cast (so everyone sees it, even if you decline to cast it).
          fx.lookAtTop(6, {
            filter: { notTypes: ["Land"] },
            maxManaValue: amount.maxPower({ types: ["Creature"], controller: "you", attacking: true }),
            to: { to: "exile" },
            rest: "bottom",
            store: "c",
          }),
          fx.castNow(ref.stored("c"), { free: true, storeRest: "r" }),
          // Spell declined: the card goes to the bottom of the library, under the others.
          fx.moveTo(ref.stored("r"), { to: "libraryBottom" }),
        ],
        { label: "Cast a spell from among the top six cards for free" },
      ),
    ],
  },
  "Dependable Quinjet": {
    // Flying and crew 4: read from the text.
    abilities: [manaAbility(ANY_COLOR)],
  },
  "H.E.R.B.I.E. Scout Unit": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.draw(1),
          fx.pickFromZone(
            "hand",
            { types: ["Land"] },
            { to: "battlefield", tapped: true },
            {
              count: 1,
              min: 0,
              prompt: "You may put a land card from your hand onto the battlefield tapped",
            },
          ),
        ],
        { label: "Draw, then you may put a land onto the battlefield tapped" },
      ),
    ],
  },
  "Iron Man Armor": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it to a creature you control",
      }),
      staticAbility("attached", { power: 2, toughness: 1, addKeywords: ["flying"] }, { label: "+2/+1 and flying" }),
      activated({
        mana: "{2}",
        effects: fx.when(
          cond.not(cond.sourceMatches({ types: ["Creature"] })),
          fx.modify(ref.self, {
            addTypes: ["Creature"],
            addSubtypes: ["Construct", "Hero"],
            setPower: 0,
            setToughness: 0,
            addKeywords: ["flying"],
            addAbilities: [
              staticAbility(
                "self",
                { power: 1, toughness: 1 },
                { per: { types: ["Artifact"], controller: "you" }, label: "+1/+1 for each artifact you control" },
              ),
            ],
          }),
        ),
        label: "Becomes a 0/0 Construct Hero artifact creature with flying",
      }),
    ],
  },
  "S.H.I.E.L.D. Helicarrier": {
    // Flying and crew 6: read from the text.
    abilities: [triggered(when.entersSelf, [fx.createTokens(SOLDIER, 2)], { label: "Two 1/1 Soldiers" })],
  },
  "The Ten Rings": {
    abilities: [
      playerStatic({ maxHandSize: 10, label: "Maximum hand size: ten" }),
      triggered(when.yourEndStep, [fx.draw(amount.plus(10, amount.neg(amount.cardsIn("hand"))))], {
        condition: cond.handAtMost(ref.you, 9),
        label: "Draw up to ten cards in hand",
      }),
    ],
  },
  "Ultron, Artificial Malevolence": {
    abilities: [
      triggered(
        when.enters({ types: ["Artifact"], controller: "you", token: false, other: true }),
        fx.mayPay(
          "{2}",
          "Pay {2} to create a token that's a copy of this artifact?",
          fx.copyToken(ref.eventObject, { store: "tok" }),
          fx.when(
            cond.not(cond.refMatches(ref.stored("tok"), { types: ["Creature"] })),
            fx.modify(
              ref.stored("tok"),
              { addTypes: ["Creature"], addSubtypes: ["Robot", "Villain"], setPower: 2, setToughness: 2 },
              "permanent",
            ),
          ),
        ),
        { label: "Pay {2}: a token copy of the artifact (a 2/2 Robot Villain creature if needed)" },
      ),
    ],
  },
  "Ultron Drone": {
    abilities: [
      activated({
        mana: "{6}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2), fx.createTokens(ROBOT_VILLAIN)],
        label: "Power-up: two +1/+1 counters and a 2/2 Robot Villain",
      }),
    ],
  },
  "Vibranium Energy Daggers": {
    // Indestructible and Equip {3}: read from the text.
    abilities: [staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" })],
  },
  "The Vision": {
    // Flying and vigilance: read from the text.
    abilities: [
      triggeredModal(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [
          mode("Solar Beam: double strike", [], [fx.pump(ref.self, 0, 0, ["doubleStrike"])]),
          mode("Density Control: indestructible", [], [fx.pump(ref.self, 0, 0, ["indestructible"])]),
          mode("Technopathy: draw a card", [], [fx.draw(1)]),
        ],
        { uniqueModes: "turn", label: "A mode not chosen yet this turn" },
      ),
    ],
  },
  "Viv Vision, Teen Synthezoid": {
    // Flying: read from the text.
    abilities: [
      triggered(when.attacksSelf, fx.when(cond.sourceMatches({ minPower: 4 }), fx.draw(1)), {
        label: "Cybernetic Senses: draw if its power is 4 or greater",
      }),
      activated({
        mana: "{7}",
        powerUp: true,
        effects: [fx.addCounters(ref.self, 2)],
        label: "Power-up: two +1/+1 counters",
      }),
    ],
  },

  // --- Lands -------------------------------------------------------------------
  "A.I.M. Labs": gainLand("U", "B"),
  "Asgardian Citadel": gainLand("R", "W"),
  "Avengers Hangar": gainLand("W", "U"),
  "Avengers Tower": {
    abilities: [
      manaAbility("C"),
      tribalMana("Hero"),
      activated({
        mana: "{4}",
        tap: true,
        // "In any order": the rest goes to the bottom in a random order.
        effects: [fx.lookAtTop(3, { filter: { subtype: "Hero" }, rest: "bottom" })],
        label: "Look at the top three cards: a Hero card into your hand",
      }),
    ],
  },
  "Baxter Building": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{4}",
        tap: true,
        // "Four mana in any combination of colors": one division (PLAN-L L3).
        effects: [fx.addManaCombination(4)],
        label: "Four mana in any combination of colors",
      }),
      activated({
        mana: "{4}",
        tap: true,
        activationCondition: cond.controls({ types: ["Creature"], minToughness: 4 }),
        effects: [fx.draw(1)],
        label: "Draw a card (creature with toughness 4 or greater)",
      }),
    ],
  },
  "Birnin Zana Plaza": gainLand("G", "W"),
  "Dark Fortress": fastLand("B", "R"),
  "Fisk Tower": gainLand("W", "B"),
  "Gathering Place": fastLand("G", "W"),
  "Hell's Kitchen": gainLand("B", "R"),
  "Los Diablos Missile Base": gainLand("R", "G"),
  "Pym Technologies": gainLand("G", "U"),
  "Stark Industries": gainLand("U", "R"),
  "Subterranean Cavern": gainLand("B", "G"),
  "Surveillance Room": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      manaAbility("C"),
      activated({ mana: "{1}", tap: true, effects: [fx.addManaChoice(1)], label: "One mana of any color" }),
    ],
  },
  "Training Compound": fastLand("R", "G"),
  "Villainous Hideout": {
    abilities: [
      manaAbility("C"),
      tribalMana("Villain"),
      activated({
        mana: "{3}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", subtype: "Villain" })],
        effects: [fx.connive(ref.target())],
        label: "A Villain you control connives",
      }),
    ],
  },
  // Improvise: read from the text.
  "Arc Reactor": {
    abilities: [entersWith({ tapped: true }), manaAbility("C", 3)],
  },
  "Super-Adaptoid": {
    cda: { power: amount.count({ types: ["Creature"], controller: "you", legendary: true }) },
    abilities: [when.entersSelf, when.attacksSelf].map((w) =>
      triggered(
        w,
        (
          [
            "haste",
            "flying",
            "firstStrike",
            "doubleStrike",
            "deathtouch",
            "indestructible",
            "lifelink",
            "menace",
            "reach",
            "trample",
            "vigilance",
          ] as const
        ).flatMap((k) =>
          fx.when(
            cond.all(cond.targetMatches("t", { keyword: k }), cond.not(cond.sourceMatches({ keyword: k }))),
            fx.counters(ref.self, k),
          ),
        ),
        {
          targets: [target.creature("t", { other: true })],
          label: "A counter of each ability of the target creature that it doesn't have",
        },
      ),
    ),
  },
};
