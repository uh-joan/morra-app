import { describe, expect, it } from "vitest";
import { buildCacheName, staleCacheNames } from "../../src/assets/cacheKey.js";

describe("cacheKey: buildCacheName", () => {
  it("joins namespace and version with a colon", () => {
    expect(buildCacheName("morra-assets", "3")).toBe("morra-assets:3");
  });
});

describe("cacheKey: staleCacheNames", () => {
  it("finds same-namespace caches that are NOT the current version", () => {
    const existing = ["morra-assets:1", "morra-assets:2", "morra-assets:3"];
    expect(staleCacheNames(existing, "morra-assets", "morra-assets:3")).toEqual(["morra-assets:1", "morra-assets:2"]);
  });

  it("never touches caches from a different namespace", () => {
    const existing = ["morra-assets:1", "other-thing:1", "other-thing:2"];
    expect(staleCacheNames(existing, "morra-assets", "morra-assets:2")).toEqual(["morra-assets:1"]);
  });

  it("empty existing list -> empty result", () => {
    expect(staleCacheNames([], "morra-assets", "morra-assets:1")).toEqual([]);
  });

  it("everything already current -> empty result", () => {
    const existing = ["morra-assets:5"];
    expect(staleCacheNames(existing, "morra-assets", "morra-assets:5")).toEqual([]);
  });
});
