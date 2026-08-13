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
import type { VadRingBuffer } from "@morra/recognition";
import { clockMap, ctx, ensureAudioResumed } from "./audioClock.js";
import { el } from "./dom.js";
import { reportError, setChip } from "./status.js";
import { renderShoutError, renderShoutListening, renderShoutRequesting, triggerShoutFlash } from "./render/shout.js";

const mic = new MicGraph(ctx);
let ring: VadRingBuffer | null = null;
let latestMicLevel = { rms: 0, threshold: 0 };
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
    ring = await mic.start(); // echoCancellation/noiseSuppression/autoGainControl all off (spike parity)
    ring.onLevel((_t, rms, threshold) => {
      latestMicLevel = { rms, threshold };
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
  ring?.tune(parseFloat(el.tuneVadMult.value));
}

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

  if (ring) {
    const firing = performance.now() - lastVoiceOnsetAtPerf < 300;
    setChip(
      el.chipVad,
      firing ? "firing!" : `rms ${latestMicLevel.rms.toFixed(3)} / thr ${latestMicLevel.threshold.toFixed(3)}`,
      firing ? "ok" : "dim"
    );
  }
}
