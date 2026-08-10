// tipVelocity.ts — the per-frame fingertip velocity arithmetic, extracted
// as a pure, independently testable function. Both spikes/s01-fingers.html's
// worker AND spikes/s03-beat.html computed this same formula (average
// per-tip displacement per second across the 5 fingertip landmarks) to
// feed processHandVelocity/stepVelocityStateMachine (velocity.ts) — M2's
// workerSource.ts already computed it internally for its own "settled"
// overlay-color flag but discarded the raw number; M5 wires this same
// formula through to mediapipeFingerRecognizer.ts's main-thread fallback
// path (a real import here) and workerSource.ts's Blob string (inlined
// there verbatim, unchanged — Blob workers can't import modules, same
// constraint documented on that file).

import { dist, type Landmark } from "./counting.js";

const TIP_INDICES = [4, 8, 12, 16, 20] as const;

export function fingertipsOf(lm: readonly Landmark[]): Landmark[] {
  return TIP_INDICES.map((i) => lm[i]!);
}

/**
 * Average per-tip displacement per second across the 5 fingertips, between
 * two consecutive frames. Returns null when there's no previous frame to
 * compare against (first frame a hand appears, or a hand-detection gap).
 */
export function computeTipVelocity(
  tips: readonly Landmark[],
  prevTips: readonly Landmark[] | null,
  prevTs: number | null,
  timestampMs: number
): number | null {
  if (!prevTips || prevTs == null) return null;
  const dt = Math.max(1, timestampMs - prevTs) / 1000;
  let totalDisp = 0;
  for (let i = 0; i < tips.length; i++) totalDisp += dist(tips[i]!, prevTips[i]!);
  return totalDisp / tips.length / dt;
}

/**
 * Feature 2 (reset palette) — wave-to-cancel's SIGNED lateral velocity.
 *
 * HARDENING (real-session bug — see resetPalette.ts's header comment): an
 * earlier version averaged the ABSOLUTE x-displacement across all 5
 * fingertips, which fired on ANY fast lateral motion — including a normal
 * throw's own swing. Two changes fix that:
 *   1. SIGNED, not magnitude — the caller (resetPalette.ts) needs
 *      DIRECTION to detect a shake's repeated reversals; a throw's swing
 *      moves mostly one way and never reverses direction 2+ times.
 *   2. A SINGLE representative point (the wrist, x only) instead of
 *      averaging across fingertips — fingers spreading apart during a
 *      throw partially cancel out in a signed average (some tips move +x,
 *      some -x), while a genuine shake moves the WHOLE HAND (and thus the
 *      wrist) the same direction each frame. The wrist is also what
 *      counting.ts's handCenterYOf already uses for the below-zone
 *      gesture's Y position — same landmark, same rationale (most stable
 *      relative to the rest of the hand as fingers move).
 */
export function computeSignedLateralVelocity(x: number, prevX: number | null, prevTs: number | null, timestampMs: number): number | null {
  if (prevX == null || prevTs == null) return null;
  const dt = Math.max(1, timestampMs - prevTs) / 1000;
  return (x - prevX) / dt;
}
