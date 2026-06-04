// @ts-nocheck
/**
 * content.js — Content Script
 * Chạy trong isolated world (extension context) trên x.com
 * Nhiệm vụ:
 *   1. Inject page-interceptor.js vào page context — bắt URL video qua hook fetch/XHR (Layer 1)
 *   2. Inject dom-scanner.js — DOM fallback quét ảnh/video_placeholder (Layer 2)
 *   3. Inject fab.js — Floating Action Button
 *   4. Relay media events từ page → service worker
 *   5. Thực hiện auto-scroll theo lệnh từ service worker
 *   6. Cầu nối FAB ↔ service worker
 */

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
  try { navObserver?.disconnect(); } catch (_) {}
  // Dùng console.debug thay vì warn — Chrome không log debug vào trang errors
  console.debug('[XMD] Extension context invalidated — content script disconnected.');
}

// ─── 1. Inject scripts vào page context ──────────────────────────────────────
function injectScript(path, onLoad) {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(path);
  script.onload = () => {
    script.remove();
    onLoad?.();
  };
  (document.head || document.documentElement).prepend(script);
}

// Inject page-interceptor NGAY LẬP TỨC để bắt JSON.parse và fetch từ sớm
injectScript('content/page-interceptor.js');

// Inject i18n, DOM scanner, FAB và Tweet Mini Button
async function injectAll() {
  injectScript('lib/i18n.js');
  injectScript('content/dom-scanner.js');
  injectScript('content/fab.js');
  injectScript('content/tweet-btn.js');
  injectScript('content/snackbar.js');
  
  // Đọc lang và gửi cho page (để i18n.js trong page update)
  const stored = await chrome.storage.local.get('lang').catch(() => ({}));
  const lang = stored.lang || 'en';
  // Chờ một chút để các script được inject và parse
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('XMD_LANG_UPDATE', { detail: { lang } }));
  }, 300);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectAll);
} else {
  injectAll();
}

// ─── 2. Lấy username từ URL ───────────────────────────────────────────────────
function getUsernameFromURL(url = location.href) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    
    // v4.4.0: Hỗ trợ Bookmarks
    if (path.includes('/i/bookmarks')) return '_bookmarks_';
    
    const match = path.match(/^\/([A-Za-z0-9_]{1,50})/);
    if (match) {
      const reserved = ['home', 'explore', 'notifications', 'messages',
        'search', 'settings', 'i', 'login', 'logout', 'compose'];
      const username = match[1];
      if (!reserved.includes(username.toLowerCase())) {
        // v4.4.0: Hỗ trợ Likes
        if (path.includes('/likes')) return username + '_likes';
        return username;
      }
    }
  } catch (_) {}
  return null;
}

function isMediaPage(url = location.href) {
  return url.includes('/media') || url.includes('/photos') || url.includes('/videos') || url.includes('/likes') || url.includes('/bookmarks');
}

// ─── S2: Validate media item từ CustomEvent (bảo vệ khỏi XSS injection) ─────
const VALID_ITEM_TYPES = ['image', 'video', 'gif', 'hls', 'video_placeholder'];
const VALID_HOSTS      = ['pbs.twimg.com', 'video.twimg.com'];
const VALID_EXTS       = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'ts', 'm3u8', 'mov'];

function validateMediaItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!VALID_ITEM_TYPES.includes(item.type)) return false;
  if (item.type === 'video_placeholder') {
    return /^\d{10,20}$/.test(item.tweetId || '');
  }
  const url = item.url || '';
  if (!VALID_HOSTS.some(h => url.startsWith(`https://${h}/`))) return false;
  if (item.tweetId && !/^\d{10,20}$/.test(item.tweetId)) return false;
  if (item.ext && !VALID_EXTS.includes(item.ext.toLowerCase())) return false;
  return true;
}

window.addEventListener('X_MEDIA_FOUND', (event) => {
  const { mediaItems, sourceUrl } = event.detail;
  if (!mediaItems?.length) return;

  // BUG-3 FIX: Kiểm tra context trước khi sendMessage
  if (_contextDead || !isExtensionValid()) {
    handleContextInvalidated();
    return;
  }

  const username = getUsernameFromURL();
  // Bỏ qua nếu không xác định được username (trang Home, Explore...)
  if (!username) return;

  // S2: Lọc items không hợp lệ trước khi gửi lên SW — chặn injection từ page context
  const validItems = mediaItems.filter(validateMediaItem);
  if (!validItems.length) return;

  chrome.runtime.sendMessage({
    type: 'MEDIA_FOUND',
    payload: {
      username: username || 'unknown',
      mediaItems: validItems,
      sourceUrl,
      pageUrl: location.href,
    }
  }).catch((err) => {
    // Nếu context bị invalidate → cleanup
    if (err?.message?.includes('Extension context invalidated')) {
      handleContextInvalidated();
    }
  });
});


// ─── 4. Lắng nghe FAB actions → relay sang service worker ────────────────────
window.addEventListener('XMD_FAB_ACTION', (event) => {
  const { action } = event.detail || {};
  const username = getUsernameFromURL();
  if (!username) return;
  if (_contextDead || !isExtensionValid()) { handleContextInvalidated(); return; } // BUG-3 FIX

  if (action === 'START_COLLECTING') {
    chrome.runtime.sendMessage({ type: 'START_COLLECTING', payload: { username } }).catch(() => {});
  } else if (action === 'STOP_COLLECTING') {
    chrome.runtime.sendMessage({ type: 'STOP_COLLECTING', payload: { username } }).catch(() => {});
  } else if (action === 'START_DOWNLOAD') {
    chrome.runtime.sendMessage({ type: 'START_DOWNLOAD', payload: { username, options: {} } }).catch(() => {});
  }
});

// ─── 4b. Relay XMD_TWEET_DOWNLOAD → service worker ───────────────────────────
// Khi user bấm nút mini download trên tweet, tweet-btn.js dispatch event này
window.addEventListener('XMD_TWEET_DOWNLOAD', (event) => {
  const { tweetId, username } = event.detail || {};
  if (!tweetId) return;
  if (_contextDead || !isExtensionValid()) { handleContextInvalidated(); return; }

  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_TWEET',
    payload: {
      tweetId,
      username: username || getUsernameFromURL() || 'unknown',
    }
  }).catch((err) => {
    if (err?.message?.includes('Extension context invalidated')) {
      handleContextInvalidated();
    }
  });
});

// ─── 4c. P1: Lắng nghe X_ADAPTIVE_SPEED từ interceptor ────────────────────────
let adaptiveAvg = 0;
window.addEventListener('X_ADAPTIVE_SPEED', (event) => {
  if (event.detail && event.detail.avgResponseTime) {
    adaptiveAvg = event.detail.avgResponseTime;
  }
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

  // Scroll xuống cuối trang
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
      window.__scanDOM__?.();
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
    if (username) {
      if (username === '_bookmarks_') location.href = 'https://x.com/i/bookmarks';
      else if (username.endsWith('_likes')) location.href = `https://x.com/${username.replace('_likes', '')}/likes`;
      else location.href = `https://x.com/${username}/media`;
    }
    return false;
  }

  // Update FAB widget từ service worker
  if (message.type === 'FAB_UPDATE') {
    window.dispatchEvent(new CustomEvent('XMD_FAB_UPDATE', {
      detail: message.payload
    }));
    return false;
  }

  // Kết quả download tweet từ mini button — relay về tweet-btn.js
  if (message.type === 'TWEET_DOWNLOAD_RESULT') {
    window.dispatchEvent(new CustomEvent('XMD_TWEET_BTN_UPDATE', {
      detail: message.payload
    }));
    return false;
  }

  // Progress Snackbar — relay SNACKBAR_UPDATE về snackbar.js trên trang
  if (message.type === 'SNACKBAR_UPDATE') {
    window.dispatchEvent(new CustomEvent('XMD_SNACKBAR_UPDATE', {
      detail: message.payload
    }));
    return false;
  }

  // Theo dõi trạng thái collecting → kiểm soát relay media
  if (message.type === 'COLLECT_STARTED_LOCAL') {
    isCollecting = true;
    return false;
  }
  if (message.type === 'COLLECT_STOPPED_LOCAL') {
    isCollecting = false;
    return false;
  }

  return false;
});

// Lắng nghe storage thay đổi (lang)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lang) {
    window.dispatchEvent(new CustomEvent('XMD_LANG_UPDATE', { 
      detail: { lang: changes.lang.newValue } 
    }));
  }
});

// ─── 6. Thông báo khi trang load xong ────────────────────────────────────────
window.addEventListener('load', () => {
  const username = getUsernameFromURL();
  if (username) {
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]*)/);
    const ct0 = match ? match[1] : '';
    chrome.runtime.sendMessage({
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
let lastUrl = location.href;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // BUG-3 FIX: Kiểm tra context trước khi sendMessage
    if (_contextDead || !isExtensionValid()) {
      handleContextInvalidated();
      return;
    }
    const username = getUsernameFromURL();
    if (username) {
      try {
        const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]*)/);
        const ct0 = match ? match[1] : '';
        chrome.runtime.sendMessage({
          type: 'PAGE_LOADED',
          payload: { username, url: location.href, isMediaPage: isMediaPage(), ct0 }
        }).catch((err) => {
          if (err?.message?.includes('Extension context invalidated')) {
            handleContextInvalidated();
          }
        });
      } catch (err) {
        if (err?.message?.includes('Extension context invalidated')) {
          handleContextInvalidated();
        }
      }
    }
  }
});
navObserver.observe(document, { subtree: true, childList: true });
