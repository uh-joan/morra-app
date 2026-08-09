// useStore.ts — the ONE React hook allowed to read gameStore.ts, per the
// M4 React-boundary law: narrow selectors via useSyncExternalStore, never
// raw state. Caches the selected value across renders/notifications by
// BOTH raw-state-reference identity (cheap, the common case — setState
// always creates a new state object even when unrelated fields changed)
// and value-equality of the selected slice itself (so a component
// subscribed to e.g. `s => s.gameScore.player` doesn't re-render just
// because some OTHER field on the state object changed) — this is what
// keeps re-renders down to genuinely low-frequency projections.
import { useRef, useSyncExternalStore } from "react";
import type { GameState, GameStore } from "../game/gameStore.js";

export function useGameStore<T>(
  store: GameStore,
  selector: (state: GameState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const cacheRef = useRef<{ state: GameState; selected: T } | null>(null);

  const getSnapshot = (): T => {
    const state = store.getSnapshot();
    const cache = cacheRef.current;
    if (cache && cache.state === state) return cache.selected;
    const selected = selector(state);
    if (cache && isEqual(cache.selected, selected)) {
      cacheRef.current = { state, selected: cache.selected };
      return cache.selected;
    }
    cacheRef.current = { state, selected };
    return selected;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
