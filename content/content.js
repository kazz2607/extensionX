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

// Inject page-interceptor NGAY LẬP TỨC (trước DOM load để hook fetch/XHR sớm nhất)
// Chạy trong page context → bắt URL video khi X.com phát video
injectScript('content/page-interceptor.js');

// Inject DOM scanner và FAB sau khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectScript('content/dom-scanner.js');
    injectScript('content/fab.js');
  });
} else {
  injectScript('content/dom-scanner.js');
  injectScript('content/fab.js');
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
window.addEventListener('X_MEDIA_FOUND', (event) => {
  const { mediaItems, sourceUrl } = event.detail;
  if (!mediaItems?.length) return;

  const username = getUsernameFromURL();

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
    const prevHeight = document.body.scrollHeight;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

    setTimeout(() => {
      const newHeight = document.body.scrollHeight;
      // Trigger DOM scan thủ công sau mỗi scroll
      window.__scanDOM__?.();
      sendResponse({
        done: true,
        reachedEnd: newHeight === prevHeight,
        scrollHeight: newHeight,
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

  return false;
});

// ─── 6. Thông báo khi trang load xong ────────────────────────────────────────
window.addEventListener('load', () => {
  const username = getUsernameFromURL();
  if (username) {
    chrome.runtime.sendMessage({
      type: 'PAGE_LOADED',
      payload: {
        username,
        url: location.href,
        isMediaPage: isMediaPage(),
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
        chrome.runtime.sendMessage({
          type: 'PAGE_LOADED',
          payload: { username, url: location.href, isMediaPage: isMediaPage() }
        }).catch(() => {});
      } catch (err) {
        // Extension context invalidated - User needs to refresh the page
        console.warn('Extension reloaded. Please refresh this page (F5) to continue.');
      }
    }
  }
});
navObserver.observe(document, { subtree: true, childList: true });
