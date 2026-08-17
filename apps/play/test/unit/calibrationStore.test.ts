import { describe, expect, it } from "vitest";
import {
  calibrationKeyFor,
  deviceKeyFrom,
  emptyBlob,
  normalizeBlob,
  recordFor,
  withoutRecord,
  withRecord,
  type CalibrationRecord,
} from "../../src/calibration/store.js";

const rec = (highV: number): CalibrationRecord => ({
  values: { highV, lowV: 0.2, vadMult: 5 },
  measuredAt: "2026-08-17T00:00:00.000Z",
  samples: { jitterP95: 0.1, throwPeaks: [1, 1, 1, 1], ambientFloor: 0.01, shoutPeaks: [0.3, 0.3, 0.3], prompts: [] },
});

describe("calibration store: keys", () => {
  it("one storage key per profile", () => {
    expect(calibrationKeyFor("default")).toBe("morra-calibration-v1:default");
    expect(calibrationKeyFor("pm123")).toBe("morra-calibration-v1:pm123");
  });
  it("device key = short deviceId @ resolution; separates a laptop from a phone camera", () => {
    expect(deviceKeyFrom({ deviceId: "abcdef1234567890xyz", width: 480, height: 360 })).toBe("abcdef123456@480x360");
    expect(deviceKeyFrom({ width: 1280, height: 720 })).toBe("nodev@1280x720");
    expect(deviceKeyFrom(null)).toBe("unknown");
    expect(deviceKeyFrom({ deviceId: "same", width: 480, height: 360 })).not.toBe(deviceKeyFrom({ deviceId: "same", width: 1280, height: 720 }));
  });
});

describe("calibration store: blob", () => {
  it("records are per device inside a profile's blob; immutably added/removed", () => {
    const b1 = withRecord(emptyBlob(), "lap@480x360", rec(0.5));
    const b2 = withRecord(b1, "phone@1280x720", rec(0.8));
    expect(recordFor(b2, "lap@480x360")!.values.highV).toBe(0.5);
    expect(recordFor(b2, "phone@1280x720")!.values.highV).toBe(0.8);
    expect(recordFor(b2, "other")).toBeNull();
    expect(recordFor(b1, "phone@1280x720")).toBeNull(); // b1 untouched
    const b3 = withoutRecord(b2, "lap@480x360");
    expect(recordFor(b3, "lap@480x360")).toBeNull();
    expect(recordFor(b3, "phone@1280x720")).not.toBeNull();
  });
  it("normalizeBlob drops junk and records with non-numeric values, keeps the good ones", () => {
    const raw = { version: 1, byDevice: { good: rec(0.5), bad: { values: { highV: "x" } }, worse: null } };
    const b = normalizeBlob(raw);
    expect(Object.keys(b.byDevice)).toEqual(["good"]);
    expect(normalizeBlob(null)).toEqual(emptyBlob());
    expect(normalizeBlob({ version: 2, byDevice: {} })).toEqual(emptyBlob());
    expect(normalizeBlob("nope")).toEqual(emptyBlob());
  });
});

import { appendSession, pooledSamples, POOL_SESSIONS, type SessionSamples } from "../../src/calibration/store.js";
import { fitVelocity } from "../../src/calibration/fit.js";

const sess = (peaks: number[], jitter: number, floor = 0.001): SessionSamples => ({ jitterP95: jitter, throwPeaks: peaks, ambientFloor: floor, shoutPeaks: [0.4, 0.4, 0.4], prompts: [] });

describe("calibration store: pooling sessions", () => {
  it("pooled = union of peaks, LARGEST jitter, latest floor, session count", () => {
    const p = pooledSamples({ samples: sess([1, 2], 0.2, 0.05), history: [sess([0.6, 3], 0.1, 0.001), sess([1, 2], 0.2, 0.05)] });
    expect(p.throwPeaks).toEqual([0.6, 3, 1, 2]);
    expect(p.jitterP95).toBe(0.2);
    expect(p.ambientFloor).toBe(0.05);
    expect(p.sessions).toBe(2);
  });
  it("an old record without history pools as one session (its own samples)", () => {
    const p = pooledSamples({ samples: sess([0.6, 3], 0.1) });
    expect(p.throwPeaks).toEqual([0.6, 3]);
    expect(p.sessions).toBe(1);
  });
  it(`appendSession keeps the last ${POOL_SESSIONS}, this one last`, () => {
    let hist: SessionSamples[] = [];
    let prev: { samples: SessionSamples; history?: SessionSamples[] } | null = null;
    for (let i = 0; i < POOL_SESSIONS + 3; i++) {
      const s = sess([i], 0.1);
      hist = appendSession(prev as never, s);
      prev = { samples: s, history: hist };
    }
    expect(hist.length).toBe(POOL_SESSIONS);
    expect(hist[hist.length - 1]!.throwPeaks).toEqual([POOL_SESSIONS + 2]);
  });
  it("jani's three real sessions pooled: HIGH_V follows the WEAKEST thumb-1 across them, not this session's luck", () => {
    // thumb-1 peaked 0.58 / 0.54 / 0.73 → per-session HIGH_V would be 0.40 / 0.38 / 0.51
    const s1 = sess([1.168, 0.576, 1.797, 2.483, 4.501], 0.111);
    const s2 = sess([1.124, 0.539, 2.139, 0.832, 3.355], 0.156);
    const s3 = sess([1.729, 0.728, 3.959, 0.791, 3.580], 0.080);
    const alone = fitVelocity({ jitterP95: 0.08, throwPeaks: s3.throwPeaks })!;
    expect(alone.highV).toBeCloseTo(0.7 * 0.728, 3); // 0.51 — would miss a 0.54 thumb-1
    const pooled = pooledSamples({ samples: s3, history: [s1, s2, s3] });
    const r = fitVelocity({ jitterP95: pooled.jitterP95!, throwPeaks: pooled.throwPeaks })!;
    // 0.7×0.539 = 0.377, but the worst resting day (jitter 0.156) forces
    // LOW_V to 0.234 and the settle rule lifts HIGH_V to 0.234/0.6 = 0.39 —
    // still under every thumb-1 seen (0.539) with ~28% headroom.
    expect(pooled.jitterP95).toBe(0.156);
    expect(r.highV).toBeCloseTo(Math.max(0.7 * 0.539, (1.5 * 0.156) / 0.6), 3);
    expect(r.highV).toBeLessThan(0.539 * 0.8);
  });
});
