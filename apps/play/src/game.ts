// game.ts — ports spikes/s03-beat.html's game layer: commitAiMove
// (L2876–2902), level selector wiring (L2933–2952), revealRivalPhase1
// (L2964–2994), resetGame (L3071–3090), history persistence +
// recordTrainingThrow (L3185–3225), resolveGameRound / maybeResolveGameRound
// (L3319–3425). Layered on top of analysis.ts's throw pipeline via the
// GameHooks seam — every hand+voice event still runs through
// onSyncHandOnset/finalizeSyncThrow/applyRecognizedWord exactly as before.
//
// Fairness: commit-before-reveal. The AI's move is chosen and hashed
// ("fingers|call|nonce" → SHA-256) BEFORE the player throws; only the hash
// is shown. Phase-1 reveal at a confident settle (fingers>=2) leaks nothing
// (the move was sealed), and a revealed move is single-use: burn-and-remint.

import {
  DEFAULT_LEVEL,
  decideMove,
  toHistoryArray,
  recordThrow,
  randomNonceHex,
  computeCommitHash,
  verifyCommitment,
  computeMicatioVerdict,
  wordToNumber,
  shouldRevealPhase1,
  type AiMove,
  type HistoryEntry,
  type PlayerModel,
} from "@morra/core";
import { CryptoRandomSource } from "@morra/platform-web";
import { GAME_WIN_SCORE, RIVAL_VOICE_DEFER, RIVAL_VOICE_DEFER_EPS_MS, SYNC_POST_MS } from "./config.js";
import { el } from "./dom.js";
import { ctx } from "./audioClock.js";
import { logEvent, LOG_SESSION_ID } from "./telemetry.js";
import { reportError } from "./status.js";
import { setGameHooks, type ThrowEvent } from "./analysis.js";
import { markThrowResolvedForReadyPill, renderReadyPill, resetReadyPillForNewGame } from "./readyPill.js";
import { setLastRoundAudioEndCtxTime } from "./rivalAudioLog.js";
import { playRivalCall, preloadRivalVoiceClips } from "./rivalVoice.js";
import { loadPlayerModel, savePlayerModel } from "./profile.js";
import { voskLoaded } from "./vosk.js";
import {
  populateAiLevelSelector,
  renderAiLevelDescription,
  renderRivalAvatar,
  renderRivalCommitted,
  renderRivalReveal,
} from "./render/rival.js";
import {
  hideGameEndBanner,
  renderGameIncomplete,
  renderGameReveal,
  renderGameRoundAnalyzing,
  renderGameRoundPending,
  renderGameRoundVoid,
  renderPostMatchCard,
  renderScoreboard,
  showGameEndBanner,
} from "./render/gameCards.js";

export type CommittedAiMove = AiMove & { nonce: string; hashHex: string };

export type SessionMode = "partida" | "entrenament";

const random = new CryptoRandomSource();

let sessionMode: SessionMode = "partida";
let currentAiMove: CommittedAiMove | null = null;
let gameScore = { player: 0, ai: 0 };
let gameOver = false;
let currentAiLevel: string = DEFAULT_LEVEL;
let matchHistory: HistoryEntry[] = [];
let playerModel: PlayerModel = loadPlayerModel();

// M6's L'Espill panel plugs in here (called after every training throw).
let renderTrainingPanelHook: () => void = () => {};
export function setTrainingPanelHook(hook: () => void): void {
  renderTrainingPanelHook = hook;
}

export function playVsOpponent(): boolean {
  return sessionMode === "partida";
}
export function getSessionMode(): SessionMode {
  return sessionMode;
}
export function setSessionModeState(mode: SessionMode): void {
  sessionMode = mode;
}
export function getGameScore(): { player: number; ai: number } {
  return gameScore;
}
export function isGameOver(): boolean {
  return gameOver;
}
export function getMatchHistory(): HistoryEntry[] {
  return matchHistory;
}
export function getPlayerModel(): PlayerModel {
  return playerModel;
}
export function setPlayerModelState(model: PlayerModel): void {
  playerModel = model;
}
export function getCurrentAiMove(): CommittedAiMove | null {
  return currentAiMove;
}
export function getCurrentAiLevel(): string {
  return currentAiLevel;
}
export function setCurrentAiLevel(level: string): void {
  currentAiLevel = level;
  renderAiLevelDescription(level);
  renderRivalAvatar(level);
}

export function commitAiMove(): void {
  // Phase G: L1-L3 read the CURRENT MATCH's history only; L4 reads the
  // cross-match history persisted in playerModel. The policy itself stays
  // agnostic — that choice is made here, at the call site.
  const history = currentAiLevel === "L4" ? toHistoryArray(playerModel) : matchHistory;
  const move = decideMove(currentAiLevel, random, history, null);
  const nonce = randomNonceHex(random);
  let hashHex: string;
  try {
    hashHex = computeCommitHash(move.fingers, move.call, nonce);
  } catch (err) {
    reportError("game-commit", err);
    el.aiCommitStatus.textContent = "Commitment error: " + (err instanceof Error ? err.message : String(err));
    return;
  }
  currentAiMove = { ...move, nonce, hashHex, level: currentAiLevel };
  // Phase D: only the fingerprint (hash) is logged here, never fingers/
  // call/nonce — those are the commit-before-reveal secret and only get
  // logged (in game_reveal) once actually disclosed. predictedDist/λ/
  // weights describe what the AI thinks the PLAYER will do — safe to log.
  logEvent("game_commit", {
    commitmentHash: hashHex,
    level: currentAiLevel,
    predictedPlayerFDist: move.predictedPlayerFDist,
    lambda: move.lambda,
    predictorWeights: move.predictorWeights,
  });
}

// Phase E: the AI's move was sealed before the player ever threw, so
// revealing it the instant a real throw is detected leaks nothing and can't
// be reacted to — this kills the perceived lag between throwing and seeing
// the rival's hand. A revealed move is single-use regardless of outcome:
// the moment it's shown, a fresh commitment is minted for whatever throw
// comes next (kept unrendered until then).
function revealRivalPhase1(throwEvent: ThrowEvent): void {
  const move = currentAiMove;
  if (!move) return;
  const t0 = performance.now();
  let verified = false;
  try {
    verified = verifyCommitment(move.fingers, move.call, move.nonce, move.hashHex);
  } catch (err) {
    reportError("game-verify", err);
  }
  throwEvent.rivalRevealed = true;
  throwEvent.revealedAiMove = move;
  throwEvent.revealedVerified = verified;
  renderRivalReveal(move, verified);
  // Default: clip fires at reveal, i.e. DURING the player's own capture
  // window (blanking covers it -- at the cost of erasing whatever tail of
  // the player's shout overlaps it). ?veudelay=1 (A/B, 2026-08-16): defer
  // the clip to window close + epsilon, anchored to THIS throw's motion
  // start -- still a pure reaction to the player's own event, never a
  // metronome.
  let startAtCtxTime: number | undefined;
  if (RIVAL_VOICE_DEFER && throwEvent.handOnsetPerfTime != null) {
    const delayMs = throwEvent.handOnsetPerfTime + SYNC_POST_MS + RIVAL_VOICE_DEFER_EPS_MS - performance.now();
    if (delayMs > 0) startAtCtxTime = ctx.currentTime + delayMs / 1000;
  }
  const clipPlayback = playRivalCall(move.call, startAtCtxTime);
  // Phase C.4: floor for the NEXT throw's window clamp (see clampFloorCtxTime
  // in onSyncHandOnset — never used against THIS throw's own window).
  setLastRoundAudioEndCtxTime(clipPlayback ? clipPlayback.endCtxTime : ctx.currentTime);
  if (throwEvent.debugRec) {
    throwEvent.debugRec.rivalReveal = {
      commitmentHash: move.hashHex,
      aiFingers: move.fingers,
      aiCall: move.call,
      verified,
      latencyMs: performance.now() - t0,
    };
  }
  logEvent("rival_reveal_phase1", {
    throwIndex: throwEvent.throwIndex,
    commitmentHash: move.hashHex,
    aiFingers: move.fingers,
    aiCall: move.call,
    verified,
    latencyMs: performance.now() - t0,
  });
  // Burn it: mint the next commitment now, in the background — this one can
  // never be offered again. Not rendered yet, so the just-revealed hand/word
  // stays on screen until the next throw's onset.
  if (!gameOver) commitAiMove();
}

// Phase G: every throw with a known playerFingers feeds the shared
// PlayerModel — both the in-match matchHistory (L1-L3) and the cross-match
// persisted playerModel (L4) — regardless of whether the round scored,
// voided, or was never revealed. A "reset" is the only exclusion, upstream.
function persistHistoryEntry(entry: HistoryEntry): void {
  matchHistory.push(entry);
  playerModel = recordThrow(playerModel, entry);
  savePlayerModel(playerModel);
}

function recordMatchHistoryEntry(
  throwEvent: ThrowEvent,
  playerFingers: number,
  playerCallNumber: number | null,
  aiMove: CommittedAiMove | null,
  verdictWinner: "player" | "ai" | "parata" | null
): void {
  const entry: HistoryEntry = {
    throwIndex: throwEvent.throwIndex,
    sessionId: LOG_SESSION_ID,
    atIso: new Date().toISOString(),
    playerFingers,
    playerCall: playerCallNumber,
    playerWord: throwEvent.word || null,
    aiFingers: aiMove ? aiMove.fingers : null,
    aiCall: aiMove ? aiMove.call : null,
    aiGuessPlayerFingers: aiMove ? aiMove.guessPlayerFingers : null,
    aiLevel: (aiMove && aiMove.level) || currentAiLevel,
    verdictWinner,
    syncOutcome: throwEvent.outcome,
    syncDeltaMs: throwEvent.syncDeltaMs,
  };
  persistHistoryEntry(entry);
  const aimHit = aiMove && aiMove.guessPlayerFingers != null ? aiMove.guessPlayerFingers === playerFingers : null;
  logEvent("ai_aim_result", {
    throwIndex: throwEvent.throwIndex,
    level: entry.aiLevel,
    guessPlayerFingers: entry.aiGuessPlayerFingers,
    actualPlayerFingers: playerFingers,
    aimHit,
  });
}

// Phase H: Entrenament has NO game/AI/commitments at all — but every
// finalized non-reset throw still feeds the SAME shared PlayerModel the
// ladder reads, and drives the live mirror panel in the rival's place.
function recordTrainingThrow(throwEvent: ThrowEvent): void {
  const playerFingers = throwEvent.handFingerCount;
  if (playerFingers == null) return;
  const entry: HistoryEntry = {
    throwIndex: throwEvent.throwIndex,
    sessionId: LOG_SESSION_ID,
    atIso: new Date().toISOString(),
    playerFingers,
    playerCall: wordToNumber(throwEvent.word),
    playerWord: throwEvent.word || null,
    aiFingers: null,
    aiCall: null,
    aiGuessPlayerFingers: null,
    aiLevel: null,
    verdictWinner: null,
    syncOutcome: throwEvent.outcome,
    syncDeltaMs: throwEvent.syncDeltaMs,
  };
  persistHistoryEntry(entry);
  logEvent("training_throw", {
    throwIndex: entry.throwIndex,
    playerFingers,
    playerCall: entry.playerCall,
    syncOutcome: entry.syncOutcome,
  });
  markThrowResolvedForReadyPill(playerFingers);
  renderTrainingPanelHook();
}

function resolveGameRound(
  throwEvent: ThrowEvent,
  playerFingers: number,
  word: string | null,
  playerCallNumber: number
): void {
  // Phase E: normally the rival was already revealed — and a fresh
  // commitment already minted — back at phase-1 reveal. This only falls
  // back to the full legacy reveal-here path if that never happened.
  const alreadyRevealed = !!throwEvent.rivalRevealed;
  const move = (alreadyRevealed ? (throwEvent.revealedAiMove as CommittedAiMove) : currentAiMove) ?? null;
  if (!move) return;
  let verified: boolean;
  if (alreadyRevealed) {
    verified = !!throwEvent.revealedVerified;
  } else {
    verified = false;
    try {
      verified = verifyCommitment(move.fingers, move.call, move.nonce, move.hashHex);
    } catch (err) {
      reportError("game-verify", err);
    }
  }
  const verdict = computeMicatioVerdict(playerFingers, playerCallNumber, move.fingers, move.call);
  if (verdict.winner === "player") gameScore.player++;
  else if (verdict.winner === "ai") gameScore.ai++;

  renderGameReveal(move, verified, playerFingers, playerCallNumber, verdict, word);
  if (!alreadyRevealed) {
    // legacy fallback only — phase-1 already rendered the reveal, played
    // the clip, and set the C.4 clamp floor for this move.
    renderRivalReveal(move, verified);
    const clipPlayback = playRivalCall(move.call);
    setLastRoundAudioEndCtxTime(clipPlayback ? clipPlayback.endCtxTime : ctx.currentTime);
  }
  renderScoreboard(gameScore.player, gameScore.ai);
  markThrowResolvedForReadyPill(playerFingers);

  if (throwEvent.debugRec) {
    throwEvent.debugRec.game = {
      aiFingers: move.fingers,
      aiCall: move.call,
      aiGuessPlayerFingers: move.guessPlayerFingers,
      commitmentHash: move.hashHex,
      nonce: move.nonce,
      verified,
      playerFingers,
      playerWord: word,
      playerCallNumber,
      total: verdict.total,
      playerCorrect: verdict.playerCorrect,
      aiCorrect: verdict.aiCorrect,
      verdictWinner: verdict.winner,
      scoreAfter: { player: gameScore.player, ai: gameScore.ai },
      revealedEarly: alreadyRevealed,
    };
  }

  logEvent("game_reveal", {
    throwIndex: throwEvent.throwIndex,
    aiFingers: move.fingers,
    aiCall: move.call,
    commitmentHash: move.hashHex,
    verified,
    playerFingers,
    playerWord: word,
    playerCallNumber,
    total: verdict.total,
    verdictWinner: verdict.winner,
    scoreAfter: { player: gameScore.player, ai: gameScore.ai },
    revealedEarly: alreadyRevealed,
  });
  // Phase G: feed the ladder BEFORE minting the next commitment, so that
  // next decision already sees this round.
  recordMatchHistoryEntry(throwEvent, playerFingers, playerCallNumber, move, verdict.winner);

  if (gameScore.player >= GAME_WIN_SCORE || gameScore.ai >= GAME_WIN_SCORE) {
    gameOver = true;
    showGameEndBanner(gameScore.player >= GAME_WIN_SCORE ? "player" : "ai", gameScore.player, gameScore.ai);
    renderPostMatchCard(matchHistory);
  } else if (!alreadyRevealed) {
    commitAiMove(); // legacy fallback only — phase-1 already minted otherwise
  }
}

// Hooked from both finalizeSyncThrow (handles the "vosk never loaded, word
// will never arrive" case) and applyRecognizedWord (the normal path, once
// recognition actually lands). Runs at most once per throw (gameHandled).
export function maybeResolveGameRound(throwEvent: ThrowEvent): void {
  if (!playVsOpponent() || gameOver) return;
  if (!throwEvent || throwEvent.kind !== "sync" || throwEvent.gameHandled) return;
  if (throwEvent.pending) return; // hand/voice still resolving
  // Phase C.1: a reset is never a throw — never touches the game, never
  // consumes the AI's commitment.
  if (throwEvent.outcome === "reset") {
    throwEvent.gameHandled = true;
    return;
  }
  if (voskLoaded() && throwEvent.word == null) return; // recognition still in flight

  throwEvent.gameHandled = true;
  const playerFingers = throwEvent.handFingerCount;
  const playerCallNumber = wordToNumber(throwEvent.word);
  // Phase C.2: game rounds resolve ONLY on a genuinely synced throw —
  // voice-early/late, pinned pairings, hand-only and voice-only all show
  // their own outcome card but must never consume/resolve the committed
  // AI move.
  if (throwEvent.outcome !== "synced" || playerFingers == null || playerCallNumber == null) {
    if (throwEvent.rivalRevealed) {
      // Phase E.2/E.3: revealed but didn't pair up — burned, round void.
      renderGameRoundVoid(throwEvent.outcome);
      const revealed = throwEvent.revealedAiMove as CommittedAiMove | null;
      const burnedHash = revealed ? revealed.hashHex : null;
      if (throwEvent.debugRec)
        throwEvent.debugRec.game = {
          void: true,
          playerFingers,
          playerWord: throwEvent.word,
          syncOutcome: throwEvent.outcome,
          burnedCommitmentHash: burnedHash,
        };
      logEvent("reveal_burned", {
        throwIndex: throwEvent.throwIndex,
        reason: throwEvent.outcome,
        burnedCommitmentHash: burnedHash,
      });
      // Phase G: the throw itself is still real signal, even though void.
      if (playerFingers != null) recordMatchHistoryEntry(throwEvent, playerFingers, playerCallNumber, revealed, null);
    } else {
      renderGameIncomplete(
        playerFingers,
        throwEvent.word,
        throwEvent.outcome,
        currentAiMove ? currentAiMove.hashHex.slice(0, 8) : null
      );
      if (throwEvent.debugRec)
        throwEvent.debugRec.game = {
          incomplete: true,
          playerFingers,
          playerWord: throwEvent.word,
          syncOutcome: throwEvent.outcome,
        };
      // AI's commitment stays exactly as-is — same hash, next throw retries.
      if (playerFingers != null) recordMatchHistoryEntry(throwEvent, playerFingers, playerCallNumber, null, null);
    }
    markThrowResolvedForReadyPill(playerFingers);
    return;
  }
  resolveGameRound(throwEvent, playerFingers, throwEvent.word, playerCallNumber);
}

export function resetGame(): void {
  gameScore = { player: 0, ai: 0 };
  gameOver = false;
  hideGameEndBanner();
  renderScoreboard(0, 0);
  renderGameRoundPending();
  // step 13: a fresh game reads ready immediately, per spec.
  resetReadyPillForNewGame();
  setLastRoundAudioEndCtxTime(null); // Phase C.4: no prior round's audio in a fresh game
  matchHistory = []; // Phase G: in-match history resets — playerModel (cross-match, L4) deliberately does NOT
  renderReadyPill();
  // No prior reveal to preserve here — safe to show the fresh commitment.
  if (playVsOpponent()) {
    commitAiMove();
    if (currentAiMove) renderRivalCommitted(currentAiMove);
    void preloadRivalVoiceClips(); // idempotent
  }
}

/** Bootstrap: wires the game layer into analysis.ts's hooks and the DOM,
 * and starts the first match (Partida is the default session mode). */
export function installGame(): void {
  setGameHooks({
    onThrowStart(t) {
      // step 11/12: a fresh throw starting replaces the previous round's
      // reveal on screen — not the auto-recommit that follows it.
      if (!playVsOpponent() || gameOver) return;
      renderGameRoundAnalyzing();
      // Phase E.1: a settle at fingerCount>=2 is confident enough to be a
      // real throw — reveal the sealed move immediately. Counts <=1 could
      // still turn out to be a reset, so they keep showing the fist.
      if (shouldRevealPhase1(t.handFingerCount)) {
        revealRivalPhase1(t);
      } else if (currentAiMove) {
        renderRivalCommitted(currentAiMove);
      }
    },
    onThrowFinalized(t) {
      maybeResolveGameRound(t); // no-ops in Entrenament
      // Phase H: Entrenament's own hook — a reset is still never a throw.
      if (sessionMode === "entrenament" && t.outcome !== "reset") recordTrainingThrow(t);
    },
    onWordApplied(t) {
      maybeResolveGameRound(t);
    },
    onReset() {
      if (playVsOpponent() && !gameOver) renderGameRoundPending();
    },
  });

  populateAiLevelSelector(currentAiLevel);
  renderAiLevelDescription(currentAiLevel);
  renderRivalAvatar(currentAiLevel);
  el.selAiLevel.addEventListener("change", () => {
    // Switching levels only changes what the NEXT commitAiMove() decides —
    // it never touches a commitment already sealed.
    currentAiLevel = el.selAiLevel.value;
    renderAiLevelDescription(currentAiLevel);
    renderRivalAvatar(currentAiLevel);
    logEvent("setting_change", { setting: "aiLevel", value: currentAiLevel });
  });
  el.btnPlayAgain.addEventListener("click", resetGame);

  // Partida is the default session mode: game + rival panels visible.
  el.gamePanel.style.display = "flex";
  el.rivalSide.style.display = "flex";
  renderScoreboard(0, 0);
  renderGameRoundPending();
  commitAiMove();
  if (currentAiMove) renderRivalCommitted(currentAiMove);
  void preloadRivalVoiceClips();
}
