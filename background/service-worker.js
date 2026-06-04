/**
 * service-worker.js — Background Service Worker (v4.3.0)
 * Thay đổi chính:
 *   - Bỏ ZIP hoàn toàn
 *   - Dùng chrome.downloads.download() tải từng file
 *   - Lưu vào: {Downloads}/{saveFolder}/{username}/{images|videos|gifs}/
 *   - Download queue với giới hạn concurrent
 *   - Track progress qua chrome.downloads.onChanged
 *   - v4.2.0: Multi-Profile Queue — hàng đợi nhiều profile tuần tự
 *   - v4.3.0: Date Range Filter — lọc media theo khoảng ngày từ Snowflake ID
 */

import { fetchVideoForTweet } from './tweet-api.js';
import { saveMediaItems, getMediaItems, clearMediaItems } from './indexeddb.js'; // v4.4.0 IndexedDB

// ─── State ────────────────────────────────────────────────────────────────────
const mediaStore = new Map();   // Map<username, Map<url, MediaItem>>
const dirtyMediaStore = new Map(); // Map<username, Map<url, MediaItem>> (v4.4.0: Delta write)
const tabState   = new Map();   // Map<tabId, CollectState>
const statsStore = new Map();   // Map<username, {image,video,gif,hls}>

// v4.1.0 Duplicate Detection: lưu Set<url> các file đã tải theo username
const downloadedStore = new Map(); // Map<username, Set<url>>

let downloadInProgress = false;

// ─── v4.2.0: Multi-Profile Queue ─────────────────────────────────────────────
// profileQueue: Array<{ id, username, filterType, skipDuplicates, addedAt, status, mediaCount, result }>
let profileQueue = [];

async function loadPersistedQueue() {
  try {
    const data = await chrome.storage.local.get('profile_queue');
    const saved = data.profile_queue || [];
    // Các item đang 'downloading' khi SW restart → đặt lại 'waiting'
    profileQueue = saved.map(item =>
      item.status === 'downloading' ? { ...item, status: 'waiting' } : item
    );
  } catch (_) {
    profileQueue = [];
  }
}

let _queuePersistTimer = null;
function persistQueue() {
  if (_queuePersistTimer) clearTimeout(_queuePersistTimer);
  _queuePersistTimer = setTimeout(async () => {
    _queuePersistTimer = null;
    try {
      await chrome.storage.local.set({ profile_queue: profileQueue });
    } catch (err) {
      console.debug('[SW] persistQueue error:', err.message);
    }
  }, 500);
}

function broadcastQueueUpdate() {
  broadcastToPopup('QUEUE_UPDATE', { queue: profileQueue });
}

async function startNextInQueue() {
  if (downloadInProgress) return; // Đang có download chạy — đợi
  const next = profileQueue.find(item => item.status === 'waiting');
  if (!next) return; // Hàng đợi rỗng

  const store = mediaStore.get(next.username);
  if (!store?.size) {
    // Không có media → đánh dấu error và chuyển tiếp
    next.status = 'error';
    next.result = { error: 'No media found' };
    persistQueue();
    broadcastQueueUpdate();
    startNextInQueue();
    return;
  }

  next.status = 'downloading';
  persistQueue();
  broadcastQueueUpdate();

  // startDownload sẽ tự gọi startNextInQueue() trong finally
  startDownload(next.username, {
    filterType: next.filterType || 'all',
    skipDuplicates: next.skipDuplicates !== false,
    _fromQueue: true,
    _queueId: next.id,
  });
}

// Khởi tải queue từ storage khi SW khởi động
loadPersistedQueue().then(() => {
  // Không auto-resume download ngay khi SW khởi động lại — chờ user tương tác
  broadcastQueueUpdate();
});

// ─── Download Tracker ─────────────────────────────────────────────────────────
// Map<downloadId, {resolve, reject}>
const activeDownloads = new Map();

// ─── BUG-2 FIX: Keep-alive alarm để SW không bị Chrome terminate ───────────────
const KEEPALIVE_ALARM = 'sw-keepalive';
const DOWNLOAD_TIMEOUT_MS = 90_000; // BUG-1 FIX: 90 giây timeout mỗi file

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Ping nhẹ để giữ SW sống. Không làm gì thêm.
    console.debug('[SW] keepalive ping');
  }
});

function startKeepAlive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // mỗi 24 giây
}

function stopKeepAlive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

let _lastProgressTime = 0;
// Đăng ký listener theo dõi từng download
chrome.downloads.onChanged.addListener((delta) => {
  const tracked = activeDownloads.get(delta.id);
  if (!tracked) return;

  if (delta.state) {
    if (delta.state.current === 'complete') {
      tracked.resolve(delta.id);
      activeDownloads.delete(delta.id);
    } else if (delta.state.current === 'interrupted') {
      const err = delta.error?.current || '';
      // IDM FIX: Kiểm tra xem IDM có hijack download này không
      if (isIdmHijack(delta.id, tracked.startTime || Date.now(), err)) {
        maybeWarnIdm();
        tracked.resolve(delta.id);
      } else {
        tracked.reject(new Error(err || 'Download interrupted'));
      }
      activeDownloads.delete(delta.id);
    }
  } 
  
  // Update progress
  if (delta.bytesReceived) tracked.bytesReceived = delta.bytesReceived.current;
  if (delta.totalBytes) tracked.totalBytes = delta.totalBytes.current;

  // v4.4.0: Throttled broadcast (max 2 lần/s)
  if (Date.now() - _lastProgressTime > 500 && activeDownloads.size > 0) {
    _lastProgressTime = Date.now();
    const activeList = Array.from(activeDownloads.values()).map(d => {
      const elapsed = (Date.now() - d.startTime) / 1000 || 1;
      return {
        filename: d.filename,
        bytesReceived: d.bytesReceived,
        totalBytes: d.totalBytes,
        speedBps: d.bytesReceived / elapsed
      };
    });
    // Send info to Popup & Snackbar
    broadcastToPopup('ACTIVE_DOWNLOADS_UPDATE', activeList);
    // Snackbar (lấy username từ tab hiện tại bằng cách hack logic hoặc gửi cho tất cả tab)
    // Tạm thời truyền cho tất cả tab có state đang collecting
    tabState.forEach((state, tabId) => {
      if (state.isCollecting) {
        chrome.tabs.sendMessage(tabId, { type: 'SNACKBAR_UPDATE', payload: { type: 'ACTIVE_DOWNLOADS_UPDATE', activeList } }).catch(() => {});
      }
    });
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {

    case 'MEDIA_FOUND': {
      const { username, mediaItems } = payload;
      if (!username || !mediaItems?.length) return false;
      const tabId = sender.tab?.id;

      console.log(`[SW] MEDIA_FOUND: ${mediaItems.length} items từ ${payload.sourceUrl || '?'} cho @${username}`);

      // BUG-D FIX: Dùng Promise.all thay vì forEach async để quản lý đúng
      Promise.all(mediaItems.map(async (item) => {
        if (!item) return;

        if (item.type === 'video_placeholder') {
          // BUG-A FIX: Guard tweetId rỗng — tránh gọi API với ID không hợp lệ → cascade 404
          if (!item.tweetId || !/^\d{10,}$/.test(item.tweetId)) {
            console.debug(`[SW] video_placeholder bỏ qua: tweetId không hợp lệ ('${item.tweetId}')`);
            return;
          }

          // Kiểm tra xem interceptor đã bắt được video URL của tweet này chưa
          const store = mediaStore.get(username);
          let alreadyHasVideo = false;
          if (store) {
            for (const media of store.values()) {
              if (media.tweetId === item.tweetId && (media.type === 'video' || media.type === 'hls' || media.type === 'gif')) {
                alreadyHasVideo = true;
                break;
              }
            }
          }
          if (alreadyHasVideo) return; // Đã có video gốc, không cần gọi API

          console.log(`[SW] video_placeholder: tweetId=${item.tweetId}, nguồn=${item.source}`);
          try {
            const videoItem = await fetchVideoForTweet(item.tweetId, self.userCsrfToken);

            if (videoItem) {
              videoItem.url = videoItem.url.replace(/name=\w+/, 'name=orig');
              videoItem.username = username;
              const added = addMediaItems(username, [videoItem]);
              if (added > 0) updateFAB(tabId, username);
            } else {
              console.warn(`[SW] ✗ Không lấy được video URL cho tweet ${item.tweetId}`);
            }
          } catch (err) {
            console.warn('[SW] fetchVideoForTweet lỗi:', item.tweetId, err.message);
          }
        } else {
          // Xử lý ảnh hoặc video URL trực tiếp (từ page-interceptor)
          item.username = username;
          if (item.type === 'hls' || item.type === 'video' || item.type === 'gif') {
            console.log(`[SW] ${item.type.toUpperCase()} URL: ${(item.url || '').slice(0, 80)}...`);
          }
          const filtered = await applyOptionsFilter(username, [item]);
          if (filtered.length > 0) {
            const added = addMediaItems(username, filtered);
            if (added > 0) updateFAB(tabId, username);
          }
        }
      })).catch(err => console.debug('[SW] MEDIA_FOUND handler error:', err.message));
      return false;
    }

    case 'PAGE_LOADED': {
      const { username, url, isMediaPage, ct0 } = payload;
      const tabId = sender.tab?.id;
      if (tabId && username) {
        const existingState = tabState.get(tabId) || {};
        const isCollecting = existingState.isCollecting && isMediaPage;
        
        tabState.set(tabId, { 
          username, 
          url, 
          isMediaPage, 
          isCollecting, 
          scrollCount: isCollecting ? existingState.scrollCount : 0, 
          reachedEnd: false, 
          ct0: ct0 || existingState.ct0
        });
        
        if (ct0) {
          // Lưu ct0 global cho background API
          self.userCsrfToken = ct0;
        }

        if (isCollecting) {
          chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STARTED_LOCAL' }).catch(() => {});
        } else if (!isCollecting && existingState.isCollecting) {
          stopCollecting(existingState.username || username);
        }
      }
      checkAutoScroll(tabId, username, isMediaPage);
      return false;
    }

    case 'GET_MEDIA_COUNT': {
      sendResponse({ count: mediaStore.get(payload.username)?.size || 0 });
      return true;
    }

    case 'GET_STATS': {
      sendResponse({ stats: statsStore.get(payload.username) || { image: 0, video: 0, gif: 0, hls: 0 } });
      return true;
    }

    case 'GET_ALL_USERNAMES': {
      const usernames = [];
      mediaStore.forEach((store, username) => {
        usernames.push({ username, count: store.size, stats: statsStore.get(username) });
      });
      sendResponse({ usernames });
      return true;
    }

    case 'GET_TAB_STATE': {
      let isCollecting = false;
      let scrollCount = 0;
      tabState.forEach((state, tid) => {
        if (state.username === payload.username && state.isCollecting) {
          isCollecting = true;
          scrollCount = state.scrollCount;
        }
      });
      sendResponse({ isCollecting, scrollCount });
      return true;
    }

    case 'CLEAR_MEDIA': {
      mediaStore.delete(payload.username);
      statsStore.delete(payload.username);
      chrome.action.setBadgeText({ text: '' });
      broadcastToPopup('MEDIA_CLEARED', { username: payload.username });
      // Session Restore: xóa session đã lưu khi user xóa thủ công
      clearSession(payload.username);
      return false;
    }

    case 'START_COLLECTING': {
      startCollecting(payload.username, sender.tab?.id);
      sendResponse({ ok: true });
      return true;
    }

    case 'STOP_COLLECTING': {
      stopCollecting(payload.username);
      sendResponse({ ok: true });
      return true;
    }

    case 'START_DOWNLOAD': {
      const { username, options } = payload;
      if (downloadInProgress) {
        sendResponse({ error: 'Download in progress' });
        return false;
      }
      startDownload(username, options);
      sendResponse({ ok: true });
      return true;
    }

    // ─── v4.2.0: Multi-Profile Queue ────────────────────────────────────────
    case 'ADD_TO_QUEUE': {
      const { username, filterType, skipDuplicates } = payload;
      if (!username) { sendResponse({ error: 'No username' }); return false; }
      // Không thêm trùng username (chỉ 1 entry mỗi username trong queue)
      const exists = profileQueue.find(q => q.username === username && q.status === 'waiting');
      if (exists) { sendResponse({ error: 'Already in queue' }); return false; }

      const mediaCount = mediaStore.get(username)?.size || 0;
      const item = {
        id: `${username}_${Date.now()}`,
        username,
        filterType: filterType || 'all',
        skipDuplicates: skipDuplicates !== false,
        addedAt: Date.now(),
        status: 'waiting',
        mediaCount,
        result: null,
      };
      profileQueue.push(item);
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true, queue: profileQueue });
      // Nếu không có download đang chạy → start ngay
      if (!downloadInProgress) startNextInQueue();
      return true;
    }

    case 'REMOVE_FROM_QUEUE': {
      const { id } = payload;
      profileQueue = profileQueue.filter(q => q.id !== id);
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true });
      return false;
    }

    case 'GET_QUEUE': {
      sendResponse({ queue: profileQueue });
      return true;
    }

    case 'CLEAR_QUEUE': {
      // Chỉ xóa các item chưa chạy (waiting) — không hủy item đang 'downloading'
      profileQueue = profileQueue.filter(q => q.status === 'downloading');
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true });
      return false;
    }

    case 'START_QUEUE': {
      if (!downloadInProgress) startNextInQueue();
      sendResponse({ ok: true });
      return false;
    }

    case 'GET_DOWNLOAD_STATE': {
      // BUG-8 FIX: Popup query trạng thái download khi mở lại
      sendResponse({ isDownloading: downloadInProgress });
      return true;
    }

    // v4.3.0: Đếm media theo filter type + date range (cho popup preview)
    case 'GET_MEDIA_COUNT_FILTERED': {
      const { username, filterType, dateFrom, dateTo } = payload;
      const store = mediaStore.get(username);
      if (!store) { sendResponse({ count: 0 }); return true; }

      let items = Array.from(store.values());

      // Filter theo type
      if (filterType && filterType !== 'all') {
        if (filterType === 'images') items = items.filter(i => i.type === 'image');
        else if (filterType === 'videos') items = items.filter(i => i.type === 'video' || i.type === 'hls');
        else if (filterType === 'gifs') items = items.filter(i => i.type === 'gif');
      }

      // Filter theo date range
      if (dateFrom || dateTo) {
        const from = dateFrom ? new Date(dateFrom).getTime() : 0;
        const to   = dateTo  ? new Date(dateTo + 'T23:59:59Z').getTime() : Infinity;
        items = items.filter(item => {
          const d = item.tweetDate || 0;
          return d >= from && d <= to;
        });
      }

      sendResponse({ count: items.length });
      return true;
    }

    // v4.1.0: Lấy danh sách đã tải của một username
    case 'GET_DOWNLOADED_COUNT': {
      const set = downloadedStore.get(payload.username);
      sendResponse({ count: set?.size || 0 });
      return true;
    }

    // v4.1.0: Xóa lịch sử đã tải của username
    case 'CLEAR_DOWNLOADED': {
      downloadedStore.delete(payload.username);
      chrome.storage.local.remove(`downloaded_${payload.username}`).catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    case 'EXPORT_CSV': {
      const csv = buildCSV(payload.username, payload.filterType);
      sendResponse({ csv });
      return true;
    }

    // ─── Mini Button: Download single tweet ──────────────────────────────────
    case 'DOWNLOAD_TWEET': {
      const { tweetId, username } = payload;
      const tabId = sender.tab?.id;
      if (!tweetId) { sendResponse({ error: 'No tweetId' }); return false; }

      // Thông báo loading ngay
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'TWEET_DOWNLOAD_RESULT',
          payload: { tweetId, state: 'loading' }
        }).catch(() => {});
      }

      // Xử lý async không giữ message channel
      handleDownloadTweet(tweetId, username, tabId);
      sendResponse({ ok: true });
      return false;
    }

    // ─── Session Restore ────────────────────────────────────────────────
    case 'GET_SAVED_SESSION': {
      (async () => {
        try {
          const stored = await chrome.storage.local.get('active_session_username');
          const username = stored.active_session_username;
          if (!username) { sendResponse({ session: null }); return; }

          const key = `session_${username}`;
          const data = await chrome.storage.local.get(key);
          sendResponse({ session: data[key] || null });
        } catch (_) {
          sendResponse({ session: null });
        }
      })();
      return true; // async
    }

    case 'RESTORE_SESSION': {
      const { username } = payload;
      (async () => {
        try {
          const key = `session_${username}`;
          const res = await chrome.storage.local.get(key);
          const session = res[key];

          if (!session) {
            sendResponse({ error: 'No session found' });
            return;
          }

          // v4.4.0: Load media items from IndexedDB
          const itemsArray = await getMediaItems(username);
          if (itemsArray && itemsArray.length > 0) {
            if (!mediaStore.has(username)) mediaStore.set(username, new Map());
            const store = mediaStore.get(username);
            itemsArray.forEach(item => {
              if (item?.url && !store.has(item.url)) store.set(item.url, item);
            });
          }

          if (!mediaStore.has(username)) mediaStore.set(username, new Map());
          const store = mediaStore.get(username);

          if (session.stats) statsStore.set(username, session.stats);

          updateBadge(username);
          broadcastToPopup('SESSION_RESTORED', {
            username,
            count: store.size,
            scrollCount: session.scrollCount || 0,
            stats: session.stats || {},
          });

          // Xóa session sau khi đã restore thành công
          await clearSession(username);

          sendResponse({ ok: true, count: store.size });
        } catch (err) {
          console.error('[SW] RESTORE_SESSION error:', err);
          sendResponse({ error: err.message });
        }
      })();
      return true; // async
    }

    case 'RESTORE_SESSION_CANCEL': {
      const { username } = payload;
      clearSession(username);
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});

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

// ─── Download — từng file, không ZIP ─────────────────────────────────────────
let activeErrors = []; // Mảng chứa chi tiết lỗi

// ─── Ensure Offscreen Document tồn tại ───────────────────────────────────────
async function ensureOffscreen() {
  try {
    if (chrome.runtime.getContexts) {
      const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (existing.length > 0) return;
    } else {
      const has = await chrome.offscreen.hasDocument();
      if (has) return;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Convert HLS stream to Blob for downloading',
    });
  } catch (err) {
    if (!err.message?.includes('single offscreen document')) {
      console.warn('[SW] Offscreen creation error:', err.message);
    }
  }
}

// ─── Download một item (module-level, tái dụng được) ─────────────────────────
async function downloadSingleItem(item, username, saveFolder, opts = {}) {
  const { flatUsername = false, filenameUsername = false } = opts;
  let filename = buildDownloadPath(saveFolder, username, item, flatUsername, filenameUsername);

  if (item.type === 'hls' || filename.endsWith('.m3u8')) {
    filename = filename.replace('.m3u8', '.ts').replace('.mp4', '.ts');
  }

  if (item.type === 'hls' || item.url?.includes('.m3u8') || filename.endsWith('.ts')) {
    await ensureOffscreen();
    const HLS_TIMEOUT = 5 * 60 * 1000;
    const res = await Promise.race([
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'DOWNLOAD_HLS',
          url: item.url,
          username,
          filename,
        }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res) return reject(new Error('No response from offscreen'));
          if (res.error) return reject(new Error(res.error));
          resolve(res);
        });
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('HLS download timeout (5 min)')), HLS_TIMEOUT)
      ),
    ]);
    await downloadFile(res.dataUrl, filename);
  } else {
    await downloadFile(item.url, filename);
  }

  return filename;
}

// ─── Tìm tất cả media của một tweet trong mediaStore ─────────────────────────
function findTweetMediaInStore(tweetId, username) {
  const results = [];
  const checkStore = (store) => {
    for (const item of store.values()) {
      if (item.tweetId === tweetId) results.push(item);
    }
  };

  if (username && mediaStore.has(username)) {
    checkStore(mediaStore.get(username));
  } else {
    // Tìm trong tất cả stores nếu không biết username
    mediaStore.forEach(checkStore);
  }
  return results;
}

// ─── Handler: Download single tweet từ Mini Button ───────────────────────────
async function handleDownloadTweet(tweetId, username, tabId) {
  const sendResult = (state, extra = {}) => {
    if (!tabId) return;
    chrome.tabs.sendMessage(tabId, {
      type: 'TWEET_DOWNLOAD_RESULT',
      payload: { tweetId, state, ...extra }
    }).catch(() => {});
  };

  try {
    let opts = {};
    try {
      const stored = await chrome.storage.sync.get('options');
      opts = stored.options || {};
    } catch (_) {}

    const saveFolder = sanitizeFolder(opts.saveFolder || '');

    // 1. Tìm trong mediaStore trước (nhanh, không cần API)
    let mediaItems = findTweetMediaInStore(tweetId, username);

    // 2. Không có trong store → thử API (video/GIF)
    if (!mediaItems.length) {
      try {
        const videoItem = await fetchVideoForTweet(tweetId, self.userCsrfToken);
        if (videoItem) {
          videoItem.username = username;
          mediaItems = [videoItem];
        }
      } catch (_) {}
    }

    // 3. Vẫn không có → thông báo lỗi
    if (!mediaItems.length) {
      sendResult('error', { message: 'No media found for this tweet' });
      return;
    }

    // 4. Download tất cả items của tweet (gallery có thể nhiều ảnh)
    let success = 0;
    let failed = 0;
    for (const item of mediaItems) {
      try {
        await downloadSingleItem(item, username || item.username || 'unknown', saveFolder, opts);
        success++;
      } catch (err) {
        console.warn('[SW] DOWNLOAD_TWEET item failed:', err.message);
        failed++;
      }
    }

    if (success > 0) {
      sendResult('done', { success, failed, total: mediaItems.length });
    } else {
      sendResult('error', { message: 'All downloads failed' });
    }

  } catch (err) {
    console.error('[SW] handleDownloadTweet error:', err);
    sendResult('error', { message: err.message });
  }
}

async function startDownload(username, options = {}) {
  if (downloadInProgress) return;

  const store = mediaStore.get(username);
  if (!store?.size) return;
  downloadInProgress = true;
  activeErrors = [];

  // BUG-2 FIX: Bật keep-alive để SW không bị Chrome terminate
  startKeepAlive();

  // Đọc options
  let opts = {};
  try {
    const stored = await chrome.storage.sync.get('options');
    opts = stored.options || {};
  } catch (_) {}

  // Lọc theo filter type
  let items = Array.from(store.values());
  if (options.filterType && options.filterType !== 'all') {
    if (options.filterType === 'images') items = items.filter(i => i.type === 'image');
    else if (options.filterType === 'videos') items = items.filter(i => i.type === 'video' || i.type === 'hls');
    else if (options.filterType === 'gifs') items = items.filter(i => i.type === 'gif');
  }

  // v4.3.0: Lọc theo Date Range
  const dateFrom = options.dateFrom ? new Date(options.dateFrom).getTime() : 0;
  const dateTo   = options.dateTo   ? new Date(options.dateTo + 'T23:59:59Z').getTime() : Infinity;
  if (options.dateFrom || options.dateTo) {
    const beforeDate = items.length;
    items = items.filter(item => {
      const d = item.tweetDate || 0;
      return d >= dateFrom && d <= dateTo;
    });
    const dateFiltered = beforeDate - items.length;
    if (dateFiltered > 0) console.log(`[SW] Date filter: ${dateFiltered} items ngoài khoảng ngày — bỏ qua`);
  }

  // v4.1.0: Duplicate Detection — load downloaded URLs rồi lọc ra
  await loadDownloadedUrls(username);
  const skipDuplicates = options.skipDuplicates !== false; // mặc định bật
  let skipped = 0;
  if (skipDuplicates) {
    const before = items.length;
    items = items.filter(item => !isAlreadyDownloaded(username, item.url));
    skipped = before - items.length;
    if (skipped > 0) console.log(`[SW] Duplicate skip: ${skipped} files đã tải trước — bỏ qua`);
  }

  if (!items.length) {
    downloadInProgress = false;
    stopKeepAlive();
    // Thông báo nếu tất cả đã được tải rồi
    if (skipped > 0) {
      broadcastToPopup('DOWNLOAD_DONE', { username, success: 0, failed: 0, total: 0, skipped });
      showDownloadNotification(username, 0, 0, 0, skipped);
    }
    return;
  }

  // Thư mục lưu: {saveFolder}/{username}/{subfolder}/
  const saveFolder = sanitizeFolder(opts.saveFolder || '');
  const CONCURRENCY = Math.min(Math.max(opts.concurrency || 3, 1), 5);
  const filenameUsername = opts.filenameUsername || false;

  const total = items.length;
  let success = 0;
  let failed = 0;

  broadcastToPopup('DOWNLOAD_STARTED', { username, total });
  // Snackbar: thông báo bắt đầu
  const snackEnabled = opts.showSnackbar !== false;
  if (snackEnabled) broadcastToTab(username, 'SNACKBAR_UPDATE', { type: 'DOWNLOAD_STARTED', username, total, skipped });

  // ─── Download một file — BUG-4 FIX: mỗi item tự quản lý timeout ─────────
  // Dùng module-level downloadSingleItem() — tránh code trùng lặp với DOWNLOAD_TWEET
  async function downloadOne(item) {
    let filename = '';
    try {
      filename = await downloadSingleItem(item, username, saveFolder, {
        flatUsername: opts.flatUsername,
        filenameUsername,
      });

      success++;
      // v4.1.0: Đánh dấu đã tải xong
      markDownloaded(username, item.url);
    } catch (err) {
      failed++;
      activeErrors.push(err.message);
      console.warn('[SW] Download failed:', item?.url, err.message);
    }

    broadcastToPopup('DOWNLOAD_PROGRESS', {
      username,
      current: success + failed,
      total,
      success,
      failed,
      errors: activeErrors,
      done: success + failed === total,
      percent: Math.round(((success + failed) / total) * 100),
      currentFile: filename.split('/').pop(),
    });
    // Snackbar: cập nhật progress realtime
    if (snackEnabled) broadcastToTab(username, 'SNACKBAR_UPDATE', {
      type: 'DOWNLOAD_PROGRESS',
      current: success + failed,
      total,
      success,
      failed,
      percent: Math.round(((success + failed) / total) * 100),
      currentFile: filename.split('/').pop(),
      done: success + failed === total,
    });
  }

  try {
    // BUG-4 FIX (corrected): Worker pool lazy — chỉ CONCURRENCY download chạy cùng lúc.
    // items.map() eager sẽ gọi chrome.downloads.download() cho TẤT CẢ item ngay lập tức
    // → phải dùng worker queue để download thực sự bị giới hạn đúng số CONCURRENCY.
    const queue = [...items]; // shallow copy để không mutate array gốc

    const runWorker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        // Mỗi item có timeout riêng ở cấp batch (ngoài timeout 90s của downloadOne)
        await Promise.race([
          downloadOne(item),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Batch timeout: ${item.url?.slice(-50)}`)),
              DOWNLOAD_TIMEOUT_MS + 15_000  // 90s + 15s buffer
            )
          ),
        ]).catch(err => {
          // Chỉ xử lý ở đây nếu downloadOne() không tự catch được (batch-level timeout)
          if (err.message?.startsWith('Batch timeout')) {
            failed++;
            activeErrors.push(err.message);
            console.warn('[SW] Batch-level timeout:', err.message);
            broadcastToPopup('DOWNLOAD_PROGRESS', {
              username, current: success + failed, total, success, failed,
              errors: activeErrors, done: success + failed === total,
              percent: Math.round(((success + failed) / total) * 100),
              currentFile: '',
            });
          }
          // Các lỗi khác đã được downloadOne() tự xử lý rồi → bỏ qua
        });
      }
    };

    // Khởi động đúng CONCURRENCY worker — mỗi worker xử lý tuần tự từ queue
    await Promise.all(Array.from({ length: CONCURRENCY }, () => runWorker()));

  } catch (err) {
    console.error('[SW] Critical download error:', err);
  } finally {
    downloadInProgress = false;
    stopKeepAlive(); // BUG-2 FIX: Tắt keep-alive khi xong
    broadcastToPopup('DOWNLOAD_DONE', { username, success, failed, total, skipped });
    // v4.1.0: Hiện system notification
    showDownloadNotification(username, success, failed, total, skipped);
    // Snackbar: thông báo hoàn thành
    if (snackEnabled) broadcastToTab(username, 'SNACKBAR_UPDATE', { type: 'DOWNLOAD_DONE', username, success, failed, total, skipped });

    // FAB FIX: Thông báo FAB trong tab để reset isDownloading flag
    tabState.forEach((state, tabId) => {
      if (state.username === username) {
        chrome.tabs.sendMessage(tabId, {
          type: 'FAB_UPDATE',
          payload: { state: 'DOWNLOAD_DONE' }
        }).catch(() => {});
      }
    });

    // v4.2.0: Cập nhật queue item result nếu download từ queue
    if (options._fromQueue && options._queueId) {
      const qItem = profileQueue.find(q => q.id === options._queueId);
      if (qItem) {
        qItem.status = failed === total && total > 0 ? 'error' : 'done';
        qItem.result = { success, failed, total, skipped };
        persistQueue();
        broadcastQueueUpdate();
      }
    }

    // v4.2.0: Chạy profile tiếp theo trong queue
    setTimeout(() => startNextInQueue(), 500);
  }
}

// ─── IDM Conflict Detection ───────────────────────────────────────────────────
// IDM Integration Module hijacks chrome.downloads bằng cách cancel download ngay lập tức
// rồi tự tải file theo cách riêng — bỏ qua hoàn toàn `filename` param của chúng ta.
// Ta detect IDM hijack khi: interrupted trong vòng 2s + error là USER_CANCELED hoặc rỗng.
let _idmDetected = false;

function isIdmHijack(downloadId, startTime, error) {
  const elapsed = Date.now() - startTime;
  const isQuickCancel = elapsed < 2000;
  const isUserCancel  = !error || error === 'USER_CANCELED';
  return isQuickCancel && isUserCancel;
}

function maybeWarnIdm() {
  if (_idmDetected) return;
  _idmDetected = true;
  console.warn('[SW] ⚠️ IDM Integration Module detected! Files will be saved by IDM, not in the username folder.');
  broadcastToPopup('IDM_DETECTED', {});
}

// ─── chrome.downloads.download() wrapper ─────────────────────────────────────
// BUG-1 FIX: Thêm timeout 90s — Promise không bao giờ treo vĩnh viễn
// BUG-7 FIX: Guard chống double-resolve bằng `settled` flag
// IDM FIX: Detect IDM hijack → resolve thay vì reject để không báo lỗi sai
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const startTime = Date.now();

    // Timeout 90 giây
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Download timeout (90s): ${filename.split('/').pop()}`));
    }, DOWNLOAD_TIMEOUT_MS);

    function safeResolve(val) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    }

    function safeReject(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    }

    chrome.downloads.download(
      { url, filename, conflictAction: 'uniquify', saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          safeReject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!downloadId) {
          safeReject(new Error('No downloadId returned'));
          return;
        }

        // Theo dõi completion qua onChanged
        activeDownloads.set(downloadId, {
          resolve: safeResolve,
          reject: safeReject,
          startTime,
          filename: filename.split('/').pop(), // v4.4.0
          bytesReceived: 0,
          totalBytes: 0,
        });

        // BUG-7 FIX: Race condition check — nếu download đã xong trước khi addListener kịp
        chrome.downloads.search({ id: downloadId }, (results) => {
          if (!activeDownloads.has(downloadId)) return; // Đã được xử lý bởi onChanged
          if (results?.length > 0) {
            const state = results[0].state;
            if (state === 'complete') {
              activeDownloads.delete(downloadId);
              safeResolve(downloadId);
            } else if (state === 'interrupted') {
              activeDownloads.delete(downloadId);
              const err = results[0].error || '';
              // IDM FIX: IDM hijack → coi như thành công
              if (isIdmHijack(downloadId, startTime, err)) {
                maybeWarnIdm();
                safeResolve(downloadId);
              } else {
                safeReject(new Error(err || 'Download interrupted'));
              }
            }
          }
        });
      }
    );
  });
}

// ─── Build Download Path ─────────────────────────────────────────────────────────
function buildDownloadPath(saveFolder, username, item, flatUsername = false, filenameUsername = false) {
  const subfolder = item.type === 'image' ? 'images'
    : item.type === 'gif' ? 'gifs'
    : 'videos';

  const filename = buildFilename(item, username, filenameUsername);

  // Cấu trúc: {saveFolder?}/{username}/{subfolder?}/{filename}
  const parts = [saveFolder, username];
  if (!flatUsername) {
    parts.push(subfolder);
  }
  parts.push(filename);
  
  return parts.filter(Boolean).join('/');
}

// S4: Sanitize tên file — loại bỏ ký tự không hợp lệ trên Windows/macOS
function sanitizeFilenameStr(name) {
  if (!name) return 'file';
  return name
    .replace(/[\x00-\x1f\x7f]/g, '')      // control chars
    .replace(/[<>:"/\\|?*]/g, '_')         // Windows invalid chars
    .replace(/^[\s.]+|[\s.]+$/g, '')       // leading/trailing dots & spaces
    .slice(0, 200)
    || 'file';
}

function buildFilename(item, username = '', filenameUsername = false) {
  const base = item.tweetId || item.mediaKey || `media_${Date.now()}`;
  const rand = Math.random().toString(36).slice(2, 7);
  // S4: Sanitize tất cả các thành phần trước khi ghép
  const safeName = sanitizeFilenameStr(filenameUsername && username
    ? `${username}_${base}_${rand}`
    : `${base}_${rand}`);
  return `${safeName}.${item.ext || 'jpg'}`;
}

// Sanitize tên thư mục: chỉ giữ ký tự hợp lệ cho đường dẫn
function sanitizeFolder(folder) {
  return folder
    .replace(/[<>:"|?*\\]/g, '_') // ký tự không hợp lệ trên Windows
    .replace(/^\/+|\/+$/g, '')    // bỏ slash đầu/cuối
    .trim();
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function buildCSV(username, filterType = 'all') {
  const store = mediaStore.get(username);
  if (!store) return '';

  let items = Array.from(store.values());
  if (filterType === 'images') items = items.filter(i => i.type === 'image');
  else if (filterType === 'videos') items = items.filter(i => i.type === 'video' || i.type === 'hls');
  else if (filterType === 'gifs') items = items.filter(i => i.type === 'gif');

  const header = 'url,type,ext,tweetId,mediaKey,addedAt\n';
  const rows = items.map(item =>
    `"${item.url}","${item.type}","${item.ext || ''}","${item.tweetId || ''}","${item.mediaKey || ''}","${new Date(item.addedAt || 0).toISOString()}"`
  );
  return header + rows.join('\n');
}

// ─── FAB Helpers ──────────────────────────────────────────────────────────────
async function updateFAB(tabId, username, scrollCount) {
  if (!tabId) return;
  const count = mediaStore.get(username)?.size || 0;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FAB_UPDATE', payload: { count, scrollCount } });
  } catch (_) {}
}

async function broadcastFABState(tabId, state) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'FAB_UPDATE', payload: { state } });
  } catch (_) {}
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function updateBadge(username) {
  const total = mediaStore.get(username)?.size || 0;
  chrome.action.setBadgeText({ text: total > 9999 ? '9999+' : String(total) });
  chrome.action.setBadgeBackgroundColor({ color: '#1D9BF0' });
}

// BUG-9 FIX: Không log lỗi khi popup đóng (expected behavior)
function broadcastToPopup(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch((_err) => {
    // Popup đóng = expected. Chỉ log nếu lỗi bất thường.
    // if (_err?.message && !_err.message.includes('Receiving end does not exist')) {
    //   console.warn('[SW] broadcastToPopup error:', _err.message);
    // }
  });
}

// Gửi message về tab đang active của username (dùng cho Snackbar)
// BUG-E FIX: Ưu tiên tab đang collecting; nếu không có thì gửi tab cuối cùng
// Tránh gửi đến TẤT CẢ tab cùng username khi mở nhiều tab → nhiều snackbar
function broadcastToTab(username, type, payload) {
  let targetTabId = null;
  // Ưu tiên tab đang actively collecting
  tabState.forEach((state, tabId) => {
    if (state.username === username && state.isCollecting) {
      targetTabId = tabId;
    }
  });
  // Fallback: tab cuối cùng khớp username
  if (!targetTabId) {
    tabState.forEach((state, tabId) => {
      if (state.username === username) {
        targetTabId = tabId;
      }
    });
  }
  if (targetTabId) {
    chrome.tabs.sendMessage(targetTabId, { type, payload }).catch(() => {});
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 10000);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[X Media Downloader] v4.3.0 — Date Range Filter + Multi-Profile Queue + Popup v2');
});

