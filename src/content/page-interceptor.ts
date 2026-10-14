import { parseFollowingGraphqlPage } from '../shared/following-scanner.ts';

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

import { sendToExtension } from './page-bridge.ts';
import { routeCollectsMedia } from './page-route.ts';

/** Phần JSON GraphQL của X mà parser đọc tới; mọi trường đều có thể thiếu. */
interface GraphqlVariant { content_type?: string; bitrate?: number; url?: string }
interface GraphqlMedia {
  type?: string;
  id_str?: string;
  media_key?: string;
  source_status_id_str?: string;
  media_url_https?: string;
  media_url?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { variants?: GraphqlVariant[] };
}
interface GraphqlNode {
  [key: string]: unknown;
  id_str?: string;
  full_text?: string;
  favorite_count?: unknown;
  extended_entities?: { media?: unknown };
  entities?: { media?: unknown };
}

(function () {
  'use strict';

  // Tránh khởi tạo nhiều lần
  if (window.__XMD_PAGE_INTERCEPTOR__) return;
  window.__XMD_PAGE_INTERCEPTOR__ = true;

  // Tập hợp URL đã xử lý (dedup theo base URL không có query string)
  const seenUrls = new Set<string>();

  // ─── Extract Tweet ID từ URL video ──────────────────────────────────────────
  function extractTweetIdFromUrl(url: string) {
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
          const link = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
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
  function notifyVideoUrl(rawUrl: unknown) {
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

    sendToExtension('X_MEDIA_FOUND', {
        mediaItems: [mediaItem],
        sourceUrl: 'page-interceptor',
      });
  }

  // ─── P1: Adaptive Speed Tracker ───────────────────────────────────────────────
  const recentDurations: number[] = [];
  function reportResponseTime(duration: number) {
    if (duration > 30000) return; // Bỏ qua nếu bất thường (>30s)
    recentDurations.push(duration);
    if (recentDurations.length > 5) recentDurations.shift();
    const sum = recentDurations.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / recentDurations.length);
    sendToExtension('X_ADAPTIVE_SPEED', { avgResponseTime: avg });
  }

  // ─── SEC-04: Capture Authorization header từ API requests của X.com ────────
  function captureBearer(url: string, init?: RequestInit) {
    if (!url.includes('api.twitter.com') && !url.includes('api.x.com') && !url.includes('x.com/i/api')) return;
    try {
      let authHeader = '';
      const h = init?.headers;
      if (h instanceof Headers) {
        authHeader = h.get('authorization') || '';
      } else if (h && typeof h === 'object') {
        authHeader = (h as Record<string, string>)['authorization'] || (h as Record<string, string>)['Authorization'] || '';
      }
      if (authHeader.startsWith('Bearer ')) {
        sendToExtension('XMD_BEARER_TOKEN', { bearer: authHeader });
      }
    } catch (_) {}
  }

  // ─── Dynamic Query ID Capture ─────────────────────────────────────────────
  // X.com tự gọi GraphQL với hash đúng → ta capture từ URL của chính họ.
  // Các operation names thường chứa video info: TweetResultByRestId, TweetDetail,
  // TweetDetailOriginal, UserTweets, HomeTimeline...
  const GRAPHQL_OPS_WITH_MEDIA = [
    'TweetResultByRestId',
    'TweetDetail',
    'TweetDetailOriginal',
    'UserMedia',
    'UserTweets',
    'UserTweetsAndReplies',
    'HomeTimeline',
    'HomeLatestTimeline',
    'Likes',
    'Bookmarks',
  ];

  const _capturedQueryIds: Record<string, string> = {};

  function captureQueryId(url: string) {
    // URL pattern: /graphql/{queryId}/{OperationName}
    try {
      const m = url.match(/\/graphql\/([A-Za-z0-9_-]{20,})\/([\w]+)/);
      if (!m) return;
      const queryId = m[1];
      const opName  = m[2];
      if (GRAPHQL_OPS_WITH_MEDIA.includes(opName) && _capturedQueryIds[opName] !== queryId) {
        _capturedQueryIds[opName] = queryId;
        sendToExtension('XMD_QUERY_ID', { queryId, opName });
      }
    } catch (_) {}
  }

  // Captured before JSON.parse is hooked below so our own parsing never walks a
  // response a second time through the hook.
  const nativeParse = JSON.parse;
  // Media is only kept on profile/likes/bookmarks routes (content.ts drops it
  // elsewhere), so routeCollectsMedia() skips parsing Home, Explore, DM and
  // notification traffic.

  // ─── 1. Hook window.fetch ────────────────────────────────────────────────────
  const _originalFetch = window.fetch;
  window.fetch = async function (this: typeof globalThis, ...args: Parameters<typeof fetch>) {
    const [resource, init] = args;
    let url = '';
    const startTime = Date.now();
    try {
      if (typeof resource === 'string') url = resource;
      else if (resource instanceof URL) url = resource.href;
      else if (resource instanceof Request) url = resource.url;
      notifyVideoUrl(url);
      captureBearer(url, init); // SEC-04
      captureQueryId(url);      // Dynamic query ID
    } catch (_) {}
    
    const response = await _originalFetch.apply(this, args);
    const duration = Date.now() - startTime;
    
    // Intercept ALL GraphQL JSON responses
    try {
      if (url.includes('/graphql/')) {
        reportResponseTime(duration);
        const isFollowing = /\/graphql\/[A-Za-z0-9_-]+\/(Following|FollowingUsers)/.test(url);
        const wantsMedia = routeCollectsMedia();
        if (!isFollowing && !wantsMedia) return response;
        const clone = response.clone();
        clone.json().then(data => {
          if (isFollowing) {
            const page = parseFollowingGraphqlPage(data);
            if (page.candidates.length > 0) {
              sendToExtension('XMD_FOLLOWING_PAGE', page);
            }
          }
          if (!wantsMedia) return;
          const mediaItems: unknown[] = [];
          extractMediaFromResponse(data, mediaItems);
          if (mediaItems.length > 0) {
            sendToExtension('X_MEDIA_FOUND', { mediaItems, sourceUrl: 'graphql-fetch' });
          }
        }).catch(()=>{});
      }
    } catch (_) {}
    
    return response;
  };

  // ─── Helper: Lấy extension ảnh từ URL ──────────────────────────────────────
  function getImageExt(url: string) {
    const m = url.match(/\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : 'jpg';
  }

  // ─── Helper: Parse JSON GraphQL tìm video ─────────────────────────────────────
  function extractMediaFromResponse(value: unknown, results: unknown[], depth = 0) {
    if (depth > 35 || !value || typeof value !== 'object') return;
    const obj = value as GraphqlNode;

    const mediaList = (obj.extended_entities && Array.isArray(obj.extended_entities.media))
      ? obj.extended_entities.media
      : ((obj.entities && Array.isArray(obj.entities.media)) ? obj.entities.media : null);

    if (mediaList && Array.isArray(mediaList)) {
      (mediaList as GraphqlMedia[]).forEach(media => {
        if (!media || typeof media !== 'object') return;
        const type = media.type;
        const tweetId = media.source_status_id_str || obj.id_str || media.id_str || '';
        // F2: số like nằm trên cùng object tweet (không cần request thêm), nhưng chỉ
        // đúng khi media thuộc chính tweet này — media của tweet gốc được chia sẻ lại
        // (source_status_id_str khác) thì số like của tweet bọc ngoài là sai.
        const ownMedia = !media.source_status_id_str || media.source_status_id_str === obj.id_str;
        const likeCount = ownMedia && typeof obj.favorite_count === 'number' && Number.isSafeInteger(obj.favorite_count) && obj.favorite_count >= 0 ? obj.favorite_count : undefined;
        if (type === 'video' || type === 'animated_gif') {
          const variants = media.video_info?.variants || [];
          let bestMp4: GraphqlVariant | undefined = variants
            .filter(v => v.content_type === 'video/mp4')
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

          let isHls = false;
          if (!bestMp4) {
            bestMp4 = variants.find(v => v.content_type === 'application/x-mpegURL');
            if (bestMp4) isHls = true;
          }

          if (bestMp4) {
            results.push({
              type: isHls ? 'hls' : (type === 'animated_gif' ? 'gif' : 'video'),
              url: bestMp4.url,
              tweetId,
              mediaKey: media.media_key || media.id_str || tweetId,
              ext: isHls ? 'm3u8' : 'mp4',
              tweetText: obj.full_text || '',
              likeCount,
            });
          }
        } else if (type === 'photo') {
           let photoUrl = media.media_url_https || media.media_url;
           if (photoUrl) {
             // Pre-filter: bỏ qua avatar, banner, card preview ngay tại nguồn
             if (
               photoUrl.includes('/profile_images/') ||
               photoUrl.includes('/profile_banners/') ||
               photoUrl.includes('/card_img/')
             ) return;

             photoUrl = photoUrl.replace(/name=\w+/, 'name=orig');
             results.push({
               type: 'image',
               url: photoUrl,
               tweetId,
               ext: getImageExt(photoUrl),
               width:    media.original_info?.width  || 0,
               height:   media.original_info?.height || 0,
               mediaKey: media.media_key || media.id_str || tweetId,
               tweetText: obj.full_text || '',
               likeCount,
             });
           }
        }
      });
    }

    // Đệ quy
    for (const child of Object.values(obj)) {
      if (child !== null && typeof child === 'object') {
        extractMediaFromResponse(child, results, depth + 1);
      }
    }
  }

  // ─── 2. Hook XMLHttpRequest ──────────────────────────────────────────────────
  // URL theo từng XHR, giữ ngoài object để trang không đọc/sửa được.
  const xhrUrls = new WeakMap<XMLHttpRequest, string>();
  const _originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: [string, string | URL, boolean?, (string | null)?, (string | null)?]) {
    try { 
      const urlStr = String(args[1] || '');
      xhrUrls.set(this, urlStr);
      notifyVideoUrl(urlStr);
      captureQueryId(urlStr); // Dynamic query ID
    } catch (_) {}
    return _originalXhrOpen.apply(this, args as Parameters<XMLHttpRequest['open']>);
  };

  const _originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest['send']>) {
    const startTime = Date.now();
    this.addEventListener('load', function() {
      const duration = Date.now() - startTime;
      try {
        const url = xhrUrls.get(this) || this.responseURL || '';
        if (url.includes('/graphql/')) {
          reportResponseTime(duration);
          if (!routeCollectsMedia()) return;
          const data = nativeParse(this.responseText);
          const mediaItems: unknown[] = [];
          extractMediaFromResponse(data, mediaItems);
          if (mediaItems.length > 0) {
            sendToExtension('X_MEDIA_FOUND', { mediaItems, sourceUrl: 'graphql-xhr' });
          }
        }
      } catch (_) {}
    });
    return _originalXhrSend.apply(this, args);
  };

  // ─── 3. Theo dõi video elements (phát hiện src/currentSrc trực tiếp) ─────────
  function watchVideoElement(videoEl: HTMLVideoElement) {
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
        if (!(node instanceof Element)) continue; // Chỉ xử lý Element nodes
        if (node instanceof HTMLVideoElement) {
          watchVideoElement(node);
        } else {
          node.querySelectorAll('video').forEach(watchVideoElement);
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

  // ─── 5. Hook JSON.parse ──────────────────────────────────────────────────────
  // Every media object (entities and extended_entities) carries media_url_https,
  // so one substring scan replaces the previous five per parsed string.
  JSON.parse = function(text, reviver) {
    const result = nativeParse(text, reviver);
    try {
      if (typeof text === 'string' && text.length > 200 && routeCollectsMedia() && text.includes('media_url_https')) {
        const mediaItems: unknown[] = [];
        extractMediaFromResponse(result, mediaItems);
        if (mediaItems.length > 0) {
          sendToExtension('X_MEDIA_FOUND', { mediaItems, sourceUrl: 'json-interceptor' });
        }
      }
    } catch (_) {}
    return result;
  };

})();
