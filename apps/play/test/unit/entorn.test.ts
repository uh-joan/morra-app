// entorn.test.ts — iteration-2 Entorn preset: the pure decision logic
// (resolution, calibration math, suggestion rule, floor mapping, mic
// constraints). DOM wiring is exercised by the integration harness.
import { describe, expect, it } from "vitest";
import {
  computeAmbientFloor,
  demotePreWindowOnset,
  dspEnabledFor,
  liveFloorMinFor,
  micConstraintsFor,
  resolveDspMode,
  resolveEntorn,
  shouldSuggestSorollos,
  SOROLLOS_FALLBACK_FLOOR_MIN,
  SUGGEST_AMBIENT_THRESHOLD,
} from "../../src/entorn.js";

describe("entorn: resolveEntorn precedence", () => {
  it("defaults to tranquil (spike-verbatim world)", () => {
    expect(resolveEntorn(null, null)).toBe("tranquil");
  });
  it("stored value wins over the default", () => {
    expect(resolveEntorn("sorollos", null)).toBe("sorollos");
  });
  it("URL override wins over storage (field A/B testing)", () => {
    expect(resolveEntorn("sorollos", "tranquil")).toBe("tranquil");
    expect(resolveEntorn("tranquil", "sorollos")).toBe("sorollos");
  });
  it("garbage in either source is ignored", () => {
    expect(resolveEntorn("loud", "1")).toBe("tranquil");
  });
});

describe("entorn: computeAmbientFloor (25th-pct of live RMS)", () => {
  it("needs at least 10 samples to trust the estimate", () => {
    expect(computeAmbientFloor([0.02, 0.02])).toBeNull();
    expect(computeAmbientFloor([])).toBeNull();
  });
  it("reads a steady room floor", () => {
    expect(computeAmbientFloor(Array(40).fill(0.04))).toBeCloseTo(0.04, 6);
  });
  it("is robust to loud transients (claps/chatter) in the sample window", () => {
    const samples = [...Array(30).fill(0.03), ...Array(10).fill(0.6)];
    expect(computeAmbientFloor(samples)).toBeCloseTo(0.03, 6);
  });
});

describe("entorn: shouldSuggestSorollos", () => {
  it("suggests exactly when a tranquil player sits in a room whose floor alone clears the tranquil VAD floorMin (the field failure condition)", () => {
    expect(shouldSuggestSorollos("tranquil", SUGGEST_AMBIENT_THRESHOLD + 0.001)).toBe(true);
    expect(shouldSuggestSorollos("tranquil", SUGGEST_AMBIENT_THRESHOLD - 0.001)).toBe(false);
    expect(shouldSuggestSorollos("tranquil", null)).toBe(false);
  });
  it("never nags a player already in sorollós", () => {
    expect(shouldSuggestSorollos("sorollos", 0.2)).toBe(false);
  });
});

describe("entorn: liveFloorMinFor", () => {
  it("tranquil leaves the worklet at its spike-verbatim default (undefined = don't touch)", () => {
    expect(liveFloorMinFor("tranquil", null)).toBeUndefined();
    expect(liveFloorMinFor("tranquil", 0.08)).toBeUndefined();
  });
  it("sorollós before calibration uses the conservative fallback", () => {
    expect(liveFloorMinFor("sorollos", null)).toBe(SOROLLOS_FALLBACK_FLOOR_MIN);
  });
  it("sorollós after calibration rides the room: clamp(ambient*3, 0.015..0.12)", () => {
    expect(liveFloorMinFor("sorollos", 0.04)).toBeCloseTo(0.12, 6);
    expect(liveFloorMinFor("sorollos", 0.02)).toBeCloseTo(0.06, 6);
    expect(liveFloorMinFor("sorollos", 0.001)).toBe(0.015);
    expect(liveFloorMinFor("sorollos", 0.5)).toBe(0.12);
  });
});

describe("entorn: micConstraintsFor", () => {
  // 2026-08-21: echoCancellation is DECOUPLED from the noiseSuppression bundle
  // and left ON in every preset — it's the browser AEC that cancels the
  // rival's speaker bleed (speakers-vs-headphones). noiseSuppression still
  // follows the preset; AGC always off.
  it("tranquil = noiseSuppression off, but echoCancellation ON (speaker-bleed fix)", () => {
    expect(micConstraintsFor("tranquil")).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
  it("sorollós adds noiseSuppression on top; echoCancellation already on; NEVER AGC (it would fight the onset detector's adaptive floor)", () => {
    expect(micConstraintsFor("sorollos")).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
  });
});

describe("entorn: DSP override (iteration-2 fix #4 — A/B the mic constraints)", () => {
  it("defaults to auto, so the preset alone decides", () => {
    expect(resolveDspMode(null, null)).toBe("auto");
    expect(dspEnabledFor("tranquil", "auto")).toBe(false);
    expect(dspEnabledFor("sorollos", "auto")).toBe(true);
  });
  it("?dsp=1 / ?dsp=0 pin the DSP against the preset in BOTH directions", () => {
    expect(dspEnabledFor("tranquil", resolveDspMode(null, "1"))).toBe(true);
    expect(dspEnabledFor("sorollos", resolveDspMode(null, "0"))).toBe(false);
  });
  it("the URL beats the stored value, and junk falls back to the stored one", () => {
    expect(resolveDspMode("off", "on")).toBe("on");
    expect(resolveDspMode("off", "banana")).toBe("off");
    expect(resolveDspMode("banana", null)).toBe("auto");
  });
  it("the DSP override moves only noiseSuppression now (echoCancellation is always on; AGC always off)", () => {
    expect(micConstraintsFor("tranquil", "on")).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
    expect(micConstraintsFor("sorollos", "off")).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
});

describe("entorn: demotePreWindowOnset (phase-3 verdict softening)", () => {
  it("sorollós demotes a pinned (preWindow) onset to no-voice-evidence", () => {
    expect(demotePreWindowOnset("sorollos", true)).toBe(true);
  });
  it("sorollós leaves real in-window onsets alone", () => {
    expect(demotePreWindowOnset("sorollos", false)).toBe(false);
  });
  it("tranquil NEVER demotes — strict spike semantics preserved (parity world)", () => {
    expect(demotePreWindowOnset("tranquil", true)).toBe(false);
    expect(demotePreWindowOnset("tranquil", false)).toBe(false);
  });
});
