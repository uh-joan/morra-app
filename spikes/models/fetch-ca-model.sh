#!/usr/bin/env bash
# Re-fetches the Catalan small Vosk model used by spikes/s02-voice.html.
#
# Same reasoning as fetch-it-model.sh: alphacephei.com (the official Vosk
# model host) sends no Access-Control-Allow-Origin header, so a browser page
# served from anywhere else cannot fetch this model directly (CORS blocks
# it — confirmed empirically for both the Italian and Catalan models,
# 2026-08-08). Self-hosting same-origin with the spike page is the
# workaround. The official .zip works as-is with vosk-browser's extractor;
# no conversion to .tar.gz is needed.
set -euo pipefail
cd "$(dirname "$0")"
URL="https://alphacephei.com/vosk/models/vosk-model-small-ca-0.4.zip"
OUT="vosk-model-small-ca-0.4.zip"
echo "Fetching $URL -> $OUT (~42 MB)..."
curl -fL --progress-bar -o "$OUT" "$URL"
echo "Done: $(ls -la "$OUT")"
