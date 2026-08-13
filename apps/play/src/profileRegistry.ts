// profileRegistry.ts — PURE profile-registry logic (node-testable; no
// storage IO — profile.ts owns that). Design per the rebuild plan's
// future-profiles seam: the DEFAULT profile maps to the spike's legacy
// storage key ("morra-s03-playermodel-v1"), so the player's accumulated
// history simply IS the default profile — zero migration. Additional
// profiles get namespaced keys.

export const DEFAULT_PROFILE_ID = "default";
export const LEGACY_PLAYER_MODEL_KEY = "morra-s03-playermodel-v1";
export const PROFILE_MODEL_KEY_PREFIX = "morra-playermodel-v1:";
export const REGISTRY_STORAGE_KEY = "morra-play-profiles-v1";
export const REGISTRY_VERSION = 1;

export interface ProfileEntry {
  id: string;
  name: string;
  createdAtIso: string | null; // null for the implicit default profile
}

export interface ProfileRegistry {
  version: number;
  activeId: string;
  profiles: ProfileEntry[];
}

export function defaultRegistry(defaultName: string): ProfileRegistry {
  return {
    version: REGISTRY_VERSION,
    activeId: DEFAULT_PROFILE_ID,
    profiles: [{ id: DEFAULT_PROFILE_ID, name: defaultName, createdAtIso: null }],
  };
}

/** Parse + repair whatever came out of storage: guarantees the default
 * profile exists (first), ids are unique, and activeId points at a real
 * profile. Any malformed input degrades to the default registry. */
export function normalizeRegistry(raw: unknown, defaultName: string): ProfileRegistry {
  const base = defaultRegistry(defaultName);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as { activeId?: unknown; profiles?: unknown };
  if (!Array.isArray(r.profiles)) return base;
  const seen = new Set<string>([DEFAULT_PROFILE_ID]);
  const extras: ProfileEntry[] = [];
  for (const p of r.profiles) {
    if (!p || typeof p !== "object") continue;
    const e = p as { id?: unknown; name?: unknown; createdAtIso?: unknown };
    if (typeof e.id !== "string" || !e.id || e.id === DEFAULT_PROFILE_ID || seen.has(e.id)) continue;
    if (typeof e.name !== "string" || !e.name.trim()) continue;
    seen.add(e.id);
    extras.push({ id: e.id, name: e.name.trim(), createdAtIso: typeof e.createdAtIso === "string" ? e.createdAtIso : null });
  }
  // Preserve a customized default-profile name if one was stored.
  const storedDefault = r.profiles.find(
    (p): p is { id: string; name: string } =>
      !!p && typeof p === "object" && (p as { id?: unknown }).id === DEFAULT_PROFILE_ID &&
      typeof (p as { name?: unknown }).name === "string" && !!(p as { name: string }).name.trim()
  );
  const profiles: ProfileEntry[] = [
    { id: DEFAULT_PROFILE_ID, name: storedDefault ? storedDefault.name.trim() : defaultName, createdAtIso: null },
    ...extras,
  ];
  const activeId = typeof r.activeId === "string" && profiles.some((p) => p.id === r.activeId) ? r.activeId : DEFAULT_PROFILE_ID;
  return { version: REGISTRY_VERSION, activeId, profiles };
}

export function storageKeyFor(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? LEGACY_PLAYER_MODEL_KEY : PROFILE_MODEL_KEY_PREFIX + profileId;
}

/** Never mutates; rejects blank names and duplicate ids. */
export function createProfile(reg: ProfileRegistry, id: string, name: string, createdAtIso: string): ProfileRegistry | null {
  const trimmed = name.trim();
  if (!trimmed || !id || reg.profiles.some((p) => p.id === id)) return null;
  return {
    version: REGISTRY_VERSION,
    activeId: id, // a new profile becomes active immediately
    profiles: [...reg.profiles, { id, name: trimmed, createdAtIso }],
  };
}

/** Never mutates; the default profile cannot be deleted. Deleting the
 * active profile falls back to the default. */
export function deleteProfile(reg: ProfileRegistry, id: string): ProfileRegistry | null {
  if (id === DEFAULT_PROFILE_ID || !reg.profiles.some((p) => p.id === id)) return null;
  return {
    version: REGISTRY_VERSION,
    activeId: reg.activeId === id ? DEFAULT_PROFILE_ID : reg.activeId,
    profiles: reg.profiles.filter((p) => p.id !== id),
  };
}

/** Never mutates; unknown ids are rejected. */
export function setActiveProfile(reg: ProfileRegistry, id: string): ProfileRegistry | null {
  if (!reg.profiles.some((p) => p.id === id)) return null;
  if (reg.activeId === id) return reg;
  return { ...reg, activeId: id };
}
