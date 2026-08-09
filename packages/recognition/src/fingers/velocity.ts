// velocity.ts — the hand-motion state machine ported from
// spikes/s03-beat.html's processHandVelocity, made PURE: the spike's
// version reads tuning values straight off DOM sliders, mutates
// module-level state, and calls onHandOnset() as a side effect. This is
// the same state-transition logic, restructured as a step function that
// takes/returns state explicitly and reports an onset as a return value
// instead of a callback — every threshold is a named, injectable config
// value (spike defaults preserved exactly: HIGH_V=0.9, LOW_V=0.25,
// SETTLE_MS=50).
//
// idle --(v>HIGH_V)--> spiking --(v<LOW_V)--> settling
//   settling --(v>HIGH_V)--> spiking            (re-spike mid-settle: a
//     fresh motion attempt, not a continuation — restarts the anchor)
//   settling --(v<LOW_V for >=SETTLE_MS)--> idle, firing an onset anchored
//     on BOTH the settle instant (settleStart) and the original motion-
//     start crossing (motionStartPerfTime) — the spike's step 10 finding
//     that a throw's shout starts with the swing, not the hand coming to
//     rest ~250-300ms later, so downstream sync-window math anchors on
//     motion start while settle stays available for display/debug.

export type HandMotionState = "idle" | "spiking" | "settling";

export interface VelocityMachineState {
  handState: HandMotionState;
  settleStart: number | null;
  motionStartPerfTime: number | null;
}

export interface VelocityConfig {
  highV: number;
  lowV: number;
  settleMs: number;
}

export const DEFAULT_VELOCITY_CONFIG: VelocityConfig = { highV: 0.9, lowV: 0.25, settleMs: 50 };

export const INITIAL_VELOCITY_STATE: VelocityMachineState = { handState: "idle", settleStart: null, motionStartPerfTime: null };

export interface VelocityOnsetEvent {
  settlePerfTime: number;
  /** Null only in the (unreachable in practice — "spiking" always sets it)
   * case the spike itself never null-checked at the point of firing;
   * consumers should fall back to settlePerfTime, exactly as
   * spikes/s03-beat.html's onSyncHandOnset already does:
   * `motionStartPerfTime != null ? motionStartPerfTime : settlePerfTime`. */
  motionStartPerfTime: number | null;
}

export interface VelocityStepResult {
  state: VelocityMachineState;
  /** Non-null exactly on the step where settling resolves into a real onset. */
  onset: VelocityOnsetEvent | null;
}

/** t: a monotonic timestamp (perf.now()-domain in the spike); v: the
 * frame's hand velocity in the SAME units the config's thresholds use
 * (the spike's own arbitrary "pixels of normalized landmark movement per
 * second" unit — this function doesn't care what the unit is, only that
 * config and v share it). Never mutates the input state. */
export function stepVelocityStateMachine(
  state: VelocityMachineState,
  t: number,
  v: number,
  config: VelocityConfig = DEFAULT_VELOCITY_CONFIG
): VelocityStepResult {
  const { highV, lowV, settleMs } = config;

  if (state.handState === "idle") {
    if (v > highV) {
      return { state: { handState: "spiking", settleStart: null, motionStartPerfTime: t }, onset: null };
    }
    return { state, onset: null };
  }

  if (state.handState === "spiking") {
    if (v < lowV) {
      return { state: { ...state, handState: "settling", settleStart: t }, onset: null };
    }
    return { state, onset: null };
  }

  // handState === "settling"
  if (v > highV) {
    return { state: { handState: "spiking", settleStart: null, motionStartPerfTime: t }, onset: null };
  }
  if (v < lowV && state.settleStart != null && t - state.settleStart >= settleMs) {
    const onset: VelocityOnsetEvent = { settlePerfTime: state.settleStart, motionStartPerfTime: state.motionStartPerfTime };
    return { state: { handState: "idle", settleStart: null, motionStartPerfTime: null }, onset };
  }
  return { state, onset: null };
}
