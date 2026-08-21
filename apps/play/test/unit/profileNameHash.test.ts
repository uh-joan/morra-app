// profileNameHash.test.ts — the privacy guarantee behind hashing the
// tripulant name before it rides telemetry to /log: the raw name never
// leaves, but a player's events still group across sessions.
import { describe, expect, it } from "vitest";
import { profileNameHash } from "../../src/profile.js";

describe("profileNameHash", () => {
  it("never contains the raw name", () => {
    const h = profileNameHash("Janis");
    expect(h.toLowerCase()).not.toContain("jani");
  });

  it("is stable — the same name always maps to the same token (groups a player across sessions)", () => {
    expect(profileNameHash("Nino")).toBe(profileNameHash("Nino"));
  });

  it("folds case and surrounding spaces (« Jani » and «jani» are one player)", () => {
    expect(profileNameHash(" Jani ")).toBe(profileNameHash("jani"));
    expect(profileNameHash("JANI")).toBe(profileNameHash("jani"));
  });

  it("different names map to different tokens", () => {
    expect(profileNameHash("Mercè")).not.toBe(profileNameHash("Bru"));
  });

  it("is a short hex token (12 chars), not the variable-length name", () => {
    expect(profileNameHash("a")).toMatch(/^[0-9a-f]{12}$/);
    expect(profileNameHash("un nom molt llarg de debò")).toMatch(/^[0-9a-f]{12}$/);
  });
});
