// onlineOnsetStep.ts — the sustained-energy onset state machine extracted
// from spikes/s03-beat.html's AudioWorklet processor (vadProcessorSrc's
// process() method). In the spike this logic is inlined into a
// self-contained Blob-URL worker script (AudioWorkletProcessors must ship
// as a single string — see the browser glue in vadWorkletSource.ts), so it
// was never independently testable there. This is the SAME per-block
// decision logic as a pure step function: one audio block's RMS in, the
// next state + an optional onset/click-suppressed event out.
//
// This live/streaming detector is COSMETIC-ONLY in the spike's design (it
// only drives the "SHOUT!" flash) — the AUTHORITATIVE onset comes from
// onset.ts's offline buffer analysis, run once per throw over the extracted
// window. Its defaults differ slightly from the offline detector's
// (sustainMs 100 vs 60, no floorCap) because it's tuned for continuous
// real-time firing rather than a single retrospective buffer scan —
// preserved exactly as the spike had them.

export interface OnlineOnsetConfig {
  mult: number;
  floorMin: number;
  sustainMs: number;
  clickBandMs: number;
}

export const DEFAULT_ONLINE_ONSET_CONFIG: OnlineOnsetConfig = { mult: 6, floorMin: 0.015, sustainMs: 100, clickBandMs: 60 };

export interface OnlineOnsetState {
  noiseFloor: number;
  above: boolean;
  aboveSinceTime: number | null;
  onsetHandled: boolean;
}

export const INITIAL_ONLINE_ONSET_STATE: OnlineOnsetState = { noiseFloor: 0.001, above: false, aboveSinceTime: null, onsetHandled: false };

export type OnlineOnsetEvent =
  | { type: "onset"; t: number; rms: number }
  | { type: "click-suppressed"; t: number; rms: number }
  | null;

export interface OnlineOnsetStepResult {
  state: OnlineOnsetState;
  event: OnlineOnsetEvent;
  /** Exposed so a caller can mirror the worklet's "level" telemetry message. */
  threshold: number;
}

/** rms: this block's root-mean-square energy. blockStartCtxTime: the
 * AudioContext-time this block began (the worklet's own `currentTime`).
 * clickTimes: recent/near-future scheduled click ctxTimes to suppress
 * against — the caller's own known-audio schedule, same idea as
 * blanking.ts's exclusion list but for the STREAMING detector. */
export function stepOnlineOnsetDetector(
  state: OnlineOnsetState,
  rms: number,
  blockStartCtxTime: number,
  clickTimes: readonly number[],
  config: OnlineOnsetConfig = DEFAULT_ONLINE_ONSET_CONFIG
): OnlineOnsetStepResult {
  const { mult, floorMin, sustainMs, clickBandMs } = config;
  let noiseFloor = state.noiseFloor;
  if (!state.above) noiseFloor = noiseFloor * 0.995 + rms * 0.005;
  const threshold = Math.max(noiseFloor * mult, floorMin);
  const wasAbove = state.above;
  const above = rms > threshold;

  let aboveSinceTime = state.aboveSinceTime;
  let onsetHandled = state.onsetHandled;
  let event: OnlineOnsetEvent = null;

  if (above && !wasAbove) {
    aboveSinceTime = blockStartCtxTime;
    onsetHandled = false;
  } else if (!above) {
    aboveSinceTime = null;
    onsetHandled = false;
  } else if (above && aboveSinceTime != null && !onsetHandled && (blockStartCtxTime - aboveSinceTime) * 1000 >= sustainMs) {
    onsetHandled = true;
    const nearClick = clickTimes.some((ct) => Math.abs(aboveSinceTime! - ct) * 1000 <= clickBandMs);
    event = nearClick ? { type: "click-suppressed", t: aboveSinceTime, rms } : { type: "onset", t: aboveSinceTime, rms };
  }

  return { state: { noiseFloor, above, aboveSinceTime, onsetHandled }, event, threshold };
}
