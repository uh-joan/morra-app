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
  const { blockSize = 128, sustainMs = 60, vadMult = 6, floorMin = 0.015, floorCap = 0.15, excludeStartMs = null, excludeEndMs = null } = opts;
  let noiseFloor = 0.001, above = false, aboveSinceIdx: number | null = null, onsetHandled = false;
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
