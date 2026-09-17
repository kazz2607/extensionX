/**
 * popup.ts — Logic Popup
 * Sprint 1 fixes: BUG-L5 (sendBG timeout), SEC-03 (XSS escapeHtml),
 * UI-03 (toast queue), UI-08 (custom confirm modal)
 */
import { initFollowingPanel, handleFollowingMessage } from './following-panel.js';

// ─── State ────────────────────────────────────────────────────────────────────
// @ts-ignore
let currentUsername: string | null = null;
let isCollecting = false;
let isDownloading = false;
let activeFilter = 'all';
let stats = { image: 0, video: 0, gif: 0, hls: 0 };
// @ts-ignore
let downloadHistory: any[] = [];
let lastScrollCount = 0;
let lastScrollTime = Date.now();
let currentSaveFolder = '';  // đọc từ options
// @ts-ignore
let downloadQueue: any[] = [];      // v5.0.3: Multi-Profile Queue
let dateFrom = '';           // v4.3.0: Date Range Filter (YYYY-MM-DD)
let dateTo   = '';           // v4.3.0: Date Range Filter (YYYY-MM-DD)
let _dateRangeOpen = false;  // trạng thái mở/đóng collapsible
let filterKeyword = '';      // v4.8.0: Keyword / Hashtag Filter
let _csvOffset = 0;          // PERF-04: CSV pagination offset (reset khi đổi profile/filter)
const queueProgressById = new Map<string, { current: number; total: number; percent: number }>();

// ─── DOM ───────────────────────────────────────────────────────────────────────
// @ts-ignore
const $ = id => document.getElementById(id);

const els: any = {
  username:     $('profile-username'),
  hint:         $('profile-hint'),
  badge:        $('media-count-badge'),
  avatar:       $('profile-avatar'),
  profileCard:  $('profile-card'),

  tabAll:       $('tab-all'),
  tabImages:    $('tab-images'),
  tabVideos:    $('tab-videos'),
  tabGifs:      $('tab-gifs'),
  tabCountAll:  $('tab-count-all'),
  tabCountImgs: $('tab-count-images'),
  tabCountVids: $('tab-count-videos'),
  tabCountGifs: $('tab-count-gifs'),

  statusDot:    $('status-dot'),
  statusText:   $('status-text'),
  statusSpeed:  $('status-speed'),
  progressWrap: $('progress-wrap'),
  progressFill: $('progress-fill'),
  progressLbl:  $('progress-label'),
  scrollSec:    $('section-scroll'),
  scrollCount:  $('scroll-count'),
  scrollNew:    $('scroll-new'),
  scrollEta:    $('scroll-eta'),

  btnCollect:    $('btn-collect'),
  btnCollectTxt: $('btn-collect-text'),
  btnDownload:   $('btn-download'),
  btnDownloadTxt:$('btn-download-text'),
  btnQueueAdd:   $('btn-queue-add'),     // v5.0.3
  btnCsv:        $('btn-csv'),
  btnClear:      $('btn-clear'),
  btnSettings:   $('btn-settings'),
  btnReload:     $('btn-reload'),
  btnTheme:      $('btn-theme'),
  btnCompact:    $('btn-compact'), // v4.8.0
  historyList:   $('history-list'),
  btnHistClear:  $('btn-history-clear'),
  toast:         $('toast'),

  // v4.1.0 Duplicate Detection
  skipWrap:           $('skip-duplicates-wrap'),
  skipCheckbox:       $('opt-skip-duplicates'),
  downloadedBadge:    $('downloaded-count-badge'),
  btnClearDownloaded: $('btn-clear-downloaded'),

  // v5.0.3 Queue Panel
  queueList:        $('queue-list'),
  queueCountBadge:  $('queue-count-badge'),
  btnQueueStart:    $('btn-queue-start'),
  btnQueueClear:    $('btn-queue-clear'),
  btnQueueAddBar:   $('btn-queue-add-bar'),
  queueAddHint:     $('queue-add-hint'),
  navQueueBadge:    $('nav-queue-badge'),
  // FEA-02: Queue Export/Import
  btnQueueExport:   $('btn-queue-export'),
  inputQueueImport: $('input-queue-import'),

  // UI-04: Onboarding
  onboardingSection: $('onboarding-section'),

  // Bug 2: Stop download
  btnStopDownload:   $('btn-stop-download'),

  // UI-01: Error details
  errorDetails:      $('error-details'),
  errorDetailsCount: $('error-details-count'),
  errorList:         $('error-list'),
  btnRetry:          $('btn-retry'),
  btnErrorClose:     $('btn-error-close'),

  // v5.0.3 Stats / Donut
  donutArcs:     $('donut-arcs'),
  donutTotalNum: $('donut-total-num'),
  legendImages:  $('legend-images'),
  legendVideos:  $('legend-videos'),
  legendGifs:    $('legend-gifs'),
  legendHls:     $('legend-hls'),

  // v4.3.0 Date Range Filter
  sectionDaterange:    $('section-daterange'),
  daterangeToggle:     $('daterange-toggle'),
  daterangeChevron:    $('daterange-chevron'),
  daterangePanel:      $('daterange-panel'),
  daterangeActiveBadge:$('daterange-active-badge'),
  btnDaterangeClear:   $('btn-daterange-clear'),
  inputDateFrom:       $('filter-date-from'),
  inputDateTo:         $('filter-date-to'),
  inputKeyword:        $('filter-keyword'), // v4.8.0
  daterangeCountRow:   $('daterange-count-row'),
  daterangeCountText:  $('daterange-count-text'),
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.load();
    window.i18n.applyToDOM();
  }
  await applyTheme();
  await applyCompactMode(); // v4.8.0
  await loadHistory();
  await loadQueue();                // v5.0.3
  await checkSavedSession();
  await detectCurrentTab();
  setupListeners();
  setupBottomNav();                 // v5.0.3
  setupDateRange();                 // v4.3.0
  listenToMessages();
  await applyFollowingScannerSetting(); // v5.7.1 — hide tab if disabled in settings
  initFollowingPanel({ showToast, sendBG }); // Feature 0 — injected from following-panel.ts
});

// ─── v5.7.1: Following Scanner Feature Toggle ───────────────────────────────
async function applyFollowingScannerSetting(): Promise<void> {
  const stored: any = await chrome.storage.sync.get('options').catch(() => ({}));
  const enabled: boolean = stored?.options?.enableFollowingScanner ?? true;

  const navTab = document.querySelector<HTMLElement>('.nav-tab[data-panel="panel-cleanup"]');
  const panel  = document.getElementById('panel-cleanup');

  if (!enabled) {
    if (navTab) navTab.style.display = 'none';
    if (panel)  panel.style.display  = 'none';
    // Nếu đang ở tab Following, chuyển về Main
    if (navTab?.classList.contains('active')) {
      document.querySelectorAll<HTMLElement>('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll<HTMLElement>('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector<HTMLElement>('.nav-tab[data-panel="panel-main"]')?.classList.add('active');
      document.getElementById('panel-main')?.classList.add('active');
    }
  } else {
    if (navTab) navTab.style.display = '';
    if (panel)  panel.style.display  = '';
  }
}

// ─── Compact Mode (v4.8.0) ──────────────────────────────────────────────────
async function applyCompactMode() {
  const stored: any = await chrome.storage.local.get('compactMode').catch(() => ({}));
  if (stored.compactMode) {
    document.body.classList.add('compact-mode');
  }
}

function toggleCompactMode() {
  const isCompact = document.body.classList.toggle('compact-mode');
  chrome.storage.local.set({ compactMode: isCompact });
}

// ─── Theme ─────────────────────────────────────────────────────────────────
// @ts-ignore
async function applyTheme() {
  const stored: any = await chrome.storage.local.get('theme').catch(() => ({}));
  let theme = stored.theme || 'dark';
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  chrome.storage.local.set({ theme: next });
}

// v4.1.0: System theme auto switch
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  const stored: any = await chrome.storage.local.get('theme').catch(() => ({}));
  if (stored.theme === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// ─── v4.3.0: Date Range Filter ─────────────────────────────────────────────────────────────────
function setupDateRange() {
  if (!els.daterangeToggle) return;

  // UI-02: Toggle có animation — dùng max-height thay vì display:block/none
  els.daterangeToggle.addEventListener('click', () => {
    _dateRangeOpen = !_dateRangeOpen;
    els.daterangePanel.classList.toggle('open', _dateRangeOpen);
    els.daterangeChevron.classList.toggle('open', _dateRangeOpen);
  });

  // Date inputs — debounce để không query SW quá nhiều
// @ts-ignore
  let _debounceTimer;
  const onDateChange = () => {
// @ts-ignore
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      dateFrom = els.inputDateFrom.value;
      dateTo   = els.inputDateTo.value;
      filterKeyword = els.inputKeyword ? els.inputKeyword.value.trim() : '';
      updateDateRangeUI();
      updateDateRangeCount();
    }, 300);
  };
  els.inputDateFrom.addEventListener('change', onDateChange);
  els.inputDateTo.addEventListener('change', onDateChange);
  if (els.inputKeyword) els.inputKeyword.addEventListener('input', onDateChange); // v4.8.0

  // Preset buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
// @ts-ignore
      const preset = btn.dataset.preset;
      const now = new Date();
      const toDate = now.toISOString().slice(0, 10);
      let fromDate = '';

      if (preset === '7d') {
// @ts-ignore
        fromDate = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
      } else if (preset === '30d') {
// @ts-ignore
        fromDate = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
      } else if (preset === '90d') {
// @ts-ignore
        fromDate = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
      } else if (preset === '1y') {
        fromDate = `${now.getFullYear()}-01-01`;
      }

      els.inputDateFrom.value = fromDate;
      els.inputDateTo.value   = toDate;
      dateFrom = fromDate;
      dateTo   = toDate;

      // Update active state
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      updateDateRangeUI();
      updateDateRangeCount();
    });
  });

  // Clear button
  if (els.btnDaterangeClear) {
    els.btnDaterangeClear.addEventListener('click', () => {
      clearDateRange();
    });
  }
}

function clearDateRange() {
  dateFrom = ''; dateTo = ''; filterKeyword = '';
  if (els.inputDateFrom) els.inputDateFrom.value = '';
  if (els.inputDateTo)   els.inputDateTo.value   = '';
  if (els.inputKeyword)  els.inputKeyword.value  = '';
  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  updateDateRangeUI();
  if (els.daterangeCountRow) els.daterangeCountRow.style.display = 'none';
  updateButtons();
}

function updateDateRangeUI() {
  const hasFilter = !!dateFrom || !!dateTo || !!filterKeyword;

  if (els.daterangeToggle) els.daterangeToggle.classList.toggle('has-filter', hasFilter);
  if (els.daterangeActiveBadge) els.daterangeActiveBadge.style.display = hasFilter ? 'inline' : 'none';
  if (els.btnDaterangeClear)    els.btnDaterangeClear.style.display    = hasFilter ? 'flex'   : 'none';

  // Update download button badge
  updateButtons();
}

// @ts-ignore
let _countTimer;
async function updateDateRangeCount() {
// @ts-ignore
  if (!currentUsername) return;
  if (!dateFrom && !dateTo) return;

// @ts-ignore
    clearTimeout(_countTimer);
  _countTimer = setTimeout(async () => {
    const res: any = await sendBG('GET_MEDIA_COUNT_FILTERED', {
// @ts-ignore
      username: currentUsername,
      filterType: activeFilter,
      dateFrom,
      dateTo,
      keyword: filterKeyword,
    });
    const count = res?.count ?? 0;
    if (els.daterangeCountRow) els.daterangeCountRow.style.display = 'flex';
    if (els.daterangeCountText) {
      els.daterangeCountText.textContent = `${count} item${count !== 1 ? 's' : ''} match filter`;
    }
  }, 200);
}

// ─── v5.0.3: Bottom Nav ───────────────────────────────────────────────────────
function setupBottomNav() {
  const navTabs = Array.from(document.querySelectorAll<HTMLElement>('.nav-tab'));
  const activate = (tab: HTMLElement) => {
    const panelId = tab.dataset.panel;
    if (!panelId) return;
    navTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
    if (panelId === 'panel-stats') renderDonutChart();
  };
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = navTabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? navTabs.length - 1 :
        (current + (event.key === 'ArrowRight' ? 1 : -1) + navTabs.length) % navTabs.length;
      navTabs[next].focus();
      activate(navTabs[next]);
    });
  });
}

// ─── v5.0.3: Queue ────────────────────────────────────────────────────────────
async function loadQueue() {
  const res: any = await sendBG('GET_QUEUE', {});
  downloadQueue = res?.queue || [];
  renderQueue();
}

// P3: Cache chữ ký queue — tránh rebuild toàn bộ DOM nếu chỉ progress thay đổi
let _lastQueueSignature = '';

function getQueueSignature(queue: any[]): string {
  // Signature = id+status của từng item; không bao gồm progress để progress update không trigger rebuild
  return queue.map((q: any) => `${q.id}:${q.status}`).join('|');
}

function renderQueue() {
  const list = els.queueList;
  if (!list) return;
  const activeQueueIds = new Set(downloadQueue.map((item: any) => item.id));
  for (const id of queueProgressById.keys()) {
    if (!activeQueueIds.has(id)) queueProgressById.delete(id);
  }

  // Update badges
// @ts-ignore
  const waitingCount = downloadQueue.filter(q => q.status === 'waiting').length;
// @ts-ignore
  const totalActive = downloadQueue.filter(q => q.status !== 'done' && q.status !== 'error').length;

  if (els.queueCountBadge) {
    els.queueCountBadge.textContent = totalActive;
    els.queueCountBadge.style.display = totalActive > 0 ? 'inline' : 'none';
  }
  if (els.navQueueBadge) {
    els.navQueueBadge.textContent = waitingCount;
    els.navQueueBadge.style.display = waitingCount > 0 ? 'flex' : 'none';
  }

  // P3: Kiểm tra signature — bỏ qua full rebuild nếu chỉ progress thay đổi
  const sig = getQueueSignature(downloadQueue as any[]);
  const needsRebuild = sig !== _lastQueueSignature;
  _lastQueueSignature = sig;

  if (!needsRebuild) {
    // Chỉ cập nhật progress của item đang tải
    const activeItem = (downloadQueue as any[]).find((q: any) => q.status === 'downloading');
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
  const filterIcons: Record<string, string>  = { all: '📦', images: '🖼️', videos: '🎬', gifs: '🎞️' };

  const fragment = document.createDocumentFragment();
  (downloadQueue as any[]).forEach(item => {
    const icon = filterIcons[item.filterType || 'all'] || '📦';
    const statusLabel = statusLabels[item.status] || String(item.status || '');
    const metaText = item.result
      ? (item.result.error ? String(item.result.error).slice(0, 500) : `${Number(item.result.success)||0}/${Number(item.result.total)||0} files`)
      : `${Number(item.mediaCount)||0} media · ${icon} ${String(item.filterType || '').slice(0, 30)}`;
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
  const activeItem = (downloadQueue as any[]).find(q => q.status === 'downloading');
  if (activeItem) {
    const savedProgress = queueProgressById.get(activeItem.id);
    if (savedProgress) updateQueueItemProgress(savedProgress);
  }

  // Remove listeners
// @ts-ignore
  list.querySelectorAll('.btn-queue-remove').forEach(btn => {
// @ts-ignore
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await sendBG('REMOVE_FROM_QUEUE', { id });
      showToast('Đã xóa khỏi hàng đợi', 'info');
    });
  });

  // Bug 2: Stop button cho item đang downloading trong queue
// @ts-ignore
  list.querySelectorAll('.btn-queue-stop').forEach(btn => {
// @ts-ignore
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sendBG('STOP_DOWNLOAD', {});
      showToast('⏹ Đang dừng download...', 'info');
    });
  });
}

// UI-06 + FEA-03: Cập nhật progress bar + file count live của queue item đang downloading
function updateQueueItemProgress(payload: any) {
  const active = (downloadQueue as any[]).find(q => q.status === 'downloading');
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

async function addCurrentToQueue() {
// @ts-ignore
  if (!currentUsername) return;
  const mediaCount = parseInt(els.badge.textContent) || 0;
  if (mediaCount === 0) {
    showToast('Chưa có media — hãy thu thập trước', 'error');
    return;
  }
  const skipDuplicates = els.skipCheckbox ? els.skipCheckbox.checked : true;
  const res: any = await sendBG('ADD_TO_QUEUE', {
    username: currentUsername,
    filterType: activeFilter,
    skipDuplicates,
    keyword: filterKeyword,
  });
  if (res?.error === 'Already in queue') {
    showToast(`@${currentUsername} đã trong hàng đợi`, 'info');
  } else if (res?.ok) {
    showToast(`✓ Đã thêm @${currentUsername} vào queue`, 'success');
    // Switch to queue tab
    document.getElementById('nav-queue')?.click();
  } else {
    showToast('Lỗi khi thêm vào queue', 'error');
  }
}

// ─── v5.0.3: Donut Chart ──────────────────────────────────────────────────────
function renderDonutChart() {
  const arcs = els.donutArcs;
  const totalEl = els.donutTotalNum;
  if (!arcs || !totalEl) return;

  const data = [
    { key: 'image', color: '#1D9BF0', label: 'Images', val: stats.image || 0 },
    { key: 'video', color: '#a855f7', label: 'Videos', val: (stats.video || 0) + (stats.hls || 0) },
    { key: 'gif',   color: '#00ba7c', label: 'GIFs',   val: stats.gif || 0 },
    { key: 'hls',   color: '#ff7a00', label: 'HLS',    val: 0 }, // merged into video
  ];

  // Merge HLS into video (already done above), show separate HLS legend
  const hlsOnly = stats.hls || 0;
  if (els.legendHls) els.legendHls.textContent = hlsOnly;

  const total = (stats.image || 0) + (stats.video || 0) + (stats.gif || 0) + (stats.hls || 0);
  totalEl.textContent = total > 9999 ? '9k+' : String(total);

  if (els.legendImages) els.legendImages.textContent = stats.image || 0;
  if (els.legendVideos) els.legendVideos.textContent = (stats.video || 0) + (stats.hls || 0);
  if (els.legendGifs)   els.legendGifs.textContent   = stats.gif || 0;

  const svgArcs = arcs as unknown as SVGElement;

  if (total === 0) {
    // P3: Update incremental — chỉ set attribute không dùng innerHTML
    const existing = Array.from(svgArcs.querySelectorAll<SVGCircleElement>('circle'));
    if (existing.length === 1 && existing[0].getAttribute('stroke') === 'var(--border)') {
      // Đã đúng, không cần thay đổi
    } else {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
      c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '38');
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'var(--border)'); c.setAttribute('stroke-width', '12');
      arcs.replaceChildren(c);
    }
    return;
  }

  // P3: Draw arcs — reuse các circle node hiện có nếu có thể, chỉ tạo mới khi cần
  const r = 38;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const activeSegments = data.filter((d: any) => d.val > 0);
  const existingCircles = Array.from(svgArcs.querySelectorAll<SVGCircleElement>('circle'));

  // Điều chỉnh số lượng circle với số segment
  while (existingCircles.length > activeSegments.length) existingCircles.pop()!.remove();
  while (existingCircles.length < activeSegments.length) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle') as SVGCircleElement;
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '12');
    c.style.transition = 'stroke-dasharray 0.5s ease';
    c.style.transformOrigin = '50% 50%';
    arcs.appendChild(c);
    existingCircles.push(c);
  }

  activeSegments.forEach((seg: any, i: number) => {
    const frac = seg.val / total;
    const dash = frac * circ;
    const gap  = circ - dash;
    existingCircles[i].setAttribute('stroke', seg.color);
    existingCircles[i].setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${gap.toFixed(2)}`);
    existingCircles[i].setAttribute('stroke-dashoffset', `${(-offset * circ / 360).toFixed(2)}`);
    offset += frac * 360;
  });
}





// ─── Session Restore ──────────────────────────────────────────────────────────
async function checkSavedSession() {
  try {
    const res: any = await sendBG('GET_SAVED_SESSION', {});
    const session = res?.session;
    if (!session?.username || !session?.mediaCount) return;

    const minutesAgo = Math.round((Date.now() - (session.savedAt || 0)) / 60000);
    const timeStr = minutesAgo < 1   ? 'vừa xong'
                  : minutesAgo < 60  ? `${minutesAgo} phút trước`
                  : `${Math.round(minutesAgo / 60)} giờ trước`;

    showRestoreBanner(session.username, session.mediaCount, session.scrollCount || 0, timeStr);
  } catch (_) {}
}

// @ts-ignore
function showRestoreBanner(username, count, scrolls, timeStr) {
  const banner = document.getElementById('restore-banner');
  if (!banner) return;

// @ts-ignore
  document.getElementById('restore-username').textContent = `@${username}`;
// @ts-ignore
  document.getElementById('restore-detail').textContent =
    `${count} media · ${scrolls} scrolls · ${timeStr}`;

  banner.style.display = 'flex';

// @ts-ignore
  document.getElementById('btn-restore').onclick = async () => {
    banner.style.display = 'none';
    const res: any = await sendBG('RESTORE_SESSION', { username });
    if (res?.ok) {
      showToast(`✓ Đã khôi phục ${(res as any).count} media của @${username}`, 'success');
      await setCurrentUser(username);
    } else {
      showToast('Ảnh/video cũ không tìm thấy', 'error');
    }
  };

// @ts-ignore
  document.getElementById('btn-restore-cancel').onclick = async () => {
    banner.style.display = 'none';
    await sendBG('RESTORE_SESSION_CANCEL', { username });
    showToast('Đã hủy phiên cũ', 'info');
  };
}

// ─── Detect active tab ────────────────────────────────────────────────────────
// UI-04: Hiện/ẩn onboarding card
function updateOnboardingState() {
  if (!els.onboardingSection) return;
  els.onboardingSection.style.display = currentUsername ? 'none' : 'block';
}

async function detectCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { updateOnboardingState(); return; }

  const url = tab.url;
  if (!url.includes('x.com') && !url.includes('twitter.com')) {
    setStatus('idle', window.i18n ? window.i18n.t('profile_hint_default') : 'Mở X.com để bắt đầu');
    updateOnboardingState(); // UI-04: không phải X.com → hiện onboarding
    return;
  }

// @ts-ignore
  chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, (res: any) => {
    if (chrome.runtime.lastError || !res?.username) {
      updateOnboardingState(); // UI-04: trên X.com nhưng không nhận ra profile
      return;
    }
    setCurrentUser(res.username);
  });
}

// @ts-ignore
async function setCurrentUser(username) {
  if (currentUsername !== username) _csvOffset = 0;
  currentUsername = username;
  updateOnboardingState(); // UI-04: ẩn onboarding khi biết profile

  els.username.textContent = `@${username}`;
  els.hint.textContent = window.i18n ? window.i18n.t('profile_hint_active') : 'Profile đang được xem';
  els.profileCard.classList.add('active');
  els.avatar.textContent = username.slice(0, 2).toUpperCase();

  // Cập nhật queue add bar hint
  if (els.queueAddHint) els.queueAddHint.textContent = `@${username} — thêm vào hàng đợi`;
  if (els.btnQueueAddBar) els.btnQueueAddBar.disabled = false;
  if (els.btnQueueAdd)    els.btnQueueAdd.disabled    = false;

  await updateFolderDisplay(username);

  const [countRes, statsRes, stateRes, dlStateRes, downloadedRes] = await Promise.all([
    sendBG('GET_MEDIA_COUNT', { username }),
    sendBG('GET_STATS', { username }),
    sendBG('GET_TAB_STATE', { username }),
    sendBG('GET_DOWNLOAD_STATE', {}),
    sendBG('GET_DOWNLOADED_COUNT', { username }),
  ]);

// @ts-ignore
  if (statsRes?.stats) {
// @ts-ignore
    stats = statsRes.stats;
    updateStatTabs();
  }

// @ts-ignore
  updateMediaCount(countRes?.count || 0);

  // v4.3.0: Hiện Date Range Filter section khi có media
  if (els.sectionDaterange) {
    els.sectionDaterange.style.display = 'block';
  }

  // v4.1.0: Duplicate Detection UI
  const dlCount = (downloadedRes as any)?.count || 0;
  if (els.downloadedBadge) {
    if (dlCount > 0) {
      els.downloadedBadge.style.display = 'inline-block';
      const doneTxt = window.i18n ? window.i18n.t('status_done') : 'đã tải';
      els.downloadedBadge.textContent = `${dlCount} ${doneTxt}`;
      if (els.btnClearDownloaded) els.btnClearDownloaded.style.display = 'inline-block';
    } else {
      els.downloadedBadge.style.display = 'none';
      if (els.btnClearDownloaded) els.btnClearDownloaded.style.display = 'none';
    }
  }

  // Khôi phục preference skip duplicates từ storage
  try {
    const pref = await chrome.storage.local.get('pref_skip_duplicates');
    if (els.skipCheckbox && pref.pref_skip_duplicates !== undefined) {
      els.skipCheckbox.checked = pref.pref_skip_duplicates;
    }
  } catch (_) {}

  // BUG-8 FIX: Restore download state
// @ts-ignore
  if (dlStateRes?.isDownloading) {
    isDownloading = true;
    showProgress(true);
    const downloadingTxt = window.i18n ? window.i18n.t('status_downloading') : 'Đang tải...';
    setStatus('downloading', downloadingTxt);
  }

// @ts-ignore
  if (stateRes?.isCollecting) {
    isCollecting = true;
    els.scrollSec.style.display = 'block';
// @ts-ignore
    els.scrollCount.textContent = stateRes.scrollCount || 0;
    const collectingTxt = window.i18n ? window.i18n.t('status_collecting') : 'Đang thu thập media...';
    setStatus('collecting', collectingTxt);
// @ts-ignore
  } else if (!dlStateRes?.isDownloading) {
    isCollecting = false;
    els.scrollSec.style.display = 'none';
    const readyTxt = window.i18n ? window.i18n.t('status_ready') : 'Sẵn sàng';
    setStatus('ready', `${readyTxt} — @${username}`);
  }

  updateButtons();
}

// ─── Stats & Tabs ─────────────────────────────────────────────────────────────
function updateStatTabs() {
  const total = (stats.image || 0) + (stats.video || 0) + (stats.gif || 0) + (stats.hls || 0);
  const videoTotal = (stats.video || 0) + (stats.hls || 0);

  els.tabCountAll.textContent  = total;
  els.tabCountImgs.textContent = stats.image || 0;
  els.tabCountVids.textContent = videoTotal;
  els.tabCountGifs.textContent = stats.gif || 0;
}

// @ts-ignore
function updateMediaCount(count) {
  els.badge.textContent = count > 9999 ? '9999+' : String(count);
  els.badge.classList.add('pulse');
  setTimeout(() => els.badge.classList.remove('pulse'), 600);
  updateButtons();
}

function getFilteredCount() {
  const badgeCount = parseInt(els.badge?.textContent) || 0;
  if (activeFilter === 'all') {
    const sum = (stats.image || 0) + (stats.video || 0) + (stats.gif || 0) + (stats.hls || 0);
    return sum > 0 ? sum : badgeCount;
  }
  if (activeFilter === 'images') return (stats.image || 0) || (badgeCount > 0 ? badgeCount : 0);
  if (activeFilter === 'videos') return (stats.video || 0) + (stats.hls || 0);
  if (activeFilter === 'gifs')   return stats.gif || 0;
  return 0;
}

// ─── Filter Tabs ──────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
// @ts-ignore
      activeFilter = tab.dataset.filter;
      _csvOffset = 0; // PERF-04: reset CSV pagination khi đổi filter
      updateButtons();

      const dlTxt = window.i18n ? window.i18n.t('btn_download') : 'Download';
      const labels = {
        all: dlTxt,
        images: window.i18n ? window.i18n.t('tab_images') : 'Ảnh',
        videos: window.i18n ? window.i18n.t('tab_videos') : 'Video',
        gifs: window.i18n ? window.i18n.t('tab_gifs') : 'GIF',
      };
      const cnt = getFilteredCount();
      els.btnDownloadTxt.textContent = cnt > 0
// @ts-ignore
        ? `${labels[activeFilter]} (${cnt})`
// @ts-ignore
        : labels[activeFilter];
    });
  });
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
function updateButtons() {
// @ts-ignore
  const hasUser = !!currentUsername;
  const totalCount = parseInt(els.badge.textContent) || 0;
  const filteredCount = getFilteredCount();

  els.btnCollect.disabled  = !hasUser || isDownloading;
  els.btnDownload.disabled = !hasUser || filteredCount === 0 || isDownloading;
  els.btnCsv.disabled      = !hasUser || totalCount === 0;
  els.btnClear.disabled    = !hasUser || totalCount === 0;
  if (els.btnQueueAdd)    els.btnQueueAdd.disabled    = !hasUser || filteredCount === 0;
  if (els.btnQueueAddBar) els.btnQueueAddBar.disabled = !hasUser;

  // Bug 2: Hiện nút Stop khi đang tải, ẩn khi rảnh
  if (els.btnStopDownload) {
    els.btnStopDownload.style.display = isDownloading ? 'inline-flex' : 'none';
  }

  if (isCollecting) {
    els.btnCollect.classList.add('collecting');
    els.btnCollectTxt.textContent = window.i18n ? window.i18n.t('btn_collect_stop') : 'Dừng Thu Thập';
  } else {
    els.btnCollect.classList.remove('collecting');
    els.btnCollectTxt.textContent = window.i18n ? window.i18n.t('btn_collect_start') : 'Bắt đầu Thu Thập';
  }
}

// ─── Scroll Speed ─────────────────────────────────────────────────────────────
// @ts-ignore
function updateScrollSpeed(newCount) {
  const now = Date.now();
  const elapsed = (now - lastScrollTime) / 1000;
  const delta = newCount - lastScrollCount;

  if (elapsed > 0 && delta > 0) {
    const rate = (delta / elapsed * 60).toFixed(0);
    els.statusSpeed.textContent = `${rate}/min`;
  }

  lastScrollCount = newCount;
  lastScrollTime = now;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupListeners() {
  setupTabs();

  // Collect toggle
  els.btnCollect.addEventListener('click', async () => {
// @ts-ignore
    if (!currentUsername) return;

    if (isCollecting) {
      isCollecting = false;
      await sendBG('STOP_COLLECTING', { username: currentUsername });
      const stoppedTxt = window.i18n ? window.i18n.t('status_stopped') : 'Đã dừng';
      setStatus('ready', `${stoppedTxt} — @${currentUsername}`);
      els.statusSpeed.textContent = '';
    } else {
      isCollecting = true;
      lastScrollCount = parseInt(els.badge.textContent) || 0;
      lastScrollTime = Date.now();
      await sendBG('START_COLLECTING', { username: currentUsername });
      const collectingTxt = window.i18n ? window.i18n.t('status_collecting') : 'Đang thu thập media...';
      setStatus('collecting', collectingTxt);
      els.scrollSec.style.display = 'block';
    }
    updateButtons();
  });

  // Download
  els.btnDownload.addEventListener('click', async () => {
// @ts-ignore
    if (!currentUsername || isDownloading) return;
    const filteredCount = getFilteredCount();
    if (filteredCount === 0) { showToast('Không có media để tải', 'error'); return; }

    isDownloading = true;
    updateButtons();
    const preparingTxt = window.i18n ? window.i18n.t('status_downloading') : 'Chuẩn bị download...';
    setStatus('downloading', preparingTxt);
    showProgress(true);

    await sendBG('START_DOWNLOAD', {
      username: currentUsername,
      options: {
        filterType: activeFilter,
        skipDuplicates: els.skipCheckbox ? els.skipCheckbox.checked : true,
        // v4.3.0: Truyền date range vào SW
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
        keyword:  filterKeyword || undefined, // v4.8.0
      }
    });
  });

  // Add to Queue (action row button)
  if (els.btnQueueAdd) {
    els.btnQueueAdd.addEventListener('click', addCurrentToQueue);
  }

  // Add to Queue (queue panel bar button)
  if (els.btnQueueAddBar) {
    els.btnQueueAddBar.addEventListener('click', addCurrentToQueue);
  }

  // Queue Start
  if (els.btnQueueStart) {
    els.btnQueueStart.addEventListener('click', async () => {
      await sendBG('START_QUEUE', {});
      showToast('Hàng đợi đã bắt đầu', 'success');
    });
  }

  // Queue Clear
  if (els.btnQueueClear) {
    els.btnQueueClear.addEventListener('click', async () => {
      if (!confirm('Xóa toàn bộ hàng đợi (không xóa item đang tải)?')) return;
      await sendBG('CLEAR_QUEUE', {});
      showToast('Đã xóa hàng đợi', 'info');
    });
  }

  // FEA-02: Queue Export
  if (els.btnQueueExport) {
    els.btnQueueExport.addEventListener('click', async () => {
      const res: any = await sendBG('EXPORT_QUEUE', {});
      if (!res?.ok || !res.data) { showToast('Không có dữ liệu để xuất', 'error'); return; }
      const json = JSON.stringify(res.data, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      chrome.downloads.download({ url: dataUrl, filename: `extensionx_queue_${dateStr}.json`, saveAs: false });
      showToast(`✓ Đã xuất ${res.data.queue?.length || 0} profile(s)`, 'success');
    });
  }

  // FEA-02: Queue Import
  if (els.inputQueueImport) {
    els.inputQueueImport.addEventListener('change', async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      (e.target as HTMLInputElement).value = '';
      try {
        const text = await file.text();
        const res: any = await sendBG('IMPORT_QUEUE', { data: text });
        if (res?.error) {
          showToast(`Import lỗi: ${res.error}`, 'error');
        } else {
          showToast(`✓ Đã import ${res.added} profile(s) (bỏ qua ${res.skipped})`, 'success');
        }
      } catch (err: any) {
        showToast(`Import thất bại: ${err.message}`, 'error');
      }
    });
  }

  // CSV Export
  els.btnCsv.addEventListener('click', async () => {
// @ts-ignore
    if (!currentUsername) return;
    const res: any = await sendBG('EXPORT_CSV', {
      username: currentUsername,
      filterType: activeFilter,
      offset: _csvOffset,  // PERF-04: pagination
    });

    if (!res?.csv) { showToast('Không có dữ liệu để xuất', 'error'); return; }

    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(res.csv);
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    // PERF-04: Thêm số trang vào filename khi truncated
    const pageNum = Math.floor(_csvOffset / 10000) + 1;
    const pageLabel = res.truncated || _csvOffset > 0 ? `_p${pageNum}` : '';
    chrome.downloads.download({
      url: dataUrl,
      filename: `${currentUsername}_media_${dateStr}${pageLabel}.csv`,
      saveAs: false,
    });
    if (res.truncated) {
      _csvOffset = res.nextOffset ?? 0; // chuẩn bị sẵn offset trang tiếp
      showToast(
        `Đã xuất trang ${pageNum}: ${res.exported.toLocaleString()}/${res.total.toLocaleString()} URLs — bấm lại để xuất tiếp`,
        'warning'
      );
    } else {
      _csvOffset = 0; // reset sau khi xuất hết
      showToast(`Đã xuất ${res.exported.toLocaleString()} URLs ra CSV`, 'success');
    }
  });

  // Duplicate Skip checkbox change listener
  if (els.skipCheckbox) {
    els.skipCheckbox.addEventListener('change', () => {
      chrome.storage.local.set({ pref_skip_duplicates: els.skipCheckbox.checked }).catch(() => {});
      showToast(
        els.skipCheckbox.checked
          ? '✓ Sẽ bỏ qua các file đã tải trước đó'
          : '⚠ Sẽ tải lại tất cả file (kể cả file đã tải)',
        'info'
      );
    });
  }

  // Clear Downloaded History button listener
  if (els.btnClearDownloaded) {
    els.btnClearDownloaded.addEventListener('click', async () => {
      if (!currentUsername) return;
      await sendBG('CLEAR_DOWNLOADED', { username: currentUsername });
      if (els.downloadedBadge) els.downloadedBadge.style.display = 'none';
      els.btnClearDownloaded.style.display = 'none';
      showToast(`✓ Đã xóa lịch sử tải của @${currentUsername}! Bạn có thể tải lại toàn bộ file.`, 'success');
    });
  }

  // Clear — UI-08: dùng custom modal thay vì window.confirm()
  els.btnClear.addEventListener('click', async () => {
// @ts-ignore
    if (!currentUsername) return;
    const confirmed = await showConfirmModal(`Xóa toàn bộ media và lịch sử tải của @${currentUsername}?`);
    if (!confirmed) return;

    await sendBG('CLEAR_MEDIA', { username: currentUsername });
    stats = { image: 0, video: 0, gif: 0, hls: 0 };
    updateStatTabs();
    updateMediaCount(0);
    if (els.downloadedBadge) els.downloadedBadge.style.display = 'none';
    if (els.btnClearDownloaded) els.btnClearDownloaded.style.display = 'none';
    setStatus('ready', 'Đã xóa');
    showToast('Đã xóa danh sách media & lịch sử tải', 'info');
  });

  // Settings
  els.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Reload Tab
  if (els.btnReload) {
    els.btnReload.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.reload(tab.id);
        window.close();
      }
    });
  }

  // Bug 2: Stop download button
  if (els.btnStopDownload) {
    els.btnStopDownload.addEventListener('click', async () => {
      await sendBG('STOP_DOWNLOAD', {});
      isDownloading = false;
      showProgress(false);
      setStatus('ready', 'Đã dừng tải');
      updateButtons();
      showToast('⏹ Đã dừng tải xuống', 'info');
    });
  }

  // UI-01: Error details — Retry và Close
  if (els.btnRetry) {
    els.btnRetry.addEventListener('click', async () => {
      els.errorDetails.style.display = 'none';
      await sendBG('RETRY_FAILED', {});
      showToast('Đang retry các file lỗi...', 'info');
      isDownloading = true;
      showProgress(true);
      updateButtons();
    });
  }
  if (els.btnErrorClose) {
    els.btnErrorClose.addEventListener('click', () => {
      els.errorDetails.style.display = 'none';
    });
  }

  // Theme toggle
  els.btnTheme.addEventListener('click', toggleTheme);

  // Compact Mode toggle
  if (els.btnCompact) {
    els.btnCompact.addEventListener('click', toggleCompactMode);
  }

  // History clear
  els.btnHistClear.addEventListener('click', async () => {
    downloadHistory = [];
    await chrome.storage.local.remove('download_history');
    renderHistory();
    showToast('Đã xóa lịch sử', 'info');
  });
}

// ─── Message Listener ─────────────────────────────────────────────────────────
function listenToMessages() {
  chrome.runtime.onMessage.addListener((msg) => {
    const { type, payload } = msg;

    switch (type) {
      case 'MEDIA_COUNT_UPDATE':
// @ts-ignore
        if (payload.username !== currentUsername) break;
        if (payload.stats) { stats = payload.stats; updateStatTabs(); }
        updateMediaCount(payload.count);
        // UI-02: Realtime donut khi Stats panel đang mở
        if (document.getElementById('panel-stats')?.classList.contains('active')) renderDonutChart();
        break;

      // PERF-03: Cảnh báo bộ nhớ khi store > 50k items
      case 'MEDIA_MEMORY_WARNING':
// @ts-ignore
        if (payload.username !== currentUsername) break;
        showToast(
          `⚠️ ${(payload.count as number).toLocaleString()} media trong bộ nhớ — nên tải xuống trước khi thu thập thêm`,
          'warning'
        );
        break;

      case 'SCROLL_PROGRESS':
// @ts-ignore
        if (payload.username !== currentUsername) break;
        els.scrollCount.textContent = payload.scrollCount;
        const prevBadge = parseInt(els.badge.textContent) || 0;
        const newMedia = (payload.mediaCount || 0) - prevBadge;
        els.scrollNew.textContent = newMedia >= 0 ? `+${newMedia}` : newMedia;
        if (payload.stats) { stats = payload.stats; updateStatTabs(); }
        updateMediaCount(payload.mediaCount);
        updateScrollSpeed(payload.mediaCount);
        
        // P1: Adaptive Speed
        if (payload.adaptiveSpeed) {
          els.statusSpeed.textContent = ` (Adaptive speed: ${(payload.adaptiveSpeed / 1000).toFixed(1)}s)`;
        } else {
          els.statusSpeed.textContent = '';
        }
        break;

      case 'COLLECT_STARTED':
// @ts-ignore
        if (payload.username === currentUsername) {
          isCollecting = true;
          updateButtons();
        }
        break;

      case 'COLLECT_DONE':
// @ts-ignore
        if (payload.username !== currentUsername) break;
        isCollecting = false;
        // UI-01: Reset scroll display về trạng thái ban đầu
        els.scrollSec.style.display = 'none';
        els.statusSpeed.textContent = '';
        if (els.scrollCount) els.scrollCount.textContent = '0';
        if (els.scrollNew)   els.scrollNew.textContent   = '';
        {
          const reasonMsg = payload.reachedEnd
            ? `✓ Hoàn tất! ${payload.mediaCount} media`
            : payload.reason === 'max_scrolls'
              ? `Đạt giới hạn scroll — ${payload.mediaCount} media`
              : payload.reason === 'auto_stop'
                ? `⏹ Auto-Stop sau ${payload.autoStopAfter ?? 10} scroll không có mới — ${payload.mediaCount} media`
                : `Đã dừng — ${payload.mediaCount} media`;
          setStatus('done', reasonMsg);
          showToast(reasonMsg, payload.reason === 'auto_stop' ? 'info' : 'success');
        }
        updateButtons();
        break;

      case 'COLLECT_STOPPED':
        isCollecting = false;
        els.scrollSec.style.display = 'none';
        els.statusSpeed.textContent = '';
        updateButtons();
        break;

      case 'DOWNLOAD_STARTED':
// @ts-ignore
        if (payload.username === currentUsername) {
          const label = activeFilter !== 'all' ? ` (${activeFilter})` : '';
          setStatus('downloading', `Đang tải ${payload.total} files${label}...`);
        }
        break;

      case 'DOWNLOAD_PROGRESS':
// @ts-ignore
        if (payload.username !== currentUsername) break;
        els.progressFill.style.width = `${payload.percent}%`;
        els.progressLbl.textContent = `${payload.current} / ${payload.total}`;

        if (payload.done) {
          if (payload.failed > 0) {
            const errDetails = (payload.errors || []).join(' | ');
            setStatus('error', `Hoàn tất ${payload.success}/${payload.total} (Lỗi: ${errDetails})`);
          } else {
            setStatus('success', `✓ Hoàn tất ${payload.success}/${payload.total} files`);
          }
        } else {
          setStatus('downloading', `Đang tải: ${payload.currentFile || ''} (${payload.success}/${payload.total})`);
        }
        updateQueueItemProgress(payload); // UI-06: live progress trong Queue tab
        break;

      case 'ACTIVE_DOWNLOADS_UPDATE':
        // payload: Array<{filename, bytesReceived, totalBytes, speedBps}>
        const listEl = document.getElementById('active-downloads-list');
        if (!listEl) break;
        if (payload && payload.length > 0) {
          listEl.style.display = 'flex';
          const fragment = document.createDocumentFragment();
          payload.forEach((item: any) => {
            const formatSize = (bytes: number) => (Math.max(0, Number(bytes) || 0) / 1024 / 1024).toFixed(1) + ' MB';
            const name = String(item.filename || '').slice(0, 255);
            const speed = formatSize(item.speedBps) + '/s';
            const percent = item.totalBytes ? Math.round((Number(item.bytesReceived) / Number(item.totalBytes)) * 100) + '%' : formatSize(item.bytesReceived);
            const row = document.createElement('div');
            row.className = 'active-download-item';
            const nameEl = document.createElement('span');
            nameEl.className = 'active-download-name';
            nameEl.title = name;
            nameEl.textContent = name;
            const speedEl = document.createElement('span');
            speedEl.className = 'active-download-speed';
            speedEl.textContent = `${percent} • ${speed}`;
            row.append(nameEl, speedEl);
            fragment.append(row);
          });
          listEl.replaceChildren(fragment);
        } else {
          listEl.style.display = 'none';
          listEl.replaceChildren();
        }
        break;

      case 'HLS_PROGRESS':
// @ts-ignore
        if (payload.username === currentUsername) {
          setStatus('downloading', `HLS: ${payload.fetched}/${payload.total} segments`);
        }
        break;

      case 'IDM_DETECTED':
        showToast('⚠️ IDM đang chiếm quyền download! File sẽ không vào thư mục username. Hãy tắt IDM Integration Module.', 'warning');
        setStatus('error', '⚠️ IDM detected — file không vào đúng thư mục');
        break;

      case 'DOWNLOAD_DONE': {
        isDownloading = false;
        showProgress(false);
        const { success, failed, total, skipped } = payload;
        const doneTxt = window.i18n ? window.i18n.t('status_done') : 'Done';
        const skipTxt = skipped > 0 ? ` (skipped ${skipped})` : '';
        const doneMsg = `✓ ${doneTxt} ${success}/${total} files${failed > 0 ? ` (${failed} error)` : ''}${skipTxt}`;
        setStatus('done', doneMsg);
        showToast(doneMsg, success > 0 ? 'success' : 'error');
        updateButtons();

        // UI-01: Hiện error details panel khi có lỗi
        if (failed > 0 && els.errorDetails) {
          els.errorDetailsCount.textContent = `${failed} file lỗi`;
          const errors = document.createDocumentFragment();
          (Array.isArray(payload.errors) ? payload.errors : []).slice(0, 10).forEach((error: unknown) => {
            const item = document.createElement('li');
            const text = String(error).slice(0, 500);
            item.title = text;
            item.textContent = text;
            errors.append(item);
          });
          els.errorList.replaceChildren(errors);
          els.errorDetails.style.display = 'block';
        } else if (els.errorDetails) {
          els.errorDetails.style.display = 'none';
        }
        addToHistory({
// @ts-ignore
          username: currentUsername,
          count: success || 0,
          filter: activeFilter,
          date: new Date().toISOString(),
        });

        // Refresh downloaded count
// @ts-ignore
        if (currentUsername) {
          sendBG('GET_DOWNLOADED_COUNT', { username: currentUsername }).then(res => {
// @ts-ignore
            if (res?.count > 0 && els.skipWrap) {
              els.skipWrap.style.display = 'flex';
              els.downloadedBadge.style.display = 'inline-block';
              const dTxt = window.i18n ? window.i18n.t('status_done') : 'downloaded';
              els.downloadedBadge.textContent = `${(res as any).count} ${dTxt}`;
            }
          });
        }
        break;
      }

      case 'SESSION_RESTORED':
// @ts-ignore
        if (payload.username === currentUsername) {
          if (payload.stats) { stats = payload.stats; updateStatTabs(); }
          updateMediaCount(payload.count);
        }
        break;

      // v5.0.3: Queue updates from SW
      case 'QUEUE_UPDATE':
        downloadQueue = payload.queue || [];
        renderQueue();
        break;

      // ─── Feature 0: Following Scroll Progress ──────────────────────────────
      case 'FOLLOWING_SCROLL_STARTED':
      case 'FOLLOWING_SCROLL_PROGRESS':
      case 'FOLLOWING_SCROLL_DONE':
      case 'FOLLOWING_SCROLL_ERROR':
        handleFollowingMessage(msg.type, payload, { showToast, sendBG });
        break;
    }
  });
}

// ─── Status ───────────────────────────────────────────────────────────────────
// @ts-ignore
function setStatus(state, text) {
  els.statusText.textContent = text;
  els.statusDot.className = 'status-dot ' + (state || '');
}

// @ts-ignore
function showProgress(show) {
  els.progressWrap.style.display = show ? 'flex' : 'none';
  if (!show) { els.progressFill.style.width = '0%'; els.progressLbl.textContent = '0 / 0'; }
}

// ─── Toast Queue (UI-03) ─────────────────────────────────────────────────────
// Tránh nhiều toast override nhau — xếp hàng FIFO
const _toastQueue: Array<{ msg: string; type: string; duration: number }> = [];


// P3: Lịch sử có phân trang — hiện tối đa 50 mục, tránh render 1000+ DOM nodes
const HISTORY_PAGE_SIZE = 50;
let _historyShowCount = HISTORY_PAGE_SIZE;

function renderHistory() {
  _historyShowCount = HISTORY_PAGE_SIZE; // reset về đầu mỗi lần reload
  _renderHistoryPage();
}

function _renderHistoryPage() {
  if (!downloadHistory.length) {
    const emptyTxt = window.i18n ? window.i18n.t('history_empty') : 'No download history';
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = emptyTxt;
    els.historyList.replaceChildren(empty);
    return;
  }

  const filterIcons: Record<string, string> = { all: '📦', images: '🖼️', videos: '🎦', gifs: '🎞️' };
  const visible = (downloadHistory as any[]).slice(0, _historyShowCount);
  const hasMore = downloadHistory.length > _historyShowCount;

  const fragment = document.createDocumentFragment();
  visible.forEach((item: any) => {
    const d = new Date(item.date);
    const ds = `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
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

  els.historyList.replaceChildren(fragment);

// @ts-ignore
  els.historyList.querySelectorAll('.history-item').forEach((el: any) => {
    el.addEventListener('click', () => setCurrentUser(el.dataset.username));
  });
}
let _toastActive = false;
let _toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(msg: string, type = '', duration?: number) {
  const dur = duration ?? (type === 'warning' ? 7000 : 3000);
  _toastQueue.push({ msg, type, duration: dur });
  if (!_toastActive) _drainToastQueue();
}

function _drainToastQueue() {
  if (_toastQueue.length === 0) { _toastActive = false; return; }
  _toastActive = true;
  const { msg, type, duration } = _toastQueue.shift()!;
  els.toast.textContent = msg;
  els.toast.className = 'toast show ' + type;
  _toastTimer = setTimeout(() => {
    els.toast.className = 'toast';
    // Đợi animation fade out (0.3s) rồi show toast tiếp
    setTimeout(_drainToastQueue, 350);
  }, duration);
}

// ─── History ──────────────────────────────────────────────────────────────────
async function loadHistory() {
  const stored: any = await chrome.storage.local.get('download_history').catch(() => ({}));
  downloadHistory = stored.download_history || [];
  renderHistory();
}

// @ts-ignore
function addToHistory(entry) {
  downloadHistory.unshift(entry);
// @ts-ignore
  if (downloadHistory.length > 20) downloadHistory = downloadHistory.slice(0, 20);
// @ts-ignore
  chrome.storage.local.set({ download_history: downloadHistory });
  renderHistory();
}

// ─── SEC-03: escapeHtml helper ───────────────────────────────────────────────
// Dùng cho mọi dynamic content được đưa vào innerHTML để tránh XSS
function escapeHtml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ─── Folder Display ───────────────────────────────────────────────────────────
// @ts-ignore
async function updateFolderDisplay(username) {
  try {
    const stored: any = await chrome.storage.sync.get('options');
    const folder = stored.options?.saveFolder || '';
    currentSaveFolder = folder;

    const folderPathEl = document.getElementById('folder-path-text');
    if (folderPathEl) {
      const prefix = window.i18n ? window.i18n.t('folder_prefix') : 'Downloads/';
      const parts = folder
        ? `${prefix}${folder}/${username}/`
        : `${prefix}${username}/`;
      const prefixEl = document.createElement('span');
      prefixEl.dataset.i18n = 'folder_prefix';
      prefixEl.textContent = prefix;
      folderPathEl.replaceChildren(prefixEl, document.createTextNode(parts.substring(prefix.length)));
    }
  } catch (_) {}
}

// ─── Helper ───────────────────────────────────────────────────────────────────
// BUG-L5 FIX: Thêm timeout 8s — tránh UI treo khi Service Worker bị Chrome terminate
function sendBG(type: string, payload: any, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[popup] sendBG timeout (${timeoutMs}ms): ${type}`);
      resolve(null);
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[popup] sendBG error: ${type}`, err);
      resolve(null);
    }
  });
}

// ─── Custom Confirm Modal (UI-08) ─────────────────────────────────────────────
// Thay thế window.confirm() blocking bằng modal async non-blocking
function showConfirmModal(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const dialog = modal?.querySelector<HTMLElement>('.confirm-box');
    const btnOk = document.getElementById('confirm-ok') as HTMLButtonElement | null;
    const btnCancel = document.getElementById('confirm-cancel') as HTMLButtonElement | null;

    if (!modal || !msgEl || !dialog || !btnOk || !btnCancel) {
      // Fallback nếu modal chưa có trong HTML
      resolve(window.confirm(message));
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    msgEl.textContent = message;
    modal.classList.add('show');
    modal.removeAttribute('hidden');

    const cleanup = () => {
      modal.classList.remove('show');
      setTimeout(() => modal.setAttribute('hidden', ''), 200);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKeydown);
      previousFocus?.focus();
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    btnOk.addEventListener('click', onOk, { once: true });
    btnCancel.addEventListener('click', onCancel, { once: true });

    // Đóng khi click backdrop
    const onBackdrop = (e: Event) => {
      if (e.target === modal) { cleanup(); resolve(false); }
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cleanup(); resolve(false); return; }
      if (e.key !== 'Tab') return;
      const focusable = [btnCancel, btnOk];
      const current = document.activeElement;
      const index = focusable.indexOf(current as HTMLButtonElement);
      if (e.shiftKey && (index <= 0 || current === dialog)) {
        e.preventDefault(); btnOk.focus();
      } else if (!e.shiftKey && index === focusable.length - 1) {
        e.preventDefault(); btnCancel.focus();
      }
    };
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKeydown);
    btnCancel.focus();
  });
}
