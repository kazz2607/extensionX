/**
 * content.js — Content Script
 * Chạy trong isolated world (extension context) trên x.com
 * Nhiệm vụ:
 *   1. Page scripts (page-interceptor, dom-scanner, FAB, tweet button, snackbar)
 *      được manifest nạp vào MAIN world qua bundle content/main-world.ts
 *   2. Relay media/FAB/tweet events từ page → service worker qua page-bridge
 *      (MessagePort riêng — script của trang không đọc hay giả mạo được)
 *   3. Thực hiện auto-scroll theo lệnh từ service worker
 *   4. Cầu nối FAB ↔ service worker
 */
import { onPageMessage, sendToPage } from './extension-bridge.ts';
import { emitUi, onUi } from './ui-bus.ts';
import { isCollectMediaPageUrl, usernameFromXUrl } from '../shared/validation.ts';
import { isSearchSourceKey } from '../shared/collection-source.ts';
// window.i18n, FAB and snackbar live in this isolated world (closed shadow
// roots), out of reach of page scripts.
// x-ui-i18n.ts registers the X UI strings once; fab/snackbar import it.
import './fab.ts';
import './snackbar.ts';

// ─── BUG-3 FIX: Guard kiểm tra extension context còn hợp lệ không ────────────
function isExtensionValid() {
  try {
    return !!chrome.runtime?.id;
  } catch (_) {
    return false;
  }
}

// Cleanup khi extension context bị invalidate (SW reload/update)
// Flag đảm bảo chỉ cleanup 1 lần — tránh spam log mỗi khi DOM thay đổi
let _contextDead = false;
function handleContextInvalidated() {
  if (_contextDead) return;
  _contextDead = true;
  // Dùng console.debug thay vì warn — Chrome không log debug vào trang errors
  console.debug('[X Media Downloader] Extension context invalidated. Page reload required.');
}

// Hàm gửi message an toàn, tự động bắt lỗi context bị huỷ
function safeSendMessage(message: unknown): Promise<unknown> {
  if (_contextDead || !isExtensionValid()) {
    handleContextInvalidated();
    return Promise.reject(new Error('Extension context invalidated'));
  }
  try {
    return chrome.runtime.sendMessage(message).catch((err: unknown) => {
      if (err instanceof Error && err.message.includes('Extension context invalidated')) {
        handleContextInvalidated();
      }
      throw err;
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Extension context invalidated')) {
      handleContextInvalidated();
    }
    return Promise.reject(err);
  }
}

// ─── 1. Ngôn ngữ cho FAB/snackbar (window.i18n của isolated world) ───────────
chrome.storage.local.get('lang')
  .then((stored) => {
    const lang = typeof stored.lang === 'string' ? stored.lang : 'en';
    emitUi('XMD_LANG_UPDATE', { lang });
    sendToPage('XMD_LANG_UPDATE', { lang });
  })
  .catch((err: unknown) => console.debug('Failed to load lang', err));

// ─── 2. Lấy username từ URL ───────────────────────────────────────────────────
// Dùng chung parser với service worker và script trang (profile, Likes,
// Bookmarks, Search, Hashtag) để popup, interceptor và SW luôn thống nhất.
function getUsernameFromURL(url = location.href) {
  return usernameFromXUrl(url);
}

function isMediaPage(url = location.href) {
  return isCollectMediaPageUrl(url);
}

// ─── Feature 0: Following Page Detection ─────────────────────────────────────
function isFollowingPage(url = location.href) {
  try {
    return /\/[A-Za-z0-9_]+\/following(\/|$)/.test(new URL(url).pathname);
  } catch (_) { return false; }
}

// Quét DOM trang /following để lấy danh sách username + bio từ các UserCell card
function extractFollowingUsers(): { username: string; displayName: string; bio: string }[] {
  const cells = document.querySelectorAll('[data-testid="UserCell"]');
  const results: { username: string; displayName: string; bio: string }[] = [];
  cells.forEach(cell => {
    // Link profile: href="/username"
    const link = cell.querySelector('a[href^="/"][role="link"]') as HTMLAnchorElement | null;
    const username = link?.getAttribute('href')?.replace(/^\//, '').split('/')[0] || '';
    // Display name: first span bên trong User-Name
    const nameEl = cell.querySelector('[data-testid="User-Name"] span span') as HTMLElement | null;
    const displayName = nameEl?.textContent?.trim() || username;
    // Bio: div[dir="auto"] nằm trong cell nhưng NGOÀI User-Name block
    const userNameBlock = cell.querySelector('[data-testid="User-Name"]');
    const allDirDivs = Array.from(cell.querySelectorAll<HTMLElement>('div[dir="auto"], div[dir="ltr"]'));
    const bio = allDirDivs
      .filter(el => userNameBlock ? !userNameBlock.contains(el) : true)
      .map(el => el.textContent?.trim() || '')
      .find(t => t.length > 0) || '';
    if (username && !username.startsWith('i/') && username.length > 0) {
      results.push({ username, displayName, bio });
    }
  });
  return results;
}

// ─── S2: Validate media item từ CustomEvent (bảo vệ khỏi XSS injection) ─────
const VALID_ITEM_TYPES = ['image', 'video', 'gif', 'hls', 'video_placeholder'];
const VALID_HOSTS      = ['pbs.twimg.com', 'video.twimg.com'];
const VALID_EXTS       = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'ts', 'm3u8', 'mov'];

function validateMediaItem(item: { type?: unknown; tweetId?: unknown; url?: unknown; ext?: unknown } | null): boolean {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.type !== 'string') return false;
  if (!VALID_ITEM_TYPES.includes(item.type)) return false;
  if (item.type === 'video_placeholder') {
    return typeof item.tweetId === 'string' && /^\d{10,20}$/.test(item.tweetId);
  }
  const url = typeof item.url === 'string' ? item.url : '';
  if (!VALID_HOSTS.some(h => url.startsWith(`https://${h}/`))) return false;
  // SEC-03: Validate path structure — chỉ cho phép ký tự an toàn, chặn path traversal
  try {
    const urlObj = new URL(url);
    if (!/^[/a-zA-Z0-9._\-~%]+$/.test(urlObj.pathname)) return false;
  } catch {
    return false;
  }
  if (item.tweetId !== undefined && (typeof item.tweetId !== 'string' || !/^\d{10,20}$/.test(item.tweetId))) return false;
  if (item.ext !== undefined && (typeof item.ext !== 'string' || !VALID_EXTS.includes(item.ext.toLowerCase()))) return false;
  return true;
}

// ─── P3: Batch MEDIA_FOUND — gom items trong một rAF frame trước khi gửi SW ─
// Tránh burst nhiều small message khi DOM scanner hoặc page-interceptor emit
// nhiều event liên tiếp trong cùng một scroll event / GraphQL response.
const MEDIA_BATCH_MAX = 200; // Service worker rejects larger MEDIA_FOUND batches
let _mediaBatch: unknown[] = [];
let _mediaBatchRaf: number | null = null;

function flushMediaBatch() {
  _mediaBatchRaf = null;
  if (!_mediaBatch.length) return;
  const batch = _mediaBatch;
  _mediaBatch = [];

  const username = getUsernameFromURL();
  if (!username) return;

  const validItems = batch.filter((item) => validateMediaItem(item as Parameters<typeof validateMediaItem>[0]));
  for (let start = 0; start < validItems.length; start += MEDIA_BATCH_MAX) {
    safeSendMessage({
      type: 'MEDIA_FOUND',
      payload: {
        username,
        mediaItems: validItems.slice(start, start + MEDIA_BATCH_MAX),
        sourceUrl: 'batched',
        pageUrl: location.href,
      }
    }).catch(() => {});
  }
}

onPageMessage('X_MEDIA_FOUND', (detail) => {
  const mediaItems = (detail as { mediaItems?: unknown } | null)?.mediaItems;
  if (!Array.isArray(mediaItems) || !mediaItems.length) return;

  // Bỏ qua nếu không xác định được username (trang Home, Explore...)
  if (!getUsernameFromURL()) return;

  _mediaBatch.push(...mediaItems);
  if (_mediaBatchRaf === null) {
    _mediaBatchRaf = requestAnimationFrame(flushMediaBatch);
  }
});

// Diagnostics are opt-in; when off (default) metrics never leave the page so
// browsing X does not keep waking the service worker.
let diagnosticsEnabled = false;
function readDiagnosticsFlag(options: unknown) {
  diagnosticsEnabled = (options as { localDiagnostics?: unknown } | undefined)?.localDiagnostics === true;
}
chrome.storage.sync.get('options').then((stored) => readDiagnosticsFlag(stored.options)).catch(() => {});

const ALLOWED_DIAGNOSTIC_METRICS = new Set(['scan.duration_ms', 'observer.callback']);
onPageMessage('XMD_DIAGNOSTIC_METRIC', (detail) => {
  if (!diagnosticsEnabled || !detail || typeof detail !== 'object') return;
  const metric = detail as { name?: unknown; value?: unknown };
  if (!ALLOWED_DIAGNOSTIC_METRICS.has(String(metric.name))) return;
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0 || metric.value > 60_000) return;
  safeSendMessage({ type: 'DIAGNOSTIC_METRIC', payload: { name: metric.name, value: Math.round(metric.value) } }).catch(() => {});
});


// ─── 4. Lắng nghe FAB actions → relay sang service worker ────────────────────
onUi('XMD_FAB_ACTION', (detail) => {
  const action = (detail as { action?: unknown } | null)?.action;
  const username = getUsernameFromURL();
  if (!username) return;

  if (action === 'START_COLLECTING') {
    safeSendMessage({ type: 'START_COLLECTING', payload: { username } }).catch(() => {});
  } else if (action === 'STOP_COLLECTING') {
    safeSendMessage({ type: 'STOP_COLLECTING', payload: { username } }).catch(() => {});
  } else if (action === 'START_DOWNLOAD') {
    safeSendMessage({ type: 'START_DOWNLOAD', payload: { username, options: {} } }).catch(() => {});
  }
});

// ─── SEC-04: Relay bearer token được capture từ page-interceptor lên SW ─────
let _lastBearerRelayed = '';
onPageMessage('XMD_BEARER_TOKEN', (detail) => {
  const bearer = (detail as { bearer?: unknown } | null)?.bearer;
  if (typeof bearer === 'string' && bearer && bearer !== _lastBearerRelayed) {
    _lastBearerRelayed = bearer;
    safeSendMessage({ type: 'UPDATE_BEARER', payload: { bearer } }).catch(() => {});
  }
});

// ─── Dynamic Query ID: relay từ page-interceptor lên SW ─────────────────────
const _relayedQueryIds: Record<string, string> = {};
onPageMessage('XMD_QUERY_ID', (detail) => {
  const { queryId, opName } = (detail || {}) as { queryId?: unknown; opName?: unknown };
  if (typeof queryId !== 'string' || typeof opName !== 'string' || !queryId || !opName) return;
  if (_relayedQueryIds[opName] === queryId) return; // dedup
  _relayedQueryIds[opName] = queryId;
  safeSendMessage({ type: 'UPDATE_QUERY_ID', payload: { queryId, opName } }).catch(() => {});
});

onPageMessage('XMD_FOLLOWING_PAGE', (detail) => {
  const { candidates, cursor } = (detail || {}) as { candidates?: unknown; cursor?: unknown };
  safeSendMessage({ type: 'FOLLOWING_SCAN_PAGE', payload: { candidates, cursor } }).catch(() => {});
});

// ─── 4b. Relay XMD_TWEET_DOWNLOAD → service worker ───────────────────────────
// Khi user bấm nút mini download trên tweet, tweet-btn dispatch qua page-bridge
onPageMessage('XMD_TWEET_DOWNLOAD', (detail) => {
  const { tweetId, username } = (detail || {}) as { tweetId?: unknown; username?: unknown };
  if (typeof tweetId !== 'string' || !tweetId) return;

  const profile = (typeof username === 'string' && username) || getUsernameFromURL();
  const reportError = () => sendToPage('XMD_TWEET_BTN_UPDATE', { tweetId, state: 'error' });
  safeSendMessage({
    type: 'DOWNLOAD_TWEET',
    payload: profile ? { tweetId, username: profile } : { tweetId }
  }).then((res) => {
    if ((res as { error?: string } | undefined)?.error) reportError();
  }).catch(reportError);
});

// ─── 4c. P1: Lắng nghe X_ADAPTIVE_SPEED từ interceptor ────────────────────────
let adaptiveAvg = 0;
let contentIsCollecting = false;
onPageMessage('X_ADAPTIVE_SPEED', (detail) => {
  const avg = (detail as { avgResponseTime?: unknown } | null)?.avgResponseTime;
  if (typeof avg === 'number' && Number.isFinite(avg) && avg > 0) adaptiveAvg = avg;
});

// ─── 5. Lắng nghe lệnh từ service worker ─────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // S1: Service Worker yêu cầu refresh CSRF token (ct0)
  if (message.type === 'REQUEST_CSRF_REFRESH') {
    try {
      const ct0 = document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('ct0='))
        ?.split('=')?.[1] || '';
      console.log('[content] S1: CSRF refresh —', ct0 ? 'token found' : 'token not found');
      sendResponse({ ct0 });
    } catch (_) {
      sendResponse({ ct0: '' });
    }
    return false;
  }

  // Scroll xuống cuối trang (media pages)
  if (message.type === 'SCROLL_DOWN') {
    if (!isMediaPage()) {
      sendResponse({ error: 'not_media_page' });
      return false;
    }
    const prevHeight = document.documentElement.scrollHeight;
    
    // Bỏ behavior: 'smooth' để cuộn tức thì, giúp X.com có nhiều thời gian fetch data hơn
    window.scrollTo(0, document.documentElement.scrollHeight);
    
    // Một số trick nhỏ để trigger virtual list của X.com
    setTimeout(() => window.scrollBy(0, -100), 100);
    setTimeout(() => window.scrollTo(0, document.documentElement.scrollHeight), 300);

    setTimeout(() => {
      const newHeight = document.documentElement.scrollHeight;
      // Lấy scrollY để check xem có thực sự đang ở đáy không
      const isAtBottom = (window.scrollY + window.innerHeight) >= (newHeight - 200);

      // Nếu document đang bị ẩn (thu nhỏ trình duyệt hoặc sang tab khác)
      // X.com sẽ ngừng render thêm phần tử mới. 
      // Ta cần báo cho service worker biết để TẠM DỪNG đếm lỗi thay vì kết thúc sớm.
      const isHidden = document.hidden;

      // Trigger DOM scan thủ công sau mỗi scroll
      sendToPage('XMD_SCAN_DOM');
      sendResponse({
        done: true,
        reachedEnd: !isHidden && isAtBottom && (newHeight <= prevHeight + 50),
        scrollHeight: newHeight,
        isHidden: isHidden,
        adaptiveAvg: adaptiveAvg
      });
    }, message.waitMs || 2000);

    return true;
  }

  // ─── Feature 0: Scroll trang /following + extract users từ DOM ───────────────
  if (message.type === 'SCROLL_FOLLOWING_PAGE') {
    if (!isFollowingPage()) {
      sendResponse({ error: 'not_following_page' });
      return false;
    }
    const prevHeight = document.documentElement.scrollHeight;

    window.scrollTo(0, prevHeight);
    setTimeout(() => window.scrollBy(0, -100), 100);
    setTimeout(() => window.scrollTo(0, document.documentElement.scrollHeight), 300);

    setTimeout(() => {
      const newHeight = document.documentElement.scrollHeight;
      const isAtBottom = (window.scrollY + window.innerHeight) >= (newHeight - 200);
      const isHidden = document.hidden;
      const users = extractFollowingUsers();

      sendResponse({
        done: true,
        users,
        reachedEnd: !isHidden && isAtBottom && (newHeight <= prevHeight + 50),
        scrollHeight: newHeight,
        isHidden,
      });
    }, message.waitMs || 2000);

    return true;
  }

  // Thông tin trang hiện tại
  if (message.type === 'GET_PAGE_INFO') {
    sendResponse({
      username: getUsernameFromURL(),
      url: location.href,
      isMediaPage: isMediaPage(),
      title: document.title,
    });
    return false;
  }

  // Điều hướng sang /media hoặc trang tương ứng
  if (message.type === 'NAVIGATE_TO_MEDIA') {
    const username = message.payload?.username || getUsernameFromURL();
    // Khoá Search/Hashtag không suy ra được URL; trang hiện tại đã là trang thu thập.
    if (username && !isSearchSourceKey(username)) {
      if (username === '_bookmarks_') location.href = 'https://x.com/i/bookmarks';
      else if (username.endsWith('_likes')) location.href = `https://x.com/${username.replace('_likes', '')}/likes`;
      else location.href = `https://x.com/${username}/media`;
    }
    return false;
  }

  // Update FAB widget từ service worker
  if (message.type === 'FAB_UPDATE') {
    emitUi('XMD_FAB_UPDATE', message.payload);
    return false;
  }

  // Kết quả download tweet từ mini button — relay về tweet-btn.js
  if (message.type === 'TWEET_DOWNLOAD_RESULT') {
    sendToPage('XMD_TWEET_BTN_UPDATE', message.payload);
    return false;
  }

  // Progress Snackbar — relay SNACKBAR_UPDATE về snackbar.js trên trang
  if (message.type === 'SNACKBAR_UPDATE') {
    emitUi('XMD_SNACKBAR_UPDATE', message.payload);
    return false;
  }

  // Theo dõi trạng thái collecting → kiểm soát relay media
  if (message.type === 'COLLECT_STARTED_LOCAL') {
    contentIsCollecting = true;
    return false;
  }
  if (message.type === 'COLLECT_STOPPED_LOCAL') {
    contentIsCollecting = false;
    return false;
  }

  return false;
});

// Lắng nghe storage thay đổi (lang, diagnostics opt-in)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lang) {
    emitUi('XMD_LANG_UPDATE', { lang: changes.lang.newValue });
    sendToPage('XMD_LANG_UPDATE', { lang: changes.lang.newValue });
  }
  if (area === 'sync' && changes.options) readDiagnosticsFlag(changes.options.newValue);
});

// ─── 6. Thông báo khi trang load xong ────────────────────────────────────────
window.addEventListener('load', () => {
  const username = getUsernameFromURL();
  if (username) {
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]*)/);
    const ct0 = match ? match[1] : '';
    safeSendMessage({
      type: 'PAGE_LOADED',
      payload: {
        username,
        url: location.href,
        isMediaPage: isMediaPage(),
        ct0: ct0
      }
    }).catch(() => {});
  }
});

// ─── 7. Theo dõi navigation (X.com là SPA) ───────────────────────────────────
// X calls history.pushState in the MAIN world, which an isolated-world patch
// never sees; page-navigation.ts reports route changes over the bridge instead.
let lastUrl = location.href;
onPageMessage('XMD_NAVIGATED', () => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  if (_contextDead || !isExtensionValid()) {
    handleContextInvalidated();
    return;
  }
  const username = getUsernameFromURL();
  if (username) {
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]*)/);
    const ct0 = match ? match[1] : '';
    safeSendMessage({
      type: 'PAGE_LOADED',
      payload: { username, url: location.href, isMediaPage: isMediaPage(), ct0 }
    }).catch(() => {});
  }
});
