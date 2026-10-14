import { mediaStore, statsStore, tabState, downloadedStore, downloadCoordinator, pendingHlsRequests, setCsrfToken, dirtyMediaStore } from './state.ts';
import { continueCollectOnPageLoad } from '../shared/collect-state.ts';
import { addMediaItems, cancelDownloadedPersist, ensureMediaStoreLoaded, applyOptionsFilter, checkAutoScroll, startCollecting, stopCollecting, clearSession, fetchVideoForTweetWithRefresh, loadDownloadedUrls } from './scraper.ts';
import { startDownload, handleDownloadTweet, saveOffscreenBlob } from './downloader.ts';
import { updateBadge, broadcastToPopup, updateFAB } from './utils.ts';
import { mediaRepository } from './indexeddb.ts';
import { setDynamicBearer, setDynamicQueryId } from './tweet-api.ts';
import { isTrustedMediaUrl, isValidDownloadOptions, isValidMediaItem, isValidUsername, isXProfileUrlForUsername, isXUrl, normalizeMediaUrlToOrig } from '../shared/validation.ts';
import { OFFSCREEN_DOCUMENT_PATH, type ParsedRuntimeMessage } from '../shared/messages.ts';
import { recordDiagnostic } from './diagnostics.ts';
import { isTelegramDownloadUrl, isTelegramWebUrl } from '../shared/telegram-media.ts';
import type { Stats, MediaItem } from '../types.ts';
import { collectMediaMatches, createMediaMatcher, type MediaQueryCriteria } from '../shared/media-query.ts';

const MAX_MEDIA_BATCH = 200;
const MEDIA_PROCESS_CONCURRENCY = 4;
const PICKER_ITEM_LIMIT = 200; // Pha 9: Interactive Download Picker — cap số item trả về để hiển thị
const ALLOWED_DIAGNOSTIC_METRICS = new Set(['scan.duration_ms', 'observer.callback']);

async function queryProfileMedia(username: string, criteria: MediaQueryCriteria, limit = Infinity): Promise<{ items: MediaItem[]; total: number }> {
  const cached = mediaStore.get(username);
  if (cached) return collectMediaMatches(cached.values(), criteria, limit);
  const matches = createMediaMatcher(criteria);
  const items: MediaItem[] = [];
  let total = 0;
  await mediaRepository.visitMediaItems(username, (item) => {
    if (!matches(item)) return;
    total++;
    if (items.length < limit) items.push(item);
  });
  return { items, total };
}

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

function isSafeDownloadPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 1_000) return false;
  if (value.startsWith('/') || /[\\:\u0000-\u001f]/.test(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isMatchingXTab(sender: chrome.runtime.MessageSender, username: unknown): boolean {
  return Boolean(sender.tab?.id && isXProfileUrlForUsername(sender.tab.url, username));
}

// Media/download/session handler. The boundary parser and sender validation live
// in messages.ts so domain handlers only ever receive a validated envelope.
export function handleMediaMessage(
  message: ParsedRuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  const { type, payload } = message;

  // P3: Offscreen báo kết quả HLS xong
  if (type === 'HLS_DONE') {
    if (typeof message.requestId !== 'string') return false;
    const pending = pendingHlsRequests.get(message.requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingHlsRequests.delete(message.requestId);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve({ dataUrl: message.dataUrl, downloadId: message.downloadId });
    }
    return false;
  }

  // Offscreen hands assembled HLS/ZIP blobs back because it cannot use chrome.downloads.
  if (message.type === 'OFFSCREEN_SAVE_BLOB') {
    const { url, filename, username } = message.payload;
    const fromOffscreen = !sender.tab && sender.url === chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    if (!fromOffscreen || typeof url !== 'string' || !isSafeDownloadPath(filename)) {
      sendResponse({ error: 'Invalid offscreen save request' });
      return false;
    }
    saveOffscreenBlob(url, filename, typeof username === 'string' ? username : '')
      .then((downloadId) => sendResponse({ downloadId }))
      .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Save failed' }));
    return true;
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

      // Direct media (images and video URLs from the interceptor) is filtered
      // and stored as one batch, so a 200-item batch costs one badge, popup,
      // persist and FAB update instead of one of each per item.
      const direct = validItems.filter((item) => item.type !== 'video_placeholder');
      const placeholders = validItems.filter((item) => item.type === 'video_placeholder' && item.tweetId && /^\d{10,}$/.test(item.tweetId));
      void (async () => {
        // Drop already-stored URLs first: the maxMedia cap slices the batch,
        // and known items must not take the slots of new ones.
        // Also de-duplicate within the batch (a tweet and its quote can carry
        // the same media) so duplicates cannot use up maxMedia slots either.
        const known = mediaStore.get(username);
        const fresh = [...new Map(direct.filter((item) => !known?.has(item.url)).map((item) => [item.url, item])).values()];
        if (fresh.length > 0) {
          fresh.forEach((item) => { item.username = username; });
          const filtered = await applyOptionsFilter(username, fresh);
          if (filtered.length > 0 && addMediaItems(username, filtered) > 0) updateFAB(tabId, username);
        }
        if (placeholders.length === 0) return;

        // One scan per batch (not per placeholder) for tweets whose real video
        // URL the interceptor already captured.
        const haveVideo = new Set([...(mediaStore.get(username)?.values() ?? [])]
          .filter((media) => media.tweetId && (media.type === 'video' || media.type === 'hls' || media.type === 'gif'))
          .map((media) => media.tweetId));
        const pending = [...new Set(placeholders.map((item) => item.tweetId!))].filter((tweetId) => !haveVideo.has(tweetId));

        // Bound work so a timeline batch cannot start dozens of GraphQL video
        // lookups at once. This keeps the extension responsive and reduces 429s.
        await runWithConcurrency(pending, MEDIA_PROCESS_CONCURRENCY, async (tweetId) => {
          try {
            const videoItem = await fetchVideoForTweetWithRefresh(tweetId, tabId);
            if (!videoItem) {
              console.warn(`[SW] ✗ Không lấy được video URL cho tweet ${tweetId}`);
              return;
            }
            videoItem.url = normalizeMediaUrlToOrig(videoItem.url);
            const videoMediaItem = videoItem as MediaItem;
            videoMediaItem.username = username;
            if (addMediaItems(username, [videoMediaItem]) > 0) updateFAB(tabId, username);
          } catch (err) {
            console.warn('[SW] fetchVideoForTweet lỗi:', tweetId, err instanceof Error ? err.message : String(err));
          }
        });
      })().catch((err: unknown) => console.debug('[SW] MEDIA_FOUND handler error:', err instanceof Error ? err.message : String(err)));
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
        const next = continueCollectOnPageLoad(existingState, username, isMediaPage);
        const { isCollecting } = next;

        tabState.set(tabId, {
          ...next,
          username,
          url: tabUrl,
          isMediaPage,
          reachedEnd: false,
          ct0: typeof ct0 === 'string' && ct0.length <= 512 ? ct0 : existingState?.ct0,
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
      const senderIsXTab = isXUrl(sender.tab?.url);
      if (!isValidUsername(payload?.username) || (senderIsXTab && !isMatchingXTab(sender, payload.username))) { sendResponse({ error: 'Invalid username or tab' }); return false; }
      void startCollecting(payload.username, senderIsXTab ? sender.tab?.id : undefined)
        .then((started) => sendResponse(started ? { ok: true } : { error: 'Không tìm thấy tab media phù hợp hoặc phiên thu thập chưa sẵn sàng' }))
        .catch(() => sendResponse({ error: 'Không thể bắt đầu thu thập' }));
      return true;
    }

    case 'STOP_COLLECTING': {
      const senderIsXTab = isXUrl(sender.tab?.url);
      if (!isValidUsername(payload?.username) || (senderIsXTab && !isMatchingXTab(sender, payload.username))) { sendResponse({ error: 'Invalid username or tab' }); return false; }
      stopCollecting(payload.username);
      sendResponse({ ok: true });
      return true;
    }

    case 'START_DOWNLOAD': {
      const { username, options } = payload || {};
      if (!isValidUsername(username) || (sender.tab && !isMatchingXTab(sender, username)) || !isValidDownloadOptions(options)) {
        sendResponse({ error: 'Invalid download request' }); return false;
      }
      if (downloadCoordinator.isBusy) {
        sendResponse({ error: 'Download is already running' });
        return false;
      }
      startDownload(username, options);
      sendResponse({ ok: true });
      return true;
    }

    case 'DIAGNOSTIC_METRIC': {
      const { name, value } = payload || {};
      if (sender.tab?.id && isXUrl(sender.tab.url) && ALLOWED_DIAGNOSTIC_METRICS.has(name) && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60_000) {
        void recordDiagnostic(name, value);
      }
      return false;
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
        const result = await queryProfileMedia(username, { filterType, dateFrom, dateTo, keyword });
        sendResponse({ count: result.total });
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
        const result = await queryProfileMedia(username, { filterType, dateFrom, dateTo, keyword }, PICKER_ITEM_LIMIT);
        sendResponse({ items: result.items, total: result.total, truncated: result.total > PICKER_ITEM_LIMIT });
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
      const username = payload.username;
      cancelDownloadedPersist(username);
      downloadedStore.delete(username);
      void Promise.all([
        mediaRepository.clearDownloadedUrls(username),
        chrome.storage.local.remove(`downloaded_${username}`), // legacy cleanup
      ]).then(() => sendResponse({ ok: true, count: 0 }))
        .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Clear failed' }));
      return true;
    }

    // Xóa toàn bộ lịch sử đã tải của TẤT CẢ username
    case 'CLEAR_ALL_DOWNLOADED': {
      cancelDownloadedPersist();
      downloadedStore.clear();
      void (async () => {
        await mediaRepository.clearAllDownloadedUrls();
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allData || {}).filter(k => k.startsWith('downloaded_'));
        if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);
      })().then(() => sendResponse({ ok: true }))
        .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Clear failed' }));
      return true;
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
        mediaRepository.clearDownloadedUrls(u).catch(() => {});
        chrome.storage.local.remove(`downloaded_${u}`).catch(() => {});
      }
      sendResponse({ ok: true });
      return false;
    }

    // ─── Mini Button: Download single tweet ──────────────────────────────────
    case 'DOWNLOAD_TWEET': {
      const { tweetId, username } = payload || {};
      const tabId = sender.tab?.id;
      if (!tabId || !isXUrl(sender.tab?.url) || typeof tweetId !== 'string' || !/^\d{10,20}$/.test(tweetId)) { sendResponse({ error: 'Invalid tweet request' }); return false; }
      // Buttons also appear on Home/Search; only trust a username that matches the tab's profile.
      const profileUsername = isMatchingXTab(sender, username) ? username : undefined;

      // Thông báo loading ngay
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'TWEET_DOWNLOAD_RESULT',
          payload: { tweetId, state: 'loading' }
        }).catch(() => {});
      }

      // Xử lý async không giữ message channel
      handleDownloadTweet(tweetId, profileUsername, tabId);
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
          const res = await chrome.storage.local.get(key) as Record<string, unknown>;
          const session = res[key] as { scrollCount?: number; stats?: Stats } | undefined;

          if (!session) {
            sendResponse({ error: 'No session found' });
            return;
          }

          // v4.4.0: Load media items from IndexedDB
          const itemsArray = await mediaRepository.getMediaItems(username);
          if (itemsArray && itemsArray.length > 0) {
            if (!mediaStore.has(username)) mediaStore.set(username, new Map());
            const store = mediaStore.get(username)!;
            itemsArray.forEach(item => {
              if (item?.url && !store.has(item.url)) store.set(item.url, item);
            });
          }

          if (!mediaStore.has(username)) mediaStore.set(username, new Map());
          const store = mediaStore.get(username)!;

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
          sendResponse({ error: err instanceof Error ? err.message : String(err) });
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

    // v5.5.0: Shortcut download — tải ảnh từ bất kỳ trang web nào
    case 'SHORTCUT_DOWNLOAD': {
      const { url } = payload || {};
      // The URL comes from page-controlled <img> attributes: only an X tab may ask,
      // and only HTTPS media hosts are downloaded (no http:, data:, intranet).
      if (!sender.tab?.id || !isXUrl(sender.tab.url) || !isTrustedMediaUrl(url)) {
        sendResponse({ error: 'Blocked untrusted shortcut download' });
        return false;
      }
      try {
        const urlObj = new URL(url);

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
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      }
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
      if (!safeFilename || !isTelegramDownloadUrl(url)) {
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
}
