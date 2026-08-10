// sessionId.ts — BUG FIX: "reload wipes profile/training data". Root cause
// (found via a live headless-Chrome repro, not guessed): EventBusTelemetrySink's
// defaultSessionId() minted a brand-new random sessionId on EVERY page load,
// and gameStore.ts stamps that per-load id onto every HistoryEntry AND uses
// it (via GameStoreDeps.sessionId) to filter the Entrenament mirror's
// DEFAULT "session" scope (getMirrorData("session") in gameStore.ts filters
// `h.sessionId === this.deps.sessionId`). So a plain page reload — no data
// actually lost, PlayerModel.throws stays fully intact in localStorage —
// left every PRIOR throw stamped with an id that could never match the new
// load's id again, making the mirror panel's default view (and therefore
// what the user actually sees) go completely empty. "All Time" scope was
// unaffected the whole time; the user just never had a reason to look there
// after a reload that appeared to have erased everything.
//
// Fix: persist the session id in sessionStorage, which survives a reload/
// back-forward navigation in the SAME tab but is cleared when the tab
// actually closes — exactly the "session" semantics the mirror's
// session-vs-all-time toggle is designed around (a genuinely NEW session
// starts on a fresh tab/window), unlike localStorage which would erase the
// session/all-time distinction entirely (they'd always be identical).
//
// storage is injected (rather than reading the ambient `sessionStorage`
// directly) so the persistence logic itself is unit-testable under plain
// vitest/node, same rationale as eventBusTelemetrySink.ts's extracted pure
// helpers (stampEvent/appendCapped/toNdjson) and
// localStoragePlayerModelStore.ts's probe-then-fall-back-to-memory shape.
export interface SimpleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SESSION_ID_STORAGE_KEY = "morra-platform-web-sessionid-v1";

function randomHex8(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns the existing session id from `storage` if one was already
 * minted this browser session, otherwise mints and persists a fresh one.
 * `storage` may be null (sessionStorage unusable — private browsing,
 * disabled) or throw on access; both degrade gracefully to a fresh
 * per-call id, matching every other storage port in this package. */
export function getOrCreateSessionId(storage: SimpleStorage | null, generateId: () => string = randomHex8): string {
  if (!storage) return generateId();
  try {
    const existing = storage.getItem(SESSION_ID_STORAGE_KEY);
    if (existing) return existing;
    const fresh = generateId();
    storage.setItem(SESSION_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return generateId();
  }
}

function ambientSessionStorage(): SimpleStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** The real browser entry point: reload-stable, tab-scoped session id
 * backed by the ambient `sessionStorage`. appSingletons.ts uses this for
 * BOTH the telemetry sink and GameStoreDeps.sessionId, so a throw recorded
 * before a reload and one recorded after both carry the same id. */
export function getOrCreateBrowserSessionId(): string {
  return getOrCreateSessionId(ambientSessionStorage());
}
