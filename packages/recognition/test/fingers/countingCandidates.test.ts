// countingCandidates.test.ts — the candidate rules are evaluation-only, but
// two things must hold or the evaluator's report is a lie: the "shipped"
// baseline row must be EXACTLY countFingers, and every candidate must be a
// total function into 0..5.
import { describe, expect, it } from "vitest";
import { countFingers, countFingersSpike, type Landmark } from "../../src/fingers/counting.js";
import { DEFAULT_CANDIDATES, RULE_SHIPPED, RULE_SPIKE_VERBATIM } from "../../src/fingers/countingCandidates.js";

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const randomHand = (rng: () => number): Landmark[] =>
  Array.from({ length: 21 }, () => ({ x: rng(), y: rng(), z: (rng() - 0.5) * 0.3 }));

describe("counting candidates", () => {
  it("RULE_SHIPPED is exactly countFingers (5000 seeded random hands)", () => {
    const rng = makeRng(0xc0ffee);
    for (let i = 0; i < 5000; i++) {
      const lm = randomHand(rng);
      expect(RULE_SHIPPED.count(lm)).toBe(countFingers(lm));
    }
  });
  it("RULE_SPIKE_VERBATIM is countFingersSpike and differs from shipped only in the thumb (by at most 1)", () => {
    const rng = makeRng(0xbeef);
    for (let i = 0; i < 5000; i++) {
      const lm = randomHand(rng);
      expect(RULE_SPIKE_VERBATIM.count(lm)).toBe(countFingersSpike(lm));
      expect(Math.abs(RULE_SPIKE_VERBATIM.count(lm) - RULE_SHIPPED.count(lm))).toBeLessThanOrEqual(1);
    }
  });
  it("every candidate returns an integer in 0..5 on random hands, and has a unique id", () => {
    const ids = new Set<string>();
    const rng = makeRng(42);
    for (const rule of DEFAULT_CANDIDATES) {
      expect(ids.has(rule.id)).toBe(false);
      ids.add(rule.id);
      for (let i = 0; i < 500; i++) {
        const c = rule.count(randomHand(rng));
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(5);
      }
    }
  });
});
