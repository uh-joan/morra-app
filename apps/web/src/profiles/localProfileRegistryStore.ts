// localProfileRegistryStore.ts — the real browser ProfileRegistryStore
// (gameStore.ts's port), backed by localJsonStore.ts. Instantiated once in
// appSingletons.ts, same composition-root pattern as every other real
// storage port in this app.
import { normalizeRegistry, type ProfileRegistry } from "./profileTypes.js";
import { loadJson, saveJson } from "./localJsonStore.js";
import type { ProfileRegistryStore } from "../game/gameStore.js";

export const PROFILE_REGISTRY_STORAGE_KEY = "morra-web-profile-registry-v1";

export class LocalProfileRegistryStore implements ProfileRegistryStore {
  load(): ProfileRegistry {
    return normalizeRegistry(loadJson<ProfileRegistry>(PROFILE_REGISTRY_STORAGE_KEY));
  }

  save(registry: ProfileRegistry): boolean {
    return saveJson(PROFILE_REGISTRY_STORAGE_KEY, registry);
  }
}
