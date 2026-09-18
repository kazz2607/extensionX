/**
 * presets.ts — Pha 11: Download Recipe/Preset theo profile.
 * Lưu/nạp snapshot bộ lọc (filterType, skipDuplicates, dateFrom, dateTo, keyword)
 * cho từng username, thẳng vào chrome.storage.local — không qua service worker vì
 * đây là state thuần phía popup, không phải dữ liệu nhạy cảm cần xác thực nguồn gốc
 * (giống hệt cách pref_skip_duplicates/compactMode/theme đã lưu trực tiếp).
 */

export type ShowToastFn = (msg: string, type?: string) => void;

export interface FilterPreset {
  filterType: string;
  skipDuplicates: boolean;
  dateFrom: string;
  dateTo: string;
  keyword: string;
}

export interface PresetsDeps {
  getUsername: () => string | null;
  getActiveFilter: () => string;
  getDateRange: () => { dateFrom: string; dateTo: string; keyword: string };
  getSkipDuplicates: () => boolean;
  onApplyPreset: (preset: FilterPreset) => void;
  showToast: ShowToastFn;
}

let _deps: PresetsDeps | null = null;

function presetKey(username: string): string {
  return `preset_${username}`;
}

async function savePreset(): Promise<void> {
  const username = _deps?.getUsername();
  if (!_deps) return;
  if (!username) {
    _deps.showToast('Chưa xác định profile', 'error');
    return;
  }
  const { dateFrom, dateTo, keyword } = _deps.getDateRange();
  const preset: FilterPreset = {
    filterType: _deps.getActiveFilter(),
    skipDuplicates: _deps.getSkipDuplicates(),
    dateFrom,
    dateTo,
    keyword,
  };
  await chrome.storage.local.set({ [presetKey(username)]: preset });
  _deps.showToast(`💾 Đã lưu bộ lọc cho @${username}`, 'success');
}

async function loadPreset(): Promise<void> {
  const username = _deps?.getUsername();
  if (!_deps) return;
  if (!username) {
    _deps.showToast('Chưa xác định profile', 'error');
    return;
  }
  const key = presetKey(username);
  const stored: Record<string, unknown> = await chrome.storage.local.get(key).catch(() => ({}));
  const preset = stored[key] as FilterPreset | undefined;
  if (!preset) {
    _deps.showToast(`@${username} chưa có bộ lọc đã lưu`, 'info');
    return;
  }
  _deps.onApplyPreset(preset);
  _deps.showToast(`📂 Đã nạp bộ lọc đã lưu cho @${username}`, 'success');
}

export function initPresets(deps: PresetsDeps): void {
  _deps = deps;
  document.getElementById('btn-save-preset')?.addEventListener('click', () => void savePreset());
  document.getElementById('btn-load-preset')?.addEventListener('click', () => void loadPreset());
}
