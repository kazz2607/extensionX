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

let offscreenCreating = null;
let downloadInProgress = false;

// ─── Download Tracker ─────────────────────────────────────────────────────────
// Map<downloadId, {resolve, reject, item}>
const activeDownloads = new Map();

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
        tabState.set(tabId, { username, url, isMediaPage, isCollecting: false, scrollCount: 0, reachedEnd: false, ct0 });
        if (ct0) {
          // Lưu ct0 global cho background API
          self.userCsrfToken = ct0;
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
      startDownload(username, options).then(() => {
        // startDownload handles its own broadcasting, we just acknowledge receipt
      });
      sendResponse({ ok: true });
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

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && !tab.url?.includes('/media')) {
    await chrome.tabs.update(tabId, { url: `https://x.com/${username}/media` });
    await waitForTabLoad(tabId);
    await sleep(3000);
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
    } catch (_) { break; }

    state.scrollCount++;
    tabState.set(tabId, state);

    const currentCount = mediaStore.get(username)?.size || 0;
    broadcastToPopup('SCROLL_PROGRESS', {
      username, scrollCount: state.scrollCount,
      mediaCount: currentCount, stats: statsStore.get(username) || {},
    });

    updateFAB(tabId, username, state.scrollCount);

    if (scrollResult?.reachedEnd) {
      noNewCount++;
      if (noNewCount >= 3) {
        state.reachedEnd = true;
        state.isCollecting = false;
        tabState.set(tabId, state);
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

  if (!items.length) { downloadInProgress = false; return; }

  // Thư mục lưu: {saveFolder}/{username}/{subfolder}/
  // saveFolder từ options (mặc định rỗng = thẳng vào Downloads)
  const saveFolder = sanitizeFolder(opts.saveFolder || '');
  const CONCURRENCY = Math.min(Math.max(opts.concurrency || 3, 1), 5);

  const total = items.length;
  let success = 0;
  let failed = 0;

  broadcastToPopup('DOWNLOAD_STARTED', { username, total });

  // ─── Download queue ──────────────────────────────────────────────────────
  async function downloadOne(item, options) {
    let filename = '';
    try {
      filename = buildDownloadPath(saveFolder, username, item, options.flatUsername);
      
      // Đảm bảo HLS lưu dưới dạng .ts thay vì .m3u8 hay .mp4 để đúng chuẩn MIME type
      if (item.type === 'hls' || filename.endsWith('.m3u8')) {
        filename = filename.replace('.m3u8', '.ts').replace('.mp4', '.ts');
      }

      if (item.type === 'hls' || item.url.includes('.m3u8') || filename.endsWith('.ts')) {
        await ensureOffscreen();
        const res = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'DOWNLOAD_HLS',
            url: item.url,
            username: username,
            filename: filename
          }, (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!res) return reject(new Error('No response from offscreen'));
            if (res.error) return reject(new Error(res.error));
            resolve(res);
          });
        });
        
        const { objectUrl } = res;

        try {
          await new Promise((resolve, reject) => {
            chrome.downloads.download({
              url: objectUrl,
              filename: filename,
              conflictAction: 'uniquify',
              saveAs: false
            }, (downloadId) => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              activeDownloads.set(downloadId, { resolve, reject });
              
              // Fix race condition
              chrome.downloads.search({ id: downloadId }, (results) => {
                if (results && results.length > 0) {
                  const state = results[0].state;
                  if (state === 'complete') {
                    activeDownloads.delete(downloadId);
                    resolve(downloadId);
                  } else if (state === 'interrupted') {
                    activeDownloads.delete(downloadId);
                    reject(new Error(results[0].error || 'Download interrupted'));
                  }
                }
              });
            });
          });
          success++;
        } finally {
          chrome.runtime.sendMessage({ target: 'offscreen', type: 'REVOKE_URL', url: objectUrl }).catch(()=>{});
        }
      } else if (item.type === 'video' || item.type === 'gif') {
        // Khôi phục DOWNLOAD_MP4 vì tải trực tiếp bằng chrome.downloads vẫn bị một số server Twitter chặn
        await ensureOffscreen();
        const res = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'DOWNLOAD_MP4',
            url: item.url,
            username: username,
            filename: filename
          }, (res) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!res) return reject(new Error('No response from offscreen'));
            if (res.error) return reject(new Error(res.error));
            resolve(res);
          });
        });
        
        const { objectUrl } = res;

        try {
          await new Promise((resolve, reject) => {
            chrome.downloads.download({
              url: objectUrl,
              filename: filename,
              conflictAction: 'uniquify',
              saveAs: false
            }, (downloadId) => {
              if (chrome.runtime.lastError) {
                return reject(new Error(chrome.runtime.lastError.message));
              }
              activeDownloads.set(downloadId, { resolve, reject });
              
              chrome.downloads.search({ id: downloadId }, (results) => {
                if (results && results.length > 0) {
                  const state = results[0].state;
                  if (state === 'complete') {
                    activeDownloads.delete(downloadId);
                    resolve(downloadId);
                  } else if (state === 'interrupted') {
                    activeDownloads.delete(downloadId);
                    reject(new Error(results[0].error || 'Download interrupted'));
                  }
                }
              });
            });
          });
          success++;
        } finally {
          chrome.runtime.sendMessage({ target: 'offscreen', type: 'REVOKE_URL', url: objectUrl }).catch(()=>{});
        }
      } else {
        // Chỉ ảnh (images) mới tải trực tiếp
        await downloadFile(item.url, filename);
        success++;
      }
    } catch (err) {
      failed++;
      activeErrors.push(err.message);
      console.warn('[SW] Download failed:', item.url, err.message);
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

  // Khởi tạo Offscreen nếu chưa có
  let creatingOffscreen = null;
  async function ensureOffscreen() {
    if (creatingOffscreen) {
      await creatingOffscreen;
      return;
    }
    
    // Fallback an toàn cho bản Chrome cũ không có getContexts
    if (!chrome.runtime.getContexts) {
      const hasOffscreen = await chrome.offscreen.hasDocument();
      if (hasOffscreen) return;
    } else {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      if (existingContexts.length > 0) return;
    }

    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Convert HLS stream to Blob for downloading',
    }).catch(err => {
      if (!err.message.includes('single offscreen document')) {
        console.warn('Offscreen creation error:', err);
      }
    });
    
    await creatingOffscreen;
    creatingOffscreen = null;
  }

  try {
    // Chạy CONCURRENCY items song song
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(item => downloadOne(item, opts)));
      if (i + CONCURRENCY < items.length) {
        await sleep(200);
      }
    }
  } catch (err) {
    console.error('[SW] Critical download error:', err);
  } finally {
    downloadInProgress = false;
    broadcastToPopup('DOWNLOAD_DONE', { username, success, failed, total });
  }
}

// ─── chrome.downloads.download() wrapper ─────────────────────────────────────
function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, conflictAction: 'uniquify', saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!downloadId) {
          reject(new Error('No downloadId returned'));
          return;
        }
        // Theo dõi completion qua onChanged
        activeDownloads.set(downloadId, { resolve, reject });

        // Fix race condition: check ngay lập tức lỡ như tải xong/lỗi trước khi kịp addListener
        chrome.downloads.search({ id: downloadId }, (results) => {
          if (results && results.length > 0) {
            const state = results[0].state;
            if (state === 'complete') {
              activeDownloads.delete(downloadId);
              resolve(downloadId);
            } else if (state === 'interrupted') {
              activeDownloads.delete(downloadId);
              reject(new Error(results[0].error || 'Download interrupted'));
            }
          }
        });

        // Loại bỏ timeout 60s
      }
    );
  });
}

// ─── Build Download Path ──────────────────────────────────────────────────────
function buildDownloadPath(saveFolder, username, item, flatUsername = false) {
  const subfolder = item.type === 'image' ? 'images'
    : item.type === 'gif' ? 'gifs'
    : 'videos';

  const filename = buildFilename(item);

  // Cấu trúc: {saveFolder?}/{username}/{subfolder?}/{filename}
  const parts = [saveFolder, username];
  if (!flatUsername) {
    parts.push(subfolder);
  }
  parts.push(filename);
  
  return parts.filter(Boolean).join('/');
}

function buildFilename(item) {
  const base = item.tweetId || item.mediaKey || `media_${Date.now()}`;
  const rand = Math.random().toString(36).slice(2, 7);
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

function broadcastToPopup(type, payload) {
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
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
