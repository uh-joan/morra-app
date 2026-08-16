// vadWorkletSource.ts — ported verbatim from spikes/s03-beat.html's
// vadProcessorSrc: a ~1.5s ring-buffer AudioWorkletProcessor with online
// sustained-energy onset detection (see onlineOnsetStep.ts for that same
// logic pulled out as a pure step function — this file is the ACTUAL
// worklet source, which must ship as a single self-contained string since
// AudioWorkletProcessors are Blob-URL-loaded, not importable modules) plus
// a ring-extraction protocol ("extract" message) so the main thread can
// pull a raw audio window out of the SAME ring buffer the onset detector
// already scans — no separate recording path. The monotonic
// `totalWritten` counter (vs. the wrapped `ringPos` write cursor) is what
// fixes the ring-wrap bug documented in the spike (two extraction markers
// straddling a wrap boundary producing a non-monotonic index and an
// extraction window with endIdx <= startIdx).

export function buildVadWorkletSource(): string {
  return `
  class VadProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.ringSize = Math.round(sampleRate * 1.5);
      this.ring = new Float32Array(this.ringSize);
      this.ringPos = 0;       // wrapped write cursor, only used to index into "ring"
      this.totalWritten = 0;  // MONOTONIC sample count, never wraps
      this.noiseFloor = 0.001;
      this.above = false;
      this.aboveSinceTime = null;   // ctxTime the current above-threshold run started
      this.onsetHandled = false;    // debounced/suppressed already for this run?
      this.sustainMs = 100;         // require sustained energy before firing an onset
      this.clickBandMs = 60;        // hard-suppress onsets within this many ms of a scheduled click
      this.clickTimes = [];         // recent/near-future scheduled click ctxTimes
      this.frameCount = 0;
      this.mult = 6;
      this.floorMin = 0.015; // live-VAD floor; tunable for noisy venues (iteration-2)
      this.markers = []; // {ctxTime, writeIndex} at the start of each render quantum — writeIndex is the UNWRAPPED totalWritten count
      this.maxMarkers = Math.ceil(this.ringSize / 64) + 16;
      this.port.onmessage = (e) => {
        if (e.data.type === "tune") {
          this.mult = e.data.mult;
          if (typeof e.data.floorMin === "number" && e.data.floorMin > 0) this.floorMin = e.data.floorMin;
        }
        else if (e.data.type === "extract") this.handleExtract(e.data);
        else if (e.data.type === "click") {
          this.clickTimes.push(e.data.ctxTime);
          if (this.clickTimes.length > 32) this.clickTimes.shift();
        }
      };
    }
    handleExtract({ requestId, centerCtxTime, preMs, postMs }) {
      const startTime = centerCtxTime - preMs / 1000;
      const endTime = centerCtxTime + postMs / 1000;
      const coverageOk = this.markers.length > 0 && this.markers[0].ctxTime <= startTime;
      const markerRangeCtxTime = this.markers.length
        ? { oldest: this.markers[0].ctxTime, newest: this.markers[this.markers.length - 1].ctxTime }
        : { oldest: null, newest: null };
      const idxFor = (t) => {
        if (!this.markers.length) return null;
        let best = this.markers[0];
        for (const mk of this.markers) { if (mk.ctxTime <= t) best = mk; else break; }
        return Math.round(best.writeIndex + (t - best.ctxTime) * sampleRate);
      };
      const startIdxRaw = idxFor(startTime);
      const endIdxRaw = idxFor(endTime);
      const base = {
        requestId, sampleRate, windowStartCtxTime: startTime, windowEndCtxTime: endTime,
        coverageOk, markerRangeCtxTime, workletCurrentTimeAtRequest: currentTime,
      };
      if (startIdxRaw == null || endIdxRaw == null || endIdxRaw <= startIdxRaw) {
        this.port.postMessage({ type: "extracted", ...base, samples: new Float32Array(0), requestedSamples: 0, clamped: false });
        return;
      }
      const oldestValidIdx = this.totalWritten - this.ringSize;
      const clampedStartIdx = Math.max(startIdxRaw, oldestValidIdx);
      const requestedSamples = endIdxRaw - startIdxRaw;
      const n = Math.max(0, Math.min(endIdxRaw - clampedStartIdx, this.ringSize));
      const clamped = n < requestedSamples;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const idx = ((clampedStartIdx + i) % this.ringSize + this.ringSize) % this.ringSize;
        out[i] = this.ring[idx];
      }
      this.port.postMessage({ type: "extracted", ...base, samples: out, requestedSamples, clamped });
    }
    process(inputs) {
      const input = inputs[0];
      if (input && input[0] && input[0].length) {
        const ch = input[0];
        this.markers.push({ ctxTime: currentTime, writeIndex: this.totalWritten });
        if (this.markers.length > this.maxMarkers) this.markers.shift();
        let sumSq = 0;
        for (let i = 0; i < ch.length; i++) {
          const s = ch[i];
          this.ring[this.ringPos] = s;
          this.ringPos = (this.ringPos + 1) % this.ringSize;
          this.totalWritten++;
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / ch.length);
        if (!this.above) this.noiseFloor = this.noiseFloor * 0.995 + rms * 0.005;
        const threshold = Math.max(this.noiseFloor * this.mult, this.floorMin);
        const wasAbove = this.above;
        this.above = rms > threshold;
        const blockStartTime = currentTime;
        if (this.above && !wasAbove) {
          this.aboveSinceTime = blockStartTime;
          this.onsetHandled = false;
        } else if (!this.above) {
          this.aboveSinceTime = null;
          this.onsetHandled = false;
        } else if (this.above && this.aboveSinceTime != null && !this.onsetHandled &&
                   (blockStartTime - this.aboveSinceTime) * 1000 >= this.sustainMs) {
          this.onsetHandled = true;
          const nearClick = this.clickTimes.some((ct) => Math.abs(this.aboveSinceTime - ct) * 1000 <= this.clickBandMs);
          if (nearClick) {
            this.port.postMessage({ type: "click-suppressed", t: this.aboveSinceTime, rms });
          } else {
            this.port.postMessage({ type: "onset", t: this.aboveSinceTime, rms });
          }
        }
        this.frameCount++;
        if (this.frameCount % 4 === 0) {
          this.port.postMessage({ type: "level", t: blockStartTime, rms, threshold });
        }
      }
      return true;
    }
  }
  registerProcessor("vad-processor", VadProcessor);
`;
}
