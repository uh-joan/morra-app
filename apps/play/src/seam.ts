// seam.ts — window.__play, the debug/test seam (ports the spike's
// window.__s03 pattern, L3860–3945): same member SIGNATURES as __s03 for
// everything apps/play implements, so the parity harness can drive both
// pages through one driver. Installed always, exactly like the spike's —
// it's the debug seam, not a test-only build. Grows with each milestone;
// game/mirror members land in M5/M6.

import {
  applyRecognizedWord,
  drainPendingAnalysis,
  finalizeSyncThrow,
  getSyncCoOccurrenceMs,
  onSyncHandOnset,
  onSyncVoiceOnset,
  pendingAnalysisCount,
  syncReady,
  syncThrows,
} from "./analysis.js";
import { currentHandState } from "./velocity.js";
import { currentFraming, handFrameHistory, handTrackingActive, lastFingerCount } from "./camera.js";
import { micReady, micRing } from "./mic.js";
import { voskLoaded } from "./vosk.js";
import { __calibration } from "./calibration.js";
import { debugLog, debugOrphanOnsets, eventBusLog, LOG_SESSION_ID } from "./telemetry.js";
import { clockMap, ctx } from "./audioClock.js";
import {
  currentLastThrownFingerCount,
  markThrowResolvedForReadyPill,
  updateReadyPillFromFrame,
} from "./readyPill.js";
import { lastRoundAudioEndCtxTime, rivalClipPlaybacks, setLastRoundAudioEndCtxTime } from "./rivalAudioLog.js";
import {
  commitAiMove,
  getCurrentAiLevel,
  getCurrentAiMove,
  getGameScore,
  getMatchHistory,
  getPlayerModel,
  getSessionMode,
  isGameOver,
  maybeResolveGameRound,
  resetGame,
  setCurrentAiLevel,
} from "./game.js";
import { setSessionMode } from "./modes.js";
import { getMirrorScope, setMirrorScope } from "./training.js";
import { getActiveProfileId, getProfiles } from "./profile.js";

export function installSeam(): void {
  (window as unknown as { __play: object }).__play = {
    // game (same member names as __s03)
    commitAiMove,
    maybeResolveGameRound,
    resetGame,
    get currentAiMove() {
      return getCurrentAiMove();
    },
    get currentAiLevel() {
      return getCurrentAiLevel();
    },
    set currentAiLevel(level: string) {
      setCurrentAiLevel(level);
    },
    get gameScore() {
      return getGameScore();
    },
    get gameOver() {
      return isGameOver();
    },
    get matchHistory() {
      return getMatchHistory();
    },
    get playerModel() {
      return getPlayerModel();
    },
    get sessionMode() {
      return getSessionMode();
    },
    setSessionMode,
    get mirrorScope() {
      return getMirrorScope();
    },
    set mirrorScope(scope: "session" | "allTime") {
      setMirrorScope(scope);
    },
    get activeProfileId() {
      return getActiveProfileId();
    },
    get profiles() {
      return getProfiles();
    },
    // sync pipeline
    onSyncHandOnset,
    onSyncVoiceOnset,
    finalizeSyncThrow,
    applyRecognizedWord,
    drainPendingAnalysis,
    syncReady,
    getSyncCoOccurrenceMs,
    get syncThrows() {
      return syncThrows;
    },
    get syncPendingAnalysisCount() {
      return pendingAnalysisCount();
    },
    // sensors
    /** Diagnostic: pull a raw window out of the live VAD ring buffer —
     * lets a test/debug session inspect exactly what the offline analysis
     * would see, without waiting for a throw. */
    extractRing(centerCtxTime: number, preMs: number, postMs: number) {
      const ring = micRing();
      return ring ? ring.requestExtract(centerCtxTime, preMs, postMs) : Promise.reject(new Error("mic not running"));
    },
    get handState() {
      return currentHandState();
    },
    get handTrackingActive() {
      return handTrackingActive;
    },
    get micReady() {
      return micReady();
    },
    get voskLoaded() {
      return voskLoaded();
    },
    get lastFingerCount() {
      return lastFingerCount();
    },
    get handFrameHistory() {
      return handFrameHistory;
    },
    // calibration + framing (per profile+device sensor fits)
    calibration: __calibration,
    get framing() {
      return currentFraming();
    },
    // ready pill
    updateReadyPillFromFrame,
    markThrowResolvedForReadyPill,
    get lastThrownFingerCount() {
      return currentLastThrownFingerCount();
    },
    // rival audio log
    get rivalClipPlaybacks() {
      return rivalClipPlaybacks;
    },
    get lastRoundAudioEndCtxTime() {
      return lastRoundAudioEndCtxTime();
    },
    set lastRoundAudioEndCtxTime(v: number | null) {
      setLastRoundAudioEndCtxTime(v);
    },
    // telemetry
    get debugLog() {
      return debugLog;
    },
    get debugOrphanOnsets() {
      return debugOrphanOnsets;
    },
    get eventBusLog() {
      return eventBusLog;
    },
    sessionId: LOG_SESSION_ID,
    // clocks
    get audioCtxState() {
      return ctx.state;
    },
    get clockSample() {
      return clockMap.currentSample;
    },
  };
}
