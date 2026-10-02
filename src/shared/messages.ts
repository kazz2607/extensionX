import type { CollectState, DownloadOptions, FollowingCandidate, FollowingScanState, FollowingScrollState, HistoryEntry, JobSchedule, MediaItem, NotificationEvent, QueueExportData, QueueItem, SavedJob, SavedJobInput, Stats, StorageSummary } from '../types.ts';
import type { DownloadEstimate } from './p2-tools.ts';
import type { LocalDiagnostics } from './diagnostics.ts';

export type MessageType =
  | 'MEDIA_FOUND' | 'PAGE_LOADED' | 'GET_MEDIA_COUNT' | 'GET_STATS' | 'GET_ALL_USERNAMES' | 'GET_TAB_STATE'
  | 'CLEAR_MEDIA' | 'START_COLLECTING' | 'STOP_COLLECTING' | 'START_DOWNLOAD' | 'ADD_TO_QUEUE'
  | 'REMOVE_FROM_QUEUE' | 'GET_QUEUE' | 'CLEAR_QUEUE' | 'START_QUEUE' | 'GET_DOWNLOAD_STATE'
  | 'RETRY_QUEUE_ITEM' | 'TOGGLE_QUEUE_PAUSE' | 'REORDER_QUEUE_ITEM'
  | 'QUEUE_BULK_ACTION'
  | 'DIAGNOSTIC_METRIC' | 'EXPORT_LOCAL_DIAGNOSTICS' | 'CLEAR_LOCAL_DIAGNOSTICS' | 'GET_MEDIA_COUNT_FILTERED'
  | 'GET_MEDIA_ITEMS_FILTERED'
  | 'GET_DOWNLOADED_COUNT' | 'CLEAR_DOWNLOADED' | 'CLEAR_ALL_DOWNLOADED' | 'EXPORT_CSV' | 'EXPORT_MANIFEST' | 'DOWNLOAD_TWEET'
  | 'GET_SAVED_SESSION' | 'RESTORE_SESSION' | 'RESTORE_SESSION_CANCEL' | 'STOP_DOWNLOAD' | 'RETRY_FAILED'
  | 'UPDATE_BEARER' | 'UPDATE_QUERY_ID' | 'EXPORT_QUEUE' | 'IMPORT_QUEUE' | 'SHORTCUT_DOWNLOAD'
  | 'START_FOLLOWING_SCROLL' | 'STOP_FOLLOWING_SCROLL' | 'GET_FOLLOWING_SCROLL_STATE' | 'HLS_DONE' | 'TG_DOWNLOAD_MEDIA'
  | 'START_FOLLOWING_SCAN' | 'FOLLOWING_SCAN_PAGE' | 'GET_FOLLOWING_SCAN_STATE' | 'STOP_FOLLOWING_SCAN' | 'START_UNFOLLOW'
  | 'GET_DOWNLOAD_CENTER' | 'GET_SAVED_JOBS' | 'SAVE_SAVED_JOB' | 'DELETE_SAVED_JOB' | 'RUN_SAVED_JOB'
  | 'GET_STORAGE_SUMMARY' | 'PRUNE_STORAGE' | 'CLEAR_PROFILE_STORAGE'
  | 'GET_DOWNLOAD_ESTIMATE' | 'PREVIEW_FOLDER_RULE' | 'GET_GALLERY_PAGE' | 'EXPORT_ERROR_REPORT'
  | 'GET_SCHEDULES' | 'SET_JOB_SCHEDULE' | 'GET_NOTIFICATIONS' | 'MARK_NOTIFICATIONS_READ' | 'DOWNLOAD_ZIP_CHUNKS';

type UsernamePayload = { username: string };
type MediaFilterPayload = UsernamePayload & { filterType?: 'all' | 'images' | 'videos' | 'gifs'; dateFrom?: string; dateTo?: string; keyword?: string };
type EmptyMessageType =
  | 'GET_ALL_USERNAMES' | 'GET_QUEUE' | 'CLEAR_QUEUE' | 'START_QUEUE' | 'GET_DOWNLOAD_STATE'
  | 'EXPORT_LOCAL_DIAGNOSTICS' | 'CLEAR_LOCAL_DIAGNOSTICS' | 'CLEAR_ALL_DOWNLOADED'
  | 'GET_SAVED_SESSION' | 'STOP_DOWNLOAD' | 'RETRY_FAILED' | 'EXPORT_QUEUE'
  | 'STOP_FOLLOWING_SCROLL' | 'GET_FOLLOWING_SCROLL_STATE' | 'GET_DOWNLOAD_CENTER' | 'GET_SAVED_JOBS'
  | 'GET_STORAGE_SUMMARY' | 'PRUNE_STORAGE'
  | 'GET_FOLLOWING_SCAN_STATE' | 'STOP_FOLLOWING_SCAN'
  | 'GET_SCHEDULES' | 'GET_NOTIFICATIONS' | 'MARK_NOTIFICATIONS_READ' | 'EXPORT_ERROR_REPORT';

export type ExtensionMessage =
  | { type: 'MEDIA_FOUND'; payload: { username: string; mediaItems: MediaItem[] } }
  | { type: 'PAGE_LOADED'; payload: { username: string; url: string; isMediaPage: boolean; ct0?: string } }
  | { type: 'GET_MEDIA_COUNT' | 'GET_STATS' | 'GET_TAB_STATE' | 'CLEAR_MEDIA' | 'START_COLLECTING' | 'STOP_COLLECTING' | 'GET_DOWNLOADED_COUNT' | 'CLEAR_DOWNLOADED' | 'EXPORT_MANIFEST' | 'RESTORE_SESSION' | 'RESTORE_SESSION_CANCEL'; payload: UsernamePayload }
  | { type: 'START_DOWNLOAD'; payload: UsernamePayload & { options: DownloadOptions } }
  | { type: 'GET_MEDIA_COUNT_FILTERED' | 'GET_MEDIA_ITEMS_FILTERED'; payload: MediaFilterPayload }
  | { type: 'ADD_TO_QUEUE'; payload: UsernamePayload & { filterType?: string; skipDuplicates?: boolean; keyword?: string } }
  | { type: 'REMOVE_FROM_QUEUE' | 'RETRY_QUEUE_ITEM' | 'TOGGLE_QUEUE_PAUSE'; payload: { id: string } }
  | { type: 'REORDER_QUEUE_ITEM'; payload: { id: string; direction: 'up' | 'down' } }
  | { type: 'QUEUE_BULK_ACTION'; payload: { action: 'retry_errors' | 'pause_selected' | 'resume_selected' | 'clear_completed' | 'undo_clear_completed'; ids?: string[] } }
  | { type: 'EXPORT_CSV'; payload: UsernamePayload & { filterType?: string; offset?: number } }
  | { type: 'DOWNLOAD_TWEET'; payload: { username: string; tweetId: string } }
  | { type: 'UPDATE_BEARER'; payload: { bearer: string } }
  | { type: 'UPDATE_QUERY_ID'; payload: { queryId: string; opName: string } }
  | { type: 'DIAGNOSTIC_METRIC'; payload: { name: string; value: number } }
  | { type: 'IMPORT_QUEUE'; payload: { data: string } }
  | { type: 'SHORTCUT_DOWNLOAD'; payload: { url: string } }
  | { type: 'START_FOLLOWING_SCROLL'; payload: { targetUrl: string } }
  | { type: 'START_FOLLOWING_SCAN'; payload: { targetUrl: string } }
  | { type: 'FOLLOWING_SCAN_PAGE'; payload: { candidates: FollowingCandidate[]; cursor?: string } }
  | { type: 'START_UNFOLLOW'; payload: { ids: string[]; confirmed: true } }
  | { type: 'SAVE_SAVED_JOB'; payload: { job: SavedJobInput } }
  | { type: 'DELETE_SAVED_JOB' | 'RUN_SAVED_JOB'; payload: { id: string } }
  | { type: 'CLEAR_PROFILE_STORAGE'; payload: UsernamePayload }
  | { type: 'GET_DOWNLOAD_ESTIMATE'; payload: MediaFilterPayload & { skipDuplicates?: boolean } }
  | { type: 'PREVIEW_FOLDER_RULE'; payload: UsernamePayload & { template: string } }
  | { type: 'GET_GALLERY_PAGE'; payload: MediaFilterPayload & { offset?: number; limit?: number } }
  | { type: 'SET_JOB_SCHEDULE'; payload: { schedule: { jobId: string; enabled: boolean; intervalMinutes: number } } }
  | { type: 'DOWNLOAD_ZIP_CHUNKS'; payload: MediaFilterPayload & { chunkSize?: number } }
  | { type: 'TG_DOWNLOAD_MEDIA'; payload: { url: string; filename: string; isVideo: boolean } }
  | { type: EmptyMessageType; payload?: Record<never, never> };

export type ParsedRuntimeMessage = ExtensionMessage | {
  type: 'HLS_DONE';
  payload?: never;
  requestId: string;
  dataUrl?: string;
  downloadId?: number;
  error?: string;
};

export interface MessageResponseMap {
  GET_MEDIA_COUNT: { count?: number; error?: string };
  GET_STATS: { stats?: Stats; error?: string };
  GET_ALL_USERNAMES: { usernames: Array<{ username: string; count: number; stats?: Stats }> };
  GET_TAB_STATE: { isCollecting?: boolean; scrollCount?: number; error?: string };
  CLEAR_MEDIA: { ok?: boolean; error?: string };
  START_COLLECTING: { ok?: boolean; error?: string };
  STOP_COLLECTING: { ok?: boolean; error?: string };
  START_DOWNLOAD: { ok?: boolean; error?: string };
  GET_MEDIA_COUNT_FILTERED: { count?: number; error?: string };
  GET_MEDIA_ITEMS_FILTERED: { items?: MediaItem[]; total?: number; truncated?: boolean; error?: string };
  GET_DOWNLOADED_COUNT: { count?: number; error?: string };
  CLEAR_DOWNLOADED: { ok?: boolean; count?: number; error?: string };
  CLEAR_ALL_DOWNLOADED: { ok?: boolean; error?: string };
  DOWNLOAD_TWEET: { ok?: boolean; error?: string };
  GET_SAVED_SESSION: { session: (Partial<CollectState> & { username?: string; stats?: Stats; mediaCount?: number; savedAt?: number }) | null };
  RESTORE_SESSION: { ok?: boolean; count?: number; error?: string };
  RESTORE_SESSION_CANCEL: { ok?: boolean; error?: string };
  GET_QUEUE: { queue: QueueItem[] };
  ADD_TO_QUEUE: { ok?: boolean; queue?: QueueItem[]; error?: string };
  START_QUEUE: { ok?: boolean; error?: string };
  STOP_DOWNLOAD: { ok: boolean; resetQueueItems?: number };
  RETRY_QUEUE_ITEM: { ok: boolean };
  TOGGLE_QUEUE_PAUSE: { ok: boolean };
  REORDER_QUEUE_ITEM: { ok: boolean };
  QUEUE_BULK_ACTION: { ok?: boolean; changed?: number; removed?: QueueItem[]; error?: string };
  REMOVE_FROM_QUEUE: { ok?: boolean; error?: string };
  CLEAR_QUEUE: { ok: boolean };
  GET_DOWNLOAD_STATE: { isDownloading: boolean; phase: string };
  RETRY_FAILED: { ok: boolean };
  EXPORT_LOCAL_DIAGNOSTICS: { diagnostics: LocalDiagnostics };
  CLEAR_LOCAL_DIAGNOSTICS: { ok: boolean };
  EXPORT_CSV: { csv?: string; total?: number; exported?: number; truncated?: boolean; offset?: number; nextOffset?: number | null; error?: string };
  EXPORT_MANIFEST: { json?: string; csv?: string; total?: number; exported?: number; truncated?: boolean; error?: string };
  EXPORT_QUEUE: { ok: boolean; data: QueueExportData };
  IMPORT_QUEUE: { ok?: boolean; added?: number; skipped?: number; error?: string };
  START_FOLLOWING_SCROLL: { ok?: boolean; error?: string };
  STOP_FOLLOWING_SCROLL: { ok: boolean };
  GET_FOLLOWING_SCROLL_STATE: { state: FollowingScrollState };
  START_FOLLOWING_SCAN: { ok?: boolean; state?: FollowingScanState; error?: string };
  FOLLOWING_SCAN_PAGE: { ok: boolean; added?: number };
  GET_FOLLOWING_SCAN_STATE: { state: FollowingScanState };
  STOP_FOLLOWING_SCAN: { ok: boolean };
  START_UNFOLLOW: { ok?: boolean; error?: string };
  GET_DOWNLOAD_CENTER: { schemaVersion: 1; queue: QueueItem[]; jobs: SavedJob[]; history: HistoryEntry[]; download: { isDownloading: boolean; phase: string } };
  GET_SAVED_JOBS: { jobs: SavedJob[] };
  SAVE_SAVED_JOB: { ok?: boolean; job?: SavedJob; error?: string };
  DELETE_SAVED_JOB: { ok?: boolean; error?: string };
  RUN_SAVED_JOB: { ok?: boolean; username?: string; error?: string };
  GET_STORAGE_SUMMARY: { summary?: StorageSummary; error?: string };
  PRUNE_STORAGE: { ok?: boolean; removed?: number; summary?: StorageSummary; error?: string };
  CLEAR_PROFILE_STORAGE: { ok?: boolean; summary?: StorageSummary; error?: string };
  GET_DOWNLOAD_ESTIMATE: { estimate?: DownloadEstimate; error?: string };
  PREVIEW_FOLDER_RULE: { preview?: string; error?: string };
  GET_GALLERY_PAGE: { items?: MediaItem[]; total?: number; offset?: number; nextOffset?: number | null; error?: string };
  EXPORT_ERROR_REPORT: { json?: string; csv?: string; count?: number; error?: string };
  GET_SCHEDULES: { schedules: JobSchedule[] };
  SET_JOB_SCHEDULE: { ok?: boolean; schedule?: JobSchedule; error?: string };
  GET_NOTIFICATIONS: { events: NotificationEvent[] };
  MARK_NOTIFICATIONS_READ: { ok: boolean };
  DOWNLOAD_ZIP_CHUNKS: { ok?: boolean; chunks?: number; files?: number; error?: string };
}

export type ResponseFor<T extends MessageType> = T extends keyof MessageResponseMap
  ? MessageResponseMap[T]
  : unknown;

const MAX_MESSAGE_BYTES = 256_000;
const MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'MEDIA_FOUND', 'PAGE_LOADED', 'GET_MEDIA_COUNT', 'GET_STATS', 'GET_ALL_USERNAMES', 'GET_TAB_STATE',
  'CLEAR_MEDIA', 'START_COLLECTING', 'STOP_COLLECTING', 'START_DOWNLOAD', 'ADD_TO_QUEUE',
  'REMOVE_FROM_QUEUE', 'GET_QUEUE', 'CLEAR_QUEUE', 'START_QUEUE', 'GET_DOWNLOAD_STATE',
  'RETRY_QUEUE_ITEM', 'TOGGLE_QUEUE_PAUSE', 'REORDER_QUEUE_ITEM',
  'QUEUE_BULK_ACTION',
  'DIAGNOSTIC_METRIC', 'EXPORT_LOCAL_DIAGNOSTICS', 'CLEAR_LOCAL_DIAGNOSTICS', 'GET_MEDIA_COUNT_FILTERED',
  'GET_MEDIA_ITEMS_FILTERED',
  'GET_DOWNLOADED_COUNT', 'CLEAR_DOWNLOADED', 'CLEAR_ALL_DOWNLOADED', 'EXPORT_CSV', 'EXPORT_MANIFEST', 'DOWNLOAD_TWEET',
  'GET_SAVED_SESSION', 'RESTORE_SESSION', 'RESTORE_SESSION_CANCEL', 'STOP_DOWNLOAD', 'RETRY_FAILED',
  'UPDATE_BEARER', 'UPDATE_QUERY_ID', 'EXPORT_QUEUE', 'IMPORT_QUEUE', 'SHORTCUT_DOWNLOAD',
  'START_FOLLOWING_SCROLL', 'STOP_FOLLOWING_SCROLL', 'GET_FOLLOWING_SCROLL_STATE', 'HLS_DONE', 'TG_DOWNLOAD_MEDIA',
  'START_FOLLOWING_SCAN', 'FOLLOWING_SCAN_PAGE', 'GET_FOLLOWING_SCAN_STATE', 'STOP_FOLLOWING_SCAN', 'START_UNFOLLOW',
  'GET_DOWNLOAD_CENTER', 'GET_SAVED_JOBS', 'SAVE_SAVED_JOB', 'DELETE_SAVED_JOB', 'RUN_SAVED_JOB',
  'GET_STORAGE_SUMMARY', 'PRUNE_STORAGE', 'CLEAR_PROFILE_STORAGE',
  'GET_DOWNLOAD_ESTIMATE', 'PREVIEW_FOLDER_RULE', 'GET_GALLERY_PAGE', 'EXPORT_ERROR_REPORT',
  'GET_SCHEDULES', 'SET_JOB_SCHEDULE', 'GET_NOTIFICATIONS', 'MARK_NOTIFICATIONS_READ', 'DOWNLOAD_ZIP_CHUNKS',
]);

const PAYLOAD_KEYS: Readonly<Record<MessageType, readonly string[]>> = {
  MEDIA_FOUND: ['username', 'mediaItems', 'sourceUrl', 'pageUrl'],
  PAGE_LOADED: ['username', 'ct0', 'url', 'isMediaPage'],
  GET_MEDIA_COUNT: ['username'], GET_STATS: ['username'], GET_ALL_USERNAMES: [], GET_TAB_STATE: ['username'],
  CLEAR_MEDIA: ['username'], START_COLLECTING: ['username'], STOP_COLLECTING: ['username'],
  START_DOWNLOAD: ['username', 'options'], ADD_TO_QUEUE: ['username', 'filterType', 'skipDuplicates', 'keyword'],
  REMOVE_FROM_QUEUE: ['id'], GET_QUEUE: [], CLEAR_QUEUE: [], START_QUEUE: [], GET_DOWNLOAD_STATE: [],
  RETRY_QUEUE_ITEM: ['id'], TOGGLE_QUEUE_PAUSE: ['id'], REORDER_QUEUE_ITEM: ['id', 'direction'],
  QUEUE_BULK_ACTION: ['action', 'ids'],
  DIAGNOSTIC_METRIC: ['name', 'value'], EXPORT_LOCAL_DIAGNOSTICS: [], CLEAR_LOCAL_DIAGNOSTICS: [],
  GET_MEDIA_COUNT_FILTERED: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword'],
  GET_MEDIA_ITEMS_FILTERED: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword'],
  GET_DOWNLOADED_COUNT: ['username'], CLEAR_DOWNLOADED: ['username'], CLEAR_ALL_DOWNLOADED: [],
  EXPORT_CSV: ['username', 'filterType', 'offset'], EXPORT_MANIFEST: ['username'],
  DOWNLOAD_TWEET: ['tweetId', 'username'], GET_SAVED_SESSION: [], RESTORE_SESSION: ['username'],
  RESTORE_SESSION_CANCEL: ['username'], STOP_DOWNLOAD: [], RETRY_FAILED: [], UPDATE_BEARER: ['bearer'],
  UPDATE_QUERY_ID: ['queryId', 'opName'], EXPORT_QUEUE: [], IMPORT_QUEUE: ['data'], SHORTCUT_DOWNLOAD: ['url'],
  START_FOLLOWING_SCROLL: ['targetUrl'], STOP_FOLLOWING_SCROLL: [], GET_FOLLOWING_SCROLL_STATE: [],
  START_FOLLOWING_SCAN: ['targetUrl'], FOLLOWING_SCAN_PAGE: ['candidates', 'cursor'], GET_FOLLOWING_SCAN_STATE: [], STOP_FOLLOWING_SCAN: [], START_UNFOLLOW: ['ids', 'confirmed'],
  HLS_DONE: [], TG_DOWNLOAD_MEDIA: ['url', 'filename', 'isVideo'],
  GET_DOWNLOAD_CENTER: [], GET_SAVED_JOBS: [], SAVE_SAVED_JOB: ['job'],
  DELETE_SAVED_JOB: ['id'], RUN_SAVED_JOB: ['id'],
  GET_STORAGE_SUMMARY: [], PRUNE_STORAGE: [], CLEAR_PROFILE_STORAGE: ['username'],
  GET_DOWNLOAD_ESTIMATE: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword', 'skipDuplicates'],
  PREVIEW_FOLDER_RULE: ['username', 'template'],
  GET_GALLERY_PAGE: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword', 'offset', 'limit'],
  EXPORT_ERROR_REPORT: [], GET_SCHEDULES: [], SET_JOB_SCHEDULE: ['schedule'], GET_NOTIFICATIONS: [], MARK_NOTIFICATIONS_READ: [],
  DOWNLOAD_ZIP_CHUNKS: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword', 'chunkSize'],
};

/** Cheap boundary check before command-specific validation in the service worker. */
export function parseExtensionMessage(value: unknown): ParsedRuntimeMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !MESSAGE_TYPES.has(candidate.type)) return null;
  const type = candidate.type as MessageType;
  if (type === 'HLS_DONE' && (
    typeof candidate.requestId !== 'string' || candidate.requestId.length < 1 || candidate.requestId.length > 160 ||
    (candidate.dataUrl !== undefined && typeof candidate.dataUrl !== 'string') ||
    (candidate.downloadId !== undefined && (!Number.isInteger(candidate.downloadId) || Number(candidate.downloadId) <= 0)) ||
    (candidate.error !== undefined && (typeof candidate.error !== 'string' || candidate.error.length > 1_000))
  )) return null;
  if (type !== 'HLS_DONE' && PAYLOAD_KEYS[type].length > 0 && candidate.payload === undefined) return null;
  const allowedEnvelopeKeys = type === 'HLS_DONE'
    ? new Set(['type', 'requestId', 'dataUrl', 'downloadId', 'error'])
    : new Set(['type', 'payload']);
  if (Object.keys(candidate).some((key) => !allowedEnvelopeKeys.has(key))) return null;
  if (candidate.payload !== undefined && (candidate.payload === null || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload))) return null;
  if (candidate.payload) {
    const allowedPayloadKeys = new Set(PAYLOAD_KEYS[type]);
    if (Object.keys(candidate.payload as Record<string, unknown>).some((key) => !allowedPayloadKeys.has(key))) return null;
  }
  try {
    // HLS_DONE carries a data URL generated by our own offscreen document and
    // can legitimately be hundreds of MB. Avoid stringifying/copying it here.
    if (type !== 'HLS_DONE' && JSON.stringify(value).length > MAX_MESSAGE_BYTES) return null;
  } catch {
    return null;
  }
  return candidate as unknown as ParsedRuntimeMessage;
}
