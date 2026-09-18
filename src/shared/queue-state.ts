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
