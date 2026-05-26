/**
 * options.js — Logic trang Cài đặt (Phase 3)
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
document.addEventListener('DOMContentLoaded', () => {
  loadOptions();

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
  
  // Call once to init with current state
  setTimeout(updateFolderPreview, 100);
});
