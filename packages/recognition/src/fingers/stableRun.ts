// stableRun.ts — ported verbatim from spikes/s03-beat.html's
// findStableCountRun (step 7's "held-over vs fresh throw" fallback). A
// stable run with a preceding TRANSITION (the count right before it
// differs) is a genuine settled throw; a stable run with NO preceding
// transition is a hand the player just left held up between throws (real
// morra ritual is fist-between-beats, snap out on cue) — reporting its
// position as an onset was observed silently pinning offsets to whatever
// moment a matching window happened to open. Distinguishing the two is the
// "held-over/reset semantics" this module exists to provide.

export interface CountFrame {
  t: number;
  count: number;
}

export type StableRunResult =
  | { t: number; heldOver: false }
  | { heldOver: true }
  | null;

/**
 * Scans `frames` (oldest first) for the EARLIEST run of `minRun` consecutive
 * frames sharing the same count.
 * - Returns `{ t, heldOver: false }` for the first such run that was
 *   PRECEDED by a genuine transition (a different count right before it).
 * - If a stable run exists but none of them had a preceding transition
 *   (the hand was already at that count when the scan window opened),
 *   returns `{ heldOver: true }` — never that run's own timestamp, since
 *   reporting it would misattribute a held pose as a fresh throw.
 * - Returns `null` if no stable run of `minRun` frames exists at all.
 */
export function findStableCountRun(frames: readonly CountFrame[], minRun: number): StableRunResult {
  let sawHeldOver = false;
  for (let i = 0; i + minRun - 1 < frames.length; i++) {
    let stable = true;
    for (let j = 1; j < minRun; j++) {
      if (frames[i + j]!.count !== frames[i]!.count) { stable = false; break; }
    }
    if (!stable) continue;
    const hasTransition = i > 0 && frames[i - 1]!.count !== frames[i]!.count;
    if (hasTransition) return { t: frames[i]!.t, heldOver: false };
    sawHeldOver = true; // keep scanning — a later, transition-preceded run may still exist
  }
  return sawHeldOver ? { heldOver: true } : null;
}
