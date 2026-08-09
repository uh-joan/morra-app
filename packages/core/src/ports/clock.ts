// Clock port — the only source of "now" any core code may consult. None of
// the six ported modules (rules/commit/scorer/ai/playermodel/mirror) call a
// clock directly today; every timestamp they touch (handOnsetPerfTime,
// voiceOnsetPerfTime, ...) is supplied by the CALLER as a plain number. This
// port exists now because the plan's later phases (src/match, src/tempo,
// src/telemetry) need it, and because "define Clock/RandomSource/
// TelemetrySink/PlayerModelStore" is the M1 scaffolding ask — wiring it into
// actual timing logic is out of scope until those phases land.
export interface Clock {
  /** Monotonic milliseconds — the pure-core equivalent of performance.now(). */
  now(): number;
}
