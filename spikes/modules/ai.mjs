// ai.mjs — the rival's decision policy. Phase F extracts today's ONE live
// behavior (uniform f, uniform g) as a pure function; this is exactly
// "L2 — El Jugador" in the design doc's ladder (docs/rival-ai-design.md
// §2) — the equilibrium wall. Phase G adds the other three levels behind
// this same shape.
//
// Fairness invariant (design doc §4): the policy must be a PURE function of
// (rng, playerModelSnapshot, history) — decided from history strictly
// before the current throw; nothing about the pending throw may reach it.
// rng is injected (default Math.random) so a decision is replayable/
// testable without depending on the ambient global.

export const LEVELS = {
  L2: { id: "L2", name: "El Jugador", description: "uniform random — the honest equilibrium wall" },
};
export const DEFAULT_LEVEL = "L2";

// Today's only implemented level: f uniform 1-5, g uniform 1-5, independent
// — matches commitAiMove()'s move-generation exactly (pre-extraction).
// `history` and `modelSnapshot` are accepted now (per the fairness
// invariant's final shape) but unused until Phase G's ladder actually reads
// them — L1/L3/L4 are not implemented yet.
export function decideMove(level = DEFAULT_LEVEL, rng = Math.random, history = [], modelSnapshot = null) {
  const fingers = 1 + Math.floor(rng() * 5);            // 1-5
  const guessPlayerFingers = 1 + Math.floor(rng() * 5); // 1-5, uniform (L2)
  const call = fingers + guessPlayerFingers;             // 2-10
  return { level, fingers, guessPlayerFingers, call };
}
