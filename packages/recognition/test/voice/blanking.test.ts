import { describe, expect, it } from "vitest";
import { blankExclusionRegions } from "../../src/voice/blanking.js";

const SR = 16000;

describe("blanking: blankExclusionRegions", () => {
  it("zeroes exactly the overlap region — clip fully inside the window", () => {
    const samples = new Float32Array(SR).fill(1); // 1s of buffer @ SR
    const { samples: out, blankedMs } = blankExclusionRegions(samples, SR, 10.0, 11.0, [{ startCtxTime: 10.3, endCtxTime: 10.5, }]);
    const startIdx = Math.round(0.3 * SR), endIdx = Math.round(0.5 * SR);
    let allZero = true, allOneBefore = true, allOneAfter = true;
    for (let i = startIdx; i < endIdx; i++) if (out[i] !== 0) allZero = false;
    for (let i = 0; i < startIdx; i++) if (out[i] !== 1) allOneBefore = false;
    for (let i = endIdx; i < out.length; i++) if (out[i] !== 1) allOneAfter = false;
    expect(allZero && allOneBefore && allOneAfter).toBe(true);
    expect(blankedMs).toBeCloseTo(200, 0);
  });

  it("does not mutate the input array", () => {
    const samples = new Float32Array(100).fill(1);
    blankExclusionRegions(samples, SR, 0, 100 / SR, [{ startCtxTime: 0, endCtxTime: 100 / SR }]);
    expect(samples[0]).toBe(1);
  });

  it("no overlap -> nothing blanked", () => {
    const samples = new Float32Array(100).fill(1);
    const { samples: out, blankedMs } = blankExclusionRegions(samples, SR, 10.0, 10.01, [{ startCtxTime: 20, endCtxTime: 21 }]);
    expect(blankedMs).toBe(0);
    expect(out.every((v) => v === 1)).toBe(true);
  });

  it("window fully INSIDE a longer exclusion region -> the entire window is blanked", () => {
    const samples = new Float32Array(Math.round(SR * 0.5)).fill(1);
    const { samples: out, blankedMs } = blankExclusionRegions(samples, SR, 0.5, 1.0, [{ startCtxTime: 0, endCtxTime: 2 }]);
    expect(blankedMs).toBeCloseTo(500, 0);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it("exclusion region trailing INTO the window's start (opens mid-region) -> only the overlap blanked", () => {
    const samples = new Float32Array(SR).fill(1);
    const { blankedMs } = blankExclusionRegions(samples, SR, 1.0, 2.0, [{ startCtxTime: 0.5, endCtxTime: 1.3 }]);
    expect(blankedMs).toBeCloseTo(300, 0);
  });

  it("exclusion region starting INSIDE the window and running past its end -> only the overlap blanked", () => {
    const samples = new Float32Array(SR).fill(1);
    const { blankedMs } = blankExclusionRegions(samples, SR, 0, 1.0, [{ startCtxTime: 0.8, endCtxTime: 1.6 }]);
    expect(blankedMs).toBeCloseTo(200, 0);
  });

  it("multiple non-overlapping exclusion regions all get blanked", () => {
    const samples = new Float32Array(SR).fill(1);
    const { blankedMs } = blankExclusionRegions(samples, SR, 0, 1.0, [
      { startCtxTime: 0.1, endCtxTime: 0.2 },
      { startCtxTime: 0.5, endCtxTime: 0.7 },
    ]);
    expect(blankedMs).toBeCloseTo(300, 0);
  });

  it("null/empty samples, window, or exclusions -> no-op, no crash", () => {
    expect(blankExclusionRegions(null, SR, 0, 1, [{ startCtxTime: 0, endCtxTime: 1 }]).blankedMs).toBe(0);
    expect(blankExclusionRegions(new Float32Array(10), SR, null, 1, [{ startCtxTime: 0, endCtxTime: 1 }]).blankedMs).toBe(0);
    expect(blankExclusionRegions(new Float32Array(10), SR, 0, 1, []).blankedMs).toBe(0);
    expect(blankExclusionRegions(new Float32Array(10), SR, 0, 1, null).blankedMs).toBe(0);
  });
});
