// Ported from spikes/modules/test.mjs's "rules.mjs" section — same
// assertions, vitest syntax. spikes/modules/rules.mjs is the source of
// truth; this file (and packages/core/src/rules.ts) must never drift from it.
import { describe, expect, it } from "vitest";
import { CATALAN_NUMBER_WORDS, NUMBER_TO_CATALAN_CALL, callFromFG, computeMicatioVerdict, gFromCall, wordToNumber } from "../src/rules.js";

describe("rules: wordToNumber", () => {
  it("known Catalan words map correctly", () => {
    expect(wordToNumber("vuit")).toBe(8);
    expect(wordToNumber("dos")).toBe(2);
  });
  it("'tot' and 'deu' both mean 10 (alternate calls)", () => {
    expect(wordToNumber("tot")).toBe(10);
    expect(wordToNumber("deu")).toBe(10);
  });
  it("is case-insensitive", () => {
    expect(wordToNumber("VUIT")).toBe(8);
  });
  it("returns null for an unknown word", () => {
    expect(wordToNumber("xxx")).toBeNull();
  });
  it("returns null for null/empty input", () => {
    expect(wordToNumber(null)).toBeNull();
    expect(wordToNumber("")).toBeNull();
  });
});

describe("rules: NUMBER_TO_CATALAN_CALL", () => {
  it("10 always renders as 'deu' (not 'tot')", () => {
    expect(NUMBER_TO_CATALAN_CALL[10]).toBe("deu");
  });
});

describe("rules: computeMicatioVerdict", () => {
  it("player wins when only they guess the total", () => {
    const v = computeMicatioVerdict(3, 7, 4, 5); // total=7, player correct, ai wrong
    expect(v).toEqual({ total: 7, playerCorrect: true, aiCorrect: false, winner: "player" });
  });
  it("ai wins when only they guess the total", () => {
    const v = computeMicatioVerdict(3, 5, 4, 7); // total=7, ai correct, player wrong
    expect(v).toEqual({ total: 7, playerCorrect: false, aiCorrect: true, winner: "ai" });
  });
  it("parata when both correct", () => {
    const v = computeMicatioVerdict(3, 7, 4, 7); // total=7, both correct
    expect(v.winner).toBe("parata");
  });
  it("parata when both wrong", () => {
    const v = computeMicatioVerdict(3, 5, 4, 6); // total=7, neither correct
    expect(v.winner).toBe("parata");
  });
});

describe("rules: callFromFG / gFromCall (design doc §1, c = f + g)", () => {
  it("callFromFG computes c = f + g", () => {
    expect(callFromFG(3, 4)).toBe(7);
  });
  it("gFromCall recovers g from call and known f", () => {
    expect(gFromCall(7, 3)).toBe(4);
  });
  it.each([[1, 1], [5, 5], [2, 4], [4, 2]])("round-trips for f=%i,g=%i", (f, g) => {
    const call = callFromFG(f, g);
    expect(gFromCall(call, f)).toBe(g);
  });
});

describe("rules: CATALAN_NUMBER_WORDS is the vocabulary used everywhere else", () => {
  it("has exactly the 9 morra number words + tot", () => {
    expect(Object.keys(CATALAN_NUMBER_WORDS).sort()).toEqual(
      ["cinc", "deu", "dos", "nou", "quatre", "set", "sis", "tot", "tres", "vuit"].sort()
    );
  });
});
