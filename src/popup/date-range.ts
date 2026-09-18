/**
 * date-range.ts — v4.3.0 Date Range Filter + v4.8.0 Keyword filter (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi.
 */

export type SendBGFn = (type: string, payload?: Record<string, unknown>) => Promise<any>;

export interface DateRangeDeps {
  getUsername: () => string | null;
  getActiveFilter: () => string;
  sendBG: SendBGFn;
  onChange: () => void;
}

interface DateRangeEls {
  daterangeToggle: HTMLElement | null;
  daterangePanel: HTMLElement | null;
  daterangeChevron: HTMLElement | null;
  daterangeActiveBadge: HTMLElement | null;
  btnDaterangeClear: HTMLElement | null;
  inputDateFrom: HTMLInputElement | null;
  inputDateTo: HTMLInputElement | null;
  inputKeyword: HTMLInputElement | null;
  daterangeCountRow: HTMLElement | null;
  daterangeCountText: HTMLElement | null;
}

let _deps: DateRangeDeps | null = null;
let _dateRangeOpen = false;
let dateFrom = ''; // YYYY-MM-DD
let dateTo = ''; // YYYY-MM-DD
let filterKeyword = '';
let _debounceTimer: ReturnType<typeof setTimeout> | undefined;
let _countTimer: ReturnType<typeof setTimeout> | undefined;
// Pha 11: nâng lên module-scope để setDateRange() dùng lại đúng DOM refs, không
// query lại — chỉ có giá trị sau khi initDateRange() đã chạy.
let _els: DateRangeEls | null = null;

export function getDateRange(): { dateFrom: string; dateTo: string; keyword: string } {
  return { dateFrom, dateTo, keyword: filterKeyword };
}

/** Pha 11: áp dụng preset đã lưu — cập nhật cả state nội bộ lẫn input DOM. */
export function setDateRange(partial: { dateFrom?: string; dateTo?: string; keyword?: string }): void {
  if (!_els) return;
  if (partial.dateFrom !== undefined) {
    dateFrom = partial.dateFrom;
    if (_els.inputDateFrom) _els.inputDateFrom.value = partial.dateFrom;
  }
  if (partial.dateTo !== undefined) {
    dateTo = partial.dateTo;
    if (_els.inputDateTo) _els.inputDateTo.value = partial.dateTo;
  }
  if (partial.keyword !== undefined) {
    filterKeyword = partial.keyword;
    if (_els.inputKeyword) _els.inputKeyword.value = partial.keyword;
  }
  document.querySelectorAll('.btn-preset').forEach((b) => b.classList.remove('active'));
  updateDateRangeUI(_els);
}

export function initDateRange(deps: DateRangeDeps): void {
  _deps = deps;

  const els: DateRangeEls = {
    daterangeToggle: document.getElementById('daterange-toggle'),
    daterangePanel: document.getElementById('daterange-panel'),
    daterangeChevron: document.getElementById('daterange-chevron'),
    daterangeActiveBadge: document.getElementById('daterange-active-badge'),
    btnDaterangeClear: document.getElementById('btn-daterange-clear'),
    inputDateFrom: document.getElementById('filter-date-from') as HTMLInputElement | null,
    inputDateTo: document.getElementById('filter-date-to') as HTMLInputElement | null,
    inputKeyword: document.getElementById('filter-keyword') as HTMLInputElement | null,
    daterangeCountRow: document.getElementById('daterange-count-row'),
    daterangeCountText: document.getElementById('daterange-count-text'),
  };
  _els = els;

  if (!els.daterangeToggle || !els.inputDateFrom || !els.inputDateTo) return;

  // UI-02: Toggle có animation — dùng max-height thay vì display:block/none
  const toggleDateRange = () => {
    _dateRangeOpen = !_dateRangeOpen;
    els.daterangeToggle!.setAttribute('aria-expanded', String(_dateRangeOpen));
    els.daterangePanel?.classList.toggle('open', _dateRangeOpen);
    els.daterangeChevron?.classList.toggle('open', _dateRangeOpen);
  };
  els.daterangeToggle.addEventListener('click', toggleDateRange);
  els.daterangeToggle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDateRange();
    }
  });

  // Date inputs — debounce để không query SW quá nhiều
  const onDateChange = () => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      dateFrom = els.inputDateFrom!.value;
      dateTo = els.inputDateTo!.value;
      filterKeyword = els.inputKeyword ? els.inputKeyword.value.trim() : '';
      updateDateRangeUI(els);
      updateDateRangeCount(els);
    }, 300);
  };
  els.inputDateFrom.addEventListener('change', onDateChange);
  els.inputDateTo.addEventListener('change', onDateChange);
  if (els.inputKeyword) els.inputKeyword.addEventListener('input', onDateChange); // v4.8.0

  // Preset buttons
  document.querySelectorAll<HTMLElement>('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const now = new Date();
      const toDate = now.toISOString().slice(0, 10);
      let fromDate = '';

      if (preset === '7d') {
        fromDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      } else if (preset === '30d') {
        fromDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      } else if (preset === '90d') {
        fromDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      } else if (preset === '1y') {
        fromDate = `${now.getFullYear()}-01-01`;
      }

      els.inputDateFrom!.value = fromDate;
      els.inputDateTo!.value = toDate;
      dateFrom = fromDate;
      dateTo = toDate;

      // Update active state
      document.querySelectorAll('.btn-preset').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      updateDateRangeUI(els);
      updateDateRangeCount(els);
    });
  });

  // Clear button
  els.btnDaterangeClear?.addEventListener('click', () => {
    clearDateRange(els);
  });
}

function clearDateRange(els: DateRangeEls): void {
  dateFrom = '';
  dateTo = '';
  filterKeyword = '';
  if (els.inputDateFrom) els.inputDateFrom.value = '';
  if (els.inputDateTo) els.inputDateTo.value = '';
  if (els.inputKeyword) els.inputKeyword.value = '';
  document.querySelectorAll('.btn-preset').forEach((b) => b.classList.remove('active'));
  updateDateRangeUI(els);
  if (els.daterangeCountRow) els.daterangeCountRow.style.display = 'none';
  _deps?.onChange();
}

function updateDateRangeUI(els: DateRangeEls): void {
  const hasFilter = !!dateFrom || !!dateTo || !!filterKeyword;

  els.daterangeToggle?.classList.toggle('has-filter', hasFilter);
  if (els.daterangeActiveBadge) els.daterangeActiveBadge.style.display = hasFilter ? 'inline' : 'none';
  if (els.btnDaterangeClear) els.btnDaterangeClear.style.display = hasFilter ? 'flex' : 'none';

  _deps?.onChange();
}

function updateDateRangeCount(els: DateRangeEls): void {
  const username = _deps?.getUsername();
  if (!username) return;
  if (!dateFrom && !dateTo) return;

  clearTimeout(_countTimer);
  _countTimer = setTimeout(async () => {
    const res: any = await _deps!.sendBG('GET_MEDIA_COUNT_FILTERED', {
      username,
      filterType: _deps!.getActiveFilter(),
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
