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
    document.querySelectorAll('video, video source').forEach(el => {
      const article = el.closest('article');
      const tweetId = extractTweetId(article);

      // Ưu tiên 1: Có currentSrc hoặc src thực sự (video đã được load)
      const realSrc = el.currentSrc || el.src || el.getAttribute('src') || '';
      if (realSrc && isVideoUrl(realSrc) && !realSrc.startsWith('blob:')) {
        const baseKey = `video_url_${realSrc.split('?')[0]}`;
        if (!discovered.has(baseKey)) {
          discovered.add(baseKey);
          const isHls = realSrc.includes('.m3u8');
          const isGif = realSrc.includes('tweet_video');
          // Bỏ qua quality-specific m3u8 (để page-interceptor xử lý)
          if (!(isHls && /\/\d+x\d+\//.test(realSrc))) {
            found.push({
              type: isHls ? 'hls' : (isGif ? 'gif' : 'video'),
              url: realSrc,
              tweetId: tweetId || extractTweetIdFromVideoUrl(realSrc),
              mediaKey: '',
              ext: isHls ? 'm3u8' : 'mp4',
              source: 'dom-direct',
            });
          }
          return; // Đã lấy được URL thực, không cần video_placeholder
        }
      }

      // Ưu tiên 2: Chỉ có tweetId → cần API để lấy URL video
      if (!tweetId || discovered.has(`video_${tweetId}`)) return;
      discovered.add(`video_${tweetId}`);

      found.push({
        type: 'video_placeholder', // Sẽ được service-worker phân giải qua Syndication/Guest API
        tweetId: tweetId,
        source: 'dom',
      });
    });

    // ─── Video thumbnails trong media grid ──────────────────────────────────
    // Trên trang /media, X.com hiển thị video bằng <img> thumbnail, không phải <video>
    // URL pattern: pbs.twimg.com/ext_tw_video_thumb/{tweetId}/... hoặc amplify_video_thumb
    document.querySelectorAll('img[src*="video_thumb"]').forEach(img => {
      const src = img.src || img.getAttribute('src') || '';
      if (!src.includes('pbs.twimg.com')) return;

      // Thử lấy tweet ID từ URL thumbnail (ext_tw_video_thumb/TWEETID/...)
      let tweetId = '';
      const urlMatch = src.match(/video_thumb\/(\d{10,20})\//);
      if (urlMatch) {
        tweetId = urlMatch[1];
      } else {
        // Fallback: lấy tweet ID từ article/link gần nhất
        const article = img.closest('article') || img.closest('[data-testid="tweet"]');
        tweetId = extractTweetId(article);
        if (!tweetId) {
          // Thử lấy từ link /status/ gần nhất
          const statusLink = img.closest('a[href*="/status/"]') ||
            img.parentElement?.closest('a[href*="/status/"]');
          if (statusLink) {
            const m = statusLink.href.match(/\/status\/(\d+)/);
            if (m) tweetId = m[1];
          }
        }
      }

      if (!tweetId) return;

      const key = `video_thumb_${tweetId}`;
      if (discovered.has(key)) return;
      discovered.add(key);

      found.push({
        type: 'video_placeholder',
        tweetId,
        source: 'dom-video-thumb',
      });
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

  // ─── Extract tweet ID từ URL video (ext_tw_video type) ────────────────────
  function extractTweetIdFromVideoUrl(url) {
    if (!url) return '';
    const m = url.match(/ext_tw_video\/(\d+)/);
    return m ? m[1] : '';
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
          n.tagName === 'VIDEO' ||
          // Phát hiện cell mới trong media grid
          n.querySelector?.('img[src*="video_thumb"]') ||
          n.querySelector?.('img[src*="pbs.twimg.com"]')
        )
      )
    );

    if (hasRelevant) {
      clearTimeout(scanTimeout);
      scanTimeout = setTimeout(scanDOM, 800);
    }
  });

  // An toàn: chờ document.body sẵn sàng
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

  // Scan ngay lần đầu sau khi trang render
  setTimeout(scanDOM, 2000);

  // Expose để content.js có thể gọi thủ công
  window.__scanDOM__ = scanDOM;

})();
