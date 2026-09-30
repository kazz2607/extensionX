import type { HistoryEntry, QueueItem, SavedJob, SavedJobInput } from '../types.ts';

interface CenterData {
  queue: QueueItem[];
  jobs: SavedJob[];
  history: HistoryEntry[];
  download: { isDownloading: boolean; phase: string };
}

let data: CenterData = { queue: [], jobs: [], history: [], download: { isDownloading: false, phase: 'idle' } };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const search = byId<HTMLInputElement>('search');
const statusFilter = byId<HTMLSelectElement>('status-filter');
const dialog = byId<HTMLDialogElement>('job-dialog');
const form = byId<HTMLFormElement>('job-form');

async function sendBG<T = Record<string, unknown>>(type: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  try { return await chrome.runtime.sendMessage({ type, payload }) as T; }
  catch { return null; }
}

function empty(message: string): HTMLElement {
  const node = (byId<HTMLTemplateElement>('empty-template').content.firstElementChild?.cloneNode(true) as HTMLElement);
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
  byId('connection-status').textContent = data.download.isDownloading ? `Đang tải · ${data.download.phase}` : 'Sẵn sàng';
  renderQueue();
  renderJobs();
  renderHistory();
}

function renderQueue(): void {
  const list = byId('queue-list');
  const status = statusFilter.value;
  const items = data.queue.filter((item) => (status === 'all' || item.status === status) && matchesQuery(item.username, item.keyword ?? '', item.status));
  if (!items.length) { list.replaceChildren(empty('Không có Queue item khớp bộ lọc.')); return; }
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div');
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = `@${item.username}`;
    const badge = document.createElement('span'); badge.className = `status ${item.status}`; badge.textContent = item.paused ? 'paused' : item.status; title.append(badge);
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = `${item.mediaCount} media · ${item.filterType}${item.keyword ? ` · “${item.keyword}”` : ''}`;
    main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail';
    detail.textContent = item.result ? `${item.result.success}/${item.result.total} thành công · ${item.result.failed} lỗi · ${item.result.skipped} bỏ qua` : new Date(item.addedAt).toLocaleString('vi-VN');
    const actions = document.createElement('div'); actions.className = 'item-actions';
    if (item.status === 'error') actions.append(button('Thử lại', 'retry-queue', item.id));
    if (item.status === 'waiting') actions.append(button(item.paused ? 'Tiếp tục' : 'Tạm dừng', 'toggle-queue', item.id));
    actions.append(button(item.status === 'downloading' ? 'Dừng' : 'Xóa', item.status === 'downloading' ? 'stop' : 'remove-queue', item.id, item.status === 'downloading'));
    row.append(main, detail, actions); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function renderJobs(): void {
  const list = byId('jobs-list');
  const jobs = data.jobs.filter((job) => matchesQuery(job.name, job.username, job.keyword));
  if (!jobs.length) { list.replaceChildren(empty('Lưu cấu hình profile + filter để chủ động chạy lại.')); return; }
  const fragment = document.createDocumentFragment();
  for (const job of jobs) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div');
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = job.name;
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = `@${job.username} · ${job.filterType}${job.keyword ? ` · “${job.keyword}”` : ''}`;
    main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail'; detail.textContent = `${job.dateFrom || 'mọi ngày'} → ${job.dateTo || 'hiện tại'} · ${job.skipDuplicates ? 'bỏ qua trùng' : 'cho phép tải lại'}`;
    const actions = document.createElement('div'); actions.className = 'item-actions';
    actions.append(button('Chạy', 'run-job', job.id), button('Sửa', 'edit-job', job.id), button('Xóa', 'delete-job', job.id, true));
    row.append(main, detail, actions); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

function renderHistory(): void {
  const list = byId('history-list');
  const history = data.history.filter((entry) => matchesQuery(entry.username, entry.filter, entry.status ?? ''));
  if (!history.length) { list.replaceChildren(empty('Chưa có lượt tải nào được ghi nhận.')); return; }
  const fragment = document.createDocumentFragment();
  for (const entry of history.slice(0, 200)) {
    const row = document.createElement('article'); row.className = 'item';
    const main = document.createElement('div');
    const title = document.createElement('h3'); title.className = 'item-title'; title.textContent = `@${entry.username}`;
    const badge = document.createElement('span'); badge.className = `status ${entry.status ?? 'completed'}`; badge.textContent = entry.status ?? 'completed'; title.append(badge);
    const meta = document.createElement('p'); meta.className = 'item-meta'; meta.textContent = `${entry.filter} · ${new Date(entry.date).toLocaleString('vi-VN')}`; main.append(title, meta);
    const detail = document.createElement('div'); detail.className = 'item-detail'; detail.textContent = `${entry.success ?? entry.count} thành công · ${entry.failed ?? 0} lỗi · ${entry.skipped ?? 0} bỏ qua`;
    const actions = document.createElement('div'); actions.className = 'item-actions'; actions.append(button('Tạo Saved Job', 'job-from-history', entry.username));
    row.append(main, detail, actions); fragment.append(row);
  }
  list.replaceChildren(fragment);
}

async function refresh(): Promise<void> {
  byId('connection-status').textContent = 'Đang tải dữ liệu…';
  const response = await sendBG<CenterData>('GET_DOWNLOAD_CENTER');
  if (!response) { byId('connection-status').textContent = 'Không kết nối được Service Worker'; return; }
  data = response;
  render();
}

function setValue(id: string, value: string): void { byId<HTMLInputElement | HTMLSelectElement>(id).value = value; }

function openJobDialog(job?: SavedJob, username = ''): void {
  setValue('job-id', job?.id ?? '');
  setValue('job-name', job?.name ?? (username ? `Tải @${username}` : ''));
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
  if (action === 'stop') await sendBG('STOP_DOWNLOAD');
  if (action === 'remove-queue') await sendBG('REMOVE_FROM_QUEUE', { id });
  if (action === 'retry-queue') await sendBG('RETRY_QUEUE_ITEM', { id });
  if (action === 'toggle-queue') await sendBG('TOGGLE_QUEUE_PAUSE', { id });
  if (action === 'run-job') {
    const response = await sendBG<{ ok?: boolean; error?: string }>('RUN_SAVED_JOB', { id });
    byId('connection-status').textContent = response?.ok ? 'Saved Job đã bắt đầu' : response?.error ?? 'Không thể chạy Saved Job';
  }
  if (action === 'edit-job') openJobDialog(data.jobs.find((job) => job.id === id));
  if (action === 'delete-job' && confirm('Xóa Saved Job này?')) await sendBG('DELETE_SAVED_JOB', { id });
  if (action === 'job-from-history') openJobDialog(undefined, id);
  if (!['edit-job', 'job-from-history'].includes(action)) await refresh();
}

document.addEventListener('DOMContentLoaded', () => {
  byId('btn-refresh').addEventListener('click', () => void refresh());
  byId('btn-start-queue').addEventListener('click', async () => { await sendBG('START_QUEUE'); await refresh(); });
  byId('btn-stop').addEventListener('click', async () => { await sendBG('STOP_DOWNLOAD'); await refresh(); });
  byId('btn-new-job').addEventListener('click', () => openJobDialog());
  byId('btn-close-dialog').addEventListener('click', () => dialog.close());
  byId('btn-cancel-job').addEventListener('click', () => dialog.close());
  search.addEventListener('input', render);
  statusFilter.addEventListener('change', renderQueue);
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
    const response = await sendBG<{ ok?: boolean; error?: string }>('SAVE_SAVED_JOB', { job });
    if (!response?.ok) { byId('form-error').textContent = response?.error ?? 'Không thể lưu Saved Job'; return; }
    dialog.close();
    await refresh();
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (['QUEUE_UPDATE', 'DOWNLOAD_DONE'].includes(message?.type)) void refresh();
  });
  void refresh();
});
