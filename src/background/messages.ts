import { mediaStore, statsStore, tabState, downloadedStore, downloadState, pendingHlsRequests, setCsrfToken } from './state.ts';
import { addMediaItems, ensureMediaStoreLoaded, applyOptionsFilter, checkAutoScroll, startCollecting, stopCollecting, clearSession, fetchVideoForTweetWithRefresh } from './scraper.ts';
import { startDownload, handleDownloadTweet, buildCSV, retryLastDownload, stopDownload } from './downloader.ts';
import { profileQueue, setProfileQueue, persistQueue, startNextInQueue, broadcastQueueUpdate, exportQueue, importQueue } from './queue.ts';
import { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';
import { getMediaItems } from './indexeddb.ts';
import { setDynamicBearer, setDynamicQueryId } from './tweet-api.ts';
import { startFollowingScroll, stopFollowingScroll, getFollowingScrollState } from './following-scroll.ts';

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

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
      const { username, mediaItems } = payload;
      if (!username || !mediaItems?.length) return false;
      const tabId = sender.tab?.id;

      console.log(`[SW] MEDIA_FOUND: ${mediaItems.length} items từ ${payload.sourceUrl || '?'} cho @${username}`);

      // BUG-D FIX: Dùng Promise.all thay vì forEach async để quản lý đúng
      Promise.all((mediaItems as any[]).map(async (item) => {
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
              videoItem.url = videoItem.url.replace(/name=\w+/, 'name=orig');
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
      })).catch((err: any) => console.debug('[SW] MEDIA_FOUND handler error:', err.message));
      return false;
    }

    case 'PAGE_LOADED': {
      const { username, url, isMediaPage, ct0 } = payload;
      const tabId = sender.tab?.id;
      if (tabId && username) {
        const existingState = tabState.get(tabId);
        const wasCollecting = existingState?.isCollecting ?? false;
        const isCollecting = wasCollecting && isMediaPage;

        tabState.set(tabId, {
          username,
          url,
          isMediaPage,
          isCollecting,
          scrollCount: isCollecting ? (existingState?.scrollCount ?? 0) : 0,
          reachedEnd: false,
          ct0: ct0 || existingState?.ct0,
        });

        if (ct0) {
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
      (async () => {
        const store = await ensureMediaStoreLoaded(payload.username);
        sendResponse({ count: store?.size || 0 });
      })();
      return true;
    }

    case 'GET_STATS': {
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

    // v4.3.0: Đếm media theo filter type + date range (cho popup preview)
    case 'GET_MEDIA_COUNT_FILTERED': {
      (async () => {
        const { username, filterType, dateFrom, dateTo, keyword } = payload;
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
      (async () => {
        await ensureMediaStoreLoaded(payload.username);
        // PERF-04: buildCSV trả { csv, total, exported, truncated, nextOffset }
        const result = buildCSV(payload.username, payload.filterType, payload.offset || 0);
        sendResponse(result);
      })();
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
      const { bearer } = payload;
      if (bearer?.startsWith('Bearer ')) setDynamicBearer(bearer);
      return false;
    }

    // Dynamic Query ID: nhận query hash mới nhất từ page-interceptor
    case 'UPDATE_QUERY_ID': {
      const { queryId, opName } = payload;
      if (queryId && opName) setDynamicQueryId(queryId, opName);
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
        const parsed = JSON.parse(payload.data as string) as { queue?: unknown[] };
        if (!Array.isArray(parsed.queue)) {
          sendResponse({ error: 'Invalid queue file: missing queue array' });
          return true;
        }
        const result = importQueue(parsed.queue as any[]);
        sendResponse({ ok: true, ...result });
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
      if (!targetUrl || typeof targetUrl !== 'string') {
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

    default:
      return false;
  }
});

