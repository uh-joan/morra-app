// audioClock.ts — ports spikes/s03-beat.html L1150–1221 (the single shared
// AudioContext + ClockMap + outputLatencyEstimate + the clock chip slice of
// refreshDiagnostics; the dx* diagnostics panel belonged to the dropped
// harness). ClockMap itself is @morra/platform-web's ClockTracker (a
// near-verbatim port of the same class, unit-tested there).
//
// FINDING (A) LIVES HERE: the context is created at module load (suspended
// under Chrome's autoplay policy, exactly like the spike's) and is ONLY ever
// resumed via ensureAudioResumed(), which the Start Camera / Start Mic
// button handlers call from inside a real user gesture. Nothing in this app
// resumes it outside a gesture.

import { ClockTracker } from "@morra/platform-web";
import { el } from "./dom.js";
import { setChip } from "./status.js";

type AC = typeof AudioContext;
const AudioContextCtor: AC =
  window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;

export const ctx: AudioContext = new AudioContextCtor();
export const clockMap = new ClockTracker(ctx);

export async function ensureAudioResumed(): Promise<void> {
  if (ctx.state !== "running") await ctx.resume();
  clockMap.armBaseline();
  refreshClockChip();
}

export function refreshClockChip(): void {
  if (ctx.state !== "running") {
    setChip(el.chipClock, "unsampled", "dim");
    return;
  }
  clockMap.refresh();
  const outSupported = typeof ctx.outputLatency === "number";
  if (!clockMap.currentSample) setChip(el.chipClock, "unsampled", "dim");
  else setChip(el.chipClock, outSupported ? "outputLatency ok" : "baseLatency fallback", outSupported ? "ok" : "warn");
}

export function installClockUpkeep(): void {
  // Keep the ctx↔perf sample fresh and the chip honest; re-arm the drift
  // baseline whenever the tab comes back (a stale sample from before a
  // suspend/background period no longer reflects the real clock offset).
  setInterval(refreshClockChip, 500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx.state === "running") {
      clockMap.armBaseline();
      refreshClockChip();
    }
  });
}
