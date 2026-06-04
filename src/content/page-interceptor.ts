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
// @ts-ignore
  if (window.__XMD_PAGE_INTERCEPTOR__) return;
// @ts-ignore
  window.__XMD_PAGE_INTERCEPTOR__ = true;

  // Tập hợp URL đã xử lý (dedup theo base URL không có query string)
  const seenUrls = new Set();

  // ─── Extract Tweet ID từ URL video ──────────────────────────────────────────
// @ts-ignore
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
// @ts-ignore
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
// @ts-ignore
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

  // ─── P1: Adaptive Speed Tracker ───────────────────────────────────────────────
// @ts-ignore
  const recentDurations = [];
// @ts-ignore
  function reportResponseTime(duration) {
    if (duration > 30000) return; // Bỏ qua nếu bất thường (>30s)
    recentDurations.push(duration);
// @ts-ignore
    if (recentDurations.length > 5) recentDurations.shift();
// @ts-ignore
    const sum = recentDurations.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / recentDurations.length);
    window.dispatchEvent(new CustomEvent('X_ADAPTIVE_SPEED', {
      detail: { avgResponseTime: avg }
    }));
  }

  // ─── 1. Hook window.fetch ────────────────────────────────────────────────────
  const _originalFetch = window.fetch;
  window.fetch = async function (resource, init) {
    let url = '';
    const startTime = Date.now();
    try {
      if (typeof resource === 'string') url = resource;
      else if (resource instanceof URL) url = resource.href;
      else if (resource instanceof Request) url = resource.url;
      notifyVideoUrl(url);
    } catch (_) {}
    
// @ts-ignore
    const response = await _originalFetch.apply(this, arguments);
    const duration = Date.now() - startTime;
    
    // Intercept ALL GraphQL JSON responses
    try {
      if (url.includes('/graphql/')) {
        reportResponseTime(duration);
        const clone = response.clone();
        clone.json().then(data => {
// @ts-ignore
          const mediaItems = [];
// @ts-ignore
          extractMediaFromResponse(data, mediaItems);
          if (mediaItems.length > 0) {
            window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
// @ts-ignore
              detail: { mediaItems, sourceUrl: 'graphql-fetch' }
            }));
          }
        }).catch(()=>{});
      }
    } catch (_) {}
    
    return response;
  };

  // ─── Helper: Lấy extension ảnh từ URL ──────────────────────────────────────
// @ts-ignore
  function getImageExt(url) {
    const m = url.match(/\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : 'jpg';
  }

  // ─── Helper: Parse JSON GraphQL tìm video ─────────────────────────────────────
// @ts-ignore
  function extractMediaFromResponse(obj, results, depth = 0) {
    if (depth > 35 || !obj || typeof obj !== 'object') return;

    if (obj.extended_entities && Array.isArray(obj.extended_entities.media)) {
// @ts-ignore
      obj.extended_entities.media.forEach(media => {
        const type = media.type;
        const tweetId = media.source_status_id_str || media.id_str || '';
        if (type === 'video' || type === 'animated_gif') {
          const variants = media.video_info?.variants || [];
          let bestMp4 = variants
// @ts-ignore
            .filter(v => v.content_type === 'video/mp4')
// @ts-ignore
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

          let isHls = false;
          if (!bestMp4) {
// @ts-ignore
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
              tweetText: obj.full_text || ''
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
             });
           }
        }
      });
    }

    // Đệ quy
    for (const key of Object.keys(obj)) {
      if (obj[key] !== null && typeof obj[key] === 'object') {
        extractMediaFromResponse(obj[key], results, depth + 1);
      }
    }
  }

  // ─── 2. Hook XMLHttpRequest ──────────────────────────────────────────────────
  const _originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { 
      const urlStr = String(url || '');
// @ts-ignore
      this._interceptUrl = urlStr;
      notifyVideoUrl(urlStr); 
    } catch (_) {}
// @ts-ignore
    return _originalXhrOpen.apply(this, arguments);
  };

  const _originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    const startTime = Date.now();
    this.addEventListener('load', function() {
      const duration = Date.now() - startTime;
      try {
// @ts-ignore
        const url = this._interceptUrl || this.responseURL || '';
        if (url.includes('/graphql/')) {
          reportResponseTime(duration);
          const text = this.responseText;
          const data = JSON.parse(text);
// @ts-ignore
          const mediaItems = [];
// @ts-ignore
          extractMediaFromResponse(data, mediaItems);
          if (mediaItems.length > 0) {
            window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
// @ts-ignore
              detail: { mediaItems, sourceUrl: 'graphql-xhr' }
            }));
          }
        }
      } catch (_) {}
    });
// @ts-ignore
    return _originalXhrSend.apply(this, arguments);
  };

  // ─── 3. Theo dõi video elements (phát hiện src/currentSrc trực tiếp) ─────────
// @ts-ignore
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
// @ts-ignore
        if (node.tagName === 'VIDEO') {
          watchVideoElement(node);
        } else {
// @ts-ignore
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

  // ─── 5. Hook JSON.parse ──────────────────────────────────────────────────────
  const _originalParse = JSON.parse;
  JSON.parse = function(text, reviver) {
    const result = _originalParse(text, reviver);
    try {
      if (typeof text === 'string' && text.includes('extended_entities')) {
// @ts-ignore
        const mediaItems = [];
// @ts-ignore
        extractMediaFromResponse(result, mediaItems);
        if (mediaItems.length > 0) {
          window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
// @ts-ignore
            detail: { mediaItems, sourceUrl: 'json-interceptor' }
          }));
        }
      }
    } catch (_) {}
    return result;
  };

})();
