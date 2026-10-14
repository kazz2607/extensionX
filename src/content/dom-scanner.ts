/**
 * dom-scanner.js — DOM Fallback Scanner
 * Chạy trong PAGE CONTEXT (MAIN world, bundle content/main-world.ts)
 * Quét DOM tìm img/video elements khi GraphQL intercept không bắt được
 *
 * Kích hoạt khi:
 *   - Người dùng cuộn trang (debounce 500ms)
 *   - MutationObserver phát hiện DOM thay đổi (tweet mới render)
 *
 * P3: Observer chỉ observe primaryColumn (thu hẹp subtree), scroll debounced,
 *     teardown hook cho SPA navigation, Performance.mark/measure quanh scan.
 */

import { onExtensionMessage, sendToExtension } from './page-bridge.ts';
import { onNavigation } from './page-navigation.ts';
import { routeCollectsMedia } from './page-route.ts';

(function () {
  'use strict';

// @ts-ignore
  if (window.__X_DOM_SCANNER_LOADED__) return;
// @ts-ignore
  window.__X_DOM_SCANNER_LOADED__ = true;

  // Tập hợp URL/key đã phát hiện (tránh duplicate). Bounded: a long session on
  // one route must not grow it forever; it is also cleared on navigation.
  // Evict the oldest keys (Set keeps insertion order) instead of clearing
  // everything, which made every visible item look new and re-sent it.
  const DISCOVERED_MAX = 20_000;
  const DISCOVERED_EVICT = 2_000;
  const discovered = new Set<string>();
  function remember(key: string): void {
    if (discovered.size >= DISCOVERED_MAX) {
      let evicted = 0;
      for (const oldest of discovered) {
        discovered.delete(oldest);
        if (++evicted >= DISCOVERED_EVICT) break;
      }
    }
    discovered.add(key);
  }

  // ─── Media Domain Whitelist ─────────────────────────────────────────────────
  const IMAGE_DOMAINS = ['pbs.twimg.com'];
  const VIDEO_DOMAINS = ['video.twimg.com'];

// @ts-ignore
  function isImageUrl(src) {
    return IMAGE_DOMAINS.some(d => src.includes(d)) &&
      !src.includes('profile_images') &&
      !src.includes('profile_banners') &&
      !/\/(?:[^/]*_)?video_thumb\//i.test(src) &&
      !src.includes('emoji');
  }

// @ts-ignore
  function isVideoUrl(src) {
    return VIDEO_DOMAINS.some(d => src.includes(d));
  }

  // ─── Extract media from DOM ─────────────────────────────────────────────────
  function selectAll<T extends Element>(root: ParentNode, selector: string): T[] {
    const nodes = Array.from(root.querySelectorAll<T>(selector));
    if (root instanceof Element && root.matches(selector)) nodes.unshift(root as T);
    return nodes;
  }

  // `root` is a newly-added subtree for observer work. A full-document scan is
  // retained only for initial load and the explicit scroll fallback.
  function scanDOM(root: ParentNode = document) {
    // Home/Explore/etc.: content.ts would drop the results anyway.
    if (!routeCollectsMedia()) return 0;
    // performance.now() deltas only — named marks were never cleared and piled
    // up in X's performance timeline.
    const startedAt = performance.now();
// @ts-ignore
    const found: unknown[] = [];

    // ─── Images: <img> ─────────────────────────────────────────────────────
    selectAll<HTMLImageElement>(root, 'img[src]').forEach(img => {
// @ts-ignore
      const src = img.src || img.getAttribute('src') || '';
      // Cheap raw-src check before any URL parsing for images already seen.
      if (!src || discovered.has(src) || !isImageUrl(src)) return;

      // Nâng chất lượng lên orig (BUG-B FIX: không ép format=jpg — giữ nguyên format gốc PNG/WebP)
      let url = src;
      try {
        const u = new URL(src);
        u.searchParams.set('name', 'orig');
        // Không set format — để server trả format tối ưu theo đuôi file gốc
        url = u.toString();
      } catch (_) {}

      // Remember the raw src only after the normalized URL is handled: when
      // src is already the orig URL both keys are equal.
      if (discovered.has(url)) { remember(src); return; }
      remember(url);
      if (src !== url) remember(src);

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
    selectAll<HTMLVideoElement | HTMLSourceElement>(root, 'video, video source').forEach(el => {
      const article = el.closest('article');
      const tweetId = extractTweetId(article);

      // Ưu tiên 1: Có currentSrc hoặc src thực sự (video đã được load)
// @ts-ignore
      const realSrc = el.currentSrc || el.src || el.getAttribute('src') || '';
      if (realSrc && isVideoUrl(realSrc) && !realSrc.startsWith('blob:')) {
        const baseKey = `video_url_${realSrc.split('?')[0]}`;
        if (!discovered.has(baseKey)) {
          remember(baseKey);
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
      // BUG-G FIX: Chỉ chấp nhận tweetId hợp lệ (≥10 chữ số) — tránh gọi API với ID rỗng
      if (!tweetId || !/^\d{10,}$/.test(tweetId) || discovered.has(`video_${tweetId}`)) return;
      remember(`video_${tweetId}`);

      found.push({
        type: 'video_placeholder', // Sẽ được service-worker phân giải qua Syndication/Guest API
        tweetId: tweetId,
        source: 'dom',
      });
    });

    // ─── Video thumbnails trong media grid ──────────────────────────────────
    // Trên trang /media, X.com hiển thị video bằng <img> thumbnail, không phải <video>
    // URL pattern: pbs.twimg.com/ext_tw_video_thumb/{tweetId}/... hoặc amplify_video_thumb
    selectAll<HTMLImageElement>(root, 'img[src*="video_thumb"]').forEach(img => {
// @ts-ignore
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
// @ts-ignore
            const m = statusLink.href.match(/\/status\/(\d+)/);
            if (m) tweetId = m[1];
          }
        }
      }

      if (!tweetId) return;

      const key = `video_thumb_${tweetId}`;
      if (discovered.has(key)) return;
      remember(key);

      found.push({
        type: 'video_placeholder',
        tweetId,
        source: 'dom-video-thumb',
      });
    });

    if (found.length > 0) {
      sendToExtension('X_MEDIA_FOUND', { mediaItems: found, sourceUrl: 'dom-scanner' });
    }

    // Aggregated performance data only. The isolated content script validates
    // this allowlisted metric before it can reach extension storage.
    sendToExtension('XMD_DIAGNOSTIC_METRIC', { name: 'scan.duration_ms', value: Math.round(performance.now() - startedAt) });

    return found.length;
  }

  // ─── Extract tweet ID từ article element ───────────────────────────────────
// @ts-ignore
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
// @ts-ignore
  function extractTweetIdFromVideoUrl(url) {
    if (!url) return '';
    const m = url.match(/ext_tw_video\/(\d+)/);
    return m ? m[1] : '';
  }


  // ─── P3: Scroll fallback — the observer handles new tweets; a full-document
  // scan while scrolling is only a safety net, at most every 2 seconds.
  const SCROLL_FALLBACK_MS = 2_000;
  let _scrollTimer: ReturnType<typeof setTimeout> | null = null;
  function onScroll() {
    if (_scrollTimer) return;
    _scrollTimer = setTimeout(() => {
      _scrollTimer = null;
      scanDOM(document);
    }, SCROLL_FALLBACK_MS);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ─── MutationObserver: quét khi DOM thay đổi ───────────────────────────────
// @ts-ignore
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  const pendingRoots = new Set<Element>();
  const observer = new MutationObserver((mutations) => {
    if (document.hidden) return;
    sendToExtension('XMD_DIAGNOSTIC_METRIC', { name: 'observer.callback', value: 1 });
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const element = node as Element;
        if (element.tagName === 'ARTICLE' || element.tagName === 'IMG' || element.tagName === 'VIDEO' ||
          element.querySelector?.('article, img[src*="pbs.twimg.com"], video, img[src*="video_thumb"]')) {
          pendingRoots.add(element);
        }
      }
    }

    if (pendingRoots.size > 0) {
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = setTimeout(() => {
        scanTimeout = null;
        const roots = Array.from(pendingRoots);
        pendingRoots.clear();
        roots.forEach(root => scanDOM(root));
      }, 800);
    }
  });

  // P3: Observe subtree thu hẹp — ưu tiên primaryColumn để giảm callback CPU.
  // Fallback về document.body nếu X.com chưa render primaryColumn.
  function getObserveRoot(): Element {
    return document.querySelector('[data-testid="primaryColumn"]') ||
           document.querySelector('main') ||
           document.body;
  }

  function startObserver() {
    const root = getObserveRoot();
    observer.observe(root, { childList: true, subtree: true });
  }

  function handleVisibilityChange() {
    if (!document.hidden) scanDOM(getObserveRoot());
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // An toàn: chờ document.body sẵn sàng
  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  }

  // ─── P3: SPA navigation — rebind observer to the new route's primaryColumn ─
  // URLs seen on the previous route are forgotten so the set stays bounded.
  let rebindTimer: ReturnType<typeof setTimeout> | null = null;
  onNavigation(() => {
    observer.disconnect();
    pendingRoots.clear();
    discovered.clear();
    if (scanTimeout) { clearTimeout(scanTimeout); scanTimeout = null; }
    if (rebindTimer) clearTimeout(rebindTimer);
    // Give X a moment to swap the route's DOM before observing it.
    rebindTimer = setTimeout(() => {
      rebindTimer = null;
      startObserver();
      scanDOM(getObserveRoot());
    }, 300);
  });

  // Scan ngay lần đầu sau khi trang render
  setTimeout(scanDOM, 2000);

  // content.ts asks for a scan after each auto-scroll step.
  onExtensionMessage('XMD_SCAN_DOM', () => { scanDOM(document); });

})();
