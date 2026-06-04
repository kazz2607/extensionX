// @ts-nocheck
/**
 * tweet-api.js — Lấy URL video từ tweet bằng multi-layer approach
 *
 * Layer 1: Syndication API — ổn định, không cần guest token, không bị rate limit nặng
 * Layer 2: Guest GraphQL API — fallback khi Syndication API fail
 *
 * Lưu ý: Layer 0 là page-interceptor.js (chạy trong page context),
 * bắt URL video trực tiếp khi X.com phát — đây là cách tốt nhất.
 * File này xử lý trường hợp video chưa được phát (user chưa click xem).
 */

const GUEST_BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

let cachedGuestToken = null;
let guestTokenTime = 0;

// ─── S3: Token Bucket Rate Limiter (20 calls/phút) ───────────────────────────────────
const RATE_BUCKET = {
  tokens: 20,
  max: 20,
  lastRefill: Date.now(),
  refillMs: 3000,  // 1 token mỗi 3 giây = 20 tokens/phút
};

async function acquireRateToken() {
  const now = Date.now();
  const elapsed = now - RATE_BUCKET.lastRefill;
  const refilled = Math.floor(elapsed / RATE_BUCKET.refillMs);
  if (refilled > 0) {
    RATE_BUCKET.tokens = Math.min(RATE_BUCKET.max, RATE_BUCKET.tokens + refilled);
    RATE_BUCKET.lastRefill = now - (elapsed % RATE_BUCKET.refillMs);
  }
  if (RATE_BUCKET.tokens > 0) {
    RATE_BUCKET.tokens--;
    return;
  }
  // Hết token → đợi đến khi có token mới
  const waitMs = RATE_BUCKET.refillMs - (now - RATE_BUCKET.lastRefill);
  await new Promise(r => setTimeout(r, waitMs + 50));
  return acquireRateToken();
}

// ─── Syndication Token Formula ────────────────────────────────────────────────
// Token = (Number(tweetId) / 1e15 * Math.PI).toString(36).replace(/(0+|\.)/g, '')
// LƯU Ý QUAN TRỌNG: KHÔNG dùng BigInt. 
// JavaScript Number(tweetId) sẽ bị mất precision cho các ID dài 19 số, 
// nhưng Twitter thiết kế token generator dựa trên CHÍNH lỗi mất precision đó!
function getSyndicationToken(tweetId) {
  return (Number(tweetId) / 1e15 * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

// ─── Layer 1: Syndication API ─────────────────────────────────────────────────
async function fetchVideoViaSyndication(tweetId) {
  await acquireRateToken(); // S3: Rate limit
  const token = getSyndicationToken(tweetId);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;

  const res = await fetch(url);

  if (!res.ok) throw new Error(`Syndication API HTTP ${res.status}`);

  const data = await res.json();

  // Response trống hoặc tweet bị xoá
  if (!data || Object.keys(data).length === 0) {
    throw new Error('Syndication API returned empty response');
  }

  // ─── Parse video từ response ────────────────────────────────────────────────
  // Cấu trúc 1: data.video.variants (field `type` và `src`)
  const videoVariants = data.video?.variants || [];
  // Cấu trúc 2: data.mediaDetails[].video_info.variants (field `content_type` và `url`)
  const mediaDetails = data.mediaDetails || [];

  let variants = [];
  let isGif = false;

  if (videoVariants.length > 0) {
    variants = videoVariants;
    isGif = data.video?.isGif === true;
  } else if (mediaDetails.length > 0) {
    for (const media of mediaDetails) {
      if (media.type === 'video' || media.type === 'animated_gif') {
        variants = media.video_info?.variants || [];
        isGif = media.type === 'animated_gif';
        break;
      }
    }
  }

  if (!variants.length) throw new Error('No video variants found in syndication response');

  // Tìm MP4 chất lượng cao nhất
  let bestMp4 = variants
    .filter(v => (v.type === 'video/mp4') || (v.content_type === 'video/mp4'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  let isHls = false;
  if (!bestMp4) {
    bestMp4 = variants.find(v =>
      v.type === 'application/x-mpegURL' ||
      v.content_type === 'application/x-mpegURL' ||
      (v.src || v.url || '').includes('.m3u8')
    );
    if (bestMp4) isHls = true;
  }

  if (!bestMp4) throw new Error('No suitable video variant found');

  const videoUrl = bestMp4.src || bestMp4.url;
  if (!videoUrl) throw new Error('Video URL is empty');

  return {
    type: isHls ? 'hls' : (isGif ? 'gif' : 'video'),
    url: videoUrl,
    mediaKey: data.id_str || tweetId,
    tweetId,
    ext: isHls ? 'm3u8' : 'mp4',
    bitrate: bestMp4.bitrate || 0,
  };
}

// ─── Layer 2: Guest GraphQL API ───────────────────────────────────────────────
async function getGuestToken() {
  if (cachedGuestToken && Date.now() - guestTokenTime < 1000 * 60 * 60) {
    return cachedGuestToken;
  }

  const res = await fetch('https://api.x.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: {
      'authorization': GUEST_BEARER,
      'content-type': 'application/json',
    },
  });

  if (!res.ok) throw new Error(`Guest token HTTP ${res.status}`);

  const data = await res.json();
  if (!data.guest_token) throw new Error('No guest_token in response');

  cachedGuestToken = data.guest_token;
  guestTokenTime = Date.now();
  return cachedGuestToken;
}

async function fetchVideoViaGuestAPI(tweetId) {
  await acquireRateToken(); // S3: Rate limit
  const gt = await getGuestToken();

  const variables = {
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  };

  const features = {
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
  };

  const url = new URL('https://api.x.com/graphql/Vf8sA4N3s0aEqA_aKusEhw/TweetResultByRestId');
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set('features', JSON.stringify(features));

  const res = await fetch(url.toString(), {
    headers: {
      'authorization': GUEST_BEARER,
      'x-guest-token': gt,
      'content-type': 'application/json',
      'accept': '*/*',
    },
  });

  if (!res.ok) {
    if (res.status === 429) cachedGuestToken = null; // reset token nếu bị rate limit
    throw new Error(`Guest GraphQL HTTP ${res.status}`);
  }

  const data = await res.json();

  const tweetResult = data?.data?.tweetResult?.result;
  if (!tweetResult) throw new Error('No tweetResult in GraphQL response');

  const legacy = tweetResult.legacy || tweetResult.tweet?.legacy;
  if (!legacy) throw new Error('No legacy in tweetResult');

  const mediaList = legacy.extended_entities?.media || [];

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
        return {
          type: isHls ? 'hls' : (media.type === 'animated_gif' ? 'gif' : 'video'),
          url: bestMp4.url,
          mediaKey: media.media_key || media.id_str || tweetId,
          tweetId,
          ext: isHls ? 'm3u8' : 'mp4',
          bitrate: bestMp4.bitrate || 0,
        };
      }
    }
  }

  throw new Error('No video found in tweet media');
}

// ─── Main Export: Thử từng layer theo thứ tự ─────────────────────────────────
export async function fetchVideoForTweet(tweetId, userCsrfToken = '') {
  // Layer 0: User Session API (nếu có ct0)
  // Thực hiện trong Service Worker nên bypass CORS (không bị lỗi 404 OPTIONS preflight)
  if (userCsrfToken) {
    try {
      await acquireRateToken(); // S3: Rate limit
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

      const res = await fetch(url.toString(), {
        credentials: 'include', // Kích hoạt gửi HttpOnly Cookie (auth_token)
        headers: {
          'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
          'x-csrf-token': userCsrfToken,
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-client-language': 'en'
        }
      });
      
      if (res.ok) {
        const data = await res.json();
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
              console.log(`[tweet-api] ✓ User Session API thành công cho tweet ${tweetId}`);
              return {
                type: isHls ? 'hls' : (media.type === 'animated_gif' ? 'gif' : 'video'),
                url: bestMp4.url,
                mediaKey: media.media_key || media.id_str || tweetId,
                tweetId,
                ext: isHls ? 'm3u8' : 'mp4',
                bitrate: bestMp4.bitrate || 0,
              };
            }
          }
        }
      } else if (res.status === 403) {
        // S1: Token ct0 bị stale → báo cho SW biết để tự refresh
        throw new Error('CSRF_STALE');
      } else {
        console.warn(`[tweet-api] ⚠ User Session API fail (HTTP ${res.status})`);
      }
    } catch (e) {
      console.warn(`[tweet-api] ⚠ User Session API lỗi: ${e.message}`);
    }
  }

  // Layer 1: Syndication API (ổn định, không cần auth)
  try {
    const result = await fetchVideoViaSyndication(tweetId);
    if (result) {
      console.log(`[tweet-api] ✓ Syndication API thành công cho tweet ${tweetId}`);
      return result;
    }
  } catch (err) {
    console.warn(`[tweet-api] Syndication API fail (${err.message}), thử Guest API...`);
  }

  // Layer 2: Guest GraphQL API (fallback)
  try {
    const result = await fetchVideoViaGuestAPI(tweetId);
    if (result) {
      console.log(`[tweet-api] ✓ Guest API thành công cho tweet ${tweetId}`);
      return result;
    }
  } catch (err) {
    console.warn(`[tweet-api] Guest API fail (${err.message})`);
  }

  return null;
}
