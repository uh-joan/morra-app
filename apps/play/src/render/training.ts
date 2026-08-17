// render/training.ts — ports spikes/s03-beat.html L3240–3303: "L'Espill",
// the training-mode mirror panel. Every number comes straight from
// @morra/core's mirror functions (the machine-verified ports of
// modules/mirror.mjs); this file only formats and lays out. Unlike the
// spike's innerHTML strings, everything is built via createElement/
// textContent (XSS discipline, same as the rest of render/).

import {
  computeBigramHeatmap,
  computeHistograms,
  computeRandomnessScore,
  computeSyncStats,
  computeExploitabilityV2,
  computeTells2,
  computeTopTells,
  explainReadV2,
  rankExploitValue,
  summarizeTrend,
  type ExploitRanking,
  type HistogramSection,
  type TopWord,
  type HistoryEntry,
} from "@morra/core";
import { el } from "../dom.js";
import { TRAINING_PANEL_TEXT } from "../game/copy.js";

export type MirrorScope = "session" | "allTime";

function histogramBars(histSection: HistogramSection): HTMLLIElement[] {
  const maxPct = histSection.total ? Math.max(1, ...histSection.list.map((x) => x.pct)) : 1;
  return histSection.list.map((x) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = String(x.value);
    const barWrap = document.createElement("span");
    barWrap.className = "hist-bar-wrap";
    const fill = document.createElement("span");
    fill.className = "hist-bar-fill";
    fill.style.width = histSection.total ? `${(x.pct / maxPct) * 100}%` : "0%";
    barWrap.appendChild(fill);
    const pct = document.createElement("span");
    pct.textContent = histSection.total ? `${x.pct.toFixed(0)}%` : "—";
    li.append(label, barWrap, pct);
    return li;
  });
}

function topWordsList(topWords: readonly TopWord[]): HTMLLIElement[] {
  if (!topWords.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    return [li];
  }
  return topWords.slice(0, 5).map((w) => {
    const li = document.createElement("li");
    const word = document.createElement("span");
    word.textContent = `"${w.word}"`;
    const pct = document.createElement("span");
    pct.textContent = `${w.pct.toFixed(0)}%`;
    li.append(word, pct);
    return li;
  });
}

// low -> high probability, reusing the page's existing --good scale
const HEATMAP_COLORS = ["#1f242c", "#2a3a2f", "#356148", "#2ea043", "#35d07f"];
function heatmapColorFor(p: number | null): string | null {
  if (p == null) return null;
  return HEATMAP_COLORS[Math.min(HEATMAP_COLORS.length - 1, Math.floor(p * HEATMAP_COLORS.length))]!;
}

function heatmapGrid(heatmap: ReturnType<typeof computeBigramHeatmap>): HTMLElement[] {
  const cells: HTMLElement[] = [];
  const label = (text: string) => {
    const d = document.createElement("div");
    d.className = "hm-label";
    d.textContent = text;
    return d;
  };
  cells.push(label(""));
  for (const to of [1, 2, 3, 4, 5]) cells.push(label(String(to)));
  for (const from of [1, 2, 3, 4, 5] as const) {
    cells.push(label(String(from)));
    for (const to of [1, 2, 3, 4, 5] as const) {
      const p = heatmap.probabilities[from]![to]!;
      const color = heatmapColorFor(p);
      const cell = document.createElement("div");
      cell.title = `${from}→${to}: ${p != null ? (p * 100).toFixed(0) + "%" : "no data"}`;
      if (color != null && p != null) {
        cell.className = "hm-cell";
        cell.style.background = color;
        cell.textContent = (p * 100).toFixed(0);
      } else {
        cell.className = "hm-cell hm-empty";
        cell.textContent = "–";
      }
      cells.push(cell);
    }
  }
  return cells;
}

export function renderTrainingPanel(history: readonly HistoryEntry[], scope: MirrorScope): void {
  const exploit = computeExploitabilityV2(history); // El Rei's read (v2), not the spike's
  const randomness = computeRandomnessScore(history);
  const hist = computeHistograms(history);
  const heatmap = computeBigramHeatmap(history);
  const syncStats = computeSyncStats(history);

  el.tileExploitability.textContent = exploit.rate != null ? `${(exploit.rate * 100).toFixed(0)}%` : "—";
  el.tileRandomness.textContent = randomness ? `${randomness.redundancyPct.toFixed(1)}%` : "—";
  el.tileSyncRate.textContent = syncStats.syncRate != null ? `${(syncStats.syncRate * 100).toFixed(0)}%` : "—";
  el.tileMedianDelta.textContent = syncStats.medianAbsDeltaMs != null ? `${syncStats.medianAbsDeltaMs.toFixed(0)}ms` : "—";

  el.fHistogram.replaceChildren(...histogramBars(hist.f));
  el.gHistogram.replaceChildren(...histogramBars(hist.g));
  el.topCallsList.replaceChildren(...topWordsList(hist.topWords));

  renderTells(history, scope);
  renderTrends(history);

  el.bigramHeatmap.replaceChildren(...heatmapGrid(heatmap));
  renderRead(history);

  el.trainingSampleCount.textContent = `${history.length} tir${history.length === 1 ? "" : "s"} (${scope === "session" ? "aquesta sessió" : "tot el temps"})`;
  el.btnScopeSession.classList.toggle("primary", scope === "session");
  el.btnScopeAllTime.classList.toggle("primary", scope === "allTime");
}

// "El que veu El Rei": the read, shown. Same functions the L4 policy uses
// (explainReadV2) — the belief about the next fingers, what drives it, where
// it thinks the player will look, and whether the player is reading it.
const MIN_ROUNDS_FOR_READ = 8;
function beliefBars(dist: Record<number, number>, top: number): HTMLLIElement[] {
  const list = [1, 2, 3, 4, 5].map((v) => ({ value: v, pct: dist[v]! * 100 }));
  const items = histogramBars({ total: 1, list } as HistogramSection);
  items.forEach((li, i) => { if (list[i]!.value === top) li.classList.add("read-top"); });
  return items;
}
function renderRead(history: readonly HistoryEntry[]): void {
  const r = explainReadV2(history);
  const pct = (x: number) => (x * 100).toFixed(0);
  if (r.rounds < MIN_ROUNDS_FOR_READ) {
    el.readHeadline.textContent = TRAINING_PANEL_TEXT.readTooEarly(r.rounds);
    el.readFBelief.replaceChildren(); el.readDrivers.replaceChildren(); el.readGBelief.replaceChildren();
    el.readSelfWatch.textContent = "";
    return;
  }
  // a read worth naming: the top digit clears the coin by a margin
  if (r.topP >= 0.26) {
    const strong = document.createElement("strong"); strong.textContent = String(r.top);
    el.readHeadline.replaceChildren(TRAINING_PANEL_TEXT.readHeadlineBefore, strong, TRAINING_PANEL_TEXT.readHeadlineAfter(Number(pct(r.topP))));
  } else {
    el.readHeadline.textContent = TRAINING_PANEL_TEXT.readHeadlineFlat;
  }
  el.readFBelief.replaceChildren(...beliefBars(r.fBelief, r.top));
  el.readGBelief.replaceChildren(...beliefBars(r.gBelief, r.gTop));
  el.readDrivers.replaceChildren(
    ...r.drivers.slice(0, 3).map((d) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = TRAINING_PANEL_TEXT.driverNames[d.name] ?? d.name;
      const w = document.createElement("span");
      w.textContent = `${pct(d.weight)}%`;
      li.append(name, w);
      return li;
    })
  );
  el.readSelfWatch.textContent =
    r.playerHitRate == null ? TRAINING_PANEL_TEXT.readSelfWatchNone
    : r.playerHitRate > 0.24 ? TRAINING_PANEL_TEXT.readSelfWatchHigh(Number(pct(r.playerHitRate)))
    : TRAINING_PANEL_TEXT.readSelfWatch(Number(pct(r.playerHitRate)));
}

// ------------------------------------------------------------ ranked tells (tells2)
// The exploit-value ranking replays El Rei's read over the profile (~1 s per
// 100 rows) — memoized per scope and refreshed every 5 new rows, so the
// per-throw rerender in Entrenament stays cheap; the tells themselves are.
const rankCache = new Map<string, { bucket: number; ranking: ExploitRanking }>();
function rankingFor(history: readonly HistoryEntry[], scope: MirrorScope): ExploitRanking | undefined {
  if (history.length < 12) return undefined;
  const bucket = Math.floor(history.length / 5);
  const hit = rankCache.get(scope);
  if (hit && hit.bucket === bucket) return hit.ranking;
  const ranking = rankExploitValue(history);
  rankCache.set(scope, { bucket, ranking });
  return ranking;
}
function renderTells(history: readonly HistoryEntry[], scope: MirrorScope): void {
  const tells = computeTells2(history, rankingFor(history, scope));
  if (tells.length) {
    el.tellsList.replaceChildren(
      ...tells.slice(0, 6).map((t) => {
        const li = document.createElement("li");
        li.dataset.tell = t.id;
        const main = document.createElement("div"); main.className = "tell-main"; main.textContent = t.sentence;
        const meta = document.createElement("div"); meta.className = "tell-meta";
        if (t.pointsPer100 != null) { const price = document.createElement("span"); price.className = "tell-price"; price.textContent = TRAINING_PANEL_TEXT.tellPrice(t.pointsPer100); meta.append(price, " · "); }
        meta.append(TRAINING_PANEL_TEXT.tellEvidence(t.evidence.hits, t.evidence.n));
        const counter = document.createElement("div"); counter.className = "tell-counter"; counter.textContent = TRAINING_PANEL_TEXT.tellCounterPrefix + t.counterMove;
        li.append(main, meta, counter);
        return li;
      })
    );
    return;
  }
  // the older, cheaper tells trigger on fewer rows — keep them as the early voice
  const early = computeTopTells(history);
  if (early.length) { el.tellsList.replaceChildren(...early.map((t) => { const li = document.createElement("li"); const main = document.createElement("div"); main.className = "tell-main"; main.textContent = t.sentence; li.append(main); return li; })); return; }
  const li = document.createElement("li");
  li.textContent = TRAINING_PANEL_TEXT.tellsEmpty;
  el.tellsList.replaceChildren(li);
}

// ------------------------------------------------------------ trends: last 30 vs the 30 before
const TREND_WINDOW = 30;
function renderTrends(history: readonly HistoryEntry[]): void {
  const t = summarizeTrend(history, TREND_WINDOW);
  if (t.previous.n < TREND_WINDOW) {
    const note = document.createElement("div"); note.className = "trend-note"; note.textContent = TRAINING_PANEL_TEXT.trendTooEarly;
    el.trendStrip.replaceChildren(note);
    return;
  }
  const a = t.recent, b = t.previous;
  const pct = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
  const bits = (x: number | null) => (x == null ? "—" : `${x.toFixed(2)} bits`);
  // higherIsBetter: entropy and reader-hit; the rest, lower is better
  const items: { key: string; now: string; delta: number | null; good: boolean }[] = [
    { key: "predictability", now: pct(a.predictability), delta: a.predictability != null && b.predictability != null ? a.predictability - b.predictability : null, good: (a.predictability ?? 0) <= (b.predictability ?? 0) },
    { key: "entropy", now: bits(a.entropyBits), delta: a.entropyBits != null && b.entropyBits != null ? a.entropyBits - b.entropyBits : null, good: (a.entropyBits ?? 0) >= (b.entropyBits ?? 0) },
    { key: "reader", now: pct(a.readerHit), delta: a.readerHit != null && b.readerHit != null ? a.readerHit - b.readerHit : null, good: (a.readerHit ?? 0) >= (b.readerHit ?? 0) },
    { key: "chase", now: pct(a.chase), delta: a.chase != null && b.chase != null ? a.chase - b.chase : null, good: (a.chase ?? 0) <= (b.chase ?? 0) },
  ];
  const tiles = items.map((it) => {
    const d = document.createElement("div"); d.className = "trend";
    const v = document.createElement("b"); v.textContent = it.now;
    const arrow = document.createElement("span"); arrow.className = it.good ? "up" : "down";
    arrow.textContent = it.delta == null ? "" : ` ${it.delta > 0 ? "▲" : it.delta < 0 ? "▼" : "="} ${it.key === "entropy" ? Math.abs(it.delta).toFixed(2) : (Math.abs(it.delta) * 100).toFixed(0) + " pt"}`;
    v.append(arrow);
    d.append(v, TRAINING_PANEL_TEXT.trendLabels[it.key] ?? it.key);
    return d;
  });
  const note = document.createElement("div"); note.className = "trend-note"; note.textContent = TRAINING_PANEL_TEXT.trendTitle(TREND_WINDOW);
  el.trendStrip.replaceChildren(...tiles, note);
}
