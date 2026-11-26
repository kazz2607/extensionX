import { PUBLIC_DOWNLOAD_OPTION_KEYS } from './download-options.ts';
import { searchSourceFromUrl, searchSourceKey } from './collection-source.ts';
import type { MediaItem, QueueItem } from '../types.ts';

export const USERNAME_PATTERN = /^(?:[A-Za-z0-9_]{1,50}|_bookmarks_|[A-Za-z0-9_]{1,50}_likes)$/;
const MEDIA_TYPES = new Set<MediaItem['type']>(['image', 'video', 'gif', 'hls', 'video_placeholder']);
const MEDIA_HOSTS = new Set(['pbs.twimg.com', 'video.twimg.com']);
const FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'ts', 'm3u8', 'mov']);
const QUEUE_STATUSES = new Set<QueueItem['status']>(['waiting', 'downloading', 'paused', 'done', 'error', 'cancelled']);
const FILTER_TYPES = new Set(['all', 'images', 'videos', 'gifs']);
const MAX_SELECTED_URLS = 2_000; // Pha 9: Interactive Download Picker

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

const PBS_MEDIA_PATH = /^\/media\/([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9]{2,5}))?$/;
const IMAGE_SIZES = new Set(['orig', 'large', 'medium', 'small']);

/**
 * L21: một ảnh X có hai dạng URL — `…/media/ABC.jpg` (GraphQL) và
 * `…/media/ABC?format=jpg&name=small` (DOM) — từng thành hai mục và hai file.
 * Đưa về một dạng `…/media/ABC?format=<ext>&name=<size>`; URL không phải ảnh
 * `pbs.twimg.com/media/` giữ nguyên.
 */
export function canonicalImageUrl(url: string, size = 'orig'): string {
  try {
    const u = new URL(url);
    const match = u.hostname === 'pbs.twimg.com' ? PBS_MEDIA_PATH.exec(u.pathname) : null;
    if (!match) return url;
    const format = (match[2] || u.searchParams.get('format') || 'jpg').toLowerCase();
    return `https://pbs.twimg.com/media/${match[1]}?format=${format}&name=${IMAGE_SIZES.has(size) ? size : 'orig'}`;
  } catch {
    return url;
  }
}

/** Ảnh pbs về dạng chuẩn, `ext` lấy theo `format=` (L27: ảnh từ DOM luôn ghi 'jpg'). */
export function canonicalizeMediaItem<T extends MediaItem>(item: T): T {
  if (item.type !== 'image') return item;
  const url = canonicalImageUrl(item.url);
  if (url === item.url) return item;
  const format = new URL(url).searchParams.get('format') || item.ext;
  return { ...item, url, ext: format && FILE_EXTENSIONS.has(format) ? format : item.ext };
}

// Chuẩn hóa URL media X để so trùng (dedup): xóa query param biến đổi như ?t=
// nhưng giữ lại name/format vì chúng ảnh hưởng tới độ phân giải/định dạng file thật.
// Ảnh pbs `/media/` về một dạng (L21) để `ABC.jpg` và `ABC?format=jpg` là một.
export function normalizeUrlForDedup(url: string): string {
  try {
    const u = new URL(canonicalImageUrl(url));
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
  // F1: trang Search/Hashtag dùng khoá dạng username (xem collection-source.ts).
  const search = searchSourceFromUrl(value);
  if (search) return search.key;
  const match = path.match(/^\/([A-Za-z0-9_]{1,50})(?:\/|$)/);
  if (!match) return null;
  const username = match[1];
  const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'search', 'hashtag', 'settings', 'i', 'login', 'logout', 'compose']);
  if (reserved.has(username.toLowerCase())) return null;
  // L23: chỉ `/<user>/likes` là trang likes; `/<user>/status/<id>/likes`
  // (danh sách người thích một tweet) từng bị nhận nhầm thành khoá `_likes`.
  return path.split('/')[2]?.toLowerCase() === 'likes' ? `${username}_likes` : username;
}

/**
 * F1c: khoá thu thập từ chữ người dùng nhập (Saved Job, công cụ P2): `NASA`,
 * `@NASA`, `#cats`, hoặc URL X của profile / Search / Hashtag / List (có hoặc
 * không có `https://`). Khoá nội bộ có sẵn (vd. `_search_…`) giữ nguyên.
 */
export function collectionKeyFromInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 2_048) return null;
  if (text.startsWith('#')) {
    const tag = text.slice(1).trim();
    return tag && !/[\s/?#]/.test(tag) ? searchSourceKey('hashtag', tag) : null;
  }
  if (/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\//i.test(text)) {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    url.protocol = 'https:';
    url.hostname = url.hostname.replace(/^(?:www|mobile)\./i, '').toLowerCase();
    return usernameFromXUrl(url.href);
  }
  const handle = text.replace(/^@/, '');
  return isValidUsername(handle) ? handle : null;
}

/**
 * Trang thu thập được bằng auto-scroll: tab media/likes/bookmarks của profile,
 * hoặc trang Search/Hashtag (F1). Dùng chung cho content script và service worker.
 */
export function isCollectMediaPageUrl(value: unknown): boolean {
  if (!isXUrl(value)) return false;
  if (searchSourceFromUrl(value)) return true;
  // Theo đúng đoạn path (L23): `/status/<id>/likes` không phải trang thu thập.
  return /^\/(?:[A-Za-z0-9_]{1,50}\/(?:media|photos|videos|likes)|i\/bookmarks)(?:\/|$)/.test(new URL(value).pathname);
}

/**
 * Tab đã ở đúng trang thu thập của khoá chưa (profile → /media, likes → /likes,
 * bookmarks, search). So theo đoạn path, không dùng `includes('/media')`: handle
 * như `mediapart` từng bị coi là đã ở trang Media nên thu thập dừng ngay (L22).
 */
export function isCollectPageFor(url: unknown, key: string): boolean {
  if (!isXUrl(url) || usernameFromXUrl(url)?.toLowerCase() !== key.toLowerCase()) return false;
  if (key === '_bookmarks_' || searchSourceFromUrl(url)) return true;
  const section = new URL(url).pathname.split('/')[2]?.toLowerCase();
  return key.endsWith('_likes') ? section === 'likes' : section === 'media';
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
  if (item.likeCount !== undefined && (!Number.isSafeInteger(item.likeCount) || item.likeCount < 0)) return false;
  if (item.width !== undefined && (!Number.isInteger(item.width) || item.width < 0 || item.width > 20_000)) return false;
  if (item.height !== undefined && (!Number.isInteger(item.height) || item.height < 0 || item.height > 20_000)) return false;
  if (item.variants !== undefined && !isValidVariantList(item.variants)) return false;
  return true;
}

/**
 * F3b: danh sách mức chất lượng thấp hơn — tối đa 4 URL mp4 trên video.twimg.com
 * (dữ liệu đến từ trang hoặc storage, không tin cậy).
 */
export function isValidVariantList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 4 && value.every((url) => {
    if (!isTrustedMediaUrl(url)) return false;
    const parsed = new URL(url);
    return parsed.hostname === 'video.twimg.com' && /\.mp4$/i.test(parsed.pathname);
  });
}

export function isValidDownloadOptions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const options = value as Record<string, unknown>;
  // Unknown keys (including internal _queue/_operation tracking) are rejected.
  if (Object.keys(options).some((key) => !PUBLIC_DOWNLOAD_OPTION_KEYS.has(key))) return false;
  if (options.filenameTemplate !== undefined && (typeof options.filenameTemplate !== 'string' || options.filenameTemplate.length > 200)) return false;
  const strings = ['dateFrom', 'dateTo', 'keyword', 'saveFolder'];
  const booleans = ['flatUsername', 'filenameUsername', 'showSnackbar', 'skipDuplicates'];
  if (strings.some((key) => options[key] !== undefined && (typeof options[key] !== 'string' || (options[key] as string).length > 1_000))) return false;
  if (booleans.some((key) => options[key] !== undefined && typeof options[key] !== 'boolean')) return false;
  if (options.concurrency !== undefined && (!Number.isInteger(options.concurrency) || (options.concurrency as number) < 1 || (options.concurrency as number) > 10)) return false;
  if (options.filterType !== undefined && !FILTER_TYPES.has(options.filterType as string)) return false;
  // Pha 9: Interactive Download Picker — chặn mảng URL không giới hạn/không tin cậy lọt qua
  if (options.selectedUrls !== undefined) {
    if (!Array.isArray(options.selectedUrls) || options.selectedUrls.length > MAX_SELECTED_URLS) return false;
    if (!options.selectedUrls.every(isTrustedMediaUrl)) return false;
  }
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
    if (item.keyword !== undefined && (typeof item.keyword !== 'string' || item.keyword.length > 200)) return null;
    if (typeof item.skipDuplicates !== 'boolean' || typeof item.addedAt !== 'number' || !Number.isFinite(item.addedAt) || typeof item.mediaCount !== 'number' || !Number.isInteger(item.mediaCount) || item.mediaCount < 0) return null;
    if (item.paused !== undefined && typeof item.paused !== 'boolean') return null; // Pha 12
    ids.add(item.id);
    const status = item.status === 'downloading' || (item.status === 'waiting' && item.paused)
      ? 'paused'
      : item.status!;
    const normalized = { ...(item as QueueItem), status, result: item.result ?? null };
    delete normalized.paused;
    parsed.push(normalized);
  }
  return parsed;
}
