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
import { GAME_END_TEXT, AI_COMMIT_STATUS, PARATA_HEADLINE, SYNC_OUTCOME_VOID_REASON, SCOREBOARD_TEXT, ROUND_CARD_TEXT, TIMING_COACH, VERDICT_BANNER } from "../game/copy.js";

// ux-pirates r3: the verdict BANNER — same outcomes as the round card, but
// big and over the player card (where the eyes are). Shown by the resolve
// renders below, hidden at the next throw's onset (renderGameRoundAnalyzing)
// and on a fresh round (renderGameRoundPending); CSS dims it once the pill
// re-arms. Presentation only: it reads the same values the card does.
type BannerKind = "hit" | "miss" | "parata" | "void" | "incomplete";
function banner(kind: BannerKind, head: string, reason: string, seal = ""): void {
  const b = document.getElementById("verdictBanner");
  const h = document.getElementById("verdictBannerHead");
  const r = document.getElementById("verdictBannerReason");
  const sl = document.getElementById("verdictBannerSeal");
  if (!b || !h || !r) return;
  b.className = "verdict-banner " + kind;
  h.textContent = head;
  r.textContent = reason;
  if (sl) { sl.textContent = seal; sl.hidden = !seal; }
  b.hidden = false;
}
export function hideVerdictBanner(): void {
  const b = document.getElementById("verdictBanner");
  if (b) b.hidden = true;
}

export function renderGameRoundPending(): void {
  el.roundResultCard.className = "verdict-card idle";
  el.roundResultText.textContent = "–";
  el.roundResultDetail.textContent = ROUND_CARD_TEXT.pendingDetail;
  hideVerdictBanner();
}

export function renderGameRoundAnalyzing(): void {
  el.roundResultCard.className = "verdict-card pending";
  el.roundResultText.textContent = "…";
  el.roundResultDetail.textContent = ROUND_CARD_TEXT.analyzingDetail;
  hideVerdictBanner(); // a new throw is on: the last verdict never covers the reveal
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
  banner("incomplete", VERDICT_BANNER.incompleteHeadline, `${reason} · ${VERDICT_BANNER.incompleteTail}`);
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
  banner("void", "RONDA ANUL·LADA", reason);
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
  // Shared tie: winner "parata" means both guessed or neither — and if the
  // player's call hit the total, the rival's must have too (rules.ts).
  const bothGuessed = playerCallNumber === verdict.total;
  el.roundResultText.textContent =
    verdict.winner === "player" ? "TU GUANYES!" : verdict.winner === "ai" ? "RIVAL GUANYA" : PARATA_HEADLINE(bothGuessed);
  el.roundResultDetail.textContent =
    `tu: ${playerFingers} dits + "${playerWord}"(${playerCallNumber}) · rival: ${move.fingers} dits + ${aiWord}(${move.call}) · total ${verdict.total}` +
    (verified ? ` · ${ROUND_CARD_TEXT.sealOk}` : ` · ${ROUND_CARD_TEXT.sealFailed}`);
  // the trust mark rides along, quiet: the seal + the fingerprint it matched
  const seal = (verified ? ROUND_CARD_TEXT.sealOk : ROUND_CARD_TEXT.sealFailed) + " · " + move.hashHex.slice(0, 8);
  if (verdict.winner === "player") banner("hit", "TU GUANYES!", VERDICT_BANNER.win(playerFingers, move.fingers, verdict.total, playerWord), seal);
  else if (verdict.winner === "ai") banner("miss", "RIVAL GUANYA", VERDICT_BANNER.loss(playerFingers, move.fingers, verdict.total, aiWord), seal);
  else banner("parata", PARATA_HEADLINE(bothGuessed), VERDICT_BANNER.parata(playerFingers, move.fingers, verdict.total, playerWord, aiWord, bothGuessed), seal);
}

export function renderScoreboard(player: number, ai: number): void {
  el.scoreboard.textContent = SCOREBOARD_TEXT(player, ai);
  // r3: the big numerals in the top strip (the coins next to them are
  // rendered by pirate/render off the same scoreboard text)
  const y = document.getElementById("scoreYou"), r = document.getElementById("scoreRival");
  if (y) y.textContent = String(player);
  if (r) r.textContent = String(ai);
}

export function showGameEndBanner(winner: "player" | "ai", playerScore: number, aiScore: number): void {
  el.gameEndBanner.style.display = "block";
  el.gameEndText.textContent = GAME_END_TEXT(winner, playerScore, aiScore);
  el.aiCommitStatus.textContent = AI_COMMIT_STATUS.gameOver;
}

export function hideGameEndBanner(): void {
  el.gameEndBanner.style.display = "none";
}

// The reward beat: winning a duel opens the next corsair. Called from the
// game loop right after showGameEndBanner on a player win — `null` clears it
// (a loss, or a rival already beaten) so the line never lingers stale.
export function renderUnlockBanner(unlocked: { name: string } | { allConquered: true } | null): void {
  const b = el.unlockBanner;
  if (!unlocked) {
    b.hidden = true;
    b.textContent = "";
    return;
  }
  b.textContent = "allConquered" in unlocked
    ? "Has conquerit tots els mars. No queda ningú per vèncer."
    : `Has desbloquejat ${unlocked.name}!`;
  b.hidden = false;
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
