import { describe, expect, it } from "vitest";
import { DEFAULT_VELOCITY_CONFIG, INITIAL_VELOCITY_STATE, stepVelocityStateMachine, type VelocityMachineState } from "../../src/fingers/velocity.js";

const cfg = DEFAULT_VELOCITY_CONFIG; // highV=0.9, lowV=0.25, settleMs=50 — spike defaults

describe("velocity: idle -> spiking -> settling -> onset (the full throw)", () => {
  it("idle stays idle while velocity is low", () => {
    const r = stepVelocityStateMachine(INITIAL_VELOCITY_STATE, 100, 0.1, cfg);
    expect(r.state.handState).toBe("idle");
    expect(r.onset).toBeNull();
  });
  it("idle -> spiking when velocity crosses HIGH_V, recording motionStartPerfTime = t", () => {
    const r = stepVelocityStateMachine(INITIAL_VELOCITY_STATE, 100, 1.0, cfg);
    expect(r.state.handState).toBe("spiking");
    expect(r.state.motionStartPerfTime).toBe(100);
    expect(r.onset).toBeNull();
  });
  it("spiking -> settling when velocity drops below LOW_V, recording settleStart = t", () => {
    const spiking: VelocityMachineState = { handState: "spiking", settleStart: null, motionStartPerfTime: 100 };
    const r = stepVelocityStateMachine(spiking, 150, 0.1, cfg);
    expect(r.state.handState).toBe("settling");
    expect(r.state.settleStart).toBe(150);
    expect(r.onset).toBeNull();
  });
  it("settling stays settling while velocity is mid-range (neither re-spike nor settled)", () => {
    const settling: VelocityMachineState = { handState: "settling", settleStart: 150, motionStartPerfTime: 100 };
    const r = stepVelocityStateMachine(settling, 160, 0.5, cfg); // between lowV and highV
    expect(r.state).toEqual(settling); // unchanged — same settleStart, no reset
    expect(r.onset).toBeNull();
  });
  it("settling fires an onset once SETTLE_MS has elapsed below LOW_V, returning to idle", () => {
    const settling: VelocityMachineState = { handState: "settling", settleStart: 150, motionStartPerfTime: 100 };
    const r = stepVelocityStateMachine(settling, 200, 0.1, cfg); // 200-150=50ms >= settleMs(50)
    expect(r.onset).toEqual({ settlePerfTime: 150, motionStartPerfTime: 100 });
    expect(r.state).toEqual({ handState: "idle", settleStart: null, motionStartPerfTime: null });
  });
  it("settling does NOT fire before SETTLE_MS has elapsed", () => {
    const settling: VelocityMachineState = { handState: "settling", settleStart: 150, motionStartPerfTime: 100 };
    const r = stepVelocityStateMachine(settling, 180, 0.1, cfg); // only 30ms elapsed
    expect(r.onset).toBeNull();
    expect(r.state.handState).toBe("settling");
  });
});

describe("velocity: re-spike mid-settle restarts the anchor (a fresh motion attempt)", () => {
  it("settling -> spiking on a fresh HIGH_V crossing, discarding the old settleStart", () => {
    const settling: VelocityMachineState = { handState: "settling", settleStart: 150, motionStartPerfTime: 100 };
    const r = stepVelocityStateMachine(settling, 170, 1.2, cfg);
    expect(r.state).toEqual({ handState: "spiking", settleStart: null, motionStartPerfTime: 170 });
    expect(r.onset).toBeNull();
  });
});

describe("velocity: full throw sequence via successive steps", () => {
  it("idle -> spike -> settle -> onset, driven step by step", () => {
    let state = INITIAL_VELOCITY_STATE;
    let r = stepVelocityStateMachine(state, 0, 1.5, cfg); // spike
    state = r.state;
    expect(state.handState).toBe("spiking");
    r = stepVelocityStateMachine(state, 30, 0.1, cfg); // drop below LOW_V -> settling
    state = r.state;
    expect(state.handState).toBe("settling");
    r = stepVelocityStateMachine(state, 40, 0.1, cfg); // only 10ms — not settled yet
    expect(r.onset).toBeNull();
    state = r.state;
    r = stepVelocityStateMachine(state, 80, 0.1, cfg); // 80-30=50ms >= settleMs
    expect(r.onset).toEqual({ settlePerfTime: 30, motionStartPerfTime: 0 });
    expect(r.state.handState).toBe("idle");
  });
});

describe("velocity: idle ignores velocity that never exceeds HIGH_V", () => {
  it("stays idle across many low/mid readings", () => {
    let state = INITIAL_VELOCITY_STATE;
    for (const [t, v] of [[10, 0.1], [20, 0.3], [30, 0.5], [40, 0.6]] as const) {
      const r = stepVelocityStateMachine(state, t, v, cfg);
      state = r.state;
      expect(r.onset).toBeNull();
    }
    expect(state.handState).toBe("idle");
  });
});
