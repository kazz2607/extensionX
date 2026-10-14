import { parseSavedJobInput } from '../shared/saved-jobs.ts';
import type { DomainMessageHandler } from './message-handler.ts';
import { downloadCoordinator } from './state.ts';
import { retryFailedItems, startDownload } from './downloader.ts';
import { clearFailedItems, listFailedItems } from './failed-items.ts';
import { FAILED_ITEMS_MAX } from '../shared/failed-items.ts';
import { loadPersistedQueue, profileQueue } from './queue.ts';
import { deleteSavedJob, getSavedJob, listSavedJobs, saveSavedJob } from './saved-jobs.ts';
import { removeSchedule } from './p2-messages.ts';
import { listDownloadHistory } from './download-history.ts';
import { t } from '../lib/i18n.ts';

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

/** id mục lỗi = `${username}_${url}`; chỉ nhận mảng chuỗi có giới hạn, null nếu sai dạng. */
function parseFailedItemIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > FAILED_ITEMS_MAX) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 9_000)) return null;
  return value as string[];
}
export const handleDownloadCenterMessage: DomainMessageHandler = (message, _sender, sendResponse) => {
  const { type, payload } = message;
  switch (type) {
    case 'GET_DOWNLOAD_CENTER':
      void (async () => {
        await loadPersistedQueue();
        const [jobs, history] = await Promise.all([
          listSavedJobs(),
          listDownloadHistory(),
        ]);
        sendResponse({
          schemaVersion: 1,
          queue: profileQueue,
          jobs,
          history,
          download: { isDownloading: downloadCoordinator.isBusy, phase: downloadCoordinator.phase },
        });
      })();
      return true;
    case 'GET_FAILED_ITEMS':
      void listFailedItems().then((items) => sendResponse({ items }), () => sendResponse({ items: [] }));
      return true;
    case 'RETRY_FAILED_ITEMS': {
      const ids = parseFailedItemIds(payload?.ids);
      if (!ids || ids.length === 0) { sendResponse({ ok: false, error: t('bg_err_no_failed_selected') }); return false; }
      void retryFailedItems(ids).then(sendResponse, (error: unknown) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    case 'CLEAR_FAILED_ITEMS': {
      const ids = payload?.ids === undefined ? undefined : parseFailedItemIds(payload.ids);
      if (ids === null) { sendResponse({ ok: false, error: t('bg_err_no_failed_selected') }); return false; }
      void clearFailedItems(ids).then((removed) => sendResponse({ ok: true, removed }), (error: unknown) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    case 'GET_SAVED_JOBS':
      void listSavedJobs().then((jobs) => sendResponse({ jobs }));
      return true;
    case 'SAVE_SAVED_JOB': {
      const input = parseSavedJobInput(payload?.job);
      if (!input) { sendResponse({ error: t('bg_err_saved_job_invalid') }); return false; }
      void saveSavedJob(input).then((job) => sendResponse(job ? { ok: true, job } : { error: t('bg_err_saved_job_limit') }));
      return true;
    }
    case 'DELETE_SAVED_JOB': {
      const id = payload?.id;
      if (typeof id !== 'string' || !JOB_ID_PATTERN.test(id)) { sendResponse({ error: 'Invalid saved job id' }); return false; }
      void deleteSavedJob(id)
        .then(async (ok) => { await removeSchedule(id).catch(() => {}); sendResponse({ ok }); })
        .catch((error: unknown) => sendResponse({ error: error instanceof Error ? error.message : 'Delete failed' }));
      return true;
    }
    case 'RUN_SAVED_JOB': {
      const id = payload?.id;
      if (typeof id !== 'string' || !JOB_ID_PATTERN.test(id)) { sendResponse({ error: 'Invalid saved job id' }); return false; }
      if (downloadCoordinator.isBusy) { sendResponse({ error: t('bg_err_download_running') }); return false; }
      void (async () => {
        const job = await getSavedJob(id);
        if (!job) { sendResponse({ error: t('bg_err_saved_job_not_found') }); return; }
        sendResponse({ ok: true, username: job.username });
        void startDownload(job.username, {
          filterType: job.filterType,
          skipDuplicates: job.skipDuplicates,
          keyword: job.keyword,
          dateFrom: job.dateFrom,
          dateTo: job.dateTo,
          saveFolder: job.saveFolder,
          filenameTemplate: job.filenameTemplate,
        });
      })();
      return true;
    }
    default:
      return undefined;
  }
};
