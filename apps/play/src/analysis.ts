// analysis.ts — THE HEART. Ports spikes/s03-beat.html's sync-mode throw
// pipeline: syncReady/getSyncCoOccurrenceMs (L2416–2420), onSyncHandOnset
// (L2504–2570), triggerSyncAudioAnalysis (L2572–2685), finalizeSyncThrow
// (L2692–2752), the voice-only/orphan path (L2754–2787), applyRecognizedWord
// (L1691–1698), and the sync-drain slice of frame() (L1396–1405).
//
// The four structural invariants live here:
//  1. PER-THROW OBJECT IDENTITY — every onset creates a FRESH ThrowEvent
//     object; every async continuation (extraction, onset analysis, word
//     recognition) closes over THAT object. There is no shared mutable
//     "current throw" field anywhere, so a slow-resolving throw can never
//     land its results on a newer one (the race apps/web's f90cc42 fixed
//     was impossible here by construction).
//  2. MOTION-START ANCHOR + DEFERRED EXTRACTION — the anchor is the
//     velocity-spike crossing, and ring extraction fires only from
//     drainPendingAnalysis (the shared rAF frame loop) once
//     now >= anchor + SYNC_POST_MS. See config.ts's ring-margin comment.
//  3. PLAYER-ONLY PACING — nothing in this file schedules anything on a
//     clock; every entry point is a sensor event.
//  4. BLANKING + CLAMPING, CLAMP FLOOR SNAPSHOTTED AT ONSET — the throw's
//     clampFloorCtxTime is copied from rivalAudioLog at onset time, BEFORE
//     the phase-1 reveal can move the live value; blanking (not clamping)
//     handles this same throw's own in-flight reveal clip.

import {
  blankExclusionRegions,
  clampWindowStart,
  findEnergyOnsetInBuffer,
  primeNoiseFloorFromBuffer,
} from "@morra/recognition";
import { classifyHandSettleForSyncFrom, classifySyncThrow, isOrphanVoiceOnset, type AiMove } from "@morra/core";
import {
  BUFFER_FLOOR_CAP,
  OFFLINE_ONSET_SUSTAIN_MS,
  ONSET_FLOOR_PRIME_MS,
  SYNC_COOCCURRENCE_MS_DEFAULT,
  SYNC_PARTNER_TIMEOUT_MS,
  SYNC_POST_MS,
  SYNC_PRE_MS,
  VOSK_SAMPLE_RATE,
} from "./config.js";
import { el } from "./dom.js";
import { clockMap, ctx } from "./audioClock.js";
import { handTrackingActive } from "./camera.js";
import { micReady, micRing } from "./mic.js";
import { demotePreWindowOnset, getEntorn } from "./entorn.js";
import { voskLoaded, voskRecognizer } from "./vosk.js";
import { logEvent, pushDebugLog } from "./telemetry.js";
import { reportError } from "./status.js";
import { lastRoundAudioEndCtxTime, rivalClipExclusions } from "./rivalAudioLog.js";
import { renderBigWordPendingFor, renderBigWordResultFor } from "./render/bigWord.js";
import {
  isCurrentVerdictThrow,
  renderSyncTally,
  renderSyncVerdict,
  renderSyncVerdictPending,
} from "./render/syncVerdict.js";
import { renderReadyPill, setThrowInProgress, armForNextThrow } from "./readyPill.js";

export type SyncOutcomeAll =
  | "pending"
  | "synced"
  | "voice-late"
  | "voice-early"
  | "hand-only"
  | "voice-only"
  | "reset";

export interface DebugRecognition {
  [key: string]: unknown;
}

export interface DebugRec {
  mode: "sync";
  handOnsetPerfTime: number | null;
  hand: {
    motionStartPerfTime: number | null;
    settlePerfTime: number | null;
    fingerCount: number | null;
    onsetPerfTime: number | null;
    reason: string | null;
    settlePath: string | null;
  };
  voice: {
    offsetMs?: number | null;
    onsetPerfTime: number | null;
    reason: string | null;
    onsetSource: string | null;
    preWindow: boolean | null;
  };
  outcome: SyncOutcomeAll;
  syncDeltaMs: number | null;
  coOccurrenceMs: number;
  modelLoaded: boolean;
  recognition: DebugRecognition | null;
  game?: Record<string, unknown>;
  rivalReveal?: Record<string, unknown>;
}

export interface ThrowEvent {
  kind: "sync";
  throwIndex: number;
  handOnsetPerfTime: number | null;
  handSettlePerfTime: number | null;
  handFingerCount: number | null;
  /** resting count just before motion start (camera.ts preOnsetFingerCount);
   * null = unknown. Throw-of-one reveal gate input, and logged so the next
   * field analysis can validate the rule against real retractions. */
  handPreOnsetFingerCount: number | null;
  voiceOnsetPerfTime: number | null;
  voicePreWindow: boolean;
  syncDeltaMs: number | null;
  outcome: SyncOutcomeAll;
  pending: boolean;
  word: string | null;
  gameHandled: boolean; // step 11: guards maybeResolveGameRound against double-processing
  trainingRecorded?: boolean; // Entrenament: guards recordTrainingThrow the same way (a throw feeds the model once)
  clampFloorCtxTime: number | null;
  rivalRevealed: boolean;
  revealedAiMove: AiMove | null;
  revealedVerified: boolean | null;
  debugRec?: DebugRec;
}

// Game hooks (M5): the spike's sync pipeline calls into game land at four
// points; game.ts plugs real implementations in, Entrenament included.
// All no-ops until then — the plain sync mirror works standalone.
export interface GameHooks {
  /** onSyncHandOnset's game block: renderGameRoundAnalyzing + phase-1
   * reveal (fingerCount>=2) or renderRivalCommitted. */
  onThrowStart(t: ThrowEvent): void;
  /** finalizeSyncThrow's tail: maybeResolveGameRound + Entrenament's
   * recordTrainingThrow (never for outcome "reset"). */
  onThrowFinalized(t: ThrowEvent): void;
  /** applyRecognizedWord's tail: maybeResolveGameRound (word now known). */
  onWordApplied(t: ThrowEvent): void;
  /** The reset branch's game-card restore (renderGameRoundPending). */
  onReset(): void;
}
let gameHooks: GameHooks = {
  onThrowStart() {},
  onThrowFinalized() {},
  onWordApplied() {},
  onReset() {},
};
export function setGameHooks(hooks: GameHooks): void {
  gameHooks = hooks;
}

export function syncReady(): boolean {
  return handTrackingActive && micReady();
}

export function getSyncCoOccurrenceMs(): number {
  const v = parseFloat(el.syncCoOccurrenceMs.value);
  return Number.isFinite(v) && v > 0 ? v : SYNC_COOCCURRENCE_MS_DEFAULT;
}

export const syncThrows: ThrowEvent[] = [];
// {handPerfTime, throwEvent, debugRec} — waiting for SYNC_POST_MS to elapse
// (see drainPendingAnalysis, called from the shared rAF frame loop).
const syncPendingAnalysis: { handPerfTime: number; throwEvent: ThrowEvent; debugRec: DebugRec }[] = [];
export function pendingAnalysisCount(): number {
  return syncPendingAnalysis.length;
}

/** Additive observers beside gameHooks (game.ts owns the single gameHooks
 * object; calibration only needs to WATCH throws, never steer them). */
export interface ThrowObserver {
  onThrowStart?(t: ThrowEvent): void;
  onThrowFinalized?(t: ThrowEvent): void;
}
const throwObservers: ThrowObserver[] = [];
export function addThrowObserver(o: ThrowObserver): () => void {
  throwObservers.push(o);
  return () => {
    const i = throwObservers.indexOf(o);
    if (i >= 0) throwObservers.splice(i, 1);
  };
}

let activeRecognitions = 0;

// step 10: the event anchor is motion start, not settle — see config.ts's
// SYNC_PRE_MS comment for why. settlePerfTime/fingerCount are kept only for
// display/debug (count is meaningless until the hand has settled).
export function onSyncHandOnset(
  settlePerfTime: number,
  motionStartPerfTime: number | null,
  fingerCount: number | null,
  preOnsetFingerCount: number | null = null
): void {
  if (!syncReady()) return;
  const anchorPerfTime = motionStartPerfTime != null ? motionStartPerfTime : settlePerfTime;
  const throwEvent: ThrowEvent = {
    kind: "sync",
    throwIndex: syncThrows.length + 1,
    handOnsetPerfTime: anchorPerfTime,
    handSettlePerfTime: settlePerfTime,
    handFingerCount: fingerCount,
    handPreOnsetFingerCount: preOnsetFingerCount,
    voiceOnsetPerfTime: null,
    voicePreWindow: false,
    syncDeltaMs: null,
    outcome: "pending",
    pending: true,
    word: null,
    gameHandled: false,
    // Phase E: snapshotted BEFORE any phase-1 reveal below can update the
    // live lastRoundAudioEndCtxTime — triggerSyncAudioAnalysis's window
    // clamp for THIS throw must be measured against the PREVIOUS throw's
    // rival audio, never against this same throw's own in-flight reveal
    // clip (that overlap is handled by blanking instead, not by clamping).
    clampFloorCtxTime: lastRoundAudioEndCtxTime(),
    rivalRevealed: false,
    revealedAiMove: null,
    revealedVerified: null,
  };
  syncThrows.push(throwEvent);
  logEvent("throw_onset", {
    throwIndex: throwEvent.throwIndex,
    handOnsetPerfTime: anchorPerfTime,
    settlePerfTime,
    fingerCount,
    preOnsetFingerCount,
  });
  renderSyncVerdictPending(throwEvent);
  renderSyncTally(syncThrows);
  if (voskLoaded()) renderBigWordPendingFor(throwEvent);
  // step 11/12: a fresh throw starting is what should replace the previous
  // round's reveal on screen — game.ts's hook (M5).
  gameHooks.onThrowStart(throwEvent);
  for (const o of throwObservers) o.onThrowStart?.(throwEvent);
  // Phase H: the ready pill's OWN state tracks any sync-mode throw.
  setThrowInProgress(true);
  renderReadyPill();

  const debugRec: DebugRec = {
    mode: "sync",
    handOnsetPerfTime: anchorPerfTime,
    hand: {
      motionStartPerfTime: anchorPerfTime,
      settlePerfTime,
      fingerCount,
      onsetPerfTime: anchorPerfTime,
      reason: null,
      settlePath: "velocity-settle",
    },
    voice: { offsetMs: null, onsetPerfTime: null, reason: "pending", onsetSource: null, preWindow: null },
    outcome: "pending",
    syncDeltaMs: null,
    coOccurrenceMs: getSyncCoOccurrenceMs(),
    modelLoaded: voskLoaded(),
    recognition: null,
  };
  pushDebugLog(debugRec);
  throwEvent.debugRec = debugRec;

  // See config.ts's SYNC_PRE_MS/SYNC_POST_MS comment: extraction is deferred
  // to the frame loop until now >= anchorPerfTime + SYNC_POST_MS, since the
  // window's end is still in the future at the instant the onset fires.
  syncPendingAnalysis.push({ handPerfTime: anchorPerfTime, throwEvent, debugRec });
}

/** The sync-drain slice of the spike's frame() (L1396–1405) — called every
 * rAF tick from main.ts's single frame loop. */
export function drainPendingAnalysis(now: number): void {
  for (let i = syncPendingAnalysis.length - 1; i >= 0; i--) {
    const p = syncPendingAnalysis[i]!;
    if (now >= p.handPerfTime + SYNC_POST_MS) {
      syncPendingAnalysis.splice(i, 1);
      triggerSyncAudioAnalysis(p.handPerfTime, p.throwEvent, p.debugRec);
    }
  }
}

function triggerSyncAudioAnalysis(handPerfTime: number, throwEvent: ThrowEvent, debugRec: DebugRec): void {
  const t0 = performance.now();
  const rec: DebugRecognition = {
    windowStartCtxTime: null, windowEndCtxTime: null, windowStartPerfTime: null, windowEndPerfTime: null,
    requestedSamples: 0, extractedSamples: 0, extractedDurationMs: 0, coverageOk: null, clamped: null,
    rawText: null, hasResult: null, finalWord: null, latencyMs: null,
    recognizerBusyAtStart: activeRecognitions > 0, skipped: false, skipReason: null, error: null,
    ctxCurrentTimeAtRequest: null, workletCurrentTimeAtRequest: null, markerRangeCtxTime: null,
    handOnsetCtxTime: null, bufferOnsetFound: false, bufferOnsetMsInWindow: null,
    blankedMs: null, clampedToPrevRound: null,
  };
  debugRec.recognition = rec;

  const ring = micRing();
  if (!ring) {
    finalizeSyncThrow(throwEvent, debugRec, null);
    return;
  }

  const handOnsetCtxTime = clockMap.toContextTime(handPerfTime);
  rec.handOnsetCtxTime = handOnsetCtxTime;
  if (handOnsetCtxTime == null) {
    finalizeSyncThrow(throwEvent, debugRec, null);
    return;
  }

  // Phase C.4: clamp the requested pre-window so it can never reach
  // backward into the previous round's own audio (reveal / rival clip).
  // Phase E: uses throwEvent.clampFloorCtxTime (snapshotted at onset, before
  // this same throw's own phase-1 reveal could move the live value) — never
  // this throw's own concurrently-playing clip, which blanking handles.
  const clampResult = clampWindowStart(handOnsetCtxTime, SYNC_PRE_MS, throwEvent.clampFloorCtxTime);
  rec.clampedToPrevRound = clampResult.clampedToPrevRound;

  ring
    .requestExtract(handOnsetCtxTime, clampResult.clampedPreMs, SYNC_POST_MS)
    .then((extraction) => {
      rec.windowStartCtxTime = extraction.windowStartCtxTime;
      rec.windowEndCtxTime = extraction.windowEndCtxTime;
      rec.windowStartPerfTime = clockMap.toPerformanceTime(extraction.windowStartCtxTime);
      rec.windowEndPerfTime = clockMap.toPerformanceTime(extraction.windowEndCtxTime);
      rec.requestedSamples = extraction.requestedSamples;
      rec.extractedSamples = extraction.samples ? extraction.samples.length : 0;
      rec.extractedDurationMs =
        extraction.samples && extraction.sampleRate ? (extraction.samples.length / extraction.sampleRate) * 1000 : 0;
      rec.coverageOk = extraction.coverageOk;
      rec.clamped = extraction.clamped;
      rec.ctxCurrentTimeAtRequest = extraction.ctxCurrentTimeAtRequest;
      rec.workletCurrentTimeAtRequest = extraction.workletCurrentTimeAtRequest;
      rec.markerRangeCtxTime = extraction.markerRangeCtxTime;

      if (!extraction.samples || extraction.samples.length < Math.round((extraction.sampleRate || VOSK_SAMPLE_RATE) * 0.05)) {
        rec.skipped = true;
        rec.skipReason = "too little audio in extraction window";
        rec.latencyMs = performance.now() - t0;
        logEvent("recognition_window", {
          throwIndex: throwEvent.throwIndex,
          windowStartCtxTime: rec.windowStartCtxTime,
          windowEndCtxTime: rec.windowEndCtxTime,
          blankedMs: 0,
          clampedToPrevRound: rec.clampedToPrevRound,
          skipped: true,
          skipReason: rec.skipReason,
        });
        finalizeSyncThrow(throwEvent, debugRec, null);
        if (voskLoaded()) applyRecognizedWord(throwEvent, "?");
        return;
      }

      // Phase C.3: blank any rival-clip audio that overlaps this window
      // BEFORE either onset detection or recognition run on it, so the
      // rival's own scheduled voice can never be mistaken for the player's.
      const blanked = blankExclusionRegions(
        extraction.samples,
        extraction.sampleRate,
        extraction.windowStartCtxTime,
        extraction.windowEndCtxTime,
        rivalClipExclusions(ctx) // scheduled clips + the tail the mic still hears
      );
      const analysisSamples = blanked.samples;
      rec.blankedMs = blanked.blankedMs;

      // Amplitude diagnostics (apps/play addition, not in the spike): the
      // block-rms profile of exactly what the offline detector will scan —
      // answers "was the shout quiet, or was the detector wrong?" straight
      // from a session's NDJSON without needing a debug export.
      {
        let peakBlock = 0;
        let sumAll = 0;
        for (let i = 0; i + 128 <= analysisSamples.length; i += 128) {
          let sumSq = 0;
          for (let j = 0; j < 128; j++) {
            const s = analysisSamples[i + j]!;
            sumSq += s * s;
          }
          const rms = Math.sqrt(sumSq / 128);
          if (rms > peakBlock) peakBlock = rms;
          sumAll += rms;
        }
        rec.peakBlockRms = peakBlock;
        rec.meanBlockRms = analysisSamples.length >= 128 ? sumAll / Math.floor(analysisSamples.length / 128) : 0;
        rec.vadMultUsed = parseFloat(el.tuneVadMult.value) || 6;
      }

      // Iteration-2: prime the onset floor from the window's own leading
      // ambience (blanked regions only pull it down — fail-safe). 0.001 =
      // primed-off / quiet room, in which case behavior is spike-verbatim.
      const primedNoiseFloor = ONSET_FLOOR_PRIME_MS > 0
        ? primeNoiseFloorFromBuffer(analysisSamples, extraction.sampleRate, ONSET_FLOOR_PRIME_MS)
        : 0.001;
      rec.primedNoiseFloor = primedNoiseFloor;

      logEvent("recognition_window", {
        throwIndex: throwEvent.throwIndex,
        windowStartCtxTime: rec.windowStartCtxTime,
        windowEndCtxTime: rec.windowEndCtxTime,
        blankedMs: rec.blankedMs,
        clampedToPrevRound: rec.clampedToPrevRound,
        peakBlockRms: rec.peakBlockRms,
        meanBlockRms: rec.meanBlockRms,
        vadMultUsed: rec.vadMultUsed,
        primedNoiseFloor,
      });

      // No metronome click in sync mode, so no exclusion band is needed here.
      const onsetResult = findEnergyOnsetInBuffer(analysisSamples, extraction.sampleRate, {
        sustainMs: OFFLINE_ONSET_SUSTAIN_MS,
        vadMult: parseFloat(el.tuneVadMult.value) || 6,
        floorCap: BUFFER_FLOOR_CAP,
        initialNoiseFloor: primedNoiseFloor,
      });
      let voiceOnsetPerfTime: number | null = null;
      let preWindow = false;
      if (onsetResult != null) {
        rec.bufferOnsetFound = true;
        rec.bufferOnsetMsInWindow = onsetResult.onsetMs;
        rec.bufferOnsetPreWindow = onsetResult.preWindow;
        const onsetCtxTime = extraction.windowStartCtxTime + onsetResult.onsetMs / 1000;
        voiceOnsetPerfTime = clockMap.toPerformanceTime(onsetCtxTime);
        preWindow = onsetResult.preWindow;
        // Iteration-2 phase 3: in sorollós a pinned (preWindow) onset is
        // room noise, not voice evidence — classify by hand alone. The raw
        // reading stays in rec.bufferOnsetPreWindow for the debug export.
        if (demotePreWindowOnset(getEntorn(), preWindow)) {
          logEvent("prewindow_demoted", { throwIndex: throwEvent.throwIndex, entorn: getEntorn() });
          voiceOnsetPerfTime = null;
          preWindow = false;
        }
      }
      finalizeSyncThrow(throwEvent, debugRec, voiceOnsetPerfTime, preWindow);

      if (!voskLoaded()) return;
      activeRecognitions++;
      return voskRecognizer
        .recognizeWordRaw(analysisSamples, extraction.sampleRate)
        .then(({ rawText, hasResult }) => {
          rec.rawText = rawText;
          rec.hasResult = hasResult;
          const word = (rawText || "").trim();
          rec.finalWord = word && word !== "[unk]" ? word : "?";
          rec.latencyMs = performance.now() - t0;
          logEvent("recognition_result", {
            throwIndex: throwEvent.throwIndex,
            rawText: rec.rawText,
            finalWord: rec.finalWord,
            latencyMs: rec.latencyMs,
          });
          applyRecognizedWord(throwEvent, rec.finalWord as string);
        })
        .catch((err: unknown) => {
          rec.error = err instanceof Error ? err.message : String(err);
          rec.latencyMs = performance.now() - t0;
          reportError("vosk-recognize", err);
          applyRecognizedWord(throwEvent, "?");
        })
        .finally(() => {
          activeRecognitions--;
        });
    })
    .catch((err: unknown) => {
      rec.skipped = true;
      rec.skipReason = "ring extraction failed/timed out";
      rec.error = err instanceof Error ? err.message : String(err);
      rec.latencyMs = performance.now() - t0;
      finalizeSyncThrow(throwEvent, debugRec, null);
      if (voskLoaded()) applyRecognizedWord(throwEvent, "?");
    });
}

// step 10 fix 3: preWindow means the buffer's very first block was already
// above threshold — the true onset is AT OR BEFORE the window's start, so
// the reported delta (always exactly -SYNC_PRE_MS in that case) is a lower
// bound, not an exact measurement. Surfaced as voicePreWindow so the UI can
// show "≥" instead of a falsely-precise number.
export function finalizeSyncThrow(
  throwEvent: ThrowEvent,
  debugRec: DebugRec,
  voiceOnsetPerfTime: number | null,
  preWindow?: boolean
): void {
  // Phase C.1: settle first through the fist/voice disambiguator — a reset
  // never reaches classifySyncThrow as a throw at all.
  const settleCls = classifyHandSettleForSyncFrom(
    throwEvent.handFingerCount,
    voiceOnsetPerfTime,
    throwEvent.handPreOnsetFingerCount
  );
  throwEvent.handFingerCount = settleCls.effectiveFingerCount;
  debugRec.hand.fingerCount = settleCls.effectiveFingerCount;

  let cls: { outcome: SyncOutcomeAll; syncDeltaMs: number | null; synced: boolean };
  let isPreWindow = false;
  if (settleCls.isReset) {
    cls = { outcome: "reset", syncDeltaMs: null, synced: false };
  } else {
    cls = classifySyncThrow(throwEvent.handOnsetPerfTime!, voiceOnsetPerfTime, debugRec.coOccurrenceMs);
    isPreWindow = voiceOnsetPerfTime != null && !!preWindow;
    // A pinned-at-window-start onset is only a LOWER BOUND on how early the
    // voice really started — with SYNC_PRE_MS == the default co-occurrence
    // window, the raw math can land exactly on the "synced" boundary, which
    // would be a false positive (we can't confirm it's genuinely in-window).
    // Never report a preWindow pin as a confident SYNCED.
    if (isPreWindow && cls.outcome === "synced") {
      cls = { outcome: "voice-early", syncDeltaMs: cls.syncDeltaMs, synced: false };
    }
  }
  throwEvent.voiceOnsetPerfTime = voiceOnsetPerfTime;
  throwEvent.syncDeltaMs = cls.syncDeltaMs;
  throwEvent.outcome = cls.outcome;
  throwEvent.voicePreWindow = isPreWindow;
  throwEvent.pending = false;

  debugRec.voice.onsetPerfTime = voiceOnsetPerfTime;
  debugRec.voice.reason = voiceOnsetPerfTime == null ? "no onset" : null;
  debugRec.voice.onsetSource = voiceOnsetPerfTime != null ? "buffer" : null;
  debugRec.voice.preWindow = throwEvent.voicePreWindow;
  debugRec.outcome = cls.outcome;
  debugRec.syncDeltaMs = cls.syncDeltaMs;

  logEvent("throw_outcome", {
    throwIndex: throwEvent.throwIndex,
    outcome: cls.outcome,
    syncDeltaMs: cls.syncDeltaMs,
    fingerCount: throwEvent.handFingerCount,
    voicePreWindow: throwEvent.voicePreWindow,
  });

  // Phase C.1: a reset is the arming signal itself — drop the in-progress
  // UI right back to idle/armed instead of leaving "Reading your throw…"
  // up for a throw that never happened. Guarded to the latest sync throw so
  // a slow-to-resolve reset can't clobber a real throw that started after it.
  if (settleCls.isReset && syncThrows[syncThrows.length - 1] === throwEvent) {
    setThrowInProgress(false);
    armForNextThrow();
    renderReadyPill();
    gameHooks.onReset(); // game-card restore is Partida-only (game.ts decides)
  }

  renderSyncTally(syncThrows);
  if (isCurrentVerdictThrow(throwEvent)) renderSyncVerdict(throwEvent);
  gameHooks.onThrowFinalized(throwEvent);
  for (const o of throwObservers) o.onThrowFinalized?.(throwEvent);
}

export function applyRecognizedWord(t: ThrowEvent, word: string): void {
  t.word = word;
  renderBigWordResultFor(t, word);
  if (isCurrentVerdictThrow(t)) el.verdictWord.textContent = word && word !== "?" ? `"${word}"` : "?";
  gameHooks.onWordApplied(t);
}

// A voice-only event: the live VAD fired but no hand onset showed up nearby,
// so there's no throw to anchor a buffer extraction on. Waits
// SYNC_PARTNER_TIMEOUT_MS, re-checking in case a hand onset shows up in the
// meantime, before recording it as incomplete — visible, not silently
// dropped.
function recordSyncIncompleteThrow(voicePerfTime: number): void {
  const throwEvent: ThrowEvent = {
    kind: "sync",
    throwIndex: syncThrows.length + 1,
    handOnsetPerfTime: null,
    handSettlePerfTime: null,
    handFingerCount: null,
    handPreOnsetFingerCount: null,
    voiceOnsetPerfTime: voicePerfTime,
    voicePreWindow: false,
    syncDeltaMs: null,
    outcome: "voice-only",
    pending: false,
    word: null,
    gameHandled: false,
    clampFloorCtxTime: null,
    rivalRevealed: false,
    revealedAiMove: null,
    revealedVerified: null,
  };
  syncThrows.push(throwEvent);
  renderSyncTally(syncThrows);
  renderSyncVerdict(throwEvent);

  const debugRec: DebugRec = {
    mode: "sync",
    handOnsetPerfTime: null,
    hand: { motionStartPerfTime: null, settlePerfTime: null, fingerCount: null, onsetPerfTime: null, reason: "no hand", settlePath: null },
    voice: { onsetPerfTime: voicePerfTime, reason: null, onsetSource: "vad", preWindow: null },
    outcome: "voice-only",
    syncDeltaMs: null,
    coOccurrenceMs: getSyncCoOccurrenceMs(),
    modelLoaded: voskLoaded(),
    recognition: null,
  };
  pushDebugLog(debugRec);
}

export function onSyncVoiceOnset(voicePerfTime: number): void {
  if (!syncReady()) return;
  const handTimesNow = syncThrows.filter((t) => t.handOnsetPerfTime != null).map((t) => t.handOnsetPerfTime!);
  if (!isOrphanVoiceOnset(voicePerfTime, handTimesNow, SYNC_PARTNER_TIMEOUT_MS)) return; // already explained
  setTimeout(() => {
    const handTimesLater = syncThrows.filter((t) => t.handOnsetPerfTime != null).map((t) => t.handOnsetPerfTime!);
    if (isOrphanVoiceOnset(voicePerfTime, handTimesLater, SYNC_PARTNER_TIMEOUT_MS)) recordSyncIncompleteThrow(voicePerfTime);
  }, SYNC_PARTNER_TIMEOUT_MS);
}
