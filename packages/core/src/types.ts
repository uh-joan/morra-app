// Shared cross-module shapes — kept separate from ai.ts/playermodel.ts so
// neither has to import the other just for a type, matching the plan's
// src/types/ convention (timeline/renderer/recognizer contracts land here
// too, in later phases).

/** Who a resolved round went to — "parata" is the shared-tie/no-point case
 * from real morra's rules (both or neither guessed the total). */
export type VerdictWinner = "player" | "ai" | "parata";

/**
 * One past round/throw, oldest-first in a history array. Ported verbatim
 * from spikes/modules/ai.mjs's JSDoc'd shape — consumed by ai.ts's
 * predictors, playermodel.ts's PlayerModel, and mirror.ts's analytics.
 * playerCall/aiCall are 2-10 (the spoken/heard call, c = f + g);
 * playerFingers/aiFingers/aiGuessPlayerFingers are 1-5 or null
 * (unknown/unrevealed). syncOutcome/syncDeltaMs/playerWord/sessionId/atIso
 * are optional — the spike's page attaches them for the mirror's timing/
 * word-histogram views; ai.ts's predictors don't require them.
 */
export interface HistoryEntry {
  throwIndex?: number;
  sessionId?: string;
  atIso?: string;
  playerFingers: number | null;
  playerCall: number | null;
  playerWord?: string | null;
  aiFingers: number | null;
  aiCall: number | null;
  aiGuessPlayerFingers?: number | null;
  aiLevel?: string | null;
  verdictWinner: VerdictWinner | null;
  syncOutcome?: string | null;
  syncDeltaMs?: number | null;
}

/** A probability distribution over fingers/guesses 1-5 — every entry must
 * be present (never a sparse/partial map); values need not be pre-verified
 * to sum to 1 by the type system, but every producer in this package does. */
export type FingerDistribution = Record<1 | 2 | 3 | 4 | 5, number>;
