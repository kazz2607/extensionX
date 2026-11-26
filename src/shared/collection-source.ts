/**
 * collection-source.ts — F1: thu thập từ trang Search và Hashtag của X.
 *
 * Giống mẹo đã dùng cho Bookmarks ('_bookmarks_') và Likes ('<user>_likes'):
 * một trang Search/Hashtag được quy về một khoá dạng username, để toàn bộ
 * pipeline sẵn có (IndexedDB, validate, thư mục tải, Queue) dùng lại nguyên vẹn.
 *
 *   /search?q=cat photos  → _search_cat_photos_h<hash>
 *   /hashtag/Cats         → _hashtag_cats_h<hash>
 *   /i/lists/1234567      → _list_0001234567 (F1b, 9.0.0)
 *
 * Khoá chỉ gồm [a-z0-9_] (khớp USERNAME_PATTERN), xác định theo truy vấn đã
 * chuẩn hoá (cùng truy vấn → cùng khoá, dữ liệu cộng dồn giữa các lần thu thập),
 * và luôn kết thúc bằng `h<hash 7 ký tự>` nên không bao giờ trùng hậu tố `_likes`.
 * Khoá ngắn nhất dài 16 ký tự, còn handle X tối đa 15 ký tự, nên một tài khoản
 * thật (vd. @_search_h1) không bao giờ bị nhận nhầm là khoá Search/Hashtag.
 * Phần chữ chỉ để dễ đọc; hash phân biệt các truy vấn khác nhau (kể cả Unicode).
 *
 * Module này không import gì để dùng được ở mọi bundle (service worker,
 * content script, MAIN world, popup).
 */

export type SearchSourceKind = 'search' | 'hashtag' | 'list';

export interface SearchSource {
  kind: SearchSourceKind;
  /** Truy vấn gốc, dễ đọc (hashtag không kèm dấu #; list: id của list). */
  query: string;
  key: string;
}

const SEARCH_PREFIX = '_search_';
/**
 * F1b: id list là số; đệm tới 10 chữ số để khoá luôn dài ≥ 16 ký tự (handle X
 * tối đa 15) — không trùng tài khoản thật — và vẫn suy ngược ra id được.
 */
const LIST_PREFIX = '_list_';
const LIST_KEY = /^_list_(\d{10,20})$/;
const HASHTAG_PREFIX = '_hashtag_';
const MAX_QUERY_LENGTH = 500;
const READABLE_PART_MAX = 24;

function normalizeQuery(query: string): string {
  return query.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** FNV-1a 32-bit, base36 cố định 7 ký tự — đủ để phân biệt truy vấn, không dùng cho bảo mật. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
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

export function listSourceKey(listId: string): string {
  return `${LIST_PREFIX}${listId.padStart(10, '0')}`;
}

/** Id list từ khoá `_list_…`, null nếu không phải khoá list. */
export function listIdFromKey(key: unknown): string | null {
  const match = typeof key === 'string' ? LIST_KEY.exec(key) : null;
  return match ? match[1].replace(/^0+(?=\d)/, '') : null;
}

/** Khoá của một nguồn không phải profile (Search, Hashtag, List). */
export function isSearchSourceKey(key: unknown): boolean {
  return typeof key === 'string' && (/^_(?:search|hashtag)_(?:[a-z0-9_]*_)?h[a-z0-9]{7}$/.test(key) || LIST_KEY.test(key));
}

/** URL mở lại được từ khoá (List); Search/Hashtag chỉ lưu hash nên không suy ngược được. */
export function collectionSourceUrl(key: string): string | null {
  const listId = listIdFromKey(key);
  return listId ? `https://x.com/i/lists/${listId}` : null;
}

/** Nhận diện trang Search (`/search?q=`), Hashtag (`/hashtag/<tag>`) hoặc List (`/i/lists/<id>`) trên x.com. */
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
  // F1b: chỉ trang tweet của list; /members, /followers, /info không có media.
  const list = path.match(/^\/i\/lists\/(\d{1,20})$/);
  if (list) return { kind: 'list', query: list[1], key: listSourceKey(list[1]) };
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

/**
 * Nhãn hiển thị cho popup: "🔍 cat photos" / "#cats" / "📋 <tên list>". Tên list
 * lấy từ tiêu đề tab ("Tên list / X") khi có, không thì dùng id.
 */
export function searchSourceLabel(source: SearchSource, pageTitle?: string): string {
  if (source.kind === 'list') return `📋 ${listNameFromTitle(pageTitle) || source.query}`;
  return source.kind === 'hashtag' ? `#${source.query}` : `🔍 ${source.query}`;
}

/** "(3) Photographers / X" → "Photographers"; rỗng khi tiêu đề không theo mẫu của X. */
export function listNameFromTitle(title: unknown): string {
  if (typeof title !== 'string') return '';
  const match = /^(?:\(\d+\+?\)\s*)?(.+?)\s+\/\s+(?:X|Twitter)$/.exec(title.trim());
  return match ? match[1].slice(0, 80) : '';
}

/**
 * Nhãn hiển thị khi chỉ có khoá (Download Center, danh sách lỗi): phần chữ dễ
 * đọc đã chuẩn hoá ("🔍 cat photos", "#cats"). Profile thường giữ dạng "@name".
 */
export function collectionKeyLabel(key: string): string {
  const listId = listIdFromKey(key);
  // Tên list không suy ra được từ khoá; id đủ để nhận ra và mở lại list.
  if (listId) return `📋 ${listId}`;
  const match = key.match(/^_(search|hashtag)_(?:([a-z0-9_]*)_)?h[a-z0-9]{7}$/);
  if (!match) return `@${key}`;
  const readable = (match[2] ?? '').replace(/_/g, ' ').trim() || '…';
  return match[1] === 'hashtag' ? `#${readable.replace(/ /g, '_')}` : `🔍 ${readable}`;
}
