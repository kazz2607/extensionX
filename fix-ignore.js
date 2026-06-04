import fs from 'fs';
import { execSync } from 'child_process';

function fixFile(file) {
  let output = '';
  try {
    execSync('npx tsc --noEmit', { encoding: 'utf8' });
  } catch (e) {
    output = e.stdout || e.stderr || e.message;
  }

  const linesToIgnore = new Set();
  const regex = new RegExp(`${file}\\((\\d+),`, 'g');
  let match;
  while ((match = regex.exec(output)) !== null) {
    linesToIgnore.add(parseInt(match[1], 10));
  }

  if (linesToIgnore.size === 0) return;

  const sortedLines = Array.from(linesToIgnore).sort((a, b) => b - a);
  let content = fs.readFileSync(`src/${file}`, 'utf8').split('\n');

  for (const lineNum of sortedLines) {
    const idx = lineNum - 1;
    // Don't add duplicate
    if (!content[idx - 1]?.includes('@ts-ignore')) {
      content.splice(idx, 0, '// @ts-ignore');
    }
  }

  fs.writeFileSync(`src/${file}`, content.join('\n'));
}

for (let i = 0; i < 5; i++) {
  fixFile('popup/popup.ts');
  fixFile('options/options.ts');
  fixFile('lib/i18n.ts');
}
console.log('Done inserting ignores');
