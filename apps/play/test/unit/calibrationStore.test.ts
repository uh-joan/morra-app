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
