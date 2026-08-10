// sensorPipeline.ts — the impure glue between real devices
// (camera/mic/AudioContext) and gameStore.ts's pure round pipeline. This is
// the "imperative singleton initialized outside the React lifecycle" the
// M4 dispatch requires: React never touches this module's internals, only
// calls start()/stop() from a mount effect and reads gameStore's state via
// useSyncExternalStore.
//
// M5 parity fix: the spike's PRIMARY hand-onset trigger is velocity-based
// motion-settle detection (fixed a systematic ~200ms voice-early bias in
// real testing vs settle/stability-only anchoring) — MediaPipeFingerRecognizer
// now surfaces that directly via FingerRecognitionResult.motionOnset (wired
// through @morra/recognition's stepVelocityStateMachine, M2's pure logic,
// finally connected to a real frame loop). findStableCountRun is kept as
// the documented FALLBACK for exactly the case its own header comment
// describes: a hand already at a stable count with no preceding transition
// for velocity to have caught in the first place (e.g. a very slow,
// sub-threshold hand movement, or the hand already in position when
// sensing starts) — its {heldOver:true} case still explicitly SUPPRESSES
// firing (unchanged "held-over/reset semantics"); only a transition-
// preceded run can fire, and only when no velocity onset already handled
// that same settle (VELOCITY_SUPPRESS_WINDOW_MS below).
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
import type { MotionOnsetEvent } from "@morra/core";
import type { GameStore } from "../game/gameStore.js";
import { SYNC_POST_MS, SYNC_PRE_MS } from "../game/gameStore.js";

const SETTLE_MIN_RUN = 4; // consecutive identical-count frames required to call a hand "settled" (fallback path only)
const STABLE_FRAME_WINDOW = 24; // rolling buffer size fed to findStableCountRun (fallback path only)
const VELOCITY_SUPPRESS_WINDOW_MS = 250; // suppress a fallback fire this soon after a real velocity onset — avoids double-firing for the same physical throw

export class SensorPipeline {
  private readonly finger: MediaPipeFingerRecognizer;
  private vosk: VoskCallRecognizer | null = null;
  private camera: CameraSource | null = null;
  private mic: MicGraph | null = null;
  private ring: Awaited<ReturnType<MicGraph["start"]>> | null = null;
  private frames: CountFrame[] = [];
  private lastCount: number | null = null;
  private lastVelocityOnsetAtMs: number | null = null;
  private running = false;
  private rafHandle: number | null = null;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(
    private readonly store: GameStore,
    private readonly audio: AudioContextManager,
    private readonly voskModelUrl: string | null
  ) {
    const s = store.getSnapshot().settings;
    this.finger = new MediaPipeFingerRecognizer({ velocityConfig: { highV: s.highV, lowV: s.lowV, settleMs: s.settleMs } });
  }

  async start(videoEl: HTMLVideoElement): Promise<void> {
    await this.audio.resume();

    const initResult = await this.finger.init();
    void initResult; // mode/delegate available for diagnostics if a future settings screen wants them

    // Settings panel's HIGH_V/LOW_V/settle-ms sliders push through live —
    // no restart needed (MediaPipeFingerRecognizer.setVelocityConfig only
    // swaps the thresholds compared going forward, mid-state-machine-phase
    // included).
    let lastConfig = this.store.getSnapshot().settings;
    this.unsubscribeSettings = this.store.subscribe(() => {
      const s = this.store.getSnapshot().settings;
      if (s.highV !== lastConfig.highV || s.lowV !== lastConfig.lowV || s.settleMs !== lastConfig.settleMs) {
        this.finger.setVelocityConfig({ highV: s.highV, lowV: s.lowV, settleMs: s.settleMs });
        lastConfig = s;
      }
    });

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
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
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
        this.onFrame(count, result.capturedAtMs, result.motionOnset);
      } catch {
        // a single bad frame is never fatal — keep pumping
      }
      if (typeof requestAnimationFrame === "function") {
        this.rafHandle = requestAnimationFrame(() => void step());
      }
    };
    void step();
  }

  private onFrame(count: number | null, capturedAtMs: number, motionOnset: MotionOnsetEvent | null): void {
    this.store.updateReadyPillFromFrame(count);

    // PRIMARY: velocity-based motion onset. Anchor on motionStartPerfTime
    // when available (the spike's step-10 finding — a throw's shout starts
    // with the swing, not the settle ~250-300ms later), falling back to
    // settlePerfTime exactly as spikes/s03-beat.html's onSyncHandOnset
    // itself does when motionStartPerfTime is the (practically
    // unreachable) null case documented on VelocityOnsetEvent.
    if (motionOnset) {
      const anchorTime = motionOnset.motionStartPerfTime ?? motionOnset.settlePerfTime;
      this.lastVelocityOnsetAtMs = capturedAtMs;
      this.frames = [];
      this.lastCount = count;
      const throwId = this.store.onHandOnset(count, anchorTime);
      void this.scheduleAudioAnalysis(anchorTime, throwId);
      return;
    }

    if (count == null) {
      this.frames = [];
      this.lastCount = null;
      return;
    }

    // FALLBACK: count-stability, for throws too slow to ever cross the
    // velocity state machine's HIGH_V threshold. findStableCountRun's own
    // {heldOver:true} case is a deliberate non-fire (a hand already at a
    // stable count when sensing opened, not a fresh throw) — unchanged.
    this.frames = [...this.frames, { t: capturedAtMs, count }].slice(-STABLE_FRAME_WINDOW);
    const run = findStableCountRun(this.frames, SETTLE_MIN_RUN);
    const recentlyHandledByVelocity = this.lastVelocityOnsetAtMs != null && capturedAtMs - this.lastVelocityOnsetAtMs < VELOCITY_SUPPRESS_WINDOW_MS;
    if (run && !run.heldOver && !recentlyHandledByVelocity) {
      this.lastCount = count;
      this.frames = [];
      const throwId = this.store.onHandOnset(count, run.t);
      void this.scheduleAudioAnalysis(run.t, throwId);
    }
  }

  // CRITICAL FIX (real-session bug — see gameStore.ts's ThrowEventState.id
  // comment): throwId is the id onHandOnset returned for THIS specific
  // throw, at the moment it was created — threaded through this whole async
  // chain so the eventual onAudioWindowResult/onWordResult calls always
  // land against the throw they were actually scheduled for, never
  // whatever throw happens to be current ~700ms+ later when they resolve
  // (e.g. because the player's hand naturally moved on in the meantime).
  private async scheduleAudioAnalysis(handOnsetPerfTime: number, throwId: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, SYNC_POST_MS));
    if (!this.ring) return;
    const anchorCtxTime = this.audio.toContextTime(handOnsetPerfTime);
    if (anchorCtxTime == null) {
      this.store.onAudioWindowResult(null, throwId);
      this.store.onWordResult(null, throwId);
      return;
    }
    const clampFloorCtxTime = this.store.getSnapshot().lastRoundAudioEndCtxTime;
    const clamp = clampWindowStart(anchorCtxTime, SYNC_PRE_MS, clampFloorCtxTime);
    const extraction = await this.ring.requestExtract(anchorCtxTime, clamp.clampedPreMs, SYNC_POST_MS + 200);
    const exclusions = this.store.getSnapshot().rivalClipPlaybacks;
    const { samples } = blankExclusionRegions(extraction.samples, extraction.sampleRate, extraction.windowStartCtxTime, extraction.windowEndCtxTime, exclusions);
    const onset = findEnergyOnsetInBuffer(samples, extraction.sampleRate, { vadMult: this.store.getSnapshot().settings.vadMult });
    const voiceOnsetPerfTime = onset ? this.audio.toPerformanceTime(extraction.windowStartCtxTime + onset.onsetMs / 1000) : null;
    this.store.onAudioWindowResult(voiceOnsetPerfTime, throwId);

    if (this.vosk) {
      try {
        const rec = await this.vosk.recognizeWindow(samples, extraction.sampleRate, performance.now());
        const word = rec.hypotheses[0]?.value ?? null;
        this.store.onWordResult(word, throwId);
      } catch {
        this.store.onWordResult(null, throwId);
      }
    }
  }
}
