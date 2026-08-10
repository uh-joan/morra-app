import { describe, expect, it } from "vitest";
import { getOrCreateSessionId, SESSION_ID_STORAGE_KEY, type SimpleStorage } from "../../src/ports/sessionId.js";

// In-memory SimpleStorage double — same role as gameStore.test.ts's
// makeMemoryStore(): proves the persistence LOGIC without needing a real
// browser sessionStorage (unavailable under plain vitest/node).
function makeMemoryStorage(): SimpleStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("getOrCreateSessionId", () => {
  it("mints and persists a fresh id when storage is empty", () => {
    const storage = makeMemoryStorage();
    const id = getOrCreateSessionId(storage, () => "abc123");
    expect(id).toBe("abc123");
    expect(storage.getItem(SESSION_ID_STORAGE_KEY)).toBe("abc123");
  });

  // The regression this test guards: BUG (reload wiped the mirror's default
  // "session" view) — a page reload must get back the SAME session id it
  // had before, not a fresh one, or every throw recorded before the reload
  // becomes permanently invisible to session-scoped views.
  it("a second call (simulating a page reload) reuses the persisted id instead of minting a new one", () => {
    const storage = makeMemoryStorage();
    const first = getOrCreateSessionId(storage, () => "first-id");
    const second = getOrCreateSessionId(storage, () => "second-id");
    expect(first).toBe("first-id");
    expect(second).toBe("first-id");
  });

  it("storage === null (sessionStorage unusable) falls back to a fresh id per call", () => {
    expect(getOrCreateSessionId(null, () => "fallback-id")).toBe("fallback-id");
  });

  it("a storage that throws on access degrades gracefully to a fresh id", () => {
    const throwing: SimpleStorage = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };
    expect(getOrCreateSessionId(throwing, () => "fallback-id")).toBe("fallback-id");
  });

  it("uses the default crypto-backed generator when none is injected", () => {
    const storage = makeMemoryStorage();
    const id = getOrCreateSessionId(storage);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});
