/** Bloomburrow — green cards. */
import {
  activated,
  amount,
  BASIC_LAND,
  block,
  blockAbility,
  type CardScript,
  CREATURE_YOU_CONTROL,
  cmp,
  cond,
  cost,
  entersAndSacrificed,
  eventReplacement,
  expend,
  FOOD,
  FOOD_ABILITY,
  fx,
  kin,
  manaAbility,
  modal,
  mode,
  pawprint,
  ref,
  spell,
  staticAbility,
  TOKEN_YOU,
  target,
  targetObj,
  triggered,
  triggeredModal,
  wardAbility,
  when,
} from "./common";

const OPP_CREATURE = (id = "u") => targetObj(id, { types: ["Creature"], controller: "opponent" }, "creature you don't control");
const SQUIRREL_OR_FOOD = {
  controller: "you" as const,
  anyOf: [{ types: ["Creature" as const], subtype: "Squirrel" }, { subtype: "Food" }],
};

export const GREEN: Record<string, CardScript> = {
  "Bakersbane Duo": {
    abilities: [
      triggered(when.entersSelf, [fx.createTokens(FOOD)], { label: "Food" }),
      expend(4, [fx.pump(ref.self, 1, 1)], { label: "+1/+1" }),
    ],
  },
  "Bark-Knuckle Boxer": {
    abilities: [expend(4, [fx.pump(ref.self, 0, 0, ["indestructible"])], { label: "Indestructible" })],
  },
  "Brambleguard Veteran": {
    abilities: [expend(4, [fx.pumpAll(kin(["Raccoon"]), 1, 1, ["vigilance"])], { label: "Raccoons +1/+1 and vigilance" })],
  },
  "Bushy Bodyguard": {
    abilities: [
      triggered(when.entersSelf, fx.mayForage("Fourrager pour deux marqueurs +1/+1 ?", fx.addCounters(ref.self, 2)), {
        label: "Forage: two +1/+1 counters",
      }),
    ],
  },
  "Cache Grab": {
    spell: spell(
      [],
      [
        fx.mill(4, ref.you, { name: "m" }),
        fx.pickFromZone(
          "graveyard",
          { permanent: true },
          { to: "hand" },
          {
            pool: ref.stored("m"),
            min: 0,
            store: "p",
            prompt: "Permanent card to put into your hand",
          },
        ),
        ...fx.when(
          cond.any(
            cond.controls({ types: ["Creature"], subtype: "Squirrel" }),
            cond.refMatches(ref.stored("p"), { subtype: "Squirrel" }),
          ),
          fx.createTokens(FOOD),
        ),
      ],
    ),
  },
  "Clifftop Lookout": {
    abilities: [
      triggered(when.entersSelf, [fx.revealUntil({ types: ["Land"] }, { to: "battlefield", tapped: true })], {
        label: "Reveals up to one land (onto the battlefield)",
      }),
    ],
  },
  "Curious Forager": {
    abilities: [
      triggered(
        when.entersSelf,
        fx.mayForage(
          "Forage to get back a permanent card?",
          fx.reflexive(
            [target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard")],
            [fx.toHand(ref.target())],
          ),
        ),
        { label: "Forage: gets back a permanent" },
      ),
    ],
  },
  "Druid of the Spade": {
    abilities: [
      staticAbility(
        "self",
        { power: 2, addKeywords: ["trample"] },
        { condition: cond.controls({ token: true }), label: "+2/+0, trample" },
      ),
    ],
  },
  "Fecund Greenshell": {
    abilities: [
      staticAbility(
        CREATURE_YOU_CONTROL,
        { power: 2, toughness: 2 },
        {
          condition: cond.controls({ types: ["Land"] }, 10),
          label: "Ten lands: +2/+2",
        },
      ),
      triggered(
        when.enters({ types: ["Creature"], controller: "you", compare: [cmp.toughness(">", "power")] }),
        [
          // A declined land stays on the library; a nonland card goes to the hand.
          fx.lookAtTop(1, { filter: { types: ["Land"] }, to: { to: "battlefield", tapped: true }, rest: "top", store: "g" }),
          ...fx.when(
            cond.all(cond.not(cond.v("g")), cond.not(cond.refMatches(ref.libraryTop(ref.you), { types: ["Land"] }))),
            fx.toHand(ref.libraryTop(ref.you)),
          ),
        ],
        { label: "Top card: land onto the battlefield, otherwise into your hand" },
      ),
    ],
  },
  "For the Common Good": {
    spell: spell(
      [targetObj("t", TOKEN_YOU, "token you control")],
      [
        fx.copyToken(ref.target(), { count: amount.x }),
        fx.modifyAll({ token: true, controller: "you" }, { addKeywords: ["indestructible"] }, "untilYourNextTurn"),
        fx.gainLife(amount.count(TOKEN_YOU)),
      ],
    ),
  },
  "Hazardroot Herbalist": {
    abilities: [
      triggered(
        when.attackWith(1),
        [
          fx.pump(ref.target(), 1, 0),
          ...fx.when(cond.refMatches(ref.target(), { token: true }), fx.pump(ref.target(), 0, 0, ["deathtouch"])),
        ],
        { targets: [target.creature("t", { controller: "you" })], label: "+1/+0 (deathtouch if token)" },
      ),
    ],
  },
  "Heaped Harvest": {
    abilities: [
      ...entersAndSacrificed(
        fx.may("Search for a basic land?", fx.search(BASIC_LAND, { to: "battlefield", tapped: true })),
        "Tapped basic land",
      ),
      FOOD_ABILITY,
    ],
  },
  "High Stride": {
    spell: spell([target.creature()], [fx.pump(ref.target(), 1, 3, ["reach"]), fx.untap(ref.target())]),
  },
  "Hivespine Wolverine": {
    abilities: [
      triggeredModal(when.entersSelf, [
        mode("+1/+1 counter", [target.creature("t", { controller: "you" })], [fx.addCounters(ref.target(), 1)]),
        mode(
          "Fights a creature token",
          [targetObj("t", { types: ["Creature"], token: true }, "creature token")],
          [fx.fight(ref.self, ref.target())],
        ),
        mode(
          "Destroy an artifact or enchantment",
          [target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment")],
          [fx.destroy(ref.target())],
        ),
      ]),
    ],
  },
  "Honored Dreyleader": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.self, amount.count({ ...SQUIRREL_OR_FOOD, other: true }))], {
        label: "A counter for each Squirrel and Food",
      }),
      triggered(when.enters({ ...SQUIRREL_OR_FOOD, other: true }), [fx.addCounters(ref.self, 1)], { label: "+1/+1 counter" }),
    ],
  },
  "Hunter's Talent": {
    abilities: [
      triggered(when.entersSelf, [fx.damage(amount.powerOf(ref.target()), ref.target("u"), ref.target())], {
        targets: [target.creature("t", { controller: "you" }), OPP_CREATURE()],
        label: "Bite",
      }),
    ],
    classLevels: [
      [
        triggered(when.attackWith(1), [fx.pump(ref.target(), 1, 0, ["trample"])], {
          targets: [targetObj("t", { types: ["Creature"], attacking: true }, "attacking creature")],
          label: "+1/+0 and trample",
        }),
      ],
      [
        triggered(when.yourEndStep, [fx.draw(1)], {
          condition: cond.controls({ types: ["Creature"], minPower: 4 }),
          label: "Draw a card",
        }),
      ],
    ],
  },
  "Innkeeper's Talent": {
    abilities: [
      triggered(when.yourCombat, [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter",
      }),
    ],
    classLevels: [
      [
        staticAbility(
          { controller: "you", withCounter: "any" },
          { addKeywords: ["ward"], addAbilities: [wardAbility({ mana: cost("{1}") })] },
          { label: "Ward {1}" },
        ),
      ],
      [eventReplacement({ event: "counters", byYou: true, modify: { times: 2 }, label: "Counters doubled" })],
    ],
  },
  "Keen-Eyed Curator": {
    abilities: [
      staticAbility(
        "self",
        { power: 4, toughness: 4, addKeywords: ["trample"] },
        {
          condition: cond.amountAtLeast(amount.cardTypesOf(ref.linked), 4),
          label: "Four types exiled: +4/+4 and trample",
        },
      ),
      activated({
        mana: "{1}",
        targets: [target.cardInGraveyard("t", {}, "any", "card in a graveyard")],
        effects: [fx.exileCard(ref.target(), { name: "k" }), fx.link(ref.stored("k"))],
        label: "Exiles a card from a graveyard",
      }),
    ],
  },
  "Longstalk Brawl": {
    spell: spell(
      [target.creature("t", { controller: "you" }), OPP_CREATURE()],
      [...fx.when(cond.gift, fx.addCounters(ref.target(), 1)), fx.fight(ref.target(), ref.target("u"))],
    ),
  },
  "Lumra, Bellow of the Woods": {
    cda: { pt: amount.count({ types: ["Land"], controller: "you" }) },
    abilities: [
      triggered(
        when.entersSelf,
        [fx.mill(4), fx.moveAll("graveyard", ref.you, { types: ["Land"] }, { to: "battlefield", tapped: true })],
        { label: "Mill 4, then return all lands" },
      ),
    ],
  },
  "Mistbreath Elder": {
    // The returned creature is chosen on resolution (not a target); returning is mandatory if there is one.
    abilities: [
      triggered(
        when.yourUpkeep,
        [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"], other: true }), ref.you, "m", {
            prompt: "Choose the creature to return to your hand",
          }),
          fx.bounce(ref.stored("m")),
          ...fx.when(cond.amountAtLeast(amount.refCount(ref.stored("m")), 1), fx.addCounters(ref.self, 1)),
          ...fx.when(
            cond.not(cond.amountAtLeast(amount.refCount(ref.stored("m")), 1)),
            ...fx.may("Return this creature to your hand?", fx.bounce(ref.self)),
          ),
        ],
        { label: "Returns another creature (+1/+1 counter)" },
      ),
    ],
  },
  Overprotect: {
    spell: spell(
      [target.creature("t", { controller: "you" })],
      [fx.pump(ref.target(), 3, 3, ["trample", "hexproof", "indestructible"])],
    ),
  },
  "Pawpatch Formation": {
    spell: modal(
      mode("Destroys a creature with flying", [target.creature("t", { keyword: "flying" })], [fx.destroy(ref.target())]),
      mode("Destroys an enchantment", [target.permanent("t", ["Enchantment"], {}, "enchantment")], [fx.destroy(ref.target())]),
      mode("Draw a card, Food", [], [fx.draw(1), fx.createTokens(FOOD)]),
    ),
  },
  "Pawpatch Recruit": {
    abilities: [
      triggered(when.targetedByOpponent(CREATURE_YOU_CONTROL), [fx.addCounters(ref.target(), 1)], {
        targets: [{ ...target.creature("t", { controller: "you" }), notEventObject: true }],
        label: "+1/+1 counter on another creature",
      }),
    ],
  },
  "Peerless Recycling": {
    spell: spell(
      [{ ...target.cardInGraveyard("t", { permanent: true }, "you", "permanent card in your graveyard"), kickedCount: 2 }],
      [fx.toHand(ref.target())],
    ),
  },
  Polliwallop: {
    costReduction: { generic: amount.count({ types: ["Creature"], subtype: "Frog", controller: "you" }) },
    spell: spell(
      [target.creature("t", { controller: "you" }), OPP_CREATURE()],
      [fx.damage(amount.plus(amount.powerOf(ref.target()), amount.powerOf(ref.target())), ref.target("u"), ref.target())],
    ),
  },
  "Rust-Shield Rampager": { abilities: [blockAbility(block.notByPowerLE2)] },
  Scrapshooter: {
    abilities: [
      triggered(when.entersSelf, [fx.destroy(ref.target())], {
        condition: cond.gift,
        targets: [
          target.permanent(
            "t",
            ["Artifact", "Enchantment"],
            { controller: "opponent" },
            "artifact or enchantment an opponent controls",
          ),
        ],
        label: "Destroy an artifact or enchantment",
      }),
    ],
  },
  "Season of Gathering": {
    spell: pawprint(
      {
        pips: 1,
        label: "+1/+1 counter, vigilance and trample",
        // "A creature you control": untargeted choice, on resolution.
        effects: [
          fx.chooseAmong(ref.permanentsOf(ref.you, { types: ["Creature"] }), ref.you, "g", {
            prompt: "Choose the creature that gets the counter",
          }),
          fx.addCounters(ref.stored("g"), 1),
          fx.pump(ref.stored("g"), 0, 0, ["vigilance", "trample"]),
        ],
      },
      {
        pips: 2,
        label: "Destroys all artifacts",
        effects: [fx.destroyAll({ types: ["Artifact"] })],
      },
      {
        pips: 2,
        label: "Destroys all enchantments",
        effects: [fx.destroyAll({ types: ["Enchantment"] })],
      },
      {
        pips: 3,
        label: "Draw equal to the greatest power",
        effects: [fx.draw(amount.maxPower(CREATURE_YOU_CONTROL))],
      },
    ),
  },
  "Stickytongue Sentinel": {
    abilities: [
      triggered(when.entersSelf, [fx.bounce(ref.target())], {
        targets: [target.upTo(1, targetObj("t", { controller: "you", other: true }, "other permanent you control"))],
        label: "Returns another permanent",
      }),
    ],
  },
  "Stocking the Pantry": {
    abilities: [
      triggered(when.youPutCounters(CREATURE_YOU_CONTROL, "+1/+1"), [fx.counters(ref.self, "supply", 1)], {
        batched: true,
        label: "Supply counter",
      }),
      activated({ mana: "{2}", removeCounters: { kind: "supply", n: 1 }, effects: [fx.draw(1)], label: "Draw a card" }),
    ],
  },
  "Sunshower Druid": {
    abilities: [
      triggered(when.entersSelf, [fx.addCounters(ref.target(), 1), fx.gainLife(1)], {
        targets: [target.creature()],
        label: "+1/+1 counter, +1 life",
      }),
    ],
  },
  "Tender Wildguide": {
    abilities: [
      manaAbility(["W", "U", "B", "R", "G"]),
      activated({ tap: true, effects: [fx.addCounters(ref.self, 1)], label: "+1/+1 counter" }),
    ],
  },
  "Thornvault Forager": {
    abilities: [
      manaAbility("G"),
      activated({ tap: true, forage: true, effects: [fx.addManaCombination(2)], label: "Forage: two mana" }),
      activated({
        mana: "{3}{G}",
        tap: true,
        effects: [fx.search({ subtype: "Squirrel" })],
        label: "Searches for a Squirrel",
      }),
    ],
  },
  "Three Tree Rootweaver": { abilities: [manaAbility(["W", "U", "B", "R", "G"])] },
  "Three Tree Scribe": {
    abilities: [
      triggered(when.leavesWithoutDying(CREATURE_YOU_CONTROL), [fx.addCounters(ref.target(), 1)], {
        targets: [target.creature("t", { controller: "you" })],
        label: "+1/+1 counter",
      }),
    ],
  },
  "Treeguard Duo": {
    abilities: [
      triggered(
        when.entersSelf,
        [fx.pump(ref.target(), amount.count(CREATURE_YOU_CONTROL), amount.count(CREATURE_YOU_CONTROL), ["vigilance"])],
        { targets: [target.creature("t", { controller: "you" })], label: "+X/+X and vigilance" },
      ),
    ],
  },
  "Treetop Sentries": {
    abilities: [
      triggered(when.entersSelf, fx.mayForage("Forage to draw a card?", fx.draw(1)), {
        label: "Forage: draw",
      }),
    ],
  },
  "Valley Mightcaller": {
    abilities: [
      triggered(when.enters(kin(["Frog", "Rabbit", "Raccoon", "Squirrel"], { other: true })), [fx.addCounters(ref.self, 1)], {
        label: "+1/+1 counter",
      }),
    ],
  },
  "Wear Down": {
    spell: spell(
      [{ ...target.permanent("t", ["Artifact", "Enchantment"], {}, "artifact or enchantment"), kickedCount: 2 }],
      [fx.destroy(ref.target())],
    ),
  },
};
