// velocity.ts — ports spikes/s03-beat.html L2032–2054 (processHandVelocity):
// the per-frame glue around @morra/recognition's pure stepVelocityStateMachine
// (itself the verbatim port of the same FSM). Like the spike, tuning values
// are read live off the DOM inputs at use time — the settings module (M6)
// formalizes change telemetry but the inputs stay the source of truth.
//
// idle --(v>HIGH_V)--> spiking (records motionStartPerfTime — the throw's
// true start) --(v<LOW_V)--> settling --(held SETTLE_MS)--> onset fired with
// BOTH the settle instant and the motion-start anchor. A re-spike mid-settle
// restarts the anchor (a fresh motion attempt, not a continuation).

import {
  INITIAL_VELOCITY_STATE,
  stepVelocityStateMachine,
  type VelocityMachineState,
  type VelocityOnsetEvent,
} from "@morra/recognition";
import { el } from "./dom.js";

let state: VelocityMachineState = INITIAL_VELOCITY_STATE;

/** Per-frame centroid velocity, last VELOCITY_HISTORY_MS — read by the
 * calibration flow (peak between motion start and settle; resting jitter).
 * Same {t, v} the FSM stepped on. */
export const VELOCITY_HISTORY_MS = 4000;
export const velocityHistory: { t: number; v: number }[] = [];
export function peakVelocityBetween(fromT: number, toT: number): number | null {
  let peak: number | null = null;
  for (let i = velocityHistory.length - 1; i >= 0; i--) {
    const f = velocityHistory[i]!;
    if (f.t > toT) continue;
    if (f.t < fromT) break;
    if (peak == null || f.v > peak) peak = f.v;
  }
  return peak;
}
export function velocitiesBetween(fromT: number, toT: number): number[] {
  const out: number[] = [];
  for (let i = velocityHistory.length - 1; i >= 0; i--) {
    const f = velocityHistory[i]!;
    if (f.t > toT) continue;
    if (f.t < fromT) break;
    out.push(f.v);
  }
  return out;
}

export type HandOnsetHandler = (
  settlePerfTime: number,
  motionStartPerfTime: number | null,
  fingerCount: number | null,
  /** the resting count just BEFORE motion start (see camera.ts
   * preOnsetFingerCount) — throw-of-one reveal gate; null = unknown */
  preOnsetFingerCount?: number | null
) => void;

/** camera.ts registers "what was the hand doing right before this motion
 * started?" here — it owns the frame history and the time base. */
let preOnsetCountFor: (motionStartPerfTime: number | null) => number | null = () => null;
export function setPreOnsetCountProvider(fn: (motionStartPerfTime: number | null) => number | null): void {
  preOnsetCountFor = fn;
}

let onHandOnset: HandOnsetHandler = () => {};
export function setHandOnsetHandler(handler: HandOnsetHandler): void {
  onHandOnset = handler;
}

export function currentHandState(): VelocityMachineState["handState"] {
  return state.handState;
}

/** Per camera frame with a detected hand: t is the frame's perf-timeline
 * timestamp (rVFC expectedDisplayTime), v the CENTROID velocity,
 * lastKnownFingerCount the frame's count (read at settle time — a count is
 * only trustworthy once the hand stops). */
export function processHandVelocity(t: number, v: number, lastKnownFingerCount: number | null): void {
  el.handVel.textContent = v.toFixed(2);
  (el.handVelMeterFill as HTMLElement).style.width = Math.min(100, v * 40) + "%";
  const config = {
    highV: parseFloat(el.tuneHighV.value),
    lowV: parseFloat(el.tuneLowV.value),
    settleMs: parseFloat(el.tuneSettleMs.value),
  };
  velocityHistory.push({ t, v });
  const cutoff = t - VELOCITY_HISTORY_MS;
  while (velocityHistory.length && velocityHistory[0]!.t < cutoff) velocityHistory.shift();
  const result = stepVelocityStateMachine(state, t, v, config);
  state = result.state;
  if (result.onset) {
    const onset: VelocityOnsetEvent = result.onset;
    onHandOnset(
      onset.settlePerfTime,
      onset.motionStartPerfTime,
      lastKnownFingerCount,
      preOnsetCountFor(onset.motionStartPerfTime)
    );
  }
  el.handState.textContent = state.handState;
}
