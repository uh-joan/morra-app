// preOnset.ts — the resting finger count just BEFORE a motion started: the
// input to core's shouldRevealPhase1From (the throw-of-one reveal rule,
// 2026-08-16). A throw of one starts from a resting fist (reads 0 or 1); a
// retraction starts from the held >=2 pose — so this single number is what
// tells them apart at settle time. Pure over the camera's frame history so
// it's unit-testable in node; camera.ts registers it with the velocity FSM.

/** How far back before motion start we read the resting hand. Long enough
 * to hold several frames at 30fps, short enough not to reach the PREVIOUS
 * throw's settle (median throw→retraction gap in the field logs: 0.87 s). */
export const PRE_ONSET_WINDOW_MS = 200;

/** The count the hand was RESTING at just before this motion began — the
 * throw-of-one reveal gate's input (core shouldRevealPhase1From). Median of
 * the detected-hand frames in the PRE_ONSET_WINDOW_MS before motionStart;
 * null when there are fewer than 2 such frames (hand entered mid-motion,
 * or a headless harness with a fake camera) — the caller then keeps the
 * spike's >=2 answer. Pure over the history array so it's unit-testable. */
export function preOnsetFingerCount(
  history: readonly { t: number; count: number }[],
  motionStartPerfTime: number | null,
  windowMs: number = PRE_ONSET_WINDOW_MS
): number | null {
  if (motionStartPerfTime == null) return null;
  const from = motionStartPerfTime - windowMs;
  const counts: number[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const f = history[i]!;
    if (f.t >= motionStartPerfTime) continue;
    if (f.t < from) break;
    counts.push(f.count);
  }
  if (counts.length < 2) return null;
  counts.sort((a, b) => a - b);
  return counts[Math.floor((counts.length - 1) / 2)]!;
}
