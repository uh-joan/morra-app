import { describe, expect, it } from "vitest";
import { handHasResetSince } from "../../src/game/handHasReset.js";

describe("handHasResetSince", () => {
  it("no prior throw -> always armed (true)", () => {
    expect(handHasResetSince(null, 3)).toBe(true);
    expect(handHasResetSince(null, null)).toBe(true);
  });
  it("hand gone (currentCount null) -> reset, even with a prior throw", () => {
    expect(handHasResetSince(3, null)).toBe(true);
  });
  it("a different count than the last throw -> reset", () => {
    expect(handHasResetSince(3, 0)).toBe(true);
    expect(handHasResetSince(3, 5)).toBe(true);
  });
  it("the SAME count held statically -> NOT a reset", () => {
    expect(handHasResetSince(3, 3)).toBe(false);
  });
});
