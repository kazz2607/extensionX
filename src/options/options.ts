
/**
 * options.js — Logic trang Cài đặt (v5.7.0)
 */
import { renderFilenameTemplate } from '../shared/filename-template.ts';

// Mọi id dùng qua helper này đều trỏ tới input/select tĩnh có sẵn trong
// options.html — cast trực tiếp thay vì ts-ignore từng dòng, không đổi hành vi.
function el<T extends HTMLElement = HTMLInputElement>(id: string): T {
  return document.getElementById(id) as T;
}

const DEFAULT_OPTIONS = {
  saveFolder: '',                              // Thư mục con trong Downloads
  mediaTypes: { images: true, videos: true, gifs: true },
  imgQuality: 'orig',
  autoScroll: false,
  adaptiveScroll: true,
  scrollDelay: 2,
  maxScrolls: 200,
  concurrency: 3,
  saveAs: false,
  maxMedia: 0,
  flatUsername: false,
  filenameUsername: false,                     // Tên file theo username_TweetID_Serial
  filenameTemplate: '',                        // Pha 13: template đặt tên file tuỳ chỉnh
  smartFilters: {                              // Smart Filters (v3.8.0)
    filterAvatars:    true,
    filterCardImages: true,
    minImageWidth:    150,
    minImageHeight:   150,
  },
  showSnackbar: true,                          // Progress Snackbar trên trang X.com (v4.0.0)
  showNotification: true,                      // System notification khi tải xong (v4.1.0)
  enableBookmarks: true,                       // Cho phép quét trang Bookmarks (v5.4.0)
  enableFollowingScanner: true,                // Following Scanner tab (v5.7.1)
  localDiagnostics: false,                     // Opt-in local-only metrics
  autoStop: false,                             // FEAT-08: Smart Auto-Stop
  autoStopAfter: 10,                           // FEAT-08: số scroll không có media mới trước khi dừng
  shortcuts: {                                   // Keyboard Shortcuts (v5.5.0)
    enabled: false,                              // Mặc định TẮT — user phải bật chủ động
    showToast: true,
    copyLink:      { enabled: true, modifiers: 'ctrl', key: 'c' },
    downloadMedia: { enabled: true, modifiers: 'ctrl', key: 's' },
    copyImageUrl:  { enabled: true, modifiers: 'ctrl+shift', key: 'c' },
    openOriginal:  { enabled: true, modifiers: 'ctrl+shift', key: 'o' },
    reverseSearch: { enabled: true, modifiers: 'ctrl+shift', key: 'g' },
  },
};

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadOptions() {
  const stored = await chrome.storage.sync.get('options').catch(() => ({})) as { options?: Record<string, unknown> };
  const opts = { ...DEFAULT_OPTIONS, ...(stored.options || {}) };

  el('opt-save-folder').value   = opts.saveFolder || '';
  el('opt-images').checked      = opts.mediaTypes?.images ?? true;
  el('opt-videos').checked      = opts.mediaTypes?.videos ?? true;
  el('opt-gifs').checked        = opts.mediaTypes?.gifs ?? true;
  el<HTMLSelectElement>('opt-img-quality').value = opts.imgQuality || 'orig';
  el('opt-auto-scroll').checked = opts.autoScroll || false;
  el('opt-adaptive-scroll').checked = opts.adaptiveScroll ?? true;
  el('opt-scroll-delay').value  = String(opts.scrollDelay || 2);
  el('opt-max-scrolls').value   = String(opts.maxScrolls || 200);
  el('opt-concurrency').value   = String(opts.concurrency || 3);
  el('opt-save-as').checked     = opts.saveAs || false;
  el('opt-max-media').value     = String(opts.maxMedia || 0);
  el('opt-flat-username').checked = opts.flatUsername || false;
  el('opt-filename-username').checked = opts.filenameUsername || false;
  el('opt-filename-template').value = opts.filenameTemplate || '';

  // Smart Filters
  const sf = opts.smartFilters || DEFAULT_OPTIONS.smartFilters;
  el('opt-filter-avatars').checked    = sf.filterAvatars    ?? true;
  el('opt-filter-card-images').checked = sf.filterCardImages ?? true;
  el('opt-min-img-width').value       = String(sf.minImageWidth    ?? 150);
  el('opt-min-img-height').value      = String(sf.minImageHeight   ?? 150);
  el('opt-show-snackbar').checked     = opts.showSnackbar   ?? true;
  el('opt-show-notification').checked = opts.showNotification ?? true;
  el('opt-enable-bookmarks').checked = opts.enableBookmarks ?? true;
  el('opt-enable-following-scanner').checked = opts.enableFollowingScanner ?? true;
  el('opt-local-diagnostics').checked = opts.localDiagnostics ?? false;

  // Keyboard Shortcuts (v5.5.0)
  const sc = opts.shortcuts || DEFAULT_OPTIONS.shortcuts;
  el('opt-shortcuts-enabled').checked = sc.enabled ?? false;
  el('opt-sc-copy-link').checked      = sc.copyLink?.enabled ?? true;
  el('opt-sc-download').checked       = sc.downloadMedia?.enabled ?? true;
  el('opt-sc-copy-img-url').checked   = sc.copyImageUrl?.enabled ?? true;
  el('opt-sc-open-original').checked  = sc.openOriginal?.enabled ?? true;
  el('opt-sc-reverse-search').checked = sc.reverseSearch?.enabled ?? true;
  el('opt-sc-show-toast').checked     = sc.showToast ?? true;
  updateShortcutsDetailState();

  updateScrollLabel(opts.scrollDelay || 2);
  updateConcurrencyLabel(opts.concurrency || 3);

  // FEAT-08: Smart Auto-Stop
  (document.getElementById('opt-auto-stop') as HTMLInputElement).checked = opts.autoStop ?? false;
  (document.getElementById('opt-auto-stop-after') as HTMLInputElement).value = String(opts.autoStopAfter ?? 10);
  updateAutoStopRowState();

  updateFolderPreview();
  updateFilenameTemplatePreview();
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveOptions() {
  const opts = {
    saveFolder:  sanitizeFolder(el('opt-save-folder').value),
    mediaTypes: {
      images: el('opt-images').checked,
      videos: el('opt-videos').checked,
      gifs:   el('opt-gifs').checked,
    },
    imgQuality:  el<HTMLSelectElement>('opt-img-quality').value,
    autoScroll:  el('opt-auto-scroll').checked,
    adaptiveScroll: el('opt-adaptive-scroll').checked,
    scrollDelay: parseFloat(el('opt-scroll-delay').value) || 2,
    maxScrolls:  parseInt(el('opt-max-scrolls').value) || 200,
    concurrency: parseInt(el('opt-concurrency').value) || 3,
    saveAs:      el('opt-save-as').checked,
    maxMedia:    parseInt(el('opt-max-media').value) || 0,
    flatUsername: el('opt-flat-username').checked,
    filenameUsername: el('opt-filename-username').checked,
    filenameTemplate: String(el('opt-filename-template').value || '').trim().slice(0, 200),
    smartFilters: {
      filterAvatars:    el('opt-filter-avatars').checked,
      filterCardImages: el('opt-filter-card-images').checked,
      minImageWidth:    parseInt(el('opt-min-img-width').value)  || 0,
      minImageHeight:   parseInt(el('opt-min-img-height').value) || 0,
    },
    showSnackbar: el('opt-show-snackbar').checked,
    showNotification: el('opt-show-notification').checked,
    enableBookmarks:  el('opt-enable-bookmarks').checked,
    enableFollowingScanner: el('opt-enable-following-scanner')?.checked ?? true,
    localDiagnostics: el('opt-local-diagnostics')?.checked ?? false,
    // FEAT-08: Smart Auto-Stop
    autoStop: el('opt-auto-stop')?.checked ?? false,
    autoStopAfter: parseInt(el('opt-auto-stop-after')?.value) || 10,
    shortcuts: {
      enabled:       el('opt-shortcuts-enabled').checked,
      showToast:     el('opt-sc-show-toast').checked,
      copyLink:      { enabled: el('opt-sc-copy-link')?.checked ?? true,      modifiers: 'ctrl', key: 'c' },
      downloadMedia: { enabled: el('opt-sc-download')?.checked ?? true,       modifiers: 'ctrl', key: 's' },
      copyImageUrl:  { enabled: el('opt-sc-copy-img-url')?.checked ?? true,   modifiers: 'ctrl+shift', key: 'c' },
      openOriginal:  { enabled: el('opt-sc-open-original')?.checked ?? true,  modifiers: 'ctrl+shift', key: 'o' },
      reverseSearch: { enabled: el('opt-sc-reverse-search')?.checked ?? true, modifiers: 'ctrl+shift', key: 'g' },
    },
  };

  await chrome.storage.sync.set({ options: opts });

  // UI-03: Reset text về "✓ Saved" sau khi lưu xong (có thể đang là "Saving...")
  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = window.i18n ? window.i18n.t('save_success') : '✓ Saved';
    statusEl.classList.add('show');
    setTimeout(() => statusEl.classList.remove('show'), 2500);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function updateScrollLabel(val: string | number): void {
  el<HTMLElement>('scroll-delay-val').textContent = `${val}s`;
}

function updateConcurrencyLabel(val: string | number): void {
  el<HTMLElement>('concurrency-val').textContent = String(val);
}

function sanitizeFolder(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .split(/[\\/]+/)
    .map(segment => segment
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/[<>:"|?*\\/]/g, '_')
      .replace(/^\.+$/, '_')
      .trim()
      .slice(0, 100)
    )
    .filter(Boolean)
    .slice(0, 10)
    .join('/');
}

// FEAT-08: Toggle auto-stop-after row state
function updateAutoStopRowState() {
  const toggle = document.getElementById('opt-auto-stop') as HTMLInputElement | null;
  const row = document.getElementById('row-auto-stop-after') as HTMLElement | null;
  if (!toggle || !row) return;
  row.style.opacity = toggle.checked ? '1' : '0.5';
  const input = row.querySelector('input') as HTMLInputElement | null;
  if (input) input.disabled = !toggle.checked;
}

function updateShortcutsDetailState() {
  const masterToggle = document.getElementById('opt-shortcuts-enabled') as HTMLInputElement | null;
  const detailPanel = document.getElementById('shortcuts-detail');
  if (!masterToggle || !detailPanel) return;

  if (masterToggle.checked) {
    detailPanel.style.opacity = '1';
    detailPanel.style.pointerEvents = 'auto';
  } else {
    detailPanel.style.opacity = '0.5';
    detailPanel.style.pointerEvents = 'none';
  }
}

function updateFolderPreview() {
  const folder = el('opt-save-folder').value;
  const isFlat = el('opt-flat-username').checked;
  const preview = document.getElementById('folder-preview');

  const clean = sanitizeFolder(folder);
  const parts = clean ? ['Downloads', clean, '[username]'] : ['Downloads', '[username]'];

  if (!preview) return;
  const fragment = document.createDocumentFragment();
  fragment.append('📂 ');
  const addPart = (part: string, color: string) => {
    const span = document.createElement('span');
    span.style.color = color;
    span.textContent = part;
    fragment.append(span);
  };
  parts.forEach((part, index) => {
    if (index > 0) fragment.append(' / ');
    addPart(part, part === '[username]' ? 'var(--accent)' : part === 'Downloads' ? '#888' : 'var(--green)');
  });
  if (!isFlat) {
    fragment.append(' / ');
    addPart('images', '#888');
  }
  fragment.append(' / ');
  addPart('photo.jpg', '#555');
  preview.replaceChildren(fragment);
}

// Pha 13: preview realtime cho filename template — dữ liệu mẫu, không sanitize
// (sanitize chỉ áp dụng thật khi tải, xem downloader.ts buildFilename)
function updateFilenameTemplatePreview() {
  const template = String(el('opt-filename-template').value || '').trim();
  const preview = document.getElementById('filename-template-preview');
  if (!preview) return;

  if (!template) {
    preview.style.display = 'none';
    return;
  }
  const sample = renderFilenameTemplate(template, {
    username: 'NASA', tweetId: '1234567890', date: '2026-09-18', type: 'image', ext: 'jpg', index: 1,
  });
  preview.style.display = 'block';
  preview.textContent = `📄 ${sample}`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.load();
    window.i18n.applyToDOM();
    const langSelect = document.getElementById('opt-language') as HTMLSelectElement | null;
    if (langSelect) langSelect.value = window.i18n.lang;
  }

  await applyTheme();
  await loadOptions();

  el('btn-save').addEventListener('click', saveOptions);

  const adaptiveToggle = el('opt-adaptive-scroll');
  const delayRow = el<HTMLElement>('row-scroll-delay');
  const delaySlider = el('opt-scroll-delay');

  const updateDelayRowState = () => {
    if (adaptiveToggle.checked) {
      delayRow.style.opacity = '0.5';
      delaySlider.disabled = true;
    } else {
      delayRow.style.opacity = '1';
      delaySlider.disabled = false;
    }
  };

  adaptiveToggle.addEventListener('change', updateDelayRowState);
  // initial state
  updateDelayRowState();

  el('opt-scroll-delay').addEventListener('input', (e) => {
    updateScrollLabel((e.target as HTMLInputElement).value);
  });

  el('opt-concurrency').addEventListener('input', (e) => {
    updateConcurrencyLabel((e.target as HTMLInputElement).value);
  });

  // Live preview khi gõ tên folder hoặc toggle flat/filenameUsername
  document.getElementById('opt-save-folder')?.addEventListener('input', updateFolderPreview);
  document.getElementById('opt-flat-username')?.addEventListener('change', updateFolderPreview);
  document.getElementById('opt-filename-username')?.addEventListener('change', updateFolderPreview);
  // Pha 13: Live preview khi gõ filename template
  document.getElementById('opt-filename-template')?.addEventListener('input', updateFilenameTemplatePreview);

  // FEAT-08: Auto-Stop toggle → dim/enable row-auto-stop-after
  document.getElementById('opt-auto-stop')?.addEventListener('change', updateAutoStopRowState);
  updateAutoStopRowState();

  // Appearance
  const langSelect = document.getElementById('opt-language') as HTMLSelectElement | null;
  if (langSelect) {
    langSelect.addEventListener('change', async (e) => {
      const newLang = (e.target as HTMLSelectElement).value;
      if (window.i18n) {
        window.i18n.lang = newLang;
        window.i18n.applyToDOM();
      }
      await chrome.storage.local.set({ lang: newLang });
    });
  }

  const themeSelect = document.getElementById('opt-theme-select') as HTMLSelectElement | null;
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      setTheme((e.target as HTMLSelectElement).value);
    });
  }
  
  // Call once to init with current state
  setTimeout(updateFolderPreview, 100);

  // Keyboard Shortcuts: master toggle dims/enables sub-options
  const scMasterToggle = document.getElementById('opt-shortcuts-enabled');
  if (scMasterToggle) {
    scMasterToggle.addEventListener('change', updateShortcutsDetailState);
  }

  // Debounce helper
  function debounce<T extends (...args: never[]) => void>(func: T, wait: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  const debouncedSave = debounce(saveOptions, 500);

  // UI-03: "Saving..." hiển thị ngay khi user gõ, trước khi debounce fire
  function showSavingIndicator() {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.textContent = '⏳ Saving...';
    el.classList.add('show');
  }

  // Auto-save khi thay đổi bất kỳ setting nào
  document.querySelectorAll('input').forEach(input => {
    if (input.type === 'text' || input.type === 'number') {
      input.addEventListener('input', () => { showSavingIndicator(); debouncedSave(); });
    }
    input.addEventListener('change', saveOptions);
  });

  // Data section buttons (Export, Import, Reset, Clear Downloaded)
  document.getElementById('btn-export')?.addEventListener('click', exportSettings);
  document.getElementById('btn-import')?.addEventListener('click', () => {
    document.getElementById('import-file-input')?.click();
  });
  document.getElementById('import-file-input')?.addEventListener('change', importSettings);
  document.getElementById('btn-reset')?.addEventListener('click', resetSettings);
  document.getElementById('btn-clear-all-downloaded')?.addEventListener('click', clearAllDownloadedHistory);
  document.getElementById('btn-export-diagnostics')?.addEventListener('click', exportLocalDiagnostics);
  document.getElementById('btn-clear-diagnostics')?.addEventListener('click', clearLocalDiagnostics);
});

// ─── Theme ─────────────────────────────────────────────────────────────────
async function applyTheme(): Promise<void> {
  const stored: Record<string, unknown> = await chrome.storage.local.get('theme').catch(() => ({}));
  let theme = (stored.theme as string) || 'dark';
  const themeSelect = document.getElementById('opt-theme-select') as HTMLSelectElement | null;
  if (themeSelect) themeSelect.value = theme;

  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
}

function setTheme(next: string): void {
  chrome.storage.local.set({ theme: next });
  if (next === 'system') {
    const active = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', active);
  } else {
    document.documentElement.setAttribute('data-theme', next);
  }
}

// v4.1.0: System theme auto switch
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
  const stored = await chrome.storage.local.get('theme').catch(() => ({})) as { theme?: string };
  if (stored.theme === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// ─── v5.3.1: Export / Import / Reset ──────────────────────────────────────────────────

async function exportSettings() {
  try {
    const stored = await chrome.storage.sync.get('options').catch(() => ({})) as { options?: Record<string, unknown> };
    const opts = stored.options || DEFAULT_OPTIONS;
    const exportData = {
      _version: '5.3.1',
      _exportedAt: new Date().toISOString(),
      options: opts,
    };
    const json = JSON.stringify(exportData, null, 2);
    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    await chrome.downloads.download({
      url: dataUrl,
      filename: `extensionx_settings_${dateStr}.json`,
      saveAs: false,
    });
    showSaveStatus('✓ Exported successfully');
  } catch (err) {
    console.error('[Options] exportSettings error:', err);
    alert('Export thất bại: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function importSettings(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  // Reset input để có thể import lại cùng file
  target.value = '';

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    // Validate cơ bản
    if (!parsed.options || typeof parsed.options !== 'object') {
      throw new Error('File không hợp lệ: thiếu trường options');
    }

    // Merge với DEFAULT_OPTIONS để đảm bảo các field bị thiếu được fill
    const merged = { ...DEFAULT_OPTIONS, ...parsed.options };
    if (parsed.options.smartFilters) {
      merged.smartFilters = { ...DEFAULT_OPTIONS.smartFilters, ...parsed.options.smartFilters };
    }
    if (parsed.options.mediaTypes) {
      merged.mediaTypes = { ...DEFAULT_OPTIONS.mediaTypes, ...parsed.options.mediaTypes };
    }

    await chrome.storage.sync.set({ options: merged });

    // Reload page để apply
    showSaveStatus('✓ Imported! Reloading...');
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    console.error('[Options] importSettings error:', err);
    alert('Import thất bại: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function resetSettings() {
  const confirmed = confirm(
    'Reset toàn bộ cài đặt về mặc định?\n\nHành động này không thể hoàn tác.'
  );
  if (!confirmed) return;

  try {
    await chrome.storage.sync.set({ options: DEFAULT_OPTIONS });
    showSaveStatus('✓ Reset! Reloading...');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    console.error('[Options] resetSettings error:', err);
    alert('Reset thất bại: ' + (err instanceof Error ? err.message : String(err)));
  }
}

function showSaveStatus(msg = '✓ Saved successfully') {
  const statusEl = document.getElementById('save-status');
  if (!statusEl) return;
  const prev = statusEl.textContent;
  statusEl.textContent = msg;
  statusEl.classList.add('show');
  setTimeout(() => {
    statusEl.classList.remove('show');
    statusEl.textContent = prev;
  }, 2500);
}

async function clearAllDownloadedHistory() {
  const confirmed = confirm(
    'Xóa toàn bộ lịch sử các file đã tải của TẤT CẢ profile?\n\nSau khi xóa, bạn có thể tải lại bất kỳ file nào mà không bị tính năng chống trùng bỏ qua.'
  );
  if (!confirmed) return;

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DOWNLOADED' });
    showSaveStatus('✓ Đã xóa toàn bộ lịch sử tải!');
    alert('✓ Đã xóa thành công toàn bộ lịch sử tải của tất cả profile! Bạn có thể tải lại bất kỳ file nào.');
  } catch (err) {
    console.error('[Options] clearAllDownloadedHistory error:', err);
    alert('Lỗi: ' + (err instanceof Error ? err.message : String(err)));
  }
}

async function exportLocalDiagnostics() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_LOCAL_DIAGNOSTICS' });
    const diagnostics = response?.diagnostics;
    if (!diagnostics) throw new Error('Không đọc được diagnostic');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(diagnostics, null, 2))}`;
    await chrome.downloads.download({ url: dataUrl, filename: `extensionx_diagnostics_${dateStr}.json`, saveAs: false });
    showSaveStatus('✓ Đã xuất diagnostic cục bộ');
  } catch (err) {
    console.error('[Options] exportLocalDiagnostics error:', err);
    alert(`Không thể xuất diagnostic: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`);
  }
}

async function clearLocalDiagnostics() {
  if (!confirm('Xóa toàn bộ diagnostic cục bộ?')) return;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CLEAR_LOCAL_DIAGNOSTICS' });
    if (!response?.ok) throw new Error('Không thể xóa diagnostic');
    showSaveStatus('✓ Đã xóa diagnostic cục bộ');
  } catch (err) {
    console.error('[Options] clearLocalDiagnostics error:', err);
    alert(`Không thể xóa diagnostic: ${err instanceof Error ? err.message : 'Lỗi không xác định'}`);
  }
}

window.exportSettings = exportSettings;
window.importSettings = importSettings;
window.resetSettings = resetSettings;
window.clearAllDownloadedHistory = clearAllDownloadedHistory;
