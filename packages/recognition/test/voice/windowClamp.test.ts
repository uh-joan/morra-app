import { describe, expect, it } from "vitest";
import { clampWindowStart } from "../../src/voice/windowClamp.js";

describe("windowClamp: clampWindowStart", () => {
  it("no prior known audio -> no clamp, full preMs kept", () => {
    const r = clampWindowStart(100.0, 400, null);
    expect(r.clampedToPrevRound).toBe(false);
    expect(r.clampedPreMs).toBe(400);
    expect(r.clampedStartCtxTime).toBeCloseTo(99.6, 9);
  });

  it("prior audio ends after the naive window start -> clamps", () => {
    const r = clampWindowStart(100.0, 400, 99.8); // naive start would be 99.6
    expect(r.clampedToPrevRound).toBe(true);
    expect(r.clampedPreMs).toBeCloseTo(200, 6);
    expect(r.clampedStartCtxTime).toBeCloseTo(99.8, 9);
  });

  it("prior audio ends after the anchor itself -> preMs clamps to 0, never negative", () => {
    const r = clampWindowStart(100.0, 400, 100.5);
    expect(r.clampedToPrevRound).toBe(true);
    expect(r.clampedPreMs).toBe(0);
    expect(r.clampedStartCtxTime).toBe(100.0);
  });

  it("prior audio ends exactly at the naive start -> boundary, no clamp", () => {
    const r = clampWindowStart(100.0, 400, 99.6);
    expect(r.clampedToPrevRound).toBe(false);
  });
});
