// @ts-nocheck
export interface MediaItem {
  type: 'image' | 'video' | 'gif' | 'hls';
  url: string;
  tweetId?: string;
  ext?: string;
  width?: number;
  height?: number;
  mediaKey?: string;
  tweetText?: string;
  tweetDate?: number | null;
  addedAt?: number;
  username?: string;
}

export interface Stats {
  image: number;
  video: number;
  gif: number;
  hls: number;
}

export interface QueueItem {
  id: string;
  username: string;
  filterType: string;
  skipDuplicates: boolean;
  addedAt: number;
  status: 'waiting' | 'downloading' | 'done' | 'error';
  mediaCount: number;
  result?: any;
}

export interface Options {
  [key: string]: any;
}

declare global {
  interface Window {
    i18n?: any;
  }
}
