import { downloadCoordinator } from './state.ts';
import { startDownload } from './downloader.ts';
import { broadcastToPopup } from './utils.ts';
import { QueueItem, QueueExportData } from '../types.ts';
import { parseQueueItems } from '../shared/validation.ts';
import { createQueueStorageSnapshot, migrateQueueStorage } from '../shared/storage-migrations.ts';
import { recoverQueueItemAfterRestart, transitionQueueItem, findInterruptedIds, resetDownloadingItemsAfterStop } from '../shared/queue-state.ts';
import { chromeApi } from './chrome-api.ts';

export let profileQueue: QueueItem[] = [];
export function setProfileQueue(q: QueueItem[]) { profileQueue = q; }

// Pha 10: id các queue item vừa bị reset do gián đoạn (SW restart hoặc import lại
// giữa chừng) — chỉ dùng để ép skipDuplicates=true cho ĐÚNG 1 lần resume kế tiếp
// của item đó, không lưu trữ và không đổi preference skipDuplicates người dùng đã lưu.
const _forceDedupOnNextRun = new Set<string>();
let _lastBulkRemoved: QueueItem[] = [];
let _lastBulkRemovedAt = 0;

let _queueLoadPromise: Promise<void> | null = null;
function loadPersistedQueue(): Promise<void> {
  if (_queueLoadPromise) return _queueLoadPromise;
  _queueLoadPromise = (async () => {
    try {
      const data = await chromeApi.storage.local.get('profile_queue');
      const rawQueue = data.profile_queue;
      const rawItems = Array.isArray(rawQueue)
        ? rawQueue
        : rawQueue && typeof rawQueue === 'object' && Array.isArray((rawQueue as { items?: unknown }).items)
          ? (rawQueue as { items: unknown[] }).items
          : [];
      const interruptedIds = findInterruptedIds(rawItems);
      const saved = migrateQueueStorage(rawQueue).items;
      for (const id of interruptedIds) _forceDedupOnNextRun.add(id);
      // Các item đang 'downloading' khi SW restart → đặt lại 'waiting'
      profileQueue = saved.map(recoverQueueItemAfterRestart);
      if (interruptedIds.size > 0) void persistQueueImmediately();
    } catch (_) {
      profileQueue = [];
    }
  })();
  return _queueLoadPromise;
}

let _queuePersistTimer: ReturnType<typeof setTimeout> | null = null;
function persistQueue() {
  if (_queuePersistTimer) clearTimeout(_queuePersistTimer);
  _queuePersistTimer = setTimeout(async () => {
    _queuePersistTimer = null;
    try {
      await chromeApi.storage.local.set({ profile_queue: createQueueStorageSnapshot(profileQueue) });
    } catch (err: unknown) {
      console.debug('[SW] persistQueue error:', err instanceof Error ? err.message : String(err));
    }
  }, 500);
}

function broadcastQueueUpdate() {
  broadcastToPopup('QUEUE_UPDATE', { queue: profileQueue });
}

async function startNextInQueue(): Promise<boolean> {
  await loadPersistedQueue();
  if (downloadCoordinator.isBusy) return false;

  const next = profileQueue.find(item => item.status === 'waiting');
  if (!next) return false;

  const operation = downloadCoordinator.begin(next.username, 'queue', next.id);
  if (!operation) return false;

  const downloadingItem = transitionQueueItem(next, 'downloading');
  if (!downloadingItem) {
    downloadCoordinator.release(operation.id);
    return false;
  }
  Object.assign(next, downloadingItem);
  await persistQueueImmediately();
  broadcastQueueUpdate();

  const forceDedup = _forceDedupOnNextRun.delete(next.id);
  void startDownload(next.username, {
    filterType: (next.filterType || 'all') as 'all' | 'images' | 'videos' | 'gifs',
    keyword: next.keyword,
    skipDuplicates: forceDedup ? true : next.skipDuplicates !== false,
    _fromQueue: true,
    _queueId: next.id,
    _operationId: operation.id,
  });
  return true;
}

async function persistQueueImmediately(): Promise<void> {
  if (_queuePersistTimer) {
    clearTimeout(_queuePersistTimer);
    _queuePersistTimer = null;
  }
  try {
    await chromeApi.storage.local.set({ profile_queue: createQueueStorageSnapshot(profileQueue) });
  } catch (err: unknown) {
    console.debug('[SW] persistQueueImmediately error:', err instanceof Error ? err.message : String(err));
  }
}

function resetDownloadingQueueItems(): number {
  const result = resetDownloadingItemsAfterStop(profileQueue);
  profileQueue = result.queue;
  const { reset } = result;
  if (reset > 0) {
    void persistQueueImmediately();
    broadcastQueueUpdate();
  }
  return reset;
}

// Khởi tải queue từ storage khi SW khởi động
loadPersistedQueue().then(() => {
  // Không auto-resume download ngay khi SW khởi động lại — chờ user tương tác
  broadcastQueueUpdate();
});

// ─── FEA-02: Queue Export / Import ───────────────────────────────────────────

function exportQueue(): QueueExportData {
  return {
    _version: '7.2.0',
    _exportedAt: new Date().toISOString(),
    queue: profileQueue,
  };
}

function importQueue(items: unknown): { added: number; skipped: number; error?: string } {
  // Bugfix Pha 10: phải tìm id "đang dang dở" trên dữ liệu THÔ trước khi
  // parseQueueItems tự chuẩn hoá 'downloading' → 'waiting' trong lúc parse —
  // kiểm tra sau khi parse (như code cũ) luôn ra false, dedupe-on-resume không
  // bao giờ chạy cho nhánh import.
  const interruptedIds = findInterruptedIds(items);
  const parsedItems = parseQueueItems(items);
  if (!parsedItems) return { added: 0, skipped: 0, error: 'Invalid queue data' };
  let added = 0;
  let skipped = 0;

  for (const item of parsedItems) {
    // Bỏ qua items đã done/error — không cần re-import
    if (item.status === 'done' || item.status === 'error' || item.status === 'cancelled') {
      skipped++;
      continue;
    }
    // Không thêm trùng id
    if (profileQueue.some(q => q.id === item.id)) {
      skipped++;
      continue;
    }
    // Reset downloading → waiting (SW đã tắt, không còn active)
    if (interruptedIds.has(item.id)) _forceDedupOnNextRun.add(item.id); // Pha 10
    profileQueue.push({ ...item, status: interruptedIds.has(item.id) ? 'paused' : item.status, paused: undefined });
    added++;
  }

  if (added > 0) {
    persistQueue();
    broadcastQueueUpdate();
  }
  return { added, skipped };
}

// ─── Pha 12: Quản lý hàng đợi nâng cao (pause / reorder / retry) ─────────────

function retryQueueItem(id: string): boolean {
  const idx = profileQueue.findIndex(q => q.id === id);
  if (idx === -1) return false;
  const retried = transitionQueueItem(profileQueue[idx], 'waiting');
  if (!retried) return false;
  profileQueue[idx] = retried;
  persistQueue();
  broadcastQueueUpdate();
  startNextInQueue();
  return true;
}

function toggleQueuePause(id: string): boolean {
  const idx = profileQueue.findIndex(q => q.id === id && (q.status === 'waiting' || q.status === 'paused'));
  if (idx === -1) return false;
  const target = profileQueue[idx].status === 'paused' ? 'waiting' : 'paused';
  const transitioned = transitionQueueItem(profileQueue[idx], target);
  if (!transitioned) return false;
  profileQueue[idx] = transitioned;
  persistQueue();
  broadcastQueueUpdate();
  // Item vừa được resume (bỏ paused) có thể trở thành next — thử chạy ngay nếu rảnh
  startNextInQueue();
  return true;
}

function resumePausedQueueItems(): number {
  let resumed = 0;
  profileQueue = profileQueue.map((item) => {
    if (item.status !== 'paused') return item;
    resumed++;
    return transitionQueueItem(item, 'waiting') ?? item;
  });
  if (resumed > 0) {
    persistQueue();
    broadcastQueueUpdate();
  }
  return resumed;
}

function moveQueueItem(id: string, direction: 'up' | 'down'): boolean {
  const idx = profileQueue.findIndex(q => q.id === id);
  if (idx === -1) return false;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= profileQueue.length) return false;
  [profileQueue[idx], profileQueue[targetIdx]] = [profileQueue[targetIdx], profileQueue[idx]];
  persistQueue();
  broadcastQueueUpdate();
  return true;
}

function bulkQueueAction(action: 'retry_errors' | 'pause_selected' | 'resume_selected' | 'clear_completed' | 'undo_clear_completed', ids: readonly string[] = []): { changed: number; removed: QueueItem[] } {
  const selected = new Set(ids);
  const removed: QueueItem[] = [];
  let changed = 0;
  if (action === 'undo_clear_completed') {
    if (Date.now() - _lastBulkRemovedAt <= 10_000) {
      for (const item of _lastBulkRemoved) {
        if (!profileQueue.some((current) => current.id === item.id)) { profileQueue.push(item); changed++; }
      }
    }
    _lastBulkRemoved = [];
    _lastBulkRemovedAt = 0;
  } else if (action === 'clear_completed') {
    const retained = profileQueue.filter((item) => {
      if (item.status !== 'done' && item.status !== 'cancelled') return true;
      removed.push(item);
      return false;
    });
    changed = removed.length;
    setProfileQueue(retained);
    _lastBulkRemoved = removed;
    _lastBulkRemovedAt = Date.now();
  } else {
    profileQueue = profileQueue.map((item) => {
      if (action !== 'retry_errors' && !selected.has(item.id)) return item;
      const target = action === 'retry_errors' && item.status === 'error' ? 'waiting'
        : action === 'pause_selected' && item.status === 'waiting' ? 'paused'
          : action === 'resume_selected' && item.status === 'paused' ? 'waiting' : null;
      if (!target) return item;
      const transitioned = transitionQueueItem(item, target);
      if (!transitioned) return item;
      changed++;
      return transitioned;
    });
  }
  if (changed > 0) {
    persistQueue();
    broadcastQueueUpdate();
    if (action === 'retry_errors' || action === 'resume_selected') void startNextInQueue();
  }
  return { changed, removed };
}

export {
  loadPersistedQueue, persistQueue, persistQueueImmediately, broadcastQueueUpdate, startNextInQueue, exportQueue, importQueue,
  retryQueueItem, toggleQueuePause, resumePausedQueueItems, moveQueueItem, resetDownloadingQueueItems,
  bulkQueueAction,
};
