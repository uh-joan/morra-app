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

/** Interior angle at b (degrees, 3-D). Degenerate (coincident points) → 180
 * so a missing joint reads "straight" rather than throwing. */
export function jointAngleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ux = a.x - b.x, uy = a.y - b.y, uz = (a.z || 0) - (b.z || 0);
  const vx = c.x - b.x, vy = c.y - b.y, vz = (c.z || 0) - (b.z || 0);
  const nu = Math.hypot(ux, uy, uz), nv = Math.hypot(vx, vy, vz);
  if (nu === 0 || nv === 0) return 180;
  const cos = (ux * vx + uy * vy + uz * vz) / (nu * nv);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** The thumb reads extended iff it is STRAIGHT at its MCP joint (CMC=1,
 * MCP=2, IP=3). Recorded corpus 2026-08-16 (one hand, 1,025 held open
 * frames): a thumb folded across the palm bends there — truth 4: p50 140°,
 * p90 156° — while an extended thumb is straight, p10 ≥ 170° on truths
 * 1/2/3/5. 160° sits in the gap. */
export const THUMB_MCP_STRAIGHT_DEG = 160;

const FINGER_TIP_PIP: readonly [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];

function countExtendedFingers(lm: readonly Landmark[]): number {
  const wrist = lm[0]!;
  let count = 0;
  for (const [tip, pip] of FINGER_TIP_PIP) {
    if (dist(lm[tip]!, wrist) > dist(lm[pip]!, wrist) * 1.05) count++;
  }
  return count;
}

// Raw per-frame finger count. Four fingers: the spike's tip-vs-wrist
// distance compared against the PIP joint's own wrist distance (a 5%
// margin) — unchanged. Thumb: DELIBERATE DIVERGENCE from the spike
// (2026-08-16, decided on data — docs/finger-counting-accuracy.md). The
// spike judged the thumb by lateral separation from the pinky MCP; on a
// recorded corpus that ratio OVERLAPS between "folded across the palm"
// (1.05–1.23) and "extended" (1.13–1.23), which read a 4 as 5 on 36% of
// held frames — the worst number in the game. The angle at the thumb's MCP
// separates the two states cleanly (see THUMB_MCP_STRAIGHT_DEG); with it
// the corpus reads 99/99/96/99/97% on truths 1–5 vs 100/99/96/63/97% before.
// It also reads the thumbs-up "1" (a straight thumb on a fist) directly, so
// the r2 wrist-ratio rule is gone. countFingersSpike below keeps the
// verbatim spike rule for the evaluator baseline and the ?count=spike
// field fallback.
export function countFingers(lm: readonly Landmark[]): number {
  let count = countExtendedFingers(lm);
  if (jointAngleDeg(lm[1]!, lm[2]!, lm[3]!) > THUMB_MCP_STRAIGHT_DEG) count++;
  return count;
}

/** The spike's countFingers, verbatim (spikes/s01-fingers.html /
 * s03-beat.html): four fingers by wrist-distance ratio, thumb by lateral
 * separation from the pinky MCP. Kept for the evaluator baseline, the
 * conformance story, and the ?count=spike fallback. */
export function countFingersSpike(lm: readonly Landmark[]): number {
  let count = countExtendedFingers(lm);
  const thumbTip = lm[4]!, thumbIp = lm[3]!, pinkyMcp = lm[17]!;
  if (dist(thumbTip, pinkyMcp) > dist(thumbIp, pinkyMcp) * 1.05) count++;
  return count;
}
