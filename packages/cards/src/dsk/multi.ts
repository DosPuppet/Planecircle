/** Duskmourn — multicolored cards, artifacts and lands. */
import type { ManaType } from "@mtgx/engine";
import {
  activated,
  amount,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cond,
  eerie,
  entersWith,
  fastLand,
  flashback,
  fx,
  GREMLIN,
  glimmer,
  INSECT,
  manaAbility,
  playerStatic,
  ref,
  spell,
  staticAbility,
  survival,
  target,
  triggered,
  when,
} from "./common";

/** Verge: "{T}: Add [A]"; "{T}: Add [B]. Activate only if you control a [type] or a [type]". */
const verge = (a: ManaType, b: ManaType, types: [string, string]): CardScript => ({
  abilities: [
    manaAbility(a),
    manaAbility(b, 1, { condition: cond.controls({ anyOf: [{ subtype: types[0] }, { subtype: types[1] }] }) }),
  ],
});

const SMALL_CREATURES = { ...CREATURE_YOU_CONTROL, maxPower: 2 };

export const MULTI: Record<string, CardScript> = {
  "Arabella, Abandoned Doll": {
    abilities: [
      triggered(
        when.attacksSelf,
        [fx.damage(amount.count(SMALL_CREATURES), ref.eachOpponent), fx.gainLife(amount.count(SMALL_CREATURES))],
        { label: "X damage to each opponent, +X life" },
      ),
    ],
  },
  "Baseball Bat": {
    abilities: [
      triggered(when.entersSelf, [fx.attach(ref.target())], {
        targets: [target.creature("t", { controller: "you" })],
        label: "Attach it to a creature",
      }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
      triggered(when.attacks({ attached: "host" }), [fx.tap(ref.target())], {
        targets: [target.upTo(1, target.creature())],
        label: "Tap a creature",
      }),
    ],
  },
  Broodspinner: {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(2)], { label: "Surveil 2" }),
      activated({
        mana: "{4}{B}{G}",
        tap: true,
        sacrifice: true,
        effects: [fx.createTokens(INSECT, amount.cardTypesInGraveyard)],
        label: "1/1 flying Insects (one for each card type in your graveyard)",
      }),
    ],
  },
  "Drag to the Roots": {
    costReduction: { generic: 2, condition: cond.delirium },
    spell: spell([target.nonland()], [fx.destroy(ref.target())]),
  },
  "Fear of Infinity": {
    keywords: ["cantBlock"],
    abilities: [
      eerie([...fx.may("Return Fear of Infinity to your hand?", fx.toHand(ref.selfCard))], {
        fromGraveyard: true,
        label: "Returns from the graveyard to your hand",
      }),
    ],
  },
  "Gremlin Tamer": {
    abilities: [eerie([fx.createTokens(GREMLIN)], { label: "1/1 Gremlin token" })],
  },
  "Intruding Soulrager": {
    abilities: [
      activated({
        tap: true,
        sacrificeOther: { filter: { subtype: "Room" } },
        effects: [fx.damage(2, ref.eachOpponent), fx.draw(1)],
        label: "Sacrifice a Room: 2 damage to each opponent, draw",
      }),
    ],
  },
  "The Jolly Balloon Man": {
    abilities: [
      activated({
        mana: "{1}",
        tap: true,
        sorcerySpeed: true,
        targets: [target.creature("t", { controller: "you", other: true })],
        effects: [
          fx.copyToken(ref.target(), {
            pt: 1,
            addColors: ["R"],
            addSubtypes: ["Balloon"],
            addKeywords: ["flying", "haste"],
            sacrificeAtEndStep: true,
          }),
        ],
        label: "1/1 flying Balloon copy",
      }),
    ],
  },
  "Midnight Mayhem": {
    spell: spell(
      [],
      [fx.createTokens(GREMLIN, 3), fx.pumpAll({ subtype: "Gremlin", controller: "you" }, 0, 0, ["menace", "lifelink", "haste"])],
    ),
  },
  "Peer Past the Veil": {
    spell: spell([], [fx.discard(amount.cardsIn("hand")), fx.draw(amount.cardTypesInGraveyard)]),
  },
  "Restricted Office": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.destroyAll({ types: ["Creature"], minPower: 3 })], {
        label: "Destroy the creatures with power 3 or greater",
      }),
    ],
  },
  "Lecture Hall": {
    abilities: [
      staticAbility(
        { controller: "you", other: true },
        { addKeywords: ["hexproof"] },
        { label: "Your other permanents have hexproof" },
      ),
    ],
  },
  "Rite of the Moth": {
    castOptions: [flashback("{3}{W}{W}{B}")],
    spell: spell(
      [target.cardInGraveyard("t", { types: ["Creature"] }, "you", "creature card in your graveyard")],
      [fx.toBattlefield(ref.target(), { counters: { kind: "finality", n: 1 } })],
    ),
  },
  "Roaring Furnace": {
    abilities: [
      triggered(when.unlockThisDoor, [fx.damage(amount.cardsIn("hand"), ref.target())], {
        targets: [target.creature("t", { controller: "opponent" })],
        label: "Damage equal to the number of cards in your hand",
      }),
    ],
  },
  "Steaming Sauna": {
    abilities: [
      playerStatic({ maxHandSize: "none", label: "No maximum hand size" }),
      triggered(when.yourEndStep, [fx.draw(1)], { label: "Draw a card" }),
    ],
  },
  "Shrewd Storyteller": {
    abilities: [survival([fx.addCounters(ref.target(), 1)], { targets: [target.creature()], label: "+1/+1 counter" })],
  },
  Shroudstomper: {
    abilities: [
      triggered(when.entersSelf, [...fx.drain(2), fx.draw(1)], { label: "Drain 2, draw" }),
      triggered(when.attacksSelf, [...fx.drain(2), fx.draw(1)], { label: "Drain 2, draw" }),
    ],
  },
  "Skullsnap Nuisance": { abilities: [eerie([fx.surveil(1)], { label: "Surveil 1" })] },
  "The Swarmweaver": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(INSECT, 2)], { label: "Two 1/1 flying Insects" }),
      staticAbility(
        { ...CREATURE_YOU_CONTROL, anySubtype: ["Insect", "Spider"] },
        { power: 1, toughness: 1, addKeywords: ["deathtouch"] },
        { condition: cond.delirium, label: "Delirium — Insects and Spiders +1/+1, deathtouch" },
      ),
    ],
  },
  "Wildfire Wickerfolk": {
    abilities: [
      staticAbility(
        "self",
        { power: 1, toughness: 1, addKeywords: ["trample"] },
        {
          condition: cond.delirium,
          label: "Delirium — +1/+1 and trample",
        },
      ),
    ],
  },

  // Artifacts
  "Attack-in-the-Box": {
    abilities: [
      triggered(
        when.attacksSelf,
        [...fx.may("+4/+0 (sacrificed at the next end step)?", fx.pump(ref.self, 4, 0), fx.delayed([fx.sacrificeIt(ref.self)]))],
        { label: "+4/+0, then sacrificed" },
      ),
    ],
  },
  "Bear Trap": {
    abilities: [
      activated({
        mana: "{3}",
        tap: true,
        sacrifice: true,
        targets: [target.creature()],
        effects: [fx.damage(3, ref.target())],
        label: "3 damage to a creature",
      }),
    ],
  },
  "Friendly Teddy": {
    abilities: [triggered(when.diesSelf, [fx.draw(1, ref.eachPlayer)], { label: "Each player draws" })],
  },
  Glimmerlight: {
    abilities: [
      triggered(when.entersSelf, [glimmer()], { label: "1/1 Glimmer token" }),
      staticAbility("attached", { power: 1, toughness: 1 }, { label: "+1/+1" }),
    ],
  },
  "Malevolent Chandelier": {
    abilities: [
      activated({
        mana: "{2}",
        sorcerySpeed: true,
        targets: [target.cardInGraveyard("t", {}, "any")],
        effects: [fx.moveTo(ref.target(), { to: "libraryBottom" })],
        label: "A card from a graveyard to the bottom of its library",
      }),
    ],
  },

  // Lands
  "Abandoned Campground": fastLand("W", "U"),
  "Bleeding Woods": fastLand("R", "G"),
  "Etched Cornfield": fastLand("G", "W"),
  "Lakeside Shack": fastLand("G", "U"),
  "Murky Sewer": fastLand("U", "B"),
  "Neglected Manor": fastLand("W", "B"),
  "Peculiar Lighthouse": fastLand("U", "R"),
  "Raucous Carnival": fastLand("R", "W"),
  "Razortrap Gorge": fastLand("B", "R"),
  "Strangled Cemetery": fastLand("B", "G"),
  "Blazemire Verge": verge("B", "R", ["Swamp", "Mountain"]),
  "Floodfarm Verge": verge("W", "U", ["Plains", "Island"]),
  "Gloomlake Verge": verge("U", "B", ["Island", "Swamp"]),
  "Hushwood Verge": verge("G", "W", ["Forest", "Plains"]),
  "Thornspire Verge": verge("R", "G", ["Mountain", "Forest"]),
  "Valgavoth's Lair": {
    asEnters: [fx.chooseForSelf("color")],
    abilities: [entersWith({ tapped: true }), manaAbility(["W", "U", "B", "R", "G"], 1, { produceChosen: true })],
  },
};
