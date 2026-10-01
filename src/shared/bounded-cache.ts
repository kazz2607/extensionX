export interface CacheEntryMeta {
  key: string;
  size: number;
  lastAccess: number;
  protected: boolean;
}

/** Returns least-recently-used, unprotected entries that must be evicted. */
export function selectCacheEvictions(entries: readonly CacheEntryMeta[], maxEntries: number, maxItems: number): string[] {
  let entryCount = entries.length;
  let itemCount = entries.reduce((sum, entry) => sum + entry.size, 0);
  const candidates = entries.filter((entry) => !entry.protected).sort((a, b) => a.lastAccess - b.lastAccess);
  const evicted: string[] = [];
  for (const entry of candidates) {
    if (entryCount <= maxEntries && itemCount <= maxItems) break;
    evicted.push(entry.key);
    entryCount--;
    itemCount -= entry.size;
  }
  return evicted;
}
