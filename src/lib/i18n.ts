/**
 * i18n.ts — Custom Internationalization Module (core only)
 * Quản lý đa ngôn ngữ cho extension (Popup, Options, Download Center, UI trên X).
 *
 * Bảng dịch nằm trong src/lib/i18n/*.ts và mỗi entry chỉ đăng ký bảng nó cần
 * (registerTranslations), để content script trên X không phải mang toàn bộ
 * chuỗi của popup/Options.
 */
import { translate, type TranslationVars } from './i18n-format.ts';

export type TranslationTable = Record<'en' | 'vi', Record<string, string>>;
export type { TranslationVars };

export interface I18nAPI {
  load: () => Promise<void>;
  t: (key: string, vars?: TranslationVars) => string;
  applyToDOM: (root?: Document | HTMLElement) => void;
  lang: string;
}

// window.i18n được khai báo trong types.ts (dùng chung I18nAPI này) — không
// khai báo lại ở đây để tránh xung đột "subsequent property declarations".

const TRANSLATIONS: Record<string, Record<string, string>> = { en: {}, vi: {} };

export function registerTranslations(...tables: TranslationTable[]): void {
  for (const table of tables) {
    Object.assign(TRANSLATIONS.en, table.en);
    Object.assign(TRANSLATIONS.vi, table.vi);
  }
}

let _currentLang: string = 'en';

// Load ngôn ngữ từ chrome.storage.local
export async function loadI18n(): Promise<void> {
  try {
    const res = await chrome.storage.local.get('lang') as { lang?: string };
    _currentLang = res.lang || 'en';
  } catch (e) {
    _currentLang = 'en';
  }
}

/** Lấy chuỗi theo key; `{name}` được thay bằng vars.name. */
export function t(key: string, vars?: TranslationVars): string {
  return translate(TRANSLATIONS, _currentLang, key, vars);
}

// Cập nhật DOM tự động dựa trên attribute data-i18n

export function applyI18nToDOM(root: Document | HTMLElement = document): void {
  if (root === document) document.documentElement.lang = _currentLang;

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) el.setAttribute('aria-label', t(key));
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });

  root.querySelectorAll('[data-i18n]').forEach((el) => {

    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);

    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'button') {
      (el as HTMLInputElement).value = text;
    } else {
      let hasElementChildren = Array.from(el.childNodes).some(n => n.nodeType === 1);
      if (hasElementChildren) {
        let maxLen = -1;
        let bestNode: ChildNode | null = null;
        el.childNodes.forEach(n => {
          if (n.nodeType === 3 && n.textContent && n.textContent.trim().length > maxLen) {
            maxLen = n.textContent.trim().length;
            bestNode = n;
          }
        });
        if (bestNode) {
          (bestNode as ChildNode).textContent = text;
        } else {
          el.appendChild(document.createTextNode(text));
        }
      } else {
        // Locale strings are rendered as text. This preserves the translation
        // behavior while preventing a compromised/custom locale from becoming
        // an HTML injection sink.
        el.textContent = text;
      }
    }
  });
}

// Cung cấp export nếu dùng module, hoặc gán vào window
if (typeof window !== 'undefined') {
  window.i18n = {
    load: loadI18n,
    t: t,
    applyToDOM: applyI18nToDOM,
    get lang() { return _currentLang; },
    set lang(l: string) { _currentLang = l; }
  };
}
