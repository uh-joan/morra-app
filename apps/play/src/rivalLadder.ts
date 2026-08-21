// rivalLadder.ts — the ladder of conquest: you earn each corsair by beating
// the one before. PURE logic over a set of beaten level ids; the IO (which
// tripulant's ladder, where it's stored) lives in profile.ts, and the
// visuals in screens.ts. The order is core's LEVEL_ORDER (L1→L4 = Nino →
// Bru → Mercè → El Rei), so the ladder never drifts from the roster.
//
// The rule: L1 (Nino) is always open; every other rival opens the moment its
// immediate predecessor has been beaten in a scored duel. Only Partida wins
// count — sparring in Entrenament never advances the ladder (game.ts records
// under `scoring()` only).

import { LEVEL_ORDER } from "@morra/core";

export type LevelId = (typeof LEVEL_ORDER)[number];

/** True if this rival can be faced given who's already been beaten. The
 * first rung — and any id the roster doesn't know — is always open. */
export function isRivalUnlocked(level: string, beaten: ReadonlySet<string>): boolean {
  const i = LEVEL_ORDER.indexOf(level as LevelId);
  if (i <= 0) return true;
  return beaten.has(LEVEL_ORDER[i - 1]!);
}

/** The rival you must beat to open this one — null for the first rung. */
export function predecessorLevel(level: string): LevelId | null {
  const i = LEVEL_ORDER.indexOf(level as LevelId);
  return i > 0 ? LEVEL_ORDER[i - 1]! : null;
}

/** The rival unlocked by beating this one — null when it's the last rung. */
export function successorLevel(level: string): LevelId | null {
  const i = LEVEL_ORDER.indexOf(level as LevelId);
  return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1]! : null;
}

/** The current challenge: the first rival that's open but not yet beaten —
 * the card the select screen glows as "el següent". Null once all are down. */
export function frontierLevel(beaten: ReadonlySet<string>): LevelId | null {
  for (const lv of LEVEL_ORDER) {
    if (isRivalUnlocked(lv, beaten) && !beaten.has(lv)) return lv;
  }
  return null;
}
