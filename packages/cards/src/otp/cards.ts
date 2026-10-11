/** Breaking News (OTP): card scripts (PLAN-G). */
import { type Effect, msg, type TargetSpec, type TokenSpec } from "@mtgx/engine";
import {
  activated,
  altCostMode,
  amount,
  BASIC_LAND,
  type CardScript,
  cmp,
  cond,
  escalate,
  eventReplacement,
  FOOD,
  fx,
  loyalty,
  modal,
  mode,
  ref,
  spell,
  TREASURE,
  target,
  triggered,
  when,
} from "../tdm/common";

const PEST: TokenSpec = {
  name: "Pest",
  colors: ["B", "G"],
  types: ["Creature"],
  subtypes: ["Pest"],
  power: 1,
  toughness: 1,
  abilities: [triggered(when.diesSelf, [fx.gainLife(1)], { label: "Dies: 1 life" })],
};
/** "Choose two —": each pair of modes (target ids differ from one mode to the other). */
function chooseTwo(...choices: { label: string; targets?: TargetSpec[]; effects: Effect[] }[]) {
  return modal(
    ...choices.flatMap((a, i) =>
      choices
        .slice(i + 1)
        .map((b) =>
          mode(
            msg("{a}; {b}", { a: a.label, b: b.label }),
            [...(a.targets ?? []), ...(b.targets ?? [])],
            [...a.effects, ...b.effects],
          ),
        ),
    ),
  );
}

/** Outlaws' Merriment: the three red and white Human tokens, with haste. */
const MERRIMENT: TokenSpec[] = [
  {
    name: "Human Warrior",
    colors: ["R", "W"],
    types: ["Creature"],
    subtypes: ["Human", "Warrior"],
    power: 3,
    toughness: 1,
    keywords: ["trample", "haste"],
  },
  {
    name: "Human Cleric",
    colors: ["R", "W"],
    types: ["Creature"],
    subtypes: ["Human", "Cleric"],
    power: 2,
    toughness: 1,
    keywords: ["lifelink", "haste"],
  },
  {
    name: "Human Rogue",
    colors: ["R", "W"],
    types: ["Creature"],
    subtypes: ["Human", "Rogue"],
    power: 1,
    toughness: 2,
    keywords: ["haste"],
    abilities: [
      triggered(when.entersSelf, [fx.damage(1, ref.target())], {
        targets: [target.any()],
        label: "Enters: 1 damage to any target",
      }),
    ],
  },
];

export const CARDS: Record<string, CardScript> = {
  "Collective Defiance": {
    spell: escalate(
      "{1}",
      {
        label: "Target player discards their hand, then draws that many",
        targets: [target.player("p")],
        effects: [fx.discard(999, ref.target("p"), { store: "n" }), fx.draw(amount.v("n"), ref.target("p"))],
      },
      { label: "4 damage to target creature", targets: [target.creature("c")], effects: [fx.damage(4, ref.target("c"))] },
      {
        label: "3 damage to target opponent or planeswalker",
        targets: [
          { id: "o", label: "opponent or planeswalker", filter: { players: "opponent", objects: { types: ["Planeswalker"] } } },
        ],
        effects: [fx.damage(3, ref.target("o"))],
      },
    ),
  },
  "Fierce Retribution": {
    spell: altCostMode(
      "Cleave",
      "{5}{W}",
      { targets: [target.creature("t", { attacking: true })], effects: [fx.destroy(ref.target())] },
      { targets: [target.creature()], effects: [fx.destroy(ref.target())] },
    ),
  },
  "Skewer the Critics": {
    // Spectacle {R}: read from the text.
    spell: spell([target.any()], [fx.damage(3, ref.target())]),
  },
  // — G6: Breaking News —
  "Journey to Nowhere": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature()],
        label: "Exile target creature",
      }),
    ],
  },
  // Flash: read from the text.
  "Leyline Binding": {
    costReduction: { generic: amount.basicLandTypes },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "nonland permanent an opponent controls")],
        label: "Exile a nonland permanent an opponent controls until this leaves",
      }),
    ],
  },
  Pariah: {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      eventReplacement({
        event: "damage",
        to: "you",
        redirectTo: "attached",
        modify: {},
        label: "Damage that would be dealt to you is dealt to the enchanted creature",
      }),
    ],
  },
  "Path to Exile": {
    spell: spell(
      [target.creature()],
      [
        fx.exile(ref.target()),
        ...fx.mayFor(
          ref.controllerOf(ref.target()),
          "search for a basic land",
          fx.search(BASIC_LAND, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        ),
      ],
    ),
  },
  "Archive Trap": {
    altCost: {
      mana: "{0}",
      condition: cond.amountAtLeast(amount.turnEvents({ event: "search", who: "opponent" }), 1),
      label: "An opponent searched their library — {0}",
    },
    spell: spell([target.player("t", "opponent")], [fx.mill(13, ref.target())]),
  },
  "Archmage's Charm": {
    spell: modal(
      mode("Counter target spell", [target.spell("s")], [fx.counter(ref.target("s"))]),
      mode("Target player draws two cards", [target.player("p")], [fx.draw(2, ref.target("p"))]),
      mode(
        "Control of a nonland permanent with mana value 1 or less",
        [target.nonland("n", { maxManaValue: 1 })],
        [fx.gainControl(ref.target("n"), { indefinitely: true })],
      ),
    ),
  },
  "Essence Capture": {
    spell: spell(
      [
        target.spell("s", { types: ["Creature"] }, "creature spell"),
        target.optional(target.creature("c", { controller: "you" })),
      ],
      [fx.counter(ref.target("s")), fx.addCounters(ref.target("c"), 1)],
    ),
  },
  "Mana Drain": {
    spell: spell(
      [target.spell()],
      [
        fx.delayedAt("yourNextMain", [fx.addManaChoice(amount.v("mv"), ["C"])], undefined, {
          mv: amount.manaValueOf(ref.target()),
        }),
        fx.counter(ref.target()),
      ],
    ),
  },
  "Mindbreak Trap": {
    altCost: {
      mana: "{0}",
      condition: cond.amountAtLeast(
        amount.refCount(
          ref.playersWhere(ref.eachOpponent, cond.amountAtLeast(amount.turnEvents({ event: "cast", who: "you" }), 3)),
        ),
        1,
      ),
      label: "An opponent cast three spells — {0}",
    },
    spell: spell([target.upTo(99, target.spell())], [fx.exile(ref.target())]),
  },
  Repulse: { spell: spell([target.creature()], [fx.bounce(ref.target()), fx.draw(1)]) },
  "Heartless Pillage": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.discard(2, ref.target()), ...fx.when(cond.raid, fx.createTokens(TREASURE))],
    ),
  },
  "Imp's Mischief": {
    spell: spell(
      [target.stackItemSingleTarget()],
      [fx.loseLife(amount.manaValueOf(ref.target())), fx.changeTarget(ref.target())],
    ),
  },
  "Overwhelming Forces": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.destroy(ref.permanentsOf(ref.target(), { types: ["Creature"] }), "d"), fx.draw(amount.v("d"))],
    ),
  },
  Reanimate: {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card in a graveyard")],
      [fx.loseLife(amount.manaValueOf(ref.target())), fx.toBattlefield(ref.target(), { underYourControl: true })],
    ),
  },
  Thoughtseize: {
    spell: spell(
      [target.player()],
      [fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } }), fx.loseLife(2)],
    ),
  },
  "Crackle with Power": {
    spell: spell(
      [{ ...target.any(), countX: "upTo", optional: true }],
      [fx.damage(amount.plus(amount.x, amount.x, amount.x, amount.x, amount.x), ref.target())],
    ),
  },
  Electrodominance: {
    spell: spell(
      [target.any()],
      [fx.damage(amount.x, ref.target()), fx.castNow(ref.handOf(ref.you), { free: true, maxManaValue: amount.x })],
    ),
  },
  Fling: {
    additionalCost: { sacrifice: { filter: { types: ["Creature"] }, count: 1 } },
    spell: spell([target.any()], [fx.damage(amount.powerOf(ref.costSacrificed), ref.target())]),
  },
  Skullcrack: {
    spell: spell(
      [{ id: "t", label: "player or planeswalker", filter: { players: "any", objects: { types: ["Planeswalker"] } } }],
      [
        fx.thisTurn({ cantGainLife: true }, ref.eachPlayer),
        fx.thisTurn({ damageUnpreventable: true }, ref.eachPlayer),
        fx.damage(3, ref.target()),
      ],
    ),
  },
  "Clear Shot": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 1, 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Pest Infestation": {
    spell: spell(
      [{ ...target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"), countX: "upTo", optional: true }],
      [fx.destroy(ref.target()), fx.createTokens(PEST, amount.plus(amount.x, amount.x))],
    ),
  },
  "Primal Command": {
    spell: chooseTwo(
      { label: "Target player gains 7 life", targets: [target.player("g")], effects: [fx.gainLife(7, ref.target("g"))] },
      {
        label: "A noncreature permanent on top of its owner's library",
        targets: [
          target.permanent("n", ["Artifact", "Enchantment", "Land", "Planeswalker", "Battle"], {}, "noncreature permanent"),
        ],
        effects: [fx.moveTo(ref.target("n"), { to: "libraryTop" })],
      },
      {
        label: "Target player shuffles their graveyard into their library",
        targets: [target.player("m")],
        effects: [fx.moveTo(ref.graveyardOf(ref.target("m")), { to: "libraryTop" }), fx.shuffle(ref.target("m"))],
      },
      { label: "Search for a creature card", effects: [fx.search({ types: ["Creature"] }, { to: "hand" })] },
    ),
  },
  // Cycling: read from the text.
  Thornado: { spell: spell([target.creature("t", { keyword: "flying" })], [fx.destroy(ref.target())]) },
  "Abrupt Decay": {
    cantBeCountered: true,
    spell: spell(
      [target.nonland("t", { maxManaValue: 3 }, "nonland permanent with mana value 3 or less")],
      [fx.destroy(ref.target())],
    ),
  },
  "Anguished Unmaking": { spell: spell([target.nonland()], [fx.exile(ref.target()), fx.loseLife(3)]) },
  "Back for More": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
      [
        fx.moveTo(ref.target(), { to: "battlefield" }, { name: "b" }),
        fx.reflexive(
          [target.optional(target.creature("f", { controller: "opponent" }))],
          [fx.fight(ref.target("b"), ref.target("f"))],
          {
            b: ref.stored("b"),
          },
        ),
      ],
    ),
  },
  Bedevil: {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature", "Planeswalker"], {}, "artifact, creature, or planeswalker")],
      [fx.destroy(ref.target())],
    ),
  },
  Crime: {
    spell: spell(
      [
        target.cardInGraveyard(
          "t",
          { anyOf: [{ types: ["Creature"] }, { types: ["Enchantment"] }] },
          "opponent",
          "creature or enchantment card in an opponent's graveyard",
        ),
      ],
      [fx.toBattlefield(ref.target(), { underYourControl: true })],
    ),
  },
  Punishment: {
    spell: spell(
      [],
      [
        fx.destroyAll({
          anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }, { types: ["Enchantment"] }],
          compare: [cmp.manaValue("=", amount.x)],
        }),
      ],
    ),
  },
  "Cruel Ultimatum": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.sacrifice(ref.target(), { types: ["Creature"] }),
        fx.discard(3, ref.target()),
        fx.loseLife(5, ref.target()),
        fx.pickFromZone("graveyard", { types: ["Creature"] }, { to: "hand" }, { count: 1, min: 1 }),
        fx.draw(3),
        fx.gainLife(5),
      ],
    ),
  },
  Decimate: {
    spell: spell(
      [
        target.permanent("a", ["Artifact"], {}, "artifact"),
        target.creature("c"),
        target.permanent("e", ["Enchantment"], {}, "enchantment"),
        target.permanent("l", ["Land"], {}, "land"),
      ],
      [fx.destroy(ref.union(ref.target("a"), ref.target("c"), ref.target("e"), ref.target("l")))],
    ),
  },
  "Decisive Denial": {
    spell: modal(
      mode(
        "Your creature fights an opposing creature",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.fight(ref.target("a"), ref.target("b"))],
      ),
      mode(
        "Counter target noncreature spell unless its controller pays {3}",
        [target.spell("s", { notTypes: ["Creature"] }, "noncreature spell")],
        [fx.unlessPays(ref.controllerOf(ref.target("s")), { mana: "{3}" }, fx.counter(ref.target("s")))],
      ),
    ),
  },
  "Detention Sphere": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.union(ref.target(), ref.sameNameOnBattlefield(ref.target())))], {
        targets: [target.optional(target.nonland("t", { not: { name: "Detention Sphere" } }))],
        label: "Exile a nonland permanent and all others with the same name until this leaves",
      }),
    ],
  },
  "Endless Detour": {
    spell: spell(
      [
        {
          id: "t",
          label: "spell, nonland permanent, or card in a graveyard",
          filter: { spells: {}, objects: { notTypes: ["Land"] }, cards: { filter: {}, whose: "any" } },
        },
      ],
      [fx.topOrBottom(ref.target())],
    ),
  },
  "Hindering Light": {
    spell: spell(
      [
        {
          id: "t",
          label: "spell that targets you or a permanent you control",
          filter: { spells: {}, spellsTargeting: { controller: "you" }, spellsTargetingYou: true },
        },
      ],
      [fx.counter(ref.target()), fx.draw(1)],
    ),
  },
  Humiliate: {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] } }),
        fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "h", {
          prompt: "One of your creatures gets a +1/+1 counter",
        }),
        fx.addCounters(ref.stored("h"), 1),
      ],
    ),
  },
  Hypothesizzle: {
    spell: spell(
      [],
      [
        fx.draw(2),
        fx.discard(1, ref.you, { optional: true, filter: { notTypes: ["Land"] }, store: "h" }),
        ...fx.when(cond.v("h"), fx.reflexive([target.creature()], [fx.damage(4, ref.target())])),
      ],
    ),
  },
  Ionize: {
    spell: spell([target.spell()], [fx.damage(2, ref.controllerOf(ref.target())), fx.counter(ref.target())]),
  },
  "Oko, Thief of Crowns": {
    abilities: [
      loyalty(2, { effects: [fx.createTokens(FOOD)], label: "A Food" }),
      loyalty(1, {
        targets: [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
        effects: [
          fx.modify(
            ref.target(),
            { addTypes: ["Creature"], setSubtypes: ["Elk"], setColors: ["G"], loseAllAbilities: true },
            "permanent",
            3,
          ),
        ],
        label: "Target artifact or creature becomes a green 3/3 Elk with no abilities",
      }),
      loyalty(-5, {
        targets: [
          target.permanent("a", ["Artifact", "Creature"], { controller: "you" }, "your artifact or creature"),
          target.creature("b", { controller: "opponent", maxPower: 3 }),
        ],
        effects: [fx.exchangeControl(ref.target("a"), ref.target("b"))],
        label: "Exchange control of your artifact or creature and an opposing creature with power 3 or less",
      }),
    ],
  },
  "Savage Smash": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 2, 2), fx.fight(ref.target("a"), ref.target("b"))],
    ),
  },
  // Flashback {1}{U}{B}: read from the text.
  "Siphon Insight": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.lookAtTop(2, {
          who: ref.target(),
          count: 1,
          exact: true,
          to: { to: "exile", faceDown: "you" },
          rest: "bottom",
          store: "x",
        }),
        fx.grantPlay(ref.stored("x"), { forever: true, anyMana: true }),
      ],
    ),
  },
  "Tyrant's Scorn": {
    spell: modal(
      mode(
        "Destroy a creature with mana value 3 or less",
        [target.creature("d", { maxManaValue: 3 })],
        [fx.destroy(ref.target("d"))],
      ),
      mode("Return a creature to its owner's hand", [target.creature("b")], [fx.bounce(ref.target("b"))]),
    ),
  },
  "Vanishing Verse": {
    spell: spell([{ id: "t", label: "monocolored permanent", filter: { objects: { colorCount: 1 } } }], [fx.exile(ref.target())]),
  },
  "Villainous Wealth": {
    spell: spell(
      [target.player("t", "opponent")],
      [fx.exileTop(ref.target(), amount.x, "v"), fx.castNow(ref.stored("v"), { free: true, many: true, maxManaValue: amount.x })],
    ),
  },
  "Void Rend": { cantBeCountered: true, spell: spell([target.nonland()], [fx.destroy(ref.target())]) },
  Voidslime: {
    spell: spell([{ id: "t", label: "spell or ability", filter: { stackItems: {} } }], [fx.counter(ref.target())]),
  },
  "Contagion Engine": {
    abilities: [
      triggered(when.entersSelf, [fx.counters(ref.permanentsOf(ref.target(), { types: ["Creature"] }), "-1/-1")], {
        targets: [target.player()],
        label: "A −1/−1 counter on each creature target player controls",
      }),
      activated({ mana: "{4}", tap: true, effects: [fx.proliferate(2)], label: "Proliferate twice" }),
    ],
  },
  Mindslaver: {
    abilities: [
      activated({
        mana: "{4}",
        tap: true,
        sacrifice: true,
        targets: [target.player()],
        effects: [fx.controlNextTurn(ref.target())],
        label: "Control target player during their next turn",
      }),
    ],
  },
  // — G4e: hard sub-lot —
  "Force of Vigor": {
    altCost: {
      mana: "{0}",
      condition: cond.not(cond.yourTurn),
      label: "Force of Vigor — exile a green card from your hand",
      pay: { exileFromHand: { filter: { colors: ["G"] }, count: 1 } },
    },
    spell: spell(
      [target.upTo(2, target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"))],
      [fx.destroy(ref.target())],
    ),
  },
  "Surgical Extraction": {
    spell: spell(
      [target.cardInGraveyard("t", { basic: false }, "any", "card in a graveyard (other than a basic land)")],
      [fx.exileCardAndNamesakes(ref.target("t"))],
    ),
  },
  "Fell the Mighty": {
    spell: spell(
      [target.creature()],
      [fx.destroyAll({ types: ["Creature"], compare: [cmp.power(">", amount.rawPowerOf(ref.target()))] })],
    ),
  },
  "Ride Down": {
    spell: spell(
      [target.creature("t", { blocking: true })],
      [fx.pump(ref.combatPartners(ref.target()), 0, 0, ["trample"]), fx.destroy(ref.target())],
    ),
  },
  "Outlaws' Merriment": {
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.rollDie(3, "m"),
          ...MERRIMENT.flatMap((token, i) =>
            fx.when(cond.all(cond.v("m", i + 1), cond.not(cond.v("m", i + 2))), fx.createTokens(token)),
          ),
        ],
        { label: "Upkeep: a red and white Human token chosen at random" },
      ),
    ],
  },
  "Terminal Agony": {
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  Commandeer: {
    altCost: {
      mana: "{0}",
      condition: cond.all(),
      label: "Exile two blue cards from your hand",
      pay: { exileFromHand: { filter: { colors: ["U"] }, count: 2 } },
    },
    spell: spell(
      [{ id: "t", label: "noncreature spell", filter: { spells: { notTypes: ["Creature"] } } }],
      [fx.gainControl(ref.target()), fx.changeTarget(ref.target())],
    ),
  },
  Grindstone: {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.player()],
        effects: [fx.millWhileSharingColor(ref.target())],
        label: "{3}, {T}: the player mills two cards (and repeats if they share a color)",
      }),
    ],
  },
  "Fractured Identity": {
    spell: spell(
      [target.nonland()],
      [fx.copyToken(ref.target(), { for: ref.except(ref.eachPlayer, ref.controllerOf(ref.target())) }), fx.exile(ref.target())],
    ),
  },
  "Unlicensed Hearse": {
    cdaPT: amount.refCount(ref.linked),
    abilities: [
      activated({
        tap: true,
        targets: [
          { ...target.upTo(2, target.cardInGraveyard("t", {}, "any")), samePlayer: true, label: "cards from a single graveyard" },
        ],
        effects: [fx.exileCard(ref.target(), { name: "h" }), fx.link(ref.stored("h"))],
        label: "{T}: exile up to two cards from a graveyard (linked)",
      }),
    ],
  },
  "Indomitable Creativity": {
    spell: spell(
      [{ ...target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature"), countX: true }],
      [
        fx.destroy(ref.target(), "d"),
        {
          op: "exileUntil",
          filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] },
          store: "c",
          who: ref.controllerOf(ref.stored("d")),
        },
        fx.toBattlefield(ref.stored("c")),
        fx.shuffle(ref.controllerOf(ref.stored("d"))),
      ],
    ),
  },
};
