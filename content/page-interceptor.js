/**
 * page-interceptor.js — Chạy trong PAGE CONTEXT (không phải isolated world)
 * Mục đích: Hook window.fetch + XHR để bắt URL video khi X.com tải video phát.
 *
 * Đây là cách đáng tin cậy nhất — không cần Guest Token hay API call riêng.
 * X.com TỰ gọi các URL video.twimg.com khi phát video → ta chỉ cần nghe.
 *
 * Flow:
 *   fetch/XHR đến video.twimg.com → notifyVideoUrl() → CustomEvent X_MEDIA_FOUND
 *   → content.js relay → service-worker lưu vào mediaStore
 */

(function () {
  'use strict';

  // Tránh khởi tạo nhiều lần
  if (window.__XMD_PAGE_INTERCEPTOR__) return;
  window.__XMD_PAGE_INTERCEPTOR__ = true;

  // Tập hợp URL đã xử lý (dedup theo base URL không có query string)
  const seenUrls = new Set();

  // ─── Extract Tweet ID từ URL video ──────────────────────────────────────────
  function extractTweetIdFromUrl(url) {
    // ext_tw_video chứa tweet ID trong đường dẫn
    // VD: video.twimg.com/ext_tw_video/1234567890/pu/pl/abc.m3u8
    const m = url.match(/ext_tw_video\/(\d+)/);
    return m ? m[1] : '';
  }

  // ─── Extract Tweet ID từ DOM (bài viết đang hiển thị gần nhất) ──────────────
  function extractTweetIdFromDOM() {
    try {
      const articles = document.querySelectorAll('article');
      for (const article of articles) {
        const rect = article.getBoundingClientRect();
        // Tìm article đang trong viewport (±300px)
        if (rect.top >= -300 && rect.top <= window.innerHeight + 300) {
          const link = article.querySelector('a[href*="/status/"]');
          if (link) {
            const m = link.href.match(/\/status\/(\d+)/);
            if (m) return m[1];
          }
          // Thử qua time element
          const timeLink = article.querySelector('time')?.closest('a');
          if (timeLink) {
            const m = timeLink.href?.match(/\/status\/(\d+)/);
            if (m) return m[1];
          }
        }
      }
    } catch (_) {}
    return '';
  }

  // ─── Xử lý URL video tiềm năng ──────────────────────────────────────────────
  function notifyVideoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    if (!rawUrl.includes('video.twimg.com')) return;

    // Bỏ qua .ts segments — ta không muốn từng fragment riêng lẻ
    if (/\.ts(\?|$)/.test(rawUrl)) return;

    // Bỏ qua m3u8 quality-specific (có độ phân giải kiểu 1280x720 trong path)
    // Ta muốn master playlist, không phải playlist từng chất lượng
    if (rawUrl.includes('.m3u8') && /\/\d+x\d+\//.test(rawUrl)) return;

    // Dedup theo base URL (bỏ query string để tránh trùng lặp do params khác nhau)
    const baseUrl = rawUrl.split('?')[0];
    if (seenUrls.has(baseUrl)) return;
    seenUrls.add(baseUrl);

    const isHls = rawUrl.includes('.m3u8');
    // tweet_video/*.mp4 = GIF động, ext_tw_video/*/vid/*.mp4 = video thật
    const isGifVideo = rawUrl.includes('tweet_video') && rawUrl.includes('.mp4');
    const isDirectMp4 = rawUrl.includes('/vid/') && rawUrl.includes('.mp4');

    // Chỉ xử lý HLS, GIF video, và direct MP4 (bỏ các file MP4 khác như thumbnail)
    if (!isHls && !isGifVideo && !isDirectMp4) return;

    const tweetId = extractTweetIdFromUrl(rawUrl) || extractTweetIdFromDOM();

    const mediaItem = {
      type: isHls ? 'hls' : (isGifVideo ? 'gif' : 'video'),
      url: rawUrl,
      tweetId,
      mediaKey: '',
      ext: isHls ? 'm3u8' : 'mp4',
      source: 'interceptor',
    };

    window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
      detail: {
        mediaItems: [mediaItem],
        sourceUrl: 'page-interceptor',
      },
    }));
  }

  // ─── 1. Hook window.fetch ────────────────────────────────────────────────────
  const _originalFetch = window.fetch;
  window.fetch = function (resource, init) {
    try {
      let url = '';
      if (typeof resource === 'string') url = resource;
      else if (resource instanceof URL) url = resource.href;
      else if (resource instanceof Request) url = resource.url;
      notifyVideoUrl(url);
    } catch (_) {}
    return _originalFetch.apply(this, arguments);
  };

  // ─── 2. Hook XMLHttpRequest ──────────────────────────────────────────────────
  const _originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { notifyVideoUrl(String(url || '')); } catch (_) {}
    return _originalXhrOpen.apply(this, arguments);
  };

  // ─── 3. Theo dõi video elements (phát hiện src/currentSrc trực tiếp) ─────────
  function watchVideoElement(videoEl) {
    const checkSrc = () => {
      const src = videoEl.currentSrc || videoEl.src;
      if (src) notifyVideoUrl(src);
    };

    // Bắt khi bắt đầu load media mới
    videoEl.addEventListener('loadstart', checkSrc, { passive: true });
    // Bắt khi đã sẵn sàng phát
    videoEl.addEventListener('canplay', checkSrc, { passive: true });
    // Kiểm tra ngay lập tức phòng video đã load sẵn
    checkSrc();
  }

  // ─── 4. MutationObserver để bắt video elements mới thêm vào DOM ─────────────
  const domObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Chỉ xử lý Element nodes
        if (node.tagName === 'VIDEO') {
          watchVideoElement(node);
        } else {
          node.querySelectorAll?.('video').forEach(watchVideoElement);
        }
      }
    }
  });

  function startObserving() {
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    // Scan các video đã có sẵn
    document.querySelectorAll('video').forEach(watchVideoElement);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true });
  } else {
    startObserving();
  }

})();
