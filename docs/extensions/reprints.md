# Reprints playable in "Unlimited" (PLAN-G)

Eight reprint sets released alongside the Standard sets: Special Guests (SPG), Stellar Sights (EOS), Enchanting Tales
(WOT), Breaking News (OTP), Through the Ages (FCA), Mystical Archive (SOA), Source Material (PZA) and Jurassic World
Collection (REX). Outside Standard, they serve the "Unlimited" format. Plan: PLAN-G (condensed in `docs/history.md`).

The scripts are in `packages/cards/src/<code>/cards.ts` (helpers: `tdm/common.ts`); the rules tests in
`packages/engine/test/<code>.test.ts`; the smoke tests in `packages/ai/test/smoke/<code>.test.ts`.

## G1 — printings ✅

A card already in the app and reprinted by one of these sets gets a printing (`CardDef.printings`): the deck can choose
its artwork (51 cards). Details in the plan's follow-up.

## G2a — alternative costs and modes ✅

| Mechanic | Form | Cards |
|---|---|---|
| Overload (702.96) | `altCostMode("Overload", cost, normal, overloaded)`: `ModeDef.cost` | Cyclonic Rift, Winds of Abandon (SOA), Mizzix's Mastery (FCA) |
| Fuse (702.148) | `altCostMode("Fuse", …)` | Fierce Retribution (OTP) |
| Escalate (702.120) | `escalate(cost, …modes)` | Collective Defiance (OTP) |
| Dash (702.109) | read from the text: `altCost.via = "dash"`, haste and return to hand | Ragavan, Nimble Pilferer (FCA) |
| Spectacle (702.137) | read from the text: `altCost` if an opponent lost life this turn | Light Up the Stage (FCA), Skewer the Critics (OTP) |

- **The engine gains:** `ModeDef.cost` (a mode cast for its own cost, offered only if payable, never free nor with
  another alternative cost); `altCost.via`; the search done by other players reads its number from each player's point
  of view (Winds of Abandon overloaded: as many lands as the number of one's creatures exiled).
- **Tests:** `soa.test.ts` (5), `fca.test.ts` (5), `otp.test.ts` (6). Approximations: Ragavan (permission to play),
  Winds of Abandon (the owner searches).
- **Deferred to their own lot:** emerge (Cresting Mosasaurus, REX), madness (Terminal Agony, OTP), replicate (Consign to
  Memory, SPG), retrace (Waves of Aggression, PZA): one card each.

## G2b — permanent keywords ✅

| Mechanic | Form | Cards |
|---|---|---|
| Exalted (702.83) | read from the text: `attacksAlone`, +1/+1 | Cathedral of War (EOS) |
| Affinity for artifacts (702.41) | read from the text: `costReduction` | Frogmite, Thoughtcast (SPG) |
| Metalcraft | script: two `fx.when` on resolution | Galvanic Blast (SPG) |
| Modular (702.43) | read from the text: `entersWith` and counters (last known information) on a targeted artifact creature | Arcbound Ravager (PZA), Power Depot (EOS) |
| Graft (702.58) | read from the text: `entersWith`, optional counter move | Cytoplast Manipulator (PZA) |
| Imprint | `exileFromHandLinked` and mana of the linked colors | Chrome Mox (SPG) |
| Extort (702.101) | read from the text: `castSpell` and `mayPay("{W/B}")` | Blind Obedience (WOT); The Kingpin of Crime (MSH) no longer writes its own |
| Shroud (702.18) | keyword `shroud` | Helix Pinnacle (SPG) |
| Champion (702.72) | `champion` helper (`spg/cards.ts`): `chooseAmong`, `exileUntilLeaves`, sacrifice otherwise | Mistbind Clique, Wanderwine Prophets (SPG) |

- **Tests:** `spg.test.ts` (8), `eos.test.ts` (3), `pza.test.ts` (3), `wot.test.ts` (2); smoke EOS, PZA, WOT.
- **Audit:** Mistbind Clique, "when a Faerie is championed" read as a static ability (intended gap, `audit-baseline.json`).
- **Deferred to their own lot (one card each):** monstrosity and bloodthirst (REX), regeneration (Swarmyard, G3), boast
  (Varragoth, FCA), populate (Life Finds a Way, REX), council's dilemma (Expropriate, SPG), Dino DNA (REX).

## G2c — storm ✅

- **Storm (702.40)** read from the text: `castSelf` then `copySpell(self, amount.eventAmount)`. The number of spells cast
  before it this turn, by all players, is fixed at cast time (`RulesEvent` `cast.spellsBefore`). Stormscale Scion (TDM)
  no longer writes its own, which counted on resolution and only your spells.
- **Cards:** Brain Freeze, Empty the Warrens, Flusterstorm (SOA). Tests: `soa.test.ts` (+2).

## G3a — Stellar Sights, feasible lands ✅ (35 / 43)

- **Cards (33):** Ancient Tomb, Blinkmoth Nexus, Bonders' Enclave, Cascading Cataracts, Celestial Colonnade, Contested
  War Zone, Creeping Tar Pit, Crystal Quarry, Deserted Temple, Dust Bowl, Eldrazi Temple, Endless Sands, Grove of the
  Burnwillows, High Market, Hissing Quagmire, Inventors' Fair, Lavaclaw Reaches, Lotus Field, Lumbering Falls, Mana
  Confluence, Mirrorpool, Mutavault, Mystifying Maze, Needle Spires, Petrified Field, Raging Ravine, Scavenger Grounds,
  Shambling Vent, Stirring Wildwood, Strip Mine, Terrain Generator, Thespian's Stage, Wandering Fumarole.
- **Forms:** `manland` helper (Elemental creature-lands from Worldwake and Oath of the Gatewatch); drawback of a mana
  ability (`drawback`, new); Thespian's Stage keeps its ability (`becomeCopy`, `keepAbilities`); Wandering Fumarole is
  the first card to switch P/T (`switchPT`, 613.4d).
- **Tests:** `eos.test.ts` (+12).
- **Approximation:** Eldrazi Temple, the restricted mana applies to any Eldrazi spell or ability (colorless or not).

## G3b — Stellar Sights, lands that needed engine work ✅ (43 / 43)

| Card | New form |
|---|---|
| Inkmoth Nexus | infect keyword (702.90) |
| Swarmyard | regeneration (701.19): `fx.regenerate`, shield consumed by `destroy`, removed at cleanup |
| Meteor Crater, Plaza of Heroes | mana of the colors of your permanents (`colorsOf`) |
| Reflecting Pool | mana of the types your other lands could produce (`likeLands`) |
| Blast Zone | filter `compare: [cmp.manaValue("=", amount.lkiCounters("charge"))]` (mana value equal to the source's counters, last known information after the sacrifice) |
| Nesting Grounds | `moveCounter` effect (kind of one's choice) |
| Gemstone Caverns | conditional `leyline`: if you are not the starting player, with a luck counter, a card exiled from hand |

- **Tests:** `eos.test.ts` (+8).
- **Approximations:** Gemstone Caverns asks which card is exiled at the first check of the game (PLAN-M M11c; before,
  the non-land card of lowest mana value automatically); Reflecting Pool does not see what other Reflecting Pools would
  produce.

## G4a — Special Guests from LCI, MKM and OTJ ✅ (31 cards; SPG 38 / 132)

- **Cards:** Lord of Atlantis, Bridge from Below, Mephidross Vampire, Pitiless Plunderer, Rampaging Ferocidon, Carnage
  Tyrant, Polyraptor, Kalamax, the Stormsire, Lord Windgrace, Mana Crypt, Star Compass, Ghostly Prison, Fabricate, Show
  and Tell, Tragic Slip, Victimize, Gamble, Crashing Footfalls, Tireless Tracker, Drown in the Loch, Field of the Dead,
  Stoneforge Mystic, Brazen Borrower // Petty Theft, Desertion, Morbid Opportunist, Port Razer, Scapeshift, Mystic
  Snake, Desert, Prismatic Vista.
- **The engine gains:** landwalk (`BlockRule.unblockableIfDefenderControls`, `block.landwalk`);
  `block.notSameDefenderTwice` (Port Razer, without which its extra combats would never end); player statics `affects`;
  `copySpell` trigger; suspend read from the text (special action); `counter` remembers the countered card wherever it
  goes (Desertion); `likeLands` takes a filter (Star Compass: basic lands).
- **Tests:** `spg.test.ts` (+19).
- **Approximations:** Drown in the Loch (the condition is checked on resolution, not on targeting); Mephidross Vampire
  ("deals damage to a creature": any damage not dealt to a player); Bridge from Below (the graveyard is read as that of
  the creature's last controller).
- **Deferred (hard sub-lot):** Underworld Breach (escape), Mirri, Weatherlight Duelist (limits on attackers and
  blockers), Notion Thief (redirected draw).

## G4b — Special Guests from BLB, DSK, FDN and DFT ✅ (29 cards; SPG 67 / 132)

- **Cards:** Swords to Plowshares, Ledger Shredder, Rat Colony, Relentless Rats, Kindred Charge, Sylvan Tutor, Toski,
  Bearer of Secrets, Sword of Fire and Ice, Hallowed Haunting, Soul Warden, Damnation, Sacrifice, Unholy Heat, Collected
  Company, Condemn, Grim Tutor, Embercleave, Goblin Bushwhacker, Paradise Druid, Akroma's Memorial, Temporal
  Manipulation, Fiend Artisan, Cavalier of Dawn, Whir of Invention, Bone Miser, Lord of the Undead, Chandra's Ignition,
  Pathbreaker Ibex, Skysovereign, Consul Flagship.
- **The engine gains:** `destroy` without regeneration (`noRegenerate`).
- **Tests:** `spg.test.ts` (+17).
- **Deferred (hard sub-lot):** Expropriate (council's dilemma), Maddening Hex (die, player Aura that changes host),
  Noxious Revival (Phyrexian mana), Sphinx's Tutelage (repeated mill), Phantasmal Image (copy on entering with an added
  ability).

## G4c — Special Guests from TDM, EOE and ECL ✅ (31 cards; SPG 98 / 132)

- **Cards:** the five Ultimatums, the five fetch lands (Arid Mesa, Marsh Flats, Misty Rainforest, Scalding Tarn,
  Verdant Catacombs), Warping Wail, Deafening Silence, Nexus of Fate, Paradox Haze, Darkness, Magus of the Moon,
  Burgeoning, Green Sun's Zenith, Sliver Overlord, Idyllic Tutor, Kinsbaile Cavalier, Bitterblossom, Faerie Macabre,
  Goblin Chieftain, Goblin Sharpshooter, Heat Shimmer, Devoted Druid, Leaf-Crowned Visionary, Regal Force, Manamorphose,
  Risen Reef.
- **The engine gains:** `castLimit.spellTypes` (Deafening Silence); `playLand.whose` (Burgeoning).
- **Tests:** `spg.test.ts` (+13).
- **Approximations:** Eerie Ultimatum (different names are not enforced); Green Sun's Zenith (shuffled into the library
  like a card that cannot go to the graveyard); Magus of the Moon (nonbasic lands lose all their subtypes).
- **Deferred:** Robe of Stars (phasing).

## G4d — Special Guests from SOS and FRA ✅ (16 cards; SPG 114 / 132)

- **Cards:** Dolmen Gate, Door of Destinies, Archaeomancer, Archmage Emeritus, Murmuring Mystic, Dualcaster Mage, Magus
  of the Library, Library of Alexandria, Adrix and Nev, Eye of Ugin, Austere Command, Sublime Epiphany, Consider, Mind
  Twist, Splinter Twin, Root Maze. No new form: prevention by replacement, token doubling, combined modes ("choose two",
  escalate at {0}), `copySpell` trigger (magecraft).
- **Tests:** `spg.test.ts` (+9).
- **Hard sub-lot (18 SPG cards):** Underworld Breach (escape), Mirri (attack and block limits), Notion Thief (redirected
  draw), Expropriate (vote), Maddening Hex (die, changing host), Noxious Revival (Phyrexian mana), Sphinx's Tutelage
  (repeated mill), Phantasmal Image and Flesh Duplicate (copy on entering with an ability or disappearance), Robe of
  Stars (phasing), Painter's Servant (color of all cards), Thousand-Year Elixir (abilities as though with haste), Grim
  Haruspex (morph), Sylvan Library (cards drawn this turn), Codie (exile until a spell), Library of Leng (replaced
  discard), Consign to Memory (replicate), Necrodominance (skipped draw, life paid).

## G5 — Enchanting Tales ✅ (48 cards; WOT 49 / 55)

- **Cards:** Dawn of Hope, Grasp of Fate, Greater Auramancy, Griffin Aerie, Intangible Virtue, Knightly Valor, Land
  Tax, Leyline of Sanctity, Smothering Tithe, Compulsion, Copy Enchantment, Curiosity, Forced Fruition, Fraying Sanity,
  Hatching Plans, Intruder Alarm, Kindred Discovery, Leyline of Anticipation, Rhystic Study, Spreading Seas, Dark
  Tutelage, Grave Pact, Oppression, Oversold Cemetery, Polluted Bonds, Sanguine Bond, Stab Wound, Waste Not, Aggravated
  Assault, Blood Moon, Dragon Mantle, Fiery Emancipation, Goblin Bombardment, Leyline of Lightning, Mana Flare, Raid
  Bombardment, Repercussion, Sneak Attack, Defense of the Heart, Hardened Scales, Leyline of Abundance, Nature's Will,
  Parallel Lives, Primal Vigor, Prismatic Omen, Season of Growth, Unnatural Growth, Utopia Sprawl. No new form.
- **Tests:** `wot.test.ts` (+21).
- **Audit:** Mana Flare, Leyline of Abundance, Utopia Sprawl: triggered mana abilities modeled by a mana replacement
  (intended gaps).
- **Approximations:** Grasp of Fate (a single permanent exiled, even with several opponents); Fraying Sanity (the cards
  counted are those of the controller's opponents); Raid Bombardment (the damage goes to the defending player, even if
  the creature attacks a planeswalker).
- **Hard sub-lot:** Karmic Justice (destruction by an opponent), Phyrexian Unlife (loss and infect at 0 life), As
  Foretold (alternative cost depending on counters, once per turn), Necropotence (skipped draw, face-down exile), Ground
  Seal (cards in graveyards cannot be targeted), Shared Animosity (creatures that share a type).

## G6 — Breaking News ✅ (47 cards; OTP 50 / 61)

- **Cards:** Journey to Nowhere, Leyline Binding, Pariah, Path to Exile, Archive Trap, Archmage's Charm, Essence
  Capture, Mana Drain, Mindbreak Trap, Repulse, Heartless Pillage, Imp's Mischief, Overwhelming Forces, Reanimate,
  Thoughtseize, Crackle with Power, Electrodominance, Fling, Skullcrack, Clear Shot, Pest Infestation, Primal Command,
  Thornado, Abrupt Decay, Anguished Unmaking, Back for More, Bedevil, Crime // Punishment, Cruel Ultimatum, Decimate,
  Decisive Denial, Detention Sphere, Endless Detour, Hindering Light, Humiliate, Hypothesizzle, Ionize, Oko, Thief of
  Crowns, Savage Smash, Siphon Insight, Tyrant's Scorn, Vanishing Verse, Villainous Wealth, Void Rend, Voidslime,
  Contagion Engine, Mindslaver.
- **The engine gains:** searching one's library in the turn log (`turnEvents` `search`, Archive Trap).
- **Tests:** `otp.test.ts` (+20).
- **Audit:** Journey to Nowhere and Detention Sphere (exile until it leaves, in a single ability), Crackle with Power
  ("up to X targets"): intended gaps.
- **Approximations:** Hindering Light (a spell that targets only you is not recognized); Mindbreak Trap (the spell cast
  by an opponent is counted per player).
- **Hard sub-lot:** Fell the Mighty (power compared to a target), Commandeer (control of a spell), Surgical Extraction
  (Phyrexian mana), Indomitable Creativity (reveal for each destroyed permanent), Force of Vigor (alternative cost by
  exiling a card from hand), Terminal Agony (madness), Grindstone (repeated mill), Outlaws' Merriment (random mode),
  Fractured Identity (copies for the other players), Unlicensed Hearse (P/T equal to linked cards), Ride Down (creatures
  blocked by a creature).

## G7 — Through the Ages ✅ (36 cards; FCA 39 / 50)

- **Cards:** Adeline, Ranger-Captain of Eos, Sram, Counterspell, Urza, Lord High Artificer, Venser, Dark Ritual, Fatal
  Push, Syr Konrad, Yawgmoth, Godo, Purphoros, Azusa, Traxos, Danitha Capashen, Kenrith, Loran of the Third Path,
  Mangara, Wall of Omens, Brainstorm, Cryptic Command, Deadly Dispute, Diabolic Intent, Varragoth, Captain Lannery Storm,
  Lightning Bolt, Najeela, Farseek, Nature's Claim, Primeval Titan, Dovin's Veto, Isshin, Kinnan, Chromatic Lantern,
  Smuggler's Copter, Strixhaven Stadium.
- **The engine gains:** `tapAnother: "artifact"` (Urza: "tap an untapped artifact you control: {U}").
- **Tests:** `fca.test.ts` (+17).
- **Approximations:** Adeline (the Humans attack the first opponent); Mangara (attacks against you are counted over the
  turn); Purphoros (without enough devotion, it is an enchantment with no other card type).
- **Hard sub-lot:** Bolas's Citadel, Jodah, Winota, Nyxbloom Ancient, Laboratory Maniac, Teferi, Mage of Zhalfir, Gix,
  K'rrik (Phyrexian mana), Atraxa, Carpet of Flowers, Ancient Copper Dragon (d20).

## G8 — Mystical Archive ✅ (25 cards; SOA 30 / 37)

- **Cards:** Armageddon, Prismatic Ending, Reprieve, Return to the Ranks, Pongify, Preordain, Culling the Weak, Living
  End, Sheoldred's Edict, Smallpox, Vampiric Tutor, Big Score, Brotherhood's End, Pyretic Ritual, Subterranean Tremors,
  Awaken the Woods, Berserk, Crop Rotation, Glimpse of Nature (emblem of the turn), Shamanic Revelation, Triumph of the
  Hordes, Bring to Light, Culling Ritual, Expressive Iteration, Fracture. No new form.
- **Tests:** `soa.test.ts` (+11).
- **Approximations:** Expressive Iteration (the card kept in hand is chosen first, among the three; then the exiled one
  among the remaining two); Prismatic Ending (mana value is compared on resolution, not on targeting).
- **Hard sub-lot:** Angel's Grace (can't lose, life at least 1), Daze and Force of Will (particular alternative costs),
  Dismember (Phyrexian mana), Ad Nauseam (repetition at the player's choice), Veil of Summer (uncounterable, hexproof
  from colors), Deflecting Palm (shield that returns damage).

## G9 — Source Material and Jurassic World Collection ✅ (18 cards; PZA 12 / 15, REX 8 / 20)

- **Source Material:** Teleportation Circle, Ashcoat of the Shadow Swarm, Silverclad Ferocidons, Rhythm of the Wild,
  Conqueror's Flail, Metallic Mimic, Shadowspear, Sword of Sinew and Steel, Umezawa's Jitte (the three modes as three
  abilities at the same cost), All Will Be One.
- **Jurassic World Collection:** Don't Move (emblem until your next turn), Spitting Dilophosaurus, Life Finds a Way
  (populate), Savage Order, Compy Swarm, Ellie and Alan, Permission Denied, Ravenous Tyrannosaurus (devour 3).
- **Tests:** `pza.test.ts` (+6), `rex.test.ts` (7); smoke REX.
- **Approximation:** All Will Be One (counters put on a player do not count).
- **Hard sub-lot:** Trouble in Pairs, Plague of Vermin, Waves of Aggression (retrace); Cresting Mosasaurus (emerge),
  Hunting Velociraptor (prowl), Welcome to . . . // Jurassic Park, Blue, Loyal Raptor and Owen Grady (partner with,
  keyword counters), Grim Giganotosaurus (monstrosity), Henry Wu (exploit), Ian Malcolm, Indominus Rex, Indoraptor
  (bloodthirst, random opponent), Swooping Pteranodon, Dino DNA.

## G4e — hard sub-lot

- **Phyrexian mana ✅:** `ManaCost.phyrexian`, paid with available mana first, otherwise 2 life per symbol; Φ symbol in
  the interface. Cards: Noxious Revival (SPG), Dismember (SOA), K'rrik, Son of Yawgmoth (FCA, `phyrexianMana` static).
  Tests: `phyrexian.test.ts` (5). Approximation: the player cannot choose to pay life when mana suffices. Surgical
  Extraction remains to be done (namesakes in a player's hand and library).
- **Alternative costs paid differently ✅:** `altCost.pay` (life, cards exiled from hand, permanent returned, chosen
  automatically: the cheapest cards, a tapped permanent first). Cards: Force of Will, Daze (SOA), Force of Vigor (OTP).
  Tests: `altcosts.test.ts` (4).
- **A card's own keywords ✅:** Grim Giganotosaurus (monstrosity; since PLAN-M M1, rules 196: `fx.monstrosity`, the
  `GameObject.monstrous` designation and `when.becomesMonstrous`, no longer a counter that proliferate re-fired),
  Indoraptor (bloodthirst: `entersWith` of the damage dealt to opponents this turn; the "random" opponent:
  `fx.chooseOpponent(…, { random: true })`, PLAN-H H4), Henry Wu (exploit given to Humans, the draw and the Treasure in
  the same ability). Tests: `rex.test.ts` (+3).
- **Player rules ✅:** player statics `winOnEmptyDraw` (Laboratory Maniac: the impossible draw becomes a win),
  `damageLifeFloor` (Angel's Grace, with `cantLose` set by `fx.thisTurn`), `infectDamageAtZeroLife` (Phyrexian Unlife,
  with `noLoseForLife`), `cantTargetGraveyardCards` (Ground Seal, `affects: "each"`); mana replacement `modify.times`
  (Nyxbloom Ancient: "three times that much", ordered with the "one additional"); N-sided die (`fx.rollDie`, Ancient
  Copper Dragon); morph (702.37, `CardDef.morph`: face down like disguise, without ward; Grim Haruspex); Surgical
  Extraction (namesakes of a graveyard card at its owner's, `fx.exileCardAndNamesakes`); Thousand-Year Elixir on
  `activateAsThoughHaste`. Tests: `fca`, `soa`, `wot`, `spg`, `otp` (+9). `RULES_VERSION` 115.
- **Combat ✅:** filters relative to a designated object, resolved by `withX`: `cmp.power(">", amount.rawPowerOf(ref))`
  (Fell the Mighty), `sharesCreatureTypeWith` (Shared Animosity); `combatPartners` reference (Ride Down: the creatures
  the target was blocking); `destroyed` trigger with the destroying player (`when.destroyedByOpponent`, Karmic Justice);
  player statics `maxBlockingCreatures` and `maxOneAttacker` (Mirri, Weatherlight Duelist; `maxOneAttacker: "walkers"`
  replaces Tomik's `walkersMaxOneAttacker`); retrace (702.81, read from the text: `castFromGraveyard.discardFilter`,
  Waves of Aggression); a player's hexproof from a filter (`hexproof: { colors }`, Veil of Summer); spell colors in the
  turn log (`turnEvents({ event: "cast", colors })`); `entersWith({ counterKind: "*", affects })` (Blue, Loyal Raptor);
  "partner with" as an enters ability (`partnerWith` helper, `rex/cards.ts`); Outlaws' Merriment (random token by a
  three-sided die), Swooping Pteranodon, Owen Grady, Deflecting Palm. Tests: `otp`, `wot`, `spg`, `pza`, `rex`, `soa`
  (+12, including the end of Cytoplast Manipulator's control). `RULES_VERSION` 116.
- **Casting otherwise ✅:** madness (702.35, `CardDef.madness`, read from the text: the discarded card goes to exile via
  `moveDiscarded`, which sets up a wait "cast it for its madness cost, otherwise to the graveyard"; Terminal Agony);
  emerge (702.119, read from the text: `altCost.pay.sacrificeReduce`; Cresting Mosasaurus); replicate (702.56, read from
  the text: `replicate` kicker paid X times, copies by a "when you cast" ability; Consign to Memory); granted escape
  (`playFrom.exileOthers`, Underworld Breach); granted prowl (`altCostAll` under a turn-log condition, subtype of the
  damage source; Hunting Velociraptor); gaining control of a spell (`fx.gainControl` on the stack, Commandeer); casting
  only at sorcery timing (`castLimit.sorceryTiming`, Teferi, Mage of Zhalfir); copy exceptions gathered in
  `entersAsCopyMods` (since PLAN-H H9: `fx.chooseCopy(filter, { except })` in `asEnters`) (Phantasmal Image, Flesh
  Duplicate with its disappearance written as abilities); As Foretold (`cmp.manaValue("<=", amount.lkiCounters("time"))`).
  Tests: `otp`, `rex`, `spg`, `wot`, `fca` (+10). `RULES_VERSION` 117.
- **Library and draw ✅:** player statics `skipDrawStep` (Necropotence, Necrodominance), `discardToLibraryTop` (Library of
  Leng: `moveDiscarded(…, byEffect)`), `stealsOpponentDraws` (Notion Thief, in `drawCard`: the draw-step draw is not
  stolen), `skipExtraTurns` (Trouble in Pairs); `maxHandSize` replaces `opponentMaxHandSize` (Winter, with `affects:
  "opponents"`) and the condition of a player static is read for the controller of its source; `fx.payLifeX` (op `payX`
  in life); `millWhileShared` generalized (`fx.millWhileSharingColor`: Grindstone, Sphinx's Tutelage); `lookAtTop({
  onePerType })` (Atraxa, Grand Unifier); Ad Nauseam (at most 30 repetitions); Carpet of Flowers. Tests: `wot`, `spg`,
  `otp`, `soa`, `fca`, `pza` (+10). `RULES_VERSION` 118.
- **Exile and copies ✅:** `copyToken({ for })` (Fractured Identity: each other player creates the copy); P/T equal to
  linked exiled cards (`cdaPT: amount.refCount(ref.linked)`, CDA key `refCount:linked`; Unlicensed Hearse); filtered
  cascade (`fx.cascade(n, filter)`, Jodah, the Unifier); Dino DNA (linked exile, 6/6 copy); Indomitable Creativity
  (`exileUntil` for the controller of each destroyed permanent); Winota; Bolas's Citadel (`playFrom` the top of the
  library, life equal to the mana value). "Between zero and N targets" (`minCount: 0`) accepts no target (strict fuzz,
  test in `offers.test.ts`). The hidden-information test knows that a player who controls a face-down permanent knows
  it (708.5). Tests: `otp`, `rex`, `fca` (+7). `RULES_VERSION` 119.
- **Last cards (1) ✅:** "discard X cards" as a cost (`CostDef.discardX`, Gix, Yawgmoth Praetor); `grantPlay({ for:
  "nonOwners" })` (Ian Malcolm, Chaotician); player Aura attached at random (`fx.attachRandom`, `canAttach` accepts a
  player; Maddening Hex); `setColorsChosen: "add"` (Painter's Servant, permanents only); Sylvan Library (twice "pay 4
  life or put a card back"); Indominus Rex (keyword counters by an enters ability). The alternative cost no longer counts
  the mana of the permanents it returns or sacrifices (strict fuzz, emerge). Tests: `fca`, `spg`, `rex` (+6), `offers`
  (+1). `RULES_VERSION` 120.
- **Last cards (2) ✅:** phasing (702.26: `phasedOut` zone, `PlayerState.phasedOut`, `phaseOut` with what is attached,
  phasing in at the beginning of the controller's untap step, `fx.phaseOut`; Robe of Stars); another player chooses or
  pays (`chooseOption.who`, `payX.who`: Expropriate, Plague of Vermin); "when you cast your next spell this turn"
  (`NextSpell.trigger`, `fx.whenNextSpellThisTurn`; Codie, mana ability); Welcome to . . . // Jurassic Park (Saga
  transformed into a land, escape granted to Dinosaurs). Tests: `spg`, `pza`, `rex` (+5). `RULES_VERSION` 121. **All the
  cards of plan G are handled.**

## PLAN-M M7 (rules 198)

- **Green Sun's Zenith:** shuffled into its owner's library only as it resolves (`fx.shuffleOnResolve`, the "shuffle" spell fate, `StackItem.libraryInstead`); countered or discarded, it goes to the graveyard.
- **Shared Animosity:** a changeling attacker shares a creature type only with the attackers that have one (`anySubtype: ["*"]`).
- **Reflecting Pool:** the colors of Command Tower count; other lands of the same kind still don't (106.7).
- **Tests:** `spg.test.ts` (+1), `wot.test.ts` (+1), `eos.test.ts` (+1).

## PLAN-M M8b (rules 200)

- **Ragavan, Nimble Pilferer:** "you may cast that card": `grantPlay.castOnly` (a land, or a land back face, can't be played; the former condition on the card's type is gone). Test added (`fca.test.ts`).

## PLAN-M M9a (rules 201)

- **Codie, Vociferous Codex:** "when you next cast a spell this turn": `exileUntil` an instant or sorcery card with lesser mana value (the filter's comparison resolved with `withX`), `grantPlay` free until end of turn, the other exiled cards on the bottom in a random order (no longer a cascade).
- **Plague of Vermin:** rounds of payments, starting with you, repeated while someone pays (twenty rounds at most, a safety cap); a Rat for each life paid in all.
- **Expropriate:** a vote for money takes a permanent owned by the voter, whoever controls it (`ref.permanentsOwnedBy`, Ref zone `owned`).
- **Hindering Light:** also a spell that targets you (`TargetFilter.spellsTargetingYou`).
- **Mirri, Weatherlight Duelist:** "this combat" (`fx.thisCombat`, player effect `endOfCombat`): an additional combat of the turn isn't restricted.
- **Sylvan Library:** only cards drawn this turn (`ObjectFilter.drawnThisTurn`; the turn log's draw entry carries the card).
- **Gix, Yawgmoth Praetor:** "its controller may pay 1 life" is a payment (`fx.mayPayLifeFor`, the `pay` op's `who` as payer): impossible with 0 life (119.4); a life payment that can't be made is no longer asked.
- **Notion Thief:** the thief's draw goes through `drawCards` (its replacements apply), and an opposing Notion Thief may replace it in turn, but not one that already did (614.5).
- **Tests:** `spg.test.ts` (+4: Expropriate, Mirri, Sylvan Library, Notion Thief; Codie rewritten), `pza.test.ts` (Plague of Vermin: two tests rewritten), `otp.test.ts` (+1: Hindering Light), `fca.test.ts` (+1: Gix).

## PLAN-M M10b (rules 204)

- **Expropriate (SPG):** the shared vote (`fx.vote`): starting with you, each vote is announced as it is cast; then an extra turn per time vote (`fx.repeat`), then for each money vote a permanent owned by the voter (`amount.votes(store, 2, voter)`); Tivit's additional vote applies to it. Test added (`spg.test.ts`), and one in `edh-ursphinx.test.ts` (Tivit's additional votes for time).

## PLAN-M M10d (rules 206)

- **Henry Wu, InGen Geneticist (REX):** the exploit he gives (`exploitAbility()`) fires an `exploit` action event when its sacrifice happens (702.110b); "whenever a creature you control exploits a non-Human creature" is Henry's own trigger (`when.exploits`, the exploited creature read from its last known information): gone before the exploit resolves, no draw. Test added; approximation removed; audit baseline entry removed.
- **Hunting Velociraptor (REX):** granted prowl (`altCostAll.prowl`) compares the spell's creature types with those of the creatures that dealt combat damage to a player this turn (the turn log's `sourceSubtypes`). Test added (a Dinosaur Knight after a Knight's damage); approximation removed.
