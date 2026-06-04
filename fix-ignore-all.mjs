import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const filesToProcess = [
  'background/downloader.ts',
  'background/indexeddb.ts',
  'background/messages.ts',
  'background/scraper.ts',
  'background/service-worker.ts',
  'background/tweet-api.ts',
  'content/content.ts',
  'content/dom-scanner.ts',
  'content/fab.ts',
  'content/page-interceptor.ts',
  'content/snackbar.ts',
  'content/tweet-btn.ts',
  'lib/hls-fetcher.ts',
  'lib/jszip.min.ts'
];

for (const file of filesToProcess) {
  const fullPath = `src/${file}`;
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (content.startsWith('// @ts-nocheck')) {
      content = content.replace('// @ts-nocheck\n', '').replace('// @ts-nocheck\r\n', '').replace('// @ts-nocheck', '');
      fs.writeFileSync(fullPath, content);
      console.log(`Removed @ts-nocheck from ${file}`);
    }
  }
}

function fixFile(file) {
  const fullPath = `src/${file}`;
  if (!fs.existsSync(fullPath)) return;

  let output = '';
  try {
    execSync('npx tsc --noEmit', { encoding: 'utf8' });
  } catch (e) {
    output = e.stdout || e.stderr || e.message;
  }

  const linesToIgnore = new Set();
  const escapedFile = file.replace(/\//g, '[\\\\/]'); // Support Windows paths
  // Regex to match src/file(line,col) or src\file(line,col)
  const regex = new RegExp(`src[\\\\/]${escapedFile}\\((\\d+),`, 'g');
  let match;
  while ((match = regex.exec(output)) !== null) {
    linesToIgnore.add(parseInt(match[1], 10));
  }

  if (linesToIgnore.size === 0) return;

  const sortedLines = Array.from(linesToIgnore).sort((a, b) => b - a);
  let content = fs.readFileSync(fullPath, 'utf8').split('\n');

  for (const lineNum of sortedLines) {
    const idx = lineNum - 1;
    if (idx >= 0 && !content[idx - 1]?.includes('@ts-ignore')) {
      content.splice(idx, 0, '// @ts-ignore');
    }
  }

  fs.writeFileSync(fullPath, content.join('\n'));
}

// Run 5 passes to cover cascading errors
for (let i = 0; i < 5; i++) {
  console.log(`Pass ${i + 1}`);
  for (const file of filesToProcess) {
    fixFile(file);
  }
}
console.log('Done inserting ignores for remaining files');
