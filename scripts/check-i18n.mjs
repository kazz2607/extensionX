// i18n gate: UI text must come from src/lib/i18n/*.ts so the English default
// never shows untranslated Vietnamese (and vice versa).
//  1. No Vietnamese text in src outside the translation tables (comments,
//     console.* lines and a few intentional literals are ignored).
//  2. Every data-i18n* key used in HTML exists in a table.
//  3. Every table defines the same keys for en and vi.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const src = join(root, 'src');
const VIETNAMESE = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹĂÂĐÊÔƠƯ]/;
// Literals that are data, not UI text: X's own parody label, Telegram's own
// download button title (a selector), and the language's own name.
const ALLOWED_LITERALS = ['Tài khoản giễu nhại', 'button[title="Tải xuống"]', 'Tiếng Việt'];

// Git on Windows checks files out with CRLF; normalise so the table parser
// (which matches newline boundaries) behaves the same as on Linux CI.
async function readText(file) {
  return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
}

async function filesUnder(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if (/\.(ts|html)$/.test(entry.name)) result.push(path);
  }
  return result;
}

function isIgnorable(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--') ||
    /\bconsole\.(log|debug|warn|error|info)\(/.test(trimmed);
}

const files = await filesUnder(src);
const tableFiles = files.filter((file) => relative(src, file).startsWith(join('lib', 'i18n') + '\\') || relative(src, file).startsWith('lib/i18n/'));
const problems = [];

// 1. Hard-coded Vietnamese.
for (const file of files) {
  if (tableFiles.includes(file)) continue;
  // Blank out block comments (keeping line numbers) before scanning lines.
  const blankComments = (match) => match.replace(/[^\n]/g, ' ');
  const lines = (await readText(file))
    .replace(/<!--[\s\S]*?-->/g, blankComments)
    .replace(/\/\*[\s\S]*?\*\//g, blankComments)
    .split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isIgnorable(line)) return;
    const code = file.endsWith('.ts') ? line.replace(/\/\/.*$/, '') : line;
    const stripped = ALLOWED_LITERALS.reduce((text, literal) => text.split(literal).join(''), code);
    if (VIETNAMESE.test(stripped)) problems.push(`${relative(root, file)}:${index + 1} hard-coded Vietnamese: ${line.trim().slice(0, 100)}`);
  });
}

// 3. en/vi parity, and collect every key.
const allKeys = new Set();
for (const file of tableFiles) {
  const text = await readText(file);
  const blocks = [...text.matchAll(/\n {2}(en|vi): \{\n([\s\S]*?)\n {2}\},/g)];
  const byTable = [];
  for (const [, lang, body] of blocks) {
    const keys = new Set([...body.matchAll(/^\s+([a-z0-9_]+):/gm)].map((match) => match[1]));
    keys.forEach((key) => allKeys.add(key));
    byTable.push({ lang, keys });
  }
  for (let i = 0; i + 1 < byTable.length; i += 2) {
    const [en, vi] = byTable[i].lang === 'en' ? [byTable[i], byTable[i + 1]] : [byTable[i + 1], byTable[i]];
    for (const key of en.keys) if (!vi.keys.has(key)) problems.push(`${relative(root, file)} key "${key}" has no vi value`);
    for (const key of vi.keys) if (!en.keys.has(key)) problems.push(`${relative(root, file)} key "${key}" has no en value`);
  }
}

// 2. HTML keys exist.
for (const file of files.filter((path) => path.endsWith('.html'))) {
  const text = await readText(file);
  for (const [, key] of text.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"/g)) {
    if (!allKeys.has(key)) problems.push(`${relative(root, file)} uses missing i18n key "${key}"`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`i18n check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`i18n check: ${allKeys.size} keys, ${tableFiles.length} tables, no hard-coded Vietnamese`);
