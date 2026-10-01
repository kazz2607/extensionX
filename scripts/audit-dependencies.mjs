import { readFile } from 'node:fs/promises';

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Unsupported or incomplete package-lock.json');

const violations = [];
const reviewedInstallScripts = new Map([
  ['node_modules/fsevents', '2.3.3'], // Optional macOS file watcher pulled by Vite; not installed on Windows/runtime artifact.
  ['node_modules/spawn-sync', '1.0.15'], // Legacy Firefox dev runner dependency; development-only and lockfile-pinned.
]);
let checked = 0;
for (const [name, pkg] of Object.entries(lock.packages)) {
  if (!name || !pkg || typeof pkg !== 'object') continue;
  checked++;
  const resolved = typeof pkg.resolved === 'string' ? pkg.resolved : '';
  if (resolved && !resolved.startsWith('https://registry.npmjs.org/')) violations.push(`${name}: non-registry source ${resolved}`);
  if (pkg.hasInstallScript === true && reviewedInstallScripts.get(name) !== pkg.version) violations.push(`${name}: install script requires review`);
  if (resolved && !pkg.integrity) violations.push(`${name}: missing integrity hash`);
}
if (violations.length) throw new Error(`Dependency review failed:\n${violations.join('\n')}`);
console.log(`Dependency review: ${checked} locked packages verified; ${reviewedInstallScripts.size} pinned install scripts reviewed`);
