/**
 * status-bar.ts — Trạng thái & progress bar của popup (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi.
 */
import { t } from '../lib/i18n.ts';

/**
 * `busy`: cập nhật trong lúc đang tải từng file. U25: vùng trạng thái là live
 * region; aria-busy để screen reader không đọc mỗi lần cập nhật (~4 lần/giây)
 * mà chỉ đọc khi bắt đầu/kết thúc.
 */
export function setStatus(state: string, text: string, phaseIcon?: string, busy = false): void {
  const statusText = document.getElementById('status-text');
  const statusDot = document.getElementById('status-dot');
  document.getElementById('status-bar')?.setAttribute('aria-busy', String(busy));

  if (statusText) {
    statusText.replaceChildren();
    if (phaseIcon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'status-phase-icon';
      iconSpan.textContent = phaseIcon;
      statusText.append(iconSpan);
    }
    statusText.append(document.createTextNode(text));
  }
  if (statusDot) {
    statusDot.className = 'status-dot ' + (state || '');
    // U22: trạng thái được dịch (trước đây đọc giá trị nội bộ 'downloading'…).
    statusDot.setAttribute('aria-label', t('popup_status_aria', { state: t(`popup_state_${state || 'idle'}`) }));
  }
}

export function showProgress(show: boolean): void {
  const progressWrap = document.getElementById('progress-wrap');
  const progressFill = document.getElementById('progress-fill') as HTMLElement | null;
  const progressLbl = document.getElementById('progress-label');
  if (progressWrap) progressWrap.style.display = show ? 'flex' : 'none';
  if (!show) {
    if (progressFill) progressFill.style.width = '0%';
    if (progressLbl) progressLbl.textContent = '0 / 0';
    setProgressValue(0);
  }
}

/** U25: giá trị cho role="progressbar" (0–100). */
export function setProgressValue(percent: number): void {
  document.getElementById('progress-track')?.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, Math.round(percent) || 0))));
}
