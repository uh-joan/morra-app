// cacheKey.ts — pure Cache Storage naming/GC logic for assetManager.ts.
// Not a spike port (the spike never used Cache Storage — see
// assetManager.ts's header for why that's a deliberate platform-web
// addition, not a discrepancy). A cache is named `${namespace}:${version}`
// so bumping `version` naturally invalidates everything under that
// namespace without fighting individual-entry eviction; staleCacheNames
// finds the old-version caches (within the SAME namespace only) so they can
// be deleted during a cleanup pass.

export function buildCacheName(namespace: string, version: string): string {
  return `${namespace}:${version}`;
}

export function staleCacheNames(existingNames: readonly string[], namespace: string, currentName: string): string[] {
  const prefix = `${namespace}:`;
  return existingNames.filter((name) => name.startsWith(prefix) && name !== currentName);
}
