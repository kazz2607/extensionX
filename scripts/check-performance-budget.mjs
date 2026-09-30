import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const budget = JSON.parse(await readFile(join(root, 'performance-budget.json'), 'utf8'));

async function filesUnder(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

const distFiles = await filesUnder(join(root, 'dist'));
const javascript = distFiles.filter((path) => path.endsWith('.js'));
const sizes = await Promise.all(javascript.map(async (path) => ({ path, bytes: (await stat(path)).size })));
const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
const largest = sizes.reduce((max, file) => file.bytes > max.bytes ? file : max, { path: '', bytes: 0 });
const sourceModules = (await filesUnder(join(root, 'src'))).filter((path) => path.endsWith('.ts')).length;

const failures = [];
if (total > budget.maxTotalJavaScriptBytes) failures.push(`total JS ${total} > ${budget.maxTotalJavaScriptBytes}`);
if (largest.bytes > budget.maxSingleJavaScriptBytes) failures.push(`${relative(root, largest.path)} ${largest.bytes} > ${budget.maxSingleJavaScriptBytes}`);
if (sourceModules > budget.maxSourceModules) failures.push(`source modules ${sourceModules} > ${budget.maxSourceModules}`);

console.log(`Performance budget: ${total} JS bytes, largest ${relative(root, largest.path)} ${largest.bytes} bytes, ${sourceModules} TS modules`);
if (failures.length) {
  for (const failure of failures) console.error(`Budget exceeded: ${failure}`);
  process.exitCode = 1;
}
