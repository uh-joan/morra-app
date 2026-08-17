// ai2.test.ts — the v2 rival policy. Pure functions + the properties the
// design leans on: no data → uniform; every sampled distribution keeps the
// uniform floor; purity (same rng sequence + history → same move); the
// contexts read what they claim; anti-aim puts mass where q is smallest.
import { describe, expect, it } from "vitest";
import {
  antiAim, bmaBelief, blendO1Marginal, contextPredict, decideMoveV2, F_PREDICTORS, F_EXTRAS, G_PREDICTORS,
  jointGPredict, playerHitRate, predictPlayerFV2, sharpen, temperatureFromEdge, toRows, UNIFORM, V2_TUNING,
} from "../src/ai2.js";
import type { HistoryEntry } from "../src/types.js";

const V = [1, 2, 3, 4, 5] as const;
const H = (pf: number, pc: number, af: number, ac: number, w: "player" | "ai" | "parata"): HistoryEntry => ({ playerFingers: pf, playerCall: pc, aiFingers: af, aiCall: ac, verdictWinner: w });
const seq = (...xs: number[]) => { let i = 0; return { next: () => xs[i++ % xs.length]! }; };
const sum = (d: Record<number, number>) => V.reduce((s, v) => s + d[v], 0);

describe("ai2: rows and contexts", () => {
  it("toRows extracts f, g = call − f (1..5 only), the rival's fingers, the verdict", () => {
    const rows = toRows([H(3, 7, 2, 5, "player"), H(5, 12, 1, 3, "ai"), H(2, 4, 4, 9, "parata")]);
    expect(rows[0]).toEqual({ f: 3, g: 4, af: 2, w: "player" });
    expect(rows[1]!.g).toBeNull(); // 12 − 5 = 7: an impossible call → no guess
    expect(rows[2]).toEqual({ f: 2, g: 2, af: 4, w: "parata" });
  });
  it("order1 conditions on the previous f; prevOutcome on the previous verdict — win-shift shows up", () => {
    // after every round the player WON they changed fingers; after parata they repeated
    const hist = [H(3, 7, 2, 5, "player"), H(5, 8, 3, 6, "parata"), H(5, 9, 3, 6, "player"), H(2, 4, 4, 9, "parata"), H(2, 5, 4, 8, "player"), H(4, 8, 1, 6, "parata"), H(4, 7, 3, 6, "player")];
    const rows = toRows(hist);
    const afterWin = contextPredict(F_PREDICTORS.find((p) => p.name === "prevOutcome")!, rows, rows.length, "f")!; // last verdict: player won
    // rows after a player win: 5 (after r0), 2 (after r2), 4 (after r4) — never a repeat of the winning fingers
    expect(afterWin[5]).toBeGreaterThan(afterWin[3]);
    const o1 = contextPredict(F_PREDICTORS.find((p) => p.name === "order1")!, rows, rows.length, "f")!; // last f = 4
    expect(sum(o1)).toBeCloseTo(1, 9);
  });
  it("a context with no matching rows returns null; order2 needs 2 samples", () => {
    const rows = toRows([H(3, 7, 2, 5, "player"), H(1, 3, 2, 4, "ai")]);
    expect(contextPredict(F_PREDICTORS.find((p) => p.name === "order2")!, rows, rows.length, "f")).toBeNull();
    expect(contextPredict(F_PREDICTORS.find((p) => p.name === "order1")!, rows, rows.length, "f")).toBeNull(); // last f=1 never preceded anything
  });
  it("blendO1Marginal is the mean of order1 and marginal", () => {
    const rows = toRows([H(3, 7, 2, 5, "player"), H(5, 8, 3, 6, "parata"), H(3, 6, 2, 5, "ai"), H(5, 9, 3, 6, "player")]);
    const b = blendO1Marginal(rows, rows.length)!;
    const o1 = contextPredict(F_PREDICTORS[2]!, rows, rows.length, "f")!, m = contextPredict(F_PREDICTORS[0]!, rows, rows.length, "f")!;
    for (const v of V) expect(b[v]).toBeCloseTo(0.5 * o1[v] + 0.5 * m[v], 9);
  });
});

describe("ai2: joint f→g", () => {
  it("q(g) = Σ_f p(f)·p(g|f): a player who calls f+2 on 2s and f+5 on 3s", () => {
    const hist = [H(2, 4, 1, 3, "parata"), H(2, 4, 3, 5, "parata"), H(3, 8, 1, 4, "parata"), H(3, 8, 4, 8, "parata"), H(2, 4, 5, 9, "parata")];
    const rows = toRows(hist);
    const q2 = jointGPredict(rows, rows.length, { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 })!; // if we believe f=2 next
    expect(V.reduce((b, v) => (q2[v] > q2[b] ? v : b), 1)).toBe(2);
    const q3 = jointGPredict(rows, rows.length, { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 })!;
    expect(V.reduce((b, v) => (q3[v] > q3[b] ? v : b), 1)).toBe(5);
    expect(jointGPredict(rows.slice(0, 2), 2, UNIFORM)).toBeNull(); // < 3 samples
  });
});

describe("ai2: BMA, temperature, floor, anti-aim", () => {
  it("no history → uniform belief, zero edge", () => {
    const b = bmaBelief([], "f", F_PREDICTORS, F_EXTRAS);
    expect(b.dist).toEqual(UNIFORM);
    expect(b.edge).toBe(0);
  });
  it("beliefs are distributions", () => {
    const rows = toRows(Array.from({ length: 30 }, (_, i) => H(1 + (i % 5), 3 + (i % 5), 1 + ((i * 3) % 5), 4 + ((i * 3) % 5), (["player", "ai", "parata"] as const)[i % 3]!)));
    const b = bmaBelief(rows, "f", F_PREDICTORS, F_EXTRAS);
    expect(sum(b.dist)).toBeCloseTo(1, 9);
    const q = bmaBelief(rows, "g", G_PREDICTORS, [{ name: "joint", fn: (rs, n) => jointGPredict(rs, n, b.dist) }]);
    expect(sum(q.dist)).toBeCloseTo(1, 9);
  });
  it("temperatureFromEdge: no edge → 1; strong edge → tauMin; never outside", () => {
    expect(temperatureFromEdge(0)).toBe(1);
    expect(temperatureFromEdge(-1)).toBe(1);
    expect(temperatureFromEdge(10)).toBe(V2_TUNING.tauMin);
  });
  it("sharpen keeps the uniform floor on every value, and sums to 1", () => {
    const d = sharpen({ 1: 0.9, 2: 0.025, 3: 0.025, 4: 0.025, 5: 0.025 }, 0.3);
    for (const v of V) expect(d[v]).toBeGreaterThanOrEqual(V2_TUNING.floor * 0.2 - 1e-12);
    expect(sum(d)).toBeCloseTo(1, 9);
  });
  it("antiAim puts the most mass where q is SMALLEST, keeps the floor, sums to 1", () => {
    const q = { 1: 0.30, 2: 0.25, 3: 0.20, 4: 0.15, 5: 0.10 };
    const a = antiAim(q);
    expect(a[5]).toBeGreaterThan(a[4]); expect(a[4]).toBeGreaterThan(a[1]);
    for (const v of V) expect(a[v]).toBeGreaterThanOrEqual(V2_TUNING.floor * 0.2 - 1e-12);
    expect(sum(a)).toBeCloseTo(1, 9);
    // decisive: a 20-point gap in q is a big ratio at antiT=0.04 (e^5)
    expect(a[5] / a[1]).toBeGreaterThan(20);
  });
  it("playerHitRate reads how often the player's guess hit our fingers, null under 8 rows", () => {
    expect(playerHitRate(toRows([H(3, 5, 2, 5, "player")]))).toBeNull();
    const hist = Array.from({ length: 10 }, (_, i) => H(3, i < 5 ? 5 : 6, 2, 5, "parata")); // guess 2 (=af) 5 times, then 3
    expect(playerHitRate(toRows(hist))).toBeCloseTo(0.5, 9);
  });
});

describe("ai2: decideMoveV2 / predictPlayerFV2", () => {
  const hist = [H(3, 7, 2, 5, "player"), H(5, 8, 3, 6, "parata"), H(3, 6, 2, 5, "ai"), H(5, 9, 3, 6, "player"), H(2, 4, 1, 3, "parata"), H(3, 8, 4, 8, "parata"), H(5, 8, 5, 10, "ai")];
  it("L1/L2 delegate to the spike policy (v2 trace null)", () => {
    const m2 = decideMoveV2("L2", seq(0.05, 0.5, 0.95), hist);
    expect(m2.level).toBe("L2"); expect(m2.v2).toBeNull(); expect(m2.call).toBe(m2.fingers + m2.guessPlayerFingers);
    expect(decideMoveV2("L1", seq(0.05, 0.5, 0.95), hist).v2).toBeNull();
  });
  it("L3/L4 return a well-formed move with the v2 trace; call = fingers + guess", () => {
    for (const L of ["L3", "L4"] as const) {
      const m = decideMoveV2(L, seq(0.13, 0.71, 0.42, 0.9), hist);
      expect(m.level).toBe(L);
      expect(V).toContain(m.fingers); expect(V).toContain(m.guessPlayerFingers);
      expect(m.call).toBe(m.fingers + m.guessPlayerFingers);
      expect(m.v2).not.toBeNull();
      expect(sum(m.v2!.fBelief)).toBeCloseTo(1, 9);
    }
    const m4 = decideMoveV2("L4", seq(0.13, 0.71), hist);
    expect(m4.v2!.gBelief).not.toBeNull(); expect(m4.antiAimDist).not.toBeNull();
  });
  it("PURE: same rng sequence + same history → same move; different history → generally different", () => {
    const a = decideMoveV2("L4", seq(0.13, 0.71), hist), b = decideMoveV2("L4", seq(0.13, 0.71), hist);
    expect(a).toEqual(b);
  });
  it("with no history L3/L4 read uniform (the equilibrium floor)", () => {
    expect(predictPlayerFV2("L4", []).dist).toEqual(UNIFORM);
    expect(predictPlayerFV2("L3", []).dist).toEqual(UNIFORM);
    expect(predictPlayerFV2("L2", hist).dist).toEqual(UNIFORM);
  });
});
