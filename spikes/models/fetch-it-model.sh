#!/usr/bin/env bash
# Re-fetches the Italian small Vosk model used by spikes/s02-voice.html.
#
# Why this exists: alphacephei.com (the official Vosk model host) does not
# send an Access-Control-Allow-Origin header on model downloads, so a browser
# page served from anywhere else cannot fetch this model directly (CORS
# blocks it, confirmed empirically 2026-08-08). Self-hosting the file
# same-origin with the spike page is the workaround. vosk-browser's archive
# extractor auto-detects the format, so the official .zip works as-is; no
# conversion to .tar.gz is needed (also confirmed empirically).
set -euo pipefail
cd "$(dirname "$0")"
URL="https://alphacephei.com/vosk/models/vosk-model-small-it-0.22.zip"
OUT="vosk-model-small-it-0.22.zip"
# SHA-256 of the known-good archive (verified working 2026-08-08); abort on mismatch (audit H4)
EXPECTED_SHA256="9ec65e75861d1c6c2e457cccd932705340dcdf233f5b239f00733b4de0bf3267"
echo "Fetching $URL -> $OUT (~48 MB)..."
curl -fL --proto '=https' --tlsv1.2 --progress-bar -o "$OUT" "$URL"
echo "${EXPECTED_SHA256}  ${OUT}" | shasum -a 256 -c - || { echo "CHECKSUM MISMATCH — deleting download"; rm -f "$OUT"; exit 1; }
echo "Done: $(ls -la "$OUT")"
