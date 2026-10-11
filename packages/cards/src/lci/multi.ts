/** The Lost Caverns of Ixalan — multicolored cards (legendaries included). */
import { msg } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  cond,
  DINOSAUR_3_3,
  DINOSAUR_EGG,
  DINOSAUR_YOU,
  descend,
  FUNGUS,
  fx,
  GNOME,
  loyalty,
  MAP,
  mode,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  PERMANENT_CARDS,
  ref,
  SPIRIT_3_2,
  spell,
  staticAbility,
  target,
  targetObj,
  triggered,
  VAMPIRE_DEMON,
  when,
} from "./common";

/** Wail of the Forgotten: the three modes, and all their combinations under descend 8. */
const WAIL_MODES = [
  {
    label: "Return a nonland permanent",
    targets: [target.nonland("a")],
    effects: [fx.bounce(ref.target("a"))],
  },
  {
    label: "An opponent discards a card",
    targets: [target.player("b", "opponent")],
    effects: [fx.discard(1, ref.target("b"))],
  },
  {
    label: "One card into your hand, the rest into the graveyard",
    targets: [],
    effects: [fx.lookAtTop(3, { count: 1, rest: "graveyard" })],
  },
];
const wailModes = () => {
  const out = [];
  for (let mask = 1; mask < 8; mask++) {
    const chosen = WAIL_MODES.filter((_, i) => mask & (1 << i));
    const m = mode(
      chosen.map((c) => c.label).reduce((a, b) => msg("{a} + {b}", { a, b })),
      chosen.flatMap((c) => c.targets),
      chosen.flatMap((c) => c.effects),
    );
    out.push(chosen.length > 1 ? { ...m, condition: descend(8) } : m);
  }
  return out;
};

export const MULTI: Record<string, CardScript> = {
  "Abuelo, Ancestral Echo": {
    abilities: [
      activated({
        mana: "{1}{W}{U}",
        targets: [targetObj("t", { ...OTHER_ARTIFACT_OR_CREATURE_YOURS }, "other creature or artifact you control")],
        effects: [
          fx.exileCard(ref.target(), { name: "k" }),
          fx.delayed([fx.toBattlefield(ref.target("k"))], { k: ref.stored("k") }),
        ],
        label: "Exile it until the end step",
      }),
    ],
  },
  "Akawalli, the Seething Tower": {
    abilities: [
      staticAbility(
        "self",
        { power: 2, toughness: 2, addKeywords: ["trample"] },
        {
          condition: descend(4),
          label: "Descend 4 — +2/+2 and trample",
        },
      ),
      staticAbility(
        "self",
        { power: 2, toughness: 2, addBlockRules: [block.atMost(1)] },
        {
          condition: descend(8),
          label: "Descend 8 — +2/+2, a single blocker",
        },
      ),
    ],
  },
  "Amalia Benavides Aguirre": {
    abilities: [
      triggered(
        when.gainLife,
        [
          fx.explore(),
          ...fx.when(
            cond.all(
              cond.amountAtLeast(amount.powerOf(ref.self), 20),
              cond.not(cond.amountAtLeast(amount.powerOf(ref.self), 21)),
            ),
            fx.destroyAll({ types: ["Creature"], other: true }),
          ),
        ],
        { label: "Explore; power 20: destroy the other creatures" },
      ),
    ],
  },
  "The Ancient One": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(descend(8)),
          label: "Descend 8 — otherwise can't attack or block",
        },
      ),
      activated({
        mana: "{2}{U}{B}",
        effects: [
          fx.draw(1),
          fx.discard(1, ref.you, { store: "d" }),
          fx.reflexive([target.player()], [fx.mill(amount.manaValueOf(ref.target("d")), ref.target())], { d: ref.stored("d") }),
        ],
        label: "Loot; a player mills",
      }),
    ],
  },
  "Anim Pakal, Thousandth Moon": {
    abilities: [
      triggered(
        when.attackWith(1, { types: ["Creature"], controller: "you", notSubtype: "Gnome" }),
        [fx.addCounters(ref.self, 1), fx.createTappedTokens(GNOME, amount.countersOn(ref.self), { attacking: true })],
        { label: "+1/+1 counter, attacking Gnomes" },
      ),
    ],
  },
  "Bartolomé del Presidio": {
    abilities: [
      activated({
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        effects: [fx.addCounters(ref.self, 1)],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Captain Storm, Cosmium Raider": {
    abilities: [
      triggered(when.enters({ types: ["Artifact"], controller: "you" }), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you", subtype: "Pirate" })],
        label: "+1/+1 counter on a Pirate",
      }),
    ],
  },
  "Deepfathom Echo": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.explore(),
          // The creature to copy is chosen after exploring, without targeting.
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true }), ref.you, "c", {
            optional: true,
            prompt: "Become a copy of one of your other creatures until end of turn?",
          }),
          fx.becomeCopy(ref.self, ref.stored("c")),
        ],
        { label: "Explore, then copy" },
      ),
    ],
  },
  "Gishath, Sun's Avatar": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.lookAtTop(amount.eventAmount, {
            filter: { types: ["Creature"], subtype: "Dinosaur" },
            count: amount.eventAmount,
            to: { to: "battlefield" },
            rest: "bottom",
          }),
        ],
        { label: "Revealed Dinosaurs onto the battlefield" },
      ),
    ],
  },
  "Itzquinth, Firstborn of Gishath": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          ...fx.mayPay(
            "{2}",
            "Pay {2}?",
            fx.reflexive(
              [target.creature("a", DINOSAUR_YOU), { ...target.creature("b"), otherThan: ["a"] }],
              [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
            ),
          ),
        ],
        { label: "A Dinosaur deals its damage" },
      ),
    ],
  },
  "Kellan, Daring Traveler": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // A creature card with MV 3 or less goes to the hand; otherwise, it may go to the graveyard.
          fx.lookAtTop(1, { filter: { types: ["Creature"], maxManaValue: 3 }, count: 1, exact: true, rest: "top", store: "k" }),
          ...fx.when(
            cond.all(cond.not(cond.v("k")), cond.amountAtLeast(amount.refCount(ref.libraryTop(ref.you)), 1)),
            ...fx.may("Put the revealed card into your graveyard?", fx.moveTo(ref.libraryTop(ref.you), { to: "graveyard" })),
          ),
        ],
        { label: "Creature with MV 3 or less into your hand" },
      ),
    ],
  },
  "Journey On": {
    spell: spell(
      [],
      // X: one plus the number of opponents who control an artifact.
      [
        fx.createTokens(
          MAP,
          amount.plus(amount.refCount(ref.playersWhere(ref.eachOpponent, cond.controls({ types: ["Artifact"] }))), 1),
        ),
      ],
    ),
  },
  "Nicanzil, Current Conductor": {
    abilities: [
      triggered(
        when.explores({ types: ["Creature"], controller: "you" }, true),
        [fx.pickFromZone("hand", { types: ["Land"] }, { to: "battlefield", tapped: true }, { count: 1, min: 0 })],
        { label: "Land from your hand, tapped" },
      ),
      triggered(when.explores({ types: ["Creature"], controller: "you" }, false), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Palani's Hatcher": {
    abilities: [
      staticAbility({ ...DINOSAUR_YOU, other: true }, { addKeywords: ["haste"] }, { label: "Other Dinosaurs: haste" }),
      triggered(when.entersSelf, [fx.createTokens(DINOSAUR_EGG, 2)], { label: "Two 0/1 Eggs" }),
      triggered(when.yourCombat, [fx.sacrifice(ref.you, { subtype: "Egg" }), fx.createTokens(DINOSAUR_3_3)], {
        condition: cond.controls({ subtype: "Egg" }),
        label: "Sacrifice an Egg: 3/3 Dinosaur",
      }),
    ],
  },
  "Saheeli, the Sun's Brilliance": {
    abilities: [
      activated({
        mana: "{U}{R}",
        tap: true,
        targets: [targetObj("t", { ...OTHER_ARTIFACT_OR_CREATURE_YOURS }, "other creature or artifact you control")],
        effects: [fx.copyToken(ref.target(), { addTypes: ["Artifact"], addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "Token copy (artifact, haste)",
      }),
    ],
  },
  "Squirming Emergence": {
    spell: spell(
      [
        {
          ...target.cardInGraveyard("t", { permanent: true, notTypes: ["Land"] }, "you", "nonland permanent card"),
          // "with mana value less than or equal to the number of permanent cards in your graveyard": at targeting and
          // again on resolution (608.2b).
          maxManaValueAmount: PERMANENT_CARDS,
        },
      ],
      [
        ...fx.when(
          cond.amountAtLeast(amount.plus(PERMANENT_CARDS, amount.neg(amount.manaValueOf(ref.target()))), 0),
          fx.toBattlefield(ref.target()),
        ),
      ],
    ),
  },
  "Uchbenbak, the Great Mistake": {
    abilities: [
      activated({
        mana: "{4}{U}{B}",
        fromGraveyard: true,
        sorcerySpeed: true,
        activationCondition: descend(8),
        effects: [fx.toBattlefield(ref.selfCard, { counters: { kind: "finality", n: 1 } })],
        label: "Descend 8 — returns (finality)",
      }),
    ],
  },
  "Vito, Fanatic of Aclazotz": {
    abilities: [
      triggered(
        when.sacrifice({ other: true }),
        [
          fx.countResolution("n"),
          ...fx.when(cond.all(cond.v("n", 1), cond.not(cond.v("n", 2))), fx.gainLife(2)),
          ...fx.when(cond.all(cond.v("n", 2), cond.not(cond.v("n", 3))), fx.loseLife(2, ref.eachOpponent)),
          ...fx.when(cond.all(cond.v("n", 3), cond.not(cond.v("n", 4))), fx.createTokens(VAMPIRE_DEMON)),
        ],
        { label: "Sacrifice: life, life loss, Vampire Demon" },
      ),
    ],
  },
  "Wail of the Forgotten": { spell: { modes: wailModes() } },
  "Caparocti Sunborn": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          ...fx.may(
            "Tap two artifacts and/or creatures to discover 3?",
            fx.tapChosen({ anyOf: [{ types: ["Artifact"] }, { types: ["Creature"] }] }, "c"),
            ...fx.when(cond.v("c", 2), fx.discover(3)),
          ),
        ],
        { label: "Tap two permanents: discover 3" },
      ),
    ],
  },
  "Molten Collapse": {
    spell: {
      modes: [
        mode("Destroy a creature or planeswalker", [target.creatureOrPlaneswalker("a")], [fx.destroy(ref.target("a"))]),
        mode(
          "Destroy a noncreature, nonland permanent with MV 1 or less",
          [
            targetObj(
              "b",
              { notTypes: ["Land", "Creature"], maxManaValue: 1 },
              "noncreature, nonland permanent with MV 1 or less",
            ),
          ],
          [fx.destroy(ref.target("b"))],
        ),
        {
          ...mode(
            "Both (descend)",
            [
              target.creatureOrPlaneswalker("a"),
              targetObj(
                "b",
                { notTypes: ["Land", "Creature"], maxManaValue: 1 },
                "noncreature, nonland permanent with MV 1 or less",
              ),
            ],
            [fx.destroy(ref.target("a")), fx.destroy(ref.target("b"))],
          ),
          condition: cond.descended,
        },
      ],
    },
  },
  "The Mycotyrant": {
    cda: { pt: amount.count({ types: ["Creature"], controller: "you", anySubtype: ["Fungus", "Saproling"] }) },
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FUNGUS, amount.descendedThisTurn)], {
        label: "A Fungus for each descent",
      }),
    ],
  },
  "Quintorius Kand": {
    abilities: [
      triggered({ on: "castSpell", by: "you", fromExile: true }, [fx.damage(2, ref.eachOpponent), fx.gainLife(2)], {
        label: "Spell cast from exile: 2 damage, +2 life",
      }),
      loyalty(1, { effects: [fx.createTokens(SPIRIT_3_2)], label: "3/2 Spirit" }),
      loyalty(-3, { effects: [fx.discover(4)], label: "Discover 4" }),
      loyalty(-6, {
        targets: [target.upTo(40, target.cardInGraveyard("t", {}, "you"))],
        effects: [
          fx.exileCard(ref.target(), { name: "q" }),
          fx.addManaTimes(amount.refCount(ref.stored("q")), "R"),
          fx.grantPlay(ref.stored("q")),
        ],
        label: "Exile cards from your graveyard: {R} each, playable this turn",
      }),
    ],
  },
  "Zoyowa Lava-Tongue": {
    abilities: [
      triggered(when.yourEndStep, [fx.punisher(ref.eachOpponent, 0, { discard: true, sacrifice: {}, damage: 3 })], {
        condition: cond.descended,
        label: "Descend — discard, sacrifice or 3 damage",
      }),
    ],
  },
};
