// windowClamp.ts — generalized from spikes/s03-beat.html's Phase C.4
// clampSyncWindowStart: never let a recognition window reach backward into
// audio the caller already knows is NOT the player's own throw (originally
// "the previous round's reveal / rival clip tail" specifically — generalized
// here to "the last known non-player-audio boundary ctx-time", an injected
// value rather than a hardcoded game concept). Pure.

export interface WindowClampResult {
  clampedStartCtxTime: number;
  clampedPreMs: number;
  clampedToPrevRound: boolean;
}

export function clampWindowStart(
  anchorCtxTime: number,
  preMs: number,
  lastKnownAudioEndCtxTime: number | null
): WindowClampResult {
  const naiveStartCtxTime = anchorCtxTime - preMs / 1000;
  if (lastKnownAudioEndCtxTime == null || lastKnownAudioEndCtxTime <= naiveStartCtxTime) {
    return { clampedStartCtxTime: naiveStartCtxTime, clampedPreMs: preMs, clampedToPrevRound: false };
  }
  const clampedStartCtxTime = Math.min(lastKnownAudioEndCtxTime, anchorCtxTime);
  const clampedPreMs = Math.max(0, (anchorCtxTime - clampedStartCtxTime) * 1000);
  return { clampedStartCtxTime, clampedPreMs, clampedToPrevRound: true };
}
