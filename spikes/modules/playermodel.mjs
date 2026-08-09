// playermodel.mjs — the shared PlayerModel: an append-only history of the
// player's throws, consumed by BOTH the AI (L4's cross-match reads,
// docs/rival-ai-design.md §2) and the mirror (Phase H, §3). Pure core
// (createEmptyModel/recordThrow/snapshotModel/toHistoryArray) + a thin,
// clearly-isolated storage IO shell at the bottom — the pure functions
// never touch storage themselves. The IO shell prefers real localStorage
// but degrades to an in-memory store when it isn't usable, so this module
// loads and its persistence is fully testable under plain `node` too (see
// the shell's own comment below for why).

export const MODEL_VERSION = 1;
export const DEFAULT_STORAGE_KEY = "morra-s03-playermodel-v1";
export const HISTORY_CAP = 2000; // bounded — keeps cross-session localStorage + AI replay cost sane

export function createEmptyModel() {
  return { version: MODEL_VERSION, throws: [] };
}

// entry shape (matches the `history` records ai.mjs's decideMove expects):
//   { throwIndex, playerFingers, playerCall, aiFingers, aiCall,
//     aiGuessPlayerFingers, aiLevel, verdictWinner }
// Never mutates the input model.
export function recordThrow(model, entry) {
  const throws = [...(model ? model.throws : []), entry];
  if (throws.length > HISTORY_CAP) throws.splice(0, throws.length - HISTORY_CAP);
  return { version: MODEL_VERSION, throws };
}

export function snapshotModel(model) {
  return { throwCount: model ? model.throws.length : 0 };
}

// The plain array shape ai.mjs's decideMove expects as `history`.
export function toHistoryArray(model) {
  return model ? model.throws : [];
}

/* ------------------------- storage IO (impure) -------------------------
 * Real localStorage when it's actually usable (every browser this page
 * targets); an in-memory Map fallback otherwise. That fallback isn't just
 * a test-harness convenience — it's the same graceful-degradation a
 * private-browsing tab with a broken localStorage would need — but it DOES
 * mean this module keeps working under plain `node` (Node's own
 * `localStorage` global exists but throws unless launched with
 * --localstorage-file, so the probe below correctly falls back to memory
 * there) without requiring any special flag for spikes/modules/test.mjs. */

const memoryStore = new Map();

function probeStorage() {
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

export function loadModel(storageKey = DEFAULT_STORAGE_KEY) {
  try {
    const raw = STORAGE_USABLE ? localStorage.getItem(storageKey) : (memoryStore.get(storageKey) ?? null);
    if (!raw) return createEmptyModel();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.throws)) return createEmptyModel();
    return { version: MODEL_VERSION, throws: parsed.throws };
  } catch {
    return createEmptyModel();
  }
}

export function saveModel(model, storageKey = DEFAULT_STORAGE_KEY) {
  try {
    const raw = JSON.stringify(model);
    if (STORAGE_USABLE) localStorage.setItem(storageKey, raw);
    else memoryStore.set(storageKey, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearModel(storageKey = DEFAULT_STORAGE_KEY) {
  try {
    if (STORAGE_USABLE) localStorage.removeItem(storageKey);
    else memoryStore.delete(storageKey);
    return true;
  } catch {
    return false;
  }
}
