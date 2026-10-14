import { registerTranslations, t } from '../lib/i18n.ts';
import { SHARED_UI_STRINGS } from '../lib/i18n/background.ts';

registerTranslations(SHARED_UI_STRINGS);

// Error messages can contain signed media URLs, query strings, or server output.
// Only expose a short, stable explanation to extension UI.
export function formatDownloadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/cancelled/i.test(raw)) return t('shared_err_cancelled');
  if (/HLS download timeout|Batch timeout|Download timeout/i.test(raw)) return t('shared_err_timeout');
  if (/No valid HLS stream|No segments|HLS playlist/i.test(raw)) return t('shared_err_hls');
  const http = raw.match(/HTTP\s*(\d{3})/i);
  if (http) return t('shared_err_http', { status: http[1] });
  if (/interrupted/i.test(raw)) return t('shared_err_interrupted');
  if (/untrusted download URL/i.test(raw)) return t('shared_err_untrusted_url');
  return t('shared_err_generic');
}

/** F3: nguyên nhân lỗi dạng mã máy đọc được, dùng để nhóm/lọc trong Download Center. */
export type DownloadErrorReason =
  | 'not_found' | 'forbidden' | 'rate_limited' | 'timeout' | 'network' | 'server' | 'hls' | 'cancelled' | 'other';

export const DOWNLOAD_ERROR_REASONS: readonly DownloadErrorReason[] = [
  'not_found', 'forbidden', 'rate_limited', 'timeout', 'network', 'server', 'hls', 'cancelled', 'other',
];

/**
 * Chạy song song với formatDownloadError (giữ nguyên câu hiển thị). Nhận cả lỗi
 * HTTP từ fetch (HLS/ZIP: "HTTP 404") lẫn mã ngắt của chrome.downloads
 * (SERVER_BAD_CONTENT ~ 404, SERVER_FORBIDDEN ~ 403, NETWORK_*).
 */
export function categorizeDownloadError(error: unknown): DownloadErrorReason {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/cancel/i.test(raw)) return 'cancelled';
  const status = Number(raw.match(/HTTP\s*(\d{3})/i)?.[1] ?? 0);
  if (status === 429 || /too many requests|rate.?limit/i.test(raw)) return 'rate_limited';
  if (status === 404 || status === 410 || /SERVER_BAD_CONTENT|FILE_NOT_FOUND/.test(raw)) return 'not_found';
  if (status === 401 || status === 403 || /SERVER_FORBIDDEN|SERVER_UNAUTHORIZED/.test(raw)) return 'forbidden';
  if (/timeout|timed out|stalled/i.test(raw)) return 'timeout';
  if (/No valid HLS stream|No segments|HLS playlist|HLS download/i.test(raw)) return 'hls';
  if (/NETWORK_|interrupted|Failed to fetch/i.test(raw)) return 'network';
  // 5xx (hoặc SERVER_FAILED chưa rõ mã) là lỗi phía server, thử lại sau thường được.
  if ((status >= 500 && status < 600) || /SERVER_FAILED/.test(raw)) return 'server';
  return 'other';
}
