// commit.ts — ported from spikes/modules/commit.mjs. SHA-256 now comes from
// @noble/hashes instead of the browser's crypto.subtle, so this runs
// anywhere (no ambient `crypto` global — see the eslint purity gate) and is
// synchronous, since @noble/hashes computes in pure JS with no I/O. The hash
// FORMAT is unchanged from the spike/field-tested scheme: keep
// "${fingers}|${call}|${nonce}" exactly — existing exported debug logs and
// NDJSON session logs already assume it.
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { SecureRandomSource } from "./ports/secure-random-source.js";

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

// Nonce bytes come from the injected SecureRandomSource (never
// crypto.getRandomValues called directly here, and never a plain
// RandomSource — see secure-random-source.ts / security audit M6: a
// predictable nonce source makes the commitment brute-forceable).
export function randomNonceHex(random: SecureRandomSource, byteLength = 16): string {
  return bytesToHex(random.nextSecureBytes(byteLength));
}

export function computeCommitHash(fingers: number, call: number, nonce: string): string {
  return sha256Hex(`${fingers}|${call}|${nonce}`);
}

export function verifyCommitment(fingers: number, call: number, nonce: string, expectedHashHex: string): boolean {
  return computeCommitHash(fingers, call, nonce) === expectedHashHex;
}
