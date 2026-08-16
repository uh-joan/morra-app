// micGraph.ts — mic device acquisition + @morra/recognition's VadRingBuffer
// wiring, ported from spikes/s03-beat.html's startMic (the getUserMedia
// call constraints — echoCancellation/noiseSuppression/autoGainControl all
// off, so the raw signal reaches the VAD/onset detectors unprocessed — are
// preserved exactly). Unlike the spike, ring-buffer construction itself
// lives in @morra/recognition (VadRingBuffer), not duplicated here —
// platform-web's job is only "acquire the device, wire it onto the shared
// AudioContext, hand back the ring buffer".
import { VadRingBuffer } from "@morra/recognition";

export const DEFAULT_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export class MicGraph {
  private stream: MediaStream | null = null;
  private ring: VadRingBuffer | null = null;

  constructor(private readonly ctx: AudioContext) {}

  async start(constraints: MediaTrackConstraints = DEFAULT_MIC_CONSTRAINTS): Promise<VadRingBuffer> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.ring = new VadRingBuffer(this.ctx);
    await this.ring.init(source);
    return this.ring;
  }

  get ringBuffer(): VadRingBuffer | null {
    return this.ring;
  }

  /** What the browser ACTUALLY applied to the live audio track — the
   * requested constraints are advisory (a device or UA may silently ignore
   * noiseSuppression/echoCancellation), so any A/B over them must log this,
   * not the request. Null when no track is live. */
  get appliedSettings(): MediaTrackSettings | null {
    const track = this.stream?.getAudioTracks()[0];
    return track ? track.getSettings() : null;
  }

  stop(): void {
    this.ring?.dispose();
    this.ring = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
