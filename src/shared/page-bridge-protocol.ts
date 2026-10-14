/**
 * Private channel between the MAIN-world page scripts and the isolated content
 * script on X. Window CustomEvents could be read and forged by any script on
 * x.com; a transferred MessagePort cannot. Both ends run at document_start,
 * before any page script: the content script posts the port immediately and
 * the MAIN world keeps the first port it sees, so a page-posted port can only
 * ever arrive after ours and is ignored.
 */

export const BRIDGE_KEY = '__xmdBridge';

export type BridgeHandshake = 'port';

/** Page (MAIN world) → content script. */
export const PAGE_TO_EXTENSION = [
  'X_MEDIA_FOUND',
  'XMD_DIAGNOSTIC_METRIC',
  'XMD_FAB_ACTION',
  'XMD_BEARER_TOKEN',
  'XMD_QUERY_ID',
  'XMD_FOLLOWING_PAGE',
  'XMD_TWEET_DOWNLOAD',
  'X_ADAPTIVE_SPEED',
  'XMD_NAVIGATED',
] as const;

/** Content script → page (MAIN world). */
export const EXTENSION_TO_PAGE = [
  'XMD_FAB_UPDATE',
  'XMD_TWEET_BTN_UPDATE',
  'XMD_SNACKBAR_UPDATE',
  'XMD_LANG_UPDATE',
  'XMD_SCAN_DOM',
] as const;

export type PageToExtensionType = typeof PAGE_TO_EXTENSION[number];
export type ExtensionToPageType = typeof EXTENSION_TO_PAGE[number];
export type BridgeType = PageToExtensionType | ExtensionToPageType;

export interface BridgeMessage<T extends string = BridgeType> {
  type: T;
  detail: unknown;
}

/** Messages queued before the port is connected are capped to bound memory. */
export const BRIDGE_PENDING_LIMIT = 200;

export function isBridgeHandshake(data: unknown, kind: BridgeHandshake): boolean {
  return Boolean(data) && typeof data === 'object' && (data as Record<string, unknown>)[BRIDGE_KEY] === kind;
}

export function parseBridgeMessage<T extends string>(data: unknown, allowed: readonly T[]): BridgeMessage<T> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { type, detail } = data as { type?: unknown; detail?: unknown };
  if (typeof type !== 'string' || !(allowed as readonly string[]).includes(type)) return null;
  return { type: type as T, detail };
}
