// Ported from spikes/modules/test.mjs's "commit.mjs" section. Note: the
// core port is SYNCHRONOUS (no crypto.subtle await — @noble/hashes computes
// in pure JS), unlike the spike's async version; the HASH VALUES are
// identical (same "${fingers}|${call}|${nonce}" format, same SHA-256).
import { describe, expect, it } from "vitest";
import { computeCommitHash, randomNonceHex, sha256Hex, verifyCommitment } from "../src/commit.js";
import type { SecureRandomSource } from "../src/ports/secure-random-source.js";

// A minimal, deterministic SecureRandomSource TEST DOUBLE — this is testing
// randomNonceHex's own logic (hex length/encoding, that repeated calls draw
// fresh bytes), not source security, so a seeded mulberry32-backed fake is
// fine HERE specifically. It is intentionally NOT exported from
// src/ports/ and never used outside this test file — production code must
// only ever use a real CSPRNG-backed SecureRandomSource
// (@morra/platform-web's CryptoRandomSource). This is exactly the audit
// M6 distinction: a deterministic fake satisfying SecureRandomSource is
// safe as a private test fixture, but dangerous as an importable factory
// (which is why createSeededRandomSource/createSequenceRandomSource no
// longer implement this interface at all).
function makeSeededSecureRandomSource(seed: number): SecureRandomSource {
  let a = seed >>> 0;
  function nextUint32(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }
  return {
    nextSecureBytes(length: number): Uint8Array {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = nextUint32() & 0xff;
      return out;
    },
  };
}

describe("commit: sha256Hex", () => {
  it("is deterministic (same input -> same hash)", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
  });
  it("different input -> different hash", () => {
    expect(sha256Hex("hello")).not.toBe(sha256Hex("world"));
  });
  it("is 64 lowercase hex chars", () => {
    expect(sha256Hex("hello")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("matches the known SHA-256('hello') test vector", () => {
    expect(sha256Hex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

describe("commit: randomNonceHex", () => {
  it("is 32 hex chars by default (16 bytes)", () => {
    const random = makeSeededSecureRandomSource(1);
    expect(randomNonceHex(random)).toMatch(/^[0-9a-f]{32}$/);
  });
  it("is not deterministic across calls from the SAME SecureRandomSource stream", () => {
    const random = makeSeededSecureRandomSource(1);
    const n1 = randomNonceHex(random);
    const n2 = randomNonceHex(random);
    expect(n1).not.toBe(n2);
  });
  it("is fully deterministic given the SAME seed (replayable) — a property of THIS test double, not a production guarantee", () => {
    expect(randomNonceHex(makeSeededSecureRandomSource(7))).toBe(randomNonceHex(makeSeededSecureRandomSource(7)));
  });
});

describe("commit: computeCommitHash / verifyCommitment", () => {
  it("matches the field-tested '${fingers}|${call}|${nonce}' format exactly (do not change)", () => {
    const fingers = 3, call = 7, nonce = "deadbeef";
    const hash = computeCommitHash(fingers, call, nonce);
    const expected = sha256Hex(`${fingers}|${call}|${nonce}`);
    expect(hash).toBe(expected);
  });
  it("verifyCommitment is true for the real (fingers,call,nonce)", () => {
    const fingers = 3, call = 7, nonce = "deadbeef";
    const hash = computeCommitHash(fingers, call, nonce);
    expect(verifyCommitment(fingers, call, nonce, hash)).toBe(true);
  });
  it("verifyCommitment is false for a tampered call", () => {
    const fingers = 3, call = 7, nonce = "deadbeef";
    const hash = computeCommitHash(fingers, call, nonce);
    expect(verifyCommitment(fingers, call + 1, nonce, hash)).toBe(false);
  });
  it("verifyCommitment is false for a tampered nonce", () => {
    const fingers = 3, call = 7, nonce = "deadbeef";
    const hash = computeCommitHash(fingers, call, nonce);
    expect(verifyCommitment(fingers, call, "tampered", hash)).toBe(false);
  });
});
