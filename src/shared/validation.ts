import type { MediaItem, QueueItem } from '../types.ts';

export const USERNAME_PATTERN = /^(?:[A-Za-z0-9_]{1,50}|_bookmarks_|[A-Za-z0-9_]{1,50}_likes)$/;
const MEDIA_TYPES = new Set<MediaItem['type']>(['image', 'video', 'gif', 'hls', 'video_placeholder']);
const MEDIA_HOSTS = new Set(['pbs.twimg.com', 'video.twimg.com']);
const FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'ts', 'm3u8', 'mov']);
const QUEUE_STATUSES = new Set<QueueItem['status']>(['waiting', 'downloading', 'done', 'error']);
const FILTER_TYPES = new Set(['all', 'images', 'videos', 'gifs']);

export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_PATTERN.test(value);
}

export function isTrustedMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8_192) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MEDIA_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// Chuẩn hóa URL media X để so trùng (dedup): xóa query param biến đổi như ?t=
// nhưng giữ lại name/format vì chúng ảnh hưởng tới độ phân giải/định dạng file thật.
export function normalizeUrlForDedup(url: string): string {
  try {
    const u = new URL(url);
    const name = u.searchParams.get('name') || '';
    const format = u.searchParams.get('format') || '';
    const base = u.origin + u.pathname;
    if (name || format) return `${base}?name=${name}&format=${format}`;
    return base;
  } catch {
    return url.split('?')[0];
  }
}

// Ép URL media video về chất lượng gốc (name=orig) trước khi lưu/tải.
export function normalizeMediaUrlToOrig(url: string): string {
  return url.replace(/name=\w+/, 'name=orig');
}

export function isXUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'x.com' || url.hostname === 'twitter.com');
  } catch {
    return false;
  }
}

export function usernameFromXUrl(value: unknown): string | null {
  if (!isXUrl(value)) return null;
  const path = new URL(value).pathname;
  if (path.startsWith('/i/bookmarks')) return '_bookmarks_';
  const match = path.match(/^\/([A-Za-z0-9_]{1,50})(?:\/|$)/);
  if (!match) return null;
  const username = match[1];
  const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'login', 'logout', 'compose']);
  if (reserved.has(username.toLowerCase())) return null;
  return path.includes('/likes') ? `${username}_likes` : username;
}

export function isXProfileUrlForUsername(url: unknown, username: unknown): boolean {
  return isValidUsername(username) && usernameFromXUrl(url)?.toLowerCase() === username.toLowerCase();
}

export function isValidMediaItem(value: unknown): value is MediaItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MediaItem>;
  if (!MEDIA_TYPES.has(item.type as MediaItem['type'])) return false;
  if (item.type === 'video_placeholder') return typeof item.tweetId === 'string' && /^\d{10,20}$/.test(item.tweetId);
  if (!isTrustedMediaUrl(item.url)) return false;
  if (item.tweetId !== undefined && (typeof item.tweetId !== 'string' || !/^\d{10,20}$/.test(item.tweetId))) return false;
  if (item.ext !== undefined && (typeof item.ext !== 'string' || !FILE_EXTENSIONS.has(item.ext.toLowerCase()))) return false;
  if (item.tweetText !== undefined && (typeof item.tweetText !== 'string' || item.tweetText.length > 10_000)) return false;
  if (item.source !== undefined && (typeof item.source !== 'string' || item.source.length > 100)) return false;
  if (item.width !== undefined && (!Number.isInteger(item.width) || item.width < 0 || item.width > 20_000)) return false;
  if (item.height !== undefined && (!Number.isInteger(item.height) || item.height < 0 || item.height > 20_000)) return false;
  return true;
}

export function isValidDownloadOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 20) return false;
  const options = value as Record<string, unknown>;
  const strings = ['dateFrom', 'dateTo', 'keyword', 'saveFolder'];
  const booleans = ['flatUsername', 'filenameUsername', 'showSnackbar', 'skipDuplicates'];
  if (strings.some((key) => options[key] !== undefined && (typeof options[key] !== 'string' || (options[key] as string).length > 1_000))) return false;
  if (booleans.some((key) => options[key] !== undefined && typeof options[key] !== 'boolean')) return false;
  if (options.concurrency !== undefined && (!Number.isInteger(options.concurrency) || (options.concurrency as number) < 1 || (options.concurrency as number) > 10)) return false;
  if (options.filterType !== undefined && !FILTER_TYPES.has(options.filterType as string)) return false;
  return true;
}

export function sanitizePathSegment(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const clean = value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"|?*\\/]/g, '_')
    .replace(/^\.+$/, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 100);
  return clean || fallback;
}

export function sanitizeFolderPath(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .split(/[\\/]+/)
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .slice(0, 10)
    .join('/');
}

export function sanitizeFilename(value: unknown, fallback = 'file'): string {
  return sanitizePathSegment(value, fallback).slice(0, 200);
}

export function parseQueueItems(value: unknown, maxItems = 500): QueueItem[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const ids = new Set<string>();
  const parsed: QueueItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Partial<QueueItem>;
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(item.id) || ids.has(item.id)) return null;
    if (!isValidUsername(item.username) || !FILTER_TYPES.has(item.filterType || '') || !QUEUE_STATUSES.has(item.status as QueueItem['status'])) return null;
    if (typeof item.skipDuplicates !== 'boolean' || typeof item.addedAt !== 'number' || !Number.isFinite(item.addedAt) || typeof item.mediaCount !== 'number' || !Number.isInteger(item.mediaCount) || item.mediaCount < 0) return null;
    ids.add(item.id);
    parsed.push({
      ...(item as QueueItem),
      status: item.status === 'downloading' ? 'waiting' : item.status!,
      result: item.result ?? null,
    });
  }
  return parsed;
}
