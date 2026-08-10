// Ported from spikes/modules/test.mjs's "scorer.mjs" section.
import { describe, expect, it } from "vitest";
import { classifyHandSettleForSync, classifySyncThrow, isOrphanVoiceOnset, shouldRevealPhase1 } from "../src/scorer.js";

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

describe("scorer: classifyHandSettleForSync (Phase C.1)", () => {
  it("fist(0)+silence -> reset", () => {
    expect(classifyHandSettleForSync(0, null).isReset).toBe(true);
  });
  it("fist(0)+voice -> throw of 1, not reset", () => {
    const r = classifyHandSettleForSync(0, 123);
    expect(r.isReset).toBe(false);
    expect(r.effectiveFingerCount).toBe(1);
  });
  it("count>=2 unchanged regardless of voice", () => {
    const a = classifyHandSettleForSync(4, null);
    const b = classifyHandSettleForSync(4, 123);
    expect(a.effectiveFingerCount).toBe(4);
    expect(b.effectiveFingerCount).toBe(4);
    expect(a.isReset).toBe(false);
    expect(b.isReset).toBe(false);
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
