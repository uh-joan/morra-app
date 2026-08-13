// telemetry.ts — ports spikes/s03-beat.html L996–1033 (Phase D structured
// event log: one bus, two sinks) plus the capped debug arrays from L979–986.
// Sink A: capped in-memory eventBusLog, folded into the debug export.
// Sink B: batched NDJSON POSTed to /log every 2s, plus a best-effort
// sendBeacon flush on tab-hide/unload — spikes/serve.py appends these to
// spikes/logs/session-<sessionId>.ndjson (Vite dev proxies /log to :8080).
// Silent failure (console.warn only) if the collector isn't running;
// gameplay never depends on it.

import { DEBUG_LOG_CAP, DEBUG_ORPHAN_CAP, EVENT_BUS_CAP } from "./config.js";

export interface TelemetryEvent {
  sessionId: string;
  seq: number;
  tPerf: number;
  type: string;
  [key: string]: unknown;
}

export const LOG_SESSION_ID: string = (() => {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
})();

let logSeq = 0;
export const eventBusLog: TelemetryEvent[] = []; // Sink A: capped in-memory mirror of every event, in order
let pendingLogBatch: TelemetryEvent[] = []; // Sink B: events not yet flushed to the server

export function logEvent(type: string, payload?: Record<string, unknown>): TelemetryEvent {
  const evt: TelemetryEvent = Object.assign(
    { sessionId: LOG_SESSION_ID, seq: logSeq++, tPerf: performance.now(), type },
    payload || {}
  );
  eventBusLog.push(evt);
  if (eventBusLog.length > EVENT_BUS_CAP) eventBusLog.shift();
  pendingLogBatch.push(evt);
  return evt;
}

function flushLogBatch(useBeacon: boolean): void {
  if (!pendingLogBatch.length) return;
  const body = pendingLogBatch.map((e) => JSON.stringify(e)).join("\n") + "\n";
  pendingLogBatch = [];
  if (useBeacon && navigator.sendBeacon) {
    try {
      const ok = navigator.sendBeacon("/log", new Blob([body], { type: "application/x-ndjson" }));
      if (!ok) console.warn("event log: sendBeacon was refused (queue full?)");
    } catch (err) {
      console.warn("event log: sendBeacon failed:", err);
    }
    return;
  }
  fetch("/log", { method: "POST", headers: { "Content-Type": "application/x-ndjson" }, body }).catch((err) =>
    console.warn("event log: POST /log failed (log collector not running?) —", err?.message ?? err)
  );
}

export function installTelemetryFlushing(): void {
  setInterval(() => flushLogBatch(false), 2000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLogBatch(true);
  });
  window.addEventListener("beforeunload", () => flushLogBatch(true));
}

// Capped debug arrays (spike L980–982): one debugLog entry per finalized
// throw, plus onsets that matched no throw ("that silence is exactly what
// hides window-clipping bugs"). Both are folded into the debug export.
export const debugLog: object[] = [];
export const debugOrphanOnsets: object[] = [];

export function pushDebugLog(entry: object): void {
  debugLog.push(entry);
  if (debugLog.length > DEBUG_LOG_CAP) debugLog.shift();
}

export function recordOrphanOnset(entry: object): void {
  debugOrphanOnsets.push(entry);
  if (debugOrphanOnsets.length > DEBUG_ORPHAN_CAP) debugOrphanOnsets.shift();
}
