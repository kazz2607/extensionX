import type { MediaItem, StorageSummary } from '../types.ts';

export interface DownloadedUrlEntry {
  url: string;
  addedAt: number;
}

/** Persistence boundary used by queue/downloader code and replaceable in tests. */
export interface MediaRepository {
  saveMediaItems(username: string, items: MediaItem[]): Promise<void>;
  getMediaItems(username: string): Promise<MediaItem[]>;
  visitMediaItems(username: string, visitor: (item: MediaItem) => void): Promise<void>;
  pruneMediaItems(username: string, now?: number, maxEntries?: number, ttlMs?: number): Promise<number>;
  clearMediaItems(username: string): Promise<void>;
  clearAllMediaItems(): Promise<void>;
  getDownloadedUrls(username: string): Promise<string[]>;
  getDownloadedUrlRecords(username: string): Promise<DownloadedUrlEntry[]>;
  visitDownloadedUrlRecords(username: string, visitor: (entry: DownloadedUrlEntry) => void): Promise<void>;
  saveDownloadedUrls(username: string, urls: Iterable<string>): Promise<void>;
  pruneDownloadedUrls(username: string, now?: number, maxEntries?: number, ttlMs?: number): Promise<number>;
  clearDownloadedUrls(username: string): Promise<void>;
  clearAllDownloadedUrls(): Promise<void>;
  getStorageSummary(): Promise<StorageSummary>;
}
