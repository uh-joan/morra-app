// mirror2 — L'Espill v2 statistics library. Synthetic histories with KNOWN
// structure; each statistic must find what was planted and stay near chance
// where nothing was.
import { describe, expect, it } from "vitest";
import {
  computeGuessStats, computeLoops, computeOrder2, computeOutcomeStats, computePredictabilityByFamily, computeReactivity,
  computeReaderStats, computeRegimes, computeReturnTimes, computeSteps, computeTiming, computeWeld, rankExploitValue, splitWindows,
} from "../src/mirror2.js";
import type { HistoryEntry } from "../src/types.js";

const H = (pf: number, pc: number | null, af: number, ac: number, w: "player" | "ai" | "parata" | null, extra: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({ playerFingers: pf, playerCall: pc, aiFingers: af, aiCall: ac, aiGuessPlayerFingers: ac - af, verdictWinner: w, ...extra });
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** a history where the player's fingers follow `seq` and everything else is a fixed uniform-ish filler */
const fromF = (seq: number[]): HistoryEntry[] => seq.map((f, i) => H(f, f + 1 + (i % 5), 1 + (i % 5), 1 + (i % 5) + 1 + ((i * 3) % 5), "parata"));
const uniform = (n: number, seed = 1) => { const r = mulberry(seed); return fromF(Array.from({ length: n }, () => 1 + Math.floor(r() * 5))); };

describe("mirror2: sequence structure", () => {
  it("order-2 finds a planted triple and its conditional entropy is lower than order-1's", () => {
    // 2,4 is always followed by 5; the rest is noise
    const r = mulberry(3); const seq: number[] = [];
    for (let i = 0; i < 300; i++) { if (i >= 2 && seq[i - 2] === 2 && seq[i - 1] === 4) seq.push(5); else seq.push(1 + Math.floor(r() * 5)); }
    const o = computeOrder2(fromF(seq));
    const t = o.triples.find((x) => x.a === 2 && x.b === 4)!;
    expect(t.c).toBe(5); expect(t.p).toBe(1); expect(t.count).toBeGreaterThan(5);
    expect(o.h2).toBeLessThan(o.h1); expect(o.hMax).toBeCloseTo(2.32, 1);
  });
  it("steps: a staircase 1-2-3-4-5-4-3-2-1 is all ±1 with full direction persistence", () => {
    const s = computeSteps(fromF([1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 1]));
    expect(s.pStepOne).toBe(1); expect(s.pStay).toBe(0); expect(s.pBigJump).toBe(0);
    expect(s.riseAfterRise.rate).toBeGreaterThan(0.7); expect(s.fallAfterFall.rate).toBeGreaterThan(0.7);
    const u = computeSteps(uniform(400));
    expect(u.pStay).toBeGreaterThan(0.12); expect(u.pStay).toBeLessThan(0.28); // ≈ 0.2
  });
  it("regimes: long stays in high then a dive to low show up in dwell and hazard", () => {
    // 4,5,4,5,1,2,4,5,4,5,1,2 ... : dwell high = 4, low = 2
    const seq: number[] = []; for (let i = 0; i < 20; i++) seq.push(4, 5, 4, 5, 1, 2);
    const g = computeRegimes(fromF(seq));
    expect(g.dwell.high.mean).toBe(4); expect(g.dwell.low.mean).toBe(2);
    expect(g.leaveHazard.high[4]!.rate).toBe(1); expect(g.leaveHazard.high[1]!.rate).toBe(0);
    expect(g.transition.high.low).toBeCloseTo(0.25, 5); expect(g.share.mid).toBe(0);
  });
  it("return times: a deck player (cycles all five, never repeats within a cycle) has zero repeats-before-coverage", () => {
    const seq: number[] = []; for (let i = 0; i < 30; i++) seq.push(3, 1, 5, 2, 4);
    const rt = computeReturnTimes(fromF(seq));
    expect(rt.coverageCycles.rate).toBe(0); expect(rt.perDigit[3]!.meanGap).toBe(5);
    expect(rt.perDigit[4]!.since).toBe(0); expect(rt.perDigit[3]!.since).toBe(4);
  });
  it("loops: a-b-a bounce and lag-2 autocorrelation are found; runs are counted", () => {
    const l = computeLoops(fromF([2, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 4]));
    expect(l.bounce.rate).toBe(1); expect(l.autocorr[2]!.rate).toBe(1); expect(l.autocorr[1]!.rate).toBe(0);
    const r = computeLoops(fromF([3, 3, 3, 1, 1, 5]));
    expect(r.longestRun).toBe(3); expect(r.runLengths[3]).toBe(1); expect(r.runLengths[2]).toBe(1); expect(r.runLengths[1]).toBe(1);
  });
});

describe("mirror2: the call channel", () => {
  it("weld: a player who always calls double their fingers has p(g=f|f)=1 and high mutual information; a free caller has ~0", () => {
    const welded = Array.from({ length: 60 }, (_, i) => H(1 + (i % 5), 2 * (1 + (i % 5)), 3, 5, "parata"));
    const w = computeWeld(welded);
    for (const f of [1, 2, 3, 4, 5]) { expect(w.gGivenF[f]!.favouriteG).toBe(f); expect(w.gGivenF[f]!.favouriteP).toBe(1); }
    expect(w.mutualInfoBits).toBeGreaterThan(2);
    expect(w.totAvoidance.rate).toBe(1); // f=5,g=5 → 10 every time
    const r = mulberry(5);
    const free = Array.from({ length: 600 }, () => { const f = 1 + Math.floor(r() * 5), g = 1 + Math.floor(r() * 5); return H(f, f + g, 3, 5, "parata"); });
    expect(computeWeld(free).mutualInfoBits!).toBeLessThan(0.15);
  });
  it("guess stats: chase = P(g == rival's previous fingers); stubborn re-guess after a miss", () => {
    // player always guesses the rival's previous fingers; rival throws 1..5 cyclically
    const hist: HistoryEntry[] = [];
    for (let i = 0; i < 40; i++) { const af = 1 + (i % 5); const prevAf = i ? 1 + ((i - 1) % 5) : 3; hist.push(H(2, 2 + prevAf, af, af + 1, "parata")); }
    const g = computeGuessStats(hist);
    expect(g.chase.rate).toBe(1); expect(g.stubbornAfterMiss.rate).toBe(0); // it always moves (follows the cycle)
    expect(g.nearMissAdjust.n).toBeGreaterThan(0);
  });
});

describe("mirror2: outcome- and rival-conditioned", () => {
  it("win-shift: a player who changes fingers only after winning", () => {
    const hist: HistoryEntry[] = [];
    let f = 3;
    for (let i = 0; i < 60; i++) { const w = i % 3 === 0 ? "player" : "parata"; hist.push(H(f, f + 2, 4, 6, w)); if (w === "player") f = f === 3 ? 4 : 3; }
    const o = computeOutcomeStats(hist);
    expect(o.shiftF.player.rate).toBe(1); expect(o.shiftF.parata.rate).toBe(0);
    expect(o.tilt.overall.h).toBeGreaterThan(0.9);
  });
  it("reactivity: never throwing what the rival just called on you reads as avoidRivalGuess = 0; mirroring its fingers = 1", () => {
    const avoid: HistoryEntry[] = [], mirror: HistoryEntry[] = [];
    let prevAg = 1, prevAf = 2;
    for (let i = 0; i < 40; i++) {
      const ag = 1 + (i % 5), af = 1 + ((i * 2) % 5);
      avoid.push(H(prevAg === 1 ? 2 : 1, 4, af, af + ag, "parata")); // never equal to prevAg
      mirror.push(H(prevAf, prevAf + 1, af, af + ag, "parata"));
      prevAg = ag; prevAf = af;
    }
    expect(computeReactivity(avoid).avoidRivalGuess.rate).toBe(0);
    expect(computeReactivity(mirror).mirrorRivalFingers.rate).toBe(1);
  });
  it("reader stats: hit rate on the rival's fingers, by level, feeding, and the fixed-guess ceiling", () => {
    const hist: HistoryEntry[] = [];
    for (let i = 0; i < 40; i++) { const af = i % 4 === 0 ? 2 : 5; hist.push(H(1, 1 + af, af, af + 1, "player", { aiLevel: i < 20 ? "L1" : "L4" })); }
    const r = computeReaderStats(hist);
    expect(r.hitRivalFingers.rate).toBe(1); expect(r.byLevel["L1"]!.rate).toBe(1); expect(r.byLevel["L4"]!.n).toBe(20);
    expect(r.fixedGuessCeiling.digit).toBe(5); expect(r.fixedGuessCeiling.rate).toBeCloseTo(0.75, 5);
    expect(r.feeding.rate).toBe(1); // ag = 1 = f every round
  });
});

describe("mirror2: timing, families, exploit value, windows", () => {
  it("timing: intervals by fingers from atIso, sync delta by fingers, misses per word", () => {
    const t0 = Date.parse("2026-08-17T20:00:00.000Z");
    const hist: HistoryEntry[] = [];
    for (let i = 0; i < 20; i++) { const f = i % 2 ? 5 : 1; hist.push(H(f, f + 2, 3, 5, "parata", { atIso: new Date(t0 + i * 2000 + (f === 5 ? 500 : 0) * (i % 2)).toISOString(), sessionId: "s", syncDeltaMs: f === 5 ? 100 : -50, playerWord: f === 5 ? "set" : "tres", syncOutcome: i % 4 === 1 ? "voice-late" : "synced" })); }
    const t = computeTiming(hist);
    expect(t.intervalByF[5]!.n).toBeGreaterThan(5); expect(t.intervalByF[5]!.meanS!).toBeGreaterThan(t.intervalByF[1]!.meanS!);
    expect(t.syncDeltaByF[5]!.meanMs).toBe(100); expect(t.syncDeltaByF[1]!.meanMs).toBe(-50);
    expect(t.missByWord["set"]!.rate).toBeCloseTo(0.5, 5); expect(t.missByWord["tres"]!.rate).toBe(0);
    expect(t.outcomes["synced"]).toBe(15);
  });
  it("predictability by family: order-1 finds an alternator, marginal does not", () => {
    const seq: number[] = []; for (let i = 0; i < 80; i++) seq.push(i % 2 ? 4 : 2);
    const fam = computePredictabilityByFamily(fromF(seq));
    const by = Object.fromEntries(fam.map((x) => [x.name, x.rate]));
    expect(by["order1"]).toBeGreaterThan(0.95); expect(by["marginal"]!).toBeLessThan(0.7);
  });
  it("exploit value: the read is worth more than a coin on a readable player, and the planted context ranks first", () => {
    // f follows the previous total: total 4 → 1, 5 → 2, 6 → 3, else 4
    const hist: HistoryEntry[] = [];
    let prevTotal = 6;
    const r = mulberry(9);
    for (let i = 0; i < 120; i++) {
      const f = prevTotal === 4 ? 1 : prevTotal === 5 ? 2 : prevTotal === 6 ? 3 : 4;
      const g = 1 + Math.floor(r() * 5), af = 1 + Math.floor(r() * 5), ag = 1 + Math.floor(r() * 5);
      hist.push(H(f, f + g, af, af + ag, ag === f && g !== af ? "ai" : g === af && ag !== f ? "player" : "parata"));
      prevTotal = f + af;
    }
    const rk = rankExploitValue(hist);
    expect(rk.n).toBeGreaterThan(80);
    expect(rk.readValuePer100).toBeGreaterThan(20); // a near-deterministic player
    expect(rk.items[0]!.name).toBe("prevTotal");
    expect(rk.items[0]!.pointsPer100).toBeGreaterThan(15); // alone it reads a near-deterministic player
    expect(rk.items[0]!.marginalPer100).toBeGreaterThan(0);
    // on a uniform player the whole read is worth about nothing
    const u = rankExploitValue(uniform(150, 4));
    expect(Math.abs(u.readValuePer100)).toBeLessThan(6);
  });
  it("splitWindows returns the last 30 and the 30 before", () => {
    const w = splitWindows(uniform(75), 30);
    expect(w.recent.length).toBe(30); expect(w.previous.length).toBe(30);
    expect(splitWindows(uniform(40), 30).previous.length).toBe(10);
  });
});
