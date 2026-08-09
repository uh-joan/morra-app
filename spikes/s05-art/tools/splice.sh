#!/usr/bin/env bash
#
# S0.5 art spike — splice windup.webm + throw{N}_body.webm into final
# per-throw render(s).
#
# Per README.md section 4 (WINDUP-ONCE rule, R1): windup.webm is rendered
# exactly once and must be concatenated identically into every throw's
# final clip. This script does the concatenation; tools/validate_splice.sh
# proves the windup segment came out pixel-identical across all outputs.
#
# Usage:
#   ./splice.sh <windup.webm> <throw_body_dir> <out_dir>
#
#   <windup.webm>      path to the single rendered windup clip
#   <throw_body_dir>   directory containing throw1_body.webm .. throw5_body.webm
#   <out_dir>          where to write throw{N}_w300.webm / throw{N}_w150.webm
#
# Example:
#   ./splice.sh out/windup.webm out/ out/final/
#
# Concatenation strategy:
#   1. Try stream-copy concat (ffmpeg concat demuxer, -c copy). This is
#      strongly preferred: with no re-encode, the windup bytes in the final
#      file are guaranteed identical to the source windup.webm bytes,
#      which is the strongest possible form of the R1 guarantee.
#   2. Stream-copy concat requires matching codec/timebase/keyframe
#      structure between the two inputs. If it fails (ffmpeg will error
#      loudly, or produce an unplayable file), fall back to a re-encode
#      concat via the concat filter. This is DOCUMENTED, not silent: a
#      re-encode changes windup pixels in principle (different encoder
#      decisions per invocation), which is exactly why
#      validate_splice.sh exists — always run it after using the
#      re-encode fallback, and treat a validate_splice.sh failure as a
#      real R1 violation requiring re-authoring, not something to
#      shrug off as fine because you meant to keep it identical, not
#      is it identical.
#
# The two reveal-timing variants (w=300 / w=150, README.md section 7) are
# assumed to already be baked into the throw body render (i.e. throw{N}_body
# is authored/trimmed per-variant by the render step) OR you pass
# --dual-variant to splice the SAME body file into both w300/w150 filenames
# as a placeholder until per-variant body renders exist. Default: dual-variant
# off (expects throw{N}_body_w300.webm and throw{N}_body_w150.webm to exist).

set -euo pipefail

usage() {
  echo "Usage: $0 [--dual-variant] <windup.webm> <throw_body_dir> <out_dir>" >&2
  exit 1
}

DUAL_VARIANT=0
if [[ "${1:-}" == "--dual-variant" ]]; then
  DUAL_VARIANT=1
  shift
fi

if [[ $# -ne 3 ]]; then
  usage
fi

WINDUP="$1"
BODY_DIR="$2"
OUT_DIR="$3"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found on PATH." >&2
  exit 1
fi

if [[ ! -f "$WINDUP" ]]; then
  echo "ERROR: windup file not found: $WINDUP" >&2
  exit 1
fi

if [[ ! -d "$BODY_DIR" ]]; then
  echo "ERROR: throw body directory not found: $BODY_DIR" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Splice windup + body -> out_file. Tries stream-copy first, falls back to
# re-encode concat filter on failure. Prints which path was used.
splice_pair() {
  local windup_file="$1"
  local body_file="$2"
  local out_file="$3"

  if [[ ! -f "$body_file" ]]; then
    echo "  SKIP: body file not found: $body_file" >&2
    return 1
  fi

  local list_file
  list_file="$(mktemp)"
  trap 'rm -f "$list_file"' RETURN

  {
    echo "file '$(cd "$(dirname "$windup_file")" && pwd)/$(basename "$windup_file")'"
    echo "file '$(cd "$(dirname "$body_file")" && pwd)/$(basename "$body_file")'"
  } > "$list_file"

  if ffmpeg -y -loglevel error -f concat -safe 0 -i "$list_file" -c copy "$out_file" 2>/dev/null; then
    echo "  OK (stream-copy): $out_file"
    return 0
  fi

  echo "  WARN: stream-copy concat failed for $out_file — falling back to re-encode." >&2
  echo "        This is a DOCUMENTED fallback (see script header); you MUST run" >&2
  echo "        validate_splice.sh afterward to confirm R1 (windup pixel identity) still holds." >&2

  if ffmpeg -y -loglevel error \
      -i "$windup_file" -i "$body_file" \
      -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[outv]" \
      -map "[outv]" \
      -c:v libvpx-vp9 -b:v 0 -crf 32 -pix_fmt yuv420p \
      "$out_file"; then
    echo "  OK (re-encode fallback): $out_file"
    return 0
  fi

  echo "  ERROR: both stream-copy and re-encode concat failed for $out_file" >&2
  return 1
}

FAIL=0

for n in 1 2 3 4 5; do
  if [[ "$DUAL_VARIANT" -eq 1 ]]; then
    # Placeholder mode: same body file used for both variants. Only useful
    # before per-variant body renders exist; final pipeline should render
    # throw{N}_body_w300 and throw{N}_body_w150 separately (README.md §7).
    body_file="${BODY_DIR}/throw${n}_body.webm"
    for w in 300 150; do
      out_file="${OUT_DIR}/throw${n}_w${w}.webm"
      echo "Splicing throw${n} (w=${w}, dual-variant placeholder)..."
      splice_pair "$WINDUP" "$body_file" "$out_file" || FAIL=1
    done
  else
    for w in 300 150; do
      body_file="${BODY_DIR}/throw${n}_body_w${w}.webm"
      out_file="${OUT_DIR}/throw${n}_w${w}.webm"
      echo "Splicing throw${n} (w=${w})..."
      splice_pair "$WINDUP" "$body_file" "$out_file" || FAIL=1
    done
  fi
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "" >&2
  echo "One or more splices failed or were skipped — see above." >&2
  exit 1
fi

echo ""
echo "All splices complete. Run ./validate_splice.sh next to confirm R1 (windup identity)."
