#!/usr/bin/env bash
# Generate the rival's Catalan call clips from a macOS TTS voice.
# Usage: ./generate.sh [VoiceName]   (default: Jordi — male Catalan; install via
#   System Settings → Accessibility → Spoken Content → Manage Voices → Catalan)
# Output: <word>.m4a files next to this script (m4a = small, plays natively in browsers).
set -euo pipefail
cd "$(dirname "$0")"

VOICE="${1:-Jordi}"

if ! say -v '?' | grep -q "^${VOICE} "; then
  echo "Voice '${VOICE}' is not installed. Installed Catalan voices:"
  say -v '?' | grep ca_ES || true
  echo "Install Jordi: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → Catalan → Jordi"
  exit 1
fi

# Catalan morra calls (ten = "deu" or "tot"; no "morra" call in Catalan)
WORDS=(dos tres quatre cinc sis set vuit nou deu tot)

for w in "${WORDS[@]}"; do
  # Slight rate bump: calls are shouted/clipped in real play, not spoken leisurely
  say -v "$VOICE" -r 220 -o "${w}.m4a" --file-format=m4af "${w}!"
  echo "generated ${w}.m4a"
done

echo "Done: ${#WORDS[@]} clips with voice '${VOICE}'."
