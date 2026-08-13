import { describe, expect, it } from "vitest";
import { handHasResetSince } from "../../src/game/handHasReset.js";

// Ported spike step-13 semantics: evidence the hand moved on from the last
// resolved throw's count. (Same matrix apps/web's test file covered.)
describe("handHasResetSince", () => {
  it("no prior throw -> always armed", () => {
    expect(handHasResetSince(null, 3)).toBe(true);
    expect(handHasResetSince(null, null)).toBe(true);
  });
  it("hand gone -> reset", () => {
    expect(handHasResetSince(3, null)).toBe(true);
  });
  it("different count (incl. dropping to a fist) -> reset", () => {
    expect(handHasResetSince(3, 0)).toBe(true);
    expect(handHasResetSince(3, 5)).toBe(true);
  });
  it("static hand held at the same count -> NOT a reset", () => {
    expect(handHasResetSince(3, 3)).toBe(false);
  });
});
