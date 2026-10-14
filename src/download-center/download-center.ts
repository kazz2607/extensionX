
import { registerTranslations, t } from '../lib/i18n.ts';
import { initTheme } from '../shared/theme.ts';
import { COMMON_STRINGS } from '../lib/i18n/common.ts';
import { DOWNLOAD_CENTER_STRINGS } from '../lib/i18n/download-center.ts';

registerTranslations(COMMON_STRINGS, DOWNLOAD_CENTER_STRINGS);

/** Version labels read the manifest, so they cannot go stale across releases. */
document.querySelectorAll('[data-manifest-version]').forEach((el) => {
  el.textContent = `v${chrome.runtime.getManifest().version}`;
});
import type { HistoryEntry, JobSchedule, MediaItem, NotificationEvent, QueueItem, SavedJob, SavedJobInput } from '../types.ts';
import type { MessageType, ResponseFor } from '../shared/messages.ts';

interface CenterData {
  queue: QueueItem[];
  jobs: SavedJob[];
  history: HistoryEntry[];
  download: { isDownloading: boolean; phase: string };
}

let data: CenterData = { queue: [], jobs: [], history: [], download: { isDownloading: false, phase: 'idle' } };
const LIST_WINDOW = 50;
let queueWindow = LIST_WINDOW;
let historyWindow = LIST_WINDOW;
let galleryOffset = 0;
let galleryNextOffset: number | null = null;
let schedules: JobSchedule[] = [];
let notifications: NotificationEvent[] = [];

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const search = byId<HTMLInputElement>('search');
const statusFilter = byId<HTMLSelectElement>('status-filter');
const dialog = byId<HTMLDialogElement>('job-dialog');
const form = byId<HTMLFormElement>('job-form');

async function sendBG<T extends MessageType>(type: T, payload: Record<string, unknown> = {}): Promise<ResponseFor<T> | null> {
  try { return await chrome.runtime.sendMessage({ type, payload }) as ResponseFor<T>; }
  catch { return null; }
}

/** Locale for toLocale* formatting, following the app language (not the browser). */
function locale(): string {
  return window.i18n?.lang === 'vi' ? 'vi-VN' : 'en-US';
}

/** Translates a dynamic key (status, media type) and falls back to the raw value when no entry exists. */
function labelOr(key: string, fallback: string): string {
  const text = t(key);
  return text === key ? fallback : text;
}

function empty(message: string): HTMLElement {
  const node = (byId<HTMLTemplateElement>('empty-template').content.firstElementChild?.cloneNode(true) as HTMLElement);
  const heading = node.querySelector('strong');
  if (heading) heading.textContent = t('dc_empty_title');
  const text = node.querySelector('span');
  if (text) text.textContent = message;
  return node;
}

function button(label: string, action: string, id?: string, danger = false): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `mini-button${danger ? ' danger' : ''}`;
  element.textContent = label;
  element.dataset.action = action;
  if (id) element.dataset.id = id;
  return element;
}

function matchesQuery(...values: string[]): boolean {
  const query = search.value.trim().toLowerCase();
  return !query || values.some((value) => value.toLowerCase().includes(query));
}

function render(): void {
  const waiting = data.queue.filter((item) => item.status === 'waiting').length;
  byId('summary-waiting').textContent = String(waiting);
  byId('summary-active').textContent = String(data.queue.filter((item) => item.status === 'downloading').length);
  byId('summary-jobs').textContent = String(data.jobs.length);
  byId('summary-history').textContent = String(data.history.length);
  byId('connection-status').textContent = data.download.isDownloading ? t('dc_conn_downloading', { phase: data.download.phase }) : t('dc_conn_ready');
  renderQueue();
  renderJobs();
  renderHistory();
  renderScheduleOptions();
}

function p2Payload(): Record<string, unknown> {
  return { username: byId<HTMLInputElement>('p2-username').value.trim().replace(/^@/, ''), filterType: byId<HTMLSelectElement>('p2-filter').value };
}

function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  chrome.downloads.download({ url, filename, saveAs: false }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1_000));
}

function renderScheduleOptions(): void {
  const select = byId<HTMLSelectElement>('schedule-job');
  const selected = select.value;
  const options = [new Option(t('dc_select_saved_job'), '')];
  options.push(...data.jobs.map((job) => new Option(`${job.name} · @${job.username}`, job.id)));
  select.replaceChildren(...options);
  select.value = selected;
  const list = byId('schedule-list');
  if (!schedules.length) { list.replaceChildren(empty(t('dc_schedule_empty'))); return; }
  const fragment = document.createDocumentFragment();
  for (const schedule of schedules) {
    const job = data.jobs.find((item) => item.id === schedule.jobId);
    const row = document.createElement('article'); row.className = 'item';
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = job?.name || t('dc_saved_job_deleted');
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = t('dc_schedule_every', { state: schedule.enabled ? t('dc_schedule_on') : t('dc_schedule_off'), n: schedule.intervalMinutes });
    const detail = document.createElement('div'); detail.className = 'item-detail'; detail.textContent = schedule.nextRunAt ? t('dc_schedule_next', { date: new Date(schedule.nextRunAt).toLocaleString(locale()) }) : t('dc_schedule_no_next');
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(button(schedule.enabled ? t('dc_btn_disable') : t('dc_btn_enable'), 'toggle-schedule', schedule.jobId));
    const main = document.createElement('div'); main.append(title, meta); row.append(main, detail, actions); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function renderNotifications(): void {
  byId('notification-count').textContent = String(notifications.filter((item) => !item.read).length);
  const list = byId('notifications-list');
  if (!notifications.length) { list.replaceChildren(empty(t('dc_notifications_empty'))); return; }
  const fragment = document.createDocumentFragment();
  for (const event of notifications) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div'); const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = event.title;
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = new Date(event.createdAt).toLocaleString(locale()); main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail'; detail.textContent = event.message;
    row.append(main, detail); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

async function refreshP2State(): Promise<void> {
  const [scheduleResponse, notificationResponse] = await Promise.all([sendBG('GET_SCHEDULES'), sendBG('GET_NOTIFICATIONS')]);
  schedules = scheduleResponse?.schedules || [];
  notifications = notificationResponse?.events || [];
  renderScheduleOptions(); renderNotifications();
}

async function previewFolder(): Promise<void> {
  const username = byId<HTMLInputElement>('p2-username').value.trim().replace(/^@/, '') || 'profile';
  const template = byId<HTMLInputElement>('p2-folder-rule').value;
  const response = await sendBG('PREVIEW_FOLDER_RULE', { username, template });
  byId('p2-preview').textContent = response?.preview ? `Downloads/${response.preview}/` : response?.error || t('dc_invalid_rule');
}

async function estimate(): Promise<void> {
  const response = await sendBG('GET_DOWNLOAD_ESTIMATE', { ...p2Payload(), skipDuplicates: true });
  const root = byId('estimate-result');
  if (!response?.estimate) { root.replaceChildren(empty(response?.error || t('dc_estimate_failed'))); return; }
  const values = [
    [t('dc_est_selected'), response.estimate.selected.toLocaleString(locale())],
    [t('dc_est_duplicates'), response.estimate.duplicates.toLocaleString(locale())],
    [t('dc_est_size'), `${(response.estimate.estimatedBytes / 1024 / 1024).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MiB`],
    [t('dc_est_unknown'), response.estimate.unknownSize.toLocaleString(locale())],
  ];
  root.replaceChildren(...values.map(([label, value]) => { const card = document.createElement('article'); card.className = 'summary-card'; const span = document.createElement('span'); span.textContent = label; const strong = document.createElement('strong'); strong.textContent = value; card.append(span, strong); return card; }));
  byId('p2-preview').textContent = response.estimate.warning || t('dc_est_breakdown', { images: response.estimate.images, videos: response.estimate.videos, gifs: response.estimate.gifs });
}

async function loadGallery(reset = false): Promise<void> {
  if (reset) { galleryOffset = 0; byId('gallery-grid').replaceChildren(); }
  const response = await sendBG('GET_GALLERY_PAGE', { ...p2Payload(), offset: galleryOffset, limit: 50 });
  if (!response?.items) return;
  const fragment = document.createDocumentFragment();
  for (const item of response.items as MediaItem[]) {
    const card = document.createElement('article'); card.className = 'gallery-card';
    const media = document.createElement(item.type === 'image' ? 'img' : 'video');
    media.src = item.url; if (media instanceof HTMLImageElement) media.loading = 'lazy'; else media.preload = 'metadata';
    const badge = document.createElement('span'); badge.textContent = labelOr(`dc_media_${item.type}`, item.type); card.append(media, badge); fragment.append(card);
  }
  byId('gallery-grid').append(fragment);
  galleryNextOffset = response.nextOffset ?? null; galleryOffset = galleryNextOffset ?? galleryOffset;
  byId('btn-gallery-more').classList.toggle('hidden', galleryNextOffset === null);
}

function renderQueue(): void {
  const list = byId('queue-list');
  const status = statusFilter.value;
  const items = data.queue.filter((item) => (status === 'all' || item.status === status) && matchesQuery(item.username, item.keyword ?? '', item.status));
  if (!items.length) { list.replaceChildren(empty(t('dc_queue_empty'))); return; }
  const fragment = document.createDocumentFragment();
  for (const item of items.slice(0, queueWindow)) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div');
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = `@${item.username}`;
    const badge = document.createElement('span'); badge.className = `status ${item.status}`; badge.textContent = labelOr(`dc_status_${item.status}`, item.status); title.append(badge);
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = `${t('dc_media_count', { n: item.mediaCount })} · ${item.filterType}${item.keyword ? ` · “${item.keyword}”` : ''}`;
    main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail';
    detail.textContent = item.result ? t('dc_result_summary', { success: item.result.success, total: item.result.total, failed: item.result.failed, skipped: item.result.skipped }) : new Date(item.addedAt).toLocaleString(locale());
    const actions = document.createElement('div'); actions.className = 'item-actions';
    if (item.status === 'error') actions.append(button(t('dc_btn_retry'), 'retry-queue', item.id));
    if (item.status === 'waiting' || item.status === 'paused') actions.append(button(item.status === 'paused' ? t('dc_btn_resume') : t('dc_btn_pause'), 'toggle-queue', item.id));
    actions.append(button(item.status === 'downloading' ? t('dc_btn_stop_item') : t('dc_btn_remove'), item.status === 'downloading' ? 'stop' : 'remove-queue', item.id, item.status === 'downloading'));
    row.append(main, detail, actions); fragment.append(row);
  }
  if (items.length > queueWindow) fragment.append(button(t('dc_show_more', { n: items.length - queueWindow }), 'more-queue', 'more'));
  list.replaceChildren(fragment);
}

function renderJobs(): void {
  const list = byId('jobs-list');
  const jobs = data.jobs.filter((job) => matchesQuery(job.name, job.username, job.keyword));
  if (!jobs.length) { list.replaceChildren(empty(t('dc_jobs_empty'))); return; }
  const fragment = document.createDocumentFragment();
  for (const job of jobs) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div');
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = job.name;
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = `@${job.username} · ${job.filterType}${job.keyword ? ` · “${job.keyword}”` : ''}`;
    main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail'; detail.textContent = `${job.dateFrom || t('dc_any_date')} → ${job.dateTo || t('dc_now')} · ${job.skipDuplicates ? t('dc_skip_dupes') : t('dc_allow_redownload')}`;
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(button(t('dc_btn_run'), 'run-job', job.id), button(t('dc_btn_edit'), 'edit-job', job.id), button(t('dc_btn_delete'), 'delete-job', job.id, true));
    row.append(main, detail, actions); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function renderHistory(): void {
  const list = byId('history-list');
  const history = data.history.filter((entry) => matchesQuery(entry.username, entry.filter, entry.status ?? ''));
  if (!history.length) { list.replaceChildren(empty(t('dc_history_empty'))); return; }
  const fragment = document.createDocumentFragment();
  for (const entry of history.slice(0, historyWindow)) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div');
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = `@${entry.username}`;
    const badge = document.createElement('span'); badge.className = `status ${entry.status ?? 'completed'}`; badge.textContent = labelOr(`dc_status_${entry.status ?? 'completed'}`, entry.status ?? 'completed'); title.append(badge);
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = `${entry.filter} · ${new Date(entry.date).toLocaleString(locale())}`; main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail'; detail.textContent = t('dc_history_summary', { success: entry.success ?? entry.count, failed: entry.failed ?? 0, skipped: entry.skipped ?? 0 });
    const actions = document.createElement('div'); actions.className = 'item-actions'; actions.append(button(t('dc_btn_create_job'), 'job-from-history', entry.username));
    row.append(main, detail, actions); fragment.append(row);
  }
  if (history.length > historyWindow) fragment.append(button(t('dc_show_more', { n: history.length - historyWindow }), 'more-history', 'more'));
  list.replaceChildren(fragment);
}

async function refresh(): Promise<void> {
  byId('connection-status').textContent = t('dc_loading_data');
  const response = await sendBG('GET_DOWNLOAD_CENTER');
  if (!response) { byId('connection-status').textContent = t('dc_conn_no_sw'); return; }
  data = response;
  render();
}

function setValue(id: string, value: string): void { byId<HTMLInputElement | HTMLSelectElement>(id).value = value; }

function openJobDialog(job?: SavedJob, username = ''): void {
  setValue('job-id', job?.id ?? '');
  setValue('job-name', job?.name ?? (username ? t('dc_job_default_name', { username }) : ''));
  setValue('job-username', job?.username ?? username);
  setValue('job-filter', job?.filterType ?? 'all');
  setValue('job-keyword', job?.keyword ?? '');
  setValue('job-date-from', job?.dateFrom ?? '');
  setValue('job-date-to', job?.dateTo ?? '');
  setValue('job-folder', job?.saveFolder ?? '');
  setValue('job-template', job?.filenameTemplate ?? '');
  byId<HTMLInputElement>('job-dedup').checked = job?.skipDuplicates ?? true;
  byId('form-error').textContent = '';
  dialog.showModal();
  byId<HTMLInputElement>('job-name').focus();
}

async function handleAction(action: string, id: string): Promise<void> {
  if (action === 'more-queue') { queueWindow += LIST_WINDOW; renderQueue(); return; }
  if (action === 'more-history') { historyWindow += LIST_WINDOW; renderHistory(); return; }
  if (action === 'stop') await sendBG('STOP_DOWNLOAD');
  if (action === 'remove-queue') await sendBG('REMOVE_FROM_QUEUE', { id });
  if (action === 'retry-queue') await sendBG('RETRY_QUEUE_ITEM', { id });
  if (action === 'toggle-queue') await sendBG('TOGGLE_QUEUE_PAUSE', { id });
  if (action === 'run-job') {
    const response = await sendBG('RUN_SAVED_JOB', { id });
    byId('connection-status').textContent = response?.ok ? t('dc_job_started') : response?.error ?? t('dc_job_run_failed');
  }
  if (action === 'edit-job') openJobDialog(data.jobs.find((job) => job.id === id));
  if (action === 'delete-job' && confirm(t('dc_confirm_delete_job'))) await sendBG('DELETE_SAVED_JOB', { id });
  if (action === 'job-from-history') openJobDialog(undefined, id);
  if (action === 'toggle-schedule') {
    const current = schedules.find((item) => item.jobId === id);
    await sendBG('SET_JOB_SCHEDULE', { schedule: { jobId: id, enabled: !current?.enabled, intervalMinutes: current?.intervalMinutes || 1440 } });
    await refreshP2State();
  }
  if (!['edit-job', 'job-from-history'].includes(action)) await refresh();
}

document.addEventListener('DOMContentLoaded', async () => {
  // U7: same light/dark/system theme as the popup and Options.
  await initTheme();
  if (window.i18n) {
    await window.i18n.load();
    window.i18n.applyToDOM();
  }
  byId('btn-refresh').addEventListener('click', () => void refresh());
  byId('btn-start-queue').addEventListener('click', async () => { await sendBG('START_QUEUE'); await refresh(); });
  byId('btn-stop').addEventListener('click', async () => { await sendBG('STOP_DOWNLOAD'); await refresh(); });
  byId('btn-new-job').addEventListener('click', () => openJobDialog());
  byId('btn-close-dialog').addEventListener('click', () => dialog.close());
  byId('btn-cancel-job').addEventListener('click', () => dialog.close());
  search.addEventListener('input', () => { queueWindow = LIST_WINDOW; historyWindow = LIST_WINDOW; render(); });
  statusFilter.addEventListener('change', () => { queueWindow = LIST_WINDOW; renderQueue(); });
  byId('p2-folder-rule').addEventListener('input', () => void previewFolder());
  byId('p2-username').addEventListener('input', () => void previewFolder());
  byId('btn-estimate').addEventListener('click', () => void estimate());
  byId('btn-gallery').addEventListener('click', () => void loadGallery(true));
  byId('btn-gallery-more').addEventListener('click', () => { if (galleryNextOffset !== null) void loadGallery(); });
  byId('btn-zip').addEventListener('click', async () => {
    const response = await sendBG('DOWNLOAD_ZIP_CHUNKS', { ...p2Payload(), chunkSize: 50 });
    byId('p2-preview').textContent = response?.ok ? t('dc_zip_started', { chunks: response.chunks ?? 0, files: response.files ?? 0 }) : response?.error || t('dc_zip_failed');
  });
  byId('btn-error-report').addEventListener('click', async () => {
    const response = await sendBG('EXPORT_ERROR_REPORT');
    if (response?.json) downloadText('extensionx-error-report.json', response.json, 'application/json');
    if (response?.csv) downloadText('extensionx-error-report.csv', response.csv, 'text/csv');
  });
  byId('btn-save-schedule').addEventListener('click', async () => {
    const jobId = byId<HTMLSelectElement>('schedule-job').value;
    if (!jobId) { byId('connection-status').textContent = t('dc_choose_saved_job'); return; }
    await sendBG('SET_JOB_SCHEDULE', { schedule: { jobId, enabled: byId<HTMLInputElement>('schedule-enabled').checked, intervalMinutes: Number(byId<HTMLSelectElement>('schedule-interval').value) } });
    await refreshP2State();
  });
  byId('btn-notifications').addEventListener('click', () => byId('notifications-panel').classList.toggle('hidden'));
  byId('btn-mark-read').addEventListener('click', async () => { await sendBG('MARK_NOTIFICATIONS_READ'); await refreshP2State(); });
  document.querySelector('main')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
    if (target?.dataset.action && target.dataset.id) void handleAction(target.dataset.action, target.dataset.id);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const job: SavedJobInput = {
      ...(byId<HTMLInputElement>('job-id').value ? { id: byId<HTMLInputElement>('job-id').value } : {}),
      name: byId<HTMLInputElement>('job-name').value,
      username: byId<HTMLInputElement>('job-username').value.replace(/^@/, ''),
      filterType: byId<HTMLSelectElement>('job-filter').value as SavedJobInput['filterType'],
      keyword: byId<HTMLInputElement>('job-keyword').value,
      dateFrom: byId<HTMLInputElement>('job-date-from').value,
      dateTo: byId<HTMLInputElement>('job-date-to').value,
      saveFolder: byId<HTMLInputElement>('job-folder').value,
      filenameTemplate: byId<HTMLInputElement>('job-template').value,
      skipDuplicates: byId<HTMLInputElement>('job-dedup').checked,
    };
    const response = await sendBG('SAVE_SAVED_JOB', { job });
    if (!response?.ok) { byId('form-error').textContent = response?.error ?? t('dc_job_save_failed'); return; }
    dialog.close();
    await refresh();
  });
  chrome.runtime.onMessage.addListener((message) => {
    // P15: QUEUE_UPDATE already carries the queue — update it in place instead
    // of re-reading jobs/history storage and re-rendering every list.
    if (message?.type === 'QUEUE_UPDATE' && Array.isArray(message.payload?.queue)) {
      data.queue = message.payload.queue as QueueItem[];
      byId('summary-waiting').textContent = String(data.queue.filter((item) => item.status === 'waiting').length);
      byId('summary-active').textContent = String(data.queue.filter((item) => item.status === 'downloading').length);
      renderQueue();
    } else if (message?.type === 'QUEUE_UPDATE' || message?.type === 'DOWNLOAD_DONE') {
      void refresh();
    }
  });
  void Promise.all([refresh(), refreshP2State(), previewFolder()]);
});
