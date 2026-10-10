/**
 * Commander: "Deadpool, Commander Deck" (Deadpool, Trading Card; Rakdos; ReallyBadWizard's list). Exchanged text boxes,
 * token copies (myriad, Orthion, Jaxis, Delina, Saw in Half, The Master, Multiplied), creatures given to the opponents
 * (Xantcha, Humble Defector, Oft-Nabbed Goat, Alexios, Vislor Turlough, Slicer) and chaos (Possibility Storm, Share the
 * Spoils, Mob Verdict, Prisoner's Dilemma).
 */
import type { Amount, CardScript, Condition, Effect, Ref } from "@mtgx/engine";
import {
  activated,
  amount,
  blockAbility,
  cond,
  entersWith,
  fx,
  manaAbility,
  myriadAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** `fx.forEachPlayer` goes through six seats: this one is a player in the game. */
const seated = (p: Ref) => cond.amountAtLeast(amount.refCount(p), 1);
/** The n-th opponent (`fx.forEachPlayer` order). */
const nthOpponent = (n: number): Ref => ({ kind: "nth", of: ref.eachOpponent, n });
const SEATS = [0, 1, 2, 3, 4, 5];
/** Total mana value of the designated cards. */
const totalManaValueOf = (r: Ref): Amount => ({ kind: "aggregate", fn: "sum", property: "manaValue", of: r });
/** Half, rounded up. */
const halfUp = (a: Amount): Amount => amount.per(amount.plus(a, 1), 2);
const YOUR_CREATURES = { types: ["Creature" as const], controller: "you" as const };
/** "Another target creature you control". */
const ANOTHER_YOURS = () => target.creature("t", { controller: "you", other: true });
/** Odor counter (Olinda): "At the beginning of your upkeep, you lose 2 life". */
const ODOR_UPKEEP = triggered(when.yourUpkeep, [fx.loseLife(2)], {
  label: "Odor: at the beginning of your upkeep, you lose 2 life",
});
/** Exile the top card of each library, linked to the source (Share the Spoils). */
const SPOILS_EXILE: Effect[] = [fx.exileTop(ref.eachPlayer, 1, "spoils"), fx.link(ref.stored("spoils"))];

/**
 * Delina, Wild Mage: a token copy of the target (not legendary, tapped and attacking, exiled at end of combat); on
 * 15 to 20, "you may roll again" (unrolled ten times at most).
 */
const delinaRoll = (depth: number): Effect[] => [
  fx.rollDie(20, `delina${depth}`),
  fx.copyToken(ref.target(), { nonlegendary: true, tapped: true, attacking: true, atEndOfCombat: "exile" }),
  ...(depth < 9
    ? fx.when(cond.amountAtLeast(amount.v(`delina${depth}`), 15), fx.may("Roll the d20 again?", ...delinaRoll(depth + 1)))
    : []),
];

/** Prisoner's Dilemma: the choice of the n-th opponent (1: silence, 2: snitch). */
const silence = (n: number): Condition => cond.all(cond.v(`pd${n}`, 1), cond.not(cond.v(`pd${n}`, 2)));
const snitch = (n: number): Condition => cond.v(`pd${n}`, 2);
/** Every opponent still in the game made this choice. */
const everyOpponent = (c: (n: number) => Condition): Condition =>
  cond.all(...SEATS.map((n) => cond.any(cond.not(seated(nthOpponent(n))), c(n))));

const prisonersDilemma: Effect[] = [
  ...fx.forEachPlayer(ref.eachOpponent, (p, n) =>
    fx.when(
      seated(p),
      fx.yourChoice(
        "Silence or snitch?",
        `pd${n}`,
        [
          { label: "Silence", effects: [] },
          { label: "Snitch", effects: [] },
        ],
        p,
      ),
    ),
  ),
  ...fx.when(everyOpponent(silence), fx.damage(4, ref.eachOpponent)),
  ...fx.when(everyOpponent(snitch), fx.damage(8, ref.eachOpponent)),
  ...fx.when(
    cond.not(cond.any(everyOpponent(silence), everyOpponent(snitch))),
    ...SEATS.map((n) => fx.when(cond.all(seated(nthOpponent(n)), silence(n)), fx.damage(12, nthOpponent(n)))),
  ),
];

export const EDH_DEADPOOL: Record<string, CardScript> = {
  // --- Commander ------------------------------------------------------------------------------------------------------
  // The exchange (612, layer 3): each takes the other's text box as it is (abilities, keywords), for as long as it stays
  // on the battlefield; a copy of either has its printed text (707.2). Chosen as it enters: an "enters" ability of the
  // text it takes triggers.
  "Deadpool, Trading Card": {
    asEnters: [fx.exchangeTextBox],
    abilities: [
      triggered(when.yourUpkeep, [fx.loseLife(3)], { label: "At the beginning of your upkeep, you lose 3 life" }),
      activated({
        mana: "{3}",
        sacrifice: true,
        effects: [fx.draw(1, ref.eachOpponent)],
        label: "Each other player draws a card",
      }),
    ],
  },

  // --- Creatures ------------------------------------------------------------------------------------------------------
  // Trample: read from the text.
  "Alexios, Deimos of Kosmos": {
    keywords: ["mustAttack", "cantBeSacrificed"],
    abilities: [
      blockAbility({ cantAttackPlayer: "owner", label: "Can't attack its owner" }),
      triggered(
        { on: "step", step: "upkeep", whose: "any" },
        [
          fx.giveControl(ref.self, ref.eventPlayer),
          fx.untap(ref.self),
          fx.counters(ref.self, "+1/+1"),
          fx.pump(ref.self, 0, 0, ["haste"]),
        ],
        { label: "Each upkeep: that player gains control of it, untaps it, puts a +1/+1 counter on it; haste" },
      ),
    ],
  },
  // Menace, myriad: read from the text.
  "Dalek Squadron": {},
  "Delina, Wild Mage": {
    abilities: [
      triggered(when.attacksSelf, delinaRoll(0), {
        targets: [target.creature("t", { controller: "you" })],
        label: "Roll a d20: a token copy of target creature you control, tapped and attacking (again on 15+)",
      }),
    ],
  },
  // Trample, myriad: read from the text. Approximation: X counts the lands of all opponents (the defending player's
  // in a duel).
  "Elturel Survivors": {
    abilities: [
      staticAbility(
        "self",
        { power: 1 },
        {
          condition: cond.sourceMatches({ attacking: true }),
          perAmount: amount.count({ types: ["Land"], controller: "opponent" }),
          label: "While attacking: +X/+0, X being the lands of the defending player",
        },
      ),
    ],
  },
  "Gogo, Mysterious Mime": {
    abilities: [
      triggered(
        when.yourCombat,
        fx.when(
          cond.targetChosen("t"),
          fx.becomeCopy(ref.self, ref.target(), "endOfTurn", { except: { setName: "Gogo, Mysterious Mime" } }),
          fx.pump(ref.self, 2, 0, ["haste", "mustAttack"]),
          fx.pump(ref.target(), 2, 0, ["haste", "mustAttack"]),
        ),
        {
          targets: [target.optional(ANOTHER_YOURS())],
          label: "Gogo may become a copy of another creature until end of turn; both get +2/+0, haste, and attack",
        },
      ),
    ],
  },
  "Humble Defector": {
    abilities: [
      activated({
        tap: true,
        activationCondition: cond.yourTurn,
        targets: [target.player("p", "opponent")],
        effects: [fx.draw(2), fx.giveControl(ref.self, ref.target("p"))],
        label: "Draw two cards; target opponent gains control of it (only during your turn)",
      }),
    ],
  },
  // Blitz {1}{R}: read from the text.
  "Jaxis, the Troublemaker": {
    abilities: [
      activated({
        mana: "{R}",
        tap: true,
        discard: 1,
        sorcerySpeed: true,
        targets: [ANOTHER_YOURS()],
        effects: [
          fx.copyToken(ref.target(), {
            addKeywords: ["haste"],
            addAbilities: [triggered(when.diesSelf, [fx.draw(1)], { label: "When this token dies, draw a card" })],
            sacrificeAtEndStep: true,
          }),
        ],
        label: "A token copy of another creature you control, with haste (sacrificed at the end step)",
      }),
    ],
  },
  "Karn, Silver Golem": {
    abilities: [
      triggered(when.blocks("self"), [fx.pump(ref.self, -4, 4)], { label: "Blocks: -4/+4" }),
      triggered(when.becomesBlocked({ self: true }), [fx.pump(ref.self, -4, 4)], { label: "Becomes blocked: -4/+4" }),
      activated({
        mana: "{1}",
        targets: [target.permanent("t", ["Artifact"], { notTypes: ["Creature"] }, "noncreature artifact")],
        effects: [fx.modify(ref.target(), { addTypes: ["Creature"] }, "endOfTurn", amount.manaValueOf(ref.target()))],
        label: "Target noncreature artifact becomes an artifact creature (P/T: its mana value) until end of turn",
      }),
    ],
  },
  // First strike, trample, haste: read from the text.
  "Life of the Party": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.self, amount.count(YOUR_CREATURES), 0)], {
        label: "Attacks: +X/+0, X being the creatures you control",
      }),
      triggered(
        when.entersSelf,
        [fx.copyToken(ref.self, { for: ref.eachOpponent, store: "party" }), fx.goad(ref.stored("party"), "permanent")],
        {
          condition: cond.sourceMatches({ token: false }),
          label: "If it isn't a token: each opponent creates a token copy of it, goaded for the rest of the game",
        },
      ),
    ],
  },
  "Oft-Nabbed Goat": {
    abilities: [
      activated({
        mana: "{1}",
        sorcerySpeed: true,
        activators: "opponents",
        effects: [fx.draw(1), fx.giveControl(ref.self, ref.you), fx.counters(ref.self, "-1/-1")],
        label: "Draw a card, gain control of it and put a -1/-1 counter on it (only its controller's opponents)",
      }),
      triggered(
        when.diesSelf,
        [
          fx.draw(amount.lkiCounters("-1/-1"), ref.ownerOf(ref.eventObject)),
          fx.loseLife(amount.lkiCounters("-1/-1"), ref.except(ref.eachPlayer, ref.ownerOf(ref.eventObject))),
        ],
        {
          condition: cond.amountAtLeast(amount.lkiCounters("-1/-1"), 1),
          label: "It dies with -1/-1 counters: its owner draws that many, each other player loses that much life",
        },
      ),
    ],
  },
  "Olinda the Oblivious": {
    abilities: [
      ...[when.entersSelf, when.attacksSelf].map((t) =>
        triggered(
          t,
          [fx.counters(ref.target(), "odor"), fx.modifyWhileCounter(ref.target(), { addAbilities: [ODOR_UPKEEP] }, "odor")],
          {
            targets: [
              {
                ...target.upTo(1, target.creature("t", { controller: "opponent", not: { withCounter: "odor" } })),
                differentPlayers: true,
                countAmount: amount.refCount(ref.eachOpponent),
                label: "up to one creature without an odor counter per opponent",
              },
            ],
            label: 'An odor counter on up to one creature of each opponent ("you lose 2 life" at their upkeep)',
          },
        ),
      ),
    ],
  },
  // Flash: read from the text. The opponents' searches: `searchControl` (the cards found, exiled with it, playable with
  // any mana).
  "Opposition Agent": {
    abilities: [
      playerStatic({ searchControl: true, affects: "opponents", label: "You control your opponents while they search" }),
      playerStatic({
        playFrom: { zone: "linked", anyMana: true },
        label: "You may play the cards exiled with it, spending mana as though it were mana of any color",
      }),
    ],
  },
  "Orthion, Hero of Lavabrink": {
    abilities: [
      activated({
        mana: "{1}{R}",
        tap: true,
        sorcerySpeed: true,
        targets: [ANOTHER_YOURS()],
        effects: [fx.copyToken(ref.target(), { addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "A token copy of another creature you control, with haste (sacrificed at the end step)",
      }),
      activated({
        mana: "{6}{R}{R}{R}",
        tap: true,
        sorcerySpeed: true,
        targets: [ANOTHER_YOURS()],
        effects: [fx.copyToken(ref.target(), { count: 5, addKeywords: ["haste"], sacrificeAtEndStep: true })],
        label: "Five token copies of another creature you control, with haste (sacrificed at the end step)",
      }),
    ],
  },
  // Prowess: read from the text.
  "Pinnacle Monk": {
    abilities: [
      triggered(when.entersSelf, [fx.toHand(ref.target())], {
        targets: [
          target.cardInGraveyard(
            "t",
            { anyOf: [{ types: ["Instant"] }, { types: ["Sorcery"] }] },
            "you",
            "instant or sorcery card",
          ),
        ],
        label: "Return target instant or sorcery card from your graveyard to your hand",
      }),
    ],
  },
  "Mystic Peak": { abilities: [manaAbility("R")] },
  // Double strike, haste; "More Than Meets the Eye" not handled (approximation: only cast for its mana cost).
  "Slicer, Hired Muscle": {
    abilities: [
      triggered(
        { on: "step", step: "upkeep", whose: "opponent" },
        fx.yourChoice("Let that player gain control of Slicer until end of turn?", "slicer", [
          {
            label: "Yes: that player gains control of it (untapped, goaded, can't be sacrificed)",
            effects: [
              { op: "gainControl", what: ref.self, to: ref.eventPlayer, duration: "endOfTurn" } as Effect,
              fx.untap(ref.self),
              fx.goad(ref.self),
              fx.pump(ref.self, 0, 0, ["cantBeSacrificed"]),
            ],
          },
          { label: "No: convert it", effects: [fx.transform()] },
        ]),
        { label: "Each opponent's upkeep: they may control it this turn (goaded); otherwise, convert it" },
      ),
    ],
  },
  // First strike, haste: read from the text.
  "Slicer, High-Speed Antagonist": {
    abilities: [
      staticAbility("self", { addTypes: ["Creature"] }, { condition: cond.yourTurn, label: "Living metal" }),
      triggered(when.combatDamageToPlayer, [fx.delayedAt("endOfCombat", [fx.transform()])], {
        label: "Combat damage to a player: convert it at end of combat",
      }),
    ],
  },
  // Myriad: read from the text.
  "The Master, Multiplied": {
    abilities: [
      playerStatic({
        noLegendRule: { types: ["Creature"], token: true },
        label: "The legend rule doesn't apply to creature tokens you control",
      }),
      playerStatic({
        tokenShield: true,
        label: "Your triggered abilities can't make you sacrifice or exile your creature tokens",
      }),
    ],
  },
  // Doctor's companion: read from the text. Approximation: goaded for the rest of the game (not only while the
  // opponent controls it).
  "Vislor Turlough": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.may(
          "Have an opponent gain control of it (goaded)?",
          fx.chooseOpponent("vislor"),
          fx.giveControl(ref.self, ref.stored("vislor")),
          fx.goad(ref.self, "permanent"),
        ),
        { label: "You may have an opponent gain control of it; it's goaded" },
      ),
      triggered(when.yourEndStep, [fx.draw(1), fx.loseLife(amount.cardsIn("hand"))], {
        label: "Draw a card, then lose life equal to the cards in your hand",
      }),
    ],
  },
  "Xantcha, Sleeper Agent": {
    keywords: ["mustAttack"],
    asEnters: [fx.chooseForSelf("player", { optionsFrom: ref.eachOpponent, control: true })],
    abilities: [
      blockAbility({ cantAttackPlayer: "owner", label: "Can't attack its owner or planeswalkers its owner controls" }),
      activated({
        mana: "{3}",
        activators: "any",
        effects: [fx.loseLife(2, ref.controllerOf(ref.self)), fx.draw(1)],
        label: "Xantcha's controller loses 2 life and you draw a card (any player may activate)",
      }),
    ],
  },
  "Xenic Poltergeist": {
    abilities: [
      activated({
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { notTypes: ["Creature"] }, "noncreature artifact")],
        effects: [fx.modify(ref.target(), { addTypes: ["Creature"] }, "untilYourNextTurn", amount.manaValueOf(ref.target()))],
        label: "Until your next upkeep, target noncreature artifact becomes an artifact creature (P/T: its mana value)",
      }),
    ],
  },

  // --- Artifacts and enchantments -------------------------------------------------------------------------------------
  // Equip {4}: read from the text.
  "Blade of Selves": {
    abilities: [staticAbility("attached", { addAbilities: [myriadAbility()] }, { label: "Equipped creature has myriad" })],
  },
  // Flash, replicate {2}: read from the text.
  "Changing Loyalty": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(when.dies({ attached: "host" }), [fx.toBattlefield(ref.eventObject, { underYourControl: true })], {
        label: "Enchanted creature dies: return it to the battlefield under your control",
      }),
    ],
  },
  "Conjurer's Closet": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.moveTo(ref.target(), { to: "exile" }, { name: "closet" }),
          fx.toBattlefield(ref.stored("closet"), { underYourControl: true }),
        ],
        {
          targets: [target.optional(target.creature("t", { controller: "you" }))],
          label: "You may exile a creature you control, then return it",
        },
      ),
    ],
  },
  // Approximation: once per attack (not for each player attacked); the copy attacks the player its controller chooses.
  "Echoing Assault": {
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, controller: "you" },
        { addKeywords: ["menace"] },
        {
          label: "Creature tokens you control have menace",
        },
      ),
      triggered(
        when.attackWith(1),
        [fx.copyToken(ref.target(), { pt: 1, tapped: true, attacking: true, sacrificeAtEndStep: true })],
        {
          targets: [target.creature("t", { controller: "you", token: false, attacking: true })],
          label: "A 1/1 token copy of target nontoken attacking creature, tapped and attacking (sacrificed at the end step)",
        },
      ),
    ],
  },
  // Crew 1: read from the text.
  "Golden Argosy": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.moveTo(ref.crewedBy, { to: "exile" }, { name: "argosy" }),
          fx.delayed([fx.toBattlefield(ref.target("a"), { tapped: true })], { a: ref.stored("argosy") }),
        ],
        { label: "Exile the creatures that crewed it; they return tapped at the next end step" },
      ),
    ],
  },
  "Mirror Box": {
    abilities: [
      playerStatic({ noLegendRule: true, label: "The legend rule doesn't apply to permanents you control" }),
      staticAbility(
        { ...YOUR_CREATURES, legendary: true },
        { power: 1, toughness: 1 },
        {
          label: "Each legendary creature you control gets +1/+1",
        },
      ),
      staticAbility(
        { ...YOUR_CREATURES, token: false },
        { power: 1, toughness: 1, perAffected: { what: "sameName" } },
        {
          label: "Each nontoken creature you control: +1/+1 for each other creature you control with the same name",
        },
      ),
    ],
  },
  "Possibility Storm": {
    abilities: [
      triggered(
        { on: "castSpell", by: "any", fromHand: true },
        [
          // The spell is exiled first (its types read on the stack), then goes to the bottom with the other exiled cards.
          {
            op: "discover",
            n: Number.MAX_SAFE_INTEGER,
            who: ref.eventPlayer,
            cascade: true,
            filter: { shares: { what: "cardType", with: ref.eventObject } },
            exileFirst: ref.eventObject,
          } as Effect,
        ],
        { label: "A spell cast from a hand is exiled; its caster may cast a card sharing a type with it, for free" },
      ),
    ],
  },
  "Share the Spoils": {
    abilities: [
      triggered(when.entersSelf, SPOILS_EXILE, { label: "Exile the top card of each library" }),
      triggered(when.opponentLoses, SPOILS_EXILE, { label: "An opponent loses: exile the top card of each library" }),
      playerStatic({
        playFrom: { zone: "linked", anyMana: true },
        affects: "each",
        label: "Each player may play the cards exiled with it, spending mana as though it were mana of any color",
      }),
      triggered(
        when.zoneChange(["exile"], { linked: true }),
        [fx.exileTop(ref.eventPlayer, 1, "more"), fx.link(ref.stored("more"))],
        {
          label: "When a player plays one of them, exile the top card of their library",
        },
      ),
    ],
  },
  "Warstorm Surge": {
    abilities: [
      triggered(when.enters(YOUR_CREATURES), [fx.damage(amount.powerOf(ref.eventObject), ref.target(), ref.eventObject)], {
        targets: [target.any()],
        label: "A creature you control enters: it deals damage equal to its power to any target",
      }),
    ],
  },

  // --- Spells ---------------------------------------------------------------------------------------------------------
  "Disrupt Decorum": {
    spell: spell([], [fx.goad(ref.permanentsOf(ref.eachOpponent, { types: ["Creature"] }))]),
  },
  "Ensnared by the Mara": {
    spell: spell(
      [],
      fx.forEachPlayer(ref.eachOpponent, (p, n) =>
        fx.when(
          seated(p),
          fx.yourChoice(
            "Villainous choice",
            `mara${n}`,
            [
              {
                label: "Exile cards until a nonland card, which the caster may cast for free",
                effects: [
                  { op: "exileUntil", filter: { notTypes: ["Land"] }, store: `maraHit${n}`, who: p } as Effect,
                  fx.castNow(ref.stored(`maraHit${n}`), { free: true }),
                ],
              },
              {
                label: "Exile the top four cards; damage equal to their total mana value",
                effects: [fx.exileTop(p, 4, `maraTop${n}`), fx.damage(totalManaValueOf(ref.stored(`maraTop${n}`)), p)],
              },
            ],
            p,
          ),
        ),
      ),
    ),
  },
  "Hagra Mauling": {
    costReduction: {
      generic: 1,
      condition: cond.amountAtLeast(
        amount.refCount(ref.playersWhere(ref.eachOpponent, cond.not(cond.controls({ types: ["Land"], basic: true })))),
        1,
      ),
    },
    spell: spell([target.creature()], [fx.destroy(ref.target())]),
  },
  "Hagra Broodpit": { abilities: [entersWith({ tapped: true }), manaAbility("B")] },
  "Mana Geyser": {
    spell: spell(
      [],
      [{ op: "addMana", mana: ["R"], times: amount.count({ types: ["Land"], controller: "opponent", tapped: true }) }],
    ),
  },
  // Secret council (approximation): the votes are cast one after the other, in turn order, each seen by the next.
  "Mob Verdict": {
    spell: spell(
      [],
      [
        ...fx.forEachPlayer(ref.eachPlayer, (p, n) =>
          fx.when(seated(p), fx.chooseAmong(ref.except(ref.eachPlayer, p), p, `vote${n}`, { prompt: "Vote for another player" })),
        ),
        ...SEATS.flatMap((n) => {
          const voted = ref.except(ref.stored(`vote${n}`), ref.you);
          return [
            fx.damage(2, ref.union(voted, ref.permanentsOf(voted, { types: ["Creature"] }))),
            fx.draw(amount.refCount(ref.except(ref.stored(`vote${n}`), ref.eachOpponent))),
          ];
        }),
      ],
    ),
  },
  // Flashback {5}{R}{R}: read from the text. The choices are made one after the other (approximation of "secretly").
  "Prisoner's Dilemma": { spell: spell([], prisonersDilemma) },
  "Saw in Half": {
    spell: spell(
      [target.creature()],
      [
        fx.destroy(ref.target(), "saw"),
        ...fx.when(
          cond.v("saw"),
          fx.copyToken(ref.target(), {
            count: 2,
            for: ref.controllerOf(ref.target()),
            pt: {
              power: halfUp({ kind: "aggregate", fn: "sum", property: "power", of: ref.target() }),
              toughness: halfUp({ kind: "aggregate", fn: "sum", property: "toughness", of: ref.target() }),
            },
          }),
        ),
      ],
    ),
  },
  "Sundering Eruption": {
    spell: spell(
      [target.permanent("t", ["Land"], {}, "land")],
      [
        fx.destroy(ref.target()),
        fx.search({ types: ["Land"], basic: true }, { to: "battlefield", tapped: true }, 1, ref.controllerOf(ref.target())),
        fx.pumpAll({ types: ["Creature"], not: { keyword: "flying" } }, 0, 0, ["cantBlock"]),
      ],
    ),
  },
  "Volcanic Fissure": { abilities: [manaAbility("R")] },
  // Tempting offer: each opponent may copy the spell; you copy it once, plus once for each of them who did.
  "Tempt with Mayhem": {
    spell: spell(
      [target.spell("t", { anyOf: [{ types: ["Instant"] }, { types: ["Sorcery"] }] }, "instant or sorcery spell")],
      [
        ...fx.forEachPlayer(ref.eachOpponent, (p, n) =>
          fx.when(seated(p), fx.mayForStore(p, "Copy that spell?", `tempt${n}`, fx.copySpell(ref.target(), 1, { for: p }))),
        ),
        fx.copySpell(ref.target(), amount.plus(1, ...SEATS.map((n) => amount.v(`tempt${n}`)))),
      ],
    ),
  },
};
