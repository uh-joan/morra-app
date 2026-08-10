// gameStore.ts — ALL game/session state lives here, OUTSIDE React (M4
// dispatch's React-boundary law). This is the self-paced sync-mode round
// state machine from spikes/s03-beat.html (onSyncHandOnset ->
// triggerSyncAudioAnalysis -> finalizeSyncThrow -> maybeResolveGameRound /
// recordTrainingThrow), ported as an explicit, testable class instead of
// module-level globals + DOM-reading closures. It never touches the DOM,
// AudioContext, camera, or mic directly — those are impure "sensor"
// concerns owned by src/sensors/sensorPipeline.ts, which calls this
// store's public methods with already-recognized results (finger counts,
// voice onsets, recognized words). That seam is also what lets the M4
// integration test drive a full round headlessly by injecting synthetic
// recognizer results, per the dispatch's test-mode requirement.
//
// Beat mode (the earlier metronome-driven mode) is NOT ported here — only
// the self-paced sync pipeline that Partida/Entrenament both share.
import {
  computeCommitHash,
  computeMicatioVerdict,
  createEmptyModel,
  decideMove,
  DEFAULT_LEVEL,
  classifyHandSettleForSync,
  classifySyncThrow,
  computeBigramHeatmap,
  computeExploitability,
  computeHistograms,
  computeRandomnessScore,
  computeSyncStats,
  computeTopTells,
  randomNonceHex,
  recordThrow,
  shouldRevealPhase1,
  toHistoryArray,
  verifyCommitment,
  wordToNumber,
  type AiLevel,
  type AiMove,
  type Clock,
  type HistoryEntry,
  type PlayerModel,
  type PlayerModelStore,
  type RandomSource,
  type SecureRandomSource,
  type TelemetryEvent,
  type TelemetrySink,
  type VerdictWinner,
} from "@morra/core";
import { handHasResetSince } from "./handHasReset.js";

export type SessionMode = "partida" | "entrenament";
export type SyncOutcome = "synced" | "voice-late" | "voice-early" | "hand-only";
export type RoundPhase = "idle" | "analyzing" | "incomplete" | "void" | "player" | "ai" | "parata";

export const GAME_WIN_SCORE = 10;

// Hardcoded per the spike (NOT exposed in settings UI — confirmed via the
// spike-mapping exploration): SYNC_PRE_MS/SYNC_POST_MS/
// SYNC_PARTNER_TIMEOUT_MS. Only coOccurrenceMs/vadMult/highV/lowV/settleMs
// are user-adjustable (settings.ts + SettingsPanel.tsx).
export const SYNC_PRE_MS = 400;
export const SYNC_POST_MS = 700;

export interface GameSettings {
  coOccurrenceMs: number;
  vadMult: number;
  highV: number;
  lowV: number;
  settleMs: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  coOccurrenceMs: 400,
  vadMult: 6,
  highV: 0.9,
  lowV: 0.25,
  settleMs: 50,
};

interface ThrowEventState {
  handOnsetPerfTime: number;
  rawFingerCount: number | null;
  effectiveFingerCount: number | null;
  isReset: boolean;
  voiceOnsetPerfTime: number | null;
  playerWord: string | null;
  outcome: SyncOutcome | "reset" | "pending";
  syncDeltaMs: number | null;
  rivalRevealed: boolean;
  revealedAiMove: AiMove | null;
  revealedVerified: boolean | null;
  handled: boolean;
  audioLanded: boolean;
  wordLanded: boolean;
  clampFloorCtxTime: number | null;
}

export interface ClipPlayback {
  startCtxTime: number;
  endCtxTime: number;
}

export interface GameState {
  mode: SessionMode;
  aiLevel: AiLevel;
  gameScore: { player: number; ai: number };
  gameOver: boolean;
  matchHistory: HistoryEntry[];
  playerModel: PlayerModel;
  /** The SECRET committed move for the round about to be thrown — never
   * bind UI to this directly (it would leak the reveal early); it exists
   * on the state object for debugging/tests only. The UI's hand/avatar
   * display must read displayedAiMove instead. */
  currentAiMove: AiMove | null;
  currentCommitHash: string | null;
  /** What the rival's hand/avatar should currently SHOW — null means
   * fist/hidden ("committed, not yet revealed"). Set at reveal time
   * (revealAndMintNext) and cleared at the START of the next hand onset
   * (unless that same onset is itself immediately re-revealed), so the
   * just-revealed hand stays visible exactly as long as the spike's
   * "until the next throw's onset" rule specifies. */
  displayedAiMove: AiMove | null;
  displayedVerified: boolean | null;
  /** The hash that was ACTUALLY verified for displayedAiMove — distinct
   * from the live currentCommitHash, which by reveal time already belongs
   * to the newly re-minted NEXT round's secret commitment. */
  displayedCommitHash: string | null;
  handArmedForNextThrow: boolean;
  throwInProgress: boolean;
  lastThrownFingerCount: number | null;
  lastRoundAudioEndCtxTime: number | null;
  rivalClipPlaybacks: ClipPlayback[];
  roundPhase: RoundPhase;
  voidOutcome: SyncOutcome | null;
  settings: GameSettings;
  voskLoaded: boolean;
  gameEndWinner: "player" | "ai" | null;
  mirrorScope: "session" | "allTime";
}

export interface MirrorData {
  exploitability: ReturnType<typeof computeExploitability>;
  randomness: ReturnType<typeof computeRandomnessScore>;
  histograms: ReturnType<typeof computeHistograms>;
  tells: ReturnType<typeof computeTopTells>;
  bigram: ReturnType<typeof computeBigramHeatmap>;
  syncStats: ReturnType<typeof computeSyncStats>;
}

export interface GameStoreDeps {
  playerModelStore: PlayerModelStore;
  random: RandomSource;
  secureRandom: SecureRandomSource;
  clock: Clock;
  sessionId: string;
  telemetry?: TelemetrySink;
}

type Listener = () => void;

function emitTelemetry(deps: GameStoreDeps, event: { type: string } & Record<string, unknown>): void {
  const stamped: TelemetryEvent = { ...event, type: event.type, atMs: deps.clock.now() };
  deps.telemetry?.emit(stamped);
}

export class GameStore {
  private state: GameState;
  private throwEvent: ThrowEventState | null = null;
  private currentNonce: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly phase1RevealListeners = new Set<(move: AiMove) => void>();

  constructor(private readonly deps: GameStoreDeps, voskLoaded: boolean) {
    const playerModel = deps.playerModelStore.load();
    this.state = {
      mode: "partida",
      aiLevel: DEFAULT_LEVEL,
      gameScore: { player: 0, ai: 0 },
      gameOver: false,
      matchHistory: [],
      playerModel,
      currentAiMove: null,
      currentCommitHash: null,
      displayedAiMove: null,
      displayedVerified: null,
      displayedCommitHash: null,
      handArmedForNextThrow: true,
      throwInProgress: false,
      lastThrownFingerCount: null,
      lastRoundAudioEndCtxTime: null,
      rivalClipPlaybacks: [],
      roundPhase: "idle",
      voidOutcome: null,
      settings: { ...DEFAULT_SETTINGS },
      voskLoaded,
      gameEndWinner: null,
      mirrorScope: "session",
    };
    this.mintCommitment();
  }

  getSnapshot = (): GameState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Fires exactly once per phase-1 reveal, with the AI move to play a clip
   * for. The store never touches audio itself — sensorPipeline.ts owns the
   * AudioContext and calls registerClipPlayback() once it knows the real
   * [start,end] ctx-time window it scheduled. */
  onPhase1Reveal(listener: (move: AiMove) => void): () => void {
    this.phase1RevealListeners.add(listener);
    return () => this.phase1RevealListeners.delete(listener);
  }

  private setState(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------------
  // Settings / mode / level
  // ------------------------------------------------------------------

  setMode(mode: SessionMode): void {
    if (mode === this.state.mode) return;
    this.setState({ mode });
  }

  setAiLevel(level: AiLevel): void {
    this.setState({ aiLevel: level });
  }

  setSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.setState({ settings: { ...this.state.settings, [key]: value } });
  }

  setVoskLoaded(loaded: boolean): void {
    this.setState({ voskLoaded: loaded });
  }

  setMirrorScope(scope: "session" | "allTime"): void {
    this.setState({ mirrorScope: scope });
  }

  // ------------------------------------------------------------------
  // Match lifecycle
  // ------------------------------------------------------------------

  resetGame(): void {
    this.throwEvent = null;
    this.setState({
      gameScore: { player: 0, ai: 0 },
      gameOver: false,
      matchHistory: [],
      lastRoundAudioEndCtxTime: null,
      rivalClipPlaybacks: [],
      roundPhase: "idle",
      voidOutcome: null,
      handArmedForNextThrow: true,
      throwInProgress: false,
      gameEndWinner: null,
      displayedAiMove: null,
      displayedVerified: null,
      displayedCommitHash: null,
    });
    this.mintCommitment();
  }

  private mintCommitment(): AiMove {
    const history = this.state.aiLevel === "L4" ? toHistoryArray(this.state.playerModel) : this.state.matchHistory;
    const move = decideMove(this.state.aiLevel, this.deps.random, history, null);
    const nonce = randomNonceHex(this.deps.secureRandom);
    const hash = computeCommitHash(move.fingers, move.call, nonce);
    this.currentNonce = nonce;
    this.setState({ currentAiMove: move, currentCommitHash: hash });
    return move;
  }

  // ------------------------------------------------------------------
  // Round pipeline — called by sensorPipeline.ts as recognized results land.
  // ------------------------------------------------------------------

  /** A hand settled at `rawFingerCount` (0-5, or null if no hand detected)
   * at `handOnsetPerfTime`. Ported from onSyncHandOnset. */
  onHandOnset(rawFingerCount: number | null, handOnsetPerfTime: number): void {
    if (this.state.gameOver && this.state.mode === "partida") return;
    this.throwEvent = {
      handOnsetPerfTime,
      rawFingerCount,
      effectiveFingerCount: null,
      isReset: false,
      voiceOnsetPerfTime: null,
      playerWord: null,
      outcome: "pending",
      syncDeltaMs: null,
      rivalRevealed: false,
      revealedAiMove: null,
      revealedVerified: null,
      handled: false,
      audioLanded: false,
      wordLanded: !this.state.voskLoaded,
      clampFloorCtxTime: this.state.lastRoundAudioEndCtxTime,
    };
    // A new round has begun — the previously revealed hand stops being
    // "current" as of this instant. If this SAME onset immediately
    // re-reveals below, displayedAiMove is set again right after.
    this.setState({ throwInProgress: true, roundPhase: "analyzing", displayedAiMove: null, displayedVerified: null, displayedCommitHash: null });
    if (this.state.mode === "partida" && shouldRevealPhase1(rawFingerCount)) {
      this.revealAndMintNext();
    }
  }

  /** The [SYNC_PRE_MS before, SYNC_POST_MS after] audio window around the
   * hand onset has been analyzed: `voiceOnsetPerfTime` is the buffer's
   * detected sustained-energy onset (or null if none was found), already
   * on the perf.now() timeline via the caller's clock mapping. Ported from
   * the tail of triggerSyncAudioAnalysis. */
  onAudioWindowResult(voiceOnsetPerfTime: number | null): void {
    const t = this.throwEvent;
    if (!t) return;
    const { isReset, effectiveFingerCount } = classifyHandSettleForSync(t.rawFingerCount, voiceOnsetPerfTime);
    t.isReset = isReset;
    t.effectiveFingerCount = effectiveFingerCount;
    t.voiceOnsetPerfTime = voiceOnsetPerfTime;
    if (isReset) {
      t.outcome = "reset";
    } else {
      const { outcome, syncDeltaMs } = classifySyncThrow(t.handOnsetPerfTime, voiceOnsetPerfTime, this.state.settings.coOccurrenceMs);
      t.outcome = outcome;
      t.syncDeltaMs = syncDeltaMs;
    }
    t.audioLanded = true;
    this.tryResolve();
  }

  /** The grammar-restricted recognizer landed a word (or null/unk). */
  onWordResult(word: string | null): void {
    const t = this.throwEvent;
    if (!t) return;
    t.playerWord = word;
    t.wordLanded = true;
    this.tryResolve();
  }

  /** sensorPipeline.ts reports the REAL [start,end] ctx-time it scheduled a
   * rival clip for, once playback actually started — feeds both the
   * exclusion list @morra/recognition's blankExclusionRegions needs and
   * clampWindowStart's "don't reach back past this" floor. */
  registerClipPlayback(startCtxTime: number, endCtxTime: number): void {
    this.setState({
      rivalClipPlaybacks: [...this.state.rivalClipPlaybacks, { startCtxTime, endCtxTime }],
      lastRoundAudioEndCtxTime: endCtxTime,
    });
  }

  /** Per-frame ready-pill arming — ported from updateReadyPillFromFrame. */
  updateReadyPillFromFrame(currentFingerCount: number | null): void {
    if (this.state.throwInProgress) return;
    if (!this.state.handArmedForNextThrow && handHasResetSince(this.state.lastThrownFingerCount, currentFingerCount)) {
      this.setState({ handArmedForNextThrow: true });
    }
  }

  private revealAndMintNext(): void {
    const t = this.throwEvent;
    const move = this.state.currentAiMove;
    const hash = this.state.currentCommitHash;
    if (!t || !move || !hash || !this.currentNonce) return;
    const verified = verifyCommitment(move.fingers, move.call, this.currentNonce, hash);
    t.rivalRevealed = true;
    t.revealedAiMove = move;
    t.revealedVerified = verified;
    this.setState({ displayedAiMove: move, displayedVerified: verified, displayedCommitHash: hash });
    this.phase1RevealListeners.forEach((l) => l(move));
    this.mintCommitment(); // burn + re-mint for the NEXT round, in the background
  }

  private markResolved(nextPhase: RoundPhase, patch: Partial<GameState> = {}): void {
    if (this.throwEvent) this.throwEvent.handled = true;
    this.setState({ throwInProgress: false, handArmedForNextThrow: false, roundPhase: nextPhase, ...patch });
  }

  private tryResolve(): void {
    const t = this.throwEvent;
    if (!t || t.handled) return;

    // A reset is fully determined by classifyHandSettleForSync alone (see
    // onAudioWindowResult) — it never needed a call word in the first
    // place, so it resolves as soon as the audio window lands, WITHOUT
    // waiting on wordLanded. Gating it on the word too would leave the
    // ready pill stuck on "analyzing" for the entire vosk round-trip every
    // time the player simply lowers their hand — a real usability bug.
    if (t.audioLanded && t.outcome === "reset") {
      t.handled = true;
      this.setState({ throwInProgress: false, handArmedForNextThrow: true });
      return;
    }

    if (!t.audioLanded || !t.wordLanded) return; // still waiting on a pending signal

    if (this.state.mode === "entrenament") {
      t.handled = true;
      if (t.effectiveFingerCount != null) {
        this.recordTrainingThrow(t.effectiveFingerCount, wordToNumber(t.playerWord), t.playerWord, t.outcome as SyncOutcome, t.syncDeltaMs);
      }
      this.setState({ throwInProgress: false, handArmedForNextThrow: false });
      return;
    }

    // Partida
    if (this.state.gameOver) {
      t.handled = true;
      this.setState({ throwInProgress: false });
      return;
    }
    const wordNum = wordToNumber(t.playerWord);
    if (t.outcome !== "synced" || t.effectiveFingerCount == null || wordNum == null) {
      if (t.rivalRevealed) {
        emitTelemetry(this.deps, { type: "reveal_burned", outcome: t.outcome });
        const entry = this.buildHistoryEntry(t.effectiveFingerCount, wordNum, t.playerWord, t.revealedAiMove, null, t.outcome as SyncOutcome, t.syncDeltaMs);
        this.recordMatchHistory(entry);
        this.markResolved("void", { voidOutcome: t.outcome as SyncOutcome });
      } else {
        // M5 parity fix: the spike's maybeResolveGameRound records an
        // "incomplete" throw into matchHistory/playerModel too (not just
        // void ones) whenever playerFingers != null — verdictWinner null,
        // aiMove null (the commitment was never revealed, stays live for
        // the next attempt). Found via the live parity comparison against
        // window.__s03, not just the extracted spec — the AI's commitment
        // itself is untouched (no burn), only the record of the ATTEMPT.
        if (t.effectiveFingerCount != null) {
          const entry = this.buildHistoryEntry(t.effectiveFingerCount, wordNum, t.playerWord, null, null, t.outcome as SyncOutcome, t.syncDeltaMs);
          this.recordMatchHistory(entry);
        }
        this.markResolved("incomplete", { voidOutcome: null });
      }
      return;
    }

    // Genuine synced throw
    if (!t.rivalRevealed) this.revealAndMintNext();
    this.resolveGameRound(t.effectiveFingerCount, wordNum, t);
  }

  private resolveGameRound(fingers: number, playerCall: number, t: ThrowEventState): void {
    const aiMove = t.revealedAiMove!;
    const verdict = computeMicatioVerdict(fingers, playerCall, aiMove.fingers, aiMove.call);
    const gameScore = { ...this.state.gameScore };
    if (verdict.winner === "player") gameScore.player++;
    else if (verdict.winner === "ai") gameScore.ai++;

    const entry = this.buildHistoryEntry(fingers, playerCall, t.playerWord, aiMove, verdict.winner, t.outcome as SyncOutcome, t.syncDeltaMs);
    this.recordMatchHistory(entry);
    emitTelemetry(this.deps, { type: "game_reveal", verdictWinner: verdict.winner, playerFingers: fingers, playerCall, aiFingers: aiMove.fingers, aiCall: aiMove.call });

    const gameOver = gameScore.player >= GAME_WIN_SCORE || gameScore.ai >= GAME_WIN_SCORE;
    this.markResolved(verdict.winner, {
      gameScore,
      lastThrownFingerCount: fingers,
      gameOver,
      gameEndWinner: gameOver ? (gameScore.player >= GAME_WIN_SCORE ? "player" : "ai") : null,
      voidOutcome: null,
    });
  }

  private recordTrainingThrow(
    fingers: number,
    playerCall: number | null,
    playerWord: string | null,
    outcome: SyncOutcome,
    syncDeltaMs: number | null
  ): void {
    const entry: HistoryEntry = {
      throwIndex: this.state.playerModel.throws.length,
      sessionId: this.deps.sessionId,
      atIso: new Date().toISOString(),
      playerFingers: fingers,
      playerCall,
      playerWord,
      aiFingers: null,
      aiCall: null,
      aiGuessPlayerFingers: null,
      aiLevel: null,
      verdictWinner: null,
      syncOutcome: outcome,
      syncDeltaMs,
    };
    const playerModel = recordThrow(this.state.playerModel, entry);
    this.deps.playerModelStore.save(playerModel);
    this.setState({ playerModel, lastThrownFingerCount: fingers });
  }

  private buildHistoryEntry(
    fingers: number | null,
    playerCall: number | null,
    playerWord: string | null,
    aiMove: AiMove | null,
    verdictWinner: VerdictWinner | null,
    outcome: SyncOutcome,
    syncDeltaMs: number | null
  ): HistoryEntry {
    return {
      throwIndex: this.state.matchHistory.length,
      sessionId: this.deps.sessionId,
      atIso: new Date().toISOString(),
      playerFingers: fingers,
      playerCall,
      playerWord,
      aiFingers: aiMove?.fingers ?? null,
      aiCall: aiMove?.call ?? null,
      aiGuessPlayerFingers: aiMove?.guessPlayerFingers ?? null,
      aiLevel: this.state.aiLevel,
      verdictWinner,
      syncOutcome: outcome,
      syncDeltaMs,
    };
  }

  private recordMatchHistory(entry: HistoryEntry): void {
    const matchHistory = [...this.state.matchHistory, entry];
    const playerModel = recordThrow(this.state.playerModel, entry);
    this.deps.playerModelStore.save(playerModel);
    this.setState({ matchHistory, playerModel });
  }

  // ------------------------------------------------------------------
  // Entrenament / mirror ("L'Espill")
  // ------------------------------------------------------------------

  getMirrorData(scope: "session" | "allTime"): MirrorData {
    const all = this.state.playerModel.throws;
    const source = scope === "session" ? all.filter((h) => h.sessionId === this.deps.sessionId) : all;
    return {
      exploitability: computeExploitability(source),
      randomness: computeRandomnessScore(source),
      histograms: computeHistograms(source),
      tells: computeTopTells(source, 3),
      bigram: computeBigramHeatmap(source),
      syncStats: computeSyncStats(source),
    };
  }

  getPostMatchStats(): { exploitability: MirrorData["exploitability"]; randomness: MirrorData["randomness"]; syncStats: MirrorData["syncStats"] } {
    const source = this.state.matchHistory;
    return {
      exploitability: computeExploitability(source),
      randomness: computeRandomnessScore(source),
      syncStats: computeSyncStats(source),
    };
  }

  exportProfileJson(): string {
    return JSON.stringify(this.state.playerModel);
  }

  /** Confirmation UX (the spike's native confirm()) is a DOM concern —
   * belongs in the React layer, which calls this only after the user
   * confirms. */
  resetProfile(): void {
    this.deps.playerModelStore.clear();
    this.setState({ playerModel: createEmptyModel() });
  }
}
