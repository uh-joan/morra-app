// rivalVoicePlayer.ts — plays the rival's voice clip on every phase-1
// reveal (spikes/s03-beat.html's playRivalCall, generalized to
// @morra/platform-web's fetchClipSet/AudioContextManager.scheduleBuffer),
// and reports the REAL scheduled [start,end] ctx-time window back to
// gameStore.ts (registerClipPlayback) so the next throw's audio analysis
// can blank/clamp around it. A dedicated module rather than folded into
// sensorPipeline.ts — this is an audio-ASSET concern (clip buffers), not a
// sensor-recognition concern.
import { fetchClipSet, type AudioContextManager } from "@morra/platform-web";
import { NUMBER_TO_CATALAN_CALL } from "@morra/core";
import type { GameStore } from "../game/gameStore.js";

const RIVAL_VOICE_GAIN = 1.2; // matches the spike's RIVAL_VOICE_GAIN

export class RivalVoicePlayer {
  private buffers: Map<string, AudioBuffer> = new Map();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly store: GameStore,
    private readonly audio: AudioContextManager
  ) {}

  async load(clipBaseUrl: string): Promise<void> {
    const manifest: Record<string, string> = {};
    for (const word of Object.values(NUMBER_TO_CATALAN_CALL)) {
      manifest[word] = `${clipBaseUrl}/${word}_jordi.m4a`;
    }
    const { buffers } = await fetchClipSet(this.audio.context, manifest);
    this.buffers = buffers;
    this.unsubscribe = this.store.onPhase1Reveal((move) => this.play(move.call));
  }

  private play(call: number): void {
    const word = NUMBER_TO_CATALAN_CALL[call];
    const buffer = word ? this.buffers.get(word) : undefined;
    if (!buffer) return; // no clip loaded for this word — silent, text-only reveal stands (matches the spike's degrade behavior)
    const ctx = this.audio.context;
    const startCtxTime = ctx.currentTime;
    this.audio.scheduleBuffer(startCtxTime, buffer, RIVAL_VOICE_GAIN);
    this.store.registerClipPlayback(startCtxTime, startCtxTime + buffer.duration);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
