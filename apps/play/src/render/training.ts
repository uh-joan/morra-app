// render/training.ts — ports spikes/s03-beat.html L3240–3303: "L'Espill",
// the training-mode mirror panel. Every number comes straight from
// @morra/core's mirror functions (the machine-verified ports of
// modules/mirror.mjs); this file only formats and lays out. Unlike the
// spike's innerHTML strings, everything is built via createElement/
// textContent (XSS discipline, same as the rest of render/).

import {
  computeBigramHeatmap,
  computeExploitability,
  computeHistograms,
  computeRandomnessScore,
  computeSyncStats,
  computeTopTells,
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
  const exploit = computeExploitability(history);
  const randomness = computeRandomnessScore(history);
  const hist = computeHistograms(history);
  const tells = computeTopTells(history);
  const heatmap = computeBigramHeatmap(history);
  const syncStats = computeSyncStats(history);

  el.tileExploitability.textContent = exploit.rate != null ? `${(exploit.rate * 100).toFixed(0)}%` : "—";
  el.tileRandomness.textContent = randomness ? `${randomness.redundancyPct.toFixed(1)}%` : "—";
  el.tileSyncRate.textContent = syncStats.syncRate != null ? `${(syncStats.syncRate * 100).toFixed(0)}%` : "—";
  el.tileMedianDelta.textContent = syncStats.medianAbsDeltaMs != null ? `${syncStats.medianAbsDeltaMs.toFixed(0)}ms` : "—";

  el.fHistogram.replaceChildren(...histogramBars(hist.f));
  el.gHistogram.replaceChildren(...histogramBars(hist.g));
  el.topCallsList.replaceChildren(...topWordsList(hist.topWords));

  if (tells.length) {
    el.tellsList.replaceChildren(
      ...tells.map((t) => {
        const li = document.createElement("li");
        li.textContent = t.sentence;
        return li;
      })
    );
  } else {
    const li = document.createElement("li");
    li.textContent = TRAINING_PANEL_TEXT.tellsEmpty;
    el.tellsList.replaceChildren(li);
  }

  el.bigramHeatmap.replaceChildren(...heatmapGrid(heatmap));

  el.trainingSampleCount.textContent = `${history.length} tir${history.length === 1 ? "" : "s"} (${scope === "session" ? "aquesta sessió" : "tot el temps"})`;
  el.btnScopeSession.classList.toggle("primary", scope === "session");
  el.btnScopeAllTime.classList.toggle("primary", scope === "allTime");
}
