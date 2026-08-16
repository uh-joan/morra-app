// scorer.ts — ported verbatim from spikes/modules/scorer.mjs. Hand/voice
// co-occurrence pairing and throw-outcome classification for sync mode.
// Pure — every timestamp is a plain number supplied by the caller (no Clock
// dependency; see src/ports/clock.ts's own comment on why).

export interface SyncClassification {
  outcome: "synced" | "voice-late" | "voice-early" | "hand-only";
  syncDeltaMs: number | null;
  synced: boolean;
}

// step 9 (spike, sync mode, no beat): classify a hand-anchored throw once
// the buffer-derived voice onset (or lack of one) is known. handOnsetPerfTime
// is the event's anchor; voiceOnsetPerfTime is null if no voice was found
// anywhere in the extraction window around it.
export function classifySyncThrow(
  handOnsetPerfTime: number,
  voiceOnsetPerfTime: number | null,
  coOccurrenceMs: number
): SyncClassification {
  if (voiceOnsetPerfTime == null) return { outcome: "hand-only", syncDeltaMs: null, synced: false };
  const syncDeltaMs = voiceOnsetPerfTime - handOnsetPerfTime;
  const synced = Math.abs(syncDeltaMs) <= coOccurrenceMs;
  return { outcome: synced ? "synced" : syncDeltaMs > 0 ? "voice-late" : "voice-early", syncDeltaMs, synced };
}

// step 9: a voice onset detected by the live streaming VAD (used ONLY to
// spot "shouted but never threw" events, since a genuine throw's timing
// comes from the hand-anchored buffer analysis above, not this). It's
// "explained" — and shouldn't spawn its own incomplete-throw entry — if ANY
// hand onset (pending or resolved) landed within partnerWindowMs of it.
export function isOrphanVoiceOnset(
  voicePerfTime: number,
  handOnsetPerfTimes: readonly number[],
  partnerWindowMs: number
): boolean {
  return !handOnsetPerfTimes.some((h) => Math.abs(voicePerfTime - h) <= partnerWindowMs);
}

export interface HandSettleClassification {
  isReset: boolean;
  effectiveFingerCount: number | null;
}

// Phase C.1 (spike): voice disambiguates the fist. Real morra throws land on
// 0-5 fingers, but a settle at count <=1 with NO voice inside the
// co-occurrence window is far more often the fist RETRACTING after the
// previous throw than a genuine silent throw of 0/1 — so it's classified as
// a reset, never a throw. The SAME low count WITH a voice onset is a real
// throw, always read as 1. Counts >=2 are never reinterpreted either way.
export function classifyHandSettleForSync(
  fingerCount: number | null,
  voiceOnsetPerfTime: number | null
): HandSettleClassification {
  const isLowCount = fingerCount != null && fingerCount <= 1;
  if (isLowCount && voiceOnsetPerfTime == null) {
    return { isReset: true, effectiveFingerCount: fingerCount };
  }
  const effectiveFingerCount = isLowCount && voiceOnsetPerfTime != null ? 1 : fingerCount;
  return { isReset: false, effectiveFingerCount };
}

// Phase E.1 (spike): gate for the early ("phase-1") rival reveal. Only a
// settle at fingerCount >=2 is confident enough — synchronously, before
// voice is even known — to be a real throw rather than fist-retraction
// noise; counts <=1 wait for the Phase C.1 voice disambiguation above.
export function shouldRevealPhase1(fingerCount: number | null): boolean {
  return fingerCount != null && fingerCount >= 2;
}

// DELIBERATE DIVERGENCE from the spike (2026-08-16, decided by Janis after
// the field playtest): a throw of ONE must reveal at phase 1 like any other
// throw. The spike's >=2 gate exists because, at settle time, "1" and "a
// fist" are the same number — the field logs make that concrete: fc=1 is
// the single most common settle (41% of 3,622 throws) and 53% of those are
// resets, 73% of which are the hand retracting from a >=2 throw within a
// median 0.87 s. Revealing on every fc=1 would burn the commitment on more
// than half of them.
//
// What tells the two apart is where the hand CAME FROM: a throw of one
// starts from a resting fist (which itself reads 0 or 1), a retraction
// starts from the held >=2 pose. So fc=1 reveals iff the pre-onset count is
// known and <=1. Unknown pre-onset (no hand frames before motion start —
// hand entered the frame mid-motion; also every headless harness with a
// fake camera) keeps the spike's answer, so parity stays meaningful and the
// degraded case is exactly today's behavior: no early reveal, the round
// still resolves through voice.
//
// shouldRevealPhase1 above stays byte-identical to the spike — the
// conformance corpus pins it, and this function is the ONLY caller that
// widens it.
export function shouldRevealPhase1From(fingerCount: number | null, preOnsetFingerCount: number | null): boolean {
  if (shouldRevealPhase1(fingerCount)) return true;
  return fingerCount === 1 && preOnsetFingerCount != null && preOnsetFingerCount <= 1;
}
