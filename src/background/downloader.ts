// @ts-nocheck

import { mediaStore, downloadedStore, tabState, downloadState, pendingHlsRequests, activeDownloads } from './state.ts';
import { broadcastToPopup, broadcastToTab, sanitizeFolder, broadcastFABState } from './utils.ts';
import { showDownloadNotification, fetchVideoForTweetWithRefresh } from './scraper.ts';
import { startNextInQueue, profileQueue, persistQueue, broadcastQueueUpdate } from './queue.ts';

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
    // P3: Gửi request với requestId, kết quả trả về qua HLS_DONE message (bất đồng bộ)
    const res = await new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const HLS_TIMEOUT = 5 * 60 * 1000;
      const timeoutId = setTimeout(() => {
        pendingHlsRequests.delete(requestId);
        reject(new Error('HLS download timeout (5 min)'));
      }, HLS_TIMEOUT);
      pendingHlsRequests.set(requestId, { resolve, reject, timeoutId });
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'DOWNLOAD_HLS',
        requestId,
        url: item.url,
        username,
        filename,
      }).catch((err) => {
        clearTimeout(timeoutId);
        pendingHlsRequests.delete(requestId);
        reject(err);
      });
    });
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
        const videoItem = await fetchVideoForTweetWithRefresh(tweetId, tabId);
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

  // v4.8.0: Lọc theo Keyword
  if (options.keyword && options.keyword.trim()) {
    const kw = options.keyword.toLowerCase().trim();
    const beforeKw = items.length;
    items = items.filter(item => (item.tweetText || '').toLowerCase().includes(kw));
    const kwFiltered = beforeKw - items.length;
    if (kwFiltered > 0) console.log(`[SW] Keyword filter: ${kwFiltered} items không chứa keyword — bỏ qua`);
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

export { startDownload, handleDownloadTweet, activeErrors, buildCSV };
