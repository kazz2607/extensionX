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
  
  // Lắng nghe yêu cầu lấy video bằng session của user (x-csrf-token)
  if (message.type === 'FETCH_VIDEO_USER_SESSION') {
    const tweetId = message.payload?.tweetId;
    if (!tweetId) {
      sendResponse({ error: 'No tweetId' });
      return true;
    }
    
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]*)/);
    const ct0 = match ? match[1] : '';
    
    if (!ct0) {
      sendResponse({ error: 'Không tìm thấy cookie ct0 (chưa đăng nhập?)' });
      return true;
    }
    
    const url = new URL('https://x.com/i/api/graphql/Vf8sA4N3s0aEqA_aKusEhw/TweetResultByRestId');
    url.searchParams.set('variables', JSON.stringify({
      tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false,
    }));
    url.searchParams.set('features', JSON.stringify({
      creator_subscriptions_tweet_preview_api_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    }));
    
    fetch(url.toString(), {
      headers: {
        'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'x-csrf-token': ct0,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en'
      }
    })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      const tweetResult = data?.data?.tweetResult?.result;
      const legacy = tweetResult?.legacy || tweetResult?.tweet?.legacy;
      const mediaList = legacy?.extended_entities?.media || [];
      
      for (const media of mediaList) {
        if (media.type === 'video' || media.type === 'animated_gif') {
          const variants = media.video_info?.variants || [];
          let bestMp4 = variants
            .filter(v => v.content_type === 'video/mp4')
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

          let isHls = false;
          if (!bestMp4) {
            bestMp4 = variants.find(v => v.content_type === 'application/x-mpegURL');
            if (bestMp4) isHls = true;
          }

          if (bestMp4) {
            sendResponse({
              success: true,
              data: {
                type: isHls ? 'hls' : (media.type === 'animated_gif' ? 'gif' : 'video'),
                url: bestMp4.url,
                mediaKey: media.media_key || media.id_str || tweetId,
                tweetId,
                ext: isHls ? 'm3u8' : 'mp4',
                bitrate: bestMp4.bitrate || 0,
              }
            });
            return;
          }
        }
      }
      sendResponse({ error: 'No video found in GraphQL response' });
    })
    .catch(err => {
      sendResponse({ error: err.message });
    });
    
    return true; // async response
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
