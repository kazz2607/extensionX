import { mediaStore, downloadState } from './state.ts';
import { getMediaItems } from './indexeddb.ts';
import { startDownload } from './downloader.ts';
import { broadcastToPopup } from './utils.ts';
import { QueueItem } from '../types.ts';

export let profileQueue: QueueItem[] = [];
export function setProfileQueue(q: QueueItem[]) { profileQueue = q; }


async function loadPersistedQueue() {
  try {
    const data = await chrome.storage.local.get('profile_queue');
    const saved: QueueItem[] = (data.profile_queue as QueueItem[]) || [];
    // Các item đang 'downloading' khi SW restart → đặt lại 'waiting'
    profileQueue = saved.map((item: QueueItem) =>
      item.status === 'downloading' ? { ...item, status: 'waiting' } : item
    );
  } catch (_) {
    profileQueue = [];
  }
}

let _queuePersistTimer: ReturnType<typeof setTimeout> | null = null;
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

async function startNextInQueue() {
  if (downloadState.inProgress) return; // Đang có download chạy — đợi
  const next = profileQueue.find(item => item.status === 'waiting');
  if (!next) return; // Hàng đợi rỗng

  let store = mediaStore.get(next.username);
  if (!store?.size) {
    // Thử load từ IndexedDB nếu service worker vừa restart và store trống
    const itemsArray = await getMediaItems(next.username) as any[];
    if (itemsArray && itemsArray.length > 0) {
      if (!mediaStore.has(next.username)) mediaStore.set(next.username, new Map());
      store = mediaStore.get(next.username);
      itemsArray.forEach((item: any) => {
        if (item?.url && !store!.has(item.url)) store!.set(item.url, item);
      });
    }
  }

  if (!store?.size) {
    // Không có media → đánh dấu error và chuyển tiếp
    next.status = 'error';
    next.result = { error: 'No media found' };
    persistQueue();
    broadcastQueueUpdate();
    startNextInQueue();
    return;
  }

  next.status = 'downloading';
  persistQueue();
  broadcastQueueUpdate();

  // startDownload sẽ tự gọi startNextInQueue() trong finally
  startDownload(next.username, {
    filterType: next.filterType || 'all',
    skipDuplicates: next.skipDuplicates !== false,
    _fromQueue: true,
    _queueId: next.id,
  });
}

// Khởi tải queue từ storage khi SW khởi động
loadPersistedQueue().then(() => {
  // Không auto-resume download ngay khi SW khởi động lại — chờ user tương tác
  broadcastQueueUpdate();
});

export { loadPersistedQueue, persistQueue, broadcastQueueUpdate, startNextInQueue };
