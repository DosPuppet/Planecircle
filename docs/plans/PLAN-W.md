# PLAN-W — optional 3D arena board (2026-10-21)

## Context

The user asked for a modern 3D game screen, as on MTG Arena: a built 3D battlefield, lights and particles, on the devices able to draw it. PLAN-V had excluded any 3D library ("no three.js", `docs/history.md` § 17, `docs/ui.md`); the user lifts that choice for an **optional** mode. The DOM board stays, as the default and as the fallback.

The user's choices:
- **Everything in 3D:** battlefield permanents, hand, stack and piles are meshes in an arena with lights, shadows, bloom and particles; the HUD (avatars, phases, banner, rope, main button, dialogs, preview) stays DOM over it, as on Arena.
- **three.js**, in a lazy chunk, used imperatively (like `board/backdrop.ts`); no react-three-fiber.
- **Arena dressing:** CC0 3D models and PBR materials (Poly Haven, Kenney, Quaternius), about 25 MB, downloaded only in 3D mode.
- **Activation:** a manual choice ("3D" in Graphics). It is refused without WebGL2 or with a software renderer only (`graphics.ts`); no benchmark.

## Key facts and decisions

- **Probe** (`client/src/graphics.ts`): a WebGL2 context granted without `failIfMajorPerformanceCaveat`, then the renderer's name (`WEBGL_debug_renderer_info`); SwiftShader, llvmpipe, softpipe, lavapipe and Microsoft Basic Render are refused; WSLg "D3D12 (…)" is a GPU. The context is released at once, the answer kept for the page. `?board3d=force` (dev) accepts a software renderer, for the headless interface tests.
- **Interaction proxies, no raycasting for input.** Each 3D card has a transparent DOM proxy: a ghost `Card` with the same `data-oid`, classes, glow, ARIA and badges, whose wrapper holds one flat projective `matrix3d` computed from the camera, so it covers the mesh exactly. Clicks, hover and preview, long press, keyboard focus, `findObjectEl` (arrows, effects, Coach) and the test selectors keep their code. The matrix is rewritten only when a card moves; z-order comes from the model (attachments, host, walkers, hovered card, flights). P/T, counters and keyword badges are drawn in screen space at the projected corner (sharp text). Raycasting only for dragging (pointer to the table plane) and the dev check `__board3d.projectedRect(id)`.
- **One model for meshes and proxies:** `board3d/model.ts` turns the view and the UI state into card nodes (uid, zone, face, glow, tapped, transform, layer). Placement reuses `layout.ts` (rows, slots, line split, `fitBattlefield`) at 100 virtual pixels per world unit, with the CSS gaps, so the 3D board keeps the DOM board's proportions.
- **Same decisions:** every action goes through the existing store functions (`clickPermanent`, `clickHandCard`, `clickPlayer`, `pickTarget`, `decide`); the glows come from functions shared with the DOM board. No change to the engine, the protocol or the rules.
- **Card images:** Scryfall sends `access-control-allow-origin: *`, so its images become textures through `<img crossOrigin>` (`img-src` already allows them); every URL still goes through `imageUrl`.
- **Weight:**
  - `three` and `board3d` are chunk groups before `vendor` (`vite.config.ts`), named without a hyphen (the service worker tells versions apart by the part before the first one);
  - `tools/bundle-size.ts` checks that the lazy chunks (backdrop, synth, qrscan, printings, three, board3d) are neither loaded by the page nor reached by a static import from it;
  - all 3D CSS goes in a lazy stylesheet: `index.css` is at 67.6 of its 68 KB.
- **Rendering on demand:** frames only while something moves or an effect plays; an idle board draws nothing ("no endless animation", `docs/ui.md`). Paused when the tab is hidden; a lost context brings back the DOM board.
- **Assets outside Git** (like `data/art/`): a manifest in Git (`tools/arena-assets.json`: URL, sha256, CC0 license, author, placement), `tools/arena-assets.ts` downloads and optimizes them (gltf-transform, meshopt, KTX2) into `data/arena/`, served on `/arena/` by the server and Vite. Without them, a procedural table in the colors of the chosen texture. The CSP gains `'wasm-unsafe-eval'` (WebAssembly decoders; not JS `eval`) and `worker-src blob:` (KTX2 workers).

## Lots (one commit each on `dev`; `npm run verify -- --set FDN --ui` after restarting Vite)

| Lot | Content |
|---|---|
| W0 | three dependency (0.186.1, exact), chunk groups, laziness check, `graphics.ts` probe and its test, this plan |
| W1 | Shared refactor, DOM board unchanged: glows, battlefield model, hand input (tap, drop, fan), `CardBadges`, `Card ghost`, `subscribeUpdates` in the store |
| W2 | Pure geometry and its tests: placement, seats (2 to 4 players), camera framing, projection (matrix3d, screen rects, pointer to plane); battlefield-smoke compares the placement with the DOM layout |
| W3 | Static 3D board behind the dev flag: scene, procedural table, card meshes, textures with a byte-budgeted LRU, model, proxies, HUD; `tools/board3d-smoke.ts` in `verify` |
| W4 | Motion (springs keyed by uid), transitions between zones, hand (fan, lift, first tap, drag), piles, opposing hands; the "3D" button in Graphics |
| W5 | Asset pipeline, `/arena/` route, CSP, deployment; procedural fallback |
| W6 | Shadows, glow rim, bloom, quality presets and a frame-time governor (60 fps at 1080p on a mid-range GPU, never below 30) |
| W7 | Particles and event effects (`fxmap.ts`, steps of `soundsFor`): damage, heal, death dissolve, cast in the card's colors, counters, attack and block, token, land, turn |
| W8 | 3 and 4 players; phone in portrait keeps the DOM board |
| W9 | `docs/ui.md` "3D board", CLAUDE.md, `docs/history.md`, summary; `verify --full` |

**Out of scope:** phone portrait in 3D, curved seating for 3 to 4 players, 3D avatars, lobby and deck editor in 3D, WebGPU, card text drawn in 3D, foil.

**Verification:** unit tests for every pure module; `tools/board3d-smoke.ts` (Chromium SwiftShader, `/?fast&board3d=force`): proxies on their projected cards within 1.5 px, `elementFromPoint` hits the right proxy, a land, a spell and an attack through the proxies, tutorial lesson 1, the DOM board without `force`, context loss back to the DOM board, no `three` chunk before 3D is chosen, no page error without the assets; the existing interface tests stay green on the DOM board; from W3 on, screenshots and frame rate on a real GPU shown to the user before the next lot.

## Tracking

| Lot | State | Commit |
|---|---|---|
| W0 | done: `three` 0.186.1 (exact) and `@types/three` 0.186.0; chunk groups `three` and `board3d` before `vendor`, `optimizeDeps.include`; `tools/bundle-size.ts` checks that the lazy chunks are neither loaded by the page nor statically reached from it (loaded with the page today: rolldown-runtime, vendor, cards, commander, locales, index); `graphics.ts` (`detect3d`, `probe3d`, `isSoftwareRenderer`, `forced3d`) and `graphics.test.ts` (5 tests). Verify: one failure in `server/test/ai-seats.test.ts` (room closing after a concession, 3 players), untouched code, passes alone 3 times out of 3: a timing flake under load | (this commit) |
