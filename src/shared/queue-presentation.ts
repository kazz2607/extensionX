import type { QueueItem } from '../types.ts';

export type QueuePrimaryAction = 'start' | 'pause' | 'resume' | 'disabled';

export interface QueuePresentation {
  action: QueuePrimaryAction;
  label: string;
  title: string;
  waiting: number;
  downloading: number;
  paused: number;
  error: number;
  done: number;
}

export function getQueuePresentation(queue: QueueItem[]): QueuePresentation {
  let waiting = 0;
  let downloading = 0;
  let paused = 0;
  let error = 0;
  let done = 0;
  for (const item of queue) {
    if (item.status === 'downloading') downloading++;
    else if (item.status === 'error') error++;
    else if (item.status === 'done') done++;
    else if (item.paused) paused++;
    else waiting++;
  }
  const action: QueuePrimaryAction = downloading > 0 ? 'pause' : paused > 0 ? 'resume' : waiting > 0 ? 'start' : 'disabled';
  const labels = {
    start: ['Bắt đầu', 'Bắt đầu hàng đợi'],
    pause: ['Tạm dừng', 'Tạm dừng hàng đợi sau khi hủy tác vụ hiện tại'],
    resume: ['Tiếp tục', 'Tiếp tục các mục đang tạm dừng'],
    disabled: ['Bắt đầu', 'Không có mục nào có thể chạy'],
  } as const;
  return { action, label: labels[action][0], title: labels[action][1], waiting, downloading, paused, error, done };
}
