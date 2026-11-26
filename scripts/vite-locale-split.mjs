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

export const LOCALE_ASSET_DIR = 'i18n/vi';

function splitTarget(id) {
  const path = id.split('?')[0].replaceAll('\\', '/');
  const match = /\/src\/lib\/i18n\/([a-z-]+\.ts)$/.exec(path);
  return match && SPLIT_TABLES[match[1]] ? { path, file: match[1], names: SPLIT_TABLES[match[1]] } : null;
}

/** Replace the `vi` block of every listed table; throws if the layout is not the expected one. */
export function stripVietnamese(source, names, file = 'table') {
  let code = source.replace(/\r\n/g, '\n');
  for (const name of names) {
    const head = `export const ${name}: TranslationTable = {`;
    const start = code.indexOf(head);
    if (start < 0) throw new Error(`[locale-split] ${file}: ${name} not found`);
    const viStart = code.indexOf('\n  vi: {\n', start);
    const viEnd = viStart < 0 ? -1 : code.indexOf('\n  },', viStart);
    const nextTable = code.indexOf('\nexport ', start + head.length);
    if (viStart < 0 || viEnd < 0 || (nextTable >= 0 && viEnd > nextTable)) {
      throw new Error(`[locale-split] ${file}: cannot find the vi block of ${name}`);
    }
    code = `${code.slice(0, viStart)}\n  vi: {},\n  remote: '${name}',${code.slice(viEnd + '\n  },'.length)}`;
  }
  return code;
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
      const code = stripVietnamese(await readFile(target.path, 'utf8'), target.names, target.file);
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
          if (!table?.vi || Object.keys(table.vi).length === 0) throw new Error(`[locale-split] ${file}: ${name}.vi is empty`);
          this.emitFile({ type: 'asset', fileName: `${LOCALE_ASSET_DIR}/${name}.json`, source: JSON.stringify(table.vi) });
        }
      }
    },
  };
}
