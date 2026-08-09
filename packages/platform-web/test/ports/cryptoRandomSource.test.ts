import { describe, expect, it } from "vitest";
import { CryptoRandomSource } from "../../src/ports/cryptoRandomSource.js";

describe("CryptoRandomSource: next()", () => {
  it("returns a float in [0, 1)", () => {
    const rng = new CryptoRandomSource();
    for (let i = 0; i < 50; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("does not return the exact same value every call (sanity, not a statistical test)", () => {
    const rng = new CryptoRandomSource();
    const values = new Set(Array.from({ length: 20 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("CryptoRandomSource: nextBytes()", () => {
  it("returns exactly `length` bytes, each in [0, 255]", () => {
    const rng = new CryptoRandomSource();
    const bytes = rng.nextBytes(16);
    expect(bytes.length).toBe(16);
    for (const b of bytes) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
  it("length 0 -> empty array, no throw", () => {
    const rng = new CryptoRandomSource();
    expect(rng.nextBytes(0).length).toBe(0);
  });
});
