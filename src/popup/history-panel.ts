/**
 * history-panel.ts — Download History list + pagination (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi: phân trang 50 mục/lần với
 * nút "Xem thêm" (tối ưu từ Pha 3), lưu trong `chrome.storage.local['download_history']`.
 */

export interface HistoryEntry {
  username: string;
  count: number;
  filter: string;
  date: string;
}

export interface HistoryPanelDeps {
  onSelectUsername: (username: string) => void;
}

// P3: Lịch sử có phân trang — hiện tối đa 50 mục, tránh render 1000+ DOM nodes
const HISTORY_PAGE_SIZE = 50;

let _deps: HistoryPanelDeps | null = null;
let downloadHistory: HistoryEntry[] = [];
let _historyShowCount = HISTORY_PAGE_SIZE;

export function initHistoryPanel(deps: HistoryPanelDeps): void {
  _deps = deps;
}

export async function loadHistory(): Promise<void> {
  const stored: any = await chrome.storage.local.get('download_history').catch(() => ({}));
  downloadHistory = stored.download_history || [];
  renderHistory();
}

export function addToHistory(entry: HistoryEntry): void {
  downloadHistory.unshift(entry);
  if (downloadHistory.length > 20) downloadHistory = downloadHistory.slice(0, 20);
  chrome.storage.local.set({ download_history: downloadHistory });
  renderHistory();
}

export async function clearHistory(): Promise<void> {
  downloadHistory = [];
  await chrome.storage.local.remove('download_history');
  renderHistory();
}

export function renderHistory(): void {
  _historyShowCount = HISTORY_PAGE_SIZE; // reset về đầu mỗi lần reload
  _renderHistoryPage();
}

function _renderHistoryPage(): void {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  if (!downloadHistory.length) {
    const emptyTxt = window.i18n ? window.i18n.t('history_empty') : 'No download history';
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = emptyTxt;
    historyList.replaceChildren(empty);
    return;
  }

  const filterIcons: Record<string, string> = { all: '📦', images: '🖼️', videos: '🎦', gifs: '🎞️' };
  const visible = downloadHistory.slice(0, _historyShowCount);
  const hasMore = downloadHistory.length > _historyShowCount;

  const fragment = document.createDocumentFragment();
  visible.forEach((item) => {
    const d = new Date(item.date);
    const ds = `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const icon = filterIcons[item.filter || 'all'] || '📦';
    const row = document.createElement('li');
    row.className = 'history-item';
    row.dataset.username = String(item.username || '').slice(0, 50);
    for (const [className, text] of [
      ['history-item-icon', icon], ['history-item-name', `@${row.dataset.username}`],
      ['history-item-count', String(Number(item.count) || 0)], ['history-item-date', ds],
    ]) {
      const part = document.createElement('span');
      part.className = className;
      part.textContent = text;
      row.append(part);
    }
    fragment.append(row);
  });

  // Nút "Xem thêm" để load thêm 50 mục nữa mà không cần rebuild toàn bộ
  if (hasMore) {
    const showMoreBtn = document.createElement('li');
    showMoreBtn.className = 'history-show-more';
    showMoreBtn.id = 'history-show-more-btn';
    const btn = document.createElement('button');
    btn.textContent = `Xem thêm (${downloadHistory.length - _historyShowCount} mục)`;
    btn.addEventListener('click', () => {
      _historyShowCount += HISTORY_PAGE_SIZE;
      _renderHistoryPage();
    }, { once: true });
    showMoreBtn.append(btn);
    fragment.append(showMoreBtn);
  }

  historyList.replaceChildren(fragment);

  historyList.querySelectorAll<HTMLElement>('.history-item').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.username) _deps?.onSelectUsername(el.dataset.username);
    });
  });
}
