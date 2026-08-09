// Ported from spikes/modules/test.mjs's "mirror.mjs" section.
import { describe, expect, it } from "vitest";
import { computeBigramHeatmap, computeExploitability, computeHistograms, computeRandomnessScore, computeSyncStats, computeTopTells } from "../src/mirror.js";
import type { HistoryEntry } from "../src/types.js";

function entry(partial: Partial<HistoryEntry>): HistoryEntry {
  return { playerFingers: null, playerCall: null, aiFingers: null, aiCall: null, verdictWinner: null, ...partial };
}

function mulberry32Fn(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("mirror: computeExploitability (replays the REAL L4 predictor)", () => {
  it("climbs well above the 20% baseline against an always-5 player", () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 25; i++) history.push(entry({ throwIndex: i + 1, playerFingers: 5, playerCall: 7, playerWord: "set", verdictWinner: null }));
    const exp = computeExploitability(history);
    expect(exp.rate).toBeGreaterThan(0.4);
  });
  it("stays near the 20% baseline against a uniform-random player", () => {
    const rng = mulberry32Fn(55);
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 300; i++) history.push(entry({ throwIndex: i + 1, playerFingers: 1 + Math.floor(rng() * 5), verdictWinner: null }));
    const exp = computeExploitability(history);
    expect(Math.abs(exp.rate! - 0.2)).toBeLessThan(0.08);
  });
  it("too little history -> null rate, not a crash", () => {
    expect(computeExploitability([entry({ playerFingers: 3 })]).rate).toBeNull();
  });
});

describe("mirror: computeRandomnessScore (Shannon redundancy)", () => {
  it("always the same value -> 100% redundancy (zero entropy)", () => {
    const allSame = Array.from({ length: 20 }, () => entry({ playerFingers: 3 }));
    const r = computeRandomnessScore(allSame)!;
    expect(r.redundancyPct).toBeCloseTo(100, 6);
  });
  it("perfectly uniform counts -> ~0% redundancy", () => {
    const perfectlyUniform: HistoryEntry[] = [];
    for (const v of [1, 2, 3, 4, 5]) for (let i = 0; i < 40; i++) perfectlyUniform.push(entry({ playerFingers: v }));
    const r = computeRandomnessScore(perfectlyUniform)!;
    expect(r.redundancyPct).toBeLessThan(1);
  });
  it("no data -> null", () => {
    expect(computeRandomnessScore([])).toBeNull();
  });
});

describe("mirror: computeHistograms", () => {
  it("f/g counts, percentages, and top-words are correct", () => {
    const history: HistoryEntry[] = [
      entry({ playerFingers: 1, playerCall: 4, playerWord: "quatre" }), // g=3
      entry({ playerFingers: 1, playerCall: 3, playerWord: "tres" }), // g=2
      entry({ playerFingers: 2, playerCall: 4, playerWord: "quatre" }), // g=2
      entry({ playerFingers: 3, playerCall: null, playerWord: null }),
    ];
    const h = computeHistograms(history);
    expect(h.f.list.find((x) => x.value === 1)!.count).toBe(2);
    expect(h.f.list.find((x) => x.value === 3)!.count).toBe(1);
    expect(h.f.list.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 6);
    expect(h.g.total).toBe(3);
    expect(h.g.list.find((x) => x.value === 2)!.count).toBe(2);
    expect(h.topWords[0]!.word).toBe("quatre");
    expect(h.topWords[0]!.count).toBe(2);
  });
  it("empty history -> zeroed totals, no crash", () => {
    expect(computeHistograms([]).f.total).toBe(0);
  });
});

describe("mirror: computeBigramHeatmap", () => {
  it("counts transitions correctly and normalizes rows to probabilities", () => {
    const history: HistoryEntry[] = [1, 2, 1, 2, 1, 3].map((f) => entry({ playerFingers: f }));
    const heat = computeBigramHeatmap(history);
    expect(heat.counts[1]![2]).toBe(2); // 1->2 happened twice
    const rowSum = Object.values(heat.probabilities[1]!).reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
    expect(rowSum).toBeCloseTo(1, 9);
    expect(heat.probabilities[5]![1]).toBeNull(); // a from-value never seen -> null, not NaN
  });
});

describe("mirror: computeSyncStats", () => {
  it("sync rate and median |Δ| are computed correctly", () => {
    const history: HistoryEntry[] = [
      entry({ syncOutcome: "synced", syncDeltaMs: 50 }),
      entry({ syncOutcome: "synced", syncDeltaMs: -30 }),
      entry({ syncOutcome: "voice-late", syncDeltaMs: 600 }),
      entry({ syncOutcome: "hand-only", syncDeltaMs: null }),
    ];
    const s = computeSyncStats(history);
    expect(s.syncRate).toBeCloseTo(0.5, 9);
    expect(s.medianAbsDeltaMs).not.toBeNull();
  });
  it("no data -> nulls, not a crash", () => {
    expect(computeSyncStats([]).syncRate).toBeNull();
  });
});

describe("mirror: computeTopTells", () => {
  it("detects a repeat-rate tell for a heavily-repeating sequence", () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 20; i++) history.push(entry({ playerFingers: i % 4 === 0 ? 2 : 3 }));
    const tells = computeTopTells(history);
    expect(tells.some((t) => t.id === "repeatRate")).toBe(true);
    expect(tells.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < tells.length; i++) expect(tells[i - 1]!.strength).toBeGreaterThanOrEqual(tells[i]!.strength);
  });
  it("detects a win-stay tell", () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      history.push(entry({ playerFingers: (i % 5) + 1, verdictWinner: "player" }));
      history.push(entry({ playerFingers: (i % 5) + 1, verdictWinner: "ai" })); // "stay" — repeats after the win above
    }
    const tells = computeTopTells(history, 4);
    expect(tells.some((t) => t.id === "winStay")).toBe(true);
  });
  it("detects a finger-call correlation tell", () => {
    const history: HistoryEntry[] = Array.from({ length: 10 }, () => entry({ playerFingers: 5, playerWord: "vuit" }));
    const tells = computeTopTells(history, 4);
    const tell = tells.find((t) => t.id === "fingerCallCorrelation");
    expect(tell?.sentence).toContain("vuit");
  });
  it("detects a sequence-habit tell", () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 10; i++) { history.push(entry({ playerFingers: 3 })); history.push(entry({ playerFingers: 5 })); }
    const tells = computeTopTells(history, 4);
    expect(tells.some((t) => t.id === "sequenceHabit")).toBe(true);
  });
  it("no/insufficient data -> empty array, not a crash", () => {
    expect(computeTopTells([])).toEqual([]);
  });
  it("a genuinely short, uniform-random-looking history yields few or no tells", () => {
    expect(computeTopTells([entry({ playerFingers: 1 }), entry({ playerFingers: 3 })])).toEqual([]);
  });
});
