import { mediaStore, downloadState } from './state.ts';
import { getMediaItems } from './indexeddb.ts';
import { startDownload } from './downloader.ts';
import { broadcastToPopup } from './utils.ts';
import { QueueItem, QueueExportData } from '../types.ts';
import { parseQueueItems } from '../shared/validation.ts';
import { recoverQueueItemAfterRestart, transitionQueueItem, wasInterrupted, findInterruptedIds, resetDownloadingItemsAfterStop } from '../shared/queue-state.ts';
import { isVideoThumbnailUrl } from '../shared/media-filter.ts';

export let profileQueue: QueueItem[] = [];
export function setProfileQueue(q: QueueItem[]) { profileQueue = q; }

// Pha 10: id các queue item vừa bị reset do gián đoạn (SW restart hoặc import lại
// giữa chừng) — chỉ dùng để ép skipDuplicates=true cho ĐÚNG 1 lần resume kế tiếp
// của item đó, không lưu trữ và không đổi preference skipDuplicates người dùng đã lưu.
const _forceDedupOnNextRun = new Set<string>();

let _queueLoadPromise: Promise<void> | null = null;
function loadPersistedQueue(): Promise<void> {
  if (_queueLoadPromise) return _queueLoadPromise;
  _queueLoadPromise = (async () => {
    try {
      const data = await chrome.storage.local.get('profile_queue');
      const saved: QueueItem[] = (data.profile_queue as QueueItem[]) || [];
      for (const item of saved) {
        if (wasInterrupted(item)) _forceDedupOnNextRun.add(item.id);
      }
      // Các item đang 'downloading' khi SW restart → đặt lại 'waiting'
      profileQueue = saved.map(recoverQueueItemAfterRestart);
    } catch (_) {
      profileQueue = [];
    }
  })();
  return _queueLoadPromise;
}

let _queuePersistTimer: ReturnType<typeof setTimeout> | null = null;
let _queueStartPending = false;
let _queueStartCancelled = false;
function persistQueue() {
  if (_queuePersistTimer) clearTimeout(_queuePersistTimer);
  _queuePersistTimer = setTimeout(async () => {
    _queuePersistTimer = null;
    try {
      await chrome.storage.local.set({ profile_queue: profileQueue });
    } catch (err: any) {
      console.debug('[SW] persistQueue error:', err.message);
    }
  }, 500);
}

function broadcastQueueUpdate() {
  broadcastToPopup('QUEUE_UPDATE', { queue: profileQueue });
}

async function startNextInQueue(): Promise<boolean> {
  await loadPersistedQueue();
  if (downloadState.inProgress || _queueStartPending) return false; // Đang có download chạy/khởi tạo — đợi
  _queueStartPending = true;
  _queueStartCancelled = false;
  try {
  // Pha 12: bỏ qua item đang tạm dừng (paused) — không chọn làm next
  const next = profileQueue.find(item => item.status === 'waiting' && !item.paused);
  if (!next) return false; // Hàng đợi rỗng (hoặc chỉ còn item đang paused)

  // Reflect the click immediately before potentially expensive IndexedDB I/O.
  // This also prevents a second START_QUEUE click from selecting the same item.
  const downloadingItem = transitionQueueItem(next, 'downloading');
  if (!downloadingItem) return false;
  Object.assign(next, downloadingItem);
  persistQueue();
  broadcastQueueUpdate();

  let store = mediaStore.get(next.username);
  if (!store?.size) {
    // Thử load từ IndexedDB nếu service worker vừa restart và store trống
    let itemsArray: any[] = [];
    try {
      itemsArray = await getMediaItems(next.username) as any[];
    } catch (err: unknown) {
      console.error('[SW] Queue IndexedDB load failed:', err instanceof Error ? err.message : String(err));
    }
    if (itemsArray && itemsArray.length > 0) {
      if (!mediaStore.has(next.username)) mediaStore.set(next.username, new Map());
      store = mediaStore.get(next.username);
      itemsArray.forEach((item: any) => {
        if (item?.type === 'image' && isVideoThumbnailUrl(item.url)) return;
        if (item?.url && !store!.has(item.url)) store!.set(item.url, item);
      });
    }
  }

  if (_queueStartCancelled) return false;

  if (!store?.size) {
    // Không có media → đánh dấu error và chuyển tiếp
    const failedItem = transitionQueueItem(next, 'error');
    if (failedItem) Object.assign(next, failedItem);
    next.result = { success: 0, failed: 0, total: 0, skipped: 0, error: 'No media found' };
    persistQueue();
    broadcastQueueUpdate();
    setTimeout(() => void startNextInQueue(), 0);
    return false;
  }

  // BUG-L6 FIX: Cập nhật mediaCount thực tế từ store — tránh hiển thị số cũ khi user scroll thêm sau khi add vào queue
  next.mediaCount = store.size;
  persistQueue();
  broadcastQueueUpdate();

  // Pha 10: nếu item này vừa bị reset do gián đoạn (crash/import lại), ép dedupe
  // đúng 1 lần resume này để không tải lại phần đã xong trước khi bị ngắt — không
  // đổi preference skipDuplicates đã lưu của item cho các lần chạy bình thường khác.
  const forceDedup = _forceDedupOnNextRun.delete(next.id);

  // startDownload sẽ tự gọi startNextInQueue() trong finally
  startDownload(next.username, {
    filterType: (next.filterType || 'all') as 'all' | 'images' | 'videos' | 'gifs',
    skipDuplicates: forceDedup ? true : next.skipDuplicates !== false,
    _fromQueue: true,
    _queueId: next.id,
  });
  return true;
  } finally {
    _queueStartPending = false;
  }
}

function resetDownloadingQueueItems(): number {
  _queueStartCancelled = true;
  const result = resetDownloadingItemsAfterStop(profileQueue);
  profileQueue = result.queue;
  const { reset } = result;
  if (reset > 0) {
    persistQueue();
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
    _version: '6.2.7',
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
    if (item.status === 'done' || item.status === 'error') {
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
    profileQueue.push({ ...item, status: 'waiting' });
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
  const idx = profileQueue.findIndex(q => q.id === id && q.status === 'waiting');
  if (idx === -1) return false;
  profileQueue[idx] = { ...profileQueue[idx], paused: !profileQueue[idx].paused };
  persistQueue();
  broadcastQueueUpdate();
  // Item vừa được resume (bỏ paused) có thể trở thành next — thử chạy ngay nếu rảnh
  startNextInQueue();
  return true;
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

export {
  loadPersistedQueue, persistQueue, broadcastQueueUpdate, startNextInQueue, exportQueue, importQueue,
  retryQueueItem, toggleQueuePause, moveQueueItem, resetDownloadingQueueItems,
};
