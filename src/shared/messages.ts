import type { MediaItem } from '../types.ts';

export type MessageType =
  | 'MEDIA_FOUND' | 'PAGE_LOADED' | 'GET_MEDIA_COUNT' | 'GET_STATS' | 'GET_ALL_USERNAMES' | 'GET_TAB_STATE'
  | 'CLEAR_MEDIA' | 'START_COLLECTING' | 'STOP_COLLECTING' | 'START_DOWNLOAD' | 'ADD_TO_QUEUE'
  | 'REMOVE_FROM_QUEUE' | 'GET_QUEUE' | 'CLEAR_QUEUE' | 'START_QUEUE' | 'GET_DOWNLOAD_STATE'
  | 'DIAGNOSTIC_METRIC' | 'EXPORT_LOCAL_DIAGNOSTICS' | 'CLEAR_LOCAL_DIAGNOSTICS' | 'GET_MEDIA_COUNT_FILTERED'
  | 'GET_MEDIA_ITEMS_FILTERED'
  | 'GET_DOWNLOADED_COUNT' | 'CLEAR_DOWNLOADED' | 'CLEAR_ALL_DOWNLOADED' | 'EXPORT_CSV' | 'DOWNLOAD_TWEET'
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
  [key: string]: any;
}

const MAX_MESSAGE_BYTES = 256_000;
const MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'MEDIA_FOUND', 'PAGE_LOADED', 'GET_MEDIA_COUNT', 'GET_STATS', 'GET_ALL_USERNAMES', 'GET_TAB_STATE',
  'CLEAR_MEDIA', 'START_COLLECTING', 'STOP_COLLECTING', 'START_DOWNLOAD', 'ADD_TO_QUEUE',
  'REMOVE_FROM_QUEUE', 'GET_QUEUE', 'CLEAR_QUEUE', 'START_QUEUE', 'GET_DOWNLOAD_STATE',
  'DIAGNOSTIC_METRIC', 'EXPORT_LOCAL_DIAGNOSTICS', 'CLEAR_LOCAL_DIAGNOSTICS', 'GET_MEDIA_COUNT_FILTERED',
  'GET_MEDIA_ITEMS_FILTERED',
  'GET_DOWNLOADED_COUNT', 'CLEAR_DOWNLOADED', 'CLEAR_ALL_DOWNLOADED', 'EXPORT_CSV', 'DOWNLOAD_TWEET',
  'GET_SAVED_SESSION', 'RESTORE_SESSION', 'RESTORE_SESSION_CANCEL', 'STOP_DOWNLOAD', 'RETRY_FAILED',
  'UPDATE_BEARER', 'UPDATE_QUERY_ID', 'EXPORT_QUEUE', 'IMPORT_QUEUE', 'SHORTCUT_DOWNLOAD',
  'START_FOLLOWING_SCROLL', 'STOP_FOLLOWING_SCROLL', 'GET_FOLLOWING_SCROLL_STATE', 'HLS_DONE', 'TG_DOWNLOAD_MEDIA',
]);

/** Cheap boundary check before command-specific validation in the service worker. */
export function parseExtensionMessage(value: unknown): ParsedRuntimeMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !MESSAGE_TYPES.has(candidate.type)) return null;
  if (candidate.payload !== undefined && (candidate.payload === null || typeof candidate.payload !== 'object' || Array.isArray(candidate.payload))) return null;
  if (candidate.payload && Object.keys(candidate.payload as Record<string, unknown>).length > 30) return null;
  try {
    if (JSON.stringify(value).length > MAX_MESSAGE_BYTES) return null;
  } catch {
    return null;
  }
  return candidate as ParsedRuntimeMessage;
}
