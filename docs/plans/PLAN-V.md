# PLAN-V — MTGA-style visual restyle (2026-10-15)

## Context

The game screen today reads as a web app: a 340 px right sidebar (settings, docked preview, log); full Scryfall cards on a flat board; spinning avatar rings; many hard-coded colours. The user wants it closer to MTG Arena, as phase-rs does (MIT/Apache-2.0, github.com/phase-rs/phase), without phase-rs's weight (three.js shaders, a VFX/particle system, a 3.7 MB entry bundle, badge piles).

The user's choices:
- **3D:** a CSS 3D perspective battlefield, plus a light WebGL backdrop.
- **Background:** procedural Arena-toned themes, no images.
- **Permanents:** MTGA art cards (art crop, colour frame, P/T bubble, about 17° tap).
- **Sidebar:** removed; floating preview on the left; log and settings in a menu drawer.

**MTGA conventions to reproduce:**
- A dark, low-saturation painted table with a vignette and a light pool in the centre.
- Round avatars with a life pill: yours at bottom left, the opponent's at top centre. Phase track on the centre line.
- An amber pass button at bottom right that turns blue when responding, with a small "End turn" and the rope above it.
- The hand fanned and half off-screen, rising on hover. The opponent's card backs fanned at the top edge.
- Lands in the back row, creatures in front, planeswalkers to the right.
- The stack as a cascade on the right, middle height. A large preview on the left.

## Key facts and decisions

- **Art crop without an engine change.** Every one of the 6,686 card rows has `artCrop == image` with `/normal/` replaced by `/art_crop/` (verified). Token images follow the same pattern.
  - The client derives the crop from the image it actually shows. This also covers the French printing and the chosen printing.
  - Nothing changes in `view.ts`, `visibleFaces`, the protocol, `RULES_VERSION` or `PROTOCOL_VERSION`, and nothing new can leak.
  - The server `/scry/` allow list already accepts `art_crop`.
- **Shapes.** `PERM_RATIO = 1.2` for battlefield art cards; `CARD_RATIO = 1.395` stays for full cards (hand, stack, dialogs, preview). `TAP_DEG = 17`.
  - The bounding width of a tapped card is `TAP_W = cos17 + 1.2·sin17 ≈ 1.307` card widths.
  - The height a tap bleeds is `TAP_BLEED ≈ 0.12`, reserved all the time so cards don't resize on tap.
- **Tilt.** `transform: perspective(1400px) rotateX(var(--tilt))`, origin at the bottom centre, on `.battlefield.me` and `.opponents` only.
  - `--tilt` is 10deg by default, and 0 in light mode or at a height ≤ 560 px.
  - `fitBattlefield` reads `clientWidth`/`clientHeight`, which ignore transforms. Arrows, `findObjectEl`, drag and drop and the Coach use `getBoundingClientRect`, which is measured after the transform. So all of them stay correct.
  - Motion `layoutId` flights start about 10–20 px off: accepted. Lower the tilt to 8° if it shows on screenshots.
- **Weight.**
  - No new dependency: the `vendor` group would make it eager.
  - The WebGL backdrop is raw WebGL1 in a lazy `backdrop-*.js` chunk (about 5 KB, budget 12 KB).
  - The index chunk is at 2,329 of 2,350 KB, so report its size at every batch.
  - Add a CSS budget (`index-*.css` ≤ 60 KB, 56.5 KB today). Every batch deletes the rules it replaces.
- **Effects setting.** `planecircle.effects` = `full | light`. The default is light on a touch screen under 1100 px, full otherwise. Light means no WebGL, no tilt and no endless animation; the target pulse is kept.
- **Stable for tests:** `data-oid`, `data-oids`, `data-tuto`, `data-testid`, `.card` carrying `glow-*`, `.btn`/`.main-button`, `.sidebar`, `.drawer-toggle`, `.drawer-scrim`, `.perm > .card-slot`, `.token-count` ("×N"), `.walker-zone`, `.attachment`, `.player-bar.*`, `.avatar[data-oid]`, `.phase-turn`, `.banner`, `.rope`, `.stack-reveal-ok`.

## Lots (one commit each on `dev`; `npm run verify -- --set FDN --ui` after restarting Vite; screenshots in `test-results/restyle/V<n>/`)

### V0: tokens, one glow recipe, CSS budget
- **`styles.css` `:root`:**
  - surfaces: `--surface rgba(11,16,32,.96)`, `--surface-2`, `--hairline rgba(255,255,255,.1)`;
  - radii: `--r-1/2/3` (6/10/14 px);
  - shadows: `--shadow-1/2`;
  - easing: `--ease cubic-bezier(.16,1,.3,1)`;
  - fonts: `--font-display` (Cinzel), `--font-ui` (Inter);
  - ratios: `--card-ratio 1.395`, `--perm-ratio 1.2`;
  - `--tilt 10deg`;
  - `--line` stays as an alias of `--hairline`.
- **Glows:** each `.glow-*` only sets `--g`, and one rule draws `box-shadow: 0 0 0 2px var(--g), 0 0 14px 4px color-mix(in srgb, var(--g) 55%, transparent)`. The ⚔/⛨/✓ glyphs, the dashed selectable outline and the target pulse are kept.
- `tabular-nums` on life totals, P/T and counts.
- `tools/bundle-size.ts`: budget for the CSS file.
- New `docs/plans/PLAN-V.md` (plan and tracking).

### V1: no sidebar, floating preview, drawer on every width
- **`App.tsx` and `styles.css`:**
  - `.game` becomes one column.
  - `aside.sidebar` becomes the right drawer at every width (the ≤ 1100 px rules move out of the media query). A closed drawer gets `visibility:hidden` after its transition.
  - Delete `--sidebar-w` and the ≤ 1400 px rule.
  - `.modal-backdrop` gets `inset:0`.
  - `.drawer-toggle` is fixed at the top right.
- **`Sidebar.tsx`:**
  - The drawer keeps Settings and Log.
  - `HoverPreview` is rewritten as `PreviewFloat` (`data-tuto="preview"`). It is fixed at the left, centred vertically, with the image at `min(62dvh, 520px)` and a compact info column. It switches to the right side when the hovered card is under it.
  - Delete the `narrow` matchMedia logic and `.hover-preview`.
  - `TouchPreview` is unchanged.
- **`store.ts`:**
  - `hover` stays sticky, because the tutorial's `hovered()` reads it.
  - Add `hoverLive` (cleared 80 ms after leaving, through `endHover()`) and `previewHold`.
  - `Card`, log names and `CommanderChips` call `endHover` on mouse leave and blur.
- **`tutorial/Coach.tsx`:**
  - `preview` targets `[data-tuto="preview"]` and sets `previewHold` during the step.
  - The `log` and `settings` steps open the drawer, and close it afterwards if the Coach opened it.
  - Add `.preview-float` to the obstacles.
- **Tests:**
  - `proxy-smoke` and `always-answer-smoke` open the drawer first.
  - `lang-smoke` adds the `textContent` of `.sidebar .log-line, .sidebar .settings` to its sample.
  - Run `tutorial-smoke`.

### V2: art cards, 17° tap, layout
- **`images.ts`:** `artCropOf(url)` (normal → art_crop on `cards.scryfall.io`).
- **`i18n.ts`:** `faceArt(face, lang)` returns `{ src, full }`.
  - Custom art gives the full image (`full: true`).
  - Otherwise, the crop of the image `faceImage` would show.
  - If the image fails: art crop → full image positioned on the art box → `TextFrame`.
- **`layout.ts`:**
  - `PERM_RATIO`, `TAP_DEG`, `TAP_W`, `TAP_BLEED`;
  - `slotUnits`: a tapped slot is `TAP_W` wide;
  - `fitBattlefield` by height: `(h − FIXED_H − gaps) / (PERM_RATIO·peek·(f + b·LAND_SCALE) + TAP_BLEED·(1 + LAND_SCALE))`;
  - `walkerStep` and the walker overlap at `Board.tsx:581` use `PERM_RATIO`.
- **`Card.tsx`:**
  - New prop `art`, passed by Permanent, TokenStack, attachments, exiled-under cards and walkers.
  - Height `w·1.2`; Motion rotates to `TAP_DEG` (spring 420/38).
  - `img.art`, with `.art.full` positioned on the art box (`width:119%; left:-9.5%; top:-15%`).
  - Colour border: classes `c-W/U/B/R/G/M/C/L` (lands get their own colour).
  - Name strip only when the card is wide enough (`@container min-width 84px`).
  - P/T bubble at bottom right (light bevel, toughness in red when damaged; `.dmg-badge` removed).
  - Loyalty at bottom centre; counters merged into one chip; keyword badges kept.
- **`Board.tsx`:** prefetch the art crops of permanent spells on the stack and in hand (`new Image().src`).
- **`styles.css`:** every 1.395 in the battlefield rules becomes `var(--perm-ratio)`.
- **Tests:**
  - `client/test/layout.test.ts`:
    - new values for tapped slots, piles, the fit by height and `walkerStep`;
    - assert `--perm-ratio: 1.2` in `styles.css`.
  - `tools/battlefield-smoke.ts`:
    - card width read from `--card-w` instead of `height / 1.395`;
    - new checks: a tapped card's angle is 17 ± 0.5°; its slot width is `TAP_W·w`; battlefield images use `art_crop`.

### V3: HUD, phase track, action button, stack, hands (`Board.tsx`, `styles.css` players, centre strip, stack, hand and actions)
- **Avatar:**
  - 64 px circle; life pill overlapping its bottom, in Cinzel;
  - static turn ring; delete the endless `turn-spin` and `turn-glow` animations;
  - `LifeTotal` colours from tokens.
- **Piles:** library, graveyard (top card's art crop) and exile as small tiles with counts. Their classes and `data-tuto` are kept.
- **Mana pool:** a floating pill above the avatar.
- **Opponent:** centred `.top-row`; card backs fanned at the top edge (rotation by `--i`/`--n`, half off-screen).
- **Centre line:**
  - transparent band with a hairline;
  - phase pills, the current one underlined in `--turn`, stops as dots;
  - `.phase-turn` stays visible, because ui-smoke and deck-smoke parse it;
  - `Banner` as a centred pill.
- **Stack:** absolute at the right, middle height. Cascade of full cards, the newest in front, overlap computed from `n`. `layoutId` and `data-tuto` are kept.
- **Action panel:**
  - `useMainAction` gets the tone `respond` when the stack is not empty;
  - `.main-button.hot` is amber (`#ffb547 → #e07b1a`), `.respond` is blue (`#4fa8ff → #1d6fd1`);
  - the `Rope` moves above the button.
- **Hand:** `--hand-peek .62` (0.5 at a height ≤ 560 px). On hover the card rises until it is fully visible, scales to 1.06 and straightens to 0°.

### V4: tilted battlefield, effects setting
- **CSS:**
  - `.game[data-effects="full"] :is(.battlefield.me, .opponents) { transform: perspective(1400px) rotateX(var(--tilt)); transform-origin: 50% 100% }`;
  - `--tilt: 0` at a height ≤ 560 px;
  - mats: rounded inset panels on `.battlefield.me` and `.opp-zone`.
- **Effects setting:**
  - `boardThemes.ts`: `loadEffects`/`saveEffects`;
  - `store.ts`: `effects`;
  - `App.tsx`: `data-effects` on `.game`;
  - `Sidebar.tsx`: a "Graphics" `.seg` with Full and Light.
- **French catalog** (`client/locales/fr.json`, then `npx tsx tools/locales.ts`): "Graphics", "ctx:graphics|Full", "ctx:graphics|Light", "Animated table and tilted battlefield", "Still table and flat battlefield, for less powerful devices".

- **Tests:**
  - `battlefield-smoke`: the transform is not `none`; "planeswalker right of rows" is compared in layout coordinates (`offsetLeft` chain, written inline in `page.evaluate`).
  - `boardThemes.test`: the effects default, a round trip, and storage unavailable.

### V5: themes rework (procedural, Arena-toned)
- `styles.css` :135–209: each `[data-board]` theme only sets `--bd-0`, `--bd-1`, `--bd-pool` and an optional `--bd-tex` (the existing SVG noise or wood grain). Palettes:

  | Theme | `--bd-0` | `--bd-1` | `--bd-pool` |
  |---|---|---|---|
  | night | #06080c | #1b2433 | #6f8fb8 |
  | felt | #050f0a | #173326 | #6f9f7c |
  | wood | #0d0805 | #33200f | #c08a52 |
  | slate | #08090b | #262b31 | #9aa6b2 |
  | leather | #0e0505 | #3a1715 | #b86a52 |
  | arcane | #07050f | #221838 | #8f6cd8 |
  | ocean | #030b10 | #0f2d38 | #5fb4c4 |

- One generic `.board` background: texture, then a central light pool (radial gradient of `--bd-pool` at 30%), then a radial gradient from `--bd-1` to `--bd-0` that gives the vignette.
- One generic `.swatch` rule.
- Theme ids and labels are unchanged, so `boardThemes.test` and the locales stay as they are.

### V6: WebGL backdrop (lazy)
- **New `board/backdrop.ts`:**
  - WebGL1 with GLSL ES 1.00 and one full-screen triangle;
  - 4-octave fbm with one domain warp and a slow drift, a light pool, a vignette and dither;
  - uniforms `u_res`, `u_time`, `u_base`, `u_mid`, `u_pool`, read from the `--bd-*` variables with `getComputedStyle`, so CSS stays the single source.
- **Context options:** `alpha:false`, `antialias:false`, `powerPreference:"low-power"`, `failIfMajorPerformanceCaveat:true`. Without a GPU the CSS background stays. Dev-only `?backdrop=force` relaxes this for screenshots.
- **Performance:** half resolution with DPR ≤ 1, capped at 24 fps; paused when the tab is hidden; stopped on context loss or unmount; ResizeObserver on `.board`.
- **New `board/Backdrop.tsx`:**
  - `canvas.board-backdrop` as the first child of `.board` (`z-index:-1`, `.board { isolation:isolate }`, fades in after the first frame);
  - `import("./backdrop")` only when effects are full, there is no reduced motion and no `?fast`;
  - `setPalette` is called when the theme changes.
- **`tools/bundle-size.ts`:** `backdrop: 12 KB`. The check fails if the chunk is missing, so it stays lazy.

### V7: other screens matched
- `.modal` on `--surface`, `--hairline` and `--r-3`, with a Cinzel title.
- `.btn.primary` uses the amber of the main button.
- The lobby takes the static gradient of the chosen theme.
- Frequent hard-coded hex values become tokens, in dialogs, lobby, deck builder, tutorial, replay and BO3. No class name changes.

### V8: docs and closing
- **Docs:**
  - new `docs/ui.md`: tokens, glow recipe, art cards and `faceArt`, `PERM_RATIO`/`TAP_*`, tilt and geometry, backdrop eligibility, effects setting;
  - `docs/tutorial.md` (drawer and preview steps), `docs/history.md` § 17, the summary in `PLAN-V.md`;
  - `CLAUDE.md`: Documents; the Battlefield, Tablet and phone, and Bundle pitfalls; `planecircle.effects` under Saved settings.

## Critical files

- `packages/client/src/board/{Board,Card,Sidebar,layout}.ts(x)`
- `packages/client/src/styles.css`
- `packages/client/src/{i18n,images,store,boardThemes,App}.ts(x)`
- `packages/client/src/tutorial/Coach.tsx`
- New: `packages/client/src/board/{backdrop.ts,Backdrop.tsx}`
- `tools/{bundle-size,battlefield-smoke,mobile-smoke,proxy-smoke,lang-smoke,always-answer-smoke}.ts`
- `packages/client/test/{layout,boardThemes}.test.ts`
- `packages/client/locales/fr.json`

## Reused code

- `faceImage`/`imageUrl`/`customImage`/`tokenImage` (`i18n.ts`, `images.ts`, `cards/src/tokenImages.ts`)
- `fitBattlefield`/`fitHand`/`findObjectEl` (`layout.ts`)
- The drawer (`DrawerToggle`, `.drawer-scrim`, Escape in `App.tsx:68`)
- `Preview` (`Sidebar.tsx`)
- The `PaceControl` `.seg` pattern
- `boardThemes.ts` storage helpers
- `MotionConfig reducedMotion="user"` (`main.tsx`)
- `fastMode()` (`fast.ts`)

## Verification

- **Each batch:**
  - restart Vite, then `npm run verify -- --set FDN --ui`: tsc, Biome, bundle line with index/CSS/backdrop sizes, vitest, fuzz, and the interface tests (battlefield, mobile, tutorial, lang, ui smokes);
  - a one-off Playwright script captures the 1600×900 and 1280×720 duels, 4 players, iPad, phone landscape, the drawer open, tutorial lessons 1 and 5, each theme with `?backdrop=force` (SwiftShader), and Light vs Full.
- **Manual check on a real browser and GPU (`npm run dev -- --host`, tablet):** tilt sharpness, flight offset, backdrop CPU/GPU use (24 fps, paused when hidden).
- **End:** `npm run verify -- --full`, then the commits. Merge to `master` only on request.

## Tracking

| Lot | State | Commit |
|---|---|---|
| V0 | done: `:root` tokens (surfaces, hairline, radii, shadows, easing, fonts, card ratios, tilt), one glow recipe (`--g` per state), tabular figures, CSS budget in `tools/bundle-size.ts` (`index.css` 57 KB of 60) | 9781822 |
| V1 | done: no sidebar (one-column game, `.sidebar` is the settings and log drawer at every width, hidden from Tab when closed); `PreviewFloat` replaces `HoverPreview` (left of the screen, right when the pointer is under it; closes 80 ms after the pointer leaves any card, `hoverLive`, or on a click); the Coach opens the drawer for log and settings steps and holds the preview (`previewHold`); proxy, always-answer and lang smokes read the drawer | d3a7e2d |
| V2 | done: battlefield art cards (`Card art`): Scryfall art crop derived from the displayed image (`artCropOf`, `faceArt`; no engine or protocol change), the whole card framed on its art box for custom art or a failed crop, frame by color (`c-W/U/B/R/G/M/C/L`), name on top from 84 px, P/T in a light corner box (damage in red in the toughness, `.dmg-badge` removed); `PERM_RATIO` 1.2, tapped = 17° in a `TAP_W` (1.31) slot; the tap bleed (about 0.12 card) is not reserved: a tapped card overlaps the next line slightly, as on MTGA; layout tests (+2) and battlefield-smoke (art crops, 17° lean) | e2befc7 |
| V3 | done: avatar with the life in a pill at its foot and a steady turn ring (the endless `turn-spin` and `turn-glow` animations removed); library, hand, graveyard and exile as pills; opponents centered at the top with their hand as backs fanned and cut by the screen edge; transparent center line with a hairline, phase pills underlined in the turn color; stack as a panel on the right at mid-height (cascade, newest in front); main button amber, blue when it lets the stack resolve (`respond`); hand deeper (`--hand-peek` 0.62) and a hovered card rises whole; sickness mark top right on art cards. Kept: the rope stays on the center line, the graveyard pill keeps the top card's name (no art tile). `index.css` 60 KB: V5 (themes, smaller) goes before V4 | c0fb055 |
| V4 | done: graphics setting (`planecircle.effects`, `full`/`light`, light by default on a touch screen under 1,100 px; "Graphics" in the drawer, `data-effects` on `.game`); in full, each battlefield leans back from its bottom edge (`perspective(1400px) rotateX(10deg)`, 0 at a height ≤ 560 px); mats on each side, opponents separated by a gap; battlefield-smoke compares the planeswalker column in layout coordinates and checks the tilt; boardThemes test (+1) | 511bfe0 |
| V5 | done (before V4): every texture only sets its palette (`--bd-0`, `--bd-1`, `--bd-pool`) and grain (`--bd-tex`); one `[data-board]` rule draws the dark ground, the central light pool and the shaded edges, for the board and the settings swatches alike; `--felt-1/2` removed; `index.css` 60 → 59 KB | 2ce153e |
| V6 | done: `board/backdrop.ts` (raw WebGL 1, one full-screen triangle, 4-octave noise with a domain warp, light pool, vignette, dither; half resolution, 24 fps at most, paused when the tab is hidden, stopped on context loss) in a lazy chunk (`backdrop` 3 KB, budget 12 KB in `tools/bundle-size.ts`); `Backdrop.tsx` loads it with the full graphics, without reduced motion or `?fast`; `failIfMajorPerformanceCaveat` keeps the CSS background in software WebGL (headless tests), `?backdrop=force` in dev mode for screenshots; palette read from the texture's `--bd-*` variables | |
| V7 | to do | |
| V8 | to do | |
