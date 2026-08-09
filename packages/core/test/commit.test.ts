// Ported from spikes/modules/test.mjs's "commit.mjs" section. Note: the
// core port is SYNCHRONOUS (no crypto.subtle await — @noble/hashes computes
// in pure JS), unlike the spike's async version; the HASH VALUES are
// identical (same "${fingers}|${call}|${nonce}" format, same SHA-256).
import { describe, expect, it } from "vitest";
import { computeCommitHash, randomNonceHex, sha256Hex, verifyCommitment } from "../src/commit.js";
import { createSeededRandomSource } from "../src/ports/random-source.js";

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
    const random = createSeededRandomSource(1);
    expect(randomNonceHex(random)).toMatch(/^[0-9a-f]{32}$/);
  });
  it("is not deterministic across calls from the SAME RandomSource stream", () => {
    const random = createSeededRandomSource(1);
    const n1 = randomNonceHex(random);
    const n2 = randomNonceHex(random);
    expect(n1).not.toBe(n2);
  });
  it("is fully deterministic given the SAME seed (replayable)", () => {
    expect(randomNonceHex(createSeededRandomSource(7))).toBe(randomNonceHex(createSeededRandomSource(7)));
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
