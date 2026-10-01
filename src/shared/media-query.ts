import type { MediaItem } from '../types.ts';

export interface MediaQueryCriteria {
  filterType?: 'all' | 'images' | 'videos' | 'gifs';
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
}

export function createMediaMatcher(criteria: MediaQueryCriteria): (item: MediaItem) => boolean {
  const from = criteria.dateFrom ? new Date(criteria.dateFrom).getTime() : 0;
  const to = criteria.dateTo ? new Date(`${criteria.dateTo}T23:59:59Z`).getTime() : Infinity;
  const keyword = criteria.keyword?.trim().toLowerCase() ?? '';
  return (item) => {
    if (criteria.filterType === 'images' && item.type !== 'image') return false;
    if (criteria.filterType === 'videos' && item.type !== 'video' && item.type !== 'hls') return false;
    if (criteria.filterType === 'gifs' && item.type !== 'gif') return false;
    const date = item.tweetDate ?? 0;
    if (date < from || date > to) return false;
    return !keyword || (item.tweetText ?? '').toLowerCase().includes(keyword);
  };
}

export function collectMediaMatches(
  items: Iterable<MediaItem>,
  criteria: MediaQueryCriteria,
  limit = Infinity,
): { items: MediaItem[]; total: number } {
  const matches = createMediaMatcher(criteria);
  const selected: MediaItem[] = [];
  let total = 0;
  for (const item of items) {
    if (!matches(item)) continue;
    total++;
    if (selected.length < limit) selected.push(item);
  }
  return { items: selected, total };
}
