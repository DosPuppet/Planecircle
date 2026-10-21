#!/usr/bin/env bash
# Update of Planecircle on the server: backup of the games in progress, code, dependencies, builds, check of the saved
# games with the new engine, restart. Rollback: docs/deployment.md (rollback section).
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${MTGX_DATA_DIR:-data/rooms}"

# 1. Backup of the games in progress (the last 10 kept in data/backups).
if [ -d "$DATA" ]; then
  mkdir -p data/backups
  backup="data/backups/rooms-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).tgz"
  tar -czf "$backup" -C "$(dirname "$DATA")" "$(basename "$DATA")"
  chmod 600 "$backup"
  ls -1t data/backups/rooms-*.tgz | tail -n +11 | xargs -r rm -f
  echo "Games backed up: $backup"
fi

# 2. Code, dependencies, interface and compiled server.
git pull --ff-only
npm ci
npm run build
npm run build:server
# Arena of the 3D board (PLAN-W): downloaded from Poly Haven and built the first time, then only when its manifest
# changes (MTGX_ARENA=0: never). A failure leaves the 3D board on its plain table, the update goes on.
if [ "${MTGX_ARENA:-1}" != "0" ]; then
  npm run arena-assets -- --quiet || echo "Warning: arena of the 3D board not built (the 3D board keeps its plain table)."
fi

# 3. Games in progress replayed with the new engine (on a copy): how many will be interrupted.
npx tsx tools/rooms-check.ts "$DATA" || echo "Warning: some games in progress will be interrupted (see above)."

# 4. Restart (the "mtgmate" process, the name before 2026-10-05, is replaced by "planecircle").
if pm2 describe mtgmate >/dev/null 2>&1; then
  pm2 delete mtgmate
  pm2 start deploy/ecosystem.config.cjs
else
  pm2 restart planecircle --update-env
fi
pm2 save
# The server takes a few seconds to start (loading the cards, resuming the rooms): wait until it answers.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz" >/dev/null 2>&1; then
    echo "Planecircle updated:"
    curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz"
    exit 0
  fi
  sleep 1
done
echo "Planecircle does not answer after 30 s: see pm2 logs planecircle" >&2
exit 1
