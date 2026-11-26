// P26a: move the Vietnamese half of the extension-page/service-worker
// translation tables out of the JavaScript bundles.
//
// Source tables stay as they are (en + vi side by side), so unit tests and
// scripts/check-i18n.mjs keep reading one file per surface. At build time this
// plugin rewrites `vi: { ... }` of each listed table to `vi: {}, remote: '<NAME>'`
// and emits the dictionary as `i18n/vi/<NAME>.json`; src/lib/i18n.ts fetches it
// only when the user's language is Vietnamese. An MV3 service worker cannot use
// dynamic import(), but it can fetch its own packaged files.
//
// 9.0.1: tables used only by the service worker (EN_SPLIT_TABLES) also move
// their English half to `i18n/en/<NAME>.json` (`en: {}, remoteEn: true`). The
// worker waits for i18nReady before producing any user-visible text, and
// loadI18n always fetches these English tables (they are the fallback).
//
// Content-script tables (src/lib/i18n/content.ts) are deliberately NOT split:
// a content script may only fetch extension files listed in
// web_accessible_resources, which the manifest no longer declares (v7.3.0).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SPLIT_TABLES = {
  'background.ts': ['SHARED_UI_STRINGS', 'BACKGROUND_STRINGS'],
  'common.ts': ['COMMON_STRINGS'],
  'download-center.ts': ['DOWNLOAD_CENTER_STRINGS'],
  'options.ts': ['OPTIONS_STRINGS'],
  'popup.ts': ['POPUP_STRINGS'],
};

/** Service-worker-only tables: English is loaded at runtime too. */
export const EN_SPLIT_TABLES = new Set(['BACKGROUND_STRINGS']);

export const LOCALE_ASSET_DIR = 'i18n/vi';

function splitTarget(id) {
  const path = id.split('?')[0].replaceAll('\\', '/');
  const match = /\/src\/lib\/i18n\/([a-z-]+\.ts)$/.exec(path);
  return match && SPLIT_TABLES[match[1]] ? { path, file: match[1], names: SPLIT_TABLES[match[1]] } : null;
}

/** Replace one language block of a table with `replacement`; throws on an unexpected layout. */
function replaceBlock(code, name, lang, replacement, file) {
  const head = `export const ${name}: TranslationTable = {`;
  const start = code.indexOf(head);
  if (start < 0) throw new Error(`[locale-split] ${file}: ${name} not found`);
  const blockStart = code.indexOf(`\n  ${lang}: {\n`, start);
  const blockEnd = blockStart < 0 ? -1 : code.indexOf('\n  },', blockStart);
  const nextTable = code.indexOf('\nexport ', start + head.length);
  if (blockStart < 0 || blockEnd < 0 || (nextTable >= 0 && blockEnd > nextTable)) {
    throw new Error(`[locale-split] ${file}: cannot find the ${lang} block of ${name}`);
  }
  return `${code.slice(0, blockStart)}\n  ${replacement}${code.slice(blockEnd + '\n  },'.length)}`;
}

/**
 * Replace the `vi` block of every listed table (and the `en` block of the
 * tables in `enNames`); throws if the layout is not the expected one.
 */
export function stripLocales(source, names, file = 'table', enNames = EN_SPLIT_TABLES) {
  let code = source.replace(/\r\n/g, '\n');
  for (const name of names) {
    code = replaceBlock(code, name, 'vi', `vi: {},\n  remote: '${name}',`, file);
    if (enNames.has(name)) code = replaceBlock(code, name, 'en', 'en: {},\n  remoteEn: true,', file);
  }
  return code;
}

/** Vietnamese only (kept for tests and callers that do not split English). */
export function stripVietnamese(source, names, file = 'table') {
  return stripLocales(source, names, file, new Set());
}

export default function localeSplit() {
  const srcDir = join(process.cwd(), 'src', 'lib', 'i18n');
  const stripped = new Set();
  return {
    name: 'extensionx-locale-split',
    enforce: 'pre',
    async load(id) {
      const target = splitTarget(id);
      if (!target) return null;
      const code = stripLocales(await readFile(target.path, 'utf8'), target.names, target.file);
      target.names.forEach((name) => stripped.add(name));
      return code;
    },
    async generateBundle() {
      // Emit only what this build actually stripped, so every bundle that
      // references a remote table ships its dictionary next to it.
      for (const [file, names] of Object.entries(SPLIT_TABLES)) {
        if (!names.some((name) => stripped.has(name))) continue;
        // Node strips the types; the table modules only import types.
        const module = await import(`${pathToFileURL(join(srcDir, file)).href}?locale=${Date.now()}`);
        for (const name of names) {
          const table = module[name];
          for (const lang of EN_SPLIT_TABLES.has(name) ? ['vi', 'en'] : ['vi']) {
            if (!table?.[lang] || Object.keys(table[lang]).length === 0) throw new Error(`[locale-split] ${file}: ${name}.${lang} is empty`);
            this.emitFile({ type: 'asset', fileName: `i18n/${lang}/${name}.json`, source: JSON.stringify(table[lang]) });
          }
        }
      }
    },
  };
}
