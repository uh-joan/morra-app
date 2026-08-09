// cryptoRandomSource.ts — the web implementation of @morra/core's
// RandomSource port, backed by crypto.getRandomValues. Core's own doc for
// RandomSource anticipates exactly this: "Any RandomSource implementation
// is free to back this with a real CSPRNG (platform-web's will)". The
// nextBytes() shape matches spikes/s03-beat.html's own
// crypto.getRandomValues(new Uint8Array(length)) usage (its LOG_SESSION_ID
// generator) directly.
import type { RandomSource } from "@morra/core";

export class CryptoRandomSource implements RandomSource {
  /** Uniform float in [0, 1) from 32 random bits — same precision class as
   * core's createSeededRandomSource's mulberry32 (nextUint32() / 2**32). */
  next(): number {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! / 4294967296;
  }

  nextBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }
}
