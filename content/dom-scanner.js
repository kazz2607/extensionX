/**
 * dom-scanner.js — DOM Fallback Scanner
 * Chạy trong PAGE CONTEXT (inject từ content.js)
 * Quét DOM tìm img/video elements khi GraphQL intercept không bắt được
 *
 * Kích hoạt khi:
 *   - Người dùng cuộn trang
 *   - MutationObserver phát hiện DOM thay đổi (tweet mới render)
 */

(function () {
  'use strict';

  if (window.__X_DOM_SCANNER_LOADED__) return;
  window.__X_DOM_SCANNER_LOADED__ = true;

  // Tập hợp URL đã phát hiện (tránh duplicate)
  const discovered = new Set();

  // ─── Media Domain Whitelist ─────────────────────────────────────────────────
  const IMAGE_DOMAINS = ['pbs.twimg.com'];
  const VIDEO_DOMAINS = ['video.twimg.com'];

  function isImageUrl(src) {
    return IMAGE_DOMAINS.some(d => src.includes(d)) &&
      !src.includes('profile_images') &&
      !src.includes('profile_banners') &&
      !src.includes('emoji');
  }

  function isVideoUrl(src) {
    return VIDEO_DOMAINS.some(d => src.includes(d));
  }

  // ─── Extract media from DOM ─────────────────────────────────────────────────
  function scanDOM() {
    const found = [];

    // ─── Images: <img> ─────────────────────────────────────────────────────
    document.querySelectorAll('img[src]').forEach(img => {
      const src = img.src || img.getAttribute('src') || '';
      if (!src || !isImageUrl(src)) return;

      // Nâng chất lượng lên orig
      let url = src;
      try {
        const u = new URL(src);
        u.searchParams.set('name', 'orig');
        u.searchParams.set('format', 'jpg');
        url = u.toString();
      } catch (_) {}

      if (discovered.has(url)) return;
      discovered.add(url);

      // Cố gắng lấy tweet ID từ article gần nhất
      const article = img.closest('article');
      const tweetId = extractTweetId(article);

      found.push({
        type: 'image',
        url,
        tweetId,
        mediaKey: '',
        ext: 'jpg',
        source: 'dom',
      });
    });

    // ─── Videos: <video> ───────────────────────────────────────────────────
    document.querySelectorAll('video[src], video source[src]').forEach(el => {
      const src = el.src || el.getAttribute('src') || '';
      if (!src || !isVideoUrl(src)) return;
      if (discovered.has(src)) return;
      discovered.add(src);

      const article = el.closest('article');
      const tweetId = extractTweetId(article);

      // m3u8 hoặc mp4
      const isHLS = src.includes('.m3u8');
      found.push({
        type: isHLS ? 'hls' : 'video',
        url: src,
        tweetId,
        mediaKey: '',
        ext: isHLS ? 'm3u8' : 'mp4',
        source: 'dom',
      });
    });

    // ─── Video từ data attributes / meta ──────────────────────────────────
    document.querySelectorAll('[data-testid="videoPlayer"] video').forEach(vid => {
      const currentSrc = vid.currentSrc || vid.src || '';
      if (currentSrc && isVideoUrl(currentSrc) && !discovered.has(currentSrc)) {
        discovered.add(currentSrc);
        const tweetId = extractTweetId(vid.closest('article'));
        found.push({
          type: currentSrc.includes('.m3u8') ? 'hls' : 'video',
          url: currentSrc,
          tweetId,
          mediaKey: '',
          ext: currentSrc.includes('.m3u8') ? 'm3u8' : 'mp4',
          source: 'dom',
        });
      }
    });

    if (found.length > 0) {
      window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
        detail: { mediaItems: found, sourceUrl: 'dom-scanner' }
      }));
    }

    return found.length;
  }

  // ─── Extract tweet ID từ article element ───────────────────────────────────
  function extractTweetId(article) {
    if (!article) return '';
    // Tìm link dạng /status/1234567890
    const link = article.querySelector('a[href*="/status/"]');
    if (link) {
      const m = link.href.match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    // Thử lấy từ time element
    const timeLink = article.querySelector('time')?.closest('a');
    if (timeLink) {
      const m = timeLink.href?.match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    return '';
  }

  // ─── MutationObserver: quét khi DOM thay đổi ───────────────────────────────
  let scanTimeout;
  const observer = new MutationObserver((mutations) => {
    // Debounce — chờ DOM ổn định 800ms rồi mới scan
    const hasRelevant = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 && (
          n.tagName === 'ARTICLE' ||
          n.querySelector?.('article') ||
          n.tagName === 'IMG' ||
          n.tagName === 'VIDEO'
        )
      )
    );

    if (hasRelevant) {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(scanDOM, 800);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Scan ngay lần đầu sau khi trang render
  setTimeout(scanDOM, 2000);

  // Expose để content.js có thể gọi thủ công
  window.__scanDOM__ = scanDOM;

})();
