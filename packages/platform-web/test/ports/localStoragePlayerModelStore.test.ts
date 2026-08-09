import { describe, expect, it } from "vitest";
import { LocalStoragePlayerModelStore } from "../../src/ports/localStoragePlayerModelStore.js";
import { createEmptyModel, MODEL_VERSION, type HistoryEntry } from "@morra/core";

// Runs under plain vitest/node — no jsdom. Node's own ambient `localStorage`
// throws unless launched with --localstorage-file, so this store's probe
// correctly falls back to its in-memory Map, exactly like the spike's own
// playermodel.mjs comment documents. This suite therefore exercises the
// MEMORY fallback path; the real browser localStorage path is proven by
// the puppeteer integration test (test/integration/run.mjs).

const throwEntry: HistoryEntry = {
  throwIndex: 0,
  playerFingers: 2,
  playerCall: 4,
  aiFingers: 1,
  aiCall: 3,
  aiGuessPlayerFingers: 2,
  aiLevel: "L1",
  verdictWinner: "player",
};

describe("LocalStoragePlayerModelStore: load", () => {
  it("no prior save -> an empty model", () => {
    const store = new LocalStoragePlayerModelStore();
    expect(store.load("lspms-test-empty")).toEqual(createEmptyModel());
  });
});

describe("LocalStoragePlayerModelStore: save + load round trip", () => {
  it("round-trips a model with throws", () => {
    const store = new LocalStoragePlayerModelStore();
    const model = { version: MODEL_VERSION, throws: [throwEntry] };
    expect(store.save(model, "lspms-test-roundtrip")).toBe(true);
    expect(store.load("lspms-test-roundtrip")).toEqual(model);
  });

  it("different keys do not collide", () => {
    const store = new LocalStoragePlayerModelStore();
    store.save({ version: MODEL_VERSION, throws: [throwEntry] }, "lspms-test-key-a");
    store.save(createEmptyModel(), "lspms-test-key-b");
    expect(store.load("lspms-test-key-a").throws.length).toBe(1);
    expect(store.load("lspms-test-key-b").throws.length).toBe(0);
  });

  it("uses DEFAULT_STORAGE_KEY when no key is passed", () => {
    const store = new LocalStoragePlayerModelStore();
    const model = { version: MODEL_VERSION, throws: [throwEntry] };
    store.save(model);
    expect(store.load()).toEqual(model);
  });
});

describe("LocalStoragePlayerModelStore: clear", () => {
  it("clears a saved model back to empty", () => {
    const store = new LocalStoragePlayerModelStore();
    store.save({ version: MODEL_VERSION, throws: [throwEntry] }, "lspms-test-clear");
    expect(store.clear("lspms-test-clear")).toBe(true);
    expect(store.load("lspms-test-clear")).toEqual(createEmptyModel());
  });
});

describe("LocalStoragePlayerModelStore: malformed data recovers gracefully", () => {
  it("a saved value whose parsed shape has no throws array loads as empty", () => {
    // Simulate corruption by saving a model-shaped-but-wrong JSON string directly
    // through the store's own save() with a manually broken object, cast past
    // the type system the way real corrupted storage would arrive.
    const store = new LocalStoragePlayerModelStore();
    store.save({ version: MODEL_VERSION, throws: "not-an-array" } as never, "lspms-test-corrupt");
    expect(store.load("lspms-test-corrupt")).toEqual(createEmptyModel());
  });
});
