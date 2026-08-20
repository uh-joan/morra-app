import { describe, expect, it } from "vitest";
import {
  createProfile,
  defaultRegistry,
  deleteProfile,
  DEFAULT_PROFILE_ID,
  LEGACY_PLAYER_MODEL_KEY,
  needsFirstRun,
  normalizeRegistry,
  PROFILE_MODEL_KEY_PREFIX,
  renameProfile,
  setActiveProfile,
  storageKeyFor,
} from "../../src/profileRegistry.js";

const NAME = "Principal";

describe("profileRegistry: storageKeyFor", () => {
  it("default profile -> the spike's legacy key (zero migration)", () => {
    expect(storageKeyFor(DEFAULT_PROFILE_ID)).toBe(LEGACY_PLAYER_MODEL_KEY);
    expect(LEGACY_PLAYER_MODEL_KEY).toBe("morra-s03-playermodel-v1");
  });
  it("other profiles -> namespaced keys", () => {
    expect(storageKeyFor("pabc")).toBe(PROFILE_MODEL_KEY_PREFIX + "pabc");
  });
});

describe("profileRegistry: normalizeRegistry", () => {
  it("malformed input degrades to the default registry", () => {
    for (const raw of [null, undefined, "junk", 42, {}, { profiles: "x" }]) {
      const reg = normalizeRegistry(raw, NAME);
      expect(reg.activeId).toBe(DEFAULT_PROFILE_ID);
      expect(reg.profiles).toEqual([{ id: DEFAULT_PROFILE_ID, name: NAME, createdAtIso: null }]);
    }
  });
  it("guarantees the default profile exists first and dedupes ids", () => {
    const reg = normalizeRegistry(
      {
        activeId: "b",
        profiles: [
          { id: "b", name: "Bea", createdAtIso: "2026-01-01" },
          { id: "b", name: "Duplicate" },
          { id: "", name: "NoId" },
          { id: "c", name: "   " },
        ],
      },
      NAME
    );
    expect(reg.profiles.map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID, "b"]);
    expect(reg.activeId).toBe("b");
  });
  it("activeId pointing at a missing profile falls back to default", () => {
    const reg = normalizeRegistry({ activeId: "ghost", profiles: [{ id: "b", name: "Bea" }] }, NAME);
    expect(reg.activeId).toBe(DEFAULT_PROFILE_ID);
  });
  it("preserves a customized default-profile name", () => {
    const reg = normalizeRegistry({ activeId: "default", profiles: [{ id: "default", name: "Jordi" }] }, NAME);
    expect(reg.profiles[0]).toEqual({ id: DEFAULT_PROFILE_ID, name: "Jordi", createdAtIso: null });
  });
});

describe("profileRegistry: create/delete/setActive", () => {
  const base = defaultRegistry(NAME);

  it("createProfile activates the new profile and never mutates", () => {
    const next = createProfile(base, "p1", "  Bea ", "2026-08-13T00:00:00Z")!;
    expect(next.activeId).toBe("p1");
    expect(next.profiles[1]).toEqual({ id: "p1", name: "Bea", createdAtIso: "2026-08-13T00:00:00Z" });
    expect(base.profiles).toHaveLength(1); // untouched
  });
  it("createProfile rejects blank names and duplicate ids", () => {
    expect(createProfile(base, "p1", "   ", "x")).toBeNull();
    expect(createProfile(base, DEFAULT_PROFILE_ID, "Nom", "x")).toBeNull();
  });
  it("deleteProfile removes model owner and falls back to default when active", () => {
    const withP1 = createProfile(base, "p1", "Bea", "x")!;
    const afterDelete = deleteProfile(withP1, "p1")!;
    expect(afterDelete.activeId).toBe(DEFAULT_PROFILE_ID);
    expect(afterDelete.profiles.map((p) => p.id)).toEqual([DEFAULT_PROFILE_ID]);
  });
  it("deleteProfile refuses the default profile and unknown ids", () => {
    expect(deleteProfile(base, DEFAULT_PROFILE_ID)).toBeNull();
    expect(deleteProfile(base, "ghost")).toBeNull();
  });
  it("setActiveProfile switches only to real profiles", () => {
    const withP1 = createProfile(base, "p1", "Bea", "x")!;
    expect(setActiveProfile(withP1, DEFAULT_PROFILE_ID)!.activeId).toBe(DEFAULT_PROFILE_ID);
    expect(setActiveProfile(withP1, "ghost")).toBeNull();
    expect(setActiveProfile(withP1, "p1")).toBe(withP1); // no-op returns same object
  });
});

describe("profileRegistry: renameProfile", () => {
  const base = defaultRegistry(NAME);

  it("renames in place, trims, never mutates", () => {
    const next = renameProfile(base, DEFAULT_PROFILE_ID, "  Jordi ")!;
    expect(next.profiles[0]).toEqual({ id: DEFAULT_PROFILE_ID, name: "Jordi", createdAtIso: null });
    expect(next.activeId).toBe(base.activeId);
    expect(base.profiles[0]!.name).toBe(NAME); // untouched
  });
  it("rejects blank names and unknown ids", () => {
    expect(renameProfile(base, DEFAULT_PROFILE_ID, "   ")).toBeNull();
    expect(renameProfile(base, "ghost", "Nom")).toBeNull();
  });
  it("same-name rename is a no-op returning the same object", () => {
    expect(renameProfile(base, DEFAULT_PROFILE_ID, NAME)).toBe(base);
    expect(renameProfile(base, DEFAULT_PROFILE_ID, "  " + NAME + " ")).toBe(base);
  });
  it("a renamed default survives a storage round-trip through normalizeRegistry", () => {
    const renamed = renameProfile(base, DEFAULT_PROFILE_ID, "Jordi")!;
    const back = normalizeRegistry(JSON.parse(JSON.stringify(renamed)), NAME);
    expect(back.profiles[0]!.name).toBe("Jordi");
  });
});

describe("profileRegistry: needsFirstRun", () => {
  it("true only for a factory-fresh registry (an untouched Principal)", () => {
    expect(needsFirstRun(defaultRegistry(NAME), NAME)).toBe(true);
  });
  it("false once the default profile is named", () => {
    const named = renameProfile(defaultRegistry(NAME), DEFAULT_PROFILE_ID, "Jordi")!;
    expect(needsFirstRun(named, NAME)).toBe(false);
  });
  it("false when any extra profile exists, and after deleting back to only the named default", () => {
    const withP1 = createProfile(defaultRegistry(NAME), "p1", "Bea", "x")!;
    expect(needsFirstRun(withP1, NAME)).toBe(false);
    // delete the extra: the default kept its factory name → gate reopens
    // (nobody ever named themselves), which is the intended reading
    expect(needsFirstRun(deleteProfile(withP1, "p1")!, NAME)).toBe(true);
    // but a renamed default keeps the gate closed after the same delete
    const namedThenP1 = createProfile(renameProfile(defaultRegistry(NAME), DEFAULT_PROFILE_ID, "Jordi")!, "p1", "Bea", "x")!;
    expect(needsFirstRun(deleteProfile(namedThenP1, "p1")!, NAME)).toBe(false);
  });
});
