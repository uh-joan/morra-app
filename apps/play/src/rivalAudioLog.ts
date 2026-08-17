// rivalAudioLog.ts — the shared record of the rival's own scheduled audio,
// read by the analysis pipeline's two defenses against the app hearing
// itself (spike Phase C.3/C.4 + Phase E):
//   - rivalClipPlaybacks: every clip playback's real [start,end] ctx-time —
//     blanking zeroes any overlap with an extraction window (blanking
//     handles THIS throw's own in-flight reveal clip).
//   - lastRoundAudioEndCtxTime: the floor the NEXT throw's pre-window clamp
//     snapshots at onset (clamping handles the PREVIOUS round's audio; the
//     snapshot-at-onset is what keeps a throw from clamping against its own
//     reveal — invariant 4).
// Writers: rivalVoice.ts (clip playback) and game.ts (reveal moments) — M5.

export interface ClipPlayback {
  word: string;
  call: number;
  startCtxTime: number;
  endCtxTime: number;
}

export const rivalClipPlaybacks: ClipPlayback[] = [];
const RIVAL_CLIP_LOG_CAP = 500;

// The clip's [start,end] above are SCHEDULED audio-clock times. The mic hears
// the clip later — by the output latency, plus the clip's own decay and the
// room's — so a window clamped to end exactly at endCtxTime opens ON the
// clip's tail, still above the onset floor: a preWindow-pinned "voice" that
// is the rival's, not the player's. jani's 12-min L4 session (2026-08-17):
// 66 retractions + 9 thumb-1s came out voice-early this way — every one
// clampedToPrevRound with no real audio in the window (peak RMS 0.03–0.12).
// The guard is applied wherever the scheduled end is used as a boundary:
// the next-throw clamp floor (game.ts) and the blanking exclusions
// (analysis.ts). Output latency comes from the AudioContext when the
// browser exposes it; the decay margin is a fixed allowance for the clip's
// fade + room, to be tightened once a log carries the measured tail.
export const RIVAL_CLIP_DECAY_GUARD_MS = 200;
export function rivalClipTailGuardS(ctx: { outputLatency?: number; baseLatency?: number }): number {
  const out = typeof ctx.outputLatency === "number" ? ctx.outputLatency : typeof ctx.baseLatency === "number" ? ctx.baseLatency : 0;
  return out + RIVAL_CLIP_DECAY_GUARD_MS / 1000;
}
/** rivalClipPlaybacks with each end pushed out by the tail guard — what the
 * mic actually hears; the shape blanking consumes. */
export function rivalClipExclusions(ctx: { outputLatency?: number; baseLatency?: number }): { startCtxTime: number; endCtxTime: number }[] {
  const g = rivalClipTailGuardS(ctx);
  return rivalClipPlaybacks.map((p) => ({ startCtxTime: p.startCtxTime, endCtxTime: p.endCtxTime + g }));
}

let lastRoundAudioEnd: number | null = null;

export function lastRoundAudioEndCtxTime(): number | null {
  return lastRoundAudioEnd;
}

export function setLastRoundAudioEndCtxTime(ctxTime: number | null): void {
  lastRoundAudioEnd = ctxTime;
}

/** Records the playback window only — the CALLER sets the clamp floor
 * (spike semantics: revealRivalPhase1/resolveGameRound set it to the clip's
 * end, or ctx.currentTime when the clip failed to play). */
export function registerClipPlayback(p: ClipPlayback): void {
  rivalClipPlaybacks.push(p);
  if (rivalClipPlaybacks.length > RIVAL_CLIP_LOG_CAP) rivalClipPlaybacks.shift();
}
