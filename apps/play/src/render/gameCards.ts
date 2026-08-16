// render/gameCards.ts — ports spikes/s03-beat.html L2996–3070: the round
// result card (pending/analyzing/incomplete/void/reveal), scoreboard, game
// end banner and the compact post-match card (3 mirror tiles over THIS
// match's history). Pure data→DOM. ux-pirates: detail copy is Catalan (via
// ROUND_CARD_TEXT); the FROZEN verdict headlines the parity harness
// compares against the spike are unchanged.

import {
  computeExploitability,
  computeMicatioVerdict,
  computeRandomnessScore,
  computeSyncStats,
  NUMBER_TO_CATALAN_CALL,
  wordToNumber,
  type AiMove,
  type HistoryEntry,
} from "@morra/core";
import { el } from "../dom.js";
import { GAME_END_TEXT, AI_COMMIT_STATUS, SYNC_OUTCOME_VOID_REASON, SCOREBOARD_TEXT, ROUND_CARD_TEXT, TIMING_COACH } from "../game/copy.js";

export function renderGameRoundPending(): void {
  el.roundResultCard.className = "verdict-card idle";
  el.roundResultText.textContent = "–";
  el.roundResultDetail.textContent = ROUND_CARD_TEXT.pendingDetail;
}

export function renderGameRoundAnalyzing(): void {
  el.roundResultCard.className = "verdict-card pending";
  el.roundResultText.textContent = "…";
  el.roundResultDetail.textContent = ROUND_CARD_TEXT.analyzingDetail;
}

export function renderGameIncomplete(
  playerFingers: number | null,
  word: string | null,
  syncOutcome: string,
  commitHash8: string | null,
  syncDeltaMs?: number | null,
  voicePreWindow?: boolean
): void {
  el.roundResultCard.className = "verdict-card incomplete";
  el.roundResultText.textContent = ROUND_CARD_TEXT.incompleteHeadline;
  let reason: string;
  if (playerFingers == null) reason = ROUND_CARD_TEXT.noHand;
  else if (word == null || word === "?") reason = ROUND_CARD_TEXT.noWord;
  else if (wordToNumber(word) == null) reason = ROUND_CARD_TEXT.unrecognized;
  // Phase C.2: fingers + a valid call word both landed, but the sync
  // outcome wasn't "synced" — this throw's timing just doesn't qualify,
  // not a recognition failure.
  else if (syncOutcome === "voice-late" || syncOutcome === "voice-early")
    reason = TIMING_COACH(syncOutcome, syncDeltaMs, playerFingers, voicePreWindow);
  else if (syncOutcome && syncOutcome !== "synced") reason = ROUND_CARD_TEXT.notSynced(syncOutcome);
  else reason = ROUND_CARD_TEXT.unrecognized;
  el.roundResultDetail.textContent = `${reason} — ${ROUND_CARD_TEXT.commitmentStands(commitHash8 ?? "—")}`;
}

// Phase E.2/E.3: the rival was already revealed for this throw (phase 1)
// but the throw itself didn't come together — that revealed move can't just
// sit and wait for a retry (it's public now), so the round is VOID.
export function renderGameRoundVoid(syncOutcome: string, syncDeltaMs?: number | null, playerFingers?: number | null, voicePreWindow?: boolean): void {
  el.roundResultCard.className = "verdict-card incomplete";
  el.roundResultText.textContent = "RONDA ANUL·LADA";
  const coach = TIMING_COACH(syncOutcome, syncDeltaMs, playerFingers, voicePreWindow);
  const reason = coach || SYNC_OUTCOME_VOID_REASON[syncOutcome as keyof typeof SYNC_OUTCOME_VOID_REASON] || "fora de temps";
  el.roundResultDetail.textContent = `${reason} — torna-hi (el rival ja ha fet una nova aposta)`;
}

export function renderGameReveal(
  move: AiMove & { hashHex: string },
  verified: boolean,
  playerFingers: number,
  playerCallNumber: number,
  verdict: ReturnType<typeof computeMicatioVerdict>,
  playerWord: string | null
): void {
  const aiWord = NUMBER_TO_CATALAN_CALL[move.call] || String(move.call);
  el.roundResultCard.className =
    "verdict-card " + (verdict.winner === "player" ? "hit" : verdict.winner === "ai" ? "miss" : "pending");
  el.roundResultText.textContent =
    verdict.winner === "player" ? "TU GUANYES!" : verdict.winner === "ai" ? "RIVAL GUANYA" : "PARATA";
  el.roundResultDetail.textContent =
    `tu: ${playerFingers} dits + "${playerWord}"(${playerCallNumber}) · rival: ${move.fingers} dits + ${aiWord}(${move.call}) · total ${verdict.total}` +
    (verified ? ` · ${ROUND_CARD_TEXT.sealOk}` : ` · ${ROUND_CARD_TEXT.sealFailed}`);
}

export function renderScoreboard(player: number, ai: number): void {
  el.scoreboard.textContent = SCOREBOARD_TEXT(player, ai);
}

export function showGameEndBanner(winner: "player" | "ai", playerScore: number, aiScore: number): void {
  el.gameEndBanner.style.display = "block";
  el.gameEndText.textContent = GAME_END_TEXT(winner, playerScore, aiScore);
  el.aiCommitStatus.textContent = AI_COMMIT_STATUS.gameOver;
}

export function hideGameEndBanner(): void {
  el.gameEndBanner.style.display = "none";
}

// Phase H spec point 4: a compact 3-number card over THIS match's own
// history (matchHistory — reset per game, unlike the cross-match
// playerModel the full Entrenament panel reads).
export function renderPostMatchCard(matchHistory: readonly HistoryEntry[]): void {
  const exploit = computeExploitability(matchHistory);
  const randomness = computeRandomnessScore(matchHistory);
  const syncStats = computeSyncStats(matchHistory);
  el.postMatchExploitability.textContent = exploit.rate != null ? `${(exploit.rate * 100).toFixed(0)}%` : "—";
  el.postMatchRandomness.textContent = randomness ? `${randomness.redundancyPct.toFixed(1)}%` : "—";
  el.postMatchSyncRate.textContent = syncStats.syncRate != null ? `${(syncStats.syncRate * 100).toFixed(0)}%` : "—";
}
