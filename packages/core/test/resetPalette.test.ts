import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESET_PALETTE_CONFIG,
  INITIAL_RESET_PALETTE_STATE,
  stepResetPalette,
  type ResetPaletteConfig,
  type ResetPaletteFrame,
  type ResetPaletteTrackerState,
} from "../src/resetPalette.js";

const HAND_PRESENT_STATE: ResetPaletteTrackerState = { ...INITIAL_RESET_PALETTE_STATE, wasHandPresent: true };

// A frame with every field defaulted to "nothing interesting happening" —
// tests override just what they need. atMs starts comfortably past any
// grace/refractory window so those don't need restating everywhere.
function frame(overrides: Partial<ResetPaletteFrame>): ResetPaletteFrame {
  return {
    atMs: 100000,
    count: 3,
    handCenterY: 0.4,
    lateralVelocity: 0,
    overallVelocity: 0,
    handMotionPhase: "idle",
    motionOnsetAtMs: null,
    ...overrides,
  };
}

describe("resetPalette: HARDENING regression — a throw motion must produce ZERO resets", () => {
  // Root cause this guards against (spikes/logs/session-acfcf6f6.ndjson,
  // real session): 220 gesture_resets in one session, zero completed
  // throws — wave/below-zone/out-of-frame all fired DURING the throw
  // itself. This simulates a realistic throw: motion onset fires, the hand
  // swings up (spiking), passes through low Y positions and picks up some
  // one-directional lateral drift, then settles at a count and goes idle.
  it("a full throw trace (onset -> spiking -> settling -> idle at a stable count) fires no reset at any frame", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const onsetAtMs = 100000;
    const trace: ResetPaletteFrame[] = [
      // pre-throw: hand visible, idle, mid-frame.
      frame({ atMs: onsetAtMs - 50, count: 3, handCenterY: 0.4, handMotionPhase: "idle", motionOnsetAtMs: null }),
      // motion onset fires -> spiking. The swing itself has SOME lateral
      // component (one direction only, never reversing) and passes through
      // a lower Y position on its way up — exactly the false-positive shape
      // from the real session.
      frame({ atMs: onsetAtMs, count: null, handCenterY: 0.7, lateralVelocity: 2.5, overallVelocity: 3.0, handMotionPhase: "spiking", motionOnsetAtMs: onsetAtMs }),
      frame({ atMs: onsetAtMs + 30, count: null, handCenterY: 0.85, lateralVelocity: 2.2, overallVelocity: 2.8, handMotionPhase: "spiking", motionOnsetAtMs: onsetAtMs }),
      frame({ atMs: onsetAtMs + 60, count: 4, handCenterY: 0.5, lateralVelocity: 1.8, overallVelocity: 2.5, handMotionPhase: "spiking", motionOnsetAtMs: onsetAtMs }),
      // settling.
      frame({ atMs: onsetAtMs + 100, count: 4, handCenterY: 0.35, lateralVelocity: 0.5, overallVelocity: 0.4, handMotionPhase: "settling", motionOnsetAtMs: onsetAtMs }),
      frame({ atMs: onsetAtMs + 150, count: 4, handCenterY: 0.3, lateralVelocity: 0.1, overallVelocity: 0.1, handMotionPhase: "settling", motionOnsetAtMs: onsetAtMs }),
      // idle again, but still inside the motion-grace window (400ms default).
      frame({ atMs: onsetAtMs + 250, count: 4, handCenterY: 0.3, lateralVelocity: 0, overallVelocity: 0, handMotionPhase: "idle", motionOnsetAtMs: onsetAtMs }),
      frame({ atMs: onsetAtMs + 390, count: 4, handCenterY: 0.3, lateralVelocity: 0, overallVelocity: 0, handMotionPhase: "idle", motionOnsetAtMs: onsetAtMs }),
      // past the grace window, hand held steady at the settled count.
      frame({ atMs: onsetAtMs + 500, count: 4, handCenterY: 0.3, lateralVelocity: 0, overallVelocity: 0, handMotionPhase: "idle", motionOnsetAtMs: onsetAtMs }),
    ];
    for (const f of trace) {
      const step = stepResetPalette(state, f);
      expect(step.reason).toBeNull();
      state = step.state;
    }
  });
});

describe("resetPalette: wave-to-cancel requires a genuine SHAKE (reversals), not a single fast swing", () => {
  it("a one-directional throw swing (fast lateral velocity, same sign every frame) never fires wave, no matter how fast", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const swing = [3.0, 3.2, 2.8, 2.5, 1.0]; // fast, but always positive (one direction)
    let t = 100000;
    for (const v of swing) {
      const step = stepResetPalette(state, frame({ atMs: t, lateralVelocity: v, handMotionPhase: "spiking" }));
      expect(step.reason).toBeNull();
      state = step.state;
      t += 30;
    }
  });

  it("a true shake (>= 2 direction reversals within the window) fires wave exactly once", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    let t = 100000;
    const signs = [2.0, -2.0, 2.0]; // right, left, right -> 2 reversals
    const reasons: (string | null)[] = [];
    for (const v of signs) {
      const step = stepResetPalette(state, frame({ atMs: t, lateralVelocity: v }));
      reasons.push(step.reason);
      state = step.state;
      t += 100;
    }
    expect(reasons).toEqual([null, null, "wave"]);
  });

  it("reversals spread OUTSIDE the rolling window never accumulate into a fire", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, waveReversalWindowMs: 600 };
    let step = stepResetPalette(state, frame({ atMs: 100000, lateralVelocity: 2.0 }), config);
    state = step.state;
    step = stepResetPalette(state, frame({ atMs: 100700, lateralVelocity: -2.0 }), config); // 700ms later — outside the 600ms window
    expect(step.reason).toBeNull();
  });

  it("below the lateral velocity threshold never counts toward a reversal", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, waveLateralV: 1.4 };
    let t = 100000;
    for (const v of [1.0, -1.0, 1.0, -1.0, 1.0]) {
      const step = stepResetPalette(state, frame({ atMs: t, lateralVelocity: v }), config);
      expect(step.reason).toBeNull();
      state = step.state;
      t += 100;
    }
  });

  it("wave does not require handMotionPhase==idle — a real shake keeps the primary FSM spiking throughout", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    let t = 100000;
    let lastReason: string | null = null;
    for (const v of [2.0, -2.0, 2.0]) {
      const step = stepResetPalette(state, frame({ atMs: t, lateralVelocity: v, handMotionPhase: "spiking" }));
      lastReason = step.reason;
      state = step.state;
      t += 100;
    }
    expect(lastReason).toBe("wave");
  });

  it("disabled via config -> never fires even with real reversals", () => {
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, waveEnabled: false };
    let state = INITIAL_RESET_PALETTE_STATE;
    let t = 100000;
    for (const v of [2.0, -2.0, 2.0]) {
      const step = stepResetPalette(state, frame({ atMs: t, lateralVelocity: v }), config);
      expect(step.reason).toBeNull();
      state = step.state;
      t += 100;
    }
  });
});

describe("resetPalette: below-zone requires a genuinely RESTING hand, not fast transit", () => {
  it("crossing the line at speed (mid-throw transit) never fires", () => {
    const step = stepResetPalette(
      INITIAL_RESET_PALETTE_STATE,
      frame({ handCenterY: 0.92, overallVelocity: 2.0, handMotionPhase: "spiking" })
    );
    expect(step.reason).toBeNull();
  });

  it("resting below the line (low velocity, idle, past grace) fires below-zone", () => {
    const step = stepResetPalette(
      INITIAL_RESET_PALETTE_STATE,
      frame({ handCenterY: 0.92, overallVelocity: 0.05, handMotionPhase: "idle", motionOnsetAtMs: null })
    );
    expect(step.reason).toBe("below-zone");
  });

  it("still gated by handMotionPhase even while resting-velocity-wise (e.g. mid-settle)", () => {
    const step = stepResetPalette(
      INITIAL_RESET_PALETTE_STATE,
      frame({ handCenterY: 0.92, overallVelocity: 0.05, handMotionPhase: "settling" })
    );
    expect(step.reason).toBeNull();
  });

  it("still gated by the motion-grace window even while idle and resting", () => {
    const step = stepResetPalette(
      INITIAL_RESET_PALETTE_STATE,
      frame({ atMs: 100100, handCenterY: 0.92, overallVelocity: 0.05, handMotionPhase: "idle", motionOnsetAtMs: 100000 }) // only 100ms since onset, grace is 400ms
    );
    expect(step.reason).toBeNull();
  });

  it("fires once past the grace window", () => {
    const step = stepResetPalette(
      INITIAL_RESET_PALETTE_STATE,
      frame({ atMs: 100500, handCenterY: 0.92, overallVelocity: 0.05, handMotionPhase: "idle", motionOnsetAtMs: 100000 })
    );
    expect(step.reason).toBe("below-zone");
  });

  it("disabled via config -> no reason", () => {
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, belowZoneEnabled: false };
    const step = stepResetPalette(INITIAL_RESET_PALETTE_STATE, frame({ handCenterY: 0.99, overallVelocity: 0 }), config);
    expect(step.reason).toBeNull();
  });

  it("edge-triggered — only fires once per transition into the zone", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const first = stepResetPalette(state, frame({ handCenterY: 0.92, overallVelocity: 0 }));
    expect(first.reason).toBe("below-zone");
    state = first.state;
    const second = stepResetPalette(state, frame({ atMs: 101000, handCenterY: 0.95, overallVelocity: 0 })); // still below, past refractory
    expect(second.reason).toBeNull();
  });
});

describe("resetPalette: out-of-frame is gated to idle + past the motion grace window", () => {
  it("hand disappearing mid-throw (spiking) never fires", () => {
    const step = stepResetPalette(HAND_PRESENT_STATE, frame({ count: null, handMotionPhase: "spiking" }));
    expect(step.reason).toBeNull();
  });

  it("hand disappearing while idle but still inside the grace window never fires", () => {
    const step = stepResetPalette(
      HAND_PRESENT_STATE,
      frame({ atMs: 100200, count: null, handMotionPhase: "idle", motionOnsetAtMs: 100000 })
    );
    expect(step.reason).toBeNull();
  });

  it("hand disappearing while idle and past the grace window fires", () => {
    const step = stepResetPalette(
      HAND_PRESENT_STATE,
      frame({ atMs: 100500, count: null, handMotionPhase: "idle", motionOnsetAtMs: 100000 })
    );
    expect(step.reason).toBe("out-of-frame");
  });

  it("no prior motion onset at all (null) -> grace is trivially satisfied", () => {
    const step = stepResetPalette(HAND_PRESENT_STATE, frame({ count: null, handMotionPhase: "idle", motionOnsetAtMs: null }));
    expect(step.reason).toBe("out-of-frame");
  });

  it("disabled via config -> no reason", () => {
    const config: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, outOfFrameEnabled: false };
    const step = stepResetPalette(HAND_PRESENT_STATE, frame({ count: null, handMotionPhase: "idle" }), config);
    expect(step.reason).toBeNull();
  });
});

describe("resetPalette: refractory period collapses a burst into exactly one event", () => {
  it("a burst of otherwise-eligible below-zone frames fires exactly once", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const reasons: (string | null)[] = [];
    let t = 100000;
    for (let i = 0; i < 10; i++) {
      const step = stepResetPalette(state, frame({ atMs: t, handCenterY: 0.92, overallVelocity: 0 }));
      reasons.push(step.reason);
      state = step.state;
      t += 30; // 10 frames * 30ms = 300ms of noisy "below zone" readings
    }
    expect(reasons.filter((r) => r === "below-zone").length).toBe(1);
  });

  it("after the refractory window elapses, a genuinely NEW transition can fire again", () => {
    let state = INITIAL_RESET_PALETTE_STATE;
    const first = stepResetPalette(state, frame({ atMs: 100000, handCenterY: 0.92, overallVelocity: 0 }));
    expect(first.reason).toBe("below-zone");
    state = first.state;
    // leave the zone, then re-enter after the refractory window (500ms default).
    const leaving = stepResetPalette(state, frame({ atMs: 100200, handCenterY: 0.2, overallVelocity: 0 }));
    state = leaving.state;
    const reentering = stepResetPalette(state, frame({ atMs: 100700, handCenterY: 0.92, overallVelocity: 0 }));
    expect(reentering.reason).toBe("below-zone");
  });

  it("refractory suppresses a DIFFERENT reason too, not just a repeat of the same one", () => {
    const afterBelowZone = stepResetPalette(INITIAL_RESET_PALETTE_STATE, frame({ atMs: 100000, handCenterY: 0.92, overallVelocity: 0 }));
    expect(afterBelowZone.reason).toBe("below-zone");
    // Carry the refractory timer forward onto a state that's otherwise
    // eligible to fire out-of-frame (hand WAS present, now gone) — still
    // suppressed, because refractory blocks ANY reason, not just repeats.
    const stateWithHandPresent: ResetPaletteTrackerState = { ...afterBelowZone.state, wasHandPresent: true };
    const attemptOutOfFrame = stepResetPalette(stateWithHandPresent, frame({ atMs: 100100, count: null, handMotionPhase: "idle" }));
    expect(attemptOutOfFrame.reason).toBeNull();
  });
});

describe("resetPalette: original edge-trigger/config behavior preserved", () => {
  it("hand present the whole time never fires", () => {
    const r = stepResetPalette(HAND_PRESENT_STATE, frame({ count: 3, handCenterY: 0.4 }));
    expect(r.reason).toBeNull();
  });

  it("a smaller configured zone height moves the boundary", () => {
    const tighterZone: ResetPaletteConfig = { ...DEFAULT_RESET_PALETTE_CONFIG, belowZoneHeightPct: 5 };
    const r = stepResetPalette(INITIAL_RESET_PALETTE_STATE, frame({ handCenterY: 0.97, overallVelocity: 0 }), tighterZone);
    expect(r.reason).toBe("below-zone"); // 0.97 >= 1 - 0.05
    const notYet = stepResetPalette(INITIAL_RESET_PALETTE_STATE, frame({ handCenterY: 0.9, overallVelocity: 0 }), tighterZone);
    expect(notYet.reason).toBeNull(); // 0.9 < 1 - 0.05
  });

  it("wave takes priority over a simultaneous out-of-frame/below-zone signal", () => {
    let state: ResetPaletteTrackerState = { ...HAND_PRESENT_STATE };
    let t = 100000;
    for (const v of [2.0, -2.0]) {
      const step = stepResetPalette(state, frame({ atMs: t, count: 3, lateralVelocity: v }));
      state = step.state; // carries the reversal history AND wasHandPresent forward together
      t += 100;
    }
    const step = stepResetPalette(state, frame({ atMs: t, count: null, handCenterY: 0.95, lateralVelocity: 2.0 }));
    expect(step.reason).toBe("wave");
  });
});
