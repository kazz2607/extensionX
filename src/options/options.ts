
/**
 * options.js — Logic trang Cài đặt (v5.5.1)
 */

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
  smartFilters: {                              // Smart Filters (v3.8.0)
    filterAvatars:    true,
    filterCardImages: true,
    minImageWidth:    150,
    minImageHeight:   150,
  },
  showSnackbar: true,                          // Progress Snackbar trên trang X.com (v4.0.0)
  showNotification: true,                      // System notification khi tải xong (v4.1.0)
  enableBookmarks: true,                       // Cho phép quét trang Bookmarks (v5.4.0)
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
  const stored: any = await chrome.storage.sync.get('options').catch(() => ({}));
  const opts = { ...DEFAULT_OPTIONS, ...(stored.options || {}) };

// @ts-ignore
  document.getElementById('opt-save-folder').value   = opts.saveFolder || '';
// @ts-ignore
  document.getElementById('opt-images').checked      = opts.mediaTypes?.images ?? true;
// @ts-ignore
  document.getElementById('opt-videos').checked      = opts.mediaTypes?.videos ?? true;
// @ts-ignore
  document.getElementById('opt-gifs').checked        = opts.mediaTypes?.gifs ?? true;
// @ts-ignore
  document.getElementById('opt-img-quality').value   = opts.imgQuality || 'orig';
// @ts-ignore
  document.getElementById('opt-auto-scroll').checked = opts.autoScroll || false;
// @ts-ignore
  document.getElementById('opt-adaptive-scroll').checked = opts.adaptiveScroll ?? true;
// @ts-ignore
  document.getElementById('opt-scroll-delay').value  = opts.scrollDelay || 2;
// @ts-ignore
  document.getElementById('opt-max-scrolls').value   = opts.maxScrolls || 200;
// @ts-ignore
  document.getElementById('opt-concurrency').value   = opts.concurrency || 3;
// @ts-ignore
  document.getElementById('opt-save-as').checked     = opts.saveAs || false;
// @ts-ignore
  document.getElementById('opt-max-media').value     = opts.maxMedia || 0;
// @ts-ignore
  document.getElementById('opt-flat-username').checked = opts.flatUsername || false;
// @ts-ignore
  document.getElementById('opt-filename-username').checked = opts.filenameUsername || false;

  // Smart Filters
  const sf = opts.smartFilters || DEFAULT_OPTIONS.smartFilters;
// @ts-ignore
  document.getElementById('opt-filter-avatars').checked    = sf.filterAvatars    ?? true;
// @ts-ignore
  document.getElementById('opt-filter-card-images').checked = sf.filterCardImages ?? true;
// @ts-ignore
  document.getElementById('opt-min-img-width').value       = sf.minImageWidth    ?? 150;
// @ts-ignore
  document.getElementById('opt-min-img-height').value      = sf.minImageHeight   ?? 150;
// @ts-ignore
  document.getElementById('opt-show-snackbar').checked     = opts.showSnackbar   ?? true;
// @ts-ignore
  document.getElementById('opt-show-notification').checked = opts.showNotification ?? true;
// @ts-ignore
  document.getElementById('opt-enable-bookmarks').checked = opts.enableBookmarks ?? true;

  // Keyboard Shortcuts (v5.5.0)
  const sc = opts.shortcuts || DEFAULT_OPTIONS.shortcuts;
// @ts-ignore
  document.getElementById('opt-shortcuts-enabled').checked = sc.enabled ?? false;
// @ts-ignore
  document.getElementById('opt-sc-copy-link').checked      = sc.copyLink?.enabled ?? true;
// @ts-ignore
  document.getElementById('opt-sc-download').checked       = sc.downloadMedia?.enabled ?? true;
// @ts-ignore
  document.getElementById('opt-sc-copy-img-url').checked   = sc.copyImageUrl?.enabled ?? true;
// @ts-ignore
  document.getElementById('opt-sc-open-original').checked  = sc.openOriginal?.enabled ?? true;
// @ts-ignore
  document.getElementById('opt-sc-reverse-search').checked = sc.reverseSearch?.enabled ?? true;
// @ts-ignore
  document.getElementById('opt-sc-show-toast').checked     = sc.showToast ?? true;
  updateShortcutsDetailState();

  updateScrollLabel(opts.scrollDelay || 2);
  updateConcurrencyLabel(opts.concurrency || 3);
// @ts-ignore
  updateFolderPreview();
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveOptions() {
  const opts = {
// @ts-ignore
    saveFolder:  sanitizeFolder(document.getElementById('opt-save-folder').value),
    mediaTypes: {
// @ts-ignore
      images: document.getElementById('opt-images').checked,
// @ts-ignore
      videos: document.getElementById('opt-videos').checked,
// @ts-ignore
      gifs:   document.getElementById('opt-gifs').checked,
    },
// @ts-ignore
    imgQuality:  document.getElementById('opt-img-quality').value,
// @ts-ignore
    autoScroll:  document.getElementById('opt-auto-scroll').checked,
// @ts-ignore
    adaptiveScroll: document.getElementById('opt-adaptive-scroll').checked,
// @ts-ignore
    scrollDelay: parseFloat(document.getElementById('opt-scroll-delay').value) || 2,
// @ts-ignore
    maxScrolls:  parseInt(document.getElementById('opt-max-scrolls').value) || 200,
// @ts-ignore
    concurrency: parseInt(document.getElementById('opt-concurrency').value) || 3,
// @ts-ignore
    saveAs:      document.getElementById('opt-save-as').checked,
// @ts-ignore
    maxMedia:    parseInt(document.getElementById('opt-max-media').value) || 0,
// @ts-ignore
    flatUsername: document.getElementById('opt-flat-username').checked,
// @ts-ignore
    filenameUsername: document.getElementById('opt-filename-username').checked,
    smartFilters: {
// @ts-ignore
      filterAvatars:    document.getElementById('opt-filter-avatars').checked,
// @ts-ignore
      filterCardImages: document.getElementById('opt-filter-card-images').checked,
// @ts-ignore
      minImageWidth:    parseInt(document.getElementById('opt-min-img-width').value)  || 0,
// @ts-ignore
      minImageHeight:   parseInt(document.getElementById('opt-min-img-height').value) || 0,
    },
// @ts-ignore
    showSnackbar: document.getElementById('opt-show-snackbar').checked,
// @ts-ignore
    showNotification: document.getElementById('opt-show-notification').checked,
// @ts-ignore
    enableBookmarks:  document.getElementById('opt-enable-bookmarks').checked,
    shortcuts: {
// @ts-ignore
      enabled:       document.getElementById('opt-shortcuts-enabled').checked,
// @ts-ignore
      showToast:     document.getElementById('opt-sc-show-toast').checked,
      copyLink:      { enabled: (document.getElementById('opt-sc-copy-link') as HTMLInputElement)?.checked ?? true,      modifiers: 'ctrl', key: 'c' },
      downloadMedia: { enabled: (document.getElementById('opt-sc-download') as HTMLInputElement)?.checked ?? true,       modifiers: 'ctrl', key: 's' },
      copyImageUrl:  { enabled: (document.getElementById('opt-sc-copy-img-url') as HTMLInputElement)?.checked ?? true,   modifiers: 'ctrl+shift', key: 'c' },
      openOriginal:  { enabled: (document.getElementById('opt-sc-open-original') as HTMLInputElement)?.checked ?? true,  modifiers: 'ctrl+shift', key: 'o' },
      reverseSearch: { enabled: (document.getElementById('opt-sc-reverse-search') as HTMLInputElement)?.checked ?? true, modifiers: 'ctrl+shift', key: 'g' },
    },
  };

  await chrome.storage.sync.set({ options: opts });

  // UI-03: Reset text về "✓ Saved" sau khi lưu xong (có thể đang là "Saving...")
  const el = document.getElementById('save-status');
  if (el) {
    el.textContent = window.i18n ? window.i18n.t('save_success') : '✓ Saved';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// @ts-ignore
function updateScrollLabel(val) {
// @ts-ignore
  document.getElementById('scroll-delay-val').textContent = `${val}s`;
}

// @ts-ignore
function updateConcurrencyLabel(val) {
// @ts-ignore
  document.getElementById('concurrency-val').textContent = val;
}

// @ts-ignore
function sanitizeFolder(str) {
  return str
    .replace(/[<>:"|?*\\]/g, '_')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

// v5.5.0: Toggle shortcuts detail panel (dim khi master toggle tắt)
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
// @ts-ignore
  const folder = document.getElementById('opt-save-folder').value;
// @ts-ignore
  const isFlat = document.getElementById('opt-flat-username').checked;
  const preview = document.getElementById('folder-preview');

  const clean = sanitizeFolder(folder);
  const parts = clean ? ['Downloads', clean, '[username]'] : ['Downloads', '[username]'];

  let html = '📂 ' + parts.map((p, i) => {
    const color = p === '[username]' ? 'var(--accent)' : p === 'Downloads' ? '#888' : 'var(--green)';
    return `<span style="color:${color}">${p}</span>`;
  }).join(' / ');

  if (!isFlat) {
    html += ' / <span style="color:#888">images</span>';
  }
  html += ' / <span style="color:#555">photo.jpg</span>';

// @ts-ignore
  preview.innerHTML = html;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.load();
    window.i18n.applyToDOM();
    const langSelect = document.getElementById('opt-language');
// @ts-ignore
    if (langSelect) langSelect.value = window.i18n.lang;
  }
  
  await applyTheme();
  await loadOptions();

// @ts-ignore
  document.getElementById('btn-save').addEventListener('click', saveOptions);

  const adaptiveToggle = document.getElementById('opt-adaptive-scroll');
  const delayRow = document.getElementById('row-scroll-delay');
  const delaySlider = document.getElementById('opt-scroll-delay');
  
  const updateDelayRowState = () => {
// @ts-ignore
    if (adaptiveToggle.checked) {
// @ts-ignore
      delayRow.style.opacity = '0.5';
// @ts-ignore
      delaySlider.disabled = true;
    } else {
// @ts-ignore
      delayRow.style.opacity = '1';
// @ts-ignore
      delaySlider.disabled = false;
    }
  };
  
// @ts-ignore
  adaptiveToggle.addEventListener('change', updateDelayRowState);
  // initial state
  updateDelayRowState();

// @ts-ignore
  document.getElementById('opt-scroll-delay').addEventListener('input', (e) => {
// @ts-ignore
    updateScrollLabel(e.target.value);
  });

// @ts-ignore
  document.getElementById('opt-concurrency').addEventListener('input', (e) => {
// @ts-ignore
    updateConcurrencyLabel(e.target.value);
  });

  // Live preview khi gõ tên folder hoặc toggle flat username
// @ts-ignore
  document.getElementById('opt-save-folder').addEventListener('input', updateFolderPreview);
// @ts-ignore
  document.getElementById('opt-flat-username').addEventListener('change', updateFolderPreview);
  
  // Appearance
  const langSelect = document.getElementById('opt-language');
  if (langSelect) {
    langSelect.addEventListener('change', async (e) => {
// @ts-ignore
      const newLang = e.target.value;
      if (window.i18n) {
        window.i18n.lang = newLang;
        window.i18n.applyToDOM();
      }
      await chrome.storage.local.set({ lang: newLang });
    });
  }

  const themeSelect = document.getElementById('opt-theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
// @ts-ignore
      setTheme(e.target.value);
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
  function debounce(func: (...args: any[]) => void, wait: number) {
    let timeout: any;
    return function(this: any, ...args: any[]) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
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
});

// ─── Theme ─────────────────────────────────────────────────────────────────
// @ts-ignore
async function applyTheme() {
  const stored: any = await chrome.storage.local.get('theme').catch(() => ({}));
  let theme = stored.theme || 'dark';
  const themeSelect = document.getElementById('opt-theme-select');
// @ts-ignore
  if (themeSelect) themeSelect.value = theme;
  
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
}

// @ts-ignore
function setTheme(next) {
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
  const stored: any = await chrome.storage.local.get('theme').catch(() => ({}));
  if (stored.theme === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// ─── v5.3.1: Export / Import / Reset ──────────────────────────────────────────────────

async function exportSettings() {
  try {
    const stored: any = await chrome.storage.sync.get('options').catch(() => ({}));
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
// @ts-ignore
    alert('Export thất bại: ' + err.message);
  }
}

// @ts-ignore
async function importSettings(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  // Reset input để có thể import lại cùng file
  event.target.value = '';

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
// @ts-ignore
    alert('Import thất bại: ' + err.message);
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
// @ts-ignore
    alert('Reset thất bại: ' + err.message);
  }
}

function showSaveStatus(msg = '✓ Saved successfully') {
  const el = document.getElementById('save-status');
  if (!el) return;
  const prev = el.textContent;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    el.textContent = prev;
  }, 2500);
}
