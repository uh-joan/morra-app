import { describe, expect, it } from "vitest";
import { PerformanceClock } from "../../src/ports/performanceClock.js";

describe("PerformanceClock", () => {
  it("now() returns performance.now() at call time", () => {
    const clock = new PerformanceClock();
    const before = performance.now();
    const t = clock.now();
    const after = performance.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});
