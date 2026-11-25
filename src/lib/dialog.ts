/**
 * dialog.ts — U21: hộp xác nhận / thông báo dùng chung cho Options và Download
 * Center, thay `confirm()`/`alert()` gốc: hộp gốc chặn cả trang, không theo
 * theme, tiêu đề hiện "chrome-extension://…" và không dịch được nút.
 * `<dialog>.showModal()` có sẵn bẫy focus, Escape (= huỷ) và trả focus về chỗ cũ.
 * Màu lấy từ token của shared/tokens.css nên theo theme sáng/tối.
 */
import { t } from './i18n.ts';

const STYLE_ID = 'xmd-dialog-style';
const CSS = `
.xmd-dialog { margin: auto; max-width: min(440px, calc(100vw - 32px)); padding: 20px; border: 1px solid var(--border);
  border-radius: var(--radius); background: var(--bg-card); color: var(--text); box-shadow: var(--shadow-modal);
  font: 14px/1.5 var(--font); }
.xmd-dialog::backdrop { background: var(--scrim); }
.xmd-dialog p { margin: 0 0 16px; white-space: pre-line; overflow-wrap: anywhere; }
.xmd-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.xmd-dialog button { min-height: 32px; padding: 6px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg-hover); color: var(--text); font: inherit; cursor: pointer; }
.xmd-dialog button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.xmd-dialog button.danger { background: var(--red); border-color: var(--red); color: #fff; }
.xmd-dialog button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
`;

let dialogSeq = 0;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

interface DialogButton { label: string; value: 'ok' | 'cancel'; className?: string }

function openDialog(message: string, buttons: DialogButton[], focus: 'ok' | 'cancel'): Promise<boolean> {
  ensureStyle();
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'xmd-dialog';
    dialog.setAttribute('role', 'alertdialog');
    const text = document.createElement('p');
    text.id = `xmd-dialog-text-${++dialogSeq}`;
    text.textContent = message;
    dialog.setAttribute('aria-describedby', text.id);
    const actions = document.createElement('div');
    actions.className = 'xmd-dialog-actions';
    let focusTarget: HTMLButtonElement | null = null;
    for (const spec of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = spec.label;
      if (spec.className) button.className = spec.className;
      button.addEventListener('click', () => dialog.close(spec.value));
      if (spec.value === focus) focusTarget = button;
      actions.append(button);
    }
    dialog.append(text, actions);
    // Escape kích hoạt 'cancel' rồi 'close' với returnValue rỗng — tính là huỷ.
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'ok');
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    focusTarget?.focus();
  });
}

/**
 * Hỏi xác nhận. Với thao tác phá huỷ (`danger`) nút mặc định có focus là Huỷ,
 * để Enter vô tình không xoá dữ liệu.
 */
export function confirmDialog(message: string, options: { danger?: boolean; confirmLabel?: string } = {}): Promise<boolean> {
  const danger = options.danger !== false;
  return openDialog(message, [
    { label: t('dialog_cancel'), value: 'cancel' },
    { label: options.confirmLabel || t('dialog_ok'), value: 'ok', className: danger ? 'danger' : 'primary' },
  ], danger ? 'cancel' : 'ok');
}

/** Thông báo một nút (thay alert()). */
export async function alertDialog(message: string): Promise<void> {
  await openDialog(message, [{ label: t('dialog_ok'), value: 'ok', className: 'primary' }], 'ok');
}
