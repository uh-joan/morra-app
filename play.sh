#!/usr/bin/env bash
# Launch morra: spike server (static + live logs) + the game page.
# Usage: ./play.sh [port]     (default 8080)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8080}"
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
echo "game: ${URL}"
echo "other spikes: s01-fingers.html · s02-voice.html · s04-contention.html"
