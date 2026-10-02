/**
 * queue-panel.ts — v5.0.3 Multi-Profile Queue panel (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi: diff-render theo signature
 * id+status (Pha 3) để tránh rebuild DOM khi chỉ progress thay đổi.
 */
import type { QueueItem } from '../types.ts';
import { getQueuePresentation } from '../shared/queue-presentation.ts';
import type { MessageType, ResponseFor } from '../shared/messages.ts';

export type SendBGFn = <T extends MessageType>(type: T, payload?: Record<string, unknown>) => Promise<ResponseFor<T> | null>;
export type ShowToastFn = (msg: string, type?: string) => void;

export interface QueuePanelDeps {
  sendBG: SendBGFn;
  showToast: ShowToastFn;
}

export interface QueueProgressPayload {
  current?: number;
  total?: number;
  percent?: number;
}

let _deps: QueuePanelDeps | null = null;
let downloadQueue: QueueItem[] = [];
let _startButtonBound = false;
let _listBound = false;
let _pendingProgress: QueueProgressPayload | null = null;
let _progressFrame: number | null = null;
const queueProgressById = new Map<string, { current: number; total: number; percent: number }>();
const selectedQueueIds = new Set<string>();
// P3: Cache chữ ký queue — tránh rebuild toàn bộ DOM nếu chỉ progress thay đổi
let _lastQueueSignature = '';
const QUEUE_RENDER_WINDOW = 50;
let queueRenderLimit = QUEUE_RENDER_WINDOW;

export function initQueuePanel(deps: QueuePanelDeps): void {
  _deps = deps;
  document.getElementById('queue-bulk-actions')?.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-bulk-action]') : null;
    if (!button || !_deps || !button.dataset.bulkAction) return;
    const res = await _deps.sendBG('QUEUE_BULK_ACTION', { action: button.dataset.bulkAction, ids: [...selectedQueueIds] });
    if (res?.ok) {
      selectedQueueIds.clear();
      _deps.showToast(`Đã cập nhật ${Number(res.changed) || 0} mục`, 'success');
    } else _deps.showToast(res?.error || 'Không thể cập nhật Queue', 'error');
  });
  const list = document.getElementById('queue-list');
  if (list && !_listBound) {
    _listBound = true;
    list.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.queue-load-more')) {
        queueRenderLimit += QUEUE_RENDER_WINDOW;
        _lastQueueSignature = '';
        renderQueue();
        return;
      }
      const button = target.closest<HTMLButtonElement>('button[data-id]');
      if (!button || !list.contains(button) || button.disabled || !_deps) return;
      event.stopPropagation();
      const id = button.dataset.id;
      if (!id) return;
      if (button.classList.contains('btn-queue-remove')) {
        await _deps.sendBG('REMOVE_FROM_QUEUE', { id });
        _deps.showToast('Đã xóa khỏi hàng đợi', 'info');
      } else if (button.classList.contains('btn-queue-stop')) {
        await _deps.sendBG('STOP_DOWNLOAD', {});
        _deps.showToast('⏹ Đang dừng download...', 'info');
      } else if (button.classList.contains('btn-queue-retry')) {
        const res = await _deps.sendBG('RETRY_QUEUE_ITEM', { id });
        _deps.showToast(res?.ok ? 'Đang thử lại...' : 'Không thể thử lại', res?.ok ? 'info' : 'error');
      } else if (button.classList.contains('btn-queue-pause')) {
        await _deps.sendBG('TOGGLE_QUEUE_PAUSE', { id });
      } else if (button.classList.contains('btn-queue-move')) {
        await _deps.sendBG('REORDER_QUEUE_ITEM', { id, direction: button.dataset.dir });
      }
    });
  }
  if (_startButtonBound) return;
  const startButton = document.getElementById('btn-queue-start') as HTMLButtonElement | null;
  if (!startButton) return;
  _startButtonBound = true;
  startButton.addEventListener('click', async () => {
    if (!_deps || startButton.disabled) return;
    startButton.disabled = true;
    try {
      const action = startButton.dataset.action;
      const res = action === 'pause'
        ? await _deps.sendBG('STOP_DOWNLOAD', {})
        : await _deps.sendBG('START_QUEUE', {});
      if (res?.ok) {
        _deps.showToast(action === 'pause' ? 'Hàng đợi đã tạm dừng' : 'Hàng đợi đã bắt đầu', 'success');
      } else {
        _deps.showToast((res && 'error' in res ? res.error : '') || (action === 'pause' ? 'Không thể tạm dừng hàng đợi' : 'Không thể bắt đầu hàng đợi'), 'error');
      }
    } finally {
      startButton.disabled = false;
    }
  });
}

export async function loadQueue(): Promise<void> {
  const res = await _deps!.sendBG('GET_QUEUE', {});
  downloadQueue = res?.queue || [];
  renderQueue();
}

export function setQueueFromUpdate(queue: QueueItem[]): void {
  downloadQueue = queue || [];
  renderQueue();
}

function getQueueSignature(queue: QueueItem[]): string {
  // Signature = id+status của từng item, theo đúng thứ tự mảng — không bao
  // gồm progress để progress update không trigger rebuild. Thứ tự mảng nằm trong
  // signature nên đổi chỗ (Pha 12 reorder) cũng kích hoạt rebuild đúng lúc.
  return queue.map((q) => `${q.id}:${q.status}:${q.result?.success ?? ''}:${q.result?.failed ?? ''}:${q.result?.skipped ?? ''}:${q.result?.error ?? ''}`).join('|');
}

export function renderQueue(): void {
  const list = document.getElementById('queue-list');
  if (!list) return;
  const activeQueueIds = new Set(downloadQueue.map((item) => item.id));
  for (const id of queueProgressById.keys()) {
    if (!activeQueueIds.has(id)) queueProgressById.delete(id);
  }

  const presentation = getQueuePresentation(downloadQueue);
  const waitingCount = presentation.waiting + presentation.paused;
  const totalActive = waitingCount + presentation.downloading;

  const queueCountBadge = document.getElementById('queue-count-badge');
  const navQueueBadge = document.getElementById('nav-queue-badge');
  if (queueCountBadge) {
    queueCountBadge.textContent = String(totalActive);
    queueCountBadge.style.display = totalActive > 0 ? 'inline' : 'none';
  }
  if (navQueueBadge) {
    navQueueBadge.textContent = String(waitingCount);
    navQueueBadge.style.display = waitingCount > 0 ? 'flex' : 'none';
  }
  const startButton = document.getElementById('btn-queue-start') as HTMLButtonElement | null;
  if (startButton) {
    startButton.dataset.action = presentation.action;
    startButton.disabled = presentation.action === 'disabled';
    startButton.title = presentation.title;
    startButton.setAttribute('aria-label', presentation.title);
    const label = startButton.querySelector<HTMLElement>('.queue-primary-label');
    if (label) label.textContent = presentation.label;
  }
  const summary = document.getElementById('queue-summary');
  if (summary) {
    const metrics: Array<[string, number, string]> = [
      ['Đang tải', presentation.downloading, 'active'],
      ['Chờ', presentation.waiting, 'waiting'],
      ['Tạm dừng', presentation.paused, 'paused'],
      ['Lỗi', presentation.error, 'error'],
    ];
    summary.replaceChildren(...metrics.map(([label, value, state]) => {
      const metric = document.createElement('span');
      metric.className = `queue-summary-item ${state}`;
      const count = document.createElement('strong'); count.textContent = String(value);
      const text = document.createElement('span'); text.textContent = label;
      metric.append(count, text);
      return metric;
    }));
  }

  // P3: Kiểm tra signature — bỏ qua full rebuild nếu chỉ progress thay đổi
  const sig = getQueueSignature(downloadQueue);
  const needsRebuild = sig !== _lastQueueSignature;
  _lastQueueSignature = sig;

  if (!needsRebuild) {
    // Chỉ cập nhật progress của item đang tải
    const activeItem = downloadQueue.find((q) => q.status === 'downloading');
    if (activeItem) {
      const savedProgress = queueProgressById.get(activeItem.id);
      if (savedProgress) updateQueueItemProgress(savedProgress);
    }
    return;
  }

  if (downloadQueue.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'queue-empty';
    empty.id = 'queue-empty';
    const label = document.createElement('span');
    label.textContent = 'Hàng đợi trống';
    const hint = document.createElement('span');
    hint.className = 'queue-empty-hint';
    hint.textContent = 'Thêm profile vào queue để tải tuần tự mà không cần giám sát';
    empty.append(label, hint);
    list.replaceChildren(empty);
    return;
  }

  const statusLabels: Record<string, string> = { waiting: 'Chờ', downloading: 'Đang tải', paused: 'Tạm dừng', done: 'Xong', error: 'Lỗi', cancelled: 'Đã hủy' };
  const filterIcons: Record<string, string> = { all: '📦', images: '🖼️', videos: '🎬', gifs: '🎞️' };

  const fragment = document.createDocumentFragment();
  const visibleEntries = downloadQueue.slice(0, queueRenderLimit).map((item, index) => ({ item, index }));
  const activeIndex = downloadQueue.findIndex((item) => item.status === 'downloading');
  if (activeIndex >= queueRenderLimit && activeIndex >= 0) visibleEntries.push({ item: downloadQueue[activeIndex], index: activeIndex });
  visibleEntries.forEach(({ item, index }) => {
    const icon = filterIcons[item.filterType || 'all'] || '📦';
    const isPaused = item.status === 'paused';
    const statusLabel = isPaused ? 'Tạm dừng' : statusLabels[item.status] || String(item.status || '');
    const metaText = item.result
      ? (item.result.error ? String(item.result.error).slice(0, 500) : `${Number(item.result.success) || 0}/${Number(item.result.total) || 0} files`)
      : `${Number(item.mediaCount) || 0} media · ${icon} ${String(item.filterType || '').slice(0, 30)}`;
    const canRemove = item.status !== 'downloading';
    const id = String(item.id || '').slice(0, 120);
    const username = String(item.username || '').slice(0, 50);
    const safeStatus = String(item.status || '').replace(/[^a-z]/g, '');
    const row = document.createElement('li');
    row.className = `queue-item status-${safeStatus}${isPaused ? ' paused' : ''}`;
    row.dataset.id = id;
    row.setAttribute('aria-label', `@${username}: ${statusLabel}`);
    const select = document.createElement('input');
    select.type = 'checkbox'; select.className = 'queue-select'; select.checked = selectedQueueIds.has(id);
    select.setAttribute('aria-label', `Chọn @${username}`);
    select.addEventListener('change', () => select.checked ? selectedQueueIds.add(id) : selectedQueueIds.delete(id));
    const avatar = document.createElement('div'); avatar.className = 'queue-item-avatar'; avatar.textContent = username.slice(0, 2).toUpperCase();
    const info = document.createElement('div'); info.className = 'queue-item-info';
    const name = document.createElement('div'); name.className = 'queue-item-name'; name.textContent = `@${username}`;
    const meta = document.createElement('div'); meta.className = 'queue-item-meta'; meta.textContent = metaText;
    info.append(name, meta);
    if (item.result) {
      const details = document.createElement('details'); details.className = 'queue-result-details';
      const detailsSummary = document.createElement('summary'); detailsSummary.textContent = 'Chi tiết';
      const detailText = document.createElement('div');
      detailText.textContent = `Thành công ${item.result.success} · Bỏ qua ${item.result.skipped} · Lỗi ${item.result.failed}${item.result.error ? ` · ${String(item.result.error).slice(0, 300)}` : ''}`;
      details.append(detailsSummary, detailText); info.append(details);
    }
    if (item.status === 'downloading') {
      const count = document.createElement('span'); count.className = 'queue-file-count'; count.id = `qfc-${id}`; count.textContent = '📥 đang tải...'; info.append(count);
    }
    const status = document.createElement('span'); status.className = `queue-status ${safeStatus}`; status.textContent = statusLabel;

    // Pha 12: Quản lý hàng đợi nâng cao — pause/reorder/retry
    const actions = document.createElement('div');
    actions.className = 'queue-item-actions';
    if (item.status === 'waiting' || item.status === 'paused') {
      const up = document.createElement('button');
      up.className = 'btn-queue-move'; up.dataset.id = id; up.dataset.dir = 'up';
      up.title = 'Di chuyển lên'; up.textContent = '▲'; up.disabled = index === 0;
      up.setAttribute('aria-label', `Di chuyển @${username} lên`);
      const down = document.createElement('button');
      down.className = 'btn-queue-move'; down.dataset.id = id; down.dataset.dir = 'down';
      down.title = 'Di chuyển xuống'; down.textContent = '▼'; down.disabled = index === downloadQueue.length - 1;
      down.setAttribute('aria-label', `Di chuyển @${username} xuống`);
      const pause = document.createElement('button');
      pause.className = 'btn-queue-pause'; pause.dataset.id = id;
      pause.title = isPaused ? 'Tiếp tục' : 'Tạm dừng'; pause.textContent = isPaused ? '▶' : '⏸';
      pause.setAttribute('aria-label', `${isPaused ? 'Tiếp tục' : 'Tạm dừng'} @${username}`);
      actions.append(up, down, pause);
    }
    if (item.status === 'error') {
      const retry = document.createElement('button');
      retry.className = 'btn-queue-retry'; retry.dataset.id = id;
      retry.title = 'Thử lại'; retry.textContent = '↻';
      retry.setAttribute('aria-label', `Thử lại @${username}`);
      actions.append(retry);
    }
    const action = document.createElement('button'); action.className = canRemove ? 'btn-queue-remove' : 'btn-queue-stop'; action.dataset.id = id;
    action.title = canRemove ? 'Xóa khỏi queue' : 'Dừng download'; action.textContent = canRemove ? '×' : '⏹';
    action.setAttribute('aria-label', `${canRemove ? 'Xóa khỏi hàng đợi' : 'Dừng tải'} @${username}`);
    actions.append(action);

    row.append(select, avatar, info, status, actions);
    fragment.append(row);
  });
  if (queueRenderLimit < downloadQueue.length) {
    const more = document.createElement('li'); more.className = 'queue-load-more-row';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'queue-load-more';
    button.textContent = `Hiển thị thêm (${downloadQueue.length - queueRenderLimit})`;
    more.append(button); fragment.append(more);
  }
  list.replaceChildren(fragment);

  // Restore live progress bar nếu có item đang downloading
  const activeItem = downloadQueue.find((q) => q.status === 'downloading');
  if (activeItem) {
    const savedProgress = queueProgressById.get(activeItem.id);
    if (savedProgress) updateQueueItemProgress(savedProgress);
  }

}

// UI-06 + FEA-03: Cập nhật progress bar + file count live của queue item đang downloading
export function updateQueueItemProgress(payload: QueueProgressPayload): void {
  _pendingProgress = payload;
  if (_progressFrame !== null) return;
  _progressFrame = requestAnimationFrame(() => {
    _progressFrame = null;
    const latest = _pendingProgress;
    _pendingProgress = null;
    if (latest) applyQueueItemProgress(latest);
  });
}

function applyQueueItemProgress(payload: QueueProgressPayload): void {
  const active = downloadQueue.find((q) => q.status === 'downloading');
  if (!active) return;

  const current = Math.max(0, Number(payload.current) || 0);
  const total = Math.max(0, Number(payload.total) || 0);
  const percent = Math.min(100, Math.max(0, Number(payload.percent) || 0));
  queueProgressById.set(active.id, { current, total, percent });

  // UI-06: mini progress bar trong queue-item-meta
  const metaEl = document.querySelector<HTMLElement>(`.queue-item[data-id="${active.id}"] .queue-item-meta`);
  if (metaEl) {
    let progress = metaEl.querySelector<HTMLElement>('.queue-mini-progress');
    let bar = metaEl.querySelector<HTMLElement>('.queue-mini-bar');
    let label = metaEl.querySelector<HTMLElement>('.queue-mini-progress-label');
    if (!progress || !bar || !label) {
      progress = document.createElement('div');
      progress.className = 'queue-mini-progress';
      progress.setAttribute('role', 'progressbar');
      bar = document.createElement('div');
      bar.className = 'queue-mini-bar';
      label = document.createElement('span');
      label.className = 'queue-mini-progress-label';
      label.style.fontSize = '10px';
      progress.append(bar);
      metaEl.replaceChildren(progress, label);
    }
    bar.style.width = `${percent}%`;
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', String(percent));
    label.textContent = `${current}/${total} • ${percent}%`;
    metaEl.dataset.progressCurrent = String(current);
    metaEl.dataset.progressTotal = String(total);
    metaEl.dataset.progressPercent = String(percent);
  }

  // FEA-03: file count badge rõ ràng hơn
  const fileCountEl = document.querySelector<HTMLElement>(`#qfc-${active.id}`);
  if (fileCountEl) {
    fileCountEl.textContent = `📥 ${current} / ${total} files · ${percent}%`;
  }
}

export interface AddToQueueInput {
  username: string;
  filterType: string;
  skipDuplicates: boolean;
  keyword: string;
  mediaCount: number;
}

export async function addCurrentToQueue(input: AddToQueueInput): Promise<void> {
  if (!input.username) return;
  if (input.mediaCount === 0) {
    _deps!.showToast('Chưa có media — hãy thu thập trước', 'error');
    return;
  }
  const res = await _deps!.sendBG('ADD_TO_QUEUE', {
    username: input.username,
    filterType: input.filterType,
    skipDuplicates: input.skipDuplicates,
    keyword: input.keyword,
  });
  if (res?.error === 'Already in queue') {
    _deps!.showToast(`@${input.username} đã trong hàng đợi`, 'info');
  } else if (res?.ok) {
    _deps!.showToast(`✓ Đã thêm @${input.username} vào queue`, 'success');
    // Switch to queue tab
    document.getElementById('nav-queue')?.click();
  } else {
    _deps!.showToast('Lỗi khi thêm vào queue', 'error');
  }
}
