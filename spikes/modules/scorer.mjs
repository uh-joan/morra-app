// scorer.mjs — hand/voice co-occurrence pairing and throw-outcome
// classification for sync mode. Pure, DOM-free (the historical home of
// these functions was s03-beat.html's "Pure logic" section, steps 9-13,
// Phase C.1, Phase E.1 — this module is a straight extraction, no behavior
// change).

// step 9 (sync mode, no beat): classify a hand-anchored throw once the
// buffer-derived voice onset (or lack of one) is known. handOnsetPerfTime is
// the event's anchor; voiceOnsetPerfTime is null if no voice was found
// anywhere in the extraction window around it.
export function classifySyncThrow(handOnsetPerfTime, voiceOnsetPerfTime, coOccurrenceMs) {
  if (voiceOnsetPerfTime == null) return { outcome: "hand-only", syncDeltaMs: null, synced: false };
  const syncDeltaMs = voiceOnsetPerfTime - handOnsetPerfTime;
  const synced = Math.abs(syncDeltaMs) <= coOccurrenceMs;
  return { outcome: synced ? "synced" : (syncDeltaMs > 0 ? "voice-late" : "voice-early"), syncDeltaMs, synced };
}

// step 9: a voice onset detected by the live streaming VAD (used ONLY to spot
// "shouted but never threw" events, since a genuine throw's timing comes from
// the hand-anchored buffer analysis above, not this). It's "explained" — and
// shouldn't spawn its own incomplete-throw entry — if ANY hand onset (pending
// or resolved) landed within partnerWindowMs of it.
export function isOrphanVoiceOnset(voicePerfTime, handOnsetPerfTimes, partnerWindowMs) {
  return !handOnsetPerfTimes.some((h) => Math.abs(voicePerfTime - h) <= partnerWindowMs);
}

// Phase C.1: voice disambiguates the fist. Real morra throws land on 0-5
// fingers, but a settle at count <=1 with NO voice inside the co-occurrence
// window is far more often the fist RETRACTING after the previous throw
// (the exact same velocity-settle detector fires on that motion) than a
// genuine silent throw of 0/1 — so it's classified as a reset, never a
// throw, and never reaches the game. The SAME low count WITH a voice onset
// is a real throw, always read as 1 (a momentarily-misread fist-vs-one-
// finger frame is far likelier than an actual silent-then-shouted throw of
// zero). Counts >=2 are never reinterpreted either way.
export function classifyHandSettleForSync(fingerCount, voiceOnsetPerfTime) {
  const isLowCount = fingerCount != null && fingerCount <= 1;
  if (isLowCount && voiceOnsetPerfTime == null) {
    return { isReset: true, effectiveFingerCount: fingerCount };
  }
  const effectiveFingerCount = isLowCount && voiceOnsetPerfTime != null ? 1 : fingerCount;
  return { isReset: false, effectiveFingerCount };
}

// Phase E.1: gate for the early ("phase-1") rival reveal. Only a settle at
// fingerCount >=2 is confident enough — synchronously, before voice is even
// known — to be a real throw rather than fist-retraction noise; counts <=1
// wait for the Phase C.1 voice disambiguation above and are only ever
// revealed later (at normal resolution), never early.
export function shouldRevealPhase1(fingerCount) {
  return fingerCount != null && fingerCount >= 2;
}
