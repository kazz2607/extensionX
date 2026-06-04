// @ts-nocheck
import { mediaStore, dirtyMediaStore, statsStore, tabState, downloadState, downloadedStore, userCsrfToken, setCsrfToken } from './state.ts';
import { fetchVideoForTweet } from './tweet-api.ts';
import { updateBadge, broadcastToPopup, updateFAB, broadcastFABState, sleep, waitForTabLoad, sanitizeFolder } from './utils.ts';
import { saveMediaItems, getMediaItems, clearMediaItems } from './indexeddb.ts';

// ─── S1: CSRF Token Auto-Refresh helpers ────────────────────────────────────────────
async function requestCsrfRefresh(tabId) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(null), 3000);
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_CSRF_REFRESH' }, (res) => {
      clearTimeout(timeout);
      resolve(res?.ct0 || null);
    });
  });
}

async function fetchVideoForTweetWithRefresh(tweetId, tabId) {
  try {
    return await fetchVideoForTweet(tweetId, self.userCsrfToken);
  } catch (err) {
    if (err.message === 'CSRF_STALE' && tabId) {
      console.warn('[SW] S1: ct0 stale, đang refresh...');
      const newToken = await requestCsrfRefresh(tabId);
      if (newToken) {
        self.userCsrfToken = newToken;
        console.log('[SW] S1: ct0 được refresh thành công, retry...');
        return await fetchVideoForTweet(tweetId, newToken);
      }
    }
    throw err;
  }
}
// ─── v4.3.0: Snowflake ID → Timestamp ────────────────────────────────────────
function tweetDateFromId(tweetId) {
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
function addMediaItems(username, items) {
  if (!mediaStore.has(username)) mediaStore.set(username, new Map());
  if (!statsStore.has(username)) statsStore.set(username, { image: 0, video: 0, gif: 0, hls: 0 });

  const store = mediaStore.get(username);
  const stats = statsStore.get(username);
  let newCount = 0;

  items.forEach(item => {
    if (store.has(item.url)) return;
    // v4.3.0: Gắn tweetDate từ Snowflake ID
    const tweetDate = tweetDateFromId(item.tweetId);
    const mediaItem = { ...item, addedAt: Date.now(), tweetDate };
    store.set(item.url, mediaItem);
    
    // v4.4.0: Thêm vào dirty store để persist delta
    if (!dirtyMediaStore.has(username)) dirtyMediaStore.set(username, new Map());
    dirtyMediaStore.get(username).set(item.url, mediaItem);

    newCount++;
    if (item.type === 'image') stats.image++;
    else if (item.type === 'gif') stats.gif++;
    else if (item.type === 'hls') stats.hls++;
    else stats.video++;
  });

  if (newCount > 0) {
    updateBadge(username);
    broadcastToPopup('MEDIA_COUNT_UPDATE', {
      username, count: store.size, newCount, stats: { ...stats },
    });
    // Session Restore: lưu session mỗi khi có media mới (debounce 2s)
    persistSession(username);
  }
  return newCount;
}

// ─── Apply Options Filter ─────────────────────────────────────────────────────
async function applyOptionsFilter(username, items) {
  let opts = {};
  try {
    const stored = await chrome.storage.sync.get('options');
    opts = stored.options || {};
  } catch (_) {}

  const { mediaTypes = {}, maxMedia = 0 } = opts;
  let filtered = items.filter(item => {
    if (item.type === 'image' && mediaTypes.images === false) return false;
    if (item.type === 'gif'   && mediaTypes.gifs   === false) return false;
    if ((item.type === 'video' || item.type === 'hls') && mediaTypes.videos === false) return false;
    return true;
  });

  // ─── Smart Filters ────────────────────────────────────────────────────────────
  const sf = opts.smartFilters || {};
  const filterAvatars    = sf.filterAvatars    !== false; // default ON
  const filterCardImages = sf.filterCardImages !== false; // default ON
  const minImageWidth    = sf.minImageWidth  > 0 ? sf.minImageWidth  : 0;
  const minImageHeight   = sf.minImageHeight > 0 ? sf.minImageHeight : 0;

  filtered = filtered.filter(item => {
    if (item.type !== 'image') return true; // Video/GIF không lọc

    const url = item.url || '';

    // 1. Lọc avatar & banner theo URL pattern
    if (filterAvatars && (
      url.includes('/profile_images/') ||
      url.includes('/profile_banners/')
    )) return false;

    // 2. Lọc card preview image theo URL pattern
    if (filterCardImages && url.includes('/card_img/')) return false;

    // 3. Lọc theo kích thước tối thiểu (chỉ khi có metadata)
    if (minImageWidth  > 0 && item.width  > 0 && item.width  < minImageWidth)  return false;
    if (minImageHeight > 0 && item.height > 0 && item.height < minImageHeight) return false;

    return true;
  });

  if (maxMedia > 0) {
    const currentCount = mediaStore.get(username)?.size || 0;
    const remaining = maxMedia - currentCount;
    if (remaining <= 0) return [];
    filtered = filtered.slice(0, remaining);
  }

  return filtered;
}


// ─── Auto-Scroll ──────────────────────────────────────────────────────────────
async function checkAutoScroll(tabId, username, isMediaPage) {
  if (!isMediaPage || !tabId || !username) return;
  try {
    const stored = await chrome.storage.sync.get('options');
    if (stored.options?.autoScroll) {
      setTimeout(() => startCollecting(username, tabId), 3000);
    }
  } catch (_) {}
}

async function startCollecting(username, tabId) {
  if (!tabId) {
    const tabs = await chrome.tabs.query({});
    tabId = tabs.find(t => t.url?.includes(username))?.id;
  }
  if (!tabId) return;

  const state = tabState.get(tabId) || {};
  if (state.isCollecting) return;

  state.isCollecting = true;
  state.username = username;
  state.scrollCount = 0;
  state.reachedEnd = false;
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
    // Sau navigate, gửi lại vì content script mới reload
    chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STARTED_LOCAL' }).catch(() => {});
  }

  scrollLoop(tabId, username);
}

async function scrollLoop(tabId, username) {
  let opts = {};
  try {
    const stored = await chrome.storage.sync.get('options');
    opts = stored.options || {};
  } catch (_) {}

  const MAX_SCROLLS = opts.maxScrolls || 200;
  let baseDelayMs = (opts.scrollDelay || 2) * 1000;
  const isAdaptive = opts.adaptiveScroll !== false; // Mặc định bật nếu không có
  
  let currentDelayMs = baseDelayMs;
  let noNewCount = 0;

  while (true) {
    const state = tabState.get(tabId);
    if (!state?.isCollecting) break;
    if (state.scrollCount >= MAX_SCROLLS) {
      state.isCollecting = false;
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
    } catch (_) { break; }

    state.scrollCount++;
    tabState.set(tabId, state);

    if (isAdaptive && scrollResult?.adaptiveAvg > 0) {
      currentDelayMs = Math.min(Math.max(Math.round(scrollResult.adaptiveAvg * 1.5 + 800), 1000), 6000);
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
      // Tab đang bị ẩn/minimized, X.com ngừng tải.
      // Reset lỗi và đợi lâu hơn một chút
      noNewCount = 0;
    } else if (scrollResult?.reachedEnd) {
      noNewCount++;
      if (noNewCount >= 3) {
        state.reachedEnd = true;
        state.isCollecting = false;
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

    await sleep(currentDelayMs + Math.random() * (currentDelayMs * 0.4));
  }
}

function stopCollecting(username) {
  tabState.forEach((state, tabId) => {
    if (state.username === username) {
      state.isCollecting = false;
      tabState.set(tabId, state);
      // Tắt flag isCollecting trong content.js của tab
      chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STOPPED_LOCAL' }).catch(() => {});
    }
  });
  broadcastToPopup('COLLECT_STOPPED', { username });
  // Session Restore: lưu clean session khi dừng chủ động
  persistSession(username);
}

// ─── Session Restore — Persist & Clear ───────────────────────────────────────
// Debounce timer để tránh ghi storage quá nhiều lần khi media flood vào liên tục
let _persistDebounceMap = new Map(); // Map<username, timerId>

async function persistSession(username) {
  // Hủy timer cũ (nếu có) để debounce
  const existing = _persistDebounceMap.get(username);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    _persistDebounceMap.delete(username);

    try {
      const store = mediaStore.get(username);
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
      await chrome.storage.local.set({
        [key]: sessionData,
        active_session_username: username,
      });
      console.debug(`[SW] Session saved: @${username} — ${store.size} items, scroll=${scrollCount}`);
    } catch (err) {
      console.warn('[SW] persistSession error:', err.message);
    }
  }, 2000); // Debounce 2 giây

  _persistDebounceMap.set(username, timer);
}

async function clearSession(username) {
  try {
    _persistDebounceMap.get(username) && clearTimeout(_persistDebounceMap.get(username));
    _persistDebounceMap.delete(username);
    dirtyMediaStore.delete(username);
    await chrome.storage.local.remove([`session_${username}`, 'active_session_username']);
    await clearMediaItems(username); // v4.4.0: Clear từ IndexedDB
    console.debug(`[SW] Session cleared: @${username}`);
  } catch (_) {}
}

// ─── v4.1.0: Duplicate Detection ────────────────────────────────────────────────
// Normalize URL: xóa query params biến đổi như ?t= nhưng giữ name=orig
function normalizeUrlForDedup(url) {
  try {
    const u = new URL(url);
    // Chỉ giữ path + format + name params (nếu có)
    const name   = u.searchParams.get('name')   || '';
    const format = u.searchParams.get('format') || '';
    const base = u.origin + u.pathname;
    if (name || format) return `${base}?name=${name}&format=${format}`;
    return base;
  } catch {
    return url.split('?')[0]; // fallback: chỉ lấy path
  }
}

// Load downloaded URLs từ storage vào memory
async function loadDownloadedUrls(username) {
  if (downloadedStore.has(username)) return; // Đã load rồi
  try {
    const key = `downloaded_${username}`;
    const data = await chrome.storage.local.get(key);
    const arr = data[key] || [];
    downloadedStore.set(username, new Set(arr));
  } catch (_) {
    downloadedStore.set(username, new Set());
  }
}

// Kiểm tra một URL đã được tải chưa
function isAlreadyDownloaded(username, url) {
  const set = downloadedStore.get(username);
  if (!set) return false;
  return set.has(normalizeUrlForDedup(url));
}

// Đánh dấu URL đã tải xong + persist vào storage
function markDownloaded(username, url) {
  if (!downloadedStore.has(username)) downloadedStore.set(username, new Set());
  const set = downloadedStore.get(username);
  set.add(normalizeUrlForDedup(url));
  // Persist debounce — ghi storage sau 3s, không ghi từng file một
  scheduleDownloadedPersist(username);
}

const _downloadedPersistTimers = new Map();
function scheduleDownloadedPersist(username) {
  const existing = _downloadedPersistTimers.get(username);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    _downloadedPersistTimers.delete(username);
    try {
      const key = `downloaded_${username}`;
      const arr = Array.from(downloadedStore.get(username) || []);
      // Giới hạn 50,000 entry — giữ 40,000 cái mới nhất nếu vượt
      const trimmed = arr.length > 50000 ? arr.slice(-40000) : arr;
      await chrome.storage.local.set({ [key]: trimmed });
    } catch (err) {
      console.debug('[SW] markDownloaded persist error:', err.message);
    }
  }, 3000);
  _downloadedPersistTimers.set(username, timer);
}

// ─── v4.1.0: Chrome System Notification ───────────────────────────────────────────
async function showDownloadNotification(username, success, failed, total, skipped) {
  try {
    const stored = await chrome.storage.sync.get('options');
    const opts = stored.options || {};
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
  } catch (err) {
    console.debug('[SW] showDownloadNotification error:', err.message);
  }
}

export {
  requestCsrfRefresh, fetchVideoForTweetWithRefresh,
  addMediaItems, applyOptionsFilter, tweetDateFromId,
  checkAutoScroll, startCollecting, stopCollecting, scrollLoop,
  persistSession, clearSession,
  loadDownloadedUrls, isAlreadyDownloaded, markDownloaded, showDownloadNotification
};
