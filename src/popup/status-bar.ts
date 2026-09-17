/**
 * status-bar.ts — Trạng thái & progress bar của popup (Pha 8 refactor).
 * Tách nguyên vẹn từ popup.ts, không đổi hành vi.
 */

export function setStatus(state: string, text: string, phaseIcon?: string): void {
  const statusText = document.getElementById('status-text');
  const statusDot = document.getElementById('status-dot');

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
    statusDot.setAttribute('aria-label', `Trạng thái: ${state || 'idle'}`);
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
  }
}
