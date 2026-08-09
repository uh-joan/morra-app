// clockTracker.ts — ClockTracker is spikes/s03-beat.html's ClockMap class
// (refresh/toPerformanceTime/toContextTime/armBaseline/recordDriftSample,
// plus outputLatencyEstimate) ported near-verbatim, decoupled from the
// concrete AudioContext type via the minimal ClockCapableContext structural
// interface below. That decoupling is the one deliberate shape change: it
// makes this class's state machine unit-testable under plain vitest/node
// with a fake context, without needing a real Web Audio API — the spike's
// version was only ever exercisable inside a real browser tab.
import { mapContextToPerformance, mapPerformanceToContext, type ClockSample } from "./clockMapping.js";

export interface ClockCapableContext {
  readonly baseLatency?: number;
  readonly outputLatency?: number;
  getOutputTimestamp?(): { contextTime?: number; performanceTime?: number };
}

export interface DriftSample {
  elapsedMs: number;
  driftMs: number;
}

export class ClockTracker {
  private sample: ClockSample | null = null;
  private baseline: ClockSample | null = null;
  readonly history: DriftSample[] = [];

  constructor(private readonly ctx: ClockCapableContext) {}

  refresh(): ClockSample | null {
    if (typeof this.ctx.getOutputTimestamp !== "function") return null;
    const ts = this.ctx.getOutputTimestamp();
    if (ts && typeof ts.contextTime === "number" && typeof ts.performanceTime === "number") {
      const sample: ClockSample = { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
      this.sample = sample;
      if (!this.baseline) this.baseline = sample;
      return sample;
    }
    return null;
  }

  toPerformanceTime(contextTime: number): number | null {
    if (!this.sample) this.refresh();
    return mapContextToPerformance(this.sample, contextTime);
  }

  // Inverse of toPerformanceTime — the spike needed this because hand onsets
  // are timestamped on the performance.now() timeline (MediaPipe rVFC) but
  // the VAD ring buffer lives on the AudioContext clock; platform-web keeps
  // the same capability for whatever downstream sync logic needs it next.
  toContextTime(performanceTimeMs: number): number | null {
    if (!this.sample) this.refresh();
    if (!this.sample) return null;
    return mapPerformanceToContext(this.sample, performanceTimeMs);
  }

  /** Resets the drift baseline and re-samples immediately — this is the
   * "re-mapping on resume" the M3 dispatch asks for: call after resume() or
   * after the tab becomes visible again, since a stale sample from before a
   * suspend/background period no longer reflects the real clock offset. */
  armBaseline(): void {
    this.baseline = null;
    this.refresh();
  }

  recordDriftSample(): DriftSample | null {
    if (typeof this.ctx.getOutputTimestamp !== "function" || !this.baseline) return null;
    const raw = this.ctx.getOutputTimestamp();
    if (typeof raw.contextTime !== "number" || typeof raw.performanceTime !== "number") return null;
    const ts: ClockSample = { contextTime: raw.contextTime, performanceTime: raw.performanceTime };
    const predicted = mapContextToPerformance(this.baseline, ts.contextTime)!;
    const driftMs = ts.performanceTime - predicted;
    const elapsedMs = ts.performanceTime - this.baseline.performanceTime;
    const point: DriftSample = { elapsedMs, driftMs };
    this.history.push(point);
    this.sample = ts;
    return point;
  }

  /** Ported verbatim from spikes/s03-beat.html's outputLatencyEstimate(). */
  outputLatencyEstimate(): number {
    if (typeof this.ctx.outputLatency === "number") return this.ctx.outputLatency;
    if (typeof this.ctx.baseLatency === "number") return this.ctx.baseLatency;
    return 0;
  }

  get currentSample(): ClockSample | null {
    return this.sample;
  }
}
