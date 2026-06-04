import { MediaItem, Stats, CollectState, DownloadState, PendingHlsRequest, ActiveDownload } from '../types.ts';

export const mediaStore = new Map<string, Map<string, MediaItem>>();
export const dirtyMediaStore = new Map<string, Map<string, MediaItem>>();
export const tabState = new Map<number, CollectState>();
export const statsStore = new Map<string, Stats>();
export const downloadedStore = new Map<string, Set<string>>();
export let downloadState: DownloadState = { inProgress: false };
export const pendingHlsRequests = new Map<string, PendingHlsRequest>();
export const activeDownloads = new Map<number, ActiveDownload>();
export let userCsrfToken = '';
export function setCsrfToken(token: string) { userCsrfToken = token; }
