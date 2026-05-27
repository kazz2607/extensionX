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

// Bỏ inject page-interceptor.js ở đây vì đã dùng manifest.json world: MAIN

// Inject i18n, DOM scanner và FAB
async function injectAll() {
  injectScript('lib/i18n.js');
  injectScript('content/dom-scanner.js');
  injectScript('content/fab.js');
  
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
    const match = u.pathname.match(/^\/([A-Za-z0-9_]{1,50})/);
    if (match) {
      const reserved = ['home', 'explore', 'notifications', 'messages',
        'search', 'settings', 'i', 'login', 'logout', 'compose'];
      if (!reserved.includes(match[1].toLowerCase())) {
        return match[1];
      }
    }
  } catch (_) {}
  return null;
}

function isMediaPage(url = location.href) {
  return url.includes('/media') || url.includes('/photos') || url.includes('/videos');
}

// ─── 3. Lắng nghe media từ page-interceptor & dom-scanner ────────────────────
// Chỉ relay khi đang thực sự thu thập (tránh đếm media trên Home / Explore)
let isCollecting = false;

window.addEventListener('X_MEDIA_FOUND', (event) => {
  const { mediaItems, sourceUrl } = event.detail;
  if (!mediaItems?.length) return;

  // Chỉ relay nếu đang trong phiên thu thập do người dùng khởi động
  if (!isCollecting) return;

  const username = getUsernameFromURL();
  // Bỏ qua nếu không xác định được username (trang Home, Explore...)
  if (!username) return;

  chrome.runtime.sendMessage({
    type: 'MEDIA_FOUND',
    payload: {
      username: username || 'unknown',
      mediaItems,
      sourceUrl,
      pageUrl: location.href,
    }
  }).catch(() => {});
});

// ─── 4. Lắng nghe FAB actions → relay sang service worker ────────────────────
window.addEventListener('XMD_FAB_ACTION', (event) => {
  const { action } = event.detail || {};
  const username = getUsernameFromURL();
  if (!username) return;

  if (action === 'START_COLLECTING') {
    chrome.runtime.sendMessage({ type: 'START_COLLECTING', payload: { username } }).catch(() => {});
  } else if (action === 'STOP_COLLECTING') {
    chrome.runtime.sendMessage({ type: 'STOP_COLLECTING', payload: { username } }).catch(() => {});
  } else if (action === 'START_DOWNLOAD') {
    chrome.runtime.sendMessage({ type: 'START_DOWNLOAD', payload: { username, options: {} } }).catch(() => {});
  }
});

// ─── 5. Lắng nghe lệnh từ service worker ─────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  // Scroll xuống cuối trang
  if (message.type === 'SCROLL_DOWN') {
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
        isHidden: isHidden
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

  // Điều hướng sang /media
  if (message.type === 'NAVIGATE_TO_MEDIA') {
    const username = message.payload?.username || getUsernameFromURL();
    if (username) location.href = `https://x.com/${username}/media`;
    return false;
  }

  // Update FAB widget từ service worker
  if (message.type === 'FAB_UPDATE') {
    window.dispatchEvent(new CustomEvent('XMD_FAB_UPDATE', {
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
    const username = getUsernameFromURL();
    if (username) {
      try {
        const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]*)/);
        const ct0 = match ? match[1] : '';
        chrome.runtime.sendMessage({
          type: 'PAGE_LOADED',
          payload: { username, url: location.href, isMediaPage: isMediaPage(), ct0 }
        }).catch(() => {});
      } catch (err) {
        // Extension context invalidated
      }
    }
  }
});
navObserver.observe(document, { subtree: true, childList: true });
