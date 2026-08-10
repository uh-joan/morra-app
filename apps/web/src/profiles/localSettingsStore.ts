// localSettingsStore.ts — the real browser SettingsStore (gameStore.ts's
// port), backed by localJsonStore.ts, keyed per-profile (Feature 3b:
// velocity thresholds, co-occurrence window, VAD sensitivity, AND reset
// palette preferences all live inside GameSettings already, so keying the
// whole object by profileId covers all of them in one place).
import type { GameSettings, SettingsStore } from "../game/gameStore.js";
import { loadJson, saveJson } from "./localJsonStore.js";

const SETTINGS_KEY_PREFIX = "morra-web-settings:";

export class LocalSettingsStore implements SettingsStore {
  load(profileId: string): GameSettings | null {
    return loadJson<GameSettings>(SETTINGS_KEY_PREFIX + profileId);
  }

  save(profileId: string, settings: GameSettings): boolean {
    return saveJson(SETTINGS_KEY_PREFIX + profileId, settings);
  }
}
