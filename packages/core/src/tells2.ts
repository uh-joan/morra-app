// tells2.ts — L'Espill v2's named tells (docs/espill-brainstorm.md §2–3):
// the mirror2 statistics turned into sentences a player can act on, each
// with its evidence (k of n), what the rival does with it (the counter-
// move), and — when the habit maps onto one of El Rei's own predictors —
// its exploit value in points per 100 rounds. Ranked: priced tells first
// by price, then by evidence strength. Catalan sentences, like mirror.ts.
import {
  computeGuessStats, computeLoops, computeOrder2, computeOutcomeStats, computeReactivity, computeReaderStats, computeRegimes,
  computeReturnTimes, computeSteps, computeTiming, computeWeld, rankExploitValue, type ExploitRanking, type Rate,
} from "./mirror2.js";
import { predictPlayerFV2 } from "./ai2.js";
import { computeBigramHeatmap } from "./mirror.js";
import type { HistoryEntry } from "./types.js";

export interface Tell2 {
  id: string;
  /** which of the rival's predictor families this habit feeds, if any */
  family: string | null;
  sentence: string;
  /** what the rival does with it — a clause after "El Rei: ", lowercase start */
  counterMove: string;
  evidence: { hits: number; n: number; rate: number };
  /** exploit value of the family, standalone, points per 100 rounds — null when the habit has no priced family */
  pointsPer100: number | null;
  /** evidence strength: distance from the baseline, tempered by sample size — the tiebreak */
  strength: number;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const strengthOf = (rate: number, base: number, n: number, ref = 30) => Math.abs(rate - base) * Math.min(1, n / ref);
const ev = (r: Rate): Tell2["evidence"] | null => (r.rate == null ? null : { hits: r.hits, n: r.n, rate: r.rate });

/** All tells that clear their evidence bar, ranked. `ranking` may be passed
 * in when the caller already computed it (it is the expensive part). */
export function computeTells2(history: readonly HistoryEntry[], ranking?: ExploitRanking): Tell2[] {
  const out: Tell2[] = [];
  const add = (t: Omit<Tell2, "pointsPer100" | "evidence"> & { evidence: Tell2["evidence"] | null }) => { if (t.evidence) out.push({ ...t, evidence: t.evidence, pointsPer100: null }); };

  // --- sequence: order-1 habit (from the heatmap the panel already shows)
  const hm = computeBigramHeatmap(history);
  {
    let best: { a: number; b: number; p: number; n: number } | null = null;
    for (const a of [1, 2, 3, 4, 5] as const) {
      const n = hm.rowTotals[a] ?? 0;
      for (const b of [1, 2, 3, 4, 5] as const) { const p = hm.probabilities[a]![b]; if (p != null && n >= 6 && p >= 0.4 && (!best || p * Math.min(1, n / 12) > best.p * Math.min(1, best.n / 12))) best = { a, b, p, n }; }
    }
    if (best) add({ id: "order1", family: "order1", sentence: `Després de tirar un ${best.a}, tires un ${best.b} el ${pct(best.p)} de les vegades.`, counterMove: `aposta al ${best.b} cada cop que veu el teu ${best.a}.`, evidence: { hits: Math.round(best.p * best.n), n: best.n, rate: best.p }, strength: strengthOf(best.p, 0.2, best.n, 12) });
  }
  // --- sequence: order-2 triple
  const o2 = computeOrder2(history);
  { const t = o2.triples.find((x) => x.contextCount >= 6 && x.p >= 0.5); if (t) add({ id: "order2", family: "order2", sentence: `Després d'un ${t.a} i un ${t.b}, tires un ${t.c} el ${pct(t.p)} de les vegades.`, counterMove: `dos números seguits li diuen el tercer — aposta al ${t.c}.`, evidence: { hits: t.count, n: t.contextCount, rate: t.p }, strength: strengthOf(t.p, 0.2, t.contextCount, 10) }); }
  // --- steps and staircase
  const st = computeSteps(history);
  if (st.n >= 12 && st.pStepOne != null && st.pStepOne >= 0.36) add({ id: "stepOne", family: "order1", sentence: `Puges o baixes d'un en un el ${pct(st.pStepOne)} de les vegades.`, counterMove: `apostant a un més o un menys té dues opcions en lloc de cinc.`, evidence: { hits: Math.round(st.pStepOne * st.n), n: st.n, rate: st.pStepOne }, strength: strengthOf(st.pStepOne, 0.32, st.n) });
  if (st.riseAfterRise.n >= 8 && st.riseAfterRise.rate != null && st.riseAfterRise.rate >= 0.5) add({ id: "staircaseUp", family: "order2", sentence: `Quan acabes de pujar, tornes a pujar el ${pct(st.riseAfterRise.rate)} de les vegades — l'escala.`, counterMove: `dos tirs amunt i sap que el tercer és el següent esglaó.`, evidence: ev(st.riseAfterRise), strength: strengthOf(st.riseAfterRise.rate, 0.3, st.riseAfterRise.n) });
  if (st.fallAfterFall.n >= 8 && st.fallAfterFall.rate != null && st.fallAfterFall.rate >= 0.5) add({ id: "staircaseDown", family: "order2", sentence: `Quan acabes de baixar, tornes a baixar el ${pct(st.fallAfterFall.rate)} de les vegades — l'escala.`, counterMove: `dos tirs avall i sap que el tercer és el següent esglaó.`, evidence: ev(st.fallAfterFall), strength: strengthOf(st.fallAfterFall.rate, 0.3, st.fallAfterFall.n) });
  // --- regimes: leaving high/low at once, or dwelling
  const rg = computeRegimes(history);
  for (const side of ["high", "low"] as const) {
    const h1 = rg.leaveHazard[side][1]!;
    const name = side === "high" ? "els alts (4 i 5)" : "els baixos (1 i 2)";
    if (h1.n >= 8 && h1.rate != null && h1.rate >= 0.72) add({ id: `leave-${side}`, family: "order1", sentence: `Quan tires ${name}, en marxes de seguida: el ${pct(h1.rate)} de les vegades el següent ja no hi és.`, counterMove: `després d'un ${side === "high" ? "4 o 5" : "1 o 2"} descarta ${side === "high" ? "els alts" : "els baixos"} i li queden tres números.`, evidence: ev(h1), strength: strengthOf(h1.rate, 0.6, h1.n) });
    const d = rg.dwell[side];
    if (d.runs >= 5 && d.mean != null && d.mean >= 2.6) add({ id: `dwell-${side}`, family: "order1", sentence: `Quan entres ${name}, t'hi quedes ${d.mean.toFixed(1)} tirs de mitjana.`, counterMove: `sap que el següent torna a ser ${side === "high" ? "alt" : "baix"}.`, evidence: { hits: d.runs, n: d.runs, rate: 1 }, strength: strengthOf(Math.min(1, d.mean / 5), 0.3, d.runs, 8) });
  }
  // --- owed digits
  const rt = computeReturnTimes(history);
  for (const dgt of [1, 2, 3, 4, 5] as const) {
    const p = rt.perDigit[dgt]!; const a = p.afterLongGap;
    if (a.n >= 8 && a.rate != null && p.base != null && a.rate >= p.base + 0.12 && a.rate >= 0.3) add({ id: `owed-${dgt}`, family: "freq", sentence: `Quan portes cinc tirs o més sense un ${dgt}, el ${dgt} arriba el ${pct(a.rate)} de les vegades (normalment, ${pct(p.base)}).`, counterMove: `compta els tirs que fa que no el treus — i l'espera.`, evidence: ev(a), strength: strengthOf(a.rate, p.base, a.n) });
  }
  // --- bounce and loops
  const lp = computeLoops(history);
  if (lp.bounce.n >= 10 && lp.bounce.rate != null && lp.bounce.rate >= 0.33) add({ id: "bounce", family: "order2", sentence: `Tornes al número d'abans de l'últim (a-b-a) el ${pct(lp.bounce.rate)} de les vegades.`, counterMove: `aposta al número que vas tirar fa dos tirs.`, evidence: ev(lp.bounce), strength: strengthOf(lp.bounce.rate, 0.2, lp.bounce.n) });
  // --- the weld
  const wd = computeWeld(history);
  {
    let best: { f: number; g: number; p: number; n: number } | null = null;
    for (const f of [1, 2, 3, 4, 5] as const) { const c = wd.gGivenF[f]!; if (c.n >= 10 && c.favouriteP != null && c.favouriteP >= 0.4 && (!best || c.favouriteP > best.p)) best = { f, g: c.favouriteG!, p: c.favouriteP, n: c.n }; }
    if (best) add({ id: "weld", family: null, sentence: `Quan mostres ${best.f} dits, cantes ${best.f + best.g} el ${pct(best.p)} de les vegades.`, counterMove: `si veu un ${best.f} sap que busques un ${best.g} — i s'hi amaga.`, evidence: { hits: Math.round(best.p * best.n), n: best.n, rate: best.p }, strength: strengthOf(best.p, 0.2, best.n) });
  }
  // --- the chase and the guess side
  const gs = computeGuessStats(history);
  if (gs.chase.n >= 10 && gs.chase.rate != null && gs.chase.rate >= 0.3) add({ id: "chase", family: null, sentence: `Endevines els dits que el rival acaba de treure el ${pct(gs.chase.rate)} de les vegades — esperes que repeteixi.`, counterMove: `gairebé mai és on acaba de ser — la teva endevinalla cau al buit.`, evidence: ev(gs.chase), strength: strengthOf(gs.chase.rate, 0.2, gs.chase.n) });
  if (gs.stubbornAfterMiss.n >= 10 && gs.stubbornAfterMiss.rate != null && gs.stubbornAfterMiss.rate >= 0.35) add({ id: "stubborn", family: null, sentence: `Quan falles l'endevinalla, la repeteixes el ${pct(gs.stubbornAfterMiss.rate)} de les vegades.`, counterMove: `sap on miraràs el proper tir — on ja has mirat.`, evidence: ev(gs.stubbornAfterMiss), strength: strengthOf(gs.stubbornAfterMiss.rate, 0.2, gs.stubbornAfterMiss.n) });
  // --- outcome
  const oc = computeOutcomeStats(history);
  if (oc.shiftF.player.n >= 8 && oc.shiftF.player.rate != null && oc.shiftF.player.rate >= 0.9) add({ id: "winShift", family: "prevOutcome", sentence: `Quan guanyes, canvies de número el ${pct(oc.shiftF.player.rate)} de les vegades.`, counterMove: `després del teu punt descarta el que acabes de tirar.`, evidence: ev(oc.shiftF.player), strength: strengthOf(oc.shiftF.player.rate, 0.8, oc.shiftF.player.n) });
  if (oc.shiftF.player.n >= 8 && oc.shiftF.player.rate != null && oc.shiftF.player.rate <= 0.6) add({ id: "winStay", family: "prevOutcome", sentence: `Quan guanyes, repeteixes el número el ${pct(1 - oc.shiftF.player.rate)} de les vegades.`, counterMove: `després del teu punt aposta al mateix.`, evidence: { hits: oc.shiftF.player.n - oc.shiftF.player.hits, n: oc.shiftF.player.n, rate: 1 - oc.shiftF.player.rate }, strength: strengthOf(oc.shiftF.player.rate, 0.8, oc.shiftF.player.n) });
  if (oc.tilt.afterTwoLosses.n >= 8 && oc.tilt.afterTwoLosses.h != null && oc.tilt.overall.h != null && oc.tilt.afterTwoLosses.h <= oc.tilt.overall.h - 0.35) add({ id: "tilt", family: null, sentence: `Després de dues derrotes seguides, et tornes més previsible (${oc.tilt.afterTwoLosses.h.toFixed(1)} bits contra ${oc.tilt.overall.h.toFixed(1)}).`, counterMove: `quan et té dos punts seguits et llegeix millor.`, evidence: { hits: oc.tilt.afterTwoLosses.n, n: oc.tilt.afterTwoLosses.n, rate: 1 }, strength: (oc.tilt.overall.h - oc.tilt.afterTwoLosses.h) / 2 });
  // --- reactivity
  const rx = computeReactivity(history);
  if (rx.avoidRivalGuess.n >= 12 && rx.avoidRivalGuess.rate != null && rx.avoidRivalGuess.rate <= 0.08) add({ id: "avoidCalled", family: null, sentence: `Gairebé mai tires el número que t'acaba de cantar (${pct(rx.avoidRivalGuess.rate)}).`, counterMove: `el descarta i li queden quatre números.`, evidence: ev(rx.avoidRivalGuess), strength: strengthOf(rx.avoidRivalGuess.rate, 0.2, rx.avoidRivalGuess.n) });
  if (rx.mirrorRivalFingers.n >= 12 && rx.mirrorRivalFingers.rate != null && rx.mirrorRivalFingers.rate >= 0.32) add({ id: "mirror", family: "prevAiF", sentence: `Copies els dits que el rival acaba de treure el ${pct(rx.mirrorRivalFingers.rate)} de les vegades.`, counterMove: `aposta al que ell mateix acaba de tirar.`, evidence: ev(rx.mirrorRivalFingers), strength: strengthOf(rx.mirrorRivalFingers.rate, 0.2, rx.mirrorRivalFingers.n) });
  // --- reader
  const rd = computeReaderStats(history);
  if (rd.hitRivalFingers.n >= 20 && rd.hitRivalFingers.rate != null && rd.fixedGuessCeiling.rate != null && rd.fixedGuessCeiling.rate >= rd.hitRivalFingers.rate + 0.06) add({ id: "readerGap", family: null, sentence: `Endevines els seus dits el ${pct(rd.hitRivalFingers.rate)}; apostant sempre al ${rd.fixedGuessCeiling.digit} n'hauries encertat el ${pct(rd.fixedGuessCeiling.rate)}.`, counterMove: `hi ha punts al plat — mira els seus costums, no els teus.`, evidence: ev(rd.hitRivalFingers), strength: strengthOf(rd.fixedGuessCeiling.rate, rd.hitRivalFingers.rate, rd.hitRivalFingers.n) });
  // --- timing tell
  const tm = computeTiming(history);
  {
    const xs = ([1, 2, 3, 4, 5] as const).map((f) => ({ f, ...tm.intervalByF[f]! })).filter((x) => x.n >= 6 && x.meanS != null) as { f: number; n: number; meanS: number }[];
    if (xs.length >= 3) {
      const slow = xs.reduce((a, b) => (b.meanS > a.meanS ? b : a)), fast = xs.reduce((a, b) => (b.meanS < a.meanS ? b : a));
      if (slow.meanS - fast.meanS >= 0.6) add({ id: "timing", family: null, sentence: `Els teus ${slow.f} triguen ${(slow.meanS - fast.meanS).toFixed(1)} s més a sortir que els teus ${fast.f}.`, counterMove: `no ho sent — una persona sí.`, evidence: { hits: slow.n, n: slow.n + fast.n, rate: 1 }, strength: Math.min(1, (slow.meanS - fast.meanS) / 2) * Math.min(1, (slow.n + fast.n) / 20) });
    }
  }

  // --- price by family, rank
  const rk = ranking ?? (history.length >= 12 ? rankExploitValue(history) : null);
  // Prices only when the whole read is worth something: a standalone family
  // can look valuable by small-sample luck on a player El Rei cannot read
  // (uniform, 150 rows: order-2 alone "+6.6" while the full read was 0.0).
  const price = new Map<string, number>(); if (rk && rk.readValuePer100 >= 2) for (const it of rk.items) price.set(it.name, it.pointsPer100);
  for (const t of out) if (t.family && price.has(t.family) && price.get(t.family)! > 0.5) t.pointsPer100 = price.get(t.family)!;
  out.sort((a, b) => {
    const pa = a.pointsPer100 ?? -Infinity, pb = b.pointsPer100 ?? -Infinity;
    if (pa !== pb) return pb - pa;
    return b.strength - a.strength;
  });
  return out;
}

/** The headline numbers for the trends strip: the last `size` rows vs the
 * `size` before them. Predictability is El Rei's FULL read (it knew
 * everything up to each row) scored inside each window — a cold read
 * learning from 30 rows alone is noise, not a trend. */
export interface WindowSummary { n: number; predictability: number | null; entropyBits: number | null; readerHit: number | null; chase: number | null }
export function summarizeTrend(history: readonly HistoryEntry[], size = 30): { recent: WindowSummary; previous: WindowSummary } {
  const rows = history.filter((h) => h.playerFingers != null);
  const recentRows = rows.slice(-size), previousRows = rows.slice(-2 * size, -size);
  // sequential read over the whole history, hits attributed to the window the row falls in
  const startPrev = Math.max(0, rows.length - 2 * size), startRecent = Math.max(0, rows.length - size);
  let hp = 0, np = 0, hr = 0, nr = 0;
  for (let i = Math.max(5, startPrev); i < rows.length; i++) {
    const f = rows[i]!.playerFingers!; if (f < 1 || f > 5) continue;
    const d = predictPlayerFV2("L4", rows.slice(0, i)).dist;
    let best = 1; for (const v of [2, 3, 4, 5]) if (d[v as 1 | 2 | 3 | 4 | 5] > d[best as 1 | 2 | 3 | 4 | 5]) best = v;
    if (i >= startRecent) { nr++; if (best === f) hr++; } else { np++; if (best === f) hp++; }
  }
  const one = (w: readonly HistoryEntry[], hits: number, n: number): WindowSummary => {
    const o2 = computeOrder2(w); const rd = computeReaderStats(w); const gs = computeGuessStats(w);
    return { n: w.length, predictability: n ? hits / n : null, entropyBits: o2.n >= 5 ? o2.h1 : null, readerHit: rd.hitRivalFingers.rate, chase: gs.chase.rate };
  };
  return { recent: one(recentRows, hr, nr), previous: one(previousRows, hp, np) };
}
