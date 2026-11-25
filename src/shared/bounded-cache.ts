export interface CacheEntryMeta {
  key: string;
  size: number;
  lastAccess: number;
  protected: boolean;
}

/**
 * P18: tỉa lịch sử URL đã tải của một profile trong cùng lượt đọc — bỏ bản ghi
 * quá hạn, rồi bỏ bản cũ nhất khi vượt giới hạn; chỉ sort khi thực sự vượt.
 * Trả id cần xoá và URL giữ lại (đúng thứ tự đọc).
 */
export function planDownloadedUrlPrune<T extends { id: string; url: string; addedAt: number }>(
  records: readonly T[], now: number, maxEntries: number, ttlMs: number,
): { removeIds: string[]; keptUrls: string[] } {
  const expiresBefore = now - ttlMs;
  const removeIds: string[] = [];
  let retained = records.filter((record) => {
    if (record.addedAt >= expiresBefore) return true;
    removeIds.push(record.id);
    return false;
  });
  if (retained.length > maxEntries) {
    const overflow = new Set([...retained].sort((a, b) => a.addedAt - b.addedAt).slice(0, retained.length - maxEntries).map((record) => record.id));
    overflow.forEach((id) => removeIds.push(id));
    retained = retained.filter((record) => !overflow.has(record.id));
  }
  return { removeIds, keptUrls: retained.map((record) => record.url) };
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
