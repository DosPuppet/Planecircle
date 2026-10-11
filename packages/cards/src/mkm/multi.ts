/** Murders at Karlov Manor — multicolored cards. */
import type { ManaRestriction, ObjectFilter, TokenSpec, TriggerSpec } from "@mtgx/engine";
import { BASIC_LAND_TYPES } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  type CardScript,
  cond,
  costReducer,
  DETECTIVE,
  DOG,
  entersWith,
  eventReplacement,
  fx,
  IMP,
  INSTANT_SORCERY,
  investigate,
  loyalty,
  manaAbility,
  modal,
  mode,
  protection,
  protectionAbility,
  ref,
  SPIDER_BG,
  SPIRIT_WB,
  SUSPECTED,
  spell,
  staticAbility,
  THOPTER,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURES_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };

/** Niv-Mizzet, Guildpact: different color pairs among your permanents that are exactly two colors. */
const NIV_X = amount.colorPairsAmong({ permanent: true, controller: "you" });

/** Tin Street Gossip: "spend this mana only to cast face-down spells or to turn creatures face up". */
const FACE_DOWN_MANA: ManaRestriction = { spell: { faceDown: true }, ability: ["turnFaceUp"] };

/** Voja Fenstalker: legendary 5/5 green and white Wolf with trample (Tolsimir, Midnight's Light). */
const VOJA_FENSTALKER: TokenSpec = {
  name: "Voja Fenstalker",
  colors: ["G", "W"],
  types: ["Creature"],
  subtypes: ["Wolf"],
  legendary: true,
  power: 5,
  toughness: 5,
  keywords: ["trample"],
};
const ALL_COLORS = ["W", "U", "B", "R", "G"] as const;

/** Plant: 0/1 green creature (Insidious Roots). */
const PLANT: TokenSpec = { name: "Plant", colors: ["G"], types: ["Creature"], subtypes: ["Plant"], power: 0, toughness: 1 };

/** "Whenever a Clue you control is put into a graveyard from the battlefield" (Teysa). */
const CLUE_TO_GRAVEYARD: TriggerSpec = { on: "leaves", who: { subtype: "Clue", controller: "you" }, to: "graveyard" };

/** "Choose up to one target creature. If that creature is suspected, exile it. Otherwise, suspect it." (Agrus Kos) */
const agrusKos = (trigger: TriggerSpec) =>
  triggered(
    trigger,
    [
      ...fx.when(cond.refMatches(ref.target(), { suspected: true }), fx.exile(ref.target())),
      ...fx.when(cond.refMatches(ref.target(), { suspected: false }), fx.suspect(ref.target())),
    ],
    { targets: [target.upTo(1, target.creature())], label: "Exile the suspected creature, otherwise suspect it" },
  );

/**
 * Ezrim: "{1}, Sacrifice an artifact: Ezrim gains your choice of vigilance, lifelink, or hexproof"; "your choice of" is
 * not a mode: the keyword is chosen during resolution (608.2d), through two questions.
 */
const EZRIM_CHOICE = [
  ...fx.mayForStore(ref.you, "Ezrim gains vigilance?", "v", fx.modify(ref.self, { addKeywords: ["vigilance"] })),
  ...fx.when(
    cond.not(cond.v("v")),
    fx.mayForStore(ref.you, "Ezrim gains lifelink?", "l", fx.modify(ref.self, { addKeywords: ["lifelink"] })),
  ),
  ...fx.when(cond.not(cond.any(cond.v("v"), cond.v("l"))), fx.modify(ref.self, { addKeywords: ["hexproof"] })),
];

/** Trostani: "[cost]: Target creature gains [keyword] until end of turn". */
const trostaniGrant = (mana: string, kw: "deathtouch" | "vigilance" | "doubleStrike", label: string) =>
  activated({
    mana,
    targets: [target.creature()],
    effects: [fx.modify(ref.target(), { addKeywords: [kw] })],
    label,
  });

/** "Target creature gains indestructible until end of turn" (Rakish Scoundrel). */
const indestructibleUntilEot = (trigger: TriggerSpec) =>
  triggered(trigger, [fx.modify(ref.target(), { addKeywords: ["indestructible"] })], {
    targets: [target.creature()],
    label: "Target creature gains indestructible",
  });

/** Gadget Technician: "create a Thopter token" when it enters or is turned face up. */
const thopterOn = (trigger: TriggerSpec) => triggered(trigger, [fx.createTokens(THOPTER)], { label: "Thopter token" });

/** Relive the Past: the target card returns to the battlefield and becomes a 5/5 Elemental creature. */
const reliveAs5_5 = (id: string) => [
  fx.moveTo(ref.target(id), { to: "battlefield" }, { name: id }),
  fx.modify(ref.stored(id), { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 5, setToughness: 5 }, "permanent"),
];

const DESTROY_CREATURE = target.creature("d");
const SUSPECT_YOU = target.creature("s", { controller: "you", suspected: true });
const complicationCounter = [
  fx.addCounters(ref.target("s"), 1),
  ...fx.may("It's no longer suspected?", fx.suspect(ref.target("s"), false)),
];

export const MULTI: Record<string, CardScript> = {
  // --- Azorius (white and blue) ----------------------------------------------
  // Vigilance read from the text.
  "Alquist Proft, Master Sleuth": {
    abilities: [
      triggered(when.entersSelf, [investigate()], { label: "Investigate" }),
      activated({
        mana: "{X}{W}{U}{U}",
        tap: true,
        sacrificeOther: { filter: { subtype: "Clue", controller: "you" } },
        effects: [fx.draw(amount.x), fx.gainLife(amount.x)],
        label: "Draw X cards and gain X life",
      }),
    ],
  },
  // Flying read from the text.
  "Ezrim, Agency Chief": {
    abilities: [
      triggered(when.entersSelf, [investigate(2)], { label: "Investigate twice" }),
      activated({
        mana: "{1}",
        sacrificeOther: { filter: { types: ["Artifact"], controller: "you" } },
        effects: EZRIM_CHOICE,
        label: "Ezrim gains your choice of vigilance, lifelink or hexproof until end of turn",
      }),
    ],
  },
  // Flying, vigilance and disguise read from the text.
  "Granite Witness": {
    abilities: [
      // "You may tap or untap target creature": the target is chosen when it triggers, the action during resolution
      // (608.2d). Tapping an already tapped creature (or the reverse) does nothing: only the useful action is offered.
      triggered(
        when.turnedFaceUp,
        [
          ...fx.when(
            cond.refMatches(ref.target(), { tapped: false }),
            fx.mayForStore(ref.you, "Tap the target creature?", "e", fx.tap(ref.target())),
          ),
          ...fx.when(
            cond.all(cond.not(cond.v("e")), cond.refMatches(ref.target(), { tapped: true })),
            fx.may("Untap the target creature?", fx.untap(ref.target())),
          ),
        ],
        { targets: [target.creature()], label: "Turned face up: tap or untap a creature" },
      ),
    ],
  },
  "Private Eye": {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Detective", controller: "you", other: true },
        { power: 1, toughness: 1 },
        {
          label: "Other Detectives you control get +1/+1",
        },
      ),
      triggered(when.draw(2), [fx.modify(ref.target(), { addKeywords: ["unblockable"] })], {
        targets: [target.creature("t", { subtype: "Detective" })],
        label: "Second card drawn: the target Detective can't be blocked",
      }),
    ],
  },

  // --- Dimir (blue and black) --------------------------------------------------
  "Coerced to Kill": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    controlsEnchanted: true,
    abilities: [
      staticAbility(
        "attached",
        { setPower: 1, setToughness: 1, addKeywords: ["deathtouch"], addSubtypes: ["Assassin"] },
        { label: "Base 1/1, deathtouch, Assassin" },
      ),
    ],
  },
  // Flying read from the text.
  "Curious Cadaver": {
    abilities: [
      triggered(when.sacrifice({ subtype: "Clue" }), [fx.toHand(ref.selfCard)], {
        fromGraveyard: true,
        label: "Clue sacrificed: return this card from your graveyard to your hand",
      }),
    ],
  },
  "Drag the Canal": {
    spell: spell([], [fx.createTokens(DETECTIVE), ...fx.when(cond.morbid, fx.gainLife(2), fx.surveil(2), investigate())]),
  },
  // Flying and disguise read from the text.
  "Faerie Snoop": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.lookAtTop(2, { count: 1, exact: true, rest: "graveyard" })], {
        label: "Turned face up: one of the top two cards into your hand, the other into your graveyard",
      }),
    ],
  },

  // --- Rakdos (black and red) --------------------------------------------------
  "Blood Spatter Analysis": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(3, ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "3 damage to an opponent's creature",
      }),
      triggered(
        when.dies({ types: ["Creature"] }),
        [
          fx.mill(1),
          fx.counters(ref.self, "bloodstain", 1),
          ...fx.when(
            cond.counterAtLeast("bloodstain", 5),
            fx.sacrificeIt(ref.self),
            fx.reflexive(
              [target.cardInGraveyard("g", { types: ["Creature"] }, "you", "creature card in your graveyard")],
              [fx.toHand(ref.target("g"))],
            ),
          ),
        ],
        { batched: true, label: "Mill a card, bloodstain counter; at five, sacrifice it and get back a creature" },
      ),
    ],
  },
  "Deadly Complication": {
    // "Choose one or both."
    spell: modal(
      mode("Destroy a creature", [DESTROY_CREATURE], [fx.destroy(ref.target("d"))]),
      mode("+1/+1 counter on your suspected creature", [SUSPECT_YOU], complicationCounter),
      mode("Both", [DESTROY_CREATURE, SUSPECT_YOU], [fx.destroy(ref.target("d")), ...complicationCounter]),
    ),
  },
  // Flying and trample read from the text.
  "Rakdos, Patron of Chaos": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          // A cost they may pay only in full: offered only if they control two such permanents.
          ...fx.when(
            cond.amountAtLeast(amount.refCount(ref.permanentsOf(ref.target(), { notTypes: ["Land"], token: false })), 2),
            fx.mayFor(
              ref.target(),
              "Sacrifice two nonland, nontoken permanents (otherwise, the opponent draws two cards)?",
              fx.sacrifice(ref.target(), { notTypes: ["Land"], token: false }, 2, { store: "sac" }),
            ),
          ),
          // "If they don't": two permanents were not sacrificed.
          ...fx.when(cond.not(cond.amountAtLeast(amount.refCount(ref.stored("sac")), 2)), fx.draw(2)),
        ],
        {
          targets: [target.player("t", "opponent")],
          label: "The target opponent sacrifices two permanents, otherwise draw two cards",
        },
      ),
    ],
  },
  "Rune-Brand Juggler": {
    abilities: [
      triggered(when.entersSelf, [fx.suspect(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "Suspect a creature you control",
      }),
      activated({
        mana: "{3}{B}{R}",
        // "a suspected creature": the Juggler itself if it is suspected.
        sacrificeOther: { filter: SUSPECTED, includeSelf: true },
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), -5, -5)],
        label: "Target creature gets -5/-5",
      }),
    ],
  },
  // Disguise read from the text.
  "Shady Informant": {
    abilities: [triggered(when.diesSelf, [fx.damage(2, ref.target())], { targets: [target.any()], label: "2 damage" })],
  },

  // --- Gruul (red and green) ---------------------------------------------------
  "Anzrag, the Quake-Mole": {
    abilities: [
      triggered(
        when.becomesBlocked({ self: true }),
        [fx.untap(ref.permanentsOf(ref.you, { types: ["Creature"] })), fx.extraCombat],
        { label: "Blocked: untap your creatures, additional combat" },
      ),
      activated({
        mana: "{3}{R}{R}{G}{G}",
        effects: [fx.modify(ref.self, { addKeywords: ["mustBeBlocked"] })],
        label: "Must be blocked this turn if able",
      }),
    ],
  },
  "Break Out": {
    // The revealed creature card goes straight from the library onto the battlefield (mana value 2 or less, if you want)
    // or into your hand; the rest goes to the bottom in a random order (nothing reads the library in between).
    spell: spell(
      [],
      [
        fx.chooseAmong(ref.filtered(ref.libraryTopCards(ref.you, 6), { types: ["Creature"] }), ref.you, "c", {
          anyZone: true,
          optional: true,
          prompt: "You may reveal a creature card",
        }),
        fx.reveal(ref.stored("c")),
        fx.moveTo(ref.except(ref.libraryTopCards(ref.you, 6), ref.stored("c")), { to: "libraryBottom", shuffle: true }),
        ...fx.when(
          cond.refMatches(ref.stored("c"), { maxManaValue: 2 }),
          fx.may(
            "Put this creature onto the battlefield (with haste)?",
            fx.moveTo(ref.stored("c"), { to: "battlefield" }, { name: "b" }),
            fx.modify(ref.stored("b"), { addKeywords: ["haste"] }),
          ),
        ),
        fx.toHand(ref.filtered(ref.stored("c"), {})),
      ],
    ),
  },
  "Worldsoul's Rage": {
    spell: spell(
      [target.any()],
      [
        fx.damage(amount.x, ref.target()),
        // Up to X land cards in total, chosen among the hand and the graveyard together.
        fx.pickFromZone(
          "hand",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          {
            count: amount.x,
            min: 0,
            pool: ref.union(ref.zone("hand", ref.you), ref.zone("graveyard", ref.you)),
            prompt: "Land cards from your hand and/or graveyard to put onto the battlefield tapped",
          },
        ),
      ],
    ),
  },
  // Reach and disguise read from the text.
  "Riftburst Hellion": {},

  // --- Selesnya (green and white) ----------------------------------------------
  "Crowd-Control Warden": {
    // "As it enters or is turned face up, put X +1/+1 counters on it, where X is the number of other creatures you
    // control": as it enters and as it is turned face up, no ability on the stack.
    faceUpCounters: { kind: "+1/+1", n: amount.count({ ...CREATURES_YOU, other: true }) },
    abilities: [
      entersWith({
        counters: amount.count({ types: ["Creature"], controller: "you", other: true }),
        label: "Enters with a +1/+1 counter for each other creature",
      }),
    ],
  },
  "Relive the Past": {
    spell: spell(
      [
        target.upTo(1, target.cardInGraveyard("a", { types: ["Artifact"] }, "you", "artifact card in your graveyard")),
        target.upTo(1, target.cardInGraveyard("l", { types: ["Land"] }, "you", "land card in your graveyard")),
        target.upTo(
          1,
          target.cardInGraveyard(
            "e",
            { types: ["Enchantment"], notSubtype: "Aura" },
            "you",
            "non-Aura enchantment card in your graveyard",
          ),
        ),
      ],
      [...reliveAs5_5("a"), ...reliveAs5_5("l"), ...reliveAs5_5("e")],
    ),
  },
  // Reach read from the text.
  "Sumala Sentry": {
    abilities: [
      triggered(
        when.permanentTurnedFaceUp({ controller: "you" }),
        [fx.addCounters(ref.eventObject, 1), fx.addCounters(ref.self, 1)],
        { label: "Permanent turned face up: a +1/+1 counter on it and on this creature" },
      ),
    ],
  },
  "Trostani, Three Whispers": {
    abilities: [
      trostaniGrant("{1}{G}", "deathtouch", "Target creature gains deathtouch"),
      trostaniGrant("{G/W}", "vigilance", "Target creature gains vigilance"),
      trostaniGrant("{2}{W}", "doubleStrike", "Target creature gains double strike"),
    ],
  },

  // --- Orzhov (white and black) ------------------------------------------------
  // Flying, lifelink and disguise read from the text.
  "Sanguine Savior": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.modify(ref.target(), { addKeywords: ["lifelink"] })], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Turned face up: another creature you control gains lifelink",
      }),
    ],
  },
  "Soul Search": {
    spell: spell(
      [target.player("t", "opponent")],
      [
        fx.discard(1, ref.target(), { chooser: "controller", filter: { notTypes: ["Land"] }, exile: true, store: "e" }),
        ...fx.when(cond.refMatches(ref.stored("e"), { maxManaValue: 1 }), fx.createTokens(SPIRIT_WB)),
      ],
    ),
  },
  // Deathtouch read from the text.
  "Teysa, Opulent Oligarch": {
    abilities: [
      triggered(when.yourEndStep, [investigate(amount.opponentsLostLife)], {
        label: "Investigate for each opponent who lost life this turn",
      }),
      triggered(CLUE_TO_GRAVEYARD, [fx.createTokens(SPIRIT_WB)], {
        oncePerTurn: true,
        label: "A Clue goes to the graveyard: Spirit token (once per turn)",
      }),
    ],
  },
  // Flying read from the text.
  "Wispdrinker Vampire": {
    abilities: [
      triggered(when.enters({ ...CREATURES_YOU, other: true, maxPower: 2 }), fx.drain(1), {
        label: "Each of your opponents loses 1 life and you gain 1 life",
      }),
      activated({
        mana: "{5}{W}{B}",
        effects: [fx.modifyAll({ ...CREATURES_YOU, maxPower: 2 }, { addKeywords: ["deathtouch", "lifelink"] })],
        label: "Your creatures with power 2 or less gain deathtouch and lifelink",
      }),
    ],
  },

  // --- Izzet (blue and red) ----------------------------------------------------
  "Detective's Satchel": {
    abilities: [
      triggered(when.entersSelf, [investigate(2)], { label: "Investigate twice" }),
      activated({
        tap: true,
        activationCondition: cond.amountAtLeast(amount.turnEvents({ event: "sacrifice", who: "you", types: ["Artifact"] }), 1),
        effects: [fx.createTokens(THOPTER)],
        label: "Thopter token (if you sacrificed an artifact this turn)",
      }),
    ],
  },
  // Disguise read from the text.
  "Gadget Technician": { abilities: [thopterOn(when.entersSelf), thopterOn(when.turnedFaceUp)] },
  // Flying read from the text.
  "Gleaming Geardrake": {
    abilities: [
      triggered(when.entersSelf, [investigate()], { label: "Investigate" }),
      triggered(when.sacrifice({ types: ["Artifact"] }), [fx.addCounters(ref.self, 1)], {
        label: "Artifact sacrificed: +1/+1 counter",
      }),
    ],
  },

  // --- Golgari (black and green) ----------------------------------------------
  "Assassin's Trophy": {
    spell: spell(
      [{ id: "t", label: "permanent an opponent controls", filter: { objects: { controller: "opponent" } } }],
      [fx.destroy(ref.target()), fx.search(BASIC_LAND, { to: "battlefield" }, 1, ref.controllerOf(ref.target()))],
    ),
  },
  "Insidious Roots": {
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, controller: "you" },
        { addAbilities: [manaAbility([...ALL_COLORS])] },
        { label: 'Your creature tokens have "{T}: Add one mana of any color"' },
      ),
      triggered(
        when.zoneChange(["graveyard"], { whose: "you", filter: { types: ["Creature"] } }),
        [fx.createTokens(PLANT), fx.addCountersAll({ subtype: "Plant", controller: "you" }, 1)],
        { batched: true, label: "Plant token, then a +1/+1 counter on each Plant" },
      ),
    ],
  },
  // Reach read from the text.
  "Kraul Whipcracker": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [{ id: "t", label: "token an opponent controls", filter: { objects: { token: true, controller: "opponent" } } }],
        label: "Destroy a token an opponent controls",
      }),
    ],
  },
  // Deathtouch and disguise read from the text.
  "Rakish Scoundrel": { abilities: [indestructibleUntilEot(when.entersSelf), indestructibleUntilEot(when.turnedFaceUp)] },

  // --- Boros (red and white) ---------------------------------------------------
  // Double strike and vigilance read from the text.
  "Agrus Kos, Spirit of Justice": { abilities: [agrusKos(when.entersSelf), agrusKos(when.attacksSelf)] },
  // Vigilance and disguise read from the text.
  "Dog Walker": {
    abilities: [triggered(when.turnedFaceUp, [fx.createTappedTokens(DOG, 2)], { label: "Turned face up: two tapped Dogs" })],
  },
  "Lightning Helix": { spell: spell([target.any()], [fx.damage(3, ref.target()), fx.gainLife(3)]) },
  // Haste read from the text.
  "Meddling Youths": {
    abilities: [triggered(when.attackWith(3), [investigate()], { label: "Attack with three or more creatures: investigate" })],
  },

  // --- Simic (green and blue) --------------------------------------------------
  Doppelgang: {
    spell: spell(
      [{ id: "t", label: "permanent", filter: { objects: { permanent: true } }, count: 99, countX: true }],
      [fx.copyToken(ref.target(), { count: amount.x })],
    ),
  },
  // Flying and vigilance read from the text.
  "Kellan, Inquisitive Prodigy": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          // "If you controlled that permanent": seen before the destruction.
          ...fx.when(cond.refMatches(ref.target(), { controller: "you" }), fx.destroy(ref.target()), fx.draw(1)),
          ...fx.when(cond.refMatches(ref.target(), { controller: "opponent" }), fx.destroy(ref.target())),
        ],
        {
          targets: [target.upTo(1, target.permanent("t", ["Artifact"], {}, "artifact"))],
          label: "Destroy an artifact; if it was yours, draw a card",
        },
      ),
    ],
  },
  "Tail the Suspect": { spell: spell([], [investigate(), fx.extraLandThisTurn]) },
  "Repulsive Mutation": {
    spell: spell(
      [target.creature("c", { controller: "you" }), target.upTo(1, target.spell("s"))],
      [
        fx.addCounters(ref.target("c"), amount.x),
        ...fx.unlessPays(
          ref.controllerOf(ref.target("s")),
          { genericAmount: amount.maxPower(CREATURES_YOU) },
          fx.counter(ref.target("s")),
        ),
      ],
    ),
  },
  // Disguise read from the text.
  "Undercover Crocodelf": {
    abilities: [triggered(when.combatDamageToPlayer, [investigate()], { label: "Combat damage to a player: investigate" })],
  },

  // --- Five colors -------------------------------------------------------------
  "Leyline of the Guildpact": {
    leyline: true,
    abilities: [
      staticAbility(
        { notTypes: ["Land"], controller: "you" },
        { setColors: [...ALL_COLORS] },
        {
          label: "Your nonland permanents are all colors",
        },
      ),
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addSubtypes: [...BASIC_LAND_TYPES] },
        { label: "Your lands have all basic land types" },
      ),
    ],
  },

  // --- Split cards ---------------------------------------------------------------
  Cease: {
    spell: spell(
      [
        { ...target.upTo(2, target.cardInGraveyard("c", {}, "any", "card in a graveyard")), samePlayer: true },
        target.player("p"),
      ],
      [fx.exileCard(ref.target("c")), fx.gainLife(2, ref.target("p")), fx.draw(1, ref.target("p"))],
    ),
  },
  Desist: { spell: spell([], [fx.destroyAll({ types: ["Artifact", "Enchantment"] })]) },
  Fuss: { spell: spell([], [fx.addCountersAll({ ...CREATURES_YOU, attacking: true }, 1)]) },
  Bother: { spell: spell([], [fx.createTokens(THOPTER, 3), fx.surveil(2)]) },
  Push: { spell: spell([target.creature("t", { tapped: true })], [fx.destroy(ref.target())]) },
  Pull: {
    spell: spell(
      [
        {
          ...target.upTo(2, target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card in a graveyard")),
          samePlayer: true,
        },
      ],
      [
        fx.moveTo(ref.target(), { to: "battlefield", underYourControl: true }, { name: "p" }),
        fx.modify(ref.stored("p"), { addKeywords: ["haste"] }),
        fx.delayed([fx.sacrificeIt(ref.target("p"))], { p: ref.stored("p") }),
      ],
    ),
  },
  "Evidence Examiner": {
    abilities: [
      triggered(when.yourCombat, fx.mayCollectEvidence(4, {}), { label: "You may collect evidence 4" }),
      triggered(when.collectEvidence, [investigate()], { label: "You collect evidence: investigate" }),
    ],
  },
  "Izoni, Center of the Web": {
    abilities: [
      ...([when.entersSelf, when.attacksSelf] as const).map((w) =>
        triggered(w, fx.mayCollectEvidence(4, {}, fx.createTokens(SPIDER_BG, 2)), {
          label: "Collect evidence 4: two 2/1 Spiders",
        }),
      ),
      activated({
        sacrificeOther: { filter: { token: true }, count: 4 },
        effects: [fx.surveil(2), fx.draw(2), fx.gainLife(2)],
        label: "Sacrifice four tokens: surveil 2, draw two cards, gain 2 life",
      }),
    ],
  },
  "Yarus, Roar of the Old Gods": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true },
        { addKeywords: ["haste"] },
        {
          label: "Your other creatures have haste",
        },
      ),
      triggered(when.combatDamageBatch({ types: ["Creature"], controller: "you", faceDown: true }), [fx.draw(1)], {
        label: "Your face-down creatures deal combat damage to a player: draw a card",
      }),
      triggered(
        when.dies({ types: ["Creature"], controller: "you", faceDown: true }),
        fx.when(
          cond.refMatches(ref.eventObject, { permanent: true }),
          fx.putFaceDown(ref.eventObject, false, { store: "y", ownerControl: true }),
          fx.turnFaceUp(ref.stored("y")),
        ),
        { label: "A face-down creature dies: it returns face down, then is turned face up" },
      ),
    ],
  },
  "Etrata, Deadly Fugitive": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", faceDown: true },
        {
          addAbilities: [
            activated({
              mana: "{2}{U}{B}",
              effects: [fx.turnFaceUp(ref.self, "e"), fx.castNow(ref.stored("e"), { free: true })],
              label: "Turn it face up (otherwise, exile it and cast it for free)",
            }),
          ],
        },
        { label: 'Your face-down creatures: "{2}{U}{B}: Turn this creature face up"' },
      ),
      triggered(
        when.combatDamage({ subtype: "Assassin", controller: "you" }, true),
        [fx.cloak(ref.libraryTop(ref.eventPlayer))],
        {
          label: "An Assassin deals damage to an opponent: cloak the top card of their library",
        },
      ),
    ],
  },
  "Vannifar, Evolved Enigma": {
    abilities: [
      triggeredModal(
        when.yourCombat,
        [
          mode(
            "Cloak a card from your hand",
            [],
            [fx.pickFromZone("hand", {}, { to: "battlefield", as: "cloak" }, { count: 1, min: 1, prompt: "The card to cloak" })],
          ),
          mode(
            "A +1/+1 counter on each colorless creature you control",
            [],
            [fx.addCountersAll({ types: ["Creature"], controller: "you", colorCount: 0 }, 1)],
          ),
        ],
        { label: "At the beginning of your combat: cloak or counters" },
      ),
    ],
  },
  "Lazav, Wearer of Faces": {
    abilities: [
      triggered(when.attacksSelf, [fx.exileCard(ref.target(), { name: "l" }), fx.link(ref.stored("l")), investigate()], {
        targets: [target.cardInGraveyard("t", {}, "any")],
        label: "Exile a card from a graveyard, then investigate",
      }),
      triggered(
        when.sacrifice({ subtype: "Clue" }),
        fx.may(
          "Should Lazav become a copy of a creature card exiled with it?",
          fx.chooseAmong(ref.filtered(ref.linked, { types: ["Creature"] }), ref.you, "m", { anyZone: true }),
          fx.becomeCopy(ref.self, ref.stored("m"), "endOfTurn"),
        ),
        { label: "You sacrifice a Clue: Lazav may become a copy of a creature exiled with it" },
      ),
    ],
  },
  "Tolsimir, Midnight's Light": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(VOJA_FENSTALKER)], { label: "Voja Fenstalker, legendary 5/5 Wolf" }),
      triggered(
        when.attacks({ subtype: "Wolf", controller: "you" }),
        [
          fx.modify(
            ref.target(),
            { addBlockRules: [{ mustBlockAttacker: "eventObject", label: "Blocks this Wolf if able" }] },
            "endOfTurn",
          ),
        ],
        {
          condition: cond.sourceMatches({ attacking: true }),
          targets: [target.creature("t", { controller: "opponent" })],
          label: "Tolsimir attacks: an opponent's creature blocks this Wolf if able",
        },
      ),
    ],
  },
  Hustle: {
    spell: spell(
      [target.creature()],
      [
        fx.modify(
          ref.target(),
          { addKeywords: ["mustAttack"], addBlockRules: [{ mustBlock: true, label: "Blocks if able" }] },
          "endOfTurn",
        ),
      ],
    ),
  },
  Bustle: {
    spell: spell(
      [],
      [
        fx.pumpAll(CREATURES_YOU, 2, 2, ["trample"]),
        ...fx.may(
          "Turn a creature you control face up?",
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], faceDown: true }), ref.you, "f"),
          fx.turnFaceUp(ref.stored("f")),
        ),
      ],
    ),
  },
  // "You may discard two cards": two or none (impossible with fewer than two cards in hand). "When you do": reflexive
  // ability, X read from the discarded cards.
  "Ill-Timed Explosion": {
    spell: spell(
      [],
      [
        fx.draw(2),
        ...fx.when(
          cond.amountAtLeast(amount.cardsIn("hand"), 2),
          fx.may(
            "Discard two cards?",
            fx.discard(2, ref.you, { store: "d" }),
            // X is locked in when the cards are discarded (they can leave the graveyard before resolution).
            fx.reflexive([], [fx.damageAll(amount.v("x"), { types: ["Creature"] })], undefined, undefined, {
              x: amount.greatestManaValueOf(ref.stored("d")),
            }),
          ),
        ),
      ],
    ),
  },
  "Officious Interrogation": {
    costPerExtraTarget: "{W}{U}",
    spell: spell(
      [{ ...target.player("p"), label: "player", count: 8, optional: true }],
      [investigate(amount.refCount(ref.permanentsOf(ref.target("p"), { types: ["Creature"] })))],
    ),
  },
  "Treacherous Greed": {
    additionalCost: { sacrifice: { filter: { types: ["Creature"], dealtDamageThisTurn: true }, count: 1 } },
    spell: spell([], [fx.draw(3), fx.loseLife(3, ref.eachOpponent), fx.gainLife(3)]),
  },
  "Urgent Necropsy": {
    additionalCost: { collectEvidenceTargetsManaValue: true },
    spell: spell(
      [
        target.upTo(1, target.permanent("a", ["Artifact"], {}, "artifact")),
        target.upTo(1, target.creature("c")),
        target.upTo(1, target.permanent("e", ["Enchantment"], {}, "enchantment")),
        target.upTo(1, target.permanent("w", ["Planeswalker"], {}, "planeswalker")),
      ],
      [fx.destroy(ref.target("a")), fx.destroy(ref.target("c")), fx.destroy(ref.target("e")), fx.destroy(ref.target("w"))],
    ),
  },
  "Niv-Mizzet, Guildpact": {
    abilities: [
      protectionAbility(protection.hexproofFrom({ multicolored: true }, "Hexproof from multicolored")),
      triggered(
        when.combatDamageToPlayer,
        [fx.damage(NIV_X, ref.target("a")), fx.draw(NIV_X, ref.target("p")), fx.gainLife(NIV_X)],
        {
          targets: [target.any("a"), target.player("p")],
          label: "X damage, X cards, X life (X: color pairs among your two-color permanents)",
        },
      ),
    ],
  },
  "Aurelia, the Law Above": {
    abilities: [
      triggered(when.attackWith(3, undefined, true), [fx.draw(1)], {
        label: "A player attacks with three or more creatures: draw a card",
      }),
      triggered(when.attackWith(5, undefined, true), [fx.damage(3, ref.eachOpponent), fx.gainLife(3)], {
        label: "A player attacks with five or more creatures: 3 damage to each opponent, gain 3 life",
      }),
    ],
  },
  "Tin Street Gossip": {
    abilities: [
      // Restricted {R}{G}: a mana ability (605.1a, no stack) that adds both mana.
      activated({
        tap: true,
        effects: [fx.addManaChoice(1, ["R"], FACE_DOWN_MANA), fx.addManaChoice(1, ["G"], FACE_DOWN_MANA)],
        label: "Add {R}{G} (face-down spells, turning face up)",
      }),
    ],
  },
  "Kylox's Voltstrider": {
    // Crew 2: read from the text.
    abilities: [
      activated({
        collectEvidence: 6,
        linkEvidence: true,
        effects: [fx.modify(ref.self, { addTypes: ["Artifact", "Creature"] }, "endOfTurn")],
        label: "Collect evidence 6: becomes an artifact creature until end of turn",
      }),
      triggered(when.attacksSelf, [fx.castNow(ref.filtered(ref.linked, INSTANT_SORCERY), { after: "bottom" })], {
        label: "You may cast an instant or sorcery among the cards exiled with it",
      }),
    ],
  },
  "Judith, Carnage Connoisseur": {
    abilities: [
      triggeredModal(
        when.castSpell("you", INSTANT_SORCERY),
        [
          mode(
            "The spell gains deathtouch and lifelink",
            [],
            [fx.modify(ref.eventObject, { addKeywords: ["deathtouch", "lifelink"] })],
          ),
          mode("A 2/2 Imp", [], [fx.createTokens(IMP)]),
        ],
        { label: "Instant or sorcery: deathtouch and lifelink, or an Imp" },
      ),
    ],
  },
  "Kaya, Spirits' Justice": {
    abilities: [
      // "One or more creatures you control and/or creature cards in your graveyard": one trigger per batch; you may choose
      // a creature card among them.
      triggered(
        when.zoneChange(["battlefield", "graveyard"], { to: ["exile"], filter: { types: ["Creature"], controller: "you" } }),
        [
          fx.chooseAmong(ref.filtered(ref.eventObjects, { types: ["Creature"], token: false }), ref.you, "c", {
            anyZone: true,
            optional: true,
            prompt: "You may choose an exiled creature card: a token becomes a copy of it, with flying",
          }),
          fx.becomeCopy(ref.target(), ref.stored("c"), "endOfTurn", { addKeywords: ["flying"] }),
        ],
        {
          batched: true,
          targets: [{ id: "t", label: "token you control", filter: { objects: { token: true, controller: "you" } } }],
          label: "Creatures exiled: a token becomes a copy of one of them, with flying",
        },
      ),
      loyalty(2, {
        effects: [
          fx.surveil(2),
          fx.chooseAmong(ref.allGraveyards, ref.you, "k", { anyZone: true }),
          fx.exileCard(ref.stored("k")),
        ],
        label: "Surveil 2, then exile a card from a graveyard",
      }),
      loyalty(1, { effects: [fx.createTokens(SPIRIT_WB)], label: "A 1/1 flying Spirit" }),
      loyalty(-2, {
        // "For each other player, up to one target creature that player controls": at most one per opponent.
        targets: [
          target.creature("a", { controller: "you" }),
          { ...target.upTo(5, target.creature("b", { controller: "opponent" })), differentPlayers: true },
        ],
        effects: [fx.exile(ref.target("a")), fx.exile(ref.target("b"))],
        label: "Exile a creature of yours and up to one creature of each opponent",
      }),
    ],
  },
  "Kylox, Visionary Inventor": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true }), ref.you, "k", { anyNumber: true }),
          fx.exileTop(ref.you, amount.totalPowerOf(ref.stored("k")), "e"),
          fx.sacrificeIt(ref.stored("k")),
          fx.castNow(ref.filtered(ref.stored("e"), INSTANT_SORCERY), { free: true, many: true }),
        ],
        { label: "Sacrifice creatures, exile X cards, cast the instants and sorceries among them for free" },
      ),
    ],
  },
  Flotsam: { spell: spell([], [fx.mill(3), investigate()]) },
  Jetsam: {
    spell: spell(
      [],
      [
        fx.mill(3, ref.eachOpponent),
        // "A spell from each opponent's graveyard": one per graveyard.
        ...fx.forEachPlayer(ref.eachOpponent, (p) => [
          fx.castNow(ref.filtered(ref.graveyardOf(p), { notTypes: ["Land"] }), { free: true, after: "exile" }),
        ]),
      ],
    ),
  },
  "Buried in the Garden": {
    enchant: { filter: { types: ["Land"] }, label: "land" },
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.nonland("t", { controller: "opponent" }, "nonland permanent you don't control")],
        label: "Exile a nonland permanent an opponent controls until this Aura leaves",
      }),
      eventReplacement({
        event: "mana",
        source: { attached: "host" },
        extraMana: "any",
        modify: { add: 1 },
        label: "Enchanted land tapped for mana: one more mana",
      }),
    ],
  },
  // --- Standard-legal MKM promos (imported in lot C19 of PLAN-C) ------------------------------------------------
  "Melek, Reforged Researcher": {
    // P/T: twice the number of instant and sorcery cards in your graveyard.
    cdaPT: amount.plus(amount.countIn("graveyard", INSTANT_SORCERY), amount.countIn("graveyard", INSTANT_SORCERY)),
    abilities: [
      costReducer(INSTANT_SORCERY, 3, "The first instant or sorcery each turn costs {3} less", {
        condition: cond.not(cond.amountAtLeast(amount.instantSorceryCast, 1)),
      }),
    ],
  },
  "Tomik, Wielder of Law": {
    // Affinity for planeswalkers: {1} less for each planeswalker you control. Flying, vigilance: read from the text.
    costReduction: { generic: amount.count({ types: ["Planeswalker"], controller: "you" }) },
    abilities: [
      triggered(when.opponentAttacksYouWith(2, true), [fx.loseLife(3, ref.eventPlayer), fx.draw(1)], {
        label: "The opponent loses 3 life, you draw",
      }),
    ],
  },
  "Voja, Jaws of the Conclave": {
    // Vigilance, trample, ward {3}: read from the text.
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.addCountersAll(CREATURES_YOU, amount.count({ subtype: "Elf", controller: "you" }), "+1/+1"),
          fx.draw(amount.count({ subtype: "Wolf", controller: "you" })),
        ],
        { label: "Counters for each Elf; a card for each Wolf" },
      ),
    ],
  },
};
