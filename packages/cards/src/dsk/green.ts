/** Duskmourn — green cards. */
import {
  activated,
  BASIC_LAND,
  type CardScript,
  cond,
  fx,
  manaAbility,
  modal,
  mode,
  ref,
  spell,
  staticAbility,
  survival,
  target,
  triggered,
  when,
} from "./common";

export const GREEN: Record<string, CardScript> = {
  "Altanak, the Thrice-Called": {
    abilities: [
      triggered({ on: "becomesTarget", who: "self", by: "opponent" }, [fx.draw(1)], { label: "Draw a card" }),
      activated({
        mana: "{1}{G}",
        fromHand: true,
        discardSelf: true,
        targets: [target.cardInGraveyard("t", { types: ["Land"] }, "you", "land card in your graveyard")],
        effects: [fx.toBattlefield(ref.target(), { tapped: true })],
        label: "Discard it: a land from your graveyard returns tapped",
      }),
    ],
  },
  "Balustrade Wurm": {
    rules: { cantBeCountered: true },
    abilities: [
      activated({
        mana: "{2}{G}{G}",
        fromGraveyard: true,
        sorcerySpeed: true,
        activationCondition: cond.delirium,
        effects: [fx.toBattlefield(ref.self, { counters: { kind: "finality", n: 1 } })],
        label: "Delirium — Returns with a finality counter",
      }),
    ],
  },
  "Bashful Beastie": {
    abilities: [triggered(when.diesSelf, [fx.manifestDread], { label: "Manifest dread" })],
  },
  "Break Down the Door": {
    spell: modal(
      mode("Exile an artifact", [target.permanent("a", ["Artifact"], {}, "artifact")], [fx.exile(ref.target("a"))]),
      mode("Exile an enchantment", [target.permanent("e", ["Enchantment"], {}, "enchantment")], [fx.exile(ref.target("e"))]),
      mode("Manifest dread", [], [fx.manifestDread]),
    ),
  },
  "Cautious Survivor": { abilities: [survival([fx.gainLife(2)], { label: "+2 life" })] },
  "Defiant Survivor": { abilities: [survival([fx.manifestDread], { label: "Manifest dread" })] },
  "Flesh Burrower": {
    abilities: [
      triggered(when.attacksSelf, [fx.pump(ref.target(), 0, 0, ["deathtouch"])], {
        targets: [target.creature("t", { controller: "you", other: true })],
        label: "Deathtouch",
      }),
    ],
  },
  "Frantic Strength": {
    enchant: { filter: { types: ["Creature"] }, label: "creature" },
    abilities: [staticAbility("attached", { power: 2, toughness: 2, addKeywords: ["trample"] }, { label: "+2/+2 and trample" })],
  },
  "Grasping Longneck": {
    abilities: [triggered(when.diesSelf, [fx.gainLife(2)], { label: "+2 life" })],
  },
  Greenhouse: {
    abilities: [
      staticAbility(
        { types: ["Land"], controller: "you" },
        { addAbilities: [manaAbility(["W", "U", "B", "R", "G"])] },
        { label: 'Your lands: "{T}: one mana of any color"' },
      ),
    ],
  },
  "Rickety Gazebo": {
    abilities: [
      triggered(
        when.unlockThisDoor,
        [
          fx.mill(4, ref.you, { name: "m" }),
          fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { count: 2, min: 0, pool: ref.stored("m") }),
        ],
        { label: "Mill 4, up to two permanent cards into your hand" },
      ),
    ],
  },
  "Horrid Vigor": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 0, 0, ["deathtouch", "indestructible"])]),
  },
  "House Cartographer": {
    abilities: [survival([fx.revealUntil({ types: ["Land"] })], { label: "Reveal until a land" })],
  },
  "Kona, Rescue Beastie": {
    abilities: [
      survival(
        [fx.pickFromZone("hand", { permanent: true }, { to: "battlefield" }, { min: 0, prompt: "A permanent from your hand" })],
        {
          label: "Put a permanent from your hand onto the battlefield",
        },
      ),
    ],
  },
  "Manifest Dread": { spell: spell([], [fx.manifestDread]) },
  "Patchwork Beastie": {
    abilities: [
      staticAbility(
        "self",
        { addKeywords: ["cantAttack", "cantBlock"] },
        {
          condition: cond.not(cond.delirium),
          label: "Delirium — can't attack or block without delirium",
        },
      ),
      triggered(when.yourUpkeep, [...fx.may("Mill a card?", fx.mill(1))], { label: "Mill a card" }),
    ],
  },
  "Spineseeker Centipede": {
    abilities: [
      triggered(when.entersSelf, [fx.search(BASIC_LAND)], { label: "Search for a basic land" }),
      staticAbility(
        "self",
        { power: 1, toughness: 2, addKeywords: ["vigilance"] },
        {
          condition: cond.delirium,
          label: "Delirium — +1/+2 and vigilance",
        },
      ),
    ],
  },
  "Under the Skin": {
    spell: spell(
      [],
      [
        fx.manifestDread,
        fx.pickFromZone("graveyard", { permanent: true }, { to: "hand" }, { min: 0, prompt: "A permanent card" }),
      ],
    ),
  },
  "Wary Watchdog": {
    abilities: [
      triggered(when.entersSelf, [fx.surveil(1)], { label: "Surveil 1" }),
      triggered(when.diesSelf, [fx.surveil(1)], { label: "Surveil 1" }),
    ],
  },
  "Wickerfolk Thresher": {
    abilities: [
      triggered(when.attacksSelf, [fx.lookAtTop(1, { filter: { types: ["Land"] }, to: { to: "battlefield" }, rest: "hand" })], {
        condition: cond.delirium,
        label: "Delirium — a land from the top onto the battlefield, otherwise into your hand",
      }),
    ],
  },
};
