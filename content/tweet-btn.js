/**
 * tweet-btn.js — Download Mini Button cho từng Tweet
 * Chạy trong PAGE CONTEXT (inject từ content.js)
 *
 * Tính năng:
 *   - Theo dõi DOM bằng MutationObserver
 *   - Với mỗi tweet có media: inject nút ↓ cạnh nút Share
 *   - Click → CustomEvent XMD_TWEET_DOWNLOAD → content.js relay → SW
 *   - Nhận XMD_TWEET_BTN_UPDATE → cập nhật trạng thái nút
 *
 * State nút: idle → loading (spin) → done (✓) / error (✗, reset 3s)
 */

(function () {
  'use strict';

  if (window.__XMD_TWEET_BTN_LOADED__) return;
  window.__XMD_TWEET_BTN_LOADED__ = true;

  // ─── Inject CSS ──────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.id = '__xmd_tweet_btn_style__';
  style.textContent = `
    /* Nút download mini trên từng tweet */
    .xmd-dl-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      border: none;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      padding: 0;
      margin: 0;
      color: rgb(83, 100, 113);
      transition: background 0.15s, color 0.15s, transform 0.15s;
      position: relative;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .xmd-dl-btn:hover {
      background: rgba(29, 155, 240, 0.1);
      color: rgb(29, 155, 240);
    }

    .xmd-dl-btn:active {
      transform: scale(0.9);
    }

    /* Dark mode support — X.com sets [data-theme] on html or body */
    @media (prefers-color-scheme: dark) {
      .xmd-dl-btn {
        color: rgb(113, 118, 123);
      }
    }

    /* State: loading */
    .xmd-dl-btn.xmd-loading .xmd-icon-idle,
    .xmd-dl-btn.xmd-loading .xmd-icon-done,
    .xmd-dl-btn.xmd-loading .xmd-icon-error {
      display: none;
    }
    .xmd-dl-btn.xmd-loading .xmd-icon-spin {
      display: block;
      animation: xmd-spin 0.8s linear infinite;
    }
    .xmd-dl-btn:not(.xmd-loading) .xmd-icon-spin { display: none; }

    /* State: done */
    .xmd-dl-btn.xmd-done .xmd-icon-idle,
    .xmd-dl-btn.xmd-done .xmd-icon-spin,
    .xmd-dl-btn.xmd-done .xmd-icon-error {
      display: none;
    }
    .xmd-dl-btn.xmd-done {
      color: rgb(0, 186, 124);
    }
    .xmd-dl-btn.xmd-done .xmd-icon-done { display: block; }
    .xmd-dl-btn:not(.xmd-done) .xmd-icon-done { display: none; }

    /* State: error */
    .xmd-dl-btn.xmd-error .xmd-icon-idle,
    .xmd-dl-btn.xmd-error .xmd-icon-spin,
    .xmd-dl-btn.xmd-error .xmd-icon-done {
      display: none;
    }
    .xmd-dl-btn.xmd-error {
      color: rgb(244, 33, 46);
    }
    .xmd-dl-btn.xmd-error .xmd-icon-error { display: block; }
    .xmd-dl-btn:not(.xmd-error) .xmd-icon-error { display: none; }

    @keyframes xmd-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    /* Tooltip */
    .xmd-dl-btn[title] {
      position: relative;
    }

    /* Wrapper để canh lề đồng đều với các nút khác */
    .xmd-dl-wrapper {
      display: inline-flex;
      align-items: center;
    }
  `;
  document.documentElement.appendChild(style);

  // ─── SVG Icons ──────────────────────────────────────────────────────────────
  const SVG = {
    download: `<svg class="xmd-icon-idle" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`,
    spin: `<svg class="xmd-icon-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
    </svg>`,
    done: `<svg class="xmd-icon-done" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`,
    error: `<svg class="xmd-icon-error" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`,
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Trích tweet ID từ article */
  function extractTweetId(article) {
    if (!article) return '';
    // 1. Link /status/
    const link = article.querySelector('a[href*="/status/"]');
    if (link) {
      const m = link.href.match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    // 2. Time element
    const timeLink = article.querySelector('time')?.closest('a');
    if (timeLink) {
      const m = timeLink.href?.match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    return '';
  }

  /** Kiểm tra article có chứa media không (ảnh hoặc video) */
  function hasMedia(article) {
    // Ảnh (bỏ avatar/banner/emoji)
    const imgs = article.querySelectorAll('img[src*="pbs.twimg.com"]');
    for (const img of imgs) {
      const src = img.src || '';
      if (
        !src.includes('profile_images') &&
        !src.includes('profile_banners') &&
        !src.includes('emoji')
      ) {
        return true;
      }
    }
    // Video element
    if (article.querySelector('video')) return true;
    // Video thumbnail (chưa phát)
    if (article.querySelector('img[src*="video_thumb"]')) return true;
    return false;
  }

  /** Lấy username từ URL hiện tại */
  function getUsernameFromURL() {
    try {
      const match = location.pathname.match(/^\/([A-Za-z0-9_]{1,50})/);
      if (match) {
        const reserved = ['home', 'explore', 'notifications', 'messages',
          'search', 'settings', 'i', 'login', 'logout', 'compose'];
        if (!reserved.includes(match[1].toLowerCase())) return match[1];
      }
    } catch (_) {}
    return '';
  }

  // ─── Map lưu state của các nút: tweetId → { btn, timer } ────────────────────
  const btnMap = new Map(); // tweetId → button element

  // ─── Tạo nút download ────────────────────────────────────────────────────────
  function createDownloadBtn(tweetId) {
    const btn = document.createElement('button');
    btn.className = 'xmd-dl-btn';
    btn.setAttribute('data-xmd-btn', tweetId);
    btn.setAttribute('title', 'Download media (X Media Downloader)');
    btn.setAttribute('aria-label', 'Download tweet media');
    btn.innerHTML = SVG.download + SVG.spin + SVG.done + SVG.error;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      // Tránh double-click khi đang loading
      if (btn.classList.contains('xmd-loading')) return;

      // Set loading
      setButtonState(tweetId, 'loading');

      const username = getUsernameFromURL();
      window.dispatchEvent(new CustomEvent('XMD_TWEET_DOWNLOAD', {
        detail: { tweetId, username }
      }));
    });

    return btn;
  }

  /** Cập nhật trạng thái nút */
  function setButtonState(tweetId, state) {
    const btn = btnMap.get(tweetId);
    if (!btn) return;

    // Xóa timer cũ nếu có
    const existing = btn.__xmdTimer;
    if (existing) { clearTimeout(existing); btn.__xmdTimer = null; }

    // Reset classes
    btn.classList.remove('xmd-loading', 'xmd-done', 'xmd-error');

    if (state === 'loading') {
      btn.classList.add('xmd-loading');
      btn.title = 'Đang tải...';
    } else if (state === 'done') {
      btn.classList.add('xmd-done');
      btn.title = 'Đã tải xong! ✓';
      // Reset về idle sau 3s
      btn.__xmdTimer = setTimeout(() => {
        btn.classList.remove('xmd-done');
        btn.title = 'Download media (X Media Downloader)';
      }, 3000);
    } else if (state === 'error') {
      btn.classList.add('xmd-error');
      btn.title = 'Lỗi! Thử lại';
      // Reset về idle sau 3s
      btn.__xmdTimer = setTimeout(() => {
        btn.classList.remove('xmd-error');
        btn.title = 'Download media (X Media Downloader)';
      }, 3000);
    }
    // 'idle' = không có class nào = default
  }

  // ─── Inject nút vào action bar của tweet ────────────────────────────────────
  function injectButton(article) {
    // Đã có nút rồi? Bỏ qua
    if (article.querySelector('[data-xmd-btn]')) return;

    // Tweet có media không?
    if (!hasMedia(article)) return;

    const tweetId = extractTweetId(article);
    if (!tweetId) return;

    // Tìm action bar: div[role="group"] chứa các nút tương tác
    // X.com có thể có nhiều group, cần lấy group cuối (footer của tweet)
    const groups = article.querySelectorAll('div[role="group"]');
    const actionBar = groups[groups.length - 1];
    if (!actionBar) return;

    const btn = createDownloadBtn(tweetId);
    const wrapper = document.createElement('div');
    wrapper.className = 'xmd-dl-wrapper';
    wrapper.appendChild(btn);

    // Thêm vào cuối action bar (sau nút Share / Bookmark)
    actionBar.appendChild(wrapper);

    btnMap.set(tweetId, btn);
  }

  // ─── Scan toàn bộ articles hiện tại ─────────────────────────────────────────
  function scanArticles() {
    document.querySelectorAll('article').forEach(injectButton);
  }

  // ─── MutationObserver — phát hiện tweet mới ──────────────────────────────────
  let scanDebounce;
  const observer = new MutationObserver((mutations) => {
    const hasNewArticle = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 && (
          n.tagName === 'ARTICLE' ||
          n.querySelector?.('article')
        )
      )
    );

    if (hasNewArticle) {
      clearTimeout(scanDebounce);
      // Debounce nhỏ hơn dom-scanner (500ms) để nút xuất hiện nhanh hơn
      scanDebounce = setTimeout(scanArticles, 500);
    }
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      }, { once: true });
    }
  }

  startObserver();

  // Scan ngay sau khi script load
  setTimeout(scanArticles, 1000);
  // Scan lần 2 để bắt tweets render chậm
  setTimeout(scanArticles, 2500);

  // ─── Nhận kết quả từ content.js ──────────────────────────────────────────────
  window.addEventListener('XMD_TWEET_BTN_UPDATE', (e) => {
    const { tweetId, state } = e.detail || {};
    if (!tweetId || !state) return;
    setButtonState(tweetId, state);
  });

  // ─── Theo dõi SPA navigation: scan lại khi URL thay đổi ─────────────────────
  let lastPath = location.pathname;
  const navObserver = new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      // Clear map khi navigate (tweet IDs cũ không còn trên DOM)
      btnMap.clear();
      // Scan lại sau navigation
      setTimeout(scanArticles, 1500);
      setTimeout(scanArticles, 3000);
    }
  });
  navObserver.observe(document, { subtree: true, childList: true });

})();
