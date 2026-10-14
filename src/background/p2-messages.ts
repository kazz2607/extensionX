import { createMediaMatcher, type MediaQueryCriteria } from '../shared/media-query.ts';
import type { JobSchedule, MediaItem } from '../types.ts';
import { buildRedactedErrorReport, estimateMedia, GALLERY_PAGE_MAX, parseScheduleInput, renderFolderRule, validateFolderRule, ZIP_MAX_FILES } from '../shared/p2-tools.ts';
import type { DomainMessageHandler } from './message-handler.ts';
import { mediaRepository } from './indexeddb.ts';
import { listDownloadHistory } from './download-history.ts';
import { downloadCoordinator } from './state.ts';
import { getSavedJob } from './saved-jobs.ts';
import { startDownload } from './downloader.ts';
import { addNotificationEvent, listNotificationEvents, markNotificationEventsRead } from './notification-events.ts';

const SCHEDULES_KEY = 'job_schedules_v1';
const ALARM_PREFIX = 'extensionx-job:';

async function ensureOffscreenDocument(): Promise<void> {
  const existing = chrome.runtime.getContexts
    ? await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
    : [];
  if (existing.length) return;
  try {
    await chrome.offscreen.createDocument({ url: 'offscreen/offscreen.html', reasons: ['BLOBS'], justification: 'Create bounded ZIP archives selected by the user' });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('single offscreen document')) throw error;
  }
}

// Estimate/Gallery/ZIP must select exactly what Download would fetch.
function criteriaFrom(payload: Record<string, unknown>): MediaQueryCriteria {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  const filterType = ['all', 'images', 'videos', 'gifs'].includes(String(payload.filterType)) ? payload.filterType as MediaQueryCriteria['filterType'] : 'all';
  return { filterType, dateFrom: text(payload.dateFrom), dateTo: text(payload.dateTo), keyword: text(payload.keyword) };
}

async function collect(username: string, payload: Record<string, unknown>, cap = Number.POSITIVE_INFINITY): Promise<{ items: MediaItem[]; total: number }> {
  const items: MediaItem[] = [];
  let total = 0;
  const matches = createMediaMatcher(criteriaFrom(payload));
  await mediaRepository.visitMediaItems(username, (item) => {
    if (!matches(item)) return;
    total++;
    if (items.length < cap) items.push(item);
  });
  return { items, total };
}

async function listSchedules(): Promise<JobSchedule[]> {
  const stored = await chrome.storage.local.get(SCHEDULES_KEY);
  return Array.isArray(stored[SCHEDULES_KEY]) ? (stored[SCHEDULES_KEY] as JobSchedule[]).filter((item) => parseScheduleInput(item)) : [];
}

// Every read-modify-write of the schedule list runs in order, so an alarm firing
// while the user edits a schedule cannot write back a stale copy.
let scheduleWrites: Promise<unknown> = Promise.resolve();
function updateSchedules<T>(mutate: (schedules: JobSchedule[]) => Promise<T> | T): Promise<T> {
  const run = scheduleWrites.then(async () => {
    const schedules = await listSchedules();
    const result = await mutate(schedules);
    await chrome.storage.local.set({ [SCHEDULES_KEY]: schedules });
    return result;
  });
  scheduleWrites = run.catch(() => undefined);
  return run;
}

async function setSchedule(raw: unknown): Promise<JobSchedule | null> {
  const input = parseScheduleInput(raw);
  if (!input || !(await getSavedJob(input.jobId))) return null;
  return updateSchedules(async (schedules) => {
    const alarmName = `${ALARM_PREFIX}${input.jobId}`;
    await chrome.alarms.clear(alarmName);
    const schedule: JobSchedule = { ...input };
    if (input.enabled) {
      schedule.nextRunAt = Date.now() + input.intervalMinutes * 60_000;
      await chrome.alarms.create(alarmName, { delayInMinutes: input.intervalMinutes, periodInMinutes: input.intervalMinutes });
    }
    const index = schedules.findIndex((item) => item.jobId === input.jobId);
    if (index >= 0) schedules.splice(index, 1);
    schedules.push(schedule);
    return schedule;
  });
}

/** Called when a Saved Job is deleted: its alarm must stop firing. */
export function removeSchedule(jobId: string): Promise<void> {
  return updateSchedules(async (schedules) => {
    await chrome.alarms.clear(`${ALARM_PREFIX}${jobId}`);
    const index = schedules.findIndex((item) => item.jobId === jobId);
    if (index >= 0) schedules.splice(index, 1);
  });
}

// Startup reconciliation: recreate missing alarms for enabled schedules and
// clear alarms whose schedule was disabled or whose job no longer exists.
void (async () => {
  const schedules = await listSchedules();
  const alarms = await chrome.alarms.getAll();
  const wanted = new Set(schedules.filter((schedule) => schedule.enabled).map((schedule) => `${ALARM_PREFIX}${schedule.jobId}`));
  for (const alarm of alarms) {
    if (alarm.name.startsWith(ALARM_PREFIX) && !wanted.has(alarm.name)) await chrome.alarms.clear(alarm.name);
  }
  const existing = new Set(alarms.map((alarm) => alarm.name));
  for (const schedule of schedules) {
    const name = `${ALARM_PREFIX}${schedule.jobId}`;
    if (schedule.enabled && !existing.has(name)) await chrome.alarms.create(name, { delayInMinutes: schedule.intervalMinutes, periodInMinutes: schedule.intervalMinutes });
  }
})().catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const jobId = alarm.name.slice(ALARM_PREFIX.length);
  void updateSchedules(async (schedules) => {
    const schedule = schedules.find((item) => item.jobId === jobId && item.enabled);
    const job = await getSavedJob(jobId);
    if (!job) await chrome.alarms.clear(alarm.name);
    if (!schedule || !job) return;
    schedule.lastRunAt = Date.now();
    schedule.nextRunAt = alarm.scheduledTime + schedule.intervalMinutes * 60_000;
    // startDownload claims the coordinator synchronously, so isBusy right after
    // the call tells whether this run actually started.
    let started = false;
    if (!downloadCoordinator.isBusy) {
      void startDownload(job.username, job);
      started = downloadCoordinator.isBusy;
    }
    schedule.lastStatus = started ? 'completed' : 'skipped';
    if (started) {
      await addNotificationEvent('info', 'Lịch tải đã bắt đầu', `Saved Job “${job.name}” đã được kích hoạt.`);
    } else {
      await addNotificationEvent('warning', 'Lịch tải đã bỏ qua', `Saved Job “${job.name}” bị bỏ qua vì đang có download khác.`);
    }
  }).catch(() => {});
});

export const handleP2Message: DomainMessageHandler = (message, _sender, sendResponse) => {
  const { type, payload } = message;
  if (type === 'GET_DOWNLOAD_ESTIMATE') {
    void (async () => {
      const username = String(payload.username || '');
      const { items } = await collect(username, payload);
      const downloaded = payload.skipDuplicates === false ? new Set<string>() : new Set(await mediaRepository.getDownloadedUrls(username));
      sendResponse({ estimate: estimateMedia(items, downloaded) });
    })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Estimate failed' }));
    return true;
  }
  if (type === 'PREVIEW_FOLDER_RULE') {
    const template = payload.template;
    if (!validateFolderRule(template)) { sendResponse({ error: 'Invalid folder rule' }); return false; }
    const sample: MediaItem = { type: 'image', url: 'https://pbs.twimg.com/media/sample.jpg', tweetDate: Date.now() };
    sendResponse({ preview: renderFolderRule(template, sample, String(payload.username || 'profile')) });
    return false;
  }
  if (type === 'GET_GALLERY_PAGE') {
    void (async () => {
      const offset = Math.max(0, Math.min(100_000, Number(payload.offset) || 0));
      const limit = Math.max(1, Math.min(GALLERY_PAGE_MAX, Number(payload.limit) || 50));
      const result = await collect(String(payload.username || ''), payload, offset + limit);
      sendResponse({ items: result.items.slice(offset, offset + limit), total: result.total, offset, nextOffset: offset + limit < result.total ? offset + limit : null });
    })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Gallery failed' }));
    return true;
  }
  if (type === 'EXPORT_ERROR_REPORT') {
    void listDownloadHistory().then((history) => sendResponse(buildRedactedErrorReport(history)));
    return true;
  }
  if (type === 'GET_SCHEDULES') { void listSchedules().then((schedules) => sendResponse({ schedules })); return true; }
  if (type === 'SET_JOB_SCHEDULE') {
    void setSchedule(payload.schedule).then((schedule) => sendResponse(schedule ? { ok: true, schedule } : { error: 'Invalid schedule or Saved Job' }));
    return true;
  }
  if (type === 'GET_NOTIFICATIONS') { void listNotificationEvents().then((events) => sendResponse({ events })); return true; }
  if (type === 'MARK_NOTIFICATIONS_READ') {
    void markNotificationEventsRead().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (type === 'DOWNLOAD_ZIP_CHUNKS') {
    void (async () => {
      const username = String(payload.username || '');
      const chunkSize = Math.max(1, Math.min(ZIP_MAX_FILES, Number(payload.chunkSize) || 50));
      const { items, total } = await collect(username, payload, ZIP_MAX_FILES);
      if (!items.length) { sendResponse({ error: 'No media matched' }); return; }
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'DOWNLOAD_ZIP_CHUNKS', username, items, chunkSize }).catch(() => {});
      const chunks = Math.ceil(items.length / chunkSize);
      await addNotificationEvent('info', 'Đang tạo ZIP', `${items.length}/${total} file được chia thành ${chunks} phần.`);
      sendResponse({ ok: true, files: items.length, chunks });
    })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'ZIP failed' }));
    return true;
  }
  return undefined;
};
