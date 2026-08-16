// vadRingBuffer.ts — owns the AudioWorkletNode built from
// vadWorkletSource.ts and exposes its ring-extraction protocol as a typed
// Promise-based API, ported from spikes/s03-beat.html's requestRingExtract
// + the vadNode.port.onmessage wiring around it. This is the seam that
// feeds real captured audio into onset.ts/blanking.ts/windowClamp.ts's pure
// functions — those never touch the worklet directly.
import { buildVadWorkletSource } from "./vadWorkletSource.js";

export interface RingExtraction {
  samples: Float32Array;
  sampleRate: number;
  windowStartCtxTime: number;
  windowEndCtxTime: number;
  requestedSamples: number;
  coverageOk: boolean;
  clamped: boolean;
  markerRangeCtxTime: { oldest: number | null; newest: number | null };
  workletCurrentTimeAtRequest: number;
  /** ctx.currentTime captured on the MAIN thread at the moment the request
   * was sent — compared against workletCurrentTimeAtRequest to prove the
   * mic worklet and the rest of the audio pipeline share one clock domain
   * (there is only one AudioContext). */
  ctxCurrentTimeAtRequest: number;
}

type OnsetListener = (t: number, rms: number) => void;
type LevelListener = (t: number, rms: number, threshold: number) => void;

const EXTRACT_TIMEOUT_MS = 1500;

export class VadRingBuffer {
  private node: AudioWorkletNode | null = null;
  private reqCounter = 0;
  private readonly pending = new Map<
    number,
    { resolve: (r: RingExtraction) => void; reject: (e: Error) => void; ctxCurrentTimeAtRequest: number }
  >();
  private onOnsetListener: OnsetListener | null = null;
  private onClickSuppressedListener: OnsetListener | null = null;
  private onLevelListener: LevelListener | null = null;

  constructor(private readonly ctx: AudioContext) {}

  async init(source: AudioNode): Promise<void> {
    const blobUrl = URL.createObjectURL(new Blob([buildVadWorkletSource()], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(blobUrl);
    this.node = new AudioWorkletNode(this.ctx, "vad-processor");
    this.node.port.onmessage = (e: MessageEvent) => this.handleMessage(e.data);
    source.connect(this.node);
  }

  private handleMessage(d: Record<string, unknown>): void {
    if (d.type === "onset") this.onOnsetListener?.(d.t as number, d.rms as number);
    else if (d.type === "click-suppressed") this.onClickSuppressedListener?.(d.t as number, d.rms as number);
    else if (d.type === "level") this.onLevelListener?.(d.t as number, d.rms as number, d.threshold as number);
    else if (d.type === "extracted") {
      const requestId = d.requestId as number;
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      pending.resolve({
        samples: d.samples as Float32Array,
        sampleRate: d.sampleRate as number,
        windowStartCtxTime: d.windowStartCtxTime as number,
        windowEndCtxTime: d.windowEndCtxTime as number,
        requestedSamples: d.requestedSamples as number,
        coverageOk: d.coverageOk as boolean,
        clamped: d.clamped as boolean,
        markerRangeCtxTime: d.markerRangeCtxTime as { oldest: number | null; newest: number | null },
        workletCurrentTimeAtRequest: d.workletCurrentTimeAtRequest as number,
        ctxCurrentTimeAtRequest: pending.ctxCurrentTimeAtRequest,
      });
    }
  }

  requestExtract(centerCtxTime: number, preMs: number, postMs: number): Promise<RingExtraction> {
    return new Promise((resolve, reject) => {
      if (!this.node) { reject(new Error("VadRingBuffer.requestExtract called before init()")); return; }
      const requestId = ++this.reqCounter;
      const ctxCurrentTimeAtRequest = this.ctx.currentTime;
      this.pending.set(requestId, { resolve, reject, ctxCurrentTimeAtRequest });
      this.node.port.postMessage({ type: "extract", requestId, centerCtxTime, preMs, postMs });
      setTimeout(() => {
        if (this.pending.has(requestId)) { this.pending.delete(requestId); reject(new Error("ring extract timed out")); }
      }, EXTRACT_TIMEOUT_MS);
    });
  }

  tune(mult: number, floorMin?: number): void {
    // floorMin (optional): raises the live detector's minimum threshold in
    // noisy venues (iteration-2 Entorn preset). Omitted -> worklet keeps
    // its current floor (0.015 default = spike-verbatim).
    this.node?.port.postMessage({ type: "tune", mult, ...(floorMin != null ? { floorMin } : {}) });
  }

  /** Tells the worklet a scheduled/known audio event's real ctx-time, so
   * its online (streaming) onset detector can suppress a false onset near
   * it — the same idea as blanking.ts's exclusion list, but for the
   * live/cosmetic detector rather than the offline authoritative one. */
  notifyScheduledClick(ctxTime: number): void {
    this.node?.port.postMessage({ type: "click", ctxTime });
  }

  onOnset(listener: OnsetListener): void {
    this.onOnsetListener = listener;
  }
  onClickSuppressed(listener: OnsetListener): void {
    this.onClickSuppressedListener = listener;
  }
  onLevel(listener: LevelListener): void {
    this.onLevelListener = listener;
  }

  dispose(): void {
    this.node?.disconnect();
    this.node = null;
    this.pending.clear();
  }
}
