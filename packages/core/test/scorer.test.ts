// Ported from spikes/modules/test.mjs's "scorer.mjs" section.
import { describe, expect, it } from "vitest";
import { classifyHandSettleForSync, classifySyncThrow, isOrphanVoiceOnset, shouldRevealPhase1, shouldRevealPhase1From } from "../src/scorer.js";

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

describe("scorer: shouldRevealPhase1From (deliberate divergence: a throw of ONE reveals)", () => {
  it.each([2, 3, 4, 5])("fc=%i reveals regardless of where the hand came from", (n) => {
    expect(shouldRevealPhase1From(n, null)).toBe(true);
    expect(shouldRevealPhase1From(n, 0)).toBe(true);
    expect(shouldRevealPhase1From(n, 4)).toBe(true);
  });
  it("fc=1 from a resting fist (pre-onset 0 or 1) reveals — the throw-of-one case", () => {
    expect(shouldRevealPhase1From(1, 0)).toBe(true);
    expect(shouldRevealPhase1From(1, 1)).toBe(true);
  });
  it("fc=1 coming down from a held >=2 pose is a retraction — no reveal (this is the 73%)", () => {
    expect(shouldRevealPhase1From(1, 2)).toBe(false);
    expect(shouldRevealPhase1From(1, 5)).toBe(false);
  });
  it("fc=1 with UNKNOWN pre-onset keeps the spike's answer (parity-safe degradation)", () => {
    expect(shouldRevealPhase1From(1, null)).toBe(false);
  });
  it("fc=0 and null never reveal, whatever came before", () => {
    expect(shouldRevealPhase1From(0, 0)).toBe(false);
    expect(shouldRevealPhase1From(0, 3)).toBe(false);
    expect(shouldRevealPhase1From(null, 0)).toBe(false);
  });
});
