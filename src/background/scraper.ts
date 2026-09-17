
import { mediaStore, dirtyMediaStore, statsStore, tabState, downloadState, downloadedStore, userCsrfToken, setCsrfToken } from './state.ts';
import { fetchVideoForTweet } from './tweet-api.ts';
import { updateBadge, broadcastToPopup, updateFAB, broadcastFABState, sleep, waitForTabLoad, sanitizeFolder } from './utils.ts';
import { saveMediaItems, getMediaItems, clearMediaItems, getDownloadedUrls, saveDownloadedUrls, clearDownloadedUrls, pruneDownloadedUrls } from './indexeddb.ts';
import { MediaItem, Options, CollectState } from '../types.ts';
import { filterMediaItems } from '../shared/media-filter.ts';
import { recordDiagnostic } from './diagnostics.ts';
import { canTransitionCollectPhase, type CollectPhase } from '../shared/collect-state.ts';
import { normalizeUrlForDedup } from '../shared/validation.ts';

// ─── BUG-03 FIX: Options Cache — tránh gọi storage.sync N lần per session ────
let _optionsCache: Options | null = null;
let _optionsCacheTime = 0;
const OPTIONS_CACHE_TTL = 30_000; // PERF-03: Tăng lên 30s (từ 5s) — options ít khi thay đổi trong lúc scroll

async function getCachedOptions(): Promise<Options> {
  const now = Date.now();
  if (_optionsCache !== null && now - _optionsCacheTime < OPTIONS_CACHE_TTL) {
    return _optionsCache;
  }
  try {
    const stored = await chrome.storage.sync.get('options');
    _optionsCache = (stored.options as Options) || {};
    _optionsCacheTime = now;
  } catch (_) {
    if (!_optionsCache) _optionsCache = {};
  }
  return _optionsCache!;
}

// Invalidate cache ngay khi user thay đổi cài đặt
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.options) {
    _optionsCache = null;
    _optionsCacheTime = 0;
    console.debug('[SW] Options cache invalidated');
  }
});

// ─── S1: CSRF Token Auto-Refresh helpers ────────────────────────────────────────────
async function requestCsrfRefresh(tabId: number) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(null), 3000);
    try {
      chrome.tabs.sendMessage(tabId, { type: 'REQUEST_CSRF_REFRESH' }, (res) => {
        // Consume runtime.lastError to prevent unchecked runtime error in extension page
        const _ = chrome.runtime.lastError;
        clearTimeout(timeout);
        resolve((res as any)?.ct0 || null);
      });
    } catch (_) {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

async function fetchVideoForTweetWithRefresh(tweetId: string, tabId?: number) {
  try {
    return await fetchVideoForTweet(tweetId, userCsrfToken);
  } catch (err: any) {
    if (tabId) {
      const newToken = await requestCsrfRefresh(tabId);
      if (newToken) {
        setCsrfToken(newToken as string);
        return await fetchVideoForTweet(tweetId, newToken as string);
      }
    }
    return null;
  }
}
// ─── v4.3.0: Snowflake ID → Timestamp ────────────────────────────────────────
function tweetDateFromId(tweetId: string | number | undefined) {
  if (!tweetId || !/^\d{10,}$/.test(String(tweetId))) return null;
  try {
    const ms = Number(BigInt(String(tweetId)) >> 22n) + 1288834974657;
    if (ms < 1136073600000 || ms > Date.now() + 86400000) return null;
    return ms; // timestamp ms — dễ so sánh
  } catch {
    return null;
  }
}

// ─── Add Media Items ──────────────────────────────────────────────────────────
const MEMORY_WARN_THRESHOLD = 50_000;
const _warnedUsers = new Set<string>(); // tránh spam warning mỗi item

// Đảm bảo mediaStore và statsStore được nạp từ IndexedDB nếu SW vừa restart
async function ensureMediaStoreLoaded(username: string): Promise<Map<string, MediaItem>> {
  if (!username) return new Map();
  if (mediaStore.has(username) && mediaStore.get(username)!.size > 0) {
    return mediaStore.get(username)!;
  }
  // Thử nạp từ IndexedDB
  try {
    const items = await getMediaItems(username);
    if (Array.isArray(items) && items.length > 0) {
      if (!mediaStore.has(username)) mediaStore.set(username, new Map());
      if (!statsStore.has(username)) statsStore.set(username, { image: 0, video: 0, gif: 0, hls: 0 });
      const store = mediaStore.get(username)!;
      const stats = statsStore.get(username)!;
      items.forEach((item: MediaItem) => {
        if (!store.has(item.url)) {
          store.set(item.url, item);
          if (item.type === 'image') stats.image++;
          else if (item.type === 'gif') stats.gif++;
          else if (item.type === 'hls') stats.hls++;
          else stats.video++;
        }
      });
      return store;
    }
  } catch (err: any) {
    console.debug('[SW] ensureMediaStoreLoaded error:', err?.message);
  }
  if (!mediaStore.has(username)) mediaStore.set(username, new Map());
  if (!statsStore.has(username)) statsStore.set(username, { image: 0, video: 0, gif: 0, hls: 0 });
  return mediaStore.get(username)!;
}

function addMediaItems(username: string, items: MediaItem[]) {
  if (!mediaStore.has(username)) mediaStore.set(username, new Map());
  if (!statsStore.has(username)) statsStore.set(username, { image: 0, video: 0, gif: 0, hls: 0 });

  const store = mediaStore.get(username)!;
  const stats = statsStore.get(username)!;
  let newCount = 0;

  items.forEach((item: MediaItem) => {
    if (store.has(item.url)) return;
    // v4.3.0: Gắn tweetDate từ Snowflake ID
    const tweetDate = tweetDateFromId(item.tweetId);
    const mediaItem = { ...item, addedAt: Date.now(), tweetDate };
    store.set(item.url, mediaItem);

    // v4.4.0: Thêm vào dirty store để persist delta
    if (!dirtyMediaStore.has(username)) dirtyMediaStore.set(username, new Map());
    dirtyMediaStore.get(username)!.set(item.url, mediaItem);

    newCount++;
    if (item.type === 'image') stats.image++;
    else if (item.type === 'gif') stats.gif++;
    else if (item.type === 'hls') stats.hls++;
    else stats.video++;
  });

  if (newCount > 0) {
    void recordDiagnostic('media.accepted', newCount);
    updateBadge(username);
    broadcastToPopup('MEDIA_COUNT_UPDATE', {
      username, count: store.size, newCount, stats: { ...stats },
    });
    // Session Restore: lưu session mỗi khi có media mới (debounce 2s)
    persistSession(username);

    // PERF-03: Cảnh báo bộ nhớ khi store vượt ngưỡng 50k items
    if (store.size >= MEMORY_WARN_THRESHOLD && !_warnedUsers.has(username)) {
      _warnedUsers.add(username);
      console.warn(`[SW] ⚠️ @${username}: store đạt ${store.size} items — nên dừng thu thập và tải xuống trước`);
      broadcastToPopup('MEDIA_MEMORY_WARNING', { username, count: store.size });
    }
  }
  return newCount;
}

// ─── Apply Options Filter ─────────────────────────────────────────────────────
async function applyOptionsFilter(username: string, items: MediaItem[]) {
  const opts = await getCachedOptions();
  return filterMediaItems(items, opts, mediaStore.get(username)?.size || 0);
}


// ─── Auto-Scroll ──────────────────────────────────────────────────────────────
// @ts-ignore
async function checkAutoScroll(tabId, username, isMediaPage) {
  if (!isMediaPage || !tabId || !username) return;
  const opts = await getCachedOptions();
  if (opts.autoScroll) {
    setTimeout(() => startCollecting(username, tabId), 3000);
  }
}

async function startCollecting(username: string, tabId?: number) {
  // FEA-01: Block bookmark scanning khi tắt trong options
  if (username === '_bookmarks_') {
    const opts = await getCachedOptions();
    if ((opts as any).enableBookmarks === false) {
      console.log('[SW] Bookmark scanning disabled by user — skip');
      return;
    }
  }

  if (!tabId) {
    // SEC-05 FIX: Chỉ query tab x.com/twitter.com — không đọc URL mọi tab của user
    const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*', 'https://*.x.com/*', 'https://*.twitter.com/*'] });
    tabId = tabs.find(t => t.url?.includes(username))?.id;
  }
  if (!tabId) return;

  const state: CollectState = tabState.get(tabId) || { scrollCount: 0 };
  if (state.isCollecting || !canTransitionCollectPhase(state.phase ?? 'idle', 'starting')) return;

  state.phase = 'starting';
  state.isCollecting = true;
  state.username = username;
  state.scrollCount = 0;
  state.reachedEnd = false;
  const operationId = crypto.randomUUID();
  state.operationId = operationId;
  tabState.set(tabId, state);

  broadcastToPopup('COLLECT_STARTED', { username });

  // Bật flag isCollecting trong content.js của tab này
  chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STARTED_LOCAL' }).catch(() => {});

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  let targetUrl = `https://x.com/${username}/media`;
  if (username === '_bookmarks_') targetUrl = 'https://x.com/i/bookmarks';
  else if (username.endsWith('_likes')) targetUrl = `https://x.com/${username.replace('_likes', '')}/likes`;

  // Kiểm tra tab hiện tại có đang ở đúng trang thu thập không
  const isOnRightPage = tab && (
    (username === '_bookmarks_' && tab.url?.includes('/i/bookmarks')) ||
    (username.endsWith('_likes') && tab.url?.includes('/likes')) ||
    (!username.endsWith('_likes') && username !== '_bookmarks_' && tab.url?.includes('/media'))
  );

  if (tab && !isOnRightPage) {
    await chrome.tabs.update(tabId, { url: targetUrl });
    await waitForTabLoad(tabId);
    await sleep(3000);
    if (tabState.get(tabId)?.operationId !== operationId) return;
    // Sau navigate, gửi lại vì content script mới reload
    chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STARTED_LOCAL' }).catch(() => {});
  }

  const activeState = tabState.get(tabId);
  if (!activeState || activeState.operationId !== operationId) return;
  activeState.phase = 'collecting';
  tabState.set(tabId, activeState);
  void scrollLoop(tabId, username, operationId);
}

function finishCollecting(state: CollectState, phase: Extract<CollectPhase, 'stopped' | 'failed'>): CollectState {
  const current = state.phase ?? 'collecting';
  if (canTransitionCollectPhase(current, phase)) state.phase = phase;
  state.isCollecting = false;
  state.operationId = undefined;
  return state;
}

async function scrollLoop(tabId: number, username: string, operationId: string) {
  const opts = await getCachedOptions();

  const MAX_SCROLLS = opts.maxScrolls || 200;
  let baseDelayMs = (opts.scrollDelay || 2) * 1000;
  const isAdaptive = opts.adaptiveScroll !== false;
  // FEAT-08: Smart Auto-Stop config
  const autoStopEnabled = opts.autoStop === true;
  const autoStopAfter = Math.max(opts.autoStopAfter || 10, 3); // min 3 để tránh dừng nhầm

  let currentDelayMs = baseDelayMs;
  let noNewCount = 0;
  // FEAT-08: Track số scroll liên tiếp không có media mới
  let noNewMediaCount = 0;
  let lastMediaCount = mediaStore.get(username)?.size || 0;

  while (true) {
    const state = tabState.get(tabId);
    if (!state?.isCollecting || state.operationId !== operationId) break;
    if (state.scrollCount >= MAX_SCROLLS) {
      finishCollecting(state, 'stopped');
      tabState.set(tabId, state);
      chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STOPPED_LOCAL' }).catch(() => {});
      broadcastToPopup('COLLECT_DONE', {
        username, mediaCount: mediaStore.get(username)?.size || 0,
        reachedEnd: false, reason: 'max_scrolls',
      });
      break;
    }

    let scrollResult;
    try {
      scrollResult = await chrome.tabs.sendMessage(tabId, {
        type: 'SCROLL_DOWN', waitMs: Math.max(currentDelayMs, 2000),
      });
      if (scrollResult?.error === 'not_media_page') {
        stopCollecting(username);
        break;
      }
    } catch (_) {
      if (tabState.get(tabId)?.operationId === operationId) {
        finishCollecting(state, 'failed');
        tabState.set(tabId, state);
        broadcastToPopup('COLLECT_DONE', { username, mediaCount: mediaStore.get(username)?.size || 0, reachedEnd: false, reason: 'tab_unavailable' });
      }
      break;
    }

    // A late SCROLL_DOWN response belongs to the operation that sent it. If
    // the user stopped/restarted meanwhile, discard it without changing state.
    if (tabState.get(tabId)?.operationId !== operationId) break;

    state.scrollCount++;
    tabState.set(tabId, state);

    if (isAdaptive && scrollResult?.adaptiveAvg > 0) {
      // PERF-05: EMA smoothing — tránh delay tăng/giảm đột ngột gây scroll bất ổn định
      const EMA_ALPHA = 0.3;
      const rawDelay = Math.min(Math.max(Math.round(scrollResult.adaptiveAvg * 1.5 + 800), 1000), 6000);
      currentDelayMs = Math.round(EMA_ALPHA * rawDelay + (1 - EMA_ALPHA) * currentDelayMs);
    }

    const currentCount = mediaStore.get(username)?.size || 0;
    broadcastToPopup('SCROLL_PROGRESS', {
      username, scrollCount: state.scrollCount,
      mediaCount: currentCount, stats: statsStore.get(username) || {},
      adaptiveSpeed: isAdaptive ? currentDelayMs : null
    });

    updateFAB(tabId, username, state.scrollCount);

    // Session Restore: lưu session mỗi 5 scroll
    if (state.scrollCount % 5 === 0) persistSession(username);

    if (scrollResult?.isHidden) {
      // Tab đang bị ẩn — BUG-L4 FIX: Reset delay và noNewMedia count
      noNewCount = 0;
      noNewMediaCount = 0; // FEAT-08: không đếm khi tab ẩn (X.com không load)
      currentDelayMs = baseDelayMs;
    } else if (scrollResult?.reachedEnd) {
      noNewCount++;
      if (noNewCount >= 3) {
        state.reachedEnd = true;
        finishCollecting(state, 'stopped');
        tabState.set(tabId, state);
        chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STOPPED_LOCAL' }).catch(() => {});
        broadcastToPopup('COLLECT_DONE', {
          username, mediaCount: currentCount, reachedEnd: true, reason: 'end_of_page',
        });
        broadcastFABState(tabId, 'COLLECT_DONE');
        break;
      }
    } else {
      noNewCount = 0;
    }

    // FEAT-08: Smart Auto-Stop — đếm scroll không có media mới
    if (autoStopEnabled && !scrollResult?.isHidden) {
      if (currentCount > lastMediaCount) {
        noNewMediaCount = 0; // có media mới → reset counter
        lastMediaCount = currentCount;
      } else {
        noNewMediaCount++;
        if (noNewMediaCount >= autoStopAfter) {
          finishCollecting(state, 'stopped');
          tabState.set(tabId, state);
          chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STOPPED_LOCAL' }).catch(() => {});
          broadcastToPopup('COLLECT_DONE', {
            username, mediaCount: currentCount, reachedEnd: false, reason: 'auto_stop',
            autoStopAfter,
          });
          broadcastFABState(tabId, 'COLLECT_DONE');
          console.log(`[SW] FEAT-08: Auto-Stop sau ${noNewMediaCount} scroll không có media mới`);
          break;
        }
      }
    }

    await sleep(currentDelayMs + Math.random() * (currentDelayMs * 0.4));
  }
}

// @ts-ignore
function stopCollecting(username: string) {
  tabState.forEach((state, tabId) => {
    if (!username || !state.username || state.username.toLowerCase() === String(username).toLowerCase()) {
      state.isCollecting = false;
      state.operationId = undefined;
      state.phase = 'stopped';
      tabState.set(tabId, state);
      // Tắt flag isCollecting trong content.js của tab
      chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STOPPED_LOCAL' }).catch(() => {});
      broadcastFABState(tabId, 'COLLECT_DONE');
    }
  });
  broadcastToPopup('COLLECT_STOPPED', { username: username || '' });
  broadcastToPopup('COLLECT_DONE', {
    username: username || '',
    mediaCount: username ? (mediaStore.get(username)?.size || 0) : 0,
    reachedEnd: false,
    reason: 'user_stopped'
  });
  // Session Restore: lưu clean session khi dừng chủ động
  if (username) persistSession(username);
}

/** Release tab-scoped state without stopping another tab for the same profile. */
function stopCollectingForTab(tabId: number) {
  const state = tabState.get(tabId);
  if (!state) return;
  tabState.delete(tabId);
  if (state.username) {
    void persistSession(state.username);
    broadcastToPopup('COLLECT_STOPPED', { username: state.username, reason: 'tab_closed' });
  }
}

// ─── Session Restore — Persist & Clear ───────────────────────────────────────
// Debounce timer để tránh ghi storage quá nhiều lần khi media flood vào liên tục
let _persistDebounceMap = new Map(); // Map<username, timerId>

async function persistSession(username: string) {
  // Hủy timer cũ (nếu có) để debounce
  const existing = _persistDebounceMap.get(username);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    _persistDebounceMap.delete(username);

    try {
      const store = mediaStore.get(username)!;
      if (!store?.size) return; // Không có gì để lưu
      
      const dirtyStore = dirtyMediaStore.get(username);
      if (dirtyStore && dirtyStore.size > 0) {
        const dirtyItems = Array.from(dirtyStore.values());
        // v4.4.0: Lưu dirty items vào IndexedDB (Delta Write)
        await saveMediaItems(username, dirtyItems);
        // Sau khi lưu thành công, clear dirty store của user này
        dirtyStore.clear();
      }

      // Lấy scrollCount từ tabState
      let scrollCount = 0;
      tabState.forEach(state => {
        if (state.username === username && state.scrollCount > scrollCount) {
          scrollCount = state.scrollCount;
        }
      });

      let profileUrl = `https://x.com/${username}/media`;
      if (username === '_bookmarks_') profileUrl = 'https://x.com/i/bookmarks';
      else if (username.endsWith('_likes')) profileUrl = `https://x.com/${username.replace('_likes', '')}/likes`;

      const sessionData = {
        username,
        profileUrl,
        mediaCount: store.size,
        scrollCount,
        savedAt: Date.now(),
        // v4.4.0: Bỏ mediaItems khỏi sessionData để nhẹ chrome.storage.local
        stats: statsStore.get(username) || {},
      };

      const key = `session_${username}`;
      // A delayed persistence from profile A must not overwrite profile B's
      // active restore pointer while B is collecting in another tab.
      const hasOtherActiveCollection = Array.from(tabState.values()).some(
        state => state.isCollecting && state.username !== username
      );
      const dataToPersist: Record<string, unknown> = { [key]: sessionData };
      if (!hasOtherActiveCollection) dataToPersist.active_session_username = username;
      await chrome.storage.local.set(dataToPersist);
      console.debug(`[SW] Session saved: @${username} — ${store.size} items, scroll=${scrollCount}`);
    } catch (err: any) {
      console.warn('[SW] persistSession error:', err.message);
    }
  }, 2000); // Debounce 2 giây

  _persistDebounceMap.set(username, timer);
}

async function clearSession(username: string) {
  try {
    _persistDebounceMap.get(username) && clearTimeout(_persistDebounceMap.get(username));
    _persistDebounceMap.delete(username);
    dirtyMediaStore.delete(username);
    // BUG-L3 FIX: Xóa riêng session key — không xóa active_session_username cùng lúc
    await chrome.storage.local.remove(`session_${username}`);
    // Chỉ xóa active_session_username nếu đang trỏ đúng username này
    // Tránh race condition khi user khác đang collecting và ta xóa nhầm session của họ
    const current = await chrome.storage.local.get('active_session_username');
    if (current.active_session_username === username) {
      await chrome.storage.local.remove('active_session_username');
    }
    await clearMediaItems(username); // v4.4.0: Clear từ IndexedDB
    console.debug(`[SW] Session cleared: @${username}`);
  } catch (_) {}
}

// Load downloaded URLs từ storage vào memory
async function loadDownloadedUrls(username: string) {
  if (downloadedStore.has(username)) return; // Đã load rồi
  try {
    // Prune on load (rather than every completion) to keep hot download paths
    // fast while applying TTL/LRU when a profile is next used.
    await pruneDownloadedUrls(username);
    const urls = await getDownloadedUrls(username);
    if (urls.length > 0) {
      downloadedStore.set(username, new Set(urls));
      return;
    }
    // One-time migration from releases that stored a large serialized array.
    const legacyKey = `downloaded_${username}`;
    const legacy = await chrome.storage.local.get(legacyKey);
    const legacyUrls = Array.isArray(legacy[legacyKey]) ? legacy[legacyKey].filter((url): url is string => typeof url === 'string') : [];
    downloadedStore.set(username, new Set(legacyUrls));
    if (legacyUrls.length > 0) {
      await saveDownloadedUrls(username, legacyUrls);
      await chrome.storage.local.remove(legacyKey);
    }
  } catch (_) {
    downloadedStore.set(username, new Set<string>());
  }
}

// Kiểm tra một URL đã được tải chưa
function isAlreadyDownloaded(username: string, url: string) {
  const set = downloadedStore.get(username)!;
  if (!set) return false;
  return set.has(normalizeUrlForDedup(url));
}

// Đánh dấu URL đã tải xong + persist vào storage
function markDownloaded(username: string, url: string) {
  if (!downloadedStore.has(username)) downloadedStore.set(username, new Set<string>());
  const set = downloadedStore.get(username)!;
  const normalizedUrl = normalizeUrlForDedup(url);
  const isNew = !set.has(normalizedUrl);
  set.add(normalizedUrl);
  // Persist debounce — ghi storage sau 3s, không ghi từng file một
  if (isNew) scheduleDownloadedPersist(username, normalizedUrl);
}

const _downloadedPersistTimers = new Map();
const _dirtyDownloadedUrls = new Map<string, Set<string>>();
// @ts-ignore
function scheduleDownloadedPersist(username: string, normalizedUrl: string) {
  // Only write the new key. IndexedDB upserts atomically and avoids serializing
  // the full history after every completed file.
  if (!_dirtyDownloadedUrls.has(username)) _dirtyDownloadedUrls.set(username, new Set());
  _dirtyDownloadedUrls.get(username)!.add(normalizedUrl);
  const existing = _downloadedPersistTimers.get(username);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    _downloadedPersistTimers.delete(username);
    try {
      const dirty = _dirtyDownloadedUrls.get(username);
      if (dirty?.size) await saveDownloadedUrls(username, dirty);
      _dirtyDownloadedUrls.delete(username);
    } catch (err: any) {
      console.debug('[SW] markDownloaded persist error:', err.message);
    }
  }, 3000);
  _downloadedPersistTimers.set(username, timer);
}

// ─── v4.1.0: Chrome System Notification ───────────────────────────────────────────
async function showDownloadNotification(username: string, success: number, failed: number, total: number, skipped: number) {
  try {
    const stored = await chrome.storage.sync.get('options');
    const opts = stored.options || {};
// @ts-ignore
    if (opts.showNotification === false) return; // opt-out

    const emoji  = failed > 0 ? '⚠️' : '✅';
    const detail = failed > 0
      ? `${success} thành công, ${failed} lỗi`
      : `${success} file đã tải xong`;
    const skipNote = skipped > 0 ? ` (bỏ qua ${skipped} đã có)` : '';

    chrome.notifications.create(`download_done_${Date.now()}`, {
      type:    'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title:   `${emoji} X Media Downloader`,
      message: `@${username}: ${detail}${skipNote}`,
      contextMessage: `Tổng: ${total} files`,
      priority: 1,
    });
  } catch (err: any) {
    console.debug('[SW] showDownloadNotification error:', err.message);
  }
}

export {
  requestCsrfRefresh, fetchVideoForTweetWithRefresh,
  addMediaItems, ensureMediaStoreLoaded, applyOptionsFilter, tweetDateFromId,
  checkAutoScroll, startCollecting, stopCollecting, stopCollectingForTab, scrollLoop,
  persistSession, clearSession,
  loadDownloadedUrls, isAlreadyDownloaded, markDownloaded, showDownloadNotification
};
