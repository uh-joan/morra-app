// modelCache.test.ts — the Cache Storage front for the model download:
// hit path (no network), miss path (stream + store + stale-version wipe),
// and every degraded environment (no caches global, caches that throw,
// storage that refuses the put) must fall back to the plain fetch.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBlobWithCache } from "../../src/voice/modelCache.js";

const MODEL_URL = "/assets/vosk-model/vosk-model-small-ca-0.4.zip";
const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

type FakeCache = {
  match: (url: string) => Promise<Response | undefined>;
  put: (url: string, resp: Response) => Promise<void>;
  keys: () => Promise<Array<{ url: string }>>;
  delete: (key: { url: string }) => Promise<boolean>;
};

function fakeCaches(prefill?: Record<string, Response>) {
  const entries = new Map<string, Response>(Object.entries(prefill ?? {}));
  const cache: FakeCache = {
    match: async (url) => entries.get(url),
    put: async (url, resp) => void entries.set(url, resp),
    keys: async () => [...entries.keys()].map((url) => ({ url })),
    delete: async (key) => entries.delete(key.url),
  };
  const caches = { open: vi.fn(async () => cache) };
  return { caches: caches as unknown as CacheStorage, entries, open: caches.open };
}

function stubGlobals(opts: { caches?: unknown; fetch?: typeof fetch }) {
  if ("caches" in opts) vi.stubGlobal("caches", opts.caches);
  if (opts.fetch) vi.stubGlobal("fetch", opts.fetch);
}

function okResponse(): Response {
  return new Response(new Blob([BYTES]), {
    status: 200,
    headers: { "Content-Length": String(BYTES.length) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("modelCache: cache hit", () => {
  it("returns the stored blob without touching the network — and WITHOUT progress (progress means «downloading», a hit must not flash it)", async () => {
    const { caches } = fakeCaches({ [MODEL_URL]: new Response(new Blob([BYTES])) });
    const netFetch = vi.fn();
    stubGlobals({ caches, fetch: netFetch as unknown as typeof fetch });
    const progress: Array<[number, number]> = [];
    const r = await fetchBlobWithCache(MODEL_URL, "t", (a, b) => progress.push([a, b]));
    expect(r.fromCache).toBe(true);
    expect(r.bytes).toBe(BYTES.length);
    expect(new Uint8Array(await r.blob.arrayBuffer())).toEqual(BYTES);
    expect(netFetch).not.toHaveBeenCalled();
    expect(progress).toEqual([]);
  });

  it("treats an empty cached blob as a miss (a truncated put must not brick the voice)", async () => {
    const { caches } = fakeCaches({ [MODEL_URL]: new Response(new Blob([])) });
    stubGlobals({ caches, fetch: vi.fn(async () => okResponse()) as unknown as typeof fetch });
    const r = await fetchBlobWithCache(MODEL_URL, "t");
    expect(r.fromCache).toBe(false);
    expect(r.bytes).toBe(BYTES.length);
  });
});

describe("modelCache: cache miss", () => {
  it("streams from the network with progress, then stores the blob", async () => {
    const { caches, entries } = fakeCaches();
    stubGlobals({ caches, fetch: vi.fn(async () => okResponse()) as unknown as typeof fetch });
    const progress: Array<[number, number]> = [];
    const r = await fetchBlobWithCache(MODEL_URL, "t", (a, b) => progress.push([a, b]));
    expect(r.fromCache).toBe(false);
    expect(r.bytes).toBe(BYTES.length);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]![0]).toBe(BYTES.length);
    const stored = entries.get(MODEL_URL);
    expect(stored).toBeDefined();
    expect(await stored!.blob().then((b) => b.size)).toBe(BYTES.length);
  });

  it("wipes stale versions before storing (a model bump must not leave a 40 MB orphan)", async () => {
    const OLD_URL = "/assets/vosk-model/vosk-model-small-ca-0.3.zip";
    const { caches, entries } = fakeCaches({ [OLD_URL]: new Response(new Blob([BYTES])) });
    stubGlobals({ caches, fetch: vi.fn(async () => okResponse()) as unknown as typeof fetch });
    await fetchBlobWithCache(MODEL_URL, "t");
    expect(entries.has(OLD_URL)).toBe(false);
    expect(entries.has(MODEL_URL)).toBe(true);
  });

  it("rejects on a non-ok response", async () => {
    const { caches } = fakeCaches();
    stubGlobals({
      caches,
      fetch: vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch,
    });
    await expect(fetchBlobWithCache(MODEL_URL, "t")).rejects.toThrow(/HTTP 404/);
  });
});

describe("modelCache: degraded environments fall back to plain fetch", () => {
  it("no caches global at all", async () => {
    stubGlobals({ caches: undefined, fetch: vi.fn(async () => okResponse()) as unknown as typeof fetch });
    const r = await fetchBlobWithCache(MODEL_URL, "t");
    expect(r.fromCache).toBe(false);
    expect(r.bytes).toBe(BYTES.length);
  });

  it("caches.open throws (private mode / storage denied)", async () => {
    const caches = { open: vi.fn(async () => { throw new Error("SecurityError"); }) };
    stubGlobals({ caches, fetch: vi.fn(async () => okResponse()) as unknown as typeof fetch });
    const r = await fetchBlobWithCache(MODEL_URL, "t");
    expect(r.fromCache).toBe(false);
    expect(r.bytes).toBe(BYTES.length);
  });

  it("a put that fails (storage pressure) still resolves with the downloaded blob", async () => {
    const { caches } = fakeCaches();
    const cache = await (caches as CacheStorage).open("t");
    (cache as unknown as FakeCache).put = async () => { throw new Error("QuotaExceededError"); };
    stubGlobals({ caches, fetch: vi.fn(async () => okResponse()) as unknown as typeof fetch });
    const r = await fetchBlobWithCache(MODEL_URL, "t");
    expect(r.fromCache).toBe(false);
    expect(r.bytes).toBe(BYTES.length);
  });
});
