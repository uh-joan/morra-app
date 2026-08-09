// Ported from spikes/modules/test.mjs's "ai.mjs — Phase G: the ladder"
// section. Uses createSeededRandomSource/createSequenceRandomSource
// (RandomSource port) in place of the spike's bare mulberry32()/fixed-array
// closures — same statistical behavior, port-shaped API.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL, LEVELS, LEVEL_ORDER, UNIFORM_DIST,
  combineByWeight, decayWeight, decideMove, globalFreqPredict, invertDistribution,
  lambdaFromNEff, mixWithUniform, ngramWithBackoff, order1Predict, order2Predict,
  predictPlayerF, sampleWithTemperature, stickyModePredict, winStayLoseShiftPredict,
} from "../src/ai.js";
import { createSeededRandomSource, createSequenceRandomSource, type RandomSource } from "../src/ports/random-source.js";
import type { HistoryEntry, VerdictWinner } from "../src/types.js";

describe("ai: level catalogue", () => {
  it("LEVEL_ORDER has all four levels, L2 default", () => {
    expect(LEVEL_ORDER).toEqual(["L1", "L2", "L3", "L4"]);
    expect(DEFAULT_LEVEL).toBe("L2");
  });
  it.each(LEVEL_ORDER)("LEVELS.%s has a name and a description", (id) => {
    expect(LEVELS[id].name).toEqual(expect.any(String));
    expect(LEVELS[id].description).toEqual(expect.any(String));
  });
});

describe("ai: low-level math helpers", () => {
  it("decayWeight: 0 throws back -> full weight 1", () => {
    expect(decayWeight(0, 20)).toBe(1);
  });
  it("decayWeight: exactly one half-life back -> weight 0.5", () => {
    expect(decayWeight(20, 20)).toBeCloseTo(0.5, 9);
  });
  it("lambdaFromNEff: half-saturation — nEff===k -> lambda=0.5", () => {
    expect(lambdaFromNEff(8, 8)).toBeCloseTo(0.5, 9);
  });
  it("lambdaFromNEff: nEff=0 -> lambda=0 (no data, no confidence)", () => {
    expect(lambdaFromNEff(0, 8)).toBe(0);
  });
  it("lambdaFromNEff: nEff->large -> lambda->1", () => {
    expect(lambdaFromNEff(10000, 8)).toBeGreaterThan(0.99);
  });
  it("mixWithUniform: lambda=0 -> exactly uniform regardless of the sharpened distribution", () => {
    const mixed = mixWithUniform({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 }, 0);
    for (const v of Object.values(mixed)) expect(v).toBeCloseTo(0.2, 9);
  });
  it("mixWithUniform: lambda=1 -> exactly the sharpened distribution, uniform ignored", () => {
    const mixed = mixWithUniform({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 }, 1);
    expect(mixed[1]).toBe(1);
    expect(mixed[2]).toBe(0);
  });
  it("invertDistribution: mass moves AWAY from the peak (anti-aim)", () => {
    const inv = invertDistribution({ 1: 0.6, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.1 })!;
    expect(inv[1]).toBeLessThan(inv[2]);
    expect(Object.values(inv).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it("combineByWeight: equal weights -> equal blend", () => {
    const combined = combineByWeight([
      { dist: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 }, weight: 1 },
      { dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 }, weight: 1 },
    ])!;
    expect(combined[1]).toBeCloseTo(0.5, 9);
    expect(combined[5]).toBeCloseTo(0.5, 9);
  });
  it("combineByWeight: no usable predictions -> null", () => {
    expect(combineByWeight([])).toBeNull();
    expect(combineByWeight([{ dist: null, weight: 5 }])).toBeNull();
  });
});

describe("ai: sampleWithTemperature (never argmax)", () => {
  it("τ=1 draws from the CDF (not argmax) — a high rng() draw lands past the peak", () => {
    const dist = { 1: 0.9, 2: 0.025, 3: 0.025, 4: 0.025, 5: 0.025 };
    const pick = sampleWithTemperature(() => 0.95, dist, 1);
    expect(pick).not.toBe(1);
  });
  it("τ=1 a low rng() draw lands on the peak (still probability-proportional)", () => {
    const dist = { 1: 0.9, 2: 0.025, 3: 0.025, 4: 0.025, 5: 0.025 };
    const pick = sampleWithTemperature(() => 0.01, dist, 1);
    expect(pick).toBe(1);
  });
  it("τ=0.6 sharpens toward the peak (samples value-1 MORE than its raw 40% share)", () => {
    const dist = { 1: 0.4, 2: 0.15, 3: 0.15, 4: 0.15, 5: 0.15 };
    let hits1 = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const rng = mulberry32Fn(i + 1);
      if (sampleWithTemperature(rng, dist, 0.6) === 1) hits1++;
    }
    expect(hits1 / N).toBeGreaterThan(0.45);
  });
});

describe("ai: predictors", () => {
  it("order1Predict catches a strict alternation", () => {
    const series = [1, 3, 1, 3, 1, 3, 1]; // last value 1 -> should predict 3 next
    const p = order1Predict(series, 20)!;
    expect(p.dist[3]).toBeGreaterThan(p.dist[1]);
  });
  it("order1Predict: too little data -> null", () => {
    expect(order1Predict([3], 20)).toBeNull();
  });
  it("order2Predict conditions on the last TWO values", () => {
    // series ends in (1,2); "1,2" has been followed by 3 twice before, with
    // enough decayed weight to clear the min-weight threshold.
    const series = [1, 2, 3, 4, 4, 1, 2, 3, 5, 5, 1, 2];
    const p2 = order2Predict(series, 20)!;
    expect(p2.dist[3]).toBeGreaterThan(p2.dist[1]);
  });
  it("order2Predict: below the min-weight threshold -> null (caller should back off)", () => {
    expect(order2Predict([1, 2, 3], 20)).toBeNull();
  });
  it("ngramWithBackoff falls back to order-1 when order-2 has too little data", () => {
    const series = [5, 5, 5, 5, null, 5];
    expect(ngramWithBackoff(series, 20)).not.toBeNull();
  });
  it("globalFreqPredict: all-same series -> all mass on that value", () => {
    const g = globalFreqPredict([2, 2, 2, 2, 2], 20)!;
    expect(g.dist[2]).toBe(1);
  });
  it("stickyModePredict: peaks fully on the mode", () => {
    const sm = stickyModePredict([2, 2, 2, 2, 2], 20)!;
    expect(sm.dist[2]).toBe(1);
    expect(Object.values(sm.dist).reduce((a, b) => a + b, 0)).toBe(1);
  });
  it("globalFreqPredict: empty series -> null", () => {
    expect(globalFreqPredict([], 20)).toBeNull();
  });
  it("winStayLoseShiftPredict needs a clean win/lose last-outcome signal", () => {
    const series = [3, 3, 4, 2, 2, 5];
    const verdicts: (VerdictWinner | null)[] = ["player", "player", "ai", "player", "player", "ai"];
    expect(winStayLoseShiftPredict(series, verdicts, 20)).not.toBeNull();
  });
  it("winStayLoseShiftPredict: last outcome parata -> null (no clean signal)", () => {
    expect(winStayLoseShiftPredict([3, 4], ["player", "parata"], 20)).toBeNull();
  });
});

function historyEntry(partial: Partial<HistoryEntry>): HistoryEntry {
  return { playerFingers: null, playerCall: null, aiFingers: null, aiCall: null, verdictWinner: null, ...partial };
}

describe("ai: L1 — designed to be read", () => {
  it("fingers sampled from the biased-toward-{2,5} distribution (not uniform)", () => {
    // cumulative: 1(.15) 2(.15+.30=.45) -> r=0.2 lands in bucket 2
    const move = decideMove("L1", createSequenceRandomSource([0.2]), []);
    expect(move.fingers).toBe(2);
  });
  it("over many draws, 2 and 5 together are favored well above the 40% a uniform split would give", () => {
    const rng = mulberry32Fn(7);
    let twos = 0, fives = 0;
    const N = 4000;
    const random: RandomSource = { next: rng };
    for (let i = 0; i < N; i++) {
      const m = decideMove("L1", random, []);
      if (m.fingers === 2) twos++;
      if (m.fingers === 5) fives++;
    }
    expect((twos + fives) / N).toBeGreaterThan(0.5);
  });
  it("repeats its last fingers after scoring, when the repeat-roll fires", () => {
    const history = [historyEntry({ throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 4, aiCall: 6, verdictWinner: "ai" })];
    const move = decideMove("L1", createSequenceRandomSource([0]), history); // rng()=0 always fires the repeat-roll
    expect(move.fingers).toBe(4);
  });
  it("does NOT repeat after losing (only after scoring) — falls straight to the biased draw", () => {
    const history = [historyEntry({ throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 4, aiCall: 6, verdictWinner: "player" })]; // AI LOST
    const move = decideMove("L1", createSequenceRandomSource([0]), history);
    expect(move.fingers).toBe(1); // r=0 on the biased draw lands on bucket 1, never touching last.aiFingers (4)
  });
});

describe("ai: L2 aim ~20% vs a uniform simulated player (χ² sanity)", () => {
  it("aim rate is close to the 20% baseline against a uniform player", () => {
    const rng = mulberry32Fn(42);
    const random: RandomSource = { next: rng };
    const N = 3000;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      const actualPlayerF = 1 + Math.floor(rng() * 5);
      const move = decideMove("L2", random, []);
      if (move.guessPlayerFingers === actualPlayerF) hits++;
    }
    expect(Math.abs(hits / N - 0.2)).toBeLessThan(0.03);
  });
});

function runScriptedMatch(level: string, scriptedPlayerF: number, throwsCount: number, seed: number) {
  const rng = mulberry32Fn(seed);
  const random: RandomSource = { next: rng };
  const history: HistoryEntry[] = [];
  let hits = 0;
  const hitsByThrow: boolean[] = [];
  for (let i = 0; i < throwsCount; i++) {
    const move = decideMove(level, random, history);
    const hit = move.guessPlayerFingers === scriptedPlayerF;
    if (hit) hits++;
    hitsByThrow.push(hit);
    const verdictWinner: VerdictWinner = hit ? "ai" : rng() < 0.3 ? "player" : "parata";
    history.push(historyEntry({
      throwIndex: i + 1, playerFingers: scriptedPlayerF, playerCall: scriptedPlayerF + (1 + Math.floor(rng() * 5)),
      aiFingers: move.fingers, aiCall: move.call, verdictWinner,
    }));
  }
  return { hits, rate: hits / throwsCount, hitsByThrow };
}

describe("ai: L3/L4 aim >30% vs a scripted, strongly-biased player within 30 throws", () => {
  it("L3 aim vs an always-throws-5 player climbs above 30% within 30 throws", () => {
    const { hitsByThrow } = runScriptedMatch("L3", 5, 30, 1);
    const lateRate = hitsByThrow.slice(15).filter(Boolean).length / hitsByThrow.slice(15).length;
    expect(lateRate).toBeGreaterThan(0.3);
  });
  it("L4 aim vs an always-throws-5 player climbs above 30% within 30 throws", () => {
    const { hitsByThrow } = runScriptedMatch("L4", 5, 30, 2);
    const lateRate = hitsByThrow.slice(15).filter(Boolean).length / hitsByThrow.slice(15).length;
    expect(lateRate).toBeGreaterThan(0.3);
  });
});

describe("ai: L4 >= L2 vs a pure-random player (the equilibrium floor)", () => {
  it("L4's aim rate is not meaningfully below L2's", () => {
    const TRIALS = 6, THROWS = 400;
    let l2Total = 0, l4Total = 0;
    for (let t = 0; t < TRIALS; t++) {
      const rngPlayer = mulberry32Fn(1000 + t);
      const rngL2 = mulberry32Fn(2000 + t);
      const rngL4 = mulberry32Fn(2000 + t); // SAME seed as L2 so both face the identical player sequence
      const randomL2: RandomSource = { next: rngL2 };
      const randomL4: RandomSource = { next: rngL4 };
      const playerSeq: number[] = [];
      for (let i = 0; i < THROWS; i++) playerSeq.push(1 + Math.floor(rngPlayer() * 5));

      let l2Hits = 0;
      for (let i = 0; i < THROWS; i++) {
        const m = decideMove("L2", randomL2, []);
        if (m.guessPlayerFingers === playerSeq[i]) l2Hits++;
      }

      let l4Hits = 0;
      const history: HistoryEntry[] = [];
      for (let i = 0; i < THROWS; i++) {
        const m = decideMove("L4", randomL4, history);
        const hit = m.guessPlayerFingers === playerSeq[i];
        if (hit) l4Hits++;
        history.push(historyEntry({ throwIndex: i + 1, playerFingers: playerSeq[i]!, playerCall: playerSeq[i]! + 3, aiFingers: m.fingers, aiCall: m.call, verdictWinner: hit ? "ai" : "parata" }));
      }
      l2Total += l2Hits;
      l4Total += l4Hits;
    }
    const l2Rate = l2Total / (TRIALS * THROWS), l4Rate = l4Total / (TRIALS * THROWS);
    expect(l4Rate).toBeGreaterThan(l2Rate - 0.03);
  });
});

describe("ai: L4 anti-aim — own fingers avoid the player's predicted guess", () => {
  it("lands on the player's well-established guess (3) far less than uniform 20%", () => {
    const rng = mulberry32Fn(9);
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 25; i++) {
      const playerFingers = 1 + Math.floor(rng() * 5);
      history.push(historyEntry({ throwIndex: i + 1, playerFingers, playerCall: playerFingers + 3, aiFingers: 1, aiCall: 4, verdictWinner: "parata" }));
    }
    const sampleRng = mulberry32Fn(11);
    const randomSample: RandomSource = { next: sampleRng };
    let hitsOn3 = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const m = decideMove("L4", randomSample, history);
      if (m.fingers === 3) hitsOn3++;
    }
    expect(hitsOn3 / N).toBeLessThan(0.16);
  });
});

describe("ai: commit purity — identical (level, rng-sequence, history) -> identical decision", () => {
  it.each(LEVEL_ORDER)("is pure for %s", (level) => {
    const history = [
      historyEntry({ throwIndex: 1, playerFingers: 3, playerCall: 7, aiFingers: 2, aiCall: 5, verdictWinner: "player" }),
      historyEntry({ throwIndex: 2, playerFingers: 5, playerCall: 8, aiFingers: 3, aiCall: 6, verdictWinner: "ai" }),
    ];
    const m1 = decideMove(level, createSeededRandomSource(123), history, null);
    const m2 = decideMove(level, createSeededRandomSource(123), history, null);
    expect(m1).toEqual(m2);
  });
});

describe("ai: predictPlayerF — the no-rng, replayable read", () => {
  it("L1 doesn't read the player -> uniform, no lambda", () => {
    expect(predictPlayerF("L1", [])).toEqual({ dist: UNIFORM_DIST, lambda: null, predictorWeights: null });
  });
  it("L2 doesn't read the player -> uniform, no lambda", () => {
    expect(predictPlayerF("L2", [])).toEqual({ dist: UNIFORM_DIST, lambda: null, predictorWeights: null });
  });
  it("L3 sharpens toward a consistent player's value", () => {
    const history = Array.from({ length: 4 }, () => historyEntry({ playerFingers: 5, verdictWinner: null }));
    const l3 = predictPlayerF("L3", history);
    expect(l3.dist[5]).toBeGreaterThan(0.2);
    expect(l3.lambda).toBeGreaterThan(0);
    expect(l3.predictorWeights).toBeNull();
  });
  it("L4 sharpens toward a consistent player's value too, and exposes predictorWeights", () => {
    const history = Array.from({ length: 4 }, () => historyEntry({ playerFingers: 5, verdictWinner: null }));
    const l4 = predictPlayerF("L4", history);
    expect(l4.dist[5]).toBeGreaterThan(0.2);
    expect(l4.lambda).toBeGreaterThan(0);
    expect(Object.keys(l4.predictorWeights ?? {}).length).toBeGreaterThan(0);
  });
  it("unknown level falls back to uniform (never throws)", () => {
    expect(predictPlayerF("bogus", [historyEntry({ playerFingers: 3 })])).toEqual({ dist: UNIFORM_DIST, lambda: null, predictorWeights: null });
  });
});

// deterministic seeded PRNG for reproducible statistical tests (Math.random
// is banned in this package by the purity gate, and isn't seedable anyway).
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
