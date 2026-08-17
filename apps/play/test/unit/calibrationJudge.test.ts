import { describe, expect, it } from "vitest";
import { judgeCalibrationThrow, SHOUT_OVER_FLOOR, VERDICT_COPY } from "../../src/calibration/judge.js";

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
  it(`without an onset, a shout ${SHOUT_OVER_FLOOR}× over the room floor still counts (e.g. sorollós demoted the onset)`, () => {
    expect(judgeCalibrationThrow({ ...base, shoutPeak: 0.01 * SHOUT_OVER_FLOOR * 1.01 })).toEqual({ accept: true, voice: "loud" });
    expect(judgeCalibrationThrow({ ...base, shoutPeak: 0.01 * SHOUT_OVER_FLOOR * 0.99 })).toEqual({ accept: false, reason: "no-voice" });
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
