// blanking.ts — generalized from spikes/s03-beat.html's Phase C.3
// blankRivalAudioRegions: zeroes out any part of an extracted audio window
// that overlaps a caller-supplied list of "known non-player audio" regions
// (originally the rival's own scheduled voice clips, on the SAME shared
// AudioContext as the mic capture — but the arithmetic never actually knew
// anything "rival"-specific, hence the generalized name/API here: an
// injected exclusion list of any scheduled-audio [start,end] ctx-time
// ranges). Pure: never mutates the input array.

export interface ExclusionRegion {
  startCtxTime: number;
  endCtxTime: number;
}

export interface BlankingResult {
  samples: Float32Array;
  blankedMs: number;
}

export function blankExclusionRegions(
  samples: Float32Array | null | undefined,
  sampleRate: number,
  windowStartCtxTime: number | null,
  windowEndCtxTime: number | null,
  exclusions: readonly ExclusionRegion[] | null | undefined
): BlankingResult {
  if (!samples || !samples.length || windowStartCtxTime == null || windowEndCtxTime == null || !exclusions || !exclusions.length) {
    return { samples: samples as Float32Array, blankedMs: 0 };
  }
  const out = samples.slice(0);
  let blankedSamples = 0;
  for (const region of exclusions) {
    const overlapStart = Math.max(windowStartCtxTime, region.startCtxTime);
    const overlapEnd = Math.min(windowEndCtxTime, region.endCtxTime);
    if (overlapEnd <= overlapStart) continue;
    const startIdx = Math.max(0, Math.round((overlapStart - windowStartCtxTime) * sampleRate));
    const endIdx = Math.min(out.length, Math.round((overlapEnd - windowStartCtxTime) * sampleRate));
    for (let i = startIdx; i < endIdx; i++) out[i] = 0;
    blankedSamples += Math.max(0, endIdx - startIdx);
  }
  return { samples: out, blankedMs: (blankedSamples / sampleRate) * 1000 };
}
