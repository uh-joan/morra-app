// ai2.ts — the v2 rival policy (2026-08-17). Same ladder, same (f, g)
// decomposition, same fairness invariants as ai.ts (pure function of
// (RandomSource, history); nothing about the pending throw). What changed,
// and why — every claim measured in docs/rival-intelligence-research.md
// over 1,202 logged rounds and re-measurable with scripts/eval-rival.mjs:
//
//   - CONTEXT PREDICTORS with Dirichlet(0.5) smoothing over the contexts
//     that actually predict humans here: marginal, decayed frequency,
//     order-1/2, the previous OUTCOME (win-shift: players repeat only 10%
//     after a round they won), the rival's previous fingers, the player's
//     previous guess, the previous total.
//   - SELECTION BY PREDICTIVE LOG-LOSS (Bayesian model averaging), not by
//     argmax hit-rate: which context reads THIS player is chosen online,
//     per profile — the data says it differs by person.
//   - JOINT ANTI-AIM: the player's call is welded to their fingers (f=2 →
//     call 4 at 39%, f=3 → 8 at 37%), so their guess is predicted as
//     q(g) = Σ_f p(f)·p(g|f) — sharper than the g marginal — and the rival
//     throws where the player is least likely to look.
//   - TEMPERATURE: measured, not designed. Calibrating τ from the model's
//     log-loss edge over uniform is implemented but did NOT activate on the
//     logged rounds — the ensemble's log-loss edge is ≈0 nats even where
//     its argmax hits 26% (the smoothed predictors are overconfident in
//     log-loss terms) — and early-match beliefs are nearly flat, so only a
//     cold τ converts the argmax edge into realized aim: τ 1 → 19% sampled
//     aim, 0.35 → 20%, 0.05 → 24%. So: fixed per level (L4 0.15, L3 0.5)
//     over an 8% uniform floor — the rival stays a mixed strategy. The
//     calibration stays a knob (edgeMode/tauGain, tauFixed* = null).
//   - SELF-WATCH: the player SEES the rival's fingers every round; if their
//     hit rate on them climbs, the rival widens its finger temperature.
//     "God does not tilt" made adaptive.
//
// ai.ts stays byte-identical to the spike (the conformance corpus pins its
// decideMove/predictPlayerF); L1/L2 here delegate to it. This module is the
// app's engine; ?rival=spike restores ai.ts for a field A/B.
import type { RandomSource } from "./ports/random-source.js";
import type { FingerDistribution, HistoryEntry, VerdictWinner } from "./types.js";
import { decideMove as decideMoveSpike, LEVELS, type AiMove } from "./ai.js";

const V = [1, 2, 3, 4, 5] as const;
type Fv = (typeof V)[number];
export type { AiMove };

// ------------------------------------------------------------ tuning
// Every knob in one mutable object so scripts/eval-rival.mjs can sweep them
// against the logged rounds (--tune k=v,...). The values shipped here are
// the ones that won the sweep; the sweep is the justification.
export const V2_TUNING = {
  alpha: 0.5,          // Dirichlet smoothing per context (5 oversmooths: aim 24 → 20.6)
  eta: 0.3,            // BMA sharpness over predictors (1 = Bayes; 0.3 hedges — measured +2 aim over 1.0)
  decay: 0.98,         // BMA / edge decay per round
  replayCap: 120,      // rows replayed for the log-likelihoods
  edgeMode: "loglik" as "loglik" | "hit", // what drives the temperature
  tauMin: 0.3,
  tauGain: 3.0,        // τ = clamp(1 − gain·edge, tauMin, 1)
  floor: 0.08,         // uniform floor mixed into every sampled distribution
  selfWatchThreshold: 0.24,
  selfWatchTau: 0.8,
  l3TauMin: 0.7,
  // anti-aim: fingers ∝ exp(−q(f)/antiT), then the uniform floor. Small T =
  // decisive (a 5-point gap in q is e^(0.05/T) ×). invert()+τ was too flat
  // to bite: normalized 1−q turns q=.30 vs .15 into .175 vs .21.
  antiT: 0.04,
  antiTSelfWatch: 0.12, // when the player is reading our fingers, hide less predictably
  // aim temperature: null = calibrated from the edge (edgeMode); a number
  // pins it. The design doc's L4 τ was 0.6, L3 1.0.
  tauFixedL3: 0.5 as number | null,
  tauFixedL4: 0.15 as number | null,
};
// ------------------------------------------------------------ smoothing
export const DIRICHLET_ALPHA = 0.5;
export const UNIFORM: FingerDistribution = { 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.2 };

function dirichlet(counts: Record<number, number>, alpha = V2_TUNING.alpha): FingerDistribution {
  let t = alpha * 5;
  for (const v of V) t += counts[v] ?? 0;
  const d = {} as FingerDistribution;
  for (const v of V) d[v] = ((counts[v] ?? 0) + alpha) / t;
  return d;
}
const inRange = (x: number | null | undefined): x is Fv => x != null && x >= 1 && x <= 5 && Number.isInteger(x);

// ------------------------------------------------------------ the rows
// The policy reads history as rows: the player's fingers f, their guess g
// (call − f, only when 1..5), the rival's fingers af, the verdict.
export interface Row { f: Fv | null; g: Fv | null; af: Fv | null; w: VerdictWinner | null }
export function toRows(history: readonly HistoryEntry[]): Row[] {
  return history.map((h) => {
    const f = inRange(h.playerFingers) ? h.playerFingers : null;
    const g = f != null && h.playerCall != null && inRange(h.playerCall - f) ? ((h.playerCall - f) as Fv) : null;
    const af = inRange(h.aiFingers) ? h.aiFingers : null;
    return { f, g, af, w: h.verdictWinner ?? null };
  });
}

// ------------------------------------------------------------ contexts
// A context function maps (rows, i) → the context in force BEFORE row i (or
// null when the history is too short). Predicting row n uses ctx(rows, n).
type Channel = "f" | "g";
type CtxFn = (rows: readonly Row[], i: number) => string | null;
export interface ContextPredictor { name: string; ctx: CtxFn; halfLife?: number; minSamples?: number }

const CONTEXTS: Record<string, CtxFn> = {
  marginal: () => "",
  freq: () => "", // same context as marginal, decayed (see halfLife)
  order1: (r, i) => (i >= 1 && r[i - 1]!.f != null ? `f${r[i - 1]!.f}` : null),
  order2: (r, i) => (i >= 2 && r[i - 1]!.f != null && r[i - 2]!.f != null ? `f${r[i - 2]!.f}${r[i - 1]!.f}` : null),
  prevOutcome: (r, i) => (i >= 1 && r[i - 1]!.w ? `w${r[i - 1]!.w}` : null),
  outcomePrevF: (r, i) => (i >= 1 && r[i - 1]!.w && r[i - 1]!.f != null ? `w${r[i - 1]!.w}f${r[i - 1]!.f}` : null),
  prevAiF: (r, i) => (i >= 1 && r[i - 1]!.af != null ? `a${r[i - 1]!.af}` : null),
  prevG: (r, i) => (i >= 1 && r[i - 1]!.g != null ? `g${r[i - 1]!.g}` : null),
  prevTotal: (r, i) => {
    if (i < 1) return null;
    const p = r[i - 1]!;
    return p.f != null && p.af != null ? `t${p.f + p.af}` : null;
  },
};
export const F_PREDICTORS: readonly ContextPredictor[] = [
  { name: "marginal", ctx: CONTEXTS.marginal! },
  { name: "freq", ctx: CONTEXTS.freq!, halfLife: 20 },
  { name: "order1", ctx: CONTEXTS.order1!, halfLife: 20 },
  { name: "order2", ctx: CONTEXTS.order2!, halfLife: 20, minSamples: 2 },
  { name: "prevOutcome", ctx: CONTEXTS.prevOutcome!, halfLife: 20 },
  { name: "outcomePrevF", ctx: CONTEXTS.outcomePrevF!, halfLife: 20, minSamples: 2 },
  { name: "prevAiF", ctx: CONTEXTS.prevAiF!, halfLife: 20 },
  { name: "prevG", ctx: CONTEXTS.prevG!, halfLife: 20 },
  { name: "prevTotal", ctx: CONTEXTS.prevTotal!, halfLife: 20 },
];
// The g channel: what the player will GUESS. Same contexts (order1 here
// conditions on the previous g), plus the joint f→g predictor below.
export const G_PREDICTORS: readonly ContextPredictor[] = [
  { name: "marginal", ctx: CONTEXTS.marginal! },
  { name: "freq", ctx: CONTEXTS.freq!, halfLife: 20 },
  { name: "prevG", ctx: CONTEXTS.prevG!, halfLife: 20 },
  { name: "prevAiF", ctx: CONTEXTS.prevAiF!, halfLife: 20 },
  { name: "prevOutcome", ctx: CONTEXTS.prevOutcome!, halfLife: 20 },
  { name: "order1", ctx: CONTEXTS.order1!, halfLife: 20 },
  { name: "prevTotal", ctx: CONTEXTS.prevTotal!, halfLife: 20 },
];

/** Dirichlet-smoothed distribution of `channel` at rows[n] given the
 * predictor's context, from rows[0..n). null when the context is unknown or
 * has fewer than minSamples matching rows. */
export function contextPredict(p: ContextPredictor, rows: readonly Row[], n: number, channel: Channel): FingerDistribution | null {
  const target = p.ctx(rows, n);
  if (target == null) return null;
  const counts: Record<number, number> = {};
  let samples = 0;
  for (let i = 0; i < n; i++) {
    const v = rows[i]![channel];
    if (v == null) continue;
    if (p.ctx(rows, i) !== target) continue;
    const w = p.halfLife ? Math.pow(0.5, (n - 1 - i) / p.halfLife) : 1;
    counts[v] = (counts[v] ?? 0) + w;
    samples++;
  }
  if (samples < (p.minSamples ?? 1)) return null;
  return dirichlet(counts);
}

/** A fixed hedge: the mean of order-1 and marginal. On the logged rounds it
 * out-aims every single context AND the BMA over them (26.8% vs 24.7%): the
 * human is better described by a mixture than by any one context. Offered
 * to the BMA as a candidate so it can pick it. */
export function blendO1Marginal(rows: readonly Row[], n: number): FingerDistribution | null {
  const a = contextPredict(F_PREDICTORS[2]!, rows, n, "f"); // order1
  const b = contextPredict(F_PREDICTORS[0]!, rows, n, "f"); // marginal
  if (!a && !b) return null;
  if (!a) return b; if (!b) return a;
  const d = {} as FingerDistribution;
  for (const v of V) d[v] = 0.5 * a[v] + 0.5 * b[v];
  return d;
}
export const F_EXTRAS: readonly ExtraPredictor[] = [{ name: "blend", fn: blendO1Marginal }];

/** The joint predictor for the g channel: q(g) = Σ_f p̂(f)·p(g|f), where
 * p̂ is the rival's own current read of the player's fingers and p(g|f) is
 * Dirichlet-smoothed over the rows where the player threw f. */
export function jointGPredict(rows: readonly Row[], n: number, fBelief: FingerDistribution): FingerDistribution | null {
  const byF: Record<number, Record<number, number>> = {};
  let any = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    if (r.f == null || r.g == null) continue;
    (byF[r.f] ??= {})[r.g] = ((byF[r.f] ?? {})[r.g] ?? 0) + 1;
    any++;
  }
  if (any < 3) return null;
  const q = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as FingerDistribution;
  for (const f of V) {
    const d = byF[f] ? dirichlet(byF[f]!) : UNIFORM;
    for (const g of V) q[g] += fBelief[f] * d[g];
  }
  return q;
}

// ------------------------------------------------------------ BMA
export const BMA_DECAY = 0.98;
export const BMA_ETA = 1.0;
export const BMA_REPLAY_CAP = 120; // rows of retrospective replay for the log-likelihoods

export interface Belief { dist: FingerDistribution; weights: Record<string, number>; edge: number; n: number }

/** Bayesian model averaging over the predictors: each is weighted by
 * exp(η · decayed Σ log p_i(actual)) over the last BMA_REPLAY_CAP rows —
 * how well it PREDICTED, not whether its argmax hit. Also returns the
 * ensemble's decayed log-loss EDGE over uniform (nats), which drives the
 * temperature. With no history: uniform, edge 0. */
export interface ExtraPredictor { name: string; fn: (rows: readonly Row[], n: number) => FingerDistribution | null }
export function bmaBelief(rows: readonly Row[], channel: Channel, predictors: readonly ContextPredictor[], extras: readonly ExtraPredictor[] = []): Belief {
  const n = rows.length;
  const names = predictors.map((p) => p.name).concat(extras.map((e) => e.name));
  const ll: Record<string, number> = {};
  for (const nm of names) ll[nm] = 0;
  let edgeAcc = 0, edgeW = 0;
  const start = Math.max(1, n - V2_TUNING.replayCap);
  for (let i = start; i < n; i++) {
    const actual = rows[i]![channel];
    if (actual == null) continue;
    // ensemble prediction at i from weights so far → its own log-loss edge
    const ws = names.map((nm) => Math.exp(V2_TUNING.eta * ll[nm]!));
    const wt = ws.reduce((a, b) => a + b, 0) || 1;
    let pEns = 0;
    predictors.forEach((p, k) => {
      const d = contextPredict(p, rows, i, channel);
      const pi = d ? d[actual] : 0.2;
      pEns += (ws[k]! / wt) * pi;
      ll[p.name] = V2_TUNING.decay * ll[p.name]! + Math.log(Math.max(pi, 1e-6));
    });
    extras.forEach((e, k) => {
      const d = e.fn(rows, i);
      const pi = d ? d[actual] : 0.2;
      pEns += (ws[predictors.length + k]! / wt) * pi;
      ll[e.name] = V2_TUNING.decay * ll[e.name]! + Math.log(Math.max(pi, 1e-6));
    });
    // the ensemble's edge over uniform at this row: log-loss (nats) or the
    // hit of its argmax (probability points) — V2_TUNING.edgeMode
    let e: number;
    if (V2_TUNING.edgeMode === "hit") {
      // argmax of the ensemble at i, from the SAME weights used for pEns
      const mix = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as FingerDistribution;
      predictors.forEach((p, k) => { const d = contextPredict(p, rows, i, channel); if (d) for (const v of V) mix[v] += (ws[k]! / wt) * d[v]; });
      extras.forEach((e, k) => { const d = e.fn(rows, i); if (d) for (const v of V) mix[v] += (ws[predictors.length + k]! / wt) * d[v]; });
      const am = V.reduce((b, v) => (mix[v] > mix[b] ? v : b), 1 as Fv);
      e = (am === actual ? 1 : 0) - 0.2;
    } else {
      e = Math.log(Math.max(pEns, 1e-6)) - Math.log(0.2);
    }
    edgeAcc = V2_TUNING.decay * edgeAcc + e;
    edgeW = V2_TUNING.decay * edgeW + 1;
  }
  const ws: Record<string, number> = {};
  let wt = 0;
  for (const nm of names) { ws[nm] = Math.exp(V2_TUNING.eta * ll[nm]!); wt += ws[nm]!; }
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as FingerDistribution;
  let used = 0;
  predictors.forEach((p) => {
    const d = contextPredict(p, rows, n, channel);
    if (!d) return;
    for (const v of V) dist[v] += (ws[p.name]! / wt) * d[v];
    used += ws[p.name]! / wt;
  });
  for (const e of extras) {
    const d = e.fn(rows, n);
    if (d) { for (const v of V) dist[v] += (ws[e.name]! / wt) * d[v]; used += ws[e.name]! / wt; }
  }
  if (used <= 0) return { dist: UNIFORM, weights: ws, edge: 0, n };
  for (const v of V) dist[v] = dist[v] / used;
  return { dist, weights: ws, edge: edgeW ? edgeAcc / edgeW : 0, n };
}

// ------------------------------------------------------------ mixing
export const UNIFORM_FLOOR = 0.08;
export const TAU_MIN = 0.3;
export const TAU_EDGE_GAIN = 3.0; // τ = clamp(1 − gain·edge, TAU_MIN, 1)

/** Calibrated temperature: no edge → 1 (sample the belief as is, which with
 * no data is uniform); a strong, sustained edge → TAU_MIN. */
export function temperatureFromEdge(edge: number, tauMin = V2_TUNING.tauMin, gain = V2_TUNING.tauGain): number {
  return Math.min(1, Math.max(tauMin, 1 - gain * Math.max(0, edge)));
}
export function sharpen(dist: FingerDistribution, tau: number, floor = V2_TUNING.floor): FingerDistribution {
  const raw = V.map((v) => Math.pow(Math.max(dist[v], 1e-9), 1 / tau));
  const s = raw.reduce((a, b) => a + b, 0);
  const out = {} as FingerDistribution;
  for (let k = 0; k < V.length; k++) out[V[k]!] = (1 - floor) * (raw[k]! / s) + floor * 0.2;
  return out;
}
/** Anti-aim distribution: softmax(−q/T) mixed with the uniform floor —
 * mass where the player is LEAST likely to look, decisively when q says
 * so, mixed so it stays a mixed strategy. */
export function antiAim(q: FingerDistribution, T = V2_TUNING.antiT, floor = V2_TUNING.floor): FingerDistribution {
  const raw = V.map((v) => Math.exp(-q[v] / Math.max(T, 1e-6)));
  const s = raw.reduce((a, b) => a + b, 0) || 1;
  const out = {} as FingerDistribution;
  for (let k = 0; k < V.length; k++) out[V[k]!] = (1 - floor) * (raw[k]! / s) + floor * 0.2;
  return out;
}
export function sample(rng: () => number, dist: FingerDistribution): Fv {
  const r = rng();
  let c = 0;
  for (const v of V) { c += dist[v]; if (r < c) return v; }
  return 5;
}

// ------------------------------------------------------------ self-watch
export const SELF_WATCH_WINDOW = 20;
export const SELF_WATCH_THRESHOLD = 0.24;
export const SELF_WATCH_TAU = 0.8;
/** The player's hit rate on the rival's fingers over the last rows they
 * could see — if they're reading us, our f must randomize more. */
export function playerHitRate(rows: readonly Row[], window = SELF_WATCH_WINDOW): number | null {
  let n = 0, hit = 0;
  for (let i = rows.length - 1; i >= 0 && n < window; i--) {
    const r = rows[i]!;
    if (r.g == null || r.af == null) continue;
    n++; hit += r.g === r.af ? 1 : 0;
  }
  return n >= 8 ? hit / n : null;
}

// ------------------------------------------------------------ levels
export const LEVELS_V2 = LEVELS;

export interface V2Trace {
  fBelief: FingerDistribution; fEdge: number; fTau: number;
  gBelief: FingerDistribution | null; gEdge: number | null; fingersTau: number | null;
  playerHitRate: number | null; weights: Record<string, number>;
}
export interface AiMoveV2 extends AiMove { v2: V2Trace | null }

function decideL3(rng: () => number, rows: Row[]): AiMoveV2 {
  const b = bmaBelief(rows, "f", F_PREDICTORS, F_EXTRAS);
  const tau = V2_TUNING.tauFixedL3 ?? Math.max(V2_TUNING.l3TauMin, temperatureFromEdge(b.edge)); // Mercè: sharp, but never as cold as the God
  const guess = sample(rng, sharpen(b.dist, tau));
  const fingers = (1 + Math.floor(rng() * 5)) as Fv; // she doesn't hide — her arrogance
  return {
    level: "L3", fingers, guessPlayerFingers: guess, call: fingers + guess,
    predictedPlayerFDist: b.dist, lambda: null, predictorWeights: null, antiAimDist: null,
    v2: { fBelief: b.dist, fEdge: b.edge, fTau: tau, gBelief: null, gEdge: null, fingersTau: null, playerHitRate: null, weights: b.weights },
  };
}

function decideL4(rng: () => number, rows: Row[]): AiMoveV2 {
  const b = bmaBelief(rows, "f", F_PREDICTORS, F_EXTRAS);
  const tau = V2_TUNING.tauFixedL4 ?? temperatureFromEdge(b.edge);
  const guess = sample(rng, sharpen(b.dist, tau));
  // anti-aim: where will the player look? BMA over the g contexts + the joint f→g predictor
  const q = bmaBelief(rows, "g", G_PREDICTORS, [{ name: "joint", fn: (rs, n) => jointGPredict(rs, n, b.dist) }]);
  const hr = playerHitRate(rows);
  // they're reading our fingers → hide less predictably (warmer softmax)
  const T = hr != null && hr > V2_TUNING.selfWatchThreshold ? V2_TUNING.antiTSelfWatch : V2_TUNING.antiT;
  const fDist = antiAim(q.dist, T);
  const fingers = sample(rng, fDist);
  const fTau = T;
  return {
    level: "L4", fingers, guessPlayerFingers: guess, call: fingers + guess,
    predictedPlayerFDist: b.dist, lambda: null, predictorWeights: null, antiAimDist: fDist,
    v2: { fBelief: b.dist, fEdge: b.edge, fTau: tau, gBelief: q.dist, gEdge: q.edge, fingersTau: fTau, playerHitRate: hr, weights: { ...b.weights, ...Object.fromEntries(Object.entries(q.weights).map(([k, v]) => ["g:" + k, v])) } },
  };
}

/** The v2 dispatcher. L1/L2 are the spike's (Nino stays readable, Bru
 * stays the equilibrium wall); L3/L4 are the new engine. */
export function decideMoveV2(level: string, random: RandomSource, history: readonly HistoryEntry[] = []): AiMoveV2 {
  const rng = () => random.next();
  if (level === "L3") return decideL3(rng, toRows(history));
  if (level === "L4") return decideL4(rng, toRows(history));
  return { ...decideMoveSpike(level, random, history, null), v2: null };
}

/** The read (deterministic) a v2 level would use for its guess — for the
 * mirror and the evaluator. L1/L2: uniform. */
export function predictPlayerFV2(level: string, history: readonly HistoryEntry[]): { dist: FingerDistribution; edge: number } {
  if (level === "L3" || level === "L4") { const b = bmaBelief(toRows(history), "f", F_PREDICTORS, F_EXTRAS); return { dist: b.dist, edge: b.edge }; }
  return { dist: UNIFORM, edge: 0 };
}
