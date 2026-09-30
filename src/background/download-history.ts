import type { HistoryEntry, MediaFilterType } from '../types.ts';
import { chromeApi } from './chrome-api.ts';
import { createDownloadHistorySnapshot, migrateDownloadHistoryStorage } from '../shared/download-history.ts';

const STORAGE_KEY = 'download_history_v2';
const LEGACY_STORAGE_KEY = 'download_history';

export async function listDownloadHistory(): Promise<HistoryEntry[]> {
  const stored = await chromeApi.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY]);
  const hasVersionedHistory = stored[STORAGE_KEY] !== undefined;
  const snapshot = migrateDownloadHistoryStorage(
    hasVersionedHistory ? stored[STORAGE_KEY] : stored[LEGACY_STORAGE_KEY],
  );
  if (!hasVersionedHistory && stored[LEGACY_STORAGE_KEY] !== undefined) {
    await chromeApi.storage.local.set({ [STORAGE_KEY]: snapshot });
  }
  return snapshot.entries;
}

export async function recordDownloadHistory(
  username: string,
  filter: MediaFilterType,
  result: { success: number; failed: number; skipped: number },
): Promise<void> {
  const entries = await listDownloadHistory();
  const status = result.failed > 0
    ? (result.success > 0 ? 'partial' : 'failed')
    : 'completed';
  entries.unshift({
    username,
    count: result.success,
    filter,
    date: new Date().toISOString(),
    success: result.success,
    failed: result.failed,
    skipped: result.skipped,
    status,
  });
  await chromeApi.storage.local.set({
    [STORAGE_KEY]: createDownloadHistorySnapshot(entries),
    // Keep a v6-compatible mirror so rollback does not hide recent history.
    [LEGACY_STORAGE_KEY]: entries.slice(0, 20),
  });
}
