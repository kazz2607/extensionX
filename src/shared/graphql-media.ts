/**
 * graphql-media.ts — đọc media từ JSON GraphQL của X (chạy trong MAIN world
 * qua page-interceptor). Tách khỏi page-interceptor để đo hiệu năng và test.
 */

/** Phần JSON GraphQL của X mà parser đọc tới; mọi trường đều có thể thiếu. */
interface GraphqlMedia {
  type?: string;
  id_str?: string;
  media_key?: string;
  source_status_id_str?: string;
  media_url_https?: string;
  media_url?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { variants?: RawVideoVariant[] };
}
interface GraphqlNode {
  [key: string]: unknown;
  id_str?: string;
  full_text?: string;
  favorite_count?: unknown;
  extended_entities?: { media?: unknown };
  entities?: { media?: unknown };
}

/**
 * P21: nhánh không bao giờ chứa media của tweet — hồ sơ người dùng (lặp lại ở
 * mọi tweet của timeline) và card preview (ảnh card vốn bị loại). Không đi
 * xuống các nhánh này giảm phần lớn số node phải duyệt trên main thread.
 */
export const GRAPHQL_SKIP_KEYS: ReadonlySet<string> = new Set(['user_results', 'card']);

const MAX_DEPTH = 35;

/** Biến thể video theo cả hai dạng X dùng: GraphQL (`content_type`/`url`) và Syndication (`type`/`src`). */
export interface RawVideoVariant { type?: string; content_type?: string; src?: string; url?: string; bitrate?: number }

export interface PickedVideoVariant {
  url: string;
  isHls: boolean;
  bitrate: number;
  /** F3b: URL mp4 chất lượng thấp hơn, giảm dần, để thử lại khi bản cao lỗi. */
  lower: string[];
}

/** F3b: giữ tối đa chừng này mức thấp hơn (X thường có 3–4 mức mp4). */
export const MAX_LOWER_VARIANTS = 4;

/**
 * Chọn mp4 bitrate cao nhất (không có mp4 thì playlist HLS) và giữ các mp4 thấp
 * hơn. Dùng chung cho interceptor trang và mọi lớp tra video ở service worker,
 * để cùng một video luôn chọn cùng một URL.
 */
export function pickVideoVariant(variants: readonly RawVideoVariant[]): PickedVideoVariant | null {
  const urlOf = (v: RawVideoVariant) => v.src || v.url || '';
  const mp4 = variants
    .filter((v) => (v.type === 'video/mp4' || v.content_type === 'video/mp4') && urlOf(v))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (mp4.length) {
    const url = urlOf(mp4[0]);
    const lower = [...new Set(mp4.slice(1).map(urlOf))].filter((candidate) => candidate !== url).slice(0, MAX_LOWER_VARIANTS);
    return { url, isHls: false, bitrate: mp4[0].bitrate || 0, lower };
  }
  const hls = variants.find((v) => v.type === 'application/x-mpegURL' || v.content_type === 'application/x-mpegURL' || urlOf(v).includes('.m3u8'));
  return hls && urlOf(hls) ? { url: urlOf(hls), isHls: true, bitrate: hls.bitrate || 0, lower: [] } : null;
}

function getImageExt(url: string): string {
  const m = url.match(/\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

/** Duyệt đệ quy `value`, đẩy media tìm được vào `results` theo thứ tự gặp. */
export function extractMediaFromResponse(value: unknown, results: unknown[], skipKeys: ReadonlySet<string> = GRAPHQL_SKIP_KEYS, depth = 0): void {
  if (depth > MAX_DEPTH || !value || typeof value !== 'object') return;
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
        const picked = pickVideoVariant(media.video_info?.variants || []);
        if (picked) {
          results.push({
            type: picked.isHls ? 'hls' : (type === 'animated_gif' ? 'gif' : 'video'),
            url: picked.url,
            tweetId,
            mediaKey: media.media_key || media.id_str || tweetId,
            ext: picked.isHls ? 'm3u8' : 'mp4',
            tweetText: obj.full_text || '',
            likeCount,
            ...(picked.lower.length ? { variants: picked.lower } : {}),
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
            width: media.original_info?.width || 0,
            height: media.original_info?.height || 0,
            mediaKey: media.media_key || media.id_str || tweetId,
            tweetText: obj.full_text || '',
            likeCount,
          });
        }
      }
    });
  }

  for (const key in obj) {
    if (skipKeys.has(key)) continue;
    const child = obj[key];
    if (child !== null && typeof child === 'object') {
      extractMediaFromResponse(child, results, skipKeys, depth + 1);
    }
  }
}
