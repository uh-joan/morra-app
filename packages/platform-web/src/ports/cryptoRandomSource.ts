// cryptoRandomSource.ts — the web implementation of BOTH @morra/core's
// RandomSource port (decision randomness) AND its SecureRandomSource port
// (commitment nonces — security audit M6), backed by
// crypto.getRandomValues throughout. It's the only place in this codebase
// allowed to implement SecureRandomSource: core's own doc anticipates
// exactly this ("Any RandomSource implementation is free to back this with
// a real CSPRNG (platform-web's will)"), and nextSecureBytes()'s shape
// matches spikes/s03-beat.html's own
// crypto.getRandomValues(new Uint8Array(length)) usage (its LOG_SESSION_ID
// generator) directly.
import type { RandomSource, SecureRandomSource } from "@morra/core";

export class CryptoRandomSource implements RandomSource, SecureRandomSource {
  /** Uniform float in [0, 1) from 32 random bits — same precision class as
   * core's createSeededRandomSource's mulberry32 (nextUint32() / 2**32). */
  next(): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }

  nextSecureBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }
}
