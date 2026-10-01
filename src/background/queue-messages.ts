import type { QueueItem } from '../types.ts';
import type { DomainMessageHandler } from './message-handler.ts';
import { isValidUsername } from '../shared/validation.ts';
import { downloadCoordinator, mediaStore } from './state.ts';
import {
  broadcastQueueUpdate,
  bulkQueueAction,
  loadPersistedQueue,
  moveQueueItem,
  persistQueue,
  profileQueue,
  resetDownloadingQueueItems,
  resumePausedQueueItems,
  retryQueueItem,
  setProfileQueue,
  startNextInQueue,
  toggleQueuePause,
} from './queue.ts';
import { retryLastDownload, stopDownload } from './downloader.ts';

const QUEUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

export const handleQueueMessage: DomainMessageHandler = (message, _sender, sendResponse) => {
  const { type, payload } = message;
  switch (type) {
    case 'ADD_TO_QUEUE': {
      const { username, filterType, skipDuplicates, keyword } = payload || {};
      if (!isValidUsername(username) || !['all', 'images', 'videos', 'gifs'].includes(String(filterType || 'all')) ||
          (keyword !== undefined && (typeof keyword !== 'string' || keyword.length > 200))) {
        sendResponse({ error: 'Invalid queue item' }); return false;
      }
      const exists = profileQueue.find(q => q.username === username && ['waiting', 'paused', 'downloading'].includes(q.status));
      if (exists) { sendResponse({ error: 'Already in queue' }); return false; }

      const item: QueueItem = {
        id: `${username}_${Date.now()}`,
        username,
        filterType: filterType || 'all',
        keyword: typeof keyword === 'string' ? keyword.trim() : '',
        skipDuplicates: skipDuplicates !== false,
        addedAt: Date.now(),
        status: 'waiting',
        mediaCount: mediaStore.get(username)?.size || 0,
        result: null,
      };
      profileQueue.push(item);
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true, queue: profileQueue });
      return true;
    }
    case 'REMOVE_FROM_QUEUE': {
      const { id } = payload || {};
      if (typeof id !== 'string' || !QUEUE_ID_PATTERN.test(id)) { sendResponse({ error: 'Invalid queue id' }); return false; }
      if (profileQueue.some(q => q.id === id && q.status === 'downloading')) {
        sendResponse({ error: 'Stop the active download before removing it' }); return false;
      }
      setProfileQueue(profileQueue.filter(q => q.id !== id));
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true });
      return false;
    }
    case 'RETRY_QUEUE_ITEM': {
      const { id } = payload || {};
      if (typeof id !== 'string' || !QUEUE_ID_PATTERN.test(id)) { sendResponse({ error: 'Invalid queue id' }); return false; }
      sendResponse({ ok: retryQueueItem(id) });
      return false;
    }
    case 'TOGGLE_QUEUE_PAUSE': {
      const { id } = payload || {};
      if (typeof id !== 'string' || !QUEUE_ID_PATTERN.test(id)) { sendResponse({ error: 'Invalid queue id' }); return false; }
      sendResponse({ ok: toggleQueuePause(id) });
      return false;
    }
    case 'REORDER_QUEUE_ITEM': {
      const { id, direction } = payload || {};
      if (typeof id !== 'string' || !QUEUE_ID_PATTERN.test(id) || (direction !== 'up' && direction !== 'down')) {
        sendResponse({ error: 'Invalid reorder request' }); return false;
      }
      sendResponse({ ok: moveQueueItem(id, direction) });
      return false;
    }
    case 'QUEUE_BULK_ACTION': {
      const { action, ids = [] } = payload || {};
      if (!['retry_errors', 'pause_selected', 'resume_selected', 'clear_completed', 'undo_clear_completed'].includes(String(action)) ||
          !Array.isArray(ids) || ids.length > 500 || ids.some((id) => typeof id !== 'string' || !QUEUE_ID_PATTERN.test(id))) {
        sendResponse({ error: 'Invalid Queue bulk action' }); return false;
      }
      sendResponse({ ok: true, ...bulkQueueAction(action as 'retry_errors' | 'pause_selected' | 'resume_selected' | 'clear_completed' | 'undo_clear_completed', ids) });
      return false;
    }
    case 'GET_QUEUE':
      void loadPersistedQueue().then(() => sendResponse({ queue: profileQueue }));
      return true;
    case 'CLEAR_QUEUE':
      setProfileQueue(profileQueue.filter(q => q.status === 'downloading'));
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true });
      return false;
    case 'START_QUEUE':
      if (downloadCoordinator.isBusy) { sendResponse({ error: 'Download is already running' }); return false; }
      resumePausedQueueItems();
      sendResponse({ ok: true });
      void startNextInQueue().catch((err: unknown) => {
        console.error('[SW] START_QUEUE failed:', err instanceof Error ? err.message : String(err));
        broadcastQueueUpdate();
      });
      return false;
    case 'GET_DOWNLOAD_STATE':
      sendResponse({ isDownloading: downloadCoordinator.isBusy, phase: downloadCoordinator.phase });
      return true;
    case 'STOP_DOWNLOAD': {
      const stopped = stopDownload();
      const resetQueueItems = resetDownloadingQueueItems();
      sendResponse({ ok: stopped || resetQueueItems > 0, resetQueueItems });
      return false;
    }
    case 'RETRY_FAILED':
      sendResponse({ ok: retryLastDownload() });
      return false;
    default:
      return undefined;
  }
};
