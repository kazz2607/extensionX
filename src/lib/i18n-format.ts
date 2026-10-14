/**
 * i18n-format.ts — pure translation lookup shared by the i18n core (t()) and
 * the scripts that cannot use it (MAIN-world tweet button, shortcuts.ts).
 * No side effects and no chrome.* / window.i18n access.
 */
export type TranslationVars = Record<string, string | number>;
export type TranslationTables = Record<string, Record<string, string>>;

/** Lookup in `lang`, then English, then the key itself; `{name}` → vars.name. */
export function translate(tables: TranslationTables, lang: string, key: string, vars?: TranslationVars): string {
  const text = tables[lang]?.[key] ?? tables.en?.[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
