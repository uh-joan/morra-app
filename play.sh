#!/usr/bin/env bash
# Launch morra: either the spike (static + live logs, default — unchanged
# behavior) or the real app (M4/M5's apps/web, Vite dev server) — run both
# side by side for the M5 human acceptance pass.
#
# Usage:
#   ./play.sh                 spike on :8080 (default, same as before)
#   ./play.sh [port]          spike on a custom port (same as before)
#   ./play.sh spike [port]    spike, explicit
#   ./play.sh app [port]      the real app (apps/web), Vite dev server on :5173 by default
set -euo pipefail
cd "$(dirname "$0")"

MODE="spike"
PORT_ARG=""
if [[ "${1:-}" == "spike" || "${1:-}" == "app" ]]; then
  MODE="$1"
  PORT_ARG="${2:-}"
else
  PORT_ARG="${1:-}"
fi

if [[ "$MODE" == "app" ]]; then
  PORT="${PORT_ARG:-5173}"
  URL="http://localhost:${PORT}/"
  echo "app: starting apps/web's Vite dev server on :${PORT} (Partida + Entrenament, the real game)…"
  echo "app: first run? \`pnpm install\` at the repo root first if you haven't already."
  ( cd apps/web && pnpm dev --port "${PORT}" ) &
  DEV_PID=$!
  sleep 2
  open "${URL}" 2>/dev/null || true
  echo "app: ${URL}"
  echo "app: Ctrl-C to stop (dev server pid ${DEV_PID})"
  wait "${DEV_PID}"
  exit 0
fi

PORT="${PORT_ARG:-8080}"
URL="http://localhost:${PORT}/s03-beat.html"

# Start the server only if this port isn't already serving
if curl -s -o /dev/null --max-time 1 "http://localhost:${PORT}/serve.py" 2>/dev/null; then
  echo "server already running on :${PORT}"
else
  mkdir -p spikes/logs
  ( cd spikes && nohup python3 serve.py "${PORT}" > logs/server.out 2>&1 & )
  sleep 1
  echo "server started on :${PORT} (logs: spikes/logs/, server output: spikes/logs/server.out)"
fi

open "${URL}"
echo "spike: ${URL}"
echo "other spikes: s01-fingers.html · s02-voice.html · s04-contention.html"
echo
echo "for the real app instead (M4/M5's apps/web): ./play.sh app"
echo "to run both side by side for the M5 acceptance pass: ./play.sh in one terminal, ./play.sh app in another"
