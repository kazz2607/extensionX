import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

async function filesUnder(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if (entry.name !== 'release-manifest.json' && !entry.name.endsWith('.map')) result.push(path);
  }
  return result;
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const entries = [];
for (const path of (await filesUnder(dist)).sort()) {
  const data = await readFile(path);
  entries.push({
    path: relative(dist, path).replaceAll('\\', '/'),
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}
const manifest = { formatVersion: 1, extensionVersion: packageJson.version, files: entries };
await writeFile(join(dist, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release manifest: ${entries.length} files checksummed for v${packageJson.version}`);
