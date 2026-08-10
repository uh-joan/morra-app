// counting.ts — ported verbatim from spikes/s01-fingers.html /
// spikes/s03-beat.html's identical countFingers (s03's own comment confirms
// it's a verbatim port of s01's, itself verified against a real hand-count
// test matrix — see spikes/s01-fingers.html's finger-counting section).
// Pure: raw landmark math only, no MediaPipe/DOM types required beyond the
// three coordinates every landmark format provides.

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

// MediaPipe HandLandmarker's 21-point connection topology — used for
// overlay rendering in the spike; kept here since counting.ts is the
// natural home for "things that index into the 21-point landmark array".
export const HAND_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

// Raw per-frame finger count: tip-vs-wrist distance compared against the
// PIP joint's own wrist distance (a 5% margin), for the four non-thumb
// fingers; the thumb is special-cased against the pinky MCP since its tip-
// to-wrist distance doesn't cleanly separate extended/folded the same way.
export function countFingers(lm: readonly Landmark[]): number {
  const wrist = lm[0]!;
  const fingers: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  let count = 0;
  for (const [tip, pip] of fingers) {
    if (dist(lm[tip]!, wrist) > dist(lm[pip]!, wrist) * 1.05) count++;
  }
  const thumbTip = lm[4]!, thumbIp = lm[3]!, pinkyMcp = lm[17]!;
  if (dist(thumbTip, pinkyMcp) > dist(thumbIp, pinkyMcp) * 1.05) count++;
  return count;
}

/**
 * Feature 2 (reset palette) — below-zone: a single representative Y
 * position (normalized 0=top..1=bottom, MediaPipe's own image-space
 * convention) for "where is the hand", compared against a configurable
 * line near the bottom of frame. The wrist (landmark 0) is the most stable
 * choice — unlike a fingertip or the palm centroid, it doesn't move much
 * relative to the rest of the hand as fingers open/close mid-throw.
 */
export function handCenterYOf(lm: readonly Landmark[]): number {
  return lm[0]!.y;
}
