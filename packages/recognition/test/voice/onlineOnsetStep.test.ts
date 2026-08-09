import { describe, expect, it } from "vitest";
import { DEFAULT_ONLINE_ONSET_CONFIG, INITIAL_ONLINE_ONSET_STATE, stepOnlineOnsetDetector, type OnlineOnsetState } from "../../src/voice/onlineOnsetStep.js";

const cfg = DEFAULT_ONLINE_ONSET_CONFIG; // mult=6, floorMin=0.015, sustainMs=100, clickBandMs=60

describe("onlineOnsetStep: silence stays quiet", () => {
  it("silence never fires, floor adapts toward the silent level", () => {
    let state = INITIAL_ONLINE_ONSET_STATE;
    for (let i = 0; i < 20; i++) {
      const r = stepOnlineOnsetDetector(state, 0, i * 0.008, [], cfg);
      expect(r.event).toBeNull();
      state = r.state;
    }
    expect(state.above).toBe(false);
  });
});

describe("onlineOnsetStep: sustained energy fires an onset", () => {
  it("fires once the above-threshold run has lasted sustainMs, at aboveSinceTime", () => {
    let state: OnlineOnsetState = INITIAL_ONLINE_ONSET_STATE;
    // block at t=1.000 crosses above threshold
    let r = stepOnlineOnsetDetector(state, 0.5, 1.0, [], cfg);
    expect(r.event).toBeNull();
    expect(r.state.above).toBe(true);
    expect(r.state.aboveSinceTime).toBe(1.0);
    state = r.state;
    // still under sustainMs (100ms) at +50ms
    r = stepOnlineOnsetDetector(state, 0.5, 1.05, [], cfg);
    expect(r.event).toBeNull();
    state = r.state;
    // now past sustainMs at +100ms
    r = stepOnlineOnsetDetector(state, 0.5, 1.1, [], cfg);
    expect(r.event).toEqual({ type: "onset", t: 1.0, rms: 0.5 });
  });

  it("does not re-fire on the same sustained run once handled", () => {
    const state: OnlineOnsetState = { noiseFloor: 0.001, above: true, aboveSinceTime: 1.0, onsetHandled: true };
    const r = stepOnlineOnsetDetector(state, 0.5, 1.2, [], cfg);
    expect(r.event).toBeNull();
  });

  it("dropping below threshold resets the run — a later re-crossing fires fresh", () => {
    const state: OnlineOnsetState = { noiseFloor: 0.001, above: true, aboveSinceTime: 1.0, onsetHandled: true };
    const r = stepOnlineOnsetDetector(state, 0, 1.15, [], cfg); // drops silent
    expect(r.state.above).toBe(false);
    expect(r.state.aboveSinceTime).toBeNull();
    expect(r.state.onsetHandled).toBe(false);
  });
});

describe("onlineOnsetStep: click-band suppression", () => {
  it("suppresses (as click-suppressed) an onset landing within clickBandMs of a scheduled click", () => {
    const state: OnlineOnsetState = { noiseFloor: 0.001, above: true, aboveSinceTime: 1.0, onsetHandled: false };
    const r = stepOnlineOnsetDetector(state, 0.5, 1.1, [1.02], cfg); // click at ctxTime 1.02, within 60ms of aboveSinceTime 1.0
    expect(r.event).toEqual({ type: "click-suppressed", t: 1.0, rms: 0.5 });
  });
  it("does NOT suppress an onset far from any scheduled click", () => {
    const state: OnlineOnsetState = { noiseFloor: 0.001, above: true, aboveSinceTime: 1.0, onsetHandled: false };
    const r = stepOnlineOnsetDetector(state, 0.5, 1.1, [5.0], cfg); // click far away in time
    expect(r.event).toEqual({ type: "onset", t: 1.0, rms: 0.5 });
  });
});
