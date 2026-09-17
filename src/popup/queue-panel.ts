/**
 * queue-panel.ts — v5.0.3 Multi-Profile Queue panel (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi: diff-render theo signature
 * id+status (Pha 3) để tránh rebuild DOM khi chỉ progress thay đổi.
 */
import type { QueueItem } from '../types.ts';

export type SendBGFn = (type: string, payload?: Record<string, unknown>) => Promise<any>;
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
const queueProgressById = new Map<string, { current: number; total: number; percent: number }>();
// P3: Cache chữ ký queue — tránh rebuild toàn bộ DOM nếu chỉ progress thay đổi
let _lastQueueSignature = '';

export function initQueuePanel(deps: QueuePanelDeps): void {
  _deps = deps;
}

export async function loadQueue(): Promise<void> {
  const res: any = await _deps!.sendBG('GET_QUEUE', {});
  downloadQueue = res?.queue || [];
  renderQueue();
}

export function setQueueFromUpdate(queue: QueueItem[]): void {
  downloadQueue = queue || [];
  renderQueue();
}

function getQueueSignature(queue: QueueItem[]): string {
  // Signature = id+status của từng item; không bao gồm progress để progress update không trigger rebuild
  return queue.map((q) => `${q.id}:${q.status}`).join('|');
}

export function renderQueue(): void {
  const list = document.getElementById('queue-list');
  if (!list) return;
  const activeQueueIds = new Set(downloadQueue.map((item) => item.id));
  for (const id of queueProgressById.keys()) {
    if (!activeQueueIds.has(id)) queueProgressById.delete(id);
  }

  // Update badges
  const waitingCount = downloadQueue.filter((q) => q.status === 'waiting').length;
  const totalActive = downloadQueue.filter((q) => q.status !== 'done' && q.status !== 'error').length;

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

  const statusLabels: Record<string, string> = { waiting: 'Chờ', downloading: 'Đang tải', done: 'Xong', error: 'Lỗi' };
  const filterIcons: Record<string, string> = { all: '📦', images: '🖼️', videos: '🎬', gifs: '🎞️' };

  const fragment = document.createDocumentFragment();
  downloadQueue.forEach((item) => {
    const icon = filterIcons[item.filterType || 'all'] || '📦';
    const statusLabel = statusLabels[item.status] || String(item.status || '');
    const metaText = item.result
      ? (item.result.error ? String(item.result.error).slice(0, 500) : `${Number(item.result.success) || 0}/${Number(item.result.total) || 0} files`)
      : `${Number(item.mediaCount) || 0} media · ${icon} ${String(item.filterType || '').slice(0, 30)}`;
    const canRemove = item.status !== 'downloading';
    const id = String(item.id || '').slice(0, 120);
    const username = String(item.username || '').slice(0, 50);
    const safeStatus = String(item.status || '').replace(/[^a-z]/g, '');
    const row = document.createElement('li');
    row.className = `queue-item status-${safeStatus}`;
    row.dataset.id = id;
    const avatar = document.createElement('div'); avatar.className = 'queue-item-avatar'; avatar.textContent = username.slice(0, 2).toUpperCase();
    const info = document.createElement('div'); info.className = 'queue-item-info';
    const name = document.createElement('div'); name.className = 'queue-item-name'; name.textContent = `@${username}`;
    const meta = document.createElement('div'); meta.className = 'queue-item-meta'; meta.textContent = metaText;
    info.append(name, meta);
    if (item.status === 'downloading') {
      const count = document.createElement('span'); count.className = 'queue-file-count'; count.id = `qfc-${id}`; count.textContent = '📥 đang tải...'; info.append(count);
    }
    const status = document.createElement('span'); status.className = `queue-status ${safeStatus}`; status.textContent = statusLabel;
    const action = document.createElement('button'); action.className = canRemove ? 'btn-queue-remove' : 'btn-queue-stop'; action.dataset.id = id;
    action.title = canRemove ? 'Xóa khỏi queue' : 'Dừng download'; action.textContent = canRemove ? '×' : '⏹';
    row.append(avatar, info, status, action);
    fragment.append(row);
  });
  list.replaceChildren(fragment);

  // Restore live progress bar nếu có item đang downloading
  const activeItem = downloadQueue.find((q) => q.status === 'downloading');
  if (activeItem) {
    const savedProgress = queueProgressById.get(activeItem.id);
    if (savedProgress) updateQueueItemProgress(savedProgress);
  }

  // Remove listeners
  list.querySelectorAll<HTMLButtonElement>('.btn-queue-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await _deps!.sendBG('REMOVE_FROM_QUEUE', { id });
      _deps!.showToast('Đã xóa khỏi hàng đợi', 'info');
    });
  });

  // Bug 2: Stop button cho item đang downloading trong queue
  list.querySelectorAll<HTMLButtonElement>('.btn-queue-stop').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await _deps!.sendBG('STOP_DOWNLOAD', {});
      _deps!.showToast('⏹ Đang dừng download...', 'info');
    });
  });
}

// UI-06 + FEA-03: Cập nhật progress bar + file count live của queue item đang downloading
export function updateQueueItemProgress(payload: QueueProgressPayload): void {
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
      bar = document.createElement('div');
      bar.className = 'queue-mini-bar';
      label = document.createElement('span');
      label.className = 'queue-mini-progress-label';
      label.style.fontSize = '10px';
      progress.append(bar);
      metaEl.replaceChildren(progress, label);
    }
    bar.style.width = `${percent}%`;
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
  const res: any = await _deps!.sendBG('ADD_TO_QUEUE', {
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
