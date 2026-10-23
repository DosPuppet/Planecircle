# Game screen: look and conventions (PLAN-V)

The game screen follows MTG Arena, as phase-rs does. The DOM board (graphics "full" or "light") stays light: no image to download, no 3D library, no particle system. The 3D board (graphics "3D", PLAN-W, section "3D board" below) is an option, loaded only by those who choose it: three.js, an arena, lights, particles. This page explains how both are built and what code that changes them must respect. Plans and history: `docs/plans/PLAN-V.md`, `docs/plans/PLAN-W.md`, `docs/plans/PLAN-X.md` (the shrine).

## Layout

- **The board takes the whole screen.** The settings and the log are a drawer (`aside.sidebar`) at every width, opened by the ☰ button (`DrawerToggle`) and closed by the scrim or Escape. Once closed, it is out of the tab order (`visibility: hidden`).
- **Card preview** (`PreviewFloat`, `board/Sidebar.tsx`):
  - With a mouse, the hovered card floats at the left of the screen, on the right when the pointer is under it.
  - It closes 80 ms after the pointer leaves every card (`.card-slot`, `.log-card`, `.commander-chip`), and on any click.
  - `hover` stays in the store after the pointer leaves, because the tutorial reads it. `hoverLive` says whether the pointer is still on the card. `previewHold` keeps the preview open during a tutorial step.
  - On a touch screen, a long press opens `TouchPreview`.
- **Opponents** sit at the top, centered: avatar, counts, and their hand as card backs fanned and cut by the screen edge (`OpponentHand`).
- **Center line:**
  - a hairline across the table;
  - the phase pills on the left, the current step underlined in the color of the player whose turn it is;
  - the banner in the middle;
  - the stack as a panel on the right at mid-height (spells cascading, the newest in front);
  - the rope along the line (online play).
- **Your side:**
  - your avatar at the bottom left, with the life total in a pill at its foot;
  - the hand fanned along the bottom, partly below the screen (`--hand-peek` 0.62, 0.5 on a phone); a hovered card rises until it is whole;
  - the main button at the bottom right: amber when it moves the game forward, blue (`respond`) when it lets the stack resolve.

- **Phone in portrait** (under 600 px wide):
  - a duel plays in portrait: your avatar and the main button share a line, the hand has a line of its own under them, the phases scroll on one line, the banner wraps under them;
  - the fan of the hand is flatter in a narrow hand (spread `3 × width / card width` degrees, 24 at most), so its end cards stay on the screen;
  - 3 or 4 players ask to turn the device to landscape (`.game.multi`): side by side, three opponents would be unreadable;
  - a choice made on the board (`.board-choice`, targets of a trigger, permanents to choose) takes the place of the hand, compact (prompt, selection, suggestion; no source card), since on the left it covered the options; the main button confirms ("Confirm (n)"); in landscape on a short screen (under 500 px high), the panel stays on the left without the source card, clear of your avatar; `tools/board-choice-phone.ts` checks that it covers no option, no avatar and not the main button (iPhone, Pixel, iPhone in landscape, desktop);
  - `mobile-smoke` checks iPhone and Pixel in portrait.

## Cards

- **Full cards** (hand, stack, dialogs, preview) are 1.395 times as high as they are wide (`CARD_RATIO`, `--card-ratio`).
- **Battlefield permanents are art cards** (`<Card art>`):
  - Shape: 1.2 times as high as wide (`PERM_RATIO`, `--perm-ratio`).
  - Image: the Scryfall art crop of the image the card shows (`faceArt` in `i18n.ts`, `artCropOf` in `images.ts`). Since the crop is derived in the client, it follows the printing and the language. The view and the protocol don't carry it.
  - When there is no crop (custom art), or the crop fails to load, the whole card shows, framed on its art box (`img.full`). If that fails too, the text frame shows.
  - Frame: colored by the card (`c-W/U/B/R/G`; `c-M` for multicolored, `c-C` for colorless, `c-L` for lands).
  - Name: on top, from 84 px wide (container query).
  - P/T: in a light box at the bottom right. Marked damage shows in red in the toughness.
- **Tapped:** a permanent leans by 17° (`TAP_DEG`) instead of turning a quarter. Its slot takes the width of the leaning box, 1.31 cards (`TAP_W`); `slotUnits` counts it. The extra height of the lean (about 0.12 card) is not reserved, so a tapped card overlaps the next line slightly, as on MTGA.
- **Glows:** each state only sets its color `--g`, and one rule draws the ring and the halo. The accessibility shapes stay: ⚔ and ⛨ badges, a dotted outline for selectable, a check mark for picked, a pulse for a target.

## The table

- **Textures** (`boardThemes.ts`): each only sets a palette (`--bd-0` deep, `--bd-1` mid, `--bd-pool` light) and a grain (`--bd-tex`, SVG noise). One `[data-board]` rule draws the painted look for the board, the settings swatches and the menus (home, online, tutorial): a dark ground, a pool of light at the center and the edges in shadow.
- **Graphics setting** (`planecircle.effects`, "Graphics" in the drawer, `data-effects` on `.game`):
  - `full` is the default with a mouse: the tilted battlefield and the animated table.
  - `light` is the default on a touch screen under 1,100 px: a flat battlefield and a still table.
- **Tilt** (full only): each battlefield leans back from its bottom edge (`perspective(1400px) rotateX(var(--tilt))`, `--tilt` 10°, 0 at a height ≤ 560 px). What this means for code:
  - `fitBattlefield` reads `clientWidth`/`clientHeight`, which ignore transforms, so the layout does not depend on the tilt.
  - Arrows, `findObjectEl`, drag and drop and the tutorial ring read `getBoundingClientRect`, which is measured after the transform, so they follow what is on screen.
  - A test that compares positions must use layout coordinates (`offsetLeft` up the `offsetParent` chain), as battlefield-smoke does for the planeswalker column.
- **Animated table** (full only; `board/backdrop.ts`, `board/Backdrop.tsx`):
  - What it is: a raw WebGL 1 fragment shader, drawing a slow painted noise in the texture's palette, a light pool and a vignette.
  - Loading: a lazy chunk of 3 KB, budgeted at 12 KB in `tools/bundle-size.ts` (the check fails if the chunk disappears, which would mean it was merged into the application).
  - Cost: half resolution, 24 frames per second at most, paused while the tab is hidden.
  - Off with reduced motion, in `?fast` mode, and in software WebGL (`failIfMajorPerformanceCaveat`). Headless tests therefore keep the still CSS background; in dev mode, `?backdrop=force` draws it anyway, for screenshots.

## Home screen

- **Layout:**
  - a top bar with the places of the game (My decks, Against a player, Learn to play, Glossary, Replay) and the settings (sound, language; image options behind ⚙);
  - your side and the AI side in two panels, with VS between them;
  - the "Play against the AI" button fixed at the bottom right (full width on a phone).
- **Decks:**
  - a chosen deck shows as a summary (`DeckSelect`: art, name, colors, cards, format), framed in gold;
  - a click opens the picker window (`DeckChoice`: categories, tiles, a check mark on the chosen one);
  - the online lobby uses the same summary.
- **Phone:** the panels stack, the places sit in a two-column grid under the logo (the fifth on a line of its own).

## Glossary

- **Entries** (`glossary/entries.ts`): keyword abilities, keyword actions, ability words, tokens and counters, game terms. Each has an English name and definition (`msg`, French in `client/locales/fr.json`) and, except the game terms, the forms that find it in a rules text: `en` and `fr` regular expressions, matched case-insensitively between word boundaries; a French text without a French printing is in English, so French texts are also searched with the English forms. An ability word is only found before its dash. The first entry that matches at a position wins: a longer form ("double strike") comes before the one it contains. A name whose French elsewhere is a label in the imperative (the "Investigate" mode button) has the `ctx:glossary|` prefix.
- **Words in a text** (`glossary/match.ts`, `Term.tsx`): `RulesText` (preview, other faces, prepared spell, token text, prompts) and the effect of the spotlight (`EffectFrame`) underline them in `--term`; hover with a mouse or long press with a finger shows the definition (`.kw-tip.term`, under the word or above it near the bottom of the screen); a click opens the glossary at that entry. The terms are matched on the whole text before the mana symbols are drawn, since a form may look at the cost after it (in French, Equip shares its word with the Equipment card type and is told apart by the cost that follows).
- **Floating preview:** the mouse can't reach it, so its definitions are listed next to the card, MTGA style (`PreviewTerms`, at most six: the words of its texts, then the keywords it has without them being written); hidden under 1,000 px wide. The side switch measures the preview's width with this column.
- **Glossary window** (`GlossaryDialog`, above every screen): opened from the home screen, the game's drawer, or a word clicked; sections sorted in the interface language, the other language's name in grey, search without accents. The badges of a permanent (`Keywords.tsx`) take their definitions from the same entries.
- **Tests:** `client/test/glossary.test.ts` (forms, boundaries, ability words; every English and French form finds a text of the catalog); `tools/glossary-smoke.ts` (window, floating preview, long press on a phone; screenshots in `test-results/glossary/`).

## Tokens and budgets

- **`:root` tokens:**
  - surfaces: `--surface`, `--surface-2`;
  - border: `--hairline`;
  - radii: `--r-1/2/3`;
  - shadows: `--shadow-1/2`;
  - easing: `--ease`;
  - fonts: `--font-display` (Cinzel), `--font-ui` (Inter);
  - card shapes: `--card-ratio`, `--perm-ratio`;
  - tilt: `--tilt`.

  Use them rather than new hard-coded colors.
- **Budget:** `tools/bundle-size.ts` budgets the stylesheet (`index.css`, 68 KB). A change deletes the rules it replaces.
- **No endless animation on the board,** except the target pulse (an accessibility cue) and the "thinking…" blink. The 3D board draws only while something moves; its exceptions, asked for by the user, are the fireplace's fire wavering between two moves (at most 20 frames a second) and the shrine's animated diorama (60 frames a second in High, 30 in Medium); neither in "low" quality, with reduced motion nor in `?fast`.

## 3D board (PLAN-W)

- **Choice and eligibility** (`client/src/graphics.ts`):
  - "3D" in Graphics (`planecircle.effects` = `3d`), never a default; `domEffects` gives the DOM board "full" in its place.
  - `probe3d()` creates a WebGL2 context without a major performance caveat and reads the renderer's name. Without WebGL2 the button is disabled and its title says why; with a software renderer (SwiftShader, llvmpipe, softpipe, lavapipe, Microsoft Basic Render) the player can still try it (`canTry3d`), warned that it may be slow, and it starts at low quality. In 3D, the drawer shows the graphics card the browser uses (on a laptop, it may be the integrated one), the quality drawn, and a quality choice: Auto (the governor) or High, Medium, Low chosen by hand (kept in `planecircle.quality3d`, the governor off).
  - A loading screen (`board/Loading3D.tsx`) covers the board from the choice until the table is ready: the engine (the lazy chunks, the Suspense fallback), the arena (its files counted as they finish, decoded, against the manifest; given up after 20 s without one, with a notice: the plain table), the card images on the table; 20 s at most. It is above the whole page (a portal into `body`, fixed, on top: nothing of the board, its hand or its prompts, the mulligan included, shows over it; an interface test waits for it to leave before acting), and a ring turns on it (a CSS transform animation, played by the compositor while the script is busy). A diorama built again after the first load (a resize, a quality chosen) shows it again first ("Rebuilding the arena…", no bar): `heavy` in `Board3D.tsx` gathers the changes (150 ms), lets two frames paint the screen, does the work, and fades it once the scene has drawn; the tavern does the work at once.
  - The DOM board takes over on a phone in portrait (`PORTRAIT_PHONE`, `useMedia`), and for the session after a lost WebGL context (`board3dFailed`, with a notice); choosing 3D again tries again.
  - Dev mode: `?board3d=force` draws it on any renderer, `&quality=low|medium|high` starts at that quality.
- **Code:** `client/src/board3d/`, a lazy chunk (`Board3D`, its CSS `board3d.css` outside `index.css`'s budget) and three.js in a chunk of its own (`three`, the `vite.config.ts` group). **Never a code-splitting group for the board's own code:** a group takes its modules' dependencies with it (the whole application went into it and was preloaded); `tools/bundle-size.ts` fails when a lazy chunk is loaded with the page or reached by a static import.
- **Proxies, the key choice:** each card drawn in 3D has a transparent DOM proxy (`Card ghost`: the same slot, `data-oid`, glow, badges, handlers), laid exactly over its mesh by a flat projective `matrix3d` (`project.ts`; its z row only passes z through: CSS neither draws nor hit-tests a non-invertible matrix). Clicks, hover and preview, long press, keyboard, arrows, `findObjectEl`, the tutorial and the tests go through the proxies with the DOM board's own code; raycasting is not used for input.
  - Proxies stand at the cards' final places (a flying card is clicked where it lands); z-order comes from the model, never from depth.
  - The battlefield zones (`.battlefield.me/.opp`, `data-tuto`) are boxes over their projection; the HUD (bars, center strip on the projected middle line, your row) is the DOM board's, placed over the canvas.
  - The hand is the DOM `Hand` (`ghost`): it keeps the fan, hover, first tap and drag to play, and each card's mesh follows its DOM slot every frame while the hand moves (drawn without depth, in the DOM's order, its glow a halo behind it: a CSS ring would cross the next card, DOM drawing over the canvas).
- **Layout:** `placement.ts` ports the battlefield CSS (rows, lines, piles, token shadows, attachments, attackers, planeswalker column) in pixels, checked against the DOM within 2 px by battlefield-smoke; `seats.ts` lays the seats out after the DOM grid (2 to 4 players, piles column on the left), 100 px per world unit; `frameSeats` deepens the battlefields until the table, seen at 52°, fills the band the HUD leaves; `model.ts` gives meshes and proxies the same nodes.
- **Drawing** (`scene.ts`): drawn on demand (a change, a card flying, an effect, the hand moving, the fire); paused with the tab; a lost context calls back to the DOM board.
  - Cards: a face (art card painted on a canvas like the DOM's, `textures.ts`, 64 MB cache with the cards on the table pinned), a body, a glow rim (CSS glow color) and a soft contact shadow; a pile is as thick as it is full.
  - Motion (`motion.ts`): a critically damped spring per uid: a card keeps its uid from zone to zone, so it flies from the hand, the stack or the battlefield to its new place; ×5 in `?fast`, instant with reduced motion.
  - Quality (`quality.ts`): high (pixel ratio 1.5, shadows 2048, bloom, multisampling), medium, low; a governor steps down after 90 slow animation frames (median over 22 ms), never up again.
  - Light: with the arena, a fireplace off the table's left (a point light, its shadows all around; the three tallest flames cast shadows too at high quality), the HDRI for the reflections; without it, the plain table in the texture's palette. Every light costs on every pixel: a fixed pool (two for the runes; the pool over the middle goes with the arena, behind the loading screen), never a light added during play (the materials would compile again: a stutter).
- **Effects** (`fxmap.ts`, events → effects in the 0.22 s steps of `soundsFor`, through the store's `subscribeUpdates`): sparks and a jolt for damage, embers for a death, runes with their own light for a spell (caster's side), a summoning (under the permanent) or an ability (under its source, `runes.ts`), a token's ring, a land's dust, a blocker's clash, counters' sparkles, a light sweeping the table at a turn's start. Particles are instanced quads (`particles.ts`): GL point sprites took a slow path in SwiftShader. None with reduced motion.
- **Arena** (`tools/arena-assets.json`, `npm run arena-assets`, `docs/deployment.md`): CC0 Poly Haven assets, md5 pinned, compressed to KTX2 and meshopt into `data/arena/<id>/` (outside Git, about 11 MB for the tavern), served on `/arena/<id>/` (an empty manifest without it: the plain table). Props at one scale (`metersToWorld`), pushed out until clear of the battlefields; only table-sized objects. The CSP allows `'wasm-unsafe-eval'` and blob workers for their decoders (never JavaScript `eval`).
- **Arenas** (PLAN-X): the tavern (props on a table) or the shrine (a diorama built in code), chosen in the drawer and in the home screen's settings (`planecircle.arena3d`); changing it reloads the scene behind the loading screen. A diorama (`diorama.ts`) gets the scene, its lights, the mats' material and the season (`seasonNow`), asks for room around the table (`frameSeats`'s `room`), is laid out around the rim and stepped at its quality's rate (`fps`); `setPalette` leaves its sky, lights and mats alone.
- **The shrine** (`board3d/shrine/`, its own lazy chunk; `docs/plans/PLAN-X.md`):
  - **Seen from the table's camera:** at 52°, nothing taller than about half a unit beyond the far edge is on screen, and the room kept around the table does not show more world (the table only shrinks): landmarks stand at the far corners and beside the stage (the torii in the water on the left, the pagoda on its islet on the right), trees lean out over the water so their crowns show, nothing raised stands on the near side (it would rise into your battlefield).
  - **Its plan** (`plan.ts`, pure, tested): the stage (the rim and a walkway), the banks, the seabed, the shore, the landmarks' places. Everything reads it; built again when the table changes shape.
  - **Pieces:** `water.ts` (Gerstner waves, a two-minute tide, ripples, depth color, foam; a planar reflection of the diorama's layer in High; the water writes no depth, so the koi show through it), `sky.ts` (a shader dome baked as the water's environment; never seen directly), `ground.ts` (terrain mixing two PBR sets, wet sand after the tide, rocks), `stage.ts`, `torii.ts`, `buildings.ts` and `kit.ts` (Japanese roofs, curved beams, merged geometry), `lanterns.ts` (two real lights only, created with the diorama; the rest emissive, sprites, decals), `tatami.ts` (the mats), `trees.ts`, `fall.ts`, `mist.ts` (mist over the water; the veil over the battlefield, a lit material), `life.ts`, `yokai.ts`, `paths.ts`.
  - **The user's rules for life:** walking yokai on the stage (the walkway's middle, `walkwayLoop`, tested) but never on the mats; flying ones over the battlefield rarely and briefly (a hitodama 9 s every 80 s; few falling things start over it). The veil over the battlefield stays thin (a tenth of the light at most).
  - **Seasons** (`season.ts`) from the real date (northern hemisphere): sakura in bloom and petals, summer greens and fireflies, momiji and falling leaves, snow on what faces the sky (never the deck nor the mats). Materials patched by `onBeforeCompile` keep the earlier patch's program key (`customProgramCacheKey`); models placed from the arena get their own material copies (`ownMaterials`), so a rebuild never tints twice.
  - **The light moving** (X6, the user's wish, as the tavern's fireplace): a kagaribi off the far left corner lights the scene's fire light (`fireLit`: no light added; fixed in place, its shadow maps stay; the moon casts shadows too in High), clouds pass over the moon (`moonlight`), fireworks every 150 s above the far corners and over the far bay (in the water's reflection), flashing the sky's light.
  - **Quality:** High (planar reflection, three mist sheets, two veil sheets, the most plants, 280 falling things, 60 frames a second), Medium (two sheets, one veil, fewer, 30 frames a second), Low (still). Dev: `?season=spring|summer|autumn|winter`, `?shrineTime=<seconds>` pins its clock (a crossing, a procession).
- **The neon city** (PLAN-Y, `board3d/neon/`, `docs/plans/PLAN-Y.md`): a rooftop helipad over a megacity, the camera looking down into the canyons past the roof's narrow sides; facades of four styles with lit interiors, screens glitching from ad to ad (the nearest four throw real light of the ad's color), neon signs, flying cars, street lights, drones, searchlights, a maglev, rain in a gusting wind, a wet deck with ripples and, in High, the city's reflection. Few raindrops over the cards; nothing raised on the near side. Its lights cast shadows, drawn again every frame (`liveShadows`): High the sign, the train, the searchlights and the roof's two screens; Medium the sign and the train.
- **Tests:** unit tests in `client/test/board3d/`; `tools/board3d-smoke.ts` (SwiftShader, `?board3d=force`, low quality: proxies within 1.5 px of their projections, clicks, a land, an attack, idle board, piles, hand meshes, dust, context loss, arena or plain table, high quality, the fire's rate, 4 players, phone portrait and landscape, no three.js without 3D); `tutorial-smoke --3d --only 1`; `tools/csp-smoke.ts` (the production build served by the game server, with its CSP: each arena, nothing blocked). SwiftShader draws the arena at a frame or two a second (the shrine about one in two seconds): the game contexts run without it, and the shrine's checks read its ambient rate rather than counting frames.
