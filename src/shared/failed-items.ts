/**
 * failed-items.ts — F3: danh sách file tải lỗi (hàm thuần, kiểm thử được).
 *
 * Lưu trong chrome.storage.local dưới khoá FAILED_ITEMS_KEY, dạng
 * { schemaVersion, items }. Không dùng store IndexedDB mới vì nâng DB_VERSION
 * sẽ khiến bản cũ không mở được DB khi rollback; khoá storage mới thì bản cũ
 * chỉ đơn giản bỏ qua.
 */
import type { FailedItem, MediaItem } from '../types.ts';
import { DOWNLOAD_ERROR_REASONS, type DownloadErrorReason } from './download-errors.ts';
import { isTrustedMediaUrl, isValidUsername } from './validation.ts';

export const FAILED_ITEMS_KEY = 'failed_items_v1';
export const FAILED_ITEMS_SCHEMA_VERSION = 1;
/** Giữ tối đa chừng này mục (mới nhất), giống giới hạn 500 của lịch sử tải. */
export const FAILED_ITEMS_MAX = 500;

const MEDIA_TYPES = new Set<MediaItem['type']>(['image', 'video', 'gif', 'hls']);
const REASONS = new Set<string>(DOWNLOAD_ERROR_REASONS);

export function failedItemId(username: string, url: string): string {
  return `${username}_${url}`;
}

function isFailedItem(value: unknown): value is FailedItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FailedItem>;
  return typeof item.id === 'string'
    && isValidUsername(item.username)
    && isTrustedMediaUrl(item.url)
    && item.id === failedItemId(item.username, item.url)
    && MEDIA_TYPES.has(item.type as MediaItem['type'])
    && (item.ext === undefined || (typeof item.ext === 'string' && item.ext.length <= 10))
    && (item.tweetId === undefined || (typeof item.tweetId === 'string' && /^\d{10,20}$/.test(item.tweetId)))
    && REASONS.has(item.reason as string)
    && typeof item.message === 'string' && item.message.length <= 300
    && Number.isFinite(item.failedAt)
    && Number.isInteger(item.attempts) && (item.attempts ?? 0) >= 1;
}

/**
 * Nguyên nhân `server` (8.2.1) được lưu dưới dạng `reason: 'other'` kèm cờ
 * `serverError`: bản ≤ 8.2.0 kiểm tra reason theo danh sách cũ và sẽ bỏ cả dòng
 * nếu gặp giá trị lạ. Như vậy rollback vẫn giữ (và thử lại được) các file đó.
 */
type StoredFailedItem = Omit<FailedItem, 'reason'> & { reason: Exclude<FailedItem['reason'], 'server'>; serverError?: true };

function fromStored(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { serverError, ...item } = value as Record<string, unknown>;
  return serverError === true && item.reason === 'other' ? { ...item, reason: 'server' } : item;
}

/** Dạng ghi xuống storage, đọc được bởi cả bản cũ. */
export function serializeFailedItems(items: readonly FailedItem[]): StoredFailedItem[] {
  return items.map((item) => (item.reason === 'server' ? { ...item, reason: 'other', serverError: true } : { ...item, reason: item.reason }));
}

/** Đọc dữ liệu thô từ storage; mục sai định dạng bị bỏ qua thay vì làm hỏng cả danh sách. */
export function parseFailedItems(raw: unknown): FailedItem[] {
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
    ? (raw as { items: unknown[] }).items
    : [];
  return items.map(fromStored).filter(isFailedItem).slice(0, FAILED_ITEMS_MAX);
}

export function createFailedItem(
  username: string,
  item: MediaItem,
  reason: DownloadErrorReason,
  message: string,
  now = Date.now(),
): FailedItem | null {
  if (!isValidUsername(username) || !isTrustedMediaUrl(item.url) || !MEDIA_TYPES.has(item.type)) return null;
  return {
    id: failedItemId(username, item.url),
    username,
    url: item.url,
    type: item.type,
    ...(item.ext ? { ext: item.ext.slice(0, 10) } : {}),
    ...(item.tweetId && /^\d{10,20}$/.test(item.tweetId) ? { tweetId: item.tweetId } : {}),
    reason,
    message: message.slice(0, 300),
    failedAt: now,
    attempts: 1,
  };
}

/**
 * Thêm/cập nhật một mục lỗi: cùng file lỗi lại thì tăng attempts và đưa lên
 * đầu, không tạo bản trùng. Danh sách xếp mới nhất trước, cắt ở `max`.
 */
export function upsertFailedItem(list: readonly FailedItem[], record: FailedItem, max = FAILED_ITEMS_MAX): FailedItem[] {
  const previous = list.find((item) => item.id === record.id);
  const merged = previous ? { ...record, attempts: previous.attempts + 1 } : record;
  return [merged, ...list.filter((item) => item.id !== record.id)].slice(0, max);
}

export function removeFailedItemIds(list: readonly FailedItem[], ids: Iterable<string>): FailedItem[] {
  const drop = new Set(ids);
  return list.filter((item) => !drop.has(item.id));
}

/** Gom các mục đã chọn theo profile, giữ thứ tự xuất hiện, để thử lại từng profile một. */
export function groupFailedItemsByUsername(list: readonly FailedItem[], ids: Iterable<string>): Map<string, string[]> {
  const wanted = new Set(ids);
  const groups = new Map<string, string[]>();
  for (const item of list) {
    if (!wanted.has(item.id)) continue;
    const urls = groups.get(item.username) ?? [];
    urls.push(item.url);
    groups.set(item.username, urls);
  }
  return groups;
}
