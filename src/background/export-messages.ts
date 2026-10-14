import type { DomainMessageHandler } from './message-handler.ts';
import { isValidUsername } from '../shared/validation.ts';
import { buildCSV, buildManifest } from './downloader.ts';
import { exportQueue, importQueue } from './queue.ts';
import { clearLocalDiagnostics, exportLocalDiagnostics } from './diagnostics.ts';
import { t } from '../lib/i18n.ts';

export const handleExportMessage: DomainMessageHandler = (message, _sender, sendResponse) => {
  const { type, payload } = message;
  switch (type) {
    case 'EXPORT_LOCAL_DIAGNOSTICS':
      void exportLocalDiagnostics().then((diagnostics) => sendResponse({ diagnostics }));
      return true;
    case 'CLEAR_LOCAL_DIAGNOSTICS':
      void clearLocalDiagnostics().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    case 'EXPORT_CSV':
      void (async () => {
        if (!isValidUsername(payload?.username) || (payload.filterType !== undefined && !['all', 'images', 'videos', 'gifs'].includes(payload.filterType)) ||
          (payload.offset !== undefined && (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.offset > 1_000_000))) {
          sendResponse({ error: 'Invalid CSV request' }); return;
        }
        sendResponse(await buildCSV(payload.username, payload.filterType, payload.offset || 0));
      })();
      return true;
    case 'EXPORT_MANIFEST':
      void (async () => {
        if (!isValidUsername(payload?.username)) { sendResponse({ error: t('bg_err_invalid_username') }); return; }
        sendResponse(await buildManifest(payload.username));
      })();
      return true;
    case 'EXPORT_QUEUE':
      sendResponse({ ok: true, data: exportQueue() });
      return true;
    case 'IMPORT_QUEUE':
      try {
        if (typeof payload?.data !== 'string' || payload.data.length > 200_000) {
          sendResponse({ error: t('bg_err_queue_file_invalid') }); return false;
        }
        const parsed = JSON.parse(payload.data) as { queue?: unknown[] };
        if (!Array.isArray(parsed.queue)) { sendResponse({ error: t('bg_err_queue_file_missing_array') }); return true; }
        const result = importQueue(parsed.queue);
        sendResponse(result.error ? { error: result.error } : { ok: true, ...result });
      } catch (err) {
        sendResponse({ error: t('bg_err_queue_parse', { detail: err instanceof Error ? err.message : String(err) }) });
      }
      return true;
    default:
      return undefined;
  }
};
