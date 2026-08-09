// eventBusTelemetrySink.ts — the web implementation of @morra/core's
// TelemetrySink port, generalized from spikes/s03-beat.html's Phase D event
// bus (logEvent/flushLogBatch, s03-beat.html:995-1032): a capped in-memory
// mirror (Sink A) plus batched NDJSON POSTed to a configurable endpoint
// every flushIntervalMs, with a best-effort sendBeacon flush on
// visibilitychange/beforeunload (Sink B). Silent-degrade preserved exactly:
// a failed POST only console.warns — telemetry never blocks gameplay.
//
// The stamping/capping/serialization logic is pulled out as pure functions
// (stampEvent/appendCapped/toNdjson) below — the spike inlined this
// directly into logEvent/flushLogBatch; splitting it out makes it
// unit-testable without a DOM, same pattern as M2's onlineOnsetStep.ts
// extraction.
import type { TelemetryEvent, TelemetrySink } from "@morra/core";

export interface StampedEvent {
  sessionId: string;
  seq: number;
  atMs: number;
  type: string;
  [key: string]: unknown;
}

export function stampEvent(
  type: string,
  payload: Record<string, unknown> | undefined,
  sessionId: string,
  seq: number,
  atMs: number
): StampedEvent {
  return { sessionId, seq, atMs, type, ...(payload || {}) };
}

/** Never mutates the input log; drops from the front once over `cap` — same
 * as the spike's `if (eventBusLog.length > EVENT_BUS_CAP) eventBusLog.shift()`. */
export function appendCapped<T>(log: readonly T[], evt: T, cap: number): T[] {
  const next = [...log, evt];
  if (next.length > cap) next.splice(0, next.length - cap);
  return next;
}

export function toNdjson(events: readonly unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function defaultSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface EventBusTelemetrySinkOptions {
  endpoint?: string; // default "/log"
  flushIntervalMs?: number; // default 2000, matching the spike
  cap?: number; // default 5000, matching the spike's EVENT_BUS_CAP
  sessionId?: string;
  fetchImpl?: typeof fetch;
  sendBeaconImpl?: (url: string, data: BlobPart) => boolean;
  /** Wires the periodic flush timer + visibilitychange/beforeunload
   * listeners automatically on construction. Default true; set false for
   * tests that want to drive flush() manually. */
  autoStart?: boolean;
}

export class EventBusTelemetrySink implements TelemetrySink {
  readonly sessionId: string;
  private seq = 0;
  private log: StampedEvent[] = [];
  private pending: StampedEvent[] = [];
  private readonly cap: number;
  private readonly endpoint: string;
  private readonly flushIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sendBeaconImpl: ((url: string, data: BlobPart) => boolean) | null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private unloadHandler: (() => void) | null = null;

  constructor(options: EventBusTelemetrySinkOptions = {}) {
    this.endpoint = options.endpoint ?? "/log";
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.cap = options.cap ?? 5000;
    this.sessionId = options.sessionId ?? defaultSessionId();
    // fetch is spec'd to throw "Illegal invocation" if called detached from
    // its owning global (losing `this` binding) — storing the bare function
    // reference and calling it as `this.fetchImpl(...)` later does exactly
    // that in some browsers, so it must be bound at capture time.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.sendBeaconImpl =
      options.sendBeaconImpl ??
      (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon.bind(navigator)
        : null);
    if (options.autoStart ?? true) this.start();
  }

  emit(event: TelemetryEvent): void {
    const { type, atMs, ...rest } = event;
    const stamped = stampEvent(type, rest, this.sessionId, this.seq++, atMs);
    this.log = appendCapped(this.log, stamped, this.cap);
    this.pending.push(stamped);
  }

  /** Sends every pending event as one NDJSON POST (or sendBeacon, if
   * useBeacon is true and a beacon implementation is available) and clears
   * the pending queue. Failures are swallowed (console.warn only) — same
   * silent-degrade contract as the spike. */
  flush(useBeacon = false): void {
    if (!this.pending.length) return;
    const body = toNdjson(this.pending);
    this.pending = [];
    if (useBeacon && this.sendBeaconImpl) {
      try {
        const ok = this.sendBeaconImpl(this.endpoint, new Blob([body], { type: "application/x-ndjson" }));
        if (!ok) console.warn("telemetry: sendBeacon was refused (queue full?)");
      } catch (err) {
        console.warn("telemetry: sendBeacon failed:", err);
      }
      return;
    }
    this.fetchImpl(this.endpoint, { method: "POST", headers: { "Content-Type": "application/x-ndjson" }, body }).catch(
      (err: unknown) => console.warn(`telemetry: POST ${this.endpoint} failed (silently degrading) —`, (err as Error)?.message ?? err)
    );
  }

  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => this.flush(false), this.flushIntervalMs);
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        if (document.visibilityState === "hidden") this.flush(true);
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    if (typeof window !== "undefined") {
      this.unloadHandler = () => this.flush(true);
      window.addEventListener("beforeunload", this.unloadHandler);
    }
  }

  stop(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
    if (this.unloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.unloadHandler);
    }
    this.unloadHandler = null;
  }

  /** Sink A: the capped in-memory mirror, in order — matches the spike's
   * exported `get eventBusLog()`. */
  get eventLog(): readonly StampedEvent[] {
    return this.log;
  }
}
