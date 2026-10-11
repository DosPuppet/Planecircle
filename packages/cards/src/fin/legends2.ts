/** Final Fantasy — legendaries and unique cards (lot D2). */
import type { CardScript, TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  blockAbility,
  chapter,
  cond,
  eventReplacement,
  FROG,
  fx,
  HERO,
  kicker,
  playerStatic,
  prevention,
  ref,
  spell,
  staticAbility,
  TOWN,
  target,
  targetObj,
  triggered,
  when,
} from "./common";

const YOURS = { types: ["Creature" as const], controller: "you" as const };
const PERMANENT_CARD = { permanent: true };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };
const ALL_COLORS_ELEMENTAL: TokenSpec = {
  name: "Elemental",
  colors: ["W", "U", "B", "R", "G"],
  types: ["Creature"],
  subtypes: ["Elemental"],
  power: 2,
  toughness: 2,
};

export const LEGENDS2: Record<string, CardScript> = {
  "Summon: Bahamut": {
    abilities: [
      chapter([1, 2], [fx.destroy(ref.target())], {
        targets: [target.upTo(1, target.nonland("t"))],
        label: "Destroy up to one nonland permanent",
      }),
      chapter([3], [fx.draw(2)], { label: "Draw two cards" }),
      chapter([4], [fx.damage(amount.totalManaValue({ permanent: true, controller: "you", other: true }), ref.eachOpponent)], {
        label: "Megaflare",
      }),
    ],
  },
  "Cloud, Midgar Mercenary": {
    abilities: [
      triggered(when.entersSelf, [fx.search({ subtype: "Equipment" })], { label: "Search for an Equipment" }),
      playerStatic({
        triggerMod: { effect: "again", sources: { anyOf: [{ self: true }, { attached: "toSource" }] } },
        condition: cond.sourceMatches({ equipped: true }),
        label: "Equipped: its triggers and those of its Equipment trigger an additional time",
      }),
    ],
  },
  "The Lunar Whale": {
    abilities: [
      playerStatic({
        playFrom: { zone: "libraryTop" },
        condition: cond.sourceMatches({ attackedThisTurn: true }),
        label: "Play the top card (attacked this turn)",
      }),
    ],
  },
  "Quistis Trepe": {
    abilities: [
      triggered(when.entersSelf, [fx.castNow(ref.target(), { anyMana: true, after: "exile" })], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"] }, "any", "instant or sorcery card")],
        label: "Blue Magic: cast a spell from a graveyard",
      }),
    ],
  },
  "Ardyn, the Usurper": {
    abilities: [
      staticAbility(
        { ...YOURS, subtype: "Demon" },
        { addKeywords: ["menace", "lifelink", "haste"] },
        { label: "Your Demons: menace, lifelink, haste" },
      ),
      triggered(
        when.yourCombat,
        [
          fx.exileCard(ref.target(), { name: "a" }),
          fx.copyToken(ref.stored("a"), { pt: 5, setColors: ["B"], setSubtypes: ["Demon"] }),
        ],
        {
          targets: [target.upTo(1, target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card"))],
          label: "Starscourge",
        },
      ),
    ],
  },
  "Zodiark, Umbral God": {
    abilities: [
      triggered(when.entersSelf, [fx.sacrifice(ref.eachPlayer, { types: ["Creature"], notSubtype: "God" }, 1, { half: true })], {
        label: "Each player sacrifices half of their creatures",
      }),
      triggered(when.sacrifice({ types: ["Creature"], other: true }, true), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Vayne's Treachery": {
    kicker: kicker("{0}", { sacrifice: CREATURE_OR_ARTIFACT }),
    spell: spell([target.creature("t")], [fx.pump(ref.target(), amount.kicked(-6, -2), amount.kicked(-6, -2))]),
  },
  "Chocobo Kick": {
    kicker: kicker("{0}", { bounce: { types: ["Land"] } }),
    spell: spell(
      [target.creature("s", { controller: "you" }), target.creature("t", { controller: "opponent" })],
      [
        fx.when(cond.not(cond.kicked), fx.damage(amount.powerOf(ref.target("s")), ref.target("t"), ref.target("s"))),
        fx.when(
          cond.kicked,
          fx.damage(
            amount.plus(amount.powerOf(ref.target("s")), amount.powerOf(ref.target("s"))),
            ref.target("t"),
            ref.target("s"),
          ),
        ),
      ],
    ),
  },
  "Seifer Almasy": {
    abilities: [
      triggered(when.attacksAlone(YOURS), [fx.pump(ref.eventObject, 0, 0, ["doubleStrike"])], {
        label: "Attacks alone: double strike",
      }),
      triggered(when.combatDamageToPlayer, [fx.castNow(ref.target(), { free: true, after: "exile" })], {
        targets: [target.cardInGraveyard("t", { types: ["Instant", "Sorcery"], maxManaValue: 3 }, "you", "instant or sorcery")],
        label: "Fire Cross",
      }),
    ],
  },
  "Squall, SeeD Mercenary": {
    abilities: [
      triggered(when.attacksAlone(YOURS), [fx.pump(ref.eventObject, 0, 0, ["doubleStrike"])], {
        label: "Attacks alone: double strike",
      }),
      triggered(when.combatDamageToPlayer, [fx.toBattlefield(ref.target())], {
        targets: [target.cardInGraveyard("t", { ...PERMANENT_CARD, maxManaValue: 3 }, "you", "permanent card")],
        label: "A permanent card with mana value 3 or less",
      }),
    ],
  },
  "Bartz and Boko": {
    costReduction: { generic: amount.count({ subtype: "Bird", controller: "you" }) },
    abilities: [
      triggered(when.entersSelf, [fx.eachDealsDamage({ ...YOURS, subtype: "Bird", other: true }, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Each other Bird deals damage equal to its power",
      }),
    ],
  },
  "Diamond Weapon": {
    costReduction: { generic: amount.countIn("graveyard", PERMANENT_CARD) },
    abilities: [prevention({ self: true }, { combatOnly: true, label: "Immune — combat damage prevented" })],
  },
  "Quina, Qu Gourmet": {
    abilities: [
      eventReplacement({ event: "tokens", to: "you", plus: FROG, modify: {}, label: "A 1/1 Frog in addition to your tokens" }),
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { subtype: "Frog" } },
        effects: [fx.addCounters(ref.self, 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Shantotto, Tactician Magician": {
    abilities: [
      triggered(when.castSpell("you", { notTypes: ["Creature"] }), [fx.pump(ref.self, amount.eventManaSpent, 0)], {
        label: "+X/+0",
      }),
      triggered(when.castNoncreatureWithMana(4), [fx.draw(1)], { label: "Draw (X ≥ 4)" }),
    ],
  },
  "Tellah, Great Sage": {
    abilities: [
      // A single trigger: Hero, then draw (four mana or more), then sacrifice and damage (eight or more).
      triggered(
        when.castSpell("you", { notTypes: ["Creature"] }),
        [
          fx.createTokens(HERO),
          ...fx.when(cond.amountAtLeast(amount.eventManaSpent, 4), fx.draw(2)),
          ...fx.when(
            cond.amountAtLeast(amount.eventManaSpent, 8),
            fx.sacrificeIt(ref.self),
            fx.damage(amount.eventManaSpent, ref.eachOpponent),
          ),
        ],
        { label: "1/1 Hero; four mana: draw two cards; eight: sacrifice Tellah, damage" },
      ),
    ],
  },
  "The Wandering Minstrel": {
    abilities: [
      playerStatic({ landsEnterUntapped: true, label: "Your lands enter untapped" }),
      triggered(when.yourCombat, [fx.createTokens(ALL_COLORS_ELEMENTAL)], {
        condition: cond.controls({ ...TOWN }, 5),
        label: "2/2 Elemental of all colors",
      }),
      activated({
        mana: "{3}{W}{U}{B}{R}{G}",
        effects: [
          fx.pumpAll(
            { ...YOURS, other: true },
            amount.count({ ...TOWN, controller: "you" }),
            amount.count({ ...TOWN, controller: "you" }),
          ),
        ],
        label: "+X/+X (Towns)",
      }),
    ],
  },
  "Y'shtola Rhul": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.exileCard(ref.target(), { name: "y" }),
          fx.toBattlefield(ref.stored("y")),
          fx.when(cond.firstEndStep, fx.extraEndStep),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "Blink, additional end step" },
      ),
    ],
  },
  "Relentless X-ATM092": {
    abilities: [
      blockAbility(block.atLeast(3)),
      activated({
        mana: "{8}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.self, { tapped: true, counters: { kind: "finality", n: 1 } })],
        label: "Returns from the graveyard",
      }),
    ],
  },
  "Gilgamesh, Master-at-Arms": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(
          t,
          [
            fx.lookAtTop(6, {
              filter: { subtype: "Equipment" },
              count: 6,
              to: { to: "battlefield" },
              rest: "bottom",
              store: "e",
            }),
            fx.when(
              cond.v("e"),
              fx.may(
                "Attach one of these Equipment to a Samurai?",
                fx.reflexive(
                  [
                    targetObj(
                      "e",
                      { subtype: "Equipment", controller: "you", enteredThisTurn: true },
                      "Equipment put onto the battlefield",
                    ),
                    target.creature("c", { controller: "you", subtype: "Samurai" }),
                  ],
                  [fx.attach(ref.target("c"), ref.target("e"))],
                ),
              ),
            ),
          ],
          { label: "Equipment among the top six" },
        ),
      ),
    ],
  },
};
