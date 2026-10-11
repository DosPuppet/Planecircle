/**
 * Commander: "Tevesh Szat + Jeska - My Demonic Signature Deck" (Tevesh Szat, Doom of Fools and Jeska, Thrice Reborn;
 * Rakdos; Kronic_EDH_Vet's list). Demons (Abyssal Persecutor, Bloodthirster, Orcus, Rakdos, the Showstopper, Reaper
 * from the Abyss, Shadowborn Demon), reanimation (Animate Dead, Dread Return, Soul Exchange, Buried Alive), removal
 * (Hellfire, Kindred Dominance, Chaos Warp) and lands (Maze of Ith, Volrath's Stronghold, Westvale Abbey).
 */
import type { Amount, CardScript, Effect, Ref, TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCost,
  altCostMode,
  amount,
  block,
  blockAbility,
  chapter,
  cond,
  costReducer,
  entersWith,
  escalate,
  eventReplacement,
  flashback,
  fx,
  loyalty,
  loyaltyX,
  manaAbility,
  playerStatic,
  prevention,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

/** `fx.forEachPlayer` goes through six seats: this one is a player in the game. */
const seated = (p: Ref) => cond.amountAtLeast(amount.refCount(p), 1);
/** The greatest power among the designated objects (last known information of those that left the battlefield). */
const greatestPowerOf = (r: Ref): Amount => ({ kind: "aggregate", fn: "max", property: "power", of: r });
/** The commanders you own on the battlefield or in the command zone. */
const YOUR_COMMANDERS = ref.union(
  ref.zone("command", ref.you, { commander: true }),
  ref.permanentsOf(ref.eachPlayer, { commander: true, owner: "you" }),
);

const CLERIC_BLACK: TokenSpec = {
  name: "Cleric",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Cleric"],
  power: 0,
  toughness: 1,
};
const HUMAN_CLERIC_WB: TokenSpec = {
  name: "Human Cleric",
  colors: ["W", "B"],
  types: ["Creature"],
  subtypes: ["Human", "Cleric"],
  power: 1,
  toughness: 1,
};
const DEMON_FLYING_XX: TokenSpec = {
  name: "Demon",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Demon"],
  power: 0,
  toughness: 0,
  keywords: ["flying"],
};
const BELZENLOK: TokenSpec = {
  name: "Demon",
  colors: ["B"],
  types: ["Creature"],
  subtypes: ["Demon"],
  power: 6,
  toughness: 6,
  keywords: ["flying", "trample"],
  abilities: [
    triggered(
      when.yourUpkeep,
      [
        fx.sacrifice(ref.you, { types: ["Creature"], other: true }, 1, { store: "s" }),
        ...fx.when(cond.not(cond.v("s")), fx.damage(6, ref.you)),
      ],
      { label: "Sacrifice another creature; if you can't, it deals 6 damage to you" },
    ),
  ],
  text: "Flying, trample\nAt the beginning of your upkeep, sacrifice another creature. If you can't, this token deals 6 damage to you.",
};

export const EDH_TEVESH_JESKA: Record<string, CardScript> = {
  // --- Commanders -----------------------------------------------------------------------------------------------------
  // Tevesh Szat, Doom of Fools: with the Sephiroth deck (`edh/sephiroth.ts`).
  // "One of your opponents": an effect of Jeska's controller (the replacement's recipient is seen from them), whose
  // source is the target creature, frozen as the ability resolves.
  "Jeska, Thrice Reborn": {
    abilities: [
      entersWith({
        counters: amount.commanderCasts,
        counterKind: "loyalty",
        label: "Enters with a loyalty counter for each time you've cast a commander from the command zone",
      }),
      loyalty(0, {
        targets: [target.creature()],
        effects: [
          fx.untilYourNextTurn({
            replacement: { event: "damage", sourceRef: ref.target(), to: "opponent", combat: true, modify: { times: 3 } },
          }),
        ],
        label: "Until your next turn, that creature deals triple combat damage to your opponents",
      }),
      loyaltyX({
        targets: [target.upTo(3, target.any())],
        effects: [fx.damage(amount.x, ref.target())],
        label: "X damage to each of up to three targets",
      }),
    ],
  },

  // --- Creatures ------------------------------------------------------------------------------------------------------
  // Flying, trample: read from the text (also for Bloodthirster, Demon of Death's Gate, Orcus and Rakdos).
  "Abyssal Persecutor": {
    abilities: [
      playerStatic({
        cantLose: true,
        affects: "opponents",
        label: "You can't win the game and your opponents can't lose the game",
      }),
    ],
  },
  Anger: {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you" },
        { addKeywords: ["haste"] },
        {
          fromGraveyard: true,
          condition: cond.controls({ subtype: "Mountain" }),
          label: "In your graveyard, while you control a Mountain: creatures you control have haste",
        },
      ),
    ],
  },
  Bloodthirster: {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.untap(ref.self), fx.extraCombat], {
        label: "Untap it; an additional combat phase after this one",
      }),
      blockAbility(block.notSameDefenderTwice),
    ],
  },
  "Demon of Death's Gate": {
    castOptions: [
      altCost({
        mana: "{0}",
        condition: cond.all(),
        label: "Pay 6 life and sacrifice three black creatures",
        pay: { life: 6, sacrifice: { filter: { types: ["Creature"], colors: ["B"] }, count: 3 } },
      }),
    ],
  },
  "Falthis, Shadowcat Familiar": {
    abilities: [
      staticAbility(
        { commander: true, controller: "you" },
        { addKeywords: ["menace", "deathtouch"] },
        { label: "Commanders you control have menace and deathtouch" },
      ),
    ],
  },
  "Herald of Slaanesh": {
    abilities: [
      costReducer({ subtype: "Demon" }, 2, "Locus of Slaanesh — Demon spells you cast cost {2} less"),
      staticAbility(
        { subtype: "Demon", controller: "you", other: true },
        { addKeywords: ["haste"] },
        { label: "Other Demons you control have haste" },
      ),
    ],
  },
  // Approximation: the attack requirements are a goad (creatures goaded by Kardur's controller until their next turn).
  "Kardur, Doomscourge": {
    abilities: [
      triggered(when.entersSelf, [fx.goad(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))], {
        label: "Until your next turn, opposing creatures attack each combat, a player other than you if able",
      }),
      triggered(when.dies({ types: ["Creature"], attacking: true }), [fx.loseLife(1, ref.eachOpponent), fx.gainLife(1)], {
        label: "An attacking creature dies: each opponent loses 1 life and you gain 1 life",
      }),
    ],
  },
  "Orcus, Prince of Undeath": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          {
            label: "Each other creature gets -X/-X until end of turn; you lose X life",
            targets: [],
            effects: [
              fx.pumpAll({ types: ["Creature"], other: true }, amount.neg(amount.sourceX), amount.neg(amount.sourceX)),
              fx.loseLife(amount.sourceX),
            ],
          },
          {
            label: "Return up to X creature cards with total mana value X or less; they gain haste",
            targets: [
              {
                ...target.upTo(1, target.cardInGraveyard("t", { types: ["Creature"] })),
                countAmount: amount.sourceX,
                maxTotalManaValueAmount: amount.sourceX,
                label: "creature cards in your graveyard with total mana value X or less",
              },
            ],
            effects: [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "o" }), fx.pump(ref.stored("o"), 0, 0, ["haste"])],
          },
        ],
        { label: "Orcus enters: choose one" },
      ),
    ],
  },
  "Rakdos, the Showstopper": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.coinFlipEach(
            ref.permanentsOf(ref.eachPlayer, { types: ["Creature"], noneOfSubtypes: ["Demon", "Devil", "Imp"] }),
            "tails",
          ),
          fx.destroy(ref.stored("tails")),
        ],
        { label: "A coin for each creature that isn't a Demon, Devil, or Imp: destroy those that come up tails" },
      ),
    ],
  },
  "Reaper from the Abyss": {
    abilities: [
      triggered(when.eachEndStep, [fx.destroy(ref.target())], {
        condition: cond.morbid,
        targets: [target.creature("t", { notSubtype: "Demon" })],
        label: "Morbid — destroy target non-Demon creature",
      }),
    ],
  },
  "Shadowborn Demon": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.creature("t", { notSubtype: "Demon" })],
        label: "Destroy target non-Demon creature",
      }),
      triggered(when.yourUpkeep, [fx.sacrifice(ref.you, { types: ["Creature"] })], {
        condition: cond.not(cond.amountAtLeast(amount.countIn("graveyard", { types: ["Creature"] }), 6)),
        label: "Fewer than six creature cards in your graveyard: sacrifice a creature",
      }),
    ],
  },
  // Madness—{2}{B}, Pay 8 life: read from the text.
  "Shadowgrange Archfiend": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.eachOpponent, { types: ["Creature"] }, 1, { greatestPower: true, store: "s" }),
          fx.gainLife(greatestPowerOf(ref.stored("s"))),
        ],
        { label: "Each opponent sacrifices their creature with the greatest power; gain life equal to the greatest" },
      ),
    ],
  },

  // --- Artifacts and enchantments -------------------------------------------------------------------------------------
  "Animate Dead": {
    enchant: { filter: { types: ["Creature"] }, label: "creature card in a graveyard", graveyard: true },
    abilities: [
      staticAbility("attached", { power: -1 }, { label: "Enchanted creature gets -1/-0" }),
      triggered(when.leavesSelf, [fx.sacrificeIt(ref.linked)], {
        label: "It leaves the battlefield: that creature's controller sacrifices it",
      }),
    ],
  },
  "Bitter Reunion": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may("Discard a card to draw two cards?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(2))),
        { label: "You may discard a card; if you do, draw two cards" },
      ),
      activated({
        mana: "{1}",
        sacrifice: true,
        effects: [fx.pumpAll({ types: ["Creature"], controller: "you" }, 0, 0, ["haste"])],
        label: "Creatures you control gain haste until end of turn",
      }),
    ],
  },
  "Rite of Belzenlok": {
    abilities: [
      chapter([1, 2], [fx.createTokens(CLERIC_BLACK, 2)], { label: "Two 0/1 black Clerics" }),
      chapter([3], [fx.createTokens(BELZENLOK)], { label: "A 6/6 black Demon with flying and trample" }),
    ],
  },

  // --- Lands ----------------------------------------------------------------------------------------------------------
  "Maze of Ith": {
    abilities: [
      activated({
        tap: true,
        targets: [target.creature("t", { attacking: true })],
        effects: [
          fx.untap(ref.target()),
          fx.modify(ref.target(), {
            addAbilities: [
              prevention({ self: true }, { combatOnly: true, label: "Combat damage dealt to it is prevented" }),
              eventReplacement({
                event: "damage",
                source: { self: true },
                combat: true,
                modify: { prevent: true },
                label: "Combat damage it would deal is prevented",
              }),
            ],
          }),
        ],
        label: "Untap target attacking creature; prevent all combat damage dealt to and by it this turn",
      }),
    ],
  },
  "Volrath's Stronghold": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{1}{B}",
        tap: true,
        targets: [target.cardInGraveyard("t", { types: ["Creature"] })],
        effects: [fx.moveTo(ref.target(), { to: "libraryTop" })],
        label: "Put target creature card from your graveyard on top of your library",
      }),
    ],
  },
  Wasteland: {
    abilities: [
      manaAbility("C"),
      activated({
        tap: true,
        sacrifice: true,
        targets: [target.permanent("t", ["Land"], { basic: false }, "nonbasic land")],
        effects: [fx.destroy(ref.target())],
        label: "Destroy target nonbasic land",
      }),
    ],
  },
  // Ormendahl, Profane Prince (back face): flying, lifelink, indestructible, haste, read from the text.
  "Westvale Abbey": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{5}",
        tap: true,
        payLife: 1,
        effects: [fx.createTokens(HUMAN_CLERIC_WB)],
        label: "A 1/1 white and black Human Cleric",
      }),
      activated({
        mana: "{5}",
        tap: true,
        sacrificeOther: { filter: { types: ["Creature"] }, count: 5 },
        effects: [fx.transform(), fx.untap(ref.self)],
        label: "Sacrifice five creatures: transform it, then untap it",
      }),
    ],
  },

  // --- Spells ---------------------------------------------------------------------------------------------------------
  "Buried Alive": { spell: spell([], [fx.search({ types: ["Creature"] }, { to: "graveyard" }, 3)]) },
  "Chaos Warp": {
    spell: spell(
      [target.permanent("t", [], {}, "permanent")],
      [
        fx.moveTo(ref.target(), { to: "libraryTop", shuffle: true }, { name: "w" }),
        fx.reveal(ref.libraryTop(ref.ownerOf(ref.target()))),
        ...fx.when(
          cond.refMatches(ref.libraryTop(ref.ownerOf(ref.target())), { permanent: true }),
          fx.toBattlefield(ref.libraryTop(ref.ownerOf(ref.target()))),
        ),
      ],
    ),
  },
  "Dread Return": {
    castOptions: [flashback("{0}", { sacrifice: { filter: { types: ["Creature"] }, count: 3 } })],
    spell: spell([target.cardInGraveyard("t", { types: ["Creature"] })], [fx.toBattlefield(ref.target())]),
  },
  Hellfire: {
    spell: spell(
      [],
      [fx.destroyAll({ types: ["Creature"], not: { colors: ["B"] } }, "h"), fx.damage(amount.plus(amount.v("h"), 3), ref.you)],
    ),
  },
  "Infernal Grasp": { spell: spell([target.creature()], [fx.destroy(ref.target()), fx.loseLife(2)]) },
  "Kindred Dominance": {
    spell: spell([], [fx.chooseForSelf("creatureType"), fx.destroyAll({ types: ["Creature"], not: { chosen: "subtype" } })]),
  },
  "Night's Whisper": { spell: spell([], [fx.draw(2), fx.loseLife(2)]) },
  // Entwine {4}: both modes, for {4} more (in the printed order: the Demon counts the cards drawn).
  "Promise of Power": {
    spell: escalate(
      "{4}",
      { label: "You draw five cards and you lose 5 life", effects: [fx.draw(5), fx.loseLife(5)] },
      {
        label: "An X/X black Demon with flying, X being the cards in your hand",
        effects: [fx.createXXToken(DEMON_FLYING_XX, amount.cardsIn("hand"))],
      },
    ),
  },
  // Each opponent chooses first; then, for each of them, the effect of their choice.
  "Seize the Spotlight": {
    spell: spell(
      [],
      [
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) =>
          fx.when(
            seated(p),
            fx.yourChoice(
              "Fame or fortune?",
              `f${n}`,
              [
                { label: "Fame", effects: [] },
                { label: "Fortune", effects: [] },
              ],
              p,
            ),
          ),
        ),
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) => [
          ...fx.when(
            cond.all(cond.v(`f${n}`, 1), cond.not(cond.v(`f${n}`, 2))),
            fx.chooseAmong(ref.permanentsOf(p, { types: ["Creature"] }), ref.you, `c${n}`, {
              prompt: "Choose a creature to gain control of until end of turn",
            }),
            fx.gainControl(ref.stored(`c${n}`)),
            fx.untap(ref.stored(`c${n}`)),
            fx.pump(ref.stored(`c${n}`), 0, 0, ["haste"]),
          ),
          ...fx.when(cond.v(`f${n}`, 2), fx.draw(1), fx.createTokens(TREASURE)),
        ]),
      ],
    ),
  },
  "Sign in Blood": {
    spell: spell([target.player("p")], [fx.draw(2, ref.target("p")), fx.loseLife(2, ref.target("p"))]),
  },
  "Soul Exchange": {
    additionalCost: { exile: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] })],
      [
        fx.moveTo(ref.target(), { to: "battlefield" }, { name: "r" }),
        ...fx.when(cond.refMatches(ref.costExiled, { subtype: "Thrull" }), fx.counters(ref.stored("r"), "+2/+2")),
      ],
    ),
  },
  // "X is the mana value of a commander you own": with two commanders, you choose (suggested: the greatest).
  "Stinging Study": {
    spell: spell(
      [],
      [
        fx.chooseAmong(YOUR_COMMANDERS, ref.you, "study", {
          anyZone: true,
          suggest: "manaValue",
          prompt: "Choose a commander you own (X is its mana value)",
        }),
        fx.draw(amount.manaValueOf(ref.stored("study"))),
        fx.loseLife(amount.manaValueOf(ref.stored("study"))),
      ],
    ),
  },
  "Temur Battle Rage": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 0, 0, ["doubleStrike"]), ...fx.when(cond.ferocious, fx.pump(ref.target(), 0, 0, ["trample"]))],
    ),
  },
  // "Choose 1, 2, or 3 at random" (a three-sided roll); then a cascade with no mana value limit for the spell's
  // controller (the card not cast goes to the bottom with the others, in a random order).
  "Tibalt's Trickery": {
    spell: spell(
      [target.spell()],
      [
        // The countered card (in its owner's graveyard) gives the name to avoid.
        fx.counter(ref.target(), undefined, "countered"),
        fx.rollDie(3, "n"),
        fx.mill(amount.v("n"), ref.controllerOf(ref.target())),
        {
          op: "discover",
          n: Number.MAX_SAFE_INTEGER,
          who: ref.controllerOf(ref.target()),
          cascade: true,
          filter: { not: { shares: { what: "name", with: ref.stored("countered") } } },
        } as Effect,
      ],
    ),
  },
  Vandalblast: {
    spell: altCostMode(
      "Overload",
      "{4}{R}",
      {
        targets: [target.permanent("t", ["Artifact"], { controller: "opponent" }, "artifact you don't control")],
        effects: [fx.destroy(ref.target())],
      },
      { effects: [fx.destroyAll({ types: ["Artifact"], controller: "opponent" })] },
    ),
  },
};
