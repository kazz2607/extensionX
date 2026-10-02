import type { DomainMessageHandler } from './message-handler.ts';
import { mediaStore, statsStore, downloadedStore, dirtyMediaStore } from './state.ts';
import { mediaRepository } from './indexeddb.ts';
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
            const count = await mediaRepository.pruneMediaItems(profile.username, now)
              + await mediaRepository.pruneDownloadedUrls(profile.username, now);
            mediaStore.delete(profile.username);
            statsStore.delete(profile.username);
            downloadedStore.delete(profile.username);
            dirtyMediaStore.delete(profile.username);
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
