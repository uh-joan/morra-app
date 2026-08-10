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

// Micatio has no zero: a settle at a raw hand count of 0 (a closed fist) is
// a LEGAL throw of ONE finger, never "no throw" — this is where a raw
// recognized hand count becomes an actual throw's finger value (core's
// rules.ts stays generic/preset-parameterized; this clamp is the
// Micatio-specific "no zero" rule, so it lives here in the sync scorer, not
// there). Counts 1-5 pass through unchanged.
export function clampFingerCountToThrow(fingerCount: number): number {
  return fingerCount === 0 ? 1 : fingerCount;
}

// BUG this fixed (found via a live session: 186 silent deletions of
// throws-of-1 in one sitting): the fist used to double as BOTH a legal
// throw of 1 AND the reset gesture, disambiguated by whether a voice onset
// landed alongside it — a settle at count <=1 with no voice was silently
// discarded as a reset, deleting the player's real throw with no trace.
// Voice no longer disambiguates a reset here: every settle this function
// sees IS a real throw (0 clamped to 1 above; 1-5 unchanged) — a settle
// with no voice caught now flows through classifySyncThrow exactly like
// counts 2-5 always did, producing a visible "hand-only" outcome instead of
// vanishing. Resets are now an entirely separate concern, decided BEFORE a
// throw ever reaches this function — see resetPalette.ts's stepResetPalette
// (out-of-frame / below-zone / wave / stillness), which never even calls
// this for a genuine reset gesture. voiceOnsetPerfTime is intentionally
// unused now (kept as a documented no-op param, not removed, so call sites
// mapping "the audio window's voice onset" onto "the hand settle it
// belongs to" don't need reshaping for what is now a one-line clamp).
export function classifyHandSettleForSync(fingerCount: number | null, voiceOnsetPerfTime: number | null): number | null {
  void voiceOnsetPerfTime;
  return fingerCount == null ? null : clampFingerCountToThrow(fingerCount);
}

// Phase E.1 (spike): gate for the early ("phase-1") rival reveal. Only a
// settle at fingerCount >=2 is confident enough — synchronously, before
// voice is even known — to be a real throw rather than fist-retraction
// noise; counts <=1 wait for the Phase C.1 voice disambiguation above.
export function shouldRevealPhase1(fingerCount: number | null): boolean {
  return fingerCount != null && fingerCount >= 2;
}
