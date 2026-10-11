/**
 * Teenage Mutant Ninja Turtles — multicolored cards (lot A). Sneak, flying, trample, vigilance, menace, deathtouch,
 * haste and ward are read from the text. Alliance and Disappear are ability words: ordinary triggers and
 * conditions.
 */
import { type Effect, msg, type ObjectFilter } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  entersWith,
  FOOD,
  fx,
  MUTAGEN,
  modal,
  mode,
  NINJA,
  playerStatic,
  ROBOT_1,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };

/** Disappear: a permanent left the battlefield under your control this turn. */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);

/** Alliance: "whenever another creature you control enters". */
const ALLIANCE = when.enters({ ...YOUR_CREATURES, other: true });

/** "Sacrifice a permanent unless you discard a card": the discard is offered first. */
const SACRIFICE_UNLESS_DISCARD: Effect[] = [
  fx.discard(1, ref.you, { optional: true, store: "d" }),
  ...fx.when(cond.not(cond.v("d")), fx.sacrifice(ref.you, {})),
];

/** "Exile [the target], then return it to the battlefield under its owner's control." */
const flicker = (id: string): Effect[] => [
  fx.exileCard(ref.target(id), { name: `${id}Exiled` }),
  fx.toBattlefield(ref.stored(`${id}Exiled`)),
];

/** Brilliance Unleashed: an artifact card from your graveyard returns; if it isn't a creature, a 3/3 flying Robot. */
const REANIMATE_ARTIFACT: Effect[] = [
  ...fx.when(
    cond.not(cond.refMatches(ref.target("a"), { types: ["Creature"] })),
    fx.moveTo(
      ref.target("a"),
      { to: "battlefield", setTypes: ["Artifact", "Creature"], setSubtypes: ["Robot"], addKeywords: ["flying"] },
      { name: "robot" },
    ),
    fx.modify(ref.stored("robot"), { setPower: 3, setToughness: 3 }, "permanent"),
  ),
  // Already returned if it wasn't a creature: the graveyard identifier no longer designates anything.
  ...fx.when(cond.refMatches(ref.target("a"), { types: ["Creature"] }), fx.toBattlefield(ref.target("a"))),
];
const BRILLIANCE_DAMAGE = target.creature("d");
const BRILLIANCE_ARTIFACT = target.cardInGraveyard("a", { types: ["Artifact"] }, "you", "artifact card in your graveyard");

/** Go Ninja Go. */
const GO_FLICKER = target.creature("f", { controller: "you" });
const GO_DAMAGE = target.creature("d", { controller: "opponent" });
const GREATEST_POWER = amount.maxPower(YOUR_CREATURES);

/** Krang & Shredder: each opponent exiles up to one nonland card, linked to Krang & Shredder. */
const KRANG_EXILE: Effect[] = [
  { op: "exileUntil", filter: { notTypes: ["Land"] }, store: "k", who: ref.eachOpponent },
  fx.link(ref.stored("k")),
];

export const MULTI: Record<string, CardScript> = {
  "Baxter Stockman": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(ROBOT_1)], { label: "A 1/1 Robot" }),
      triggered(when.yourCombat, [fx.pump(ref.target(), 3, 0, ["firstStrike", "vigilance"])], {
        targets: [
          target.permanent("t", ["Creature"], { controller: "you", anyOf: [{ types: ["Artifact"] }] }, "artifact creature"),
        ],
        label: "+3/+0, first strike and vigilance to an artifact creature",
      }),
    ],
  },
  "Bebop & Rocksteady": {
    abilities: [
      triggered(when.attacksSelf, SACRIFICE_UNLESS_DISCARD, { label: "Sacrifice a permanent unless you discard" }),
      triggered(when.blocks("self"), SACRIFICE_UNLESS_DISCARD, { label: "Sacrifice a permanent unless you discard" }),
    ],
  },
  "Brilliance Unleashed": {
    // "Choose one or both."
    spell: modal(
      mode("5 damage to a creature", [BRILLIANCE_DAMAGE], [fx.damage(5, ref.target("d"))]),
      mode("An artifact from your graveyard returns", [BRILLIANCE_ARTIFACT], REANIMATE_ARTIFACT),
      mode("Both", [BRILLIANCE_DAMAGE, BRILLIANCE_ARTIFACT], [fx.damage(5, ref.target("d")), ...REANIMATE_ARTIFACT]),
    ),
  },
  "Dark Leo & Shredder": {
    // Sneak {W}{B}: read from the text.
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Ninja", attacking: true, controller: "you" },
        { addKeywords: ["deathtouch"] },
        { label: "Attacking Ninjas you control have deathtouch" },
      ),
      triggered(
        when.combatDamageToPlayer,
        [
          fx.createTokens(NINJA),
          ...fx.when(cond.controls({ subtype: "Ninja" }, 5), fx.loseLife(amount.halfLife(ref.eventPlayer), ref.eventPlayer)),
        ],
        { label: "A 1/1 Ninja; five Ninjas: that player loses half their life" },
      ),
    ],
  },
  "Don & Leo, Problem Solvers": {
    abilities: [
      triggered(
        when.yourEndStep,
        [
          fx.exileCard(ref.target("a"), { name: "xa" }),
          fx.exileCard(ref.target("c"), { name: "xc" }),
          fx.toBattlefield(ref.union(ref.stored("xa"), ref.stored("xc"))),
        ],
        {
          targets: [
            target.upTo(1, target.permanent("a", ["Artifact"], { controller: "you" }, "artifact you control")),
            target.upTo(1, target.creature("c", { controller: "you" })),
          ],
          label: "Exiles, then returns an artifact and a creature",
        },
      ),
    ],
  },
  "EPF Point Squad": {
    abilities: [triggered(ALLIANCE, [fx.addCounters(ref.self, 1)], { label: "Alliance — a +1/+1 counter" })],
  },
  "Foot Elite": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 1, 0, ["indestructible"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "+1/+0 and indestructible to another creature",
      }),
    ],
  },
  "Foot Ninjas": {
    // Sneak {3}{W/B}: read from the text.
    abilities: [triggered(when.entersSelf, [fx.gainLife(3)], { label: "You gain 3 life" })],
  },
  "Genghis Frog": {
    abilities: [
      triggered(when.enters({ controller: "you", anyOf: [{ self: true }, { subtype: "Mutant" }] }), [fx.createTokens(MUTAGEN)], {
        label: "A Mutagen",
      }),
    ],
  },
  "Go Ninja Go": {
    // "Choose one or both."
    spell: modal(
      mode("Exiles, then returns a creature you control", [GO_FLICKER], flicker("f")),
      mode("Damage equal to your greatest power", [GO_DAMAGE], [fx.damage(GREATEST_POWER, ref.target("d"))]),
      mode("Both", [GO_FLICKER, GO_DAMAGE], [...flicker("f"), fx.damage(GREATEST_POWER, ref.target("d"))]),
    ),
  },
  "Ice Cream Kitty": {
    abilities: [
      activated({
        mana: "{2}",
        sacrificeOther: { filter: { other: true, anyOf: [{ types: ["Creature"] }, { token: true }] } },
        sorcerySpeed: true,
        effects: [fx.draw(1)],
        label: "Sacrifice another creature or a token: draw",
      }),
      activated({ mana: "{2}", tap: true, sacrifice: true, effects: [fx.gainLife(3)], label: "You gain 3 life" }),
    ],
  },
  "Karai, Future of the Foot": {
    // Sneak {2}{W}{B}: read from the text. "If its sneak cost was paid this turn": cast that way and
    // entered this turn.
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [
          ...fx.when(
            cond.all(cond.castVia("sneak"), cond.sourceMatches({ enteredThisTurn: true })),
            fx.toBattlefield(ref.target()),
          ),
          ...fx.when(
            cond.not(cond.all(cond.castVia("sneak"), cond.sourceMatches({ enteredThisTurn: true }))),
            fx.toHand(ref.target()),
          ),
        ],
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
          label: "A creature from your graveyard to your hand (onto the battlefield if sneaked)",
        },
      ),
    ],
  },
  "Karai's Technique": {
    // Sneak {W}{B}: read from the text. "Choose one or both."
    spell: modal(
      mode("+3/+3", [target.creature("p")], [fx.pump(ref.target("p"), 3, 3)]),
      mode("-3/-3", [target.creature("m")], [fx.pump(ref.target("m"), -3, -3)]),
      mode(
        "Both",
        [target.creature("p"), target.creature("m")],
        [fx.pump(ref.target("p"), 3, 3), fx.pump(ref.target("m"), -3, -3)],
      ),
    ),
  },
  "Krang & Shredder": {
    abilities: [
      triggered(when.entersSelf, KRANG_EXILE, { label: "Each opponent exiles up to one nonland card" }),
      triggered(when.attacksSelf, KRANG_EXILE, { label: "Each opponent exiles up to one nonland card" }),
      triggered(when.yourEndStep, [fx.castNow(ref.linked, { free: true })], {
        condition: DISAPPEAR,
        label: "Disappear — cast a card exiled with Krang & Shredder without paying",
      }),
    ],
  },
  "The Last Ronin": {
    abilities: [
      chapter([1], [fx.destroyAll({ types: ["Creature"] })], { label: "Chapter I — Destroy all creatures" }),
      chapter(
        [2],
        [
          fx.mill(4, ref.you, { name: "m" }),
          ...fx.when(
            cond.v("m"),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
              [fx.toHand(ref.target())],
            ),
          ),
        ],
        { label: "Chapter II — Mill four cards, then a creature from your graveyard to your hand" },
      ),
      chapter(
        [3],
        [
          // Triggered ability "this turn": an emblem that disappears at end of turn.
          fx.emblem(
            "The Last Ronin",
            msg(
              "This turn, whenever a creature you control attacks alone, put three +1/+1 counters on it. It gains trample, lifelink, and indestructible until end of turn.",
            ),
            [
              triggered(
                when.attacksAlone(YOUR_CREATURES),
                [fx.addCounters(ref.eventObject, 3), fx.pump(ref.eventObject, 0, 0, ["trample", "lifelink", "indestructible"])],
                { label: "Three +1/+1 counters, trample, lifelink and indestructible" },
              ),
            ],
            false,
            true,
          ),
        ],
        { label: "Chapter III — This turn, a creature that attacks alone grows" },
      ),
    ],
  },
  "Lessons from Life": {
    spell: spell(
      [],
      [
        fx.draw(3),
        fx.pickFromZone(
          "hand",
          { types: ["Land"] },
          { to: "battlefield", tapped: true },
          { count: 1, min: 0, prompt: "You may put a land from your hand onto the battlefield tapped" },
        ),
      ],
    ),
  },
  "Mechanized Ninja Cavalry": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(ROBOT_1)], { label: "A 1/1 Robot" })],
  },
  "Mikey & Leo, Chaos & Order": {
    abilities: [
      triggered(when.youPutCounters(YOUR_CREATURES), [fx.draw(1)], {
        oncePerTurn: true,
        label: "Draw a card (once each turn)",
      }),
    ],
  },
  "Mouser Mark III": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack"] },
        {
          condition: cond.not(cond.controls({ types: ["Artifact"], other: true })),
          label: "Attacks only if you control another artifact",
        },
      ),
    ],
  },
  "The Neutrinos": {
    abilities: [
      triggered(ALLIANCE, [fx.pump(ref.self, 1, 0)], { label: "Alliance — +1/+0 until end of turn" }),
      triggered(
        when.attacksSelf,
        [
          fx.exileCard(ref.target(), { name: "n" }),
          fx.toBattlefield(ref.stored("n"), { underYourControl: true, tapped: true, attacking: true }),
        ],
        {
          targets: [target.upTo(1, target.creature("t", { owner: "you" }))],
          label: "Exiles, then returns a creature you control, tapped and attacking",
        },
      ),
    ],
  },
  Nobody: {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target()), fx.scry(1)], {
        targets: [
          target.upTo(1, target.permanent("t", ["Artifact"], { controller: "you", other: true }, "other artifact you control")),
        ],
        label: "Returns another artifact you control to hand, scry 1",
      }),
    ],
  },
  "Pizza Face, Gastromancer": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "A Food" }),
      triggered(
        when.yourEndStep,
        [
          fx.addCounters(ref.target(), 3),
          ...fx.when(
            cond.not(cond.refMatches(ref.target(), { types: ["Creature"] })),
            fx.modify(
              ref.target(),
              { addTypes: ["Creature"], addSubtypes: ["Mutant"], setPower: 0, setToughness: 0 },
              "permanent",
            ),
          ),
        ],
        {
          condition: DISAPPEAR,
          targets: [
            target.upTo(1, target.permanent("t", ["Artifact", "Creature"], { other: true }, "other artifact or creature")),
          ],
          label: "Disappear — three +1/+1 counters; an artifact becomes a 0/0 Mutant",
        },
      ),
      activated({ mana: "{10}", tap: true, sacrifice: true, effects: [fx.gainLife(15)], label: "You gain 15 life" }),
    ],
  },
  "Putrid Pals": {
    abilities: [entersWith({ counters: 2, condition: DISAPPEAR, label: "Disappear — enters with two +1/+1 counters" })],
  },
  "Raph & Leo, Sibling Rivals": {
    abilities: [
      triggered(when.attacksSelf, [fx.untap(ref.target()), fx.extraCombat], {
        condition: cond.firstCombat,
        targets: [target.between(1, 2, target.creature("t", { attacking: true }))],
        label: "Untaps one or two attacking creatures; an additional combat phase",
      }),
    ],
  },
  "Raph & Mikey, Troublemakers": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.revealUntil({ types: ["Creature"] }, { to: "battlefield", tapped: true, attacking: true })],
        { label: "Reveal until a creature: it enters tapped and attacking" },
      ),
    ],
  },
  "Slithering Cryptid": {
    abilities: [triggered(when.entersSelf, [fx.createTokens(MUTAGEN)], { label: "A Mutagen" })],
  },
  "Splinter, Radical Rat": {
    abilities: [
      playerStatic({
        triggerMod: { effect: "again", sources: { types: ["Creature"], subtype: "Ninja", controller: "you" } },
        label: "Your Ninjas' triggered abilities trigger an additional time",
      }),
      activated({
        mana: "{1}{U}",
        targets: [target.permanent("t", ["Creature"], { subtype: "Ninja" }, "Ninja")],
        effects: [fx.modify(ref.target(), { addKeywords: ["unblockable"] })],
        label: "A Ninja can't be blocked this turn",
      }),
    ],
  },
  "Tainted Treats": {
    spell: spell(
      [target.permanent("t", ["Artifact", "Creature"], {}, "artifact or creature")],
      [
        fx.destroy(ref.target()),
        // Mana value from its last known information.
        ...fx.when(cond.refMatches(ref.target(), { maxManaValue: 4 }), fx.createTokens(FOOD)),
      ],
    ),
  },
  "Tokka & Rahzar, Terrible Twos": {
    rules: { cantBeCountered: true },
    abilities: [
      triggered(when.castSpell("any", { manaSpentBelowValue: true }), [fx.damage(3, ref.eventPlayer)], {
        label: "3 damage to the player who spent less than the mana value",
      }),
    ],
  },
};
