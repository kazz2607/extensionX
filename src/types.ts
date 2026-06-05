export interface MediaItem {
  type: 'image' | 'video' | 'gif' | 'hls' | 'video_placeholder';
  url: string;
  source?: string;
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

export interface CollectState {
  username?: string;
  url?: string;
  isMediaPage?: boolean;
  isCollecting?: boolean;
  scrollCount: number;
  reachedEnd?: boolean;
  ct0?: string;
}

export interface DownloadState {
  inProgress: boolean;
}

export interface PendingHlsRequest {
  resolve: (val: any) => void;
  reject: (err: any) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface ActiveDownload {
  resolve: (id: number) => void;
  reject: (err: Error) => void;
  startTime: number;
  filename: string;
  bytesReceived: number;
  totalBytes: number;
}

export interface Options {
  saveFolder?: string;
  concurrency?: number;
  filenameUsername?: boolean;
  flatUsername?: boolean;
  showSnackbar?: boolean;
  showNotification?: boolean;
  autoScroll?: boolean;
  isMediaPage?: boolean;
  maxScrolls?: number;
  scrollDelay?: number;
  adaptiveScroll?: boolean;
  maxMedia?: number;
  enableBookmarks?: boolean;
  mediaTypes?: {
    images?: boolean;
    videos?: boolean;
    gifs?: boolean;
  };
  smartFilters?: {
    filterAvatars?: boolean;
    filterCardImages?: boolean;
    minImageWidth?: number;
    minImageHeight?: number;
  };
}

export interface QueueExportData {
  _version: string;
  _exportedAt: string;
  queue: QueueItem[];
}

declare global {
  interface Window {
    i18n?: any;
  }
}
