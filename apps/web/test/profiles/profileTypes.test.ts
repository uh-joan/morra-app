import { describe, expect, it } from "vitest";
import {
  addProfile,
  DEFAULT_PROFILE_ID,
  emptyRegistry,
  makeProfileId,
  normalizeRegistry,
  resolveInitialProfileId,
  setLastPlayed,
  type ProfileRegistry,
} from "../../src/profiles/profileTypes.js";

describe("profileTypes: emptyRegistry", () => {
  it("starts with exactly one profile — the auto-loaded default", () => {
    const r = emptyRegistry();
    expect(r.profiles).toEqual([{ id: DEFAULT_PROFILE_ID, name: "Jugador" }]);
    expect(r.lastPlayedProfileId).toBe(DEFAULT_PROFILE_ID);
  });
});

describe("profileTypes: normalizeRegistry", () => {
  it("null/undefined -> emptyRegistry()", () => {
    expect(normalizeRegistry(null)).toEqual(emptyRegistry());
    expect(normalizeRegistry(undefined)).toEqual(emptyRegistry());
  });
  it("a registry with an empty profiles array -> emptyRegistry() (guards a corrupt/wiped registry)", () => {
    expect(normalizeRegistry({ profiles: [], lastPlayedProfileId: null })).toEqual(emptyRegistry());
  });
  it("a well-formed registry passes through unchanged", () => {
    const r: ProfileRegistry = { profiles: [{ id: "x", name: "X" }], lastPlayedProfileId: "x" };
    expect(normalizeRegistry(r)).toEqual(r);
  });
});

describe("profileTypes: makeProfileId", () => {
  it("generates distinct ids across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeProfileId()));
    expect(ids.size).toBe(20);
  });
});

describe("profileTypes: addProfile", () => {
  it("appends a new profile and sets it as last-played, never mutating the input", () => {
    const before = emptyRegistry();
    const beforeSnapshot = JSON.parse(JSON.stringify(before));
    const { registry, profile } = addProfile(before, "Jani");
    expect(before).toEqual(beforeSnapshot); // input untouched
    expect(profile.name).toBe("Jani");
    expect(registry.profiles).toEqual([...before.profiles, profile]);
    expect(registry.lastPlayedProfileId).toBe(profile.id);
  });

  it("trims whitespace and falls back to the default name for a blank input", () => {
    const { profile: trimmed } = addProfile(emptyRegistry(), "  Rafa  ");
    expect(trimmed.name).toBe("Rafa");
    const { profile: blank } = addProfile(emptyRegistry(), "   ");
    expect(blank.name).toBe("Jugador");
  });
});

describe("profileTypes: setLastPlayed", () => {
  it("updates lastPlayedProfileId without touching the profiles list, never mutating the input", () => {
    const before = emptyRegistry();
    const beforeSnapshot = JSON.parse(JSON.stringify(before));
    const next = setLastPlayed(before, "someone-else");
    expect(before).toEqual(beforeSnapshot);
    expect(next.lastPlayedProfileId).toBe("someone-else");
    expect(next.profiles).toBe(before.profiles);
  });
});

describe("profileTypes: resolveInitialProfileId (Feature 3a — auto-load last-played)", () => {
  it("prefers lastPlayedProfileId when set", () => {
    const r: ProfileRegistry = { profiles: [{ id: "a", name: "A" }, { id: "b", name: "B" }], lastPlayedProfileId: "b" };
    expect(resolveInitialProfileId(r)).toBe("b");
  });
  it("falls back to the first profile when lastPlayedProfileId is null", () => {
    const r: ProfileRegistry = { profiles: [{ id: "a", name: "A" }], lastPlayedProfileId: null };
    expect(resolveInitialProfileId(r)).toBe("a");
  });
  it("falls back to DEFAULT_PROFILE_ID when the registry is somehow fully empty", () => {
    const r: ProfileRegistry = { profiles: [], lastPlayedProfileId: null };
    expect(resolveInitialProfileId(r)).toBe(DEFAULT_PROFILE_ID);
  });
});
