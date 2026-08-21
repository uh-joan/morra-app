// render/classificacio.ts — the Classificació screen: the vessel's view of
// the ONE arcade table. The local shadow renders instantly (no spinner),
// then the global table swaps in when the fetch lands and becomes the new
// shadow. Offline (or server down): the shadow stands, with a dim note.
// Pure data→DOM; names are player input, so all text lands via textContent.

import { formatScore, RANKING_CAP, type RankEntry } from "../leaderboard.js";
import { fetchGlobalRanking, loadRanking, saveRanking } from "../leaderboardStore.js";

function renderRows(entries: readonly RankEntry[]): void {
  const list = document.getElementById("rankingList");
  if (!list) return;
  // All ten rungs, always — unclaimed rows render dim, zero points.
  list.replaceChildren(
    ...Array.from({ length: RANKING_CAP }, (_, i) => {
      const e = entries[i];
      const li = document.createElement("li");
      li.className = e ? "rank-row" : "rank-row buida";
      const pos = document.createElement("span");
      pos.className = "rank-title";
      pos.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "rank-name";
      name.textContent = e ? e.name : "—";
      const score = document.createElement("span");
      score.className = "rank-score";
      score.textContent = formatScore(e ? e.score : 0);
      li.append(pos, name, score);
      return li;
    })
  );
}

let renderToken = 0; // a stale fetch never paints over a newer entry

export function renderClassificacioScreen(): void {
  const token = ++renderToken;
  const offline = document.getElementById("classifOffline");
  if (offline) offline.hidden = true;
  renderRows(loadRanking());
  void fetchGlobalRanking().then((global) => {
    if (token !== renderToken) return; // superseded by a fresh entry
    if (document.body.dataset.screen !== "classificacio") return; // navigated away
    if (global) {
      saveRanking(global); // the shadow follows the one table
      renderRows(global);
    } else if (offline) {
      offline.hidden = false;
    }
  });
}
