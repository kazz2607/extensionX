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

export interface ShortcutAction {
  enabled: boolean;
  modifiers: string;   // 'ctrl', 'ctrl+shift', 'alt+shift'
  key: string;         // 'c', 's', 'o', 'g'...
}

export interface ShortcutsOptions {
  enabled: boolean;                   // Master toggle bật/tắt toàn bộ shortcuts
  showToast: boolean;                 // Hiện toast notification sau mỗi action
  copyLink: ShortcutAction;          // S1: Copy liên kết (href <a>) mà ảnh trỏ tới
  downloadMedia: ShortcutAction;     // S2: Tải ảnh đang hover
  copyImageUrl: ShortcutAction;      // S3: Copy URL file ảnh (src)
  openOriginal: ShortcutAction;      // S4: Mở ảnh trong tab mới
  reverseSearch: ShortcutAction;     // S5: Google Lens reverse image search
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
  shortcuts?: ShortcutsOptions;      // Keyboard Shortcuts (v5.5.0)
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

// ─── Feature 0: Following Scroll ────────────────────────────────────────────
export interface FollowingUserEntry {
  username: string;
  displayName: string;
  order: number; // 0 = newest following, high = oldest following
}

export interface FollowingScrollState {
  isScrolling: boolean;
  targetUrl: string;
  scrollCount: number;
  usersFound: number;
  reachedEnd: boolean;
  users: FollowingUserEntry[];
}

