/** The Lost Caverns of Ixalan — legendaries and unique cards (lot D). Scripts by face name. */
import { type Effect, type ModeDef, msg, type TargetSpec } from "@mtgx/engine";
import {
  ARTIFACT_OR_CREATURE,
  ARTIFACT_OR_CREATURE_YOURS,
  activated,
  amount,
  BAT_1,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  craft,
  DINOSAUR_YOU,
  descend,
  entersWith,
  eventReplacement,
  FUNGUS_DINOSAUR,
  fx,
  GNOME_SOLDIER,
  manaAbility,
  mode,
  OTHER_ARTIFACT_OR_CREATURE_YOURS,
  PERMANENT_CARD,
  PERMANENT_CARDS,
  playerStatic,
  ref,
  spell,
  staticAbility,
  TREASURE,
  target,
  targetObj,
  triggered,
  triggeredModal,
  VAMPIRE_LIFELINK,
  when,
} from "./common";

const ANY = ["W", "U", "B", "R", "G"] as const;
const CREATURE = { types: ["Creature" as const] };

/** Gods of Ixalan: "When [it] dies, return it to the battlefield tapped and transformed" (Temple). */
const returnsAsTemple = (counters?: { kind: string; n: number }) =>
  triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true, transformed: true, counters })], {
    label: "Returns as a Temple, tapped",
  });
/** Temples: "{T}: Add [color]" and "{2}{C}, {T}: Transform this land. Activate only if … and only as a sorcery." */
const temple = (c: "W" | "U" | "B" | "R" | "G", condition: Parameters<typeof cond.not>[0], extra = {}): CardScript => ({
  abilities: [
    manaAbility(c, 1, extra),
    activated({
      mana: `{2}{${c}}`,
      tap: true,
      sorcerySpeed: true,
      activationCondition: condition,
      effects: [fx.transform()],
      label: "Transform this land",
    }),
  ],
});

/** Cosmium Confluence: "choose three; you may choose the same mode more than once" (all combinations). */
const confluence = (): ModeDef[] => {
  /** "on a Cave you control": chosen on resolution, without targeting (the same mode can pick the same one). */
  const cave = (i: number) =>
    fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Land"], subtype: "Cave" }), ref.you, `c${i}`, {
      prompt: "Cave that gets three +1/+1 counters",
    });
  const ench = (i: number) => targetObj(`e${i}`, { types: ["Enchantment"] }, "enchantment");
  const modes: { label: string; targets: (i: number) => TargetSpec[]; effects: (i: number) => Effect[] }[] = [
    {
      label: "Tapped Cave",
      targets: () => [],
      effects: () => [fx.search({ subtype: "Cave" }, { to: "battlefield", tapped: true })],
    },
    {
      label: "0/0 Cave with three counters",
      targets: () => [],
      effects: (i) => [
        cave(i),
        fx.counters(ref.stored(`c${i}`), "+1/+1", 3),
        fx.modify(
          ref.stored(`c${i}`),
          { addTypes: ["Creature"], addSubtypes: ["Elemental"], setPower: 0, setToughness: 0, addKeywords: ["haste"] },
          "permanent",
        ),
      ],
    },
    { label: "Destroy an enchantment", targets: (i) => [ench(i)], effects: (i) => [fx.destroy(ref.target(`e${i}`))] },
  ];
  const out: ModeDef[] = [];
  for (let a = 0; a <= 3; a++)
    for (let b = 0; a + b <= 3; b++) {
      const counts = [a, b, 3 - a - b];
      const picks = counts.flatMap((n, k) => Array.from({ length: n }, (_, i) => ({ m: modes[k] as (typeof modes)[number], i })));
      out.push(
        mode(
          picks.map((p) => p.m.label).reduce((a, b) => msg("{a} + {b}", { a, b })),
          picks.flatMap((p) => p.m.targets(p.i)),
          picks.flatMap((p) => p.m.effects(p.i)),
        ),
      );
    }
  return out;
};

/** Permanents you untapped during your untap step this turn (The Millennium Calendar). */
const UNTAPPED_IN_UNTAP_STEP = amount.turnEvents({ event: "untap", who: "you", untapStep: true });

export const LEGENDS: Record<string, CardScript> = {
  // --- White ------------------------------------------------------------------
  "Dauntless Dismantler": {
    abilities: [
      entersWith({
        tapped: true,
        affects: { types: ["Artifact"], controller: "opponent" },
        label: "Opponents' artifacts enter tapped",
      }),
      activated({
        mana: "{X}{X}{W}",
        sacrifice: true,
        effects: [fx.destroyAll({ types: ["Artifact"], compare: [cmp.manaValue("=", amount.x)] })],
        label: "Destroy each artifact with mana value X",
      }),
    ],
  },
  "Fabrication Foundry": {
    abilities: [
      manaAbility("W", 1, { restriction: { spell: { types: ["Artifact"] }, abilityOfSource: { types: ["Artifact"] } } }),
      activated({
        mana: "{2}{W}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", { types: ["Artifact"] }, "you", "artifact card from your graveyard")],
        effects: [
          {
            op: "pay",
            cost: { exile: { types: ["Artifact"], other: true } },
            totalManaValue: amount.manaValueOf(ref.target()),
            store: "ok",
            skip: 0,
          },
          ...fx.when(cond.v("ok"), fx.toBattlefield(ref.target())),
        ],
        label: "Exile artifacts: an artifact returns from the graveyard",
      }),
    ],
  },
  "Kutzil's Flanker": {
    abilities: [
      triggeredModal(
        when.entersSelf,
        [
          mode(
            "Counters (creatures that left this turn)",
            [],
            [
              fx.addCounters(
                ref.self,
                amount.turnEvents({ event: "zone", from: "battlefield", types: ["Creature"], who: "you" }),
              ),
            ],
          ),
          mode("+2 life and scry 2", [], [fx.gainLife(2), fx.scry(2)]),
          mode("Exile a player's graveyard", [target.player()], [fx.moveAll("graveyard", ref.target(), {}, { to: "exile" })]),
        ],
        { label: "Choose one" },
      ),
    ],
  },
  "Ojer Taq, Deepest Foundation": {
    abilities: [
      eventReplacement({
        event: "tokens",
        to: "you",
        toFilter: { types: ["Creature"] },
        modify: { times: 3 },
        label: "Three times as many creature tokens",
      }),
      returnsAsTemple(),
    ],
  },
  "Temple of Civilization": temple("W", cond.amountAtLeast(amount.attackersThisTurn, 3)),
  "Thousand Moons Infantry": {
    abilities: [
      // "Untap this creature during each other player's untap step."
      playerStatic({ untapOnOthersUntap: { self: true }, label: "Untaps during each opponent's turn" }),
    ],
  },
  "Thousand Moons Smithy": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(GNOME_SOLDIER)], { label: "Gnome Soldier" }),
      triggered(
        when.step("main1"),
        [
          ...fx.may(
            "Tap five artifacts and/or creatures to transform it?",
            fx.tapChosen(ARTIFACT_OR_CREATURE, "c", { exactly: 5 }),
            ...fx.when(cond.v("c", 5), fx.transform()),
          ),
        ],
        { condition: cond.controls({ ...ARTIFACT_OR_CREATURE_YOURS, tapped: false }, 5), label: "Tap five permanents" },
      ),
    ],
  },
  "Barracks of the Thousand": {
    abilities: [
      manaAbility("W"),
      triggered(
        { on: "castSpell", by: "you", filter: ARTIFACT_OR_CREATURE, usingManaFrom: { self: true } },
        [fx.createTokens(GNOME_SOLDIER)],
        { label: "Gnome Soldier" },
      ),
    ],
  },
  "Unstable Glyphbridge": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.keep(
            ref.eachPlayer,
            "one",
            { types: ["Creature"] },
            { chooser: "you", fate: "destroy", among: { types: ["Creature"], maxPower: 2 } },
          ),
        ],
        {
          condition: cond.wasCast,
          label: "One creature with power 2 or less spared per player",
        },
      ),
      craft("{3}{W}{W}", { filter: { types: ["Artifact"] }, count: 1 }),
    ],
  },
  "Sandswirl Wanderglyph": {
    abilities: [
      triggered(when.castSpell("opponent"), [fx.thisTurn({ cantAttack: { of: "you" } }, ref.eventPlayer)], {
        // "during their turn": the caster is the active player.
        condition: cond.amountAtLeast(amount.refCount(ref.playersWhere(ref.eventPlayer, cond.yourTurn)), 1),
        label: "It can't attack you this turn",
      }),
      playerStatic({
        castLimit: { who: "opponents", attackedYou: true },
        label: "Whoever attacked you can't cast spells",
      }),
    ],
  },
  // --- Blue -------------------------------------------------------------------
  "The Enigma Jewel": {
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      manaAbility("C", 2, { restriction: { abilityOfSource: {} } }),
      craft("{8}{U}", { filter: { notTypes: ["Land"], withActivatedAbility: true }, count: 4 }),
    ],
  },
  "Locus of Enlightenment": {
    abilities: [
      staticAbility(
        "self",
        { gainAbilitiesOf: { zone: "linked", oncePerTurn: true } },
        { label: "Activated abilities of the exiled cards, each once per turn" },
      ),
      triggered({ on: "activateAbility" }, [fx.copySpell(ref.eventObject, 1)], { label: "Copy the ability" }),
    ],
  },
  "Kitesail Larcenist": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.modifyWhileSource(ref.target(), {
            setTypes: ["Artifact"],
            setSubtypes: ["Treasure"],
            loseAllAbilities: true,
            addAbilities: [manaAbility([...ANY], 1, { sacrifice: true })],
          }),
        ],
        {
          targets: [
            {
              // "for each player, up to one … that player controls" (four players at most).
              ...target.upTo(4, targetObj("t", { ...ARTIFACT_OR_CREATURE, other: true }, "other artifact or creature")),
              differentPlayers: true,
            },
          ],
          label: "Become Treasures",
        },
      ),
    ],
  },
  "Malcolm, Alluring Scoundrel": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          fx.counters(ref.self, "chorus", 1),
          fx.draw(1),
          fx.discard(1, ref.you, { store: "d" }),
          ...fx.when(cond.counterAtLeast("chorus", 4), fx.castNow(ref.stored("d"), { free: true })),
        ],
        { label: "Singing counter, loot" },
      ),
    ],
  },
  "Ojer Pakpatiq, Deepest Epoch": {
    abilities: [
      triggered(
        { on: "castSpell", by: "you", filter: { types: ["Instant"] }, fromHand: true },
        [fx.grantRebound(ref.eventObject)],
        { label: "Rebound" },
      ),
      returnsAsTemple({ kind: "time", n: 3 }),
    ],
  },
  "Temple of Cyclical Time": temple("U", cond.not(cond.counterAtLeast("time", 1)), { removeCounter: "time" }),
  "Tishana's Tidebinder": {
    abilities: [
      triggered(when.entersSelf, [fx.counterAbilitySilence(ref.target())], {
        targets: [
          target.optional({
            id: "t",
            label: "activated or triggered ability",
            filter: { stackItems: { only: "abilities" } },
          }),
        ],
        label: "Counter an ability",
      }),
    ],
  },
  // --- Black ------------------------------------------------------------------
  "Aclazotz, Deepest Betrayal": {
    abilities: [
      triggered(when.attacksSelf, [fx.draw(amount.opponentsWithHandAtMost(0)), fx.discard(1, ref.eachOpponent)], {
        label: "Each opponent discards a card",
      }),
      triggered(when.discard("opponent"), [fx.createTokens(BAT_1)], {
        condition: cond.eventObjectMatches({ types: ["Land"] }),
        label: "1/1 Bat",
      }),
      returnsAsTemple(),
    ],
  },
  // "Activate only if a player has one or fewer cards in hand".
  "Temple of the Dead": temple("B", cond.handAtMost(ref.eachPlayer, 1)),
  "Bitter Triumph": {
    additionalCost: { discard: 1, discardOr: { life: 3 } },
    spell: spell([target.creatureOrPlaneswalker()], [fx.destroy(ref.target())]),
  },
  "Bloodletter of Aclazotz": {
    abilities: [
      eventReplacement({
        event: "lifeLoss",
        to: "opponent",
        modify: { times: 2 },
        condition: cond.yourTurn,
        label: "During your turn, opponents' life loss doubled",
      }),
    ],
  },
  "Bringer of the Last Gift": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.sacrifice(ref.eachPlayer, { types: ["Creature"], other: true }, 1000, { store: "x" }),
          fx.pickFromZone(
            "graveyard",
            CREATURE,
            { to: "battlefield" },
            { count: 1000, pool: ref.allGraveyards, excludeStored: "x", prompt: "Creature cards that return" },
          ),
        ],
        { condition: cond.wasCast, label: "Sacrifices, then the creatures return" },
      ),
    ],
  },
  "Deep-Cavern Bat": {
    abilities: [
      // "Look at target opponent's hand. You may exile a nonland card from it."
      triggered(
        when.entersSelf,
        [fx.look(ref.handOf(ref.target())), fx.exileFromHandLinked(ref.target(), { notTypes: ["Land"] }, true)],
        {
          targets: [target.player("t", "opponent")],
          label: "Exile a nonland card from their hand",
        },
      ),
    ],
  },
  "Preacher of the Schism": {
    abilities: [
      triggered(
        when.attacksSelf,
        [...fx.when({ kind: "mostLife", ref: ref.defendingPlayer }, fx.createTokens(VAMPIRE_LIFELINK))],
        { label: "Attacks the player with the most life: 1/1 Vampire" },
      ),
      triggered(when.attacksSelf, [fx.draw(1), fx.loseLife(1)], {
        condition: { kind: "mostLife" },
        label: "You have the most life: draw, lose 1 life",
      }),
    ],
  },
  "Souls of the Lost": {
    additionalCost: { discard: 1, discardOr: { sacrifice: true } },
    cda: { power: PERMANENT_CARDS, toughness: amount.plus(PERMANENT_CARDS, 1) },
  },
  "Starving Revenant": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.surveil(2, undefined, "k"),
          fx.draw(amount.v("k")),
          fx.loseLife(amount.plus(amount.v("k"), amount.v("k"), amount.v("k"))),
        ],
        { label: "Surveil 2; draw for each card left" },
      ),
      triggered(when.draw(), [fx.loseLife(1, ref.target()), fx.gainLife(1)], {
        targets: [target.player("t", "opponent")],
        condition: descend(8),
        label: "Descend 8 — drain 1",
      }),
    ],
  },
  "Tarrian's Journal": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: OTHER_ARTIFACT_OR_CREATURE_YOURS },
        sorcerySpeed: true,
        effects: [fx.draw(1)],
        label: "Draw a card",
      }),
      activated({
        mana: "{2}",
        tap: true,
        discardHand: true,
        effects: [fx.transform()],
        label: "Discard your hand: transform",
      }),
    ],
  },
  "The Tomb of Aclazotz": {
    abilities: [
      manaAbility("B"),
      activated({
        tap: true,
        // A creature spell from your graveyard, once this turn; finality and Vampire in addition.
        effects: [
          {
            op: "playerEffect",
            ability: {
              playFrom: {
                zone: "graveyard",
                filter: { types: ["Creature"] },
                what: "spells",
                finality: true,
                addSubtypes: ["Vampire"],
              },
            },
            once: true,
          },
        ],
        label: "A creature spell from your graveyard",
      }),
    ],
  },
  // --- Red --------------------------------------------------------------------
  "Belligerent Yearling": {
    abilities: [
      triggered(
        when.enters({ ...DINOSAUR_YOU, other: true }),
        [...fx.may("Take its base power?", fx.setBasePTAll({ self: true }, amount.powerOf(ref.eventObject), true))],
        { label: "Base power equal to the Dinosaur's" },
      ),
    ],
  },
  "Ojer Axonil, Deepest Might": {
    abilities: [
      eventReplacement({
        event: "damage",
        source: { controller: "you", colors: ["R"] },
        to: "opponent",
        combat: false,
        modify: { atLeast: amount.powerOf(ref.self) },
        label: "Red sources: at least its power in damage",
      }),
      returnsAsTemple(),
    ],
  },
  "Temple of Power": temple(
    "R",
    cond.amountAtLeast(
      amount.turnEvents({ event: "damage", combat: false, source: { controller: "you", colors: ["R"] }, sum: true }),
      4,
    ),
  ),
  "Rampaging Ceratops": { abilities: [blockAbility(block.atLeast(3))] },
  // --- Green ------------------------------------------------------------------
  "Cosmium Confluence": { spell: { modes: confluence() } },
  "Intrepid Paleontologist": {
    abilities: [
      manaAbility([...ANY]),
      activated({
        mana: "{2}",
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.exileCard(ref.target(), { name: "p" }), fx.link(ref.stored("p"))],
        label: "Exile a card from a graveyard",
      }),
      playerStatic({
        playFrom: {
          zone: "linked",
          what: "spells",
          filter: { types: ["Creature"], subtype: "Dinosaur", owner: "you" },
          finality: true,
        },
        label: "Exiled Dinosaurs: castable (finality)",
      }),
    ],
  },
  "Ojer Kaslem, Deepest Growth": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        // "a creature card and/or a land card": one choice, at most one card of each of those two types, put onto the
        // battlefield together.
        [
          fx.lookAtTop(amount.eventAmount, {
            filter: { anyOf: [CREATURE, { types: ["Land"] }] },
            count: 2,
            onePerType: ["Creature", "Land"],
            to: { to: "battlefield" },
            rest: "bottom",
            revealAll: true,
          }),
        ],
        { label: "A creature and/or a land onto the battlefield" },
      ),
      returnsAsTemple(),
    ],
  },
  "Temple of Cultivation": temple("G", cond.battlefieldCount({ controller: "you" }, 10)),
  "The Skullspore Nexus": {
    costReduction: { generic: amount.maxPower(CREATURE_YOU_CONTROL) },
    abilities: [
      // "One or more … die": a single token, with the total power of those creatures (last known information).
      triggered(
        when.dies({ ...CREATURE_YOU_CONTROL, token: false }),
        [fx.createXXToken(FUNGUS_DINOSAUR, amount.totalPowerOf(ref.eventObjects))],
        { batched: true, label: "Fungus Dinosaur" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.pump(ref.target(), amount.powerOf(ref.target()), 0)],
        label: "Double a creature's power",
      }),
    ],
  },
  "Twists and Turns": {
    abilities: [
      eventReplacement({
        event: "explore",
        toFilter: { types: ["Creature"], controller: "you" },
        modify: { add: 1 },
        label: "Scry 1 before exploring",
      }),
      triggered(when.entersSelf, [fx.explore(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature explores",
      }),
      triggered(when.enters({ types: ["Land"], controller: "you" }), [fx.transform()], {
        condition: cond.controls({ types: ["Land"] }, 7),
        label: "Transform (seven lands)",
      }),
    ],
  },
  "Mycoid Maze": {
    abilities: [
      manaAbility("G"),
      activated({
        mana: "{3}{G}",
        tap: true,
        effects: [fx.lookAtTop(4, { filter: CREATURE, count: 1, rest: "bottom" })],
        label: "Creature card into your hand",
      }),
    ],
  },
  // --- Multicolored ---------------------------------------------------------------
  "The Belligerent": {
    abilities: [
      triggered(
        when.attacksSelf,
        [
          fx.createTokens(TREASURE),
          fx.emblem(
            "The Belligerent",
            "Until end of turn, you may look at the top card of your library any time, and you may play lands and cast spells from the top of your library.",
            [playerStatic({ playFrom: { zone: "libraryTop" }, lookAt: "libraryTop" })],
            undefined,
            true,
          ),
        ],
        { label: "Treasure; play from the top this turn" },
      ),
    ],
  },
  "Kutzil, Malamet Exemplar": {
    abilities: [
      playerStatic({ castLimit: { who: "opponents", during: "yourTurn" }, label: "No opponent spells during your turn" }),
      triggered(when.combatDamageBatch({ ...CREATURE_YOU_CONTROL, compare: [cmp.power(">", "basePower")] }), [fx.draw(1)], {
        label: "Draw a card",
      }),
    ],
  },
  "Sovereign Okinec Ahau": {
    abilities: [
      triggered(when.attacksSelf, [fx.countersAboveBase(CREATURE_YOU_CONTROL)], {
        label: "Counters equal to the difference with base power",
      }),
    ],
  },
  // --- Colorless ------------------------------------------------------------------
  "Contested Game Ball": {
    abilities: [
      // "Whenever you're dealt combat damage": the object of the event is an attacking creature.
      triggered(
        when.playerDealtDamage("you", true),
        [fx.giveControl(ref.self, ref.controllerOf(ref.eventObject)), fx.untap(ref.self)],
        { batched: true, label: "The attacking player gains control of it" },
      ),
      activated({
        mana: "{2}",
        tap: true,
        effects: [
          fx.draw(1),
          fx.counters(ref.self, "point", 1),
          ...fx.when(cond.counterAtLeast("point", 5), fx.sacrificeIt(ref.self), fx.createTokens(TREASURE)),
        ],
        label: "Draw, point counter",
      }),
    ],
  },
  "Matzalantli, the Great Door": {
    abilities: [
      activated({ tap: true, effects: [...fx.loot()], label: "Draw, and then discard" }),
      activated({
        mana: "{4}",
        tap: true,
        activationCondition: cond.amountAtLeast(amount.permanentTypesInGraveyard, 4),
        effects: [fx.transform()],
        label: "Transform (four permanent types in the graveyard)",
      }),
    ],
  },
  "The Core": { abilities: [manaAbility([...ANY], 1, { perGraveyard: PERMANENT_CARD })] },
  "The Millennium Calendar": {
    abilities: [
      // "Whenever you untap one or more permanents during your untap step": the ability waits for the upkeep (502.4).
      triggered(when.yourUpkeep, [fx.counters(ref.self, "time", UNTAPPED_IN_UNTAP_STEP)], {
        condition: cond.amountAtLeast(UNTAPPED_IN_UNTAP_STEP, 1),
        label: "A time counter for each untapped permanent",
      }),
      activated({
        mana: "{2}",
        tap: true,
        effects: [fx.counters(ref.self, "time", amount.countersOn(ref.self, "time"))],
        label: "Double the time counters",
      }),
      triggered(when.countersPut("self", "time"), [fx.sacrificeIt(ref.self), fx.loseLife(1000, ref.eachOpponent)], {
        condition: cond.counterAtLeast("time", 1000),
        label: "1,000 counters: each opponent loses 1,000 life",
      }),
    ],
  },
  "Roaming Throne": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility("self", { addChosen: "subtype" }, { label: "Of the chosen type" }),
      playerStatic({
        triggerMod: { effect: "again", sources: { types: ["Creature"], chosen: "subtype", other: true } },
        label: "Triggers of the chosen type doubled",
      }),
    ],
  },
  // --- Lands ----------------------------------------------------------------------
  "Cavern of Souls": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      manaAbility("C"),
      manaAbility([...ANY], 1, {
        restriction: { spell: { types: ["Creature"], chosen: "subtype" } },
        rider: { spell: { types: ["Creature"], chosen: "subtype" }, effect: "uncounterable" },
      }),
    ],
  },
  "Echoing Deeps": {
    // "… enter tapped as a copy of any land card in a graveyard, except it's a Cave in addition to its other
    // types."
    asEnters: [fx.chooseCopy({ types: ["Land"] }, { fromGraveyards: true, tapped: true, except: { addSubtypes: ["Cave"] } })],
    abilities: [manaAbility("C")],
  },
  "Pit of Offerings": {
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      triggered(when.entersSelf, [fx.exileCard(ref.target(), { name: "p" }), fx.link(ref.stored("p"))], {
        targets: [target.upTo(3, target.cardInGraveyard("t", {}, "any"))],
        label: "Exile up to three cards from graveyards",
      }),
      manaAbility("C"),
      manaAbility([], 1, { linkedColors: true }),
    ],
  },
  "Sunken Citadel": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [
      entersWith({ tapped: true, label: "Enters tapped" }),
      manaAbility([...ANY], 1, { produceChosen: true }),
      manaAbility([...ANY], 2, { produceChosen: true, restriction: { abilityOfSource: { types: ["Land"] } } }),
    ],
  },
};
