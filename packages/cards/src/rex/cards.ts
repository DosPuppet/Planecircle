/** Jurassic World Collection (REX): card scripts (PLAN-G). */
import { cardRef, type Keyword, msg, type TokenSpec } from "@mtgx/engine";
import { slug } from "../scryfall";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  cost,
  entersWith,
  exploitAbility,
  fx,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

/** Partner with (702.124j): when it enters, target player may search their library for the partner. */
const partnerWith = (name: string) =>
  triggered(
    when.entersSelf,
    fx.mayFor(
      ref.target("p"),
      msg("Search for {card}?", { card: cardRef(slug(name)) }),
      fx.search({ name }, { to: "hand" }, 1, ref.target("p")),
    ),
    { targets: [target.player("p")], label: msg("Partner with {card}", { card: cardRef(slug(name)) }) },
  );

/** Indominus Rex, Alpha: the abilities that give a counter (702.xx, keyword counters). */
const INDOMINUS_KEYWORDS: Keyword[] = [
  "flying",
  "firstStrike",
  "doubleStrike",
  "deathtouch",
  "hexproof",
  "haste",
  "indestructible",
  "lifelink",
  "menace",
  "reach",
  "trample",
  "vigilance",
];

/** Welcome to . . .: a 3/3 green Dinosaur with trample. */
const DINOSAUR_TRAMPLE: TokenSpec = {
  name: "Dinosaur",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Dinosaur"],
  power: 3,
  toughness: 3,
  keywords: ["trample"],
};

export const CARDS: Record<string, CardScript> = {
  "Don't Move": {
    spell: spell(
      [],
      [
        fx.destroyAll({ types: ["Creature"], tapped: true }),
        fx.emblem(
          "Don't Move",
          msg("Until your next turn, whenever a creature becomes tapped, destroy it."),
          [
            triggered({ on: "taps", who: { types: ["Creature"] } }, [fx.destroy(ref.eventObject)], {
              label: "A creature becomes tapped: destroy it",
            }),
          ],
          true,
        ),
      ],
    ),
  },
  "Spitting Dilophosaurus": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.optional(target.creature())],
        label: "A −1/−1 counter on up to one creature",
      }),
      triggered(when.attacksSelf, [fx.counters(ref.target(), "-1/-1")], {
        targets: [target.optional(target.creature())],
        label: "A −1/−1 counter on up to one creature",
      }),
      staticAbility(
        { types: ["Creature"], controller: "opponent", withCounter: "-1/-1" },
        { addKeywords: ["cantBlock"] },
        {
          label: "Creatures your opponents control with a −1/−1 counter can't block",
        },
      ),
    ],
  },
  "Life Finds a Way": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", token: false, minPower: 4 }),
        [
          // Populate (701.30): a copy of a creature token you control.
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], token: true }), ref.you, "p", {
            prompt: "Populate: a creature token",
          }),
          fx.copyToken(ref.stored("p")),
        ],
        { label: "A nontoken creature you control with power 4 or greater enters: populate" },
      ),
    ],
  },
  "Savage Order": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], minPower: 4 }, count: 1 } },
    spell: spell(
      [],
      [
        fx.search({ types: ["Creature"], subtype: "Dinosaur" }, { to: "battlefield" }, 1, undefined, "d"),
        fx.modify(ref.stored("d"), { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
      ],
    ),
  },
  "Compy Swarm": {
    abilities: [
      triggered(when.step("end"), [fx.copyToken(ref.self, { tapped: true })], {
        condition: cond.morbid,
        label: "A creature died this turn: a tapped token copy",
      }),
    ],
  },
  "Ellie and Alan, Paleontologists": {
    abilities: [
      activated({
        tap: true,
        exileFromGraveyard: { filter: { types: ["Creature"] }, count: 1 },
        sorcerySpeed: true,
        effects: [fx.discover(amount.manaValueOf(ref.costExiled))],
        label: "Discover X (the mana value of the exiled card)",
      }),
    ],
  },
  "Permission Denied": {
    spell: spell(
      [target.spell("t", { notTypes: ["Creature"] }, "noncreature spell")],
      [
        fx.counter(ref.target()),
        fx.thisTurn({ castLimit: { who: "opponents", maxSpells: 0, spellTypes: { notTypes: ["Creature"] } } }),
      ],
    ),
  },
  "Ravenous Tyrannosaurus": {
    // Devour 3: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          { op: "damage", amount: amount.powerOf(ref.self), to: ref.target(), storeExcess: "ex" },
          fx.damage(amount.v("ex"), ref.controllerOf(ref.target())),
        ],
        {
          targets: [target.optional(target.creature("t", { other: true }))],
          label: "Damage equal to its power to another creature; the excess to its controller",
        },
      ),
    ],
  },
  // — G4e: hard sub-lot —
  "Grim Giganotosaurus": {
    abilities: [
      // Monstrosity 10 (701.37).
      activated({
        mana: "{10}{B}{G}",
        reduction: { generic: amount.count({ types: ["Creature"], controller: "opponent", minPower: 4 }) },
        effects: [fx.monstrosity(10)],
        label: "Monstrosity 10",
      }),
      triggered(
        when.becomesMonstrous,
        [fx.destroyAll({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], other: true })],
        {
          label: "Becomes monstrous: destroy all other artifacts and creatures",
        },
      ),
    ],
  },
  // Menace: read from the text.
  "Indoraptor, the Perfect Hybrid": {
    abilities: [
      // Bloodthirst X (702.54): X, the damage dealt to your opponents this turn.
      entersWith({
        counters: amount.turnEvents({ event: "damage", who: "opponent", toPlayer: true, sum: true }),
        label: "Bloodthirst X",
      }),
      triggered(
        when.isDealtDamage,
        [
          fx.chooseOpponent("o", { random: true }),
          ...fx.unlessPays(
            ref.stored("o"),
            { sacrifice: { count: 1, filter: { types: ["Creature"], token: false } } },
            fx.damage(amount.powerOf(ref.self), ref.stored("o")),
          ),
        ],
        {
          label: "Enrage: a random opponent is dealt damage equal to its power unless they sacrifice a nontoken creature",
        },
      ),
    ],
  },
  "Henry Wu, InGen Geneticist": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Human", controller: "you" },
        { addAbilities: [exploitAbility()] },
        { label: "Henry Wu and other Humans you control have exploit" },
      ),
      // 702.110b: the exploited creature is the event's object (its last known information).
      triggered(
        when.exploits,
        [fx.draw(1), ...fx.when(cond.refMatches(ref.eventObject, { minPower: 3 }), fx.createTokens(TREASURE))],
        {
          condition: cond.refMatches(ref.eventObject, { types: ["Creature"], notSubtype: "Human" }),
          label: "A creature you control exploits a non-Human creature: draw a card (power 3 or more: a Treasure)",
        },
      ),
    ],
  },
  "Swooping Pteranodon": {
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], subtype: "Dinosaur", controller: "you", keyword: "flying" }),
        [
          fx.gainControl(ref.target()),
          fx.untap(ref.target()),
          fx.pump(ref.target(), 0, 0, ["flying", "haste"]),
          fx.delayed(
            [
              fx.reflexive([target.permanent("l", ["Land"], {}, "land")], [fx.damage(3, ref.target("c"), ref.target("l"))], {
                c: ref.target("c"),
              }),
            ],
            { c: ref.target() },
          ),
        ],
        {
          targets: [target.creature("t", { controller: "opponent" })],
          label:
            "A Dinosaur with flying enters: gain control of a creature an opponent controls; at the end step, a land deals 3 damage to it",
        },
      ),
    ],
  },
  "Owen Grady, Raptor Trainer": {
    abilities: [
      partnerWith("Blue, Loyal Raptor"),
      activated({
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { subtype: "Dinosaur" })],
        effects: fx.yourChoice(
          "Which counter?",
          "k",
          ["reach", "menace", "trample", "haste"].map((k) => ({ label: k, effects: [fx.counters(ref.target(), k)] })),
        ),
        label: "{T}: a reach, menace, trample or haste counter on a Dinosaur (sorcery)",
      }),
    ],
  },
  "Blue, Loyal Raptor": {
    abilities: [
      partnerWith("Owen Grady, Raptor Trainer"),
      entersWith({
        counters: 1,
        counterKind: "*",
        affects: { types: ["Creature"], subtype: "Dinosaur", controller: "you", other: true },
        label: "Other Dinosaurs you control enter with a counter of each kind on Blue",
      }),
    ],
  },
  "Cresting Mosasaurus": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.bounce(ref.zone("battlefield", ref.eachPlayer, { types: ["Creature"], notSubtype: "Dinosaur" }))],
        {
          condition: cond.wasCast,
          label: "When it enters, if you cast it: return each non-Dinosaur creature",
        },
      ),
    ],
  },
  "Hunting Velociraptor": {
    abilities: [
      // Prowl (702.76): combat damage to a player this turn by a creature with any of the spell's creature types.
      playerStatic({
        altCostAll: { mana: cost("{2}{R}"), filter: { subtype: "Dinosaur" }, prowl: true },
        label: "Dinosaur spells you cast have prowl {2}{R}",
      }),
    ],
  },
  "Dino DNA": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card from a graveyard")],
        effects: [fx.exileCard(ref.target(), { name: "e" }), fx.link(ref.stored("e"))],
        label: "Imprint — {1}, {T}: exile a creature card from a graveyard (sorcery)",
      }),
      activated({
        mana: "{6}",
        sorcerySpeed: true,
        targets: [
          {
            id: "t",
            label: "creature card exiled with Dino DNA",
            filter: { exiled: { linked: true, filter: { types: ["Creature"] } } },
          },
        ],
        effects: [fx.copyToken(ref.target(), { pt: 6, setColors: ["G"], setSubtypes: ["Dinosaur"], addKeywords: ["trample"] })],
        label: "{6}: a token copy, except it's a 6/6 green Dinosaur with trample (sorcery)",
      }),
    ],
  },
  "Ian Malcolm, Chaotician": {
    abilities: [
      triggered(
        { on: "draw", whose: "any", nth: 2 },
        [
          fx.exileTop(ref.eventPlayer, 1, "i"),
          fx.link(ref.stored("i")),
          fx.grantPlay(ref.stored("i"), { forever: true, anyMana: true, for: "nonOwners", condition: cond.yourTurn }),
        ],
        { label: "A player draws their second card each turn: they exile the top card of their library" },
      ),
    ],
  },
  "Indominus Rex, Alpha": {
    // "As it enters, discard any number of creature cards. It enters with a flying counter if a card discarded this way
    // has flying" (likewise for each ability of the list).
    asEnters: [
      fx.discard(99, ref.you, { filter: { types: ["Creature"] }, optional: true, store: "d" }),
      ...INDOMINUS_KEYWORDS.flatMap((k) =>
        fx.when(cond.amountAtLeast(amount.refCount(ref.filtered(ref.stored("d"), { keyword: k })), 1), fx.counters(ref.self, k)),
      ),
    ],
    abilities: [
      triggered(when.entersSelf, [fx.draw(amount.countersOn(ref.self, "any"))], {
        label: "Draw a card for each counter on Indominus Rex",
      }),
    ],
  },
  "Welcome to . . .": {
    abilities: [
      chapter(
        [1],
        [
          fx.modifyWhileYouControl(ref.target(), {
            addTypes: ["Creature"],
            addSubtypes: ["Wall"],
            setPower: 0,
            setToughness: 4,
            addKeywords: ["defender"],
          }),
        ],
        {
          // "For each opponent, up to one target noncreature artifact that player controls."
          targets: [
            {
              ...target.upTo(
                1,
                target.permanent(
                  "t",
                  ["Artifact"],
                  { controller: "opponent", notTypes: ["Creature"] },
                  "noncreature artifact an opponent controls (one per opponent)",
                ),
              ),
              differentPlayers: true,
              countAmount: amount.refCount(ref.eachOpponent),
            },
          ],
          label:
            "I — Up to one noncreature artifact of each opponent becomes a 0/4 Wall with defender for as long as you control the Saga",
        },
      ),
      chapter([2], [fx.createTokens(DINOSAUR_TRAMPLE, 1, undefined, "d"), fx.pump(ref.stored("d"), 0, 0, ["haste"])], {
        label: "II — A 3/3 green Dinosaur with trample, which has haste this turn",
      }),
      chapter(
        [3],
        [
          fx.destroyAll({ subtype: "Wall" }),
          fx.exileCard(ref.self, { name: "flip" }),
          fx.toBattlefield(ref.stored("flip"), { transformed: true, underYourControl: true }),
        ],
        { label: "III — Destroy all Walls; the Saga returns transformed" },
      ),
    ],
  },
  "Jurassic Park": {
    abilities: [
      playerStatic({
        playFrom: { zone: "graveyard", filter: { subtype: "Dinosaur" }, what: "spells", exileOthers: 3 },
        label: "Dinosaur cards in your graveyard have escape",
      }),
      manaAbility("G", 1, { per: { types: ["Creature"], subtype: "Dinosaur", controller: "you" } }),
    ],
  },
};
