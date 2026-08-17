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
  /** where the entry came from (added 2026-08-17; older entries lack it):
   * "partida" = a round the game judged (resolved or revealed-and-void),
   * "entrenament" = an L'Espill throw. Lets a purge be exact. */
  source?: "partida" | "entrenament";
}

/** A probability distribution over fingers/guesses 1-5 — every entry must
 * be present (never a sparse/partial map); values need not be pre-verified
 * to sum to 1 by the type system, but every producer in this package does. */
export type FingerDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

/* ---------------------------------------------------------------------
 * Recognizer contracts (M2, plan §"Recognition is untrusted input, and the
 * rules correct it"). Pure TYPES only — no implementation, no DOM: the real
 * MediaPipe/vosk-backed implementations live in packages/recognition, which
 * imports these interfaces to shape what it produces. A recognizer emits
 * RANKED hypotheses with confidence (never a single bare guess) so a future
 * fusion layer (packages/core/src/fusion/, not yet built) can apply the
 * legality filter/rescue logic the plan describes instead of trusting the
 * top hypothesis blindly.
 * ------------------------------------------------------------------- */

/** One candidate reading, best-first when part of a sorted list. */
export interface RankedHypothesis<T> {
  value: T;
  /** 0-1. Recognizers that don't natively produce a calibrated confidence
   * (e.g. the spike's finger counter) may emit a fixed 1.0 for their sole
   * hypothesis — the shape still lets a future fusion layer treat every
   * recognizer uniformly. */
  confidence: number;
}

/**
 * capturedAtMs is in the CAPTURE timestamp domain (plan principle 3, R5
 * lesson): rVFC `mediaTime` for video, the AudioWorklet ring-buffer's own
 * ctx-time-derived clock for audio — NOT wall-clock performance.now() at
 * the moment recognition finished, and input latency must never be added
 * to it a second time (the capture pipeline already accounts for it).
 * hypotheses is empty when nothing was recognized (no hand, no legal word)
 * — never a special sentinel value mixed into the list.
 */
export interface RecognitionResult<T> {
  hypotheses: RankedHypothesis<T>[];
  capturedAtMs: number;
}

export type FingerCount = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * A finger recognizer's velocity-state-machine onset event (M5 parity fix:
 * spikes/s03-beat.html's PRIMARY hand-onset trigger is velocity-based
 * motion-settle detection, not count stability — settle/stability-only
 * anchoring reintroduced a systematic ~200ms voice-early bias in real
 * testing). Mirrors @morra/recognition's stepVelocityStateMachine's
 * VelocityOnsetEvent shape without core depending on that package:
 * settlePerfTime is when velocity dropped below the recognizer's LOW_V
 * threshold and stayed there long enough; motionStartPerfTime is the
 * earlier instant velocity first crossed HIGH_V — the spike's own step-10
 * finding that a throw's shout starts with the swing, not the hand coming
 * to rest ~250-300ms later, so downstream sync-window math anchors on
 * motion start. motionStartPerfTime is null only in the (practically
 * unreachable) case documented on VelocityOnsetEvent itself; callers
 * should fall back to settlePerfTime in that case.
 */
export interface MotionOnsetEvent {
  settlePerfTime: number;
  motionStartPerfTime: number | null;
}

/**
 * Extends RecognitionResult<FingerCount> with the velocity surface a
 * caller needs to anchor round timing the way the spike did. `velocity` is
 * this frame's fingertip motion in the recognizer's own arbitrary unit
 * (null when no hand was detected this frame, or on the very first frame a
 * hand appears — no prior frame to compare against yet); `motionOnset` is
 * non-null exactly on the frame where a recognizer's internal velocity
 * state machine resolves motion into a genuine onset. A FingerRecognizer
 * that cannot supply velocity (e.g. a future non-camera-based
 * implementation) is still contract-valid by always returning
 * `{velocity: null, motionOnset: null}` — callers must be able to fall
 * back to a count-stability heuristic in that case (see
 * @morra/recognition's findStableCountRun).
 */
export interface FingerRecognitionResult extends RecognitionResult<FingerCount> {
  velocity: number | null;
  motionOnset: MotionOnsetEvent | null;
}

/** A single frame's finger reading. `input` is opaque to core (it's
 * whatever the concrete recognizer's platform hands it — e.g. MediaPipe
 * landmarks in packages/recognition); core only fixes the CONTRACT. */
export interface FingerRecognizer {
  recognizeFrame(input: unknown, capturedAtMs: number): FingerRecognitionResult | Promise<FingerRecognitionResult>;
}

/** One buffered-audio-window recognition (a throw's shouted call). `samples`
 * is a mono Float32Array at `sampleRate` Hz — the extracted capture window,
 * already blanked/clamped by the caller if needed. */
export interface CallRecognizer {
  recognizeWindow(samples: Float32Array, sampleRate: number, capturedAtMs: number): Promise<RecognitionResult<string>>;
}
