import type { Effect } from "@mtgx/engine";
/** Reality Fracture — green cards. */
import {
  activated,
  amount,
  BASIC_LAND,
  BEAST_TRAMPLE,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  empower,
  entersWith,
  FOREST_TENTACLE,
  flashback,
  fx,
  HEARTWOOD,
  loyalty,
  MOWU,
  manaAbility,
  modal,
  mode,
  ref,
  SOUL_TETHER,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  walkersHave,
  when,
} from "./common";

/** "{1}, Sacrifice another artifact: +1/+1 counter, gains [ability]" (one choice per activated ability). */
const puppetbeastBoost = (kw: "trample" | "hexproof" | "haste", label: string) =>
  activated({
    mana: "{1}",
    sacrificeOther: { filter: { types: ["Artifact"], controller: "you", other: true } },
    effects: [fx.addCounters(ref.self, 1), fx.modify(ref.self, { addKeywords: [kw] })],
    label,
  });

export const GREEN: Record<string, CardScript> = {
  "Bestial Incursion": { castOptions: [flashback("{5}{G}")], spell: spell([], [fx.createTokens(BEAST_TRAMPLE)]) },
  "Budding Insurgent": {
    abilities: [
      activated({
        sacrifice: true,
        sorcerySpeed: true,
        targets: [targetObj("t", { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"] }] }, "artifact or enchantment")],
        effects: [
          ...fx.when(cond.refMatches(ref.target(), { types: ["Enchantment"], legendary: true }), fx.draw(1)),
          fx.destroy(ref.target()),
        ],
        label: "Sacrifice it: destroy an artifact or enchantment",
      }),
    ],
  },
  "Greenhouse Propagator": {
    abilities: [
      triggered(when.enters({ types: ["Creature"], controller: "you", other: true }), [fx.gainLife(1)], { label: "+1 life" }),
      manaAbility("G"),
    ],
  },
  "Hungering Puppetbeast": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(HEARTWOOD)], { label: "Heartwood" }),
      puppetbeastBoost("trample", "+1/+1 counter and trample"),
      puppetbeastBoost("hexproof", "+1/+1 counter and hexproof"),
      puppetbeastBoost("haste", "+1/+1 counter and haste"),
    ],
  },
  "Hunter's Axe": {
    abilities: [
      staticAbility(
        "attached",
        {
          power: 2,
          addAbilities: [
            // "Your choice of trample or deathtouch": a yes/no question (a granted ability has no modes).
            triggered(
              when.attacksSelf,
              [
                ...fx.mayForStore(ref.you, "Trample (otherwise deathtouch)?", "trample", [
                  fx.modify(ref.self, { addKeywords: ["trample"] }),
                ]),
                ...fx.when(cond.not(cond.v("trample")), fx.modify(ref.self, { addKeywords: ["deathtouch"] })),
              ],
              { label: "Trample or deathtouch" },
            ),
          ],
        },
        { label: "+2/+0, trample or deathtouch when attacking" },
      ),
    ],
  },
  "Puppet Crafting": {
    enchant: {
      filter: { anyOf: [{ types: ["Artifact"] }, { types: ["Enchantment"], notSubtype: "Aura" }] },
      label: "artifact or non-Aura enchantment",
    },
    abilities: [
      staticAbility(
        "attached",
        { addTypes: ["Creature"], addSubtypes: ["Construct"], setPower: 5, setToughness: 5 },
        { label: "5/5 Construct creature" },
      ),
      activated({ mana: "{4}{G}", fromGraveyard: true, effects: [fx.toHand(ref.self)], label: "Return to hand" }),
    ],
  },
  "Restore with Empathy": {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard")],
      [fx.toHand(ref.target()), fx.gainLife(4)],
    ),
  },
  "Simulacrum Shaper": {
    abilities: [
      triggered(when.entersSelf, fx.may("Search for a basic land?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })), {
        label: "tapped basic land",
      }),
      triggered(when.diesSelf, [fx.draw(1)], { label: "draw a card" }),
    ],
  },
  "Something Worth Saving": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          { min: 0, pool: ref.stored("m"), prompt: "You may take back a milled permanent card" },
        ),
        fx.gainLife(1),
      ],
    ),
  },
  "Tethermage's Advantage": {
    spell: spell([target.creature("t")], [fx.pump(ref.target(), 2, 2, ["reach"]), fx.untap(ref.target())]),
  },
  "Verdant Kraken": {
    abilities: [triggered(when.step("upkeep", "any"), [fx.createTokens(FOREST_TENTACLE)], { label: "Forest Tentacle" })],
  },
  "Wrecking Gecko": {
    abilities: [activated({ mana: "{6}{G}{G}", effects: [fx.pump(ref.self, 4, 4, ["trample"])], label: "+4/+4 and trample" })],
  },
  "Edgar, Moonlit Sovereign": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 2)], {
        condition: cond.not(cond.castThisTurn(1)),
        label: "No spell this turn: two counters",
      }),
      activated({
        mana: "{4}{G}",
        effects: [fx.addCountersAll({ types: ["Creature"], controller: "you", withCounter: "+1/+1" }, 1)],
        label: "A counter on each creature that already has one",
      }),
    ],
  },
  "Ghalta the Unstoppable": {
    costReduction: { generic: amount.maxPower(CREATURE_YOU_CONTROL) },
    abilities: [
      staticAbility({ types: ["Creature"], controller: "you", other: true }, { addKeywords: ["trample"] }, { label: "Trample" }),
    ],
  },
  "Jiang Yanggu, Never Alone": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(MOWU)], { label: "Mowu" }),
      triggered(when.yourEndStep, [fx.untapUpTo({ token: true, controller: "you" }, 99)], { label: "untaps your tokens" }),
    ],
  },
  "Marwyn, the Preserver": {
    abilities: [
      staticAbility({ types: ["Land"], controller: "you" }, { addKeywords: ["hexproof"] }, { label: "Hexproof" }),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card in your graveyard")],
        effects: [fx.toHand(ref.target())],
        label: "Return a land card",
      }),
    ],
  },
  "Pia, Aether Ascetic": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.discard(1, ref.you, { optional: true, store: "d" }), ...fx.when(cond.v("d"), fx.search({ types: ["Enchantment"] }))],
        { label: "discard: search for an enchantment" },
      ),
    ],
  },
  "Yoshimaru, Scrappy Stray": {
    abilities: [
      triggered(when.entersSelf, [fx.fight(ref.target("a"), ref.target("b"))], {
        targets: [
          target.creature("a", { controller: "you", other: true }),
          target.upTo(1, target.creature("b", { controller: "opponent" })),
        ],
        label: "fight",
      }),
      activated({
        mana: "{6}",
        targets: [target.creature("t", { legendary: false })],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "Counter on a nonlegendary creature",
      }),
    ],
  },
  "Vinelasher Adept": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 3)], {
        targets: [target.creature("t")],
        label: "three counters",
      }),
    ],
  },
  "Sureshot Sower": {
    abilities: [
      activated({
        mana: "{3}{G}",
        fromHand: true,
        discardSelf: true,
        targets: [target.creature("t", { keyword: "flying" })],
        effects: [fx.destroy(ref.target())],
        label: "Discard: destroy a creature with flying",
      }),
    ],
  },
  "Fblthp, Knows the Way": {
    cda: { power: amount.basicLandTypes },
    abilities: [
      triggered(when.entersSelf, [{ ...fx.search(BASIC_LAND, { to: "hand" }, amount.sourceX), distinctNames: true } as Effect], {
        label: "up to X basic lands with different names",
      }),
    ],
  },
  "Titanbones, Towering Heart": {
    abilities: [
      triggered(when.gainLife, [fx.addCounters(ref.self, 2)], { label: "two +1/+1 counters" }),
      triggered(when.discardSelf, [fx.gainLife(3)], { fromGraveyard: true, label: "discarded: +3 life" }),
    ],
  },
  "Carnivorous Cultivator": {
    prepareSpell: spell([], [fx.search({ types: ["Land"] }, { to: "graveyard" })]),
    abilities: [
      entersWith({ prepared: true }),
      triggered(when.combatDamageToPlayer, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card in your graveyard")],
        label: "returns a land card",
      }),
    ],
  },
  "Heartwood Crafter": {
    prepareSpell: SOUL_TETHER,
    abilities: [entersWith({ prepared: true }), manaAbility("C", 1, { restriction: { notSpellFromHand: true } })],
  },
  "Arcane Amphisbaena": { abilities: [triggered(when.entersSelf, [empower(2)], { label: "Empower Jace 2" })] },
  "Inspired Tethermage": {
    abilities: [
      triggered(when.youPutCounters({ types: ["Planeswalker"] }, "loyalty"), [fx.addCounters(ref.self, 1)], {
        label: "put a +1/+1 counter",
      }),
      activated({ mana: "{6}", effects: [empower(2)], label: "Empower Jace 2" }),
    ],
  },
  "Way of the Paradox": {
    abilities: [
      triggered(when.entersSelf, [empower(5)], { label: "Empower Jace 5" }),
      triggered(when.loyaltyActivated(), [fx.gainLife(1), fx.extraLandThisTurn], { label: "+1 life, additional land" }),
    ],
  },
  "Way of the Wildspeaker": {
    abilities: [
      triggered(when.entersSelf, [empower(7)], { label: "Empower Jace 7" }),
      walkersHave(loyalty(-4, { effects: [fx.createTokens(BEAST_TRAMPLE)], label: "4/4 Beast" }), "Planeswalkers: [−4] Beast"),
    ],
  },
  "Compel Brutality": {
    spell: modal(
      mode(
        "Your creature deals damage equal to its power",
        [target.creature("a", { controller: "you" }), target.creatureOrPlaneswalker("b", { controller: "opponent" })],
        [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
      ),
      mode(
        "Your planeswalker deals damage equal to its loyalty",
        [
          targetObj("a", { types: ["Planeswalker"], controller: "you" }, "planeswalker you control"),
          target.creatureOrPlaneswalker("b", { controller: "opponent" }),
        ],
        [fx.damage(amount.countersOn(ref.target("a"), "loyalty"), ref.target("b"), ref.target("a"))],
      ),
    ),
  },
  "Flourishing Grapple": {
    spell: spell(
      [
        target.creatureOrPlaneswalker("b", { controller: "opponent", colors: ["R", "W"] }),
        target.creature("a", { controller: "you" }),
      ],
      [
        fx.modify(ref.target("b"), { loseAllAbilities: true }),
        fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a")),
      ],
    ),
  },
};
