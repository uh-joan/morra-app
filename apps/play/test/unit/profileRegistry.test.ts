import { describe, expect, it } from "vitest";
import {
  createProfile,
  defaultRegistry,
  deleteProfile,
  DEFAULT_PROFILE_ID,
  LEGACY_PLAYER_MODEL_KEY,
  normalizeRegistry,
  PROFILE_MODEL_KEY_PREFIX,
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
