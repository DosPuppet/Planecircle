/**
 * Teenage Mutant Ninja Turtles — black cards (lot A). Flying, deathtouch, menace, lifelink, flash, first strike,
 * trample, sneak, kicker read from the text, equip and swampcycling are read from the
 * text.
 */
import type { TokenSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  chapter,
  cond,
  equipAbility,
  FOOD_ABILITY,
  fx,
  INSECT_WARRIOR,
  kicker,
  modal,
  mode,
  NINJA,
  ref,
  spell,
  staticAbility,
  target,
  triggered,
  when,
} from "./common";

/** Disappear: "if a permanent left the battlefield under your control this turn". */
const DISAPPEAR = cond.amountAtLeast(amount.turnEvents({ event: "zone", from: "battlefield", who: "you" }), 1);
/** 1/1 black Insect Warrior with flying (Lord Dregg). */
const FLYING_INSECT_WARRIOR: TokenSpec = { ...INSECT_WARRIOR, keywords: ["flying"] };
/** Copy of a card "except it isn't legendary and it's a Mutant in addition to its other types". */
const MUTANT_COPY = { nonlegendary: true, addSubtypes: ["Mutant"] };
const CREATURE_OR_ARTIFACT = { anyOf: [{ types: ["Creature" as const] }, { types: ["Artifact" as const] }] };

export const BLACK: Record<string, CardScript> = {
  "Anchovy & Banana Pizza": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.creature()],
        label: "Destroy a creature",
      }),
      FOOD_ABILITY,
    ],
  },
  "Armaggon, Future Shark": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.upTo(3, target.creature())],
        label: "Destroy up to three creatures",
      }),
    ],
  },
  "Bebop, Warthog Warrior": {
    abilities: [
      staticAbility({ subtype: "Rhino", controller: "you" }, { addKeywords: ["menace"] }, { label: "Your Rhinos have menace" }),
    ],
  },
  "The Cloning of Shredder": {
    abilities: [
      chapter(
        [1],
        [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x")), fx.copyToken(ref.stored("x"), MUTANT_COPY)],
        {
          targets: [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
          label: "Chapter I — Exile a creature card from your graveyard; nonlegendary Mutant token copy",
        },
      ),
      chapter([2, 3], [fx.copyToken(ref.linked, MUTANT_COPY)], {
        label: "Nonlegendary Mutant token copy of the exiled card",
      }),
    ],
  },
  "Death in the Family": { spell: spell([target.creature("t", { maxManaValue: 3 })], [fx.exile(ref.target())]) },
  "Foot Mystic": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(NINJA)], {
        condition: DISAPPEAR,
        label: "Disappear — a 1/1 Ninja",
      }),
    ],
  },
  "Insectoid Exterminator": {
    abilities: [triggered(when.yourEndStep, [fx.scry(1)], { condition: DISAPPEAR, label: "Disappear — scry 1" })],
  },
  "Lord Dregg, Insect Invader": {
    abilities: [
      triggered(when.yourEndStep, [fx.createTokens(FLYING_INSECT_WARRIOR)], {
        condition: DISAPPEAR,
        label: "Disappear — a 1/1 flying Insect Warrior",
      }),
      activated({
        mana: "{3}{G}",
        sacrificeOther: { filter: { token: true } },
        effects: [fx.draw(1)],
        label: "Sacrifice a token: draw a card",
      }),
    ],
  },
  "Madame Null, Power Broker": {
    abilities: [
      // "You may pay life equal to its power" (119.4: only if your life total is enough; the question is not asked
      // otherwise).
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true }),
        fx.when(
          cond.not(cond.amountGreater(amount.powerOf(ref.eventObject), amount.lifeTotal)),
          fx.mayPayLife(
            amount.powerOf(ref.eventObject),
            "Pay life equal to its power to put that many +1/+1 counters on it?",
            fx.addCounters(ref.eventObject, amount.powerOf(ref.eventObject)),
          ),
        ),
        { label: "Pay life equal to its power: that many +1/+1 counters" },
      ),
    ],
  },
  "Oroku Saki, Shredder Rising": {
    abilities: [
      triggered(when.combatDamageToPlayer, [fx.draw(1), fx.loseLife(1)], {
        label: "Draw a card, then lose 1 life",
      }),
    ],
  },
  "Pain 101": {
    spell: spell(
      [target.creature()],
      [
        fx.modify(ref.target(), {
          addKeywords: ["deathtouch"],
          addAbilities: [
            triggered(when.diesSelf, [fx.toBattlefield(ref.selfCard, { tapped: true })], {
              label: "Returns tapped under its owner's control",
            }),
          ],
        }),
      ],
    ),
  },
  "Paramecia Coloniex": {
    abilities: [
      triggered(when.entersSelf, [fx.mill(3)], { label: "Mill three cards" }),
      triggered(
        when.diesSelf,
        fx.may(
          "Exile Paramecia Coloniex to put a creature card from your graveyard on top of your library?",
          fx.exileCard(ref.selfCard, { name: "e" }),
          fx.when(
            cond.v("e"),
            fx.reflexive(
              [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
              [fx.moveTo(ref.target(), { to: "libraryTop" })],
            ),
          ),
        ),
        { label: "Exile it: a creature card on top of your library" },
      ),
    ],
  },
  "Savanti Romero, Time's Exile": {
    abilities: [
      triggered(
        when.yourCombat,
        [
          fx.addCounters(ref.self, 1),
          fx.draw(amount.countersOn(ref.self, "any")),
          fx.loseLife(amount.countersOn(ref.self, "any")),
        ],
        { label: "A +1/+1 counter, then draw X cards and lose X life (X: its counters)" },
      ),
    ],
  },
  "Shark Shredder, Killer Clone": {
    abilities: [
      triggered(
        when.combatDamageToPlayer,
        [fx.toBattlefield(ref.target(), { underYourControl: true, tapped: true, attacking: ref.eventPlayer })],
        {
          targets: [
            target.upTo(
              1,
              target.of(
                ref.eventPlayer,
                target.cardInGraveyard("t", { types: ["Creature"] }, "any", "creature card in the graveyard of that player"),
              ),
            ),
          ],
          label: "A creature card from their graveyard enters under your control, tapped and attacking",
        },
      ),
    ],
  },
  "Shredder, Unrelenting": {
    abilities: [
      triggered(when.entersSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature you control gains deathtouch",
      }),
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Another creature you control gains deathtouch",
      }),
    ],
  },
  "Shredder's Armor": {
    abilities: [
      staticAbility("attached", { power: 2, toughness: 1 }, { label: "+2/+1" }),
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach this Equipment to one of your creatures",
      }),
      equipAbility({
        sacrificeOther: { filter: { notTypes: ["Land"] } },
        oncePerTurn: true,
        label: "Equip — Sacrifice another nonland permanent",
      }),
    ],
  },
  "Shredder's Revenge": {
    spell: modal(
      mode("The player discards two cards", [target.player()], [fx.discard(2, ref.target())]),
      mode(
        "The player draws two cards and loses 2 life",
        [target.player()],
        [fx.draw(2, ref.target()), fx.loseLife(2, ref.target())],
      ),
    ),
  },
  "Shredder's Technique": {
    // Sneak {B}: read from the text. "If an enchantment was destroyed this way": the target was destroyed
    // (stored number) and it was an enchantment (last known information).
    spell: spell(
      [target.permanent("t", ["Creature", "Enchantment"], {}, "creature or enchantment")],
      [
        fx.destroy(ref.target(), "d"),
        ...fx.when(cond.all(cond.v("d"), cond.targetMatches("t", { types: ["Enchantment"] })), fx.loseLife(2)),
      ],
    ),
  },
  "South Wind Avatar": {
    abilities: [
      triggered(
        when.dies({ types: ["Creature"], controller: "you", other: true }),
        [fx.gainLife(amount.toughnessOf(ref.eventObject))],
        { label: "Gain life equal to its toughness" },
      ),
      triggered(when.gainLife, [fx.loseLife(1, ref.eachOpponent)], { label: "ctx:lifePoint|Each opponent loses 1 life" }),
    ],
  },
  "Splinter, Hamato Yoshi": {
    abilities: [
      staticAbility(
        { subtype: "Ninja", controller: "you", other: true },
        { power: 1, toughness: 1 },
        { label: "Your other Ninjas: +1/+1" },
      ),
    ],
  },
  "Splinter's Technique": {
    // Sneak {1}{B}: read from the text.
    spell: spell([], [fx.search({})]),
  },
  "Stomped by the Foot": {
    kicker: kicker("{0}", { sacrifice: CREATURE_OR_ARTIFACT }),
    spell: spell([target.creature()], [fx.pump(ref.target(), amount.kicked(-5, -2), amount.kicked(-5, -2))]),
  },
  "Super Shredder": {
    abilities: [
      triggered(when.leaves({ other: true }), [fx.addCounters(ref.self, 1)], {
        label: "Another permanent leaves: a +1/+1 counter",
      }),
    ],
  },
  "Tunnel Rats": {
    abilities: [
      activated({
        mana: "{4}{B}",
        fromGraveyard: true,
        effects: [fx.toBattlefield(ref.selfCard, { tapped: true })],
        label: "Returns tapped from the graveyard",
      }),
    ],
  },
};
