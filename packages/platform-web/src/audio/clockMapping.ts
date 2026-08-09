// clockMapping.ts — the PURE contextTime<->performanceTime arithmetic from
// spikes/s03-beat.html's ClockMap class (mapContextToPerformance and its
// inverse), pulled out as standalone functions so they're unit-testable
// without any AudioContext at all. Ported verbatim: same formula, same
// null-sample handling. See clockTracker.ts for the stateful wrapper that
// matches ClockMap's actual class shape.

export interface ClockSample {
  contextTime: number;
  performanceTime: number;
}

/** Ported verbatim from spikes/s03-beat.html's mapContextToPerformance. */
export function mapContextToPerformance(sample: ClockSample | null, contextTime: number): number | null {
  if (!sample) return null;
  return sample.performanceTime + (contextTime - sample.contextTime) * 1000;
}

/** Inverse mapping — ported verbatim from spikes/s03-beat.html's
 * ClockMap.toContextTime body (the null-sample guard lived on the method
 * there; kept here since this is now the pure home for that arithmetic). */
export function mapPerformanceToContext(sample: ClockSample | null, performanceTimeMs: number): number | null {
  if (!sample) return null;
  return sample.contextTime + (performanceTimeMs - sample.performanceTime) / 1000;
}
