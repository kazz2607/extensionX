/**
 * failed-items.ts — F3: lưu file tải lỗi vào chrome.storage.local.
 *
 * Nhiều worker tải song song có thể cùng ghi, nên mọi thao tác đọc-sửa-ghi đi
 * qua một hàng đợi tuần tự. Bản sao trong bộ nhớ giúp đường thành công (gọi
 * cho mỗi file tải xong) không phải đọc storage khi file đó chưa từng lỗi.
 */
import type { FailedItem, MediaItem } from '../types.ts';
import { categorizeDownloadError, formatDownloadError } from '../shared/download-errors.ts';
import {
  FAILED_ITEMS_KEY,
  FAILED_ITEMS_SCHEMA_VERSION,
  createFailedItem,
  failedItemId,
  parseFailedItems,
  removeFailedItemIds,
  upsertFailedItem,
} from '../shared/failed-items.ts';

let cache: FailedItem[] | null = null;
let chain: Promise<unknown> = Promise.resolve();

// Giữ bản sao khớp storage cả khi nơi khác ghi/xóa (vd. "Xóa toàn bộ dữ liệu").
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && FAILED_ITEMS_KEY in changes) cache = parseFailedItems(changes[FAILED_ITEMS_KEY].newValue);
});

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function load(): Promise<FailedItem[]> {
  if (cache) return cache;
  const stored = await chrome.storage.local.get(FAILED_ITEMS_KEY);
  cache = parseFailedItems(stored[FAILED_ITEMS_KEY]);
  return cache;
}

async function save(items: FailedItem[]): Promise<void> {
  cache = items;
  await chrome.storage.local.set({ [FAILED_ITEMS_KEY]: { schemaVersion: FAILED_ITEMS_SCHEMA_VERSION, items } });
}

export function listFailedItems(): Promise<FailedItem[]> {
  return serialize(async () => [...await load()]);
}

/** Ghi lại một file lỗi. Lỗi do người dùng bấm Stop không phải lỗi cần thử lại. */
export function recordFailedItem(username: string, item: MediaItem, error: unknown): Promise<void> {
  const reason = categorizeDownloadError(error);
  if (reason === 'cancelled') return Promise.resolve();
  const record = createFailedItem(username, item, reason, formatDownloadError(error));
  if (!record) return Promise.resolve();
  return serialize(async () => save(upsertFailedItem(await load(), record)));
}

/** File đã tải thành công thì gỡ khỏi danh sách lỗi (nếu có). */
export function resolveFailedItem(username: string, url: string): Promise<void> {
  const id = failedItemId(username, url);
  if (cache && !cache.some((item) => item.id === id)) return Promise.resolve();
  return serialize(async () => {
    const items = await load();
    if (!items.some((item) => item.id === id)) return;
    await save(removeFailedItemIds(items, [id]));
  });
}

/** Xóa các mục chỉ định, hoặc toàn bộ khi không truyền `ids`. */
export function clearFailedItems(ids?: readonly string[]): Promise<number> {
  return serialize(async () => {
    const items = await load();
    const next = ids ? removeFailedItemIds(items, ids) : [];
    await save(next);
    return items.length - next.length;
  });
}

/** Xóa dữ liệu một profile thì cũng bỏ các file lỗi của profile đó. */
export function clearFailedItemsForUser(username: string): Promise<void> {
  return serialize(async () => {
    const items = await load();
    const next = items.filter((item) => item.username !== username);
    if (next.length !== items.length) await save(next);
  });
}
