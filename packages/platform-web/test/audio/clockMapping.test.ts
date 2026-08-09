import { describe, expect, it } from "vitest";
import { mapContextToPerformance, mapPerformanceToContext } from "../../src/audio/clockMapping.js";

describe("clockMapping: mapContextToPerformance", () => {
  it("null sample -> null", () => {
    expect(mapContextToPerformance(null, 5)).toBeNull();
  });
  it("maps a later contextTime forward to a later performanceTime, 1s -> 1000ms", () => {
    const sample = { contextTime: 10, performanceTime: 5000 };
    expect(mapContextToPerformance(sample, 11)).toBeCloseTo(6000, 9);
  });
  it("maps an earlier contextTime backward correctly", () => {
    const sample = { contextTime: 10, performanceTime: 5000 };
    expect(mapContextToPerformance(sample, 9.5)).toBeCloseTo(4500, 9);
  });
  it("at the sample point itself, returns performanceTime exactly", () => {
    const sample = { contextTime: 10, performanceTime: 5000 };
    expect(mapContextToPerformance(sample, 10)).toBe(5000);
  });
});

describe("clockMapping: mapPerformanceToContext", () => {
  it("null sample -> null", () => {
    expect(mapPerformanceToContext(null, 5000)).toBeNull();
  });
  it("is the inverse of mapContextToPerformance", () => {
    const sample = { contextTime: 10, performanceTime: 5000 };
    const perf = mapContextToPerformance(sample, 12.345)!;
    expect(mapPerformanceToContext(sample, perf)).toBeCloseTo(12.345, 9);
  });
  it("at the sample point itself, returns contextTime exactly", () => {
    const sample = { contextTime: 10, performanceTime: 5000 };
    expect(mapPerformanceToContext(sample, 5000)).toBe(10);
  });
});
