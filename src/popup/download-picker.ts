/**
 * download-picker.ts — Pha 9: Interactive Download Picker.
 * Lưới thumbnail media đã thu thập cho profile hiện tại, cho phép chọn từng
 * item cụ thể trước khi tải (thay vì luôn tải toàn bộ theo filter hiện tại).
 */
import type { MediaItem } from '../types.ts';

export type SendBGFn = (type: string, payload?: Record<string, unknown>) => Promise<any>;
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
        <button class="btn-queue-export" id="picker-select-all">Chọn tất cả</button>
        <button class="btn-queue-export" id="picker-select-none">Bỏ chọn</button>
        <button class="btn-queue-export" id="picker-refresh">↻ Làm mới</button>
      </div>
      <span class="picker-summary" id="picker-summary">0 mục</span>
    </div>
    <div class="download-preview-warning" id="picker-truncated-warning" style="display:none"></div>
    <div class="picker-grid" id="picker-grid"></div>
    <div class="picker-actions">
      <button class="btn btn--download" id="picker-download-btn" disabled>Tải mục đã chọn (0)</button>
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
  if (summary) summary.textContent = `${_selected.size}/${_items.length} mục đã chọn`;
  if (downloadBtn) {
    downloadBtn.textContent = `Tải mục đã chọn (${_selected.size})`;
    downloadBtn.disabled = _selected.size === 0;
  }
}

function renderGrid(): void {
  const grid = document.getElementById('picker-grid');
  if (!grid) return;

  if (_items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = 'Chưa có media nào khớp bộ lọc hiện tại';
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

export async function loadPickerItems(): Promise<void> {
  const username = _deps?.getUsername();
  if (!username || !_deps) return;

  const { dateFrom, dateTo, keyword } = _deps.getDateRange();
  const res: any = await _deps.sendBG('GET_MEDIA_ITEMS_FILTERED', {
    username,
    filterType: _deps.getActiveFilter(),
    dateFrom,
    dateTo,
    keyword,
  });

  _items = res?.items || [];
  // Bỏ chọn các url không còn nằm trong danh sách vừa tải (đổi profile/filter)
  const currentUrls = new Set(_items.map((i) => i.url));
  for (const url of _selected) {
    if (!currentUrls.has(url)) _selected.delete(url);
  }

  const warning = document.getElementById('picker-truncated-warning');
  if (warning) {
    if (res?.truncated) {
      warning.style.display = 'flex';
      warning.textContent = `⚠️ Đang hiển thị ${_items.length}/${res.total} mục khớp bộ lọc — thu hẹp bằng ngày/từ khóa để xem hết.`;
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
