import { describe, expect, it, vi } from "vitest";
import { appendCapped, EventBusTelemetrySink, stampEvent, toNdjson } from "../../src/ports/eventBusTelemetrySink.js";

describe("eventBusTelemetrySink: stampEvent", () => {
  it("merges sessionId/seq/atMs/type with the payload", () => {
    const evt = stampEvent("throw_resolved", { fingers: 3 }, "abc123", 5, 999);
    expect(evt).toEqual({ sessionId: "abc123", seq: 5, atMs: 999, type: "throw_resolved", fingers: 3 });
  });
  it("payload can be omitted", () => {
    expect(stampEvent("ping", undefined, "s", 0, 1)).toEqual({ sessionId: "s", seq: 0, atMs: 1, type: "ping" });
  });
});

describe("eventBusTelemetrySink: appendCapped", () => {
  it("appends without mutating the input array", () => {
    const log = [1, 2, 3];
    const next = appendCapped(log, 4, 10);
    expect(log).toEqual([1, 2, 3]);
    expect(next).toEqual([1, 2, 3, 4]);
  });
  it("drops from the front once over cap", () => {
    const log = [1, 2, 3];
    expect(appendCapped(log, 4, 3)).toEqual([2, 3, 4]);
  });
  it("exactly at cap after append -> no drop", () => {
    expect(appendCapped([1, 2], 3, 3)).toEqual([1, 2, 3]);
  });
});

describe("eventBusTelemetrySink: toNdjson", () => {
  it("one JSON object per line, trailing newline", () => {
    const body = toNdjson([{ a: 1 }, { b: 2 }]);
    expect(body).toBe('{"a":1}\n{"b":2}\n');
  });
  it("empty array -> just a trailing newline", () => {
    expect(toNdjson([])).toBe("\n");
  });
});

describe("EventBusTelemetrySink: emit + flush", () => {
  it("flush() POSTs the pending events as NDJSON to the configured endpoint and clears pending", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("", { status: 200 });
    });
    const sink = new EventBusTelemetrySink({ endpoint: "/log", fetchImpl: fetchImpl as unknown as typeof fetch, autoStart: false, sessionId: "sess1" });

    sink.emit({ type: "camera_ready", atMs: 10 });
    sink.emit({ type: "mic_ready", atMs: 20 });
    expect(sink.eventLog.length).toBe(2);

    sink.flush(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calls[0]!.url).toBe("/log");
    expect(calls[0]!.init.method).toBe("POST");
    const body = calls[0]!.init.body as string;
    expect(body.trim().split("\n").length).toBe(2);
    expect(body).toContain('"type":"camera_ready"');
    expect(body).toContain('"sessionId":"sess1"');

    // pending cleared — a second flush with nothing pending doesn't POST again
    sink.flush(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("eventLog (Sink A) keeps everything ever emitted even after flush, up to the cap", () => {
    const sink = new EventBusTelemetrySink({ autoStart: false, cap: 2, fetchImpl: vi.fn(async () => new Response()) as unknown as typeof fetch });
    sink.emit({ type: "a", atMs: 1 });
    sink.emit({ type: "b", atMs: 2 });
    sink.emit({ type: "c", atMs: 3 });
    expect(sink.eventLog.map((e) => e.type)).toEqual(["b", "c"]); // capped at 2, oldest dropped
  });

  it("useBeacon=true uses the injected sendBeacon implementation instead of fetch", () => {
    const fetchImpl = vi.fn(async () => new Response());
    const sendBeaconImpl = vi.fn(() => true);
    const sink = new EventBusTelemetrySink({
      autoStart: false,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sendBeaconImpl,
    });
    sink.emit({ type: "tab_hidden", atMs: 1 });
    sink.flush(true);
    expect(sendBeaconImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a failed POST is swallowed (silent-degrade) — flush never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const sink = new EventBusTelemetrySink({ autoStart: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    sink.emit({ type: "x", atMs: 1 });
    expect(() => sink.flush(false)).not.toThrow();
  });

  it("flush() with nothing pending is a no-op (no fetch call)", () => {
    const fetchImpl = vi.fn(async () => new Response());
    const sink = new EventBusTelemetrySink({ autoStart: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    sink.flush(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("seq increments per emit, scoped to this sink instance", () => {
    const sink = new EventBusTelemetrySink({ autoStart: false, fetchImpl: vi.fn(async () => new Response()) as unknown as typeof fetch });
    sink.emit({ type: "a", atMs: 1 });
    sink.emit({ type: "b", atMs: 2 });
    expect(sink.eventLog.map((e) => e.seq)).toEqual([0, 1]);
  });
});
