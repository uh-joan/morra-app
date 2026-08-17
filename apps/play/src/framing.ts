// framing.ts — the hand-framing guide ("ghost hand"). MediaPipe's landmark
// quality — and with it the finger count — depends on how big, centered and
// unclipped the hand sits in the frame. The 2026-08-16 corpus, held frames,
// same counting rule: hand < 30% of the frame → 71% correct, 30–40% → 82%,
// ≥ 40% → 99–100%; hand center within 10% of frame center → 100%, 20–30%
// off → 84%. So a target silhouette + one word of coaching is a real
// accuracy lever, not decoration.
//
// Pure geometry here (node-testable); the drawing helper takes a 2-D
// context and draws in LANDMARK space (0..1) — the overlay canvas is
// CSS-mirrored together with the video, so no mirroring math is needed.

import type { Landmark } from "@morra/recognition";

export interface FramingTarget {
  /** minimum hand bbox size (max of width/height) as a fraction of the frame */
  minSize: number;
  /** maximum — bigger than this the fingers start leaving the frame */
  maxSize: number;
  /** max distance of the hand's bbox center from the frame center (fraction) */
  maxOffCenter: number;
  /** min margin from any frame edge (fraction); below → "clipped" */
  minEdge: number;
}

/** Starting values from the corpus buckets above; to be re-fit on the next
 * recording (the ?rec=1 recorder captures framing per frame). */
export const DEFAULT_FRAMING_TARGET: FramingTarget = { minSize: 0.42, maxSize: 0.85, maxOffCenter: 0.15, minEdge: 0.02 };

export type FramingHint = "none" | "closer" | "farther" | "center" | "clipped" | "no-hand";

export interface FramingState {
  size: number | null;
  offCenter: number | null;
  edge: number | null;
  inZone: boolean;
  hint: FramingHint;
}

export const NO_HAND: FramingState = { size: null, offCenter: null, edge: null, inZone: false, hint: "no-hand" };

export function computeFraming(lm: readonly Landmark[] | null, target: FramingTarget = DEFAULT_FRAMING_TARGET): FramingState {
  if (!lm || lm.length === 0) return NO_HAND;
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const size = Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const offCenter = Math.hypot(cx - 0.5, cy - 0.5);
  const edge = Math.min(minX, minY, 1 - maxX, 1 - maxY);
  // Priority: clipped beats everything (the count is unreliable with points
  // off-frame), then distance, then centering.
  let hint: FramingHint = "none";
  if (edge < target.minEdge) hint = "clipped";
  else if (size < target.minSize) hint = "closer";
  else if (size > target.maxSize) hint = "farther";
  else if (offCenter > target.maxOffCenter) hint = "center";
  return { size, offCenter, edge, inZone: hint === "none", hint };
}

export const FRAMING_COPY: Record<FramingHint, string> = {
  none: "",
  closer: "Acosta la mà",
  farther: "Allunya una mica la mà",
  center: "Centra la mà",
  clipped: "Es talla la mà — entra-la al quadre",
  "no-hand": "Posa la mà davant la càmera",
};

/** A soft open-hand silhouette (palm + five fingers) as normalized outline
 * points, centered on (0.5, 0.5), height ≈ 0.6 of the frame. Drawn as a
 * ghost the player fills; it's a target, not a template — any pose is fine
 * as long as the bbox lands inside it. */
const GHOST: readonly [number, number][] = [
  // wrist → thumb side up → fingertips → pinky side down → back to wrist
  [0.42, 0.82], [0.36, 0.72], [0.31, 0.60], [0.30, 0.52], [0.34, 0.50], [0.38, 0.55],
  [0.39, 0.42], [0.41, 0.28], [0.44, 0.24], [0.47, 0.30], [0.47, 0.42],
  [0.49, 0.22], [0.52, 0.18], [0.55, 0.22], [0.55, 0.42],
  [0.57, 0.24], [0.60, 0.21], [0.63, 0.27], [0.62, 0.44],
  [0.65, 0.34], [0.68, 0.32], [0.70, 0.38], [0.68, 0.52],
  [0.66, 0.66], [0.62, 0.78], [0.56, 0.84], [0.48, 0.85], [0.42, 0.82],
];

/** Draws the ghost + zone state on the overlay. Call AFTER the skeleton so
 * the skeleton stays on top; caller clears the canvas. */
export function drawFramingGuide(ctx: CanvasRenderingContext2D, w: number, h: number, state: FramingState): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.setLineDash(state.inZone ? [] : [10, 8]);
  ctx.strokeStyle = state.inZone ? "rgba(232, 189, 79, 0.95)" : "rgba(244, 233, 210, 0.7)";
  ctx.fillStyle = state.inZone ? "rgba(232, 189, 79, 0.18)" : "rgba(244, 233, 210, 0.08)";
  ctx.beginPath();
  GHOST.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
