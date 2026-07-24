/**
 * cleanup.ts — Standalone Cleanup Page (Feature 0)
 * Trang riêng để scroll /following và lấy danh sách following cũ nhất.
 */

// ─── State ────────────────────────────────────────────────────────────────────
let _allUsers: { username: string; displayName: string; order: number }[] = [];
let _filteredUsers: { username: string; displayName: string; order: number }[] = [];
let _isScrolling = false;

// ─── DOM shortcuts ────────────────────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id);
const urlInput    = $('url-input')        as HTMLInputElement;
const urlHint     = $('url-hint')         as HTMLElement;
const btnStart    = $('btn-start')        as HTMLButtonElement;
const btnStop     = $('btn-stop')         as HTMLButtonElement;
const statusBadge = $('status-badge')     as HTMLElement;
const progressSec = $('progress-section') as HTMLElement;
const progressBar = $('progress-bar')     as HTMLElement;
const statUsers   = $('stat-users')       as HTMLElement;
const statScrolls = $('stat-scrolls')     as HTMLElement;
const hiddenWarn  = $('hidden-warn')      as HTMLElement;
const resultsCard = $('section-results')  as HTMLElement;
const resultsDesc = $('results-desc')     as HTMLElement;
const userGrid    = $('user-grid')        as HTMLElement;
const moreNote    = $('more-note')        as HTMLElement;
const searchInput = $('search-input')     as HTMLInputElement;
const searchCount = $('search-count')     as HTMLElement;
const btnCopy     = $('btn-copy')         as HTMLButtonElement;
const btnCsv      = $('btn-csv')          as HTMLButtonElement;
const btnTheme    = $('btn-theme')        as HTMLButtonElement;
const toast       = $('toast')            as HTMLElement;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  autoDetectUrl();
  setupListeners();
  listenMessages();

  // Khôi phục state nếu đang scroll (popup đóng rồi mở lại)
  chrome.runtime.sendMessage({ type: 'GET_FOLLOWING_SCROLL_STATE' }, (res) => {
    if (res?.state?.isScrolling) {
      setScrolling(true);
      updateProgress(res.state.usersFound, res.state.scrollCount, false);
    } else if (res?.state?.users?.length > 0) {
      renderResults(res.state.users, res.state.reachedEnd, false);
    }
  });
});

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme() {
  chrome.storage.local.get('theme', (stored) => {
    let theme = stored.theme || 'dark';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  });
}

// ─── Auto-detect URL from active tab ─────────────────────────────────────────
function autoDetectUrl() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    if (/\/[A-Za-z0-9_]+\/following/.test(new URL(url.startsWith('http') ? url : 'https://x.com').pathname)) {
      urlInput.value = url.replace(/^https?:\/\//, '');
      urlHint.textContent = '✓ Auto-detected from active tab';
      urlHint.style.color = 'var(--green)';
    }
  });
}

// ─── URL Normalizer ───────────────────────────────────────────────────────────
function normalizeUrl(raw: string): string {
  raw = raw.trim();
  if (!raw) return '';
  if (!raw.startsWith('http')) raw = 'https://' + raw;
  if (!/\/following/.test(raw)) raw = raw.replace(/\/?$/, '/following');
  return raw;
}

function extractUsernameFromUrl(url: string): string {
  const m = url.match(/x\.com\/([A-Za-z0-9_]+)\/following/);
  return m?.[1] || 'unknown';
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupListeners() {
  // Theme toggle
  btnTheme.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    chrome.storage.local.set({ theme: next });
  });

  // URL input validation
  urlInput.addEventListener('input', () => {
    const url = normalizeUrl(urlInput.value);
    if (!url) {
      urlHint.textContent = '';
    } else if (/\/[A-Za-z0-9_]+\/following/.test(url)) {
      const username = extractUsernameFromUrl(url);
      urlHint.textContent = `Will scroll x.com/${username}/following`;
      urlHint.style.color = 'var(--text-secondary)';
    } else {
      urlHint.textContent = '⚠ URL phải có dạng x.com/username/following';
      urlHint.style.color = 'var(--orange)';
    }
  });

  // Start
  btnStart.addEventListener('click', startScroll);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startScroll(); });

  // Stop
  btnStop.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'STOP_FOLLOWING_SCROLL' });
    showToast('⏹ Đang dừng...', 'info');
  });

  // Copy
  btnCopy.addEventListener('click', () => {
    if (_allUsers.length === 0) { showToast('Chưa có dữ liệu', 'error'); return; }
    const text = _allUsers.map(u => `@${u.username}`).join('\n');
    navigator.clipboard.writeText(text)
      .then(() => showToast(`✓ Copied ${_allUsers.length} usernames`, 'success'))
      .catch(() => showToast('Copy thất bại', 'error'));
  });

  // CSV Export
  btnCsv.addEventListener('click', exportCSV);

  // Search
  searchInput.addEventListener('input', () => {
    filterAndRender(searchInput.value);
  });
}

// ─── Start Scroll ─────────────────────────────────────────────────────────────
async function startScroll() {
  const raw = urlInput.value.trim();
  if (!raw) { showToast('Nhập URL trang /following', 'error'); return; }

  const targetUrl = normalizeUrl(raw);
  if (!/\/following/.test(targetUrl)) {
    showToast('URL không hợp lệ — cần có /following', 'error'); return;
  }

  // Reset UI
  _allUsers = [];
  _filteredUsers = [];
  resultsCard.style.display = 'none';
  progressSec.style.display = 'flex';
  updateProgress(0, 0, false);
  setScrolling(true);

  const res: any = await chrome.runtime.sendMessage({
    type: 'START_FOLLOWING_SCROLL',
    payload: { targetUrl },
  });

  if (res?.error) {
    setScrolling(false);
    showToast(`Lỗi: ${res.error}`, 'error');
    setStatus('error', `Error: ${res.error}`);
  }
}

// ─── Message Listener (SW broadcasts) ────────────────────────────────────────
function listenMessages() {
  chrome.runtime.onMessage.addListener((msg) => {
    const { type, payload } = msg;

    switch (type) {
      case 'FOLLOWING_SCROLL_STARTED':
        setScrolling(true);
        break;

      case 'FOLLOWING_SCROLL_PROGRESS':
        updateProgress(payload.usersFound, payload.scrollCount, payload.isHidden);
        break;

      case 'FOLLOWING_SCROLL_DONE':
        setScrolling(false);
        renderResults(payload.users || [], payload.reachedEnd, payload.stopped);
        break;

      case 'FOLLOWING_SCROLL_ERROR':
        setScrolling(false);
        setStatus('error', `Error: ${payload.error}`);
        showToast(`Lỗi: ${payload.error}`, 'error');
        break;
    }
  });
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function setScrolling(scrolling: boolean) {
  _isScrolling = scrolling;
  btnStart.style.display = scrolling ? 'none' : 'inline-flex';
  btnStop.style.display  = scrolling ? 'inline-flex' : 'none';
  urlInput.disabled = scrolling;
  statusBadge.style.display = 'inline-flex';

  if (scrolling) {
    statusBadge.className = 'status-badge scanning';
    statusBadge.textContent = 'Scanning...';
    progressBar.classList.remove('done');
  } else {
    progressBar.classList.add('done');
  }
}

function setStatus(type: 'done' | 'stopped' | 'error', msg: string) {
  statusBadge.style.display = 'inline-flex';
  statusBadge.className = `status-badge ${type}`;
  statusBadge.textContent = msg;
}

function updateProgress(usersFound: number, scrollCount: number, isHidden: boolean) {
  statUsers.textContent   = String(usersFound);
  statScrolls.textContent = String(scrollCount);
  hiddenWarn.style.display = isHidden ? 'block' : 'none';

  // Indeterminate animate: oscillate between 15-90%
  const pct = Math.min(15 + (scrollCount % 15) * 5, 90);
  progressBar.style.width = pct + '%';

  statusBadge.style.display = 'inline-flex';
  statusBadge.className = 'status-badge scanning';
  statusBadge.textContent = isHidden ? 'Tab hidden...' : `Scanning... ${usersFound} found`;
}

// ─── Results Rendering ────────────────────────────────────────────────────────
function renderResults(
  users: { username: string; displayName: string; order: number }[],
  reachedEnd: boolean,
  stopped: boolean
) {
  _allUsers = users;
  const total = users.length;

  // Progress done
  progressBar.style.width = '100%';
  progressBar.classList.add('done');
  statUsers.textContent   = String(total);

  const statusMsg = stopped
    ? `Stopped — ${total} users`
    : reachedEnd
      ? `Done! ${total} following found`
      : `Reached scroll limit — ${total} users`;
  setStatus(stopped ? 'stopped' : 'done', statusMsg);
  showToast(stopped ? `Dừng — ${total} users` : `✓ Done! ${total} following (oldest first)`, 'success');

  // Show results card
  resultsCard.style.display = 'flex';
  resultsDesc.textContent = `${total} tài khoản — oldest following ở đầu danh sách`;

  filterAndRender('');
}

function filterAndRender(query: string) {
  const q = query.toLowerCase().trim();
  _filteredUsers = q
    ? _allUsers.filter(u =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
      )
    : _allUsers;

  const shown = _filteredUsers.slice(0, 100);

  searchCount.textContent = q ? `${_filteredUsers.length} / ${_allUsers.length}` : '';

  userGrid.innerHTML = shown.map((u, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    return `
      <a class="user-card" href="https://x.com/${u.username}" target="_blank">
        <span class="user-rank ${rankClass}">#${rank}</span>
        <div class="user-info">
          <div class="user-name">${escHtml(u.displayName || u.username)}</div>
          <div class="user-handle">@${escHtml(u.username)}</div>
        </div>
        <span class="user-open">↗</span>
      </a>`;
  }).join('');

  if (_filteredUsers.length > 100) {
    moreNote.style.display = 'block';
    moreNote.textContent = `Showing 100 / ${_filteredUsers.length} — use search to narrow down, or export CSV for full list`;
  } else {
    moreNote.style.display = 'none';
  }
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  if (_allUsers.length === 0) { showToast('Chưa có dữ liệu', 'error'); return; }

  const username = extractUsernameFromUrl(normalizeUrl(urlInput.value));
  const dateStr  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const header   = 'rank,username,displayName,profileUrl\n';
  const rows     = _allUsers.map((u, i) =>
    `${i + 1},"${u.username}","${u.displayName.replace(/"/g, '""')}","https://x.com/${u.username}"`
  ).join('\n');

  const csv     = header + rows;
  const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  chrome.downloads.download({
    url: dataUrl,
    filename: `following_${username}_oldest_${dateStr}.csv`,
    saveAs: false,
  });
  showToast(`✓ Exported ${_allUsers.length} users to CSV`, 'success');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let _toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string, type = '') {
  if (_toastTimer) clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  _toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
