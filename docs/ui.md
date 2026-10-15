# Game screen: look and conventions (PLAN-V)

The game screen follows MTG Arena, as phase-rs does, but stays light: no image to download, no 3D library, no particle system. This page explains how the look is built and what code that changes it must respect. Plan and history: `docs/plans/PLAN-V.md`.

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
- **Budget:** `tools/bundle-size.ts` budgets the stylesheet (`index.css`, 62 KB). A change deletes the rules it replaces.
- **No endless animation on the board,** except the target pulse (an accessibility cue) and the "thinking…" blink.
