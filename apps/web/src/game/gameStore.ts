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
  DEFAULT_RESET_PALETTE_CONFIG,
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
  type ResetPaletteConfig,
  type ResetReason,
  type SecureRandomSource,
  type TelemetryEvent,
  type TelemetrySink,
  type VerdictWinner,
} from "@morra/core";
import { handHasResetSince } from "./handHasReset.js";
import {
  addProfile,
  normalizeRegistry,
  resolveInitialProfileId,
  setLastPlayed,
  type PlayerProfile,
  type ProfileRegistry,
} from "../profiles/profileTypes.js";

export type { ResetReason } from "@morra/core";
export type { PlayerProfile, ProfileRegistry } from "../profiles/profileTypes.js";

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
  /** Feature 2 — the reset palette. Per-profile configurable (Feature 3):
   * different players prefer different resets. Stillness (the held-over/
   * transition backstop, handHasResetSince below) isn't part of this
   * config — it's a permanent, non-toggleable safety net, not a gesture. */
  resetPalette: ResetPaletteConfig;
}

export const DEFAULT_SETTINGS: GameSettings = {
  coOccurrenceMs: 400,
  vadMult: 6,
  highV: 0.9,
  lowV: 0.25,
  settleMs: 50,
  resetPalette: DEFAULT_RESET_PALETTE_CONFIG,
};

interface ThrowEventState {
  handOnsetPerfTime: number;
  rawFingerCount: number | null;
  effectiveFingerCount: number | null;
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
  /** Feature 3 — "who's playing". Everything player-specific (playerModel,
   * settings incl. resetPalette) is keyed by this id; profiles is the full
   * known list (for the picker's chip list), kept here rather than in a
   * separate store so the SAME useGameStore/useSyncExternalStore plumbing
   * gives the picker UI reactivity for free. */
  profileId: string;
  profiles: PlayerProfile[];
}

export interface MirrorData {
  exploitability: ReturnType<typeof computeExploitability>;
  randomness: ReturnType<typeof computeRandomnessScore>;
  histograms: ReturnType<typeof computeHistograms>;
  tells: ReturnType<typeof computeTopTells>;
  bigram: ReturnType<typeof computeBigramHeatmap>;
  syncStats: ReturnType<typeof computeSyncStats>;
}

/** Feature 3 — per-profile GameSettings persistence. A dedicated small port
 * (mirroring PlayerModelStore's shape) rather than reusing PlayerModelStore
 * itself, since GameSettings is an entirely different shape/domain
 * (app-level tuning, not game history) — keeping them separate also means a
 * settings-store bug can never corrupt player model data or vice versa. */
export interface SettingsStore {
  load(profileId: string): GameSettings | null;
  save(profileId: string, settings: GameSettings): boolean;
}

/** Feature 3 — the profile registry's persistence port. */
export interface ProfileRegistryStore {
  load(): ProfileRegistry;
  save(registry: ProfileRegistry): boolean;
}

export interface GameStoreDeps {
  playerModelStore: PlayerModelStore;
  settingsStore: SettingsStore;
  profileRegistryStore: ProfileRegistryStore;
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

// Feature 3 — PlayerModelStore's `key` param (already generic in the port,
// packages/core/src/ports/player-model-store.ts) is where profile keying
// lives, chosen over threading a profileId THROUGH the port itself: the
// port stays exactly as generic as it already was, and this one-line
// mapping is the ONLY place that needs to know the key's shape.
function playerModelKey(profileId: string): string {
  return `morra-playermodel:${profileId}`;
}

export class GameStore {
  private state: GameState;
  private throwEvent: ThrowEventState | null = null;
  private currentNonce: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly phase1RevealListeners = new Set<(move: AiMove) => void>();

  constructor(private readonly deps: GameStoreDeps, voskLoaded: boolean) {
    // Feature 3 — "who's playing" is resolved HERE, at construction, from
    // the persisted registry's last-played profile: the "auto-load without
    // friction" default (Feature 3a) is simply "GameStore always boots as
    // whoever played last", no separate app-boot step required.
    const registry = normalizeRegistry(deps.profileRegistryStore.load());
    const profileId = resolveInitialProfileId(registry);
    const playerModel = deps.playerModelStore.load(playerModelKey(profileId));
    const settings = deps.settingsStore.load(profileId) ?? { ...DEFAULT_SETTINGS };
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
      settings,
      voskLoaded,
      gameEndWinner: null,
      mirrorScope: "session",
      profileId,
      profiles: registry.profiles,
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
    const settings = { ...this.state.settings, [key]: value };
    this.setState({ settings });
    this.deps.settingsStore.save(this.state.profileId, settings); // Feature 3 — per-profile persistence
  }

  /** Feature 2/3 — one gesture's on/off toggle or the below-zone height,
   * kept as its own nested-object setter (rather than overloading
   * setSetting) since resetPalette is itself a sub-object, and Feature 3
   * makes this per-profile — different players prefer different resets. */
  setResetPaletteSetting<K extends keyof ResetPaletteConfig>(key: K, value: ResetPaletteConfig[K]): void {
    const settings = { ...this.state.settings, resetPalette: { ...this.state.settings.resetPalette, [key]: value } };
    this.setState({ settings });
    this.deps.settingsStore.save(this.state.profileId, settings);
  }

  // ------------------------------------------------------------------
  // Feature 3 — player profiles ("who's playing")
  // ------------------------------------------------------------------

  /** Activates a different (already-known) profile: reloads ITS playerModel
   * and settings, and resets in-progress/session-scoped round state so
   * nothing from the outgoing player leaks into the incoming one's view
   * (an in-flight throw, the current match's score/history, the currently
   * displayed AI move). The AI's live secret commitment is re-minted fresh
   * too — continuing the outgoing player's pending commitment across a
   * profile switch would be a fairness/privacy oddity, not a real gameplay
   * concern worth preserving. A no-op if already the active profile. */
  switchProfile(profileId: string): void {
    if (profileId === this.state.profileId) return;
    const nextRegistry = setLastPlayed({ profiles: this.state.profiles, lastPlayedProfileId: this.state.profileId }, profileId);
    this.deps.profileRegistryStore.save(nextRegistry);
    const playerModel = this.deps.playerModelStore.load(playerModelKey(profileId));
    const settings = this.deps.settingsStore.load(profileId) ?? { ...DEFAULT_SETTINGS };
    this.throwEvent = null;
    this.setState({
      profileId,
      playerModel,
      settings,
      matchHistory: [],
      gameScore: { player: 0, ai: 0 },
      gameOver: false,
      gameEndWinner: null,
      roundPhase: "idle",
      voidOutcome: null,
      throwInProgress: false,
      handArmedForNextThrow: true,
      displayedAiMove: null,
      displayedVerified: null,
      displayedCommitHash: null,
      lastThrownFingerCount: null,
      lastRoundAudioEndCtxTime: null,
      rivalClipPlaybacks: [],
    });
    this.mintCommitment();
  }

  /** Creates a brand-new named profile (starts with an empty playerModel
   * and DEFAULT_SETTINGS — nothing carries over from whoever was active),
   * persists it into the registry, and immediately switches to it. Returns
   * the created profile so the picker UI can e.g. show a confirmation. */
  createProfile(name: string): PlayerProfile {
    const currentRegistry: ProfileRegistry = { profiles: this.state.profiles, lastPlayedProfileId: this.state.profileId };
    const { registry, profile } = addProfile(currentRegistry, name);
    this.deps.profileRegistryStore.save(registry);
    this.setState({ profiles: registry.profiles });
    this.switchProfile(profile.id);
    return profile;
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
    // Feature 1 fix: this used to also decide "reset" (a settle at <=1 with
    // no voice silently deleted the throw) — classifyHandSettleForSync is
    // now a plain clamp (0->1, Micatio has no zero) and every settle is a
    // real throw. Resets are exclusively onGestureReset()'s job now (the
    // reset palette, Feature 2) — see that method below.
    t.effectiveFingerCount = classifyHandSettleForSync(t.rawFingerCount, voiceOnsetPerfTime);
    t.voiceOnsetPerfTime = voiceOnsetPerfTime;
    const { outcome, syncDeltaMs } = classifySyncThrow(t.handOnsetPerfTime, voiceOnsetPerfTime, this.state.settings.coOccurrenceMs);
    t.outcome = outcome;
    t.syncDeltaMs = syncDeltaMs;
    t.audioLanded = true;
    this.tryResolve();
  }

  /** Feature 2 — the reset palette. Called by sensorPipeline.ts once per
   * frame it recognizes ANY of the four OR'd reset gestures (out-of-frame,
   * below-zone, wave; stillness re-arms separately via
   * updateReadyPillFromFrame below, unchanged). Every reset is logged with
   * its reason via telemetry, for later pruning (some of the four may turn
   * out to be redundant with each other in practice). If a throw is
   * currently in flight and its commitment was already revealed (phase-1,
   * fingerCount>=2), the reset BURNS it — same fairness/audit-trail
   * treatment as any other non-synced outcome after a reveal (a revealed
   * commitment is never silently dropped); otherwise it's a clean,
   * unrecorded cancel exactly like the old fist-retraction reset was. */
  onGestureReset(reason: ResetReason): void {
    emitTelemetry(this.deps, { type: "gesture_reset", reason });
    const t = this.throwEvent;
    this.throwEvent = null;
    if (t && !t.handled) {
      t.handled = true;
      if (t.rivalRevealed) {
        emitTelemetry(this.deps, { type: "reveal_burned", outcome: "reset" });
        const entry = this.buildHistoryEntry(t.effectiveFingerCount, wordToNumber(t.playerWord), t.playerWord, t.revealedAiMove, null, "reset", t.syncDeltaMs);
        this.recordMatchHistory(entry);
        this.markResolved("void", { voidOutcome: null, handArmedForNextThrow: true });
        return;
      }
    }
    this.setState({
      throwInProgress: false,
      handArmedForNextThrow: true,
      roundPhase: this.state.roundPhase === "analyzing" ? "idle" : this.state.roundPhase,
    });
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

  /** Per-frame ready-pill arming — ported from updateReadyPillFromFrame.
   * Feature 2d — the reset palette's "stillness backstop": this pre-existing
   * mechanism is UNCHANGED (any evidence the hand moved on from the last
   * thrown count re-arms), kept as-is alongside the three new explicit
   * gestures (onGestureReset above) so the ready pill can never get stuck
   * not-armed in a case those three don't happen to catch. Logged with
   * reason "stillness" the same way the others are (edge-triggered by the
   * `!handArmedForNextThrow` guard, so this fires once per re-arm, not
   * every frame) — "for later pruning" per Feature 2's own telemetry ask:
   * this is likely the MOST common of the four, so it's useful data on
   * whether the three explicit gestures earn their keep at all. */
  updateReadyPillFromFrame(currentFingerCount: number | null): void {
    if (this.state.throwInProgress) return;
    if (!this.state.handArmedForNextThrow && handHasResetSince(this.state.lastThrownFingerCount, currentFingerCount)) {
      emitTelemetry(this.deps, { type: "gesture_reset", reason: "stillness" satisfies ResetReason });
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

    // Feature 1 fix: onAudioWindowResult can no longer produce a "reset"
    // outcome (that early-exit branch was removed along with it) — every
    // settle it classifies is now a real throw. A "reset" outcome only
    // ever appears via onGestureReset (Feature 2's reset palette), which
    // resolves itself directly and never reaches this method.
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
    this.deps.playerModelStore.save(playerModel, playerModelKey(this.state.profileId));
    this.setState({ playerModel, lastThrownFingerCount: fingers });
  }

  private buildHistoryEntry(
    fingers: number | null,
    playerCall: number | null,
    playerWord: string | null,
    aiMove: AiMove | null,
    verdictWinner: VerdictWinner | null,
    outcome: SyncOutcome | "reset",
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
    this.deps.playerModelStore.save(playerModel, playerModelKey(this.state.profileId));
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
   * confirms. Feature 3 — clears only the ACTIVE profile's data; other
   * profiles on the same device are untouched. */
  resetProfile(): void {
    this.deps.playerModelStore.clear(playerModelKey(this.state.profileId));
    this.setState({ playerModel: createEmptyModel() });
  }
}
