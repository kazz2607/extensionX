import type { DomainMessageHandler } from './message-handler.ts';
import { mediaStore, statsStore, downloadedStore, dirtyMediaStore, tabState } from './state.ts';
import { releasePersistedEntries } from '../shared/dirty-batch.ts';
import { mediaRepository } from './indexeddb.ts';
import { cancelDownloadedPersist, reloadMediaCache } from './scraper.ts';
import { isValidUsername } from '../shared/validation.ts';

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
        .catch(() => sendResponse({ error: 'Unable to inspect local storage' }));
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
          sendResponse({ error: 'Unable to prune local storage' });
        }
      })();
      return true;
    case 'CLEAR_PROFILE_STORAGE': {
      const username = payload?.username;
      if (!isValidUsername(username)) { sendResponse({ error: 'Invalid username' }); return false; }
      void (async () => {
        try {
          await Promise.all([
            mediaRepository.clearMediaItems(username),
            mediaRepository.clearDownloadedUrls(username),
          ]);
          mediaStore.delete(username);
          statsStore.delete(username);
          cancelDownloadedPersist(username);
          downloadedStore.delete(username);
          dirtyMediaStore.delete(username);
          sendResponse({ ok: true, summary: await mediaRepository.getStorageSummary() });
        } catch {
          sendResponse({ error: 'Unable to clear profile storage' });
        }
      })();
      return true;
    }
    case 'CLEAR_ALL_PROFILE_STORAGE':
      void (async () => {
        try {
          await Promise.all([
            mediaRepository.clearAllMediaItems(),
            mediaRepository.clearAllDownloadedUrls(),
          ]);
          mediaStore.clear();
          statsStore.clear();
          cancelDownloadedPersist();
          downloadedStore.clear();
          dirtyMediaStore.clear();
          sendResponse({ ok: true, summary: await mediaRepository.getStorageSummary() });
        } catch {
          sendResponse({ error: 'Unable to clear local media storage' });
        }
      })();
      return true;
    default:
      return undefined;
  }
};
