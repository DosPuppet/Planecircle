# Outlaws of Thunder Junction + The Big Score (OTJ, BIG)

**✅ 269 / 269 and 30 / 30** (lots A to C). Mechanics and details of the lots (moved from CLAUDE.md).

| Mechanic | Cards | Lot |
|---|---:|---|
| plot | 32 | A |
| spree | 21 | A |
| crimes ("whenever you commit a crime") | 26 | A |
| outlaws (Assassin, Mercenary, Pirate, Rogue, Warlock) | 13 | A |
| Mounts | 17 | A (DFT engine) |
| hideaway (BIG) | 1 | C |

- Lot A ✅ (OTJ 221/269). It covers:
  - plot (702.170): "Plot {cost}" is read from the text; special action from the hand at sorcery timing (`plotCard`, `GameObject.exiledVia` of kind `plot`); the plotted card is cast for free from exile on a later turn, at sorcery timing (`CastTerms.sorceryTiming`); `fx.plot` (Aven Interrupter, Kellan Joins Up) and "when this card becomes plotted" (triggered from exile);
  - spree (702.172): helper `spree(...)`, which generates all the combinations of modes (`ModeDef.extraCost` added up, paid even if the spell is free; a mode that is too expensive is not offered);
  - crimes (700.13): targeting an opponent, an object they control or a card in their graveyard (`checkCrime` when spells, abilities and triggers are put on the stack); `when.crime`, `cond.crime`;
  - ability counters (122.1b: flying, lifelink, deathtouch…), "if you haven't cast a spell from your hand this turn", conditional flash (`flashIf`), X/X tokens (`fx.createXXToken`), `perHand`, "until the end of your next turn" for exiled playable cards;
  - `checkCondition` now evaluates any amount (sums, an object's power…), and not only counts;
  - drawing advances the state version (Duelist of the Mind).
- Lot B ✅ (**OTJ 269/269**): 48 legendary cards, rares and unique cards (`otj/unique.ts`). The engine gains:
  - attack and block taxes (Archangel of Tithes: `attackTax`, `blockTax`), added costs or reductions depending on the casting zone (`fromZones`: graveyard, exile), "only one spell per turn" (High Noon), the life tax on spells that target (Terror of the Peaks);
  - creatures that saddled or crewed a permanent this turn (`GameObject.crewedBy`, `ref.crewedBy`); "once per turn" Crew read from the text;
  - copying a permanent spell (it becomes a token, 707.10) and copying activated or triggered abilities; the trigger "when you activate an ability that targets" (Ertha Jo);
  - emblems until end of turn, flashback {0}, permissions to play a card from an opponent's graveyard with mana of any type, plot on resolution (Lilah);
  - coin flip (`fx.coinFlip`, public event), extra upkeep steps (approximation: only upkeep triggers), "each player may shuffle their hand and graveyard into their library, then draw seven cards", `exileOnResolve`;
  - doubled legendary triggers, Auras that steal cheaper permanents (Eriette), extra mana from artifact tokens (Roxanne), the turn's noncombat damage bonus (Taii Wakeen);
  - references to the top card of a library, to a player's exiled cards, to all graveyards; the copy linked to an exiled card (Assimilation Aegis; since PLAN-M M3b, a "becomes attached" trigger with `becomeCopy` for as long as it stays attached, like Eriette); legendary tokens and tokens with variable P/T (Beau);
  - the test helper initializes the number of turns taken (`turnsTaken`, for Jace Reawakened).
- Lot C ✅ (**BIG 30/30**, `big/index.ts`): hideaway (Collector's Cage, linked card), Grand Abolisher (`lockOpponentsOnYourTurn`), Rest in Peace (`graveyardToExile`), Torpor Orb, Worldwalker Helm (extra Map token), Territory Forge (activated abilities of the linked card, `gainLinkedActivated`), random pick among linked cards (Omenpath Journey), 3/3 copy tokens (Nexus of Becoming), amounts "different powers" and "card types among".

## PLAN-M M7 (rules 198)

- **Grand Abolisher:** the mana abilities of the opponents' artifacts, creatures and enchantments are locked too (`abilitiesLocked(…, mana)` in `canActivateMana`: neither by hand nor by the automatic payment); Yuriko ("abilities that aren't mana abilities") no longer locks activated mana abilities.
- **Tests:** `big.test.ts` (+1).

## PLAN-M M8b (rules 200)

- **Memory Vessel:** "they can't play cards from their hand" (spells and lands), for each player until your next turn: a player effect `castLimit` with `from: "hand"` (`from: "elsewhere"` replaces Avatar's Wrath's `exceptFromHand`), read by `castTerms` and, for lands, by `landPermitted` (`handLocked`). Test extended (`big.test.ts`).

## PLAN-M M10d (rules 206)

- **Riku of Many Paths:** "choose up to X, where X is the number of times you chose a mode for that spell": the cast records it (`CastInfo.modes`: a combination's `ModeDef.chosen`, otherwise the number the text says, "choose two"), Riku's combinations of modes are each offered under the condition X ≥ their number of modes (or none; the trigger's mode conditions read the event's spell). Test added (two modes of Rush of Dread: pairs, not the three); approximation removed.
- **Fblthp, Lost on the Range:** the top card of your library, if it isn't a land, has plot for its mana cost (and its own plot cost if it has one): a special action from the library (`plotFromLibraryTop`, `libraryTopPlot`, `ActivatedAbilityDef.fromLibraryTop`), no ability on the stack. Test rewritten; approximation removed.
