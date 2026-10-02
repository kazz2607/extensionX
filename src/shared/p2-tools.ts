import type { HistoryEntry, MediaItem } from '../types.ts';

export const GALLERY_PAGE_MAX = 100;
export const ZIP_MAX_FILES = 200;
export const ZIP_MAX_ESTIMATED_BYTES = 500 * 1024 * 1024;
export const SCHEDULE_MIN_INTERVAL_MINUTES = 60;

export interface DownloadEstimate {
  total: number;
  images: number;
  videos: number;
  gifs: number;
  duplicates: number;
  selected: number;
  estimatedBytes: number;
  unknownSize: number;
  warning?: string;
}

export interface ScheduleInput {
  jobId: string;
  enabled: boolean;
  intervalMinutes: number;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+|\.+$/g, '').trim().slice(0, 80);
}

export function estimateMedia(items: readonly MediaItem[], downloaded: ReadonlySet<string>): DownloadEstimate {
  let images = 0; let videos = 0; let gifs = 0; let duplicates = 0; let estimatedBytes = 0; let unknownSize = 0;
  for (const item of items) {
    if (item.type === 'image') images++;
    else if (item.type === 'gif') gifs++;
    else videos++;
    const duplicate = downloaded.has(item.url);
    if (duplicate) { duplicates++; continue; }
    const pixels = Number(item.width || 0) * Number(item.height || 0);
    if (pixels > 0) estimatedBytes += Math.round(pixels * (item.type === 'image' ? 0.45 : 2.5));
    else {
      unknownSize++;
      estimatedBytes += item.type === 'image' ? 1_500_000 : 15_000_000;
    }
  }
  const selected = Math.max(0, items.length - duplicates);
  const warning = selected > ZIP_MAX_FILES || estimatedBytes > ZIP_MAX_ESTIMATED_BYTES
    ? 'Job lớn: nên tải trực tiếp hoặc chia thành nhiều ZIP.'
    : undefined;
  return { total: items.length, images, videos, gifs, duplicates, selected, estimatedBytes, unknownSize, warning };
}

export function renderFolderRule(template: string, item: MediaItem, username: string): string {
  const date = new Date(item.tweetDate || Date.now());
  const values: Record<string, string> = {
    username,
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    type: item.type === 'image' ? 'images' : item.type === 'gif' ? 'gifs' : 'videos',
  };
  return template.split('/').map((segment) => {
    const rendered = segment.replace(/\{(username|year|month|type)\}/g, (_match, key: string) => values[key] || '');
    return sanitizePathSegment(rendered);
  }).filter(Boolean).slice(0, 8).join('/');
}

export function validateFolderRule(template: unknown): template is string {
  return typeof template === 'string' && template.length <= 300 && !template.includes('..') && !/[\\:*?"<>|]/.test(template);
}

export function parseScheduleInput(value: unknown): ScheduleInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(candidate.jobId)) return null;
  if (typeof candidate.enabled !== 'boolean') return null;
  const intervalMinutes = Number(candidate.intervalMinutes);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < SCHEDULE_MIN_INTERVAL_MINUTES || intervalMinutes > 43_200) return null;
  return { jobId: candidate.jobId, enabled: candidate.enabled, intervalMinutes };
}

export function buildRedactedErrorReport(history: readonly HistoryEntry[]) {
  const rows = history.filter((entry) => (entry.failed || 0) > 0).slice(0, 500).map((entry) => ({
    date: entry.date,
    mediaType: entry.filter,
    status: entry.status || 'failed',
    success: entry.success || 0,
    failed: entry.failed || 0,
    skipped: entry.skipped || 0,
  }));
  const csv = ['date,mediaType,status,success,failed,skipped', ...rows.map((row) =>
    [row.date, row.mediaType, row.status, row.success, row.failed, row.skipped].join(','))].join('\n');
  return { json: JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), rows }, null, 2), csv, count: rows.length };
}

export async function contentFingerprint(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
