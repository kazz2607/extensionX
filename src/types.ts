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
  // TS-03: Typed result thay vì any
  result?: {
    success: number;
    failed: number;
    total: number;
    skipped: number;
    error?: string;
  } | null;
}

// TS-01: DownloadOptions interface — dùng trong downloader.ts startDownload() và downloadSingleItem()
export interface DownloadOptions {
  filterType?: 'all' | 'images' | 'videos' | 'gifs';
  skipDuplicates?: boolean;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  // Filename options
  flatUsername?: boolean;
  filenameUsername?: boolean;
  saveFolder?: string;
  // Performance options
  concurrency?: number;
  // UI options
  showSnackbar?: boolean;
  // Internal queue tracking
  _fromQueue?: boolean;
  _queueId?: string;
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
  // FEAT-08: Smart Auto-Stop — tự dừng khi không có media mới sau N scroll
  autoStop?: boolean;                 // Bật/tắt tính năng (mặc định: false)
  autoStopAfter?: number;             // Số scroll không có media mới thì dừng (mặc định: 10)
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
  bio: string;   // mô tả profile (có thể chứa “Tài khoản giễu nhại”)
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

