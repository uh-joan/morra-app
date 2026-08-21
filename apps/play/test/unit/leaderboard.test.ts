import { describe, expect, it } from "vitest";
import {
  computeMatchScore,
  formatScore,
  insertEntry,
  RANKING_CAP,
  SEED_ENTRIES,
  styleMultiplier,
  type RankEntry,
  type StyleMetrics,
} from "../../src/leaderboard.js";

const noStyle: StyleMetrics = { syncRate: null, redundancy: null, exploitability: null };

function entry(score: number, at = "2026-08-21T12:00:00.000Z", name = "JANI"): RankEntry {
  return { name, levelId: "L1", score, you: 10, rival: 8, at };
}

describe("styleMultiplier", () => {
  it("is 1.0 with no metrics (style never punishes silence)", () => {
    expect(styleMultiplier(noStyle)).toBe(1);
  });

  it("caps at 1.5 with perfect play", () => {
    expect(styleMultiplier({ syncRate: 1, redundancy: 0, exploitability: 0 })).toBe(1.5);
  });

  it("averages only the available components", () => {
    // sync alone at 0.5 → 1 + 0.5×0.5 = 1.25
    expect(styleMultiplier({ syncRate: 0.5, redundancy: null, exploitability: null })).toBe(1.25);
  });

  it("treats 40%+ exploitability as an open book (component 0)", () => {
    expect(styleMultiplier({ syncRate: null, redundancy: null, exploitability: 0.4 })).toBe(1);
    expect(styleMultiplier({ syncRate: null, redundancy: null, exploitability: 0.6 })).toBe(1);
    // unreadable equilibrium (~0.2) → component 0.5 → ×1.25
    expect(styleMultiplier({ syncRate: null, redundancy: null, exploitability: 0.2 })).toBe(1.25);
  });
});

describe("computeMatchScore", () => {
  it("weights rivals: El Rei ≈ ten plain Ninos at equal margin", () => {
    const nino = computeMatchScore("L1", 10, 8, noStyle);
    const rei = computeMatchScore("L4", 10, 8, noStyle);
    expect(nino).toBe(1200);
    expect(rei).toBe(12000);
  });

  it("margin doubles a perfect game and barely lifts a scrape", () => {
    expect(computeMatchScore("L1", 10, 0, noStyle)).toBe(2000);
    expect(computeMatchScore("L1", 10, 9, noStyle)).toBe(1100);
  });

  it("a perfect Nino win outscores a scraped Bru win — every rung worth playing well", () => {
    const perfectNino = computeMatchScore("L1", 10, 0, { syncRate: 1, redundancy: 0, exploitability: 0 });
    const scrapedBru = computeMatchScore("L2", 10, 9, noStyle);
    expect(perfectNino).toBe(3000);
    expect(scrapedBru).toBe(2750);
    expect(perfectNino).toBeGreaterThan(scrapedBru);
  });

  it("falls back to the L1 base for an unknown level id", () => {
    expect(computeMatchScore("L9", 10, 8, noStyle)).toBe(1200);
  });

  // Concrete end-to-end scores, pinned so tuning any weight can't silently
  // shift the numbers players see. If you change base/margin/style on
  // purpose, update these — that's the point.
  it("pins canonical scores across the formula's range", () => {
    const full = { syncRate: 1, redundancy: 0, exploitability: 0 };
    // the floor of a win, and the absolute ceiling of a top match
    expect(computeMatchScore("L1", 10, 9, noStyle)).toBe(1100); // scrape past Nino
    expect(computeMatchScore("L4", 10, 0, noStyle)).toBe(20000); // flawless El Rei, no style
    expect(computeMatchScore("L4", 10, 0, full)).toBe(30000); // flawless + stylish — the max
    // single-metric style, and the mid rungs
    expect(computeMatchScore("L3", 10, 6, { syncRate: 0.8, redundancy: null, exploitability: null })).toBe(9800);
    // rounding: 2500 × 1.3 × 1.25 = 4062.5 → 4063
    expect(computeMatchScore("L2", 10, 7, { syncRate: 0.5, redundancy: null, exploitability: null })).toBe(4063);
    // all three style components averaged: 2500 × 1.5 × 1.31667 = 4937.5 → 4938
    expect(computeMatchScore("L2", 10, 5, { syncRate: 0.6, redundancy: 0.2, exploitability: 0.2 })).toBe(4938);
  });
});

describe("insertEntry", () => {
  it("places by score descending", () => {
    const { entries, placement } = insertEntry([entry(3000), entry(1000, "2026-08-20T00:00:00.000Z")], entry(2000));
    expect(placement).toBe(2);
    expect(entries.map((e) => e.score)).toEqual([3000, 2000, 1000]);
  });

  it("breaks ties earlier-first — the incumbent keeps the slot", () => {
    const older = entry(2000, "2026-08-01T00:00:00.000Z", "VELL");
    const { entries, placement } = insertEntry([older], entry(2000, "2026-08-21T00:00:00.000Z", "NOU"));
    expect(entries[0]!.name).toBe("VELL");
    expect(placement).toBe(2);
  });

  it("caps at ten and reports null when the entry misses the cut", () => {
    const table = Array.from({ length: RANKING_CAP }, (_, i) => entry(10000 - i * 100, `2026-08-0${(i % 9) + 1}T00:00:00.000Z`));
    const { entries, placement } = insertEntry(table, entry(1));
    expect(placement).toBeNull();
    expect(entries).toHaveLength(RANKING_CAP);
    expect(entries.map((e) => e.score)).toEqual(table.map((e) => e.score));
  });

  it("dethrones the last row when the newcomer outscores it", () => {
    const table = Array.from({ length: RANKING_CAP }, (_, i) => entry(10000 - i * 100));
    const { entries, placement } = insertEntry(table, entry(9950));
    expect(placement).toBe(2);
    expect(entries).toHaveLength(RANKING_CAP);
    expect(entries.some((e) => e.score === 9100)).toBe(false); // old 10th fell off
  });
});

describe("seeds", () => {
  it("start empty — the board opens with all ten rungs unclaimed", () => {
    expect(SEED_ENTRIES).toHaveLength(0);
  });

  it("the first real entry takes the top of an empty table", () => {
    const { entries, placement } = insertEntry([...SEED_ENTRIES], entry(1500, "2026-08-21T00:00:00.000Z", "NOU"));
    expect(placement).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("NOU");
  });
});

describe("display", () => {
  it("formats scores ca-ES style", () => {
    expect(formatScore(16800)).toBe("16.800");
    expect(formatScore(999)).toBe("999");
    expect(formatScore(1234567)).toBe("1.234.567");
  });

  it("caps the table at ten rows", () => {
    expect(RANKING_CAP).toBe(10);
  });
});
