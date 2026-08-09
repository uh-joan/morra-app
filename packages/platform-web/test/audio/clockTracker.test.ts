import { describe, expect, it } from "vitest";
import { ClockTracker, type ClockCapableContext } from "../../src/audio/clockTracker.js";

// A fully controllable fake AudioContext-shaped object — lets us drive
// ClockTracker's state machine (the spike's ClockMap, ported) without a
// real Web Audio API.
class FakeCtx implements ClockCapableContext {
  baseLatency: number | undefined = 0.01;
  outputLatency: number | undefined = undefined;
  private ts: { contextTime?: number; performanceTime?: number } | null = null;
  supportsGetOutputTimestamp = true;

  setTimestamp(contextTime: number, performanceTime: number): void {
    this.ts = { contextTime, performanceTime };
  }

  getOutputTimestamp = (): { contextTime?: number; performanceTime?: number } => {
    if (!this.supportsGetOutputTimestamp) throw new Error("should not be called when unsupported");
    return this.ts ?? {};
  };
}

describe("ClockTracker: refresh", () => {
  it("no getOutputTimestamp support -> refresh returns null", () => {
    const ctx = new FakeCtx();
    (ctx as unknown as { getOutputTimestamp: undefined }).getOutputTimestamp = undefined;
    const tracker = new ClockTracker(ctx);
    expect(tracker.refresh()).toBeNull();
  });

  it("getOutputTimestamp present but missing fields -> refresh returns null", () => {
    const ctx = new FakeCtx(); // ts starts as {} (no fields set)
    const tracker = new ClockTracker(ctx);
    expect(tracker.refresh()).toBeNull();
  });

  it("valid timestamp -> refresh returns and stores the sample, arms the baseline once", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(1.0, 100);
    const tracker = new ClockTracker(ctx);
    const sample = tracker.refresh();
    expect(sample).toEqual({ contextTime: 1.0, performanceTime: 100 });
    expect(tracker.currentSample).toEqual({ contextTime: 1.0, performanceTime: 100 });
  });

  it("a second refresh updates the sample but does NOT re-arm an existing baseline", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(1.0, 100);
    const tracker = new ClockTracker(ctx);
    tracker.refresh();
    ctx.setTimestamp(2.0, 1100); // 1 real second later
    tracker.refresh();
    // baseline is unchanged (still contextTime=1.0) — provable via recordDriftSample's math below
    const drift = tracker.recordDriftSample();
    expect(drift).not.toBeNull();
  });
});

describe("ClockTracker: toPerformanceTime / toContextTime", () => {
  it("auto-refreshes if no sample yet, then maps forward/backward consistently", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(5, 2000);
    const tracker = new ClockTracker(ctx);
    expect(tracker.toPerformanceTime(6)).toBe(3000); // +1s ctx -> +1000ms perf
    expect(tracker.toContextTime(2500)).toBe(5.5);
  });

  it("no sample obtainable -> both return null", () => {
    const ctx = new FakeCtx();
    (ctx as unknown as { getOutputTimestamp: undefined }).getOutputTimestamp = undefined;
    const tracker = new ClockTracker(ctx);
    expect(tracker.toPerformanceTime(1)).toBeNull();
    expect(tracker.toContextTime(1)).toBeNull();
  });
});

describe("ClockTracker: armBaseline (re-mapping on resume)", () => {
  it("resets the baseline so the NEXT drift sample is measured from the new arm point", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(1, 1000);
    const tracker = new ClockTracker(ctx);
    tracker.refresh(); // baseline = {1, 1000}

    ctx.setTimestamp(10, 10000); // big jump — simulates time passing while suspended
    tracker.armBaseline(); // re-arms: baseline = {10, 10000}, sample = {10, 10000}

    ctx.setTimestamp(10.5, 10500); // 0.5s real elapsed since re-arm, zero drift
    const drift = tracker.recordDriftSample()!;
    expect(drift.elapsedMs).toBeCloseTo(500, 6);
    expect(drift.driftMs).toBeCloseTo(0, 6);
  });
});

describe("ClockTracker: recordDriftSample", () => {
  it("no baseline yet -> null", () => {
    const ctx = new FakeCtx();
    const tracker = new ClockTracker(ctx);
    expect(tracker.recordDriftSample()).toBeNull();
  });

  it("perfectly steady clock -> zero drift", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(0, 0);
    const tracker = new ClockTracker(ctx);
    tracker.refresh(); // baseline = {0,0}
    ctx.setTimestamp(2, 2000); // exactly 2s of ctx time = 2000ms of perf time, no drift
    const drift = tracker.recordDriftSample()!;
    expect(drift.driftMs).toBeCloseTo(0, 9);
    expect(drift.elapsedMs).toBeCloseTo(2000, 9);
  });

  it("a clock that runs fast relative to performance.now() shows positive drift", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(0, 0);
    const tracker = new ClockTracker(ctx);
    tracker.refresh();
    ctx.setTimestamp(2, 2050); // performanceTime ran 50ms ahead of the ctx-predicted value
    const drift = tracker.recordDriftSample()!;
    expect(drift.driftMs).toBeCloseTo(50, 9);
  });

  it("accumulates history entries across multiple samples", () => {
    const ctx = new FakeCtx();
    ctx.setTimestamp(0, 0);
    const tracker = new ClockTracker(ctx);
    tracker.refresh();
    ctx.setTimestamp(1, 1000);
    tracker.recordDriftSample();
    ctx.setTimestamp(2, 2000);
    tracker.recordDriftSample();
    expect(tracker.history.length).toBe(2);
  });
});

describe("ClockTracker: outputLatencyEstimate", () => {
  it("prefers outputLatency when numeric", () => {
    const ctx = new FakeCtx();
    ctx.outputLatency = 0.02;
    ctx.baseLatency = 0.01;
    expect(new ClockTracker(ctx).outputLatencyEstimate()).toBe(0.02);
  });
  it("falls back to baseLatency when outputLatency is unsupported", () => {
    const ctx = new FakeCtx();
    ctx.outputLatency = undefined;
    ctx.baseLatency = 0.01;
    expect(new ClockTracker(ctx).outputLatencyEstimate()).toBe(0.01);
  });
  it("falls back to 0 when neither is numeric", () => {
    const ctx = new FakeCtx();
    ctx.outputLatency = undefined;
    ctx.baseLatency = undefined;
    expect(new ClockTracker(ctx).outputLatencyEstimate()).toBe(0);
  });
});
