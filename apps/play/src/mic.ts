// mic.ts — ports spikes/s03-beat.html L2297–2414: startMic + the live-VAD
// wiring (findings H and J — the old app never wired these). Device
// acquisition + worklet construction come from @morra/platform-web's
// MicGraph → @morra/recognition's VadRingBuffer (both faithful ports of
// this same spike region); this module owns the app-side listeners:
//   - onLevel  → latestMicLevel → meters (voice meter + Ajustos RMS)
//   - onOnset  → clockMap → perf-timeline → SHOUT! flash + the voice-onset
//     hook (M3's analysis.onSyncVoiceOnset — orphan "shouted but never
//     threw" detection; the live VAD stays COSMETIC for throw timing, the
//     authoritative onset is the offline buffer replay)
// The mic's ring buffer is the SAME buffer later extractions read from —
// no separate recording path.

import { MicGraph } from "@morra/platform-web";
import {
  beginAmbientCalibration,
  feedAmbientSample,
  getDspMode,
  getEntorn,
  getMeasuredAmbientFloor,
  liveFloorMinFor,
  micConstraintsFor,
  setCalibratedHandler,
  setEntornChangeHandler,
} from "./entorn.js";
import type { VadRingBuffer } from "@morra/recognition";
import { clockMap, ctx, ensureAudioResumed } from "./audioClock.js";
import { el } from "./dom.js";
import { reportError, setChip } from "./status.js";
import { logEvent } from "./telemetry.js";
import { renderShoutError, renderShoutListening, renderShoutRequesting, triggerShoutFlash } from "./render/shout.js";

const mic = new MicGraph(ctx);
let ring: VadRingBuffer | null = null;
let latestMicLevel = { rms: 0, threshold: 0 };
// ux-pirates: overdriven-input warning. Session logs (c358f352) show every
// recognition failure in the loud stretch had peak block RMS >= 0.9 —
// clipped audio that vosk can't read — while 0.2–0.5 recognized 100%. The
// meter said "loud enough" but never "too loud"; this makes saturation
// visible the moment it happens instead of failing silently per-throw.
const CLIP_RMS = 0.75;
let clipHotUntilPerf = -Infinity;
let clipWarnEl: HTMLElement | null | undefined;
let lastVoiceOnsetAtPerf = -Infinity;

export type VoiceOnsetHandler = (voicePerfTime: number) => void;
let onVoiceOnset: VoiceOnsetHandler = () => {};
export function setVoiceOnsetHandler(handler: VoiceOnsetHandler): void {
  onVoiceOnset = handler;
}

export function micReady(): boolean {
  return ring != null;
}

/** The live ring buffer — M3's analysis pipeline extracts from it. */
export function micRing(): VadRingBuffer | null {
  return ring;
}

export async function startMic(): Promise<void> {
  el.btnMic.disabled = true;
  setChip(el.chipMic, "requesting…", "warn");
  renderShoutRequesting();
  try {
    // Inside the button gesture (finding A) — the worklet needs a running
    // context, and the clock mapping must be live before onsets are stamped.
    await ensureAudioResumed();
    // Entorn preset picks the constraints: tranquil = spike-verbatim raw
    // capture; sorollós = browser noiseSuppression/echoCancellation on
    // (iteration-2 noisy-venue bundle, see entorn.ts). The mode tècnic DSP
    // override pins that choice independently of the preset for A/B.
    const requested = micConstraintsFor(getEntorn(), getDspMode());
    ring = await mic.start(requested);
    // Requested vs APPLIED: the UA may silently ignore DSP constraints, so
    // the fix-#4 A/B keys off what the track reports, not what we asked.
    const applied = mic.appliedSettings;
    logEvent("mic_start", {
      entorn: getEntorn(),
      dspMode: getDspMode(),
      requested,
      applied: applied
        ? {
            echoCancellation: applied.echoCancellation ?? null,
            noiseSuppression: applied.noiseSuppression ?? null,
            autoGainControl: applied.autoGainControl ?? null,
            sampleRate: applied.sampleRate ?? null,
            channelCount: applied.channelCount ?? null,
            deviceId: applied.deviceId ?? null,
          }
        : null,
      honored: applied
        ? applied.noiseSuppression === requested.noiseSuppression &&
          applied.echoCancellation === requested.echoCancellation
        : null,
    });
    beginAmbientCalibration(); // ~1.5s ambient sample off the live level stream
    ring.onLevel((_t, rms, threshold) => {
      latestMicLevel = { rms, threshold };
      feedAmbientSample(rms);
    });
    ring.onOnset((t, _rms) => {
      const perfT = clockMap.toPerformanceTime(t);
      if (perfT != null) {
        lastVoiceOnsetAtPerf = perfT;
        onVoiceOnset(perfT);
        triggerShoutFlash(perfT, t);
      }
    });
    setChip(el.chipMic, "running", "ok");
    renderShoutListening();
    pushVadTuning(); // push the slider's current value to the fresh worklet
  } catch (err) {
    setChip(el.chipMic, "error", "bad");
    reportError("mic", err);
    renderShoutError(err instanceof Error ? err.message : String(err));
    el.btnMic.disabled = false;
  }
}

export function pushVadTuning(): void {
  // In sorollós the live-VAD floor rides the measured room ambience so the
  // cosmetic shout/meter UX stops firing on crowd noise (the offline
  // authoritative onset has its own per-window floor priming).
  ring?.tune(
    parseFloat(el.tuneVadMult.value),
    liveFloorMinFor(getEntorn(), getMeasuredAmbientFloor())
  );
}

/** Entorn switch mid-session: re-acquire the mic with the new preset's
 * constraints. The ring is replaced wholesale — analysis reads micRing()
 * live per throw, so the next window extracts from the new ring; worklet
 * click-blanking state resets (acceptable: the next scheduled clip
 * re-registers itself). No-op if the mic was never started. */
async function restartMicForEntorn(): Promise<void> {
  if (!ring) return;
  mic.stop();
  ring = null;
  setChip(el.chipMic, "reiniciant…", "warn");
  await startMic();
}

setEntornChangeHandler(() => void restartMicForEntorn());
setCalibratedHandler(() => pushVadTuning());

/** Called from the shared frame loop (spike frame() slice) — meters +
 * threshold mark + the VAD chip's firing/level readout. */
export function updateMicMeterUI(): void {
  el.micRms.textContent = latestMicLevel.rms.toFixed(4);
  el.micThresh.textContent = latestMicLevel.threshold.toFixed(4);
  const pct = Math.min(100, latestMicLevel.rms * 400);
  (el.micMeterFill as HTMLElement).style.width = pct + "%";
  el.micMeterFill.classList.toggle("hot", latestMicLevel.rms > latestMicLevel.threshold);

  const threshPct = Math.min(100, latestMicLevel.threshold * 400);
  (el.voiceMeterFill as HTMLElement).style.width = pct + "%";
  el.voiceMeterFill.classList.toggle("hot", latestMicLevel.rms > latestMicLevel.threshold);
  (el.voiceThreshMark as HTMLElement).style.left = threshPct + "%";

  if (latestMicLevel.rms > CLIP_RMS) clipHotUntilPerf = performance.now() + 1200;
  const clipping = performance.now() < clipHotUntilPerf;
  el.voiceMeterFill.classList.toggle("clip", clipping);
  if (clipWarnEl === undefined) clipWarnEl = document.getElementById("clipWarn");
  if (clipWarnEl) clipWarnEl.hidden = !clipping;

  if (ring) {
    const firing = performance.now() - lastVoiceOnsetAtPerf < 300;
    setChip(
      el.chipVad,
      firing ? "firing!" : `rms ${latestMicLevel.rms.toFixed(3)} / thr ${latestMicLevel.threshold.toFixed(3)}`,
      firing ? "ok" : "dim"
    );
  }
}
