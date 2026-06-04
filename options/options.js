/**
 * options.js — Logic trang Cài đặt (v4.2.0)
 */

const DEFAULT_OPTIONS = {
  saveFolder: '',                              // Thư mục con trong Downloads
  mediaTypes: { images: true, videos: true, gifs: true },
  imgQuality: 'orig',
  autoScroll: false,
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
};

// ─── Load ─────────────────────────────────────────────────────────────────────
async function loadOptions() {
  const stored = await chrome.storage.sync.get('options').catch(() => ({}));
  const opts = { ...DEFAULT_OPTIONS, ...(stored.options || {}) };

  document.getElementById('opt-save-folder').value   = opts.saveFolder || '';
  document.getElementById('opt-images').checked      = opts.mediaTypes?.images ?? true;
  document.getElementById('opt-videos').checked      = opts.mediaTypes?.videos ?? true;
  document.getElementById('opt-gifs').checked        = opts.mediaTypes?.gifs ?? true;
  document.getElementById('opt-img-quality').value   = opts.imgQuality || 'orig';
  document.getElementById('opt-auto-scroll').checked = opts.autoScroll || false;
  document.getElementById('opt-scroll-delay').value  = opts.scrollDelay || 2;
  document.getElementById('opt-max-scrolls').value   = opts.maxScrolls || 200;
  document.getElementById('opt-concurrency').value   = opts.concurrency || 3;
  document.getElementById('opt-save-as').checked     = opts.saveAs || false;
  document.getElementById('opt-max-media').value     = opts.maxMedia || 0;
  document.getElementById('opt-flat-username').checked = opts.flatUsername || false;
  document.getElementById('opt-filename-username').checked = opts.filenameUsername || false;

  // Smart Filters
  const sf = opts.smartFilters || DEFAULT_OPTIONS.smartFilters;
  document.getElementById('opt-filter-avatars').checked    = sf.filterAvatars    ?? true;
  document.getElementById('opt-filter-card-images').checked = sf.filterCardImages ?? true;
  document.getElementById('opt-min-img-width').value       = sf.minImageWidth    ?? 150;
  document.getElementById('opt-min-img-height').value      = sf.minImageHeight   ?? 150;
  document.getElementById('opt-show-snackbar').checked     = opts.showSnackbar   ?? true;
  document.getElementById('opt-show-notification').checked = opts.showNotification ?? true;

  updateScrollLabel(opts.scrollDelay || 2);
  updateConcurrencyLabel(opts.concurrency || 3);
  updateFolderPreview(opts.saveFolder || '');
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveOptions() {
  const opts = {
    saveFolder:  sanitizeFolder(document.getElementById('opt-save-folder').value),
    mediaTypes: {
      images: document.getElementById('opt-images').checked,
      videos: document.getElementById('opt-videos').checked,
      gifs:   document.getElementById('opt-gifs').checked,
    },
    imgQuality:  document.getElementById('opt-img-quality').value,
    autoScroll:  document.getElementById('opt-auto-scroll').checked,
    scrollDelay: parseFloat(document.getElementById('opt-scroll-delay').value) || 2,
    maxScrolls:  parseInt(document.getElementById('opt-max-scrolls').value) || 200,
    concurrency: parseInt(document.getElementById('opt-concurrency').value) || 3,
    saveAs:      document.getElementById('opt-save-as').checked,
    maxMedia:    parseInt(document.getElementById('opt-max-media').value) || 0,
    flatUsername: document.getElementById('opt-flat-username').checked,
    filenameUsername: document.getElementById('opt-filename-username').checked,
    smartFilters: {
      filterAvatars:    document.getElementById('opt-filter-avatars').checked,
      filterCardImages: document.getElementById('opt-filter-card-images').checked,
      minImageWidth:    parseInt(document.getElementById('opt-min-img-width').value)  || 0,
      minImageHeight:   parseInt(document.getElementById('opt-min-img-height').value) || 0,
    },
    showSnackbar: document.getElementById('opt-show-snackbar').checked,
    showNotification: document.getElementById('opt-show-notification').checked,
  };

  await chrome.storage.sync.set({ options: opts });

  const el = document.getElementById('save-status');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function updateScrollLabel(val) {
  document.getElementById('scroll-delay-val').textContent = `${val}s`;
}

function updateConcurrencyLabel(val) {
  document.getElementById('concurrency-val').textContent = val;
}

function sanitizeFolder(str) {
  return str
    .replace(/[<>:"|?*\\]/g, '_')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function updateFolderPreview() {
  const folder = document.getElementById('opt-save-folder').value;
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

  preview.innerHTML = html;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (window.i18n) {
    await window.i18n.load();
    window.i18n.applyToDOM();
    const langSelect = document.getElementById('opt-language');
    if (langSelect) langSelect.value = window.i18n.lang;
  }
  
  await applyTheme();
  await loadOptions();

  document.getElementById('btn-save').addEventListener('click', saveOptions);

  document.getElementById('opt-scroll-delay').addEventListener('input', (e) => {
    updateScrollLabel(e.target.value);
  });

  document.getElementById('opt-concurrency').addEventListener('input', (e) => {
    updateConcurrencyLabel(e.target.value);
  });

  // Live preview khi gõ tên folder hoặc toggle flat username
  document.getElementById('opt-save-folder').addEventListener('input', updateFolderPreview);
  document.getElementById('opt-flat-username').addEventListener('change', updateFolderPreview);
  
  // Appearance
  const langSelect = document.getElementById('opt-language');
  if (langSelect) {
    langSelect.addEventListener('change', async (e) => {
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
      setTheme(e.target.value);
    });
  }
  
  // Call once to init with current state
  setTimeout(updateFolderPreview, 100);
});

// ─── Theme ─────────────────────────────────────────────────────────────────
async function applyTheme() {
  const stored = await chrome.storage.local.get('theme').catch(() => ({}));
  let theme = stored.theme || 'dark';
  const themeSelect = document.getElementById('opt-theme-select');
  if (themeSelect) themeSelect.value = theme;
  
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
}

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
  const stored = await chrome.storage.local.get('theme').catch(() => ({}));
  if (stored.theme === 'system') {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  }
});

// ─── v4.2.0: Export / Import / Reset ──────────────────────────────────────────────────

async function exportSettings() {
  try {
    const stored = await chrome.storage.sync.get('options').catch(() => ({}));
    const opts = stored.options || DEFAULT_OPTIONS;
    const exportData = {
      _version: '4.2.0',
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
    alert('Export thất bại: ' + err.message);
  }
}

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
