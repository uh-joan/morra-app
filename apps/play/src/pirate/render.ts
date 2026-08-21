// pirate/render.ts — mounts the corsair figure + stage scenery and layers
// ALL round choreography on top of the existing render pipeline via
// MutationObservers. Nothing here is ever awaited by the game: analysis.ts
// and game.ts render first (the reveal snap stays untouched), and these
// observers fire in the same frame as pure visual after-effects. Zero
// timing-layer contact — this file only reads the DOM the game already
// wrote and decorates it.

import { el } from "../dom.js";
import { GAME_WIN_SCORE } from "../config.js";
import { pirateForLevel, pickTaunt, type Pirate, type PirateReaction } from "./cast.js";
import { artWithUniqueIds, PIRATE_ART, SCENERY, WAVES_SVG } from "./art.js";

let current: Pirate | null = null;
let tauntTimer: ReturnType<typeof setTimeout> | null = null;
let reactTimer: ReturnType<typeof setTimeout> | null = null;

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** Swap in a rival: figure, nameplate, stage scenery, greeting. */
export function setPirate(levelId: string): void {
  const p = pirateForLevel(levelId);
  if (current?.levelId === p.levelId) return;
  current = p;
  document.body.dataset.stage = p.stageId;
  // Constant authored art — the documented innerHTML exception (no data).
  el.rivalAvatar.innerHTML = artWithUniqueIds(PIRATE_ART[p.levelId] ?? "", "stage");
  const scenery = byId("stageScenery");
  if (scenery) scenery.innerHTML = (SCENERY[p.stageId] ?? "") + WAVES_SVG;
  const name = byId("rivalNameplate");
  const title = byId("rivalNameplateTitle");
  if (name) name.textContent = p.name;
  if (title) title.textContent = p.title;
  showTaunt(pickTaunt(p, "greet"));
}

export function currentPirate(): Pirate | null {
  return current;
}

function showTaunt(text: string): void {
  const bubble = byId("tauntBubble");
  if (!bubble || !text) return;
  bubble.textContent = text;
  bubble.classList.add("show");
  if (tauntTimer) clearTimeout(tauntTimer);
  tauntTimer = setTimeout(() => bubble.classList.remove("show"), 2800);
}

type ReactKind = "win" | "lose" | "parata" | "void" | "thrust" | "matchWin" | "matchLose";

function react(kind: ReactKind): void {
  const frame = byId("rivalFigureFrame");
  if (!frame) return;
  frame.classList.remove("react-win", "react-lose", "react-parata", "react-void", "react-thrust", "react-matchWin", "react-matchLose");
  // force a reflow so re-adding the class restarts the animation
  void frame.offsetWidth;
  frame.classList.add("react-" + kind);
  if (reactTimer) clearTimeout(reactTimer);
  reactTimer = setTimeout(() => frame.classList.remove("react-" + kind), 1200);
}

function tauntFor(reaction: PirateReaction): void {
  if (current) showTaunt(pickTaunt(current, reaction));
}

// ------------------------------------------------------------- treasure
// The scoreboard keeps its text (the harness reads it); we mirror it into
// two rows of doubloons and drive the match-point tension state.

const SCORE_RE = /Tu (\d+) — (\d+) Rival/;
let lastPlayer = 0;
let lastAi = 0;

function buildCoinRow(container: HTMLElement): void {
  container.replaceChildren(
    ...Array.from({ length: GAME_WIN_SCORE }, () => {
      const c = document.createElement("span");
      c.className = "coin";
      return c;
    })
  );
}

function renderCoins(player: number, ai: number): void {
  const rowP = byId("coinsPlayer");
  const rowA = byId("coinsRival");
  for (const [row, score, prev] of [
    [rowP, player, lastPlayer],
    [rowA, ai, lastAi],
  ] as const) {
    if (!row) continue;
    if (row.children.length !== GAME_WIN_SCORE) buildCoinRow(row);
    Array.from(row.children).forEach((coin, i) => {
      const full = i < score;
      const was = coin.classList.contains("full");
      coin.classList.toggle("full", full);
      coin.classList.toggle("pop", full && !was && score > prev);
    });
  }
  lastPlayer = player;
  lastAi = ai;
  const matchPoint = player === GAME_WIN_SCORE - 1 || ai === GAME_WIN_SCORE - 1;
  document.body.classList.toggle("match-point", matchPoint);
  // r3: which side is at match point drives the strip's glow
  const strip = byId("scoreStrip");
  if (strip) strip.dataset.matchpoint = player === GAME_WIN_SCORE - 1 && ai === GAME_WIN_SCORE - 1 ? "both" : player === GAME_WIN_SCORE - 1 ? "you" : ai === GAME_WIN_SCORE - 1 ? "rival" : "";
}

function syncCoinsFromScoreboard(): void {
  const m = SCORE_RE.exec(el.scoreboard.textContent ?? "");
  if (m) renderCoins(parseInt(m[1]!, 10), parseInt(m[2]!, 10));
}

// ---------------------------------------------------------- choreography

const ROUND_REACTIONS: Record<string, { react: ReactKind; taunt: PirateReaction }> = {
  "TU GUANYES!": { react: "lose", taunt: "lose" },
  "RIVAL GUANYA": { react: "win", taunt: "win" },
  // the shared tie wears three faces (copy.ts PARATA_HEADLINE + the
  // context-free CAP PUNT) — all the same shrug on stage
  "EMPAT!": { react: "parata", taunt: "parata" },
  "PER A NINGÚ": { react: "parata", taunt: "parata" },
  "CAP PUNT": { react: "parata", taunt: "parata" },
  "RONDA ANUL·LADA": { react: "void", taunt: "void" },
};

export function installPirateChoreography(): void {
  // Reveal snap: the digit gains .revealed the instant the move unseals.
  new MutationObserver(() => {
    if (el.rivalHandDigit.classList.contains("revealed")) react("thrust");
  }).observe(el.rivalHandDigit, { attributes: true, attributeFilter: ["class"] });

  // Round verdicts: game.ts writes the card text; we act it out.
  new MutationObserver(() => {
    const hit = ROUND_REACTIONS[(el.roundResultText.textContent ?? "").trim()];
    if (!hit) return;
    react(hit.react);
    tauntFor(hit.taunt);
  }).observe(el.roundResultText, { childList: true });

  // Treasure: mirror the scoreboard into doubloons + match-point state.
  new MutationObserver(syncCoinsFromScoreboard).observe(el.scoreboard, { childList: true });
  syncCoinsFromScoreboard();

  // Match end: the banner's inline display flips to block.
  new MutationObserver(() => {
    const over = el.gameEndBanner.style.display !== "none";
    document.body.classList.toggle("match-over", over);
    if (!over) {
      document.body.classList.remove("match-won", "match-lost");
      return;
    }
    const playerWon = (el.gameEndText.textContent ?? "").startsWith("Has guanyat");
    document.body.classList.toggle("match-won", playerWon);
    document.body.classList.toggle("match-lost", !playerWon);
    react(playerWon ? "matchLose" : "matchWin");
    tauntFor(playerWon ? "matchLose" : "matchWin");
  }).observe(el.gameEndBanner, { attributes: true, attributeFilter: ["style"] });
}
