// localJsonStore.ts — a tiny, generic localStorage JSON store (probe +
// in-memory fallback, same graceful-degrade shape as @morra/platform-web's
// LocalStoragePlayerModelStore) backing Feature 3's two web-app/product
// concerns: the profile registry (who's playing) and per-profile
// GameSettings persistence. Kept local to apps/web rather than promoted to
// @morra/platform-web because neither is a cross-platform CONTRACT the way
// PlayerModelStore is — just two call sites in this app that happen to want
// the same small mechanism.
const memoryStore = new Map<string, string>();

function probeStorage(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const probeKey = "__morra_local_json_store_probe__";
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}
const STORAGE_USABLE = probeStorage();

export function loadJson<T>(key: string): T | null {
  try {
    const raw = STORAGE_USABLE ? localStorage.getItem(key) : (memoryStore.get(key) ?? null);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveJson<T>(key: string, value: T): boolean {
  try {
    const raw = JSON.stringify(value);
    if (STORAGE_USABLE) localStorage.setItem(key, raw);
    else memoryStore.set(key, raw);
    return true;
  } catch {
    return false;
  }
}
