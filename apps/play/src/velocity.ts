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

export type HandOnsetHandler = (
  settlePerfTime: number,
  motionStartPerfTime: number | null,
  fingerCount: number | null
) => void;

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
  const result = stepVelocityStateMachine(state, t, v, config);
  state = result.state;
  if (result.onset) {
    const onset: VelocityOnsetEvent = result.onset;
    onHandOnset(onset.settlePerfTime, onset.motionStartPerfTime, lastKnownFingerCount);
  }
  el.handState.textContent = state.handState;
}
