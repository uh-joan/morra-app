// New coverage (not in the spike's 130 tests): the RandomSource port
// utilities that make the ai.ts/commit.ts port possible in the first place.
import { describe, expect, it } from "vitest";
import { createSeededRandomSource, createSequenceRandomSource } from "../src/ports/random-source.js";

describe("ports: createSeededRandomSource", () => {
  it("is deterministic given the same seed", () => {
    const a = createSeededRandomSource(42);
    const b = createSeededRandomSource(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it("different seeds diverge", () => {
    const a = createSeededRandomSource(1);
    const b = createSeededRandomSource(2);
    expect(a.next()).not.toBe(b.next());
  });
  it("next() stays in [0, 1)", () => {
    const r = createSeededRandomSource(7);
    for (let i = 0; i < 200; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("nextBytes returns the requested length, deterministically", () => {
    const a = createSeededRandomSource(3);
    const b = createSeededRandomSource(3);
    expect(a.nextBytes(16)).toEqual(b.nextBytes(16));
    expect(createSeededRandomSource(3).nextBytes(20).length).toBe(20);
  });
});

describe("ports: createSequenceRandomSource", () => {
  it("replays the exact fixed sequence", () => {
    const r = createSequenceRandomSource([0.1, 0.5, 0.9]);
    expect([r.next(), r.next(), r.next()]).toEqual([0.1, 0.5, 0.9]);
  });
  it("cycles once exhausted", () => {
    const r = createSequenceRandomSource([0.1, 0.5]);
    expect([r.next(), r.next(), r.next()]).toEqual([0.1, 0.5, 0.1]);
  });
  it("rejects an empty sequence", () => {
    expect(() => createSequenceRandomSource([])).toThrow();
  });
  it("nextBytes throws (corpus cases pass nonces directly instead)", () => {
    const r = createSequenceRandomSource([0.1]);
    expect(() => r.nextBytes(4)).toThrow();
  });
});
