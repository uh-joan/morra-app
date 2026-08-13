// render/gameCards.ts — ports spikes/s03-beat.html L2996–3070: the round
// result card (pending/analyzing/incomplete/void/reveal), scoreboard, game
// end banner and the compact post-match card (3 mirror tiles over THIS
// match's history). Pure data→DOM.

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
import { GAME_END_TEXT, AI_COMMIT_STATUS, SYNC_OUTCOME_VOID_REASON, SCOREBOARD_TEXT } from "../game/copy.js";

export function renderGameRoundPending(): void {
  el.roundResultCard.className = "verdict-card idle";
  el.roundResultText.textContent = "–";
  el.roundResultDetail.textContent = "Throw and call your number!";
}

export function renderGameRoundAnalyzing(): void {
  el.roundResultCard.className = "verdict-card pending";
  el.roundResultText.textContent = "…";
  el.roundResultDetail.textContent = "Reading your throw…";
}

export function renderGameIncomplete(
  playerFingers: number | null,
  word: string | null,
  syncOutcome: string,
  commitHash8: string | null
): void {
  el.roundResultCard.className = "verdict-card incomplete";
  el.roundResultText.textContent = "INCOMPLETE — try again";
  let reason: string;
  if (playerFingers == null) reason = "no hand seen";
  else if (word == null || word === "?") reason = "no call word heard";
  else if (wordToNumber(word) == null) reason = "unrecognized call";
  // Phase C.2: fingers + a valid call word both landed, but the sync
  // outcome wasn't "synced" — this throw's timing just doesn't qualify,
  // not a recognition failure.
  else if (syncOutcome && syncOutcome !== "synced") reason = `not synced (${syncOutcome}) — throw + call together`;
  else reason = "unrecognized call";
  el.roundResultDetail.textContent = `${reason} — same commitment stands (${commitHash8 ?? "—"})`;
}

// Phase E.2/E.3: the rival was already revealed for this throw (phase 1)
// but the throw itself didn't come together — that revealed move can't just
// sit and wait for a retry (it's public now), so the round is VOID.
export function renderGameRoundVoid(syncOutcome: string): void {
  el.roundResultCard.className = "verdict-card incomplete";
  el.roundResultText.textContent = "RONDA ANUL·LADA";
  const reason = SYNC_OUTCOME_VOID_REASON[syncOutcome as keyof typeof SYNC_OUTCOME_VOID_REASON] || "not synced";
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
    (verified ? " · commitment ✓" : " · COMMITMENT VERIFY FAILED ✗");
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
