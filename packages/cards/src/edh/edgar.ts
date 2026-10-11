/**
 * Commander (PLAN-E, E10): the Vampires of the Edgar Markov deck (creatures, spells and Sorin). Ascend (702.131) read
 * from the text; costs "tap five untapped Vampires" (`tapOthers`), "tap an untapped Vampire" (additional cost).
 */
import type { CardScript, ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  cond,
  entersWith,
  fx,
  loyalty,
  protection,
  protectionAbility,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  VAMPIRE_DEMON,
  VAMPIRE_FLYING,
  VAMPIRE_LIFELINK,
  VAMPIRE_WB_LIFELINK,
  when,
} from "./common";

const CREATURE: ObjectFilter = { types: ["Creature"] };
/** "Vampires you control" (permanents). */
const YOUR_VAMPIRES: ObjectFilter = { subtype: "Vampire", controller: "you" };
/** "Other Vampire creatures you control". */
const OTHER_VAMPIRES: ObjectFilter = { types: ["Creature"], subtype: "Vampire", controller: "you", other: true };
const VAMPIRE_COUNT = amount.count(YOUR_VAMPIRES);

/** "Other Vampires you control get +N/+N" (and keywords). */
const vampireLord = (n: number, label: string, keywords?: ("firstStrike" | "flying")[]) =>
  staticAbility(OTHER_VAMPIRES, { power: n, toughness: n, ...(keywords ? { addKeywords: keywords } : {}) }, { label });

/** "{T}: Create a 2/2 black Vampire creature token with flying" (Bloodline Keeper, Lord of Lineage). */
const vampireMaker = activated({
  tap: true,
  effects: [fx.createTokens(VAMPIRE_FLYING)],
  label: "2/2 flying Vampire token",
});

export const EDH_EDGAR: Record<string, CardScript> = {
  "Blood Artist": {
    abilities: [
      triggered(when.dies(CREATURE), [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player()],
        label: "A creature dies: target player loses 1 life, you gain 1",
      }),
    ],
  },
  // Flying: read from the text.
  "Bloodline Keeper": {
    abilities: [
      vampireMaker,
      activated({
        mana: "{B}",
        activationCondition: cond.controls({ subtype: "Vampire" }, 5),
        effects: [fx.transform()],
        label: "Transform (five or more Vampires)",
      }),
    ],
  },
  "Lord of Lineage": { abilities: [vampireLord(2, "Other Vampires get +2/+2"), vampireMaker] },
  "Captivating Vampire": {
    abilities: [
      vampireLord(1, "Other Vampires get +1/+1"),
      activated({
        tapOthers: { filter: YOUR_VAMPIRES, count: 5, includeSelf: true },
        targets: [target.creature()],
        effects: [
          fx.gainControl(ref.target(), { indefinitely: true }),
          fx.modify(ref.target(), { addSubtypes: ["Vampire"] }, "permanent"),
        ],
        label: "Tap five Vampires: gain control of target creature, which becomes a Vampire",
      }),
    ],
  },
  "Champion of Dusk": {
    abilities: [
      triggered(when.entersSelf, [fx.draw(VAMPIRE_COUNT), fx.loseLife(VAMPIRE_COUNT)], {
        label: "Draw X cards and lose X life (X: your Vampires)",
      }),
    ],
  },
  // "They may tap that permanent. If they don't, you create a 1/1 white Vampire with lifelink": the question is asked
  // to the controller of the entering permanent.
  "Charismatic Conqueror": {
    abilities: [
      triggered(
        when.enters({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }], controller: "opponent", tapped: false }),
        [
          ...fx.mayForStore(
            ref.controllerOf(ref.eventObject),
            "Tap this permanent? Otherwise, your opponent creates a 1/1 Vampire with lifelink",
            "tapped",
            fx.tap(ref.eventObject),
          ),
          ...fx.when(cond.not(cond.v("tapped")), fx.createTokens(VAMPIRE_LIFELINK)),
        ],
        { label: "An opposing artifact or creature enters untapped: tapped, or a Vampire for you" },
      ),
    ],
  },
  "Clavileño, First of the Blessed": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.modify(
            ref.target(),
            {
              addSubtypes: ["Demon"],
              addAbilities: [
                triggered(when.diesSelf, [fx.draw(1), fx.createTappedTokens(VAMPIRE_DEMON)], {
                  label: "Dies: draw a card, and a tapped 4/3 flying Vampire Demon",
                }),
              ],
            },
            "permanent",
          ),
        ],
        {
          targets: [
            target.permanent(
              "t",
              ["Creature"],
              { subtype: "Vampire", notSubtype: "Demon", attacking: true },
              "attacking Vampire that isn't a Demon",
            ),
          ],
          label: "An attacking Vampire becomes a Demon",
        },
      ),
    ],
  },
  "Cordial Vampire": {
    abilities: [
      triggered(when.dies(CREATURE), [fx.addCountersAll(YOUR_VAMPIRES)], {
        label: "A creature dies: +1/+1 on each Vampire",
      }),
    ],
  },
  "Cruel Celebrant": {
    abilities: [
      triggered(when.dies({ anyOf: [{ types: ["Creature"] }, { types: ["Planeswalker"] }], controller: "you" }), fx.drain(1), {
        label: "One of your creatures or planeswalkers dies: drain 1",
      }),
    ],
  },
  // Flying and first strike: read from the text.
  "Drana, Liberator of Malakir": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.addCountersAll({ types: ["Creature"], controller: "you", attacking: true })], {
        label: "+1/+1 on each attacker",
      }),
    ],
  },
  "Edgar, Charmed Groom": {
    abilities: [
      vampireLord(1, "Other Vampires get +1/+1"),
      triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { transformed: true })], {
        label: "Returns transformed (Edgar Markov's Coffin)",
      }),
    ],
  },
  "Edgar Markov's Coffin": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.createTokens(VAMPIRE_WB_LIFELINK),
          fx.counters(ref.self, "bloodline"),
          ...fx.when(
            cond.amountAtLeast(amount.countersOn(ref.self, "bloodline"), 3),
            fx.removeCounters(ref.self, amount.countersOn(ref.self, "bloodline"), "bloodline"),
            fx.transform(),
          ),
        ],
        { label: "1/1 Vampire with lifelink, bloodline counter; at three, transform" },
      ),
    ],
  },
  // Lifelink: read from the text.
  "Elenda, the Dusk Rose": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Another creature dies: +1/+1",
      }),
      triggered(when.diesSelf, [fx.createTokens(VAMPIRE_LIFELINK, amount.lkiPower)], {
        label: "Dies: X 1/1 Vampires with lifelink (X: its power)",
      }),
    ],
  },
  "Forerunner of the Legion": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Search for a Vampire card to put on top of your library?",
          fx.search({ subtype: "Vampire" }, { to: "libraryTop" }),
        ),
        { label: "Search for a Vampire, on top of the library" },
      ),
      triggered(when.enters({ ...OTHER_VAMPIRES }), [fx.pump(ref.target(), 1, 1)], {
        targets: [target.creature()],
        label: "Another Vampire enters: target creature gets +1/+1",
      }),
    ],
  },
  // Lifelink: read from the text.
  "Indulgent Aristocrat": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: CREATURE, includeSelf: true },
        effects: [fx.addCountersAll(YOUR_VAMPIRES)],
        label: "Sacrifice a creature: +1/+1 on each Vampire",
      }),
    ],
  },
  "Knight of the Ebon Legion": {
    abilities: [
      activated({ mana: "{2}{B}", effects: [fx.pump(ref.self, 3, 3, ["deathtouch"])], label: "+3/+3 and deathtouch" }),
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.amountAtLeast(amount.turnEvents({ event: "lifeLoss", sum: true, perPlayer: true }), 4),
        label: "A player lost 4 or more life: +1/+1",
      }),
    ],
  },
  "Legion Lieutenant": { abilities: [vampireLord(1, "Other Vampires get +1/+1")] },
  // Flying: read from the text.
  "Malakir Bloodwitch": {
    abilities: [
      protectionAbility(protection.from({ colors: ["W"] }, "Protection from white")),
      triggered(when.entersSelf, [fx.loseLife(VAMPIRE_COUNT, ref.eachOpponent, "lost"), fx.gainLife(amount.v("lost"))], {
        label: "Each opponent loses 1 life per Vampire; you gain that much",
      }),
    ],
  },
  // Convoke, lifelink and madness: read from the text.
  "Markov Baron": { abilities: [vampireLord(1, "Other Vampires get +1/+1")] },
  "Master of Dark Rites": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: CREATURE },
        effects: [fx.addManaChoice(3, ["B"], { spell: { anySubtype: ["Vampire", "Cleric", "Demon"] } })],
        label: "{B}{B}{B} for Vampire, Cleric or Demon spells",
      }),
    ],
  },
  "Mavren Fein, Dusk Apostle": {
    abilities: [
      triggered(when.attackWith(1, { subtype: "Vampire", token: false }), [fx.createTokens(VAMPIRE_LIFELINK)], {
        label: "Nontoken Vampires attack: 1/1 Vampire with lifelink",
      }),
    ],
  },
  "Sanctum Seeker": {
    abilities: [
      triggered(when.attacks({ subtype: "Vampire", controller: "you" }), fx.drain(1), {
        label: "A Vampire attacks: drain 1",
      }),
    ],
  },
  // First strike: read from the text.
  "Stromkirk Captain": { abilities: [vampireLord(1, "Other Vampires get +1/+1 and first strike", ["firstStrike"])] },
  // Flying and ascend: read from the text.
  "Twilight Prophet": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [fx.moveTo(ref.libraryTop(ref.you), { to: "hand" }, { name: "c" }), ...fx.drain(amount.manaValueOf(ref.stored("c")))],
        {
          condition: cond.citysBlessing,
          label: "City's blessing: the top card into your hand, drain its mana value",
        },
      ),
    ],
  },
  // Menace: read from the text.
  "Vampire Socialite": {
    abilities: [
      triggered(when.entersSelf, [fx.addCountersAll({ ...YOUR_VAMPIRES, other: true })], {
        condition: cond.opponentLostLife,
        label: "An opponent lost life: +1/+1 on each other Vampire",
      }),
      entersWith({
        counters: 1,
        affects: { ...YOUR_VAMPIRES, other: true },
        condition: cond.opponentLostLife,
        label: "Other Vampires enter with an additional +1/+1 counter",
      }),
    ],
  },
  "Viscera Seer": {
    abilities: [
      activated({
        sacrificeOther: { filter: CREATURE, includeSelf: true },
        effects: [fx.scry(1)],
        label: "Sacrifice a creature: scry 1",
      }),
    ],
  },
  "Vito, Thorn of the Dusk Rose": {
    abilities: [
      triggered({ on: "life", change: "gain", whose: "you" }, [fx.loseLife(amount.eventAmount, ref.target())], {
        targets: [target.player("t", "opponent")],
        label: "You gain life: target opponent loses that much",
      }),
      activated({
        mana: "{3}{B}{B}",
        effects: [fx.pumpAll({ controller: "you" }, 0, 0, ["lifelink"])],
        label: "Your creatures gain lifelink",
      }),
    ],
  },
  // Flying: read from the text.
  "Welcoming Vampire": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true, maxPower: 2 }), [fx.draw(1)], {
        batched: true,
        oncePerTurn: true,
        label: "Creatures with power 2 or less enter: draw a card (once per turn)",
      }),
    ],
  },
  // Haste: read from the text.
  "Yahenni, Undying Partisan": {
    abilities: [
      triggered(when.dies({ types: ["Creature"], controller: "opponent" }), [fx.addCounters(ref.self, 1)], {
        label: "An opposing creature dies: +1/+1",
      }),
      activated({
        sacrificeOther: { filter: { types: ["Creature"], other: true } },
        effects: [fx.modify(ref.self, { addKeywords: ["indestructible"] })],
        label: "Sacrifice another creature: indestructible",
      }),
    ],
  },
  // "Replace all instances of one creature type with Vampire" (612.2, layer 3): its type line and its abilities.
  "New Blood": {
    additionalCost: { tap: { filter: { types: ["Creature"], subtype: "Vampire", controller: "you" }, count: 1 } },
    spell: spell(
      [target.creature()],
      [fx.gainControl(ref.target(), { indefinitely: true }), fx.replaceCreatureType(ref.target(), "Vampire")],
    ),
  },
  "Olivia's Wrath": {
    spell: spell([], [fx.pumpAll({ notSubtype: "Vampire" }, amount.neg(VAMPIRE_COUNT), amount.neg(VAMPIRE_COUNT))]),
  },
  "Pact of the Serpent": {
    spell: spell(
      [target.player()],
      [
        fx.chooseForSelf("creatureType"),
        fx.draw(amount.refCount(ref.permanentsOf(ref.target(), { types: ["Creature"], chosen: "subtype" })), ref.target()),
        fx.loseLife(amount.refCount(ref.permanentsOf(ref.target(), { types: ["Creature"], chosen: "subtype" })), ref.target()),
      ],
    ),
  },
  "Sorin, Imperious Bloodlord": {
    abilities: [
      loyalty(1, {
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.pump(ref.target(), 0, 0, ["deathtouch", "lifelink"]),
          ...fx.when(cond.refMatches(ref.target(), { subtype: "Vampire" }), fx.addCounters(ref.target(), 1)),
        ],
        label: "Deathtouch and lifelink; +1/+1 if it's a Vampire",
      }),
      loyalty(1, {
        effects: [
          fx.sacrifice(ref.you, { subtype: "Vampire" }, 1, { optional: true, store: "s" }),
          ...fx.when(cond.v("s"), fx.reflexive([target.any()], [fx.damage(3, ref.target()), fx.gainLife(3)])),
        ],
        label: "Sacrifice a Vampire: 3 damage to any target, gain 3 life",
      }),
      loyalty(-3, {
        effects: [fx.pickFromZone("hand", { types: ["Creature"], subtype: "Vampire" }, { to: "battlefield" }, { min: 0 })],
        label: "Put a Vampire creature card from your hand onto the battlefield",
      }),
    ],
  },
};
