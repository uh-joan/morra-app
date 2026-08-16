import { describe, expect, it } from "vitest";
import { preOnsetFingerCount, PRE_ONSET_WINDOW_MS } from "../../src/game/preOnset.js";

// Frame history as the camera keeps it: {t, count} per detected-hand frame,
// ~33ms apart. motionStart is where the velocity FSM said the throw began.
const frames = (counts: number[], t0 = 1000, dt = 33) => counts.map((count, i) => ({ t: t0 + i * dt, count }));

describe("preOnsetFingerCount — the resting count before a motion began", () => {
  it("throw of one from a fist: the fist read 0 → pre-onset 0", () => {
    // 6 frames of fist, then motion starts at t=1198 (after the 6th frame)
    expect(preOnsetFingerCount(frames([0, 0, 0, 0, 0, 0]), 1198)).toBe(0);
  });
  it("throw of one from a fist that READS 1 (thumb alongside) → pre-onset 1", () => {
    expect(preOnsetFingerCount(frames([1, 1, 1, 1, 1, 1]), 1198)).toBe(1);
  });
  it("retraction: hand held at 3, then motion → pre-onset 3 (this is the 73% case)", () => {
    expect(preOnsetFingerCount(frames([3, 3, 3, 3, 3, 3]), 1198)).toBe(3);
  });
  it("median, not mean: a single flicker frame does not move it", () => {
    expect(preOnsetFingerCount(frames([3, 3, 2, 3, 3, 3]), 1198)).toBe(3);
    expect(preOnsetFingerCount(frames([0, 0, 2, 0, 0, 0]), 1198)).toBe(0);
  });
  it("only frames INSIDE the window before motionStart count", () => {
    // 20 frames of 4, then 8 frames of 0 (the fist), motion starts after
    const h = [...frames(Array(20).fill(4), 0), ...frames(Array(8).fill(0), 660)];
    const motionStart = 660 + 8 * 33; // 924; window = [724, 924) → only the fist frames
    expect(preOnsetFingerCount(h, motionStart)).toBe(0);
  });
  it("frames AT or after motionStart are ignored (they're the throw, not the rest)", () => {
    const h = [...frames([0, 0, 0, 0], 1000), ...frames([3, 3, 3], 1132)];
    expect(preOnsetFingerCount(h, 1132)).toBe(0);
  });
  it("unknown when fewer than 2 frames precede the motion (hand entered mid-motion, fake camera)", () => {
    expect(preOnsetFingerCount([], 1000)).toBeNull();
    expect(preOnsetFingerCount(frames([0]), 1033)).toBeNull();
    expect(preOnsetFingerCount(frames([0, 0]), 1066)).toBe(0);
  });
  it("unknown when there is no motionStart to anchor on", () => {
    expect(preOnsetFingerCount(frames([0, 0, 0]), null)).toBeNull();
  });
  it("window is 200ms — short of the 0.87s median throw→retraction gap", () => {
    expect(PRE_ONSET_WINDOW_MS).toBe(200);
  });
});
