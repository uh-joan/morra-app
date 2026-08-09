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
  it("does not satisfy SecureRandomSource (security audit M6 — compile-time only, documented here as a comment: createSeededRandomSource's return type has no nextSecureBytes method, so passing it to commit.ts's randomNonceHex is a TS2345 error, not a runtime check)", () => {
    const r = createSeededRandomSource(3);
    expect((r as unknown as { nextSecureBytes?: unknown }).nextSecureBytes).toBeUndefined();
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
});
