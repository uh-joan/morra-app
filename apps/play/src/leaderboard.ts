// leaderboard.ts — la Classificació, the vessel's high-score table. PURE
// logic (the rivalLadder.ts precedent): the score formula, the ranked
// insert, the seeded corsair rows and the rank titles. IO lives in
// leaderboardStore.ts; DOM in render/classificacio.ts.
//
// Arcade model (brainstorm 2026-08-21): the board ranks MATCHES, not
// people — one tripulant can hold many slots, Asteroids-style. Only a won
// Partida mints a score (game.ts gates on scoring() + player win). The
// corsairs pre-occupy the table with scores minted by this same formula,
// so a factory-fresh vessel already has legends to dethrone.

import { GAME_WIN_SCORE } from "./config.js";

export interface RankEntry {
  /** tripulant name at win time — display only, never leaves the device */
  name: string;
  /** which corsair fell (core level id; seeds carry their OWN id) */
  levelId: string;
  score: number;
  /** the final tally, you–rival */
  you: number;
  rival: number;
  /** ISO timestamp; ties break earlier-first */
  at: string;
  /** corsair default row — styled as the house, dethroned only by score */
  seed?: true;
}

export const RANKING_CAP = 10;


// ------------------------------------------------------------- the formula

/** Per-rival base — the ladder's weights: beating El Rei ≈ four Ninos. */
const BASE_BY_LEVEL: Record<string, number> = { L1: 1000, L2: 2500, L3: 5000, L4: 10000 };

export interface StyleMetrics {
  /** synced-throw rate, 0..1 (computeSyncStats.syncRate) */
  syncRate: number | null;
  /** Shannon redundancy, 0..1 — LOWER is more random (computeRandomnessScore.redundancy) */
  redundancy: number | null;
  /** L4 top-1 predictability, 0..1 — 0.2 ≈ unreadable, 0.4+ ≈ open book */
  exploitability: number | null;
}

/** The style multiplier, 1.0–1.5: the mean of whichever components exist,
 * each normalized to [0,1]. No data → 1.0 (style never punishes silence). */
export function styleMultiplier(m: StyleMetrics): number {
  const parts: number[] = [];
  if (m.syncRate != null) parts.push(clamp01(m.syncRate));
  if (m.redundancy != null) parts.push(clamp01(1 - m.redundancy));
  if (m.exploitability != null) parts.push(clamp01(1 - m.exploitability / 0.4));
  if (!parts.length) return 1;
  return 1 + 0.5 * (parts.reduce((a, b) => a + b, 0) / parts.length);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** score = base(rival) × margin × style. Margin doubles a perfect 10-0 and
 * barely lifts a 10-9 scrape, so a clean win over Nino can rival a scrape
 * past Bru — every rung stays worth playing well. */
export function computeMatchScore(levelId: string, you: number, rival: number, metrics: StyleMetrics): number {
  const base = BASE_BY_LEVEL[levelId] ?? BASE_BY_LEVEL["L1"]!;
  const margin = 1 + Math.max(0, you - rival) / GAME_WIN_SCORE;
  return Math.round(base * margin * styleMultiplier(metrics));
}

// ------------------------------------------------------------- the table

/** Ranked insert: score desc, ties earlier-first, capped at RANKING_CAP.
 * Returns the new table and the 1-based placement — or null placement when
 * the entry didn't make the cut (the table is returned unchanged). */
export function insertEntry(
  entries: readonly RankEntry[],
  entry: RankEntry
): { entries: RankEntry[]; placement: number | null } {
  const next = [...entries, entry].sort(
    (a, b) => b.score - a.score || a.at.localeCompare(b.at)
  );
  if (next.length > RANKING_CAP) next.length = RANKING_CAP;
  const placement = next.indexOf(entry);
  return placement === -1 ? { entries: [...entries], placement: null } : { entries: next, placement: placement + 1 };
}

/** The default table starts empty — all ten rungs open, waiting for the
 * first real gesta. The render fills unclaimed positions with dashes and
 * zero points. (Mock seeds retired by user call before launch.) */
export const SEED_ENTRIES: readonly RankEntry[] = [];

/** Score display, ca-ES style: 16800 → "16.800". */
export function formatScore(score: number): string {
  return String(score).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
