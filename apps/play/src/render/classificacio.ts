// render/classificacio.ts — the Classificació screen: the vessel's top-10,
// arcade-table anatomy at its purest (position · name · score). Pure
// data→DOM over leaderboardStore's table; names are player input, so all
// text lands via textContent.

import { formatScore } from "../leaderboard.js";
import { loadRanking } from "../leaderboardStore.js";

/** Attract mode on the title: the top-3, one line at a time, drifting by
 * near the top of the port. CSS owns the slow crossfade (12s loop, one row
 * per 4s slot via animation-delay); reduced-motion pins the first row. */
export function renderTitleRanking(): void {
  const host = document.getElementById("titleRanking");
  if (!host) return;
  host.replaceChildren(
    ...loadRanking().slice(0, 3).map((e, i) => {
      const row = document.createElement("span");
      row.className = "tr-row";
      row.style.animationDelay = `${i * 4}s`;
      row.textContent = `${i + 1} · ${e.name} · ${formatScore(e.score)}`;
      return row;
    })
  );
}

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
