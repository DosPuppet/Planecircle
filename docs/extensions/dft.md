# Aetherdrift (DFT)

**✅ 260 / 260** (lots A to C). Mechanics and details of the lots (moved from CLAUDE.md).

| Mechanic | Cards | Lot |
|---|---:|---|
| Vehicles (crew) | 43 | A |
| Mounts ("attacks while saddled") | 32 | A |
| cycling ("when you cycle this card") | 28 | A |
| speed ("Start your engines!", "Max speed") | 40 | B |
| exhaust | 29 | B |

- Lot A ✅ (152/260). It covers:
  - the Pilots (keyword `crewPlus2`: "crews Vehicles and saddles Mounts as though its power were 2 greater") and Interface Ace (`crewWithToughness`);
  - "whenever this creature saddles a Mount or crews a Vehicle" (`when.crews`, `crewed` event; the event object is the Vehicle); "becomes saddled" (`fx.saddle(ref)`) and "becomes an artifact creature" (`fx.animateVehicle`);
  - "when you cycle this card" (`when.cycleSelf`, with the X of the cycling cost); "whenever you discard one or more cards" (`when.discardBatch`, once per discard);
  - exert (`exert`), the Verges (conditional mana ability), the Roads, Bloodghast ("an opponent has 10 life or less");
  - Pilot, Servo, Elephant, 3/2 Vehicle (crew 1), Dinosaur Dragon tokens (`dft/common.ts`, also in the sandbox);
  - the smoke test can add cards to player 1's graveyard (`EXTRA_P1_GRAVEYARD`).
- Lot B ✅ (218/260): speed and exhaust.
  - speed (702.179): `PlayerState.speed` (absent at the start). "Start your engines!" is a keyword read from the text: a player with no speed who controls such a permanent goes to 1 (state-based action). When an opponent loses life during your turn, your speed increases by 1, once per turn (`setSpeed`, `speed` event);
  - "Max speed — [ability]": condition `cond.maxSpeed` on the ability (static, triggered, activated, mana or player ability: `PlayerStaticAbilityDef.condition`); `amount.speed`, `perSpeed` (Samut), `fx.reduceSpeed` (Spikeshell Harrier), `ref.playersWithoutMaxSpeed`;
  - interface: "⚡ N" badge next to the player's name (gold at maximum speed) and a log line;
  - exhaust (702.177): helper `exhaust({...})` (a single activation), trigger `when.exhaustActivated`, Boom Scholar's reduction (`exhaustReduction`), Elvish Refueler's reactivation (`exhaustReuse`);
  - also: "cast from your graveyard [if…]" (`castFromGraveyard`), doubled draw (Vnwxt), +1 damage to opponents (Far Fortune), "if it's not their turn" (`when.castSpellOffTurn`), "sacrifices it, otherwise discards" (Momentum Breaker), mill equal to the graveyard.
- Lot C ✅ (**260/260**): 42 unique cards (`dft/unique.ts`). The engine gains:
  - control "for as long as you control [the source]" (`gainControlWhileSource`, `whileSource` effects) and exchanging control;
  - "enters as a copy of …" (`entersAsCopyOf`, choice during resolution); Mimeoplasm (exiling from the graveyard with linked cards, 0/0 copy that keeps its activated abilities);
  - naming a card with no hidden information (`chooseCardName`, `exileNamed`); paying the mana cost of a card (`payCostOf`);
  - the costs "exile X cards from your graveyard" and "sacrifice one or more artifacts" (`exileFromGraveyardX`, `sacrificeX`);
  - grouped triggers "one or more …" (`batched`), "a card changes zones" (`when.zoneChange`), "a spell it doesn't own", "combat damage to one of your opponents";
  - Skyseer's Chariot (tax on the chosen name, `chosenNameTax`), The Aetherspark (planeswalker Equipment, can't be attacked while attached), Pit Automaton (copy of the next exhaust ability), unique "this turn" modes;
  - "cast from your graveyard" with extra life and sacrifice (Wickerfolk), X of the spell remembered on the permanent (`castX`), "Nth from the top of the library", "reveal until N lands".

## PLAN-M M10d (rules 206)

- **Cursecloth Wrappings:** {T}: the creature card gains embalm until end of turn (`fx.modify` on a card in a graveyard with an ability `fromGraveyard`, read by `abilitiesOf`; `embalmAbility()`, cost `manaOfSource`: its mana cost); embalm is activated later as a sorcery, the token is a white Zombie (`copyToken.setColors`). Test rewritten; approximation narrowed (the token keeps the card's mana cost).
