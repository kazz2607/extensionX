import type { QueueItem } from '../types.ts';
import { registerTranslations, t } from '../lib/i18n.ts';
import { SHARED_UI_STRINGS } from '../lib/i18n/background.ts';

registerTranslations(SHARED_UI_STRINGS);

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
    else if (item.status === 'paused') paused++;
    else waiting++;
  }
  const action: QueuePrimaryAction = downloading > 0 ? 'pause' : paused > 0 ? 'resume' : waiting > 0 ? 'start' : 'disabled';
  const labelKeys: Record<QueuePrimaryAction, readonly [string, string]> = {
    start: ['shared_queue_start', 'shared_queue_start_title'],
    pause: ['shared_queue_pause', 'shared_queue_pause_title'],
    resume: ['shared_queue_resume', 'shared_queue_resume_title'],
    disabled: ['shared_queue_start', 'shared_queue_disabled_title'],
  };
  const [labelKey, titleKey] = labelKeys[action];
  return { action, label: t(labelKey), title: t(titleKey), waiting, downloading, paused, error, done };
}
