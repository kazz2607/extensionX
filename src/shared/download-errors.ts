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
