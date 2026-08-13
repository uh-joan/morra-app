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
