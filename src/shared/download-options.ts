import type { DownloadOptions } from '../types.ts';

/** Fields a caller may set on START_DOWNLOAD; queue tracking fields are internal. */
export const PUBLIC_DOWNLOAD_OPTION_KEYS: ReadonlySet<string> = new Set([
  'filterType', 'skipDuplicates', 'dateFrom', 'dateTo', 'keyword', 'selectedUrls',
  'flatUsername', 'filenameUsername', 'saveFolder', 'filenameTemplate', 'concurrency', 'showSnackbar',
]);

/**
 * Options to remember for "Retry failed". A queue run's tracking fields point at
 * an operation that has ended; keeping them makes the retry a silent no-op.
 */
export function retryableDownloadOptions(options: DownloadOptions): DownloadOptions {
  const rest: DownloadOptions = { ...options };
  delete rest._fromQueue;
  delete rest._queueId;
  delete rest._operationId;
  return rest;
}

/**
 * Per-run options override the user's stored settings, except blanks: a Saved
 * Job with no folder/template of its own must keep the global ones.
 */
export function mergeDownloadOptions(stored: DownloadOptions | undefined, options: DownloadOptions): DownloadOptions {
  const merged: DownloadOptions = { ...(stored ?? {}) };
  for (const [key, value] of Object.entries(options) as [keyof DownloadOptions, unknown][]) {
    if (value === undefined) continue;
    if ((key === 'saveFolder' || key === 'filenameTemplate') && typeof value === 'string' && !value.trim()) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}
