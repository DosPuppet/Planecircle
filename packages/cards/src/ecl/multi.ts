/** Lorwyn Eclipsed: multicolored and hybrid cards. */
import { type Amount, type ModeDef, msg, type ObjectFilter, type Ref } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  cmp,
  cond,
  costReducer,
  ELF_BG,
  entersWith,
  fx,
  KITHKIN,
  MERFOLK_WU,
  mode,
  playerStatic,
  protection,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  WORM_BG,
  when,
} from "./common";

/**
 * "Choose two —": each pair of modes becomes one mode (like Spree). Target ids must differ from one mode to the
 * other.
 */
function chooseTwo(...modes: ModeDef[]): { modes: ModeDef[] } {
  const out: ModeDef[] = [];
  modes.forEach((a, i) => {
    for (const b of modes.slice(i + 1)) {
      out.push({
        label: msg("{a} + {b}", { a: a.label ?? "", b: b.label ?? "" }),
        targets: [...a.targets, ...b.targets],
        effects: [...a.effects, ...b.effects],
      });
    }
  });
  return { modes: out };
}

/** Creatures controlled by the given player. */
const creaturesOf = (player: Ref): Ref => ref.permanentsOf(player, { types: ["Creature"] });

/**
 * Lorwyn Commands: "Create a token that's a copy of target [creature of the tribe] you control." `label`: the mode;
 * `targetLabel`: the target.
 */
const copyKin = (subtype: string, label: string, targetLabel: string): ModeDef =>
  mode(
    label,
    [{ id: "kin", label: targetLabel, filter: { objects: { subtype, controller: "you" } } }],
    [fx.copyToken(ref.target("kin"))],
  );

/** "Eclipsed" cards: look at the top four cards, reveal one of the tribe or of one of the two land types. */
const eclipsed = (kin: string, land1: string, land2: string, label: string): CardScript => ({
  abilities: [
    triggered(
      when.entersSelf,
      [
        fx.lookAtTop(4, {
          filter: { anyOf: [{ subtype: kin }, { subtype: land1 }, { subtype: land2 }] },
          count: 1,
          rest: "bottom",
        }),
      ],
      { label },
    ),
  ],
});

/** "X is the difference between its power and toughness" (Doran). */
const ptGap = (r: Ref): Amount =>
  amount.max(
    amount.plus(amount.powerOf(r), amount.neg(amount.toughnessOf(r))),
    amount.plus(amount.toughnessOf(r), amount.neg(amount.powerOf(r))),
  );

/** Hexproof from each of its colors (Tam): one static ability per color. */
const TAM_COLORS = {
  W: { hexproof: "Hexproof from white", label: "Your other white creatures have hexproof from white" },
  U: { hexproof: "Hexproof from blue", label: "Your other blue creatures have hexproof from blue" },
  B: { hexproof: "Hexproof from black", label: "Your other black creatures have hexproof from black" },
  R: { hexproof: "Hexproof from red", label: "Your other red creatures have hexproof from red" },
  G: { hexproof: "Hexproof from green", label: "Your other green creatures have hexproof from green" },
} as const;
const tamHexproof = (Object.keys(TAM_COLORS) as (keyof typeof TAM_COLORS)[]).map((c) =>
  staticAbility(
    { types: ["Creature"], controller: "you", other: true, colors: [c] },
    { addProtections: [protection.hexproofFrom({ colors: [c] }, TAM_COLORS[c].hexproof)] },
    { label: TAM_COLORS[c].label },
  ),
);

const MERFOLK_YOU: ObjectFilter = { subtype: "Merfolk", controller: "you" };

export const MULTI: Record<string, CardScript> = {
  "Sanar, Innovative First-Year": {
    abilities: [
      triggered(
        when.step("main1", "you"),
        [
          fx.revealUntilN({ notTypes: ["Land"] }, amount.colorsAmong(), undefined, "r"),
          fx.pickFromZone(
            "graveyard",
            {},
            { to: "exile" },
            {
              pool: ref.stored("r"),
              count: 5,
              min: 0,
              onePerColorOf: { permanent: true, controller: "you" },
              store: "e",
              prompt: "For each color among your permanents, you may exile a revealed card of that color",
            },
          ),
          fx.shuffle(ref.you),
          fx.grantPlay(ref.stored("e")),
        ],
        { label: "Vivid — reveal up to X nonland cards; exile one of each color, playable this turn" },
      ),
    ],
  },
  "Raiding Schemes": {
    // Granted conspire (702.78): an optional cost paid while casting the spell, then "when you cast it, copy it".
    abilities: [
      playerStatic({
        copyCost: { filter: { notTypes: ["Creature"] }, conspire: true },
        label: "Each noncreature spell you cast has conspire",
      }),
    ],
  },
  "Lluwen, Imperfect Naturalist": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone(
            "graveyard",
            { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] },
            { to: "libraryTop" },
            {
              pool: ref.stored("m"),
              min: 0,
              prompt: "You may put a creature or land card on top of your library",
            },
          ),
        ],
        { label: "Mill four cards; a creature or land among them on top of your library" },
      ),
      activated({
        mana: "{2}{B/G}{B/G}{B/G}",
        tap: true,
        discard: 1,
        discardFilter: { types: ["Land"] },
        effects: [fx.createTokens(WORM_BG, amount.countIn("graveyard", { types: ["Land"] }))],
        label: "Discard a land card: a 1/1 Worm for each land card in your graveyard",
      }),
    ],
  },
  "Dream Harvest": {
    // "You may cast the exiled cards": not the land cards, nor a land back face (played, not cast).
    spell: spell(
      [],
      [fx.exileUntilTotalManaValue(ref.eachOpponent, 5, "h"), fx.grantPlay(ref.stored("h"), { free: true, castOnly: true })],
    ),
  },
  // Flying read from the text.
  "Maralen, Fae Ascendant": {
    abilities: [
      triggered(
        when.enters({ controller: "you", anyOf: [{ subtype: "Elf" }, { subtype: "Faerie" }] }),
        [fx.exileTop(ref.target(), 2, "m"), fx.link(ref.stored("m"))],
        {
          targets: [target.player("t", "opponent")],
          label: "Exile the top two cards of target opponent's library",
        },
      ),
      playerStatic({
        playFrom: {
          zone: "linked",
          what: "spells",
          filter: { enteredThisTurn: true },
          free: true,
          oncePerTurn: true,
          maxManaValue: amount.count({ controller: "you", anyOf: [{ subtype: "Elf" }, { subtype: "Faerie" }] }),
        },
        label: "Once each turn: cast a spell exiled with Maralen this turn for free (MV ≤ Elves and Faeries)",
      }),
    ],
  },
  "Shadow Urchin": {
    abilities: [
      triggered(when.attacksSelf, [fx.blight(1)], { label: "Blight 1" }),
      triggered(
        when.dies({ types: ["Creature"], controller: "you", withCounter: "any" }),
        [
          fx.exileTop(ref.you, amount.countersOn(ref.eventObject, "any"), "u"),
          fx.grantPlay(ref.stored("u"), { untilYourNextEndStep: true }),
        ],
        { label: "Exile cards equal to the number of counters; playable until your next end step" },
      ),
    ],
  },
  // --- Changelings and keywords only (everything is read from the text) --------
  "Chitinous Graspling": {},
  "Gangly Stompling": {},
  "Mischievous Sneakling": {},
  "Prideful Feastling": {},

  // --- White-black --------------------------------------------------------------
  "Abigale, Eloquent First-Year": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modify(ref.target(), { loseAllAbilities: true }, "permanent"),
          // Keyword counters (122.1b): put after the loss of abilities, they apply.
          fx.counters(ref.target(), "flying"),
          fx.counters(ref.target(), "firstStrike"),
          fx.counters(ref.target(), "lifelink"),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { other: true }))],
          label: "Loses all abilities; flying, first strike and lifelink counters",
        },
      ),
    ],
  },
  "Reaping Willow": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      activated({
        mana: "{1}{W/B}",
        removeCounters: { kind: "any", n: 2 },
        sorcerySpeed: true,
        targets: [
          target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with MV 3 or less"),
        ],
        effects: [fx.toBattlefield(ref.target())],
        label: "Return a creature with MV 3 or less to the battlefield",
      }),
    ],
  },

  // --- White-blue ---------------------------------------------------------------
  "Deepchannel Duelist": {
    abilities: [
      triggered(when.yourEndStep, [fx.untap(ref.target())], {
        targets: [target.creature("t", MERFOLK_YOU)],
        label: "Untap a Merfolk you control",
      }),
      staticAbility(
        { ...MERFOLK_YOU, types: ["Creature"], other: true },
        { power: 1, toughness: 1 },
        {
          label: "Your other Merfolk get +1/+1",
        },
      ),
    ],
  },
  "Deepway Navigator": {
    abilities: [
      triggered(when.entersSelf, [fx.untapAll({ ...MERFOLK_YOU, other: true })], { label: "Untap your other Merfolk" }),
      staticAbility(
        { ...MERFOLK_YOU, types: ["Creature"] },
        { power: 1 },
        {
          condition: cond.amountAtLeast(
            amount.turnEvents({ event: "attack", who: "you", subtype: "Merfolk", distinct: "object" }),
            3,
          ),
          label: "Three or more Merfolk attacked: your Merfolk get +1/+0",
        },
      ),
    ],
  },
  "Eclipsed Merrow": eclipsed("Merfolk", "Plains", "Island", "Reveal a Merfolk, Plains, or Island"),
  "Merrow Skyswimmer": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MERFOLK_WU)], { label: "1/1 Merfolk token" })],
  },
  "Sygg's Command": {
    spell: chooseTwo(
      copyKin("Merfolk", "Copy of a Merfolk you control", "Merfolk you control"),
      mode(
        "A player's creatures gain lifelink",
        [target.player("ll")],
        [fx.modify(creaturesOf(ref.target("ll")), { addKeywords: ["lifelink"] })],
      ),
      mode("A player draws a card", [target.player("dr")], [fx.draw(1, ref.target("dr"))]),
      mode(
        "Tap a creature; stun counter",
        [target.creature("st")],
        [fx.tap(ref.target("st")), fx.counters(ref.target("st"), "stun", 1)],
      ),
    ),
  },

  // --- Blue-black ---------------------------------------------------------------
  "Voracious Tome-Skimmer": {
    abilities: [
      triggered(when.castSpellOffTurn("you"), [fx.mayPayLife(1, "Pay 1 life to draw a card?", fx.draw(1))], {
        label: "Pay 1 life: draw a card",
      }),
    ],
  },

  // --- Blue-red -----------------------------------------------------------------
  "Ashling's Command": {
    spell: chooseTwo(
      copyKin("Elemental", "Copy of an Elemental you control", "Elemental you control"),
      mode("A player draws two cards", [target.player("dr")], [fx.draw(2, ref.target("dr"))]),
      mode("2 damage to each creature of a player", [target.player("dm")], [fx.damage(2, creaturesOf(ref.target("dm")))]),
      mode("A player creates two Treasures", [target.player("tr")], [fx.createTokens(TREASURE, 2, ref.target("tr"))]),
    ),
  },
  "Eclipsed Flamekin": eclipsed("Elemental", "Island", "Mountain", "Reveal an Elemental, Island, or Mountain"),
  "Flaring Cinder": {
    abilities: [when.entersSelf, when.castSpell("you", { minManaValue: 4 })].map((trigger) =>
      triggered(
        trigger,
        fx.may("Discard a card to draw a card?", fx.discard(1, ref.you, { store: "d" }), fx.when(cond.v("d"), fx.draw(1))),
        { label: "Discard a card: draw a card" },
      ),
    ),
  },
  "Twinflame Travelers": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { subtype: "Elemental", controller: "you", other: true } },
        label: "Triggered abilities of your other Elementals trigger an additional time",
      }),
    ],
  },

  // --- Black-red ----------------------------------------------------------------
  "Boggart Cursecrafter": {
    abilities: [
      triggered(when.dies({ subtype: "Goblin", controller: "you", other: true }), [fx.damage(1, ref.eachOpponent)], {
        label: "1 damage to each opponent",
      }),
    ],
  },
  "Chaos Spewer": {
    abilities: [
      triggered(when.entersSelf, [fx.unlessPays(ref.you, { mana: "{2}" }, fx.blight(2))], {
        label: "Pay {2} or blight 2",
      }),
    ],
  },
  "Eclipsed Boggart": eclipsed("Goblin", "Swamp", "Mountain", "Reveal a Goblin, Swamp, or Mountain"),
  "Grub's Command": {
    spell: chooseTwo(
      copyKin("Goblin", "Copy of a Goblin you control", "Goblin you control"),
      mode(
        "A player's creatures get +1/+1 and gain haste",
        [target.player("pu")],
        [fx.pump(creaturesOf(ref.target("pu")), 1, 1, ["haste"])],
      ),
      mode(
        "Destroy an artifact or creature",
        [target.permanent("de", ["Artifact", "Creature"], {}, "artifact or creature")],
        [fx.destroy(ref.target("de"))],
      ),
      mode(
        "A player mills five cards and takes the Goblins",
        [target.player("mi")],
        [fx.mill(5, ref.target("mi"), { name: "g" }), fx.toHand(ref.filtered(ref.stored("g"), { subtype: "Goblin" }))],
      ),
    ),
  },

  // --- Black-green --------------------------------------------------------------
  "Eclipsed Elf": eclipsed("Elf", "Swamp", "Forest", "Reveal an Elf, Swamp, or Forest"),
  "High Perfect Morcant": {
    abilities: [
      triggered(when.enters({ subtype: "Elf", controller: "you" }), [fx.blight(1, ref.eachOpponent)], {
        label: "Each opponent blights 1",
      }),
      activated({
        tapOthers: { filter: { subtype: "Elf" }, count: 3, includeSelf: true },
        sorcerySpeed: true,
        effects: [fx.proliferate()],
        label: "Tap three Elves: proliferate",
      }),
    ],
  },
  "Morcant's Loyalist": {
    abilities: [
      staticAbility(
        { subtype: "Elf", types: ["Creature"], controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Your other Elves get +1/+1",
        },
      ),
      triggered(when.diesSelf, [fx.toHand(ref.target())], {
        targets: [target.cardInGraveyard("t", { subtype: "Elf", other: true }, "you", "other Elf card in your graveyard")],
        label: "Return another Elf from your graveyard to your hand",
      }),
    ],
  },
  "Stoic Grove-Guide": {
    abilities: [
      activated({
        mana: "{1}{B/G}",
        fromGraveyard: true,
        exileSelf: true,
        sorcerySpeed: true,
        effects: [fx.createTokens(ELF_BG)],
        label: "Exile it from your graveyard: 2/2 Elf token",
      }),
    ],
  },
  "Trystan's Command": {
    spell: chooseTwo(
      copyKin("Elf", "Copy of an Elf you control", "Elf you control"),
      mode(
        "One or two permanent cards return to your hand",
        [target.between(1, 2, target.cardInGraveyard("gy", { permanent: true }, "you", "permanent card in your graveyard"))],
        [fx.toHand(ref.target("gy"))],
      ),
      mode(
        "Destroy a creature or enchantment",
        [target.permanent("de", ["Creature", "Enchantment"], {}, "creature or enchantment")],
        [fx.destroy(ref.target("de"))],
      ),
      mode(
        "A player's creatures get +3/+3 and untap",
        [target.player("pu")],
        [fx.pump(creaturesOf(ref.target("pu")), 3, 3), fx.untap(creaturesOf(ref.target("pu")))],
      ),
    ),
  },

  // --- Red-white ----------------------------------------------------------------
  "Bre of Clan Stoutarm": {
    abilities: [
      activated({
        mana: "{1}{W}",
        tap: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.modify(ref.target(), { addKeywords: ["flying", "lifelink"] })],
        label: "Another creature gains flying and lifelink",
      }),
      triggered(
        when.yourEndStep,
        [
          fx.exileUntil({ notTypes: ["Land"] }, "x"),
          // Cast for free if its MV is at most the life gained this turn; otherwise (or if declined), into your hand.
          fx.castNow(ref.stored("x"), { free: true, maxManaValue: amount.lifeGainedThisTurn }),
          fx.toHand(ref.stored("x")),
        ],
        {
          condition: cond.lifeGainedAtLeast(1),
          label: "Exile cards until a nonland card: cast it for free or take it",
        },
      ),
    ],
  },
  Catharsis: {
    // Evoke read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KITHKIN, 2)], {
        condition: cond.spent("W", 2),
        label: "{W}{W} spent: two 1/1 Kithkin tokens",
      }),
      triggered(when.entersSelf, [fx.pumpAll({ types: ["Creature"], controller: "you" }, 1, 1, ["haste"])], {
        condition: cond.spent("R", 2),
        label: "{R}{R} spent: your creatures get +1/+1 and gain haste",
      }),
    ],
  },
  "Feisty Spikeling": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["firstStrike"] },
        { condition: cond.yourTurn, label: "First strike during your turn" },
      ),
    ],
  },
  "Hovel Hurler": {
    abilities: [
      entersWith({ counters: 2, counterKind: "-1/-1", label: "Enters with two -1/-1 counters" }),
      activated({
        mana: "{R/W}{R/W}",
        removeCounters: { kind: "any", n: 1 },
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [fx.pump(ref.target(), 1, 0, ["flying"])],
        label: "Another creature gets +1/+0 and gains flying",
      }),
    ],
  },
  "Kirol, Attentive First-Year": {
    abilities: [
      activated({
        tapOthers: { filter: { types: ["Creature"] }, count: 2, includeSelf: true },
        oncePerTurn: true,
        targets: [
          {
            id: "t",
            label: "triggered ability you control",
            filter: { stackItems: { only: "triggered", controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copy a triggered ability",
      }),
    ],
  },

  // --- Green-white --------------------------------------------------------------
  "Brigid's Command": {
    spell: chooseTwo(
      copyKin("Kithkin", "Copy of a Kithkin you control", "Kithkin you control"),
      mode("A player creates a 1/1 Kithkin token", [target.player("kt")], [fx.createTokens(KITHKIN, 1, ref.target("kt"))]),
      mode("A creature gets +3/+3", [target.creature("pu", { controller: "you" })], [fx.pump(ref.target("pu"), 3, 3)]),
      mode(
        "One of your creatures fights an opposing creature",
        [target.creature("fa", { controller: "you" }), target.creature("fb", { controller: "opponent" })],
        [fx.fight(ref.target("fa"), ref.target("fb"))],
      ),
    ),
  },
  "Eclipsed Kithkin": eclipsed("Kithkin", "Forest", "Plains", "Reveal a Kithkin, Forest, or Plains"),
  "Figure of Fable": {
    abilities: [
      activated({
        mana: "{G/W}",
        effects: [fx.modify(ref.self, { setSubtypes: ["Kithkin", "Scout"], setPower: 2, setToughness: 3 }, "permanent")],
        label: "Becomes a 2/3 Kithkin Scout",
      }),
      activated({
        mana: "{1}{G/W}{G/W}",
        effects: [
          fx.when(
            cond.sourceMatches({ subtype: "Scout" }),
            fx.modify(ref.self, { setSubtypes: ["Kithkin", "Soldier"], setPower: 4, setToughness: 5 }, "permanent"),
          ),
        ],
        label: "Scout: becomes a 4/5 Kithkin Soldier",
      }),
      activated({
        mana: "{3}{G/W}{G/W}{G/W}",
        effects: [
          fx.when(
            cond.sourceMatches({ subtype: "Soldier" }),
            fx.modify(
              ref.self,
              {
                setSubtypes: ["Kithkin", "Avatar"],
                setPower: 7,
                setToughness: 8,
                addProtections: [protection.from({ controller: "opponent" }, "Protection from each of your opponents")],
              },
              "permanent",
            ),
          ),
        ],
        label: "Soldier: becomes a 7/8 Kithkin Avatar with protection from your opponents",
      }),
    ],
  },
  "Thoughtweft Lieutenant": {
    abilities: [
      triggered(when.enters({ subtype: "Kithkin", controller: "you" }), [fx.pump(ref.target(), 1, 1, ["trample"])], {
        targets: [target.creature("t", { controller: "you" })],
        label: "One of your creatures gets +1/+1 and gains trample",
      }),
    ],
  },
  "Wary Farmer": {
    abilities: [
      triggered(when.yourEndStep, [fx.surveil(1)], {
        // "another creature entered the battlefield under your control this turn": not counting the Farmer itself.
        condition: cond.any(
          cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }), 2),
          cond.all(
            cond.amountAtLeast(amount.turnEvents({ event: "zone", to: "battlefield", types: ["Creature"], who: "you" }), 1),
            cond.not(cond.sourceMatches({ enteredThisTurn: true })),
          ),
        ),
        label: "Surveil 1 at your end step",
      }),
    ],
  },

  // --- Green-blue ---------------------------------------------------------------
  "Glister Bairn": {
    abilities: [
      triggered(when.yourCombat, [fx.pump(ref.target(), amount.colorsAmong(), amount.colorsAmong())], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Vivid: +X/+X, where X is the number of colors among your permanents",
      }),
    ],
  },
  "Tam, Mindful First-Year": {
    abilities: [
      ...tamHexproof,
      activated({
        tap: true,
        targets: [target.creature("t", { controller: "you" })],
        effects: [fx.modify(ref.target(), { setColors: ["W", "U", "B", "R", "G"] })],
        label: "One of your creatures becomes all colors",
      }),
    ],
  },
  Wistfulness: {
    // Evoke read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.exile(ref.target())], {
        condition: cond.spent("G", 2),
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { controller: "opponent" },
            "artifact or enchantment an opponent controls",
          ),
        ],
        label: "{G}{G} spent: exile an opposing artifact or enchantment",
      }),
      triggered(when.entersSelf, [fx.draw(2), fx.discard(1)], {
        condition: cond.spent("U", 2),
        label: "{U}{U} spent: draw two cards, then discard a card",
      }),
    ],
  },

  // --- Red-green ----------------------------------------------------------------
  "Noggle Robber": {
    abilities: [when.entersSelf, when.diesSelf].map((trigger) =>
      triggered(trigger, [fx.createTokens(TREASURE)], { label: "Treasure token" }),
    ),
  },
  Vibrance: {
    // Evoke read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        condition: cond.spent("R", 2),
        targets: [target.any()],
        label: "{R}{R} spent: 3 damage to any target",
      }),
      triggered(when.entersSelf, [fx.search({ types: ["Land"] }), fx.gainLife(2)], {
        condition: cond.spent("G", 2),
        label: "{G}{G} spent: search for a land, gain 2 life",
      }),
    ],
  },

  // --- Three colors -------------------------------------------------------------
  "Doran, Besieged by Time": {
    abilities: [
      costReducer(
        { types: ["Creature"], compare: [cmp.toughness(">", "power")] },
        1,
        "Your creature spells with toughness greater than their power cost {1} less",
      ),
      ...[when.attacks({ types: ["Creature"], controller: "you" }), when.blocks({ types: ["Creature"], controller: "you" })].map(
        (trigger) =>
          triggered(trigger, [fx.pump(ref.eventObject, ptGap(ref.eventObject), ptGap(ref.eventObject))], {
            label: "+X/+X, where X is the difference between its power and toughness",
          }),
      ),
    ],
  },
};
