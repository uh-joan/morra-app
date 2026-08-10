// resetPalette.ts — Feature 2: the reset palette that REPLACES fist-as-reset
// (removed from scorer.ts's classifyHandSettleForSync as part of the
// throw-of-1 fix, Feature 1 — see that file's header comment). The fist is
// now a legal throw; a player who wants to cancel/re-arm instead has four
// explicit, OR'd signals, each re-arming the ready pill on its own:
//   a. hand out of frame        (count present -> absent)
//   b. below-zone                (hand crosses below a configurable
//                                 horizontal line near the bottom of frame
//                                 — "the table")
//   c. wave-to-cancel            (a quick horizontal shake: high LATERAL
//                                 velocity, deliberately evaluated
//                                 independent of the settle pipeline — a
//                                 wave never settles, by design)
//   d. stillness backstop        (unchanged — see gameStore.ts's
//                                 updateReadyPillFromFrame/handHasResetSince;
//                                 not modeled here, kept as its own
//                                 pre-existing, separate mechanism)
//
// This module is the PURE, testable core of (a)/(b)/(c) — a single step
// function over one frame's already-recognized signals plus small tracked
// state, called once per frame by apps/web's sensorPipeline.ts (the impure
// glue that actually has camera frames). out-of-frame and below-zone are
// edge-triggered (fire once per transition, not every frame the condition
// holds) so a reset event fires exactly once per gesture — matching wave's
// own one-shot nature.
export type ResetReason = "out-of-frame" | "below-zone" | "wave" | "stillness";

export interface ResetPaletteConfig {
  outOfFrameEnabled: boolean;
  belowZoneEnabled: boolean;
  /** 0-100: the bottom N% of the camera frame counts as "below the table
   * line". Per-profile configurable (Feature 3) — different players prefer
   * different reset zones. */
  belowZoneHeightPct: number;
  waveEnabled: boolean;
  /** Lateral (x-axis-only) tip velocity threshold, same arbitrary unit as
   * velocity.ts's HIGH_V/LOW_V — a deliberate horizontal shake reads much
   * higher on this axis alone than a normal throw's mostly-vertical motion
   * does, which is what lets a wave be recognized as distinct from a throw
   * in the first place. */
  waveLateralV: number;
}

export const DEFAULT_RESET_PALETTE_CONFIG: ResetPaletteConfig = {
  outOfFrameEnabled: true,
  belowZoneEnabled: true,
  belowZoneHeightPct: 15,
  waveEnabled: true,
  waveLateralV: 1.4,
};

export interface ResetPaletteFrame {
  /** This frame's recognized finger count; null = no hand detected at all. */
  count: number | null;
  /** Normalized hand position, 0 (top of frame) to 1 (bottom); null when no
   * hand is present or the recognizer can't supply one. */
  handCenterY: number | null;
  /** This frame's lateral-only (x-axis) fingertip velocity; null when there
   * is no previous frame to compare against yet. */
  lateralVelocity: number | null;
}

export interface ResetPaletteTrackerState {
  wasHandPresent: boolean;
  wasBelowZone: boolean;
}

export const INITIAL_RESET_PALETTE_STATE: ResetPaletteTrackerState = { wasHandPresent: false, wasBelowZone: false };

export interface ResetPaletteStepResult {
  state: ResetPaletteTrackerState;
  /** Non-null exactly on the frame a NEW reset gesture is recognized. */
  reason: ResetReason | null;
}

/** Never mutates the input state. */
export function stepResetPalette(
  state: ResetPaletteTrackerState,
  frame: ResetPaletteFrame,
  config: ResetPaletteConfig = DEFAULT_RESET_PALETTE_CONFIG
): ResetPaletteStepResult {
  const handPresent = frame.count != null;
  const belowZone = frame.handCenterY != null && frame.handCenterY >= 1 - config.belowZoneHeightPct / 100;
  const nextState: ResetPaletteTrackerState = { wasHandPresent: handPresent, wasBelowZone: belowZone };

  // Wave is checked first and independent of settle/presence tracking — "no
  // settle" is the point (a real throw settles; a cancel-wave doesn't), so
  // it can't be expressed as an edge over wasHandPresent/wasBelowZone.
  if (config.waveEnabled && frame.lateralVelocity != null && frame.lateralVelocity > config.waveLateralV) {
    return { state: nextState, reason: "wave" };
  }
  if (config.outOfFrameEnabled && state.wasHandPresent && !handPresent) {
    return { state: nextState, reason: "out-of-frame" };
  }
  if (config.belowZoneEnabled && !state.wasBelowZone && belowZone) {
    return { state: nextState, reason: "below-zone" };
  }
  return { state: nextState, reason: null };
}
