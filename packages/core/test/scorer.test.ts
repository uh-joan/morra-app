// Ported from spikes/modules/test.mjs's "scorer.mjs" section.
import { describe, expect, it } from "vitest";
import { clampFingerCountToThrow, classifyHandSettleForSync, classifySyncThrow, isOrphanVoiceOnset, shouldRevealPhase1 } from "../src/scorer.js";

describe("scorer: classifySyncThrow", () => {
  it("within co-occurrence window -> synced", () => {
    const cls = classifySyncThrow(1000, 1050, 400);
    expect(cls.outcome).toBe("synced");
    expect(cls.synced).toBe(true);
  });
  it("voice well after hand -> voice-late", () => {
    const cls = classifySyncThrow(1000, 1600, 400);
    expect(cls.outcome).toBe("voice-late");
    expect(cls.syncDeltaMs).toBe(600);
  });
  it("voice well before hand -> voice-early", () => {
    const cls = classifySyncThrow(1000, 400, 400);
    expect(cls.outcome).toBe("voice-early");
    expect(cls.syncDeltaMs).toBe(-600);
  });
  it("no voice found -> hand-only", () => {
    const cls = classifySyncThrow(1000, null, 400);
    expect(cls.outcome).toBe("hand-only");
    expect(cls.synced).toBe(false);
  });
});

describe("scorer: isOrphanVoiceOnset", () => {
  it("no nearby hand onset -> orphan (true)", () => {
    expect(isOrphanVoiceOnset(5000, [1000, 2000], 500)).toBe(true);
  });
  it("a hand onset within the partner window -> not orphan (false)", () => {
    expect(isOrphanVoiceOnset(2100, [1000, 2000], 500)).toBe(false);
  });
});

describe("scorer: clampFingerCountToThrow (Feature 1 — Micatio has no zero)", () => {
  it("0 clamps to 1 — the fist is a legal throw of one, never a bare zero", () => {
    expect(clampFingerCountToThrow(0)).toBe(1);
  });
  it.each([1, 2, 3, 4, 5])("%i passes through unchanged", (n) => {
    expect(clampFingerCountToThrow(n)).toBe(n);
  });
});

describe("scorer: classifyHandSettleForSync (Feature 1 fix — no more silent reset)", () => {
  // BUG this guards against: a settle at count <=1 with no voice used to be
  // silently classified as a reset (deleting the throw). It's now a plain
  // clamp — every settle is a real throw, voice or not; resets come
  // exclusively from resetPalette.ts's stepResetPalette instead.
  it("fist(0)+silence -> a real throw of 1, NOT a reset (the fixed bug)", () => {
    expect(classifyHandSettleForSync(0, null)).toBe(1);
  });
  it("fist(0)+voice -> still a throw of 1", () => {
    expect(classifyHandSettleForSync(0, 123)).toBe(1);
  });
  it("count=1, with or without voice, stays 1", () => {
    expect(classifyHandSettleForSync(1, null)).toBe(1);
    expect(classifyHandSettleForSync(1, 123)).toBe(1);
  });
  it("count>=2 unchanged regardless of voice", () => {
    expect(classifyHandSettleForSync(4, null)).toBe(4);
    expect(classifyHandSettleForSync(4, 123)).toBe(4);
  });
  it("no hand (null) stays null", () => {
    expect(classifyHandSettleForSync(null, null)).toBeNull();
    expect(classifyHandSettleForSync(null, 123)).toBeNull();
  });
});

describe("scorer: shouldRevealPhase1 (Phase E.1)", () => {
  it.each([2, 3, 4, 5])("shouldRevealPhase1(%i) -> true", (n) => {
    expect(shouldRevealPhase1(n)).toBe(true);
  });
  it.each([0, 1])("shouldRevealPhase1(%i) -> false", (n) => {
    expect(shouldRevealPhase1(n)).toBe(false);
  });
  it("shouldRevealPhase1(null) -> false", () => {
    expect(shouldRevealPhase1(null)).toBe(false);
  });
});
