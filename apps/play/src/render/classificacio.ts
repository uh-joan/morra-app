// render/classificacio.ts — the Classificació screen: the vessel's top-10,
// arcade-table anatomy at its purest (position · name · score). Pure
// data→DOM over leaderboardStore's table; names are player input, so all
// text lands via textContent.

import { formatScore, RANKING_CAP } from "../leaderboard.js";
import { loadRanking } from "../leaderboardStore.js";

export function renderClassificacioScreen(): void {
  const list = document.getElementById("rankingList");
  if (!list) return;
  const entries = loadRanking();
  // All ten rungs, always — the classic table shows the places still there
  // for the taking. Unclaimed rows render dim, with dashes.
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
