import type { MediaItem } from '../types.ts';

export interface MediaQueryCriteria {
  filterType?: 'all' | 'images' | 'videos' | 'gifs';
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date pickers give calendar days ("2026-01-01") in the user's timezone. Parse
 * them as local day boundaries; UTC parsing shifted the range by the offset
 * (a UTC+7 user lost 00:00–07:00 of the first day and gained the next morning).
 */
export function localDayStart(day: string): number {
  const match = DAY_PATTERN.exec(day);
  if (!match) return Date.parse(day) || 0;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

export function localDayEnd(day: string): number {
  const match = DAY_PATTERN.exec(day);
  if (!match) { const parsed = Date.parse(day); return Number.isFinite(parsed) ? parsed : Infinity; }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999).getTime();
}

/** Local calendar day (YYYY-MM-DD), matching the folder rule's local year/month. */
export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The single media filter shared by Download, Picker, count, Estimate, Gallery and ZIP. */
export function createMediaMatcher(criteria: MediaQueryCriteria): (item: MediaItem) => boolean {
  const from = criteria.dateFrom ? localDayStart(criteria.dateFrom) : 0;
  const to = criteria.dateTo ? localDayEnd(criteria.dateTo) : Infinity;
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
