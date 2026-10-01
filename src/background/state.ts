import { MediaItem, Stats, CollectState, PendingHlsRequest, ActiveDownload } from '../types.ts';
import { DownloadCoordinator } from '../shared/download-coordinator.ts';
import { selectCacheEvictions } from '../shared/bounded-cache.ts';

export const mediaStore = new Map<string, Map<string, MediaItem>>();
export const dirtyMediaStore = new Map<string, Map<string, MediaItem>>();
export const tabState = new Map<number, CollectState>();
export const statsStore = new Map<string, Stats>();
export const downloadedStore = new Map<string, Set<string>>();
export const downloadCoordinator = new DownloadCoordinator();
export const pendingHlsRequests = new Map<string, PendingHlsRequest>();
export const activeDownloads = new Map<number, ActiveDownload>();
const mediaCacheAccess = new Map<string, number>();
export const MEDIA_CACHE_MAX_PROFILES = 3;
export const MEDIA_CACHE_MAX_ITEMS = 50_000;

export function touchMediaCache(username: string): void {
  mediaCacheAccess.set(username, Date.now());
}

export function trimMediaCache(): string[] {
  const collecting = new Set([...tabState.values()].filter((state) => state.isCollecting).map((state) => state.username));
  const activeUsername = downloadCoordinator.username;
  const evicted = selectCacheEvictions(
    [...mediaStore].map(([key, value]) => ({
      key, size: value.size, lastAccess: mediaCacheAccess.get(key) ?? 0,
      protected: key === activeUsername || collecting.has(key) || (dirtyMediaStore.get(key)?.size ?? 0) > 0,
    })),
    MEDIA_CACHE_MAX_PROFILES,
    MEDIA_CACHE_MAX_ITEMS,
  );
  for (const username of evicted) {
    mediaStore.delete(username);
    mediaCacheAccess.delete(username);
  }
  return evicted;
}
export let userCsrfToken = '';
export function setCsrfToken(token: string) { userCsrfToken = token; }
