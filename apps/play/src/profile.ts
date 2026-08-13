// profile.ts — the ONLY module that knows the player-model storage key and
// owns the PlayerModelStore. This is the designated future-profiles seam:
// profile work (default profile = this legacy key, additional profiles =
// namespaced keys + one-time migration) touches this file plus a UI
// surface, nothing else.
//
// The key is the SPIKE's key ("morra-s03-playermodel-v1", not apps/web's
// "morra-platform-web-…"): one canonical player-model identity across the
// codebase, and the user's real accumulated history carries over when the
// app is served same-origin with the spike.

import { LocalStoragePlayerModelStore } from "@morra/platform-web";
import type { PlayerModel } from "@morra/core";

export const PLAYER_MODEL_STORAGE_KEY = "morra-s03-playermodel-v1";

const store = new LocalStoragePlayerModelStore();

export function loadPlayerModel(): PlayerModel {
  return store.load(PLAYER_MODEL_STORAGE_KEY);
}

export function savePlayerModel(model: PlayerModel): boolean {
  return store.save(model, PLAYER_MODEL_STORAGE_KEY);
}

export function clearPlayerModel(): boolean {
  return store.clear(PLAYER_MODEL_STORAGE_KEY);
}
