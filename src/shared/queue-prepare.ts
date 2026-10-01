import type { MediaItem } from '../types.ts';

export type QueuePrepareResult =
  | { status: 'ready'; items: MediaItem[] }
  | { status: 'empty'; items: [] }
  | { status: 'stale'; items: [] }
  | { status: 'error'; items: []; error: string };

/** Isolates the async storage boundary so reject/stale-operation behavior is deterministic and testable. */
export async function prepareQueueMedia(
  load: () => Promise<MediaItem[]>,
  isCurrent: () => boolean,
): Promise<QueuePrepareResult> {
  try {
    const items = await load();
    if (!isCurrent()) return { status: 'stale', items: [] };
    return items.length > 0 ? { status: 'ready', items } : { status: 'empty', items: [] };
  } catch (error) {
    if (!isCurrent()) return { status: 'stale', items: [] };
    return { status: 'error', items: [], error: error instanceof Error ? error.message : String(error) };
  }
}
