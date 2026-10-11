# Avatar: The Last Airbender (TLA, 280 cards)

Mechanics and details of the lots.

Set requested by the user on 2026-10-02, before Marvel Super Heroes. 28 cards were already handled since the meta phase (lots M1 to M6, `docs/extensions/meta.md`): earthbend (`fx.earthbend`), airbend (`fx.airbend`) and firebending (read from the text), Lessons, Allies… The set follows the integration rules of CLAUDE.md (debt, R1, R7). Breakdown: one sub-lot and one commit per color for lot A, per mechanic for lot B, per family of unique cards afterwards.

| Mechanic | Lot |
|---|---|
| Foundation: waterbend (ability costs), firebending until end of combat, tokens | 0 |
| Cards feasible with the engine, by color | A1 to A6 |
| Remaining flagship mechanics (waterbend as a spell cost, "whenever you waterbend/earthbend/…") | B |
| Legendaries and unique cards | C and following |

The scripts are in `packages/cards/src/tla/`: `cards` (meta cards), `white`, `blue`, `black`, `red`, `green`, `multi`, `artifacts` (colorless cards and lands) and `legends`. The helpers are in `tla/common.ts`.

## Sub-lot 0: foundation ✅ (28 / 280)

- **Waterbend:** `activated({ mana: "{3}", waterbend: true, … })` ("Waterbend {3}: …"); when paying, each untapped artifact or creature you control can be tapped to pay {1} (`WATERBEND` source of the mana solver, after lands, capped by `ManaPurpose.waterbend`), X included ("Waterbend {X}").
- **Firebending N:** `firebending(n)` (DSL; N can be an amount); the mana lasts until end of combat (`fx.addManaUntilEndOfCombat`, `manaKeepCombat` pool), no longer until end of turn (approximation removed). Also read from the text among other keywords ("Flying, firebending 2", "Trample, firebending 4, haste").
- **Tokens:** 2/2 red Soldier with firebending 1, 1/1 red Monk with prowess, 4/4 green Bear; Ally, Spirit and 4/4 Dragon (firebending 4) already existed; Clue and Food come from the commons.
- **Rules version:** 38.
- **Tests:** 5 tests in `engine/test/tla.test.ts` ("foundation"); smoke test `ai/test/smoke/tla.test.ts`.

## Sub-lot A1: white cards ✅ (63 / 280)

- **Cards (35):** Aang, the Last Airbender, Aang's Iceberg, Airbender's Reversal, Airbending Lesson, Appa, Loyal Sky Bison, Avatar Enthusiasts, Compassionate Healer, Curious Farm Animals, Earth Kingdom Jailer, Earth Kingdom Protectors, Enter the Avatar State, Fancy Footwork, Gather the White Lotus, Glider Kids, Glider Staff, Hakoda, Selfless Commander, Invasion Reinforcements, Jeong Jeong's Deserters, Kyoshi Warriors, The Legend of Yangchen // Avatar Yangchen, Master Piandao, Momo, Playful Pet, Path to Redemption, Rabaroo Troop, Razor Rings, Sandbenders' Storm, South Pole Voyager, Southern Air Temple, Suki, Courageous Rescuer, Team Avatar, United Front, Vengeful Villagers, Water Tribe Captain, Water Tribe Rallier, Yip Yip!
- **Engine:** nothing new (existing forms: filtered `playFrom` the top of the library, `countResolution`, `damageStoringExcess`, the foundation's waterbend).
- **Left for later:** Destined Confrontation (each player keeps creatures with total power 4 or less and sacrifices the others).
- **Tests:** 35 rules tests ("lot A, white").

## Sub-lot A2: blue cards ✅ (93 / 280)

- **Cards (30):** Boomerang Basics, Ember Island Production, First-Time Flyer, Flexible Waterbender, Forecasting Fortune Teller, Geyser Leaper, Giant Koi, Gran-Gran, Honest Work, Invasion Submersible, Katara, Bending Prodigy, Knowledge Seeker, The Legend of Kuruk // Avatar Kuruk, Lost Days, Master Pakku, The Mechanist, Aerial Artisan, North Pole Patrol, Octopus Form, Otter-Penguin, Rowdy Snowballers, Serpent of the Pass, Sokka's Haiku, The Spirit Oasis, Teo, Spirited Glider, Tiger-Seal, Ty Lee, Chi Blocker, Waterbender Ascension, Waterbending Scroll, Watery Grasp, Yue, the Moon Spirit.
- **Engine:** nothing new; the foundation's waterbend serves ten abilities. The extra turn (Avatar Kuruk) now serves two cards: its debt entry is removed.
- **Left for later:** Benevolent River Spirit, Crashing Wave, Spirit Water Revival, Secret of Bloodbending (waterbend as a spell cost; control of the opponent during their next combat phase), The Unagi of Kyoshi Island (ward "waterbend {4}"), Waterbending Lesson ("unless you waterbend {2}").
- **Tests:** 38 rules tests ("lot A, blue").

## Sub-lot A3: black cards ✅ (122 / 280)

- **Cards (29):** Azula Always Lies, Azula, On the Hunt, Beetle-Headed Merchants, Boiling Rock Rioter, Buzzard-Wasp Colony, Canyon Crawler, Cat-Gator, Corrupt Court Official, Dai Li Indoctrination, Epic Downfall, Fatal Fissure, The Fire Nation Drill, Fire Nation Engineer, Fire Navy Trebuchet, Foggy Swamp Hunters, Hog-Monkey, Joo Dee, One of Many, June, Bounty Hunter, Mai, Scornful Striker, Merchant of Many Hats, Northern Air Temple, Ozai's Cruelty, Phoenix Fleet Airship, Pirate Peddlers, Sold Out, Swampsnare Trap, Tundra Tank, Wolfbat, Zuko's Conviction.
- **Engine:** nothing new (emblem linked to the source for Fatal Fissure, linked cards cast from exile for Boiling Rock Rioter, cost reduction depending on the targeted Aura for Swampsnare Trap).
- **Left for later:** Foggy Swamp Visions and Ruinous Waterbending (waterbend as a spell cost), Koh, the Face Stealer (abilities of the last chosen card), Lo and Li, Twin Tutors (keywords given to spells), The Rise of Sozin // Fire Lord Sozin (total mana value X of the targets).
- **Tests:** 34 rules tests ("lot A, black").

## Sub-lot A4: red cards ✅ (151 / 280)

- **Cards (29):** Boar-q-pine, Bumi Bash, The Cave of Two Lovers, Combustion Man, Crescent Island Temple, Cunning Maneuver, Deserter's Disciple, Fire Nation Attacks, Fire Nation Cadets, Fire Nation Raider, Fire Sages, Firebending Student, How to Start a Riot, Jeong Jeong, the Deserter, Jet's Brainwashing, Mai, Jaded Edge, Mongoose Lizard, Ran and Shaw, Rough Rhino Cavalry, Solstice Revelations, Tiger-Dillo, Treetop Freedom Fighters, Twin Blades, Ty Lee, Artful Acrobat, War Balloon, Wartime Protestors, Yuyan Archers, Zhao, the Moon Slayer, Zuko, Exiled Prince.
- **Engine:** nothing new; the foundation's firebending also serves as an amount (Firebending Student: "firebending X, where X is its power") and granted conditionally (Fire Nation Cadets).
- **Left for later:** Fated Firepower (damage increased by the number of fire counters), Firebender Ascension (copy a triggered ability from an attack), The Last Agni Kai (excess damage from a fight; keep red mana), Redirect Lightning (additional cost "5 life or {2}"), Sozin's Comet (foretell).
- **Tests:** 37 rules tests ("lot A, red").

## Sub-lot A5: green cards ✅ (182 / 280)

- **Cards (31):** Allies at Last, Badgermole, Badgermole Cub, The Boulder, Ready to Rumble, Cycle of Renewal, The Earth King, Earth Kingdom General, Earth Rumble, Earthbending Lesson, Elemental Teachings, Flopsie, Bumi's Buddy, Foggy Swamp Vinebender, Great Divide Guide, Haru, Hidden Talent, Invasion Tactics, Kyoshi Island Plaza, Leaves from the Vine, The Legend of Kyoshi // Avatar Kyoshi, Origin of Metalbending, Ostrich-Horse, Pillar Launch, Raucous Audience, Rebellious Captives, Rockalanche, Rocky Rebuke, Seismic Sense, Sparring Dummy, True Ancestry, Turtle-Duck, Unlucky Cabbage Merchant, Walltop Sentries.
- **Engine fix (608.2h):** the power and toughness of the creature of an event that left the battlefield ("when it dies, X is its power") are its last known information, not those of the card it became. The defect also affected cards already handled (Rakdos Joins Up, cards from ECL, MKM, FIN and LCI). Test drawn from the rules in `rulings.test.ts`.
- **Badgermole Cub:** its triggered mana ability is a mana replacement (R1, family I), like Lavaleaper (justified audit entry).
- **Left for later:** Avatar Destiny, Toph, the Blind Bandit (P/T defined by the number of counters), Earthen Ally (+1/+0 per color among your Allies), Diligent Zookeeper (+1/+1 per creature type of each), Bumi, King of Three Trials ("up to X modes" for a triggered ability).
- **Rules version:** 39.
- **Tests:** 33 rules tests ("lot A, green") and 1 test drawn from the rules.

## Sub-lot A6: multicolor, colorless and lands ✅ (252 / 280)

- **Multicolor (44):** Air Nomad Legacy, Azula, Cunning Usurper, Beifong's Bounty Hunters, Bitter Work, Bumi, Unleashed, Cat-Owl, Cruel Administrator, Dai Li Agents, Dragonfly Swarm, Earth Kingdom Soldier, Earth King's Lieutenant, Earth Rumble Wrestlers, Earth Village Ruffians, Fire Lord Azula, Fire Lord Zuko, Foggy Swamp Spirit Keeper, Guru Pathik, Hei Bai, Spirit of Balance, Hermitic Herbalist, Iroh, Tea Master, Jet, Freedom Fighter, Katara, the Fearless, Katara, Water Tribe's Hope, The Lion-Turtle, Long Feng, Grand Secretariat, Messenger Hawk, Platypus-Bear, Pretending Poxbearers, Professor Zei, Anthropologist, Sandbender Scavengers, Sokka, Bold Boomeranger, Sokka, Lateral Strategist, Sokka, Tenacious Tactician, Suki, Kyoshi Warrior, Sun Warriors, Tolls of War, Toph, Hardheaded Teacher, Toph, the First Metalbender, Uncle Iroh, Vindictive Warden, Wandering Musicians, White Lotus Reinforcements, Zhao, Ruthless Admiral, Zuko, Conflicted.
- **Colorless and lands (26):** Aang's Journey, Energybending, Zuko's Exile, Barrels of Blasting Jelly, Bender's Waterskin, Fire Nation Warship, Kyoshi Battle Fan, Meteor Sword, Trusty Boomerang, The Walls of Ba Sing Se, Agna Qel'a, Airship Engine Room, Boiling Rock Prison, Fire Nation Palace, Foggy Bottom Swamp, Jasmine Dragon Tea Shop, Kyoshi Village, Meditation Pools, Misty Palms Oasis, North Pole Gates, Omashu City, Rumble Arena, Secret Tunnel, Serpent's Pass, Sun-Blessed Peak, White Lotus Hideout.
- **Engine:** "X can't be 0" (`activated({ minX: 1 })`): the ability is offered only if X can reach its minimum, an activation with a smaller X is refused, and the AI and the interface (X slider) respect it. Without it, the random AI activated Katara, Water Tribe's Hope for X = 0 endlessly (unfinished fuzz games). Gogo, Master of Mimicry (FIN) benefits. Rules version: 40. Fire Lord Zuko ("a permanent enters from exile", excluding spells cast from exile, already counted by his first half) goes through an exile → battlefield zone change; Fire Nation Warship also dies when it is not a creature (700.4, `putIntoGraveyardSelf`).
- **Left for later:** Avatar Aang ("whenever you waterbend…"), Hama, the Bloodbender (waterbend as an alternative cost), Iroh, Grand Lotus (flashback given to graveyard cards), Ozai, the Phoenix King (unspent mana that becomes red), Planetarium of Wan Shi Tong (cast the top card of the library), White Lotus Tile (largest number of creatures sharing a type).
- **Tests:** 43 rules tests ("lot A, multicolor") and 19 ("lot A, colorless and lands").

## Sub-lot B1: waterbend as a spell cost ✅ (261 / 280)

- **Cards (9):** Benevolent River Spirit, Crashing Wave, Spirit Water Revival, Secret of Bloodbending, The Unagi of Kyoshi Island, Waterbending Lesson, Foggy Swamp Visions, Ruinous Waterbending, Hama, the Bloodbender.
- **The engine gains:**
  - waterbend as an additional spell cost, read from the text: mandatory ("waterbend {5}", `CardDef.waterbend`), with X ("waterbend {X}", `xCost: "waterbend"`) or optional ("you may waterbend {N}", a `kickerKind: "waterbend"` kicker, read by `cond.kicked`); the part payable by tapping artifacts and creatures is exactly that of waterbend (`waterbendAmount`, `ManaPurpose.waterbend`), depending on the kicker and X;
  - ward "Ward—Waterbend {4}" (`ward.waterbend`), "unless you waterbend {2}" (`fx.unlessPays(…, { waterbend: true })`) and "you may waterbend" (`fx.mayWaterbend`);
  - linked cards cast by waterbending {X}, X being their mana value (`playFrom: { zone: "linked", waterbend }`, Hama; PLAN-H H7b);
  - control of a player during their next combat phase only (`fx.controlNextTurn(who, true)`, `turnControl.combatOnly`), announced in the log;
  - `fx.countersDivided(total, objects, { counter, anyNumber })`: another kind of counter (stun), divided on resolution among any number of objects.
- **Debt:** control of another player (`controlNextTurn`) now serves two cards: its entry is removed.
- **Rules version:** 41.
- **Tests:** 9 rules tests ("lot B1").

## Sub-lot B2: "whenever you waterbend" ✅ (262 / 280)

- **Card:** Avatar Aang // Aang, Master of Elements.
- **The engine gains:**
  - the event "you bend [the element]" (`bent`, `RulesEvent` `bend`): water when a waterbend cost is paid (ability, spell, ward, "unless", "you may"), earth and air when the effect happens, fire when the firebending ability resolves; noted in the turn log;
  - the trigger `when.bend(kinds?)` and the log query `{ event: "bend", distinctKinds: true }` ("if you have done all four this turn");
  - cost reduction by symbols (`spellCost.reduceSymbols`): each symbol removes a symbol of its color, otherwise {1} of the generic part (601.2f).
- **Approximation removed:** Aang, Swift Savior (meta) now pays "waterbend {8}" by also tapping his artifacts and creatures.
- **Rules version:** 42.
- **Tests:** 3 rules tests ("lot B2").

## Sub-lot C1: characteristics and amounts ✅ (268 / 280)

- **Cards (6):** Toph, the Blind Bandit, Earthen Ally, Diligent Zookeeper, Avatar Destiny, White Lotus Tile, Bumi, King of Three Trials.
- **The engine gains:**
  - in P/T defined by an ability: counters on permanents (`countersAmong`, Toph), colors among the permanents of a full filter (`colorsAmong`, "among your Allies"), excluded types and subtypes (`notTypes`, `notSubtype`);
  - `staticAbility(…, { perAmount })`: P/T multiplied by an amount computed like a CDA P/T (Earthen Ally);
  - `LayerMods.perOwnCreatureTypes`: a bonus multiplied, for each affected object, by its number of creature types, with a cap (Diligent Zookeeper; a changeling is also Human); since PLAN-M M3a, `perAffected { what: "ownCreatureTypes", max }`;
  - the amount `maxSharingCreatureType(filter)` ("the greatest number of creatures that share a creature type", changelings included);
  - the modes of a conditional triggered ability ("up to X modes" written as combinations, each with its condition, like the "one or both" already in place);
  - `fx.scry(n, player)`: scry done by a targeted player.
- **Approximation removed:** Dragonfly Swarm counts "noncreature, nonland" cards exactly.
- **Avatar Destiny** benefits from the 608.2h fix of lot A5 (the power of the dead creature).
- **Rules version:** 43.
- **Tests:** 6 rules tests ("lot C1").

## Sub-lot C2: casting and mana ✅ (275 / 280)

- **Cards (7):** Redirect Lightning, Sozin's Comet, The Last Agni Kai, Lo and Li, Twin Tutors, Iroh, Grand Lotus, Ozai, the Phoenix King, Planetarium of Wan Shi Tong.
- **The engine gains:**
  - foretell (702.143): "Foretell {2}{R}" read from the text, special action during your turn (pay {2}, exile the card from hand), cast on a later turn for the foretell cost (`exiledVia` of kind `foretell`); justified debt entry (a single card); since PLAN-M M3a, the special action is the `exileToCast` operation shared with plot (`kind: "foretell"`);
  - "as an additional cost, pay N life or pay {M}" (`kickerCost.life` with `kickerOrPay`, read from the text);
  - `playFrom` with `flashback` and `cost`: flashback given to graveyard cards (Iroh, Grand Lotus: their mana cost, or {1} for Lessons);
  - the top card of the library cast by a permission (`castNow`, Planetarium of Wan Shi Tong);
  - `fx.fight(a, b, storeExcess)`: the excess damage of a fight;
  - the `keepUnspentMana` family (500.4): these types do not empty (The Last Agni Kai, by `fx.thisTurn`), or all mana becomes red (Ozai); the condition `cond.manaPoolAtLeast(n)`, the mana pool now advancing the state version (layer cache);
  - `spellKeywords`: keywords given to the player's spells (Lo and Li: "your Lesson spells have lifelink"), read at damage time.
- **Rules version:** 44.
- **Tests:** 8 rules tests ("lot C2").

## Sub-lot C3: last unique cards ✅ (280 / 280)

- **Cards (5):** Destined Confrontation, Fated Firepower, Firebender Ascension, Koh, the Face Stealer, The Rise of Sozin // Fire Lord Sozin.
- **The engine gains:**
  - `fx.keep(players, "totalPower", filter, { max: N })` (operation `keep` since PLAN-H H8a): each player chooses permanents with total power N or less (a larger choice is refused), then all sacrifice the others at the same time;
  - `eventReplacement({ modify: { add: amount.countersOn(ref.self, kind) } })` (`addSourceCounters` before PLAN-H H7a): as much extra damage as there are counters of that kind on the replacement's source (Fated Firepower);
  - the event "an attacking creature caused one of its abilities to trigger" (`when.attackAbilityTriggered`) and the reference `ref.abilitiesFromEventObject` (the ability to copy);
  - the name chosen among designated cards (`fx.chooseForSelf("cardName", { optionsFrom })`) and `gainLinkedActivated: { triggered, chosenName }`: the activated and triggered abilities of the last linked card chosen (Koh);
  - `maxTotalManaValueAmount`: the total mana value of the targets of a reflexive ability, evaluated when it is put on the stack (Fire Lord Sozin: the X paid).
- **Debt:** `chooseCardName` and `exileNamed` now serve two cards (Ancient Vendetta, The Rise of Sozin): their entries are removed.
- **Rules version:** 45.
- **Tests:** 6 rules tests ("lot C3").

## PLAN-M M8b (rules 200)

- **Azula, Cunning Usurper:** the exiled cards are cast during your turn as though they had flash (`PlayFromZone.anyTime`). Test added.
- **Zuko, Conflicted:** the fourth mode returns Zuko directly under the chosen opponent's control (`MoveSpec.controller`, read by `moveTo`: the chosen player is the one under whose control it enters, no control-changing effect). Test extended.
- **Avatar's Wrath:** `castLimit.from: "elsewhere"` (former `exceptFromHand`), no change of behavior.

## PLAN-M M10a (rules 203)

- **Elemental Teachings:** the lands found are held in the library (revealed); the opponent chooses two among them for the graveyard, the rest enter tapped, then shuffle. Test extended (the opponent's options are the cards found, never through the hand).
- **Aang's Journey:** kicked, a single search for "a basic land card and a Shrine card" (`search.each`: each card taken for a different filter; two basic lands are refused), revealed, one shuffle. Test added.
