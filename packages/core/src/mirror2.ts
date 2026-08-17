// mirror2.ts — L'Espill v2's statistics library (docs/espill-brainstorm.md
// §1–2). Pure functions over the SAME history the rival reads. Every
// statistic answers "what could a rival predict?" or "what can you predict
// about the rival?"; the ranking at the end prices each of the rival's own
// predictors in points per 100 rounds by replaying El Rei's real read with
// that predictor removed. No formatting here — L'Espill formats.
//
// Conventions: f = the player's fingers, g = the player's guess (call − f,
// 1..5 only), af/ag = the rival's fingers/guess, w = the verdict. Rows come
// from ai2's toRows so the mirror and the rival see the same data the same
// way. Every table carries its sample count; consumers hide thin evidence.
import {
  antiAim, bmaBelief, contextPredict, F_EXTRAS, F_PREDICTORS, G_PREDICTORS, jointGPredict, playerHitRate, predictPlayerFV2,
  toRows, V2_TUNING, type ContextPredictor, type ExtraPredictor, type Row,
} from "./ai2.js";
import type { FingerDistribution, HistoryEntry } from "./types.js";

const V = [1, 2, 3, 4, 5] as const;
type Fv = 1 | 2 | 3 | 4 | 5;
const LOG2 = Math.log(2);
const log2 = (x: number) => Math.log(x) / LOG2;

/** A count/rate pair — the evidence behind every sentence. */
export interface Rate { n: number; hits: number; rate: number | null }
const rate = (hits: number, n: number): Rate => ({ n, hits, rate: n ? hits / n : null });

function fSeries(rows: readonly Row[]): number[] {
  return rows.map((r) => r.f).filter((f): f is Fv => f != null);
}
function entropyBits(counts: Record<string | number, number>): number {
  let t = 0;
  for (const k in counts) t += counts[k]!;
  if (!t) return 0;
  let h = 0;
  for (const k in counts) { const p = counts[k]! / t; if (p > 0) h -= p * log2(p); }
  return h;
}

// ------------------------------------------------------------ 1.1 sequence structure
export interface Order2Stats {
  n: number;
  /** top triples (a,b → c) by count, with the conditional probability */
  triples: { a: number; b: number; c: number; count: number; contextCount: number; p: number }[];
  /** H(f | f-1) and H(f | f-2, f-1) in bits, per symbol; uniform is 2.32 */
  h1: number; h2: number; hMax: number;
}
export function computeOrder2(history: readonly HistoryEntry[]): Order2Stats {
  const f = fSeries(toRows(history));
  const pair: Record<string, number> = {}, tri: Record<string, number> = {}, one: Record<string, number> = {}, two: Record<string, number> = {};
  for (let i = 1; i < f.length; i++) { pair[`${f[i - 1]}>${f[i]}`] = (pair[`${f[i - 1]}>${f[i]}`] ?? 0) + 1; one[f[i - 1]!] = (one[f[i - 1]!] ?? 0) + 1; }
  for (let i = 2; i < f.length; i++) { const k = `${f[i - 2]},${f[i - 1]}`; tri[`${k}>${f[i]}`] = (tri[`${k}>${f[i]}`] ?? 0) + 1; two[k] = (two[k] ?? 0) + 1; }
  // conditional entropies: H(Y|X) = Σ p(x) H(Y|x)
  const cond = (joint: Record<string, number>, ctx: Record<string, number>) => {
    let n = 0; for (const k in ctx) n += ctx[k]!;
    if (!n) return 0;
    let h = 0;
    for (const c in ctx) {
      const sub: Record<string, number> = {};
      for (const k in joint) if (k.startsWith(c + ">")) sub[k] = joint[k]!;
      h += (ctx[c]! / n) * entropyBits(sub);
    }
    return h;
  };
  const triples = Object.entries(tri).map(([k, count]) => {
    const [ctx, c] = k.split(">") as [string, string];
    const [a, b] = ctx.split(",").map(Number) as [number, number];
    return { a, b, c: Number(c), count, contextCount: two[ctx]!, p: count / two[ctx]! };
  }).sort((x, y) => y.count - x.count || y.p - x.p);
  return { n: Math.max(0, f.length - 2), triples, h1: cond(pair, one), h2: cond(tri, two), hMax: log2(5) };
}

export interface StepStats {
  n: number;
  /** distribution of Δ = f_t − f_{t−1}, keys −4..4 */
  delta: Record<number, number>;
  pStay: number | null; pStepOne: number | null; pBigJump: number | null; // |Δ|=0, |Δ|=1, |Δ|≥3
  /** P(rise | just rose), P(fall | just fell) — the staircase */
  riseAfterRise: Rate; fallAfterFall: Rate;
}
export function computeSteps(history: readonly HistoryEntry[]): StepStats {
  const f = fSeries(toRows(history));
  const delta: Record<number, number> = {}; for (let d = -4; d <= 4; d++) delta[d] = 0;
  let stay = 0, one = 0, big = 0, rr = 0, rrN = 0, ff = 0, ffN = 0;
  for (let i = 1; i < f.length; i++) {
    const d = f[i]! - f[i - 1]!; delta[d]!++;
    if (d === 0) stay++; else if (Math.abs(d) === 1) one++; else if (Math.abs(d) >= 3) big++;
    if (i >= 2) { const pd = f[i - 1]! - f[i - 2]!; if (pd > 0) { rrN++; if (d > 0) rr++; } if (pd < 0) { ffN++; if (d < 0) ff++; } }
  }
  const n = Math.max(0, f.length - 1);
  return { n, delta, pStay: n ? stay / n : null, pStepOne: n ? one / n : null, pBigJump: n ? big / n : null, riseAfterRise: rate(rr, rrN), fallAfterFall: rate(ff, ffN) };
}

export type Regime = "low" | "mid" | "high";
export const regimeOf = (f: number): Regime => (f <= 2 ? "low" : f >= 4 ? "high" : "mid");
export interface RegimeStats {
  n: number;
  share: Record<Regime, number>;
  /** P(next regime | current regime), rows sum to 1 */
  transition: Record<Regime, Record<Regime, number>>;
  /** run lengths inside low / high: mean and the distribution */
  dwell: Record<"low" | "high", { mean: number | null; runs: number; dist: Record<number, number> }>;
  /** P(leave | k consecutive throws in the regime), k = 1..4 — the hazard */
  leaveHazard: Record<"low" | "high", Record<number, Rate>>;
}
export function computeRegimes(history: readonly HistoryEntry[]): RegimeStats {
  const f = fSeries(toRows(history));
  const R: Regime[] = ["low", "mid", "high"];
  const share = { low: 0, mid: 0, high: 0 } as Record<Regime, number>;
  const tr = {} as Record<Regime, Record<Regime, number>>;
  for (const a of R) { tr[a] = { low: 0, mid: 0, high: 0 }; }
  const regs = f.map(regimeOf);
  for (const r of regs) share[r]++;
  for (let i = 1; i < regs.length; i++) tr[regs[i - 1]!]![regs[i]!]++;
  const transition = {} as Record<Regime, Record<Regime, number>>;
  for (const a of R) { const t = R.reduce((s, b) => s + tr[a]![b], 0); transition[a] = { low: 0, mid: 0, high: 0 }; for (const b of R) transition[a]![b] = t ? tr[a]![b] / t : 0; }
  const dwell = { low: { mean: null as number | null, runs: 0, dist: {} as Record<number, number> }, high: { mean: null as number | null, runs: 0, dist: {} as Record<number, number> } };
  const hazard = { low: {} as Record<number, Rate>, high: {} as Record<number, Rate> };
  const hz = { low: {} as Record<number, [number, number]>, high: {} as Record<number, [number, number]> };
  for (const side of ["low", "high"] as const) {
    let run = 0; const runs: number[] = [];
    for (let i = 0; i < regs.length; i++) {
      if (regs[i] === side) {
        run++;
        // hazard: after `run` throws inside, does the next one leave?
        if (i + 1 < regs.length && run <= 4) { const h = (hz[side][run] ??= [0, 0]); h[1]++; if (regs[i + 1] !== side) h[0]++; }
      } else if (run > 0) { runs.push(run); run = 0; }
    }
    if (run > 0) runs.push(run);
    dwell[side].runs = runs.length;
    dwell[side].mean = runs.length ? runs.reduce((s, x) => s + x, 0) / runs.length : null;
    for (const r of runs) dwell[side].dist[r] = (dwell[side].dist[r] ?? 0) + 1;
    for (let k = 1; k <= 4; k++) { const h = hz[side][k]; hazard[side][k] = h ? rate(h[0], h[1]) : rate(0, 0); }
  }
  const n = f.length;
  for (const r of R) share[r] = n ? share[r] / n : 0;
  return { n, share, transition, dwell, leaveHazard: hazard };
}

export interface ReturnTimeStats {
  n: number;
  /** per digit: rounds since last thrown (null = never), mean gap between throws, and P(throw d | gap ≥ 5) vs the base rate */
  perDigit: Record<number, { since: number | null; meanGap: number | null; base: number | null; afterLongGap: Rate }>;
  /** the "deck" tell: P(a digit repeats before all five have appeared) — low means you cycle through the deck */
  coverageCycles: Rate;
}
export function computeReturnTimes(history: readonly HistoryEntry[]): ReturnTimeStats {
  const f = fSeries(toRows(history));
  const perDigit = {} as ReturnTimeStats["perDigit"];
  for (const d of V) {
    const idx: number[] = []; f.forEach((x, i) => { if (x === d) idx.push(i); });
    const gaps = idx.slice(1).map((x, i) => x - idx[i]!);
    let longN = 0, longHit = 0; let last = -Infinity;
    for (let i = 0; i < f.length; i++) { const gap = i - last; if (gap >= 5 && last > -Infinity) { longN++; if (f[i] === d) longHit++; } if (f[i] === d) last = i; }
    perDigit[d] = { since: idx.length ? f.length - 1 - idx[idx.length - 1]! : null, meanGap: gaps.length ? gaps.reduce((s, x) => s + x, 0) / gaps.length : null, base: f.length ? idx.length / f.length : null, afterLongGap: rate(longHit, longN) };
  }
  // deck: walk windows; a "cycle" completes when all 5 seen; count whether a repeat happened before completion
  let seen = new Set<number>(), cycles = 0, repeatsBefore = 0;
  for (const x of f) { if (seen.has(x)) { repeatsBefore++; seen = new Set([x]); continue; } seen.add(x); if (seen.size === 5) { cycles++; seen = new Set(); } }
  return { n: f.length, perDigit, coverageCycles: rate(repeatsBefore, repeatsBefore + cycles) };
}

export interface LoopStats {
  n: number;
  bounce: Rate; // f_t == f_{t-2}
  /** match rate at lag k (P(f_t == f_{t-k})) vs the rate expected from your own marginal */
  autocorr: Record<number, { rate: number | null; expected: number | null; n: number }>;
  runLengths: Record<number, number>; longestRun: number;
}
export function computeLoops(history: readonly HistoryEntry[]): LoopStats {
  const f = fSeries(toRows(history));
  const counts: Record<number, number> = {}; for (const x of f) counts[x] = (counts[x] ?? 0) + 1;
  const expected = f.length ? V.reduce((s, v) => s + Math.pow((counts[v] ?? 0) / f.length, 2), 0) : null;
  const autocorr: LoopStats["autocorr"] = {};
  for (let k = 1; k <= 6; k++) { let n = 0, m = 0; for (let i = k; i < f.length; i++) { n++; if (f[i] === f[i - k]) m++; } autocorr[k] = { rate: n ? m / n : null, expected, n }; }
  let b = 0, bN = 0; for (let i = 2; i < f.length; i++) { bN++; if (f[i] === f[i - 2]) b++; }
  const runLengths: Record<number, number> = {}; let run = 1, longest = f.length ? 1 : 0;
  for (let i = 1; i <= f.length; i++) { if (i < f.length && f[i] === f[i - 1]) run++; else { runLengths[run] = (runLengths[run] ?? 0) + 1; longest = Math.max(longest, run); run = 1; } }
  return { n: f.length, bounce: rate(b, bN), autocorr, runLengths, longestRun: longest };
}

// ------------------------------------------------------------ 1.2 the call channel
export interface WeldStats {
  n: number;
  /** p(g | f), with per-f sample counts and the favourite call (f+g) */
  gGivenF: Record<number, { n: number; dist: FingerDistribution | null; favouriteG: number | null; favouriteP: number | null }>;
  /** mutual information I(f;g) in bits — 0 = the call is free of the fingers */
  mutualInfoBits: number | null;
  totals: Record<number, number>; neverCalled: number[];
  totAvoidance: Rate; // P(g = 5 | f = 5): "tot" (10) — humans avoid it
}
export function computeWeld(history: readonly HistoryEntry[]): WeldStats {
  const rows = toRows(history).filter((r) => r.f != null && r.g != null) as (Row & { f: Fv; g: Fv })[];
  const joint: Record<string, number> = {}, cf: Record<number, number> = {}, cg: Record<number, number> = {};
  const totals: Record<number, number> = {}; for (let t = 2; t <= 10; t++) totals[t] = 0;
  for (const r of rows) { joint[`${r.f},${r.g}`] = (joint[`${r.f},${r.g}`] ?? 0) + 1; cf[r.f] = (cf[r.f] ?? 0) + 1; cg[r.g] = (cg[r.g] ?? 0) + 1; totals[r.f + r.g]!++; }
  const gGivenF = {} as WeldStats["gGivenF"];
  for (const f of V) {
    const n = cf[f] ?? 0;
    if (!n) { gGivenF[f] = { n: 0, dist: null, favouriteG: null, favouriteP: null }; continue; }
    const d = {} as FingerDistribution; let best: Fv = 1;
    for (const g of V) { d[g] = (joint[`${f},${g}`] ?? 0) / n; if (d[g] > d[best]) best = g; }
    gGivenF[f] = { n, dist: d, favouriteG: best, favouriteP: d[best] };
  }
  const n = rows.length;
  let mi: number | null = null;
  if (n) { mi = 0; for (const f of V) for (const g of V) { const pxy = (joint[`${f},${g}`] ?? 0) / n; if (pxy > 0) mi += pxy * log2(pxy / (((cf[f] ?? 0) / n) * ((cg[g] ?? 0) / n))); } }
  const neverCalled = Object.keys(totals).map(Number).filter((t) => totals[t] === 0);
  const f5 = rows.filter((r) => r.f === 5);
  return { n, gGivenF, mutualInfoBits: mi, totals, neverCalled, totAvoidance: rate(f5.filter((r) => r.g === 5).length, f5.length) };
}

export interface GuessStats {
  n: number;
  repeatG: Rate;
  chase: Rate;        // g == rival's previous fingers (T2)
  chaseTwoBack: Rate; // g == rival's fingers two rounds ago
  echoRivalGuess: Rate; // g == rival's previous guess
  /** after a wrong guess: same again (stubborn) vs moved */
  stubbornAfterMiss: Rate;
  /** after a near miss (|g − af| = 1): next g steps toward it by exactly one */
  nearMissAdjust: Rate;
}
export function computeGuessStats(history: readonly HistoryEntry[]): GuessStats {
  const rows = toRows(history);
  let rep = 0, repN = 0, ch = 0, chN = 0, c2 = 0, c2N = 0, ec = 0, ecN = 0, st = 0, stN = 0, nm = 0, nmN = 0, n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!, p = i >= 1 ? rows[i - 1]! : null, pp = i >= 2 ? rows[i - 2]! : null;
    if (r.g == null) continue; n++;
    if (p?.g != null) { repN++; if (r.g === p.g) rep++; }
    if (p?.af != null) { chN++; if (r.g === p.af) ch++; }
    if (pp?.af != null) { c2N++; if (r.g === pp.af) c2++; }
    if (p?.ag != null) { ecN++; if (r.g === p.ag) ec++; }
    if (p?.g != null && p.af != null && p.g !== p.af) { stN++; if (r.g === p.g) st++; if (Math.abs(p.g - p.af) === 1) { nmN++; if (r.g === p.af) nm++; } }
  }
  return { n, repeatG: rate(rep, repN), chase: rate(ch, chN), chaseTwoBack: rate(c2, c2N), echoRivalGuess: rate(ec, ecN), stubbornAfterMiss: rate(st, stN), nearMissAdjust: rate(nm, nmN) };
}

// ------------------------------------------------------------ 1.3 outcome-conditioned
export interface OutcomeStats {
  n: number;
  /** P(change f | previous verdict) and P(change g | previous verdict) */
  shiftF: Record<"player" | "ai" | "parata", Rate>;
  shiftG: Record<"player" | "ai" | "parata", Rate>;
  /** after the rival guessed your fingers (read), P(change f) — vs when it missed */
  shiftAfterRead: Rate; shiftAfterNotRead: Rate;
  /** after you hit its fingers, P(same g again) */
  chaseOwnSuccess: Rate;
  /** tilt: after two consecutive losses, H1 of the next throws vs overall H1 (bits) */
  tilt: { afterTwoLosses: { n: number; h: number | null }; overall: { n: number; h: number | null } };
}
export function computeOutcomeStats(history: readonly HistoryEntry[]): OutcomeStats {
  const rows = toRows(history);
  const sf = { player: [0, 0], ai: [0, 0], parata: [0, 0] } as Record<"player" | "ai" | "parata", [number, number]>;
  const sg = { player: [0, 0], ai: [0, 0], parata: [0, 0] } as Record<"player" | "ai" | "parata", [number, number]>;
  let ar = 0, arN = 0, anr = 0, anrN = 0, co = 0, coN = 0;
  const tiltCounts: Record<number, number> = {}, allCounts: Record<number, number> = {}; let tiltN = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!, p = rows[i - 1]!;
    if (r.f == null || p.f == null) continue;
    allCounts[r.f] = (allCounts[r.f] ?? 0) + 1;
    if (p.w) { sf[p.w][1]++; if (r.f !== p.f) sf[p.w][0]++; if (r.g != null && p.g != null) { sg[p.w][1]++; if (r.g !== p.g) sg[p.w][0]++; } }
    if (p.ag != null) { if (p.ag === p.f) { arN++; if (r.f !== p.f) ar++; } else { anrN++; if (r.f !== p.f) anr++; } }
    if (p.g != null && p.af != null && r.g != null && p.g === p.af) { coN++; if (r.g === p.g) co++; }
    if (i >= 2 && rows[i - 2]!.w === "ai" && p.w === "ai") { tiltN++; tiltCounts[r.f] = (tiltCounts[r.f] ?? 0) + 1; }
  }
  const R = (k: "player" | "ai" | "parata") => rate(sf[k][0], sf[k][1]);
  const G = (k: "player" | "ai" | "parata") => rate(sg[k][0], sg[k][1]);
  const allN = Object.values(allCounts).reduce((s, x) => s + x, 0);
  return {
    n: rows.length,
    shiftF: { player: R("player"), ai: R("ai"), parata: R("parata") },
    shiftG: { player: G("player"), ai: G("ai"), parata: G("parata") },
    shiftAfterRead: rate(ar, arN), shiftAfterNotRead: rate(anr, anrN), chaseOwnSuccess: rate(co, coN),
    tilt: { afterTwoLosses: { n: tiltN, h: tiltN >= 5 ? entropyBits(tiltCounts) : null }, overall: { n: allN, h: allN ? entropyBits(allCounts) : null } },
  };
}

// ------------------------------------------------------------ 1.4 rival-conditioned
export interface ReactivityStats {
  n: number;
  avoidRivalGuess: Rate;   // P(f == the number the rival just called on you) — under 20% = you avoid it (readable too)
  mirrorRivalFingers: Rate; // P(f == rival's previous fingers)
  /** P(f | rival's previous fingers) table, for the heatmap */
  fGivenRivalPrevF: Record<number, { n: number; dist: FingerDistribution | null }>;
}
export function computeReactivity(history: readonly HistoryEntry[]): ReactivityStats {
  const rows = toRows(history);
  let ag = 0, agN = 0, mi = 0, miN = 0, n = 0;
  const tab: Record<number, Record<number, number>> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!, p = rows[i - 1]!;
    if (r.f == null) continue; n++;
    if (p.ag != null) { agN++; if (r.f === p.ag) ag++; }
    if (p.af != null) { miN++; if (r.f === p.af) mi++; (tab[p.af] ??= {})[r.f] = (tab[p.af]![r.f] ?? 0) + 1; }
  }
  const fGivenRivalPrevF = {} as ReactivityStats["fGivenRivalPrevF"];
  for (const a of V) { const t = tab[a]; const tot = t ? Object.values(t).reduce((s, x) => s + x, 0) : 0; if (!tot) { fGivenRivalPrevF[a] = { n: 0, dist: null }; continue; } const d = {} as FingerDistribution; for (const v of V) d[v] = (t![v] ?? 0) / tot; fGivenRivalPrevF[a] = { n: tot, dist: d }; }
  return { n, avoidRivalGuess: rate(ag, agN), mirrorRivalFingers: rate(mi, miN), fGivenRivalPrevF };
}

// ------------------------------------------------------------ 1.5 you as a reader
export interface ReaderStats {
  n: number;
  hitRivalFingers: Rate;                       // g == af
  byLevel: Record<string, Rate>;
  feeding: Rate;                               // f == ag: you threw where it looked
  /** rival's aim on you, for the same rounds (its read of you) */
  rivalHitYou: Rate;
  /** best FIXED guess against this rival's fingers (its empirical marginal): the floor of what a reader could get */
  fixedGuessCeiling: { digit: number | null; rate: number | null };
}
export function computeReaderStats(history: readonly HistoryEntry[]): ReaderStats {
  const rows = toRows(history);
  let n = 0, hit = 0, feedN = 0, feed = 0, ra = 0, raN = 0;
  const byLevel: Record<string, [number, number]> = {};
  const afCounts: Record<number, number> = {}; let afN = 0;
  history.forEach((h, i) => {
    const r = rows[i]!;
    if (r.af != null) { afCounts[r.af] = (afCounts[r.af] ?? 0) + 1; afN++; }
    if (r.g != null && r.af != null) { n++; if (r.g === r.af) hit++; const lv = h.aiLevel ?? "?"; const b = (byLevel[lv] ??= [0, 0]); b[1]++; if (r.g === r.af) b[0]++; }
    if (r.f != null && r.ag != null) { feedN++; if (r.f === r.ag) feed++; raN++; if (r.ag === r.f) ra++; }
  });
  let best: number | null = null;
  for (const v of V) if (afCounts[v] != null && (best == null || afCounts[v]! > afCounts[best]!)) best = v;
  const out: Record<string, Rate> = {}; for (const k in byLevel) out[k] = rate(byLevel[k]![0], byLevel[k]![1]);
  return { n, hitRivalFingers: rate(hit, n), byLevel: out, feeding: rate(feed, feedN), rivalHitYou: rate(ra, raN), fixedGuessCeiling: { digit: best, rate: best != null && afN ? afCounts[best]! / afN : null } };
}

// ------------------------------------------------------------ 1.6 timing & mechanics
export interface TimingStats {
  n: number;
  /** mean seconds between consecutive throws, by the fingers thrown (the timing tell) */
  intervalByF: Record<number, { n: number; meanS: number | null }>;
  /** mean sync delta (ms, voice − hand) by fingers */
  syncDeltaByF: Record<number, { n: number; meanMs: number | null }>;
  /** per call word: how often the round did NOT sync (voice missed/late) — the recognizer's weakness on YOU */
  missByWord: Record<string, Rate>;
  outcomes: Record<string, number>;
}
export function computeTiming(history: readonly HistoryEntry[]): TimingStats {
  const iv: Record<number, number[]> = {}, sd: Record<number, number[]> = {}, mw: Record<string, [number, number]> = {}, outcomes: Record<string, number> = {};
  let prevT: number | null = null, prevSession: string | null | undefined;
  for (const h of history) {
    const t = h.atIso ? Date.parse(h.atIso) : NaN;
    const f = h.playerFingers;
    if (Number.isFinite(t) && prevT != null && h.sessionId === prevSession && f != null && f >= 1 && f <= 5) { const dt = (t - prevT) / 1000; if (dt > 0.3 && dt < 30) (iv[f] ??= []).push(dt); }
    if (Number.isFinite(t)) { prevT = t; prevSession = h.sessionId; }
    if (f != null && f >= 1 && f <= 5 && h.syncDeltaMs != null) (sd[f] ??= []).push(h.syncDeltaMs);
    if (h.playerWord) { const m = (mw[h.playerWord] ??= [0, 0]); m[1]++; if (h.syncOutcome !== "synced") m[0]++; }
    if (h.syncOutcome) outcomes[h.syncOutcome] = (outcomes[h.syncOutcome] ?? 0) + 1;
  }
  const mean = (xs: number[] | undefined) => (xs && xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const intervalByF = {} as TimingStats["intervalByF"], syncDeltaByF = {} as TimingStats["syncDeltaByF"];
  for (const v of V) { intervalByF[v] = { n: iv[v]?.length ?? 0, meanS: mean(iv[v]) }; syncDeltaByF[v] = { n: sd[v]?.length ?? 0, meanMs: mean(sd[v]) }; }
  const missByWord: Record<string, Rate> = {}; for (const w in mw) missByWord[w] = rate(mw[w]![0], mw[w]![1]);
  return { n: history.length, intervalByF, syncDeltaByF, missByWord, outcomes };
}

// ------------------------------------------------------------ exploitability, v2
/** El Rei's real read, sequentially: predict row i from rows < i with
 * predictPlayerFV2 (L4), score the argmax. The v2 twin of mirror.ts's
 * computeExploitability (which replays the spike's L4). 20% = a coin.
 * Bounded to the last `cap` rows. */
export function computeExploitabilityV2(history: readonly HistoryEntry[], cap = 300): Rate {
  const rows = history.slice(-cap);
  let n = 0, hits = 0;
  for (let i = 5; i < rows.length; i++) {
    const f = rows[i]!.playerFingers; if (f == null || f < 1 || f > 5) continue;
    const d = predictPlayerFV2("L4", rows.slice(0, i)).dist;
    let best: Fv = 1; for (const v of V) if (d[v] > d[best]) best = v;
    n++; if (best === f) hits++;
  }
  return rate(hits, n);
}

// ------------------------------------------------------------ predictability by family
export interface FamilyPredictability { name: string; n: number; hits: number; rate: number | null }
/** Sequential argmax hit rate of each of the rival's own context predictors
 * on this history (predict row i from rows < i). 20% = a coin. The BMA's
 * weight vector, as evidence. */
export function computePredictabilityByFamily(history: readonly HistoryEntry[], predictors: readonly ContextPredictor[] = F_PREDICTORS): FamilyPredictability[] {
  const rows = toRows(history);
  return predictors.map((p) => {
    let n = 0, hits = 0;
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i]!; if (r.f == null) continue;
      const d = contextPredict(p, rows, i, "f"); if (!d) continue;
      let best: Fv = 1; for (const v of V) if (d[v] > d[best]) best = v;
      n++; if (best === r.f) hits++;
    }
    return { name: p.name, n, hits, rate: n ? hits / n : null };
  });
}

// ------------------------------------------------------------ 2. exploit value
export interface ExploitItem {
  name: string;
  /** STANDALONE: rival's expected points per 100 rounds reading with this predictor alone, minus a uniform aim — what this habit alone gives away. The ranking key. */
  pointsPer100: number;
  /** MARGINAL: full read minus the read without this predictor — small when other contexts cover the same habit */
  marginalPer100: number;
  aimAlone: number; aimWithout: number; // argmax hit rates
  n: number;
}
export interface ExploitRanking {
  n: number;
  /** the whole read: rival's expected points per 100 rounds vs a uniform aim */
  readValuePer100: number;
  rivalPer100: number; playerPer100: number; // with the full read
  items: ExploitItem[]; // descending
}
/** Replays El Rei's real read over this history — deterministic: argmax aim,
 * expected outcome from the anti-aim distribution — once with every
 * predictor and once per predictor removed, and prices each in points per
 * 100 rounds. Bounded by `cap` most recent rows (O(n²)). */
export function rankExploitValue(history: readonly HistoryEntry[], cap = 200): ExploitRanking {
  const all = toRows(history);
  const rows = all.slice(-cap);
  // The hide side once, per row, with the full read (it does not depend on
  // which f-predictor is under test): the probability the player's guess
  // lands on our fingers. Then every variant is an aim-only replay.
  const idx: number[] = []; const pHit: number[] = [];
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i]!; if (r.f == null || r.g == null) continue;
    const hist = rows.slice(0, i);
    const b = bmaBelief(hist, "f", F_PREDICTORS, F_EXTRAS);
    const q = bmaBelief(hist, "g", G_PREDICTORS, [{ name: "joint", fn: (rs, n) => jointGPredict(rs, n, b.dist) }]);
    const hr = playerHitRate(hist);
    const T = hr != null && hr > V2_TUNING.selfWatchThreshold ? V2_TUNING.antiTSelfWatch : V2_TUNING.antiT;
    idx.push(i); pHit.push(antiAim(q.dist, T)[r.g]);
  }
  const replay = (preds: readonly ContextPredictor[] | null, extras: readonly ExtraPredictor[]) => {
    let n = 0, aimHits = 0, rival = 0, player = 0;
    idx.forEach((i, k) => {
      const r = rows[i]!;
      let pAim = 0.2;
      if (preds) {
        const b = bmaBelief(rows.slice(0, i), "f", preds, extras);
        let guess: Fv = 1; for (const v of V) if (b.dist[v] > b.dist[guess]) guess = v;
        pAim = guess === r.f ? 1 : 0;
      }
      const ph = pHit[k]!;
      n++; aimHits += pAim; rival += pAim * (1 - ph); player += ph * (1 - pAim);
    });
    return { n, aim: n ? aimHits / n : 0, rival: n ? (100 * rival) / n : 0, player: n ? (100 * player) / n : 0 };
  };
  const full = replay(F_PREDICTORS, F_EXTRAS);
  const none = replay(null, []);
  const items: ExploitItem[] = [];
  const names = [...F_PREDICTORS.map((p) => p.name), ...F_EXTRAS.map((e) => e.name)];
  for (const name of names) {
    const alonePreds = F_PREDICTORS.filter((p) => p.name === name);
    const aloneExtras = F_EXTRAS.filter((e) => e.name === name);
    // an extra alone still needs a base predictor list for bmaBelief; the marginal is a fair stand-in
    const alone = replay(alonePreds.length ? alonePreds : F_PREDICTORS.filter((p) => p.name === "marginal"), aloneExtras);
    const without = replay(F_PREDICTORS.filter((p) => p.name !== name), F_EXTRAS.filter((e) => e.name !== name));
    items.push({ name, pointsPer100: alone.rival - none.rival, marginalPer100: full.rival - without.rival, aimAlone: alone.aim, aimWithout: without.aim, n: full.n });
  }
  items.sort((a, b) => b.pointsPer100 - a.pointsPer100);
  return { n: full.n, readValuePer100: full.rival - none.rival, rivalPer100: full.rival, playerPer100: full.player, items };
}

// ------------------------------------------------------------ windows (trends)
/** The last `size` rows and the `size` before them, for "last 30 vs previous 30". */
export function splitWindows(history: readonly HistoryEntry[], size = 30): { recent: HistoryEntry[]; previous: HistoryEntry[] } {
  const rows = history.filter((h) => h.playerFingers != null);
  return { recent: rows.slice(-size), previous: rows.slice(-2 * size, -size) };
}
