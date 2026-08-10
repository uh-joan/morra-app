// profileTypes.ts — Feature 3 (player profiles): pure types and transforms
// only, no storage I/O (that's localJsonStore.ts / localProfileRegistryStore.ts
// / localSettingsStore.ts's job) — same purity discipline gameStore.ts
// itself follows, and specifically what lets these transforms be imported
// directly into gameStore.ts without dragging an ambient `localStorage`
// dependency into the one module this codebase keeps fully testable via
// injected deps (GameStoreDeps.profileRegistryStore/settingsStore).
export interface PlayerProfile {
  id: string;
  name: string;
}

export interface ProfileRegistry {
  profiles: PlayerProfile[];
  lastPlayedProfileId: string | null;
}

/** The profile every fresh install starts with — auto-loaded with zero
 * friction (Feature 3a's "DEFAULT: auto-load the last-played profile
 * without friction") until the player renames themselves via the picker.
 * Never deleted automatically; a player can always fall back to it. */
export const DEFAULT_PROFILE_ID = "default";
const DEFAULT_PROFILE_NAME = "Jugador";

export function emptyRegistry(): ProfileRegistry {
  return { profiles: [{ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }], lastPlayedProfileId: DEFAULT_PROFILE_ID };
}

/** Guards against a corrupt/empty persisted registry the same way
 * LocalStoragePlayerModelStore's load() guards against malformed data —
 * always returns a registry with at least one profile. */
export function normalizeRegistry(registry: ProfileRegistry | null | undefined): ProfileRegistry {
  if (!registry || !Array.isArray(registry.profiles) || registry.profiles.length === 0) return emptyRegistry();
  return registry;
}

/** Timestamp+random id — these are local player-picker ids (distinguishing
 * "Jani" from "Rafa" on one shared device), not security-sensitive, so
 * Math.random is fine here unlike commit.ts's nonce generation. */
export function makeProfileId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Never mutates the input registry. */
export function addProfile(registry: ProfileRegistry, name: string): { registry: ProfileRegistry; profile: PlayerProfile } {
  const profile: PlayerProfile = { id: makeProfileId(), name: name.trim() || DEFAULT_PROFILE_NAME };
  const next: ProfileRegistry = { profiles: [...registry.profiles, profile], lastPlayedProfileId: profile.id };
  return { registry: next, profile };
}

/** Never mutates the input registry. */
export function setLastPlayed(registry: ProfileRegistry, profileId: string): ProfileRegistry {
  return { ...registry, lastPlayedProfileId: profileId };
}

/** The initial profileId a fresh GameStore should activate — the
 * last-played one if the registry has it, else its first profile, else the
 * hardcoded default. Pure so it's covered directly by unit tests instead of
 * only indirectly through GameStore's constructor. */
export function resolveInitialProfileId(registry: ProfileRegistry): string {
  return registry.lastPlayedProfileId ?? registry.profiles[0]?.id ?? DEFAULT_PROFILE_ID;
}
