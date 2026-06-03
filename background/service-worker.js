/**
 * service-worker.js — Background Service Worker (Phase 3)
 * Thay đổi chính:
 *   - Bỏ ZIP hoàn toàn
 *   - Dùng chrome.downloads.download() tải từng file
 *   - Lưu vào: {Downloads}/{saveFolder}/{username}/{images|videos|gifs}/
 *   - Download queue với giới hạn concurrent
 *   - Track progress qua chrome.downloads.onChanged
 */

import { fetchVideoForTweet } from './tweet-api.js';

// ─── State ────────────────────────────────────────────────────────────────────
const mediaStore = new Map();   // Map<username, Map<url, MediaItem>>
const tabState   = new Map();   // Map<tabId, CollectState>
const statsStore = new Map();   // Map<username, {image,video,gif,hls}>

let downloadInProgress = false;

// ─── Download Tracker ─────────────────────────────────────────────────────────
// Map<downloadId, {resolve, reject}>
const activeDownloads = new Map();

// ─── BUG-2 FIX: Keep-alive alarm để SW không bị Chrome terminate ───────────────
const KEEPALIVE_ALARM = 'sw-keepalive';
const DOWNLOAD_TIMEOUT_MS = 90_000; // BUG-1 FIX: 90 giây timeout mỗi file

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Ping nhẹ để giữ SW sống. Không làm gì thêm.
    console.log('[SW] keepalive ping');
  }
});

function startKeepAlive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // mỗi 24 giây
}

function stopKeepAlive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

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
  } else if (delta.bytesReceived) {
    // Report byte progress to popup
    chrome.runtime.sendMessage({
      type: 'MP4_PROGRESS',
      payload: { 
        id: delta.id, 
        bytesReceived: delta.bytesReceived.current 
      }
    }).catch(() => {});
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

      mediaItems.forEach(async (item) => {
        if (!item) return;

        if (item.type === 'video_placeholder') {
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
          applyOptionsFilter(username, [item]).then(filtered => {
            if (filtered.length > 0) {
              const added = addMediaItems(username, filtered);
              if (added > 0) updateFAB(tabId, username);
            }
          });
        }
      });
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

    case 'GET_DOWNLOAD_STATE': {
      // BUG-8 FIX: Popup query trạng thái download khi mở lại
      sendResponse({ isDownloading: downloadInProgress });
      return true;
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
          const data = await chrome.storage.local.get(key);
          const session = data[key];

          if (!session?.mediaItems?.length) {
            sendResponse({ error: 'No session data' });
            return;
          }

          // Nạp lại vào memory stores
          if (!mediaStore.has(username)) mediaStore.set(username, new Map());
          if (!statsStore.has(username)) statsStore.set(username, { image: 0, video: 0, gif: 0, hls: 0 });

          const store = mediaStore.get(username);
          session.mediaItems.forEach(item => {
            if (item?.url && !store.has(item.url)) store.set(item.url, item);
          });

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

// ─── Add Media Items ──────────────────────────────────────────────────────────
function addMediaItems(username, items) {
  if (!mediaStore.has(username)) mediaStore.set(username, new Map());
  if (!statsStore.has(username)) statsStore.set(username, { image: 0, video: 0, gif: 0, hls: 0 });

  const store = mediaStore.get(username);
  const stats = statsStore.get(username);
  let newCount = 0;

  items.forEach(item => {
    if (store.has(item.url)) return;
    store.set(item.url, { ...item, addedAt: Date.now() });
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
  if (tab && !tab.url?.includes('/media')) {
    await chrome.tabs.update(tabId, { url: `https://x.com/${username}/media` });
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
  const DELAY_MS = (opts.scrollDelay || 2) * 1000;
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
        type: 'SCROLL_DOWN', waitMs: Math.max(DELAY_MS, 2000),
      });
      if (scrollResult?.error === 'not_media_page') {
        stopCollecting(username);
        break;
      }
    } catch (_) { break; }

    state.scrollCount++;
    tabState.set(tabId, state);

    const currentCount = mediaStore.get(username)?.size || 0;
    broadcastToPopup('SCROLL_PROGRESS', {
      username, scrollCount: state.scrollCount,
      mediaCount: currentCount, stats: statsStore.get(username) || {},
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

    await sleep(DELAY_MS + Math.random() * (DELAY_MS * 0.4));
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

      // Lấy scrollCount từ tabState
      let scrollCount = 0;
      tabState.forEach(state => {
        if (state.username === username && state.scrollCount > scrollCount) {
          scrollCount = state.scrollCount;
        }
      });

      const sessionData = {
        username,
        profileUrl: `https://x.com/${username}/media`,
        mediaCount: store.size,
        scrollCount,
        savedAt: Date.now(),
        mediaItems: Array.from(store.values()),
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
    await chrome.storage.local.remove([`session_${username}`, 'active_session_username']);
    console.debug(`[SW] Session cleared: @${username}`);
  } catch (_) {}
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

  if (!items.length) {
    downloadInProgress = false;
    stopKeepAlive();
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
    broadcastToPopup('DOWNLOAD_DONE', { username, success, failed, total });

    // FAB FIX: Thông báo FAB trong tab để reset isDownloading flag
    tabState.forEach((state, tabId) => {
      if (state.username === username) {
        chrome.tabs.sendMessage(tabId, {
          type: 'FAB_UPDATE',
          payload: { state: 'DOWNLOAD_DONE' }
        }).catch(() => {});
      }
    });
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

function buildFilename(item, username = '', filenameUsername = false) {
  const base = item.tweetId || item.mediaKey || `media_${Date.now()}`;
  const rand = Math.random().toString(36).slice(2, 7);
  if (filenameUsername && username) {
    return `${username}_${base}_${rand}.${item.ext || 'jpg'}`;
  }
  return `${base}_${rand}.${item.ext || 'jpg'}`;
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
  console.log('[X Media Downloader] v3 — Direct download mode');
});
