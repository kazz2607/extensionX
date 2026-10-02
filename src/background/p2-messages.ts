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

function matches(item: MediaItem, payload: Record<string, unknown>): boolean {
  const type = String(payload.filterType || 'all');
  if (type === 'images' && item.type !== 'image') return false;
  if (type === 'videos' && item.type !== 'video' && item.type !== 'hls') return false;
  if (type === 'gifs' && item.type !== 'gif') return false;
  const keyword = String(payload.keyword || '').trim().toLowerCase();
  if (keyword && !`${item.tweetText || ''} ${item.tweetId || ''}`.toLowerCase().includes(keyword)) return false;
  const timestamp = Number(item.tweetDate || 0);
  if (payload.dateFrom && timestamp && timestamp < Date.parse(String(payload.dateFrom))) return false;
  if (payload.dateTo && timestamp && timestamp > Date.parse(`${String(payload.dateTo)}T23:59:59.999`)) return false;
  return true;
}

async function collect(username: string, payload: Record<string, unknown>, cap = Number.POSITIVE_INFINITY): Promise<{ items: MediaItem[]; total: number }> {
  const items: MediaItem[] = [];
  let total = 0;
  await mediaRepository.visitMediaItems(username, (item) => {
    if (!matches(item, payload)) return;
    total++;
    if (items.length < cap) items.push(item);
  });
  return { items, total };
}

async function listSchedules(): Promise<JobSchedule[]> {
  const stored = await chrome.storage.local.get(SCHEDULES_KEY);
  return Array.isArray(stored[SCHEDULES_KEY]) ? (stored[SCHEDULES_KEY] as JobSchedule[]).filter((item) => parseScheduleInput(item)) : [];
}

async function setSchedule(raw: unknown): Promise<JobSchedule | null> {
  const input = parseScheduleInput(raw);
  if (!input || !(await getSavedJob(input.jobId))) return null;
  const schedules = await listSchedules();
  const alarmName = `${ALARM_PREFIX}${input.jobId}`;
  await chrome.alarms.clear(alarmName);
  const schedule: JobSchedule = { ...input };
  if (input.enabled) {
    schedule.nextRunAt = Date.now() + input.intervalMinutes * 60_000;
    chrome.alarms.create(alarmName, { delayInMinutes: input.intervalMinutes, periodInMinutes: input.intervalMinutes });
  }
  const next = schedules.filter((item) => item.jobId !== input.jobId);
  next.push(schedule);
  await chrome.storage.local.set({ [SCHEDULES_KEY]: next });
  return schedule;
}

void listSchedules().then(async (schedules) => {
  const alarms = new Set((await chrome.alarms.getAll()).map((alarm) => alarm.name));
  for (const schedule of schedules) {
    const name = `${ALARM_PREFIX}${schedule.jobId}`;
    if (schedule.enabled && !alarms.has(name)) chrome.alarms.create(name, { delayInMinutes: schedule.intervalMinutes, periodInMinutes: schedule.intervalMinutes });
  }
}).catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const jobId = alarm.name.slice(ALARM_PREFIX.length);
  void (async () => {
    const schedules = await listSchedules();
    const schedule = schedules.find((item) => item.jobId === jobId && item.enabled);
    const job = await getSavedJob(jobId);
    if (!schedule || !job) return;
    schedule.lastRunAt = Date.now();
    schedule.nextRunAt = alarm.scheduledTime + schedule.intervalMinutes * 60_000;
    if (downloadCoordinator.isBusy) {
      schedule.lastStatus = 'skipped';
      await addNotificationEvent('warning', 'Lịch tải đã bỏ qua', `Saved Job “${job.name}” bị bỏ qua vì đang có download khác.`);
    } else {
      schedule.lastStatus = 'completed';
      await addNotificationEvent('info', 'Lịch tải đã bắt đầu', `Saved Job “${job.name}” đã được kích hoạt.`);
      void startDownload(job.username, job);
    }
    await chrome.storage.local.set({ [SCHEDULES_KEY]: schedules });
  })();
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
