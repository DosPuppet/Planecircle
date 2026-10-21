# Installing Planecircle on a server (pm2 + nginx)

This guide installs Planecircle on a Linux VPS that already hosts other applications behind **nginx**. The app runs with Node, managed by **pm2**, and only listens locally (`127.0.0.1:8787`); nginx publishes it over HTTPS on a subdomain.

Once installed, two players on two different machines open `https://mtg.mydomain.example`, choose "Contre un joueur" ("Against a player"): one creates the game and sends the link, the other joins it.

Throughout this guide, replace `mtg.mydomain.example` with your subdomain.

## 1. Domain name

At your registrar, create an **A** record `mtg.mydomain.example` → the VPS's IPv4 address (and **AAAA** if the VPS has an IPv6 address). Check from your machine:

```bash
dig +short mtg.mydomain.example
```

The app must be at the **root** of a (sub)domain: it does not work under a path such as `https://mydomain.example/mtg/`.

## 2. Node 24 and pm2

```bash
node --version        # v24.x expected
```

If Node is missing or too old (Debian/Ubuntu):

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Then pm2 (if it is not already there):

```bash
sudo npm install -g pm2
```

## 3. Getting the code

The repository has no remote of its own. Two possibilities:

- **Private repository** (GitHub, GitLab...): from your machine, `git remote add origin <url> && git push -u origin master`, then on the VPS:

  ```bash
  sudo mkdir -p /opt/planecircle && sudo chown "$USER" /opt/planecircle
  git clone <url> /opt/planecircle
  ```

- **Without a remote**: from your machine,

  ```bash
  git bundle create planecircle.bundle master
  scp planecircle.bundle vps:/tmp/
  ```

  then on the VPS: `git clone /tmp/planecircle.bundle /opt/planecircle`.

## 4. Install and build

```bash
cd /opt/planecircle
npm ci
npm run build          # builds the interface in packages/client/dist
npm run build:server   # compiles the server into packages/server/dist/main.mjs (run by pm2, without tsx)
```

## 5. Run with pm2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup            # once per machine: prints a sudo command to copy and paste
curl http://127.0.0.1:8787/healthz     # → {"ok":true,"build":"…","rules":…,"rooms":0,"memory":{…}}
```

Useful commands: `pm2 status`, `pm2 logs planecircle`, `pm2 restart planecircle`, `pm2 stop planecircle`.

**Logs:** pm2 does not rotate them by itself. Once per machine:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
```

**`/healthz`:** a direct local request (`curl` on the VPS, monitoring) receives the details as JSON: server commit, protocol and rules versions, rooms, memory. Through nginx, the answer is only "ok".

If port 8787 is already taken on the VPS, change `PORT` in `deploy/ecosystem.config.cjs` **and** in the nginx site (step 6), then `pm2 restart planecircle --update-env && pm2 save`.

Optional settings (same file, `env` section): `MTGX_DECISION_MS` (time per decision, 60,000 ms), `MTGX_GRACE_MS` (time to come back after a disconnection, 60,000 ms), `MTGX_MAX_ROOMS` (at most this many open rooms, 200), `MTGX_MAX_HEAP_MB` (JavaScript heap above which no more rooms are created, 384 MB), `MTGX_DATA_DIR` (backup of games in progress, `data/rooms` by default, `off` to disable it), `MTGX_MAX_ROOMS_PER_IP` (at most this many open rooms per creator address, 4), `MTGX_ORIGINS` (origins allowed for the WebSocket in addition to the site itself, comma-separated; not needed normally).

**Online AI seats (PLAN-E):** the AIs of the rooms think in workers (`packages/server/dist/ai-worker.mjs`, built with the server), never in the main thread. `MTGX_AI_WORKERS` (workers, 2 at most by default; `0`: no online AI), `MTGX_MAX_AI_ROOMS` (at most this many open rooms with AI, 12), `MTGX_MAX_RSS_MB` (memory of the process, workers included, above which no room with AI is created, 640 MB; keep pm2's `max_memory_restart` above it). Locally, `/healthz` gives the state of the workers (`ai`: workers, busy, queue, thinking time p50 and p95 in ms). Measurement: `node --expose-gc --import tsx tools/load-test.ts --rooms 10 --ai 3 --workers 2`. On 2026-10-06 (rooms with one human and three AIs, 60 human decisions each): RSS from 266 MB at rest to 586 MB for 10 rooms and 685 MB for 20 (about 20 MB per room with AI, in addition to the workers; barely less with a single worker: 649 MB for 20), main-thread heap almost stable (0.6 MB per room), event loop p99 of 19 to 20 ms, AI thinking p95 of 23 to 31 ms. Hence at most 12 rooms with AI and 640 MB of RSS, under the 768 MB of `max_memory_restart`; to open more, raise both together if the VPS has the memory.

## 6. nginx and HTTPS

```bash
sudo cp deploy/nginx-planecircle.conf /etc/nginx/sites-available/planecircle
sudo nano /etc/nginx/sites-available/planecircle      # replace mtg.mydomain.example
sudo ln -s ../sites-available/planecircle /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mtg.mydomain.example         # Let's Encrypt certificate + HTTPS redirect
```

If `nginx -t` reports that `$connection_upgrade` is already defined (another site uses it), remove the `map` block at the start of the file.

Important points of this site (already in the file):

- `location /ws` forwards the `Upgrade` and `Connection` headers: without them, online play does not connect;
- `proxy_read_timeout 1h`: otherwise nginx cuts a quiet WebSocket after 60 s;
- `X-Real-IP`: the player's address as seen by nginx; the server limits connections and rooms per address. `X-Forwarded-For` is not enough: its beginning is supplied by the client;
- `proxy_cache_key $scheme$host$uri` (in `/scry/`): one image per path, whatever the query string;
- HSTS: after `certbot`, add the line indicated in the comment at the top of the file to the `listen 443` block. The other security headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`) come from the Node server;
- `location /scry/` and `proxy_cache_path`: image relay (see "Images for players behind a proxy"). If `nginx -t` reports that the `planecircle_scry` zone already exists, the file is included twice.

### Images for players behind a proxy

Card images come from Scryfall (`cards.scryfall.io`). Some networks (company, school) block it. The app then relays the images through `https://mtg.mydomain.example/scry/…`, and nginx caches them (`/var/cache/nginx/planecircle-scry`, 2 GB at most).

- **Player side:** nothing to do. The relay turns on by itself when Scryfall does not answer. Otherwise, the player ticks "Images par le serveur Planecircle" ("Images through the Planecircle server"), on the home screen or in the game settings.
- **Server side:** only card images are relayed (allow list); this is not an open proxy. The VPS must be able to reach `cards.scryfall.io` over HTTPS.
- **Check:** run the following command twice. The first response contains `X-Cache: MISS`, the second `X-Cache: HIT`.

```bash
curl -sI https://mtg.mydomain.example/scry/small/front/8/d/8d8432a7-1c8a-4cfb-947c-ecf9791063eb.jpg | grep -i -E "^HTTP|x-cache"
```

### Custom art (optional)

Local images (proxies, alternate versions) can replace Scryfall's for the cards, tokens and backs they name. They are never in Git.

1. On your machine, prepare them: `npm run custom-art -- <images folder>=<set> […]`, with every folder at once, each one an art set (today `/home/dospu/Nier_cards=nier /home/dospu/MarioLuigi_cards=mario`): the images of a folder left out are deleted from `data/art/`. A precon chooses its set with `"art": "custom:<set>"`. Files are named after the card's English name (details at the top of `tools/custom-art.ts`). The result goes in `data/art/`: reduced WebP images (about 100 KB each) and `manifest.json`.
2. Copy that folder to the VPS, into the app's `data/` folder: `rsync -a data/art/ vps:planecircle/data/art/`. Another location is given by `MTGX_ART_DIR`.
3. The server serves them on `/art/`, without a restart. Every player on the server then sees the "Illustrations personnelles" ("Custom art") checkbox, ticked by default, on the home screen and in the game settings.
4. They replace the Scryfall image only in a deck that chooses them: The Vision precon for all its cards, or a card of your choice in the deck editor ("Illustration" menu, "Illustration personnelle"). The tokens and card backs of a player whose deck uses them take their own too.

### Arena of the 3D board

The 3D board (Graphics: 3D, PLAN-W) plays on a wooden table dressed with CC0 models and materials from Poly Haven (candles, lamp, lantern, chest, books, goblets, sword, shield; an HDRI for the light). They are never in Git.

1. `deploy/update.sh` builds them (`npm run arena-assets`): the first time, it downloads the assets listed in `tools/arena-assets.json` (each checked against its pinned md5), compresses them (KTX2 textures, meshopt geometry) into `data/arena/` (about 12 MB, budget 25 MB), with `CREDITS.md`; afterwards, only when the manifest changes. `MTGX_ARENA=0` skips it; another location is given by `MTGX_ARENA_DIR`. A failure (no network) does not stop the update: the 3D board keeps its plain table.
2. The server serves them on `/arena/` (hashed files cached for a year); without the folder, an empty manifest.
3. Their decoders compile WebAssembly: the CSP allows `'wasm-unsafe-eval'` (never JavaScript `eval`) and workers made from blobs.
4. An asset changed upstream stops the build with a message: check it, then `npm run arena-assets -- --pin` writes its new md5 into the manifest.

## 7. Check

- `https://mtg.mydomain.example/healthz` displays "ok";
- open `https://mtg.mydomain.example` on two machines (or a normal browser and a private window), "Contre un joueur", create a game on one side and join it on the other with the link.

## 8. Updating

```bash
cd /opt/planecircle
./deploy/update.sh
```

The script:
1. backs up the games in progress into `data/backups/rooms-<date>-<commit>.tgz` (the last ten are kept);
2. updates the code (`git pull`), the dependencies, the interface and the compiled server;
3. replays a copy of the games in progress with the new engine (`tools/rooms-check.ts`) and says how many will be interrupted: an update that changes the engine's rules interrupts the games whose fingerprints no longer match. To postpone it, stop there (Ctrl+C) and run it again when no game is in progress (`/healthz`, `rooms`);
4. restarts the server and waits for `/healthz` to answer (30 s at most).

**Installation from before the rename (MTG Mate, until 2026-10-05):** the script replaces the pm2 process `mtgmate` with `planecircle` by itself. The `/opt/mtgmate` folder, the `mtgmate` nginx site and its `mtgmate_scry` cache zone can stay as they are; if the repository changed address: `git remote set-url origin <new url>` before the update.

### Rolling back

If the new version causes a problem:

```bash
cd /opt/planecircle
git log --oneline -5                       # the previous commit
git checkout <previous commit>
npm ci && npm run build && npm run build:server
pm2 stop planecircle
rm -rf data/rooms && tar -xzf data/backups/rooms-<date>-<commit>.tgz -C data   # games from before the update
pm2 start planecircle && pm2 save
```

Restoring the backup is only useful if the games were interrupted by the new version: those played since are lost. Then go back to the branch (`git checkout master`) for the next update.

**Tabs left open:** the client sends its version (protocol and rules) when creating, joining or resuming a room. After an update, a tab running the old version receives "Une nouvelle version de Planecircle est disponible" ("A new version of Planecircle is available") and reloads the page; the reconnection token is kept, and the game resumes with the new version.

**Games in progress survive a restart**: each room is saved in `data/rooms/` (one file per room: the seats, then one decision per line) and resumed at startup, by replaying its decisions. Players reconnect by themselves (the browser retries for a minute) and have the usual grace period (`MTGX_GRACE_MS`).

Each saved decision carries a fingerprint of the resulting state, checked on resume. An update that changes the engine's behavior advances its rules version (`RULES_VERSION`): a game from another version resumes only if all its fingerprints match. Otherwise, it is interrupted: the file becomes `.rules<N>`, and the player who comes back reads "Partie interrompue par une mise à jour du moteur" ("Game interrupted by an engine update") (even after a second restart: `data/rooms/interrupted.json`). A different fingerprint at the same version (non-deterministic engine) sets the file aside (`.bad`). Files set aside are deleted after seven days.

At startup, the server resumes at most `MTGX_MAX_ROOMS` rooms (the most recent ones): a server restarted for lack of memory must not resume more than it can hold.

## Compression and cache

The server itself compresses the interface code (brotli or gzip) and caches it on the player's side; nginx has nothing to configure for this. A service worker keeps the application on the device after the first visit: later visits start immediately, even offline for a game against the AI.

## Troubleshooting

| Symptom | Probable cause |
|---|---|
| 502 Bad Gateway | app stopped (`pm2 status`, `pm2 logs planecircle`) or different port between pm2 and nginx |
| The page displays but "Contre un joueur" never connects | `Upgrade` / `Connection` headers missing in `location /ws` |
| Regular disconnections after about a minute | `proxy_read_timeout` too short in `location /ws` |
| "Trop de connexions depuis cette adresse" ("Too many connections from this address") | more than 8 tabs open from the same IP |
| "Serveur complet, réessayez plus tard" ("Server full, try again later") | `MTGX_MAX_ROOMS` limit reached, or heap above `MTGX_MAX_HEAP_MB` (`/healthz` locally) |
| "Trop de parties contre l'IA en cours sur le serveur" ("Too many games against the AI in progress on the server") | `MTGX_MAX_AI_ROOMS` limit reached, or RSS above `MTGX_MAX_RSS_MB` |
| "Trop de salons ouverts depuis cette adresse" ("Too many rooms open from this address") | `MTGX_MAX_ROOMS_PER_IP` limit; if all players seem to have the same address, check `X-Real-IP` in the nginx site |
| Online play impossible (WebSocket refused) | page served from an address other than the server's: add that origin to `MTGX_ORIGINS` |
| Cards without images for a player, "Images par le serveur Planecircle" ticked | the VPS cannot reach `cards.scryfall.io` (`curl -I https://cards.scryfall.io` from the VPS), or `location /scry/` is missing |
| Certificate refused by certbot | DNS does not point to the VPS yet, or port 80 is closed |

## Security

- The server only listens on `127.0.0.1`: it can only be reached through nginx.
- It is authoritative: decks are checked (Standard-legal and playable), every decision is checked by the engine, no hidden information is sent to the opponent.
- No accounts or personal data: a nickname per game, a reconnection token kept in the browser (`localStorage`), to resume the game if the page is reopened. On disk, only its fingerprint (SHA-256) is written, like that of the address of a room's creator; the files in `data/rooms` are readable only by the server's account (600).
- Content security policy (CSP): scripts and worker from the site only, images from the site and Scryfall, styles from Google Fonts, no framing by another page.
- WebSocket accepted only from the site itself (same host) or an origin in `MTGX_ORIGINS`: a page from another site cannot play in the player's place.
- Caps per IP address (simultaneous connections, open rooms, resumes included), based on the `X-Real-IP` forwarded by nginx; for IPv6, per /64 prefix (a subscriber often gets a whole one).
- A malformed request (badly encoded URL...) answers 400 or 500 without stopping the server.
- `/scry/` relay: allow list of card image paths, without the query string.
