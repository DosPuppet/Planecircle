# Reality Fracture (FRA)

**✅ 279 / 279** (lots 0 to G, then lot 0.1 of the core). Details of the lots (moved from CLAUDE.md).

- 285 cards according to Scryfall, including 6 reprints from FDN (basic lands, Unsummon), hence 279 original cards. All are legal in Standard.
- **Released on 2026-10-02: no French texts yet.** Reimport after the release (`npm run import-cards -- fra`), then check the French names in the deck builder.
- Lot 0 (multi-set infrastructure) and lot A (cards doable with the engine, Cadet, Heartwood, Lotus, Forest Tentacle and Thopter tokens, slow lands): ✅.
- Lot F (**unique cards**): ✅, 50 cards. The engine gains:
  - the duration "until your next turn" (`modify`, `untilYourNextTurn`) and temporary emblems (`GameObject.expires`);
  - triggers "is dealt damage", "blocks", "attacks you" (`defending: "you"`), "casts a spell that targets…" (`targeting`, `orFilter`);
  - monocolored hybrid {2/W} (`ManaCost.twoHybrid`), loyalty -X (`loyalty: "X"`), the cost "exile another card from your graveyard";
  - ward "discard a card", flashback with discard (`flashbackDiscard`), Equip reduced by +1/+1 counters;
  - combat: damage according to toughness (Ghalta), absolute value of a negative power (Loot), attacking despite defender, a single attacker per planeswalker (Tomik);
  - player statics: opposing tax (Thalia), +1 counter (Yoshimaru), +1 noncombat damage (Tomik), no enters triggers (Karn), no spells during combat (Yuriko), artifact tokens → Dragons, opposing creatures exiled instead of dying;
  - Tarmogoyf (`cdaToughness`), Omnipresence, Null Summoner (linked card castable), spells returned to hand, Molten Tide, "each player may discard their hand and draw seven cards", Kindred Judgment.

  Not handled in this lot (handled since lot 0.1 of the multi-set core, `docs/extensions/core.md`): **Emrakul, the Exigent Doom** (land that gains an ability until cast from exile, ward "sacrifice three permanents"), **Uldaros Theorix** (copies of cards of each type cast for free), **Hall of Echoes** (land that becomes a copy of a creature, legend rule suspended).
- Lot E (**planeswalkers**): ✅. It covers:
  - The Theorist, Jace Beleren; Ajani Resolute; Ajani Unrelenting;
  - "creature or planeswalker" spells;
  - the 10 Commons/Annex lands ("enters tapped unless you control a planeswalker");
  - Tam (proliferate, automatic choice); Kiora (condition "a loyalty ability was activated this turn");
  - Mabel (remove up to three counters, automatic choice); Winter and Dark Matter Manipulator (bonus per graveyard card, `perGraveyard` and `perDivisor`);
  - Craftwork Crusher ("choose two", as the three possible pairs).

  Moved to lot F:
  - Face Yourself, Identity Echo, Loot, the Anomaly, Tomik, Orzhov Lawmage;
  - the two Chandras, the two Garruks, Jace, Reality Sculptor;
  - Gideon the Oathless (ward "discard a card") and Break Under Pressure.
- Lot D (**Empower Jace**): ✅. It covers:
  - the `empowerJace` effect (helper `empower(n)` in `fra/common.ts`): N loyalty counters on your Jace token, created first if it doesn't exist (-1: surveil 1; -3: draw);
  - the Ways, which grant loyalty abilities to your planeswalkers (helper `walkersHave`);
  - the trigger "when you activate a loyalty ability" (`loyaltyActivated`);
  - Jace loyalty abilities at instant speed (Jace's Machinations) and planeswalkers that survive at 0 (Sanctum Lurker);
  - "behold a Jace" (condition `beholdJace`), an additional land this turn, "the next spell can't be countered".

  Fatehold Charm (return a spell from the stack to hand) and Jace, Reality Sculptor move to lots E and F.
- Lot C (**prepared**): ✅, faithful to the official release notes:
  - becoming prepared creates a **copy of the spell in exile** (`GameObject.preparedCopy` / `preparedFor`), castable by the permanent's current controller, at the timing of its type, by paying its cost;
  - casting the copy unprepares the permanent; an effect that unprepares, or the permanent leaving, makes the copy disappear;
  - the copy ceases to exist on leaving the stack. It is not a card: the count invariant excludes it;
  - in the interface, the copy appears at the end of the hand (like cards playable from exile), and a "Prepared" badge is shown on the creature;
  - Pyre Rhymer (extra mana by tapping a Mountain) and Variable Chaser ("each player may discard their hand") move to lot F.
- Lot B: ✅. It covers:
  - abilities activated from the hand (`fromHand` and the cost `discardSelf`), with a "Cast / Cycle" menu when a card in hand has several options;
  - cycling, landcycling and typecycling, read from the text;
  - the casting condition (`castCondition`), split second (Samut), convoke, exhaust (`once`);
  - domain (`basicLandTypes`), searching for cards "with different names" and "when you discard this card".

  The Jace cards of lot B (Hexhaven Battalion, Countersculpt, Theorist's Sanctum) move to lot D, Tam to lot E and Emrakul to lot F.
- Lot G (**precon decks**): ✅, then **removed on 2026-09-28** (the default decks are now the Welcome decks and the Final Fantasy Starter Kit; the lists remain in git history). Four two-color decks of FRA cards only (`packages/cards/decks/fra-*.json`), one per faction:
  - Fatehold: empowered Jace (W/U);
  - Innovative: prepared spells (U/R);
  - Formidable: graveyard (B/G);
  - Dedicated: armed Cadets (R/W).

  They are added after the two FDN decks in `DECKS` (the tests and the bench use the first two). Balance checked by a round-robin tournament between heuristic AIs, 10 games per matchup: all the decks win between 38 and 59% of their games.
- Remaining for FRA: Emrakul, Uldaros Theorix and Hall of Echoes, then the reimport of the French texts after 2 October.

## PLAN-M M8a (rules 199)

- **Garruk, Curse Breaker −4:** the emblem triggers whenever one or more creatures (any player's) attack one of your opponents, and only the creatures attacking an opponent get +2/+2 and trample (`when.attackWith(1, { attacking: "opponent" }, true)`). Jace, Reality Sculptor's −3 emblem was already exact. 1 test (`fra.test.ts`, three players).
