/**
 * Aetherdrift, lot C: unique cards (linked control, exchange of control, copies, chosen name, planeswalker Equipment,
 * "X" costs, batched triggers…).
 */
import type { CardScript, TargetSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  CREATURE_OR_ARTIFACT,
  CREATURE_OR_VEHICLE,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  ELEPHANT,
  embalmAbility,
  entersWith,
  exhaust,
  fx,
  loyalty,
  MOUNT_OR_VEHICLE,
  manaAbility,
  mode,
  OTHER_CREATURE_YOU_CONTROL,
  PILOT,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VEHICLE,
  wardAbility,
  when,
} from "./common";

const AFFINITY_ARTIFACTS = { generic: amount.count({ types: ["Artifact"], controller: "you" }) };
const ARTIFACT_OR_CREATURE_YOU = { ...CREATURE_OR_ARTIFACT, controller: "you" as const };
const MAX_PLAYERS = 4;

/** "For each opponent / player, up to one target that player controls". */
const onePerPlayer = (t: TargetSpec): TargetSpec => ({ ...target.upTo(MAX_PLAYERS, t), differentPlayers: true });

export const UNIQUE: Record<string, CardScript> = {
  // --- White -----------------------------------------------------------------
  "Skyseer's Chariot": { asEnters: [fx.chooseForSelf("cardName")], chosenNameAbilities: 2 },

  // --- Blue ------------------------------------------------------------------
  "Possession Engine": {
    abilities: [
      triggered(when.entersSelf, fx.gainControlWhileSource(ref.target(), true), {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Gain control of a creature (for as long as you control this Vehicle)",
      }),
    ],
  },
  "Repurposing Bay": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        sorcerySpeed: true,
        sacrificeOther: { filter: { types: ["Artifact"], other: true } },
        effects: [
          fx.search(
            { types: ["Artifact"] },
            { to: "battlefield" },
            1,
            undefined,
            undefined,
            amount.plus(1, amount.manaValueOf(ref.costSacrificed)),
          ),
        ],
        label: "An artifact with mana value 1 + the sacrificed artifact's",
      }),
    ],
  },
  "Trade the Helm": {
    spell: spell(
      [
        target.permanent("a", ["Artifact", "Creature"], { controller: "you" }, "artifact or creature you control"),
        target.permanent("b", ["Artifact", "Creature"], { controller: "opponent" }, "artifact or creature an opponent controls"),
      ],
      [fx.exchangeControl(ref.target("a"), ref.target("b"))],
    ),
  },
  "Waxen Shapethief": { asEnters: [fx.chooseCopy(ARTIFACT_OR_CREATURE_YOU)] },

  // --- Black -----------------------------------------------------------------
  "Ancient Vendetta": {
    spell: spell([target.player("t", "opponent")], [fx.chooseCardName, fx.exileNamed(ref.target(), 4)]),
  },
  "Cursecloth Wrappings": {
    abilities: [
      staticAbility({ subtype: "Zombie", controller: "you" }, { power: 1, toughness: 1 }, { label: "Zombies get +1/+1" }),
      // "Gains embalm until end of turn": an ability of the card in the graveyard, activated later as a sorcery.
      activated({
        tap: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card")],
        effects: [fx.modify(ref.target(), { addAbilities: [embalmAbility()] }, "endOfTurn")],
        label: "A creature card in your graveyard gains embalm until end of turn",
      }),
    ],
  },
  "Demonic Junker": {
    costReduction: AFFINITY_ARTIFACTS,
    abilities: [
      triggered(
        when.entersSelf,
        // "If a creature you controlled was destroyed this way": the card put into the graveyard.
        [
          fx.destroy(ref.target(), "d"),
          fx.when(cond.refMatches(ref.stored("d"), { controller: "you" }), fx.addCounters(ref.self, 2)),
        ],
        { targets: [onePerPlayer(target.creature("t"))], label: "One creature for each player destroyed" },
      ),
    ],
  },
  "Gonti, Night Minister": {
    abilities: [
      triggered(when.castSpellNotOwned, [fx.createTokens(TREASURE, 1, ref.eventPlayer)], { label: "Treasure" }),
      // Exiled face down (visible to you); playable for as long as it remains exiled, with mana of any type.
      triggered(
        when.combatDamageToOpponent({ types: ["Creature"] }),
        [fx.exileTop(ref.eventPlayer, 1, "g", "you"), fx.grantPlay(ref.stored("g"), { forever: true, anyMana: true })],
        { label: "Exile the top card of their library, playable" },
      ),
    ],
  },
  "Intimidation Tactics": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(1, ref.target(), { filter: { types: ["Artifact", "Creature"] }, chooser: "controller", exile: true })],
    ),
  },
  "The Last Ride": {
    abilities: [
      staticAbility("self", { power: -1, toughness: -1 }, { perLife: true, label: "-X/-X (your life)" }),
      activated({ mana: "{2}{B}", payLife: 2, effects: [fx.draw(1)], label: "Draw" }),
    ],
  },
  "Wickerfolk Indomitable": { castFromGraveyard: { payLife: 2, sacrifice: CREATURE_OR_ARTIFACT } },

  // --- Red -------------------------------------------------------------------
  "Chandra, Spark Hunter": {
    abilities: [
      triggered(when.step("beginCombat"), [fx.animateVehicle(ref.target()), fx.pump(ref.target(), 0, 0, ["haste"])], {
        targets: [target.upTo(1, targetObj("t", { subtype: "Vehicle", controller: "you" }, "Vehicle you control"))],
        label: "A Vehicle becomes a creature with haste",
      }),
      loyalty(2, {
        effects: [
          fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
          fx.when(cond.not(cond.v("s")), fx.discard(1, ref.you, { optional: true, store: "d" })),
          fx.when(cond.not(cond.all(cond.not(cond.v("s")), cond.not(cond.v("d")))), fx.draw(1)),
        ],
        label: "Sacrifice an artifact or discard: draw",
      }),
      loyalty(0, { effects: [fx.createTokens(VEHICLE)], label: "3/2 Vehicle" }),
      loyalty(-7, {
        effects: [
          fx.emblem("Chandra", "Whenever an artifact you control enters, this emblem deals 3 damage to any target.", [
            triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.damage(3, ref.target())], {
              targets: [target.any("t")],
              label: "3 damage",
            }),
          ]),
        ],
        label: "Emblem",
      }),
    ],
  },
  "Daretti, Rocketeer Engineer": {
    cdaPower: amount.maxManaValue({ types: ["Artifact"], controller: "you" }),
    abilities: [
      ...(["entersSelf", "attacksSelf"] as const).map((w) =>
        triggered(
          when[w],
          [
            fx.sacrifice(ref.you, { types: ["Artifact"] }, 1, { optional: true, store: "s" }),
            fx.when(cond.v("s"), fx.toBattlefield(ref.target())),
          ],
          {
            targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card")],
            label: "Sacrifice an artifact: return the chosen card",
          },
        ),
      ),
    ],
  },
  "Full Throttle": {
    spell: spell(
      [],
      [
        fx.extraCombatsAfterMain(2),
        fx.emblem(
          "Full Throttle",
          "At the beginning of each combat this turn, untap all creatures that attacked this turn.",
          [
            triggered(
              when.step("beginCombat"),
              [fx.untap(ref.permanentsOf(ref.eachPlayer, { types: ["Creature"], attackedThisTurn: true }))],
              { label: "Untap the creatures that attacked" },
            ),
          ],
          true,
        ),
      ],
    ),
  },
  "Gastal Thrillroller": {
    abilities: [
      triggered(when.entersSelf, [fx.animateVehicle()], { label: "Artifact creature until end of turn" }),
      activated({
        mana: "{2}{R}",
        discard: 1,
        fromGraveyard: true,
        sorcerySpeed: true,
        effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
        label: "Return with a finality counter",
      }),
    ],
  },
  "Push the Limit": {
    spell: spell(
      [],
      [
        fx.moveAll("graveyard", ref.you, MOUNT_OR_VEHICLE, { to: "battlefield" }, "p"),
        fx.delayed([fx.sacrificeIt(ref.target("p"))], { p: ref.stored("p") }),
        fx.modifyAll({ subtype: "Vehicle", controller: "you" }, { addTypes: ["Artifact", "Creature"] }),
        fx.pumpAll(CREATURE_YOU_CONTROL, 0, 0, ["haste"]),
      ],
    ),
  },

  // --- Green -----------------------------------------------------------------
  "Dredger's Insight": {
    abilities: [
      triggered(when.zoneChange(["graveyard"], { filter: CREATURE_OR_ARTIFACT, whose: "you" }), [fx.gainLife(1)], {
        batched: true,
        label: "+1 life",
      }),
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { types: ["Artifact", "Creature", "Land"] },
            { to: "hand" },
            {
              min: 0,
              pool: ref.stored("m"),
              prompt: "You may take back a milled artifact, creature or land card",
            },
          ),
        ],
        { label: "Mill four cards, take back one" },
      ),
    ],
  },
  "Fang-Druid Summoner": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          // Library and/or graveyard, one choice (PLAN-L L4).
          fx.search({ types: ["Creature"], noAbilities: true }, { to: "hand" }, 1, undefined, undefined, undefined, {
            alsoFrom: ["graveyard"],
          }),
        ],
        { label: "A creature card with no abilities" },
      ),
    ],
  },
  "March of the World Ooze": {
    abilities: [
      staticAbility(CREATURE_YOU_CONTROL, { setPower: 6, setToughness: 6, addSubtypes: ["Ooze"] }, { label: "6/6, Oozes" }),
      triggered(when.castSpellOffTurn("opponent"), [fx.createTokens(ELEPHANT)], { label: "3/3 Elephant" }),
    ],
  },
  "Oviya, Automech Artisan": {
    abilities: [
      // "Each creature attacking one of your opponents": whoever controls it, and not a planeswalker.
      staticAbility({ types: ["Creature"], attacking: "opponent" }, { addKeywords: ["trample"] }, { label: "Trample" }),
      activated({
        mana: "{G}",
        tap: true,
        effects: [
          fx.pickFromZone(
            "hand",
            CREATURE_OR_VEHICLE,
            { to: "battlefield" },
            { min: 0, store: "o", prompt: "Creature or Vehicle" },
          ),
          fx.when(cond.refMatches(ref.stored("o"), { types: ["Artifact"] }), fx.addCounters(ref.stored("o"), 2)),
        ],
        label: "A creature or Vehicle from your hand",
      }),
    ],
  },
  "Rise from the Wreck": {
    spell: spell(
      [
        target.upTo(1, target.cardInGraveyard("a", { types: ["Creature"] }, "you", "creature card")),
        { ...target.upTo(1, target.cardInGraveyard("b", { subtype: "Mount" }, "you", "Mount card")), otherThan: ["a"] },
        {
          ...target.upTo(1, target.cardInGraveyard("c", { subtype: "Vehicle" }, "you", "Vehicle card")),
          otherThan: ["a", "b"],
        },
        {
          ...target.upTo(
            1,
            target.cardInGraveyard("d", { types: ["Creature"], noAbilities: true }, "you", "creature with no abilities"),
          ),
          otherThan: ["a", "b", "c"],
        },
      ],
      [fx.toHand(ref.target("a")), fx.toHand(ref.target("b")), fx.toHand(ref.target("c")), fx.toHand(ref.target("d"))],
    ),
  },
  "Thunderous Velocipede": {
    abilities: [
      entersWith({ counters: 1, affects: { ...CREATURE_OR_VEHICLE, controller: "you", maxManaValue: 4 }, label: "+1 counter" }),
      entersWith({ counters: 3, affects: { ...CREATURE_OR_VEHICLE, controller: "you", minManaValue: 5 }, label: "+3 counters" }),
    ],
  },

  // --- Multicolored ----------------------------------------------------------
  "Captain Howler, Sea Scourge": {
    abilities: [
      triggered(
        when.discardBatch(),
        [
          fx.pump(ref.target(), amount.plus(amount.eventAmount, amount.eventAmount), 0),
          fx.modify(ref.target(), {
            addAbilities: [triggered(when.combatDamage("self", true), [fx.draw(1)], { label: "Draw" })],
          }),
        ],
        { targets: [target.creature("t")], label: "+2/+0 for each card discarded" },
      ),
    ],
  },
  "Cloudspire Coordinator": {
    abilities: [
      triggered(when.entersSelf, [fx.scry(2)], { label: "Scry 2" }),
      activated({
        tap: true,
        // Turn log: those that left again count too (a Mount Vehicle is counted only once).
        effects: [
          fx.createTokens(
            PILOT,
            amount.plus(
              amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Mount", who: "you" }),
              amount.turnEvents({ event: "zone", to: "battlefield", subtype: "Vehicle", notSubtype: "Mount", who: "you" }),
            ),
          ),
        ],
        label: "A Pilot for each Mount or Vehicle that entered this turn",
      }),
    ],
  },
  "Coalstoke Gearhulk": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.moveTo(
            ref.target(),
            { to: "battlefield", underYourControl: true, counters: { kind: "finality", n: 1 } },
            { name: "c" },
          ),
          fx.modify(ref.stored("c"), { addKeywords: ["menace", "deathtouch", "haste"] }, "permanent"),
          fx.delayedAt("yourEndStep", [fx.exile(ref.target("c"))], { c: ref.stored("c") }),
        ],
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 4 }, "any", "creature card")],
          label: "A creature from a graveyard, exiled at your end step",
        },
      ),
    ],
  },
  "Dune Drifter": {
    abilities: [
      triggered(when.entersSelf, [fx.toBattlefield(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { ...CREATURE_OR_ARTIFACT, compare: [cmp.manaValue("<=", amount.x)] },
            "you",
            "artifact or creature card",
          ),
        ],
        label: "Return an artifact or creature with mana value X or less",
      }),
    ],
  },
  "Fearless Swashbuckler": {
    abilities: [
      staticAbility({ subtype: "Vehicle", controller: "you" }, { addKeywords: ["haste"] }, { label: "Your Vehicles have haste" }),
      triggered(when.attackWith(1), [fx.draw(3), fx.discard(2)], {
        condition: cond.all(
          cond.controls({ subtype: "Pirate", attacking: true }),
          cond.controls({ subtype: "Vehicle", attacking: true }),
        ),
        label: "A Pirate and a Vehicle attack: draw three, discard two",
      }),
    ],
  },
  "Guidelight Pathmaker": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.search({ types: ["Artifact"] }, { to: "hand" }, 1, undefined, "a"),
          fx.when(cond.refMatches(ref.stored("a"), { maxManaValue: 2 }), fx.toBattlefield(ref.stored("a"))),
        ],
        { label: "An artifact (onto the battlefield if mana value 2 or less)" },
      ),
    ],
  },
  "Ketramose, the New Dawn": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.exileAtLeast(7)),
          label: "Fewer than seven cards in exile: can't attack or block",
        },
      ),
      triggered(when.zoneChange(["graveyard", "battlefield"], { to: ["exile"] }), [fx.draw(1), fx.loseLife(1)], {
        condition: cond.yourTurn,
        batched: true,
        label: "Draw, lose 1 life",
      }),
    ],
  },
  "Mimeoplasm, Revered One": {
    // "As it enters, exile up to X creature cards from your graveyard; three +1/+1 counters for each card exiled":
    // the devour form, from the graveyard (the exiled cards are linked to Mimeoplasm).
    asEnters: [fx.devour({ types: ["Creature"] }, 3, { graveyardUpToX: true })],
    abilities: [
      activated({
        mana: "{2}",
        targets: [
          {
            id: "t",
            label: "creature card exiled with it",
            filter: { exiled: { linked: true, filter: { types: ["Creature"] } } },
          },
        ],
        // "Becomes a copy of the exiled card, except it's 0/0 and has this ability" (707.9b: copiable exceptions).
        effects: [
          {
            op: "becomeCopy",
            what: ref.self,
            of: ref.target(),
            duration: "permanent",
            keepAbilities: [0],
            except: { setPower: 0, setToughness: 0 },
          },
        ],
        label: "Becomes a copy (0/0)",
      }),
    ],
  },
  "Redshift, Rocketeer Chief": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"], 1, { selfPower: true, restriction: { abilityOfSource: {} } }),
      exhaust({
        mana: "{10}{R}{G}",
        effects: [
          fx.pickFromZone("hand", { permanent: true }, { to: "battlefield" }, { count: 60, min: 0, prompt: "Permanent cards" }),
        ],
        label: "permanents from your hand",
      }),
    ],
  },
  "Riptide Gearhulk": {
    abilities: [
      triggered(when.entersSelf, [fx.moveTo(ref.target(), { to: "libraryTop", fromTop: 3 })], {
        targets: [onePerPlayer(target.nonland("t", { controller: "opponent" }))],
        label: "Third from the top of the library",
      }),
    ],
  },
  "Sab-Sunen, Luxa Embodied": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.odd(amount.countersOn(ref.self, "any")),
          label: "Odd number of counters: can't attack or block",
        },
      ),
      triggered(
        when.step("main1"),
        [fx.addCounters(ref.self, 1), fx.when(cond.odd(amount.countersOn(ref.self, "any")), fx.draw(2))],
        {
          label: "+1/+1 counter; odd: draw two cards",
        },
      ),
    ],
  },
  "Sita Varma, Masked Racer": {
    abilities: [
      exhaust({
        mana: "{X}{G}{G}{U}",
        effects: [
          fx.addCounters(ref.self, amount.x),
          ...fx.may(
            "Other creatures take Sita Varma's power?",
            fx.setBasePTAll(OTHER_CREATURE_YOU_CONTROL, amount.powerOf(ref.self)),
          ),
        ],
        label: "X counters, base power and toughness of the other creatures",
      }),
    ],
  },
  "Skyserpent Seeker": {
    abilities: [
      exhaust({
        mana: "{4}",
        effects: [fx.revealUntilN({ types: ["Land"] }, 2, { to: "battlefield", tapped: true }), fx.addCounters(ref.self, 1)],
        label: "two lands, +1/+1 counter",
      }),
    ],
  },
  "Winter, Cursed Rider": {
    abilities: [
      staticAbility(
        { types: ["Artifact"], controller: "you" },
        { addAbilities: [wardAbility({ life: 2 })] },
        {
          label: "Your artifacts: ward (2 life)",
        },
      ),
      exhaust({
        mana: "{2}{U}{B}",
        tap: true,
        exileFromGraveyardX: { types: ["Artifact"] },
        effects: [
          fx.pumpAll({ types: ["Creature"], notTypes: ["Artifact"], other: true }, amount.neg(amount.x), amount.neg(amount.x)),
        ],
        label: "other nonartifact creatures get -X/-X",
      }),
    ],
  },

  // --- Colorless -------------------------------------------------------------
  "The Aetherspark": {
    abilities: [
      triggered(
        when.combatDamage({ types: ["Creature"], attached: "host" }),
        [fx.counters(ref.self, "loyalty", amount.eventAmount)],
        { condition: cond.yourTurn, label: "That many loyalty counters" },
      ),
      loyalty(1, {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        effects: [fx.attach(ref.target()), fx.addCounters(ref.target(), 1)],
        label: "Attach it, +1/+1 counter",
      }),
      loyalty(-5, { effects: [fx.draw(2)], label: "Draw two cards" }),
      loyalty(-10, { effects: [fx.addManaChoice(10)], label: "Ten mana of one color" }),
    ],
  },
  "Lifecraft Engine": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      // Approximation: all your Vehicles (creatures or not) have the chosen type; a "creature" filter would be locked in
      // before crewing, which is more recent (613.8a dependency not handled for the affected set in layer 4).
      staticAbility(
        { subtype: "Vehicle", controller: "you" },
        { addChosen: "subtype" },
        {
          label: "Your Vehicle creatures have the chosen type",
        },
      ),
      staticAbility(
        { types: ["Creature"], controller: "you", chosen: "subtype", other: true },
        { power: 1, toughness: 1 },
        {
          label: "+1/+1",
        },
      ),
    ],
  },
  "Monument to Endurance": {
    abilities: [
      triggeredModal(
        when.discard("you"),
        [
          mode("Draw", [], [fx.draw(1)]),
          mode("Treasure", [], [fx.createTokens(TREASURE)]),
          mode("Each opponent loses 3 life", [], [fx.loseLife(3, ref.eachOpponent)]),
        ],
        { uniqueModes: "turn", label: "A mode not chosen yet this turn" },
      ),
    ],
  },
  "Pit Automaton": {
    abilities: [
      manaAbility("C", 2, { restriction: { abilityOfSource: {} } }),
      activated({ mana: "{2}", tap: true, effects: [fx.copyNextExhaust], label: "Copy the next exhaust ability" }),
    ],
  },
  "Radiant Lotus": {
    abilities: [
      // "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed": a
      // target, so not a mana ability (605.1a); the color is chosen on resolution.
      activated({
        tap: true,
        sacrificeX: { types: ["Artifact"] },
        targets: [target.player("p")],
        effects: fx.yourChoice(
          "Choose a color",
          "color",
          (
            [
              ["W", "White"],
              ["U", "Blue"],
              ["B", "Black"],
              ["R", "Red"],
              ["G", "Green"],
            ] as const
          ).map(([c, label]) => ({
            label,
            effects: [
              { op: "addMana", mana: [c], times: amount.plus(amount.x, amount.x, amount.x), who: ref.target("p") } as const,
            ],
          })),
        ),
        label: "Three mana of one color for each artifact sacrificed, for target player",
      }),
    ],
  },
};
