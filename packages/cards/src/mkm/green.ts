/**
 * Murders at Karlov Manor — green cards (lot A). Disguise, ward, Equipment, collect evidence (optional additional
 * cost, read as a kicker: `cond.kicked`) and keywords are read from the text; "investigate" creates a Clue
 * (`investigate`).
 */
import type { ObjectFilter, TokenSpec } from "@mtgx/engine";
import { BASIC_LAND_TYPES } from "@mtgx/engine";
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  cond,
  DETECTIVE,
  doesntUntap,
  fx,
  GOBLIN,
  HUMAN,
  investigate,
  MERFOLK_U,
  manaAbility,
  modal,
  mode,
  playerStatic,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
/** "a creature or land card". */
const CREATURE_OR_LAND: ObjectFilter = { anyOf: [{ types: ["Creature"] }, { types: ["Land"] }] };
/** "a land card with a basic land type". */
const LAND_WITH_BASIC_TYPE: ObjectFilter = {
  types: ["Land"],
  anySubtype: [...BASIC_LAND_TYPES],
};
/** Slime Against Humanity: "Oozes or cards named Slime Against Humanity". */
const OOZE_OR_SLIME: ObjectFilter = { anyOf: [{ subtype: "Ooze" }, { name: "Slime Against Humanity" }] };

/** Plant: 0/1 green creature. */
const PLANT: TokenSpec = { name: "Plant", colors: ["G"], types: ["Creature"], subtypes: ["Plant"], power: 0, toughness: 1 };
/** Ooze: 0/0 green creature with trample. */
const OOZE: TokenSpec = {
  name: "Ooze",
  colors: ["G"],
  types: ["Creature"],
  subtypes: ["Ooze"],
  power: 0,
  toughness: 0,
  keywords: ["trample"],
};

export const GREEN: Record<string, CardScript> = {
  "Aftermath Analyst": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "Mill three cards" }),
      activated({
        mana: "{3}{G}",
        sacrifice: true,
        effects: [fx.moveAll("graveyard", ref.you, { types: ["Land"] }, { to: "battlefield", tapped: true })],
        label: "Return all land cards from your graveyard to the battlefield tapped",
      }),
    ],
  },
  "Analyze the Pollen": {
    // Collect evidence 8 (optional additional cost): read from the text.
    spell: spell(
      [],
      [...fx.when(cond.not(cond.kicked), fx.search(BASIC_LAND)), ...fx.when(cond.kicked, fx.search(CREATURE_OR_LAND))],
    ),
  },
  "Archdruid's Charm": {
    spell: modal(
      mode(
        "Search for a creature or land card",
        [],
        [
          // The card found is held (revealed), then routed: a land onto the battlefield tapped, otherwise into the hand.
          fx.searchHold(CREATURE_OR_LAND, "found", 1, { reveal: true }),
          fx.toBattlefield(ref.filtered(ref.stored("found"), { types: ["Land"] }), { tapped: true }),
          fx.toHand(ref.filtered(ref.stored("found"), { not: { types: ["Land"] } })),
          fx.shuffle(ref.you),
        ],
      ),
      mode(
        "A +1/+1 counter, then it deals damage to an opponent's creature",
        [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
        [fx.addCounters(ref.target("a"), 1), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
      ),
      mode(
        "Exile an artifact or enchantment",
        [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
        [fx.exile(ref.target())],
      ),
    ),
  },
  "Audience with Trostani": {
    spell: spell(
      [],
      [fx.createTokens(PLANT), fx.draw(amount.distinctNames({ types: ["Creature"], controller: "you", token: true }))],
    ),
  },
  "Bite Down on Crime": {
    // Collect evidence 6 (optional additional cost): read from the text; it then costs {2} less.
    costReduction: { generic: 2, condition: cond.kicked },
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creature("b", { controller: "opponent" })],
      [fx.pump(ref.target("a"), 2, 0), fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Case of the Locked Hothouse": {
    abilities: [playerStatic({ extraLands: 1, label: "An additional land on each of your turns" })],
    caseToSolve: cond.controls({ types: ["Land"] }, 7),
    caseSolved: [
      playerStatic({ lookAt: "libraryTop", label: "Look at the top card" }),
      playerStatic({
        playFrom: { zone: "libraryTop", filter: { anyOf: [{ types: ["Land"] }, { types: ["Creature", "Enchantment"] }] } },
        label: "Lands, creature and enchantment spells from the top of your library",
      }),
    ],
  },
  "Case of the Trampled Garden": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(2, ref.target())], {
        targets: [target.between(1, 2, target.creature("t", { controller: "you" }))],
        label: "Distribute two +1/+1 counters",
      }),
    ],
    caseToSolve: cond.amountAtLeast(amount.totalPower(YOUR_CREATURES), 8),
    caseSolved: [
      triggered(when.attackWith(1), [fx.addCounters(ref.target(), 1), fx.modify(ref.target(), { addKeywords: ["trample"] })], {
        targets: [target.creature("t", { attacking: true })],
        label: "A +1/+1 counter and trample for an attacker",
      }),
    ],
  },
  "Chalk Outline": {
    abilities: [
      triggered(
        when.zoneChange(["graveyard"], { filter: { types: ["Creature"] }, whose: "you" }),
        [fx.createTokens(DETECTIVE), investigate()],
        { batched: true, label: "A 2/2 Detective, then investigate" },
      ),
    ],
  },
  "Fanatical Strength": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 3, 3, ["trample"])]),
  },
  "Flourishing Bloom-Kin": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1 },
        { per: { subtype: "Forest", controller: "you" }, label: "+1/+1 for each Forest" },
      ),
      triggered(
        when.turnedFaceUp,
        [
          // The Forests found are held (revealed): one onto the battlefield tapped, the other into the hand.
          fx.searchHold({ types: ["Land"], subtype: "Forest" }, "forests", 2, { reveal: true }),
          fx.chooseAmong(ref.stored("forests"), ref.you, "tapped", {
            anyZone: true,
            prompt: "The Forest to put onto the battlefield tapped",
          }),
          fx.toBattlefield(ref.stored("tapped"), { tapped: true }),
          fx.toHand(ref.stored("tappedRest")),
          fx.shuffle(ref.you),
        ],
        { label: "Search for two Forests: one onto the battlefield, the other into your hand" },
      ),
    ],
  },
  "Get a Leg Up": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), amount.count(YOUR_CREATURES), amount.count(YOUR_CREATURES), ["reach"])],
    ),
  },
  "Glint Weaver": {
    abilities: [
      triggered(when.entersSelf, [fx.countersDivided(3, ref.target()), fx.gainLife(amount.maxToughness(YOUR_CREATURES))], {
        targets: [target.between(1, 3, target.creature())],
        label: "Distribute three +1/+1 counters, then gain life",
      }),
    ],
  },
  "Greenbelt Radical": {
    abilities: [
      triggered(
        when.turnedFaceUp,
        [fx.addCountersAll(YOUR_CREATURES, 1), fx.modifyAll(YOUR_CREATURES, { addKeywords: ["trample"] })],
        { label: "A +1/+1 counter on each of your creatures, which gain trample" },
      ),
    ],
  },
  "Hard-Hitting Question": {
    spell: spell(
      [target.creature("a", { controller: "you" }), target.creatureOrPlaneswalker("b", { controller: "opponent" })],
      [fx.damage(amount.powerOf(ref.target("a")), ref.target("b"), ref.target("a"))],
    ),
  },
  "Hide in Plain Sight": {
    spell: spell(
      [],
      [
        fx.lookAtTop(5, { count: 2, exact: true, to: { to: "libraryTop" }, rest: "bottom", store: "cloak" }),
        fx.putFaceDown(ref.stored("cloak"), true),
      ],
    ),
  },
  "Loxodon Eavesdropper": {
    abilities: [
      triggered(when.entersSelf, [investigate()], { label: "Investigate" }),
      triggered(when.draw(2), [fx.pump(ref.self, 1, 1, ["vigilance"])], {
        label: "Second card drawn: +1/+1 and vigilance",
      }),
    ],
  },
  "Nervous Gardener": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.search(LAND_WITH_BASIC_TYPE)], {
        label: "Search for a land card with a basic land type",
      }),
    ],
  },
  "Pick Your Poison": {
    spell: modal(
      mode("Each opponent sacrifices an artifact", [], [fx.sacrifice(ref.eachOpponent, { types: ["Artifact"] })]),
      mode("Each opponent sacrifices an enchantment", [], [fx.sacrifice(ref.eachOpponent, { types: ["Enchantment"] })]),
      mode(
        "Each opponent sacrifices a creature with flying",
        [],
        [fx.sacrifice(ref.eachOpponent, { types: ["Creature"], keyword: "flying" })],
      ),
    ),
  },
  "Pompous Gadabout": {
    abilities: [
      staticAbility("self", { addKeywords: ["hexproof"] }, { condition: cond.yourTurn, label: "Hexproof during your turn" }),
      // Only face-down creatures have no name.
      blockAbility(block.notBy({ faceDown: true }, "Can't be blocked by creatures with no name")),
    ],
  },
  "The Pride of Hull Clade": {
    costReduction: { generic: amount.totalToughness(YOUR_CREATURES) },
    abilities: [
      activated({
        mana: "{2}{U}{U}",
        targets: [target.creature("t", { controller: "you" })],
        effects: [
          fx.modify(ref.target(), {
            power: 1,
            addKeywords: ["attacksDespiteDefender"],
            addAbilities: [
              triggered(when.combatDamageToPlayer, [fx.draw(amount.toughnessOf(ref.self))], {
                label: "Draw cards equal to its toughness",
              }),
            ],
          }),
        ],
        label: "+1/+0, draws when dealing damage to a player, attacks despite defender",
      }),
    ],
  },
  Rope: {
    abilities: [
      staticAbility(
        "attached",
        { power: 1, toughness: 2, addKeywords: ["reach"], addBlockRules: [block.atMost(1)] },
        { label: "+1/+2, reach, can't be blocked by more than one creature" },
      ),
      activated({ mana: "{2}", sacrifice: true, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Rubblebelt Maverick": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" }),
      activated({
        mana: "{G}",
        exileSelf: true,
        fromGraveyard: true,
        sorcerySpeed: true,
        targets: [target.creature()],
        effects: [fx.addCounters(ref.target(), 1)],
        label: "From the graveyard: a +1/+1 counter",
      }),
    ],
  },
  "Sharp-Eyed Rookie": {
    abilities: [
      triggered(when.enters(YOUR_CREATURES), [fx.addCounters(ref.self, 1), investigate()], {
        condition: cond.any(
          cond.amountAtLeast(amount.plus(amount.powerOf(ref.eventObject), amount.neg(amount.powerOf(ref.self))), 1),
          cond.amountAtLeast(amount.plus(amount.toughnessOf(ref.eventObject), amount.neg(amount.toughnessOf(ref.self))), 1),
        ),
        label: "Greater power or toughness: a +1/+1 counter, then investigate",
      }),
    ],
  },
  "Slime Against Humanity": {
    spell: spell(
      [],
      [
        fx.createTokens(OOZE, 1, undefined, "ooze"),
        fx.addCounters(
          ref.stored("ooze"),
          amount.plus(2, amount.countIn("graveyard", OOZE_OR_SLIME), amount.countExiled(OOZE_OR_SLIME)),
        ),
      ],
    ),
  },
  "They Went This Way": {
    spell: spell([], [fx.search(BASIC_LAND, { to: "battlefield", tapped: true }), investigate()]),
  },
  "Undergrowth Recon": {
    abilities: [
      triggered(when.yourUpkeep, [fx.toBattlefield(ref.target(), { tapped: true })], {
        targets: [target.cardInGraveyard("t", { types: ["Land"] })],
        label: "Return a land card from your graveyard tapped",
      }),
    ],
  },
  "Vengeful Creeper": {
    abilities: [
      triggered(when.turnedFaceUp, [fx.destroy(ref.target())], {
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { controller: "opponent" },
            "artifact or enchantment an opponent controls",
          ),
        ],
        label: "Destroy an artifact or enchantment an opponent controls",
      }),
    ],
  },
  "Vitu-Ghazi Inspector": {
    // Collect evidence 6 (optional additional cost) and reach: read from the text.
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1), fx.gainLife(2)], {
        condition: cond.kicked,
        targets: [target.creature()],
        label: "Evidence collected: a +1/+1 counter and 2 life",
      }),
    ],
  },
  "Sample Collector": {
    abilities: [
      triggered(
        when.attacksSelf,
        fx.mayCollectEvidence(
          3,
          {},
          fx.reflexive([target.creature("c", { controller: "you" })], [fx.addCounters(ref.target("c"), 1)]),
        ),
        { label: "You may collect evidence 3: a +1/+1 counter" },
      ),
    ],
  },
  "Tunnel Tipster": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCounters(ref.self, 1)], {
        condition: cond.amountAtLeast(
          amount.turnEvents({ event: "zone", to: "battlefield", who: "you", faceDown: true, types: ["Creature"] }),
          1,
        ),
        label: "A face-down creature entered under your control: a +1/+1 counter",
      }),
      manaAbility("G"),
    ],
  },
  "Airtight Alibi": {
    // Flash: read from the text.
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.untap(ref.attached), fx.pump(ref.attached, 0, 0, ["hexproof"]), fx.suspect(ref.attached, false)],
        { label: "Untap it; hexproof; it's no longer suspected" },
      ),
      staticAbility(
        "attached",
        { power: 2, toughness: 2, addKeywords: ["cantBeSuspected"] },
        {
          label: "+2/+2, can't become suspected",
        },
      ),
    ],
  },
  "Culvert Ambusher": {
    // Disguise {4}{G}: read from the text.
    abilities: [
      ...[when.entersSelf, when.turnedFaceUp].map((w) =>
        triggered(w, [fx.modify(ref.target(), { addBlockRules: [{ mustBlock: true, label: "Blocks if able" }] }, "endOfTurn")], {
          targets: [target.creature()],
          label: "The target creature blocks this turn if able",
        }),
      ),
    ],
  },
  "Hedge Whisperer": {
    abilities: [
      doesntUntap("self", { may: true }),
      activated({
        mana: "{3}{G}",
        tap: true,
        collectEvidence: 4,
        sorcerySpeed: true,
        targets: [target.permanent("t", ["Land"], { controller: "you" }, "land you control")],
        effects: [
          fx.modifyWhileTapped(ref.target(), {
            addTypes: ["Creature"],
            addSubtypes: ["Plant", "Boar"],
            setColors: ["G"],
            setPower: 5,
            setToughness: 5,
            addKeywords: ["haste"],
          }),
        ],
        label: "A land becomes a 5/5 Plant Boar with haste for as long as this creature stays tapped",
      }),
    ],
  },
  "A Killer Among Us": {
    abilities: [
      triggered(
        when.entersSelf,
        [
          fx.createTokens(HUMAN),
          fx.createTokens(MERFOLK_U),
          fx.createTokens(GOBLIN),
          fx.chooseForSelf("creatureType", { options: ["Human", "Merfolk", "Goblin"], secret: true }),
        ],
        { label: "A Human, a Merfolk and a Goblin; secretly choose one of those types" },
      ),
      // "Reveal the creature type you chose": only the player who chose it, who shows it to everyone.
      activated({
        sacrifice: true,
        revealChosen: true,
        targets: [
          {
            id: "t",
            label: "attacking creature token",
            filter: { objects: { types: ["Creature"], token: true, attacking: true } },
          },
        ],
        effects: fx.when(
          cond.refMatches(ref.target(), { chosen: "subtype" }),
          fx.addCounters(ref.target(), 3),
          fx.pump(ref.target(), 0, 0, ["deathtouch"]),
        ),
        label: "Sacrifice it, reveal the type: three +1/+1 counters and deathtouch if it has that type",
      }),
    ],
  },
};
