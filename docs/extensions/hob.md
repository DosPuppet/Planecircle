# The Hobbit (HOB, 188 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-02, after Marvel's Spider-Man and Teenage Mutant Ninja Turtles. 20 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): Storied (read from the text, lasting story), amass Goblins, Landfall, Equipment… The set follows the integration rules of CLAUDE.md (debt, R1, R7). Split: one sublot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Core: tokens | 0 |
| Cards doable with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendary and unique cards | C and following |

The scripts are in `packages/cards/src/hob/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi` and `artifacts` (colorless and lands). The helpers are in `hob/common.ts`.

## Sublot 0: core ✅ (20 / 188)

- **Tokens:** white 1/1 Human Soldier, green 1/1 Elf, green 2/2 Bear, white 4/4 Bird Soldier with flying, red 6/6 Dragon with flying, Stone Boulder (colorless 3/1 Wall with defender), Axe (Equipment "+1/+0", equip {2}); Dwarf and Wolf already existed; Treasure and Food come from the commons.
- **Engine:** nothing new.
- **Tests:** smoke test `ai/test/smoke/hob.test.ts`.

## Sublot A1: white cards ✅ (44 / 188)

- **Cards (24):** Celebrate the Mountain-king, Dáin, Lord of the Iron Hills, Dwarven Provisioner, Dwarven Shortsword, Eagle of the Great Shelf, The Eagles Are Coming!, Esgaroth Garrison, Fíli the Pathfinder, Gleaming Splendor, Iron Hills Blacksmith, Lake-town Lookout, Lake-town Toymaker, Magnificent End, Moment of Glory, The Mountain-king's Return, Ori, Keeper of Songs, The Queen of Dale, Roads Go Ever, Ever On, Settle the Wreckage, Stone by Sunlight, Thorin's Last Stand, An Unexpected Party, At the Door, Velvetwing Butterflies, Gaze in Wonder, Vow to Erebor.
- **Engine fix:** choosing a creature type also offers the types of the tokens that the game's cards create (An Unexpected Party names the Dwarves its tokens create, with no nontoken Dwarf).
- **Smoke test:** every set now has its own file; `smoke/others.test.ts` remains for a set added without its own (it no longer fails when it has nothing to test).
- **Tests:** 31 rules tests ("lot A, white").

## Sublot A2: blue cards ✅ (69 / 188)

- **Cards (25):** Bilbo, Luckwearer, Burglar's Plot, Bilbo, Thief in the Night, Bilbo Baggins, Burglar, Take a Glance, Confusticate and Bebother, Elven Raft-Steerer, Elvenking's Harper, Enchanted River's Grasp, Fateful Discovery, Gandalf, Wandering Wizard, Great Gilded Boat, Lakeshore Apothecary, Lake-town Mariners, Gone Fishing, Long Lake Nuisance, The Lord of the Eagles, Mirkwood Meditator, Most Decrepit Old Bird, Speak Secrets, Old Fat Spider Can't See Me, Plunder the Trollshaws, Ravenhill Flock, Riddles in the Dark, Roll-Roll-Roll-Roll, Sound the Trumpets, Uncover the Moon-Letters, Uneasy Partings, Wizard's Staff.
- **Engine:** nothing new.
- **Left for later:** Elrond, Moon-Reader (activating an ability of a creature), Master's Councillors (number of graveyards with N or more cards), Thranduil's Decree (the card exiled by the counterspell, castable afterwards).
- **Tests:** 33 rules tests ("lot A, blue").

## Sublot A3: black cards ✅ (87 / 188)

- **Cards (18):** Along the Crooked Way, Bilbo's Deadly Slice, Crude Bent Blade, Down, Down to Goblin-town, Dreaded Bat-Cloud, Front Porch Sentries, Gathering of Darkness, Gnashing of Teeth, Gollum, Silent Slinker, Meager Meal, Gollum the Abandoned, Great Fierce Bee, Great Ugly-Looking Goblin, Clap! Snap!, Rage into the Valley, Ravening Warg, Reverent Howl, Rhovanion Rampager, Stir Up Trouble, Stony-Voiced Goblins.
- **Engine:** nothing new.
- **Left for later:** Inside Information (permission to play by paying life equal to the mana value), The Master of Lake-town (number of graveyards with seven or more cards), Supper for Spiders ("put into a graveyard from the battlefield this turn").
- **Tests:** 29 rules tests ("lot A, black").

## Sublot A4: red cards ✅ (112 / 188)

- **Cards (25):** Balin, Loremaster, Bombur, Gentle Dreamer, Bothersome Noisemaker, Burn, Burn, Tree and Fern, Dáin Ironfoot, Desert Were-Worm, Desolation of Smaug, Dori, Bearer of Friends, Gandalf, Goblins' Bane, Flameshape, Gandalf, Spark Starter, Glóin the Mighty, Easy Pickings, Goblin-town Flunkies, Gundabad Opportunist, Iron Hills Stalwart, Last Light of Durin's Day, The Misty Mountains Cold, Misty Mountains Raider, Óin the Brave, Pinecone Strike, Ragged Short Spear, Smaug, the Great Calamity, Spew Flame, Smaug's Fury, Snowslope Hunter, Stone-Giant of High Pass, Tidings of War.
- **Engine:** nothing new.
- **Left for later:** Getaway Barrel (a random creature card among the revealed cards).
- **Tests:** 35 rules tests ("lot A, red").

## Sublot A5: green cards ✅ (139 / 188)

- **Cards (27):** Attercop, Bejeweled Warg, Beorn, Reluctant Host, Till and Tend, Beorn the Fierce, Beorn's Hospitality, Boughside Wanderers, Cantankerous Keepers, Dancing from Dark to Dawn, Down in the Valley, Galion, Elvenking's Butler, Gigantic Big Bear, Guardian of the Halls, Little Bear, Mirkwood Pathmaker, Nasty Little Rabbit, The Notary Hobbits, Old Fat Spider, Part in Friendship, Quarrel, Radagast of Rhosgobel, Through the Forest Gate, Troll Negotiations, Warg Tactics, Wargling, Wilderland Scrounger, Wood Elves, Woodland Weavemaster.
- **Engine fix:** a restricted mana ability ("spend this mana only to…") tapped by hand put its mana into the free pool; it now goes into the restricted pool, as during an automatic payment (Woodland Weavemaster, Castle Doom…; test in `rulings.test.ts`). The displayed pool shows this reserved mana, underlined with dots (`PlayerView.restrictedMana`, verified in the browser). `RULES_VERSION` = 57, golden games regenerated.
- **Tests:** 36 rules tests ("lot A, green") and one in `rulings.test.ts`.

## Sublot A6: multicolor, colorless cards and lands ✅ (177 / 188)

- **Multicolor cards (19):** Bard, King of Dale, Bard the Bowman, Bard's Company, Bifur, Melodic Rider, Bolg of the North, Bolg's Company, The Chief Warg, Duskwatch Hunter, Eagle's Rescue, Fearsome Goblin Pair, Goblin Plate Mail, The Great Goblin, Mirkwood Nurturer, Nori, Teller of Tales, Patient Instructor, Silvan Reveler, Thranduil, Sindarin Liege, Silvan Rally, Thranduil's Company, Tom, Bert, and William.
- **Colorless cards and lands (21):** Long-Bodied Grey Dog, Old Thrush, Troop of Ponies, The Arkenstone, Seek the Heart, The Black Arrow, Dwarven Mattock, Giant's Boulder, Glamdring, Foe-hammer, Gleam of Death, My Precious, Allure of Power, Orcrist, Goblin-cleaver, Sting, Bilbo's Sword, Thrór's Map, Well-Worn Spatula, Elvenking's Halls, Goblin-town, Iron Hills, Lake-town, Mirkwood, Hobbit Hole.
- **Engine:** nothing new. Recruiting ("draw, discard; a discarded nonland card gives a 1/1 Human Soldier"), written three times in lot A, is gathered in `hob/common.ts` (`recruit()`).
- **Left for later:** Dwalin, Weaponmaster (hone counters on Equipment), Smaug, Wicked Worm ("if mana from a Treasure was spent to cast it"), Thranduil, the Elvenking (activated abilities of Elf cards in the graveyard), Key to the Side-Door ("a legendary card with the same name as a legendary permanent you control").
- **Tests:** 57 rules tests ("lot A, multicolor" and "lot A, colorless and lands").

## Sublot C1: unique cards ✅ (188 / 188)

- **Cards (11):** Elrond, Moon-Reader, Master's Councillors, Thranduil's Decree, Inside Information, The Master of Lake-town, Supper for Spiders, Getaway Barrel, Dwalin, Weaponmaster, Smaug, Wicked Worm, Thranduil, the Elvenking, Key to the Side-Door.
- **Engine:**
  - hone counters (122.1): each counter on an Equipment gives +1/+0 to the equipped creature, in layer 7c (Dwalin; Sting no longer needs its own static, approximation lifted);
  - `amount.graveyardsWithAtLeast(n)` (also in the P/T computed by the layers);
  - trigger "whenever you activate an ability of [a creature]" (`activateAbility.source`); "if mana from a [Treasure] was spent to cast it" (`castSpell.usingManaFrom`, last known information of the sacrificed Treasure);
  - counterspell that exiles a permanent spell and remembers the card (`counter.exilePermanents`, `storeMoved`); permission to play by paying life equal to the mana value (`grantPlay.payLifeManaValue`);
  - `lookAtTop.random` (a random card among those that match);
  - activated abilities of the matching cards in the graveyard (`gainActivatedFromGraveyard`);
  - filters `sameNameAs` ("with the same name as a [filter] permanent") and `fromBattlefieldThisTurn` (`GameObject.arrivedFrom`, set by `moveObject`);
  - `RULES_VERSION` = 58, golden games regenerated.
- **Tests:** 11 rules tests ("lot C1").

## End of set: fixes found by the full verification

- **Control of an Aura (613.1b):** the control given by an Aura (or a "for as long as" effect) returns as soon as it leaves the battlefield, without waiting for state-based actions (Banishing Betrayal returns the Aura then asks for a scry; found by the "chaos" fuzz; test in `rulings.test.ts`). `RULES_VERSION` = 59.
- **Safety ceilings:** an expert AI simulation accumulated copies of Exalted Sunborn (token doubler) until it asked for 2^2058 tokens, an endless loop. An event creates at most 100 tokens, none beyond 400 objects on the battlefield, and a replaced amount is capped at one million; a draw stops at the empty library (found by the "AI levels" fuzz; general approximation in `docs/approximations.md`). `RULES_VERSION` = 60.

## PLAN-M M8b (rules 200)

- **Bard, King of Dale:** "except the first one you draw in each of your draw steps" (`EventReplacement.exceptTurnDraw`, the key of Orcish Bowmasters' draw trigger), read by `drawCards`; a card drawn in the upkeep no longer makes the draw step's card doubled. Test added.
- **Galion, Elvenking's Butler:** base power and base toughness each Galion's (`modify.basePT` as a pair), without a toughness correction left over. Test added.
- **Bilbo, Thief in the Night:** the reduction applies to spells cast from the library and the command zone too (`costReduction.fromZones`); only an instant or sorcery cast with its attack trigger is exiled (`castNow.afterFilter`), an artifact countered goes to the graveyard. Tests added.
