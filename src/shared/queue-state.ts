import type { QueueItem } from '../types.ts';

export type QueueStatus = QueueItem['status'];
const transitions: Readonly<Record<QueueStatus, readonly QueueStatus[]>> = {
  waiting: ['downloading'], downloading: ['waiting', 'done', 'error'], done: [], error: ['waiting'],
};

export function canTransitionQueueStatus(from: QueueStatus, to: QueueStatus): boolean {
  return transitions[from].includes(to);
}

export function transitionQueueItem(item: QueueItem, to: QueueStatus): QueueItem | null {
  return canTransitionQueueStatus(item.status, to) ? { ...item, status: to } : null;
}

/** A service-worker restart has no in-flight download to resume safely. */
export function recoverQueueItemAfterRestart(item: QueueItem): QueueItem {
  return item.status === 'downloading' ? { ...item, status: 'waiting' } : item;
}

/**
 * true nếu item đang dang dở (downloading) tại thời điểm bị buộc reset — dùng để
 * ép dedupe đúng 1 lần resume kế tiếp, không đổi preference skipDuplicates đã lưu
 * của item. Phải gọi TRƯỚC khi đổi status sang 'waiting' vì sau đó mất dấu vết.
 */
export function wasInterrupted(item: QueueItem): boolean {
  return item.status === 'downloading';
}

/**
 * Quét dữ liệu THÔ (trước khi qua parseQueueItems, vốn đã tự chuẩn hoá
 * 'downloading' → 'waiting' trong lúc parse) để tìm id các item đang dang dở
 * tại thời điểm export — dùng bởi importQueue() để ép dedupe đúng 1 lần resume
 * kế tiếp, thay vì kiểm tra trên item đã bị chuẩn hoá (luôn false, xem bugfix Pha 10).
 */
export function findInterruptedIds(rawItems: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(rawItems)) return ids;
  for (const raw of rawItems) {
    if (raw && typeof raw === 'object') {
      const item = raw as { status?: unknown; id?: unknown };
      if (item.status === 'downloading' && typeof item.id === 'string') ids.add(item.id);
    }
  }
  return ids;
}
