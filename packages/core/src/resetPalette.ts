// resetPalette.ts — Feature 2: the reset palette that REPLACES fist-as-reset
// (removed from scorer.ts's classifyHandSettleForSync as part of the
// throw-of-1 fix, Feature 1 — see that file's header comment). The fist is
// now a legal throw; a player who wants to cancel/re-arm instead has four
// explicit, OR'd signals, each re-arming the ready pill on its own:
//   a. hand out of frame        (count present -> absent)
//   b. below-zone                (hand crosses below a configurable
//                                 horizontal line near the bottom of frame
//                                 — "the table")
//   c. wave-to-cancel            (a horizontal SHAKE — repeated direction
//                                 reversals — never a single fast swing)
//   d. stillness backstop        (unchanged — see gameStore.ts's
//                                 updateReadyPillFromFrame/handHasResetSince;
//                                 not modeled here, kept as its own
//                                 pre-existing, separate mechanism)
//
// HARDENING (real-session bug, spikes/logs/session-acfcf6f6.ndjson): the
// first version of this module fired on the THROW ITSELF — 220
// gesture_resets in one real session, zero completed throws, 10 burned
// commitments. Root causes and fixes, all below:
//   - wave fired on any single fast lateral frame — a throw's own swing IS
//     high lateral velocity pre-settle. Fixed: wave now requires >= 2
//     lateral-velocity DIRECTION REVERSALS within a rolling window — a
//     genuine shake oscillates; a throw's swing is one-directional and can
//     never satisfy this on its own, so wave does NOT need the FSM-idle
//     gate below (the reversal requirement is already robust on its own).
//   - out-of-frame/below-zone fired on raw position/presence alone,
//     including mid-swing (a throw's hand legitimately passes through
//     frame edges and low positions). Fixed: both are now gated to frames
//     where the hand-motion state machine (the SAME one throw-onset
//     detection uses) is genuinely `"idle"`, AND outside a grace window
//     after the last real motion onset — "idle" alone isn't enough because
//     SETTLE_MS is short and a throw's audio window stays open for 700ms
//     past the settle.
//   - below-zone additionally required a genuinely RESTING hand (low
//     overall velocity) — a hand transiting the zone at speed (e.g. rising
//     off the table mid-throw) must never count.
//   - no refractory period meant a burst of 5-10 frames all fired for the
//     SAME physical event. Fixed: any reset suppresses further resets for
//     a short window.
// This module stays pure/testable; sensorPipeline.ts is the only caller
// (once per frame), feeding it the recognizer's real signals.
import type { HandMotionPhase } from "./types.js";

export type ResetReason = "out-of-frame" | "below-zone" | "wave" | "stillness";

export interface ResetPaletteConfig {
  outOfFrameEnabled: boolean;
  belowZoneEnabled: boolean;
  /** 0-100: the bottom N% of the camera frame counts as "below the table
   * line". Per-profile configurable (Feature 3) — different players prefer
   * different reset zones. */
  belowZoneHeightPct: number;
  waveEnabled: boolean;
  /** Lateral (x-axis-only, SIGNED) velocity magnitude threshold beyond
   * which a frame counts as "moving" for direction-reversal purposes —
   * same arbitrary unit as velocity.ts's HIGH_V/LOW_V. */
  waveLateralV: number;
  /** A wave fires once at least this many lateral direction reversals
   * happen within waveReversalWindowMs of each other. */
  waveMinReversals: number;
  waveReversalWindowMs: number;
  /** out-of-frame/below-zone only fire while the hand-motion state machine
   * is `"idle"` AND at least this long after the last real motion onset —
   * the throw-motion guard described above. */
  motionGraceMs: number;
  /** below-zone additionally requires the frame's overall (not just
   * lateral) velocity to be at or under this — "resting on the table", not
   * fast transit through the zone. */
  belowZoneMaxVelocity: number;
  /** After ANY reset fires, further resets are suppressed for this long —
   * collapses a burst of noisy frames into exactly one logged event. */
  refractoryMs: number;
}

export const DEFAULT_RESET_PALETTE_CONFIG: ResetPaletteConfig = {
  outOfFrameEnabled: true,
  belowZoneEnabled: true,
  belowZoneHeightPct: 15,
  waveEnabled: true,
  waveLateralV: 1.4,
  waveMinReversals: 2,
  waveReversalWindowMs: 600,
  motionGraceMs: 400,
  belowZoneMaxVelocity: 0.6,
  refractoryMs: 500,
};

export interface ResetPaletteFrame {
  /** Clock reading this frame was captured at (same timeline as the perf-
   * time timestamps the rest of the round pipeline uses) — required now
   * for grace/refractory/reversal-window math. */
  atMs: number;
  /** This frame's recognized finger count; null = no hand detected at all. */
  count: number | null;
  /** Normalized hand position, 0 (top of frame) to 1 (bottom); null when no
   * hand is present or the recognizer can't supply one. */
  handCenterY: number | null;
  /** SIGNED x-axis-only wrist velocity this frame (positive/negative by
   * direction); null when there's no previous frame to compare against. */
  lateralVelocity: number | null;
  /** Overall (magnitude) hand velocity this frame, the SAME signal
   * FingerRecognitionResult.velocity carries — used for below-zone's
   * "genuinely resting" check. */
  overallVelocity: number | null;
  /** The recognizer's own velocity-state-machine phase this frame. */
  handMotionPhase: HandMotionPhase;
  /** Timestamp (same clock as atMs) of the most recent REAL motion onset —
   * the same one throw-onset detection anchors on — or null if none yet
   * this session. */
  motionOnsetAtMs: number | null;
}

export interface ResetPaletteTrackerState {
  wasHandPresent: boolean;
  wasBelowZone: boolean;
  lastResetAtMs: number | null;
  lastLateralSign: -1 | 0 | 1;
  /** Recent lateral-direction-reversal instants, pruned to the rolling
   * window every step. */
  reversalTimestamps: readonly number[];
}

export const INITIAL_RESET_PALETTE_STATE: ResetPaletteTrackerState = {
  wasHandPresent: false,
  wasBelowZone: false,
  lastResetAtMs: null,
  lastLateralSign: 0,
  reversalTimestamps: [],
};

export interface ResetPaletteStepResult {
  state: ResetPaletteTrackerState;
  /** Non-null exactly on the frame a NEW reset gesture is recognized. */
  reason: ResetReason | null;
}

function lateralSign(lateralVelocity: number | null, threshold: number): -1 | 0 | 1 {
  if (lateralVelocity == null || Math.abs(lateralVelocity) < threshold) return 0;
  return lateralVelocity > 0 ? 1 : -1;
}

/** Never mutates the input state. */
export function stepResetPalette(
  state: ResetPaletteTrackerState,
  frame: ResetPaletteFrame,
  config: ResetPaletteConfig = DEFAULT_RESET_PALETTE_CONFIG
): ResetPaletteStepResult {
  const handPresent = frame.count != null;
  const belowZone = frame.handCenterY != null && frame.handCenterY >= 1 - config.belowZoneHeightPct / 100;

  // Reversal tracking is updated UNCONDITIONALLY (even during refractory or
  // a locked-out phase) so the rolling window always reflects real motion
  // history — only the DECISION to fire a reset is ever suppressed below.
  const sign = lateralSign(frame.lateralVelocity, config.waveLateralV);
  let reversalTimestamps = state.reversalTimestamps.filter((t) => frame.atMs - t <= config.waveReversalWindowMs);
  let lastLateralSign = state.lastLateralSign;
  if (sign !== 0) {
    if (lastLateralSign !== 0 && sign !== lastLateralSign) reversalTimestamps = [...reversalTimestamps, frame.atMs];
    lastLateralSign = sign;
  }

  const baseNextState: ResetPaletteTrackerState = {
    wasHandPresent: handPresent,
    wasBelowZone: belowZone,
    lastResetAtMs: state.lastResetAtMs,
    lastLateralSign,
    reversalTimestamps,
  };

  // Refractory: any reset (any reason) suppresses further resets briefly —
  // collapses a burst into exactly one logged event.
  const inRefractory = state.lastResetAtMs != null && frame.atMs - state.lastResetAtMs < config.refractoryMs;
  if (inRefractory) {
    return { state: baseNextState, reason: null };
  }

  // Wave: needs no FSM-idle gate — the reversal requirement is ALREADY
  // impossible for a one-directional throw swing to satisfy.
  if (config.waveEnabled && reversalTimestamps.length >= config.waveMinReversals) {
    return { state: { ...baseNextState, reversalTimestamps: [], lastResetAtMs: frame.atMs }, reason: "wave" };
  }

  // out-of-frame / below-zone: only eligible once the hand-motion state
  // machine is genuinely idle AND the motion grace window has elapsed —
  // never mid-throw.
  const pastGrace = frame.motionOnsetAtMs == null || frame.atMs - frame.motionOnsetAtMs >= config.motionGraceMs;
  const eligibleForPositionReset = frame.handMotionPhase === "idle" && pastGrace;

  if (eligibleForPositionReset && config.outOfFrameEnabled && state.wasHandPresent && !handPresent) {
    return { state: { ...baseNextState, lastResetAtMs: frame.atMs }, reason: "out-of-frame" };
  }
  const resting = frame.overallVelocity == null || frame.overallVelocity <= config.belowZoneMaxVelocity;
  if (eligibleForPositionReset && config.belowZoneEnabled && !state.wasBelowZone && belowZone && resting) {
    return { state: { ...baseNextState, lastResetAtMs: frame.atMs }, reason: "below-zone" };
  }
  return { state: baseNextState, reason: null };
}
