// vosk.ts — ports spikes/s03-beat.html L2066–2139 (lazy button-gated model
// load with download progress) via @morra/recognition's VoskCallRecognizer
// (itself the faithful port of the same region's ensureVoskLoaded/
// fetchModelBlob/recognizeWord pipeline). The per-throw recognizeWindow
// call is wired by the analysis pipeline (M3/M4); this module owns loading
// + status surfaces.

import { VoskCallRecognizer } from "@morra/recognition";
import { VOSK_CDN_URL, VOSK_GRAMMAR_WORDS, VOSK_MODEL_URL, VOSK_SAMPLE_RATE } from "./config.js";
import { el, setStatus } from "./dom.js";
import { reportError, setChip } from "./status.js";
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
      `Downloading model… ${fmtBytes(received)}${total ? " / " + fmtBytes(total) : ""} (${pct.toFixed(0)}%)`
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
  setStatus(el.voskStatus, "Loading vosk-browser runtime…");
  try {
    const t0 = performance.now();
    await voskRecognizer.load();
    const totalMs = performance.now() - t0;
    setStatus(el.voskStatus, `Voice recognition ready (CA) — loaded in ${(totalMs / 1000).toFixed(1)}s.`, "ok");
    el.btnLoadVosk.textContent = "Voice Recognition Loaded (CA)";
    setChip(el.chipVosk, "loaded", "ok");
    renderBigWordIdle(true);
  } catch (err) {
    setStatus(el.voskStatus, "Voice recognition load error: " + (err instanceof Error ? err.message : String(err)), "err");
    setChip(el.chipVosk, "error", "bad");
    reportError("vosk", err);
    el.btnLoadVosk.disabled = false;
  } finally {
    voskLoading = false;
  }
}
