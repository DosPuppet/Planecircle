# PLAN-X — a second 3D arena: a Japanese shrine diorama (2026-10-21)

## Context

After PLAN-W (the 3D board on a tavern table), the user asked for a second 3D battlefield the player can choose, closer to MTG Arena's animated dioramas: a traditional Japanese setting at night — a torii, shrine buildings, a pagoda, seasonal vegetation, koi, realistic tidal water, yokai moving around, fireflies and insects, glowing lanterns, a slight moving fog — detailed all around the battlefield.

The user's choices:
- **Models built in code** (torii, pagoda, shrines, lanterns, trees, koi, yokai), dressed with Poly Haven CC0 materials (hinoki, cedar, roof tiles, stone, moss, gravel) and CC0 models (pines, rocks, ferns), a CC0 night HDRI: no license to manage, everything automated.
- **Animation by quality:** High 60 frames a second (reflective water, layered fog), Medium 30, Low a still diorama (the board rests between moves as the tavern does); paused with the tab; reduced motion makes it still.
- **Seasons follow the real date:** spring sakura and falling petals, summer greens and fireflies, autumn momiji and falling leaves, winter snow on roofs and branches.
- **The arena is chosen** in the drawer (next to the 3D quality) and on the home screen's settings (⚙), and remembered.

## Concept

The floating torii of Itsukushima: the battlefield is a hinoki stage over a tidal bay at night. Beyond the far edge, a vermilion torii stands in the water, the moon over the sea; on one bank a five-story pagoda among pines, on the other the shrine's halls; stone lanterns (tōrō) and paper lanterns (chōchin) along the stage's edges; koi under the surface near the stage; fireflies (summer), moths around the lanterns; yokai: hitodama (floating spirit flames), a chōchin-obake (a lantern ghost hopping along the bank), kitsune-bi (fox fires running on the shore), kodama (small tree spirits) in the trees; fog drifting over the water.

## Key decisions

- **Arenas, plural** (`tools/arena-assets.json`: `arenas.<id>`): each built into `data/arena/<id>/` (its own manifest, fingerprint, budget), the basis transcoder shared; served on `/arena/<id>/…`; the client loads `/arena/<id>/manifest.json`. An arena is either `props` (the tavern) or a `diorama` (code in a lazy chunk of its own: `board3d/shrine/`).
- **The choice** (`planecircle.arena3d`: `tavern` | `shrine`), in the store; changing it while the board is drawn reloads the scene behind the loading screen.
- **Continuous animation:** a diorama's `update(dt, time)` keeps the scene drawing at the quality's rate (60/30 frames a second, none in Low); only uncapped frames count for the governor (a frame held to 30 a second is not slow).
- **Light budget:** a fixed set of real lights (the moon, two lantern lights near the stage, the rune pool); every other lantern glows by an emissive mesh, a light decal on the ground and the bloom. No light added during play.
- **Draw calls:** instancing and merged geometry for repeated things (lanterns, planks, leaves, grass, koi, fireflies).
- **Framing:** a diorama may ask for more room around the table (wider side margins), so the scenery shows. Measured (X2): the camera sees the same world whatever the room (only the table shrinks), and nothing taller than about half a unit beyond the far edge; the landmarks stand at the far corners and beside the stage, where they show whole.
- **Life on the table (the user, X4):** walking yokai may walk on the stage (deck, walkway) but never on the mats; flying ones may fly over the whole battlefield, but rarely and briefly, so the cards stay readable.

## Lots (one commit each on `dev`)

| Lot | Content |
|---|---|
| X0 | Several arenas: manifest and tool, `/arena/<id>/` (server, Vite), the choice (store, drawer, home screen), the scene's diorama hook and continuous animation at a capped rate; the tavern unchanged |
| X1 | The shrine's ground: the hinoki stage around the battlefield, the bay's water (Gerstner waves, a slow tide, fresnel and reflections; planar reflection on High), the shore (sand, rocks, moss), the night sky (gradient, stars, moon), moonlight and fog layers |
| X2 | Architecture: the torii in the water, the pagoda, the shrine halls (haiden, honden), stone and paper lanterns (glow decals, swaying), a bridge |
| X3 | Vegetation by season: sakura, momiji, pines, bamboo, grass and ferns; falling petals, leaves or snow; snow on roofs in winter |
| X4 | Life: koi, fireflies and moths, yokai (hitodama, chōchin-obake, kitsune-bi, kodama) |
| X5 | Quality tiers, tests (`board3d-smoke`: the shrine loads, animates at its rate, rests in Low; season by date), documentation |

## Tracking

| Lot | State | Commit |
|---|---|---|
| X0 | Done: arenas `tavern` and `shrine` (`data/arena/<id>/`, budget 100 MB each, the shrine 17.7 MB: its materials, rocks, shrubs, a fern, a stump; Poly Haven's pine is a 949 MB scan, its trees are built in code), the choice in the drawer and on the home screen, the diorama hook (`diorama.ts`: season by date, room kept around the table, continuous animation at the quality's rate), the shrine's stub (stage, bay, moonlight); `board3d-smoke` checks the shrine animates in Medium and rests in Low. Fixed on the way: the arena froze at a third of its loading under the server's CSP (three.js's basis transcoder builds functions with `new Function`; `tools/basis-transcoder.ts` rewrites them as closures and checks the result with code generation off; `loadArena` gives up after 20 s without a file and the board says so); in development, StrictMode replaced the `?quality=` of the interface tests by the automatic quality (they drew in High) | 6aa4f35a |
| X1 | Done: the plan (`shrine/plan.ts`, pure, tested: the stage over open water, the banks beyond its sides, the bay opening towards the torii's place), the terrain (sand blending into forest ground, wet and glossy under the tide's last line), mossy rocks along the waterline, the stage (hinoki deck darkened under the cards, cedar edges, vermilion railings on three sides, none on the near side where they would rise into your battlefield, bronze finials, pillars), the water (Gerstner waves calmer in the shallows, a two-minute tide, ripples breaking the moon into glints, clear over the sand, dark where deep, a foam line; planar reflection of the diorama in High, never of the cards), the night sky baked as the water's environment (never seen directly at this camera angle), mist sheets kept off the stage, the moon over the far left (its glints on the water you see). PCFSoftShadowMap, removed from three.js, replaced by PCFShadowMap (same result, no warning) | a9502ac0 |
| X2 | Done: the torii in the water beside the stage's left side (Itsukushima's ryōbu torii: braced legs, black upturned kasagi, plaque) and the hall on the beach behind it (chigi, katsuogi, straw rope); the islet off the right side with a three-story pagoda (bracket layers, swept roofs, bronze spire with nine rings) and the arched bridge to it (the right railing opens for it); paper lanterns on every other railing post (candle flicker, sway, glow, a pool of light on the deck), stone lanterns on the beaches and around the far corners, floating lanterns drifting and bobbing on the far water with their light on it; two real lights only (created with the diorama); tatami on the battlefields (woven rush drawn on a canvas, its normal map); the geometry kit (`kit.ts`: concave roofs with swept corners, curved beams, merging: a few draw calls per building); `setPalette` leaves a diorama's sky, lights and mats alone | (this commit) |
