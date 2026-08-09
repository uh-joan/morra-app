// RandomSource port — replaces every direct Math.random()/rng-closure call
// from the spike's modules/ai.mjs and modules/commit.mjs. Fairness invariant
// (docs/rival-ai-design.md §4, plan's "policy purity contract"): a decision
// must be a pure function of (RandomSource sequence, model snapshot,
// history) — injecting this port, rather than reading Math.random ambiently,
// is what makes that provable and replayable.
export interface RandomSource {
  /** Uniform float in [0, 1) — replaces Math.random(). */
  next(): number;
}

// A deterministic, dependency-free RandomSource (mulberry32) — useful for
// tests and for deterministic replay (the plan's fairness transcript
// verifier eventually wants exactly this: seed in, identical sequence out).
// NOT cryptographically secure; never use for anything requiring real
// unpredictability outside of tests/replay.
export function createSeededRandomSource(seed: number): RandomSource {
  let a = seed >>> 0;
  function nextUint32(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }
  return {
    next(): number {
      return nextUint32() / 4294967296;
    },
  };
}

// A RandomSource that replays a FIXED sequence of [0,1) floats, cycling once
// exhausted — the conformance corpus's mechanism for "fixed rng sequence +
// history -> exact decision" (M1 verification requirement). Nonce
// generation isn't part of this contract at all (see
// secure-random-source.ts) — commit-hash corpus cases pass the nonce
// directly as a string instead.
export function createSequenceRandomSource(sequence: readonly number[]): RandomSource {
  if (sequence.length === 0) throw new Error("createSequenceRandomSource: sequence must be non-empty");
  let i = 0;
  return {
    next(): number {
      const v = sequence[i % sequence.length]!;
      i++;
      return v;
    },
  };
}
