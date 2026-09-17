import type { MediaItem, Options } from '../types.ts';

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
    if (filterAvatars && (item.url.includes('/profile_images/') || item.url.includes('/profile_banners/'))) return false;
    if (filterCardImages && item.url.includes('/card_img/')) return false;
    if (minImageWidth > 0 && (item.width ?? 0) > 0 && (item.width ?? 0) < minImageWidth) return false;
    if (minImageHeight > 0 && (item.height ?? 0) > 0 && (item.height ?? 0) < minImageHeight) return false;
    return true;
  });
  const maxMedia = options.maxMedia ?? 0;
  return maxMedia <= 0 ? filtered : filtered.slice(0, Math.max(0, maxMedia - currentCount));
}
