// assetManager.ts — minimal v1 asset loading, per the M3 dispatch:
//   - fetchClipSet: fetch+decode a set of audio clips into AudioBuffers,
//     generalized from spikes/s03-beat.html's preloadRivalVoiceClips
//     (s03-beat.html:3124-3141) — same per-clip fetch/decodeAudioData/
//     status-tracking pattern, generalized from "rival voice words" to any
//     {key -> url} manifest (the arithmetic never actually knew anything
//     "rival"-specific, same generalization move as @morra/recognition's
//     blanking.ts in M2).
//   - fetchModelWithCache: the streaming fetch-with-progress pattern proven
//     in @morra/recognition's VoskCallRecognizer (itself ported from the
//     spike's fetchModelBlob), PLUS Cache Storage caching on top — the
//     spike never had Cache Storage (it re-fetches every page load), so
//     that layer is new platform-web infrastructure, not extracted spike
//     behavior. Caching is best-effort throughout: any Cache Storage
//     failure (private browsing, disabled, quota) falls through to a plain
//     network fetch rather than failing the load.
import { buildCacheName, staleCacheNames } from "./cacheKey.js";

export interface ClipLoadStatus {
  key: string;
  status: "loaded" | "failed";
  error?: string;
}

export interface ClipSetResult {
  buffers: Map<string, AudioBuffer>;
  statuses: ClipLoadStatus[];
}

export async function fetchClipSet(
  ctx: AudioContext,
  manifest: Readonly<Record<string, string>>,
  fetchImpl: typeof fetch = fetch
): Promise<ClipSetResult> {
  const buffers = new Map<string, AudioBuffer>();
  const statuses: ClipLoadStatus[] = [];
  await Promise.all(
    Object.entries(manifest).map(async ([key, url]) => {
      try {
        const resp = await fetchImpl(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        buffers.set(key, audioBuf);
        statuses.push({ key, status: "loaded" });
      } catch (err) {
        statuses.push({ key, status: "failed", error: String((err as Error)?.message ?? err) });
      }
    })
  );
  return { buffers, statuses };
}

export interface ModelFetchOptions {
  cacheNamespace?: string;
  cacheVersion?: string;
  onProgress?: (received: number, total: number) => void;
  fetchImpl?: typeof fetch;
  /** Injectable for tests / environments without Cache Storage; defaults to
   * the global `caches`, when present. */
  cachesImpl?: CacheStorage;
}

/** Fetches `url` as a Blob, serving from Cache Storage when a prior fetch
 * under the same {cacheNamespace, cacheVersion} already cached it. Reports
 * download progress (received/total bytes) only on an actual network fetch
 * — a cache hit resolves immediately with no progress callbacks. */
export async function fetchModelWithCache(url: string, options: ModelFetchOptions = {}): Promise<Blob> {
  const { cacheNamespace = "morra-assets", cacheVersion = "1", onProgress, fetchImpl = fetch, cachesImpl } = options;
  const cacheApi = cachesImpl ?? (typeof caches !== "undefined" ? caches : null);
  const cacheName = buildCacheName(cacheNamespace, cacheVersion);

  if (cacheApi) {
    try {
      const cache = await cacheApi.open(cacheName);
      const cached = await cache.match(url);
      if (cached) return await cached.blob();
    } catch {
      // Cache Storage unusable (private browsing, disabled, quota) — fall through to network.
    }
  }

  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`Model fetch failed: HTTP ${resp.status} for ${url}`);
  const total = parseInt(resp.headers.get("Content-Length") || "0", 10);
  const reader = resp.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const blob = new Blob(chunks as BlobPart[]);

  if (cacheApi) {
    try {
      const cache = await cacheApi.open(cacheName);
      await cache.put(url, new Response(blob, { headers: { "Content-Length": String(blob.size) } }));
    } catch {
      // Best-effort caching only — never fail the fetch because caching failed.
    }
  }
  return blob;
}

/** Deletes every Cache Storage entry under `namespace` that isn't the
 * current {namespace, version} — call after bumping cacheVersion so old
 * model/clip-set blobs don't linger forever. Returns the names it deleted. */
export async function pruneStaleAssetCaches(
  namespace: string,
  currentVersion: string,
  cachesImpl?: CacheStorage
): Promise<string[]> {
  const cacheApi = cachesImpl ?? (typeof caches !== "undefined" ? caches : null);
  if (!cacheApi) return [];
  const currentName = buildCacheName(namespace, currentVersion);
  const names = await cacheApi.keys();
  const stale = staleCacheNames(names, namespace, currentName);
  await Promise.all(stale.map((n) => cacheApi.delete(n)));
  return stale;
}
