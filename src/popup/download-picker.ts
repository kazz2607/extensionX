/**
 * download-picker.ts — Pha 9: Interactive Download Picker.
 * Lưới thumbnail media đã thu thập cho profile hiện tại, cho phép chọn từng
 * item cụ thể trước khi tải (thay vì luôn tải toàn bộ theo filter hiện tại).
 */
import type { MediaItem } from '../types.ts';
import { t } from '../lib/i18n.ts';

import type { MessageType, ResponseFor } from '../shared/messages.ts';
export type SendBGFn = <T extends MessageType>(type: T, payload?: Record<string, unknown>) => Promise<ResponseFor<T> | null>;
export type ShowToastFn = (msg: string, type?: string) => void;

export interface DownloadPickerDeps {
  getUsername: () => string | null;
  getActiveFilter: () => string;
  getDateRange: () => { dateFrom: string; dateTo: string; keyword: string };
  sendBG: SendBGFn;
  showToast: ShowToastFn;
  onDownloadSelected: (selectedUrls: string[]) => void;
}

const TYPE_ICON: Record<string, string> = { video: '🎬', hls: '🎬', gif: '🎞️' };

let _deps: DownloadPickerDeps | null = null;
let _items: MediaItem[] = [];
let _selected = new Set<string>();

function getHTML(): string {
  return `
    <div class="picker-toolbar">
      <div class="picker-toolbar-row">
        <button class="btn-queue-export" id="picker-select-all">${t('popup_picker_select_all')}</button>
        <button class="btn-queue-export" id="picker-select-none">${t('popup_picker_select_none')}</button>
        <button class="btn-queue-export" id="picker-refresh">${t('popup_picker_refresh')}</button>
      </div>
      <span class="picker-summary" id="picker-summary">${t('popup_picker_items', { n: 0 })}</span>
    </div>
    <div class="download-preview-warning" id="picker-truncated-warning" style="display:none"></div>
    <div class="picker-grid" id="picker-grid"></div>
    <div class="picker-actions">
      <button class="btn btn--download" id="picker-download-btn" disabled>${t('popup_picker_download', { n: 0 })}</button>
    </div>
  `;
}

function itemThumb(item: MediaItem): HTMLElement {
  const thumb = document.createElement('div');
  thumb.className = 'picker-thumb';
  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = item.url;
    img.loading = 'lazy';
    img.alt = '';
    thumb.append(img);
  } else {
    const icon = document.createElement('span');
    icon.className = 'picker-thumb-icon';
    icon.textContent = TYPE_ICON[item.type] || '📦';
    thumb.append(icon);
  }
  return thumb;
}

function updateSummary(): void {
  const summary = document.getElementById('picker-summary');
  const downloadBtn = document.getElementById('picker-download-btn') as HTMLButtonElement | null;
  if (summary) summary.textContent = t('popup_picker_summary', { selected: _selected.size, total: _items.length });
  if (downloadBtn) {
    downloadBtn.textContent = t('popup_picker_download', { n: _selected.size });
    downloadBtn.disabled = _selected.size === 0;
  }
}

function renderGrid(): void {
  const grid = document.getElementById('picker-grid');
  if (!grid) return;

  if (_items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = t('popup_picker_empty');
    grid.replaceChildren(empty);
    updateSummary();
    return;
  }

  const fragment = document.createDocumentFragment();
  _items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'picker-item';
    card.dataset.url = item.url;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'picker-item-checkbox';
    checkbox.checked = _selected.has(item.url);
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) _selected.add(item.url);
      else _selected.delete(item.url);
      card.classList.toggle('selected', checkbox.checked);
      updateSummary();
    });

    card.append(checkbox, itemThumb(item));
    card.classList.toggle('selected', checkbox.checked);
    card.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    });

    fragment.append(card);
  });
  grid.replaceChildren(fragment);
  updateSummary();
}

/** Loading / error / no-profile states share one grid message (U10). */
function showGridMessage(key: string, retry = false): void {
  const grid = document.getElementById('picker-grid');
  if (!grid) return;
  const box = document.createElement('div');
  box.className = 'picker-empty';
  box.setAttribute('role', 'status');
  box.textContent = t(key);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker-retry';
    button.textContent = t('popup_picker_retry');
    button.addEventListener('click', () => void loadPickerItems());
    box.append(document.createElement('br'), button);
  }
  grid.replaceChildren(box);
}

let _loadToken = 0;
let _loadedUsername = '';

export async function loadPickerItems(): Promise<void> {
  if (!_deps) return;
  const username = _deps.getUsername();
  const grid = document.getElementById('picker-grid');
  // Every call invalidates earlier in-flight loads, including the no-profile
  // case, so a slow response for the previous profile can never render.
  const token = ++_loadToken;
  // While loading, on error and without a profile there is nothing to pick:
  // drop the old items and selection so "Download selected" is disabled and
  // cannot send the previous profile's URLs.
  // Refresh/filter changes on the same profile keep the selection (restored
  // below for items still listed); another profile starts empty.
  const keep = username && username === _loadedUsername ? new Set(_selected) : new Set<string>();
  _items = [];
  _selected.clear();
  updateSummary();
  if (!username) {
    _loadedUsername = '';
    grid?.setAttribute('aria-busy', 'false');
    showGridMessage('popup_picker_no_profile');
    return;
  }

  grid?.setAttribute('aria-busy', 'true');
  showGridMessage('popup_picker_loading');
  const { dateFrom, dateTo, keyword } = _deps.getDateRange();
  let res: ResponseFor<'GET_MEDIA_ITEMS_FILTERED'> | null = null;
  try {
    res = await _deps.sendBG('GET_MEDIA_ITEMS_FILTERED', {
      username,
      filterType: _deps.getActiveFilter(),
      dateFrom,
      dateTo,
      keyword,
    });
  } catch {
    res = null;
  }
  if (token !== _loadToken) return;
  grid?.setAttribute('aria-busy', 'false');
  if (!res || res.error) {
    // A failed read is not "no media": say so and offer a retry.
    showGridMessage('popup_picker_error', true);
    return;
  }

  _items = res?.items || [];
  // Giữ lại lựa chọn cũ chỉ với các url còn nằm trong danh sách vừa tải
  _loadedUsername = username;
  const currentUrls = new Set(_items.map((i) => i.url));
  keep.forEach((url) => { if (currentUrls.has(url)) _selected.add(url); });

  const warning = document.getElementById('picker-truncated-warning');
  if (warning) {
    if (res?.truncated) {
      warning.style.display = 'flex';
      warning.textContent = t('popup_picker_truncated', { shown: _items.length, total: res.total ?? 0 });
    } else {
      warning.style.display = 'none';
    }
  }

  renderGrid();
}

export function initDownloadPicker(deps: DownloadPickerDeps): void {
  _deps = deps;

  const container = document.getElementById('panel-picker');
  if (!container) return;
  container.innerHTML = getHTML();

  document.getElementById('picker-select-all')?.addEventListener('click', () => {
    _items.forEach((item) => _selected.add(item.url));
    renderGrid();
  });

  document.getElementById('picker-select-none')?.addEventListener('click', () => {
    _selected.clear();
    renderGrid();
  });

  document.getElementById('picker-refresh')?.addEventListener('click', () => {
    void loadPickerItems();
  });

  document.getElementById('picker-download-btn')?.addEventListener('click', () => {
    if (_selected.size === 0) return;
    deps.onDownloadSelected(Array.from(_selected));
  });
}
