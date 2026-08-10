// mediapipeFingerRecognizer.ts — browser glue implementing @morra/core's
// FingerRecognizer contract, extracted from spikes/s01-fingers.html's
// worker-mode pipeline (classic worker + OffscreenCanvas, primary) and
// spikes/s03-beat.html's main-thread pipeline (dynamic import() of the
// same tasks-vision bundle, used here as s01's documented fallback for
// browsers without Worker+OffscreenCanvas support).
//
// Unlike the spike (which owns its own capture loop internally), this
// class conforms to FingerRecognizer's recognizeFrame(input, capturedAtMs)
// shape: the CALLER owns the frame pump (rVFC/rAF) and calls
// recognizeFrame() once per frame with whatever the platform layer already
// captured. That's a genuine shape change from the spike (which predates
// this contract) — the underlying counting/detection algorithm itself is
// unchanged.
//
// M5 parity fix: this class now ALSO runs @morra/recognition's own
// stepVelocityStateMachine (velocity.ts, pure, already existed since M2 but
// was never wired into a real frame loop) and surfaces its motion-onset
// events through FingerRecognitionResult.motionOnset — closing the parity
// gap where apps/web could only anchor sync timing on count-stability
// (settle/stability-only anchoring reintroduces the spike's own documented
// ~200ms voice-early bias; velocity-anchored motion-start timing is what
// fixed it in real testing). The state machine runs identically in BOTH
// modes: worker mode reads the raw per-frame velocity number the worker
// already computes internally (now included in its 'result' message);
// main-thread-fallback mode computes it itself via tipVelocity.ts (a real
// import there — no Blob-string constraint on that path).
import type { FingerCount, FingerRecognitionResult, FingerRecognizer, MotionOnsetEvent, RankedHypothesis } from "@morra/core";
import { countFingers, type Landmark } from "./counting.js";
import { buildFingerWorkerSource } from "./workerSource.js";
import { computeTipVelocity, fingertipsOf } from "./tipVelocity.js";
import { DEFAULT_VELOCITY_CONFIG, INITIAL_VELOCITY_STATE, stepVelocityStateMachine, type VelocityConfig, type VelocityMachineState } from "./velocity.js";

export interface FingerRecognizerOptions {
  tasksVisionBundleUrl?: string;
  tasksVisionWasmUrl?: string;
  tasksVisionModuleUrl?: string; // for the main-thread fallback's dynamic import()
  handModelUrl?: string;
  numHands?: number;
  /** Thresholds for the velocity state machine — defaults match the
   * spike's own (HIGH_V=0.9, LOW_V=0.25, SETTLE_MS=50). Overridable so
   * apps/web's settings panel (already exposing these three sliders) can
   * feed live tuning through. */
  velocityConfig?: VelocityConfig;
}

const DEFAULTS: Required<Omit<FingerRecognizerOptions, "velocityConfig">> = {
  // Pinned version (audit C1): never @latest — this code runs with live camera access.
  // MUST be a version that ships the classic vision_bundle.js (the worker loads it via
  // importScripts): 1.0.1 does; 0.10.14 does NOT (.cjs/.mjs only → 404 → dead worker).
  tasksVisionBundleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js",
  tasksVisionWasmUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
  tasksVisionModuleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1",
  handModelUrl: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  numHands: 1,
};

export type FingerRecognizerMode = "worker" | "main-thread-fallback";

export interface FingerRecognizerInitResult {
  mode: FingerRecognizerMode;
  delegate: "GPU" | "CPU";
}

// A HandLandmarker instance shaped enough to call detectForVideo — kept
// minimal/structural rather than importing @mediapipe/tasks-vision's full
// type (that package is a devDependency for types only; the RUNTIME load
// is always the CDN dynamic import(), matching the spike's proven pattern,
// never a bundler-resolved static import).
interface MinimalHandLandmarker {
  detectForVideo(source: unknown, timestampMs: number): { landmarks?: Landmark[][] };
}

let monotonicMsCounter = -1;
function monotonicMs(candidateMs: number): number {
  const t = candidateMs <= monotonicMsCounter ? monotonicMsCounter + 1 : candidateMs;
  monotonicMsCounter = t;
  return t;
}

/**
 * Confidence heuristic: the spike's counting math has no native confidence
 * score, so this recognizer reports a fixed 1.0 for its single hypothesis
 * when a hand was detected, matching the "single hypothesis, fixed
 * confidence" allowance documented on RankedHypothesis.
 */
function toFingerCountHypotheses(handDetected: boolean, count: number | null): RankedHypothesis<FingerCount>[] {
  if (!handDetected || count == null) return [];
  const clamped = Math.max(0, Math.min(5, count)) as FingerCount;
  return [{ value: clamped, confidence: 1.0 }];
}

export class MediaPipeFingerRecognizer implements FingerRecognizer {
  private readonly options: Required<Omit<FingerRecognizerOptions, "velocityConfig">>;
  private velocityConfig: VelocityConfig;
  private velocityState: VelocityMachineState = INITIAL_VELOCITY_STATE;
  private mode: FingerRecognizerMode | null = null;
  private worker: Worker | null = null;
  private fallbackLandmarker: MinimalHandLandmarker | null = null;
  // main-thread-fallback path's own prev-frame tip tracking — the worker
  // path tracks this identically but internally, inside the worker itself.
  private prevTips: Landmark[] | null = null;
  private prevTs: number | null = null;
  private reqCounter = 0;
  private readonly pending = new Map<
    number,
    { resolve: (r: FingerRecognitionResult) => void; reject: (e: Error) => void }
  >();
  private workerReady: Promise<FingerRecognizerInitResult> | null = null;

  constructor(options: FingerRecognizerOptions = {}) {
    const { velocityConfig, ...rest } = options;
    this.options = { ...DEFAULTS, ...rest };
    this.velocityConfig = velocityConfig ?? DEFAULT_VELOCITY_CONFIG;
  }

  /** Steps the shared velocity state machine and returns the onset event
   * (if any) in the FingerRecognitionResult shape. Used by both modes. */
  private stepVelocity(t: number, v: number | null): MotionOnsetEvent | null {
    if (v == null) return null;
    const { state, onset } = stepVelocityStateMachine(this.velocityState, t, v, this.velocityConfig);
    this.velocityState = state;
    return onset;
  }

  /** Live-updates the velocity thresholds (e.g. from a settings panel) —
   * takes effect on the next frame, no restart needed. Does not reset the
   * in-flight state machine's current phase (idle/spiking/settling), only
   * the thresholds it's compared against going forward. */
  setVelocityConfig(config: VelocityConfig): void {
    this.velocityConfig = config;
  }

  async init(): Promise<FingerRecognizerInitResult> {
    const supportsWorkerOffscreen = typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
    if (supportsWorkerOffscreen) {
      try {
        return await this.initWorker();
      } catch {
        // classic-worker init failed (e.g. the documented "ModuleFactory
        // not set" class of error, or a network/CDN failure) — fall back.
      }
    }
    return this.initMainThreadFallback();
  }

  private initWorker(): Promise<FingerRecognizerInitResult> {
    if (this.workerReady) return this.workerReady;
    this.workerReady = new Promise<FingerRecognizerInitResult>((resolve, reject) => {
      const src = buildFingerWorkerSource({
        tasksVisionBundleUrl: this.options.tasksVisionBundleUrl,
        tasksVisionWasmUrl: this.options.tasksVisionWasmUrl,
        handModelUrl: this.options.handModelUrl,
        numHands: this.options.numHands,
      });
      const blobUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      // Classic worker (no {type:'module'}) — see workerSource.ts's header comment.
      const worker = new Worker(blobUrl);
      worker.onmessage = (ev: MessageEvent) => this.onWorkerMessage(ev, resolve, reject);
      worker.onerror = (ev: ErrorEvent) => reject(new Error(`finger worker failed to load: ${ev.message}`));
      this.worker = worker;
    });
    return this.workerReady;
  }

  private onWorkerMessage(
    ev: MessageEvent,
    onReady: (r: FingerRecognizerInitResult) => void,
    onFatal: (e: Error) => void
  ): void {
    const msg = ev.data;
    if (msg.type === "ready") {
      this.mode = "worker";
      onReady({ mode: "worker", delegate: msg.delegate });
      return;
    }
    if (msg.type === "fatal-error") {
      onFatal(new Error(`finger worker HandLandmarker init failed: ${msg.message}`));
      return;
    }
    if (msg.type === "frame-error") {
      const p = this.pending.get(msg.id);
      if (p) { this.pending.delete(msg.id); p.reject(new Error(`finger worker frame error: ${msg.message}`)); }
      return;
    }
    if (msg.type === "result") {
      const p = this.pending.get(msg.id);
      if (msg.overlayBitmap && msg.overlayBitmap.close) msg.overlayBitmap.close(); // caller doesn't need the overlay through this contract
      // Velocity is stepped through the state machine unconditionally
      // (even if no caller is currently awaiting this frame's promise) so
      // the state machine never misses a frame's worth of motion data.
      const motionOnset = this.stepVelocity(msg.timestamp, msg.velocity ?? null);
      if (!p) return;
      this.pending.delete(msg.id);
      p.resolve({
        hypotheses: toFingerCountHypotheses(msg.handDetected, msg.count),
        capturedAtMs: msg.timestamp,
        velocity: msg.velocity ?? null,
        motionOnset,
      });
    }
  }

  private async initMainThreadFallback(): Promise<FingerRecognizerInitResult> {
    const mod = (await import(/* @vite-ignore */ this.options.tasksVisionModuleUrl)) as {
      FilesetResolver: { forVisionTasks(wasmUrl: string): Promise<unknown> };
      HandLandmarker: { createFromOptions(vision: unknown, opts: unknown): Promise<MinimalHandLandmarker> };
    };
    const { FilesetResolver, HandLandmarker } = mod;
    const vision = await FilesetResolver.forVisionTasks(this.options.tasksVisionWasmUrl);
    let delegate: "GPU" | "CPU" = "GPU";
    try {
      this.fallbackLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this.options.handModelUrl, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: this.options.numHands,
      });
    } catch {
      delegate = "CPU";
      this.fallbackLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: this.options.handModelUrl, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: this.options.numHands,
      });
    }
    this.mode = "main-thread-fallback";
    return { mode: "main-thread-fallback", delegate };
  }

  /**
   * input: an ImageBitmap when running in worker mode (the caller must
   * createImageBitmap(video) itself — this class doesn't own the video
   * element), or any MediaPipe-accepted VIDEO source (e.g. an
   * HTMLVideoElement) when running in the main-thread fallback.
   */
  async recognizeFrame(input: unknown, capturedAtMs: number): Promise<FingerRecognitionResult> {
    if (this.mode === "worker") return this.recognizeViaWorker(input as ImageBitmap, capturedAtMs);
    if (this.mode === "main-thread-fallback") return this.recognizeViaMainThread(input, capturedAtMs);
    throw new Error("MediaPipeFingerRecognizer.recognizeFrame called before init() resolved");
  }

  private recognizeViaWorker(bitmap: ImageBitmap, capturedAtMs: number): Promise<FingerRecognitionResult> {
    if (!this.worker) throw new Error("worker not initialized");
    const id = ++this.reqCounter;
    const timestamp = monotonicMs(capturedAtMs);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: "frame", id, bitmap, timestamp }, [bitmap]);
    });
  }

  private recognizeViaMainThread(input: unknown, capturedAtMs: number): FingerRecognitionResult {
    if (!this.fallbackLandmarker) throw new Error("fallback HandLandmarker not initialized");
    const timestamp = monotonicMs(capturedAtMs);
    const result = this.fallbackLandmarker.detectForVideo(input, timestamp);
    const handDetected = !!(result.landmarks && result.landmarks.length > 0);
    const count = handDetected ? countFingers(result.landmarks![0]!) : null;

    let velocity: number | null = null;
    if (handDetected) {
      const tips = fingertipsOf(result.landmarks![0]!);
      velocity = computeTipVelocity(tips, this.prevTips, this.prevTs, timestamp);
      this.prevTips = tips;
      this.prevTs = timestamp;
    } else {
      this.prevTips = null;
      this.prevTs = null;
    }
    const motionOnset = this.stepVelocity(timestamp, velocity);

    return { hypotheses: toFingerCountHypotheses(handDetected, count), capturedAtMs: timestamp, velocity, motionOnset };
  }

  dispose(): void {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.fallbackLandmarker = null;
    this.pending.clear();
    this.prevTips = null;
    this.prevTs = null;
    this.velocityState = INITIAL_VELOCITY_STATE;
  }
}
