import { mediaStore, statsStore, tabState, downloadedStore, downloadState, pendingHlsRequests, setCsrfToken, dirtyMediaStore } from './state.ts';
import { addMediaItems, ensureMediaStoreLoaded, applyOptionsFilter, checkAutoScroll, startCollecting, stopCollecting, clearSession, fetchVideoForTweetWithRefresh, loadDownloadedUrls } from './scraper.ts';
import { startDownload, handleDownloadTweet, buildCSV, retryLastDownload, stopDownload } from './downloader.ts';
import { profileQueue, setProfileQueue, persistQueue, startNextInQueue, broadcastQueueUpdate, exportQueue, importQueue } from './queue.ts';
import { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';
import { getMediaItems, clearDownloadedUrls, clearAllDownloadedUrls } from './indexeddb.ts';
import { setDynamicBearer, setDynamicQueryId } from './tweet-api.ts';
import { startFollowingScroll, stopFollowingScroll, getFollowingScrollState } from './following-scroll.ts';
import { isValidDownloadOptions, isValidMediaItem, isValidUsername, isXProfileUrlForUsername, isXUrl, normalizeMediaUrlToOrig } from '../shared/validation.ts';
import { parseExtensionMessage } from '../shared/messages.ts';
import { clearLocalDiagnostics, exportLocalDiagnostics, recordDiagnostic } from './diagnostics.ts';
import { isTelegramWebUrl } from '../shared/telegram-media.ts';

const MAX_MEDIA_BATCH = 200;
const MEDIA_PROCESS_CONCURRENCY = 4;
const PICKER_ITEM_LIMIT = 200; // Pha 9: Interactive Download Picker — cap số item trả về để hiển thị
const ALLOWED_DIAGNOSTIC_METRICS = new Set(['scan.duration_ms', 'observer.callback']);
const QUEUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

async function runWithConcurrency<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

function isInternalSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id;
}

function isMatchingXTab(sender: chrome.runtime.MessageSender, username: unknown): boolean {
  return Boolean(sender.tab?.id && isXProfileUrlForUsername(sender.tab.url, username));
}

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages from page/main world are never trusted. Only this extension may use
  // the internal command channel and every payload is validated again per action.
  const parsedMessage = parseExtensionMessage(message);
  if (!isInternalSender(sender) || !parsedMessage) {
    sendResponse({ error: 'Invalid message' });
    return false;
  }
  const { type, payload } = parsedMessage;

  // P3: Offscreen báo kết quả HLS xong
  if (type === 'HLS_DONE') {
    const pending = pendingHlsRequests.get(message.requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingHlsRequests.delete(message.requestId);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve({ dataUrl: message.dataUrl });
    }
    return false;
  }

  switch (type) {

    case 'MEDIA_FOUND': {
      const { username, mediaItems } = payload || {};
      if (!isMatchingXTab(sender, username) || !Array.isArray(mediaItems) || mediaItems.length === 0 || mediaItems.length > MAX_MEDIA_BATCH) return false;
      const validItems = mediaItems.filter(isValidMediaItem);
      if (validItems.length === 0) return false;
      void recordDiagnostic('media.received', mediaItems.length);
      if (validItems.length !== mediaItems.length) void recordDiagnostic('media.rejected', mediaItems.length - validItems.length);
      const tabId = sender.tab?.id;

      console.log(`[SW] MEDIA_FOUND: ${validItems.length} items cho @${username}`);

      // Bound work so a timeline batch cannot start dozens of GraphQL video
      // lookups at once. This keeps the extension responsive and reduces 429s.
      runWithConcurrency(validItems, MEDIA_PROCESS_CONCURRENCY, async (item) => {
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
            const videoItem = await fetchVideoForTweetWithRefresh(item.tweetId, tabId);

            if (videoItem) {
              videoItem.url = normalizeMediaUrlToOrig(videoItem.url);
              (videoItem as any).username = username;
              const added = addMediaItems(username, [videoItem as any]);
              if (added > 0) updateFAB(tabId, username);
            } else {
              console.warn(`[SW] ✗ Không lấy được video URL cho tweet ${item.tweetId}`);
            }
          } catch (err: any) {
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
      }).catch((err: any) => console.debug('[SW] MEDIA_FOUND handler error:', err.message));
      return false;
    }

    case 'PAGE_LOADED': {
      const { username, ct0 } = payload || {};
      const tabUrl = sender.tab?.url;
      if (!isMatchingXTab(sender, username) || !isXUrl(tabUrl)) return false;
      const isMediaPage = /\/(media|photos|videos|likes|bookmarks)(?:\/|$)/.test(new URL(tabUrl).pathname);
      const tabId = sender.tab?.id;
      if (tabId && username) {
        const existingState = tabState.get(tabId);
        const wasCollecting = existingState?.isCollecting ?? false;
        const isCollecting = wasCollecting && isMediaPage;

        tabState.set(tabId, {
          username,
          url: tabUrl,
          isMediaPage,
          isCollecting,
          scrollCount: isCollecting ? (existingState?.scrollCount ?? 0) : 0,
          reachedEnd: false,
          ct0: typeof ct0 === 'string' && ct0.length <= 512 ? ct0 : existingState?.ct0,
          phase: isCollecting ? (existingState?.phase ?? 'collecting') : 'stopped',
        });

        if (typeof ct0 === 'string' && ct0.length <= 512) {
          // SEC-02 FIX: Dùng setCsrfToken() từ state.ts thay vì gán thẳng lên self
          setCsrfToken(ct0);
        }

        if (isCollecting) {
          chrome.tabs.sendMessage(tabId, { type: 'COLLECT_STARTED_LOCAL' }).catch(() => {});
        } else if (!isCollecting && wasCollecting) {
          stopCollecting(existingState?.username || username);
        }
      }
      checkAutoScroll(tabId, username, isMediaPage);
      return false;
    }

    case 'GET_MEDIA_COUNT': {
      if (!isValidUsername(payload?.username)) { sendResponse({ error: 'Invalid username' }); return false; }
      (async () => {
        const store = await ensureMediaStoreLoaded(payload.username);
        sendResponse({ count: store?.size || 0 });
      })();
      return true;
    }

    case 'GET_STATS': {
      if (!isValidUsername(payload?.username)) { sendResponse({ error: 'Invalid username' }); return false; }
      (async () => {
        await ensureMediaStoreLoaded(payload.username);
        sendResponse({ stats: statsStore.get(payload.username) || { image: 0, video: 0, gif: 0, hls: 0 } });
      })();
      return true;
    }

    case 'GET_ALL_USERNAMES': {
      const usernames: { username: string; count: number; stats: ReturnType<typeof statsStore.get> }[] = [];
      mediaStore.forEach((store, username) => {
        usernames.push({ username, count: store.size, stats: statsStore.get(username) });
      });
      sendResponse({ usernames });
      return true;
    }

    case 'GET_TAB_STATE': {
      if (!isValidUsername(payload?.username)) { sendResponse({ error: 'Invalid username' }); return false; }
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

    case 'START_COLLECTING': {
      if (!isValidUsername(payload?.username) || (sender.tab && !isMatchingXTab(sender, payload.username))) { sendResponse({ error: 'Invalid username or tab' }); return false; }
      startCollecting(payload.username, sender.tab?.id);
      sendResponse({ ok: true });
      return true;
    }

    case 'STOP_COLLECTING': {
      if (!isValidUsername(payload?.username) || (sender.tab && !isMatchingXTab(sender, payload.username))) { sendResponse({ error: 'Invalid username or tab' }); return false; }
      stopCollecting(payload.username);
      sendResponse({ ok: true });
      return true;
    }

    case 'START_DOWNLOAD': {
      const { username, options } = payload || {};
      if (!isValidUsername(username) || (sender.tab && !isMatchingXTab(sender, username)) || !isValidDownloadOptions(options)) {
        sendResponse({ error: 'Invalid download request' }); return false;
      }
      if (downloadState.inProgress) {
        sendResponse({ error: 'Download is already running' });
        return false;
      }
      startDownload(username, options);
      sendResponse({ ok: true });
      return true;
    }

    // ─── v5.0.3: Multi-Profile Queue ────────────────────────────────────────
    case 'ADD_TO_QUEUE': {
      const { username, filterType, skipDuplicates } = payload || {};
      if (!isValidUsername(username) || !['all', 'images', 'videos', 'gifs'].includes(String(filterType || 'all'))) { sendResponse({ error: 'Invalid queue item' }); return false; }
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
// @ts-ignore
      profileQueue.push(item);
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true, queue: profileQueue });
      // KHÔNG auto-start — user phải bấm "Start" trong Queue tab để bắt đầu
      return true;
    }

    case 'REMOVE_FROM_QUEUE': {
      const { id } = payload;
      if (typeof id !== 'string' || !QUEUE_ID_PATTERN.test(id)) { sendResponse({ error: 'Invalid queue id' }); return false; }
      setProfileQueue(profileQueue.filter(q => q.id !== id));
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
      setProfileQueue(profileQueue.filter(q => q.status === 'downloading'));
      persistQueue();
      broadcastQueueUpdate();
      sendResponse({ ok: true });
      return false;
    }

    case 'START_QUEUE': {
      if (!downloadState.inProgress) startNextInQueue();
      sendResponse({ ok: true });
      return false;
    }

    case 'GET_DOWNLOAD_STATE': {
      // BUG-8 FIX: Popup query trạng thái download khi mở lại
// @ts-ignore
      sendResponse({ isDownloading: downloadState.inProgress });
      return true;
    }

    case 'DIAGNOSTIC_METRIC': {
      const { name, value } = payload || {};
      if (sender.tab?.id && isXUrl(sender.tab.url) && ALLOWED_DIAGNOSTIC_METRICS.has(name) && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60_000) {
        void recordDiagnostic(name, value);
      }
      return false;
    }

    case 'EXPORT_LOCAL_DIAGNOSTICS': {
      exportLocalDiagnostics().then((diagnostics) => sendResponse({ diagnostics }));
      return true;
    }

    case 'CLEAR_LOCAL_DIAGNOSTICS': {
      clearLocalDiagnostics().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }

    // v4.3.0: Đếm media theo filter type + date range (cho popup preview)
    case 'GET_MEDIA_COUNT_FILTERED': {
      (async () => {
        const { username, filterType, dateFrom, dateTo, keyword } = payload;
        if (!isValidUsername(username) || (filterType !== undefined && !['all', 'images', 'videos', 'gifs'].includes(filterType)) ||
          (dateFrom !== undefined && (typeof dateFrom !== 'string' || dateFrom.length > 32)) ||
          (dateTo !== undefined && (typeof dateTo !== 'string' || dateTo.length > 32)) ||
          (keyword !== undefined && (typeof keyword !== 'string' || keyword.length > 1_000))) {
          sendResponse({ error: 'Invalid media filter' }); return;
        }
        const store = await ensureMediaStoreLoaded(username);
        if (!store) { sendResponse({ count: 0 }); return; }

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
        // v4.8.0: Filter theo keyword
        if (keyword && keyword.trim()) {
          const kw = keyword.toLowerCase().trim();
          items = items.filter(item => (item.tweetText || '').toLowerCase().includes(kw));
        }

        sendResponse({ count: items.length });
      })();
      return true;
    }

    // Pha 9: Interactive Download Picker — trả về item thật (cap PICKER_ITEM_LIMIT) để hiển thị thumbnail
    case 'GET_MEDIA_ITEMS_FILTERED': {
      (async () => {
        const { username, filterType, dateFrom, dateTo, keyword } = payload;
        if (!isValidUsername(username) || (filterType !== undefined && !['all', 'images', 'videos', 'gifs'].includes(filterType)) ||
          (dateFrom !== undefined && (typeof dateFrom !== 'string' || dateFrom.length > 32)) ||
          (dateTo !== undefined && (typeof dateTo !== 'string' || dateTo.length > 32)) ||
          (keyword !== undefined && (typeof keyword !== 'string' || keyword.length > 1_000))) {
          sendResponse({ error: 'Invalid media filter' }); return;
        }
        const store = await ensureMediaStoreLoaded(username);
        if (!store) { sendResponse({ items: [], total: 0, truncated: false }); return; }

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
        // Filter theo keyword
        if (keyword && keyword.trim()) {
          const kw = keyword.toLowerCase().trim();
          items = items.filter(item => (item.tweetText || '').toLowerCase().includes(kw));
        }

        const total = items.length;
        const truncated = total > PICKER_ITEM_LIMIT;
        sendResponse({ items: items.slice(0, PICKER_ITEM_LIMIT), total, truncated });
      })();
      return true;
    }

    // v4.1.0: Lấy số lượng file đã tải của username (gọi loadDownloadedUrls trước để chống cold SW)
    case 'GET_DOWNLOADED_COUNT': {
      (async () => {
        if (!isValidUsername(payload?.username)) { sendResponse({ error: 'Invalid username' }); return; }
        await loadDownloadedUrls(payload.username);
        const set = downloadedStore.get(payload.username);
        sendResponse({ count: set?.size || 0 });
      })();
      return true;
    }

    // v4.1.0: Xóa lịch sử đã tải của username
    case 'CLEAR_DOWNLOADED': {
      if (!isValidUsername(payload?.username)) { sendResponse({ error: 'Invalid username' }); return false; }
      downloadedStore.delete(payload.username);
      clearDownloadedUrls(payload.username).catch(() => {});
      chrome.storage.local.remove(`downloaded_${payload.username}`).catch(() => {}); // legacy cleanup
      sendResponse({ ok: true, count: 0 });
      return false;
    }

    // Xóa toàn bộ lịch sử đã tải của TẤT CẢ username
    case 'CLEAR_ALL_DOWNLOADED': {
      downloadedStore.clear();
      clearAllDownloadedUrls().catch(() => {});
      chrome.storage.local.get(null, (allData) => {
        const keysToRemove = Object.keys(allData || {}).filter(k => k.startsWith('downloaded_'));
        if (keysToRemove.length > 0) {
          chrome.storage.local.remove(keysToRemove).catch(() => {});
        }
      });
      sendResponse({ ok: true });
      return false;
    }

    // Xóa toàn bộ media đã thu thập và lịch sử tải của username
    case 'CLEAR_MEDIA': {
      const u = payload.username;
      if (!isValidUsername(u)) { sendResponse({ error: 'Invalid username' }); return false; }
      if (u) {
        mediaStore.delete(u);
        statsStore.delete(u);
        dirtyMediaStore.delete(u);
        clearSession(u).catch(() => {});
        downloadedStore.delete(u);
        clearDownloadedUrls(u).catch(() => {});
        chrome.storage.local.remove(`downloaded_${u}`).catch(() => {});
      }
      sendResponse({ ok: true });
      return false;
    }

    case 'EXPORT_CSV': {
      (async () => {
        if (!isValidUsername(payload?.username) || (payload.filterType !== undefined && !['all', 'images', 'videos', 'gifs'].includes(payload.filterType)) ||
          (payload.offset !== undefined && (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > 1_000_000))) {
          sendResponse({ error: 'Invalid CSV request' }); return;
        }
        await ensureMediaStoreLoaded(payload.username);
        // PERF-04: buildCSV trả { csv, total, exported, truncated, nextOffset }
        const result = buildCSV(payload.username, payload.filterType, payload.offset || 0);
        sendResponse(result);
      })();
      return true;
    }

    // ─── Mini Button: Download single tweet ──────────────────────────────────
    case 'DOWNLOAD_TWEET': {
      const { tweetId, username } = payload || {};
      const tabId = sender.tab?.id;
      if (!tabId || !isMatchingXTab(sender, username) || typeof tweetId !== 'string' || !/^\d{10,20}$/.test(tweetId)) { sendResponse({ error: 'Invalid tweet request' }); return false; }

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
      if (!isValidUsername(username)) { sendResponse({ error: 'Invalid username' }); return false; }
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
// @ts-ignore
          if (itemsArray && itemsArray.length > 0) {
            if (!mediaStore.has(username)) mediaStore.set(username, new Map());
            const store = mediaStore.get(username);
// @ts-ignore
            itemsArray.forEach(item => {
// @ts-ignore
              if (item?.url && !store.has(item.url)) store.set(item.url, item);
            });
          }

          if (!mediaStore.has(username)) mediaStore.set(username, new Map());
          const store = mediaStore.get(username);

// @ts-ignore
          if (session.stats) statsStore.set(username, session.stats);

          updateBadge(username);
          broadcastToPopup('SESSION_RESTORED', {
            username,
// @ts-ignore
            count: store.size,
// @ts-ignore
            scrollCount: session.scrollCount || 0,
// @ts-ignore
            stats: session.stats || {},
          });

          // Xóa session sau khi đã restore thành công
          await clearSession(username);

// @ts-ignore
          sendResponse({ ok: true, count: store.size });
        } catch (err) {
          console.error('[SW] RESTORE_SESSION error:', err);
// @ts-ignore
          sendResponse({ error: err.message });
        }
      })();
      return true; // async
    }

    case 'RESTORE_SESSION_CANCEL': {
      const { username } = payload;
      if (!isValidUsername(username)) { sendResponse({ error: 'Invalid username' }); return false; }
      clearSession(username);
      sendResponse({ ok: true });
      return false;
    }

    // Bug 2: Dừng download đang chạy
    case 'STOP_DOWNLOAD': {
      const stopped = stopDownload();
      sendResponse({ ok: stopped });
      return false;
    }

    // UI-01: Retry — chạy lại download cuối cùng (skipDuplicates tự bỏ qua file đã tải)
    case 'RETRY_FAILED': {
      const ok = retryLastDownload();
      sendResponse({ ok });
      return false;
    }

    // SEC-04: Nhận bearer token được capture từ page-interceptor
    case 'UPDATE_BEARER': {
      const { bearer } = payload || {};
      if (sender.tab?.id && isXUrl(sender.tab.url) && typeof bearer === 'string' && /^Bearer [A-Za-z0-9._~+/=-]{20,4096}$/.test(bearer)) setDynamicBearer(bearer);
      return false;
    }

    // Dynamic Query ID: nhận query hash mới nhất từ page-interceptor
    case 'UPDATE_QUERY_ID': {
      const { queryId, opName } = payload || {};
      if (sender.tab?.id && isXUrl(sender.tab.url) && typeof queryId === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(queryId) && typeof opName === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(opName)) setDynamicQueryId(queryId, opName);
      return false;
    }

    // FEA-02: Export queue ra JSON để transfer / backup
    case 'EXPORT_QUEUE': {
      const data = exportQueue();
      sendResponse({ ok: true, data });
      return true;
    }

    // FEA-02: Import queue từ JSON file
    case 'IMPORT_QUEUE': {
      try {
        if (typeof payload?.data !== 'string' || payload.data.length > 200_000) {
          sendResponse({ error: 'Invalid queue file' }); return false;
        }
        const parsed = JSON.parse(payload.data as string) as { queue?: unknown[] };
        if (!Array.isArray(parsed.queue)) {
          sendResponse({ error: 'Invalid queue file: missing queue array' });
          return true;
        }
        const result = importQueue(parsed.queue);
        if (result.error) sendResponse({ error: result.error });
        else sendResponse({ ok: true, ...result });
      } catch (err: any) {
        sendResponse({ error: `Parse error: ${err.message}` });
      }
      return true;
    }

    // v5.5.0: Shortcut download — tải ảnh từ bất kỳ trang web nào
    case 'SHORTCUT_DOWNLOAD': {
      const { url } = payload || {};
      if (!url || typeof url !== 'string') {
        sendResponse({ error: 'Missing URL' });
        return true;
      }
      try {
        // SEC-02 FIX: Validate URL scheme — chỉ cho phép các scheme an toàn
        const urlObj = new URL(url);
        const allowedSchemes = ['https:', 'http:', 'blob:', 'data:'];
        if (!allowedSchemes.includes(urlObj.protocol)) {
          console.warn(`[SW] SHORTCUT_DOWNLOAD blocked: URL scheme not allowed: ${urlObj.protocol}`);
          sendResponse({ error: `URL scheme not allowed: ${urlObj.protocol}` });
          return true;
        }
        // Giới hạn data: URL tối đa 50MB để tránh DoS
        if (urlObj.protocol === 'data:' && url.length > 50_000_000) {
          sendResponse({ error: 'data: URL too large (max 50MB)' });
          return true;
        }

        // Extract filename từ URL
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const rawFilename = pathParts[pathParts.length - 1] || 'image';
        // Sanitize filename — loại bỏ ký tự không hợp lệ
        const filename = rawFilename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200) || 'image';

        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: false,
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ ok: true, downloadId });
          }
        });
      } catch (err: any) {
        sendResponse({ error: err.message });
      }
      return true;
    }


    // ─── Feature 0: Following Scroll ─────────────────────────────────────────
    case 'START_FOLLOWING_SCROLL': {
      const { targetUrl } = payload || {};
      if (!isXUrl(targetUrl) || !new URL(targetUrl).pathname.endsWith('/following')) {
        sendResponse({ error: 'Missing targetUrl' });
        return true;
      }
      // Chạy async — không block message channel
      startFollowingScroll(targetUrl).catch((err: any) => {
        console.error('[SW] startFollowingScroll error:', err.message);
      });
      sendResponse({ ok: true });
      return true;
    }

    case 'STOP_FOLLOWING_SCROLL': {
      stopFollowingScroll();
      sendResponse({ ok: true });
      return false;
    }

    case 'GET_FOLLOWING_SCROLL_STATE': {
      sendResponse({ state: getFollowingScrollState() });
      return true;
    }

    // Pha 6: Telegram Web Download
    case 'TG_DOWNLOAD_MEDIA': {
      const { url, filename } = payload || {};
      if (!sender.tab?.id || !isTelegramWebUrl(sender.tab.url) || typeof url !== 'string' || typeof filename !== 'string') {
        sendResponse({ error: 'Missing url or filename' });
        return true;
      }
      const safeFilename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
      if (!safeFilename || url.length > 8_192) {
        sendResponse({ error: 'Invalid Telegram download request' });
        return false;
      }
      
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        world: 'MAIN',
        func: (downloadUrl: string, downloadFilename: string) => {
          try {
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = downloadFilename;
            // Stop propagation to prevent Telegram's SPA router from intercepting the click
            // and calling e.preventDefault() on same-origin URLs.
            a.addEventListener('click', (e) => e.stopPropagation());
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => a.remove(), 2000);
          } catch (e) {
            console.error('[ExtensionX] Main world download trigger failed', e);
          }
        },
        args: [url, safeFilename]
      }).then(() => {
        sendResponse({ ok: true });
      }).catch(err => {
        console.error('[SW] TG_DOWNLOAD_MEDIA executeScript error:', err);
        sendResponse({ error: err.message });
      });
      return true;
    }

    default:
      return false;
  }
});
