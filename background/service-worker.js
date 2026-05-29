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
      tracked.reject(new Error(delta.error?.current || 'Download interrupted'));
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
}

// ─── Download — từng file, không ZIP ─────────────────────────────────────────
let activeErrors = []; // Mảng chứa chi tiết lỗi

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

  // ─── BUG-5 FIX: ensureOffscreen không dùng biến global ───────────────────
  async function ensureOffscreen() {
    try {
      // Luôn kiểm tra trực tiếp — không phụ thuộc vào biến global sau SW restart
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
      // 'single offscreen document' = đã tồn tại, OK
      if (!err.message?.includes('single offscreen document')) {
        console.warn('[SW] Offscreen creation error:', err.message);
      }
    }
  }

  // ─── Download một file — BUG-4 FIX: mỗi item tự quản lý timeout ─────────
  async function downloadOne(item) {
    let filename = '';
    try {
      filename = buildDownloadPath(saveFolder, username, item, opts.flatUsername, filenameUsername);

      // HLS: lưu dưới dạng .ts
      if (item.type === 'hls' || filename.endsWith('.m3u8')) {
        filename = filename.replace('.m3u8', '.ts').replace('.mp4', '.ts');
      }

      if (item.type === 'hls' || item.url.includes('.m3u8') || filename.endsWith('.ts')) {
        await ensureOffscreen();

        const HLS_TIMEOUT = 5 * 60 * 1000; // 5 phút cho HLS
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
        // MP4, GIF, Image — tải trực tiếp
        await downloadFile(item.url, filename);
      }

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
    // BUG-4 FIX: Dùng asyncPool để các item chạy song song có giới hạn,
    // mỗi item được wrap với timeout riêng → 1 item fail/timeout không block item khác
    const allTasks = items.map(item =>
      Promise.race([
        downloadOne(item),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${item.url?.slice(-50)}`)), DOWNLOAD_TIMEOUT_MS + 10_000)
        ),
      ]).catch(err => {
        // Outer catch: timeout ở cấp batch — đảm bảo không bao giờ unhandled
        failed++;
        activeErrors.push(err.message);
        console.warn('[SW] Batch-level timeout:', err.message);
        broadcastToPopup('DOWNLOAD_PROGRESS', {
          username, current: success + failed, total, success, failed,
          errors: activeErrors, done: success + failed === total,
          percent: Math.round(((success + failed) / total) * 100),
          currentFile: '',
        });
      })
    );

    // Chạy với giới hạn concurrent
    const executing = new Set();
    for (const task of allTasks) {
      executing.add(task);
      task.finally(() => executing.delete(task));
      if (executing.size >= CONCURRENCY) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

  } catch (err) {
    console.error('[SW] Critical download error:', err);
  } finally {
    downloadInProgress = false;
    stopKeepAlive(); // BUG-2 FIX: Tắt keep-alive khi xong
    broadcastToPopup('DOWNLOAD_DONE', { username, success, failed, total });
  }
}

// ─── chrome.downloads.download() wrapper ─────────────────────────────────────
// BUG-1 FIX: Thêm timeout 90s — Promise không bao giờ treo vĩnh viễn
// BUG-7 FIX: Guard chống double-resolve bằng `settled` flag
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    let settled = false;

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
        activeDownloads.set(downloadId, { resolve: safeResolve, reject: safeReject });

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
              safeReject(new Error(results[0].error || 'Download interrupted'));
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
