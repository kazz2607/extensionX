import type { MediaItem } from '../types.ts';

export type MessageType =
  | 'MEDIA_FOUND' | 'PAGE_LOADED' | 'GET_MEDIA_COUNT' | 'GET_STATS' | 'GET_ALL_USERNAMES' | 'GET_TAB_STATE'
  | 'CLEAR_MEDIA' | 'START_COLLECTING' | 'STOP_COLLECTING' | 'START_DOWNLOAD' | 'ADD_TO_QUEUE'
  | 'REMOVE_FROM_QUEUE' | 'GET_QUEUE' | 'CLEAR_QUEUE' | 'START_QUEUE' | 'GET_DOWNLOAD_STATE'
  | 'RETRY_QUEUE_ITEM' | 'TOGGLE_QUEUE_PAUSE' | 'REORDER_QUEUE_ITEM'
  | 'DIAGNOSTIC_METRIC' | 'EXPORT_LOCAL_DIAGNOSTICS' | 'CLEAR_LOCAL_DIAGNOSTICS' | 'GET_MEDIA_COUNT_FILTERED'
  | 'GET_MEDIA_ITEMS_FILTERED'
  | 'GET_DOWNLOADED_COUNT' | 'CLEAR_DOWNLOADED' | 'CLEAR_ALL_DOWNLOADED' | 'EXPORT_CSV' | 'EXPORT_MANIFEST' | 'DOWNLOAD_TWEET'
  | 'GET_SAVED_SESSION' | 'RESTORE_SESSION' | 'RESTORE_SESSION_CANCEL' | 'STOP_DOWNLOAD' | 'RETRY_FAILED'
  | 'UPDATE_BEARER' | 'UPDATE_QUERY_ID' | 'EXPORT_QUEUE' | 'IMPORT_QUEUE' | 'SHORTCUT_DOWNLOAD'
  | 'START_FOLLOWING_SCROLL' | 'STOP_FOLLOWING_SCROLL' | 'GET_FOLLOWING_SCROLL_STATE' | 'HLS_DONE' | 'TG_DOWNLOAD_MEDIA';

export type ExtensionMessage =
  | { type: 'MEDIA_FOUND'; payload: { username: string; mediaItems: MediaItem[] } }
  | { type: 'PAGE_LOADED'; payload: { username: string; url: string; isMediaPage: boolean; ct0?: string } }
  | { type: 'START_COLLECTING' | 'STOP_COLLECTING' | 'START_DOWNLOAD'; payload: { username: string } }
  | { type: 'DOWNLOAD_TWEET'; payload: { username: string; tweetId: string } }
  | { type: 'UPDATE_BEARER'; payload: { bearer: string } }
  | { type: 'UPDATE_QUERY_ID'; payload: { queryId: string; opName: string } }
  | { type: 'DIAGNOSTIC_METRIC'; payload: { name: string; value: number } }
  | { type: 'TG_DOWNLOAD_MEDIA'; payload: { url: string; filename: string; isVideo: boolean } }
  | { type: Exclude<MessageType, 'MEDIA_FOUND' | 'PAGE_LOADED' | 'START_COLLECTING' | 'STOP_COLLECTING' | 'START_DOWNLOAD' | 'DOWNLOAD_TWEET' | 'UPDATE_BEARER' | 'UPDATE_QUERY_ID' | 'DIAGNOSTIC_METRIC' | 'TG_DOWNLOAD_MEDIA'>; payload?: Record<string, unknown>; [key: string]: unknown };

/** Compatibility envelope while message handlers migrate to the union above. */
export interface ParsedRuntimeMessage {
  type: MessageType;
  payload?: any;
  requestId?: string;
  dataUrl?: string;
  error?: string;
}

const MAX_MESSAGE_BYTES = 256_000;
const MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'MEDIA_FOUND', 'PAGE_LOADED', 'GET_MEDIA_COUNT', 'GET_STATS', 'GET_ALL_USERNAMES', 'GET_TAB_STATE',
  'CLEAR_MEDIA', 'START_COLLECTING', 'STOP_COLLECTING', 'START_DOWNLOAD', 'ADD_TO_QUEUE',
  'REMOVE_FROM_QUEUE', 'GET_QUEUE', 'CLEAR_QUEUE', 'START_QUEUE', 'GET_DOWNLOAD_STATE',
  'RETRY_QUEUE_ITEM', 'TOGGLE_QUEUE_PAUSE', 'REORDER_QUEUE_ITEM',
  'DIAGNOSTIC_METRIC', 'EXPORT_LOCAL_DIAGNOSTICS', 'CLEAR_LOCAL_DIAGNOSTICS', 'GET_MEDIA_COUNT_FILTERED',
  'GET_MEDIA_ITEMS_FILTERED',
  'GET_DOWNLOADED_COUNT', 'CLEAR_DOWNLOADED', 'CLEAR_ALL_DOWNLOADED', 'EXPORT_CSV', 'EXPORT_MANIFEST', 'DOWNLOAD_TWEET',
  'GET_SAVED_SESSION', 'RESTORE_SESSION', 'RESTORE_SESSION_CANCEL', 'STOP_DOWNLOAD', 'RETRY_FAILED',
  'UPDATE_BEARER', 'UPDATE_QUERY_ID', 'EXPORT_QUEUE', 'IMPORT_QUEUE', 'SHORTCUT_DOWNLOAD',
  'START_FOLLOWING_SCROLL', 'STOP_FOLLOWING_SCROLL', 'GET_FOLLOWING_SCROLL_STATE', 'HLS_DONE', 'TG_DOWNLOAD_MEDIA',
]);

const PAYLOAD_KEYS: Readonly<Record<MessageType, readonly string[]>> = {
  MEDIA_FOUND: ['username', 'mediaItems', 'sourceUrl', 'pageUrl'],
  PAGE_LOADED: ['username', 'ct0', 'url', 'isMediaPage'],
  GET_MEDIA_COUNT: ['username'], GET_STATS: ['username'], GET_ALL_USERNAMES: [], GET_TAB_STATE: ['username'],
  CLEAR_MEDIA: ['username'], START_COLLECTING: ['username'], STOP_COLLECTING: ['username'],
  START_DOWNLOAD: ['username', 'options'], ADD_TO_QUEUE: ['username', 'filterType', 'skipDuplicates', 'keyword'],
  REMOVE_FROM_QUEUE: ['id'], GET_QUEUE: [], CLEAR_QUEUE: [], START_QUEUE: [], GET_DOWNLOAD_STATE: [],
  RETRY_QUEUE_ITEM: ['id'], TOGGLE_QUEUE_PAUSE: ['id'], REORDER_QUEUE_ITEM: ['id', 'direction'],
  DIAGNOSTIC_METRIC: ['name', 'value'], EXPORT_LOCAL_DIAGNOSTICS: [], CLEAR_LOCAL_DIAGNOSTICS: [],
  GET_MEDIA_COUNT_FILTERED: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword'],
  GET_MEDIA_ITEMS_FILTERED: ['username', 'filterType', 'dateFrom', 'dateTo', 'keyword'],
  GET_DOWNLOADED_COUNT: ['username'], CLEAR_DOWNLOADED: ['username'], CLEAR_ALL_DOWNLOADED: [],
  EXPORT_CSV: ['username', 'filterType', 'offset'], EXPORT_MANIFEST: ['username'],
  DOWNLOAD_TWEET: ['tweetId', 'username'], GET_SAVED_SESSION: [], RESTORE_SESSION: ['username'],
  RESTORE_SESSION_CANCEL: ['username'], STOP_DOWNLOAD: [], RETRY_FAILED: [], UPDATE_BEARER: ['bearer'],
  UPDATE_QUERY_ID: ['queryId', 'opName'], EXPORT_QUEUE: [], IMPORT_QUEUE: ['data'], SHORTCUT_DOWNLOAD: ['url'],
  START_FOLLOWING_SCROLL: ['targetUrl'], STOP_FOLLOWING_SCROLL: [], GET_FOLLOWING_SCROLL_STATE: [],
  HLS_DONE: [], TG_DOWNLOAD_MEDIA: ['url', 'filename', 'isVideo'],
};

/** Cheap boundary check before command-specific validation in the service worker. */
export function parseExtensionMessage(value: unknown): ParsedRuntimeMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !MESSAGE_TYPES.has(candidate.type)) return null;
  const type = candidate.type as MessageType;
  const allowedEnvelopeKeys = type === 'HLS_DONE'
    ? new Set(['type', 'requestId', 'dataUrl', 'error'])
    : new Set(['type', 'payload']);
  if (Object.keys(candidate).some((key) => !allowedEnvelopeKeys.has(key))) return null;
  if (candidate.payload !== undefined && (candidate.payload === null || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload))) return null;
  if (candidate.payload) {
    const allowedPayloadKeys = new Set(PAYLOAD_KEYS[type]);
    if (Object.keys(candidate.payload as Record<string, unknown>).some((key) => !allowedPayloadKeys.has(key))) return null;
  }
  try {
    if (JSON.stringify(value).length > MAX_MESSAGE_BYTES) return null;
  } catch {
    return null;
  }
  return candidate as unknown as ParsedRuntimeMessage;
}
