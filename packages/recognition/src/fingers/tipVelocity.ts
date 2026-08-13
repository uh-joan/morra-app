// tipVelocity.ts — per-frame fingertip velocity arithmetic, extracted as
// pure, independently testable functions. TWO distinct quantities live here,
// and they are NOT interchangeable:
//
// - computeTipVelocity — MEAN PER-TIP displacement per second (each tip's
//   own displacement magnitude, averaged). This is the s01-fingers.html
//   worker lineage formula (M2's workerSource.ts computed it internally for
//   its "settled" overlay flag; M5 wired it through the worker path).
//   NOTE: an earlier version of this header claimed s03-beat.html computed
//   this same formula — it does NOT (verified against spike L1999–2008).
//
// - computeCentroidVelocity — CENTROID displacement per second: the 5 tips
//   are averaged into one (cx, cy) point first, and the velocity is that
//   single point's displacement over dt. This is s03-beat.html's formula
//   (L1999–2008), the one the velocity state machine's thresholds
//   (HIGH_V = 0.9, LOW_V = 0.25 — velocity.ts DEFAULT_VELOCITY_CONFIG)
//   were tuned against. By the triangle inequality mean-per-tip >= centroid
//   always — opposing/rotational finger motion (fingers spreading during a
//   throw) cancels in the centroid form but adds in the per-tip form — so
//   feeding mean-per-tip velocity into thresholds tuned on the centroid
//   form fires spuriously early/often. Anything consuming
//   stepVelocityStateMachine with the default config must use the centroid
//   form.

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

export interface Centroid {
  x: number;
  y: number;
}

export interface CentroidVelocityResult {
  /** Null when there's no previous centroid to compare against (first frame
   * a hand appears — callers must reset their prev state on hand loss, as
   * the spike does), or when dt <= 0 (the spike's `if (dt > 0)` skip — no
   * clamping, unlike computeTipVelocity's 1ms floor). */
  v: number | null;
  /** This frame's centroid — feed it back as prevCentroid next frame. */
  centroid: Centroid;
}

/**
 * s03-beat.html's hand velocity (spike L1999–2008), verbatim: average the 5
 * fingertip positions into a single centroid (2D — x/y only, no z, exactly
 * like the spike), then measure THAT point's displacement per second.
 */
export function computeCentroidVelocity(
  tips: readonly Landmark[],
  prevCentroid: Centroid | null,
  prevTs: number | null,
  timestampMs: number
): CentroidVelocityResult {
  let cx = 0;
  let cy = 0;
  for (const p of tips) {
    cx += p.x;
    cy += p.y;
  }
  cx /= tips.length;
  cy /= tips.length;
  const centroid: Centroid = { x: cx, y: cy };
  if (!prevCentroid || prevTs == null) return { v: null, centroid };
  const dt = (timestampMs - prevTs) / 1000;
  if (dt <= 0) return { v: null, centroid };
  const moveDist = Math.hypot(cx - prevCentroid.x, cy - prevCentroid.y);
  return { v: moveDist / dt, centroid };
}
