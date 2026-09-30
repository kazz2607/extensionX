import type { MediaItem } from '../types.ts';

export interface DownloadedUrlEntry {
  url: string;
  addedAt: number;
}

/** Persistence boundary used by queue/downloader code and replaceable in tests. */
export interface MediaRepository {
  saveMediaItems(username: string, items: MediaItem[]): Promise<void>;
  getMediaItems(username: string): Promise<MediaItem[]>;
  clearMediaItems(username: string): Promise<void>;
  clearAllMediaItems(): Promise<void>;
  getDownloadedUrls(username: string): Promise<string[]>;
  getDownloadedUrlRecords(username: string): Promise<DownloadedUrlEntry[]>;
  saveDownloadedUrls(username: string, urls: Iterable<string>): Promise<void>;
  pruneDownloadedUrls(username: string, now?: number, maxEntries?: number, ttlMs?: number): Promise<number>;
  clearDownloadedUrls(username: string): Promise<void>;
  clearAllDownloadedUrls(): Promise<void>;
}
