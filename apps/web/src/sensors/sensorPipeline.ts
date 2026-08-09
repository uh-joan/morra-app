// sensorPipeline.ts — the impure glue between real devices
// (camera/mic/AudioContext) and gameStore.ts's pure round pipeline. This is
// the "imperative singleton initialized outside the React lifecycle" the
// M4 dispatch requires: React never touches this module's internals, only
// calls start()/stop() from a mount effect and reads gameStore's state via
// useSyncExternalStore.
//
// KNOWN GAP vs the spike (disclosed, not silent): the spike's PRIMARY hand-
// onset trigger is velocity-based (processHandVelocity/stepVelocityStateMachine
// in @morra/recognition, watching fingertip motion settle) — but
// MediaPipeFingerRecognizer's public contract (M2) only returns FingerCount
// hypotheses per frame, not raw landmarks, so per-frame tip velocity isn't
// observable through it. This pipeline instead uses findStableCountRun
// (also from @morra/recognition, and per ITS OWN header comment already
// designed as "the held-over/reset semantics" fallback for exactly this
// situation) as the onset trigger: a settled run of SETTLE_FRAMES identical
// counts, preceded by a transition. Extending MediaPipeFingerRecognizer's
// contract to surface velocity/landmarks would close this gap but is out
// of scope for this pass.
import {
  MediaPipeFingerRecognizer,
  VoskCallRecognizer,
  findEnergyOnsetInBuffer,
  blankExclusionRegions,
  clampWindowStart,
  findStableCountRun,
  type CountFrame,
} from "@morra/recognition";
import { AudioContextManager, MicGraph, CameraSource } from "@morra/platform-web";
import type { GameStore } from "../game/gameStore.js";
import { SYNC_POST_MS, SYNC_PRE_MS } from "../game/gameStore.js";

const SETTLE_MIN_RUN = 4; // consecutive identical-count frames required to call a hand "settled"
const STABLE_FRAME_WINDOW = 24; // rolling buffer size fed to findStableCountRun

export class SensorPipeline {
  private readonly finger = new MediaPipeFingerRecognizer();
  private vosk: VoskCallRecognizer | null = null;
  private camera: CameraSource | null = null;
  private mic: MicGraph | null = null;
  private ring: Awaited<ReturnType<MicGraph["start"]>> | null = null;
  private frames: CountFrame[] = [];
  private lastCount: number | null = null;
  private running = false;
  private rafHandle: number | null = null;

  constructor(
    private readonly store: GameStore,
    private readonly audio: AudioContextManager,
    private readonly voskModelUrl: string | null
  ) {}

  async start(videoEl: HTMLVideoElement): Promise<void> {
    await this.audio.resume();

    const initResult = await this.finger.init();
    void initResult; // mode/delegate available for diagnostics if a future settings screen wants them

    if (this.voskModelUrl) {
      try {
        this.vosk = new VoskCallRecognizer({ modelUrl: this.voskModelUrl });
        await this.vosk.load();
        this.store.setVoskLoaded(true);
      } catch {
        this.vosk = null;
        this.store.setVoskLoaded(false);
      }
    } else {
      this.store.setVoskLoaded(false);
    }

    this.camera = new CameraSource();
    const stream = await this.camera.start();
    videoEl.srcObject = stream;
    await videoEl.play();

    this.mic = new MicGraph(this.audio.context);
    this.ring = await this.mic.start();

    this.running = true;
    this.pump(videoEl);
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.rafHandle);
    this.mic?.stop();
    this.camera?.stop();
    this.finger.dispose();
  }

  private pump(videoEl: HTMLVideoElement): void {
    const step = async (): Promise<void> => {
      if (!this.running) return;
      try {
        const bitmap = await createImageBitmap(videoEl);
        const result = await this.finger.recognizeFrame(bitmap, performance.now());
        const count = result.hypotheses[0]?.value ?? null;
        this.onFrame(count, result.capturedAtMs);
      } catch {
        // a single bad frame is never fatal — keep pumping
      }
      if (typeof requestAnimationFrame === "function") {
        this.rafHandle = requestAnimationFrame(() => void step());
      }
    };
    void step();
  }

  private onFrame(count: number | null, capturedAtMs: number): void {
    this.store.updateReadyPillFromFrame(count);
    if (count == null) {
      this.frames = [];
      this.lastCount = null;
      return;
    }
    this.frames = [...this.frames, { t: capturedAtMs, count }].slice(-STABLE_FRAME_WINDOW);
    const run = findStableCountRun(this.frames, SETTLE_MIN_RUN);
    if (run && !run.heldOver && run.t !== this.lastCount /* dedupe repeated identical detections is handled by clearing frames below */) {
      this.lastCount = count;
      this.frames = [];
      this.store.onHandOnset(count, run.t);
      void this.scheduleAudioAnalysis(run.t);
    }
  }

  private async scheduleAudioAnalysis(handOnsetPerfTime: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SYNC_POST_MS));
    if (!this.ring) return;
    const anchorCtxTime = this.audio.toContextTime(handOnsetPerfTime);
    if (anchorCtxTime == null) {
      this.store.onAudioWindowResult(null);
      this.store.onWordResult(null);
      return;
    }
    const clampFloorCtxTime = this.store.getSnapshot().lastRoundAudioEndCtxTime;
    const clamp = clampWindowStart(anchorCtxTime, SYNC_PRE_MS, clampFloorCtxTime);
    const extraction = await this.ring.requestExtract(anchorCtxTime, clamp.clampedPreMs, SYNC_POST_MS + 200);
    const exclusions = this.store.getSnapshot().rivalClipPlaybacks;
    const { samples } = blankExclusionRegions(extraction.samples, extraction.sampleRate, extraction.windowStartCtxTime, extraction.windowEndCtxTime, exclusions);
    const onset = findEnergyOnsetInBuffer(samples, extraction.sampleRate, { vadMult: this.store.getSnapshot().settings.vadMult });
    const voiceOnsetPerfTime = onset ? this.audio.toPerformanceTime(extraction.windowStartCtxTime + onset.onsetMs / 1000) : null;
    this.store.onAudioWindowResult(voiceOnsetPerfTime);

    if (this.vosk) {
      try {
        const rec = await this.vosk.recognizeWindow(samples, extraction.sampleRate, performance.now());
        const word = rec.hypotheses[0]?.value ?? null;
        this.store.onWordResult(word);
      } catch {
        this.store.onWordResult(null);
      }
    }
  }
}
