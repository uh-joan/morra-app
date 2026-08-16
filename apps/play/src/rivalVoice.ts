// rivalVoice.ts — ports spikes/s03-beat.html L3101–3173: pre-generated
// rival voice clips, fetched + decoded into AudioBuffers on the page's
// EXISTING AudioContext (no second context) as soon as game mode goes live;
// playback is a zero-latency buffer-source start at an explicit ctx-time so
// the real [start,end] window is recorded for later blanking/clamping. A
// clip that fails to load/decode is logged but never surfaces as a red
// error card — voice here is flavor, the text reveal is authoritative.

import { NUMBER_TO_CATALAN_CALL } from "@morra/core";
import { ctx } from "./audioClock.js";
import { RIVAL_VOICE_DIR, RIVAL_VOICE_GAIN, RIVAL_VOICE_SUFFIX, RIVAL_VOICE_WORDS } from "./config.js";
import { logEvent } from "./telemetry.js";
import { registerClipPlayback } from "./rivalAudioLog.js";

const rivalVoiceBuffers: Record<string, AudioBuffer> = {};
export const rivalVoiceLoadStatus: Record<string, "pending" | "loaded" | "failed"> = {};
let rivalVoicePreloadStarted = false;
let rivalVoiceGainNode: GainNode | null = null;

function getRivalVoiceGainNode(): GainNode {
  if (!rivalVoiceGainNode) {
    rivalVoiceGainNode = ctx.createGain();
    rivalVoiceGainNode.gain.value = RIVAL_VOICE_GAIN;
    rivalVoiceGainNode.connect(ctx.destination);
  }
  return rivalVoiceGainNode;
}

export async function preloadRivalVoiceClips(): Promise<void> {
  if (rivalVoicePreloadStarted) return;
  rivalVoicePreloadStarted = true;
  await Promise.all(
    RIVAL_VOICE_WORDS.map(async (word) => {
      rivalVoiceLoadStatus[word] = "pending";
      const url = `${RIVAL_VOICE_DIR}/${word}${RIVAL_VOICE_SUFFIX}.m4a`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        rivalVoiceBuffers[word] = audioBuf;
        rivalVoiceLoadStatus[word] = "loaded";
      } catch (err) {
        rivalVoiceLoadStatus[word] = "failed";
        console.warn(`rival voice clip failed to load (${url}):`, err);
      }
    })
  );
}

export function playRivalCall(
  call: number,
  startAtCtxTime?: number
): { startCtxTime: number; endCtxTime: number } | null {
  const word = NUMBER_TO_CATALAN_CALL[call];
  if (!word) return null;
  const buffer = rivalVoiceBuffers[word];
  if (!buffer) {
    console.warn(`rival voice: no clip loaded for "${word}" (call=${call}) — silent, text-only reveal stands`);
    logEvent("clip_playback_failed", { word, call, reason: "no clip loaded" });
    return null;
  }
  try {
    void ctx.resume().catch(() => {});
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(getRivalVoiceGainNode());
    // Phase C.3/C.4: explicit ctx-time scheduling (equivalent to start(0)'s
    // "now", but lets us record the real [start,end] window for later
    // blanking/clamping) instead of the ambiguous start(0) shorthand.
    // ?veudelay=1: an explicit future start defers the clip past the
    // capture window's close (never earlier than now).
    const startCtxTime = Math.max(ctx.currentTime, startAtCtxTime ?? ctx.currentTime);
    source.start(startCtxTime);
    const endCtxTime = startCtxTime + buffer.duration;
    registerClipPlayback({ word, call, startCtxTime, endCtxTime });
    logEvent("clip_playback", { word, call, startCtxTime, endCtxTime });
    return { startCtxTime, endCtxTime };
  } catch (err) {
    console.warn(`rival voice: playback failed for "${word}":`, err);
    logEvent("clip_playback_failed", { word, call, reason: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
