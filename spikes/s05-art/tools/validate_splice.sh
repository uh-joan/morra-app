#!/usr/bin/env bash
#
# S0.5 art spike — validate the WINDUP-ONCE rule (R1).
#
# Extracts the windup segment (first N frames, matching the known windup
# duration) from every final spliced throw render, and pixel-diffs them
# against each other. Reports IDENTICAL or NOT IDENTICAL — this is the
# actual proof artifact for the plan's Step-7 gate: "windup leak gates
# (R1): pixel-diff asserts windup frames identical across all throw
# renders" (and the S0.5-specific version of the same check on this
# spike's single clip).
#
# Two methods, pick with --method:
#   framemd5   (default) - ffmpeg framemd5 muxer: per-frame MD5 hashes of
#              decoded video. Exact byte-for-byte-after-decode comparison.
#              Strict: any re-encode difference, even visually
#              imperceptible, will show as NOT IDENTICAL. This is the
#              correct level of strictness for R1 when the pipeline uses
#              stream-copy splicing (should be exactly identical).
#   ssim       structural similarity vs a reference clip's windup segment.
#              Use this if the pipeline had to use splice.sh's re-encode
#              fallback (framemd5 will legitimately differ after
#              re-encoding even when the content is visually identical).
#              Reports mean SSIM; treat SSIM < 0.995 as a real difference
#              worth investigating, not automatically a failure — use
#              judgement, and prefer fixing the pipeline to use stream-copy
#              over loosening this threshold.
#
# Usage:
#   ./validate_splice.sh [--method framemd5|ssim] [--windup-frames N] <clips_dir>
#
#   <clips_dir>  directory containing throw{1..5}_w{300,150}.webm (i.e. the
#                output of splice.sh)
#
# Exit code 0 = all windup segments identical (or SSIM above threshold).
# Exit code 1 = mismatch found, or setup problem.

set -euo pipefail

METHOD="framemd5"
WINDUP_FRAMES="${WINDUP_FRAMES:-24}"  # must match WINDUP_FRAME_COUNT in pose_render.py
SSIM_THRESHOLD="0.995"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --method)
      METHOD="$2"; shift 2 ;;
    --windup-frames)
      WINDUP_FRAMES="$2"; shift 2 ;;
    --ssim-threshold)
      SSIM_THRESHOLD="$2"; shift 2 ;;
    -*)
      echo "Unknown option: $1" >&2; exit 1 ;;
    *)
      break ;;
  esac
done

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 [--method framemd5|ssim] [--windup-frames N] <clips_dir>" >&2
  exit 1
fi

CLIPS_DIR="$1"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found on PATH." >&2
  exit 1
fi

if [[ ! -d "$CLIPS_DIR" ]]; then
  echo "ERROR: clips directory not found: $CLIPS_DIR" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

CLIPS=()
for n in 1 2 3 4 5; do
  for w in 300 150; do
    f="${CLIPS_DIR}/throw${n}_w${w}.webm"
    if [[ -f "$f" ]]; then
      CLIPS+=("$f")
    else
      echo "WARN: missing expected clip: $f (skipping)" >&2
    fi
  done
done

if [[ ${#CLIPS[@]} -lt 2 ]]; then
  echo "ERROR: need at least 2 clips to compare, found ${#CLIPS[@]}." >&2
  exit 1
fi

echo "Validating windup identity (R1) across ${#CLIPS[@]} clips, method=$METHOD, first $WINDUP_FRAMES frames..."
echo ""

if [[ "$METHOD" == "framemd5" ]]; then
  HASHES=()
  for clip in "${CLIPS[@]}"; do
    base="$(basename "$clip")"
    hash_file="${WORK_DIR}/${base}.framemd5"
    ffmpeg -y -loglevel error -i "$clip" -vframes "$WINDUP_FRAMES" \
      -f framemd5 "$hash_file"
    # Strip the header/comment lines (start with '#') so only per-frame
    # hash lines are compared.
    grep -v '^#' "$hash_file" > "${hash_file}.clean"
    HASHES+=("${hash_file}.clean")
  done

  REFERENCE="${HASHES[0]}"
  REFERENCE_CLIP="${CLIPS[0]}"
  ALL_MATCH=1

  for i in "${!HASHES[@]}"; do
    if [[ "$i" -eq 0 ]]; then
      continue
    fi
    if diff -q "$REFERENCE" "${HASHES[$i]}" >/dev/null 2>&1; then
      echo "IDENTICAL : $(basename "${CLIPS[$i]}") == $(basename "$REFERENCE_CLIP")"
    else
      echo "NOT IDENTICAL : $(basename "${CLIPS[$i]}") != $(basename "$REFERENCE_CLIP")"
      ALL_MATCH=0
    fi
  done

  echo ""
  if [[ "$ALL_MATCH" -eq 1 ]]; then
    echo "RESULT: IDENTICAL — windup segment matches byte-for-byte (post-decode) across all clips. R1 holds."
    exit 0
  else
    echo "RESULT: NOT IDENTICAL — windup segment diverges across clips. R1 is VIOLATED."
    echo "        If splice.sh used the re-encode fallback, re-run with --method ssim"
    echo "        to check whether the divergence is visually meaningful, but the"
    echo "        correct fix is switching the pipeline back to stream-copy splicing."
    exit 1
  fi

elif [[ "$METHOD" == "ssim" ]]; then
  REFERENCE_CLIP="${CLIPS[0]}"
  ref_windup="${WORK_DIR}/reference_windup.webm"
  ffmpeg -y -loglevel error -i "$REFERENCE_CLIP" -vframes "$WINDUP_FRAMES" \
    -c:v libvpx-vp9 -crf 10 -b:v 0 "$ref_windup"

  ALL_PASS=1
  for i in "${!CLIPS[@]}"; do
    if [[ "$i" -eq 0 ]]; then
      continue
    fi
    clip="${CLIPS[$i]}"
    cand_windup="${WORK_DIR}/cand_${i}.webm"
    ffmpeg -y -loglevel error -i "$clip" -vframes "$WINDUP_FRAMES" \
      -c:v libvpx-vp9 -crf 10 -b:v 0 "$cand_windup"

    ssim_log="${WORK_DIR}/ssim_${i}.log"
    ffmpeg -y -loglevel error -i "$cand_windup" -i "$ref_windup" \
      -lavfi ssim="$ssim_log" -f null - 2>/dev/null || true

    if [[ ! -f "$ssim_log" ]]; then
      echo "ERROR: SSIM computation failed for $(basename "$clip")" >&2
      ALL_PASS=0
      continue
    fi

    mean_ssim="$(grep -oE 'All:[0-9.]+' "$ssim_log" | tail -1 | cut -d: -f2)"
    if [[ -z "$mean_ssim" ]]; then
      echo "ERROR: could not parse SSIM output for $(basename "$clip")" >&2
      ALL_PASS=0
      continue
    fi

    pass="$(awk -v a="$mean_ssim" -v t="$SSIM_THRESHOLD" 'BEGIN{print (a>=t)?"1":"0"}')"
    if [[ "$pass" == "1" ]]; then
      echo "IDENTICAL (SSIM=$mean_ssim >= $SSIM_THRESHOLD) : $(basename "$clip") vs $(basename "$REFERENCE_CLIP")"
    else
      echo "NOT IDENTICAL (SSIM=$mean_ssim < $SSIM_THRESHOLD) : $(basename "$clip") vs $(basename "$REFERENCE_CLIP")"
      ALL_PASS=0
    fi
  done

  echo ""
  if [[ "$ALL_PASS" -eq 1 ]]; then
    echo "RESULT: IDENTICAL (within SSIM threshold $SSIM_THRESHOLD) — R1 holds."
    exit 0
  else
    echo "RESULT: NOT IDENTICAL — some clip's windup segment falls below the SSIM threshold. R1 is VIOLATED."
    exit 1
  fi

else
  echo "ERROR: unknown method '$METHOD' (expected framemd5 or ssim)" >&2
  exit 1
fi
