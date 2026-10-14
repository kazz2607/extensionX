/**
 * popup.ts — Logic Popup
 * Sprint 1 fixes: BUG-L5 (sendBG timeout), SEC-03 (XSS escapeHtml),
 * UI-03 (toast queue), UI-08 (custom confirm modal)
 */
import { registerTranslations, t } from '../lib/i18n.ts';
import { getThemePreference, initTheme, nextThemePreference, onThemeChange, setThemePreference, type ThemePreference } from '../shared/theme.ts';
import { COMMON_STRINGS } from '../lib/i18n/common.ts';
import { POPUP_STRINGS } from '../lib/i18n/popup.ts';

registerTranslations(COMMON_STRINGS, POPUP_STRINGS);

/** Version labels read the manifest, so they cannot go stale across releases. */
document.querySelectorAll('[data-manifest-version]').forEach((el) => {
  el.textContent = `v${chrome.runtime.getManifest().version}`;
});

import { initFollowingPanel, handleFollowingMessage } from './following-panel.js';
import { setStatus, showProgress } from './status-bar.ts';
import { showToast } from './toast.ts';
import { renderDonutChart } from './donut-chart.ts';
import { initHistoryPanel, loadHistory, clearHistory } from './history-panel.ts';
import { initDateRange, getDateRange, setDateRange } from './date-range.ts';
import { initPresets, type FilterPreset } from './presets.ts';
import { initQueuePanel, loadQueue, addCurrentToQueue as queueAddCurrent, updateQueueItemProgress, setQueueFromUpdate } from './queue-panel.ts';
import { initDownloadPicker, loadPickerItems } from './download-picker.ts';
import { isWatched, toggleWatch, checkWatchedProfile } from './watch-list.ts';
import type { DownloadOptions } from '../types.ts';
import type { MessageType, ResponseFor } from '../shared/messages.ts';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUsername: string | null = null;
let isCollecting = false;
let isDownloading = false;
let activeFilter = 'all';
let stats = { image: 0, video: 0, gif: 0, hls: 0 };
let lastScrollCount = 0;
let lastScrollTime = Date.now();
let currentSaveFolder = '';  // đọc từ options
let _csvOffset = 0;          // PERF-04: CSV pagination offset (reset khi đổi profile/filter)
let _downloadedCount = 0;    // P4: Duplicate detection count for preview
let _concurrency = 3;        // P4: Concurrency level for warning
let _lastErrors: string[] = []; // P4: Stored error strings for copy log button

// ─── DOM ───────────────────────────────────────────────────────────────────────
// Mọi id dùng qua các helper này đều trỏ tới element tĩnh có sẵn trong
// popup.html — cast non-null thay vì kiểm tra null ở từng nơi dùng, giữ đúng
// hành vi hiện có (code vốn đã coi các element này là luôn tồn tại).
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
const $input = (id: string) => document.getElementById(id) as HTMLInputElement;

interface Els {
  username: HTMLElement;
  hint: HTMLElement;
  badge: HTMLElement;
  avatar: HTMLElement;
  profileCard: HTMLElement;
  btnWatchToggle: HTMLElement;

  tabAll: HTMLElement;
  tabImages: HTMLElement;
  tabVideos: HTMLElement;
  tabGifs: HTMLElement;
  tabCountAll: HTMLElement;
  tabCountImgs: HTMLElement;
  tabCountVids: HTMLElement;
  tabCountGifs: HTMLElement;

  statusSpeed: HTMLElement;
  progressFill: HTMLElement;
  progressLbl: HTMLElement;
  scrollSec: HTMLElement;
  scrollCount: HTMLElement;
  scrollNew: HTMLElement;
  scrollEta: HTMLElement;

  btnCollect: HTMLButtonElement;
  btnCollectTxt: HTMLElement;
  btnDownload: HTMLButtonElement;
  btnDownloadTxt: HTMLElement;
  btnQueueAdd: HTMLButtonElement;
  btnCsv: HTMLButtonElement;
  btnClear: HTMLButtonElement;
  btnDownloadCenter: HTMLElement;
  btnSettings: HTMLElement;
  btnReload: HTMLElement;
  btnTheme: HTMLElement;
  btnCompact: HTMLElement;
  btnHistClear: HTMLElement;

  // v4.1.0 Duplicate Detection
  skipWrap: HTMLElement;
  skipCheckbox: HTMLInputElement;
  downloadedBadge: HTMLElement;
  btnClearDownloaded: HTMLElement;

  // v5.0.3 Queue Panel
  btnQueueStart: HTMLElement;
  btnQueueClear: HTMLElement;
  btnQueueAddBar: HTMLButtonElement;
  queueAddHint: HTMLElement;
  // FEA-02: Queue Export/Import
  btnQueueExport: HTMLElement;
  inputQueueImport: HTMLElement;

  // UI-04: Onboarding
  onboardingSection: HTMLElement;

  // Bug 2: Stop download
  btnStopDownload: HTMLElement;

  // UI-01: Error details
  errorDetails: HTMLElement;
  errorDetailsCount: HTMLElement;
  errorList: HTMLElement;
  btnRetry: HTMLElement;
  btnErrorClose: HTMLElement;
  btnCopyErrors: HTMLElement;

  // P4-3: Download preview
  downloadPreview: HTMLElement;
  previewCount: HTMLElement;
  previewSkipRow: HTMLElement;
  previewSkipped: HTMLElement;
  previewWarning: HTMLElement;
  previewWarningText: HTMLElement;

  // v4.3.0 Date Range Filter
  sectionDaterange: HTMLElement;
}

const els: Els = {
  username:     $('profile-username'),
  hint:         $('profile-hint'),
  badge:        $('media-count-badge'),
  avatar:       $('profile-avatar'),
  profileCard:  $('profile-card'),
  btnWatchToggle: $('btn-watch-toggle'), // Pha 15

  tabAll:       $('tab-all'),
  tabImages:    $('tab-images'),
  tabVideos:    $('tab-videos'),
  tabGifs:      $('tab-gifs'),
  tabCountAll:  $('tab-count-all'),
  tabCountImgs: $('tab-count-images'),
  tabCountVids: $('tab-count-videos'),
  tabCountGifs: $('tab-count-gifs'),

  statusSpeed:  $('status-speed'),
  progressFill: $('progress-fill'),
  progressLbl:  $('progress-label'),
  scrollSec:    $('section-scroll'),
  scrollCount:  $('scroll-count'),
  scrollNew:    $('scroll-new'),
  scrollEta:    $('scroll-eta'),

  btnCollect:    $btn('btn-collect'),
  btnCollectTxt: $('btn-collect-text'),
  btnDownload:   $btn('btn-download'),
  btnDownloadTxt:$('btn-download-text'),
  btnQueueAdd:   $btn('btn-queue-add'),     // v5.0.3
  btnCsv:        $btn('btn-csv'),
  btnClear:      $btn('btn-clear'),
  btnDownloadCenter: $('btn-download-center'),
  btnSettings:   $('btn-settings'),
  btnReload:     $('btn-reload'),
  btnTheme:      $('btn-theme'),
  btnCompact:    $('btn-compact'), // v4.8.0
  btnHistClear:  $('btn-history-clear'),

  // v4.1.0 Duplicate Detection
  skipWrap:           $('skip-duplicates-wrap'),
  skipCheckbox:       $input('opt-skip-duplicates'),
  downloadedBadge:    $('downloaded-count-badge'),
  btnClearDownloaded: $('btn-clear-downloaded'),

  // v5.0.3 Queue Panel
  btnQueueStart:    $('btn-queue-start'),
  btnQueueClear:    $('btn-queue-clear'),
  btnQueueAddBar:   $btn('btn-queue-add-bar'),
  queueAddHint:     $('queue-add-hint'),
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
  btnCopyErrors:     $('btn-copy-errors'),

  // P4-3: Download preview
  downloadPreview:    $('download-preview'),
  previewCount:       $('preview-count'),
  previewSkipRow:     $('preview-skip-row'),
  previewSkipped:     $('preview-skipped'),
  previewWarning:     $('preview-warning'),
  previewWarningText: $('preview-warning-text'),

  // v4.3.0 Date Range Filter
  sectionDaterange:    $('section-daterange'),
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.load();
    window.i18n.applyToDOM();
  }
  await applyTheme();
  await applyCompactMode(); // v4.8.0
  initHistoryPanel({ onSelectUsername: setCurrentUser });
  initQueuePanel({ sendBG, showToast });
  initDownloadPicker({             // Pha 9
    getUsername: () => currentUsername,
    getActiveFilter: () => activeFilter,
    getDateRange,
    sendBG,
    showToast,
    onDownloadSelected: (selectedUrls) => void beginDownload({ selectedUrls }),
  });
  await loadHistory();
  await loadQueue();                // v5.0.3
  await checkSavedSession();
  try {
    const stored = await chrome.storage.sync.get('options') as { options?: Record<string, unknown> };
    if (stored?.options?.concurrency) _concurrency = Number(stored.options.concurrency) || 3;
  } catch {}
  await detectCurrentTab();
  setupListeners();
  setupBottomNav();                 // v5.0.3
  initDateRange({                   // v4.3.0
    getUsername: () => currentUsername,
    getActiveFilter: () => activeFilter,
    sendBG,
    onChange: updateButtons,
  });
  initPresets({                     // Pha 11
    getUsername: () => currentUsername,
    getActiveFilter: () => activeFilter,
    getDateRange,
    getSkipDuplicates: () => (els.skipCheckbox ? els.skipCheckbox.checked : true),
    onApplyPreset: applyFilterPreset,
    showToast,
  });
  listenToMessages();
  await applyFollowingScannerSetting(); // v5.7.1 — hide tab if disabled in settings
  initFollowingPanel({ showToast, sendBG }); // Feature 0 — injected from following-panel.ts
});

// ─── v5.7.1: Following Scanner Feature Toggle ───────────────────────────────
async function applyFollowingScannerSetting(): Promise<void> {
  const stored = await chrome.storage.sync.get('options').catch(() => ({})) as { options?: Record<string, unknown> };
  const enabled = (stored.options?.enableFollowingScanner as boolean | undefined) ?? true;

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
  const stored = await chrome.storage.local.get('compactMode').catch(() => ({})) as { compactMode?: boolean };
  if (stored.compactMode) {
    document.body.classList.add('compact-mode');
  }
}

function toggleCompactMode() {
  const isCompact = document.body.classList.toggle('compact-mode');
  chrome.storage.local.set({ compactMode: isCompact });
}

// ─── Theme ─────────────────────────────────────────────────────────────────
// U8: default follows the OS; the header button cycles System → Light → Dark
// and its label says which mode is active (it no longer drops "System").
function renderThemeButton(preference: ThemePreference) {
  const label = t('popup_theme_state', { mode: t(`popup_theme_mode_${preference}`) });
  els.btnTheme.title = label;
  els.btnTheme.setAttribute('aria-label', label);
  els.btnTheme.dataset.themePreference = preference;
}

async function applyTheme() {
  renderThemeButton(await initTheme());
  // Keep the label in sync when the theme is changed from Options.
  onThemeChange(renderThemeButton);
}

async function toggleTheme() {
  const next = nextThemePreference(getThemePreference());
  await setThemePreference(next);
  renderThemeButton(next);
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
    if (panelId === 'panel-stats') renderDonutChart(stats);
    if (panelId === 'panel-picker') void loadPickerItems(); // Pha 9
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
// loadQueue/renderQueue/updateQueueItemProgress sống ở queue-panel.ts (Pha 8).
// Wrapper dưới đây thu thập input từ popup state/DOM rồi gọi module đó.
async function addCurrentToQueue() {
  if (!currentUsername) return;
  const mediaCount = parseInt(els.badge.textContent) || 0;
  const skipDuplicates = els.skipCheckbox ? els.skipCheckbox.checked : true;
  await queueAddCurrent({
    username: currentUsername,
    filterType: activeFilter,
    skipDuplicates,
    keyword: getDateRange().keyword,
    mediaCount,
  });
}


// ─── Session Restore ──────────────────────────────────────────────────────────
async function checkSavedSession() {
  try {
    const res = await sendBG('GET_SAVED_SESSION', {});
    const session = res?.session;
    if (!session?.username || !session?.mediaCount) return;

    const minutesAgo = Math.round((Date.now() - (session.savedAt || 0)) / 60000);
    const timeStr = minutesAgo < 1   ? t('popup_time_just_now')
                  : minutesAgo < 60  ? t('popup_time_minutes_ago', { n: minutesAgo })
                  : t('popup_time_hours_ago', { n: Math.round(minutesAgo / 60) });

    showRestoreBanner(session.username, session.mediaCount, session.scrollCount || 0, timeStr);
  } catch (_) {}
}

function showRestoreBanner(username: string, count: number, scrolls: number, timeStr: string): void {
  const banner = document.getElementById('restore-banner');
  if (!banner) return;

  const usernameEl = document.getElementById('restore-username');
  if (usernameEl) usernameEl.textContent = `@${username}`;
  const detailEl = document.getElementById('restore-detail');
  if (detailEl) detailEl.textContent = t('popup_restore_detail', { count, scrolls, time: timeStr });

  banner.style.display = 'flex';

  const btnRestore = document.getElementById('btn-restore');
  if (btnRestore) btnRestore.onclick = async () => {
    banner.style.display = 'none';
    const res = await sendBG('RESTORE_SESSION', { username });
    if (res?.ok) {
      showToast(t('popup_toast_restored', { count: res.count ?? 0, username }), 'success');
      await setCurrentUser(username);
    } else {
      showToast(t('popup_toast_restore_missing'), 'error');
    }
  };

  const btnCancel = document.getElementById('btn-restore-cancel');
  if (btnCancel) btnCancel.onclick = async () => {
    banner.style.display = 'none';
    await sendBG('RESTORE_SESSION_CANCEL', { username });
    showToast(t('popup_toast_restore_cancelled'), 'info');
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
  if (!tab?.url || !tab.id) { updateOnboardingState(); return; }

  const url = tab.url;
  
  if (url.includes('web.telegram.org')) {
    els.username.textContent = 'Telegram Web';
    els.hint.textContent = t('popup_telegram_hint');
    els.profileCard.classList.add('active');
    els.avatar.textContent = 'TG';
    if (els.btnCollect) els.btnCollect.disabled = true;
    if (els.btnDownload) els.btnDownload.disabled = true;
    setStatus('idle', t('popup_telegram_status'), '✓');
    updateOnboardingState();
    return;
  }
  
  if (!url.includes('x.com') && !url.includes('twitter.com')) {
    setStatus('idle', t('profile_hint_default'), '⏳');
    updateOnboardingState(); // UI-04: không phải X.com → hiện onboarding
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' }, (res: { username?: string } | undefined) => {
    if (chrome.runtime.lastError || !res?.username) {
      updateOnboardingState(); // UI-04: trên X.com nhưng không nhận ra profile
      return;
    }
    setCurrentUser(res.username);
  });
}

async function setCurrentUser(username: string) {
  if (currentUsername !== username) _csvOffset = 0;
  currentUsername = username;
  updateOnboardingState(); // UI-04: ẩn onboarding khi biết profile

  els.username.textContent = `@${username}`;
  els.hint.textContent = t('profile_hint_active');
  els.profileCard.classList.add('active');
  els.avatar.textContent = username.slice(0, 2).toUpperCase();

  // Cập nhật queue add bar hint
  if (els.queueAddHint) els.queueAddHint.textContent = t('popup_queue_add_hint_user', { username });
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

  if (statsRes?.stats) {
    stats = statsRes.stats;
    updateStatTabs();
  }

  const currentMediaCount = countRes?.count || 0;
  updateMediaCount(currentMediaCount);

  // Pha 15: Watch mode (không poll ngầm) — so sánh với lần xem trước, dùng đúng
  // số liệu GET_MEDIA_COUNT đã gọi sẵn ở trên, không phát sinh request nào thêm.
  if (els.btnWatchToggle) {
    els.btnWatchToggle.style.display = 'flex';
    const watching = await isWatched(username);
    els.btnWatchToggle.classList.toggle('watching', watching);
    if (watching) {
      const delta = await checkWatchedProfile(username, currentMediaCount);
      if (delta) showToast(t('popup_toast_watch_new', { n: delta, username }), 'info');
    }
  }

  // v4.3.0: Hiện Date Range Filter section khi có media
  if (els.sectionDaterange) {
    els.sectionDaterange.style.display = 'block';
  }

  // v4.1.0: Duplicate Detection UI
  const dlCount = downloadedRes?.count || 0;
  _downloadedCount = dlCount;
  if (els.downloadedBadge) {
    if (dlCount > 0) {
      els.downloadedBadge.style.display = 'inline-block';
      els.downloadedBadge.textContent = t('popup_downloaded_count', { n: dlCount });
      if (els.btnClearDownloaded) els.btnClearDownloaded.style.display = 'inline-block';
    } else {
      els.downloadedBadge.style.display = 'none';
      if (els.btnClearDownloaded) els.btnClearDownloaded.style.display = 'none';
    }
  }

  // Khôi phục preference skip duplicates từ storage
  try {
    const pref = await chrome.storage.local.get('pref_skip_duplicates') as { pref_skip_duplicates?: boolean };
    if (pref.pref_skip_duplicates !== undefined) {
      els.skipCheckbox.checked = pref.pref_skip_duplicates;
    }
  } catch (_) {}

  // BUG-8 FIX: Restore download state
  if (dlStateRes?.isDownloading) {
    isDownloading = true;
    showProgress(true);
    setStatus('downloading', t('status_downloading'), '⬇️');
  }

  if (stateRes?.isCollecting) {
    isCollecting = true;
    els.scrollSec.style.display = 'block';
    els.scrollCount.textContent = String(stateRes.scrollCount || 0);
    setStatus('collecting', t('status_collecting'), '🔍');
  } else if (!dlStateRes?.isDownloading) {
    isCollecting = false;
    els.scrollSec.style.display = 'none';
    setStatus('ready', `${t('status_ready')} — @${username}`, '●');
  }

  updateButtons();
}

// ─── Stats & Tabs ─────────────────────────────────────────────────────────────
function updateStatTabs() {
  const total = (stats.image || 0) + (stats.video || 0) + (stats.gif || 0) + (stats.hls || 0);
  const videoTotal = (stats.video || 0) + (stats.hls || 0);

  els.tabCountAll.textContent  = String(total);
  els.tabCountImgs.textContent = String(stats.image || 0);
  els.tabCountVids.textContent = String(videoTotal);
  els.tabCountGifs.textContent = String(stats.gif || 0);
}

function updateMediaCount(count: number) {
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
// Pha 11: tách riêng để dùng chung giữa click tab thật và áp dụng preset đã lưu.
function selectFilterTab(filterType: string): void {
  document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filterType));
  activeFilter = filterType;
  _csvOffset = 0; // PERF-04: reset CSV pagination khi đổi filter
  updateButtons();

  const labels: Record<string, string> = {
    all: t('btn_download'),
    images: t('tab_images'),
    videos: t('tab_videos'),
    gifs: t('tab_gifs'),
  };
  const cnt = getFilteredCount();
  els.btnDownloadTxt.textContent = cnt > 0 ? `${labels[activeFilter]} (${cnt})` : labels[activeFilter];
}

function setupTabs() {
  document.querySelectorAll<HTMLElement>('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.filter) selectFilterTab(tab.dataset.filter);
    });
  });
}

// Pha 11: áp dụng preset đã lưu — cập nhật filter tab, date range, skip-duplicates.
function applyFilterPreset(preset: FilterPreset): void {
  selectFilterTab(preset.filterType);
  setDateRange({ dateFrom: preset.dateFrom, dateTo: preset.dateTo, keyword: preset.keyword });
  if (els.skipCheckbox) els.skipCheckbox.checked = preset.skipDuplicates;
  updateDownloadPreview();
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
function updateButtons() {
  const hasUser = !!currentUsername;
  const totalCount = parseInt(els.badge.textContent) || 0;
  const filteredCount = getFilteredCount();

  els.btnCollect.disabled  = !hasUser || isDownloading;
  els.btnDownload.disabled = !hasUser || filteredCount === 0 || isDownloading;
  els.btnCsv.disabled      = !hasUser || totalCount === 0;
  els.btnClear.disabled    = !hasUser || totalCount === 0;
  if (els.btnQueueAdd)    els.btnQueueAdd.disabled    = !hasUser || filteredCount === 0;
  if (els.btnQueueAddBar) els.btnQueueAddBar.disabled = !hasUser;

  // Bug 2: Hiện nút Stop khi đang tải, ẩn khi rảnh. Stop THAY CHỖ Download (không
  // chen thêm) để .btn-row luôn đúng 4 nút hiển thị cùng lúc, tránh tràn dòng.
  if (els.btnStopDownload) {
    els.btnStopDownload.style.display = isDownloading ? 'inline-flex' : 'none';
  }
  els.btnDownload.style.display = isDownloading ? 'none' : 'flex';

  if (isCollecting) {
    els.btnCollect.classList.add('collecting');
    els.btnCollectTxt.textContent = t('btn_collect_stop');
  } else {
    els.btnCollect.classList.remove('collecting');
    els.btnCollectTxt.textContent = t('btn_collect_start');
  }

  // P4-3: Preview trước download
  updateDownloadPreview();
}

// ─── P4-3: Download Preview Panel ─────────────────────────────────────────────
function updateDownloadPreview() {
  if (!els.downloadPreview) return;
  const filteredCount = getFilteredCount();
  const hasUser = !!currentUsername;

  if (!hasUser || filteredCount === 0 || isDownloading || isCollecting) {
    els.downloadPreview.style.display = 'none';
    return;
  }

  const skipDup = els.skipCheckbox ? els.skipCheckbox.checked : true;
  const skipped = (skipDup && _downloadedCount > 0) ? Math.min(_downloadedCount, filteredCount) : 0;
  const toDownload = Math.max(0, filteredCount - skipped);

  if (els.previewCount) {
    els.previewCount.textContent = t('popup_file_count', { n: toDownload });
  }

  if (els.previewSkipRow && els.previewSkipped) {
    if (skipped > 0) {
      els.previewSkipRow.style.display = 'flex';
      els.previewSkipped.textContent = t('popup_file_count', { n: skipped });
    } else {
      els.previewSkipRow.style.display = 'none';
    }
  }

  if (els.previewWarning && els.previewWarningText) {
    if (_concurrency >= 4) {
      els.previewWarning.style.display = 'flex';
      els.previewWarningText.textContent = t('popup_warn_concurrency', { n: _concurrency });
    } else if (stats.hls > 0 || (stats.video > 0 && activeFilter === 'videos')) {
      els.previewWarning.style.display = 'flex';
      els.previewWarningText.textContent = t('popup_warn_hls');
    } else {
      els.previewWarning.style.display = 'none';
    }
  }

  els.downloadPreview.style.display = 'flex';
}

// ─── Scroll Speed ─────────────────────────────────────────────────────────────
function updateScrollSpeed(newCount: number) {
  const now = Date.now();
  const elapsed = (now - lastScrollTime) / 1000;
  const delta = newCount - lastScrollCount;

  if (elapsed > 0 && delta > 0) {
    const rate = (delta / elapsed * 60).toFixed(0);
    els.statusSpeed.textContent = t('popup_rate_per_min', { rate });
  }

  lastScrollCount = newCount;
  lastScrollTime = now;
}

// ─── Download ─────────────────────────────────────────────────────────────────
// Dùng chung bởi nút Download (toàn bộ theo filter) và Pha 9 Download Picker
// (chỉ các url đã chọn) — cùng 1 sequence set trạng thái UI + gọi START_DOWNLOAD.
async function beginDownload(extraOptions: Partial<DownloadOptions> = {}) {
  if (!currentUsername || isDownloading) return;
  if (!extraOptions.selectedUrls?.length) {
    const filteredCount = getFilteredCount();
    if (filteredCount === 0) { showToast(t('popup_toast_no_media'), 'error'); return; }
  }

  isDownloading = true;
  updateButtons();
  setStatus('downloading', t('status_downloading'), '📦');
  showProgress(true);

  const { dateFrom, dateTo, keyword } = getDateRange();
  await sendBG('START_DOWNLOAD', {
    username: currentUsername,
    options: {
      filterType: activeFilter,
      skipDuplicates: els.skipCheckbox ? els.skipCheckbox.checked : true,
      // v4.3.0: Truyền date range vào SW
      dateFrom: dateFrom || undefined,
      dateTo:   dateTo   || undefined,
      keyword:  keyword  || undefined, // v4.8.0
      ...extraOptions,
    }
  });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupListeners() {
  setupTabs();

  // Collect toggle
  els.btnCollect.addEventListener('click', async () => {
    if (!currentUsername) return;

    if (isCollecting) {
      isCollecting = false;
      await sendBG('STOP_COLLECTING', { username: currentUsername });
      setStatus('ready', `${t('status_stopped')} — @${currentUsername}`, '●');
      els.statusSpeed.textContent = '';
    } else {
      lastScrollCount = parseInt(els.badge.textContent) || 0;
      lastScrollTime = Date.now();
      els.btnCollect.disabled = true;
      const response = await sendBG('START_COLLECTING', { username: currentUsername });
      if (!response?.ok) {
        isCollecting = false;
        showToast(response?.error || t('popup_toast_collect_failed'), 'error');
        updateButtons();
        return;
      }
      isCollecting = true;
      setStatus('collecting', t('status_collecting'), '🔍');
      els.scrollSec.style.display = 'block';
    }
    updateButtons();
  });

  // Download
  els.btnDownload.addEventListener('click', () => void beginDownload());

  // Add to Queue (action row button)
  if (els.btnQueueAdd) {
    els.btnQueueAdd.addEventListener('click', addCurrentToQueue);
  }

  // Add to Queue (queue panel bar button)
  if (els.btnQueueAddBar) {
    els.btnQueueAddBar.addEventListener('click', addCurrentToQueue);
  }

  // Queue Clear
  if (els.btnQueueClear) {
    els.btnQueueClear.addEventListener('click', async () => {
      if (!await showConfirmModal(t('popup_confirm_clear_queue'))) return;
      await sendBG('CLEAR_QUEUE', {});
      showToast(t('popup_toast_queue_cleared'), 'info');
    });
  }

  // FEA-02: Queue Export
  if (els.btnQueueExport) {
    els.btnQueueExport.addEventListener('click', async () => {
      const res = await sendBG('EXPORT_QUEUE', {});
      if (!res?.ok || !res.data) { showToast(t('popup_toast_no_export_data'), 'error'); return; }
      const json = JSON.stringify(res.data, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      chrome.downloads.download({ url: dataUrl, filename: `extensionx_queue_${dateStr}.json`, saveAs: false });
      showToast(t('popup_toast_queue_exported', { n: res.data.queue?.length || 0 }), 'success');
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
        const res = await sendBG('IMPORT_QUEUE', { data: text });
        if (!res || res.error) {
          showToast(t('popup_toast_import_error', { error: res?.error || t('popup_no_response') }), 'error');
        } else {
          showToast(t('popup_toast_queue_imported', { added: res.added ?? 0, skipped: res.skipped ?? 0 }), 'success');
        }
      } catch (err) {
        showToast(t('popup_toast_import_failed', { error: err instanceof Error ? err.message : String(err) }), 'error');
      }
    });
  }

  // CSV Export
  els.btnCsv.addEventListener('click', async () => {
    if (!currentUsername) return;
    const res = await sendBG('EXPORT_CSV', {
      username: currentUsername,
      filterType: activeFilter,
      offset: _csvOffset,  // PERF-04: pagination
    });

    if (!res?.csv) { showToast(t('popup_toast_no_export_data'), 'error'); return; }

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
        t('popup_toast_csv_page', {
          page: pageNum,
          exported: (res.exported ?? 0).toLocaleString(),
          total: (res.total ?? 0).toLocaleString(),
        }),
        'warning'
      );
    } else {
      _csvOffset = 0; // reset sau khi xuất hết
      showToast(t('popup_toast_csv_done', { n: (res.exported ?? 0).toLocaleString() }), 'success');
    }
  });

  // Pha 14: Manifest export (lịch sử tải + metadata từng file cho profile hiện tại)
  const exportManifest = async (format: 'json' | 'csv') => {
    if (!currentUsername) return;
    const res = await sendBG('EXPORT_MANIFEST', { username: currentUsername });
    if (!res) { showToast(t('popup_toast_no_sw_response'), 'error'); return; }
    const body = format === 'json' ? res?.json : res?.csv;
    if (!body) { showToast(t('popup_toast_no_export_data'), 'error'); return; }

    const mime = format === 'json' ? 'application/json' : 'text/csv';
    const dataUrl = `data:${mime};charset=utf-8,` + encodeURIComponent(body);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    chrome.downloads.download({
      url: dataUrl,
      filename: `${currentUsername}_manifest_${dateStr}.${format}`,
      saveAs: false,
    });
    const exported = (res.exported ?? 0).toLocaleString();
    const truncatedNote = res.truncated
      ? t('popup_manifest_truncated', { exported, total: (res.total ?? 0).toLocaleString() })
      : '';
    showToast(t('popup_toast_manifest_exported', { format: format.toUpperCase(), n: exported, note: truncatedNote }), 'success');
  };
  document.getElementById('btn-export-manifest-json')?.addEventListener('click', () => void exportManifest('json'));
  document.getElementById('btn-export-manifest-csv')?.addEventListener('click', () => void exportManifest('csv'));

  // Pha 15: Watch mode toggle (không poll ngầm — xem watch-list.ts)
  if (els.btnWatchToggle) {
    els.btnWatchToggle.addEventListener('click', async () => {
      if (!currentUsername) return;
      const mediaCount = parseInt(els.badge.textContent) || 0;
      const watching = await toggleWatch(currentUsername, mediaCount);
      els.btnWatchToggle.classList.toggle('watching', watching);
      showToast(t(watching ? 'popup_toast_watching' : 'popup_toast_unwatched', { username: currentUsername }), 'info');
    });
  }

  // Duplicate Skip checkbox change listener
  if (els.skipCheckbox) {
    els.skipCheckbox.addEventListener('change', () => {
      chrome.storage.local.set({ pref_skip_duplicates: els.skipCheckbox.checked }).catch(() => {});
      updateDownloadPreview();
      showToast(
        els.skipCheckbox.checked
          ? t('popup_toast_skip_on')
          : t('popup_toast_skip_off'),
        'info'
      );
    });
  }

  // Clear Downloaded History button listener
  if (els.btnClearDownloaded) {
    els.btnClearDownloaded.addEventListener('click', async () => {
      if (!currentUsername) return;
      await sendBG('CLEAR_DOWNLOADED', { username: currentUsername });
      _downloadedCount = 0;
      if (els.downloadedBadge) els.downloadedBadge.style.display = 'none';
      els.btnClearDownloaded.style.display = 'none';
      updateDownloadPreview();
      showToast(t('popup_toast_downloaded_cleared', { username: currentUsername }), 'success');
    });
  }

  // Clear — UI-08: dùng custom modal thay vì window.confirm()
  els.btnClear.addEventListener('click', async () => {
    if (!currentUsername) return;
    const confirmed = await showConfirmModal(t('popup_confirm_clear_media', { username: currentUsername }));
    if (!confirmed) return;

    await sendBG('CLEAR_MEDIA', { username: currentUsername });
    stats = { image: 0, video: 0, gif: 0, hls: 0 };
    _downloadedCount = 0;
    updateStatTabs();
    updateMediaCount(0);
    if (els.downloadedBadge) els.downloadedBadge.style.display = 'none';
    if (els.btnClearDownloaded) els.btnClearDownloaded.style.display = 'none';
    setStatus('ready', t('popup_status_cleared'));
    showToast(t('popup_toast_media_cleared'), 'info');
  });

  // Settings
  els.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // v7.0.0 Download Center
  els.btnDownloadCenter.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('download-center/download-center.html') });
    window.close();
  });

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
      setStatus('ready', t('popup_status_download_stopped'));
      updateButtons();
      showToast(t('popup_toast_download_stopped'), 'info');
    });
  }

  // UI-01 & P4-4: Error details — Copy log, Retry và Close
  if (els.btnCopyErrors) {
    els.btnCopyErrors.addEventListener('click', async () => {
      if (!_lastErrors.length) {
        showToast(t('popup_toast_no_errors'), 'info');
        return;
      }
      const text = `[ExtensionX Error Log - ${new Date().toISOString()}]\n` + _lastErrors.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showToast(t('popup_toast_errors_copied'), 'success');
      } catch {
        showToast(t('popup_toast_copy_failed'), 'error');
      }
    });
  }
  if (els.btnRetry) {
    els.btnRetry.addEventListener('click', async () => {
      els.errorDetails.style.display = 'none';
      await sendBG('RETRY_FAILED', {});
      showToast(t('popup_toast_retrying'), 'info');
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
  els.btnTheme.addEventListener('click', () => void toggleTheme());

  // Compact Mode toggle
  if (els.btnCompact) {
    els.btnCompact.addEventListener('click', toggleCompactMode);
  }

  // History clear
  els.btnHistClear.addEventListener('click', async () => {
    await clearHistory();
    showToast(t('popup_toast_history_cleared'), 'info');
  });
}

// ─── Message Listener ─────────────────────────────────────────────────────────
function listenToMessages() {
  chrome.runtime.onMessage.addListener((msg) => {
    const { type, payload } = msg;

    switch (type) {
      case 'MEDIA_COUNT_UPDATE':
        if (payload.username !== currentUsername) break;
        if (payload.stats) { stats = payload.stats; updateStatTabs(); }
        updateMediaCount(payload.count);
        // UI-02: Realtime donut khi Stats panel đang mở
        if (document.getElementById('panel-stats')?.classList.contains('active')) renderDonutChart(stats);
        break;

      // PERF-03: Cảnh báo bộ nhớ khi store > 50k items
      case 'MEDIA_MEMORY_WARNING':
        if (payload.username !== currentUsername) break;
        showToast(
          t('popup_toast_memory_warning', { n: (payload.count as number).toLocaleString() }),
          'warning'
        );
        break;

      case 'SCROLL_PROGRESS':
        if (payload.username !== currentUsername) break;
        els.scrollCount.textContent = payload.scrollCount;
        const prevBadge = parseInt(els.badge.textContent) || 0;
        const newMedia = (payload.mediaCount || 0) - prevBadge;
        els.scrollNew.textContent = newMedia >= 0 ? `+${newMedia}` : String(newMedia);
        if (payload.stats) { stats = payload.stats; updateStatTabs(); }
        updateMediaCount(payload.mediaCount);
        updateScrollSpeed(payload.mediaCount);
        
        // P1: Adaptive Speed
        if (payload.adaptiveSpeed) {
          els.statusSpeed.textContent = ` ${t('popup_adaptive_speed', { s: (payload.adaptiveSpeed / 1000).toFixed(1) })}`;
        } else {
          els.statusSpeed.textContent = '';
        }
        break;

      case 'COLLECT_STARTED':
        if (payload.username === currentUsername) {
          isCollecting = true;
          updateButtons();
        }
        break;

      case 'COLLECT_DONE':
        if (payload.username !== currentUsername) break;
        isCollecting = false;
        // UI-01: Reset scroll display về trạng thái ban đầu
        els.scrollSec.style.display = 'none';
        els.statusSpeed.textContent = '';
        if (els.scrollCount) els.scrollCount.textContent = '0';
        if (els.scrollNew)   els.scrollNew.textContent   = '';
        {
          const reasonMsg = payload.reachedEnd
            ? t('popup_collect_done', { n: payload.mediaCount })
            : payload.reason === 'max_scrolls'
              ? t('popup_collect_max_scrolls', { n: payload.mediaCount })
              : payload.reason === 'auto_stop'
                ? t('popup_collect_auto_stop', { scrolls: payload.autoStopAfter ?? 10, n: payload.mediaCount })
                : t('popup_collect_stopped', { n: payload.mediaCount });
          setStatus('done', reasonMsg, '✓');
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
        if (payload.username === currentUsername) {
          const label = activeFilter !== 'all' ? ` (${activeFilter})` : '';
          setStatus('downloading', t('popup_status_downloading_total', { total: payload.total, label }), '⬇️');
        }
        break;

      case 'DOWNLOAD_PROGRESS':
        if (payload.username !== currentUsername) break;
        els.progressFill.style.width = `${payload.percent}%`;
        els.progressLbl.textContent = `${payload.current} / ${payload.total}`;

        if (payload.done) {
          if (payload.failed > 0) {
            const errDetails = (payload.errors || []).join(' | ');
            setStatus('error', t('popup_status_done_with_errors', { success: payload.success, total: payload.total, errors: errDetails }), '⚠️');
          } else {
            setStatus('success', t('popup_status_done_files', { success: payload.success, total: payload.total }), '✓');
          }
        } else {
          setStatus('downloading', t('popup_status_downloading_file', { file: payload.currentFile || '', success: payload.success, total: payload.total }), '⬇️');
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
          payload.forEach((rawItem: unknown) => {
            if (!rawItem || typeof rawItem !== 'object') return;
            const item = rawItem as { filename?: unknown; speedBps?: unknown; totalBytes?: unknown; bytesReceived?: unknown };
            const formatSize = (bytes: number) => (Math.max(0, Number(bytes) || 0) / 1024 / 1024).toFixed(1) + ' MB';
            const name = String(item.filename || '').slice(0, 255);
            const speed = formatSize(Number(item.speedBps)) + '/s';
            const percent = item.totalBytes ? Math.round((Number(item.bytesReceived) / Number(item.totalBytes)) * 100) + '%' : formatSize(Number(item.bytesReceived));
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
        if (payload.username === currentUsername) {
          setStatus('downloading', t('popup_status_hls', { fetched: payload.fetched, total: payload.total }), '🎞️');
        }
        break;

      case 'IDM_DETECTED':
        showToast(t('popup_toast_idm'), 'warning');
        setStatus('error', t('popup_status_idm'), '⚠️');
        break;

      case 'DOWNLOAD_DONE': {
        isDownloading = false;
        showProgress(false);
        const { success, failed, total, skipped } = payload;
        const failedTxt = failed > 0 ? t('popup_download_done_failed', { n: failed }) : '';
        const skipTxt = skipped > 0 ? t('popup_download_done_skipped', { n: skipped }) : '';
        const doneMsg = t('popup_download_done', { done: t('status_done'), success, total, failed: failedTxt, skipped: skipTxt });
        setStatus('done', doneMsg, '✓');
        showToast(doneMsg, success > 0 ? 'success' : 'error');
        updateButtons();

        // UI-01 & P4-4: Hiện error details panel khi có lỗi và lưu lại để copy
        if (failed > 0 && els.errorDetails) {
          _lastErrors = (Array.isArray(payload.errors) && payload.errors.length > 0)
            ? payload.errors.map((e: unknown) => String(e))
            : [t('popup_error_files_failed', { n: failed })];
          els.errorDetailsCount.textContent = t('popup_error_count', { n: failed });
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
          _lastErrors = [];
          els.errorDetails.style.display = 'none';
        }
        void loadHistory();

        // Refresh downloaded count
        if (currentUsername) {
          sendBG('GET_DOWNLOADED_COUNT', { username: currentUsername }).then(res => {
            const count = res?.count ?? 0;
            if (count > 0 && els.skipWrap) {
              _downloadedCount = count;
              updateDownloadPreview();
              els.skipWrap.style.display = 'flex';
              els.downloadedBadge.style.display = 'inline-block';
              els.downloadedBadge.textContent = t('popup_downloaded_count', { n: count });
            }
          });
        }
        break;
      }

      case 'SESSION_RESTORED':
        if (payload.username === currentUsername) {
          if (payload.stats) { stats = payload.stats; updateStatTabs(); }
          updateMediaCount(payload.count);
        }
        break;

      // v5.0.3: Queue updates from SW
      case 'QUEUE_UPDATE':
        setQueueFromUpdate(payload.queue || []);
        break;

      // ─── Feature 0: Following Scroll Progress ──────────────────────────────
      case 'FOLLOWING_SCROLL_STARTED':
      case 'FOLLOWING_SCROLL_PROGRESS':
      case 'FOLLOWING_SCROLL_DONE':
      case 'FOLLOWING_SCROLL_ERROR':
      case 'FOLLOWING_SCAN_STATE':
        handleFollowingMessage(msg.type, payload, { showToast, sendBG });
        break;
    }
  });
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
async function updateFolderDisplay(username: string) {
  try {
    const stored = await chrome.storage.sync.get('options') as { options?: Record<string, unknown> };
    const folder = (stored.options?.saveFolder as string | undefined) || '';
    currentSaveFolder = folder;

    const folderPathEl = document.getElementById('folder-path-text');
    if (folderPathEl) {
      const prefix = t('folder_prefix');
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
function sendBG<T extends MessageType>(type: T, payload: Record<string, unknown> = {}, timeoutMs = 8000): Promise<ResponseFor<T> | null> {
  return new Promise<ResponseFor<T> | null>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[popup] sendBG timeout (${timeoutMs}ms): ${type}`);
      resolve(null);
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res as ResponseFor<T>);
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
