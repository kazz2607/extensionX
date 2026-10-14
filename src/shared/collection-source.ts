/**
 * collection-source.ts — F1: thu thập từ trang Search và Hashtag của X.
 *
 * Giống mẹo đã dùng cho Bookmarks ('_bookmarks_') và Likes ('<user>_likes'):
 * một trang Search/Hashtag được quy về một khoá dạng username, để toàn bộ
 * pipeline sẵn có (IndexedDB, validate, thư mục tải, Queue) dùng lại nguyên vẹn.
 *
 *   /search?q=cat photos  → _search_cat_photos_h<hash>
 *   /hashtag/Cats         → _hashtag_cats_h<hash>
 *
 * Khoá chỉ gồm [a-z0-9_] (khớp USERNAME_PATTERN), xác định theo truy vấn đã
 * chuẩn hoá (cùng truy vấn → cùng khoá, dữ liệu cộng dồn giữa các lần thu thập),
 * và luôn kết thúc bằng `_h<hash>` nên không bao giờ trùng hậu tố `_likes`.
 * Phần chữ chỉ để dễ đọc; hash phân biệt các truy vấn khác nhau (kể cả Unicode).
 *
 * Module này không import gì để dùng được ở mọi bundle (service worker,
 * content script, MAIN world, popup).
 */

export type SearchSourceKind = 'search' | 'hashtag';

export interface SearchSource {
  kind: SearchSourceKind;
  /** Truy vấn gốc, dễ đọc (hashtag không kèm dấu #). */
  query: string;
  key: string;
}

const SEARCH_PREFIX = '_search_';
const HASHTAG_PREFIX = '_hashtag_';
const MAX_QUERY_LENGTH = 500;
const READABLE_PART_MAX = 24;

function normalizeQuery(query: string): string {
  return query.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** FNV-1a 32-bit — đủ để phân biệt truy vấn, không dùng cho bảo mật. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function searchSourceKey(kind: SearchSourceKind, query: string): string {
  const normalized = normalizeQuery(query);
  const readable = normalized
    // Bỏ dấu tiếng Việt cho phần dễ đọc.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Chữ d gạch không tách dấu được bằng NFD.
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, READABLE_PART_MAX)
    .replace(/_+$/, '');
  const prefix = kind === 'hashtag' ? HASHTAG_PREFIX : SEARCH_PREFIX;
  return `${prefix}${readable ? `${readable}_` : ''}h${fnv1a(`${kind}:${normalized}`)}`;
}

export function isSearchSourceKey(key: unknown): boolean {
  return typeof key === 'string' && /^_(?:search|hashtag)_(?:[a-z0-9_]*_)?h[a-z0-9]{1,7}$/.test(key);
}

/** Nhận diện trang Search (`/search?q=`) hoặc Hashtag (`/hashtag/<tag>`) trên x.com. */
export function searchSourceFromUrl(value: unknown): SearchSource | null {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || (url.hostname !== 'x.com' && url.hostname !== 'twitter.com')) return null;

  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/search') {
    const query = (url.searchParams.get('q') || '').trim();
    if (!query || query.length > MAX_QUERY_LENGTH) return null;
    return { kind: 'search', query, key: searchSourceKey('search', query) };
  }
  const hashtag = path.match(/^\/hashtag\/([^/]+)$/);
  if (hashtag) {
    let tag: string;
    try {
      tag = decodeURIComponent(hashtag[1]).replace(/^#/, '').trim();
    } catch {
      return null;
    }
    if (!tag || tag.length > MAX_QUERY_LENGTH) return null;
    return { kind: 'hashtag', query: tag, key: searchSourceKey('hashtag', tag) };
  }
  return null;
}

/** Nhãn hiển thị cho popup: "🔍 cat photos" / "#cats"; null nếu không phải Search/Hashtag. */
export function searchSourceLabel(source: SearchSource): string {
  return source.kind === 'hashtag' ? `#${source.query}` : `🔍 ${source.query}`;
}
