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
