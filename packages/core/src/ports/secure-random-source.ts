// SecureRandomSource port — security audit finding M6
// (docs/security-audit-2026-08-09.md): before this split, RandomSource
// itself carried a nextBytes(length) method, so any RandomSource
// implementation — INCLUDING createSeededRandomSource/
// createSequenceRandomSource, which are deterministic/replayable by design
// — structurally satisfied commit.ts's randomNonceHex. A deterministic
// nonce source is a real vulnerability (a brute-forceable commitment: the
// mulberry32 seed space is tiny compared to a real nonce's), but nothing
// caught a caller wiring a seeded source into nonce generation except
// discipline.
//
// Splitting nonce generation onto this SEPARATE interface makes that a
// COMPILE ERROR instead: randomNonceHex now requires SecureRandomSource,
// and RandomSource (src/ports/random-source.ts) no longer has a
// nextSecureBytes-shaped method at all, so createSeededRandomSource/
// createSequenceRandomSource simply cannot be passed where a nonce source
// is required — TypeScript rejects it before the mistake ever ships.
export interface SecureRandomSource {
  /** `length` CRYPTOGRAPHICALLY SECURE random bytes. Real implementations
   * MUST back this with a CSPRNG (crypto.getRandomValues on the web — see
   * @morra/platform-web's CryptoRandomSource, which implements both this
   * and RandomSource). Never implement this with a deterministic/seeded
   * generator, even for tests — a test double that needs to LOOK like it
   * satisfies this interface is itself the bug this port exists to prevent. */
  nextSecureBytes(length: number): Uint8Array;
}
