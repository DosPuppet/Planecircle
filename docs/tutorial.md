# "Learn to play" tutorial

The tutorial is aimed at a player who does not know Magic. It starts from the **Apprendre à jouer** ("Learn to play") button on the home screen. It has 9 short lessons, each one a staged excerpt of a game played with the real engine and the real interface:

| # | id | Content |
|---|---|---|
| 1 | `screen` | Goal of the game, life, battlefield, hand, library, graveyard, phases, main button, preview, log |
| 2 | `mana` | One land per turn, mana cost (color, generic), tapped lands, end of turn |
| 3 | `creatures` | Power and toughness, summoning sickness, the stack (opposing spell) |
| 4 | `attack` | Combat, attackers, opposing block, damage, graveyard, second main phase |
| 5 | `block` | Defending, creature trade, life loss |
| 6 | `spells` | Sorceries and instants, targets (drag and drop), first victory |
| 7 | `stack` | Responding to a spell, resolution order, damage that lasts until end of turn, combat turn |
| 8 | `abilities` | Flying, vigilance, lifelink, reach, deathtouch, triggered and activated abilities |
| 9 | `game` | Mulligan, stops, "Passer le tour" ("Pass the turn"), then a real game against the beginner AI (opponent at 10 life), with tips |

You can **play through everything** (the next lesson is offered first), **resume**, or pick a lesson. Progress is kept in `localStorage` (`planecircle.tutorial`: completed lessons and the lesson to resume). Resuming restarts the lesson **from its beginning**.

## Files

- `engine/src/scenario.ts`: `createScenario`, a game without shuffling, started at the beginning of the wanted turn (or at the mulligan).
- `engine/src/host.ts`: the `gate` option of `GameHost` makes the AI wait during an explanation. The human then sees the current state.
- `ai/src/scripted.ts`: `scriptedAgent`, an opponent that follows a data script (`playLand`, `cast` possibly in response, `activate`, `attack`, `block`, cards designated by name). Outside the script, it passes, does not attack and makes the mandatory blocks.
- `client/src/protocol.ts`: `ScenarioSpec`, sent to the worker in `start`, and the `pause` message. The opponent (`opponentPlays`) is a script or an AI level (`"beginner"`, `"medium"`, `"expert"`).
- `client/src/scenario.ts`: `buildScenario`, from the description by names to the engine game (worker and tests).
- `client/src/tutorial/`:
  - `lessons.ts`: the content;
  - `runtime.ts`: step format, guard and solver, predicates (pure);
  - `store.ts`: current lesson, progress, guard, step advancement;
  - `Coach.tsx`: bubble and ring;
  - `placement.ts`: bubble position (pure);
  - `TutorialMenu.tsx`: lesson menu.

## Step format (`runtime.ts`)

- `text`: the text, in French, addressing the player as "vous". `**bold**` and mana symbols (`{G}`, `{1}{G}`) are rendered by the bubble. The text may depend on the game (function of `Ctx`).
- `target`: the circled element. Either an interface landmark (`myLife`, `hand`, `phaseBar`, `mainButton`, `stack`, `stops`..., via the `data-tuto` attributes of the board) or a card: `{ card, zone, owner }`, by its English name.
- `next: true`: explanation, with a "Suivant" ("Next") button. The opponent is paused and every decision is refused.
- `until`: end condition of the step, evaluated at each update and each hover. Prefer state (`onField`, `inGraveyard`, `myStep`, `lifeOf`...) to events: several steps can end on the same update.
- `allow`: accepted decisions (**strict guidance**). Examples:
  - `{ playLand }`, `{ cast, target }`, `{ activate, target }`;
  - `{ attack: [...] }`, `{ block: [[blocker, attacker]] }`;
  - `"pass"` (Combat, Resolve, OK), `"endTurn"` (End of turn), `"keep"`.

  Other decisions are refused with `hint`. Producing mana by hand, answering an engine question and conceding are always allowed.
- `free: true`: free game, without restriction; the `tips` appear in the bubble depending on the situation.
- `settings`: autopilot settings applied on entering the step.

## Pitfalls

- **Invisible opposing turn.** When the opponent does nothing visible (in `?fast` mode, or without any AI action), the view jumps straight to the next turn. An end of turn is therefore awaited with the turn number (`pastTurn`), not with "it is the opposing turn".
- **Stops.** The autopilot skips the steps where the player has nothing significant to do, even with a stop. For the game to stop in the second main phase, the player must have something to play there (lesson 4: the Falcon).
- **Opposing spell.** During a guided step, the opposing spell panel (`StackReveal`) no longer passes by itself: the player clicks OK when the guide asks (`useTutorialHold`). The end-of-game window is hidden during a lesson: the guide announces the end.
- **Preview and log (PLAN-V).** There is no sidebar any more. A step whose target is `log` or `settings` opens the drawer, and closes it afterwards if the guide opened it. A step whose target is `preview` keeps the floating preview open on the last hovered card (`previewHold`, `[data-tuto="preview"]`). See `useShownTarget` in `Coach.tsx`.
- **Card names.** The scenario and the conditions use English names, the texts use the French names shown by the interface. A card without a French name in the data would be displayed in English: avoid it.

## Adding or changing a lesson

1. Write the scenario (libraries long enough for the draws) and the steps in `lessons.ts`.
2. `npx vitest run packages/client/test/tutorial.test.ts`: each lesson is replayed without a browser, with the decision the solver deduces for each `allow`. It also checks that the claims in the texts are true (`OUTCOMES`: life, deaths...).
3. `npm run tutorial-smoke` (Vite running): the lessons are followed in the browser, clicking like a player. The `--only 2,3` option restricts to the wanted lessons, `--debug` prints the actions. Screenshots in `test-results/tutorial/`.
