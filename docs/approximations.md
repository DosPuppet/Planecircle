# Known approximations

To be lifted if a card requires it. Search for the name of the card or the mechanic.

## General

Each entry carries its nature:

- `rule`: the result may differ from the official rules;
- `timing`: the right result, but a choice made at a different moment than in the rules;
- `auto choice`: the engine chooses in the player's place, as is often the case on Arena.

- `timing` **Blocks in multiplayer:** declared one after the other in APNAP order, without seeing those of the others (hidden until the last defender), then applied together (509.1); block taxes are paid at declaration.
- `auto choice` **Multiple "instead of the graveyard" replacements (616.1):** the self-replacement goes first (Progenitus), then a single "exile it instead" applies, chosen for the affected player: it discards those that benefit an opponent (life, linked card), then takes the oldest (`replaceGraveyard`).
- `auto choice` **Replacements that modify a number (616.1):** damage, counters, life gained, cards drawn or milled, tokens created, mana produced. The order is chosen for the affected player, to the best of their interests (the least damage, harmful counters and milled cards, even when they mill themselves; the most life, other counters, cards, tokens and mana, except beyond their library; `chooseReplacementOrder`, `modifiers.ts`). They cannot choose a less favorable order. Beyond five replacements of the same event, the order of the code.
- `rule` **Layer dependencies (613.8):** the conditions of static abilities, "for each" and P/T defined by an ability that read permanents are re-evaluated on the result of the layers until stable (three passes at most), rather than by the dependency order of 613.8: same result except in case of circular dependency. What remains:
  - "a source that loses all abilities no longer applies its static abilities": at one level only (the statics granted by the same resolution effect or a later one still apply: The Irencrag);
  - a static ability granted by a resolution effect applies (Roar of the Fifth People), but not a static ability granted by another static ability (a test in `layers.test.ts` checks that no card needs it).
- `timing` **Division (601.2d), opponent of the promised gift (702.174a) and new targets of a copy (707.10c):** asked right after the spell is put on the stack (costs paid), before anyone receives priority, and not during announcement; a copy made during a resolution chooses its targets at the end of it. A copy made before the original announced its division announces its own (`stackChoices.ts`); the gift's opponent, for its part, is always the original's (707.10), carried over to the copy once chosen.
- `auto choice` **Aura that enters without being cast, outside a resolution** (return from a linked exile, state-based actions): the first possible host is chosen for the player. During a resolution (`moveTo`), the choice is asked (303.4f).
- `auto choice` **"Enters" effects outside a resolution** (return from a linked exile, state-based actions; 614.1c, 614.12): only the choices are made (type, color, name, mode, model of a copy), with the suggested answer; the other "enters" effects are not (Sin removes no counters, Mox Diamond enters without a discard, devour sacrifices nothing), and riot takes the default choice. A permanent spell that resolves, a land played (the first question comes with the decision, the following ones take the suggestion) a permanent put onto the battlefield by an effect (`moveTo`, `arrivalChoices`) a token copy created by an effect (`copyToken`, PLAN-L L5), ninjutsu (an effect of its ability) and sneak (a cast spell) ask the player the questions (`asEntersChoices`, PLAN-H H9).
- `auto choice` **Untap up to N lands:** the lands are chosen automatically.
- `auto choice` **Mana abilities with a cost (605.1a):** they resolve without the stack, but only when activated by hand: the automatic payment does not use them (Ramos, Capital City, Loot, the Pathfinder, Phyrexian Altar, Phyrexian Tower, Sunken Ruins...; the automatic payment never sacrifices a creature).
- `auto choice` **Amass (701.47a):** the counters go on your first Army (no choice when you control several).
- `auto choice` **Payment details (as on Arena):** outside full control, the automatic payment chooses the objects that help pay (waterbend, convoke, improvise, delve, Cave, after the lands), uses the {0} of Kíli the Resourceful for the first equip of the turn, and chooses the other permanent tapped by Gene Pollinator or Relic of Legends (one without a mana ability first); in full control, the player chooses them (PLAN-M M6).
- `timing` **Commander to a hand or a library (903.9b):** it is a replacement, but the question ("Put ... into the command zone?") is asked right after its arrival in hand or in the library, at the next check, as from a graveyard or exile (903.9a); a trigger "when a card is put into your hand" would therefore see it go by. Never answered by the autopilot.
- `rule` **"One or more ..." triggers (Ketramose, Dredger's Insight):** one trigger per batch of simultaneous events (an effect of a resolution, a combat damage step, a state-based actions pass); events outside a batch (costs paid while casting a spell or activating an ability) count as a single batch.
- `timing` **Costs paid before the mana:** a permanent exiled, returned or sacrificed for an additional or alternative cost leaves the battlefield before the mana is paid: its mana abilities and its mana replacements (Lavaleaper) no longer help pay for that spell (601.2g-h would allow committing mana earlier). For an activated ability, the mana abilities of the permanents sacrificed for the cost are used first.
- `auto choice` **Controlling another player's turn** (Mindslaver, The Dominion Bracelet): an AI that controls another player's turn contents itself with the default decisions (pass, do not attack).
- `rule` **Token copies created attacking (508.4):** a single choice of defender for all the token copies that one effect creates for one player (Calamity), whereas each could attack a different defender; the copies beyond a doubler keep the defender chosen for their player (myriad). The other tokens created attacking (mobilize…) are divided among the defenders since PLAN-L L5.
- `rule` **Safety caps:** a single event creates at most 100 tokens, and none when the battlefield already holds 400 objects; a replaced amount (damage, counters, life, cards) is capped at one million, and so is an announced X (a larger X is refused: squad paid a billion times built a cost of a billion symbols before failing). Token doublers that multiply (copies of Exalted Sunborn) otherwise gave an infinite number and a blocked game (`engine/src/limits.ts`). Each cut is noted in the game log ("Safety cap reached").

### Outside the game rules

- **Standard legality:** snapshot of the Scryfall legalities at the time of import (`legalities.standard` in `data/<set>.json`). After a rotation or a ban announcement, reimport the sets (`npm run import-cards -- <set>`).
- **Phasing (Robe of Stars):** phased-out permanents are not displayed.
- **Token images:** that of the closest Scryfall token (same name, then same P/T and colors; `data/tokens.json`, `npm run import-tokens`); a token of unknown name keeps the text frame.

## Card by card

In the order they were added, set by set.

- **Several sets:**
  - `rule` Moonlit Meditation, Mirrormind Crown: the token copies created by an effect ("create a token that's a copy of …": Kindle the Inner Flame, myriad) are not replaced (the "you may" is asked for the other tokens, amass, endure and gifts included since PLAN-L L5).
- **Final Fantasy (`docs/extensions/fin.md`):**
  - `rule` Sin, Spira's Punishment: six copies at most per trigger.
- **Aetherdrift (`docs/extensions/dft.md`):**
  - `rule` Skyseer's Chariot: "a nonland card name"; a land card name is also accepted (and can be offered);
  - `rule` Lifecraft Engine: all your Vehicles, even noncreature ones, have the chosen type (the set affected in layer 4 does not follow the 613.8a dependency on crew, which is more recent);
  - `rule` Cursecloth Wrappings: the granted embalm is paid right away (as a sorcery) and the token keeps the colors of the card.
- **Outlaws of Thunder Junction (`docs/extensions/otj-big.md`):**
  - `rule` Fblthp, Lost on the Range: plotting the top card goes through an ability (on the stack) that pays its mana cost;
  - `rule` Riku of Many Paths: a single mode, whatever the number of modes of the spell.
- **Tarkir: Dragonstorm (`docs/extensions/tdm.md`):**
  - `timing` Sidisi, Regent of the Mire: the card with mana value X + 1 is targeted by a reflexive ability, once the cost is paid;
  - `rule` New Way Forward: a spell chosen as a source is recognized by its card alone (another copy of the same card, whoever controls it, would also be affected); the damage is all prevented, after the modifications (doublings) that apply to it.
- **Duskmourn (`docs/extensions/dsk.md`):**
  - `rule` Leyline of Transformation: only creatures on the battlefield (not spells or cards);
  - `auto choice` Say Its Name: Altanak is searched for in the graveyard, then the hand, then the library;
  - `rule` Marvin, Murderous Mimic: only the printed activated abilities of other creatures (not granted ones);
  - `auto choice` Haunted Screen: the automatic payment can pay the life of the {G}/{U}/{R} ability.
- **Bloomburrow (`docs/extensions/blb.md`):**
  - `auto choice` Forage during a resolution ("you may forage. If you do…"): three cards from the graveyard (lands first) if there are at least three, otherwise a Food (a token preferably); as a cost (Feed the Cycle, Osteomancer Adept, Thornvault Forager), the player chooses (PLAN-M M6);
  - `timing` The Infamous Cruelclaw: the card is discarded before casting the spell (and not as a replacement cost during casting);
  - `rule` Rottenmouth Viper: at most as many permanents are sacrificed as the generic cost to pay (one more sacrifice would reduce nothing, but would count for "whenever you sacrifice").
- **The Lost Caverns of Ixalan (`docs/extensions/lci.md`):**
  - `rule` Cavern mana (Bat Colony) and "using mana produced by [source]" (Tecutlan, The Myriad Pools): only the mana committed by the automatic payment;
  - `rule` The Myriad Pools: the permanent becomes a copy of the spell on the stack.
- **Reality Fracture (`docs/extensions/fra.md`):**
  - `rule` Extrapolate the Impossible: does nothing, as on Arena in BO1 (no "outside the game" cards);
  - `rule` Emrakul, the Exigent Doom: the ability granted to the land ends as soon as the card leaves exile, in any way (and not only when it is cast); once cast, it lasts until the spell is cast (601.2i) and can be used to pay for it.
- **Lorwyn Eclipsed (`docs/extensions/ecl.md`):**
  - `rule` Rhys, the Evermore: removes all −1/−1 counters from the target, and only those (neither the number nor the other kinds of counters can be chosen);
  - `rule` Isilu, Carrier of Twilight, Rhys, the Evermore: the granted persist is a triggered ability named "Persist" (without a keyword badge);
  - `rule` Nameless Inversion: "loses all creature types" removes all subtypes and changeling until end of turn;
  - `rule` Foraging Wickermaw: five abilities (one per color), activatable only while it is colorless;
  - `timing` Raiding Schemes: conspire goes through a triggered ability; the two creatures are tapped at its resolution, and not when casting the spell;
  - `timing` Celestial Reunion: the optional additional cost is checked at resolution, for a type of the card found (the player always pays it when they can); the card goes through the hand before the battlefield;
  - `timing` Lavaleaper, Shimmerwilds Growth: the extra mana (triggered mana ability, 605.1b) is added with the land's mana, as a replacement; the payment solver counts that of the same type, not that of another color (Shimmerwilds Growth).
- **Wilds of Eldraine (`docs/extensions/woe.md`):**
  - `timing` Feral Encounter: "at the beginning of the next combat phase this turn" goes through a turn emblem;
  - `auto choice` Yenna, Redtooth Regent: the copy of an Aura attaches to a host chosen by the engine.
- **Secrets of Strixhaven (`docs/extensions/sos.md`):**
  - `rule` Silverquill, the Disputant: the granted victim is a triggered ability at casting (sacrifice a creature, then copy), and not a cost: it can be responded to;
  - `rule` Dina's Guidance: the searched card goes to hand, then you may put it into the graveyard;
  - `rule` Lorehold, the Historian: the granted miracle is a triggered ability on the first draw of the turn (the card is not revealed), which offers to cast it for {2}.
- **Murders at Karlov Manor (`docs/extensions/mkm.md`):**
  - `rule` Living Conundrum: "if your library is empty" is judged once for a multi-card draw;
  - `auto choice` Agency Outfitter: each name is searched for in the graveyard, then the hand, then the library (fixed order);
  - `timing` Archdruid's Charm, Flourishing Bloom-Kin: the searched cards go through the hand before the land enters tapped; the shuffle takes place before;
  - `auto choice` Worldsoul's Rage: the lands are taken from the hand, then from the graveyard;
  - `rule` Expose the Culprit: the exiled cards are not shuffled into a face-down pile before being cloaked (you know each of your face-down cards);
  - `rule` A Killer Among Us: the chosen type is not revealed separately; the ability checks the type at resolution.
- **Avatar: The Last Airbender (`docs/extensions/tla.md`):**
  - `timing` Elemental Teachings: the cards found go through your hand (revealed), then the opponent chooses two;
  - `rule` Raucous Audience: two mana abilities, each under its condition;
  - `rule` Bumi, Unleashed: "only land creatures can attack this combat" forbids the nonland creatures present at resolution from attacking, until end of turn;
  - `rule` Aang's Journey (kicked): two searches, hence two shuffles;
  - `rule` Secret of Bloodbending: without waterbend, the control applies to one combat phase of the opponent's next turn; if that turn has none, it is not carried over to a later turn;
  - `rule` Firebender Ascension: "that ability" is the creature's most recent ability on the stack; if it has already resolved, nothing is copied;
  - `rule` Koh, the Face Stealer: the choice retains a name: if the chosen card leaves exile, Koh keeps its abilities as long as another card of the same name is exiled with it.
- **Marvel Super Heroes (`docs/extensions/msh.md`):**
  - `rule` Bullseye, Death Dealer: "sacrifice an artifact or discard a nonland card" is two abilities;
  - `rule` Cosmic Cube: the card chosen among the six goes through exile while it is being cast (visible to all), then goes to the bottom if you decline;
  - `timing` Worlds Within Worlds: each player chooses and puts their creatures in turn (APNAP order), and not simultaneously;
  - `rule` The Ruinous Wrecking Crew: "up to X modes" is written as combinations of modes, each under the condition X ≥ its number of modes.
- **Marvel's Spider-Man (`docs/extensions/spm.md`):**
  - `rule` The Death of Gwen Stacy: at chapter II, each player chooses then acts in turn (no APNAP choices followed by simultaneous actions);
  - `rule` Spinneret and Spiderling: the threshold of 4 damage is read per damage dealt; combat damage divided among several blockers (2 + 2) does not trigger it.
- **Teenage Mutant Ninja Turtles (`docs/extensions/tmt.md`):**
  - `rule` Turtles Forever: the search only covers the library (nothing outside the game), and "exactly four" is not enforced (the opponent chooses among the cards found);
  - `rule` North Wind Avatar: the engine has no "outside the game" zone (no sideboard during a game): the enters ability has no effect.
- **The Hobbit (`docs/extensions/hob.md`):**
  - `rule` Burglar's Plot: "two target nonland permanents that share a card type" is a modal spell, one mode per type;
  - `rule` Old Fat Spider Can't See Me: at chapter II, the prevention is an ability given to the creature, as long as the Saga stays;
  - `auto choice` Goblin Plate Mail: the Equipment attaches to the Army that receives the amass counters (see the general entry).
- **Reprints, "Unlimited" (`docs/extensions/reprints.md`):**
  - `auto choice` Gemstone Caverns: the card exiled from hand is the nonland card of lowest mana value (a land if there is none);
  - `rule` Drown in the Loch: "mana value less than or equal to the number of cards in its controller's graveyard" is checked at resolution, not at targeting;
  - `rule` All Will Be One: only counters put on permanents trigger the ability;
  - `rule` Henry Wu: the draw and the Treasure are part of the exploit ability it gives (they only happen if he is on the battlefield when it resolves);
  - `rule` Laboratory Maniac: the win that replaces the draw is noted with the state-based actions that follow (like the loss it replaces);
  - `rule` Outlaws' Merriment: the token "chosen at random" is drawn by a three-sided die (shown in the log);
  - `rule` Flesh Duplicate: fading is given even if the copied creature already has it (only when copying another Flesh Duplicate: no handled card has printed fading);
  - `rule` Hunting Velociraptor: the marauding requires combat damage from a Dinosaur (not from any type common to the spell);
  - `rule` Ad Nauseam: the process repeats at most thirty times;
  - `auto choice` Library of Leng: the card discarded by an effect always goes on top of the library (except a card with madness);
  - `rule` Painter's Servant: only permanents take the chosen color (not spells or cards in other zones);
  - `rule` Plague of Vermin: the rounds of payments ("repeat this process until no one pays life") stop after twenty rounds at most (a safety cap);
- **Commander, EDH pseudo-set (`docs/extensions/edh.md`):**
  - `auto choice` Relic of Legends: the automatic payment only uses it once per ability;
  - `rule` New Blood: the text change (612, "replace all instances of a creature type with Vampire") is not done; the stolen creature becomes a Vampire in addition to its other types;
  - `auto choice` Rewind, Unwind, Frantic Search: "untap up to N lands" only untaps your lands, chosen automatically;
  - `auto choice` Foreboding Ruins, Fortified Village, Port Town, Vineglimmer Snarl: a card of the right type in hand is revealed automatically if possible;
  - `auto choice` Scholar of New Horizons: the Plains card goes onto the battlefield as soon as permitted (without offering to put it into hand);
  - `rule` Pandemonium: the target of the damage is chosen by Pandemonium's controller, not by the controller of the creature that enters (exact when it is the same person);
  - `rule` Wheel of Misfortune: the numbers are chosen one after the other (in APNAP order, without seeing those of the others), from 0 to 20;
  - `rule` Creeping Bloodsucker: the life gained is computed (number of opponents), not read from the actual damage (different only if it is replaced);
  - `rule` Incubate (701.53): the transformation is a permanent modification (Phyrexian artifact creature 0/0), not a switch to the back face; the token keeps its name;
  - `rule` Vigor: "when it is put into a graveyard from anywhere, shuffle it into the library" is a replacement: it is shuffled without going through the graveyard (like the Eldrazi);
  - `rule` Coin of Mastery: the excess mana produced by sources (Sol Ring for a single {1}) is first removed from the artifacts' mana.
  - `rule` Collective Effort: escalate is paid {1} per extra mode (and not by tapping a creature);
  - `auto choice` Forgotten Ancient: all its +1/+1 counters go on a single other creature; Resourceful Defense: all the +1/+1 counters are moved;
  - `rule` Yuna, Grand Summoner: the two counters go to the creature spell paid with its mana (and not to the next creature spell of the turn);
  - `rule` Harold and Bob: the chosen Forest gains its ability forever, and the card stays in the graveyard (it does not become an Aura);
  - `rule` Winding Constrictor: the clause "if you would get counters" is not handled;
  - `rule` Young Deathclaws: the granted scavenge is an ability of Young Deathclaws that costs {4} (and not the exiled card's mana cost);
  - `auto choice` Scorched Ruins: the two untapped lands sacrificed on entering are chosen by the engine (the first ones on the battlefield), without asking the player;
  - `rule` Cover of Darkness, Shizo, Death's Storehouse: fear (702.36) is a blocking rule ("can't be blocked except by artifact and/or black creatures"), not a keyword: no card can read that a creature "has fear".
  - `timing` Tivit, Seller of Secrets: each vote takes effect as soon as it is cast (same result: nothing reads the votes); "you may vote an additional time" only applies to Tivit's own votes (the other votes of the catalog, Expropriate and Mob Verdict, have no shared vote helper yet: PLAN-M M10b);
  - `rule` Desperate Ritual: splice onto Arcane is not done (no other Arcane spell in the deck; two in the catalog: We Say Thee Nay!, Hex Magic);
  - `rule` Jeweled Amulet: the type of the mana spent is not noted: the stored mana is one mana of any type;
  - `rule` Tandem Lookout (soulbond, 702.95e): a pair breaks when state-based actions are checked, not at the very moment one of the creatures leaves, changes controller or stops being a creature;
  - `timing` Final Fortune, Last Chance, Warrior's Oath: you lose at the end step of your next turn (the extra turn, unless another one is inserted before it).
  - `rule` Biotransference: only your creatures on the battlefield and your creature spells are artifacts (not your creature cards in the other zones);
  - `rule` Tombstone Stairwell: the world rule (704.5k) is not done (no other world enchantment in the catalog).
  - `rule` Reyhan, Last of the Abzan: "is put into the command zone" only from the battlefield (a commander that dies goes to the graveyard first, then may return to the command zone: the death triggers it).
  - `timing` Animate Dead: the creature card returns during the Aura's resolution, which then enters attached to it (and not by its "enters" triggered ability: nobody can respond while it enchants the card in the graveyard); `rule` put onto the battlefield without being cast, it enchants nothing and stays in its zone;
  - `rule` Jeska, Thrice Reborn: "one of your opponents" (0 ability) is read from the creature's controller (an opposing creature triples the combat damage it deals to its own opponents);
  - `rule` Kardur, Doomscourge: the attack requirements are a goad until your next turn (same requirements; the creatures count as goaded);
  - `rule` Tibalt's Trickery: "choose 1, 2, or 3 at random" is a three-sided die roll (shown as such in the log); the card found is offered with the cascade prompt (cast for free, otherwise to the bottom);
  - `rule` Echoing Assault: it triggers once per attack (not once for each player attacked), and the copy attacks the player its controller chooses;
  - `rule` Possibility Storm: a spell that already left the stack when the ability resolves (countered, exiled by another Possibility Storm) leads to no search (the ruling still has its caster search with its card types); a land card sharing a type with the spell (artifact land) doesn't stop the search, as for cascade; the cards exiled before the one found go to the bottom before it is cast;
  - `timing` Mob Verdict, Prisoner's Dilemma: the "secret" votes and choices are made one after the other, in turn order, each seen by the next players;
  - `rule` Slicer, Hired Muscle: "More Than Meets the Eye" (casting it converted for {2}{R}) is not handled: it is only cast for its mana cost;
  - `rule` Delina, Wild Mage: "you may roll again" is offered ten times at most;
  - `rule` Sundering Eruption: "creatures without flying can't block this turn" affects the creatures present on resolution;
  - `auto choice` Opposition Agent: you choose what the opponent finds, but the other decisions of the search (a "may" in its spell) stay theirs.
