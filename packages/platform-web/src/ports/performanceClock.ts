// performanceClock.ts — the web implementation of @morra/core's Clock port.
// Core's own doc for Clock.now() spells this out directly: "the pure-core
// equivalent of performance.now()" — so this is a one-line adapter, not a
// port of any spike logic.
import type { Clock } from "@morra/core";

export class PerformanceClock implements Clock {
  now(): number {
    return performance.now();
  }
}
