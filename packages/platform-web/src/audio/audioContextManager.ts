// audioContextManager.ts — the single AudioContext owner (M3 dispatch item
// 1). This is NEW platform-web architecture, not a spike port: the spike
// creates its one `ctx` eagerly at module load and never suspends/resumes
// around visibility changes (only its log-flush timer reacts to
// visibilitychange) — see spikes/s03-beat.html:1155. Real apps shouldn't
// assume every page load can create+resume an AudioContext for free
// (autoplay policy requires resume() from inside a real user-gesture
// handler), so this class makes context creation lazy and exposes an
// explicit resume() for callers to invoke from a click/tap listener. Clock
// mapping itself (getClockMapping/toPerformanceTime/toContextTime) IS the
// spike's proven logic — delegated to ClockTracker (clockTracker.ts), which
// is the direct port.
import { ClockTracker, type DriftSample } from "./clockTracker.js";
import type { ClockSample } from "./clockMapping.js";

export interface AudioContextManagerOptions {
  /** Overridable for tests/non-standard environments; defaults to
   * `new (window.AudioContext || window.webkitAudioContext)()`. */
  audioContextFactory?: () => AudioContext;
  /** Re-arm the clock baseline when the tab becomes visible again (a stale
   * pre-background sample no longer reflects the real offset). Default true. */
  autoRemapOnVisible?: boolean;
}

export class AudioContextManager {
  private ctx: AudioContext | null = null;
  private tracker: ClockTracker | null = null;
  private readonly audioContextFactory: () => AudioContext;
  private readonly autoRemapOnVisible: boolean;
  private visibilityHandler: (() => void) | null = null;

  constructor(options: AudioContextManagerOptions = {}) {
    this.audioContextFactory =
      options.audioContextFactory ??
      (() => {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        return new AC();
      });
    this.autoRemapOnVisible = options.autoRemapOnVisible ?? true;
  }

  /** Lazily creates and returns the single owned AudioContext. Creating a
   * context doesn't require a user gesture in current browsers, but
   * RESUMING a suspended one does — use resume() from inside a real
   * gesture handler rather than relying on this getter alone. */
  get context(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.audioContextFactory();
      this.tracker = new ClockTracker(this.ctx);
      if (this.autoRemapOnVisible && typeof document !== "undefined") {
        this.visibilityHandler = () => {
          if (document.visibilityState === "visible") this.tracker!.armBaseline();
        };
        document.addEventListener("visibilitychange", this.visibilityHandler);
      }
    }
    return this.ctx;
  }

  private get clock(): ClockTracker {
    void this.context; // ensures ctx/tracker are created
    return this.tracker!;
  }

  /** Must be called from within a real user-gesture event handler (browsers
   * enforce this at the API level — there's no way to detect it here). */
  async resume(): Promise<void> {
    await this.context.resume();
    this.clock.armBaseline();
  }

  getClockMapping(): ClockSample | null {
    return this.clock.refresh();
  }
  toPerformanceTime(contextTime: number): number | null {
    return this.clock.toPerformanceTime(contextTime);
  }
  toContextTime(performanceTimeMs: number): number | null {
    return this.clock.toContextTime(performanceTimeMs);
  }
  recordDriftSample(): DriftSample | null {
    return this.clock.recordDriftSample();
  }
  outputLatencyEstimate(): number {
    return this.clock.outputLatencyEstimate();
  }

  /** Schedules a buffer for playback at an explicit context-time, through a
   * dedicated per-call gain node. Ported pattern from spikes/s03-beat.html's
   * playRivalCall: a best-effort resume() first, and explicit ctx-time
   * start() (never the ambiguous start(0) shorthand) so callers can record
   * the real [start,end] window for later use (blanking/clamping in
   * @morra/recognition's voice pipeline). Returns the source node so
   * callers can stop() it or listen for "ended". */
  scheduleBuffer(atContextTime: number, buffer: AudioBuffer, gain = 1): AudioBufferSourceNode {
    const ctx = this.context;
    ctx.resume().catch(() => {});
    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    gainNode.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(Math.max(atContextTime, ctx.currentTime));
    return source;
  }

  dispose(): void {
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.tracker = null;
  }
}
