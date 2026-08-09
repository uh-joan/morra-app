// mirror.mjs — "L'Espill" (design doc §3): training analytics computed
// from the SAME shared history the AI reads (modules/playermodel.mjs
// entries) — the mirror and the rival are two views of one engine. Pure,
// no DOM; the only cross-module dependency is ai.mjs's predictPlayerF for
// the exploitability meter, which replays the REAL L4 policy, not a
// reimplementation of it.
import { predictPlayerF } from "./ai.mjs";

const VALUES = [1, 2, 3, 4, 5];
const EXPLOITABILITY_REPLAY_CAP = 300; // bounds the O(n^2) retrospective L4 replay

function playerFSeries(history) { return history.map((h) => (h.playerFingers != null ? h.playerFingers : null)); }

/* ---------------------------------------------------------------------
 * §3.5 Exploitability meter: replay L4's OWN predictor retrospectively
 * over the player's history and score its top-1 (argmax) call against
 * what they actually threw next. 20% ~= unreadable (equilibrium); 40%+ ~=
 * an open book. This is also literally the AI's aim accuracy against you.
 * ------------------------------------------------------------------- */
export function computeExploitability(history) {
  const n = history.length;
  if (n < 2) return { rate: null, hits: 0, samples: 0 };
  const replayStart = Math.max(0, n - EXPLOITABILITY_REPLAY_CAP);
  let hits = 0, samples = 0;
  for (let i = Math.max(1, replayStart); i < n; i++) {
    const actual = history[i].playerFingers;
    if (actual == null) continue;
    const prefix = history.slice(0, i);
    const { dist } = predictPlayerF("L4", prefix);
    let bestV = null, bestP = -1;
    for (const v of VALUES) if (dist[v] > bestP) { bestP = dist[v]; bestV = v; }
    if (bestV === actual) hits++;
    samples++;
  }
  return { rate: samples ? hits / samples : null, hits, samples };
}

/* ---------------------------------------------------------------------
 * §3.1 Randomness score: Shannon redundancy of the f sequence.
 * redundancy = 1 - H/Hmax — 0% is perfectly uniform (unreadable), 100%
 * would be always-the-same-value. Research anchor: expert ~3%, beginner
 * ~15% (Delogu 2020, cited in the design doc).
 * ------------------------------------------------------------------- */
export function computeRandomnessScore(history) {
  const fs = playerFSeries(history).filter((f) => f != null);
  if (!fs.length) return null;
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of fs) counts[f]++;
  const n = fs.length;
  let entropyBits = 0;
  for (const v of VALUES) {
    const p = counts[v] / n;
    if (p > 0) entropyBits -= p * Math.log2(p);
  }
  const maxEntropyBits = Math.log2(VALUES.length);
  const redundancy = maxEntropyBits > 0 ? 1 - entropyBits / maxEntropyBits : 0;
  return { entropyBits, maxEntropyBits, redundancy, redundancyPct: redundancy * 100, sampleCount: n };
}

/* ---------------------------------------------------------------------
 * §3.2 Distributions: f histogram, g histogram (g = call - f), top words.
 * ------------------------------------------------------------------- */
export function computeHistograms(history) {
  const fCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const gCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const wordCounts = {};
  let fTotal = 0, gTotal = 0, wordTotal = 0;
  for (const h of history) {
    if (h.playerFingers != null && h.playerFingers >= 1 && h.playerFingers <= 5) { fCounts[h.playerFingers]++; fTotal++; }
    if (h.playerCall != null && h.playerFingers != null) {
      const g = h.playerCall - h.playerFingers;
      if (g >= 1 && g <= 5) { gCounts[g]++; gTotal++; }
    }
    if (h.playerWord) { wordCounts[h.playerWord] = (wordCounts[h.playerWord] || 0) + 1; wordTotal++; }
  }
  const toPctList = (counts, total) => VALUES.map((v) => ({ value: v, count: counts[v], pct: total ? (counts[v] / total) * 100 : 0 }));
  const topWords = Object.entries(wordCounts)
    .map(([word, count]) => ({ word, count, pct: wordTotal ? (count / wordTotal) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
  return {
    f: { list: toPctList(fCounts, fTotal), total: fTotal },
    g: { list: toPctList(gCounts, gTotal), total: gTotal },
    topWords, wordTotal,
  };
}

/* ---------------------------------------------------------------------
 * §3.3 Bigram heatmap: after throwing X, what do you throw next?
 * ------------------------------------------------------------------- */
export function computeBigramHeatmap(history) {
  const fs = playerFSeries(history).filter((f) => f != null);
  const counts = {};
  for (const from of VALUES) { counts[from] = {}; for (const to of VALUES) counts[from][to] = 0; }
  for (let i = 1; i < fs.length; i++) counts[fs[i - 1]][fs[i]]++;
  const rowTotals = {};
  for (const from of VALUES) rowTotals[from] = VALUES.reduce((s, to) => s + counts[from][to], 0);
  const probabilities = {};
  for (const from of VALUES) {
    probabilities[from] = {};
    for (const to of VALUES) probabilities[from][to] = rowTotals[from] ? counts[from][to] / rowTotals[from] : null;
  }
  return { counts, probabilities, rowTotals };
}

/* ---------------------------------------------------------------------
 * §3.6 Sync timing stats (already tracked elsewhere in s03-beat.html, but
 * the mirror shows them alongside the rest per-session/all-time too).
 * ------------------------------------------------------------------- */
export function computeSyncStats(history) {
  const withOutcome = history.filter((h) => h.syncOutcome != null);
  const synced = withOutcome.filter((h) => h.syncOutcome === "synced");
  const deltas = withOutcome.filter((h) => h.syncDeltaMs != null).map((h) => Math.abs(h.syncDeltaMs)).sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const medianAbsDeltaMs = deltas.length ? (deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2) : null;
  return {
    syncRate: withOutcome.length ? synced.length / withOutcome.length : null,
    medianAbsDeltaMs,
    sampleCount: withOutcome.length,
  };
}

/* ---------------------------------------------------------------------
 * §3.4 Tells: plain, Catalan-flavored sentences, each with the number
 * that proves it. Only the top few (by strength) are surfaced; anything
 * without enough data to be a REAL tell (not noise) returns null.
 * ------------------------------------------------------------------- */
const BASELINE_P = 0.2; // a uniform-random player's expected rate for any single 1-in-5 event

function tellRepeatRate(history) {
  const fs = playerFSeries(history).filter((f) => f != null);
  if (fs.length < 6) return null;
  let repeats = 0;
  for (let i = 1; i < fs.length; i++) if (fs[i] === fs[i - 1]) repeats++;
  const rate = repeats / (fs.length - 1);
  const strength = rate - BASELINE_P;
  if (strength <= 0.05) return null;
  return {
    id: "repeatRate", strength,
    sentence: `Tires el mateix nombre dues vegades seguides un ${(rate * 100).toFixed(0)}% de les vegades — un bon rival ho veu.`,
    proofPct: rate * 100,
  };
}

function tellWinStayLoseShift(history) {
  const pairs = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], cur = history[i];
    if (prev.playerFingers == null || cur.playerFingers == null || !prev.verdictWinner) continue;
    if (prev.verdictWinner !== "player" && prev.verdictWinner !== "ai") continue; // need a clean win/loss, not parata/void
    pairs.push({ won: prev.verdictWinner === "player", repeated: cur.playerFingers === prev.playerFingers });
  }
  const wins = pairs.filter((p) => p.won), losses = pairs.filter((p) => !p.won);
  if (wins.length < 4 && losses.length < 4) return null;
  const winStayRate = wins.length ? wins.filter((p) => p.repeated).length / wins.length : null;
  const loseShiftRate = losses.length ? 1 - losses.filter((p) => p.repeated).length / losses.length : null; // "shift" = did NOT repeat
  const winStayStrength = winStayRate != null ? winStayRate - BASELINE_P : -1;
  const loseShiftStrength = loseShiftRate != null ? loseShiftRate - (1 - BASELINE_P) : -1; // baseline "shift" rate for a random player is 80%
  if (winStayStrength >= loseShiftStrength && winStayStrength > 0.1) {
    return {
      id: "winStay", strength: winStayStrength,
      sentence: `Després de guanyar, repeteixes el mateix nombre un ${(winStayRate * 100).toFixed(0)}% de les vegades.`,
      proofPct: winStayRate * 100,
    };
  }
  if (loseShiftStrength > 0.1) {
    return {
      id: "loseShift", strength: loseShiftStrength,
      sentence: `Després de perdre, canvies de nombre un ${(loseShiftRate * 100).toFixed(0)}% de les vegades.`,
      proofPct: loseShiftRate * 100,
    };
  }
  return null;
}

function tellFingerCallCorrelation(history) {
  const byFinger = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const h of history) {
    if (h.playerFingers == null || !h.playerWord) continue;
    byFinger[h.playerFingers][h.playerWord] = (byFinger[h.playerFingers][h.playerWord] || 0) + 1;
    totals[h.playerFingers]++;
  }
  let best = null;
  for (const f of VALUES) {
    if (totals[f] < 4) continue;
    let bestWord = null, bestCount = 0;
    for (const [w, c] of Object.entries(byFinger[f])) if (c > bestCount) { bestCount = c; bestWord = w; }
    const rate = bestCount / totals[f];
    if (!best || rate > best.rate) best = { f, word: bestWord, rate, samples: totals[f] };
  }
  if (!best || best.rate < 0.4) return null;
  return {
    id: "fingerCallCorrelation", strength: best.rate - BASELINE_P,
    sentence: `Quan mostres ${best.f} dits, dius "${best.word}" el ${(best.rate * 100).toFixed(0)}% de les vegades.`,
    proofPct: best.rate * 100,
  };
}

function tellSequenceHabit(history) {
  const { probabilities, rowTotals } = computeBigramHeatmap(history);
  let best = null;
  for (const from of VALUES) {
    if (rowTotals[from] < 4) continue;
    for (const to of VALUES) {
      const p = probabilities[from][to];
      if (p == null) continue;
      const dev = p - BASELINE_P;
      if (!best || dev > best.dev) best = { from, to, p, dev };
    }
  }
  if (!best || best.dev < 0.15) return null;
  return {
    id: "sequenceHabit", strength: best.dev,
    sentence: `Després de tirar un ${best.from}, tires un ${best.to} el ${(best.p * 100).toFixed(0)}% de les vegades.`,
    proofPct: best.p * 100,
  };
}

export function computeTopTells(history, maxCount = 3) {
  const candidates = [
    tellRepeatRate(history),
    tellWinStayLoseShift(history),
    tellFingerCallCorrelation(history),
    tellSequenceHabit(history),
  ].filter(Boolean);
  candidates.sort((a, b) => b.strength - a.strength);
  return candidates.slice(0, maxCount);
}
