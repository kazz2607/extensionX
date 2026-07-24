/**
 * following-panel.ts — Feature 0: Following Scanner
 * File riêng, import vào popup.ts để giữ popup.html sạch.
 *
 * Exports:
 *   - initFollowingPanel(deps)          → inject HTML + attach events
 *   - handleFollowingMessage(type, ...) → xử lý broadcast từ SW
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type FollowingUser = { username: string; displayName: string; order: number };
export type ShowToastFn   = (msg: string, type?: string) => void;
export type SendBGFn      = (type: string, payload?: Record<string, unknown>) => Promise<unknown>;

export interface FollowingPanelDeps {
  showToast: ShowToastFn;
  sendBG:    SendBGFn;
}

// ─── State ────────────────────────────────────────────────────────────────────
let _users: FollowingUser[] = [];

// ─── HTML Template ────────────────────────────────────────────────────────────
function getHTML(): string {
  return `
    <div class="following-hero">
      <div class="following-hero-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <div class="following-hero-text">
        <h2 class="following-hero-title">Following Scanner</h2>
        <p class="following-hero-sub">Tìm tài khoản following cũ nhất</p>
      </div>
    </div>

    <div class="following-info-card">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;color:var(--accent)">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>Tự động scroll trang <code>/following</code> xuống cuối để lộ ra các tài khoản <strong>following cũ nhất</strong> — hữu ích khi muốn unfollow hàng loạt.</p>
    </div>

    <div class="following-card">
      <label for="cleanup-url-input" class="following-label">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Target URL
      </label>
      <div class="cleanup-url-wrap">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="cleanup-url-input" class="cleanup-url-input" placeholder="x.com/username/following" />
      </div>
    </div>

    <div class="cleanup-actions">
      <button class="btn btn--collect" id="btn-cleanup-start">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span id="btn-cleanup-start-text">Start Scan</span>
      </button>
      <button class="btn btn--stop-dl" id="btn-cleanup-stop" style="display:none">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
        </svg>
        Stop
      </button>
    </div>

    <div class="cleanup-progress" id="cleanup-progress" style="display:none">
      <div class="cleanup-progress-bar-wrap">
        <div class="cleanup-progress-bar" id="cleanup-progress-bar" style="width:0%"></div>
      </div>
      <div class="cleanup-progress-info">
        <span id="cleanup-users-count">0 users found</span>
        <span id="cleanup-scroll-count">Scroll: 0</span>
      </div>
    </div>

    <div class="cleanup-status" id="cleanup-status" style="display:none">
      <span class="cleanup-status-dot" id="cleanup-status-dot"></span>
      <span id="cleanup-status-text">Scanning...</span>
    </div>

    <div class="cleanup-results" id="cleanup-results" style="display:none">
      <div class="cleanup-results-header">
        <span id="cleanup-results-title">Oldest Following</span>
        <div class="cleanup-export-btns">
          <button class="btn-queue-export" id="btn-cleanup-copy" title="Copy usernames">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
          <button class="btn-queue-export" id="btn-cleanup-csv" title="Export CSV">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            CSV
          </button>
        </div>
      </div>
      <ul class="cleanup-user-list" id="cleanup-user-list"></ul>
    </div>
  `;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
export function followingSetScrolling(isScrolling: boolean): void {
  const btnStart   = document.getElementById('btn-cleanup-start')  as HTMLButtonElement | null;
  const btnStop    = document.getElementById('btn-cleanup-stop')   as HTMLButtonElement | null;
  const progress   = document.getElementById('cleanup-progress');
  const statusEl   = document.getElementById('cleanup-status');
  const statusDot  = document.getElementById('cleanup-status-dot');
  const statusTxt  = document.getElementById('cleanup-status-text');
  const urlInput   = document.getElementById('cleanup-url-input')  as HTMLInputElement | null;

  if (btnStart)  { btnStart.style.display  = isScrolling ? 'none' : 'inline-flex'; }
  if (btnStop)   { btnStop.style.display   = isScrolling ? 'inline-flex' : 'none'; }
  if (progress)  { progress.style.display  = isScrolling ? 'flex' : progress.style.display; }
  if (statusEl)  { statusEl.style.display  = 'flex'; }
  if (statusDot) { statusDot.className = 'cleanup-status-dot' + (isScrolling ? '' : ' done'); }
  if (statusTxt) { statusTxt.textContent   = isScrolling ? 'Scrolling...' : 'Done!'; }
  if (urlInput)  { urlInput.disabled       = isScrolling; }
}

export function followingSetStatus(type: 'done' | 'error' | 'stopped', message: string): void {
  const statusEl  = document.getElementById('cleanup-status');
  const statusDot = document.getElementById('cleanup-status-dot');
  const statusTxt = document.getElementById('cleanup-status-text');
  if (statusEl)  { statusEl.style.display  = 'flex'; }
  if (statusDot) { statusDot.className = `cleanup-status-dot ${type}`; }
  if (statusTxt) { statusTxt.textContent = message; }
}

export function followingRenderResults(
  users: FollowingUser[],
  total: number,
  scrollCount: number,
  reachedEnd: boolean,
  stopped?: boolean,
  showToast?: ShowToastFn
): void {
  _users = users;

  const progressBar = document.getElementById('cleanup-progress-bar') as HTMLElement | null;
  if (progressBar) { progressBar.style.width = '100%'; }

  const usersEl  = document.getElementById('cleanup-users-count');
  const scrollEl = document.getElementById('cleanup-scroll-count');
  if (usersEl)  { usersEl.textContent  = `${total} users found`; }
  if (scrollEl) { scrollEl.textContent = `Scroll: ${scrollCount}`; }

  const statusMsg = stopped
    ? `Stopped — ${total} users collected`
    : reachedEnd
      ? `Done! ${total} following (oldest first)`
      : `Reached limit — ${total} users`;
  followingSetStatus(stopped ? 'stopped' : 'done', statusMsg);

  const resultsEl = document.getElementById('cleanup-results');
  const titleEl   = document.getElementById('cleanup-results-title');
  const listEl    = document.getElementById('cleanup-user-list');
  if (!resultsEl || !listEl) return;

  resultsEl.style.display = 'flex';
  if (titleEl) { titleEl.textContent = `Oldest Following (${total})`; }

  const shown = users.slice(0, 50);
  listEl.innerHTML = shown.map((u, i) => `
    <li class="cleanup-user-item">
      <span class="cleanup-user-rank${i < 3 ? ' top3' : ''}">#${i + 1}</span>
      <div class="cleanup-user-info">
        <div class="cleanup-user-name">${u.displayName || u.username}</div>
        <div class="cleanup-user-handle">@${u.username}</div>
      </div>
      <a class="cleanup-user-link" href="https://x.com/${u.username}" target="_blank" title="Open profile">↗</a>
    </li>
  `).join('');

  if (total > 50) {
    listEl.innerHTML += `<li class="cleanup-user-item" style="justify-content:center;color:var(--text-muted);font-size:11px">
      ...and ${total - 50} more — export CSV to see all
    </li>`;
  }

  showToast?.(`✓ Done! ${total} following (oldest first)`, 'success');
}

// ─── Main Init ────────────────────────────────────────────────────────────────
export function initFollowingPanel(deps: FollowingPanelDeps): void {
  const { showToast, sendBG } = deps;

  const container = document.getElementById('panel-cleanup');
  if (!container) return;
  container.innerHTML = getHTML();

  const urlInput = container.querySelector<HTMLInputElement>('#cleanup-url-input');
  const btnStart = container.querySelector<HTMLButtonElement>('#btn-cleanup-start');
  const btnStop  = container.querySelector<HTMLButtonElement>('#btn-cleanup-stop');
  const btnCopy  = container.querySelector<HTMLButtonElement>('#btn-cleanup-copy');
  const btnCsv   = container.querySelector<HTMLButtonElement>('#btn-cleanup-csv');

  if (!urlInput || !btnStart) return;

  // Auto-detect URL nếu đang ở trang /following
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    try {
      const parsed = new URL(url.startsWith('http') ? url : 'https://x.com');
      if (/\/[A-Za-z0-9_]+\/following/.test(parsed.pathname)) {
        urlInput.value = url.replace(/^https?:\/\//, '');
      }
    } catch { /* ignore invalid URL */ }
  });

  btnStart.addEventListener('click', async () => {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) { showToast('Nhập URL trang /following', 'error'); return; }
    if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
    if (!/\/following/.test(rawUrl)) rawUrl = rawUrl.replace(/\/?$/, '/following');

    const res = await sendBG('START_FOLLOWING_SCROLL', { targetUrl: rawUrl }) as { error?: string } | null;
    if (res?.error) { showToast(`Lỗi: ${res.error}`, 'error'); return; }

    const progressEl = document.getElementById('cleanup-progress');
    if (progressEl) progressEl.style.display = 'flex';
    const resultsEl = document.getElementById('cleanup-results');
    if (resultsEl) resultsEl.style.display = 'none';
  });

  btnStop?.addEventListener('click', async () => {
    await sendBG('STOP_FOLLOWING_SCROLL', {});
    showToast('⏹ Đang dừng scroll...', 'info');
  });

  btnCopy?.addEventListener('click', () => {
    if (_users.length === 0) { showToast('Chưa có dữ liệu', 'error'); return; }
    navigator.clipboard
      .writeText(_users.map(u => `@${u.username}`).join('\n'))
      .then(() => showToast(`✓ Copied ${_users.length} usernames`, 'success'))
      .catch(() => showToast('Copy thất bại', 'error'));
  });

  btnCsv?.addEventListener('click', () => {
    if (_users.length === 0) { showToast('Chưa có dữ liệu', 'error'); return; }
    const urlRaw = urlInput.value.replace(/^https?:\/\//, '');
    const match = urlRaw.match(/\/([A-Za-z0-9_]+)\/following/);
    const targetUser = match?.[1] || 'unknown';
    const header = 'rank,username,displayName,profileUrl\n';
    const rows = _users.map((u, i) =>
      `${i + 1},"${u.username}","${u.displayName.replace(/"/g, '""')}","https://x.com/${u.username}"`
    ).join('\n');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    chrome.downloads.download({
      url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(header + rows),
      filename: `following_${targetUser}_oldest_${dateStr}.csv`,
      saveAs: false,
    });
    showToast(`✓ Exported ${_users.length} users to CSV`, 'success');
  });
}

// ─── SW Broadcast Handler ─────────────────────────────────────────────────────
export function handleFollowingMessage(
  type: string,
  payload: Record<string, unknown>,
  deps: FollowingPanelDeps
): void {
  const { showToast } = deps;
  switch (type) {
    case 'FOLLOWING_SCROLL_STARTED':
      followingSetScrolling(true);
      break;

    case 'FOLLOWING_SCROLL_PROGRESS': {
      const usersEl    = document.getElementById('cleanup-users-count');
      const scrollEl   = document.getElementById('cleanup-scroll-count');
      const statusEl   = document.getElementById('cleanup-status-text');
      const progressBar = document.getElementById('cleanup-progress-bar') as HTMLElement | null;
      if (usersEl)  { usersEl.textContent  = `${payload['usersFound']} users found`; }
      if (scrollEl) { scrollEl.textContent = `Scroll: ${payload['scrollCount']}`; }
      if (statusEl) {
        statusEl.textContent = payload['isHidden']
          ? 'Tab hidden — pausing...'
          : `Scanning... (${payload['usersFound']} found)`;
      }
      if (progressBar) {
        const pct = Math.min(20 + ((payload['scrollCount'] as number) % 10) * 7, 90);
        progressBar.style.width = pct + '%';
      }
      break;
    }

    case 'FOLLOWING_SCROLL_DONE':
      followingSetScrolling(false);
      followingRenderResults(
        (payload['users']       as FollowingUser[]) || [],
        (payload['total']       as number)          || 0,
        (payload['scrollCount'] as number)          || 0,
        payload['reachedEnd']   as boolean,
        payload['stopped']      as boolean | undefined,
        showToast
      );
      break;

    case 'FOLLOWING_SCROLL_ERROR':
      followingSetScrolling(false);
      followingSetStatus('error', `Error: ${payload['error']}`);
      showToast(`Scroll lỗi: ${payload['error']}`, 'error');
      break;
  }
}
