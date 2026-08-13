// profile.ts — the ONLY module that touches player-model/profile storage.
// The future-profiles seam from the rebuild plan, now realized: a profile
// registry (localStorage, morra-play-profiles-v1) maps profile ids to
// player-model storage keys via profileRegistry.ts's pure logic. The
// DEFAULT profile resolves to the spike's legacy key
// ("morra-s03-playermodel-v1") — the user's accumulated history IS the
// default profile, zero migration. All registry mutations go through the
// pure functions; this file only does the IO and key resolution.

import { LocalStoragePlayerModelStore } from "@morra/platform-web";
import type { PlayerModel } from "@morra/core";
import {
  createProfile,
  deleteProfile,
  normalizeRegistry,
  REGISTRY_STORAGE_KEY,
  setActiveProfile,
  storageKeyFor,
  type ProfileEntry,
  type ProfileRegistry,
} from "./profileRegistry.js";
import { PROFILE_TEXT } from "./game/copy.js";

const store = new LocalStoragePlayerModelStore();

function readRegistry(): ProfileRegistry {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(REGISTRY_STORAGE_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  return normalizeRegistry(raw, PROFILE_TEXT.defaultName);
}

function writeRegistry(reg: ProfileRegistry): void {
  try {
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(reg));
  } catch {
    // storage unavailable (private browsing etc.) — the in-memory copy
    // below still works for this session, matching the model store's own
    // graceful degradation.
  }
}

let registry: ProfileRegistry = readRegistry();

function activeKey(): string {
  return storageKeyFor(registry.activeId);
}

// --- player model IO (key always resolved through the ACTIVE profile) ---

export function loadPlayerModel(): PlayerModel {
  return store.load(activeKey());
}

export function savePlayerModel(model: PlayerModel): boolean {
  return store.save(model, activeKey());
}

export function clearPlayerModel(): boolean {
  return store.clear(activeKey());
}

// --- registry surface (consumed by profiles.ts and the seam) ---

export function getProfiles(): readonly ProfileEntry[] {
  return registry.profiles;
}

export function getActiveProfileId(): string {
  return registry.activeId;
}

export function getActiveProfileName(): string {
  return registry.profiles.find((p) => p.id === registry.activeId)?.name ?? registry.activeId;
}

/** Creates AND activates; returns the new id, or null on invalid name. */
export function createAndActivateProfile(name: string): string | null {
  const id = "p" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const next = createProfile(registry, id, name, new Date().toISOString());
  if (!next) return null;
  registry = next;
  writeRegistry(registry);
  return id;
}

/** Returns true if the active profile actually changed. */
export function activateProfile(id: string): boolean {
  const next = setActiveProfile(registry, id);
  if (!next || next === registry) return false;
  registry = next;
  writeRegistry(registry);
  return true;
}

/** Deletes the profile AND its stored model; default is not deletable.
 * Returns true when something was deleted (active falls back to default). */
export function deleteProfileById(id: string): boolean {
  const next = deleteProfile(registry, id);
  if (!next) return false;
  store.clear(storageKeyFor(id));
  registry = next;
  writeRegistry(registry);
  return true;
}
