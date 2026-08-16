// onset.ts — ported verbatim from spikes/s03-beat.html's
// findEnergyOnsetInBuffer. Offline (buffer-then-analyze) sustained-energy
// onset detector — the AUTHORITATIVE voice-onset detector in the spike's
// design (the live streaming VAD is cosmetic-only, see onlineOnsetStep.ts).
// Pure: takes a plain Float32Array window and returns where, within it, a
// sustained-energy onset was found.

export interface EnergyOnsetOptions {
  blockSize?: number;
  sustainMs?: number;
  vadMult?: number;
  floorMin?: number;
  floorCap?: number;
  excludeStartMs?: number | null;
  excludeEndMs?: number | null;
  /** Iteration-2 noisy-venue fix (2026-08-16 field data): seed the adaptive
   * noise floor with a measured value instead of the spike's constant 0.001.
   * The spike restarts the floor at 0.001 on every analysis pass, so in a
   * venue whose ambient RMS exceeds floorMin the very first block is "above
   * threshold" and the detector returns {onsetMs:0, preWindow:true} before
   * the floor ever adapts — 64% of field throws died this way. Callers
   * compute the seed with primeNoiseFloorFromBuffer() (so they can log it)
   * and pass it here. Omit (or pass null/undefined) for spike-verbatim
   * behavior — the default MUST stay spike-verbatim for parity. */
  initialNoiseFloor?: number | null;
}

export interface EnergyOnsetResult {
  onsetMs: number;
  /** true when energy was ALREADY above threshold at the very start of the
   * buffer — the true onset is at-or-before the window's start, so onsetMs
   * (always exactly 0 in this case) is a LOWER BOUND, not a precise reading. */
  preWindow: boolean;
}

export function findEnergyOnsetInBuffer(
  float32: Float32Array,
  sampleRate: number,
  opts: EnergyOnsetOptions = {}
): EnergyOnsetResult | null {
  const { blockSize = 128, sustainMs = 60, vadMult = 6, floorMin = 0.015, floorCap = 0.15, excludeStartMs = null, excludeEndMs = null, initialNoiseFloor = null } = opts;
  let noiseFloor = initialNoiseFloor != null && initialNoiseFloor > 0.001 ? initialNoiseFloor : 0.001;
  let above = false, aboveSinceIdx: number | null = null, onsetHandled = false;
  const sustainSamples = Math.max(1, Math.round((sustainMs / 1000) * sampleRate));

  {
    const n = Math.min(blockSize, float32.length);
    let sumSq = 0;
    for (let j = 0; j < n; j++) { const s = float32[j]!; sumSq += s * s; }
    const rms0 = n ? Math.sqrt(sumSq / n) : 0;
    const threshold0 = Math.min(Math.max(noiseFloor * vadMult, floorMin), floorCap);
    const inExcludeBand0 = excludeStartMs != null && 0 >= excludeStartMs && 0 <= excludeEndMs!;
    if (n && rms0 > threshold0 && !inExcludeBand0) return { onsetMs: 0, preWindow: true };
  }

  for (let i = 0; i + blockSize <= float32.length; i += blockSize) {
    let sumSq = 0;
    for (let j = 0; j < blockSize; j++) { const s = float32[i + j]!; sumSq += s * s; }
    const rms = Math.sqrt(sumSq / blockSize);
    if (!above) noiseFloor = noiseFloor * 0.995 + rms * 0.005;
    const threshold = Math.min(Math.max(noiseFloor * vadMult, floorMin), floorCap);
    const wasAbove = above;
    above = rms > threshold;
    if (above && !wasAbove) {
      aboveSinceIdx = i;
      onsetHandled = false;
    } else if (!above) {
      aboveSinceIdx = null;
      onsetHandled = false;
    } else if (above && aboveSinceIdx != null && !onsetHandled && i - aboveSinceIdx >= sustainSamples) {
      onsetHandled = true;
      const onsetMs = (aboveSinceIdx / sampleRate) * 1000;
      const inExcludeBand = excludeStartMs != null && onsetMs >= excludeStartMs && onsetMs <= excludeEndMs!;
      if (!inExcludeBand) return { onsetMs, preWindow: false };
      // else: this run was our own click/scheduled audio — keep scanning for a later, real onset
    }
  }
  return null;
}

/** Measure the ambient noise floor from the leading portion of an analysis
 * window, for use as EnergyOnsetOptions.initialNoiseFloor.
 *
 * Rationale (iteration-2, from the 2026-08-16 field logs): the capture
 * window opens SYNC_PRE_MS before the hand settles, so its first ~150ms is
 * pre-shout room ambience in essentially every legitimate throw. We take a
 * LOW quantile (25th percentile) of the per-block RMS over that region:
 * robust both to a shout leaking into the tail of the prime region (loud
 * blocks land in the upper quantiles and are ignored) and to blanked rival
 * clip regions (zeroed samples produce near-zero blocks, which only pull
 * the estimate DOWN — the fail-safe direction, since a too-low floor merely
 * reproduces today's spike behavior).
 *
 * A genuinely loud early shout still reads as preWindow upstream: threshold
 * stays capped at floorCap, and shout RMS runs well above any plausible
 * primed threshold.
 *
 * Returns 0.001 (the spike's constant) when the region holds no full block,
 * so degenerate inputs behave exactly like the unprimed detector. */
export function primeNoiseFloorFromBuffer(
  float32: Float32Array,
  sampleRate: number,
  primeMs = 150,
  blockSize = 128
): number {
  const primeSamples = Math.min(float32.length, Math.max(0, Math.round((primeMs / 1000) * sampleRate)));
  const rmsValues: number[] = [];
  for (let i = 0; i + blockSize <= primeSamples; i += blockSize) {
    let sumSq = 0;
    for (let j = 0; j < blockSize; j++) { const s = float32[i + j]!; sumSq += s * s; }
    rmsValues.push(Math.sqrt(sumSq / blockSize));
  }
  if (!rmsValues.length) return 0.001;
  rmsValues.sort((a, b) => a - b);
  const q25 = rmsValues[Math.floor((rmsValues.length - 1) * 0.25)]!;
  return Math.max(0.001, q25);
}
