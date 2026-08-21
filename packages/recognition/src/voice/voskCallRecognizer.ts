// voskCallRecognizer.ts — browser glue implementing @morra/core's
// CallRecognizer contract, ported from spikes/s03-beat.html's
// ensureVoskLoaded/fetchModelBlob/loadVoskModel/recognizeWord (itself
// ported verbatim from spikes/s02-voice.html's proven pipeline). Grammar-
// restricted vosk-browser, buffer-then-recognize over an already-extracted
// window — vocabulary is injected (Catalan morra words by default).
//
// vosk-browser ships as a UMD global (loaded via a <script> tag, exposing
// window.Vosk) rather than an ES import in the spike — preserved exactly,
// since that's the field-tested loading mechanism, not a design choice to
// revisit here.
import type { CallRecognizer, RecognitionResult } from "@morra/core";
import { fetchBlobWithCache } from "./modelCache.js";
import { resampleToSampleRate } from "./resample.js";

export const DEFAULT_CATALAN_VOCABULARY: readonly string[] = [
  "dos", "tres", "quatre", "cinc", "sis", "set", "vuit", "nou", "deu", "tot",
];

export interface VoskCallRecognizerOptions {
  cdnScriptUrl?: string;
  modelUrl?: string;
  sampleRate?: number;
  /** Grammar words (excluding the reject class, which is always appended). */
  vocabulary?: readonly string[];
  onDownloadProgress?: (received: number, total: number) => void;
}

const DEFAULT_CDN_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
const DEFAULT_MODEL_URL = "models/vosk-model-small-ca-0.4.zip"; // same-origin, relative to the host page
const DEFAULT_SAMPLE_RATE = 16000;
const UNKNOWN_TOKEN = "[unk]";

// Minimal structural types for the vosk-browser UMD global — kept local
// rather than depending on the (unpublished-types) npm package, since the
// runtime load is always the CDN <script> tag, never a bundler import.
interface VoskGlobal {
  createModel(blobUrl: string, logLevel?: number): Promise<VoskModel>;
}
interface VoskModel {
  KaldiRecognizer: new (sampleRate: number, grammar: string) => VoskRecognizer;
}
interface VoskRecognizer {
  on(event: "result", handler: (m: { result?: { text?: string } }) => void): void;
  acceptWaveformFloat(samples: Float32Array, sampleRate: number): void;
  retrieveFinalResult(): void;
  remove(): void;
}
declare global {
  interface Window {
    Vosk?: VoskGlobal;
  }
}

export class VoskCallRecognizer implements CallRecognizer {
  private readonly cdnScriptUrl: string;
  private readonly modelUrl: string;
  private readonly sampleRate: number;
  private readonly onDownloadProgress: ((received: number, total: number) => void) | undefined;
  private readonly grammarJson: string;
  private model: VoskModel | null = null;
  private loading: Promise<void> | null = null;

  constructor(options: VoskCallRecognizerOptions = {}) {
    this.cdnScriptUrl = options.cdnScriptUrl ?? DEFAULT_CDN_SCRIPT_URL;
    this.modelUrl = options.modelUrl ?? DEFAULT_MODEL_URL;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.onDownloadProgress = options.onDownloadProgress;
    const vocabulary = options.vocabulary ?? DEFAULT_CATALAN_VOCABULARY;
    this.grammarJson = JSON.stringify([...vocabulary, UNKNOWN_TOKEN]);
  }

  get isLoaded(): boolean {
    return this.model != null;
  }

  async load(): Promise<void> {
    if (this.model) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const Vosk = await this.ensureVoskScriptLoaded();
      const { blob } = await this.fetchModelBlob(this.modelUrl, this.onDownloadProgress);
      const blobUrl = URL.createObjectURL(blob);
      this.model = await Vosk.createModel(blobUrl, 0);
    })();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async ensureVoskScriptLoaded(): Promise<VoskGlobal> {
    if (window.Vosk) return window.Vosk;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = this.cdnScriptUrl;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load vosk-browser script from CDN — check network/CDN availability."));
      document.head.appendChild(s);
    });
    if (!window.Vosk) throw new Error("vosk-browser script loaded but window.Vosk is undefined.");
    return window.Vosk;
  }

  private async fetchModelBlob(
    url: string,
    onProgress?: (received: number, total: number) => void
  ): Promise<{ blob: Blob; bytes: number }> {
    // Cache Storage first (see modelCache.ts) — the 40 MB model downloads
    // once per device instead of once per visit on phones.
    return fetchBlobWithCache(url, "morra-vosk-model", onProgress);
  }

  /** Returns the raw Kaldi result detail's rawText (untrimmed) alongside
   * hasResult, so callers that want the spike's full debug fidelity can
   * still get it — recognizeWindow() below is the CallRecognizer-contract
   * entry point built on top of this. */
  async recognizeWordRaw(float32: Float32Array, srcSampleRate: number): Promise<{ rawText: string | null; hasResult: boolean }> {
    if (!this.model) throw new Error("VoskCallRecognizer.recognizeWordRaw called before load() resolved");
    const mono = await resampleToSampleRate(float32, srcSampleRate, this.sampleRate);
    const rec = new this.model.KaldiRecognizer(this.sampleRate, this.grammarJson);
    const resultPromise = new Promise<{ result?: { text?: string } }>((resolve) => rec.on("result", (m) => resolve(m)));
    rec.acceptWaveformFloat(mono, this.sampleRate);
    rec.retrieveFinalResult();
    const m = await resultPromise;
    rec.remove();
    const hasResult = !!(m && m.result);
    const rawText = hasResult && m.result!.text != null ? m.result!.text : null;
    return { rawText, hasResult };
  }

  async recognizeWindow(samples: Float32Array, sampleRate: number, capturedAtMs: number): Promise<RecognitionResult<string>> {
    const { rawText } = await this.recognizeWordRaw(samples, sampleRate);
    const word = (rawText || "").trim();
    const value = word && word !== UNKNOWN_TOKEN ? word : null;
    return { hypotheses: value ? [{ value, confidence: 1.0 }] : [], capturedAtMs };
  }
}
