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
 * Feature 2 (reset palette) — wave-to-cancel: the SAME per-tip average as
 * computeTipVelocity above, but the x-axis-only component. A deliberate
 * horizontal shake reads much higher on this axis alone than a normal
 * throw's mostly-vertical motion does, which is what makes a wave
 * distinguishable from a throw at all — @morra/core's resetPalette.ts
 * consumes this as ResetPaletteFrame.lateralVelocity.
 */
export function computeLateralTipVelocity(
  tips: readonly Landmark[],
  prevTips: readonly Landmark[] | null,
  prevTs: number | null,
  timestampMs: number
): number | null {
  if (!prevTips || prevTs == null) return null;
  const dt = Math.max(1, timestampMs - prevTs) / 1000;
  let totalDx = 0;
  for (let i = 0; i < tips.length; i++) totalDx += Math.abs(tips[i]!.x - prevTips[i]!.x);
  return totalDx / tips.length / dt;
}
