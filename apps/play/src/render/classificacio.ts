// render/classificacio.ts — the Classificació screen: the vessel's top-10,
// arcade-table anatomy at its purest (position · name · score). Pure
// data→DOM over leaderboardStore's table; names are player input, so all
// text lands via textContent.

import { formatScore } from "../leaderboard.js";
import { loadRanking } from "../leaderboardStore.js";

export function renderClassificacioScreen(): void {
  const list = document.getElementById("rankingList");
  if (!list) return;
  const entries = loadRanking();
  list.replaceChildren(
    ...entries.map((e, i) => {
      const li = document.createElement("li");
      li.className = "rank-row";
      const pos = document.createElement("span");
      pos.className = "rank-title";
      pos.textContent = String(i + 1);
      const name = document.createElement("span");
      name.className = "rank-name";
      name.textContent = e.name;
      const score = document.createElement("span");
      score.className = "rank-score";
      score.textContent = formatScore(e.score);
      li.append(pos, name, score);
      return li;
    })
  );
}
