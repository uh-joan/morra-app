// leaderboardStore.ts — the Classificació's only IO. VESSEL-wide storage
// (one table per device, all tripulants share it — the local-arcade model),
// unlike the per-profile ladder. Same graceful degradation as the profile
// registry: storage denied or full keeps an in-memory table for the session.

import { RANKING_CAP, SEED_ENTRIES, type RankEntry } from "./leaderboard.js";

export const RANKING_STORAGE_KEY = "morra-classificacio-v1";

let memory: RankEntry[] | null = null; // session table when storage is out

function isEntry(x: unknown): x is RankEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.name === "string" && typeof e.levelId === "string" &&
    typeof e.score === "number" && typeof e.you === "number" &&
    typeof e.rival === "number" && typeof e.at === "string";
}

/** The vessel's table, seeded with the corsairs on a factory-fresh (or
 * unreadable) store — the board is never empty. */
export function loadRanking(): RankEntry[] {
  if (memory) return [...memory];
  try {
    const text = localStorage.getItem(RANKING_STORAGE_KEY);
    const raw: unknown = text ? JSON.parse(text) : null;
    if (raw && typeof raw === "object" && Array.isArray((raw as { entries?: unknown }).entries)) {
      const entries = ((raw as { entries: unknown[] }).entries).filter(isEntry).slice(0, RANKING_CAP);
      if (entries.length) return entries;
    }
  } catch {
    // unreadable/denied — fall through to the seeds
  }
  return [...SEED_ENTRIES];
}

export function saveRanking(entries: readonly RankEntry[]): void {
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    memory = null;
  } catch {
    // storage full/denied — the table still lives for this session
    memory = [...entries];
  }
}
