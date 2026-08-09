import { describe, expect, it } from "vitest";
import { findEnergyOnsetInBuffer } from "../../src/voice/onset.js";

const SAMPLE_RATE = 16000;

// Builds a Float32Array from constant-amplitude segments — RMS of a
// constant-value block equals the amplitude itself, so this gives exact,
// predictable energy levels per segment without needing real audio.
function makeBuffer(segments: { amp: number; durationMs: number }[]): Float32Array {
  const lengths = segments.map((s) => Math.round((s.durationMs / 1000) * SAMPLE_RATE));
  const buf = new Float32Array(lengths.reduce((a, b) => a + b, 0));
  let idx = 0;
  segments.forEach((seg, i) => {
    for (let j = 0; j < lengths[i]!; j++) buf[idx++] = seg.amp;
  });
  return buf;
}

describe("onset: findEnergyOnsetInBuffer — basic detection", () => {
  it("pure silence -> no onset", () => {
    const buf = makeBuffer([{ amp: 0, durationMs: 500 }]);
    expect(findEnergyOnsetInBuffer(buf, SAMPLE_RATE)).toBeNull();
  });

  it("a sustained loud region well into the buffer -> onset at its start, preWindow=false", () => {
    const buf = makeBuffer([{ amp: 0, durationMs: 160 }, { amp: 0.5, durationMs: 160 }]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE)!;
    expect(r).not.toBeNull();
    expect(r.onsetMs).toBeCloseTo(160, 0);
    expect(r.preWindow).toBe(false);
  });

  it("energy already loud at the very start of the buffer -> preWindow=true, onsetMs=0", () => {
    const buf = makeBuffer([{ amp: 0.5, durationMs: 300 }]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE)!;
    expect(r).not.toBeNull();
    expect(r.onsetMs).toBe(0);
    expect(r.preWindow).toBe(true);
  });

  it("a brief loud blip shorter than sustainMs is NOT reported as an onset", () => {
    // 24ms loud (well under the default 60ms sustain requirement) then back to silence
    const buf = makeBuffer([{ amp: 0, durationMs: 160 }, { amp: 0.5, durationMs: 24 }, { amp: 0, durationMs: 200 }]);
    expect(findEnergyOnsetInBuffer(buf, SAMPLE_RATE)).toBeNull();
  });

  it("a custom sustainMs is honored (a blip that clears a SHORTER sustain requirement fires)", () => {
    const buf = makeBuffer([{ amp: 0, durationMs: 160 }, { amp: 0.5, durationMs: 24 }, { amp: 0, durationMs: 200 }]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE, { sustainMs: 10 })!;
    expect(r).not.toBeNull();
    expect(r.onsetMs).toBeCloseTo(160, 0);
  });
});

describe("onset: findEnergyOnsetInBuffer — exclusion band (click suppression)", () => {
  it("suppresses an onset landing inside the exclude band, finding nothing else", () => {
    const buf = makeBuffer([{ amp: 0, durationMs: 160 }, { amp: 0.5, durationMs: 160 }]);
    // the onset would land at ~160ms — exclude a band covering it
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE, { excludeStartMs: 100, excludeEndMs: 220 });
    expect(r).toBeNull();
  });

  it("suppresses the excluded onset but keeps scanning and finds a LATER real one", () => {
    const buf = makeBuffer([
      { amp: 0, durationMs: 40 },
      { amp: 0.5, durationMs: 80 }, // "our own click" region — will be excluded
      { amp: 0, durationMs: 40 },
      { amp: 0.5, durationMs: 160 }, // the real shout, well after the excluded band
    ]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE, { excludeStartMs: 30, excludeEndMs: 130 })!;
    expect(r).not.toBeNull();
    expect(r.onsetMs).toBeGreaterThan(130);
    expect(r.preWindow).toBe(false);
  });

  it("the pre-window (t=0) case is ALSO exclusion-band-aware", () => {
    const buf = makeBuffer([{ amp: 0.5, durationMs: 300 }]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE, { excludeStartMs: 0, excludeEndMs: 50 });
    // excluded at t=0, and (per the spike's own behavior) the main loop's
    // re-scan doesn't retroactively re-examine the already-consumed
    // pre-window region as a fresh "wasAbove=false" transition — matches
    // findEnergyOnsetInBuffer's documented preWindow special-case exactly.
    expect(r).toBeNull();
  });
});

describe("onset: findEnergyOnsetInBuffer — noise floor adaptation", () => {
  it("a mildly elevated ambient floor (still under floorMin) doesn't false-trigger, and a real shout still fires", () => {
    // ambient noise stays below the starting threshold (floorMin=0.015) so
    // it's correctly absorbed into the adapting noise floor rather than
    // itself registering as "above" (which would otherwise fire an onset
    // at t=0 and stop the floor from ever adapting — above-gated updates).
    const buf = makeBuffer([{ amp: 0.01, durationMs: 300 }, { amp: 0.5, durationMs: 160 }]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE, { floorCap: 0.1 })!;
    expect(r).not.toBeNull();
    // block-quantized (8ms blocks @ 16kHz): the reported onset lands at the
    // START of whichever 128-sample block first crosses threshold, which
    // can be up to one block-width before the exact 300ms transition.
    expect(Math.abs(r.onsetMs - 300)).toBeLessThan(10);
  });

  it("ambient noise loud enough to clear floorMin on its own IS itself reported (by design — the caller's floorCap/vadMult tuning governs this tradeoff)", () => {
    const buf = makeBuffer([{ amp: 0.05, durationMs: 300 }]);
    const r = findEnergyOnsetInBuffer(buf, SAMPLE_RATE)!;
    expect(r).not.toBeNull(); // documents the real behavior rather than assuming a different one
  });
});
