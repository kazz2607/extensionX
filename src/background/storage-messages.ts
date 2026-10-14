import type { DomainMessageHandler } from './message-handler.ts';
import { mediaStore, statsStore, downloadedStore, dirtyMediaStore, tabState } from './state.ts';
import { releasePersistedEntries } from '../shared/dirty-batch.ts';
import { mediaRepository } from './indexeddb.ts';
import { cancelDownloadedPersist, reloadMediaCache } from './scraper.ts';
import { isValidUsername } from '../shared/validation.ts';
import { t } from '../lib/i18n.ts';
import { clearFailedItems, clearFailedItemsForUser } from './failed-items.ts';
import { buildBackup, restoreBackupSection } from './backup.ts';
import { BACKUP_MAX_URLS_PER_PROFILE, type BackupSection } from '../shared/backup.ts';

const BACKUP_SECTIONS: ReadonlySet<unknown> = new Set<BackupSection>(['savedJobs', 'schedules', 'queue', 'history', 'downloaded']);

const PRUNE_CONCURRENCY = 8;

async function runBounded<T>(items: readonly T[], worker: (item: T) => Promise<number>): Promise<number> {
  let cursor = 0;
  let removed = 0;
  const runners = Array.from({ length: Math.min(PRUNE_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      removed += await worker(item);
    }
  });
  await Promise.all(runners);
  return removed;
}

export const handleStorageMessage: DomainMessageHandler = (message, _sender, sendResponse) => {
  const { type, payload } = message;
  switch (type) {
    case 'GET_STORAGE_SUMMARY':
      void mediaRepository.getStorageSummary()
        .then((summary) => sendResponse({ summary }))
        .catch(() => sendResponse({ error: t('bg_err_storage_inspect') }));
      return true;
    case 'PRUNE_STORAGE':
      void (async () => {
        try {
          const before = await mediaRepository.getStorageSummary();
          const now = Date.now();
          const removed = await runBounded(before.profiles, async (profile) => {
            const username = profile.username;
            // Write media collected but not yet persisted first; pruning used
            // to drop it together with the RAM cache.
            const dirty = dirtyMediaStore.get(username);
            if (dirty?.size) {
              const entries = [...dirty.entries()];
              await mediaRepository.saveMediaItems(username, entries.map(([, item]) => item));
              releasePersistedEntries(dirty, entries);
            }
            const count = await mediaRepository.pruneMediaItems(username, now)
              + await mediaRepository.pruneDownloadedUrls(username, now);
            // A profile being collected (or with unsaved items) gets its cache
            // rebuilt so pruned records leave RAM too; others reload lazily.
            const collecting = [...tabState.values()].some((state) => state.isCollecting && state.username === username);
            if (mediaStore.has(username) && (collecting || dirtyMediaStore.get(username)?.size)) {
              await reloadMediaCache(username, now);
            } else {
              mediaStore.delete(username);
              statsStore.delete(username);
            }
            downloadedStore.delete(username);
            return count;
          });
          sendResponse({ ok: true, removed, summary: await mediaRepository.getStorageSummary() });
        } catch {
          sendResponse({ error: t('bg_err_storage_prune') });
        }
      })();
      return true;
    case 'CLEAR_PROFILE_STORAGE': {
      const username = payload?.username;
      if (!isValidUsername(username)) { sendResponse({ error: t('bg_err_invalid_username') }); return false; }
      void (async () => {
        try {
          await Promise.all([
            mediaRepository.clearMediaItems(username),
            mediaRepository.clearDownloadedUrls(username),
            clearFailedItemsForUser(username),
          ]);
          mediaStore.delete(username);
          statsStore.delete(username);
          cancelDownloadedPersist(username);
          downloadedStore.delete(username);
          dirtyMediaStore.delete(username);
          sendResponse({ ok: true, summary: await mediaRepository.getStorageSummary() });
        } catch {
          sendResponse({ error: t('bg_err_storage_clear_profile') });
        }
      })();
      return true;
    }
    case 'EXPORT_BACKUP':
      void buildBackup().then(sendResponse, (error: unknown) => {
        console.warn('[SW] EXPORT_BACKUP failed:', error instanceof Error ? error.message : String(error));
        sendResponse({ error: t('bg_err_backup_export') });
      });
      return true;
    case 'RESTORE_BACKUP_SECTION': {
      const section = payload?.section;
      const items = payload?.items;
      if (!BACKUP_SECTIONS.has(section) || !Array.isArray(items) || items.length > BACKUP_MAX_URLS_PER_PROFILE) {
        sendResponse({ ok: false, error: t('bg_err_backup_invalid') });
        return false;
      }
      void restoreBackupSection(section, items, payload?.username).then(
        (count) => sendResponse({ ok: true, count }),
        (error: unknown) => {
          console.warn('[SW] RESTORE_BACKUP_SECTION failed:', error instanceof Error ? error.message : String(error));
          sendResponse({ ok: false, error: t('bg_err_backup_restore') });
        },
      );
      return true;
    }
    case 'CLEAR_ALL_PROFILE_STORAGE':
      void (async () => {
        try {
          await Promise.all([
            mediaRepository.clearAllMediaItems(),
            mediaRepository.clearAllDownloadedUrls(),
            clearFailedItems(),
          ]);
          mediaStore.clear();
          statsStore.clear();
          cancelDownloadedPersist();
          downloadedStore.clear();
          dirtyMediaStore.clear();
          sendResponse({ ok: true, summary: await mediaRepository.getStorageSummary() });
        } catch {
          sendResponse({ error: t('bg_err_storage_clear_media') });
        }
      })();
      return true;
    default:
      return undefined;
  }
};
