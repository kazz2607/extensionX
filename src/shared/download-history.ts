import type { HistoryEntry } from '../types.ts';

export const DOWNLOAD_HISTORY_SCHEMA_VERSION = 2;
export const DOWNLOAD_HISTORY_MAX = 500;

export interface DownloadHistorySnapshot {
  schemaVersion: typeof DOWNLOAD_HISTORY_SCHEMA_VERSION;
  entries: HistoryEntry[];
}

function parseEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.username !== 'string' || !/^[A-Za-z0-9_]{1,50}$/.test(raw.username) ||
      typeof raw.count !== 'number' || !Number.isFinite(raw.count) ||
      typeof raw.filter !== 'string' || typeof raw.date !== 'string' || !Number.isFinite(new Date(raw.date).getTime())) return null;
  const success = typeof raw.success === 'number' && Number.isFinite(raw.success) ? Math.max(0, Math.floor(raw.success)) : undefined;
  const failed = typeof raw.failed === 'number' && Number.isFinite(raw.failed) ? Math.max(0, Math.floor(raw.failed)) : undefined;
  const skipped = typeof raw.skipped === 'number' && Number.isFinite(raw.skipped) ? Math.max(0, Math.floor(raw.skipped)) : undefined;
  const status = raw.status === 'completed' || raw.status === 'partial' || raw.status === 'failed' ? raw.status : undefined;
  return {
    username: raw.username,
    count: Math.max(0, Math.floor(raw.count)),
    filter: raw.filter.slice(0, 30),
    date: raw.date.slice(0, 40),
    ...(success !== undefined ? { success } : {}),
    ...(failed !== undefined ? { failed } : {}),
    ...(skipped !== undefined ? { skipped } : {}),
    ...(status ? { status } : {}),
  };
}

export function migrateDownloadHistoryStorage(value: unknown): DownloadHistorySnapshot {
  const rawEntries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as { entries?: unknown }).entries)
      ? (value as { entries: unknown[] }).entries
      : [];
  const entries = rawEntries.slice(0, DOWNLOAD_HISTORY_MAX).map(parseEntry).filter((entry): entry is HistoryEntry => Boolean(entry));
  return { schemaVersion: DOWNLOAD_HISTORY_SCHEMA_VERSION, entries };
}

export function createDownloadHistorySnapshot(entries: readonly HistoryEntry[]): DownloadHistorySnapshot {
  return { schemaVersion: DOWNLOAD_HISTORY_SCHEMA_VERSION, entries: entries.slice(0, DOWNLOAD_HISTORY_MAX).map((entry) => ({ ...entry })) };
}
