/**
 * watch-list.ts — Pha 15: Watch mode theo profile (thiết kế an toàn, không poll ngầm).
 *
 * QUYẾT ĐỊNH THIẾT KẾ (đã xác nhận với người dùng): extension hiện chỉ thu thập
 * media khi có tab X.com thật đang mở (content script bắt request từ trang thật).
 * Để Watch mode chạy ngầm thật (chrome.alarms + mở tab định kỳ, hoặc gọi thẳng
 * GraphQL API từ service worker) sẽ làm tăng đáng kể rủi ro bị X.com coi là hành
 * vi bot so với cách dùng hiện tại. Do đó Pha 15 KHÔNG polling ngầm — chỉ so sánh
 * số media hiện tại với lần xem gần nhất mỗi khi người dùng tự mở lại popup, dùng
 * đúng dữ liệu `GET_MEDIA_COUNT` đã được gọi sẵn trong luồng hiện có. Không có
 * request mạng nào tới X.com được thêm ra so với trước Pha 15.
 */

const STORAGE_KEY = 'watched_profiles';

interface WatchEntry {
  lastCount: number;
  lastCheckedAt: number;
}

type WatchMap = Record<string, WatchEntry>;

async function getWatchMap(): Promise<WatchMap> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(STORAGE_KEY).catch(() => ({}));
  return (stored[STORAGE_KEY] as WatchMap) || {};
}

async function setWatchMap(map: WatchMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

export async function isWatched(username: string): Promise<boolean> {
  const map = await getWatchMap();
  return !!map[username];
}

/** Bật/tắt theo dõi cho username — trả về trạng thái mới. */
export async function toggleWatch(username: string, currentCount: number): Promise<boolean> {
  const map = await getWatchMap();
  if (map[username]) {
    delete map[username];
  } else {
    map[username] = { lastCount: currentCount, lastCheckedAt: Date.now() };
  }
  await setWatchMap(map);
  return !!map[username];
}

/**
 * Gọi mỗi khi popup xác định được profile hiện tại + số media mới nhất (đã có
 * sẵn từ GET_MEDIA_COUNT, không gọi thêm request nào). Nếu profile đang được
 * theo dõi và có media mới kể từ lần xem trước, trả về số lượng mới; luôn cập
 * nhật lại baseline cho lần xem kế tiếp.
 */
export async function checkWatchedProfile(username: string, currentCount: number): Promise<number | null> {
  const map = await getWatchMap();
  const entry = map[username];
  if (!entry) return null;
  const delta = currentCount - entry.lastCount;
  map[username] = { lastCount: currentCount, lastCheckedAt: Date.now() };
  await setWatchMap(map);
  return delta > 0 ? delta : null;
}
