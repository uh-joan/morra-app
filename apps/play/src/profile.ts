// profile.ts — the ONLY module that touches player-model/profile storage.
// The future-profiles seam from the rebuild plan, now realized: a profile
// registry (localStorage, morra-play-profiles-v1) maps profile ids to
// player-model storage keys via profileRegistry.ts's pure logic. The
// DEFAULT profile resolves to the spike's legacy key
// ("morra-s03-playermodel-v1") — the user's accumulated history IS the
// default profile, zero migration. All registry mutations go through the
// pure functions; this file only does the IO and key resolution.

import { LocalStoragePlayerModelStore } from "@morra/platform-web";
import { prunePhantomThrows, sha256Hex, type PlayerModel } from "@morra/core";
import { logEvent } from "./telemetry.js";
import {
  createProfile,
  deleteProfile,
  needsFirstRun,
  normalizeRegistry,
  REGISTRY_STORAGE_KEY,
  renameProfile,
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
  const raw = store.load(activeKey());
  // Data hygiene: purge the retraction phantoms older builds recorded
  // (fingers <= 1, never revealed, not synced — see core playermodel.ts).
  // Saved back once so the next load is clean; the count is logged so the
  // field can see how much poison each profile carried.
  const { model, removed } = prunePhantomThrows(raw);
  if (removed > 0) {
    store.save(model, activeKey());
    logEvent("player_model_pruned", { profileId: registry.activeId, removed, kept: model.throws.length });
  }
  return model;
}

export function savePlayerModel(model: PlayerModel): boolean {
  return store.save(model, activeKey());
}

export function clearPlayerModel(): boolean {
  return store.clear(activeKey());
}

// --- rival ladder (per-profile conquest record) ---
// Keyed off the active profile's model key so every tripulant climbs their
// own ladder; a distinct suffix keeps it clear of the player-model blob.
// rivalLadder.ts owns the pure unlock logic; this is only the IO.
const LADDER_KEY_SUFFIX = "::ladder-v1";

function ladderKey(): string {
  return activeKey() + LADDER_KEY_SUFFIX;
}

/** The set of rival level ids the active profile has beaten in a duel. */
export function loadBeatenRivals(): Set<string> {
  try {
    const text = localStorage.getItem(ladderKey());
    const raw: unknown = text ? JSON.parse(text) : null;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Marks a rival beaten. Returns true only when it's a NEW conquest — the
 * caller uses that to fire the unlock celebration exactly once. */
export function recordRivalBeaten(levelId: string): boolean {
  const beaten = loadBeatenRivals();
  if (beaten.has(levelId)) return false;
  beaten.add(levelId);
  try {
    localStorage.setItem(ladderKey(), JSON.stringify([...beaten]));
  } catch {
    // storage unavailable — the win still shows this session, it just
    // won't persist, matching the model store's graceful degradation.
  }
  return true;
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

/** A pseudonymous, stable token for a player NAME — for telemetry only.
 * Since the one-tripulant-per-device redesign the profileId is almost
 * always "default", so the name is what tells players apart in the logs;
 * this lets the logs do that WITHOUT ever carrying the raw name off the
 * device (privacy gate before strangers play). Case/space-folded so
 * "Jani" and "jani " map together; sha256, truncated — the logs only need
 * to group, never to recover the name. */
export function profileNameHash(name: string): string {
  const normalized = name.trim().toLocaleLowerCase("ca");
  return sha256Hex(`morra-profile|${normalized}`).slice(0, 12);
}

/** True while the registry still looks factory-fresh (only an untouched
 * "Principal") — the first-run onboarding gate reads this at boot. */
export function needsFirstRunProfile(): boolean {
  return needsFirstRun(registry, PROFILE_TEXT.defaultName);
}

/** Renames a profile in place — the first-run flow claims the default
 * profile this way, so its storage key and any accumulated history carry
 * over. Returns true when the name actually changed. */
export function renameProfileById(id: string, name: string): boolean {
  const next = renameProfile(registry, id, name);
  if (!next || next === registry) return false;
  registry = next;
  writeRegistry(registry);
  return true;
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
