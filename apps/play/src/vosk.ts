// vosk.ts — ports spikes/s03-beat.html L2066–2139 (lazy button-gated model
// load with download progress) via @morra/recognition's VoskCallRecognizer
// (itself the faithful port of the same region's ensureVoskLoaded/
// fetchModelBlob/recognizeWord pipeline). The per-throw recognizeWindow
// call is wired by the analysis pipeline (M3/M4); this module owns loading
// + status surfaces. ux-pirates: status copy is Catalan (the onboarding
// overlay mirrors it); the Voice Rec chip keeps its technical English.

import { VoskCallRecognizer } from "@morra/recognition";
import { VOSK_CDN_URL, VOSK_GRAMMAR_WORDS, VOSK_MODEL_URL, VOSK_SAMPLE_RATE } from "./config.js";
import { el, setStatus } from "./dom.js";
import { reportError, setChip } from "./status.js";
import { logEvent } from "./telemetry.js";
import { renderBigWordIdle } from "./render/bigWord.js";

function fmtBytes(n: number): string {
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

export const voskRecognizer = new VoskCallRecognizer({
  cdnScriptUrl: VOSK_CDN_URL,
  modelUrl: VOSK_MODEL_URL,
  sampleRate: VOSK_SAMPLE_RATE,
  vocabulary: VOSK_GRAMMAR_WORDS.filter((w) => w !== "[unk]"),
  onDownloadProgress: (received, total) => {
    const pct = total ? (received / total) * 100 : 0;
    setStatus(
      el.voskStatus,
      `Descarregant l'oïda… ${fmtBytes(received)}${total ? " / " + fmtBytes(total) : ""} (${pct.toFixed(0)}%)`
    );
  },
});

export function voskLoaded(): boolean {
  return voskRecognizer.isLoaded;
}

let voskLoading = false;

export async function loadVoskModel(): Promise<void> {
  if (voskRecognizer.isLoaded || voskLoading) return;
  voskLoading = true;
  el.btnLoadVosk.disabled = true;
  setChip(el.chipVosk, "loading…", "warn");
  setStatus(el.voskStatus, "Preparant el reconeixement de veu…");
  try {
    const t0 = performance.now();
    await voskRecognizer.load();
    const totalMs = performance.now() - t0;
    // Say WHERE it came from — «del bagul» proves the device cache held it,
    // «descarregada» means the network paid the 41 MB again. Field-debuggable
    // from the status line alone.
    const fromCache = voskRecognizer.modelFromCache === true;
    logEvent("vosk_load", { fromCache, ms: Math.round(totalMs) });
    setStatus(
      el.voskStatus,
      `Veu a punt (català) — ${fromCache ? "del bagul" : "descarregada"} en ${(totalMs / 1000).toFixed(1)}s.`,
      "ok"
    );
    el.btnLoadVosk.textContent = "Veu a punt";
    setChip(el.chipVosk, "loaded", "ok");
    renderBigWordIdle(true);
  } catch (err) {
    setStatus(el.voskStatus, "Error carregant la veu: " + (err instanceof Error ? err.message : String(err)), "err");
    setChip(el.chipVosk, "error", "bad");
    reportError("vosk", err);
    el.btnLoadVosk.disabled = false;
  } finally {
    voskLoading = false;
  }
}
