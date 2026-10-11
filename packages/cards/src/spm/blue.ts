/**
 * Marvel's Spider-Man — blue cards (lot A). Flash, flying, vigilance and Mayhem are read from the text; kicker is
 * written in the script.
 */
import {
  activated,
  amount,
  type CardScript,
  cond,
  fx,
  ILLUSION_VILLAIN,
  kicker,
  modal,
  mode,
  playerStatic,
  ROBOT_FLYER,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** "Until end of turn, target creature you control becomes a [type] with base power and toughness … and gains …" (Secret Identity). */
const becomes = (subtype: string, power: number, toughness: number, keywords: ("hexproof" | "flying" | "vigilance")[]) => [
  fx.modify(
    ref.target(),
    { setSubtypes: [subtype], setPower: power, setToughness: toughness, addKeywords: keywords },
    "endOfTurn",
  ),
];

export const BLUE: Record<string, CardScript> = {
  "Amazing Acrobatics": {
    // "Choose one or both."
    spell: modal(
      mode("Counter a spell", [target.spell("s")], [fx.counter(ref.target("s"))]),
      mode("Tap one or two creatures", [target.between(1, 2, target.creature("c"))], [fx.tap(ref.target("c"))]),
      mode(
        "Both",
        [target.spell("s"), target.between(1, 2, target.creature("c"))],
        [fx.counter(ref.target("s")), fx.tap(ref.target("c"))],
      ),
    ),
  },
  "Beetle, Legacy Criminal": {
    abilities: [
      activated({
        mana: "{1}{U}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1), fx.pump(ref.target(), 0, 0, ["flying"])],
        label: "Exile it from your graveyard: +1/+1 counter and flying until end of turn",
      }),
    ],
  },
  "Doc Ock, Sinister Scientist": {
    abilities: [
      staticAbility(
        "self",
        { setPower: 8, setToughness: 8 },
        { condition: cond.amountAtLeast(amount.cardsIn("graveyard"), 8), label: "Base 8/8 with eight cards in your graveyard" },
      ),
      staticAbility(
        "self",
        { addKeywords: ["hexproof"] },
        { condition: cond.controls({ subtype: "Villain", other: true }), label: "Hexproof with another Villain" },
      ),
    ],
  },
  "Doc Ock's Henchmen": {
    abilities: [triggered(when.attacksSelf, [fx.connive(ref.self)], { label: "Connives when attacking" })],
  },
  "Flying Octobot": {
    abilities: [
      triggered(when.enters({ subtype: "Villain", controller: "you", other: true }), [fx.addCounters(ref.self, 1)], {
        oncePerTurn: true,
        label: "Another Villain enters: a +1/+1 counter (once each turn)",
      }),
    ],
  },
  "Hide on the Ceiling": {
    spell: spell(
      [
        {
          id: "t",
          label: "artifact or creature",
          filter: { objects: { types: ["Artifact", "Creature"] } },
          count: 99,
          countX: true,
        },
      ],
      [
        fx.exileCard(ref.target(), { name: "k" }),
        // The cards return under their owner's control (exiled tokens cease to exist).
        fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
      ],
    ),
  },
  "Impostor Syndrome": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], controller: "you", token: false }, true),
        [fx.copyToken(ref.eventObject, { nonlegendary: true })],
        { label: "Create a nonlegendary token copy of the creature" },
      ),
    ],
  },
  "Lady Octopus, Inspired Inventor": {
    abilities: [
      triggered(when.draw(1), [fx.counters(ref.self, "ingenuity")], { label: "First card drawn: ingenuity counter" }),
      triggered(when.draw(2), [fx.counters(ref.self, "ingenuity")], { label: "Second card drawn: ingenuity counter" }),
      activated({
        tap: true,
        effects: [
          fx.castNow(ref.handOf(ref.you, { types: ["Artifact"] }, amount.countersOn(ref.self, "ingenuity")), { free: true }),
        ],
        label: "Cast an artifact spell with mana value up to its ingenuity counters for free",
      }),
    ],
  },
  "Madame Web, Clairvoyant": {
    abilities: [
      playerStatic({ lookAt: "libraryTop", label: "You may look at the top card of your library" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ subtype: "Spider" }, { notTypes: ["Creature"] }] }, what: "spells" },
        label: "Cast Spider spells and noncreature spells from the top of your library",
      }),
      triggered(when.attackWith(), [...fx.may("Mill a card?", fx.mill(1))], {
        label: "You attack: you may mill a card",
      }),
    ],
  },
  "Mysterio, Master of Illusion": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(
            ILLUSION_VILLAIN,
            amount.count({ types: ["Creature"], subtype: "Villain", controller: "you", token: false }),
            undefined,
            "illusions",
          ),
          fx.link(ref.stored("illusions")),
        ],
        { label: "A 3/3 Illusion Villain token for each nontoken Villain you control" },
      ),
      triggered(when.leavesSelf, [fx.exile(ref.linked)], { label: "Exile those tokens" }),
    ],
  },
  "Mysterio's Phantasm": {
    abilities: [triggered(when.attacksSelf, [fx.mill(1)], { label: "Mill a card" })],
  },
  "Oscorp Research Team": {
    abilities: [activated({ mana: "{6}{U}", effects: [fx.draw(2)], label: "Draw two cards" })],
  },
  "Robotics Mastery": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT_FLYER, 2)], { label: "Two 1/1 flying Robot tokens" }),
      staticAbility("attached", { power: 2, toughness: 2 }, { label: "+2/+2" }),
    ],
  },
  "School Daze": {
    spell: modal(
      mode("Do Homework — Draw three cards", [], [fx.draw(3)]),
      mode("Fight Crime — Counter a spell, draw a card", [target.spell()], [fx.counter(ref.target()), fx.draw(1)]),
    ),
  },
  "Secret Identity": {
    spell: modal(
      mode(
        "Conceal — base 1/1 Citizen with hexproof",
        [target.creature("t", { controller: "you" })],
        becomes("Citizen", 1, 1, ["hexproof"]),
      ),
      mode(
        "Reveal — base 3/4 Hero with flying and vigilance",
        [target.creature("t", { controller: "you" })],
        becomes("Hero", 3, 4, ["flying", "vigilance"]),
      ),
    ),
  },
  "Spider-Byte, Web Warden": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, target.nonland())],
        label: "Return up to one nonland permanent to its owner's hand",
      }),
    ],
  },
  "Spider-Man No More": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      staticAbility(
        "attached",
        {
          setSubtypes: ["Citizen"],
          setPower: 1,
          setToughness: 1,
          loseAllAbilities: true,
          addKeywords: ["defender"],
        },
        { label: "Base 1/1 Citizen with defender, without its other abilities" },
      ),
    ],
  },
  "Unstable Experiment": {
    spell: spell(
      [target.player("p"), target.upTo(1, target.creature("c", { controller: "you" }))],
      [fx.draw(1, ref.target("p")), fx.connive(ref.target("c"))],
    ),
  },
  "Whoosh!": {
    kicker: kicker("{1}{U}"),
    spell: spell([target.nonland()], [fx.bounce(ref.target()), ...fx.when(cond.kicked, fx.draw(1))]),
  },
};
