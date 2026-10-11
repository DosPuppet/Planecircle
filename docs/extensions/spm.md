# Marvel's Spider-Man (SPM, 188 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-02, after Marvel Super Heroes, together with Teenage Mutant Ninja Turtles and The Hobbit. 10 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): Web-slinging (read from the text, alternative cost that returns a tapped creature to hand), Mayhem (read from the text: a card discarded this turn is cast from the graveyard for its mayhem cost), Superior Spider-Man (copy of a graveyard card on entering)… The set follows the integration rules of CLAUDE.md (debt, R1, R7). Split: one sublot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Core: tokens, "modified" | 0 |
| Cards doable with the engine, by color | A1 to A6 |
| Remaining flagship mechanics | B |
| Legendary and unique cards | C and following |

The scripts are in `packages/cards/src/spm/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi` and `artifacts` (colorless and lands). The helpers are in `spm/common.ts`.

## Sublot 0: core ✅ (10 / 188)

- **Tokens:** 1/1 green and white Human Citizen, 2/1 green Spider with reach, 1/1 colorless (artifact) Robot with flying, 3/3 blue Villain Illusion; Treasure and Food come from the commons.
- **Engine:** filter `modified` (700.9): a permanent that has a counter, is equipped, or is enchanted by an Aura its controller controls.
- **Tests:** smoke test `ai/test/smoke/spm.test.ts`; "modified" filter in `rulings.test.ts`.

## Sublot A1: white cards ✅ (30 / 188)

- **Cards (20):** Anti-Venom, Horrifying Healer, City Pigeon, Costume Closet, Daily Bugle Reporters, Flash Thompson, Spider-Fan, Friendly Neighborhood, Origin of Spider-Man, Rent Is Due, Selfless Police Captain, Silver Sable, Mercenary Leader, Spectacular Spider-Man, Spectacular Tactics, Spider-Man, Web-Slinger, Spider-UK, Starling, Aerial Ally, Sudden Strike, Thwip!, Web Up, Web-Shooters, Wild Pack Squad.
- **Engine:** `onPrevent.counters` of a damage replacement: that many counters on the replacement's source, within the replacement itself (Anti-Venom; test in `rulings.test.ts`).
- **Left for later:** Arachne, Psionic Weaver (card type chosen on entering, tax for all players), Peter Parker // Amazing Spider-Man (Web-slinging granted to colored legendary spells), With Great Power . . . (damage redirection, permanents attached to the host).
- **Tests:** 32 rules tests ("lot A, white").

## Sublot A2: blue cards ✅ (49 / 188)

- **Cards (19):** Amazing Acrobatics, Beetle, Legacy Criminal, Doc Ock, Sinister Scientist, Doc Ock's Henchmen, Flying Octobot, Hide on the Ceiling, Impostor Syndrome, Lady Octopus, Inspired Inventor, Madame Web, Clairvoyant, Mysterio, Master of Illusion, Mysterio's Phantasm, Oscorp Research Team, Robotics Mastery, School Daze, Secret Identity, Spider-Byte, Web Warden, Spider-Man No More, Unstable Experiment, Whoosh!.
- **Engine:** nothing new ("one or both": a third mode "both").
- **Left for later:** Chameleon, Master of Disguise (copy on entering, except the name), The Clone Saga (nonlegendary copy of the next creature spell, chosen name kept by an emblem), Norman Osborn // Green Goblin (mayhem for all nonland cards in the graveyard).
- **Tests:** 26 rules tests ("lot A, blue").

## Sublot A3: black cards ✅ (69 / 188)

- **Cards (20):** Agent Venom, Common Crook, The Death of Gwen Stacy, Eddie Brock // Venom, Lethal Protector, Inner Demons Gangsters, Merciless Enforcers, Morlun, Devourer of Spiders, Parker Luck, Prison Break, Risky Research, Scorpion, Seething Striker, Scorpion's Sting, Spider-Man Noir, The Spot's Portal, Swarm, Being of Bees, Tombstone, Career Criminal, Venom, Evil Unleashed, Venomized Cat, Venom's Hunger, Villainous Wrath.
- **Engine:** nothing new.
- **Left for later:** Alien Symbiosis (cast from the graveyard by discarding a card), Behold the Sinister Six! (targets with different names), Black Cat, Cunning Thief (look at an opponent's library, exile face down), Gwenom, Remorseless (pay life instead of mana), Sandman's Quicksand ("if the mayhem cost was paid"), The Soul Stone (cost "exile a creature you control").
- **Tests:** 30 rules tests ("lot A, black").

## Sublot A4: red cards ✅ (90 / 188)

- **Cards (21, and Shock from MKM):** Angry Rabble, Electro, Assaulting Battery, Electro's Bolt, Gwen Stacy // Ghost-Spider, Heroes' Hangout, Hobgoblin, Mantled Marauder, J. Jonah Jameson, Masked Meower, Maximum Carnage, Molten Man, Inferno Incarnate, Raging Goblinoids, Romantic Rendezvous, Shadow of the Goblin, Shock, Shocker, Unshakable, Spider-Gwen, Free Spirit, Spider-Islanders, Spinneret and Spiderling, Stegron the Dinosaur Man, Taxi Driver, Wisecrack.
- **Engine:** the trigger "whenever you play a land" accepts `from` (zones of origin: "from exile", Ghost-Spider; "from anywhere other than your hand", Shadow of the Goblin); the `playLand` event carries its zone of origin (test in `rulings.test.ts`).
- **Left for later:** Spider-Punk (granted riot, spells and abilities that can't be countered), Spider-Verse (legend rule lifted for Spiders, "once per turn"), Superior Foes of Spider-Man (permission that ends when the source exiles another card).
- **Tests:** 31 rules tests ("lot A, red").

## Sublot A5: green cards ✅ (110 / 188)

- **Cards (20):** Damage Control Crew, Ezekiel Sims, Spider-Totem, Grow Extra Arms, Guy in the Chair, Kapow!, Kraven's Cats, Lizard, Connors's Curse, Lurking Lizards, Miles Morales // Ultimate Spider-Man, Pictures of Spider-Man, Professional Wrestler, Radioactive Spider, Scout the City, Spider-Ham, Peter Porker, Spider-Man, Brooklyn Visionary, Strength of Will, Supportive Parents, Terrific Team-Up, Wall Crawl, Web of Life and Destiny.
- **Engine:** nothing new. The doubling of all counters (Zimone, Paradox Sculptor) also serves Ultimate Spider-Man: its debt entry is removed.
- **Left for later:** Spiders-Man, Heroic Horde ("if it was cast with Web-slinging"), Kraven's Last Hunt (the greatest power among creature cards in your graveyard).
- **Tests:** 26 rules tests ("lot A, green").

## Sublot A6: multicolor, colorless cards and lands ✅ (162 / 188)

- **Multicolor cards (29):** Araña, Heart of the Spider, Biorganic Carapace, Cosmic Spider-Man, Doctor Octopus, Master Planner, Gallant Citizen, Green Goblin, Revenant, Kraven, Proud Predator, Mary Jane Watson, Mob Lookout, Morbius the Living Vampire, Prowler, Clawed Thief, Pumpkin Bombardment, Rhino's Rampage, Scarlet Spider, Kaine, Shriek, Treblemaker, Silk, Web Weaver, Skyward Spider, SP//dr, Piloted by Peni, Spider-Girl, Legacy Hero, Spider-Man 2099, Spider-Man India, Spider-Woman, Stunning Savior, The Spot, Living Portal, Sun-Spider, Nimble Webber, Symbiote Spider-Man, Ultimate Green Goblin, Vulture, Scheming Scavenger, Web-Warriors, Wraith, Vicious Vigilante.
- **Colorless cards and lands (23):** Bagel and Schmear, Doc Ock's Tentacles, Eerie Gravestone, Hot Dog Cart, Living Brain, Mechanical Marvel, Mechanical Mobster, News Helicopter, Passenger Ferry, Peter Parker's Camera, Rocket-Powered Goblin Glider, Spider-Bot, Spider-Mobile, Spider-Slayer, Hatred Honed, Spider-Suit, Steel Wrecking Ball, Subway Train, Daily Bugle Building, Ominous Asylum, Savage Mansion, Sinister Hideout, Suburban Sanctuary, University Campus, Vibrant Cityscape.
- **Engine:** the turn log notes the lands played with their zone of origin (`{ event: "playLand", fromZone }`; Spider-Man 2099: "a land played or a spell cast from anywhere other than your hand"; test in `rulings.test.ts`).
- **Left for later:** Cheering Crowd (mana given to the active player), Jackal, Genius Geneticist (nonlegendary copy, mana value equal to power), Kraven the Hunter ("the greatest power among its controller's creatures"), Mister Negative (exchange of life totals), Rhino, Barreling Brute (mana value of the spells cast, in the log), Scarlet Spider, Ben Reilly (Web-slinging remembered, creature returned); Iron Spider, Stark Upgrade (remove two distributed counters), Oscorp Industries (mayhem of a land), Urban Retreat (cost "return a tapped creature").
- **Tests:** 61 rules tests ("lot A, multicolor" and "lot A, colorless and lands").

## Sublot B1: Web-slinging and Mayhem ✅ (170 / 188)

- **Cards (8):** Spiders-Man, Heroic Horde, Scarlet Spider, Ben Reilly, Peter Parker // Amazing Spider-Man, Norman Osborn // Green Goblin, Sandman's Quicksand, Alien Symbiosis, Oscorp Industries, Urban Retreat.
- **Engine:**
  - Web-slinging: the returned tapped creature is chosen by the player (`bounce` in the decision; `altBounce` in the option, the cheapest first and by default). The interface opens a choice window when there are several;
  - remembered way of casting (`castVia`: `webSlinging` or `mayhem`, on the stack item then on the permanent) and returned creature (`costBounced`): `cond.castVia(…)`, `ref.costBounced` (also read on entering: "X counters, where X is the mana value of the returned creature");
  - `altCostAll` accepts a spell filter and Web-slinging (Amazing Spider-Man: "your colored legendary spells have Web-slinging {G}{W}{U}");
  - mayhem given by a "play from the graveyard" permission (`playFrom.mayhem`, filter `discardedThisTurn`: Goblin Formula); mayhem of a land, with no cost (Oscorp Industries);
  - casting from the graveyard by discarding an extra card (`castFromGraveyard.discard`, Alien Symbiosis);
  - activation cost "return [a permanent] you control to its owner's hand" (`bounceOther`, Urban Retreat).
- **Tests:** 15 rules tests ("lot B1"); one-off Playwright script: the choice window for the returned creature (Scarlet Spider), screenshots in `test-results/spm/`.

## Sublot C1: copies and legends ✅ (175 / 188)

- **Cards (5):** Chameleon, Master of Disguise, The Clone Saga, Jackal, Genius Geneticist, Spider-Verse, Behold the Sinister Six!.
- **Engine:**
  - copy on entering "except its name is [its own]" (`entersAsCopyKeepName`);
  - nonlegendary copy of a spell (`fx.copySpell(…, { nonlegendary })`, `nextSpell.copyNonlegendary`): copiable exception of the token (707.9b);
  - an emblem keeps the chosen card name (The Clone Saga: `nameChosen` in its trigger's filter);
  - comparison `cmp.manaValue("=", amount.sourcePower)` ("with mana value equal to [the source]'s power"); the filters of "whenever you cast a spell" go through `resolveFilter`;
  - `noLegendRule` accepts a filter (Spider-Verse: your Spiders);
  - "do this only once each turn": `oncePerTurn: "ifDone"` and `fx.doneOncePerTurn` (the trigger comes back as long as the optional effect hasn't been done; justified debt entry);
  - targets with different names (`differentNames`, presented as the "different" constraint of the options, which the AI and the interface respect).
- **Tests:** 7 rules tests ("lot C1").

## Sublot C2: costs, amounts and players ✅ (182 / 188)

- **Cards (7):** The Soul Stone, Iron Spider, Stark Upgrade, Cheering Crowd, Mister Negative, Rhino, Barreling Brute, Kraven's Last Hunt, Kraven the Hunter.
- **Engine:**
  - activation costs: "exile [a permanent] you control" (`exileOther`); "remove N counters from among [your artifacts]" (`removeCounterFrom.n`, distributed, those with the most first);
  - `addMana` to another player (`who`: Cheering Crowd, the player whose main phase it is);
  - `fx.exchangeLife(a, b, store)`: exchange of life totals (701.12b), each gains or loses the difference; the controller's loss is remembered (justified debt entry);
  - turn log: the mana value of the spells cast (`minManaValue` in the query);
  - `amount.maxPower(filter, "graveyard")`: the greatest power among the cards in your graveyard;
  - permanents that left during the current decision (`GameState.leftBatch`, emptied at each decision) and `cond.eventObjectGreatestPower`: "the creature with the greatest power among that player's creatures" sees those that died at the same time by their last known information (a single draw after a mass destruction).
- **Debt:** "exploit" now serves two cards (The Mind Stone, The Soul Stone): its entry is removed.
- **Tests:** 11 rules tests ("lot C2").

## Sublot C3: unique cards ✅ (188 / 188)

- **Cards (6):** Arachne, Psionic Weaver, With Great Power . . ., Spider-Punk, Superior Foes of Spider-Man, Black Cat, Cunning Thief, Gwenom, Remorseless.
- **Engine:**
  - filter `typeChosen` (the card type chosen as an entering mode) and tax for all players (`costReduction.everyone`);
  - filter `attached: "toHost"` ("each Aura and Equipment attached to it"); damage replacement `redirectToAttached` ("dealt to the enchanted creature instead");
  - riot (702.136, `riot`, printed keyword): the choice is made when the creature spell resolves ("Riot: a +1/+1 counter or haste?"), also when riot is given by a permanent (Spider-Punk); without a resolution, haste if the creature can still attack this turn;
  - static `uncounterable` (`filter`, `abilities`, `everyone`): replaces `protectSpells` and `protectCreatureSpells` (one less flag). Chimil, the Inner Sun and Hexing Squelcher now protect all your spells, as their text says (approximation lifted, test in `rulings.test.ts`);
  - `grantPlay.replacePrevious` ("until you exile another card with this creature"); `lookAtTop.who` (an opponent's library);
  - playing from the top of the library by paying life equal to the mana value (`playFrom.payLifeManaValue`, like Valgavoth);
  - `RULES_VERSION` = 54, golden games regenerated.
- **Approximations:** Arachne (the opposing hand is not shown), Black Cat (face-up exile).
- **Tests:** 8 rules tests ("lot C3") and one in `rulings.test.ts`.

## PLAN-M M8a (rules 199)

- **Maximum Carnage:** chapter I is the static of an emblem until your next turn (ruling: every creature, those that arrive afterwards too). Test extended.

## PLAN-M M8b (rules 200)

- **Interdimensional Web Watch:** its mana only for spells cast from exile (`ManaRestriction.spellFrom: "exile"`; `spellFrom: "elsewhere"` replaces `spellNotFromHand`, Mm'menon; the payment knows the zone cast from, `ManaPurpose.from`). Test added (Think Twice's flashback refused).
- **Spider-Slayer, Hatred Honed:** "whenever it deals damage to a Spider, destroy that creature": `dealsDamage` with `to: { objects: { subtype: "Spider" } }` and `eventObject: "damaged"` (the event object is what was dealt the damage; the key of Skewer Slinger's `blocks` trigger). Test added (an indestructible Spider shocked afterwards: no trigger).

## PLAN-M M10d (rules 206)

- **Spinneret and Spiderling:** "deals 4 or more damage" adds up the damage dealt at the same time (`batched: "sum"`): 2 + 2 to two blockers triggers once. Test added; approximation removed.
