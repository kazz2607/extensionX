import type { DomainMessageHandler } from './message-handler.ts';
import { mediaStore, statsStore, downloadedStore, dirtyMediaStore } from './state.ts';
import { mediaRepository } from './indexeddb.ts';
import { isValidUsername } from '../shared/validation.ts';

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
          let removed = 0;
          for (const profile of before.profiles) {
            removed += await mediaRepository.pruneMediaItems(profile.username);
            removed += await mediaRepository.pruneDownloadedUrls(profile.username);
          }
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
    default:
      return undefined;
  }
};
