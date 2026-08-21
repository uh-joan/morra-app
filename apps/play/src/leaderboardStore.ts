// leaderboardStore.ts — the Classificació's only IO, two layers now:
//
// LOCAL (localStorage, vessel-wide): the offline shadow. Same graceful
// degradation as the profile registry — storage denied keeps an in-memory
// table for the session.
//
// GLOBAL (same-origin /classificacio, the collector): the ONE arcade table
// for every vessel. The /log doctrine applies — gameplay never depends on
// the server; every failure path here resolves null and the board falls
// back to the local shadow silently.

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

// ------------------------------------------------- the global table (server)

const GLOBAL_PATH = "/classificacio";
const FETCH_TIMEOUT_MS = 2500;

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

/** The one table, or null on any failure (offline, 502, timeout). */
export async function fetchGlobalRanking(): Promise<RankEntry[] | null> {
  const t = withTimeout();
  try {
    const r = await fetch(GLOBAL_PATH, { signal: t.signal });
    if (!r.ok) return null;
    const raw: unknown = await r.json();
    const entries = (raw as { entries?: unknown })?.entries;
    if (!Array.isArray(entries)) return null;
    return entries.filter(isEntry).slice(0, RANKING_CAP);
  } catch {
    return null;
  } finally {
    t.done();
  }
}

/** Submit a won match to the global table. Resolves the server's table +
 * placement, or null on any failure — the entry then stays local-only
 * (arcade cabinets don't sync backlogs). */
export async function submitGlobalEntry(
  entry: Pick<RankEntry, "name" | "levelId" | "score" | "you" | "rival">
): Promise<{ entries: RankEntry[]; placement: number | null } | null> {
  const t = withTimeout();
  try {
    const r = await fetch(GLOBAL_PATH, { method: "POST", body: JSON.stringify(entry), signal: t.signal });
    if (!r.ok) return null;
    const raw: unknown = await r.json();
    const entries = (raw as { entries?: unknown })?.entries;
    const placement = (raw as { placement?: unknown })?.placement;
    if (!Array.isArray(entries)) return null;
    return {
      entries: entries.filter(isEntry).slice(0, RANKING_CAP),
      placement: typeof placement === "number" ? placement : null,
    };
  } catch {
    return null;
  } finally {
    t.done();
  }
}
