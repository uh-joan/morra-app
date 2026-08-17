import { describe, expect, it } from "vitest";
import { judgeCalibrationThrow, SHOUT_OVER_FLOOR, VERDICT_COPY } from "../../src/calibration/judge.js";
import { LIVE_VAD_FLOOR_MIN } from "../../src/calibration/fit.js";

// The first field run advanced on ANY onset (returns to fist, phantoms) and
// on silent throws. A prompt is satisfied by a real throw WITH a shout.
describe("calibration judge: what counts as the prompted throw", () => {
  const base = { outcome: "hand-only", fingerCount: 3, voiceOnsetPerfTime: null as number | null, shoutPeak: null as number | null, ambientFloor: 0.01 as number | null };

  it("the return to fist (reset) never counts — the bug the field run hit", () => {
    expect(judgeCalibrationThrow({ ...base, outcome: "reset", fingerCount: 1 })).toEqual({ accept: false, reason: "reset" });
    expect(judgeCalibrationThrow({ ...base, outcome: "reset", fingerCount: 0, voiceOnsetPerfTime: 100 })).toEqual({ accept: false, reason: "reset" });
  });
  it("a settle with no fingers never counts", () => {
    expect(judgeCalibrationThrow({ ...base, fingerCount: 0, voiceOnsetPerfTime: 100 })).toEqual({ accept: false, reason: "no-fingers" });
    expect(judgeCalibrationThrow({ ...base, fingerCount: null, voiceOnsetPerfTime: 100 })).toEqual({ accept: false, reason: "no-fingers" });
  });
  it("a silent throw does NOT count — the shout is required, not just measured", () => {
    expect(judgeCalibrationThrow({ ...base })).toEqual({ accept: false, reason: "no-voice" });
    expect(judgeCalibrationThrow({ ...base, shoutPeak: 0.02 })).toEqual({ accept: false, reason: "no-voice" }); // 2× floor: not a shout
  });
  it("a throw with a detected voice onset counts, whatever the sync outcome", () => {
    for (const outcome of ["synced", "voice-early", "voice-late"]) {
      expect(judgeCalibrationThrow({ ...base, outcome, voiceOnsetPerfTime: 100 })).toEqual({ accept: true, voice: "onset" });
    }
  });
  it(`without an onset, a shout ${SHOUT_OVER_FLOOR}× over the EFFECTIVE floor still counts (e.g. sorollós demoted the onset)`, () => {
    // audible room: floor 0.02 → needs > 0.08
    expect(judgeCalibrationThrow({ ...base, ambientFloor: 0.02, shoutPeak: 0.02 * SHOUT_OVER_FLOOR * 1.01 })).toEqual({ accept: true, voice: "loud" });
    expect(judgeCalibrationThrow({ ...base, ambientFloor: 0.02, shoutPeak: 0.02 * SHOUT_OVER_FLOOR * 0.99 })).toEqual({ accept: false, reason: "no-voice" });
  });
  it("jani's near-silent room: 0.0005 RMS is silence, not a shout — the floor is at least 0.015 (sessions 2/3 accepted these)", () => {
    expect(judgeCalibrationThrow({ ...base, ambientFloor: 0.0001, shoutPeak: 0.0005 })).toEqual({ accept: false, reason: "no-voice" });
    expect(judgeCalibrationThrow({ ...base, ambientFloor: 0.0001, shoutPeak: 0.025 })).toEqual({ accept: false, reason: "no-voice" }); // under 4×0.015
    expect(judgeCalibrationThrow({ ...base, ambientFloor: 0.0001, shoutPeak: 0.31 })).toEqual({ accept: true, voice: "loud" });
    expect(SHOUT_OVER_FLOOR * LIVE_VAD_FLOOR_MIN).toBeCloseTo(0.06, 9);
  });
  it("no room floor yet → loudness can't be judged → needs the onset", () => {
    expect(judgeCalibrationThrow({ ...base, ambientFloor: null, shoutPeak: 0.9 })).toEqual({ accept: false, reason: "no-voice" });
    expect(judgeCalibrationThrow({ ...base, ambientFloor: null, shoutPeak: 0.9, voiceOnsetPerfTime: 5 })).toEqual({ accept: true, voice: "onset" });
  });
  it("a misread count still counts (it's data), and the copy says so", () => {
    expect(judgeCalibrationThrow({ ...base, fingerCount: 2, voiceOnsetPerfTime: 100 }).accept).toBe(true);
    expect(VERDICT_COPY.accepted(3, 3)).toMatch(/llegit bé/);
    expect(VERDICT_COPY.accepted(3, 2)).toMatch(/He llegit un 2/);
  });
});

import { HARD_COPY, MAX_ATTEMPTS, REPEAT_COPY, shouldRepeatPrompt } from "../../src/calibration/judge.js";

describe("calibration judge: a misread prompt is repeated, capped, then flagged", () => {
  it("a correct read never repeats", () => {
    expect(shouldRepeatPrompt(3, 3, 1)).toBe(false);
    expect(shouldRepeatPrompt(1, 1, 3)).toBe(false);
  });
  it(`a misread repeats until attempt ${MAX_ATTEMPTS}, then stops (accept-and-flag)`, () => {
    expect(shouldRepeatPrompt(2, 4, 1)).toBe(true);
    expect(shouldRepeatPrompt(2, 4, 2)).toBe(true);
    expect(shouldRepeatPrompt(2, 4, MAX_ATTEMPTS)).toBe(false);
    expect(shouldRepeatPrompt(1, null, 1)).toBe(true);
  });
  it("copy names the read, the attempt, and the prompt; hard copy names the number", () => {
    expect(REPEAT_COPY(2, 4, 1)).toMatch(/llegit un 4/);
    expect(REPEAT_COPY(2, 4, 1)).toMatch(/1\/3/);
    expect(REPEAT_COPY(2, 4, 1)).toMatch(/tira un 2/);
    expect(HARD_COPY(2, 4)).toMatch(/El 2 se'm resisteix/);
  });
});
