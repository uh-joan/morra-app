// ai.mjs — the rival's decision policy: the four-level ladder from
// docs/rival-ai-design.md §2. No DOM, no crypto — commit.mjs owns sealing
// whatever decideMove() returns.
//
// Fairness invariant (design doc §4): the policy must be a PURE function of
// (rng, playerModelSnapshot, history) — decided from history strictly
// before the current throw; nothing about the pending throw may reach it.
// rng is injected (default Math.random) so a decision is replayable/
// testable without depending on the ambient global. Every level below is
// deterministic given the same (level, rng-sequence, history) — "sampling"
// still means drawing from `rng()`, never Math.random() directly, so a
// fixed test rng makes a decision fully reproducible.
//
// `history` is an array of past-round records, oldest first:
//   { throwIndex, playerFingers, playerCall, aiFingers, aiCall,
//     aiGuessPlayerFingers, verdictWinner: "player"|"ai"|"parata"|null }
// playerCall/aiCall are 2-10 (the spoken/heard call); playerFingers/
// aiFingers/aiGuessPlayerFingers are 1-5 or null (unknown/unrevealed).
// L1/L2/L3 are meant to be fed the CURRENT MATCH's history only ("in-match
// predictor ensemble" — design doc §2); L4 is meant to be fed the
// CROSS-MATCH persisted history from playermodel.mjs — that choice belongs
// to the caller (the page), not to this module.

const VALUES = [1, 2, 3, 4, 5];

export const LEVELS = {
  L1: { id: "L1", name: "L'Aprenent", description: "Es delata — mira els seus costums i el llegiràs." },
  L2: { id: "L2", name: "El Jugador", description: "Cap patró. Pura sort, com la morra de veritat." },
  L3: { id: "L3", name: "El Vell de la Taverna", description: "T'observa aquesta partida — no li amaguis el mateix truc dues vegades." },
  L4: { id: "L4", name: "El Déu de la Morra", description: "Et recorda de sempre. Sap què faràs abans que tu ho sàpigues." },
};
export const LEVEL_ORDER = ["L1", "L2", "L3", "L4"];
export const DEFAULT_LEVEL = "L2";

/* ---------------------------------------------------------------------
 * Low-level math: decay weighting, distributions, sampling, inversion.
 * Exported individually so each piece is directly unit-testable.
 * ------------------------------------------------------------------- */

function emptyCounts() { return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; }

function normalizeCounts(counts, total) {
  if (!(total > 0)) return null;
  const dist = {};
  for (const v of VALUES) dist[v] = counts[v] / total;
  return dist;
}

// Recency decay: weight of a sample `indexFromMostRecentEnd` throws back
// from the newest one in the series (0 = most recent). Half-life in throws.
export function decayWeight(indexFromMostRecentEnd, halfLife) {
  return Math.pow(0.5, indexFromMostRecentEnd / halfLife);
}

// λ = n_eff/(n_eff+k) — confidence-scaled mixing factor (design doc §2):
// k=8 for L3, k=4 for L4 ("half-saturation at n=4"): λ=0.5 when n_eff=k.
export function lambdaFromNEff(nEff, halfSaturationN) {
  if (!(nEff > 0)) return 0;
  return nEff / (nEff + halfSaturationN);
}

// Mixes a sharpened distribution toward uniform by λ — the "equilibrium
// floor": with no supporting data (λ→0) this IS the uniform distribution,
// i.e. exactly L2's behavior, so a data-starved read can never do worse
// than blind guessing.
export function mixWithUniform(dist, lambda) {
  const out = {};
  for (const v of VALUES) out[v] = lambda * dist[v] + (1 - lambda) * 0.2;
  return out;
}

// τ=1 samples the distribution as-is (the "sharpened distribution" IS the
// ensemble's own output at τ=1 — no additional reshaping). τ<1 (L4 uses
// 0.6) sharpens toward the distribution's peak; τ>1 would flatten it.
// Always a weighted-random draw from `rng()` — NEVER argmax (design doc
// §2: "argmax is itself a tell").
export function sampleWithTemperature(rng, dist, temperature = 1) {
  let weights;
  if (temperature === 1) {
    weights = VALUES.map((v) => dist[v]);
  } else {
    const inv = 1 / temperature;
    const raw = VALUES.map((v) => Math.pow(Math.max(dist[v], 0), inv));
    const sum = raw.reduce((a, b) => a + b, 0);
    weights = sum > 0 ? raw.map((w) => w / sum) : VALUES.map(() => 0.2);
  }
  const r = rng();
  let cum = 0;
  for (let i = 0; i < VALUES.length; i++) {
    cum += weights[i];
    if (r < cum) return VALUES[i];
  }
  return VALUES[VALUES.length - 1]; // floating-point rounding fallback
}

// L4's anti-aim: flips a distribution so mass concentrates where the
// SOURCE distribution is weakest — "hides where you don't look".
export function invertDistribution(dist) {
  const out = {};
  let total = 0;
  for (const v of VALUES) { out[v] = Math.max(0, 1 - dist[v]); total += out[v]; }
  if (total <= 0) return null;
  for (const v of VALUES) out[v] /= total;
  return out;
}

// Combines several {dist, nEff-or-weight} predictions into one distribution,
// weighted by whatever `weight` the caller assigns each (raw nEff for L3;
// hit-rate-scaled for L4's meta-hedge). Predictors with weight<=0 or no
// distribution are dropped.
export function combineByWeight(predictions) {
  const usable = (predictions || []).filter((p) => p && p.dist && p.weight > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((s, p) => s + p.weight, 0);
  if (totalWeight <= 0) return null;
  const combined = emptyCounts();
  for (const p of usable) {
    const w = p.weight / totalWeight;
    for (const v of VALUES) combined[v] += p.dist[v] * w;
  }
  return combined;
}

/* ---------------------------------------------------------------------
 * Predictors: each takes a raw, index-aligned `series` (numbers 1-5 or
 * null for a throw with no reading on this channel) — and for
 * winStayLoseShiftPredict, a parallel `verdicts` array of "player"/"ai"/
 * "parata"/null — and returns {dist, nEff} or null if there's not enough
 * data to say anything. Used both for the g-channel (predicting the
 * player's next fingers) and, in L4, for the f-channel (predicting the
 * player's own g habits, for anti-aim).
 * ------------------------------------------------------------------- */

export function order1Predict(series, halfLife) {
  const n = series.length;
  if (n < 2) return null;
  let lastVal = null;
  for (let i = n - 1; i >= 0; i--) if (series[i] != null) { lastVal = series[i]; break; }
  if (lastVal == null) return null;
  const counts = emptyCounts();
  let total = 0;
  for (let i = 1; i < n; i++) {
    if (series[i - 1] !== lastVal || series[i] == null) continue;
    const w = decayWeight(n - 1 - i, halfLife);
    counts[series[i]] += w; total += w;
  }
  const dist = normalizeCounts(counts, total);
  return dist ? { dist, nEff: total } : null;
}

const ORDER2_MIN_WEIGHT = 1.5; // below this decayed sample count, order-2 backs off to order-1
export function order2Predict(series, halfLife) {
  const n = series.length;
  if (n < 3) return null;
  let lastA = null, lastB = null;
  for (let i = n - 1; i >= 1; i--) {
    if (series[i] != null && series[i - 1] != null) { lastB = series[i]; lastA = series[i - 1]; break; }
  }
  if (lastA == null || lastB == null) return null;
  const counts = emptyCounts();
  let total = 0;
  for (let i = 2; i < n; i++) {
    if (series[i - 2] !== lastA || series[i - 1] !== lastB || series[i] == null) continue;
    const w = decayWeight(n - 1 - i, halfLife);
    counts[series[i]] += w; total += w;
  }
  if (total < ORDER2_MIN_WEIGHT) return null;
  const dist = normalizeCounts(counts, total);
  return dist ? { dist, nEff: total } : null;
}

// "order-1/order-2 n-grams with backoff" (design doc §2) as one predictor.
export function ngramWithBackoff(series, halfLife) {
  return order2Predict(series, halfLife) || order1Predict(series, halfLife);
}

export function globalFreqPredict(series, halfLife) {
  const n = series.length;
  const counts = emptyCounts();
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (series[i] == null) continue;
    const w = decayWeight(n - 1 - i, halfLife);
    counts[series[i]] += w; total += w;
  }
  const dist = normalizeCounts(counts, total);
  return dist ? { dist, nEff: total } : null;
}

// A longer-memory "sticky bias" read: all mass on the single most-favored
// value, rewarding a player with one strongly dominant habit more sharply
// than the smoother globalFreq estimate alone.
export function stickyModePredict(series, halfLife) {
  const g = globalFreqPredict(series, halfLife);
  if (!g) return null;
  let bestV = null, bestP = -1;
  for (const v of VALUES) if (g.dist[v] > bestP) { bestP = g.dist[v]; bestV = v; }
  const dist = emptyCounts();
  dist[bestV] = 1;
  return { dist, nEff: g.nEff };
}

// Conditions on whether the LAST round went the source's way ("player" =
// they won it, "ai" = they lost it) and looks at what they did the time(s)
// AFTER a similarly-outcomed round — a direct, testable formalization of
// win-stay/lose-shift.
export function winStayLoseShiftPredict(series, verdicts, halfLife) {
  const n = series.length;
  if (n < 2) return null;
  let lastIdx = -1;
  for (let i = n - 1; i >= 0; i--) if (series[i] != null) { lastIdx = i; break; }
  if (lastIdx < 1) return null;
  const lastWon = verdicts[lastIdx] === "player";
  const lastLost = verdicts[lastIdx] === "ai";
  if (!lastWon && !lastLost) return null; // parata/void — no clean win/lose signal to condition on
  const counts = emptyCounts();
  let total = 0;
  for (let i = 1; i < n; i++) {
    if (series[i - 1] == null || series[i] == null) continue;
    const prevWon = verdicts[i - 1] === "player";
    const prevLost = verdicts[i - 1] === "ai";
    if (lastWon && !prevWon) continue;
    if (lastLost && !prevLost) continue;
    const w = decayWeight(n - 1 - i, halfLife);
    counts[series[i]] += w; total += w;
  }
  const dist = normalizeCounts(counts, total);
  return dist ? { dist, nEff: total } : null;
}

function playerFSeries(history) { return history.map((h) => (h.playerFingers != null ? h.playerFingers : null)); }
function verdictSeries(history) { return history.map((h) => h.verdictWinner ?? null); }
function playerGSeries(history) {
  return history.map((h) => (h.playerCall != null && h.playerFingers != null ? h.playerCall - h.playerFingers : null));
}

/* ---------------------------------------------------------------------
 * L1 — L'Aprenent: designed to be read. f biased toward {2,5}, ~35%
 * repeat-after-scoring; g uniform (it doesn't read the player at all).
 * ------------------------------------------------------------------- */

const L1_FINGER_WEIGHTS = { 1: 0.15, 2: 0.30, 3: 0.10, 4: 0.15, 5: 0.30 };
const L1_REPEAT_AFTER_SCORE_PROB = 0.35;

function decideL1(rng, history) {
  const last = history.length ? history[history.length - 1] : null;
  let fingers;
  if (last && last.verdictWinner === "ai" && last.aiFingers != null && rng() < L1_REPEAT_AFTER_SCORE_PROB) {
    fingers = last.aiFingers; // the honest, discoverable tell
  } else {
    fingers = sampleWithTemperature(rng, L1_FINGER_WEIGHTS, 1);
  }
  const guessPlayerFingers = 1 + Math.floor(rng() * 5); // g uniform
  return {
    level: "L1", fingers, guessPlayerFingers, call: fingers + guessPlayerFingers,
    predictedPlayerFDist: null, lambda: null, predictorWeights: null, antiAimDist: null,
  };
}

/* ---------------------------------------------------------------------
 * L2 — El Jugador: uniform f, uniform g. The equilibrium wall.
 * ------------------------------------------------------------------- */

function decideL2(rng) {
  const fingers = 1 + Math.floor(rng() * 5);
  const guessPlayerFingers = 1 + Math.floor(rng() * 5);
  return {
    level: "L2", fingers, guessPlayerFingers, call: fingers + guessPlayerFingers,
    predictedPlayerFDist: null, lambda: null, predictorWeights: null, antiAimDist: null,
  };
}

/* ---------------------------------------------------------------------
 * L3 — El Vell de la Taverna: in-match ensemble (n-gram+backoff, global
 * frequency, win-stay/lose-shift) aims at the player's f; own f uniform.
 * ------------------------------------------------------------------- */

const L3_HALF_LIFE = 20;
const L3_LAMBDA_K = 8;
const L3_TEMPERATURE = 1;

function ensemblePredictPlayerF(history, halfLife) {
  const series = playerFSeries(history);
  const verdicts = verdictSeries(history);
  return [
    { name: "ngramBackoff", pred: ngramWithBackoff(series, halfLife) },
    { name: "globalFreq", pred: globalFreqPredict(series, halfLife) },
    { name: "winStayLoseShift", pred: winStayLoseShiftPredict(series, verdicts, halfLife) },
  ].filter((p) => p.pred);
}

function decideL3(rng, history) {
  const fingers = 1 + Math.floor(rng() * 5); // f uniform — L3 doesn't hide
  const preds = ensemblePredictPlayerF(history, L3_HALF_LIFE);
  const weighted = preds.map((p) => ({ name: p.name, dist: p.pred.dist, weight: p.pred.nEff }));
  const combined = combineByWeight(weighted);
  // λ uses the raw global-frequency sample size specifically — how much
  // real history exists at all — not the summed ensemble weight (which
  // would double-count the same throws across multiple predictors).
  const globalNEff = (globalFreqPredict(playerFSeries(history), L3_HALF_LIFE) || { nEff: 0 }).nEff;
  const lambda = lambdaFromNEff(globalNEff, L3_LAMBDA_K);
  const finalDist = combined ? mixWithUniform(combined, lambda) : { 1: .2, 2: .2, 3: .2, 4: .2, 5: .2 };
  const guessPlayerFingers = sampleWithTemperature(rng, finalDist, L3_TEMPERATURE);
  return {
    level: "L3", fingers, guessPlayerFingers, call: fingers + guessPlayerFingers,
    predictedPlayerFDist: finalDist, lambda, predictorWeights: null, antiAimDist: null,
  };
}

/* ---------------------------------------------------------------------
 * L4 — El Déu de la Morra: L3's read, sharpened by a meta-hedge over 5
 * predictors weighted by decayed hit-rate (so it follows an adapting
 * player within a few throws), PLUS anti-aim f from a joint model of the
 * player's own g habits. τ=0.6, λ half-sat n=4 — commits to reads fast,
 * but the same mix-toward-uniform machinery as L3 guarantees the
 * equilibrium floor: L4 ≥ L2 even against a perfectly random player, since
 * every predictor here is a consistent estimator that converges to the
 * TRUE uniform distribution when the source really is uniform.
 * ------------------------------------------------------------------- */

const L4_HALF_LIFE = L3_HALF_LIFE;
const L4_LAMBDA_K = 4;
const L4_TEMPERATURE = 0.6;
const L4_HITRATE_DECAY = 0.9;
const L4_HITRATE_REPLAY_CAP = 150; // bounds the O(n^2) retrospective replay for long cross-match histories

const L4_PREDICTOR_FNS = [
  { name: "order1", fn: (s, v, hl) => order1Predict(s, hl) },
  { name: "ngramBackoff", fn: (s, v, hl) => ngramWithBackoff(s, hl) },
  { name: "globalFreq", fn: (s, v, hl) => globalFreqPredict(s, hl) },
  { name: "winStayLoseShift", fn: (s, v, hl) => winStayLoseShiftPredict(s, v, hl) },
  { name: "stickyMode", fn: (s, v, hl) => stickyModePredict(s, hl) },
];

// Retrospectively replays each predictor over a PREFIX of the series (as it
// would have looked at the time), scores whether its own top pick would
// have hit the actual next value, and returns a decayed hit-rate per
// predictor — the "meta-hedge" (design doc §2: "a lightweight Iocaine").
// The AI's actual guess is always a temperature SAMPLE (see decideL4), not
// this internal argmax — argmax here is only used to SCORE each predictor.
export function computeHitRates(series, verdicts, halfLife, predictorFns) {
  const n = series.length;
  const rates = predictorFns.map(() => ({ rate: 0, samples: 0 }));
  for (let i = 1; i < n; i++) {
    if (series[i] == null) continue;
    const prefixSeries = series.slice(0, i);
    const prefixVerdicts = verdicts.slice(0, i);
    predictorFns.forEach((fn, pi) => {
      const pred = fn(prefixSeries, prefixVerdicts, halfLife);
      if (!pred || !pred.dist) return;
      let bestV = null, bestP = -1;
      for (const v of VALUES) if (pred.dist[v] > bestP) { bestP = pred.dist[v]; bestV = v; }
      const hit = bestV === series[i] ? 1 : 0;
      rates[pi].rate = L4_HITRATE_DECAY * rates[pi].rate + (1 - L4_HITRATE_DECAY) * hit;
      rates[pi].samples++;
    });
  }
  return rates;
}

function metaHedgeCombine(series, verdicts, halfLife) {
  const n = series.length;
  const replayStart = Math.max(0, n - L4_HITRATE_REPLAY_CAP);
  const replaySeries = series.slice(replayStart);
  const replayVerdicts = verdicts.slice(replayStart);
  const hitRates = computeHitRates(replaySeries, replayVerdicts, halfLife, L4_PREDICTOR_FNS.map((p) => p.fn));
  const current = L4_PREDICTOR_FNS.map((p, i) => {
    const pred = p.fn(series, verdicts, halfLife);
    return pred ? { name: p.name, dist: pred.dist, nEff: pred.nEff, hitRate: hitRates[i].rate, hitSamples: hitRates[i].samples } : null;
  }).filter(Boolean);
  // Multiplicative weighting: nEff gates whether a predictor has anything
  // to say at all (zero data -> zero weight regardless of hit-rate); its
  // recent hit-rate then scales how much say it gets among the rest — so a
  // predictor that's been reading the player well gets more influence, and
  // one that's gone stale (the player adapted) fades within a few throws.
  const weighted = current.map((p) => ({ name: p.name, dist: p.dist, weight: p.nEff * (0.5 + p.hitRate), hitRate: p.hitRate, nEff: p.nEff }));
  const combined = combineByWeight(weighted);
  const globalNEff = (globalFreqPredict(series, halfLife) || { nEff: 0 }).nEff;
  return { combined, weighted, globalNEff };
}

function decideL4(rng, history) {
  const fSeries = playerFSeries(history);
  const verdicts = verdictSeries(history);
  const gPlayerSeries = playerGSeries(history);

  // g channel: meta-hedge ensemble predicting the player's NEXT f.
  const { combined: gCombined, weighted: gWeights, globalNEff: gNEff } = metaHedgeCombine(fSeries, verdicts, L4_HALF_LIFE);
  const gLambda = lambdaFromNEff(gNEff, L4_LAMBDA_K);
  const gDist = gCombined ? mixWithUniform(gCombined, gLambda) : { 1: .2, 2: .2, 3: .2, 4: .2, 5: .2 };
  const guessPlayerFingers = sampleWithTemperature(rng, gDist, L4_TEMPERATURE);

  // f channel: anti-aim — predict the PLAYER's g (their guess of the AI's
  // fingers, from their own call history) and hide where they're least
  // likely to look. Same confidence-scaled mixing + sampling, so with too
  // little data it degrades to uniform (the equilibrium floor).
  const predictedPlayerG = ngramWithBackoff(gPlayerSeries, L4_HALF_LIFE) || globalFreqPredict(gPlayerSeries, L4_HALF_LIFE);
  const fNEff = predictedPlayerG ? predictedPlayerG.nEff : 0;
  const fLambda = lambdaFromNEff(fNEff, L4_LAMBDA_K);
  const antiAimBase = predictedPlayerG ? invertDistribution(predictedPlayerG.dist) : null;
  const fDist = antiAimBase ? mixWithUniform(antiAimBase, fLambda) : { 1: .2, 2: .2, 3: .2, 4: .2, 5: .2 };
  const fingers = sampleWithTemperature(rng, fDist, L4_TEMPERATURE);

  const predictorWeights = {};
  for (const p of gWeights) predictorWeights[p.name] = { weight: p.weight, hitRate: p.hitRate, nEff: p.nEff };

  return {
    level: "L4", fingers, guessPlayerFingers, call: fingers + guessPlayerFingers,
    predictedPlayerFDist: gDist, lambda: gLambda, predictorWeights, antiAimDist: fDist,
  };
}

/* ---------------------------------------------------------------------
 * Dispatcher
 * ------------------------------------------------------------------- */

export function decideMove(level = DEFAULT_LEVEL, rng = Math.random, history = [], modelSnapshot = null) {
  switch (level) {
    case "L1": return decideL1(rng, history);
    case "L3": return decideL3(rng, history);
    case "L4": return decideL4(rng, history);
    case "L2":
    default: return decideL2(rng, history);
  }
}
