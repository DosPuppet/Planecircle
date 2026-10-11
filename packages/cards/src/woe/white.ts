/**
 * Wilds of Eldraine — white cards (lot A). Adventures have one entry per face (the creature under its name, the
 * Adventure spell under the name of the Adventure); Bargain is read from the text (`cond.kicked`).
 */
import type { ObjectFilter, TargetSpec, TokenSpec, TriggerSpec } from "@mtgx/engine";
import {
  activated,
  amount,
  block,
  type CardScript,
  CELEBRATION,
  CURSED_ROLE,
  chapter,
  cmp,
  cond,
  createRole,
  FOOD,
  fx,
  INSTANT_SORCERY,
  KNIGHT_VIGILANCE,
  modal,
  mode,
  playerStatic,
  ROYAL_ROLE,
  ref,
  SORCERER_ROLE,
  spell,
  staticAbility,
  TREASURE,
  target,
  triggered,
  when,
  YOUNG_HERO_ROLE,
} from "./common";

const YOUR_CREATURES: ObjectFilter = { types: ["Creature"], controller: "you" };
const ENCHANT_CREATURE = { filter: { types: ["Creature" as const] }, label: "creature" };
const YOUR_CREATURE = () => target.creature("t", { controller: "you" });
const OPP_CREATURE = () => target.creature("t", { controller: "opponent" });
/** "Whenever an enchantment you control is put into a graveyard from the battlefield" */
const YOUR_ENCHANTMENT_TO_GRAVEYARD: TriggerSpec = {
  on: "leaves",
  who: { types: ["Enchantment"], controller: "you" },
  to: "graveyard",
};
/** "Whenever an enchantment you control enters" */
const YOUR_ENCHANTMENT_ENTERS = when.enters({ types: ["Enchantment"], controller: "you" });

/** Bird: 1/1 white creature with flying. */
const BIRD: TokenSpec = {
  name: "Bird",
  colors: ["W"],
  types: ["Creature"],
  subtypes: ["Bird"],
  power: 1,
  toughness: 1,
  keywords: ["flying"],
};
/** Mouse: 1/1 white creature. */
const MOUSE: TokenSpec = { name: "Mouse", colors: ["W"], types: ["Creature"], subtypes: ["Mouse"], power: 1, toughness: 1 };

const TOKEN_YOU_CONTROL: TargetSpec = {
  id: "t",
  label: "token you control",
  filter: { objects: { token: true, controller: "you" } },
};

export const WHITE: Record<string, CardScript> = {
  "Solitary Sanctuary": {
    abilities: [
      triggered(when.entersSelf, [fx.tap(ref.target()), fx.counters(ref.target(), "stun")], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Tap a creature an opponent controls, stun counter",
      }),
      triggered(
        { on: "taps", who: { types: ["Creature"], controller: "opponent" }, byYou: true },
        [fx.addCounters(ref.target(), 1)],
        {
          targets: [target.creature("t", { controller: "you" })],
          label: "You tap a creature an opponent controls: a +1/+1 counter on a creature you control",
        },
      ),
    ],
  },
  // Flying read from the text.
  "Archon of the Wild Rose": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", other: true, enchanted: "byYou" },
        { setPower: 4, setToughness: 4, addKeywords: ["flying"] },
        { label: "Your other creatures enchanted by your Auras: base 4/4, with flying" },
      ),
    ],
  },
  "A Tale for the Ages": {
    abilities: [
      staticAbility(
        { types: ["Creature"], controller: "you", enchanted: true },
        { power: 2, toughness: 2 },
        { label: "Your enchanted creatures: +2/+2" },
      ),
    ],
  },
  "Archon's Glory": {
    spell: spell(
      [target.creature()],
      [fx.pump(ref.target(), 2, 2), ...fx.when(cond.kicked, fx.pump(ref.target(), 0, 0, ["flying", "lifelink"]))],
    ),
  },
  "Armory Mice": {
    abilities: [staticAbility("self", { toughness: 2 }, { condition: CELEBRATION, label: "Celebration: +0/+2" })],
  },
  // Adventure: the creature is vanilla.
  "Besotted Knight": {},
  "Betroth the Beast": { spell: spell([YOUR_CREATURE()], [...createRole(ROYAL_ROLE)]) },
  "Break the Spell": {
    spell: spell(
      [target.permanent("t", ["Enchantment"], {}, "enchantment")],
      [
        fx.destroy(ref.target()),
        // "destroyed this way": the target no longer exists (`filtered` keeps only the objects present); its last known
        // information tells whether you controlled it or it was a token.
        ...fx.when(
          cond.all(
            cond.not(cond.refMatches(ref.filtered(ref.target(), {}), {})),
            cond.refMatches(ref.target(), { anyOf: [{ controller: "you" }, { token: true }] }),
          ),
          fx.draw(1),
        ),
      ],
    ),
  },
  "Charmed Clothier": {
    abilities: [
      triggered(when.entersSelf, createRole(ROYAL_ROLE), {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "A Royal Role on another of your creatures",
      }),
    ],
  },
  "Cheeky House-Mouse": {},
  "Squeak By": {
    spell: spell(
      [YOUR_CREATURE()],
      [
        fx.pump(ref.target(), 1, 1),
        fx.modify(ref.target(), {
          addBlockRules: [block.notBy({ minPower: 3 }, "Can't be blocked by creatures with power 3 or greater")],
        }),
      ],
    ),
  },
  "Cooped Up": {
    enchant: ENCHANT_CREATURE,
    abilities: [
      staticAbility("attached", { addKeywords: ["cantAttack", "cantBlock"] }, { label: "Can't attack or block" }),
      activated({ mana: "{2}{W}", effects: [fx.exile(ref.attached)], label: "Exile the enchanted creature" }),
    ],
  },
  "Cursed Courtier": {
    abilities: [triggered(when.entersSelf, createRole(CURSED_ROLE, ref.self), { label: "A Cursed Role on it" })],
  },
  "Discerning Financier": {
    abilities: [
      triggered(when.yourUpkeep, [fx.createTokens(TREASURE)], {
        condition: cond.opponentHasMore("lands"),
        label: "An opponent controls more lands: a Treasure",
      }),
      // "Choose another player" (without targeting): they gain control of the targeted Treasure.
      activated({
        mana: "{2}{W}",
        targets: [target.permanent("t", ["Artifact"], { subtype: "Treasure", controller: "you" }, "Treasure you control")],
        effects: [
          fx.chooseOpponent("p", { prompt: "Choose the player who gains control of the Treasure" }),
          fx.giveControl(ref.target(), ref.stored("p")),
          fx.draw(1),
        ],
        label: "Give a Treasure, draw",
      }),
    ],
  },
  "Dutiful Griffin": {
    abilities: [
      activated({
        mana: "{2}{W}",
        sacrificeOther: { filter: { types: ["Enchantment"] }, count: 2 },
        fromGraveyard: true,
        effects: [fx.toHand(ref.selfCard)],
        label: "Returns from the graveyard to your hand",
      }),
    ],
  },
  "Eerie Interference": {
    spell: spell(
      [],
      [
        fx.thisTurn({ replacement: { event: "damage", to: "you", source: { types: ["Creature"] }, modify: { prevent: true } } }),
        fx.thisTurn({
          replacement: {
            event: "damage",
            to: "yourSide",
            toFilter: { types: ["Creature"] },
            source: { types: ["Creature"] },
            modify: { prevent: true },
          },
        }),
      ],
    ),
  },
  // "Choose a number between 0 and 10" as it resolves; suggestion: one more than the greatest power among your
  // creatures (none of them is destroyed).
  "Expel the Interlopers": {
    spell: spell(
      [],
      [
        fx.chooseNumbers(ref.you, "n", 10, {
          prompt: "Choose a number between 0 and 10",
          suggested: amount.plus(amount.maxPower({ types: ["Creature"], controller: "you" }), 1),
        }),
        fx.destroyAll({ types: ["Creature"], compare: [cmp.power(">=", amount.numberChosen("n"))] }),
      ],
    ),
  },
  "Frostbridge Guard": {
    abilities: [
      activated({
        mana: "{2}{W}",
        tap: true,
        targets: [target.creature()],
        effects: [fx.tap(ref.target())],
        label: "Tap a creature",
      }),
    ],
  },
  "Gallant Pie-Wielder": {
    abilities: [
      staticAbility("self", { addKeywords: ["doubleStrike"] }, { condition: CELEBRATION, label: "Celebration: double strike" }),
    ],
  },
  "Glass Casket": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.creature("t", { controller: "opponent", maxManaValue: 3 })],
        label: "Exiles a creature an opponent controls with MV 3 or less",
      }),
    ],
  },
  "Hopeful Vigil": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(KNIGHT_VIGILANCE)], { label: "A 2/2 Knight with vigilance" }),
      triggered(when.putIntoGraveyardSelf, [fx.scry(2)], { label: "Scry 2" }),
      activated({ mana: "{2}{W}", effects: [fx.sacrificeIt(ref.self)], label: "Sacrifice this enchantment" }),
    ],
  },
  "Kellan's Lightblades": {
    spell: spell(
      [target.creature("t", { anyOf: [{ attacking: true }, { blocking: true }] })],
      [...fx.when(cond.kicked, fx.destroy(ref.target())), ...fx.when(cond.not(cond.kicked), fx.damage(3, ref.target()))],
    ),
  },
  "Knight of Doves": {
    abilities: [triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.createTokens(BIRD)], { label: "A 1/1 flying Bird" })],
  },
  "Moment of Valor": {
    spell: modal(
      mode(
        "Untap a creature: +1/+0 and indestructible",
        [target.creature()],
        [fx.untap(ref.target()), fx.pump(ref.target(), 1, 0, ["indestructible"])],
      ),
      mode("Destroy a creature with power 4 or greater", [target.creature("t", { minPower: 4 })], [fx.destroy(ref.target())]),
    ),
  },
  "Moonshaker Cavalry": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pumpAll(YOUR_CREATURES, amount.count(YOUR_CREATURES), amount.count(YOUR_CREATURES), ["flying"])],
        { label: "Your creatures: flying and +X/+X" },
      ),
    ],
  },
  "Plunge into Winter": {
    spell: spell([target.upTo(1, target.creature())], [fx.tap(ref.target()), fx.scry(1), fx.draw(1)]),
  },
  "The Princess Takes Flight": {
    abilities: [
      chapter([1], [fx.exileCard(ref.target(), { name: "x" }), fx.link(ref.stored("x"))], {
        targets: [target.upTo(1, target.creature())],
        label: "Chapter I — Exile up to one creature",
      }),
      chapter([2], [fx.pump(ref.target(), 2, 2, ["flying"])], {
        targets: [YOUR_CREATURE()],
        label: "Chapter II — +2/+2 and flying",
      }),
      chapter([3], [fx.toBattlefield(ref.linked)], { label: "Chapter III — The exiled card returns" }),
    ],
  },
  "Protective Parents": {
    abilities: [
      triggered(when.diesSelf, createRole(YOUNG_HERO_ROLE), {
        targets: [target.upTo(1, target.creature("t", { controller: "you" }))],
        label: "A Young Hero Role",
      }),
    ],
  },
  "Regal Bunnicorn": { cda: { pt: amount.count({ notTypes: ["Land"], controller: "you" }) } },
  "Return Triumphant": {
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"], maxManaValue: 3 }, "you", "creature card with MV 3 or less")],
      [fx.moveTo(ref.target(), { to: "battlefield" }, { name: "r" }), ...createRole(YOUNG_HERO_ROLE, ref.stored("r"))],
    ),
  },
  "Rimefur Reindeer": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_ENTERS, [fx.tap(ref.target())], {
        targets: [OPP_CREATURE()],
        label: "Tap a creature an opponent controls",
      }),
    ],
  },
  "Savior of the Sleeping": {
    abilities: [triggered(YOUR_ENCHANTMENT_TO_GRAVEYARD, [fx.addCounters(ref.self, 1)], { label: "A +1/+1 counter" })],
  },
  "Slumbering Keepguard": {
    abilities: [
      triggered(YOUR_ENCHANTMENT_ENTERS, [fx.scry(1)], { label: "Scry 1" }),
      activated({
        mana: "{2}{W}",
        effects: [
          fx.pump(
            ref.self,
            amount.count({ types: ["Enchantment"], controller: "you" }),
            amount.count({ types: ["Enchantment"], controller: "you" }),
          ),
        ],
        label: "+1/+1 for each enchantment you control",
      }),
    ],
  },
  "Spellbook Vendor": {
    abilities: [
      triggered(
        when.yourCombat,
        fx.mayPay("{1}", "Pay {1} for a Sorcerer Role?", fx.reflexive([YOUR_CREATURE()], createRole(SORCERER_ROLE))),
        { label: "{1}: a Sorcerer Role" },
      ),
    ],
  },
  "Stockpiling Celebrant": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.when(cond.targetChosen("t"), fx.may("Return this permanent to hand?", fx.bounce(ref.target()), fx.scry(2))),
        {
          targets: [target.optional(target.nonland("t", { controller: "you", other: true }, "other nonland permanent"))],
          label: "Return a permanent, scry 2",
        },
      ),
    ],
  },
  "Three Blind Mice": {
    abilities: [
      chapter([1], [fx.createTokens(MOUSE)], { label: "Chapter I — A 1/1 Mouse" }),
      chapter([2, 3], [fx.copyToken(ref.target())], {
        targets: [TOKEN_YOU_CONTROL],
        label: "Chapters II, III — Copy one of your tokens",
      }),
      chapter([4], [fx.pumpAll(YOUR_CREATURES, 1, 1, ["vigilance"])], {
        label: "Chapter IV — Your creatures: +1/+1 and vigilance",
      }),
    ],
  },
  "Tuinvale Guide": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, addKeywords: ["lifelink"] },
        { condition: CELEBRATION, label: "Celebration: +1/+0 and lifelink" },
      ),
    ],
  },
  "Unassuming Sage": {
    abilities: [
      triggered(when.entersSelf, fx.mayPay("{2}", "Pay {2} for a Sorcerer Role?", ...createRole(SORCERER_ROLE, ref.self)), {
        label: "{2}: a Sorcerer Role",
      }),
    ],
  },
  "Virtue of Loyalty": {
    abilities: [
      triggered(when.yourEndStep, [fx.addCountersAll(YOUR_CREATURES), fx.untapAll(YOUR_CREATURES)], {
        label: "A +1/+1 counter on each of your creatures, then untap them",
      }),
    ],
  },
  "Ardenvale Fealty": { spell: spell([], [fx.createTokens(KNIGHT_VIGILANCE)]) },
  "Werefox Bodyguard": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target())], {
        targets: [target.upTo(1, target.creature("t", { other: true, notSubtype: "Fox" }))],
        label: "Exiles another non-Fox creature",
      }),
      activated({ mana: "{1}{W}", sacrifice: true, effects: [fx.gainLife(2)], label: "Gain 2 life" }),
    ],
  },
  "Heartflame Duelist": {
    abilities: [
      playerStatic({
        spellKeywords: { filter: INSTANT_SORCERY, keywords: ["lifelink"] },
        label: "Your instants and sorceries have lifelink",
      }),
    ],
  },
  "Heartflame Slash": { spell: spell([target.any()], [fx.damage(3, ref.target())]) },
  "Pollen-Shield Hare": {
    abilities: [
      staticAbility(
        { types: ["Creature"], token: true, controller: "you" },
        { power: 1, toughness: 1 },
        { label: "Your creature tokens: +1/+1" },
      ),
    ],
  },
  "Hare Raising": {
    spell: spell(
      [YOUR_CREATURE()],
      [fx.pump(ref.target(), amount.count(YOUR_CREATURES), amount.count(YOUR_CREATURES), ["vigilance"])],
    ),
  },
  "Shrouded Shepherd": {
    abilities: [triggered(when.entersSelf, [fx.pump(ref.target(), 2, 2)], { targets: [YOUR_CREATURE()], label: "+2/+2" })],
  },
  "Cleave Shadows": { spell: spell([], [fx.pumpAll({ types: ["Creature"], controller: "opponent" }, -1, -1)]) },
  "Woodland Acolyte": { abilities: [triggered(when.entersSelf, [fx.draw(1)], { label: "Draw a card" })] },
  "Mend the Wilds": {
    spell: spell(
      [target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard")],
      [fx.moveTo(ref.target(), { to: "libraryTop" })],
    ),
  },
  "Food Coma": {
    abilities: [
      triggered(when.entersSelf, [fx.exileUntilLeaves(ref.target()), fx.createTokens(FOOD)], {
        targets: [OPP_CREATURE()],
        label: "Exiles a creature an opponent controls, a Food",
      }),
    ],
  },
  "Lady of Laughter": {
    abilities: [triggered(when.yourEndStep, [fx.draw(1)], { condition: CELEBRATION, label: "Celebration: draw a card" })],
  },
  "Pests of Honor": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.self, 1)], {
        condition: CELEBRATION,
        label: "Celebration: a +1/+1 counter",
      }),
    ],
  },
};
