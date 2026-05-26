/**
 * page-interceptor.js
 * Chạy trong PAGE CONTEXT (không phải extension context)
 * để hook window.fetch và bắt media URLs từ GraphQL response của X.com
 */
(function () {
  'use strict';

  // Các GraphQL operation names của X.com chứa media
  const MEDIA_ENDPOINTS = [
    'UserMedia',
    'UserTweets',
    'UserTweetsAndReplies',
    'TweetDetail',
    'HomeTimeline',
    'HomeLatestTimeline',
    'Likes',
    'Bookmarks',
  ];

  // Tránh patch nhiều lần
  if (window.__X_MEDIA_INTERCEPTOR_LOADED__) return;
  window.__X_MEDIA_INTERCEPTOR_LOADED__ = true;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === 'string'
        ? args[0]
        : (args[0]?.url || '');

      const isMediaEndpoint = MEDIA_ENDPOINTS.some(ep =>
        url.includes(`/${ep}?`) || url.includes(`/${ep}/`)
      );

      if (isMediaEndpoint) {
        const clone = response.clone();
        clone.json().then(data => {
          const mediaItems = extractMediaFromGraphQL(data);
          if (mediaItems.length > 0) {
            window.dispatchEvent(new CustomEvent('X_MEDIA_FOUND', {
              detail: { mediaItems, sourceUrl: url }
            }));
          }
        }).catch(() => {/* non-JSON response */});
      }
    } catch (_) { /* không làm gián đoạn request gốc */ }

    return response;
  };

  // ─── Extractors ───────────────────────────────────────────────────────────

  /**
   * Duyệt đệ quy qua GraphQL response để tìm extended_entities / media
   */
  function extractMediaFromGraphQL(data) {
    const results = [];
    const seen = new Set();

    function traverse(obj, depth) {
      if (depth > 20 || !obj || typeof obj !== 'object') return;

      // Tìm tweet legacy object có extended_entities
      if (obj.extended_entities && Array.isArray(obj.extended_entities.media)) {
        obj.extended_entities.media.forEach(media => {
          parseMediaEntity(media, results, seen);
        });
        return; // Không cần duyệt sâu hơn trong nhánh này
      }

      // Tìm trong entities (fallback)
      if (obj.entities?.media && !obj.extended_entities) {
        obj.entities.media.forEach(media => {
          parseMediaEntity(media, results, seen);
        });
      }

      // Tiếp tục duyệt các thuộc tính
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          traverse(val, depth + 1);
        } else if (Array.isArray(val)) {
          val.forEach(item => traverse(item, depth + 1));
        }
      }
    }

    traverse(data, 0);
    return results;
  }

  /**
   * Parse một media entity từ extended_entities.media[]
   */
  function parseMediaEntity(media, results, seen) {
    const type = media.type; // 'photo' | 'video' | 'animated_gif'
    const mediaKey = media.media_key || media.id_str || '';
    const tweetId = media.source_status_id_str || media.source_user_id_str || '';

    if (!type) return;

    if (type === 'photo') {
      let url = media.media_url_https || media.media_url || '';
      if (!url) return;

      // Lấy ảnh chất lượng cao nhất: thêm ?format=jpg&name=orig
      try {
        const u = new URL(url);
        u.searchParams.set('format', 'jpg');
        u.searchParams.set('name', 'orig');
        url = u.toString();
      } catch (_) {
        url = url.replace(/name=\w+/, 'name=orig');
      }

      if (seen.has(url)) return;
      seen.add(url);

      results.push({
        type: 'image',
        url,
        mediaKey,
        tweetId,
        ext: 'jpg',
        width: media.original_info?.width || 0,
        height: media.original_info?.height || 0,
      });

    } else if (type === 'video' || type === 'animated_gif') {
      const variants = media.video_info?.variants || [];

      // Lấy MP4 bitrate cao nhất
      const bestMp4 = variants
        .filter(v => v.content_type === 'video/mp4')
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

      if (!bestMp4 || seen.has(bestMp4.url)) return;
      seen.add(bestMp4.url);

      results.push({
        type: type === 'animated_gif' ? 'gif' : 'video',
        url: bestMp4.url,
        mediaKey,
        tweetId,
        ext: 'mp4',
        bitrate: bestMp4.bitrate || 0,
        duration: media.video_info?.duration_millis || 0,
      });
    }
  }

})();
