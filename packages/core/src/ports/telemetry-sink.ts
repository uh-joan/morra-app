// TelemetrySink port — scaffolding for the plan's src/telemetry/
// LatencyRecorder phase (not yet built). None of the six ported modules
// emit telemetry directly today (the spike's logEvent bus lives in the page,
// outside modules/); defined now per the M1 ports-scaffolding ask so later
// phases (fusion, tempo, fairness replay) have a stable interface to target.
export interface TelemetryEvent {
  type: string;
  atMs: number; // Clock-sourced, not ambient — callers stamp this via the Clock port
  [key: string]: unknown;
}

export interface TelemetrySink {
  emit(event: TelemetryEvent): void;
}
