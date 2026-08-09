// fakeClock.ts — the test-mode seam for @morra/core's Clock port. Manual
// advance rather than wall-clock time, so tests get deterministic,
// replayable timing (same motivation as core's createSeededRandomSource/
// createSequenceRandomSource for RandomSource).
import type { Clock } from "@morra/core";

export class FakeClock implements Clock {
  private t: number;

  constructor(startMs = 0) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): void {
    this.t += ms;
  }

  set(ms: number): void {
    this.t = ms;
  }
}
