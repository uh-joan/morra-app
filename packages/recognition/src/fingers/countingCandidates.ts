// countingCandidates.ts — CANDIDATE finger-count rules, for offline
// evaluation against a recorded landmark corpus (scripts/eval-counting.mjs).
// NOTHING here is wired into the app. countFingers (counting.ts) stays the
// shipped rule until a candidate beats it on data.
//
// Why candidates exist (2026-08-16 console probe, 74 onsets, one hand):
// the shipped tip-vs-PIP wrist-distance ratio read 3s and 4s correctly ~1
// time in 5, thrust or flat alike; the errors were systematic — 4→3, 3→2
// (a finger, likely ring/pinky, not clearing the 5% margin) and 4→5 (thumb
// counted). A distance ratio to the wrist is orientation- and
// foreshortening-sensitive; a finger's CURL ANGLE at its joints is not.

import { countFingers, countFingersSpike, dist, jointAngleDeg, THUMB_MCP_STRAIGHT_DEG, type Landmark } from "./counting.js";

export interface CountRule {
  id: string;
  describe: string;
  count(lm: readonly Landmark[]): number;
}

// ---------------------------------------------------------------- helpers

function sub(a: Landmark, b: Landmark): [number, number, number] {
  return [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
}
function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  // interior angle at b, in degrees, 3-D
  const [ux, uy, uz] = sub(a, b);
  const [vx, vy, vz] = sub(c, b);
  const dot = ux * vx + uy * vy + uz * vz;
  const nu = Math.hypot(ux, uy, uz), nv = Math.hypot(vx, vy, vz);
  if (nu === 0 || nv === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (nu * nv)))) * 180) / Math.PI;
}
function angleDeg2D(a: Landmark, b: Landmark, c: Landmark): number {
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const dot = ux * vx + uy * vy;
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
  if (nu === 0 || nv === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (nu * nv)))) * 180) / Math.PI;
}

// MediaPipe indices: [MCP, PIP, DIP, TIP] per finger
const FINGERS: readonly [number, number, number, number][] = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

/** The shipped thumb rule — angle at the thumb MCP (counting.ts) — for
 * candidates that only vary the finger rule. */
function shippedThumb(lm: readonly Landmark[]): boolean {
  return jointAngleDeg(lm[1]!, lm[2]!, lm[3]!) > THUMB_MCP_STRAIGHT_DEG;
}

/** Thumb by its own curl: angle at the IP joint (MCP=2, IP=3, TIP=4) plus
 * the CMC/MCP opening away from the index MCP — a tucked thumb folds at the
 * IP AND collapses toward the palm; an extended thumb is straight AND
 * abducted. Both thresholds are candidates, not truths. */
function thumbByAngle(lm: readonly Landmark[], straightDeg: number, abductDeg: number): boolean {
  const ipAngle = angleDeg(lm[2]!, lm[3]!, lm[4]!);
  const abduction = angleDeg(lm[4]!, lm[1]!, lm[5]!); // tip – CMC – index MCP
  return ipAngle > straightDeg && abduction > abductDeg;
}

// ------------------------------------------------------------- candidates

/** The shipped rule, for the baseline row — literally countFingers. */
export const RULE_SHIPPED: CountRule = {
  id: "shipped",
  describe: "countFingers as shipped: tip-vs-PIP wrist-distance ratio ×1.05 + thumb by MCP angle > 160°",
  count: (lm) => countFingers(lm),
};

/** The spike's rule verbatim (lateral thumb) — the pre-2026-08-16 baseline. */
export const RULE_SPIKE_VERBATIM: CountRule = {
  id: "spike",
  describe: "spike verbatim: ratio ×1.05, thumb lateral ×1.05 vs pinky MCP",
  count: (lm) => countFingersSpike(lm),
};

/** Margin sweep on the shipped ratio — is 1.05 simply too strict for a
 * ring/pinky that can't fully straighten? */
export function ruleRatio(margin: number): CountRule {
  return {
    id: `ratio×${margin}`,
    describe: `shipped structure, finger margin ${margin}`,
    count(lm) {
      const wrist = lm[0]!;
      let count = 0;
      for (const [, pip, , tip] of FINGERS) if (dist(lm[tip]!, wrist) > dist(lm[pip]!, wrist) * margin) count++;
      if (shippedThumb(lm)) count++;
      return count;
    },
  };
}

/** Curl angle at the PIP: a straight finger is ~180°, a folded one <~120°.
 * Orientation-invariant (an angle is an angle however the hand faces);
 * 3-D or 2-D variants because MediaPipe's z is estimated. Thumb by its own
 * angle rules. */
export function ruleCurl(pipDeg: number, opts: { twoD?: boolean; thumbStraightDeg?: number; thumbAbductDeg?: number } = {}): CountRule {
  const ang = opts.twoD ? angleDeg2D : angleDeg;
  const ts = opts.thumbStraightDeg ?? 150, ta = opts.thumbAbductDeg ?? 30;
  return {
    id: `curl${opts.twoD ? "2D" : "3D"}>${pipDeg}°`,
    describe: `finger extended iff PIP angle > ${pipDeg}° (${opts.twoD ? "2-D" : "3-D"}); thumb iff IP > ${ts}° and abduction > ${ta}°`,
    count(lm) {
      let count = 0;
      for (const [mcp, pip, dip] of FINGERS) if (ang(lm[mcp]!, lm[pip]!, lm[dip]!) > pipDeg) count++;
      if (thumbByAngle(lm, ts, ta)) count++;
      return count;
    },
  };
}

/** Curl at BOTH PIP and DIP — a half-curled finger often keeps a straight
 * PIP but bends the DIP (or vice-versa); requiring both to be open is the
 * stricter reading. */
export function ruleCurlBoth(pipDeg: number, dipDeg: number, opts: { twoD?: boolean } = {}): CountRule {
  const ang = opts.twoD ? angleDeg2D : angleDeg;
  return {
    id: `curl${opts.twoD ? "2D" : "3D"}>${pipDeg}°&${dipDeg}°`,
    describe: `finger extended iff PIP > ${pipDeg}° AND DIP > ${dipDeg}° (${opts.twoD ? "2-D" : "3-D"}); thumb by angle`,
    count(lm) {
      let count = 0;
      for (const [mcp, pip, dip, tip] of FINGERS)
        if (ang(lm[mcp]!, lm[pip]!, lm[dip]!) > pipDeg && ang(lm[pip]!, lm[dip]!, lm[tip]!) > dipDeg) count++;
      if (thumbByAngle(lm, 150, 30)) count++;
      return count;
    },
  };
}

/** Curl for the four fingers, the SHIPPED thumb rules unchanged — isolates
 * the finger-rule question (4→3, 3→2 in the probe) from the thumb question.
 * On the synthetic "tucked thumb toward the lens" hand, thumbByAngle counts
 * the thumb on every frame and shifts everything by +1; the shipped thumb
 * rules do not. Most likely winner if the probe's diagnosis is right. */
export function ruleCurlShippedThumb(pipDeg: number, opts: { twoD?: boolean; dipDeg?: number } = {}): CountRule {
  const ang = opts.twoD ? angleDeg2D : angleDeg;
  const both = opts.dipDeg != null;
  return {
    id: `curl${opts.twoD ? "2D" : "3D"}>${pipDeg}°${both ? `&${opts.dipDeg}°` : ""}+thumb0`,
    describe: `finger extended iff PIP > ${pipDeg}°${both ? ` AND DIP > ${opts.dipDeg}°` : ""} (${opts.twoD ? "2-D" : "3-D"}); thumb = shipped rules`,
    count(lm) {
      let count = 0;
      for (const [mcp, pip, dip, tip] of FINGERS) {
        const open = ang(lm[mcp]!, lm[pip]!, lm[dip]!) > pipDeg && (!both || ang(lm[pip]!, lm[dip]!, lm[tip]!) > (opts.dipDeg as number));
        if (open) count++;
      }
      if (shippedThumb(lm)) count++;
      return count;
    },
  };
}

/** Thumb by the angle at its MCP joint (CMC=1, MCP=2, IP=3): a thumb folded
 * across the palm bends at the MCP (2026-08-16 corpus, truth 4: p50 140°,
 * p90 156°); an extended thumb is straight there (truths 1/2/3/5: p10
 * ≥170°). The spike's lateral ratio OVERLAPS between those two states
 * (folded 1.05–1.23 vs extended 1.13–1.23) — which is the whole 4→5
 * failure. Fingers = shipped ratio rule. Threshold is a candidate. */
export function ruleThumbMcpAngle(mcpDeg: number, opts: { wristRatio?: number } = {}): CountRule {
  return {
    id: `thumbMcp>${mcpDeg}°${opts.wristRatio ? `&wr>${opts.wristRatio}` : ""}`,
    describe: `fingers = shipped ratio; thumb extended iff angle at thumb MCP > ${mcpDeg}°${opts.wristRatio ? ` AND tip/IP wrist ratio > ${opts.wristRatio}` : ""}`,
    count(lm) {
      const wrist = lm[0]!;
      let count = 0;
      for (const [, pip, , tip] of FINGERS) if (dist(lm[tip]!, wrist) > dist(lm[pip]!, wrist) * 1.05) count++;
      const straight = angleDeg(lm[1]!, lm[2]!, lm[3]!) > mcpDeg;
      const wr = opts.wristRatio ? dist(lm[4]!, wrist) > dist(lm[3]!, wrist) * opts.wristRatio : true;
      if (straight && wr) count++;
      return count;
    },
  };
}

/** Everything the evaluator sweeps by default. */
export const DEFAULT_CANDIDATES: readonly CountRule[] = [
  RULE_SHIPPED,
  RULE_SPIKE_VERBATIM,
  ruleRatio(1.0),
  ruleRatio(1.02),
  ruleRatio(1.1),
  ruleCurl(120),
  ruleCurl(135),
  ruleCurl(150),
  ruleCurl(135, { twoD: true }),
  ruleCurl(150, { twoD: true }),
  ruleCurlBoth(135, 135),
  ruleCurlBoth(150, 140),
  ruleCurlShippedThumb(120),
  ruleCurlShippedThumb(135),
  ruleCurlShippedThumb(150),
  ruleCurlShippedThumb(135, { twoD: true }),
  ruleCurlShippedThumb(150, { twoD: true }),
  ruleCurlShippedThumb(140, { dipDeg: 140 }),
  ruleThumbMcpAngle(155),
  ruleThumbMcpAngle(160),
  ruleThumbMcpAngle(165),
  ruleThumbMcpAngle(160, { wristRatio: 1.14 }),
];
