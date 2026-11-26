/**
 * i18n.ts — Custom Internationalization Module (core only)
 * Quản lý đa ngôn ngữ cho extension (Popup, Options, Download Center, UI trên X).
 *
 * Bảng dịch nằm trong src/lib/i18n/*.ts và mỗi entry chỉ đăng ký bảng nó cần
 * (registerTranslations), để content script trên X không phải mang toàn bộ
 * chuỗi của popup/Options.
 */
import { translate, type TranslationVars } from './i18n-format.ts';

export interface TranslationTable {
  en: Record<string, string>;
  vi: Record<string, string>;
  /**
   * P26a: set only in release builds by scripts/vite-locale-split.mjs, which
   * moves `vi` into the packaged file i18n/vi/<remote>.json.
   */
  remote?: string;
  /**
   * 9.0.1: bảng chỉ service worker dùng — cả phần `en` cũng nằm ở
   * i18n/en/<remote>.json và luôn được tải (là bảng dự phòng của mọi ngôn ngữ).
   */
  remoteEn?: boolean;
}
export type { TranslationVars };

export interface I18nAPI {
  load: () => Promise<void>;
  /** Đổi ngôn ngữ và chờ bảng dịch tải xong (dùng thay cho gán `lang`). */
  setLanguage: (lang: string) => Promise<void>;
  t: (key: string, vars?: TranslationVars) => string;
  applyToDOM: (root?: Document | HTMLElement) => void;
  lang: string;
}

// window.i18n được khai báo trong types.ts (dùng chung I18nAPI này) — không
// khai báo lại ở đây để tránh xung đột "subsequent property declarations".

const TRANSLATIONS: Record<string, Record<string, string>> = { en: {}, vi: {} };
const REMOTE_TABLES = new Set<string>();
const REMOTE_EN_TABLES = new Set<string>();
const remoteLoads = new Map<string, Promise<void>>();

let _currentLang: string = 'en';
let _languageSet = false;

export function registerTranslations(...tables: TranslationTable[]): void {
  for (const table of tables) {
    Object.assign(TRANSLATIONS.en, table.en);
    Object.assign(TRANSLATIONS.vi, table.vi);
    if (table.remote) {
      REMOTE_TABLES.add(table.remote);
      if (table.remoteEn) REMOTE_EN_TABLES.add(table.remote);
      // Bảng đăng ký muộn (sau loadI18n) vẫn được tải nếu đang dùng tiếng Việt.
      if (_currentLang === 'vi') void loadRemoteTable(table.remote, 'vi');
      if (table.remoteEn && _languageSet) void loadRemoteTable(table.remote, 'en');
    }
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((text) => typeof text === 'string');
}

/**
 * Tải bảng đóng gói kèm extension. Lỗi thì bỏ qua: t() rơi về tiếng Anh (hoặc
 * về key nếu chính bảng tiếng Anh lỗi), và lần loadI18n/setLanguage sau thử lại.
 */
function loadRemoteTable(name: string, lang: 'en' | 'vi'): Promise<void> {
  const id = `${lang}/${name}`;
  let pending = remoteLoads.get(id);
  if (!pending) {
    pending = fetch(chrome.runtime.getURL(`i18n/${id}.json`))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!isStringRecord(data)) throw new Error(`invalid locale table ${id}`);
        Object.assign(TRANSLATIONS[lang], data);
      })
      .catch((error: unknown) => {
        remoteLoads.delete(id);
        console.warn('[i18n] could not load', id, error);
      });
    remoteLoads.set(id, pending);
  }
  return pending;
}

/** Đặt ngôn ngữ hiện tại sau khi các bảng cần cho ngôn ngữ đó đã sẵn sàng. */
export async function setLanguage(lang: string): Promise<void> {
  await Promise.all([
    ...[...REMOTE_EN_TABLES].map((name) => loadRemoteTable(name, 'en')),
    ...(lang === 'vi' ? [...REMOTE_TABLES].map((name) => loadRemoteTable(name, 'vi')) : []),
  ]);
  _currentLang = lang;
  _languageSet = true;
}

// Load ngôn ngữ từ chrome.storage.local
export async function loadI18n(): Promise<void> {
  let lang = 'en';
  try {
    const res = await chrome.storage.local.get('lang') as { lang?: string };
    lang = res.lang || 'en';
  } catch {
    lang = 'en';
  }
  await setLanguage(lang);
}

/** Lấy chuỗi theo key; `{name}` được thay bằng vars.name. */
export function t(key: string, vars?: TranslationVars): string {
  return translate(TRANSLATIONS, _currentLang, key, vars);
}

const FILTER_TYPES = new Set(['all', 'images', 'videos', 'gifs']);

/** U22: nhãn bộ lọc media theo ngôn ngữ app (khoá `tab_*` của bảng common); giá trị lạ giữ nguyên. */
export function filterTypeLabel(type: unknown): string {
  const value = String(type || 'all');
  return FILTER_TYPES.has(value) ? t(`tab_${value}`) : value.slice(0, 30);
}

/** U24: định dạng số theo ngôn ngữ của extension, không theo locale của trình duyệt. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(_currentLang === 'vi' ? 'vi-VN' : 'en-US', options).format(value);
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
    setLanguage,
    t: t,
    applyToDOM: applyI18nToDOM,
    get lang() { return _currentLang; },
    set lang(l: string) { _currentLang = l; }
  };
}
