// localStoragePlayerModelStore.ts — the web implementation of @morra/core's
// PlayerModelStore port. Ported verbatim from spikes/modules/playermodel.mjs's
// storage IO shell (probeStorage/STORAGE_USABLE/memoryStore/loadModel/
// saveModel/clearModel) — including its own reasoning for the in-memory
// fallback: not just a test convenience, but the same graceful degradation
// a private-browsing tab with a broken localStorage needs. That fallback
// also means this module's logic is testable under plain vitest/node
// (Node's own `localStorage` global exists but throws unless launched with
// --localstorage-file, so the probe below correctly falls back to memory
// there too) — same property the spike's own comment called out.
import type { PlayerModel, PlayerModelStore } from "@morra/core";
import { MODEL_VERSION, createEmptyModel } from "@morra/core";

export const DEFAULT_STORAGE_KEY = "morra-platform-web-playermodel-v1";

const memoryStore = new Map<string, string>();

function probeStorage(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const probeKey = "__morra_storage_probe__";
    localStorage.setItem(probeKey, "1");
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}
const STORAGE_USABLE = probeStorage();

export class LocalStoragePlayerModelStore implements PlayerModelStore {
  load(key: string = DEFAULT_STORAGE_KEY): PlayerModel {
    try {
      const raw = STORAGE_USABLE ? localStorage.getItem(key) : (memoryStore.get(key) ?? null);
      if (!raw) return createEmptyModel();
      const parsed = JSON.parse(raw) as { throws?: unknown };
      if (!parsed || !Array.isArray(parsed.throws)) return createEmptyModel();
      return { version: MODEL_VERSION, throws: parsed.throws as PlayerModel["throws"] };
    } catch {
      return createEmptyModel();
    }
  }

  save(model: PlayerModel, key: string = DEFAULT_STORAGE_KEY): boolean {
    try {
      const raw = JSON.stringify(model);
      if (STORAGE_USABLE) localStorage.setItem(key, raw);
      else memoryStore.set(key, raw);
      return true;
    } catch {
      return false;
    }
  }

  clear(key: string = DEFAULT_STORAGE_KEY): boolean {
    try {
      if (STORAGE_USABLE) localStorage.removeItem(key);
      else memoryStore.delete(key);
      return true;
    } catch {
      return false;
    }
  }
}
