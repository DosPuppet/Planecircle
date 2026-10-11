/**
 * Commander: "I Am Ninja, Sneaking in the Shadows" deck (Dark Leo & Shredder; white and black; Fullmoon's list).
 * Ninjas and ninjutsu, unblockable or nearly unblockable attackers (Whispersilk Cloak, Access Tunnel, Sonic Screwdriver,
 * Shizo, Cover of Darkness, The Black Gate), copies (Helm of the Host, Legion Loyalty, Strionic Resonator), life loss
 * (Wound Reflection, Astarion). Tainted Field is with the other "tainted" lands (`edh/lands.ts`).
 */
import type { Amount, CardScript, ModeDef, ObjectFilter, Ref } from "@mtgx/engine";
import {
  ANY_COLOR,
  activated,
  amount,
  block,
  cond,
  fx,
  manaAbility,
  mode,
  myriadAbility,
  ninjutsu,
  protection,
  ref,
  staticAbility,
  TREASURE,
  target,
  triggered,
  triggeredModal,
  when,
} from "./common";

const CREATURE_YOU: ObjectFilter = { types: ["Creature"], controller: "you" };
/** Life lost this turn by the designated player. */
const lifeLostBy = (p: Ref): Amount => ({ kind: "turnEvents", query: { event: "lifeLoss", sum: true }, of: p });
/** "Can't be blocked this turn." */
const unblockable = (r: Ref = ref.target()) => fx.modify(r, { addKeywords: ["unblockable"] });

/** Akroma's Will: the two modes. */
const AKROMA_FLYING: ModeDef = mode(
  "Flying, vigilance, and double strike",
  [],
  [fx.modifyAll(CREATURE_YOU, { addKeywords: ["flying", "vigilance", "doubleStrike"] })],
);
const AKROMA_LIFELINK: ModeDef = mode(
  "Lifelink, indestructible, and protection from each color",
  [],
  [
    fx.modifyAll(CREATURE_YOU, {
      addKeywords: ["lifelink", "indestructible"],
      addProtections: [protection.from({ colors: ["W", "U", "B", "R", "G"] }, "Protection from each color")],
    }),
  ],
);

/** "A player with the most life or tied for most life" (opponents first: the suggestion). */
const MOST_LIFE = { kind: "mostLife" } as const;
const PLAYERS_WITH_MOST_LIFE: Ref = ref.union(
  ref.playersWhere(ref.eachOpponent, MOST_LIFE),
  ref.playersWhere(ref.you, MOST_LIFE),
);

export const EDH_DARK_LEO: Record<string, CardScript> = {
  // --- Ninjas -------------------------------------------------------------------------------------------------------
  "Ink-Eyes, Servant of Oni": {
    abilities: [
      ninjutsu("{3}{B}{B}"),
      triggered(
        when.combatDamageToPlayer,
        fx.may("Put that creature card onto the battlefield under your control?", [
          fx.toBattlefield(ref.target("c"), { underYourControl: true }),
        ]),
        {
          targets: [
            target.of(
              ref.eventPlayer,
              target.cardInGraveyard("c", { types: ["Creature"] }, "any", "creature card in that player's graveyard"),
            ),
          ],
          label: "A creature card from that player's graveyard onto the battlefield under your control",
        },
      ),
      activated({ mana: "{1}{B}", effects: [fx.regenerate(ref.self)], label: "Regenerate Ink-Eyes" }),
    ],
  },
  "Nashi, Moon Sage's Scion": {
    abilities: [
      ninjutsu("{3}{B}"),
      triggered(
        when.combatDamageToPlayer,
        [fx.exileTop(ref.eachPlayer, 1, "nashi"), fx.grantPlay(ref.stored("nashi"), { oneOf: true, payLifeManaValue: true })],
        {
          label:
            "Exile the top card of each library; you may play one of them this turn, a spell by paying life equal to its mana value",
        },
      ),
    ],
  },
  "Nezumi Prowler": {
    abilities: [
      ninjutsu("{1}{B}"),
      triggered(when.entersSelf, [fx.modify(ref.target(), { addKeywords: ["deathtouch", "lifelink"] })], {
        targets: [target.creature("t", { controller: "you" })],
        label: "A creature you control gains deathtouch and lifelink",
      }),
    ],
  },
  "Okiba-Gang Shinobi": {
    abilities: [
      ninjutsu("{3}{B}"),
      triggered(when.combatDamageToPlayer, [fx.discard(2, ref.eventPlayer)], { label: "That player discards two cards" }),
    ],
  },
  "Orochi Soul-Reaver": {
    abilities: [
      ninjutsu("{3}{B}"),
      triggered(
        when.combatDamageBatch(CREATURE_YOU),
        [fx.createTokens(TREASURE), fx.putFaceDown(ref.libraryTop(ref.eventPlayer))],
        { label: "A Treasure, and manifest the top card of that player's library" },
      ),
    ],
  },
  "Throat Slitter": {
    abilities: [
      ninjutsu("{2}{B}"),
      triggered(when.combatDamageToPlayer, [fx.destroy(ref.target())], {
        targets: [
          target.of(ref.eventPlayer, target.creature("t", { not: { colors: ["B"] } }), "nonblack creature that player controls"),
        ],
        label: "Destroy a nonblack creature that player controls",
      }),
    ],
  },
  Throatseeker: {
    abilities: [
      staticAbility(
        { types: ["Creature"], subtype: "Ninja", controller: "you", attacking: true, blocked: false },
        { addKeywords: ["lifelink"] },
        { label: "Unblocked attacking Ninjas you control have lifelink" },
      ),
    ],
  },

  // --- Other creatures ----------------------------------------------------------------------------------------------
  "Archetype of Courage": {
    abilities: [
      staticAbility(CREATURE_YOU, { addKeywords: ["firstStrike"] }, { label: "Creatures you control have first strike" }),
      staticAbility(
        { types: ["Creature"], controller: "opponent" },
        { forbidKeywords: ["firstStrike"] },
        { label: "Creatures your opponents control lose first strike and can't have or gain first strike" },
      ),
    ],
  },
  "Astarion, the Decadent": {
    // Deathtouch, lifelink: read from the text.
    abilities: [
      triggeredModal(
        when.yourEndStep,
        [
          mode(
            "Feed — an opponent loses life equal to the life they lost this turn",
            [target.player("o", "opponent")],
            [fx.loseLife(lifeLostBy(ref.target("o")), ref.target("o"))],
          ),
          mode(
            "Friends — gain life equal to the life you gained this turn",
            [],
            [fx.gainLife(amount.turnEvents({ event: "lifeGain", who: "you", sum: true }))],
          ),
        ],
        { label: "Feed or Friends" },
      ),
    ],
  },
  "Bloodline Pretender": {
    // Changeling: read from the text.
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      triggered(
        when.enters({ types: ["Creature"], controller: "you", other: true, chosen: "subtype" }),
        [fx.addCounters(ref.self, 1)],
        { label: "Another creature of the chosen type enters: a +1/+1 counter" },
      ),
    ],
  },
  "Changeling Outcast": {
    // Changeling: read from the text.
    keywords: ["cantBlock", "unblockable"],
  },
  "Leonardo, Worldly Warrior": {
    // Affinity for creatures; double strike (read from the text).
    costReduction: { generic: amount.count(CREATURE_YOU) },
  },
  "Mirror Entity": {
    // Changeling: read from the text.
    abilities: [
      activated({
        mana: "{X}",
        effects: [fx.setBasePTAll(CREATURE_YOU, amount.x), fx.modifyAll(CREATURE_YOU, { allCreatureTypes: true })],
        label: "Creatures you control have base power and toughness X/X and all creature types",
      }),
    ],
  },
  "Splinter, Aging Champion": {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        targets: [target.optional(target.creature("t", { tapped: true }))],
        label: "Destroy up to one tapped creature",
      }),
      triggered(when.leavesSelf, [fx.draw(1), fx.draw(1, ref.target("p"))], {
        targets: [target.player("p", "opponent")],
        label: "You and another target player each draw a card",
      }),
    ],
  },

  // --- Enchantments ----------------------------------------------------------------------------------------------
  "Cover of Darkness": {
    asEnters: [fx.chooseForSelf("creatureType")],
    abilities: [
      staticAbility(
        { types: ["Creature"], chosen: "subtype" },
        { addBlockRules: [block.fear] },
        { label: "Creatures of the chosen type have fear" },
      ),
    ],
  },
  "Legion Loyalty": {
    abilities: [staticAbility(CREATURE_YOU, { addAbilities: [myriadAbility()] }, { label: "Creatures you control have myriad" })],
  },
  "No Mercy": {
    abilities: [
      triggered(when.dealsDamage({ types: ["Creature"] }, { to: { players: "you" } }), [fx.destroy(ref.eventObject)], {
        label: "A creature deals damage to you: destroy it",
      }),
    ],
  },
  "Wound Reflection": {
    abilities: [
      triggered(
        when.eachEndStep,
        fx.forEachPlayer(ref.eachOpponent, (p) => [fx.loseLife(lifeLostBy(p), p)]),
        { label: "Each opponent loses life equal to the life they lost this turn" },
      ),
    ],
  },

  // --- Instants ------------------------------------------------------------------------------------------------------
  "Akroma's Will": {
    spell: {
      modes: [
        AKROMA_FLYING,
        AKROMA_LIFELINK,
        {
          label: "Both (you control a commander)",
          targets: [],
          effects: [...AKROMA_FLYING.effects, ...AKROMA_LIFELINK.effects],
          condition: cond.controls({ commander: true }),
        },
      ],
    },
  },

  // --- Artifacts ----------------------------------------------------------------------------------------------------
  "Helm of the Host": {
    // Equip {5}: read from the text.
    abilities: [
      // "That token gains haste": an effect on the token, not an exception of the copy (707.9b: a copy of it lacks haste).
      triggered(
        when.yourCombat,
        [
          fx.copyToken(ref.attached, { nonlegendary: true, store: "helm" }),
          fx.modify(ref.stored("helm"), { addKeywords: ["haste"] }, "permanent"),
        ],
        { label: "A nonlegendary token copy of the equipped creature, with haste" },
      ),
    ],
  },
  "Sonic Screwdriver": {
    abilities: [
      manaAbility(ANY_COLOR),
      activated({
        mana: "{1}",
        tap: true,
        targets: [target.permanent("t", ["Artifact"], { other: true }, "another artifact")],
        effects: [fx.untap(ref.target())],
        label: "Untap another artifact",
      }),
      activated({ mana: "{2}", tap: true, effects: [fx.scry(1)], label: "Scry 1" }),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature()],
        effects: [unblockable()],
        label: "A creature can't be blocked this turn",
      }),
    ],
  },
  "Strionic Resonator": {
    abilities: [
      activated({
        mana: "{2}",
        tap: true,
        targets: [
          {
            id: "t",
            label: "triggered ability you control",
            filter: { stackItems: { only: "triggered", controller: "you" } },
          },
        ],
        effects: [fx.copySpell(ref.target(), 1)],
        label: "Copy a triggered ability you control",
      }),
    ],
  },
  "Whispersilk Cloak": {
    // Equip {2}: read from the text.
    abilities: [staticAbility("attached", { addKeywords: ["unblockable", "shroud"] }, { label: "Can't be blocked and shroud" })],
  },

  // --- Lands --------------------------------------------------------------------------------------------------------
  "Access Tunnel": {
    abilities: [
      manaAbility("C"),
      activated({
        mana: "{3}",
        tap: true,
        targets: [target.creature("t", { maxPower: 3 })],
        effects: [unblockable()],
        label: "A creature with power 3 or less can't be blocked this turn",
      }),
    ],
  },
  "Shizo, Death's Storehouse": {
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{B}",
        tap: true,
        targets: [target.creature("t", { legendary: true })],
        effects: [fx.modify(ref.target(), { addBlockRules: [block.fear] })],
        label: "A legendary creature gains fear",
      }),
    ],
  },
  "The Black Gate": {
    // "You may pay 3 life. If you don't, it enters tapped": read from the text.
    abilities: [
      manaAbility("B"),
      activated({
        mana: "{1}{B}",
        tap: true,
        targets: [target.creature()],
        effects: [
          fx.chooseAmong(PLAYERS_WITH_MOST_LIFE, ref.you, "gate", {
            prompt: "Choose a player with the most life (or tied)",
          }),
          fx.modify(ref.target(), {
            addBlockRules: [block.notByPlayer(ref.stored("gate"), "Can't be blocked by creatures the chosen player controls")],
          }),
        ],
        label: "A creature can't be blocked by creatures of a player with the most life",
      }),
    ],
  },
};
