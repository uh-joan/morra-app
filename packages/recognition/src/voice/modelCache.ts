// modelCache.ts — Cache Storage front for the big model download. A plain
// fetch leans on the browser HTTP cache, and that fails us twice in the
// field: mobile Safari evicts ~40 MB entries within hours, and our etags
// churn on every deploy (Caddy derives them from rsync-fresh mtimes), so
// phones re-downloaded the Catalan model nearly every visit («Descarregant
// l'oïda…» forever). Cache Storage persists until the browser is under real
// storage pressure — the model downloads once per device.
//
// Every failure path (no `caches` global, private mode, storage denied or
// full) falls through to the plain streaming fetch — the cache is an
// optimization, never a requirement.

export interface FetchBlobResult {
  blob: Blob;
  bytes: number;
  fromCache: boolean;
}

export async function fetchBlobWithCache(
  url: string,
  cacheName: string,
  onProgress?: (received: number, total: number) => void
): Promise<FetchBlobResult> {
  let store: Cache | null = null;
  try {
    if (typeof caches !== "undefined") {
      store = await caches.open(cacheName);
      const hit = await store.match(url);
      if (hit) {
        const blob = await hit.blob();
        if (blob.size > 0) {
          // deliberately NO onProgress here: progress means "downloading",
          // and a hit must never flash «Descarregant…» at the player
          return { blob, bytes: blob.size, fromCache: true };
        }
      }
    }
  } catch {
    store = null; // private mode / storage denied — plain network below
  }

  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new Error(
      `fetch("${url}") threw before any HTTP status was seen — CORS block or network/path error. Original: ${(e as Error).message}`
    );
  }
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
  // Same ArrayBuffer-vs-ArrayBufferLike narrowing as resample.ts — fetch's
  // ReadableStream chunks are always real ArrayBuffers in practice.
  const blob = new Blob(chunks as BlobPart[]);
  if (store) {
    try {
      // We only reach here on a miss for the CURRENT url, and one model ever
      // lives in this store — wipe it first so a version bump (the url
      // carries the version) doesn't leave a 40 MB orphan behind.
      for (const key of await store.keys()) await store.delete(key);
      await store.put(url, new Response(blob));
    } catch {
      // storage pressure — next visit downloads again, nothing broken
    }
  }
  return { blob, bytes: received, fromCache: false };
}
