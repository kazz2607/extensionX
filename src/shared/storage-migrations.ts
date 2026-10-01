import type { QueueItem } from '../types.ts';
import { parseQueueItems } from './validation.ts';

export const OPTIONS_SCHEMA_VERSION = 2;
export const QUEUE_SCHEMA_VERSION = 3;

export interface QueueStorageSnapshot {
  schemaVersion: typeof QUEUE_SCHEMA_VERSION;
  items: QueueItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Adds version metadata without discarding options unknown to an older build. */
export function migrateOptionsStorage(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return { schemaVersion: OPTIONS_SCHEMA_VERSION };
  const migrated = { ...value };
  delete migrated._version;
  return { ...migrated, schemaVersion: OPTIONS_SCHEMA_VERSION };
}

/** Accepts legacy raw arrays and the versioned 6.4 storage envelope. */
export function migrateQueueStorage(value: unknown): QueueStorageSnapshot {
  const rawItems = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : [];
  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    items: parseQueueItems(rawItems) ?? [],
  };
}

export function createQueueStorageSnapshot(items: readonly QueueItem[]): QueueStorageSnapshot {
  // Keep the on-disk item representation readable by v6.4/v7.0 rollback builds.
  // Current runtime state is explicit `paused`; older builds understand waiting+paused.
  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    items: items.map((item) => item.status === 'paused'
      ? { ...item, status: 'waiting', paused: true }
      : { ...item, paused: undefined }),
  };
}
