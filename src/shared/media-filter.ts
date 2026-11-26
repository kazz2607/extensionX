import type { MediaItem, Options } from '../types.ts';

/** X video poster URLs are previews, not standalone profile images. */
export function isVideoThumbnailUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === 'pbs.twimg.com' && /\/(?:[^/]*_)?video_thumb\//i.test(pathname);
  } catch {
    return /\/(?:[^/]*_)?video_thumb\//i.test(url);
  }
}

/**
 * F6: URL media của một thread — các tweet cùng hội thoại do chính tác giả viết
 * (bỏ trả lời của người khác). Hội thoại lấy từ media của tweet đang mở; tweet
 * đó không có media thì coi như đang mở tweet đầu thread (id hội thoại = id tweet).
 * Media của chính tweet đang mở luôn được tính, kể cả khi chỉ thấy qua DOM.
 */
export function selectThreadMediaUrls(items: Iterable<MediaItem>, author: string, focalTweetId: string): string[] {
  const list = [...items].filter((item) => item.type !== 'video_placeholder' && !(item.type === 'image' && isVideoThumbnailUrl(item.url)));
  const conversationId = list.find((item) => item.tweetId === focalTweetId && item.conversationId)?.conversationId ?? focalTweetId;
  const handle = author.toLowerCase();
  return list
    .filter((item) => item.tweetId === focalTweetId
      || (item.conversationId === conversationId && item.authorHandle?.toLowerCase() === handle))
    .map((item) => item.url);
}

/** A side-effect-free version of the collection filter, usable in regression tests. */
export function filterMediaItems(items: readonly MediaItem[], options: Options, currentCount = 0): MediaItem[] {
  const mediaTypes = options.mediaTypes ?? {};
  const smartFilters = options.smartFilters ?? {};
  const filterAvatars = smartFilters.filterAvatars !== false;
  const filterCardImages = smartFilters.filterCardImages !== false;
  const minImageWidth = smartFilters.minImageWidth && smartFilters.minImageWidth > 0 ? smartFilters.minImageWidth : 0;
  const minImageHeight = smartFilters.minImageHeight && smartFilters.minImageHeight > 0 ? smartFilters.minImageHeight : 0;
  const filtered = items.filter((item) => {
    if (item.type === 'image' && mediaTypes.images === false) return false;
    if (item.type === 'gif' && mediaTypes.gifs === false) return false;
    if ((item.type === 'video' || item.type === 'hls') && mediaTypes.videos === false) return false;
    if (item.type !== 'image') return true;
    if (isVideoThumbnailUrl(item.url)) return false;
    if (filterAvatars && (item.url.includes('/profile_images/') || item.url.includes('/profile_banners/'))) return false;
    if (filterCardImages && item.url.includes('/card_img/')) return false;
    if (minImageWidth > 0 && (item.width ?? 0) > 0 && (item.width ?? 0) < minImageWidth) return false;
    if (minImageHeight > 0 && (item.height ?? 0) > 0 && (item.height ?? 0) < minImageHeight) return false;
    return true;
  });
  const maxMedia = options.maxMedia ?? 0;
  return maxMedia <= 0 ? filtered : filtered.slice(0, Math.max(0, maxMedia - currentCount));
}
