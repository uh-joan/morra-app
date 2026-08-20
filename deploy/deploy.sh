#!/usr/bin/env bash
# deploy.sh — build Morra and mirror the static dist to the Hetzner box that
# already runs Caddy (the same one serving buzz.joans.cat). Morra is a pure
# static site; there is nothing server-side to run.
#
# Usage:   deploy/deploy.sh
# Env (override as needed):
#   DEPLOY_HOST   the box            (default 178.105.134.73)
#   DEPLOY_USER   ssh user           (default root)
#   DEPLOY_PATH   dir Caddy serves   (default /srv/morra)
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_HOST="${DEPLOY_HOST:-178.105.134.73}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/morra}"
MODEL="spikes/models/vosk-model-small-ca-0.4.zip"

# 1 · the 42 MB Catalan vosk model is gitignored — fetch once if absent
if [[ ! -f "$MODEL" ]]; then
  echo "→ fetching the Catalan vosk model (42 MB, one time)…"
  ./spikes/models/fetch-ca-model.sh
fi

# 2 · build (prepare-assets copies the model + vendors MediaPipe/vosk;
#     check-origins asserts loaders stay same-origin; the CSP is injected)
echo "→ building apps/play…"
pnpm --dir apps/play build

# 3 · ensure the target exists, then mirror dist into it (delete removed files)
ssh "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p '${DEPLOY_PATH}'"
echo "→ rsyncing dist → ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}…"
rsync -avz --delete apps/play/dist/ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "✓ deployed — https://morra.joans.cat"
echo "  (first deploy only: add the Caddy vhost + volume, see deploy/README.md)"
