import { describe, expect, it } from "vitest";
import {
  APP_DEFAULTS,
  FIT_VERSION,
  fitAll,
  fitVelocity,
  fitVoice,
  HIGH_V_RANGE,
  LIVE_VAD_FLOOR_MIN,
  LOW_V_RANGE,
  MIN_SHOUTS,
  MIN_THROWS,
  VAD_MULT_RANGE,
} from "../../src/calibration/fit.js";

// jani's first real session (2026-08-17, session 8b82b1c6): the thumb-1
// peaked at 0.58 while the 5 peaked at 4.5. Version-1's median rule put
// HIGH_V at 0.81 — ABOVE the thumb-1 — and would have made it worse than
// the 0.5 default. This is what fit v2 is pinned to.
const JANI = {
  jitterP95: 0.11147619769424369,
  throwPeaks: [1.168271024387328, 0.5762688784283427, 1.7966324143715182, 2.4832972955599306, 4.5014608750039775],
  ambientFloor: 5.2114314908553663e-5,
  shoutPeaks: [0.40692339675325534, 0.6631116742342817, 0.40411365746528044, 0.4953743185544961, 0.42032225496145786],
};

describe("calibration fit: velocity (HIGH_V / LOW_V)", () => {
  it("jani's real session: HIGH_V lands UNDER the thumb-1 (0.58) with headroom, above 2× jitter", () => {
    const r = fitVelocity(JANI)!;
    expect(r.highV).toBeLessThan(0.58 * 0.8); // ≥ 20% headroom under the weakest throw
    expect(r.highV).toBeCloseTo(0.7 * 0.5762688784283427, 3); // 0.40
    expect(r.highV).toBeGreaterThanOrEqual(2 * JANI.jitterP95);
    expect(r.lowV).toBeGreaterThan(JANI.jitterP95);
    expect(r.lowV).toBeLessThanOrEqual(0.6 * r.highV + 1e-9);
  });
  it("even throws: HIGH_V = 70% of the weakest, which sits under 45% of the median only when the spread is small", () => {
    const r = fitVelocity({ jitterP95: 0.1, throwPeaks: [1.2, 1.4, 1.1, 1.3, 1.5] })!;
    expect(r.highV).toBeCloseTo(Math.min(0.7 * 1.1, 0.45 * 1.3), 6); // 0.585 (median cap binds)
    expect(r.lowV).toBeGreaterThan(0.1);
    expect(r.lowV).toBeLessThan(r.highV);
  });
  it("one freak fast throw cannot drag HIGH_V up: the median cap", () => {
    const r = fitVelocity({ jitterP95: 0.05, throwPeaks: [1.0, 1.0, 1.0, 1.0, 9.0] })!;
    expect(r.highV).toBeCloseTo(Math.min(0.7 * 1.0, 0.45 * 1.0), 6); // 0.45
  });
  it("a jittery hand: LOW_V stays above the jitter (throws must be able to SETTLE) and HIGH_V rises to keep the ratio", () => {
    const r = fitVelocity({ jitterP95: 0.4, throwPeaks: [1.0, 1.1, 0.9, 1.0, 1.05] })!;
    expect(r.lowV).toBeGreaterThanOrEqual(1.5 * 0.4 * 0.999); // 0.6
    expect(r.highV).toBeGreaterThanOrEqual(0.8); // ≥ 2× jitter…
    expect(r.highV).toBeCloseTo(1.0, 6); // …raised to lowV / 0.6
    expect(r.lowV).toBeLessThanOrEqual(0.6 * r.highV + 1e-9);
  });
  it("a slow thumb-first thrower: HIGH_V drops toward the floor of the range, never below it", () => {
    const r = fitVelocity({ jitterP95: 0.05, throwPeaks: [0.5, 0.55, 0.45, 0.6, 0.5] })!;
    expect(r.highV).toBeGreaterThanOrEqual(HIGH_V_RANGE[0]);
    expect(r.highV).toBeCloseTo(Math.max(HIGH_V_RANGE[0], Math.min(0.7 * 0.45, 0.45 * 0.5)), 6);
  });
  it("clamps into the validated range on both ends", () => {
    const hot = fitVelocity({ jitterP95: 2, throwPeaks: [9, 9, 9, 9] })!;
    expect(hot.highV).toBe(HIGH_V_RANGE[1]);
    expect(hot.lowV).toBeLessThanOrEqual(LOW_V_RANGE[1]);
    const cold = fitVelocity({ jitterP95: 0.001, throwPeaks: [0.05, 0.05, 0.05, 0.05] })!;
    expect(cold.highV).toBe(HIGH_V_RANGE[0]);
    expect(cold.lowV).toBeGreaterThanOrEqual(LOW_V_RANGE[0]);
  });
  it("LOW_V always leaves the FSM room to settle: ≤ 60% of HIGH_V", () => {
    for (const j of [0.02, 0.1, 0.3, 0.6]) {
      const r = fitVelocity({ jitterP95: j, throwPeaks: [1, 1, 1, 1, 1] })!;
      expect(r.lowV).toBeLessThanOrEqual(0.6 * r.highV + 1e-9);
    }
  });
  it(`refuses with fewer than ${MIN_THROWS} throws or a bad jitter`, () => {
    expect(fitVelocity({ jitterP95: 0.1, throwPeaks: [1, 1, 1] })).toBeNull();
    expect(fitVelocity({ jitterP95: NaN, throwPeaks: [1, 1, 1, 1] })).toBeNull();
    expect(fitVelocity({ jitterP95: 0.1, throwPeaks: [0, -1, NaN, 1, 1] })).toBeNull(); // only 2 valid
  });
});

describe("calibration fit: voice (vadMult)", () => {
  it("jani's near-silent room (floor 0.00005) is judged against the worklet's 0.015 floor: ~5.3, not the 12 cap", () => {
    const r = fitVoice(JANI)!;
    expect(r.vadMult).toBeCloseTo(Math.sqrt(0.42032225496145786 / LIVE_VAD_FLOOR_MIN), 3);
    expect(r.vadMult).toBeLessThan(VAD_MULT_RANGE[1]);
  });
  it("a 36× shout over an audible room floor lands on the spike's 6", () => {
    expect(fitVoice({ ambientFloor: 0.02, shoutPeaks: [0.72, 0.72, 0.72] })!.vadMult).toBeCloseTo(6, 6);
  });
  it("a quiet shouter gets a lower multiplier; a loud one higher; both clamped", () => {
    expect(fitVoice({ ambientFloor: 0.02, shoutPeaks: [0.2, 0.2, 0.2] })!.vadMult).toBeCloseTo(Math.sqrt(10), 6);
    expect(fitVoice({ ambientFloor: 0.02, shoutPeaks: [1.8, 1.8, 1.8] })!.vadMult).toBeCloseTo(Math.sqrt(90), 6);
    expect(fitVoice({ ambientFloor: 0.02, shoutPeaks: [5, 5, 5] })!.vadMult).toBe(VAD_MULT_RANGE[1]);
    expect(fitVoice({ ambientFloor: 0.5, shoutPeaks: [0.6, 0.6, 0.6] })!.vadMult).toBe(VAD_MULT_RANGE[0]);
  });
  it("uses the MEDIAN shout — one weak call doesn't drag it", () => {
    const strong = fitVoice({ ambientFloor: 0.02, shoutPeaks: [0.72, 0.72, 0.72, 0.72, 0.02] })!.vadMult;
    expect(strong).toBeCloseTo(6, 6);
  });
  it(`refuses with fewer than ${MIN_SHOUTS} shouts, a negative floor, or a shout not above the (effective) floor`, () => {
    expect(fitVoice({ ambientFloor: 0.01, shoutPeaks: [0.3, 0.3] })).toBeNull();
    expect(fitVoice({ ambientFloor: -1, shoutPeaks: [0.3, 0.3, 0.3] })).toBeNull();
    expect(fitVoice({ ambientFloor: 0.5, shoutPeaks: [0.3, 0.3, 0.3] })).toBeNull();
    expect(fitVoice({ ambientFloor: 0, shoutPeaks: [0.01, 0.01, 0.01] })).toBeNull(); // under 0.015
  });
  it("FIT_VERSION is 2 (weakest-throw HIGH_V; floored voice ratio)", () => {
    expect(FIT_VERSION).toBe(2);
  });
});

describe("calibration fit: fitAll merges over current values", () => {
  it("a fit that can't be made leaves that value untouched and reports it", () => {
    const { values, fitted } = fitAll(APP_DEFAULTS, { jitterP95: 0.1, throwPeaks: [1, 1] }, { ambientFloor: 0.02, shoutPeaks: [0.72, 0.72, 0.72] });
    expect(fitted).toEqual({ velocity: false, voice: true });
    expect(values.highV).toBe(APP_DEFAULTS.highV);
    expect(values.lowV).toBe(APP_DEFAULTS.lowV);
    expect(values.vadMult).toBeCloseTo(6, 6);
  });
  it("null samples mean nothing fitted", () => {
    const { values, fitted } = fitAll(APP_DEFAULTS, null, null);
    expect(values).toEqual(APP_DEFAULTS);
    expect(fitted).toEqual({ velocity: false, voice: false });
  });
});
