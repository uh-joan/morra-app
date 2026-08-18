// rivalState.ts — the rival as a dimension of BOTH modes (2026-08-17).
// The duel is against a rival; Entrenament is sparring with a rival — the
// same round loop without score — or "sol, davant l'espill" (nobody throws
// back). The level select (selAiLevel) stays the single source of truth for
// WHICH rival; this module adds the solo flag and the URL slugs.
export type RivalSlug = "nino" | "bru" | "merce" | "rei";
export const SOLO_SLUG = "sol";
const SLUG_BY_LEVEL: Record<string, RivalSlug> = { L1: "nino", L2: "bru", L3: "merce", L4: "rei" };
const LEVEL_BY_SLUG: Record<string, string> = { nino: "L1", bru: "L2", merce: "L3", rei: "L4" };
export function slugForLevel(level: string): RivalSlug { return SLUG_BY_LEVEL[level] ?? "nino"; }
export function levelForSlug(slug: string): string | null { return LEVEL_BY_SLUG[slug] ?? null; }

let solo = false;
/** Entrenament without a partner (the mirror alone). Irrelevant in Partida. */
export function isSoloTraining(): boolean { return solo; }
export function setSoloTraining(v: boolean): void { solo = v; document.body.dataset.solo = v ? "on" : "off"; }
