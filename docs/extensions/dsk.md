# Duskmourn: House of Horror (DSK, 268 cards)

Mechanics and details of the lots.

Requested by the user on 2026-09-27. Rooms (709.5) and manifest dread (701.62) already existed in the core (lots 0.6 and 0.8).

| Mechanic | Lot |
|---|---|
| Eerie, Survival, Delirium, Glimmer tokens, lands | A |
| Impending (Overlords), Enduring, additional costs, Equipment that manifests, doors | B |
| Legendary and unique cards | C |
| The last 18 cards (player Aura, Valgavoth, Kaito, Leylines…) | D |

The scripts are in `packages/cards/src/dsk/`: `white`, `blue`, `black`, `red`, `green` and `multi` (lot A), `special` (lot B), `legends` (lot C), `legends2` (lot D). The helpers are in `dsk/common.ts`: `survival`, `eerie`, `fastLand`, and the Glimmer, Spirit, Toy, Horror, Demon, Imp, Spider and Everywhere tokens.

- Lot A ✅ (164/268). It covers:
  - Eerie: trigger `when.eerie` (an enchantment you control enters, or you fully unlock a Room); helper `eerie(...)`;
  - Survival: helper `survival(...)`, that is `when.secondMain` (step `main2`) with the condition "the source is tapped";
  - Delirium: `cond.delirium` and the amount `amount.cardTypesInGraveyard` (your graveyard only; `cardTypesInGraveyards` counts all graveyards);
  - `fx.manifestDreadBy({ who, times, store })`: "its controller manifests dread", "X times", then "attach this Equipment to it" or "put a counter on it";
  - the amount `unlockedDoors` (Rampaging Soulrager, Misty Salon);
  - the lands "enters tapped unless a player has 13 life or less" (`fastLand`) and the Verges;
  - **fix**: "enters tapped" (enters replacement) advances the state version; the fuzz found it with The Wandering Rescuer.
- Lot B ✅ (188/268). It covers:
  - Impending (702.176):
    - "Impending N—[cost]" is read from the text: alternative cost (`altCost`, label "Impending 4 — {2}{W}{W}" shown by the client) and `CardDef.impending`;
    - the permanent enters with N time counters (`GameObject.impending`) and is not a creature while it has any (creature types and subtypes removed in `base`);
    - one counter is removed at the beginning of your end step (generated trigger);
  - Enduring: "returns; it's an enchantment" (`MoveSpec.setTypes`, `setSubtypes`);
  - additional costs chosen automatically (`autoAdditional` in stack.ts): exile a creature (linked to the permanent, Fear of Abduction), exile six cards from the graveyard, return a permanent, tap two creatures or lands. These permanents are not used to pay mana;
  - doors: `fx.door(ref, "unlock" | "toggle")`, which unlocks a locked door or locks or unlocks a door of your choice (Ghostly Dancers, Ghostly Keybearer, Keys to the House, Marina Vendrell).
- Lot C ✅ (250/268). The engine gains:
  - player statics: `convokeCreatureSpells` (Dazzling Theater), `untapCreaturesOnOthersUntap` (Prop Room; became `untapOnOthersUntap` with a filter, The Vision deck), `unlockReduction` (Inquisitive Glimmer), `damageToOpponentsMills` (The Mindskinner), `ignoreOpponentsHexproofWard` (Nowhere to Run), `opponentGraveyardToExile` (Leyline of the Void), `noLoseForLife` (Grimoire), `doubleTriggers` (Fractured Realm), `seeFaceDown` (Found Footage, in `projectView`);
  - the `faceDown` filter (view included), the `attached: "notHost"` filter, and `when.permanentTurnedFaceUp(filter)`;
  - `when.manifestDread`: the event object is the card put into the graveyard;
  - conditional modes (`ModeDef.condition`, Let's Play a Game under delirium);
  - discarding as an activation cost (`discard`, player's choice in the client), `MoveSpec.shuffle` ("shuffle it into the library") and `destroy` with memorization (Come Back Wrong);
  - `fx.tapChosen`, `fx.lkiCountersTo`, `fx.cantGainLife`, `fx.millWhileShared` (The Tale of Tamiyo), `fx.revealFaceDown`, `fx.eachOfDealsDamage`;
  - `ref.costDiscarded` (Grab the Prize);
  - the restrictions `cantAttackOrBlockAlone` (Toby) and `cantBeBlockedByGlimmers` (Cynical Loner);
  - the conditions `prime` (Zimone), `faceDownOrUp` and `sacrificedThisTurn`, as well as `punisher` with damage (Osseous Sticktwister);
  - `per` which also multiplies base P/T (Porcelain Gallery).
- Lot D ✅ (**268/268**). The engine gains:
  - the player Aura (`enchant.player`, Grievous Wound), with the trigger `when.attachedPlayerDamaged`;
  - `when.becomesBlocked` (Norin);
  - variable numbers of targets for a reflexive ability (`TargetSpec.countAmount`: Miasma Demon, The Rollercrusher Ride);
  - doubling noncombat damage under a condition (`doubler({ noncombatDamage, condition })`);
  - Valgavoth: the linked exile of opposing cards (`exileOpponentsCardsLinked`, in `moveObject`) and the right to play them during your turn by paying life (`playFrom: { zone: "linked", payLifeManaValue }`, PLAN-H H7b); the ward "sacrifice three nonland permanents";
  - ninjutsu (`returnUnblockedAttacker`, Kaito);
  - an alternative cost for all your spells (`altCostAll`, Leyline of Mutation, via `altCostFor`);
  - Warped Space (`freeFromExileOncePerTurn`) and Winter (`opponentMaxHandSize`);
  - mana abilities that cost life or put a counter (Haunted Screen, Twitching Doll);
  - Marvin (`gainActivatedFrom`);
  - `fx.chooseAmong` ("that player chooses one of them", Trial of Agony);
  - a remembered emblem, to which the target is linked, for "when it dies this turn" (Turn Inside Out); replaced by the delayed ability linked to an object (`fx.whenThisTurn`, PLAN-A A4b);
  - `ref.filtered` (Ghost Vacuum), and the conditions `step`, `creatureDiedMatching` and `castFromGraveyard` (Undead Sprinter).

Tests: `engine/test/dsk.test.ts` (18 tests) and the smoke test `ai/test/smoke/dsk.test.ts`.

## PLAN-M M8b (rules 200)

- **Acrobatic Cheerleader:** "this ability triggers only once": `once` on the triggered ability, noted on the object (`GameObject.used`, like the "activate only once" abilities); the flying counter is no longer the marker. Test added.
- **Rip, Spawn Hunter:** the creature and Vehicle cards put into hand have different powers (`lookAtTop.distinctPower`: suggestion one card per power, a pick of two same powers refused); the top X cards are revealed. Test added.
- **Unable to Scream:** "as long as enchanted creature is face down, it can't be turned face up": the restriction `cantBeTurnedFaceUp` (keyword), granted by a second static to the enchanted face-down creature (`{ attached: "host", faceDown: true }`); read by the turn-face-up special action, `turnFaceUp` (effects too) and `revealFaceDown`. Test added.

## PLAN-M M10a (rules 203)

- **Say Its Name:** the graveyard ability searches the graveyard, the hand and the library in one choice (`search.alsoFrom`); the library is shuffled (and the search event emitted) only if Altanak comes from it. Test added.
